/**
 * GPU-Rendering der EZG-Höhenlinien via Three.js/WebGL — Ersatz für die
 * SVG-<path>-Ebene, die trotz DOM-Batching, Polylinien-Verkettung und
 * Douglas-Peucker-Vereinfachung beim Pannen weiterhin spürbar geruckelt hat
 * (CPU-seitiges Rastern komplexer Pfad-Geometrie bei jedem Repaint).
 * Mirrort das Fat-Line-Muster aus
 * flood-2D/composables/viewer/useFlowStreamlines.js (LineSegments2 +
 * LineMaterial, worldUnits:false = pixelkonstante, scharfe Linienbreite).
 *
 * Kamera-Sync: statt die SVG-Transform-Kette (transformString + bounds-
 * Shift/Flip) irgendwie in Three.js nachzubilden, wird das Kamera-Frustum
 * bei jeder Pan/Zoom-/Bounds-Änderung DIREKT in rohen Welt-Koordinaten neu
 * berechnet (Umkehrung derselben Formel wie IsybauViewer.vues
 * getEventCoords) — die Kontur-Geometrie selbst bleibt in unveränderten
 * Welt-Koordinaten, es muss nie ein Objekt im Szenegraph verschoben werden.
 *
 * Rendering ist bewusst ON-DEMAND (kein requestAnimationFrame-Loop) — nur
 * render() aufrufen, wenn sich Kamera oder Geometrie tatsächlich geändert
 * haben, das 2D-Pan/Zoom hat (anders als die 3D-Ansicht mit OrbitControls-
 * Damping) keine kontinuierliche Physik, die einen Dauerloop braucht.
 */
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { computeViewportWorldBounds } from '../../utils/geoBounds.js';

// Zweifarbiger "Halo"-Look: dicke violette Außenlinie + dünnere giftgrüne
// Innenlinie obendrauf — bleibt auch auf dunklem/kontrastarmem Luftbild gut
// erkennbar (Nutzer-Feedback: einfarbig+dünn war "sieht man echt schlecht").
// Farben lehnen sich an --sv-violet (#8B5CF6) aus dem App-Theme an.
const OUTER_WIDTH_PX = 5;
const OUTER_COLOR = 0x8b5cf6; // Violett
const INNER_WIDTH_PX = 2;
const INNER_COLOR = 0xadff2f; // Giftgrün

