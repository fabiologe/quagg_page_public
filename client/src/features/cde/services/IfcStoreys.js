/**
 * Raumstruktur und Geschosse (Sprint I, Stufe 5).
 *
 * Baumlauf ueber die IFC-Raumhierarchie, Sichtbarkeit je Geschoss und das
 * Anfahren eines Geschosses. Ein exklusives Feld (`_storeyElementCache`).
 *
 * `gotoStorey` fasst zwei fremde Belange an — die Kamera (einpassen) und die
 * Schnittebene (waagerechter Schnitt ueber dem Boden). Beide kommen als
 * Referenz herein, statt hier nachgebaut zu werden; das ist der Rueckkanal-
 * Vertrag des Hauses. Moeglich wurde das erst, nachdem der Schnitt
 * `placeSectionAt` bekam: vorher griff diese Stelle direkt in `_planePivot`.
 *
 * Der Cache ist bewusst lazy: viele Modelle haben gar keine Geschosse, und
 * der Baumlauf ist auf grossen Modellen nicht gratis.
 */

import * as OBC from '@thatopen/components';
import * as THREE from 'three';
import { istDeltaModell } from './DeltaBoxen.js';
import { CDE_MODELL_ID } from './IfcAutor.js';

export class IfcStoreys {
    /**
     * @param {object}   opt
     * @param {object}   opt.components  OBC.Components
     * @param {Function} opt.fitToBox    (box, opts) => Promise  — Kamera
     * @param {object}   opt.schnitt     IfcSection
     * @param {Function} [opt.quelleVon] modelId => IfcQuelle — Name und Höhe je Geschoss
     */
    constructor({ components, fitToBox, schnitt, quelleVon = null }) {
        this._components = components;
        this._fitToBox = fitToBox;
        this._schnitt = schnitt;
        this._quelleVon = quelleVon;
        this._storeyElementCache = null;
    }

    async getSpatialTree() {
        const fragments = this._components.get(OBC.FragmentsManager);
        const model = [...fragments.list.values()][0];
        if (!model) return null;
        return model.getSpatialStructure();
    }

    /**
     * Die Raumgliederung JEDES geladenen Modells (Fahrplan Erdbau-Container, Stufe 8).
     *
     * `getSpatialTree` nimmt das erste Modell — so bleibt es für die DIN-277-Einordnung
     * des Cockpits. Die Bauwerksstruktur braucht alle. Delta-Modelle (Bearbeitungen,
     * keine Dateien) bleiben draußen, wie in `getModelList`.
     *
     * @returns {Promise<Array<{modelId: string, name: string, wurzel: object|null}>>}
     */
    async getSpatialTrees() {
        const fragments = this._components.get(OBC.FragmentsManager);
        const aus = [];
        for (const model of fragments.list.values()) {
            // Das Eigenbau-Modell hat keine Raumgliederung — seine Teile stehen
            // im Delta, ohne Einordnung. Seinen Abschnitt baut der Viewer aus
            // dem Verlauf (`Bauwerksstruktur.eigenbauBaum`, Abnahme 2026-09-12, A7).
            if (istDeltaModell(model.modelId) || model.modelId === CDE_MODELL_ID) continue;
            let wurzel = null;
            try { wurzel = await model.getSpatialStructure(); } catch { /* ohne Raumgliederung */ }
            aus.push({ modelId: model.modelId, name: model.name ?? model.modelId, wurzel });
        }
        return aus;
    }

    /**
     * Alle Element-localIds einer Ebene (Sprint U, AP-U5).
     *
     * `hider.set` auf den Geschoss-Knoten allein blendet dessen Inhalt nicht
     * zuverlässig aus — die Elemente hängen als Nachfahren darunter. Der
     * Baumlauf sammelt sie (Muster wie Din277Classifier._buildStoreyIndex)
     * und merkt sich das Ergebnis je Modell/Ebene.
     */
    async getStoreyElements(modelId, storeyLocalId) {
        if (!this._storeyElementCache) this._storeyElementCache = new Map();
        const key = `${modelId}|${storeyLocalId}`;
        if (this._storeyElementCache.has(key)) return this._storeyElementCache.get(key);

        const fragments = this._components.get(OBC.FragmentsManager);
        const model = fragments.list.get(modelId) ?? [...fragments.list.values()][0];
        if (!model) return [];

        let tree = null;
        try { tree = await model.getSpatialStructure(); } catch { return []; }

        const ids = [];
        const sammle = (node) => {
            if (!node) return;
            if (node.localId != null) ids.push(node.localId);
            for (const c of (node.children ?? [])) sammle(c);
        };
        const suche = (node) => {
            if (!node) return false;
            if (node.localId === storeyLocalId) { sammle(node); return true; }
            for (const c of (node.children ?? [])) {
                if (suche(c)) return true;
            }
            return false;
        };
        suche(tree);

        this._storeyElementCache.set(key, ids);
        return ids;
    }

