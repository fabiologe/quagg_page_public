/**
 * Netztopologie (Stufe 14.5) — wer hängt an wem.
 *
 * Der Plan sah vor, die deklarierten IFC-Beziehungen zu lesen. Die Prüfung an
 * den echten Dateien hat das widerlegt: **null** `IfcDistributionPort`, null
 * `IfcRelConnectsPortToElement`, null `IfcRelConnectsElements`. Es gibt nichts
 * zu lesen.
 *
 * Dafür steht die Verkettung mit voller Schärfe in der Geometrie: Rohrenden
 * liegen in XY exakt auf den Schachtkoordinaten. Der zweite Teil dieser Datei
 * misst das nach — 24/24 und 500/500 Kanten — und prüft die Netz-Befunde
 * gegen die Zahlen, die beim Sichten der Dateien gefunden wurden.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import * as WebIFC from 'web-ifc';
import { baueNetz, grad, strangAb, TOLERANZ_M } from '../services/Netztopologie.js';
import { befundeFuerNetz } from '../services/Befunde.js';
import { IfcQuelle } from '../services/IfcQuelle.js';
import { extractAxisPolylines } from '../services/AxisAnnotations.js';

const p = (x, z, y = 0) => ({ x, y, z });

/** Ein Strang aus drei Haltungen und vier Schächten, alles auf der X-Achse. */
function kleinesNetz(extra = {}) {
    return baueNetz({
        knoten: [
            { id: 'S1', punkt: p(0, 0, 10) },
            { id: 'S2', punkt: p(50, 0, 9) },
            { id: 'S3', punkt: p(100, 0, 8) },
            { id: 'S4', punkt: p(150, 0, 7) },
        ],
        kanten: [
            { id: 'H1', anfang: p(0, 0, 10), ende: p(50, 0, 9), dn: 300, laenge: 50 },
            { id: 'H2', anfang: p(50, 0, 9), ende: p(100, 0, 8), dn: 300, laenge: 50 },
            { id: 'H3', anfang: p(100, 0, 8), ende: p(150, 0, 7), dn: 400, laenge: 50 },
        ],
        ...extra,
    });
}

describe('Verketten über XY-Koinzidenz', () => {
    it('findet für jede Haltung Anfangs- und Endschacht', () => {
        const netz = kleinesNetz();
        expect(netz.kanten.get('H1')).toMatchObject({ von: 'S1', nach: 'S2' });
        expect(netz.kanten.get('H3')).toMatchObject({ von: 'S3', nach: 'S4' });
        expect(netz.loseEnden).toEqual([]);
    });

    it('vergleicht NUR in XY — die Höhen unterscheiden sich mit Absicht', () => {
        // Rohrsohle und Schachtsohle liegen naturgemäss verschieden hoch
        // (Anschlusshöhe, Sohlversatz, Bermen). Wer in 3D vergleicht, findet
        // nichts.
        const netz = baueNetz({
            knoten: [{ id: 'S1', punkt: p(0, 0, 10) }],
            kanten: [{ id: 'H1', anfang: p(0, 0, 7.5), ende: p(50, 0, 7), dn: 300 }],
        });
        expect(netz.kanten.get('H1').von).toBe('S1');
    });

    it('zählt den Grad und erkennt einen Abzweig', () => {
        const netz = kleinesNetz();
        expect(grad(netz, 'S1')).toBe(1);          // Netzanfang, völlig normal
        expect(grad(netz, 'S2')).toBe(2);
        expect(grad(netz, 'gibtsnicht')).toBe(0);
    });

    it('meldet ein loses Ende', () => {
        const netz = baueNetz({
            knoten: [{ id: 'S1', punkt: p(0, 0) }],
            kanten: [{ id: 'H1', anfang: p(0, 0), ende: p(50, 0), dn: 300 }],
        });
        expect(netz.loseEnden).toEqual([
            { kante: 'H1', ende: 'ende', punkt: p(50, 0) },
        ]);
    });

    it('meldet einen Schacht ohne Anschluss', () => {
        const netz = baueNetz({
            knoten: [{ id: 'S1', punkt: p(0, 0) }, { id: 'ALLEIN', punkt: p(999, 999) }],
            kanten: [{ id: 'H1', anfang: p(0, 0), ende: p(0, 0), dn: 300 }],
        });
        expect(netz.ohneAnschluss).toEqual(['ALLEIN']);
    });

    it('greift über die Zellgrenze hinweg', () => {
        // Das Raster teilt in Zellen von Toleranzbreite. Ohne die Suche in den
        // Nachbarzellen fiele ein Treffer knapp jenseits der Grenze durch,
        // obwohl er innerhalb der Toleranz liegt.
        const netz = baueNetz({
            toleranz: 0.01,
            knoten: [{ id: 'S1', punkt: p(0.0149, 0) }],
            kanten: [{ id: 'H1', anfang: p(0.0151, 0), ende: p(50, 0) }],
        });
        expect(netz.kanten.get('H1').von).toBe('S1');
    });

    it('nimmt den NÄCHSTEN Schacht, nicht den ersten gefundenen', () => {
        const netz = baueNetz({
            toleranz: 1,
            knoten: [{ id: 'FERN', punkt: p(0.9, 0) }, { id: 'NAH', punkt: p(0.05, 0) }],
            kanten: [{ id: 'H1', anfang: p(0, 0), ende: p(50, 0) }],
        });
        expect(netz.kanten.get('H1').von).toBe('NAH');
    });

    it('erträgt Unsinn, ohne zu werfen', () => {
        expect(baueNetz().kanten.size).toBe(0);
        expect(baueNetz({ kanten: [{ id: 'X' }], knoten: [{ id: 'Y' }] }).kanten.size).toBe(0);
        expect(TOLERANZ_M).toBe(0.001);
    });
});

