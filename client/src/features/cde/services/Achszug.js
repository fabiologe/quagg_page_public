/**
 * Achszug — ein Bauteil am Auswahlpunkt festhalten und entlang GENAU EINER
 * Achse schieben (Teil XVI, S5). Rein: kein three, kein Vue.
 *
 * Das Muster ist flood-3D (`components/pre/editor/achsen.js`, kopiert, nie
 * importiert): keine Pfeile, keine Achsknöpfe. Drei Führungslinien laufen
 * durch den Griff, und die ACHSE FOLGT DER ZUGRICHTUNG — mit Hysterese
 * (14° fangen, erst bei 26° loslassen) und einer Totzone von 8 px, damit ein
 * Wackeln des Fingers weder springt noch flackert. Strg erzwingt die Höhe.
 * Frei im Raum gibt es nicht (Teil II: „geführt … nie frei im Raum").
 *
 * Achsen in Three-Welt: Ost = +x, Nord = −z (web-ifc/fragments legen IFC-Y
 * auf −z), Höhe = +y. Die Farben folgen flood-3D: Ost rot, Nord grün, Höhe
 * blau — je ein Token, kein Hex im Code.
 *
 * Zwei Lücken des Vorbilds schliesst die CDE anderswo: flood-3D kennt kein
 * Esc im Zug und keinen Finger; hier fängt der Zeiger-Stapel Abbruch und
 * Long-Press (`IfcSelectionHandler`), der Griff selbst ist werkzeug-gebunden
 * (`verschieben`) und läuft über denselben Weg wie jedes Formular.
 */

export const SNAP_FANGEN_GRAD = 14;
export const SNAP_LOESEN_GRAD = 26;
export const TOTZONE_PX = 8;
/** Unter so vielen Pixeln je Meter ist eine Achse auf dem Schirm degeneriert (steil drauf geschaut). */
export const MIN_PX_JE_M = 2;

export const ACHSEN = Object.freeze({
    ost:   { richtung: { x: 1, y: 0, z: 0 },  feld: 'ost',   titel: 'Ost',  farbe: 'danger' },
    nord:  { richtung: { x: 0, y: 0, z: -1 }, feld: 'nord',  titel: 'Nord', farbe: 'ok' },
    hoehe: { richtung: { x: 0, y: 1, z: 0 },  feld: 'hoehe', titel: 'Höhe', farbe: 'accent' },
});
export const ACHS_NAMEN = Object.freeze(Object.keys(ACHSEN));

/**
 * Welche Achsen ein Bauteil dieser Bauform als GANZES ziehen darf.
 *
 * Gelände wird geformt, nicht geschoben (hoehenfeld: keine). Alles andere
 * darf in der Ebene und in der Höhe — ein geliefertes Rohr auch: die
 * Verschiebung ist eine `lage`, und dass sich die Anschlüsse lösen, sagt die
 * Prüfliste (beraten, nicht verbieten). Die Enden einzeln ziehen die
 * Sohlgriffe; das ist ein anderes Werkzeug.
 */
export function achsenErlaubt(bauform) {
    if (!bauform || bauform === 'hoehenfeld') return [];
    return [...ACHS_NAMEN];
}

/**
 * Die drei Achsen als Bildschirm-Vektoren (Pixel je Meter) um den Griffpunkt.
 * @param {{punkt:{x,y,z}, projiziere:(p:{x,y,z}) => {x,y}|null}} q
 * @returns {Object<string, [number, number]|null>}
 */
export function achsenAufSchirm({ punkt, projiziere }) {
    const p0 = projiziere?.(punkt) ?? null;
    const aus = {};
    for (const name of ACHS_NAMEN) {
        const r = ACHSEN[name].richtung;
        const p1 = p0 ? projiziere({ x: punkt.x + r.x, y: punkt.y + r.y, z: punkt.z + r.z }) : null;
        aus[name] = (p0 && p1 && Number.isFinite(p1.x) && Number.isFinite(p1.y)) ? [p1.x - p0.x, p1.y - p0.y] : null;
    }
    return aus;
}

