/**
 * Netztopologie — wer hängt an wem (Stufe 14.5).
 *
 * WARUM AUS DER GEOMETRIE UND NICHT AUS BEZIEHUNGEN.
 *
 * Der Plan sah vor, die deklarierten IFC-Beziehungen zu lesen. Die Prüfung an
 * Fabios drei echten Dateien hat das widerlegt: es gibt dort **null**
 * `IfcDistributionPort`, null `IfcRelConnectsPortToElement`, null
 * `IfcRelConnectsElements`, null `IfcRelNests`. Keine einzige erklärte
 * Verbindung — und das ist kein Versehen eines Exports, sondern der Normalfall
 * bei ISYBAU-Konvertern.
 *
 * Dafür steht die Verkettung mit voller Schärfe in der Geometrie: Rohranfang
 * und Rohrende liegen in XY **exakt** auf den Schachtkoordinaten. Nachgemessen
 * an 24/24 und 500/500 Kanten, Abweichung 0,000 m. Ein Toleranzfenster ist
 * also nicht nötig — es steht trotzdem zur Verfügung, weil andere Exporteure
 * runden, und weil eine gefundene Kante mit Toleranz besser ist als keine.
 *
 * NUR IN XY VERGLEICHEN. In der Höhe unterscheiden sich Rohrsohle und
 * Schachtsohle naturgemäss (Anschlusshöhe, Sohlversatz, Bermen). Wer in 3D
 * vergleicht, findet nichts.
 *
 * Reines Modul: kein Vue, kein three, kein WebGL, keine Engine.
 */
import { achsbezugDerAchse, sohleAnAchse } from './Achsbezug.js';
import { regelwert } from './regeln/Regelwerk.js';

/**
 * Der Rückfall: 1 mm. In den Dateien ist die Abweichung exakt 0. Die GELTENDE
 * Toleranz steht seit Teil XXIV (K8, Fabios E6) im Regelwerk
 * (`netzToleranzM`, eingebaut ebenfalls 1 mm) — ein Büro kann sie ändern, und
 * die Regel liegt nicht mehr lose neben dem Katalog.
 */
export const TOLERANZ_M = 0.001;

function _toleranzAusRegelwerk() {
    const t = Number(regelwert('netzToleranzM'));
    return Number.isFinite(t) && t > 0 ? t : TOLERANZ_M;
}

/** Schlüssel eines Ortes im Raster der Toleranz — so wird das Suchen billig. */
function _zelle(x, z, toleranz) {
    return `${Math.round(x / toleranz)}|${Math.round(z / toleranz)}`;
}

/**
 * Das Netz aus Kanten und Knoten bauen.
 *
 * ERKLÄRT VOR ZUFALL (Teil XXIV, K8 — Fabios E6): eine Kante darf ihre Knoten
 * NENNEN (`anschluss: {anfang, ende}` als GlobalId; die Knoten tragen dafür
 * ihre `globalId`). Dann gilt die Erklärung, auch wenn der Ort nicht mehr
 * passt — und das ist ein Befund (`abweichend`), kein stilles loses Ende.
 * Ein genannter Knoten, den es im Netz nicht gibt (gelöscht, verdeckt), ist
 * ebenfalls ein Befund (`verwaist`); die Kante fällt dann auf die Koinzidenz
 * zurück. Ohne Erklärung — Geliefertes, alte Baupläne — bleibt es die
 * Koinzidenz in der Draufsicht.
 *
 * @param {object} opts
 * @param {Array<{id, anfang:{x,y,z}, ende:{x,y,z}, dn?, laenge?, anschluss?:{anfang?, ende?}}>} opts.kanten
 *        die Haltungen — `anfang`/`ende` in Weltkoordinaten
 * @param {Array<{id, punkt:{x,y,z}, globalId?}>} opts.knoten  die Schächte
 * @param {number} [opts.toleranz]  Vorgabe: `netzToleranzM` aus dem Regelwerk
 * @returns {{
 *   knoten: Map<id, {id, punkt, kantenAn: string[], kantenAb: string[]}>,
 *   kanten: Map<id, {id, von: id|null, nach: id|null, dn, laenge, anfang, ende}>,
 *   loseEnden: Array<{kante, ende: 'anfang'|'ende', punkt}>,
 *   ohneAnschluss: id[],
 *   abweichend: Array<{kante, ende, knoten, globalId, abstand}>,
 *   verwaist: Array<{kante, ende, globalId}>,
 * }}
 */
