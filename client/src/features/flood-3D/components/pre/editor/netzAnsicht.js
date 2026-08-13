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
    return '⚠ Dieses Netz gehört zu einem älteren Stand des '
      + 'Falls — es zeigt NICHT die aktuelle Geometrie.'
  }
  if (ohneVerfeinerung) {
    return '⚡ Schnellvorschau ohne Verfeinerung — Zellzahl und '
      + 'Kosten sind eine untere Grenze.'
  }
  return ''
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
      const hinweis = netzHinweis({ stale: data.stale,
        ohneVerfeinerung: store.meshPreview?.ohne_verfeinerung })
      if (hinweis) {
        meshHint.value = hinweis
        meshAngebot.value = true
      }
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
    meshHint.value = (ohne
      ? '⚡ Schnellvorschau (ohne Verfeinerung) läuft'
      : '▦ Netzvorschau läuft')
      + ' — blockMesh + snappyHexMesh brauchen einige Minuten …'
    const ok = await store.runMeshPreview({ ohneVerfeinerung: ohne })
    if (meshView.value) {
      meshView.value = false
      clearGroup('mesh')
    }
    if (ok) {
      await toggleMeshView()
    } else {
      meshHint.value = ''
      meshAngebot.value = true
    }
  }

  return { toggleMeshView, meshRechnen }
}
