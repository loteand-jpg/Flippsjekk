import type { createHashRouter } from 'react-router';
import type { RoutingVariant } from './variants';

type HashRouter = ReturnType<typeof createHashRouter>;

/**
 * Hver variant har sitt eget rutertre, men bare ÉN ruter er aktiv om gangen. Ruterne opprettes først når varianten åpnes,
 * og kastes (dispose) når brukeren bytter variant, slik at en inaktiv ruter ikke lytter på adressefeltet.
 * Original opprettes som før (ved første bruk) og er uendret.
 */
const registry = new Map<RoutingVariant, HashRouter>();

export function getRouter(id: RoutingVariant, create: () => HashRouter): HashRouter {
  let r = registry.get(id);
  if (!r) {
    r = create();
    registry.set(id, r);
  }
  return r;
}

export function disposeRouter(id: RoutingVariant): void {
  registry.get(id)?.dispose();
  registry.delete(id);
}
