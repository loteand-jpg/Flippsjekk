import clsx from 'clsx';
import { CircleHelp, ShieldAlert, ShieldCheck, ShieldHalf } from 'lucide-react';
import { RiskTab } from '../../../components/analysis/InfoTabs';
import type { PropertyContext } from '../../../components/analysis/shared';
import type { RiskBand } from '../../../domain/assessment';
import { formatNOK } from '../../../lib/format';
import { floorToThousand, type Tone } from '../../shared/present';
import type { RiskDimension } from '../../shared/riskView';
import { useRiskDimensions } from '../../shared/useRiskDimensions';
import { ZeroBars } from '../charts/ZeroBars';
import { signedNOK } from '../model/format';
import { Fig, Panel, Tag, TONE_TEXT } from '../ui';

const BAND_TONE: Record<RiskBand, Tone> = { lav: 'pos', middels: 'warn', hoy: 'neg', uavklart: 'neutral' };
const BAND_ICON: Record<RiskBand, typeof ShieldCheck> = { lav: ShieldCheck, middels: ShieldHalf, hoy: ShieldAlert, uavklart: CircleHelp };
const FILL: Record<RiskBand, number> = { uavklart: 0, lav: 1, middels: 2, hoy: 3 };
const BAR: Record<RiskBand, string> = { uavklart: 'bg-slate-400', lav: 'bg-[var(--inv-pos)]', middels: 'bg-amber-600', hoy: 'bg-[var(--inv-neg)]' };

/** Seks nivåer på ett blikk. Nivået står som tekst, og stolpene viser retning (flere = høyere risiko). Uavklart er ikke lav. */
function RiskMeter({ dims }: { dims: RiskDimension[] }) {
  return (
    <ul className="space-y-2" data-testid="inv-risk-meter">
      {dims.map((d) => (
        <li key={d.id} className="grid grid-cols-[minmax(7rem,9rem)_1fr_auto] items-center gap-3 text-[13px]">
          <span className="font-medium">{d.label}</span>
          <span className="flex gap-1" role="img" aria-label={`${d.label}: ${d.levelText}`}>
            {[1, 2, 3].map((n) => (
              <span key={n} className={clsx('h-2 flex-1 rounded-full', n <= FILL[d.band] ? BAR[d.band] : 'bg-slate-200')} />
            ))}
          </span>
          <Tag tone={BAND_TONE[d.band]} className="justify-self-end">{d.levelText}</Tag>
        </li>
      ))}
    </ul>
  );
}

