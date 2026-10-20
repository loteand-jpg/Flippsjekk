import { ArchiveRestore, ArrowLeft, ExternalLink, Star } from 'lucide-react';
import { Link } from 'react-router';
import { DemoBadge, PreliminaryBadge, RecommendationBadge, SaleStatusBadge } from '../../../components/property/badges';
import { Field, Select } from '../../../components/ui/forms';
import { Button } from '../../../components/ui/primitives';
import { PROPERTY_TYPE_LABEL, TENURE_LABEL, WORK_STATUS_LABEL, WORK_STATUSES, type WorkStatus } from '../../../domain/enums';
import { formatArea, formatDate, formatRelative } from '../../../lib/format';
import type { PropertyViewProps } from '../../../pages/PropertyPage';

/** Illustrasjon av en bolig. Brukes der annonsebilde og plantegning ennå ikke er hentet (demoen leser ikke fra FINN). */
export function PropertyVisual({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <figure className={className}>
      <div className="relative overflow-hidden rounded-lg border border-[var(--fin-line)] bg-gradient-to-b from-[var(--fin-info-bg)] to-white">
        <svg
          viewBox="0 0 320 168"
          role="img"
          aria-label="Illustrasjon av bolig"
          className={compact ? 'block h-28 w-full' : 'block h-auto w-full'}
        >
          <rect x="0" y="136" width="320" height="32" fill="#e5e2db" />
          <rect x="62" y="38" width="196" height="100" rx="3" fill="#ffffff" stroke="#b9c6d4" strokeWidth="1.5" />
          <path d="M52 40 L160 10 L268 40 Z" fill="#1c3650" />
          {[0, 1, 2].map((c) =>
            [0, 1].map((r) => <rect key={`${c}${r}`} x={82 + c * 62} y={54 + r * 40} width="30" height="26" rx="2" fill="#e0e8f0" stroke="#94adc6" strokeWidth="1.2" />),
          )}
          <rect x="143" y="102" width="34" height="36" rx="2" fill="#254562" />
          <circle cx="170" cy="121" r="1.8" fill="#e0e8f0" />
        </svg>
      </div>
      <figcaption className="mt-1.5 text-[11px] leading-snug text-slate-500">Bilde og plantegning vises her når annonsen hentes fra FINN. Ikke koblet i demoen.</figcaption>
    </figure>
  );
}

export function PropertyHeader({ p }: { p: PropertyViewProps }) {
  const { it, analysis, state, actions, ctx } = p;
  const snap = it.snapshot;
  return (
    <header className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
      <div className="min-w-0">
        <Link to="/oversikt" className="inline-flex min-h-11 md:min-h-8 items-center gap-1 text-sm text-pine-800 hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> Alle objekter
        </Link>
        <div className="mt-2 flex items-start gap-2">
          <h1 className="min-w-0 text-[1.75rem] leading-tight font-semibold tracking-tight break-words sm:text-4xl">{it.link.label ?? it.property.address}</h1>
          <button
            type="button"
            aria-pressed={it.link.favorite}
            aria-label={it.link.favorite ? 'Fjern som favoritt' : 'Marker som favoritt'}
            onClick={() => void actions.toggleFavorite()}
            className="mt-1 flex size-10 shrink-0 items-center justify-center rounded-lg hover:bg-slate-100"
          >
            <Star className={`size-5 ${it.link.favorite ? 'fill-amber-400 text-amber-500' : 'text-slate-400'}`} aria-hidden />
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-700">
          {[it.property.district, it.property.city].filter(Boolean).join(', ')} · {PROPERTY_TYPE_LABEL[it.property.propertyType]} · {TENURE_LABEL[it.property.tenure]} · {formatArea(snap?.areaBRAi ?? null)}
          {snap?.bedrooms != null ? ` · ${snap.bedrooms} soverom` : ''}
          {snap?.buildYear != null ? ` · byggeår ${snap.buildYear}` : ''}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <RecommendationBadge value={analysis.recommendation} />
          <PreliminaryBadge reasons={state.prelim} />
          <SaleStatusBadge value={snap?.saleStatus ?? null} note={snap?.saleStatusNote} />
          {(it.property.dataOrigin === 'demo' || it.property.dataOrigin === 'synthetic') && <DemoBadge synthetic={it.property.dataOrigin === 'synthetic'} />}
          <a href={it.property.canonicalUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 md:min-h-8 items-center gap-1 text-xs text-pine-800 underline">
            FINN-kode {it.property.finnId} <ExternalLink className="size-3" aria-hidden />
          </a>
        </div>
        <p className="mt-2 text-xs text-slate-600">
          {analysis.visibility === 'private' ? 'Privat importert utkast' : 'Analyse'} fra {formatDate(state.analysisDate)} · annonse kontrollert {snap ? formatRelative(snap.observedAt, ctx.now) : 'aldri'}
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <Field label="Min status" className="w-full sm:w-52">
            {(f) => (
              <Select {...f} value={it.link.workStatus} onChange={(e) => void actions.setWorkStatus(e.target.value as WorkStatus)}>
                {WORK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {WORK_STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {it.link.archivedAt ? (
            <Button icon={<ArchiveRestore className="size-4" aria-hidden />} onClick={() => void actions.setArchived(false)}>
              Gjenopprett
            </Button>
          ) : (
            <Button onClick={() => void actions.setArchived(true)}>Fjern fra min liste</Button>
          )}
        </div>
      </div>
      <PropertyVisual className="hidden lg:block" />
      <PropertyVisual compact className="lg:hidden" />
    </header>
  );
}
