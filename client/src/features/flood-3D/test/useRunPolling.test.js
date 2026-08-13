// @vitest-environment jsdom
//
// EIN Poll-Intervall für alle Lauflisten: startet, wenn der Aktiv-Zustand
// truthy wird, stoppt beim Rückfall — und räumt beim Unmount sicher auf
// (vorher dreimal von Hand gebaut, jede Kopie ein Vergessens-Kandidat).
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRunPolling } from '../composables/useRunPolling'

describe('useRunPolling', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function mounten(aktiv, tick, intervallMs) {
    const Comp = defineComponent({
      setup() {
        useRunPolling(aktiv, tick, intervallMs)
        return () => h('div')
      },
    })
    const app = createApp(Comp)
    app.mount(document.createElement('div'))
    return app
  }

  it('tickt nur solange aktiv und stoppt beim Rückfall', async () => {
    const tick = vi.fn()
    const aktiv = ref(false)
    mounten(aktiv, tick, 5000)

    vi.advanceTimersByTime(20000)
    expect(tick).not.toHaveBeenCalled()

    aktiv.value = true
    await nextTick()
    vi.advanceTimersByTime(15000)
    expect(tick).toHaveBeenCalledTimes(3)

    aktiv.value = false
    await nextTick()
    vi.advanceTimersByTime(20000)
    expect(tick).toHaveBeenCalledTimes(3)
  })

  it('startet sofort, wenn beim Mount schon aktiv (immediate)', () => {
    const tick = vi.fn()
    mounten(ref(true), tick, 8000)
    vi.advanceTimersByTime(8000)
    expect(tick).toHaveBeenCalledTimes(1)
  })

  it('räumt das Intervall beim Unmount auf', async () => {
    const tick = vi.fn()
    const aktiv = ref(true)
    const app = mounten(aktiv, tick, 5000)
    await nextTick()
    app.unmount()
    vi.advanceTimersByTime(50000)
    expect(tick).not.toHaveBeenCalled()
  })
})
