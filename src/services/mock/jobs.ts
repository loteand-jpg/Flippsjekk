import { CALC_MODEL_VERSION } from '../../calc/engine';
import { DEMO_JOB, FRESHNESS } from '../../config/freshness';
import { deterministicUuid } from '../../data/analysisBuilder';
import type { DbState } from '../../data/db';
import { SEED_PROPERTIES } from '../../data/seedProperties';
import { adaptAgentOutput, parseAgentOutput, validateForPublish } from '../../domain/agentContract';
import { ANALYSIS_SCHEMA_VERSION, type AnalysisJob, type Property, type SharedAnalysis, type UsageEvent, type Viewing } from '../../domain/schemas';
import { mockAgentRun } from './mockAgent';
import type { JobType } from '../../domain/enums';
import { uuid } from '../../lib/ids';
import { addDaysToKey, localDateKey, osloAt } from '../../lib/time';
import { ensureDefaultScenario, ensureLink, latestSharedAnalysis, latestSnapshot } from './context';

export function dedupeKeyFor(propertyId: string, type: JobType, targetVersion: number | null): string {
  return `${propertyId}:${type}:v${targetVersion ?? 0}:s${ANALYSIS_SCHEMA_VERSION}:m${CALC_MODEL_VERSION}`;
}

export function createJob(
  draft: DbState,
  args: {
    property: Property;
    type: JobType;
    userId: string;
    now: Date;
    stepMs: number;
    targetVersion: number | null;
    /**
     * Markedsoppfriskning: hvordan skaperen belastes. «new_analysis» når brukeren ba om en analyse (da ser dialogen ut som en
     * ny analyse); «refresh» når brukeren ba om å oppfriske en analyse han/hun allerede har.
     */
    charge?: 'new_analysis' | 'refresh';
  },
): AnalysisJob {
  const { property, type, userId, now, stepMs, targetVersion } = args;
  const failMode = draft.demo.failNextJob;
  const failFirst = type === 'full_analysis' && draft.demo.failFirstAttemptFinnIds.includes(property.finnId);
  let simulatedFailure: AnalysisJob['simulatedFailure'] = null;
  if (failMode) {
    simulatedFailure = { attempt: 1, atStep: failMode === 'fetch_error' ? 1 : 5, mode: failMode };
    draft.demo.failNextJob = null;
  } else if (failFirst) {
    simulatedFailure = { attempt: 1, atStep: 2, mode: 'fetch_error' };
  }
  const job: AnalysisJob = {
    id: uuid(),
    propertyId: property.id,
    finnId: property.finnId,
    type,
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    modelVersion: CALC_MODEL_VERSION,
    targetAnalysisVersion: targetVersion,
    dedupeKey: dedupeKeyFor(property.id, type, targetVersion),
    status: 'running',
    // En «koblet» analyse har samme trinn og tempo som en ny analyse, så brukeren ser det samme.
    steps:
      type === 'light_refresh' ? [...DEMO_JOB.refreshSteps] : type === 'market_refresh' && args.charge === 'refresh' ? [...DEMO_JOB.marketRefreshSteps] : [...DEMO_JOB.fullSteps],
    stepIndex: 0,
    stepDurationMs: stepMs,
    attempt: 1,
    startedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    finishedAt: null,
    error: null,
    createdBy: userId,
    requestedBy: [userId],
    resultAnalysisId: null,
    resultSnapshotId: null,
    simulatedFailure,
    ...(type === 'market_refresh' ? { charges: { [userId]: args.charge ?? 'new_analysis' } } : {}),
  };
  draft.jobs.push(job);
  return job;
}

function addUsage(draft: DbState, e: Omit<UsageEvent, 'id'>): void {
  // Idempotensnøkkel: samme hendelse registreres aldri to ganger.
  if (draft.usageEvents.some((u) => u.idempotencyKey === e.idempotencyKey)) return;
  draft.usageEvents.push({ id: uuid(), ...e });
}

