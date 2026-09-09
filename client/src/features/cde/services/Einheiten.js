/**
 * Modelleinheiten → Meter (2026-09-03).
 *
 * DER BEFUND, der diese Datei nötig macht — gemessen, nicht vermutet:
 *
 *   `BIM26_Gruppe5_BODEN_Erdarbeiten3.ifc` deklariert
 *   `IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)`. web-ifc gibt die Geometrie in
 *   MODELLEINHEITEN zurück — die Hülle des Geländes misst 449.750 × 100.567
 *   Einheiten. `@thatopen/fragments` rechnet zwar einen `_lengthUnitsFactor`
 *   aus, wendet ihn aber ausschliesslich auf `Elevation` und `RefElevation`
 *   an, nie auf Geometrie. Die CDE sah also ein 450 KILOMETER breites Gelände.
 *
 * Folge: jede Länge um 10³ daneben, jede Fläche um 10⁶, jedes Volumen um 10⁹.
 * Deshalb sperrte die mm-Wache (Lücke ①) die Bearbeitung komplett. Das war
 * richtig, aber es war eine Sackgasse — hier ist der Ausweg.
 *
 * WARUM AN DER QUELLE UND NICHT AM VERBRAUCHER:
 * Modellkoordinaten kommen an rund fünfzehn Stellen in die CDE (Dreiecke,
 * Hüllen, Platzierungen, Achsen, Zeigerpunkte). Einen Faktor durch alle zu
 * fädeln hiesse, fünfzehn Gelegenheiten zu schaffen, ihn zu vergessen — und
 * das Journal führte danach Anker in Millimeter-Welt, ohne dass es jemand
 * sähe. Umgerechnet wird deshalb EINMAL, bevor die Bytes in den Loader gehen;
 * alles dahinter ist dann von selbst richtig und weiss von Einheiten nichts.
 *
 * WARUM DAS OHNE RATEREI GEHT — der Fund, auf dem alles ruht:
 * web-ifc gibt Werte TYPISIERT zurück. Eine Koordinate ist nicht einfach eine
 * Zahl, sondern `{type: 4, value: 0, name: 'IFCLENGTHMEASURE'}`. Das Schema
 * sagt also selbst, welche Zahl eine Länge ist — Richtungen, Verhältnisse und
 * Winkel tragen andere Namen und bleiben unangetastet. Es braucht keine Liste
 * von Entitätstypen und keine Heuristik.
 *
 * DIE ORIGINALDATEI WIRD NICHT ANGEFASST. Umgerechnet wird eine Kopie im
 * Speicher; Prüfsumme, Ablage und Dokumentregister führen weiter die Bytes des
 * Planers. Ein CDE verändert keine Lieferung — es liest sie richtig.
 */

/**
 * Welche Messwert-Typen sind LÄNGEN?
 *
 * IFC kennt mehrere Ausprägungen (`IfcLengthMeasure`,
 * `IfcPositiveLengthMeasure`, `IfcNonNegativeLengthMeasure`) — alle enden auf
 * `LENGTHMEASURE`. Bewusst über das Suffix und nicht über eine Aufzählung:
 * eine neue Schema-Fassung darf eine weitere hinzufügen, ohne dass hier
 * jemand nachziehen muss.
 *
 * NICHT dabei und mit Absicht: `IfcNormalisedRatioMeasure` (dimensionslos, in
 * den Testdateien 4 bzw. 111 Vorkommen — meist Farbanteile), `IfcPlaneAngleMeasure`,
 * `IfcAreaMeasure`/`IfcVolumeMeasure` (kommen in Geometrie nicht vor; stünden
 * sie in Mengen, brauchten sie faktor² bzw. faktor³ — siehe `FLAECHENMASSE`).
 */
export const LAENGENMASS = /LENGTHMEASURE$/;
/** Flächen skalieren mit faktor², Volumen mit faktor³ — je Potenz eine Liste. */
export const FLAECHENMASS = /AREAMEASURE$/;
export const VOLUMENMASS = /VOLUMEMEASURE$/;

/** Der Name des Wertes, wie web-ifc ihn führt — oder null. */
function _massName(v) {
    return (v && typeof v === 'object' && typeof v.name === 'string') ? v.name : null;
}

/**
 * Alle Messwerte einer Zeile besuchen.
 *
 * Rekursiv, weil Werte in Listen und in Listen von Listen stehen
 * (`IfcCartesianPoint.Coordinates`, `IfcPolyline.Points`). Die Tiefe ist
 * begrenzt: eine Zeile referenziert andere Zeilen über `{value, type: 5}` und
 * nicht über Verschachtelung — wer tiefer gräbt, findet nur noch Zyklen.
 *
 * @param {*} wert
 * @param {(v: object) => void} besuch  bekommt den Messwert selbst
 */
