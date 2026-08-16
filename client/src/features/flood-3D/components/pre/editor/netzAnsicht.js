// Netz-Ansicht (aus Editor3D.vue geschnitten): vernetzte Oberfläche der
// Netzvorschau (Solver-Zellen) laden und anzeigen — und die Vorschau
// direkt aus der Ansicht heraus rechnen (E6), voll oder schnell (ohne
// verschachtelte Verfeinerung). Die Refs (meshView/-Hint/-Angebot) stellt
// der Editor, wie szene.js es mit solverHint vormacht.
import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { flood3dApi } from '../../../services/api'
import { b64ToBuffer } from '../../../services/volume'

// Hinweistext zur geladenen Netzvorschau (rein rechenbar)
export function netzHinweis({ stale, ohneVerfeinerung }) {
  if (stale) {
    return '⚠ Für diesen Stand der Geometrie gibt es noch kein Netz. '
      + 'Das gespeicherte gehört zu einem älteren Stand und wird deshalb '
      + 'nicht angezeigt — hier neu rechnen.'
  }
  if (ohneVerfeinerung) {
    return '⚡ Schnellvorschau ohne Verfeinerung — Zellzahl und '
      + 'Kosten sind eine untere Grenze.'
  }
  return ''
}

/**
 * Darf dieses Netz als GEOMETRIE auftreten?
 *
 * Gemeldet 2026-08-16: nach einer Geometrieänderung erschien beim Klick
 * auf „Netzvorschau rechnen" zuerst das alte Netz, das dann vom neuen
 * überschrieben wurde. Das Ende stimmte, der Anfang nicht — die
 * Netzansicht blendet die echte Geometrie aus und setzt das Netz an ihre
 * Stelle. Ein Netz zu einer geänderten Geometrie darf diesen Platz nicht
 * bekommen; ein Hinweis darüber genügt dafür nicht.
 */
export function netzZeigen({ stale }) {
  return !stale
}

export function erzeugeNetzAnsicht({ store, groups, holeScene, clearGroup,
  meshView, meshHint, meshAngebot }) {
  async function toggleMeshView() {
    meshView.value = !meshView.value
    meshHint.value = ''
    meshAngebot.value = false
    clearGroup('mesh')
    if (!meshView.value) return
    try {
      const data = await flood3dApi.caseMeshSurface(store.activeCaseId)
      const hinweis = netzHinweis({ stale: data.stale,
        ohneVerfeinerung: store.meshPreview?.ohne_verfeinerung })
      if (hinweis) {
        meshHint.value = hinweis
        meshAngebot.value = true
      }
      if (!netzZeigen(data)) {
        // Veraltetes Netz: die echte Geometrie bleibt stehen. Sonst stünde
        // an ihrer Stelle ein Netz von gestern, und der Hinweis darüber
        // wäre das Einzige, was davor warnt.
        meshView.value = false
        return
      }
      const loader = new STLLoader()
      groups.mesh = new THREE.Group()
      for (const p of data.patches) {
        const geo = loader.parse(b64ToBuffer(p.stl_b64))
        geo.computeVertexNormals()
        const solid = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
          color: p.patch === 'terrain' ? 0x6b7891 : 0x4d9fff,
          side: THREE.DoubleSide }))
        const wire = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
          color: 0x101a30, wireframe: true, transparent: true, opacity: 0.55 }))
        groups.mesh.add(solid, wire)
      }
      holeScene().add(groups.mesh)
      // Vorschaugeometrie ausblenden — das Netz IST jetzt die Geometrie
      if (groups.terrain) groups.terrain.visible = false
      if (groups.solids) groups.solids.visible = false
    } catch (e) {
      meshView.value = false
      if (e.message.includes('Netzvorschau')) {
        // Kein Vorschaunetz — direkt hier anbieten statt in die Phase
        // „Simulation" zu schicken (der Lauf existiert, nur der Knopf fehlte)
        meshHint.value = 'Noch kein Vorschaunetz für diesen Fall.'
        meshAngebot.value = true
      } else {
        meshHint.value = `Netz nicht ladbar: ${e.message}`
      }
    }
  }

  // Netzvorschau direkt aus der Netz-Ansicht rechnen (E6). `ohne` = ohne
  // die verschachtelte Verfeinerung (schneller, gröber).
  async function meshRechnen(ohne) {
    meshAngebot.value = false
    // Während gerechnet wird, steht die ECHTE Geometrie im Bild — vorher
    // blieb ein womöglich veraltetes Netz minutenlang stehen und sah aus
    // wie das Ergebnis der laufenden Rechnung. Gelände und Körper stellt
    // der Editor beim Ausschalten selbst wieder sichtbar (watch auf
    // meshView in Editor3D.vue).
    meshView.value = false
    clearGroup('mesh')
    meshHint.value = (ohne
      ? '⚡ Schnellvorschau (ohne Verfeinerung) läuft'
      : '▦ Netzvorschau läuft')
      + ' — blockMesh + snappyHexMesh brauchen einige Minuten …'
    const ok = await store.runMeshPreview({ ohneVerfeinerung: ohne })
    if (ok) {
      await toggleMeshView()
    } else {
      meshHint.value = ''
      meshAngebot.value = true
    }
  }

  return { toggleMeshView, meshRechnen }
}
