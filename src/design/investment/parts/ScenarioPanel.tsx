import clsx from 'clsx';
import { ArrowRightLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Breakdown } from '../../../calc/engine';
import type { RankRow } from '../../../calc/ranking';
import type { useScenarioRanking } from '../../../components/analysis/ScenarioRankingPanel';
import type { PropertyContext } from '../../../components/analysis/shared';
import { RISK_BAND_LABEL } from '../../../domain/assessment';
import type { ResolvedAnalysisScenario } from '../../../domain/analysisScenarios';
import { FEASIBILITY_LABEL, type FeasibilityStatus } from '../../../domain/enums';
import { formatHours, formatMonths, formatNOK, formatPct } from '../../../lib/format';
import { floorToThousand, type Tone } from '../../shared/present';
import { ZeroBars } from '../charts/ZeroBars';
import { scenarioDelta } from '../model/delta';
import { signedNOK, signedNumber, signedPct } from '../model/format';
import { Fig, Panel, Tag, TONE_TEXT } from '../ui';

const FEAS_TONE: Record<FeasibilityStatus, Tone> = { klar: 'pos', betinget: 'warn', uavklart: 'neutral', ikke_gjennomforbar: 'neg' };

interface Col {
  def: ResolvedAnalysisScenario;
  b: Breakdown | null;
  row: RankRow | undefined;
  recommended: boolean;
  active: boolean;
}

const better = (higherIsBetter: boolean, amount: number): Tone => (amount === 0 ? 'neutral' : (amount > 0) === higherIsBetter ? 'pos' : 'neg');

function Delta({ children, tone }: { children: ReactNode; tone: Tone }) {
  return <span className={clsx('inv-fig block text-[11px] leading-tight font-semibold', TONE_TEXT[tone])}>{children}</span>;
}

interface Metric {
  label: string;
  value: (c: Col) => ReactNode;
  delta?: (c: Col, base: Col) => ReactNode;
}

