import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatNOK, formatPct } from '../../lib/format';
import { Segmented } from '../ui/forms';

const SERIES = 'var(--color-series-1)';
const MUTED = 'var(--color-series-muted)';

const axisTick = { fill: '#52514e', fontSize: 11 };
const mill = (v: number) => (Math.abs(v) >= 1_000_000 ? `${(v / 1_000_000).toLocaleString('nb-NO', { maximumFractionDigits: 2 })} mill.` : `${Math.round(v / 1000).toLocaleString('nb-NO')}k`);

interface SensPoint {
  value: number;
  profit: number;
  projectReturn: number | null;
}

function SensTooltip({ active, point, xLabel }: { active?: boolean; point?: SensPoint; xLabel: string }) {
  if (!active || !point) return null;
  const p = point;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="text-slate-600">
        {xLabel}: <span className="num font-medium text-ink">{formatNOK(p.value)}</span>
      </p>
      <p className="text-slate-600">
        Resultat: <span className="num font-semibold text-ink">{formatNOK(p.profit)}</span>
      </p>
      <p className="text-slate-600">
        Prosjektavkastning: <span className="num text-ink">{formatPct(p.projectReturn)}</span>
      </p>
    </div>
  );
}

/**
 * Hvordan resultatet før skatt endres med kjøpspris eller salgspris (én serie, samme motor).
 * Referanselinjer: 0 kr og fortjenestemålet. Tabellvisning er tilgjengelig.
 */
export function SensitivityChart({
  title,
  xLabel,
  points,
  current,
  target,
}: {
  title: string;
  xLabel: string;
  points: { value: number; profit: number; projectReturn: number | null }[];
  current: number;
  target: number | null;
}) {
  const [mode, setMode] = useState<'chart' | 'table'>('chart');
  return (
    <figure className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <figcaption className="text-sm font-medium">{title}</figcaption>
        <Segmented
          size="sm"
          label={`Visning for ${title}`}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'chart', label: 'Diagram' },
            { value: 'table', label: 'Tabell' },
          ]}
        />
      </div>
      {mode === 'chart' ? (
        <div className="h-56 w-full" role="img" aria-label={`${title}. Bytt til tabell for eksakte tall.`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid stroke="#e7e7e3" vertical={false} />
              <XAxis dataKey="value" type="number" domain={['dataMin', 'dataMax']} tickFormatter={mill} tick={axisTick} tickLine={false} axisLine={{ stroke: '#d4d4cf' }} />
              <YAxis tickFormatter={mill} tick={axisTick} tickLine={false} axisLine={false} width={56} />
              <ReferenceLine y={0} stroke="#52514e" strokeWidth={1} />
              {target !== null && <ReferenceLine y={target} stroke={MUTED} strokeDasharray="4 4" label={{ value: 'Mål', position: 'insideTopRight', fill: '#52514e', fontSize: 11 }} />}
              <ReferenceLine x={current} stroke={MUTED} strokeDasharray="2 3" label={{ value: 'Nå', position: 'insideTopLeft', fill: '#52514e', fontSize: 11 }} />
              <Tooltip content={(p) => <SensTooltip active={p.active} point={p.payload?.[0]?.payload as SensPoint | undefined} xLabel={xLabel} />} cursor={{ stroke: '#9aa4a8', strokeWidth: 1 }} />
              <Line type="linear" dataKey="profit" stroke={SERIES} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200">
          <table className="num w-full text-xs">
            <thead className="sticky top-0 bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-2 py-1.5 font-medium">{xLabel}</th>
                <th className="px-2 py-1.5 text-right font-medium">Resultat</th>
                <th className="px-2 py-1.5 text-right font-medium">Avkastning</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {points.map((p) => (
                <tr key={p.value}>
                  <td className="px-2 py-1">{formatNOK(p.value)}</td>
                  <td className={`px-2 py-1 text-right ${p.profit < 0 ? 'text-red-800' : ''}`}>{formatNOK(p.profit)}</td>
                  <td className="px-2 py-1 text-right">{formatPct(p.projectReturn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </figure>
  );
}

/** Horisontale stolper for størrelser (én serie). Verdiene står alltid som tekst. */
export function BarList({ rows, total }: { rows: { label: string; value: number | null; note?: string }[]; total?: number }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value ?? 0)));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(7rem,10rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="text-slate-700">
            {r.label}
            {r.note && <span className="block text-[11px] text-slate-500">{r.note}</span>}
          </span>
          <span className="h-3 rounded-sm bg-slate-100" aria-hidden>
            {r.value !== null && r.value !== 0 && <span className="block h-3 rounded-r-[4px]" style={{ width: `${Math.max(1.5, (Math.abs(r.value) / max) * 100)}%`, background: SERIES }} />}
          </span>
          <span className="num min-w-[6.5rem] text-right font-medium">
            {formatNOK(r.value)}
            {total && r.value !== null ? <span className="block text-[11px] font-normal text-slate-500">{formatPct(r.value / total)}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

