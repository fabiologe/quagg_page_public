/** P2.7: ISO-8859-1-Dateien wurden als UTF-8 gelesen — „Möchn" kam als „M�chn" an. */
import { describe, it, expect } from 'vitest';
import { dekodiereXml } from '../utils/xmlKodierung.js';

const latin1 = (s) => Uint8Array.from([...s].map(c => c.charCodeAt(0)));

describe('dekodiereXml', () => {
    it('ISO-8859-1 laut Kopf → Umlaute richtig', () => {
        const xml = '<?xml version="1.0" encoding="ISO-8859-1"?><K><Strasse>Möchnstraße</Strasse></K>';
        expect(dekodiereXml(latin1(xml))).toContain('Möchnstraße');
        // zum Vergleich der alte Weg
        expect(new TextDecoder('utf-8').decode(latin1(xml))).not.toContain('Möchnstraße');
    });
    it('UTF-8 (mit und ohne BOM) und fehlende Angabe → UTF-8', () => {
        const u = new TextEncoder().encode('<?xml version="1.0" encoding="UTF-8"?><K>Ä</K>');
        expect(dekodiereXml(u)).toContain('<K>Ä</K>');
        const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('<K>ü</K>')]);
        expect(dekodiereXml(bom)).toBe('<K>ü</K>');
        expect(dekodiereXml(new TextEncoder().encode('<K>ö</K>'))).toBe('<K>ö</K>');
    });
    it('unbekannte Kodierung → UTF-8 statt Absturz', () => {
        expect(dekodiereXml(new TextEncoder().encode('<?xml version="1.0" encoding="x-quatsch"?><K/>'))).toContain('<K/>');
    });
});
