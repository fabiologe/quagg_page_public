/**
 * IfcOverlay — DER EINE Besitzer temporärer Grafik im Raum (Teil XVI, S1).
 *
 * Vorher hingen Messen, Notizen und der Schnitt je selbst in
 * `world.scene.three`, mit je eigener renderOrder (999/1000 gegen 1) und
 * dreimal derselben dispose-Schleife. Für Zeiger, Vorschau, Griffe und Fang
 * käme ein vierter, fünfter, sechster Besitzer dazu — und irgendwann zeichnet
 * einer über den anderen, ohne dass es jemand entschieden hat.
 *
 * Deshalb: EIN Wurzelknoten `cde-overlay`, darunter benannte EBENEN mit
 * fester Reihenfolge, geteilte Materialien je Rolle (nur Geometrien werden
 * entsorgt), und eine Handvoll PRIMITIVE, die alles ausdrücken, was eine
 * Vorschau braucht. Wer etwas zeigen will, gibt Daten; wer three anfasst,
 * ist diese Datei.
 *
 * Hausmuster wie `IfcMeasure`: ES-Klasse, ein Optionsobjekt, die Welt als
 * Getter-Closure (sie existiert erst nach `init()`).
 *
 * WARUM `depthTest: false` überall: die Vorschau liegt oft IM Bauteil oder
 * unter dem Gelände (ein Graben ist ein Loch). Mit Tiefentest wäre sie
 * genau dort unsichtbar, wo sie etwas sagt. Die renderOrder sortiert die
 * Ebenen untereinander; gegen Z-Fighting auf Flächen hilft der kleine Lift
 * (`LIFT`), nicht der Tiefenpuffer.
 */

import * as THREE from 'three';
import { baueAusBauplan } from './Bauteilrezepte.js';

/** Ebenen und ihre renderOrder — die Zahl IST die Reihenfolge, oben gewinnt. */
export const EBENEN = Object.freeze({
    // Die Befunde der eigenen Bauteile (Teil XXX, B7) — ganz unten: Vorschau und Griffe gehen vor.
    befunde: 999,
    // Die Querlinie des Gerinne-Schnitts (Teil XX, Stufe D) — unter der Vorschau.
    querschnitt: 1000,
    vorschau: 1001,
    geist:    1002,
    griffe:   1003,
    fang:     1004,
    zeiger:   1005,
});

/** Lift über der Trefferfläche (m) — gegen Z-Fighting, nicht sichtbar. */
export const LIFT = 0.02;

/** Der Zeiger hält am Bildschirm ungefähr dieselbe Größe: Radius ≈ camDist/DIV. */
const ZEIGER_TEILER = 60;
const ZEIGER_MIN = 0.12;

export class IfcOverlay {
    /**
     * @param {object}   opt
     * @param {Function} opt.getWorld  () => World (lazy)
     */
    constructor({ getWorld }) {
        this._getWorld = getWorld;
        this._wurzel = null;
        this._ebenen = new Map();      // name → THREE.Group
        this._materialien = new Map(); // schlüssel → Material (geteilt)
        this._zeiger = null;           // { gruppe, ring, kreuz }
        this._griffe = new Map();      // key → { kugel, hitbox }  (S4)
        this._zugbild = null;          // Lot + Landescheibe während eines Zugs
        this._geist = null;            // das Geistnetz eines Griff-Zugs (S7)
        this._raycaster = null;
    }

    // ── Geistnetz (S7): das Bauteil selbst folgt dem Zug, 60 fps ───────────
    //
    // flood-3D bewegt beim Zug das Objekt; die CDE fasst das Modell erst beim
    // Loslassen an (Editor, Worker-Roundtrip). Dazwischen läuft DIESES Netz:
    // einmal die zusammengeführte Geometrie des Bauteils (Delta inklusive),
    // dann nur noch `position` — kein Worker, kein Neuaufbau, keine Box.

