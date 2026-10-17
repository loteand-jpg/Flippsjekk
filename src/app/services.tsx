import { createContext, useContext, type ReactNode } from 'react';
import { APP_MODE } from '../config/app';
import { browserStorage } from '../data/storage';
import { systemClock } from '../lib/clock';
import { createMockServices } from '../services/mock';
import type { Services } from '../services/types';

/**
 * Komponerer tjenestene appen bruker. Demo: lokale mocktjenester.
 * Produksjon: Supabase/Vipps-implementasjoner av de samme grensesnittene (ikke koblet til ennå).
 */
export function createAppServices(): Services | null {
  if (APP_MODE === 'production') return null;
  const services = createMockServices({ storage: browserStorage(), clock: systemClock, latencyMs: 120 });
  if (typeof window !== 'undefined') {
    // Jobbsimulatoren går i bakgrunnen også når analysedialogen er lukket.
    window.setInterval(() => services.demo.tick(), 400);
    // Endringer fra en annen fane
    window.addEventListener('storage', (e) => {
      if (e.key === services.db.storageKey) services.db.reloadFromStorage();
    });
  }
  return services;
}

const Ctx = createContext<Services | null>(null);

export function ServicesProvider({ services, children }: { services: Services; children: ReactNode }) {
  return <Ctx.Provider value={services}>{children}</Ctx.Provider>;
}

export function useServices(): Services {
  const s = useContext(Ctx);
  if (!s) throw new Error('ServicesProvider mangler');
  return s;
}
