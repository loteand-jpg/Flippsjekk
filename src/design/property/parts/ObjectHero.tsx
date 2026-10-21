import { ArchiveRestore, ArrowLeft, ArrowRight, ExternalLink, Ruler, Star, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router';
import type { SaleDebtStatus } from '../../../components/analysis/saleDebtStatus';
import { DemoBadge, PreliminaryBadge, RecommendationBadge, SaleStatusBadge } from '../../../components/property/badges';
import { Field, Select } from '../../../components/ui/forms';
import { Button } from '../../../components/ui/primitives';
import type { RiskAggregate } from '../../../domain/assessment';
import { RISK_BAND_LABEL } from '../../../domain/assessment';
import { PROPERTY_TYPE_LABEL, TENURE_LABEL, WORK_STATUS_LABEL, WORK_STATUSES, type WorkStatus } from '../../../domain/enums';
import { formatArea, formatDate, formatNOK, formatPct, formatRelative } from '../../../lib/format';
import type { PropertyViewProps } from '../../../pages/PropertyPage';
import { CountUp } from '../../shared/CountUp';
import { bidMargin, maxBidLine, profitTone } from '../../shared/present';
import { HeroMedia } from '../media/Media';
import type { ListingMedia } from '../media/types';
import { bedroomsText } from '../model/endProduct';
import type { VersionView } from '../model/versions';
import { Tag, KpiDark } from '../ui';
import { PropDebtStatus } from './PropDebtStatus';
import { jumpTo } from './jump';

/** Boligen: adresse, fakta, merker og sammendrag. Står først – før tall. */
function HouseHeader({ p }: { p: PropertyViewProps }) {
  const { it, analysis, state, actions, ctx } = p;
  const snap = it.snapshot;
  const facts = [
    { k: 'Bruksareal', v: snap?.areaBRAi != null ? formatArea(snap.areaBRAi) : null },
    { k: 'Soverom', v: snap?.bedrooms != null ? String(snap.bedrooms) : null },
    { k: 'Rom', v: snap?.rooms != null ? String(snap.rooms) : null },
    { k: 'Byggeår', v: snap?.buildYear != null ? String(snap.buildYear) : null },
  ].filter((f): f is { k: string; v: string } => f.v !== null);
  return (
    <div className="min-w-0">
      <Link to="/oversikt" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-pine-700 hover:underline md:min-h-8">
        <ArrowLeft className="size-4" aria-hidden /> Alle boliger
      </Link>
      <p className="prop-label mt-1">
        {[it.property.district, it.property.city].filter(Boolean).join(', ')} · {PROPERTY_TYPE_LABEL[it.property.propertyType]} · {TENURE_LABEL[it.property.tenure]}
      </p>
      <div className="flex items-start gap-2">
        <h1 className="prop-serif min-w-0 text-[2rem] leading-[1.08] break-words text-balance sm:text-[2.75rem] lg:text-[3.25rem]" data-testid="prop-title">
          {it.link.label ?? it.property.address}
        </h1>
        <button
          type="button"
          aria-pressed={it.link.favorite}
          aria-label={it.link.favorite ? 'Fjern som favoritt' : 'Marker som favoritt'}
          onClick={() => void actions.toggleFavorite()}
          className="mt-1 flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-[var(--prop-sand)]"
        >
          <Star className={`size-5 ${it.link.favorite ? 'fill-amber-400 text-amber-500' : 'text-slate-500'}`} aria-hidden />
        </button>
      </div>
      {facts.length > 0 && (
        <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm" data-testid="prop-facts">
          {facts.map((f) => (
            <div key={f.k} className="flex items-baseline gap-1.5">
              <dt className="text-slate-600">{f.k}</dt>
              <dd className="prop-fig font-semibold">{f.v}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <RecommendationBadge value={analysis.recommendation} />
        <PreliminaryBadge reasons={state.prelim} />
        <SaleStatusBadge value={snap?.saleStatus ?? null} note={snap?.saleStatusNote} />
        {(it.property.dataOrigin === 'demo' || it.property.dataOrigin === 'synthetic') && <DemoBadge synthetic={it.property.dataOrigin === 'synthetic'} />}
        <a href={it.property.canonicalUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-pine-700 underline md:min-h-8">
          FINN-kode {it.property.finnId} <ExternalLink className="size-3" aria-hidden />
        </a>
      </div>
      {analysis.summary.trim() && <p className="mt-2 max-w-2xl text-[0.9375rem] leading-relaxed text-slate-800 line-clamp-3 sm:line-clamp-none" data-testid="prop-summary-text">{analysis.summary}</p>}
      <p className="mt-1.5 text-xs text-slate-600">
        {analysis.visibility === 'private' ? 'Privat importert utkast' : 'Analyse'} fra {formatDate(state.analysisDate)} · annonse kontrollert {snap ? formatRelative(snap.observedAt, ctx.now) : 'aldri'}
      </p>
    </div>
  );
}

/** Min status og arkivering. */
function Controls({ p }: { p: PropertyViewProps }) {
  const { it, actions } = p;
  return (
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
  );
}

/**
 * Muligheten: den anbefalte versjonen av boligen med salgsverdi, fortjeneste, maksbud og risiko. Tallene følger versjonen som vises
 * (som standard kalkylen din), og alle er motorens. Maksbudet avrundes ned til hele tusen.
 */
function Opportunity({
  p,
  view,
  recommended,
  debtStatus,
  risk,
  onShow,
}: {
  p: PropertyViewProps;
  view: VersionView;
  recommended: VersionView | null;
  debtStatus: SaleDebtStatus[];
  risk: RiskAggregate;
  onShow: (id: string) => void;
}) {
  const { ctx } = p;
  const b = view.b;
  const floorBid = view.bidFloor;
  const margin = floorBid !== null && b ? bidMargin(floorBid, b.P) : null;
  const e = view.def.endProduct;
  return (
    <section aria-labelledby="muligheten" className="prop-dark overflow-hidden rounded-3xl shadow-[0_24px_50px_-30px_rgba(43,38,34,0.85)]" data-testid="prop-opportunity">
      <PropDebtStatus statuses={debtStatus} dark />
      <div className="p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h2 id="muligheten" className="prop-label">
            Muligheten
          </h2>
          <p className="flex flex-wrap items-center gap-1.5 text-xs">
            {view.recommended ? <Tag dark tone="pos">Anbefalt versjon</Tag> : recommended ? <Tag dark tone="warn">Anbefalt: {recommended.short}</Tag> : <Tag dark>Ingen versjon kan anbefales ennå</Tag>}
            {view.active ? <Tag dark tone="info">I din kalkyle</Tag> : <Tag dark tone="warn">Forhåndsvisning</Tag>}
          </p>
        </div>
        <p className="prop-serif mt-2 text-[1.5rem] leading-tight sm:text-[1.875rem]" data-testid="prop-hero-version">
          {view.def.title}
        </p>
        <p className="prop-muted-d mt-0.5 text-sm">{view.label} · {view.def.saleSource === 'global' ? 'sluttprodukt ikke vurdert' : bedroomsText(e.bedrooms).toLowerCase()}</p>

        {b ? (
          <>
            <div className="mt-5">
              <p className="prop-label">Anbefalt maksbud</p>
              {view.bidStatus === 'none' ? (
                <p className="mt-1 text-2xl leading-tight font-semibold text-[var(--prop-neg-d)]" data-testid="prop-hero-maxbid">
                  Ingen gjennomførbar pris
                </p>
              ) : floorBid !== null ? (
                <p className="mt-1 leading-none" style={{ fontSize: 'clamp(2.25rem, 9vw, 3.5rem)' }}>
                  <CountUp value={floorBid} format={formatNOK} className="prop-fig prop-serif" testId="prop-hero-maxbid" flashClass="prop-flash" />
                </p>
              ) : (
                <p className="mt-1 text-xl font-semibold text-[var(--prop-on-dark-muted)]" data-testid="prop-hero-maxbid">
                  Ikke beregnet
                </p>
              )}
              <p className="prop-muted-d mt-1.5 text-sm">
                {view.bidStatus === 'none'
                  ? `Ingen kjøpspris oppfyller ${view.bidLimitedBy === 'hourly' ? 'timekravet ditt' : 'fortjenestemålet ditt'}.`
                  : floorBid !== null
                    ? maxBidLine({ limitedBy: view.bidLimitedBy, profitTarget: ctx.draft.profitTarget, minPerHour: ctx.draft.minProfitPerOwnHour })
                    : 'Maksbud beregnes når kalkylen er komplett. Ukjente verdier er ikke satt til 0 kr.'}
              </p>
              {margin && (
                <p className="mt-2 text-sm">
                  <Tag dark tone={margin.kind === 'over' ? 'warn' : 'pos'}>{margin.kind === 'over' ? 'Over maksbud' : margin.kind === 'under' ? 'Under maksbud' : 'På maksbud'}</Tag> <span className="prop-muted-d">{margin.text}</span>
                </p>
              )}
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-white/10 pt-5">
              <KpiDark label="Forventet salgsverdi" value={formatNOK(b.V)} sub={b.basis === 'total' ? 'Totalpris · modellert' : 'Kontantpris · modellert'} />
              <KpiDark label="Forventet fortjeneste" tone={profitTone(b.profit)} value={formatNOK(b.profit)} sub="Før skatt" />
              <KpiDark
                label="Risiko"
                value={risk.score === null ? 'Uavklart' : `${RISK_BAND_LABEL[risk.band]} ${risk.score}/10`}
                unknown={risk.score === null}
                tone={risk.band === 'hoy' ? 'neg' : risk.band === 'middels' ? 'warn' : 'neutral'}
                sub={risk.top ? `Størst: ${risk.top.title}` : 'Ingen registrerte risikoer'}
              />
              <KpiDark label="Prosjektavkastning" value={b.projectReturn === null ? 'Ikke beregnet' : formatPct(b.projectReturn)} unknown={b.projectReturn === null} sub="Fortjeneste ÷ kapital" />
            </dl>
          </>
        ) : (
          <div className="mt-4 rounded-xl border border-[#e5bd6a]/40 bg-[#e5bd6a]/10 p-4 text-sm text-[var(--prop-warn-d)]" role="status">
            <p className="flex items-center gap-2 font-semibold">
              <TriangleAlert className="size-4" aria-hidden /> {view.ev.status === 'invalid' ? 'Kalkylen har ugyldige verdier' : 'Kalkylen er ufullstendig – ingen fortjeneste vises'}
            </p>
            <ul className="mt-1.5 list-disc pl-5">
              {(view.ev.status === 'invalid' ? view.ev.errors.map((x) => x.message) : view.ev.missing.map((m) => m.label)).map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs">Ukjent er ikke det samme som 0 kr. Fyll inn de manglende verdiene under «Kalkyle».</p>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={() => jumpTo('fra-til')} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/30 px-3.5 text-sm font-medium hover:bg-white/10">
            <Ruler className="size-4" aria-hidden /> Plantegning
          </button>
          <button type="button" onClick={() => (recommended && !view.recommended ? onShow(recommended.id) : jumpTo('versjoner'))} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/30 px-3.5 text-sm font-medium hover:bg-white/10">
            {recommended && !view.recommended ? `Se anbefalt versjon (${recommended.short})` : 'Se versjonene'} <ArrowRight className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </section>
  );
}

/**
 * Første skjermbilde på objektsiden: boligen (adresse, fakta, bilde/plassholder, tilgang til plantegning) og muligheten (anbefalt versjon,
 * salgsverdi, fortjeneste, maksbud, risiko). På mobil står boligen kompakt øverst og muligheten rett under, så maksbud og fortjeneste vises uten mye rulling.
 */
export function ObjectHero(props: { p: PropertyViewProps; view: VersionView; recommended: VersionView | null; media: ListingMedia; debtStatus: SaleDebtStatus[]; risk: RiskAggregate; onShow: (id: string) => void }) {
  const { p, media } = props;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-x-8">
      <div className="min-w-0 space-y-4">
        <HouseHeader p={p} />
        <HeroMedia media={media} address={p.it.link.label ?? p.it.property.address} placeholderClassName="h-28 sm:h-56 lg:h-64" />
        <div className="hidden sm:block">
          <Controls p={p} />
        </div>
      </div>
      <div className="min-w-0 space-y-4">
        <Opportunity p={p} view={props.view} recommended={props.recommended} debtStatus={props.debtStatus} risk={props.risk} onShow={props.onShow} />
        <div className="sm:hidden">
          <Controls p={p} />
        </div>
      </div>
    </div>
  );
}
