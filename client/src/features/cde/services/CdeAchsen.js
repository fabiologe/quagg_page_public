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
 * Nur ROHRE werden Kanten und nur SCHÄCHTE Knoten: eine gezeichnete Linie
 * ist eine Trasse, kein Kanal — im Netz hätte sie lauter DN-Befunde ohne
 * Nennweite. Das Gelände ist ohnehin keine Leitung.
 */

/** Ein Punkt kommt je nach Quelle als [x,y,z] oder {x,y,z}. */
function _p(p) {
    if (Array.isArray(p)) return { x: p[0] ?? 0, y: p[1] ?? 0, z: p[2] ?? 0 };
    return { x: p?.x ?? 0, y: p?.y ?? 0, z: p?.z ?? 0 };
}

function _laenge(punkte) {
    let l = 0;
    for (let i = 0; i + 1 < punkte.length; i++) {
        const a = punkte[i];
        const b = punkte[i + 1];
        l += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    }
    return l;
}

/**
 * Kanten und Knoten aus dem erzeugt-Stand.
 *
 * @param {Map<string, object>} erzeugtStand  globalId → Bauplan (nachher)
 * @returns {{kanten: Array, knoten: Array}}
 */
export function cdeAchsenAus(erzeugtStand = new Map()) {
    const kanten = [];
    const knoten = [];
    for (const [globalId, plan] of erzeugtStand) {
        const roh = plan?.parameter?.punkte;
        if (!Array.isArray(roh) || !roh.length) continue;
        const punkte = roh.map(_p);

        if (plan.rezept === 'rohr' && punkte.length >= 2) {
            kanten.push({
                globalId,
                name: plan.name ?? '',
                kategorie: plan.kategorie ?? 'IFCPIPESEGMENT',
                anfang: punkte[0],
                ende: punkte[punkte.length - 1],
                punkte,
                laenge: _laenge(punkte),
                dn: Number(plan.parameter?.dn) || null,
                quelle: 'bauplan',
            });
        } else if (plan.rezept === 'schacht') {
            // Der Schacht-Bauplan trägt Sohle und Deckel — der Netz-Knoten
            // ist die SOHLE (dieselbe Konvention wie die gelesene Platzierung).
            knoten.push({
                globalId,
                name: plan.name ?? '',
                punkt: punkte[0],
            });
        }
    }
    return { kanten, knoten };
}

/** Welche GlobalIds der geloescht-Stand verdeckt. */
export function verdeckteAus(geloeschtStand = new Map()) {
    const out = new Set();
    for (const [globalId, wert] of geloeschtStand) {
        if (wert) out.add(globalId);
    }
    return out;
}
