/**
 * KalenderZeit — reine Datumslogik des Kalenders (ohne DOM, ohne Store).
 *
 * Grundsatz: Das Backend liefert ISO-Zeiten in UTC mit Offset; der Browser
 * rechnet in seiner Ortszeit. Alle Umrechnungen laufen über echte Date-Objekte,
 * nie über String-Schnipsel — so bleiben Sommerzeit-Grenzen korrekt.
 */

export const TAGE_KURZ = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
export const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August',
  'September', 'Oktober', 'November', 'Dezember']

const pad = n => String(n).padStart(2, '0')

export function parseIso(wert) {
  if (wert instanceof Date) return wert
  if (!wert) return null
  const s = String(wert)
  const hatZone = /(Z|[+-]\d{2}:?\d{2})$/.test(s)
  const d = new Date(hatZone || s.length <= 10 ? s : `${s}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function tagBeginn(d) {
  const x = parseIso(d)
  return new Date(x.getFullYear(), x.getMonth(), x.getDate())
}

export function addTage(d, n) {
  const x = tagBeginn(d)
  return new Date(x.getFullYear(), x.getMonth(), x.getDate() + n)
}

export function tagSchluessel(d) {
  const x = parseIso(d)
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`
}

export function istGleicherTag(a, b) {
  return tagSchluessel(a) === tagSchluessel(b)
}

export function istHeute(d, jetzt = new Date()) {
  return istGleicherTag(d, jetzt)
}

/** Montag 00:00 der Woche, in der d liegt. */
export function wochenStart(d) {
  const x = tagBeginn(d)
  const versatz = (x.getDay() + 6) % 7   // Mo=0 … So=6
  return addTage(x, -versatz)
}

/** 42 Tage (6 Wochen, Montag-Start), die den Monat abdecken. */
export function monatsraster(jahr, monat) {
  const start = wochenStart(new Date(jahr, monat, 1))
  return Array.from({ length: 42 }, (_, i) => addTage(start, i))
}

export function wochenTage(d) {
  const start = wochenStart(d)
  return Array.from({ length: 7 }, (_, i) => addTage(start, i))
}

/** Zeitfenster der Sicht als [von, bis) — bis exklusiv. */
export function bereichFuer(sicht, anker) {
  const a = tagBeginn(anker)
  if (sicht === 'monat') {
    const raster = monatsraster(a.getFullYear(), a.getMonth())
    return { von: raster[0], bis: addTage(raster[41], 1) }
  }
  if (sicht === 'woche') {
    const start = wochenStart(a)
    return { von: start, bis: addTage(start, 7) }
  }
  return { von: a, bis: addTage(a, 31) }
}

export function verschiebe(anker, sicht, richtung) {
  const a = tagBeginn(anker)
  if (sicht === 'monat') return new Date(a.getFullYear(), a.getMonth() + richtung, 1)
  if (sicht === 'woche') return addTage(a, 7 * richtung)
  return addTage(a, 31 * richtung)
}

/**
 * Termine je Tag (Schlüssel 'YYYY-MM-DD') innerhalb [von, bis). Mehrtägige
 * Termine erscheinen an jedem Tag, den sie berühren; Ganztag-Ende ist exklusiv,
 * ein Termin bis 24:00 zählt nicht mehr zum Folgetag.
 */
export function termineJeTag(termine, von, bis) {
  const karte = new Map()
  const vonT = tagBeginn(von)
  const bisT = tagBeginn(bis)
  for (const t of termine || []) {
    const beginn = parseIso(t.beginn)
    const ende = parseIso(t.ende)
    if (!beginn || !ende) continue
    let tag = tagBeginn(beginn)
    const letzter = tagBeginn(new Date(ende.getTime() - 1))
    while (tag <= letzter) {
      if (tag >= vonT && tag < bisT) {
        const k = tagSchluessel(tag)
        if (!karte.has(k)) karte.set(k, [])
        karte.get(k).push(t)
      }
      tag = addTage(tag, 1)
    }
  }
  for (const liste of karte.values()) {
    liste.sort((a, b) => (b.ganztag - a.ganztag) || (parseIso(a.beginn) - parseIso(b.beginn)))
  }
  return karte
}

/** Meilensteine je Tag (faellig_am 'YYYY-MM-DD'). */
export function meilensteineJeTag(meilensteine) {
  const karte = new Map()
  for (const m of meilensteine || []) {
    const k = String(m.faellig_am || '').slice(0, 10)
    if (!k) continue
    if (!karte.has(k)) karte.set(k, [])
    karte.get(k).push(m)
  }
  return karte
}

// ── Formular-Konvertierung (datetime-local / date) ───────────────────────

/** ISO → 'YYYY-MM-DDTHH:MM' in Ortszeit (Wert für <input type="datetime-local">). */
export function zuLokalInput(iso) {
  const d = parseIso(iso)
  if (!d) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 'YYYY-MM-DDTHH:MM' (Ortszeit) → ISO mit dem Offset dieses Zeitpunkts, z. B. 2026-09-01T10:00:00+02:00. */
export function ausLokalInput(wert) {
  if (!wert) return null
  const [datum, zeit = '00:00'] = String(wert).split('T')
  const [j, m, t] = datum.split('-').map(Number)
  const [h, min] = zeit.split(':').map(Number)
  const d = new Date(j, m - 1, t, h || 0, min || 0)
  if (Number.isNaN(d.getTime())) return null
  const versatz = -d.getTimezoneOffset()
  const vz = versatz >= 0 ? '+' : '-'
  const abs = Math.abs(versatz)
  return `${datum}T${pad(h || 0)}:${pad(min || 0)}:00${vz}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

/** ISO → 'YYYY-MM-DD' (Ortszeit) für <input type="date">. */
export function zuDatumInput(iso) {
  const d = parseIso(iso)
  return d ? tagSchluessel(d) : ''
}

/** Gespeichertes exklusives Ganztag-Ende → letzter Tag inklusiv als 'YYYY-MM-DD'. */
export function ganztagEndeInklusiv(isoEnde) {
  const d = parseIso(isoEnde)
  if (!d) return ''
  // Ganztag-Grenzen sind UTC-Mitternacht; per UTC-Datum rechnen, nicht per Ortszeit
  const letzter = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 1))
  return `${letzter.getUTCFullYear()}-${pad(letzter.getUTCMonth() + 1)}-${pad(letzter.getUTCDate())}`
}

/** Ganztag-Beginn (UTC-Mitternacht) als 'YYYY-MM-DD'. */
export function ganztagBeginn(isoBeginn) {
  const d = parseIso(isoBeginn)
  return d ? `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` : ''
}

// ── Anzeige ──────────────────────────────────────────────────────────────

export function formatUhr(d) {
  const x = parseIso(d)
  return x ? `${pad(x.getHours())}:${pad(x.getMinutes())}` : ''
}

export function formatDatum(d) {
  const x = parseIso(d)
  return x ? `${pad(x.getDate())}.${pad(x.getMonth() + 1)}.${x.getFullYear()}` : ''
}

export function formatDatumKurz(d) {
  const x = parseIso(d)
  return x ? `${TAGE_KURZ[(x.getDay() + 6) % 7]}, ${pad(x.getDate())}.${pad(x.getMonth() + 1)}.` : ''
}

/** 'Di, 01.09.2026 10:00–11:30' | '10.09.2026 – 11.09.2026 (ganztägig)' */
export function formatSpanne(termin) {
  if (!termin) return ''
  if (termin.ganztag) {
    const erster = ganztagBeginn(termin.beginn)
    const letzter = ganztagEndeInklusiv(termin.ende)
    const f = s => s ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : ''
    return letzter && letzter !== erster ? `${f(erster)} – ${f(letzter)} (ganztägig)` : `${f(erster)} (ganztägig)`
  }
  const b = parseIso(termin.beginn)
  const e = parseIso(termin.ende)
  if (!b || !e) return ''
  const tag = `${TAGE_KURZ[(b.getDay() + 6) % 7]}, ${formatDatum(b)}`
  if (istGleicherTag(b, e)) return `${tag} ${formatUhr(b)}–${formatUhr(e)}`
  return `${formatDatum(b)} ${formatUhr(b)} – ${formatDatum(e)} ${formatUhr(e)}`
}

export function monatsTitel(anker) {
  const a = parseIso(anker)
  return `${MONATE[a.getMonth()]} ${a.getFullYear()}`
}

export function wochenTitel(anker) {
  const tage = wochenTage(anker)
  const a = tage[0]
  const z = tage[6]
  return `${pad(a.getDate())}.${pad(a.getMonth() + 1)}. – ${pad(z.getDate())}.${pad(z.getMonth() + 1)}.${z.getFullYear()}`
}

export const STATUS_LABEL = {
  'NEEDS-ACTION': 'offen',
  ACCEPTED: 'zugesagt',
  DECLINED: 'abgesagt',
  TENTATIVE: 'vorbehaltlich',
  DELEGATED: 'delegiert',
}
