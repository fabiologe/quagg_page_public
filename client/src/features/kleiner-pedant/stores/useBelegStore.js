/**
 * useBelegStore ('pedant-belege') — Zustand des Belegeingangs.
 * Komponenten reden NUR mit dem Store; der Store NUR mit PedantApi.
 * Nach einer Freigabe zieht er das Journal nach (Status/Kette/Buchungen).
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import PedantApi from '../services/PedantApi';
import { useJournalStore } from './useJournalStore';

export const useBelegStore = defineStore('pedant-belege', () => {
  const belege = ref([]);
  const filter = ref(null);          // null = alle | 'erfasst' | 'geprueft' | …
  const aktiverBelegId = ref(null);
  const laedt = ref(false);
  const laedtHoch = ref(false);
  const fehler = ref('');

  const aktiverBeleg = computed(() =>
    belege.value.find((beleg) => beleg.id === aktiverBelegId.value) || null);

  function _meldeFehler(quelle, error) {
    const detail = error?.response?.data?.detail;
    if (detail && typeof detail === 'object' && detail.grund === 'duplikat') {
      fehler.value = `Datei bereits erfasst als ${detail.belegnummer} (${detail.status})`;
    } else {
      fehler.value = (typeof detail === 'string' && detail) || `${quelle} fehlgeschlagen`;
    }
    console.warn(`pedant belege: ${quelle}:`, error);
  }

  async function ladeBelege() {
    laedt.value = true;
    try {
      belege.value = await PedantApi.belege(filter.value);
    } catch (error) {
      _meldeFehler('Belege laden', error);
    } finally {
      laedt.value = false;
    }
  }

  async function setzeFilter(status) {
    filter.value = status;
    await ladeBelege();
  }

  async function hochladen(file) {
    laedtHoch.value = true;
    fehler.value = '';
    try {
      const beleg = await PedantApi.belegHochladen(file);
      await ladeBelege();
      aktiverBelegId.value = beleg.id;
      return beleg;
    } catch (error) {
      _meldeFehler('Upload', error);
      throw new Error(fehler.value);
    } finally {
      laedtHoch.value = false;
    }
  }

  async function speichern(id, felder) {
    fehler.value = '';
    try {
      const beleg = await PedantApi.belegSpeichern(id, felder);
      _ersetze(beleg);
      return beleg;
    } catch (error) {
      _meldeFehler('Speichern', error);
      throw new Error(fehler.value);
    }
  }

  async function freigeben(id, eingabe) {
    fehler.value = '';
    try {
      const ergebnis = await PedantApi.belegFreigeben(id, eingabe);
      await ladeBelege();
      // Die Freigabe hat gebucht — Journal-Sicht nachziehen.
      const journal = useJournalStore();
      await Promise.all([journal.ladeStatus(), journal.ladeKette(), journal.ladeBuchungen()]);
      return ergebnis;
    } catch (error) {
      _meldeFehler('Freigeben', error);
      throw new Error(fehler.value);
    }
  }

  async function verwerfen(id, grund) {
    fehler.value = '';
    try {
      const beleg = await PedantApi.belegVerwerfen(id, grund);
      _ersetze(beleg);
      return beleg;
    } catch (error) {
      _meldeFehler('Verwerfen', error);
      throw new Error(fehler.value);
    }
  }

  function _ersetze(beleg) {
    const stelle = belege.value.findIndex((zeile) => zeile.id === beleg.id);
    if (stelle >= 0) belege.value.splice(stelle, 1, beleg);
    else belege.value.unshift(beleg);
  }

  function oeffne(id) {
    aktiverBelegId.value = id;
  }

  function schliesse() {
    aktiverBelegId.value = null;
  }

  return {
    belege, filter, aktiverBelegId, aktiverBeleg, laedt, laedtHoch, fehler,
    ladeBelege, setzeFilter, hochladen, speichern, freigeben, verwerfen,
    oeffne, schliesse,
  };
});
