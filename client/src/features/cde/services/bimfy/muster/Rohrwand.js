/**
 * MUSTER · Rohrwand — aus Nennweite und Werkstoff Innen- und Aussendurchmesser.
 *
 * ISYBAU kennt keine Wanddicke (kein Stammdatenfeld, AH15 Tab. A-7-15/16/18).
 * Wie dick die Wand ist und was die Nennweite überhaupt meint, sagt die
 * Produktnorm des Werkstoffs:
 *
 *   Kunststoff (PVC-U, PP, PE)   DN/OD = AUSSENdurchmesser, Wand aus Tabelle bzw. SDR
 *   Beton, Steinzeug, Guss        DN ≈ INNENdurchmesser, Wand vom Hersteller
 *
 * Wo die Norm schweigt, steht eine ANNAHME — mit dem Satz, warum. Jedes Mass
 * trägt seine Herleitung: `isybau` (aus der Datei), `norm` (mit Beleg),
 * `annahme` (Faustwert, durch eine Herstellerangabe zu ersetzen).
 *
 * Rein: Zahlen hinein, Zahlen heraus. Meter.
 */
import { B, PVC_SDR, PVC_EMIN_UNTEN, STEINZEUG_DI_MIN } from './Normwerte.js';
import { DN_OD_WERKSTOFFE } from '../isybau/Schluessel.js';

const BETON = new Set(['B', 'SB', 'SFB', 'SPB', 'OB', 'PCC', 'BS']);
const KUNSTSTOFF_SDR_VORGABE = 33;

import { herleitung } from './Herleitung.js';
// Die Herleitung wohnt in `Herleitung.js`; hier weitergereicht für bestehende Aufrufer.
export { herleitung };

/** Der nächste Tabellenschlüssel (mm) zu einem Wert, wenn er höchstens 2 % daneben liegt. */
function _zeile(tabelle, dnMm) {
    let beste = null;
    for (const k of Object.keys(tabelle).map(Number)) {
        if (Math.abs(k - dnMm) <= Math.max(2, 0.02 * k) && (beste === null || Math.abs(k - dnMm) < Math.abs(beste - dnMm))) beste = k;
    }
    return beste;
}

const _r4 = (v) => Math.round(v * 10000) / 10000;
/** Auf 0,1 mm aufrunden (Meter hinein, Meter heraus) — die Rundung der Rohrreihen. */
const _aufZehntelMm = (m) => Math.ceil(m * 10000 - 1e-6) / 10000;

/**
 * @param {object} e
 * @param {number} e.dn           Nennweite in m (ISYBAU: Profilhöhe bzw. -breite)
 * @param {string} [e.material]   G102
 * @param {string} [e.sn]         Steifigkeitsklasse, etwa 'SN8' (Kunststoff)
 * @param {number} [e.sdr]        SDR (PP, PE)
 * @param {number} [e.wanddicke]  bekannt (Herstellerangabe) — dann gilt sie
 * @returns {{dInnen, dAussen, wanddicke, dnBezug: 'innen'|'aussen', herleitung: object, hinweise: string[]}}
 */
export function rohrwand({ dn, material = null, sn = null, sdr = null, wanddicke = null } = {}) {
    const hinweise = [];
    const mat = String(material ?? '').toUpperCase();
    const dnMm = Math.round(dn * 1000);
    const aussenBezug = DN_OD_WERKSTOFFE.has(mat);
    let t, hWand;

    if (Number.isFinite(wanddicke) && wanddicke > 0) {
        t = wanddicke;
        hWand = herleitung('isybau', 'Wanddicke angegeben');
    } else if (mat === 'PVC' || mat === 'PVCU') {
        const klasse = PVC_SDR[sn] ? sn : 'SN8';
        const s = PVC_SDR[klasse];
        t = Math.max(PVC_EMIN_UNTEN, _aufZehntelMm(dn / s));
        hWand = herleitung('norm', `e = dn / SDR ${s} (${klasse}${sn ? '' : ', angenommen'}), aufgerundet auf 0,1 mm`, B.pvc);
        if (!sn) hinweise.push('Steifigkeitsklasse fehlt in ISYBAU — SN 8 angenommen');
    } else if (mat === 'PP') {
        const s = sdr ?? KUNSTSTOFF_SDR_VORGABE;
        t = _aufZehntelMm(dn / s);
        hWand = herleitung(sdr ? 'norm' : 'annahme', `e = dn / SDR ${s}${sdr ? '' : ' (SDR angenommen, SN → SDR nicht belegt)'}`, B.pp);
        if (!sdr) hinweise.push(`SDR fehlt in ISYBAU — SDR ${s} angenommen`);
    } else if (mat === 'PE' || mat === 'PEHD') {
        const s = sdr ?? KUNSTSTOFF_SDR_VORGABE;
        t = dn / s;
        hWand = herleitung('annahme', `e = dn / SDR ${s} (Wandtabelle der DIN EN 12666-1 nicht gelesen)`, B.pe);
    } else if (BETON.has(mat)) {
        // Faustwert, keine Norm: DN 300 → 5 cm, DN 1000 → 12 cm. Der Hersteller ersetzt ihn.
        t = 0.025 + dn / 11;
        hWand = herleitung('annahme', 'Betonrohr: Wanddicke nach Werksunterlagen — Faustwert 25 mm + DN/11', B.betonWand);
    } else if (mat === 'STZ') {
        t = dn / 11;
        hWand = herleitung('annahme', 'Steinzeug: Wanddicke vom Hersteller — Faustwert DN/11', B.steinzeugWand);
    } else {
        t = Math.max(0.005, dn / 12);
        hWand = herleitung('annahme', `Werkstoff „${mat || 'unbekannt'}": keine Norm im Bestand — Faustwert DN/12`);
    }

    let dInnen, dAussen, hDurchmesser;
    if (aussenBezug) {
        dAussen = dn;
        dInnen = dn - 2 * t;
        hDurchmesser = herleitung('norm', 'Kunststoff: DN/OD ist der Aussendurchmesser', mat === 'PP' ? B.pp : B.pvc);
    } else {
        dInnen = dn;
        dAussen = dn + 2 * t;
        hDurchmesser = herleitung('norm', 'DN ist der Innendurchmesser', mat === 'STZ' ? B.steinzeugDi : B.betonDn);
        if (mat === 'STZ') {
            const zeile = _zeile(STEINZEUG_DI_MIN, dnMm);
            if (zeile !== null && STEINZEUG_DI_MIN[zeile] / 1000 < dInnen) {
                hinweise.push(`Steinzeug DN ${zeile}: Mindest-Innendurchmesser ${STEINZEUG_DI_MIN[zeile]} mm`);
            }
        }
    }
    return {
        dInnen: _r4(dInnen), dAussen: _r4(dAussen), wanddicke: _r4(t),
        dnBezug: aussenBezug ? 'aussen' : 'innen',
        herleitung: { wanddicke: hWand, durchmesser: hDurchmesser },
        hinweise,
    };
}
