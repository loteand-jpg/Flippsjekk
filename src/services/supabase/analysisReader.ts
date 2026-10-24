import type { AnalysisJob, SharedAnalysis } from '../../domain/schemas';
import { analysisMeta } from '../shared/readModel';
import type { AnalysisMeta, AnalysisRequestResult, AnalysisService, RefreshResult } from '../types';
import { dataContext, isUuid, rowsOf, unwrap, type DataDeps } from './dataAccess';
import { notConfiguredAnalysis } from './notConfigured';
import { analysisFromRow, analysisMetaFromRow, SELECT } from './rows';

/**
 * `AnalysisService` i fase 2B: LESING av grunnanalyser (objektsiden trenger analysen til scenarioet). RLS gir bare felles publiserte/erstattede analyser
 * for boliger i brukerens liste og brukerens egne private utkast. Å BESTILLE analyse eller oppfriskning (FINN-henting, agent, jobbkø, abonnement og
 * kvote) er ikke koblet til og avvises med `not_configured`, akkurat som før. Analysejobber leses ikke (`getJob` gir null): bare backend oppretter dem,
 * og analysetjenesten finnes ikke ennå.
 */
export class SupabaseAnalysisReader implements AnalysisService {
  constructor(private readonly deps: DataDeps) {}

  async getAnalysis(analysisId: string): Promise<SharedAnalysis | null> {
    if (!isUuid(analysisId)) return null;
    const { client } = await dataContext(this.deps);
    const row = unwrap(await client.from('analyses').select(SELECT.analyses).eq('id', analysisId).maybeSingle());
    return row ? analysisFromRow(row) : null;
  }

  async getPublishedAnalysis(propertyId: string, version?: number): Promise<SharedAnalysis | null> {
    if (!isUuid(propertyId)) return null;
    const { client } = await dataContext(this.deps);
    let q = client.from('analyses').select(SELECT.analyses).eq('property_id', propertyId).eq('visibility', 'shared');
    q = version === undefined ? q.eq('status', 'published') : q.eq('version', version).neq('status', 'draft');
    const rows = rowsOf(await q.order('version', { ascending: false }).limit(1));
    return rows[0] ? analysisFromRow(rows[0]) : null;
  }

  async listVersions(propertyId: string): Promise<AnalysisMeta[]> {
    if (!isUuid(propertyId)) return [];
    const { client } = await dataContext(this.deps);
    const rows = rowsOf(await client.from('analyses').select(SELECT.analysis_meta).eq('property_id', propertyId).eq('visibility', 'shared').neq('status', 'draft').order('version', { ascending: false }));
    return rows.map(analysisMetaFromRow).map(analysisMeta);
  }

  async getJob(): Promise<AnalysisJob | null> {
    return null;
  }

  requestAnalysis(input: { url: string; idempotencyKey: string }): Promise<AnalysisRequestResult> {
    return notConfiguredAnalysis.requestAnalysis(input);
  }

  retryJob(jobId: string): Promise<AnalysisJob> {
    return notConfiguredAnalysis.retryJob(jobId);
  }

  requestRefresh(propertyId: string, kind: 'light' | 'market' | 'full', idempotencyKey: string): Promise<RefreshResult> {
    return notConfiguredAnalysis.requestRefresh(propertyId, kind, idempotencyKey);
  }
}
