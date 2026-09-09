/**
 * Die Beleuchtung der Szene — damit ein Erdkörper wie ein Erdkörper aussieht.
 *
 * DER BEFUND (Fabio, 2026-09-09): „müsste man dem Volumenkörper beim Rendern
 * mehr 3D geben, sodass man auch die Kanten besser sieht und Neigungen".
 * Nachgesehen: `SimpleScene.setup()` der Bibliothek stellt UMGEBUNGSLICHT und
 * gerichtetes Licht auf DIESELBE Stärke (je 2). Die Hälfte des Lichts kommt
 * damit aus allen Richtungen zugleich — und richtungsloses Licht macht jede
 * Fläche gleich hell, egal wie sie geneigt ist. Genau das ist Flachheit.
 *
 * WARUM KEINE SCHATTEN. Der naheliegende Gedanke wäre ein Schlagschatten. Für
 * ein Gelände ist er die falsche Antwort: er kostet eine zweite Renderpass,
 * und bei einer fast waagerechten Fläche zeigt er kaum etwas — die Sonne
 * müsste tief stehen, und dann verschluckt der Schatten genau die Böschung,
 * die man sehen will. Was Geländedarstellung seit jeher benutzt, ist die
 * HANGSCHATTIERUNG: die Helligkeit folgt der Neigung gegen eine gedachte
 * Lichtrichtung. Ein gerichtetes Licht tut das von sich aus — man muss ihm
 * nur genug Anteil geben.
 *
 * DIE RICHTUNG kommt aus der Kartografie: Licht von NORDWEST, schräg von
 * oben. Das ist Konvention seit den ersten Reliefkarten, und sie hat einen
 * Grund — das Auge liest von links oben beleuchtete Formen als ERHEBUNG, von
 * rechts unten beleuchtete als Vertiefung. Bei umgekehrtem Licht kippt die
 * Wahrnehmung, und ein Graben sieht aus wie ein Damm.
 *
 * DAS GEGENLICHT ist schwach und kommt von der anderen Seite. Ohne es fielen
 * abgewandte Böschungen ins Schwarze, und eine Grubenwand im Schatten wäre
 * nicht mehr lesbar. Es ersetzt den Anteil, den das Umgebungslicht vorher
 * pauschal geliefert hat — nur eben gerichtet, also formerhaltend.
 *
 * Rein bis auf three: keine Engine, kein Vue.
 */

import * as THREE from 'three';

/**
 * Die Werte. Sie sind bewusst benannt und nicht verstreut — wer die Szene
 * heller oder plastischer will, ändert genau hier.
 */
export const BELEUCHTUNG = Object.freeze({
    /** Richtungsloser Grundanteil. Hoch = flach; die Bibliothek liefert 2. */
    umgebung: 0.30,
    /**
     * Das Hauptlicht aus Nordwest — es macht die Neigungen sichtbar.
     *
     * DIE SUMME ZÄHLT, nicht nur das Verhältnis. Der erste Anlauf gab dem
     * Hauptlicht 2,6 und behielt 0,8 Umgebung: die Seitenwände wurden
     * plastisch, aber die nach oben zeigende Fläche landete weit über Weiss
     * und CLIPPTE — und eine überstrahlte Fläche zeigt gar keine Neigung
     * mehr, das Gegenteil des Ziels. Am Bild abgelesen (2026-09-09): erst
     * unter etwa 1,3 bleibt die Oberseite im Grau und lässt Unterschiede zu.
     */
    haupt: 1.05,
    /** Richtung des Hauptlichts (three-Welt: −z ist Nord, y ist oben). */
    hauptRichtung: Object.freeze({ x: -0.55, y: 0.78, z: -0.30 }),
    /** Das Gegenlicht gegen schwarze Rückseiten — schwach und flacher. */
    gegen: 0.25,
    gegenRichtung: Object.freeze({ x: 0.62, y: 0.34, z: 0.52 }),
    /** Himmel/Boden-Licht: gibt Unterseiten einen Hauch Erdfarbe statt Grau. */
    himmel: 0.15,
});

