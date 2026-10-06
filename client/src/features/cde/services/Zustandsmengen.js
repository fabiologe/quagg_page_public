/**
 * MASSEN NACH ZUSTAND — Bestand, Neubau, Rückbau getrennt (Fabio, 2026-10-06:
 * „relevant für Massen später"; „gleiche ab mit dem Neubau").
 *
 * Gerechnet aus dem Journal (wirksamer Stand „erzeugt"), nicht aus der Anzeige:
 * dieselbe Zahl, ob das 3D geladen ist oder nicht. Gezählt wird je Netzobjekt:
 *   - Leitungen (Rezepte mit Netzrolle „kante"): Länge der Achse in m, je DN und Material
 *   - Formstücke (Bögen und andere Teile mit Netzrolle „knoten" an einer Leitung): Stück
 *   - Bauwerke (Schacht, Straßenablauf, Elemente ohne Körper) und einzelne Knoten
 *     (Anschlusspunkt, Sonderbauwerk): Stück, je Art
 * Die Teile EINES Bauwerks (Ringe, Konus, Deckel …) zählen nicht einzeln — das
 * Bauwerk ist die Position. Eine Baugruppe „Leitung" ist nur die Klammer ihrer Stücke.
 *
 * Der Zustand kommt aus Zustand.js (eigener oder der des Bauwerks), das Material
 * aus den Sachdaten der Quelle (bimfy/isybau/Abbildung.js).
 *
 * Rein: Daten hinein, Daten heraus.
 */
import { ZUSTAENDE, zustandVon } from './Zustand.js';
import { BAUWERKSARTEN, istBehaelter, rezeptNach } from './Bauteilrezepte.js';
import { materialVon } from './bimfy/isybau/Abbildung.js';

/** Die Spalte für Bauteile ohne Zustand. */
export const OHNE_ZUSTAND = 'ohne';

const _fin = (v) => typeof v === 'number' && Number.isFinite(v);
const _r2 = (v) => Math.round(v * 100) / 100;

/** Länge eines Zugs aus Weltpunkten `[x, y, z]` (räumlich, wie die Achse liegt). */
export function zuglaenge(punkte) {
    let l = 0;
    for (let i = 1; i < (punkte?.length ?? 0); i++) {
        const a = punkte[i - 1], b = punkte[i];
        const d = [0, 1, 2].map(k => Number(b?.[k]) - Number(a?.[k]));
        if (d.every(_fin)) l += Math.hypot(...d);
    }
    return l;
}

function _material(plan, eltern) {
    const name = materialVon(plan?.parameter?.stammdaten, 'rohr')?.name
              ?? materialVon(eltern?.parameter?.stammdaten, 'rohr')?.name;
    return name || 'unbekannt';
}

/**
 * Die Massen je Zustand.
 * @param {Map<string, object>} stand  wirksamer Stand „erzeugt" (globalId → Bauplan)
 * @returns {{zustaende: string[], zeilen: object[], summe: object}}
 *   zeilen: `{gruppe: 'leitung'|'formstueck'|'bauwerk', titel, dn, material, einheit: 'm'|'Stk', werte: {zustand: zahl}}`
 *   summe: `{zustand: {laenge, stueck}}`
 */
export function mengenNachZustand(stand = new Map()) {
    const von = (g) => stand.get(g);
    const zeilen = new Map();
    const summe = {};
    const zustaende = new Set();
    const buche = (schluessel, kopf, z, menge) => {
        if (!zeilen.has(schluessel)) zeilen.set(schluessel, { ...kopf, werte: {} });
        const zeile = zeilen.get(schluessel);
        zeile.werte[z] = (zeile.werte[z] ?? 0) + menge;
        summe[z] ??= { laenge: 0, stueck: 0 };
        summe[z][kopf.einheit === 'm' ? 'laenge' : 'stueck'] += menge;
        zustaende.add(z);
    };

    for (const [, plan] of stand) {
        if (!plan) continue;
        const eltern = plan.parameter?.teilVon ? von(plan.parameter.teilVon) : null;
        const z = zustandVon(plan, von) ?? OHNE_ZUSTAND;
        if (istBehaelter(plan)) {
            const art = plan.parameter?.art;
            if (art === 'baugruppe' || art === 'anlage') continue;
            const titel = BAUWERKSARTEN[art]?.titel ?? 'Bauwerk';
            buche(`b|${titel}`, { gruppe: 'bauwerk', titel, dn: null, material: null, einheit: 'Stk' }, z, 1);
            continue;
        }
        // Ein Teil eines Bauwerks (nicht einer Leitung) ist kein eigenes Netzobjekt.
        const inLeitung = istBehaelter(eltern) && eltern.parameter?.art === 'baugruppe';
        if (eltern && !inLeitung) continue;
        const rezept = rezeptNach(plan.rezept);
        const dn = _fin(Number(plan.parameter?.dn)) && Number(plan.parameter.dn) > 0 ? Number(plan.parameter.dn) : null;
        const titel = rezept?.titel ?? plan.rezept ?? 'Bauteil';
        if (rezept?.netzrolle === 'kante') {
            const material = _material(plan, eltern);
            buche(`l|${dn}|${material}`, { gruppe: 'leitung', titel: 'Leitung', dn, material, einheit: 'm' }, z, zuglaenge(plan.parameter?.punkte));
        } else if (inLeitung) {
            const material = _material(plan, eltern);
            buche(`f|${titel}|${dn}|${material}`, { gruppe: 'formstueck', titel, dn, material, einheit: 'Stk' }, z, 1);
        } else {
            buche(`k|${titel}|${dn}`, { gruppe: 'bauwerk', titel, dn, material: null, einheit: 'Stk' }, z, 1);
        }
    }

    const reihe = [...Object.keys(ZUSTAENDE), OHNE_ZUSTAND];
    const rang = { leitung: 0, formstueck: 1, bauwerk: 2 };
    const liste = [...zeilen.values()]
        .map(zl => ({ ...zl, werte: Object.fromEntries(Object.entries(zl.werte).map(([k, v]) => [k, zl.einheit === 'm' ? _r2(v) : v])) }))
        .sort((a, b) => rang[a.gruppe] - rang[b.gruppe] || a.titel.localeCompare(b.titel, 'de')
                     || (a.dn ?? 0) - (b.dn ?? 0) || String(a.material).localeCompare(String(b.material), 'de'));
    for (const s of Object.values(summe)) s.laenge = _r2(s.laenge);
    return { zustaende: reihe.filter(z => zustaende.has(z)), zeilen: liste, summe };
}

/** Der Spaltentitel eines Zustands. */
export const zustandsTitel = (z) => ZUSTAENDE[z]?.titel ?? 'ohne Angabe';
