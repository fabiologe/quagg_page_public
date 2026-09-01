/**
 * Koordinatensysteme — welches System ist es WIRKLICH? (Stufe 13.2)
 *
 * DER ANLASS steckt in Fabios Dateien. Beide deklarieren `EPSG:25832`
 * (UTM Zone 32N), weil der ISYBAU-Schreiber das fest verdrahtet
 * (`isyifc/core/export/IfcWriter.js:395`). Aber:
 *
 *   A64 (Pfalz)        Ostwert 325.721   → gültiges UTM32. Etikett stimmt.
 *   ENQUIER (Saarland) Ostwert 2.577.078 → UTM32 endet bei 834.000.
 *                                          Das ist Gauß-Krüger Zone 2.
 *
 * Ein falsches Etikett fällt nirgends auf: die Zahlen sehen aus wie Zahlen.
 * Erst wenn jemand nach Lat/Lon umrechnet oder ein Luftbild darunterlegt,
 * liegt alles um hunderte Kilometer daneben — und dann sieht es nach einem
 * Fehler des Betrachters aus, nicht nach einem der Datei.
 *
 * Deshalb wird hier NICHT geglaubt, sondern GEPRÜFT: liegt der Ostwert im
 * Gültigkeitsbereich des deklarierten Systems? Wenn nicht, wird gesagt, welches
 * es wirklich ist — und mit dem gerechnet (Fabios Entscheidung).
 *
 * DIE DEFINITIONEN SIND EINE BEWUSSTE DOPPELUNG. Dieselben proj4-Zeilen stehen
 * in `flood-2D/utils/KostraHelper.js` und `isybau/utils/KostraService.js`. Die
 * Hausregel verbietet Querverknüpfungen zwischen Features; fachliche Doppelung
 * ist der akzeptierte Preis (siehe [[keine-feature-querverknuepfungen]]).
 * `proj4` selbst ist eine geteilte npm-Abhängigkeit und damit erlaubt.
 *
 * WAS HIER NICHT PASSIERT: Es wird nichts erfunden. Passt kein Bereich, ist die
 * Antwort „nicht erkennbar" — nicht der nächstbeste Treffer.
 */

/**
 * Die Systeme, die im deutschen Tiefbau vorkommen.
 *
 * `ostVon`/`ostBis` sind die Bereiche, in denen ein Rechtswert dieses Systems
 * liegen MUSS. Bei Gauß-Krüger trägt der Rechtswert die Zonenkennziffer als
 * führende Stelle (Zone 2 → 2.5xx.xxx), was die Erkennung eindeutig macht.
 * Bei UTM ist der Bereich durch die Zonenbreite gegeben (166 km bis 834 km),
 * und die ZONE unterscheidet sich nur über den Hochwert nicht — deshalb
 * kann UTM32 von UTM33 allein am Ostwert nicht getrennt werden. Das steht als
 * `mehrdeutig` dabei, statt es zu verschweigen.
 */
export const SYSTEME = Object.freeze([
    { epsg: 'EPSG:31466', name: 'Gauß-Krüger Zone 2 (DHDN)',  ostVon: 2_400_000, ostBis: 2_600_000,
      def: '+proj=tmerc +lat_0=0 +lon_0=6 +k=1 +x_0=2500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs +type=crs' },
    { epsg: 'EPSG:31467', name: 'Gauß-Krüger Zone 3 (DHDN)',  ostVon: 3_400_000, ostBis: 3_600_000,
      def: '+proj=tmerc +lat_0=0 +lon_0=9 +k=1 +x_0=3500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs +type=crs' },
    { epsg: 'EPSG:31468', name: 'Gauß-Krüger Zone 4 (DHDN)',  ostVon: 4_400_000, ostBis: 4_600_000,
      def: '+proj=tmerc +lat_0=0 +lon_0=12 +k=1 +x_0=4500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs +type=crs' },
    { epsg: 'EPSG:31469', name: 'Gauß-Krüger Zone 5 (DHDN)',  ostVon: 5_400_000, ostBis: 5_600_000,
      def: '+proj=tmerc +lat_0=0 +lon_0=15 +k=1 +x_0=5500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs +type=crs' },
    { epsg: 'EPSG:25832', name: 'UTM Zone 32N (ETRS89)', ostVon: 166_000, ostBis: 834_000, mehrdeutig: ['EPSG:25833'],
      def: '+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs' },
    { epsg: 'EPSG:25833', name: 'UTM Zone 33N (ETRS89)', ostVon: 166_000, ostBis: 834_000, mehrdeutig: ['EPSG:25832'],
      def: '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs' },
]);

/** Ein System über seinen EPSG-Code. `null`, wenn wir es nicht kennen. */
export function systemNach(epsg) {
    const k = String(epsg ?? '').toUpperCase().trim();
    return SYSTEME.find(s => s.epsg === k) ?? null;
}

/**
 * Welches System passt zu diesem Rechtswert?
 *
 * @returns {{epsg, name, mehrdeutig?}|null} `null` heisst „nicht erkennbar" —
 *   ausdrücklich nicht „das nächstbeste".
 */
export function erkenneSystem(ostwert) {
    const o = Number(ostwert);
    if (!Number.isFinite(o)) return null;
    const treffer = SYSTEME.filter(s => o >= s.ostVon && o <= s.ostBis);
    if (!treffer.length) return null;
    // Bei UTM32/33 passen beide; der erste gewinnt, aber die Mehrdeutigkeit
    // wird durchgereicht, damit die Oberfläche sie zeigen kann.
    return { epsg: treffer[0].epsg, name: treffer[0].name,
             mehrdeutig: treffer.length > 1 ? treffer.slice(1).map(s => s.epsg) : null };
}

/**
 * Stimmt das Etikett mit dem Inhalt überein?
 *
 * @param {string} deklariert  EPSG aus `IfcProjectedCRS.Name`
 * @param {number} ostwert     ein Rechtswert aus dem Modell
 * @returns {{stimmt: boolean, deklariert, erkannt, grund}}
 */
export function pruefeEtikett(deklariert, ostwert) {
    const erkannt = erkenneSystem(ostwert);
    const dekl = systemNach(deklariert);

    if (!erkannt) {
        return { stimmt: false, deklariert, erkannt: null,
                 grund: `Rechtswert ${Math.round(ostwert)} passt in keinen bekannten Bereich — nicht prüfbar.` };
    }
    if (!dekl) {
        return { stimmt: false, deklariert, erkannt: erkannt.epsg,
                 grund: `Kein oder unbekanntes System deklariert; die Werte passen zu ${erkannt.name}.` };
    }
    // Mehrdeutig (UTM32 vs. 33): das Etikett darf gelten, wir können es nicht
    // widerlegen. Es zu „korrigieren" wäre hier eine Behauptung.
    const gleichwertig = erkannt.epsg === dekl.epsg
        || (erkannt.mehrdeutig ?? []).includes(dekl.epsg);
    if (gleichwertig) return { stimmt: true, deklariert, erkannt: dekl.epsg, grund: null };

    return { stimmt: false, deklariert, erkannt: erkannt.epsg,
             grund: `Deklariert ${dekl.name}, aber der Rechtswert ${Math.round(ostwert)} liegt in ${erkannt.name}.` };
}
