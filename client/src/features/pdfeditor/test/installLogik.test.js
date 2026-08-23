// Stufe 13a: InstallLogik — wann der „Als App installieren"-Hinweis
// erscheinen darf und welche Plattform welchen Weg bekommt.

import { describe, expect, it } from 'vitest'
import {
  istInstalliert, plattform, sollteHinweisZeigen, INSTALL_RUHE_MS,
} from '../services/InstallLogik'

const UA = {
  edgeWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  chromeMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  ipadOs: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
}

describe('plattform', () => {
  it('Desktop-Chromium (Edge/Chrome) bekommt den Install-Knopf', () => {
    expect(plattform(UA.edgeWindows, 0)).toBe('chromium')
    expect(plattform(UA.chromeMac, 0)).toBe('chromium')
  })

  it('Android ist Android — egal welcher Browser (APK ist immer ein Weg)', () => {
    expect(plattform(UA.chromeAndroid, 5)).toBe('android')
    const firefoxAndroid = 'Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0'
    expect(plattform(firefoxAndroid, 5)).toBe('android')
  })

  it('Safari-Zweige bekommen die Anleitung', () => {
    expect(plattform(UA.safariMac, 0)).toBe('safari-mac')
    expect(plattform(UA.safariIphone, 5)).toBe('safari-ios')
  })

  it('iPadOS tarnt sich als Macintosh — der Touchscreen entlarvt es', () => {
    expect(plattform(UA.ipadOs, 5)).toBe('safari-ios')
    expect(plattform(UA.ipadOs, 0)).toBe('safari-mac')   // echter Mac
  })

  it('Firefox: kein PWA-Install → sonstig', () => {
    expect(plattform(UA.firefox, 0)).toBe('sonstig')
  })
})

describe('sollteHinweisZeigen', () => {
  const basis = {
    installiert: false, plattformName: 'chromium',
    abgelehntUm: null, jetzt: 1_000_000_000,
  }

  it('zeigt im Normalfall', () => {
    expect(sollteHinweisZeigen(basis)).toBe(true)
  })

  it('nie in der installierten App', () => {
    expect(sollteHinweisZeigen({ ...basis, installiert: true })).toBe(false)
  })

  it('nie auf Plattformen ohne Install-Weg', () => {
    expect(sollteHinweisZeigen({ ...basis, plattformName: 'sonstig' })).toBe(false)
  })

  it('hält nach dem Wegklicken 14 Tage Ruhe', () => {
    const abgelehnt = basis.jetzt - INSTALL_RUHE_MS + 1000
    expect(sollteHinweisZeigen({ ...basis, abgelehntUm: abgelehnt })).toBe(false)
    const langeHer = basis.jetzt - INSTALL_RUHE_MS - 1000
    expect(sollteHinweisZeigen({ ...basis, abgelehntUm: langeHer })).toBe(true)
  })
})

describe('istInstalliert', () => {
  it('erkennt display-mode standalone und den iOS-Sonderweg', () => {
    expect(istInstalliert({
      matchMedia: () => ({ matches: true }), navigator: {},
    })).toBe(true)
    expect(istInstalliert({
      matchMedia: () => ({ matches: false }), navigator: { standalone: true },
    })).toBe(true)
    expect(istInstalliert({
      matchMedia: () => ({ matches: false }), navigator: {},
    })).toBe(false)
    expect(istInstalliert(null)).toBe(false)   // Testumgebung ohne window
  })
})
