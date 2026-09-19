/**
 * Beziehungslauf — aus der IfcEngine ausgelagert (Teil XXIII, A8; Befund B13).
 *
 * Der Beziehungsindex über alle Modelle und die Kollisionsprüfung.
 *
 * Jede Funktion bekommt die Engine als ersten Parameter (`engine`) und liest
 * nur, was sie braucht; die Engine behält eine einzeilige Weiterleitung, damit
 * ihre Aufrufer (Viewer, Tests) unverändert bleiben.
 */
import { achsbezugDerAchse } from '../Achsbezug.js';
import { CDE_MODELL_ID } from '../IfcAutor.js';
import { aufgeloestesRegelwerk } from '../regeln/Regelwerk.js';
import { baueBeziehungen } from '../Beziehungen.js';
import { karteMitEngine } from '../GlobalIdKarte.js';

/**
 * DER Beziehungsindex — gecacht bis zum nächsten Journalstand oder
 * Modellwechsel, dann nur für Berührtes neu (Dirty-Menge aus
 * `setzeJournalStand`). Nichts wartet auf den Server: die Güte `koerper`
 * setzt allein `kollisionenPruefen` auf die Kandidaten dieses Index.
 * @returns {Promise<object|null>}  der Index (`von`, `partner`, `paare`, `verbund`)
 */
export async function beziehungen(engine, { regelwerk = null } = {}) {
    if (engine._beziehungen && !engine._beziehungenDirty) return engine._beziehungen;
    if (!engine._beziehungenLauf) {
        const nr = engine._beziehungenNr ?? 0;
        engine._beziehungenLauf = (async () => {
            const dirty = engine._beziehungenDirty instanceof Set ? engine._beziehungenDirty : null;
            const vorher = dirty ? engine._beziehungen : null;
            const { objekte, gruppen } = await engine._beziehungsObjekte(dirty);
            let hoeheAn = null;
            try {
                const sampler = await engine.gelaendeSampler();
                if (sampler) hoeheAn = (x, z) => sampler.sample(x, z);
            } catch { hoeheAn = null; }
            const gelaendeGid = [...(engine._cdeGelaende ?? [])].find(g => !(engine._verdeckt?.has(g))) ?? null;
            const idx = baueBeziehungen({
                objekte, gruppen,
                gelaende: hoeheAn ? { globalId: gelaendeGid ?? undefined, name: gelaendeGid ? (engine._cdeNameVon?.(gelaendeGid) || 'DGM') : 'Gelände', hoeheAn } : null,
                ableitungen: engine._cdeAbleitungen ?? [],
                // Das GELTENDE Regelwerk (AR): Büro/Projekt überschreiben je Wert.
                regeln: regelwerk ?? aufgeloestesRegelwerk(),
                vorher, dirty,
            });
            // Überholt? Dann ist inzwischen ein neuer Stand da — nicht zurückschreiben.
            if (nr !== (engine._beziehungenNr ?? 0)) return engine._beziehungen ?? idx;
            engine._beziehungen = idx;
            engine._beziehungenDirty = null;
            return idx;
        })().finally(() => { engine._beziehungenLauf = null; });
    }
    return engine._beziehungenLauf;
}

/**
 * Die Objekte des Index: alles Gelieferte mit Geometrie, Achse oder
 * Knoten (ohne Gelände, ohne Verdecktes — Gelände ist die Seite der
 * `auflage`, nicht ihr Partner), dazu die eigenen Rohre, Schächte und
 * Körper. Hüllen aus `boxenVon` (Delta-bewusst), einmal je Modell und
 * danach nur für Bewegtes. Dazu die GRUPPEN aus den Merkmalen
 * (Kanalart) — das einzige Gruppenmerkmal, das in den echten Dateien steht.
 */
