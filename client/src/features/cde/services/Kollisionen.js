/**
 * KOLLISIONEN ALS BEFUND (Teil XXXII, O2 — Fabio 2026-10-05: „zwei Objekte miteinander verschneiden etc").
 *
 * Nicht jede Überschneidung soll ein Körper werden: ein Rohr, das durch ein Fundament läuft, ist meist ein Fehler, den
 * man sehen will — „Überschneidet sich mit Fundament A: 0,120 m³". Gemessen wird mit derselben Schnittmenge, die das
 * Verschneiden baut (`booleSchnitt`, Server-Kernel); geändert wird nichts.
 *
 * WER GEPRÜFT WIRD: eigene, sichtbare Bauteile, deren Körper aus dem Bauplan kommt (`rezept.formAus(…, 'koerper')` —
 * Wand, Platte, Fundament, Rohr, Schacht, Pfosten …). Nicht: Räume (`IfcSpace` ist kein Bauteil, er LIEGT zwischen
 * Wänden), Ableitungen (Erdkörper, Verschnitte — ihr Körper entsteht erst im Lauf), Anzeigen.
 *
 * WAS NICHT ZÄHLT — bewusst Verbundenes: zwei Bauteile im Knoten (ein gemeinsamer Punkt) oder im T-Stoss (ein Punkt auf
 * der Kante des anderen, Teil XXXII K5). Zwei 30-cm-Wände an einer Ecke überlappen immer um 0,3 × 0,3 × Höhe — das ist
 * keine Kollision, das ist die Ecke.
 *
 * NUR PAARE MIT ÜBERLAPPENDER HÜLLE gehen an den Server — sonst wüchse die Zahl der Anfragen mit dem Quadrat.
 */
import { knotenPartner, tStossPartner } from './Griffe.js';

/** Unter diesem Volumen ist eine Schnittmenge Rechenrauschen (Berührung), keine Kollision. */
export const KOLLISION_AB_M3 = 0.001;

/** Die Hülle eines Netzes — `{min, max}` oder null. */
function _huelle(form) {
    const p = form?.positions;
    if (!p?.length) return null;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    const n = (form.triCount ? form.triCount * 9 : p.length);
    for (let i = 0; i < n; i += 3) {
        for (let k = 0; k < 3; k++) { const v = p[i + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
    }
    return { min, max };
}
const _ueberlappen = (a, b, rand = 1e-3) => [0, 1, 2].every(k => a.min[k] < b.max[k] - rand && b.min[k] < a.max[k] - rand);

/** Die prüfbaren Körper aus dem Stand: `[{globalId, name, kategorie, form, huelle, plan}]`. */
export function pruefbareKoerper({ stand, verdeckt = new Set(), rezeptNach }) {
    const aus = [];
    for (const [gid, plan] of stand ?? []) {
        if (!plan?.rezept || plan.ableitung || verdeckt.has(gid)) continue;
        const kategorie = String(plan.kategorie ?? '').toUpperCase();
        if (kategorie === 'IFCSPACE') continue;
        const rz = rezeptNach(plan.rezept);
        if (!rz || typeof rz.leite === 'function' || typeof rz.formAus !== 'function') continue;
        let form = null;
        try { form = rz.formAus(plan.parameter ?? {}, 'koerper', plan); } catch { form = null; }
        if (!form?.closed) continue;
        const huelle = _huelle(form);
        if (huelle) aus.push({ globalId: gid, name: plan.name || gid, kategorie, form, huelle, plan });
    }
    return aus;
}

/** Sind zwei Bauteile bewusst verbunden (Knoten oder T-Stoss, in beide Richtungen)? */
function _verbunden(a, b) {
    const pa = a.plan.parameter?.punkte, pb = b.plan.parameter?.punkte;
    if (!Array.isArray(pa) || !Array.isArray(pb)) return false;
    const nurB = new Map([[b.globalId, b.plan]]), nurA = new Map([[a.globalId, a.plan]]);
    if (pa.some(p => Array.isArray(p) && knotenPartner(p, a.globalId, nurB).length)) return true;
    const ringA = !!a.plan.parameter?.geschlossen || a.plan.bauform === 'flaeche+dicke';
    const ringB = !!b.plan.parameter?.geschlossen || b.plan.bauform === 'flaeche+dicke';
    return tStossPartner(pa, ringA, a.globalId, nurB).size > 0 || tStossPartner(pb, ringB, b.globalId, nurA).size > 0;
}

const _m3 = (v) => `${v.toFixed(3).replace('.', ',')} m³`;

/**
 * Alle Kollisionen eigener Körper.
 * @returns {Promise<{befunde: Map<string, object[]>, paare: Array<{a, b, volumen}>, geprueft: number, grund: string|null}>}
 */
export async function kollisionenPruefen({ stand, verdeckt = new Set(), rezeptNach, kernel, abM3 = KOLLISION_AB_M3 } = {}) {
    const befunde = new Map();
    const paare = [];
    if (!kernel?.op) return { befunde, paare, geprueft: 0, grund: 'kein Kernel' };
    const kann = kernel.kann?.('booleSchnitt');
    if (kann && kann.ok === false) return { befunde, paare, geprueft: 0, grund: kann.grund ?? 'der Server rechnet keine Schnittmenge' };
    const koerper = pruefbareKoerper({ stand, verdeckt, rezeptNach });
    let geprueft = 0;
    for (let i = 0; i < koerper.length; i++) {
        for (let j = i + 1; j < koerper.length; j++) {
            const a = koerper[i], b = koerper[j];
            if (!_ueberlappen(a.huelle, b.huelle) || _verbunden(a, b)) continue;
            geprueft++;
            let r = null;
            try { r = await kernel.op('booleSchnitt', { a: a.form, b: b.form }); } catch { r = null; }
            const volumen = Number(r?.ergebnis?.volumen ?? 0);
            if (!(volumen > abM3)) continue;
            paare.push({ a: a.globalId, b: b.globalId, volumen });
            for (const [x, y] of [[a, b], [b, a]]) {
                const liste = befunde.get(x.globalId) ?? [];
                liste.push({ regel: 'kollision', schwere: 'warnung', partner: y.globalId, volumen,
                             text: `Überschneidet sich mit „${y.name}": ${_m3(volumen)}` });
                befunde.set(x.globalId, liste);
            }
        }
    }
    return { befunde, paare, geprueft, grund: null };
}
