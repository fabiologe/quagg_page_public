import { describe, expect, it } from 'vitest';
import { alsCsv, minutenAlsDezimal, minutenAlsText, nachweisZeilen, textZuMinuten, wochenblatt } from '../services/Zeit';

describe('Zeit', () => {
  it('formatiert und liest Minuten', () => {
    expect(minutenAlsText(95)).toBe('1:35 h');
    expect(minutenAlsText(0)).toBe('0:00 h');
    expect(minutenAlsDezimal(95)).toBe(1.58);
    expect(textZuMinuten('1:30')).toBe(90);
    expect(textZuMinuten('1,5')).toBe(90);
    expect(textZuMinuten('2h')).toBe(120);
    expect(textZuMinuten('90m')).toBe(90);
    expect(textZuMinuten('45min')).toBe(45);
    expect(textZuMinuten('abc')).toBeNull();
    expect(textZuMinuten('')).toBeNull();
  });

  it('bildet Wochenblätter Montag bis Sonntag', () => {
    expect(wochenblatt('2027-02-03')).toEqual(['2027-02-01', '2027-02-07']);
    expect(wochenblatt('2027-02-07')).toEqual(['2027-02-01', '2027-02-07']);
  });

  it('baut den Stundennachweis mit Summenzeile und CSV', () => {
    const zeilen = nachweisZeilen([
      { id: 2, datum: '2027-02-02', taetigkeit: 'Plan; prüfen', abschnitt_id: 5, dauer_min: 30, abrechenbar: true, rechnung_id: 9 },
      { id: 1, datum: '2027-02-01', taetigkeit: 'Vermessung', abschnitt_id: null, dauer_min: 90, abrechenbar: false, rechnung_id: null },
    ], { 5: 'LPH 3' });
    expect(zeilen[0][0]).toBe('Datum');
    expect(zeilen[1]).toEqual(['2027-02-01', 'Vermessung', '', 90, 1.5, 'nein', '']);
    expect(zeilen[2]).toEqual(['2027-02-02', 'Plan; prüfen', 'LPH 3', 30, 0.5, 'ja', '#9']);
    expect(zeilen[3]).toEqual(['Summe', '', '', 120, 2, '', '']);
    expect(alsCsv(zeilen).split('\r\n')[2]).toBe('2027-02-02;"Plan; prüfen";LPH 3;30;0.5;ja;#9');
  });
});
