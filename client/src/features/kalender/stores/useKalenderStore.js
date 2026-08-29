import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { kalenderApi, fehlerText } from '../services/kalenderApi'
import { bereichFuer, tagBeginn, verschiebe } from '../services/KalenderZeit'

export const SICHTEN = ['monat', 'woche', 'liste']

/**
 * useKalenderStore — Zustand der Kalender-Ansicht: Sicht + Anker bestimmen das
 * Zeitfenster, der Rest kommt vom Backend. Dialog-Zustand lebt hier, damit
 * Monatsraster, Liste und Akte denselben Termin-Dialog öffnen können.
 */
export const useKalenderStore = defineStore('kalender', () => {
  const sicht = ref('monat')
  const anker = ref(tagBeginn(new Date()))
  const termine = ref([])
  const meilensteine = ref([])
  const projekte = ref([])
  const laedt = ref(false)
  const fehler = ref('')
  const sync = ref(null)
  const dialog = ref(null)          // null | { termin: Object|null, vorgabe: Object }
  const feed = ref(null)            // null | { aktiv, url?, webcal?, erstellt_am?, zuletzt_abgerufen_am? }
  const feedDialogOffen = ref(false)

  const bereich = computed(() => bereichFuer(sicht.value, anker.value))

  let lauf = 0

  async function lade() {
    const nr = ++lauf
    laedt.value = true
    fehler.value = ''
    try {
      const { von, bis } = bereich.value
      const daten = await kalenderApi.liste(von.toISOString(), bis.toISOString())
      if (nr !== lauf) return
      termine.value = daten.termine || []
      meilensteine.value = daten.meilensteine || []
      sync.value = daten.sync || null
    } catch (err) {
      if (nr !== lauf) return
      fehler.value = fehlerText(err, 'Kalender konnte nicht geladen werden.')
    } finally {
      if (nr === lauf) laedt.value = false
    }
  }

  async function ladeProjekte() {
    try {
      projekte.value = (await kalenderApi.projekte()).map(p => ({ id: p.id, name: p.name, kurzname: p.kurzname || '' }))
    } catch {
      projekte.value = []
    }
  }

  function setzeSicht(neu) {
    if (!SICHTEN.includes(neu) || neu === sicht.value) return
    sicht.value = neu
    return lade()
  }

  function gehe(richtung) {
    anker.value = verschiebe(anker.value, sicht.value, richtung)
    return lade()
  }

  function heute() {
    anker.value = tagBeginn(new Date())
    return lade()
  }

  function springeZu(datum) {
    anker.value = tagBeginn(datum)
    return lade()
  }

  function oeffneDialog(termin = null, vorgabe = {}) {
    dialog.value = { termin, vorgabe }
  }

  function schliesseDialog() {
    dialog.value = null
  }

  async function _schreibe(aufruf) {
    fehler.value = ''
    try {
      const ergebnis = await aufruf()
      await lade()
      return ergebnis
    } catch (err) {
      fehler.value = fehlerText(err, 'Aktion fehlgeschlagen.')
      throw err
    }
  }

  const anlegen = felder => _schreibe(() => kalenderApi.anlegen(felder))
  const aendern = (id, felder) => _schreibe(() => kalenderApi.aendern(id, felder))
  const entfernen = id => _schreibe(() => kalenderApi.entfernen(id))
  const einladen = (id, optionen) => _schreibe(() => kalenderApi.einladen(id, optionen))

  async function antwortenAbholen() {
    fehler.value = ''
    try {
      const ergebnis = await kalenderApi.antwortenVerarbeiten()
      await lade()
      sync.value = ergebnis          // das Sync-Ergebnis gewinnt gegen das best-effort-Sync aus lade()
      return ergebnis
    } catch (err) {
      fehler.value = fehlerText(err, 'Antworten konnten nicht abgeholt werden.')
      return null
    }
  }

  async function feedLaden() {
    try {
      feed.value = await kalenderApi.feedLink()
    } catch (err) {
      fehler.value = fehlerText(err, 'Feed-Status konnte nicht geladen werden.')
    }
  }

  async function feedNeu() {
    feed.value = await kalenderApi.feedNeu()
    return feed.value
  }

  async function feedWiderrufen() {
    feed.value = await kalenderApi.feedWiderrufen()
    return feed.value
  }

  return {
    sicht, anker, termine, meilensteine, projekte, laedt, fehler, sync, dialog, feed, feedDialogOffen, bereich,
    lade, ladeProjekte, setzeSicht, gehe, heute, springeZu, oeffneDialog, schliesseDialog,
    anlegen, aendern, entfernen, einladen, antwortenAbholen, feedLaden, feedNeu, feedWiderrufen,
  }
})