    /** Ein Geistnetz aufstellen — Weltkoordinaten, verschoben wird über `geistVersetzen`. */
    zeigeGeist({ positions, triCount } = {}, { farbe = '#4fc3f7', opacity = 0.45 } = {}) {
        this.geistLeeren();
        const g = this._ebene('geist');
        if (!g || !positions?.length || !(triCount > 0)) return false;
        const geo = new THREE.BufferGeometry();
        const n = triCount * 9;
        geo.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(positions.subarray ? positions.subarray(0, n) : positions.slice(0, n)), 3));
        geo.computeVertexNormals();
        const mesh = new THREE.Mesh(geo, this._material('flaeche', farbe, { opacity }));
        const kanten = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), this._material('linie', farbe, { opacity: 0.9 }));
        mesh.add(kanten);
        mesh.renderOrder = EBENEN.geist;
        g.add(mesh);
        this._geist = mesh;
        return true;
    }

    /** Das Geistnetz um ein Welt-Delta versetzen (gegen den Aufstellort). */
    geistVersetzen(d) {
        if (!this._geist || !_endlich(d)) return false;
        this._geist.position.set(d.x, d.y, d.z);
        return true;
    }

    geistLeeren() {
        if (!this._geist) return;
        const g = this._ebenen.get('geist');
        _entsorgeGeometrien(this._geist);
        g?.remove(this._geist);
        this._geist = null;
    }

    hatGeist() { return !!this._geist; }

    // ── Aufbau ─────────────────────────────────────────────────────────────

    _wurzelHolen() {
        if (this._wurzel) return this._wurzel;
        const world = this._getWorld?.();
        const scene = world?.scene?.three;
        if (!scene) return null;
        // HMR-Aufräumen: eine Wurzel gleichen Namens aus einer früheren
        // Instanz darf nicht stehen bleiben — sonst zeichnet die alte
        // Vorschau ewig weiter, und niemand hält mehr einen Griff darauf.
        for (const alt of scene.children.filter(o => o.name === 'cde-overlay')) {
            _entsorgeGeometrien(alt);
            scene.remove(alt);
        }
        this._wurzel = new THREE.Group();
        this._wurzel.name = 'cde-overlay';
        scene.add(this._wurzel);
        return this._wurzel;
    }

    _ebene(name) {
        if (!(name in EBENEN)) throw new Error(`IfcOverlay: unbekannte Ebene „${name}"`);
        let g = this._ebenen.get(name);
        if (g) return g;
        const wurzel = this._wurzelHolen();
        if (!wurzel) return null;
        g = new THREE.Group();
        g.name = `cde-overlay:${name}`;
        g.renderOrder = EBENEN[name];
        wurzel.add(g);
        this._ebenen.set(name, g);
        return g;
    }

    /** Geteilte Materialien — je Art und Farbe eines, nie je Primitiv. */
    _material(art, farbe, { opacity = 1 } = {}) {
        const schluessel = `${art}|${farbe}|${opacity}`;
        let m = this._materialien.get(schluessel);
        if (m) return m;
        const color = new THREE.Color(farbe);
        if (art === 'linie') {
            m = new THREE.LineBasicMaterial({ color, depthTest: false, transparent: opacity < 1, opacity });
        } else if (art === 'gestrichelt') {
            m = new THREE.LineDashedMaterial({ color, depthTest: false, transparent: true, opacity,
                                               dashSize: 0.3, gapSize: 0.2 });
        } else {
            m = new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true,
                                              opacity, side: THREE.DoubleSide, polygonOffset: true,
                                              polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
        }
        this._materialien.set(schluessel, m);
        return m;
    }

    // ── Primitive ──────────────────────────────────────────────────────────

    /**
     * Eine Ebene NEU befüllen — was vorher darin lag, fällt.
     *
     * @param {'vorschau'|'griffe'|'fang'} ebene
     * @param {Array<object>} primitive  je `{art, farbe, …}`:
     *   linie     {punkte:[{x,y,z}], gestrichelt?}
     *   umriss    {ring:[{x,y,z}]}                              geschlossen
     *   marke     {punkt, normal?, radius?}                     Ring auf der Fläche
     *   geist     {positions:Float64Array|Float32Array, triCount, opacity?}
     *   box       {min:{x,y,z}, max:{x,y,z}}                    Drahtkasten
     *   versatz   {von:{x,y,z}, nach:{x,y,z}}                   Pfeil
     *   bauplan   {bauplan:{rezept, kategorie, parameter}}       Geist aus dem Rezept (S2)
     *   forderung {linien:[[{x,y,z},…],…]}                       gestrichelte Züge (S2)
     * @returns {number} wie viele Objekte entstanden sind
     */
    zeige(ebene, primitive = []) {
        const g = this._ebene(ebene);
        if (!g) return 0;
        this.leere(ebene);
        let n = 0;
        for (const p of primitive) {
            const o = this._baue(p);
            if (!o) continue;
            o.renderOrder = EBENEN[ebene];
            o.traverse(k => { k.renderOrder = EBENEN[ebene]; });
            g.add(o);
            n++;
        }
        return n;
    }

    /** Alles aus einer Ebene entfernen; Geometrien werden entsorgt, Materialien bleiben. */
    leere(ebene) {
        const g = this._ebenen.get(ebene);
        if (!g) return;
        for (const kind of [...g.children]) {
            _entsorgeGeometrien(kind);
            g.remove(kind);
        }
    }

    _baue(p) {
        const farbe = p?.farbe ?? '#ffffff';
        switch (p?.art) {
            case 'linie': {
                const pts = (p.punkte ?? []).filter(_endlich).map(q => new THREE.Vector3(q.x, q.y, q.z));
                if (pts.length < 2) return null;
                const geo = new THREE.BufferGeometry().setFromPoints(pts);
                const l = new THREE.Line(geo, this._material(p.gestrichelt ? 'gestrichelt' : 'linie', farbe, { opacity: p.opacity ?? 1 }));
                if (p.gestrichelt) l.computeLineDistances();
                return l;
            }
            case 'umriss': {
                const pts = (p.ring ?? []).filter(_endlich).map(q => new THREE.Vector3(q.x, q.y, q.z));
                if (pts.length < 2) return null;
                pts.push(pts[0].clone());
                const geo = new THREE.BufferGeometry().setFromPoints(pts);
                return new THREE.Line(geo, this._material('linie', farbe));
            }
            case 'marke': {
                if (!_endlich(p.punkt)) return null;
                const r = p.radius ?? 0.25;
                const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.7, r, 32), this._material('flaeche', farbe, { opacity: 0.85 }));
                _richteAus(ring, p.punkt, p.normal);
                return ring;
            }
            case 'geist': {
                const pos = p.positions;
                if (!pos?.length || !(p.triCount > 0)) return null;
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(pos.subarray ? pos.subarray(0, p.triCount * 9) : pos), 3));
                geo.computeVertexNormals();
                const mesh = new THREE.Mesh(geo, this._material('flaeche', farbe, { opacity: p.opacity ?? 0.35 }));
                const kanten = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), this._material('linie', farbe, { opacity: 0.9 }));
                mesh.add(kanten);
                return mesh;
            }
            case 'bauplan': {
                // Das Rezept baut die Geometrie — three, darum HIER und nicht in
                // Vorschau.js. Ein untauglicher Bauplan (zu wenig Punkte) ist
                // kein Fehler: dann gibt es einfach noch nichts zu sehen.
                let r = null;
                try { r = baueAusBauplan(p.bauplan ?? {}); } catch { r = null; }
                if (!r?.ok || !r.geometrie) return null;
                const geo = r.geometrie;
                const mesh = new THREE.Mesh(geo, this._material('flaeche', farbe, { opacity: p.opacity ?? 0.4 }));
                mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), this._material('linie', farbe, { opacity: 0.9 })));
                return mesh;
            }
            case 'forderung': {
                const g = new THREE.Group();
                for (const zug of p.linien ?? []) {
                    const pts = (zug ?? []).filter(_endlich).map(q => new THREE.Vector3(q.x, q.y, q.z));
                    if (pts.length < 2) continue;
                    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), this._material('gestrichelt', farbe, { opacity: p.opacity ?? 1 }));
                    l.computeLineDistances();
                    g.add(l);
                }
                return g.children.length ? g : null;
            }
            case 'box': {
                if (!_endlich(p.min) || !_endlich(p.max)) return null;
                const box = new THREE.Box3(new THREE.Vector3(p.min.x, p.min.y, p.min.z), new THREE.Vector3(p.max.x, p.max.y, p.max.z));
                const helfer = new THREE.Box3Helper(box, new THREE.Color(farbe));
                helfer.material.depthTest = false;
                helfer.material.transparent = true;
                helfer.material.opacity = p.opacity ?? 0.9;
                return helfer;
            }
            case 'versatz': {
                if (!_endlich(p.von) || !_endlich(p.nach)) return null;
                const von = new THREE.Vector3(p.von.x, p.von.y, p.von.z);
                const nach = new THREE.Vector3(p.nach.x, p.nach.y, p.nach.z);
                const laenge = von.distanceTo(nach);
                if (!(laenge > 1e-6)) return null;
                const richtung = nach.clone().sub(von).normalize();
                const pfeil = new THREE.ArrowHelper(richtung, von, laenge, new THREE.Color(farbe), Math.min(0.4, laenge * 0.3), Math.min(0.2, laenge * 0.15));
                for (const k of [pfeil.line, pfeil.cone]) { k.material.depthTest = false; k.material.transparent = true; }
                return pfeil;
            }
            default:
                return null;
        }
    }

    // ── Der Zeiger ─────────────────────────────────────────────────────────

    /**
     * Die Zielmarke unter dem Zeiger — Ring + Kreuz IN der Trefferebene.
     *
     * `normal` kommt aus dem Raycast; fehlt sie (Linienrepräsentationen
     * liefern keine), schaut die Marke zur Kamera. Die Grösse folgt der
     * Kameradistanz, damit sie am Bildschirm ungefähr gleich bleibt
     * (dasselbe Rezept wie der Mess-Hovermarker).
     *
     * @param {{punkt:{x,y,z}, normal?:{x,y,z}|null, farbe?:string}|null} z  null = ausblenden
     */
    setzeZeiger(z) {
        if (!z || !_endlich(z.punkt)) {
            if (this._zeiger) this._zeiger.gruppe.visible = false;
            return false;
        }
        const g = this._ebene('zeiger');
        if (!g) return false;
        const farbe = z.farbe ?? '#ffffff';
        if (!this._zeiger || this._zeiger.farbe !== farbe) {
            if (this._zeiger) { _entsorgeGeometrien(this._zeiger.gruppe); g.remove(this._zeiger.gruppe); }
            this._zeiger = this._baueZeiger(farbe);
            this._zeiger.gruppe.renderOrder = EBENEN.zeiger;
            this._zeiger.gruppe.traverse(k => { k.renderOrder = EBENEN.zeiger; });
            g.add(this._zeiger.gruppe);
        }
        const gruppe = this._zeiger.gruppe;
        const cam = this._getWorld?.()?.camera?.three;
        const p = new THREE.Vector3(z.punkt.x, z.punkt.y, z.punkt.z);
        const dist = cam ? cam.position.distanceTo(p) : 30;
        gruppe.scale.setScalar(Math.max(ZEIGER_MIN, dist / ZEIGER_TEILER));
        _richteAus(gruppe, z.punkt, z.normal, cam);
        gruppe.visible = true;
        return true;
    }

    _baueZeiger(farbe) {
        const gruppe = new THREE.Group();
        gruppe.name = 'cde-overlay:zeiger:marke';
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 1, 40), this._material('flaeche', farbe, { opacity: 0.9 }));
        const kreuz = new THREE.LineSegments(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(-1.6, 0, 0), new THREE.Vector3(-0.5, 0, 0),
                new THREE.Vector3(0.5, 0, 0),  new THREE.Vector3(1.6, 0, 0),
                new THREE.Vector3(0, -1.6, 0), new THREE.Vector3(0, -0.5, 0),
                new THREE.Vector3(0, 0.5, 0),  new THREE.Vector3(0, 1.6, 0),
            ]),
            this._material('linie', farbe),
        );
        gruppe.add(ring, kreuz);
        return { gruppe, farbe };
    }

    // ── Griffe (S4) ─────────────────────────────────────────────────────────

    /**
     * Griffe als Kugeln in der Ebene `griffe` — je Griff zusätzlich eine
     * unsichtbare, 10 % grössere Trefferkugel: `visible = false` unterdrückt
     * die Ausgabe, three.js raycastet unsichtbare Objekte aber trotzdem
     * (Muster flood-2D `useControlPointEditor`, kopiert).
     * @param {Array<{key, pos:{x,y,z}, farbe?}>} griffe
     */
    zeigeGriffe(griffe = [], { radius = 'auto', farbe = '#4fc3f7', farbeForderung = '#ffb74d',
                               farbeEntfernen = '#ef5350', farbeEinfuegen = '#66bb6a' } = {}) {
        const g = this._ebene('griffe');
        if (!g) return 0;
        this.leere('griffe');
        this._griffe.clear();
        this._zugbild = null;
        const cam = this._getWorld?.()?.camera?.three ?? null;
        const hoehePx = this._getWorld?.()?.renderer?.three?.domElement?.clientHeight ?? null;
        const rollenFarbe = { entfernen: farbeEntfernen, einfuegen: farbeEinfuegen };
        const gizmoFarbe = { danger: farbeEntfernen, ok: farbeEinfuegen, accent: farbe, warn: farbeForderung };
        for (const gr of griffe) {
            if (!_endlich(gr?.pos)) continue;
            const f = gr.farbe ?? gizmoFarbe[gr.farbrolle] ?? rollenFarbe[gr.rolle] ?? (gr.forderung ? farbeForderung : farbe);
            // FINGERGRÖSSE (Teil XXXI, T2): jeder Griff ist ein HALTER am
            // Griffpunkt, sein Inhalt ist in GRIFFRADIEN gebaut (r = 1). Der
            // Halter trägt den Massstab — bei `radius: 'auto'` rechnet ihn
            // jedes Bild neu aus Kamera und Zeichenfläche, damit der Griff in
            // jeder Zoomstufe GRIFF_PX auf dem Schirm hat. Vorher: einmal beim
            // Anzeigen 1/70 des Abstands, höchstens 50 cm — gemessen 3 px in
            // der Übersicht, 14 px gezoomt (Tabletlauf T0).
            const halter = new THREE.Group();
            halter.position.set(gr.pos.x, gr.pos.y, gr.pos.z);
            halter.scale.setScalar(radius === 'auto' ? griffRadius(cam, gr.pos, { hoehePx }) : radius);
            halter.renderOrder = EBENEN.griffe;
            g.add(halter);
            // DER VERSCHIEBE-GIZMO (K6, Fabio 2026-09-20: „keine Verschiebung
            // mit den Griffpunkten hat funktioniert"): Pfeile und ein
            // Ebenenquadrat statt einer Kugel, deren Achse man erraten musste.
            // Man greift, was man sieht.
            if (gr.form === 'pfeil' || gr.form === 'quadrat') {
                const lokal = { ...gr, pos: { x: 0, y: 0, z: 0 } };
                const teil = gr.form === 'pfeil' ? _pfeil(lokal, 1, f, this) : _quadrat(lokal, 1, f, this);
                for (const k of teil.objekte) { k.renderOrder = EBENEN.griffe; k.traverse?.(x => { x.renderOrder = EBENEN.griffe; }); halter.add(k); }
                if (radius === 'auto') _haeltPixel(halter, teil.sichtbar);
                halter.updateMatrixWorld(true);
                const eintrag = { halter, kugel: teil.sichtbar, hitbox: teil.hitbox, zeigtBei: null,
                                  versteckt: false, strecke: teil.strecke ?? null };
                _folgtDemBlick(eintrag, gr.form === 'pfeil' ? lokal.richtung : null, teil);
                this._griffe.set(gr.key, eintrag);
                continue;
            }
            // TIPP-GRIFFE sind WÜRFEL (S10): sie werden angetippt, nicht gezogen,
            // und die Form sagt es, bevor jemand es ausprobiert. Sie sitzen etwas
            // über ihrem Zug-Griff, damit beide getroffen werden können.
            const tipp = gr.wirkung === 'tipp' || gr.wirkung === 'loesen';     // „Knoten lösen" (T7) ist auch ein Knopf
            const rr = gr.zeigtBei ? 0.72 : 1;
            const geo = tipp ? new THREE.BoxGeometry(rr * 1.7, rr * 1.7, rr * 1.7) : new THREE.SphereGeometry(rr, 14, 14);
            const kugel = new THREE.Mesh(geo, this._material('flaeche', f, { opacity: 0.95 }));
            // NEBENGRIFFE sitzen VERSETZT um ihren Zug-Griff — mehrere an
            // derselben Stelle wären nicht einzeln zu treffen. Der Versatz
            // zählt in Griffradien (der Halter skaliert ihn mit).
            const nv = gr.nebenVersatz ?? (gr.zeigtBei ? { x: 0, y: 2.2 } : null);
            if (nv) kugel.position.set(nv.x ?? 0, nv.y ?? 0, nv.z ?? 0);
            kugel.userData.griffKey = gr.key;
            // Die Trefferfläche hat TREFFER_PX auf dem Schirm — auch am kleinen
            // Nebengriff (der Finger ist nicht kleiner, weil der Griff es ist).
            const hitbox = new THREE.Mesh(new THREE.SphereGeometry(TREFFER, 8, 6), this._material('flaeche', f, { opacity: 0 }));
            hitbox.visible = false;
            hitbox.position.copy(kugel.position);
            hitbox.userData.griffKey = gr.key;
            for (const k of [kugel, hitbox]) k.renderOrder = EBENEN.griffe;
            halter.add(kugel, hitbox);
            if (radius === 'auto') _haeltPixel(halter, kugel);
            halter.updateMatrixWorld(true);
            // NEBENGRIFFE (`zeigtBei`) bleiben verborgen, bis der Zeiger auf
            // ihrem Zug-Griff steht — an einer Fläche mit zehn Ecken stünden
            // sonst vierzig Marken zugleich im Bild.
            const eintrag = { halter, kugel, hitbox, zeigtBei: gr.zeigtBei ?? null, versteckt: !!gr.zeigtBei, strecke: null };
            if (eintrag.versteckt) kugel.visible = false;
            this._griffe.set(gr.key, eintrag);
        }
        return this._griffe.size;
    }

    /**
     * Welcher Griff liegt unter dem Zeiger? — key oder null. Verborgene zählen nicht.
     *
     * Trifft der Strahl einen SICHTBAREN Griff, gilt der. Trifft er nur
     * Trefferflächen (44 px, T2 — sie überlappen bei nahen Griffen), gewinnt
     * der Griff, der auf dem SCHIRM am nächsten liegt, nicht der, dessen
     * Hülse zufällig näher an der Kamera steht.
     */
    griffUnter(clientX, clientY) {
        if (!this._griffe.size) return null;
        const strahl = this._raycasterFuer(clientX, clientY);
        if (!strahl) return null;
        const ziele = [];
        for (const e of this._griffe.values()) {
            if (e.versteckt) continue;
            ziele.push(e.kugel, e.hitbox);
        }
        if (!ziele.length) return null;
        const treffer = strahl.intersectObjects(ziele, false);
        if (!treffer.length) return null;
        const direkt = treffer.find(t => t.object.visible !== false);
        if (direkt) return direkt.object.userData.griffKey ?? null;
        let best = null, bestAbstand = Infinity;
        for (const t of treffer) {
            const key = t.object.userData.griffKey;
            const e = this._griffe.get(key);
            if (!e) continue;
            const a = _bildAbstand(strahl, e);
            if (a < bestAbstand) { bestAbstand = a; best = key; }
        }
        return best;
    }

    /**
     * Einen Griff vergrössern (Hover/Zug) — alle anderen normal. Dabei werden
     * seine NEBENGRIFFE sichtbar (und die aller anderen wieder verborgen);
     * steht der Zeiger auf einem Nebengriff, bleibt seine Gruppe offen.
     */
    griffHervorheben(key) {
        const offen = this._griffe.get(key)?.zeigtBei ?? key ?? null;
        for (const [k, e] of this._griffe) {
            e.kugel.scale.setScalar(k === key ? 1.5 : 1);
            if (!e.zeigtBei) continue;
            const zeigen = e.zeigtBei === offen || k === key;
            e.versteckt = !zeigen;
            e.kugel.visible = zeigen;
        }
    }

    /** Einen Griff an eine neue Lage setzen (während des Zugs). */
    griffVersetzen(key, pos) {
        const g = this._griffe.get(key);
        if (!g || !_endlich(pos)) return false;
        g.halter.position.set(pos.x, pos.y, pos.z);
        g.halter.updateMatrixWorld(true);
        return true;
    }

    /**
     * Lot + Landescheibe unter dem gezogenen Griff: „wo setzt der Punkt
     * auf?" — in einer perspektivischen Ansicht die einzige Tiefeninformation
     * (flood-2D-Muster). `null` blendet aus.
     * @param {{pos:{x,y,z}, boden:number|null, farbe?:string}|null} z
     */
    zeigeZugbild(z) {
        const g = this._ebene('griffe');
        if (!g) return;
        if (this._zugbild) { _entsorgeGeometrien(this._zugbild); g.remove(this._zugbild); this._zugbild = null; }
        if (!z || !_endlich(z.pos) || !Number.isFinite(z.boden)) return;
        const farbe = z.farbe ?? '#ffffff';
        const gruppe = new THREE.Group();
        const scheibe = new THREE.Mesh(new THREE.CircleGeometry(0.35, 20), this._material('flaeche', farbe, { opacity: 0.35 }));
        scheibe.rotation.x = -Math.PI / 2;
        scheibe.position.set(z.pos.x, z.boden + LIFT, z.pos.z);
        const lot = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(z.pos.x, z.pos.y, z.pos.z), new THREE.Vector3(z.pos.x, z.boden, z.pos.z)]),
            this._material('gestrichelt', farbe, { opacity: 0.7 }),
        );
        lot.computeLineDistances();
        gruppe.add(scheibe, lot);
        gruppe.traverse(k => { k.renderOrder = EBENEN.griffe; });
        g.add(gruppe);
        this._zugbild = gruppe;
    }

    /** Der Sehstrahl unter einem Bildschirmpunkt — Welt, {origin, direction}. */
    strahl(clientX, clientY) {
        const r = this._raycasterFuer(clientX, clientY);
        if (!r) return null;
        return {
            origin: { x: r.ray.origin.x, y: r.ray.origin.y, z: r.ray.origin.z },
            direction: { x: r.ray.direction.x, y: r.ray.direction.y, z: r.ray.direction.z },
        };
    }

    /** Die Blickrichtung der Kamera — für die senkrechte Ziehebene. */
    blickrichtung() {
        const cam = this._getWorld?.()?.camera?.three;
        if (!cam) return null;
        const d = cam.getWorldDirection(new THREE.Vector3());
        return { x: d.x, y: d.y, z: d.z };
    }

    _raycasterFuer(clientX, clientY) {
        const world = this._getWorld?.();
        const cam = world?.camera?.three;
        const dom = world?.renderer?.three?.domElement;
        if (!cam || !dom?.getBoundingClientRect) return null;
        const r = dom.getBoundingClientRect();
        if (!(r.width > 0 && r.height > 0)) return null;
        const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -(((clientY - r.top) / r.height) * 2 - 1));
        this._raycaster ??= new THREE.Raycaster();
        this._raycaster.setFromCamera(ndc, cam);
        return this._raycaster;
    }

    /** Was gerade in einer Ebene liegt — für Tests und Diagnose. */
    anzahl(ebene) { return this._ebenen.get(ebene)?.children.length ?? 0; }

    dispose() {
        this._griffe.clear();
        this._zugbild = null;
        this._geist = null;
        for (const name of this._ebenen.keys()) this.leere(name);
        if (this._zeiger) { _entsorgeGeometrien(this._zeiger.gruppe); this._zeiger = null; }
        for (const m of this._materialien.values()) m.dispose?.();
        this._materialien.clear();
        const scene = this._getWorld?.()?.scene?.three;
        if (this._wurzel && scene) scene.remove(this._wurzel);
        this._wurzel = null;
        this._ebenen.clear();
    }
}

