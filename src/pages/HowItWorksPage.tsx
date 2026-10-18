import { ArrowRight, CalendarDays, Calculator, ClipboardCheck, Columns3, Gavel, Link2, Scale, ShieldAlert, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useSession } from '../app/session';
import { CalendarScreen, Frame, ListScreen, ObjectScreen } from '../components/marketing/Screens';
import { PublicLayout } from '../components/marketing/PublicLayout';
import { Card } from '../components/ui/primitives';

const STEPS = [
  { icon: Link2, title: 'Lim inn FINN-lenken', text: 'Ingen skjemautfylling. Du limer inn lenken, så lager vi analysen av boligen.' },
  { icon: ClipboardCheck, title: 'Få et begrunnet grunnlag', text: 'Oppussing per rom, salgsverdi i tre scenarioer, risikoer og hva som mangler av dokumentasjon.' },
  { icon: Calculator, title: 'Lag din egen kalkyle', text: 'Endre kjøpspris, rente, tid og tiltak. Alle tall oppdateres med en gang, og scenarioene er private.' },
  { icon: Gavel, title: 'Planlegg visning og bud', text: 'Kalender med alle visninger og forventet buddag, og et modellert maksbud for målet ditt.' },
];

const FEATURES = [
  { icon: Scale, title: 'Faktiske salg skilt fra prisantydning', text: 'Sammenligningsobjekter merkes som faktisk salg, prisantydning eller solgt uten dokumentert sum.' },
  { icon: ShieldAlert, title: 'Risiko og datakvalitet hver for seg', text: 'Manglende tilstandsrapport er en usikkerhet – aldri lav risiko. Ukjent vises som ukjent.' },
  { icon: Calculator, title: 'Én beregningsmotor', text: 'Fortjeneste før skatt, prosjektavkastning, nullpunkt, maksbud og stresstester – deterministisk og sporbart.' },
  { icon: Users, title: 'Dine tall er dine', text: 'Kjøpsplaner, notater, risikovurderinger og scenarioer er private og deles aldri med andre.' },
  { icon: CalendarDays, title: 'Visninger og budplan', text: 'Alle annonserte visninger, private avtaler og eksport til kalenderen din (.ics).' },
  { icon: Columns3, title: 'Sammenlign inntil tre objekter', text: 'Samme nøkkeltall side om side, beregnet fra scenarioet du har valgt som primært.' },
];

function Showcase({ n, title, text, points, children }: { n: number; title: string; text: string; points: string[]; children: ReactNode }) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-10" aria-labelledby={`vis-${n}`}>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.7fr] lg:gap-10">
        <div className="lg:sticky lg:top-6">
          <p className="text-sm font-medium text-pine-800">Skjerm {n} av 3</p>
          <h3 id={`vis-${n}`} className="mt-1 text-2xl font-semibold tracking-tight">
            {title}
          </h3>
          <p className="mt-2 text-slate-700">{text}</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}

export function HowItWorksPage() {
  const { session } = useSession();
  const cta = session ? '/oversikt' : '/logg-inn';
  return (
    <PublicLayout>
      <section className="bg-gradient-to-b from-pine-50 to-white">
        <div className="mx-auto max-w-6xl px-4 py-12 lg:py-16">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">Slik fungerer det</h1>
          <p className="mt-3 max-w-2xl text-lg text-slate-700">Fire steg fra boligannonse til en begrunnet beslutning – og et blikk inn i tjenesten.</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10" aria-labelledby="steg">
        <h2 id="steg" className="sr-only">
          Fire steg
        </h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-pine-50 text-pine-800">
                  <s.icon className="size-5" aria-hidden />
                </span>
                <span className="text-sm font-medium text-slate-500">Steg {i + 1}</span>
              </div>
              <h3 className="mt-3 font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="border-t border-slate-100 bg-canvas py-6">
        <div className="mx-auto max-w-6xl px-4 pt-6">
          <h2 className="text-2xl font-semibold tracking-tight">Slik ser det ut</h2>
          <p className="mt-1 text-slate-700">Tre skjermer du bruker hele veien. Illustrasjonene bruker fiktive tall og samme beregningsmotor som tjenesten.</p>
        </div>

        <Showcase
          n={1}
          title="Oversikt over boligene dine"
          text="Alle objektene du følger, i én liste. Se vurdering, forventet resultat, modellert maksbud, risiko og datakvalitet side om side."
          points={['Sorter og filtrer etter det som er viktig for deg', 'Resultat og maksbud følger scenarioet du har valgt', 'Risiko og datakvalitet vises hver for seg']}
        >
          <Frame url="flippsjekk.no/oversikt" label="Oversikt over boliger i liste">
            <ListScreen />
          </Frame>
        </Showcase>

        <Showcase
          n={2}
          title="Inni et objekt"
          text="Her redigerer du budsjett, oppussing og forutsetninger. Nøkkeltallene oppdateres med en gang – prøv selv med glidebryterne."
          points={['Endre kjøpspris, oppussing, reserve, rente og tid', 'Hver post merkes som anslag eller dine egne tall', 'Risikoer fra grunnlaget kan endres, skjules og suppleres – privat']}
        >
          <Frame url="flippsjekk.no/objekter/elvegata-12-b" label="Et objekt der du kan redigere kalkylen">
            <ObjectScreen />
          </Frame>
        </Showcase>

        <Showcase
          n={3}
          title="Kalenderen"
          text="Visninger, forventet buddag og dine egne avtaler på ett sted, som månedskalender eller liste."
          points={['Se hvilke visninger som kolliderer', 'Forventet buddag beregnes fra visningene', 'Eksporter til kalenderen din (.ics)']}
        >
          <Frame url="flippsjekk.no/kalender" label="Kalender med visninger og buddager">
            <CalendarScreen />
          </Frame>
        </Showcase>
      </div>

      <section className="mx-auto max-w-6xl px-4 py-14" aria-labelledby="laget">
        <h2 id="laget" className="text-2xl font-semibold tracking-tight">
          Laget for beslutningen – ikke for å selge drømmen
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title} className="p-5">
              <f.icon className="size-5 text-pine-700" aria-hidden />
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{f.text}</p>
            </Card>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-pine-900 p-6 text-white">
          <div>
            <p className="text-xl font-semibold">Klar til å prøve?</p>
            <p className="text-sm text-pine-100">Demoen bruker fiktive data. Abonnement og pris finner du under Konto.</p>
          </div>
          <Link to={cta} className="inline-flex h-12 items-center gap-2 rounded-lg bg-white px-5 text-base font-semibold text-pine-950 hover:bg-pine-50">
            {session ? 'Til oversikten' : 'Prøv gratis'} <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
}

