import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Statiske sikkerhetskontroller av Supabase-adapterne (backend fase 2A). De erstatter ikke en kontroll mot faktisk Supabase, men sørger for at
 * reglene fra oppgaven ikke kan brytes ved en feiltagelse: ingen hemmeligheter i frontend, ingen egen lagring av tokens/koder, ingen
 * brukerredigerbar metadata til tilgangsstyring, og at UI-et aldri importerer Supabase direkte.
 */
const srcRoot = fileURLToPath(new URL('../../', import.meta.url));
const adapterDir = fileURLToPath(new URL('./', import.meta.url));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = `${dir}${f}`;
    return statSync(p).isDirectory() ? walk(`${p}/`) : [p];
  });
}
/** Test- og utviklingsverktøy som aldri skal inn i appbygget (dev/ = PGlite-backend, seed og radskrivere). */
const isDev = (p: string) => p.includes('/supabase/dev/');
const isTest = (p: string) => /\.test\.tsx?$/.test(p) || p.endsWith('/testing.ts') || isDev(p);
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const adapterFiles = walk(adapterDir).filter((p) => p.endsWith('.ts') && !isTest(p));
const adapters = adapterFiles.map((p) => ({ file: p.slice(adapterDir.length), code: strip(readFileSync(p, 'utf8')) }));
const appFiles = walk(srcRoot).filter((p) => /\.tsx?$/.test(p) && !isTest(p));