// ── Helfer ────────────────────────────────────────────────────────────────

const _Z = new THREE.Vector3(0, 0, 1);

/** Ein XY-flaches Objekt an einen Punkt legen und seine Z-Achse auf die Normale drehen. */
function _richteAus(objekt, punkt, normal, cam = null) {
    const n = (normal && Number.isFinite(normal.x) && Number.isFinite(normal.y) && Number.isFinite(normal.z)
        && (normal.x || normal.y || normal.z))
        ? new THREE.Vector3(normal.x, normal.y, normal.z).normalize()
        : null;
    if (n) {
        objekt.quaternion.setFromUnitVectors(_Z, n);
        objekt.position.set(punkt.x + n.x * LIFT, punkt.y + n.y * LIFT, punkt.z + n.z * LIFT);
    } else {
        objekt.position.set(punkt.x, punkt.y, punkt.z);
        if (cam) objekt.lookAt(cam.position);
    }
}

function _entsorgeGeometrien(o) {
    o.traverse?.(k => { k.geometry?.dispose?.(); });
    // Helfer-Objekte (Box3Helper, ArrowHelper) tragen eigene Materialien —
    // die gehören nur ihnen und fallen mit.
    if (o.isBox3Helper || o.isArrowHelper) o.traverse?.(k => { k.material?.dispose?.(); });
}

