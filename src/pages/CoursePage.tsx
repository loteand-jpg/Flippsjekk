import clsx from 'clsx';
import { ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ChevronDown, ClipboardList, Clock, GraduationCap, Layers, Lock, RotateCcw, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useSession } from '../app/session';
import { TextInput } from '../components/ui/forms';
import { Dialog } from '../components/ui/overlay';
import { Badge, Button, buttonClass, Card } from '../components/ui/primitives';
import { Blocks } from '../course/BlockView';
import { RichText } from '../course/components';
import { MINUTES_PER_PAGE, MODULE_COUNT, MODULES, PAGE_COUNT, TOTAL_MINUTES, TOTAL_UNITS, moduleById } from '../course/content';
import { GLOSSARY } from '../course/glossary';
import { CourseProvider, moduleStatus, readProgress, useCourse } from '../course/progress';
import { COURSE_CHECKED, COURSE_ID, COURSE_SUBTITLE, COURSE_TITLE, FINISH_STEPS, type CourseModule, type FinishId } from '../course/types';
import { BEFORE_BID, ChecklistWidget } from '../course/widgets/Checklists';
import { Completion, FinalCase, FinalQuiz } from '../course/widgets/Finish';
import { Quiz } from '../course/widgets/Quiz';

const hours = (min: number) => `${Math.floor(min / 60)} t ${min % 60} min`;

/** Et sted i kurset. */
type Loc = { kind: 'page'; module: string; index: number } | { kind: 'quiz'; module: string } | { kind: 'finish'; id: FinishId };

const locString = (l: Loc) => (l.kind === 'page' ? `${l.module}:${l.index}` : l.kind === 'quiz' ? `${l.module}:q` : l.id);

function parseLoc(modul: string | null, side: string | null): Loc | null {
  if (!modul) return null;
  const f = FINISH_STEPS.find((s) => s.id === modul);
  if (f) return { kind: 'finish', id: f.id };
  const m = moduleById(modul);
  if (!m) return null;
  if (side === 'q') return { kind: 'quiz', module: m.id };
  const n = Number(side ?? '1');
  const index = Number.isInteger(n) && n >= 1 && n <= m.pages.length ? n - 1 : 0;
  return { kind: 'page', module: m.id, index };
}

function fromLocString(s: string | null): Loc | null {
  if (!s) return null;
  const [a, b] = s.split(':');
  if (b === undefined) return FINISH_STEPS.some((f) => f.id === a) ? { kind: 'finish', id: a as FinishId } : null;
  const m = moduleById(a);
  if (!m) return null;
  if (b === 'q') return { kind: 'quiz', module: m.id };
  const i = Number(b);
  return Number.isInteger(i) && i >= 0 && i < m.pages.length ? { kind: 'page', module: m.id, index: i } : null;
}

/** Hele kurset som én rekkefølge av steg. */
const SEQUENCE: Loc[] = [
  ...MODULES.flatMap((m): Loc[] => [...m.pages.map((_, index): Loc => ({ kind: 'page', module: m.id, index })), { kind: 'quiz', module: m.id }]),
  ...FINISH_STEPS.map((f): Loc => ({ kind: 'finish', id: f.id })),
];

function Progress({ percent, text, light }: { percent: number; text: string; light?: boolean }) {
  return (
    <div>
      <div className={clsx('h-2 rounded-full', light ? 'bg-white/25' : 'bg-slate-100')} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Kursfremdrift">
        <div className={clsx('h-2 rounded-full transition-all', light ? 'bg-white' : 'bg-pine-700')} style={{ width: `${percent}%` }} />
      </div>
      <p className={clsx('mt-1 text-xs', light ? 'text-pine-50' : 'text-slate-600')}>{text}</p>
    </div>
  );
}

