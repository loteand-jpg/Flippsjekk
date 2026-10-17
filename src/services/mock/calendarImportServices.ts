import { evaluateScenario } from '../../calc/scenario';
import { deterministicUuid } from '../../data/analysisBuilder';
import type { DbState } from '../../data/db';
import { SharedAnalysisSchema, type PrivateEvent, type Scenario, type SharedAnalysis } from '../../domain/schemas';
import { buildScenarioExport } from '../../import/scenarioExport';
import type { ImportChoice, ImportPreview, ImportResult } from '../../import/types';
import { parseV1Import } from '../../import/v1Adapter';
import { deriveBidDay } from '../../lib/bidDay';
import { formatNOK } from '../../lib/format';
import { buildIcs, type IcsEvent } from '../../lib/ics';
import { uuid } from '../../lib/ids';
import { canonicalFinnUrl } from '../../lib/finn';
import { localDateKey } from '../../lib/time';
import { NEW_ACCOUNT_DEFAULTS } from '../../config/defaults';
import { ServiceError, type CalendarEvent, type CalendarService, type ImportService } from '../types';
import { computeEntitlements, ensureLink, requireFullAccess, type MockContext } from './context';

const PROGNOSIS_NOTE =
  'Forventet buddag er Flippsjekks planleggingsprognose (kl. 12:00 dagen etter siste annonserte visning). Den er ikke en bekreftet budstart eller akseptfrist – kontroller med megler.';

export class MockCalendarService implements CalendarService {
  constructor(private readonly ctx: MockContext) {}

  private buildEvents(s: Readonly<DbState>, uid: string): CalendarEvent[] {
    const out: CalendarEvent[] = [];
    for (const link of s.userProperties.filter((l) => l.userId === uid && !l.archivedAt)) {
      const p = s.properties.find((x) => x.id === link.propertyId);
      if (!p) continue;
      const address = link.label ?? p.address;
      const isDemo = p.dataOrigin === 'demo' || p.dataOrigin === 'synthetic';
      const viewings = s.viewings.filter((v) => v.propertyId === p.id);
      for (const v of viewings) {
        out.push({
          uid: `viewing-${v.id}`,
          kind: 'visning',
          propertyId: p.id,
          address,
          district: p.district,
          title: `Visning: ${address}`,
          start: v.start,
          end: v.end,
          status: v.status,
          url: p.canonicalUrl,
          sourceLabel: v.sourceLabel,
          verifiedAt: v.verifiedAt,
          isDemo,
          note: v.note,
          confirmed: null,
          prognosis: null,
          override: null,
          privateEventId: null,
        });
      }
      const prognosis = deriveBidDay(p.id, viewings);
      const override = s.calendarOverrides.find((o) => o.userId === uid && o.propertyId === p.id) ?? null;
      if (prognosis || override) {
        out.push({
          uid: `bidday-${p.id}`,
          kind: 'buddag',
          propertyId: p.id,
          address,
          district: p.district,
          title: `Forventet buddag${override ? ' (privat overstyring)' : ' (prognose)'}: ${address}`,
          start: override?.start ?? (prognosis as NonNullable<typeof prognosis>).start,
          end: null,
          status: 'planlagt',
          url: p.canonicalUrl,
          sourceLabel: prognosis ? 'Avledet fra siste annonserte visning' : 'Bare privat overstyring – ingen kjent offisiell visning',
          verifiedAt: prognosis?.basedOnVerifiedAt ?? null,
          isDemo,
          note: override?.note ?? null,
          confirmed: null,
          prognosis,
          override,
          privateEventId: null,
        });
      }
      for (const e of s.privateEvents.filter((x) => x.userId === uid && x.propertyId === p.id)) {
        out.push({
          uid: `private-${e.id}`,
          kind: e.kind === 'imported_viewing' ? 'importert_visning' : 'privat_visning',
          propertyId: p.id,
          address,
          district: p.district,
          title: `${e.kind === 'imported_viewing' ? 'Importert visning' : 'Privat visning'}: ${address}`,
          start: e.start,
          end: e.end,
          status: 'planlagt',
          url: p.canonicalUrl,
          sourceLabel: e.kind === 'imported_viewing' ? (e.confirmed ? 'Import (markert bekreftet)' : 'Import – ikke bekreftet') : 'Din private avtale',
          verifiedAt: null,
          isDemo,
          note: e.note,
          confirmed: e.confirmed,
          prognosis: null,
          override: null,
          privateEventId: e.id,
        });
      }
    }
    return out.sort((a, b) => a.start.localeCompare(b.start));
  }

