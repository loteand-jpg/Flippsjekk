import { ArrowDown, ArrowRight } from 'lucide-react';
import clsx from 'clsx';
import type { ReactNode } from 'react';
import type { Risk } from '../../../domain/schemas';
import { PRIORITY_LABEL } from '../../../domain/enums';
import { formatNOK } from '../../../lib/format';
import { FloorPlanPanel } from '../media/Media';
import type { ListingMedia } from '../media/types';
import { bedroomChange, endProductView, todayView, type EndProductView } from '../model/endProduct';
import { topMeasures, viewItems, type LaborContext } from '../model/rooms';
import type { VersionView } from '../model/versions';
import type { SaleResolution } from '../../../calc/saleValue';
import type { Property, PropertySnapshot } from '../../../domain/schemas';
import { Fig, Section, Tag } from '../ui';
import { signedNumber } from '../../shared/signed';

function Block({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={clsx('min-w-0', className)}>
      <h4 className="prop-label">{title}</h4>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/** Svakheter slik analysen har registrert dem: «dokumentert» når risikoen har en kilde i analysen, ellers «antatt». Ingen egne vurderinger. */
function Weaknesses({ risks }: { risks: readonly Risk[] }) {
  if (risks.length === 0) return <p className="text-sm text-slate-700">Analysen har ikke registrert noen svakheter. Det betyr ikke at boligen er uten – bare at ingen er vurdert.</p>;
  const top = risks.slice().sort((a, b) => (b.level ?? -1) - (a.level ?? -1)).slice(0, 4);
  return (
    <ul className="space-y-1.5 text-sm" data-testid="prop-weaknesses">
      {top.map((r) => (
        <li key={r.id} className="flex flex-wrap items-baseline gap-x-2">
          <span className="min-w-0 break-words">{r.title}</span>
          <Tag tone={r.sourceId ? 'info' : 'neutral'} className="!py-0">{r.sourceId ? 'dokumentert' : 'antatt'}</Tag>
          <span className="prop-fig text-xs text-slate-600">{r.level === null ? 'ukjent alvorlighet' : `${r.level}/10`}</span>
        </li>
      ))}
      {risks.length > top.length && <li className="text-xs text-slate-600">+ {risks.length - top.length} til under «Risiko»</li>}
    </ul>
  );
}

function Standard({ e }: { e: EndProductView }) {
  if (!e.standard) return <span className="text-slate-700">Ikke avklart</span>;
  return (
    <span>
      {e.standard.label}
      {!e.standard.documented && <span className="text-slate-600"> (antatt ut fra oppussingsnivået)</span>}
    </span>
  );
}

/**
 * «Fra dette → til dette»: boligen i dag og versjonen som vises, side om side. Plantegningene har egen, tydelig plass (merket plassholder
 * uten ekte plantegning). Innholdet er fra analysen: annonsens fakta, registrerte svakheter, tiltakene i versjonen og sluttproduktet.
 * Ingen bilder før/etter og ingen oppdiktede rom.
 */
export function FromTo({
  view,
  versionResolution,
  property,
  snapshot,
  risks,
  labor,
  media,
}: {
  view: VersionView;
  versionResolution: SaleResolution | null;
  property: Pick<Property, 'propertyType' | 'tenure'>;
  snapshot: PropertySnapshot | null;
  risks: readonly Risk[];
  labor: Partial<LaborContext>;
  media: ListingMedia;
}) {
  const today = todayView(property, snapshot);
  const e = endProductView(view.def, versionResolution);
  const items = viewItems(view.row.values.renovationItems, labor);
  const required = items.filter((i) => i.item.included && i.item.priority === 'pakrevd');
  const counts = items.filter((i) => i.item.included).reduce<Record<string, number>>((m, i) => ({ ...m, [i.item.priority]: (m[i.item.priority] ?? 0) + 1 }), {});
  const measures = topMeasures(items, 5);
  const lumpSum = view.row.values.renovationMode === 'rundsum';
  const bedChange = bedroomChange(today.bedrooms, e.bedroomCount);
  const b = view.b;
  const lo = view.ev.cases.low?.V ?? null;
  const hi = view.ev.cases.high?.V ?? null;
  return (
    <Section id="fra-til" eyebrow="2 · Fra dette → til dette" title="Slik forandres boligen" intro={`Boligen i dag, og hva ${view.label === 'Basis' ? 'Basis' : view.label} gjør med den. Plantegningene får plass her når datakilden leverer dem.`}>
      <div key={view.id} className="prop-swap grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-5" data-testid="prop-fromto">
        <article className="min-w-0 rounded-2xl border border-[var(--prop-line)] bg-[var(--prop-paper)] p-4 sm:p-6" aria-labelledby="fra-i-dag">
          <p className="prop-label">Fra dette</p>
          <h3 id="fra-i-dag" className="prop-serif text-[1.5rem] leading-tight">I dag</h3>
          <FloorPlanPanel media={media} scenarioId={view.id} kind="current" label="Dagens planløsning" className="mt-3" />
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
            {today.facts.map((f) => (
              <div key={f.label} className="min-w-0">
                <dt className="text-xs text-slate-600">{f.label}</dt>
                <dd className="mt-0.5 font-medium break-words">{f.value}</dd>
              </div>
            ))}
            <div className="col-span-2 min-w-0">
              <dt className="text-xs text-slate-600">Standard i dag</dt>
              <dd className="mt-0.5 font-medium">Ikke vurdert som egen klasse i analysen</dd>
            </div>
          </dl>
          <Block title="Svakheter i analysen" className="mt-4">
            <Weaknesses risks={risks} />
          </Block>
          <Block title="Oppussingsbehov" className="mt-4">
            {lumpSum ? (
              <p className="text-sm text-slate-700">Oppussingen er oppgitt som rundsum – ingen enkelttiltak å vise.</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-slate-700">Ingen tiltak er registrert for denne versjonen.</p>
            ) : (
              <div className="text-sm" data-testid="prop-needs">
                <p>
                  <strong>{required.length}</strong> påkrevd{required.length === 1 ? '' : 'e'} tiltak
                  {counts.anbefalt ? ` · ${counts.anbefalt} anbefalt` : ''}
                  {counts.verdiokende ? ` · ${counts.verdiokende} verdiøkende` : ''}
                  {counts.valgfri ? ` · ${counts.valgfri} valgfri` : ''}
                </p>
                {required.length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-slate-800">
                    {required.slice(0, 4).map((r) => (
                      <li key={r.item.id}>{r.item.title}</li>
                    ))}
                    {required.length > 4 && <li className="list-none text-xs text-slate-600">+ {required.length - 4} til under «Hva må gjøres?»</li>}
                  </ul>
                )}
              </div>
            )}
          </Block>
        </article>

        <div className="flex items-center justify-center text-[var(--prop-blue)]" aria-hidden>
          <ArrowRight key={`a-${view.id}`} className="prop-arrow hidden size-10 lg:block" strokeWidth={1.25} />
          <ArrowDown key={`d-${view.id}`} className="prop-arrow size-8 lg:hidden" strokeWidth={1.25} />
        </div>

        <article className="min-w-0 rounded-2xl border-2 border-[var(--prop-dark)] bg-[var(--prop-paper)] p-4 sm:p-6" aria-labelledby="til-etter" data-testid="prop-after">
          <p className="prop-label">Til dette</p>
          <h3 id="til-etter" className="prop-serif text-[1.5rem] leading-tight">
            Etter {view.short}
          </h3>
          <FloorPlanPanel media={media} scenarioId={view.id} kind="proposed" label={`Planløsning etter ${view.label}`} className="mt-3" />
          {e.notAssessed ? (
            <p className="mt-4 rounded-xl bg-[var(--prop-sand-2)] px-3 py-2.5 text-sm text-slate-800">Eldre analyse: sluttproduktet er ikke vurdert (rom, standard og planløsning er ikke angitt).</p>
          ) : (
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
              <div className="min-w-0">
                <dt className="text-xs text-slate-600">Soverom</dt>
                <dd className="mt-0.5 font-medium" data-testid="prop-after-bedrooms">
                  {e.bedroomCount === null ? 'Ikke avklart' : e.bedroomCount}
                  {bedChange !== null && bedChange !== 0 && <span className="ml-1.5 text-[var(--prop-pos)]">({signedNumber(bedChange, 'soverom')})</span>}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-slate-600">Sluttstandard</dt>
                <dd className="mt-0.5 font-medium"><Standard e={e} /></dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-slate-600">Kjøkken</dt>
                <dd className="mt-0.5 font-medium">{e.kitchen.label}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-slate-600">Bad</dt>
                <dd className="mt-0.5 font-medium">{e.bath.label}</dd>
              </div>
              {e.layoutNote && (
                <div className="col-span-2 min-w-0">
                  <dt className="text-xs text-slate-600">Planløsning</dt>
                  <dd className="mt-0.5 font-medium">{e.layoutNote}</dd>
                </div>
              )}
            </dl>
          )}
          <Block title="Viktigste tiltak" className="mt-4">
            {measures.length === 0 ? (
              <p className="text-sm text-slate-700">{lumpSum ? 'Oppussingen er oppgitt som rundsum.' : 'Ingen tiltak i kalkylen.'}</p>
            ) : (
              <ul className="divide-y divide-[var(--prop-line)] text-sm" data-testid="prop-key-measures">
                {measures.map((m) => (
                  <li key={m.item.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 py-1.5">
                    <span className="min-w-0 break-words">
                      {m.item.title}
                      <span className="block text-xs text-slate-600">{m.item.room.trim() || 'Hele boligen'} · {PRIORITY_LABEL[m.item.priority].toLowerCase()}</span>
                    </span>
                    <Fig className="text-right text-xs font-medium">{m.econ.cost === null ? 'Kostnad ikke avklart' : formatNOK(m.econ.cost)}</Fig>
                  </li>
                ))}
              </ul>
            )}
          </Block>
          <div className="mt-4 rounded-xl bg-[var(--prop-sand-2)] p-3.5">
            <p className="prop-label">Forventet salgsverdi</p>
            {b ? (
              <>
                <p className="prop-fig prop-serif mt-0.5 text-[1.625rem] leading-tight" data-testid="prop-after-sale">{formatNOK(b.V)}</p>
                <p className="mt-0.5 text-xs text-slate-700">{lo !== null && hi !== null ? `Intervall ${formatNOK(lo)} – ${formatNOK(hi)} · ` : ''}{b.basis === 'total' ? 'totalpris' : 'kontantpris'} · modellert</p>
              </>
            ) : (
              <p className="mt-0.5 text-sm text-slate-800">Ikke beregnet – kalkylen er ufullstendig.</p>
            )}
          </div>
        </article>
      </div>
    </Section>
  );
}
