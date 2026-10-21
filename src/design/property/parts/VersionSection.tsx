import clsx from 'clsx';
import { ArrowRightLeft, CircleHelp } from 'lucide-react';
import { useRef } from 'react';
import { FEASIBILITY_LABEL, UNCERTAINTY_LABEL, type FeasibilityStatus } from '../../../domain/enums';
import { formatNOK } from '../../../lib/format';
import { bedroomsText } from '../model/endProduct';
import { deltaLine, versionDelta, type VersionView } from '../model/versions';
import { signedNOK } from '../../shared/signed';
import type { Tone } from '../../shared/present';
import { Fig, Section, Tag, TONE_TEXT } from '../ui';

const FEAS_TONE: Record<FeasibilityStatus, Tone> = { klar: 'pos', betinget: 'warn', uavklart: 'neutral', ikke_gjennomforbar: 'neg' };
const mill = (n: number) => `${(n / 1_000_000).toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mill.`;

/**
 * Versjonsvelger: Basis, Alternativ A og Alternativ B som tre mulige versjoner av boligen. ARIA-tabs med piltaster. Å bytte versjon
 * endrer bare hva som vises (forhåndsvisning) – kalkylen din endres først når du velger «Bruk i kalkylen».
 */
function VersionTabs({ versions, viewId, onSelect }: { versions: VersionView[]; viewId: string; onSelect: (id: string) => void }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const base = versions[0];
  return (
    <div role="tablist" aria-label="Versjoner av boligen" className="grid grid-cols-[repeat(auto-fit,minmax(0,1fr))] gap-2 sm:gap-3" data-testid="prop-versions">
      {versions.map((v, i) => {
        const selected = v.id === viewId;
        const profit = v.b?.profit ?? null;
        return (
          <button
            key={v.id}
            ref={(el) => {
              refs.current[v.id] = el;
            }}
            id={`versjon-tab-${v.id}`}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls="versjon-panel"
            tabIndex={selected ? 0 : -1}
            data-testid="prop-version-tab"
            data-version-id={v.id}
            onClick={() => onSelect(v.id)}
            onKeyDown={(e) => {
              let n = -1;
              if (e.key === 'ArrowRight') n = (i + 1) % versions.length;
              if (e.key === 'ArrowLeft') n = (i - 1 + versions.length) % versions.length;
              if (e.key === 'Home') n = 0;
              if (e.key === 'End') n = versions.length - 1;
              if (n >= 0) {
                e.preventDefault();
                onSelect(versions[n].id);
                refs.current[versions[n].id]?.focus();
              }
            }}
            className={clsx(
              'flex min-h-11 min-w-0 flex-col items-start rounded-2xl border p-2.5 text-left transition-colors sm:p-4',
              selected ? 'border-[var(--prop-dark)] bg-[var(--prop-paper)] shadow-[0_0_0_1px_var(--prop-dark)]' : 'border-[var(--prop-line)] bg-[var(--prop-sand-2)] hover:border-[var(--prop-line-strong)] hover:bg-[var(--prop-paper)]',
            )}
          >
            <span className="flex w-full flex-wrap items-center gap-x-2 gap-y-1">
              <span className="prop-label !text-ink">{v.short}</span>
              {v.recommended && <Tag tone="pos" className="!px-1.5 !py-0 text-[10px] sm:text-xs">Anbefalt</Tag>}
              {v.active && (
                <span className="hidden sm:inline">
                  <Tag tone="info" className="!px-1.5 !py-0">I kalkylen</Tag>
                </span>
              )}
            </span>
            <span className="prop-serif mt-1 hidden text-[1.0625rem] leading-snug sm:line-clamp-2 sm:block">{v.def.title}</span>
            <span className="mt-1 text-xs text-slate-700 sm:mt-1.5 sm:text-sm">{v.def.saleSource === 'global' ? 'Ikke vurdert' : bedroomsText(v.def.endProduct.bedrooms)}</span>
            <span className="prop-fig mt-1 text-[0.9375rem] font-semibold sm:text-lg">{v.b ? mill(v.b.V) : 'Ikke beregnet'}</span>
            <span className="mt-0.5 block text-[11px] text-slate-600">Fortjeneste (kr)</span>
            <span className={clsx('prop-fig block text-xs font-semibold', profit === null ? '!font-normal text-slate-600' : TONE_TEXT[profit < 0 ? 'neg' : 'pos'])}>{profit === null ? 'Ufullstendig kalkyle' : signedNOK(profit).replace(/\s?kr$/, '')}</span>
            {v.id !== base.id && <span className="mt-0.5 hidden text-[11px] text-slate-600 sm:line-clamp-2 sm:block">{deltaLine(v, base)}</span>}
          </button>
        );
      })}
    </div>
  );
}

