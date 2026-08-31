// @vitest-environment jsdom
/**
 * Journal-Ebenen (Stufe 11.1) — die Grundlage der Variantenuntersuchung.
 *
 * Zwei Sorten Festlegung, unterschieden nicht durch ein Merkmal am Eintrag,
 * sondern durch den ORT:
 *
 *   Auftragsjournal   „das Rohr liegt 20 cm tiefer als geliefert"
 *                     → wahr in JEDEM Modellsatz
 *   Standjournal      „hier probiere ich 12,40"
 *                     → nur in diesem Modellsatz
 *
 * Vorher gab es nur ein Journal im globalen Scope: eine Festlegung in
 * „Variante Nord" galt auch in „Süd", weil es beide gar nicht gab.
 *
 * DER FALLSTRICK, der diese Datei nötig macht: `standAus` liest `null` als
 * „Eintrag herausnehmen". Würden beide Ebenen VERKETTET und dann gefaltet,
 * löschte ein `null` im Standjournal auch die Auftragskorrektur darunter — wer
 * in einer Variante etwas zurücknimmt, verlöre die Korrektur gleich mit. Jede
 * Ebene wird deshalb für sich gefaltet und danach überlagert.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { ebenenStand, standAus, useAenderungen } from '../stores/useAenderungen.js';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
});

const e = (art, globalId, nachher) => ({ art, globalId, nachher });

describe('ebenenStand — rein, ohne Store', () => {
    it('lässt den Auftragswert gelten, wo der Satz nichts sagt', () => {
        const stand = ebenenStand([e('kg', 'H12', '322')], [], 'kg');
        expect(stand.get('H12')).toBe('322');
    });

    it('lässt den Satz den Auftrag überschreiben', () => {
        const stand = ebenenStand([e('kg', 'H12', '322')], [e('kg', 'H12', '331')], 'kg');
        expect(stand.get('H12')).toBe('331');
    });

    it('lässt bei null im Satz den Auftragswert WIEDER DURCHSCHEINEN', () => {
        // Der ganze Grund für die getrennte Faltung. Bei Verkettung stünde
        // hier `undefined` — die Auftragskorrektur wäre mitgelöscht.
        const stand = ebenenStand([e('kg', 'H12', '322')], [e('kg', 'H12', null)], 'kg');
        expect(stand.get('H12')).toBe('322');
    });

    it('unterscheidet sich damit nachweislich von der Verkettung', () => {
        const auftrag = [e('kg', 'H12', '322')];
        const satz = [e('kg', 'H12', null)];
        expect(standAus([...auftrag, ...satz], 'kg').has('H12')).toBe(false);   // falsch
        expect(ebenenStand(auftrag, satz, 'kg').get('H12')).toBe('322');        // richtig
    });

    it('mischt Bauteile aus beiden Ebenen', () => {
        const stand = ebenenStand([e('kg', 'A', '322')], [e('kg', 'B', '331')], 'kg');
        expect([...stand.entries()].sort()).toEqual([['A', '322'], ['B', '331']]);
    });

    it('erträgt leere Ebenen', () => {
        expect(ebenenStand(null, null, 'kg').size).toBe(0);
    });
});

describe('Zwei Modellsätze am selben Auftrag', () => {
    it('trägt eine Auftragskorrektur in BEIDE Sätze', async () => {
        const j = useAenderungen();
        await j.bereit;
        await j.eintragen({ art: 'kg', globalId: 'H12', nachher: '322', ebene: 'auftrag' });

        await j.setzeSatz('s-nord');
        expect(j.wirksamerStand('kg').get('H12')).toBe('322');
        await j.setzeSatz('s-sued');
        expect(j.wirksamerStand('kg').get('H12')).toBe('322');
    });

    it('hält eine Satz-Festlegung IN ihrem Satz', async () => {
        const j = useAenderungen();
        await j.bereit;
        await j.setzeSatz('s-nord');
        await j.eintragen({ art: 'kg', globalId: 'H12', nachher: '331' });
        expect(j.wirksamerStand('kg').get('H12')).toBe('331');

        await j.setzeSatz('s-sued');
        expect(j.wirksamerStand('kg').get('H12') ?? null).toBe(null);
    });

    it('lässt den Satz die Auftragskorrektur überschreiben — nur dort', async () => {
        const j = useAenderungen();
        await j.bereit;
        await j.eintragen({ art: 'kg', globalId: 'H12', nachher: '322', ebene: 'auftrag' });
        await j.setzeSatz('s-nord');
        await j.eintragen({ art: 'kg', globalId: 'H12', nachher: '331' });

        expect(j.wirksamerStand('kg').get('H12')).toBe('331');
        await j.setzeSatz('s-sued');
        expect(j.wirksamerStand('kg').get('H12')).toBe('322');
    });

    it('schreibt ohne Satz in die Auftragsebene', async () => {
        const j = useAenderungen();
        await j.bereit;
        expect(j.vorgabeEbene).toBe('auftrag');
        await j.eintragen({ art: 'kg', globalId: 'H12', nachher: '322' });
        expect(j.auftragsEintraege).toHaveLength(1);
        expect(j.standEintraege).toHaveLength(0);
    });

    it('nimmt die Einträge des vorigen Satzes NICHT in den neuen mit', async () => {
        const j = useAenderungen();
        await j.bereit;
        await j.setzeSatz('s-nord');
        await j.eintragen({ art: 'kg', globalId: 'H12', nachher: '331' });
        await j.setzeSatz('s-sued');
        expect(j.standEintraege).toHaveLength(0);
    });
});

describe('Zurücknehmen ist ebenentreu', () => {
    it('lässt die Auftragskorrektur stehen, wenn im Satz zurückgenommen wird', async () => {
        // Ohne Ebenentreue nähme „zurück" in einer Variante eine Korrektur
        // zurück, die dort niemand gemacht hat.
        const j = useAenderungen();
        await j.bereit;
        await j.eintragen({ art: 'kg', globalId: 'H12', nachher: '322', ebene: 'auftrag' });
        await j.setzeSatz('s-nord');
        await j.eintragen({ art: 'kg', globalId: 'H12', nachher: '331' });

        await j.zurueck();
        expect(j.auftragsEintraege).toHaveLength(1);
        expect(j.wirksamerStand('kg').get('H12')).toBe('322');   // Korrektur scheint durch
    });

    it('bietet „zurück" nicht an, wenn nur die andere Ebene etwas hat', async () => {
        const j = useAenderungen();
        await j.bereit;
        await j.eintragen({ art: 'kg', globalId: 'H12', nachher: '322', ebene: 'auftrag' });
        await j.setzeSatz('s-nord');
        expect(j.kannZurueck).toBe(false);
    });

    it('nimmt auf der Auftragsebene zurück, wenn man dort arbeitet', async () => {
        const j = useAenderungen();
        await j.bereit;
        await j.eintragen({ art: 'kg', globalId: 'H12', nachher: '322', ebene: 'auftrag' });
        expect(j.kannZurueck).toBe(true);
        await j.zurueck();
        expect(j.wirksamerStand('kg').get('H12') ?? null).toBe(null);
    });
});

describe('hebeAufAuftragsebene — der cherry-pick', () => {
    it('verschiebt den Eintrag, ohne den wirksamen Stand zu ändern', async () => {
        const j = useAenderungen();
        await j.bereit;
        await j.setzeSatz('s-nord');
        const eintrag = await j.eintragen({ art: 'kg', globalId: 'H12', nachher: '331' });
        const vorher = j.wirksamerStand('kg').get('H12');

        await j.hebeAufAuftragsebene(eintrag.id, 'Fabio');

        expect(j.standEintraege).toHaveLength(0);
        expect(j.auftragsEintraege).toHaveLength(1);
        expect(j.wirksamerStand('kg').get('H12')).toBe(vorher);
    });

    it('macht ihn damit in einem ANDEREN Satz wirksam', async () => {
        const j = useAenderungen();
        await j.bereit;
        await j.setzeSatz('s-nord');
        const eintrag = await j.eintragen({ art: 'kg', globalId: 'H12', nachher: '331' });
        await j.hebeAufAuftragsebene(eintrag.id);

        await j.setzeSatz('s-sued');
        expect(j.wirksamerStand('kg').get('H12')).toBe('331');
    });

    it('kopiert nicht, sondern verschiebt', async () => {
        // Läge er in beiden Ebenen, überschriebe die Satzfassung die
        // Auftragsfassung für immer — und „gilt doch nur hier" wäre davon
        // nicht mehr zu unterscheiden.
        const j = useAenderungen();
        await j.bereit;
        await j.setzeSatz('s-nord');
        const eintrag = await j.eintragen({ art: 'kg', globalId: 'H12', nachher: '331' });
        await j.hebeAufAuftragsebene(eintrag.id);
        expect(j.eintraege.filter(x => x.id === eintrag.id)).toHaveLength(1);
    });

    it('tut nichts bei einer unbekannten Id', async () => {
        const j = useAenderungen();
        await j.bereit;
        expect(await j.hebeAufAuftragsebene('gibtsnicht')).toBe(null);
    });
});

describe('Die Ebenen überleben das Neuladen getrennt', () => {
    it('liest beide Journale aus ihren eigenen Schlüsseln', async () => {
        const j = useAenderungen();
        await j.bereit;
        await j.eintragen({ art: 'kg', globalId: 'A', nachher: '322', ebene: 'auftrag' });
        await j.setzeSatz('s-nord');
        await j.eintragen({ art: 'kg', globalId: 'B', nachher: '331' });

        // Frischer Store auf demselben Speicher — wie nach F5.
        setActivePinia(createPinia());
        const neu = useAenderungen();
        await neu.bereit;
        await neu.setzeSatz('s-nord');

        expect(neu.auftragsEintraege).toHaveLength(1);
        expect(neu.standEintraege).toHaveLength(1);
        expect(neu.wirksamerStand('kg').get('A')).toBe('322');
        expect(neu.wirksamerStand('kg').get('B')).toBe('331');
    });
});
