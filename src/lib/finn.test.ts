import { describe, expect, it } from 'vitest';
import { parseFinnUrl } from './finn';

describe('parseFinnUrl', () => {
  const same = [
    'finn.no/478027403',
    'https://www.finn.no/478027403',
    'https://www.finn.no/realestate/homes/ad.html?finnkode=478027403',
    'finn.no/realestate/homes/ad.html?finnkode=478027403',
    'https://www.finn.no/realestate/homes/ad.html?finnkode=478027403&utm_source=facebook&utm_medium=social&fbclid=abc',
    'http://m.finn.no/realestate/homes/ad.html?ci=3&finnkode=478027403',
    '  https://www.finn.no/478027403/  ',
    '478027403',
  ];
  it.each(same)('normaliserer %s til samme FINN-ID og kanonisk URL', (url) => {
    const r = parseFinnUrl(url);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.finnId).toBe('478027403');
      expect(r.canonicalUrl).toBe('https://www.finn.no/realestate/homes/ad.html?finnkode=478027403');
      expect(r.canonicalUrl).not.toContain('utm_');
    }
  });

  it.each([
    ['', 'empty'],
    ['https://www.hjem.no/bolig/123456789', 'wrong_host'],
    ['https://finn.no.evil.example/478027403', 'wrong_host'],
    ['https://www.finn.no/bap/forsale/ad.html?finnkode=478027403', 'unsupported_path'],
    ['https://www.finn.no/realestate/plots/ad.html?finnkode=478027403', 'unsupported_path'],
    ['https://www.finn.no/realestate/homes/ad.html', 'missing_id'],
    ['https://www.finn.no/realestate/homes/ad.html?finnkode=12ab', 'invalid_id'],
    ['ftp://finn.no/478027403', 'wrong_protocol'],
    ['0123', 'invalid_id'],
    ['ikke en lenke med mellomrom', 'not_url'],
  ])('avviser %s med %s', (url, code) => {
    const r = parseFinnUrl(url);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe(code);
      expect(r.message.length).toBeGreaterThan(10);
    }
  });
});
