import { CALC_MODEL_VERSION } from '../calc/engine';
import { defaultDutyRule } from '../calc/scenario';
import {
  CHECK_STATUSES,
  CHECKLIST_KEYS,
  CHECKLIST_LABEL,
  COMPARABLE_KINDS,
  FACT_STATUSES,
  PRIORITIES,
  PROPERTY_TYPES,
  propertyCategory,
  RECOMMENDATIONS,
  RISK_CATEGORIES,
  RISK_CATEGORY_LABEL,
  SALE_STATUSES,
  TENURES,
  WORK_STATUSES,
  type CheckStatus,
  type ChecklistKey,
  type ComparableKind,
  type FactStatus,
  type PriceBasis,
  type Priority,
  type PropertyType,
  type Recommendation,
  type RiskCategory,
  type Tenure,
  type WorkStatus,
} from '../domain/enums';
import { ANALYSIS_SCHEMA_VERSION } from '../domain/schemas';
import type {
  AnalysisFact,
  BidStep,
  ChecklistItem,
  ComparableSale,
  DutyRule,
  ProfileDefaults,
  RenovationItem,
  RenovationOption,
  ReportSection,
  Risk,
  ScenarioValues,
  Source,
} from '../domain/schemas';
import { pricesFromLegacy } from '../domain/comparables';
import { parseFinnUrl } from '../lib/finn';
import { osloAt } from '../lib/time';
import type { ImportMessage, MappedV1Object } from './types';

/**
 * Adapter for det eksisterende Flippsjekk-importformatet v1:
 *   {"format":"flipprom-analysis","version":1,"objects":[…]}
 *
 * Importformatet er IKKE databaseskjemaet. Adapteren validerer type og kontekst,
 * mapper til intern modell og bevarer originalt JSON og felt uten kjent mapping.
 * Prosentfelt i v1 er prosentpoeng (7 = 7 %) – samme konvensjon som scenarioverdiene;
 * konvertering til desimal skjer ved grensen til beregningsmotoren.
 */

export const V1_FORMAT = 'flipprom-analysis';
export const V1_LIMITS = { maxObjects: 20, maxBytes: 1_000_000 } as const;

export const V1_OBJECT_FIELDS = [
  'id', 'name', 'type', 'tenure', 'status', 'url', 'area',
  'asking', 'purchase', 'debt', 'exitDebt', 'saleBasis', 'bear', 'base', 'bull',
  'rehab', 'buffer', 'duty', 'dutyBase', 'buyFees', 'saleFixed', 'salePercent',
  'monthly', 'months', 'interest', 'financing', 'target', 'hours', 'hourRate', 'tax',
  'confirmed', 'viewing', 'bidDay', 'startBid', 'walkAway', 'strategy', 'notes',
  'source', 'sourceDate', 'historicalMax', 'historicalProfit', 'historicalSale',
  'tasks', 'checks', 'risks', 'comps', 'analysis',
] as const;
const V1_ANALYSIS_FIELDS = ['recommendation', 'summary', 'report', 'assumptions', 'uncertainties', 'sources', 'facts', 'bidSteps', 'renovationOptions'];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const norm = (s: string) => s.trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/å/g, 'a').replace(/ø/g, 'o').replace(/æ/g, 'ae');

class Ctx {
  errors: ImportMessage[] = [];
  warnings: ImportMessage[] = [];
  missing: string[] = [];
  constructor(readonly base: string) {}
  p(field: string) {
    return `${this.base}.${field}`;
  }
  err(field: string, message: string) {
    this.errors.push({ path: this.p(field), message });
  }
  warn(field: string, message: string) {
    this.warnings.push({ path: this.p(field), message });
  }
}

function readNumber(ctx: Ctx, o: Obj, field: string, opts: { min?: number; max?: number; int?: boolean; pct?: boolean } = {}): number | null {
  if (!(field in o)) {
    ctx.missing.push(field);
    return null;
  }
  const v = o[field];
  if (v === null) return null;
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    ctx.err(field, `Må være et tall eller null (fikk ${JSON.stringify(v)}).`);
    return null;
  }
  if (opts.min !== undefined && v < opts.min) {
    ctx.err(field, `Kan ikke være lavere enn ${opts.min} (fikk ${v}).`);
    return null;
  }
  if (opts.max !== undefined && v > opts.max) {
    ctx.err(field, `Kan ikke være høyere enn ${opts.max} (fikk ${v}).`);
    return null;
  }
  if (opts.int && !Number.isInteger(v)) {
    ctx.err(field, `Må være et heltall (fikk ${v}).`);
    return null;
  }
  if (opts.pct && v > 0 && v < 1) {
    ctx.warn(field, `Verdien ${v} tolkes som ${v} % fordi v1 bruker prosentpoeng. Mente du ${v * 100} %?`);
  }
  return v;
}

