import { Check, CircleDashed, Megaphone } from 'lucide-react';
import { useMemo, useState } from 'react';
import { QUALITY_TIER_LABEL, type MarketComparable, type QualityTier, type WeightedReference } from '../../../calc/market';
import { SALE_SOURCE_LABEL } from '../../../calc/saleValue';
import { MarketTab } from '../../../components/analysis/MarketTab';
import type { PropertyContext } from '../../../components/analysis/shared';
import { Select } from '../../../components/ui/forms';
import { Button } from '../../../components/ui/primitives';
import { resolveAnalysisScenarios } from '../../../domain/analysisScenarios';
import { LAYOUT_MATCH_LABEL, LOCATION_LEVEL_LABEL, STANDARD_CLASSES, STANDARD_CLASS_LABEL, type StandardClass } from '../../../domain/enums';
import { formatDateKey, formatNOK } from '../../../lib/format';
import type { Tone } from '../../shared/present';
import { OutcomeRange } from '../charts/OutcomeRange';
import { StripPlot, type StripPoint } from '../charts/StripPlot';
import { CountUp } from '../CountUp';
import { useMarketFacts } from '../model/useMarketFacts';
import { Fig, Panel, Tag } from '../ui';

const TIER_TONE = (t: QualityTier): Tone => (t === 'svaert_godt' ? 'pos' : t === 'normalt' ? 'info' : t === 'svakt' ? 'warn' : 'neg');

function MatchBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-2" role="img" aria-label={`Match ${Math.round(pct)} av 100`}>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200" aria-hidden>
        <div className="h-full rounded-full bg-pine-600" style={{ width: `${pct}%` }} />
      </div>
      <span className="inv-fig text-xs font-semibold">{Math.round(pct)}</span>
    </div>
  );
}

