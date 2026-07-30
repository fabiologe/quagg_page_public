/**
 * useChannelGhostPreview.js
 *
 * 3D-Geister-Vorschau der SGC-Gerinnekörper (Channel-Werkzeug) ENTLANG der gezeichneten
 * Polylinie: der Querschnitt (Rechteck/Trapez, Sohle bedDepth unter dem Gelände) wird als
 * halbtransparenter Trog durch die Szene gezogen. Ergänzt die Zell-Vorschau
 * (useSgcRasterPreview: gestempelte Rasterzellen = was der Solver bekommt) um die
 * ANSCHAUUNG „wie sieht das Gerinne aus".
 *
 * Quellen (beide reaktiv):
 *  - geoStore.sgcChannels           eingebaute Kanäle (cyan)
 *  - draftRef                       Live-Entwurf (lime): Polylinie fixiert, Querschnitt-
 *                                   Popup offen — Werte ändern die Vorschau beim Tippen
 *                                   ({ polyline:[{x,y,terrainZ}], section:{shape,bedWidth,
 *                                   depth,sideSlope} } | null)
 *
 * depthTest:false — der Trog liegt UNTER der Geländeoberfläche und wäre in den
 * Solid-Ansichten sonst komplett vom Terrain verdeckt (gleiche Falle wie beim
 * Kanalnetz-X-Ray, s. useNetworkRenderer.setXray).
 */
import { watch, onUnmounted } from 'vue';
import * as THREE from 'three';
import { useGeoStore } from '../../stores/useGeoStore.js';
import { requestRender } from './renderTrigger.js';

const COLOR_BUILT = 0x00bcd4;  // eingebauter Kanal (wie SGC-Zellvorschau)
const COLOR_DRAFT = 0xa3e635;  // Live-Entwurf (SaintV-Lime)

export function useChannelGhostPreview(scene, draftRef = null) {
    const geoStore = useGeoStore();
    const group = new THREE.Group();
    group.name = 'ChannelGhostPreview';
    // Über den festen Bauwerken, unter dem Wasser (renderLayers-Hierarchie) — mit
    // depthTest:false zeichnet die Reihenfolge, nicht der Tiefenpuffer.
    group.renderOrder = 19;
    scene.add(group);

    const clear = () => {
        for (let i = group.children.length - 1; i >= 0; i--) {
            const c = group.children[i];
            c.geometry?.dispose?.();
            c.material?.dispose?.();
            group.remove(c);
        }
    };

    /**
     * Trog-Geometrie: 4 Längsschienen (BöschungsoberkanteL, SohleL, SohleR, OberkanteR),
     * Querschnitt senkrecht zur lokalen Linienrichtung, Sohle = terrainZ − depth je Vertex.
     */
    function buildTrench(polyline, section, terrain) {
        const pts = (polyline || []).filter(p =>
            Number.isFinite(p?.x) && Number.isFinite(p?.y) && Number.isFinite(p?.terrainZ));
        if (pts.length < 2 || !section) return null;
        const { center, minZ } = terrain;
        const depth = Math.max(Number(section.depth ?? section.bedDepth) || 0, 0.05);
        const hb = Math.max(Number(section.bedWidth) || 0.1, 0.1) / 2;
        const slope = section.shape === 'trapezoid' ? Math.max(Number(section.sideSlope) || 0, 0) : 0;
        const ht = hb + slope * depth;

        // Welt → Szene (wie useSgcRasterPreview/buildTerrainMesh)
        const sp = pts.map(p => ({
            x: p.x - center.x,
            z: -(p.y - center.y),
            yTop: p.terrainZ - minZ,
            yBed: p.terrainZ - depth - minZ,
        }));

        const n = sp.length;
        const pos = new Float32Array(n * 4 * 3);
        for (let i = 0; i < n; i++) {
            // Lokale Richtung (zentrale Differenz), Senkrechte in der XZ-Ebene
            const a = sp[Math.max(i - 1, 0)], b = sp[Math.min(i + 1, n - 1)];
            let dx = b.x - a.x, dz = b.z - a.z;
            const len = Math.hypot(dx, dz) || 1;
            const px = -dz / len, pz = dx / len;
            const p = sp[i];
            const v = [
                [p.x + px * ht, p.yTop, p.z + pz * ht],   // Oberkante links
                [p.x + px * hb, p.yBed, p.z + pz * hb],   // Sohle links
                [p.x - px * hb, p.yBed, p.z - pz * hb],   // Sohle rechts
                [p.x - px * ht, p.yTop, p.z - pz * ht],   // Oberkante rechts
            ];
            for (let k = 0; k < 4; k++) {
                const o = (i * 4 + k) * 3;
                pos[o] = v[k][0]; pos[o + 1] = v[k][1]; pos[o + 2] = v[k][2];
            }
        }
        // 3 Längsbänder (Böschung links, Sohle, Böschung rechts) als Quad-Strips
        const idx = [];
        for (let i = 0; i < n - 1; i++) {
            for (let band = 0; band < 3; band++) {
                const a0 = i * 4 + band, a1 = i * 4 + band + 1;
                const b0 = (i + 1) * 4 + band, b1 = (i + 1) * 4 + band + 1;
                idx.push(a0, a1, b1, a0, b1, b0);
            }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setIndex(idx);
        geo.computeVertexNormals();
        return geo;
    }

    function addMesh(geo, color, opacity) {
        const mat = new THREE.MeshBasicMaterial({
            color, transparent: true, opacity,
            side: THREE.DoubleSide, depthTest: false, depthWrite: false,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.renderOrder = 19;
        group.add(mesh);
        // Kanten nachziehen — macht die Trogform auch über buntem Terrain lesbar.
        const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(geo, 30),
            new THREE.LineBasicMaterial({ color, transparent: true, opacity: Math.min(opacity * 2.2, 0.9), depthTest: false }));
        edges.renderOrder = 19;
        group.add(edges);
    }

    function rebuild() {
        clear();
        requestRender();   // schon das Leeren verändert das Bild (auch bei frühem Ausstieg)
        const terrain = geoStore.terrain;
        if (!terrain || !terrain.center) return;
        for (const c of geoStore.sgcChannels || []) {
            const geo = buildTrench(c.polyline, {
                shape: c.shape, bedWidth: c.bedWidth, depth: c.bedDepth, sideSlope: c.sideSlope,
            }, terrain);
            if (geo) addMesh(geo, COLOR_BUILT, 0.28);
        }
        const d = draftRef?.value;
        if (d?.polyline && d?.section) {
            const geo = buildTrench(d.polyline, d.section, terrain);
            if (geo) addMesh(geo, COLOR_DRAFT, 0.35);
        }
    }

    const stops = [
        // Revisionszähler statt deep-Watcher (s. useGeoStore.touch): erfasst auch
        // In-Place-Änderungen und kostet keine Traversal-Zeit.
        watch(() => geoStore.revisions.sgc, rebuild, { immediate: true }),
        watch(() => geoStore.terrain?.gridData, rebuild),
    ];
    if (draftRef) stops.push(watch(draftRef, rebuild, { deep: true }));

    function dispose() {
        stops.forEach(s => s());
        clear();
        scene.remove(group);
    }
    onUnmounted(dispose);

    return { rebuild, dispose, group };
}
