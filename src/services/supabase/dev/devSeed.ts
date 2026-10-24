import { deterministicUuid } from '../../../data/analysisBuilder';
import type { DbState } from '../../../data/db';
import { analysisToRow, calendarOverrideToRow, privateEventToRow, propertyToRow, scenarioToRow, snapshotToRow, userPropertyToRow, userRiskToRow, viewingToRow } from './rowWriters';

/**
 * Utviklingsdata (dev-seed): lager SQL som legger demoens deterministiske data inn i en Supabase-/Postgres-database for ÉN bestemt bruker, slik at
 * Oversikt og scenarioflyten kan prøves i produksjonsmodus før analysetjenesten finnes. Dette er det backend (service_role) senere gjør når en bruker
 * kobles til en analyse – klienten kan ikke gjøre det (migrasjon 9). SQL-en kjøres av en person med tilgang (SQL-editor som postgres); ingenting kjøres herfra.
 *
 * Sikkerhet: ingen hemmeligheter, ingen sletting, bare `insert … on conflict do nothing`, bare for brukeren som oppgis, og bare i et prosjekt der
 * brukeren allerede finnes i auth.users. Feltene som er private for demobrukeren (scenarioer, notater osv.) kopieres til den oppgitte brukeren.
 */
export interface DevSeedOptions {
  /** Demobrukeren hvis data kopieres (se DEMO_USERS i data/seed.ts). */
  sourceUserId: string;
  /** Hvilke demoobjekter (FINN-ID) som tas med. Standard: alle brukerens. */
  finnIds?: string[];
  /** Ta også med privat kalender-/risikodata (private visninger, buddag-overstyring, risikoendringer). Standard: ja. */
  includePrivateExtras?: boolean;
  /**
   * Brukes til å utlede id-ene til brukerens PRIVATE rader (liste, scenarioer, hendelser, risikoer, private utkast): stabile per nøkkel (kjøring to ganger gir
   * ingen endring), men ulike mellom brukere. Uten nøkkel beholdes demoens id-er (test med én bruker). Felles data (eiendom, snapshot, analyse, visning)
   * beholder alltid de delte id-ene, slik at flere brukere deler dem. Uten ulike id-er ville `on conflict do nothing` stille hoppet over en annen brukers rader.
   */
  idKey?: string;
}

type Row = Record<string, unknown>;

const IDENT = /^[a-z_][a-z0-9_]*$/;
const q = (c: string) => {
  if (!IDENT.test(c)) throw new Error(`Ugyldig kolonnenavn: ${c}`);
  return `"${c}"`;
};

/** Plassholder for brukerens id i generert JSON; erstattes i SQL med den ekte auth.users-id-en når skriptet kjøres (se devSeedScript). */
export const SEED_USER_PLACEHOLDER = '5eed5eed-5eed-45ee-85ee-d5eed5eed5ee';
const SEED_USER_EXPR = "current_setting('flippsjekk.seed_user')";

/**
 * `insert … select … from jsonb_populate_recordset(…)`: typene kommer fra tabellen, så jsonb, tidspunkt og tall får riktig type.
 * Med `replaceUser` erstattes plassholderen i JSON-teksten med brukerens id (kjent først ved kjøring).
 */
export function insertSql(table: string, rows: Row[], replaceUser = false): string {
  if (rows.length === 0) return '';
  if (!IDENT.test(table)) throw new Error(`Ugyldig tabellnavn: ${table}`);
  const cols = Object.keys(rows[0]);
  const json = JSON.stringify(rows);
  if (json.includes('$flippsjekk$')) throw new Error('JSON-data inneholder avgrenseren $flippsjekk$.');
  const list = cols.map(q).join(', ');
  const literal = `$flippsjekk$${json}$flippsjekk$`;
  const text = replaceUser ? `replace(${literal}, '${SEED_USER_PLACEHOLDER}', ${SEED_USER_EXPR})` : literal;
  return `insert into public.${table} (${list})\nselect ${list} from jsonb_populate_recordset(null::public.${table}, ${text}::jsonb)\non conflict do nothing;`;
}

export interface DevSeed {
  /** SQL-setninger i riktig rekkefølge (fremmednøkler og sammensatte nøkler). `__USER_ID__` erstattes av brukerens auth.users-id. */
  statements: string[];
  counts: Record<string, number>;
  finnIds: string[];
}

/**
 * Bygger seed-setningene for én bruker fra mockens DbState (rene data, ingen kall mot database). `userId` er den ekte auth.users-id-en
 * (tester), eller `SEED_USER_PLACEHOLDER` sammen med `replaceUser: true` når id-en først er kjent ved kjøring (se devSeedScript).
 */
