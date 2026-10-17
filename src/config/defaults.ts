import type { ProfileDefaults } from '../domain/schemas';

/**
 * Eksempelforutsetninger fra tidligere arbeid i prosjektet Flipp.
 * Dette er redigerbare FORUTSETNINGER – ikke verifiserte markedsvilkår eller finansieringstilbud.
 * Kjøpertype per kategori (leilighet privat, hus i AS) er en profilstandard, ikke en universell regel.
 */
export const EXAMPLE_PROFILE_DEFAULTS: ProfileDefaults = {
  buyerTypeApartment: 'privat',
  buyerTypeHouse: 'as',
  months: 6,
  interestPct: 7,
  financingPct: 100,
  reservePct: 20,
  hourValue: 350,
  profitTarget: 400_000,
  saleFixedCost: 55_000,
  saleCommissionPct: 1.5,
  buyFees: 6_000,
  homeArea: 'Trondheim',
};

/** Nøytrale standarder for nye kontoer (samme eksempelverdier, uten historisk kjøpertypevalg). */
export const NEW_ACCOUNT_DEFAULTS: ProfileDefaults = {
  ...EXAMPLE_PROFILE_DEFAULTS,
  buyerTypeApartment: 'privat',
  buyerTypeHouse: 'privat',
};
