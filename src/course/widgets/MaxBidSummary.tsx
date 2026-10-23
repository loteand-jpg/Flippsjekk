import { MAX_BID_LIMIT_LABEL, SOLVER_TOLERANCE_KR, type Evaluation, type MaxBidResult } from '../../calc/engine';
import { formatNOK, formatNOKSigned } from '../../lib/format';

export function bidText(bid: MaxBidResult | null | undefined): string {
  if (!bid) return 'Ikke beregnet';
  if (bid.price === null) return 'Ingen gjennomførbar pris';
  return `${formatNOK(bid.price)}${bid.status === 'capped' ? ' (modellens søkegrense)' : ''}`;
}

/** Bruker standardmotorens separate grenser og anbefaling direkte. */
export function MaxBidSummary({ evaluation: ev, purchasePrice }: { evaluation: Evaluation; purchasePrice: number | null }) {
  const rec = ev.recommendedMaxBid;
  const hourlyReason = ev.resolved?.H === null
    ? 'Egne timer er uavklart. Timegrensen kan ikke beregnes og blokkerer ikke fortjenestemålet.'
    : ev.resolved?.H === 0
      ? 'Ingen egne timer. Timekravet gjelder ikke og blokkerer ikke fortjenestemålet.'
      : 'Timekravet er ikke satt. Fortjenestemålet kan fortsatt brukes.';
  const limiting = rec?.limits.find((l) => l.id === rec.limitedBy);
  return (
    <section className="space-y-3 rounded-xl border border-pine-300 bg-pine-50 p-4" aria-label="Maksbud i normalt salgsscenario" aria-live="polite">
      <h4 className="font-semibold">Modellert maksbud – normalt salg</h4>
      <p className="text-xs text-slate-700">Hver grense beregnes separat. Anbefalt maksbud er den laveste relevante grensen. Prosjektavkastningsmålet er informativt og inngår ikke. Toleranse {SOLVER_TOLERANCE_KR} kr. Ikke en budfullmakt eller garanti.</p>
      <dl className="num grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-lg bg-white p-2">
          <dt className="text-xs text-slate-600">Maksbud etter fortjenestemål</dt>
          <dd className="font-semibold" data-testid="course-profit-bid">{bidText(ev.maxBid)}</dd>
          {ev.maxBid && <dd className="text-xs">Mål: {formatNOK(ev.maxBid.target)} før skatt</dd>}
        </div>
        <div className="rounded-lg bg-white p-2">
          <dt className="text-xs text-slate-600">Maksbud etter timekrav</dt>
          <dd className="font-semibold" data-testid="course-hourly-bid">{bidText(ev.maxBidHourly)}</dd>
          {ev.maxBidHourly ? <dd className="text-xs">Mål: {formatNOK(ev.maxBidHourly.target)}/t · {ev.resolved?.H} egne timer</dd> : <dd className="text-xs">{hourlyReason}</dd>}
        </div>
        <div className="rounded-lg bg-white p-2 sm:col-span-2">
          <dt className="text-xs text-slate-600">Anbefalt modellert maksbud (kontant)</dt>
          <dd className="text-lg font-semibold" data-testid="course-recommended-bid">{bidText(limiting?.result)}</dd>
          <dd className="text-xs" data-testid="course-bid-limit">{rec?.limitedBy ? `Begrenses av: ${MAX_BID_LIMIT_LABEL[rec.limitedBy]}.` : 'Sett et fortjenestemål eller et timekrav med kjente egne timer.'}</dd>
          {rec?.limits.filter((l) => l.result.status === 'none').map((l) => <dd key={l.id} className="mt-1 text-sm font-medium text-red-800">{l.label} kan ikke oppfylles selv ved kjøpspris 0 kr.</dd>)}
          {rec?.price != null && purchasePrice !== null && <dd className="text-xs">Forskjell fra din kjøpspris: {formatNOKSigned(rec.price - purchasePrice)}.</dd>}
        </div>
      </dl>
      <p className="text-xs text-slate-700">Timekravet er ikke en ekstra kostnad. Et positivt prosjektresultat under timekravet er fortsatt positivt; et lavere kjøpsbud kan oppfylle kravet.</p>
    </section>
  );
}
