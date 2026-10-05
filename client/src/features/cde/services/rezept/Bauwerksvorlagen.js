/**
 * BAUWERK-VORLAGEN (Teil XXVIII — Fabios E31–E33): ein Bauwerk aus EINER
 * Vorlage mit seinen Massen, und geändert über diese Masse.
 *
 * Eine Vorlage ist eingebauter Code wie eine Ableitung (Teil XXIII, E1): ihre
 * WERTE sind Felder mit Vorgabe (geprüft wie Rezeptfelder), ihre Rollen eine
 * reine Funktion `rollen(werte, ort) → [{ rolle, rezept, kategorie, name,
 * parameter, stehtAuf? }]`. Die Punkte stehen in WELT (wie jeder Bauplan),
 * der Ort ist die Aussenecke Nordwest auf der Oberkante der Bodenplatte.
 *
 * Was die Vorlage STEUERT, nennt `gesteuert` je Rezept: die Punkte und die
 * Masse, die sie setzt. Alles andere am Bauplan (Merkmale, Ausführung,
 * Objekttyp, eine Öffnung in der Wand) gehört dem Planer und bleibt beim
 * Neuauswerten, wie es ist (E33). Am Bauwerk steht die Auswertung unter
 * `bauwerksvorlage` (nicht `vorlage` — das ist die Bibliotheks-Vorlage, A1).
 *
 * Rein: kein Store, keine Engine. Ost = +x, Nord = −z (Welt).
 */
import { normschacht } from '../bimfy/muster/Normschacht.js';

/** Welche Bauplanfelder eine Vorlage an einem Teil SETZT — der Rest bleibt beim Neuauswerten. */
const RING_GESTEUERT = Object.freeze(['punkte', 'aussen', 'innen', 'aussenOben', 'innenOben', 'boden', 'deckel']);
export const GESTEUERT = Object.freeze({
    // BIMFY I4: die Teile des Normschachts.
    schachtunterteil: RING_GESTEUERT, schachtring: RING_GESTEUERT, schachthals: RING_GESTEUERT,
    schachtplatte: RING_GESTEUERT, auflagering: RING_GESTEUERT, schachtabdeckung: RING_GESTEUERT,
    berme: Object.freeze(['punkte', 'durchmesser', 'auftritt', 'gerinnebreite']),
    steigeisen: Object.freeze(['punkte']),
    platte: Object.freeze(['punkte', 'dicke']),
    wand: Object.freeze(['punkte', 'dicke', 'wandhoehe']),
    raum: Object.freeze(['punkte', 'raumhoehe', 'betriebswasser']),
    ueberlaufschwelle: Object.freeze(['punkte', 'dicke', 'wandhoehe', 'schwellenlaenge']),
});
// Gesteuert ist ein Feld nur, wenn die Vorlage es SETZT: die Rechteckkammer nennt
// kein Betriebswasser — ein Planer darf es setzen, und es bleibt.

const zahl = (name, titel, vorgabe, { min = 0.01, max = 100 } = {}) =>
    Object.freeze({ name, titel, einheit: 'm', typ: 'zahl', min, max, gueltig: { ueber: 0 }, vorgabe });

/** Ein Rechteck in Welt (x nach Ost, z nach Süd), im Uhrzeigersinn ab Nordwest, auf Höhe y. */
const rechteck = (x0, z0, laenge, breite, y) =>
    [[x0, y, z0], [x0 + laenge, y, z0], [x0 + laenge, y, z0 + breite], [x0, y, z0 + breite]];

/** Eine Wandachse von a nach b (je [x, z]) auf der Fusshöhe y. */
const achse = (a, b, y) => [[a[0], y, a[1]], [b[0], y, b[1]]];

/**
 * DIE RECHTECKKAMMER — die Kammer aus Teil XXVI, Abschnitt 6: Bodenplatte und
 * Decke aussenbündig, Längswände aussen durchlaufend, Querwände dazwischen,
 * stumpf gestossen; der Raum zwischen den Innenseiten.
 */
