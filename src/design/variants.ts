/**
 * Designvarianter av Flippsjekk. Alle varianter bruker samme domenelogikk, beregningsmotor, tjenester og data –
 * de skiller seg bare i layout, presentasjonskomponenter, styling (designtokens) og visuell informasjonsarkitektur.
 *
 * Slik legger du til en ny variant (Finance, Investment og Property er bygget slik):
 *  1. Sett `status: 'available'` her og legg til et `<ID>_BASE`-prefiks og en gren i `routingVariantFromHash`.
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
    tagline: 'Moderne investeringsverktøy: mulighet først, scenariodelta og maksbud.',
    points: ['Investeringscase og scorecard øverst, med oppside, nedside og maksbudgrenser', 'Scenarioer som delta mot basis, sensitivitet mot kjøpspris og diagrammer', 'Mørk navigasjon, lyse analyseflater og cyan aksent'],
    status: 'available',
    entry: '/design/investment',
    swatches: ['#0b1220', '#17233c', '#0e7490', '#22d3ee', '#eef2f7'],
  },
  {
    id: 'property',
    name: 'Property',
    tagline: 'Boligorientert og inspirerende: se hva boligen kan bli, hva som må gjøres og om det er verdt det.',
    points: ['Boligen først, med plass til bilde og plantegning når datakilden leverer dem', 'Tre mulige versjoner av boligen (Basis, Alt A, Alt B) med «fra dette → til dette»', 'Oppussing etter rom, økonomi i en fast sidestolpe og maksbud: «Hvor høyt kan du gå?»'],
    status: 'available',
    entry: '/design/property',
    swatches: ['#f6f2ea', '#e4dccb', '#4f7a49', '#2f5d86', '#2b2622'],
  },
];

/** Varianter som har sitt eget rutertre. De andre bruker Originals ruter. */
export type RoutingVariant = 'original' | 'finance' | 'investment' | 'property';

export const FINANCE_BASE = '/design/finance';
export const INVESTMENT_BASE = '/design/investment';
export const PROPERTY_BASE = '/design/property';

/** Hvilket rutertre som styrer en gitt hash (`#/design/finance/oversikt` → finance, `#/design/investment/…` → investment, `#/design/property/…` → property, alt annet → original). */
export function routingVariantFromHash(hash: string): RoutingVariant {
  const path = hash.replace(/^#/, '').split('?')[0];
  const under = (base: string) => path === base || path.startsWith(`${base}/`);
  if (under(FINANCE_BASE)) return 'finance';
  if (under(INVESTMENT_BASE)) return 'investment';
  if (under(PROPERTY_BASE)) return 'property';
  return 'original';
}

/** Hash-lenke inn i en variant, f.eks. `#/design/finance`. */
export function variantHref(id: VariantId): string {
  return `#${VARIANTS.find((v) => v.id === id)?.entry ?? '/'}`;
}