function Delta({ v, base }: { v: VersionView; base: VersionView }) {
  const d = versionDelta(v, base);
  if (v.id === base.id) {
    return <p className="rounded-xl bg-[var(--prop-sand-2)] px-4 py-3 text-sm text-slate-800">Basis er utgangspunktet. Alternativene sammenlignes mot denne med samme kjøpspris, finansiering og forutsetninger.</p>;
  }
  if (!d) {
    return <p className="rounded-xl border border-dashed border-[var(--prop-line-strong)] px-4 py-3 text-sm text-slate-800">Kan ikke sammenlignes med Basis: kalkylen for {v.b ? base.def.title : v.def.title} er ufullstendig. Ukjent er ikke 0 kr.</p>;
  }
  return (
    <div data-testid="prop-delta">
      <h3 className="prop-label">{v.short} mot Basis</h3>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
        {d.facts.map((f) => (
          <div key={f.id} className="min-w-0" data-testid={`prop-delta-${f.id}`}>
            <dt className="text-xs text-slate-600">{f.label}</dt>
            <dd className={clsx('prop-fig mt-0.5 text-sm leading-snug font-semibold whitespace-normal', TONE_TEXT[f.tone])}>{f.text}</dd>
          </div>
        ))}
      </dl>
      {d.raw.purchase && (
        <p className="mt-3 rounded-lg bg-[var(--prop-sand-2)] px-3 py-2 text-xs text-slate-800" data-testid="prop-delta-price-note">
          Ulik kjøpspris i kalkylene ({formatNOK(d.raw.purchase.alt)} mot {formatNOK(d.raw.purchase.base)}): en del av endringen skyldes prisen, ikke versjonen.
        </p>
      )}
    </div>
  );
}

export function VersionSection({
  versions,
  view,
  onSelect,
  onUse,
  canApply,
}: {
  versions: VersionView[];
  view: VersionView;
  onSelect: (id: string) => void;
  onUse: (id: string) => void;
  canApply: boolean;
}) {
  const base = versions.find((v) => v.def.kind === 'basis') ?? versions[0];
  const single = versions.length < 2;
  return (
    <Section
      id="versjoner"
      eyebrow="1 · Hva kan boligen bli?"
      title={single ? 'Boligen etter oppussing' : 'Tre mulige versjoner av boligen'}
      intro={
        single
          ? 'Denne analysen har ett scenario. Det er ikke sammenlignet med alternativer.'
          : 'Basis og inntil to alternativer, regnet ved samme kjøpspris og med dine forutsetninger. Velg en versjon for å se hva den betyr – tallene i sidestolpen følger med.'
      }
    >
      {!single && <VersionTabs versions={versions} viewId={view.id} onSelect={onSelect} />}
      <div id="versjon-panel" role={single ? undefined : 'tabpanel'} aria-labelledby={single ? undefined : `versjon-tab-${view.id}`} key={view.id} className="prop-swap mt-4 rounded-2xl border border-[var(--prop-line)] bg-[var(--prop-paper)] p-4 sm:p-6" data-testid="prop-version-panel">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <p className="prop-label">{view.label}</p>
            <h3 className="prop-serif text-[1.5rem] leading-tight sm:text-[1.875rem]" data-testid="prop-version-title">{view.def.title}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {view.recommended && <Tag tone="pos">Anbefalt</Tag>}
            <Tag tone={FEAS_TONE[view.def.feasibility]}>{FEASIBILITY_LABEL[view.def.feasibility]}</Tag>
            {view.def.saleSource === 'scenario' && <Tag>Usikkerhet: {UNCERTAINTY_LABEL[view.def.uncertainty.level].toLowerCase()}</Tag>}
            {view.active ? <Tag tone="info">I din kalkyle</Tag> : <Tag tone="warn">Forhåndsvisning</Tag>}
          </div>
        </div>
        {view.def.description && <p className="mt-2 max-w-3xl text-[0.9375rem] leading-relaxed text-slate-800">{view.def.description}</p>}
        {view.ranked && !view.ranked.eligible && (
          <p className="mt-2 flex items-start gap-1.5 text-sm text-[var(--prop-warn)]">
            <CircleHelp className="mt-0.5 size-4 shrink-0" aria-hidden /> Kan ikke anbefales før kravene er avklart. {view.def.feasibilityRationale}
          </p>
        )}
        {view.def.requirements.length > 0 && (
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-slate-800">
            {view.def.requirements.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
        {!single && (
          <div className="mt-5 border-t border-[var(--prop-line)] pt-4">
            <Delta v={view} base={base} />
          </div>
        )}
        {!view.active && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-[var(--prop-blue-bg)] p-3 text-sm text-ink" role="status">
            <p className="min-w-0 flex-1">
              Du ser på <strong>{view.short}</strong>. Kalkylen din bruker fortsatt <strong>{versions.find((v) => v.active)?.short ?? 'en annen versjon'}</strong> – ingenting er endret.
            </p>
            <button
              type="button"
              disabled={!canApply}
              onClick={() => onUse(view.id)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-[var(--prop-blue)] bg-white px-3 text-sm font-medium text-[var(--prop-blue)] hover:bg-[var(--prop-blue-bg)] disabled:opacity-50"
            >
              <ArrowRightLeft className="size-4" aria-hidden /> Bruk i kalkylen
            </button>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-600">
          Modellert og forventet – ikke garantert.{view.b ? <> Salgsverdi <Fig>{formatNOK(view.b.V)}</Fig>, fortjeneste <Fig>{formatNOK(view.b.profit)}</Fig> før skatt.</> : ' Kalkylen er ufullstendig, så ingen fortjeneste vises.'}
        </p>
      </div>
    </Section>
  );
}