export function baueNetz({ kanten = [], knoten = [], toleranz = _toleranzAusRegelwerk() } = {}) {
    const tol = toleranz > 0 ? toleranz : TOLERANZ_M;

    // Raster über die Schächte. Ein Ort wird in allen neun Nachbarzellen
    // gesucht — sonst fiele ein Treffer knapp jenseits der Zellgrenze durch,
    // obwohl er innerhalb der Toleranz liegt.
    const raster = new Map();
    const knotenKarte = new Map();
    const jeGlobalId = new Map();
    for (const k of knoten) {
        if (!k?.id || !k.punkt) continue;
        knotenKarte.set(k.id, { id: k.id, punkt: k.punkt, kantenAn: [], kantenAb: [] });
        if (k.globalId) jeGlobalId.set(k.globalId, k.id);
        const s = _zelle(k.punkt.x, k.punkt.z, tol);
        if (!raster.has(s)) raster.set(s, []);
        raster.get(s).push(k);
    }

    const suche = (p) => {
        if (!p) return null;
        let bester = null;
        let besteDistanz = Infinity;
        const cx = Math.round(p.x / tol);
        const cz = Math.round(p.z / tol);
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                for (const k of raster.get(`${cx + dx}|${cz + dz}`) ?? []) {
                    // NUR XY — die Höhe unterscheidet sich mit Absicht.
                    const d = Math.hypot(k.punkt.x - p.x, k.punkt.z - p.z);
                    if (d <= tol && d < besteDistanz) { besteDistanz = d; bester = k.id; }
                }
            }
        }
        return bester;
    };

    const kantenKarte = new Map();
    const loseEnden = [];
    const abweichend = [];
    const verwaist = [];
    // Das Ende einer Kante: erst die Erklärung, dann die Koinzidenz.
    const endeVon = (e, ende) => {
        const p = e[ende];
        const gid = e.anschluss?.[ende] ?? null;
        if (gid) {
            const id = jeGlobalId.get(gid);
            if (id) {
                const k = knotenKarte.get(id);
                const abstand = Math.hypot(k.punkt.x - p.x, k.punkt.z - p.z);
                if (abstand > tol) abweichend.push({ kante: e.id, ende, knoten: id, globalId: gid, abstand });
                return id;
            }
            verwaist.push({ kante: e.id, ende, globalId: gid });
        }
        return suche(p);
    };
    for (const e of kanten) {
        if (!e?.id || !e.anfang || !e.ende) continue;
        const von = endeVon(e, 'anfang');
        const nach = endeVon(e, 'ende');
        kantenKarte.set(e.id, {
            id: e.id, von, nach,
            dn: e.dn ?? null, laenge: e.laenge ?? null,
            anfang: e.anfang, ende: e.ende,
            // WAS die Höhen sind (Teil XXIV, K4) — die Befunde am Knoten
            // vergleichen Sohlen, nicht rohe Achshöhen zweier Bezüge.
            achsbezug: e.achsbezug ?? null, sohlabstand: e.sohlabstand ?? null,
        });
        if (von) knotenKarte.get(von).kantenAb.push(e.id);
        else loseEnden.push({ kante: e.id, ende: 'anfang', punkt: e.anfang });
        if (nach) knotenKarte.get(nach).kantenAn.push(e.id);
        else loseEnden.push({ kante: e.id, ende: 'ende', punkt: e.ende });
    }

    const ohneAnschluss = [...knotenKarte.values()]
        .filter(k => !k.kantenAn.length && !k.kantenAb.length)
        .map(k => k.id);

    return { knoten: knotenKarte, kanten: kantenKarte, loseEnden, ohneAnschluss, abweichend, verwaist };
}

/**
 * Der Grad eines Knotens — wie viele Haltungen daran hängen.
 *
 * Ein Grad von 1 ist ein Anfang oder ein Ende des Netzes und völlig normal;
 * 0 ist ein Schacht, den niemand anschliesst.
 */
export function grad(netz, knotenId) {
    const k = netz?.knoten?.get(knotenId);
    return k ? k.kantenAn.length + k.kantenAb.length : 0;
}

/**
 * Die Kette stromab ab einer Kante — der STRANG.
 *
 * Folgt am Endknoten der abgehenden Haltung. Gibt es dort mehrere, endet die
 * Kette: welche gemeint ist, kann nur ein Mensch entscheiden, und stillschweigend
 * eine zu wählen wäre schlimmer als aufzuhören.
 *
 * Der Zyklusschutz ist kein Zierrat — ein falsch digitalisiertes Netz kann
 * sehr wohl im Kreis laufen, und dann liefe diese Schleife ewig.
 */
export function strangAb(netz, kantenId, grenze = 500) {
    const kette = [];
    const gesehen = new Set();
    let aktuell = kantenId;
    while (aktuell && !gesehen.has(aktuell) && kette.length < grenze) {
        gesehen.add(aktuell);
        kette.push(aktuell);
        const k = netz.kanten.get(aktuell);
        const knoten = k?.nach ? netz.knoten.get(k.nach) : null;
        const weiter = (knoten?.kantenAb ?? []).filter(id => id !== aktuell);
        aktuell = weiter.length === 1 ? weiter[0] : null;
    }
    return kette;
}

