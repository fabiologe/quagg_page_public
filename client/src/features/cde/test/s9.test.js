/**
 * S9 — die Werkzeuge, die die Bauform-Tabelle (Teil IX) noch offen liess
 * (Teil XVI, 2026-09-09): Linie teilen / trimmen / versetzen / umkehren,
 * Fläche versetzen / teilen / vereinigen, Tauschen aus der Bibliothek.
 *
 * Alles reine Katalogeinträge an EIGENEN Bauteilen (Bauplan); geprüft an
 * `anwenden`. Die Gehrung des Versetzens ist DIESELBE wie im Kernel-Offset —
 * ein Weg, deshalb steht das hier als Vertrag.
 */
import { describe, expect, it } from 'vitest';
import { nachId, passende, felderFuer } from '../services/Bearbeitungen.js';
import {
    versetzePunktliste, trimmePunktliste, teilePunktlisteAnStation, teileRingMitGerade, vereinigeRinge,
} from '../services/Bauteilrezepte.js';
import { offset, versetztePunkte, ringFlaeche } from '../services/geometrie/ops/Linien.js';
import { eingabenFuer } from '../services/Eingaben.js';
import { kandidatenAus } from '../services/kommando/Kandidaten.js';
import { EINGEBAUTE_VORLAGEN } from '../services/Bibliothek.js';
import { profilFuer } from '../services/bauform/Typprofile.js';
import { rezeptNach } from '../services/Bauteilrezepte.js';

const b = (id) => nachId(id);
const EIGEN = (rezept, punkte, extra = {}) => ({
    globalId: 'cde1', modelId: 'cde-eigenbau', category: 'IFCANNOTATION', name: 'L1',
    versatz: { x: 0, y: 0, z: 0 }, hoehenversatz: 0,
    stand: { bauplan: { rezept, kategorie: 'IFCANNOTATION', name: 'L1', parameter: { punkte } } },
    ...extra,
});
const L = [[0, 1, 0], [4, 1, 0], [4, 2, 4]];                 // Knick bei (4,0)
const RING = [[0, 5, 0], [4, 5, 0], [4, 5, 4], [0, 5, 4]];   // Quadrat 4×4, Höhe 5

