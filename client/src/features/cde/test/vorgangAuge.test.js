/**
 * Das Auge je VORGANG (Teil XXI, E3) — am echten `IfcEngine`.
 *
 * Fabios Entscheidung: im Raum steht der jüngere Vorgang; ein älterer, den
 * ein späterer wieder überformt hat, kommt nur über sein Auge zurück. Der
 * Hebel ist die Sichtbarkeit je Bauteil (fragments kennt weder
 * `polygonOffset` noch `renderOrder` je Element), und der Zustand lebt in der
 * Engine — das fragments-Modell wird bei jeder Bearbeitung verworfen und neu
 * gebaut, der Hider-Zustand stirbt mit ihm.
 *
 * Geprüft wird an der ECHTEN Schnittstelle: `vorgangSichtbar`,
 * `setzeVorgangSichtbar`, `erdkoerperSichtbarkeitAnwenden` — mit einer
 * Hider-Attrappe in der Form der Bibliothek (`set(sichtbar, ModelIdMap)`).
 */
import { describe, expect, it, vi } from 'vitest';
import * as OBC from '@thatopen/components';
import { IfcEngine } from '../services/IfcEngine.js';
import { CDE_MODELL_ID } from '../services/IfcAutor.js';

const A = 'ab-grube', B = 'ab-fuellung';

/**
 * Eine Engine mit gebauten Erdkörpern zweier Vorgänge: die Grube (A) ist von
 * der Auffüllung (B) verdeckt.
 */
function engineMitVorgaengen({ verdeckt = true } = {}) {
    const hiderRufe = [];
    const hider = { set: vi.fn(async (sichtbar, karte) => { hiderRufe.push({ sichtbar, karte }); }) };
    const fragments = { list: new Map([[CDE_MODELL_ID, { modelId: CDE_MODELL_ID }]]),
                        core: { update: vi.fn(async () => {}) } };
    const e = Object.create(IfcEngine.prototype);
    Object.assign(e, {
        // `components.get` gibt den Hider oder den FragmentsManager — an der
        // ECHTEN Klasse unterschieden, nicht an einem Namen, den niemand prägt.
        components: { get: (k) => (k === OBC.Hider ? hider : fragments) },
        autor: {
            erdkoerper: new Map([
                ['cde-a-aushub',  { ableitung: A, rolle: 'aushub',  kategorie: 'IFCEARTHWORKSCUT',  localId: 11 }],
                ['cde-b-auftrag', { ableitung: B, rolle: 'auftrag', kategorie: 'IFCEARTHWORKSFILL', localId: 12 }],
                ['cde-b-aushub',  { ableitung: B, rolle: 'aushub',  kategorie: 'IFCEARTHWORKSCUT',  localId: 13 }],
            ]),
            ableitungen: new Map([
                [A, { kennzahlen: { verdecktVon: verdeckt ? [{ ableitung: B, anteil: 1 }] : [] } }],
                [B, { kennzahlen: { verdecktVon: [] } }],
            ]),
        },
    });
    return { e, hider, hiderRufe, fragments };
}

/** Die localIds, die der letzte Ruf mit diesem Sichtbarkeitswert traf. */
const idsMit = (rufe, sichtbar) => {
    const treffer = rufe.filter(r => r.sichtbar === sichtbar).at(-1);
    return treffer ? [...(treffer.karte[CDE_MODELL_ID] ?? [])].sort((a, b) => a - b) : [];
};

describe('vorgangSichtbar — die Regel, bevor jemand ein Auge anfasst', () => {
    it('ein überdeckter Vorgang ist aus, ein überdeckender an — und beide nennen ihren Grund', () => {
        const { e } = engineMitVorgaengen();
        expect(e.vorgangSichtbar(A)).toEqual({ sichtbar: false, verdecktVon: [{ ableitung: B, anteil: 1 }] });
        expect(e.vorgangSichtbar(B)).toEqual({ sichtbar: true, verdecktVon: [] });
    });

    it('ein Vorgang, den niemand überdeckt, steht im Raum', () => {
        const { e } = engineMitVorgaengen({ verdeckt: false });
        expect(e.vorgangSichtbar(A).sichtbar).toBe(true);
    });

    it('eine unbekannte Ableitung ist sichtbar — kein Wissen heisst nicht „weg"', () => {
        const { e } = engineMitVorgaengen();
        expect(e.vorgangSichtbar('gibt-es-nicht')).toEqual({ sichtbar: true, verdecktVon: [] });
    });
});