export function recordReuse(draft: DbState, userId: string, analysis: SharedAnalysis, now: Date): void {
  addUsage(draft, {
    userId,
    kind: 'reuse',
    propertyId: analysis.propertyId,
    jobId: null,
    analysisId: analysis.id,
    idempotencyKey: `reuse:${userId}:${analysis.id}`,
    chargeable: false,
    createdAt: now.toISOString(),
  });
}

/**
 * Kjører (mock)agenten og gjør resultatet om til intern modell via agentkontrakten.
 * Kontraktsbrudd gir en feilet jobb – aldri en delvis publisering.
 */
function generateResult(draft: DbState, job: AnalysisJob, now: Date) {
  const version = job.targetAnalysisVersion ?? 1;
  const raw: unknown = mockAgentRun(job.finnId, now, version, `job:${job.id}:${job.attempt}`);
  if (job.simulatedFailure?.mode === 'invalid_result' && job.simulatedFailure.attempt === job.attempt) {
    const broken = raw as { assessment: { summary: string }; checklist: unknown[] };
    broken.assessment.summary = '';
    broken.checklist = broken.checklist.slice(0, 3);
  }
  const parsed = parseAgentOutput(raw);
  if (!parsed.ok) return { ok: false as const, fields: parsed.issues.map((i) => i.path) };
  const prevSnap = latestSnapshot(draft, job.propertyId);
  const adapted = adaptAgentOutput(parsed.value, {
    propertyId: job.propertyId,
    analysisId: uuid(),
    snapshotId: uuid(),
    snapshotVersion: (prevSnap?.version ?? 0) + 1,
    version,
    now,
    origin: SEED_PROPERTIES.some((x) => x.finnId === job.finnId) ? 'demo' : 'synthetic',
  });
  if (version > 1) adapted.analysis.recommendationRationale = `Reanalyse (v${version}): ${adapted.analysis.recommendationRationale}`;
  const check = validateForPublish(adapted.analysis);
  if (!check.ok) return { ok: false as const, fields: check.fields };
  return { ok: true as const, ...adapted };
}

function failJob(job: AnalysisJob, now: Date, code: string, message: string) {
  job.status = 'failed';
  job.error = { code, message };
  job.finishedAt = now.toISOString();
  job.updatedAt = now.toISOString();
}

/**
 * Publiserer en full analyse atomisk: validerer først hele resultatet, og gjør så alle
 * endringer (snapshot, analyse, tidligere versjon → superseded, visninger, brukertilknytning,
 * forbruk, jobbstatus) uten mulighet for delvis skriving. Feiler valideringen, merkes bare
 * jobben som feilet – eksisterende gyldig analyse berøres ikke.
 */
function publishFull(draft: DbState, job: AnalysisJob, now: Date): void {
  const result = generateResult(draft, job, now);
  if (!result.ok) {
    const fields = [...new Set(result.fields)].slice(0, 4).join(', ');
    failJob(job, now, 'validation_failed', `Analysen besto ikke kvalitetskontrollen (${fields}) og ble ikke publisert. Eventuell tidligere analyse er uendret.`);
    return;
  }
  const { propertyPatch, snapshot, viewings, analysis } = result;

  // ---- fra her: ingen kast, bare skriving ----
  const property = draft.properties.find((p) => p.id === job.propertyId);
  if (property && property.dataOrigin === 'import') {
    Object.assign(property, { ...propertyPatch, dataOrigin: analysis.origin === 'agent' ? 'source' : analysis.origin === 'synthetic' ? 'synthetic' : 'demo' });
  }
  for (const a of draft.analyses) {
    if (a.propertyId === job.propertyId && a.visibility === 'shared' && a.status === 'published') a.status = 'superseded';
  }
  draft.snapshots.push(snapshot);
  draft.analyses.push(analysis);
  const existingViewingIds = new Set(draft.viewings.map((v) => v.id));
  const hasViewings = draft.viewings.some((v) => v.propertyId === job.propertyId);
  if (!hasViewings) {
    for (const v of viewings) {
      if (!existingViewingIds.has(v.id)) draft.viewings.push(v);
    }
  }
  job.status = 'succeeded';
  job.stepIndex = job.steps.length;
  job.resultAnalysisId = analysis.id;
  job.resultSnapshotId = snapshot.id;
  job.finishedAt = now.toISOString();
  job.updatedAt = now.toISOString();
  job.error = null;
  // Signalene om endret teknisk grunnlag er behandlet av den nye tekniske analysen.
  if (draft.demo.technicalChangeSignals) delete draft.demo.technicalChangeSignals[job.finnId];

  // Scenarioer som peker på en analyse som ikke finnes lenger (f.eks. etter skadet lokal lagring)
  // flyttes til den nye analysen. Verdiene beholdes.
  const knownAnalysisIds = new Set(draft.analyses.map((a) => a.id));
  for (const sc of draft.scenarios) {
    if (sc.propertyId === job.propertyId && !knownAnalysisIds.has(sc.analysisId)) {
      sc.analysisId = analysis.id;
      sc.analysisVersion = analysis.version;
    }
  }
  // Alle som har bedt om analysen belastes for en ny analyse – uavhengig av hverandre.
  for (const userId of job.requestedBy) {
    const link = ensureLink(draft, userId, job.propertyId, now);
    link.analyzedAt = now.toISOString();
    ensureDefaultScenario(draft, userId, job.propertyId, analysis, now);
    addUsage(draft, {
      userId,
      kind: 'new_analysis',
      propertyId: job.propertyId,
      jobId: job.id,
      analysisId: analysis.id,
      idempotencyKey: userId === job.createdBy ? `new_analysis:${job.dedupeKey}` : `new_analysis:${job.dedupeKey}:${userId}`,
      chargeable: true,
      createdAt: now.toISOString(),
    });
  }
}

