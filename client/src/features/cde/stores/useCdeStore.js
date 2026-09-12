/**
 * CDE-Store — Auftrag, Modellsätze, Bearbeiter und Dokumentregister.
 *
 * DREI SCHICHTEN, seit Stufe 11 sauber getrennt (vorher hießen alle „Projekt"):
 *
 *   Auftrag       1337_Genau — der Ordner auf der StorageBox. Nummer, Bauherr,
 *                 LPH. GENAU EINER, und er kommt vom SERVER; die CDE legt
 *                 keine Aufträge an. Vorher führte der Client eine eigene
 *                 Projektliste daneben, und in `1337_Genau` standen am Ende
 *                 zwei erfundene „Projekte" mit derselben Nummer.
 *   Ablage        alle Container des Auftrags, `CDE/manifest.yaml`. Eine Datei
 *                 liegt GENAU EINMAL, adressiert über ihre sha256.
 *   Modellsatz    eine benannte AUSWAHL aus der Ablage („Bestand",
 *                 „Variante Nord"). Er besitzt nichts — er verweist. Dasselbe
 *                 Gelände in drei Varianten kostet einmal Platz.
 *
 * Fabios Bild dafür ist Git: Blobs sind inhaltsadressiert und werden geteilt,
 * ein Branch ist ein benannter Zeigersatz.
 *
 * Persistenz über die RepoFacade:
 *   Auftragsebene       'cde-bearbeitung', 'aenderungen', 'dokumente' (offline)
 *   scope stand:<id>    Ansichten, Stile, Issues, Journal des Modellsatzes
 *
 * Das Dokumentregister ist bewusst AUFTRAGSEBENE: `RemoteBackend.dokumente()`
 * liest immer `manifest.yaml` des Projektordners und beachtet den Scope nicht.
 * Was in Stufe 6 als Merkwürdigkeit notiert war, ist hier genau richtig.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useAuthStore } from '@/stores/useAuthStore.js';
import { pruefeStatuswechsel } from '../services/StatusWorkflow.js';
import { dokumentAusManifest, repo } from '../services/RepoFacade.js';

export const ISO_STATUS = Object.freeze(['WIP', 'Shared', 'Published', 'Archived']);

/**
 * T1/E5: Wasserzeichen-Text für den Planexport aus dem Dokument-Status.
 * Published = freigegeben → kein Wasserzeichen; unbekanntes Modell → VORABZUG
 * (konservativ: was nicht im Register steht, ist nicht freigegeben).
 * Reine Funktion — testbar ohne Store.
 */
// Wie reif ein Status ist — der UNREIFSTE einer Modellmenge bestimmt das Blatt.
const _REIFE = { WIP: 0, Shared: 1, Archived: 2, Published: 3 };

/**
 * Nimmt eine sha256 ODER die aller geladenen Dateien (Stufe 4, nachgereicht,
 * 2026-09-10): dann gilt der UNREIFSTE Status — ein Plan aus einem
 * freigegebenen und einem WIP-Modell ist ein Vorabzug. Bis hierher las das
 * Wasserzeichen nur das zuerst geladene Modell. Eine Datei, die nicht im
 * Register steht, gilt als WIP.
 */
export function resolveWatermarkText(dokumente, shaOderShas) {
    const shas = (Array.isArray(shaOderShas) ? shaOderShas : [shaOderShas]).filter(Boolean);
    if (!shas.length) return null;
    const stati = shas.map(sha => (dokumente ?? []).find(d => d.sha256 === sha)?.status ?? 'WIP');
    const status = stati.reduce((a, b) => ((_REIFE[b] ?? 0) < (_REIFE[a] ?? 0) ? b : a));
    switch (status) {
        case 'Published': return null;
        case 'Shared':    return 'ZUR PRÜFUNG';
        case 'Archived':  return 'ARCHIVIERT';
        default:          return 'VORABZUG';
    }
}

// Legacy: die alte Client-Projektliste. Wird nur noch GELESEN — die Migration
// (Stufe 11.5) macht daraus Modellsätze. Nicht umbenennen, sonst findet sie
// nichts mehr (dieselbe Lehre wie bei den `ifc-viewer-*`-Schlüsseln, Stufe 1).
const KEY_PROJECTS_ALT = 'cde-projects';
const KEY_ACTIVE_ALT   = 'cde-active-project';

