// Dieselben Grenzwerte wie backend core/belege.py (test_belege.py) — 1:1.
import { describe, expect, it } from 'vitest';
import { belegVorschlag, pruefePlausibilitaet } from '../composables/useBelegPlausibilitaet';

describe('pruefePlausibilitaet', () => {
  it('akzeptiert exakte und ±1-Cent-Werte, lehnt ±2 ab', () => {
    expect(pruefePlausibilitaet(10000, 19, 11900).ok).toBe(true);
    expect(pruefePlausibilitaet(10000, 19, 11901).ok).toBe(true);
    expect(pruefePlausibilitaet(10000, 19, 11899).ok).toBe(true);
    expect(pruefePlausibilitaet(10000, 19, 11902).ok).toBe(false);
    expect(pruefePlausibilitaet(10000, 19, 11898).ok).toBe(false);
  });

  it('rundet kaufmaennisch wie das Backend', () => {
    expect(pruefePlausibilitaet(999, 19, 1189).ok).toBe(true); // 189,81 -> 190
  });

  it('behandelt 0 % und fehlende Werte', () => {
    expect(pruefePlausibilitaet(10000, 0, 10000).ok).toBe(true);
    expect(pruefePlausibilitaet(null, 19, 11900).ok).toBe(false);
    expect(pruefePlausibilitaet(10000, 5, 11900).ok).toBe(false); // kein Satz
  });
});

describe('belegVorschlag', () => {
  it('trifft die GWG-Grenzen exakt', () => {
    expect(belegVorschlag(24999).stufe).toBe('sofortaufwand');
    expect(belegVorschlag(25000).stufe).toBe('gwg');
    expect(belegVorschlag(25000).kontoVorschlag).toBe('6260');
    expect(belegVorschlag(80000).stufe).toBe('gwg');
    expect(belegVorschlag(80001).stufe).toBe('aktivierung');
    expect(belegVorschlag(null).stufe).toBeNull();
  });

  it('erinnert bei GWG an das Anlageverzeichnis', () => {
    expect(belegVorschlag(30000).hinweis).toContain('Anlageverzeichnis');
  });
});
