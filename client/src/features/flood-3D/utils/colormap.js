// Viridis-Näherung für Canvas-Raster (Grundriss) und Legenden — dieselben
// Stützstellen wie die vtk.js-Preset-Darstellung im Raum-Tab.
const STOPS = [
  [0.0, 0x44, 0x01, 0x54], [0.2, 0x41, 0x44, 0x87], [0.4, 0x2a, 0x78, 0x8e],
  [0.6, 0x22, 0xa8, 0x84], [0.8, 0x7a, 0xd1, 0x51], [1.0, 0xfd, 0xe7, 0x25],
]

export function viridis(t) {
  const x = Math.min(1, Math.max(0, t))
  for (let i = 1; i < STOPS.length; i++) {
    if (x <= STOPS[i][0]) {
      const [t0, r0, g0, b0] = STOPS[i - 1]
      const [t1, r1, g1, b1] = STOPS[i]
      const f = (x - t0) / (t1 - t0)
      return [r0 + (r1 - r0) * f, g0 + (g1 - g0) * f, b0 + (b1 - b0) * f]
    }
  }
  return [0xfd, 0xe7, 0x25]
}

export const VIRIDIS_CSS =
  'linear-gradient(90deg,#440154,#414487,#2a788e,#22a884,#7ad151,#fde725)'