const RECHTECKKAMMER = Object.freeze({
    id: 'rechteckkammer',
    titel: 'Rechteckkammer',
    felder: Object.freeze([
        zahl('laenge', 'Lichte Länge (Ost–West)', 4),
        zahl('breite', 'Lichte Breite (Nord–Süd)', 3),
        zahl('lichteHoehe', 'Lichte Höhe', 2.5),
        zahl('wand', 'Wanddicke', 0.3, { max: 3 }),
        zahl('boden', 'Dicke der Bodenplatte', 0.4, { max: 5 }),
        zahl('decke', 'Dicke der Decke', 0.25, { max: 5 }),
    ]),
    bauwerk: { name: 'Kammer', art: 'anlage', bauwerkstyp: 'RRB' },
    rollen(w, ort) {
        const { laenge: L, breite: B, lichteHoehe: H, wand: t, boden, decke } = w;
        const { x: x0, y: y0, z: z0 } = ort;
        const aussenL = L + 2 * t, aussenB = B + 2 * t;
        const wand = (rolle, name, a, b) => ({ rolle, rezept: 'wand', kategorie: 'IFCWALL', name, stehtAuf: 'bodenplatte',
            parameter: { punkte: achse(a, b, y0), dicke: t, wandhoehe: H, predefinedType: 'RETAININGWALL' } });
        return [
            { rolle: 'bodenplatte', rezept: 'platte', kategorie: 'IFCSLAB', name: 'Bodenplatte',
              parameter: { punkte: rechteck(x0, z0, aussenL, aussenB, y0), dicke: boden, predefinedType: 'BASESLAB' } },
            wand('laengswandNord', 'Längswand Nord', [x0, z0 + t / 2], [x0 + aussenL, z0 + t / 2]),
            wand('laengswandSued', 'Längswand Süd', [x0, z0 + t + B + t / 2], [x0 + aussenL, z0 + t + B + t / 2]),
            wand('querwandWest', 'Querwand West', [x0 + t / 2, z0 + t], [x0 + t / 2, z0 + t + B]),
            wand('querwandOst', 'Querwand Ost', [x0 + t + L + t / 2, z0 + t], [x0 + t + L + t / 2, z0 + t + B]),
            { rolle: 'decke', rezept: 'platte', kategorie: 'IFCSLAB', name: 'Decke', stehtAuf: 'laengswandNord',
              parameter: { punkte: rechteck(x0, z0, aussenL, aussenB, y0 + H + decke), dicke: decke, predefinedType: 'ROOF' } },
            { rolle: 'raum', rezept: 'raum', kategorie: 'IFCSPACE', name: 'Kammerraum', stehtAuf: 'bodenplatte',
              parameter: { punkte: rechteck(x0 + t, z0 + t, L, B, y0), raumhoehe: H } },
        ];
    },
});

/**
 * DER ZWEIKAMMER-RÜB — das Becken aus Teil XXVI, Z9.2: zwei Kammern gleicher
 * lichter Länge hintereinander (West → Ost), dazwischen die Trennwand, auf ihr
 * die Überlaufschwelle. Die Krone der Schwelle ist der Betriebswasserspiegel
 * beider Kammern. Stirn- und Trennwand stehen zwischen den Längswänden.
 */