const NAME_GEGEN = 'cde-gegenlicht';
const NAME_HIMMEL = 'cde-himmelslicht';

/**
 * Die Beleuchtung einer Welt auf Plastizität stellen. Idempotent: zweimal
 * gerufen bleibt es bei einem Gegenlicht (der Viewer baut die Welt beim
 * Hot-Reload neu auf, und doppelte Lichter addieren sich sonst still).
 *
 * @param {object} world  OBC-World mit `scene.three`, `scene.ambientLight`,
 *                        `scene.directionalLight`
 * @param {object} [werte] Überschreibungen einzelner Werte
 * @returns {{umgebung, haupt, gegen}|null} was gesetzt wurde, oder null
 */
export function setzeBeleuchtung(world, werte = {}) {
    const szene = world?.scene?.three ?? null;
    if (!szene) return null;
    const w = { ...BELEUCHTUNG, ...werte };

    // 1 · Das Umgebungslicht herunternehmen — es ist die Ursache der Flachheit.
    const umgebung = world.scene.ambientLight ?? szene.children.find(o => o.isAmbientLight) ?? null;
    if (umgebung) umgebung.intensity = w.umgebung;

    // 2 · Das Hauptlicht verstärken und ausrichten (Nordwest, schräg oben).
    const haupt = world.scene.directionalLight ?? szene.children.find(o => o.isDirectionalLight) ?? null;
    if (haupt) {
        haupt.intensity = w.haupt;
        const r = w.hauptRichtung;
        // Ein DirectionalLight leuchtet von `position` zu `target`; nur die
        // RICHTUNG zählt, nicht der Abstand. Der Betrag ist also frei — er muss
        // nur gross genug sein, dass die Bibliothek ihn nicht als Null liest.
        haupt.position.set(r.x * 100, r.y * 100, r.z * 100);
        if (haupt.target) {
            haupt.target.position.set(0, 0, 0);
            if (!haupt.target.parent) szene.add(haupt.target);
        }
    }

    // 3 · Das Gegenlicht — einmal, mit Namen, damit es wiederfindbar bleibt.
    let gegen = szene.getObjectByName(NAME_GEGEN);
    if (!gegen) {
        gegen = new THREE.DirectionalLight(0xffffff, w.gegen);
        gegen.name = NAME_GEGEN;
        szene.add(gegen);
    }
    gegen.intensity = w.gegen;
    const g = w.gegenRichtung;
    gegen.position.set(g.x * 100, g.y * 100, g.z * 100);

    // 4 · Himmel oben, Erde unten — nimmt Unterseiten das tote Grau.
    let himmel = szene.getObjectByName(NAME_HIMMEL);
    if (!himmel) {
        himmel = new THREE.HemisphereLight(0xdfe9f2, 0x6b6152, w.himmel);
        himmel.name = NAME_HIMMEL;
        szene.add(himmel);
    }
    himmel.intensity = w.himmel;

    return { umgebung: w.umgebung, haupt: w.haupt, gegen: w.gegen };
}

/**
 * Wie stark sich zwei Flächen in ihrer Helligkeit unterscheiden, wenn sie
 * unterschiedlich geneigt sind — das MASS für Plastizität.
 *
 * Rein rechnerisch: der Anteil des gerichteten Lichts am Gesamtlicht. Bei
 * gleich starkem Umgebungs- und Hauptlicht liegt er bei der Hälfte, und eine
 * senkrechte Böschung unterscheidet sich kaum von der waagerechten Sohle.
 * Der Test hält damit fest, dass die Kur wirkt, ohne ein Bild zu vergleichen.
 *
 * @returns {number} 0 = alles gleich hell, 1 = nur Richtungslicht
 */
export function plastizitaet(werte = BELEUCHTUNG) {
    const gerichtet = werte.haupt + werte.gegen;
    const gesamt = gerichtet + werte.umgebung + (werte.himmel ?? 0);
    return gesamt > 0 ? gerichtet / gesamt : 0;
}
