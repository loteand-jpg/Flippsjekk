import { describe, expect, it } from 'vitest';
import type { ServiceArea } from '../services/types';
import { editAccessFor } from './access';

/**
 * Regelen for redigering av egne data (se access.ts). Den midlertidige regelen i produksjon – redigering tillates mens abonnementstjenesten ikke er
 * koblet til – er et bevisst valg som eier skal kunne se og endre; testene fastlåser nøyaktig hva den gjør og ikke gjør.
 */
const PRODUCTION_2B: ServiceArea[] = ['subscription', 'courses', 'comparables', 'risks', 'analysis', 'calendar', 'imports'];
const full = { canEditScenarios: true };
const readOnly = { canEditScenarios: false };

describe('editAccessFor', () => {
  it('demo (ingenting utilgjengelig): følger abonnementet', () => {
    expect(editAccessFor([], full, 'scenarios')).toEqual({ canEdit: true, unavailable: false });
    expect(editAccessFor([], readOnly, 'scenarios')).toEqual({ canEdit: false, unavailable: false });
    expect(editAccessFor([], null, 'scenarios')).toEqual({ canEdit: false, unavailable: false }); // kunne ikke hentes: trygg standard
  });

  it('produksjon fase 2B: scenarioer kan redigeres fordi abonnementstjenesten ikke finnes (ingen sjekk å følge)', () => {
    expect(editAccessFor(PRODUCTION_2B, null, 'scenarios')).toEqual({ canEdit: true, unavailable: false });
  });

  it('produksjon fase 2B: områder som ikke er koblet til kan aldri redigeres, og meldes som utilgjengelige', () => {
    for (const area of ['risks', 'comparables', 'calendar', 'imports', 'courses'] as const) {
      expect(editAccessFor(PRODUCTION_2B, null, area), area).toEqual({ canEdit: false, unavailable: true });
      expect(editAccessFor(PRODUCTION_2B, full, area), area).toEqual({ canEdit: false, unavailable: true }); // heller ikke med «fullt» abonnement
    }
  });

  it('abonnementet er koblet til men ukjent (feil ved henting): skrivebeskyttet, ikke åpent', () => {
    expect(editAccessFor(['calendar'], null, 'scenarios')).toEqual({ canEdit: false, unavailable: false });
  });

  it('når abonnementet er koblet til, vinner det: utløpt abonnement gir skrivebeskyttet selv om området er tilgjengelig', () => {
    expect(editAccessFor(['calendar'], readOnly, 'scenarios')).toEqual({ canEdit: false, unavailable: false });
    expect(editAccessFor(['calendar'], full, 'scenarios')).toEqual({ canEdit: true, unavailable: false });
  });
});