const KEY_SATZ       = 'cde-aktiver-satz';
const KEY_BEARBEITER = 'cde-bearbeiter';
const KEY_DOKUMENTE  = 'dokumente';

export const useCdeStore = defineStore('cde', () => {
  /** Der Auftrag — vom SERVER, nicht aus dem Client. {id, nummer, name, bauherr, lph} */
  const auftrag = ref(null);
  /** Die Modellsätze des Auftrags — benannte Auswahlen aus der Ablage. */
  const saetze = ref([]);
  const aktiverSatzId = ref(null);
  /**
   * Der eingegebene Bearbeiter — leer heisst: der Login-Name gilt.
   * Fabios Journal von gestern trug überall `wer: ""` — eine Versionsliste
   * „wann WER was" ist damit wertlos. Deshalb ist `bearbeiter` jetzt eine
   * beschreibbare Ableitung mit dem Anzeigenamen aus der Anmeldung als
   * Rückfall; die Eingabe im Kopf überstimmt ihn weiterhin.
   */
  const bearbeiterEingabe = ref('');
  const bearbeiter = computed({
    get: () => bearbeiterEingabe.value || useAuthStore().anzeigename || '',
    set: (v) => { bearbeiterEingabe.value = (v ?? '').trim(); },
  });

  // Dokumentregister des AUFTRAGS (nicht des Satzes):
  // [{ sha256, name, size, projectGlobalId, status, revision, addedAt,
  //    statusHistorie: [{status, von, am}] }]
  const dokumente = ref([]);

  const aktiverSatz = computed(() =>
    saetze.value.find(s => s.id === aktiverSatzId.value) ?? null);

  /**
   * Die Ablage des aktiven Modellsatzes — Ansichten, Stile, Issues, Journal.
   *
   * OHNE Satz die Auftragsebene. Das ist kein Notbehelf: eine Korrektur, die
   * ohne gewählte Variante gemacht wird, ist für den ganzen Auftrag gemeint.
   */
  function satzRepo() {
    return aktiverSatzId.value ? repo.withScope(`stand:${aktiverSatzId.value}`) : repo;
  }

  // ── Laden / Initialisierung ────────────────────────────────────────────
  async function _init() {
    const [gespeicherterSatz, gespeicherterBearbeiter] = await Promise.all([
      repo.get(KEY_SATZ), repo.get(KEY_BEARBEITER),
    ]);
    if (typeof gespeicherterBearbeiter === 'string') bearbeiterEingabe.value = gespeicherterBearbeiter;
    if (typeof gespeicherterSatz === 'string') aktiverSatzId.value = gespeicherterSatz;
    await _loadDokumente();
  }
  const ready = _init();

  /**
   * Das Dokumentregister — eine Wahrheit, nicht zwei.
   *
   * Mit Server-Backend gilt `<Projekt>/CDE/manifest.yaml`. Vorher fuehrte der
   * Viewer daneben eine eigene Liste in `CDE/_repo/…dokumente.json`: dieselben
   * Dateien, derselbe Ordner, eigene Revisionszaehlung, eigener Status. Ein im
   * Cockpit auf "Published" gesetzter Plan trug im Export weiter "VORABZUG".
   *
   * Ohne Server-Backend (IndexedDB, Arbeit ohne Netz) bleibt die lokale Liste
   * das Register — dort gibt es kein Manifest, an dem man sich ausrichten
   * koennte. Sie liegt auf der AUFTRAGSEBENE, weil Dokumente dem Auftrag
   * gehoeren und nicht dem Modellsatz.
   */
  async function _loadDokumente() {
    const vomServer = await repo.dokumente();
    if (Array.isArray(vomServer)) { dokumente.value = vomServer; return; }
    const stored = await repo.get(KEY_DOKUMENTE);
    dokumente.value = Array.isArray(stored) ? stored : [];
  }
  async function _saveDokumente() {
    // Mit Server-Backend schreibt das Manifest, nicht der Viewer. Eine zweite
    // Datei danebenzulegen brachte genau die Doppelfuehrung zurueck.
    if (repo.remote) return;
    await repo.set(KEY_DOKUMENTE, JSON.parse(JSON.stringify(dokumente.value)));
  }

  // ── Auftrag und Modellsätze ────────────────────────────────────────────

  /**
   * Auftrag und Sätze aus der Register-Antwort des Servers übernehmen.
   *
   * EIN Aufruf liefert beides (`GET /projekte/{id}/cde`) — deshalb wird hier
   * hineingereicht statt selbst geholt: zwei Wege zur selben Liste sind genau
   * das, woran sie in Stufe 3 auseinandergelaufen ist.
   */
  async function uebernehmeRegister(register, projektId) {
    const st = register?.stammdaten ?? {};
    auftrag.value = projektId
      ? { id: projektId, nummer: st.nummer ?? String(projektId), name: st.name ?? `Projekt ${projektId}`,
          bauherr: st.bauherr ?? '', lph: st.lph ?? '' }
      : null;
    saetze.value = Array.isArray(register?.saetze) ? register.saetze : [];
    // ÜBERSETZEN, nicht durchreichen. Das Manifest schreibt `datei`, `groesse`
    // und `hochgeladen_am`; der Viewer rechnet mit `name`, `size` und `addedAt`
    // (ms-Epoche). Die Rohantwort einzusetzen liess die Registertabelle mit
    // leeren Namen und lauter Strichen dastehen — die Zeilen waren da, nur
    // sagte keine etwas. `dokumentAusManifest` ist die eine Stelle, die beide
    // Formen kennt; sie zu umgehen heisst, die Übersetzung ein zweites Mal zu
    // erfinden.
    if (Array.isArray(register?.dokumente)) {
      dokumente.value = register.dokumente.map(dokumentAusManifest);
    }
    // Ein gespeicherter Satz, den es nicht mehr gibt, darf nicht aktiv bleiben.
    if (aktiverSatzId.value && !saetze.value.some(s => s.id === aktiverSatzId.value)) {
      await setzeSatz(null);
    }
  }

  async function setzeSatz(id) {
    aktiverSatzId.value = id || null;
    if (id) await repo.set(KEY_SATZ, id);
    else    await repo.delete(KEY_SATZ);
  }

  async function ladeSaetze() {
    if (!repo.remote || !auftrag.value?.id) return saetze.value;
    try {
      saetze.value = await repo.saetzeLesen();
    } catch (fehler) {
      console.warn('cde: saetze laden', fehler?.message ?? fehler);
    }
    return saetze.value;
  }

  async function satzAnlegen({ name, zweck = 'variante', enthaelt = [] }) {
    const satz = await repo.satzAnlegen({ name, zweck, enthaelt });
    await ladeSaetze();
    await setzeSatz(satz.id);
    return satz;
  }

  async function satzAendern(id, patch) {
    const satz = await repo.satzAendern(id, patch);
    await ladeSaetze();
    return satz;
  }

  async function satzLoeschen(id) {
    await repo.satzLoeschen(id);
    if (aktiverSatzId.value === id) await setzeSatz(null);
    await ladeSaetze();
  }

  async function setBearbeiter(name) {
    bearbeiterEingabe.value = (name ?? '').trim();
    await repo.set(KEY_BEARBEITER, bearbeiterEingabe.value);
  }

  // ── Dokument-Register (ISO 19650 light) ─────────────────────────────────

  /**
   * Ein geladenes Modell im Register fuehren.
   *
   * Mit Server-Backend wird NICHT blind ein WIP-Eintrag angelegt: die Datei
   * ist beim Laden ohnehin schon hochgeladen (`repo.setBlob`), also steht sie
   * im Manifest. Das Register wird nur neu gelesen — Status und Revision
   * kommen vom Server. Vorher legte der Viewer hier einen zweiten Eintrag mit
   * `status: 'WIP'` an, und genau der speiste das Wasserzeichen im Export.
   */
  async function registerModel({ sha256, name, size = 0, projectGlobalId = null }) {
    if (!sha256) return null;

    if (repo.remote) {
      await _loadDokumente();
      return dokumente.value.find(d => d.sha256 === sha256) ?? null;
    }

    let doc = dokumente.value.find(d => d.sha256 === sha256);
    if (doc) {
      doc.name = name ?? doc.name;
      await _saveDokumente();
      return doc;
    }
    const siblings = projectGlobalId
      ? dokumente.value.filter(d => d.projectGlobalId === projectGlobalId)
      : [];
    const revision = siblings.length
      ? Math.max(...siblings.map(d => d.revision ?? 1)) + 1
      : 1;
    doc = {
      sha256, name, size, projectGlobalId,
      status: 'WIP',
      revision,
      addedAt: Date.now(),
      statusHistorie: [{ status: 'WIP', von: bearbeiter.value || '—', am: Date.now() }],
    };
    dokumente.value.push(doc);
    await _saveDokumente();
    return doc;
  }

  /**
   * Warum der letzte Statuswechsel abgelehnt wurde (Lücke ④) — für die
   * Anzeige neben dem Auswahlfeld. Leer, solange alles ging.
   */
  const statusGrund = ref('');

  /** ISO-19650-Statuswechsel mit Audit-Spur am Dokument. */
  async function setDokumentStatus(sha256, status) {
    statusGrund.value = '';
    if (!ISO_STATUS.includes(status)) return false;
    const doc = dokumente.value.find(d => d.sha256 === sha256);
    if (!doc || doc.status === status) return false;

    // Der Arbeitsfluss (Lücke ④): vorwärts über die Stufen, zurück mit Rang.
    // Kosmetik — der Türsteher ist der Server; aber ein Knopf, den der Server
    // ablehnen wird, gehört hier schon gesperrt und BEGRÜNDET.
    const pruefung = pruefeStatuswechsel({
      von: doc.status, nach: status,
      rolle: useAuthStore().rolle ?? null,
      // Stufe 4b: nur mit Server gibt es Prüfberichte — lokal gilt die Regel nicht.
      art: doc.art ?? null, hatPruefung: !repo.remote || !!doc.pruefung,
    });
    if (!pruefung.ok) {
      statusGrund.value = pruefung.grund;
      return false;
    }

    // Mit Server-Backend fuehrt das Manifest den Status — und das Cockpit
    // zeigt denselben. Vorher schrieb der Viewer nur in seine eigene Liste,
    // und die beiden Ansichten desselben Dokuments zeigten Verschiedenes.
    if (repo.remote) {
      try {
        await repo.setzeStatus(sha256, status);
        await _loadDokumente();
        return true;
      } catch (fehler) {
        console.warn('cde: status am server', fehler?.message ?? fehler);
        return false;
      }
    }

    doc.status = status;
    doc.statusHistorie = doc.statusHistorie ?? [];
    doc.statusHistorie.push({ status, von: bearbeiter.value || '—', am: Date.now() });
    await _saveDokumente();
    return true;
  }

  /**
   * Aus dem Register nehmen.
   *
   * Mit Server-Backend raeumt der Server auch die Datei beiseite (nach
   * `CDE/_geloescht/`, nicht geloescht). Vorher strich der Viewer den Eintrag
   * nur aus seiner eigenen Liste — Manifest und Datei blieben, und beim
   * naechsten Oeffnen war das Dokument wieder da.
   *
   * @returns {Promise<boolean>} false, wenn der Server abgelehnt hat
   */
  async function removeDokument(sha256) {
    if (repo.remote) {
      try {
        await repo.entferne(sha256);
        await _loadDokumente();
        return true;
      } catch (fehler) {
        console.warn('cde: entfernen am server', fehler?.message ?? fehler);
        return false;
      }
    }
    dokumente.value = dokumente.value.filter(d => d.sha256 !== sha256);
    await _saveDokumente();
    return true;
  }

  return {
    ready,
    auftrag, saetze, aktiverSatzId, aktiverSatz, bearbeiter, dokumente,
    satzRepo, uebernehmeRegister, setzeSatz, ladeSaetze,
    satzAnlegen, satzAendern, satzLoeschen, setBearbeiter,
    registerModel, setDokumentStatus, statusGrund, removeDokument,
    // Legacy-Lesepfade für die Migration (Stufe 11.5)
    KEY_PROJECTS_ALT, KEY_ACTIVE_ALT,
  };
});
