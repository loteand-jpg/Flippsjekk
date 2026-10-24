import type { DataEvents } from '../types';
import type { SupabaseClientProvider } from './client';

/**
 * `DataEvents` for produksjon. Appen oppdaterer seg (sesjon, profil) når noen kaller lytterne, i mocken ved hver endring i den lokale
 * databasen. Her kommer endringene fra to steder:
 *  - Supabase Auth (`onAuthStateChange`): innlogging, utlogging og brukeroppdatering – også fra en annen fane.
 *  - Våre egne skrivinger (profil) kaller `emit()` når de er lagret.
 *
 * Abonnementet på Supabase startes lat, første gang noen lytter, og lever like lenge som appen. `TOKEN_REFRESHED` og `INITIAL_SESSION`
 * gir ingen endring for brukeren og ignoreres. `SIGNED_IN` utløses også når en fane får fokus igjen; endringer varsles derfor bare når
 * brukeren faktisk er en annen enn sist.
 *
 * Lytterne kalles utenfor Supabase sin egen kallstakk (setTimeout 0), fordi auth-js holder en lås mens den varsler: å kalle
 * `getSession()` rett fra tilbakekallingen kan ellers låse seg.
 */
type AuthEvent = 'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'USER_UPDATED' | 'PASSWORD_RECOVERY' | string;

export class SupabaseEvents implements DataEvents {
  private readonly listeners = new Set<() => void>();
  private started = false;
  private lastUserId: string | null | undefined;

  constructor(
    private readonly getClient: SupabaseClientProvider,
    private readonly schedule: (fn: () => void) => void = (fn) => void setTimeout(fn, 0),
  ) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    this.start();
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Varsler lytterne (utenfor gjeldende kallstakk). */
  emit(): void {
    this.schedule(() => {
      for (const l of [...this.listeners]) l();
    });
  }

  /** Brukes av testene og av `start()`: tolker en Auth-hendelse. */
  handleAuthEvent(event: AuthEvent, userId: string | null): void {
    const changed = userId !== this.lastUserId;
    this.lastUserId = userId;
    if (event === 'SIGNED_OUT' || event === 'USER_UPDATED' || (event === 'SIGNED_IN' && changed)) this.emit();
  }

  private start(): void {
    if (this.started) return;
    this.started = true;
    this.getClient()
      .then((client) => {
        client.auth.onAuthStateChange((event, session) => this.handleAuthEvent(event, session?.user?.id ?? null));
      })
      .catch(() => {
        // Ikke konfigurert eller ikke tilgjengelig: tjenestene melder feilen selv når de brukes. Prøv igjen ved neste abonnement.
        this.started = false;
      });
  }
}
