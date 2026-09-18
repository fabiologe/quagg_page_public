/**
 * Griffe — werkzeug-gebundenes Ziehen, als Daten (Teil XVI, S4).
 *
 * Teil XI hat das freie Ziehen (Gizmo) bewusst entfernt: ein Griff, der
 * „irgendwohin" schiebt, schreibt Werte, die niemand bestellt hat. Ein
 * Griff ist ab jetzt die GESTE `griff` an einem FELD eines Katalogeintrags:
 *
 *   Schacht (geliefert)          XZ  → schacht-verschieben   ost/nord
 *   Achse geliefert, Rollen      Y   → sohlhoehen-setzen     anfang/ende (Forderung)
 *   Körper geliefert, Rolle      Y   → deckelhoehe-setzen    deckel      (Forderung)
 *   sonst mit Rolle sohlhoehe    Y   → bezugshoehe-setzen    hoehe
 *   eigenes Bauteil (Bauplan)    XZ (Shift: Y) → stuetzpunkt-verschieben  index + Punkt
 *   eigene Kantenmitte           XZ (Shift: Y) → kante-verschieben        index + Mitte
 *   eigenes Bauteil, Ring/Zug    W  (Kreis)    → drehen                   winkel
 *   hoehenfeld, netz             keine — Gelände wird durch Zug/Umriss geformt
 *
 * ZWEI WIRKUNGEN (S10). Die meisten Griffe werden GEZOGEN; zwei werden
 * ANGETIPPT, weil ihr Werkzeug nichts zu ziehen hat: „Stützpunkt entfernen"
 * und „Stützpunkt einfügen". Ein Tipp-Griff trägt seine Werte fertig
 * (`werte`) — der Weg zum Journal bleibt derselbe, nur die Geste ist kürzer.
 * Sie hängen als NEBENGRIFFE (`zeigtBei`) an ihrem Zug-Griff und erscheinen
 * erst, wenn der Zeiger dort steht: sonst stünden an einer Fläche mit zehn
 * Ecken vierzig Kugeln zugleich.
 *
 * TABLET-REGEL (2026-09-09): auf dem Finger gibt es kein SCHWEBEN — der
 * Auswahl-Handler schaltet es ausdrücklich ab. Alles, was nur beim Schweben
 * erscheint, wäre dort unerreichbar. Deshalb öffnet ein TIPP auf den
 * Zug-Griff dieselbe Gruppe, und was eine Modifikatortaste tut, tut hier ein
 * eigener Nebengriff: der Höhengriff ersetzt die Shift-Taste, mit der ein
 * Stützpunkt sonst in der Höhe wandert. Keine Bearbeitung darf an einer
 * Taste hängen, die das Gerät nicht hat.
 *
 * DIE FACHLOGIK LIEGT EINMAL: `griffeFuer` bedient den Lageplan (der nur die
 * XZ-Schachtgriffe zeichnet) UND den Raum. Die Zeichnung ist zwangsläufig
 * zweimal (Canvas 2D / three), die Frage „welcher Griff, welches Werkzeug,
 * welche Ebene, welcher Wert" nur hier.
 *
 * Rein: kein three, kein Vue. Vektoren sind {x, y, z}.
 */

import { nnAusWelt, weltAusNn } from './Hoehenbezug.js';
import { achsenErlaubt } from './Achszug.js';
import { rezeptNach } from './Bauteilrezepte.js';
import { innenEcken, innenringName } from './gelaende/Innenecken.js';

/** Wie weit ein Griff mindestens bewegt sein muss, damit ein Ablegen zählt (m). */
export const MINDEST_ZUG_M = 0.01;

const LAGE_REZEPTE = new Set(['linie', 'rohr', 'schacht', 'flaeche']);
/** Welche Rezepte einen geschlossenen Ring beschreiben (die letzte Kante zählt mit). */
const RING_REZEPTE = new Set(['flaeche']);
/** Ein Bauteil mit weniger Punkten als hier lässt sich nicht mehr sinnvoll drehen. */
const DREH_MINDEST_PUNKTE = 2;

