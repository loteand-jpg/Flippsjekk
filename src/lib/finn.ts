/**
 * Normalisering av FINN-lenker til FINN-ID. Gjør aldri nettverkskall.
 */
export type FinnParseResult =
  | { ok: true; finnId: string; canonicalUrl: string }
  | { ok: false; code: FinnParseError; message: string };

export type FinnParseError = 'empty' | 'not_url' | 'wrong_host' | 'wrong_protocol' | 'unsupported_path' | 'missing_id' | 'invalid_id';

const ALLOWED_HOSTS = new Set(['finn.no', 'www.finn.no', 'm.finn.no']);
const ID_RE = /^[1-9]\d{5,11}$/;

export function canonicalFinnUrl(finnId: string): string {
  return `https://www.finn.no/realestate/homes/ad.html?finnkode=${finnId}`;
}

export function parseFinnUrl(raw: string): FinnParseResult {
  const input = raw.trim();
  if (!input) return { ok: false, code: 'empty', message: 'Lim inn en FINN-lenke eller en FINN-kode.' };

  // Bare FINN-kode
  if (/^\d+$/.test(input)) {
    return ID_RE.test(input)
      ? { ok: true, finnId: input, canonicalUrl: canonicalFinnUrl(input) }
      : { ok: false, code: 'invalid_id', message: 'FINN-koden må være 6–12 sifre og kan ikke starte med 0.' };
  }

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    return { ok: false, code: 'not_url', message: 'Dette ser ikke ut som en gyldig lenke.' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, code: 'wrong_protocol', message: 'Lenken må starte med https://.' };
  }
  const host = url.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) {
    return {
      ok: false,
      code: 'wrong_host',
      message: `Lenken er fra «${host}». Flippsjekk analyserer foreløpig bare boligannonser fra finn.no.`,
    };
  }

  const path = url.pathname.replace(/\/+$/, '');
  // Kortlenke: finn.no/478027403
  const short = path.match(/^\/(\d+)$/);
  if (short) {
    return validateId(short[1]);
  }
  // finn.no/realestate/homes/ad.html?finnkode=…
  if (/^\/realestate\/homes\/ad\.html$/i.test(path)) {
    const code = url.searchParams.get('finnkode');
    if (!code) return { ok: false, code: 'missing_id', message: 'Lenken mangler finnkode.' };
    return validateId(code.trim());
  }
  // Nyere FINN-format: /realestate/homes/ad/<id> eller /realestate/homes/<id>
  const pathId = path.match(/^\/realestate\/homes\/(?:ad\/)?(\d+)$/i);
  if (pathId) return validateId(pathId[1]);

  if (/^\/realestate\//i.test(path)) {
    return {
      ok: false,
      code: 'unsupported_path',
      message: 'Lenken gjelder en annen eiendomskategori enn bolig til salgs. Bruk en annonse under «Bolig til salgs».',
    };
  }
  return {
    ok: false,
    code: 'unsupported_path',
    message: 'Lenken ser ikke ut til å være en boligannonse på FINN. Kopier lenken fra selve annonsesiden.',
  };
}

function validateId(id: string): FinnParseResult {
  if (!ID_RE.test(id)) {
    return { ok: false, code: 'invalid_id', message: 'FINN-koden i lenken er ugyldig (forventet 6–12 sifre).' };
  }
  return { ok: true, finnId: id, canonicalUrl: canonicalFinnUrl(id) };
}
