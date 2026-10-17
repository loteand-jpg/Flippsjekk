import { SEED_PROPERTIES } from '../../data/seedProperties';
import type { MockDatabase } from '../../data/db';
import { adaptAgentOutput, parseAgentOutput, validateForPublish } from '../../domain/agentContract';
import type { Clock } from '../../lib/clock';
import { uuid } from '../../lib/ids';
import { mockAgentRun } from './mockAgent';

/**
 * En felles analyse skal aldri forsvinne så lenge objektet finnes. Hvis lokal demolagring likevel har
 * mistet analysen til et demo-/syntetisk objekt (f.eks. etter skadede eller gamle rader), bygges den
 * opp igjen automatisk fra de deterministiske demodataene. Ingen jobb, ingen belastning på kvoten.
 * Brukerens private scenarioer, notater og kalenderdata berøres ikke – scenarioer som pekte på den
 * manglende analysen flyttes til den gjenopprettede, med uendrede verdier.
 *
 * Returnerer antall objekter som ble gjenopprettet.
 */
export function healMissingAnalyses(db: MockDatabase, clock: Clock): number {
  const needsHeal = db.read((s) =>
    s.properties.filter(
      (p) =>
        (p.dataOrigin === 'demo' || p.dataOrigin === 'synthetic') &&
        !s.analyses.some((a) => a.propertyId === p.id && a.visibility === 'shared' && a.status !== 'draft') &&
        !s.jobs.some((j) => j.propertyId === p.id && (j.status === 'running' || j.status === 'queued')) &&
        (s.scenarios.some((x) => x.propertyId === p.id) || s.userProperties.some((l) => l.propertyId === p.id)),
    ).length,
  );
  if (needsHeal === 0) return 0;
  const now = clock.now();
  return db.transaction((d) => {
    let healed = 0;
    for (const p of d.properties) {
      if (p.dataOrigin !== 'demo' && p.dataOrigin !== 'synthetic') continue;
      const hasShared = d.analyses.some((a) => a.propertyId === p.id && a.visibility === 'shared' && a.status !== 'draft');
      const hasJob = d.jobs.some((j) => j.propertyId === p.id && (j.status === 'running' || j.status === 'queued'));
      const referenced = d.scenarios.some((x) => x.propertyId === p.id) || d.userProperties.some((l) => l.propertyId === p.id);
      if (hasShared || hasJob || !referenced) continue;
      const version = Math.max(1, ...d.scenarios.filter((x) => x.propertyId === p.id).map((x) => x.analysisVersion));
      const known = SEED_PROPERTIES.some((x) => x.finnId === p.finnId);
      const parsed = parseAgentOutput(mockAgentRun(p.finnId, now, version, `heal:${p.id}`));
      if (!parsed.ok) continue;
      const existing = d.snapshots.filter((x) => x.propertyId === p.id).sort((a, b) => b.version - a.version)[0];
      const adapted = adaptAgentOutput(parsed.value, {
        propertyId: p.id,
        analysisId: uuid(),
        snapshotId: existing?.id ?? uuid(),
        snapshotVersion: (existing?.version ?? 0) + 1,
        version,
        now,
        origin: known ? 'demo' : 'synthetic',
      });
      if (!validateForPublish(adapted.analysis).ok) continue;
      if (!existing) d.snapshots.push(adapted.snapshot);
      d.analyses.push(adapted.analysis);
      for (const sc of d.scenarios) {
        if (sc.propertyId === p.id && !d.analyses.some((a) => a.id === sc.analysisId)) {
          sc.analysisId = adapted.analysis.id;
          sc.analysisVersion = adapted.analysis.version;
        }
      }
      if (!d.viewings.some((v) => v.propertyId === p.id)) d.viewings.push(...adapted.viewings);
      healed++;
    }
    return healed;
  });
}
