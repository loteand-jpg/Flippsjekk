/**
 * Felles oppslagsverdier. Hver enum har én kanonisk liste og én etikettabell,
 * slik at validering, filtre og visning bruker samme kilde.
 */

export const SALE_STATUSES = ['aktiv', 'solgt', 'trukket', 'ukjent'] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];
export const SALE_STATUS_LABEL: Record<SaleStatus, string> = {
  aktiv: 'Til salgs',
  solgt: 'Solgt',
  trukket: 'Trukket',
  ukjent: 'Ukjent status',
};

/** Brukerens private arbeidsstatus. Helt adskilt fra annonsens salgsstatus. */
export const WORK_STATUSES = ['vurderes', 'visning_planlagt', 'bud_vurderes', 'avvist', 'kjopt'] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];
export const WORK_STATUS_LABEL: Record<WorkStatus, string> = {
  vurderes: 'Vurderes',
  visning_planlagt: 'Planlagt visning',
  bud_vurderes: 'Bud vurderes',
  avvist: 'Avvist',
  kjopt: 'Kjøpt',
};

/** Faktastatus for en opplysning. Ikke en arbeidsstatus. */
export const FACT_STATUSES = ['dokumentert', 'anslag', 'uavklart'] as const;
export type FactStatus = (typeof FACT_STATUSES)[number];
export const FACT_STATUS_LABEL: Record<FactStatus, string> = {
  dokumentert: 'Dokumentert',
  anslag: 'Anslag',
  uavklart: 'Uavklart',
};

/** Dokumentasjonsstatus for et sjekklistepunkt i den felles analysen. */
export const CHECK_STATUSES = ['dokumentert', 'delvis', 'mangler', 'ikke_relevant'] as const;
export type CheckStatus = (typeof CHECK_STATUSES)[number];
export const CHECK_STATUS_LABEL: Record<CheckStatus, string> = {
  dokumentert: 'Dokumentert',
  delvis: 'Delvis dokumentert',
  mangler: 'Mangler',
  ikke_relevant: 'Ikke relevant',
};

export const PROPERTY_TYPES = ['leilighet', 'rekkehus', 'tomannsbolig', 'enebolig'] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];
export const PROPERTY_TYPE_LABEL: Record<PropertyType, string> = {
  leilighet: 'Leilighet',
  rekkehus: 'Rekkehus',
  tomannsbolig: 'Tomannsbolig',
  enebolig: 'Enebolig',
};
/** Kategori brukes til profilstandard for kjøpertype (leilighet / hus). */
export function propertyCategory(type: PropertyType): 'leilighet' | 'hus' {
  return type === 'leilighet' ? 'leilighet' : 'hus';
}

export const TENURES = ['selveier', 'borettslag', 'aksje', 'obligasjon', 'ukjent'] as const;
export type Tenure = (typeof TENURES)[number];
export const TENURE_LABEL: Record<Tenure, string> = {
  selveier: 'Selveier',
  borettslag: 'Andel i borettslag',
  aksje: 'Aksjeleilighet',
  obligasjon: 'Obligasjonsleilighet',
  ukjent: 'Ikke avklart',
};

/** Kjøpertype er hvem som kjøper – ikke eierformen til boligen. */
export const BUYER_TYPES = ['privat', 'as'] as const;
export type BuyerType = (typeof BUYER_TYPES)[number];
export const BUYER_TYPE_LABEL: Record<BuyerType, string> = {
  privat: 'Privatperson',
  as: 'Aksjeselskap (AS)',
};

export const RECOMMENDATIONS = ['interessant', 'folg_med', 'avklar_forst', 'avsta'] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];
export const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  interessant: 'Interessant',
  folg_med: 'Følg med',
  avklar_forst: 'Avklar først',
  avsta: 'Avstå',
};

export const PRIORITIES = ['pakrevd', 'anbefalt', 'verdiokende', 'valgfri'] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = {
  pakrevd: 'Påkrevd',
  anbefalt: 'Anbefalt',
  verdiokende: 'Verdiøkende',
  valgfri: 'Valgfri',
};

export const RENOVATION_LEVELS = ['lett', 'hoved', 'omfattende'] as const;
export type RenovationLevel = (typeof RENOVATION_LEVELS)[number];
export const RENOVATION_LEVEL_LABEL: Record<RenovationLevel, string> = {
  lett: 'Lett oppfrisking',
  hoved: 'Hovedalternativ',
  omfattende: 'Omfattende / ombygging',
};

export const RISK_CATEGORIES = [
  'vatrom',
  'elektrisk',
  'vann_avlop',
  'tak_fasade',
  'fukt_grunn',
  'regulering',
  'sameie_borettslag',
  'marked',
  'prosjekt',
  'dokumentasjon',
  'finansiering',
  'annet',
] as const;
export type RiskCategory = (typeof RISK_CATEGORIES)[number];
export const RISK_CATEGORY_LABEL: Record<RiskCategory, string> = {
  vatrom: 'Bad og våtrom',
  elektrisk: 'Elektrisk anlegg',
  vann_avlop: 'Vann og avløp',
  tak_fasade: 'Tak, fasade og vinduer',
  fukt_grunn: 'Fukt, grunnmur og drenering',
  regulering: 'Regulering og godkjenning',
  sameie_borettslag: 'Sameie / borettslag',
  marked: 'Marked og salg',
  prosjekt: 'Prosjektgjennomføring',
  dokumentasjon: 'Dokumentasjon',
  finansiering: 'Finansiering',
  annet: 'Annet',
};