export function useContourGpuLayer() {
    let renderer = null;
    let scene = null;
    let camera = null;
    let outerMaterial = null;
    let innerMaterial = null;
    let outerMesh = null;
    let innerMesh = null;

    function init(hostEl) {
        scene = new THREE.Scene();

        camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1000);
        camera.position.set(0, 0, 100); // Blick entlang -Z, X/Y-Frustum = direkt Welt-Koordinaten

        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        const dom = renderer.domElement;
        dom.style.position = 'absolute';
        dom.style.top = '0';
        dom.style.left = '0';
        dom.style.width = '100%';
        dom.style.height = '100%';
        dom.style.pointerEvents = 'none'; // Klicks müssen zur SVG-Ebene durchgereicht werden
        hostEl.appendChild(dom);

        outerMaterial = new LineMaterial({
            color: OUTER_COLOR,
            worldUnits: false, // Breite in Bildschirm-Pixeln, nicht Weltmetern — bleibt bei jedem Zoom scharf
            linewidth: OUTER_WIDTH_PX,
            transparent: true,
            opacity: 0.85,
            depthTest: false
        });
        innerMaterial = new LineMaterial({
            color: INNER_COLOR,
            worldUnits: false,
            linewidth: INNER_WIDTH_PX,
            transparent: true,
            opacity: 0.95,
            depthTest: false
        });
    }

    /**
     * Baut die Geometrie aus dem (in ezgContourWorker.js bereits verketteten,
     * Douglas-Peucker-vereinfachten UND geflatteten) Positions-Array neu auf
     * — EIN Mesh für die gesamte Kontur-Ebene, unabhängig von der
     * Höhenlinien-Anzahl (anders als die alte SVG-Version mit einem <path>
     * pro Level: LineSegments2 braucht keine zusammenhängenden Ketten, jedes
     * Punktpaar ist ein unabhängiges Segment — ein einziger Draw-Call reicht
     * für alle Level zusammen). Erwartet bereits das flache x,y,0-Format,
     * das LineSegmentsGeometry.setPositions() direkt konsumiert — keine
     * eigene Flatten-Schleife mehr hier (früher: verschachtelte
     * {elevation,lines}-Objekte aus useEzgLayer.js, hier iteriert; jetzt
     * bereits im Worker geflattet, siehe ezgContourWorker.js für die
     * Profiling-Begründung).
     * @param {Float32Array} positions
     */
    function updateGeometry(positions) {
        if (outerMesh) { scene.remove(outerMesh); outerMesh.geometry?.dispose(); outerMesh = null; }
        if (innerMesh) { scene.remove(innerMesh); innerMesh = null; } // teilt sich die Geometrie mit outerMesh, nicht doppelt disposen

        if (!positions || positions.length === 0) return;

        const geom = new LineSegmentsGeometry();
        // setPositions() ruft INTERN unconditionally computeBoundingBox()+
        // computeBoundingSphere() auf (three.js-Quellcode, kein Opt-out-Flag)
        // — computeBoundingSphere() iteriert dabei JEDEN Punkt EIN ZWEITES
        // MAL (Vector3.fromBufferAttribute+distanceToSquared, zusätzlich zum
        // günstigen Min/Max-Scan von computeBoundingBox). Realer Fund aus
        // einem Heap-Profil des Nutzers (Chrome DevTools, echter Browser
        // statt Headless-Test): der mit Abstand größte einzelne Allokations-
        // Knoten (1,45MB) beim ersten Laden war GENAU dieser Aufruf.
        // WICHTIG: computeBoundingSphere() NICHT einfach zum No-Op machen —
        // WebGLRenderer.js liest object.geometry.boundingSphere.center beim
        // Sortieren transparenter Objekte nach Kamera-Distanz UNABHÄNGIG von
        // frustumCulled (führte zu "Cannot read properties of null (reading
        // 'center')", als computeBoundingSphere() nichts tat und
        // boundingSphere dauerhaft null blieb). Stattdessen: günstige
        // Kugel-Approximation aus der (billigen) Bounding-Box ableiten
        // (Box3.getBoundingSphere() — Center+Radius aus Min/Max, O(1) statt
        // einem zweiten O(n)-Punkt-Durchlauf) — für die reine Transparenz-
        // Sortierung einer Hintergrund-Ebene ausreichend genau.
        geom.computeBoundingSphere = function () {
            if (this.boundingBox === null) this.computeBoundingBox();
            if (this.boundingSphere === null) this.boundingSphere = new THREE.Sphere();
            this.boundingBox.getBoundingSphere(this.boundingSphere);
        };
        geom.setPositions(positions);

        const resolutionUpdater = (r) => {
            const dom = r.domElement;
            outerMaterial.resolution.set(dom.width, dom.height);
            innerMaterial.resolution.set(dom.width, dom.height);
        };

        // Dieselbe Geometrie für beide Meshes — EIN Vertex-Buffer, zwei
        // Materialien/Breiten. renderOrder stellt sicher, dass die dünnere
        // grüne Linie IMMER über der dicken violetten liegt, unabhängig von
        // der Hinzufüge-Reihenfolge in die Szene (beide haben depthTest:false).
        outerMesh = new LineSegments2(geom, outerMaterial);
        outerMesh.frustumCulled = false; // Positionen liegen in echten Welt-Metern, weit vom Ursprung entfernt
        outerMesh.renderOrder = 0;
        outerMesh.onBeforeRender = resolutionUpdater;
        scene.add(outerMesh);

        innerMesh = new LineSegments2(geom, innerMaterial);
        innerMesh.frustumCulled = false;
        innerMesh.renderOrder = 1;
        scene.add(innerMesh);
    }

    /**
     * Kamera-Frustum direkt in Welt-Koordinaten setzen — computeViewportWorldBounds()
     * (geoBounds.js) liefert genau den Weltausschnitt, den die SVG gerade
     * zeigt (Umkehrung von transformString); dieselbe Funktion nutzt
     * IsybauViewer.vue auch für den Pan-Nachlade-Trigger, damit beide
     * Stellen garantiert denselben Ausschnitt sehen.
     * @param {{minX:number,maxY:number,width:number,height:number,centerX:number,centerY:number}} bounds
     */
    function updateCamera(bounds, translateX, translateY, scale) {
        if (!camera) return;
        const vb = computeViewportWorldBounds(bounds, translateX, translateY, scale);
        camera.left = vb.minX;
        camera.right = vb.maxX;
        camera.top = vb.maxY;
        camera.bottom = vb.minY;
        camera.updateProjectionMatrix();
    }

    /**
     * Repliziert SVGs preserveAspectRatio="xMidYMid meet": nur der
     * proportional passende Ausschnitt des Canvas wird bemalt (Viewport +
     * Scissor), der Rest bleibt transparent/leer — keine zusätzlichen
     * Weltinhalte in den "Letterbox"-Rändern, exakt wie beim SVG.
     * @param {HTMLElement} container
     * @param {number} viewBoxWidth bounds.width
     * @param {number} viewBoxHeight bounds.height
     */
    function resize(container, viewBoxWidth, viewBoxHeight) {
        if (!renderer || !container) return;
        const cw = container.clientWidth || 1;
        const ch = container.clientHeight || 1;
        renderer.setSize(cw, ch);

        const containerAspect = cw / ch;
        const viewBoxAspect = (viewBoxWidth || 100) / (viewBoxHeight || 100);

        let fitW, fitH, offX, offY;
        if (containerAspect > viewBoxAspect) {
            fitH = ch;
            fitW = ch * viewBoxAspect;
            offX = (cw - fitW) / 2;
            offY = 0;
        } else {
            fitW = cw;
            fitH = cw / viewBoxAspect;
            offX = 0;
            offY = (ch - fitH) / 2;
        }
        renderer.setViewport(offX, offY, fitW, fitH);
        renderer.setScissor(offX, offY, fitW, fitH);
        renderer.setScissorTest(true);
    }

    function render() {
        if (renderer && scene && camera) renderer.render(scene, camera);
    }

    function dispose() {
        if (outerMesh) {
            scene?.remove(outerMesh);
            outerMesh.geometry?.dispose(); // von innerMesh mitgenutzt — nur einmal disposen
            outerMesh = null;
        }
        if (innerMesh) {
            scene?.remove(innerMesh);
            innerMesh = null;
        }
        outerMaterial?.dispose();
        outerMaterial = null;
        innerMaterial?.dispose();
        innerMaterial = null;
        if (renderer?.domElement?.parentNode) {
            renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
        renderer?.dispose();
        renderer?.forceContextLoss();
        renderer = null;
        scene = null;
        camera = null;
    }

    return { init, updateGeometry, updateCamera, resize, render, dispose };
}
