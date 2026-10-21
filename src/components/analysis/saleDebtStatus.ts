import { resolveSalePricesForDebt, type SaleDebtIssue, type SaleDebtIssueKind } from '../../calc/saleValue';
import type { BaseValues } from '../../calc/scenario';
import type { ScenarioValues } from '../../domain/schemas';

/**
 * Felles presentasjon av fellesgjeld ved salg: hjelpetekst ved feltet og brukerrettet status når gjelden gjør salgsverdien usikker.
 * Her regnes INGENTING nytt: statusen oversetter `SaleDebtIssue` fra den delte beregningen (`resolveSalePricesForDebt`) til norsk,
 * og hjelpeteksten velger forklaring ut fra hvor salgsverdien faktisk kommer fra. Alle designvarianter bruker denne ene kilden og
 * velger selv hvordan den vises; teksten og alvorligheten er de samme.
 */

// ---------------------------------------------------------------------------
// Hjelpetekst ved «Fellesgjeld ved salg»
// ---------------------------------------------------------------------------

export type SaleDebtHelpKind = 'total' | 'markedsavledet' | 'delvis_markedsavledet' | 'direkte';

export const SALE_DEBT_HELP_TEXT: Record<SaleDebtHelpKind, string> = {
  total: 'Trekkes fra totalprisen én gang. Endrer du fellesgjelden, endres kontantdelen av salgsverdien tilsvarende.',
  markedsavledet: 'Salgsverdien bygger på en beregnet totalverdi. Endrer du fellesgjelden ved salg, justeres kontantprisen slik at totalverdien beholdes.',
  delvis_markedsavledet:
    'Salgsverdien bygger delvis på en beregnet totalverdi. Endrer du fellesgjelden, justeres bare verdiene du ikke selv har endret, slik at totalverdien beholdes. Verdier du har skrevet inn selv endres ikke automatisk.',
  direkte: 'Salgsverdien er oppgitt som kontantpris. Endring i fellesgjeld endrer ikke denne salgsverdien automatisk.',
};

const KEYS = ['low', 'base', 'high'] as const;
const FIELD = { low: 'saleLow', base: 'saleBase', high: 'saleHigh' } as const;

type DraftSale = Pick<ScenarioValues, 'saleBasis' | 'saleLow' | 'saleBase' | 'saleHigh' | 'debtAtSale'>;

/** Hvilke av salgsverdiene i kalkylen som fortsatt er grunnverdiene markedsmotoren avledet av en totalverdi (ikke overstyrt av brukeren). */
function followingBase(draft: DraftSale, base: BaseValues): (typeof KEYS)[number][] {
  const sale = base.saleResolution.sale;
  if (base.values.saleBasis !== 'kontant' || sale.debtBasis === null || draft.saleBasis !== 'kontant') return [];
  const prices = { low: base.values.saleLow, base: base.values.saleBase, high: base.values.saleHigh };
  const consistent = resolveSalePricesForDebt({ basis: 'kontant', prices, derivedWithDebt: sale.debtBasis, debtAtSale: draft.debtAtSale }).prices;
  return KEYS.filter((k) => draft[FIELD[k]] !== null && (draft[FIELD[k]] === consistent[k] || draft[FIELD[k]] === prices[k]));
}

/** Velger riktig forklaring ut fra faktisk kilde: totalpris, beregnet totalverdi (markedsmotoren) eller direkte oppgitt kontantpris. */
export function saleDebtHelp(args: { draft: DraftSale; base: BaseValues | null }): { kind: SaleDebtHelpKind; text: string } {
  const { draft, base } = args;
  let kind: SaleDebtHelpKind;
  if (draft.saleBasis === 'total') kind = 'total';
  else if (!base) kind = 'direkte';
  else {
    const following = followingBase(draft, base);
    const present = KEYS.filter((k) => draft[FIELD[k]] !== null).length;
    kind = following.length === 0 ? 'direkte' : following.length < present ? 'delvis_markedsavledet' : 'markedsavledet';
  }
  return { kind, text: SALE_DEBT_HELP_TEXT[kind] };
}

// ---------------------------------------------------------------------------
// Status når fellesgjelden gjør salgsverdien usikker
// ---------------------------------------------------------------------------

export type SaleDebtSeverity = 'warning' | 'error';