function _endlich(p) {
    return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}

/**
 * Ein GIZMO-PFEIL: Schaft und Spitze entlang `richtung`, dazu eine
 * unsichtbare Trefferhülse, die grosszügiger ist als das Bild (T4-Regel —
 * auf dem Finger trifft man sonst nichts).
 */
function _pfeil(gr, r, farbe, overlay) {
    const laenge = r * GIZMO_LAENGE;
    const dicke = r * 0.18;
    const richtung = new THREE.Vector3(gr.richtung.x, gr.richtung.y, gr.richtung.z).normalize();
    const mitte = new THREE.Vector3(gr.pos.x, gr.pos.y, gr.pos.z).addScaledVector(richtung, laenge / 2);
    const material = overlay._material('flaeche', farbe, { opacity: 0.95 });

    const gruppe = new THREE.Group();
    const schaft = new THREE.Mesh(new THREE.CylinderGeometry(dicke, dicke, laenge, 10), material);
    const spitze = new THREE.Mesh(new THREE.ConeGeometry(dicke * 2.6, laenge * 0.28, 12), material);
    spitze.position.y = laenge / 2;
    gruppe.add(schaft, spitze);
    // Der Zylinder liegt in +Y; auf die Achse drehen.
    gruppe.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), richtung);
    gruppe.position.copy(mitte);
    gruppe.traverse(k => { k.userData.griffKey = gr.key; });

    const hitbox = new THREE.Mesh(new THREE.CylinderGeometry(r * TREFFER, r * TREFFER, laenge * 1.15, 8),
                                  overlay._material('flaeche', farbe, { opacity: 0 }));
    hitbox.visible = false;
    hitbox.quaternion.copy(gruppe.quaternion);
    hitbox.position.copy(mitte);
    hitbox.userData.griffKey = gr.key;
    // Die Achse des Pfeils (im Halter) — `griffUnter` misst den Bildabstand zu ihr.
    const ursprung = new THREE.Vector3(gr.pos.x, gr.pos.y, gr.pos.z);
    const strecke = [ursprung, ursprung.clone().addScaledVector(richtung, laenge)];
    return { objekte: [gruppe, hitbox], sichtbar: gruppe, hitbox, strecke };
}