  async listEvents(): Promise<CalendarEvent[]> {
    await this.ctx.delay();
    const uid = this.ctx.uid();
    return this.ctx.db.read((s) => this.buildEvents(s, uid));
  }

  async setPersonalOverride(propertyId: string, input: { start: string; note: string } | null): Promise<void> {
    await this.ctx.delay();
    const uid = this.ctx.uid();
    const now = this.ctx.now().toISOString();
    this.ctx.db.transaction((d) => {
      if (!d.userProperties.some((l) => l.userId === uid && l.propertyId === propertyId)) throw new ServiceError('not_found', 'Objektet finnes ikke i din liste.');
      d.calendarOverrides = d.calendarOverrides.filter((o) => !(o.userId === uid && o.propertyId === propertyId));
      if (!input) return;
      if (Number.isNaN(Date.parse(input.start))) throw new ServiceError('validation', 'Ugyldig tidspunkt.');
      const prognosis = deriveBidDay(propertyId, d.viewings);
      d.calendarOverrides.push({
        id: uuid(),
        userId: uid,
        propertyId,
        eventKey: 'bidday',
        start: new Date(input.start).toISOString(),
        note: input.note.slice(0, 500),
        origin: 'manual',
        derivedStartAtOverride: prognosis?.start ?? null,
        createdAt: now,
      });
    });
  }

  async addPrivateViewing(propertyId: string, input: { start: string; end: string | null; note: string }): Promise<PrivateEvent> {
    await this.ctx.delay();
    const uid = this.ctx.uid();
    const start = Date.parse(input.start);
    const end = input.end ? Date.parse(input.end) : null;
    if (Number.isNaN(start)) throw new ServiceError('validation', 'Ugyldig starttidspunkt.');
    if (end !== null && (Number.isNaN(end) || end <= start)) throw new ServiceError('validation', 'Sluttidspunkt må være etter start.');
    return this.ctx.db.transaction((d) => {
      if (!d.userProperties.some((l) => l.userId === uid && l.propertyId === propertyId)) throw new ServiceError('not_found', 'Objektet finnes ikke i din liste.');
      const e: PrivateEvent = {
        id: uuid(),
        userId: uid,
        propertyId,
        kind: 'private_viewing',
        start: new Date(start).toISOString(),
        end: end === null ? null : new Date(end).toISOString(),
        note: input.note.slice(0, 500),
        confirmed: true,
        createdAt: this.ctx.now().toISOString(),
      };
      d.privateEvents.push(e);
      return e;
    });
  }

  async removePrivateEvent(eventId: string): Promise<void> {
    await this.ctx.delay();
    const uid = this.ctx.uid();
    this.ctx.db.transaction((d) => {
      const before = d.privateEvents.length;
      d.privateEvents = d.privateEvents.filter((e) => !(e.id === eventId && e.userId === uid));
      if (d.privateEvents.length === before) throw new ServiceError('not_found', 'Fant ikke hendelsen.');
    });
  }

