import { ArchiveRestore, ArrowLeft, ExternalLink, Star } from 'lucide-react';
import { Link } from 'react-router';
import { DemoBadge, PreliminaryBadge, RecommendationBadge, SaleStatusBadge } from '../../../components/property/badges';
import { Field, Select } from '../../../components/ui/forms';
import { Button } from '../../../components/ui/primitives';
import { PROPERTY_TYPE_LABEL, TENURE_LABEL, WORK_STATUS_LABEL, WORK_STATUSES, type WorkStatus } from '../../../domain/enums';
import { formatArea, formatDate, formatRelative } from '../../../lib/format';
import type { PropertyViewProps } from '../../../pages/PropertyPage';

/** Tydelig merket illustrasjon der annonsebilde og plantegning skal sitte (demoen leser ikke fra FINN). Ikke et ekte bilde. */
export function InvVisual({ className }: { className?: string }) {
  return (
    <figure className={className}>
      <div className="relative overflow-hidden rounded-xl border border-[var(--inv-line)] bg-gradient-to-br from-[#0f1a30] to-[#1a2a47]">
        <svg viewBox="0 0 320 150" role="img" aria-label="Illustrasjon av bolig og plantegning" className="block h-28 w-full sm:h-auto">
          <defs>
            <pattern id="inv-grid" width="16" height="16" patternUnits="userSpaceOnUse">
              <path d="M16 0H0V16" fill="none" stroke="rgb(148 163 184 / 0.14)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="320" height="150" fill="url(#inv-grid)" />
          {/* Bygning */}
          <path d="M28 108 V58 L84 28 L140 58 V108 Z" fill="#17294a" stroke="#22d3ee" strokeWidth="1.5" />
          {[0, 1].map((r) => [0, 1].map((c) => <rect key={`${r}${c}`} x={46 + c * 44} y={66 + r * 20} width="20" height="12" rx="1.5" fill="none" stroke="#67e8f9" strokeWidth="1.2" />))}
          <rect x="75" y="88" width="18" height="20" rx="1.5" fill="none" stroke="#67e8f9" strokeWidth="1.2" />
          {/* Plantegning */}
          <g stroke="#b4c1d3" strokeWidth="1.4" fill="none">
            <rect x="176" y="34" width="112" height="76" rx="2" />
            <path d="M176 70 H224 M224 34 V110 M224 80 H288 M256 80 V110" />
            <path d="M200 110 a10 10 0 0 1 10 -10" strokeWidth="1" />
          </g>
          <text x="232" y="128" textAnchor="middle" fontSize="9" fill="#b4c1d3">Plantegning</text>
          <text x="84" y="128" textAnchor="middle" fontSize="9" fill="#b4c1d3">Bilde</text>
        </svg>
      </div>
      <figcaption className="mt-1.5 text-[11px] leading-snug text-slate-600">Bilde og plantegning vises her når annonsen hentes fra FINN. Ikke koblet i demoen.</figcaption>
    </figure>
  );
}

/** Tittelblokk: tilbakelenke, adresse, boligfakta og merker. Sekundær i hierarkiet – investeringscaset kommer rett etter. */
export function CaseTitle({ p, className }: { p: PropertyViewProps; className?: string }) {
  const { it, analysis, state, actions, ctx } = p;
  const snap = it.snapshot;
  return (
    <div className={className}>
      <Link to="/oversikt" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-pine-700 hover:underline md:min-h-8">
        <ArrowLeft className="size-4" aria-hidden /> Pipeline
      </Link>
      <div className="flex items-start gap-2">
        <h1 className="min-w-0 text-[1.5rem] leading-tight font-bold tracking-tight break-words sm:text-[1.875rem]">{it.link.label ?? it.property.address}</h1>
        <button
          type="button"
          aria-pressed={it.link.favorite}
          aria-label={it.link.favorite ? 'Fjern som favoritt' : 'Marker som favoritt'}
          onClick={() => void actions.toggleFavorite()}
          className="flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-slate-200/60 md:size-10"
        >
          <Star className={`size-5 ${it.link.favorite ? 'fill-amber-400 text-amber-500' : 'text-slate-400'}`} aria-hidden />
        </button>
      </div>
      <p className="text-sm text-slate-700">
        {[it.property.district, it.property.city].filter(Boolean).join(', ')} · {PROPERTY_TYPE_LABEL[it.property.propertyType]} · {TENURE_LABEL[it.property.tenure]} · {formatArea(snap?.areaBRAi ?? null)}
        {snap?.bedrooms != null ? ` · ${snap.bedrooms} soverom` : ''}
        {snap?.buildYear != null ? ` · byggeår ${snap.buildYear}` : ''}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <RecommendationBadge value={analysis.recommendation} />
        <PreliminaryBadge reasons={state.prelim} />
        <SaleStatusBadge value={snap?.saleStatus ?? null} note={snap?.saleStatusNote} />
        {(it.property.dataOrigin === 'demo' || it.property.dataOrigin === 'synthetic') && <DemoBadge synthetic={it.property.dataOrigin === 'synthetic'} />}
        <a href={it.property.canonicalUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-pine-700 underline md:min-h-8">
          FINN-kode {it.property.finnId} <ExternalLink className="size-3" aria-hidden />
        </a>
      </div>
      <p className="text-xs text-slate-600">
        {analysis.visibility === 'private' ? 'Privat importert utkast' : 'Analyse'} fra {formatDate(state.analysisDate)} · annonse kontrollert {snap ? formatRelative(snap.observedAt, ctx.now) : 'aldri'}
      </p>
    </div>
  );
}

/** Min status og arkivering. */
export function CaseControls({ p, className }: { p: PropertyViewProps; className?: string }) {
  const { it, actions } = p;
  return (
    <div className={className}>
      <div className="flex flex-wrap items-end gap-2">
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
  );
}
