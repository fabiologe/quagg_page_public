/**
 * DAS ERDBAU-SZENARIO — ein geliefertes Gelände, darauf ein Gerinne, ein
 * Kanalgraben und eine Bauwerksgrube, über den ECHTEN Weg (Katalog → Journal).
 *
 * Gebraucht von der Abnahme der Stufe 1 (`stufe1Abnahme.test.js`) und vom
 * Paket-Vertrag der Stufe 2 (`paketVertrag.test.js`). EIN Szenario für beide:
 * zwei nachgebaute Szenarien prüften irgendwann zwei verschiedene Dinge.
 * Die Kennungen sind wählbar — der Vertrag braucht formgerechte GlobalIds,
 * weil sein Paket auf der Python-Seite durch das Prüftor geht.
 *
 * Braucht eine aktive Pinia (der Test setzt sie in `beforeEach`).
 */
import { nachId } from '../../services/Bearbeitungen.js';
import { erdbauStandVon, rezeptNach } from '../../services/Bauteilrezepte.js';
import { useAenderungen } from '../../stores/useAenderungen.js';
import { neuerAbleitungslauf } from '../../services/ableitung/Ableitungslauf.js';
import { erzeugeKernel } from '../../services/geometrie/Kernel.js';
import { rasterAusMesh } from '../../services/geometrie/ops/Raster.js';
import { grundrissAusMesh } from '../../services/geometrie/ops/Umriss.js';

/** Ein Gelände 40 × 40 m um 300 m (Welt), leicht geneigt. */
export function gelaendeNetz() {
    const h = (x, z) => 300 + 0.02 * x - 0.01 * z;
    const t = [];
    for (let x = 0; x < 40; x++) for (let z = 0; z < 40; z++) {
        const a = [x, h(x, z), z], b = [x + 1, h(x + 1, z), z];
        const c = [x + 1, h(x + 1, z + 1), z + 1], d = [x, h(x, z + 1), z + 1];
        t.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    return { positions: new Float64Array(t), triCount: t.length / 9 };
}

/** Ein Quader von (x0, z0) bis (x1, z1), Unterkante u, Oberkante o. */
export function quader(x0, z0, x1, z1, u, o) {
    const p = [];
    const ecke = (x, y, z) => p.push(x, y, z);
    for (const [ax, az, bx, bz] of [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]]) {
        ecke(ax, u, az); ecke(bx, u, bz); ecke(bx, o, bz);
        ecke(ax, u, az); ecke(bx, o, bz); ecke(ax, o, az);
    }
    return { positions: Float64Array.from(p), triCount: p.length / 9 };
}

export function erdbauSzenario({ ur = 'DGM1', rohr = 'H1', bauteil = 'FUND-1', cell = 0.5 } = {}) {
    const achse = { anfang: { x: 5, y: 297.5, z: 30 }, ende: { x: 35, y: 297.2, z: 30 } };
    const fundament = quader(20, 18, 28, 24, 296, 302);
    const urRaster = (c = cell, bereich = null) => rasterAusMesh({ mesh: gelaendeNetz() }, { cell: c, bereich }).ergebnis;
    const holeQuellForm = async (gid, form, { cell: c, bereich = null } = {}) => {
        if (gid === ur && form === 'raster') return urRaster(c ?? cell, bereich);
        if (gid === rohr && form === 'linie') return { punkte: [achse.anfang, achse.ende], dn: 300 };
        if (gid === bauteil && form === 'umriss') return grundrissAusMesh({ mesh: fundament }).ergebnis;
        return null;
    };
    const UR = {
        modelId: 'm1', localId: 7, category: 'IFCGEOGRAPHICELEMENT', globalId: ur, name: 'Urgelände', hoehenversatz: 300,
        quellmass: { pruefmass: { triCount: 3200, spanX: 40, spanY: 1.2, spanZ: 40 }, cell },
    };
    /** Der Kandidat, wie der Viewer ihn ans Subjekt hängt: die ANZEIGE, angereichert mit dem Erdbau-Stand. */
    function anzeigeKandidat(stand) {
        const gid = [...stand].find(([, p]) => p.rezept === 'anzeige')?.[0];
        return { globalId: gid, name: stand.get(gid).name, herkunft: 'cde', pruefmass: null, cell, erdbau: erdbauStandVon(stand, gid) };
    }
    const ROHR = (stand) => ({
        modelId: 'm1', localId: 3, globalId: rohr, name: 'H-001', hoehenversatz: 300,
        achse: { dn: 300, ...achse }, quellmass: { pruefmass: { triCount: 48 } },
        gelaendeQuellen: [anzeigeKandidat(stand)],
    });
    const BAUWERK = (stand) => ({
        globalId: bauteil, modelId: 'm1', localId: 9, name: 'Fundament A', hoehenversatz: 300,
        quellmass: { pruefmass: { triCount: 24 } }, gelaendeQuellen: [anzeigeKandidat(stand)],
    });

    /** Gerinne am Ur, dann Kanalgraben und Baugrube — der Planer wählt jeweils, was er sieht: die Anzeige. */
    async function spiele() {
        const ae = useAenderungen();
        const trage = async (schritte, titel) => {
            if (!schritte) throw new Error(`${titel}: anwenden ergab nichts`);
            const vg = ae.neueVorgangsId();
            for (const s of schritte) await ae.eintragen({ ...s, wer: 'Fabio', vorgang: vg, vorgangTitel: titel });
        };
        const stand = () => ae.wirksamerStand('erzeugt');
        await trage(nachId('gerinne-einschneiden').anwenden(UR,
            { sohleAnfang: 598, sohleEnde: 597.5, sohlbreite: 2, boeschung: 1.5 }, { zug: [{ x: 5, z: 10 }, { x: 35, z: 10 }] }), 'Gerinne');
        await trage(nachId('kanalgraben-ableiten').anwenden(ROHR(stand()),
            { gelaende: anzeigeKandidat(stand()).globalId, dn: 300, umfang: 'haltung', wandform: 'verbau', bettung: 0.1 }), 'Kanalgraben');
        await trage(nachId('bauwerksgrube-ableiten').anwenden(BAUWERK(stand()),
            { gelaende: anzeigeKandidat(stand()).globalId, wandform: 'boeschung', boden: 'nichtbindig' }), 'Baugrube');
        return { ae, stand, trage };
    }

    const lauf = (stand) => neuerAbleitungslauf({ stand, rezeptNach, holeQuellForm, kernel: erzeugeKernel(), hoehenversatz: 300 });
    return { UR, ROHR, BAUWERK, urRaster, holeQuellForm, anzeigeKandidat, spiele, lauf, cell };
}
