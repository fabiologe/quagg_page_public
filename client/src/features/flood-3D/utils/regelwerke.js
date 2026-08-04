// Regelwerke, gegen die dieses Werkzeug Nachweise führt (Spez. 1.6).
//
// Der Nachweis wird nicht durch die Simulation definiert, sondern durch das
// Regelwerk — die Simulation liefert nur die Eingangsgrößen. Deshalb hält
// der Fall fest, wogegen geprüft wird, und die Angabe wandert unverändert
// ins Ergebnis. Als Freitext getippt war sie weder vergleichbar noch
// auswertbar; Fassung und maßgeblicher Abschnitt bleiben projektbezogen und
// stehen deshalb in der Anmerkung des Falls, nicht hier.

export const REGELWERKE = [
  { id: 'DWA-A 112',
    titel: 'Hydraulische Dimensionierung und Leistungsnachweis von '
      + 'Sonderbauwerken',
    hinweis: 'für den Zielbestand das zentrale Dokument' },
  { id: 'DWA-A 110',
    titel: 'Hydraulische Dimensionierung und Leistungsnachweis von '
      + 'Abwasserleitungen und Kanälen' },
  { id: 'DWA-A 111',
    titel: 'Anlagen zur Abflussregelung und Regenwasserentlastung' },
  { id: 'DWA-A 166',
    titel: 'Bauwerke der zentralen Regenwasserbehandlung und Rückhaltung',
    hinweis: 'Fassung 2013-11' },
  { id: 'DWA-M 176',
    titel: 'Konstruktive Gestaltung von Sonderbauwerken',
    hinweis: 'Fassung 2013-11' },
  { id: 'DWA-A 157', titel: 'Bauwerke der Kanalisation' },
  { id: 'DWA-A 102',
    titel: 'Grundsätze zur Bewirtschaftung von Niederschlagswasser' },
  { id: 'DWA-M 509',
    titel: 'Fischaufstiegsanlagen',
    hinweis: 'nennt die numerische Strömungssimulation ausdrücklich als '
      + 'Beurteilungswerkzeug' },
]

export const REGELWERK_IDS = REGELWERKE.map((r) => r.id)

/** Angaben, die nicht aus dem Katalog stammen (Altbestand, Landesrecht). */
export function eigeneRegelwerke(gewaehlt) {
  return (gewaehlt ?? []).filter((x) => !REGELWERK_IDS.includes(x))
}