export async function _beziehungsObjekte(engine, dirty = null) {
    const verdeckt = engine._verdeckt ?? new Set();
    let gelaendeOrte = new Set();
    try { gelaendeOrte = new Set((await engine._gelaendeOrteHolen()).map(o => `${o.modelId}|${o.localId}`)); } catch { /* ohne Gelände keine Auflage */ }
    const objekte = [];
    const gruppen = new Map();
    for (const [modelId, quelle] of engine._quellen ?? new Map()) {
        if (!quelle?.lebt?.()) continue;
        let eintrag = engine._huellen.get(modelId);
        if (!eintrag) {
            eintrag = { ids: quelle.ids('IFCPRODUCT', { untertypen: true }), boxen: new Map() };
            engine._huellen.set(modelId, eintrag);
            const boxen = await engine.autor?.boxenVon?.(modelId, eintrag.ids) ?? new Map();
            for (const id of eintrag.ids) eintrag.boxen.set(id, boxen.get(id) ?? null);
        } else if (dirty instanceof Set && dirty.size) {
            const frisch = eintrag.ids.filter(id => { const g = quelle.zeile(id)?.GlobalId?.value; return g && dirty.has(g); });
            if (frisch.length) {
                const boxen = await engine.autor?.boxenVon?.(modelId, frisch) ?? new Map();
                for (const id of frisch) eintrag.boxen.set(id, boxen.get(id) ?? null);
            }
        }
        const achsen = engine._achsen?.get(modelId) ?? new Map();
        const knoten = engine._knoten?.get(modelId) ?? new Map();
        const merkmale = engine._merkmale?.get(modelId) ?? null;
        for (const localId of eintrag.ids) {
            const z = quelle.zeile(localId);
            const gid = z?.GlobalId?.value ?? null;
            if (!gid || verdeckt.has(gid) || gelaendeOrte.has(`${modelId}|${localId}`)) continue;
            const huelle = eintrag.boxen.get(localId) ?? null;
            const a = achsen.get(localId) ?? null;
            const k = knoten.get(localId) ?? null;
            if (!huelle && !a && !k) continue;
            objekte.push({
                globalId: gid, name: z.Name?.value ?? '', kategorie: quelle.kategorieVon(z) ?? '',
                herkunft: 'geliefert', huelle,
                // Mit dem BEZUG der Achse (K4): die Überdeckung misst am Scheitel.
                achse: a ? { punkte: a.polyline, dn: a.dn, achsbezug: achsbezugDerAchse(a), sohlabstand: a.sohlabstand ?? null } : null,
                knoten: k ? k.punkt : null,
                ort: { modelId, localId },
            });
            const kanalart = merkmale?.get(localId)?.Kanalart;
            if (kanalart) gruppen.set(gid, [String(kanalart)]);
        }
    }
    // Eigene Bauteile — Hüllen immer frisch (nach jedem Neuaufbau neue localIds).
    const cdeGids = new Set([
        ...(engine._cdeKanten?.keys() ?? []), ...(engine._cdeKnoten?.keys() ?? []), ...(engine._cdeKoerper ?? []),
    ].filter(g => !verdeckt.has(g) && !engine._cdeGelaende?.has(g)));
    if (cdeGids.size) {
        let karte = new Map();
        try { ({ karte } = await karteMitEngine(engine, [...cdeGids])); } catch { karte = new Map(); }
        const orte = [...karte].filter(([, t]) => t.modelId === CDE_MODELL_ID);
        let boxen = new Map();
        if (orte.length) {
            try { boxen = await engine.autor.boxenVon(CDE_MODELL_ID, orte.map(([, t]) => t.localId)); } catch { boxen = new Map(); }
        }
        for (const gid of cdeGids) {
            const t = karte.get(gid) ?? null;
            const k = engine._cdeKanten?.get(gid) ?? null;
            const sK = engine._cdeKnoten?.get(gid) ?? null;
            const huelle = t ? (boxen.get(t.localId) ?? null) : null;
            if (!huelle && !k && !sK) continue;
            objekte.push({
                globalId: gid, name: engine._cdeNameVon?.(gid) ?? k?.name ?? sK?.name ?? '',
                kategorie: k?.kategorie ?? (sK ? 'IFCDISTRIBUTIONCHAMBERELEMENT' : 'IFCEARTHWORKSCUT'),
                herkunft: 'cde', huelle,
                achse: k ? { punkte: k.punkte ?? [k.anfang, k.ende], dn: k.dn, achsbezug: k.achsbezug ?? 'mitte', sohlabstand: k.sohlabstand ?? null } : null,
                knoten: sK ? sK.punkt : null,
                ort: t ? { modelId: CDE_MODELL_ID, localId: t.localId } : null,
            });
        }
    }
    return { objekte, gruppen };
}

