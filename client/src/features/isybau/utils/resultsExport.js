/**
 * Anreicherung des Ergebnis-JSON-Exports.
 *
 * Hintergrund: Der reine SWMM-Ergebnisdump enthält nur die SWMM-Sicht. Eine
 * auswertende Instanz (Mensch oder KI-Agent) sieht dort z.B. zwei
 * Teileinzugsgebiete `FK001.1` und `FK001.1_2` mit identischer Fläche und
 * hält das für eine Doppelzählung — tatsächlich sind es die beiden HÄLFTEN
 * einer an eine Haltung angeschlossenen Fläche (SwmmBuilder.js teilt sie auf
 * beide Endknoten auf), deren Summe exakt der Quellfläche entspricht. Durch
 * die 3-stellige Rundung im INP ist das ohne die Quelldaten nicht erkennbar.
 *
 * Dieses Modul stellt die Herkunft explizit dar, statt sie implizit zu lassen.
 * Die Aufteilung wird dabei bewusst aus dem TATSÄCHLICH erzeugten INP gelesen
 * und nicht nachgerechnet — so kann die Darstellung nicht von der wirklichen
 * Rechengrundlage abweichen, wenn sich die Aufteilungsregel einmal ändert.
 */

const toArray = (collection) => {
    if (!collection) return [];
    if (collection instanceof Map) return Array.from(collection.values());
    if (Array.isArray(collection)) return collection;
    return Object.values(collection);
};

const num = (v) => {
    const f = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(f) ? f : null;
};

/**
 * Liest die [SUBCATCHMENTS]-Sektion eines SWMM-INP.
 * @returns {Array<{name:string, rainGage:string, outlet:string, areaHa:number|null,
 *                  imperv:number|null, width:number|null, slope:number|null}>}
 */
export function parseInpSubcatchments(inpText) {
    if (typeof inpText !== 'string' || !inpText) return [];
    const lines = inpText.split(/\r?\n/);
    const out = [];
    let inSection = false;

    for (const raw of lines) {
        const line = raw.trim();
        if (line.startsWith('[')) {
            inSection = line.toUpperCase().startsWith('[SUBCATCHMENTS');
            continue;
        }
        if (!inSection || !line || line.startsWith(';')) continue;

        const p = line.split(/\s+/);
        if (p.length < 3) continue;
        out.push({
            name: p[0],
            rainGage: p[1],
            outlet: p[2],
            areaHa: num(p[3]),
            imperv: num(p[4]),
            width: num(p[5]),
            slope: num(p[6]),
        });
    }
    return out;
}

/**
 * Ordnet jedem SWMM-Teilgebiet seine Quellfläche zu und weist nach, dass die
 * Summe der Teilflächen der Quellfläche entspricht (keine Doppelzählung).
 *
 * Zuordnung über den Namen: SwmmBuilder hängt bei geteilten Flächen `_2` an
 * den zweiten Teil an; Namenskollisionen entschärft es mit `_1`, `_2`, …
 * Deshalb wird zuerst exakt und erst danach über den Namensstamm gematcht.
 */
export function buildSubcatchmentProvenance(inpText, areas) {
    const subs = parseInpSubcatchments(inpText);
    const areaList = toArray(areas);
    if (!areaList.length) return [];

    const byId = new Map();
    for (const a of areaList) if (a?.id != null) byId.set(String(a.id), a);

    // Jedes Teilgebiet seiner Quellfläche zuordnen (längster passender Stamm gewinnt,
    // damit "FK001.1_2" nicht versehentlich auf eine Fläche "FK001" fällt).
    const grouped = new Map();
    const unmatched = [];
    for (const s of subs) {
        let sourceId = byId.has(s.name) ? s.name : null;
        if (!sourceId) {
            const stem = s.name.replace(/_\d+$/, '');
            if (byId.has(stem)) sourceId = stem;
        }
        if (!sourceId) { unmatched.push(s.name); continue; }
        if (!grouped.has(sourceId)) grouped.set(sourceId, []);
        grouped.get(sourceId).push(s);
    }

    const rows = [];
    for (const [sourceId, parts] of grouped) {
        const src = byId.get(sourceId);
        const quellflaecheHa = num(src.size);
        const summeHa = parts.reduce((acc, p) => acc + (p.areaHa || 0), 0);
        // Toleranz: das INP rundet auf 3 Nachkommastellen, je Teil bis 0,0005 ha.
        const toleranz = Math.max(0.001, parts.length * 0.0005);
        rows.push({
            quellflaeche: sourceId,
            quellflaecheHa,
            aufgeteilt: parts.length > 1,
            grund: parts.length > 1
                ? 'An eine Haltung angeschlossen — Fläche wird auf beide Endknoten der Haltung aufgeteilt (SwmmBuilder.js).'
                : 'Direkt an einen Knoten angeschlossen.',
            teilgebiete: parts.map(p => ({ name: p.name, outlet: p.outlet, flaecheHa: p.areaHa })),
            summeTeilflaechenHa: Number(summeHa.toFixed(4)),
            summeStimmtMitQuellflaeche:
                quellflaecheHa == null ? null : Math.abs(summeHa - quellflaecheHa) <= toleranz,
        });
    }

    rows.sort((a, b) => String(a.quellflaeche).localeCompare(String(b.quellflaeche)));
    if (unmatched.length) {
        rows.push({ _nichtZugeordneteTeilgebiete: unmatched.sort() });
    }
    return rows;
}

