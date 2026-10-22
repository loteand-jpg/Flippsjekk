import { createContext, useContext, type ReactNode } from 'react';
import { APP_MODE } from '../config/app';
import { browserStorage } from '../data/storage';
import { systemClock } from '../lib/clock';
import { createMockServices } from '../services/mock';
import { createSupabaseServices, supabaseConfigFromEnv } from '../services/supabase';
import type { Services } from '../services/types';

/**
 * Komponerer tjenestene appen bruker. Demo: lokale mocktjenester.
 * Produksjon (backend fase 2A): ekte Supabase Auth og profil; resten er eksplisitt «ikke koblet til» (`services.unavailable`).
 * Returnerer null når produksjonsmodus mangler gyldig Supabase-konfigurasjon – appen viser da en forklaring (se NotConfigured).
 */
export function createAppServices(): Services | null {
  if (APP_MODE === 'production') {
    const config = supabaseConfigFromEnv();
    return config.ok ? createSupabaseServices({ config: config.config }) : null;
  }
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

/**
 * Hvor en innlogget bruker starter. Oversikten krever objekter; så lenge de ikke er koblet til (produksjon, fase 2A), er Konto startsiden.
 * I demoen er det som før Oversikten.
 */
export function homePath(services: Pick<Services, 'unavailable'>): string {
  return services.unavailable.includes('properties') ? '/konto' : '/oversikt';
}

export function useHomePath(): string {
  return homePath(useServices());
}
