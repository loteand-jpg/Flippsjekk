import { TrendingDown, TrendingUp } from 'lucide-react';
import { SOURCE_LABEL, type Driver } from '../model/drivers';
import { Panel, Tag } from '../ui';

function Column({ title, items, up }: { title: string; items: Driver[]; up: boolean }) {
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <div className="min-w-0">
      <h3 className={`flex items-center gap-1.5 text-sm font-semibold ${up ? 'text-[var(--inv-pos)]' : 'text-[var(--inv-neg)]'}`}>
        <Icon className="size-4" aria-hidden /> {title}
      </h3>
      {items.length === 0 ? (
        <p className="mt-2 rounded-lg border border-dashed border-[var(--inv-line-strong)] px-3 py-2.5 text-xs text-slate-600">{up ? 'Ingen tydelige oppsidedrivere i dataene.' : 'Ingen tydelige nedsidedrivere i dataene.'}</p>
      ) : (
        <ul className="mt-2 space-y-1.5" data-testid={up ? 'inv-drivers-up' : 'inv-drivers-down'}>
          {items.map((d) => (
            <li key={d.text} className="flex items-start gap-2 text-[13px] leading-snug">
              <span aria-hidden className={`mt-1.5 size-1.5 shrink-0 rounded-full ${up ? 'bg-[var(--inv-pos)]' : 'bg-[var(--inv-neg)]'}`} />
              <span className="min-w-0 flex-1">{d.text}</span>
              <Tag className="shrink-0 !font-medium">{SOURCE_LABEL[d.source]}</Tag>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** «Hva driver caset?» Faktabaserte punkter fra scenario, kalkyle, marked, risiko og datagrunnlag – ingen fritekst fra AI. */
export function Drivers({ up, down }: { up: Driver[]; down: Driver[] }) {
  return (
    <Panel id="drivers" title="Hva driver caset?" sub="Hentet fra scenarioet, kalkylen, markedsgrunnlaget og risikoene – ikke fritekst.">
      <div className="grid gap-5 sm:grid-cols-2">
        <Column title="Hva driver oppsiden?" items={up} up />
        <Column title="Hva trekker ned?" items={down} up={false} />
      </div>
    </Panel>
  );
}
