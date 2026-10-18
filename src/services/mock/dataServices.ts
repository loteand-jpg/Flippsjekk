import { buildBaseValues } from '../../calc/scenario';
import { NEW_ACCOUNT_DEFAULTS } from '../../config/defaults';
import { COMPARABLE_EXTRA_KEYS, validateComparable, type ComparableFields } from '../../domain/comparables';
import { validateRisk, type RiskFields } from '../../domain/risks';
import { ScenarioValuesSchema, type Scenario, type ScenarioValues, type UserComparable, type UserProperty, type UserRisk } from '../../domain/schemas';
import type { DbState } from '../../data/db';
import { uuid } from '../../lib/ids';
import {
  ServiceError,
  type ComparableRepository,
  type MyPropertyItem,
  type PersonalStatusPatch,
  type PropertyBundle,
  type PropertyRepository,
  type RiskRepository,
  type ScenarioRepository,
} from '../types';
import { buildBundle, buildMyItem, canReadAnalysis, computeEntitlements, requireFullAccess, type MockContext } from './context';

export class MockPropertyRepository implements PropertyRepository {
  constructor(private readonly ctx: MockContext) {}

  async getByFinnId(finnId: string): Promise<PropertyBundle | null> {
    this.ctx.uid();
    return this.ctx.db.read((s) => {
      const p = s.properties.find((x) => x.finnId === finnId);
      return p ? buildBundle(s, p.id) : null;
    });
  }

  async getById(propertyId: string): Promise<PropertyBundle | null> {
    this.ctx.uid();
    return this.ctx.db.read((s) => buildBundle(s, propertyId));
  }

  async listMine(opts: { includeArchived?: boolean } = {}): Promise<MyPropertyItem[]> {
    await this.ctx.delay();
    const uid = this.ctx.uid();
    return this.ctx.db.read((s) =>
      s.userProperties
        .filter((l) => l.userId === uid && (opts.includeArchived || !l.archivedAt))
        .map((l) => buildMyItem(s, uid, l))
        .filter((x): x is MyPropertyItem => x !== null),
    );
  }

  async getMine(propertyId: string): Promise<MyPropertyItem | null> {
    const uid = this.ctx.uid();
    return this.ctx.db.read((s) => {
      const link = s.userProperties.find((l) => l.userId === uid && l.propertyId === propertyId);
      return link ? buildMyItem(s, uid, link) : null;
    });
  }

  async addToMine(propertyId: string): Promise<UserProperty> {
    await this.ctx.delay();
    const uid = this.ctx.uid();
    const now = this.ctx.now();
    return this.ctx.db.transaction((d) => {
      if (!d.properties.some((p) => p.id === propertyId)) throw new ServiceError('not_found', 'Fant ikke eiendommen.');
      const e = computeEntitlements(d, uid, now);
      requireFullAccess(e, 'Å legge til objekter');
      let link = d.userProperties.find((l) => l.userId === uid && l.propertyId === propertyId);
      if (!link) {
        link = {
          id: uuid(),
          userId: uid,
          propertyId,
          favorite: false,
          workStatus: 'vurderes',
          notes: '',
          primaryScenarioId: null,
          label: null,
          archivedAt: null,
          addedAt: now.toISOString(),
          updatedAt: now.toISOString(),
          lastSeenAnalysisVersion: null,
          checks: {},
        };
        d.userProperties.push(link);
      }
      return link;
    });
  }

  private mutateLink<T>(propertyId: string, fn: (link: UserProperty, d: DbState) => T): T {
    const uid = this.ctx.uid();
    return this.ctx.db.transaction((d) => {
      const link = d.userProperties.find((l) => l.userId === uid && l.propertyId === propertyId);
      if (!link) throw new ServiceError('not_found', 'Objektet finnes ikke i din liste.');
      const r = fn(link, d);
      link.updatedAt = this.ctx.now().toISOString();
      return r;
    });
  }

  /** «Fjern fra min liste» arkiverer. Private scenarioer bevares; felles data berøres ikke. */
  async archiveMine(propertyId: string, archived = true): Promise<UserProperty> {
    await this.ctx.delay();
    return this.mutateLink(propertyId, (link) => {
      link.archivedAt = archived ? this.ctx.now().toISOString() : null;
      return link;
    });
  }

