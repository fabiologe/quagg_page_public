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
 *
 * DICHTE (Teil XX, 2026-09-11, im Browser gemessen): die Anzeige des
 * geformten Geländes ist ein 2-m-Raster mit 99 414 Dreiecken. Aus der
 * Draufsicht lagen ihre Kanten 2–3 Bildpunkte auseinander — gewählt
 * verschmolzen sie zu einer VOLLEN Akzentfläche, ungewählt zu einem grauen
 * Schleier. Jetzt misst der Shader JEDE Kante in Bildpunkten (Länge ×
 * Bildpunkte je Meter in ihrer Tiefe): unter PX_AUS verschwindet sie, ab
 * PX_VOLL steht sie ganz — nah sieht man jedes Dreieck, fern die Fläche, und
 * in der Schrägsicht verblassen die fernen Kanten zuerst.
 * Die Zwischenstufe ist GERASTERT (screen-door), nicht durchscheinend: je
 * Dreieck werden drei Kanten gezeichnet, gemeinsame also zweimal —
 * durchscheinend wären innere Kanten dunkler als der Rand. Gerastert trifft
 * das zweite Zeichnen dieselben Bildpunkte, und deckend bleibt deckend.
 * (Entdoppeln hiesse, jede Kante zu hashen: bei einer Million Dreiecken
 * Sekunden auf dem Hauptfaden.)
 *
 * AUSWAHL (Fabio: „das grüne Auswählen sollte weg … ein leichteres
 * Feedback"): ein gewähltes Gelände wird nicht gefüllt. Seine Kanten gehen in
 * den Akzent — nach derselben Dichte-Regel —, und sein UMRISS (Rand- und
 * Knickkanten) steht deckend in der Akzentfarbe. Von fern bleibt so eine
 * Linie ums Gelände statt einer vollen Fläche.
 */
import * as THREE from 'three';
import { basisModelId } from './DeltaBoxen.js';

export const KANTEN_FARBE = '#4b5563';      // Grau, dunkler als jede Geländefläche
export const AUSWAHL_FARBE = '#4fc3f7';     // der Akzent von Geist und Zeiger
/** Kantenlänge in Bildpunkten (CSS): darunter unsichtbar, ab PX_VOLL ganz. Dieselben Zahlen gehen als Uniforms in den Shader. */
export const PX_AUS = 3;
export const PX_VOLL = 10;
const LIFT_MIN = 0.02;                      // m — wie `IfcOverlay.LIFT`
const LIFT_ANTEIL = 1e-4;                   // der Diagonale
/**
 * Deckel des Lifts (Teil XXI, 2026-09-17).
 *
 * `LIFT_ANTEIL` wächst mit der Ausdehnung, weil die Auflösung des
 * Tiefenpuffers es auch tut — bei einem 700-m-Gelände waren das aber 7 cm,
 * und damit schwebte das Netz sichtbar über seiner eigenen Fläche: an einer
 * Böschung stand die Kante neben dem Knick, den sie beschreibt. Drei
 * Zentimeter reichen gegen das Z-Fighting und liegen unter jeder
 * Genauigkeit, die ein Erdbau beansprucht.
 */
export const LIFT_MAX = 0.03;
const MAX_DREIECKE = 1_500_000;             // darüber: keine Kanten, sondern eine Meldung
/** Der Umriss braucht einen Kanten-Hash — er entsteht erst bei der Auswahl, und nur bis hierher. */
const MAX_UMRISS_DREIECKE = 600_000;
/** Knick: zwei Nachbarflächen, die um mehr als 60° gegeneinander stehen (der Deckel eines Erdkörpers an seiner Wand). */
const KNICK_COS = Math.cos(60 * Math.PI / 180);

/** Wie deckend eine Kante von `px` Bildpunkten erscheint — die Regel des Shaders (smoothstep), hier prüfbar. */
export function deckungNachPixel(px) {
    const t = Math.min(1, Math.max(0, (px - PX_AUS) / (PX_VOLL - PX_AUS)));
    return t * t * (3 - 2 * t);
}

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

/** Je Punkt die Länge SEINER Strecke (m) — der Shader rechnet sie in Bildpunkte um. */
export function laengenAus(kanten) {
    const n = Math.floor((kanten?.length ?? 0) / 6);
    const aus = new Float32Array(n * 2);
    for (let s = 0; s < n; s++) {
        const o = s * 6;
        const l = Math.hypot(kanten[o + 3] - kanten[o], kanten[o + 4] - kanten[o + 1], kanten[o + 5] - kanten[o + 2]);
        aus[2 * s] = l; aus[2 * s + 1] = l;
    }
    return aus;
}

/**
 * Der UMRISS eines Netzes: Randkanten (nur EIN Dreieck daran) und
 * Knickkanten (zwei Dreiecke, mehr als 60° gegeneinander — ein geschlossener
 * Erdkörper hat keinen Rand, aber seinen Deckelrand). Das Netz kommt
 * unindiziert; Punkte werden auf Millimeter verschweisst.
 * @returns {Float32Array}  6 Werte je Strecke, um `lift` angehoben
 */
export function umrissAusNetz({ positions, triCount } = {}, { lift = 0 } = {}) {
    const n = Math.max(0, Math.min(triCount | 0, Math.floor((positions?.length ?? 0) / 9)));
    if (!n || n > MAX_UMRISS_DREIECKE) return new Float32Array(0);
    const knoten = new Map();
    const id = new Int32Array(n * 3);
    for (let v = 0; v < n * 3; v++) {
        const o = v * 3;
        const s = `${Math.round(positions[o] * 1000)},${Math.round(positions[o + 1] * 1000)},${Math.round(positions[o + 2] * 1000)}`;
        let k = knoten.get(s);
        if (k === undefined) { k = knoten.size; knoten.set(s, k); }
        id[v] = k;
    }
    const nk = knoten.size;
    const normale = new Float64Array(n * 3);
    for (let t = 0; t < n; t++) {
        const o = t * 9;
        const ax = positions[o + 3] - positions[o], ay = positions[o + 4] - positions[o + 1], az = positions[o + 5] - positions[o + 2];
        const bx = positions[o + 6] - positions[o], by = positions[o + 7] - positions[o + 1], bz = positions[o + 8] - positions[o + 2];
        const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
        const l = Math.hypot(nx, ny, nz) || 1;
        normale[3 * t] = nx / l; normale[3 * t + 1] = ny / l; normale[3 * t + 2] = nz / l;
    }
    const erstes = new Map();       // Kante → t·3 + i (erstes Vorkommen)
    const zweites = new Map();      // Kante → zweites Dreieck, −1 bei mehr als zwei
    for (let t = 0; t < n; t++) {
        for (let i = 0; i < 3; i++) {
            let a = id[3 * t + i], b = id[3 * t + (i + 1) % 3];
            if (a === b) continue;
            if (a > b) { const h = a; a = b; b = h; }
            const s = a * nk + b;
            if (!erstes.has(s)) erstes.set(s, 3 * t + i);
            else zweites.set(s, zweites.has(s) ? -1 : t);
        }
    }
    const aus = [];
    for (const [s, wo] of erstes) {
        const t1 = Math.floor(wo / 3), i = wo % 3;
        const t2 = zweites.get(s);
        if (t2 === -1) continue;                                   // nicht-mannigfaltig: kein Umriss
        if (t2 !== undefined) {
            const dot = normale[3 * t1] * normale[3 * t2] + normale[3 * t1 + 1] * normale[3 * t2 + 1]
                      + normale[3 * t1 + 2] * normale[3 * t2 + 2];
            if (Math.abs(dot) >= KNICK_COS) continue;              // flach genug: innen
        }
        const o = t1 * 9, j = (i + 1) % 3;
        aus.push(positions[o + 3 * i], positions[o + 3 * i + 1] + lift, positions[o + 3 * i + 2],
                 positions[o + 3 * j], positions[o + 3 * j + 1] + lift, positions[o + 3 * j + 2]);
    }
    return Float32Array.from(aus);
}

/** Lift gegen Z-Fighting: mindestens 2 cm, sonst ein Zehntausendstel der Diagonale — höchstens `LIFT_MAX`. */
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
    return Math.min(LIFT_MAX, Math.max(LIFT_MIN, LIFT_ANTEIL * (Number.isFinite(diag) ? diag : 0)));
}

