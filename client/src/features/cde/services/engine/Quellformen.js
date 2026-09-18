/**
 * Quellformen — aus der IfcEngine ausgelagert (Teil XXIII, A8; Befund B13).
 *
 * Die Kernel-Form eines gelieferten Bauteils (Raster, Linie, Knoten, Körper)
 * und die Kandidatenlisten für Gelände, Erdkörper und Körper.
 *
 * Jede Funktion bekommt die Engine als ersten Parameter (`engine`) und liest
 * nur, was sie braucht; die Engine behält eine einzeilige Weiterleitung, damit
 * ihre Aufrufer (Viewer, Tests) unverändert bleiben.
 */
import { BAUTEILFARBEN, farbeFuer } from '../Bauteilfarben.js';
import { CDE_MODELL_ID } from '../IfcAutor.js';
import { achsbezugVon } from '../Achsbezug.js';
import { basisModelId } from '../DeltaBoxen.js';
import { grundrissAusMesh, pruefmassVon, zellweiteVorschlag } from '../geometrie/hilfen.js';
import { heightfieldRaster } from '../geometrie/SurfaceOps.js';
import { karteMitEngine } from '../GlobalIdKarte.js';
import { meshVolume } from '../geometrie/MeshOps.js';

/**
 * Was für einen Mengenauszug gebraucht wird — je Bauteil eine Zeile.
 *
 * GlobalId, Länge, Nennweite und die Merkmale, alles aus dem, was seit dem
 * Laden bereitsteht. Gerechnet wird hier nichts: das tut `Sanierung.js`,
 * und zwar rein, damit es sich prüfen lässt.
 */
/**
 * Das Höhenraster eines GELIEFERTEN Bauteils — für das Gelände-Rezept
 * und den Erdmassen-Auszug. Über den Resolver (dieselbe Ableitung wie
 * die Analyse), nie aus dem Journal (Stufe 15).
 */
export async function _quellFormVon(engine, globalId, form = 'raster', { cell = null, bereich = null, gitter = null } = {}) {
    // Die ACHSE eines gelieferten Rohrs (G6) steht seit dem Laden im
    // Achsenband — mit DN, in Welt. Kein Resolver, kein Netz.
    if (form === 'linie') return engine._achseAlsLinie(globalId);
    // Der KNOTEN eines Schachts (B3) — wirksam, aus dem Fachmodell, kein Netz.
    if (form === 'knoten') return engine._knotenMitUnterkante(globalId);
    // `karteMitEngine` liefert den UMSCHLAG {karte, fehlend} — hier stand
    // `karte.get(…)` auf dem Umschlag, und damit warf jeder Gelände-
    // Neuaufbau nach F5 und jeder Erdmassen-Auszug (Teil XIV, Stufe 0;
    // der Test gelaendeFormen prüfte nur mit Attrappe an dieser Stelle
    // vorbei — quellrasterVerdrahtung.test.js ruft den echten Körper).
    const { karte } = await karteMitEngine(engine, [globalId]);
    const treffer = karte.get(globalId);
    if (!treffer) return null;
    const res = await engine.makeGeometryResolver()
        ?.forElements([treffer])?.getForm('mesh');
    const d = res?.data;
    if (!d?.positions?.length) return null;
    if (form === 'mesh') return { positions: d.positions, triCount: d.triCount };
    if (form === 'umriss') {
        // DER GRUNDRISS eines Bauteils (E1b): die umschliessende Form im
        // Lageplan, samt Unter- und Oberkante. Daran richtet sich eine
        // Bauwerksgrube aus — Sohle auf der Gründungstiefe, Arbeitsraum
        // nach aussen. Ein grosses Netz wird abgetastet: für die Hülle
        // braucht es nicht jede Ecke.
        const schritt = d.triCount > 20000 ? Math.ceil(d.triCount / 20000) : 1;
        const { ergebnis, warnungen } = grundrissAusMesh({ mesh: { positions: d.positions, triCount: d.triCount } }, { schritt });
        if (!ergebnis) return null;
        return { ...ergebnis, warnungen };
    }
    if (form === 'koerper') {
        // Ein gelieferter Körper mit Attest — die Aussparung (G7) braucht
        // ihn geschlossen; `closed` sagt ehrlich, ob er es ist.
        const positions = d.positions instanceof Float64Array ? d.positions : Float64Array.from(d.positions);
        const att = meshVolume(positions, d.triCount);
        return { positions, triCount: d.triCount, closed: !!att.closed, volumen: Math.abs(att.volume ?? 0), warnungen: att.warnings ?? [] };
    }
    // `cell` MUSS von aussen kommen, sobald zwei Raster verglichen werden:
    // die Automatik rechnet die Zellweite aus der Dreieckszahl der
    // jeweiligen Quelle, und zwei Quellen ergäben zwei Bezüge.
    // `gitter` legt einen Korridor auf die Knoten des groben Rasters —
    // sonst zeigen Erdkörper und Geländeanzeige zwei fast gleiche Flächen
    // (Teil XXI).
    return heightfieldRaster(d.positions, d.triCount, cell ?? null, [], { bereich, gitter });
}

