import clsx from 'clsx';
import { ArrowRight, Check, CircleCheck, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Field, NumberInput, Segmented, TextInput } from '../../components/ui/forms';
import { Alert, Button, buttonClass } from '../../components/ui/primitives';
import { CASE_LABEL } from '../../calc/engine';
import { evaluateCourseScenario as evaluateScenario, evaluateCourseSaleCases } from '../evaluate';
import { bidText, MaxBidSummary } from './MaxBidSummary';
import { BreakdownRows } from './Calculator';
import type { PriceBasis } from '../../domain/enums';
import type { ScenarioValues } from '../../domain/schemas';
import { formatNOK, UNKNOWN } from '../../lib/format';
import { uuid } from '../../lib/ids';
import { EMPTY_CALC } from '../caseData';
import { EvidenceTag } from '../components';
import { FINAL_QUIZ } from '../content/finalQuiz';
import { finalQuizScore, useCourse, type Decision, type FinalCaseState } from '../progress';
import { COURSES } from '../../config/courses';
import { COURSE_CHECKED, COURSE_TITLE, PASS_MARK } from '../types';
import { Quiz } from './Quiz';

// ---------------------------------------------------------------------------
// Sluttcase – Ville du kjøpt?
// ---------------------------------------------------------------------------

const CASE_FACTS: [string, string][] = [
  ['Boligtype', 'Borettslagsleilighet i Trondheim, 62 m²'],
  ['Prisantydning (kontant)', '2 650 000 kr'],
  ['Fellesgjeld', '350 000 kr'],
  ['Gjeldsinkludert pris', 'ca. 3 000 000 kr'],
  ['Felleskostnader', '5 800 kr/mnd'],
  ['Bad', 'TG2, rundt 20 år gammelt'],
  ['Kjøkken', 'Slitt'],
  ['El', 'Mangelfull dokumentasjon på enkelte endringer'],
  ['Ekstra soverom', 'Mulighet ved kjøkkenflytting'],
  ['Rørrehabilitering', 'Styret diskuterer det. Kostnaden er ikke vedtatt'],
  ['Sammenlignbare ferdige boliger', 'Omtrent 3,55–3,75 mill. i relevant prisgrunnlag'],
  ['Aktiv konkurrerende ferdig bolig', '3,69 mill.'],
  ['Første oppussingsanslag', '300 000 kr'],
  ['Prosjekttid / egne timer', '6 måneder / 300 timer'],
];

const OPTIONS: { id: string; label: string; correct: boolean }[] = [
  { id: 'o-rorr', label: 'Mulig rørrehabilitering', correct: true },
  { id: 'o-farge', label: 'Fargen på kjøkkenfrontene', correct: false },
  { id: 'o-bad', label: 'Badets reelle behov', correct: true },
  { id: 'o-el', label: 'Elektrisk dokumentasjon', correct: true },
  { id: 'o-soverom', label: 'Om ekstra soverom er gjennomførbart', correct: true },
  { id: 'o-vann', label: 'Vann/avløp ved kjøkkenflytting', correct: true },
  { id: 'o-sofa', label: 'Hvilket sofamerke som skal brukes på styling', correct: false },
  { id: 'o-vent', label: 'Ventilasjon', correct: true },
  { id: 'o-styret', label: 'Styrets krav', correct: true },
  { id: 'o-budsjett', label: 'Detaljert oppussingsbudsjett', correct: true },
  { id: 'o-salg', label: 'Realistisk salgsverdi', correct: true },
  { id: 'o-fin', label: 'Finansiering', correct: true },
  { id: 'o-skatt', label: 'Skatteforutsetning', correct: true },
];

/** Neste kurs i serien. */
const NEXT_COURSE = COURSES[1].title;

const DECISION_LABEL: Record<Decision, string> = { interessant: 'Interessant', folg_med: 'Følg med', avklar_forst: 'Avklar først', avsta: 'Avstå' };
const ASKING = 2_650_000;
const DEBT = 350_000;
const MONTHLY = 5_800;
const MONTHS = 6;
const STEPS = ['Hva mangler?', 'Salgsscenario', 'Oppussing', 'Risiko', 'Maksbud', 'Beslutning'];

