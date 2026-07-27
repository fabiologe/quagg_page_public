import * as THREE from 'three';
import { LINK_BAUWERKSTYPEN } from '../../../utils/mappings.js';

const NETWORK_GROUP = '__network__';
const WORLD_UP = new THREE.Vector3(0, 1, 0);

function getEdgeZ(val, fallback) {
  return (val !== undefined && val !== null && val > -9000 && Number.isFinite(val))
    ? val : (Number.isFinite(fallback) ? fallback : 0);
}
function lerp(a, b, t) { return a + (b - a) * t; }

// ─── Cross-section point sets (2D, Y = world-up) ─────────────────────────

function trapezoidPts(h, w) {
  const slope = 1.5;
  const botW  = w / 2;
  const topW  = w / 2 + slope * h;
  // Points go: top-left → left-wall down → bottom-left → bottom-right → right-wall up → top-right
  // The top (first↔last) is left OPEN when open=true
  return [
    new THREE.Vector2(-topW,  h / 2),   // 0 top-left  (open edge starts here)
    new THREE.Vector2(-botW, -h / 2),   // 1 bottom-left
    new THREE.Vector2( botW, -h / 2),   // 2 bottom-right
    new THREE.Vector2( topW,  h / 2),   // 3 top-right  (open edge ends here)
  ];
}

function rectPts(h, w) {
  return [
    new THREE.Vector2(-w / 2,  h / 2),
    new THREE.Vector2( w / 2,  h / 2),
    new THREE.Vector2( w / 2, -h / 2),
    new THREE.Vector2(-w / 2, -h / 2),
  ];
}

// Maulprofil (horseshoe): flat bottom + circular upper arch
function maulprofilPts(h, w, segs = 16) {
  const pts = [];
  const r = w / 2;
  // Flat bottom from right to left
  pts.push(new THREE.Vector2( r, -h / 2));
  pts.push(new THREE.Vector2(-r, -h / 2));
  // Upper semicircle left→right
  for (let i = 0; i <= segs; i++) {
    const a = Math.PI - (i / segs) * Math.PI; // π → 0
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r * (h / w)));
  }
  return pts;
}

function eggPts(h, w, segs = 14) {
  const pts = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * 2 * Math.PI;
    pts.push(new THREE.Vector2(Math.cos(a) * w / 2, Math.sin(a) * h / 2));
  }
  return pts;
}

// ─── Oriented pipe extrusion ──────────────────────────────────────────────
// open=true  → top edge is not connected (open channel / Offenes Gerinne)
// open=false → fully closed profile

function buildOrientedPipe(shapePts2D, path3D, open = false) {
  if (path3D.length < 2 || shapePts2D.length < 3) return null;

  const n    = shapePts2D.length;
  // How many adjacent pairs to connect per ring. Open = n-1 (skip last→first).
  const segs = open ? n - 1 : n;

  const vArr = [];
  const iArr = [];

  const _right   = new THREE.Vector3();
  const _up      = new THREE.Vector3();
  const _tangent = new THREE.Vector3();

  const rings = path3D.length;

  for (let s = 0; s < rings; s++) {
    const pos = path3D[s];

    if (s === 0) {
      _tangent.subVectors(path3D[1], path3D[0]);
    } else if (s === rings - 1) {
      _tangent.subVectors(path3D[rings - 1], path3D[rings - 2]);
    } else {
      _tangent.subVectors(path3D[s + 1], path3D[s - 1]);
    }
    _tangent.normalize();

    // Stable world-up frame — orientation is correct for any pipe direction
    _right.crossVectors(_tangent, WORLD_UP).normalize();
    if (_right.lengthSq() < 0.001) _right.set(1, 0, 0); // near-vertical pipe fallback
    _up.crossVectors(_right, _tangent).normalize();

    for (const pt of shapePts2D) {
      vArr.push(
        pos.x + _right.x * pt.x + _up.x * pt.y,
        pos.y + _right.y * pt.x + _up.y * pt.y,
        pos.z + _right.z * pt.x + _up.z * pt.y,
      );
    }
  }

  // Side faces
  for (let s = 0; s < rings - 1; s++) {
    for (let i = 0; i < segs; i++) {
      const i2 = open ? i + 1 : (i + 1) % n;
      const a = s       * n + i;
      const b = s       * n + i2;
      const c = (s + 1) * n + i;
      const d = (s + 1) * n + i2;
      iArr.push(a, c, b);
      iArr.push(b, c, d);
    }
  }

  // End caps only for closed profiles (open channels have no end walls)
  if (!open) {
    const cap = (ringStart, flip) => {
      let cx = 0, cy = 0, cz = 0;
      for (let i = 0; i < n; i++) {
        cx += vArr[(ringStart + i) * 3];
        cy += vArr[(ringStart + i) * 3 + 1];
        cz += vArr[(ringStart + i) * 3 + 2];
      }
      vArr.push(cx / n, cy / n, cz / n);
      const ci = vArr.length / 3 - 1;
      for (let i = 0; i < n; i++) {
        const a = ringStart + i, b = ringStart + (i + 1) % n;
        flip ? iArr.push(ci, b, a) : iArr.push(ci, a, b);
      }
    };
    cap(0, false);
    cap((rings - 1) * n, true);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vArr, 3));
  geo.setIndex(iArr);
  geo.computeVertexNormals();
  return geo;
}

