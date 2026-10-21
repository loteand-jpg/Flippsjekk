import { QUALITY_TIER_LABEL } from '../../../calc/market';
import type { SaleResolution } from '../../../calc/saleValue';
import { UNCERTAINTY_LABEL } from '../../../domain/enums';
import { formatNOK } from '../../../lib/format';
import type { MarketFacts } from '../../shared/useMarketFacts';
import { endProductView } from '../model/endProduct';
import type { VersionView } from '../model/versions';
import { Fig, Section } from '../ui';

/** Spennet fra lavt til høyt med normalverdien markert. Tallene står alltid som tekst ved siden av. */
function RangeBar({ low, base, high }: { low: number; base: number; high: number }) {
  const span = high - low || 1;
  const at = (n: number) => `${Math.max(0, Math.min(100, ((n - low) / span) * 100))}%`;
  return (
    <div className="relative mt-2 h-3 rounded-full bg-[var(--prop-sand)]" role="img" aria-label={`Spenn fra ${formatNOK(low)} til ${formatNOK(high)}, normalt ${formatNOK(base)}`}>
      <span className="absolute inset-y-0 rounded-full bg-pine-300" style={{ left: 0, right: 0 }} />
      <span className="absolute -top-1 bottom-[-4px] w-1 rounded bg-[var(--prop-dark)]" style={{ left: `calc(${at(base)} - 2px)` }} />
    </div>
  );
}

/**
 * «Slik kan den selges»: sluttproduktet som salgsobjekt – standard, rom, kvaliteter, markedsgrunnlag og et modellert spenn for salgsverdien.
 * Ordene er «modellert», «forventet» og «anslått»: ingenting her er en garanti. Målgruppe finnes ikke i datamodellen og vises som ikke angitt.
 */
export function SellSection({ view, resolution, facts }: { view: VersionView; resolution: SaleResolution | null; facts: MarketFacts }) {
  const e = endProductView(view.def, resolution);
  const b = view.b;
  const lo = view.ev.cases.low?.V ?? null;
  const hi = view.ev.cases.high?.V ?? null;
  const est = facts.est;
  const qualities = [
    e.kitchen.changes === true ? `Kjøkken: ${e.kitchen.label.toLowerCase()}` : null,
    e.bath.changes === true ? `Bad: ${e.bath.label.toLowerCase()}` : null,
    e.layoutNote || null,
  ].filter((x): x is string => x !== null);
  const certainty = view.ranked?.metrics.saleCertaintyLabel ?? null;
  return (
    <Section id="salg" eyebrow="6 · Slik kan den selges" title="Boligen som salgsobjekt" intro="Hva en kjøper får, og hva markedet tilsier. Modellert og forventet – ikke garantert.">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        <div className="min-w-0 rounded-2xl border border-[var(--prop-line)] bg-[var(--prop-paper)] p-4 sm:p-6">
          <h3 className="prop-label">Salgsobjektet</h3>
          <dl className="mt-3 space-y-3 text-sm" data-testid="prop-sell-object">
            <div>
              <dt className="text-xs text-slate-600">Målgruppe</dt>
              <dd className="mt-0.5 font-medium">Ikke angitt i analysen</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-600">Standard</dt>
              <dd className="mt-0.5 font-medium">{e.standard ? `${e.standard.label}${e.standard.documented ? '' : ' (antatt ut fra oppussingsnivået)'}` : 'Ikke avklart'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-600">Rom og soverom</dt>
              <dd className="mt-0.5 font-medium">{e.notAssessed ? 'Sluttproduktet er ikke vurdert (eldre analyse)' : e.bedrooms}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-600">Kvaliteter</dt>
              <dd className="mt-0.5 font-medium">
                {qualities.length === 0 ? 'Ingen spesielle endringer angitt' : (
                  <ul className="list-disc space-y-0.5 pl-5">
                    {qualities.map((q) => (
                      <li key={q}>{q}</li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
          </dl>
        </div>

        <div className="min-w-0 rounded-2xl border border-[var(--prop-line)] bg-[var(--prop-paper)] p-4 sm:p-6">
          <h3 className="prop-label">Forventet salgsverdi</h3>
          {b && lo !== null && hi !== null ? (
            <div data-testid="prop-sell-range">
              <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                <div className="min-w-0"><p className="text-xs text-slate-600">Lavt</p><Fig className="font-semibold">{formatNOK(lo)}</Fig></div>
                <div className="min-w-0 text-center"><p className="text-xs text-slate-600">Normalt</p><Fig className="prop-serif text-[1.25rem]">{formatNOK(b.V)}</Fig></div>
                <div className="min-w-0 text-right"><p className="text-xs text-slate-600">Høyt</p><Fig className="font-semibold">{formatNOK(hi)}</Fig></div>
              </div>
              <RangeBar low={lo} base={b.V} high={hi} />
              <p className="mt-2 text-xs text-slate-700">{b.basis === 'total' ? 'Totalpris' : 'Kontantpris'} · tre modellerte utfall</p>
            </div>
          ) : b ? (
            <div data-testid="prop-sell-range">
              <p className="prop-fig prop-serif mt-1 text-[1.5rem]">{formatNOK(b.V)}</p>
              <p className="mt-1 text-xs text-slate-700">Bare normalverdi er oppgitt – lavt og høyt utfall mangler.</p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-800">Salgsverdi er ikke beregnet – kalkylen er ufullstendig.</p>
          )}
          <dl className="mt-4 space-y-2.5 border-t border-[var(--prop-line)] pt-3 text-sm">
            <div>
              <dt className="text-xs text-slate-600">Markedsgrunnlag</dt>
              <dd className="mt-0.5 font-medium" data-testid="prop-sell-basis">
                {est ? `${QUALITY_TIER_LABEL[est.quality.tier]} (${est.quality.score}/100) · ${facts.primaryCount} primærreferanse${facts.primaryCount === 1 ? '' : 'r'}${facts.sameBuilding ? ' · en i samme bygg' : ''}` : 'Markedsmotoren har ikke nok grunnlag – ingen markedsverdi'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-600">Usikkerhet</dt>
              <dd className="mt-0.5 font-medium">
                {view.def.saleSource === 'global' ? 'Salgsverdien er ikke vurdert for et bestemt sluttprodukt' : `Agent: ${UNCERTAINTY_LABEL[view.def.uncertainty.level].toLowerCase()}`}
                {certainty ? ` · salgsverdiens sikkerhet: ${certainty.toLowerCase()}` : ''}
              </dd>
              {view.def.uncertainty.note && <dd className="mt-0.5 text-xs text-slate-700">{view.def.uncertainty.note}</dd>}
            </div>
          </dl>
        </div>
      </div>
    </Section>
  );
}
