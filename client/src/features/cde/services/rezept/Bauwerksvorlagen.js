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

/** Welche Bauplanfelder eine Vorlage an einem Teil SETZT — der Rest bleibt beim Neuauswerten. */
export const GESTEUERT = Object.freeze({
    platte: Object.freeze(['punkte', 'dicke']),
    wand: Object.freeze(['punkte', 'dicke', 'wandhoehe']),
    raum: Object.freeze(['punkte', 'raumhoehe']),
    ueberlaufschwelle: Object.freeze(['punkte', 'dicke', 'wandhoehe']),
});

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

export const BAUWERKSVORLAGEN = Object.freeze({ [RECHTECKKAMMER.id]: RECHTECKKAMMER });

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

/** Die gesteuerten Werte eines Bauplans (für die Abweichung, E34) — als vergleichbarer Text. */
export function gesteuerterStand(rezept, parameter) {
    const felder = GESTEUERT[rezept] ?? ['punkte'];
    return JSON.stringify(felder.map(f => [f, parameter?.[f] ?? null]));
}
