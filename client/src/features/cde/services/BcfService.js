/**
 * BCF 3.0 Export/Import (.bcfzip) — der Standard-Austauschkanal für Issues
 * mit externen BIM-Tools (BIMcollab, Solibri, Revit-/Archicad-Plugins).
 *
 * Mapping Issue ↔ BCF-Topic:
 *   text            → Title (1. Zeile) + Description (voll)
 *   status          → TopicStatus  Open | InProgress | Closed
 *   assignee        → AssignedTo
 *   dueDate         → DueDate
 *   author/createdAt→ CreationAuthor/CreationDate
 *   comments[]      → Comment-Elemente
 *   viewpoint       → viewpoint.bcfv (PerspectiveCamera)
 *
 * Koordinaten: Viewer ist three.js-Y-up, BCF ist IFC-Z-up. Konvention:
 *   BCF(X,Y,Z) = (three.x, -three.z, three.y)   und zurück
 *   three(x,y,z) = (X, Z, -Y)
 * Ein evtl. Koordinations-Offset (georeferenzierte Modelle) wird hier NICHT
 * verrechnet — Roundtrip im eigenen Werkzeug ist verlustfrei; für externe
 * Tools mit Georeferenz kommt der Offset mit Stufe C (Server kennt das Modell).
 */

import JSZip from 'jszip';

const BCF_VERSION_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bcf.version xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" VersionId="3.0">
  <DetailedVersion>3.0</DetailedVersion>
</bcf.version>
`;

function _esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function _uuid() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
}

function _iso(ts) {
  return new Date(ts ?? Date.now()).toISOString();
}

const STATUS_TO_BCF = { 'open': 'Open', 'in-progress': 'InProgress', 'closed': 'Closed' };
function _statusFromBcf(s) {
  const t = String(s ?? '').toLowerCase().replace(/[\s_-]/g, '');
  if (t === 'closed' || t === 'resolved' || t === 'done') return 'closed';
  if (t === 'inprogress') return 'in-progress';
  return 'open';
}

// ── Koordinaten three.js (Y-up) ↔ BCF/IFC (Z-up) ────────────────────────────
function _threeToBcf([x, y, z]) { return { X: x, Y: -z, Z: y }; }
function _bcfToThree({ X, Y, Z }) { return [X, Z, -Y]; }

function _norm(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

// ── Export ──────────────────────────────────────────────────────────────────

function _viewpointXml(guid, viewpoint) {
  const cam = viewpoint?.camera;
  if (!cam?.position || !cam?.target) return null;
  const dir = _norm([
    cam.target[0] - cam.position[0],
    cam.target[1] - cam.position[1],
    cam.target[2] - cam.position[2],
  ]);
  const p = _threeToBcf(cam.position);
  const d = _threeToBcf(dir);
  const u = _threeToBcf(cam.up ?? [0, 1, 0]);
  const vec = (v) => `<X>${v.X.toFixed(6)}</X><Y>${v.Y.toFixed(6)}</Y><Z>${v.Z.toFixed(6)}</Z>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<VisualizationInfo Guid="${guid}">
  <PerspectiveCamera>
    <CameraViewPoint>${vec(p)}</CameraViewPoint>
    <CameraDirection>${vec(d)}</CameraDirection>
    <CameraUpVector>${vec(u)}</CameraUpVector>
    <FieldOfView>60</FieldOfView>
    <AspectRatio>1.777778</AspectRatio>
  </PerspectiveCamera>
</VisualizationInfo>
`;
}

function _markupXml(issue, topicGuid, viewpointGuid, opts) {
  const title = (issue.text ?? '').split('\n')[0].slice(0, 120) || `Issue #${issue.idx}`;
  const comments = (issue.comments ?? []).map(c => `
    <Comment Guid="${_uuid()}">
      <Date>${_iso(c.createdAt)}</Date>
      <Author>${_esc(c.author || opts.author)}</Author>
      <Comment>${_esc(c.text)}</Comment>
    </Comment>`).join('');
  const viewpoints = viewpointGuid ? `
    <Viewpoints>
      <ViewPoint Guid="${viewpointGuid}">
        <Viewpoint>viewpoint.bcfv</Viewpoint>
      </ViewPoint>
    </Viewpoints>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<Markup>
  <Topic Guid="${topicGuid}" TopicType="Issue" TopicStatus="${STATUS_TO_BCF[issue.status] ?? 'Open'}">
    <Title>${_esc(title)}</Title>
    <CreationDate>${_iso(issue.createdAt)}</CreationDate>
    <CreationAuthor>${_esc(issue.author || opts.author)}</CreationAuthor>${issue.assignee ? `
    <AssignedTo>${_esc(issue.assignee)}</AssignedTo>` : ''}${issue.dueDate ? `
    <DueDate>${_iso(issue.dueDate)}</DueDate>` : ''}
    <Description>${_esc(issue.text ?? '')}</Description>
    <Comments>${comments}
    </Comments>${viewpoints}
  </Topic>
</Markup>
`;
}

/**
 * Issues → .bcfzip-Blob.
 * @param {Array} issues  Issue-Objekte aus dem Store
 * @param {{projectName?: string, author?: string}} opts
 */