/** Trenger annonseopplysningene oppfriskning før brukeren får analysen? Eldre enn ett døgn, eller en visning har vært siden sist. */
export function needsRefresh(draft: Readonly<DbState>, propertyId: string, now: Date): boolean {
  const snap = latestSnapshot(draft, propertyId);
  if (!snap) return false;
  const observed = Date.parse(snap.observedAt);
  if (now.getTime() - observed > FRESHNESS.volatileMaxAgeHours * 3_600_000) return true;
  return draft.viewings.some((v) => v.propertyId === propertyId && v.status !== 'avlyst' && Date.parse(v.start) > observed && Date.parse(v.start) <= now.getTime());
}

/**
 * Brukerens egen analyse av en bolig som allerede er analysert. Er opplysningene gamle eller har en visning vært,
 * oppdateres pris, visninger og salgsstatus først. Brukeren får samme dato, samme visning og samme belastning
 * som ved en helt ny analyse, uavhengig av hva andre har gjort.
 */
function publishLinked(draft: DbState, job: AnalysisJob, now: Date): void {
  const analysis = latestSharedAnalysis(draft, job.propertyId);
  if (!analysis) {
    failJob(job, now, 'no_analysis', 'Fant ikke analysegrunnlaget.');
    return;
  }
  if (needsRefresh(draft, job.propertyId, now)) {
    const snap = applyRefresh(draft, job, now);
    if (!snap) return;
  }
  job.status = 'succeeded';
  job.stepIndex = job.steps.length;
  job.resultAnalysisId = analysis.id;
  job.finishedAt = now.toISOString();
  job.updatedAt = now.toISOString();
  job.error = null;
  const userId = job.createdBy;
  const link = ensureLink(draft, userId, job.propertyId, now);
  link.analyzedAt = now.toISOString();
  ensureDefaultScenario(draft, userId, job.propertyId, analysis, now);
  addUsage(draft, {
    userId,
    kind: 'new_analysis',
    propertyId: job.propertyId,
    jobId: job.id,
    analysisId: analysis.id,
    idempotencyKey: `new_analysis:${job.dedupeKey}`,
    chargeable: true,
    createdAt: now.toISOString(),
  });
}

