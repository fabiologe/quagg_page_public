// @vitest-environment jsdom
/**
 * Rezepte sind Daten (Teil XXIII, A4; Audit „Bearbeitungsstruktur", Befund S5).
 *
 * Geprüft wird dreierlei:
 *  1. VERHALTENSNEUTRAL — die vier alten Rezepte liefern bitgleich, was sie
 *     vor dem Umbau lieferten (Fixture `rezepte_vor_a4.json`, erzeugt aus dem
 *     alten Katalog, bevor er ersetzt wurde): Geometrie, Körper, Achse,
 *     Knoten, Fachmodell, Verschiebung.
 *  2. ES SIND DATEN — eine Deklaration, einmal durch JSON geschickt, baut
 *     dasselbe; kein Eintrag enthält eine Funktion.
 *  3. ZWEI BAUFORMEN BEKOMMEN IHREN ERZEUGER — Pfosten (`punkt`) und Platte
 *     (`flaeche+dicke`), über den echten Zeichenweg (Eingabe → Journal →
 *     Bauplan → Geometrie), nicht über einen selbstgebauten Bauplan.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPinia, setActivePinia } from 'pinia';
import { REZEPTE, REZEPT_QUELLEN, baueAusBauplan, istSchreibbar, rezeptNach } from '../services/Bauteilrezepte.js';
import { EINGEBAUTE_REZEPTE } from '../services/rezept/Eingebaut.js';
import { GEOMETRIE_ARTEN, PROFIL_ARTEN, rezeptAusDeklaration } from '../services/rezept/Rezeptbau.js';
import { meshVolume } from '../services/geometrie/MeshOps.js';
import { BAUFORMEN } from '../services/bauform/Bauformen.js';
import { profilFuer } from '../services/bauform/Typprofile.js';
import { ausGruppe, nachId } from '../services/Bearbeitungen.js';
import { useZeichnen } from '../composables/useZeichnen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen } from '../stores/useAenderungen.js';

const WURZEL = join(process.cwd(), 'src/features/cde/');
const GOLD = JSON.parse(readFileSync(join(WURZEL, 'test/fixtures/rezepte_vor_a4.json'), 'utf8'));

/** Dieselbe Zusammenfassung, mit der das Fixture aus dem alten Katalog entstand. */
function summe(geo) {
    const pos = geo.getAttribute('position').array;
    let s = 0; for (let i = 0; i < pos.length; i++) s += pos[i] * ((i % 7) + 1);
    const idx = geo.index ? Array.from(geo.index.array) : null;
    return { n: pos.length, s, idxN: idx?.length ?? null, idxS: idx ? idx.reduce((a, v, i) => a + v * ((i % 5) + 1), 0) : null };
}
function ausgabe(rz, p) {
    const r = { geo: summe(rz.baue(p)) };
    const k = rz.formAus?.(p, 'koerper');
    if (k) r.koerper = { tri: k.triCount, vol: k.volumen, closed: k.closed, mv: meshVolume(k.positions, k.triCount).volume };
    // `sohlabstand` (Linie) und `achsbezug`/`sohlabstand` (Netzkante) sind NEU
    // aus Teil XXIV (K4) — Bedeutungsfelder wie die aus A9; die Zahlen bleiben.
    // Geprüft werden sie in `sohleEigen.test.js`.
    // `profilhoehe` (V2) ist das dritte Bedeutungsfeld dieser Art: Sohle →
    // Scheitel aus dem Profil, damit der Scheitel eines unsymmetrischen
    // Querschnitts nicht als 2 × Sohlabstand geraten wird. Geprüft in
    // `sohleEigen.test.js` und `kostenprobe.test.js`.
    const l = rz.formAus?.(p, 'linie'); if (l) { const { sohlabstand, profilhoehe, ...alt } = l; r.linie = alt; }
    // Die Bedeutungsfelder aus A9 (`hoehenbezug`, `oberkante`) sind NEU — der
    // Goldstandard hält die ZAHLEN von vor A4; die Felder prüft formsemantik.test.js.
    const kn = rz.formAus?.(p, 'knoten');
    if (kn) { const { hoehenbezug, oberkante, ...alt } = kn; r.knoten = alt; }
    r.fachmodell = rz.fachmodell('G1', { name: 'N', parameter: p });
    for (const k of r.fachmodell.kanten ?? []) { delete k.achsbezug; delete k.sohlabstand; delete k.profilhoehe; }
    for (const k of r.fachmodell.knoten ?? []) delete k.hoehenbezug;      // K8: Bedeutungsfeld, geprüft in verknuepfung.test.js
    r.verschoben = rz.verschiebe(p, { x: 1, y: 2, z: 3 });
    return JSON.parse(JSON.stringify(r));
}
function _yBereich(pos) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 1; i < pos.length; i += 3) { lo = Math.min(lo, pos[i]); hi = Math.max(hi, pos[i]); }
    return [lo, hi];
}
const hatFunktion = (v) => typeof v === 'function'
    || (v && typeof v === 'object' && Object.values(v).some(hatFunktion));