function metrics(): Metric[] {
  const num = (c: Col, f: (b: Breakdown) => ReactNode) => (c.b ? f(c.b) : <span className="text-xs font-normal text-slate-600">Ikke beregnet</span>);
  return [
    { label: 'Kjøpspris', value: (c) => num(c, (b) => <Fig>{formatNOK(b.P)}</Fig>) },
    {
      label: 'Oppussing inkl. reserve',
      value: (c) => num(c, (b) => <Fig>{formatNOK(b.RB)}</Fig>),
      delta: (c, base) => (c.b && base.b && Math.round(c.b.RB - base.b.RB) !== 0 ? <Delta tone={better(false, c.b.RB - base.b.RB)}>{signedNOK(c.b.RB - base.b.RB)}</Delta> : null),
    },
    {
      label: 'Salgsverdi',
      value: (c) => num(c, (b) => <Fig>{formatNOK(b.V)}</Fig>),
      delta: (c, base) => (c.b && base.b && Math.round(c.b.V - base.b.V) !== 0 ? <Delta tone={better(true, c.b.V - base.b.V)}>{signedNOK(c.b.V - base.b.V)}</Delta> : null),
    },
    {
      label: 'Forventet fortjeneste',
      value: (c) => num(c, (b) => <Fig className={clsx('font-semibold', TONE_TEXT[b.profit < 0 ? 'neg' : 'pos'])}>{formatNOK(b.profit)}</Fig>),
      delta: (c, base) => (c.b && base.b && Math.round(c.b.profit - base.b.profit) !== 0 ? <Delta tone={better(true, c.b.profit - base.b.profit)}>{signedNOK(c.b.profit - base.b.profit)}</Delta> : null),
    },
    {
      label: 'Prosjektavkastning',
      value: (c) => num(c, (b) => <Fig>{formatPct(b.projectReturn)}</Fig>),
      delta: (c, base) => (c.b && base.b && c.b.projectReturn !== null && base.b.projectReturn !== null && Math.abs(c.b.projectReturn - base.b.projectReturn) >= 0.0005 ? <Delta tone={better(true, c.b.projectReturn - base.b.projectReturn)}>{signedPct(c.b.projectReturn - base.b.projectReturn)}</Delta> : null),
    },
    {
      label: 'Egenkapitalbehov',
      value: (c) => num(c, (b) => <Fig>{formatNOK(b.equityNeed)}</Fig>),
      delta: (c, base) => (c.b && base.b && Math.round(c.b.equityNeed - base.b.equityNeed) !== 0 ? <Delta tone={better(false, c.b.equityNeed - base.b.equityNeed)}>{signedNOK(c.b.equityNeed - base.b.equityNeed)}</Delta> : null),
    },
    {
      label: 'Egne timer',
      value: (c) => num(c, (b) => <Fig>{b.ownHours === null ? 'Ikke avklart' : formatHours(b.ownHours)}</Fig>),
      delta: (c, base) => (c.b && base.b && c.b.ownHours !== null && base.b.ownHours !== null && c.b.ownHours !== base.b.ownHours ? <Delta tone={better(false, c.b.ownHours - base.b.ownHours)}>{signedNumber(c.b.ownHours - base.b.ownHours, 't')}</Delta> : null),
    },
    {
      label: 'Per egeninnsatstime',
      value: (c) => num(c, (b) => <Fig className={clsx(b.meetsHourlyRequirement === false && 'text-[var(--inv-warn)]')}>{b.profitPerOwnHour === null ? (b.ownHours === 0 ? 'Ingen timer' : 'Ikke beregnet') : `${formatNOK(b.profitPerOwnHour)}/t`}</Fig>),
      delta: (c, base) =>
        c.b && base.b && c.b.profitPerOwnHour !== null && base.b.profitPerOwnHour !== null && Math.round(c.b.profitPerOwnHour - base.b.profitPerOwnHour) !== 0 ? <Delta tone={better(true, c.b.profitPerOwnHour - base.b.profitPerOwnHour)}>{signedNOK(c.b.profitPerOwnHour - base.b.profitPerOwnHour).replace(/ kr$/, ' kr/t')}</Delta> : null,
    },
    {
      label: 'Varighet',
      value: (c) => num(c, (b) => <Fig>{formatMonths(b.months)}</Fig>),
      delta: (c, base) => (c.b && base.b && c.b.months !== base.b.months ? <Delta tone={better(false, c.b.months - base.b.months)}>{signedNumber(c.b.months - base.b.months, 'mnd')}</Delta> : null),
    },
    {
      label: 'Risiko',
      value: (c) =>
        c.row ? (
          <span>
            {c.row.metrics.riskBand ? RISK_BAND_LABEL[c.row.metrics.riskBand] : 'Uavklart'} objekt
            <span className="block text-[11px] text-slate-600">scenario {c.row.metrics.scenarioRiskAssessed ? `${c.row.metrics.scenarioRiskPoints.toLocaleString('nb-NO')}/4` : 'ikke vurdert'}</span>
          </span>
        ) : (
          <span className="text-xs text-slate-600">Ikke vurdert</span>
        ),
      delta: (c, base) => (c.row && base.row && c.row.metrics.riskPoints !== base.row.metrics.riskPoints ? <Delta tone={better(false, c.row.metrics.riskPoints - base.row.metrics.riskPoints)}>{c.row.metrics.riskPoints > base.row.metrics.riskPoints ? 'Høyere risiko' : 'Lavere risiko'}</Delta> : null),
    },
    {
      label: 'Gjennomførbarhet',
      value: (c) => (
        <span>
          <Tag tone={FEAS_TONE[c.def.feasibility]}>{FEASIBILITY_LABEL[c.def.feasibility]}</Tag>
          {c.def.requirements.length > 0 && <span className="mt-0.5 block text-[11px] text-slate-600">{c.def.requirements.length} krav å avklare</span>}
        </span>
      ),
    },
    { label: 'Salgsverdiens sikkerhet', value: (c) => <span>{c.row ? c.row.metrics.saleCertaintyLabel : 'Ikke vurdert'}</span> },
    {
      label: 'Anbefalt maksbud',
      value: (c) => (c.row?.metrics.maxBid != null ? <Fig className="font-bold">{formatNOK(floorToThousand(c.row.metrics.maxBid))}</Fig> : <span className="text-xs text-slate-600">Ikke beregnet</span>),
      delta: (c, base) =>
        c.row?.metrics.maxBid != null && base.row?.metrics.maxBid != null && floorToThousand(c.row.metrics.maxBid) !== floorToThousand(base.row.metrics.maxBid) ? (
          <Delta tone={better(true, c.row.metrics.maxBid - base.row.metrics.maxBid)}>{signedNOK(floorToThousand(c.row.metrics.maxBid) - floorToThousand(base.row.metrics.maxBid))}</Delta>
        ) : null,
    },
  ];
}

