import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

export function useThreeCore() {
  let scene = null, camera = null, renderer = null, controls = null;
  let animationId = null;

  function init(container) {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1117);
    scene.fog = new THREE.Fog(0x0d1117, 800, 30000);

    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;

    camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 200000);
    camera.position.set(0, 80, 80);

    renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 100000;
    controls.saveState();

    // Persistent lights — in own group so network rebuild never removes them
    const lightsGroup = new THREE.Group();
    lightsGroup.name = '__lights__';
    lightsGroup.add(new THREE.AmbientLight(0xffffff, 0.5));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(200, 400, 200);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 5000;
    sun.shadow.camera.left  = -500; sun.shadow.camera.right = 500;
    sun.shadow.camera.top   =  500; sun.shadow.camera.bottom = -500;
    lightsGroup.add(sun);
    scene.add(lightsGroup);
  }

  function startLoop() {
    const tick = () => {
      animationId = requestAnimationFrame(tick);
      controls?.update();
      if (renderer && scene && camera) renderer.render(scene, camera);
    };
    tick();
  }

  function stopLoop() {
    if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  }

  function handleResize(container) {
    if (!container || !camera || !renderer) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  function fitToNetwork(spanX, spanY, spanZ) {
    if (!camera || !controls) return;
    const maxSpan = Math.max(spanX ?? 50, spanY ?? 50, spanZ ?? 10, 10);
    const dist = maxSpan * 1.5;
    camera.position.set(0, dist * 0.4, dist);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.update();
    controls.saveState(); // allow reset back to this fit view
  }

  function resetView() {
    controls?.reset();
  }

  // Correct double-click focus: use Box3 from actual vertices, not mesh.position
  function focusMesh(mesh) {
    if (!mesh || !controls || !camera) return;
    const box = new THREE.Box3().setFromObject(mesh);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size   = box.getSize(new THREE.Vector3()).length();
    const dist   = Math.max(size * 2, 5);
    controls.target.copy(center);
    camera.position.copy(center).add(new THREE.Vector3(dist * 0.3, dist * 0.4, dist));
    controls.update();
  }

  function dispose() {
    stopLoop();
    controls?.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
    scene = null; camera = null; renderer = null; controls = null;
  }

  return {
    get scene()    { return scene;    },
    get camera()   { return camera;   },
    get renderer() { return renderer; },
    get controls() { return controls; },
    init, startLoop, stopLoop, handleResize, fitToNetwork, resetView, focusMesh, dispose,
  };
}
