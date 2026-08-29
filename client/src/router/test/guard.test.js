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