describe('1 — die alten Rezepte liefern bitgleich, was sie vorher lieferten', () => {
    for (const [id, faelle] of Object.entries(GOLD.FAELLE)) {
        it(id, () => {
            faelle.forEach((p, i) => expect(ausgabe(REZEPTE[id], p), `${id} Fall ${i}`).toEqual(GOLD.aus[id][i]));
        });
    }
});

describe('2 — es sind Daten', () => {
    it('keine Deklaration enthält Code', () => {
        for (const d of EINGEBAUTE_REZEPTE) expect(hatFunktion(d), d.id).toBe(false);
    });

    it('durch JSON geschickt baut jede Deklaration dasselbe', () => {
        const kopie = JSON.parse(JSON.stringify(EINGEBAUTE_REZEPTE));
        const probe = {
            linie: GOLD.FAELLE.linie[0], flaeche: GOLD.FAELLE.flaeche[0], rohr: GOLD.FAELLE.rohr[0],
            schacht: GOLD.FAELLE.schacht[0],
            pfosten: { punkte: [[3, 10, 4]], laenge: 1.2, breite: 0.12, tiefe: 0.04 },
            platte: { punkte: [[0, 5, 0], [6, 5.3, 0], [6, 5.6, 4], [0, 5.3, 4]], dicke: 0.25 },
        };
        for (const d of kopie) {
            expect(ausgabe(rezeptAusDeklaration(d), probe[d.id]), d.id).toEqual(ausgabe(REZEPTE[d.id], probe[d.id]));
        }
    });

    it('jede Deklaration nennt nur Arten, die der Rezeptbau kennt', () => {
        for (const d of EINGEBAUTE_REZEPTE) {
            expect(GEOMETRIE_ARTEN, d.id).toHaveProperty(d.geometrie.art);
            if (d.geometrie.profil) {
                expect(PROFIL_ARTEN, d.id).toHaveProperty(d.geometrie.profil.art);
                for (const schluessel of PROFIL_ARTEN[d.geometrie.profil.art].masse) {
                    // Das Profil nennt ein FELD — und das Feld gibt es im Formular.
                    expect(d.felder.map(f => f.name), `${d.id}.${schluessel}`).toContain(d.geometrie.profil[schluessel]);
                }
            }
            expect(BAUFORMEN, d.id).toHaveProperty(d.bauform);
            // Die Vorgabe muss der Schreiber im Backend annehmen (IFC4X3_ADD2,
            // nicht abstrakt, IfcProduct) — sonst stünde der Eintrag im Journal
            // und fiele erst beim Ausgeben heraus.
            expect(istSchreibbar(d.kategorieVorgabe), `${d.id}: ${d.kategorieVorgabe}`).toBe(true);
        }
    });

    it('was ein Rezept LIEFERT, steht am Rezept — abgeleitet aus Bauform und Rolle (AE)', () => {
        expect(rezeptNach('rohr').liefert).toEqual(['achse', 'netzrolle:kante']);
        expect(rezeptNach('schacht').liefert).toEqual(['netzrolle:knoten']);
        expect(rezeptNach('linie').liefert).toEqual(['achse']);
        expect(rezeptNach('platte').liefert).toEqual([]);
    });

    it('Code bleibt nur, wo er Code sein muss: das Altrezept `gelaende`', () => {
        const mitCode = REZEPT_QUELLEN.filter(hatFunktion).map(d => d.id);
        expect(mitCode).toEqual(['gelaende']);
        expect(REZEPT_QUELLEN.find(d => d.id === 'gelaende').art).toBe('code');
    });
});

