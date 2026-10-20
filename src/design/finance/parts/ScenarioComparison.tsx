import clsx from 'clsx';
import { Check, ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Breakdown } from '../../../calc/engine';
import type { RankingResult } from '../../../calc/ranking';
import type { useScenarioRanking } from '../../../components/analysis/ScenarioRankingPanel';
import type { ResolvedAnalysisScenario } from '../../../domain/analysisScenarios';
import { FEASIBILITY_LABEL, SCENARIO_KIND_LABEL, SCENARIO_RISK_DIMENSIONS, SCENARIO_RISK_LABEL, STANDARD_CLASS_LABEL, UNCERTAINTY_LABEL, type FeasibilityStatus } from '../../../domain/enums';
import { RISK_BAND_LABEL } from '../../../domain/assessment';
import { formatHours, formatMonths, formatNOK, formatPct } from '../../../lib/format';
import { Button } from '../../../components/ui/primitives';
import type { PropertyContext } from '../../../components/analysis/shared';
import { Fig, Pill, SectionHeading, TONE_TEXT, type FinTone } from './primitives';
import { floorToThousand, hourlyLine, profitTone } from '../present';

/** Radene som alltid vises i mobilkortet; resten foldes ut. */
const KEY_ROWS = ['Gjennomførbarhet', 'Forventet fortjeneste', 'Anbefalt maksbud', 'Samlet rangering'];

interface Col {
  def: ResolvedAnalysisScenario;
  b: Breakdown | null;
  row: RankingResult['rows'][number] | undefined;
  recommended: boolean;
  active: boolean;
}

const FEAS_TONE: Record<FeasibilityStatus, FinTone> = { klar: 'pos', betinget: 'warn', uavklart: 'neutral', ikke_gjennomforbar: 'neg' };

interface RowDef {
  group: string;
  label: string;
  cell: (c: Col) => ReactNode;
}

const unk = (t = 'Ikke beregnet') => <span className="text-xs font-normal text-slate-500">{t}</span>;

