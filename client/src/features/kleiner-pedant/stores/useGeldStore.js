/**
 * useGeldStore ('pedant-geld') — die drei Geld-Sichten, die Monatsreihe fuer
 * die einfache Timeline und die schlanke Liste erwarteten Geldes.
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import PedantApi from '../services/PedantApi';

export const useGeldStore = defineStore('pedant-geld', () => {
  const sichten = ref(null);          // {bezahlt, offen, kommend}
  const reihe = ref([]);              // [{monat, bezahlt_cent, offen_cent, kommend_cent}]
  const erwartet = ref([]);
  const mitErledigten = ref(false);
  const laedt = ref(false);
  const fehler = ref('');

  function _melde(quelle, error) {
    const detail = error?.response?.data?.detail;
    fehler.value = (typeof detail === 'string' && detail) || `${quelle} fehlgeschlagen`;
    console.warn(`pedant geld: ${quelle}:`, error);
  }

  async function ladeAlles() {
    laedt.value = true;
    try {
      [sichten.value, reihe.value, erwartet.value] = await Promise.all([
        PedantApi.geldSichten(),
        PedantApi.geldMonatsreihe(),
        PedantApi.erwartet(mitErledigten.value),
      ]);
    } catch (error) {
      _melde('Geld-Sichten laden', error);
    } finally {
      laedt.value = false;
    }
  }

  async function zeigeErledigte(an) {
    mitErledigten.value = an;
    try {
      erwartet.value = await PedantApi.erwartet(an);
    } catch (error) {
      _melde('Liste laden', error);
    }
  }

  async function legeAn(felder) {
    fehler.value = '';
    try {
      const neu = await PedantApi.erwartetAnlegen(felder);
      await ladeAlles();
      return neu;
    } catch (error) {
      _melde('Anlegen', error);
      throw new Error(fehler.value);
    }
  }

  async function speichere(id, felder) {
    fehler.value = '';
    try {
      const eintrag = await PedantApi.erwartetSpeichern(id, felder);
      await ladeAlles();
      return eintrag;
    } catch (error) {
      _melde('Speichern', error);
      throw new Error(fehler.value);
    }
  }

  return {
    sichten, reihe, erwartet, mitErledigten, laedt, fehler,
    ladeAlles, zeigeErledigte, legeAn, speichere,
  };
});
