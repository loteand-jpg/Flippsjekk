import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMediaQuery } from '../../app/hooks';
import { CalculatorTab } from '../../components/analysis/CalculatorTab';
import { MarketTab } from '../../components/analysis/MarketTab';
import { OverviewTab, ReportTab, RiskTab } from '../../components/analysis/InfoTabs';
import { RenovationTab } from '../../components/analysis/RenovationTab';
import { activeScenarioId, applyScenarioToDraft } from '../../components/analysis/ScenarioPanel';
import { useScenarioRanking } from '../../components/analysis/ScenarioRankingPanel';
import { saleDebtStatuses } from '../../components/analysis/saleDebtStatus';
import { ViewingsTab } from '../../components/analysis/ViewingsTab';
import { TabPanel } from '../../components/ui/overlay';
import { aggregateRisk, dataQuality } from '../../domain/assessment';
import { effectiveRisks } from '../../domain/risks';
import { PROPERTY_TABS, type PropertyTabId, type PropertyViewProps } from '../../pages/PropertyPage';
import { buildRiskDimensions } from '../shared/riskView';
import { useMarketFacts } from '../shared/useMarketFacts';
import { useListingMedia } from './media/useListingMedia';
import { buildHomeRisks } from './model/homeRisk';
import { buildKnowledge } from './model/knowledge';
import { useVersionSales } from './model/useVersionSales';
import { buildVersions } from './model/versions';
import { buildViewingPack } from './model/viewing';
import { EconomyAside, EconomyBar } from './parts/EconomyPanel';
import { EconomySection } from './parts/EconomySection';
import { FromTo } from './parts/FromTo';
import { ObjectHero } from './parts/ObjectHero';
import { PropTabs } from './parts/PropTabs';
import { RenovationSection } from './parts/RenovationSection';
import { RiskSection } from './parts/RiskSection';
import { DirtyBar, ScenarioBar } from './parts/ScenarioBar';
import { SectionNav } from './parts/SectionNav';
import { SellSection } from './parts/SellSection';
import { VersionSection } from './parts/VersionSection';
import { ViewingSection } from './parts/ViewingSection';
import { jumpTo } from './parts/jump';
import { MarketSection } from './parts/MarketSection';
import { Section } from './ui';
import { useScrollableAccess } from './useScrollableAccess';

const TAB_LABEL: Record<PropertyTabId, string> = {
  oversikt: 'Oversikt',
  kalkyle: 'Kalkyle',
  oppussing: 'Oppussing',
  risiko: 'Risiko og sjekkliste',
  marked: 'Marked',
  rapport: 'Rapport og kilder',
  visninger: 'Visninger og bud',
};
const TABS = PROPERTY_TABS.map((t) => ({ id: t.id as PropertyTabId, label: TAB_LABEL[t.id as PropertyTabId] }));

/**
 * Objektsiden i Property: boligen først, så «Hva kan den bli?», «Hva må gjøres?» og «Er det verdt det?» – og detaljene (kalkyle, rediger oppussing,
 * risikoregister, rapport) nederst i faner. All data, tilstand og lagring kommer fra PropertyPage; alle tall kommer fra kalkylemotoren og den delte
 * scenariosammenligningen. Versjonsvelgeren er en forhåndsvisning: den endrer ikke kalkylen din før du velger «Bruk i kalkylen».
 */
