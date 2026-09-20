/**
 * CdeAchsen — die selbst erzeugten Bauteile als FACHMODELL-Daten (Stufe 17.3).
 *
 * Das Loch, das diese Datei schliesst: Achsen, Netz, Strang, Prüfliste und
 * Mengen kamen ausschliesslich aus der IfcQuelle des GELIEFERTEN Modells.
 * Ein geteiltes, umgelegtes oder gezeichnetes Rohr lebte nur im CDE-Modell —
 * unsichtbar fürs Fachmodell. Schlimmer: die AUSGEBLENDETE Alt-Haltung
 * stand weiter im Netz und prüfte, verkettete und zählte mit — ein
 * unsichtbares Bauteil mit sichtbaren Befunden.
 *
 * Die Auflösung bleibt in der Schichtung: die ENGINE liest kein Journal.
 * Sie bekommt den Journalstand als DATEN hereingereicht
 * (`setzeJournalStand`), und diese Datei rechnet ihn aus dem erzeugt- und
 * geloescht-Stand aus — rein, aus den BAUPLAN-Parametern (die Rezepte
 * speichern Parameter, nie Netze; genau dafür).
 *
 * Nur ROHRE werden Kanten und nur SCHÄCHTE Knoten (die Rezepte sagen es
 * selbst): eine gezeichnete Linie ist eine Trasse, kein Kanal. Seit Teil XIV
 * kommen Gelände und Körper dazu — als GlobalId-Listen fürs Fachmodell.
 */

import { istEigen, modellVon, rezeptNach } from './Bauteilrezepte.js';
import { baueNetz } from './Netztopologie.js';

/**
 * Kanten, Knoten, Gelände und Körper aus dem erzeugt-Stand.
 *
 * Seit Teil XIV sagt jedes Rezept SELBST, was es dem Fachmodell gibt
 * (`fachmodell(globalId, plan)`) — die if-Kette auf Rezeptnamen ist weg,
 * ein neues Rezept fällt im Deklarations-Wächter auf statt hier zu fehlen.
 *
 * @param {Map<string, object>} erzeugtStand  globalId → Bauplan (nachher)
 * @returns {{kanten: Array, knoten: Array, gelaende: string[], koerper: string[]}}
 */
export function cdeAchsenAus(erzeugtStand = new Map()) {
    const out = { kanten: [], knoten: [], gelaende: [], koerper: [] };
    for (const [globalId, plan] of erzeugtStand) {
        const f = rezeptNach(plan?.rezept)?.fachmodell?.(globalId, plan) ?? {};
        for (const k of Object.keys(out)) {
            if (Array.isArray(f[k])) out[k].push(...f[k]);
        }
    }
    return out;
}

/**
 * Die ACHSE einer eigenen Kante — die Form, die `IfcEngine.achseVon` für
 * `cde:<gid>` liefert und die am Subjekt hängt (Teil XXIV, K3). Ein Ort.
 */
export function achseAusKante(k) {
    if (!k) return null;
    return {
        globalId: k.globalId, name: k.name, kategorie: k.kategorie,
        anfang: k.anfang, ende: k.ende, polyline: k.punkte,
        laenge: k.laenge, dn: k.dn, quelle: 'bauplan',
        // Was die Höhen SIND (K4) — ein eigener Bauplan sagt es selbst.
        ...(k.achsbezug ? { achsbezug: k.achsbezug } : {}),
        ...(Number.isFinite(k.sohlabstand) ? { sohlabstand: k.sohlabstand } : {}),
        ...(Number.isFinite(k.profilhoehe) ? { profilhoehe: k.profilhoehe } : {}),
    };
}

/**
 * Das Netz der EIGENEN Bauteile, als Auskunft wie `engine.netzAuskunft()`:
 * `{netz, achseVon(id), knoten}` — für den Kommandoweg ohne Oberfläche
 * (Teil XXIV, K3). Ids wie in der Engine: `cde:<globalId>`. Verdeckte fehlen,
 * dieselbe Regel wie im Fachmodell.
 *
 * @param {Map<string, object>} erzeugtStand
 * @param {object} [opts]  `verdeckt` (Set der GlobalIds), `toleranz`
 */