function rowDefs(): RowDef[] {
  return [
    {
      group: 'Sluttprodukt',
      label: 'Soverom og standard',
      cell: ({ def }) => (
        <>
          <span className="font-medium">{def.endProduct.bedrooms === null ? 'Soverom ikke avklart' : `${def.endProduct.bedrooms} soverom`}</span>
          <span className="block text-xs text-slate-600">
            {def.endProduct.standardClass ? STANDARD_CLASS_LABEL[def.endProduct.standardClass] : 'Standard ikke dokumentert'}
          </span>
        </>
      ),
    },
    {
      group: 'Sluttprodukt',
      label: 'Gjennomførbarhet',
      cell: ({ def }) => (
        <>
          <Pill tone={FEAS_TONE[def.feasibility]}>{FEASIBILITY_LABEL[def.feasibility]}</Pill>
          {def.requirements.length > 0 && <span className="mt-1 block text-xs text-slate-600">{def.requirements.length} krav å avklare</span>}
        </>
      ),
    },
    { group: 'Prosjekt', label: 'Oppussing inkl. reserve', cell: ({ b }) => (b ? <Fig>{formatNOK(b.RB)}</Fig> : unk()) },
    { group: 'Prosjekt', label: 'Egne timer', cell: ({ b }) => (b ? <Fig>{b.ownHours === null ? 'Ikke avklart' : formatHours(b.ownHours)}</Fig> : unk()) },
    { group: 'Prosjekt', label: 'Varighet', cell: ({ b }) => (b ? <Fig>{formatMonths(b.months)}</Fig> : unk()) },
    { group: 'Prosjekt', label: 'Samlet kostnad', cell: ({ b }) => (b ? <Fig>{formatNOK(b.C)}</Fig> : unk()) },
    { group: 'Resultat', label: 'Forventet salgsverdi', cell: ({ b }) => (b ? <Fig>{formatNOK(b.V)}</Fig> : unk()) },
    { group: 'Resultat', label: 'Forventet fortjeneste', cell: ({ b }) => (b ? <Fig className={clsx('font-semibold', TONE_TEXT[profitTone(b.profit)])}>{formatNOK(b.profit)}</Fig> : unk()) },
    {
      group: 'Resultat',
      label: 'Per egeninnsatstime',
      cell: ({ b }) => {
        if (!b) return unk();
        const h = hourlyLine(b);
        return h.unknown ? unk(h.value) : <Fig className={TONE_TEXT[h.tone === 'warn' ? 'warn' : 'neutral']}>{h.value}</Fig>;
      },
    },
    { group: 'Resultat', label: 'Prosjektavkastning', cell: ({ b }) => (b ? <Fig>{formatPct(b.projectReturn)}</Fig> : unk()) },
    {
      group: 'Resultat',
      label: 'Anbefalt maksbud',
      cell: ({ row }) => (row?.metrics.maxBid != null ? <Fig className="font-semibold">{formatNOK(floorToThousand(row.metrics.maxBid))}</Fig> : unk('Ingen pris')),
    },
    {
      group: 'Vurdering',
      label: 'Risiko',
      cell: ({ def, row }) => {
        if (!row) return unk();
        const m = row.metrics;
        return (
          <>
            <span className="font-medium">{m.riskBand ? RISK_BAND_LABEL[m.riskBand] : 'Uavklart'} objekt</span>
            <span className="block text-xs text-slate-600">
              {def.risk
                ? SCENARIO_RISK_DIMENSIONS.map((d) => `${SCENARIO_RISK_LABEL[d].split(/[ -]/)[0].toLowerCase()} ${UNCERTAINTY_LABEL[def.risk![d]].toLowerCase()}`).join(' · ')
                : 'Scenariorisiko ikke vurdert (regnes som uavklart)'}
            </span>
          </>
        );
      },
    },
    {
      group: 'Vurdering',
      label: 'Salgsverdiens sikkerhet',
      cell: ({ row }) => (row ? <span>{row.metrics.saleCertaintyLabel}</span> : unk()),
    },
    {
      group: 'Vurdering',
      label: 'Samlet rangering',
      cell: ({ row }) =>
        row && row.position !== null ? (
          <>
            <span className="font-medium">Plass {row.position} · {Math.round(row.composite ?? 0)} poeng</span>
            {!row.eligible && <span className="block text-xs text-slate-600">Kan ikke anbefales før kravene er avklart</span>}
          </>
        ) : (
          <span className="text-xs text-slate-500">Rangeres ikke</span>
        ),
    },
  ];
}

function ColumnHead({ c, ctx, onUse }: { c: Col; ctx: PropertyContext; onUse: (id: string) => void }) {
  return (
    <>
      <span className="fin-label">{SCENARIO_KIND_LABEL[c.def.kind]}</span>
      <span className="mt-0.5 block text-base leading-snug font-semibold break-words">{c.def.title}</span>
      <span className="mt-1.5 flex flex-wrap gap-1">
        {c.recommended && (
          <Pill tone="info">
            <Check className="size-3" aria-hidden /> Anbefalt
          </Pill>
        )}
        {c.active && <Pill tone="pos">I bruk i kalkylen</Pill>}
      </span>
      {!c.active && (
        <Button size="sm" className="mt-2 min-h-9" disabled={!ctx.editable} onClick={() => onUse(c.def.id)}>
          Bruk i kalkylen
        </Button>
      )}
    </>
  );
}

/**
 * Sammenligning av basis og alternativer som en investeringsanalyse. Samme rader på desktop (tabell) og mobil (ett kort per scenario),
 * så ingenting krever horisontal rulling. Tallene er motorens – ingen egen beregning her.
 */
