import clsx from 'clsx';
import { CalendarDays, Check, Eye, GraduationCap, Star } from 'lucide-react';
import { useMemo } from 'react';
import { evaluateScenario } from '../../calc/scenario';
import { formatNOK } from '../../lib/format';
import { Badge } from '../ui/primitives';
import { EXAMPLE } from './example';

const BOLIGER = [
  { addr: 'Elvegata 12 B', status: 'Interessant', tone: 'green' as const, profit: 278_000, star: true },
  { addr: 'Sjøgata 21', status: 'Interessant', tone: 'green' as const, profit: 342_000, star: true },
  { addr: 'Bakkeveien 4', status: 'Avklar først', tone: 'amber' as const, profit: 91_000, star: false },
];

function Mini({ title, icon, children, className }: { title: string; icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx('rounded-xl border border-slate-200 bg-white p-3 shadow-lg', className)}>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
        {icon}
        {title}
      </p>
      {children}
    </div>
  );
}

/**
 * Forsidens hovedbilde: et objekt med kostnadsregnskapet fra salgspris til fortjeneste,
 * omgitt av liste over boliger, visningskalender og kurs. Tallene kommer fra den vanlige beregningsmotoren.
 */
export function HeroVisual() {
  const ev = useMemo(() => evaluateScenario(EXAMPLE).evaluation, []);
  const b = ev.base!;
  const maxBid = ev.maxBid?.price ? Math.floor(ev.maxBid.price / 1000) * 1000 : null;
  const rows = [
    { label: 'Salgspris etter oppussing', value: b.V, tone: 'bg-pine-700', sign: '' },
    { label: 'Kjøp inkl. kostnader', value: b.P + b.K, tone: 'bg-slate-400', sign: '−' },
    { label: 'Oppussing inkl. reserve', value: b.RB, tone: 'bg-slate-400', sign: '−' },
    { label: 'Renter og drift', value: b.I + b.O, tone: 'bg-slate-400', sign: '−' },
    { label: 'Salgskostnader', value: b.Csale, tone: 'bg-slate-400', sign: '−' },
  ];
  const max = b.V;
  return (
    <div className="relative lg:pr-6 lg:pb-48 lg:pl-10" data-testid="hero-visual">
      <div className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-xl">
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-100 px-3 py-2" aria-hidden>
          <span className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-slate-300" />
            <span className="size-2.5 rounded-full bg-slate-300" />
            <span className="size-2.5 rounded-full bg-slate-300" />
          </span>
          <span className="ml-2 truncate rounded-md bg-white px-3 py-0.5 text-xs text-slate-500">flippsjekk.no/objekter/elvegata-12-b</span>
        </div>
        <div className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="flex items-center gap-1.5 text-base font-semibold">
                Elvegata 12 B <Star className="size-4 fill-amber-400 text-amber-500" aria-hidden />
              </p>
              <p className="text-xs text-slate-600">Treroms · 58 m² · selveier · eksempel med fiktive tall</p>
            </div>
            <Badge tone="green" icon={<Check className="size-3" aria-hidden />}>
              Interessant
            </Badge>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-pine-50 p-2.5">
              <dt className="text-[11px] text-pine-900">Resultat før skatt</dt>
              <dd className="num text-lg font-semibold text-pine-900">{formatNOK(b.profit)}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-2.5">
              <dt className="text-[11px] text-slate-600">Maks budpris for målet ditt</dt>
              <dd className="num text-lg font-semibold">{formatNOK(maxBid)}</dd>
            </div>
          </dl>
          <p className="mt-4 mb-2 text-xs font-medium text-slate-600">Slik regnes fortjenesten ut</p>
          <ul className="space-y-1.5">
            {rows.map((r) => (
              <li key={r.label} className="grid grid-cols-[minmax(0,8.5rem)_1fr_5.5rem] items-center gap-2 text-xs sm:grid-cols-[10rem_1fr_6rem]">
                <span className="truncate text-slate-700">{r.label}</span>
                <span className="h-2.5 rounded-full bg-slate-100">
                  <span className={clsx('block h-2.5 rounded-full', r.tone)} style={{ width: `${Math.max(4, (r.value / max) * 100)}%` }} />
                </span>
                <span className="num text-right font-medium">
                  {r.sign}
                  {formatNOK(r.value)}
                </span>
              </li>
            ))}
            <li className="grid grid-cols-[minmax(0,8.5rem)_1fr_5.5rem] items-center gap-2 border-t border-slate-200 pt-1.5 text-xs font-semibold sm:grid-cols-[10rem_1fr_6rem]">
              <span>Fortjeneste før skatt</span>
              <span className="h-2.5 rounded-full bg-slate-100">
                <span className="block h-2.5 rounded-full bg-[var(--color-series-1)]" style={{ width: `${Math.max(4, (b.profit / max) * 100)}%` }} />
              </span>
              <span className="num text-right text-pine-900">{formatNOK(b.profit)}</span>
            </li>
          </ul>
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-950">Anslag med synlig usikkerhet – ikke en garanti for fortjeneste.</p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:mt-0 lg:block" aria-hidden>
        <Mini title="Mine boliger" icon={<Star className="size-3.5" />} className="lg:absolute lg:bottom-0 lg:left-0 lg:w-64">
          <ul className="mt-1.5 divide-y divide-slate-100">
            {BOLIGER.map((r) => (
              <li key={r.addr} className="flex items-center justify-between gap-2 py-1 text-xs">
                <span className="min-w-0 truncate font-medium">{r.addr}</span>
                <Badge tone={r.tone}>{r.status}</Badge>
              </li>
            ))}
          </ul>
        </Mini>
        <div className="space-y-3 lg:absolute lg:right-0 lg:bottom-0 lg:w-60">
          <Mini title="Neste visninger" icon={<CalendarDays className="size-3.5" />}>
            <ul className="mt-1.5 space-y-1 text-xs">
              <li className="flex items-center gap-1.5 rounded bg-pine-100 px-1.5 py-1 text-pine-950">
                <Eye className="size-3 shrink-0" /> Lør 12:00 · Elvegata 12 B
              </li>
              <li className="flex items-center gap-1.5 rounded bg-amber-100 px-1.5 py-1 text-amber-950">
                <Check className="size-3 shrink-0" /> Man · forventet buddag
              </li>
            </ul>
          </Mini>
          <Mini title="Flippekurs" icon={<GraduationCap className="size-3.5" />} className="hidden sm:block lg:block">
            <p className="mt-1 text-xs text-slate-700">Modul 4 av 11 · Finn realistisk salgsverdi</p>
            <span className="mt-1.5 block h-1.5 rounded-full bg-slate-100">
              <span className="block h-1.5 w-[36%] rounded-full bg-pine-700" />
            </span>
          </Mini>
        </div>
      </div>
    </div>
  );
}
