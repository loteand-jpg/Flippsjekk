import type { DutyBasis, PriceBasis, TaxMode } from '../domain/enums';

/**
 * Flippsjekk beregningsmotor.
 *
 * Rene funksjoner uten sideeffekter. All UI (objektside, tabell, sammenligning,
 * kalender og eksport) bruker denne motoren. Prosentsatser kommer inn som desimaltall
 * (0,07 = 7 %); konvertering fra prosentpoeng skjer én gang i `toEngineInput`.
 *
 * Pengehåndtering: alle mellomregninger gjøres i hele øre (heltall). Hvert produktledd
 * avrundes én gang til nærmeste øre; summer gjøres på øre-heltall, aldri på avrundede
 * visningstall.
 *
 * Modell 1.1 (avdragsfrie prosjektlån, kjøpslån og oppussingslån adskilt):
 *   K      = A × d + F
 *   RB     = R × (1 + b)
 *   I      = r × m/12 × ( fP × (P + K)  +  fR × RB / 2  +  [løpende lånefinansiert] O / 2 )
 *            – kjøpslånet er trukket fra start, oppussingslånet trekkes gradvis (snitt halvveis)
 *   O      = M × m
 *   S      = V − D1 (Totalpris) | V (Kontantpris)
 *   Csale  = Sf + s × S
 *   C      = P + K + RB + I + O + Csale
 *   resultat før skatt og eget arbeid = S − C
 *   fortjeneste per egeninnsatstime   = (S − C) / H        – egen tid er IKKE en kostnad
 *   prosjektavkastning = (S − C) / (C + D0)                – ikke egenkapitalavkastning
 *   egenkapitalbehov   = (P + K − kjøpslån) + (RB − oppussingslån) + [ikke lånefinansiert] (I + O)
 *                        – salgskostnader inngår i resultatet, men ikke i initialt egenkapitalkrav
 *   finansieringsgap   = max(0, egenkapitalbehov − tilgjengelig egenkapital)
 *
 * Endringer fra 1.0.0: `f` er delt i `fP` (kjøp) og `fR` (oppussing). Med fP = fR = f gir 1.1.0 nøyaktig samme
 * resultat som 1.0.0. Timeverdi (H × h) er beholdt som utfaset, rent informativ størrelse for eldre data.
 */
export const CALC_MODEL_VERSION = '1.1.0';
export const CALC_MODEL_LABEL = `Flippsjekk kalkylemodell ${CALC_MODEL_VERSION}`;

/** Toleranse for maksbud og nullpunkt (kroner). */
export const SOLVER_TOLERANCE_KR = 1;

export type CaseKey = 'low' | 'base' | 'high';
export const CASE_LABEL: Record<CaseKey, string> = { low: 'Lavt', base: 'Normalt', high: 'Høyt' };

export interface EngineInput {
  purchasePrice: number | null;
  debtAtPurchase: number | null;
  debtAtSale: number | null;
  duty: { basis: DutyBasis; rate: number | null; customBase: number | null };
  buyFees: number | null;
  /** R – valgt oppussingssum uten reserve. */
  renovation: number | null;
  reserveRate: number | null;
  months: number | null;
  monthlyCost: number | null;
  interestRate: number | null;
  /** Låneandel av kjøpesum og kjøpskostnader (0–1). */
  purchaseFinancingShare: number | null;
  /** Låneandel av oppussing inkl. reserve (0–1). Trekkes gradvis. */
  renovationFinancingShare: number | null;
  /** Lånefinansieres løpende kostnader (drift)? Standard nei. */
  financeRunningCosts: boolean;
  /** Tilgjengelig egenkapital (kr) for å vise finansieringsgap. null = ukjent. */
  availableEquity: number | null;
  saleFixedCost: number | null;
  saleCommissionRate: number | null;
  saleBasis: PriceBasis;
  salePrices: Record<CaseKey, number | null>;
  ownHours: number | null;
  /** @deprecated Eldre timeverdi. Brukes kun til informativ «resultat etter verdsatt eget arbeid». */
  hourValue: number | null;
  /** Minimum ønsket fortjeneste per egeninnsatstime (kr/t). */
  minProfitPerOwnHour: number | null;
  profitTarget: number | null;
  tax: { mode: TaxMode; rate: number | null };
}

