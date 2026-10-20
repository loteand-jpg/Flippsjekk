import { Check, CircleDashed, Megaphone } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { CASE_LABEL } from '../../../calc/engine';
import { QUALITY_TIER_LABEL, type MarketComparable, type WeightedReference } from '../../../calc/market';
import { SALE_SOURCE_LABEL } from '../../../calc/saleValue';
import { MarketTab } from '../../../components/analysis/MarketTab';
import type { PropertyContext } from '../../../components/analysis/shared';
import { resolveForScenario, scenarioFor, useMarketComparables } from '../../../components/analysis/useMarket';
import { resolveAnalysisScenarios } from '../../../domain/analysisScenarios';
import { Select } from '../../../components/ui/forms';
import { Button } from '../../../components/ui/primitives';
import { LAYOUT_MATCH_LABEL, LOCATION_LEVEL_LABEL, REFERENCE_ROLE_LABEL, STANDARD_CLASSES, STANDARD_CLASS_LABEL, type StandardClass } from '../../../domain/enums';
import { formatDateKey, formatNOK } from '../../../lib/format';
import { Fig, Pill, SectionHeading, type FinTone } from './primitives';

const DQ_LABEL = { hoy: 'Høy', middels: 'Middels', lav: 'Lav' } as const;

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="fin-label">{label}</dt>
      <dd className="mt-0.5 text-sm break-words">{children}</dd>
    </div>
  );
}

/** Match-kvalitet som tall og stolpe (ikke bare farge). */
function MatchBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-2" role="img" aria-label={`Match ${Math.round(pct)} av 100`}>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200" aria-hidden>
        <div className="h-full rounded-full bg-pine-700" style={{ width: `${pct}%` }} />
      </div>
      <span className="fin-fig text-sm font-semibold">{Math.round(pct)}</span>
      <span className="text-xs text-slate-500">/ 100</span>
    </div>
  );
}

