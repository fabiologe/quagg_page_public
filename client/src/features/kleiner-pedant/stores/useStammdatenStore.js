/**
 * useStammdatenStore ('pedant-stammdaten') — Firmendaten + Auftraggeber.
 * Eigener Lebenszyklus: wird vom Rechnungsformular UND der Verwaltung gebraucht.
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import PedantApi from '../services/PedantApi';

export const useStammdatenStore = defineStore('pedant-stammdaten', () => {
  const firma = ref(null);            // inkl. fehlend: []
  const auftraggeber = ref([]);       // nur aktive
  const laedt = ref(false);
  const fehler = ref('');

  const firmaVollstaendig = computed(() => firma.value?.fehlend?.length === 0);

  function _melde(quelle, error) {
    const detail = error?.response?.data?.detail;
    fehler.value = (typeof detail === 'string' && detail) || `${quelle} fehlgeschlagen`;
    console.warn(`pedant stammdaten: ${quelle}:`, error);
  }

  async function ladeAlles() {
    laedt.value = true;
    try {
      [firma.value, auftraggeber.value] = await Promise.all([
        PedantApi.firmendaten(), PedantApi.auftraggeber()]);
    } catch (error) {
      _melde('Stammdaten laden', error);
    } finally {
      laedt.value = false;
    }
  }

  async function speichereFirma(felder) {
    fehler.value = '';
    try {
      firma.value = await PedantApi.firmendatenSpeichern(felder);
      return firma.value;
    } catch (error) {
      _melde('Firmendaten speichern', error);
      throw new Error(fehler.value);
    }
  }

  async function legeAuftraggeberAn(felder) {
    fehler.value = '';
    try {
      const neu = await PedantApi.auftraggeberAnlegen(felder);
      auftraggeber.value = await PedantApi.auftraggeber();
      return neu;
    } catch (error) {
      _melde('Auftraggeber anlegen', error);
      throw new Error(fehler.value);
    }
  }

  async function speichereAuftraggeber(id, felder) {
    fehler.value = '';
    try {
      const geaendert = await PedantApi.auftraggeberSpeichern(id, felder);
      auftraggeber.value = await PedantApi.auftraggeber();
      return geaendert;
    } catch (error) {
      _melde('Auftraggeber speichern', error);
      throw new Error(fehler.value);
    }
  }

  function auftraggeberName(id) {
    return auftraggeber.value.find((eintrag) => eintrag.id === id)?.name || `#${id}`;
  }

  return {
    firma, auftraggeber, laedt, fehler, firmaVollstaendig,
    ladeAlles, speichereFirma, legeAuftraggeberAn, speichereAuftraggeber,
    auftraggeberName,
  };
});
