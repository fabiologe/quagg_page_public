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
