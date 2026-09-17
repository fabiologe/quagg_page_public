/**
 * Grabenregeln — Grabenbreite, Wandform und Baugrube nach Norm (Teil XVII, B3).
 *
 * Fabio (2026-09-08): „beim Kanalgraben müsste auch sowas wie Arbeitsraum
 * betrachtet werden — nach DIN 1610 oder anderen, z. B. mit Abböschung oder
 * senkrecht." Bis hierher war die Sohlbreite `DN + 2 · Arbeitsraum` mit einem
 * geratenen Arbeitsraum von 0,40 m. Jetzt ist sie ein DATENSATZ mit
 * Herkunft (Gesetz 2): das Büro überschreibt ihn, das Programm nicht.
 *
 * DIE ZAHLEN — nachgeschlagen in der Fachbibliothek (NormRAG), nicht
 * erinnert:
 *
 *   DIN EN 1610:2015-12, Tabelle 1 — Mindestgrabenbreite (OD + x) nach DN:
 *     DN ≤ 225        OD + 0,40 | OD + 0,40 | OD + 0,40
 *     225 < DN ≤ 350  OD + 0,50 | OD + 0,50 | OD + 0,40
 *     350 < DN ≤ 700  OD + 0,70 | OD + 0,70 | OD + 0,40
 *     700 < DN ≤ 1200 OD + 0,85 | OD + 0,85 | OD + 0,40
 *     DN > 1200       OD + 1,00 | OD + 1,00 | OD + 0,40
 *     (verbauter Graben | unverbaut β > 60° | unverbaut β ≤ 60°)
 *   DIN EN 1610:2015-12, Tabelle 2 — Mindestgrabenbreite nach Grabentiefe:
 *     < 1,00 m keine · 1,00–1,75 m 0,80 · 1,75–4,00 m 0,90 · > 4,00 m 1,00
 *     Es gilt der GRÖSSERE Wert beider Tabellen.
 *   DIN EN 1610:2015-12, 7.2 — untere Bettungsschicht a ≥ 100 mm bei üblichen
 *     Bodenbedingungen, ≥ 150 mm bei Fels oder festgelagerten Böden.
 *   DIN 4124:2012-01, 4.2.2 — bis 1,25 m Tiefe dürfen Gräben OHNE Sicherung
 *     mit senkrechten Wänden hergestellt werden (bei standfestem Boden).
 *   DIN 4124:2012-01, 4.2 — Böschungswinkel ohne rechnerischen Nachweis:
 *     45° nichtbindige oder weiche bindige Böden · 60° mindestens steife
 *     bindige Böden · 80° Fels.
 *   DIN 4124:2012-01 — Arbeitsraumbreite von Baugruben: 0,50 m geböscht,
 *     0,60 m verbaut (2012 von 0,50 angehoben).
 *
 * OD ist der AUSSENDURCHMESSER. In den ISYBAU-Exporten steht als Kreisradius
 * der halbe DN — die Wanddicke kennt niemand. Deshalb gilt OD = DN + 2 ·
 * Wanddicke mit Wanddicke als Regler (Vorgabe 0: OD = DN), und die Auskunft
 * nennt das. Beraten, nicht verbieten (Gesetz 6): eine senkrechte Wand ohne
 * Verbau tiefer als 1,25 m wird ein Befund, kein Verbot.
 *
 * Reines Modul: kein Vue, kein three, keine Engine.
 */