// ─── Bauwerkstyp shapes ──────────────────────────────────────────────────

// Pumpwerk: cylinder with a ring on top (wet well)
function buildPumpwerk(r, height) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, height, 16),
    null // material set by caller
  );
  body.position.y = height / 2;
  group.add(body);
  // Small pump symbol on top: a disc
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.6, r * 0.6, 0.15, 16),
    null
  );
  disc.position.y = height + 0.075;
  group.add(disc);
  return group;
}

// Wehr: thin vertical wall (lamellar slab)
function buildWehr(laenge, height, mat) {
  const geo  = new THREE.BoxGeometry(laenge || 1, height, 0.2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = height / 2;
  return mesh;
}

// Speicher / Becken: rectangular basin (flat box)
function buildBecken(r, height, mat) {
  const size = r * 2;
  const geo  = new THREE.BoxGeometry(size, height, size);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = height / 2;
  return mesh;
}

// ─── Helper: resolve effective Bauwerkstyp ───────────────────────────────
// node.type (integer) is the authoritative field: PreprocessingModal always
// writes the user's selection there (even for XML-loaded nodes).
// node.bauwerkstyp is only set by the XML parser and is never updated by the
// modal — so it serves only as a fallback for the initial pre-modal state.
export function getNodeBwType(node) {
  // Priority 1: node.type as integer (set by PreprocessingModal dropdown)
  const t = typeof node.type === 'number' ? node.type : parseInt(node.type);
  if (Number.isFinite(t) && t > 0) return t;
  // Priority 2: bauwerkstyp from XML parser (initial load, before modal apply)
  if (typeof node.bauwerkstyp === 'number' && node.bauwerkstyp > 0) return node.bauwerkstyp;
  return 0;
}

// ─── Scene builder ────────────────────────────────────────────────────────

export function useSceneBuilder() {
  const clickableObjects = [];
  const objectDataMap    = new Map();
  let networkGroup = null;
  let _selectedMesh = null;

  const mats = {
    // Geometry / type materials
    manhole    : new THREE.MeshStandardMaterial({ color: 0x34495e, roughness: 0.7 }),
    fictive    : new THREE.MeshStandardMaterial({ color: 0xe74c3c, roughness: 0.5 }),
    outfall    : new THREE.MeshStandardMaterial({ color: 0x2ecc71, roughness: 0.5 }),
    noGeo      : new THREE.MeshStandardMaterial({ color: 0x7f8c8d, roughness: 0.8 }),
    pumpwerk   : new THREE.MeshStandardMaterial({ color: 0xe67e22, roughness: 0.5 }),
    becken     : new THREE.MeshStandardMaterial({ color: 0x1abc9c, roughness: 0.6 }),
    // Pumpe/Wehr/Drossel/Schieber (Bauwerkstyp 6/7/8/9): in Realität/ISYBAU ein
    // KNOTEN-Element (auch wenn SWMM sie intern als Link führt) — einheitlich
    // hell lila, damit ein Blick "Sonderbauwerk" signalisiert statt vier
    // unterschiedliche Farben je Subtyp zu erfordern.
    sonderbauwerk: new THREE.MeshStandardMaterial({ color: 0xc9a0dc, roughness: 0.45, side: THREE.DoubleSide }),
    circle     : new THREE.MeshStandardMaterial({ color: 0x3498db, roughness: 0.5 }),
    rect       : new THREE.MeshStandardMaterial({ color: 0x8e44ad, roughness: 0.5, side: THREE.DoubleSide }),
    trapez     : new THREE.MeshStandardMaterial({ color: 0x95a5a6, roughness: 0.5, side: THREE.DoubleSide }),
    maul       : new THREE.MeshStandardMaterial({ color: 0x5d8aa8, roughness: 0.5, side: THREE.DoubleSide }),
    // depthWrite:false — transparente, koplanare Flächen dürfen den Tiefenpuffer
    // nicht beschreiben, sonst z-fighten sie gegeneinander und gegen den Boden (Flackern).
    area       : new THREE.MeshBasicMaterial({ color: 0x2980b9, side: THREE.DoubleSide, transparent: true, opacity: 0.25, depthWrite: false }),
    ground     : new THREE.MeshStandardMaterial({ color: 0x1a2035, roughness: 1.0 }),
    selected   : new THREE.MeshStandardMaterial({ color: 0x2ecc71, emissive: 0x1a7a40, roughness: 0.3 }),
    // Result overlay materials
    resOverflow : new THREE.MeshStandardMaterial({ color: 0xc0392b, emissive: 0x6b0000, roughness: 0.4 }),
    resSurcharge: new THREE.MeshStandardMaterial({ color: 0xe67e22, emissive: 0x4a2000, roughness: 0.4 }),
    utilHigh   : new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.4, side: THREE.DoubleSide }),
    utilMed    : new THREE.MeshStandardMaterial({ color: 0xe67e22, roughness: 0.4, side: THREE.DoubleSide }),
    utilLow    : new THREE.MeshStandardMaterial({ color: 0xf1c40f, roughness: 0.4, side: THREE.DoubleSide }),
    utilOk     : new THREE.MeshStandardMaterial({ color: 0x2980b9, roughness: 0.5, side: THREE.DoubleSide }),
    waterLevel : new THREE.MeshStandardMaterial({ color: 0x3498db, transparent: true, opacity: 0.75, roughness: 0.2, emissive: 0x0a2d4a }),
  };

  // Original material cache for restoring after deselect
  const _origMats = new Map();

  function clear(scene) {
    if (networkGroup) {
      networkGroup.traverse(obj => { if (obj.isMesh) obj.geometry?.dispose(); });
      scene.remove(networkGroup);
      networkGroup = null;
    }
    clickableObjects.length = 0;
    objectDataMap.clear();
    _origMats.clear();
    _selectedMesh = null;
  }

  function register(mesh, data, group) {
    group.add(mesh);
    if (data) { objectDataMap.set(mesh, data); clickableObjects.push(mesh); }
  }

  // Highlight selected mesh in green, restore previous
  function setSelected(mesh) {
    if (_selectedMesh && _selectedMesh !== mesh) {
      _selectedMesh.material = _origMats.get(_selectedMesh) ?? _selectedMesh.material;
      _origMats.delete(_selectedMesh);
    }
    if (mesh && mesh !== _selectedMesh) {
      _origMats.set(mesh, mesh.material);
      mesh.material = mats.selected;
    }
    _selectedMesh = mesh ?? null;
  }

  function buildScene(scene, nodes, edges, areas, bounds, options = {}) {
    const {
      showNodes = true, showEdges = true, showAreas = true, zScale = 1,
      showResults = false, showWaterLevel = true,
      nodeResults = new Map(), edgeResults = new Map(),
      hideGround = false,
    } = options;
    clear(scene);
    networkGroup = new THREE.Group();
    networkGroup.name = NETWORK_GROUP;
    scene.add(networkGroup);

    // Platzhalter-Boden nur ohne geladenes DGM (useTerrainLayer.js) — sonst
    // Z-Fighting mit dem echten Geländemesh bei y≈0.
    if (!hideGround) {
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(200000, 200000), mats.ground);
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.05;
      networkGroup.add(ground);
    }

    const doWater = showResults && showWaterLevel;
    if (showNodes) _buildNodes(nodes, edges, bounds, zScale, networkGroup, nodeResults, edgeResults, showResults, doWater);
    if (showEdges) _buildEdges(edges, nodes, bounds, zScale, networkGroup, edgeResults, showResults, doWater);
    if (showAreas) _buildAreas(areas, bounds, networkGroup);
  }

  function _buildNodes(nodes, edges, b, zScale, group, nodeResults, edgeResults, showResults, doWater) {
    for (const node of nodes.values()) {
      if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) continue;

      const x       = node.x - b.centerX;
      const nz      = -(node.y - b.centerY);
      const bottomY = Number.isFinite(node.z) ? (node.z - b.minZ) * zScale : 0;
      let   topY    = bottomY;

      if (Number.isFinite(node.coverZ) && node.coverZ !== null) {
        topY = (node.coverZ - b.minZ) * zScale;
      } else if (node.depth > 0) {
        topY = bottomY + node.depth * zScale;
      } else {
        topY = bottomY + 2 * zScale;
      }

      const height  = Math.max(0.05, topY - bottomY);
      // Enforce minimum visual radius so 200mm manholes stay clickable/visible
      const MIN_R   = 0.3;
      const r       = Math.max(MIN_R, node.diameter > 0 ? node.diameter / 2 : MIN_R);
      // Resolve effective type from both node.bauwerkstyp (XML) and node.type (PreprocessingModal integer)
      const bwType  = getNodeBwType(node);
      let mesh;

      // ── Fictive / Virtuell ──────────────────────────────────────────
      if (node.status === 2) {
        mesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), mats.fictive);
        mesh.position.set(x, bottomY + 0.3, nz);

      // ── Auslass / Outfall (bwType=5 or string 'Auslass') ───────────
      } else if (bwType === 5 || node.type === 'Auslass') {
        mesh = new THREE.Mesh(new THREE.ConeGeometry(r, height, 12), mats.outfall);
        mesh.position.set(x, bottomY + height / 2, nz);

      // ── Pumpwerk (1) ─────────────────────────────────────────────────
      } else if (bwType === 1) {
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, height, 16), mats.pumpwerk);
        mesh.position.set(x, bottomY + height / 2, nz);
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(r * 0.55, r * 0.12, 8, 16),
          mats.pumpwerk
        );
        ring.position.set(x, topY + r * 0.12, nz);
        group.add(ring);

      // ── Pumpe (6) — Sonderbauwerk-Knoten (hell lila) ────────────────
      } else if (bwType === 6) {
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, height, 16), mats.sonderbauwerk);
        mesh.position.set(x, bottomY + height / 2, nz);
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(r * 0.55, r * 0.12, 8, 16),
          mats.sonderbauwerk
        );
        ring.position.set(x, topY + r * 0.12, nz);
        group.add(ring);

      // ── Wehr / Überlauf (7) — Sonderbauwerk-Knoten (hell lila) ──────
      } else if (bwType === 7) {
        // node.weirWidth existierte nie im Domain-Modell (Rename auf wehrWidth) —
        // die UI-Breite wurde hier bisher immer ignoriert.
        const laenge = node.wehrWidth || node.bauwerkData?.wehrLaenge || 1;
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(laenge, height, 0.25),
          mats.sonderbauwerk
        );
        mesh.position.set(x, bottomY + height / 2, nz);

      // ── Becken / Speicher / Kläranlage / Versickerung / Zisterne ────
      } else if ([2, 3, 4, 12, 13].includes(bwType)) {
        const side = r * 2;
        mesh = new THREE.Mesh(new THREE.BoxGeometry(side, height, side), mats.becken);
        mesh.position.set(x, bottomY + height / 2, nz);

      // ── Drossel (8) / Schieber (9) — Sonderbauwerk-Knoten (hell lila) ─
      } else if (bwType === 8 || bwType === 9) {
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, height, 6), mats.sonderbauwerk);
        mesh.position.set(x, bottomY + height / 2, nz);

      // ── Standard Schacht mit Diameter ──────────────────────────────
      } else if (node.diameter > 0) {
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, height, 16), mats.manhole);
        mesh.position.set(x, bottomY + height / 2, nz);

        // Manhole cover disc on top
        const lid = new THREE.Mesh(
          new THREE.CylinderGeometry(r * 0.9, r * 0.9, 0.05, 16),
          mats.noGeo
        );
        lid.position.set(x, topY + 0.025, nz);
        group.add(lid);

      // ── Schacht ohne Diameter (Marker) ─────────────────────────────
      } else {
        mesh = new THREE.Mesh(new THREE.CircleGeometry(0.4, 16), mats.noGeo);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(x, bottomY + 0.02, nz);
      }

      if (!mesh) continue;

      // ── Result-based material override ─────────────────────────────
      if (showResults && node.status !== 2) {
        if (LINK_BAUWERKSTYPEN.has(bwType)) {
          // Pumpe/Wehr/Drossel/Schieber haben selbst kein SWMM-Ergebnis — das
          // liegt an der ausgehenden Haltung (siehe SwmmBuilder.addLinks()).
          // Status trotzdem am KNOTEN zeigen, nicht nur "hell lila" belassen.
          const relatedEdge = Array.from(edges.values()).find(e => (e.fromNodeId ?? e.from) === node.id);
          const res = relatedEdge ? edgeResults.get(relatedEdge.id) : null;
          if (res) {
            const util = res.utilization ?? (res.depthRatio != null ? res.depthRatio * 100 : null);
            if      (util > 90)  mesh.material = mats.resOverflow;
            else if (util >= 75) mesh.material = mats.resSurcharge;
          }
        } else {
          const res = nodeResults.get(node.id);
          if (res) {
            if (res.overflow)   mesh.material = mats.resOverflow;
            else if (res.surcharged) mesh.material = mats.resSurcharge;
          }
        }
      }

      register(mesh, node, group);

      // ── Water-level disc in shaft ───────────────────────────────────
      if (doWater) {
        const res = nodeResults.get(node.id);
        if (res?.reportedMaxDepth > 0) {
          const waterY = bottomY + res.reportedMaxDepth * zScale;
          const clampedY = Math.min(topY - 0.02, Math.max(bottomY + 0.02, waterY));
          const disc = new THREE.Mesh(
            new THREE.CylinderGeometry(r * 0.82, r * 0.82, 0.1, 16),
            mats.waterLevel
          );
          disc.position.set(x, clampedY, nz);
          group.add(disc); // non-clickable
        }
      }
    }
  }

  function _buildEdges(edges, nodes, b, zScale, group, edgeResults, showResults, doWater) {
    for (const edge of edges.values()) {
      const from = nodes.get(edge.fromNodeId || edge.from);
      const to   = nodes.get(edge.toNodeId   || edge.to);
      if (!from || !to) continue;

      const profile = edge.profile || { type: 0, height: 0.3, width: 0.3 };
      const pType   = profile.type;
      const h       = Math.max(0.05, profile.height || 0.3);
      const w       = Math.max(0.05, profile.width  || h);
      const offsetY = (h / 2) * zScale;

      const z1 = getEdgeZ(edge.z1, from.z);
      const z2 = getEdgeZ(edge.z2, to.z);

      let path3D;
      if (edge.coords && edge.coords.length > 1) {
        const count = edge.coords.length;
        path3D = edge.coords.map((p, i) => {
          const elev = Number.isFinite(p.z) ? p.z : lerp(z1, z2, i / (count - 1));
          return new THREE.Vector3(
            p.x - b.centerX,
            (elev - b.minZ) * zScale + offsetY,
            -(p.y - b.centerY)
          );
        });
      } else {
        path3D = [
          new THREE.Vector3(from.x - b.centerX, (z1 - b.minZ) * zScale + offsetY, -(from.y - b.centerY)),
          new THREE.Vector3(to.x   - b.centerX, (z2 - b.minZ) * zScale + offsetY, -(to.y   - b.centerY)),
        ];
      }

      let geo, mat;

      if (pType === 4 || pType === 8) {
        // Trapezkanalquerschnitt — open channel, no top lid
        geo = buildOrientedPipe(trapezoidPts(h, w), path3D, true);
        mat = mats.trapez;
      } else if (pType === 5) {
        // Offenes Rechteckgerinne — open rectangle, no top lid
        geo = buildOrientedPipe(rectPts(h, w), path3D, true);
        mat = mats.rect;
      } else if (pType === 3 || pType === 'Rechteckprofil') {
        // Geschlossenes Rechteckprofil
        geo = buildOrientedPipe(rectPts(h, w), path3D, false);
        mat = mats.rect;
      } else if (pType === 2) {
        // Maulprofil (horseshoe section)
        geo = buildOrientedPipe(maulprofilPts(h, w), path3D, false);
        mat = mats.maul;
      } else if (pType === 1 || pType === 'Egg') {
        // Eiprofil
        geo = buildOrientedPipe(eggPts(h, w), path3D, false);
        mat = mats.circle;
      } else {
        // Kreisprofil (0) — TubeGeometry has its own stable frame
        const curvePath = new THREE.CurvePath();
        for (let i = 0; i < path3D.length - 1; i++) {
          curvePath.add(new THREE.LineCurve3(path3D[i], path3D[i + 1]));
        }
        const steps = Math.max(path3D.length - 1, Math.ceil(curvePath.getLength() * 1.5));
        geo = new THREE.TubeGeometry(curvePath, steps, Math.max(0.02, h / 2), 8, false);
        mat = mats.circle;
      }

      if (!geo) continue;

      // ── Utilization coloring ────────────────────────────────────────
      if (showResults) {
        const res = edgeResults.get(edge.id);
        if (res != null) {
          const util = res.utilization ?? (res.depthRatio != null ? res.depthRatio * 100 : null);
          if      (util > 90) mat = mats.utilHigh;
          else if (util > 75) mat = mats.utilMed;
          else if (util > 50) mat = mats.utilLow;
          else                mat = mats.utilOk;
        }
      }

      register(new THREE.Mesh(geo, mat), edge, group);

      // ── Water-surface ribbon inside pipe ────────────────────────────
      if (doWater) {
        const res = edgeResults.get(edge.id);
        const dr  = res?.depthRatio ?? (res?.utilization != null ? res.utilization / 100 : null);
        if (dr != null && dr > 0.01) {
          const clampedDr = Math.min(dr, 1.0);
          // Y offset from pipe centerline to water surface
          const yOff   = (clampedDr - 0.5) * h * zScale;
          const wPath  = path3D.map(p => new THREE.Vector3(p.x, p.y + yOff, p.z));
          // Ribbon width: slightly inside the pipe walls; for circle use chord formula
          const chord  = (pType === 0)
            ? h * 2 * Math.sqrt(Math.max(0, clampedDr * (1 - clampedDr))) + h * 0.1
            : w * 0.88;
          const sw     = Math.max(0.03, chord);
          const thick  = Math.max(0.03, h * 0.04);
          const wPts   = [
            new THREE.Vector2(-sw / 2,  thick),
            new THREE.Vector2( sw / 2,  thick),
            new THREE.Vector2( sw / 2, -thick),
            new THREE.Vector2(-sw / 2, -thick),
          ];
          const wGeo = buildOrientedPipe(wPts, wPath, false);
          if (wGeo) group.add(new THREE.Mesh(wGeo, mats.waterLevel)); // non-clickable
        }
      }
    }
  }

  function _buildAreas(areas, b, group) {
    let idx = 0;
    for (const area of areas) {
      if (!area.points || area.points.length < 3) continue;
      const shape = new THREE.Shape();
      shape.moveTo(area.points[0].x - b.centerX, -(area.points[0].y - b.centerY));
      for (let i = 1; i < area.points.length; i++) {
        shape.lineTo(area.points[i].x - b.centerX, -(area.points[i].y - b.centerY));
      }
      const geo  = new THREE.ShapeGeometry(shape);
      geo.rotateX(Math.PI / 2);
      const mesh = new THREE.Mesh(geo, mats.area);
      // Höhen leicht staffeln + feste renderOrder: verhindert instabile
      // Transparenz-Sortierung (Flackern) zwischen überlappenden Flächen.
      mesh.position.y = 0.2 + idx * 0.02;
      mesh.renderOrder = 1 + idx;
      idx++;
      register(mesh, area, group);
    }
  }

  function disposeFully(scene) {
    clear(scene);
    Object.values(mats).forEach(m => m.dispose());
  }

  // Dark/Light Umschalter: Platzhalter-Boden füllt fast das ganze Bild —
  // ohne diese Anpassung bliebe die Szene trotz Hintergrundfarben-Wechsel
  // (useThreeCore.setBackground) optisch dunkel.
  function setGroundColor(hex) {
    mats.ground.color.set(hex);
  }

  return { clickableObjects, objectDataMap, buildScene, clear, setSelected, setGroundColor, disposeFully };
}