/** Das EBENENQUADRAT: waagerecht, vom Ursprung abgesetzt, mit Rand. */
function _quadrat(gr, r, farbe, overlay) {
    const kante = r * GIZMO_LAENGE * 0.34;
    const ab = r * GIZMO_LAENGE * 0.30;
    const mitte = new THREE.Vector3(gr.pos.x + ab + kante / 2, gr.pos.y, gr.pos.z - ab - kante / 2);

    const gruppe = new THREE.Group();
    const flaeche = new THREE.Mesh(new THREE.PlaneGeometry(kante, kante), overlay._material('flaeche', farbe, { opacity: 0.3 }));
    flaeche.rotation.x = -Math.PI / 2;
    const rand = new THREE.LineSegments(new THREE.EdgesGeometry(flaeche.geometry), overlay._material('linie', farbe, { opacity: 0.95 }));
    rand.rotation.x = -Math.PI / 2;
    gruppe.add(flaeche, rand);
    gruppe.position.copy(mitte);
    gruppe.traverse(k => { k.userData.griffKey = gr.key; });

    const seite = Math.max(kante * 1.3, 2 * r * TREFFER);
    const hitbox = new THREE.Mesh(new THREE.PlaneGeometry(seite, seite), overlay._material('flaeche', farbe, { opacity: 0 }));
    hitbox.rotation.x = -Math.PI / 2;
    hitbox.visible = false;
    hitbox.position.copy(mitte);
    hitbox.userData.griffKey = gr.key;
    return { objekte: [gruppe, hitbox], sichtbar: gruppe, hitbox };
}

