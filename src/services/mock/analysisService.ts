import { buildProperty } from '../../data/analysisBuilder';
import type { DbState } from '../../data/db';
import { SEED_PROPERTIES } from '../../data/seedProperties';
import { syntheticPropertySpec } from '../../data/synthetic';
import type { AnalysisJob, Property, SharedAnalysis } from '../../domain/schemas';
import { parseFinnUrl } from '../../lib/finn';
import {
  ServiceError,
  type AnalysisMeta,
  type AnalysisRequestResult,
  type AnalysisService,
  type RefreshResult,
} from '../types';
import {
  analysisMeta,
  canReadAnalysis,
  computeEntitlements,
  ensureDefaultScenario,
  ensureLink,
  isModelCompatible,
  latestSharedAnalysis,
  latestSnapshot,
  requireFullAccess,
  staleness,
  type MockContext,
} from './context';
import { FRESHNESS } from '../../config/freshness';
import { advanceJobs, createJob, dedupeKeyFor, hasActiveJobs, recordReuse } from './jobs';

/** Oppretter eiendomsidentitet for en ukjent FINN-ID (i produksjon: kun autorisert backend). */
export function createPropertyIdentity(d: DbState, finnId: string, now: Date): Property {
  const spec = SEED_PROPERTIES.find((s) => s.finnId === finnId) ?? syntheticPropertySpec(finnId);
  const { property } = buildProperty({ ...spec, analysisAgeDays: 0, snapshotAgeHours: 0 }, now);
  const p = { ...property, createdAt: now.toISOString() };
  d.properties.push(p);
  return p;
}

export class MockAnalysisService implements AnalysisService {
  constructor(private readonly ctx: MockContext) {}

  /** Kjører jobbsimulatoren. Skriver bare når noe faktisk endres. */
  tick(): void {
    if (!this.ctx.db.read((s) => hasActiveJobs(s))) return;
    const now = this.ctx.now();
    const changed = this.ctx.db.read((s) => {
      const copy = structuredClone(s) as DbState;
      return advanceJobs(copy, now);
    });
    if (changed) this.ctx.db.transaction((d) => void advanceJobs(d, now));
  }

  async requestAnalysis(input: { url: string; idempotencyKey: string }): Promise<AnalysisRequestResult> {
    await this.ctx.delay();
    // 1. Innlogging og abonnement
    const uid = this.ctx.uid();
    const now = this.ctx.now();
    requireFullAccess(this.ctx.db.read((s) => computeEntitlements(s, uid, now)), 'Å analysere eller hente analyser');
    // Normalisering av lenken – ingen nettverkskall.
    const parsed = parseFinnUrl(input.url);
    if (!parsed.ok) throw new ServiceError('invalid_url', parsed.message, { code: parsed.code });
    this.tick();

    return this.ctx.db.transaction((d): AnalysisRequestResult => {
      // 2. Slå opp eiendommen på FINN-ID
      let property = d.properties.find((p) => p.finnId === parsed.finnId) ?? null;
      if (property) {
        // 3. Kompatibel grunnanalyse finnes → gjenbruk (belastes ikke)
        const latest = latestSharedAnalysis(d, property.id);
        if (latest && isModelCompatible(latest)) {
          const alreadyInList = d.userProperties.some((l) => l.userId === uid && l.propertyId === property!.id && !l.archivedAt);
          ensureLink(d, uid, property.id, now);
          ensureDefaultScenario(d, uid, property.id, latest, now);
          const ownedByUser = d.usageEvents.some((u) => u.userId === uid && u.analysisId === latest.id);
          if (!ownedByUser) recordReuse(d, uid, latest, now);
          return {
            outcome: 'reused',
            propertyId: property.id,
            finnId: property.finnId,
            analysis: latest,
            staleness: staleness(d, latest, now),
            alreadyInList,
            charged: false,
          };
        }
        // 4. Aktiv jobb for samme objekt/versjon → koble brukeren til samme jobb
        const active = d.jobs.find((j) => j.propertyId === property!.id && j.type === 'full_analysis' && (j.status === 'running' || j.status === 'queued'));
        if (active) {
          if (!active.requestedBy.includes(uid)) active.requestedBy.push(uid);
          ensureLink(d, uid, property.id, now);
          return { outcome: 'job_joined', propertyId: property.id, finnId: property.finnId, job: active, joinedOtherUser: active.createdBy !== uid, charged: false };
        }
      }
      // 6. Ingen analyse → ny jobb (sjekk kvote først)
      const ent = computeEntitlements(d, uid, now);
      if (!ent.canRequestNewAnalysis) {
        throw new ServiceError(
          'quota_exceeded',
          `Du har nådd grensen på ${ent.limits.newAnalyses} nye analyser i denne perioden (${ent.used.newAnalyses} brukt${ent.used.pendingNewAnalyses ? `, ${ent.used.pendingNewAnalyses} pågår` : ''}). Gjenbruk av eksisterende analyser belastes ikke. Ny kvote fra ${ent.periodEnd ? new Date(ent.periodEnd).toLocaleDateString('nb-NO') : 'neste periode'}.`,
        );
      }
      if (!property) property = createPropertyIdentity(d, parsed.finnId, now);
      const latest = latestSharedAnalysis(d, property.id);
      const target = (latest?.version ?? 0) + 1;
      // Et tidligere mislykket forsøk med samme nøkkel prøves på nytt i stedet for å lage en ny jobb.
      const failed = d.jobs.find((j) => j.dedupeKey === dedupeKeyFor(property!.id, 'full_analysis', target) && j.status === 'failed');
      let job: AnalysisJob;
      if (failed) {
        job = failed;
        this.restart(job, now);
        if (!job.requestedBy.includes(uid)) job.requestedBy.push(uid);
      } else {
        job = createJob(d, { property, type: 'full_analysis', userId: uid, now, stepMs: this.ctx.jobTiming.stepMs, targetVersion: target });
      }
      // 8. Legg i brukerens liste med en gang (vises som «Analyse pågår»)
      ensureLink(d, uid, property.id, now);
      return { outcome: 'job_started', propertyId: property.id, finnId: property.finnId, job, charged: false };
    });
  }