/**
 * Was sich gegenüber dem vorigen Journalstand bewegt hat: GlobalIds mit
 * geänderter Lage, neu verdeckt oder wieder sichtbar, und ALLE eigenen
 * Bauteile (nach einem Neuaufbau tragen sie neue localIds — die Hüllen
 * werden ohnehin frisch geholt, und es sind wenige). Ändert sich die
 * Geländemenge, gilt jede Auflage neu → `true` = ganz neu.
 */
export function _beziehungenDirtyAus(engine, { lagen, verdeckt, kanten = [], knoten = [], koerper = [], gelaende = [] }) {
    if (!engine._beziehungen) return true;
    const altGelaende = engine._cdeGelaende ?? new Set();
    if (altGelaende.size !== gelaende.length || gelaende.some(g => !altGelaende.has(g))) return true;
    const dirty = new Set();
    const altLagen = engine._lagen ?? new Map();
    const gleich = (a, b) => !!a && !!b && a.x === b.x && a.y === b.y && a.z === b.z;
    for (const [gid, d] of lagen) if (!gleich(altLagen.get(gid), d)) dirty.add(gid);
    for (const gid of altLagen.keys()) if (!lagen.has(gid)) dirty.add(gid);
    const altVerdeckt = engine._verdeckt ?? new Set();
    for (const gid of verdeckt) if (!altVerdeckt.has(gid)) dirty.add(gid);
    for (const gid of altVerdeckt) if (!verdeckt.has(gid)) dirty.add(gid);
    for (const k of kanten) dirty.add(k.globalId);
    for (const k of knoten) dirty.add(k.globalId);
    for (const gid of koerper) dirty.add(gid);
    for (const gid of engine._cdeKanten?.keys() ?? []) dirty.add(gid);
    for (const gid of engine._cdeKnoten?.keys() ?? []) dirty.add(gid);
    for (const gid of engine._cdeKoerper ?? []) dirty.add(gid);
    return dirty;
}

/**
 * KOLLISIONEN (G7): eigene Körper (Aushub, Graben, Rohr, Schacht) gegen
 * das gelieferte Modell — paarweiser Schnitt auf dem Server, Kandidaten
 * aus dem Beziehungsindex (Teil XVII: `schnitt`/`enthalten` in Hüllen-Güte). Das Ergebnis ist ABGELEITET und liegt
 * nur im Speicher; `setzeJournalStand` verwirft es. Gelände zählt nicht
 * als Partner (ein Graben schneidet sein Gelände absichtlich).
 * @returns {Promise<{ok: boolean, grund?: string, paare: Array, geprueft: number}>}
 */
