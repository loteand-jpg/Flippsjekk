import clsx from 'clsx';
import { ExternalLink, Home, Ruler } from 'lucide-react';
import { useState } from 'react';
import { floorPlansFor, heroImage, type DocumentImage, type ListingMedia } from './types';

/**
 * Mediekomponenter i Property. De velger selv mellom ekte media (når `ListingMedia` har noe) og en tydelig merket plassholder.
 * Plassholderne er bevisst ikke realistiske: ingen bilde av en bolig, ingen plantegning med rom og ingen generert innhold –
 * bare et tegnebrett med tekst som sier hva som skal stå her og hvorfor det mangler.
 */
export const HERO_PLACEHOLDER_TEXT = 'Annonsebilde kommer fra datakilden';
export const FLOORPLAN_PLACEHOLDER_TEXT = 'Plantegning ikke tilgjengelig i demo';

function HeroPlaceholder({ address, className }: { address: string; className?: string }) {
  return (
    <div
      role="img"
      aria-label={`Plassholder for annonsebilde av ${address}. Bildet vises her når datakilden leverer det. Ikke koblet i demoen.`}
      data-testid="prop-hero-placeholder"
      className={clsx('prop-plate relative flex flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border border-dashed border-[var(--prop-line-strong)] px-4 text-center', className)}
    >
      <Home className="size-8 text-slate-500 sm:size-10" strokeWidth={1.25} aria-hidden />
      <p className="text-sm font-semibold text-slate-700" aria-hidden>
        {HERO_PLACEHOLDER_TEXT}
      </p>
      <p className="hidden max-w-xs text-xs text-slate-600 sm:block" aria-hidden>
        Plassholder – ikke et bilde av boligen. Hovedbilde og flere bilder vises her når annonsen hentes fra FINN. Ikke koblet i demoen.
      </p>
    </div>
  );
}

/** Hovedbilde av boligen, med miniatyrer når det finnes flere bilder. Uten bilder: merket plassholder. */
export function HeroMedia({ media, address, className, placeholderClassName }: { media: ListingMedia; address: string; className?: string; placeholderClassName?: string }) {
  const hero = heroImage(media);
  const [picked, setPicked] = useState<string | null>(null);
  if (!hero) return <HeroPlaceholder address={address} className={clsx(className, placeholderClassName)} />;
  const shown = media.images.find((i) => i.id === picked) ?? hero;
  return (
    <figure className={clsx('min-w-0', className)} data-testid="prop-hero-image">
      <img src={shown.url} alt={shown.alt} width={shown.width} height={shown.height} loading="eager" decoding="async" className="aspect-[4/3] w-full rounded-2xl border border-[var(--prop-line)] object-cover sm:aspect-[16/10]" />
      {shown.caption && <figcaption className="mt-1.5 text-xs text-slate-600">{shown.caption}</figcaption>}
      {media.images.length > 1 && (
        <ul className="mt-2 flex gap-2 overflow-x-auto pb-1" aria-label="Flere bilder">
          {media.images.map((img, i) => (
            <li key={img.id} className="shrink-0">
              <button
                type="button"
                aria-label={`Vis bilde ${i + 1} av ${media.images.length}: ${img.alt}`}
                aria-pressed={img.id === shown.id}
                onClick={() => setPicked(img.id)}
                className={clsx('block size-14 overflow-hidden rounded-lg border-2', img.id === shown.id ? 'border-[var(--prop-blue)]' : 'border-transparent')}
              >
                <img src={img.url} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

function PlanPlaceholder({ label, className }: { label: string; className?: string }) {
  return (
    <div
      role="img"
      aria-label={`Plassholder for plantegning: ${label}. Plantegningen vises her når datakilden leverer den. Ikke tilgjengelig i demoen.`}
      data-testid="prop-floorplan-placeholder"
      className={clsx('prop-plate-plan flex min-h-36 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--prop-blue-line)] px-4 py-6 text-center', className)}
    >
      <Ruler className="size-6 text-[var(--prop-blue)]" strokeWidth={1.5} aria-hidden />
      <p className="text-sm font-semibold text-[var(--prop-blue)]" aria-hidden>
        {FLOORPLAN_PLACEHOLDER_TEXT}
      </p>
      <p className="max-w-[16rem] text-xs text-slate-700" aria-hidden>
        {label}. Vises her når datakilden leverer plantegningen.
      </p>
    </div>
  );
}

/**
 * Plantegning for dagens bolig («i dag») eller for et sluttprodukt («etter»). Med ekte plantegning: bildet i en beholder som kan
 * rulles og zoomes (nettleserens egen pinch-zoom), med lenke til full størrelse. Uten: merket plassholder – aldri en oppdiktet plan.
 */
export function FloorPlanPanel({ media, scenarioId, kind, label, className }: { media: ListingMedia; scenarioId: string | null; kind: 'current' | 'proposed'; label: string; className?: string }) {
  const plans = floorPlansFor(media, scenarioId);
  const list = kind === 'current' ? plans.current : plans.proposed;
  if (list.length === 0) return <PlanPlaceholder label={label} className={className} />;
  return (
    <div className={clsx('space-y-3', className)} data-testid={`prop-floorplan-${kind}`}>
      {list.map((p) => (
        <figure key={p.id} className="min-w-0">
          <div className="max-h-[28rem] overflow-auto rounded-xl border border-[var(--prop-line)] bg-white" tabIndex={0} role="region" aria-label={`${p.label ?? label} (kan rulles og zoomes)`} style={{ touchAction: 'pan-x pan-y pinch-zoom' }}>
            <img src={p.url} alt={p.alt} loading="lazy" decoding="async" className="mx-auto block h-auto min-w-full max-w-none sm:max-w-full" />
          </div>
          <figcaption className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
            <span>{[p.label ?? label, p.level].filter(Boolean).join(' · ')}</span>
            <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 font-medium text-[var(--prop-blue)] underline sm:min-h-8">
              Åpne i full størrelse <ExternalLink className="size-3" aria-hidden />
            </a>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

/** Dokumentbilder (f.eks. sider fra tilstandsrapport) – vises bare når de finnes. */
export function DocumentImages({ items, className }: { items: readonly DocumentImage[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <ul className={clsx('grid grid-cols-2 gap-3 sm:grid-cols-3', className)} aria-label="Dokumentbilder">
      {items.map((d) => (
        <li key={d.id} className="min-w-0">
          <a href={d.url} target="_blank" rel="noreferrer" className="block rounded-lg border border-[var(--prop-line)] bg-white p-1.5">
            <img src={d.url} alt={d.alt} loading="lazy" decoding="async" className="aspect-[3/4] w-full rounded object-cover" />
            <span className="mt-1 block truncate text-xs text-slate-700">{d.title}{d.page ? ` · side ${d.page}` : ''}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