  async exportIcs(): Promise<{ filename: string; content: string }> {
    const uid = this.ctx.uid();
    const now = this.ctx.now();
    const { events, economics } = this.ctx.db.read((s) => {
      const evs = this.buildEvents(s, uid);
      const econ: Record<string, string> = {};
      for (const link of s.userProperties.filter((l) => l.userId === uid)) {
        const sc = s.scenarios.find((x) => x.id === link.primaryScenarioId);
        if (!sc) continue;
        const ev = evaluateScenario(sc.values, { detailed: false });
        const b = ev.evaluation.base;
        econ[link.propertyId] = b
          ? `Mitt scenario «${sc.name}»: kjøpspris ${formatNOK(b.P)}, modellert maksbud ${formatNOK(ev.evaluation.maxBid?.price ?? null, 'ingen løsning')}, forventet salgspris ${formatNOK(b.V)} (${b.basis === 'total' ? 'inkl. fellesgjeld' : 'kontant'}), resultat før skatt og eget arbeid ${formatNOK(b.profit)}.`
          : `Mitt scenario «${sc.name}»: kalkylen er ufullstendig (${ev.missing.map((m) => m.label).join(', ')}).`;
      }
      return { events: evs, economics: econ };
    });
    const ics: IcsEvent[] = events
      .filter((e) => e.status !== 'avlyst')
      .map((e) => ({
        uid: `${e.uid}@flipprom.no`,
        start: e.start,
        end: e.end,
        summary: e.title,
        location: e.address,
        url: e.url,
        status: e.kind === 'buddag' ? 'TENTATIVE' : 'CONFIRMED',
        categories: [e.kind === 'buddag' ? 'Forventet buddag' : e.kind === 'visning' ? 'Visning' : 'Privat'],
        description: [
          e.kind === 'buddag' ? PROGNOSIS_NOTE : null,
          e.override ? `Privat overstyring: ${e.override.note || 'uten notat'}. Kildeprognose: ${e.prognosis ? e.prognosis.start : 'ingen'}.` : null,
          e.prognosis?.nonBusinessDay ? `Dagen er ${e.prognosis.nonBusinessDay} – kontroller budfrist med megler.` : null,
          e.isDemo ? 'Demodata – fiktivt objekt.' : null,
          economics[e.propertyId] ?? null,
          `Kilde: ${e.sourceLabel}.`,
        ]
          .filter(Boolean)
          .join('\n'),
      }));
    return { filename: `flippsjekk-kalender-${localDateKey(now)}.ics`, content: buildIcs(ics, now, 'Flippsjekk – visninger og buddager') };
  }
}

export class MockImportService implements ImportService {
  constructor(private readonly ctx: MockContext) {}

  async preview(text: string, byteLength: number): Promise<ImportPreview> {
    await this.ctx.delay();
    const uid = this.ctx.uid();
    const defaults = this.ctx.db.read((s) => s.profiles.find((p) => p.userId === uid)?.defaults ?? NEW_ACCOUNT_DEFAULTS);
    const parsed = parseV1Import(text, byteLength, defaults);
    return this.ctx.db.read((s) => ({
      format: 'flipprom-analysis' as const,
      version: parsed.version,
      byteLength,
      rootErrors: parsed.rootErrors,
      rootWarnings: parsed.rootWarnings,
      objects: parsed.objects.map((o) => {
        const property = o.finnId ? s.properties.find((p) => p.finnId === o.finnId) ?? null : null;
        const errors = [...o.errors];
        let mapped = o.mapped;
        if (mapped && !property && !mapped.propertyType) {
          errors.push({ path: `objects[${o.index}].type`, message: 'Boligtype mangler. Det kreves for objekter som ikke finnes fra før.' });
          mapped = null;
        }
        return {
          ...o,
          errors,
          mapped,
          existingPropertyId: property?.id ?? null,
          alreadyInList: property ? s.userProperties.some((l) => l.userId === uid && l.propertyId === property.id) : false,
          existingScenarios: property
            ? s.scenarios.filter((x) => x.ownerId === uid && x.propertyId === property.id).map((x) => ({ id: x.id, name: x.name }))
            : [],
        };
      }),
    }));
  }