/** Kernel-Form `linie` einer gelieferten Achse: {punkte:[{x,y,z}], dn} oder null. */
export function _achseAlsLinie(engine, globalId) {
    for (const karte of (engine._achsen ?? new Map()).values()) {
        for (const a of karte.values()) {
            if (a.globalId !== globalId) continue;
            const punkte = (a.polyline ?? []).map(p => ({ x: p.x, y: p.y, z: p.z }));
            // DER ACHSBEZUG WANDERT MIT (Teil XXI, E4): ob diese Höhe die
            // Sohle oder die Rohrmitte meint, weiss nur, WOHER die Achse
            // kommt. Ohne die Angabe raten Graben und Längsschnitt jeder
            // für sich — und unterschiedlich (siehe Achsbezug.js).
            return punkte.length >= 2
                ? { punkte, dn: a.dn ?? null, achsbezug: achsbezugVon(a.quelle), quelle: a.quelle ?? null }
                : null;
        }
    }
    return null;
}

/**
 * Welche Gelände kommen als QUELLE einer Ableitung in Frage (G6)? Das
 * sind dieselben Elemente, die der Sampler nimmt — gelieferte
 * Terrain-Kategorien ohne Verdecktes plus die eigenen DGM-Teile — hier
 * mit Kennung, Herkunft, Prüfmass und Zellweite, damit `anwenden`
 * synchron bleibt und nichts nachrechnen muss.
 * @returns {Promise<Array<{globalId, name, herkunft, modelId, localId, pruefmass, cell}>>}
 */
export async function gelaendeKandidaten(engine) {
    const verdeckt = engine._verdeckt ?? new Set();
    // DIESELBE Memo wie der Sampler: was hier zur Auswahl steht, muss
    // exakt das sein, woraus danach gerechnet wird. Zwei Läufe derselben
    // Frage können auseinanderlaufen — und seit die Antwort von einer
    // Auslegung abhängt, wäre das schwer zu bemerken.
    const elemente = await engine._gelaendeOrteHolen();
    const cdeIds = [...(engine._cdeGelaende ?? [])].filter(g => !verdeckt.has(g));
    const { karte: cdeKarte } = cdeIds.length ? await karteMitEngine(engine, cdeIds) : { karte: new Map() };
    const cdeOrte = new Map([...cdeKarte].map(([gid, t]) => [`${t.modelId}|${t.localId}`, gid]));
    const out = [];
    for (const e of elemente) {
        let globalId = cdeOrte.get(`${e.modelId}|${e.localId}`) ?? null;
        const herkunft = globalId ? 'cde' : 'geliefert';
        let name = '';
        if (!globalId) {
            const zeile = engine.quelleVon(e.modelId)?.zeile(e.localId) ?? null;
            globalId = zeile?.GlobalId?.value ?? null;
            name = zeile?.Name?.value ?? '';
        }
        if (!globalId) continue;
        let pruefmass = null;
        let cell = null;
        try {
            const res = await engine.makeGeometryResolver()
                ?.forElements([{ modelId: e.modelId, localId: e.localId }])?.getForm('mesh');
            const d = res?.data;
            if (d?.positions?.length) {
                pruefmass = pruefmassVon({ positions: d.positions, triCount: d.triCount });
                cell = zellweiteVorschlag(pruefmass);
            }
        } catch { /* ohne Prüfmass, aber mit Kennung — der Quellen-Arm urteilt dann nicht */ }
        out.push({ globalId, name, herkunft, modelId: e.modelId, localId: e.localId, pruefmass, cell });
    }
    return out;
}

/**
 * Gelieferte Bauteile, für die der Farbkatalog etwas zu sagen hat.
 * @returns {Promise<Array<{modelId, localId, kategorie}>>}
 */
export async function erdbauKandidaten(engine, { deckel = 400 } = {}) {
    const aus = [];
    let gruppen = [];
    try { gruppen = await engine.getCategoryGroups(); } catch { return aus; }
    for (const g of gruppen ?? []) {
        const kategorie = String(g?.name ?? '').toUpperCase();
        if (!farbeFuer(kategorie, engine._farbsatz ?? BAUTEILFARBEN)) continue;
        let map;
        try { map = await g.groupData.get(); } catch { continue; }
        if (!map) continue;
        const paare = map instanceof Map ? [...map.entries()] : Object.entries(map);
        for (const [modelId, roh] of paare) {
            // Das CDE-Modell nicht: dort sitzt die Farbe schon im Material.
            if (basisModelId(modelId) === CDE_MODELL_ID) continue;
            const ids = Array.isArray(roh) ? roh : (roh instanceof Set ? [...roh] : []);
            for (const localId of ids) {
                if (aus.length >= deckel) return aus;
                aus.push({ modelId, localId: Number(localId), kategorie });
            }
        }
    }
    return aus;
}

/** Die eigenen Körper (Aushub, Graben, Rohr, Schacht …) mit Namen — als Werkzeug einer Aussparung (G7). */
export function koerperKandidaten(engine) {
    const verdeckt = engine._verdeckt ?? new Set();
    return [...(engine._cdeKoerper ?? [])]
        .filter(g => !verdeckt.has(g))
        .map(globalId => ({ globalId, name: engine._cdeNameVon(globalId) ?? '', herkunft: 'cde' }));
}
