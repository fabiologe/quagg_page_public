/**
 * useGeldFormat — Komponenten-Zugang zu Geld.js: ein Eingabefeld haelt Text,
 * das Modell haelt Cent. Das Composable verdrahtet beide Richtungen.
 */
import { ref, watch } from 'vue';
import { centAlsEuro, euroZuCent } from '../services/Geld';

export function useGeldFormat(anfangsCent = null) {
  const text = ref(anfangsCent === null ? '' : centAlsEuro(anfangsCent));
  const cent = ref(anfangsCent);

  watch(text, (neu) => {
    cent.value = euroZuCent(neu);
  });

  /** Beim Verlassen des Felds die Eingabe in saubere Form bringen. */
  function huebschMachen() {
    if (Number.isInteger(cent.value)) text.value = centAlsEuro(cent.value);
  }

  function zuruecksetzen() {
    text.value = '';
    cent.value = null;
  }

  return { text, cent, huebschMachen, zuruecksetzen, centAlsEuro };
}
