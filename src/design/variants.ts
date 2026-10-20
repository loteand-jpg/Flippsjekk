/**
 * Designvarianter av Flippsjekk. Alle varianter bruker samme domenelogikk, beregningsmotor, tjenester og data –
 * de skiller seg bare i layout, presentasjonskomponenter, styling (designtokens) og visuell informasjonsarkitektur.
 *
 * Slik legger du til en ny variant (f.eks. «investment» eller «property»):
 *  1. Sett `status: 'available'` her og legg inn `routing` for varianten.
 *  2. Lag `src/design/<id>/` med `<Id>App.tsx` (default export, lager ruter med `basename` = `variantBase(id)`) og et CSS-scope.
 *  3. Legg varianten til i `routingVariantFromHash` og i `App.tsx` (lazy import).
 *  Gjenbruk `PropertyPage view={...}`, `useScenarioRanking`, `MarketTab sections`, `Results` osv. i stedet for å kopiere logikk.
 */
export type VariantId = 'original' | 'finance' | 'investment' | 'property';

export interface DesignVariant {
  id: VariantId;
  name: string;
  tagline: string;
  points: string[];
  status: 'available' | 'soon';
  /** Hash-sti inn i varianten (uten #). */
  entry: string;
  /** Primære designfarger (kun til forhåndsvisning i galleriet). */
  swatches: string[];
}

export const VARIANTS: readonly DesignVariant[] = [
  {
    id: 'original',
    name: 'Original',
    tagline: 'Dagens Flippsjekk – uendret.',
    points: ['Grønn «pine»-palett', 'Verktøy- og kortbasert layout', 'Hele funksjonaliteten som før'],
    status: 'available',
    entry: '/',
    swatches: ['#235444', '#5a9f84', '#dcede5', '#f6f7f5', '#13222b'],
  },
  {
    id: 'finance',
    name: 'Finance',
    tagline: 'Enkel, tillitsvekkende bank/finans.',
    points: ['Beslutningstopp: maksbud, fortjeneste og risiko først', 'Investeringsoversikt og scenariosammenligning', 'Lyst, rolig uttrykk med tydelige tall'],
    status: 'available',
    entry: '/design/finance',
    swatches: ['#1d3752', '#3f6890', '#dde6ef', '#f6f4ef', '#15202b'],
  },
  {
    id: 'investment',
    name: 'Investment',
    tagline: 'Kommer senere.',
    points: ['Ikke bygget ennå'],
    status: 'soon',
    entry: '/design/investment',
    swatches: [],
  },
  {
    id: 'property',
    name: 'Property',
    tagline: 'Kommer senere.',
    points: ['Ikke bygget ennå'],
    status: 'soon',
    entry: '/design/property',
    swatches: [],
  },
];

/** Varianter som har sitt eget rutertre. De andre bruker Originals ruter. */
export type RoutingVariant = 'original' | 'finance';

export const FINANCE_BASE = '/design/finance';

/** Hvilket rutertre som styrer en gitt hash (`#/design/finance/oversikt` → finance, alt annet → original). */
export function routingVariantFromHash(hash: string): RoutingVariant {
  const path = hash.replace(/^#/, '').split('?')[0];
  return path === FINANCE_BASE || path.startsWith(`${FINANCE_BASE}/`) ? 'finance' : 'original';
}

/** Hash-lenke inn i en variant, f.eks. `#/design/finance`. */
export function variantHref(id: VariantId): string {
  return `#${VARIANTS.find((v) => v.id === id)?.entry ?? '/'}`;
}
