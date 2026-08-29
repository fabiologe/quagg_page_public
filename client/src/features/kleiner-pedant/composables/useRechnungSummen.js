/**
 * Rechnungssummen — EXAKT die Backend-/DB-Rundung:
 * betrag = floor((menge_tausendstel * einzelpreis_cent + 500) / 1000) je
 * Position (kaufmaennisch), steuer = floor((netto * satz + 50) / 100).
 * Spiegel von core/xrechnung.py::summen und der GENERATED-Spalte in 005.
 */
import { computed, toValue } from 'vue';

export function positionsBetragCent(mengeTausendstel, einzelpreisCent) {
  if (!Number.isInteger(mengeTausendstel) || !Number.isInteger(einzelpreisCent)) {
    return null;
  }
  return Math.floor((mengeTausendstel * einzelpreisCent + 500) / 1000);
}

export function rechnungSummen(positionen, steuersatz = 19) {
  let netto = 0;
  for (const position of positionen) {
    const betrag = positionsBetragCent(
      position.menge_tausendstel, position.einzelpreis_cent);
    if (betrag === null) return { netto: null, steuer: null, brutto: null };
    netto += betrag;
  }
  const steuer = Math.floor((netto * steuersatz + 50) / 100);
  return { netto, steuer, brutto: netto + steuer };
}

/** "12,5" | "12.5" | "3" -> Tausendstel-Ganzzahl (max 3 Nachkommastellen). */
export function mengeZuTausendstel(text) {
  const roh = String(text ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d{1,3})?$/.test(roh)) return null;
  const [ganz, rest = ''] = roh.split('.');
  const wert = Number(ganz) * 1000 + Number(rest.padEnd(3, '0') || 0);
  return wert > 0 && Number.isSafeInteger(wert) ? wert : null;
}

export function tausendstelAlsText(tausendstel) {
  if (!Number.isInteger(tausendstel)) return '';
  const rest = tausendstel % 1000;
  const ganz = Math.floor(tausendstel / 1000);
  if (rest === 0) return String(ganz);
  return `${ganz},${String(rest).padStart(3, '0').replace(/0+$/, '')}`;
}

/** positionen: ref/computed auf eine Liste mit menge_tausendstel/einzelpreis_cent. */
export function useRechnungSummen(positionen, steuersatz) {
  return computed(() => rechnungSummen(toValue(positionen), toValue(steuersatz) ?? 19));
}
