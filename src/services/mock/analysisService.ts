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
import { advanceJobs, createJob, dedupeKeyFor, hasActiveJobs } from './jobs';

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
      const quotaError = (ent: ReturnType<typeof computeEntitlements>) =>
        new ServiceError(
          'quota_exceeded',
          `Du har nådd grensen på ${ent.limits.newAnalyses} nye analyser i denne perioden (${ent.used.newAnalyses} brukt${ent.used.pendingNewAnalyses ? `, ${ent.used.pendingNewAnalyses} pågår` : ''}). Ny kvote fra ${ent.periodEnd ? new Date(ent.periodEnd).toLocaleDateString('nb-NO') : 'neste periode'}.`,
        );
      if (property) {
        const latest = latestSharedAnalysis(d, property.id);
        const compatible = latest !== null && isModelCompatible(latest);
        const inList = d.userProperties.some((l) => l.userId === uid && l.propertyId === property!.id && !l.archivedAt);
        // Pågår brukerens egen analyse allerede (dobbeltklikk, samme lenke på nytt), returneres den samme jobben.
        const ownJobs = d.jobs
          .filter((j) => j.type === 'linked_analysis' && j.createdBy === uid && j.propertyId === property!.id)
          .sort((x, y) => y.startedAt.localeCompare(x.startedAt));
        const running = ownJobs.find((j) => j.status === 'running' || j.status === 'queued');
        if (running) return { outcome: 'job_started', propertyId: property.id, finnId: property.finnId, job: running, charged: false };
        // Har brukeren allerede analysert boligen (ligger i listen eller er betalt før), åpnes den uten ny belastning.
        const paidBefore = d.usageEvents.some((u) => u.userId === uid && u.propertyId === property!.id && u.kind === 'new_analysis' && u.chargeable);
        if (latest && compatible && (inList || paidBefore)) {
          ensureLink(d, uid, property.id, now);
          ensureDefaultScenario(d, uid, property.id, latest, now);
          // Har det gått over ett døgn siden forrige analyse/oppfriskning, oppfriskes annonsen først
          // (pris, visninger og salgsstatus). Er oppfriskingskvoten brukt opp, åpnes objektet som det er.
          const snap = latestSnapshot(d, property.id);
          if (snap && now.getTime() - Date.parse(snap.observedAt) > FRESHNESS.volatileMaxAgeHours * 3_600_000) {
            const activeRefresh = d.jobs.find((j) => j.propertyId === property!.id && j.type === 'light_refresh' && (j.status === 'running' || j.status === 'queued'));
            if (activeRefresh) {
              if (!activeRefresh.requestedBy.includes(uid)) activeRefresh.requestedBy.push(uid);
              return { outcome: 'job_joined', propertyId: property.id, finnId: property.finnId, job: activeRefresh, joinedOtherUser: activeRefresh.createdBy !== uid, charged: false };
            }
            if (computeEntitlements(d, uid, now).canRefresh) {
              const job = createJob(d, { property, type: 'light_refresh', userId: uid, now, stepMs: this.ctx.jobTiming.refreshStepMs, targetVersion: null });
              job.simulatedFailure = null;
              return { outcome: 'job_started', propertyId: property.id, finnId: property.finnId, job, charged: false };
            }
          }
          return { outcome: 'reused', propertyId: property.id, finnId: property.finnId, analysis: latest, staleness: staleness(d, latest, now), alreadyInList: true, charged: false };
        }
        // Grunnlaget er ferskt nok: brukeren får sin egen analyse som ser ut og belastes som en ny analyse.
        const ageDays = latest ? (now.getTime() - Date.parse(latest.publishedAt ?? latest.createdAt)) / 86_400_000 : Infinity;
        if (latest && compatible && ageDays <= FRESHNESS.analysisMaxAgeDays) {
          const ent = computeEntitlements(d, uid, now);
          const mine = ownJobs[0];
          if (!ent.canRequestNewAnalysis) throw quotaError(ent);
          let job: AnalysisJob;
          if (mine && mine.status === 'failed') {
            job = mine;
            this.restart(job, now);
          } else {
            job = createJob(d, { property, type: 'linked_analysis', userId: uid, now, stepMs: this.ctx.jobTiming.stepMs, targetVersion: latest.version });
            job.dedupeKey = `${job.dedupeKey}:u${uid}`;
          }
          ensureLink(d, uid, property.id, now);
          return { outcome: 'job_started', propertyId: property.id, finnId: property.finnId, job, charged: false };
        }
        // 4. Aktiv jobb for samme objekt → koble brukeren til samme jobb (brukeren belastes når den er ferdig)
        const active = d.jobs.find((j) => j.propertyId === property!.id && j.type === 'full_analysis' && (j.status === 'running' || j.status === 'queued'));
        if (active) {
          if (!active.requestedBy.includes(uid)) {
            const ent = computeEntitlements(d, uid, now);
            if (!ent.canRequestNewAnalysis) throw quotaError(ent);
            active.requestedBy.push(uid);
          }
          ensureLink(d, uid, property.id, now);
          return { outcome: 'job_joined', propertyId: property.id, finnId: property.finnId, job: active, joinedOtherUser: active.createdBy !== uid, charged: false };
        }
      }
      // 6. Ingen brukbar analyse (eller for gammel) → ny jobb (sjekk kvote først)
      const ent = computeEntitlements(d, uid, now);
      if (!ent.canRequestNewAnalysis) throw quotaError(ent);
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
    job.stepDurationMs = job.type === 'light_refresh' ? this.ctx.jobTiming.refreshStepMs : this.ctx.jobTiming.stepMs;
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
      if (job.type !== 'light_refresh' && !ent.canRequestNewAnalysis) {
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