/**
 * Hat dieser Bauplan Ecken, die „Ecken ziehen" zeigen kann (Teil XXII)? Ein
 * Erdbau-Vorgang mit mindestens einer Punktliste; Kanalgraben und
 * Bauwerksgrube folgen ihrer Haltung bzw. ihrem Bauwerk und haben keine.
 */
export function hatErdbauEcken(bauplan) {
    return _punktlisten(bauplan).some(l => l.punkte.length >= 2);
}

/**
 * Die Ecken eines Vorgangs, die in seinen OPERATIONEN stehen (Teil XXI, P5):
 * das Rezept sagt es (`punktlisten`, Teil XXIII A2). Kanalgraben und
 * Bauwerksgrube haben keine — sie folgen ihrer Haltung bzw. ihrem Bauwerk.
 */
function _punktlisten(bauplan) {
    if (!bauplan) return [];
    return rezeptNach(bauplan.rezept)?.punktlisten?.(bauplan.parameter) ?? [];
}

/**
 * @param {object} q
 * @param {Array}  [q.schaechte]     `engine.schachtGriffe()` — {globalId, name, modelId, localId, punkt, herkunft}
 * @param {Map}    [q.lageStand]     `aenderungen.wirksamerStand('lage')` — Anker je GlobalId
 * @param {object} [q.subjekt]       das eingeordnete Bauteil (anker, achse, oberkante, bezugshoehe, stand, …)
 * @param {object} [q.typprofil]     das Typprofil des Subjekts — sagt, welche ROLLEN es kennt
 * @param {'geliefert'|'cde'} [q.subjektHerkunft]
 * @returns {Array<object>} Griffe, jeder mit key/globalId/name/herkunft/art/pos/achsen/werkzeug/felder
 */
