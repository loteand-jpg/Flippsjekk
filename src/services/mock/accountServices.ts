import { z } from 'zod';
import { NEW_ACCOUNT_DEFAULTS } from '../../config/defaults';
import { getPlan } from '../../config/plans';
import { ProfileDefaultsSchema, type Profile, type Subscription } from '../../domain/schemas';
import { uuid } from '../../lib/ids';
import {
  ServiceError,
  type AuthService,
  EMAIL_CODE_LENGTH,
  type EmailChallenge,
  type GoogleSignInResult,
  type ProfileService,
  type Session,
  type SignInResult,
  type SimulatedGoogleAccount,
  type SubscriptionService,
  type VippsPending,
} from '../types';
import { computeEntitlements, type MockContext } from './context';
import { normalizeNorwegianMobile } from './courseServices';

export const CODE_LENGTH = EMAIL_CODE_LENGTH;
export const CODE_TTL_MS = 10 * 60_000;
export const RESEND_COOLDOWN_MS = 30_000;
const MAX_ATTEMPTS = 5;
const MAX_REQUESTS_PER_WINDOW = 5;
const REQUEST_WINDOW_MS = 15 * 60_000;

/** Fiktive Google-kontoer til demoens kontovelger. */
export const SIMULATED_GOOGLE_ACCOUNTS: SimulatedGoogleAccount[] = [
  { email: 'kari.nordmann@gmail.com', name: 'Kari Nordmann' },
  { email: 'ola.hansen@gmail.com', name: 'Ola Hansen' },
];

function randomCode(): string {
  const n = new Uint32Array(1);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(n);
  else n[0] = Math.floor(Math.random() * 2 ** 32);
  return String(n[0] % 10 ** CODE_LENGTH).padStart(CODE_LENGTH, '0');
}

/** «kari.nordmann» → «Kari Nordmann». */
export function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? '';
  const words = local.split(/[._\-+\d]+/).filter(Boolean);
  const name = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return name.length >= 2 ? name.slice(0, 60) : 'Ny bruker';
}

interface Challenge {
  email: string;
  code: string;
  expiresAt: number;
  attempts: number;
}

/**
 * Simulert innlogging med Google og e-postkode. Det finnes ingen passord.
 * Koden sendes ikke på ekte e-post i demoen – den vises i en simulert e-post på skjermen.
 * Ingen ekte persondata skal legges inn i demoen.
 */
export class MockAuthService implements AuthService {
  private readonly challenges = new Map<string, Challenge>();
  private readonly requests = new Map<string, number[]>();

  constructor(private readonly ctx: MockContext) {}

  private sessionFor(userId: string | null): Session | null {
    if (!userId) return null;
    const user = this.ctx.db.read((s) => s.users.find((u) => u.id === userId) ?? null);
    return user ? { user, kind: 'demo' } : null;
  }

  async session(): Promise<Session | null> {
    return this.sessionFor(this.ctx.maybeUid());
  }

  /** Logger inn på e-post, og oppretter kontoen hvis den ikke finnes. */
  private signInEmail(email: string, displayName: string): SignInResult {
    const now = this.ctx.now().toISOString();
    return this.ctx.db.transaction((d) => {
      let user = d.users.find((u) => u.email.toLowerCase() === email);
      let isNewUser = false;
      if (!user) {
        const id = uuid();
        user = { id, email, displayName, isDemoAccount: false, createdAt: now };
        d.users.push(user);
        d.profiles.push({ userId: id, displayName, email, defaults: { ...NEW_ACCOUNT_DEFAULTS }, updatedAt: now });
        isNewUser = true;
      }
      d.session = { userId: user.id };
      return { session: { user, kind: 'demo' as const }, isNewUser };
    });
  }

