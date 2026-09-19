/**
 * WO LIEGT DIE ACHSE EINES ROHRS? (Teil XXI, P2 / Fabios Entscheidung E4)
 *
 * DER BEFUND (2026-09-17, am Code gemessen). Zwei Stellen in der CDE lesen
 * dieselbe Achshöhe und meinen Verschiedenes:
 *   - `kanalgraben.leite` rechnete `sohle = y − DN/2 − Bettung`, las die Achse
 *     also als ROHRMITTE.
 *   - `Laengsschnitt` führt dieselbe Achse als SOHLE („isyifc schreibt die
 *     Achse auf Sohlniveau", Kopf des Moduls).
 * Bei isyifc-Daten grub der Graben damit DN/2 zu tief und meldete die
 * Überdeckung um DN/2 zu klein — bei DN 400 zwanzig Zentimeter, bei DN 1000
 * einen halben Meter. Kein Rechenfehler, eine fehlende Aussage.
 *
 * DIE AUSSAGE STEHT JETZT AN EINEM ORT. Woher eine Achse kommt, weiss der
 * Leser: eine Achs-Repräsentation (`IfcCurve` im Kontext `Axis`) ist in der
 * Kanalwelt auf Sohlniveau geschrieben; eine aus der EXTRUSION oder aus dem
 * Netz zurückgerechnete Achse liegt in der Rohrmitte, weil der Körper um sie
 * herum gezogen wurde. Genau das ist `achsbezugVon`.
 *
 * WARUM TROTZDEM EIN REGLER. „axisRep = Sohle" ist für isyifc belegt, nicht
 * für jedes Fremdsystem. Deshalb trägt das Kanalgraben-Formular ein Feld mit
 * der Vorgabe `quelle`: was hier abgeleitet wird, steht sichtbar da und lässt
 * sich umstellen — statt einer Annahme, die niemand sieht.
 *
 * Rein: keine Engine, kein three, kein Vue. Nur Höhen und ein Durchmesser.
 */

/** Die Bezüge, die es gibt — Daten, nicht Zeichenketten im Code verstreut. */
export const ACHSBEZUEGE = Object.freeze({
    sohle: Object.freeze({ id: 'sohle', titel: 'Sohle' }),
    mitte: Object.freeze({ id: 'mitte', titel: 'Rohrmitte' }),
});

/** Ohne Angabe gilt die Rohrmitte: ein Sweep legt sein Profil UM die Achse. */
export const ACHSBEZUG_VORGABE = 'mitte';

/**
 * Der Bezug, den die HERKUNFT einer Achse verspricht.
 * @param {string|null} herkunft  'axisRep' | 'extrusion' | 'mesh' | 'bauplan'
 * @returns {'sohle'|'mitte'}
 */
export function achsbezugVon(herkunft) {
    return String(herkunft ?? '') === 'axisRep' ? 'sohle' : ACHSBEZUG_VORGABE;
}

/** Ein gültiger Bezug, oder die Vorgabe. Nie `undefined` durchreichen. */
export function bezugOder(wert, vorgabe = ACHSBEZUG_VORGABE) {
    const k = String(wert ?? '');
    return ACHSBEZUEGE[k] ? k : vorgabe;
}

/**
 * Was das FORMULAR sagt, gegen das, was die QUELLE weiss.
 * @param {string|null} feld     'quelle' | 'sohle' | 'mitte' (Vorgabe: 'quelle')
 * @param {string|null} quelle   der Bezug der gelieferten Achse
 * @returns {'sohle'|'mitte'}
 */
export function bezugWaehlen(feld, quelle) {
    const f = String(feld ?? 'quelle');
    return f === 'quelle' || !ACHSBEZUEGE[f] ? bezugOder(quelle) : f;
}

/** Der Halbmesser eines Rohrs in Metern — DN kommt in Millimetern. */
export function halbmesser(dn) {
    const d = Number(dn);
    return Number.isFinite(d) && d > 0 ? d / 2000 : 0;
}

/**
 * Der Abstand von der ROHRMITTE zur Sohle in Metern. Ein Rezept kennt ihn
 * aus seinem Profil (`sohlabstand` — beim Kreis r, beim Rechteck die halbe
 * Tiefe; Teil XXIV, K4); ohne ihn gilt der Halbmesser aus DN.
 */
function _mitteZurSohle(rohr) {
    const s = Number(rohr?.sohlabstand);
    return rohr?.sohlabstand !== null && rohr?.sohlabstand !== undefined && Number.isFinite(s) && s >= 0
        ? s : halbmesser(rohr?.dn);
}

/** Der Abstand von der Achse zur Sohle: bei Bezug „Sohle" null, sonst der Weg Mitte → Sohle. */
function _abstand(rohr) {
    return bezugOder(rohr?.achsbezug) === 'sohle' ? 0 : _mitteZurSohle(rohr);
}

/**
 * Eine Höhe, oder NaN.
 *
 * `Number(null)` ist NULL, nicht NaN — eine fehlende Achshöhe wäre damit
 * still zu „0 m" geworden und der Graben hätte bei null angesetzt. Die Höhe 0
 * selbst ist gültig, deshalb reicht kein Wahrheitswert-Test.
 */
function _hoehe(y) {
    if (y === null || y === undefined || y === '') return NaN;
    const v = Number(y);
    return Number.isFinite(v) ? v : NaN;
}

/**
 * Die ROHRSOHLE zu einer Achshöhe.
 * @param {number} y                Achshöhe (Welt oder NN — dieselbe Einheit kommt zurück)
 * @param {{achsbezug?: string, dn?: number}} rohr
 */
