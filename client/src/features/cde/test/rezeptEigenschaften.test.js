/**
 * Das Rezept sagt, was es kann (Teil XXIII, A3).
 *
 * Bis A3 fragten 19 Stellen ausserhalb des Katalogs nach dem REZEPTNAMEN
 * (`rezept === 'rohr'`, `new Set(['linie', 'rohr', …])`, `{ kanalgraben: … }[b.rezept]`).
 * Jetzt fragen sie nach einer Eigenschaft. Dass keine solche Stelle
 * zurückkommt, hält der Architektur-Wächter (W3, Liste leer); hier steht,
 * dass die Eigenschaften da sind und stimmen.
 */
import { describe, expect, it } from 'vitest';
import { REZEPTE, rezeptNach } from '../services/Bauteilrezepte.js';
import { ABLEITUNGEN } from '../services/ableitung/Ableitungen.js';
import { cdeZugEintraege } from '../services/LaengsschnittSicht.js';

describe('Die Eigenschaften, nach denen gefragt wird', () => {
    it('wer seine Ecken in `parameter.punkte` trägt, sagt es', () => {
        const mit = Object.values(REZEPTE).filter(r => r.punkteIn === 'parameter').map(r => r.id).sort();
        expect(mit).toEqual(['flaeche', 'linie', 'pfosten', 'platte', 'rohr', 'schacht']);
        // Der Erdbau trägt sie in den Operationen — und sagt das über `punktlisten`.
        expect(typeof ABLEITUNGEN.erdbau.punktlisten).toBe('function');
    });

    it('die Rolle im Netz: Kante und Knoten', () => {
        expect(rezeptNach('rohr').netzrolle).toBe('kante');
        expect(rezeptNach('schacht').netzrolle).toBe('knoten');
        expect(rezeptNach('linie').netzrolle).toBeUndefined();
    });

    it('ein Ring ist, was `geschlossen` sagt', () => {
        expect(Object.values(REZEPTE).filter(r => r.geschlossen).map(r => r.id)).toEqual(['flaeche', 'platte']);
    });

    it('Gelände im Mengen-Reiter: das alte geformte Gelände und die Anzeige', () => {
        expect(Object.values({ ...REZEPTE, ...ABLEITUNGEN }).filter(r => r.gelaendeform).map(r => r.id).sort())
            .toEqual(['anzeige', 'gelaende']);
    });

    it('die Summe aller Vorgänge trägt genau ein Rezept', () => {
        expect(Object.values(ABLEITUNGEN).filter(r => r.summe).map(r => r.id)).toEqual(['anzeige']);
    });

    it('Mengenzeile: so heisst ein Vorgang im Reiter — nur wo er nicht „Gelände formen" ist', () => {
        expect(rezeptNach('kanalgraben').mengenzeile).toBe('Kanalgraben');
        expect(rezeptNach('bauwerksgrube').mengenzeile).toBe('Baugrube');
        expect(rezeptNach('erdbau').mengenzeile).toBeUndefined();
    });
});

describe('Der Quellname ist die Umkehrung des Teilnamens — an EINER Stelle', () => {
    it('`quellnameAus` gibt zurück, was `teile[0].name` angehängt hat', () => {
        const r = rezeptNach('anzeige');
        const name = r.teile[0].name('Urgelände R02');
        expect(name).not.toBe('Urgelände R02');
        expect(r.quellnameAus({ name })).toBe('Urgelände R02');
    });
    it('ohne Namen: null, kein leerer Text', () => {
        expect(rezeptNach('anzeige').quellnameAus({})).toBeNull();
    });
});

describe('Der Längsschnitt fragt die Netzrolle — und das Rezept bleibt, was es war', () => {
    const plan = { rezept: 'rohr', kategorie: 'IFCPIPESEGMENT', name: 'H1',
                   parameter: { punkte: [[0, 297, 0], [30, 296.7, 0]], dn: 300 } };
    it('eine Kante bekommt den neuen Endpunkt', () => {
        const e = cdeZugEintraege([{ globalId: 'cde-h1', ende: 'E' }], 296.5, { bauplanVon: () => plan });
        expect(e).toHaveLength(1);
        expect(e[0].nachher.rezept).toBe('rohr');
        expect(e[0].nachher.parameter.punkte.at(-1)[1]).toBeCloseTo(296.5, 9);
    });
    it('ein Knoten oder eine Linie nicht — sie haben kein Gefälle', () => {
        for (const rezept of ['schacht', 'linie']) {
            expect(cdeZugEintraege([{ globalId: 'x', ende: 'E' }], 296.5, { bauplanVon: () => ({ ...plan, rezept }) })).toEqual([]);
        }
    });
});