export interface MissingInput {
  field: string;
  label: string;
}

export interface Issue {
  field: string;
  message: string;
}

export interface ResolvedInput {
  P: number;
  D0: number;
  D1: number | null;
  dutyBasis: DutyBasis;
  d: number;
  customBase: number | null;
  F: number;
  R: number;
  b: number;
  m: number;
  M: number;
  r: number;
  /** Låneandel kjøp. */
  fP: number;
  /** Låneandel oppussing. */
  fR: number;
  financeRunning: boolean;
  availableEquity: number | null;
  minPerHour: number | null;
  Sf: number;
  s: number;
  basis: PriceBasis;
  H: number | null;
  h: number | null;
}

export interface Breakdown {
  modelVersion: string;
  basis: PriceBasis;
  P: number;
  D0: number;
  D1: number | null;
  dutyBase: number;
  duty: number;
  F: number;
  K: number;
  R: number;
  reserve: number;
  RB: number;
  I: number;
  O: number;
  months: number;
  V: number;
  S: number;
  Csale: number;
  C: number;
  /** Resultat før skatt og eget arbeid. */
  profit: number;
  ownWorkValue: number | null;
  profitAfterOwnWork: number | null;
  capitalBase: number;
  /** Prosjektavkastning (ikke egenkapitalavkastning). null ved nullnevner. */
  projectReturn: number | null;
  /** Kjøpslån (andel av kjøpesum + kjøpskostnader). */
  purchaseLoan: number;
  /** Oppussingslån (andel av oppussing inkl. reserve) når hele oppussingen er trukket. */
  renovationLoan: number;
  /** Lånefinansierte løpende kostnader (drift og renter) når slik finansiering er valgt, ellers 0. */
  runningLoan: number;
  /** Høyeste samlede prosjektlån når hele oppussingen er trukket. */
  loanPeak: number;
  /** Egenkapital: ufinansiert andel av kjøp/oppussing + (ikke lånefinansierte) renter og drift. Uten salgskostnader. */
  equityNeed: number;
  /** Tilgjengelig egenkapital fra forutsetningene. null = ukjent. */
  availableEquity: number | null;
  /** Mangel på egenkapital (≥ 0). null når tilgjengelig egenkapital er ukjent. */
  equityGap: number | null;
  /** Egne timer som inngår i beregningen. null = ukjent. */
  ownHours: number | null;
  /** Fortjeneste før skatt per egeninnsatstime. null når egne timer er ukjent eller 0. Egen tid trekkes ikke som kostnad. */
  profitPerOwnHour: number | null;
  /** Ønsket minimum per time (fra forutsetningene). */
  minProfitPerOwnHour: number | null;
  /** Oppfyller fortjenesten per time minimumskravet? null når ett av tallene er ukjent. */
  meetsHourlyRequirement: boolean | null;
}

