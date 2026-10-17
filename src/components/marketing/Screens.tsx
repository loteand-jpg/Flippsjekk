import clsx from 'clsx';
import { CalendarDays, Check, Eye, Gavel, Star } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { evaluateScenario } from '../../calc/scenario';
import { formatNOK, formatPct } from '../../lib/format';
import { Badge } from '../ui/primitives';
import { EXAMPLE } from './example';

/** Nettleservindu rundt illustrasjonene. */
export function Frame({ url, label, children }: { url: string; label: string; children: ReactNode }) {
  return (
    <figure className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-lg" aria-label={label}>
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-100 px-3 py-2" aria-hidden>
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-slate-300" />
          <span className="size-2.5 rounded-full bg-slate-300" />
          <span className="size-2.5 rounded-full bg-slate-300" />
        </span>
        <span className="ml-2 min-w-0 flex-1 truncate rounded-md bg-white px-3 py-0.5 text-xs text-slate-500">{url}</span>
      </div>
      <div className="bg-canvas p-3 sm:p-4">{children}</div>
      <figcaption className="border-t border-slate-100 bg-white px-4 py-2 text-xs text-slate-600">Illustrasjon med fiktive data.</figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// 1. Oversikt over boliger (liste)
// ---------------------------------------------------------------------------

const LIST = [
  { addr: 'Elvegata 12 B', meta: 'Selveier · 58 m²', status: 'Interessant', tone: 'green' as const, price: 2_850_000, profit: 278_000, maxBid: 2_830_000, risk: 'Middels', riskTone: 'amber' as const, quality: 'Høy', star: true },
  { addr: 'Bakkeveien 4', meta: 'Borettslag · 46 m²', status: 'Avklar først', tone: 'amber' as const, price: 2_190_000, profit: 91_000, maxBid: 2_040_000, risk: 'Høy', riskTone: 'red' as const, quality: 'Middels', star: false },
  { addr: 'Parkgata 7', meta: 'Sameie · 64 m²', status: 'Følg med', tone: 'blue' as const, price: 3_450_000, profit: -34_000, maxBid: 3_120_000, risk: 'Lav', riskTone: 'green' as const, quality: 'Høy', star: false },
  { addr: 'Sjøgata 21', meta: 'Selveier · 71 m²', status: 'Interessant', tone: 'green' as const, price: 3_990_000, profit: 342_000, maxBid: 3_890_000, risk: 'Uavklart', riskTone: 'outline' as const, quality: 'Lav', star: true },
  { addr: 'Furuvegen 2', meta: 'Selveier · 52 m²', status: 'Avstå', tone: 'neutral' as const, price: 2_600_000, profit: -188_000, maxBid: 2_150_000, risk: 'Høy', riskTone: 'red' as const, quality: 'Middels', star: false },
];

export function ListScreen() {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[34rem] text-left text-sm" aria-hidden>
        <thead className="bg-slate-50 text-xs text-slate-600">
          <tr>
            <th className="px-3 py-2 font-medium">Adresse</th>
            <th className="px-3 py-2 font-medium">Vurdering</th>
            <th className="px-3 py-2 text-right font-medium">Resultat før skatt</th>
            <th className="px-3 py-2 text-right font-medium">Modellert maksbud</th>
            <th className="px-3 py-2 font-medium">Risiko</th>
            <th className="px-3 py-2 font-medium">Datakvalitet</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {LIST.map((r) => (
            <tr key={r.addr}>
              <td className="px-3 py-2">
                <p className="flex items-center gap-1 font-medium">
                  {r.addr}
                  {r.star && <Star className="size-3.5 fill-amber-400 text-amber-500" />}
                </p>
                <p className="text-xs text-slate-600">{r.meta}</p>
              </td>
              <td className="px-3 py-2">
                <Badge tone={r.tone}>{r.status}</Badge>
              </td>
              <td className={clsx('num px-3 py-2 text-right font-medium', r.profit < 0 ? 'text-red-800' : 'text-pine-900')}>{formatNOK(r.profit)}</td>
              <td className="num px-3 py-2 text-right">{formatNOK(r.maxBid)}</td>
              <td className="px-3 py-2">
                <Badge tone={r.riskTone}>{r.risk}</Badge>
              </td>
              <td className="px-3 py-2 text-slate-700">{r.quality}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Inni et objekt – du kan prøve selv
// ---------------------------------------------------------------------------

const TABS = ['Oversikt', 'Min kalkyle', 'Oppussing', 'Marked', 'Risiko og sjekkliste', 'Visninger'];

function Tile({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className={clsx('rounded-lg border p-3', strong ? 'border-pine-200 bg-pine-50' : 'border-slate-200 bg-white')}>
      <p className="text-[11px] font-medium tracking-wide text-slate-600 uppercase">{label}</p>
      <p className={clsx('num text-lg font-semibold', strong && 'text-pine-900')}>{value}</p>
      {sub && <p className="text-xs text-slate-600">{sub}</p>}
    </div>
  );
}

export function ObjectScreen() {
  const [price, setPrice] = useState(EXAMPLE.purchasePrice as number);
  const [reno, setReno] = useState(EXAMPLE.renovationLumpSum as number);
  const ev = useMemo(() => evaluateScenario({ ...EXAMPLE, purchasePrice: price, renovationLumpSum: reno }).evaluation, [price, reno]);
  const profit = ev.base?.profit ?? null;
  const maxBid = ev.maxBid?.price ? Math.floor(ev.maxBid.price / 1000) * 1000 : null;
  const lines = [
    { label: 'Bad (våtrom, sluk, membran)', share: 0.62, tag: 'Anslag' },
    { label: 'Kjøkken (fronter, benkeplate)', share: 0.22, tag: 'Anslag' },
    { label: 'Gulv, maling og lister', share: 0.16, tag: 'Dine tall' },
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-lg font-semibold">
            Elvegata 12 B <Star className="size-4 fill-amber-400 text-amber-500" aria-hidden />
          </p>
          <p className="text-xs text-slate-600">Leilighet · Selveier · 58 m²</p>
        </div>
        <Badge tone="green" icon={<Check className="size-3" aria-hidden />}>
          Interessant
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid="how-tiles">
        <Tile strong label="Forventet fortjeneste" value={formatNOK(profit)} sub={`${formatPct(ev.base?.projectReturn)} prosjektavkastning`} />
        <Tile label="Oppussing inkl. reserve" value={formatNOK(ev.base?.RB)} sub="med 20 % reserve" />
        <Tile label="Modellert maksbud" value={formatNOK(maxBid)} sub="for målet ditt" />
        <Tile label="Datakvalitet" value="83 %" sub="Høy dekning" />
      </div>
      <div className="flex flex-wrap gap-1 border-b border-slate-200 text-sm" aria-hidden>
        {TABS.map((t) => (
          <span key={t} className={clsx('rounded-t-md px-3 py-1.5', t === 'Min kalkyle' ? 'border-b-2 border-pine-700 font-semibold text-pine-900' : 'text-slate-600')}>
            {t}
          </span>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-sm font-semibold">Din kalkyle</p>
          <p className="text-xs text-slate-600">Dra i glidebryterne – tallene over oppdateres med en gang.</p>
          <label className="mt-3 block text-sm">
            <span className="flex justify-between">
              <span>Kjøpspris</span>
              <span className="num font-medium">{formatNOK(price)}</span>
            </span>
            <input type="range" className="mt-1 w-full accent-[var(--color-pine-700)]" min={2_400_000} max={3_400_000} step={50_000} value={price} onChange={(e) => setPrice(Number(e.target.value))} />
          </label>
          <label className="mt-2 block text-sm">
            <span className="flex justify-between">
              <span>Oppussing (rundsum)</span>
              <span className="num font-medium">{formatNOK(reno)}</span>
            </span>
            <input type="range" className="mt-1 w-full accent-[var(--color-pine-700)]" min={200_000} max={700_000} step={20_000} value={reno} onChange={(e) => setReno(Number(e.target.value))} />
          </label>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
            {[
              ['Reserve', '20 %'],
              ['Varighet', '6 mnd'],
              ['Rente', '7 %'],
            ].map(([k, v]) => (
              <div key={k} className="rounded-md bg-slate-50 p-2">
                <dt className="text-slate-600">{k}</dt>
                <dd className="num font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-sm font-semibold">Oppussing per post</p>
          <p className="text-xs text-slate-600">Hver post er merket som anslag eller dine egne tall.</p>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {lines.map((l) => (
              <li key={l.label} className="flex items-center justify-between gap-2 py-1.5">
                <span>
                  {l.label} <Badge tone={l.tag === 'Anslag' ? 'blue' : 'violet'}>{l.tag}</Badge>
                </span>
                <span className="num font-medium">{formatNOK(Math.round((reno * l.share) / 1000) * 1000)}</span>
              </li>
            ))}
            <li className="flex justify-between py-1.5 font-semibold">
              <span>Sum inkl. 20 % reserve</span>
              <span className="num">{formatNOK(ev.base?.RB)}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Kalender
// ---------------------------------------------------------------------------

type Ev = { kind: 'visning' | 'bud' | 'privat'; text: string };
const EVENTS: Record<number, Ev[]> = {
  6: [{ kind: 'visning', text: '12:00 Elvegata 12 B' }],
  8: [{ kind: 'privat', text: '17:30 Teknisk sjekk' }],
  13: [{ kind: 'visning', text: '13:00 Sjøgata 21' }],
  14: [
    { kind: 'visning', text: '12:00 Parkgata 7' },
    { kind: 'privat', text: '15:00 Befaring' },
  ],
  16: [{ kind: 'bud', text: 'Forventet buddag' }],
  20: [{ kind: 'visning', text: '11:00 Bakkeveien 4' }],
  27: [{ kind: 'bud', text: 'Forventet buddag' }],
};

const EVENT_STYLE: Record<Ev['kind'], string> = {
  visning: 'bg-pine-100 text-pine-950',
  bud: 'bg-amber-100 text-amber-950',
  privat: 'bg-violet-100 text-violet-950',
};

export function CalendarScreen() {
  // Oktober 2026 starter på en torsdag.
  const first = 3; // mandag = 0
  const days = 31;
  const cells = Array.from({ length: 35 }, (_, i) => {
    const d = i - first + 1;
    return d >= 1 && d <= days ? d : null;
  });
  return (
    <div className="rounded-lg border border-slate-200 bg-white" aria-hidden>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <CalendarDays className="size-4" /> Oktober 2026
        </p>
        <p className="flex flex-wrap gap-3 text-xs text-slate-700">
          <span className="inline-flex items-center gap-1">
            <Eye className="size-3.5 text-pine-700" /> Visning
          </span>
          <span className="inline-flex items-center gap-1">
            <Gavel className="size-3.5 text-amber-700" /> Buddag
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2.5 rounded-sm bg-violet-300" /> Privat avtale
          </span>
        </p>
      </div>
      <div className="grid grid-cols-7 border-b border-slate-100 text-center text-[11px] font-medium text-slate-600">
        {['Ma', 'Ti', 'On', 'To', 'Fr', 'Lø', 'Sø'].map((d) => (
          <span key={d} className="py-1.5">
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => (
          <div key={i} className={clsx('min-h-14 border-r border-b border-slate-100 p-1 sm:min-h-20', d === null && 'bg-slate-50', i % 7 === 6 && 'border-r-0')}>
            {d !== null && (
              <>
                <p className={clsx('text-[11px] text-slate-600', d === 17 && 'inline-flex size-5 items-center justify-center rounded-full bg-pine-800 font-semibold text-white')}>{d}</p>
                <div className="mt-0.5 space-y-0.5">
                  {(EVENTS[d] ?? []).map((e) => (
                    <p key={e.text} className={clsx('truncate rounded px-1 py-0.5 text-[10px] leading-tight sm:text-[11px]', EVENT_STYLE[e.kind])}>
                      <span className="hidden sm:inline">{e.text}</span>
                      <span className="sm:hidden">•</span>
                    </p>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
