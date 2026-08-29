/**
 * Zeit.js — Minuten-Arithmetik und Stundennachweis-Zeilen, rein und ohne DOM.
 */

/** 95 → "1:35 h" */
export function minutenAlsText(min) {
  const m = Math.max(0, Math.round(Number(min) || 0));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} h`;
}

/** 95 → 1.58 (Dezimalstunden, 2 Stellen) */
export function minutenAlsDezimal(min) {
  return Math.round(((Number(min) || 0) / 60) * 100) / 100;
}

/** Eingabe "1:30", "1,5", "90m", "2h" → Minuten oder null */
export function textZuMinuten(text) {
  const roh = String(text || '').trim().toLowerCase().replace(/\s/g, '');
  if (!roh) return null;
  let m;
  if ((m = roh.match(/^(\d{1,2}):(\d{1,2})$/))) return Number(m[1]) * 60 + Number(m[2]);
  if ((m = roh.match(/^(\d+)m(in)?$/))) return Number(m[1]);
  if ((m = roh.match(/^(\d+(?:[.,]\d+)?)h?$/))) return Math.round(Number(m[1].replace(',', '.')) * 60);
  return null;
}

/** Montag–Sonntag der Woche eines ISO-Datums */
export function wochenblatt(iso) {
  const d = new Date(`${iso}T00:00:00`);
  const tag = (d.getDay() + 6) % 7;
  const start = new Date(d);
  start.setDate(d.getDate() - tag);
  const ende = new Date(start);
  ende.setDate(start.getDate() + 6);
  const f = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  return [f(start), f(ende)];
}

/**
 * Stundennachweis als Tabellenzeilen (für xlsx/CSV/PDF): Datum, Tätigkeit,
 * Abschnitt, Minuten, Stunden, abrechenbar, Rechnung — plus Summenzeile.
 */
export function nachweisZeilen(buchungen, abschnittNamen = {}) {
  const kopf = ['Datum', 'Tätigkeit', 'Abschnitt', 'Minuten', 'Stunden', 'Abrechenbar', 'Rechnung'];
  const zeilen = [...buchungen]
    .sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : a.id - b.id))
    .map((z) => [z.datum, z.taetigkeit, abschnittNamen[z.abschnitt_id] || '', z.dauer_min,
      minutenAlsDezimal(z.dauer_min), z.abrechenbar ? 'ja' : 'nein', z.rechnung_id ? `#${z.rechnung_id}` : '']);
  const summe = buchungen.reduce((s, z) => s + (Number(z.dauer_min) || 0), 0);
  zeilen.push(['Summe', '', '', summe, minutenAlsDezimal(summe), '', '']);
  return [kopf, ...zeilen];
}

export function alsCsv(zeilen) {
  const feld = (v) => {
    const t = String(v ?? '');
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return zeilen.map((z) => z.map(feld).join(';')).join('\r\n');
}
