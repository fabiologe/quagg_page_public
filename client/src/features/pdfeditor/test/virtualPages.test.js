// useVirtualPages — Sichtfenster-Arithmetik der Seitenvirtualisierung (Stufe 1).

import { describe, expect, it } from 'vitest'
import { ref, computed } from 'vue'
import { useVirtualPages } from '../composables/useVirtualPages'

/** 10 Seiten à 1000 px Höhe, 16 px Lücke, 24 px Rand oben. */
function seitenLayout(anzahl = 10, hoehe = 1000, luecke = 16, rand = 24) {
  const liste = []
  let y = rand
  for (let i = 0; i < anzahl; i++) {
    liste.push({ top: y, hoehe })
    y += hoehe + luecke
  }
  return liste
}

function aufbau({ scroll = 0, container = 900, seiten = seitenLayout(), puffer = 1 } = {}) {
  const scrollTop = ref(scroll)
  const containerHoehe = ref(container)
  const layout = computed(() => seiten)
  return { scrollTop, ...useVirtualPages(scrollTop, containerHoehe, layout, puffer) }
}

describe('useVirtualPages', () => {
  it('sieht am Anfang Seite 0 und hält den Puffer klein', () => {
    const { sichtbar, lebendig } = aufbau()
    expect(sichtbar.value.von).toBe(0)
    expect(lebendig.value.has(0)).toBe(true)
    expect(lebendig.value.has(1)).toBe(true)   // Sichtfenster oder Puffer
    expect(lebendig.value.has(3)).toBe(false)  // weit außerhalb
  })

  it('findet die richtige Seite mitten im Dokument', () => {
    // Seite 5 beginnt bei 24 + 5·1016 = 5104
    const { sichtbar } = aufbau({ scroll: 5104 + 10 })
    expect(sichtbar.value.von).toBe(5)
  })

  it('reagiert reaktiv auf Scrollen', () => {
    const { scrollTop, sichtbar } = aufbau()
    expect(sichtbar.value.von).toBe(0)
    scrollTop.value = 3 * 1016 + 24 + 1
    expect(sichtbar.value.von).toBe(3)
  })

  it('klemmt Puffer an den Dokumentenden', () => {
    const { lebendig } = aufbau({ scroll: 0 })
    expect([...lebendig.value].every(i => i >= 0)).toBe(true)
    const ende = aufbau({ scroll: 999999 })
    expect([...ende.lebendig.value].every(i => i <= 9)).toBe(true)
    expect(ende.lebendig.value.has(9)).toBe(true)
  })

  it('deckt bei kleinem Zoom mehrere Seiten im Fenster ab', () => {
    const { sichtbar } = aufbau({ seiten: seitenLayout(10, 200), container: 900 })
    expect(sichtbar.value.von).toBe(0)
    expect(sichtbar.value.bis).toBeGreaterThanOrEqual(3)
  })
})
