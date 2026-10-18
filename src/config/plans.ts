/**
 * Abonnementskonfigurasjon – én kilde for pris, grenser og prøveperiode.
 * ALLE TALL ER EKSEMPELVERDIER I DEMO. Ingen kommersiell pris er besluttet.
 */
export interface PlanConfig {
  id: string;
  name: string;
  tagline: string;
  /** Eksempelpris per måned (NOK, inkl. mva.). */
  priceMonthly: number;
  /** Eksempelpris per år (NOK, inkl. mva.). */
  priceYearly: number;
  trialDays: number;
  /** Kampanjetekst som vises sammen med prøveperioden (null = ingen kampanje). */
  campaign: string | null;
  limits: {
    /** Nye agentanalyser per abonnementsperiode. Gjenbruk belastes ikke. */
    newAnalysesPerPeriod: number;
    /** Lette oppfriskinger av pris, visninger og salgsstatus per periode. */
    refreshesPerPeriod: number;
    scenariosPerProperty: number;
  };
  features: string[];
  public: boolean;
  isExampleValue: true;
}

export const PLANS: PlanConfig[] = [
  {
    id: 'flipprom-pro',
    name: 'Flippsjekk',
    tagline: 'For deg som vurderer boligflipp jevnlig',
    priceMonthly: 200,
    priceYearly: 2000,
    trialDays: 30,
    campaign: 'Kampanjeperiode: prøv 1 måned gratis',
    limits: { newAnalysesPerPeriod: 15, refreshesPerPeriod: 60, scenariosPerProperty: 10 },
    features: [
      'Analyse fra FINN-lenke med oppussing, salgsverdi og risiko',
      'Private scenarioer, maksbud og stresstester',
      'Kalender med visninger og forventet buddag, eksport til .ics',
      'Sammenligning av inntil tre objekter',
    ],
    public: true,
    isExampleValue: true,
  },
  {
    id: 'demo-lav-kvote',
    name: 'Testplan med lav kvote',
    tagline: 'Kun for demo: viser hva som skjer når kvoten er brukt opp',
    priceMonthly: 0,
    priceYearly: 0,
    trialDays: 0,
    campaign: null,
    limits: { newAnalysesPerPeriod: 1, refreshesPerPeriod: 2, scenariosPerProperty: 10 },
    features: [],
    public: false,
    isExampleValue: true,
  },
];

export const PRIMARY_PLAN = PLANS[0];

export function getPlan(id: string): PlanConfig {
  return PLANS.find((p) => p.id === id) ?? PRIMARY_PLAN;
}
