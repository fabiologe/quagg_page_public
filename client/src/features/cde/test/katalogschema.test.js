/**
 * Das Katalogschema (Teil XXIII, A5, Befund S8): EINE Prüfung für alles, was
 * aus einem Repo aktiv wird. Zwei Richtungen:
 *  - alles EINGEBAUTE besteht sie (sonst wiese der Katalog sein eigenes Gut ab),
 *  - jeder bekannte Fehlerfall wird mit Grund abgewiesen.
 */
import { describe, expect, it } from 'vitest';
import { pruefeEintrag, eingebauteRollen } from '../services/katalog/Katalogschema.js';
import { EINGEBAUTE_REZEPTE } from '../services/rezept/Eingebaut.js';
import { EINGEBAUTE_PROFILE } from '../services/bauform/Typprofile.js';
import { MITGELIEFERTE_REGELN } from '../services/bauform/Bauformregeln.js';
import { EINGEBAUTE_VORLAGEN, pruefeVorlage } from '../services/Bibliothek.js';
import { BEARBEITUNGEN, werkzeugRollen } from '../services/Bearbeitungen.js';

const ROLLEN = new Set([...eingebauteRollen(), ...werkzeugRollen(BEARBEITUNGEN)]);
const fehlerVon = (art, e, opt) => pruefeEintrag(art, e, opt).fehler.join(' | ');

describe('alles Eingebaute besteht die Prüfung', () => {
    it('jede Rezept-Deklaration (unter neuer Id — die eingebaute Id ist vergeben)', () => {
        for (const d of EINGEBAUTE_REZEPTE) {
            expect(fehlerVon('rezept', { ...d, id: `${d.id}-kopie` }), d.id).toBe('');
        }
    });
    it('jedes Typprofil, gegen den Wortschatz aus Profilen UND Werkzeugen', () => {
        for (const [kategorie, p] of Object.entries(EINGEBAUTE_PROFILE)) {
            expect(fehlerVon('typprofil', { kategorie, ...p }, { rollen: ROLLEN }), kategorie).toBe('');
        }
    });
    it('jede mitgelieferte Bauformregel und jede eingebaute Vorlage', () => {
        for (const r of MITGELIEFERTE_REGELN) expect(fehlerVon('bauformregel', r), r.id).toBe('');
        for (const v of EINGEBAUTE_VORLAGEN) expect(fehlerVon('vorlage', v), v.id).toBe('');
    });
    it('jede Werkzeugrolle kennt ein eingebautes Profil — sonst fragte ein Werkzeug ins Leere', () => {
        const eingebaut = eingebauteRollen();
        expect([...werkzeugRollen(BEARBEITUNGEN)].filter(r => !eingebaut.has(r))).toEqual([]);
    });
});

describe('Rezept-Deklaration: nur Daten, nur Bekanntes', () => {
    const gut = { ...EINGEBAUTE_REZEPTE.find(d => d.id === 'pfosten'), id: 'poller' };

    it('Code-Schlüssel und unbekannte Schlüssel', () => {
        expect(fehlerVon('rezept', { ...gut, baue: 'x', leite: 'y' })).toMatch(/„baue".*„leite"/);
        expect(fehlerVon('rezept', { ...gut, baue: () => null })).toMatch(/enthält Code/);
    });
    it('eingebaute Ids und Ableitungen sind vergeben', () => {
        expect(fehlerVon('rezept', { ...gut, id: 'rohr' })).toMatch(/eingebaut/);
        expect(fehlerVon('rezept', { ...gut, id: 'kanalgraben' })).toMatch(/eingebaut/);
        expect(fehlerVon('rezept', { ...gut, id: 'Poller Groß' })).toMatch(/Kleinbuchstaben/);
    });
    it('Geometrie und Bauform passen zusammen, Profile nennen Zahlfelder', () => {
        expect(fehlerVon('rezept', { ...gut, bauform: 'linie' })).toMatch(/trägt die Bauform „linie" nicht/);
        expect(fehlerVon('rezept', { ...gut, geometrie: { ...gut.geometrie, profil: { art: 'rechteck', breite: 'b', tiefe: 'tiefe' } } }))
            .toMatch(/Feld „b" gibt es nicht/);
        expect(fehlerVon('rezept', { ...gut, geometrie: { ...gut.geometrie, profil: { art: 'stern' } } })).toMatch(/Profilart „stern"/);
        expect(fehlerVon('rezept', { ...gut, hoechstPunkte: undefined })).toMatch(/EINEM Ort/);
    });
    it('die Klasse muss der Schreiber annehmen', () => {
        expect(fehlerVon('rezept', { ...gut, kategorieVorgabe: 'IFCFEATUREELEMENT' })).toMatch(/schreiben kann/);
    });
    it('eine Kante braucht eine Achse', () => {
        expect(fehlerVon('rezept', { ...gut, netzrolle: 'kante' })).toMatch(/braucht eine Achse/);
    });
});

describe('Typprofil und Bauformregel', () => {
    it('ein vertippter Rollenname — mit Vorschlag', () => {
        const f = fehlerVon('typprofil', { kategorie: 'IFCPIPESEGMENT', bauform: 'achse+profil', felder: { profilGrosse: { typ: 'zahl' } } }, { rollen: ROLLEN });
        expect(f).toMatch(/Rolle „profilGrosse" kennt kein Werkzeug — gemeint „profilGroesse"\?/);
    });
    it('Kategorie, Bauform, Netzrolle', () => {
        expect(fehlerVon('typprofil', { kategorie: 'IFCQUATSCH', bauform: 'wolke', netzrolle: 'mitte', felder: {} }))
            .toMatch(/IFCQUATSCH.*Wörterbuch.*Bauform „wolke".*Netzrolle „mitte"/);
    });
    it('eine Regel mit unbekanntem Operator träfe nie — abgewiesen', () => {
        const r = { ...MITGELIEFERTE_REGELN[0], condition: { ...MITGELIEFERTE_REGELN[0].condition, operator: 'gleich' } };
        expect(fehlerVon('bauformregel', r)).toMatch(/Operator „gleich"/);
    });
});

describe('die Vorlage behält ihre Antwortform', () => {
    it('`pruefeVorlage` sagt den ERSTEN Grund, wie bisher', () => {
        expect(pruefeVorlage({ name: '', rezept: 'rohr' })).toEqual({ ok: false, grund: 'Der Name fehlt.' });
        expect(pruefeVorlage({ name: 'X', rezept: 'gibtsnicht' }).grund).toMatch(/Unbekanntes Rezept/);
        expect(pruefeVorlage({ name: 'X', rezept: 'rohr', vorgaben: { dn: [300] } }).grund).toMatch(/kein einfacher Wert/);
        expect(pruefeVorlage(EINGEBAUTE_VORLAGEN[0])).toEqual({ ok: true, grund: null });
    });
});
