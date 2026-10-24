import { writeFileSync } from 'node:fs';
import { createSeed, DEMO_USERS } from '../src/data/seed';
import { buildDevSeed, devSeedScript, SEED_USER_PLACEHOLDER } from '../src/services/supabase/dev/devSeed';

/**
 * Lager SQL som legger demoens objekter, analyser og scenarioer inn i listen til ÉN bruker i Supabase-UTVIKLINGSprosjektet (fase 2B):
 *
 *   npm run db:dev-seed -- --email deg@eksempel.no [--alle | --finn 123456,234567] [--ut fil.sql]
 *
 * Skriptet KJØRER ingenting mot noen database og har ingen nøkler: det skriver bare SQL-tekst (til stdout, eller til --ut). Teksten kjøres av en
 * person med tilgang (SQL-editor som postgres). Brukeren må finnes i auth.users fra før (logg inn gjennom appen først). Bare «insert … on conflict
 * do nothing»: ingenting slettes eller overskrives. Dette er det backend (service_role) senere gjør når en bruker kobles til en analyse.
 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const email = arg('email');
if (!email || !/^[^@\s'";]+@[^@\s'";]+$/.test(email)) {
  process.stderr.write('Mangler eller ugyldig --email (e-posten til en bruker som allerede finnes i auth.users).\n');
  process.exit(2);
}

const state = createSeed(new Date());
const source = DEMO_USERS.ada.id;
const ownFinn = state.userProperties
  .filter((l) => l.userId === source)
  .map((l) => state.properties.find((p) => p.id === l.propertyId)!.finnId);
const finnIds = flag('alle') ? ownFinn : arg('finn') ? arg('finn')!.split(',').map((s) => s.trim()) : ownFinn.slice(0, 3);
const unknown = finnIds.filter((f) => !ownFinn.includes(f));
if (unknown.length) {
  process.stderr.write(`Ukjente FINN-ID-er: ${unknown.join(', ')}. Tilgjengelige: ${ownFinn.join(', ')}\n`);
  process.exit(2);
}

const sql = devSeedScript(state, email, { sourceUserId: source, finnIds });
const summary = buildDevSeed(state, SEED_USER_PLACEHOLDER, { sourceUserId: source, finnIds, replaceUser: true });
const out = arg('ut');
if (out) writeFileSync(out, sql, 'utf8');
else process.stdout.write(sql);
process.stderr.write(
  `Lagde SQL for ${email}: ${Object.entries(summary.counts).map(([t, n]) => `${t}=${n}`).join(', ')} (${Math.round(sql.length / 1024)} kB).\n` +
    'Ingenting er kjørt. Kjør teksten som postgres i utviklingsprosjektet (brukeren må finnes i auth.users).\n',
);