  async removeMine(propertyId: string): Promise<void> {
    await this.ctx.delay();
    const uid = this.ctx.uid();
    this.ctx.db.transaction((d) => {
      const before = d.userProperties.length;
      d.userProperties = d.userProperties.filter((l) => !(l.userId === uid && l.propertyId === propertyId));
      if (d.userProperties.length === before) throw new ServiceError('not_found', 'Objektet finnes ikke i din liste.');
      d.scenarios = d.scenarios.filter((x) => !(x.ownerId === uid && x.propertyId === propertyId));
      d.privateEvents = d.privateEvents.filter((x) => !(x.userId === uid && x.propertyId === propertyId));
      d.calendarOverrides = d.calendarOverrides.filter((x) => !(x.userId === uid && x.propertyId === propertyId));
      d.userComparables = d.userComparables.filter((x) => !(x.userId === uid && x.propertyId === propertyId));
      d.analyses = d.analyses.filter((a) => !(a.visibility === 'private' && a.ownerId === uid && a.propertyId === propertyId));
    });
  }

  async updatePersonalStatus(propertyId: string, patch: PersonalStatusPatch): Promise<UserProperty> {
    await this.ctx.delay();
    return this.mutateLink(propertyId, (link) => {
      if (patch.workStatus !== undefined) link.workStatus = patch.workStatus;
      if (patch.favorite !== undefined) link.favorite = patch.favorite;
      if (patch.notes !== undefined) link.notes = patch.notes.slice(0, 5000);
      if (patch.lastSeenAnalysisVersion !== undefined) link.lastSeenAnalysisVersion = patch.lastSeenAnalysisVersion;
      if (patch.check) {
        // Privat bekreftelse – endrer aldri kildestatus i den felles analysen.
        if (patch.check.confirmed) link.checks[patch.check.key] = { confirmedAt: this.ctx.now().toISOString(), note: patch.check.note ?? '' };
        else delete link.checks[patch.check.key];
      }
      return link;
    });
  }
}

export class MockComparableRepository implements ComparableRepository {
  constructor(private readonly ctx: MockContext) {}

  async list(propertyId: string): Promise<UserComparable[]> {
    const uid = this.ctx.uid();
    return this.ctx.db.read((s) =>
      s.userComparables
        .filter((c) => c.userId === uid && c.propertyId === propertyId)
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.createdAt.localeCompare(a.createdAt)),
    );
  }

  private clean(input: ComparableFields): ComparableFields {
    const c: ComparableFields = {
      name: input.name.trim(),
      url: input.url?.trim() || null,
      kind: input.kind,
      askingPrice: input.askingPrice,
      soldPrice: input.soldPrice,
      commonCosts: input.commonCosts,
      soldTotalPrice: input.soldTotalPrice,
      area: input.area,
      date: input.date || null,
      notes: input.notes.trim().slice(0, 1000),
    };
    // Valgfrie markedsvektingsfelt: bare tatt med når de er oppgitt (ukjent = utelatt).
    for (const k of COMPARABLE_EXTRA_KEYS) {
      const v = input[k];
      if (v !== undefined && v !== null && v !== '') (c as unknown as Record<string, unknown>)[k] = v;
    }
    const issues = validateComparable(c);
    if (issues.length) throw new ServiceError('validation', issues[0].message, issues);
    return c;
  }

  async create(propertyId: string, input: ComparableFields): Promise<UserComparable> {
    await this.ctx.delay();
    const uid = this.ctx.uid();
    const now = this.ctx.now();
    const fields = this.clean(input);
    return this.ctx.db.transaction((d) => {
      requireFullAccess(computeEntitlements(d, uid, now), 'Å legge inn sammenlignbare objekter');
      if (!d.userProperties.some((l) => l.userId === uid && l.propertyId === propertyId)) {
        throw new ServiceError('forbidden', 'Objektet må være i din liste.');
      }
      if (d.userComparables.filter((c) => c.userId === uid && c.propertyId === propertyId).length >= 50) {
        throw new ServiceError('limit_reached', 'Du kan legge inn inntil 50 egne sammenlignbare objekter per bolig.');
      }
      const row: UserComparable = { id: uuid(), userId: uid, propertyId, ...fields, createdAt: now.toISOString(), updatedAt: now.toISOString() };
      d.userComparables.push(row);
      return row;
    });
  }

  async update(id: string, input: ComparableFields): Promise<UserComparable> {
    await this.ctx.delay();
    const uid = this.ctx.uid();
    const now = this.ctx.now();
    const fields = this.clean(input);
    return this.ctx.db.transaction((d) => {
      requireFullAccess(computeEntitlements(d, uid, now), 'Å endre sammenlignbare objekter');
      const row = d.userComparables.find((c) => c.id === id && c.userId === uid);
      if (!row) throw new ServiceError('not_found', 'Fant ikke det sammenlignbare objektet.');
      Object.assign(row, fields, { updatedAt: now.toISOString() });
      // Felt som er tømt fjernes (ukjent = utelatt).
      for (const k of COMPARABLE_EXTRA_KEYS) if (!(k in fields)) delete (row as unknown as Record<string, unknown>)[k];
      return row;
    });
  }

  async remove(id: string): Promise<void> {
    await this.ctx.delay();
    const uid = this.ctx.uid();
    this.ctx.db.transaction((d) => {
      requireFullAccess(computeEntitlements(d, uid, this.ctx.now()), 'Å slette sammenlignbare objekter');
      const before = d.userComparables.length;
      d.userComparables = d.userComparables.filter((c) => !(c.id === id && c.userId === uid));
      if (d.userComparables.length === before) throw new ServiceError('not_found', 'Fant ikke det sammenlignbare objektet.');
    });
  }
}

