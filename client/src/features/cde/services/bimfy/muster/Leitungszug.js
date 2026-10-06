/**
 * MUSTER · Leitungszug — eine Leitung mit Knicken wird Rohrstücke und Bögen
 * (Fabio, 2026-10-06: „muss dort nicht ein Krümmer rein?").
 *
 * Je Knick im Grundriss:
 *
 *   klein (bis zur Abwinkelung der Muffe)   kein Formstück — die Muffe nimmt ihn auf
 *   sonst                                   ein Bogen aus Regelwinkeln, z. B. 60° = 30° + 30°;
 *                                           was übrig bleibt, nimmt die Muffe, sonst ein Befund
 *   über 30°                                Hinweis: Reinigungsöffnung prüfen (DIN 1986-100)
 *
 * Gebaut wird der Bogen mit dem GEMESSENEN Winkel — die Leitung bleibt, wo sie
 * vermessen ist; die Regelwinkel sagen, welche Formstücke es sind. Der Bogen
 * liegt zwischen zwei Tangentenpunkten (R · tan(θ/2) vor und hinter dem Knick),
 * die Rohrstücke enden dort. Die Höhen folgen der Stationierung der Leitung.
 *
 * Rein: Zahlen hinein, Zahlen heraus. Meter, Grad.
 */
import { B } from './Normwerte.js';
import { herleitung as H } from './Herleitung.js';

const _r3 = (v) => Math.round(v * 1000) / 1000;
const GRAD = Math.PI / 180;

/** Die Regelwinkel je Werkstoffgruppe — belegt, wo die Norm im Bestand ist, sonst eine Annahme. */
export const REGELBOEGEN = Object.freeze({
    pvc: Object.freeze({ winkel: Object.freeze([15, 30, 45, 67.5, 87.5]), herleitung: H('norm', 'Regelbögen PVC-U', B.pvcBogen) }),
    pp: Object.freeze({ winkel: Object.freeze([15, 30, 45, 87.5]), herleitung: H('norm', 'Regelbögen PP/PE', B.ppBogen) }),
    sonst: Object.freeze({ winkel: Object.freeze([15, 30, 45, 90]),
                           herleitung: H('annahme', 'Bögen 15°, 30°, 45°, 90° (Produktnorm des Werkstoffs nicht im Bestand)') }),
});
const _gruppe = (material) => {
    const m = String(material ?? '').toUpperCase();
    if (m === 'PVC' || m === 'PVCU') return 'pvc';
    if (m === 'PP' || m === 'PE' || m === 'PEHD') return 'pp';
    return 'sonst';
};

/** Die Werte des Musters — eine Stelle, je Wert ein Satz. */
export const LEITUNGSZUG_VORGABEN = Object.freeze({
    abwinkelung: Object.freeze({ bisDn315: 2, darueber: 1, text: 'Abwinkelung in der Muffe 2° bis dn 315 (DIN EN 1401-1), darüber 1° (Annahme)' }),
    radius: Object.freeze({ faktor: 1, text: 'Bogenradius = Aussendurchmesser (Annahme, kurze Bögen)' }),
    reinigung: Object.freeze({ abWinkel: 30, text: 'Richtungsänderung > 30°: Reinigungsöffnung prüfen (DIN 1986-100)' }),
});

/** Die zulässige Abwinkelung in der Muffe (Grad) zum Aussendurchmesser (m). */
export const muffenAbwinkelung = (da) => (da > 0 && da <= 0.315 + 1e-9 ? LEITUNGSZUG_VORGABEN.abwinkelung.bisDn315 : LEITUNGSZUG_VORGABEN.abwinkelung.darueber);

/**
 * Die Regelbögen zu einem Winkel: höchstens zwei, die dem Winkel am nächsten kommen.
 * @returns {{boegen: number[], rest: number}}  rest = gemessen − Summe (Grad)
 */
export function regelboegen(winkel, liste) {
    let best = { boegen: [], rest: winkel };
    const pruefe = (boegen) => {
        const rest = winkel - boegen.reduce((a, b) => a + b, 0);
        if (Math.abs(rest) < Math.abs(best.rest) - 1e-9 || (Math.abs(Math.abs(rest) - Math.abs(best.rest)) < 1e-9 && boegen.length < best.boegen.length)) best = { boegen, rest };
    };
    for (const a of liste) pruefe([a]);
    for (const a of liste) for (const b of liste) if (b <= a) pruefe([a, b]);
    return { boegen: best.boegen, rest: _r3(best.rest) };
}

