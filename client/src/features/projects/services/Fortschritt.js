/**
 * Fortschritt.js — dieselbe Arithmetik wie backend core/fortschritt.py, in
 * ganzen Cent. Der Client rechnet nur für die ANZEIGE nach (Balken-Segmente);
 * die Wahrheit kommt als `fortschritt` vom Server mit.
 */

const AKTIV = new Set(['offen', 'laufend', 'fertig', 'abgenommen']);

export function zaehlt(abschnitt) {
  return Boolean(abschnitt.beauftragt) && AKTIV.has(abschnitt.status || 'offen');
}

export function leistung(abschnitte) {
  let gesamt = 0;
  let beauftragt = 0;
  let leistungCent = 0;
  for (const a of abschnitte) {
    const honorar = Number(a.honorar_cent) || 0;
    gesamt += honorar;
    if (!zaehlt(a)) continue;
    beauftragt += honorar;
    leistungCent += Math.floor((honorar * (Number(a.fortschritt_prozent) || 0)) / 100);
  }
  const prozent = beauftragt ? Math.round((leistungCent * 1000) / beauftragt) / 10 : 0;
  return { honorar_gesamt_cent: gesamt, honorar_beauftragt_cent: beauftragt, leistung_cent: leistungCent, prozent };
}

/**
 * Segmente für den Balken: Breite ∝ Honorar (nur Abschnitte mit Honorar > 0),
 * Füllung = Fortschritt; nicht zählende Abschnitte werden schraffiert.
 */
export function segmente(abschnitte) {
  const mitHonorar = abschnitte.filter((a) => (Number(a.honorar_cent) || 0) > 0);
  const gesamt = mitHonorar.reduce((s, a) => s + Number(a.honorar_cent), 0);
  return mitHonorar.map((a) => ({
    id: a.id,
    titel: a.lph ? `LPH ${a.lph}` : a.bezeichnung,
    bezeichnung: a.bezeichnung,
    anteil: gesamt ? Number(a.honorar_cent) / gesamt : 0,
    fortschritt: Number(a.fortschritt_prozent) || 0,
    zaehlt: zaehlt(a),
    art: a.art || 'grund',
  }));
}

/** Verteilt Prozente auf Cent, Summe exakt (Rest auf den größten Anteil) — Spiegel des Backends. */
export function verteile(gesamtCent, prozente) {
  const summe = prozente.reduce((s, p) => s + p, 0);
  if (!summe) return prozente.map(() => 0);
  const betraege = prozente.map((p) => Math.floor((gesamtCent * p) / summe));
  const rest = gesamtCent - betraege.reduce((s, b) => s + b, 0);
  if (rest) {
    const i = prozente.indexOf(Math.max(...prozente));
    betraege[i] += rest;
  }
  return betraege;
}
