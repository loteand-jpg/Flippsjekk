import { ArrowRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { BarList } from '../../components/analysis/charts';
import { Button } from '../../components/ui/primitives';
import { CASE_LABEL, solveMaxBid } from '../../calc/engine';
import { evaluateCourseScenario as evaluateScenario } from '../evaluate';
import { formatNOK, UNKNOWN } from '../../lib/format';
import { CASE_A, CASE_B, CASE_C } from '../caseData';
import { EvidenceTag, FactBox } from '../components';
import { useOpenInCalculator } from './Calculator';

/** Utledede tall for Case A. Brukes både i visningen og i testene. */
export function caseAFigures() {
  const ev = evaluateScenario(CASE_A);
  const resolved = ev.evaluation.resolved!;
  const target = { kind: 'profit' as const, value: 300_000 };
  return {
    ev,
    low: ev.evaluation.cases.low!,
    base: ev.evaluation.cases.base!,
    high: ev.evaluation.cases.high!,
    maxHigh: solveMaxBid(resolved, CASE_A.saleHigh!, target),
    maxBase: solveMaxBid(resolved, CASE_A.saleBase!, target),
  };
}

const ROWS: { label: string; value: string; tag: Parameters<typeof EvidenceTag>[0]['kind'] }[] = [
  { label: 'Kjøpesum', value: '3 000 000 kr', tag: 'mine' },
  { label: 'Oppussing før reserve', value: '220 000 kr', tag: 'analyse' },
  { label: 'Reserve', value: '20 % → oppussing inkl. reserve 264 000 kr', tag: 'mine' },
  { label: 'Dokumentavgift', value: '75 000 kr (2,5 % av 3 000 000)', tag: 'dokumentert' },
  { label: 'Andre kjøpskostnader', value: '2 000 kr', tag: 'mine' },
  { label: 'Prosjekt', value: '6 måneder', tag: 'mine' },
  { label: 'Månedlig drift', value: '5 000 kr', tag: 'analyse' },
  { label: 'Finansiert andel', value: '90 %', tag: 'mine' },
  { label: 'Prosjektrente i regnestykket', value: '5,8 %', tag: 'mine' },
  { label: 'Fast salgskostnad', value: '80 000 kr', tag: 'analyse' },
  { label: 'Provisjon', value: '1,5 %', tag: 'analyse' },
  { label: 'Egne timer / egen tid', value: '250 timer à 350 kr', tag: 'mine' },
  { label: 'Salgsverdi lav / base / høy', value: '3 300 000 / 3 500 000 / 3 800 000 kr', tag: 'analyse' },
];

export function CaseAWidget() {
  const open = useOpenInCalculator();
  const f = useMemo(caseAFigures, []);
  const cases = [
    { k: 'low' as const, b: f.low },
    { k: 'base' as const, b: f.base },
    { k: 'high' as const, b: f.high },
  ];
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h4 className="font-semibold">Forutsetningene (alle fiktive)</h4>
        <dl className="mt-2 divide-y divide-slate-100 text-sm">
          {ROWS.map((r) => (
            <div key={r.label} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-1.5">
              <dt className="text-slate-700">{r.label}</dt>
              <dd className="num flex items-center gap-2 text-right font-medium">
                {r.value}
                <EvidenceTag kind={r.tag} />
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h4 className="font-semibold">Resultat før skatt og egen tid – regnet med motoren</h4>
        <table className="num mt-2 w-full text-sm">
          <thead className="text-left text-xs text-slate-600">
            <tr>
              <th className="py-1 font-medium">Scenario</th>
              <th className="py-1 text-right font-medium">Salgspris</th>
              <th className="py-1 text-right font-medium">Resultat</th>
              <th className="py-1 text-right font-medium">Etter 250 t egen tid</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cases.map(({ k, b }) => (
              <tr key={k}>
                <th scope="row" className="py-1.5 text-left font-normal">
                  {CASE_LABEL[k]}
                </th>
                <td className="py-1.5 text-right">{formatNOK(b.V)}</td>
                <td className={`py-1.5 text-right font-semibold ${b.profit < 0 ? 'text-red-800' : ''}`}>{formatNOK(b.profit)}</td>
                <td className="py-1.5 text-right">{formatNOK(b.profitAfterOwnWork, UNKNOWN)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3">
          <BarList rows={cases.map(({ k, b }) => ({ label: `${CASE_LABEL[k]} salg`, value: b.profit }))} />
        </div>
        <p className="mt-2 text-xs text-slate-600">Med gjeldende modell blir resultatet omtrent –282 000 kr (lav), –85 000 kr (base) og +210 000 kr (høy). Etter separat illustrativ verdsetting av 250 egne timer à 350 kr er høyt scenario ca. 123 000 kr. Timeverdien er ikke en kontant prosjektkostnad.</p>
      </section>

      <FactBox kind="tips" title="Budskap">
        <p>«Jeg kjøper for 3 millioner og selger for 3,5» hørtes ut som en halv million i fortjeneste.</p>
        <p>
          <strong>Etter realistiske kostnader gikk basisscenarioet i minus.</strong>
        </p>
      </FactBox>

      <section className="rounded-xl border border-pine-300 bg-pine-50 p-4">
        <h4 className="font-semibold">Maksbudet regnes baklengs fra resultatkravet</h4>
        <p className="mt-1 text-sm text-slate-800">Dersom investoren krever 300 000 kroner resultat før skatt og egen tid, viser samme modell:</p>
        <dl className="num mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div className="rounded-lg bg-white p-3">
            <dt className="text-xs text-slate-600">I høyt scenario (3,8 mill.) – maksimal kjøpesum</dt>
            <dd className="text-lg font-semibold">{f.maxHigh.price === null ? 'Ingen gjennomførbar pris' : formatNOK(f.maxHigh.price)}</dd>
            <dd className="text-xs text-slate-600">Kurset: rundt 2,91 millioner – ikke 3,0 millioner.</dd>
          </div>
          <div className="rounded-lg bg-white p-3">
            <dt className="text-xs text-slate-600">I base-scenarioet (3,5 mill.) – maksimal kjøpesum</dt>
            <dd className="text-lg font-semibold">{f.maxBase.price === null ? 'Ingen gjennomførbar pris' : formatNOK(f.maxBase.price)}</dd>
            <dd className="text-xs text-slate-600">Kurset: ned mot ca. 2,63 millioner.</dd>
          </div>
        </dl>
        <p className="mt-2 text-sm font-semibold">Maksbudet skal regnes baklengs fra resultatkravet.</p>
      </section>

      <Button variant="primary" icon={<ArrowRight className="size-4" aria-hidden />} onClick={() => open(CASE_A)}>
        Åpne Case A i kalkulatoren
      </Button>
    </div>
  );
}

export function CaseBWidget() {
  const open = useOpenInCalculator();
  const [rehab, setRehab] = useState(false);
  const cash = 2_200_000;
  const debt = 800_000;
  const reno = 180_000;
  const extra = rehab ? 250_000 : 0;
  const evB = useMemo(() => evaluateScenario(CASE_B), []);
  return (
    <article className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-700">Kontantprisen alene forteller nesten ingenting om hvor billig objektet er.</p>
      <dl className="num divide-y divide-slate-100 text-sm">
        <div className="flex items-center justify-between gap-2 py-1.5">
          <dt>Kontantpris</dt>
          <dd className="flex items-center gap-2">{formatNOK(cash)} <EvidenceTag kind="dokumentert" /></dd>
        </div>
        <div className="flex items-center justify-between gap-2 py-1.5">
          <dt>Fellesgjeld</dt>
          <dd className="flex items-center gap-2">{formatNOK(debt)} <EvidenceTag kind="dokumentert" /></dd>
        </div>
        <div className="flex items-center justify-between gap-2 py-1.5">
          <dt>Gjeldsinkludert pris</dt>
          <dd className="font-semibold">{formatNOK(cash + debt)}</dd>
        </div>
        <div className="flex items-center justify-between gap-2 py-1.5">
          <dt>Oppussing</dt>
          <dd className="flex items-center gap-2">{formatNOK(reno)} <EvidenceTag kind="analyse" /></dd>
        </div>
        <div className="flex items-center justify-between gap-2 py-1.5">
          <dt>Mulig ny andel fellesgjeld etter rehabilitering</dt>
          <dd className="flex items-center gap-2">{formatNOK(250_000)} <EvidenceTag kind="uavklart" /></dd>
        </div>
      </dl>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 size-4 accent-pine-700" checked={rehab} onChange={(e) => setRehab(e.target.checked)} />
        <span>Regn med at rehabiliteringen vedtas og gir ny fellesgjeld</span>
      </label>
      <p className="num rounded-lg bg-slate-50 p-3 text-sm" aria-live="polite">
        Gjeldsinkludert pris + oppussing: <strong>{formatNOK(cash + debt + reno + extra)}</strong>
        <span className="block text-xs text-slate-600">Uten kjøpskostnader, renter, drift og salgskostnader.</span>
      </p>
      <p className="text-sm text-slate-700">
        Kalkylen i kalkulatoren er {evB.evaluation.status === 'complete' ? 'komplett' : 'ufullstendig'}: {evB.missing.length} inngangsverdier mangler, blant dem salgsverdi. Ukjent er ikke 0 kroner.
      </p>
      <Button icon={<ArrowRight className="size-4" aria-hidden />} onClick={() => open(CASE_B)}>
        Åpne i kalkulatoren
      </Button>
    </article>
  );
}

export function CaseCWidget() {
  const open = useOpenInCalculator();
  const buy = 3_800_000;
  const reno = 450_000;
  const sale = 4_900_000;
  return (
    <article className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <dl className="num divide-y divide-slate-100 text-sm">
        <div className="flex justify-between py-1.5">
          <dt>Kjøp</dt>
          <dd>{formatNOK(buy)}</dd>
        </div>
        <div className="flex justify-between py-1.5">
          <dt>Planlagt interiøroppussing</dt>
          <dd>{formatNOK(reno)}</dd>
        </div>
        <div className="flex justify-between py-1.5">
          <dt>Antatt salg</dt>
          <dd>{formatNOK(sale)}</dd>
        </div>
        <div className="flex justify-between py-1.5 font-semibold">
          <dt>Salg − kjøp − oppussing</dt>
          <dd>{formatNOK(sale - buy - reno)}</dd>
        </div>
      </dl>
      <p className="text-xs text-slate-600">Dette er før dokumentavgift, reserve, renter, drift, salgskostnader og uavklarte risikoer.</p>
      <div>
        <p className="mb-1.5 text-sm font-medium">Men</p>
        <ul className="space-y-1.5 text-sm">
          {['Gammel drenering', 'Fuktindikasjon', 'Tak nær forventet levetid', 'Avløpsledning uavklart'].map((r) => (
            <li key={r} className="flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-1.5">
              <span>{r}</span>
              <EvidenceTag kind="uavklart" />
            </li>
          ))}
        </ul>
      </div>
      <p className="rounded-lg bg-pine-50 p-3 text-sm font-medium text-pine-950">20 % reserve på interiøroppussing løser ikke ukjente sekssifrede husrisikoer.</p>
      <Button icon={<ArrowRight className="size-4" aria-hidden />} onClick={() => open(CASE_C)}>
        Åpne i kalkulatoren (med eksempelinnstillinger)
      </Button>
    </article>
  );
}
