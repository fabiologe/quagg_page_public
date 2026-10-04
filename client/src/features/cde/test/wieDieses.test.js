// @vitest-environment jsdom
/**
 * Teil XXIX, G8 — „Wie dieses" (Pipette, Konzept § 7 W4): ein neues Bauteil mit den Werten des gewählten.
 *
 * Gemessen am Teich P11 über die echte Schnittstelle: jedes Element wird mit dem Werkzeug und den Vorgaben, die
 * `wieDieses` aus SEINEM Bauplan liest, als Kommando neu gezeichnet (dieselben Punkte, neue Kennung). Das neue Bauteil
 * muss dieselbe Klasse, Ausführung, dasselbe Gewerk und dieselben Werte tragen — ohne Name, Ort und Bauwerk.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { gewerkVon, predefinedTypeVon } from '../services/Bauteilrezepte.js';
import { wieDieses } from '../services/Bearbeitungen.js';
import { rasterAusMesh } from '../services/geometrie/ops/Raster.js';
import { Speicher } from './hilfen/vorlagenKommandos.js';
import { P11_SOLL, p11Kommandos } from './hilfen/p11Kommandos.js';

beforeEach(() => { repo.setBackend(new Speicher()); setActivePinia(createPinia()); });
afterEach(() => repo.setBackend(null));

function ebene() {
    const t = [];
    for (let x = -20; x < 120; x += 4) for (let z = -20; z < 120; z += 4) {
        t.push(x, 100, z, x + 4, 100, z, x + 4, 100, z + 4, x, 100, z, x + 4, 100, z + 4, x, 100, z + 4);
    }
    return { positions: new Float64Array(t), triCount: t.length / 9 };
}
const NETZ = ebene();
void rasterAusMesh;
const URSUBJEKT = { modelId: 'm1', localId: 1, globalId: 'UR', name: 'Urgelände', category: 'IFCGEOGRAPHICELEMENT', hoehenversatz: 0,
                    quellmass: { pruefmass: { triCount: NETZ.triCount, spanX: 140, spanY: 0, spanZ: 140 }, cell: 2 } };

/** Was zur ART gehört: der Bauplan ohne Name, Ort, Bauwerk, Quelle — bei einer Ableitung samt ihrer einen Operation. */
const GEOMETRIE = new Set(['punkte', 'name', 'teilVon', 'anschluss', 'hoeheVon', 'umriss', 'achse', 'quellen', 'quellBasis', 'raster']);
function art(plan) {
    const ohne = (o) => Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => !GEOMETRIE.has(k)));
    const { operationen, ...p } = plan.parameter ?? {};
    return {
        rezept: plan.rezept, kategorie: plan.kategorie, predefinedType: predefinedTypeVon(plan), gewerk: gewerkVon(plan).gewerk,
        parameter: ohne(p), operationen: (operationen ?? []).map(o => ({ art: o.art, parameter: ohne(o.parameter) })),
    };
}

describe('Teil XXIX, G8 — „Wie dieses" (W4)', () => {
    it('jedes Element des Teichs, „wie dieses" neu gezeichnet, trägt dieselbe Art', async () => {
        const b = useBearbeitung(), ae = useAenderungen();
        const { kommandos } = p11Kommandos();
        let i = 0;
        const kennungsgeber = (a) => (a === 'operation' ? `op-g${++i}` : `cde-g${++i}`);
        const subjektVon = (gid) => (gid === 'UR' ? URSUBJEKT : null);
        for (const kom of kommandos) expect((await b.fuehreAus(kom, { subjektVon, kennungsgeber })).ausgefuehrt, kom.id).toBe(true);

        const stand = ae.wirksamerStand('erzeugt');
        const gleich = [], anders = [];
        for (const gid of Object.keys(P11_SOLL)) {
            const plan = stand.get(gid);
            const w = wieDieses(plan);
            expect(w.grund, gid).toBeUndefined();
            const ur = kommandos.find(k => k.neu?.[0] === gid);
            const neu = `${gid}-wie`;
            const r = await b.fuehreAus({ ...ur, id: `${ur.id}-wie`, werkzeug: w.werkzeug, neu: [neu, ...(ur.neu.length > 1 ? [`op-wie-${gid}`] : [])],
                                          werte: { name: 'Kopie', ...w.vorgaben } }, { subjektVon, kennungsgeber });
            expect(r.ausgefuehrt, `${gid}: ${r.grund}`).toBe(true);
            const kopie = ae.wirksamerStand('erzeugt').get(neu);
            (JSON.stringify(art(kopie)) === JSON.stringify(art(plan)) ? gleich : anders).push([gid, art(plan), art(kopie)]);
        }
        expect(anders).toEqual([]);
        expect(gleich.length).toBe(30);
    }, 120000);

    it('sagt, wo es nicht geht: Bauwerk, Erdbau-Vorgang, Geliefertes', async () => {
        const b = useBearbeitung(), ae = useAenderungen();
        const { kommandos } = p11Kommandos();
        let i = 0;
        const kennungsgeber = (a) => (a === 'operation' ? `op-h${++i}` : `cde-h${++i}`);
        for (const kom of kommandos.slice(0, 8)) {
            await b.fuehreAus(kom, { subjektVon: (gid) => (gid === 'UR' ? URSUBJEKT : null), kennungsgeber });
        }
        const stand = ae.wirksamerStand('erzeugt');
        expect(wieDieses(stand.get('cde-TEICH')).grund).toMatch(/Baugruppe/);
        const aushub = [...stand.values()].find(p => p?.rezept === 'erdbau');
        expect(aushub, 'Aushub im Stand').toBeTruthy();
        expect(wieDieses(aushub).grund).toMatch(/Erdbau-Vorgang/);
        expect(wieDieses(null).grund).toMatch(/Eigenbau/);
    }, 60000);
});
