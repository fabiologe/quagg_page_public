/**
 * rollen — das Rang-Modell des Clients (Spiegel von backend/app/core/rollen.py).
 * ADMIN > MITARBEITER > WERKSTUDENT > EXTERN. Reine Funktionen, ohne DOM.
 *
 * Der Client-Guard ist Kosmetik — der Türsteher ist das Backend. Hier geht es
 * nur darum, Nutzern keine Knöpfe zu zeigen, die sie nicht drücken dürfen.
 */

export const RANG = { EXTERN: 0, WERKSTUDENT: 10, MITARBEITER: 20, ADMIN: 30 }

// Altwerte (bis 2026-08) — tolerieren, bis alle Tokens/localStorage-Reste durch sind
export const ALIASE = { CLIENT: 'EXTERN', INTERNAL: 'MITARBEITER' }

export const ROLLEN = ['ADMIN', 'MITARBEITER', 'WERKSTUDENT', 'EXTERN']

export const ROLLEN_LABEL = {
  ADMIN: 'Admin',
  MITARBEITER: 'Mitarbeiter',
  WERKSTUDENT: 'Werkstudent',
  EXTERN: 'Extern',
}

export function normalisiert(rolle) {
  const s = String(rolle ?? '').trim().toUpperCase()
  if (ALIASE[s]) return ALIASE[s]
  return Object.prototype.hasOwnProperty.call(RANG, s) ? s : null
}

export function rang(rolle) {
  const n = normalisiert(rolle)
  return n ? RANG[n] : -1
}

/** hatMindestens('WERKSTUDENT', 'MITARBEITER') → false; unbekannte Rollen scheitern immer. */
export function hatMindestens(rolle, mindestens) {
  const m = normalisiert(mindestens)
  if (!m) return false
  return rang(rolle) >= RANG[m]
}

/** Wohin nach dem Login? EXTERN ins Kundenportal, alle anderen in den internen Bereich. */
export function startpfad(rolle) {
  const n = normalisiert(rolle)
  if (n === 'EXTERN') return '/client'
  if (n) return '/intern'
  return '/home'
}

/** ?redirect=… nur akzeptieren, wenn es ein relativer Pfad ist (kein Open-Redirect). */
export function sichererRedirect(ziel) {
  if (typeof ziel !== 'string') return null
  if (!ziel.startsWith('/') || ziel.startsWith('//') || ziel.startsWith('/\\')) return null
  return ziel
}
