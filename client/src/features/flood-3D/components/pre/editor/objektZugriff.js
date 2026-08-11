// Objekt-Zugriffsschicht des Editors (aus Editor3D.vue geschnitten):
// je Objekttyp die Griffe (points/insert/write/zAt …), das Verschieben und
// die Fang-Punkte. Reine Daten-/Store-Logik ohne three.js — deshalb als
// eigenes Modul test- und lesbar. Erweitert wird hier (Registry-Zweige),
// nicht im Editor.
export function erzeugeObjektZugriff({ store, holeGroups }) {
const _r2 = (v) => Number(v.toFixed(2))

// Importierte Körper haben weder Achse noch Grundrisspolygon — sie werden
// über eine Transform-Bearbeitung bewegt, die bei Bedarf angelegt wird.
function transformEdit(o) {
  o.edits = o.edits ?? []
  let t = o.edits.find((e) => e.type === 'transform')
  if (!t) {
    t = { id: 'lage', type: 'transform', verschieben: [0, 0, 0],
      drehen_deg: 0, skalieren: 1 }
    o.edits.push(t)
  }
  t.verschieben = t.verschieben ?? [0, 0, 0]
  return t
}

// Mittelpunkt eines importierten Körpers aus der Server-Vorschau
function importPos(obj) {
  const mesh = (holeGroups().solids?.children ?? [])
    .find((c) => c.userData?.id === obj.id)
  if (mesh) {
    mesh.geometry.computeBoundingBox()
    const b = mesh.geometry.boundingBox
    return [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2,
      (b.min.z + b.max.z) / 2]
  }
  const t = (obj.edits ?? []).find((e) => e.type === 'transform')
  return t?.verschieben ?? [0, 0, 0]
}

// Die Spiegel der Serverregeln (openingPos, resolveWindow,
// resolveBcFaces) sind GELÖSCHT: die Geometrie-Antwort liefert die
// aufgelösten Randflächen, Fenster und Öffnungslagen als
// store.aufgeloest — eine Regel, eine Implementierung, im Backend.

// Punkt ans Modellgebiet klemmen (UX-Schicht beim Ziehen/Zeichnen; die
// GARANTIE bleibt serverseitig: Validierung + build_case-Säuberung).
// `margin` erlaubt den gewollten Mündungs-Überstand von Rohr-/Grabenachsen.
function clampDomain(p, margin = 0) {
  const d = store.spec?.domain
  if (!d) return p
  const [x0, y0, x1, y1] = d.extent
  return [_r2(Math.min(Math.max(p[0], x0 - margin), x1 + margin)),
    _r2(Math.min(Math.max(p[1], y0 - margin), y1 + margin)),
    ...p.slice(2)]
}

// Erlaubter Überstand beim Klemmen: Durchlass-/Grabenachsen DÜRFEN über
// den Rand stehen (Mündung), alles andere bleibt im Gebiet
function clampMarge(obj) {
  return ['culvert', 'graben'].includes(obj?.type)
    ? Math.max(4 * (store.spec?.mesh?.base_cell ?? 0.25), 1.0) : 0
}

// Verschiebe-Delta so begrenzen, dass die xy-Hülle des Objekts im Gebiet
// bleibt. Ein Objekt, das größer als das Gebiet ist (oder schon draußen
// liegt), wird nicht geklemmt — sonst spränge es beim ersten Zug.
function _begrenzeDelta(kind, obj, dx, dy) {
  const d = store.spec?.domain
  if (!d || kind === 'domain' || kind === 'boundary') return [dx, dy]
  const pts = []
  const sammle = (list) => { for (const q of list ?? []) pts.push(q) }
  sammle(obj.polyline); sammle(obj.polygon); sammle(obj.footprint)
  sammle(obj.axis); sammle(obj.crest_polyline); sammle(obj.plane_polygon)
  sammle(obj.alignment?.points); sammle(obj.oberkante); sammle(obj.unterkante)
  if (obj.point) pts.push(obj.point)
  if (obj.center) pts.push(obj.center)
  if (obj.extent?.length === 6) {
    pts.push([obj.extent[0], obj.extent[1]], [obj.extent[3], obj.extent[4]])
  }
  if (!pts.length) return [dx, dy]
  const marge = clampMarge(obj)
  const [x0, y0, x1, y1] = d.extent
  const xs = pts.map((q) => q[0])
  const ys = pts.map((q) => q[1])
  const loX = (x0 - marge) - Math.min(...xs)
  const hiX = (x1 + marge) - Math.max(...xs)
  const loY = (y0 - marge) - Math.min(...ys)
  const hiY = (y1 + marge) - Math.max(...ys)
  return [loX <= hiX ? _r2(Math.min(Math.max(dx, loX), hiX)) : dx,
    loY <= hiY ? _r2(Math.min(Math.max(dy, loY), hiY)) : dy]
}

function translateObject(kind, obj, dx, dy, dz = 0) {
  ;[dx, dy] = _begrenzeDelta(kind, obj, dx, dy)
  const mv = (p) => {
    const q = [_r2(p[0] + dx), _r2(p[1] + dy), ...p.slice(2)]
    if (p.length > 2 && dz) q[2] = _r2(p[2] + dz)
    return q
  }
  // Höhenverschiebung für Objekte, deren z in Skalarfeldern steckt
  const lift = (...keys) => {
    if (!dz) return
    for (const k of keys) {
      if (typeof obj[k] === 'number') obj[k] = _r2(obj[k] + dz)
    }
  }
  if (kind === 'gauge') { obj.point = mv(obj.point); return obj }
  if (kind === 'kante') { obj.polyline = obj.polyline.map(mv); return obj }
  if (kind === 'section') { obj.polyline = obj.polyline.map(mv); return obj }
  if (kind === 'vorfuellung') {
    // Ohne diesen Zweig bewegte Shift-Ziehen die Wasserebene nur OPTISCH:
    // commitObjectDrag schrieb dann ein unverändertes Objekt zurück und
    // die Vorfüllung sprang an ihren alten Platz (Audit F2)
    if (obj.polygon) obj.polygon = obj.polygon.map(mv)
    lift('level')
    return obj
  }
  if (kind === 'terrain_op') {
    if (obj.polyline) obj.polyline = obj.polyline.map(mv)
    if (obj.polygon) obj.polygon = obj.polygon.map(mv)   // 2D wie 3D
    if (obj.center) obj.center = mv(obj.center)
    // Böschung besteht aus ZWEI Linien — ohne diesen Zweig ließe sie sich
    // als Ganzes gar nicht verschieben
    if (obj.oberkante) obj.oberkante = obj.oberkante.map(mv)
    if (obj.unterkante) obj.unterkante = obj.unterkante.map(mv)
    lift('level')
    return obj
  }
  if (kind === 'structure' && obj.type === 'imported') {
    const t = transformEdit(obj)
    t.verschieben = [_r2(t.verschieben[0] + dx), _r2(t.verschieben[1] + dy),
      _r2(t.verschieben[2] + dz)]
    return obj
  }
  if (kind === 'structure') {
    if (obj.alignment?.points) obj.alignment.points = obj.alignment.points.map(mv)
    if (obj.axis) obj.axis = obj.axis.map(mv)
    if (obj.footprint?.length) obj.footprint = obj.footprint.map(mv)
    if (obj.plane_polygon) obj.plane_polygon = obj.plane_polygon.map(mv)
    if (obj.crest_polyline) obj.crest_polyline = obj.crest_polyline.map(mv)
    if (obj.center) obj.center = mv(obj.center)
    lift('invert_level', 'base_level', 'top_level')
    return obj
  }
  if (kind === 'domain') {
    const e = obj.extent
    obj.extent = [e[0] + dx, e[1] + dy, e[2] + dx, e[3] + dy]
    if (dz) {
      obj.z_min = _r2(obj.z_min + dz)
      obj.z_max = _r2(obj.z_max + dz)
    }
    return obj
  }
  if (kind === 'refinement' && obj.extent) {
    const e = obj.extent
    obj.extent = [e[0] + dx, e[1] + dy, _r2(e[2] + dz),
      e[3] + dx, e[4] + dy, _r2(e[5] + dz)]
    return obj
  }
  return obj
}

// Kann das Objekt als Ganzes in der Höhe verschoben werden?
function objectZable(kind, obj) {
  if (!obj) return false
  if (kind === 'gauge') return obj.point?.length > 2
  if (kind === 'kante') return true
  // Strg-Zug an der Wasserebene stellt den Spiegel (level)
  if (kind === 'vorfuellung') return typeof obj.level === 'number'
  if (kind === 'structure' || kind === 'refinement'
      || kind === 'domain') return true
  if (kind === 'terrain_op') {
    // Vermessungskanten tragen ihre Höhe im Stützpunkt, nicht in einem
    // Höhenfeld — auch sie dürfen als Ganzes gehoben werden
    if (obj.oberkante || obj.type === 'bruchkante') return true
    if (obj.type === 'aussenkante') return !!obj.polygon?.length
    return typeof obj.level === 'number'
  }
  return false
}

// Einfüge-Schreiber: neuer Punkt NACH Index i; 3D-Listen interpolieren z
function _insert2d(field) {
  return (o, i, p) => { o[field].splice(i + 1, 0, p) }
}

function _insert3d(getList) {
  return (o, i, p) => {
    const list = getList(o)
    const zA = list[i][2]
    const zB = list[(i + 1) % list.length][2]
    list.splice(i + 1, 0, [p[0], p[1], Number(((zA + zB) / 2).toFixed(2))])
  }
}

// Fangpunkte für den Punktfang: alle Stützpunkte ANDERER Objekte
function collectSnapPoints() {
  const sel = store.selection
  const pts = []
  const push = (list) => { for (const q of list ?? []) pts.push([q[0], q[1]]) }
  for (const s of store.spec?.structures ?? []) {
    if (sel?.kind === 'structure' && s.id === sel.id) continue
    push(s.footprint); push(s.axis); push(s.crest_polyline)
    push(s.alignment?.points); push(s.plane_polygon)
    if (s.center) pts.push([s.center[0], s.center[1]])
  }
  for (const t of store.spec?.terrain?.operations ?? []) {
    if (sel?.kind === 'terrain_op' && t.id === sel.id) continue
    push(t.polyline); push(t.polygon)
  }
  for (const sec of store.spec?.evaluation?.sections ?? []) {
    if (sel?.kind === 'section' && sec.id === sel.id) continue
    push(sec.polyline)
  }
  return pts
}

// Ecken-Löscher: false = Minimum erreicht, nichts tun
function _removeAt(list, i, min) {
  if (!list || list.length <= min) return false
  list.splice(i, 1)
  return true
}

function handleAccess(kind, obj) {
  if (!obj) return null
  if (kind === 'vorfuellung') {
    // Polygon-Griffe wie bei einer Geländeoperation; der Strg-Zug stellt
    // den Wasserspiegel (level) — die Wasserebene in der Szene folgt.
    // (Der alte Zweig hatte eine eigene write(pts)-Konvention, die zum
    // Editor-Vertrag write(o, i, p) nie passte — Griffe waren tot.)
    if (!Array.isArray(obj.polygon) || !obj.polygon.length) return null
    return {
      points: obj.polygon.map(([x, y]) => [x, y]),
      closed: true,
      zAt: () => obj.level ?? 0,
      insert: _insert2d('polygon'),
      remove: (o, i) => _removeAt(o.polygon, i, 3),
      write: (o, i, p) => { o.polygon[i] = [_r2(p[0]), _r2(p[1])] },
      writeZ: (o, i, dz) => { o.level = _r2((o.level ?? 0) + dz) },
    }
  }
  if (kind === 'gauge') {
    return { points: [obj.point],
      write: (o, i, p) => { o.point = [p[0], p[1], ...o.point.slice(2)] },
      ...(obj.point?.length > 2 ? {
        writeZ: (o, i, dz) => { o.point[2] = _r2(o.point[2] + dz) },
      } : {}) }
  }
  if (kind === 'kante') {
    // Vermessungskante: Höhe je Stützpunkt — wie die Bruchkanten-Operation
    if (!obj.polyline?.length) return null
    return { points: obj.polyline.map((q) => [q[0], q[1]]), closed: false,
      zJePunkt: true,
      zAt: (i) => obj.polyline[i][2],
      insert: _insert3d((o) => o.polyline),
      remove: (o, i) => _removeAt(o.polyline, i, 2),
      write: (o, i, p) => { o.polyline[i] = [p[0], p[1], o.polyline[i][2]] },
      writeZ: (o, i, dz) => { o.polyline[i][2] = _r2(o.polyline[i][2] + dz) } }
  }
  if (kind === 'section') {
    return { points: obj.polyline, closed: false,
      insert: _insert2d('polyline'),
      remove: (o, i) => _removeAt(o.polyline, i, 2),
      write: (o, i, p) => { o.polyline[i] = p } }
  }
  if (kind === 'terrain_op') {
    // Z-Zug an den Stützpunkten stellt die Höhenfelder der Operation:
    // Gerinne-Sohle (Anfang/Ende), Rampe (Anfang/Ende), Damm-Krone,
    // Planum-Höhe. Mittlere Punkte einer Strecke verschieben beide Enden
    // (das ganze Gefälle parallel).
    const zPair = obj.invert_start != null
      ? ['invert_start', 'invert_end']
      : obj.level_start != null ? ['level_start', 'level_end'] : null
    const zSingle = obj.crest_level != null ? 'crest_level'
      : obj.level != null ? 'level' : null
    const opZ = (o, i, dz, n) => {
      if (zPair) {
        if (i === 0) o[zPair[0]] = _r2(o[zPair[0]] + dz)
        else if (i === n - 1) o[zPair[1]] = _r2(o[zPair[1]] + dz)
        else {
          o[zPair[0]] = _r2(o[zPair[0]] + dz)
          o[zPair[1]] = _r2(o[zPair[1]] + dz)
        }
      } else if (zSingle) {
        o[zSingle] = _r2(o[zSingle] + dz)
      }
    }
    const zable = zPair != null || zSingle != null
    // Vermessungskanten tragen die Höhe JE Stützpunkt — hier zieht der
    // Z-Zug genau diesen einen Punkt, nicht ein Höhenfeld der Operation.
    if (obj.type === 'aussenkante' && obj.polygon?.length) {
      // Rahmen am Gebietsrand: Höhe steckt im Eckpunkt, nicht in einem
      // Höhenfeld — Strg-Zug stellt genau diese eine Ecke
      return { points: obj.polygon.map((q) => [q[0], q[1]]), closed: true,
        zJePunkt: true,
        zAt: (i) => obj.polygon[i][2],
        insert: _insert3d((o) => o.polygon),
        remove: (o, i) => _removeAt(o.polygon, i, 3),
        write: (o, i, p) => { o.polygon[i] = [p[0], p[1], o.polygon[i][2]] },
        writeZ: (o, i, dz) => { o.polygon[i][2] = _r2(o.polygon[i][2] + dz) } }
    }
    if (obj.type === 'bruchkante' || obj.type === 'boeschung') {
      const feld = obj.type === 'bruchkante' ? 'polyline' : 'oberkante'
      return { points: obj[feld].map((q) => [q[0], q[1]]), closed: false,
        zJePunkt: true,
        zAt: (i) => obj[feld][i][2],
        insert: _insert3d((o) => o[feld]),
        remove: (o, i) => _removeAt(o[feld], i, 2),
        write: (o, i, p) => { o[feld][i] = [p[0], p[1], o[feld][i][2]] },
        writeZ: (o, i, dz) => { o[feld][i][2] = _r2(o[feld][i][2] + dz) } }
    }
    if (obj.polyline) {
      return { points: obj.polyline, closed: false,
        insert: _insert2d('polyline'),
        remove: (o, i) => _removeAt(o.polyline, i, 2),
        write: (o, i, p) => { o.polyline[i] = p },
        ...(zable ? { writeZ: (o, i, dz) => opZ(o, i, dz, o.polyline.length) }
          : {}) }
    }
    if (obj.polygon) {
      return { points: obj.polygon, closed: true,
        insert: _insert2d('polygon'),
        remove: (o, i) => _removeAt(o.polygon, i, 3),
        write: (o, i, p) => { o.polygon[i] = p },
        ...(zable ? { writeZ: (o, i, dz) => opZ(o, i, dz, o.polygon.length) }
          : {}) }
    }
    if (obj.center && typeof obj.radius === 'number') {
      // zweiter Griff auf dem Wirkkreis: Ziehen stellt den Radius. Vorher
      // ließ sich die Reichweite nur tippen, obwohl sie im Grundriss die
      // wichtigste Größe dieser Operationen ist.
      const rad = Math.max(obj.radius, 0.1)
      return {
        points: [obj.center, [obj.center[0] + rad, obj.center[1]]],
        write: (o, i, p) => {
          if (i === 0) { o.center = p; return }
          const d = Math.hypot(p[0] - o.center[0], p[1] - o.center[1])
          o.radius = Math.max(_r2(d), 0.1)
        },
        ...(typeof obj.level === 'number'
          ? { writeZ: (o, i, dz) => { o.level = _r2(o.level + dz) } } : {}),
      }
    }
    if (obj.center) {
      return { points: [obj.center], write: (o, i, p) => { o.center = p },
        ...(zable ? { writeZ: (o, i, dz) => opZ(o, 0, dz, 1) } : {}) }
    }
    return null
  }
  if (kind === 'structure') {
    // Handles auf OBJEKThöhe (Krone/Kopf), nicht auf dem Geländeboden —
    // sonst verschwinden sie unter dem Bauwerk (z. B. Ecke überm Gerinne)
    if (obj.type === 'wall') {
      return {
        points: obj.alignment.points.map((q) => [q[0], q[1]]),
        closed: false,
        zJePunkt: true,
        zAt: (i) => obj.alignment.points[i][2] + 0.3,
        insert: _insert3d((o) => o.alignment.points),
        remove: (o, i) => _removeAt(o.alignment.points, i, 2),
        write: (o, i, p) => {
          o.alignment.points[i] = [p[0], p[1], o.alignment.points[i][2]]
        },
        writeZ: (o, i, dz) => {
          o.alignment.points[i][2] = _r2(o.alignment.points[i][2] + dz)
        },
      }
    }
    if (obj.type === 'culvert') {
      return {
        points: obj.axis.map((q) => [q[0], q[1]]),
        closed: false,
        zJePunkt: true,
        zAt: (i) => obj.axis[i][2] + 0.6,
        insert: _insert3d((o) => o.axis),
        remove: (o, i) => _removeAt(o.axis, i, 2),
        write: (o, i, p) => { o.axis[i] = [p[0], p[1], o.axis[i][2]] },
        writeZ: (o, i, dz) => { o.axis[i][2] = _r2(o.axis[i][2] + dz) },
      }
    }
    if (obj.type === 'weir') {
      return {
        points: obj.crest_polyline.map((q) => [q[0], q[1]]),
        closed: false,
        zJePunkt: true,
        zAt: (i) => obj.crest_polyline[i][2] + 0.3,
        insert: _insert3d((o) => o.crest_polyline),
        remove: (o, i) => _removeAt(o.crest_polyline, i, 2),
        write: (o, i, p) => {
          o.crest_polyline[i] = [p[0], p[1], o.crest_polyline[i][2]]
        },
        writeZ: (o, i, dz) => {
          o.crest_polyline[i][2] = _r2(o.crest_polyline[i][2] + dz)
        },
      }
    }
    if (obj.type === 'screen') {
      // Alle vier Ecken einzeln greifbar — auch die SOHLKNOTEN. Unter- und
      // Oberecke gehören als SPALTE zusammen, darum bewegt ein
      // Grundriss-Zug beide (sonst verdreht sich die Ebene, Bug „Knoten
      // hängt"); in der Höhe wandert nur die gegriffene Ecke. Die Spalte
      // kommt aus der POLYGON-KONVENTION (Punkt i gehört zu Punkt n-1-i,
      // wie build_screen_bars sie liest) — der frühere xy-Vergleich
      // versagte, sobald die Ebene einmal geneigt war (Ecken liegen dann
      // im Grundriss nicht mehr übereinander → Plan-Zug scherte die Ebene).
      const n = obj.plane_polygon.length
      const colOf = (o, i) => {
        const partner = o.plane_polygon.length - 1 - i
        return partner === i ? [i] : [i, partner]
      }
      // Obere Ecken (fürs Kippen): die zwei höchsten Punkte
      const obenIdx = (o) => o.plane_polygon
        .map((q, k) => [q[2], k])
        .sort((a, b) => b[0] - a[0])
        .slice(0, 2)
        .map(([, k]) => k)
      const obenMitte = (o) => {
        const [a, b] = obenIdx(o)
        return [(o.plane_polygon[a][0] + o.plane_polygon[b][0]) / 2,
          (o.plane_polygon[a][1] + o.plane_polygon[b][1]) / 2]
      }
      const mitte = obenMitte(obj)
      return {
        // 5. Griff auf der Oberkanten-Mitte: Plan-Zug KIPPT die Ebene
        // (nur die beiden oberen Ecken wandern, die Unterkante bleibt als
        // Scharnier stehen), Strg-Zug hebt die ganze Oberkante
        points: [...obj.plane_polygon.map((q) => [q[0], q[1]]), mitte],
        closed: true,
        loops: [[...Array(n).keys()]],
        zJePunkt: true,
        zPunkte: n,
        zAt: (i) => (i < n ? obj.plane_polygon[i][2] + 0.3
          : Math.max(...obj.plane_polygon.map((q) => q[2])) + 0.3),
        write: (o, i, p) => {
          if (i < n) {
            for (const k of colOf(o, i)) {
              o.plane_polygon[k] = [p[0], p[1], o.plane_polygon[k][2]]
            }
            return
          }
          const alt = obenMitte(o)
          const dx = p[0] - alt[0]
          const dy = p[1] - alt[1]
          for (const k of obenIdx(o)) {
            o.plane_polygon[k] = [_r2(o.plane_polygon[k][0] + dx),
              _r2(o.plane_polygon[k][1] + dy), o.plane_polygon[k][2]]
          }
        },
        writeZ: (o, i, dz) => {
          if (i < n) {
            o.plane_polygon[i][2] = _r2(o.plane_polygon[i][2] + dz)
            return
          }
          for (const k of obenIdx(o)) {
            o.plane_polygon[k][2] = _r2(o.plane_polygon[k][2] + dz)
          }
        },
      }
    }
    const topZ = obj.top_level ?? (obj.invert_level != null
      ? obj.invert_level + (obj.wall_height ?? 0) : null)
    // Z-Zug an Pfeiler-/Becken-Ecken stellt die Oberkante: Pfeiler über
    // top_level, Becken über wall_height (Krone hoch/runter)
    const structZ = (o, dz) => {
      if (o.top_level != null) {
        o.top_level = _r2(Math.max(o.top_level + dz,
          (o.base_level ?? -1e9) + 0.1))
      } else if (o.wall_height != null) {
        o.wall_height = _r2(Math.max(o.wall_height + dz, 0.1))
      }
    }
    if (obj.center) {
      return { points: [obj.center],
        zAt: topZ != null ? () => topZ + 0.3 : undefined,
        write: (o, i, p) => { o.center = p },
        writeZ: (o, i, dz) => structZ(o, dz) }
    }
    if (obj.type === 'imported') {
      // Ein Greifpunkt in der Körpermitte: Ziehen verschiebt in x/y,
      // Strg-Zug in z. Einzelne Netzknoten eines Imports anzufassen wäre
      // sinnlos — ein STL hat Tausende davon.
      const pos = importPos(obj)
      return {
        points: [[pos[0], pos[1]]],
        zAt: () => pos[2],
        write: (o, i, q) => {
          const t = transformEdit(o)
          t.verschieben = [_r2(t.verschieben[0] + (q[0] - pos[0])),
            _r2(t.verschieben[1] + (q[1] - pos[1])), t.verschieben[2]]
        },
        writeZ: (o, i, dz) => {
          const t = transformEdit(o)
          t.verschieben = [t.verschieben[0], t.verschieben[1],
            _r2(t.verschieben[2] + dz)]
        },
      }
    }
    if (obj.footprint?.length) {
      return { points: obj.footprint,
        closed: true,
        zAt: topZ != null ? () => topZ + 0.3 : undefined,
        insert: _insert2d('footprint'),
        remove: (o, i) => _removeAt(o.footprint, i, 3),
        write: (o, i, p) => { o.footprint[i] = p },
        writeZ: (o, i, dz) => structZ(o, dz) }
    }
    return null
  }
  if (kind === 'boundary') {
    // Zu-/Ablauf-Fenster: zwei Handles an der Fenster-Oberkante, ziehbar
    // ENTLANG der Gebietskante (die Querkoordinate wird verworfen — die
    // Y/X-Führungslinie rastet von selbst). Ohne Fenster sitzen die
    // Handles an den Kantenenden; sie hineinziehen ERZEUGT das Fenster.
    if (!['inflow_hydrograph', 'inflow_constant', 'outflow_fixed_level',
      'outflow_free'].includes(obj.type)) return null
    // Gekoppeltes Fenster hat keine eigenen Handles — Lage ändert man,
    // indem man das Gerinne zieht (oder die Kopplung im Panel löst)
    if (obj.window?.follow) return null
    const dom = store.spec?.domain
    const face = store.aufgeloest?.bcFaces?.[obj.id]
    if (!dom || !face || face === 'z_max') return null
    const [x0, y0, x1, y1] = dom.extent
    const along = face.startsWith('x') ? [y0, y1] : [x0, x1]
    const fixed = { x_min: x0, x_max: x1, y_min: y0, y_max: y1 }[face]
    const span = obj.window?.span
      ? [...obj.window.span].sort((a, b) => a - b) : [...along]
    const pt = (s) => (face.startsWith('x') ? [fixed, s] : [s, fixed])
    const zTop = obj.window?.z_max ?? dom.z_max
    const clampSpan = (v) => _r2(Math.min(Math.max(v, along[0]), along[1]))
    const shape = obj.window?.shape
    if (shape === 'polygon') {
      // Querschnitt zeichnen wie beim Rechen: jede Ecke einzeln greifbar —
      // Kanten-Zug verschiebt sie entlang der Fläche, Z-Zug in der Höhe,
      // Klick auf eine Kante fügt eine neue Ecke ein
      const pts = obj.window.points
      if (!pts || pts.length < 3) return null
      return {
        points: pts.map((q) => pt(q[0])),
        closed: true,
        zAt: (i) => pts[i][1],
        insert: (o, i, p) => {
          const list = o.window.points
          const a = clampSpan(face.startsWith('x') ? p[1] : p[0])
          const zMid = _r2((list[i][1] + list[(i + 1) % list.length][1]) / 2)
          list.splice(i + 1, 0, [a, zMid])
        },
        remove: (o, i) => _removeAt(o.window.points, i, 3),
        write: (o, i, p) => {
          o.window.points[i] = [
            clampSpan(face.startsWith('x') ? p[1] : p[0]),
            o.window.points[i][1]]
        },
        writeZ: (o, i, dz) => {
          const q = o.window.points[i]
          q[1] = _r2(Math.min(Math.max(q[1] + dz, dom.z_min), dom.z_max))
        },
      }
    }
    if (shape === 'kreis' || shape === 'trapez') {
      // Ein Mittelpunkt-Handle: Kanten-Zug = Lage, Z-Zug = Höhe der
      // Öffnung (kreis: Achse; trapez: ganzes Fenster hoch/runter)
      const c = obj.window.center
      const zRef = shape === 'kreis' ? obj.window.z_center : obj.window.z_max
      if (c == null || zRef == null) return null
      return {
        points: [pt(c)],
        zAt: () => zRef,
        write: (o, i, p) => {
          o.window.center = clampSpan(face.startsWith('x') ? p[1] : p[0])
        },
        writeZ: (o, i, dz) => {
          const win = o.window
          if (win.shape === 'kreis') {
            win.z_center = _r2(Math.min(Math.max(win.z_center + dz,
              dom.z_min), dom.z_max))
          } else {
            const zMin = win.z_min + dz
            const zMax = win.z_max + dz
            if (zMin >= dom.z_min && zMax <= dom.z_max) {
              win.z_min = _r2(zMin)
              win.z_max = _r2(zMax)
            }
          }
        },
      }
    }
    return {
      points: [pt(span[0]), pt(span[1])],
      closed: false,
      zAt: () => zTop,
      write: (o, i, p) => {
        const v = clampSpan(face.startsWith('x') ? p[1] : p[0])
        const s = o.window?.span ? [...o.window.span] : [...along]
        s[i] = v
        if (o.window) o.window.span = s
        else o.window = { span: s }
      },
      writeZ: (o, i, dz) => {
        const base = o.window?.z_max ?? dom.z_max
        const z = _r2(Math.min(Math.max(base + dz, dom.z_min + 0.1), dom.z_max))
        if (o.window) o.window.z_max = z
        else o.window = { span: [...along], z_max: z }
      },
    }
  }
  if (kind === 'domain') {
    // Acht Eckgriffe: vier unten auf der Sohle, vier oben am Deckel.
    // Waagerechtes Ziehen verschiebt an jeder Ecke die beiden angrenzenden
    // Kanten, Strg-Zug stellt die Höhe — unten die Unterkante (z_min),
    // oben die Oberkante (z_max). Damit lässt sich die Berechnungsbox im
    // Bild zurechtrücken statt über sechs Zahlen.
    const [ax0, ay0, ax1, ay1] = obj.extent
    const ecken = [[ax0, ay0], [ax1, ay0], [ax1, ay1], [ax0, ay1]]
    return {
      points: [...ecken, ...ecken],
      loops: [[0, 1, 2, 3], [4, 5, 6, 7]],
      // Index 0-3 = Sohle, 4-7 = Deckel
      zAt: (i) => (i < 4 ? obj.z_min - 0.3 : obj.z_max + 0.3),
      write: (o, i, p) => {
        const e = [...o.extent]
        const k = i % 4
        if (k === 0) { e[0] = p[0]; e[1] = p[1] }
        else if (k === 1) { e[2] = p[0]; e[1] = p[1] }
        else if (k === 2) { e[2] = p[0]; e[3] = p[1] }
        else { e[0] = p[0]; e[3] = p[1] }
        o.extent = [Math.min(e[0], e[2]), Math.min(e[1], e[3]),
          Math.max(e[0], e[2]), Math.max(e[1], e[3])]
      },
      writeZ: (o, i, dz) => {
        if (i < 4) o.z_min = _r2(Math.min(o.z_min + dz, o.z_max - 0.1))
        else o.z_max = _r2(Math.max(o.z_max + dz, o.z_min + 0.1))
      },
    }
  }
  if (kind === 'refinement' && obj.type === 'box') {
    const e = obj.extent
    return {
      points: [[e[0], e[1]], [e[3], e[4]]],
      zAt: () => e[5] + 0.3,
      write: (o, i, p) => {
        const x = [...o.extent]
        if (i === 0) { x[0] = p[0]; x[1] = p[1] } else { x[3] = p[0]; x[4] = p[1] }
        o.extent = [Math.min(x[0], x[3]), Math.min(x[1], x[4]), x[2],
          Math.max(x[0], x[3]), Math.max(x[1], x[4]), x[5]]
      },
      // Ecke 1 zieht die Unterkante, Ecke 2 die Oberkante der Box
      writeZ: (o, i, dz) => {
        const x = [...o.extent]
        if (i === 0) x[2] = _r2(x[2] + dz)
        else x[5] = _r2(x[5] + dz)
        o.extent = [x[0], x[1], Math.min(x[2], x[5]),
          x[3], x[4], Math.max(x[2], x[5])]
      },
    }
  }
  return null
}


  return { _r2, transformEdit, importPos, translateObject, objectZable,
    collectSnapPoints, handleAccess, clampDomain, clampMarge }
}