export function PropertyObject(p: PropertyViewProps) {
  const { ctx, it, analysis, tab, setTab, alerts, notes } = p;
  const root = useRef<HTMLDivElement | null>(null);
  useScrollableAccess(root);
  const isWide = useMediaQuery('(min-width: 1024px)');
  const [params] = useSearchParams();

  const { defs, data } = useScenarioRanking(ctx);
  const activeId = activeScenarioId(ctx);
  const versions = useMemo(() => buildVersions({ defs, rows: data.rows, result: data.result, activeId }), [defs, data.rows, data.result, activeId]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  // Bytter brukeren kalkyle (annet scenario i «Min kalkyle»), starter visningen på nytt ved den.
  useEffect(() => setPickedId(null), [activeId]);
  const view = versions.find((v) => v.id === pickedId) ?? versions.find((v) => v.id === activeId) ?? versions[0];
  const recommended = versions.find((v) => v.recommended) ?? null;

  const media = useListingMedia(it.property.id);
  const sales = useVersionSales(ctx, versions);
  const facts = useMarketFacts(ctx, view?.id ?? null);
  const resolution = view ? (sales.get(view.id) ?? null) : null;

  const risks = useMemo(() => effectiveRisks(analysis.risks, it.riskEdits).active, [analysis.risks, it.riskEdits]);
  const risk = useMemo(() => aggregateRisk(risks), [risks]);
  const quality = useMemo(() => dataQuality(analysis, ctx.baseSnapshot), [analysis, ctx.baseSnapshot]);
  const snapshot = ctx.baseSnapshot ?? it.snapshot;

  const activeDef = defs.find((d) => d.id === activeId) ?? defs[0];
  const debtStatus = useMemo(() => saleDebtStatuses({ draft: ctx.draft, base: ctx.base, activeTitle: activeDef?.title ?? ctx.scenario.name, rows: data.rows, activeId }), [ctx.draft, ctx.base, ctx.scenario.name, activeDef, data.rows, activeId]);

  const certainty = view?.ranked?.metrics.saleCertainty ?? null;
  const certaintyBand = certainty === null ? null : certainty >= 0.7 ? 'lav' : certainty >= 0.35 ? 'middels' : 'hoy';
  const spots = useMemo(() => (view ? buildHomeRisks({ risks, scenario: view.def, saleCertaintyLabel: view.ranked?.metrics.saleCertaintyLabel ?? null, saleCertaintyBand: certaintyBand }) : []), [risks, view, certaintyBand]);
  const dims = useMemo(
    () =>
      view
        ? buildRiskDimensions({
            risks,
            scenarioRisk: view.def.risk,
            scenarioRequirements: view.def.requirements,
            scenarioFeasibilityRationale: view.def.feasibilityRationale,
            quality,
            saleCertaintyLabel: view.ranked?.metrics.saleCertaintyLabel ?? null,
            saleCertaintyBand: certaintyBand,
          })
        : [],
    [risks, view, quality, certaintyBand],
  );
  const knowledge = useMemo(() => (view ? buildKnowledge({ analysis, property: it.property, snapshot, scenario: view.def, quality, standardDocumented: resolution?.standardDocumented ?? null }) : { known: [], assumed: [], toCheck: [] }), [analysis, it.property, snapshot, view, quality, resolution]);
  const pack = useMemo(() => (view ? buildViewingPack({ risks, checklist: analysis.checklist, conditions: analysis.conditions, scenario: view.def }) : { lookFor: [], ask: [], clarify: [] }), [risks, analysis.checklist, analysis.conditions, view]);
  const nextViewing = useMemo(() => {
    const upcoming = it.viewings.filter((v) => v.status !== 'avlyst' && Date.parse(v.end ?? v.start) >= ctx.now.getTime()).sort((a, b) => a.start.localeCompare(b.start));
    return upcoming[0] ? { start: upcoming[0].start, end: upcoming[0].end } : null;
  }, [it.viewings, ctx.now]);

  // Dyp lenke med ?fane=… (f.eks. fra en annen side) åpner detaljene.
  // Siden bygges ut mens markedsdata lastes, så rulles det to ganger – men aldri om brukeren selv har begynt å rulle.
  const hadTab = useRef(params.get('fane') !== null);
  useEffect(() => {
    if (!hadTab.current) return;
    let touched = false;
    const stop = () => {
      touched = true;
    };
    for (const ev of ['wheel', 'touchstart', 'keydown']) window.addEventListener(ev, stop, { once: true, passive: true });
    // (ikke nullstilt før siste forsøk: i StrictMode kjøres effekten to ganger i utvikling)
    const timers = [80, 600].map((ms) =>
      setTimeout(() => {
        if (!touched) jumpTo('detaljer');
        if (ms === 600) hadTab.current = false;
      }, ms),
    );
    return () => {
      timers.forEach(clearTimeout);
      for (const ev of ['wheel', 'touchstart', 'keydown']) window.removeEventListener(ev, stop);
    };
  }, []);
  const openDetails = (t: PropertyTabId) => {
    setTab(t);
    setTimeout(() => jumpTo('detaljer'), 30);
  };

  if (!view) return <p className="text-sm text-slate-700">Analysen har ingen scenarioer å vise.</p>;
  const onUse = (id: string) => {
    applyScenarioToDraft(ctx, id);
    setPickedId(null);
  };
  const apply = () => onUse(view.id);

  return (
    <div ref={root} className="space-y-9 max-lg:pb-20 sm:space-y-12">
      <DirtyBar p={p} />
      <div className="space-y-5">
        <ObjectHero p={p} view={view} recommended={recommended} media={media} debtStatus={debtStatus} risk={risk} onShow={(id) => setPickedId(id)} />
        <div className="empty:hidden">{alerts}</div>
      </div>
      <SectionNav />
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20.5rem] lg:gap-10 xl:grid-cols-[minmax(0,1fr)_22rem] xl:gap-12">
        <div className="min-w-0 space-y-14 sm:space-y-16">
          <VersionSection versions={versions} view={view} onSelect={setPickedId} onUse={onUse} canApply={ctx.editable} />
          <FromTo view={view} versionResolution={resolution} property={it.property} snapshot={snapshot} risks={risks} labor={view.row.values} media={media} />
          <RenovationSection view={view} labor={view.row.values} />
          <EconomySection view={view} ctx={ctx} />
          <MarketSection view={view} facts={facts} />
          <SellSection view={view} resolution={resolution} facts={facts} />
          <RiskSection versionTitle={view.def.title} spots={spots} dims={dims} knowledge={knowledge} risks={risks} onOpenRegister={() => openDetails('risiko')} />
          <ViewingSection propertyId={it.property.id} pack={pack} nextViewing={nextViewing} media={media} onOpenViewings={() => openDetails('visninger')} />
        </div>
        {isWide && (
          <div className="min-w-0">
            <EconomyAside view={view} debtStatus={debtStatus} onUse={apply} canApply={ctx.editable} />
          </div>
        )}
      </div>
      <Section id="detaljer" eyebrow="9 · Detaljer og redigering" title="Kalkyle, oppussing og dokumentasjon" intro="Her endrer du forutsetningene, tiltakene og risikoene – privat. Endringene slår ut i alle tallene over når du har tatt versjonen i bruk.">
        <div className="space-y-4">
          <ScenarioBar p={p} />
          <PropTabs label="Detaljer" tabs={TABS} value={tab} onChange={setTab} />
          <TabPanel id={tab}>
            {tab === 'oversikt' && <OverviewTab ctx={ctx} />}
            {tab === 'kalkyle' && <CalculatorTab ctx={ctx} />}
            {tab === 'oppussing' && <RenovationTab ctx={ctx} />}
            {tab === 'risiko' && <RiskTab ctx={ctx} />}
            {tab === 'marked' && <MarketTab ctx={ctx} />}
            {tab === 'rapport' && <ReportTab ctx={ctx} />}
            {tab === 'visninger' && <ViewingsTab ctx={ctx} />}
          </TabPanel>
        </div>
      </Section>
      {notes}
      {!isWide && <EconomyBar view={view} debtStatus={debtStatus} onUse={apply} canApply={ctx.editable} />}
    </div>
  );
}
