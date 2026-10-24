import type { Clock } from '../../lib/clock';
import { isServiceError, ServiceError } from '../types';
import type { FlippsjekkSupabaseClient, SupabaseClientProvider } from './client';
import { toAuthServiceError, toDataServiceError } from './errors';

/** Avhengigheter som felles for datatjenestene (objekter, scenarioer, analyse). */
export interface DataDeps {
  getClient: SupabaseClientProvider;
  clock: Clock;
  /** Varsles etter vellykket skriving, så lister og sider (useLiveQuery) hentes på nytt. */
  notifyChanged?: () => void;
}

export interface DataContext {
  client: FlippsjekkSupabaseClient;
  /** Innlogget bruker fra Auth-sesjonen. Brukes som FILTER (og defense in depth) – eierskap håndheves av RLS uansett, og bruker-ID sendes aldri som data. */
  uid: string;
}

export async function dataContext(deps: Pick<DataDeps, 'getClient'>): Promise<DataContext> {
  let client: FlippsjekkSupabaseClient;
  try {
    client = await deps.getClient();
  } catch (e) {
    // Ikke konfigurert er allerede en ServiceError; alt annet (f.eks. at pakken ikke lot seg laste ved nettverksfeil) blir en kontrollert feil.
    throw isServiceError(e) ? e : toDataServiceError(e);
  }
  const { data, error } = await client.auth.getSession();
  if (error) throw toAuthServiceError(error, 'session');
  const uid = data.session?.user?.id;
  if (!uid) throw new ServiceError('not_authenticated', 'Du må logge inn for å fortsette.');
  return { client, uid };
}

/** PostgREST-svar → data, eller kontrollert `ServiceError`. Gir aldri tomme data ved feil. */
export function unwrap<T>(res: { data: T | null; error: unknown; status?: number }): T | null {
  if (res.error) throw toDataServiceError(res.error, res.status);
  return res.data;
}

/** Rader som en liste (aldri `null`), med feilhåndtering. */
export function rowsOf(res: { data: unknown; error: unknown; status?: number }): unknown[] {
  const data = unwrap(res as { data: unknown | null; error: unknown; status?: number });
  if (data === null || data === undefined) return [];
  if (!Array.isArray(data)) throw new ServiceError('validation', 'Uventet svar fra databasen (forventet en liste).', { reason: 'not_array' });
  return data;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Id-er i databasen er uuid. En ugyldig id (f.eks. fra en feil URL) skal gi «finnes ikke», ikke en databasefeil. */
export const isUuid = (v: string): boolean => UUID.test(v);
