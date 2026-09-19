/**
 * Bearbeitungs-Katalog (Stufe 9.0).
 *
 * Der Katalog ist die eine Liste, aus der Kontextmenü, Werkzeugleiste und
 * Befehls-Palette lesen. Zwei Eigenschaften machen ihn tragfähig, und beide
 * werden hier geprüft:
 *
 *  1. Gefiltert wird über BAUFORM und GÜTE, nie über den Kategorienamen —
 *     sonst wäre das Modul wieder an die unbegrenzte Menge der IFC-Typen
 *     gebunden.
 *  2. `anwenden` ÄNDERT NICHTS, es gibt einen Journaleintrag zurück. Nur
 *     deshalb erbt jede neue Bearbeitung die Rücknahme aus Stufe 7.
 */
import { describe, expect, it } from 'vitest';
import {
    BEARBEITUNGEN, GRUPPEN, ausGruppe, felderFuer, nachId, passende, pruefe,
} from '../services/Bearbeitungen.js';
import { REZEPTE } from '../services/Bauteilrezepte.js';
import { BAUFORMEN } from '../services/bauform/Bauformen.js';
import { profilFuer } from '../services/bauform/Typprofile.js';

const ALLES = { bauform: 'koerper', guete: 'gemessen' };

describe('Der Katalog als Vertrag', () => {
    it('gibt jedem Eintrag die Felder, auf die sich die drei Verbraucher verlassen', () => {
        for (const b of BEARBEITUNGEN) {
            expect(b.id, 'id').toBeTruthy();
            expect(b.titel, b.id).toBeTruthy();
            expect(GRUPPEN[b.gruppe], `${b.id}: gruppe`).toBeTruthy();
            expect(typeof b.anwenden, `${b.id}: anwenden`).toBe('function');
            // `bauform` darf eine Liste sein — „Bezugshöhe setzen" gilt für
            // die Achse (Rohrsohle) UND den Körper (Schachtsohle). Jeder
            // Eintrag der Liste muss aber eine echte Bauform sein, sonst
            // erschiene die Bearbeitung nie und niemand wüsste warum.
            const formen = b.bauform === '*' ? [] : (Array.isArray(b.bauform) ? b.bauform : [b.bauform]);
            expect(b.bauform === '*' || formen.length, `${b.id}: bauform`).toBeTruthy();
            for (const f of formen) expect(BAUFORMEN[f], `${b.id}: bauform ${f}`).toBeTruthy();
        }
    });

    it('vergibt jede Id nur einmal — sie wird zur Befehls-Id', () => {
        const ids = BEARBEITUNGEN.map(b => b.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('findet einen Eintrag über seine Id und erfindet keinen', () => {
        expect(nachId('kg-setzen')?.gruppe).toBe('merkmale');
        expect(nachId('gibtsnicht')).toBe(null);
    });
});

describe('passende — Filter über Bauform und Güte', () => {
    const katalog = [
        { id: 'überall',   gruppe: 'merkmale',   bauform: '*',            mindestGuete: 'unbekannt',  anwenden: () => ({}) },
        { id: 'nur-linear', gruppe: 'parametrik', bauform: 'achse+profil', mindestGuete: 'unbekannt',  anwenden: () => ({}) },
        { id: 'streng',     gruppe: 'lage',       bauform: 'achse+profil', mindestGuete: 'gemessen',   anwenden: () => ({}) },
    ];

    it('bietet Bauform-freie Bearbeitungen immer an', () => {
        const ids = passende({ bauform: 'netz', guete: 'unbekannt' }, { katalog }).map(b => b.id);
        expect(ids).toEqual(['überall']);
    });

    it('bietet lineare Bearbeitungen nur an linearen Bauteilen an', () => {
        const ids = passende({ bauform: 'achse+profil', guete: 'gemessen' }, { katalog }).map(b => b.id);
        expect(ids).toContain('nur-linear');
        expect(passende({ bauform: 'koerper', guete: 'gemessen' }, { katalog }).map(b => b.id))
            .not.toContain('nur-linear');
    });

    it('VERSCHWEIGT eine strenge Bearbeitung bei geschätzter Güte', () => {
        // Das ist der Kern: lieber nicht anbieten, als auf einer aus dem Netz
        // geschätzten Achse eine Sohlhöhe festschreiben.
        const ids = passende({ bauform: 'achse+profil', guete: 'geschaetzt' }, { katalog }).map(b => b.id);
        expect(ids).toContain('nur-linear');
        expect(ids).not.toContain('streng');
    });

    it('filtert zusätzlich nach Gruppe, wenn eine verlangt wird', () => {
        const ids = passende({ bauform: 'achse+profil', guete: 'gemessen' }, { katalog, gruppe: 'lage' })
            .map(b => b.id);
        expect(ids).toEqual(['streng']);
    });

    it('erträgt eine fehlende Einordnung, statt zu werfen', () => {
        expect(passende(null, { katalog }).map(b => b.id)).toEqual(['überall']);
    });

    it('lässt ein zusätzliches Prädikat als Ausnahme zu', () => {
        const mitGilt = [{
            id: 'sonderfall', gruppe: 'merkmale', bauform: '*', mindestGuete: 'unbekannt',
            gilt: (e) => e?.bauform === 'hoehenfeld', anwenden: () => ({}),
        }];
        expect(passende({ bauform: 'koerper', guete: 'gemessen' }, { katalog: mitGilt })).toHaveLength(0);
        expect(passende({ bauform: 'hoehenfeld', guete: 'gemessen' }, { katalog: mitGilt })).toHaveLength(1);
    });
});

describe('ausGruppe — der Einstieg über die Werkzeugleiste', () => {
    it('liefert eine Gruppe ohne jede Auswahl', () => {
        expect(ausGruppe('merkmale').every(b => b.gruppe === 'merkmale')).toBe(true);
    });

    it('liefert für eine unbekannte Gruppe eine leere Liste, nicht undefined', () => {
        expect(ausGruppe('gibtsnicht')).toEqual([]);
    });

    it('führt die Zeichenwerkzeuge — je Rezept, DAS AUS EINEM ZUG BAUT, eines (Stufe 9.4)', () => {
        // Abgeleitet aus REZEPTE, nicht daneben aufgezählt: zwei Listen, die
        // dasselbe meinen, laufen auseinander. Aber abgeleitet heisst nicht
        // „alle": `gelaende` baut mit Quellraster (`baue: null`), nicht aus
        // Punkten — als Zeichenwerkzeug war es ein toter Knopf (2026-09-17).
        const ausZug = Object.entries(REZEPTE).filter(([, r]) => typeof r.baue === 'function').map(([id]) => id);
        expect(ausGruppe('erzeugen').map(b => b.rezept)).toEqual(ausZug);
        expect(ausZug).not.toContain('gelaende');
    });

    it('bietet Erzeugen am BAUTEIL nicht an — es hat kein Subjekt', () => {
        // Sonst stünde „Linie zeichnen" im Kontextmenü des Rohrs, und das
        // Gezeichnete hätte mit dem Rohr nichts zu tun.
        const ids = passende({ bauform: 'achse+profil', guete: 'gemessen' }).map(b => b.id);
        expect(ids).not.toContain('linie-zeichnen');
        expect(ids.length).toBeGreaterThan(0);
    });
});

describe('anwenden ändert nichts — es beschreibt nur', () => {
    it('gibt einen Journaleintrag mit Art und GlobalId zurück', () => {
        const el = { globalId: '3xY', stand: { kg: '322' } };
        const eintrag = nachId('kg-setzen').anwenden(el, { kg: '331' });
        expect(eintrag).toEqual({ art: 'kg', globalId: '3xY', nachher: '331' });
    });

    it('lässt das Bauteil unangetastet', () => {
        const el = { globalId: '3xY', stand: { kg: '322' } };
        const vorher = JSON.stringify(el);
        nachId('kg-setzen').anwenden(el, { kg: '331' });
        expect(JSON.stringify(el)).toBe(vorher);
    });

    it('macht aus einem leeren Wert null — „zurück zur Regel", nicht Leerstring', () => {
        // standAus() liest null als „Eintrag herausnehmen". Ein '' bliebe als
        // Wert stehen und würde die Regelvorgabe dauerhaft überschreiben.
        const eintrag = nachId('kg-setzen').anwenden({ globalId: 'a' }, { kg: '' });
        expect(eintrag.nachher).toBe(null);
    });

    it('liest die Vorbelegung aus dem übergebenen Stand', () => {
        expect(nachId('din277-setzen').vorbelegung({ stand: { din277: 'VF' } })).toEqual({ din277: 'VF' });
        expect(nachId('din277-setzen').vorbelegung({})).toEqual({ din277: null });
    });
});

describe('felderFuer — dasselbe Feld, je Typ anders benannt', () => {
    const bearbeitung = {
        id: 'test', felder: [{
            name: 'groesse', ausTypprofil: 'profilGroesse',
            rueckfall: { titel: 'Querschnitt', einheit: 'm', typ: 'zahl' },
        }],
    };

    it('nimmt Beschriftung und Grenze aus dem Typprofil des Bauteils', () => {
        const [feld] = felderFuer(bearbeitung, profilFuer('IFCPIPESEGMENT'));
        expect(feld.name).toBe('groesse');
        expect(feld.label).toBe('DN');
        expect(feld.min).toBe(50);
    });

    it('fällt ohne Typprofil auf die Katalogvorgabe zurück', () => {
        const [feld] = felderFuer(bearbeitung, null);
        expect(feld.titel).toBe('Querschnitt');
    });

    it('reicht Felder ohne Typprofil-Rolle unverändert durch', () => {
        const [feld] = felderFuer(nachId('kg-setzen'), null);
        expect(feld.name).toBe('kg');
        expect(feld.typ).toBe('auswahl');
    });
});

describe('pruefe — Grenzen wirken, statt nur dazustehen', () => {
    const zahl = [{ name: 'dn', typ: 'zahl', min: 50, max: 4000, gueltig: { ueber: 0 } }];

    it('nimmt einen Wert innerhalb der Grenzen an', () => {
        expect(pruefe(zahl, { dn: 300 })).toEqual([]);
    });

    // GEDREHT mit K10 (Teil XXIV, Fabios E5): bis hierher wies die Prüfung
    // jede Formulargrenze ab. Jetzt sperrt nur die TECHNISCHE (`gueltig`) —
    // DN 10 und DN 99 999 sind ungewöhnlich, nicht unbaubar: sie werden
    // ausgeführt und als `wert_ausserhalb` markiert (`formularGrenzen.test.js`).
    it('Fachgrenzen sperren nicht mehr, die technische Grenze schon', () => {
        expect(pruefe(zahl, { dn: 10 })).toEqual([]);
        expect(pruefe(zahl, { dn: 99999 })).toEqual([]);
        expect(pruefe(zahl, { dn: 0 })[0]).toMatch(/muss größer als 0/);
        expect(pruefe(zahl, { dn: -300 })[0]).toMatch(/muss größer als 0/);
    });

    it('weist Nicht-Zahlen ab, statt NaN weiterzureichen', () => {
        expect(pruefe(zahl, { dn: 'dreihundert' })[0]).toMatch(/keine Zahl/);
    });

    it('verlangt Pflichtfelder, erlaubt aber ausdrücklich Leeres', () => {
        expect(pruefe(zahl, {})).toHaveLength(1);
        expect(pruefe([{ name: 'kg', typ: 'auswahl', leerErlaubt: true, optionen: [] }], { kg: '' })).toEqual([]);
    });

    it('weist einen Wert ab, der nicht in der Auswahl steht', () => {
        const feld = [{ name: 'k', typ: 'auswahl', optionen: [{ wert: 'VF', titel: 'VF' }] }];
        expect(pruefe(feld, { k: 'VF' })).toEqual([]);
        expect(pruefe(feld, { k: 'XX' })[0]).toMatch(/nicht in der Auswahl/);
    });

    it('prüft die echten Katalogfelder gegen einen echten Wert', () => {
        const felder = felderFuer(nachId('din277-setzen'), null);
        expect(pruefe(felder, { din277: 'VF' })).toEqual([]);
        expect(pruefe(felder, { din277: 'GIBTSNICHT' })).toHaveLength(1);
    });
});