export const INPUT_LABEL: Record<string, string> = {
  purchasePrice: 'Kjøpspris (kontant)',
  debtAtPurchase: 'Fellesgjeld ved kjøp',
  debtAtSale: 'Fellesgjeld ved salg',
  dutyRate: 'Sats for dokumentavgift',
  dutyCustomBase: 'Eget grunnlag for dokumentavgift',
  buyFees: 'Øvrige kjøpsgebyrer',
  renovation: 'Oppussingssum',
  reserveRate: 'Oppussingsreserve',
  months: 'Prosjektvarighet',
  monthlyCost: 'Månedlige kostnader',
  interestRate: 'Rente',
  purchaseFinancingShare: 'Låneandel kjøp',
  renovationFinancingShare: 'Låneandel oppussing',
  saleFixedCost: 'Faste salgskostnader',
  saleCommissionRate: 'Meglerprovisjon',
  saleLow: 'Salgspris – lavt scenario',
  saleBase: 'Salgspris – normalt scenario',
  saleHigh: 'Salgspris – høyt scenario',
  ownHours: 'Egne timer',
  hourValue: 'Timeverdi for eget arbeid',
  minProfitPerOwnHour: 'Minimum fortjeneste per egeninnsatstime',
  availableEquity: 'Tilgjengelig egenkapital',
  profitTarget: 'Fortjenestemål',
  taxRate: 'Skattesats (forutsetning)',
};

const toOre = (kr: number) => Math.round(kr * 100);
const fromOre = (ore: number) => ore / 100;

// ---------------------------------------------------------------------------
// Validering og oppløsning av inngangsverdier
// ---------------------------------------------------------------------------

export interface ResolveResult {
  resolved: ResolvedInput | null;
  missing: MissingInput[];
  errors: Issue[];
  warnings: Issue[];
}