export function eigeneNetzauskunft(erzeugtStand = new Map(), { verdeckt = new Set(), toleranz } = {}) {
    const sichtbar = new Map([...erzeugtStand].filter(([gid]) => !verdeckt.has(gid)));
    const { kanten, knoten } = cdeAchsenAus(sichtbar);
    return netzauskunftAus(kanten, knoten, { toleranz });
}

/**
 * Dieselbe Auskunft aus Kanten und Knoten, wie `cdeAchsenAus` sie liefert —
 * für den Prüflauf, der sie aus der Engine oder aus dem Journal bekommt (K6).
 */
export function netzauskunftAus(kanten = [], knoten = [], { toleranz } = {}) {
    const jeId = new Map(kanten.map(k => [`cde:${k.globalId}`, k]));
    const netz = baueNetz({
        kanten: kanten.map(k => ({ id: `cde:${k.globalId}`, anfang: k.anfang, ende: k.ende, dn: k.dn, laenge: k.laenge,
                                   achsbezug: k.achsbezug ?? 'mitte', sohlabstand: k.sohlabstand ?? null,
                                   profilhoehe: k.profilhoehe ?? null,
                                   anschluss: k.anschluss ?? null })),
        knoten: knoten.map(k => ({ id: `cde:${k.globalId}`, punkt: k.punkt, globalId: k.globalId })),
        toleranz,
    });
    return {
        netz,
        achseVon: (id) => achseAusKante(jeId.get(id) ?? null),
        // `hoeheFest` (K8): die Höhe dieses Knotens gilt für einen Anschluss —
        // die Musterschicht fragt das, ohne zu wissen, dass es eine Sohle ist.
        knoten: knoten.map(k => ({ globalId: k.globalId, punkt: { x: k.punkt.x, y: k.punkt.y, z: k.punkt.z }, name: k.name ?? '',
                                   ...(k.hoehenbezug ? { hoehenbezug: k.hoehenbezug } : {}),
                                   ...(k.hoehenbezug === 'sohle' ? { hoeheFest: true } : {}) })),
    };
}

/** Verdeckt dieser Schritt (Plan- oder Journalschritt) sein Bauteil? */
export function istVerdeckt(schritt) {
    return schritt?.art === 'geloescht' && !!(schritt.wert ?? schritt.nachher);
}

/**
 * Welche GlobalIds verdeckt sind — DIE EINE Faltung dieser Frage (Stufe 0, D2).
 *
 * Bis 2026-09-10 gab es zwei: diese hier über den `geloescht`-Stand (alles,
 * was `true` trägt) und eine zweite in `IfcAutor.wendeAn` über die
 * Plan-Schritte, die zusätzlich auf `modell === 'cde'` filterte. Zwei
 * Antworten auf dieselbe Frage — und sie widersprachen sich genau dann, wenn
 * ein eigenes DGM ohne `modell` im Journal stand: der Sampler sah es als
 * verdeckt, der Autor baute es sichtbar.
 *
 * @param {Map|Array} quelle  der `geloescht`-Stand (GlobalId → Wert) ODER
 *                            eine Liste von Schritten `{art, globalId, wert|nachher, modell}`
 * @param {object} [opts]
 * @param {'cde'|'geliefert'|null} [opts.nur]  nur eigene bzw. nur gelieferte
 */
export function verdeckteAus(quelle = new Map(), { nur = null } = {}) {
    const out = new Set();
    const passt = (eintragOderGid) => !nur
        || (nur === 'cde' ? istEigen(eintragOderGid) : !istEigen(eintragOderGid));
    if (quelle instanceof Map) {
        for (const [globalId, wert] of quelle) {
            if (wert && passt(globalId)) out.add(globalId);
        }
        return out;
    }
    for (const s of quelle ?? []) {
        if (istVerdeckt(s) && passt(s)) out.add(s.globalId);
    }
    return out;
}

// `modellVon` wird hier nicht direkt gebraucht — der Import steht, damit die
// Leseseite (`istEigen`) und die Kennungsregel sichtbar dieselbe Quelle haben.
void modellVon;