export const COMPARABLE_KINDS = ['solgt', 'prisantydning', 'solgt_uten_sum'] as const;
export type ComparableKind = (typeof COMPARABLE_KINDS)[number];
export const COMPARABLE_KIND_LABEL: Record<ComparableKind, string> = {
  solgt: 'Faktisk salg',
  prisantydning: 'Prisantydning – ikke oppnådd pris',
  solgt_uten_sum: 'Solgt – salgssum ikke dokumentert',
};

export const PRICE_BASES = ['kontant', 'total'] as const;
export type PriceBasis = (typeof PRICE_BASES)[number];
export const PRICE_BASIS_LABEL: Record<PriceBasis, string> = {
  kontant: 'Kontantpris (ekskl. fellesgjeld)',
  total: 'Totalpris (inkl. fellesgjeld, ekskl. kjøpskostnader)',
};
export const PRICE_BASIS_SHORT: Record<PriceBasis, string> = {
  kontant: 'kontant',
  total: 'inkl. fellesgjeld',
};

export const SOURCE_KINDS = [
  'annonse',
  'salgsoppgave',
  'tilstandsrapport',
  'egenerklaering',
  'tegninger',
  'vedtekter',
  'sammenligning',
  'statistikk',
  'offentlig',
  'demo',
  'annet',
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];
export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  annonse: 'Annonse',
  salgsoppgave: 'Salgsoppgave',
  tilstandsrapport: 'Tilstandsrapport',
  egenerklaering: 'Egenerklæring',
  tegninger: 'Tegninger',
  vedtekter: 'Vedtekter / regnskap',
  sammenligning: 'Sammenligningsgrunnlag',
  statistikk: 'Statistikk',
  offentlig: 'Offentlig register',
  demo: 'Demodata',
  annet: 'Annet',
};

export const DUTY_BASES = ['kjopesum_pluss_fellesgjeld', 'kjopesum', 'egendefinert', 'ingen'] as const;
export type DutyBasis = (typeof DUTY_BASES)[number];
export const DUTY_BASIS_LABEL: Record<DutyBasis, string> = {
  kjopesum_pluss_fellesgjeld: 'Kjøpesum + fellesgjeld',
  kjopesum: 'Kjøpesum',
  egendefinert: 'Eget grunnlag (beløp)',
  ingen: 'Ingen dokumentavgift',
};

export const VIEWING_STATUSES = ['planlagt', 'avlyst'] as const;
export type ViewingStatus = (typeof VIEWING_STATUSES)[number];

export const SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due', 'canceled', 'incomplete'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  active: 'Aktivt',
  trialing: 'Prøveperiode',
  past_due: 'Betalingsproblem',
  canceled: 'Avsluttet',
  incomplete: 'Ikke fullført',
};

/** linked_analysis: brukerens egen analyse av en bolig som allerede er analysert – ser ut og belastes som en ny analyse. */
export const JOB_TYPES = ['full_analysis', 'light_refresh', 'linked_analysis'] as const;
export type JobType = (typeof JOB_TYPES)[number];
export const JOB_STATUSES = ['queued', 'running', 'succeeded', 'failed'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const USAGE_KINDS = ['new_analysis', 'refresh', 'reuse'] as const;
export type UsageKind = (typeof USAGE_KINDS)[number];
export const USAGE_KIND_LABEL: Record<UsageKind, string> = {
  new_analysis: 'Ny analyse',
  refresh: 'Oppfrisking av annonse',
  reuse: 'Gjenbruk av eksisterende analyse',
};

export const CHECKLIST_KEYS = [
  'salgsoppgave',
  'tilstandsrapport',
  'tegninger',
  'vatrom',
  'elektrisk',
  'vann_avlop',
  'tak_fasade',
  'fukt_grunn',
  'fellesgjeld_vedtekter',
  'sammenlignbare_salg',
  'finansiering',
  'skatt',
] as const;
export type ChecklistKey = (typeof CHECKLIST_KEYS)[number];
export const CHECKLIST_LABEL: Record<ChecklistKey, string> = {
  salgsoppgave: 'Salgsoppgave og egenerklæring',
  tilstandsrapport: 'Tilstandsrapport, TG2 og TG3',
  tegninger: 'Godkjente tegninger og rombruk',
  vatrom: 'Bad og våtrom',
  elektrisk: 'Elektrisk anlegg og dokumentasjon',
  vann_avlop: 'Vann og avløp',
  tak_fasade: 'Tak, fasade og vinduer',
  fukt_grunn: 'Fukt, grunnmur og drenering',
  fellesgjeld_vedtekter: 'Fellesgjeld, vedtekter og vedlikehold',
  sammenlignbare_salg: 'Sammenlignbare faktiske salg',
  finansiering: 'Finansiering og sikkerhet',
  skatt: 'Avklart skattebehandling',
};

export const TAX_MODES = ['uavklart', 'antatt'] as const;
export type TaxMode = (typeof TAX_MODES)[number];

export const RENOVATION_MODES = ['tiltak', 'rundsum'] as const;
export type RenovationMode = (typeof RENOVATION_MODES)[number];