/** Der Knickwinkel im Grundriss (Grad) zwischen zwei Richtungen. */
function _knick(a, b, c) {
    const u = [b.ost - a.ost, b.nord - a.nord], v = [c.ost - b.ost, c.nord - b.nord];
    const lu = Math.hypot(...u), lv = Math.hypot(...v);
    if (lu < 1e-9 || lv < 1e-9) return 0;
    return Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (lu * lv)))) / GRAD;
}

/** Ein Punkt auf dem Zug in Stationierung s (Grundriss), mit linear interpolierter Höhe. */
function _anStation(zug, stat, s) {
    for (let i = 1; i < zug.length; i++) {
        if (s <= stat[i] + 1e-12) {
            const t = (s - stat[i - 1]) / Math.max(1e-12, stat[i] - stat[i - 1]);
            const a = zug[i - 1], b = zug[i];
            return { ost: a.ost + t * (b.ost - a.ost), nord: a.nord + t * (b.nord - a.nord),
                     ...(Number.isFinite(a.hoehe) && Number.isFinite(b.hoehe) ? { hoehe: a.hoehe + t * (b.hoehe - a.hoehe) } : {}) };
        }
    }
    return { ...zug.at(-1) };
}

/**
 * Eine Leitung in Rohrstücke und Bögen teilen.
 * @param {{ost, nord, hoehe?}[]} zug
 * @param {{da: number, material?: string, name?: string}} o  da = Aussendurchmesser in m
 * @returns {{stuecke: object[][], boegen: object[], befunde: object[]}}  ohne Bogen: ein Stück, der Zug selbst
 */
