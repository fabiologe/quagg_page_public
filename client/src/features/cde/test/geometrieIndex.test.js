// JEDE Geometrie, die an den Editor geht, MUSS einen Index tragen.
//
// DER BEFUND (2026-09-09). Fabios Auftrag war, alle Geländewerkzeuge zu
// testen. Sie liefen alle: Gerinne 8.609 m³, Ausheben 15.384 m³, Auffüllen
// 10.849 m³, Planum, Böschung, Bauwerksgrube, Kanalgraben — Massen sauber,
// Gegenprobe unter einem Prozent. Nur stand im Raum nichts. Das CDE-Modell
// hatte `kinder=0`, jede GlobalId war „fehlend", und der Grund kam aus dem
// Editor zurück:
//
//     editor_fehler: Cannot read properties of null (reading 'array')
//
// Der Stapel führte auf `representationFromGeometry`, und der gebaute
// Bibliothekscode liest dort ohne jede Prüfung:
//
//     const r = e.getAttribute("position").array,
//           n = e.getAttribute("normal").array,
//           o = e.index.array;          // ← null bei unindizierter Geometrie
//
// `BufferGeometry.index` ist null, solange niemand `setIndex` ruft. Genau
// zwei unserer Bauer taten das (Band und Fläche) — und genau die beiden
// kamen im Raum an. Alles über `dreiecksGeometrie` (Sweep, Körper, jedes
// Rasterteil, also der ganze Erdbau) fiel still durch.
//
// STILL ist das Wort. Der Fehler wird gefangen und wandert in `misserfolge`;
// an der Oberfläche fehlt das Bauteil ohne Meldung, während Journal, Massen
// und Verlauf vollständig aussehen. Deshalb steht hier ein Wächter und nicht
// nur eine Kur: die Annahme wird an der BIBLIOTHEK geprüft, damit ein
// Versionssprung sie umstösst, statt sie zu erben.
//
// Vgl. `fragmentsVertrag.test.js` — dieselbe Testart, derselbe Anlass.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    REZEPTE, baueAusBauplan, geometrieAusTeil, rohrKoerper,
} from '../services/Bauteilrezepte.js';

const MJS = fileURLToPath(
    new URL('../../../../node_modules/@thatopen/fragments/dist/index.mjs', import.meta.url));

/** Ein Dreieck als Kernel-Körper — das kleinste, was der Editor je bekäme. */
function dreieck() {
    return {
        form: 'koerper',
        daten: {
            triCount: 1,
            positions: Float64Array.from([0, 0, 0, 1, 0, 0, 0, 0, 1]),
        },
    };
}

describe('der Vertrag: die Bibliothek verlangt einen Index', () => {
    it('representationFromGeometry liest `index.array` ohne Prüfung', () => {
        const quelle = fs.readFileSync(MJS, 'utf8');
        const start = quelle.indexOf('representationFromGeometry(e,s={bbox');
        expect(start, 'representationFromGeometry nicht gefunden — Bibliothek geprüft?')
            .toBeGreaterThan(-1);
        const rumpf = quelle.slice(start, start + 700);

        // Der Zugriff selbst. Fällt er weg, darf die Kur überdacht werden —
        // fällt der TEST, ist die Bibliothek gewandert und jemand muss
        // hinsehen, statt den Fehler ein zweites Mal zu suchen.
        expect(rumpf).toContain('.index.array');
        // Und er ist ungeprüft: kein `?.`, kein Vorabtest.
        expect(rumpf).not.toContain('.index?.array');
    });
});

describe('jeder Bauweg liefert indizierte Geometrie', () => {
    // Ein Bauplan je Rezept, mit gerade so viel Eingabe, dass er baut.
    const plaene = {
        linie: { punkte: [[0, 0, 0], [10, 0, 0], [10, 0, 10]] },
        flaeche: { punkte: [[0, 0, 0], [10, 0, 0], [10, 0, 10], [0, 0, 10]] },
        rohr: { punkte: [[0, 0, 0], [10, 0, 0]], dn: 300 },
        schacht: { punkte: [[0, 0, 0], [0, 3, 0]], dn: 1000 },
    };

    // Das Alt-Rezept `gelaende` baut aus einem RASTER, nicht aus Punkten
    // (`baueMit`) — sein Ausgang ist `dreiecksGeometrie` und steht unten
    // über `geometrieAusTeil` in der Prüfung.
    const ausPunkten = Object.keys(REZEPTE).filter(id => typeof REZEPTE[id].baue === 'function');

    for (const id of ausPunkten) {
        it(`„${id}" setzt einen Index`, () => {
            const parameter = plaene[id];
            expect(parameter, `kein Prüf-Bauplan für „${id}" — Rezept neu?`).toBeTruthy();
            const gebaut = baueAusBauplan({ rezept: id, parameter });
            expect(gebaut.ok, JSON.stringify(gebaut.fehler)).toBe(true);

            const geo = gebaut.geometrie;
            expect(geo.index, `„${id}" kommt ohne Index — createElements bricht ab`)
                .not.toBeNull();
            // Der Index muss die Ecken auch WIRKLICH abdecken.
            const ecken = geo.getAttribute('position').count;
            expect(geo.index.count).toBeGreaterThan(0);
            expect(Math.max(...geo.index.array)).toBeLessThan(ecken);
            expect(geo.getAttribute('normal')).toBeTruthy();
        });
    }

    it('geometrieAusTeil (Körper) setzt einen Index', () => {
        const geo = geometrieAusTeil(dreieck());
        expect(geo.index).not.toBeNull();
        expect(geo.index.count).toBe(3);
    });

    it('geometrieAusTeil (Raster) setzt einen Index', () => {
        const geo = geometrieAusTeil({
            form: 'raster',
            daten: {
                x0: 0, z0: 0, cell: 1, nx: 3, nz: 3,
                heights: Float64Array.from([0, 0, 0, 0, 1, 0, 0, 0, 0]),
            },
        });
        expect(geo, 'Rasterteil ergab keine Geometrie').toBeTruthy();
        expect(geo.index).not.toBeNull();
    });

    it('ein Sweep-Körper (Rohr) trägt seinen Index bis in die Geometrie', () => {
        const k = rohrKoerper([{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }], 300);
        const geo = geometrieAusTeil({ form: 'koerper', daten: k });
        expect(geo.index).not.toBeNull();
        expect(geo.index.count).toBe(k.triCount * 3);
    });
});

describe('der Index schweisst nichts zusammen', () => {
    // Ein Erdkörper braucht FLACHE Facetten: an der Böschungskante ist eine
    // Kante, keine Rundung. Der Index ist deshalb trivial — jede Ecke
    // gehört genau einem Dreieck.
    it('die Ecken bleiben je Dreieck eigen', () => {
        const geo = geometrieAusTeil(dreieck());
        expect(geo.getAttribute('position').count).toBe(3);
        expect(Array.from(geo.index.array)).toEqual([0, 1, 2]);
    });

    it('über 65.535 Ecken trägt der Index 32 Bit', () => {
        // Uint16 läuft bei 65.536 über — ein Gelände hat regelmässig mehr.
        const n = 70000 * 3;
        const positions = new Float64Array(n * 3);
        for (let i = 0; i < n; i++) positions[i * 3] = i;
        const geo = geometrieAusTeil({ form: 'koerper', daten: { triCount: n / 3, positions } });
        expect(geo.index.array).toBeInstanceOf(Uint32Array);
        expect(geo.index.array[n - 1]).toBe(n - 1);
    });
});