export class MockRiskRepository implements RiskRepository {
  constructor(private readonly ctx: MockContext) {}

  async list(propertyId: string): Promise<UserRisk[]> {
    const uid = this.ctx.uid();
    return this.ctx.db.read((s) => s.userRisks.filter((r) => r.userId === uid && r.propertyId === propertyId));
  }

  private clean(input: RiskFields): RiskFields {
    const r: RiskFields = {
      title: input.title.trim(),
      category: input.category,
      level: input.level,
      costLow: input.costLow,
      costHigh: input.costHigh,
      rationale: input.rationale.trim().slice(0, 1000),
      action: input.action.trim().slice(0, 1000),
    };
    const issues = validateRisk(r);
    if (issues.length) throw new ServiceError('validation', issues[0].message, issues);
    return r;
  }

  private guard(d: DbState, uid: string, propertyId: string, action: string) {
    requireFullAccess(computeEntitlements(d, uid, this.ctx.now()), action);
    if (!d.userProperties.some((l) => l.userId === uid && l.propertyId === propertyId)) throw new ServiceError('forbidden', 'Objektet må være i din liste.');
  }

  async create(propertyId: string, input: RiskFields): Promise<UserRisk> {
    await this.ctx.delay();
    const uid = this.ctx.uid();
    const now = this.ctx.now().toISOString();
    const fields = this.clean(input);
    return this.ctx.db.transaction((d) => {
      this.guard(d, uid, propertyId, 'Å legge inn risikoer');
      if (d.userRisks.filter((r) => r.userId === uid && r.propertyId === propertyId).length >= 50) throw new ServiceError('limit_reached', 'Du kan ha inntil 50 egne risikoer per bolig.');
      const row: UserRisk = { id: uuid(), userId: uid, propertyId, baseRiskId: null, removed: false, ...fields, createdAt: now, updatedAt: now };
      d.userRisks.push(row);
      return row;
    });
  }

  private upsertBase(propertyId: string, baseRiskId: string, input: RiskFields, removed: boolean): UserRisk {
    const uid = this.ctx.uid();
    const now = this.ctx.now().toISOString();
    const fields = this.clean(input);
    return this.ctx.db.transaction((d) => {
      this.guard(d, uid, propertyId, 'Å endre risikoer');
      const existing = d.userRisks.find((r) => r.userId === uid && r.propertyId === propertyId && r.baseRiskId === baseRiskId);
      if (existing) {
        Object.assign(existing, fields, { removed, updatedAt: now });
        return existing;
      }
      const row: UserRisk = { id: uuid(), userId: uid, propertyId, baseRiskId, removed, ...fields, createdAt: now, updatedAt: now };
      d.userRisks.push(row);
      return row;
    });
  }

  async overrideBase(propertyId: string, baseRiskId: string, input: RiskFields): Promise<UserRisk> {
    await this.ctx.delay();
    return this.upsertBase(propertyId, baseRiskId, input, false);
  }

  async hideBase(propertyId: string, baseRiskId: string, snapshot: RiskFields): Promise<UserRisk> {
    await this.ctx.delay();
    return this.upsertBase(propertyId, baseRiskId, snapshot, true);
  }

  async update(id: string, input: RiskFields): Promise<UserRisk> {
    await this.ctx.delay();
    const uid = this.ctx.uid();
    const now = this.ctx.now().toISOString();
    const fields = this.clean(input);
    return this.ctx.db.transaction((d) => {
      requireFullAccess(computeEntitlements(d, uid, this.ctx.now()), 'Å endre risikoer');
      const row = d.userRisks.find((r) => r.id === id && r.userId === uid);
      if (!row) throw new ServiceError('not_found', 'Fant ikke risikoen.');
      Object.assign(row, fields, { updatedAt: now });
      return row;
    });
  }

