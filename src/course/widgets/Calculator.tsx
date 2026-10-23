import clsx from 'clsx';
import { CircleCheck, CircleX, Eraser, FlaskConical } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { BarList } from '../../components/analysis/charts';
import { Field, NumberInput, Segmented, Select } from '../../components/ui/forms';
import { Alert, Button } from '../../components/ui/primitives';
import { CASE_LABEL, MAX_BID_LIMIT_LABEL, SOLVER_TOLERANCE_KR, type Breakdown } from '../../calc/engine';
import type { ScenarioEvaluation } from '../../calc/scenario';
import { evaluateCourseScenario as evaluateScenario, evaluateCourseSaleCases } from '../evaluate';
import { bidText, MaxBidSummary } from './MaxBidSummary';
import { DUTY_BASES, DUTY_BASIS_LABEL, type DutyBasis } from '../../domain/enums';
import type { ScenarioValues } from '../../domain/schemas';
import { formatHours, formatNOK, formatNOKSigned, formatPct, NO_BASIS, UNKNOWN } from '../../lib/format';
import { CASE_A, EMPTY_CALC } from '../caseData';
import { EvidenceTag } from '../components';
import { useCourse } from '../progress';

type NumKey = { [K in keyof ScenarioValues]: ScenarioValues[K] extends number | null ? K : never }[keyof ScenarioValues];

export function useCalc() {
  const { state, update } = useCourse();
  const calc = state.calc;
  const setCalc = (patch: Partial<ScenarioValues>) => update((s) => ({ ...s, calc: { ...s.calc, ...patch } }));
  const replace = (v: ScenarioValues) => update((s) => ({ ...s, calc: structuredClone(v) }));
  const result = useMemo<ScenarioEvaluation>(() => evaluateScenario(calc), [calc]);
  return { calc, setCalc, replace, result };
}

/** Kobler et casekort til kalkulatoren og hopper til modul 8. */
export function useOpenInCalculator() {
  const { replace } = useCalc();
  const [, setParams] = useSearchParams();
  return (v: ScenarioValues) => {
    replace(v);
    setParams({ modul: '8', side: '1' });
    window.scrollTo({ top: 0 });
  };
}

function CalcField({ label, k, unit, decimals, hint, tag }: { label: string; k: NumKey; unit?: string; decimals?: number; hint?: string; tag?: 'mine' | 'dokumentert' | 'analyse' }) {
  const { calc, setCalc } = useCalc();
  return (
    <Field label={label} hint={hint} labelAside={tag ? <EvidenceTag kind={tag} /> : undefined}>
      {(p) => <NumberInput {...p} value={calc[k] as number | null} onChange={(v) => setCalc({ [k]: v } as Partial<ScenarioValues>)} unit={unit} decimals={decimals} />}
    </Field>
  );
}

