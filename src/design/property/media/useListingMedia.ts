import { EMPTY_MEDIA, type ListingMedia } from './types';

/**
 * Eneste koblingspunkt for bilder og plantegninger. I dag leverer datakilden ingen, så hooken returnerer tom media og
 * Property viser merkede plassholdere. Når en datakilde (f.eks. FINN-henting eller opplastede dokumenter) kan levere media,
 * returneres de her – komponentene under er allerede laget for det, og domenemodellen trenger ikke endres.
 */
export function useListingMedia(_propertyId: string): ListingMedia {
  return EMPTY_MEDIA;
}
