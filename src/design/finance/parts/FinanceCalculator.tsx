import { ArrowRight } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { MAX_BID_LIMIT_LABEL, recommendedBidOf } from '../../../calc/engine';
import { VALUE_ORIGIN_LABEL } from '../../../calc/scenario';
import { Results, money, pct, useField } from '../../../components/analysis/CalculatorTab';
import type { PropertyContext } from '../../../components/analysis/shared';
import { saleDebtHelp } from '../../../components/analysis/saleDebtStatus';
import { Field, Segmented, Select, Switch } from '../../../components/ui/forms';
import { Alert } from '../../../components/ui/primitives';
import { BUYER_TYPE_LABEL, DUTY_BASES, DUTY_BASIS_LABEL, LABOR_CATEGORIES, LABOR_CATEGORY_LABEL, PRICE_BASIS_LABEL, WORK_MODE_LABEL, WORK_MODES, isRegulatedLabor, type DutyBasis, type WorkMode } from '../../../domain/enums';
import { formatHours, formatMonths, formatNOK, formatPct } from '../../../lib/format';
import { equityLine, floorToThousand, hourlyLine, maxBidLine, profitTone } from '../present';
import { FinGroup, FinNumberField } from './FinField';
import { Fig, SectionHeading, TONE_TEXT } from './primitives';

const originOf = (ctx: PropertyContext, key: keyof PropertyContext['draft']) => (ctx.base?.origins[key] ? VALUE_ORIGIN_LABEL[ctx.base.origins[key]!] : undefined);

/** Resultat: alt som følger av forutsetningene, oppdatert mens du endrer dem. */
function ResultSummary({ ctx }: { ctx: PropertyContext }) {
  const ev = ctx.result.evaluation;
  const b = ev.base;
  const bb = ctx.baseResult?.evaluation.base ?? null;
  const bid = recommendedBidOf(ev);
  const [, setParams] = useSearchParams();
  if (!b) {
    return (
      <section aria-labelledby="fin-resultat" className="rounded-xl border border-[var(--fin-line)] bg-white p-5">
        <h3 id="fin-resultat" className="text-lg font-semibold">
          Resultat
        </h3>
        <Alert tone={ev.status === 'invalid' ? 'danger' : 'warning'} className="mt-3" title={ev.status === 'invalid' ? 'Kalkylen har ugyldige verdier' : 'Kalkylen er ufullstendig'}>
          <ul className="list-disc pl-4">
            {(ev.status === 'invalid' ? ev.errors.map((e) => e.message) : ctx.result.missing.map((m) => m.label)).map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p>Ukjent er ikke det samme som 0 kr, så ingen fortjeneste vises.</p>
        </Alert>
      </section>
    );
  }
  const hourly = hourlyLine(b);
  const equity = equityLine(b);
  const diff = bb ? b.profit - bb.profit : null;
  const line = (label: string, value: string, opts?: { strong?: boolean; sub?: string; className?: string; testId?: string }) => (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm" data-testid={opts?.testId}>
      <dt className={opts?.strong ? 'font-semibold' : 'text-slate-700'}>
        {label}
        {opts?.sub && <span className="block text-xs font-normal text-slate-500">{opts.sub}</span>}
      </dt>
      <dd className={`fin-fig text-right ${opts?.strong ? 'font-semibold' : ''} ${opts?.className ?? ''}`}>{value}</dd>
    </div>
  );
  return (
    <section aria-labelledby="fin-resultat" className="rounded-xl border border-[var(--fin-line)] bg-white p-5" data-testid="fin-calc-result">
      <h3 id="fin-resultat" className="text-lg font-semibold tracking-tight">
        Resultat
      </h3>
      <p className="fin-label mt-3">Forventet fortjeneste</p>
      <p className={`mt-1 text-4xl leading-none font-semibold tracking-tight ${TONE_TEXT[profitTone(b.profit)]}`} data-testid="fin-calc-profit">
        <Fig>{formatNOK(b.profit)}</Fig>
      </p>
      <p className="mt-1.5 text-xs text-slate-600">
        {formatPct(b.projectReturn)} prosjektavkastning · før skatt
        {diff !== null && diff !== 0 ? ` · ${diff > 0 ? '+' : ''}${formatNOK(diff)} mot grunnanalysen` : ''}
      </p>

      <dl className="mt-4 divide-y divide-[var(--fin-line)] border-t border-[var(--fin-line)]">
        {line('Kjøpspris', formatNOK(b.P))}
        {line('Kjøpskostnader', formatNOK(b.K), { sub: 'Dokumentavgift og gebyrer – dekkes av egenkapital' })}
        {line('Oppussing inkl. reserve', formatNOK(b.RB))}
        {line('Renter', formatNOK(b.I), { sub: `Lån ${formatNOK(b.loanPeak)} (kjøp ${formatNOK(b.purchaseLoan)}, oppussing ${formatNOK(b.renovationLoan)})` })}
        {line('Drift', formatNOK(b.O))}
        {line('Salgskostnader', formatNOK(b.Csale))}
        {line('Total kostnad', formatNOK(b.C), { strong: true })}
        {line('Salgsverdi', formatNOK(b.V), { sub: b.basis === 'total' ? 'Totalpris inkl. fellesgjeld' : 'Kontantpris' })}
      </dl>

      <dl className="mt-1 divide-y divide-[var(--fin-line)] border-t border-[var(--fin-line-strong)]">
        {line('Per egeninnsatstime', hourly.value, { sub: hourly.sub, className: TONE_TEXT[hourly.tone === 'warn' ? 'warn' : 'neutral'] })}
        {line('Egenkapitalbehov', equity.value, { sub: equity.sub, className: TONE_TEXT[equity.tone === 'pos' ? 'neutral' : equity.tone] })}
        {line('Anbefalt maksbud', bid.price === null ? (bid.status === 'none' ? 'Ingen pris' : 'Ikke beregnet') : formatNOK(floorToThousand(bid.price)), {
          strong: true,
          sub: bid.limitedBy ? `Begrenset av ${MAX_BID_LIMIT_LABEL[bid.limitedBy].toLowerCase()}` : undefined,
          testId: 'fin-calc-maxbid',
        })}
      </dl>
      <p className="mt-3 text-xs text-slate-600">{maxBidLine({ limitedBy: bid.limitedBy, profitTarget: ctx.draft.profitTarget, minPerHour: ctx.draft.minProfitPerOwnHour })}</p>
      {ctx.result.warnings.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-[var(--fin-warn)]">
          {ctx.result.warnings.map((w) => (
            <li key={w.message}>{w.message}</li>
          ))}
        </ul>
      )}
      <button type="button" onClick={() => setParams((p) => { p.set('fane', 'oppussing'); return p; }, { replace: true })} className="mt-4 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-pine-800 hover:underline">
        Rediger oppussingstiltak <ArrowRight className="size-4" aria-hidden />
      </button>
    </section>
  );
}

