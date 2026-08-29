/**
 * useRechnungStore ('pedant-rechnungen') — Rechnungs-Lebenslauf im Client.
 * Nach dem Stellen zieht er das Journal nach (die Forderungs-Buchung entsteht
 * serverseitig). 422-Antworten tragen {grund, meldungen} — beides landet hier.
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import PedantApi from '../services/PedantApi';
import { useJournalStore } from './useJournalStore';

export const useRechnungStore = defineStore('pedant-rechnungen', () => {
  const rechnungen = ref([]);
  const filter = ref(null);           // null|entwurf|gestellt|bezahlt|ueberfaellig
  const aktiveRechnungId = ref(null);
  const laedt = ref(false);
  const fehler = ref('');
  const meldungen = ref([]);          // KoSIT-/Pflichtfeld-Meldungen der letzten Aktion

  const aktiveRechnung = computed(() =>
    rechnungen.value.find((zeile) => zeile.id === aktiveRechnungId.value) || null);

  const gefiltert = computed(() => {
    if (filter.value === 'ueberfaellig') {
      const heute = new Date().toISOString().slice(0, 10);
      return rechnungen.value.filter((zeile) =>
        zeile.status === 'gestellt' && zeile.faellig_am < heute);
    }
    if (!filter.value) return rechnungen.value;
    return rechnungen.value.filter((zeile) => zeile.status === filter.value);
  });

  function _melde(quelle, error) {
    const detail = error?.response?.data?.detail;
    if (detail && typeof detail === 'object') {
      fehler.value = detail.grund || `${quelle} fehlgeschlagen`;
      meldungen.value = detail.meldungen || [];
    } else {
      fehler.value = (typeof detail === 'string' && detail) || `${quelle} fehlgeschlagen`;
      meldungen.value = [];
    }
    console.warn(`pedant rechnungen: ${quelle}:`, error);
  }

  async function ladeRechnungen() {
    laedt.value = true;
    try {
      rechnungen.value = await PedantApi.rechnungen();
    } catch (error) {
      _melde('Rechnungen laden', error);
    } finally {
      laedt.value = false;
    }
  }

  function _ersetze(rechnung) {
    const stelle = rechnungen.value.findIndex((zeile) => zeile.id === rechnung.id);
    if (stelle >= 0) rechnungen.value.splice(stelle, 1, rechnung);
    else rechnungen.value.unshift(rechnung);
  }

  async function _aktion(quelle, lauf) {
    fehler.value = '';
    meldungen.value = [];
    try {
      return await lauf();
    } catch (error) {
      _melde(quelle, error);
      throw new Error(fehler.value);
    }
  }

  async function legeAn(felder) {
    const neu = await _aktion('Anlegen', () => PedantApi.rechnungAnlegen(felder));
    _ersetze(neu);
    aktiveRechnungId.value = neu.id;
    return neu;
  }

  async function speichereKopf(id, felder) {
    const rechnung = await _aktion('Speichern', () => PedantApi.rechnungKopf(id, felder));
    _ersetze(rechnung);
    return rechnung;
  }

  async function speicherePositionen(id, positionen) {
    const rechnung = await _aktion('Positionen',
      () => PedantApi.rechnungPositionen(id, positionen));
    _ersetze(rechnung);
    return rechnung;
  }

  async function vorpruefung(id, mitValidator = false) {
    return _aktion('Vorprüfung', () => PedantApi.rechnungVorpruefung(id, mitValidator));
  }

  async function stellen(id) {
    const ergebnis = await _aktion('Stellen', () => PedantApi.rechnungStellen(id));
    await ladeRechnungen();
    const journal = useJournalStore();
    await Promise.all([journal.ladeStatus(), journal.ladeKette(), journal.ladeBuchungen()]);
    return ergebnis;
  }

  async function verwerfen(id, grund) {
    const rechnung = await _aktion('Verwerfen', () => PedantApi.rechnungVerwerfen(id, grund));
    _ersetze(rechnung);
    return rechnung;
  }

  async function versand(id, weg) {
    const rechnung = await _aktion('Versand', () => PedantApi.rechnungVersand(id, weg));
    _ersetze(rechnung);
    return rechnung;
  }

  async function bezahlt(id, istBezahlt) {
    const rechnung = await _aktion('Bezahlt', () => PedantApi.rechnungBezahlt(id, istBezahlt));
    _ersetze(rechnung);
    return rechnung;
  }

  function oeffne(id) { aktiveRechnungId.value = id; }
  function schliesse() { aktiveRechnungId.value = null; }

  return {
    rechnungen, filter, aktiveRechnungId, aktiveRechnung, gefiltert,
    laedt, fehler, meldungen,
    ladeRechnungen, legeAn, speichereKopf, speicherePositionen,
    vorpruefung, stellen, verwerfen, versand, bezahlt, oeffne, schliesse,
  };
});