export function rohrsohle(y, rohr = {}) {
    const v = _hoehe(y);
    return Number.isFinite(v) ? v - _abstand(rohr) : NaN;
}

/** Die ROHRMITTE zu einer Achshöhe — die Achse des Sweeps. */
export function rohrmitte(y, rohr = {}) {
    const v = _hoehe(y);
    return Number.isFinite(v) ? v + (bezugOder(rohr.achsbezug) === 'sohle' ? _mitteZurSohle(rohr) : 0) : NaN;
}

/** Der ROHRSCHEITEL zu einer Achshöhe — daran misst sich die Überdeckung. */
export function rohrscheitel(y, rohr = {}) {
    const v = _hoehe(y);
    return Number.isFinite(v) ? rohrsohle(v, rohr) + 2 * _mitteZurSohle(rohr) : NaN;
}

/**
 * Die ACHSHÖHE, die eine Sohlhöhe in einem Bezug bedeutet — die Umkehrung
 * von `rohrsohle` (Teil XXIV, K4). Wer eine Sohle schreibt, schreibt über sie.
 */
export function achshoeheAusSohle(sohle, rohr = {}) {
    const v = _hoehe(sohle);
    return Number.isFinite(v) ? v + _abstand(rohr) : NaN;
}

/**
 * Der Bezug einer ACHSE, wie Engine und Journal sie liefern (Teil XXIV, K4):
 * ausdrücklich (`achsbezug`, ein eigener Bauplan nennt ihn), sonst aus ihrer
 * Herkunft (`quelle`: Achs-Repräsentation = Sohle, Extrusion/Netz/Bauplan =
 * Mitte). Sagt die Achse gar nichts, gilt die `vorgabe` des LESERS — sie ist
 * dort verschieden gewachsen (der Längsschnitt las eine Höhe ohne Angabe als
 * Sohle, der Kanalgraben als Mitte), und still vereinheitlicht verschöbe sie
 * einen der beiden um DN/2.
 */
export function achsbezugDerAchse(a, vorgabe = null) {
    if (ACHSBEZUEGE[String(a?.achsbezug ?? '')]) return a.achsbezug;
    if (a?.quelle) return achsbezugVon(a.quelle);
    return vorgabe;
}

/**
 * Die SOHLE an einer Höhe dieser Achse — mit ihrem Bezug, ihrem DN, ihrem
 * Profil. Die eine Rechnung für jeden, der eine Haltungshöhe als Sohle liest.
 * Ohne Aussage der Achse und ohne `vorgabe` ist die Höhe die Sohle.
 */
export function sohleAnAchse(y, a, { vorgabe = 'sohle' } = {}) {
    return rohrsohle(y, { achsbezug: achsbezugDerAchse(a, vorgabe) ?? 'sohle', dn: a?.dn, sohlabstand: a?.sohlabstand });
}

/** Der SCHEITEL an einer Höhe dieser Achse — daran misst sich die Überdeckung. */
export function scheitelAnAchse(y, a, { vorgabe = 'mitte' } = {}) {
    return rohrscheitel(y, { achsbezug: achsbezugDerAchse(a, vorgabe) ?? 'mitte', dn: a?.dn, sohlabstand: a?.sohlabstand });
}

/** Alle drei Höhen auf einmal — für Leser, die ohnehin zwei davon brauchen. */
export function rohrhoehen(y, rohr = {}) {
    return { sohle: rohrsohle(y, rohr), mitte: rohrmitte(y, rohr), scheitel: rohrscheitel(y, rohr) };
}

/** Eine Polylinie auf ihre SOHLE legen — die Form, die der Längsschnitt führt. */
export function alsSohle(punkte, rohr = {}) {
    return (punkte ?? []).map(p => ({ ...p, y: rohrsohle(p?.y, rohr) }));
}

/** „Achse = Sohle (Achs-Repräsentation)" — was die Oberfläche anzeigt. */
export function bezugTitel(bezug, { quelle = null, ausQuelle = false } = {}) {
    const b = bezugOder(bezug);
    const woher = { axisRep: 'Achs-Repräsentation', extrusion: 'Extrusion', mesh: 'Netz', bauplan: 'Bauplan' }[String(quelle ?? '')] ?? null;
    return `Achse = ${ACHSBEZUEGE[b].titel}${ausQuelle && woher ? ` (${woher})` : ''}`;
}

/**
 * DIE SOHLE EINES KNOTENS (Teil XXIII, A9 — Befund B19).
 *
 * Ein Knoten sagt seit A9, was sein y ist (`hoehenbezug`): ein eigener
 * Schacht steht mit y AUF seiner Sohle, ein gelieferter mit y auf seiner
 * PLATZIERUNG — wo der Hersteller den Ursprung setzt, sagt die Datei nicht.
 * Belegt ist die Sohle durch die Unterkante der Hülle oder durch
 * `hoehenbezug: 'sohle'`. Sonst bleibt die Platzierung der Rückfall, und
 * `belegt: false` sagt es dem Leser, statt dass er es erraten muss.
 *
 * @param {{y: number, unterkante?: number, hoehenbezug?: string}} knoten
 * @returns {{y: number, belegt: boolean}}
 */
export function knotensohle(knoten) {
    if (Number.isFinite(knoten?.unterkante)) return { y: knoten.unterkante, belegt: true };
    const y = _hoehe(knoten?.y);
    return { y, belegt: knoten?.hoehenbezug === 'sohle' && Number.isFinite(y) };
}