/**
 * DER GIZMO BEI FLACHEM BLICK (Teil XXXII, R2 — Tabletlauf T9: der Nord-Pfeil und das Ebenenquadrat schrumpfen fast
 * auf null, sobald man von der Seite schaut). Rein: aus der Blickrichtung (Einheitsvektor) und der Achse eines Pfeils.
 *
 * - Ein PFEIL, der fast in die Tiefe zeigt (sichtbarer Anteil unter `PFEIL_SICHTBAR_AB`), wird ausgeblendet — er wäre
 *   ein Punkt, den man trifft, ohne zu sehen, wohin er zieht. Die beiden anderen Achsen bleiben.
 * - Das QUADRAT liegt waagerecht; ist der Blick flacher als `QUADRAT_KIPPT_AB`, stellt es sich zur Kamera. Es zieht
 *   weiter in der Waagerechten (der Zug rechnet dann aus dem Bildschirm, `deltaXZAusSchirm`) — nur das Bild kippt.
 */
export const PFEIL_SICHTBAR_AB = 0.3;
export const QUADRAT_KIPPT_AB = 0.35;
export function gizmoImBlick(blick, richtung = null) {
    const l = Math.hypot(blick?.x ?? 0, blick?.y ?? 0, blick?.z ?? 0) || 1;
    if (richtung) {
        const r = Math.hypot(richtung.x, richtung.y, richtung.z) || 1;
        const c = (blick.x * richtung.x + blick.y * richtung.y + blick.z * richtung.z) / (l * r);
        return { sichtbar: Math.sqrt(Math.max(0, 1 - c * c)) >= PFEIL_SICHTBAR_AB, flach: false };
    }
    return { sichtbar: true, flach: Math.abs((blick?.y ?? 0) / l) < QUADRAT_KIPPT_AB };
}

