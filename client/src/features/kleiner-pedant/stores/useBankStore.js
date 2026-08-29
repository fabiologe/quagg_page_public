/**
 * useBankStore ('pedant-bank') — Import, Abgleich-Liste, Zuordnung.
 * Nach Zuordnen/Loesen werden Journal-, Rechnungs- und Geld-Sicht nachgezogen
 * (dort entstehen/verschwinden Buchungen und bezahlt-Status).
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import PedantApi from '../services/PedantApi';
import { useGeldStore } from './useGeldStore';
import { useJournalStore } from './useJournalStore';
import { useRechnungStore } from './useRechnungStore';

export const useBankStore = defineStore('pedant-bank', () => {
  const bewegungen = ref([]);
  const filter = ref('unabgeglichen');   // Default: die Arbeit zuerst
  const aktiveBewegungId = ref(null);
  const vorschlaege = ref([]);
  const laedt = ref(false);
  const fehler = ref('');
  const letzterImport = ref(null);       // {neu, uebersprungen}

  const aktiveBewegung = computed(() =>
    bewegungen.value.find((zeile) => zeile.id === aktiveBewegungId.value) || null);
  const gefiltert = computed(() =>
    filter.value
      ? bewegungen.value.filter((zeile) => zeile.status === filter.value)
      : bewegungen.value);

  function _melde(quelle, error) {
    const detail = error?.response?.data?.detail;
    fehler.value = (typeof detail === 'string' && detail) || `${quelle} fehlgeschlagen`;
    console.warn(`pedant bank: ${quelle}:`, error);
  }

  async function lade() {
    laedt.value = true;
    try {
      bewegungen.value = await PedantApi.bank();
    } catch (error) {
      _melde('Bank laden', error);
    } finally {
      laedt.value = false;
    }
  }

  async function importiere(file) {
    fehler.value = '';
    try {
      letzterImport.value = await PedantApi.bankImport(file);
      await lade();
      return letzterImport.value;
    } catch (error) {
      _melde('Import', error);
      throw new Error(fehler.value);
    }
  }

  async function oeffne(id) {
    aktiveBewegungId.value = id;
    vorschlaege.value = [];
    try {
      vorschlaege.value = await PedantApi.bankVorschlaege(id);
    } catch (error) {
      _melde('Vorschläge', error);
    }
  }

  function schliesse() {
    aktiveBewegungId.value = null;
    vorschlaege.value = [];
  }

  async function _nachher() {
    await lade();
    const journal = useJournalStore();
    const rechnungen = useRechnungStore();
    const geld = useGeldStore();
    await Promise.all([
      journal.ladeStatus(), journal.ladeKette(), journal.ladeBuchungen(),
      rechnungen.ladeRechnungen(), geld.ladeAlles(),
    ]);
  }

  async function _aktion(quelle, lauf) {
    fehler.value = '';
    try {
      const ergebnis = await lauf();
      await _nachher();
      return ergebnis;
    } catch (error) {
      _melde(quelle, error);
      throw new Error(fehler.value);
    }
  }

  const zuordnen = (id, eingabe) =>
    _aktion('Zuordnen', () => PedantApi.bankZuordnen(id, eingabe));
  const ignoriere = (id, grund) =>
    _aktion('Ignorieren', () => PedantApi.bankIgnorieren(id, grund));
  const loese = (id, grund) =>
    _aktion('Lösen', () => PedantApi.bankLoesen(id, grund));
  const autoAbgleich = () =>
    _aktion('Auto-Abgleich', () => PedantApi.bankAutoAbgleich());

  return {
    bewegungen, filter, aktiveBewegungId, aktiveBewegung, vorschlaege,
    gefiltert, laedt, fehler, letzterImport,
    lade, importiere, oeffne, schliesse,
    zuordnen, ignoriere, loese, autoAbgleich,
  };
});
