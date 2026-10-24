import type { ChecklistKey } from '../../domain/enums';
import type { AnalysisJob, CalendarOverride, PrivateEvent, Property, PropertySnapshot, Scenario, SharedAnalysis, UserProperty, UserRisk, Viewing } from '../../domain/schemas';
import { buildBundle, buildMyItem, type AnalysisHead, type ReadModel } from '../shared/readModel';
import { ServiceError, type MyPropertyItem, type PersonalStatusPatch, type PropertyBundle, type PropertyRepository } from '../types';
import { dataContext, isUuid, rowsOf, unwrap, type DataContext, type DataDeps } from './dataAccess';
import {
  analysisFromRow,
  analysisMetaFromRow,
  calendarOverrideFromRow,
  privateEventFromRow,
  propertyFromRow,
  scenarioFromRow,
  SELECT,
  snapshotFromRow,
  userPropertyFromRow,
  userRiskFromRow,
  viewingFromRow,
} from './rows';

/**
 * `PropertyRepository` mot Supabase. Leser brukerens egen liste (`user_properties`) og felles eiendomsdata som RLS gir tilgang til (kun boliger i
 * egen liste), validerer alle rader (rows.ts) og bygger `PropertyBundle`/`MyPropertyItem` med de DELTE rene funksjonene (services/shared/readModel.ts)
 * – de samme som mocken bruker. Ingen økonomiske nøkkeltall regnes her; beregningsmotoren brukes av UI som før.
 *
 * Hva som ikke leses ennå: analysejobber (`analysis_jobs`; skrives bare av backend, og analysetjenesten er ikke koblet til) og kildesignaler om
 * endrede visninger/teknisk grunnlag (kommer med kildehentingen). Brukerens egne risikoendringer, private hendelser og buddag-overstyring leses
 * fordi klienten kan skrive dem – å ignorere dem ville vist feil data.
 *
 * Liste-oppføringer kan IKKE opprettes herfra (`addToMine`): medlemskap opprettes bare av backend (migrasjon 9).
 */
export class SupabasePropertyRepository implements PropertyRepository {
  constructor(private readonly deps: DataDeps) {}

  async getByFinnId(finnId: string): Promise<PropertyBundle | null> {
    const ctx = await dataContext(this.deps);
    const row = unwrap(await ctx.client.from('properties').select(SELECT.properties).eq('finn_id', finnId).maybeSingle());
    if (!row) return null; // RLS: bare eiendommer i egen liste er synlige
    return this.bundle(ctx, propertyFromRow(row));
  }

  async getById(propertyId: string): Promise<PropertyBundle | null> {
    if (!isUuid(propertyId)) return null;
    const ctx = await dataContext(this.deps);
    const row = unwrap(await ctx.client.from('properties').select(SELECT.properties).eq('id', propertyId).maybeSingle());
    if (!row) return null;
    return this.bundle(ctx, propertyFromRow(row));
  }

  async listMine(opts: { includeArchived?: boolean } = {}): Promise<MyPropertyItem[]> {
    const ctx = await dataContext(this.deps);
    return this.loadMine(ctx, { includeArchived: opts.includeArchived });
  }

  async getMine(propertyId: string): Promise<MyPropertyItem | null> {
    if (!isUuid(propertyId)) return null;
    const ctx = await dataContext(this.deps);
    return (await this.loadMine(ctx, { includeArchived: true, propertyId }))[0] ?? null;
  }

  async addToMine(): Promise<UserProperty> {
    throw new ServiceError(
      'not_configured',
      'Objekter legges i listen din av analysetjenesten, som ikke er koblet til produksjonsbackend ennå. Du kan ikke legge til objekter selv.',
      { area: 'properties', reason: 'backend_only_insert' },
    );
  }

  /** «Fjern fra min liste» arkiverer. Private scenarioer bevares; felles data berøres ikke. */
  async archiveMine(propertyId: string, archived = true): Promise<UserProperty> {
    return this.updateLink(propertyId, { archived_at: archived ? this.deps.clock.now().toISOString() : null });
  }