function ModuleNav({ current, onPick }: { current: Loc | null; onPick: (l: Loc | null) => void }) {
  const { state, isRead, setChecklistOpen } = useCourse();
  const curModule = current && current.kind !== 'finish' ? current.module : null;
  const sameLoc = (a: Loc, b: Loc | null) => b !== null && locString(a) === locString(b);
  return (
    <nav aria-label="Innholdsfortegnelse" className="space-y-1">
      <button
        type="button"
        onClick={() => onPick(null)}
        aria-current={current === null ? 'page' : undefined}
        className={clsx('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm', current === null ? 'bg-pine-50 font-semibold text-pine-950' : 'text-slate-700 hover:bg-slate-100')}
      >
        Om kurset
      </button>
      <ol className="space-y-0.5">
        {MODULES.map((m) => {
          const st = moduleStatus(state, m);
          const active = curModule === m.id;
          return (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onPick({ kind: 'page', module: m.id, index: 0 })}
                aria-current={active ? 'true' : undefined}
                className={clsx('flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm', active ? 'bg-pine-50 font-semibold text-pine-950' : 'text-slate-700 hover:bg-slate-100')}
              >
                <span className={clsx('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px]', st.done ? 'border-pine-700 bg-pine-700 text-white' : 'border-slate-300 text-slate-600')}>
                  {st.done ? <Check className="size-3" aria-hidden /> : m.num}
                </span>
                <span>
                  {m.title}
                  {st.done && <span className="sr-only"> – fullført</span>}
                  {!active && !st.done && st.read > 0 && (
                    <span className="block text-[11px] font-normal text-slate-500">
                      {st.read} av {st.total} sider lest
                    </span>
                  )}
                </span>
              </button>
              {active && (
                <ol className="mt-0.5 mb-1 ml-5 space-y-0.5 border-l border-slate-200 pl-2">
                  {m.pages.map((p, i) => {
                    const loc: Loc = { kind: 'page', module: m.id, index: i };
                    const on = sameLoc(loc, current);
                    return (
                      <li key={p.id}>
                        <button type="button" onClick={() => onPick(loc)} aria-current={on ? 'page' : undefined} className={clsx('flex w-full items-start gap-1.5 rounded-md px-2 py-1 text-left text-[13px]', on ? 'bg-pine-800 font-medium text-white' : 'text-slate-700 hover:bg-slate-100')}>
                          <span className="mt-0.5 shrink-0 tabular-nums">{p.id}</span>
                          <span className="flex-1">{p.title}</span>
                          {isRead(m.id, i) && <Check className={clsx('mt-0.5 size-3 shrink-0', on ? 'text-white' : 'text-pine-700')} aria-label="Lest" />}
                        </button>
                      </li>
                    );
                  })}
                  <li>
                    <button
                      type="button"
                      onClick={() => onPick({ kind: 'quiz', module: m.id })}
                      aria-current={current?.kind === 'quiz' && current.module === m.id ? 'page' : undefined}
                      className={clsx('flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[13px]', current?.kind === 'quiz' && current.module === m.id ? 'bg-pine-800 font-medium text-white' : 'text-slate-700 hover:bg-slate-100')}
                    >
                      Kontrollspørsmål
                      {st.quizDone && <Check className="size-3 shrink-0" aria-label="Besvart" />}
                    </button>
                  </li>
                </ol>
              )}
            </li>
          );
        })}
      </ol>
      <p className="px-2 pt-2 text-xs font-semibold tracking-wide text-slate-600 uppercase">Avslutning</p>
      <ol className="space-y-0.5">
        {FINISH_STEPS.map((f) => {
          const on = current?.kind === 'finish' && current.id === f.id;
          return (
            <li key={f.id}>
              <button type="button" onClick={() => onPick({ kind: 'finish', id: f.id })} aria-current={on ? 'page' : undefined} className={clsx('w-full rounded-lg px-2 py-1.5 text-left text-sm', on ? 'bg-pine-50 font-semibold text-pine-950' : 'text-slate-700 hover:bg-slate-100')}>
                {f.title}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="pt-2">
        <button type="button" onClick={() => setChecklistOpen(true)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-pine-900 hover:bg-pine-50">
          <ClipboardList className="size-4" aria-hidden /> Før-bud-sjekkliste
        </button>
      </div>
    </nav>
  );
}

function GlossaryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const entries = useMemo(
    () =>
      Object.values(GLOSSARY)
        .filter((e) => `${e.term} ${e.def}`.toLowerCase().includes(q.trim().toLowerCase()))
        .sort((a, b) => a.term.localeCompare(b.term, 'nb')),
    [q],
  );
  return (
    <Dialog open={open} onClose={onClose} size="lg" title="Ordliste" description="Begreper som brukes i kurset. Du finner også forklaringene ved å trykke på understrekede ord i teksten.">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <TextInput aria-label="Søk i ordlisten" placeholder="Søk" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <dl className="mt-3 divide-y divide-slate-100">
        {entries.map((e) => (
          <div key={e.term} className="py-2">
            <dt className="font-semibold">{e.term}</dt>
            <dd className="text-sm text-slate-700">{e.def}</dd>
          </div>
        ))}
        {entries.length === 0 && <p className="py-4 text-sm text-slate-600">Ingen treff.</p>}
      </dl>
    </Dialog>
  );
}

function FactDate() {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
      <p className="font-semibold">Regler og markedsdata faglig kontrollert: {COURSE_CHECKED}</p>
      <p className="mt-1 text-slate-700">Skatteregler, finansieringsregler, renter, gebyrer og boligmarked endrer seg. Dagsaktuelle tall i kurset er derfor datostemplet. Kurset gir generell opplæring – ikke juridisk eller skattemessig rådgivning – og ingen garanti for fortjeneste.</p>
    </div>
  );
}

function QuizStep({ m }: { m: CourseModule }) {
  return (
    <div className="space-y-4">
      <p className="text-slate-700">Svar på spørsmålene for å teste at du har fått med deg hovedpoengene i modul {m.num}. Du får forklaring etter hvert svar.</p>
      {m.quiz.map((q, i) => (
        <Quiz key={q.id} q={q} label={`Kontrollspørsmål ${i + 1} av ${m.quiz.length}`} />
      ))}
    </div>
  );
}

function CourseInner() {
  const { state, update, isRead, setRead, percent, doneUnits, modulesDone, reset, checklistOpen, setChecklistOpen } = useCourse();
  const [params, setParams] = useSearchParams();
  const loc = parseLoc(params.get('modul'), params.get('side'));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const go = (l: Loc | null) => {
    setPickerOpen(false);
    if (!l) setParams({});
    else if (l.kind === 'page') setParams({ modul: l.module, side: String(l.index + 1) });
    else if (l.kind === 'quiz') setParams({ modul: l.module, side: 'q' });
    else setParams({ modul: l.id });
    window.scrollTo({ top: 0 });
  };

  const key = loc ? locString(loc) : null;
  useEffect(() => {
    if (key && state.lastLocation !== key) update((s) => ({ ...s, lastLocation: key }));
  }, [key, state.lastLocation, update]);

  const idx = loc ? SEQUENCE.findIndex((l) => locString(l) === key) : -1;
  const prev = idx > 0 ? SEQUENCE[idx - 1] : null;
  const next = idx >= 0 && idx < SEQUENCE.length - 1 ? SEQUENCE[idx + 1] : null;
  const module = loc && loc.kind !== 'finish' ? moduleById(loc.module) ?? null : null;
  const page = loc?.kind === 'page' && module ? module.pages[loc.index] : null;
  const resume = fromLocString(state.lastLocation) ?? ({ kind: 'page', module: '1', index: 0 } as Loc);
  const started = state.lastLocation !== null || doneUnits > 0;
  const progressText = `${doneUnits} av ${TOTAL_UNITS} deler fullført · ${modulesDone} av ${MODULE_COUNT} moduler`;

  const label = (l: Loc) => (l.kind === 'page' ? `${l.module}.${l.index + 1} ${moduleById(l.module)?.pages[l.index].title ?? ''}` : l.kind === 'quiz' ? `Kontrollspørsmål modul ${l.module}` : FINISH_STEPS.find((f) => f.id === l.id)?.title ?? '');
  const goNext = () => {
    if (loc?.kind === 'page') setRead(loc.module, loc.index, true);
    go(next);
  };

  // Hvor er vi? («Modul X av 11 · Side Y av Z»)
  const where = loc
    ? loc.kind === 'finish'
      ? 'Avslutning'
      : `Modul ${module!.num} av ${MODULE_COUNT} · ${loc.kind === 'page' ? `Side ${loc.index + 1} av ${module!.pages.length}` : 'Kontrollspørsmål'}`
    : null;

  return (
    <div className="space-y-5">
      <nav aria-label="Brødsmulesti" className="flex flex-wrap items-center gap-1 text-sm text-pine-800">
        <Link to="/kurs" className="inline-flex items-center gap-1 hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> Kurs
        </Link>
        {loc && (
          <>
            <span aria-hidden>/</span>
            <button type="button" className="hover:underline" onClick={() => go(null)}>
              Nivå 1
            </button>
          </>
        )}
      </nav>

      {!loc && (
        <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-pine-900 to-pine-700 p-6 text-white sm:p-8" aria-labelledby="kurs-tittel">
          <Badge tone="outline" className="bg-white/10 text-white ring-white/30">
            Kursserie · første kurs
          </Badge>
          <h1 id="kurs-tittel" className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            {COURSE_TITLE}
          </h1>
          <p className="mt-2 text-lg text-pine-100">{COURSE_SUBTITLE}</p>
          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-pine-50">
            <li className="inline-flex items-center gap-1.5">
              <Clock className="size-4" aria-hidden /> Forventet tidsbruk: ca. {hours(TOTAL_MINUTES)}
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Layers className="size-4" aria-hidden /> {MODULE_COUNT} moduler · {PAGE_COUNT} sider · sluttcase og sluttquiz
            </li>
            <li className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="size-4" aria-hidden /> Faglig kontrollert: {COURSE_CHECKED}
            </li>
          </ul>
          <div className="mt-5 max-w-md rounded-xl bg-white/10 p-3">
            <Progress light percent={percent} text={progressText} />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" className="inline-flex h-12 items-center gap-2 rounded-lg bg-white px-5 text-base font-semibold text-pine-950 hover:bg-pine-50" onClick={() => go(started ? resume : { kind: 'page', module: '1', index: 0 })}>
              <GraduationCap className="size-5" aria-hidden />
              {started ? 'Fortsett kurset' : 'Start kurset'}
            </button>
            <button type="button" className="inline-flex h-12 items-center gap-2 rounded-lg border border-white/50 px-5 text-base font-medium text-white hover:bg-white/10" onClick={() => setGlossaryOpen(true)}>
              <BookOpen className="size-5" aria-hidden />
              Ordliste
            </button>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="hidden lg:block" aria-label="Kursmeny">
          <div className="sticky top-20 max-h-[calc(100dvh-6rem)] space-y-3 overflow-y-auto pr-1">
            <Card className="p-3">
              <ModuleNav current={loc} onPick={go} />
            </Card>
            <Card className="space-y-2 p-3">
              <Progress percent={percent} text={progressText} />
              <Button size="sm" variant="ghost" icon={<BookOpen className="size-4" aria-hidden />} onClick={() => setGlossaryOpen(true)}>
                Ordliste
              </Button>
              <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" aria-hidden />} onClick={() => setResetOpen(true)}>
                Nullstill fremdrift
              </Button>
            </Card>
          </div>
        </aside>

        <div className="min-w-0 space-y-5">
          {/* Kompakt modulvelger og posisjon på mobil */}
          <div className="space-y-2 lg:hidden">
            <button type="button" onClick={() => setPickerOpen(true)} className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-left text-sm" aria-haspopup="dialog">
              <span className="min-w-0">
                <span className="block text-xs text-slate-600">{where ?? `Moduler · ${modulesDone} av ${MODULE_COUNT} fullført`}</span>
                <span className="block truncate font-semibold">{loc ? (module ? module.title : FINISH_STEPS.find((f) => loc.kind === 'finish' && f.id === loc.id)?.title) : 'Velg modul'}</span>
              </span>
              <ChevronDown className="size-4 shrink-0" aria-hidden />
            </button>
            <Progress percent={percent} text={`${percent} % av kurset`} />
          </div>

          {!loc ? (
            <Landing onPick={go} />
          ) : (
            <article className="mx-auto w-full max-w-3xl space-y-5" aria-labelledby="side-tittel">
              <header>
                <div className="hidden lg:block">
                  <Progress percent={percent} text={progressText} />
                </div>
                <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-pine-800">
                  <span>{where}</span>
                  {page && (
                    <span className="inline-flex items-center gap-1 font-normal text-slate-600">
                      <Clock className="size-3.5" aria-hidden /> ca. {MINUTES_PER_PAGE} min
                    </span>
                  )}
                  {loc.kind === 'page' && isRead(loc.module, loc.index) && (
                    <Badge tone="green" icon={<Check className="size-3" aria-hidden />}>
                      Lest
                    </Badge>
                  )}
                </p>
                <h1 id="side-tittel" className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                  {page ? `${page.id} ${page.title}` : loc.kind === 'quiz' ? `Kontrollspørsmål – ${module!.title}` : FINISH_STEPS.find((f) => loc.kind === 'finish' && f.id === loc.id)?.title}
                </h1>
                {loc.kind === 'page' && loc.index === 0 && module && (
                  <p className="mt-2 rounded-lg bg-pine-50 px-3 py-2 text-sm text-pine-950">
                    <strong>Formål med modulen:</strong> {module.goal}
                  </p>
                )}
              </header>

              {page && <Blocks blocks={page.blocks} />}
              {loc.kind === 'quiz' && module && <QuizStep m={module} />}
              {loc.kind === 'finish' && loc.id === 'sluttcase' && (
                <>
                  <p className="text-slate-700">Bruk det du har lært på ett fiktivt objekt. Caset går i seks trinn, og det finnes ingen fasit. Det som teller er prosessen.</p>
                  <FinalCase />
                </>
              )}
              {loc.kind === 'finish' && loc.id === 'sluttquiz' && <FinalQuiz />}
              {loc.kind === 'finish' && loc.id === 'ferdig' && <Completion />}

              <footer className="space-y-4 border-t border-slate-200 pt-5">
                {loc.kind === 'page' && (
                  <Button
                    variant={isRead(loc.module, loc.index) ? 'secondary' : 'ghost'}
                    icon={<CheckCircle2 className="size-4" aria-hidden />}
                    aria-pressed={isRead(loc.module, loc.index)}
                    onClick={() => setRead(loc.module, loc.index, !isRead(loc.module, loc.index))}
                  >
                    {isRead(loc.module, loc.index) ? 'Markert som lest – angre' : 'Marker siden som lest'}
                  </Button>
                )}
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                  {prev ? (
                    <Button size="lg" className="sm:min-w-44" icon={<ArrowLeft className="size-4" aria-hidden />} aria-label={`Forrige: ${label(prev)}`} onClick={() => go(prev)}>
                      Forrige
                    </Button>
                  ) : (
                    <span />
                  )}
                  {next ? (
                    <Button size="lg" variant="primary" className="sm:min-w-44" aria-label={`Neste: ${label(next)}`} onClick={goNext}>
                      Neste
                      <ArrowRight className="size-4" aria-hidden />
                    </Button>
                  ) : (
                    <Button size="lg" variant="primary" onClick={() => go(null)}>
                      Til kursoversikten
                    </Button>
                  )}
                </div>
                {next && <p className="text-xs text-slate-600">Neste: {label(next)}</p>}
                <FactDate />
              </footer>
            </article>
          )}
        </div>
      </div>

      <Dialog open={pickerOpen} onClose={() => setPickerOpen(false)} title="Velg modul" description={progressText}>
        <ModuleNav current={loc} onPick={go} />
        <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          <Button size="sm" variant="ghost" icon={<BookOpen className="size-4" aria-hidden />} onClick={() => { setPickerOpen(false); setGlossaryOpen(true); }}>
            Ordliste
          </Button>
          <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" aria-hidden />} onClick={() => { setPickerOpen(false); setResetOpen(true); }}>
            Nullstill fremdrift
          </Button>
        </div>
      </Dialog>
      <GlossaryDialog open={glossaryOpen} onClose={() => setGlossaryOpen(false)} />
      <Dialog open={checklistOpen} onClose={() => setChecklistOpen(false)} size="xl" title="Før-bud-sjekkliste" description="Krysser du av her, lagres det på denne enheten. Avkrysningen er din private bekreftelse.">
        <ChecklistWidget id="beforeBid" title="Før-bud-sjekkliste" groups={BEFORE_BID} filename="flippsjekk-for-bud-sjekkliste.txt" />
      </Dialog>
      <Dialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        size="sm"
        title="Nullstille kursfremdrift?"
        footer={
          <>
            <Button onClick={() => setResetOpen(false)}>Avbryt</Button>
            <Button variant="danger" onClick={() => { reset(); setResetOpen(false); go(null); }}>
              Nullstill alt
            </Button>
          </>
        }
      >
        <p className="text-sm">Leste sider, quizsvar, avkrysninger, budsjett, kalkyle og sluttcase som er lagret på denne enheten slettes. Det påvirker ikke objektene eller scenarioene dine i Flippsjekk.</p>
      </Dialog>
    </div>
  );
}

function Landing({ onPick }: { onPick: (l: Loc) => void }) {
  const { state } = useCourse();
  return (
    <div className="space-y-5">
      <FactDate />
      <section aria-labelledby="slik" className="space-y-2">
        <h2 id="slik" className="text-lg font-semibold">
          Slik fungerer kurset
        </h2>
        <p className="text-slate-700">
          Kurset følger din faktiske reise, fra å forstå hva en flipp er til å selge og avslutte prosjektet. Hver modul består av noen få kurssider som du klikker deg gjennom én og én, og avsluttes med kontrollspørsmål. En side regnes som lest når du går videre eller markerer den selv. Alt lagres på din enhet.
        </p>
        <p className="text-slate-700">
          Hele kurset bygger på ett prinsipp: skille mellom dokumentert fakta, analyse eller estimat, din egen forutsetning og det som er uavklart. Ukjent betyr aldri 0 kroner.
        </p>
      </section>
      <section aria-labelledby="moduloversikt">
        <h2 id="moduloversikt" className="mb-3 text-lg font-semibold">
          De 11 modulene
        </h2>
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {MODULES.map((m) => {
            const st = moduleStatus(state, m);
            return (
              <li key={m.id}>
                <button type="button" onClick={() => onPick({ kind: 'page', module: m.id, index: 0 })} className="h-full w-full rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-pine-400 hover:shadow-sm">
                  <span className="flex items-center justify-between gap-2 text-xs text-slate-600">
                    <span className="font-medium text-pine-800">Modul {m.num} av {MODULE_COUNT}</span>
                    <span className="inline-flex items-center gap-2">
                      {m.pages.length} sider
                      {st.done ? <Badge tone="green" icon={<Check className="size-3" aria-hidden />}>Fullført</Badge> : st.read > 0 ? <Badge tone="blue">{st.read} av {st.total} lest</Badge> : null}
                    </span>
                  </span>
                  <span className="mt-1 block font-semibold">{m.title}</span>
                  <span className="mt-1 block text-sm text-slate-700">{m.goal}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-sm text-slate-600">Etter modul 11 følger sluttcase, sluttquiz (bestått er minst 12 av 15) og fullføringssiden.</p>
      </section>
    </div>
  );
}

export function CourseLevel1Page() {
  return (
    <CourseProvider>
      <CourseInner />
    </CourseProvider>
  );
}

const UPCOMING = ['Nivå 2: Flipping gjennom AS', 'Utleie som privatperson', 'Utleie gjennom AS'];

/** /kurs – oversikt over kursserien. */
export function CoursesPage() {
  const { session } = useSession();
  const progress = readProgress(session?.user.id ?? 'anon');
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Kurs</h1>
        <p className="text-sm text-slate-600">En kursserie for vanlige mennesker som vil lære eiendomsinvestering og boligflipping fra bunnen av.</p>
      </div>
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <Badge tone="green">Tilgjengelig</Badge>
            <h2 className="mt-2 text-xl font-semibold">{COURSE_TITLE}</h2>
            <p className="text-slate-700">{COURSE_SUBTITLE}</p>
            <p className="mt-2 text-sm text-slate-600">
              {MODULE_COUNT} moduler · {PAGE_COUNT} sider · ca. {hours(TOTAL_MINUTES)} · kalkulatorer, kontrollspørsmål, sluttcase og sluttquiz · regler og markedsdata faglig kontrollert {COURSE_CHECKED}
            </p>
            <div className="mt-3 max-w-sm">
              <Progress percent={progress.percent} text={`${progress.modulesDone} av ${MODULE_COUNT} moduler fullført`} />
            </div>
          </div>
          <Link to={`/kurs/${COURSE_ID}`} className={buttonClass('primary', 'lg')}>
            {progress.doneUnits > 0 || progress.lastLocation ? 'Fortsett kurset' : 'Åpne kurset'} <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </Card>
      <section aria-labelledby="kommer">
        <h2 id="kommer" className="mb-2 text-lg font-semibold">
          Senere i serien
        </h2>
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {UPCOMING.map((t) => (
            <li key={t} className="flex items-start gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-4 text-slate-600">
              <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold text-slate-800">{t}</p>
                <p className="text-xs">Kommer senere</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

void RichText;
