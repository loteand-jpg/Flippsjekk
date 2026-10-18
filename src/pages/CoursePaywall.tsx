import { ArrowLeft, CheckCircle2, Clock, GraduationCap, Layers, Lock } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { CoursePurchaseDialog } from '../components/account/CoursePurchase';
import { Badge, Card } from '../components/ui/primitives';
import { getCourse } from '../config/courses';
import { MODULE_COUNT, MODULES, PAGE_COUNT, TOTAL_MINUTES } from '../course/content';
import { COURSE_CHECKED, COURSE_ID, COURSE_SUBTITLE, COURSE_TITLE } from '../course/types';
import { formatNOK } from '../lib/format';

const hours = (min: number) => `${Math.floor(min / 60)} t ${min % 60} min`;

const INCLUDED = [
  `${MODULE_COUNT} moduler og ${PAGE_COUNT} kurssider – fra første annonse til ferdig salg`,
  'Kalkulator, stresstester, maksbud og ferdige regneeksempler',
  'Kontrollspørsmål, sluttcase og sluttquiz',
  'Før-bud-sjekkliste og flippbudsjett du kan skrive ut',
  'Regler og markedsdata faglig kontrollert ' + COURSE_CHECKED,
];

/** Vises i stedet for kursinnholdet til kurset er kjøpt. Innholdet i modulene er ikke tilgjengelig her. */
export function CoursePaywall({ onPurchased }: { onPurchased?: () => void }) {
  const course = getCourse(COURSE_ID)!;
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-6">
      <nav aria-label="Brødsmulesti" className="text-sm text-pine-800">
        <Link to="/kurs" className="inline-flex items-center gap-1 hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> Kurs
        </Link>
      </nav>

      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-pine-900 to-pine-700 p-6 text-white sm:p-8" aria-labelledby="kurs-tittel">
        <Badge tone="outline" className="bg-white/10 text-white ring-white/30">
          <Lock className="size-3" aria-hidden /> Kjøpes én gang – varig tilgang
        </Badge>
        <h1 id="kurs-tittel" className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          {COURSE_TITLE}
        </h1>
        <p className="mt-2 text-lg text-pine-100">{COURSE_SUBTITLE}</p>
        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-pine-50">
          <li className="inline-flex items-center gap-1.5">
            <Clock className="size-4" aria-hidden /> Ca. {hours(TOTAL_MINUTES)}
          </li>
          <li className="inline-flex items-center gap-1.5">
            <Layers className="size-4" aria-hidden /> {MODULE_COUNT} moduler · {PAGE_COUNT} sider
          </li>
        </ul>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button type="button" className="inline-flex h-12 items-center gap-2 rounded-lg bg-white px-5 text-base font-semibold text-pine-950 hover:bg-pine-50" onClick={() => setOpen(true)}>
            <GraduationCap className="size-5" aria-hidden /> Kjøp kurset – {formatNOK(course.price)}
          </button>
          <p className="text-sm text-pine-100">Engangsbeløp. Du betaler med Vipps og beholder tilgangen.</p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <Card className="p-5">
          <h2 className="text-lg font-semibold">Dette får du</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {INCLUDED.map((t) => (
              <li key={t} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-pine-700" aria-hidden />
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
            <p className="num text-2xl font-semibold">{formatNOK(course.price)}</p>
            <p className="text-slate-700">Engangsbeløp inkl. mva. Ingen abonnement eller fornyelse, og tilgangen er uavhengig av Flippsjekk-abonnementet.</p>
            <p className="mt-1 text-xs text-slate-600">Pris er et eksempel i demoen.</p>
          </div>
          <button type="button" className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-lg bg-pine-800 px-5 text-sm font-semibold text-white hover:bg-pine-900" onClick={() => setOpen(true)}>
            Kjøp kurset
          </button>
        </Card>

        <section aria-labelledby="innhold">
          <h2 id="innhold" className="mb-3 text-lg font-semibold">
            Innhold i kurset
          </h2>
          <ol className="space-y-2">
            {MODULES.map((m) => (
              <li key={m.id} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-pine-50 text-sm font-semibold text-pine-900">{m.num}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{m.title}</p>
                  <p className="text-sm text-slate-600">{m.goal}</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-slate-500">
                  <Lock className="size-3.5" aria-hidden /> {m.pages.length} sider
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-sm text-slate-600">Etter modul 11 følger sluttcase, sluttquiz og fullføringsside.</p>
        </section>
      </div>

      <CoursePurchaseDialog course={course} open={open} onClose={() => setOpen(false)} onPurchased={onPurchased} />
    </div>
  );
}
