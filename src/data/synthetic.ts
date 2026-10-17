import type { PropertyType, Recommendation, Tenure } from '../domain/enums';
import { hash32, seededRandom } from '../lib/ids';
import type { ItemSpec, PropertySpec } from './analysisBuilder';

/**
 * Deterministisk syntetisk eiendom for ukjente FINN-ID-er i demo.
 * Samme FINN-ID gir alltid samme objekt. Alt merkes «Demodata – ingen annonse hentet».
 * Det leses ingen data fra FINN.
 */

const DISTRICTS: { name: string; postal: string; pricePerM2: number; renovatedPerM2: number }[] = [
  { name: 'Møllenberg', postal: '7014', pricePerM2: 50_000, renovatedPerM2: 63_000 },
  { name: 'Lademoen', postal: '7042', pricePerM2: 46_000, renovatedPerM2: 58_000 },
  { name: 'Byåsen', postal: '7020', pricePerM2: 38_000, renovatedPerM2: 47_500 },
  { name: 'Tiller', postal: '7092', pricePerM2: 32_000, renovatedPerM2: 40_000 },
  { name: 'Lerkendal', postal: '7031', pricePerM2: 47_000, renovatedPerM2: 59_000 },
  { name: 'Ranheim', postal: '7053', pricePerM2: 37_000, renovatedPerM2: 46_000 },
  { name: 'Strindheim', postal: '7052', pricePerM2: 42_000, renovatedPerM2: 52_500 },
  { name: 'Ila', postal: '7018', pricePerM2: 52_000, renovatedPerM2: 65_000 },
];

const STREETS = ['Demoveien', 'Prøvegata', 'Eksempelvegen', 'Testbakken', 'Fiktivgata', 'Modellvegen'];

function roundTo(n: number, step: number) {
  return Math.round(n / step) * step;
}

