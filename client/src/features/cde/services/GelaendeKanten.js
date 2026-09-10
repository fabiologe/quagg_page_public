/**
 * GelaendeKanten — die DREIECKE eines Geländemodells sichtbar (2026-09-10).
 *
 * Fabio: „ein Geländemodell sollte die Kanten der Dreiecke anzeigen, sodass
 * man auch die Genauigkeit sieht". Ein DGM ist ein Dreiecksnetz; wie fein es
 * ist, sagt die schattierte Fläche nicht — erst die Kanten zeigen, ob ein
 * oder zwanzig Meter zwischen zwei Stützpunkten liegen.
 *
 * Gezeichnet werden die ORIGINAL-Dreiecke (Resolver-Form `mesh`), nicht die
 * Oberfläche des Samplers: die rechnet einen geschlossenen Erdkörper zum
 * Höhenfeld um und zeigte dann dessen Raster, nicht die Lieferung.
 *
 * WARUM MIT Tiefentest (anders als `IfcOverlay`): die Kanten liegen AUF der
 * Fläche. Ohne Tiefenpuffer schienen Rückseite und Unterseite durch, und das
 * Netz wäre ein Gewirr. Gegen Z-Fighting ein kleiner Lift nach oben, der mit
 * der Ausdehnung wächst (die Auflösung des Tiefenpuffers tut es auch).
 * DECKEND, nicht durchscheinend: je Dreieck werden drei Kanten gezeichnet,
 * gemeinsame also zweimal — durchscheinend wären innere Kanten dunkler als
 * der Rand. Entdoppeln hiesse, jede Kante zu hashen: bei einer Million
 * Dreiecken Sekunden auf dem Hauptfaden.
 *
 * AUSWAHL (Fabio: „das grüne Auswählen sollte weg"): ein gewähltes Gelände
 * wird nicht mehr gefüllt — seine Kanten wechseln in die Akzentfarbe.
 */
import * as THREE from 'three';

export const KANTEN_FARBE = '#4b5563';      // Grau, dunkler als jede Geländefläche
export const AUSWAHL_FARBE = '#4fc3f7';     // der Akzent von Geist und Zeiger
const LIFT_MIN = 0.02;                      // m — wie `IfcOverlay.LIFT`
const LIFT_ANTEIL = 1e-4;                   // der Diagonale
const MAX_DREIECKE = 1_500_000;             // darüber: keine Kanten, sondern eine Meldung

/**
 * Die Kanten eines (nicht indizierten) Dreiecksnetzes: je Dreieck drei
 * Strecken, um `lift` nach oben (+y) versetzt.
 * @returns {Float32Array}  6 Werte je Strecke
 */
export function kantenAusNetz({ positions, triCount } = {}, { lift = 0 } = {}) {
    const n = Math.max(0, Math.min(triCount | 0, Math.floor((positions?.length ?? 0) / 9)));
    const aus = new Float32Array(n * 18);
    let k = 0;
    for (let t = 0; t < n; t++) {
        const o = t * 9;
        for (const [i, j] of [[0, 3], [3, 6], [6, 0]]) {
            aus[k++] = positions[o + i]; aus[k++] = positions[o + i + 1] + lift; aus[k++] = positions[o + i + 2];
            aus[k++] = positions[o + j]; aus[k++] = positions[o + j + 1] + lift; aus[k++] = positions[o + j + 2];
        }
    }
    return aus;
}

/** Lift gegen Z-Fighting: mindestens 2 cm, sonst ein Zehntausendstel der Diagonale. */
export function liftFuer({ positions } = {}) {
    if (!positions?.length) return LIFT_MIN;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i + 2 < positions.length; i += 3) {
        for (let a = 0; a < 3; a++) {
            const v = positions[i + a];
            if (v < min[a]) min[a] = v;
            if (v > max[a]) max[a] = v;
        }
    }
    const diag = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    return Math.max(LIFT_MIN, LIFT_ANTEIL * (Number.isFinite(diag) ? diag : 0));
}

export class GelaendeKanten {
    /**
     * @param {object}   opt
     * @param {Function} opt.getWorld  () => World (lazy — existiert erst nach `init()`)
     */
    constructor({ getWorld }) {
        this._getWorld = getWorld;
        this._wurzel = null;
        this._linien = new Map();      // schluessel `${modelId}|${localId}` → THREE.LineSegments
        this._markiert = new Set();    // gewählt: Kanten in der Akzentfarbe
        this._versteckt = new Set();   // ausgeblendet (Hider): keine Kanten
        this._materialien = null;
    }