const ZWEIKAMMER_RUEB = Object.freeze({
    id: 'zweikammer-rueb',
    titel: 'Zweikammer-RÜB',
    felder: Object.freeze([
        zahl('laenge', 'Lichte Länge je Kammer (Ost–West)', 4),
        zahl('breite', 'Lichte Breite (Nord–Süd)', 3),
        zahl('lichteHoehe', 'Lichte Höhe', 2.5),
        zahl('wand', 'Wanddicke', 0.3, { max: 3 }),
        zahl('boden', 'Dicke der Bodenplatte', 0.4, { max: 5 }),
        zahl('decke', 'Dicke der Decke', 0.25, { max: 5 }),
        zahl('ueberlaufhoehe', 'Schwellenkrone über der Sohle', 2.4),
        zahl('schwelle', 'Höhe der Schwelle auf der Trennwand', 0.5),
    ]),
    bauwerk: { name: 'RÜB', art: 'anlage', bauwerkstyp: 'RUEB' },
    pruefe(w) {
        if (!(w.schwelle < w.ueberlaufhoehe)) return 'Die Schwelle ist höher als ihre Krone — die Trennwand hätte keine Höhe.';
        if (w.ueberlaufhoehe > w.lichteHoehe) return 'Die Schwellenkrone liegt über der Decke.';
        return null;
    },
    rollen(w, ort) {
        const { laenge: L, breite: B, lichteHoehe: H, wand: t, boden, decke, ueberlaufhoehe: U, schwelle: S } = w;
        const { x: x0, y: y0, z: z0 } = ort;
        const aussenL = 2 * L + 3 * t, aussenB = B + 2 * t;
        const nn = y0 + U + (ort.hoehenversatz ?? 0);                     // Betriebswasser in m NN
        const xT = x0 + t + L + t / 2;                                    // Achse der Trennwand
        const quer = (a) => [[a, z0 + t], [a, z0 + t + B]];
        const wand = (rolle, name, [a, b], mehr = {}) => ({ rolle, rezept: 'wand', kategorie: 'IFCWALL', name, stehtAuf: 'bodenplatte',
            parameter: { punkte: achse(a, b, y0), dicke: t, wandhoehe: H, predefinedType: 'RETAININGWALL', ...mehr } });
        const kammer = (rolle, name, xa) => ({ rolle, rezept: 'raum', kategorie: 'IFCSPACE', name, stehtAuf: 'bodenplatte',
            parameter: { punkte: rechteck(xa, z0 + t, L, B, y0), raumhoehe: H, betriebswasser: nn } });
        return [
            { rolle: 'bodenplatte', rezept: 'platte', kategorie: 'IFCSLAB', name: 'Bodenplatte',
              parameter: { punkte: rechteck(x0, z0, aussenL, aussenB, y0), dicke: boden, predefinedType: 'BASESLAB' } },
            wand('laengswandNord', 'Längswand Nord', [[x0, z0 + t / 2], [x0 + aussenL, z0 + t / 2]]),
            wand('laengswandSued', 'Längswand Süd', [[x0, z0 + t + B + t / 2], [x0 + aussenL, z0 + t + B + t / 2]]),
            wand('stirnwandWest', 'Stirnwand West', quer(x0 + t / 2)),
            wand('stirnwandOst', 'Stirnwand Ost', quer(x0 + aussenL - t / 2)),
            // Die Trennwand steht innen und trägt die Schwelle: nicht aussen.
            wand('trennwand', 'Trennwand', quer(xT), { wandhoehe: U - S, aussen: 'nein', predefinedType: 'SOLIDWALL' }),
            { rolle: 'schwelle', rezept: 'ueberlaufschwelle', kategorie: 'IFCWALL', name: 'Beckenüberlauf', stehtAuf: 'trennwand',
              parameter: { punkte: achse(...quer(xT), y0 + U - S), dicke: t, wandhoehe: S, ueberlaufart: 'Beckenüberlauf', schwellenlaenge: B } },
            { rolle: 'decke', rezept: 'platte', kategorie: 'IFCSLAB', name: 'Decke', stehtAuf: 'laengswandNord',
              parameter: { punkte: rechteck(x0, z0, aussenL, aussenB, y0 + H + decke), dicke: decke, predefinedType: 'ROOF' } },
            kammer('kammer1', 'Kammer 1', x0 + t),
            kammer('kammer2', 'Kammer 2', x0 + 2 * t + L),
        ];
    },
});

/** Ein Feld, das auch 0 sein darf (Richtung, „0 = nach Norm"). */
const wahl = (name, titel, vorgabe, { min = 0, max = 360, einheit = undefined } = {}) =>
    Object.freeze({ name, titel, typ: 'zahl', min, max, vorgabe, ...(einheit ? { einheit } : {}) });