  async remove(id: string): Promise<void> {
    await this.ctx.delay();
    const uid = this.ctx.uid();
    this.ctx.db.transaction((d) => {
      requireFullAccess(computeEntitlements(d, uid, this.ctx.now()), 'Å slette risikoer');
      const before = d.userRisks.length;
      d.userRisks = d.userRisks.filter((r) => !(r.id === id && r.userId === uid));
      if (d.userRisks.length === before) throw new ServiceError('not_found', 'Fant ikke risikoen.');
    });
  }
}

export const BASE_SCENARIO_NAME = 'Nettsidens vurdering';

export class MockScenarioRepository implements ScenarioRepository {
  constructor(private readonly ctx: MockContext) {}

  /** Låst scenario først, deretter eldste først. */
  async list(propertyId: string): Promise<Scenario[]> {
    const uid = this.ctx.uid();
    return this.ctx.db.read((s) =>
      s.scenarios
        .filter((x) => x.ownerId === uid && x.propertyId === propertyId)
        .sort((a, b) => Number(Boolean(b.locked)) - Number(Boolean(a.locked)) || a.createdAt.localeCompare(b.createdAt)),
    );
  }

  /**
   * Ved brukerens første lagrede endring lagres den felles analysens grunnlag som et eget, låst
   * scenario, slik at det er lett tilgjengelig. Importerte private utkast har ikke felles grunnlag.
   */
  private ensureBaseScenario(d: DbState, uid: string, sc: Scenario, now: string): void {
    if (d.scenarios.some((x) => x.ownerId === uid && x.propertyId === sc.propertyId && x.locked)) return;
    const analysis = d.analyses.find((a) => a.id === sc.analysisId);
    if (!analysis || analysis.visibility !== 'shared') return;
    const snapshot = d.snapshots.find((x) => x.id === analysis.snapshotId);
    const property = d.properties.find((p) => p.id === sc.propertyId);
    if (!snapshot || !property) return;
    const limit = computeEntitlements(d, uid, this.ctx.now()).limits.scenariosPerProperty;
    if (d.scenarios.filter((x) => x.ownerId === uid && x.propertyId === sc.propertyId).length >= limit) return;
    const defaults = d.profiles.find((p) => p.userId === uid)?.defaults ?? NEW_ACCOUNT_DEFAULTS;
    d.scenarios.push({
      id: uuid(),
      ownerId: uid,
      propertyId: sc.propertyId,
      analysisId: analysis.id,
      analysisVersion: analysis.version,
      name: BASE_SCENARIO_NAME,
      locked: true,
      values: buildBaseValues({ property, snapshot, analysis, defaults }).values,
      createdAt: now,
      updatedAt: now,
    });
  }

  private validateValues(values: ScenarioValues): ScenarioValues {
    const r = ScenarioValuesSchema.safeParse(values);
    if (!r.success) throw new ServiceError('validation', `Ugyldige scenarioverdier: ${r.error.issues[0].path.join('.')} – ${r.error.issues[0].message}`);
    return values;
  }

  /** Eierskap for refererte objekter: eiendommen må være i brukerens liste, analysen lesbar og for samme eiendom. */
  private assertRefs(d: DbState, uid: string, propertyId: string, analysisId: string) {
    if (!d.userProperties.some((l) => l.userId === uid && l.propertyId === propertyId)) {
      throw new ServiceError('forbidden', 'Objektet må være i din liste før du kan lagre scenarioer.');
    }
    const a = d.analyses.find((x) => x.id === analysisId);
    if (!a || a.propertyId !== propertyId || !canReadAnalysis(a, uid)) {
      throw new ServiceError('forbidden', 'Scenarioet må bygge på en grunnanalyse du har tilgang til for samme objekt.');
    }
    return a;
  }

  private requireEdit(d: DbState, uid: string) {
    requireFullAccess(computeEntitlements(d, uid, this.ctx.now()), 'Å lagre scenarioer');
  }

  private own(d: DbState, uid: string, scenarioId: string): Scenario {
    const s = d.scenarios.find((x) => x.id === scenarioId && x.ownerId === uid);
    // Som RLS: andres rader finnes ikke for deg.
    if (!s) throw new ServiceError('not_found', 'Fant ikke scenarioet.');
    return s;
  }

