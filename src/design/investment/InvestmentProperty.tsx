import { useMemo } from 'react';
import { recommendedBidOf } from '../../calc/engine';
import { OverviewTab, ReportTab } from '../../components/analysis/InfoTabs';
import { RenovationTab } from '../../components/analysis/RenovationTab';
import { activeScenarioId, applyScenarioToDraft } from '../../components/analysis/ScenarioPanel';
import { useScenarioRanking } from '../../components/analysis/ScenarioRankingPanel';
import { ViewingsTab } from '../../components/analysis/ViewingsTab';
import { TabPanel } from '../../components/ui/overlay';
import { aggregateRisk, dataQuality } from '../../domain/assessment';
import { effectiveRisks } from '../../domain/risks';
import type { PropertyTabId, PropertyViewProps } from '../../pages/PropertyPage';
import { buildDrivers } from './model/drivers';
import { useMarketFacts } from './model/useMarketFacts';
import { buildScorecard } from './model/scorecard';
import { CaseControls, CaseTitle, InvVisual } from './parts/CaseHeader';
import { CaseHero } from './parts/CaseHero';
import { CostPanel } from './parts/CostPanel';
import { Drivers } from './parts/Drivers';
import { InvCalculator } from './parts/InvCalculator';
import { InvMarket } from './parts/InvMarket';
import { InvRisk } from './parts/InvRisk';
import { InvScenarioBar } from './parts/InvScenarioBar';
import { InvTabs } from './parts/InvTabs';
import { ScenarioPanel } from './parts/ScenarioPanel';
import { Scorecard } from './parts/Scorecard';
import { Sensitivity } from './parts/Sensitivity';

const TABS: { id: PropertyTabId; label: string }[] = [
  { id: 'oversikt', label: 'Sammendrag' },
  { id: 'kalkyle', label: 'Kalkyle' },
  { id: 'marked', label: 'Marked' },
  { id: 'risiko', label: 'Risiko' },
  { id: 'oppussing', label: 'Oppussing' },
  { id: 'rapport', label: 'Rapport og kilder' },
  { id: 'visninger', label: 'Visninger og bud' },
];

/**
 * Objektside i Investment: «mulighet først». Rekkefølgen svarer på det en investor spør om først: investeringscase (maksbud, fortjeneste,
 * avkastning, kapital, tid, oppside/nedside), scorecard i seks dimensjoner, scenarioer som delta, hva som driver caset, sensitivitet mot
 * kjøpspris – og deretter modellering, marked, risiko og dokumentasjon i faner. All data, tilstand og lagring kommer fra PropertyPage;
 * alle tall kommer fra kalkylemotoren.
 */
export function InvestmentProperty(p: PropertyViewProps) {
  const { ctx, tab, setTab, alerts, notes } = p;
  const { defs, data } = useScenarioRanking(ctx);
  const activeId = activeScenarioId(ctx);
  const activeDef = defs.find((d) => d.id === activeId) ?? defs[0];
  const activeRow = data.result.rows.find((r) => r.id === activeId) ?? null;
  const recommendedRow = data.result.rows.find((r) => r.recommended) ?? null;
  const facts = useMarketFacts(ctx, activeId);
  const ev = ctx.result.evaluation;
  const bid = recommendedBidOf(ev);

  const risks = useMemo(() => effectiveRisks(ctx.analysis.risks, ctx.item.riskEdits).active, [ctx.analysis.risks, ctx.item.riskEdits]);
  const risk = useMemo(() => aggregateRisk(risks), [risks]);
  const quality = useMemo(() => dataQuality(ctx.analysis, ctx.baseSnapshot), [ctx.analysis, ctx.baseSnapshot]);

  const scorecard = useMemo(
    () =>
      buildScorecard({
        base: ev.base,
        maxBid: bid.price,
        maxBidStatus: bid.status,
        risk: { band: risk.band, score: risk.score, top: risk.top?.title ?? null },
        feasibility: activeDef?.feasibility ?? null,
        saleCertainty: activeRow?.metrics.saleCertainty ?? null,
        saleCertaintyLabel: activeRow?.metrics.saleCertaintyLabel ?? null,
      }),
    [ev.base, bid.price, bid.status, risk, activeDef, activeRow],
  );

  const drivers = useMemo(
    () =>
      buildDrivers({
        base: ev.base,
        scenario: activeDef ?? null,
        snapshotBedrooms: ctx.baseSnapshot?.bedrooms ?? ctx.item.snapshot?.bedrooms ?? null,
        marketTier: facts.res.source === 'markedsmotor' ? (facts.est?.quality.tier ?? null) : null,
        primaryReferences: facts.primaryCount,
        sameBuildingReference: facts.sameBuilding,
        risks: risks.filter((r) => r.level !== null).sort((a, b) => (b.level ?? 0) - (a.level ?? 0)),
        unknownRisks: risks.filter((r) => r.level === null).length,
        missingChecks: quality.missingChecks.length,
        maxBid: bid.price,
        maxBidStatus: bid.status,
        hourlyTarget: ctx.draft.minProfitPerOwnHour,
      }),
    [ev.base, activeDef, ctx.baseSnapshot, ctx.item.snapshot, facts.res.source, facts.est, facts.primaryCount, facts.sameBuilding, risks, quality, bid.price, bid.status, ctx.draft.minProfitPerOwnHour],
  );

  return (
    <div className="space-y-5">
      {/* Mobil: tittel → varsler → investeringscase → status og bilde (maksbudet er alltid i første skjermbilde).
          Desktop: tittel og status til venstre med bilde til høyre, så varsler og investeringscase i full bredde. */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-x-6">
        <CaseTitle p={p} className="order-1 min-w-0 lg:col-start-1 lg:row-start-1" />
        <div className="order-2 lg:order-none lg:col-span-2 lg:row-start-3 empty:hidden">{alerts}</div>
        <div className="order-3 lg:order-none lg:col-span-2 lg:row-start-4">
          <CaseHero ctx={ctx} activeTitle={activeDef?.title ?? null} recommendedTitle={recommendedRow?.title ?? null} />
        </div>
        <CaseControls p={p} className="order-4 lg:order-none lg:col-start-1 lg:row-start-2" />
        <InvVisual className="order-5 max-w-sm lg:order-none lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:max-w-none" />
      </div>
      <Scorecard dims={scorecard} />
      <ScenarioPanel ctx={ctx} defs={defs} data={data} activeId={activeId} onUse={(id) => applyScenarioToDraft(ctx, id)} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Drivers up={drivers.up} down={drivers.down} />
        <CostPanel b={ev.base} />
      </div>
      <Sensitivity ctx={ctx} />
      <InvScenarioBar p={p} />
      <div>
        <InvTabs label="Analyse" tabs={TABS} value={tab} onChange={setTab} />
        <TabPanel id={tab}>
          {tab === 'oversikt' && <OverviewTab ctx={ctx} />}
          {tab === 'kalkyle' && <InvCalculator ctx={ctx} />}
          {tab === 'marked' && <InvMarket ctx={ctx} />}
          {tab === 'risiko' && <InvRisk ctx={ctx} />}
          {tab === 'oppussing' && <RenovationTab ctx={ctx} />}
          {tab === 'rapport' && <ReportTab ctx={ctx} />}
          {tab === 'visninger' && <ViewingsTab ctx={ctx} />}
        </TabPanel>
      </div>
      {notes}
    </div>
  );
}
