// Rundung 1:1 wie Backend (test_xrechnung.py) und DB-GENERATED-Spalte.
import { describe, expect, it } from 'vitest';
import {
  mengeZuTausendstel, positionsBetragCent, rechnungSummen, tausendstelAlsText,
} from '../composables/useRechnungSummen';

describe('positionsBetragCent', () => {
  it('rundet kaufmaennisch wie die DB', () => {
    expect(positionsBetragCent(500, 1)).toBe(1);      // 0,5 -> 1
    expect(positionsBetragCent(1500, 1)).toBe(2);     // 1,5 -> 2
    expect(positionsBetragCent(1499, 1)).toBe(1);
    expect(positionsBetragCent(12500, 9500)).toBe(118750);
  });
});

describe('rechnungSummen', () => {
  it('summiert positionsweise und besteuert die Nettosumme', () => {
    const summen = rechnungSummen([
      { menge_tausendstel: 12500, einzelpreis_cent: 9500 },
      { menge_tausendstel: 1000, einzelpreis_cent: 4200 },
    ], 19);
    expect(summen.netto).toBe(122950);
    expect(summen.steuer).toBe(Math.floor((122950 * 19 + 50) / 100));
    expect(summen.brutto).toBe(summen.netto + summen.steuer);
  });
});

describe('mengeZuTausendstel', () => {
  it('liest deutsche und englische Dezimalmengen', () => {
    expect(mengeZuTausendstel('12,5')).toBe(12500);
    expect(mengeZuTausendstel('12.5')).toBe(12500);
    expect(mengeZuTausendstel('3')).toBe(3000);
    expect(mengeZuTausendstel('0,001')).toBe(1);
    expect(mengeZuTausendstel('abc')).toBeNull();
    expect(mengeZuTausendstel('0')).toBeNull();
    expect(mengeZuTausendstel('1,2345')).toBeNull();
  });
  it('formatiert zurueck', () => {
    expect(tausendstelAlsText(12500)).toBe('12,5');
    expect(tausendstelAlsText(3000)).toBe('3');
    expect(tausendstelAlsText(1)).toBe('0,001');
  });
});