describe('Helfer — Punktlisten', () => {
    it('versetzePunktliste nimmt DIESELBE Gehrung wie der Kernel-Offset (ein Weg)', () => {
        const links = versetzePunktliste(L, 1);
        const kernel = offset({ linie: { punkte: L.map(p => ({ x: p[0], z: p[2] })) } }, { abstand: 1 }).ergebnis.ring;
        // Die linke Seite des Kernel-Streifens sind die ersten drei Ringpunkte.
        for (let i = 0; i < 3; i++) {
            expect(links[i][0]).toBeCloseTo(kernel[i].x, 9);
            expect(links[i][2]).toBeCloseTo(kernel[i].z, 9);
            expect(links[i][1]).toBe(L[i][1]);                 // Höhe bleibt am Index
        }
        expect(versetzePunktliste(L, 0)).toBeNull();
        expect(versetzePunktliste([[0, 0, 0]], 1)).toBeNull();
    });
    it('Ring: positiv = nach AUSSEN, unabhängig von der Wicklung; die Fläche wächst', () => {
        const xz = (r) => r.map(p => ({ x: p[0], z: p[2] }));
        const a0 = ringFlaeche(xz(RING));
        const aussen = versetzePunktliste(RING, 0.5, { geschlossen: true });
        const innen = versetzePunktliste(RING, -0.5, { geschlossen: true });
        expect(ringFlaeche(xz(aussen))).toBeCloseTo(25, 6);    // 5×5
        expect(ringFlaeche(xz(innen))).toBeCloseTo(9, 6);      // 3×3
        expect(ringFlaeche(xz(aussen))).toBeGreaterThan(a0);
        const gedreht = [...RING].reverse();
        expect(ringFlaeche(xz(versetzePunktliste(gedreht, 0.5, { geschlossen: true })))).toBeCloseTo(25, 6);
        // indextreu: vier Punkte rein, vier raus
        expect(versetztePunkte(xz(RING), 0.5, { geschlossen: true })).toHaveLength(4);
    });
    it('trimmePunktliste verlängert/kürzt ein Ende entlang seines Abschnitts; der Abschnitt darf nicht verschwinden', () => {
        const pl = [[0, 0, 0], [4, 0, 0]];
        expect(trimmePunktliste(pl, 'ende', 2)[1]).toEqual([6, 0, 0]);
        expect(trimmePunktliste(pl, 'anfang', 1)[0]).toEqual([-1, 0, 0]);
        expect(trimmePunktliste(pl, 'ende', -1)[1]).toEqual([3, 0, 0]);
        expect(trimmePunktliste(pl, 'ende', -4)).toBeNull();
        expect(trimmePunktliste(pl, 'ende', 0)).toBeNull();
    });
    it('teilePunktlisteAnStation: beide Teile enthalten den Teilpunkt, Höhen interpoliert', () => {
        const [a, c] = teilePunktlisteAnStation(L, 2);
        expect(a).toEqual([[0, 1, 0], [2, 1, 0]]);
        expect(c[0]).toEqual([2, 1, 0]);
        expect(c).toHaveLength(3);
        expect(teilePunktlisteAnStation(L, 0)).toBeNull();
        expect(teilePunktlisteAnStation(L, 100)).toBeNull();
    });
    it('teileRingMitGerade: ein Quadrat wird an x = 1 zu 1×4 und 3×4; eine Gerade daneben teilt nichts', () => {
        const teile = teileRingMitGerade(RING, { x: 1, z: -1 }, { x: 1, z: 9 });
        expect(teile).not.toBeNull();
        const xz = (r) => r.map(p => ({ x: p[0], z: p[2] }));
        const flaechen = teile.map(t => ringFlaeche(xz(t))).sort((p, q) => p - q);
        expect(flaechen[0]).toBeCloseTo(4, 6);
        expect(flaechen[1]).toBeCloseTo(12, 6);
        expect(teile.flat().every(p => p[1] === 5)).toBe(true);
        expect(teileRingMitGerade(RING, { x: 9, z: -1 }, { x: 9, z: 9 })).toBeNull();
    });
    it('vereinigeRinge: überlappende Quadrate werden EIN Ring; getrennte bleiben zwei (Grund)', () => {
        const B = [[3, 7, 0], [7, 7, 0], [7, 7, 4], [3, 7, 4]];
        const v = vereinigeRinge(RING, B);
        expect(v.punkte).toBeDefined();
        const xz = (r) => r.map(p => ({ x: p[0], z: p[2] }));
        expect(ringFlaeche(xz(v.punkte))).toBeCloseTo(28, 6);   // 7×4
        expect(v.punkte.every(p => p[1] === 5 || p[1] === 7)).toBe(true);
        const fern = [[10, 0, 0], [12, 0, 0], [12, 0, 2], [10, 0, 2]];
        expect(vereinigeRinge(RING, fern).grund).toMatch(/berühren sich nicht/);
    });
});