const KLASSEN = ['', 'A', 'B', 'C', 'D', 'E', 'F'];
const grad = (g) => (Number(g) * Math.PI) / 180;
/** Ein Punkt der Vorlage aus Ost/Nord (m) und Höhe — Welt: x = Ost, z = −Nord. */
const welt = (ost, y, nord) => [ost, y, -nord];
/** Ein Punkt in Richtung `w` (Radiant, 0 = Ost, gegen den Uhrzeigersinn) im Abstand `d`. */
const inRichtung = (w, d, y) => welt(Math.cos(w) * d, y, Math.sin(w) * d);

/**
 * DER NORMSCHACHT (BIMFY I4): ein runder Fertigteilschacht nach DIN 4034-1,
 * Teil für Teil — Unterteil mit Berme und Gerinne, Ringe, Hals oder Platte,
 * Auflageringe, Abdeckung, Steigeisen. Die Kette rechnet `muster/Normschacht`
 * (dieselbe Rechnung wie beim ISYBAU-Import), hier wird sie in Teile gesetzt.
 *
 * Der Ort ist die SCHACHTMITTE auf der SOHLE. Der Hals ist exzentrisch zur
 * Steigseite: dort steht die Wand von unten bis oben senkrecht, und die
 * Steigeisen sitzen in einer Flucht.
 *
 * Wie viele Ringe es sind, folgt aus der Tiefe. Ändert ein neuer Wert ihre
 * ANZAHL, fehlen Rollen — das meldet das Neuauswerten (eine Grenze der
 * Vorlagen mit festen Rollen, Teil XXVIII).
 */