function DimensionCard({ d }: { d: RiskDimension }) {
  const Icon = BAND_ICON[d.band];
  const costs = d.what.filter((w) => w.cost);
  return (
    <li className="min-w-0 rounded-xl border border-[var(--inv-line)] bg-white p-4" data-testid="inv-risk-dim">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="size-[18px] text-slate-600" aria-hidden /> {d.label}
        </h3>
        <Tag tone={BAND_TONE[d.band]}>{d.levelText}</Tag>
      </div>
      <dl className="mt-3 space-y-3 text-[13px]">
        <div>
          <dt className="inv-label">Hva (nedside)</dt>
          <dd className="mt-1">
            {d.what.length === 0 ? (
              <span className="text-slate-600">Ingen registrerte risikoer i denne dimensjonen.</span>
            ) : (
              <ul className="space-y-1">
                {d.what.slice(0, 4).map((w) => (
                  <li key={w.title} className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="min-w-0 break-words">{w.title}</span>
                    <span className="inv-num text-right text-xs text-slate-700">
                      {w.level === null ? 'ukjent alvorlighet' : `${w.level}/10`}
                      {w.cost ? ` · mulig merkostnad ${w.cost}` : ''}
                    </span>
                  </li>
                ))}
                {d.what.length > 4 && <li className="text-xs text-slate-600">+ {d.what.length - 4} til i risikoregisteret under</li>}
              </ul>
            )}
            {costs.length === 0 && d.what.length > 0 && <p className="mt-1 text-xs text-slate-600">Ingen kostnadsanslag registrert.</p>}
          </dd>
        </div>
        <div>
          <dt className="inv-label">Hvorfor</dt>
          <dd className="mt-1">
            {d.why.length === 0 ? (
              <span className="text-slate-600">Ikke vurdert i grunnlaget. Uavklart er ikke det samme som lav risiko.</span>
            ) : (
              <ul className="list-disc space-y-1 pl-4 text-slate-700">
                {d.why.map((t) => (
                  <li key={t} className="break-words">
                    {t}
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
        <div>
          <dt className="inv-label">Bør avklares før bud</dt>
          <dd className="mt-1">
            {d.clarify.length === 0 ? (
              <span className="text-slate-600">Ingen konkrete avklaringer registrert.</span>
            ) : (
              <ul className="list-disc space-y-1 pl-4 text-slate-700">
                {d.clarify.map((t) => (
                  <li key={t} className="break-words">
                    {t}
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
      </dl>
    </li>
  );
}

/**
 * Risiko som investeringsnedside. Base-case, downside og stress er motorens egne stresstester (ingen nye regler i frontend):
 * downside = salgspris −10 %, stress = kombinert (salg −10 %, oppussing +100 000 kr, tid +3 måneder).
 */
export function InvRisk({ ctx }: { ctx: PropertyContext }) {
  const { active, dims } = useRiskDimensions(ctx);
  const ev = ctx.result.evaluation;
  const b = ev.base;
  const down = ev.stress.find((s) => s.id === 'sale-10');
  const stress = ev.stress.find((s) => s.id === 'combined');
  return (
    <div className="space-y-5">
      <Panel id="downside" title="Nedside: base, downside og stress" sub="Fra motorens stresstester med samme forutsetninger som kalkylen. Ikke en prognose – et mål på hvor mye som tåles.">
        {b && down && stress ? (
          <div className="space-y-4">
            <ZeroBars
              valueHead="Fortjeneste før skatt"
              tableCaption="Fortjeneste i base, downside og stress"
              caption="Downside er salgspris −10 %. Stress er salgspris −10 %, oppussing +100 000 kr og prosjekttid +3 måneder."
              rows={[
                { id: 'base', label: 'Base-case', sub: 'Dagens kalkyle', value: b.profit, text: formatNOK(b.profit) },
                { id: 'down', label: 'Downside', sub: `${down.label} · ${signedNOK(down.deltaProfit)} mot base`, value: down.result.profit, text: formatNOK(down.result.profit) },
                { id: 'stress', label: 'Stress', sub: `Kombinert · ${signedNOK(stress.deltaProfit)} mot base`, value: stress.result.profit, text: formatNOK(stress.result.profit) },
              ]}
            />
            <dl className="grid gap-x-6 gap-y-3 border-t border-[var(--inv-line)] pt-3 sm:grid-cols-3" data-testid="inv-stress-summary">
              {[
                ['Base-case', b.profit, null],
                ['Downside', down.result.profit, down.maxBid],
                ['Stress', stress.result.profit, stress.maxBid],
              ].map(([l, p, m]) => (
                <div key={String(l)} className="min-w-0">
                  <dt className="inv-label">{String(l)}</dt>
                  <dd className="mt-0.5">
                    <Fig className={clsx('block text-lg font-bold', TONE_TEXT[(p as number) < 0 ? 'neg' : 'neutral'])}>{formatNOK(p as number)}</Fig>
                    {m !== null && (m as { price: number | null }).price !== undefined && (
                      <span className="block text-[11px] text-slate-600">Maksbud for fortjenestemålet her: {(m as { price: number | null }).price === null ? 'ingen pris' : formatNOK(floorToThousand((m as { price: number }).price))}</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : (
          <p className="text-sm text-slate-700">Stresstester krever en komplett kalkyle. Ukjent er ikke 0 kr.</p>
        )}
      </Panel>

      <Panel id="risikobilde" title="Risikobilde i seks dimensjoner" sub={`For scenarioet «${active.title}». Hver dimensjon forklarer hva risikoen er, hvorfor den finnes og hva som bør avklares før du byr.`}>
        <RiskMeter dims={dims} />
        <ul className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {dims.map((d) => (
            <DimensionCard key={d.id} d={d} />
          ))}
        </ul>
      </Panel>

      <section aria-labelledby="inv-register">
        <h2 id="inv-register" className="mb-1 text-base font-semibold tracking-tight">
          Risikoregister og sjekkliste
        </h2>
        <p className="mb-3 text-xs text-slate-600">Her kan du endre, skjule og legge til egne risikoer, og bekrefte sjekkpunkter. Endringene er private.</p>
        <RiskTab ctx={ctx} />
      </section>
    </div>
  );
}