describe('Linie — teilen, trimmen, versetzen, umkehren (nur eigen)', () => {
    it('erscheinen nur an eigenen Linien; „Haltung teilen" weicht dort dem Linien-Werkzeug', () => {
        const eigen = passende({ bauform: 'linie', guete: 'gemessen' }, { eigenes: true }).map(x => x.id);
        expect(eigen).toEqual(expect.arrayContaining(['linie-teilen', 'linie-trimmen', 'linie-versetzen', 'linie-umkehren']));
        expect(eigen).not.toContain('haltung-teilen');
        // Geliefert und eine KANTE im Netz (Typprofil der Fliessabschnitte) —
        // mit dem Kontext, den der Store wirklich mitgibt (`passendeKontext`).
        const kante = { typprofil: profilFuer('IFCPIPESEGMENT') };
        const geliefert = passende({ bauform: 'linie', guete: 'gemessen' }, kante).map(x => x.id);
        expect(geliefert).toContain('haltung-teilen');
        expect(geliefert).not.toContain('linie-teilen');
        // Seit AE (Teil XXIII): eine gelieferte Linie OHNE Rolle im Netz — eine
        // Trasse, ein Träger — bekommt kein „Haltung teilen" mehr; es machte
        // aus ihr Rohre.
        expect(passende({ bauform: 'linie', guete: 'gemessen' }).map(x => x.id)).not.toContain('haltung-teilen');
        // am eigenen ROHR bleibt „Haltung teilen" (es hat eine Achse und wird richtig geteilt)
        expect(passende({ bauform: 'achse+profil', guete: 'gemessen' }, { eigenes: true, rezept: rezeptNach('rohr') }).map(x => x.id)).toContain('haltung-teilen');
    });
    it('teilen: verborgen + zwei Teile mit Rezept und Parametern, ein Vorgang', () => {
        const liste = b('linie-teilen').anwenden(EIGEN('linie', L, { stand: { bauplan: { rezept: 'linie', kategorie: 'IFCALIGNMENT', name: 'T', parameter: { punkte: L, hoehe: 3 } } } }), { station: 2 });
        expect(liste).toHaveLength(3);
        expect(liste[0]).toEqual({ art: 'geloescht', globalId: 'cde1', nachher: true });
        expect(liste[1].nachher).toMatchObject({ rezept: 'linie', kategorie: 'IFCALIGNMENT', name: 'T (1)', parameter: { hoehe: 3 } });
        expect(liste[1].nachher.parameter.punkte).toEqual([[0, 1, 0], [2, 1, 0]]);
        expect(liste[2].nachher.name).toBe('T (2)');
        expect(liste[1].globalId).not.toBe(liste[2].globalId);
        expect(b('linie-teilen').anwenden(EIGEN('linie', L), { station: 0 })).toBeNull();
        expect(b('linie-teilen').anwenden(EIGEN('flaeche', RING), { station: 2 })).toBeNull();   // geschlossen: nein
    });
    it('trimmen: dieselbe GlobalId, das Ende wandert', () => {
        const e = b('linie-trimmen').anwenden(EIGEN('linie', [[0, 0, 0], [4, 0, 0]]), { ende: 'ende', laenge: 2 });
        expect(e).toMatchObject({ art: 'erzeugt', globalId: 'cde1' });
        expect(e.nachher.parameter.punkte[1]).toEqual([6, 0, 0]);
        expect(b('linie-trimmen').anwenden(EIGEN('linie', [[0, 0, 0], [4, 0, 0]]), { ende: 'ende', laenge: -4 })).toBeNull();
    });
    it('versetzen: Kopie mit neuer GlobalId und „(versetzt)"; ersetzen behält die Id', () => {
        const k = b('linie-versetzen').anwenden(EIGEN('linie', [[0, 0, 0], [4, 0, 0]]), { abstand: 1, ergebnis: 'kopie' });
        expect(k.globalId).not.toBe('cde1');
        expect(k.nachher.name).toBe('L1 (versetzt)');
        // links in Laufrichtung +x ist −z (three, Blick von oben: (−rz, rx) → (0, 1))… Kernel-Konvention:
        expect(k.nachher.parameter.punkte[0][2]).toBeCloseTo(1, 9);
        const r = b('linie-versetzen').anwenden(EIGEN('linie', [[0, 0, 0], [4, 0, 0]]), { abstand: 1, ergebnis: 'ersetzen' });
        expect(r.globalId).toBe('cde1');
        expect(r.nachher.name).toBe('L1');
        expect(b('linie-versetzen').anwenden(EIGEN('linie', [[0, 0, 0], [4, 0, 0]]), { abstand: 0 })).toBeNull();
    });
    it('umkehren: die Punktfolge dreht sich, sonst nichts — auch am eigenen Rohr', () => {
        const e = b('linie-umkehren').anwenden(EIGEN('rohr', [[0, 0, 0], [4, 0, 0], [8, -1, 0]], { stand: { bauplan: { rezept: 'rohr', kategorie: 'IFCPIPESEGMENT', name: 'R', parameter: { punkte: [[0, 0, 0], [4, 0, 0], [8, -1, 0]], dn: 300 } } } }));
        expect(e).toMatchObject({ art: 'erzeugt', globalId: 'cde1', nachher: { rezept: 'rohr', parameter: { dn: 300 } } });
        expect(e.nachher.parameter.punkte).toEqual([[8, -1, 0], [4, 0, 0], [0, 0, 0]]);
        expect(b('linie-umkehren').anwenden(EIGEN('flaeche', RING))).toBeNull();
    });
});

