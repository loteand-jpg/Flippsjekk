import { PRIMARY_PLAN } from '../../config/plans';
import { ScenarioValuesSchema, type Scenario, type ScenarioValues } from '../../domain/schemas';
import { ServiceError, type ScenarioRepository } from '../types';
import { dataContext, isUuid, rowsOf, unwrap, type DataContext, type DataDeps } from './dataAccess';
import { analysisMetaFromRow, scenarioFromRow, SELECT } from './rows';

/**
 * `ScenarioRepository` mot `public.scenarios`. Eierskap og referanseintegritet håndheves av DATABASEN, ikke av denne klassen:
 *  - RLS: bare egne rader (`owner_id = auth.uid()`); `owner_id` sendes aldri (default auth.uid()).
 *  - sammensatt fremmednøkkel (eier, bolig) → user_properties: scenarioet må tilhøre en bolig i egen liste.
 *  - sammensatt fremmednøkkel (analyse, bolig) + triggeren `scenarios_check_refs`: analysen må gjelde samme bolig og være lesbar for brukeren,
 *    og `analysis_version` må stemme.
 *  - `user_properties.primary_scenario_id` har sammensatt fremmednøkkel (eier, bolig, scenario): primærscenarioet er alltid eget og for samme bolig.
 *  - triggeren `scenarios_guard_locked`: et låst scenario («Nettsidens vurdering») kan bare flyttes til ny analyseversjon, aldri endres, låses opp eller slettes.
 * Kontrollene i denne klassen (låst, navn, grense, minst ett scenario) gir bare de samme forståelige meldingene som mocken før databasen avviser.
 *
 * Det låste grunnlagsscenarioet opprettes av backend når en bolig kobles til brukeren (klienten kan ikke opprette låste rader – RLS). Ingen
 * abonnementssjekk gjøres her (fase 2B håndhever ikke abonnement); antall scenarioer per objekt begrenses bare i klienten (planens grense) inntil
 * databasen får en sperre sammen med abonnementet.
 */
const LIMIT = PRIMARY_PLAN.limits.scenariosPerProperty;

function validateValues(values: ScenarioValues): ScenarioValues {
  const r = ScenarioValuesSchema.safeParse(values);
  if (!r.success) throw new ServiceError('validation', `Ugyldige scenarioverdier: ${r.error.issues[0].path.join('.')} – ${r.error.issues[0].message}`);
  return structuredClone(r.data);
}

export class SupabaseScenarioRepository implements ScenarioRepository {
  constructor(private readonly deps: DataDeps) {}

  /** Låst scenario først, deretter eldste først. */
  async list(propertyId: string): Promise<Scenario[]> {
    if (!isUuid(propertyId)) return [];
    const { client, uid } = await dataContext(this.deps);
    const res = await client.from('scenarios').select(SELECT.scenarios).eq('owner_id', uid).eq('property_id', propertyId).order('locked', { ascending: false }).order('created_at', { ascending: true }).order('id', { ascending: true });
    return rowsOf(res).map(scenarioFromRow);
  }

  async create(propertyId: string, input: { name: string; analysisId: string; values: ScenarioValues }): Promise<Scenario> {
    if (!isUuid(propertyId)) throw new ServiceError('forbidden', 'Objektet må være i din liste før du kan lagre scenarioer.');
    const ctx = await dataContext(this.deps);
    const values = validateValues(input.values);
    const existing = rowsOf(await ctx.client.from('scenarios').select('id').eq('owner_id', ctx.uid).eq('property_id', propertyId));
    if (existing.length >= LIMIT) throw new ServiceError('limit_reached', `Du kan ha inntil ${LIMIT} scenarioer per objekt.`);
    const analysis = await this.analysisFor(ctx, propertyId, input.analysisId);
    const row = unwrap(
      await ctx.client
        .from('scenarios')
        .insert({ property_id: propertyId, analysis_id: analysis.id, analysis_version: analysis.version, name: input.name.trim().slice(0, 80) || 'Nytt scenario', values })
        .select(SELECT.scenarios)
        .maybeSingle(),
    );
    if (!row) throw new ServiceError('unavailable', 'Scenarioet ble ikke lagret. Prøv igjen.');
    const scenario = scenarioFromRow(row);
    // Første scenario blir primært (som i mocken). Betinget oppdatering, så et allerede satt primærscenario aldri overskrives.
    unwrap(await ctx.client.from('user_properties').update({ primary_scenario_id: scenario.id }).eq('user_id', ctx.uid).eq('property_id', propertyId).is('primary_scenario_id', null).select('id'));
    this.deps.notifyChanged?.();
    return scenario;
  }