/** Alvorlighet som ord, så den aldri bare kommuniseres med farge eller ikon. */
export const SALE_DEBT_SEVERITY_LABEL: Record<SaleDebtSeverity, string> = { warning: 'Ikke avklart', error: 'Feil' };

export interface SaleDebtStatus {
  kind: SaleDebtIssueKind;
  /** warning = ikke avklart (verdiene er ikke sikre). error = umulig (kontantprisen kan ikke beregnes). Alvoret står også i teksten. */
  severity: SaleDebtSeverity;
  title: string;
  message: string;
  /** Scenarioene det gjelder (navn). Tom hvis ikke angitt. */
  affects: string[];
}

const STATUS_TEXT: Record<SaleDebtIssueKind, Pick<SaleDebtStatus, 'severity' | 'title' | 'message'>> = {
  gjeld_ukjent: {
    severity: 'warning',
    title: 'Fellesgjeld ved salg er ikke avklart',
    message: 'Kontant salgsverdi kan ikke fastsettes sikkert før fellesgjelden ved salg er kjent. Ukjent er ikke 0 kr.',
  },
  gjeld_over_totalverdi: {
    severity: 'error',
    title: 'Fellesgjeld er høyere enn beregnet total salgsverdi',
    message: 'Kontant salgsverdi kan derfor ikke beregnes. Kontroller fellesgjeld eller salgsverdi.',
  },
};

/** Brukerrettet status for ett problem fra den delte beregningen. */
export function describeSaleDebtIssue(issue: Pick<SaleDebtIssue, 'kind'>, affects: string[] = []): SaleDebtStatus {
  return { kind: issue.kind, ...STATUS_TEXT[issue.kind], affects };
}

/**
 * Samler problemene fra flere scenarioer til én status per type (alvorligste først), med hvilke scenarioer det gjelder.
 * Tom liste når det ikke er noe problem – ingen unødvendig varsel.
 */
export function collectSaleDebtStatus(entries: readonly { title: string; issues: readonly Pick<SaleDebtIssue, 'kind'>[] }[]): SaleDebtStatus[] {
  const byKind = new Map<SaleDebtIssueKind, string[]>();
  for (const e of entries) for (const i of e.issues) byKind.set(i.kind, [...new Set([...(byKind.get(i.kind) ?? []), e.title])]);
  return [...byKind.entries()].map(([kind, titles]) => describeSaleDebtIssue({ kind }, titles)).sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
}

/**
 * Problemer med fellesgjeld ved salg i brukerens egen kalkyle. Totalpris: gjelden er påkrevd og må ikke overstige verdien.
 * Kontantpris avledet av en beregnet totalverdi: samme sjekk mot totalverdien. Direkte oppgitt kontantpris trenger ikke gjelden.
 */
export function saleDebtIssuesForDraft(draft: DraftSale, base: BaseValues | null): SaleDebtIssue[] {
  if (draft.saleBasis === 'total') {
    return resolveSalePricesForDebt({ basis: 'total', prices: { low: draft.saleLow, base: draft.saleBase, high: draft.saleHigh }, derivedWithDebt: null, debtAtSale: draft.debtAtSale }).issues;
  }
  if (!base || followingBase(draft, base).length === 0) return [];
  const prices = { low: base.values.saleLow, base: base.values.saleBase, high: base.values.saleHigh };
  return resolveSalePricesForDebt({ basis: 'kontant', prices, derivedWithDebt: base.saleResolution.sale.debtBasis, debtAtSale: draft.debtAtSale }).issues;
}

/**
 * Status for hele saken: brukerens kalkyle (aktivt scenario) og de andre analysescenarioene i sammenligningen.
 * @param rows radene fra `useScenarioRanking(...).data.rows` (valgfritt – uten dem vises bare kalkylens egen status)
 */
export function saleDebtStatuses(args: {
  draft: DraftSale;
  base: BaseValues | null;
  activeTitle: string;
  rows?: readonly { input: { id: string; title: string }; saleIssues: readonly SaleDebtIssue[] }[];
  activeId?: string;
}): SaleDebtStatus[] {
  const entries = [{ title: args.activeTitle, issues: saleDebtIssuesForDraft(args.draft, args.base) as readonly SaleDebtIssue[] }];
  for (const r of args.rows ?? []) if (r.input.id !== args.activeId) entries.push({ title: r.input.title, issues: r.saleIssues });
  return collectSaleDebtStatus(entries);
}
