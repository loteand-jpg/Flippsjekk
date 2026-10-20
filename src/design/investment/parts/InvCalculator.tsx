import { ArrowRight } from 'lucide-react';
import { useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import { MAX_BID_LIMIT_LABEL, recommendedBidOf } from '../../../calc/engine';
import { VALUE_ORIGIN_LABEL } from '../../../calc/scenario';
import { Results, money, pct, useField } from '../../../components/analysis/CalculatorTab';
import type { PropertyContext } from '../../../components/analysis/shared';
import { Field, Segmented, Select, Switch } from '../../../components/ui/forms';
import { Alert } from '../../../components/ui/primitives';
import { BUYER_TYPE_LABEL, DUTY_BASES, DUTY_BASIS_LABEL, LABOR_CATEGORIES, LABOR_CATEGORY_LABEL, PRICE_BASIS_LABEL, WORK_MODE_LABEL, WORK_MODES, isRegulatedLabor, type DutyBasis, type WorkMode } from '../../../domain/enums';
import { formatHours, formatMonths, formatNOK, formatPct } from '../../../lib/format';
import { equityLine, floorToThousand, hourlyLine, maxBidLine, profitTone } from '../../shared/present';
import { CountUp } from '../CountUp';
import { Fig, TONE_TEXT_DARK } from '../ui';
import { InvGroup, InvNumberField } from './InvField';
import { signedNOK } from '../model/format';

const originOf = (ctx: PropertyContext, key: keyof PropertyContext['draft']) => (ctx.base?.origins[key] ? VALUE_ORIGIN_LABEL[ctx.base.origins[key]!] : undefined);

/** Levende resultat: alt som følger av forutsetningene, oppdatert (og animert) mens du endrer dem. */
function LiveResult({ ctx, compact }: { ctx: PropertyContext; compact?: boolean }) {
  const ev = ctx.result.evaluation;
  const b = ev.base;
  const bb = ctx.baseResult?.evaluation.base ?? null;
  const bid = recommendedBidOf(ev);
  const [, setParams] = useSearchParams();
  if (!b) {
    return (
      <Alert tone={ev.status === 'invalid' ? 'danger' : 'warning'} title={ev.status === 'invalid' ? 'Kalkylen har ugyldige verdier' : 'Kalkylen er ufullstendig'}>
        <ul className="list-disc pl-4">
          {(ev.status === 'invalid' ? ev.errors.map((e) => e.message) : ctx.result.missing.map((m) => m.label)).map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p>Ukjent er ikke det samme som 0 kr, så ingen fortjeneste vises.</p>
      </Alert>
    );
  }
  const hourly = hourlyLine(b);
  const equity = equityLine(b);
  const diff = bb ? b.profit - bb.profit : null;
  const floorBid = bid.price === null ? null : floorToThousand(bid.price);
  const line = (label: string, value: string, opts?: { strong?: boolean; sub?: string; tone?: 'neg' | 'warn' | 'pos' }) => (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-[13px]">
      <dt className={opts?.strong ? 'font-semibold' : 'text-slate-300'}>
        {label}
        {opts?.sub && <span className="block text-[11px] font-normal text-slate-300">{opts.sub}</span>}
      </dt>
      <dd className={`inv-fig text-right ${opts?.strong ? 'font-semibold' : ''} ${opts?.tone ? TONE_TEXT_DARK[opts.tone] : ''}`}>{value}</dd>
    </div>
  );
  return (
    <div className="inv-dark rounded-xl p-4 sm:p-5" data-testid="inv-calc-result">
      <div className="grid grid-cols-2 gap-4">
        <div className="min-w-0">
          <p className="inv-label">Forventet fortjeneste</p>
          <p className={`mt-1 text-[1.75rem] leading-none font-bold ${TONE_TEXT_DARK[profitTone(b.profit)]}`}>
            <CountUp value={b.profit} format={formatNOK} className="inv-fig" testId="inv-calc-profit" />
          </p>
          <p className="inv-muted-d mt-1 text-xs">
            {formatPct(b.projectReturn)} avkastning
            {diff !== null && diff !== 0 ? ` · ${signedNOK(diff)} mot grunnanalysen` : ''}
          </p>
        </div>
        <div className="min-w-0">
          <p className="inv-label">Anbefalt maksbud</p>
          <p className="mt-1 text-[1.75rem] leading-none font-bold">
            {floorBid === null ? <span className="text-base font-medium text-slate-300">{bid.status === 'none' ? 'Ingen pris' : 'Ikke beregnet'}</span> : <CountUp value={floorBid} format={formatNOK} className="inv-fig" testId="inv-calc-maxbid" />}
          </p>
          <p className="inv-muted-d mt-1 text-xs">{bid.limitedBy ? `Begrenset av ${MAX_BID_LIMIT_LABEL[bid.limitedBy].toLowerCase()}` : 'Ingen grense satt'}</p>
        </div>
      </div>
      {!compact && (
        <>
          <dl className="mt-4 divide-y divide-white/10 border-t border-white/10">
            {line('Kjøpspris', formatNOK(b.P))}
            {line('Kjøpskostnader', formatNOK(b.K), { sub: 'Dokumentavgift og gebyrer – dekkes av egenkapital' })}
            {line('Oppussing inkl. reserve', formatNOK(b.RB))}
            {line('Renter', formatNOK(b.I), { sub: `Lån ${formatNOK(b.loanPeak)} (kjøp ${formatNOK(b.purchaseLoan)}, oppussing ${formatNOK(b.renovationLoan)})` })}
            {line('Drift', formatNOK(b.O))}
            {line('Salgskostnader', formatNOK(b.Csale))}
            {line('Total kostnad', formatNOK(b.C), { strong: true })}
            {line('Salgsverdi', formatNOK(b.V), { sub: b.basis === 'total' ? 'Totalpris inkl. fellesgjeld' : 'Kontantpris' })}
          </dl>
          <dl className="mt-1 divide-y divide-white/10 border-t border-white/20">
            {line('Per egeninnsatstime', hourly.value, { sub: hourly.sub, tone: hourly.tone === 'warn' ? 'warn' : undefined })}
            {line('Egenkapitalbehov', equity.value, { sub: equity.sub, tone: equity.tone === 'neg' ? 'neg' : undefined })}
          </dl>
          <p className="inv-muted-d mt-3 text-xs">{maxBidLine({ limitedBy: bid.limitedBy, profitTarget: ctx.draft.profitTarget, minPerHour: ctx.draft.minProfitPerOwnHour })}</p>
          {ctx.result.warnings.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-[var(--inv-warn-d)]">
              {ctx.result.warnings.map((w) => (
                <li key={w.message}>{w.message}</li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => setParams((p) => { p.set('fane', 'oppussing'); return p; }, { replace: true })}
            className="mt-4 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-cyan-200 hover:underline"
          >
            Rediger oppussingstiltak <ArrowRight className="size-4" aria-hidden />
          </button>
        </>
      )}
    </div>
  );
}

/** Kalkyle i Investment: forutsetninger som sammenleggbare grupper til venstre, levende resultat (sticky) til høyre – og som stripe på mobil. */
export function InvCalculator({ ctx }: { ctx: PropertyContext }) {
  const f = useField(ctx);
  const d = ctx.draft;
  const b = ctx.result.evaluation.base;
  const reno = ctx.result.renovation;
  const resultRef = useRef<HTMLDivElement | null>(null);
  const asking = ctx.item.snapshot?.askingPrice ?? ctx.base?.values.purchasePrice ?? d.purchasePrice ?? 0;
  const sliderFor = (center: number | null, spread = 0.3, step = 10_000) => (center ? { min: Math.round((center * (1 - spread)) / step) * step, max: Math.round((center * (1 + spread)) / step) * step, step } : undefined);
  const rule = ctx.analysis.estimates.dutyRule;
  const withOrigin = (key: Parameters<typeof f>[0]) => ({ ...f(key), origin: originOf(ctx, key) });
  const sum = {
    kjop: b ? `Kjøpspris ${formatNOK(b.P)} · kjøpskostnader ${formatNOK(b.K)}` : undefined,
    oppussing: b ? `Oppussing ${formatNOK(b.RB)} inkl. reserve · ${formatHours(b.ownHours)} egne timer` : undefined,
    finans: b ? `Lån ${formatNOK(b.loanPeak)} · egenkapitalbehov ${formatNOK(b.equityNeed)}` : undefined,
    salg: b ? `Salgsverdi ${formatNOK(b.V)} · ${formatMonths(b.months)}` : undefined,
    mal: d.profitTarget === null ? undefined : `Fortjenestemål ${formatNOK(d.profitTarget)}`,
  };

  return (
    <div className="space-y-5">
      {ctx.locked ? (
        <Alert tone="info" title="Låst scenario">
          Dette er nettsidens vurdering og kan ikke redigeres. Bruk «Lagre som nytt» for å lage din egen versjon.
        </Alert>
      ) : (
        !ctx.editable && (
          <Alert tone="warning" title="Lesemodus">
            Abonnementet gir ikke tilgang til å endre og lagre scenarioer nå. Lagrede verdier vises uendret.
          </Alert>
        )
      )}
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Kalkyle</h2>
        <p className="text-sm text-slate-600">Forutsetninger i ditt private scenario. Hvert felt viser hvor verdien kommer fra, og kan tilbakestilles til grunnlaget i analysen. Resultatet oppdateres mens du endrer.</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <fieldset disabled={!ctx.editable} className="min-w-0 space-y-3">
          <legend className="sr-only">Forutsetninger i mitt scenario</legend>

          <InvGroup id="g-kjop" summary={sum.kjop} n={1} title="Kjøp" sub="Kontant kjøpesum og kostnadene som kommer i tillegg.">
            <div className="grid gap-4 sm:grid-cols-2">
              <InvNumberField label="Kjøpspris (kontant)" unit="kr" formatBase={money} slider={sliderFor(asking, 0.25)} {...withOrigin('purchasePrice')} hint="Uten fellesgjeld og kjøpskostnader." />
              <InvNumberField label="Fellesgjeld ved kjøp" unit="kr" formatBase={money} {...withOrigin('debtAtPurchase')} hint="Inngår i kapitalgrunnlaget, ikke i kontantkjøpet." />
              <Field label="Grunnlag for dokumentavgift" hint={rule.note}>
                {(p) => (
                  <Select {...p} value={d.dutyBasis} disabled={!ctx.editable} onChange={(e) => ctx.setDraft((x) => ({ ...x, dutyBasis: e.target.value as DutyBasis }))}>
                    {DUTY_BASES.map((k) => (
                      <option key={k} value={k}>
                        {DUTY_BASIS_LABEL[k]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              {d.dutyBasis !== 'ingen' && <InvNumberField label="Dokumentavgift" unit="%" decimals={2} formatBase={pct} {...withOrigin('dutyPct')} hint={b ? `Grunnlag ${formatNOK(b.dutyBase)} → avgift ${formatNOK(b.duty)}` : undefined} />}
              {d.dutyBasis === 'egendefinert' && <InvNumberField label="Eget avgiftsgrunnlag" unit="kr" formatBase={money} {...withOrigin('dutyCustomBase')} />}
              <InvNumberField label="Øvrige kjøpsgebyrer" unit="kr" formatBase={money} {...withOrigin('buyFees')} hint="Tinglysing, attester o.l." />
              <div className="sm:col-span-2">
                <p className="mb-1 text-sm font-medium text-slate-800">Kjøpertype</p>
                <Segmented
                  label="Kjøpertype"
                  value={d.buyerType}
                  disabled={!ctx.editable}
                  onChange={(v) => ctx.setDraft((x) => ({ ...x, buyerType: v }))}
                  options={[
                    { value: 'privat', label: BUYER_TYPE_LABEL.privat },
                    { value: 'as', label: BUYER_TYPE_LABEL.as },
                  ]}
                />
                <p className="mt-1 text-xs text-slate-600">Kjøpertype endrer ikke skattebehandlingen, og mva. trekkes ikke automatisk fra for AS.</p>
              </div>
            </div>
          </InvGroup>

          <InvGroup id="g-oppussing" summary={sum.oppussing} n={2} title="Oppussing" sub="Tiltak, materialer, arbeid og egeninnsats. Tiltakene redigeres under fanen «Oppussing».">
            <dl className="mb-4 grid grid-cols-2 gap-x-6 rounded-lg border border-[var(--inv-line)] bg-[var(--inv-surface-muted)] px-4 py-1 sm:grid-cols-4">
              {[
                ['Tiltak', d.renovationMode === 'tiltak' ? `${reno.includedCount} av ${d.renovationItems.length}` : 'Rundsum'],
                ['Før reserve', reno.total === null ? 'Ikke avklart' : formatNOK(reno.total)],
                ['Materialer', d.renovationMode === 'tiltak' ? formatNOK(reno.byCategory.materials) : '–'],
                ['Innleid arbeid', d.renovationMode === 'tiltak' ? formatNOK(reno.byCategory.hiredLabor + reno.byCategory.electrician + reno.byCategory.plumber + reno.byCategory.other) : '–'],
              ].map(([l, v]) => (
                <div key={l} className="py-2.5">
                  <dt className="inv-label">{l}</dt>
                  <dd className="inv-fig mt-0.5 text-sm font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="grid gap-4 sm:grid-cols-2">
              {d.renovationMode === 'rundsum' && (
                <InvNumberField label="Oppussing (rundsum)" unit="kr" formatBase={money} {...withOrigin('renovationLumpSum')} />
              )}
              <InvNumberField label="Oppussingsreserve" unit="%" decimals={0} formatBase={pct} slider={{ min: 0, max: 60, step: 1 }} {...withOrigin('reservePct')} hint={b ? `Reserve ${formatNOK(b.reserve)}` : undefined} />
              <InvNumberField
                label="Oppussingstid"
                unit="mnd"
                decimals={1}
                formatBase={(v) => formatMonths(v)}
                value={d.months === null ? null : Math.max(0, d.months - (d.settlementMonths ?? 0))}
                onChange={(v) => ctx.setDraft((x) => ({ ...x, months: v === null ? null : v + (x.settlementMonths ?? 0) }))}
                baseValue={ctx.base?.values.months == null ? undefined : Math.max(0, ctx.base.values.months - (ctx.base.values.settlementMonths ?? 0))}
                origin={originOf(ctx, 'months')}
                disabled={!ctx.editable}
                hint="Selve oppussingen, uten tiden til oppgjør."
              />
              <InvNumberField label="Egeninnsats per uke (samlet team)" unit="t/uke" formatBase={(v) => formatHours(v)} {...withOrigin('weeklyOwnHours')} />
              {d.renovationMode === 'rundsum' ? (
                <InvNumberField label="Egne timer (rundsum)" unit="t" formatBase={(v) => formatHours(v)} {...withOrigin('lumpSumHours')} />
              ) : (
                <div>
                  <p className="mb-1 text-sm font-medium text-slate-800">Egne timer</p>
                  <p className="inv-fig flex h-10 items-center justify-end rounded-lg border border-[var(--inv-line)] bg-[var(--inv-surface-muted)] px-3 text-sm">{formatHours(reno.hours)}</p>
                  <p className="mt-1 text-xs text-slate-600">Summert fra tiltakene etter arbeidsmodus.</p>
                </div>
              )}
              <div className="sm:col-span-2">
                <Switch checked={d.maxOwnWork} disabled={!ctx.editable} onChange={(v) => ctx.setDraft((x) => ({ ...x, maxOwnWork: v }))} label="Maks egeninnsats" />
                <p className="mt-1 text-xs text-slate-600">Regner alt ikke-regulert arbeid som utført selv. Rør, elektro og bad/våtrom regnes aldri som gratis automatisk.</p>
              </div>
            </div>
            <details className="mt-4 rounded-lg border border-[var(--inv-line)] bg-white">
              <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-medium">Hvem utfører arbeidet? (per kategori og kompetanse)</summary>
              <div className="border-t border-[var(--inv-line)] px-4 py-2">
                <table className="w-full text-sm">
                  <caption className="sr-only">Hvem som utfører hvilket arbeid i dette scenarioet</caption>
                  <tbody className="divide-y divide-[var(--inv-line)]">
                    {LABOR_CATEGORIES.map((c) => (
                      <tr key={c}>
                        <th scope="row" className="py-2 pr-3 text-left font-normal">
                          {LABOR_CATEGORY_LABEL[c]}
                          {isRegulatedLabor(c) && <span className="ml-2 text-[11px] text-[var(--inv-warn)]">regulert</span>}
                        </th>
                        <td className="py-2 pr-3">
                          <Select aria-label={`Hvem utfører ${LABOR_CATEGORY_LABEL[c].toLowerCase()}`} className="max-w-40" value={d.laborModes[c]} disabled={!ctx.editable} onChange={(e) => ctx.setDraft((x) => ({ ...x, laborModes: { ...x.laborModes, [c]: e.target.value as WorkMode } }))}>
                            {WORK_MODES.map((m) => (
                              <option key={m} value={m}>
                                {WORK_MODE_LABEL[m]}
                              </option>
                            ))}
                          </Select>
                        </td>
                        <td className="py-2">
                          {isRegulatedLabor(c) && (
                            <Switch
                              checked={d.regulatedCompetence[c]}
                              disabled={!ctx.editable}
                              onChange={(v) => ctx.setDraft((x) => ({ ...x, regulatedCompetence: { ...x.regulatedCompetence, [c]: v } }))}
                              label={<span className="text-xs">Relevant kompetanse/ansvar bekreftet for {LABOR_CATEGORY_LABEL[c].toLowerCase()}</span>}
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </InvGroup>

          <InvGroup id="g-finans" summary={sum.finans} n={3} title="Finansiering" sub="Forutsetninger – ikke et finansieringstilbud. Kjøpslånet gjelder kjøpesummen; kjøpskostnadene dekkes av egenkapital.">
            <div className="grid gap-4 sm:grid-cols-2">
              <InvNumberField label="Tilgjengelig egenkapital" unit="kr" formatBase={money} {...withOrigin('availableEquity')} hint="Sammenlignes med egenkapitalbehovet." />
              <InvNumberField label="Rente" unit="%" decimals={2} formatBase={pct} slider={{ min: 0, max: 15, step: 0.05 }} {...withOrigin('interestPct')} />
              <InvNumberField label="Kjøpslån (andel av kjøpesum)" unit="%" decimals={0} formatBase={pct} slider={{ min: 0, max: 100, step: 5 }} {...withOrigin('purchaseFinancingPct')} hint={b ? `Lån ${formatNOK(b.purchaseLoan)}` : undefined} />
              <InvNumberField label="Oppussingslån (andel av oppussing)" unit="%" decimals={0} formatBase={pct} slider={{ min: 0, max: 100, step: 5 }} {...withOrigin('renovationFinancingPct')} hint={b ? `Lån ${formatNOK(b.renovationLoan)} · trekkes gradvis` : 'Trekkes gradvis'} />
              <InvNumberField label="Månedlige kostnader" unit="kr" formatBase={money} {...withOrigin('monthlyCost')} hint="Felleskostnader, strøm, forsikring og kommunale avgifter." />
              <div>
                <p className="mb-1 text-sm font-medium text-slate-800">Lånefinansiere løpende utgifter</p>
                <Segmented
                  label="Lånefinansiere løpende utgifter"
                  value={d.financeRunningCosts ? 'ja' : 'nei'}
                  disabled={!ctx.editable}
                  onChange={(v) => ctx.setDraft((x) => ({ ...x, financeRunningCosts: v === 'ja' }))}
                  options={[
                    { value: 'nei', label: 'Nei' },
                    { value: 'ja', label: 'Ja' },
                  ]}
                />
                <p className="mt-1 text-xs text-slate-600">Nei: drift og renter dekkes av egenkapital.</p>
              </div>
            </div>
          </InvGroup>

          <InvGroup id="g-salg" summary={sum.salg} n={4} title="Salg" sub="Forventet salgsverdi etter oppussing er fastsatt av markedsmotoren per scenario. Du kan overstyre den privat.">
            <div className="mb-4">
              <Segmented
                label="Prisgrunnlag for salgspris"
                value={d.saleBasis}
                disabled={!ctx.editable}
                onChange={(v) => ctx.setDraft((x) => ({ ...x, saleBasis: v }))}
                options={[
                  { value: 'kontant', label: 'Kontantpris' },
                  { value: 'total', label: 'Totalpris inkl. fellesgjeld' },
                ]}
              />
              <p className="mt-1 text-xs text-slate-600">{PRICE_BASIS_LABEL[d.saleBasis]}. Bytte av grunnlag regner ikke om beløpene – kontroller dem.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <InvNumberField label="Salg lav" unit="kr" formatBase={money} {...withOrigin('saleLow')} />
              <InvNumberField label="Salg normal" unit="kr" formatBase={money} slider={sliderFor(ctx.base?.values.saleBase ?? d.saleBase, 0.2)} {...withOrigin('saleBase')} />
              <InvNumberField label="Salg høy" unit="kr" formatBase={money} {...withOrigin('saleHigh')} />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <InvNumberField label="Fellesgjeld ved salg" unit="kr" formatBase={money} {...withOrigin('debtAtSale')} hint={d.saleBasis === 'total' ? 'Trekkes fra totalprisen én gang.' : 'Påvirker ikke kalkylen ved kontantpris.'} />
              <InvNumberField label="Faste salgskostnader" unit="kr" formatBase={money} {...withOrigin('saleFixedCost')} hint="Markedsføring, takst, styling, oppgjør." />
              <InvNumberField label="Meglerprovisjon" unit="%" decimals={2} formatBase={pct} {...withOrigin('saleCommissionPct')} hint="Av kontantsalget." />
              <InvNumberField
                label="Tid til økonomisk oppgjør"
                unit="mnd"
                decimals={1}
                formatBase={(v) => formatMonths(v)}
                value={d.settlementMonths}
                onChange={(v) => ctx.setDraft((x) => ({ ...x, months: x.months === null ? null : x.months - (x.settlementMonths ?? 0) + (v ?? 0), settlementMonths: v }))}
                baseValue={ctx.base?.values.settlementMonths}
                origin={originOf(ctx, 'settlementMonths')}
                disabled={!ctx.editable}
                hint={`Total prosjektvarighet: ${formatMonths(d.months)}. Typisk 3–4 måneder.`}
              />
            </div>
          </InvGroup>

          <InvGroup id="g-mal" summary={sum.mal} n={5} title="Mål og budplan" sub="Målene dine bestemmer anbefalt maksbud. Budplanen er privat og påvirker ikke kalkylen.">
            <div className="grid gap-4 sm:grid-cols-2">
              <InvNumberField label="Fortjenestemål" unit="kr" formatBase={money} {...withOrigin('profitTarget')} hint="Gir én av maksbudgrensene." />
              <InvNumberField label="Minimum fortjeneste per egeninnsatstime" unit="kr/t" formatBase={money} {...withOrigin('minProfitPerOwnHour')} hint="Mål for kjøpsprisen – ikke en kostnad og ikke en port for scenarioet." />
              <InvNumberField label="Mitt startbud" unit="kr" formatBase={money} {...withOrigin('startBid')} />
              <InvNumberField label="Min smertegrense" unit="kr" formatBase={money} {...withOrigin('walkAway')} hint="Høyeste bud du vil gi, uansett hva modellen sier." />
            </div>
            <div className="mt-4">
              <p className="mb-1 text-sm font-medium text-slate-800">Skatteforutsetning</p>
              <Segmented
                label="Skatteforutsetning"
                value={d.taxMode}
                disabled={!ctx.editable}
                onChange={(v) => ctx.setDraft((x) => ({ ...x, taxMode: v }))}
                options={[
                  { value: 'uavklart', label: 'Uavklart' },
                  { value: 'antatt', label: 'Egen forutsetning' },
                ]}
              />
              {d.taxMode === 'antatt' && (
                <div className="mt-3 max-w-xs">
                  <InvNumberField label="Antatt skattesats" unit="%" decimals={1} formatBase={pct} {...withOrigin('taxPct')} hint="Din egen forutsetning. Ikke skatteråd." />
                </div>
              )}
            </div>
          </InvGroup>
        </fieldset>

        <aside aria-label="Resultat for mitt scenario" className="hidden lg:sticky lg:top-4 lg:block">
          <LiveResult ctx={ctx} />
        </aside>
      </div>

      {/* Mobil: fullt resultat etter forutsetningene, og en slank resultatstripe som følger med mens du ruller */}
      <div ref={resultRef} className="lg:hidden" aria-label="Resultat for mitt scenario (mobil)">
        <LiveResult ctx={ctx} />
      </div>
      <div className="sticky bottom-[3.75rem] z-20 -mx-4 lg:hidden" data-testid="inv-calc-strip">
        <button
          type="button"
          onClick={() => resultRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })}
          className="flex min-h-12 w-full items-center justify-between gap-3 bg-[var(--inv-dark)] px-4 text-left text-white shadow-[0_-6px_20px_-8px_rgba(0,0,0,0.5)]"
          aria-label="Vis fullt resultat"
        >
          <span className="min-w-0 text-xs">
            <span className="inv-muted-d block">Fortjeneste</span>
            <Fig className={`text-sm font-bold ${b ? TONE_TEXT_DARK[profitTone(b.profit)] : ''}`}>{b ? formatNOK(b.profit) : 'Ikke beregnet'}</Fig>
          </span>
          <span className="min-w-0 text-right text-xs">
            <span className="inv-muted-d block">Maksbud</span>
            <Fig className="text-sm font-bold">{(() => { const bid = recommendedBidOf(ctx.result.evaluation); return bid.price === null ? 'Ikke beregnet' : formatNOK(floorToThousand(bid.price)); })()}</Fig>
          </span>
          <ArrowRight className="size-4 shrink-0 rotate-90 text-cyan-300" aria-hidden />
        </button>
      </div>

      <details className="group rounded-xl border border-[var(--inv-line)] bg-white" data-testid="inv-calc-details">
        <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 py-3 text-base font-semibold sm:px-5">
          Detaljert kalkyle, stresstester og følsomhet
          <span className="text-xs font-normal text-slate-500 group-open:hidden">Vis</span>
          <span className="hidden text-xs font-normal text-slate-500 group-open:inline">Skjul</span>
        </summary>
        <div className="border-t border-[var(--inv-line)] p-4 sm:p-5">
          <Results ctx={ctx} />
        </div>
      </details>
      <p className="text-xs text-slate-500">
        Egen tid er ikke en kostnad. Se <Link to="?fane=rapport" className="underline">Rapport og kilder</Link> for forutsetninger og beregningsregler.
      </p>
    </div>
  );
}
