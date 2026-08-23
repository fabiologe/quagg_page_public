// EingabeRouting — die Stift/Finger-Konfliktregeln als pure Zustandsmaschine.
// Die Uhr wird injiziert; kein DOM nötig.

import { describe, expect, it } from 'vitest'
import { erzeugeEingabeRouting } from '../services/EingabeRouting'

function aufbau({ modus = 'stiftUndFinger', werkzeug = 'stift' } = {}) {
  let zeit = 1000
  const zustand = { modus, werkzeug }
  const routing = erzeugeEingabeRouting({
    holeModus: () => zustand.modus,
    holeWerkzeug: () => zustand.werkzeug,
    jetzt: () => zeit,
    karenzMs: 150,
    karenzPx: 8,
    stiftSperreMs: 500,
  })
  return { routing, zustand, tick: (ms) => { zeit += ms } }
}

const stift = (id, extra = {}) => ({ id, typ: 'pen', buttons: 1, x: 100, y: 100, ...extra })
const finger = (id, extra = {}) => ({ id, typ: 'touch', x: 100, y: 100, ...extra })
const maus = (id, extra = {}) => ({ id, typ: 'mouse', button: 0, buttons: 1, x: 100, y: 100, ...extra })

describe('Stift', () => {
  it('zeichnet mit dem aktiven Werkzeug und bricht laufende Navigation ab', () => {
    const { routing } = aufbau()
    const e = routing.pointerDown(stift(1))
    expect(e.aktion).toBe('tinte')
    expect(e.werkzeug).toBe('stift')
    expect(e.navAbbrechen).toBe(true)
  })

  it('Radierer-Ende (buttons & 32) überschreibt das Werkzeug', () => {
    const { routing } = aufbau()
    expect(routing.pointerDown(stift(1, { buttons: 32 })).aktion).toBe('radierer')
  })

  it('Barrel-Taste (buttons & 2) schaltet temporär aufs Lasso', () => {
    const { routing } = aufbau()
    expect(routing.pointerDown(stift(1, { buttons: 2 })).aktion).toBe('lasso')
  })

  it('pannt mit Werkzeug „pan"', () => {
    const { routing } = aufbau({ werkzeug: 'pan' })
    expect(routing.pointerDown(stift(1)).aktion).toBe('nav')
  })
})

describe('Regel 1 — Stift schlägt Finger (Palm Rejection)', () => {
  it('ignoriert Touch, solange der Stift zeichnet', () => {
    const { routing } = aufbau()
    routing.pointerDown(stift(1))
    expect(routing.pointerDown(finger(2)).aktion).toBe('ignorieren')
  })

  it('ignoriert Touch noch stiftSperreMs nach dem Abheben', () => {
    const { routing, tick } = aufbau()
    routing.pointerDown(stift(1))
    routing.pointerUp(stift(1))
    tick(300)
    expect(routing.pointerDown(finger(2)).aktion).toBe('ignorieren')
    tick(300)   // jetzt > 500 ms
    expect(routing.pointerDown(finger(3)).aktion).toBe('tinte-provisorisch')
  })

  it('Stift-HOVER sperrt den Finger ebenso', () => {
    const { routing, tick } = aufbau()
    routing.stiftNaehe()
    tick(200)
    expect(routing.pointerDown(finger(1)).aktion).toBe('ignorieren')
  })
})

describe('Regel 2 — Karenzfenster des Fingerstrichs', () => {
  it('zweiter Finger im Fenster wandelt zu Pinch um', () => {
    const { routing, tick } = aufbau()
    expect(routing.pointerDown(finger(1)).aktion).toBe('tinte-provisorisch')
    tick(80)
    const e = routing.pointerDown(finger(2))
    expect(e.aktion).toBe('pinch-umwandlung')
    expect(e.ersterZeiger).toBe(1)
    expect(routing.zielVon(1)).toBe('nav')
    expect(routing.zielVon(2)).toBe('nav')
  })

  it('nach Ablauf der Zeit ist der Strich gehärtet — kein Pinch mehr', () => {
    const { routing, tick } = aufbau()
    routing.pointerDown(finger(1))
    tick(200)
    expect(routing.pointerMove(finger(1)).gehaertetJetzt).toBe(true)
    expect(routing.pointerDown(finger(2)).aktion).toBe('ignorieren')   // Regel 3
  })

  it('härtet auch über die Wegstrecke', () => {
    const { routing } = aufbau()
    routing.pointerDown(finger(1))
    const r = routing.pointerMove(finger(1, { x: 120, y: 100 }))   // 20 px > 8 px
    expect(r.gehaertetJetzt).toBe(true)
  })

  it('kurzer Tipp bleibt Tinte (Punkt), meldet aber warProvisorisch', () => {
    const { routing, tick } = aufbau()
    routing.pointerDown(finger(1))
    tick(50)
    const r = routing.pointerUp(finger(1))
    expect(r.ziel).toBe('tinte')
    expect(r.warProvisorisch).toBe(true)
  })
})

describe('Modus „nurStift"', () => {
  it('Finger ist reine Navigation', () => {
    const { routing } = aufbau({ modus: 'nurStift' })
    expect(routing.pointerDown(finger(1)).aktion).toBe('nav')
    expect(routing.pointerDown(finger(2)).aktion).toBe('nav')
  })
})

describe('Werkzeug „pan" und Maus', () => {
  it('Finger navigiert bei Werkzeug pan auch im Modus stiftUndFinger', () => {
    const { routing } = aufbau({ werkzeug: 'pan' })
    expect(routing.pointerDown(finger(1)).aktion).toBe('nav')
  })

  it('Maus zeichnet mit linker Taste, mittlere pannt', () => {
    const { routing } = aufbau()
    expect(routing.pointerDown(maus(1)).aktion).toBe('tinte')
    routing.pointerUp(maus(1))
    expect(routing.pointerDown(maus(2, { button: 1 })).aktion).toBe('nav')
  })
})

describe('Radierer per Finger', () => {
  it('läuft provisorisch wie Tinte (Pinch bleibt möglich)', () => {
    const { routing } = aufbau({ werkzeug: 'radierer' })
    expect(routing.pointerDown(finger(1)).aktion).toBe('radierer-provisorisch')
    expect(routing.pointerDown(finger(2)).aktion).toBe('pinch-umwandlung')
  })
})
