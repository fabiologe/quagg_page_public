// Status-Wasserzeichen (Sprint T1/E5): ISO-19650-Status → Plan-Aufdruck.

import { describe, expect, it } from 'vitest'
import { resolveWatermarkText } from '../stores/useCdeStore'

const DOKUMENTE = [
  { sha256: 'aaa', status: 'WIP' },
  { sha256: 'bbb', status: 'Shared' },
  { sha256: 'ccc', status: 'Published' },
  { sha256: 'ddd', status: 'Archived' },
]

describe('resolveWatermarkText', () => {
  it('Published = freigegeben → kein Wasserzeichen', () => {
    expect(resolveWatermarkText(DOKUMENTE, 'ccc')).toBeNull()
  })

  it('WIP → VORABZUG, Shared → ZUR PRÜFUNG, Archived → ARCHIVIERT', () => {
    expect(resolveWatermarkText(DOKUMENTE, 'aaa')).toBe('VORABZUG')
    expect(resolveWatermarkText(DOKUMENTE, 'bbb')).toBe('ZUR PRÜFUNG')
    expect(resolveWatermarkText(DOKUMENTE, 'ddd')).toBe('ARCHIVIERT')
  })

  it('unbekanntes Modell → konservativ VORABZUG', () => {
    expect(resolveWatermarkText(DOKUMENTE, 'nicht-registriert')).toBe('VORABZUG')
    expect(resolveWatermarkText([], 'x')).toBe('VORABZUG')
  })

  it('ohne sha (kein Modell geladen) → kein Wasserzeichen', () => {
    expect(resolveWatermarkText(DOKUMENTE, null)).toBeNull()
  })
})
