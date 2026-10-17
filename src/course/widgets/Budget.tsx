import { Download, Printer, RotateCcw, FlaskConical } from 'lucide-react';
import { Select, NumberInput, Field } from '../../components/ui/forms';
import { Alert, Button } from '../../components/ui/primitives';
import { formatNOK, UNKNOWN } from '../../lib/format';
import { EvidenceTag, type EvidenceKind } from '../components';
import { COURSE_CHECKED } from '../types';
import { downloadText, escapeHtml, printHtml } from '../print';
import { useCourse, type BudgetLine, type LineTag } from '../progress';
import { useCalc } from './Calculator';

interface LineDef {
  id: string;
  label: string;
  /** Hva posten lander i når budsjettet brukes i kalkulatoren. */
  maps: 'purchase' | 'duty' | 'buyFees' | 'reno' | 'monthly' | 'saleFixed';
  note?: string;
}
interface CategoryDef {
  id: string;
  title: string;
  monthly?: boolean;
  lines: LineDef[];
  footnote?: string;
}

export const BUDGET: CategoryDef[] = [
  {
    id: 'kjop',
    title: 'Kjøp',
    lines: [
      { id: 'k-kjopesum', label: 'Kjøpesum', maps: 'purchase' },
      { id: 'k-dokavgift', label: 'Dokumentavgift', maps: 'duty', note: 'Beregnes av kalkulatoren etter eierform' },
      { id: 'k-tinglysing', label: 'Tinglysing', maps: 'buyFees' },
      { id: 'k-bank', label: 'Eventuelle bankgebyrer', maps: 'buyFees' },
      { id: 'k-andre', label: 'Andre ervervskostnader', maps: 'buyFees' },
    ],
  },
  {
    id: 'oppussing',
    title: 'Oppussing',
    lines: [
      ['o-materialer', 'Materialer'],
      ['o-tomrer', 'Tømrer'],
      ['o-el', 'Elektriker'],
      ['o-ror', 'Rørlegger'],
      ['o-membran', 'Membran/flis'],
      ['o-kjokken', 'Kjøkken'],
      ['o-bad', 'Bad'],
      ['o-maling', 'Maling'],
      ['o-gulv', 'Gulv'],
      ['o-avfall', 'Avfall'],
      ['o-verktoy', 'Verktøy'],
      ['o-levering', 'Levering'],
      ['o-rigg', 'Rigg'],
      ['o-sok', 'Eventuelle søknader/rådgivere'],
      ['o-samlet', 'Annet / samlet oppussing'],
    ].map(([id, label]) => ({ id, label, maps: 'reno' as const })),
    footnote: 'Anslag er ikke pristilbud. Innhent tilbud når posten er avgjørende.',
  },
  {
    id: 'fin',
    title: 'Finansiering',
    lines: [
      { id: 'f-etablering', label: 'Etableringskostnad', maps: 'buyFees', note: 'Legges til øvrige kjøpsgebyrer i kalkulatoren' },
      { id: 'f-takst', label: 'Eventuelle takster', maps: 'buyFees', note: 'Legges til øvrige kjøpsgebyrer i kalkulatoren' },
    ],
    footnote: 'Renter og prosjektets varighet regnes i kalkulatoren (modul 8).',
  },
  {
    id: 'lop',
    title: 'Løpende eierskap (per måned)',
    monthly: true,
    lines: [
      ['l-felles', 'Felleskostnader'],
      ['l-kommunale', 'Kommunale avgifter'],
      ['l-forsikring', 'Forsikring'],
      ['l-strom', 'Strøm'],
      ['l-eiendomsskatt', 'Eventuell eiendomsskatt'],
      ['l-internett', 'Internett der relevant'],
      ['l-andre', 'Andre løpende kostnader'],
    ].map(([id, label]) => ({ id, label, maps: 'monthly' as const })),
  },
  {
    id: 'salg',
    title: 'Salg (faste kostnader)',
    lines: [
      ['s-megler', 'Megler (fast del)'],
      ['s-oppgjor', 'Oppgjør'],
      ['s-markedsforing', 'Markedsføring'],
      ['s-foto', 'Foto'],
      ['s-plantegning', 'Plantegning'],
      ['s-tilstandsrapport', 'Tilstandsrapport'],
      ['s-forsikring', 'Boligselgerforsikring (hvis valgt)'],
      ['s-styling', 'Styling'],
      ['s-vask', 'Vask'],
      ['s-visning', 'Visning'],
      ['s-samlet', 'Annet / samlet salgskostnad'],
    ].map(([id, label]) => ({ id, label, maps: 'saleFixed' as const })),
    footnote: 'Provisjon (prosent av salgssummen) legges inn i kalkulatoren.',
  },
];

