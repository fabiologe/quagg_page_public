import { ref, computed, onUnmounted } from 'vue';
import * as THREE from 'three';

// Bildschirm-Radius für den Schacht-Snap (px) — zoomunabhängig ("leicht": man muss
// nah dran sein, aber nicht pixelgenau treffen). Editor-Konvention: Snap = Lime.
const SNAP_PX = 18;
const SNAP_COLOR = 0xa3e635;
const LINE_COLOR = 0xffeb3b;
// Mindest-Länge² (Weltkoordinaten), unter der ein Abschluss ignoriert wird — schützt
// nur gegen einen echten Start==Ende-Fehlklick (z. B. Doppelklick als allererste
// Aktion, bevor der Nutzer die Maus überhaupt bewegt hat), kein fachliches Mindestmaß.
const MIN_DRAW_DIST2 = 1e-6;

export function useSectionTool({ scene, camera, renderer, getTerrainMesh, getSnapNodes, onSectionDrawn, onDrawStart, onDrawEnd }) {
    const isActive = ref(false);

    // Currently active drawing start point
    const startPoint = ref(null);
    // Ist gerade ein Start gesetzt, aber der Schnitt noch nicht abgeschlossen?
    // (einzige Quelle der Wahrheit: startPoint — kein zusätzlicher State nötig)
    const isDrawing = computed(() => startPoint.value !== null);

    // Map to store completed meshes by their unique id
    const completedSections = new Map();

    // Three.js objects for the *active* drawing
    let tempLineMesh = null;
    // Letztes pointermove-Event — liefert confirmDrawing() die aktuelle Vorschau-
    // Endposition, ohne dass dafür noch ein Klick an der Zielposition nötig ist.
    let lastMoveEvent = null;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const snapProjected = new THREE.Vector3();

    /**
     * Nächster Schacht im Bildschirm-Radius SNAP_PX um den Mauszeiger (Kandidaten
     * aus getSnapNodes: [{id,x,y,z}] in Szene-Weltkoordinaten). null, wenn keiner
     * nah genug ist oder kein getSnapNodes übergeben wurde.
     */
    function findSnapNode(event, rect) {
        if (!getSnapNodes) return null;
        const nodes = getSnapNodes();
        if (!nodes || !nodes.length) return null;
        const mx = event.clientX - rect.left, my = event.clientY - rect.top;
        let best = null, bestD2 = SNAP_PX * SNAP_PX;
        for (const n of nodes) {
            snapProjected.set(n.x, n.y, n.z).project(camera);
            const px = (snapProjected.x * 0.5 + 0.5) * rect.width;
            const py = (-snapProjected.y * 0.5 + 0.5) * rect.height;
            const d2 = (px - mx) ** 2 + (py - my) ** 2;
            if (d2 < bestD2) { bestD2 = d2; best = n; }
        }
        return best;
    }

    function enable() {
        if (isActive.value) return;
        isActive.value = true;

        window.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('dblclick', onDoubleClick);
        window.addEventListener('keydown', onKeyDown);
    }

    function disable() {
        if (!isActive.value) return;
        isActive.value = false;

        window.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('dblclick', onDoubleClick);
        window.removeEventListener('keydown', onKeyDown);

        clearActiveDraft();
    }

    function clearActiveDraft() {
        lastMoveEvent = null;
        if (startPoint.value) {
            startPoint.value = null;
            if (onDrawEnd) onDrawEnd();
        }
        if (tempLineMesh) {
            scene.remove(tempLineMesh);
            tempLineMesh.geometry.dispose();
            if (tempLineMesh.material) tempLineMesh.material.dispose();
            tempLineMesh = null;
        }
    }

    /** @returns {{point: THREE.Vector3, snapped: boolean}|null} */
    function getIntersection(event) {
        const tMesh = getTerrainMesh();
        if (!tMesh) return null;

        const domEl = renderer?.value?.domElement || renderer?.domElement;
        if (!domEl) return null;

        const rect = domEl.getBoundingClientRect();

        // Ensure event is inside canvas
        if (event.clientX < rect.left || event.clientX > rect.right ||
            event.clientY < rect.top || event.clientY > rect.bottom) {
            return null;
        }

        // Schacht-Snap zuerst prüfen — nah genug am Bildschirm-Radius gewinnt exakt
        // die Schacht-Position, statt der (leicht daneben liegenden) Terrain-Kreuzung.
        const snap = findSnapNode(event, rect);
        if (snap) return { point: new THREE.Vector3(snap.x, snap.y, snap.z), snapped: true };

        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObject(tMesh);

        return hits.length > 0 ? { point: hits[0].point, snapped: false } : null;
    }

    /**
     * Schließt den begonnenen Schnitt mit `endPointWorld` als Ende ab — gemeinsamer
     * Pfad für Doppelklick und confirmDrawing(). Ignoriert Start≈Ende (Schutz vor
     * einem Doppelklick als allererster Aktion, bevor die Maus bewegt wurde).
     */
    function finalizeSection(endPointWorld) {
        if (!startPoint.value || !endPointWorld) return;
        if (startPoint.value.distanceToSquared(endPointWorld) < MIN_DRAW_DIST2) return;

        const endPoint = endPointWorld.clone();
        const startPtVal = startPoint.value.clone();

        clearActiveDraft();

        if (onSectionDrawn) {
            const sectionInfo = onSectionDrawn(startPtVal, endPoint);
            if (sectionInfo) {
                const material = new THREE.LineBasicMaterial({
                    color: new THREE.Color(sectionInfo.color),
                    linewidth: 3,
                    depthTest: false,
                    transparent: true,
                    opacity: 0.9
                });
                const geometry = new THREE.BufferGeometry().setFromPoints([startPtVal, endPoint.clone()]);
                const finalMesh = new THREE.Line(geometry, material);
                finalMesh.renderOrder = 999;
                scene.add(finalMesh);

                completedSections.set(sectionInfo.id, finalMesh);
            }
        }
    }

    function onPointerDown(event) {
        if (!isActive.value) return;

        if (event.button !== 0) return;

        // Prevent drawing on UI panels
        if (event.target.tagName.toLowerCase() !== 'canvas') {
            return;
        }

        // Nur der ERSTE Klick setzt den Start. Weitere Einzelklicks sind bewusst
        // No-ops — der Endpunkt folgt frei der Maus (onPointerMove); erst Doppel-
        // klick oder ein explizites confirmDrawing() (Enter/Bestätigen-Button)
        // übernimmt die aktuell sichtbare Vorschau als fertigen Schnitt.
        if (startPoint.value) return;

        const hit = getIntersection(event);
        if (!hit) return;

        startPoint.value = hit.point.clone();

        const material = new THREE.LineBasicMaterial({
            color: hit.snapped ? SNAP_COLOR : LINE_COLOR,
            linewidth: 3,
            depthTest: false
        });
        const geometry = new THREE.BufferGeometry().setFromPoints([startPoint.value, startPoint.value]);
        tempLineMesh = new THREE.Line(geometry, material);
        tempLineMesh.renderOrder = 999;
        scene.add(tempLineMesh);

        if (onDrawStart) onDrawStart();
    }

    function onPointerMove(event) {
        if (!isActive.value || !startPoint.value) return;
        lastMoveEvent = event;

        const hit = getIntersection(event);
        if (!hit) return;

        if (tempLineMesh) {
            tempLineMesh.geometry.setFromPoints([startPoint.value, hit.point]);
            // Snap-Feedback: Vorschau-Linie springt auf Lime, sobald der Cursor
            // nah genug an einem Schacht ist (Editor-Konvention).
            tempLineMesh.material.color.set(hit.snapped ? SNAP_COLOR : LINE_COLOR);
        }
    }

    function onDoubleClick(event) {
        if (!isActive.value || !startPoint.value) return;
        if (event.target.tagName.toLowerCase() !== 'canvas') return;

        const hit = getIntersection(event);
        if (hit) finalizeSection(hit.point);
    }

    function onKeyDown(event) {
        if (event.key === 'Enter') confirmDrawing();
        else if (event.key === 'Escape') clearActiveDraft();
    }

    /**
     * Schließt den begonnenen Schnitt mit der ZULETZT sichtbaren Vorschau-Position
     * ab — für einen "Bestätigen"-Button oder die Enter-Taste, ohne dass dafür noch
     * ein Klick an der Zielposition nötig ist.
     */
    function confirmDrawing() {
        if (!startPoint.value) return;
        let endPointWorld = lastMoveEvent ? getIntersection(lastMoveEvent)?.point : null;
        if (!endPointWorld && tempLineMesh) {
            // Fallback: letzte gerenderte Vorschau-Endposition aus der Geometrie lesen
            // (falls seit dem letzten pointermove kein neuer Hit mehr berechnet wurde).
            const pos = tempLineMesh.geometry.attributes.position;
            endPointWorld = new THREE.Vector3(pos.getX(1), pos.getY(1), pos.getZ(1));
        }
        if (endPointWorld) finalizeSection(endPointWorld);
    }

    function removeSectionMesh(id) {
        const mesh = completedSections.get(id);
        if (mesh) {
            scene.remove(mesh);
            mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
            completedSections.delete(id);
        }
    }

    function clearAllSections() {
        clearActiveDraft();

        for (const [id, mesh] of completedSections.entries()) {
            scene.remove(mesh);
            mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
        }
        completedSections.clear();
    }

    onUnmounted(() => {
        disable();
        clearAllSections();
    });

    return {
        isActive,
        isDrawing,
        enable,
        disable,
        confirmDrawing,
        removeSectionMesh,
        clearAllSections
    };
}
