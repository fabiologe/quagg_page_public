/**
 * dimensionLabel.js — geteilte Bemaßungs-Beschriftung für Weir/Bridge-Drag-Guides.
 *
 * Ersetzt die früher pro Tool duplizierten Canvas-Sprite-Helfer (generischer Sans-Serif-
 * Font, feste dunkelblaue Box) durch einen SaintV-Theme-konformen Stil (Share-Tech-Mono,
 * Violet-Border, Lime-Text — siehe styles/theme-saintv.css) plus bildschirmkonstante Größe
 * (skaliert mit Kamera-Abstand/Zoom, sonst wird das Label beim Ranzoomen riesig).
 */
import * as THREE from 'three';

const SV_BG = 'rgba(27,27,40,0.92)';            // --sv-surface
const SV_BORDER = 'rgba(139,92,246,0.9)';       // --sv-violet
const SV_TEXT = '#A3E635';                      // --sv-lime / --sv-text-lime
const SV_FONT = "bold 30px 'Share Tech Mono', 'Courier New', monospace";

/** Abgerundete Pille im SaintV-Look als THREE.Sprite (Basisgröße, siehe scaleDimLabel für Zoom). */
export function createDimLabel(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = SV_FONT;
    const w = Math.min(240, ctx.measureText(text).width + 26);
    const x = (256 - w) / 2, y = 8, h = 48, r = 8;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fillStyle = SV_BG;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = SV_BORDER;
    ctx.stroke();
    ctx.fillStyle = SV_TEXT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = SV_FONT;
    ctx.fillText(text, 128, y + h / 2 + 1);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(canvas), depthTest: false, transparent: true,
    }));
    sprite.scale.set(6, 1.5, 1);
    sprite.renderOrder = 1001;
    return sprite;
}

/**
 * Bildschirmkonstante Größe: bei Perspektive mit dem Kamera-Abstand zum Label skalieren,
 * bei Orthografisch mit dem Zoom — sonst wird die Bemaßung beim Ranzoomen riesig und
 * verdeckt genau die Bewegung, die sie eigentlich zeigen soll.
 */
export function scaleDimLabel(sprite, camera, worldPos) {
    let s;
    if (camera.isOrthographicCamera) {
        s = ((camera.top - camera.bottom) / (camera.zoom || 1)) * 0.045;
    } else {
        s = camera.position.distanceTo(worldPos) * 0.026;
    }
    sprite.scale.set(s * 4, s, 1);
}

/**
 * Bemaßungs-„Schlauch" a→b als dünner Zylinder-Mesh statt THREE.Line — WebGL ignoriert
 * `linewidth` > 1 auf den meisten Plattformen (ANGLE/Windows, die meisten Linux/macOS-Treiber),
 * ein Mesh ist die einzige zuverlässige Art, eine wirklich dickere Linie zu bekommen.
 */
export function buildDimTube(p1, p2, color, radius = 0.045, opacity = 0.85) {
    const dir = new THREE.Vector3().subVectors(p2, p1);
    const len = dir.length();
    if (len < 1e-6) return null;
    const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, len, 6, 1, true),
        new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity }),
    );
    mesh.position.copy(p1).lerp(p2, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    mesh.renderOrder = 1001;
    return mesh;
}

/**
 * Seitlicher Versatz zu einer Bemaßungslinie a→b (horizontale Ebene, sonst bei senkrechten
 * Linien entartet): Fußpunkt bleibt auf der Linie (Mittelpunkt), das Label rutscht `dist`
 * zur Seite raus — CAD-Bemaßungsstil statt Text direkt auf der Zugstrecke.
 */
export function dimSidePoints(a, b, dist = 1.4) {
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    const dir = new THREE.Vector3().subVectors(b, a);
    dir.y = 0;
    const side = dir.lengthSq() < 1e-9
        ? new THREE.Vector3(1, 0, 0)
        : new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    const foot = mid.clone();
    const label = mid.clone().addScaledVector(side, dist).setY(mid.y + dist * 0.35);
    return { foot, label };
}