function ReferenceCard({ r, c, own }: { r: WeightedReference; c: MarketComparable | undefined; own: boolean }) {
  const isActive = r.role === 'markedsreferanse';
  const sold = r.kind === 'solgt';
  const price = sold ? (c?.soldPrice ?? c?.soldTotalPrice ?? null) : (c?.askingPrice ?? null);
  const kindTone: FinTone = sold ? 'pos' : r.kind === 'prisantydning' ? 'info' : 'warn';
  const KindIcon = sold ? Check : r.kind === 'prisantydning' ? Megaphone : CircleDashed;
  const stdText = c?.standardClass ? `${STANDARD_CLASS_LABEL[c.standardClass]}${r.standardGap === 0 ? ' · lik som sluttproduktet' : r.standardGap !== null ? ` · ${r.standardGap} trinn fra sluttproduktet` : ''}` : 'Ukjent';
  return (
    <li className="rounded-lg border border-[var(--fin-line)] bg-white p-4" data-testid="fin-ref">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="font-semibold break-words">
            {r.name}
            {own && <span className="ml-2 text-[11px] font-medium text-[var(--fin-info)]">din egen</span>}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5">
            <Pill tone={kindTone}>
              <KindIcon className="size-3" aria-hidden /> {sold ? 'Solgt' : r.kind === 'prisantydning' ? 'Annonsert – ikke solgt' : 'Solgt uten dokumentert sum'}
            </Pill>
            {!isActive && <Pill tone={r.usedInAnchor ? 'info' : 'neutral'}>{r.usedInAnchor ? 'Brukt i prisankeret' : 'Ikke i prisankeret'}</Pill>}
            {r.priceReduced && <Pill tone="warn">Prisnedsatt</Pill>}
            {r.daysListed !== null && r.daysListed >= 90 && <Pill tone="warn">{r.daysListed} dager ute</Pill>}
          </p>
        </div>
        <div className="text-right">
          <p className="fin-label">Match</p>
          <MatchBar value={r.physical.total} />
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 border-t border-[var(--fin-line)] pt-3 sm:grid-cols-3 lg:grid-cols-4">
        <Fact label={sold ? 'Solgt for' : r.kind === 'prisantydning' ? 'Prisantydning' : 'Pris'}>
          {price === null ? <span className="text-slate-500">Ikke dokumentert</span> : <Fig>{formatNOK(price)}</Fig>}
          <span className="block text-xs text-slate-500">{c?.date ? formatDateKey(c.date) : 'Dato ukjent'}{r.ageMonths !== null ? ` · ${Math.round(r.ageMonths)} mnd` : ''}</span>
        </Fact>
        <Fact label={isActive ? 'Pris per m² (total)' : 'Justert pris per m²'}>
          {isActive ? (
            r.askingPerM2 === null ? <span className="text-slate-500">Ikke beregnet – fellesgjeld ukjent</span> : <Fig>{formatNOK(r.askingPerM2)}</Fig>
          ) : r.adjustedTotalPerM2 === null ? (
            <span className="text-slate-500">Ikke brukbar</span>
          ) : (
            <Fig>{formatNOK(r.adjustedTotalPerM2)}</Fig>
          )}
          <span className="block text-xs text-slate-500">{isActive ? 'Signal, aldri oppnådd pris' : r.marketAdjusted ? `Markedsjustert ×${r.marketAdjustmentFactor.toLocaleString('nb-NO')}` : 'Ikke markedsjustert'}</span>
        </Fact>
        <Fact label="Standard">{stdText}</Fact>
        <Fact label="Størrelse">
          {c?.area ? `${Math.round(c.area)} m²` : 'Ukjent'}
          {r.areaDeviation !== null && <span className="block text-xs text-slate-500">{Math.round(r.areaDeviation * 100)} % avvik fra boligen</span>}
        </Fact>
        <Fact label="Soverom">{c?.bedrooms != null ? c.bedrooms : 'Ukjent'}</Fact>
        <Fact label="Lokasjon">{c?.locationLevel ? LOCATION_LEVEL_LABEL[c.locationLevel] : 'Ukjent'}</Fact>
        <Fact label="Planløsning">{c?.layoutMatch ? LAYOUT_MATCH_LABEL[c.layoutMatch] : 'Ukjent'}</Fact>
        <Fact label="Dokumentasjon">
          {c?.dataQuality ? DQ_LABEL[c.dataQuality] : 'Ukjent'}
          <span className="block text-xs text-slate-500">Pålitelighet {r.reliabilityFactor.toLocaleString('nb-NO')}{isActive ? '' : ` · vekt ${r.effectiveWeight.toLocaleString('nb-NO', { minimumFractionDigits: 2 })}`}</span>
        </Fact>
      </dl>

      <details className="mt-3 text-sm">
        <summary className="inline-flex min-h-9 cursor-pointer items-center text-pine-800 underline decoration-dotted underline-offset-2">Hvorfor er denne referansen {r.strength === 'sterk' ? 'sterk' : r.strength === 'middels' ? 'middels sterk' : 'svak'}?</summary>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs text-slate-700">
          {r.reasons.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </details>
    </li>
  );
}

function Group({ title, sub, refs, comps, ownIds, empty }: { title: string; sub: string; refs: WeightedReference[]; comps: Map<string, MarketComparable>; ownIds: Set<string>; empty: string }) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="text-base font-semibold">
          {title} <span className="fin-fig font-normal text-slate-500">({refs.length})</span>
        </h3>
        <p className="text-xs text-slate-600">{sub}</p>
      </div>
      {refs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--fin-line-strong)] px-4 py-5 text-sm text-slate-600">{empty}</p>
      ) : (
        <ul className="space-y-2.5">
          {refs.map((r) => (
            <ReferenceCard key={r.id} r={r} c={comps.get(r.id)} own={ownIds.has(r.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Marked i Finance: verdivurdering først, deretter referansene delt i primære, sekundære og aktive (ikke solgte). */
export function FinanceMarket({ ctx }: { ctx: PropertyContext }) {
  const comps = useMarketComparables(ctx);
  const defs = useMemo(() => resolveAnalysisScenarios(ctx.analysis), [ctx.analysis]);
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [standard, setStandard] = useState<StandardClass | ''>('');
  const [applied, setApplied] = useState(false);
  const def = scenarioFor(ctx, scenarioId ?? ctx.draft.analysisScenarioId);
  const res = useMemo(() => resolveForScenario({ ctx, scenario: def, values: ctx.draft, own: comps.own, standardOverride: standard || null }), [ctx, comps.own, def, standard]);
  const est = res.market!;
  const E = est.estimate;
  const byId = useMemo(() => new Map(comps.all.map((c) => [c.id, c])), [comps.all]);
  const primary = est.references.filter((r) => r.role === 'primaer');
  const secondary = est.references.filter((r) => r.role === 'sekundaer');
  const active = est.references.filter((r) => r.role === 'markedsreferanse');
  const tierTone: FinTone = est.quality.tier === 'svaert_godt' ? 'pos' : est.quality.tier === 'normalt' ? 'info' : est.quality.tier === 'svakt' ? 'warn' : 'neg';
  const apply = () => {
    if (res.source !== 'markedsmotor') return;
    ctx.setDraft((d) => ({ ...d, saleBasis: res.sale.basis, saleLow: res.sale.low, saleBase: res.sale.base, saleHigh: res.sale.high }));
    setApplied(true);
  };

  return (
    <div className="space-y-10">
      <section aria-labelledby="fin-verdi">
        <SectionHeading
          id="fin-verdi"
          title="Verdivurdering"
          sub="Salgsverdien etter oppussing er fastsatt av koden ut fra sammenlignbare salg, ikke av agenten. Aktive annonser er aldri oppnådd pris."
        />
        <div className="rounded-xl border border-[var(--fin-line)] bg-white p-5 sm:p-6">
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
            <Pill tone={tierTone}>
              {QUALITY_TIER_LABEL[est.quality.tier]} · {est.quality.score}/100
            </Pill>
            <Pill>{SALE_SOURCE_LABEL[res.source]}</Pill>
          </div>

          {E ? (
            <>
              <dl className="fin-metrics mt-4 grid grid-cols-1 gap-x-5 sm:grid-cols-3" data-testid="fin-market-values">
                {(['low', 'base', 'high'] as const).map((k) => (
                  <div key={k} className="flex min-w-0 items-baseline justify-between gap-3 py-3 sm:block">
                    <dt className="fin-label">{CASE_LABEL[k]}</dt>
                    <dd className={`fin-fig sm:mt-1 ${k === 'base' ? 'text-2xl font-semibold sm:text-3xl' : 'text-lg font-medium sm:text-xl'}`}>{formatNOK(E[k])}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs text-slate-600">
                {E.basis === 'total' ? 'Totalpris inkl. fellesgjeld' : 'Kontantpris'} · intervall ±{(est.halfWidthPct ?? 0).toLocaleString('nb-NO')} %
                {est.anchor.weightedMedianPerM2 !== null && (
                  <>
                    {' '}
                    · anker <Fig>{formatNOK(est.anchor.weightedMedianPerM2)}</Fig>/m² (vektet median av {est.anchor.used} referanser), kontroll <Fig>{formatNOK(est.anchor.weightedMeanPerM2)}</Fig>/m²
                  </>
                )}
              </p>
              {est.positioning.notes.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-slate-700">
                  {est.positioning.notes.map((n) => (
                    <li key={n} data-testid="market-positioning">
                      {n}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button size="sm" variant="secondary" className="min-h-10" disabled={!ctx.editable || res.source !== 'markedsmotor'} onClick={apply}>
                  Bruk som salgsverdi i kalkylen
                </Button>
                {applied && (
                  <span className="text-xs text-pine-800" role="status">
                    Salgsverdien er lagt inn i kalkylen (ulagret til du lagrer).
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="mt-4 rounded-lg border border-[var(--fin-warn)]/30 bg-[var(--fin-warn-bg)] p-4 text-sm text-[var(--fin-warn)]" role="status">
              <p className="font-semibold">For usikkert grunnlag – ingen salgsverdi foreslås</p>
              <p className="mt-1">{est.reason}</p>
              <p className="mt-1 text-xs">Legg inn flere faktiske, dokumenterte salg med areal, standard og lokasjon. Du kan fortsatt bruke egne salgstall i kalkylen.</p>
            </div>
          )}
          {est.quality.notes.length > 0 && (
            <ul className="mt-3 list-disc space-y-0.5 pl-5 text-xs text-slate-600">
              {est.quality.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <MarketTab ctx={ctx} sections={['saleValues']} />

      <section aria-labelledby="fin-refs" className="space-y-7">
        <SectionHeading
          id="fin-refs"
          title="Referanser"
          sub="Hvorfor hver referanse er relevant, om den er solgt eller bare annonsert, og hvor godt den matcher sluttproduktet."
        />
        <Group title={REFERENCE_ROLE_LABEL.primaer + 'r'} sub="Hovedgrunnlaget for prisankeret: faktisk solgt, lik standard og størrelse, samme soverom." refs={primary} comps={byId} ownIds={comps.ownIds} empty="Ingen referanser oppfyller kravene til primærreferanse for dette sluttproduktet." />
        <Group title={REFERENCE_ROLE_LABEL.sekundaer + 'r'} sub="Støtter vurderingen, men avviker i standard, størrelse, soverom eller dokumentasjon. Lavere vekt." refs={secondary} comps={byId} ownIds={comps.ownIds} empty="Ingen sekundærreferanser." />
        <Group title="Aktive markedsreferanser" sub="Annonsert nå – ikke solgt. Brukes aldri som oppnådd pris, men kan flytte normalverdien moderat innenfor intervallet." refs={active} comps={byId} ownIds={comps.ownIds} empty="Ingen aktive annonser i grunnlaget." />
      </section>

      <MarketTab ctx={ctx} sections={['comparables']} />
    </div>
  );
}
