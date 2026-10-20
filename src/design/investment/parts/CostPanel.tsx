import type { Breakdown } from '../../../calc/engine';
import { CostChart } from '../charts/CostChart';
import { costSegments } from '../model/charts';
import { Panel } from '../ui';

/** Kostnadsfordeling mot salgsverdi for scenarioet i bruk. */
export function CostPanel({ b }: { b: Breakdown | null }) {
  return (
    <Panel id="kostnader" title="Kostnadsfordeling" sub="Hvor pengene går, og hvor mye som er igjen som fortjeneste.">
      {b ? <CostChart segments={costSegments(b)} sale={b.S} profit={b.profit} /> : <p className="text-sm text-slate-700">Krever en komplett kalkyle. Ukjent er ikke 0 kr.</p>}
    </Panel>
  );
}
