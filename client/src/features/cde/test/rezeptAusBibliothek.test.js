// @vitest-environment jsdom
/**
 * Ein Bauteil, das KEINE Datei kennt (Teil XXIII, A5 — die Leitpfosten-Probe
 * aus dem Audit „Bearbeitungsstruktur").
 *
 * Zwei Rezepte existieren nur als JSON im Projekt-Repo:
 *  - LEITPFOSTEN: Stab mit Rechteckprofil, IfcSign. Registrieren → zeichnen
 *    (ein Tipp) → Reihe alle 50 m → Journal → Autor → Paket → Python-Schreiber
 *    (`test_eigenbau.py::test_leitpfosten_aus_der_bibliothek`): IfcSign,
 *    Prüftor 0 Verstösse.
 *  - RECHTECKKANAL: Sweep mit Rechteckprofil, Kante im Netz → bekommt
 *    „Haltung teilen", und die Teile bleiben Rechteckkanäle.
 * Kein Commit im Kern — nur Katalogdaten.
 *
 * Was die Probe NICHT abdeckt: Material (zu früh, kein Materialkatalog),
 * eine eigene Regel (kommt mit AR), eine Reihe ENTLANG EINER ACHSE (das
 * Werkzeug „Reihe" versetzt um feste Abstände — eine Achsreihe wäre ein
 * neues Werkzeug).
 *
 * Fixture fürs Python neu schreiben:
 *     PAKET_VERTRAG_SCHREIBEN=1 npx vitest run src/features/cde/test/rezeptAusBibliothek.test.js
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useZeichnen } from '../composables/useZeichnen.js';
import { ausGruppe, nachId, werkzeugKatalog } from '../services/Bearbeitungen.js';
import { rezeptNach } from '../services/Bauteilrezepte.js';
import { registriereRezepte } from '../services/katalog/Katalog.js';
import { profilFuer } from '../services/bauform/Typprofile.js';
import { cdeAchsenAus } from '../services/CdeAchsen.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { IfcAutor } from '../services/IfcAutor.js';
import { baueEigenbauPaket } from '../services/EigenbauPaket.js';

const FIXTURE = resolve(process.cwd(), '../backend/app/ifc/tests/daten/paket_leitpfosten.json');

const LEITPFOSTEN = {
    id: 'leitpfosten', titel: 'Leitpfosten', icon: 'cat-column', bauform: 'punkt',
    kategorieVorgabe: 'IFCSIGN', mindestPunkte: 1, hoechstPunkte: 1, geschlossen: false, hoehenAus: 'gelaende',
    felder: [
        { name: 'name', titel: 'Bezeichnung', typ: 'text', leerErlaubt: true },
        { name: 'kategorie', titel: 'IFC-Typ', typ: 'text' },
        { name: 'hoehe', titel: 'Fusshöhe', einheit: 'm', typ: 'zahl', leerErlaubt: true },
        // RAL/RPS: 1,00 m über Fahrbahnrand, dreieckiger Querschnitt 12 × 10 cm —
        // hier als Rechteck genähert (das Profil ist Daten, nicht Norm).
        { name: 'laenge', titel: 'Höhe', einheit: 'm', typ: 'zahl', vorgabe: 1 },
        { name: 'breite', titel: 'Breite', einheit: 'm', typ: 'zahl', vorgabe: 0.12 },
        { name: 'tiefe', titel: 'Tiefe', einheit: 'm', typ: 'zahl', vorgabe: 0.1 },
    ],
    geometrie: { art: 'stab', laenge: 'laenge', profil: { art: 'rechteck', breite: 'breite', tiefe: 'tiefe', einheit: 'm' } },
};
const RECHTECKKANAL = {
    id: 'rechteckkanal', titel: 'Rechteckkanal', icon: 'laengsschnitt', bauform: 'achse+profil',
    kategorieVorgabe: 'IFCPIPESEGMENT', mindestPunkte: 2, geschlossen: false, netzrolle: 'kante',
    felder: [
        { name: 'name', titel: 'Bezeichnung', typ: 'text', leerErlaubt: true },
        { name: 'kategorie', titel: 'IFC-Typ', typ: 'text' },
        { name: 'hoehe', titel: 'Höhe', einheit: 'm', typ: 'zahl', leerErlaubt: true },
        { name: 'b', titel: 'Breite', einheit: 'mm', typ: 'zahl', vorgabe: 1200 },
        { name: 'h', titel: 'Höhe', einheit: 'mm', typ: 'zahl', vorgabe: 800 },
    ],
    geometrie: { art: 'sweep', profil: { art: 'rechteck', breite: 'b', tiefe: 'h', einheit: 'mm' } },
};
/** Ein Rezept, das die Prüfung nicht besteht — es darf NICHT aktiv werden. */
const KAPUTT = { id: 'baum', titel: 'Baum', bauform: 'punkt', kategorieVorgabe: 'IFCGEOGRAPHICELEMENT',
                 mindestPunkte: 1, hoechstPunkte: 1, geschlossen: false, felder: [],
                 geometrie: { art: 'kegel' }, baue: 'return 1' };

