/**
 * useJournalStore ('pedant-journal') — Zustand von Journal, Kette und Konten.
 * Komponenten reden NUR mit dem Store; der Store redet NUR mit PedantApi.
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import PedantApi from '../services/PedantApi';

export const useJournalStore = defineStore('pedant-journal', () => {
  const status = ref(null);          // {umgebung, db_erreichbar, anzahl_*, lfd_nr_letzte}
  const kette = ref(null);           // {ok, zeilen_geprueft, bruch_bei_nr, grund}
  const buchungen = ref([]);
  const konten = ref([]);
  const laedt = ref(false);
  const fehler = ref('');

  const dbSteht = computed(() => status.value?.db_erreichbar === true);

  function _meldeFehler(quelle, error) {
    const detail = error?.response?.data?.detail;
    fehler.value = detail || `${quelle} fehlgeschlagen`;
    console.warn(`pedant: ${quelle}:`, error);
  }

  async function ladeStatus() {
    try { status.value = await PedantApi.status(); }
    catch (error) { _meldeFehler('Status laden', error); }
  }

  async function ladeKette() {
    try { kette.value = await PedantApi.kette(); }
    catch (error) { _meldeFehler('Kette prüfen', error); }
  }

  async function ladeBuchungen(limit = 100) {
    try { buchungen.value = await PedantApi.buchungen(limit); }
    catch (error) { _meldeFehler('Buchungen laden', error); }
  }

  async function ladeKonten() {
    try { konten.value = await PedantApi.konten(); }
    catch (error) { _meldeFehler('Konten laden', error); }
  }

  async function ladeAlles() {
    laedt.value = true;
    fehler.value = '';
    await Promise.all([ladeStatus(), ladeKette(), ladeBuchungen(), ladeKonten()]);
    laedt.value = false;
  }

  /** Nach jedem Schreiben Journal + Kopf + Kette nachziehen. */
  async function _nachSchreiben() {
    await Promise.all([ladeStatus(), ladeKette(), ladeBuchungen()]);
  }

  /** Wirft bei Ablehnung (422) den Server-Grund als Error weiter —
   *  das Formular zeigt ihn beim Feld an. */
  async function bucheNeu(eingabe) {
    fehler.value = '';
    try {
      const ergebnis = await PedantApi.buchungAnlegen(eingabe);
      await _nachSchreiben();
      return ergebnis;
    } catch (error) {
      _meldeFehler('Buchung', error);
      throw new Error(fehler.value);
    }
  }

  async function storniere(lfdNr, grund) {
    fehler.value = '';
    try {
      const ergebnis = await PedantApi.storno(lfdNr, grund);
      await _nachSchreiben();
      return ergebnis;
    } catch (error) {
      _meldeFehler('Storno', error);
      throw new Error(fehler.value);
    }
  }

  return {
    status, kette, buchungen, konten, laedt, fehler, dbSteht,
    ladeAlles, ladeStatus, ladeKette, ladeBuchungen, ladeKonten,
    bucheNeu, storniere,
  };
});