export const GRABENREGELN = Object.freeze({
    quelle: 'DIN EN 1610:2015-12 Tab. 1/2, 7.2 · DIN 4124:2012-01 4.2',
    /** Tabelle 1: Zuschlag x (m) zum Aussendurchmesser OD, je Spalte. */
    breiteNachDn: Object.freeze([
        Object.freeze({ bisDn: 225,      verbaut: 0.40, steil: 0.40, flach: 0.40 }),
        Object.freeze({ bisDn: 350,      verbaut: 0.50, steil: 0.50, flach: 0.40 }),
        Object.freeze({ bisDn: 700,      verbaut: 0.70, steil: 0.70, flach: 0.40 }),
        Object.freeze({ bisDn: 1200,     verbaut: 0.85, steil: 0.85, flach: 0.40 }),
        Object.freeze({ bisDn: Infinity, verbaut: 1.00, steil: 1.00, flach: 0.40 }),
    ]),
    /** Tabelle 2: Mindestbreite (m) nach Grabentiefe. */
    breiteNachTiefe: Object.freeze([
        Object.freeze({ bisTiefe: 1.00,     breite: 0 }),
        Object.freeze({ bisTiefe: 1.75,     breite: 0.80 }),
        Object.freeze({ bisTiefe: 4.00,     breite: 0.90 }),
        Object.freeze({ bisTiefe: Infinity, breite: 1.00 }),
    ]),
    /** Winkelgrenze zwischen den Spalten „β > 60°" und „β ≤ 60°" (Tabelle 1). */
    steilGrenzeGrad: 60,
    /** Untere Bettungsschicht a (m). */
    bettung: Object.freeze({ ueblich: 0.10, fels: 0.15 }),
    /** DIN 4124 4.2.2: senkrecht ohne Sicherung bis … (m). */
    senkrechtOhneVerbauBisM: 1.25,
    /** DIN 4124 4.2: Böschungswinkel ohne Nachweis, je Bodenklasse (Grad). */
    boeschungswinkel: Object.freeze({ nichtbindig: 45, bindigSteif: 60, fels: 80 }),
    /** DIN 4124: Arbeitsraumbreite einer Baugrube (Schacht), je Wandform (m). */
    arbeitsraumBaugrube: Object.freeze({ geboescht: 0.50, verbaut: 0.60 }),
});

/** Die drei Wandformen — was der Planer wählt. */
export const WANDFORMEN = Object.freeze({
    verbau:    { titel: 'Senkrecht mit Verbau',   text: 'Verbauter Graben (Tabelle 1, Spalte 1)' },
    boeschung: { titel: 'Abgeböscht',             text: 'Unverbaut, Böschungswinkel aus der Bodenklasse (DIN 4124)' },
    senkrecht: { titel: 'Senkrecht ohne Verbau',  text: 'Nur bis 1,25 m Tiefe zulässig (DIN 4124 4.2.2)' },
});

export const BODENKLASSEN = Object.freeze({
    nichtbindig: { titel: 'Nichtbindig / weich bindig (45°)' },
    bindigSteif: { titel: 'Mindestens steif bindig (60°)' },
    fels:        { titel: 'Fels (80°)' },
});

/**
 * DIE AUFLOCKERUNG (Teil XXI, P4).
 *
 * Gewachsener Boden nimmt beim Lösen mehr Raum ein: was als 100 m³ im
 * Baugrund steht, füllt auf der Mulde 115 bis 160 m³. Der Aushub wird in
 * `UndisturbedVolume` gemessen, abgefahren wird `LooseVolume` — beide Mengen
 * stehen im IFC (`Qto_EarthworksCutBaseQuantities`), und ohne die zweite
 * rechnet jeder Empfänger sie sich selbst aus, jeder mit seinem Faktor.
 *
 * DIE ZAHLEN SIND ERFAHRUNGSWERTE, keine Norm. DIN 18300 kennt seit 2015
 * Homogenbereiche statt Bodenklassen und schreibt keinen Faktor vor; er
 * gehört in die Kalkulation. Deshalb ist er hier ein REGLER mit Vorgabe —
 * sichtbar im Formular, änderbar, und als Merkmal am Vorgang.
 */