// Bildpunkte je Meter in DIESER Tiefe: perspektivisch halbeHoehe·P[1][1]/w,
// orthografisch ist w = 1 und P[1][1] trägt den Zoom. Mal Kantenlänge = die
// Länge der Kante am Bildschirm (ohne Verkürzung in Blickrichtung).
export const KANTEN_VERTEX = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
attribute float laenge;
uniform float halbeHoehe;
uniform float pxAus;
uniform float pxVoll;
varying float vDeckung;
void main() {
    #include <begin_vertex>
    #include <project_vertex>
    #include <logdepthbuf_vertex>
    #include <clipping_planes_vertex>
    float ppm = halbeHoehe * projectionMatrix[1][1] / max(gl_Position.w, 1e-6);
    vDeckung = smoothstep(pxAus, pxVoll, laenge * ppm);
}`;

// Geordnete 4×4-Rasterung (Bayer): deckend statt durchscheinend.
export const KANTEN_FRAGMENT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
uniform vec3 farbe;
varying float vDeckung;
float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
void main() {
    #include <clipping_planes_fragment>
    if (vDeckung <= bayer4(gl_FragCoord.xy) + 0.03125) discard;
    #include <logdepthbuf_fragment>
    gl_FragColor = vec4(farbe, 1.0);
    #include <colorspace_fragment>
}`;

