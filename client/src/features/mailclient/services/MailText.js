/**
 * MailText — reine Textlogik des Mail-Clients (Adressen, Betreff, Zitat,
 * Formatierung). Framework- und DOM-frei, deshalb ohne Browser testbar.
 */

/** 'Max Muster <max@example.org>' → { name: 'Max Muster', adresse: 'max@example.org' } */
export function parseAdresse(roh) {
  const s = String(roh ?? '').trim()
  if (!s) return { name: '', adresse: '' }
  const m = s.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/)
  if (m) {
    return { name: m[1].trim(), adresse: m[2].trim().toLowerCase() }
  }
  return { name: '', adresse: s.replace(/^<|>$/g, '').trim().toLowerCase() }
}

/** Adressliste (Komma/Semikolon-getrennt, Namen mit Kommas in Anführungszeichen) → Array. */
export function parseAdressListe(roh) {
  const s = String(roh ?? '')
  const teile = []
  let aktuell = ''
  let inAnfuehrung = false
  let inKlammer = false
  for (const zeichen of s) {
    if (zeichen === '"') inAnfuehrung = !inAnfuehrung
    else if (zeichen === '<' && !inAnfuehrung) inKlammer = true
    else if (zeichen === '>' && !inAnfuehrung) inKlammer = false
    if ((zeichen === ',' || zeichen === ';') && !inAnfuehrung && !inKlammer) {
      teile.push(aktuell)
      aktuell = ''
      continue
    }
    aktuell += zeichen
  }
  teile.push(aktuell)
  return teile
    .map(t => t.trim())
    .filter(Boolean)
    .map(parseAdresse)
    .filter(a => a.adresse)
}

/** Anzeigename: Name, sonst der Teil vor dem @. */
export function absenderName(roh) {
  const { name, adresse } = parseAdresse(roh)
  if (name) return name
  return adresse.split('@')[0] || adresse
}

/** Zwei Buchstaben für den Avatar-Kreis. */
export function initialen(roh) {
  const name = absenderName(roh)
  const woerter = name.split(/[\s._-]+/).filter(Boolean)
  if (woerter.length >= 2) return (woerter[0][0] + woerter[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

const RE_PRAEFIX = /^\s*((re|aw|wg|fwd?|sv|antw)\s*:\s*)+/i

/** 'Angebot' → 'Re: Angebot'; 'AW: Re: Angebot' → 'Re: Angebot' */
export function baueReplyBetreff(betreff) {
  const kern = String(betreff ?? '').replace(RE_PRAEFIX, '').trim()
  return `Re: ${kern}`
}

/**
 * Empfänger für Antwort / Allen antworten.
 * Die eigene Adresse fliegt aus Cc, der Absender landet in An.
 */
export function baueReplyEmpfaenger({ sender, recipient, cc, eigeneAdresse, alle }) {
  const absender = parseAdresse(sender)
  const eigene = String(eigeneAdresse ?? '').trim().toLowerCase()
  const to = absender.adresse ? [absender.adresse] : []
  if (!alle) return { to, cc: [] }

  const gesehen = new Set([...to, eigene].filter(Boolean))
  const kopie = []
  for (const a of [...parseAdressListe(recipient), ...parseAdressListe(cc)]) {
    if (gesehen.has(a.adresse)) continue
    gesehen.add(a.adresse)
    kopie.push(a.adresse)
  }
  return { to, cc: kopie }
}

/** ISO-String aus der API → Date. Naive Zeitstempel sind UTC (Backend speichert utcnow). */
export function parseDatum(iso) {
  if (!iso) return null
  if (iso instanceof Date) return iso
  const s = String(iso)
  const hatZone = /(Z|[+-]\d{2}:?\d{2})$/.test(s)
  const d = new Date(hatZone ? s : `${s}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

const MONATE_KURZ = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.']
const pad = n => String(n).padStart(2, '0')

/** Listen-Datum: heute 'HH:MM', dieses Jahr '27. Aug.', sonst '27.08.2025'. */
export function formatDatum(iso, jetzt = new Date()) {
  const d = parseDatum(iso)
  if (!d) return ''
  const heute = d.getFullYear() === jetzt.getFullYear()
    && d.getMonth() === jetzt.getMonth()
    && d.getDate() === jetzt.getDate()
  if (heute) return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (d.getFullYear() === jetzt.getFullYear()) return `${d.getDate()}. ${MONATE_KURZ[d.getMonth()]}`
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
}

/** Lesebereich: '27.08.2026, 10:05' */
export function formatDatumLang(iso) {
  const d = parseDatum(iso)
  if (!d) return ''
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 1234 → '1,2 KB' */
export function formatGroesse(bytes) {
  const n = Number(bytes) || 0
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1).replace('.', ',')} KB`
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

/** Zitatblock für Antworten: Kopfzeile + jede Zeile mit '> '. */
export function baueZitat(mail) {
  const text = String(mail?.body_text ?? '').replace(/\r\n/g, '\n').trimEnd()
  const kopf = `Am ${formatDatumLang(mail?.received_at)} schrieb ${mail?.sender ?? ''}:`
  const zeilen = text ? text.split('\n').map(z => `> ${z}`) : []
  return ['', '', kopf, ...zeilen].join('\n')
}

/** HTML-Body als Notlösung in Text wandeln, wenn body_text fehlt. */
export function htmlZuText(html) {
  return String(html ?? '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
