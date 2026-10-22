import { z } from 'zod';
import { NEW_ACCOUNT_DEFAULTS } from '../../config/defaults';
import { ProfileDefaultsSchema, ProfileSchema, type Profile, type ProfileDefaults } from '../../domain/schemas';
import { ServiceError, type ProfileService } from '../types';
import type { SupabaseClientProvider } from './client';
import { toAuthServiceError, toDataServiceError } from './errors';

/**
 * DB-rad for `public.profiles`, slik fase 2A leser den. En smal, håndskrevet type ved adaptergrensen (ikke en generert databasetype): Claude har
 * ikke tilgang til det faktiske Supabase-prosjektet og kan ikke generere slike typer. ChatGPT kan generere de faktiske typene fra det
 * live-verifiserte prosjektet senere (se docs/supabase.md); da kan denne erstattes uten at kontrakten mot UI endres.
 *
 * Rader fra databasen er EKSTERNE data og valideres (`ProfileRowSchema` og deretter `ProfileSchema`) før de blir domenedata.
 */
export interface ProfileRow {
  user_id: string;
  display_name: string;
  email: string;
  /** jsonb. `null` = brukeren har ikke lagret egne standarder ennå. */
  defaults: unknown;
  updated_at: string;
}

/** Kolonnene vi leser. `created_at` trengs ikke i domenet. */
export const PROFILE_COLUMNS = 'user_id, display_name, email, defaults, updated_at' as const;

/**
 * Det klienten kan skrive: bare disse to kolonnene (`grant update (display_name, defaults)` + RLS). `user_id`, `email`, `created_at` og
 * `updated_at` er aldri brukerredigerbare, og sendes aldri.
 */
export interface ProfileUpdate {
  display_name?: string;
  defaults?: ProfileDefaults;
}

const ProfileRowSchema = z.object({
  user_id: z.string().min(1),
  display_name: z.string(),
  email: z.string(),
  defaults: z.unknown(),
  updated_at: z.string(),
});

/**
 * Regel for standardforutsetninger:
 *  - `null` (ingen lagrede standarder) → en kopi av `NEW_ACCOUNT_DEFAULTS`.
 *  - lagret objekt (komplett eller delvis) → `NEW_ACCOUNT_DEFAULTS` med de lagrede verdiene lagt oppå, validert av `ProfileDefaultsSchema`
 *    (som også migrerer eldre felter). Et delvis objekt gir dermed alltid et komplett sett.
 *  - alt annet, eller verdier som ikke består valideringen → kontrollert feil (aldri halvferdige eller korrupte standarder).
 * Økonomiske standardverdier er uendret (`NEW_ACCOUNT_DEFAULTS`).
 */
export function resolveProfileDefaults(raw: unknown): ProfileDefaults {
  if (raw === null || raw === undefined) return structuredClone(NEW_ACCOUNT_DEFAULTS);
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ServiceError('validation', 'Standardforutsetningene i profilen har et ugyldig format.', { reason: 'defaults_not_object' });
  }
  const check = ProfileDefaultsSchema.safeParse({ ...NEW_ACCOUNT_DEFAULTS, ...(raw as Record<string, unknown>) });
  if (!check.success) {
    const issue = check.error.issues[0];
    throw new ServiceError('validation', `Ugyldig profilverdi: ${issue.path.join('.')} – ${issue.message}`, { reason: 'defaults_invalid', path: issue.path.join('.') });
  }
  return check.data;
}

/** DB-rad → domenets `Profile`. Kaster `ServiceError('validation')` hvis raden ikke er gyldig. */
export function profileFromRow(row: unknown): Profile {
  const r = ProfileRowSchema.safeParse(row);
  if (!r.success) throw new ServiceError('validation', 'Profilen fra databasen har et uventet format.', { reason: 'row_shape', issues: r.error.issues.map((i) => i.path.join('.')) });
  const profile = ProfileSchema.safeParse({
    userId: r.data.user_id,
    displayName: r.data.display_name,
    email: r.data.email,
    defaults: resolveProfileDefaults(r.data.defaults),
    updatedAt: Number.isNaN(Date.parse(r.data.updated_at)) ? r.data.updated_at : new Date(r.data.updated_at).toISOString(),
  });
  if (!profile.success) throw new ServiceError('validation', 'Profilen fra databasen har ugyldige verdier.', { reason: 'profile_invalid', issues: profile.error.issues.map((i) => i.path.join('.')) });
  return profile.data;
}