function readString(ctx: Ctx, o: Obj, field: string): string | null {
  if (!(field in o) || o[field] === null) return null;
  const v = o[field];
  if (typeof v !== 'string') {
    ctx.err(field, `Må være tekst (fikk ${JSON.stringify(v)}).`);
    return null;
  }
  return v;
}

function readDateTime(ctx: Ctx, o: Obj, field: string, opts: { dateOnlyHour?: number } = {}): string | null {
  const s = readString(ctx, o, field);
  if (s === null || s.trim() === '') return null;
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    if (opts.dateOnlyHour === undefined) {
      ctx.warn(field, 'Bare dato er oppgitt – klokkeslett er ukjent og satt til 12:00 for visning i kalenderen.');
      return osloAt(t, 12).toISOString();
    }
    return osloAt(t, opts.dateOnlyHour).toISOString();
  }
  const ms = Date.parse(t);
  if (Number.isNaN(ms)) {
    ctx.err(field, `Ugyldig dato/tid «${t}». Bruk ISO 8601, f.eks. 2026-11-03T17:00:00+01:00.`);
    return null;
  }
  return new Date(ms).toISOString();
}

function readDateKey(ctx: Ctx, o: Obj, field: string): string | null {
  const s = readString(ctx, o, field);
  if (s === null || s.trim() === '') return null;
  const m = s.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  if (!m) {
    ctx.err(field, `Ugyldig dato «${s}». Bruk ÅÅÅÅ-MM-DD.`);
    return null;
  }
  return m[1];
}

const WORK_ALIASES: Record<string, WorkStatus> = {
  vurderes: 'vurderes',
  til_vurdering: 'vurderes',
  visning_planlagt: 'visning_planlagt',
  planlagt_visning: 'visning_planlagt',
  bud_vurderes: 'bud_vurderes',
  avvist: 'avvist',
  kjopt: 'kjopt',
};

export function mapWorkStatus(ctx: Ctx, raw: unknown): WorkStatus {
  if (raw === undefined || raw === null || raw === '') {
    ctx.warn('status', 'Arbeidsstatus mangler – satt til «Vurderes».');
    return 'vurderes';
  }
  if (typeof raw !== 'string') {
    ctx.err('status', `Arbeidsstatus må være tekst (fikk ${JSON.stringify(raw)}).`);
    return 'vurderes';
  }
  const n = norm(raw);
  if (WORK_ALIASES[n]) return WORK_ALIASES[n];
  if ((FACT_STATUSES as readonly string[]).includes(n) || (CHECK_STATUSES as readonly string[]).includes(n)) {
    ctx.err(
      'status',
      `«${raw}» er en faktastatus (dokumentasjonsstatus) og kan ikke brukes som arbeidsstatus. Dokumentasjonsstatus hører hjemme i «checks» eller «analysis.facts». Gyldige arbeidsstatuser: ${WORK_STATUSES.join(', ')}.`,
    );
    return 'vurderes';
  }
  if ((SALE_STATUSES as readonly string[]).includes(n)) {
    ctx.err('status', `«${raw}» er annonsens salgsstatus, ikke din arbeidsstatus. Salgsstatus hentes fra annonsen. Gyldige arbeidsstatuser: ${WORK_STATUSES.join(', ')}.`);
    return 'vurderes';
  }
  ctx.err('status', `Ukjent arbeidsstatus «${raw}». Gyldige verdier: ${WORK_STATUSES.join(', ')}.`);
  return 'vurderes';
}

function mapCheckStatus(ctx: Ctx, field: string, raw: unknown): CheckStatus | null {
  if (typeof raw !== 'string') {
    ctx.err(field, `Dokumentasjonsstatus må være tekst (fikk ${JSON.stringify(raw)}).`);
    return null;
  }
  const n = norm(raw);
  if ((CHECK_STATUSES as readonly string[]).includes(n)) return n as CheckStatus;
  if (n === 'uavklart' || n === 'ukjent') {
    ctx.warn(field, `«${raw}» tolkes som «Mangler» (ikke dokumentert).`);
    return 'mangler';
  }
  if (n === 'anslag') {
    ctx.err(field, '«anslag» er en faktastatus for tall, ikke en dokumentasjonsstatus. Bruk dokumentert, delvis, mangler eller ikke_relevant.');
    return null;
  }
  if (WORK_ALIASES[n]) {
    ctx.err(field, `«${raw}» er en arbeidsstatus og kan ikke brukes som dokumentasjonsstatus. Gyldige: ${CHECK_STATUSES.join(', ')}.`);
    return null;
  }
  ctx.err(field, `Ukjent dokumentasjonsstatus «${raw}». Gyldige: ${CHECK_STATUSES.join(', ')}.`);
  return null;
}

