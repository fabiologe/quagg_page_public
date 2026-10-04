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
    gewerk: 'entwaesserung',
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
    gewerk: 'entwaesserung',
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

export const BAUWERKSVORLAGEN = Object.freeze({ [RECHTECKKAMMER.id]: RECHTECKKAMMER, [ZWEIKAMMER_RUEB.id]: ZWEIKAMMER_RUEB });

/** Was an diesen Werten nicht baubar ist — oder null. Jede Vorlage darf es sagen (`pruefe`). */
export function vorlageGrund(vorlage, w) {
    if (!vorlage.felder.every(f => Number.isFinite(w[f.name]) && w[f.name] > 0)) return 'Ein Wert der Vorlage fehlt oder ist nicht grösser als 0.';
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
