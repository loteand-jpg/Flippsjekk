/** Pene akseverdier: rundt steg (1, 2, 2,5 eller 5 × 10^k) som dekker intervallet, med 0 som tick når den ligger innenfor. */
export function niceTicks(min: number, max: number, target = 4): number[] {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const first = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = first; v <= max + step * 1e-9; v += step) out.push(Math.round(v / step) * step || 0);
  return out;
}
