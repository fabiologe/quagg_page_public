/**
 * Leitweg-ID-Pruefung (BT-10) — Spiegel von backend core/xrechnung.py
 * ::leitweg_pruefen: Format + ISO-7064-MOD-97-10-Pruefziffer.
 * Gibt null (in Ordnung) oder einen Fehlertext zurueck.
 */
const MUSTER = /^(\d{2,12})(?:-([0-9A-Za-z]{1,30}))?-(\d{2})$/;

export function pruefeLeitweg(leitweg) {
  const treffer = MUSTER.exec(String(leitweg || '').trim());
  if (!treffer) {
    return 'Leitweg-ID passt nicht ins Muster Grobadressierung'
      + '[-Feinadressierung]-Prüfziffer (z. B. 04011000-12345-03)';
  }
  const [, grob, fein = '', pruefziffer] = treffer;
  let ziffern = '';
  for (const zeichen of (grob + fein).toUpperCase()) {
    ziffern += String(parseInt(zeichen, 36)); // A=10 … Z=35, Ziffern bleiben
  }
  // BigInt: die Ziffernfolge sprengt Number schnell
  if (BigInt(ziffern + pruefziffer) % 97n !== 1n) {
    return 'Leitweg-ID: Prüfziffer stimmt nicht (ISO 7064 MOD 97-10)';
  }
  return null;
}