/**
 * Wie gut passt der Bildschirm-Zug (sdx, sdy) zu einer Achse?
 * @returns {{dev:number, t:number}} dev = Winkelabweichung in Grad (999 = unbrauchbar), t = Meter entlang der Achse
 */
export function achsPassung(sdx, sdy, vektor) {
    if (!vektor) return { dev: 999, t: 0 };
    const [ex, ey] = vektor;
    const el = Math.hypot(ex, ey);
    if (el < MIN_PX_JE_M) return { dev: 999, t: 0 };
    const dl = Math.hypot(sdx, sdy);
    if (dl < 1e-9) return { dev: 999, t: 0 };
    const skalar = sdx * ex + sdy * ey;
    const cos = Math.min(1, Math.abs(skalar) / (dl * el));
    return { dev: (Math.acos(cos) * 180) / Math.PI, t: skalar / (el * el) };
}

/**
 * Die Achse aus der Zugrichtung wählen — mit Totzone und Hysterese.
 *
 * `zustand` ist der Merker des laufenden Zugs (`{achse}`); zurück kommt ein
 * NEUER Merker. `erzwinge` (Strg = 'hoehe') schlägt die Richtung.
 *
 * @returns {{zustand:{achse:string|null}, achse:string|null, t:number, halten:boolean, steil:boolean}}
 */
export function waehleAchse(zustand, { sdx, sdy, schirm, erlaubt = ACHS_NAMEN, erzwinge = null }) {
    const merker = { achse: zustand?.achse ?? null };
    const kann = (a) => erlaubt.includes(a);
    if (erzwinge && kann(erzwinge)) {
        const pass = achsPassung(sdx, sdy, schirm?.[erzwinge]);
        return { zustand: { achse: erzwinge }, achse: erzwinge, t: pass.dev === 999 ? NaN : pass.t, halten: false, steil: pass.dev === 999 };
    }
    if (Math.hypot(sdx, sdy) < TOTZONE_PX) {
        return { zustand: merker, achse: merker.achse, t: 0, halten: true, steil: false };
    }
    const kandidaten = {};
    for (const a of ACHS_NAMEN) kandidaten[a] = kann(a) ? achsPassung(sdx, sdy, schirm?.[a]) : { dev: 999, t: 0 };
    if (merker.achse && kandidaten[merker.achse].dev > SNAP_LOESEN_GRAD) merker.achse = null;
    if (!merker.achse) {
        const beste = ACHS_NAMEN.filter(kann).reduce((a, b) => (kandidaten[a].dev <= kandidaten[b].dev ? a : b), erlaubt[0] ?? null);
        if (beste && kandidaten[beste].dev < SNAP_FANGEN_GRAD) merker.achse = beste;
    }
    const a = merker.achse;
    return { zustand: merker, achse: a, t: a ? kandidaten[a].t : 0, halten: false, steil: a ? kandidaten[a].dev === 999 : false };
}

/**
 * Das Welt-Delta für die gewählte Achse.
 *
 * Ost/Nord kommen aus dem Schnitt mit der waagerechten Ebene in Griffhöhe
 * (kein Parallaxensprung, läuft exakt unter dem Zeiger); nur die gewählte
 * Komponente zählt. Die Höhe kommt aus der Bildschirmpassung (Meter entlang
 * der projizierten Achse) — und wenn die Achse auf dem Schirm degeneriert
 * ist (von oben), aus Pixeln × Meter-je-Pixel, wie im Vorbild.
 *
 * @param {{achse:string, t:number, steil:boolean, hit:{x,y,z}|null, start:{x,y,z}, sdy:number, meterJePixel:number|null}} q
 * @returns {{x:number, y:number, z:number}}
 */