const ALL_LINES = BUDGET.flatMap((c) => c.lines);
const TAG_LABEL: Record<LineTag, string> = { dokumentert: 'Dokumentert', anslag: 'Analyse/estimat', mine: 'Din forutsetning', uavklart: 'Uavklart' };
const TAG_KIND: Record<LineTag, EvidenceKind> = { dokumentert: 'dokumentert', anslag: 'analyse', mine: 'mine', uavklart: 'uavklart' };

const defLine = (): BudgetLine => ({ amount: null, tag: 'uavklart', include: true });

interface Sum {
  known: number;
  unknown: number;
}
export function sumCategory(cat: CategoryDef, lines: Record<string, BudgetLine>): Sum {
  let known = 0;
  let unknown = 0;
  for (const l of cat.lines) {
    const b = lines[l.id] ?? defLine();
    if (!b.include) continue;
    if (b.amount === null) unknown++;
    else known += b.amount;
  }
  return { known, unknown };
}

/** Case A som utfylt eksempel. Posten er samlet i én linje der kursteksten ikke deler den opp. */
export function caseAExample(): { lines: Record<string, BudgetLine>; reservePct: number } {
  const lines: Record<string, BudgetLine> = {};
  for (const l of ALL_LINES) lines[l.id] = { amount: null, tag: 'uavklart', include: false };
  const set = (id: string, amount: number, tag: LineTag) => (lines[id] = { amount, tag, include: true });
  set('k-kjopesum', 3_000_000, 'mine');
  set('k-dokavgift', 75_000, 'dokumentert');
  set('k-andre', 2_000, 'mine');
  set('o-samlet', 220_000, 'anslag');
  set('l-andre', 5_000, 'anslag');
  set('s-samlet', 80_000, 'anslag');
  return { lines, reservePct: 20 };
}

export function budgetRows(lines: Record<string, BudgetLine>) {
  return BUDGET.map((c) => ({
    cat: c,
    rows: c.lines.map((l) => ({ def: l, line: lines[l.id] ?? defLine() })),
    sum: sumCategory(c, lines),
  }));
}

function fmt(l: BudgetLine): string {
  if (!l.include) return 'Ikke aktuell';
  return l.amount === null ? UNKNOWN : formatNOK(l.amount);
}

export function budgetHtml(lines: Record<string, BudgetLine>, reservePct: number | null, summary: string): string {
  const rows = budgetRows(lines);
  const body = rows
    .map(
      ({ cat, rows: rs, sum }) =>
        `<h2>${escapeHtml(cat.title)}</h2><table>${rs
          .map(({ def, line }) => `<tr><td>${escapeHtml(def.label)}</td><td>${escapeHtml(line.include ? TAG_LABEL[line.amount === null ? 'uavklart' : line.tag] : '–')}</td><td class="n">${escapeHtml(fmt(line))}</td></tr>`)
          .join('')}<tr><th>Sum kjente poster${cat.monthly ? ' per måned' : ''}</th><th></th><th class="n">${escapeHtml(formatNOK(sum.known))}${sum.unknown ? ` + ${sum.unknown} uavklart` : ''}</th></tr></table>`,
    )
    .join('');
  return `<h1>Flippbudsjett</h1><p class="meta">Flippsjekk – Nivå 1 Flipping som privatperson · Faglig kontrollert: ${COURSE_CHECKED}</p>${body}<h2>Reserve</h2><p>Reserve på oppussing: ${reservePct === null ? UNKNOWN : `${reservePct} %`}</p><h2>Resultat i kalkulatoren</h2><p>${escapeHtml(summary)}</p><p class="note">Poster merket «Uavklart» er ikke undersøkt og er ikke 0 kroner. Oppussingsanslag er ikke pristilbud. Skatt er ikke inkludert. Kurset gir generell opplæring og ingen garanti for fortjeneste.</p>`;
}

