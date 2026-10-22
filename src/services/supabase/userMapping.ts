import { UserSchema, type User } from '../../domain/schemas';
import { ServiceError, type Session } from '../types';

/**
 * Supabase `User` → domenets `User`. Supabase-typen sprer seg ikke videre i appen: det som trengs hentes ut her, og resultatet valideres mot
 * `UserSchema`. `AuthUserLike` er den delmengden av Supabases bruker vi leser (Supabase sin `User` er tilordnbar til den).
 *
 * Hva som er autoritativt:
 *  - `id` (Supabase Auth sin bruker-ID) er domenets bruker-ID og det RLS bruker (`auth.uid()`).
 *  - `email` er kontoens e-post (bekreftet av Supabase).
 *  - `displayName` her er KUN til visning før profilen er lest: den kommer fra leverandør-metadata (Google leverer navn), som brukeren kan
 *    redigere selv, og brukes aldri til tilgangsstyring. Autoritativt visningsnavn er `profiles.display_name`.
 *  - `isDemoAccount` er alltid false for ekte kontoer.
 */
export interface AuthUserLike {
  id: string;
  email?: string | null;
  created_at?: string | null;
  email_confirmed_at?: string | null;
  last_sign_in_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
  is_anonymous?: boolean | null;
}

export interface AuthSessionLike {
  user: AuthUserLike;
}

const clean = (v: unknown): string | null => (typeof v === 'string' && v.trim().length > 0 ? v.trim() : null);

/** Visningsnavn til UI før profilen er lest. Ikke autoritativt (se over). */
export function displayNameFor(user: AuthUserLike): string {
  const meta = user.user_metadata ?? {};
  const fromMeta = clean(meta.full_name) ?? clean(meta.name);
  const fromEmail = clean((user.email ?? '').split('@')[0]);
  return (fromMeta ?? fromEmail ?? 'Bruker').slice(0, 200);
}

function iso(value: string | null | undefined): string | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export function mapUser(user: AuthUserLike): User {
  const mapped = {
    id: user.id,
    email: user.email ?? '',
    displayName: displayNameFor(user),
    isDemoAccount: false,
    // Mangler tidspunktet, brukes «nå» – feltet brukes bare til visning.
    createdAt: iso(user.created_at) ?? new Date().toISOString(),
  };
  const check = UserSchema.safeParse(mapped);
  if (!check.success) throw new ServiceError('unavailable', 'Fikk et uventet svar fra innloggingstjenesten (ugyldig bruker).', { issues: check.error.issues.map((i) => i.path.join('.')) });
  return check.data;
}

/**
 * Anonyme Auth-brukere regnes ikke som innlogget: de får Postgres-rollen `authenticated`, men appen har ingen anonym bruk (og anonym innlogging
 * skal være slått av i Supabase Auth).
 */
export function mapSession(session: AuthSessionLike | null | undefined): Session | null {
  if (!session || session.user.is_anonymous === true) return null;
  return { user: mapUser(session.user), kind: 'production' };
}

/**
 * Ble kontoen opprettet av denne innloggingen? Kun et hint til UI (velkomstmelding), aldri sikkerhet. Ved første bekreftelse settes
 * `email_confirmed_at` og `last_sign_in_at` samtidig; ved senere innlogginger er `last_sign_in_at` nyere. Google-brukere har e-posten
 * bekreftet av leverandøren, og samme regel gjelder.
 */
export function looksLikeNewUser(user: AuthUserLike): boolean {
  const confirmed = Date.parse(user.email_confirmed_at ?? '');
  const lastSignIn = Date.parse(user.last_sign_in_at ?? '');
  if (Number.isNaN(confirmed) || Number.isNaN(lastSignIn)) return false;
  return Math.abs(lastSignIn - confirmed) <= 10_000;
}
