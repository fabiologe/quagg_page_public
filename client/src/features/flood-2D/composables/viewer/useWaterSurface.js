/**
 * useWaterSurface.js — Wasser als reine 2D-Haut über dem Gelände.
 *
 * Architektur (bewusst simpel, GPU trennt Geometrie strikt von Transparenz):
 *  - GENAU EIN persistentes Wasser-Mesh. Seine Geometrie ist ein Klon der Terrain-Geometrie
 *    (identische Unterteilung + dieselben ausgestanzten Löcher an Gebäuden/NoData) →
 *    Wasser liegt nie über Gebäude-Footprints, Bauwerke bleiben „harte Blocker".
 *  - Die Geometrie ist STATISCH: das Z-Displacement passiert im Vertex-Shader aus einer
 *    pro Frame aktualisierten RG-Float-Textur (uSurfMap: R = Anzeige-Tiefe, G = Anzeige-WSE).
 *    Statt ~31 MB Positions-Buffer + ~10 MB aDepth je Frame wandert nur die ~21-MB-Textur
 *    zur GPU; die Werte rechnet utils/waterFramePack.js — bevorzugt im waterSurfaceWorker
 *    (off-main-thread) mit kleinem LRU-Cache fürs Playbar-Scrubben.
 *  - Eisenhartes Z-Sorting auf Material-Ebene statt komplexer Geometrie:
 *      Terrain   renderOrder 0, opak,        depthWrite true
 *      Gebäude   renderOrder 5, opak,        depthWrite true   (harte Blocker)
 *      Wasser    renderOrder 20 (zuletzt),   transparent true, depthWrite FALSE, depthTest true
 *    → Wasser wird zuletzt gezeichnet, prüft den Tiefenpuffer (Gebäude/herausragende Bauwerke
 *      blockieren es), schreibt selbst aber nicht hinein (kein z-fighting der Wasserhaut).
 *
 * Die Färbung (Tiefe/Velocity/Hazard) bleibt im Fragment-Shader; Tiefe (vDepth für
 * Discard + Farbe) und Turbulenz kommen als Varyings aus den Textur-Samples im Vertex-Shader.
 */
import { watch } from 'vue';
import * as THREE from 'three';
import { RENDER_ORDER } from '../editor/renderLayers';
import { packWaterFrame, WET } from '../../utils/waterFramePack.js';

// GPU-Displacement: die Geometrie bleibt statisch, Z kommt je Vertex aus uSurfMap
// (R = Anzeige-Tiefe fürs Discard/Farbe, G = Anzeige-WSE inkl. Trockenzellen-Fill — beides
// CPU-seitig in waterFramePack.js gerechnet). Gesampelt wird an TEXEL-ZENTREN: Vertex-uv ist
// c/(ncols-1), Texel-Zentrum (c+0.5)/ncols — ohne die Umrechnung kippt die letzte
// Spalte/Zeile bei Nearest-Filterung durch Float-Rundung.
// aTurb bleibt als Attribut NUR für die Überström-Lamelle (0.6-Schaum-Floor); am Wasser-Mesh
// ist es statisch 0 → max() lässt dort allein die Turbulenz-Textur wirken.
const waterVertexShader = `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute float aTurb;          // Overtop-Floor (Wasser-Mesh: konstant 0)
  varying float vDepth;
  varying float vTurb;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying float vViewW;          // Kamera-Tiefe (= clip.w = -viewZ) für den Grund-Distanz-Vergleich
  uniform float uTime;
  uniform float uLayerMode;      // Daten-Modi (1/2) = stupide Fläche: kein Vertex-Wobble
  uniform sampler2D uSurfMap;    // RG-Float: R = Anzeige-Tiefe, G = Anzeige-WSE (lokal = Welt − minZ)
  uniform sampler2D uTurbMap;    // R8: Turbulenz 0..1 (nur Modus 0 befüllt, sonst 1×1-Null-Fallback)
  uniform vec2 uGridSize;        // ncols/nrows der Frame-Textur (Texel-Zentren treffen)
  void main() {
    vUv = uv;
    vec2 tuv = (uv * (uGridSize - 1.0) + 0.5) / uGridSize;
    vec2 s = texture2D(uSurfMap, tuv).rg;
    vDepth = s.r;
    vTurb = max(texture2D(uTurbMap, tuv).r, aTurb);
    vec3 p = vec3(position.xy, s.g); // Z-Displacement aus der Frame-Textur (Geometrie statisch)
    // Sanfte, animierte Wellen NUR im realistischen Modus 0 und NUR in turbulenten/
    // fließenden Zonen (cm-Bereich) — Daten-Modi zeigen die Fläche exakt wie berechnet.
    float amp = uLayerMode < 0.5 ? 0.05 * vTurb : 0.0;
    p.z += amp * (sin(uv.x * 130.0 + uTime * 3.1) + sin(uv.y * 97.0 - uTime * 2.3)) * 0.5;
    vWorldPos = (modelMatrix * vec4(p, 1.0)).xyz; // Welt-Meter für Wellen/Blickvektor
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    vViewW = gl_Position.w;
    #include <logdepthbuf_vertex>
  }
`;

