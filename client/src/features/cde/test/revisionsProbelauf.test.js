/**
 * DER REVISIONS-PROBELAUF (Audit-Lücke 3, 2026-09-02).
 *
 * Der Drei-Wege-Vergleich war testfest, aber nie gegen eine ECHTE neue
 * Revision gefahren. Hier entsteht Revision B wirklich: die echte
 * ENQUIER-Datei wird mit web-ifc geöffnet, EIN Platzierungspunkt einer
 * Haltung um einen halben Meter verschoben (WriteLine), als IFC gespeichert
 * (SaveModel) und wieder gelesen. Dann muss die Achslese genau DIESE eine
 * Haltung anders sehen — und das Nachspielen genau sie als Konflikt melden,
 * alle anderen als sauber.
 *
 * Merke: `polyline[0]` ist ein {x,y,z}-OBJEKT (y = Höhe), kein Array —
 * der erste Anlauf dieses Tests griff mit Indizes zu und verglich NaN.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import * as WebIFC from 'web-ifc';
import { IfcQuelle } from '../services/IfcQuelle.js';
import { extractAxisPolylines } from '../services/AxisAnnotations.js';
import { planeNachspielen } from '../services/Nachspielen.js';

const DATEI = '/mnt/storagebox/1_Projekte/01_Laufend/1337_Genau/CDE/6275_ENQUIER_0X_2026-08-31.ifc';
const vorhanden = fs.existsSync(DATEI);
const WASM = 'node_modules/web-ifc/';

/** GlobalId → Achsanfang {x,y,z} — dieselbe Lese wie leseAchsen. */
function achsKarte(quelle) {
    const karte = new Map();
    for (const a of extractAxisPolylines(quelle)) {
        const gid = quelle.zeile(a.expressId)?.GlobalId?.value;
        if (gid) karte.set(gid, { anfang: a.polyline[0], expressId: a.expressId });
    }
    return karte;
}

let quelleA = null, quelleB = null, kartaA, kartaB, verschoben;

beforeAll(async () => {
    if (!vorhanden) return;
    quelleA = await IfcQuelle.oeffne(WebIFC, new Uint8Array(fs.readFileSync(DATEI)),
        { wasmPfad: WASM, name: 'revision-a' });
    kartaA = achsKarte(quelleA);

    // Revision B: bei EINER Haltung den Platzierungspunkt heben — über die
    // Kette ObjectPlacement → RelativePlacement → Location zum CARTESIANPOINT.
    verschoben = [...kartaA.keys()][3];
    const api = quelleA.api;
    const mid = quelleA.modelID;
    const rohr = api.GetLine(mid, kartaA.get(verschoben).expressId);
    const platz = api.GetLine(mid, rohr.ObjectPlacement.value);
    const rel = api.GetLine(mid, platz.RelativePlacement.value);
    const punkt = api.GetLine(mid, rel.Location.value);
    punkt.Coordinates[0].value = Number(punkt.Coordinates[0].value) + 0.5;
    api.WriteLine(mid, punkt);

    const bytes = api.SaveModel(mid);
    quelleB = await IfcQuelle.oeffne(WebIFC, new Uint8Array(bytes),
        { wasmPfad: WASM, name: 'revision-b' });
    kartaB = achsKarte(quelleB);
}, 180000);

afterAll(() => { quelleA?.schliesse(); quelleB?.schliesse(); });

describe.runIf(vorhanden)('Revision B aus der echten Datei', () => {
    it('genau die verschobene Haltung liest sich anders — alle übrigen bitgleich', () => {
        expect(kartaA.size).toBeGreaterThan(20);
        expect(kartaB.size).toBe(kartaA.size);
        let anders = 0;
        for (const [gid, a] of kartaA) {
            const b = kartaB.get(gid);
            const d = Math.hypot(b.anfang.x - a.anfang.x,
                                 b.anfang.y - a.anfang.y,
                                 b.anfang.z - a.anfang.z);
            if (d > 1e-9) {
                anders++;
                expect(gid).toBe(verschoben);
                expect(d).toBeCloseTo(0.5, 6);
            }
        }
        expect(anders).toBe(1);
    });

    it('das Nachspielen meldet GENAU sie als Konflikt — der Rest ist sauber', () => {
        const unveraendert = [...kartaA.keys()].find(g => g !== verschoben);
        const eintraege = [
            // Der Planer (Revision B) hat die Haltung bewegt, WIR hatten sie
            // auch festgelegt → beide haben geändert → Konflikt.
            { id: 'e1', art: 'lage', globalId: verschoben, modell: 'geliefert',
              basis: { ...kartaA.get(verschoben).anfang },
              vorher: null, nachher: { x: 1, y: 2, z: 3 } },
            // Unberührte Haltung: basis == Ist → sauber anwenden.
            { id: 'e2', art: 'lage', globalId: unveraendert, modell: 'geliefert',
              basis: { ...kartaA.get(unveraendert).anfang },
              vorher: null, nachher: { x: 4, y: 5, z: 6 } },
            // Bauteil, das es in B nicht gibt → fehlt, kein stiller Verlust.
            { id: 'e3', art: 'lage', globalId: 'GIBTSNICHT', modell: 'geliefert',
              basis: { x: 0, y: 0, z: 0 }, vorher: null, nachher: { x: 7, y: 8, z: 9 } },
        ];
        const plan = planeNachspielen(eintraege,
            (gid) => (kartaB.has(gid) ? { ...kartaB.get(gid).anfang } : undefined));

        const je = new Map(plan.konflikte.map(k => [k.globalId, k.zustand]));
        expect(je.get(verschoben)).toBe('konflikt');
        expect(je.get('GIBTSNICHT')).toBe('fehlt');
        expect(plan.anzuwenden.map(a => a.globalId)).toEqual([unveraendert]);
        expect(plan.zusammenfassung).toMatchObject(
            { angewandt: 1, konflikte: 2, fehlend: 1, ueberschnitten: 1 });
    });
});