describe('Supabase-adapterne: sikkerhetsregler', () => {
  it('finner adapterfilene (kontroll mot at testen ikke er vakuum)', () => {
    expect(adapters.map((a) => a.file)).toEqual(expect.arrayContaining(['authService.ts', 'profileService.ts', 'compose.ts', 'events.ts', 'errors.ts', 'userMapping.ts', 'redirect.ts', 'notConfigured.ts', 'client.ts', 'config.ts']));
  });

  it('ingen service_role, secret-nøkler eller database-passord i koden (config.ts avviser dem, og er eneste sted de nevnes)', () => {
    for (const a of adapters.filter((x) => x.file !== 'config.ts')) {
      expect(a.code, a.file).not.toMatch(/service_role|sb_secret_|SERVICE_ROLE|DATABASE_URL|POSTGRES_PASSWORD|SUPABASE_SECRET/i);
    }
  });

  it('ingen egen lagring av tokens, koder eller sesjon (ingen localStorage/sessionStorage/cookies/IndexedDB), og ingen tilgang til access/refresh-token', () => {
    for (const a of adapters) {
      expect(a.code, a.file).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
      // Feilkoder som «refresh_token_not_found» er bare tekst i feilmappingen; det som er forbudt er å LESE token-egenskaper eller sette sesjon selv.
      expect(a.code, a.file).not.toMatch(/\.(access_token|refresh_token|provider_token|provider_refresh_token)\b|\.getUser\(|setSession\(|exchangeCodeForSession/);
    }
  });

  it('user_metadata brukes bare til visningsnavn (userMapping.displayNameFor) – aldri til autorisasjon, og app_metadata/role leses ikke', () => {
    const using = adapters.filter((a) => /user_metadata/.test(a.code)).map((a) => a.file);
    expect(using).toEqual(['userMapping.ts']);
    const m = adapters.find((a) => a.file === 'userMapping.ts')!.code;
    expect(m.match(/user_metadata/g)).toHaveLength(2); // type + displayNameFor
    // (config.ts leser «role» fra anon-nøkkelen bare for å AVVISE service_role-nøkler – det er ingen brukerautorisasjon.)
    for (const a of adapters.filter((x) => x.file !== 'config.ts')) expect(a.code, a.file).not.toMatch(/app_metadata|\.role\b|is_admin|isAdmin/);
  });

  it('profil: bare select/update av display_name og defaults – ingen insert/upsert/delete, og user_id er filter, aldri data', () => {
    const profile = adapters.find((a) => a.file === 'profileService.ts')!.code;
    expect(profile).not.toMatch(/\.(insert|upsert|delete|rpc)\(/);
    expect(profile.match(/\.from\('profiles'\)/g)).toHaveLength(2);
    expect(profile).toMatch(/\.update\(payload\)\.eq\('user_id', uid\)/);
    expect(profile).toMatch(/payload\.display_name = /);
    expect(profile).toMatch(/payload\.defaults = /);
    expect(profile).not.toMatch(/payload\.(user_id|email|created_at|updated_at)/);
    // Typen som beskriver det klienten kan skrive har bare de to kolonnene.
    const upd = /export interface ProfileUpdate \{([\s\S]*?)\}/.exec(readFileSync(`${adapterDir}profileService.ts`, 'utf8'))![1];
    expect([...upd.matchAll(/^\s*(\w+)\??:/gm)].map((m) => m[1])).toEqual(['display_name', 'defaults']);
  });

  /** Setninger (delt på «;») som bruker en gitt metode. */
  const statementsWith = (file: string, method: string) =>
    adapters.find((a) => a.file === file)!.code.split(';').filter((st) => new RegExp(`\\.${method}\\(`).test(st)).map((st) => st.replace(/\s+/g, ' ').trim());

  it('hvilke filer som leser/skriver databasen: bare profil-, eiendoms-, scenario- og analysetjenestene (ikke auth, events, feilmapping m.fl.)', () => {
    const withFrom = adapters.filter((a) => /\.from\(/.test(a.code)).map((a) => a.file).sort();
    expect(withFrom).toEqual(['analysisReader.ts', 'profileService.ts', 'propertyRepository.ts', 'scenarioRepository.ts']);
    for (const a of adapters) expect(a.code, a.file).not.toMatch(/\.rpc\(|\.upsert\(/);
  });

  it('felles data (eiendommer, snapshots, visninger, analyser) skrives aldri fra klienten: analysetjenesten leser bare', () => {
    const reader = adapters.find((a) => a.file === 'analysisReader.ts')!.code;
    expect(reader).not.toMatch(/\.(insert|update|delete|upsert)\(/);
    for (const t of ['properties', 'property_snapshots', 'viewings', 'analyses', 'analysis_jobs', 'subscriptions', 'usage_events', 'course_purchases']) {
      for (const a of adapters) expect(a.code, `${a.file} skriver ${t}`).not.toMatch(new RegExp(`from\\('${t}'\\)\\s*\\.(insert|update|delete|upsert)\\(`));
    }
  });

  it('objektlisten: INSERT i user_properties finnes ikke (medlemskap opprettes bare av backend, migrasjon 9); update/delete bare på user_properties, filtrert på bruker', () => {
    const repo = adapters.find((a) => a.file === 'propertyRepository.ts')!.code;
    expect(repo).not.toMatch(/\.insert\(/);
    for (const m of ['update', 'delete']) {
      const sts = statementsWith('propertyRepository.ts', m);
      expect(sts.length, m).toBeGreaterThan(0);
      for (const st of sts) {
        expect(st, st).toMatch(/\.from\('user_properties'\)/);
        expect(st, st).toMatch(/\.eq\('user_id', ctx\.uid\)/);
      }
    }
    // Det som skrives til listen er bare de kolonnene klienten har UPDATE på (migrasjon 3), aldri analyzed_at, user_id, property_id eller added_at.
    const written = [...repo.matchAll(/payload\.(\w+) = /g)].map((m) => m[1]).sort();
    expect(written).toEqual(['checks', 'favorite', 'last_seen_analysis_version', 'notes', 'work_status']);
    expect(repo).toMatch(/\{ archived_at: archived \?/);
    expect(repo).not.toMatch(/analyzed_at|payload\.user_id|payload\.property_id|payload\.added_at/);
    expect(repo).toMatch(/Objekter legges i listen din av analysetjenesten/); // addToMine avviser, med forklaring
  });

  it('scenarioer: insert/update/delete bare på scenarios og primary_scenario_id på user_properties; eier og låsing sendes aldri fra klienten', () => {
    const repo = adapters.find((a) => a.file === 'scenarioRepository.ts')!.code;
    const ins = statementsWith('scenarioRepository.ts', 'insert');
    expect(ins).toHaveLength(1);
    expect(ins[0]).toMatch(/\.from\('scenarios'\)/);
    // Nøyaktig de kolonnene klienten har INSERT på (migrasjon 5) – ikke id, eier, locked eller tidsstempler.
    const keys = [...ins[0].slice(ins[0].indexOf('.insert(')).matchAll(/[{,]\s*(\w+)\s*(?::|(?=\s*[,}]))/g)].map((m) => m[1]).filter((k) => !/^\d+$/.test(k));
    expect(keys.sort()).toEqual(['analysis_id', 'analysis_version', 'name', 'property_id', 'values']);
    for (const st of statementsWith('scenarioRepository.ts', 'delete')) expect(st, st).toMatch(/\.from\('scenarios'\)[\s\S]*\.eq\('owner_id', ctx\.uid\)/);
    for (const st of statementsWith('scenarioRepository.ts', 'update')) {
      if (/\.from\('user_properties'\)/.test(st)) {
        expect(st, st).toMatch(/update\(\{ primary_scenario_id: /);
        expect(st, st).toMatch(/\.eq\('user_id', ctx\.uid\)/);
      } else {
        expect(st, st).toMatch(/\.from\('scenarios'\)/);
        expect(st, st).toMatch(/\.eq\('owner_id', ctx\.uid\)/);
      }
    }
    const written = [...repo.matchAll(/payload\.(\w+) = /g)].map((m) => m[1]).sort();
    expect(written).toEqual(['analysis_id', 'analysis_version', 'name', 'values']);
  });

  it('OTP-koden sendes bare videre til verifyOtp: den lagres ikke, logges ikke og returneres ikke', () => {
    const auth = adapters.find((a) => a.file === 'authService.ts')!.code;
    expect(auth).not.toMatch(/console\./);
    expect(auth.match(/\btoken\b/g)?.length).toBeLessThanOrEqual(4);
    expect(auth).not.toMatch(/this\.(codes|tokens|otp)/);
    for (const a of adapters) expect(a.code, a.file).not.toMatch(/console\.(log|info|debug)/);
  });

  it('@supabase/supabase-js importeres bare som type, eller dynamisk i client.ts (holder pakken ute av hovedbunten)', () => {
    for (const a of adapters) {
      const staticValueImport = /^import\s+(?!type\b)[^;]*from\s+'@supabase\/supabase-js'/m.test(a.code);
      expect(staticValueImport, a.file).toBe(false);
    }
    const client = adapters.find((a) => a.file === 'client.ts')!.code;
    expect(client).toMatch(/await import\('@supabase\/supabase-js'\)/);
  });

  it('ingen appkode importerer test-/utviklingsverktøyene (dev/): PGlite og seed skal aldri inn i appbygget', () => {
    const offenders = appFiles.filter((p) => /supabase\/dev\/|from '\.\/dev\//.test(readFileSync(p, 'utf8'))).map((p) => p.slice(srcRoot.length));
    expect(offenders).toEqual([]);
  });

  it('UI og øvrig app importerer aldri Supabase direkte – bare tjenestekontraktene og produksjonskomposisjonen i app/services.tsx', () => {
    const offenders = appFiles
      .filter((p) => !p.startsWith(adapterDir))
      .filter((p) => /from\s+'@supabase\//.test(readFileSync(p, 'utf8')) || /services\/supabase\/(authService|profileService|client|errors|userMapping)'/.test(readFileSync(p, 'utf8')))
      .map((p) => p.slice(srcRoot.length));
    expect(offenders).toEqual([]);
    const touching = appFiles.filter((p) => !p.startsWith(adapterDir) && /services\/supabase/.test(readFileSync(p, 'utf8'))).map((p) => p.slice(srcRoot.length));
    expect(touching.sort()).toEqual(['App.tsx', 'app/services.tsx']);
    // App.tsx leser bare den offentlige konfigurasjonen (til forklaringen når den mangler); komposisjonen skjer i app/services.tsx.
    const imports = [...readFileSync(`${srcRoot}App.tsx`, 'utf8').matchAll(/from '(\.\/services\/supabase[^']*)'/g)].map((m) => m[1]);
    expect(imports).toEqual(['./services/supabase/config']);
  });

  it('klienten bruker bare den offentlige nøkkelen og PKCE, og signOut bruker scope local', () => {
    const client = adapters.find((a) => a.file === 'client.ts')!.code;
    expect(client).toMatch(/flowType: 'pkce'/);
    expect(client).toMatch(/config\.publishableKey/);
    const auth = adapters.find((a) => a.file === 'authService.ts')!.code;
    expect(auth).toMatch(/signOut\(\{ scope: 'local' \}\)/);
    expect(auth).toMatch(/skipBrowserRedirect: true/);
  });
});
