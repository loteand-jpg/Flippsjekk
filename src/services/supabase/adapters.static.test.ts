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
const isTest = (p: string) => /\.test\.tsx?$/.test(p) || p.endsWith('/testing.ts');
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
    for (const a of adapters.filter((x) => x.file !== 'profileService.ts')) expect(a.code, a.file).not.toMatch(/\.from\(/);
    // Typen som beskriver det klienten kan skrive har bare de to kolonnene.
    const upd = /export interface ProfileUpdate \{([\s\S]*?)\}/.exec(readFileSync(`${adapterDir}profileService.ts`, 'utf8'))![1];
    expect([...upd.matchAll(/^\s*(\w+)\??:/gm)].map((m) => m[1])).toEqual(['display_name', 'defaults']);
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
