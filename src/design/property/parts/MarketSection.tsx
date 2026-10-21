import clsx from 'clsx';
import { Check, CircleDashed, Megaphone } from 'lucide-react';
import { QUALITY_TIER_LABEL, type MarketComparable, type QualityTier, type WeightedReference } from '../../../calc/market';
import { SALE_SOURCE_LABEL } from '../../../calc/saleValue';
import { LAYOUT_MATCH_LABEL, LOCATION_LEVEL_LABEL, STANDARD_CLASS_LABEL } from '../../../domain/enums';
import { formatDateKey, formatNOK } from '../../../lib/format';
import type { Tone } from '../../shared/present';
import type { MarketFacts } from '../../shared/useMarketFacts';
import type { VersionView } from '../model/versions';
import { Fig, Section, Tag } from '../ui';

const TIER_TONE = (t: QualityTier): Tone => (t === 'svaert_godt' ? 'pos' : t === 'normalt' ? 'info' : t === 'svakt' ? 'warn' : 'neg');

function MatchBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-2" role="img" aria-label={`Match ${Math.round(pct)} av 100`}>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--prop-sand)]" aria-hidden>
        <div className="h-full rounded-full bg-pine-600" style={{ width: `${pct}%` }} />
      </div>
      <span className="prop-fig text-xs font-semibold">{Math.round(pct)}/100</span>
    </div>
  );
}

/**
 * Referanse som boligkort: adresse, solgt eller aktiv, størrelse, soverom, standard, pris, kr/m², match og hvorfor den er relevant.
 * Ingen bilder: datakilden leverer ingen for referanser heller. Aktive annonser er tydelig merket og er aldri oppnådd salgspris.
 */