function Group({ title, children, sub }: { title: string; children: React.ReactNode; sub?: string }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h4 className="font-semibold">{title}</h4>
      {sub && <p className="mb-2 text-xs text-slate-600">{sub}</p>}
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Row({ label, value, strong, sub }: { label: string; value: string; strong?: boolean; sub?: string }) {
  return (
    <div className={clsx('flex items-baseline justify-between gap-3 py-1.5 text-sm', strong && 'font-semibold')}>
      <span className="text-slate-700">
        {label}
        {sub && <span className="block text-[11px] font-normal text-slate-500">{sub}</span>}
      </span>
      <span className="num text-right">{value}</span>
    </div>
  );
}

export function BreakdownRows({ b }: { b: Breakdown }) {
  return (
    <div className="divide-y divide-slate-100">
      <Row label="Kjøpskostnader (K)" sub={`Dokumentavgift ${formatNOK(b.duty)} (grunnlag ${formatNOK(b.dutyBase)}) + øvrige ${formatNOK(b.F)}`} value={formatNOK(b.K)} />
      <Row label="Oppussing med reserve (RB)" sub={`${formatNOK(b.R)} + reserve ${formatNOK(b.reserve)}`} value={formatNOK(b.RB)} />
      <Row label="Renter prosjektlån (I)" sub="Oppussingsmidler antas i snitt bundet halvveis" value={formatNOK(b.I)} />
      <Row label="Månedlig drift (O)" value={formatNOK(b.O)} />
      <Row label="Kontantsalg (S)" sub={b.basis === 'total' ? `Totalpris ${formatNOK(b.V)} − fellesgjeld ved salg ${formatNOK(b.D1)}` : 'Kontantpris'} value={formatNOK(b.S)} />
      <Row label="Salgskostnader" value={formatNOK(b.Csale)} />
      <Row label="Samlede kontantkostnader (C)" value={formatNOK(b.C)} />
      <Row label="Resultat før skatt og egen tid (S − C)" strong value={formatNOK(b.profit)} />
      <Row label="Etter verdsatt egen tid" value={b.profitAfterOwnWork === null ? UNKNOWN : formatNOK(b.profitAfterOwnWork)} />
      <Row label="Fortjeneste per egeninnsatstime" value={b.profitPerOwnHour === null ? (b.ownHours === 0 ? 'Ingen egne timer' : UNKNOWN) : `${formatNOK(b.profitPerOwnHour)}/t`} />
      <Row label="Egenkapitalbehov" sub="Før salgsoppgjør, uten salgskostnader. Ikke det samme som prosjektkostnad." value={formatNOK(b.equityNeed)} />
      <Row label="Finansieringsgap" sub="Mot tilgjengelig egenkapital" value={formatNOK(b.equityGap, UNKNOWN)} />
      <Row label="Prosjektavkastning" sub="Ikke egenkapitalavkastning" value={formatPct(b.projectReturn, NO_BASIS)} />
    </div>
  );
}

function MissingAlert({ result }: { result: ScenarioEvaluation }) {
  const ev = result.evaluation;
  if (ev.status === 'invalid')
    return (
      <Alert tone="danger" title="Ugyldige verdier">
        <ul className="list-disc pl-4">
          {ev.errors.map((e) => (
            <li key={e.field + e.message}>{e.message}</li>
          ))}
        </ul>
      </Alert>
    );
  return (
    <Alert tone="warning" title="Ufullstendig kalkyle – ingen fortjeneste vises">
      <p>Disse inngangsverdiene er uavklart. Ukjent er ikke det samme som 0 kroner.</p>
      <ul className="list-disc pl-4">
        {result.missing.map((m) => (
          <li key={m.field + m.label}>{m.label}</li>
        ))}
      </ul>
    </Alert>
  );
}

export function FlippCalculator() {
  const { calc, setCalc, replace, result } = useCalc();
  const ev = result.evaluation;
  const b = ev.base;
  const tenure = calc.dutyBasis === 'ingen' ? 'borettslag' : calc.dutyBasis === 'kjopesum_pluss_fellesgjeld' && calc.dutyPct === 2.5 ? 'selveier' : 'annet';
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" icon={<FlaskConical className="size-4" aria-hidden />} onClick={() => replace(CASE_A)}>
          Last eksempel (Case A – fiktivt)
        </Button>
        <Button size="sm" variant="secondary" icon={<Eraser className="size-4" aria-hidden />} onClick={() => replace(EMPTY_CALC)}>
          Tøm alle felt
        </Button>
        <span className="text-xs text-slate-600">Tomme felt er uavklarte, ikke 0 kr. Tallene lagres på din enhet.</span>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Group title="Kjøp" sub="Dokumentavgift er en egen regel per eierform – ikke bruk den blindt på alle boligtyper.">
            <CalcField label="Kjøpspris (kontant)" k="purchasePrice" unit="kr" tag="mine" hint="Uten fellesgjeld og kjøpskostnader." />
            <CalcField label="Fellesgjeld ved kjøp (D0)" k="debtAtPurchase" unit="kr" tag="dokumentert" hint="Legges ikke til kontantkjøpet. Inngår i kapitalgrunnlaget." />
            <div className="sm:col-span-2">
              <p className="mb-1 text-sm font-medium text-slate-800">Eierform / dokumentavgift</p>
              <Segmented
                label="Eierform"
                value={tenure}
                onChange={(v) => {
                  if (v === 'selveier') setCalc({ dutyBasis: 'kjopesum_pluss_fellesgjeld', dutyPct: 2.5 });
                  else if (v === 'borettslag') setCalc({ dutyBasis: 'ingen', dutyPct: 0 });
                }}
                options={[
                  { value: 'selveier', label: 'Selveier (2,5 %)' },
                  { value: 'borettslag', label: 'Borettslag (0 %)' },
                  { value: 'annet', label: 'Annet – velg selv' },
                ]}
              />
            </div>
            <Field label="Dokumentavgiftsgrunnlag" hint={b ? `Grunnlag nå: ${formatNOK(b.dutyBase)} → avgift ${formatNOK(b.duty)}. Grunnlaget følger kjøpsprisen.` : undefined}>
              {(p) => (
                <Select {...p} value={calc.dutyBasis} onChange={(e) => setCalc({ dutyBasis: e.target.value as DutyBasis })}>
                  {DUTY_BASES.map((d) => (
                    <option key={d} value={d}>
                      {DUTY_BASIS_LABEL[d]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {calc.dutyBasis !== 'ingen' && <CalcField label="Dokumentavgiftssats" k="dutyPct" unit="%" decimals={2} tag="dokumentert" hint="Gjeldende hovedregel for selveier: 2,5 %." />}
            {calc.dutyBasis === 'egendefinert' && <CalcField label="Eget avgiftsgrunnlag" k="dutyCustomBase" unit="kr" hint="Følger ikke kjøpsprisen automatisk." />}
            <CalcField label="Andre kjøpsgebyrer (F)" k="buyFees" unit="kr" hint="Tinglysing (545 kr per ordinært dokument i 2026), bank m.m." />
          </Group>

          <Group title="Oppussing og reserve">
            <CalcField label="Oppussing før reserve (R)" k="renovationLumpSum" unit="kr" tag="analyse" hint="Grovt anslag – ikke pristilbud." />
            <CalcField label="Reserve (b)" k="reservePct" unit="%" decimals={0} tag="mine" hint="Eksempel: 20 %. Til forhold du ikke kjente til." />
          </Group>

          <Group title="Prosjekt og finansiering" sub="Forutsetninger – ikke finansieringstilbud.">
            <CalcField label="Prosjektmåneder (m)" k="months" unit="mnd" decimals={1} tag="mine" />
            <CalcField label="Månedlige kostnader (M)" k="monthlyCost" unit="kr" tag="analyse" hint="Hele felleskostnaden inkl. gjeldsbetjening, strøm, forsikring og avgifter. Renter på fellesgjeld legges ikke til på nytt." />
            <CalcField label="Årlig rente (r)" k="interestPct" unit="%" decimals={2} tag="mine" />
            <CalcField label="Låneandel av kjøpesum (fP)" k="purchaseFinancingPct" unit="%" decimals={0} tag="mine" hint="Regnes kun av kontant kjøpesum (P), ikke kjøpskostnadene." />
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <input type="checkbox" className="mt-1 accent-pine-700" checked={calc.financeRunningCosts} onChange={(e) => setCalc({ financeRunningCosts: e.target.checked })} />
              Lånefinansier løpende renter og drift (gradvis opptrekk)
            </label>
            <CalcField label="Tilgjengelig egenkapital" k="availableEquity" unit="kr" tag="mine" />
            <CalcField label="Låneandel av oppussing (fR)" k="renovationFinancingPct" unit="%" decimals={0} tag="mine" hint="Egen låneandel av oppussing inklusive reserve (RB)." />
          </Group>

          <Group title="Salg" sub="Lav, base og høy – ikke én magisk salgspris.">
            <div className="sm:col-span-2">
              <p className="mb-1 text-sm font-medium text-slate-800">Salgstallene er</p>
              <Segmented
                label="Prisgrunnlag"
                value={calc.saleBasis}
                onChange={(v) => setCalc({ saleBasis: v })}
                options={[
                  { value: 'kontant', label: 'Kontantpris' },
                  { value: 'total', label: 'Totalpris (inkl. fellesgjeld)' },
                ]}
              />
            </div>
            <CalcField label="Lav salgspris" k="saleLow" unit="kr" tag="analyse" />
            <CalcField label="Base salgspris" k="saleBase" unit="kr" tag="analyse" />
            <CalcField label="Høy salgspris" k="saleHigh" unit="kr" tag="analyse" />
            <CalcField label="Fellesgjeld ved salg (D1)" k="debtAtSale" unit="kr" hint={calc.saleBasis === 'total' ? 'Trekkes fra totalprisen nøyaktig én gang.' : 'Påvirker ikke kalkylen ved kontantpris.'} />
            <CalcField label="Fast salgskostnad (Sf)" k="saleFixedCost" unit="kr" />
            <CalcField label="Salgsprovisjon (s)" k="saleCommissionPct" unit="%" decimals={2} hint="Av kontantsalget." />
          </Group>

          <Group title="Egen tid og krav">
            <CalcField label="Egne timer (H)" k="lumpSumHours" unit="t" />
            <CalcField label="Illustrativ verdi av egen tid (h)" k="hourValue" unit="kr/t" tag="mine" hint="Vises separat som alternativverdi. Trekkes ikke fra resultatet eller som kostnad i maksbudet." />
            <CalcField label="Ønsket minimumsfortjeneste" k="profitTarget" unit="kr" tag="mine" hint="Brukes til maksbud." />
            <CalcField label="Minimum fortjeneste per egeninnsatstime" k="minProfitPerOwnHour" unit="kr/t" tag="mine" hint="Redigerbart eksempel: 500 kr/t. Egen maksbudgrense, ikke en kostnad." />
          </Group>
        </div>

        <div className="space-y-4">
          {ev.status !== 'complete' || !b ? (
            <MissingAlert result={result} />
          ) : (
            <>
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h4 className="font-semibold">Resultat – base-scenario</h4>
                <p className="text-xs text-slate-600">Samme beregningsmotor som resten av Flippsjekk.</p>
                <div className="mt-2">
                  <BreakdownRows b={b} />
                </div>
              </section>
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h4 className="font-semibold">Lav, base og høy</h4>
                <table className="num mt-2 w-full text-sm">
                  <thead className="text-left text-xs text-slate-600">
                    <tr>
                      <th className="py-1 font-medium">Scenario</th>
                      <th className="py-1 text-right font-medium">Salgspris</th>
                      <th className="py-1 text-right font-medium">Resultat</th>
                      <th className="py-1 text-right font-medium">Etter egen tid</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(['low', 'base', 'high'] as const).map((k) => {
                      const c = ev.cases[k];
                      return (
                        <tr key={k}>
                          <th scope="row" className="py-1.5 text-left font-normal">
                            {CASE_LABEL[k]}
                          </th>
                          <td className="py-1.5 text-right">{c ? formatNOK(c.V) : NO_BASIS}</td>
                          <td className={clsx('py-1.5 text-right font-semibold', c && c.profit < 0 && 'text-red-800')}>{c ? formatNOK(c.profit) : NO_BASIS}</td>
                          <td className="py-1.5 text-right">{c ? formatNOK(c.profitAfterOwnWork, UNKNOWN) : '–'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="mt-3">
                  <BarList rows={(['low', 'base', 'high'] as const).map((k) => ({ label: `${CASE_LABEL[k]} salg`, value: ev.cases[k]?.profit ?? null }))} />
                </div>
              </section>
              <MaxBidSummary evaluation={ev} purchasePrice={calc.purchasePrice} />
              <section className="rounded-xl border border-amber-300 bg-amber-50 p-4">
                <h4 className="font-semibold">Skattebehandling: {ev.tax?.mode === 'antatt' ? 'Illustrasjon' : 'Ikke avklart'}</h4>
                <p className="text-xs text-slate-700">Skatt trekkes ikke fra hovedresultatet. Velg bare et illustrativt alternativ hvis du vil se en separat beregning.</p>
                <div className="mt-2">
                  <Segmented
                    label="Skatteillustrasjon"
                    value={calc.taxMode}
                    onChange={(v) => setCalc({ taxMode: v, taxPct: v === 'antatt' ? calc.taxPct ?? 22 : calc.taxPct })}
                    options={[
                      { value: 'uavklart', label: 'Ikke avklart' },
                      { value: 'antatt', label: 'Illustrer med egen sats' },
                    ]}
                  />
                </div>
                {calc.taxMode === 'antatt' && (
                  <div className="mt-3 max-w-xs">
                    <CalcField label="Illustrativ skattesats" k="taxPct" unit="%" decimals={1} hint="22 % er satsen for skattepliktig privat kapitalgevinst i 2026 – men det er ikke avklart at gevinsten din er skattepliktig." />
                    {ev.tax?.mode === 'antatt' && <p className="mt-2 text-sm">{ev.tax.taxAmount === null ? 'Sett en sats.' : `Illustrert skatt ${formatNOK(ev.tax.taxAmount)}. ${ev.tax.note}`}</p>}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function StressPanel() {
  const { result } = useCalc();
  const { state, update } = useCourse();
  const ev = result.evaluation;
  if (ev.status !== 'complete' || !ev.base) {
    return (
      <div className="space-y-2">
        <Alert tone="warning" title="Kalkylen din er ufullstendig">
          Stresstestene trenger en komplett kalkyle fra modul 8. Åpne kalkulatoren og last inn eksempelet, eller fyll inn tallene dine.
        </Alert>
        <MissingAlert result={result} />
      </div>
    );
  }
  const base = ev.base;
  const sel = ev.stress.find((s) => s.id === state.stressId) ?? null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Stresstester">
        {ev.stress.map((s) => (
          <Button key={s.id} size="sm" className="h-auto max-w-full py-1.5 text-left whitespace-normal" variant={state.stressId === s.id ? 'primary' : 'secondary'} aria-pressed={state.stressId === s.id} onClick={() => update((x) => ({ ...x, stressId: x.stressId === s.id ? null : s.id }))}>
            {s.label}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-live="polite">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-600">Uten stresstest (base)</p>
          <p className="num text-2xl font-semibold">{formatNOK(base.profit)}</p>
          <p className="text-xs text-slate-600">Prosjektavkastning {formatPct(base.projectReturn)}</p>
        </div>
        <div className={clsx('rounded-xl border p-4', sel ? 'border-pine-400 bg-pine-50' : 'border-dashed border-slate-300 bg-white')}>
          {sel ? (
            <>
              <p className="text-xs font-medium text-slate-700">{sel.label}</p>
              <p className={clsx('num text-2xl font-semibold', sel.result.profit < 0 && 'text-red-800')}>{formatNOK(sel.result.profit)}</p>
              <p className="text-xs text-slate-700">
                {sel.noEffect ? 'Ingen effekt – prisgrunnlaget er kontantpris.' : <>Endring {formatNOKSigned(sel.deltaProfit)} · avkastning {formatPct(sel.result.projectReturn)}</>}
              </p>
              <p className="mt-1 text-xs text-slate-600">{sel.detail}</p>
              {sel.maxBid && <p className="mt-1 text-xs text-slate-700">Maksbud etter fortjenestemålet i denne testen: {sel.maxBid.price === null ? 'ingen gjennomførbar pris' : formatNOK(sel.maxBid.price)}</p>}
            </>
          ) : (
            <p className="text-sm text-slate-600">Velg en stresstest for å se hvordan hele kalkylen endres.</p>
          )}
        </div>
      </div>
      <table className="num w-full text-sm">
        <thead className="text-left text-xs text-slate-600">
          <tr>
            <th className="py-1 font-medium">Test</th>
            <th className="py-1 text-right font-medium">Resultat</th>
            <th className="py-1 text-right font-medium">Endring</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {ev.stress.map((s) => (
            <tr key={s.id} className={clsx(state.stressId === s.id && 'bg-pine-50')}>
              <th scope="row" className="py-1.5 pr-2 text-left font-normal">
                {s.label}
              </th>
              <td className={clsx('py-1.5 text-right font-medium', s.result.profit < 0 && 'text-red-800')}>{formatNOK(s.result.profit)}</td>
              <td className="py-1.5 text-right">{s.noEffect ? 'Ingen effekt' : formatNOKSigned(s.deltaProfit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HourlyPanel({ showOwn = true }: { showOwn?: boolean } = {}) {
  const { result, calc } = useCalc();
  const b = result.evaluation.base;
  const [demo, setDemo] = useState<{ profit: number | null; hours: number | null }>({ profit: 150_000, hours: 500 });
  const perHour = demo.profit !== null && demo.hours ? demo.profit / demo.hours : null;
  return (
    <div className="space-y-4">
      {showOwn && (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h4 className="font-semibold">Din kalkyle</h4>
        {b ? (
          <dl className="num mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-lg bg-slate-50 p-2">
              <dt className="text-xs text-slate-600">Resultat før verdsatt tid</dt>
              <dd className="font-semibold">{formatNOK(b.profit)}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <dt className="text-xs text-slate-600">Økonomisk resultat etter verdsatt egen tid</dt>
              <dd className="font-semibold">{formatNOK(b.profitAfterOwnWork, UNKNOWN)}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <dt className="text-xs text-slate-600">Resultat før verdsatt tid / antall egne timer</dt>
              <dd className="font-semibold">{b.profitPerOwnHour !== null ? `${formatNOK(b.profitPerOwnHour)} per time` : b.ownHours === null ? UNKNOWN : 'Ingen egne timer'}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-sm text-slate-600">Kalkylen fra modul 8 er ufullstendig, så ingen resultat vises. Prøv eksempelet under.</p>
        )}
        <p className="mt-2 text-xs text-slate-600">Egne timer: {formatHours(result.renovation.hours)} · timeverdi {formatNOK(calc.hourValue)}/t.</p>
      </div>
      )}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h4 className="font-semibold">Prøv selv: hva tjener du per time?</h4>
        <div className="mt-2 grid max-w-md grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Fortjeneste før skatt">{(p) => <NumberInput {...p} unit="kr" value={demo.profit} onChange={(v) => setDemo({ ...demo, profit: v })} />}</Field>
          <Field label="Egne timer">{(p) => <NumberInput {...p} unit="t" value={demo.hours} onChange={(v) => setDemo({ ...demo, hours: v })} />}</Field>
        </div>
        <p className="mt-3 text-sm" aria-live="polite">
          {perHour === null ? 'Fyll inn begge feltene.' : <><strong className="num">{formatNOK(perHour)} per time</strong> før skatt – og uten at kapitalrisikoen er tatt med.</>}
        </p>
      </div>
    </div>
  );
}

export function HurdlePanel() {
  const { calc, setCalc, result } = useCalc();
  const { state, update } = useCourse();
  const h = state.hurdle;
  const setH = (p: Partial<typeof h>) => update((s) => ({ ...s, hurdle: { ...s.hurdle, ...p } }));
  const ev = result.evaluation;
  const check = (met: boolean | null) => (met === null ? { icon: null, text: 'Mangler grunnlag', cls: 'text-slate-500' } : met ? { icon: CircleCheck, text: 'Nådd', cls: 'text-emerald-800' } : { icon: CircleX, text: 'Ikke nådd', cls: 'text-red-800' });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="1. Minimum fortjeneste" labelAside={<EvidenceTag kind="mine" />}>{(p) => <NumberInput {...p} unit="kr" value={calc.profitTarget} onChange={(v) => setCalc({ profitTarget: v })} />}</Field>
        <Field label="2. Minimum prosjektavkastning" hint="Informativt mål; inngår ikke i anbefalt maksbud." labelAside={<EvidenceTag kind="mine" />}>{(p) => <NumberInput {...p} unit="%" decimals={1} value={h.minReturnPct} onChange={(v) => setH({ minReturnPct: v })} />}</Field>
        <Field label="3. Minimum fortjeneste per egen time" labelAside={<EvidenceTag kind="mine" />}>{(p) => <NumberInput {...p} unit="kr/t" value={calc.minProfitPerOwnHour} onChange={(v) => setCalc({ minProfitPerOwnHour: v })} />}</Field>
      </div>
      {ev.status === 'complete' ? (
        <table className="num w-full text-sm">
          <caption className="sr-only">Kravene dine mot hvert scenario</caption>
          <thead className="text-left text-xs text-slate-600">
            <tr>
              <th className="py-1 font-medium">Scenario</th>
              <th className="py-1 font-medium">Fortjeneste</th>
              <th className="py-1 font-medium">Avkastning</th>
              <th className="py-1 font-medium">Per egen time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(['low', 'base', 'high'] as const).map((k) => {
              const c = ev.cases[k];
              if (!c) return null;
              const rows = [
                { met: calc.profitTarget === null ? null : c.profit >= calc.profitTarget, val: formatNOK(c.profit) },
                { met: h.minReturnPct === null || c.projectReturn === null ? null : c.projectReturn * 100 >= h.minReturnPct, val: formatPct(c.projectReturn, NO_BASIS) },
                { met: c.meetsHourlyRequirement, val: c.profitPerOwnHour === null ? (c.ownHours === 0 ? 'Ingen egne timer' : UNKNOWN) : `${formatNOK(c.profitPerOwnHour)}/t` },
              ];
              return (
                <tr key={k}>
                  <th scope="row" className="py-1.5 text-left font-normal">
                    {CASE_LABEL[k]}
                  </th>
                  {rows.map((r, i) => {
                    const s = check(r.met);
                    const Icon = s.icon;
                    return (
                      <td key={i} className="py-1.5">
                        <span className="block">{r.val}</span>
                        <span className={clsx('inline-flex items-center gap-1 text-xs font-medium', s.cls)}>
                          {Icon && <Icon className="size-3.5" aria-hidden />}
                          {s.text}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <Alert tone="warning">Kalkylen er ufullstendig, så kravene kan ikke sjekkes. Åpne modul 8.</Alert>
      )}
      {ev.status === 'complete' && <MaxBidSummary evaluation={ev} purchasePrice={calc.purchasePrice} />}
      <p className="text-xs text-slate-600">Eksempelinnstillinger er 400 000 kr i fortjenestemål, 15 % prosjektavkastning og 500 kr i fortjeneste per egeninnsatstime. Timekravet er en redigerbar grense for maksbud – ikke en ekstra prosjektkostnad eller automatisk dom over lønnsomheten.</p>
    </div>
  );
}

const PROFIT_TARGETS = [100_000, 200_000, 300_000, 400_000] as const;

/** Lav/base/høy for brukerens kalkyle (side 8.2). */
export function ScenariosPanel() {
  const { result } = useCalc();
  const ev = result.evaluation;
  if (ev.status !== 'complete') return <MissingAlert result={result} />;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h4 className="font-semibold">Resultat før skatt og egen tid</h4>
      <table className="num mt-2 w-full text-sm">
        <thead className="text-left text-xs text-slate-600">
          <tr>
            <th className="py-1 font-medium">Scenario</th>
            <th className="py-1 text-right font-medium">Salgspris</th>
            <th className="py-1 text-right font-medium">Salgskostn.</th>
            <th className="py-1 text-right font-medium">Resultat</th>
            <th className="py-1 text-right font-medium">Avkastning</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {(['low', 'base', 'high'] as const).map((k) => {
            const c = ev.cases[k];
            return (
              <tr key={k}>
                <th scope="row" className="py-1.5 text-left font-normal">
                  {CASE_LABEL[k]}
                </th>
                <td className="py-1.5 text-right">{c ? formatNOK(c.V) : NO_BASIS}</td>
                <td className="py-1.5 text-right">{c ? formatNOK(c.Csale) : '–'}</td>
                <td className={clsx('py-1.5 text-right font-semibold', c && c.profit < 0 && 'text-red-800')}>{c ? formatNOK(c.profit) : NO_BASIS}</td>
                <td className="py-1.5 text-right">{c ? formatPct(c.projectReturn, NO_BASIS) : '–'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-3">
        <BarList rows={(['low', 'base', 'high'] as const).map((k) => ({ label: `${CASE_LABEL[k]} salg`, value: ev.cases[k]?.profit ?? null }))} />
      </div>
      <p className="mt-2 text-xs text-slate-600">Hvert scenario har egen salgskostnad. Endre forutsetningene i kalkulatoren på side 8.1.</p>
    </section>
  );
}

/** Avkastning og timelønn (side 8.4): resultat før og etter egen tid, prosjektavkastning og dine krav. */
export function ReturnsPanel() {
  const { result } = useCalc();
  const b = result.evaluation.base;
  return (
    <div className="space-y-4">
      {b ? (
        <dl className="num grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <dt className="text-xs text-slate-600">Resultat før skatt og egen tid</dt>
            <dd className="text-lg font-semibold">{formatNOK(b.profit)}</dd>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <dt className="text-xs text-slate-600">Resultat etter verdsatt egen tid</dt>
            <dd className="text-lg font-semibold">{formatNOK(b.profitAfterOwnWork, UNKNOWN)}</dd>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <dt className="text-xs text-slate-600">Prosjektavkastning</dt>
            <dd className="text-lg font-semibold">{formatPct(b.projectReturn, NO_BASIS)}</dd>
            <dd className="text-[11px] text-slate-500">Ikke egenkapitalavkastning</dd>
          </div>
        </dl>
      ) : (
        <MissingAlert result={result} />
      )}
      <HourlyPanel showOwn={false} />
      <section>
        <h4 className="mb-2 font-semibold">Dine krav</h4>
        <HurdlePanel />
      </section>
    </div>
  );
}

/** Samme lagrede mål som kalkulatoren og kravpanelet (side 8.5). */
export function MaxBidPanel() {
  const { calc, setCalc, result } = useCalc();
  const ev = result.evaluation;
  const rows = useMemo(() => evaluateCourseSaleCases(calc), [calc]);
  return (
    <div className="space-y-3">
      <div role="group" aria-label="Resultatkrav" className="flex flex-wrap gap-2">
        {PROFIT_TARGETS.map((t) => (
          <Button key={t} size="sm" variant={calc.profitTarget === t ? 'primary' : 'secondary'} aria-pressed={calc.profitTarget === t} onClick={() => setCalc({ profitTarget: t })}>
            {formatNOK(t)}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <CalcField label="Eget fortjenestemål" k="profitTarget" unit="kr" />
        <CalcField label="Minimum fortjeneste per egeninnsatstime" k="minProfitPerOwnHour" unit="kr/t" hint="Eksempel: 500 kr/t. Tomt betyr at kravet ikke er satt." />
        <CalcField label="Egne timer (H)" k="lumpSumHours" unit="t" />
      </div>
      {ev.status !== 'complete' ? <MissingAlert result={result} /> : (
        <>
          <MaxBidSummary evaluation={ev} purchasePrice={calc.purchasePrice} />
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h4 className="font-semibold">Maksbud ved lavt, normalt og høyt salg</h4>
            <p className="text-xs text-slate-700">Samme mål, egne timer og kostnader i alle scenarioene. Renter og dokumentavgift beregnes på nytt. Toleranse {SOLVER_TOLERANCE_KR} kr.</p>
            <div className="mt-2 grid grid-cols-1 gap-3">
              {rows.map(({ key, sale, evaluation }) => {
                const rec = evaluation?.recommendedMaxBid;
                return (
                  <section key={key} className="rounded-lg bg-slate-50 p-3" aria-label={`Maksbud – ${CASE_LABEL[key]}`}>
                    <h5 className="font-semibold">{CASE_LABEL[key]} salg · {formatNOK(sale, NO_BASIS)}</h5>
                    <dl className="num mt-1 text-sm">
                      <Row label="Etter fortjenestemål" value={bidText(evaluation?.maxBid)} />
                      <Row label="Etter timekrav" value={bidText(evaluation?.maxBidHourly)} />
                      <Row label="Anbefalt maksbud" strong value={bidText(rec?.limits.find((l) => l.id === rec.limitedBy)?.result)} />
                    </dl>
                    {rec?.limitedBy && <p className="text-xs">Begrenses av: {MAX_BID_LIMIT_LABEL[rec.limitedBy]}.</p>}
                    {rec?.limits.some((l) => l.result.status === 'none') && <p className="text-xs text-red-800">Kravet kan ikke oppfylles selv ved kjøpspris 0 kr.</p>}
                  </section>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