const waterFragmentShader = `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  varying float vDepth;
  varying float vTurb;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying float vViewW;         // Kamera-Tiefe des Wasser-Fragments (= -viewZ)
  uniform vec3 uColorShallow;
  uniform vec3 uColorMid;
  uniform vec3 uColorDeep;
  uniform float uMaxDepth;      // Skala für Tiefe/Hazard-Farbe
  uniform float uVelocityMin;   // unteres Ende der Geschwindigkeits-Farbskala
  uniform float uVelocityMax;   // oberes Ende der Geschwindigkeits-Farbskala
  uniform float uLayerMode;     // 0=depth (realistisch beleuchtet), 1=velocity, 2=max/hazard
  uniform float uOpacity;       // globale Wasser-Deckkraft 0..1
  uniform float uTime;          // Animationszeit (s) für Gischt
  uniform float uFoam;          // Schaum-Intensität 0..1 (Regler)
  uniform sampler2D uVelocityMap;
  uniform vec3 uSunDir;         // Richtung zur Sonne (normalisiert) — muss zur dirLight-Position in useResultScene.js passen
  uniform vec3 uSkyZenith;      // prozeduraler Himmel (Reflexion): Zenit-Farbe
  uniform vec3 uSkyHorizon;     // prozeduraler Himmel (Reflexion): Horizont-Farbe
  uniform vec3 uSunColor;       // Sonnen-Glint/-Glow-Farbe
  uniform float uWaveAmp;       // globale Wellen-Normalen-Stärke (Tuning)
  uniform vec3 uAbsorb;         // Beer-Lambert-Absorption k je Kanal (1/m) — Rot stirbt zuerst
  uniform sampler2D uSceneTex;  // Szene ohne Wasser (Refraktions-Hintergrund, s. renderRefraction)
  uniform sampler2D uSceneDepth;// zugehöriger Log-Tiefenpuffer → echte Grund-Distanz je Pixel
  uniform float uFarLog2;       // log2(far+1) zum Invertieren des log. Tiefenpuffers
  uniform vec2 uSceneRes;       // Größe von uSceneTex in Device-Pixeln (für gl_FragCoord-Lookup)
  uniform float uHasScene;      // 1 = Refraktions-Pass aktiv (nur Modus 0)
  uniform float uRefractStrength; // Stärke der Grund-Verzerrung (Tuning)
  uniform sampler2D uFlowMap;   // Solver-Vektorfeld Vx/Vy (m/s): +x=Ost(+Welt-X), +y=Süd(+Welt-Z)
  uniform float uHasFlow;       // 1 = Vektorfeld liegt an → Wellen/Gischt physik-gekoppelt

  // Wert-Rauschen für animierte Gischt (kein Texture-Bedarf)
  float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  // Zentraldifferenz-Gradient von vnoise (4 Taps) — für die Wellen-Normale
  vec2 noiseGrad(vec2 p) {
    const float e = 0.35;
    return vec2(vnoise(p + vec2(e, 0.0)) - vnoise(p - vec2(e, 0.0)),
                vnoise(p + vec2(0.0, e)) - vnoise(p - vec2(0.0, e))) / (2.0 * e);
  }

  // BEWUSST KEINE Noise-Advektion und KEINE Fake-Kaustiken mehr: Ping-Pong-Überblendung
  // pulsierte periodisch und Ridge-Noise-Kaustiken waberten — zusammen der „Lavalampen"-
  // Effekt. Die Referenz (evanw/webgl-water) nutzt beides nicht.

  // Gestörte Wasser-Normale in Welt-Metern (Mesh: rotation.x=-PI/2 → ungestörte Normale = +Y).
  // NUR isotropes Mikro-Rauschen: die kohärenten Cosinus-Wellenzüge und die quer zur
  // Strömung gestauchte Rausch-Oktave zeichneten sich als parallele „Fließlinien" über
  // die Fläche. Die BEWEGUNG folgt dem Solver: uFlowMap ist der block-gemittelte
  // Verlaufsvektor (s. applyFlowTexture) — das Muster driftet stromab entlang des
  // groben Trends, Tempo ∝ |v| (gedeckelt, Optik ≠ Tacho). Steht das Wasser (|v|≈0),
  // steht auch das Muster. Ohne Vektorfeld (uHasFlow=0): sanfte Konstant-Drift.
  // Ruhend/Driftend werden als NORMALEN gemischt (nicht die Sample-Koordinate mit
  // der Maske skaliert) — sonst schert das Muster im Übergangsband mit t auf; die
  // Restscherung INNERHALB des Drift-Felds bleibt klein, weil das Feld geglättet ist.
  vec3 waveNormal(vec2 xz, float turb, float t, vec2 flow) {
    float amp = uWaveAmp * (0.10 + 0.55 * turb);   // ruhiges Wasser schimmert leicht mit
    float speed = length(flow);
    vec2 drift = uHasFlow > 0.5
        ? flow * (0.5 * min(speed, 1.5) / max(speed, 1e-4))
        : vec2(0.39, -0.31);
    float move = uHasFlow > 0.5 ? smoothstep(0.03, 0.12, speed) : 1.0;
    vec2 g0 = noiseGrad(xz * 0.9);
    vec2 g1 = noiseGrad((xz - drift * t) * 0.9);
    vec2 g = 0.8 * amp * mix(g0, g1, move);
    return normalize(vec3(-g.x, 1.0, -g.y));
  }

  void main() {
      if (vDepth < 0.005) discard; // trockene Zellen aussparen

      #include <logdepthbuf_fragment>

      vec3 col;
      float F = 0.0;     // Fresnel (nur Modus 0) — außerhalb des Branch deklariert, Alpha greift unten darauf zu
      float spec = 0.0;  // Sonnen-Glint (nur Modus 0)
      float crest = 1.0; // Wellenkamm-Maske (nur Modus 0): bündelt die Gischt auf steilen Flanken
      if (uLayerMode < 0.5) {
          // Solver-Vektorfeld an diesem Pixel (Welt-XZ: +x=Ost, +y=Süd) — geglätteter
          // Drift-Trend für die Oberflächen-Bewegung (nur Modus 0 braucht den Fetch).
          vec2 flowW = uHasFlow > 0.5 ? texture2D(uFlowMap, vUv).xy : vec2(0.0);
          // Mode 0: realistisches Wasser nach dem Prinzip von evanw/webgl-water:
          // Farbe = refraktierter Grund × Absorptions-Tint (Beer-Lambert über die echte
          // Unterwasser-Strecke), Reflexion via Fresnel + Himmel, Sonnen-Glint. KEINE
          // Farb-Rampe im Wasserkörper mehr — die läuft nur noch als Fallback, wenn der
          // Refraktions-Pass (noch) nicht anliegt.
          float t = clamp(vDepth / max(uMaxDepth, 0.01), 0.0, 1.0);
          if (t < 0.5) col = mix(uColorShallow, uColorMid, t * 2.0);
          else          col = mix(uColorMid, uColorDeep, (t - 0.5) * 2.0);

          vec3 V = normalize(cameraPosition - vWorldPos);
          vec3 N = waveNormal(vWorldPos.xz, clamp(vTurb, 0.0, 1.0), uTime, flowW);
          if (!gl_FrontFacing) N = -N;               // DoubleSide: Kamera knapp unter der Haut
          float NdV = max(dot(N, V), 0.0);
          F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);     // Schlick, F0 Wasser = 0.02
          // Kamm-Maske aus der Wellen-Normale: |N.xz| = lokale Steilheit der Welle.
          // Die Gischt unten wird damit multipliziert → sie liegt AUF den Wellen
          // (und wandert mit ihnen), statt als losgelöstes Rauschen zu flackern.
          crest = smoothstep(0.10, 0.35, length(N.xz));

          if (uHasScene > 0.5) {
              // Screen-Space-Refraktion: die Szene ohne Wasser liegt in uSceneTex; die
              // Wellen-Normale verschiebt den Lookup → der Grund „bricht" sich sichtbar.
              vec2 suv = gl_FragCoord.xy / uSceneRes;
              // Echte Unterwasser-Strecke entlang des Blicks aus dem Depth-Pre-Pass:
              // log. Tiefenpuffer invertieren (d = log2(1+w)/log2(1+far) → w = 2^(d·log2(1+far))−1)
              // und Kamera-Tiefe des Grunds minus die des Wasser-Fragments nehmen. Bei
              // streifendem Blick über tiefes Wasser wird der Weg lang → starke Brechung,
              // beim Blick senkrecht in eine flache Pfütze kurz → fast ungebrochen.
              float wGround = exp2(texture2D(uSceneDepth, suv).x * uFarLog2) - 1.0;
              float thick = clamp(wGround - vViewW, 0.0, 12.0);
              vec2 off = N.xz * uRefractStrength * 0.02 * clamp(thick * 0.8, 0.05, 1.3);
              vec3 ground = texture2D(uSceneTex, clamp(suv + off, vec2(0.001), vec2(0.999))).rgb;

              // Beer-Lambert: Grund × exp(−k·Strecke) je Kanal (Rot stirbt zuerst) —
              // EIN physikalischer Tint statt Rampen-Mischung: flach = Grund fast pur,
              // tief = natürlich dunkles Blaugrün. Analog zur Referenz, die den
              // refraktierten Strahl mit einer konstanten waterColor multipliziert.
              col = ground * exp(-uAbsorb * thick);
          }

          // Himmel-Reflexion: Gradient über die Elevation des reflektierten Strahls + Sonnen-Glow
          vec3 R = reflect(-V, N);
          vec3 sky = mix(uSkyHorizon, uSkyZenith, pow(clamp(R.y, 0.0, 1.0), 0.6));
          sky += uSunColor * 0.4 * pow(max(dot(R, uSunDir), 0.0), 64.0);

          // Sonnen-Glint (Blinn-Phong) — moderat, sonst weißes Geflimmer auf großen Flächen
          vec3 H = normalize(uSunDir + V);
          spec = pow(max(dot(N, H), 0.0), 250.0) * F * 12.0;

          col = mix(col, sky, F) + uSunColor * spec;
      } else if (uLayerMode < 1.5) {
          // Mode 1: Geschwindigkeitsbetrag — lineare Heatmap blau → cyan → gelb → rot
          float vmag = texture2D(uVelocityMap, vUv).r;
          float t = clamp((vmag - uVelocityMin) / max(uVelocityMax - uVelocityMin, 1e-4), 0.0, 1.0);
          vec3 c0 = vec3(0.04, 0.20, 0.70); // langsam: blau
          vec3 c1 = vec3(0.00, 0.75, 1.00); // cyan
          vec3 c2 = vec3(1.00, 0.90, 0.00); // gelb
          vec3 c3 = vec3(0.85, 0.05, 0.05); // schnell: rot
          if (t < 0.3333)      col = mix(c0, c1, t / 0.3333);
          else if (t < 0.6666) col = mix(c1, c2, (t - 0.3333) / 0.3333);
          else                 col = mix(c2, c3, (t - 0.6666) / 0.3334);
      } else {
          // Mode 2: Max-Tiefe / Hazard — weiß → violett → dunkelviolett
          float t = clamp(vDepth / max(uMaxDepth, 0.01), 0.0, 1.0);
          vec3 mLow  = vec3(0.95, 0.85, 1.0);
          vec3 mMid  = vec3(0.6,  0.2,  0.9);
          vec3 mHigh = vec3(0.25, 0.0,  0.5);
          if (t < 0.5) col = mix(mLow,  mMid,  t * 2.0);
          else          col = mix(mMid,  mHigh, (t - 0.5) * 2.0);
      }

      // ── Gischt/Schaum in turbulenten Zonen — NUR Modus 0. Die Daten-Modi (Velocity/
      // Hazard) sind eine stupide, flache Datenfläche: keine Gischt, kein Ufersaum,
      // keine Animation — die Färbung zeigt exakt die Solver-Werte.
      float foam = 0.0;
      if (uLayerMode < 0.5) {
          float turb = clamp(vTurb, 0.0, 1.0);
          if (turb > 0.02 && uFoam > 0.001) {
              // Gleichmäßig scrollendes Noise als Aufbrecher (bewusst KEINE Feld-Advektion —
              // die Ping-Pong-Überblendung pulsierte). Die Bewegung stromab entsteht über die
              // Kamm-Maske: die Wellen wandern mit dem Feld, die Gischt sitzt auf den Kämmen.
              float n = vnoise(vWorldPos.xz * 2.3 + vec2(uTime * 0.50, -uTime * 0.35))
                      * vnoise(vWorldPos.xz * 3.7 - vec2(uTime * 0.25,  uTime * 0.40));
              foam = smoothstep(0.20, 0.65, turb) * smoothstep(0.30, 0.80, n) * clamp(uFoam, 0.0, 1.0)
                   * crest; // Gischt an die Wellenkämme binden
          }
          // Ufersaum: schmaler, wabernder Schaumring an der Wasserlinie —
          // bricht die harte Nass/Trocken-Kante auf.
          if (uFoam > 0.001) {
              float shoreN = vnoise(vWorldPos.xz * 1.8 + vec2(uTime * 0.30, -uTime * 0.22));
              float shore = (1.0 - smoothstep(0.02, 0.16, vDepth)) * smoothstep(0.25, 0.75, shoreN);
              foam = max(foam, shore * clamp(uFoam, 0.0, 1.0) * 0.5);
          }
          col = mix(col, vec3(1.0), foam); // weiße Gischt
      }

      // Deckkraft: globaler Slider, weiche Kante bei dünnem Film; Schaum deckt stärker
      // (aufgewühlte Oberfläche), daher alpha Richtung 1 ziehen.
      float aEdge = clamp(vDepth / 0.12, 0.0, 1.0);
      float alpha = mix(0.10, 1.0, clamp(uOpacity, 0.0, 1.0)) * mix(aEdge, 1.0, foam);
      // Streifende Blickwinkel spiegeln → deckender; Glint immer voll sichtbar.
      // (F/spec sind nur in Modus 0 ≠ 0 → Daten-Modi 1/2 bleiben unberührt.)
      alpha = clamp(alpha + F * 0.5 + spec, 0.0, 1.0);
      gl_FragColor = vec4(col, alpha);
  }
`;

