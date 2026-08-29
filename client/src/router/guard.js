/**
 * Router-Guard als reine Funktion — testbar ohne Router.
 *
 * Reihenfolge: (1) nicht angemeldet → Login mit Rücksprungziel,
 * (2) Pflicht-Passwortwechsel → Konto, (3) Rang zu niedrig → Startseite der Rolle.
 * Rollen werden über das Rang-Modell verglichen (meta.minRole), nicht exakt.
 */
import { hatMindestens, startpfad } from '@/services/rollen'

export function entscheide(to, auth) {
  const meta = to.meta || {}
  if (meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (meta.requiresAuth && auth.mussPasswortAendern && to.name !== 'konto') {
    return { name: 'konto', query: { pflicht: '1' } }
  }
  if (meta.minRole && !hatMindestens(auth.rolle, meta.minRole)) {
    return { path: startpfad(auth.rolle) }
  }
  return null
}
