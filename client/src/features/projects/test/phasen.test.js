import { describe, expect, it } from 'vitest';
import {
  PHASEN, datum, dringlichkeit, modellTitel, phaseTitel, phaseToken, rolleTitel, tageBis,
} from '../services/Phasen';

describe('Phasen-Vokabular', () => {
  it('kennt die sechs Phasenordner in Reihenfolge', () => {
    expect(PHASEN.map((p) => p.id)).toEqual([
      '00_Angebote', '01_Laufend', '02_Pausiert', '03_Abgeschlossen', '04_Abgelehnt', '05_Bezahlt',
    ]);
    expect(phaseTitel('01_Laufend')).toBe('Laufend');
    expect(phaseTitel(null)).toBe('Ohne Ordner');
    expect(phaseTitel('99_Fremd')).toBe('99_Fremd');
    expect(phaseToken('00_Angebote')).toBe('--prj-phase-angebot');
    expect(phaseToken(null)).toBe('--prj-text-dim');
  });

  it('übersetzt Modelle und Rollen, unbekanntes bleibt sichtbar', () => {
    expect(modellTitel('hoai')).toBe('HOAI-Leistungsphasen');
    expect(modellTitel(undefined)).toBe('—');
    expect(rolleTitel('rechnungsempfaenger')).toBe('Rechnungsempfänger');
    expect(rolleTitel('chef')).toBe('chef');
  });

  it('formatiert Daten deutsch und rechnet Dringlichkeit', () => {
    expect(datum('2027-03-01')).toBe('01.03.2027');
    expect(datum('')).toBe('—');
    expect(datum('kaputt')).toBe('—');
    const heute = new Date(2027, 1, 20); // 20.02.2027
    expect(tageBis('2027-03-01', heute)).toBe(9);
    expect(tageBis('2027-02-19', heute)).toBe(-1);
    expect(tageBis(null, heute)).toBeNull();
    expect(dringlichkeit('2027-02-19', 14, heute)).toBe('ueberfaellig');
    expect(dringlichkeit('2027-03-01', 14, heute)).toBe('bald');
    expect(dringlichkeit('2027-06-01', 14, heute)).toBe('ruhig');
    expect(dringlichkeit(null, 14, heute)).toBeNull();
  });
});