  private restart(job: AnalysisJob, now: Date) {
    job.attempt += 1;
    job.status = 'running';
    job.stepIndex = 0;
    job.startedAt = now.toISOString();
    job.updatedAt = now.toISOString();
    job.finishedAt = null;
    job.error = null;
    job.stepDurationMs = job.type === 'full_analysis' ? this.ctx.jobTiming.stepMs : this.ctx.jobTiming.refreshStepMs;
  }

  async getJob(jobId: string): Promise<AnalysisJob | null> {
    const uid = this.ctx.uid();
    this.tick();
    return this.ctx.db.read((s) => s.jobs.find((j) => j.id === jobId && j.requestedBy.includes(uid)) ?? null);
  }

  async retryJob(jobId: string): Promise<AnalysisJob> {
    await this.ctx.delay();
    const uid = this.ctx.uid();
    this.tick();
    const now = this.ctx.now();
    return this.ctx.db.transaction((d) => {
      const job = d.jobs.find((j) => j.id === jobId && j.requestedBy.includes(uid));
      if (!job) throw new ServiceError('not_found', 'Fant ikke analysejobben.');
      // Idempotent: vellykket eller pågående jobb returneres uendret – ingen ny kjøring, intet nytt forbruk.
      if (job.status !== 'failed') return job;
      const ent = computeEntitlements(d, uid, now);
      requireFullAccess(ent, 'Å prøve analysen på nytt');
      if (job.type === 'full_analysis' && !ent.canRequestNewAnalysis) {
        throw new ServiceError('quota_exceeded', 'Kvoten for nye analyser er brukt opp i denne perioden.');
      }
      this.restart(job, now);
      return job;
    });
  }

  async getPublishedAnalysis(propertyId: string, version?: number): Promise<SharedAnalysis | null> {
    this.ctx.uid();
    return this.ctx.db.read((s) =>
      version === undefined
        ? latestSharedAnalysis(s, propertyId)
        : s.analyses.find((a) => a.propertyId === propertyId && a.visibility === 'shared' && a.version === version && a.status !== 'draft') ?? null,
    );
  }

  async getAnalysis(analysisId: string): Promise<SharedAnalysis | null> {
    const uid = this.ctx.uid();
    return this.ctx.db.read((s) => {
      const a = s.analyses.find((x) => x.id === analysisId);
      return a && canReadAnalysis(a, uid) ? a : null;
    });
  }

  async listVersions(propertyId: string): Promise<AnalysisMeta[]> {
    this.ctx.uid();
    return this.ctx.db.read((s) =>
      s.analyses
        .filter((a) => a.propertyId === propertyId && a.visibility === 'shared' && a.status !== 'draft')
        .sort((a, b) => b.version - a.version)
        .map(analysisMeta),
    );
  }

  async requestRefresh(propertyId: string, kind: 'light' | 'full', idempotencyKey: string): Promise<RefreshResult> {
    void idempotencyKey;
    await this.ctx.delay();
    const uid = this.ctx.uid();
    const now = this.ctx.now();
    this.tick();
    return this.ctx.db.transaction((d): RefreshResult => {
      const ent = computeEntitlements(d, uid, now);
      requireFullAccess(ent, kind === 'light' ? 'Oppfrisking av annonsen' : 'Ny analyse');
      const property = d.properties.find((p) => p.id === propertyId);
      if (!property) throw new ServiceError('not_found', 'Fant ikke eiendommen.');
      if (!d.userProperties.some((l) => l.userId === uid && l.propertyId === propertyId)) {
        throw new ServiceError('forbidden', 'Objektet må være i din liste.');
      }
      const type = kind === 'light' ? 'light_refresh' : 'full_analysis';
      const active = d.jobs.find((j) => j.propertyId === propertyId && j.type === type && (j.status === 'running' || j.status === 'queued'));
      if (active) {
        if (!active.requestedBy.includes(uid)) active.requestedBy.push(uid);
        return { outcome: 'job_joined', propertyId, job: active };
      }
      if (kind === 'light') {
        const snap = latestSnapshot(d, propertyId);
        if (snap && now.getTime() - Date.parse(snap.observedAt) < FRESHNESS.volatileMaxAgeHours * 3_600_000) {
          return { outcome: 'already_fresh', propertyId, observedAt: snap.observedAt };
        }
        if (!ent.canRefresh) throw new ServiceError('quota_exceeded', `Du har brukt alle ${ent.limits.refreshes} oppfriskingene i denne perioden.`);
        const job = createJob(d, { property, type: 'light_refresh', userId: uid, now, stepMs: this.ctx.jobTiming.refreshStepMs, targetVersion: null });
        job.simulatedFailure = null;
        return { outcome: 'job_started', propertyId, job };
      }
      if (!ent.canRequestNewAnalysis) throw new ServiceError('quota_exceeded', `Du har brukt alle ${ent.limits.newAnalyses} nye analyser i denne perioden.`);
      const latest = latestSharedAnalysis(d, propertyId);
      const job = createJob(d, { property, type: 'full_analysis', userId: uid, now, stepMs: this.ctx.jobTiming.stepMs, targetVersion: (latest?.version ?? 0) + 1 });
      return { outcome: 'job_started', propertyId, job };
    });
  }
}
