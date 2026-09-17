/**
 * ErdbauUmrisse — die Fussspur eines Erdkörpers auf dem Gelände (Teil XXI, E2).
 *
 * DER ANLASS. Fabio 2026-09-17: nach einer Auffüllung stehen Aushub,
 * Auffüllung und Netz übereinander, „wodurch es zittert und überlappt und
 * unklar wird, was was ist". Seine Entscheidung: das GELÄNDE gewinnt — es
 * ist deckend und trägt das Bild, die Erdkörper sind durchscheinende
 * Mengenkörper und liegen zwei Zentimeter darunter (`ERDKOERPER_ABSENKUNG`).
 *
 * WAS DANN VON OBEN FEHLT, ist die Aussage „hier wurde etwas gemacht". Genau
 * das ist diese Linie: der Umriss des Körpers in seiner Katalogfarbe, leicht
 * über der Geländeanzeige. Aus der Draufsicht sieht man das Gelände und einen
 * Ring; im Schnitt, von der Seite und im Aushubloch den Körper selbst.
 *
 * WELCHE KANTE. `umrissAusNetz` findet an einem geschlossenen Körper die
 * Knickkanten über 60° — das sind die senkrechten Randwände, also die
 * Fussspur: beim Aushub die Böschungsoberkante, bei der Auffüllung der Fuss.
 * Die Sohl- und Kronenkante (Knick um 34° bei 1 : 1,5) liegt darunter und
 * kommt mit den Böschungskanten (Teil XX, Stufe B).
 *
 * WARUM EINE EIGENE GRUPPE und nicht `GelaendeKanten`: die zeichnet das
 * DREIECKSNETZ eines Geländes mit einem Dichte-Shader, hier geht es um eine
 * einzige Linie je Bauteil in der Farbe des Katalogs. Dieselbe Klasse müsste
 * zwei Fragen beantworten.
 *
 * WARUM MIT Tiefentest, ohne Tiefe zu schreiben: die Linie liegt auf der
 * Geländefläche und soll von ihr verdeckt werden, wo das Gelände davor ist
 * (hinter einer Kuppe). Sie soll aber nichts verdecken, was hinter ihr liegt.
 */
import * as THREE from 'three';
import { ERDKOERPER_ABSENKUNG } from './Bauteilfarben.js';
import { basisModelId } from './DeltaBoxen.js';
import { umrissAusNetz } from './GelaendeKanten.js';

export const UMRISS_GRUPPE = 'cde-erdbau-umrisse';

/**
 * Wie weit der Umriss ÜBER der Geländeanzeige schwebt.
 *
 * Der Körper liegt um `ERDKOERPER_ABSENKUNG` unter ihr; die Linie wird aus
 * SEINEM Netz gezogen und muss deshalb um so viel plus einen Hub steigen,
 * damit sie nicht mit der Anzeige um den Tiefenwert streitet. Zwei
 * Zentimeter: unter jeder Genauigkeit, die ein Erdbau beansprucht, und über
 * dem, was der Tiefenpuffer in dieser Szene auflöst.
 */
export const UMRISS_HUB = 0.02;
export const UMRISS_LIFT = ERDKOERPER_ABSENKUNG + UMRISS_HUB;

/** Darüber kostet der Kanten-Hash mehr, als die Linie wert ist (wie `GelaendeKanten`). */
const MAX_DREIECKE = 600_000;

/**
 * Fertige Polylinien als Strecken, um `lift` angehoben.
 *
 * Die Böschungskanten kommen aus dem Ergebnisraster und liegen damit AUF der
 * Geländeanzeige — sie brauchen nur den Hub darüber, nicht den Ausgleich der
 * Körperabsenkung.
 */
function _ausLinien(eintrag) {
    const linien = eintrag?.linien ?? [];
    const lift = eintrag?.lift ?? UMRISS_HUB;
    const strecken = [];
    for (const l of linien) {
        const p = l?.punkte ?? [];
        if (p.length < 2) continue;
        const bis = l.geschlossen ? p.length : p.length - 1;
        for (let i = 0; i < bis; i++) {
            const a = p[i], b = p[(i + 1) % p.length];
            if (![a?.x, a?.y, a?.z, b?.x, b?.y, b?.z].every(Number.isFinite)) continue;
            strecken.push(a.x, a.y + lift, a.z, b.x, b.y + lift, b.z);
        }
    }
    return strecken.length ? Float32Array.from(strecken) : null;
}

export class ErdbauUmrisse {
    /**
     * @param {object}   opt
     * @param {Function} opt.getWorld  () => World (lazy — existiert erst nach `init()`)
     */
    constructor({ getWorld }) {
        this._getWorld = getWorld;
        this._wurzel = null;
        this._linien = new Map();              // schluessel `${modelId}|${localId}` → THREE.LineSegments
        this._materialien = new Map();         // Farbe (hex) → LineBasicMaterial
        this._versteckt = new Set();
        this._verborgeneModelle = new Set();
    }