/** Ein Repo wie die RepoFacade: Projekt, Büro, `mitVorrang`. */
function repoMit({ projekt = {}, buero = {} } = {}) {
    const lese = (quelle) => async (k) => (k in quelle ? JSON.parse(JSON.stringify(quelle[k])) : null);
    return {
        get: lese(projekt), set: async (k, v) => { projekt[k] = v; return true; },
        buero: { get: lese(buero), set: async (k, v) => { buero[k] = v; return true; } },
        mitVorrang: async (k, vorgabe) => (k in projekt ? projekt[k] : k in buero ? buero[k] : vorgabe),
    };
}

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useBearbeitung().modusSetzen(true);
});
afterEach(() => registriereRezepte([]));      // das Register ist Modulzustand — nichts in den nächsten Test tragen

async function ladeKatalogMit(repo) {
    const b = useBearbeitung();
    await b.ladeProfile(repo);
    return b;
}

describe('Registrieren: geprüft, gemeldet, nie halb', () => {
    it('das gültige Rezept wird aktiv, das kaputte gemeldet — mit Ebene und Grund', async () => {
        const b = await ladeKatalogMit(repoMit({ projekt: { 'bauteil-rezepte': [LEITPFOSTEN, KAPUTT] } }));
        expect(rezeptNach('leitpfosten')).toMatchObject({ bauform: 'punkt', herkunft: 'projekt' });
        expect(rezeptNach('baum')).toBeNull();
        expect(b.katalogBefunde).toHaveLength(1);
        expect(b.katalogBefunde[0]).toMatchObject({ art: 'rezept', id: 'baum', ebene: 'projekt' });
        expect(b.katalogBefunde[0].fehler.join(' ')).toMatch(/Unbekannter Schlüssel „baue"/);
        expect(b.katalogBefunde[0].fehler.join(' ')).toMatch(/Geometrieart „kegel"/);
    });

    it('Projekt schlägt Büro je Id; ein eingebautes Rezept überschreibt niemand', async () => {
        const b = await ladeKatalogMit(repoMit({
            buero: { 'bauteil-rezepte': [{ ...LEITPFOSTEN, titel: 'Leitpfosten (Büro)' }, { ...RECHTECKKANAL, id: 'rohr' }] },
            projekt: { 'bauteil-rezepte': [LEITPFOSTEN] },
        }));
        expect(rezeptNach('leitpfosten').titel).toBe('Leitpfosten');
        expect(rezeptNach('rohr').geometrie.profil.art).toBe('kreis');
        expect(b.katalogBefunde.map(x => x.id)).toEqual(['rohr']);
        expect(b.katalogBefunde[0].fehler.join(' ')).toMatch(/eingebaut/);
    });

    it('das Werkzeug kommt mit — ohne Zeile Code: Erzeugen-Gruppe, Palette, Store', async () => {
        const vorher = werkzeugKatalog().length;
        await ladeKatalogMit(repoMit({ projekt: { 'bauteil-rezepte': [LEITPFOSTEN, RECHTECKKANAL] } }));
        expect(werkzeugKatalog().length).toBe(vorher + 2);
        expect(ausGruppe('erzeugen').map(x => x.id)).toEqual(expect.arrayContaining(['leitpfosten-zeichnen', 'rechteckkanal-zeichnen']));
        expect(nachId('leitpfosten-zeichnen').eingaben).toEqual([{ schlitz: 'zug', anzahl: { min: 1, max: 1 } }]);
        // Ein Projektwechsel ERSETZT den Satz.
        await ladeKatalogMit(repoMit());
        expect(nachId('leitpfosten-zeichnen')).toBeNull();
        expect(werkzeugKatalog().length).toBe(vorher);
    });

    it('ein Büro-Typprofil mit vertipptem Rollennamen gilt nicht — gemeldet mit Vorschlag', async () => {
        const b = await ladeKatalogMit(repoMit({ buero: { typprofile: {
            IFCPIPESEGMENT: { bauform: 'achse+profil', netzrolle: 'kante',
                              felder: { sohlhoeheAnfnag: { label: 'Sohle oben', typ: 'zahl' } } },
        } } }));
        expect(b.katalogBefunde).toHaveLength(1);
        expect(b.katalogBefunde[0]).toMatchObject({ art: 'typprofil', id: 'IFCPIPESEGMENT' });
        expect(b.katalogBefunde[0].fehler[0]).toMatch(/gemeint „sohlhoeheAnfang"/);
        // Das eingebaute Profil gilt weiter — sonst verlöre das Rohr seine Werkzeuge.
        expect(profilFuer('IFCPIPESEGMENT', b.profilSatz).felder.sohlhoeheAnfang).toBeTruthy();
    });
});

describe('Leitpfosten: zeichnen, Reihe, Journal, Autor, Paket', () => {
    async function leitpfostenReihe() {
        const b = await ladeKatalogMit(repoMit({ projekt: { 'bauteil-rezepte': [LEITPFOSTEN] } }));
        const ae = useAenderungen();
        const zeichnen = useZeichnen({ bearbeitung: b, cde: { bearbeiter: 'Fabio' }, getModellSha: () => 'sha1',
                                       getHoehenversatz: () => 300, getHoeheAn: (x) => 10 + 0.01 * x });
        expect(zeichnen.starte('leitpfosten-zeichnen')).toBe(true);
        zeichnen.aufTreffer({ point: { x: 0, y: 10.4, z: 0 } });
        await new Promise(r => setTimeout(r, 0));
        const erster = ae.eintraege[0];
        expect(erster.nachher).toMatchObject({ rezept: 'leitpfosten', kategorie: 'IFCSIGN', bauform: 'punkt' });

        // Reihe über den Store — der Weg, auf dem `stand` entsteht.
        await b.einordne({ globalId: erster.globalId, modelId: 'cde-eigenbau', localId: 1, category: 'IFCSIGN', name: '' }, null);
        expect(b.moeglich.map(x => x.id)).toContain('reihe');
        expect(b.starte('reihe')).toBeTruthy();
        b.setzeWert('anzahl', 3); b.setzeWert('ost', 50); b.setzeWert('nord', 0);
        await b.ausfuehren({ wer: 'Fabio' });
        return { b, ae };
    }

    it('vier Pfosten im Journal, jeder baut einen geschlossenen Stab von 1,00 m', async () => {
        const { ae } = await leitpfostenReihe();
        const stand = ae.wirksamerStand('erzeugt');
        expect([...stand.values()].map(p => p.rezept)).toEqual(['leitpfosten', 'leitpfosten', 'leitpfosten', 'leitpfosten']);
        const xs = [...stand.values()].map(p => p.parameter.punkte[0][0]).sort((a, c) => a - c);
        expect(xs).toEqual([0, 50, 100, 150]);
        for (const plan of stand.values()) {
            const k = rezeptNach('leitpfosten').formAus(plan.parameter, 'koerper');
            expect(k.closed).toBe(true);
            expect(k.volumen).toBeCloseTo(1 * 0.12 * 0.1, 9);
        }
    });

    it('Paket: vier IfcSign mit Geometrie — die Fixture für den Python-Schreiber', async () => {
        const { ae } = await leitpfostenReihe();
        const s = ae.wirksamerStand('erzeugt');
        const autor = new IfcAutor({ getFragments: () => null, holeQuellForm: async () => null, kernel: erzeugeKernel(), getHoehenversatz: () => 300 });
        const schritte = [...s].map(([globalId, wert]) => ({ art: 'erzeugt', globalId, modell: 'cde', wert }));
        const g = await autor.eigenbauGeometrien(schritte, { verdeckt: new Set() });
        expect(g.misserfolge ?? []).toEqual([]);
        const paket = baueEigenbauPaket({
            teile: g.bauteile, kanten: g.kanten, stand: s, anzeigeformen: g.anzeigeformen,
            nachProjekt: (p) => ({ ost: 410300 + p.x, nord: 5460100 - p.z, hoehe: p.y - 50 }),
            crs: 'EPSG:25832', projektname: 'Leitpfosten', schluessel: 'leitpfosten',
            journal: { commit: 'c-leitpfosten', sitzungOffen: false }, jetzt: new Date('2026-09-18T00:00:00Z'),
        });
        expect(paket.bauteile.map(t => t.klasse)).toEqual(['IFCSIGN', 'IFCSIGN', 'IFCSIGN', 'IFCSIGN']);
        expect(paket.bauteile.every(t => t.rezept === 'leitpfosten' && t.dreiecke.length > 0)).toBe(true);

        if (process.env.PAKET_VERTRAG_SCHREIBEN) writeFileSync(FIXTURE, JSON.stringify(paket));
        expect(existsSync(FIXTURE), 'Fixture fehlt — mit PAKET_VERTRAG_SCHREIBEN=1 schreiben').toBe(true);
        const fix = JSON.parse(readFileSync(FIXTURE, 'utf8'));
        const form = (p) => p.bauteile.map(t => ({ klasse: t.klasse, rezept: t.rezept, n: t.dreiecke.length, k: Object.keys(t).sort() }));
        expect(form(fix)).toEqual(form(paket));
    });

    it('fehlt das Rezept (Bibliothek nicht geladen): übersprungen und gemeldet, nichts gelöscht, kein Absturz', async () => {
        const { ae } = await leitpfostenReihe();
        registriereRezepte([]);
        const s = ae.wirksamerStand('erzeugt');
        const autor = new IfcAutor({ getFragments: () => null, holeQuellForm: async () => null, kernel: erzeugeKernel(), getHoehenversatz: () => 300 });
        const schritte = [...s].map(([globalId, wert]) => ({ art: 'erzeugt', globalId, modell: 'cde', wert }));
        const g = await autor.eigenbauGeometrien(schritte, { verdeckt: new Set() });
        expect(g.bauteile).toHaveLength(0);
        expect(g.misserfolge).toHaveLength(4);
        expect(g.misserfolge[0].grund).toMatch(/„leitpfosten" gibt es nicht — stammt es aus einer Bibliothek/);
        expect(ae.wirksamerStand('erzeugt').size).toBe(4);             // das Journal bleibt
    });
});

describe('Rechteckkanal: eine Kante im Netz, die keine Datei kennt', () => {
    it('bekommt „Haltung teilen" — und die Teile bleiben Rechteckkanäle', async () => {
        const b = await ladeKatalogMit(repoMit({ projekt: { 'bauteil-rezepte': [RECHTECKKANAL] } }));
        const ae = useAenderungen();
        const zeichnen = useZeichnen({ bearbeitung: b, cde: { bearbeiter: 'Fabio' }, getModellSha: () => 'sha1',
                                       getHoehenversatz: () => 0 });
        zeichnen.starte('rechteckkanal-zeichnen');
        b.setzeWert('hoehe', 99);
        for (const p of [{ x: 0, z: 0 }, { x: 40, z: 0 }]) zeichnen.setzePunkt(p);
        await zeichnen.abschliessen();
        const gid = ae.eintraege[0].globalId;

        // Die Achse, wie der Viewer sie reicht: aus der Fachmodell-Kante (`IfcEngine.achseVon`).
        const k = cdeAchsenAus(ae.wirksamerStand('erzeugt')).kanten.find(x => x.globalId === gid);
        expect(k).toBeTruthy();
        const achse = { globalId: k.globalId, name: k.name, kategorie: k.kategorie, anfang: k.anfang, ende: k.ende,
                        polyline: k.punkte, laenge: k.laenge, dn: k.dn, quelle: 'bauplan' };
        await b.einordne({ globalId: gid, modelId: 'cde-eigenbau', localId: 1, category: 'IFCPIPESEGMENT', name: '', achse }, null);
        expect(b.moeglich.map(x => x.id)).toContain('haltung-teilen');
        expect(b.starte('haltung-teilen')).toBeTruthy();
        b.setzeWert('station', 10);
        await b.ausfuehren({ wer: 'Fabio' });
        const teile = [...ae.wirksamerStand('erzeugt').entries()].filter(([g2]) => g2 !== gid).map(([, p]) => p);
        expect(teile).toHaveLength(2);
        expect(teile.map(p => p.rezept)).toEqual(['rechteckkanal', 'rechteckkanal']);
        expect(teile.map(p => p.parameter.b)).toEqual([1200, 1200]);
    });
});