export function griffeFuer({ schaechte = [], lageStand = null, subjekt = null, typprofil = null, subjektHerkunft = 'geliefert', bauform = null } = {}) {
    const aus = [];

    // 1. Schachtgriffe — nur GELIEFERTE: der Ort eines eigenen Schachts lebt im
    //    Bauplan, und eine `lage` darauf läse das Fachmodell nie (G1).
    for (const s of schaechte) {
        if (s.herkunft !== 'geliefert' || !s.globalId || !_endlich(s.punkt)) continue;
        // Der Griff sitzt an der WIRKSAMEN Lage: ein schon verschobener Schacht
        // steht im Journal, die Achslese kennt nur den Lieferort.
        const l = lageStand?.get?.(s.globalId);
        const p = (Number.isFinite(l?.x) && Number.isFinite(l?.z)) ? { x: l.x, y: Number.isFinite(l.y) ? l.y : s.punkt.y, z: l.z } : s.punkt;
        aus.push({
            key: `schacht:${s.globalId}`, globalId: s.globalId, name: s.name ?? '', herkunft: 'geliefert',
            art: 'schacht', pos: { x: p.x, y: p.y, z: p.z }, achsen: 'XZ',
            werkzeug: 'schacht-verschieben', felder: ['ost', 'nord'],
            modelId: s.modelId ?? null, localId: s.localId ?? null,
        });
    }

    // 1b. DER BAUTEIL-GRIFF (S5): sitzt am AUSWAHLPUNKT (wo der Klick das Bauteil
    //    traf) und schiebt das GANZE Bauteil — entlang Ost, Nord oder Höhe, die
    //    Achse wählt die Zugrichtung (`Achszug.js`). Er bedient `verschieben`:
    //    geliefert → `lage` am Anker, eigen → der Bauplan wandert. Gelände hat
    //    keinen (wird geformt, nicht geschoben); ohne umkehrbare Lage auch nicht.
    if (subjekt?.globalId && _endlich(subjekt.anker) && subjekt.lageUmkehrbar !== false) {
        const erlaubt = achsenErlaubt(bauform);
        if (erlaubt.length) {
            const p = _endlich(subjekt.auswahlpunkt) ? subjekt.auswahlpunkt : subjekt.anker;
            aus.push({
                key: `bauteil:${subjekt.globalId}`, globalId: subjekt.globalId, name: subjekt.name ?? '',
                herkunft: subjektHerkunft, art: 'bauteil',
                pos: { x: p.x, y: p.y, z: p.z }, anker: { x: subjekt.anker.x, y: subjekt.anker.y, z: subjekt.anker.z },
                achsen: 'XYZ', achsenErlaubt: erlaubt,
                werkzeug: 'verschieben', felder: ['ost', 'nord', 'hoehe'],
                modelId: subjekt.modelId ?? null, localId: subjekt.localId ?? null,
            });
        }
    }

    // 2. Griffe am SUBJEKT
    if (!subjekt?.globalId) return aus;
    const rolle = (r) => !!typprofil?.felder?.[r];
    const bauplan = subjekt.stand?.bauplan ?? null;

    // Ein BAUPLAN heisst „hier entstanden" — verlässlicher als jede
    // Herkunftsangabe des Aufrufers (der Modellname trügt, siehe Delta-Modell).
    const eigen = subjektHerkunft === 'cde' || !!bauplan;
    if (eigen && bauplan && LAGE_REZEPTE.has(bauplan.rezept)) {
        const punkte = (Array.isArray(bauplan.parameter?.punkte) ? bauplan.parameter.punkte : [])
            .map(p => (Array.isArray(p) && p.length >= 3 && p.every(Number.isFinite) ? p : null));
        const ring = RING_REZEPTE.has(bauplan.rezept);
        const gid = subjekt.globalId;
        const mindest = ring ? 3 : 2;
        const gueltige = punkte.filter(Boolean).length;

        punkte.forEach((p, i) => {
            if (!p) return;
            const key = `stuetz:${gid}:${i}`;
            aus.push({
                key, globalId: gid, name: subjekt.name ?? '',
                herkunft: 'cde', art: 'stuetzpunkt', index: i,
                pos: { x: p[0], y: p[1], z: p[2] },
                // Grundriss mit der Maus; Shift hält die Höhe fest bzw. zieht sie.
                achsen: 'XZ', alternativ: 'Y',
                werkzeug: 'stuetzpunkt-verschieben', felder: ['index', 'ost', 'nord', 'hoehe'],
            });
            // Der HÖHENGRIFF — derselbe Stützpunkt, aber in der Höhe. Er ist
            // der Ersatz für die Shift-Taste, die es auf dem Tablet nicht
            // gibt; mit Maus bleibt Shift die Abkürzung.
            aus.push({
                key: `stuetz-hoch:${gid}:${i}`, globalId: gid, name: subjekt.name ?? '',
                herkunft: 'cde', art: 'stuetzpunkt', index: i,
                pos: { x: p[0], y: p[1], z: p[2] }, achsen: 'Y',
                rolle: 'hoehe', zeigtBei: key, nebenVersatz: { x: 1.7, y: 2.2 },
                werkzeug: 'stuetzpunkt-verschieben', felder: ['index', 'ost', 'nord', 'hoehe'],
            });
            // Der Entfernen-Griff (S10) — nur, wenn genug übrig bleibt; sonst
            // wäre es ein toter Knopf (Gesetz 10), denn `anwenden` gäbe null.
            if (gueltige > mindest) {
                aus.push({
                    key: `stuetz-weg:${gid}:${i}`, globalId: gid, name: subjekt.name ?? '',
                    herkunft: 'cde', art: 'stuetzpunkt-weg', index: i,
                    pos: { x: p[0], y: p[1], z: p[2] }, achsen: 'XZ',
                    wirkung: 'tipp', rolle: 'entfernen', zeigtBei: key, nebenVersatz: { x: -1.7, y: 2.2 },
                    werkzeug: 'stuetzpunkt-entfernen', felder: ['index'], werte: { index: i },
                });
            }
        });

        // KANTEN: Mitte ziehen verschiebt BEIDE Endpunkte parallel; der „+"
        // daneben fügt an genau dieser Station einen Stützpunkt ein.
        const kanten = kantenVon(punkte, ring);
        for (const k of kanten) {
            const key = `kante:${gid}:${k.i}`;
            aus.push({
                key, globalId: gid, name: subjekt.name ?? '',
                herkunft: 'cde', art: 'kante', index: k.i, index2: k.j,
                pos: k.mitte, achsen: 'XZ', alternativ: 'Y',
                werkzeug: 'kante-verschieben', felder: ['index', 'ost', 'nord', 'hoehe'],
            });
            aus.push({
                key: `kante-plus:${gid}:${k.i}`, globalId: gid, name: subjekt.name ?? '',
                herkunft: 'cde', art: 'kante-plus', index: k.i,
                pos: k.mitte, achsen: 'XZ',
                wirkung: 'tipp', rolle: 'einfuegen', zeigtBei: key, nebenVersatz: { x: 0, y: 2.2 },
                werkzeug: 'stuetzpunkt-einfuegen', felder: ['station'], werte: { station: _runde(k.station) },
            });
        }

        // DER DREHGRIFF: auf einem Kreis um den Schwerpunkt, in dessen Höhe.
        // Das Werkzeug `drehen` hat sein Winkelfeld schon — der Griff ist nur
        // der andere Weg hinein (S8 hatte nur das Feld).
        const dreh = drehgriffFuer(punkte.filter(Boolean));
        if (dreh) {
            aus.push({
                key: `drehung:${gid}`, globalId: gid, name: subjekt.name ?? '',
                herkunft: 'cde', art: 'drehung', pos: dreh.pos, zentrum: dreh.zentrum, achsen: 'W',
                werkzeug: 'drehen', felder: ['winkel'],
            });
        }
        return aus;
    }

    // ── KNICKPUNKTE EINES ERDBAU-VORGANGS (Teil XX Stufe C / Teil XXI, P5) ──
    //
    // Fabio (2026-09-10): „Knickpunkte XYZ-ziehbar". Ein Erdbau-Vorgang hat
    // keine `punkte` im Bauplan — seine Ecken stecken in den OPERATIONEN
    // (`umriss`, `linie`, `stationen`), und ihre Höhen stehen dort in m NN.
    // Deshalb ein eigener Zweig: derselbe Griff, dieselben Achsen, dasselbe
    // Muster mit Höhengriff daneben — nur eine andere Fundstelle.
    //
    // ALLE ECKEN (Teil XXII, Fabio 2026-09-18: „dann an allen Ecken eines
    // Körpers"): auch die inneren — die Sohlkante einer Grube, die Krone einer
    // Schüttung. Sie stehen nicht im Journal, sie FOLGEN aus Umriss, Neigung
    // und Sohle (`Innenecken.js`); ein Zug an ihnen verschiebt die äussere
    // Ecke so, dass die innere am Ziel liegt, und ihr Höhengriff setzt die
    // Sohle (Krone) für den ganzen Körper.
    //
    // Jeder dieser Griffe trägt `ecken: true` — gezeigt werden sie nur, wenn
    // „Ecken ziehen" für dieses Bauteil läuft (`bearbeitung.eckenFuer`), und
    // `ring` (seine Nachbarn in Zeichenreihenfolge) für die Führungslinien.
    if (eigen && bauplan && typeof rezeptNach(bauplan.rezept)?.punktlisten === 'function') {
        const listen = _punktlisten(bauplan);
        const gid = subjekt.globalId;
        const versatz = subjekt.hoehenversatz ?? 0;
        const FELDER = ['op', 'feld', 'index', 'ost', 'nord', 'hoehe'];
        const eckpaar = ({ key, pos, werte, index, op, feld, ring, geschlossen, titel }) => {
            const basis = { globalId: gid, name: subjekt.name ?? '', herkunft: 'cde', art: 'stuetzpunkt', index, op, feld,
                            werkzeug: 'erdbau-stuetzpunkt-verschieben', felder: FELDER, werte, ecken: true, ring, geschlossen, titel };
            aus.push({ ...basis, key, pos, achsen: 'XZ', alternativ: 'Y' });
            // Der Höhengriff — der Ersatz für die Shift-Taste, die es
            // auf dem Tablet nicht gibt (Tablet-Regel, siehe Kopf).
            aus.push({ ...basis, key: key.replace(/^erdbau-(stuetz|innen):/, 'erdbau-$1-hoch:'), pos, achsen: 'Y', rolle: 'hoehe',
                       zeigtBei: key, nebenVersatz: { x: 1.7, y: 2.2 } });
        };
        bauplan.parameter.operationen.forEach((op, j) => {
            for (const { feld, punkte: liste } of listen.filter(l => l.op === j)) {
                if (liste.length < 2) continue;
                const geschlossen = feld === 'umriss';
                const ring = liste.map(p => ({ x: Number(p?.x), z: Number(p?.z) }));
                liste.forEach((p, k) => {
                    const x = Number(p?.x), z = Number(p?.z), nn = Number(p?.y);
                    if (![x, z, nn].every(Number.isFinite)) return;
                    eckpaar({ key: `erdbau-stuetz:${gid}:${j}:${feld}:${k}`, pos: { x, y: weltAusNn(nn, versatz), z },
                              werte: { op: j, feld, index: k }, index: k, op: j, feld, ring, geschlossen,
                              titel: `Ecke ${k + 1}` });
                });
            }
            // Die inneren Ecken: Sohle (Grube) bzw. Krone (Schüttung bis Höhe).
            const innen = innenEcken(op);
            if (innen && innen.every(Boolean)) {
                const ring = innen.map(e => ({ x: e.x, z: e.z }));
                const name = innenringName(op);
                innen.forEach((e, k) => {
                    eckpaar({ key: `erdbau-innen:${gid}:${j}:umriss:${k}`, pos: { x: e.x, y: weltAusNn(e.y, versatz), z: e.z },
                              werte: { op: j, feld: 'umriss', index: k, bezug: 'innen' }, index: k, op: j, feld: 'umriss',
                              ring, geschlossen: true, titel: `${name} ${k + 1}` });
                });
            }
        });
        return aus;
    }

    if (eigen) return aus;
    const a = subjekt.achse ?? null;
    if (a?.anfang && a?.ende && rolle('sohlhoeheAnfang') && rolle('sohlhoeheEnde')) {
        for (const [ende, p] of [['anfang', a.anfang], ['ende', a.ende]]) {
            if (!_endlich(p)) continue;
            aus.push({
                key: `sohle:${subjekt.globalId}:${ende}`, globalId: subjekt.globalId, name: subjekt.name ?? '',
                herkunft: 'geliefert', art: 'sohle', ende, pos: { x: p.x, y: p.y, z: p.z }, achsen: 'Y',
                werkzeug: 'sohlhoehen-setzen', felder: [ende], forderung: true,
            });
        }
        return aus;
    }
    if (_endlich(subjekt.anker) && rolle('deckelhoehe')) {
        const y = Number.isFinite(subjekt.oberkante) ? subjekt.oberkante : subjekt.anker.y;
        aus.push({
            key: `deckel:${subjekt.globalId}`, globalId: subjekt.globalId, name: subjekt.name ?? '',
            herkunft: 'geliefert', art: 'deckel', pos: { x: subjekt.anker.x, y, z: subjekt.anker.z }, achsen: 'Y',
            werkzeug: 'deckelhoehe-setzen', felder: ['deckel'], forderung: true,
        });
    }
    if (_endlich(subjekt.anker) && rolle('sohlhoehe') && !aus.some(g => g.art === 'deckel')) {
        const y = Number.isFinite(subjekt.bezugshoehe) ? subjekt.bezugshoehe : subjekt.anker.y;
        aus.push({
            key: `bezug:${subjekt.globalId}`, globalId: subjekt.globalId, name: subjekt.name ?? '',
            herkunft: 'geliefert', art: 'bezugshoehe', pos: { x: subjekt.anker.x, y, z: subjekt.anker.z }, achsen: 'Y',
            werkzeug: 'bezugshoehe-setzen', felder: ['hoehe'],
        });
    }

    return aus;
}

