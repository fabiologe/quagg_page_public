// @vitest-environment node
/**
 * Teil XXVI — Bauwerke aus Bauteilen (docs/cde/fahrplan-teil-xxvi-bauwerke-2026-10-01.md).
 *
 * Diese Datei wächst mit dem Teil, wie `backend/app/ifc/tests/test_bauwerke.py`
 * auf der Seite des Schreibers. Die Funde der Vorprüfung standen in Z0 mit
 * ihrem damaligen Ergebnis hier; die Stufe, die einen behebt, dreht die
 * Erwartung um und sagt im Commit, warum.
 */
import { describe, it, expect } from 'vitest';
import { baueAusBauplan, istSchreibbar, mitKennungen, pruefeBauplan, warumNichtSchreibbar } from '../services/Bauteilrezepte.js';
import { nachId } from '../services/Bearbeitungen.js';
import * as REZEPTE_MODUL from '../services/Bauteilrezepte.js';
import { meshVolume } from '../services/geometrie/MeshOps.js';
import { pruefeEintrag } from '../services/katalog/Katalogschema.js';
import { JA_NEIN } from '../services/katalog/Merkmalsziele.js';

const UMRISS = [[0, 210, 0], [5, 210, 0], [5, 210, 5], [0, 210, 5]];

describe('Z1 — Fund 1: Raumelemente sind keine Bauteile', () => {
    it('Bauteilklassen bleiben schreibbar (die Kontrolle)', () => {
        expect(['IFCSLAB', 'IFCWALL', 'IFCFOOTING'].map(istSchreibbar)).toEqual([true, true, true]);
    });

    it('Raumelemente nicht mehr — bis Z1 gingen alle fünf durch (Z0 hielt es fest)', () => {
        const raumelemente = ['IFCSPACE', 'IFCFACILITY', 'IFCFACILITYPARTCOMMON', 'IFCBUILDING', 'IFCSITE'];
        expect(raumelemente.map(istSchreibbar)).toEqual([false, false, false, false, false]);
        expect(warumNichtSchreibbar('IFCSPACE')).toMatch(/Raumelement/);
    });

    it('eine Platte als IFCSPACE scheitert jetzt schon beim Zeichnen — nicht erst beim Ausgeben', () => {
        const fehler = pruefeBauplan({ rezept: 'platte', kategorie: 'IFCSPACE', parameter: { punkte: UMRISS, dicke: 0.2 } });
        expect(fehler).toHaveLength(1);
        expect(fehler[0]).toMatch(/Raumelement/);
    });

    it('… und eine Bibliothek, die ein Raumelement als Vorgabe nennt, wird abgewiesen', () => {
        const { ok, fehler } = pruefeEintrag('rezept', {
            id: 'probe-raum', titel: 'Probe', bauform: 'flaeche+dicke', kategorieVorgabe: 'IFCSPACE',
            mindestPunkte: 3, geschlossen: true, felder: [], geometrie: { art: 'platte', dicke: 0.2 },
        });
        expect(ok).toBe(false);
        expect(fehler.join(' ')).toMatch(/Raumelement/);
    });

    it('der Grund kommt aus derselben Regel wie die Entscheidung', () => {
        for (const k of ['IFCSLAB', 'IFCSPACE', 'IFCFEATUREELEMENT', 'IFCCARTESIANPOINT', 'IFCGIBTSNICHT']) {
            expect(istSchreibbar(k)).toBe(warumNichtSchreibbar(k) === null);
        }
    });
});

// ── Z2 — Wand und Streifenfundament ─────────────────────────────────────────

/** Ein Bauteil über den ECHTEN Zeichenweg: Werkzeug → Journalschritt → Bauplan → Körper. */
function gezeichnet(werkzeug, punkte, werte) {
    const schritte = mitKennungen(() => 'cde-Z2', () => nachId(werkzeug).anwenden({ punkte, hoehenversatz: 0 }, werte, { zug: [] }));
    const schritt = [].concat(schritte).find(x => x?.art === 'erzeugt');
    return schritt.nachher;
}

/** Tiefster und höchster Punkt und das Volumen des gebauten Körpers. */
function mass(bauplan) {
    const { ok, geometrie, fehler } = baueAusBauplan(bauplan);
    expect(ok, String(fehler)).toBe(true);
    const pos = geometrie.getAttribute('position').array;
    let unten = Infinity, oben = -Infinity;
    for (let i = 1; i < pos.length; i += 3) { unten = Math.min(unten, pos[i]); oben = Math.max(oben, pos[i]); }
    const v = meshVolume(pos, pos.length / 9);
    return { unten: Math.round(unten * 1000) / 1000, oben: Math.round(oben * 1000) / 1000,
             volumen: Math.round(v.volume * 1000) / 1000, geschlossen: v.closed };
}

const FUSS = [{ x: 0, y: 210, z: 0 }, { x: 10, y: 210, z: 0 }];