export function deltaFuer({ achse, t = 0, steil = false, hit = null, start, sdy = 0, meterJePixel = null }) {
    const d = { x: 0, y: 0, z: 0 };
    if (!achse) return d;
    if (achse === 'hoehe') {
        d.y = (!steil && Number.isFinite(t)) ? t : -sdy * (Number.isFinite(meterJePixel) ? meterJePixel : 0);
        return d;
    }
    if (hit && start && [hit.x, hit.z, start.x, start.z].every(Number.isFinite)) {
        if (achse === 'ost') d.x = hit.x - start.x; else d.z = hit.z - start.z;
        return d;
    }
    // Ohne Ebenenschnitt (Blick von unten, Ebene hinter dem Auge): die Passung.
    if (Number.isFinite(t)) { if (achse === 'ost') d.x = t; else d.z = -t; }
    return d;
}

/**
 * Trifft der Strahl die Ziehebene steil genug, dass ihr Schnitt etwas taugt?
 *
 * Nach dem Heranzoomen schaut die Kamera oft exakt WAAGERECHT auf Bauteilhöhe
 * (Headless-Lauf: Blick (−1, 0, 0)); die waagerechte Ebene liegt dann auf der
 * Kante, der Schnitt läuft ins Leere oder springt kilometerweit. Unter ~11°
 * (|cos| < 0,2) rechnet der Zug stattdessen aus der Bildschirmpassung.
 */
export function ebeneBrauchbar(strahl, normal = { x: 0, y: 1, z: 0 }, mindestCos = 0.2) {
    const d = strahl?.direction;
    if (!d || ![d.x, d.y, d.z].every(Number.isFinite)) return false;
    const l = Math.hypot(d.x, d.y, d.z) || 1;
    return Math.abs((d.x * normal.x + d.y * normal.y + d.z * normal.z) / l) >= mindestCos;
}

/**
 * Ein Zug in der EBENE (Ost/Nord) aus dem Bildschirm-Delta — für Griffe, die
 * frei in XZ laufen (Schacht), wenn die Ziehebene auf der Kante liegt.
 *
 * Löst sdx/sdy nach den beiden projizierten Achsen auf (2×2, kleinste
 * Quadrate). Sind die Achsen auf dem Schirm parallel oder eine degeneriert
 * (Blick genau entlang Ost oder Nord), bleibt nur die besser sichtbare Achse.
 * @returns {{x:number, z:number}} Welt-Delta (Nord = −z)
 */
export function deltaXZAusSchirm(sdx, sdy, schirm) {
    const o = schirm?.ost, n = schirm?.nord;
    const lo = o ? Math.hypot(o[0], o[1]) : 0, ln = n ? Math.hypot(n[0], n[1]) : 0;
    const okO = lo >= MIN_PX_JE_M, okN = ln >= MIN_PX_JE_M;
    if (okO && okN) {
        const det = o[0] * n[1] - o[1] * n[0];
        // Fast parallel: die Auflösung wäre eine Zahlenlotterie — nur eine Achse.
        if (Math.abs(det) > 0.05 * lo * ln) {
            const tO = (sdx * n[1] - sdy * n[0]) / det;
            const tN = (o[0] * sdy - o[1] * sdx) / det;
            return { x: tO, z: -tN };
        }
    }
    if (okO && (!okN || lo >= ln)) return { x: achsPassung(sdx, sdy, o).t, z: 0 };
    if (okN) return { x: 0, z: -achsPassung(sdx, sdy, n).t };
    return { x: 0, z: 0 };
}

/**
 * Wie weit liegt ein Punkt auf einer ACHSE, gemessen am Sehstrahl (K6).
 *
 * Der Gizmo-Pfeil fährt nur auf seiner Geraden. Gesucht ist der Parameter t
 * (Meter entlang `richtung`) des Punktes, der dem Zeigerstrahl am nächsten
 * liegt — die klassische Lotfusspunkt-Rechnung zweier windschiefer Geraden.
 *
 * `null`, wenn der Blick fast entlang der Achse geht (die Rechnung wird dort
 * beliebig empfindlich) — der Aufrufer nimmt dann die Bildschirmpassung.
 *
 * @param {{origin:{x,y,z}, direction:{x,y,z}}} strahl
 * @param {{x,y,z}} ursprung   Punkt auf der Achse (der Griff)
 * @param {{x,y,z}} richtung   Einheitsvektor der Achse
 * @returns {number|null} t in Metern
 */