  async update(scenarioId: string, patch: { name?: string; values?: ScenarioValues; analysisId?: string }): Promise<Scenario> {
    const ctx = await dataContext(this.deps);
    const sc = await this.own(ctx, scenarioId);
    // Låst scenario kan bare flyttes til ny analyseversjon (oppdatering av grunnlaget), ikke redigeres.
    const isRebase = Boolean(patch.analysisId && patch.values && patch.name === undefined);
    if (sc.locked && !isRebase) throw new ServiceError('forbidden', `«${sc.name}» er låst. Lagre den som nytt scenario for å lage din egen redigerbare versjon.`);
    const payload: Record<string, unknown> = {};
    if (patch.analysisId) {
      const a = await this.analysisFor(ctx, sc.propertyId, patch.analysisId);
      payload.analysis_id = a.id;
      payload.analysis_version = a.version;
    }
    if (patch.name !== undefined) {
      const n = patch.name.trim();
      if (!n) throw new ServiceError('validation', 'Scenarioet må ha et navn.');
      payload.name = n.slice(0, 80);
    }
    if (patch.values) payload.values = validateValues(patch.values);
    if (Object.keys(payload).length === 0) return sc;
    const row = unwrap(await ctx.client.from('scenarios').update(payload).eq('id', scenarioId).eq('owner_id', ctx.uid).select(SELECT.scenarios).maybeSingle());
    if (!row) throw new ServiceError('not_found', 'Fant ikke scenarioet.');
    this.deps.notifyChanged?.();
    return scenarioFromRow(row);
  }

  async duplicate(scenarioId: string, name?: string): Promise<Scenario> {
    const ctx = await dataContext(this.deps);
    const src = await this.own(ctx, scenarioId);
    return this.create(src.propertyId, { name: name ?? `${src.name} (kopi)`, analysisId: src.analysisId, values: src.values });
  }

  async remove(scenarioId: string): Promise<void> {
    const ctx = await dataContext(this.deps);
    const sc = await this.own(ctx, scenarioId);
    if (sc.locked) throw new ServiceError('forbidden', `«${sc.name}» er låst og kan ikke slettes.`);
    const siblings = rowsOf(await ctx.client.from('scenarios').select(SELECT.scenarios).eq('owner_id', ctx.uid).eq('property_id', sc.propertyId).neq('id', sc.id).order('created_at', { ascending: true }).order('id', { ascending: true })).map(scenarioFromRow);
    if (siblings.length === 0) throw new ServiceError('conflict', 'Et objekt må ha minst ett scenario. Lag et nytt før du sletter dette.');
    // Er dette primærscenarioet, flyttes det til et annet FØR sletting (databasen ville ellers bare satt det til null).
    unwrap(await ctx.client.from('user_properties').update({ primary_scenario_id: siblings[0].id }).eq('user_id', ctx.uid).eq('property_id', sc.propertyId).eq('primary_scenario_id', sc.id).select('id'));
    const deleted = rowsOf(await ctx.client.from('scenarios').delete().eq('id', sc.id).eq('owner_id', ctx.uid).select('id'));
    if (deleted.length === 0) throw new ServiceError('not_found', 'Fant ikke scenarioet.');
    this.deps.notifyChanged?.();
  }

  async setPrimary(propertyId: string, scenarioId: string): Promise<void> {
    const ctx = await dataContext(this.deps);
    const sc = await this.own(ctx, scenarioId);
    if (sc.propertyId !== propertyId) throw new ServiceError('forbidden', 'Scenarioet tilhører et annet objekt.');
    const rows = rowsOf(await ctx.client.from('user_properties').update({ primary_scenario_id: sc.id }).eq('user_id', ctx.uid).eq('property_id', propertyId).select('id'));
    if (rows.length === 0) throw new ServiceError('not_found', 'Objektet finnes ikke i din liste.');
    this.deps.notifyChanged?.();
  }

  // --- internt ---------------------------------------------------------------------------------------------------------------

  /** Eget scenario. Andres scenarioer finnes ikke for deg (RLS), akkurat som i mocken. */
  private async own(ctx: DataContext, scenarioId: string): Promise<Scenario> {
    if (!isUuid(scenarioId)) throw new ServiceError('not_found', 'Fant ikke scenarioet.');
    const row = unwrap(await ctx.client.from('scenarios').select(SELECT.scenarios).eq('id', scenarioId).eq('owner_id', ctx.uid).maybeSingle());
    if (!row) throw new ServiceError('not_found', 'Fant ikke scenarioet.');
    return scenarioFromRow(row);
  }

  /** Analysen må være lesbar for brukeren (RLS) og gjelde samme bolig. Versjonen leses her; databasen kontrollerer at den stemmer. */
  private async analysisFor(ctx: DataContext, propertyId: string, analysisId: string) {
    const bad = new ServiceError('forbidden', 'Scenarioet må bygge på en grunnanalyse du har tilgang til for samme objekt.');
    if (!isUuid(analysisId)) throw bad;
    const row = unwrap(await ctx.client.from('analyses').select(SELECT.analysis_meta).eq('id', analysisId).maybeSingle());
    if (!row) throw bad;
    const a = analysisMetaFromRow(row);
    if (a.propertyId !== propertyId) throw bad;
    return a;
  }
}