export function resolveInput(input: EngineInput): ResolveResult {
  const missing: MissingInput[] = [];
  const errors: Issue[] = [];
  const warnings: Issue[] = [];

  const need = (field: string, v: number | null): v is number => {
    if (v === null || v === undefined || Number.isNaN(v)) {
      missing.push({ field, label: INPUT_LABEL[field] ?? field });
      return false;
    }
    return true;
  };
  const nonNegative = (field: string, v: number | null) => {
    if (v !== null && v < 0) errors.push({ field, message: `${INPUT_LABEL[field]} kan ikke være negativ.` });
  };
  const range = (field: string, v: number | null, min: number, max: number, pctLabel = true) => {
    if (v === null) return;
    if (v < min || v > max) {
      const fmt = (x: number) => (pctLabel ? `${Math.round(x * 1000) / 10} %` : String(x));
      errors.push({ field, message: `${INPUT_LABEL[field]} må være mellom ${fmt(min)} og ${fmt(max)}.` });
    }
  };

  const P = input.purchasePrice;
  const D0 = input.debtAtPurchase;
  const D1 = input.debtAtSale;
  need('purchasePrice', P);
  need('debtAtPurchase', D0);
  if (input.saleBasis === 'total') need('debtAtSale', D1);
  need('buyFees', input.buyFees);
  need('renovation', input.renovation);
  need('reserveRate', input.reserveRate);
  need('months', input.months);
  need('monthlyCost', input.monthlyCost);
  need('interestRate', input.interestRate);
  need('purchaseFinancingShare', input.purchaseFinancingShare);
  need('renovationFinancingShare', input.renovationFinancingShare);
  need('saleFixedCost', input.saleFixedCost);
  need('saleCommissionRate', input.saleCommissionRate);
  need('saleBase', input.salePrices.base);

  let d = 0;
  if (input.duty.basis !== 'ingen') {
    if (need('dutyRate', input.duty.rate)) d = input.duty.rate;
    if (input.duty.basis === 'egendefinert') {
      need('dutyCustomBase', input.duty.customBase);
      nonNegative('dutyCustomBase', input.duty.customBase);
    }
  }

  nonNegative('purchasePrice', P);
  nonNegative('debtAtPurchase', D0);
  nonNegative('debtAtSale', D1);
  nonNegative('buyFees', input.buyFees);
  nonNegative('renovation', input.renovation);
  nonNegative('monthlyCost', input.monthlyCost);
  nonNegative('saleFixedCost', input.saleFixedCost);
  for (const k of ['low', 'base', 'high'] as const) {
    const field = k === 'low' ? 'saleLow' : k === 'base' ? 'saleBase' : 'saleHigh';
    nonNegative(field, input.salePrices[k]);
  }
  nonNegative('ownHours', input.ownHours);
  nonNegative('hourValue', input.hourValue);
  nonNegative('minProfitPerOwnHour', input.minProfitPerOwnHour);
  nonNegative('availableEquity', input.availableEquity);

  range('dutyRate', input.duty.basis === 'ingen' ? null : input.duty.rate, 0, 0.1);
  range('reserveRate', input.reserveRate, 0, 1);
  range('interestRate', input.interestRate, 0, 0.3);
  range('purchaseFinancingShare', input.purchaseFinancingShare, 0, 1);
  range('renovationFinancingShare', input.renovationFinancingShare, 0, 1);
  range('saleCommissionRate', input.saleCommissionRate, 0, 0.1);
  if (input.tax.mode === 'antatt') range('taxRate', input.tax.rate, 0, 1);
  if (input.months !== null && (input.months <= 0 || input.months > 60)) {
    errors.push({ field: 'months', message: 'Prosjektvarighet må være mer enn 0 og høyst 60 måneder.' });
  }

  if (input.saleBasis === 'total' && D1 !== null) {
    for (const k of ['low', 'base', 'high'] as const) {
      const v = input.salePrices[k];
      if (v !== null && v < D1) {
        const field = k === 'low' ? 'saleLow' : k === 'base' ? 'saleBase' : 'saleHigh';
        errors.push({ field, message: `${INPUT_LABEL[field]} er lavere enn fellesgjelden ved salg.` });
      }
    }
  }
  const { low, base, high } = input.salePrices;
  if (low !== null && base !== null && low > base) warnings.push({ field: 'saleLow', message: 'Lavt scenario er høyere enn normalt scenario.' });
  if (high !== null && base !== null && high < base) warnings.push({ field: 'saleHigh', message: 'Høyt scenario er lavere enn normalt scenario.' });
  if (input.saleBasis === 'kontant' && D1 !== null && D0 !== null && D1 !== D0) {
    warnings.push({
      field: 'debtAtSale',
      message: 'Salgsprisen er angitt som kontantpris, så fellesgjeld ved salg påvirker ikke kontantsalget i kalkylen.',
    });
  }

  if (missing.length > 0 || errors.length > 0) return { resolved: null, missing, errors, warnings };

  return {
    resolved: {
      P: P as number,
      D0: D0 as number,
      D1: input.saleBasis === 'total' ? (D1 as number) : D1,
      dutyBasis: input.duty.basis,
      d,
      customBase: input.duty.customBase,
      F: input.buyFees as number,
      R: input.renovation as number,
      b: input.reserveRate as number,
      m: input.months as number,
      M: input.monthlyCost as number,
      r: input.interestRate as number,
      fP: input.purchaseFinancingShare as number,
      fR: input.renovationFinancingShare as number,
      financeRunning: input.financeRunningCosts,
      availableEquity: input.availableEquity,
      minPerHour: input.minProfitPerOwnHour,
      Sf: input.saleFixedCost as number,
      s: input.saleCommissionRate as number,
      basis: input.saleBasis,
      H: input.ownHours,
      h: input.hourValue,
    },
    missing,
    errors,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Kjerneberegning
// ---------------------------------------------------------------------------

/** Dokumentavgiftsgrunnlag A for gitt kjøpspris – beregnes på nytt for hver P. */
export function dutyBaseFor(x: Pick<ResolvedInput, 'dutyBasis' | 'D0' | 'customBase'>, P: number): number {
  switch (x.dutyBasis) {
    case 'ingen':
      return 0;
    case 'kjopesum':
      return P;
    case 'egendefinert':
      return x.customBase ?? 0;
    case 'kjopesum_pluss_fellesgjeld':
    default:
      return P + x.D0;
  }
}

export function computeCore(x: ResolvedInput, P: number, V: number): Breakdown {
  const Po = toOre(P);
  const D0o = toOre(x.D0);
  const D1o = x.D1 === null ? 0 : toOre(x.D1);
  const Ao = x.dutyBasis === 'ingen' ? 0 : toOre(dutyBaseFor(x, P));
  const dutyO = x.dutyBasis === 'ingen' ? 0 : Math.round(Ao * x.d);
  const Fo = toOre(x.F);
  const Ko = dutyO + Fo;
  const Ro = toOre(x.R);
  const reserveO = Math.round(Ro * x.b);
  const RBo = Ro + reserveO;
  const Oo = Math.round(toOre(x.M) * x.m);
  // Kjøpslånet er trukket fra start; oppussingslånet trekkes gradvis (snitt halvveis); lånefinansierte løpende kostnader likedan.
  const interestBaseO = x.fP * (Po + Ko) + (x.fR * RBo) / 2 + (x.financeRunning ? Oo / 2 : 0);
  const Io = Math.round(interestBaseO * x.r * (x.m / 12));
  const Vo = toOre(V);
  const So = x.basis === 'total' ? Vo - D1o : Vo;
  const CsaleO = toOre(x.Sf) + Math.round(x.s * So);
  const Co = Po + Ko + RBo + Io + Oo + CsaleO;
  const profitO = So - Co;
  const ownWorkO = x.H !== null && x.h !== null ? Math.round(x.H * toOre(x.h)) : null;
  const capitalO = Co + D0o;
  const purchaseLoanO = Math.round(x.fP * (Po + Ko));
  const renovationLoanO = Math.round(x.fR * RBo);
  const runningLoanO = x.financeRunning ? Oo + Io : 0;
  const loanO = purchaseLoanO + renovationLoanO + runningLoanO;
  const equityO = Po + Ko - purchaseLoanO + (RBo - renovationLoanO) + (x.financeRunning ? 0 : Io + Oo);
  const ownHours = x.H;
  const profit = fromOre(profitO);
  const profitPerOwnHour = ownHours !== null && ownHours > 0 ? profit / ownHours : null;

  return {
    modelVersion: CALC_MODEL_VERSION,
    basis: x.basis,
    P: fromOre(Po),
    D0: fromOre(D0o),
    D1: x.D1 === null ? null : fromOre(D1o),
    dutyBase: fromOre(Ao),
    duty: fromOre(dutyO),
    F: fromOre(Fo),
    K: fromOre(Ko),
    R: fromOre(Ro),
    reserve: fromOre(reserveO),
    RB: fromOre(RBo),
    I: fromOre(Io),
    O: fromOre(Oo),
    months: x.m,
    V: fromOre(Vo),
    S: fromOre(So),
    Csale: fromOre(CsaleO),
    C: fromOre(Co),
    profit: fromOre(profitO),
    ownWorkValue: ownWorkO === null ? null : fromOre(ownWorkO),
    profitAfterOwnWork: ownWorkO === null ? null : fromOre(profitO - ownWorkO),
    capitalBase: fromOre(capitalO),
    projectReturn: capitalO > 0 ? profitO / capitalO : null,
    purchaseLoan: fromOre(purchaseLoanO),
    renovationLoan: fromOre(renovationLoanO),
    runningLoan: fromOre(runningLoanO),
    loanPeak: fromOre(loanO),
    equityNeed: fromOre(equityO),
    availableEquity: x.availableEquity,
    equityGap: x.availableEquity === null ? null : Math.max(0, fromOre(equityO) - x.availableEquity),
    ownHours,
    profitPerOwnHour,
    minProfitPerOwnHour: x.minPerHour,
    meetsHourlyRequirement: profitPerOwnHour === null || x.minPerHour === null ? null : profitPerOwnHour >= x.minPerHour,
  };
}

// ---------------------------------------------------------------------------
// Løsere: maksbud og nullpunkt (biseksjon)
// ---------------------------------------------------------------------------

export interface MaxBidResult {
  kind: 'profit' | 'return';
  target: number;
  /** Høyeste kontante kjøpspris som når målet, avrundet ned til hele kroner. */
  price: number | null;
  status: 'ok' | 'none' | 'capped';
  profitAtPrice: number | null;
  returnAtPrice: number | null;
  toleranceKr: number;
  iterations: number;
}

export function solveMaxBid(
  x: ResolvedInput,
  V: number,
  target: { kind: 'profit' | 'return'; value: number },
): MaxBidResult {
  const pred = (b: Breakdown) =>
    target.kind === 'profit' ? b.profit >= target.value : b.projectReturn !== null && b.projectReturn >= target.value;
  const base: Omit<MaxBidResult, 'price' | 'status' | 'profitAtPrice' | 'returnAtPrice' | 'iterations'> = {
    kind: target.kind,
    target: target.value,
    toleranceKr: SOLVER_TOLERANCE_KR,
  };
  const S = x.basis === 'total' ? V - (x.D1 ?? 0) : V;
  let lo = 0;
  let hi = Math.max(S, 1);
  const atLo = computeCore(x, lo, V);
  if (!pred(atLo)) {
    return { ...base, price: null, status: 'none', profitAtPrice: null, returnAtPrice: null, iterations: 0 };
  }
  const atHi = computeCore(x, hi, V);
  if (pred(atHi)) {
    return { ...base, price: Math.floor(hi), status: 'capped', profitAtPrice: atHi.profit, returnAtPrice: atHi.projectReturn, iterations: 0 };
  }
  let iterations = 0;
  while (hi - lo > SOLVER_TOLERANCE_KR && iterations < 200) {
    const mid = (lo + hi) / 2;
    if (pred(computeCore(x, mid, V))) lo = mid;
    else hi = mid;
    iterations++;
  }
  const price = Math.floor(lo);
  const at = computeCore(x, price, V);
  return { ...base, price, status: 'ok', profitAtPrice: at.profit, returnAtPrice: at.projectReturn, iterations };
}

export interface BreakEvenResult {
  /** Laveste salgspris i valgt prisgrunnlag som gir resultat ≥ 0, avrundet opp til hele kroner. */
  salePrice: number | null;
  basis: PriceBasis;
  toleranceKr: number;
}

export function solveBreakEven(x: ResolvedInput, P: number): BreakEvenResult {
  const floor = x.basis === 'total' ? x.D1 ?? 0 : 0;
  let lo = floor;
  let hi = Math.max(floor + 1, (P + x.R) * 2);
  let guard = 0;
  while (computeCore(x, P, hi).profit < 0 && guard < 40) {
    hi *= 2;
    guard++;
  }
  if (computeCore(x, P, hi).profit < 0) return { salePrice: null, basis: x.basis, toleranceKr: SOLVER_TOLERANCE_KR };
  if (computeCore(x, P, lo).profit >= 0) return { salePrice: Math.ceil(lo), basis: x.basis, toleranceKr: SOLVER_TOLERANCE_KR };
  let i = 0;
  while (hi - lo > SOLVER_TOLERANCE_KR && i < 200) {
    const mid = (lo + hi) / 2;
    if (computeCore(x, P, mid).profit >= 0) hi = mid;
    else lo = mid;
    i++;
  }
  return { salePrice: Math.ceil(hi), basis: x.basis, toleranceKr: SOLVER_TOLERANCE_KR };
}

// ---------------------------------------------------------------------------
// Stresstester
// ---------------------------------------------------------------------------

export interface StressRow {
  id: string;
  label: string;
  detail: string;
  result: Breakdown;
  deltaProfit: number;
  maxBid: MaxBidResult | null;
  noEffect: boolean;
}

export const STRESS_RENOVATION_ADD = 100_000;
export const STRESS_MONTHS_ADD = 3;
export const STRESS_DEBT_ADD = 100_000;

export function runStressTests(x: ResolvedInput, P: number, V: number, profitTarget: number | null): StressRow[] {
  const baseResult = computeCore(x, P, V);
  const basisText =
    x.basis === 'total'
      ? `Reduksjonen gjelder totalpris inkl. fellesgjeld. Fellesgjeld ved salg holdes uendret på ${Math.round(x.D1 ?? 0).toLocaleString('nb-NO')} kr.`
      : 'Reduksjonen gjelder kontantpris (ekskl. fellesgjeld).';
  const defs: { id: string; label: string; detail: string; x: ResolvedInput; V: number; noEffect?: boolean }[] = [
    { id: 'sale-5', label: 'Salgspris −5 %', detail: basisText, x, V: V * 0.95 },
    { id: 'sale-10', label: 'Salgspris −10 %', detail: basisText, x, V: V * 0.9 },
    { id: 'sale-15', label: 'Salgspris −15 %', detail: basisText, x, V: V * 0.85 },
    {
      id: 'renovation+100k',
      label: 'Oppussing +100 000 kr',
      detail: 'Legges til oppussingssummen før reserve. Reserve og renter beregnes på nytt.',
      x: { ...x, R: x.R + STRESS_RENOVATION_ADD },
      V,
    },
    {
      id: 'months+3',
      label: 'Prosjekttid +3 måneder',
      detail: 'Renter og månedlige kostnader for tre ekstra måneder.',
      x: { ...x, m: x.m + STRESS_MONTHS_ADD },
      V,
    },
    {
      id: 'combined',
      label: 'Kombinert: salg −10 %, oppussing +100 000 kr, tid +3 mnd',
      detail: basisText,
      x: { ...x, R: x.R + STRESS_RENOVATION_ADD, m: x.m + STRESS_MONTHS_ADD },
      V: V * 0.9,
    },
    {
      id: 'debt+100k',
      label: 'Fellesgjeld ved salg +100 000 kr',
      detail:
        x.basis === 'total'
          ? 'Isolert gjeldsøkning ved salg: totalprisen holdes lik, kontantsalget går ned.'
          : 'Ingen effekt når salgsprisen er angitt som kontantpris. Bytt til totalpris for å teste gjeld ved salg.',
      x: { ...x, D1: (x.D1 ?? x.D0) + STRESS_DEBT_ADD },
      V,
      noEffect: x.basis !== 'total',
    },
  ];
  return defs.map((d) => {
    const result = computeCore(d.x, P, d.V);
    return {
      id: d.id,
      label: d.label,
      detail: d.detail,
      result,
      deltaProfit: result.profit - baseResult.profit,
      maxBid: profitTarget === null ? null : solveMaxBid(d.x, d.V, { kind: 'profit', value: profitTarget }),
      noEffect: Boolean(d.noEffect),
    };
  });
}

// ---------------------------------------------------------------------------
// Skatt (separat illustrasjon – aldri del av hovedresultatet)
// ---------------------------------------------------------------------------

export type TaxIllustration =
  | { mode: 'uavklart' }
  | { mode: 'antatt'; rate: number | null; taxAmount: number | null; profitAfterTax: number | null; note: string };

export function illustrateTax(profit: number, tax: EngineInput['tax']): TaxIllustration {
  if (tax.mode === 'uavklart') return { mode: 'uavklart' };
  if (tax.rate === null) return { mode: 'antatt', rate: null, taxAmount: null, profitAfterTax: null, note: 'Skattesats er ikke angitt.' };
  if (profit <= 0) {
    return {
      mode: 'antatt',
      rate: tax.rate,
      taxAmount: 0,
      profitAfterTax: profit,
      note: 'Ingen automatisk skattefordel ved tap er beregnet. Fradragsrett må avklares særskilt.',
    };
  }
  const taxAmount = fromOre(Math.round(toOre(profit) * tax.rate));
  return {
    mode: 'antatt',
    rate: tax.rate,
    taxAmount,
    profitAfterTax: fromOre(toOre(profit) - toOre(taxAmount)),
    note: 'Illustrasjon basert på din egen skatteforutsetning. Ikke skatteråd.',
  };
}

// ---------------------------------------------------------------------------
// Samlet evaluering
// ---------------------------------------------------------------------------

export const MAX_BID_PROFIT_TARGETS = [100_000, 200_000, 300_000, 400_000] as const;
export const MAX_BID_RETURN_TARGETS = [0.15, 0.2] as const;

export interface Evaluation {
  modelVersion: string;
  status: 'complete' | 'incomplete' | 'invalid';
  missing: MissingInput[];
  errors: Issue[];
  warnings: Issue[];
  cases: Record<CaseKey, Breakdown | null>;
  base: Breakdown | null;
  maxBid: MaxBidResult | null;
  maxBidLow: MaxBidResult | null;
  maxBidTable: MaxBidResult[];
  breakEven: BreakEvenResult | null;
  stress: StressRow[];
  tax: TaxIllustration | null;
  resolved: ResolvedInput | null;
}

export function evaluate(input: EngineInput, options: { detailed?: boolean } = {}): Evaluation {
  const detailed = options.detailed ?? true;
  const r = resolveInput(input);
  const empty: Evaluation = {
    modelVersion: CALC_MODEL_VERSION,
    status: r.errors.length > 0 ? 'invalid' : 'incomplete',
    missing: r.missing,
    errors: r.errors,
    warnings: r.warnings,
    cases: { low: null, base: null, high: null },
    base: null,
    maxBid: null,
    maxBidLow: null,
    maxBidTable: [],
    breakEven: null,
    stress: [],
    tax: null,
    resolved: null,
  };
  if (!r.resolved) return empty;
  const x = r.resolved;
  const P = x.P;
  const cases: Record<CaseKey, Breakdown | null> = { low: null, base: null, high: null };
  for (const k of ['low', 'base', 'high'] as const) {
    const V = input.salePrices[k];
    cases[k] = V === null ? null : computeCore(x, P, V);
  }
  const baseV = input.salePrices.base as number;
  const target = input.profitTarget;
  const maxBid = target === null ? null : solveMaxBid(x, baseV, { kind: 'profit', value: target });
  const lowV = input.salePrices.low;
  const maxBidLow = target === null || lowV === null ? null : solveMaxBid(x, lowV, { kind: 'profit', value: target });

  const result: Evaluation = {
    ...empty,
    status: 'complete',
    cases,
    base: cases.base,
    maxBid,
    maxBidLow,
    resolved: x,
    tax: illustrateTax((cases.base as Breakdown).profit, input.tax),
  };
  if (detailed) {
    result.maxBidTable = [
      ...MAX_BID_PROFIT_TARGETS.map((t) => solveMaxBid(x, baseV, { kind: 'profit', value: t })),
      ...MAX_BID_RETURN_TARGETS.map((t) => solveMaxBid(x, baseV, { kind: 'return', value: t })),
    ];
    result.breakEven = solveBreakEven(x, P);
    result.stress = runStressTests(x, P, baseV, target);
  }
  return result;
}

/** Fortjeneste som funksjon av kjøpspris eller salgspris (samme motor). */
export function sensitivity(
  x: ResolvedInput,
  P: number,
  V: number,
  axis: 'purchase' | 'sale',
  span = 0.15,
  steps = 12,
): { value: number; profit: number; projectReturn: number | null }[] {
  const center = axis === 'purchase' ? P : V;
  const out: { value: number; profit: number; projectReturn: number | null }[] = [];
  for (let i = 0; i <= steps; i++) {
    const factor = 1 - span + (2 * span * i) / steps;
    const value = Math.round((center * factor) / 1000) * 1000;
    const b = axis === 'purchase' ? computeCore(x, value, V) : computeCore(x, P, value);
    out.push({ value, profit: b.profit, projectReturn: b.projectReturn });
  }
  return out;
}