/**
 * Bestimmt die Wehr-Kanten (Vertex-Paare) und teilt den Index in:
 *  - baseIndex: alle Dreiecke OHNE Wehr-Kante (dauerhaft sichtbar; Wasser an Wehren getrennt)
 *  - weirTris:  entfernte Dreiecke je `{ a,b,c, keys:[barrierKey] }` (Brücken-Kandidaten beim Überströmen)
 *  - faceMeta:  Map `barrierKey → { va, vb, crestLocal }` (crestLocal = hc - minZ) für den Überström-Test
 * Nur WEHRE (Brücken sind Durchfluss-Öffnungen und bleiben durchgehend).
 */
function buildWeirCut(geometry, weirs, terrain) {
  const index = geometry.getIndex();
  const fallback = { baseIndex: index ? Array.from(index.array) : null, weirTris: [], faceMeta: new Map() };
  if (!index || !weirs || weirs.length === 0 || !terrain) return fallback;
  const { ncols, nrows, cellsize, xllcorner, yllcorner } = terrain;
  const minZ = terrain.minZ ?? 0;

  const faceMeta = new Map();
  const vIdx = (col, geomRow) => geomRow * ncols + col;
  const key = (a, b) => (a < b ? a * (ncols * nrows) + b : b * (ncols * nrows) + a);

  for (const w of weirs) {
    // Öffnungen/Durchlässe (Orifice, Export-Tag '<dir>B') sind DURCHFLUSS — wie Brücken
    // bleiben sie ungeschnitten, damit das Wasser sichtbar hindurchläuft statt an der
    // Wand abzureißen. Nur echte (sperrende) Wehrflächen werden getrennt.
    if (w.orifice || /B$/.test(w.direction || '')) continue;
    const col = Math.floor((w.x - xllcorner) / cellsize);
    const gridRow = Math.floor((w.y - yllcorner) / cellsize); // bottom-up
    const geomRow = (nrows - 1) - gridRow;                     // top-down (Vertex-Zeile)
    if (col < 0 || col >= ncols || geomRow < 0 || geomRow >= nrows) continue;
    const dir = (w.direction || 'S')[0]; // N/S/E/W, 'F'-Suffix ignorieren
    let nc = col, nr = geomRow;
    if (dir === 'N') nr = geomRow - 1;
    else if (dir === 'S') nr = geomRow + 1;
    else if (dir === 'E') nc = col + 1;
    else if (dir === 'W') nc = col - 1;
    if (nc < 0 || nc >= ncols || nr < 0 || nr >= nrows) continue;
    const va = vIdx(col, geomRow), vb = vIdx(nc, nr);
    const k = key(va, vb);
    if (!faceMeta.has(k)) {
      const crestLocal = (typeof w.hc === 'number' ? w.hc : minZ) - minZ;
      faceMeta.set(k, { va, vb, crestLocal });
    }
  }
  if (faceMeta.size === 0) return fallback;

  const src = index.array;
  const baseIndex = [];
  const weirTris = [];
  for (let t = 0; t < src.length; t += 3) {
    const a = src[t], b = src[t + 1], c = src[t + 2];
    const hit = [];
    const ka = key(a, b), kb = key(b, c), kc = key(c, a);
    if (faceMeta.has(ka)) hit.push(ka);
    if (faceMeta.has(kb)) hit.push(kb);
    if (faceMeta.has(kc)) hit.push(kc);
    if (hit.length === 0) baseIndex.push(a, b, c);
    else weirTris.push({ a, b, c, keys: hit });
  }
  return { baseIndex, weirTris, faceMeta };
}

/**
 * @param {object} opts
 * @param {() => THREE.Scene} opts.getScene
 * @param {() => THREE.Mesh}  opts.getTerrainMesh  liefert das Terrain-Mesh (Geometrie wird einmalig geklont)
 * @param {() => Array}       [opts.getWeirFaces]  liefert die Wehre ({x,y,direction}) für den Mesh-Schnitt
 * @param {object} opts.props  reaktive ResultMap3D-Props (depthData/velocityData/velocityMax/…)
 * @param {(stats:{robustMax:number, flagged:Array, ncols:number, nrows:number})=>void} [opts.onStats]
 *        Callback je Frame: robuster Farb-Deckel + erkannte Instabilitäts-/Gefahrenzellen.
 */
