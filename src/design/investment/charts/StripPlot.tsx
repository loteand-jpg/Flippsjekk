import { useState } from 'react';
import { formatNOK } from '../model/format';
import { niceTicks } from './scale';
import { ChartFrame } from './ChartFrame';
import { useWidth } from './useWidth';

const compactK = (n: number) => `${(n / 1000).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} k`;

export type Lane = 'primaer' | 'sekundaer' | 'aktiv';
export interface StripPoint {
  id: string;
  name: string;
  lane: Lane;
  /** kr per m² (justert totalpris for solgte, annonsert totalpris for aktive). */
  x: number;
  detail: string;
}

const LANES: { id: Lane; label: string; long: string }[] = [
  { id: 'primaer', label: 'Primær', long: 'Primærreferanser (solgt)' },
  { id: 'sekundaer', label: 'Sekundær', long: 'Sekundærreferanser (solgt)' },
  { id: 'aktiv', label: 'Aktiv', long: 'Aktive annonser – ikke faktisk salgspris' },
];

/**
 * Referanser på en felles akse (kr per m²). Form og linjestil – ikke bare farge – skiller primær (fylt sirkel), sekundær
 * (åpen firkant) og aktiv annonse (trekant, stiplet). Målobjektets anker og intervall vises som linje og bånd. Hvert punkt kan
 * velges med tastatur og leses i feltet under; alle referanser står også i tabellen.
 */