/**
 * Aus der neuen Griff-Lage die FORMULARWERTE des Werkzeugs — derselbe Weg,
 * den auch das getippte Formular geht.
 *
 * @param {object} griff
 * @param {{x,y,z}} pos   neue Lage (Welt)
 * @param {{versatz?:{x,y,z}, hoehenversatz?:number}} ctx
 * @returns {Object<string, number>}
 */
export function griffZuWerten(griff, pos, { versatz = null, hoehenversatz = 0 } = {}) {
    const r3 = (v) => Math.round(v * 1000) / 1000;
    const v = versatz ?? { x: 0, y: 0, z: 0 };
    switch (griff?.art) {
        case 'schacht':
            // ost = welt.x + versatz.x, nord = −(welt.z + versatz.z) — wie im Plan.
            return { ost: r3(pos.x + v.x), nord: r3(-(pos.z + v.z)) };
        case 'sohle':
            return { [griff.ende]: r3(nnAusWelt(pos.y, hoehenversatz)) };
        case 'deckel':
            return { deckel: r3(nnAusWelt(pos.y, hoehenversatz)) };
        case 'bezugshoehe':
            return { hoehe: r3(nnAusWelt(pos.y, hoehenversatz)) };
        case 'stuetzpunkt':
            // `werte` trägt, was der Griff über seine FUNDSTELLE weiss und was
            // kein Zug ändert — beim Erdbau Operation und Feld. Ohne das
            // schriebe ein Zug am zweiten Vorgang in die erste Operation.
            return { ...(griff.werte ?? {}), index: griff.index,
                     ost: r3(pos.x + v.x), nord: r3(-(pos.z + v.z)), hoehe: r3(nnAusWelt(pos.y, hoehenversatz)) };
        case 'kante':
            // Der Griff SITZT auf der Kantenmitte — die neue Lage IST der
            // Zielwert. `anwenden` rechnet daraus das Delta beider Endpunkte,
            // also bleibt der Wert absolut und die Anwendung idempotent.
            return { index: griff.index, ost: r3(pos.x + v.x), nord: r3(-(pos.z + v.z)), hoehe: r3(nnAusWelt(pos.y, hoehenversatz)) };
        case 'drehung': {
            // Der Winkel zwischen Start- und Ziellage um das Zentrum, in Grad —
            // dieselbe Drehrichtung wie `drehePunktliste` (x' = x·cos − z·sin).
            const c = _endlich(griff.zentrum) ? griff.zentrum : null;
            if (!c) return {};
            const w = winkelGrad(c, griff.pos, pos);
            return Number.isFinite(w) ? { winkel: Math.round(w * 10) / 10 } : {};
        }
        case 'bauteil': {
            // Der Griff sitzt am Auswahlpunkt, das Werkzeug will den ANKER:
            // beide wandern um dasselbe Delta.
            const a = _endlich(griff.anker) ? griff.anker : griff.pos;
            const d = { x: pos.x - griff.pos.x, y: pos.y - griff.pos.y, z: pos.z - griff.pos.z };
            return { ost: r3(a.x + d.x + v.x), nord: r3(-(a.z + d.z + v.z)), hoehe: r3(nnAusWelt(a.y + d.y, hoehenversatz)) };
        }
        default:
            return {};
    }
}