  async requestEmailCode(rawEmail: string): Promise<EmailChallenge> {
    await this.ctx.delay();
    const parsed = z.string().trim().toLowerCase().email('Skriv inn en gyldig e-postadresse.').safeParse(rawEmail);
    if (!parsed.success) throw new ServiceError('validation', parsed.error.issues[0].message);
    const email = parsed.data;
    const now = this.ctx.now().getTime();
    const recent = (this.requests.get(email) ?? []).filter((t) => now - t < REQUEST_WINDOW_MS);
    const last = recent[recent.length - 1];
    if (last !== undefined && now - last < RESEND_COOLDOWN_MS) {
      throw new ServiceError('rate_limited', `Vent litt før du ber om ny kode (${Math.ceil((RESEND_COOLDOWN_MS - (now - last)) / 1000)} sekunder).`);
    }
    if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
      throw new ServiceError('rate_limited', 'For mange forsøk. Prøv igjen om en stund.');
    }
    recent.push(now);
    this.requests.set(email, recent);
    // Ny kode erstatter alle tidligere koder for samme e-post.
    for (const [id, c] of this.challenges) if (c.email === email) this.challenges.delete(id);
    const challengeId = uuid();
    const code = randomCode();
    this.challenges.set(challengeId, { email, code, expiresAt: now + CODE_TTL_MS, attempts: 0 });
    return {
      challengeId,
      email,
      expiresAt: new Date(now + CODE_TTL_MS).toISOString(),
      resendAfter: new Date(now + RESEND_COOLDOWN_MS).toISOString(),
      simulatedEmail: {
        to: email,
        subject: `Din innloggingskode til Flippsjekk: ${code}`,
        body: `Bruk denne koden for å logge inn: ${code}. Koden varer i ${CODE_TTL_MS / 60_000} minutter. Har du ikke bedt om den, kan du se bort fra denne e-posten.`,
        code,
      },
    };
  }

  async verifyEmailCode(input: { challengeId: string; code: string }): Promise<SignInResult> {
    await this.ctx.delay();
    const c = this.challenges.get(input.challengeId);
    if (!c) throw new ServiceError('code_expired', 'Koden er ikke lenger gyldig. Be om en ny kode.');
    if (this.ctx.now().getTime() > c.expiresAt) {
      this.challenges.delete(input.challengeId);
      throw new ServiceError('code_expired', 'Koden har utløpt. Be om en ny kode.');
    }
    const code = input.code.replace(/\s+/g, '');
    if (!new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code)) throw new ServiceError('validation', `Koden har ${CODE_LENGTH} siffer.`);
    if (code !== c.code) {
      c.attempts += 1;
      if (c.attempts >= MAX_ATTEMPTS) {
        this.challenges.delete(input.challengeId);
        throw new ServiceError('too_many_attempts', 'For mange feil forsøk. Be om en ny kode.');
      }
      throw new ServiceError('invalid_code', `Feil kode. Du har ${MAX_ATTEMPTS - c.attempts} forsøk igjen.`);
    }
    this.challenges.delete(input.challengeId);
    return this.signInEmail(c.email, nameFromEmail(c.email));
  }

  async signInWithGoogle(account?: SimulatedGoogleAccount): Promise<GoogleSignInResult> {
    await this.ctx.delay();
    if (!account) throw new ServiceError('validation', 'Velg en Google-konto.');
    const parsed = z.string().trim().toLowerCase().email('Ugyldig e-postadresse.').safeParse(account.email);
    if (!parsed.success) throw new ServiceError('validation', parsed.error.issues[0].message);
    // Google har allerede bekreftet e-postadressen, så ingen ekstra kode.
    const name = account.name.trim().length >= 2 ? account.name.trim().slice(0, 60) : nameFromEmail(parsed.data);
    return { kind: 'signed_in', ...this.signInEmail(parsed.data, name) };
  }

  async signOut(): Promise<void> {
    await this.ctx.delay();
    this.ctx.db.transaction((d) => {
      d.session = { userId: null };
    });
  }
}

export class MockSubscriptionService implements SubscriptionService {
  constructor(private readonly ctx: MockContext) {}

  async getSubscription(): Promise<Subscription | null> {
    const uid = this.ctx.uid();
    return this.ctx.db.read((s) => s.subscriptions.filter((x) => x.userId === uid).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null);
  }

  async getEntitlements() {
    const uid = this.ctx.maybeUid();
    const now = this.ctx.now();
    return this.ctx.db.read((s) => computeEntitlements(s, uid, now));
  }

  /** Vipps-avtaler som venter på godkjenning i Vipps-appen. */
  private readonly pending = new Map<string, { uid: string; planId: string; interval: 'month' | 'year'; phone: string; expiresAt: number }>();

  /**
   * Oppretter en Vipps-betalingsavtale som venter på godkjenning. Tilgang gis ikke før avtalen er godkjent.
   * I produksjon: backend oppretter avtalen hos Vipps og bruker returnert URL (redirect) – og webhook bekrefter.
   */
  async startCheckout(input: { planId: string; interval: 'month' | 'year'; phone: string }) {
    await this.ctx.delay();
    const uid = this.ctx.uid();
    const plan = getPlan(input.planId);
    const digits = normalizeNorwegianMobile(input.phone);
    if (!digits) throw new ServiceError('validation', 'Skriv inn et norsk mobilnummer med 8 siffer (starter på 4 eller 9).');
    const now = this.ctx.now();
    const hadBefore = this.ctx.db.read((s) => s.subscriptions.some((x) => x.userId === uid));
    const trial = !hadBefore && plan.trialDays > 0;
    const firstCharge = new Date(now);
    if (trial) firstCharge.setDate(firstCharge.getDate() + plan.trialDays);
    const agreementId = `agr_${uuid().slice(0, 8)}`;
    const expiresAt = now.getTime() + 5 * 60_000;
    this.pending.set(agreementId, { uid, planId: plan.id, interval: input.interval, phone: digits, expiresAt });
    const result: VippsPending = {
      kind: 'vipps_pending',
      agreementId,
      phoneMasked: `+47 ${digits[0]}•• •• ${digits.slice(-3)}`,
      planId: plan.id,
      interval: input.interval,
      firstChargeAt: firstCharge.toISOString(),
      amount: input.interval === 'year' ? plan.priceYearly : plan.priceMonthly,
      expiresAt: new Date(expiresAt).toISOString(),
    };
    return result;
  }