export function ScenarioComparison({ ctx, defs, data, activeId, onUse }: { ctx: PropertyContext; defs: ResolvedAnalysisScenario[]; data: ReturnType<typeof useScenarioRanking>['data']; activeId: string; onUse: (id: string) => void }) {
  const cols: Col[] = defs.map((def) => {
    const row = data.result.rows.find((r) => r.id === def.id);
    const input = data.rows.find((r) => r.input.id === def.id);
    return { def, b: input?.input.evaluation.base ?? null, row, recommended: Boolean(row?.recommended), active: def.id === activeId };
  });
  const rows = rowDefs();
  const groups = [...new Set(rows.map((r) => r.group))];
  const multi = defs.length > 1;
  return (
    <section aria-labelledby="scenarioer">
      <SectionHeading
        id="scenarioer"
        title={multi ? 'Scenarioer' : 'Scenario'}
        sub={multi ? 'Basis og alternative planløsninger, regnet med samme motor og dine forutsetninger. Betingede og uavklarte scenarioer kan ikke anbefales.' : 'Denne analysen har ett scenario.'}
      />

      {/* Desktop: tabell */}
      <div className="hidden overflow-hidden rounded-xl border border-[var(--fin-line)] bg-white md:block">
        <table className="w-full table-fixed text-sm" data-testid="fin-scenarios">
          <caption className="sr-only">Sammenligning av scenarioer</caption>
          <colgroup>
            <col className="w-[22%]" />
            {cols.map((c) => (
              <col key={c.def.id} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-[var(--fin-line)] bg-[var(--fin-surface-muted)] align-top">
              <td />
              {cols.map((c) => (
                <th key={c.def.id} scope="col" className={clsx('px-4 py-4 text-left font-normal', c.recommended && 'bg-[var(--fin-info-bg)]')}>
                  <ColumnHead c={c} ctx={ctx} onUse={onUse} />
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g} className="border-b border-[var(--fin-line)] last:border-b-0">
              <tr>
                <th colSpan={cols.length + 1} scope="colgroup" className="bg-white px-4 pt-4 pb-1 text-left">
                  <span className="fin-label">{g}</span>
                </th>
              </tr>
              {rows
                .filter((r) => r.group === g)
                .map((r) => (
                  <tr key={r.label} className="align-top">
                    <th scope="row" className="px-4 py-2 text-left text-sm font-normal text-slate-700">
                      {r.label}
                    </th>
                    {cols.map((c) => (
                      <td key={c.def.id} className={clsx('px-4 py-2 text-sm', c.recommended && 'bg-[var(--fin-info-bg)]/50')}>
                        {r.cell(c)}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          ))}
        </table>
      </div>

      {/* Mobil: ett kort per scenario. Nøkkeltall alltid synlige; resten kan foldes ut (anbefalt og aktivt scenario er åpent). */}
      <ul className="space-y-3 md:hidden" data-testid="fin-scenario-cards">
        {cols.map((c) => {
          const key = rows.filter((r) => KEY_ROWS.includes(r.label));
          const rest = rows.filter((r) => !KEY_ROWS.includes(r.label));
          return (
            <li key={c.def.id} className={clsx('rounded-xl border bg-white p-4', c.recommended ? 'border-pine-300 ring-1 ring-pine-200' : 'border-[var(--fin-line)]')}>
              <ColumnHead c={c} ctx={ctx} onUse={onUse} />
              <dl className="mt-3 divide-y divide-[var(--fin-line)] border-t border-[var(--fin-line)]">
                {key.map((r) => (
                  <div key={r.label} className="flex items-baseline justify-between gap-4 py-2 text-sm">
                    <dt className="shrink-0 text-slate-600">{r.label}</dt>
                    <dd className="min-w-0 text-right">{r.cell(c)}</dd>
                  </div>
                ))}
              </dl>
              <details className="group mt-1" open={c.recommended || c.active}>
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium text-pine-800 [&::-webkit-details-marker]:hidden">
                  <span className="group-open:hidden">Vis alle tall</span>
                  <span className="hidden group-open:inline">Skjul detaljer</span>
                  <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <dl className="divide-y divide-[var(--fin-line)] border-t border-[var(--fin-line)]">
                  {rest.map((r) => (
                    <div key={r.label} className="flex items-baseline justify-between gap-4 py-2 text-sm">
                      <dt className="shrink-0 text-slate-600">{r.label}</dt>
                      <dd className="min-w-0 text-right">{r.cell(c)}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