function mapFactStatus(ctx: Ctx, field: string, raw: unknown, fallback: FactStatus): FactStatus {
  if (raw === undefined || raw === null) return fallback;
  if (typeof raw !== 'string') {
    ctx.err(field, `Faktastatus må være tekst.`);
    return fallback;
  }
  const n = norm(raw);
  if ((FACT_STATUSES as readonly string[]).includes(n)) return n as FactStatus;
  if (WORK_ALIASES[n]) {
    ctx.err(field, `«${raw}» er en arbeidsstatus og kan ikke brukes som faktastatus. Gyldige: ${FACT_STATUSES.join(', ')}.`);
    return fallback;
  }
  ctx.err(field, `Ukjent faktastatus «${raw}». Gyldige: ${FACT_STATUSES.join(', ')}.`);
  return fallback;
}

function mapEnum<T extends string>(ctx: Ctx, field: string, raw: unknown, valid: readonly T[], aliases: Record<string, T> = {}): T | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string') {
    ctx.err(field, `Må være tekst (fikk ${JSON.stringify(raw)}).`);
    return null;
  }
  const n = norm(raw);
  if ((valid as readonly string[]).includes(n)) return n as T;
  if (aliases[n]) return aliases[n];
  ctx.err(field, `Ukjent verdi «${raw}». Gyldige verdier: ${valid.join(', ')}.`);
  return null;
}

const PRIORITY_ALIASES: Record<string, Priority> = { required: 'pakrevd', paakrevd: 'pakrevd', recommended: 'anbefalt', verdiokende: 'verdiokende', valgfritt: 'valgfri', optional: 'valgfri' };
const RISK_ALIASES: Record<string, RiskCategory> = Object.fromEntries(
  Object.entries(RISK_CATEGORY_LABEL).map(([k, label]) => [norm(label), k as RiskCategory]),
) as Record<string, RiskCategory>;
Object.assign(RISK_ALIASES, { bad: 'vatrom', el: 'elektrisk', elektro: 'elektrisk', ror: 'vann_avlop', tak: 'tak_fasade', fukt: 'fukt_grunn', borettslag: 'sameie_borettslag', sameie: 'sameie_borettslag', okonomi: 'finansiering' });
const COMP_ALIASES: Record<string, ComparableKind> = { sold: 'solgt', asking: 'prisantydning', listing: 'prisantydning', aktiv: 'prisantydning', solgt_uten_pris: 'solgt_uten_sum' };
const REC_ALIASES: Record<string, Recommendation> = { folg_med: 'folg_med', avklar_forst: 'avklar_forst', avsta: 'avsta', interesting: 'interessant' };
const TYPE_ALIASES: Record<string, PropertyType> = { hus: 'enebolig', house: 'enebolig', apartment: 'leilighet', rekkehus: 'rekkehus' };
const TENURE_ALIASES: Record<string, Tenure> = { andel: 'borettslag', aksjeleilighet: 'aksje', eier: 'selveier' };
const BASIS_ALIASES: Record<string, PriceBasis> = { cash: 'kontant', kontantpris: 'kontant', totalpris: 'total', inkl_fellesgjeld: 'total' };

function checklistKeyFor(raw: unknown): ChecklistKey | null {
  if (typeof raw !== 'string') return null;
  const n = norm(raw);
  if ((CHECKLIST_KEYS as readonly string[]).includes(n)) return n as ChecklistKey;
  for (const key of CHECKLIST_KEYS) {
    const label = norm(CHECKLIST_LABEL[key]);
    if (label === n || label.startsWith(n) || n.startsWith(norm(CHECKLIST_LABEL[key].split(',')[0]))) return key;
  }
  return null;
}

let counter = 0;
const localId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export interface AdapterObjectResult {
  index: number;
  sourceId: string;
  name: string;
  finnId: string | null;
  errors: ImportMessage[];
  warnings: ImportMessage[];
  unmapped: Record<string, unknown>;
  mapped: MappedV1Object | null;
  original: unknown;
}

export interface AdapterResult {
  version: number | null;
  rootErrors: ImportMessage[];
  rootWarnings: ImportMessage[];
  objects: AdapterObjectResult[];
}