export function teileLeitung(zug, { da, material = null, name = '' } = {}) {
    const befunde = [];
    const befund = (regel, text, schwere = 'hinweis') => befunde.push({ regel, schwere, text });
    if (!Array.isArray(zug) || zug.length < 3 || !(da > 0)) return { stuecke: [zug], boegen: [], befunde };
    const grenze = muffenAbwinkelung(da);
    const regel = REGELBOEGEN[_gruppe(material)];
    const V = LEITUNGSZUG_VORGABEN;
    // Stationierung im Grundriss.
    const stat = [0];
    for (let i = 1; i < zug.length; i++) stat.push(stat[i - 1] + Math.hypot(zug[i].ost - zug[i - 1].ost, zug[i].nord - zug[i - 1].nord));
    // Welche Knicke einen Bogen brauchen.
    const knicke = [];
    for (let i = 1; i < zug.length - 1; i++) {
        const w = _knick(zug[i - 1], zug[i], zug[i + 1]);
        if (w <= grenze + 1e-9) {
            if (w > 0.01) befund('knick_in_muffe', `Knick ${w.toFixed(1)}° bei Punkt ${i} — in der Muffe (bis ${grenze}°).`);
            continue;
        }
        knicke.push({ i, w });
    }
    if (!knicke.length) return { stuecke: [zug], boegen: [], befunde };
    // Tangentenlänge je Knick; zwei Bögen teilen sich ein Stück höchstens zur Hälfte.
    let R = V.radius.faktor * da;
    for (const k of knicke) {
        const vor = stat[k.i] - stat[k.i - 1], nach = stat[k.i + 1] - stat[k.i];
        const t = R * Math.tan(k.w * GRAD / 2);
        const platz = Math.min(vor, nach) / 2;
        if (t > platz) {
            k.R = platz / Math.tan(k.w * GRAD / 2);
            befund('bogen_eng', `Knick bei Punkt ${k.i}: zu wenig Platz für den Bogen — Radius ${_r3(k.R)} m statt ${_r3(R)} m.`);
        } else k.R = R;
        k.t = k.R * Math.tan(k.w * GRAD / 2);
    }
    // Teilen: Stücke zwischen den Tangentenpunkten, Bögen dazwischen.
    const stuecke = [], boegen = [];
    let s0 = 0;
    for (const k of knicke) {
        const sA = stat[k.i] - k.t, sB = stat[k.i] + k.t;
        const stueck = [_anStation(zug, stat, s0), ...zug.slice(1, -1).filter((_, j) => stat[j + 1] > s0 + 1e-9 && stat[j + 1] < sA - 1e-9),
                        _anStation(zug, stat, sA)];
        stuecke.push(stueck);
        const A = _anStation(zug, stat, sA), Bp = _anStation(zug, stat, sB), P = zug[k.i];
        const punkte = _bogenPunkte(A, P, Bp, k.R, k.w);
        const { boegen: teile, rest } = regelboegen(k.w, regel.winkel);
        const titel = teile.map(w => `${String(w).replace('.', ',')}°`).join(' + ');
        if (Math.abs(rest) > grenze + 1e-9) {
            befund('kein_regelbogen', `Knick ${k.w.toFixed(1)}° bei Punkt ${k.i}: Regelbögen ${titel} lassen ${Math.abs(rest).toFixed(1)}° offen (Muffe nimmt ${grenze}°).`, 'warnung');
        }
        if (k.w > V.reinigung.abWinkel) befund('reinigungsoeffnung', `Knick ${k.w.toFixed(1)}° bei Punkt ${k.i}: ${V.reinigung.text}.`);
        boegen.push({
            name: `Bogen ${titel}${name ? ` (${name})` : ''}`, winkel: _r3(k.w), regel: teile, rest, radius: _r3(k.R), punkte,
            herleitung: {
                winkel: H('isybau', `Knick ${k.w.toFixed(1)}° aus dem vermessenen Zug`),
                formstueck: regel.herleitung,
                radius: H('annahme', V.radius.text),
                // Der Rest: bis zur Abwinkelung nimmt ihn die Muffe (belegt), darüber deckt ihn kein
                // Regelbogen — gebaut ist der gemessene Winkel, und das steht so da.
                ...(Math.abs(rest) > 0.05 ? { rest: Math.abs(rest) <= grenze + 1e-9
                    ? H('norm', `Rest ${rest.toFixed(1)}° in der Muffe`, B.abwinkelung)
                    : H('isybau', `Rest ${rest.toFixed(1)}° von keinem Regelbogen gedeckt — gebaut mit dem gemessenen Winkel`) } : {}),
            },
        });
        s0 = sB;
    }
    stuecke.push([_anStation(zug, stat, s0), ...zug.slice(1, -1).filter((_, j) => stat[j + 1] > s0 + 1e-9), { ...zug.at(-1) }]);
    return { stuecke, boegen, befunde };
}

/** Punkte auf dem Kreisbogen von A nach B um den Knick P (Grundriss), Höhen linear; höchstens 10° je Schritt. */
function _bogenPunkte(A, P, B, R, wGrad) {
    const u = [P.ost - A.ost, P.nord - A.nord], lu = Math.hypot(...u);
    const v = [B.ost - P.ost, B.nord - P.nord];
    const n = [-u[1] / lu, u[0] / lu];
    const links = u[0] * v[1] - u[1] * v[0] > 0;          // Drehsinn
    const nn = links ? n : [-n[0], -n[1]];
    const C = { ost: A.ost + nn[0] * R, nord: A.nord + nn[1] * R };
    const a0 = Math.atan2(A.nord - C.nord, A.ost - C.ost);
    // Gerade Schrittzahl: der mittlere Punkt liegt genau im Scheitel — dort sitzt der Netzknoten.
    const schritte = 2 * Math.max(1, Math.ceil(wGrad / 20));
    const hA = A.hoehe, hB = B.hoehe;
    const aus = [];
    for (let j = 0; j <= schritte; j++) {
        const t = j / schritte;
        const a = a0 + (links ? 1 : -1) * t * wGrad * GRAD;
        aus.push({ ost: C.ost + R * Math.cos(a), nord: C.nord + R * Math.sin(a),
                   ...(Number.isFinite(hA) && Number.isFinite(hB) ? { hoehe: hA + t * (hB - hA) } : {}) });
    }
    // Die Enden exakt auf die Tangentenpunkte (Rundung).
    aus[0] = { ...aus[0], ost: A.ost, nord: A.nord };
    aus[aus.length - 1] = { ...aus.at(-1), ost: B.ost, nord: B.nord };
    return aus;
}