/** Kalkyle i Finance: forutsetninger gruppert som en bank-/investeringskalkulator, og resultatet ved siden av hele tiden. */
export function FinanceCalculator({ ctx }: { ctx: PropertyContext }) {
  const f = useField(ctx);
  const d = ctx.draft;
  const b = ctx.result.evaluation.base;
  const reno = ctx.result.renovation;
  const asking = ctx.item.snapshot?.askingPrice ?? ctx.base?.values.purchasePrice ?? d.purchasePrice ?? 0;
  const sliderFor = (center: number | null, spread = 0.3, step = 10_000) => (center ? { min: Math.round((center * (1 - spread)) / step) * step, max: Math.round((center * (1 + spread)) / step) * step, step } : undefined);
  const rule = ctx.analysis.estimates.dutyRule;
  const withOrigin = (key: Parameters<typeof f>[0]) => ({ ...f(key), origin: originOf(ctx, key) });

  return (
    <div className="space-y-8">
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
      <SectionHeading title="Kalkyle" sub="Forutsetninger i ditt private scenario. Hvert felt viser hvor verdien kommer fra, og kan tilbakestilles til grunnlaget i analysen." />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start">
        <fieldset disabled={!ctx.editable} className="min-w-0 space-y-9">
          <legend className="sr-only">Forutsetninger i mitt scenario</legend>

          <FinGroup id="g-kjop" n={1} title="Kjøp" sub="Kontant kjøpesum og kostnadene som kommer i tillegg.">
            <div className="grid gap-4 sm:grid-cols-2">
              <FinNumberField label="Kjøpspris (kontant)" unit="kr" formatBase={money} slider={sliderFor(asking, 0.25)} {...withOrigin('purchasePrice')} hint="Uten fellesgjeld og kjøpskostnader." />
              <FinNumberField label="Fellesgjeld ved kjøp" unit="kr" formatBase={money} {...withOrigin('debtAtPurchase')} hint="Inngår i kapitalgrunnlaget, ikke i kontantkjøpet." />
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
              {d.dutyBasis !== 'ingen' && <FinNumberField label="Dokumentavgift" unit="%" decimals={2} formatBase={pct} {...withOrigin('dutyPct')} hint={b ? `Grunnlag ${formatNOK(b.dutyBase)} → avgift ${formatNOK(b.duty)}` : undefined} />}
              {d.dutyBasis === 'egendefinert' && <FinNumberField label="Eget avgiftsgrunnlag" unit="kr" formatBase={money} {...withOrigin('dutyCustomBase')} />}
              <FinNumberField label="Øvrige kjøpsgebyrer" unit="kr" formatBase={money} {...withOrigin('buyFees')} hint="Tinglysing, attester o.l." />
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
          </FinGroup>

          <FinGroup id="g-oppussing" n={2} title="Oppussing" sub="Tiltak, materialer, arbeid og egeninnsats. Tiltakene redigeres under fanen «Oppussing».">
            <dl className="mb-4 grid grid-cols-2 gap-x-6 rounded-lg border border-[var(--fin-line)] bg-[var(--fin-surface-muted)] px-4 py-1 sm:grid-cols-4">
              {[
                ['Tiltak', d.renovationMode === 'tiltak' ? `${reno.includedCount} av ${d.renovationItems.length}` : 'Rundsum'],
                ['Før reserve', reno.total === null ? 'Ikke avklart' : formatNOK(reno.total)],
                ['Materialer', d.renovationMode === 'tiltak' ? formatNOK(reno.byCategory.materials) : '–'],
                ['Innleid arbeid', d.renovationMode === 'tiltak' ? formatNOK(reno.byCategory.hiredLabor + reno.byCategory.electrician + reno.byCategory.plumber + reno.byCategory.other) : '–'],
              ].map(([l, v]) => (
                <div key={l} className="py-2.5">
                  <dt className="fin-label">{l}</dt>
                  <dd className="fin-fig mt-0.5 text-sm font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="grid gap-4 sm:grid-cols-2">
              {d.renovationMode === 'rundsum' && (
                <FinNumberField label="Oppussing (rundsum)" unit="kr" formatBase={money} {...withOrigin('renovationLumpSum')} />
              )}
              <FinNumberField label="Oppussingsreserve" unit="%" decimals={0} formatBase={pct} slider={{ min: 0, max: 60, step: 1 }} {...withOrigin('reservePct')} hint={b ? `Reserve ${formatNOK(b.reserve)}` : undefined} />
              <FinNumberField
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
              <FinNumberField label="Egeninnsats per uke (samlet team)" unit="t/uke" formatBase={(v) => formatHours(v)} {...withOrigin('weeklyOwnHours')} />
              {d.renovationMode === 'rundsum' ? (
                <FinNumberField label="Egne timer (rundsum)" unit="t" formatBase={(v) => formatHours(v)} {...withOrigin('lumpSumHours')} />
              ) : (
                <div>
                  <p className="mb-1 text-sm font-medium text-slate-800">Egne timer</p>
                  <p className="fin-fig flex h-10 items-center justify-end rounded-lg border border-[var(--fin-line)] bg-[var(--fin-surface-muted)] px-3 text-sm">{formatHours(reno.hours)}</p>
                  <p className="mt-1 text-xs text-slate-600">Summert fra tiltakene etter arbeidsmodus.</p>
                </div>
              )}
              <div className="sm:col-span-2">
                <Switch checked={d.maxOwnWork} disabled={!ctx.editable} onChange={(v) => ctx.setDraft((x) => ({ ...x, maxOwnWork: v }))} label="Maks egeninnsats" />
                <p className="mt-1 text-xs text-slate-600">Regner alt ikke-regulert arbeid som utført selv. Rør, elektro og bad/våtrom regnes aldri som gratis automatisk.</p>
              </div>
            </div>
            <details className="mt-4 rounded-lg border border-[var(--fin-line)] bg-white">
              <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-medium">Hvem utfører arbeidet? (per kategori og kompetanse)</summary>
              <div className="border-t border-[var(--fin-line)] px-4 py-2">
                <table className="w-full text-sm">
                  <caption className="sr-only">Hvem som utfører hvilket arbeid i dette scenarioet</caption>
                  <tbody className="divide-y divide-[var(--fin-line)]">
                    {LABOR_CATEGORIES.map((c) => (
                      <tr key={c}>
                        <th scope="row" className="py-2 pr-3 text-left font-normal">
                          {LABOR_CATEGORY_LABEL[c]}
                          {isRegulatedLabor(c) && <span className="ml-2 text-[11px] text-[var(--fin-warn)]">regulert</span>}
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
          </FinGroup>

          <FinGroup id="g-finans" n={3} title="Finansiering" sub="Forutsetninger – ikke et finansieringstilbud. Kjøpslånet gjelder kjøpesummen; kjøpskostnadene dekkes av egenkapital.">
            <div className="grid gap-4 sm:grid-cols-2">
              <FinNumberField label="Tilgjengelig egenkapital" unit="kr" formatBase={money} {...withOrigin('availableEquity')} hint="Sammenlignes med egenkapitalbehovet." />
              <FinNumberField label="Rente" unit="%" decimals={2} formatBase={pct} slider={{ min: 0, max: 15, step: 0.05 }} {...withOrigin('interestPct')} />
              <FinNumberField label="Kjøpslån (andel av kjøpesum)" unit="%" decimals={0} formatBase={pct} slider={{ min: 0, max: 100, step: 5 }} {...withOrigin('purchaseFinancingPct')} hint={b ? `Lån ${formatNOK(b.purchaseLoan)}` : undefined} />
              <FinNumberField label="Oppussingslån (andel av oppussing)" unit="%" decimals={0} formatBase={pct} slider={{ min: 0, max: 100, step: 5 }} {...withOrigin('renovationFinancingPct')} hint={b ? `Lån ${formatNOK(b.renovationLoan)} · trekkes gradvis` : 'Trekkes gradvis'} />
              <FinNumberField label="Månedlige kostnader" unit="kr" formatBase={money} {...withOrigin('monthlyCost')} hint="Felleskostnader, strøm, forsikring og kommunale avgifter." />
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
          </FinGroup>

          <FinGroup id="g-salg" n={4} title="Salg" sub="Forventet salgsverdi etter oppussing er fastsatt av markedsmotoren per scenario. Du kan overstyre den privat.">
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
              <FinNumberField label="Salg lav" unit="kr" formatBase={money} {...withOrigin('saleLow')} />
              <FinNumberField label="Salg normal" unit="kr" formatBase={money} slider={sliderFor(ctx.base?.values.saleBase ?? d.saleBase, 0.2)} {...withOrigin('saleBase')} />
              <FinNumberField label="Salg høy" unit="kr" formatBase={money} {...withOrigin('saleHigh')} />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <FinNumberField label="Fellesgjeld ved salg" unit="kr" formatBase={money} {...withOrigin('debtAtSale')} hint={saleDebtHelp({ draft: d, base: ctx.base }).text} />
              <FinNumberField label="Faste salgskostnader" unit="kr" formatBase={money} {...withOrigin('saleFixedCost')} hint="Markedsføring, takst, styling, oppgjør." />
              <FinNumberField label="Meglerprovisjon" unit="%" decimals={2} formatBase={pct} {...withOrigin('saleCommissionPct')} hint="Av kontantsalget." />
              <FinNumberField
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
          </FinGroup>

          <FinGroup id="g-mal" n={5} title="Mål og budplan" sub="Målene dine bestemmer anbefalt maksbud. Budplanen er privat og påvirker ikke kalkylen.">
            <div className="grid gap-4 sm:grid-cols-2">
              <FinNumberField label="Fortjenestemål" unit="kr" formatBase={money} {...withOrigin('profitTarget')} hint="Gir én av maksbudgrensene." />
              <FinNumberField label="Minimum fortjeneste per egeninnsatstime" unit="kr/t" formatBase={money} {...withOrigin('minProfitPerOwnHour')} hint="Mål for kjøpsprisen – ikke en kostnad og ikke en port for scenarioet." />
              <FinNumberField label="Mitt startbud" unit="kr" formatBase={money} {...withOrigin('startBid')} />
              <FinNumberField label="Min smertegrense" unit="kr" formatBase={money} {...withOrigin('walkAway')} hint="Høyeste bud du vil gi, uansett hva modellen sier." />
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
                  <FinNumberField label="Antatt skattesats" unit="%" decimals={1} formatBase={pct} {...withOrigin('taxPct')} hint="Din egen forutsetning. Ikke skatteråd." />
                </div>
              )}
            </div>
          </FinGroup>
        </fieldset>

        <aside aria-label="Resultat for mitt scenario" className="lg:sticky lg:top-32">
          <ResultSummary ctx={ctx} />
        </aside>
      </div>

      <details className="group rounded-xl border border-[var(--fin-line)] bg-white" data-testid="fin-calc-details">
        <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-5 py-3 text-base font-semibold">
          Detaljert kalkyle, stresstester og følsomhet
          <span className="text-xs font-normal text-slate-500 group-open:hidden">Vis</span>
          <span className="hidden text-xs font-normal text-slate-500 group-open:inline">Skjul</span>
        </summary>
        <div className="border-t border-[var(--fin-line)] p-4 sm:p-5">
          <Results ctx={ctx} />
        </div>
      </details>
      <p className="text-xs text-slate-500">
        Egen tid er ikke en kostnad. Se <Link to="?fane=rapport" className="underline">Rapport og kilder</Link> for forutsetninger og beregningsregler.
      </p>
    </div>
  );
}
