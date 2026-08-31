import { describe, expect, it } from 'vitest'
import { entscheide } from '../guard'

const auth = (rolle, extra = {}) => ({ isAuthenticated: rolle !== null, rolle, mussPasswortAendern: false, ...extra })
const route = (meta, name = 'x', fullPath = '/x') => ({ meta, name, fullPath })

describe('guard.entscheide', () => {
  it('öffentliche Routen: nie umleiten', () => {
    expect(entscheide(route({}), auth(null))).toBeNull()
    expect(entscheide(route({ layout: 'public' }), auth('EXTERN'))).toBeNull()
  })

  it('nicht angemeldet → Login mit Rücksprung', () => {
    expect(entscheide(route({ requiresAuth: true, minRole: 'WERKSTUDENT' }, 'intern', '/intern/projects?x=1'), auth(null)))
      .toEqual({ name: 'login', query: { redirect: '/intern/projects?x=1' } })
  })

  it.each([
    ['ADMIN', 'ADMIN', null],
    ['MITARBEITER', 'ADMIN', { path: '/intern' }],
    ['WERKSTUDENT', 'WERKSTUDENT', null],
    ['EXTERN', 'WERKSTUDENT', { path: '/client' }],
    ['EXTERN', 'EXTERN', null],
    ['INTERNAL', 'WERKSTUDENT', null],
    ['CLIENT', 'WERKSTUDENT', { path: '/client' }],
    ['ADMIN', 'EXTERN', null],
  ])('Rolle %s auf minRole %s', (rolle, minRole, erwartet) => {
    expect(entscheide(route({ requiresAuth: true, minRole }), auth(rolle))).toEqual(erwartet)
  })

  it('Pflicht-Passwortwechsel geht allem vor, außer auf /konto', () => {
    const a = auth('MITARBEITER', { mussPasswortAendern: true })
    expect(entscheide(route({ requiresAuth: true, minRole: 'WERKSTUDENT' }, 'intern'), a))
      .toEqual({ name: 'konto', query: { pflicht: '1' } })
    expect(entscheide(route({ requiresAuth: true, minRole: 'EXTERN' }, 'konto'), a)).toBeNull()
    // öffentliche Seiten bleiben erreichbar
    expect(entscheide(route({}, 'home'), a)).toBeNull()
  })
})

/**
 * Die CDE ist ein internes Werkzeug (31.08.2026).
 *
 * Sie lag bis dahin ohne Guard und stand zugleich auf dem oeffentlichen
 * /tools-Dashboard, obwohl sie Projektakten, Dokumentregister, Mengen und
 * Kosten zeigt. Ohne Anmeldung antwortete der Server zwar nur mit 401 — aber
 * die Seite tat so, als koennte sie etwas, und schwieg dazu. Der Guard ist
 * zugleich die Voraussetzung dafuer, dass Rollen ueberhaupt etwas bewirken.
 */
describe('CDE-Route', () => {
  const cde = (fullPath = '/cde') =>
    route({ layout: 'empty', requiresAuth: true, minRole: 'WERKSTUDENT' }, 'cde', fullPath)

  it('schickt Unangemeldete zum Login und merkt sich das Projekt', () => {
    // Der Rueckweg muss die Abfrage mitnehmen — sonst landet man nach dem
    // Login in einer CDE ohne Projekt und sucht es von Hand.
    expect(entscheide(cde('/cde?projekt=1338'), auth(null)))
      .toEqual({ name: 'login', query: { redirect: '/cde?projekt=1338' } })
  })

  it('laesst interne Rollen durch', () => {
    for (const rolle of ['WERKSTUDENT', 'MITARBEITER', 'ADMIN']) {
      expect(entscheide(cde(), auth(rolle)), rolle).toBeNull()
    }
  })

  it('haelt Kunden vorerst draussen', () => {
    // Bewusst restriktiv: Lockern ist leichter als Zurueckziehen. Fuer Kunden
    // gibt es das Portal.
    expect(entscheide(cde(), auth('EXTERN'))).toEqual({ path: '/client' })
  })
})
