// Prueft die reine Formular-Validierung — dieselben Regeln wie der Server.
import { describe, expect, it } from 'vitest';
import { pruefeBuchung } from '../composables/useBuchungValidierung';

const gueltig = {
  buchungsdatum: '2027-01-15',
  belegdatum: '2027-01-15',
  sollkonto: '6815',
  habenkonto: '1800',
  betrag_cent: 1234,
  buchungstext: 'Buerobedarf',
};

describe('pruefeBuchung', () => {
  it('laesst eine vollstaendige Buchung durch', () => {
    expect(pruefeBuchung(gueltig)).toEqual({});
  });

  it('meldet fehlende Pflichtfelder einzeln', () => {
    const fehler = pruefeBuchung({});
    expect(Object.keys(fehler)).toEqual(expect.arrayContaining(
      ['buchungsdatum', 'belegdatum', 'sollkonto', 'habenkonto', 'betrag', 'buchungstext']));
  });

  it('verbietet gleiches Soll- und Habenkonto', () => {
    const fehler = pruefeBuchung({ ...gueltig, habenkonto: '6815' });
    expect(fehler.habenkonto).toMatch(/verschieden/);
  });

  it('verlangt einen lesbaren, positiven Cent-Betrag', () => {
    expect(pruefeBuchung({ ...gueltig, betrag_cent: null }).betrag).toMatch(/nicht lesbar/);
    expect(pruefeBuchung({ ...gueltig, betrag_cent: 12.5 }).betrag).toMatch(/nicht lesbar/);
    expect(pruefeBuchung({ ...gueltig, betrag_cent: 0 }).betrag).toMatch(/groesser|größer/);
    expect(pruefeBuchung({ ...gueltig, betrag_cent: -100 }).betrag).toMatch(/groesser|größer/);
  });

  it('verwirft einen Buchungstext aus Weissraum', () => {
    expect(pruefeBuchung({ ...gueltig, buchungstext: '   ' }).buchungstext).toBeTruthy();
  });
});
