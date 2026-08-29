import { describe, expect, it } from 'vitest';
import { leistung, segmente, verteile, zaehlt } from '../services/Fortschritt';

const A = [
  { id: 1, lph: 1, bezeichnung: 'LPH 1', honorar_cent: 200000, fortschritt_prozent: 100, beauftragt: true, status: 'fertig' },
  { id: 2, lph: 2, bezeichnung: 'LPH 2', honorar_cent: 2000000, fortschritt_prozent: 100, beauftragt: true, status: 'abgenommen' },
  { id: 3, lph: 3, bezeichnung: 'LPH 3', honorar_cent: 2500000, fortschritt_prozent: 60, beauftragt: true, status: 'laufend' },
  { id: 6, lph: 6, bezeichnung: 'LPH 6', honorar_cent: 1300000, fortschritt_prozent: 0, beauftragt: false, status: 'offen' },
  { id: 9, lph: null, bezeichnung: 'Nachtrag', art: 'nachtrag', honorar_cent: 500000, fortschritt_prozent: 100, beauftragt: true, status: 'entfallen' },
  { id: 10, lph: null, bezeichnung: 'Ohne Honorar', honorar_cent: 0, fortschritt_prozent: 50, beauftragt: true, status: 'offen' },
];

describe('Fortschritt', () => {
  it('rechnet Leistung wie das Backend (netto, nur zählende Abschnitte)', () => {
    const k = leistung(A);
    expect(k.honorar_gesamt_cent).toBe(6500000);
    expect(k.honorar_beauftragt_cent).toBe(4700000);
    expect(k.leistung_cent).toBe(200000 + 2000000 + 1500000);
    expect(k.prozent).toBe(Math.round((3700000 * 1000) / 4700000) / 10);
    expect(leistung([])).toEqual({ honorar_gesamt_cent: 0, honorar_beauftragt_cent: 0, leistung_cent: 0, prozent: 0 });
    expect(zaehlt({ beauftragt: true })).toBe(true);
    expect(zaehlt({ beauftragt: true, status: 'entfallen' })).toBe(false);
  });

  it('bildet Segmente proportional zum Honorar und markiert Nicht-Zählende', () => {
    const s = segmente(A);
    expect(s.map((x) => x.id)).toEqual([1, 2, 3, 6, 9]); // 0-Honorar fällt raus
    expect(s.reduce((sum, x) => sum + x.anteil, 0)).toBeCloseTo(1, 10);
    expect(s[0].titel).toBe('LPH 1');
    expect(s[3].zaehlt).toBe(false);
    expect(s[4]).toMatchObject({ titel: 'Nachtrag', art: 'nachtrag', zaehlt: false });
  });

  it('verteilt exakt mit Rest auf den größten Anteil', () => {
    const b = verteile(10000001, [2, 20, 25, 5, 15, 13, 4, 15, 1]);
    expect(b.reduce((s, x) => s + x, 0)).toBe(10000001);
    expect(b[2]).toBeGreaterThanOrEqual(b[1]);
    expect(verteile(100, [0, 0])).toEqual([0, 0]);
  });
});