describe('3 — Pfosten und Platte: zwei Bauformen bekommen ihren Erzeuger', () => {
    beforeEach(() => {
        localStorage.clear();
        setActivePinia(createPinia());
        useBearbeitung().modusSetzen(true);
    });
    // Wie der Viewer: die Höhe unter dem Tipp kommt aus dem Gelände (`getHoeheAn`).
    const bau = ({ gelaende = () => 10 } = {}) => {
        const bearbeitung = useBearbeitung();
        const aenderungen = useAenderungen();
        const zeichnen = useZeichnen({ bearbeitung, cde: { bearbeiter: 'Fabio' }, getModellSha: () => 'sha1',
                                       getHoehenversatz: () => 0, getHoeheAn: gelaende });
        return { bearbeitung, aenderungen, zeichnen };
    };

    it('beide stehen unter „Erzeugen", aus dem Rezept abgeleitet', () => {
        const ids = ausGruppe('erzeugen').map(b => b.id);
        expect(ids).toEqual(expect.arrayContaining(['pfosten-zeichnen', 'platte-zeichnen']));
        expect(nachId('pfosten-zeichnen').eingaben).toEqual([{ schlitz: 'zug', anzahl: { min: 1, max: 1 } }]);
        expect(nachId('platte-zeichnen').eingaben).toBeUndefined();          // wie die Fläche: offen nach oben
    });

    it('Pfosten: EIN Tipp auf dem Gelände — ein Eintrag, ein geschlossener Stab', async () => {
        const t = bau();
        expect(t.zeichnen.starte('pfosten-zeichnen')).toBe(true);
        t.bearbeitung.setzeWert('laenge', 1.2);
        t.bearbeitung.setzeWert('breite', 0.12);
        t.bearbeitung.setzeWert('tiefe', 0.04);
        // Der Treffer liegt 5 cm über dem Gelände (ein Grashalm) — der Fuss steht AUF dem Gelände.
        t.zeichnen.aufTreffer({ point: { x: 3, y: 10.05, z: 4 } });
        await new Promise(r => setTimeout(r, 0));
        // Mit dem Tipp ist der Zug voll und wird übernommen — wie „An Schacht anschliessen".
        expect(t.aenderungen.eintraege).toHaveLength(1);
        const plan = t.aenderungen.eintraege[0].nachher;
        expect(plan).toMatchObject({ rezept: 'pfosten', kategorie: 'IFCSIGN', bauform: 'punkt' });
        expect(plan.parameter.punkte).toEqual([[3, 10, 4]]);
        // Ein zweiter Tipp in DERSELBEN Sitzung setzt keinen zweiten Punkt.
        expect(t.zeichnen.aktiv.value).toBe(false);

        const k = rezeptNach('pfosten').formAus(plan.parameter, 'koerper');
        expect(k.closed).toBe(true);
        expect(k.volumen).toBeCloseTo(1.2 * 0.12 * 0.04, 9);
        const gebaut = baueAusBauplan(plan);
        expect(gebaut.ok).toBe(true);
        gebaut.geometrie.computeBoundingBox();
        const bb = gebaut.geometrie.boundingBox;
        expect(bb.min.y).toBeCloseTo(10, 6);                 // steht AUF dem Tipp
        expect(bb.max.y).toBeCloseTo(11.2, 6);
    });

    it('Platte: der Umriss ist die Oberkante — getippt wie bei der Fläche, die Dicke geht nach unten', async () => {
        const t = bau();
        t.zeichnen.starte('platte-zeichnen');
        t.bearbeitung.setzeWert('hoehe', 5.6);
        t.bearbeitung.setzeWert('dicke', 0.25);
        for (const p of [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 4 }, { x: 0, z: 4 }]) t.zeichnen.setzePunkt(p);
        t.zeichnen.schliesseZug();
        await t.zeichnen.abschliessen();
        const plan = t.aenderungen.eintraege[0].nachher;
        expect(plan).toMatchObject({ rezept: 'platte', kategorie: 'IFCSLAB', bauform: 'flaeche+dicke' });

        const k = rezeptNach('platte').formAus(plan.parameter, 'koerper');
        expect(k.closed).toBe(true);
        expect(k.volumen).toBeCloseTo(6 * 4 * 0.25, 9);
        const [minY, maxY] = _yBereich(k.positions);
        expect(maxY).toBeCloseTo(5.6, 9);
        expect(minY).toBeCloseTo(5.35, 9);
    });

    it('… und eine geneigte Platte bleibt geneigt: jede Ecke behält ihre Höhe (wie die Fläche)', () => {
        const k = rezeptNach('platte').formAus({ punkte: [[0, 5, 0], [6, 5.3, 0], [6, 5.6, 4], [0, 5.3, 4]], dicke: 0.25 }, 'koerper');
        expect(k.closed).toBe(true);
        // Senkrecht versetztes Prisma: Volumen = Grundriss × Dicke, auch geneigt.
        expect(k.volumen).toBeCloseTo(6 * 4 * 0.25, 9);
        const [minY, maxY] = _yBereich(k.positions);
        expect(maxY).toBeCloseTo(5.6, 9);
        expect(minY).toBeCloseTo(4.75, 9);
    });

    it('Typprofile der beiden Bauformen und die Rezepte sagen dasselbe', () => {
        expect(profilFuer('IFCSIGN').bauform).toBe(rezeptNach('pfosten').bauform);
        expect(profilFuer('IFCSLAB').bauform).toBe(rezeptNach('platte').bauform);
    });
});