describe('Der Strang stromab', () => {
    it('folgt der Kette bis zum Ende', () => {
        expect(strangAb(kleinesNetz(), 'H1')).toEqual(['H1', 'H2', 'H3']);
    });

    it('hört am Abzweig auf, statt eine Richtung zu erfinden', () => {
        // Welche gemeint ist, kann nur ein Mensch entscheiden.
        const netz = baueNetz({
            knoten: [{ id: 'S1', punkt: p(0, 0) }, { id: 'S2', punkt: p(50, 0) }],
            kanten: [
                { id: 'H1', anfang: p(0, 0), ende: p(50, 0) },
                { id: 'A', anfang: p(50, 0), ende: p(100, 0) },
                { id: 'B', anfang: p(50, 0), ende: p(50, 50) },
            ],
        });
        expect(strangAb(netz, 'H1')).toEqual(['H1']);
    });

    it('läuft in einem Kreis nicht ewig', () => {
        // Ein falsch digitalisiertes Netz kann sehr wohl im Kreis laufen.
        const netz = baueNetz({
            knoten: [{ id: 'S1', punkt: p(0, 0) }, { id: 'S2', punkt: p(50, 0) }],
            kanten: [
                { id: 'H1', anfang: p(0, 0), ende: p(50, 0) },
                { id: 'H2', anfang: p(50, 0), ende: p(0, 0) },
            ],
        });
        expect(strangAb(netz, 'H1')).toEqual(['H1', 'H2']);
    });
});

describe('Netz-Befunde', () => {
    it('meldet abnehmende Nennweite in Fliessrichtung', () => {
        const netz = baueNetz({
            // Auch der Zulauf braucht seinen Schacht — sonst meldet er ein
            // loses Ende, und der Befund, um den es hier geht, ginge darin
            // unter.
            knoten: [{ id: 'S0', punkt: p(-50, 0) }, { id: 'S1', punkt: p(0, 0) },
                     { id: 'S2', punkt: p(50, 0) }],
            kanten: [
                { id: 'ZU', anfang: p(-50, 0), ende: p(0, 0), dn: 500 },
                { id: 'AB', anfang: p(0, 0), ende: p(50, 0), dn: 300 },
            ],
        });
        const b = befundeFuerNetz(netz);
        expect(b.get('AB')[0].regel).toBe('dn_nimmt_ab');
        expect(b.get('AB')[0].grenze).toMatch(/DN 500/);
        expect(b.has('ZU')).toBe(false);
    });

    it('meldet einen Zulauf unter dem Ablauf', () => {
        const netz = baueNetz({
            knoten: [{ id: 'S0', punkt: p(-50, 0) }, { id: 'S1', punkt: p(0, 0) },
                     { id: 'S2', punkt: p(50, 0) }],
            kanten: [
                { id: 'ZU', anfang: p(-50, 0, 12), ende: p(0, 0, 9), dn: 300 },
                { id: 'AB', anfang: p(0, 0, 10), ende: p(50, 0, 8), dn: 300 },
            ],
        });
        expect(befundeFuerNetz(netz).get('ZU')[0].regel).toBe('zulauf_unter_ablauf');
    });

    it('meldet NICHTS, wenn alles stimmt', () => {
        expect(befundeFuerNetz(kleinesNetz()).size).toBe(0);
    });

    it('alle Netz-Befunde beraten nur', () => {
        const netz = baueNetz({
            knoten: [{ id: 'ALLEIN', punkt: p(999, 999) }],
            kanten: [{ id: 'H1', anfang: p(0, 0), ende: p(50, 0) }],
        });
        for (const liste of befundeFuerNetz(netz).values()) {
            for (const b of liste) expect(['hinweis', 'warnung']).toContain(b.schwere);
        }
    });
});