export const AUFLOCKERUNG = Object.freeze({
    quelle: 'Erfahrungswerte des Erdbaus — kein Normwert; im Formular änderbar',
    /** Loses Volumen je Kubikmeter gewachsenem Boden. */
    nachBoden: Object.freeze({ nichtbindig: 1.15, bindigSteif: 1.25, fels: 1.45 }),
    vorgabe: 1.15,
    min: 1,
    max: 2,
});

/** Der Faktor zu einer Bodenklasse — oder die Vorgabe. */
export function auflockerungFuer(boden, regeln = AUFLOCKERUNG) {
    const v = regeln.nachBoden?.[String(boden ?? '')];
    return Number.isFinite(v) ? v : regeln.vorgabe;
}

/** Ein gültiger Faktor, oder null (dann gilt die Vorgabe des Rezepts). */
export function auflockerungOder(wert, vorgabe = null) {
    const z = Number(wert);
    return Number.isFinite(z) && z >= AUFLOCKERUNG.min && z <= AUFLOCKERUNG.max ? z : vorgabe;
}

const fin = (v) => Number.isFinite(v);
const rund = (v) => Math.round(v * 1000) / 1000;

/**
 * Die Wand: Neigung 1 : n (n = cot β; 0 = senkrecht), Winkel und Grund.
 *
 * @param {object} opts
 * @param {'verbau'|'boeschung'|'senkrecht'} opts.wandform
 * @param {'nichtbindig'|'bindigSteif'|'fels'} [opts.boden]
 * @param {number|null} [opts.winkelGrad]  ausdrücklicher Böschungswinkel (überstimmt die Bodenklasse)
 * @param {object} [opts.regeln]
 */
export function wandFuer({ wandform = 'verbau', boden = 'nichtbindig', winkelGrad = null, regeln = GRABENREGELN } = {}) {
    if (wandform !== 'boeschung') {
        return { wandform, n: 0, winkelGrad: 90, grund: wandform === 'verbau' ? 'senkrecht, verbaut' : 'senkrecht, ohne Verbau' };
    }
    const zulaessig = regeln.boeschungswinkel?.[boden] ?? regeln.boeschungswinkel?.nichtbindig ?? 45;
    const winkel = fin(winkelGrad) && winkelGrad > 0 && winkelGrad < 90 ? winkelGrad : zulaessig;
    const n = rund(1 / Math.tan(winkel * Math.PI / 180));
    return {
        wandform, n, winkelGrad: winkel, zulaessigGrad: zulaessig, boden,
        grund: fin(winkelGrad) && winkelGrad > 0 && winkelGrad < 90
            ? `Böschung ${winkel}° (eigener Wert; ${boden}: bis ${zulaessig}° ohne Nachweis)`
            : `Böschung ${winkel}° aus Bodenklasse ${boden} (DIN 4124)`,
    };
}

/**
 * Die Sohlbreite eines Rohrgrabens nach DIN EN 1610 — der grössere Wert aus
 * Tabelle 1 (nach DN und Wandform) und Tabelle 2 (nach Tiefe).
 *
 * @param {object} opts
 * @param {number} opts.dn            Nennweite (mm)
 * @param {number} [opts.wanddickeMm] Wanddicke (mm) — OD = DN + 2 · Wanddicke; Vorgabe 0
 * @param {number} [opts.tiefe]       Grabentiefe (m), für Tabelle 2
 * @param {object} [opts.wand]        aus `wandFuer`
 * @param {number|null} [opts.eigene] eigene Sohlbreite (m) — überstimmt die Norm, wird gemeldet
 * @returns {{sohlbreite:number, od:number, ausDn:number, ausTiefe:number, spalte:string, grund:string, hinweise:string[]}}
 */
