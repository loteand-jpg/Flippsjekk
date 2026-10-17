import { ArrowRight, Calculator, Check, ClipboardCheck, Gavel, GraduationCap, LayoutDashboard, PartyPopper, ShieldCheck, Sparkles, Target, Wallet } from 'lucide-react';
import { Link } from 'react-router';
import { useSession } from '../app/session';
import { PublicLayout } from '../components/marketing/PublicLayout';
import { HeroVisual } from '../components/marketing/HeroVisual';
import { Badge, buttonClass, Card } from '../components/ui/primitives';
import { PRIMARY_PLAN } from '../config/plans';
import { formatNOK } from '../lib/format';

const HIGHLIGHTS = [
  { icon: Calculator, title: 'Kalkuler hele prosjektet', text: 'Kostnader, utgifter og salgspris i tre scenarioer – fra kjøp og oppussing til renter, drift og salg.' },
  { icon: Target, title: 'Finn maks budpris', text: 'Sett fortjenestemålet ditt, så regner Flippsjekk baklengs til hva du maksimalt bør by.' },
  { icon: Wallet, title: 'Oversiktlig budsjett', text: 'Alle poster samlet, merket som anslag eller dine egne tall – med reserve for det uventede.' },
  { icon: LayoutDashboard, title: 'Alle boliger og visninger', text: 'Alle aktuelle boliger i én oversikt, og en visningskalender med forventet buddag.' },
  { icon: GraduationCap, title: 'Lær å flippe', text: 'Et kurs i 11 moduler som tar deg fra første annonse til ferdig salg.' },
];

const PROOF = [
  'Kalkulering av kostnader, utgifter og salgspris',
  'Maks budpris',
  'Oversiktlig budsjett',
  'Oversikt over alle aktuelle boliger',
  'Visningskalender',
  'Flippekurs',
];

function Pricing({ cta }: { cta: string }) {
  const plan = PRIMARY_PLAN;
  const perMonthYear = Math.round(plan.priceYearly / 12);
  const saving = plan.priceMonthly * 12 - plan.priceYearly;
  const included = [
    plan.features[0],
    `${plan.limits.newAnalysesPerPeriod} nye analyser per periode – gjenbruk av eksisterende analyser teller ikke`,
    ...plan.features.slice(2),
    'Flippekurs i 11 moduler',
  ];
  const options = [
    { id: 'month', name: 'Månedlig', price: plan.priceMonthly, unit: 'måned', note: 'Avslutt når du vil', best: false },
    { id: 'year', name: 'Årlig', price: plan.priceYearly, unit: 'år', note: `Tilsvarer ${formatNOK(perMonthYear)} per måned – du sparer ${formatNOK(saving)}`, best: true },
  ];
  return (
    <section id="abonnement" className="scroll-mt-8 bg-gradient-to-b from-white to-pine-50" aria-labelledby="pris-tittel">
      <div className="mx-auto max-w-6xl px-4 py-14">
        <div className="mx-auto max-w-2xl text-center">
          <p className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-1.5 text-sm font-semibold text-amber-950 ring-1 ring-amber-300">
            <PartyPopper className="size-4" aria-hidden /> {plan.campaign}
          </p>
          <h2 id="pris-tittel" className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            Prøv {plan.trialDays === 30 ? '1 måned' : `${plan.trialDays} dager`} gratis
          </h2>
          <p className="mt-2 text-slate-700">Full tilgang fra første dag. Velg månedlig eller årlig – du betaler ingenting i kampanjeperioden. Betaling skjer enkelt med Vipps.</p>
        </div>
        <div className="mx-auto mt-8 grid max-w-3xl gap-5 md:grid-cols-2">
          {options.map((o) => (
            <Card key={o.id} className={`relative flex flex-col p-6 ${o.best ? 'ring-2 ring-pine-600 shadow-lg' : ''}`}>
              {o.best && (
                <span className="absolute -top-3 left-6">
                  <Badge tone="pine">Best verdi</Badge>
                </span>
              )}
              <h3 className="text-lg font-semibold">{o.name}</h3>
              <p className="mt-3 flex items-baseline gap-2">
                <span className="num text-4xl font-semibold">{formatNOK(0)}</span>
                <span className="text-slate-600">første måned</span>
              </p>
              <p className="mt-1 text-sm text-slate-700">
                Deretter <strong className="num">{formatNOK(o.price)}</strong> per {o.unit}
              </p>
              <p className="mt-1 text-xs text-slate-600">{o.note}</p>
              <Link to={cta} className={buttonClass(o.best ? 'primary' : 'secondary', 'lg', 'mt-5')}>
                Prøv gratis i 1 måned
              </Link>
              <p className="mt-2 text-center text-xs text-slate-600">Betales med Vipps</p>
            </Card>
          ))}
        </div>
        <ul className="mx-auto mt-8 grid max-w-3xl gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {included.map((f) => (
            <li key={f} className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-pine-700" aria-hidden />
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-center text-xs text-slate-600">Priser og kampanje er eksempelverdier i demoen – ingen betaling behandles, og ingen kommersiell pris er besluttet. Priser inkl. mva.</p>
      </div>
    </section>
  );
}

