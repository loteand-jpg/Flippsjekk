import clsx from 'clsx';
import { Fragment } from 'react';
import { EvidenceTag, FactBox, RichText } from './components';
import { WIDGETS } from './widgets';
import type { Block } from './types';

export function BlockView({ b }: { b: Block }) {
  switch (b.t) {
    case 'p':
      return (
        <p className="leading-relaxed text-slate-800">
          <RichText x={b.x} />
        </p>
      );
    case 'lead':
      return (
        <p className="rounded-r-xl border-l-4 border-pine-700 bg-pine-50 px-5 py-4 text-lg font-semibold text-pine-950 sm:text-xl">
          <RichText x={b.x} />
        </p>
      );
    case 'h':
      return (
        <h3 className="pt-3 text-lg font-semibold tracking-tight text-ink">
          <RichText x={b.x} />
        </h3>
      );
    case 'quote':
      return (
        <blockquote className="space-y-2 border-l-2 border-slate-300 pl-4 leading-relaxed text-slate-800">
          {b.x.map((p, i) => (
            <p key={i}>
              <RichText x={p} />
            </p>
          ))}
        </blockquote>
      );
    case 'ul':
      return (
        <ul className="list-disc space-y-1 pl-6 text-slate-800">
          {b.x.map((p, i) => (
            <li key={i}>
              <RichText x={p} />
            </li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol className="list-decimal space-y-1 pl-6 text-slate-800">
          {b.x.map((p, i) => (
            <li key={i}>
              <RichText x={p} />
            </li>
          ))}
        </ol>
      );
    case 'box':
      return <FactBox kind={b.kind} title={b.title} x={b.x} list={b.list} ordered={b.ordered} />;
    case 'formula':
      return (
        <figure className="rounded-xl border border-slate-200 bg-white p-4">
          {b.title && <figcaption className="mb-2 text-xs font-semibold tracking-wide text-slate-600 uppercase">{b.title}</figcaption>}
          <div className="num space-y-0.5 text-base">
            {b.lines.map((l) => (
              <p key={l} className="text-slate-800">
                {l}
              </p>
            ))}
            <p className="mt-1 border-t-2 border-ink pt-1 font-semibold text-ink">{b.result}</p>
          </div>
          {b.note && <p className="mt-2 text-sm text-slate-600">{b.note}</p>}
        </figure>
      );
    case 'compare':
      return (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {[b.a, b.b].map((s, i) => (
            <div key={s.title} className={clsx('rounded-xl border p-4', i === 0 ? 'border-slate-300 bg-white' : 'border-pine-300 bg-pine-50')}>
              <p className="font-semibold">{s.title}</p>
              {s.x && (
                <p className="mt-1 text-sm text-slate-800">
                  <RichText x={s.x} />
                </p>
              )}
              {s.list && s.list.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-slate-800">
                  {s.list.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      );
    case 'cards':
      return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {b.items.map((c) => (
            <div key={c.title} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="font-semibold">
                <RichText x={c.title} />
              </p>
              <p className="mt-1 text-sm text-slate-700">
                <RichText x={c.x} />
              </p>
            </div>
          ))}
        </div>
      );
    case 'table':
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            {b.caption && <caption className="sr-only">{b.caption}</caption>}
            <thead className="text-left text-xs text-slate-600">
              <tr>
                {b.head.map((h) => (
                  <th key={h} className="py-1 pr-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {b.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j} className="py-1.5 pr-3">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'flow':
      return (
        <figure className="rounded-xl border border-slate-200 bg-white p-4">
          {b.title && <figcaption className="mb-2 text-xs font-semibold tracking-wide text-slate-600 uppercase">{b.title}</figcaption>}
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
            {b.steps.map((s, i) => (
              <li key={s} className="flex items-center gap-2">
                <span className="rounded-lg bg-pine-50 px-2.5 py-1 font-medium text-pine-950">{s}</span>
                {i < b.steps.length - 1 && <span aria-hidden className="text-slate-400">→</span>}
              </li>
            ))}
          </ol>
        </figure>
      );
    case 'more':
      return (
        <details className="group rounded-xl border border-slate-200 bg-white">
          <summary className="cursor-pointer list-none rounded-xl px-4 py-3 text-sm font-semibold text-pine-900 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
            <span aria-hidden className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>
            {b.title}
          </summary>
          <div className="border-t border-slate-100 px-4 py-4">
            <Blocks blocks={b.blocks} />
          </div>
        </details>
      );
    case 'steps':
      return (
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]">
          {b.items.map((s, i) => (
            <li key={s.title} className="rounded-xl border border-slate-200 bg-white p-4">
              <span className="flex size-7 items-center justify-center rounded-full bg-pine-800 text-sm font-semibold text-white">{i + 1}</span>
              <p className="mt-2 font-semibold">{s.title}</p>
              {s.x && <p className="mt-0.5 text-sm text-slate-700">{s.x}</p>}
            </li>
          ))}
        </ol>
      );
    case 'widget': {
      const W = WIDGETS[b.id];
      return <W />;
    }
  }
}

export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-4">
      {blocks.map((b, i) => (
        <Fragment key={i}>
          <BlockView b={b} />
        </Fragment>
      ))}
    </div>
  );
}

export { EvidenceTag };