describe('Ein Rezept, das KEINE Datei kennt: Rechteckkanal nur als Deklaration', () => {
    const kanal = rezeptAusDeklaration(JSON.parse(JSON.stringify({
        id: 'rechteckkanal', titel: 'Rechteckkanal', icon: 'laengsschnitt', bauform: 'achse+profil',
        kategorieVorgabe: 'IFCPIPESEGMENT', mindestPunkte: 2, geschlossen: false, netzrolle: 'kante',
        felder: [{ name: 'b', typ: 'zahl', vorgabe: 1.2 }, { name: 'h', typ: 'zahl', vorgabe: 0.8 }],
        geometrie: { art: 'sweep', profil: { art: 'rechteck', breite: 'b', tiefe: 'h', einheit: 'm' } },
    })));
    // Ein sanfter Knick (≈ 11°): an einem scharfen legt der Sweep das Profil
    // ungestreckt in die Winkelhalbierende und warnt ab 60° selbst.
    const p = { punkte: [[0, 100, 0], [30, 99.7, 0], [50, 99.4, 4]] };

    it('baut einen geschlossenen Körper mit dem Querschnitt b × h', () => {
        const k = kanal.formAus(p, 'koerper');
        expect(k.closed).toBe(true);
        // Gerade Stücke 30 m + 20 m, dazwischen die Gehrung: nahe (b·h)·Länge.
        const laenge = Math.hypot(30, 0.3) + Math.hypot(20, 0.3, 4);
        expect(k.volumen / (1.2 * 0.8 * laenge)).toBeGreaterThan(0.995);
        expect(k.volumen / (1.2 * 0.8 * laenge)).toBeLessThan(1.005);
    });

    it('ist eine Kante im Netz, mit Achse — also gilt es für „Haltung teilen" und den Längsschnitt', () => {
        expect(kanal.liefert).toEqual(['achse', 'netzrolle:kante']);
        const fm = kanal.fachmodell('K1', { name: 'K', kategorie: 'IFCPIPESEGMENT', parameter: p });
        expect(fm.kanten).toHaveLength(1);
        expect(fm.kanten[0].anfang).toEqual({ x: 0, y: 100, z: 0 });
        expect(kanal.formAus(p, 'linie')).toMatchObject({ achsbezug: 'mitte', quelle: 'bauplan' });
    });
});
