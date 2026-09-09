/**
 * Welche Farbe hat ein Bauteil? (Erdbau zuerst, 2026-09-09)
 *
 * DER ANLASS. Aushub, Auftrag und Gelände sahen im Raum gleich aus — drei
 * weissgraue Körper, die einander verdecken. Fabio: „ein Aushub sollte ein
 * wenig transparent sein und beige-braun, Aufschütten solide und pastellgrün,
 * das Hauptgelände weiss-beige."
 *
 * WARUM DER AUSHUB DURCHSCHEINT und der Auftrag nicht — das ist keine Optik,
 * sondern die Fachlage: ein `IfcEarthworksCut` beschreibt FEHLENDE Masse. Er
 * ist ein Hohlraum, und in ihm liegt das, wofür er ausgehoben wird (Rohr,
 * Fundament, Verbau). Solide wäre er ein Klotz, der genau das verdeckt, was
 * er zeigen soll. Ein `IfcEarthworksFill` dagegen IST Material — es wurde
 * hingeschüttet, und es verdeckt zu Recht, was darunter liegt.
 *
 * WARUM DAS GELÄNDE NICHT WEISS IST. Es ist der Bezug, auf dem die Eingriffe
 * lesbar sein müssen — und es ist die grösste Fläche im Bild. Reines Weiss
 * wäre doppelt falsch: es überstrahlt (siehe unten), und es lässt Braun und
 * Grün wie Flecken wirken statt wie Eingriffe in einen Boden.
 *
 * DIE HELLIGKEITSGRENZE IST GERECHNET, NICHT GERATEN. Die Szene leuchtet mit
 * Umgebung 0,30 + Hauptlicht 1,05 + Gegenlicht 0,25 + Himmel 0,15
 * (`IfcBeleuchtung.js`). Eine Fläche, die dem Hauptlicht zugewandt ist,
 * bekommt bis etwa das 1,5-fache ihrer Grundfarbe. Wer darüber landet,
 * CLIPPT — und eine überstrahlte Fläche zeigt gar keine Neigung mehr, das
 * Gegenteil des Ziels (dieselbe Lehre, die schon das Hauptlicht von 2,6 auf
 * 1,05 gebracht hat). Deshalb liegt jede Grundfarbe hier unter 0,67 — im
 * Bild wirken sie deutlich heller, als die Zahlen aussehen.
 *
 * Rein: keine Engine, kein three, kein Vue — nur Zahlen. Das Material baut
 * der Autorenkanal daraus (er hat three), der Lageplan könnte dieselben
 * Werte für seine Flächen nehmen.
 */

/** Grenze, ab der eine Fläche unter voller Beleuchtung überstrahlt. */
export const LICHT_MAX = 1.5;
/** Reserve: kein Kanal soll beleuchtet über diesen Wert kommen. */
export const CLIP_RESERVE = 0.97;

/**
 * Der Katalog — DATEN, nach IFC-Typ. Nach Typ und nicht nach Rolle, damit er
 * auch für GELIEFERTES Material desselben Typs gilt und später als
 * Bürodatensatz überschrieben werden kann (Gesetz 2).
 */
export const BAUTEILFARBEN = Object.freeze({
    // Aushub — erdiges Sandbraun, durchscheinend. Ein Void zeigt, was darin liegt.
    IFCEARTHWORKSCUT:     Object.freeze({ farbe: 0x8a7145, deckkraft: 0.55, titel: 'Aushub' }),
    // Auftrag/Damm — gedämpftes Pastellgrün, solide. Zugeführtes Material.
    IFCEARTHWORKSFILL:    Object.freeze({ farbe: 0x79a06a, deckkraft: 1, titel: 'Auftrag' }),
    // Gewachsenes und geformtes Gelände — warmes Hellbeige als ruhiger Bezug.
    IFCGEOGRAPHICELEMENT: Object.freeze({ farbe: 0xa29a8c, deckkraft: 1, titel: 'Gelände' }),
    // Der Sammeltyp des Erdbaus, wo ein Exporteur ihn benutzt.
    IFCEARTHWORKSELEMENT: Object.freeze({ farbe: 0xa29a8c, deckkraft: 1, titel: 'Erdbau' }),
});

/** Kategorie normieren — Grossschreibung, ohne Leerraum. */
function norm(kategorie) {
    return String(kategorie ?? '').trim().toUpperCase();
}

/**
 * Die Farbe für einen IFC-Typ, oder null.
 * @param {string} kategorie  z. B. 'IFCEARTHWORKSCUT'
 * @param {object} [satz]     Überschreibung (Bürodatensatz)
 */
export function farbeFuer(kategorie, satz = BAUTEILFARBEN) {
    return satz?.[norm(kategorie)] ?? null;
}

/** Die drei Kanäle einer Farbe als 0..1. */
export function kanaele(farbe) {
    const v = Number(farbe) >>> 0;
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255].map(x => x / 255);
}

/**
 * Was three braucht: `{ color, opacity, transparent }`.
 * `transparent` folgt der Deckkraft — ein Material mit Deckkraft 1, das
 * trotzdem als transparent gemeldet wird, kostet eine Sortierung und
 * schreibt keine Tiefe.
 */
export function materialWerte(eintrag) {
    if (!eintrag) return null;
    const deckkraft = Number.isFinite(eintrag.deckkraft) ? Math.min(1, Math.max(0, eintrag.deckkraft)) : 1;
    return { color: eintrag.farbe, opacity: deckkraft, transparent: deckkraft < 1 };
}

/**
 * Überstrahlt diese Farbe unter der Hausbeleuchtung?
 * @returns {boolean} true = mindestens ein Kanal clippt
 */
export function ueberstrahlt(eintrag, licht = LICHT_MAX) {
    if (!eintrag) return false;
    return kanaele(eintrag.farbe).some(k => k * licht > CLIP_RESERVE);
}

/**
 * Trägt dieses gelieferte Bauteil eine EIGENE Farbe?
 *
 * Fabios Regel: was der Planer gefärbt hat, wird nicht stillschweigend
 * übermalt. Die Bibliothek führt die Materialien je Element im
 * `RawItemData` des Editors (`samples[].material` → `materials[id]`) — das
 * ist die einzige Stelle, an der die Farbe eines EINZELNEN Bauteils steht.
 *
 * „Eigene Farbe" heisst: irgendein Material des Bauteils weicht sichtbar vom
 * neutralen Grau ab, mit dem die Bibliothek ungefärbte Elemente lädt. Ein
 * Grauwert (r≈g≈b) gilt als NICHT gefärbt — sonst gälte jedes Standardmodell
 * als farbig und die CDE fragte bei jedem Laden.
 *
 * @param {object} element  RawItemData aus `editor.getElements`
 * @returns {{eigen: boolean, farben: Array<{r,g,b,a}>}}
 */
export function eigeneFarbe(element, { grauschwelle = 0.06 } = {}) {
    const farben = [];
    const materialien = element?.materials ?? {};
    const proben = Object.values(element?.samples ?? {});
    const ids = proben.length
        ? proben.map(s => s?.material).filter(x => x != null)
        : Object.keys(materialien);
    for (const id of ids) {
        const m = materialien[id];
        if (!m) continue;
        const { r = 0, g = 0, b = 0, a = 1 } = m;
        farben.push({ r, g, b, a });
    }
    const bunt = farben.some(({ r, g, b, a }) => {
        const spanne = Math.max(r, g, b) - Math.min(r, g, b);
        return spanne > grauschwelle || a < 0.99;
    });
    return { eigen: bunt, farben };
}
