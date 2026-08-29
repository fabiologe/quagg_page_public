/**
 * Dokumente.js — Dateityp-Erkennung und Vorschau-Entscheidung, rein und ohne DOM.
 */

const OFFICE = { docx: 'word', doc: 'word', rtf: 'word', odt: 'word', xlsx: 'excel', xlsm: 'excel', xls: 'excel', csv: 'excel', ods: 'excel', pptx: 'powerpoint', ppt: 'powerpoint' };
const VORSCHAU = { pdf: 'pdf', docx: 'docx', xlsx: 'xlsx', csv: 'text', txt: 'text', md: 'text', json: 'text', yaml: 'text', yml: 'text', png: 'bild', jpg: 'bild', jpeg: 'bild', gif: 'bild', webp: 'bild', svg: 'bild' };
const WOPI = new Set(['docx', 'xlsx', 'pptx']);

export function endung(name) {
  const t = String(name || '');
  const i = t.lastIndexOf('.');
  return i < 0 ? '' : t.slice(i + 1).toLowerCase();
}

/** 'word' | 'excel' | 'powerpoint' | null */
export function officeArt(name) {
  return OFFICE[endung(name)] || null;
}

/** 'pdf' | 'docx' | 'xlsx' | 'text' | 'bild' | null */
export function vorschauArt(name) {
  return VORSCHAU[endung(name)] || null;
}

export function onlineBearbeitbar(name) {
  return WOPI.has(endung(name));
}

/** Pfad relativ zum Projektordner aus einem Explorer-Eintrag (path relativ zu 1_Projekte) */
export function relativZumProjekt(pfad, projektPfad) {
  const p = String(pfad || '');
  const basis = `${projektPfad}/`;
  return p.startsWith(basis) ? p.slice(basis.length) : p;
}
