/**
 * Kjøremodus. Demo bruker lokale mocktjenester og viser testkontroller.
 * Produksjon krever ekte backend (Supabase/Vipps) – ikke koblet til i denne versjonen.
 * Det finnes ingen URL-parameter eller localStorage-verdi som slår på demomodus eller betalt tilgang.
 */
export type AppMode = 'demo' | 'production';
export const APP_MODE: AppMode = import.meta.env?.VITE_FLIPPROM_MODE === 'production' ? 'production' : 'demo';
export const IS_DEMO = APP_MODE === 'demo';
export const DEFAULT_AREA = 'Trondheim';
export const MARKET = { country: 'NO', currency: 'NOK', locale: 'nb-NO', timeZone: 'Europe/Oslo' } as const;
