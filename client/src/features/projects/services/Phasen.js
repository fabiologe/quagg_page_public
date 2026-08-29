/**
 * Phasen.js — das Vokabular des Cockpits, rein und ohne DOM.
 * Die Phase eines Projekts ist seine Ordnerlage auf der StorageBox; hier
 * stehen nur Anzeige-Labels, Farb-Token und Formatierer.
 */

export const PHASEN = [
  { id: '00_Angebote', titel: 'Angebot', token: '--prj-phase-angebot' },
  { id: '01_Laufend', titel: 'Laufend', token: '--prj-phase-laufend' },
  { id: '02_Pausiert', titel: 'Pausiert', token: '--prj-phase-pausiert' },
  { id: '03_Abgeschlossen', titel: 'Abgeschlossen', token: '--prj-phase-abgeschlossen' },
  { id: '04_Abgelehnt', titel: 'Abgelehnt', token: '--prj-phase-abgelehnt' },
  { id: '05_Bezahlt', titel: 'Bezahlt', token: '--prj-phase-bezahlt' },
];

export const HONORARMODELLE = [
  { id: 'hoai', titel: 'HOAI-Leistungsphasen' },
  { id: 'pauschal', titel: 'Pauschale (freie Abschnitte)' },
  { id: 'stunden', titel: 'Stunden (Budget)' },
];

export const ROLLEN = [
  { id: 'bauherr', titel: 'Bauherr' },
  { id: 'auftraggeber', titel: 'Auftraggeber' },
  { id: 'rechnungsempfaenger', titel: 'Rechnungsempfänger' },
  { id: 'architekt', titel: 'Architekt' },
  { id: 'behoerde', titel: 'Behörde' },
  { id: 'fachplaner', titel: 'Fachplaner' },
  { id: 'ausfuehrende_firma', titel: 'Ausführende Firma' },
  { id: 'sonstige', titel: 'Sonstige' },
];

export const MEILENSTEIN_ARTEN = [
  { id: 'termin', titel: 'Termin' },
  { id: 'abgabe', titel: 'Abgabe' },
  { id: 'bindefrist', titel: 'Bindefrist' },
  { id: 'gewaehrleistung', titel: 'Gewährleistung' },
  { id: 'aufbewahrung', titel: 'Aufbewahrung' },
  { id: 'wiedervorlage', titel: 'Wiedervorlage' },
];

export const LEISTUNGSPHASEN = [
  [1, 'Grundlagenermittlung'], [2, 'Vorplanung'], [3, 'Entwurfsplanung'],
  [4, 'Genehmigungsplanung'], [5, 'Ausführungsplanung'], [6, 'Vorbereitung der Vergabe'],
  [7, 'Mitwirkung bei der Vergabe'], [8, 'Objektüberwachung'], [9, 'Objektbetreuung'],
].map(([nr, titel]) => ({ nr, titel }));

const _titel = (liste) => Object.fromEntries(liste.map((e) => [e.id, e.titel]));
const PHASE_TITEL = _titel(PHASEN);
const MODELL_TITEL = _titel(HONORARMODELLE);
const ROLLE_TITEL = _titel(ROLLEN);
const ART_TITEL = _titel(MEILENSTEIN_ARTEN);

export function phaseTitel(id) {
  if (!id) return 'Ohne Ordner';
  return PHASE_TITEL[id] || id;
}

export function phaseToken(id) {
  return (PHASEN.find((p) => p.id === id) || {}).token || '--prj-text-dim';
}

export const modellTitel = (id) => MODELL_TITEL[id] || id || '—';
export const rolleTitel = (id) => ROLLE_TITEL[id] || id || '—';
export const artTitel = (id) => ART_TITEL[id] || id || '—';

const DATUM = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** '2027-03-01' → '01.03.2027'; leer/ungültig → '—' */
export function datum(iso) {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? '—' : DATUM.format(d);
}

/** Tage bis zum Datum (negativ = überfällig); null ohne Datum. */
export function tageBis(iso, heute = new Date()) {
  if (!iso) return null;
  const ziel = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(ziel.getTime())) return null;
  const start = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate());
  return Math.round((ziel - start) / 86400000);
}

/** Dringlichkeit für Termin-Anzeigen: 'ueberfaellig' | 'bald' | 'ruhig' | null */
export function dringlichkeit(iso, horizontTage = 14, heute = new Date()) {
  const tage = tageBis(iso, heute);
  if (tage === null) return null;
  if (tage < 0) return 'ueberfaellig';
  if (tage <= horizontTage) return 'bald';
  return 'ruhig';
}