export function buildDevSeed(state: DbState, userId: string, opts: DevSeedOptions & { replaceUser?: boolean }): DevSeed {
  const ru = opts.replaceUser === true;
  const userSql = ru ? `${SEED_USER_EXPR}::uuid` : `'${userId}'`;
  const rid = (id: string): string => (opts.idKey ? deterministicUuid(`devseed:${opts.idKey.toLowerCase()}:${id}`) : id);
  const links = state.userProperties.filter((l) => l.userId === opts.sourceUserId);
  const wanted = opts.finnIds ? new Set(opts.finnIds) : null;
  const chosen = links.filter((l) => {
    const p = state.properties.find((x) => x.id === l.propertyId);
    return p && (!wanted || wanted.has(p.finnId));
  });
  const pids = new Set(chosen.map((l) => l.propertyId));
  const own = <T extends { id: string; userId: string; propertyId: string }>(xs: T[]) => xs.filter((x) => x.userId === opts.sourceUserId && pids.has(x.propertyId)).map((x) => ({ ...x, id: rid(x.id), userId }));

  const properties = state.properties.filter((p) => pids.has(p.id));
  const snapshots = state.snapshots.filter((s) => pids.has(s.propertyId));
  const viewings = state.viewings.filter((v) => pids.has(v.propertyId));
  // Felles analyser (publiserte/erstattede) og ev. brukerens egne private utkast.
  const analyses = state.analyses
    .filter((a) => pids.has(a.propertyId) && ((a.visibility === 'shared' && a.status !== 'draft') || (a.visibility === 'private' && a.ownerId === opts.sourceUserId)))
    .map((a) => (a.visibility === 'private' ? { ...a, id: rid(a.id), ownerId: userId } : a));
  const privateAnalysisIds = new Set(state.analyses.filter((a) => a.visibility === 'private').map((a) => a.id));
  const analysisIds = new Set(analyses.map((a) => a.id));
  const scenarios = state.scenarios
    .filter((s) => s.ownerId === opts.sourceUserId && pids.has(s.propertyId) && (analysisIds.has(s.analysisId) || analysisIds.has(rid(s.analysisId))))
    .map((s) => ({ ...s, id: rid(s.id), ownerId: userId, analysisId: privateAnalysisIds.has(s.analysisId) ? rid(s.analysisId) : s.analysisId }));
  const scenarioIds = new Set(scenarios.map((s) => s.id));
  // Listen opprettes uten primærscenario (sammensatt fremmednøkkel mot scenarios), som settes etter at scenarioene finnes.
  const userProperties = chosen.map((l) => ({ ...l, id: rid(l.id), userId, primaryScenarioId: l.primaryScenarioId ? rid(l.primaryScenarioId) : null }));
  const primaries = userProperties.filter((l) => l.primaryScenarioId && scenarioIds.has(l.primaryScenarioId));

  const extras = opts.includePrivateExtras !== false;
  const privateEvents = extras ? own(state.privateEvents) : [];
  const calendarOverrides = extras ? own(state.calendarOverrides) : [];
  const userRisks = extras ? own(state.userRisks) : [];

  const analysesPrivate = analyses.filter((a) => a.visibility === 'private');
  const analysesShared = analyses.filter((a) => a.visibility === 'shared');

  const statements = [
    insertSql('properties', properties.map(propertyToRow), ru),
    insertSql('property_snapshots', snapshots.map(snapshotToRow), ru),
    insertSql('analyses', analysesShared.map(analysisToRow), ru),
    insertSql('viewings', viewings.map(viewingToRow), ru),
    insertSql('user_properties', userProperties.map((l) => userPropertyToRow({ ...l, primaryScenarioId: null })), ru),
    insertSql('analyses', analysesPrivate.map(analysisToRow), ru),
    insertSql('scenarios', scenarios.map(scenarioToRow), ru),
    ...primaries.map((l) => `update public.user_properties set primary_scenario_id = '${l.primaryScenarioId}' where id = '${l.id}' and user_id = ${userSql} and primary_scenario_id is null;`),
    insertSql('private_events', privateEvents.map(privateEventToRow), ru),
    insertSql('calendar_overrides', calendarOverrides.map(calendarOverrideToRow), ru),
    insertSql('user_risks', userRisks.map(userRiskToRow), ru),
  ].filter(Boolean);

  return {
    statements,
    finnIds: properties.map((p) => p.finnId),
    counts: {
      properties: properties.length,
      property_snapshots: snapshots.length,
      analyses: analyses.length,
      viewings: viewings.length,
      user_properties: userProperties.length,
      scenarios: scenarios.length,
      private_events: privateEvents.length,
      calendar_overrides: calendarOverrides.length,
      user_risks: userRisks.length,
    },
  };
}

/** Hele skriptet for én bruker identifisert med e-post (slås opp i auth.users ved kjøring). Ingenting kjøres her; teksten leveres til en person med tilgang. */
export function devSeedScript(state: DbState, email: string, opts: DevSeedOptions): string {
  const seed = buildDevSeed(state, SEED_USER_PLACEHOLDER, { idKey: email, ...opts, replaceUser: true });
  const safeEmail = email.replace(/'/g, "''");
  return `-- Flippsjekk: utviklingsdata for fase 2B (Oversikt og scenarioer). KUN for utviklingsprosjektet.
-- Kjør som postgres (SQL-editor). Legger demoens objekter inn i listen til brukeren med e-post ${email.replace(/\s+/g, ' ')},
-- som MÅ finnes i auth.users fra før (logg inn én gang gjennom appen først). Bare «insert … on conflict do nothing»: ingenting slettes eller overskrives.
-- Objekter (FINN-ID): ${seed.finnIds.join(', ')}.

begin;

do $seed$
declare
  uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower('${safeEmail}');
  if uid is null then
    raise exception 'Fant ingen bruker med e-post % i auth.users. Logg inn gjennom appen først.', '${safeEmail}';
  end if;
  perform set_config('flippsjekk.seed_user', uid::text, true);
end
$seed$;

${seed.statements.join('\n\n')}

commit;
`;
}