/**
 * Baut das angereicherte Export-Objekt.
 *
 * @param {object} p
 * @param {object} p.results   store.simulation.results (unverändert eingebettet)
 * @param {Map|Array} p.areas
 * @param {Map|Array} p.nodes
 * @param {Map|Array} p.edges
 * @param {object} [p.metadata]
 * @param {object} [p.rain]
 * @param {string} [p.erzeugtAm] ISO-Zeitstempel (injizierbar für Tests)
 * @param {(node:object)=>(string|null)} [p.bauwerkLabel] löst den Bauwerkstyp-Namen auf
 */
export function buildResultsExport({
    results, areas, nodes, edges, metadata = {}, rain = null,
    erzeugtAm = new Date().toISOString(), bauwerkLabel = () => null,
} = {}) {
    const areaList = toArray(areas);
    const nodeList = toArray(nodes);
    const edgeList = toArray(edges);

    const herkunft = buildSubkatchmentProvenanceSafe(results?.input, areaList);

    return {
        _hinweise: {
            zweck: 'Angereicherter Ergebnisexport: SWMM-Ergebnisse plus die Eingangsdaten, aus denen sie entstanden sind.',
            teilgebiete:
                'Teilgebietsnamen mit Suffix "_2" sind KEINE Duplikate, sondern die zweite Hälfte einer '
                + 'an eine Haltung angeschlossenen Fläche. Die Fläche wird auf beide Endknoten der Haltung '
                + 'aufgeteilt; die Summe beider Teile ergibt die Quellfläche. Nachweis je Fläche unter '
                + '"eingangsdaten.teilgebietsherkunft" (Feld "summeStimmtMitQuellflaeche").',
            rundung: 'Flächen im SWMM-Input sind auf 3 Nachkommastellen gerundet; Quellflächen stehen ungerundet daneben.',
            einheiten: { flaeche: 'ha', laenge: 'm', hoehe: 'm ü. NHN', abfluss: 'siehe results.systemStats.analysisOptions.flowUnits' },
        },
        _erzeugt: {
            werkzeug: 'SaintV-1D — quagg-engineering.org',
            zeitpunkt: erzeugtAm,
            schemaVersion: 1,
        },
        projekt: {
            dateiname: metadata.fileName ?? null,
            version: metadata.version ?? null,
            erstellt: metadata.created ?? null,
            epsg: metadata.epsg ?? metadata.crs ?? null,
        },
        umfang: {
            schaechteUndBauwerke: nodeList.length,
            haltungen: edgeList.length,
            flaechen: areaList.length,
            flaechensummeHa: Number(
                areaList.reduce((acc, a) => acc + (num(a.size) || 0), 0).toFixed(4)),
        },
        eingangsdaten: {
            flaechen: areaList.map(a => ({
                id: a.id ?? null,
                groesseHa: num(a.size),
                abflussbeiwert: num(a.runoffCoeff),
                neigungsklasse: a.slope ?? null,
                anschlussKnoten: a.nodeId ?? null,
                anschlussKnoten2: a.nodeId2 ?? null,
                aufteilungProzent: a.nodeId2 ? (num(a.splitRatio) ?? 50) : null,
                anschlussHaltung: a.edgeId ?? null,
                schmutzfracht: a.schmutzfracht ?? null,
            })),
            knoten: nodeList.map(n => ({
                id: n.id ?? null,
                typ: n.type ?? null,
                bauwerkstyp: n.bauwerkstyp ?? null,
                bauwerkstypBezeichnung: bauwerkLabel(n),
                sohlhoehe: num(n.z),
                deckelhoehe: num(n.coverZ),
                entwaesserungsart: n.entwaesserungsart ?? null,
            })),
            regen: rain ? {
                typ: rain.activeModelRain?.type ?? null,
                stuetzstellen: rain.activeModelRain?.series?.length ?? null,
                intensitaetLsHa: num(rain.intensity),
                dauerH: num(rain.duration),
            } : null,
            teilgebietsherkunft: herkunft,
        },
        ergebnisse: results ?? null,
    };
}

// Nie den ganzen Export an einer Herkunfts-Analyse scheitern lassen.
function buildSubkatchmentProvenanceSafe(inpText, areaList) {
    try {
        return buildSubcatchmentProvenance(inpText, areaList);
    } catch (e) {
        return { _fehler: `Herkunft konnte nicht ermittelt werden: ${e?.message || e}` };
    }
}
