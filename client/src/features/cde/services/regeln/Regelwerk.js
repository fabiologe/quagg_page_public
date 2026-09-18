/**
 * DAS REGELWERK — die Grenzwerte, gegen die die CDE prüft, als KATALOG
 * (Teil XXIII, AR; Audit „Bearbeitungsstruktur", Befund S9).
 *
 * Bis hierher standen sie als Tabellen im Code mit einer Naht zum
 * Hereinreichen, die niemand nutzte — und fünf Werte lagen lose daneben
 * (Mindestüberdeckung ZWEIMAL, einmal im Kanalgraben, einmal in den
 * Befunden; der Fangradius in der Musterschicht; die Anschlussweite im
 * Kanalgraben; die 1:DN-Rechnung in den Befunden).
 *
 * Jetzt: je Grenzwert EIN Eintrag mit Wert, Einheit, der EIGENSCHAFT, die er
 * prüft (AE — nie ein Bauteiltyp), seiner Art und seiner Quelle. Büro und
 * Projekt überschreiben je Id (Vorrang Projekt > Büro > eingebaut, geprüft
 * vom Katalogschema); `regelwert(id)` gibt, was gilt, `regelquelle(id)`,
 * woher es kommt — ein Befund nennt beides.
 *
 * Tabellen (Grabenregeln, Auflockerung) bleiben bei ihren Funktionen in
 * `gelaende/Grabenregeln.js`; auch sie werden hier überschrieben
 * (`regeltabelle`), gleiche Form vorausgesetzt.
 *
 * Formeln bleiben Code — aber BENANNT (`FORMELN`), damit ein Eintrag sagen
 * kann, welche gilt, und eine Büroregel sie durch einen festen Wert ersetzen.
 *
 * Ein BLATT (keine Importe): Grabenregeln, Befunde, Kanalgraben und
 * Musterschicht fragen hier, der Katalog füllt es.
 */

/** Art eines Werts — wie belastbar er ist. */
export const REGELARTEN = Object.freeze({
    norm: 'Normwert',
    faustregel: 'Faustregel',
    erfahrung: 'Erfahrungswert',
    setzung: 'Setzung des Hauses',
});

/** Benannte Formeln — ein Eintrag mit `wert: null` rechnet mit seiner Formel. */
export const FORMELN = Object.freeze({
    /**
     * Mindestgefälle 1:DN in ‰ — die gängige Näherung für Selbstreinigung
     * (DN 300 ⇒ 3,3 ‰). Eine Faustformel: die Norm nennt der Code nicht.
     */
    einsDurchNennmass: (dnMm) => {
        const dn = Number(dnMm);
        return Number.isFinite(dn) && dn > 0 ? 1000 / dn : null;
    },
});

const _e = (id, wert, einheit, prueft, art, quelle, extra = {}) =>
    Object.freeze({ id, wert, einheit, prueft, art, quelle, ...extra });

