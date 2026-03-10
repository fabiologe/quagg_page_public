import { ref, onUnmounted } from 'vue';
import * as THREE from 'three';

export function useSectionTool({ scene, camera, renderer, getTerrainMesh, onSectionDrawn, onDrawStart, onDrawEnd }) {
    const isActive = ref(false);

    // Currently active drawing start point
    const startPoint = ref(null);

    // Map to store completed meshes by their unique id
    const completedSections = new Map();

    // Three.js objects for the *active* drawing
    let tempLineMesh = null;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    function enable() {
        if (isActive.value) return;
        isActive.value = true;

        window.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointermove', onPointerMove);
    }

    function disable() {
        if (!isActive.value) return;
        isActive.value = false;

        window.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointermove', onPointerMove);

        clearActiveDraft();
    }

    function clearActiveDraft() {
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

        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObject(tMesh);

        return hits.length > 0 ? hits[0].point : null;
    }

    function onPointerDown(event) {
        if (!isActive.value) return;

        if (event.button !== 0) return;

        // Prevent drawing on UI panels
        if (event.target.tagName.toLowerCase() !== 'canvas') {
            return;
        }

        const hitPoint = getIntersection(event);
        if (!hitPoint) return;

        if (!startPoint.value) {
            // First click
            startPoint.value = hitPoint.clone();

            const material = new THREE.LineBasicMaterial({
                color: 0xffeb3b,
                linewidth: 3,
                depthTest: false
            });
            const geometry = new THREE.BufferGeometry().setFromPoints([startPoint.value, startPoint.value]);
            tempLineMesh = new THREE.Line(geometry, material);
            tempLineMesh.renderOrder = 999;
            scene.add(tempLineMesh);

            if (onDrawStart) onDrawStart();
        } else {
            // Second click: finish drawing
            const endPoint = hitPoint.clone();
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
    }

    function onPointerMove(event) {
        if (!isActive.value || !startPoint.value) return;

        const hitPoint = getIntersection(event);
        if (!hitPoint) return;

        if (tempLineMesh) {
            tempLineMesh.geometry.setFromPoints([startPoint.value, hitPoint]);
        }
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
        enable,
        disable,
        removeSectionMesh,
        clearAllSections
    };
}