  /**
   * Simulerer at brukeren godkjenner eller avviser i Vipps-appen, og at Vipps bekrefter til serveren.
   * Brukes bare av demoen – i produksjon kommer bekreftelsen som en signert webhook.
   */
  async decideVipps(agreementId: string, outcome: 'approved' | 'rejected') {
    await this.ctx.delay();
    const p = this.pending.get(agreementId);
    if (!p) throw new ServiceError('not_found', 'Fant ikke Vipps-avtalen. Den kan ha utløpt – start på nytt.');
    this.pending.delete(agreementId);
    const uid = this.ctx.uid();
    if (p.uid !== uid) throw new ServiceError('forbidden', 'Avtalen tilhører en annen konto.');
    const now = this.ctx.now();
    if (now.getTime() > p.expiresAt) throw new ServiceError('conflict', 'Vipps-avtalen utløp før den ble godkjent. Start på nytt.');
    if (outcome === 'rejected') return { status: 'rejected' as const, subscription: null, purchase: null };
    const plan = getPlan(p.planId);
    const subscription = this.ctx.db.transaction((d) => {
      const hadBefore = d.subscriptions.some((x) => x.userId === uid);
      const trial = !hadBefore && plan.trialDays > 0;
      const end = new Date(now);
      if (trial) end.setDate(end.getDate() + plan.trialDays);
      else if (p.interval === 'year') end.setFullYear(end.getFullYear() + 1);
      else end.setMonth(end.getMonth() + 1);
      d.subscriptions = d.subscriptions.filter((x) => x.userId !== uid);
      const sub: Subscription = {
        id: uuid(),
        userId: uid,
        planId: plan.id,
        interval: p.interval,
        status: trial ? 'trialing' : 'active',
        currentPeriodStart: now.toISOString(),
        currentPeriodEnd: end.toISOString(),
        cancelAtPeriodEnd: false,
        provider: 'vipps',
        agreementId,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      d.subscriptions.push(sub);
      return sub;
    });
    return { status: 'approved' as const, subscription, purchase: null };
  }

  async openCustomerPortal() {
    await this.ctx.delay();
    this.ctx.uid();
    return { kind: 'simulated' as const };
  }

  async listUsage() {
    const uid = this.ctx.uid();
    return this.ctx.db.read((s) => s.usageEvents.filter((e) => e.userId === uid).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }
}

export class MockProfileService implements ProfileService {
  constructor(private readonly ctx: MockContext) {}

  async get(): Promise<Profile> {
    const uid = this.ctx.uid();
    const p = this.ctx.db.read((s) => s.profiles.find((x) => x.userId === uid) ?? null);
    if (p) return p;
    // Profilen kan mangle (f.eks. en lagret rad som ikke lot seg lese ved innlasting). Standardforutsetningene skal ikke
    // forsvinne fra Konto uten forklaring, så en manglende profil gjenopprettes med standardverdiene.
    return this.ctx.db.transaction((d) => {
      const existing = d.profiles.find((x) => x.userId === uid);
      if (existing) return existing;
      const user = d.users.find((u) => u.id === uid);
      if (!user) throw new ServiceError('not_found', 'Fant ikke profilen.');
      const restored: Profile = { userId: uid, displayName: user.displayName, email: user.email, defaults: { ...NEW_ACCOUNT_DEFAULTS }, updatedAt: this.ctx.now().toISOString() };
      d.profiles.push(restored);
      return restored;
    });
  }

  async update(patch: { displayName?: string; defaults?: Partial<Profile['defaults']> }): Promise<Profile> {
    await this.ctx.delay();
    const uid = this.ctx.uid();
    return this.ctx.db.transaction((d) => {
      const p = d.profiles.find((x) => x.userId === uid);
      if (!p) throw new ServiceError('not_found', 'Fant ikke profilen.');
      const defaults = { ...p.defaults, ...(patch.defaults ?? {}) };
      const check = ProfileDefaultsSchema.safeParse(defaults);
      if (!check.success) throw new ServiceError('validation', `Ugyldig profilverdi: ${check.error.issues[0].path.join('.')} – ${check.error.issues[0].message}`);
      if (patch.displayName !== undefined) {
        const name = patch.displayName.trim();
        if (name.length < 2) throw new ServiceError('validation', 'Navnet må ha minst 2 tegn.');
        p.displayName = name;
        const u = d.users.find((x) => x.id === uid);
        if (u) u.displayName = name;
      }
      p.defaults = defaults;
      p.updatedAt = this.ctx.now().toISOString();
      return p;
    });
  }
}