/**
 * Die Ebene, in der ein Griff gezogen wird.
 *   XZ → waagerecht durch den Griff
 *   Y  → senkrecht, zur Kamera gerichtet (der Zeiger läuft dann exakt mit)
 * @param {{x,y,z}} pos
 * @param {'XZ'|'Y'} achsen
 * @param {{x,y,z}|null} kameraRichtung  Blickrichtung der Kamera (Welt)
 * @returns {{punkt:{x,y,z}, normal:{x,y,z}}}
 */
export function ziehebene(pos, achsen, kameraRichtung = null) {
    // 'W' (Drehung) läuft in der Waagerechten wie 'XZ' — gedreht wird der Grundriss.
    if (achsen === 'Y') {
        let n = { x: kameraRichtung?.x ?? 0, y: 0, z: kameraRichtung?.z ?? 0 };
        const l = Math.hypot(n.x, n.z);
        n = l > 1e-6 ? { x: n.x / l, y: 0, z: n.z / l } : { x: 0, y: 0, z: 1 };
        return { punkt: { ...pos }, normal: n };
    }
    return { punkt: { ...pos }, normal: { x: 0, y: 1, z: 0 } };
}

/** Schnitt eines Strahls mit einer Ebene, oder null (parallel / hinter dem Auge). */
export function schnittStrahlEbene(strahl, ebene) {
    const o = strahl?.origin, d = strahl?.direction, n = ebene?.normal, p = ebene?.punkt;
    if (!_endlich(o) || !_endlich(d) || !_endlich(n) || !_endlich(p)) return null;
    const nenner = n.x * d.x + n.y * d.y + n.z * d.z;
    if (Math.abs(nenner) < 1e-9) return null;
    const t = (n.x * (p.x - o.x) + n.y * (p.y - o.y) + n.z * (p.z - o.z)) / nenner;
    if (t < 0) return null;
    return { x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t };
}