export function parseV1Import(text: string, byteLength: number, defaults: ProfileDefaults): AdapterResult {
  const rootErrors: ImportMessage[] = [];
  const rootWarnings: ImportMessage[] = [];
  const fail = (message: string, path = '$'): AdapterResult => ({ version: null, rootErrors: [...rootErrors, { path, message }], rootWarnings, objects: [] });

  if (byteLength > V1_LIMITS.maxBytes) return fail(`Filen er ${Math.round(byteLength / 1024)} kB. Maksimal størrelse er 1 MB per import.`);
  let body = text;
  if (body.charCodeAt(0) === 0xfeff) body = body.slice(1);
  if (body.includes('�')) rootWarnings.push({ path: '$', message: 'Filen inneholder tegn som ikke er gyldig UTF-8. Kontroller æ, ø og å i forhåndsvisningen.' });
  let root: unknown;
  try {
    root = JSON.parse(body);
  } catch (e) {
    return fail(`Ugyldig JSON: ${(e as Error).message}`);
  }
  if (!isObj(root)) return fail('Roten må være et objekt: {"format":"flipprom-analysis","version":1,"objects":[]}.');
  if (root.format !== V1_FORMAT) return fail(`Ukjent format ${JSON.stringify(root.format)}. Forventet "${V1_FORMAT}".`, '$.format');
  if (root.version !== 1) return fail(`Versjon ${JSON.stringify(root.version)} støttes ikke. Denne importen støtter version 1.`, '$.version');
  if (!Array.isArray(root.objects)) return fail('«objects» må være en liste.', '$.objects');
  if (root.objects.length > V1_LIMITS.maxObjects) return fail(`Importen har ${root.objects.length} objekter. Maks ${V1_LIMITS.maxObjects} per import.`, '$.objects');
  for (const k of Object.keys(root)) if (!['format', 'version', 'objects'].includes(k)) rootWarnings.push({ path: `$.${k}`, message: 'Ukjent felt på rotnivå ignoreres.' });

  const objects = root.objects.map((o, i) => mapObject(o, i, defaults));
  const seen = new Map<string, number>();
  for (const o of objects) {
    if (!o.finnId) continue;
    if (seen.has(o.finnId)) o.errors.push({ path: `objects[${o.index}].url`, message: `Samme FINN-kode som objects[${seen.get(o.finnId)}]. Hvert objekt kan bare importeres én gang per fil.` });
    else seen.set(o.finnId, o.index);
  }
  for (const o of objects) if (o.errors.length > 0) o.mapped = null;
  return { version: 1, rootErrors, rootWarnings, objects };
}

