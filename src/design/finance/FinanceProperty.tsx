import { useMemo } from 'react';
import { OverviewTab, ReportTab } from '../../components/analysis/InfoTabs';
import { RenovationTab } from '../../components/analysis/RenovationTab';
import { applyScenarioToDraft, activeScenarioId } from '../../components/analysis/ScenarioPanel';
import { useScenarioRanking } from '../../components/analysis/ScenarioRankingPanel';
import { saleDebtStatuses } from '../../components/analysis/saleDebtStatus';
import { ViewingsTab } from '../../components/analysis/ViewingsTab';
import { TabPanel } from '../../components/ui/overlay';
import type { PropertyViewProps, PropertyTabId } from '../../pages/PropertyPage';
import { DecisionPanel } from './parts/DecisionPanel';
import { FinanceCalculator } from './parts/FinanceCalculator';
import { FinanceMarket } from './parts/FinanceMarket';
import { FinanceRisk } from './parts/FinanceRisk';
import { FinanceTabs } from './parts/FinanceTabs';
import { MyScenarioBar } from './parts/MyScenarioBar';
import { PropertyHeader } from './parts/PropertyHeader';
import { ScenarioComparison } from './parts/ScenarioComparison';

const TABS: { id: PropertyTabId; label: string }[] = [
  { id: 'oversikt', label: 'Sammendrag' },
  { id: 'kalkyle', label: 'Kalkyle' },
  { id: 'oppussing', label: 'Oppussing' },
  { id: 'risiko', label: 'Risiko' },
  { id: 'marked', label: 'Marked' },
  { id: 'rapport', label: 'Rapport og kilder' },
  { id: 'visninger', label: 'Visninger og bud' },
];

/**
 * Objektside i Finance. Rekkefølgen er laget for 10–15 sekunders forståelse: resultat først (maksbud, fortjeneste, risiko, datagrunnlag),
 * så scenarioer side om side, og deretter forklaring og dokumentasjon i faner. All data, tilstand og lagring kommer fra PropertyPage.
 */
export function FinanceProperty(p: PropertyViewProps) {
  const { ctx, tab, setTab, alerts, notes } = p;
  const { defs, data } = useScenarioRanking(ctx);
  const activeId = activeScenarioId(ctx);
  const activeTitle = useMemo(() => defs.find((d) => d.id === activeId)?.title ?? null, [defs, activeId]);
  const debtStatus = useMemo(() => saleDebtStatuses({ draft: ctx.draft, base: ctx.base, activeTitle: activeTitle ?? ctx.scenario.name, rows: data.rows, activeId }), [ctx.draft, ctx.base, ctx.scenario.name, activeTitle, data.rows, activeId]);

  return (
    <div className="space-y-8">
      <PropertyHeader p={p} />
      {alerts}
      <DecisionPanel ctx={ctx} ranking={data.result} activeScenarioTitle={activeTitle} debtStatus={debtStatus} />
      <ScenarioComparison ctx={ctx} defs={defs} data={data} activeId={activeId} onUse={(id) => applyScenarioToDraft(ctx, id)} />
      <MyScenarioBar p={p} />
      <div>
        <FinanceTabs label="Analyse" tabs={TABS} value={tab} onChange={setTab} />
        <TabPanel id={tab}>
          {tab === 'oversikt' && <OverviewTab ctx={ctx} />}
          {tab === 'kalkyle' && <FinanceCalculator ctx={ctx} />}
          {tab === 'oppussing' && <RenovationTab ctx={ctx} />}
          {tab === 'risiko' && <FinanceRisk ctx={ctx} />}
          {tab === 'marked' && <FinanceMarket ctx={ctx} />}
          {tab === 'rapport' && <ReportTab ctx={ctx} />}
          {tab === 'visninger' && <ViewingsTab ctx={ctx} />}
        </TabPanel>
      </div>
      {notes}
    </div>
  );
}