// ── Die Probe an den echten Netzen ─────────────────────────────────────────

const NETZE = [
    { name: 'ENQUIER', kanten: 24, isoliert: 0,
      pfad: '/mnt/storagebox/1_Projekte/01_Laufend/1337_Genau/CDE/6275_ENQUIER_0X_2026-08-31.ifc' },
    { name: 'A64', kanten: 500, isoliert: 15,
      pfad: '/home/fabio/quagg_page/client/testdata-local/6178_A64-2BA_0_2026-03-18 (12).ifc' },
];
const vorhanden = NETZE.every(n => fs.existsSync(n.pfad));

describe.runIf(vorhanden)('An den echten Netzen', () => {
    const gebaut = new Map();
    const quellen = [];

    beforeAll(async () => {
        for (const netz of NETZE) {
            const q = await IfcQuelle.oeffne(WebIFC, new Uint8Array(fs.readFileSync(netz.pfad)),
                { wasmPfad: 'node_modules/web-ifc/', name: netz.name });
            quellen.push(q);
            const schaechte = q.platzierungen(
                q.ids('IFCDISTRIBUTIONCHAMBERELEMENT', { untertypen: true }));
            gebaut.set(netz.name, baueNetz({
                kanten: extractAxisPolylines(q).map(a => ({
                    id: a.expressId, anfang: a.polyline[0], ende: a.polyline.at(-1),
                    dn: a.dn, laenge: a.laenge,
                })),
                knoten: [...schaechte].map(([id, punkt]) => ({ id, punkt })),
            }));
        }
    }, 300000);

    afterAll(() => quellen.forEach(q => q.schliesse()));

    for (const netz of NETZE) {
        it(`${netz.name}: JEDE Haltung findet beide Schächte — ohne Toleranz`, () => {
            // Die Abweichung ist exakt 0,000 m. Bräuchte es hier ein
            // Toleranzfenster, wäre die Annahme falsch, auf der die ganze
            // Topologie ruht.
            const n = gebaut.get(netz.name);
            expect(n.kanten.size).toBe(netz.kanten);
            expect(n.loseEnden).toEqual([]);
            expect([...n.kanten.values()].every(k => k.von && k.nach)).toBe(true);
        });
    }

    it('A64: findet die 15 Schächte ohne Anschluss', () => {
        // Unabhängig gefunden beim Sichten der Datei.
        expect(gebaut.get('A64').ohneAnschluss).toHaveLength(15);
    });

    it('ENQUIER: kein Schacht steht allein', () => {
        expect(gebaut.get('ENQUIER').ohneAnschluss).toEqual([]);
    });

    it('die Stränge lassen sich verfolgen', () => {
        const n = gebaut.get('ENQUIER');
        const anfaenge = [...n.knoten.values()].filter(k => !k.kantenAn.length && k.kantenAb.length);
        expect(anfaenge.length).toBeGreaterThan(0);
        const kette = strangAb(n, anfaenge[0].kantenAb[0]);
        expect(kette.length).toBeGreaterThan(0);
        expect(new Set(kette).size).toBe(kette.length);   // keine Wiederholung
    });
});