    /**
     * Sichtbarkeit einer Ebene schalten.
     * `modelId` ist seit Sprint U durchgereicht — vorher griff die Funktion
     * hart auf das ERSTE Modell zu und ignorierte alle weiteren.
     */
    async setStoreyVisible(localId, visible, modelId = null) {
        const fragments = this._components.get(OBC.FragmentsManager);
        const model = (modelId != null ? fragments.list.get(modelId) : null)
                   ?? [...fragments.list.values()][0];
        if (!model) return;
        const ids = await this.getStoreyElements(model.modelId, localId);
        const hider = this._components.get(OBC.Hider);
        const karte = { [model.modelId]: ids.length ? ids : [localId] };
        // Bearbeitetes und Erzeugtes zeichnet das DELTA (`DeltaBoxen.js`) — es
        // schaltet mit, sonst blieb ein Eigenbau-Teil trotz Auge stehen.
        if (model.deltaModelId && fragments.list.has(model.deltaModelId)) karte[model.deltaModelId] = karte[model.modelId];
        await hider.set(visible, karte);
    }

    /**
     * Collect all storeys across loaded models with their elevation (m) and bounding-box.
     * Returns [] for models without storey structure (e.g. infrastructure).
     */
    async getStoreyList() {
        const fragments = this._components.get(OBC.FragmentsManager);
        const ifcLoader = this._components.get(OBC.IfcLoader);
        const webIfc    = ifcLoader?.webIfc;
        if (!fragments.list.size) return [];

        const storeys = [];
        for (const model of fragments.list.values()) {
            let tree;
            try { tree = await model.getSpatialStructure(); } catch { continue; }
            if (!tree) continue;

            // Recursively find all IFCBUILDINGSTOREY nodes
            const found = [];
            const walk = (node) => {
                if (!node) return;
                if ((node.category ?? '').toUpperCase() === 'IFCBUILDINGSTOREY') found.push(node);
                for (const c of node.children ?? []) walk(c);
            };
            walk(tree);

            for (const node of found) {
                // Name und Höhe aus der IfcQuelle DIESES Modells (Fahrplan Erdbau-Container,
                // Stufe 8). Bis dahin las die Liste `GetLine(0, …)` — Modell 0 für jedes
                // Modell — und `node.name`, den fragments nie setzt: jedes Geschoss hieß
                // „Storey <localId>". Ohne Quelle bleibt der alte Weg.
                let elevation = null;
                let name = '';
                const zeile = this._quelleVon?.(model.modelId)?.zeile?.(node.localId) ?? null;
                if (zeile) {
                    elevation = zeile.Elevation?.value ?? null;
                    name = String(zeile.Name?.value ?? zeile.LongName?.value ?? '');
                } else if (webIfc) {
                    try {
                        const ent = webIfc.GetLine(0, node.localId, false);
                        elevation = ent?.Elevation?.value ?? null;
                    } catch { /* skip */ }
                }

                // Collect all descendant localIds for box-union
                const ids = [];
                const collect = (n) => {
                    if (n.localId != null) ids.push(n.localId);
                    for (const c of n.children ?? []) collect(c);
                };
                collect(node);

                let box = null;
                try {
                    const boxes = await model.getBoxes(ids);
                    if (boxes?.length) {
                        const union = new THREE.Box3();
                        union.makeEmpty();
                        for (const b of boxes) if (!b.isEmpty()) union.union(b);
                        if (!union.isEmpty()) box = union;
                    }
                } catch { /* skip */ }

                storeys.push({
                    modelId:   model.modelId,
                    localId:   node.localId,
                    name:      (name || node.name || '').trim() || `Storey ${node.localId}`,
                    elevation,
                    box, // THREE.Box3 or null
                });
            }
        }

        // Sort by elevation (lowest first) for natural floor order
        storeys.sort((a, b) => {
            const ea = a.elevation ?? -Infinity;
            const eb = b.elevation ?? -Infinity;
            return ea - eb;
        });
        return storeys;
    }

    /**
     * Fit the camera to a storey's bounding box. Optionally place an active
     * section cut at (storey-floor + sliceOffset) metres for a true plan-view.
     */
    async gotoStorey(modelId, localId, { withSection = false, sliceOffset = 1.2 } = {}) {
        const storeys = await this.getStoreyList();
        const s = storeys.find(x => x.modelId === modelId && x.localId === localId);
        if (!s || !s.box) return false;

        await this._fitToBox(s.box, { padding: 0.5 });

        if (withSection) {
            // Tear down any existing section, then create a horizontal cut at floor + offset
            this._schnitt.deleteSectionCuts();
            this._schnitt.createSectionCut();
            const center = new THREE.Vector3();
            s.box.getCenter(center);
            this._schnitt.placeSectionAt(center, s.box.min.y + sliceOffset);
        }
        return true;
    }
}