export function besucheMasse(wert, besuch, tiefe = 0) {
    if (!wert || tiefe > 6) return;
    if (Array.isArray(wert)) {
        for (const x of wert) besucheMasse(x, besuch, tiefe + 1);
        return;
    }
    if (typeof wert !== 'object') return;
    if (_massName(wert)) { besuch(wert); return; }
    for (const k of Object.keys(wert)) {
        // `expressID` und `type` sind Kennungen, keine Werte. `value` allein
        // (ohne `name`) ist eine REFERENZ auf eine andere Zeile — ihr zu
        // folgen liefe im Kreis.
        if (k === 'expressID' || k === 'type') continue;
        besucheMasse(wert[k], besuch, tiefe + 1);
    }
}

/**
 * Wie viele Messwerte welcher Art stehen in dieser Zeile?
 * Rein — für Bericht und Test, ohne etwas zu ändern.
 */
export function masseZaehlen(zeile) {
    const out = new Map();
    besucheMasse(zeile, (v) => out.set(v.name, (out.get(v.name) ?? 0) + 1));
    return out;
}

/**
 * Den Längenfaktor auf eine Zeile anwenden. Gibt `true`, wenn sich etwas
 * geändert hat — nur dann muss zurückgeschrieben werden.
 */
export function skaliereZeile(zeile, faktor) {
    let beruehrt = false;
    besucheMasse(zeile, (v) => {
        const p = LAENGENMASS.test(v.name) ? 1
            : FLAECHENMASS.test(v.name) ? 2
            : VOLUMENMASS.test(v.name) ? 3 : 0;
        if (!p) return;
        const alt = Number(v.value);
        if (!Number.isFinite(alt)) return;
        v.value = alt * Math.pow(faktor, p);
        beruehrt = true;
    });
    return beruehrt;
}

/**
 * Nach dem Skalieren muss die EINHEIT mitgehen.
 *
 * Sonst steht in der Datei weiter „Millimeter", während die Zahlen Meter sind
 * — und jeder, der die Einheit ehrlich liest (die mm-Wache selbst, der
 * `Elevation`-Faktor von fragments), rechnet ein zweites Mal. Ein halb
 * umgerechnetes Modell ist schlimmer als ein gar nicht umgerechnetes, weil es
 * richtig aussieht.
 *
 * @returns {number} wie viele Einheiten-Zeilen angepasst wurden
 */
export function einheitAufMeterSetzen(api, modelID, WebIFC) {
    const typ = WebIFC?.IFCSIUNIT ?? WebIFC?.default?.IFCSIUNIT;
    if (!Number.isFinite(typ)) return 0;
    let n = 0;
    let ids;
    try { ids = api.GetLineIDsWithType(modelID, typ); } catch { return 0; }
    for (let i = 0; i < ids.size(); i++) {
        let l;
        try { l = api.GetLine(modelID, ids.get(i)); } catch { continue; }
        if (l?.UnitType?.value !== 'LENGTHUNIT') continue;
        if (!l.Prefix) continue;                     // schon prefixlos
        l.Prefix = null;
        try { api.WriteLine(modelID, l); n++; } catch { /* eine Einheit weniger */ }
    }
    return n;
}

/**
 * Ein geöffnetes Modell auf Meter umrechnen — in der wasm-Instanz.
 *
 * @returns {{zeilen: number, einheiten: number, masse: number}}
 */
export function skaliereModell(api, modelID, faktor, WebIFC) {
    let zeilen = 0, masse = 0;
    const alle = api.GetAllLines(modelID);
    for (let i = 0; i < alle.size(); i++) {
        const id = alle.get(i);
        let l;
        try { l = api.GetLine(modelID, id); } catch { continue; }
        const vorher = masseZaehlen(l);
        if (!skaliereZeile(l, faktor)) continue;
        try { api.WriteLine(modelID, l); } catch { continue; }
        zeilen++;
        for (const [name, k] of vorher) if (LAENGENMASS.test(name)) masse += k;
    }
    const einheiten = einheitAufMeterSetzen(api, modelID, WebIFC);
    return { zeilen, einheiten, masse };
}

/**
 * Die grösste Ausdehnung der Modellgeometrie — das Mass, an dem die
 * Umrechnung NACHGEPRÜFT wird.
 *
 * Ohne Gegenprobe wäre „umgerechnet" eine Behauptung. Mit ihr ist es eine
 * Messung: die Hülle muss danach exakt um den Faktor kleiner sein. Ein
 * Konverter, der die Hälfte der Werte erwischt, fiele hier auf.
 */
export function huellenSpanne(api, modelID) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    try {
        api.StreamAllMeshes(modelID, (mesh) => {
            for (let g = 0; g < mesh.geometries.size(); g++) {
                const teil = mesh.geometries.get(g);
                const geo = api.GetGeometry(modelID, teil.geometryExpressID);
                const v = api.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize());
                // 6 Werte je Scheitel: Ort und Normale.
                for (let i = 0; i < v.length; i += 6) {
                    for (let k = 0; k < 3; k++) {
                        if (v[i + k] < min[k]) min[k] = v[i + k];
                        if (v[i + k] > max[k]) max[k] = v[i + k];
                    }
                }
            }
        });
    } catch { return null; }
    if (!Number.isFinite(min[0])) return null;
    return max.map((x, k) => x - min[k]);
}

