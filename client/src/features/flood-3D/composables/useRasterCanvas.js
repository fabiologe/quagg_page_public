// Canvas-Mechanik einer Rasterkarte: Zuschnitt (Weltmaße → Pixel), die
// Hin- und Rückrechnung zwischen Welt- und Canvaskoordinaten, das
// DPR-Setup der Zeichenfläche und der ResizeObserver, der beides nach
// einer Größenänderung neu ausrichtet.
//
// Eingesammelt aus GrundrissPanel.vue: PAD (vorher Z. 426), layout()
// (Z. 428–438), worldToCanvas() (Z. 440–443), der Kopf von draw() mit
// dem DPR-/Canvas-Setup (Z. 494–506), canvasToWorld() (Z. 885–896) und
// der ResizeObserver (Z. 1050–1051 samt disconnect in Z. 1075).
//
// Bewusst OHNE Store- und Komponentenzugriff: die Maße kommen als Getter
// herein. Ein zweites Rasterkarten-Panel (Laubkarten) mit anderem nx/ny,
// anderem Ursprung und anderer Zellgröße benutzt damit dieselbe Mechanik,
// statt sie zu kopieren.
import { onBeforeUnmount, onMounted } from 'vue'

/** Rand für die Achsenbeschriftung, in CSS-Pixeln. */
export const PAD = 34

// Die Zeichenfläche rechnet mit mindestens dieser Höhe, auch wenn der
// Host gerade flacher ist — sonst schrumpft die Karte beim ersten Layout
// auf einen Streifen.
export const MIN_HOEHE = 380

/** Grundfarbe der Zeichenfläche (wird vor jedem Zeichnen gefüllt). */
export const HINTERGRUND = '#0a101f'

/**
 * Zuschnitt der Karte: wie viele Pixel bekommt ein Meter, und wie groß
 * wird die Zeichenfläche insgesamt.
 * @param {{nx: number, ny: number, spacing: ArrayLike<number>}} masse
 * @param {number} hostW  clientWidth des umschließenden Elements
 * @param {number} hostH  clientHeight des umschließenden Elements
 * @returns {{nx: number, ny: number, worldW: number, worldH: number,
 *   scale: number, w: number, h: number}}
 */
export function berechneLayout(masse, hostW, hostH, pad = PAD,
  minHoehe = MIN_HOEHE) {
  const [nx, ny] = [masse.nx, masse.ny]
  const worldW = nx * masse.spacing[0]
  const worldH = ny * masse.spacing[1]
  const availW = hostW - pad * 2
  const availH = Math.max(hostH, minHoehe) - pad * 2
  const scale = Math.min(availW / worldW, availH / worldH)
  return { nx, ny, worldW, worldH, scale,
    w: worldW * scale + pad * 2, h: worldH * scale + pad * 2 }
}

/**
 * Weltkoordinate → Canvaskoordinate. y ist im Canvas nach unten gerichtet,
 * in der Welt nach oben — die Karte wird deshalb gespiegelt.
 */
export function weltZuCanvas(L, origin, x, y, pad = PAD) {
  return [pad + (x - origin[0]) * L.scale,
    pad + (origin[1] + L.worldH - y) * L.scale]
}

/**
 * Canvaskoordinate → Weltkoordinate. null, wenn der Punkt außerhalb des
 * Gebiets liegt (Rand für die Achsenbeschriftung, Ränder der Fläche).
 */
export function canvasZuWelt(L, origin, px, py, pad = PAD) {
  const x = origin[0] + (px - pad) / L.scale
  const y = origin[1] + L.worldH - (py - pad) / L.scale
  if (x < origin[0] || y < origin[1]
      || x > origin[0] + L.worldW || y > origin[1] + L.worldH) return null
  return [x, y]
}

/**
 * @param {object} o
 * @param {import('vue').Ref<HTMLElement>} o.host  umschließendes Element
 *   (liefert die verfügbare Größe und wird beobachtet)
 * @param {import('vue').Ref<HTMLCanvasElement>} o.canvas
 * @param {() => ({nx: number, ny: number, origin: ArrayLike<number>,
 *   spacing: ArrayLike<number>})|null} o.masse  Rastermaße; solange nichts
 *   geladen ist, null — dann wird auch nicht neu gezeichnet
 * @param {Function} [o.zeichne]  Neuzeichnen nach Größenänderung
 */
export function useRasterCanvas({ host, canvas, masse, zeichne,
  pad = PAD, minHoehe = MIN_HOEHE, hintergrund = HINTERGRUND }) {
  let beobachter = null

  function layout() {
    return berechneLayout(masse(), host.value.clientWidth,
      host.value.clientHeight, pad, minHoehe)
  }

  function worldToCanvas(L, x, y) {
    return weltZuCanvas(L, masse().origin, x, y, pad)
  }

  // Zeigerereignis → Weltkoordinate (Punktabfrage, Schnitt setzen)
  function canvasToWorld(e) {
    const m = masse()
    if (!m) return null
    const L = layout()
    const rect = canvas.value.getBoundingClientRect()
    return canvasZuWelt(L, m.origin, e.clientX - rect.left,
      e.clientY - rect.top, pad)
  }

  // Zeichenfläche auf die Gerätepixel des Bildschirms bringen und leeren.
  // Ohne die DPR-Skalierung ist die Karte auf HiDPI-Anzeigen unscharf.
  function flaecheVorbereiten() {
    const L = layout()
    const dpr = window.devicePixelRatio || 1
    const cv = canvas.value
    cv.width = L.w * dpr
    cv.height = L.h * dpr
    cv.style.width = `${L.w}px`
    cv.style.height = `${L.h}px`
    const ctx = cv.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = hintergrund
    ctx.fillRect(0, 0, L.w, L.h)
    return { L, ctx }
  }

  onMounted(() => {
    if (!zeichne) return
    beobachter = new ResizeObserver(() => { if (masse()) zeichne() })
    beobachter.observe(host.value)
  })
  onBeforeUnmount(() => beobachter?.disconnect())

  return { pad, layout, worldToCanvas, canvasToWorld, flaecheVorbereiten }
}