describe('Fläche — versetzen, teilen, vereinigen (nur eigen)', () => {
    it('erscheinen nur an eigenen Flächen', () => {
        const eigen = passende({ bauform: 'flaeche', guete: 'gemessen' }, { eigenes: true }).map(x => x.id);
        expect(eigen).toEqual(expect.arrayContaining(['flaeche-versetzen', 'flaeche-teilen', 'flaeche-vereinigen']));
        expect(passende({ bauform: 'flaeche', guete: 'gemessen' }).map(x => x.id)).not.toContain('flaeche-teilen');
        expect(passende({ bauform: 'linie', guete: 'gemessen' }, { eigenes: true }).map(x => x.id)).not.toContain('flaeche-teilen');
    });
    it('versetzen nach aussen vergrössert die Fläche (Kopie); −0,5 verkleinert an Ort und Stelle', () => {
        const xz = (r) => r.map(p => ({ x: p[0], z: p[2] }));
        const k = b('flaeche-versetzen').anwenden(EIGEN('flaeche', RING), { abstand: 0.5, ergebnis: 'kopie' });
        expect(k.globalId).not.toBe('cde1');
        expect(ringFlaeche(xz(k.nachher.parameter.punkte))).toBeCloseTo(25, 6);
        const r = b('flaeche-versetzen').anwenden(EIGEN('flaeche', RING), { abstand: -0.5, ergebnis: 'ersetzen' });
        expect(r.globalId).toBe('cde1');
        expect(ringFlaeche(xz(r.nachher.parameter.punkte))).toBeCloseTo(9, 6);
    });
    it('teilen: der Zug hat genau zwei Punkte (eingaben-Vertrag); Ergebnis verborgen + zwei Ringe', () => {
        const ein = eingabenFuer(b('flaeche-teilen'));
        const zug = ein.schlitze.find(s => s.schlitz === 'zug');
        expect(zug.anzahl).toEqual({ min: 2, max: 2 });
        const liste = b('flaeche-teilen').anwenden(EIGEN('flaeche', RING), {}, { zug: [{ x: 1, y: 0, z: -1 }, { x: 1, y: 0, z: 9 }] });
        expect(liste).toHaveLength(3);
        expect(liste[0]).toEqual({ art: 'geloescht', globalId: 'cde1', nachher: true });
        expect(liste[1].nachher.rezept).toBe('flaeche');
        expect(liste[1].nachher.name).toBe('L1 (1)');
        expect(b('flaeche-teilen').anwenden(EIGEN('flaeche', RING), {}, { zug: [{ x: 1, z: -1 }] })).toBeNull();
        expect(b('flaeche-teilen').anwenden(EIGEN('flaeche', RING), {}, { zug: [{ x: 9, z: -1 }, { x: 9, z: 9 }] })).toBeNull();
    });
    it('vereinigen: die andere kommt aus dem KONTEXT (V3, Auswahl-Geste); beide verborgen, eine neue', () => {
        // Bis Teil XXV (V3) stand die Liste am Subjekt (`el.eigeneFlaechen`) und
        // nur der Viewer trug sie ein. Jetzt fragen Formular und Auswertung
        // denselben Auföser — hier mit der Journalwelt dieses Tests.
        const B = [[3, 7, 0], [7, 7, 0], [7, 7, 4], [3, 7, 4]];
        const el = EIGEN('flaeche', RING);
        const kandidatenVon = kandidatenAus({ wirksamerStand: (art) => (art === 'erzeugt' ? new Map([
            ['cde1', { rezept: 'flaeche', name: 'L1', parameter: { name: 'L1', punkte: RING } }],
            ['cde2', { rezept: 'flaeche', name: 'F2', parameter: { name: 'F2', punkte: B } }],
        ]) : new Map()) });
        const feld = felderFuer(b('flaeche-vereinigen'), null, el, { kandidatenVon })[0];
        expect(feld.aus.geste).toBe('auswahl');
        expect(feld.optionen).toEqual([{ wert: 'cde2', titel: 'F2' }]);   // sich selbst nicht
        expect(b('flaeche-vereinigen').vorbelegung(el, { kandidatenVon })).toEqual({ andere: 'cde2' });
        const liste = b('flaeche-vereinigen').anwenden(el, { andere: 'cde2' }, { kandidatenVon });
        expect(liste).toHaveLength(3);
        expect(liste.slice(0, 2).map(x => x.globalId)).toEqual(['cde1', 'cde2']);
        expect(liste[2].nachher.name).toBe('L1 + F2');
        const xz = (r) => r.map(p => ({ x: p[0], z: p[2] }));
        expect(ringFlaeche(xz(liste[2].nachher.parameter.punkte))).toBeCloseTo(28, 6);
        expect(b('flaeche-vereinigen').anwenden(el, { andere: 'cde1' }, { kandidatenVon })).toBeNull();
        expect(b('flaeche-vereinigen').anwenden(el, { andere: 'gibtsnicht' }, { kandidatenVon })).toBeNull();
        // OHNE Kontext gibt es keinen Partner — und keinen stillen Treffer.
        expect(b('flaeche-vereinigen').anwenden(el, { andere: 'cde2' })).toBeNull();
    });
});

