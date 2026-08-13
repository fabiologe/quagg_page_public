// Trefferermittlung des Editors (aus Editor3D.vue geschnitten): Strahlen
// aus Zeigerereignissen, Boden-/Ebenen-Picks und die Auswahl von Griffen,
// Objekten und Bearbeitungs-Markern. Kamera und Gruppen kommen über
// Getter/Referenzen, weil der Editor sie erst beim Mount belegt.
import * as THREE from 'three'

// Normierte Gerätekoordinaten eines Zeigerereignisses (rein rechenbar)
export function ndcAusEvent(clientX, clientY, rect) {
  return new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1)
}

// Bauwerke/Marker haben Vorrang vor (großen) Verfeinerungsboxen
export function bevorzugterTreffer(hits) {
  if (!hits.length) return null
  return hits.find((h) => h.object.userData.kind !== 'refinement') ?? hits[0]
}

// echte Stützpunkte haben Vorrang vor den kleineren Zwischenpunkten;
// bei überlappenden Grabbern gewinnt der, dessen ZENTRUM dem Strahl am
// nächsten liegt — nicht der zufällig vorderste dicke Grabber
export function besterGriff(hits, ray) {
  if (!hits.length) return null
  const real = hits.filter((h) => h.object.userData.handleIdx != null)
  if (real.length) {
    return real.reduce((best, h) =>
      (ray.ray.distanceToPoint(h.object.position)
        < ray.ray.distanceToPoint(best.object.position) ? h : best)).object
  }
  return hits[0].object
}

export function erzeugePick({ store, groups, selectable, host, holeCamera }) {
  function ray(e) {
    const rect = host.value.getBoundingClientRect()
    const r = new THREE.Raycaster()
    r.setFromCamera(ndcAusEvent(e.clientX, e.clientY, rect), holeCamera())
    return r
  }

  function planePick(e, z) {
    // Drag auf der horizontalen Ebene der Griffhöhe — kein Parallaxe-Sprung
    // und kein Einfrieren, wenn der Cursor das Gelände verlässt
    const pt = new THREE.Vector3()
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -z)
    return ray(e).ray.intersectPlane(plane, pt) ? pt : null
  }

  function groundPick(e) {
    if (!groups.terrain) return null
    const hits = ray(e).intersectObjects(groups.terrain.children, false)
    return hits.length ? hits[0].point : null
  }

  function pickHandle(e) {
    if (!groups.handles) return null
    const r = ray(e)
    const hits = r.intersectObjects(
      groups.handles.children.filter((c) => c.userData.handleIdx != null
        || c.userData.insertAfter != null), false)
    return besterGriff(hits, r)
  }

  function pickSelectable(e) {
    return bevorzugterTreffer(ray(e).intersectObjects(selectable, false))
  }

  // Marker einer Bearbeitung unter dem Zeiger (nur am gewählten Bauwerk)
  function pickEditMarker(e) {
    if (!groups.markers) return null
    const sel = store.selection
    if (sel?.kind !== 'structure') return null
    const ziele = groups.markers.children.filter(
      (c) => c.userData?.editIdx != null && c.userData.id === sel.id)
    if (!ziele.length) return null
    const hits = ray(e).intersectObjects(ziele, false)
    return hits.length ? hits[0].object : null
  }

  return { ray, planePick, groundPick, pickHandle, pickSelectable,
    pickEditMarker }
}