describe('erdkoerperSichtbarkeitAnwenden — der Hider bekommt die Teile des Vorgangs', () => {
    it('verbirgt genau die Bauteile des überdeckten Vorgangs, zeigt die des jüngeren', async () => {
        const { e, hiderRufe } = engineMitVorgaengen();
        await e.erdkoerperSichtbarkeitAnwenden();
        expect(idsMit(hiderRufe, false)).toEqual([11]);            // die Grube
        expect(idsMit(hiderRufe, true)).toEqual([12, 13]);         // Auftrag und Aushub der Füllung
    });

    it('das Auge holt den überdeckten Vorgang zurück — und schickt ihn wieder weg', async () => {
        const { e, hiderRufe } = engineMitVorgaengen();
        expect(await e.setzeVorgangSichtbar(A, true))
            .toEqual({ sichtbar: true, verdecktVon: [{ ableitung: B, anteil: 1 }] });
        expect(idsMit(hiderRufe, true)).toEqual([11, 12, 13]);

        hiderRufe.length = 0;
        await e.setzeVorgangSichtbar(A, false);
        expect(idsMit(hiderRufe, false)).toEqual([11]);
    });

    it('das Auge überlebt den Neuaufbau — die Karte der Bauteile ist neu, der Wille bleibt', async () => {
        const { e, hiderRufe } = engineMitVorgaengen();
        await e.setzeVorgangSichtbar(A, true);
        // Der Neuaufbau verwirft das Modell und vergibt neue localIds.
        e.autor.erdkoerper = new Map([
            ['cde-a-aushub',  { ableitung: A, rolle: 'aushub',  kategorie: 'IFCEARTHWORKSCUT',  localId: 41 }],
            ['cde-b-auftrag', { ableitung: B, rolle: 'auftrag', kategorie: 'IFCEARTHWORKSFILL', localId: 42 }],
        ]);
        hiderRufe.length = 0;
        await e.erdkoerperSichtbarkeitAnwenden();
        expect(idsMit(hiderRufe, true)).toEqual([41, 42]);
        expect(idsMit(hiderRufe, false)).toEqual([]);
    });

    it('`null` gibt den Vorgang der Regel zurück', async () => {
        const { e } = engineMitVorgaengen();
        await e.setzeVorgangSichtbar(A, true);
        expect(e.vorgangSichtbar(A).sichtbar).toBe(true);
        await e.setzeVorgangSichtbar(A, null);
        expect(e.vorgangSichtbar(A).sichtbar).toBe(false);          // wieder verdeckt
    });

    it('ein entfernter Vorgang verliert sein Auge', async () => {
        const { e } = engineMitVorgaengen();
        await e.setzeVorgangSichtbar(A, true);
        e.vergissVorgangsauge(A);
        expect(e.vorgangSichtbar(A).sichtbar).toBe(false);
    });

    it('ohne gebaute Erdkörper rührt sie den Hider nicht an', async () => {
        const { e, hider } = engineMitVorgaengen();
        e.autor.erdkoerper = new Map();
        await e.erdkoerperSichtbarkeitAnwenden();
        expect(hider.set).not.toHaveBeenCalled();
    });
});

describe('„alles einblenden" holt keinen überdeckten Vorgang zurück', () => {
    it('showAll blendet die Kategorien ein und wendet die Regel danach wieder an', async () => {
        const { e, hiderRufe } = engineMitVorgaengen();
        e._categoryGroups = [{ name: 'IFCEARTHWORKSCUT', visible: false,
                               groupData: { get: async () => ({ [CDE_MODELL_ID]: [11, 13] }) } }];
        await e.showAll();
        // Zuletzt gilt die Regel: die Grube ist wieder aus, obwohl „alles ein" lief.
        expect(idsMit(hiderRufe, false)).toEqual([11]);
    });
});
