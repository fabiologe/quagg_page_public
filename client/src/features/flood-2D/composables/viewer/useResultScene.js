/**
 * useResultScene.js — reine Three.js-Infrastruktur des Result-Viewers.
 *
 * Kapselt Szene, Kamera, Renderer, Controls, Lichter, den Animations-Loop, Resize und das
 * vollständige GPU-Resource-Release. KEINE Domänen-/Koordinatenlogik — die lebt in eigenen
 * Composables (useTerrainLayer, useWater…, useResultCoords).
 */
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';

export function useResultScene() {
  let renderer = null;
  let scene = null;
  let camera = null;
  let controls = null;
  let animationId = null;

  /** Erzeugt Szene/Kamera/Renderer/Controls/Lichter und hängt das Canvas in `container`. */
  function init(container) {
    const w = container.clientWidth;
    const h = container.clientHeight;
    console.log('[ResultScene] init', w, 'x', h);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a1a);

    camera = new THREE.PerspectiveCamera(55, w / h, 5.0, 20000);
    camera.position.set(0, 500, 500);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, logarithmicDepthBuffer: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    controls = new MapControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = false;
    controls.minDistance = 5;
    // Orbit auch UNTER das Gelände lassen (Kanalnetz liegt unterflur; Terrain ist
    // DoubleSide → von unten sieht man die Geländeunterseite + die Rohre davor).
    // Kleines Epsilon vor PI, damit die Kamera nicht exakt im Pol landet.
    controls.maxPolarAngle = Math.PI - 0.02;

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    // Position auch als uSunDir im Wasser-Shader (useWaterSurface.js, Modus 0)
    // hinterlegt — bei Änderung BEIDE Stellen anpassen, sonst wandert der Sonnen-Glint.
    dirLight.position.set(200, 600, 200);
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0x4fc3f7, 0.15);
    fillLight.position.set(-200, 100, -200);
    scene.add(fillLight);

    return { scene, camera, renderer, controls };
  }

  /**
   * Startet den requestAnimationFrame-Loop (Controls-Update + Render).
   * @param {(renderer, scene, camera) => void} [preRender]  optionaler Pass VOR dem
   *        Haupt-Render (z. B. Refraktions-RenderTarget des Wassers befüllen).
   */
  function start(preRender) {
    const loop = () => {
      animationId = requestAnimationFrame(loop);
      if (controls) controls.update();
      if (renderer && scene && camera) {
        if (preRender) preRender(renderer, scene, camera);
        renderer.render(scene, camera);
      }
    };
    loop();
  }

  /** Passt Kamera-Aspect + Renderer-Größe an den Container an. */
  function resize(container) {
    if (!container || !renderer || !camera) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  /**
   * Gibt alle GPU-Ressourcen frei (Geometrien/Materialien/Texturen) und leert die Szene,
   * OHNE die Vue-Komponente zu unmounten (für das 'flood-viewer-dispose'-Event).
   */
  function releaseResources() {
    if (!scene) return;
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => {
          Object.values(m.uniforms || {}).forEach(u => {
            if (u?.value?.isTexture) u.value.dispose();
          });
          m.dispose();
        });
      }
    });
    while (scene.children.length > 0) scene.remove(scene.children[0]);
  }

  /** Endgültiges Aufräumen beim Unmount. */
  function dispose() {
    if (animationId) cancelAnimationFrame(animationId);
    if (renderer) {
      renderer.dispose();
      renderer.domElement?.remove();
    }
    if (controls) controls.dispose();
  }

  return {
    init, start, resize, releaseResources, dispose,
    get scene() { return scene; },
    get camera() { return camera; },
    get renderer() { return renderer; },
    get controls() { return controls; },
  };
}