export function achsParameter(strahl, ursprung, richtung, { maxCos = 0.985 } = {}) {
    const d = strahl?.direction, o = strahl?.origin;
    if (!d || !o || !ursprung || !richtung) return null;
    const dl = Math.hypot(d.x, d.y, d.z);
    const rl = Math.hypot(richtung.x, richtung.y, richtung.z);
    if (!(dl > 1e-9) || !(rl > 1e-9)) return null;
    const e = { x: richtung.x / rl, y: richtung.y / rl, z: richtung.z / rl };
    const u = { x: d.x / dl, y: d.y / dl, z: d.z / dl };
    const cos = Math.abs(e.x * u.x + e.y * u.y + e.z * u.z);
    if (cos >= maxCos) return null;                       // Blick fast entlang der Achse
    const w = { x: ursprung.x - o.x, y: ursprung.y - o.y, z: ursprung.z - o.z };
    const we = w.x * e.x + w.y * e.y + w.z * e.z;
    const wu = w.x * u.x + w.y * u.y + w.z * u.z;
    const eu = e.x * u.x + e.y * u.y + e.z * u.z;
    const nenner = 1 - eu * eu;
    if (!(Math.abs(nenner) > 1e-9)) return null;
    return (eu * wu - we) / nenner;
}

/**
 * Eine beliebige Richtung als Bildschirmvektor (Pixel je Meter) am Punkt (K6).
 * Das Gegenstück zu `achsenAufSchirm` für Gizmo-Teile, deren Richtung nicht
 * eine der drei Weltachsen ist (Teil B: Flächennormale).
 */
export function richtungAufSchirm({ punkt, richtung, projiziere }) {
    const p0 = projiziere?.(punkt) ?? null;
    if (!p0 || !richtung) return null;
    const p1 = projiziere({ x: punkt.x + richtung.x, y: punkt.y + richtung.y, z: punkt.z + richtung.z });
    if (!p1 || !Number.isFinite(p1.x) || !Number.isFinite(p1.y)) return null;
    return [p1.x - p0.x, p1.y - p0.y];
}

/**
 * Rasterfang im Raum (S7): jede Komponente auf ein Vielfaches der Rasterweite.
 * Vorgabe 0,10 m — Alt lässt frei (flood-3D-Muster). Ein Raster von 0 tut nichts.
 */
export const RASTER_M = 0.1;
export function rasterFang(delta, raster = RASTER_M) {
    if (!delta || !(raster > 0)) return delta;
    // Auf Mikrometer gerundet, sonst wird aus 12 × 0,1 ein 1,2000000000000002;
    // `+ 0` macht aus −0 wieder 0.
    const r = (v) => Number((Math.round((v ?? 0) / raster) * raster).toFixed(6)) + 0;
    return { x: r(delta.x), y: r(delta.y), z: r(delta.z) };
}

/**
 * Die Pille am Griff: die Werte, die aktive Achse zuerst und markiert.
 * `felder` schränkt ein (ein XZ-Griff zeigt Ost und Nord, ein Y-Griff die Höhe).
 */
export function zugText(delta, achse, { felder = null } = {}) {
    const f = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`;
    const werte = { ost: delta?.x ?? 0, nord: -(delta?.z ?? 0), hoehe: delta?.y ?? 0 };
    const namen = felder ? ACHS_NAMEN.filter(a => felder.includes(a)) : [...ACHS_NAMEN];
    const reihe = achse && namen.includes(achse) ? [achse, ...namen.filter(a => a !== achse)] : namen;
    return reihe.map((a, i) => `${i === 0 && achse && a === achse ? '▸ ' : ''}${ACHSEN[a].titel} ${f(werte[a])}`).join(' · ') + ' m';
}
