import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useServices } from './services';

/**
 * Henter data via en tjeneste og henter på nytt når data endres (mock: lokal database;
 * produksjon: f.eks. Supabase Realtime). Beholder forrige data under ny henting.
 */
export function useLiveQuery<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | undefined; error: unknown; loading: boolean; reload: () => void } {
  const services = useServices();
  const [state, setState] = useState<{ data: T | undefined; error: unknown; loading: boolean }>({ data: undefined, error: null, loading: true });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const seq = useRef(0);
  const run = useCallback(() => {
    const my = ++seq.current;
    setState((s) => ({ ...s, loading: true }));
    fnRef
      .current()
      .then((data) => {
        if (my === seq.current) setState({ data, error: null, loading: false });
      })
      .catch((error) => {
        if (my === seq.current) setState((s) => ({ data: s.data, error, loading: false }));
      });
  }, []);
  useEffect(() => {
    run();
    let scheduled = false;
    const unsub = services.events.subscribe(() => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        run();
      });
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { ...state, reload: run };
}

/** Oppdaterer «nå» jevnlig, for relative tidspunkt og ferskhet. */
export function useNow(intervalMs = 30_000): Date {
  const services = useServices();
  const [now, setNow] = useState(() => services.clock.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(services.clock.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [services, intervalMs]);
  return now;
}

function subscribeMedia(query: string) {
  return (cb: () => void) => {
    const m = window.matchMedia(query);
    m.addEventListener('change', cb);
    return () => m.removeEventListener('change', cb);
  };
}
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(subscribeMedia(query), () => window.matchMedia(query).matches, () => false);
}
