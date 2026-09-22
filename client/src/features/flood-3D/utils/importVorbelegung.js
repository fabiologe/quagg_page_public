// Vorbelegung des Import-Dialogs aus dem Manifest der Datei und der
// Verortung des Falls — eine reine Funktion, damit sie geprüft werden kann
// (ImportModal ruft sie nach der Analyse).
//
// Bis 2026-09-22 schaltete der Dialog ab 5 000 Einheiten Spannweite
// KOMMENTARLOS auf Millimeter (ein 6-km-Gelände in Metern wurde 6 m), der
// Offset-Vorschlag hing nur an Netz-Kandidaten, „Gebiet ableiten" nur an der
// Rollenvermutung „gelaende" (Audit C8, I2, I7). Jetzt: die Einheit sagt die
// Zeichnung ($INSUNITS), der Verdacht aus der Spannweite bleibt eine FRAGE;
// der Offset kommt aus der Verortung des Falls, wenn die Datei in dessen Welt
// liegt, sonst aus der Datei; das Gebiet folgt auch Kanten-Dateien.
import { KANTEN_ROLLEN } from './importRollen'

// dieselbe Grenze wie OFFSET_SUSPECT im Server (importer.py): innerhalb
// von 10 km gilt die Datei als in der Welt des Falls liegend
export const NAH_M = 10000
const GELAENDE = new Set(['gelaende', 'gelaende_koerper'])

// Weltpunkt des lokalen Ursprungs = der Offset, mit dem der erste Import
// verschoben wurde. Umkehrung der Import-Konvention
// p_lokal = R(θ)·(p_welt − off)  ⇒  off = R(−θ)·(0 − t).
export function offsetAusVerortung(t) {
  if (!t) return null
  const a = -((t.rotation_deg || 0) * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  const dx = -(t.translation?.[0] ?? 0)
  const dy = -(t.translation?.[1] ?? 0)
  return [c * dx - s * dy, s * dx + c * dy]
}

const r2 = (v) => Math.round(v * 100) / 100

export function vorbelegung(manifest, verortung = null) {
  const m = manifest ?? {}
  const kandidaten = m.candidates ?? []
  const einheit = m.einheit ?? null
  let unitFactor = einheit?.faktor ?? 1
  let offX = 0
  let offY = 0
  let rotation = 0
  let lageQuelle = null
  const s = m.offset_suggest
  if (s) {
    const alt = offsetAusVerortung(verortung)
    const nah = alt
      && Math.hypot(alt[0] - s[0] * unitFactor, alt[1] - s[1] * unitFactor) < NAH_M
    if (nah) {
      offX = r2(alt[0])
      offY = r2(alt[1])
      rotation = verortung.rotation_deg || 0
      unitFactor = verortung.unit_factor || unitFactor
      lageQuelle = 'fall'
    } else {
      offX = r2(s[0] * unitFactor)
      offY = r2(s[1] * unitFactor)
      lageQuelle = 'datei'
    }
  }
  return {
    unitFactor,
    offX,
    offY,
    rotation,
    lageQuelle,
    // ohne Einheit in der Zeichnung bleibt der Verdacht eine Frage an den
    // Nutzer — kein stiller Sprung auf Millimeter
    einheitUnklar: !!m.unit_suspect && !einheit,
    deriveDomain: kandidaten.some(
      (c) => GELAENDE.has(c.role_guess) || KANTEN_ROLLEN.has(c.role_guess)),
  }
}