/**
 * Wie genau die Gegenprobe stimmen muss — RELATIV, nicht absolut.
 *
 * web-ifc gibt Scheitel als Float32 zurück: bei einer Spanne von 585.041
 * Einheiten liegt die Auflösung schon bei ~0,06, und eine absolute Schranke
 * wäre damit eine Aussage über die Fliesskommabreite statt über die
 * Umrechnung. Relativ sind es rund 1,2e-7 — 1e-4 lässt also drei
 * Grössenordnungen Luft und fängt trotzdem jeden echten Fehler: eine nur zur
 * Hälfte umgerechnete Datei liegt um Faktoren daneben, nicht um Promille.
 */
export const GEGENPROBE_TOLERANZ = 1e-4;

/**
 * IFC-Bytes in Meter umrechnen — mit Gegenprobe.
 *
 * Gibt `{bytes, bericht}` zurück, oder `{bytes: null, grund}`. **Nie ein halbes
 * Ding**: schlägt die Gegenprobe fehl, kommen die Originalbytes zurück und der
 * Aufrufer erfährt, warum. Ein teilweise umgerechnetes Modell sähe richtig aus
 * und wäre unbrauchbar.
 *
 * @param {object} WebIFC  das web-ifc-MODUL (hereingereicht, nie importiert)
 * @param {Uint8Array} bytes
 * @param {object} opts
 * @param {number} opts.faktor       Modelleinheit → Meter (MILLI = 0,001)
 * @param {string} [opts.wasmPfad]
 * @param {boolean} [opts.absolut]
 * @param {object} [opts.api]  eine bereits initialisierte `IfcAPI`.
 *   MITGEBEN, wo es eine gibt: `Init()` instanziiert das wasm-Modul und kostet
 *   spürbar Zeit — dieselbe Rechnung, aus der `IfcQuelle` seine gemeinsame
 *   Instanz hat (dort fiel die Testlaufzeit von 51 s auf 4,3 s). Eine `IfcAPI`
 *   hält mehrere Modelle gleichzeitig; `CloseModel` schliesst nur das eigene.
 */
export async function inMeterUmrechnen(WebIFC, bytes, { faktor, wasmPfad = '/', absolut = true, api: fremdeApi = null } = {}) {
    if (!WebIFC || !bytes?.length) return { bytes: null, grund: 'keine Bytes' };
    if (!Number.isFinite(faktor) || faktor <= 0) return { bytes: null, grund: `unbrauchbarer Faktor ${faktor}` };
    if (Math.abs(faktor - 1) < 1e-12) return { bytes, bericht: { faktor: 1, zeilen: 0, unveraendert: true } };

    const API = WebIFC.IfcAPI ?? WebIFC.default?.IfcAPI;
    if (!API && !fremdeApi) return { bytes: null, grund: 'web-ifc ohne IfcAPI' };

    const api = fremdeApi ?? new API();
    let modelID = null;
    try {
        if (!fremdeApi) {
            api.SetWasmPath(wasmPfad, absolut);
            await api.Init();
        }
        modelID = api.OpenModel(new Uint8Array(bytes));
        // Nur ein wirklich lesbares Modell wird angefasst.
        const vorher = huellenSpanne(api, modelID);
        if (!vorher) return { bytes: null, grund: 'keine Geometrie lesbar' };

        const bericht = { faktor, ...skaliereModell(api, modelID, faktor, WebIFC), vorher };
        const neu = api.SaveModel(modelID);
        api.CloseModel(modelID);
        modelID = null;

        // ── GEGENPROBE am neu geöffneten Modell ────────────────────────────
        const geprueft = api.OpenModel(new Uint8Array(neu));
        const nachher = huellenSpanne(api, geprueft);
        api.CloseModel(geprueft);
        if (!nachher) return { bytes: null, grund: 'nach der Umrechnung keine Geometrie lesbar' };

        for (let k = 0; k < 3; k++) {
            const erwartet = vorher[k] * faktor;
            // Eine Achse ohne Ausdehnung (flaches Modell) sagt nichts aus.
            if (Math.abs(erwartet) < 1e-9) continue;
            const abweichung = Math.abs(nachher[k] - erwartet) / Math.abs(erwartet);
            if (abweichung > GEGENPROBE_TOLERANZ) {
                return { bytes: null, grund: `Gegenprobe: Achse ${'XYZ'[k]} sollte ${erwartet.toFixed(4)} messen, misst ${nachher[k].toFixed(4)}` };
            }
        }
        bericht.nachher = nachher;
        return { bytes: neu, bericht };
    } catch (fehler) {
        return { bytes: null, grund: fehler?.message ?? String(fehler) };
    } finally {
        try { if (modelID !== null) api.CloseModel(modelID); } catch { /* egal */ }
        // KEIN `Dispose()`: die Instanz ist hier eine eigene, aber ein Wurf
        // beim Aufräumen darf das Ergebnis nicht kippen.
    }
}
