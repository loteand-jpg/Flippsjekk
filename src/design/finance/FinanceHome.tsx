import { ArrowRight, BadgeCheck, Calculator, Gauge, Hammer, Home, ShieldAlert, Wallet } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { recommendedBidOf } from '../../calc/engine';
import { evaluateScenario } from '../../calc/scenario';
import { EXAMPLE } from '../../components/marketing/example';
import { AnalyzeBox } from '../../components/property/AnalyzeBox';
import { PLANS } from '../../config/plans';
import { useSession } from '../../app/session';
import { formatNOK, formatNOKSigned, formatPct } from '../../lib/format';
import { Fig, Metric, Pill, Surface } from './parts/primitives';
import { maxBidLine } from './present';

const FINDINGS = [
  { icon: Home, title: 'Forventet salgsverdi', text: 'Hva boligen kan selges for etter oppussing, med et intervall som viser hvor sikkert anslaget er.' },
  { icon: Hammer, title: 'Oppussingsbehov', text: 'Hva som bør gjøres, hva det koster, og hvem som gjør jobben – du eller en fagperson.' },
  { icon: Calculator, title: 'Prosjektkostnad', text: 'Kjøp, kjøpskostnader, oppussing, renter, drift og salg samlet i én kalkyle du kan justere.' },
  { icon: Wallet, title: 'Fortjeneste', text: 'Forventet resultat før skatt, prosjektavkastning og fortjeneste per time du selv legger ned.' },
  { icon: ShieldAlert, title: 'Risiko', text: 'Hva som kan gå galt, hvorfor, og hva du bør avklare før du byr.' },
  { icon: Gauge, title: 'Maksbud', text: 'Den høyeste prisen som fortsatt oppfyller målene dine – med forklaring på hva som setter grensen.' },
];

/** Illustrert eksempelresultat. Beregnet med samme motor som resten av appen (fiktive tall). */
function ExampleResult() {
  const ev = useMemo(
    () =>
      evaluateScenario({
        ...EXAMPLE,
        purchaseFinancingPct: 90,
        renovationFinancingPct: 0,
        availableEquity: 600_000,
        minProfitPerOwnHour: 500,
        saleFixedCost: 120_000,
        saleCommissionPct: 0,
      }).evaluation,
    [],
  );
  const b = ev.base;
  const bid = recommendedBidOf(ev);
  if (!b || bid.price === null) return null;
  const floorK = (n: number) => Math.floor(n / 1000) * 1000;
  return (
    <Surface className="overflow-hidden shadow-[0_8px_30px_-12px_rgba(21,42,63,0.25)]" aria-label="Eksempel på analyseresultat">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--fin-line)] bg-[var(--fin-surface-muted)] px-5 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Elvekanten 17 B</p>
          <p className="truncate text-xs text-slate-600">Møllenberg · 58 m² · selveier</p>
        </div>
        <Pill tone="info">Eksempel · demodata</Pill>
      </div>
      <div className="px-5 pt-5 pb-2">
        <p className="fin-label">Anbefalt maksbud</p>
        <p className="mt-1 text-[2.5rem] leading-none font-semibold tracking-tight sm:text-5xl">
          <Fig>{formatNOK(floorK(bid.price))}</Fig>
        </p>
        <p className="mt-2 text-sm text-slate-700">
          {maxBidLine({ limitedBy: bid.limitedBy, profitTarget: EXAMPLE.profitTarget, minPerHour: 500 })}
        </p>
        <p className="mt-1 text-xs text-slate-600">Din kjøpspris {formatNOK(b.P)} ligger {formatNOK(Math.abs(floorK(bid.price) - b.P))} {floorK(bid.price) >= b.P ? 'under' : 'over'} maksbudet.</p>
      </div>
      <dl className="fin-metrics grid grid-cols-2 gap-x-6 px-5 pb-3">
        <Metric label="Forventet salgsverdi" value={formatNOK(b.V)} sub="Normalt scenario" />
        <Metric label="Forventet fortjeneste" value={formatNOKSigned(b.profit).replace('+', '')} tone={b.profit < 0 ? 'neg' : 'pos'} sub="Før skatt" />
        <Metric label="Prosjektavkastning" value={formatPct(b.projectReturn)} sub="Fortjeneste ÷ kapital" />
        <Metric label="Per egeninnsatstime" value={b.profitPerOwnHour === null ? 'Ikke beregnet' : `${formatNOK(b.profitPerOwnHour)}/t`} sub="Krav 500 kr/t" unknown={b.profitPerOwnHour === null} />
      </dl>
      <div className="flex flex-wrap gap-2 border-t border-[var(--fin-line)] bg-[var(--fin-surface-muted)] px-5 py-3">
        <Pill tone="warn">Risiko: middels</Pill>
        <Pill tone="pos">Datagrunnlag: høy dekning</Pill>
        <Pill>Anbefalt scenario: Standardheving</Pill>
      </div>
    </Surface>
  );
}