/** Der eingebaute Satz — die Werte, die bis Teil XXIII im Code standen, unverändert. */
export const EINGEBAUTE_REGELN = Object.freeze([
    _e('gefaelleMindestPromille', null, '‰', 'achse.gefaelle', 'faustregel',
       'Mindestgefälle 1:DN (Selbstreinigung)', { formel: 'einsDurchNennmass', braucht: ['achse', 'mass:profilGroesse'] }),
    _e('gefaelleHoechstPromille', 100, '‰', 'achse.gefaelle', 'faustregel', 'darüber wird die Sohle ausgespült'),
    _e('laengeMindestM', 0.5, 'm', 'achse.laenge', 'erfahrung', 'kürzere Stücke sind meist Reste eines Exports'),
    _e('laengeHoechstM', 100, 'm', 'achse.laenge', 'erfahrung', 'darüber fehlt üblicherweise ein Schacht'),
    _e('netzToleranzM', 0.001, 'm', 'netzrolle.anschluss', 'setzung', 'wie weit ein Rohrende von einem Bauwerk entfernt sein darf'),
    _e('naeheSchwelleM', 0.5, 'm', 'lage.abstand', 'setzung', 'zwei fremde Hüllen näher als das sind „nah" (Beziehungsindex)'),
    _e('stationAbstandM', 0.5, 'm', 'achse.station', 'setzung', 'ein Punktobjekt so nah an einer Achse gilt als „an der Achse"'),
    _e('ueberdeckungMindestM', 0.8, 'm', 'achse.ueberdeckung', 'norm', 'DIN EN 1610, Regelfall ≥ 0,8 m (frostfrei, Verkehrslast)'),
    _e('kreuzungMindestabstandM', 0.2, 'm', 'lage.kreuzung', 'faustregel', 'lichter Abstand an einer Kreuzung (Sparten nach DVGW/Netzbetreiber)'),
    _e('mindestabstandParallelM', 0.4, 'm', 'lage.parallel', 'faustregel', 'lichter Abstand paralleler Leitungen (Sparten nach DVGW/Netzbetreiber)'),
    _e('dnReihe', Object.freeze([100, 125, 150, 200, 250, 300, 350, 400, 500, 600,
                                 700, 800, 900, 1000, 1200, 1400, 1600, 1800, 2000]),
       'mm', 'mass:profilGroesse', 'norm', 'übliche Nennweiten'),
    _e('fangKnotenM', 10, 'm', 'eingabe.fang', 'setzung', 'Fangradius für Knoten beim Zeichnen'),
    _e('kanalgrabenAnschlussM', 2, 'm', 'netzrolle.anschluss', 'setzung', 'wie nah ein Rohrende am Schacht liegen muss, um als Anschluss zu zählen'),
]);

/** Tabellen, deren eingebauter Satz bei seinen Funktionen steht — hier nur benannt. */
export const REGELTABELLEN = Object.freeze(['grabenregeln', 'auflockerung']);

const _eingebaut = new Map(EINGEBAUTE_REGELN.map(e => [e.id, e]));
let _aktiv = new Map();          // id → { wert, ebene }
let _stand = 0;

/** Überschreibungen setzen (aus dem Katalog, geprüft) — ERSETZT den bisherigen Satz. */
export function setzeRegelwerk(eintraege) {
    _aktiv = new Map((eintraege ?? []).filter(e => e?.id).map(e => [e.id, { wert: e.wert, ebene: e.herkunft ?? e.ebene ?? null }]));
    _stand += 1;
    return _stand;
}

export function regelwerkStand() {
    return _stand;
}

/** Der geltende Wert. */
export function regelwert(id) {
    return _aktiv.has(id) ? _aktiv.get(id).wert : _eingebaut.get(id)?.wert;
}

/** Eine Tabelle: die Überschreibung oder der eingebaute Satz, den der Aufrufer kennt. */
export function regeltabelle(id, eingebaut) {
    return _aktiv.has(id) ? _aktiv.get(id).wert : eingebaut;
}

/** Woher der geltende Wert kommt — für den Befund. */
export function regelquelle(id) {
    const ebene = _aktiv.get(id)?.ebene ?? null;
    const e = _eingebaut.get(id);
    if (ebene) return `${ebene === 'projekt' ? 'Projekt' : 'Büro'}-Regelwerk`;
    return e ? `${REGELARTEN[e.art] ?? 'Vorgabe'}: ${e.quelle}` : 'Vorgabe';
}

/** Das Mindestgefälle — der feste Wert, wenn einer gilt, sonst die Formel des Eintrags. */
export function mindestGefaelleAus(dnMm, wert = regelwert('gefaelleMindestPromille')) {
    if (wert != null) return wert;
    return FORMELN[_eingebaut.get('gefaelleMindestPromille').formel](dnMm);
}

/**
 * Das geltende Regelwerk als flaches Objekt `{ id: wert }` — die Form, die
 * `Befunde.js` und der Beziehungsindex seit jeher lesen.
 */
export function aufgeloestesRegelwerk() {
    return Object.freeze(Object.fromEntries(EINGEBAUTE_REGELN.map(e => [e.id, regelwert(e.id)])));
}

/** Der eingebaute Satz als flaches Objekt (ohne Überschreibungen). */
export function eingebautesRegelwerk() {
    return Object.freeze(Object.fromEntries(EINGEBAUTE_REGELN.map(e => [e.id, e.wert])));
}

/** Ein eingebauter Eintrag nach Id — für die Prüfung einer Überschreibung. */
export function eingebauteRegel(id) {
    return _eingebaut.get(id) ?? null;
}
