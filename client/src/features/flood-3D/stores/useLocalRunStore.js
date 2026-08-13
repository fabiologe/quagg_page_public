// Lebenszyklus des LOKALEN (Companion-)Laufs — bewusst ein eigener Store:
// der Treiber muss Phasenwechsel und Seiten-Reload überleben, und die
// Komponenten (SimulationPanel, Header-Chip, RunLogPanel, …) rendern nur
// noch, was hier steht. Vorher lebte alles in SimulationPanel: jeder
// Phasenwechsel zerstörte Anzeige und Pause-Knopf, gab den Start-Knopf
// wieder frei (Doppelstart!) und bot den laufenden Job als „fortsetzen"
// an — ein zweiter Treiber auf demselben KONSUMIERENDEN Companion-Stream
// hätte beiden Ereignisse geklaut (2026-08-12).
import { defineStore } from 'pinia'
import { abgeschlosseneCompanionLaeufe, companionHealth, companionLaufManifest,
  importiereArtefakte, jobStatus, pauseLocalRun, runLocally,
  unterbrocheneLaeufe, verfolgen } from '../services/localCompanion'
import { flood3dApi } from '../services/api'
import { usePreStore } from './usePreStore'

const LOG_MAX = 200
const fmtDauer = (s) => (s == null ? '?'
  : s > 3600 ? `${(s / 3600).toFixed(1)} h`
    : s > 60 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`)
const neuerLauf = (teil) => ({ jobId: null, runId: null, caseId: null,
  angeknuepft: false, phase: null, fraction: null,
  letzteZeit: null, endZeit: null, etaS: null, ...teil })

export const useLocalRunStore = defineStore('flood3d-local-run', {
  state: () => ({
    companion: null,       // /health-Antwort (foamSupported, version, docker) oder null
    rechenort: 'runpod',   // 'local' | 'runpod' — der Server rechnet nicht mehr
    laufend: null,         // neuerLauf() solange der Treiber fährt, sonst null
    log: [],               // Ringpuffer, max LOG_MAX Zeilen
    pausing: false,
    offeneLaeufe: [],      // Companion /runs (engine openfoam, != COMPLETED)
    fehler: '',            // letzter Fehlertext (zusätzlich zum Toast)
  }),

  getters: {
    laeuft: (s) => s.laufend != null,
    fortschritt: (s) => s.laufend?.fraction ?? null,
    // der gerade gefahrene Job darf NICHT als „fortsetzen" angeboten werden
    wiederaufnehmbare: (s) =>
      s.offeneLaeufe.filter((r) => r.id !== s.laufend?.jobId),
  },

  actions: {
    zeile(text) {
      this.log.push(text)
      if (this.log.length > LOG_MAX) this.log.splice(0, this.log.length - LOG_MAX)
    },

    _laufnummer(runId) {
      if (!this.laufend) return
      this.laufend.runId = runId
      // Laufnummern folgen der Konvention <fall>_rNNN
      this.laufend.caseId ??= runId.replace(/_r\d+$/, '')
    },

    // Ereignis→Zustand: dieselbe Abbildung, die vorher als Closure im
    // SimulationPanel lebte — jetzt überlebt sie jeden Phasenwechsel.
    _ereignis(ev) {
      if (!this.laufend) return
      if (ev.event === 'job') {
        this.laufend.jobId = ev.jobId
      } else if (ev.event === 'progress' && ev.fraction != null) {
        this.laufend.fraction = ev.fraction
        if (ev.phase) this.laufend.phase = ev.phase
        if (ev.time != null) {
          this.laufend.letzteZeit = ev.time
          this.laufend.endZeit = ev.end_time ?? this.laufend.endZeit
          this.laufend.etaS = ev.eta_s ?? null
          const rest = ev.eta_s ? ` · noch ca. ${fmtDauer(ev.eta_s)}` : ''
          this.zeile(`t = ${ev.time} s / ${ev.end_time} s `
            + `(${Math.round(ev.fraction * 100)} %${rest})`)
        }
      } else if (ev.event === 'checkpoint') {
        if (ev.run_id) this._laufnummer(ev.run_id)
        if (ev.letzte_zeit != null) {
          this.zeile(`💾 Zwischenstand bis t = ${ev.letzte_zeit} s gesichert`)
        }
      } else if (ev.event === 'done') {
        if (ev.run_id) this._laufnummer(ev.run_id)
      } else if (ev.text) {
        this.zeile(ev.text)
      }
    },

    async companionPruefen(autoSelect = false) {
      this.companion = await companionHealth()
      this.offeneLaeufe = await unterbrocheneLaeufe()
      if (autoSelect && this.companion?.foamSupported) this.rechenort = 'local'
    },

    async starten(caseId) {
      const pre = usePreStore()
      // Doppelstart-Wache: synchrone Zuweisung VOR jedem await — die
      // Store-Instanz ist app-lebenslang, ein neu gemountetes Panel kann
      // keinen zweiten Treiber mehr losschicken.
      if (this.laufend) {
        pre.melden('Es läuft bereits ein lokaler Lauf — erst abwarten oder pausieren.',
          'warnung')
        return
      }
      this.laufend = neuerLauf({ caseId })
      this.log = []
      this.fehler = ''
      await this._fahren(async () => {
        if (pre.dirty && pre.activeCaseId === caseId) await pre.saveCase()
        return runLocally(caseId, (ev) => this._ereignis(ev), null)
      })
    },

    async fortsetzen(job) {
      if (this.laufend) return
      this.laufend = neuerLauf({ jobId: job.id })
      this.log = []
      this.fehler = ''
      // Läuft der Job in Wahrheit noch (z. B. nach einem Reload), wird NUR
      // angeknüpft — ein zweites Einreichen bekäme vom Companion 409, und
      // die Nachricht wäre ein Fehlertoast statt eines nahtlosen Weiter.
      const st = await jobStatus(job.id)
      const laeuftNoch = !!st && ['IN_QUEUE', 'IN_PROGRESS'].includes(st.status)
      if (laeuftNoch) {
        this.laufend.angeknuepft = true
        this.zeile(`Job ${job.id} läuft noch — es wird nur wieder angeknüpft.`)
        await this._fahren(() =>
          verfolgen(job.id, (ev) => this._ereignis(ev), { runId: null }))
        return
      }
      await this._fahren(() =>
        runLocally(null, (ev) => this._ereignis(ev),
          { jobId: job.id, runId: job.runId ?? null }))
    },

    async pausieren() {
      const pre = usePreStore()
      if (!this.laufend?.jobId) return
      this.pausing = true
      try {
        await pauseLocalRun(this.laufend.jobId)
      } catch (e) {
        pre.melden(`Pause: ${e.message}`, 'fehler')
      } finally {
        this.pausing = false
      }
    },

    // Beim App-Start: läuft auf dieser Maschine noch ein OpenFOAM-Job,
    // dessen Strom übernehmen OHNE neu einzureichen — damit übersteht die
    // Pipeline auch ein Neuladen der Seite. Idempotent über die
    // laufend-Wache; Mehrfachaufruf durch Remount/HMR ist harmlos.
    async anknuepfen() {
      if (this.laufend) return
      await this.companionPruefen(false)
      if (!this.companion?.foamSupported) return
      for (const r of this.offeneLaeufe) {
        if (this.laufend) return
        const st = await jobStatus(r.id)
        if (st && ['IN_QUEUE', 'IN_PROGRESS'].includes(st.status)) {
          this.laufend = neuerLauf({ jobId: r.id, angeknuepft: true })
          this.log = []
          this.fehler = ''
          this.zeile(`Wieder angeknüpft an Job ${r.id} — der Companion hat `
            + 'durchgerechnet, während der Browser weg war.')
          await this._fahren(() =>
            verfolgen(r.id, (ev) => this._ereignis(ev), { runId: null }))
          return
        }
      }
      await this.nachzuegler()
    },

    // Nachzuegler-Vollimport: der Companion hat fertig gerechnet, aber der
    // Browser war beim Ende weg — das Ergebnis liegt auf seiner Platte und
    // wird jetzt nachgeholt (Riegel: der Server-Status wird nach dem Import
    // terminal, ein zweiter Durchlauf findet nichts mehr).
    async nachzuegler() {
      if (this._nachzuegler_lief) return
      this._nachzuegler_lief = true
      const pre = usePreStore()
      for (const r of await abgeschlosseneCompanionLaeufe()) {
        const mf = await companionLaufManifest(r.id)
        const done = (mf?.events ?? []).filter((e) => e.event === 'done').at(-1)
        if (!done?.artifactsUrl || !done?.run_id) continue
        const detail = await flood3dApi.runDetail(done.run_id).catch(() => null)
        if (detail?.status !== 'lokal') continue
        pre.melden(`Hole fertiges Ergebnis ${done.run_id} vom Companion nach …`,
          'hinweis')
        try {
          await importiereArtefakte(done.artifactsUrl, done.run_id,
            (ev) => this._ereignis(ev))
          pre.melden(`Lauf ${done.run_id} nachträglich übernommen — die `
            + 'Ergebnisse sind da.', 'erfolg')
          if (pre.activeCaseId
              && done.run_id.startsWith(`${pre.activeCaseId}_r`)) {
            await pre.loadCaseRuns()
          }
        } catch (e) {
          pre.melden(`Nachzügler ${done.run_id}: ${e.message}`, 'warnung')
        }
      }
    },

    // Gemeinsamer Rahmen um jeden Treiber: Erfolg/Fehler, Toast,
    // Phasenlogik, Aufräumen.
    async _fahren(treiber) {
      const pre = usePreStore()
      try {
        const runId = await treiber()
        const caseId = this.laufend?.caseId
          ?? (runId ? runId.replace(/_r\d+$/, '') : null)
        this.laufend = null
        this.offeneLaeufe = await unterbrocheneLaeufe()
        if (caseId && pre.activeCaseId === caseId) {
          await pre.loadCaseRuns()
          // Entscheidung Fabio (2026-08-12): NUR umschalten, wenn der
          // Nutzer noch dort steht, wo er den Lauf gestartet hat — ein
          // Treiber reißt niemanden mehr aus einer anderen Phase.
          if (pre.activePhase === 'simulation') pre.activePhase = 'ergebnis'
        }
        pre.melden(`Lauf ${runId} übernommen — die Ergebnisse sind bereit.`, 'erfolg')
      } catch (e) {
        this.fehler = e.message
        this.zeile(`FEHLER: ${e.message}`)
        pre.melden(`Lokaler Lauf: ${e.message}`, 'fehler')
        this.laufend = null
        this.offeneLaeufe = await unterbrocheneLaeufe()
      }
    },
  },
})
