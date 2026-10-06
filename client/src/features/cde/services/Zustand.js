/**
 * DER ZUSTAND EINES EIGENEN BAUTEILS — Bestand oder Rückbau (Fabio, 2026-10-06:
 * „rückgebaute Elemente sollten geflaggt werden, man soll sie in der Ansicht
 * sehen — relevant für Massen später").
 *
 * Ein Bauplan trägt `parameter.zustand`; die Teile eines Bauwerks erben ihn
 * von ihrem Bauwerk (`teilVon`), damit eine Vorlage, die ihre Teile neu
 * rechnet, die Markierung nicht verliert. Ohne Angabe gilt nichts Besonderes.
 *
 * Alle Ansichten fragen HIER (3D, Lageplan, Strukturbaum, Paket) — eine
 * Regel, eine Farbe. Im IFC steht der Zustand als `Pset_…Common.Status`
 * (DEMOLISH), aus den Sachdaten der Quelle (`bimfy/isybau/Abbildung.js`).
 *
 * Rein: Daten hinein, Daten heraus.
 */

/** Die Zustände mit ihrem Bild. Farbe für 3D und Paket, Ton und Strich für den Plan. */
export const ZUSTAENDE = Object.freeze({
    rueckbau: Object.freeze({
        titel: 'Rückbau',
        text: 'wird zurückgebaut (ISYBAU Status 6, IFC Status DEMOLISH)',
        farbe: 0xc62828, deckkraft: 0.45,
        plan: Object.freeze({ r: 198, g: 40, b: 40, strich: Object.freeze([1.2, 0.8]) }),
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
