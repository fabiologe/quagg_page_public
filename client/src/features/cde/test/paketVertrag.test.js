// @vitest-environment jsdom
/**
 * Paket v2 — der VERTRAG über die Grenze Browser → Schreiber, an der ECHTEN
 * Kette (Stufe 2 des Aushub-Fachmodells, 2026-09-10).
 *
 * „Tests prüfen die echte Schnittstelle": 2026 waren drei Tests eines
 * DXF-Exports grün, weil sie ihre Eingabe selbst bauten — und der Export
 * schrieb monatelang NaN. Die Python-Tests des Schreibers
 * (`backend/app/ifc/tests/test_eigenbau.py`) bauen ihre Pakete ebenfalls
 * selbst. Dieser Test legt deshalb ein Paket aus der ECHTEN Kette ab
 * (Katalog → Journal → Ableitungslauf → Autor → Paket), und
 * `test_das_paket_der_echten_kette_besteht_mit_seinen_lieferungen` schickt
 * GENAU dieses Paket durch Schreiber, Verbund und Prüftor.
 *
 * Damit die Fixture nicht still veraltet, vergleicht dieser Test bei jedem
 * Lauf die FORM des frischen Pakets mit ihr: Schlüssel, Klassen, Rollen,
 * Vorgänge, Mengenarten, Quellen. Ändert sich die Form, ist er rot, bis sie
 * neu geschrieben ist:
 *
 *     PAKET_VERTRAG_SCHREIBEN=1 npx vitest run src/features/cde/test/paketVertrag.test.js
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { IfcAutor } from '../services/IfcAutor.js';
import { baueEigenbauPaket, PAKET_VERSION } from '../services/EigenbauPaket.js';
import { erdbauSzenario } from './hilfen/erdbauSzenario.js';

const FIXTURE = resolve(process.cwd(), '../backend/app/ifc/tests/daten/paket_v2.json');
/** Formgerechte GlobalIds (22 Zeichen, erstes 0–3) — die Python-Seite liefert Dateien mit genau diesen. */
export const VERTRAG = { ur: '1Ur0Gelaende0Vertrag00', rohr: '2Rohr0Haltung000000001', bauteil: '3Fundament0A0000000001' };

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useBearbeitung().modusSetzen(true);
});

async function paketDerKette() {
    // Zelle 1 m: dieselbe Kette, eine kleinere Fixture.
    const S = erdbauSzenario({ ...VERTRAG, cell: 1 });
    const { ae, stand } = await S.spiele();
    const s = stand();
    const autor = new IfcAutor({ getFragments: () => null, holeQuellForm: S.holeQuellForm, kernel: erzeugeKernel(), getHoehenversatz: () => 300 });
    const schritte = [...s].map(([globalId, wert]) => ({ art: 'erzeugt', globalId, modell: 'cde', wert }));
    const g = await autor.eigenbauGeometrien(schritte, { verdeckt: new Set(ae.wirksamerStand('geloescht').keys()) });
    const paket = baueEigenbauPaket({
        teile: g.bauteile, stand: s, anzeigeformen: g.anzeigeformen,
        // UTM32 in der Gegend der BIM26-Lieferungen — das Fenster, das V06b prüft.
        nachProjekt: (p) => ({ ost: 410300 + p.x, nord: 5460100 - p.z, hoehe: p.y - 50 }),
        crs: 'EPSG:25832', projektname: 'Paketvertrag', schluessel: 'vertrag',
        journal: { commit: 'c-vertrag', sitzungOffen: false }, jetzt: new Date('2026-09-10T00:00:00Z'),
    });
    // Im Viewer füllt `quellDokumenteFuer` das über den GUID-Index; hier steht das Ur-Dokument fest.
    paket.quellDokumente = [{ sha256: 'd'.repeat(64), datei: 'Urgelaende.ifc', revision: 1, globalIds: [VERTRAG.ur] }];
    return paket;
}

/** Die FORM eines Pakets — alles, worauf der Schreiber sich verlässt, ohne Zufallskennungen und Koordinaten. */
function form(p) {
    const k = (o) => Object.keys(o ?? {}).sort();
    return {
        oben: k(p), version: p.version, crs: p.crs,
        quellDokumente: p.quellDokumente.map(k),
        bauteile: p.bauteile.map(b => ({
            klasse: b.klasse, rolle: b.rolle, rezept: b.rezept, predefinedType: b.predefinedType,
            schluessel: k(b), fachmodell: b.fachmodell, wirt: b.wirt,
            vorgang: b.vorgang && { art: b.vorgang.art, reihe: b.vorgang.reihe, titel: b.vorgang.titel, schluessel: k(b.vorgang) },
            mengen: k(b.mengen), quellen: b.quellen, schneidet: b.schneidetAuffuellung.length,
            geometrie: b.punkte.length >= 3 && b.dreiecke.length > 0,
        })),
        uebersprungen: p.uebersprungen.map(u => u.grund),
    };
}

describe('Paket v2 — der Vertrag mit dem Schreiber', () => {
    it('die echte Kette liefert, was der Schreiber-Test liest — und die Fixture hat die Form von heute', async () => {
        const paket = await paketDerKette();
        expect(paket.version).toBe(PAKET_VERSION);
        // Die Zusagen, auf die sich die Python-Seite verlässt:
        const cuts = paket.bauteile.filter(b => b.klasse === 'IFCEARTHWORKSCUT');
        expect(cuts).toHaveLength(3);
        expect(cuts.every(b => b.wirt === VERTRAG.ur && b.mengen.undisturbedVolume > 0)).toBe(true);
        expect(paket.bauteile.some(b => b.klasse === 'IFCGEOGRAPHICELEMENT')).toBe(false);
        expect(cuts.map(b => b.quellen.rohre)).toEqual([[], [VERTRAG.rohr], []]);
        expect(cuts[2].quellen.bauteil).toBe(VERTRAG.bauteil);

        if (process.env.PAKET_VERTRAG_SCHREIBEN) writeFileSync(FIXTURE, JSON.stringify(paket));
        expect(existsSync(FIXTURE), `Fixture fehlt: PAKET_VERTRAG_SCHREIBEN=1 npx vitest run ${'src/features/cde/test/paketVertrag.test.js'}`).toBe(true);
        const abgelegt = JSON.parse(readFileSync(FIXTURE, 'utf8'));
        expect(form(abgelegt)).toEqual(form(paket));
    });
});
