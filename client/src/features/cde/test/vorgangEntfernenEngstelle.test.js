// @vitest-environment jsdom
/**
 * „Vorgang entfernen" geht durch die Engstelle (Abnahme 2026-09-12, A6).
 *
 * Wer ins Journal schreibt, schreibt über `useBearbeitung` — dort sitzt die
 * Sperre des Bearbeiten-Modus (`bearbeitungVerklebung.test.js` hält die Liste
 * der Schreibstellen). Der erste Entwurf schrieb aus dem Viewer daneben; der
 * Wächter schlug an. Hier: ohne Modus nichts und ein Grund, mit Modus EIN
 * Vorgang, nach dem die Teile aus dem wirksamen Stand verschwunden sind.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { nachId } from '../services/Bearbeitungen.js';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
});

const GELAENDE = {
    globalId: 'DGM-1', modelId: 'netz.ifc', localId: 42, name: 'Urgelände',
    hoehenversatz: 300, quellmass: { pruefmass: { triCount: 900, spanX: 200, spanY: 12, spanZ: 200 }, cell: 0.5 },
};
const UMRISS = [{ x: 0, y: 4, z: 0 }, { x: 10, y: 4, z: 0 }, { x: 10, y: 4, z: 10 }, { x: 0, y: 4, z: 10 }];

/** Ein Aushub im Verlauf, geschrieben wie jede Bearbeitung — gibt seine Klammer zurück. */
async function einAushub(ae) {
    const schritte = nachId('graben-ausheben').anwenden(GELAENDE, { mass: 2 }, { zug: UMRISS });
    for (const s of schritte) await ae.eintragen({ ...s, wer: 'fabio' });
    return schritte.find(s => s.nachher?.rezept === 'erdbau').nachher.ableitung;
}
const teileVon = (ae, ableitung) => [...ae.wirksamerStand('erzeugt').values()].filter(w => w.ableitung === ableitung);

describe('entferneVorgang', () => {
    it('ohne Bearbeiten-Modus schreibt es nichts und sagt warum', async () => {
        const ae = useAenderungen();
        const b = useBearbeitung();
        const ableitung = await einAushub(ae);
        const vorher = ae.anzahl;

        expect(await b.entferneVorgang(ableitung, { wer: 'fabio' })).toBe(null);
        expect(b.letzterGrund).toMatch(/Bearbeiten ist aus/);
        expect(ae.anzahl).toBe(vorher);
        expect(teileVon(ae, ableitung)).toHaveLength(2);
    });

    it('mit Modus: EIN Vorgang, danach sind Aushub und Auftrag aus dem Stand', async () => {
        const ae = useAenderungen();
        const b = useBearbeitung();
        const ableitung = await einAushub(ae);
        b.modusSetzen(true);

        const geschrieben = await b.entferneVorgang(ableitung, { wer: 'fabio' });
        expect(Array.isArray(geschrieben)).toBe(true);
        expect(new Set(geschrieben.map(e => e.vorgang)).size).toBe(1);                // ein Vorgang
        expect(teileVon(ae, ableitung)).toHaveLength(0);                               // vorher 2
        expect(ae.wirksamerStand('geloescht').has('DGM-1')).toBe(false);               // das Gelände steht wieder da
    });

    // Kassensturz E4 / Abnahme M4: eine Handlung schaltet die Bearbeitung ein.
    it('mit Einschalter: ohne Modus schaltet es ein und entfernt — EIN Vorgang', async () => {
        const ae = useAenderungen();
        const b = useBearbeitung();
        const ableitung = await einAushub(ae);
        let gefragt = 0;
        const geschrieben = await b.entferneVorgang(ableitung, {
            wer: 'fabio', einschalten: () => { gefragt++; return b.modusSetzen(true); },
        });
        expect(gefragt).toBe(1);
        expect(b.modusAn).toBe(true);
        expect(new Set(geschrieben.map(e => e.vorgang)).size).toBe(1);
        expect(teileVon(ae, ableitung)).toHaveLength(0);
    });

    it('lehnt der Einschalter ab, bleibt alles — und ein Grund steht da', async () => {
        const ae = useAenderungen();
        const b = useBearbeitung();
        const ableitung = await einAushub(ae);
        expect(await b.entferneVorgang(ableitung, { wer: 'fabio', einschalten: () => false })).toBe(null);
        expect(b.letzterGrund).toMatch(/nicht einschalten/);
        expect(teileVon(ae, ableitung)).toHaveLength(2);
    });
});