const NORMSCHACHT = Object.freeze({
    id: 'normschacht',
    titel: 'Normschacht',
    ort: Object.freeze({ punkt: 'Schachtmitte', hoehe: 'Sohlhöhe' }),
    felder: Object.freeze([
        zahl('tiefe', 'Tiefe (Deckel über Sohle)', 3, { min: 0.5, max: 15 }),
        zahl('dn', 'Nennweite (lichter Durchmesser)', 1.0, { min: 0.8, max: 3 }),
        zahl('oeffnung', 'Einstiegsöffnung', 0.625, { min: 0.6, max: 1 }),
        zahl('anschlussDn', 'Grösster Anschluss DN', 0.3, { min: 0.1, max: 2 }),
        wahl('unterteilHoehe', 'Höhe des Unterteils (0 = nach Norm)', 0, { max: 5, einheit: 'm' }),
        wahl('auflageringe', 'Auflageringe zusammen (0 = nach Norm)', 0, { max: 0.3, einheit: 'm' }),
        wahl('oberteil', 'Oberteil (1 = Konus, 2 = Abdeckplatte)', 1, { min: 1, max: 2 }),
        wahl('steighilfe', 'Steighilfe (ISYBAU G306: 1 einläufig, 2 zweiläufig, 5 keine)', 1, { min: 1, max: 5 }),
        wahl('gerinneform', 'Gerinneform (ISYBAU G309)', 0, { max: 9 }),
        wahl('abgang', 'Richtung des Abgangs (Grad, 0 = Ost)', 0),
        wahl('zulauf', 'Richtung des Zulaufs (Grad, −1 = keiner)', 180, { min: -1 }),
        wahl('steigRichtung', 'Richtung des Steiggangs (Grad, 0 = Ost)', 90),
        wahl('deckelklasse', 'Deckelklasse (1–6 = A–F, 0 = unbekannt)', 4, { max: 6 }),
    ]),
    bauwerk: { name: 'Schacht', art: 'schacht' },
    pruefe(w) {
        if (w.oeffnung >= w.dn) return 'Die Einstiegsöffnung ist nicht kleiner als der Schacht.';
        if (w.anschlussDn >= w.dn) return 'Der Anschluss ist so gross wie der Schacht.';
        return null;
    },
    /** Die Kette als Daten (für Befunde und Herleitung) — dieselbe, aus der die Rollen entstehen. */
    kette(w, sohle = 0) {
        const klasse = KLASSEN[Math.round(w.deckelklasse)] || null;
        const anschluesse = [{ dn: w.anschlussDn, richtung: grad(w.abgang), art: 'ablauf' },
                             ...(w.zulauf >= 0 ? [{ dn: w.anschlussDn, richtung: grad(w.zulauf), art: 'zulauf' }] : [])];
        return normschacht({
            name: 'Schacht', ort: { ost: 0, nord: 0 }, deckelHoehe: sohle + w.tiefe, sohle: { hoehe: sohle, quelle: 'Vorlage' },
            abdeckung: { klasse, laenge: w.oeffnung, ...(w.auflageringe > 0 ? { hoeheAuflageringe: w.auflageringe } : {}) },
            aufbau: { form: 'R', konus: Math.round(w.oberteil) !== 2, abdeckplatte: Math.round(w.oberteil) === 2 },
            unterteil: { form: 'R', laenge: w.dn, ...(w.unterteilHoehe > 0 ? { hoehe: w.unterteilHoehe } : {}), gerinneform: Math.round(w.gerinneform) },
            einstieghilfe: Math.round(w.steighilfe) !== 5, artEinstieghilfe: Math.round(w.steighilfe),
        }, { anschluesse, quelle: 'vorlage' });
    },
    rollen(w, ort) {
        const y0 = ort.y;
        const { teile } = this.kette(w, y0);
        const steig = grad(w.steigRichtung);
        const aus = [];
        let ringe = 0, auflageringe = 0;
        // Die Achse oberhalb des Halses ist zur Steigseite versetzt (exzentrisch).
        let oben = [0, 0];
        const teil = (rolle, rezept, name, t, parameter) => aus.push({ rolle, rezept, name, parameter: { ...parameter, herleitung: t.herleitung } });
        for (const t of teile) {
            if (t.rolle === 'schachtunterteil') {
                teil('unterteil', 'schachtunterteil', t.name, t, { punkte: [welt(0, t.unten, 0), welt(0, t.oben, 0)],
                     aussen: t.dAussen, innen: t.dInnen, boden: t.boden });
                const g = t.gerinne;
                teil('berme', 'berme', 'Berme mit Gerinne', { herleitung: { auftritt: t.herleitung.auftritt, gerinne: t.herleitung.gerinne } }, {
                    punkte: [welt(0, y0, 0), ...g.anschluesse.map(a => inRichtung(a.richtung ?? 0, t.dInnen / 2, y0))],
                    durchmesser: t.dInnen, auftritt: g.auftritt, gerinnebreite: g.breite });
            } else if (t.rolle === 'schachtring') {
                ringe++;
                teil(`ring${ringe}`, 'schachtring', t.name, t, { punkte: [welt(0, t.unten, 0), welt(0, t.oben, 0)], aussen: t.dAussen, innen: t.dInnen });
            } else if (t.rolle === 'uebergangsplatte') {
                teil('uebergangsplatte', 'schachtplatte', t.name, t, { punkte: [welt(0, t.unten, 0), welt(0, t.oben, 0)],
                     aussen: t.dAussen, innen: t.dOeffnung, objektTyp: 'Übergangsplatte' });
            } else if (t.rolle === 'schachthals') {
                const v = (t.dUnten - t.dOben) / 2;
                oben = [Math.cos(steig) * v, Math.sin(steig) * v];
                teil('hals', 'schachthals', t.name, t, { punkte: [welt(0, t.unten, 0), welt(oben[0], t.oben, oben[1])],
                     aussen: t.dUnten + 2 * t.wanddicke, innen: t.dUnten, aussenOben: t.dOben + 2 * t.wanddicke, innenOben: t.dOben });
            } else if (t.rolle === 'abdeckplatte') {
                teil('abdeckplatte', 'schachtplatte', t.name, t, { punkte: [welt(0, t.unten, 0), welt(0, t.oben, 0)],
                     aussen: t.dAussen, innen: t.dOeffnung });
            } else if (t.rolle === 'auflagering') {
                auflageringe++;
                teil(`auflagering${auflageringe}`, 'auflagering', t.name, t, {
                    punkte: [welt(oben[0], t.unten, oben[1]), welt(oben[0], t.oben, oben[1])], aussen: t.dAussen, innen: t.dInnen });
            } else if (t.rolle === 'abdeckung') {
                teil('abdeckung', 'schachtabdeckung', t.name, t, {
                    punkte: [welt(oben[0], t.unten, oben[1]), welt(oben[0], t.oben, oben[1])],
                    aussen: t.dAussen, innen: t.lichteWeite, deckel: t.deckeldicke });
            } else if (t.rolle === 'steigeisen' && t.hoehen.length) {
                const r = w.dn / 2;
                teil('steigeisen', 'steigeisen', t.name, t, { punkte: [welt(0, y0, 0), ...t.hoehen.map(h => inRichtung(steig, r, h))] });
            }
        }
        return aus.map(a => ({ ...a, kategorie: null }));
    },
});