  async create(propertyId: string, input: { name: string; analysisId: string; values: ScenarioValues }): Promise<Scenario> {
    await this.ctx.delay();
    const uid = this.ctx.uid();
    const now = this.ctx.now().toISOString();
    return this.ctx.db.transaction((d) => {
      this.requireEdit(d, uid);
      const a = this.assertRefs(d, uid, propertyId, input.analysisId);
      const limit = computeEntitlements(d, uid, this.ctx.now()).limits.scenariosPerProperty;
      if (d.scenarios.filter((x) => x.ownerId === uid && x.propertyId === propertyId).length >= limit) {
        throw new ServiceError('limit_reached', `Du kan ha inntil ${limit} scenarioer per objekt.`);
      }
      const sc: Scenario = {
        id: uuid(),
        ownerId: uid,
        propertyId,
        analysisId: a.id,
        analysisVersion: a.version,
        name: input.name.trim().slice(0, 80) || 'Nytt scenario',
        values: this.validateValues(structuredClone(input.values)),
        createdAt: now,
        updatedAt: now,
      };
      d.scenarios.push(sc);
      const link = d.userProperties.find((l) => l.userId === uid && l.propertyId === propertyId)!;
      if (!link.primaryScenarioId) link.primaryScenarioId = sc.id;
      return sc;
    });
  }

  async update(scenarioId: string, patch: { name?: string; values?: ScenarioValues; analysisId?: string }): Promise<Scenario> {
    await this.ctx.delay();
    const uid = this.ctx.uid();
    return this.ctx.db.transaction((d) => {
      this.requireEdit(d, uid);
      const sc = this.own(d, uid, scenarioId);
      // Låst scenario kan bare flyttes til ny analyseversjon (oppdatering av grunnlaget), ikke redigeres.
      const isRebase = Boolean(patch.analysisId && patch.values && patch.name === undefined);
      if (sc.locked && !isRebase) {
        throw new ServiceError('forbidden', `«${sc.name}» er låst. Lagre den som nytt scenario for å lage din egen redigerbare versjon.`);
      }
      if (!sc.locked && patch.values && JSON.stringify(patch.values) !== JSON.stringify(sc.values)) {
        this.ensureBaseScenario(d, uid, sc, this.ctx.now().toISOString());
      }
      if (patch.analysisId) {
        const a = this.assertRefs(d, uid, sc.propertyId, patch.analysisId);
        sc.analysisId = a.id;
        sc.analysisVersion = a.version;
      }
      if (patch.name !== undefined) {
        const n = patch.name.trim();
        if (!n) throw new ServiceError('validation', 'Scenarioet må ha et navn.');
        sc.name = n.slice(0, 80);
      }
      if (patch.values) sc.values = this.validateValues(structuredClone(patch.values));
      sc.updatedAt = this.ctx.now().toISOString();
      return sc;
    });
  }

  async duplicate(scenarioId: string, name?: string): Promise<Scenario> {
    const uid = this.ctx.uid();
    const src = this.ctx.db.read((s) => s.scenarios.find((x) => x.id === scenarioId && x.ownerId === uid) ?? null);
    if (!src) throw new ServiceError('not_found', 'Fant ikke scenarioet.');
    return this.create(src.propertyId, { name: name ?? `${src.name} (kopi)`, analysisId: src.analysisId, values: src.values });
  }

  async remove(scenarioId: string): Promise<void> {
    await this.ctx.delay();
    const uid = this.ctx.uid();
    this.ctx.db.transaction((d) => {
      this.requireEdit(d, uid);
      const sc = this.own(d, uid, scenarioId);
      if (sc.locked) throw new ServiceError('forbidden', `«${sc.name}» er låst og kan ikke slettes.`);
      const siblings = d.scenarios.filter((x) => x.ownerId === uid && x.propertyId === sc.propertyId && x.id !== sc.id);
      if (siblings.length === 0) throw new ServiceError('conflict', 'Et objekt må ha minst ett scenario. Lag et nytt før du sletter dette.');
      d.scenarios = d.scenarios.filter((x) => x.id !== sc.id);
      const link = d.userProperties.find((l) => l.userId === uid && l.propertyId === sc.propertyId);
      if (link && link.primaryScenarioId === sc.id) link.primaryScenarioId = siblings[0].id;
    });
  }

  async setPrimary(propertyId: string, scenarioId: string): Promise<void> {
    await this.ctx.delay();
    const uid = this.ctx.uid();
    this.ctx.db.transaction((d) => {
      const sc = this.own(d, uid, scenarioId);
      if (sc.propertyId !== propertyId) throw new ServiceError('forbidden', 'Scenarioet tilhører et annet objekt.');
      const link = d.userProperties.find((l) => l.userId === uid && l.propertyId === propertyId);
      if (!link) throw new ServiceError('not_found', 'Objektet finnes ikke i din liste.');
      link.primaryScenarioId = sc.id;
      link.updatedAt = this.ctx.now().toISOString();
    });
  }
}
