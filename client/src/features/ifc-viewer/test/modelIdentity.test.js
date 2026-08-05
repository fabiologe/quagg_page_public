// Stufe B: Die Modell-Identität ist der Persistenz-Schlüssel für Annotationen,
// Overrides und die Blob-Ablage — Dateiname raus, GlobalId/Hash rein.

import { describe, expect, it } from 'vitest'
import { extractProjectGlobalId, sha256Hex, computeModelIdentity } from '../services/ModelIdentity'

const enc = new TextEncoder()

const MINI_IFC = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION((''),'2;1');
ENDSEC;
DATA;
#1=IFCPROJECT('2O2Fr$t4X7Zf8NOew3FLOH',#2,'Projekt',$,$,$,$,(#20),#7);
#3=IFCWALL('0uSpj9BX93HByzUdd7jT4b',$,$,$,$,$,$,$,$);
ENDSEC;
END-ISO-10303-21;`

describe('extractProjectGlobalId', () => {
  it('liest die GlobalId der IFCPROJECT-Instanz', () => {
    expect(extractProjectGlobalId(enc.encode(MINI_IFC))).toBe('2O2Fr$t4X7Zf8NOew3FLOH')
  })

  it('greift nicht auf andere Entitäten (IFCWALL) zurück', () => {
    const withoutProject = MINI_IFC.replace(/#1=IFCPROJECT[^\n]*\n/, '')
    expect(extractProjectGlobalId(enc.encode(withoutProject))).toBeNull()
  })

  it('verkraftet leere Eingaben', () => {
    expect(extractProjectGlobalId(new Uint8Array(0))).toBeNull()
    expect(extractProjectGlobalId(null)).toBeNull()
  })
})

describe('sha256Hex', () => {
  it('liefert den bekannten SHA-256 von "abc"', async () => {
    expect(await sha256Hex(enc.encode('abc')))
      .toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

describe('computeModelIdentity', () => {
  it('bevorzugt die Projekt-GlobalId als Key (revisionsstabil)', async () => {
    const id = await computeModelIdentity(enc.encode(MINI_IFC), 'haus.ifc')
    expect(id.key).toBe('gid:2O2Fr$t4X7Zf8NOew3FLOH')
    expect(id.sha256).toHaveLength(64)
  })

  it('fällt ohne IFCPROJECT auf den Datei-Hash zurück', async () => {
    const id = await computeModelIdentity(enc.encode('kein ifc'), 'x.ifc')
    expect(id.projectGlobalId).toBeNull()
    expect(id.key).toBe(`sha:${id.sha256}`)
  })

  it('gleiche Datei unter anderem Namen → gleicher Key', async () => {
    const a = await computeModelIdentity(enc.encode(MINI_IFC), 'a.ifc')
    const b = await computeModelIdentity(enc.encode(MINI_IFC), 'b_umbenannt.ifc')
    expect(a.key).toBe(b.key)
  })
})