export function syntheticPropertySpec(finnId: string): PropertySpec {
  const rng = seededRandom(hash32(`synthetic:${finnId}`));
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rng() * arr.length)];
  const between = (a: number, b: number) => a + rng() * (b - a);

  const district = pick(DISTRICTS);
  const isHouse = rng() < 0.25;
  const propertyType: PropertyType = isHouse ? pick(['rekkehus', 'enebolig', 'tomannsbolig'] as const) : 'leilighet';
  const tenure: Tenure = isHouse ? 'selveier' : rng() < 0.6 ? 'selveier' : 'borettslag';
  const area = Math.round(isHouse ? between(85, 160) : between(38, 90));
  const rooms = Math.max(1, Math.round(area / 22));
  const buildYear = Math.round(between(1925, 1995));
  const value = roundTo(area * district.pricePerM2 * between(0.92, 1.05), 10_000);
  const sharedDebt = tenure === 'borettslag' ? roundTo(value * between(0.25, 0.6), 10_000) : rng() < 0.2 ? roundTo(between(40_000, 250_000), 5_000) : 0;
  const askingPrice = tenure === 'borettslag' ? roundTo(value - sharedDebt, 10_000) : value;
  const renovated = roundTo(area * district.renovatedPerM2 * between(0.94, 1.04), 50_000);
  const basis = tenure === 'borettslag' ? 'total' : 'kontant';
  const saleBase = basis === 'total' ? renovated : renovated - (sharedDebt > 0 ? sharedDebt : 0);
  const common = isHouse ? 0 : roundTo(tenure === 'borettslag' ? 2_500 + sharedDebt * 0.0045 : between(1_800, 3_800), 50);

  const docsMissing = rng() < 0.25;
  const bathScale = area / 60;
  const items: ItemSpec[] = [
    ['Bad', 'Totalrenovering av bad', roundTo(78_000 * Math.min(1.3, Math.max(0.8, bathScale)), 1_000), 16_000, 52_000, 58_000, 25, 'pakrevd'],
    ['Kjøkken', 'Nytt kjøkken i standard kvalitet', 82_000, 14_000, 11_000, 12_000, 40, 'verdiokende'],
    ['Alle rom', 'Sparkling og maling', roundTo(area * 260, 500), 0, 0, 0, Math.round(area * 1.1), 'anbefalt'],
    ['Alle rom', 'Nytt gulv', roundTo(area * 620, 500), 0, 0, roundTo(area * 120, 500), Math.round(area * 0.6), 'verdiokende'],
    ['Teknisk', 'Oppgradering av el-anlegg', 0, 38_000, 0, 0, 0, 'pakrevd'],
    ['Salg', 'Boligstyling og fotografering', 0, 0, 0, 14_000, 4, 'valgfri'],
  ];
  const renoCost = items.reduce((s, i) => s + (i[2] ?? 0) + (i[3] ?? 0) + (i[4] ?? 0) + (i[5] ?? 0), 0);
  const saleCash = basis === 'total' ? saleBase - sharedDebt : saleBase;
  const roughMargin = (saleCash - askingPrice - renoCost * 1.2 - askingPrice * 0.08) / Math.max(askingPrice, 1);
  const recommendation: Recommendation = docsMissing ? 'avklar_forst' : roughMargin > 0.1 ? 'interessant' : roughMargin > 0.03 ? 'folg_med' : 'avsta';

  const viewingCount = Math.floor(rng() * 3);
  const firstOffset = 2 + Math.floor(rng() * 6);
  const viewings = Array.from({ length: viewingCount }, (_, i) => ({
    offsetDays: firstOffset + i * (1 + Math.floor(rng() * 2)),
    hour: pick([12, 13, 16, 17, 18]),
    durationMin: 60,
  }));

  return {
    key: `syn-${finnId}`,
    finnId,
    address: `${pick(STREETS)} ${1 + Math.floor(rng() * 60)}${rng() < 0.3 ? ' B' : ''}`,
    postalCode: district.postal,
    district: district.name,
    propertyType,
    tenure,
    origin: 'synthetic',
    areaBRAi: area,
    rooms,
    bedrooms: Math.max(0, rooms - 1),
    floor: isHouse ? null : 1 + Math.floor(rng() * 4),
    buildYear: docsMissing ? null : buildYear,
    plotArea: isHouse ? Math.round(between(250, 900)) : null,
    askingPrice,
    sharedDebt,
    monthlyCommonCosts: common,
    saleStatus: 'aktiv',
    unknownFacts: docsMissing ? ['buildYear'] : [],
    viewings,
    analysisAgeDays: 0,
    snapshotAgeHours: 0,
    analysis: {
      recommendation,
      recommendationRationale:
        recommendation === 'avklar_forst'
          ? 'Tilstandsrapport og byggeår mangler i det syntetiske grunnlaget. Vurderingen er foreløpig.'
          : recommendation === 'interessant'
            ? 'Grovt anslag viser god avstand mellom uoppusset og oppusset nivå i området.'
            : recommendation === 'folg_med'
              ? 'Moderat margin. Følsom for kjøpspris og oppussingskostnad.'
              : 'Liten eller negativ margin etter oppussing og kostnader.',
      summary: `Syntetisk demoobjekt generert fra FINN-kode ${finnId}. Ingen annonse er hentet – tallene er fiktive.`,
      strategy: 'Hovedalternativ med nytt bad, kjøkken og overflater.',
      conditions: ['Erstatt demodata med faktisk annonsegrunnlag før vurdering.', 'Kjøpesum under modellert maksbud.'],
      sale: {
        basis,
        low: roundTo(saleBase * 0.94, 10_000),
        base: roundTo(saleBase, 10_000),
        high: roundTo(saleBase * 1.05, 10_000),
        rationaleLow: 'Syntetisk: 6 % under normalt scenario.',
        rationaleBase: `Syntetisk: ${district.renovatedPerM2.toLocaleString('nb-NO')} kr/m² for oppusset standard i ${district.name}.`,
        rationaleHigh: 'Syntetisk: 5 % over normalt scenario.',
      },
      renovationOptions: [
        {
          level: 'lett',
          description: 'Maling, småreparasjoner og styling.',
          items: [items[2], items[5], ['Kjøkken', 'Nye fronter og benkeplate', 28_000, 0, 4_500, 3_500, 16, 'verdiokende']],
          suggestedMonths: 3,
          saleEffectNote: 'Begrenset verdiøkning.',
        },
        { level: 'hoved', description: 'Nytt bad og kjøkken, overflater, gulv og el.', items, suggestedMonths: null, saleEffectNote: 'Innflyttingsklar standard.' },
      ],
      defaultOption: 'hoved',
      monthlyBreakdown: [
        { label: 'Felleskostnader', amount: common },
        { label: 'Strøm og oppvarming', amount: isHouse ? 2_600 : 1_200 },
        { label: 'Forsikring', amount: isHouse ? 900 : 350 },
        { label: 'Kommunale avgifter og eiendomsskatt', amount: tenure === 'borettslag' ? 0 : isHouse ? 1_400 : 650 },
      ],
      risks: docsMissing
        ? [{ title: 'Tilstandsrapport mangler', category: 'dokumentasjon', level: null, rationale: 'Bygningsrisikoen er ukjent – ikke lav.', action: 'Be om tilstandsrapport.', source: null }]
        : [
            { title: 'Våtrom', category: 'vatrom', level: 4 + Math.floor(rng() * 3), costLow: 20_000, costHigh: 120_000, rationale: 'Syntetisk: eldre bad med TG2.', action: 'Fuktmåling før bud.', source: 'tilstandsrapport' },
            { title: 'Salgstidspunkt', category: 'marked', level: 3 + Math.floor(rng() * 3), rationale: 'Syntetisk: sesongvariasjon i markedet.', action: 'Planlegg ferdigstillelse.', source: null },
          ],
      checklist: docsMissing
        ? { sammenlignbare_salg: { status: 'delvis' } }
        : {
            salgsoppgave: { status: 'dokumentert' },
            tilstandsrapport: { status: 'dokumentert' },
            tegninger: { status: rng() < 0.5 ? 'dokumentert' : 'delvis' },
            vatrom: { status: 'delvis' },
            elektrisk: { status: rng() < 0.5 ? 'dokumentert' : 'mangler' },
            vann_avlop: { status: 'delvis' },
            fellesgjeld_vedtekter: { status: isHouse ? 'ikke_relevant' : 'dokumentert' },
            sammenlignbare_salg: { status: 'delvis' },
          },
      comparables: [
        { name: `${district.name}, oppusset, ${area} m²`, price: roundTo(saleBase * between(0.97, 1.03), 10_000), priceBasis: basis, debt: basis === 'total' ? sharedDebt : null, area, monthsAgo: 2, kind: 'solgt', notes: 'Syntetisk sammenligning.' },
        { name: `${district.name}, uoppusset`, price: roundTo(askingPrice * between(0.97, 1.03), 10_000), priceBasis: basis === 'total' ? 'total' : 'kontant', debt: basis === 'total' ? sharedDebt : null, area: area + 3, monthsAgo: 4, kind: 'solgt', notes: 'Syntetisk sammenligning.' },
        { name: `${district.name}, prisantydning`, price: roundTo(saleBase * 1.06, 10_000), priceBasis: basis, area: area - 2, monthsAgo: 0.3, kind: 'prisantydning', notes: 'Prisantydning – ikke oppnådd pris.' },
      ],
      documents: docsMissing ? [] : ['salgsoppgave', 'tilstandsrapport', 'egenerklaering'],
    },
  };
}
