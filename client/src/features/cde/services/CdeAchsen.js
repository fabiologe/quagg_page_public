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

import { rezeptNach } from './Bauteilrezepte.js';

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

/** Welche GlobalIds der geloescht-Stand verdeckt. */
export function verdeckteAus(geloeschtStand = new Map()) {
    const out = new Set();
    for (const [globalId, wert] of geloeschtStand) {
        if (wert) out.add(globalId);
    }
    return out;
}