export function grabenbreite({ dn, wanddickeMm = 0, tiefe = 0, wand = null, eigene = null, regeln = GRABENREGELN } = {}) {
    const hinweise = [];
    const d = fin(dn) && dn > 0 ? dn : 0;
    const od = rund(d / 1000 + 2 * (fin(wanddickeMm) ? wanddickeMm : 0) / 1000);
    if (!(fin(wanddickeMm) && wanddickeMm > 0)) hinweise.push('OD = DN (Wanddicke unbekannt)');
    const w = wand ?? wandFuer({ wandform: 'verbau' });
    const spalte = w.wandform === 'verbau' ? 'verbaut'
        : (w.winkelGrad > (regeln.steilGrenzeGrad ?? 60) ? 'steil' : 'flach');
    const zeile = (regeln.breiteNachDn ?? []).find(z => d <= z.bisDn) ?? regeln.breiteNachDn?.at(-1);
    const ausDn = rund(od + (zeile?.[spalte] ?? 0.4));
    const t = fin(tiefe) && tiefe > 0 ? tiefe : 0;
    const zeileT = (regeln.breiteNachTiefe ?? []).find(z => t < z.bisTiefe || (z.bisTiefe === Infinity))
        ?? regeln.breiteNachTiefe?.at(-1);
    // Tabelle 2 gilt ab 1,00 m Tiefe; „< 1,00 keine" ist die erste Zeile.
    const ausTiefe = t < 1.0 ? 0 : (zeileT?.breite ?? 0);
    const norm = Math.max(ausDn, ausTiefe);
    if (fin(eigene) && eigene > 0) {
        if (eigene < norm) hinweise.push(`eigene Sohlbreite ${eigene.toFixed(2)} m unter der Mindestbreite ${norm.toFixed(2)} m (DIN EN 1610)`);
        return { sohlbreite: rund(eigene), od, ausDn, ausTiefe, spalte, norm, hinweise,
                 grund: `eigene Sohlbreite ${eigene.toFixed(2)} m (Norm: ${norm.toFixed(2)} m)` };
    }
    return {
        sohlbreite: norm, od, ausDn, ausTiefe, spalte, norm, hinweise,
        grund: ausTiefe > ausDn
            ? `${norm.toFixed(2)} m nach Tiefe ${t.toFixed(2)} m (DIN EN 1610 Tab. 2; nach DN wären es ${ausDn.toFixed(2)} m)`
            : `${norm.toFixed(2)} m = OD ${od.toFixed(2)} + ${(zeile?.[spalte] ?? 0.4).toFixed(2)} (DIN EN 1610 Tab. 1, ${spalte})`,
    };
}

/**
 * Die Baugrube eines Schachts — ECKIG, nie rund (Fabio): ein Quadrat mit der
 * Seite Aussenmass + 2 · Arbeitsraum (DIN 4124: 0,50 m geböscht, 0,60 m
 * verbaut), ausgerichtet entlang der anschliessenden Haltung. Das Aussenmass
 * ist der Schachtdurchmesser oder die Kantenlänge eines eckigen Schachts.
 */
export function baugrubenmass({ aussenmass = 1.0, aussenDm, wand = null, regeln = GRABENREGELN } = {}) {
    const w = wand ?? wandFuer({ wandform: 'verbau' });
    const arbeitsraum = w.wandform === 'boeschung'
        ? (regeln.arbeitsraumBaugrube?.geboescht ?? 0.5)
        : (regeln.arbeitsraumBaugrube?.verbaut ?? 0.6);
    const roh = fin(aussenDm) && aussenDm > 0 ? aussenDm : aussenmass;
    const mass = fin(roh) && roh > 0 ? roh : 1.0;
    const seite = rund(mass + 2 * arbeitsraum);
    return { arbeitsraum, seite, laenge: seite, breite: seite, halb: rund(seite / 2),
             grund: `${mass.toFixed(2)} + 2 · ${arbeitsraum.toFixed(2)} Arbeitsraum = ${seite.toFixed(2)} m Kantenlänge (DIN 4124, ${w.wandform === 'boeschung' ? 'geböscht' : 'verbaut'})` };
}

