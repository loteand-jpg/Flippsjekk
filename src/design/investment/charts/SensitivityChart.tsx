import { useMemo } from 'react';
import type { PricePoint } from '../model/charts';
import { compactMill, formatNOK } from '../model/format';
import { niceTicks } from './scale';
import { useWidth } from './useWidth';

const M = { l: 52, r: 14, t: 22, b: 30 };

/**
 * Fortjeneste mot kjøpspris, regnet av motoren for hver pris (alle andre forutsetninger uendret). Markører: din kjøpspris,
 * anbefalt maksbud og forhåndsvisningen fra glideren. Y-aksen viser 0 tydelig, så nedside og oppside leses direkte.
 */
export function SensitivityChart({ series, current, maxBid, preview }: { series: PricePoint[]; current: number; maxBid: number | null; preview: PricePoint | null }) {
  const [ref, width] = useWidth<HTMLDivElement>(560);
  const height = width < 420 ? 200 : 250;
  const geo = useMemo(() => {
    if (series.length < 2) return null;
    const x0 = series[0].price;
    const x1 = series[series.length - 1].price;
    const ys = series.map((s) => s.profit);
    const y0 = Math.min(0, ...ys);
    const y1 = Math.max(0, ...ys);
    const pad = (y1 - y0 || 1) * 0.06;
    return { x0, x1, y0: y0 - (y0 < 0 ? pad : 0), y1: y1 + pad };
  }, [series]);
  if (!geo) return null;
  const W = width - M.l - M.r;
  const H = height - M.t - M.b;
  const sx = (x: number) => M.l + ((x - geo.x0) / (geo.x1 - geo.x0)) * W;
  const sy = (y: number) => M.t + (1 - (y - geo.y0) / (geo.y1 - geo.y0)) * H;
  const line = series.map((s, i) => `${i === 0 ? 'M' : 'L'}${sx(s.price).toFixed(1)},${sy(s.profit).toFixed(1)}`).join(' ');
  const area = `${line} L${sx(series[series.length - 1].price).toFixed(1)},${sy(0).toFixed(1)} L${sx(series[0].price).toFixed(1)},${sy(0).toFixed(1)} Z`;
  const yTicks = niceTicks(geo.y0, geo.y1, width < 420 ? 3 : 4);
  const xTicks = niceTicks(geo.x0, geo.x1, width < 420 ? 3 : 4);
  const inRange = (x: number) => x >= geo.x0 && x <= geo.x1;
  const clipId = `inv-clip-${Math.round(width)}`;
  return (
    <div ref={ref} className="min-w-0">
      <svg width={width} height={height} role="img" aria-label={`Fortjeneste mot kjøpspris fra ${formatNOK(geo.x0)} til ${formatNOK(geo.x1)}. Fortjenesten faller når kjøpsprisen stiger.`} className="block max-w-full overflow-visible">
        <defs>
          <clipPath id={`${clipId}-pos`}>
            <rect x={M.l} y={M.t} width={W} height={Math.max(0, sy(0) - M.t)} />
          </clipPath>
          <clipPath id={`${clipId}-neg`}>
            <rect x={M.l} y={sy(0)} width={W} height={Math.max(0, M.t + H - sy(0))} />
          </clipPath>
        </defs>
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={M.l + W} y1={sy(t)} y2={sy(t)} stroke="var(--viz-grid)" strokeWidth={1} />
            <text x={M.l - 6} y={sy(t) + 4} textAnchor="end" fontSize={11} fill="#4a5a70" className="inv-fig">
              {compactMill(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t} x={sx(t)} y={height - 8} textAnchor="middle" fontSize={11} fill="#4a5a70" className="inv-fig">
            {compactMill(t)}
          </text>
        ))}
        <line x1={M.l} x2={M.l + W} y1={sy(0)} y2={sy(0)} stroke="var(--viz-axis)" strokeWidth={1.5} />
        <text x={M.l + 4} y={sy(0) - 4} fontSize={10} fill="#4a5a70">
          0 kr
        </text>
        <path d={area} fill="rgb(14 116 144 / 0.16)" clipPath={`url(#${clipId}-pos)`} />
        <path d={area} fill="rgb(190 18 60 / 0.16)" clipPath={`url(#${clipId}-neg)`} />
        <path d={line} fill="none" stroke="var(--viz-up)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {inRange(current) && (
          <g>
            <line x1={sx(current)} x2={sx(current)} y1={M.t} y2={M.t + H} stroke="#364559" strokeWidth={1.5} strokeDasharray="4 3" />
            <text x={sx(current)} y={M.t - 7} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="#364559">
              Kjøpspris
            </text>
          </g>
        )}
        {maxBid !== null && inRange(maxBid) && (
          <g>
            <line x1={sx(maxBid)} x2={sx(maxBid)} y1={M.t} y2={M.t + H} stroke="var(--viz-up)" strokeWidth={1.5} strokeDasharray="1 3" />
            <text x={Math.min(Math.max(sx(maxBid), M.l + 26), M.l + W - 26)} y={M.t + H + 0} dy={-5} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#0c5f78" stroke="#fff" strokeWidth={3} paintOrder="stroke">
              Maksbud
            </text>
          </g>
        )}
        {preview && inRange(preview.price) && (
          <g>
            <line x1={sx(preview.price)} x2={sx(preview.price)} y1={sy(preview.profit)} y2={sy(0)} stroke="var(--viz-up)" strokeWidth={1.5} />
            <circle cx={sx(preview.price)} cy={sy(preview.profit)} r={6.5} fill="#fff" stroke="var(--viz-up)" strokeWidth={3} />
          </g>
        )}
      </svg>
    </div>
  );
}
