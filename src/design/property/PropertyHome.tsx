import { ArrowDown, ArrowRight, Calculator, Home, ListChecks, Ruler } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { useSession } from '../../app/session';
import { AnalyzeBox } from '../../components/property/AnalyzeBox';
import { formatNOK } from '../../lib/format';
import { buildExampleCase, type ExampleVersion } from './model/example';
import { Fig, Tag } from './ui';

const mill = (n: number) => `${(n / 1_000_000).toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mill.`;

const QUESTIONS = [
  { icon: Ruler, n: '1', title: 'Hva kan boligen bli?', text: 'Basis og to alternativer vist som tre mulige versjoner av boligen – med soverom, standard og tiltak.' },
  { icon: ListChecks, n: '2', title: 'Hva må gjøres?', text: 'Oppussingen ordnet etter rom og arbeidstype, med kostnad og egeninnsats for hvert rom.' },
  { icon: Calculator, n: '3', title: 'Er det verdt det?', text: 'Salgsverdi, fortjeneste, kapitalbehov og risiko – og et maksbud: hvor høyt du kan gå.' },
];

function VersionColumn({ v, label, emphasis }: { v: ExampleVersion; label: string; emphasis?: boolean }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="prop-label">{label}</p>
      <p className="prop-serif mt-1 text-[2.4rem] leading-none sm:text-5xl">
        {v.bedrooms ?? '–'}
        <span className="ml-1.5 text-base font-normal text-slate-700 sm:text-lg">soverom</span>
      </p>
      <p className="mt-3 text-sm text-slate-700">Salgsverdi</p>
      <p className={`prop-fig text-xl font-semibold sm:text-2xl ${emphasis ? 'text-[var(--prop-pos)]' : ''}`}>{mill(v.sale)}</p>
      <p className="mt-1 text-xs text-slate-600">{v.title}</p>
    </div>
  );
}

/** Eksempelet: «fra dette → til dette» med tydelig merkede demodata. Ingen bilder; tallene regnes av samme motor som resten av appen. */
function ExampleCard() {
  const ex = useMemo(() => buildExampleCase(), []);
  if (!ex) return null;
  const delta = ex.to.sale - ex.from.sale;
  return (
    <section aria-label="Eksempel: fra dette til dette" className="rounded-2xl border border-[var(--prop-line)] bg-[var(--prop-paper)] p-5 shadow-[0_18px_40px_-28px_rgba(43,38,34,0.5)] sm:p-7" data-testid="prop-home-example">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold">{ex.address}</p>
        <Tag tone="info">Eksempel · demodata</Tag>
      </div>
      <p className="mt-0.5 text-xs text-slate-600">{ex.area ? `${ex.area} m²` : 'Areal ukjent'} · fiktiv bolig i demoen</p>
      <div className="mt-5 flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:gap-5">
        <VersionColumn v={ex.from} label="Fra dette" />
        <div className="flex items-center justify-center text-[var(--prop-blue)]" aria-hidden>
          <ArrowRight className="hidden size-8 sm:block" strokeWidth={1.5} />
          <ArrowDown className="size-7 sm:hidden" strokeWidth={1.5} />
        </div>
        <VersionColumn v={ex.to} label="Til dette" emphasis />
      </div>
      <p className="mt-5 rounded-xl bg-[var(--prop-sand-2)] px-3.5 py-3 text-sm text-slate-800">
        Modellert salgsverdi <Fig className="font-semibold">{delta >= 0 ? '+' : '−'} {formatNOK(Math.abs(delta))}</Fig> for versjonen med flere soverom.{' '}
        {ex.to.feasibility === 'klar' ? '' : <>Den kan ikke anbefales ennå: <strong>{ex.to.feasibilityLabel.toLowerCase()}</strong>.</>}
      </p>
      <p className="mt-3 text-xs leading-relaxed text-slate-600">
        Anbefalt maksbud for Basis {ex.from.maxBid === null ? 'ikke beregnet' : <Fig className="font-semibold">{formatNOK(ex.from.maxBid)}</Fig>}. Modellerte tall med demoforutsetninger – ikke et løfte om salgspris. Bilde og plantegning vises når datakilden leverer dem.
      </p>
    </section>
  );
}

export function PropertyHome() {
  const { session } = useSession();
  return (
    <>
      <section className="border-b border-[var(--prop-line)]">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-10 sm:py-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-14 lg:py-20">
          <div className="min-w-0">
            <p className="prop-label">Boliganalyse for oppussingsprosjekter</p>
            <h1 className="prop-serif mt-3 text-[2.6rem] leading-[1.04] text-balance sm:text-[3.6rem] lg:text-[4.2rem]">Se potensialet før du byr.</h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-700 sm:text-lg">
              Lim inn en FINN-lenke og se hva boligen kan bli, hva som må gjøres og om det er verdt investeringen – med et maksbud du kan forklare.
            </p>
            <div className="mt-7 rounded-2xl border border-[var(--prop-line)] bg-[var(--prop-paper)] p-4 shadow-sm sm:p-5">
              <AnalyzeBox />
              {!session && <p className="mt-3 text-xs text-slate-600">Du blir bedt om å logge inn før analysen starter. I demoen leses ingen data fra FINN.</p>}
            </div>
          </div>
          <ExampleCard />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:py-16" aria-labelledby="tre-sporsmal">
        <h2 id="tre-sporsmal" className="prop-serif text-[1.75rem] sm:text-[2.25rem]">
          Tre spørsmål, i denne rekkefølgen
        </h2>
        <ol className="mt-8 grid gap-5 md:grid-cols-3">
          {QUESTIONS.map((q) => (
            <li key={q.n} className="rounded-2xl border border-[var(--prop-line)] bg-[var(--prop-paper)] p-5">
              <div className="flex items-center gap-3">
                <span className="prop-serif flex size-10 items-center justify-center rounded-full bg-[var(--prop-sand)] text-xl">{q.n}</span>
                <q.icon className="size-5 text-[var(--prop-blue)]" strokeWidth={1.5} aria-hidden />
              </div>
              <h3 className="prop-serif mt-4 text-xl">{q.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{q.text}</p>
            </li>
          ))}
        </ol>

        <div className="mt-10 grid gap-5 rounded-2xl border border-[var(--prop-line)] bg-[var(--prop-sand-2)] p-5 sm:p-7 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-center">
          <div>
            <h3 className="prop-serif text-xl sm:text-2xl">Bilder og plantegninger</h3>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-700">
              Boligen står først på hver side. I demoen leser vi ikke annonsen fra FINN, så bilde og plantegning er tydelig merkede plassholdere – ingen oppdiktede bilder. Når en datakilde leverer dem, har de allerede en fast plass.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            <Link to={session ? '/oversikt' : '/logg-inn'} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-pine-700 px-5 text-sm font-semibold text-white hover:bg-pine-800">
              <Home className="size-4" aria-hidden /> {session ? 'Til boligene' : 'Prøv gratis'} <ArrowRight className="size-4" aria-hidden />
            </Link>
            <p className="text-xs text-slate-600">Alle tall regnes av samme åpne kalkylemotor. Agenten leverer fakta og anslag – aldri fortjeneste eller maksbud. Ukjent er aldri 0 kr.</p>
          </div>
        </div>
      </section>
    </>
  );
}