    _wurzelHolen() {
        if (this._wurzel) return this._wurzel;
        const scene = this._getWorld?.()?.scene?.three;
        if (!scene) return null;
        // HMR: eine Wurzel gleichen Namens aus einer früheren Instanz fällt.
        for (const alt of scene.children.filter(o => o.name === UMRISS_GRUPPE)) {
            alt.traverse(o => o.geometry?.dispose?.());
            scene.remove(alt);
        }
        this._wurzel = new THREE.Group();
        this._wurzel.name = UMRISS_GRUPPE;
        scene.add(this._wurzel);
        return this._wurzel;
    }

    _material(farbe) {
        const schluessel = Number(farbe) || 0;
        if (!this._materialien.has(schluessel)) {
            this._materialien.set(schluessel, new THREE.LineBasicMaterial({
                color: new THREE.Color(schluessel),
                // Sichtbar bleiben, wo das Gelände hinter der Linie liegt;
                // nichts verdecken, was dahinter steht.
                depthTest: true, depthWrite: false, transparent: false,
            }));
        }
        return this._materialien.get(schluessel);
    }

    _sichtbar(schluessel) {
        if (this._versteckt.has(schluessel)) return false;
        const modelId = String(schluessel).split('|')[0];
        return !this._verborgeneModelle.has(basisModelId(modelId));
    }

    /**
     * Die Umrisse und KANTEN genau dieser Einträge zeichnen — was vorher stand
     * und fehlt, fällt. Ausblendungen gelten über den Neuaufbau hinweg.
     *
     * Ein Eintrag ist entweder ein KÖRPER (`netz` — daraus wird die Fussspur
     * gerechnet) oder eine fertige LINIENSCHAR (`linien` — die Böschungskanten
     * aus `gelaende/Boeschungskanten.js`). Beide gehören in dieselbe Gruppe:
     * sie beschreiben dieselbe Sache, und der Betrachter schaltet sie
     * gemeinsam.
     *
     * @param {Map<string, {netz?, linien?, farbe: number, lift?: number}>} eintraege
     * @returns {number} gezeichnete Strecken
     */
    setze(eintraege = new Map()) {
        const wurzel = this._wurzelHolen();
        if (!wurzel) return 0;
        for (const obj of this._linien.values()) { wurzel.remove(obj); obj.geometry.dispose(); }
        this._linien.clear();
        let strecken = 0;
        for (const [schluessel, eintrag] of eintraege ?? []) {
            const punkte = eintrag?.netz ? this._ausKoerper(eintrag) : _ausLinien(eintrag);
            if (!punkte?.length) continue;
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(punkte, 3));
            const obj = new THREE.LineSegments(geo, this._material(eintrag.farbe));
            obj.name = `erdbau-umriss:${schluessel}`;
            obj.userData.schluessel = schluessel;
            obj.visible = this._sichtbar(schluessel);
            obj.renderOrder = 2;
            wurzel.add(obj);
            this._linien.set(schluessel, obj);
            strecken += punkte.length / 6;
        }
        return strecken;
    }

    /** Die Fussspur eines Körpers — `UMRISS_LIFT` gleicht seine Absenkung mit aus. */
    _ausKoerper(eintrag) {
        const netz = eintrag.netz;
        if (!(netz?.triCount > 0) || netz.triCount > MAX_DREIECKE) return null;
        return umrissAusNetz(netz, { lift: eintrag.lift ?? UMRISS_LIFT });
    }

    /** Folgt dem Hider — und damit auch dem Auge je Vorgang (Teil XXI, E3). */
    sichtbarkeit(sichtbar, schluessel = []) {
        for (const k of schluessel) {
            if (sichtbar) this._versteckt.delete(k); else this._versteckt.add(k);
            const obj = this._linien.get(k);
            if (obj) obj.visible = this._sichtbar(k);
        }
    }

    /** Alles wieder sichtbar (Hider „alle zeigen"). */
    alleSichtbar() {
        this._versteckt.clear();
        for (const [k, obj] of this._linien) obj.visible = this._sichtbar(k);
    }

    /** Folgt dem Auge am Modell — ein verborgener Eigenbau zeigt keine Umrisse. */
    modellSichtbarkeit(modelId, sichtbar) {
        const basis = basisModelId(modelId);
        if (sichtbar) this._verborgeneModelle.delete(basis); else this._verborgeneModelle.add(basis);
        for (const [k, obj] of this._linien) obj.visible = this._sichtbar(k);
    }

    dispose() {
        const scene = this._getWorld?.()?.scene?.three;
        for (const obj of this._linien.values()) obj.geometry.dispose();
        this._linien.clear();
        for (const m of this._materialien.values()) m.dispose();
        this._materialien.clear();
        if (this._wurzel && scene) scene.remove(this._wurzel);
        this._wurzel = null;
        this._versteckt.clear();
        this._verborgeneModelle.clear();
    }
}