/** Den Zug auf die erlaubten Achsen beschränken. */
export function begrenze(delta, achsen) {
    if (!delta) return { x: 0, y: 0, z: 0 };
    return achsen === 'Y' ? { x: 0, y: delta.y, z: 0 } : { x: delta.x, y: 0, z: delta.z };
}

/**
 * Die Kanten einer Punktliste mit Mitte und Station der Mitte (S10).
 * Die Station zählt in DERSELBEN Kette wie `_stationEinfuegen` im Katalog
 * (beim Ring auch der Schlussabschnitt) — sonst landete der eingefügte Punkt
 * woanders als der „+", den man angetippt hat.
 */
export function kantenVon(punkte, ring = false) {
    const aus = [];
    const n = punkte.length;
    if (n < 2) return aus;
    const bis = ring ? n : n - 1;
    let gelaufen = 0;
    for (let i = 0; i < bis; i++) {
        const a = punkte[i], b = punkte[(i + 1) % n];
        if (!a || !b) { if (a && b) gelaufen += 0; continue; }
        const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        if (d > 1e-6) {
            aus.push({
                i, j: (i + 1) % n, laenge: d, station: gelaufen + d / 2,
                mitte: { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, z: (a[2] + b[2]) / 2 },
            });
        }
        gelaufen += d;
    }
    return aus;
}

