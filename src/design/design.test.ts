import { describe, expect, it } from 'vitest';
import { bidMargin, equityLine, floorToThousand, formatResult, hourlyLine, maxBidLine, profitTone } from './finance/present';
import { VARIANTS, routingVariantFromHash, variantHref } from './variants';

describe('designvarianter og ruting', () => {
  it('har Original og Finance tilgjengelig og Investment/Property som «kommer senere»', () => {
    const by = Object.fromEntries(VARIANTS.map((v) => [v.id, v]));
    expect(by.original.status).toBe('available');
    expect(by.finance.status).toBe('available');
    expect(by.investment.status).toBe('soon');
    expect(by.property.status).toBe('soon');
  });

  it('velger rutertre ut fra adressen – også ved direkte åpning og oppdatering av siden', () => {
    expect(routingVariantFromHash('')).toBe('original');
    expect(routingVariantFromHash('#/')).toBe('original');
    expect(routingVariantFromHash('#/oversikt')).toBe('original');
    expect(routingVariantFromHash('#/design')).toBe('original');
    expect(routingVariantFromHash('#/design/original')).toBe('original');
    expect(routingVariantFromHash('#/design/finance')).toBe('finance');
    expect(routingVariantFromHash('#/design/finance/')).toBe('finance');
    expect(routingVariantFromHash('#/design/finance/oversikt')).toBe('finance');
    expect(routingVariantFromHash('#/design/finance/objekter/abc?x=1')).toBe('finance');
    // lignende prefiks skal ikke treffe
    expect(routingVariantFromHash('#/design/financeX')).toBe('original');
  });

  it('gir hash-lenker inn i hver variant', () => {
    expect(variantHref('finance')).toBe('#/design/finance');
    expect(variantHref('original').startsWith('#/')).toBe(true);
  });
});

describe('Finance: presentasjonshjelpere (regner ikke noe nytt)', () => {
  it('runder maksbud ned til hele tusen som i Original', () => {
    expect(floorToThousand(2_733_999)).toBe(2_733_000);
    expect(floorToThousand(950_000)).toBe(950_000);
    expect(floorToThousand(12_450_999)).toBe(12_450_000);
  });

  it('forklarer hva som begrenser maksbudet', () => {
    expect(maxBidLine({ limitedBy: 'hourly', profitTarget: 400_000, minPerHour: 500 })).toMatch(/minst .*500.* per egeninnsatstime/);
    expect(maxBidLine({ limitedBy: 'profit', profitTarget: 400_000, minPerHour: 500 })).toMatch(/minimumsfortjeneste på .*400/);
    expect(maxBidLine({ limitedBy: 'profit', profitTarget: null, minPerHour: null })).toBe('Maksbudet begrenses av ønsket minimumsfortjeneste.');
    expect(maxBidLine({ limitedBy: null, profitTarget: null, minPerHour: null })).toMatch(/ikke beregnes/);
  });

  it('beskriver avstanden mellom kjøpspris og maksbud, og tåler ukjent kjøpspris', () => {
    expect(bidMargin(2_733_000, 2_950_000)).toMatchObject({ kind: 'over', amount: 217_000 });
    expect(bidMargin(2_733_000, 2_500_000)).toMatchObject({ kind: 'under', amount: 233_000 });
    expect(bidMargin(2_733_000, 2_733_000)).toMatchObject({ kind: 'lik', amount: 0 });
    expect(bidMargin(2_733_000, null)).toBeNull();
  });

  it('formaterer tall robust: store, negative og ukjente verdier', () => {
    for (const [n, expected] of [
      [950_000, '950'],
      [3_847_500, '3'],
      [12_450_000, '12'],
    ] as const) {
      expect(formatResult(n, '?')).toContain(expected);
    }
    // minustegn (U+2212) i nb-NO, ikke bindestrek
    expect(formatResult(-2_930_800, '?')).toMatch(/^[−-]/);
    expect(formatResult(null, 'Ikke avklart')).toBe('Ikke avklart');
    expect(formatResult(undefined, 'Ikke avklart')).toBe('Ikke avklart');
    expect(formatResult(Number.NaN, 'Ikke avklart')).toBe('Ikke avklart');
    expect(formatResult(Number.POSITIVE_INFINITY, 'Ikke avklart')).toBe('Ikke avklart');
  });

  it('setter tone ut fra fortegn, og ukjent er nøytralt – ikke rødt eller grønt', () => {
    expect(profitTone(172_600)).toBe('pos');
    expect(profitTone(-1)).toBe('neg');
    expect(profitTone(0)).toBe('neutral');
    expect(profitTone(null)).toBe('neutral');
    expect(profitTone(undefined)).toBe('neutral');
  });

  it('timesats: ukjent er ukjent (ikke 0), og kravet oppfylt/ikke oppfylt er tekst – ikke bare farge', () => {
    const unknown = hourlyLine({ profitPerOwnHour: null, minProfitPerOwnHour: 500, meetsHourlyRequirement: null, ownHours: null });
    expect(unknown).toMatchObject({ unknown: true, tone: 'neutral', value: 'Ikke beregnet' });
    expect(unknown.sub).toMatch(/ikke avklart/i);
    expect(hourlyLine({ profitPerOwnHour: null, minProfitPerOwnHour: 500, meetsHourlyRequirement: null, ownHours: 0 }).sub).toMatch(/Ingen egne timer/);
    const ok = hourlyLine({ profitPerOwnHour: 742, minProfitPerOwnHour: 500, meetsHourlyRequirement: true, ownHours: 233 });
    expect(ok.tone).toBe('pos');
    expect(ok.sub).toMatch(/oppfylt/);
    const bad = hourlyLine({ profitPerOwnHour: 497, minProfitPerOwnHour: 500, meetsHourlyRequirement: false, ownHours: 255 });
    expect(bad.tone).toBe('warn');
    expect(bad.sub).toMatch(/ikke oppfylt/);
    expect(hourlyLine({ profitPerOwnHour: 700, minProfitPerOwnHour: null, meetsHourlyRequirement: null, ownHours: 100 }).sub).toMatch(/ikke satt/);
  });

  it('egenkapital: finansieringsgap vises som tekst, og uoppgitt egenkapital er ikke 0', () => {
    const gap = equityLine({ equityNeed: 1_102_400, equityGap: 802_400, availableEquity: 300_000 });
    expect(gap.tone).toBe('neg');
    expect(gap.sub).toMatch(/Finansieringsgap/);
    const covered = equityLine({ equityNeed: 250_000, equityGap: 0, availableEquity: 300_000 });
    expect(covered.tone).toBe('pos');
    expect(covered.sub).toMatch(/Dekket/);
    const unknown = equityLine({ equityNeed: 250_000, equityGap: null, availableEquity: null });
    expect(unknown.tone).toBe('neutral');
    expect(unknown.sub).toMatch(/ikke oppgitt/);
  });
});