export const BAUWERKSVORLAGEN = Object.freeze({ [RECHTECKKAMMER.id]: RECHTECKKAMMER, [ZWEIKAMMER_RUEB.id]: ZWEIKAMMER_RUEB,
                                                [NORMSCHACHT.id]: NORMSCHACHT });

/** Was an diesen Werten nicht baubar ist — oder null. Jede Vorlage darf es sagen (`pruefe`). */
export function vorlageGrund(vorlage, w) {
    // Ein Wert muss grösser als 0 sein — ausser das Feld sagt ausdrücklich, was es darf
    // (`gueltig.ueber` oder ohne `gueltig` sein `min`: eine Richtung darf 0 sein, BIMFY I4).
    const ok = (f) => {
        const v = w[f.name];
        if (!Number.isFinite(v)) return false;
        if (f.gueltig?.ueber !== undefined) return v > f.gueltig.ueber;
        if (f.min !== undefined) return v >= f.min;
        return v > 0;
    };
    if (!vorlage.felder.every(ok)) return 'Ein Wert der Vorlage fehlt oder liegt ausserhalb seines Bereichs.';
    return vorlage.pruefe?.(w) ?? null;
}

/** Eine Vorlage beim Namen, oder null. */
export function vorlageNach(id) {
    return BAUWERKSVORLAGEN[String(id ?? '')] ?? null;
}

/** Die Werte einer Vorlage: was gegeben ist, sonst die Vorgabe des Feldes — als Zahlen. */
export function vorlagenWerte(vorlage, roh = {}) {
    const aus = {};
    for (const f of vorlage?.felder ?? []) {
        const v = roh?.[f.name];
        aus[f.name] = v === '' || v === null || v === undefined ? f.vorgabe : Number(v);
    }
    return aus;
}

/**
 * DER RAHMEN eines Bauwerks aus einer Vorlage: der Ort der Aussenecke Nordwest
 * (Welt), der Winkel (Grad, gezählt wie `drehePunktliste`) und ob gespiegelt.
 * Die Vorlage rechnet in ihrem eigenen Grundriss; der Rahmen setzt ihn in die
 * Welt. Bewegt jemand das ganze Bauwerk (Teil XXVII, B2), zieht das
 * Lagewerkzeug den Rahmen nach (`rahmenNach`) — sonst spränge die Kammer beim
 * nächsten Wertesetzen an den alten Ort zurück.
 */
export function rahmenAus(ort, hoehenversatz = 0) {
    return { x: ort.x, y: ort.y, z: ort.z, winkel: 0, spiegel: false, hoehenversatz };
}

/** Ein Punkt der Vorlage (Grundriss um den Nullpunkt) in die Welt. */
function _inWelt(p, r) {
    if (!Array.isArray(p)) return p;
    const lz = r.spiegel ? -p[2] : p[2];
    if (!r.winkel) return [r.x + p[0], p[1], r.z + lz];
    const w = (r.winkel * Math.PI) / 180, cos = Math.cos(w), sin = Math.sin(w);
    return [r.x + p[0] * cos - lz * sin, p[1], r.z + p[0] * sin + lz * cos];
}

/** Die Teile der Vorlage für diese Werte, in die Welt gesetzt. */
export function vorlageTeile(vorlage, werte, rahmen) {
    return vorlage.rollen(werte, { x: 0, y: rahmen.y, z: 0, hoehenversatz: rahmen.hoehenversatz ?? 0 }).map(t => ({
        ...t,
        parameter: Array.isArray(t.parameter?.punkte)
            ? { ...t.parameter, punkte: t.parameter.punkte.map(p => _inWelt(p, rahmen)) } : t.parameter,
    }));
}

