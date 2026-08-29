// Prueft die Cent-Arithmetik und -Formatierung — die eine Geld-Stelle des Features.
import { describe, expect, it } from 'vitest';
import { centAlsEuro, euroZuCent, summe } from '../services/Geld';

// Intl setzt geschuetzte Leerzeichen zwischen Zahl und € — fuer den Vergleich egal.
const glatt = (text) => text.replace(/[  ]/g, ' ');

describe('centAlsEuro', () => {
  it('formatiert Cent als deutschen Euro-Betrag', () => {
    expect(glatt(centAlsEuro(123456))).toBe('1.234,56 €');
    expect(glatt(centAlsEuro(5))).toBe('0,05 €');
    expect(glatt(centAlsEuro(0))).toBe('0,00 €');
  });

  it('zeigt fuer Nicht-Ganzzahlen einen Strich statt Unsinn', () => {
    expect(centAlsEuro(12.5)).toBe('—');
    expect(centAlsEuro(null)).toBe('—');
  });
});

describe('euroZuCent', () => {
  it('liest deutsche Schreibweisen', () => {
    expect(euroZuCent('1.234,56')).toBe(123456);
    expect(euroZuCent('1234,56')).toBe(123456);
    expect(euroZuCent('12,5')).toBe(1250);
    expect(euroZuCent('12')).toBe(1200);
    expect(euroZuCent(' 1.234,56 € ')).toBe(123456);
  });

  it('liest den englischen Dezimalpunkt und erkennt den Tausenderpunkt', () => {
    expect(euroZuCent('1234.56')).toBe(123456);
    expect(euroZuCent('1.234')).toBe(123400); // "1.234" ist ein Tausenderpunkt
  });

  it('gibt null fuer Unlesbares', () => {
    expect(euroZuCent('abc')).toBeNull();
    expect(euroZuCent('')).toBeNull();
    expect(euroZuCent('12,345')).toBeNull();
    expect(euroZuCent(1234)).toBeNull(); // nur Strings — Zahlen waeren schon Cent?  Nein: unklar, also ablehnen
  });

  it('behaelt das Vorzeichen', () => {
    expect(euroZuCent('-5')).toBe(-500);
  });
});

describe('summe', () => {
  it('addiert ganze Cent', () => {
    expect(summe([100, 250, 1])).toBe(351);
    expect(summe([])).toBe(0);
  });

  it('wirft bei Nicht-Ganzzahlen, statt still zu runden', () => {
    expect(() => summe([100, 2.5])).toThrow();
  });
});