describe('Z2 — die Wand steht auf ihrer Linie (E20: Fusslinie, Höhe nach oben)', () => {
    it('Wand 10,00 × 0,30 × 2,50 auf 210,00: Fuss 210,000, Krone 212,500, Volumen 7,500 m³', () => {
        const plan = gezeichnet('wand-zeichnen', FUSS, { name: 'W', kategorie: 'IFCWALL', hoehe: '', dicke: 0.3, wandhoehe: 2.5 });
        expect(plan.rezept).toBe('wand');
        expect(plan.kategorie).toBe('IFCWALL');
        // Ohne den festen Höhenbezug (Z2, eine Zeile im Kern) lag der Fuss bei 208,750.
        expect(mass(plan)).toEqual({ unten: 210, oben: 212.5, volumen: 7.5, geschlossen: true });
    });

    it('die Wandhöhe ändern hebt die Krone — der Fuss bleibt', () => {
        const plan = gezeichnet('wand-zeichnen', FUSS, { name: 'W', kategorie: 'IFCWALL', hoehe: '', dicke: 0.3, wandhoehe: 2.5 });
        const hoeher = { ...plan, parameter: { ...plan.parameter, wandhoehe: 3 } };
        expect(mass(hoeher)).toMatchObject({ unten: 210, oben: 213, volumen: 9 });
    });

    it('Streifenfundament 10,00 × 1,20 × 0,40 mit Sohle 209,60: oben 210,000, Volumen 4,800 m³', () => {
        const sohle = FUSS.map(p => ({ ...p, y: 209.6 }));
        const plan = gezeichnet('streifenfundament-zeichnen', sohle, { name: 'F', kategorie: 'IFCFOOTING', hoehe: '', breite: 1.2, dicke: 0.4 });
        expect(plan.kategorie).toBe('IFCFOOTING');
        expect(mass(plan)).toEqual({ unten: 209.6, oben: 210, volumen: 4.8, geschlossen: true });
    });

    it('ein Bezug im Bauplan geht der Deklaration vor (eine Haltung bleibt, wie sie ist)', () => {
        const plan = gezeichnet('wand-zeichnen', FUSS, { name: 'W', kategorie: 'IFCWALL', hoehe: '', dicke: 0.3, wandhoehe: 2.5 });
        const mitte = { ...plan, parameter: { ...plan.parameter, achsbezug: 'mitte' } };
        expect(mass(mitte)).toMatchObject({ unten: 208.75, oben: 211.25 });
    });

    it('eine Wand ist kein Netzglied — keine Haltungswerkzeuge', () => {
        const plan = gezeichnet('wand-zeichnen', FUSS, { name: 'W', kategorie: 'IFCWALL', hoehe: '', dicke: 0.3, wandhoehe: 2.5 });
        const { rezeptNach } = REZEPTE_MODUL;
        expect(rezeptNach(plan.rezept).netzrolle ?? null).toBeNull();
        expect(rezeptNach(plan.rezept).liefert).not.toContain('netzrolle:kante');
    });
});

// ── Z3 — Felder, die bSI-Merkmale sind ──────────────────────────────────────

describe('Z3 — ein Rezeptfeld darf ein bSI-Merkmal sein (E22)', () => {
    const rezept = (feld, kategorieVorgabe = 'IFCSLAB') => ({
        id: 'probe-merkmal', titel: 'Probe', bauform: 'flaeche+dicke', kategorieVorgabe,
        mindestPunkte: 3, geschlossen: true,
        felder: [{ name: 'dicke', typ: 'zahl', vorgabe: 0.2 }, feld], geometrie: { art: 'platte', dicke: 'dicke' },
    });
    const ja = { name: 'tragend', typ: 'auswahl', optionen: JA_NEIN, vorgabe: 'ja', leerErlaubt: true };
    const fehlerVon = (feld, k) => pruefeEintrag('rezept', rezept(feld, k)).fehler.join(' ');

    it('ein passendes Ziel besteht', () => {
        expect(pruefeEintrag('rezept', rezept({ ...ja, pset: 'Pset_SlabCommon.LoadBearing' })).ok).toBe(true);
    });
    it.each([
        ['Pset_SlabCommon.LoadBearing', 'IFCCOVERING', /gilt nicht für IFCCOVERING/],
        ['Pset_SlabCommon.Tragfaehig', 'IFCSLAB', /steht nicht in Pset_SlabCommon/],
        ['Pset_GibtsNicht.LoadBearing', 'IFCSLAB', /kennt das Wörterbuch nicht/],
        ['LoadBearing', 'IFCSLAB', /Pset_Satz\.Merkmal/],
        ['Pset_SlabCommon.Status', 'IFCSLAB', /Aufzählung/],
    ])('%s an %s wird beim Laden abgewiesen', (pset, k, grund) => {
        expect(fehlerVon({ ...ja, pset }, k)).toMatch(grund);
    });
    it('ein Wahrheitswert braucht eine Auswahl ja/nein, kein Textfeld', () => {
        expect(fehlerVon({ name: 'tragend', typ: 'text', pset: 'Pset_SlabCommon.LoadBearing' })).toMatch(/ja\/nein/);
    });
    it('alle eingebauten Rezepte bestehen mit ihren Merkmalszielen', () => {
        for (const id of ['platte', 'wand', 'streifenfundament']) {
            expect(REZEPTE_MODUL.rezeptNach(id).felder.some(f => f.pset), id).toBe(true);
        }
    });
});

describe('Z3 — die Merkmale eines Bauplans', () => {
    const { merkmaleVon } = REZEPTE_MODUL;
    it('ohne Angabe gilt die Vorgabe — wie bei einem fehlenden Mass', () => {
        expect(merkmaleVon({ rezept: 'platte', parameter: { dicke: 0.2 } })).toEqual({ Pset_SlabCommon: { LoadBearing: true } });
        expect(merkmaleVon({ rezept: 'wand', parameter: {} }))
            .toEqual({ Pset_WallCommon: { LoadBearing: true, IsExternal: true } });
    });
    it('„nein" wird falsch, nicht weggelassen', () => {
        expect(merkmaleVon({ rezept: 'wand', parameter: { tragend: 'nein', aussen: 'nein' } }))
            .toEqual({ Pset_WallCommon: { LoadBearing: false, IsExternal: false } });
    });
    it('ein Rezept ohne Merkmalsfelder liefert nichts — ein Rohr bleibt, was es war', () => {
        expect(merkmaleVon({ rezept: 'rohr', parameter: { dn: 300 } })).toEqual({});
    });
});
