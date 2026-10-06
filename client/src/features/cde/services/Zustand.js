/**
 * DER ZUSTAND EINES EIGENEN BAUTEILS — Bestand, Neubau oder Rückbau (Fabio,
 * 2026-10-06: „rückgebaute Elemente sollten geflaggt werden, man soll sie in
 * der Ansicht sehen — relevant für Massen später"; danach „gleiche ab mit dem
 * Neubau": Bestand, Rückbau, Neubau).
 *
 * Die Farben folgen der Planzeichen-Gewohnheit im Tiefbau: Bestand grau,
 * Neubau rot, Rückbau gelb (dazu gestrichelt, damit es auch schwarz-weiss
 * gedruckt lesbar bleibt). Bestand färbt im 3D NICHT um — er ist der Normalfall,
 * das Modell bleibt in seinen Typfarben; nur der Plan zeichnet ihn grau.
 *
 * Ein Bauplan trägt `parameter.zustand`; die Teile eines Bauwerks erben ihn
 * von ihrem Bauwerk (`teilVon`), damit eine Vorlage, die ihre Teile neu
 * rechnet, die Markierung nicht verliert. Ohne Angabe gilt nichts Besonderes.
 *
 * Alle Ansichten fragen HIER (3D, Lageplan, Strukturbaum, Paket) — eine
 * Regel, eine Farbe. Im IFC steht der Zustand als `Pset_…Common.Status`
 * (EXISTING, NEW, DEMOLISH), aus den Sachdaten der Quelle (`bimfy/isybau/Abbildung.js`).
 *
 * Rein: Daten hinein, Daten heraus.
 */

/**
 * Die Zustände mit ihrem Bild, in der Reihenfolge der Massentabelle.
 * `farbe`/`deckkraft` färben 3D und Paket um (fehlt beim Bestand), `plan` gibt
 * Ton und Strich im Lageplan, `abzeichen` zeigt der Strukturbaum am Knoten.
 * `isybau` nennt die Status-Codes der Quelle (G105), die ihn ergeben.
 */
export const ZUSTAENDE = Object.freeze({
    bestand: Object.freeze({
        titel: 'Bestand',
        text: 'vorhanden und bleibt (ISYBAU Status 0, 3, 4 · IFC Status EXISTING)',
        isybau: Object.freeze([0, 3, 4]),
        abzeichen: false,
        plan: Object.freeze({ r: 110, g: 110, b: 110, strich: null }),
    }),
    neubau: Object.freeze({
        titel: 'Neubau',
        text: 'geplant, wird gebaut (ISYBAU Status 1 · IFC Status NEW)',
        isybau: Object.freeze([1]),
        abzeichen: true,
        farbe: 0xc62828, deckkraft: 1,
        plan: Object.freeze({ r: 198, g: 40, b: 40, strich: null }),
    }),
    rueckbau: Object.freeze({
        titel: 'Rückbau',
        text: 'wird zurückgebaut (ISYBAU Status 6 · IFC Status DEMOLISH)',
        isybau: Object.freeze([6]),
        abzeichen: true,
        farbe: 0xf9a825, deckkraft: 0.45,
        plan: Object.freeze({ r: 214, g: 150, b: 0, strich: Object.freeze([1.2, 0.8]) }),
    }),
});

/** Ist das ein bekannter Zustand? */
export const istZustand = (z) => typeof z === 'string' && Object.hasOwn(ZUSTAENDE, z);

/**
 * Der Zustand eines Bauplans — sein eigener, sonst der seines Bauwerks.
 * @param {object} bauplan
 * @param {(gid: string) => object|undefined} [bauplanVon]  Nachschlagen im Stand
 * @returns {string|null}  ein Schlüssel aus ZUSTAENDE oder null
 */
export function zustandVon(bauplan, bauplanVon = null) {
    const eigen = bauplan?.parameter?.zustand;
    if (istZustand(eigen)) return eigen;
    const eltern = bauplan?.parameter?.teilVon;
    const z = eltern && bauplanVon ? bauplanVon(eltern)?.parameter?.zustand : null;
    return istZustand(z) ? z : null;
}

/** Das Bild eines Zustands oder null. */
export const zustandsbild = (z) => (istZustand(z) ? ZUSTAENDE[z] : null);

/** Die Umfärbung eines Zustands `{farbe, deckkraft}` — oder null, wo die Typfarbe bleibt (Bestand, kein Zustand). */
export function zustandsfarbe(z) {
    const bild = zustandsbild(z);
    return bild && typeof bild.farbe === 'number' ? { farbe: bild.farbe, deckkraft: bild.deckkraft ?? 1 } : null;
}

/**
 * Der Zustand zu einem ISYBAU-Status (G105) — oder null, wo er nichts Baubares
 * sagt (2 fiktiv, 5 sonstige) oder fehlt.
 */
export function zustandAusIsybau(status) {
    const s = Number(status);
    if (status === null || status === undefined || status === '' || !Number.isInteger(s)) return null;
    for (const [z, bild] of Object.entries(ZUSTAENDE)) if (bild.isybau?.includes(s)) return z;
    return null;
}
