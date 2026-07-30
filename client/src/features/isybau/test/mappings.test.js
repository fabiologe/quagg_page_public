import { describe, it, expect } from 'vitest';
import { getEntwaesserungsartColor, ENTWAESSERUNGSART_COLOR, ENTWAESSERUNGSART_DEFAULT_COLOR } from '../utils/mappings.js';

describe('getEntwaesserungsartColor', () => {
    it('KM/KR/KS liefern die drei unterschiedlichen Kanaltyp-Farben', () => {
        expect(getEntwaesserungsartColor('KM')).toBe(ENTWAESSERUNGSART_COLOR.KM);
        expect(getEntwaesserungsartColor('KR')).toBe(ENTWAESSERUNGSART_COLOR.KR);
        expect(getEntwaesserungsartColor('KS')).toBe(ENTWAESSERUNGSART_COLOR.KS);
        expect(new Set([ENTWAESSERUNGSART_COLOR.KM, ENTWAESSERUNGSART_COLOR.KR, ENTWAESSERUNGSART_COLOR.KS]).size).toBe(3);
    });

    it('fehlender/unbekannter Wert liefert die Default-Farbe (Schwarz)', () => {
        expect(getEntwaesserungsartColor(null)).toBe(ENTWAESSERUNGSART_DEFAULT_COLOR);
        expect(getEntwaesserungsartColor(undefined)).toBe(ENTWAESSERUNGSART_DEFAULT_COLOR);
        expect(getEntwaesserungsartColor('XY')).toBe(ENTWAESSERUNGSART_DEFAULT_COLOR);
        expect(ENTWAESSERUNGSART_DEFAULT_COLOR).toBe('#000000');
    });
});
