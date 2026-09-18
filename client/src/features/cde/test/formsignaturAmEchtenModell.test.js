// @vitest-environment node
/**
 * Bauform-Erkennung an FABIOS ECHTEN DATEIEN — der ganze Weg (2026-09-07).
 *
 * Zwei Befunde vom selben Tag, beide nur an der echten Datei sichtbar:
 *
 *   1. Das DGM der fertigen Planung ist ein `IfcCivilElement` — IFC4, in 4.3
 *      abgekündigt (das damalige bSDD-Wörterbuch führte ihn deshalb nicht). Die Aufzählung „alle Produkte" lief über das 4.3-Wörterbuch
 *      und fragte web-ifc nach diesem Typ nie: Suchindex, Bauformen-Panel und
 *      Gelände-Kandidaten sahen das Gelände nicht. Kur: `fremdeUntertypen`
 *      erkennt Typen STRUKTURELL (ObjectPlacement + Representation).
 *   2. Der Geometrie-Rückfall kannte nur Achse/geschlossen/netz — ein offenes
 *      Gelände wurde `netz`, ohne ein einziges Werkzeug. Kur: die
 *      Formsignatur (liegend flach, Oberseite uneben ⇒ Höhenfeld, geschätzt).
 *
 * Der Resolver ist hier eine Attrappe in der Form der Wirklichkeit: die
 * Dreiecke sind die ECHTEN aus der Datei (`IfcQuelle.dreiecke`), nur der
 * Transport über fragments fehlt — der braucht WebGL.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IfcQuelle, STRUKTUR_MERKMALE, mitUntertypen } from '../services/IfcQuelle.js';
import { bestimme } from '../services/bauform/Bauformen.js';
import { bauformAusNetz, FLACH } from '../services/bauform/Formsignatur.js';
import { profilFuer } from '../services/bauform/Typprofile.js';
import { passende } from '../services/Bearbeitungen.js';
import { meshVolume } from '../services/geometrie/MeshOps.js';

const hier = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.resolve(hier, '../../../../');
const require = createRequire(import.meta.url);
const WASM = { wasmPfad: path.join(wurzel, 'node_modules/web-ifc/'), absolut: true };
const CDE = '/mnt/storagebox/1_Projekte/01_Laufend/1337_Genau/CDE';
const PLANUNG = path.join(CDE, 'BIM26_Gruppe5_BODEN_Planung.ifc');
const ERDARBEITEN = path.join(hier, 'BIM26_Gruppe5_BODEN_Erdarbeiten3.ifc');

let WebIFC;
const offen = [];
beforeAll(() => { WebIFC = require('web-ifc'); });
afterAll(() => { for (const q of offen) q?.schliesse(); });

async function oeffne(datei) {
    if (!fs.existsSync(datei)) return null;
    const q = await IfcQuelle.oeffne(WebIFC, new Uint8Array(fs.readFileSync(datei)), WASM);
    offen.push(q);
    return q;
}

/** Resolver-Attrappe: echte Dreiecke, echtes Attest, keine Achse. */
function resolverAus(q, id) {
    const netz = q.dreiecke(id);
    const att = netz ? meshVolume(netz.positions, netz.triCount) : { closed: false };
    return {
        forElements: () => ({
            async getForm(form) {
                if (form === 'axis') return { perElement: [{ polyline: null, source: 'none', warnings: [] }], warnings: [] };
                if (form === 'solid') return { data: netz ? { ...netz, closed: att.closed } : null, warnings: [] };
                if (form === 'mesh') return { data: netz, warnings: [] };
                return { data: null, warnings: [] };
            },
        }),
    };
}

// Die Planungsdatei lag im Projekt 1337 und liegt dort nicht mehr (2026-09-11
// nachgesehen). Bis dahin kehrten diese Tests mit `if (!q) return;` still
// zurück und zählten als BESTANDEN — jetzt stehen sie als übersprungen da.
const PLANUNG_DA = fs.existsSync(PLANUNG);

describe.skipIf(!PLANUNG_DA)('Befund 1 — ein abgekündigter Typ wird gefunden', () => {
    let q;
    beforeAll(async () => { q = await oeffne(PLANUNG); }, 120_000);

    it('das Wörterbuch kennt IFCCIVILELEMENT selbst — der strukturelle Weg bleibt für Fremdnamen', () => {
        // Bis 2026-09-11 kannte das (bSDD-)Wörterbuch ihn nicht, und
        // `fremdeUntertypen` fand ihn über die Struktur. Er steht aber in
        // IFC4X3_ADD2, abgekündigt; das Wörterbuch aus dem Schema führt ihn.
        expect(STRUKTUR_MERKMALE.IFCPRODUCT).toEqual(['ObjectPlacement', 'Representation']);
        expect(mitUntertypen('IFCPRODUCT')).toContain('IFCCIVILELEMENT');
        expect(q.fremdeUntertypen('IFCPRODUCT')).toEqual([]);
    });

    it('„alle Produkte" enthält das DGM jetzt — mit Namen', () => {
        const ids = q.ids('IFCPRODUCT', { untertypen: true });
        const dgm = ids.map(id => q.zeile(id)).find(z => q.kategorieVon(z) === 'IFCCIVILELEMENT');
        expect(dgm).toBeTruthy();
        expect(dgm.Name?.value).toMatch(/DGM der fertigen Planung/);
        // Vorher: Building, Site — und sonst nichts.
        expect(ids.length).toBeGreaterThanOrEqual(3);
    });

    it('die Dreiecke kommen aus der Quelle — 45.710, Platzierung angewandt', () => {
        const [id] = q.ids('IFCCIVILELEMENT');
        const netz = q.dreiecke(id);
        expect(netz.triCount).toBe(45710);
        expect(netz.positions).toBeInstanceOf(Float64Array);
    });
});

describe('Befund 2 — das DGM wird als Höhenfeld VORGESCHLAGEN, mit Grund', () => {
    it.skipIf(!PLANUNG_DA)('IfcCivilElement „DGM der fertigen Planung" → hoehenfeld, geschätzt, aus der Geometrie', async () => {
        const q = await oeffne(PLANUNG);
        const [id] = q.ids('IFCCIVILELEMENT');
        const r = await bestimme({ modelId: 'm', localId: id, category: 'IFCCIVILELEMENT' },
            { resolver: resolverAus(q, id), typprofil: profilFuer('IFCCIVILELEMENT') });
        expect(r).toMatchObject({ bauform: 'hoehenfeld', guete: 'geschaetzt', quelle: 'geometrie' });
        expect(r.grund).toMatch(/liegend flach|Blatt/);
        expect(r.grund).toMatch(/uneben/);
        expect(r.signatur.relief).toBeLessThan(FLACH);
        // Und damit gibt es die Gelände-Werkzeuge — vorher: keins.
        const werkzeuge = passende(r).map(b => b.id);
        expect(werkzeuge).toContain('gerinne-einschneiden');
        expect(werkzeuge).toContain('planum-herstellen');
    }, 120_000);

    it('die geschlossenen IfcEarthworksElement wären auch OHNE Typprofil Höhenfelder', async () => {
        const q = await oeffne(ERDARBEITEN);
        expect(q, 'Testdatei liegt im Repo').not.toBe(null);
        for (const id of q.ids('IFCEARTHWORKSELEMENT').slice(0, 3)) {
            const netz = q.dreiecke(id);
            const att = meshVolume(netz.positions, netz.triCount);
            const r = bauformAusNetz({ ...netz, closed: att.closed, achse: null });
            expect(r.bauform, `#${id}`).toBe('hoehenfeld');
        }
    }, 120_000);
});