    _wurzelHolen() {
        if (this._wurzel) return this._wurzel;
        const scene = this._getWorld?.()?.scene?.three;
        if (!scene) return null;
        // HMR: eine Wurzel gleichen Namens aus einer früheren Instanz fällt.
        for (const alt of scene.children.filter(o => o.name === 'cde-gelaende-kanten')) {
            alt.traverse(o => o.geometry?.dispose?.());
            scene.remove(alt);
        }
        this._wurzel = new THREE.Group();
        this._wurzel.name = 'cde-gelaende-kanten';
        scene.add(this._wurzel);
        return this._wurzel;
    }

    _material(markiert) {
        if (!this._materialien) {
            const m = (farbe) => new THREE.LineBasicMaterial({ color: new THREE.Color(farbe), depthTest: true, depthWrite: false });
            this._materialien = { normal: m(KANTEN_FARBE), auswahl: m(AUSWAHL_FARBE) };
        }
        return markiert ? this._materialien.auswahl : this._materialien.normal;
    }

    /**
     * Die Kanten GENAU dieser Gelände zeichnen — was vorher stand und fehlt,
     * fällt. Auswahl und Ausblendung gelten über den Neuaufbau hinweg.
     * @param {Map<string, {positions, triCount}>} netze  schluessel → Dreiecksnetz in Welt
     * @returns {number} gezeichnete Kanten
     */
    setze(netze = new Map()) {
        const wurzel = this._wurzelHolen();
        if (!wurzel) return 0;
        for (const obj of this._linien.values()) { wurzel.remove(obj); obj.geometry.dispose(); }
        this._linien.clear();
        let kanten = 0;
        for (const [schluessel, netz] of netze ?? []) {
            if (!(netz?.triCount > 0)) continue;
            if (netz.triCount > MAX_DREIECKE) {
                console.info(`[CDE] Geländekanten: ${schluessel} hat ${netz.triCount} Dreiecke — Kanten ausgelassen`);
                continue;
            }
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(kantenAusNetz(netz, { lift: liftFuer(netz) }), 3));
            const obj = new THREE.LineSegments(geo, this._material(this._markiert.has(schluessel)));
            obj.name = `gelaende-kanten:${schluessel}`;
            obj.userData.schluessel = schluessel;
            obj.visible = !this._versteckt.has(schluessel);
            obj.renderOrder = 1;
            wurzel.add(obj);
            this._linien.set(schluessel, obj);
            kanten += netz.triCount * 3;
        }
        return kanten;
    }

    /** Diese Gelände sind gewählt — ihre Kanten in der Akzentfarbe. */
    markiere(schluessel = []) {
        for (const k of schluessel) {
            this._markiert.add(k);
            const obj = this._linien.get(k);
            if (obj) obj.material = this._material(true);
        }
    }

    /** Nicht mehr gewählt. Unbekannte Schlüssel stören nicht. */
    demarkiere(schluessel = []) {
        for (const k of schluessel) {
            if (!this._markiert.delete(k)) continue;
            const obj = this._linien.get(k);
            if (obj) obj.material = this._material(false);
        }
    }

    /** Folgt dem Hider: ein ausgeblendetes Gelände zeigt keine Kanten. */
    sichtbarkeit(sichtbar, schluessel = []) {
        for (const k of schluessel) {
            if (sichtbar) this._versteckt.delete(k); else this._versteckt.add(k);
            const obj = this._linien.get(k);
            if (obj) obj.visible = !!sichtbar;
        }
    }

    /** Alles wieder sichtbar (Hider „alle zeigen"). */
    alleSichtbar() {
        this._versteckt.clear();
        for (const obj of this._linien.values()) obj.visible = true;
    }

    dispose() {
        const scene = this._getWorld?.()?.scene?.three;
        for (const obj of this._linien.values()) obj.geometry.dispose();
        this._linien.clear();
        if (this._materialien) { this._materialien.normal.dispose(); this._materialien.auswahl.dispose(); this._materialien = null; }
        if (this._wurzel && scene) scene.remove(this._wurzel);
        this._wurzel = null;
        this._markiert.clear();
        this._versteckt.clear();
    }
}