function Headline({ c, base, onUse, ctx }: { c: Col; base: Col; onUse: (id: string) => void; ctx: PropertyContext }) {
  if (!c.b || !base.b) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--inv-line-strong)] p-3 text-sm text-slate-700">
        Kan ikke sammenlignes med basis: kalkylen for {c.b ? base.def.title : c.def.title} er ufullstendig. Ukjent er ikke 0 kr.
      </div>
    );
  }
  const d = scenarioDelta(c.b, base.b);
  const tone: Tone = d.netProfit > 0 ? 'pos' : d.netProfit < 0 ? 'neg' : 'neutral';
  const risk = c.row && base.row ? c.row.metrics.riskPoints - base.row.metrics.riskPoints : 0;
  return (
    <div className="space-y-3">
      <div>
        <p className="inv-label">{c.def.title} mot {base.def.title}</p>
        <p className={clsx('mt-0.5 text-[1.625rem] leading-tight font-bold', TONE_TEXT[tone])} data-testid="inv-delta-net">
          <Fig>{signedNOK(d.netProfit)}</Fig> <span className="text-sm font-semibold text-slate-700">netto {d.netProfit >= 0 ? 'oppside' : 'nedside'}</span>
        </p>
        <p className="mt-0.5 text-xs text-slate-700">
          {d.renovation > 0 ? `for ${signedNOK(d.renovation)} mer i oppussing` : d.renovation < 0 ? `med ${signedNOK(d.renovation)} i oppussing` : 'uten endring i oppussing'}
          {d.months !== 0 ? ` · ${signedNumber(d.months, 'mnd')}` : ''}
          {d.ownHours !== null && d.ownHours !== 0 ? ` · ${signedNumber(d.ownHours, 't')} egeninnsats` : ''}
          {risk !== 0 ? ` · ${risk > 0 ? 'høyere' : 'lavere'} risiko` : ''}
        </p>
      </div>
      {d.purchase && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700" data-testid="inv-delta-price-note">
          Ulik kjøpspris i kalkylene ({formatNOK(d.purchase.alt)} mot {formatNOK(d.purchase.base)}): en del av endringen skyldes prisen, ikke scenarioet.
        </p>
      )}
      <ZeroBars
        valueHead="Effekt på fortjeneste"
        tableCaption={`Endring i fortjeneste: ${c.def.title} mot ${base.def.title}`}
        rows={[
          ...d.lines.map((l) => ({ id: l.id, label: l.label, value: l.amount, text: signedNOK(l.amount) })),
          { id: 'net', label: 'Netto fortjeneste', value: d.netProfit, text: signedNOK(d.netProfit), emphasis: true },
        ]}
      />
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[var(--inv-line)] pt-3">
        {[
          ['Egenkapitalbehov', d.equityNeed === null ? 'Ikke avklart' : signedNOK(d.equityNeed)],
          ['Egne timer', d.ownHours === null ? 'Ikke avklart' : signedNumber(d.ownHours, 't')],
          ['Varighet', signedNumber(d.months, 'mnd')],
          ['Prosjektavkastning', d.projectReturn === null ? 'Ikke beregnet' : signedPct(d.projectReturn)],
        ].map(([l, v]) => (
          <div key={l} className="min-w-0">
            <dt className="inv-label">{l}</dt>
            <dd className="inv-fig mt-0.5 text-sm font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        <Tag tone={FEAS_TONE[c.def.feasibility]}>{FEASIBILITY_LABEL[c.def.feasibility]}</Tag>
        {c.row && !c.row.eligible && <span className="text-xs text-slate-700">Kan ikke anbefales før kravene er avklart.</span>}
        <button
          type="button"
          disabled={!ctx.editable || c.active}
          onClick={() => onUse(c.def.id)}
          className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-[var(--inv-line-strong)] bg-white px-3 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 md:min-h-9"
        >
          <ArrowRightLeft className="size-4" aria-hidden /> {c.active ? 'I bruk i kalkylen' : 'Bruk i kalkylen'}
        </button>
      </div>
    </div>
  );
}

/**
 * Scenarioer som investeringsalternativer. Tabellen viser verdiene side om side med endring mot basis under hvert tall;
 * kortene under svarer på «hva får jeg igjen for ekstra investering?» som en regnskapsmessig oppdeling av endringen i fortjeneste.
 * Alle tall er motorens. Endringen er differansen mellom to eksisterende motorresultater.
 */
export function ScenarioPanel({ ctx, defs, data, activeId, onUse }: { ctx: PropertyContext; defs: ResolvedAnalysisScenario[]; data: ReturnType<typeof useScenarioRanking>['data']; activeId: string; onUse: (id: string) => void }) {
  const cols: Col[] = defs.map((def) => {
    const row = data.result.rows.find((r) => r.id === def.id);
    const input = data.rows.find((r) => r.input.id === def.id);
    return { def, b: input?.input.evaluation.base ?? null, row, recommended: Boolean(row?.recommended), active: def.id === activeId };
  });
  const base = cols.find((c) => c.def.kind === 'basis') ?? cols[0];
  const alts = cols.filter((c) => c !== base);
  const rows = metrics();
  if (cols.length < 2) {
    return (
      <Panel id="scenarioer" title="Scenario" sub="Denne analysen har ett scenario – ingen alternativer å sammenligne med.">
        <p className="text-sm text-slate-700">{base.def.title}: {base.b ? `fortjeneste ${formatNOK(base.b.profit)}` : 'kalkylen er ufullstendig'}.</p>
      </Panel>
    );
  }
  return (
    <Panel id="scenarioer" title="Scenarioer – hva får jeg igjen?" sub="Basis og alternativer regnet med samme motor og dine forutsetninger. Endring mot basis står under hvert tall. Betingede og uavklarte scenarioer kan ikke anbefales.">
      {/* Desktop: side om side med delta */}
      <div className="hidden overflow-hidden rounded-lg border border-[var(--inv-line)] md:block">
        <table className="w-full table-fixed text-[13px]" data-testid="inv-scenarios">
          <caption className="sr-only">Sammenligning av scenarioer, med endring mot basis under hvert tall</caption>
          <colgroup>
            <col className="w-[24%]" />
            {cols.map((c) => (
              <col key={c.def.id} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-[var(--inv-line)] bg-slate-50 align-top">
              <td />
              {cols.map((c) => (
                <th key={c.def.id} scope="col" className={clsx('px-3 py-3 text-left font-normal', c.recommended && 'bg-pine-50')}>
                  <p className="inv-label">{c.def.kind === 'basis' ? 'Basis' : 'Alternativ'}</p>
                  <p className="mt-0.5 text-sm font-semibold">{c.def.title}</p>
                  <p className="mt-1 flex flex-wrap gap-1">
                    {c.recommended && <Tag tone="pos">Anbefalt</Tag>}
                    {c.active && <Tag tone="info">I bruk</Tag>}
                  </p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--inv-line)]">
            {rows.map((m) => (
              <tr key={m.label} className="align-top">
                <th scope="row" className="px-3 py-2 text-left font-normal text-slate-700">
                  {m.label}
                </th>
                {cols.map((c) => (
                  <td key={c.def.id} className={clsx('px-3 py-2', c.recommended && 'bg-pine-50/50')}>
                    {m.value(c)}
                    {c !== base && m.delta ? m.delta(c, base) : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobil: basis som referansekort */}
      <div className="rounded-lg border border-[var(--inv-line)] bg-slate-50 p-3 md:hidden" data-testid="inv-scenario-base">
        <p className="inv-label">Basis</p>
        <p className="text-sm font-semibold">{base.def.title}</p>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {[0, 3, 5, 8].map((i) => (
            <div key={rows[i].label} className="min-w-0">
              <dt className="inv-label">{rows[i].label}</dt>
              <dd className="mt-0.5 font-medium">{rows[i].value(base)}</dd>
            </div>
          ))}
        </dl>
      </div>

      <h3 className="mt-5 mb-2 text-sm font-semibold">Hva får jeg igjen for ekstra investering?</h3>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2" data-testid="inv-scenario-cards">
        {alts.map((c) => (
          <li key={c.def.id} className={clsx('min-w-0 rounded-xl border p-4', c.recommended ? 'border-pine-400 ring-1 ring-pine-200' : 'border-[var(--inv-line)]')}>
            <Headline c={c} base={base} onUse={onUse} ctx={ctx} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}