  /** Sletter bare brukerens egne rader for objektet (databasen fjerner scenarioer, referanser, risikoer, private hendelser og private utkast via cascade). */
  async removeMine(propertyId: string): Promise<void> {
    if (!isUuid(propertyId)) throw new ServiceError('not_found', 'Objektet finnes ikke i din liste.');
    const ctx = await dataContext(this.deps);
    const rows = rowsOf(await ctx.client.from('user_properties').delete().eq('user_id', ctx.uid).eq('property_id', propertyId).select('id'));
    if (rows.length === 0) throw new ServiceError('not_found', 'Objektet finnes ikke i din liste.');
    this.deps.notifyChanged?.();
  }

  async updatePersonalStatus(propertyId: string, patch: PersonalStatusPatch): Promise<UserProperty> {
    const payload: Record<string, unknown> = {};
    if (patch.workStatus !== undefined) payload.work_status = patch.workStatus;
    if (patch.favorite !== undefined) payload.favorite = patch.favorite;
    if (patch.notes !== undefined) payload.notes = patch.notes.slice(0, 5000);
    if (patch.lastSeenAnalysisVersion !== undefined) payload.last_seen_analysis_version = patch.lastSeenAnalysisVersion;
    if (patch.check) {
      // Privat bekreftelse – endrer aldri kildestatus i den felles analysen. `checks` er ett jsonb-felt, så gjeldende verdi leses og skrives samlet.
      const ctx = await dataContext(this.deps);
      if (!isUuid(propertyId)) throw new ServiceError('not_found', 'Objektet finnes ikke i din liste.');
      const row = unwrap(await ctx.client.from('user_properties').select(SELECT.user_properties).eq('user_id', ctx.uid).eq('property_id', propertyId).maybeSingle());
      if (!row) throw new ServiceError('not_found', 'Objektet finnes ikke i din liste.');
      const checks = { ...userPropertyFromRow(row).checks } as Record<string, { confirmedAt: string; note: string }>;
      const key: ChecklistKey = patch.check.key;
      if (patch.check.confirmed) checks[key] = { confirmedAt: this.deps.clock.now().toISOString(), note: patch.check.note ?? '' };
      else delete checks[key];
      payload.checks = checks;
    }
    return this.updateLink(propertyId, payload);
  }

  // --- internt ---------------------------------------------------------------------------------------------------------------

  private async updateLink(propertyId: string, payload: Record<string, unknown>): Promise<UserProperty> {
    if (!isUuid(propertyId)) throw new ServiceError('not_found', 'Objektet finnes ikke i din liste.');
    const ctx = await dataContext(this.deps);
    if (Object.keys(payload).length === 0) {
      const row = unwrap(await ctx.client.from('user_properties').select(SELECT.user_properties).eq('user_id', ctx.uid).eq('property_id', propertyId).maybeSingle());
      if (!row) throw new ServiceError('not_found', 'Objektet finnes ikke i din liste.');
      return userPropertyFromRow(row);
    }
    const row = unwrap(await ctx.client.from('user_properties').update(payload).eq('user_id', ctx.uid).eq('property_id', propertyId).select(SELECT.user_properties).maybeSingle());
    if (!row) throw new ServiceError('not_found', 'Objektet finnes ikke i din liste.');
    const link = userPropertyFromRow(row);
    this.deps.notifyChanged?.();
    return link;
  }

  private async bundle(ctx: DataContext, property: Property): Promise<PropertyBundle | null> {
    const model = await this.readModel(ctx, [property.id], [property], []);
    return buildBundle(model, property.id);
  }