/**
 * Rechteckumriss (XZ) um einen Punkt, Länge entlang `richtung` — für die
 * Vorschau der Baugrube. Ohne Richtung liegt die Länge auf Ost.
 */
export function rechteckUmriss(mitte, laenge, breite, richtung = null) {
    let ux = 1, uz = 0;
    if (richtung && fin(richtung.x) && fin(richtung.z)) {
        const l = Math.hypot(richtung.x, richtung.z);
        if (l > 1e-9) { ux = richtung.x / l; uz = richtung.z / l; }
    }
    const a = laenge / 2, b = breite / 2;
    const ecke = (u, v) => ({ x: mitte.x + u * ux - v * uz, z: mitte.z + u * uz + v * ux });
    return [ecke(-a, -b), ecke(a, -b), ecke(a, b), ecke(-a, b)];
}

/**
 * Die Richtung der Baugrube: entlang der Haltung, die an diesem Knoten
 * hängt (das Rohrende, das auf dem Knoten liegt). Ohne Treffer null → Ost.
 */
export function baugrubenRichtung(knoten, kanten, tol = 0.001) {
    for (const k of kanten ?? []) {
        const pts = Array.isArray(k?.punkte) && k.punkte.length >= 2 ? k.punkte : [k?.anfang, k?.ende];
        if (!pts[0] || !pts[pts.length - 1]) continue;
        const a = pts[0], e = pts[pts.length - 1];
        if (Math.hypot(a.x - knoten.x, a.z - knoten.z) <= tol) return { x: pts[1].x - a.x, z: pts[1].z - a.z };
        if (Math.hypot(e.x - knoten.x, e.z - knoten.z) <= tol) { const v = pts[pts.length - 2]; return { x: e.x - v.x, z: e.z - v.z }; }
    }
    return null;
}

/**
 * Befunde zur Wandform — beraten, nicht verbieten.
 * @param {object} opts
 * @param {object} opts.wand          aus `wandFuer`
 * @param {number} opts.tiefeMax      grösste Grabentiefe (m)
 * @returns {Array<{regel:string, schwere:string, text:string}>}
 */
export function pruefeGraben({ wand, tiefeMax = 0, regeln = GRABENREGELN } = {}) {
    const befunde = [];
    if (!wand) return befunde;
    const grenze = regeln.senkrechtOhneVerbauBisM ?? 1.25;
    if (wand.wandform === 'senkrecht' && fin(tiefeMax) && tiefeMax > grenze) {
        befunde.push({ regel: 'graben_senkrecht_ohne_verbau', schwere: 'warnung',
                       text: `Senkrechte Wand ohne Verbau bei ${tiefeMax.toFixed(2)} m Tiefe — zulässig nur bis ${grenze.toFixed(2)} m (DIN 4124 4.2.2)` });
    }
    if (wand.wandform === 'boeschung' && fin(wand.zulaessigGrad) && wand.winkelGrad > wand.zulaessigGrad + 1e-9) {
        befunde.push({ regel: 'boeschung_zu_steil', schwere: 'warnung',
                       text: `Böschung ${wand.winkelGrad}° steiler als ${wand.zulaessigGrad}° für ${wand.boden} — braucht einen rechnerischen Nachweis (DIN 4124)` });
    }
    return befunde;
}

/** Die Schächte an einer Kette von Haltungen: Knoten, die auf einem Rohrende liegen (XY, 1 mm). */
export function schaechteAnKanten(kanten, knoten, tol = 0.001) {
    const enden = [];
    for (const k of kanten ?? []) { if (k?.anfang) enden.push(k.anfang); if (k?.ende) enden.push(k.ende); }
    return (knoten ?? []).filter(s => {
        const p = s?.punkt ?? s;
        return fin(p?.x) && fin(p?.z) && enden.some(e => fin(e?.x) && Math.hypot(e.x - p.x, e.z - p.z) <= tol);
    });
}