export function budgetCsv(lines: Record<string, BudgetLine>, reservePct: number | null): string {
  const out = ['Kategori;Post;Status;Beløp (NOK)'];
  for (const { cat, rows } of budgetRows(lines)) {
    for (const { def, line } of rows) {
      const status = !line.include ? 'Ikke aktuell' : TAG_LABEL[line.amount === null ? 'uavklart' : line.tag];
      out.push(`${cat.title};${def.label};${status};${line.include && line.amount !== null ? line.amount : ''}`);
    }
  }
  out.push(`Reserve;Oppussingsreserve (prosent);Din forutsetning;${reservePct ?? ''}`);
  return '﻿' + out.join('\n');
}

export function BudgetBuilder() {
  const { state, update } = useCourse();
  const { calc, replace, result } = useCalc();
  const { lines, reservePct } = state.budget;
  const setLine = (id: string, patch: Partial<BudgetLine>) => update((s) => ({ ...s, budget: { ...s.budget, lines: { ...s.budget.lines, [id]: { ...(s.budget.lines[id] ?? defLine()), ...patch } } } }));
  const rows = budgetRows(lines);
  const catSum = (id: string) => rows.find((r) => r.cat.id === id)!.sum;
  const reno = catSum('oppussing');
  const reserve = reno.known * ((reservePct ?? 0) / 100);
  const unknownTotal = rows.reduce((s, r) => s + r.sum.unknown, 0);
  const knownTotalOnce = rows.filter((r) => !r.cat.monthly).reduce((s, r) => s + r.sum.known, 0);
  const monthly = catSum('lop');
  const b = result.evaluation.base;
  const summary = b ? `Base-scenario: resultat før skatt og egen tid ${formatNOK(b.profit)}, samlede kontantkostnader ${formatNOK(b.C)}.` : 'Kalkylen i modul 8 er ufullstendig – ingen resultat vises.';

  const mapped = (m: LineDef['maps']) => ALL_LINES.filter((l) => l.maps === m);
  const blockers = (['purchase', 'buyFees', 'reno', 'monthly', 'saleFixed'] as const).flatMap((m) => mapped(m).filter((l) => (lines[l.id] ?? defLine()).include && (lines[l.id] ?? defLine()).amount === null).map((l) => l.label));
  const sumOf = (m: LineDef['maps']) => mapped(m).reduce((s, l) => s + ((lines[l.id] ?? defLine()).include ? (lines[l.id] ?? defLine()).amount ?? 0 : 0), 0);
  const useInCalc = () =>
    replace({
      ...calc,
      purchasePrice: sumOf('purchase'),
      buyFees: sumOf('buyFees'),
      renovationMode: 'rundsum',
      renovationLumpSum: sumOf('reno'),
      reservePct,
      monthlyCost: sumOf('monthly'),
      saleFixedCost: sumOf('saleFixed'),
    });

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4" aria-label="Flippbudsjett">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="font-semibold">Flippbudsjett</h4>
          <p className="text-xs text-slate-600">Tom post = uavklart. Velg «Ikke aktuell» bare når posten ikke gjelder prosjektet ditt.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<FlaskConical className="size-4" aria-hidden />} onClick={() => update((s) => ({ ...s, budget: caseAExample() }))}>
            Se utfylt eksempel (Case A)
          </Button>
          <Button size="sm" icon={<Printer className="size-4" aria-hidden />} onClick={() => printHtml('Flippbudsjett', budgetHtml(lines, reservePct, summary))}>
            Skriv ut
          </Button>
          <Button size="sm" icon={<Download className="size-4" aria-hidden />} onClick={() => downloadText('flippsjekk-flippbudsjett.csv', budgetCsv(lines, reservePct), 'text/csv;charset=utf-8')}>
            Last ned (.csv)
          </Button>
          <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" aria-hidden />} onClick={() => update((s) => ({ ...s, budget: { lines: {}, reservePct: 20 } }))}>
            Tøm
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-5">
        {rows.map(({ cat, rows: rs, sum }) => (
          <fieldset key={cat.id}>
            <legend className="mb-1 text-sm font-semibold">{cat.title}</legend>
            <div className="overflow-x-auto">
              <table className="num w-full min-w-[34rem] text-sm">
                <caption className="sr-only">{cat.title}</caption>
                <tbody className="divide-y divide-slate-100">
                  {rs.map(({ def, line }) => {
                    const tag: LineTag = line.amount === null ? 'uavklart' : line.tag;
                    return (
                      <tr key={def.id} className={line.include ? undefined : 'text-slate-400'}>
                        <th scope="row" className="w-[34%] py-1.5 pr-2 text-left font-normal">
                          {def.label}
                          {def.note && <span className="block text-[11px] text-slate-500">{def.note}</span>}
                        </th>
                        <td className="w-[30%] py-1 pr-2">
                          <NumberInput aria-label={`Beløp ${def.label}`} value={line.include ? line.amount : null} disabled={!line.include} placeholder={line.include ? 'Uavklart' : 'Ikke aktuell'} unit="kr" onChange={(v) => setLine(def.id, { amount: v, tag: v === null ? 'uavklart' : line.tag === 'uavklart' ? 'mine' : line.tag })} />
                        </td>
                        <td className="w-[22%] py-1 pr-2">
                          {line.include && line.amount !== null ? (
                            <Select aria-label={`Status ${def.label}`} className="h-8 text-xs" value={line.tag === 'uavklart' ? 'mine' : line.tag} onChange={(e) => setLine(def.id, { tag: e.target.value as LineTag })}>
                              {(['dokumentert', 'anslag', 'mine'] as const).map((t) => (
                                <option key={t} value={t}>
                                  {TAG_LABEL[t]}
                                </option>
                              ))}
                            </Select>
                          ) : line.include ? (
                            <EvidenceTag kind={TAG_KIND[tag]} />
                          ) : null}
                        </td>
                        <td className="py-1 text-right">
                          <label className="inline-flex items-center gap-1 text-xs text-slate-600">
                            <input type="checkbox" className="accent-pine-700" checked={!line.include} onChange={(e) => setLine(def.id, { include: !e.target.checked, amount: e.target.checked ? null : line.amount })} />
                            Ikke aktuell
                          </label>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-sm">
              <span className="text-slate-600">Sum kjente poster{cat.monthly ? ' per måned' : ''}:</span> <strong className="num">{formatNOK(sum.known)}</strong>
              {sum.unknown > 0 && <span className="ml-2 rounded border border-amber-300 bg-amber-50 px-1.5 text-xs font-medium text-amber-900">+ {sum.unknown} uavklart</span>}
            </p>
            {cat.footnote && <p className="text-xs text-slate-600">{cat.footnote}</p>}
          </fieldset>
        ))}

        <div className="rounded-xl bg-slate-50 p-4">
          <div className="grid max-w-xs grid-cols-1">
            <Field label="Reserve på oppussing" labelAside={<EvidenceTag kind="mine" />} hint="Eksempel: 20 %. Reserve er penger til forhold du ikke kjente til.">
              {(p) => <NumberInput {...p} unit="%" value={reservePct} onChange={(v) => update((s) => ({ ...s, budget: { ...s.budget, reservePct: v } }))} />}
            </Field>
          </div>
          <dl className="num mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-lg bg-white p-2">
              <dt className="text-xs text-slate-600">Reserve av kjent oppussing</dt>
              <dd className="font-semibold">{reservePct === null ? UNKNOWN : formatNOK(reserve)}</dd>
            </div>
            <div className="rounded-lg bg-white p-2">
              <dt className="text-xs text-slate-600">Kjente engangsposter (ekskl. renter og reserve)</dt>
              <dd className="font-semibold">{formatNOK(knownTotalOnce)}</dd>
            </div>
            <div className="rounded-lg bg-white p-2">
              <dt className="text-xs text-slate-600">Løpende per måned</dt>
              <dd className="font-semibold">{formatNOK(monthly.known)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-sm">
            {unknownTotal > 0 ? (
              <strong className="text-amber-900">Totalen er «minst» dette beløpet: {unknownTotal} poster er uavklart og er ikke regnet som 0 kroner.</strong>
            ) : (
              <span>Alle aktuelle poster har et beløp.</span>
            )}
          </p>
        </div>

        <div className="space-y-2">
          <Button variant="primary" disabled={blockers.length > 0} onClick={useInCalc}>
            Bruk budsjettet i kalkulatoren
          </Button>
          {blockers.length > 0 ? (
            <Alert tone="warning">
              <p>Fyll inn beløp eller marker «Ikke aktuell» for: {blockers.slice(0, 6).join(', ')}
                {blockers.length > 6 ? ` og ${blockers.length - 6} til` : ''}.</p>
            </Alert>
          ) : (
            <p className="text-xs text-slate-600">Overfører kjøpesum, øvrige gebyrer, oppussing, reserve, månedlige kostnader og faste salgskostnader. Dokumentavgift og renter beregnes av kalkulatoren.</p>
          )}
        </div>
      </div>
    </section>
  );
}