describe('Tauschen aus der Bibliothek (9.8)', () => {
    const SCHACHT = (dn) => EIGEN('schacht', [[0, 0, 0], [0, 3, 0]], {
        category: 'IFCDISTRIBUTIONCHAMBERELEMENT',
        stand: { bauplan: { rezept: 'schacht', kategorie: 'IFCDISTRIBUTIONCHAMBERELEMENT', name: 'S1', parameter: { punkte: [[0, 0, 0], [0, 3, 0]], dn } } },
    });
    // Die Bibliothek ist seit V3 eine Eingabe des Kontexts, keine Liste am Subjekt.
    const BIBLIOTHEK = [...EINGEBAUTE_VORLAGEN,
        { id: 'schacht-dn1200', name: 'Schacht DN 1200', rezept: 'schacht', vorgaben: { dn: 1200, kategorie: 'IFCDISTRIBUTIONCHAMBERELEMENT' } }];
    const kandidatenVon = kandidatenAus({ vorlagen: BIBLIOTHEK });
    it('bietet nur Vorlagen DESSELBEN Rezepts an, an eigenen Bauteilen', () => {
        const el = SCHACHT(1000);
        const opt = felderFuer(b('koerper-tauschen'), null, el, { kandidatenVon })[0].optionen.map(o => o.wert);
        expect(opt).toEqual(['schacht-dn1000', 'schacht-dn1200']);
        expect(passende({ bauform: 'koerper', guete: 'gemessen' }, { eigenes: true }).map(x => x.id)).toContain('koerper-tauschen');
        expect(passende({ bauform: 'koerper', guete: 'gemessen' }).map(x => x.id)).not.toContain('koerper-tauschen');
    });
    it('tauscht die Parameter, hält Lage und GlobalId; dieselbe Vorlage nochmal → null', () => {
        const el = SCHACHT(1000);
        const e = b('koerper-tauschen').anwenden(el, { vorlage: 'schacht-dn1200' }, { kandidatenVon });
        expect(e).toMatchObject({ art: 'erzeugt', globalId: 'cde1', nachher: { rezept: 'schacht', kategorie: 'IFCDISTRIBUTIONCHAMBERELEMENT', name: 'S1' } });
        // Seit Teil XXIII A1 wandert die HERKUNFT mit — vorher war sie nach dem Tausch weg.
        expect(e.nachher.parameter).toEqual({ punkte: [[0, 0, 0], [0, 3, 0]], dn: 1200, vorlage: 'schacht-dn1200' });
        expect(b('koerper-tauschen').anwenden(el, { vorlage: 'rohr-dn500' }, { kandidatenVon })).toBeNull();   // anderes Rezept
    });
    it('dieselbe Vorlage nochmal → null; dieselben Masse OHNE Herkunft → die Herkunft wird nachgetragen', () => {
        // „Nochmal" heisst: Masse UND Bezug stimmen schon.
        const schon = SCHACHT(1000);
        schon.stand.bauplan.parameter.vorlage = 'schacht-dn1000';
        expect(b('koerper-tauschen').anwenden(schon, { vorlage: 'schacht-dn1000' }, { kandidatenVon })).toBeNull();
        // Vorher galt „gleiche Masse → nichts zu tun", und der Bezug entstand nie.
        const e = b('koerper-tauschen').anwenden(SCHACHT(1000), { vorlage: 'schacht-dn1000' }, { kandidatenVon });
        expect(e.nachher.parameter).toMatchObject({ dn: 1000, vorlage: 'schacht-dn1000' });
    });
});