const NAME_MIN = 2;
const NAME_MAX = 200; // samme grense som check-constraint i databasen

export interface SupabaseProfileDeps {
  getClient: SupabaseClientProvider;
  /** Varsles etter en vellykket lagring, så sesjon og profil i UI hentes på nytt. */
  notifyChanged?: () => void;
}

/**
 * `ProfileService` mot `public.profiles`. Eierskap håndheves av RLS (`user_id = auth.uid()`): tjenesten leser bruker-ID-en fra Auth-sesjonen
 * for å filtrere, men sender den aldri som data, og databasen avviser uansett alt som ikke er brukerens egen rad. Profilen opprettes av en
 * trigger i databasen når Auth-brukeren opprettes (migrasjon 2); frontend oppretter den aldri, og finnes den ikke, er det en feil å melde –
 * ikke noe å gjette seg til.
 */
export class SupabaseProfileService implements ProfileService {
  constructor(private readonly deps: SupabaseProfileDeps) {}

  private async context() {
    const client = await this.deps.getClient();
    const { data, error } = await client.auth.getSession();
    if (error) throw toAuthServiceError(error, 'session');
    const uid = data.session?.user?.id;
    if (!uid) throw new ServiceError('not_authenticated', 'Du er ikke innlogget. Logg inn på nytt.');
    return { client, uid };
  }

  async get(): Promise<Profile> {
    const { client, uid } = await this.context();
    const res = await client.from('profiles').select(PROFILE_COLUMNS).eq('user_id', uid).maybeSingle();
    if (res.error) throw toDataServiceError(res.error, res.status);
    if (!res.data) {
      throw new ServiceError('not_found', 'Fant ikke profilen din. Prøv å laste siden på nytt, eller logg ut og inn igjen.', { reason: 'profile_row_missing' });
    }
    return profileFromRow(res.data);
  }

  async update(patch: { displayName?: string; defaults?: Partial<ProfileDefaults> }): Promise<Profile> {
    const payload: ProfileUpdate = {};
    if (patch.displayName !== undefined) {
      const name = patch.displayName.trim();
      if (name.length < NAME_MIN) throw new ServiceError('validation', `Navnet må ha minst ${NAME_MIN} tegn.`);
      if (name.length > NAME_MAX) throw new ServiceError('validation', `Navnet kan ha høyst ${NAME_MAX} tegn.`);
      payload.display_name = name;
    }
    if (patch.defaults !== undefined) {
      const current = await this.get();
      const changes = Object.fromEntries(Object.entries(patch.defaults).filter(([, v]) => v !== undefined));
      const check = ProfileDefaultsSchema.safeParse({ ...current.defaults, ...changes });
      if (!check.success) throw new ServiceError('validation', `Ugyldig profilverdi: ${check.error.issues[0].path.join('.')} – ${check.error.issues[0].message}`);
      payload.defaults = check.data;
    }
    if (Object.keys(payload).length === 0) return this.get();

    const { client, uid } = await this.context();
    const res = await client.from('profiles').update(payload).eq('user_id', uid).select(PROFILE_COLUMNS).maybeSingle();
    if (res.error) throw toDataServiceError(res.error, res.status);
    // Ingen rad tilbake: raden finnes ikke eller er ikke brukerens (RLS). Begge deler er en feil, ikke en stille «ingenting».
    if (!res.data) throw new ServiceError('not_found', 'Fant ikke profilen din, så ingenting ble lagret.', { reason: 'profile_row_missing' });
    const saved = profileFromRow(res.data);
    this.deps.notifyChanged?.();
    return saved;
  }
}