  /**
   * Lagrer importen som private data: privat utkast til analyse, privat scenario,
   * private kalenderhendelser. Skriver aldri til den felles analysecachen.
   * Hele importen lagres atomisk.
   */
  async commit(preview: ImportPreview, choices: Record<number, ImportChoice>): Promise<ImportResult> {
    await this.ctx.delay();
    const uid = this.ctx.uid();
    const now = this.ctx.now();
    const iso = now.toISOString();
    return this.ctx.db.transaction((d) => {
      requireFullAccess(computeEntitlements(d, uid, now), 'Import');
      const result: ImportResult = { imported: [], skipped: [] };
      for (const o of preview.objects) {
        const choice = choices[o.index] ?? { action: 'new_scenario' };
        if (!o.mapped || choice.action === 'skip') {
          result.skipped.push(o.index);
          continue;
        }
        const m = o.mapped;
        let property = d.properties.find((p) => p.finnId === m.finnId);
        let createdProperty = false;
        if (!property) {
          if (!m.propertyType) throw new ServiceError('validation', `objects[${o.index}].type: Boligtype mangler.`);
          // Kun identitet (FINN-ID og kanonisk URL). Brukerens importerte opplysninger blir private.
          property = {
            id: deterministicUuid(`property:${m.finnId}`),
            finnId: m.finnId,
            canonicalUrl: canonicalFinnUrl(m.finnId),
            address: `FINN-kode ${m.finnId} (ikke analysert)`,
            postalCode: null,
            city: 'Ikke avklart',
            district: null,
            municipality: 'Ikke avklart',
            countryCode: 'NO',
            propertyType: m.propertyType,
            tenure: 'ukjent',
            dataOrigin: 'import',
            createdAt: iso,
          };
          d.properties.push(property);
          createdProperty = true;
        }
        const link = ensureLink(d, uid, property.id, now);
        link.label = m.name;
        link.workStatus = m.workStatus;
        if (m.notes && !link.notes.includes(m.notes)) link.notes = link.notes ? `${link.notes}\n\n${m.notes}` : m.notes;

        const draft: SharedAnalysis = {
          ...structuredClone(m.draft),
          id: uuid(),
          propertyId: property.id,
          snapshotId: `import:${o.index}:${iso}`,
          ownerId: uid,
          createdAt: iso,
        };
        const v = SharedAnalysisSchema.safeParse(draft);
        if (!v.success) throw new ServiceError('validation', `objects[${o.index}]: ${v.error.issues[0].path.join('.')} – ${v.error.issues[0].message}`);
        d.analyses.push(draft);

        let scenario: Scenario;
        if (choice.action === 'replace') {
          const existing = d.scenarios.find((x) => x.id === choice.scenarioId && x.ownerId === uid && x.propertyId === property!.id);
          if (!existing) throw new ServiceError('not_found', `objects[${o.index}]: Fant ikke scenarioet som skulle erstattes.`);
          existing.values = structuredClone(m.values);
          existing.analysisId = draft.id;
          existing.analysisVersion = draft.version;
          existing.updatedAt = iso;
          scenario = existing;
        } else {
          const count = d.scenarios.filter((x) => x.ownerId === uid && x.propertyId === property!.id).length;
          const limit = computeEntitlements(d, uid, now).limits.scenariosPerProperty;
          if (count >= limit) throw new ServiceError('limit_reached', `objects[${o.index}]: Maks ${limit} scenarioer per objekt.`);
          scenario = {
            id: uuid(),
            ownerId: uid,
            propertyId: property.id,
            analysisId: draft.id,
            analysisVersion: draft.version,
            name: `Import: ${m.name}`.slice(0, 80),
            values: structuredClone(m.values),
            createdAt: iso,
            updatedAt: iso,
          };
          d.scenarios.push(scenario);
        }
        if (!link.primaryScenarioId) link.primaryScenarioId = scenario.id;

        if (m.viewing) {
          d.privateEvents.push({
            id: uuid(),
            userId: uid,
            propertyId: property.id,
            kind: 'imported_viewing',
            start: m.viewing.start,
            end: null,
            note: 'Visning fra import. Ikke kildebekreftet av annonsen.',
            confirmed: m.viewing.confirmed,
            createdAt: iso,
          });
        }
        if (m.bidDay && !d.calendarOverrides.some((x) => x.userId === uid && x.propertyId === property!.id)) {
          d.calendarOverrides.push({
            id: uuid(),
            userId: uid,
            propertyId: property.id,
            eventKey: 'bidday',
            start: m.bidDay,
            note: 'Importert buddag – ikke kildebekreftet.',
            origin: 'import_v1',
            derivedStartAtOverride: deriveBidDay(property.id, d.viewings)?.start ?? null,
            createdAt: iso,
          });
        }
        result.imported.push({ index: o.index, propertyId: property.id, scenarioId: scenario.id, action: choice.action, createdProperty });
      }
      return result;
    });
  }

  async exportScenarios(): Promise<{ filename: string; content: string }> {
    const uid = this.ctx.uid();
    const now = this.ctx.now();
    const rows = this.ctx.db.read((s) =>
      s.scenarios
        .filter((x) => x.ownerId === uid)
        .map((scenario) => {
          const property = s.properties.find((p) => p.id === scenario.propertyId)!;
          const link = s.userProperties.find((l) => l.userId === uid && l.propertyId === scenario.propertyId);
          return { scenario, property, isPrimary: link?.primaryScenarioId === scenario.id };
        })
        .filter((r) => r.property),
    );
    const data = buildScenarioExport(rows, now);
    return { filename: `flippsjekk-scenarioer-${localDateKey(now)}.json`, content: JSON.stringify(data, null, 2) };
  }
}