/** Zentrum (Schwerpunkt XZ, mittlere Höhe) und Griffort des Drehgriffs — oder null. */
export function drehgriffFuer(punkte) {
    if (!Array.isArray(punkte) || punkte.length < DREH_MINDEST_PUNKTE) return null;
    let x = 0, y = 0, z = 0;
    for (const p of punkte) { x += p[0]; y += p[1]; z += p[2]; }
    const c = { x: x / punkte.length, y: y / punkte.length, z: z / punkte.length };
    let r = 0;
    for (const p of punkte) r = Math.max(r, Math.hypot(p[0] - c.x, p[2] - c.z));
    if (!(r > 1e-6)) return null;
    // Etwas ausserhalb des Bauteils, damit der Griff nicht in den Stützpunkten steckt.
    return { zentrum: c, pos: { x: c.x + r * 1.25 + 0.5, y: c.y, z: c.z } };
}

/** Winkel (Grad) von `von` nach `nach` um `zentrum`, im Grundriss. */
export function winkelGrad(zentrum, von, nach) {
    const a = Math.atan2(von.z - zentrum.z, von.x - zentrum.x);
    const b = Math.atan2(nach.z - zentrum.z, nach.x - zentrum.x);
    if (Math.hypot(nach.z - zentrum.z, nach.x - zentrum.x) < 1e-6) return NaN;
    let d = ((b - a) * 180) / Math.PI;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
}

const _runde = (v) => Math.round(v * 1000) / 1000;

function _endlich(p) {
    return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}
