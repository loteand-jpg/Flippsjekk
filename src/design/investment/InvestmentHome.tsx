import { ArrowRight, GitCompareArrows, Gauge, LineChart, Target } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { recommendedBidOf } from '../../calc/engine';
import { evaluateScenario } from '../../calc/scenario';
import { useSession } from '../../app/session';
import { EXAMPLE } from '../../components/marketing/example';
import { AnalyzeBox } from '../../components/property/AnalyzeBox';
import { formatNOK, formatPct } from '../../lib/format';
import { CountUp } from './CountUp';
import { costSegments, limitRows } from './model/charts';
import { LimitChart } from './charts/LimitChart';
import { Fig, KpiDark, Tag } from './ui';
import { floorToThousand } from '../shared/present';

const FEATURES = [
  { icon: Target, title: 'Mulighet først', text: 'Maksbud, fortjeneste, avkastning og risiko øverst – boligen og detaljene under.' },
  { icon: GitCompareArrows, title: 'Scenarioer som delta', text: 'Se hva ekstra oppussing faktisk gir: salgsverdi, kostnad, tid og timer mot basis.' },
  { icon: Gauge, title: 'Maksbud med forklaring', text: 'Alle grenser vist på én akse, og hva som setter taket for hva du kan by.' },
  { icon: LineChart, title: 'Sensitivitet', text: 'Dra i kjøpsprisen og se fortjeneste, avkastning, kr per time og kapitalbehov endre seg.' },
];

/** Illustrert eksempelcase. Beregnet med samme motor som resten av appen (fiktive tall). */
function ExampleCase() {
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
  const rows = limitRows(ev);
  const segs = costSegments(b);
  const total = segs.reduce((s, x) => s + x.amount, 0);
  const COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'];
  return (
    <section aria-label="Eksempel på investeringscase" className="inv-dark overflow-hidden rounded-2xl border border-white/15 shadow-[0_24px_60px_-24px_rgba(34,211,238,0.35)]">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Elvekanten 17 B</p>
          <p className="inv-muted-d truncate text-xs">Møllenberg · 58 m² · selveier</p>
        </div>
        <Tag dark tone="info">Eksempel · demodata</Tag>
      </div>
      <div className="px-5 pt-5">
        <p className="inv-label">Anbefalt maksbud</p>
        <p className="mt-1 text-[2.6rem] leading-none font-bold tracking-tight sm:text-5xl">
          <CountUp value={floorToThousand(bid.price)} format={formatNOK} animateOnMount duration={1100} className="inv-fig" testId="inv-home-maxbid" />
        </p>
        <p className="inv-muted-d mt-2 text-sm">Din kjøpspris {formatNOK(b.P)} – anbefalt maksbud er laveste av grensene under.</p>
      </div>
      <div className="px-5 pt-4">
        <LimitChart rows={rows.filter((r) => r.counts)} purchase={b.P} floorK={floorToThousand} dark />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-white/10 px-5 py-4">
        <KpiDark label="Forventet fortjeneste" value={formatNOK(b.profit)} tone={b.profit < 0 ? 'neg' : 'pos'} sub="Før skatt" />
        <KpiDark label="Prosjektavkastning" value={formatPct(b.projectReturn)} sub="Fortjeneste ÷ kapital" />
        <KpiDark label="Per egeninnsatstime" value={b.profitPerOwnHour === null ? 'Ikke beregnet' : `${formatNOK(b.profitPerOwnHour)}/t`} sub="Krav 500 kr/t" unknown={b.profitPerOwnHour === null} />
        <KpiDark label="Egenkapitalbehov" value={formatNOK(b.equityNeed)} sub="Tilgjengelig 600 000 kr" />
      </dl>
      <div className="border-t border-white/10 px-5 py-4">
        <p className="inv-label mb-2">Kostnadsfordeling</p>
        <div className="flex h-3 gap-[2px] overflow-hidden rounded" role="img" aria-label={`Kostnader: ${segs.map((s) => `${s.label} ${formatNOK(s.amount)}`).join(', ')}`}>
          {segs.map((s, i) => (
            <span key={s.id} style={{ width: `${(s.amount / total) * 100}%`, background: COLORS[i] }} />
          ))}
        </div>
        <p className="inv-muted-d mt-2 text-xs">
          Samlet kostnad <Fig className="font-semibold text-white">{formatNOK(total)}</Fig> mot salgsverdi <Fig className="font-semibold text-white">{formatNOK(b.V)}</Fig>
        </p>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-white/10 bg-black/20 px-5 py-3">
        <Tag dark tone="warn">Risiko: middels</Tag>
        <Tag dark tone="pos">Datagrunnlag: høy dekning</Tag>
        <Tag dark>Scenario: Standardheving</Tag>
      </div>
    </section>
  );
}

export function InvestmentHome() {
  const { session } = useSession();
  return (
    <>
      <section className="inv-dark">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.02fr)] lg:gap-14 lg:py-20">
          <div className="min-w-0">
            <p className="inv-label !text-cyan-300">Investeringsanalyse for boligflipp</p>
            <h1 className="mt-3 text-[2.2rem] leading-[1.08] font-bold tracking-tight text-balance sm:text-5xl">Finn ut hvor høyt du kan by – før du byr.</h1>
            <p className="inv-muted-d mt-5 max-w-xl text-base sm:text-lg">
              Lim inn en FINN-lenke og få et investeringscase: forventet fortjeneste, prosjektavkastning, kapitalbehov, risiko og et maksbud du kan forklare – med scenarioer og sensitivitet.
            </p>
            <div className="mt-7 rounded-xl bg-white p-4 text-ink shadow-xl sm:p-5">
              <AnalyzeBox />
              {!session && <p className="mt-3 text-xs text-slate-600">Du blir bedt om å logge inn før analysen starter. I demoen leses ingen data fra FINN.</p>}
            </div>
          </div>
          <ExampleCase />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12" aria-labelledby="slik-leser-du">
        <h2 id="slik-leser-du" className="text-xl font-bold tracking-tight">
          Slik leser du et case
        </h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <li key={f.title} className="rounded-xl border border-[var(--inv-line)] bg-white p-4">
              <span className="flex size-9 items-center justify-center rounded-lg bg-pine-50 text-pine-700">
                <f.icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-3 text-sm font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{f.text}</p>
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--inv-line)] bg-white p-5">
          <div>
            <p className="font-semibold">Alle tall regnes av samme åpne kalkylemotor.</p>
            <p className="mt-0.5 text-sm text-slate-600">Agenten leverer fakta og anslag – aldri fortjeneste eller maksbud. Ukjent er aldri 0 kr.</p>
          </div>
          <Link to={session ? '/oversikt' : '/logg-inn'} className="inline-flex h-11 items-center gap-2 rounded-lg bg-pine-800 px-4 text-sm font-semibold text-white hover:bg-pine-900">
            {session ? 'Til pipeline' : 'Prøv gratis'} <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </section>
    </>
  );
}