export function FinanceHome() {
  const { session } = useSession();
  const plan = PLANS[0];
  return (
    <>
      <section className="border-b border-[var(--fin-line)] bg-gradient-to-b from-white to-[var(--color-canvas)]">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14 lg:py-20">
          <div className="min-w-0">
            <p className="fin-label">Beslutningsstøtte for boligflipp</p>
            <h1 className="mt-3 text-[2.125rem] leading-[1.12] font-semibold tracking-tight text-balance sm:text-5xl">Vit hva du maksimalt bør by – før du byr.</h1>
            <p className="mt-5 max-w-xl text-base text-slate-700 sm:text-lg">
              Lim inn en FINN-lenke. Flippsjekk anslår salgsverdien etter oppussing, regner ut hva prosjektet koster og hva du kan tjene, og viser hvor høyt du høyst bør by – med risiko og datagrunnlag
              tydelig oppgitt.
            </p>
            <Surface className="mt-7 p-4 sm:p-5">
              <AnalyzeBox />
              {!session && <p className="mt-3 text-xs text-slate-600">Du blir bedt om å logge inn før analysen starter. I demoen leses ingen data fra FINN.</p>}
            </Surface>
          </div>
          <ExampleResult />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14" aria-labelledby="finner-ut">
        <h2 id="finner-ut" className="text-2xl font-semibold tracking-tight">
          Dette finner Flippsjekk ut
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">Seks svar på det du trenger å vite før et bud på flere millioner.</p>
        <ul className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {FINDINGS.map((f, i) => (
            <li key={f.title} className="border-t border-[var(--fin-line-strong)] pt-4">
              <div className="flex items-center gap-2 text-pine-800">
                <f.icon className="size-[18px]" aria-hidden />
                <span className="fin-label !text-pine-800">{String(i + 1).padStart(2, '0')}</span>
              </div>
              <h3 className="mt-2 text-base font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{f.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-y border-[var(--fin-line)] bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-3">
          {[
            ['Etterprøvbart', 'Alle tall regnes av en åpen, deterministisk kalkylemotor. Agenten leverer fakta og anslag – aldri fortjeneste eller maksbud.'],
            ['Usikkerhet er synlig', 'Ukjent er aldri 0 kr. Mangler grunnlag, står det – og risiko og datagrunnlag vises ved siden av resultatet.'],
            ['Dine tall styrer', 'Alle forutsetninger kan overstyres privat, med tydelig opprinnelse og mulighet til å tilbakestille.'],
          ].map(([t, x]) => (
            <div key={t}>
              <p className="flex items-center gap-2 text-base font-semibold">
                <BadgeCheck className="size-[18px] text-pine-800" aria-hidden />
                {t}
              </p>
              <p className="mt-1.5 text-sm text-slate-600">{x}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-10">
        <div>
          <p className="text-base font-semibold">
            {plan.name}: {formatNOK(plan.priceMonthly)} per måned
          </p>
          <p className="text-sm text-slate-600">{plan.campaign ?? plan.tagline}. Eksempelpris i demoen – ingen betaling behandles.</p>
        </div>
        <Link to={session ? '/oversikt' : '/logg-inn'} className="inline-flex h-11 items-center gap-2 rounded-lg border border-[var(--fin-line-strong)] bg-white px-5 text-sm font-medium hover:bg-slate-50">
          {session ? 'Til oversikten' : 'Prøv gratis'} <ArrowRight className="size-4" aria-hidden />
        </Link>
      </section>
    </>
  );
}
