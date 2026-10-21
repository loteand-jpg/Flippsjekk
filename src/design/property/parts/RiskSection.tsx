import clsx from 'clsx';
import { CircleHelp, ShieldAlert, ShieldCheck, ShieldHalf } from 'lucide-react';
import type { RiskBand } from '../../../domain/assessment';
import type { Risk } from '../../../domain/schemas';
import type { RiskDimension } from '../../shared/riskView';
import type { Tone } from '../../shared/present';
import type { HomeSpot } from '../model/homeRisk';
import type { Knowledge } from '../model/knowledge';
import { Section, Tag } from '../ui';
import { jumpTo } from './jump';

const BAND_TONE: Record<RiskBand, Tone> = { lav: 'pos', middels: 'warn', hoy: 'neg', uavklart: 'neutral' };
const BAND_ICON: Record<RiskBand, typeof ShieldCheck> = { lav: ShieldCheck, middels: ShieldHalf, hoy: ShieldAlert, uavklart: CircleHelp };
const BAND_BORDER: Record<RiskBand, string> = { lav: 'border-l-[var(--prop-pos)]', middels: 'border-l-[var(--prop-warn)]', hoy: 'border-l-[var(--prop-neg)]', uavklart: 'border-l-[var(--prop-line-strong)]' };

function Spot({ s }: { s: HomeSpot }) {
  const Icon = BAND_ICON[s.band];
  return (
    <li className={clsx('min-w-0 rounded-2xl border border-l-4 border-[var(--prop-line)] bg-[var(--prop-paper)] p-4', BAND_BORDER[s.band])} data-testid="prop-spot">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="prop-serif flex items-center gap-2 text-[1.125rem] leading-snug">
          <Icon className="size-[18px] shrink-0 text-slate-600" aria-hidden /> {s.label}
        </h4>
        <Tag tone={BAND_TONE[s.band]}>{s.levelText}</Tag>
      </div>
      {s.risks.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {s.risks.slice(0, 3).map((r) => (
            <li key={r.title} className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="min-w-0 break-words">{r.title}</span>
              <span className="prop-fig text-xs text-slate-600">
                {r.level === null ? 'ukjent alvorlighet' : `${r.level}/10`}
                {r.cost ? ` · ${r.cost}` : ''}
              </span>
            </li>
          ))}
          {s.risks.length > 3 && <li className="text-xs text-slate-600">+ {s.risks.length - 3} til i risikoregisteret</li>}
        </ul>
      )}
      {s.notes.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-slate-800">
          {s.notes.map((n) => (
            <li key={n} className="break-words">
              {n}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Dimension({ d }: { d: RiskDimension }) {
  const Icon = BAND_ICON[d.band];
  return (
    <li className="min-w-0 rounded-xl border border-[var(--prop-line)] bg-[var(--prop-paper)]" data-testid="prop-risk-dim">
      <details>
        <summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-2 px-3.5 py-2.5">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Icon className="size-4 text-slate-600" aria-hidden /> {d.label}
          </span>
          <Tag tone={BAND_TONE[d.band]}>{d.levelText}</Tag>
        </summary>
        <div className="space-y-3 border-t border-[var(--prop-line)] px-3.5 py-3 text-sm">
          <div>
            <h5 className="prop-label">Hva</h5>
            {d.what.length === 0 ? (
              <p className="mt-1 text-slate-700">Ingen registrerte risikoer i denne dimensjonen.</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {d.what.slice(0, 4).map((w) => (
                  <li key={w.title} className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="min-w-0 break-words">{w.title}</span>
                    <span className="prop-fig text-xs text-slate-600">
                      {w.level === null ? 'ukjent alvorlighet' : `${w.level}/10`}
                      {w.cost ? ` · ${w.cost}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h5 className="prop-label">Hvorfor</h5>
            {d.why.length === 0 ? (
              <p className="mt-1 text-slate-700">Ikke vurdert i grunnlaget. Uavklart er ikke det samme som lav risiko.</p>
            ) : (
              <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-800">
                {d.why.map((t) => (
                  <li key={t} className="break-words">
                    {t}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h5 className="prop-label">Bør avklares</h5>
            {d.clarify.length === 0 ? (
              <p className="mt-1 text-slate-700">Ingen konkrete avklaringer registrert.</p>
            ) : (
              <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-800">
                {d.clarify.map((t) => (
                  <li key={t} className="break-words">
                    {t}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </details>
    </li>
  );
}

function KnowledgeColumn({ title, sub, items, empty, tone, testId }: { title: string; sub: string; items: Knowledge['known']; empty: string; tone: Tone; testId: string }) {
  const MAX = 6;
  return (
    <div className="min-w-0 rounded-2xl border border-[var(--prop-line)] bg-[var(--prop-paper)] p-4" data-testid={testId}>
      <h4 className="prop-serif flex items-center gap-2 text-[1.125rem]">
        {title} <Tag tone={tone} className="font-sans">{items.length}</Tag>
      </h4>
      <p className="text-xs text-slate-700">{sub}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-slate-700">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-1.5 text-sm">
          {items.slice(0, MAX).map((i) => (
            <li key={i.text} className="min-w-0 break-words">
              {i.text}
              {i.detail && <span className="block text-xs text-slate-600">{i.detail}</span>}
            </li>
          ))}
          {items.length > MAX && (
            <li>
              <details>
                <summary className="inline-flex min-h-11 cursor-pointer items-center text-xs font-medium text-pine-700 underline md:min-h-8">Vis {items.length - MAX} til</summary>
                <ul className="mt-1 space-y-1.5">
                  {items.slice(MAX).map((i) => (
                    <li key={i.text} className="min-w-0 break-words">
                      {i.text}
                      {i.detail && <span className="block text-xs text-slate-600">{i.detail}</span>}
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/**
 * Risiko knyttet til boligen (der analysen støtter det), de seks delte risikodimensjonene, og hva vi vet, antar og må sjekke. Nivåene er ikke en
 * prognose; uavklart er aldri det samme som lav risiko.
 */
export function RiskSection({ versionTitle, spots, dims, knowledge, risks, onOpenRegister }: { versionTitle: string; spots: HomeSpot[]; dims: RiskDimension[]; knowledge: Knowledge; risks: readonly Risk[]; onOpenRegister: () => void }) {
  return (
    <Section id="risiko" eyebrow="7 · Hva kan gå galt?" title="Risiko i boligen" intro={`Risikoene knyttet til delene av boligen, slik analysen beskriver dem for ${versionTitle}. Nivåene er ikke en prognose.`}>
      <div className="space-y-8">
        <div>
          <h3 className="prop-serif mb-2 text-[1.25rem]">Der det kan svikte</h3>
          {spots.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--prop-line-strong)] p-4 text-sm text-slate-800" data-testid="prop-spots-empty">
              {risks.length === 0
                ? 'Analysen har ikke registrert risikoer for boligen. Det betyr ikke at boligen er uten risiko – bare at ingen er vurdert. Se de seks dimensjonene under.'
                : 'Analysen knytter ikke risikoene til bestemte deler av boligen (våtrom, elektrisk, tak, marked eller planløsning). De seks dimensjonene under viser dem samlet.'}
            </p>
          ) : (
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="prop-spots">
              {spots.map((s) => (
                <Spot key={s.id} s={s} />
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="prop-serif mb-2 text-[1.25rem]">Seks dimensjoner</h3>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-2.5 lg:grid-cols-2" data-testid="prop-risk-dims">
            {dims.map((d) => (
              <Dimension key={d.id} d={d} />
            ))}
          </ul>
        </div>
        <div>
          <h3 className="prop-serif mb-2 text-[1.25rem]">Hva vet vi – og hva ikke?</h3>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-3" data-testid="prop-knowledge">
            <KnowledgeColumn testId="prop-known" title="Hva vet vi?" sub="Dokumentert i salgsoppgave, rapporter eller kilder." items={knowledge.known} empty="Ingenting er dokumentert ennå." tone="pos" />
            <KnowledgeColumn testId="prop-assumed" title="Hva antar vi?" sub="Anslag og antakelser analysen bygger på." items={knowledge.assumed} empty="Ingen antakelser registrert." tone="warn" />
            <KnowledgeColumn testId="prop-tocheck" title="Hva må sjekkes?" sub="Mangler eller er uavklart – sjekk på visning eller før bud." items={knowledge.toCheck} empty="Ingenting står som uavklart." tone="neg" />
          </div>
        </div>
        <p className="text-sm">
          <button type="button" onClick={onOpenRegister} className="inline-flex min-h-11 items-center font-medium text-pine-700 underline">
            Åpne risikoregisteret og sjekklisten (rediger)
          </button>
        </p>
      </div>
    </Section>
  );
}

export { jumpTo };