/** Oppdaterer pris, visninger og salgsstatus (ny annonseversjon). Returnerer null og feiler jobben hvis grunnlag mangler. */
function applyRefresh(draft: DbState, job: AnalysisJob, now: Date) {
  const prev = latestSnapshot(draft, job.propertyId);
  if (!prev) {
    failJob(job, now, 'no_snapshot', 'Fant ikke annonsegrunnlag å oppdatere.');
    return null;
  }
  const script = draft.demo.refreshScripts[job.propertyId];
  const snapshot = {
    ...prev,
    id: uuid(),
    version: prev.version + 1,
    observedAt: now.toISOString(),
    fetchedAt: now.toISOString(),
  };
  const todayKey = localDateKey(now);
  if (script && !script.applied) {
    if (script.askingPrice !== undefined) snapshot.askingPrice = script.askingPrice;
    if (script.saleStatus) snapshot.saleStatus = script.saleStatus;
    if (script.saleStatusNote !== undefined) snapshot.saleStatusNote = script.saleStatusNote;
    for (const id of script.cancelViewingIds ?? []) {
      const v = draft.viewings.find((x) => x.id === id);
      if (v) {
        v.status = 'avlyst';
        v.note = 'Avlyst ifølge annonsen (oppdatert)';
        v.verifiedAt = now.toISOString();
      }
    }
    (script.addViewings ?? []).forEach((nv, i) => {
      const dayKey = addDaysToKey(todayKey, nv.offsetDays);
      const start = osloAt(dayKey, nv.hour, nv.minute);
      const id = deterministicUuid(`viewing:${job.finnId}:refresh:${snapshot.version}:${i}`);
      if (draft.viewings.some((v) => v.id === id)) return;
      const replaced = script.cancelViewingIds?.[i] ?? null;
      const v: Viewing = {
        id,
        propertyId: job.propertyId,
        kind: 'official',
        start: start.toISOString(),
        end: new Date(start.getTime() + nv.durationMin * 60_000).toISOString(),
        status: 'planlagt',
        sourceId: null,
        sourceLabel: 'Demodata – fiktivt objekt: annonsert visning (oppdatert)',
        verifiedAt: now.toISOString(),
        replacesViewingId: replaced,
        note: replaced ? 'Erstatter avlyst visning' : 'Ny visning i annonsen',
      };
      draft.viewings.push(v);
    });
    script.applied = true;
  }
  for (const v of draft.viewings) if (v.propertyId === job.propertyId && v.status !== 'avlyst') v.verifiedAt = now.toISOString();
  draft.snapshots.push(snapshot);
  job.resultSnapshotId = snapshot.id;
  return snapshot;
}

/** Lett oppfrisking: ny versjon av volatile annonsefakta og visninger. Ingen ny grunnanalyse. */
function publishRefresh(draft: DbState, job: AnalysisJob, now: Date): void {
  if (!applyRefresh(draft, job, now)) return;
  job.status = 'succeeded';
  job.stepIndex = job.steps.length;
  job.finishedAt = now.toISOString();
  job.updatedAt = now.toISOString();
  addUsage(draft, {
    userId: job.createdBy,
    kind: 'refresh',
    propertyId: job.propertyId,
    jobId: job.id,
    analysisId: latestSharedAnalysis(draft, job.propertyId)?.id ?? null,
    idempotencyKey: `refresh:${job.id}`,
    chargeable: true,
    createdAt: now.toISOString(),
  });
}

/**
 * Grundig markedsoppfriskning av en analyse som er eldre enn grensen. Teknisk grunnlag (dokumenter, juridisk, oppussingsbehov,
 * risiko, scenarioer og tiltak) tas over uendret fra forrige versjon – det leses ikke på nytt og det lages ikke nye scenarioer.
 * Annonseopplysninger (pris, visninger, salgsstatus) oppdateres, og en ny analyseversjon med ny analysedato publiseres. Fordi
 * salgsverdien per scenario regnes av koden ut fra referansene per analysedato, gir den nye datoen nye vekter (alder), og
 * økonomimotoren regner på nytt når brukeren åpner scenarioet.
 *
 * Demoen har ingen ekte markedskilde: referanser og områdeprofil er uendret, og det sies tydelig i analysen.
 */