/**
 * Der Strang ab einer Kante, MIT den Achsen seiner Glieder — die Form, die am
 * Subjekt hängt (Teil XXIV, K3).
 *
 * Eine Funktion für beide Wege: die Engine ruft sie mit ihrem Netz über alle
 * Achsen, der Kommandoweg ohne Oberfläche mit dem Netz aus dem Journal
 * (`CdeAchsen.eigeneNetzauskunft`). Zwei Nachbauten liefen auseinander.
 *
 * @param {function(string): object|null} achseVon  Kanten-Id → Achse
 */
export function strangMitAchsen(netz, kantenId, achseVon) {
    if (!netz?.kanten?.has(kantenId)) return [];
    return strangAb(netz, kantenId).map((id) => {
        const a = achseVon(id);
        return {
            localId: id,
            globalId: a?.globalId ?? null,
            name: a?.name ?? '',
            anfang: a?.anfang ?? null,
            ende: a?.ende ?? null,
            laenge: a?.laenge ?? 0,
            dn: a?.dn ?? null,
            // Was die Höhen des Glieds SIND (K4): Längsschnitt und Sohlzug
            // rechnen damit auf die Sohle — für gelieferte Achsen aus ihrer
            // Herkunft, für eigene aus dem Bauplan.
            achsbezug: achsbezugDerAchse(a),
            sohlabstand: a?.sohlabstand ?? null,
            // Die Punkte dazwischen (K5): Länge und Gefälle eines Glieds laufen
            // entlang der Achse, nicht über die Sehne.
            punkte: a?.polyline ?? a?.punkte ?? null,
            // Woher die Achse kommt — `bauplan` heisst eigen: dort gilt der
            // Bauplan, keine Forderung (Fahrplan R3).
            quelle: a?.quelle ?? null,
        };
    }).filter(k => k.globalId && k.anfang && k.ende);
}

/**
 * Die Anschlüsse eines Knotens — welche Kante mit welchem Ende (Stufe 14.8),
 * MIT ihren Achsen. Derselbe Gedanke wie `strangMitAchsen`: eine Funktion,
 * die Engine und der Kommandoweg rufen sie mit ihrem Netz.
 *
 * `ende` sagt, welches Ende der Kante an DIESEM Knoten hängt.
 */
export function anschluesseMitAchsen(netz, knotenId, achseVon) {
    const knoten = netz?.knoten?.get(knotenId);
    if (!knoten) return [];
    const eintrag = (kantenId, ende) => {
        const a = achseVon(kantenId);
        return a?.globalId ? {
            localId: kantenId,
            globalId: a.globalId,
            name: a.name ?? '',
            kategorie: a.kategorie ?? 'IFCPIPESEGMENT',
            ende,
            anfang: a.anfang, ende_: a.ende, laenge: a.laenge, dn: a.dn,
            achsbezug: achsbezugDerAchse(a), sohlabstand: a.sohlabstand ?? null,
            // Die Punkte dazwischen — wie im Strang: wer zwei Anschlüsse zu einer
            // Haltung zusammenlegt, soll keinen Knick verlieren.
            punkte: a.polyline ?? a.punkte ?? null,
        } : null;
    };
    return [
        ...knoten.kantenAb.map(id => eintrag(id, 'anfang')),
        ...knoten.kantenAn.map(id => eintrag(id, 'ende')),
    ].filter(Boolean);
}

/**
 * Die SOHLE eines Knotens aus seinen Anschlüssen (Teil XXIV, Fahrplan R7): die
 * tiefste Sohle der Kanten, die an ihm BEGINNEN (die Abläufe), jede mit ihrem
 * Achsbezug gelesen. Ohne Ablauf `null` — dann weiss das Netz die Sohle nicht.
 *
 * Gebraucht für GELIEFERTE Schächte: ihre Platzierung ist nicht sicher die Sohle
 * (`Achsbezug.knotensohle`), der Ablauf aber schon — er ist das, woran eine neue
 * Haltung anschliesst. Ein Zulauf mit Absturz läge höher; er zählt nicht.
 *
 * @param {Array<{ende: 'anfang'|'ende', anfang: {y}, achsbezug?, dn?, sohlabstand?}>} anschluesse
 *        wie `anschluesseMitAchsen` sie liefert
 * @returns {number|null}  Höhe in der Welt (wie die Achsen)
 */
export function ablaufsohle(anschluesse) {
    let tiefste = null;
    for (const a of anschluesse ?? []) {
        if (a?.ende !== 'anfang' || !Number.isFinite(a.anfang?.y)) continue;
        const s = sohleAnAchse(a.anfang.y, a);
        if (Number.isFinite(s) && (tiefste === null || s < tiefste)) tiefste = s;
    }
    return tiefste;
}