function mapObject(raw: unknown, index: number, defaults: ProfileDefaults): AdapterObjectResult {
  const ctx = new Ctx(`objects[${index}]`);
  const result = (partial: Partial<AdapterObjectResult>): AdapterObjectResult => ({
    index,
    sourceId: String(isObj(raw) ? raw.id ?? index : index),
    name: isObj(raw) && typeof raw.name === 'string' ? raw.name : `Objekt ${index + 1}`,
    finnId: null,
    errors: ctx.errors,
    warnings: ctx.warnings,
    unmapped: {},
    mapped: null,
    original: raw,
    ...partial,
  });
  if (!isObj(raw)) {
    ctx.errors.push({ path: ctx.base, message: 'Hvert objekt må være et JSON-objekt.' });
    return result({});
  }
  const o = raw;
  const unmapped: Record<string, unknown> = {};
  for (const k of Object.keys(o)) if (!(V1_OBJECT_FIELDS as readonly string[]).includes(k)) unmapped[k] = o[k];
  if (Object.keys(unmapped).length) ctx.warn('*', `Felt uten kjent mapping bevares i originaldata, men brukes ikke: ${Object.keys(unmapped).join(', ')}.`);

  if (!('id' in o) || (typeof o.id !== 'string' && typeof o.id !== 'number')) ctx.err('id', 'Mangler id (tekst eller tall).');
  const name = readString(ctx, o, 'name');
  if (!name) ctx.err('name', 'Mangler navn/adresse.');

  const urlRaw = readString(ctx, o, 'url');
  let finnId: string | null = null;
  let canonicalUrl = '';
  if (!urlRaw) ctx.err('url', 'Mangler FINN-lenke. Objektet kan ikke kobles til en eiendom uten FINN-kode.');
  else {
    const parsed = parseFinnUrl(urlRaw);
    if (parsed.ok) {
      finnId = parsed.finnId;
      canonicalUrl = parsed.canonicalUrl;
    } else ctx.err('url', parsed.message);
  }

  const propertyType = mapEnum(ctx, 'type', o.type, PROPERTY_TYPES, TYPE_ALIASES);
  if (typeof o.type === 'string' && norm(o.type) === 'hus') ctx.warn('type', '«hus» er tolket som enebolig. Endre ved behov.');
  const tenure = mapEnum(ctx, 'tenure', o.tenure, TENURES, TENURE_ALIASES) ?? 'ukjent';
  const workStatus = mapWorkStatus(ctx, o.status);

  const money = (f: string) => readNumber(ctx, o, f, { min: 0 });
  const pct = (f: string, max = 100) => readNumber(ctx, o, f, { min: 0, max, pct: true });
  readNumber(ctx, o, 'area', { min: 0 });
  const asking = money('asking');
  const purchase = money('purchase');
  const debt = money('debt');
  const exitDebt = money('exitDebt');
  const saleBasis = mapEnum(ctx, 'saleBasis', o.saleBasis, ['kontant', 'total'] as const, BASIS_ALIASES);
  if (!saleBasis && !ctx.errors.some((e) => e.path.endsWith('.saleBasis'))) ctx.warn('saleBasis', 'Prisgrunnlag for salg mangler – antatt kontantpris. Kontroller dette.');
  const basis: PriceBasis = saleBasis ?? 'kontant';
  const bear = money('bear');
  const base = money('base');
  const bull = money('bull');
  const rehab = money('rehab');
  const buffer = pct('buffer', 200);
  const duty = pct('duty', 10);
  const dutyBase = money('dutyBase');
  const buyFees = money('buyFees');
  const saleFixed = money('saleFixed');
  const salePercent = pct('salePercent', 10);
  const monthly = money('monthly');
  const months = readNumber(ctx, o, 'months', { min: 0.5, max: 60 });
  const interest = pct('interest', 30);
  const financing = pct('financing', 100);
  const target = readNumber(ctx, o, 'target');
  const hours = readNumber(ctx, o, 'hours', { min: 0 });
  const hourRate = money('hourRate');
  const tax = pct('tax', 100);
  const startBid = money('startBid');
  const walkAway = money('walkAway');
  const strategy = readString(ctx, o, 'strategy') ?? '';
  const notes = readString(ctx, o, 'notes') ?? '';
  const viewing = readDateTime(ctx, o, 'viewing');
  const bidDay = readDateTime(ctx, o, 'bidDay', { dateOnlyHour: 12 });
  let confirmed = false;
  if ('confirmed' in o && o.confirmed !== null) {
    if (typeof o.confirmed !== 'boolean') ctx.err('confirmed', 'Må være true, false eller null.');
    else confirmed = o.confirmed;
  }
  const sourceText = readString(ctx, o, 'source');
  const sourceDate = readDateKey(ctx, o, 'sourceDate');
  const history = {
    historicalMax: readNumber(ctx, o, 'historicalMax'),
    historicalProfit: readNumber(ctx, o, 'historicalProfit'),
    historicalSale: readNumber(ctx, o, 'historicalSale'),
  };

  // Tiltak
  const items: RenovationItem[] = [];
  if ('tasks' in o && o.tasks !== null) {
    if (!Array.isArray(o.tasks)) ctx.err('tasks', 'Må være en liste.');
    else
      o.tasks.forEach((t, j) => {
        const tc = new Ctx(`${ctx.base}.tasks[${j}]`);
        if (!isObj(t)) {
          tc.errors.push({ path: tc.base, message: 'Hvert tiltak må være et objekt.' });
        } else {
          const priority = mapEnum(tc, 'priority', t.priority, PRIORITIES, PRIORITY_ALIASES) ?? 'anbefalt';
          let included = true;
          if ('included' in t && t.included !== null) {
            if (typeof t.included !== 'boolean') tc.err('included', 'Må være true eller false.');
            else included = t.included;
          }
          items.push({
            id: localId('item'),
            room: readString(tc, t, 'room') ?? '',
            title: readString(tc, t, 'title') ?? 'Tiltak',
            materials: readNumber(tc, t, 'materials', { min: 0 }),
            electrician: readNumber(tc, t, 'electrician', { min: 0 }),
            plumber: readNumber(tc, t, 'plumber', { min: 0 }),
            other: readNumber(tc, t, 'other', { min: 0 }),
            hours: readNumber(tc, t, 'hours', { min: 0 }),
            priority,
            included,
          });
        }
        ctx.errors.push(...tc.errors);
        ctx.warnings.push(...tc.warnings);
      });
  }
  const useItems = items.length > 0;
  if (useItems && rehab !== null) ctx.warn('rehab', 'Både «rehab» (rundsum) og «tasks» er oppgitt. Tiltakene brukes; rundsummen bevares i originaldata men summeres ikke i tillegg.');
  if (useItems && hours !== null) {
    const sum = items.filter((i) => i.included).reduce((s, i) => s + (i.hours ?? 0), 0);
    if (Math.abs(sum - hours) > 0.5) ctx.warn('hours', `«hours» (${hours}) avviker fra summen av inkluderte tiltak (${sum}). Tiltakenes timer brukes.`);
  }

  // Dokumentavgift: eksplisitt modellregel, ikke låst til opprinnelig pris.
  const defaultRule = defaultDutyRule(tenure);
  let dutyRule: DutyRule = { ...defaultRule, ratePct: duty ?? defaultRule.ratePct };
  if (duty === null && 'duty' in o) dutyRule = { ...defaultRule, ratePct: null, note: 'Sats var null i importen – ikke avklart.' };
  if (dutyBase !== null) {
    const d0 = debt ?? 0;
    const matches = (p: number | null) => p !== null && Math.abs(dutyBase - p) < 1;
    if (matches(purchase !== null ? purchase + d0 : null) || matches(asking !== null ? asking + d0 : null)) {
      dutyRule = { ...dutyRule, basis: 'kjopesum_pluss_fellesgjeld', customBase: null, note: 'Importert grunnlag tilsvarte kjøpesum + fellesgjeld og følger nå kjøpsprisen.' };
    } else if (matches(purchase) || matches(asking)) {
      dutyRule = { ...dutyRule, basis: 'kjopesum', customBase: null, note: 'Importert grunnlag tilsvarte kjøpesum og følger nå kjøpsprisen.' };
    } else {
      dutyRule = { ...dutyRule, basis: 'egendefinert', customBase: dutyBase, note: 'Eget avgiftsgrunnlag fra import. Endres ikke automatisk med kjøpspris.' };
      ctx.warn('dutyBase', 'Avgiftsgrunnlaget avviker fra kjøpesum (+ fellesgjeld) og lagres som eget grunnlag. Det følger ikke kjøpsprisen automatisk.');
    }
  }
  if (tenure === 'borettslag' && (duty ?? 0) > 0) ctx.warn('duty', 'Dokumentavgift er oppgitt for en borettslagsandel. Kontroller om dette er riktig.');

  // Sjekkliste
  const checks = new Map<ChecklistKey, ChecklistItem>();
  if ('checks' in o && o.checks !== null) {
    if (!Array.isArray(o.checks)) ctx.err('checks', 'Må være en liste.');
    else
      o.checks.forEach((c, j) => {
        const path = `checks[${j}]`;
        if (!isObj(c)) return ctx.err(path, 'Hvert sjekkpunkt må være et objekt.');
        const key = checklistKeyFor(c.key ?? c.title);
        if (!key) {
          unmapped[`checks[${j}]`] = c;
          return ctx.warn(path, `Ukjent sjekkpunkt ${JSON.stringify(c.key ?? c.title)} – bevares i originaldata.`);
        }
        const status = mapCheckStatus(ctx, `${path}.status`, c.status);
        if (!status) return;
        checks.set(key, { key, status, note: typeof c.note === 'string' ? c.note : 'Importert.', sourceId: null, beforeBidTask: null });
      });
  }
  const checklist: ChecklistItem[] = CHECKLIST_KEYS.map(
    (key) => checks.get(key) ?? { key, status: 'mangler', note: 'Ikke oppgitt i importen.', sourceId: null, beforeBidTask: null },
  );

  // Risiko
  const risks: Risk[] = [];
  if ('risks' in o && o.risks !== null) {
    if (!Array.isArray(o.risks)) ctx.err('risks', 'Må være en liste.');
    else
      o.risks.forEach((r, j) => {
        const rc = new Ctx(`${ctx.base}.risks[${j}]`);
        if (!isObj(r)) rc.errors.push({ path: rc.base, message: 'Hver risiko må være et objekt.' });
        else {
          const category = mapEnum(rc, 'category', r.category, RISK_CATEGORIES, RISK_ALIASES) ?? 'annet';
          const level = readNumber(rc, r, 'level', { min: 1, max: 10, int: true });
          const cost = readNumber(rc, r, 'cost', { min: 0 });
          risks.push({
            id: localId('risk'),
            title: readString(rc, r, 'title') ?? 'Risiko',
            category,
            level,
            costLow: null,
            costHigh: cost,
            rationale: readString(rc, r, 'source') ? `Kilde oppgitt i import: ${String(r.source)}` : 'Importert.',
            sourceId: null,
            action: readString(rc, r, 'action') ?? '',
          });
        }
        ctx.errors.push(...rc.errors);
        ctx.warnings.push(...rc.warnings);
      });
  }

  // Sammenligninger
  const comparables: ComparableSale[] = [];
  if ('comps' in o && o.comps !== null) {
    if (!Array.isArray(o.comps)) ctx.err('comps', 'Må være en liste.');
    else
      o.comps.forEach((c, j) => {
        const cc = new Ctx(`${ctx.base}.comps[${j}]`);
        if (!isObj(c)) cc.errors.push({ path: cc.base, message: 'Hver sammenligning må være et objekt.' });
        else {
          let kind = mapEnum(cc, 'kind', c.kind, COMPARABLE_KINDS, COMP_ALIASES) ?? 'prisantydning';
          if (!c.kind) cc.warn('kind', 'Type mangler – behandlet som prisantydning (ikke dokumentert salg).');
          const price = readNumber(cc, c, 'price', { min: 0 });
          if (kind === 'solgt' && price === null) {
            kind = 'solgt_uten_sum';
            cc.warn('price', 'Solgt uten salgssum er ikke dokumentasjon på oppnådd pris – markert «salgssum ikke dokumentert».');
          }
          cc.warn('priceBasis', `Prisgrunnlag er ikke oppgitt i v1 – antatt ${basis === 'total' ? 'totalpris' : 'kontantpris'} som objektet.`);
          comparables.push({
            id: localId('comp'),
            name: readString(cc, c, 'name') ?? 'Sammenligning',
            url: readString(cc, c, 'url'),
            kind,
            ...pricesFromLegacy({ kind, price, priceBasis: basis, debt: null }),
            commonCosts: null,
            area: readNumber(cc, c, 'area', { min: 0 }) || null,
            date: readDateKey(cc, c, 'date'),
            notes: readString(cc, c, 'notes') ?? '',
            sourceId: null,
            isDemo: false,
          });
        }
        ctx.errors.push(...cc.errors);
        ctx.warnings.push(...cc.warnings.filter((w) => !w.path.endsWith('priceBasis') || j === 0));
      });
  }

  // analysis-blokken
  const a = isObj(o.analysis) ? o.analysis : {};
  if ('analysis' in o && o.analysis !== null && !isObj(o.analysis)) ctx.err('analysis', 'Må være et objekt.');
  for (const k of Object.keys(a)) if (!V1_ANALYSIS_FIELDS.includes(k)) unmapped[`analysis.${k}`] = a[k];
  const ac = new Ctx(`${ctx.base}.analysis`);
  const recommendation = mapEnum(ac, 'recommendation', a.recommendation, RECOMMENDATIONS, REC_ALIASES);
  if (!a.recommendation) ac.warn('recommendation', 'Anbefaling mangler – vises som «Ikke vurdert».');
  const summary = typeof a.summary === 'string' ? a.summary : '';
  const strList = (field: string): string[] => {
    const v = a[field];
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v)) {
      ac.err(field, 'Må være en liste med tekst.');
      return [];
    }
    return v.filter((x): x is string => typeof x === 'string');
  };
  let report: ReportSection[] = [];
  if (typeof a.report === 'string') report = [{ title: 'Importert rapport', body: a.report }];
  else if (Array.isArray(a.report)) report = a.report.filter(isObj).map((r) => ({ title: String(r.title ?? 'Avsnitt'), body: String(r.body ?? '') }));
  const sources: Source[] = [];
  if (sourceText) {
    sources.push({ id: localId('src'), kind: 'annet', title: 'Kilde oppgitt i import (ikke verifisert)', url: /^https?:\/\//.test(sourceText) ? sourceText : null, documentName: /^https?:\/\//.test(sourceText) ? null : sourceText, page: null, fetchedAt: null, observedAt: sourceDate, status: 'uavklart', isDemo: false });
  }
  if (Array.isArray(a.sources)) {
    a.sources.forEach((s, j) => {
      if (typeof s === 'string') sources.push({ id: localId('src'), kind: 'annet', title: s, url: /^https?:\/\//.test(s) ? s : null, documentName: null, page: null, fetchedAt: null, observedAt: null, status: 'uavklart', isDemo: false });
      else if (isObj(s))
        sources.push({
          id: localId('src'),
          kind: 'annet',
          title: String(s.title ?? s.name ?? 'Kilde'),
          url: typeof s.url === 'string' ? s.url : null,
          documentName: typeof s.document === 'string' ? s.document : null,
          page: typeof s.page === 'number' && Number.isInteger(s.page) && s.page > 0 ? s.page : null,
          fetchedAt: null,
          observedAt: typeof s.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s.date) ? s.date.slice(0, 10) : null,
          status: mapFactStatus(ac, `sources[${j}].status`, s.status, 'uavklart'),
          isDemo: false,
        });
    });
  }
  const facts: AnalysisFact[] = [];
  if (Array.isArray(a.facts))
    a.facts.forEach((f, j) => {
      if (!isObj(f)) return;
      facts.push({ label: String(f.label ?? f.name ?? 'Opplysning'), value: String(f.value ?? ''), status: mapFactStatus(ac, `facts[${j}].status`, f.status, 'uavklart'), sourceId: null });
    });
  const bidSteps: BidStep[] = Array.isArray(a.bidSteps)
    ? a.bidSteps.map((b) => (typeof b === 'string' ? { title: b, detail: '', condition: null } : isObj(b) ? { title: String(b.title ?? 'Steg'), detail: String(b.detail ?? ''), condition: typeof b.condition === 'string' ? b.condition : null } : { title: String(b), detail: '', condition: null }))
    : [];
  ctx.errors.push(...ac.errors);
  ctx.warnings.push(...ac.warnings);

  const options: RenovationOption[] = [];
  if (useItems)
    options.push({ id: localId('opt'), level: 'hoved', title: 'Importerte tiltak', description: 'Tiltak fra importfilen.', items, suggestedMonths: months, saleEffectNote: '', requiresApproval: false, vatIncluded: true });

  const values: ScenarioValues = {
    buyerType: propertyType && propertyCategory(propertyType) === 'hus' ? defaults.buyerTypeHouse : defaults.buyerTypeApartment,
    purchasePrice: purchase,
    debtAtPurchase: debt,
    debtAtSale: exitDebt,
    dutyBasis: dutyRule.basis,
    dutyPct: dutyRule.ratePct,
    dutyCustomBase: dutyRule.customBase,
    buyFees,
    renovationMode: useItems ? 'tiltak' : 'rundsum',
    renovationOptionId: options[0]?.id ?? null,
    renovationItems: items,
    renovationLumpSum: useItems ? null : rehab,
    lumpSumHours: useItems ? null : hours,
    vatIncluded: true,
    reservePct: buffer,
    months,
    monthlyCost: monthly,
    interestPct: interest,
    financingPct: financing,
    saleBasis: basis,
    saleLow: bear,
    saleBase: base,
    saleHigh: bull,
    saleFixedCost: saleFixed,
    saleCommissionPct: salePercent,
    hourValue: hourRate,
    profitTarget: target,
    taxMode: tax === null ? 'uavklart' : 'antatt',
    taxPct: tax,
    startBid,
    walkAway,
    notes,
  };
  if (ctx.missing.length) ctx.warn('*', `Felt som ikke finnes i objektet behandles som ukjent (ikke 0): ${ctx.missing.join(', ')}.`);

  const mapped: MappedV1Object | null =
    finnId && name
      ? {
          finnId,
          canonicalUrl,
          name,
          propertyType,
          tenure,
          workStatus,
          notes,
          values,
          draft: {
            version: 1,
            schemaVersion: ANALYSIS_SCHEMA_VERSION,
            modelVersion: CALC_MODEL_VERSION,
            status: 'draft',
            visibility: 'private',
            origin: 'import_v1',
            publishedAt: null,
            recommendation,
            recommendationRationale: summary,
            summary,
            strategy,
            conditions: [],
            estimates: {
              sale: { basis, low: bear, base, high: bull, rationaleLow: '', rationaleBase: '', rationaleHigh: '', includesMarketGrowth: false },
              renovationOptions: options,
              defaultRenovationOptionId: options[0]?.id ?? null,
              months,
              monthlyTotal: monthly,
              monthlyBreakdown: [{ label: 'Månedlige kostnader (importert)', amount: monthly }],
              buyFees,
              debtAtSale: exitDebt,
              suggestedPurchasePrice: purchase,
              dutyRule,
            },
            risks,
            checklist,
            comparables,
            sources,
            facts: [
              ...(asking !== null ? [{ label: 'Prisantydning (importert)', value: `${asking} kr`, status: 'uavklart' as const, sourceId: null }] : []),
              ...facts,
            ],
            assumptions: strList('assumptions'),
            uncertainties: strList('uncertainties'),
            report,
            bidSteps,
            nextSteps: [],
            rawImport: raw,
            unmappedFields: unmapped,
            history,
          },
          viewing: viewing ? { start: viewing, confirmed } : null,
          bidDay,
          history,
        }
      : null;

  return result({ name: name ?? `Objekt ${index + 1}`, finnId, unmapped, mapped: ctx.errors.length ? null : mapped });
}