function publishMarketRefresh(draft: DbState, job: AnalysisJob, now: Date): void {
  const prev = latestSharedAnalysis(draft, job.propertyId);
  if (!prev) {
    failJob(job, now, 'no_analysis', 'Fant ikke analysegrunnlaget som skulle oppfriskes.');
    return;
  }
  const snapshot = applyRefresh(draft, job, now);
  if (!snapshot) return;
  const nowIso = now.toISOString();
  const next: SharedAnalysis = structuredClone(prev);
  next.id = uuid();
  next.version = prev.version + 1;
  next.snapshotId = snapshot.id;
  next.status = 'published';
  next.analysisKind = 'market_refresh';
  next.derivedFromVersion = prev.version;
  next.modelVersion = CALC_MODEL_VERSION;
  next.createdAt = nowIso;
  next.publishedAt = nowIso;
  next.assumptions = [
    `Markedsoppfriskning ${localDateKey(now)} (v${next.version}): pris, visninger og salgsstatus er oppdatert, og salgsverdi per scenario er regnet på nytt per ny dato. Det tekniske grunnlaget er uendret fra v${prev.version} og er ikke lest på nytt.`,
    ...next.assumptions.filter((a) => !a.startsWith('Markedsoppfriskning ')),
  ];
  const check = validateForPublish(next);
  if (!check.ok) {
    failJob(job, now, 'validation_failed', `Markedsoppfriskningen besto ikke kvalitetskontrollen (${check.fields.slice(0, 4).join(', ')}) og ble ikke publisert. Tidligere analyse er uendret.`);
    return;
  }

  // ---- fra her: ingen kast, bare skriving ----
  prev.status = 'superseded';
  draft.analyses.push(next);
  job.status = 'succeeded';
  job.stepIndex = job.steps.length;
  job.resultAnalysisId = next.id;
  job.finishedAt = nowIso;
  job.updatedAt = nowIso;
  job.error = null;
  for (const userId of job.requestedBy) {
    const link = ensureLink(draft, userId, job.propertyId, now);
    link.analyzedAt = nowIso;
    ensureDefaultScenario(draft, userId, job.propertyId, next, now);
    const kind = job.charges?.[userId] ?? 'new_analysis';
    addUsage(draft, {
      userId,
      kind,
      propertyId: job.propertyId,
      jobId: job.id,
      analysisId: next.id,
      idempotencyKey: userId === job.createdBy ? `${kind}:${job.dedupeKey}` : `${kind}:${job.dedupeKey}:${userId}`,
      chargeable: true,
      createdAt: nowIso,
    });
  }
}

/** Flytter alle aktive jobber frem basert på tid. Returnerer true hvis noe endret seg. */
export function advanceJobs(draft: DbState, now: Date): boolean {
  let changed = false;
  for (const job of draft.jobs) {
    if (job.status !== 'running' && job.status !== 'queued') continue;
    const elapsed = now.getTime() - Date.parse(job.startedAt);
    const step = job.stepDurationMs <= 0 ? job.steps.length : Math.min(job.steps.length, Math.floor(elapsed / job.stepDurationMs));
    const f = job.simulatedFailure;
    if (f && f.attempt === job.attempt && f.mode === 'fetch_error' && step >= f.atStep) {
      job.stepIndex = f.atStep;
      failJob(
        job,
        now,
        'source_unavailable',
        f.atStep <= 1
          ? 'Annonsen kunne ikke hentes (simulert feil). Ingen analyse er belastet.'
          : `Steget «${job.steps[f.atStep]}» feilet (simulert feil). Ingen analyse er belastet, og eventuell tidligere analyse er uendret.`,
      );
      changed = true;
      continue;
    }
    if (step !== job.stepIndex) {
      job.stepIndex = step;
      job.updatedAt = now.toISOString();
      changed = true;
    }
    if (step >= job.steps.length) {
      if (job.type === 'full_analysis') publishFull(draft, job, now);
      else if (job.type === 'linked_analysis') publishLinked(draft, job, now);
      else if (job.type === 'market_refresh') publishMarketRefresh(draft, job, now);
      else publishRefresh(draft, job, now);
      changed = true;
    }
  }
  return changed;
}

export function hasActiveJobs(s: Readonly<DbState>): boolean {
  return s.jobs.some((j) => j.status === 'running' || j.status === 'queued');
}