export function useWaterSurface({ getScene, getTerrainMesh, getWeirFaces, props, onStats }) {
  let waterMesh = null;
  let belowGround = false;    // Kamera unter dem Gelände → Wasserhaut ausblenden (Kanalnetz-Sicht)
  let overtopCount = 0;       // zuletzt gezeichnete Überfall-Dreiecke (Restore nach belowGround)
  let sourceGeo = null;       // Terrain-Geometrie, aus der geklont wurde (Rebuild-Erkennung)
  let baseZ = null;           // Float32Array: Terrainhöhe je Vertex (WSE-Fallback + Überström-Test)
  let lastVelSrc = null;      // zuletzt hochgeladenes Velocity-Array (Dedupe: update() + Watch feuern je Frame beide)
  let lastFlowSrc = null;     // zuletzt verarbeitetes Flow-Quell-Array (Dedupe wie oben)
  let lastFlowSmoothM = 0;    // Glättungslänge des letzten Flow-Uploads (Live-Tuning invalidiert)
  let velFallbackTex = null;  // 1x1 Dummy, falls kein Velocity-Frame anliegt
  let flowFallbackTex = null; // 1x1 RG-Dummy, falls kein Vektorfeld (Vx/Vy) anliegt
  let surfFallbackTex = null; // 1x1 RG-Dummy für uSurfMap (alles trocken, bis das erste Pack anliegt)
  let turbFallbackTex = null; // 1x1 R8-Null für uTurbMap (Daten-Modi/vor dem ersten Modus-0-Frame)
  // Persistente Frame-Texturen: beim Abspielen wird NUR der Inhalt neu hochgeladen
  // (needsUpdate), statt je Frame Alloc+Dispose — sonst Frame-Drops bei großen Rastern.
  let velTex = null;          // R-Float (Geschwindigkeits-Betrag)
  let flowTex = null;         // RG-Float (Advektions-Vektorfeld)
  let surfTex = null;         // RG-Float: R = Anzeige-Tiefe, G = Anzeige-WSE (Vertex-Displacement)
  let turbTex = null;         // R8: Turbulenz 0..255 (nur Modus 0 befüllt)
  // ── Pack-Pipeline (GPU-Pfad): Worker + LRU + Dedupe ──────────────────────────
  let lastDepthSrc = null;    // zuletzt ANGEWENDETES Tiefen-Array (Dedupe: Watcher feuern mehrfach je Frame)
  let lastPackHadTurb = false;// ob das angewendete Pack Turbulenz enthielt (Modus-0-Wechsel fordert nach)
  const packLru = new Map();  // Tiefen-Array-Ref → { pack, turb, smoothedDepth, robustMax, flagged }
  const PACK_LRU_MAX = 4;     // ≈ 4 × 34 MB — Playbar-Scrub zurück ohne Neuberechnung
  const packScratch = {};     // Temporaries für den synchronen Fallback-Pfad
  let packWorker = null;      // waterSurfaceWorker (Pipeline off-main-thread)
  let packWorkerFailed = false; // Worker bootet nicht → dauerhaft synchroner Fallback
  let workerBaseZ = null;     // baseZ-Referenz, mit der der Worker initialisiert wurde (Rebuild → Re-Init)
  let meshGen = 0;            // Mesh-Aufbau-Generation: verspätete Worker-Antworten eines alten Meshes verwerfen
  let packReqId = 0;          // laufende Request-Nummer
  let packWant = null;        // { raw, turb, reqId } — jüngster angeforderter, noch nicht angewendeter Pack
  let packInflight = false;   // genau EIN Request im Worker; Neuere koaleszieren in packQueued
  let packQueued = null;      // beim Scrubben gewinnt nur der jüngste Request (Zwischenframes überspringen)
  const clock = new THREE.Clock(); // treibt uTime (Gischt-Animation) im Render-Loop
  // Überström-Lamelle (separates Mesh in Signalfarbe, überbrückt pro Frame überströmte Wehr-Kanten)
  let overtopMesh = null;
  let weirTris = null;        // entfernte Wehr-Dreiecke (Brücken-Kandidaten)
  let faceMeta = null;        // Map barrierKey → { va, vb, crestLocal }
  // Screen-Space-Refraktion: Szene OHNE Wasser wird hierhin gerendert; der Modus-0-
  // Shader sampelt sie mit wellen-verschobenem Lookup („Grund bricht sich").
  // WICHTIG fürs Abspielen: der Grund ändert sich nur mit der KAMERA, nicht mit dem
  // Wasser-Frame → neu gerendert wird nur bei Kamerabewegung/Resize (sonst würde das
  // Mega-Terrain jedes Bild doppelt gezeichnet → Frame-Drops bei großen Rastern).
  let refractRT = null;
  let refractValid = false;                 // false = Pass beim nächsten Frame erzwingen
  const lastCamMat = new THREE.Matrix4();
  const lastProjMat = new THREE.Matrix4();
  const rtSize = new THREE.Vector2();

  function getVelFallbackTex() {
    if (!velFallbackTex) {
      velFallbackTex = new THREE.DataTexture(new Float32Array([0]), 1, 1, THREE.RedFormat, THREE.FloatType);
      velFallbackTex.needsUpdate = true;
    }
    return velFallbackTex;
  }

  function getFlowFallbackTex() {
    if (!flowFallbackTex) {
      flowFallbackTex = new THREE.DataTexture(new Float32Array([0, 0]), 1, 1, THREE.RGFormat, THREE.FloatType);
      flowFallbackTex.needsUpdate = true;
    }
    return flowFallbackTex;
  }

  function getSurfFallbackTex() {
    if (!surfFallbackTex) {
      // R=0 (Tiefe) → Fragment-discard überall: Wasser unsichtbar, bis das erste Pack anliegt
      surfFallbackTex = new THREE.DataTexture(new Float32Array([0, 0]), 1, 1, THREE.RGFormat, THREE.FloatType);
      surfFallbackTex.needsUpdate = true;
    }
    return surfFallbackTex;
  }

  function getTurbFallbackTex() {
    if (!turbFallbackTex) {
      turbFallbackTex = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat, THREE.UnsignedByteType);
      turbFallbackTex.needsUpdate = true;
    }
    return turbFallbackTex;
  }

  // Unter dieser Tiefe wird die Advektion impulsbasiert gedämpft: v_eff = q/(cellsize·max(h,H0)).
  // Für h ≥ H0 ist das exakt die Fließgeschwindigkeit (q = v·h); im dünnen Film strebt es
  // gegen 0 → die Textur rast nicht mit voller v über einen 2-cm-Wasserfilm.
  const ADV_H0 = 0.15;

  // Glättungslänge des Drift-Trends in Metern: das Solver-Feld wird auf Blöcke dieser
  // Kantenlänge gemittelt (nur Nasszellen) + 3×3-Blur. Aus vielen kleinen Mosaik-
  // Vektoren wird EIN ruhiger Verlaufsvektor je Region — Zell-Wirbel/Kreisel mitteln
  // sich dabei physikalisch korrekt zu ~0 weg (User: „200 Grüntöne auf 2 mitteln").
  // Live-Tuning in der Dev-Konsole: window.__waterFlowSmoothM = 50
  const FLOW_SMOOTH_M = 25;

  /**
   * Drift-Trend des Frames als GROBE RG-Float-Textur — die Physik-Kopplung der
   * Darstellung: der Shader bewegt das Oberflächen-Schimmern entlang des block-
   * gemittelten Verlaufsvektors (Richtung + Tempo aus dem Solver), stehendes Wasser
   * bleibt ruhig. Konvention wie bei den Fließpfeilen (useFlowArrows):
   * +x = Ost (+Welt-X), +y = Süd (+Welt-Z nach der -PI/2-Mesh-Rotation).
   *
   * BEVORZUGT den Kantenfluss Qx/Qy (m³/s, Impuls): v_eff = q/(cellsize·max(h,H0)) —
   * identisch zu v in normalem Wasser, aber träge im dünnen Film. Die Vorzeichen decken
   * sich mit Vx/Vy, weil handler.py beide durch dasselbe De-Staggering schickt.
   * Fallback: Vx/Vy direkt. NoData-Sentinel (-9999) wird zu 0 (kein Fluss).
   *
   * Mittelung NUR über Nasszellen (h > 1 cm): so behält ein schmaler Fluss durch
   * Trockenland seinen Betrag, während ein See mit drei bewegten Randzellen ruhig
   * bleibt (die vielen v≈0-Wasserzellen ziehen den Block-Mittelwert auf ~0).
   * Die Blockgrenzen sind proportional verteilt (floor(c·cw/ncols)) — deckt sich
   * exakt mit dem vUv-Sampling der groben Textur im Shader.
   */
  function applyFlowTexture(u) {
    // Nur Modus 0 sampelt uFlowMap (Drift-Trend) — in den Daten-Modi die teure
    // Block-Mittelung komplett sparen. Der Modus-Wechsel-Watcher holt sie nach.
    if ((props.layerMode ?? 0) >= 0.5) { lastFlowSrc = null; return; }
    const t = props.terrain;
    const N = t ? t.ncols * t.nrows : 0;
    const q = props.qFluxData;
    const d = props.depthData;
    const depth = (N && d?.length === N) ? d : null;
    const hasQ = !!(q?.qx?.length === N && q?.qy?.length === N && depth && t.cellsize > 0);
    const f = props.flowData;
    const hasV = !!(f?.vx?.length === N && f?.vy?.length === N);
    if (!N || (!hasQ && !hasV)) {
      u.uFlowMap.value = getFlowFallbackTex();
      u.uHasFlow.value = 0;
      lastFlowSrc = null;
      return;
    }

    const smoothM = globalThis.__waterFlowSmoothM ?? FLOW_SMOOTH_M;
    // Dedupe: update() UND der flowData-Watch feuern beim Frame-Wechsel beide —
    // dasselbe Quell-Array nicht zweimal mitteln + hochladen.
    const src = hasQ ? q.qx : f.vx;
    if (src === lastFlowSrc && smoothM === lastFlowSmoothM && flowTex && u.uFlowMap.value === flowTex) return;
    const cellsize = t.cellsize > 0 ? t.cellsize : 1;
    const block = Math.max(1, Math.round(smoothM / cellsize));
    const cw = Math.max(1, Math.ceil(t.ncols / block));
    const ch = Math.max(1, Math.ceil(t.nrows / block));
    const M = cw * ch;

    // Zelle → Block-Spalte/-Zeile (proportional, passend zum UV-Sampling)
    const colLut = new Int32Array(t.ncols);
    for (let c = 0; c < t.ncols; c++) colLut[c] = Math.min(cw - 1, (c * cw / t.ncols) | 0);
    const rowLut = new Int32Array(t.nrows);
    for (let r = 0; r < t.nrows; r++) rowLut[r] = Math.min(ch - 1, (r * ch / t.nrows) | 0);

    const sumX = new Float32Array(M), sumY = new Float32Array(M), wet = new Float32Array(M);
    let i = 0;
    for (let r = 0; r < t.nrows; r++) {
      const rowOff = rowLut[r] * cw;
      for (let c = 0; c < t.ncols; c++, i++) {
        const h = depth ? depth[i] : NaN;
        // Ohne Tiefen-Raster (reiner Vx/Vy-Fall) zählen alle Zellen — konservativ.
        if (depth && !(Number.isFinite(h) && h > 0.01)) continue;
        let vx, vy;
        if (hasQ) {
          const denom = cellsize * Math.max(h > 0 ? h : 0, ADV_H0);
          const qx = q.qx[i], qy = q.qy[i];
          vx = (Number.isFinite(qx) && qx > -9000) ? qx / denom : 0;
          vy = (Number.isFinite(qy) && qy > -9000) ? qy / denom : 0;
        } else {
          const fx = f.vx[i], fy = f.vy[i];
          vx = (Number.isFinite(fx) && fx > -9000) ? fx : 0;
          vy = (Number.isFinite(fy) && fy > -9000) ? fy : 0;
        }
        const b = rowOff + colLut[c];
        sumX[b] += vx; sumY[b] += vy; wet[b] += 1;
      }
    }
    for (let b = 0; b < M; b++) {
      const w = wet[b];
      if (w > 0) { sumX[b] /= w; sumY[b] /= w; }
    }

    // 3×3-Box-Blur auf dem groben Gitter: weiche Übergänge ZWISCHEN den Blöcken
    // (zusätzlich zur bilinearen Textur-Filterung); Trockenblöcke (0) dämpfen die
    // Ufer sanft ab — gewollt, Glättung ist der Schlüssel zum ruhigen Wasserbild.
    const smX = new Float32Array(M), smY = new Float32Array(M);
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        let ax = 0, ay = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy; if (yy < 0 || yy >= ch) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx; if (xx < 0 || xx >= cw) continue;
            const b = yy * cw + xx;
            ax += sumX[b]; ay += sumY[b]; n++;
          }
        }
        const o = y * cw + x;
        smX[o] = ax / n; smY[o] = ay / n;
      }
    }

    if (!flowTex || flowTex.image.width !== cw || flowTex.image.height !== ch) {
      if (flowTex) flowTex.dispose();
      flowTex = new THREE.DataTexture(new Float32Array(M * 2), cw, ch, THREE.RGFormat, THREE.FloatType);
      flowTex.flipY = true; // gleiche Konvention wie die Velocity-Betrag-Textur
      // Bilinear: interpoliert den groben Trend weich zwischen den Blöcken.
      // (Float-Linear ist auf WebGL2-Desktops Standard; ohne die Extension sampelt
      // die Textur als 0 → Fallback ist ruhende Oberfläche, kein Fehlerbild.)
      flowTex.magFilter = THREE.LinearFilter;
      flowTex.minFilter = THREE.LinearFilter;
    }
    const data = flowTex.image.data;
    for (let b = 0; b < M; b++) { data[b * 2] = smX[b]; data[b * 2 + 1] = smY[b]; }
    flowTex.needsUpdate = true;
    u.uFlowMap.value = flowTex;
    u.uHasFlow.value = 1;
    lastFlowSrc = src;
    lastFlowSmoothM = smoothM;
  }

  /** Velocity-Textur (Betrag) für die Heatmap aktualisieren — persistente Textur,
   *  je Frame nur Re-Upload (Nearest bleibt: die Heatmap zeigt DATEN, keine Optik).
   *  NUR Modus 1 sampelt sie — in allen anderen Modi den 10-MB-Upload je Frame sparen;
   *  der Modus-Wechsel-Watcher lädt beim Umschalten frisch. */
  function applyVelocityTexture(u) {
    if ((props.layerMode ?? 0) !== 1) { lastVelSrc = null; return; }
    const t = props.terrain;
    const v = props.velocityData;
    const N = t ? t.ncols * t.nrows : 0;
    if (!N || !v || v.length !== N) { u.uVelocityMap.value = getVelFallbackTex(); lastVelSrc = null; return; }
    // Dedupe: update() UND der velocityData-Watch feuern beim Frame-Wechsel beide.
    if (v === lastVelSrc && velTex && u.uVelocityMap.value === velTex) return;
    if (!velTex || velTex.image.width !== t.ncols || velTex.image.height !== t.nrows) {
      if (velTex) velTex.dispose();
      velTex = new THREE.DataTexture(new Float32Array(N), t.ncols, t.nrows, THREE.RedFormat, THREE.FloatType);
      velTex.flipY = true; // gleiche Konvention wie zuvor
    }
    velTex.image.data.set(v);
    velTex.needsUpdate = true;
    u.uVelocityMap.value = velTex;
    lastVelSrc = v;
  }

  function applyOpacity() {
    const op = props.waterOpacity ?? 0.85;
    if (waterMesh?.material?.uniforms) waterMesh.material.uniforms.uOpacity.value = op;
    if (overtopMesh?.material?.uniforms) overtopMesh.material.uniforms.uOpacity.value = op;
  }

  /**
   * Stellt das persistente Wasser-Mesh sicher (einmaliger Klon der Terrain-Geometrie).
   * Erkennt einen Terrain-Rebuild (neue Geometrie-Identität) und klont dann neu.
   * @returns {boolean} true, wenn ein gültiges Mesh bereitsteht
   */
  function ensureMesh() {
    const scene = getScene();
    const terrainMesh = getTerrainMesh();
    if (!scene || !terrainMesh) return false;
    if (waterMesh && sourceGeo === terrainMesh.geometry) return true;

    // Stale Meshes (Terrain wurde neu gebaut) entfernen
    if (waterMesh) {
      scene.remove(waterMesh);
      waterMesh.geometry.dispose();
      waterMesh.material.dispose();
      waterMesh = null;
    }
    if (overtopMesh) {
      scene.remove(overtopMesh);
      overtopMesh.geometry.dispose();
      // Material wird mit dem Wasser-Mesh geteilt → NICHT separat disposen (sonst doppelt).
      overtopMesh = null;
    }

    meshGen++;                 // verspätete Worker-Antworten des alten Meshes verwerfen
    lastDepthSrc = null;
    lastPackHadTurb = false;
    packLru.clear();
    packWant = null;
    packQueued = null;

    const geometry = terrainMesh.geometry.clone(); // identische Unterteilung + ausgestanzte Löcher
    // Wehr-Schnitt vorbereiten: Hauptindex getrennt (baseIndex), Brücken-Dreiecke + Krone separat halten.
    const cut = buildWeirCut(geometry, getWeirFaces?.() || [], props.terrain);
    weirTris = cut.weirTris;
    faceMeta = cut.faceMeta;
    if (cut.baseIndex) geometry.setIndex(cut.baseIndex); // an Wehren getrennt (statisch)
    const pos = geometry.attributes.position;
    const N = pos.count;

    // Terrain-Z je Vertex sichern — Basis für den WSE-Fallback (baseZ+Tiefe) und den
    // Überström-Test in fillOvertop; position.z selbst bleibt unangetastet (Shader displaced).
    baseZ = new Float32Array(N);
    for (let i = 0; i < N; i++) baseZ[i] = pos.getZ(i);

    // Turbulenz-Attribut: statisch 0 (einmaliger Upload), dient nur als max()-Basis gegen
    // die uTurbMap — die Überström-Lamelle nutzt DASSELBE Material und hebt über ihr
    // eigenes (pro Frame gefülltes) aTurb den 0.6-Schaum-Floor.
    geometry.setAttribute('aTurb', new THREE.BufferAttribute(new Float32Array(N), 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uVelocityMap:  { value: getVelFallbackTex() }, // echter Inhalt via applyVelocityTexture()
        uVelocityMin:  { value: props.velocityMin || 0.0 },
        uVelocityMax:  { value: props.velocityMax || 1.0 },
        uMaxDepth:     { value: props.maxWaterDepth || 1.0 },
        uLayerMode:    { value: props.layerMode ?? 0 },
        uOpacity:      { value: props.waterOpacity ?? 0.85 },
        uTime:         { value: 0.0 },
        uFoam:         { value: props.foamIntensity ?? 1.0 },
        uColorShallow: { value: new THREE.Color(0x00e5ff) },
        uColorMid:     { value: new THREE.Color(0x0078d7) },
        uColorDeep:    { value: new THREE.Color(0x00008b) },
        // ── Realistische Beleuchtung (Modus 0) ─────────────────────────────
        // uSunDir = normalisierte dirLight-Position aus useResultScene.js — bei
        // Licht-Änderung dort BEIDE Stellen anpassen, sonst wandert der Glint.
        uSunDir:       { value: new THREE.Vector3(200, 600, 200).normalize() },
        uSkyZenith:    { value: new THREE.Color(0x0d1b3a) }, // dunkles Nachtblau, passend zum 0x0a0a1a-Hintergrund
        uSkyHorizon:   { value: new THREE.Color(0x3a5a8c) },
        uSunColor:     { value: new THREE.Color(0xfff2d0) },
        uWaveAmp:      { value: 1.0 },
        uAbsorb:       { value: new THREE.Vector3(0.50, 0.20, 0.08) }, // k je Kanal (1/m): Tint des refraktierten Grunds
        // Screen-Space-Refraktion (von renderRefraction() pro Frame befüllt)
        uSceneTex:        { value: getVelFallbackTex() }, // Platzhalter bis zum ersten Pass
        uSceneDepth:      { value: getVelFallbackTex() }, // Platzhalter; echte DepthTexture ab Pass 1
        uFarLog2:         { value: 1.0 },
        uSceneRes:        { value: new THREE.Vector2(1, 1) },
        uHasScene:        { value: 0 },
        uRefractStrength: { value: 1.0 }, // Tuning: Stärke der Grund-Verzerrung
        // Physik-Kopplung: Solver-Vektorfeld treibt Wellenrichtung + Advektion
        uFlowMap:         { value: getFlowFallbackTex() },
        uHasFlow:         { value: 0 },
        // GPU-Displacement: Frame-Texturen (von applyPack() pro Frame befüllt)
        uSurfMap:         { value: getSurfFallbackTex() },
        uTurbMap:         { value: getTurbFallbackTex() },
        uGridSize:        { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: waterVertexShader,
      fragmentShader: waterFragmentShader,
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: true,    // prüft, ob ein Bauwerk im Weg ist → herausragende Teile blockieren das Wasser
      depthWrite: false,  // schreibt NICHT in den Tiefenpuffer → kein z-fighting der Wasserhaut
    });

    // Live-Tuning in der Dev-Konsole: z. B. __waterU.uWaveAmp.value = 0.5
    // (Uniforms wirken sofort, ohne Rebuild — nur Werte, die im Shader hart
    //  kodiert sind, brauchen einen Code-Edit.)
    if (import.meta.env.DEV) window.__waterU = material.uniforms;

    waterMesh = new THREE.Mesh(geometry, material);
    waterMesh.rotation.x = -Math.PI / 2;       // gleiche Transform wie das Terrain
    waterMesh.renderOrder = RENDER_ORDER.WATER; // wird nach allen festen Bauwerken gezeichnet
    // uTime je gerendertem Bild fortschreiben → animierte Gischt/Wellen laufen auch bei
    // pausiertem Frame-Slider weiter (Animation ≠ Simulationszeit).
    waterMesh.onBeforeRender = () => { material.uniforms.uTime.value = clock.getElapsedTime(); };
    scene.add(waterMesh);
    sourceGeo = terrainMesh.geometry;

    // Überström-Brücke: separates Mesh, das pro Frame die an Wehren entfernten Dreiecke
    // wieder einsetzt, SOBALD dort Wasser durchläuft (Überfall/eingestaut). Es nutzt
    // DASSELBE Wasser-Material (Tiefe/Geschwindigkeits-Färbung, Deckkraft) → die
    // Überström-Fläche fügt sich nahtlos in den umgebenden Wasserkörper ein und folgt
    // der Strömungsfarbe, statt als harte Signal-Bande abzureißen. Braucht daher auch
    // das uv-Attribut (Velocity-Textur).
    if (weirTris && weirTris.length > 0) {
      const cap = weirTris.length * 3; // max. Vertices (alle Brücken-Dreiecke gleichzeitig)
      const og = new THREE.BufferGeometry();
      og.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cap * 3), 3));
      og.setAttribute('aTurb', new THREE.BufferAttribute(new Float32Array(cap), 1));
      og.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(cap * 2), 2));
      overtopMesh = new THREE.Mesh(og, material); // geteiltes Wasser-Material → nahtlose Färbung
      overtopMesh.rotation.x = -Math.PI / 2;
      overtopMesh.renderOrder = RENDER_ORDER.WATER + 1; // knapp über dem Wasser
      overtopMesh.frustumCulled = false;
      og.setDrawRange(0, 0);
      scene.add(overtopMesh);
    }
    return true;
  }

  /** Füllt die Wehr-Brücke: setzt die geschnittenen Dreiecke wieder ein, sobald dort Wasser
   *  durchläuft — Überfall (eine Seite über Krone) ODER eingestaut (beide Seiten nass). So
   *  schließt sich die Lücke direkt am Wehr; nur ein echter Trocken-Stau bleibt getrennt. */
  /** @param {Float32Array} depth  geglättete Anzeige-Tiefe (aus dem Pack)
   *  @param {Uint8Array|null} turbBytes  Turbulenz 0..255 je Zelle (null in den Daten-Modi) */
  function fillOvertop(depth, turbBytes) {
    if (!overtopMesh || !weirTris || weirTris.length === 0 || !faceMeta) return;
    const EPS = 0.02;
    // Aktive Wehr-Kanten ermitteln:
    //  • Überfall:   Oberwasser ≥ Krone  → Wasser stürzt über die Wand
    //  • Eingestaut: BEIDE Seiten nass   → Wasser ist durchgehend, Wand ist überflutet
    // Nur „trocken im Unterwasser + unter Krone" bleibt getrennt (Wand hält das Wasser).
    const over = new Set();
    for (const [k, m] of faceMeta) {
      const da = depth[m.va], db = depth[m.vb];
      const sa = baseZ[m.va] + (da > 0 ? da : 0);
      const sb = baseZ[m.vb] + (db > 0 ? db : 0);
      const overfall = Math.max(sa, sb) >= m.crestLocal - EPS;
      const submerged = da > WET && db > WET;
      if (overfall || submerged) over.add(k);
    }

    const srcPos = waterMesh.geometry.attributes.position.array;
    const srcUv  = waterMesh.geometry.attributes.uv?.array;
    const opos = overtopMesh.geometry.attributes.position.array;
    const ouv  = overtopMesh.geometry.attributes.uv.array;
    const oturb = overtopMesh.geometry.attributes.aTurb.array;
    let v = 0;
    for (const tri of weirTris) {
      // Sobald MINDESTENS eine Kante des Dreiecks überströmt ist, wird es eingesetzt;
      // trockene Ecken haben vDepth≈0 und werden im Fragment ausgespart → die Fläche
      // läuft weich Richtung Unterwasser aus, statt hart zu poppen.
      let any = false;
      for (const k of tri.keys) { if (over.has(k)) { any = true; break; } }
      if (!any) continue;
      for (const vi of [tri.a, tri.b, tri.c]) {
        // x/y vom Wasser-Mesh; das kopierte z ist egal — der Shader displaced über das
        // mitkopierte uv aus derselben Frame-Textur wie der umgebende Wasserkörper.
        opos[v * 3]     = srcPos[vi * 3];
        opos[v * 3 + 1] = srcPos[vi * 3 + 1];
        opos[v * 3 + 2] = srcPos[vi * 3 + 2];
        // Überfall ist per se aufgewühlt → Turbulenz mind. 0.6, damit dort Gischt schäumt.
        oturb[v]        = Math.max(0.6, turbBytes ? turbBytes[vi] / 255 : 0.6);
        if (srcUv) { ouv[v * 2] = srcUv[vi * 2]; ouv[v * 2 + 1] = srcUv[vi * 2 + 1]; }
        v++;
      }
    }
    overtopMesh.geometry.attributes.position.needsUpdate = true;
    overtopMesh.geometry.attributes.aTurb.needsUpdate = true;
    overtopMesh.geometry.attributes.uv.needsUpdate = true;
    overtopMesh.geometry.setDrawRange(0, v);
    overtopCount = v;
    overtopMesh.visible = v > 0 && !belowGround;
  }

  /** Neues Tiefen-Frame: Anzeige-Daten packen (waterFramePack via Worker/LRU) und als
   *  Frame-Textur fürs Vertex-Shader-Displacement anwenden. */
  function update(depthData) {
    if (!ensureMesh()) return;
    const pos = waterMesh.geometry.attributes.position;
    const N = pos.count;
    const raw = depthData instanceof Float32Array ? depthData : new Float32Array(depthData);
    if (raw.length !== N) {
      console.warn(`[WaterSurface] depth frame length ${raw.length} ≠ vertex count ${N} — skipped.`);
      return;
    }
    const { ncols, nrows } = props.terrain;
    if (!(ncols && nrows && ncols * nrows === N)) {
      // Kann regulär nicht auftreten (Geometrie und Frames stammen aus demselben Raster);
      // ohne Raster-Maße gibt es weder Textur-Dimensionen noch Glättung/Trocken-Fill.
      console.warn(`[WaterSurface] Terrain-Raster ${ncols}×${nrows} ≠ vertex count ${N} — Frame übersprungen.`);
      hide();
      return;
    }
    const optics = (props.layerMode ?? 0) < 0.5; // Modus 0 braucht Turbulenz
    const u = waterMesh.material.uniforms;

    updateFrameTexture(raw, optics, u);

    // Färbungs-/Skalen-Uniforms mitführen (pfadunabhängig; laufen auch bei Pack-Dedupe,
    // z. B. wenn nur der Layer-Modus oder die Deckkraft wechselt)
    applyVelocityTexture(u);
    u.uVelocityMin.value = props.velocityMin || 0.0;
    u.uVelocityMax.value = props.velocityMax || 1.0;
    applyFlowTexture(u); // Vx/Vy des Frames → Wellen-/Gischt-Advektion
    applyOpacity();

    waterMesh.visible = !belowGround;
  }

  /**
   * Kamera unter dem Gelände (Kanalnetz-Inspektion): Wasserhaut + Überfall-Streifen
   * ausblenden — die Haut ist für Draufsicht gebaut und zeigt von ganz unten Artefakte.
   * Wird pro Render-Frame aus dem Loop aufgerufen; no-op solange der Zustand gleich bleibt.
   */
  function setBelowGround(v) {
    if (v === belowGround) return;
    belowGround = v;
    if (waterMesh) waterMesh.visible = !v;
    if (overtopMesh) overtopMesh.visible = !v && overtopCount > 0;
  }

  /** Pack aus LRU/Worker/synchronem Fallback besorgen und als Frame-Textur anwenden. */
  function updateFrameTexture(raw, optics, u) {
    // Dedupe: update() + Watcher feuern je Frame mehrfach (Frame-Wechsel, Modus-Wechsel) —
    // nur neu packen, wenn das Quell-Array wechselt oder Modus 0 die Turbulenz nachfordert.
    if (raw === lastDepthSrc && (!optics || lastPackHadTurb) && surfTex && u.uSurfMap.value === surfTex) return;
    // ... oder genau dieses Frame schon im Worker unterwegs ist
    if (packWant && packWant.raw === raw && (!optics || packWant.turb)) return;

    const cached = packLru.get(raw);
    if (cached && (!optics || cached.turb)) {
      packLru.delete(raw); packLru.set(raw, cached); // LRU: Treffer auffrischen
      applyPack(raw, cached, u);
      return;
    }

    const t = props.terrain;
    const N = raw.length;
    const job = {
      type: 'pack',
      depth: raw,
      elev: (props.elevData instanceof Float32Array && props.elevData.length === N) ? props.elevData : null,
      velocity: (optics && props.velocityData instanceof Float32Array && props.velocityData.length === N)
        ? props.velocityData : null,
      detectSpikes: props.detectSpikes !== false,
      wantTurb: optics,
    };

    const worker = getPackWorker();
    if (worker) {
      job.reqId = ++packReqId;
      job.gen = meshGen;
      packWant = { raw, turb: optics, reqId: job.reqId };
      if (packInflight) { packQueued = job; return; } // Koaleszierung: nur der jüngste Request gewinnt
      packInflight = true;
      worker.postMessage(job);
      return;
    }

    // Synchroner Fallback (Worker bootet nicht, z. B. exotisches Embedding)
    const res = packWaterFrame({
      depth: raw, elev: job.elev, velocity: job.velocity,
      baseZ, ncols: t.ncols, nrows: t.nrows, minZ: t.minZ ?? 0, cellsize: t.cellsize || 0,
      detectSpikes: job.detectSpikes, wantTurb: optics,
    }, packScratch);
    lruPut(raw, res);
    applyPack(raw, res, u);
  }

  function lruPut(raw, entry) {
    packLru.delete(raw);
    packLru.set(raw, entry);
    while (packLru.size > PACK_LRU_MAX) packLru.delete(packLru.keys().next().value);
  }

  /** Pack-Ergebnis auf GPU-Texturen + Overtop-Lamelle anwenden (LRU-Hit, Sync- oder Worker-Ergebnis). */
  function applyPack(raw, entry, u) {
    const { ncols, nrows } = props.terrain;
    if (!surfTex || surfTex.image.width !== ncols || surfTex.image.height !== nrows) {
      if (surfTex) surfTex.dispose();
      surfTex = new THREE.DataTexture(entry.pack, ncols, nrows, THREE.RGFormat, THREE.FloatType);
      surfTex.flipY = true; // gleiche Konvention wie velTex (top-down-Frames, Nearest, keine Mips)
    } else {
      // Pointer-Swap statt 21-MB-Kopie — die LRU-Einträge besitzen ihre Arrays exklusiv
      surfTex.image.data = entry.pack;
    }
    surfTex.needsUpdate = true;
    u.uSurfMap.value = surfTex;
    u.uGridSize.value.set(ncols, nrows);

    if (entry.turb) {
      if (!turbTex || turbTex.image.width !== ncols || turbTex.image.height !== nrows) {
        if (turbTex) turbTex.dispose();
        turbTex = new THREE.DataTexture(entry.turb, ncols, nrows, THREE.RedFormat, THREE.UnsignedByteType);
        turbTex.flipY = true;
        // Linear: weiche Schaumband-Kanten — wie zuvor die Interpolation des Vertex-Attributs
        turbTex.magFilter = THREE.LinearFilter;
        turbTex.minFilter = THREE.LinearFilter;
        turbTex.unpackAlignment = 1; // 1-Byte-Zeilen: nicht auf 4er-Alignment verlassen
      } else {
        turbTex.image.data = entry.turb;
      }
      turbTex.needsUpdate = true;
      u.uTurbMap.value = turbTex;
    } else {
      u.uTurbMap.value = getTurbFallbackTex(); // Daten-Modi: Turbulenz aus (vTurb = 0)
    }

    // Bei erkannten Dornen die Farbskala auf den robusten Deckel legen (sonst staucht
    // ein 10-m-Ausreißer alles auf Blau). Ohne Funde: bisheriges Verhalten beibehalten.
    u.uMaxDepth.value = entry.flagged.length ? entry.robustMax : (props.maxWaterDepth || 1.0);
    if (onStats) onStats({ robustMax: entry.robustMax, flagged: entry.flagged, ncols, nrows });
    fillOvertop(entry.smoothedDepth, entry.turb); // Überström-Lamelle aktualisieren

    lastDepthSrc = raw;
    lastPackHadTurb = !!entry.turb;
    // Alles Ältere ist obsolet: ein noch laufender Worker-Request landet nur im LRU
    packWant = null;
    packQueued = null;
  }

  function getPackWorker() {
    if (packWorkerFailed) return null;
    if (!packWorker) {
      try {
        packWorker = new Worker(new URL('../../workers/waterSurfaceWorker.js', import.meta.url), { type: 'module' });
        packWorker.onmessage = onPackMessage;
        packWorker.onerror = (err) => {
          console.warn('[WaterSurface] Pack-Worker-Fehler — dauerhaft synchroner Fallback.', err?.message || err);
          packWorkerFailed = true;
          try { packWorker.terminate(); } catch { /* egal */ }
          packWorker = null;
          workerBaseZ = null;
          packInflight = false;
          packQueued = null;
          packWant = null; // sonst bliebe das Frame bis zum nächsten Wechsel „hängend"
        };
      } catch (err) {
        console.warn('[WaterSurface] Pack-Worker nicht verfügbar — synchroner Fallback.', err?.message || err);
        packWorkerFailed = true;
        packWorker = null;
        return null;
      }
    }
    // baseZ je Mesh-Aufbau EINMAL in den Worker spiegeln (Rebuild → neue Referenz → Re-Init)
    if (workerBaseZ !== baseZ) {
      const t = props.terrain;
      packWorker.postMessage({
        type: 'init', baseZ,
        ncols: t.ncols, nrows: t.nrows, minZ: t.minZ ?? 0, cellsize: t.cellsize || 0,
      });
      workerBaseZ = baseZ;
    }
    return packWorker;
  }

  function onPackMessage(e) {
    const m = e.data;
    if (m?.type !== 'packed') return;
    packInflight = false;
    // Koaleszierter Nachzügler zuerst losschicken (falls das Ergebnis unten gleich angewendet
    // wird, räumt applyPack packQueued wieder ab — dann war dieser Send umsonst, aber harmlos)
    if (packQueued && packWorker) {
      const q = packQueued;
      packQueued = null;
      packInflight = true;
      packWorker.postMessage(q);
    }
    if (m.gen !== meshGen) return; // Mesh wurde neu gebaut → Dimensionen/baseZ passen nicht mehr
    const entry = {
      pack: m.pack, turb: m.turb || null, smoothedDepth: m.smoothedDepth,
      robustMax: m.robustMax, flagged: m.flagged,
    };
    const raw = packWant && packWant.reqId === m.reqId ? packWant.raw : null;
    if (raw) {
      lruPut(raw, entry);
      if (waterMesh?.material?.uniforms) applyPack(raw, entry, waterMesh.material.uniforms);
    }
    // Ergebnisse überholter Requests werden verworfen (raw-Referenz nicht mehr zuordenbar —
    // den LRU nur mit sicher zugeordneten Frames füllen)
  }

  function hide() {
    if (waterMesh) waterMesh.visible = false;
    if (overtopMesh) overtopMesh.visible = false;
  }

  /**
   * Pre-Render-Pass (vom Render-Loop VOR dem Haupt-Render aufgerufen): rendert die Szene
   * ohne Wasser/Overlays in ein RenderTarget, das der Modus-0-Shader als Refraktions-
   * Hintergrund sampelt. Ausgeblendet wird alles ab renderOrder WATER (Wasserhaut,
   * Überström-Lamelle, Pfeile/Strömungslinien) — das RT zeigt also nur den „Grund".
   * Läuft nur im Tiefen-Modus (uLayerMode 0); Daten-Modi kosten keinen Extra-Pass.
   */
  function renderRefraction(renderer, scene, camera) {
    const u = waterMesh?.material?.uniforms;
    if (!u) return;
    if (!waterMesh.visible || u.uLayerMode.value >= 0.5) { u.uHasScene.value = 0; return; }

    renderer.getDrawingBufferSize(rtSize);
    // Halbe Auflösung: ¼ Füllrate für den Extra-Pass — beim wellen-verzerrten Grund
    // nicht sichtbar (das lineare Upsampling wirkt sogar wie ein leichter Blur, den
    // echtes Wasser ohnehin hätte). Bei großen Rastern (>1600² Zellen) spürbar.
    const REFRACT_SCALE = 0.5;
    const rw = Math.max(1, Math.round(rtSize.x * REFRACT_SCALE));
    const rh = Math.max(1, Math.round(rtSize.y * REFRACT_SCALE));
    if (!refractRT) {
      // DepthTexture (32F): der Shader rekonstruiert daraus die ECHTE Grund-Distanz je
      // Pixel → Refraktionsstärke folgt der tatsächlichen Unterwasser-Strecke.
      refractRT = new THREE.WebGLRenderTarget(rw, rh, {
        depthTexture: new THREE.DepthTexture(rw, rh, THREE.FloatType),
      });
      // explizit weiches Upsampling des halb aufgelösten RT (kein Pixel-Raster)
      refractRT.texture.magFilter = THREE.LinearFilter;
      refractRT.texture.minFilter = THREE.LinearFilter;
      refractValid = false;
    } else if (refractRT.width !== rw || refractRT.height !== rh) {
      refractRT.setSize(rw, rh); // passt die DepthTexture mit an
      refractValid = false;
    }

    const camMoved = !lastCamMat.equals(camera.matrixWorld) || !lastProjMat.equals(camera.projectionMatrix);
    if (!refractValid || camMoved) {
      const hidden = [];
      scene.traverse((o) => {
        if (o.visible && o.renderOrder >= RENDER_ORDER.WATER) { o.visible = false; hidden.push(o); }
      });
      const prevRT = renderer.getRenderTarget();
      renderer.setRenderTarget(refractRT);
      renderer.render(scene, camera);
      renderer.setRenderTarget(prevRT);
      for (const o of hidden) o.visible = true;
      lastCamMat.copy(camera.matrixWorld);
      lastProjMat.copy(camera.projectionMatrix);
      refractValid = true;
    }

    u.uSceneTex.value = refractRT.texture;
    u.uSceneDepth.value = refractRT.depthTexture;
    // Log-Tiefenpuffer-Konstante zum Invertieren: d = log2(1+w)/log2(1+far)
    u.uFarLog2.value = Math.log2(camera.far + 1.0);
    // VOLLE Puffergröße, nicht die RT-Größe: gl_FragCoord (Device-Pixel) wird damit auf
    // [0,1] normiert — das halb aufgelöste RT deckt denselben Bildausschnitt ab.
    u.uSceneRes.value.set(rtSize.x, rtSize.y);
    u.uHasScene.value = 1;
  }

  /** Mesh-Referenzen lösen (nach GPU-Purge) → nächster update() klont frisch. */
  function reset() {
    if (refractRT) { refractRT.dispose(); refractRT = null; }
    refractValid = false;
    if (velTex) { velTex.dispose(); velTex = null; }
    if (flowTex) { flowTex.dispose(); flowTex = null; }
    if (surfTex) { surfTex.dispose(); surfTex = null; }
    if (turbTex) { turbTex.dispose(); turbTex = null; }
    lastVelSrc = null;
    lastFlowSrc = null;
    lastDepthSrc = null;
    lastPackHadTurb = false;
    packLru.clear();
    packWant = null;
    packQueued = null;
    packInflight = false;
    // Worker mit abräumen (wird beim nächsten Frame lazy neu gebootet + re-initialisiert);
    // packWorkerFailed bleibt bewusst stehen — ein kaputter Worker wird nicht erneut probiert.
    if (packWorker) { try { packWorker.terminate(); } catch { /* egal */ } packWorker = null; }
    workerBaseZ = null;
    waterMesh = null;
    overtopMesh = null;
    weirTris = null;
    faceMeta = null;
    sourceGeo = null;
    baseZ = null;
  }

  /** Erzwingt beim nächsten update() einen Neuaufbau (Re-Clone + Wehr-Schnitt) — z. B. wenn Wehre
   *  erst nach dem ersten Wasser-Frame hydratisiert werden. */
  function invalidate() {
    sourceGeo = null;
    if (props.depthData && props.terrain) update(props.depthData);
  }

  // --- Watcher ---
  watch(() => props.depthData, (data) => {
    if (data && props.terrain) update(data);
    else hide();
  });

  watch(() => props.maxWaterDepth, (newMax) => {
    if (waterMesh?.material?.uniforms) waterMesh.material.uniforms.uMaxDepth.value = newMax;
  });

  watch(() => props.layerMode, (mode) => {
    if (waterMesh?.material?.uniforms?.uLayerMode) waterMesh.material.uniforms.uLayerMode.value = mode ?? 0;
    // Beim Modus-Wechsel das aktuelle Frame einmal neu durchziehen: die Daten-Modi
    // überspringen im Playback Turbulenz/Drift-Feld/Velocity-Upload des jeweils
    // anderen Modus — hier wird nachgeladen, was der neue Modus braucht.
    if (props.depthData && props.terrain) update(props.depthData);
  });

  watch([() => props.velocityData, () => props.velocityMin, () => props.velocityMax], () => {
    const u = waterMesh?.material?.uniforms;
    if (!u) return;
    applyVelocityTexture(u);
    u.uVelocityMin.value = props.velocityMin || 0.0;
    u.uVelocityMax.value = props.velocityMax || 1.0;
  });

  watch(() => props.waterOpacity, () => applyOpacity());

  // Vektor-/Flussfeld kann unabhängig vom Tiefen-Frame wechseln (Layer-Umschalten, späte Hydration)
  watch([() => props.flowData, () => props.qFluxData], () => {
    const u = waterMesh?.material?.uniforms;
    if (u) applyFlowTexture(u);
  });

  return { update, applyOpacity, hide, reset, invalidate, renderRefraction, setBelowGround };
}