const _blick = new THREE.Vector3();
const _rechts = new THREE.Vector3();
const _OBEN = new THREE.Vector3(0, 1, 0);
const _gekippt = new THREE.Quaternion();
const _nachKamera = new THREE.Vector3();
/**
 * Je Bild: Pfeil zeigen oder verbergen, Quadrat legen oder stellen. Ein verborgener Pfeil schrumpft (statt
 * `visible = false`), damit sein `onBeforeRender` weiterläuft und ihn wieder zeigt, sobald sich der Blick dreht;
 * `versteckt` nimmt ihn aus der Trefferprüfung.
 */
function _folgtDemBlick(eintrag, richtung, teil) {
    const gruppe = teil.sichtbar;
    const lage = { position: gruppe.position.clone(), quaternion: gruppe.quaternion.clone() };
    const vorher = halte => {
        const alt = gruppe.children[0]?.onBeforeRender;
        return (renderer, scene, camera, ...rest) => {
            alt?.call(gruppe.children[0], renderer, scene, camera, ...rest);
            halte(camera);
        };
    };
    const folge = vorher((camera) => {
        camera.getWorldDirection(_blick);
        const { sichtbar, flach } = gizmoImBlick(_blick, richtung);
        if (richtung) {
            eintrag.versteckt = !sichtbar;
            gruppe.scale.setScalar(sichtbar ? 1 : 1e-3);
            return;
        }
        if (!flach) {
            gruppe.position.copy(lage.position); gruppe.quaternion.copy(lage.quaternion);
            teil.hitbox.position.copy(lage.position); teil.hitbox.quaternion.copy(_gekippt.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)));
            return;
        }
        // Gestellt: in der Ebene aus „rechts im Bild" (waagerecht) und „oben" — beide Kanten bleiben sichtbar.
        _rechts.crossVectors(_blick, _OBEN).normalize();
        const ab = Math.hypot(lage.position.x, lage.position.z) / Math.SQRT2;
        gruppe.position.copy(_rechts).multiplyScalar(ab).addScaledVector(_OBEN, ab);
        _nachKamera.copy(_blick).negate();
        gruppe.quaternion.setFromUnitVectors(_OBEN, _nachKamera);
        teil.hitbox.position.copy(gruppe.position);
        teil.hitbox.quaternion.copy(gruppe.quaternion).multiply(_gekippt.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)));
    });
    gruppe.children[0].onBeforeRender = folge;
}