export function LandingPage() {
  const { session } = useSession();
  const cta = session ? '/oversikt' : '/logg-inn';
  return (
    <PublicLayout>
      <section className="relative overflow-hidden bg-gradient-to-b from-pine-50 via-white to-white">
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-pine-100/60 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 lg:grid-cols-[1.1fr_1fr] lg:py-24">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-pine-900 ring-1 ring-pine-200">
              <Sparkles className="size-3.5" aria-hidden /> For kjøp, oppussing og salg av bolig
            </p>
            <h1 className="text-4xl leading-[1.08] font-semibold tracking-tight text-ink sm:text-6xl">
              Fra FINN-lenke til en <span className="text-pine-700">begrunnet budgrense</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-700 sm:text-xl">
              Se hva som må utbedres, hva boligen kan selges for etter oppussing, hva prosjektet koster totalt – og hvor høyt du kan by for å nå ditt eget fortjenestemål.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to={cta} className={buttonClass('primary', 'lg')}>
                Prøv gratis <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link to="/slik-fungerer-det" className={buttonClass('secondary', 'lg')}>
                Se hvordan det ser ut
              </Link>
            </div>
            <ul className="mt-6 grid gap-x-6 gap-y-2 text-sm font-medium text-slate-800 sm:grid-cols-2">
              {PROOF.map((p) => (
                <li key={p} className="flex items-center gap-2">
                  <Check className="size-4 shrink-0 text-pine-700" aria-hidden /> {p}
                </li>
              ))}
            </ul>
          </div>
          <HeroVisual />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-14" aria-labelledby="hovedtrekk">
        <h2 id="hovedtrekk" className="sr-only">
          Hovedtrekk
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {HIGHLIGHTS.map((h) => (
            <li key={h.title}>
              <Card className="h-full p-5">
                <span className="flex size-10 items-center justify-center rounded-lg bg-pine-50 text-pine-800">
                  <h.icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-3 font-semibold">{h.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{h.text}</p>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-pine-900 text-white">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-12 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <p className="flex items-center gap-2 text-sm font-medium text-pine-100">
              <ShieldCheck className="size-4" aria-hidden /> Laget for beslutningen – ikke for å selge drømmen
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Se oversikten, kalkylen og kalenderen før du bestemmer deg</h2>
            <p className="mt-2 text-pine-100">Vi viser hvordan det ser ut inne i tjenesten – og du kan prøve kalkylen selv.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/slik-fungerer-det" className="inline-flex h-12 items-center gap-2 rounded-lg bg-white px-5 text-base font-semibold text-pine-950 hover:bg-pine-50">
              Slik fungerer det <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link to={cta} className="inline-flex h-12 items-center gap-2 rounded-lg border border-white/50 px-5 text-base font-medium text-white hover:bg-white/10">
              {session ? 'Til oversikten' : 'Prøv gratis'}
            </Link>
          </div>
        </div>
      </section>

      <Pricing cta={session ? '/konto' : '/registrer'} />

      <section className="mx-auto max-w-6xl px-4 py-10 text-center text-sm text-slate-600">
        <p className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          <span className="inline-flex items-center gap-1.5">
            <ClipboardCheck className="size-4 text-pine-700" aria-hidden /> Alle tall er anslag med synlig usikkerhet
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Gavel className="size-4 text-pine-700" aria-hidden /> Ikke pristilbud, verdivurdering eller garanti for fortjeneste
          </span>
        </p>
      </section>
    </PublicLayout>
  );
}
