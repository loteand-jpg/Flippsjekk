import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Profile, Subscription } from '../domain/schemas';
import type { Entitlements, Session } from '../services/types';
import { useServices } from './services';

interface SessionState {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  subscription: Subscription | null;
  entitlements: Entitlements | null;
  refresh: () => Promise<void>;
}

const Ctx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const services = useServices();
  const [state, setState] = useState<Omit<SessionState, 'refresh'>>({ ready: false, session: null, profile: null, subscription: null, entitlements: null });
  const refresh = useCallback(async () => {
    try {
      const session = await services.auth.session();
      if (!session) {
        setState({ ready: true, session: null, profile: null, subscription: null, entitlements: null });
        return;
      }
      const [profile, subscription, entitlements] = await Promise.all([
        services.profile.get().catch(() => null),
        services.subscription.getSubscription().catch(() => null),
        // Et område som ikke er koblet til (produksjon, fase 2A) skal ikke logge brukeren ut av visningen.
        services.subscription.getEntitlements().catch(() => null),
      ]);
      setState({ ready: true, session, profile, subscription, entitlements });
    } catch {
      setState({ ready: true, session: null, profile: null, subscription: null, entitlements: null });
    }
  }, [services]);
  useEffect(() => {
    void refresh();
    let scheduled = false;
    return services.events.subscribe(() => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        void refresh();
      });
    });
  }, [services, refresh]);
  return <Ctx.Provider value={{ ...state, refresh }}>{children}</Ctx.Provider>;
}

export function useSession(): SessionState {
  const s = useContext(Ctx);
  if (!s) throw new Error('SessionProvider mangler');
  return s;
}