export async function kollisionenPruefen(engine, { maxPaare = 200 } = {}) {
    const kernel = engine.autor?._kernel;
    await kernel?.bereit?.();
    const frei = kernel?.kann?.('kollisionen') ?? { ok: false, grund: 'kein Kernel' };
    if (!frei.ok) return { ok: false, grund: frei.grund, paare: [], geprueft: 0 };
    const verdeckt = engine._verdeckt ?? new Set();
    const eigene = new Set([...(engine._cdeKoerper ?? [])].filter(g => !verdeckt.has(g)));
    if (!eigene.size) return { ok: true, grund: 'keine eigenen Körper', paare: [], geprueft: 0 };

    // DIE KANDIDATEN KOMMEN AUS DEM BEZIEHUNGSINDEX (Teil XVII): `schnitt`
    // und `enthalten` in Hüllen-Güte, hier auf eigen ∩ geliefert gefiltert.
    // Vorher stand hier eine eigene Hüllenschleife über alle Kategorien —
    // die vierte Kandidatensuche des Features. Gelände ist im Index kein
    // Partner (ein Graben schneidet sein Gelände absichtlich); der Cut
    // bleibt draussen, er ist ein VOID, kein Bauteil.
    const idx = await engine.beziehungen();
    const kandidaten = [];        // {eigen: gid, modelId, localId, kategorie}
    const gesehen = new Set();
    for (const r of [...(idx?.paare('schnitt') ?? []), ...(idx?.paare('enthalten') ?? [])]) {
        const x = idx.objekt(r.a), y = idx.objekt(r.b);
        if (!x || !y) continue;
        const eigen = eigene.has(x.globalId) ? x : (eigene.has(y.globalId) ? y : null);
        const partner = eigen === x ? y : x;
        if (!eigen || partner.herkunft !== 'geliefert' || !partner.ort) continue;   // eigen∩eigen zählt nicht
        if (partner.kategorie === 'IFCEARTHWORKSCUT') continue;
        const schluessel = `${eigen.globalId}|${partner.ort.modelId}|${partner.ort.localId}`;
        if (gesehen.has(schluessel)) continue;
        gesehen.add(schluessel);
        kandidaten.push({ eigen: eigen.globalId, modelId: partner.ort.modelId, localId: partner.ort.localId, kategorie: partner.kategorie });
    }
    if (!kandidaten.length) { engine._kollisionen = []; return { ok: true, paare: [], geprueft: 0 }; }
    if (kandidaten.length > maxPaare) {
        return { ok: false, grund: `${kandidaten.length} Kandidatenpaare — über ${maxPaare}; Auswahl einschränken`, paare: [], geprueft: 0 };
    }

    // Netze holen — je Bauteil einmal — und in EINEM Aufruf schneiden.
    const resolver = engine.makeGeometryResolver();
    const netze = new Map();      // schlüssel → {index, gid?, modelId, localId, name}
    const koerper = [];
    const holeNetz = async (schluessel, ort, meta) => {
        if (netze.has(schluessel)) return netze.get(schluessel).index;
        const res = await resolver?.forElements([ort])?.getForm('mesh');
        const d = res?.data;
        if (!d?.positions?.length) return -1;
        const positions = d.positions instanceof Float64Array ? d.positions : Float64Array.from(d.positions);
        koerper.push({ positions, triCount: d.triCount, closed: true, volumen: 0, warnungen: [] });
        const eintrag = { index: koerper.length - 1, ...meta };
        netze.set(schluessel, eintrag);
        return eintrag.index;
    };
    const paareIdx = [];
    for (const k of kandidaten) {
        const t = idx.objekt(k.eigen)?.ort ?? null;
        if (!t) continue;
        const ia = await holeNetz(`cde|${k.eigen}`, { modelId: CDE_MODELL_ID, localId: t.localId }, { gid: k.eigen });
        const zeile = engine.quelleVon(k.modelId)?.zeile(k.localId) ?? null;
        const ib = await holeNetz(`${k.modelId}|${k.localId}`, { modelId: k.modelId, localId: k.localId },
            { gid: zeile?.GlobalId?.value ?? null, name: zeile?.Name?.value ?? '', kategorie: k.kategorie, modelId: k.modelId, localId: k.localId });
        if (ia >= 0 && ib >= 0) paareIdx.push([ia, ib]);
    }
    const r = await kernel.op('kollisionen', { koerper });
    if (!r.ergebnis) return { ok: false, grund: r.warnungen.join('; ') || 'Server ohne Antwort', paare: [], geprueft: paareIdx.length };
    const byIndex = new Map([...netze.values()].map(e => [e.index, e]));
    const gewollt = new Set(paareIdx.map(([a, b]) => `${Math.min(a, b)}|${Math.max(a, b)}`));
    const paare = [];
    for (const pr of r.ergebnis) {
        if (!gewollt.has(`${Math.min(pr.a, pr.b)}|${Math.max(pr.a, pr.b)}`)) continue;   // eigen∩eigen zählt nicht
        const ea = byIndex.get(pr.a), eb = byIndex.get(pr.b);
        const eigen = ea?.modelId ? eb : ea;
        const partner = ea?.modelId ? ea : eb;
        paare.push({ eigen: eigen?.gid ?? null, partner: partner?.gid ?? null, partnerName: partner?.name ?? '',
                     partnerKategorie: partner?.kategorie ?? '', modelId: partner?.modelId, localId: partner?.localId,
                     volumen: pr.volumen });
    }
    engine._kollisionen = paare;
    return { ok: true, paare, geprueft: paareIdx.length, warnungen: r.warnungen };
}