/** Verdiene til sluttcaset som kalkylevalues. Identifisert risiko legges til uten reserve. */
export function finalCaseValues(fc: FinalCaseState, basis: PriceBasis, purchase: number): ScenarioValues {
  const known = fc.items.every((i) => i.amount !== null);
  const sum = known ? fc.items.reduce((s, i) => s + (i.amount ?? 0), 0) : null;
  const b = (fc.reservePct ?? 0) / 100;
  const reno = sum === null ? null : sum + (fc.pipeRisk ?? 0) / (1 + b);
  return {
    ...EMPTY_CALC,
    purchasePrice: purchase,
    debtAtPurchase: DEBT,
    debtAtSale: DEBT,
    dutyBasis: 'ingen',
    dutyPct: 0,
    buyFees: fc.buyFees,
    renovationLumpSum: reno,
    lumpSumHours: fc.hours,
    reservePct: fc.reservePct,
    months: MONTHS,
    monthlyCost: MONTHLY,
    interestPct: fc.interestPct,
    purchaseFinancingPct: fc.purchaseFinancingPct,
    renovationFinancingPct: fc.renovationFinancingPct,
    minProfitPerOwnHour: fc.minProfitPerOwnHour,
    saleBasis: basis,
    saleLow: fc.low,
    saleBase: fc.base,
    saleHigh: fc.high,
    saleFixedCost: fc.saleFixed,
    saleCommissionPct: fc.commissionPct,
    hourValue: fc.hourValue,
    profitTarget: fc.target,
  };
}