function RefCard({ r, c, own, size }: { r: WeightedReference; c: MarketComparable | undefined; own: boolean; size: 'lg' | 'sm' }) {
  const active = r.role === 'markedsreferanse';
  const sold = r.kind === 'solgt';
  const price = sold ? (c?.soldPrice ?? c?.soldTotalPrice ?? null) : (c?.askingPrice ?? null);
  const perM2 = active ? r.askingPerM2 : r.adjustedTotalPerM2;
  const Icon = sold ? Check : r.kind === 'prisantydning' ? Megaphone : CircleDashed;
  const label = sold ? 'Solgt' : r.kind === 'prisantydning' ? 'Aktiv annonse – ikke oppnådd salgspris' : 'Solgt uten dokumentert sum';
  return (
    <li className={clsx('min-w-0 rounded-2xl border bg-[var(--prop-paper)] p-4', active ? 'border-dashed border-[var(--prop-line-strong)]' : 'border-[var(--prop-line)]', size === 'lg' && 'sm:p-5')} data-testid="prop-ref" data-role={r.role}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0">
          <h4 className={clsx('prop-serif leading-snug break-words', size === 'lg' ? 'text-[1.25rem]' : 'text-[1.0625rem]')}>
            {r.name}
            {own && <span className="ml-2 font-sans text-[11px] font-medium text-[var(--prop-blue)]">din egen</span>}
          </h4>
          <p className="mt-1 flex flex-wrap items-center gap-1">
            <Tag tone={sold ? 'pos' : r.kind === 'prisantydning' ? 'warn' : 'neutral'}>
              <Icon className="size-3" aria-hidden /> {label}
            </Tag>
            {!active && r.usedInAnchor && <Tag tone="info">Brukt i prisankeret</Tag>}
            {r.priceReduced && <Tag tone="warn">Prisnedsatt</Tag>}
            {r.daysListed !== null && r.daysListed >= 90 && <Tag tone="warn">{r.daysListed} dager ute</Tag>}
          </p>
        </div>
        <div className="text-right">
          <p className="prop-label">Match</p>
          <MatchBar value={r.physical.total} />
        </div>
      </div>
      <dl className={clsx('mt-3 grid gap-x-4 gap-y-2.5 border-t border-[var(--prop-line)] pt-3 text-[13px]', size === 'lg' ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2')}>
        <div className="min-w-0">
          <dt className="prop-label">{sold ? 'Solgt for' : 'Prisantydning'}</dt>
          <dd className="mt-0.5">{price === null ? <span className="text-slate-600">Ikke dokumentert</span> : <Fig className="font-semibold">{formatNOK(price)}</Fig>}<span className="block text-[11px] text-slate-600">{c?.date ? formatDateKey(c.date) : 'Dato ukjent'}</span></dd>
        </div>
        <div className="min-w-0">
          <dt className="prop-label">Pris per m²</dt>
          <dd className="mt-0.5">{perM2 === null ? <span className="text-slate-600">Ikke brukbar</span> : <Fig className="font-semibold">{formatNOK(perM2)}</Fig>}<span className="block text-[11px] text-slate-600">{active ? 'Signal, aldri oppnådd pris' : r.marketAdjusted ? 'Totalpris, markedsjustert' : 'Totalpris, ikke markedsjustert'}</span></dd>
        </div>
        <div className="min-w-0">
          <dt className="prop-label">Størrelse</dt>
          <dd className="mt-0.5">{c?.area ? `${Math.round(c.area)} m²` : 'Areal ukjent'}<span className="block text-[11px] text-slate-600">{c?.bedrooms == null ? 'soverom ukjent' : `${c.bedrooms} soverom`}</span></dd>
        </div>
        <div className="min-w-0">
          <dt className="prop-label">Standard</dt>
          <dd className="mt-0.5 break-words">{c?.standardClass ? STANDARD_CLASS_LABEL[c.standardClass] : 'Ukjent'}{r.standardGap === 0 ? <span className="block text-[11px] text-slate-600">lik som sluttproduktet</span> : r.standardGap !== null ? <span className="block text-[11px] text-slate-600">{r.standardGap} trinn fra sluttproduktet</span> : null}</dd>
        </div>
        <div className="min-w-0">
          <dt className="prop-label">Beliggenhet</dt>
          <dd className="mt-0.5">{c?.locationLevel ? LOCATION_LEVEL_LABEL[c.locationLevel] : 'Ukjent'}{c?.layoutMatch ? <span className="block text-[11px] text-slate-600">planløsning {LAYOUT_MATCH_LABEL[c.layoutMatch].toLowerCase()}</span> : null}</dd>
        </div>
      </dl>
      <details className="mt-1">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-xs font-medium text-pine-700 underline decoration-dotted underline-offset-2 md:min-h-8">Hvorfor er denne relevant? ({r.strength === 'sterk' ? 'sterk' : r.strength === 'middels' ? 'middels sterk' : 'svak'} referanse)</summary>
        <ul className="list-disc space-y-0.5 pb-1 pl-5 text-xs text-slate-800">
          {r.reasons.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </details>
    </li>
  );
}

function Group({ title, sub, refs, byId, ownIds, empty, size, limit }: { title: string; sub: string; refs: WeightedReference[]; byId: Map<string, MarketComparable>; ownIds: Set<string>; empty: string; size: 'lg' | 'sm'; limit?: number }) {
  const shown = limit === undefined ? refs : refs.slice(0, limit);
  const rest = limit === undefined ? [] : refs.slice(limit);
  const cols = clsx('grid grid-cols-[minmax(0,1fr)] gap-3', size === 'lg' ? 'md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3');
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="prop-serif text-[1.25rem]">
          {title} <span className="prop-fig font-sans text-base font-normal text-slate-600">({refs.length})</span>
        </h3>
        <p className="text-xs text-slate-700">{sub}</p>
      </div>
      {refs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--prop-line-strong)] px-3 py-3 text-sm text-slate-700">{empty}</p>
      ) : (
        <>
          <ul className={cols}>
            {shown.map((r) => (
              <RefCard key={r.id} r={r} c={byId.get(r.id)} own={ownIds.has(r.id)} size={size} />
            ))}
          </ul>
          {rest.length > 0 && (
            <details className="mt-3" data-testid="prop-ref-more">
              <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-pine-700 underline">Vis {rest.length} til</summary>
              <ul className={clsx(cols, 'mt-1')}>
                {rest.map((r) => (
                  <RefCard key={r.id} r={r} c={byId.get(r.id)} own={ownIds.has(r.id)} size={size} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

/**
 * «Hva er sammenlignbare boliger solgt for?»: markedsgrunnlaget som boligsammenligning. Primærreferanser får mest plass; aktive annonser er
 * tydelig merket «ikke oppnådd salgspris». Salgsverdien er fastsatt av markedsmotoren (delt kode) ut fra versjonens sluttprodukt.
 */
export function MarketSection({ view, facts }: { view: VersionView; facts: MarketFacts }) {
  const { res, est, comps, byId } = facts;
  const E = est?.estimate ?? null;
  const primary = est ? est.references.filter((r) => r.role === 'primaer') : [];
  const secondary = est ? est.references.filter((r) => r.role === 'sekundaer') : [];
  const active = est ? est.references.filter((r) => r.role === 'markedsreferanse') : [];
  const anchor = est?.anchor.weightedMedianPerM2 ?? null;
  return (
    <Section id="marked" eyebrow="5 · Hva er lignende boliger solgt for?" title="Markedet rundt boligen" intro={`Salgsverdien for ${view.short === 'Basis' ? 'Basis' : view.short} er fastsatt av koden ut fra sammenlignbare salg – ikke av agenten. Aktive annonser er aldri oppnådd pris.`}>
      {E && est ? (
        <div className="mb-5 grid grid-cols-2 gap-x-6 gap-y-4 rounded-2xl border border-[var(--prop-line)] bg-[var(--prop-paper)] p-4 sm:grid-cols-4 sm:p-5" data-testid="prop-market-summary">
          <div className="min-w-0">
            <p className="prop-label">Normalverdi etter oppussing</p>
            <p className="prop-serif prop-fig mt-0.5 text-[1.5rem] leading-tight" data-testid="prop-market-base">{formatNOK(E.base)}</p>
            <p className="mt-0.5 text-xs text-slate-700">{E.basis === 'total' ? 'Totalpris inkl. fellesgjeld' : 'Kontantpris'} · ±{(est.halfWidthPct ?? 0).toLocaleString('nb-NO')} %</p>
          </div>
          <div className="min-w-0">
            <p className="prop-label">Sikkerhet</p>
            <p className="mt-1"><Tag tone={TIER_TONE(est.quality.tier)}>{QUALITY_TIER_LABEL[est.quality.tier]} · {est.quality.score}/100</Tag></p>
            <p className="mt-1 text-xs text-slate-700">{est.quality.goodSales} gode salg · {SALE_SOURCE_LABEL[res.source].toLowerCase()}</p>
          </div>
          <div className="min-w-0">
            <p className="prop-label">Prisanker</p>
            <p className="prop-fig mt-0.5 text-base font-semibold">{anchor === null ? 'Ikke beregnet' : `${formatNOK(anchor)}/m²`}</p>
            <p className="mt-0.5 text-xs text-slate-700">Vektet median av {est.anchor.used} referanser</p>
          </div>
          <div className="min-w-0">
            <p className="prop-label">Konkurranse</p>
            <p className="mt-0.5 text-base font-semibold">{est.activeSignals.count} {est.activeSignals.count === 1 ? 'aktiv annonse' : 'aktive annonser'}</p>
            <p className="mt-0.5 text-xs text-slate-700">{est.activeSignals.relevant} svært relevant{est.activeSignals.relevant === 1 ? '' : 'e'}{est.activeSignals.competingBelowAnchor ? ' · noen under ankeret' : ''}</p>
          </div>
        </div>
      ) : (
        <div className="mb-5 rounded-2xl border border-[var(--prop-warn)]/30 bg-[var(--prop-warn-bg)] p-4 text-sm text-[var(--prop-warn)]" role="status" data-testid="prop-market-unsure">
          <p className="font-semibold">For usikkert grunnlag – ingen salgsverdi foreslås fra markedet</p>
          <p className="mt-1">{est?.reason ?? 'Markedsmotoren har ikke nok grunnlag.'}</p>
          <p className="mt-1 text-xs">{res.source === 'ingen' ? 'Ingen salgsverdi er tilgjengelig for denne versjonen.' : `Salgsverdien i kalkylen bygger på: ${SALE_SOURCE_LABEL[res.source].toLowerCase()}.`} Legg inn flere dokumenterte salg i detaljene for å styrke grunnlaget.</p>
        </div>
      )}
      {est ? (
        <div className="space-y-7">
          <Group title="Primærreferanser" sub="Hovedgrunnlaget: faktisk solgt, lik standard og størrelse." refs={primary} byId={byId} ownIds={comps.ownIds} empty="Ingen referanser oppfyller kravene til primærreferanse for dette sluttproduktet." size="lg" />
          <Group title="Sekundærreferanser" sub="Støtter vurderingen, men avviker. Lavere vekt." refs={secondary} byId={byId} ownIds={comps.ownIds} empty="Ingen sekundærreferanser." size="sm" limit={3} />
          <Group title="Aktive annonser" sub="Annonsert nå – ikke solgt. Aldri oppnådd salgspris." refs={active} byId={byId} ownIds={comps.ownIds} empty="Ingen aktive annonser i grunnlaget." size="sm" limit={3} />
        </div>
      ) : (
        <p className="text-sm text-slate-700">Ingen markedsreferanser å vise for denne versjonen.</p>
      )}
    </Section>
  );
}
