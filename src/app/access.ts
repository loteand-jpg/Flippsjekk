import type { Entitlements, ServiceArea } from '../services/types';
import { useServices } from './services';
import { useSession } from './session';

export interface EditAccess {
  /** Kan brukeren endre egne data i dette området nå? */
  canEdit: boolean;
  /** Området er ikke koblet til en backend ennå (produksjon). Da skal UI si det, ikke «du trenger abonnement». */
  unavailable: boolean;
}

/**
 * Redigering av egne data (scenarioer, egne risikoer, egne sammenlignbare objekter).
 *  - Området er ikke koblet til (`Services.unavailable`): ingen redigering.
 *  - Abonnementet er kjent: følger abonnementet (`canEditScenarios`), som i demoen.
 *  - Abonnementstjenesten er IKKE koblet til (produksjon, fase 2B): det finnes ingen abonnementssjekk å følge, og databasen (RLS) eier tilgangen til
 *    egne data, så redigering av egne data tillates. Dette er en midlertidig, eksplisitt regel – ikke et gratis abonnement: analyse, oppfriskning,
 *    import og eksport er fortsatt utilgjengelige. Må erstattes av en sjekk i database/server sammen med abonnementet før lansering.
 *  - Abonnementet kunne ikke hentes av annen grunn: skrivebeskyttet (trygg standard).
 */
export function editAccessFor(unavailable: readonly ServiceArea[], entitlements: Pick<Entitlements, 'canEditScenarios'> | null, area: ServiceArea): EditAccess {
  if (unavailable.includes(area)) return { canEdit: false, unavailable: true };
  if (entitlements) return { canEdit: entitlements.canEditScenarios, unavailable: false };
  return { canEdit: unavailable.includes('subscription'), unavailable: false };
}

export function useEditAccess(area: ServiceArea): EditAccess {
  const services = useServices();
  const { entitlements } = useSession();
  return editAccessFor(services.unavailable, entitlements, area);
}