export class GelaendeKanten {
    /**
     * @param {object}   opt
     * @param {Function} opt.getWorld  () => World (lazy — existiert erst nach `init()`)
     */
    constructor({ getWorld }) {
        this._getWorld = getWorld;
        this._wurzel = null;
        this._linien = new Map();      // schluessel `${modelId}|${localId}` → THREE.LineSegments
        this._netze = new Map();       // schluessel → {netz, lift} — der Umriss entsteht erst bei der Auswahl
        this._umrisse = new Map();     // schluessel → THREE.LineSegments (nur gewählte)
        this._markiert = new Set();    // gewählt: Kanten im Akzent, dazu der Umriss
        this._versteckt = new Set();   // ausgeblendet (Hider): keine Kanten
        this._verborgeneModelle = new Set();   // Auge am Modell aus (Abnahme M2): keine Kanten dieses Modells
        this._materialien = null;
        this._groesse = new THREE.Vector2();
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

    _materialienHolen() {
        if (!this._materialien) {
            const kanten = (farbe) => new THREE.ShaderMaterial({
                uniforms: {
                    farbe: { value: new THREE.Color(farbe) },
                    halbeHoehe: { value: 400 },
                    pxAus: { value: PX_AUS },
                    pxVoll: { value: PX_VOLL },
                },
                vertexShader: KANTEN_VERTEX,
                fragmentShader: KANTEN_FRAGMENT,
                depthTest: true, depthWrite: false,
                // Der Schnitt (IfcSection) setzt Ebenen am Renderer — ein
                // ShaderMaterial folgt ihnen nur mit `clipping`.
                clipping: true,
            });
            this._materialien = {
                normal: kanten(KANTEN_FARBE),
                auswahl: kanten(AUSWAHL_FARBE),
                umriss: new THREE.LineBasicMaterial({ color: new THREE.Color(AUSWAHL_FARBE), depthTest: true, depthWrite: false }),
            };
        }
        return this._materialien;
    }

    _material(markiert) {
        const m = this._materialienHolen();
        return markiert ? m.auswahl : m.normal;
    }

    /** Sichtbar ist eine Kante, wenn weder ihr Bauteil (Hider) noch ihr Modell (Auge) verborgen ist. */
    _sichtbar(schluessel) {
        if (this._versteckt.has(schluessel)) return false;
        const s = String(schluessel);
        return !this._verborgeneModelle.has(basisModelId(s.slice(0, s.lastIndexOf('|'))));
    }

    /** Die Bildhöhe erfährt der Shader je Bild — sie ändert sich mit jedem Umbau der Oberfläche. */
    _vorDemZeichnen = (renderer, _szene, _kamera, _geo, material) => {
        if (!material?.uniforms?.halbeHoehe || typeof renderer?.getSize !== 'function') return;
        renderer.getSize(this._groesse);
        if (this._groesse.y > 0) material.uniforms.halbeHoehe.value = this._groesse.y / 2;
    };

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
        this._umrisseWeg();
        this._netze.clear();
        let kanten = 0;
        for (const [schluessel, netz] of netze ?? []) {
            if (!(netz?.triCount > 0)) continue;
            if (netz.triCount > MAX_DREIECKE) {
                console.info(`[CDE] Geländekanten: ${schluessel} hat ${netz.triCount} Dreiecke — Kanten ausgelassen`);
                continue;
            }
            const lift = liftFuer(netz);
            const strecken = kantenAusNetz(netz, { lift });
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(strecken, 3));
            geo.setAttribute('laenge', new THREE.BufferAttribute(laengenAus(strecken), 1));
            const obj = new THREE.LineSegments(geo, this._material(this._markiert.has(schluessel)));
            obj.name = `gelaende-kanten:${schluessel}`;
            obj.userData.schluessel = schluessel;
            obj.visible = this._sichtbar(schluessel);
            obj.renderOrder = 1;
            obj.onBeforeRender = this._vorDemZeichnen;
            wurzel.add(obj);
            this._linien.set(schluessel, obj);
            this._netze.set(schluessel, { netz, lift });
            kanten += netz.triCount * 3;
        }
        for (const k of this._markiert) this._umrissZeigen(k);
        return kanten;
    }

    _umrissZeigen(schluessel) {
        if (this._umrisse.has(schluessel)) return;
        const eintrag = this._netze.get(schluessel);
        const wurzel = this._wurzelHolen();
        if (!eintrag || !wurzel) return;
        const strecken = umrissAusNetz(eintrag.netz, { lift: eintrag.lift * 1.5 });
        if (!strecken.length) return;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(strecken, 3));
        const obj = new THREE.LineSegments(geo, this._materialienHolen().umriss);
        obj.name = `gelaende-umriss:${schluessel}`;
        obj.userData.umrissVon = schluessel;
        obj.visible = this._sichtbar(schluessel);
        obj.renderOrder = 2;
        wurzel.add(obj);
        this._umrisse.set(schluessel, obj);
    }

    _umrissWeg(schluessel) {
        const obj = this._umrisse.get(schluessel);
        if (!obj) return;
        this._wurzel?.remove(obj);
        obj.geometry.dispose();
        this._umrisse.delete(schluessel);
    }

    _umrisseWeg() {
        for (const k of [...this._umrisse.keys()]) this._umrissWeg(k);
    }

    /** Diese Gelände sind gewählt — Kanten im Akzent, dazu der Umriss. */
    markiere(schluessel = []) {
        for (const k of schluessel) {
            this._markiert.add(k);
            const obj = this._linien.get(k);
            if (obj) obj.material = this._material(true);
            this._umrissZeigen(k);
        }
    }

    /** Nicht mehr gewählt. Unbekannte Schlüssel stören nicht. */
    demarkiere(schluessel = []) {
        for (const k of schluessel) {
            if (!this._markiert.delete(k)) continue;
            const obj = this._linien.get(k);
            if (obj) obj.material = this._material(false);
            this._umrissWeg(k);
        }
    }

    /** Folgt dem Hider: ein ausgeblendetes Gelände zeigt keine Kanten und keinen Umriss. */
    sichtbarkeit(sichtbar, schluessel = []) {
        for (const k of schluessel) {
            if (sichtbar) this._versteckt.delete(k); else this._versteckt.add(k);
            for (const obj of [this._linien.get(k), this._umrisse.get(k)]) if (obj) obj.visible = this._sichtbar(k);
        }
    }

    /** Alles wieder sichtbar (Hider „alle zeigen"). */
    alleSichtbar() {
        this._versteckt.clear();
        for (const [k, obj] of this._linien) obj.visible = this._sichtbar(k);
        for (const [k, obj] of this._umrisse) obj.visible = this._sichtbar(k);
    }

    /**
     * Folgt dem Auge am Modell (Abnahme 2026-09-12, M2): ein verborgenes
     * Modell zeigt keine Kanten — auch nach jedem Neuaufbau, weil `setze`
     * dieselbe Frage stellt. Vorher blieb vom ausgeblendeten Eigenbau ein
     * „Phantom-Gitter“ stehen: die Kanten des geformten Geländes.
     */
    modellSichtbarkeit(modelId, sichtbar) {
        const basis = basisModelId(modelId);
        if (sichtbar) this._verborgeneModelle.delete(basis); else this._verborgeneModelle.add(basis);
        for (const [k, obj] of this._linien) obj.visible = this._sichtbar(k);
        for (const [k, obj] of this._umrisse) obj.visible = this._sichtbar(k);
    }

    dispose() {
        const scene = this._getWorld?.()?.scene?.three;
        for (const obj of this._linien.values()) obj.geometry.dispose();
        this._linien.clear();
        this._umrisseWeg();
        this._netze.clear();
        if (this._materialien) {
            for (const m of Object.values(this._materialien)) m.dispose();
            this._materialien = null;
        }
        if (this._wurzel && scene) scene.remove(this._wurzel);
        this._wurzel = null;
        this._markiert.clear();
        this._versteckt.clear();
    }
}