export function FinalCase() {
  const { state, update } = useCourse();
  const fc = state.finalCase;
  const set = (p: Partial<FinalCaseState>) => update((s) => ({ ...s, finalCase: { ...s.finalCase, ...p } }));
  const [step, setStep] = useState(0);
  const basis = fc.saleBasis;
  const setBasis = (saleBasis: PriceBasis) => set({ saleBasis });

  const calc = useMemo(() => {
    const values = finalCaseValues(fc, basis, ASKING);
    const ev = evaluateScenario(values);
    const rows = evaluateCourseSaleCases(values).map(({ key: k, sale: v, evaluation }) => {
      const rec = evaluation?.recommendedMaxBid;
      const bid = rec?.limits.find((l) => l.id === rec.limitedBy)?.result;
      return { k, v, bid };
    });
    return { ev, rows };
  }, [fc, basis]);

  const correctPicked = OPTIONS.filter((o) => o.correct && fc.selected.includes(o.id)).length;
  const wrongPicked = OPTIONS.filter((o) => !o.correct && fc.selected.includes(o.id)).length;
  const renoSum = fc.items.every((i) => i.amount !== null) ? fc.items.reduce((s, i) => s + (i.amount ?? 0), 0) : null;
  const b = (fc.reservePct ?? 0) / 100;
  const baseBid = calc.rows.find((r) => r.k === 'base')?.bid;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4" aria-label="Objektet i sluttcaset">
        <h4 className="font-semibold">Objektet (fiktivt)</h4>
        <dl className="mt-2 grid grid-cols-1 gap-x-6 text-sm sm:grid-cols-2">
          {CASE_FACTS.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-slate-100 py-1.5">
              <dt className="text-slate-600">{k}</dt>
              <dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <nav aria-label="Trinn i sluttcaset">
        <ol className="flex flex-wrap gap-1.5">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => setStep(i)}
                aria-current={i === step ? 'step' : undefined}
                className={clsx('rounded-full border px-3 py-1 text-xs font-medium', i === step ? 'border-pine-700 bg-pine-800 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400')}
              >
                Trinn {i + 1} · {s}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <section className="rounded-xl border border-slate-200 bg-white p-4" aria-live="polite">
        {step === 0 && (
          <div className="space-y-3">
            <h4 className="font-semibold">Trinn 1 – Hva mangler?</h4>
            <p className="text-sm text-slate-700">Velg det som må avklares før du kan ta en beslutning om dette objektet.</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {OPTIONS.map((o) => {
                const on = fc.selected.includes(o.id);
                const shown = fc.checked;
                const state = !shown ? null : o.correct ? (on ? 'ok' : 'missed') : on ? 'wrong' : null;
                return (
                  <label key={o.id} className={clsx('flex items-start gap-2 rounded-lg border px-3 py-2 text-sm', state === 'ok' && 'border-emerald-400 bg-emerald-50', state === 'missed' && 'border-amber-400 bg-amber-50', state === 'wrong' && 'border-red-300 bg-red-50', !state && 'border-slate-200')}>
                    <input type="checkbox" className="mt-0.5 size-4 accent-pine-700" disabled={fc.checked} checked={on} onChange={(e) => set({ selected: e.target.checked ? [...fc.selected, o.id] : fc.selected.filter((x) => x !== o.id) })} />
                    <span>
                      {o.label}
                      {state === 'ok' && <span className="block text-xs font-medium text-emerald-900">Riktig – dette må avklares</span>}
                      {state === 'missed' && <span className="block text-xs font-medium text-amber-900">Du valgte ikke denne – den må også avklares</span>}
                      {state === 'wrong' && <span className="block text-xs font-medium text-red-900">Dette avgjør ikke kjøpsbeslutningen</span>}
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!fc.checked ? (
                <Button variant="primary" onClick={() => set({ checked: true })}>
                  Sjekk svaret
                </Button>
              ) : (
                <Button variant="ghost" icon={<RotateCcw className="size-4" aria-hidden />} onClick={() => set({ checked: false, selected: [] })}>
                  Prøv på nytt
                </Button>
              )}
              {fc.checked && (
                <span className="text-sm">
                  {correctPicked} av 11 riktige valgt{wrongPicked > 0 ? `, ${wrongPicked} irrelevante valgt` : ''}.
                </span>
              )}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <h4 className="font-semibold">Trinn 2 – Salgsscenario</h4>
            <p className="text-sm text-slate-700">
              Sammenlignbare ferdige boliger ligger på omtrent 3,55–3,75 mill. i relevant prisgrunnlag, og en aktiv konkurrerende ferdig bolig ligger ute til 3,69 mill. Legg inn dine egne tall. Det finnes ingen fasit.
            </p>
            <div>
              <p className="mb-1 text-sm font-medium">Tallene mine er oppgitt som</p>
              <Segmented label="Prisgrunnlag" value={basis} onChange={setBasis} options={[{ value: 'total', label: 'Totalpris (inkl. fellesgjeld)' }, { value: 'kontant', label: 'Kontantpris' }]} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(['low', 'base', 'high'] as const).map((k) => (
                <Field key={k} label={CASE_LABEL[k]} labelAside={<EvidenceTag kind="mine" />}>
                  {(p) => <NumberInput {...p} unit="kr" value={fc[k]} onChange={(v) => set({ [k]: v } as Partial<FinalCaseState>)} />}
                </Field>
              ))}
            </div>
            {(fc.low === null || fc.base === null || fc.high === null) && <p className="text-xs text-amber-900">Tomme felt er uavklarte, ikke 0 kr.</p>}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <h4 className="font-semibold">Trinn 3 – Oppussing</h4>
            <p className="text-sm text-slate-700">Det første anslaget er 300 000 kr samlet. Del det opp, justér tiltakene og velg din egen reserve.</p>
            <div className="space-y-2">
              {fc.items.map((i) => (
                <div key={i.id} className="grid grid-cols-[minmax(0,1fr)_9rem_auto] items-center gap-2">
                  <TextInput aria-label="Tiltak" value={i.label} onChange={(e) => set({ items: fc.items.map((x) => (x.id === i.id ? { ...x, label: e.target.value } : x)) })} />
                  <NumberInput aria-label={`Beløp ${i.label}`} unit="kr" value={i.amount} onChange={(v) => set({ items: fc.items.map((x) => (x.id === i.id ? { ...x, amount: v } : x)) })} />
                  <button type="button" className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-800 disabled:opacity-40" aria-label={`Fjern ${i.label}`} disabled={fc.items.length < 2} onClick={() => set({ items: fc.items.filter((x) => x.id !== i.id) })}>
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              ))}
            </div>
            <Button size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => set({ items: [...fc.items, { id: uuid(), label: '', amount: null }] })}>
              Legg til tiltak
            </Button>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Reserve" labelAside={<EvidenceTag kind="mine" />} hint="Reserve erstatter ikke analyse av identifiserte risikoer.">
                {(p) => <NumberInput {...p} unit="%" value={fc.reservePct} onChange={(v) => set({ reservePct: v })} />}
              </Field>
              <Field label="Egne timer" labelAside={<EvidenceTag kind="mine" />}>
                {(p) => <NumberInput {...p} unit="t" value={fc.hours} onChange={(v) => set({ hours: v })} />}
              </Field>
            </div>
            <p className="num text-sm">
              Oppussing før reserve: <strong>{formatNOK(renoSum)}</strong> · med reserve: <strong>{renoSum === null || fc.reservePct === null ? UNKNOWN : formatNOK(renoSum * (1 + b))}</strong>
            </p>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <h4 className="font-semibold">Trinn 4 – Risiko</h4>
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">Rørrehabilitering</p>
                <EvidenceTag kind={fc.pipeRisk === null ? 'uavklart' : 'mine'} />
              </div>
              <p className="text-sm">Styret diskuterer den, og kostnaden er ikke vedtatt. Den står som <strong>uavklart</strong>, ikke som 0 kr.</p>
              <div className="mt-2 max-w-xs">
                <Field label="Din identifiserte risiko (valgfritt)" hint="Tomt = uavklart. Legges til som egen post uten reserve.">
                  {(p) => <NumberInput {...p} unit="kr" value={fc.pipeRisk} onChange={(v) => set({ pipeRisk: v })} />}
                </Field>
              </div>
            </div>
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">Verdi av ekstra soverom</p>
                <EvidenceTag kind="uavklart" />
              </div>
              <p className="text-sm">Mulig ved kjøkkenflytting, men ikke avklart teknisk og juridisk. Verdien er ikke regnet inn i salgsscenarioene.</p>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <h4 className="font-semibold">Trinn 5 – Maksbud</h4>
            <p className="text-sm text-slate-700">Kalkulatoren regner baklengs fra scenarioene, kostnadene, fortjenestemålet og timekravet ditt. Den laveste relevante grensen brukes. Eksempelforutsetningene kan endres.</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Field label="Fortjenestemål">{(p) => <NumberInput {...p} unit="kr" value={fc.target} onChange={(v) => set({ target: v })} />}</Field>
              <Field label="Rente">{(p) => <NumberInput {...p} unit="%" decimals={1} value={fc.interestPct} onChange={(v) => set({ interestPct: v })} />}</Field>
              <Field label="Låneandel av kjøpesum">{(p) => <NumberInput {...p} unit="%" value={fc.purchaseFinancingPct} onChange={(v) => set({ purchaseFinancingPct: v })} />}</Field>
              <Field label="Låneandel av oppussing">{(p) => <NumberInput {...p} unit="%" value={fc.renovationFinancingPct} onChange={(v) => set({ renovationFinancingPct: v })} />}</Field>
              <Field label="Minimum fortjeneste per egeninnsatstime">{(p) => <NumberInput {...p} unit="kr/t" value={fc.minProfitPerOwnHour} onChange={(v) => set({ minProfitPerOwnHour: v })} />}</Field>
              <Field label="Faste salgskostnader">{(p) => <NumberInput {...p} unit="kr" value={fc.saleFixed} onChange={(v) => set({ saleFixed: v })} />}</Field>
              <Field label="Provisjon">{(p) => <NumberInput {...p} unit="%" decimals={1} value={fc.commissionPct} onChange={(v) => set({ commissionPct: v })} />}</Field>
              <Field label="Kjøpsgebyrer">{(p) => <NumberInput {...p} unit="kr" value={fc.buyFees} onChange={(v) => set({ buyFees: v })} />}</Field>
              <Field label="Illustrativ verdi av egen tid" hint="Separat alternativverdi, ikke kostnad i maksbudet.">{(p) => <NumberInput {...p} unit="kr/t" value={fc.hourValue} onChange={(v) => set({ hourValue: v })} />}</Field>
            </div>
            <p className="text-xs text-slate-600">Borettslag: ingen dokumentavgift. Felleskostnader 5 800 kr/mnd i 6 måneder. Fellesgjeld 350 000 kr ved kjøp og salg. Eksempelforutsetninger – ikke fasit.</p>
            {calc.ev.evaluation.status !== 'complete' ? (
              <Alert tone="warning" title="Kalkylen er ufullstendig">
                <ul className="list-disc pl-4">
                  {calc.ev.missing.map((m) => (
                    <li key={m.field + m.label}>{m.label}</li>
                  ))}
                </ul>
              </Alert>
            ) : (
              <div className="space-y-3">
                {fc.pipeRisk === null && <Alert tone="warning" title="Betinget regneeksempel">Rørrehabiliteringen er uavklart og holdes utenfor dette regneeksempelet. Tallene er ikke et ubetinget anbefalt bud. Avklar risikoen eller legg inn et eksplisitt risikoscenario.</Alert>}
                <BreakdownRows b={calc.ev.evaluation.base!} />
                <MaxBidSummary evaluation={calc.ev.evaluation} purchasePrice={ASKING} />
                <table className="num w-full text-sm">
                  <thead className="text-left text-xs text-slate-600">
                    <tr>
                      <th className="py-1 font-medium">Scenario</th>
                      <th className="py-1 text-right font-medium">Salgspris</th>
                      <th className="py-1 text-right font-medium">Anbefalt maksbud (kontant)</th>
                      <th className="py-1 text-right font-medium">Tilsvarer gjeldsinkludert</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-pine-200">
                    {calc.rows.map(({ k, v, bid }) => (
                      <tr key={k}>
                        <th scope="row" className="py-1.5 text-left font-normal">{CASE_LABEL[k]}</th>
                        <td className="py-1.5 text-right">{formatNOK(v)}</td>
                        <td className="py-1.5 text-right font-semibold">{bidText(bid)}</td>
                        <td className="py-1.5 text-right">{bid?.price != null ? formatNOK(bid.price + DEBT) : '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {fc.pipeRisk === null && (
                  <p className="mt-2 text-sm font-medium text-amber-950">
                    Maksbudet er betinget: det er regnet uten rørrehabilitering og uten verdi av nytt soverom. Begge er uavklarte, ikke 0 kroner. Prisantydningen er {formatNOK(ASKING)} kontant.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-3">
            <h4 className="font-semibold">Trinn 6 – Beslutning</h4>
            <p className="text-sm text-slate-700">Hva vil du gjøre med dette objektet?</p>
            <div role="radiogroup" aria-label="Beslutning" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.keys(DECISION_LABEL) as Decision[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={fc.decision === d}
                  onClick={() => set({ decision: d })}
                  className={clsx('rounded-lg border px-3 py-3 text-sm font-semibold', fc.decision === d ? 'border-pine-700 bg-pine-800 text-white' : 'border-slate-300 bg-white hover:border-pine-500')}
                >
                  {fc.decision === d && <Check className="mr-1 inline size-4" aria-hidden />}
                  {DECISION_LABEL[d]}
                </button>
              ))}
            </div>
            {fc.decision && (
              <div className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm" role="status">
                <p>
                  Du valgte <strong>{DECISION_LABEL[fc.decision]}</strong>. Kurset gir ingen fasit: poenget er at du kan forklare valget med kalkylen, scenarioene og det du ikke vet.
                </p>
                <p>
                  Rørrehabilitering{fc.pipeRisk === null ? ' og nytt soverom er fortsatt uavklart' : ' er prissatt av deg, men nytt soverom er fortsatt uavklart'}. Med slike uavklarte forhold kan «kjøpsklart» ikke fremstilles som en sikker konklusjon.
                </p>
                {baseBid?.price != null && (
                  <p className="num">
                    Ditt modellerte maksbud i base er {formatNOK(baseBid.price)} (kontant), mot prisantydning {formatNOK(ASKING)}.
                  </p>
                )}
                {fc.decision === 'interessant' && fc.pipeRisk === null && (
                  <p className="font-medium text-amber-950">Du valgte «Interessant» med uavklart rørrehabilitering. Det kan være forsvarlig bare hvis maksbudet er satt konservativt og du har en plan for å avklare før bud.</p>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      <div className="flex justify-between gap-2">
        <Button disabled={step === 0} onClick={() => setStep(step - 1)}>
          ← Forrige trinn
        </Button>
        <Button variant="primary" disabled={step === STEPS.length - 1} onClick={() => setStep(step + 1)}>
          Neste trinn →
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sluttquiz
// ---------------------------------------------------------------------------

export function FinalQuiz() {
  const { state, update } = useCourse();
  const score = finalQuizScore(state);
  const total = FINAL_QUIZ.length;
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-700">
        {total} spørsmål. Bestått er minst {PASS_MARK} av {total} riktige. Du får forklaring etter hvert svar.
      </p>
      <div className="rounded-xl border border-slate-200 bg-white p-4" aria-live="polite">
        <p className="font-semibold">
          Besvart {score.answered} av {total}
          {score.answered > 0 && <span className="ml-2 text-slate-600">· {score.correct} riktige</span>}
        </p>
        <div className="mt-2 h-1.5 rounded-full bg-slate-100" role="img" aria-label={`${score.answered} av ${total} besvart`}>
          <div className="h-1.5 rounded-full bg-[var(--color-series-1)]" style={{ width: `${(score.answered / total) * 100}%` }} />
        </div>
      </div>
      {FINAL_QUIZ.map((q, i) => (
        <Quiz key={q.id} q={q} store="final" label={`Spørsmål ${i + 1} av ${total}`} />
      ))}
      {score.answered === total && (
        <Alert tone={score.passed ? 'success' : 'warning'} title={score.passed ? `Bestått – ${score.correct} av ${total} riktige` : `Ikke bestått ennå – ${score.correct} av ${total} riktige`}>
          {score.passed ? (
            <p>Du kan åpne fullføringssiden fra innholdsfortegnelsen.</p>
          ) : (
            <p>Det kreves minst {PASS_MARK} riktige. Start på nytt og les forklaringene.</p>
          )}
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" icon={<RotateCcw className="size-4" aria-hidden />} onClick={() => update((s) => ({ ...s, final: {} }))}>
          Start sluttquizen på nytt
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fullføringsside
// ---------------------------------------------------------------------------

export function Completion() {
  const { state, setChecklistOpen } = useCourse();
  const score = finalQuizScore(state);
  if (!score.passed) {
    return (
      <Alert tone="info" title="Fullføringssiden åpnes når sluttquizen er bestått">
        <p>
          Du må ha minst {PASS_MARK} av {FINAL_QUIZ.length} riktige. Foreløpig: {score.correct} riktige av {score.answered} besvarte.
        </p>
      </Alert>
    );
  }
  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-gradient-to-br from-pine-900 to-pine-700 p-6 text-white">
        <CircleCheck className="size-8" aria-hidden />
        <h2 className="mt-2 text-2xl font-semibold">Du har fullført {COURSE_TITLE}</h2>
        <p className="mt-2 text-pine-50">
          Du skal nå kunne gå fra en boligannonse til en begrunnet beslutning om objektet er verdt å undersøke videre og hvor mye prosjektet maksimalt tåler at du betaler.
        </p>
        <p className="mt-1 text-sm text-pine-100">Resultat: {score.correct} av {FINAL_QUIZ.length} riktige i sluttquizen.</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5 text-lg font-semibold leading-relaxed">
        <p>Finn verdi.</p>
        <p>Finn kostnader.</p>
        <p>Finn det du ikke vet.</p>
        <p>Stresstest.</p>
        <p>Verdsett tiden.</p>
        <p>Regn baklengs til maksbud.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link to="/oversikt" className={buttonClass('primary', 'lg')}>
          Analyser et objekt i Flippsjekk <ArrowRight className="size-4" aria-hidden />
        </Link>
        <Button size="lg" onClick={() => setChecklistOpen(true)}>
          Åpne før-bud-sjekklisten
        </Button>
      </div>
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4">
        <p className="text-xs font-semibold tracking-wide text-slate-600 uppercase">Neste kurs</p>
        <p className="font-semibold">{NEXT_COURSE}</p>
        <p className="text-sm text-slate-600">Status: Kommer senere</p>
      </div>
      <p className="text-xs text-slate-600">Regler og markedsdata faglig kontrollert: {COURSE_CHECKED}. Kurset gir generell opplæring og ingen garanti for fortjeneste.</p>
    </div>
  );
}