export async function exportBcf(issues, opts = {}) {
  const o = { projectName: 'Projekt', author: 'quagg-cde', ...opts };
  const zip = new JSZip();
  zip.file('bcf.version', BCF_VERSION_XML);

  for (const issue of issues ?? []) {
    // Stabile Topic-Guid: beim Re-Export dieselbe behalten (Merge-Anker)
    const topicGuid = issue.bcfGuid ?? _uuid();
    const folder = zip.folder(topicGuid);
    const vpXml = _viewpointXml(topicGuid, issue.viewpoint);
    const vpGuid = vpXml ? _uuid() : null;
    folder.file('markup.bcf', _markupXml(issue, topicGuid, vpGuid, o));
    if (vpXml) folder.file('viewpoint.bcfv', vpXml);
  }

  return zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });
}

// ── Import ──────────────────────────────────────────────────────────────────

function _text(el, tag) {
  return el?.getElementsByTagName(tag)?.[0]?.textContent ?? null;
}
function _vec(el, tag) {
  const v = el?.getElementsByTagName(tag)?.[0];
  if (!v) return null;
  return {
    X: Number(_text(v, 'X')), Y: Number(_text(v, 'Y')), Z: Number(_text(v, 'Z')),
  };
}

function _parseViewpoint(xmlText) {
  try {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    const cam = doc.getElementsByTagName('PerspectiveCamera')[0]
             ?? doc.getElementsByTagName('OrthogonalCamera')[0];
    if (!cam) return null;
    const pos = _vec(cam, 'CameraViewPoint');
    const dir = _vec(cam, 'CameraDirection');
    const up  = _vec(cam, 'CameraUpVector');
    if (!pos || !dir) return null;
    const position = _bcfToThree(pos);
    const dir3 = _norm(_bcfToThree(dir));
    // Target synthetisieren: 10 m in Blickrichtung — CameraControls braucht ein Ziel
    const target = [position[0] + dir3[0] * 10, position[1] + dir3[1] * 10, position[2] + dir3[2] * 10];
    return {
      camera: { position, target, up: up ? _bcfToThree(up) : [0, 1, 0] },
      visibleCategories: null, // BCF-Komponenten-Sichtbarkeit: erst mit Component-Mapping
      section: null,
    };
  } catch { return null; }
}

/**
 * .bcfzip → Issue-Objekte (Store-Schema). Die Pin-Position wird aus dem
 * Viewpoint abgeleitet (Punkt 5 m vor der Kamera) — BCF kennt keine Pins.
 * @param {ArrayBuffer} buffer
 * @returns {Promise<Array>}
 */
export async function importBcf(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const issues = [];

  // Topic-Ordner: alle Pfade der Form <guid>/markup.bcf
  const markupPaths = Object.keys(zip.files).filter(p => p.endsWith('markup.bcf'));

  for (const path of markupPaths) {
    try {
      const folder = path.slice(0, path.lastIndexOf('/') + 1);
      const xml = await zip.file(path).async('string');
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      const topic = doc.getElementsByTagName('Topic')[0];
      if (!topic) continue;

      const guid = topic.getAttribute('Guid') ?? _uuid();
      const title = _text(topic, 'Title') ?? '';
      const description = _text(topic, 'Description') ?? '';
      const text = description && description !== title ? description : title;

      // Kommentare: BCF 3.0 (unter Topic) und BCF 2.1 (unter Markup) einsammeln
      const comments = [];
      for (const c of doc.getElementsByTagName('Comment')) {
        // In BCF ist <Comment> sowohl Container als auch Text-Element — nur
        // Container mit eigenem Guid-Attribut zählen.
        if (!c.getAttribute || !c.getAttribute('Guid')) continue;
        const commentText = _text(c, 'Comment');
        if (!commentText?.trim()) continue;
        comments.push({
          author: _text(c, 'Author') ?? '',
          text: commentText.trim(),
          createdAt: Date.parse(_text(c, 'Date') ?? '') || Date.now(),
        });
      }

      // Ersten Viewpoint des Ordners lesen
      let viewpoint = null;
      const vpPath = Object.keys(zip.files).find(p => p.startsWith(folder) && p.endsWith('.bcfv'));
      if (vpPath) viewpoint = _parseViewpoint(await zip.file(vpPath).async('string'));

      // Pin-Position: 5 m vor der Kamera, sonst Ursprung
      let position = [0, 0, 0];
      if (viewpoint?.camera) {
        const { position: p, target: t } = viewpoint.camera;
        const d = _norm([t[0] - p[0], t[1] - p[1], t[2] - p[2]]);
        position = [p[0] + d[0] * 5, p[1] + d[1] * 5, p[2] + d[2] * 5];
      }

      const due = _text(topic, 'DueDate');
      issues.push({
        id: 'bcf-' + guid,
        bcfGuid: guid,
        text,
        position,
        color: '#1e88e5',
        status: _statusFromBcf(topic.getAttribute('TopicStatus')),
        assignee: _text(topic, 'AssignedTo') ?? '',
        dueDate: due ? due.slice(0, 10) : null,
        author: _text(topic, 'CreationAuthor') ?? '',
        createdAt: Date.parse(_text(topic, 'CreationDate') ?? '') || Date.now(),
        comments,
        viewpoint,
      });
    } catch (e) {
      console.warn('[BCF] Topic übersprungen:', path, e?.message ?? e);
    }
  }

  return issues;
}
