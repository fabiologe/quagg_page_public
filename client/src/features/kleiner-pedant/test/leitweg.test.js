// Leitweg-Pruefung — dieselben Faelle wie backend test_xrechnung.py.
import { describe, expect, it } from 'vitest';
import { pruefeLeitweg } from '../services/Leitweg';

describe('pruefeLeitweg', () => {
  it('akzeptiert das KoSIT-Beispiel', () => {
    expect(pruefeLeitweg('04011000-12345-03')).toBeNull();
  });
  it('erkennt eine falsche Pruefziffer', () => {
    expect(pruefeLeitweg('04011000-12345-99')).toMatch(/Prüfziffer/);
  });
  it('erkennt kaputte Formate', () => {
    expect(pruefeLeitweg('kein-format')).toMatch(/Muster/);
    expect(pruefeLeitweg('')).toMatch(/Muster/);
    expect(pruefeLeitweg('1-x-3')).toMatch(/Muster/);
  });
});