/**
 * Der Rahmen nach einer Lageänderung des ganzen Bauwerks — dieselbe Rechnung
 * wie für die Punkte: verschieben `{delta}`, drehen `{grad, zentrum}`,
 * spiegeln an der Achse `{grad, zentrum}` (Ref·Dreh(θ)·M = Dreh(2a − θ)·Ref₀·M).
 */
export function rahmenNach(r, art, { delta = null, grad = 0, zentrum = null } = {}) {
    if (art === 'verschieben') return { ...r, x: r.x + delta.x, y: r.y + delta.y, z: r.z + delta.z };
    const w = (Number(grad) * Math.PI) / 180, dx = r.x - zentrum.x, dz = r.z - zentrum.z;
    if (art === 'drehen') {
        const cos = Math.cos(w), sin = Math.sin(w);
        return { ...r, x: zentrum.x + dx * cos - dz * sin, z: zentrum.z + dx * sin + dz * cos, winkel: r.winkel + Number(grad) };
    }
    if (art === 'spiegeln') {
        const c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
        return { ...r, x: zentrum.x + dx * c2 + dz * s2, z: zentrum.z + dx * s2 - dz * c2,
                 winkel: 2 * Number(grad) - r.winkel, spiegel: !r.spiegel };
    }
    return r;
}

/** Die gesteuerten Werte eines Bauplans (für die Abweichung, E34) — nur diese Felder. */
export function gesteuerterStand(rezept, parameter) {
    const felder = GESTEUERT[rezept] ?? ['punkte'];
    return Object.fromEntries(felder.filter(f => parameter?.[f] !== undefined).map(f => [f, parameter[f]]));
}

const _gleich = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) <= 1e-6
    : Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((x, i) => _gleich(x, b[i]))
    : a === b);

/** Welche gesteuerten Felder eines Teils von der letzten Auswertung abweichen — [] heisst: unberührt. */
export function abweichungVon(stand, rezept, parameter) {
    const ist = gesteuerterStand(rezept, parameter);
    return Object.keys(stand ?? {}).filter(f => !_gleich(ist[f] ?? null, stand[f]));
}

/**
 * DIE ABWEICHUNG ALS BEFUND (E34): ein Teil, das jemand von Hand geändert hat,
 * überschreibt die Vorlage nicht — es wird übersprungen und hier genannt, am
 * Bauwerk, mit Rolle und Feld. Ein gelöschtes Teil ebenso.
 *
 * @param {object} plan       Bauplan des Bauwerks (mit `parameter.bauwerksvorlage`)
 * @param {Map} bauplaene     alle eigenen Baupläne je Kennung
 * @param {Set} [verdeckt]    gelöschte (verborgene) Kennungen — sie fehlen
 */
export function befundeFuerVorlage(plan, bauplaene, verdeckt = new Set()) {
    const bv = plan?.parameter?.bauwerksvorlage;
    const vorlage = vorlageNach(bv?.id);
    if (!bv || !vorlage) return [];
    const out = [];
    for (const [rolle, gid] of Object.entries(bv.rollen ?? {})) {
        const teil = verdeckt.has(gid) ? null : bauplaene?.get(gid);
        const felder = teil ? abweichungVon(bv.stand?.[rolle], teil.rezept, teil.parameter) : [];
        if (teil && !felder.length) continue;
        out.push({
            regel: 'vorlage_abweichung', schwere: 'hinweis', rolle, feld: felder[0] ?? null,
            text: teil ? `${teil.name || rolle} weicht von der Vorlage „${vorlage.titel}" ab (${felder.join(', ')}) — beim Wertesetzen übersprungen.`
                       : `Die Rolle „${rolle}" der Vorlage „${vorlage.titel}" fehlt — das Teil ist gelöscht.`,
            wert: felder.join(', ') || 'fehlt', grenze: 'wie die Vorlage', quelle: `Vorlage „${vorlage.titel}"`, kur: null,
        });
    }
    return out;
}