  /** Henter alt som trengs for de oppgitte boligene og bygger lesemodellen (se ReadModel). */
  private async readModel(ctx: DataContext, propertyIds: string[], properties: Property[], links: UserProperty[]): Promise<ReadModel> {
    const { client, uid } = ctx;
    const [snapRows, viewingRows, headRows, scenarioRows, overrideRows, eventRows, riskRows] = await Promise.all([
      client.from('property_snapshots').select(SELECT.property_snapshots).in('property_id', propertyIds).order('version', { ascending: true }),
      client.from('viewings').select(SELECT.viewings).in('property_id', propertyIds).order('start_at', { ascending: true }),
      // Alle analyseversjoner brukeren kan lese (felles publiserte/erstattede og egne private), bare metadata.
      client.from('analyses').select(SELECT.analysis_meta).in('property_id', propertyIds),
      client.from('scenarios').select(SELECT.scenarios).eq('owner_id', uid).in('property_id', propertyIds).order('created_at', { ascending: true }).order('id', { ascending: true }),
      client.from('calendar_overrides').select(SELECT.calendar_overrides).eq('user_id', uid).in('property_id', propertyIds),
      client.from('private_events').select(SELECT.private_events).eq('user_id', uid).in('property_id', propertyIds),
      client.from('user_risks').select(SELECT.user_risks).eq('user_id', uid).in('property_id', propertyIds),
    ]);
    const snapshots: PropertySnapshot[] = rowsOf(snapRows).map(snapshotFromRow);
    const viewings: Viewing[] = rowsOf(viewingRows).map(viewingFromRow);
    const heads: AnalysisHead[] = rowsOf(headRows).map(analysisMetaFromRow);
    const scenarios: Scenario[] = rowsOf(scenarioRows).map(scenarioFromRow);
    const calendarOverrides: CalendarOverride[] = rowsOf(overrideRows).map(calendarOverrideFromRow);
    const privateEvents: PrivateEvent[] = rowsOf(eventRows).map(privateEventFromRow);
    const userRisks: UserRisk[] = rowsOf(riskRows).map(userRiskFromRow);

    // Full analyse trengs bare for siste publiserte per bolig og for grunnlaget til primærscenarioet (eller første scenario).
    const wanted = new Set<string>();
    for (const pid of propertyIds) {
      let latest: AnalysisHead | null = null;
      for (const h of heads) if (h.propertyId === pid && h.visibility === 'shared' && h.status === 'published' && (!latest || h.version > latest.version)) latest = h;
      if (latest) wanted.add(latest.id);
      const link = links.find((l) => l.propertyId === pid);
      const mine = scenarios.filter((s) => s.propertyId === pid);
      const primary = mine.find((s) => s.id === link?.primaryScenarioId) ?? mine[0];
      if (primary) wanted.add(primary.analysisId);
    }
    const analyses: SharedAnalysis[] = wanted.size
      ? rowsOf(await client.from('analyses').select(SELECT.analyses).in('id', [...wanted])).map(analysisFromRow)
      : [];

    return {
      properties,
      snapshots,
      analyses,
      analysisHeads: heads,
      viewings,
      jobs: [] as AnalysisJob[],
      scenarios,
      calendarOverrides,
      privateEvents,
      userRisks,
      demo: {},
    };
  }

  private async loadMine(ctx: DataContext, opts: { includeArchived?: boolean; propertyId?: string }): Promise<MyPropertyItem[]> {
    const { client, uid } = ctx;
    let q = client.from('user_properties').select(SELECT.user_properties).eq('user_id', uid);
    if (opts.propertyId) q = q.eq('property_id', opts.propertyId);
    if (!opts.includeArchived) q = q.is('archived_at', null);
    const links = rowsOf(await q.order('added_at', { ascending: true })).map(userPropertyFromRow);
    if (links.length === 0) return [];
    const pids = [...new Set(links.map((l) => l.propertyId))];
    const properties = rowsOf(await client.from('properties').select(SELECT.properties).in('id', pids)).map(propertyFromRow);
    const model = await this.readModel(ctx, pids, properties, links);
    const now = this.deps.clock.now();
    return links.map((l) => buildMyItem(model, uid, l, now)).filter((x): x is MyPropertyItem => x !== null);
  }
}