export function StripPlot({ points, anchor, band }: { points: StripPoint[]; anchor: number | null; band: [number, number] | null }) {
  const [ref, width] = useWidth<HTMLDivElement>(560);
  const [active, setActive] = useState<string | null>(null);
  if (points.length === 0) return <p className="text-sm text-slate-600">Ingen referanser med brukbar pris per m² å vise.</p>;
  const left = width < 420 ? 64 : 150;
  const right = 14;
  const laneH = 40;
  const top = 26;
  const height = top + LANES.length * laneH + 28;
  const xs = [...points.map((p) => p.x), ...(anchor !== null ? [anchor] : []), ...(band ? band : [])];
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  const pad = (hi - lo || hi * 0.1 || 1) * 0.1;
  const x0 = lo - pad;
  const x1 = hi + pad;
  const sx = (x: number) => left + ((x - x0) / (x1 - x0)) * (width - left - right);
  const lanePoints = (l: Lane) => points.filter((p) => p.lane === l).sort((a, b) => a.x - b.x);
  const focus = points.find((p) => p.id === active) ?? null;
  const ticks = niceTicks(x0, x1, width < 420 ? 3 : 4);
  const shape = (p: StripPoint, cx: number, cy: number, on: boolean) => {
    const stroke = on ? '#052a38' : p.lane === 'aktiv' ? 'var(--viz-2)' : 'var(--viz-1)';
    if (p.lane === 'primaer') return <circle cx={cx} cy={cy} r={on ? 8 : 6.5} fill="var(--viz-1)" stroke={on ? '#052a38' : '#fff'} strokeWidth={on ? 2.5 : 1.5} />;
    if (p.lane === 'sekundaer') return <rect x={cx - 6} y={cy - 6} width={12} height={12} rx={2} fill="#fff" stroke={stroke} strokeWidth={on ? 3 : 2.25} />;
    return <path d={`M${cx},${cy - 7.5} L${cx + 7},${cy + 6} L${cx - 7},${cy + 6} Z`} fill="#fff" stroke={stroke} strokeWidth={on ? 3 : 2} strokeDasharray="3 2" />;
  };
  return (
    <ChartFrame
      table={{
        caption: 'Referanser per m²',
        head: ['Referanse', 'Rolle', 'Kr per m²'],
        rows: points.map((p) => [p.name, LANES.find((l) => l.id === p.lane)!.long, formatNOK(p.x)]),
      }}
    >
      <div ref={ref} className="min-w-0">
        <svg width={width} height={height} role="group" aria-label={`Referanser på akse for kroner per kvadratmeter, ${points.length} punkter`} className="block max-w-full overflow-visible">
          {band && <rect x={sx(band[0])} y={top - 6} width={Math.max(2, sx(band[1]) - sx(band[0]))} height={LANES.length * laneH + 6} fill="rgb(14 116 144 / 0.12)" />}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={sx(t)} x2={sx(t)} y1={top - 6} y2={top + LANES.length * laneH} stroke="var(--viz-grid)" />
              <text x={sx(t)} y={height - 8} textAnchor="middle" fontSize={11} fill="#4a5a70" className="inv-fig">
                {compactK(t)}
              </text>
            </g>
          ))}
          {LANES.map((l, li) => (
            <g key={l.id}>
              <line x1={left} x2={width - right} y1={top + li * laneH + laneH / 2} y2={top + li * laneH + laneH / 2} stroke="var(--viz-grid)" />
              <text x={0} y={top + li * laneH + laneH / 2 + 4} fontSize={12} fontWeight={600} fill="#232f42">
                {width < 420 ? l.label : l.long.split(' (')[0].replace('Aktive annonser – ikke faktisk salgspris', 'Aktive annonser')}
              </text>
            </g>
          ))}
          {anchor !== null && (
            <g>
              <line x1={sx(anchor)} x2={sx(anchor)} y1={top - 6} y2={top + LANES.length * laneH} stroke="#0c5f78" strokeWidth={2} />
              <text x={sx(anchor)} y={top - 11} textAnchor="middle" fontSize={11} fontWeight={700} fill="#0c5f78">
                Anker {formatNOK(anchor)}/m²
              </text>
            </g>
          )}
          {LANES.map((l, li) =>
            lanePoints(l.id).map((p, pi, arr) => {
              const cx = sx(p.x);
              // Punkter som ligger tett (innen 16 px) flyttes litt opp/ned, så ingen skjuler hverandre.
              const prev = arr[pi - 1];
              const crowded = (prev && cx - sx(prev.x) < 16) || (arr[pi + 1] && sx(arr[pi + 1].x) - cx < 16);
              const cy = top + li * laneH + laneH / 2 + (crowded ? (pi % 2 === 0 ? -7 : 7) : 0);
              const on = active === p.id;
              return (
                <g
                  key={p.id}
                  tabIndex={0}
                  role="button"
                  aria-label={`${p.name}, ${l.long}, ${formatNOK(p.x)} per kvadratmeter`}
                  aria-pressed={on}
                  onFocus={() => setActive(p.id)}
                  onMouseEnter={() => setActive(p.id)}
                  onClick={() => setActive(p.id)}
                  style={{ cursor: 'pointer', outlineOffset: 4 }}
                >
                  <rect x={cx - 16} y={cy - 16} width={32} height={32} fill="transparent" />
                  {shape(p, cx, cy, on)}
                </g>
              );
            }),
          )}
        </svg>
      </div>
      <p className="mt-1 min-h-10 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-800" aria-live="polite" data-testid="inv-strip-readout">
        {focus ? (
          <>
            <strong>{focus.name}</strong> · {formatNOK(focus.x)} per m² · {focus.detail}
            {focus.lane === 'aktiv' && <strong className="ml-1 text-[var(--inv-warn)]">Ikke faktisk salgspris.</strong>}
          </>
        ) : (
          'Velg et punkt (mus, trykk eller Tab) for å lese detaljene.'
        )}
      </p>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-700">
        <li className="flex items-center gap-1.5"><svg width="14" height="14" aria-hidden><circle cx="7" cy="7" r="5.5" fill="var(--viz-1)" /></svg> Primær (solgt)</li>
        <li className="flex items-center gap-1.5"><svg width="14" height="14" aria-hidden><rect x="1.5" y="1.5" width="11" height="11" rx="2" fill="#fff" stroke="var(--viz-1)" strokeWidth="2" /></svg> Sekundær (solgt)</li>
        <li className="flex items-center gap-1.5"><svg width="14" height="14" aria-hidden><path d="M7,1.5 L13,12 L1,12 Z" fill="#fff" stroke="var(--viz-2)" strokeWidth="1.8" strokeDasharray="3 2" /></svg> Aktiv annonse – ikke faktisk salgspris</li>
        {anchor !== null && <li className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-3 w-0.5 bg-[#0c5f78]" /> Anker (vektet median){band ? ' og intervall' : ''}</li>}
      </ul>
    </ChartFrame>
  );
}