function RefItem({ r, c, own }: { r: WeightedReference; c: MarketComparable | undefined; own: boolean }) {
  const active = r.role === 'markedsreferanse';
  const sold = r.kind === 'solgt';
  const price = sold ? (c?.soldPrice ?? c?.soldTotalPrice ?? null) : (c?.askingPrice ?? null);
  const perM2 = active ? r.askingPerM2 : r.adjustedTotalPerM2;
  const Icon = sold ? Check : r.kind === 'prisantydning' ? Megaphone : CircleDashed;
  return (
    <li className="rounded-lg border border-[var(--inv-line)] bg-white p-3" data-testid="inv-ref">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold break-words">
            {r.name}
            {own && <span className="ml-2 text-[11px] font-medium text-[var(--inv-info)]">din egen</span>}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1">
            <Tag tone={sold ? 'pos' : r.kind === 'prisantydning' ? 'warn' : 'neutral'}>
              <Icon className="size-3" aria-hidden /> {sold ? 'Solgt' : r.kind === 'prisantydning' ? 'Annonsert – ikke faktisk salgspris' : 'Solgt uten dokumentert sum'}
            </Tag>
            {!active && <Tag tone={r.usedInAnchor ? 'info' : 'neutral'}>{r.usedInAnchor ? 'Brukt i prisankeret' : 'Ikke i prisankeret'}</Tag>}
            {r.priceReduced && <Tag tone="warn">Prisnedsatt</Tag>}
            {r.daysListed !== null && r.daysListed >= 90 && <Tag tone="warn">{r.daysListed} dager ute</Tag>}
          </p>
        </div>
        <div className="text-right">
          <p className="inv-label">Match</p>
          <MatchBar value={r.physical.total} />
        </div>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[var(--inv-line)] pt-2 text-[13px] sm:grid-cols-4">
        <div className="min-w-0">
          <dt className="inv-label">{sold ? 'Solgt for' : 'Prisantydning'}</dt>
          <dd className="mt-0.5">{price === null ? <span className="text-slate-500">Ikke dokumentert</span> : <Fig>{formatNOK(price)}</Fig>}<span className="block text-[11px] text-slate-600">{c?.date ? formatDateKey(c.date) : 'Dato ukjent'}</span></dd>
        </div>
        <div className="min-w-0">
          <dt className="inv-label">{active ? 'Pris/m² (total)' : 'Justert pris/m²'}</dt>
          <dd className="mt-0.5">{perM2 === null ? <span className="text-slate-500">Ikke brukbar</span> : <Fig>{formatNOK(perM2)}</Fig>}<span className="block text-[11px] text-slate-600">{active ? 'Signal, aldri oppnådd pris' : r.marketAdjusted ? 'Markedsjustert' : 'Ikke markedsjustert'}</span></dd>
        </div>
        <div className="min-w-0">
          <dt className="inv-label">Standard</dt>
          <dd className="mt-0.5 break-words">{c?.standardClass ? STANDARD_CLASS_LABEL[c.standardClass] : 'Ukjent'}{r.standardGap === 0 ? <span className="block text-[11px] text-slate-600">lik som sluttproduktet</span> : r.standardGap !== null ? <span className="block text-[11px] text-slate-600">{r.standardGap} trinn fra</span> : null}</dd>
        </div>
        <div className="min-w-0">
          <dt className="inv-label">Lokasjon · størrelse</dt>
          <dd className="mt-0.5">{c?.locationLevel ? LOCATION_LEVEL_LABEL[c.locationLevel] : 'Ukjent'}<span className="block text-[11px] text-slate-600">{c?.area ? `${Math.round(c.area)} m²` : 'areal ukjent'}{c?.layoutMatch ? ` · ${LAYOUT_MATCH_LABEL[c.layoutMatch].toLowerCase()}` : ''}</span></dd>
        </div>
      </dl>
      <details className="mt-1 text-sm">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-xs font-medium text-pine-700 underline decoration-dotted underline-offset-2 md:min-h-8">Hvorfor er denne referansen {r.strength === 'sterk' ? 'sterk' : r.strength === 'middels' ? 'middels sterk' : 'svak'}?</summary>
        <ul className="list-disc space-y-0.5 pb-1 pl-5 text-xs text-slate-700">
          {r.reasons.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </details>
    </li>
  );
}

function RefGroup({ title, sub, refs, byId, ownIds, empty }: { title: string; sub: string; refs: WeightedReference[]; byId: Map<string, MarketComparable>; ownIds: Set<string>; empty: string }) {
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="text-sm font-semibold">
          {title} <span className="inv-fig font-normal text-slate-500">({refs.length})</span>
        </h3>
        <p className="text-xs text-slate-600">{sub}</p>
      </div>
      {refs.length === 0 ? <p className="rounded-lg border border-dashed border-[var(--inv-line-strong)] px-3 py-3 text-sm text-slate-600">{empty}</p> : (
        <ul className="space-y-2">
          {refs.map((r) => (
            <RefItem key={r.id} r={r} c={byId.get(r.id)} own={ownIds.has(r.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Marked som analytisk research: oversikt (verdi, spenn, sikkerhet, konkurranse), referanser på en akse, og referansene med begrunnelse. */
export function InvMarket({ ctx }: { ctx: PropertyContext }) {
  const defs = useMemo(() => resolveAnalysisScenarios(ctx.analysis), [ctx.analysis]);
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [standard, setStandard] = useState<StandardClass | ''>('');
  const [applied, setApplied] = useState(false);
  const facts = useMarketFacts(ctx, scenarioId, standard || null);
  const { res, est, comps, byId } = facts;
  const def = defs.find((d) => d.id === (scenarioId ?? ctx.draft.analysisScenarioId)) ?? defs[0];
  const E = est?.estimate ?? null;
  const primary = est ? est.references.filter((r) => r.role === 'primaer') : [];
  const secondary = est ? est.references.filter((r) => r.role === 'sekundaer') : [];
  const active = est ? est.references.filter((r) => r.role === 'markedsreferanse') : [];
  const points: StripPoint[] = useMemo(() => {
    if (!est) return [];
    return est.references.flatMap((r): StripPoint[] => {
      const lane = r.role === 'primaer' ? 'primaer' : r.role === 'sekundaer' ? 'sekundaer' : 'aktiv';
      const x = lane === 'aktiv' ? r.askingPerM2 : r.adjustedTotalPerM2;
      if (x === null) return [];
      return [{ id: r.id, name: r.name, lane, x, detail: `${r.strength === 'sterk' ? 'sterk' : r.strength === 'middels' ? 'middels' : 'svak'} referanse · match ${Math.round(r.physical.total)}/100` }];
    });
  }, [est]);
  const anchor = est?.anchor.weightedMedianPerM2 ?? null;
  const band: [number, number] | null = anchor !== null && est?.halfWidthPct != null ? [anchor * (1 - est.halfWidthPct / 100), anchor * (1 + est.halfWidthPct / 100)] : null;
  const apply = () => {
    if (res.source !== 'markedsmotor') return;
    ctx.setDraft((d) => ({ ...d, saleBasis: res.sale.basis, saleLow: res.sale.low, saleBase: res.sale.base, saleHigh: res.sale.high }));
    setApplied(true);
  };
  const reduced = active.filter((r) => r.priceReduced).length;
  const adjusted = est ? est.references.filter((r) => r.marketAdjusted).length : 0;

  return (
    <div className="space-y-5">
      <Panel id="inv-marked" title="Markedsoversikt" sub="Salgsverdien etter oppussing er fastsatt av koden ut fra sammenlignbare salg, ikke av agenten. Aktive annonser er aldri oppnådd pris.">
        <div className="flex flex-wrap items-end gap-3">
          {defs.length > 1 && (
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-slate-800">Scenario</span>
              <Select aria-label="Scenario for verdivurdering" value={def.id} onChange={(e) => { setScenarioId(e.target.value); setApplied(false); }}>
                {defs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </Select>
            </label>
          )}
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-slate-800">Standard etter oppussing</span>
            <Select aria-label="Standard etter oppussing" value={standard} onChange={(e) => { setStandard(e.target.value as StandardClass | ''); setApplied(false); }}>
              <option value="">
                Fra scenarioet: {STANDARD_CLASS_LABEL[res.standardClass].toLowerCase()}
                {res.standardDocumented ? '' : ' (antatt)'}
              </option>
              {STANDARD_CLASSES.map((c) => (
                <option key={c} value={c}>
                  {STANDARD_CLASS_LABEL[c]}
                </option>
              ))}
            </Select>
          </label>
          {est && (
            <Tag tone={TIER_TONE(est.quality.tier)}>
              {QUALITY_TIER_LABEL[est.quality.tier]} · {est.quality.score}/100
            </Tag>
          )}
          <Tag>{SALE_SOURCE_LABEL[res.source]}</Tag>
        </div>

        {E && est ? (
          <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]" data-testid="inv-market-values">
            <div>
              <p className="inv-label">Normalverdi etter oppussing</p>
              <p className="mt-1 text-[2.25rem] leading-none font-bold">
                <CountUp value={E.base} format={formatNOK} className="inv-fig" testId="inv-market-base" />
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {E.basis === 'total' ? 'Totalpris inkl. fellesgjeld' : 'Kontantpris'} · intervall ±{(est.halfWidthPct ?? 0).toLocaleString('nb-NO')} %
              </p>
              <div className="mt-3">
                <OutcomeRange sale={{ low: E.low, base: E.base, high: E.high }} />
              </div>
              {est.positioning.notes.length > 0 && (
                <ul className="mt-3 list-disc space-y-0.5 pl-5 text-xs text-slate-700">
                  {est.positioning.notes.map((n) => (
                    <li key={n} data-testid="market-positioning">
                      {n}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button size="sm" variant="secondary" className="min-h-11 md:min-h-10" disabled={!ctx.editable || res.source !== 'markedsmotor'} onClick={apply}>
                  Bruk som salgsverdi i kalkylen
                </Button>
                {applied && (
                  <span className="text-xs text-pine-800" role="status">
                    Salgsverdien er lagt inn i kalkylen (ulagret til du lagrer).
                  </span>
                )}
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 self-start rounded-xl bg-slate-50 p-4 text-sm">
              <div className="min-w-0">
                <dt className="inv-label">Sikkerhet</dt>
                <dd className="mt-0.5 font-semibold">{QUALITY_TIER_LABEL[est.quality.tier]}</dd>
                <dd className="text-[11px] text-slate-600">{est.quality.goodSales} gode salg · {est.quality.score}/100</dd>
              </div>
              <div className="min-w-0">
                <dt className="inv-label">Prisanker</dt>
                <dd className="mt-0.5 font-semibold">{anchor === null ? 'Ikke beregnet' : <Fig>{formatNOK(anchor)}/m²</Fig>}</dd>
                <dd className="text-[11px] text-slate-600">Vektet median av {est.anchor.used} referanser</dd>
              </div>
              <div className="min-w-0">
                <dt className="inv-label">Konkurranse</dt>
                <dd className="mt-0.5 font-semibold">{est.activeSignals.count} {est.activeSignals.count === 1 ? 'aktiv annonse' : 'aktive annonser'}</dd>
                <dd className="text-[11px] text-slate-600">
                  {est.activeSignals.relevant} svært relevant{est.activeSignals.relevant === 1 ? '' : 'e'}{reduced > 0 ? ` · ${reduced} prisnedsatt` : ''}
                  {est.activeSignals.competingBelowAnchor ? ' · noen ligger under ankeret' : ''}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="inv-label">Markedsjustering</dt>
                <dd className="mt-0.5 font-semibold">{adjusted > 0 ? `${adjusted} referanser indeksjustert` : 'Ikke indeksjustert'}</dd>
                <dd className="text-[11px] text-slate-600">{adjusted > 0 ? 'Med markedsindeks for området' : 'Ingen markedsindeks i grunnlaget – trend vises ikke'}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-[var(--inv-warn)]/30 bg-[var(--inv-warn-bg)] p-4 text-sm text-[var(--inv-warn)]" role="status">
            <p className="font-semibold">For usikkert grunnlag – ingen salgsverdi foreslås</p>
            <p className="mt-1">{est?.reason ?? 'Markedsmotoren har ikke nok grunnlag.'}</p>
            <p className="mt-1 text-xs">Legg inn flere faktiske, dokumenterte salg med areal, standard og lokasjon. Du kan fortsatt bruke egne salgstall i kalkylen.</p>
          </div>
        )}
        {est && est.quality.notes.length > 0 && (
          <ul className="mt-3 list-disc space-y-0.5 pl-5 text-xs text-slate-600">
            {est.quality.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </Panel>

      {est && (
        <Panel id="inv-akse" title="Referanser på pris per m²" sub="Hvor målobjektets anker ligger mot primære og sekundære salg og aktive annonser. Aktive annonser er ikke faktisk salgspris.">
          <StripPlot points={points} anchor={anchor} band={band} />
        </Panel>
      )}

      {est && (
        <Panel id="inv-refs" title="Referanser" sub="Hvorfor hver referanse er relevant, om den er solgt eller bare annonsert, og hvor godt den matcher sluttproduktet.">
          <div className="space-y-6">
            <RefGroup title="Primærreferanser" sub="Hovedgrunnlaget for prisankeret: faktisk solgt, lik standard og størrelse." refs={primary} byId={byId} ownIds={comps.ownIds} empty="Ingen referanser oppfyller kravene til primærreferanse for dette sluttproduktet." />
            <RefGroup title="Sekundærreferanser" sub="Støtter vurderingen, men avviker. Lavere vekt." refs={secondary} byId={byId} ownIds={comps.ownIds} empty="Ingen sekundærreferanser." />
            <RefGroup title="Aktive markedsreferanser" sub="Annonsert nå – ikke solgt. Aldri oppnådd pris." refs={active} byId={byId} ownIds={comps.ownIds} empty="Ingen aktive annonser i grunnlaget." />
          </div>
        </Panel>
      )}

      <MarketTab ctx={ctx} sections={['saleValues']} />
      <MarketTab ctx={ctx} sections={['comparables']} />
    </div>
  );
}