/** Wie lang ein Gizmo-Pfeil im Verhältnis zum Griffradius ist. */
export const GIZMO_LAENGE = 6;
/**
 * Griffgrösse in BILDSCHIRMPIXELN (Teil XXXI, T2 — Tabletlauf T0: 3 px in der
 * Übersicht, 14 px gezoomt; Ziel ≥ 24 px sichtbar, ≥ 44 px Trefferfläche auf
 * dem Finger, Apple HIG / Material 44–48 pt).
 * GRIFF_PX ist der RADIUS des sichtbaren Griffs, TREFFER_PX der seiner Hülse.
 */
export const GRIFF_PX = 12;
export const TREFFER_PX = 22;
/** Trefferhülse in Griffradien. */
const TREFFER = TREFFER_PX / GRIFF_PX;

/**
 * Wie viele Meter ein Bildschirmpixel am Ort `pos` misst — perspektivisch aus
 * der TIEFE entlang der Blickachse (nicht dem Abstand: am Bildrand wäre der
 * Griff sonst zu gross), orthografisch aus dem Sichtfenster. `null`, wenn es
 * sich nicht sagen lässt (keine Kamera, keine Zeichenfläche, Punkt hinter der
 * Kamera).
 */
export function weltJePixel(cam, pos, hoehePx) {
    if (!cam || !(hoehePx > 0)) return null;
    const zoom = cam.zoom > 0 ? cam.zoom : 1;
    if (cam.isOrthographicCamera) {
        const h = (cam.top - cam.bottom) / zoom;
        return h > 0 ? h / hoehePx : null;
    }
    if (!cam.position || !_endlich(pos)) return null;
    const v = new THREE.Vector3(pos.x - cam.position.x, pos.y - cam.position.y, pos.z - cam.position.z);
    const blick = cam.getWorldDirection ? cam.getWorldDirection(new THREE.Vector3()) : null;
    const tiefe = blick ? v.dot(blick) : v.length();
    if (!(tiefe > 1e-6)) return null;
    const fov = (Number.isFinite(cam.fov) ? cam.fov : 50) * Math.PI / 180;
    return (2 * tiefe * Math.tan(fov / 2)) / zoom / hoehePx;
}

/**
 * Griffradius in METERN, der am Ort `pos` `px` Bildschirmpixel ergibt.
 * Ohne Kamera oder Zeichenfläche (Tests, Plan) 0,25 m.
 */
export function griffRadius(cam, pos, { px = GRIFF_PX, hoehePx = null } = {}) {
    const w = weltJePixel(cam, pos, hoehePx);
    return w ? px * w : 0.25;
}

const _halterOrt = new THREE.Vector3();

/**
 * Hält einen Griff-Halter jedes Bild auf GRIFF_PX: der sichtbare Teil rechnet
 * vor seiner Ausgabe den Massstab aus der Kamera, mit der gerade gezeichnet
 * wird. Die (unsichtbare) Hülse hängt am selben Halter und wächst mit — das
 * Ziel des Fingers ist immer so gross wie das Bild es verspricht.
 */
function _haeltPixel(halter, sichtbar) {
    const halte = (renderer, _scene, camera) => {
        const h = renderer?.domElement?.clientHeight;
        halter.getWorldPosition(_halterOrt);
        const w = weltJePixel(camera, _halterOrt, h);
        if (!w) return;
        const s = GRIFF_PX * w;
        if (Math.abs(halter.scale.x - s) <= s * 1e-3) return;
        halter.scale.setScalar(s);
        halter.updateMatrixWorld(true);
    };
    sichtbar.traverse?.(k => { if (k.isMesh || k.isLine) k.onBeforeRender = halte; });
}

/**
 * Wie weit ein Griff auf dem SCHIRM vom Zeigestrahl liegt — als Winkel
 * (perspektivisch) bzw. Abstand (orthografisch); nur zum Vergleichen.
 * Ein Pfeil misst zu seiner Achse, alle anderen zu ihrer Hülse.
 */
function _bildAbstand(strahl, e) {
    const ray = strahl.ray;
    let punkt;
    if (e.strecke) {
        const a = e.halter.localToWorld(e.strecke[0].clone());
        const b = e.halter.localToWorld(e.strecke[1].clone());
        punkt = new THREE.Vector3();
        ray.distanceSqToSegment(a, b, null, punkt);
    } else {
        punkt = e.hitbox.getWorldPosition(new THREE.Vector3());
    }
    const quer = ray.distanceToPoint(punkt);
    const tiefe = punkt.clone().sub(ray.origin).dot(ray.direction);
    return strahl.camera?.isOrthographicCamera || !(tiefe > 1e-6) ? quer : quer / tiefe;
}

