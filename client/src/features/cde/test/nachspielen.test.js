// @vitest-environment jsdom
/**
 * Nachspielen (Stufe 9.2) — der Rebase.
 *
 * Diese Datei prüft die Zusage, ohne die das ganze Bearbeiten wertlos wäre:
 * eine Festlegung überlebt die nächste Modellrevision des Planers — oder sie
 * meldet sich laut, wenn sie es nicht kann.
 *
 * Die vier Fälle sind die von Git:
 *   Upstream unverändert     → sauber anwenden
 *   Upstream hat mitgeändert → Konflikt, ein Mensch entscheidet
 *   Upstream hat gelöscht    → Konflikt, nicht stiller Verlust
 *   eigene Neuanlage         → gar nicht erst im Lieferstand suchen
 *
 * Dazu die Eigenschaft, auf der alles ruht: IDEMPOTENZ.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { anwendungsweg, fasseZusammen, konfliktKarte, planeNachspielen } from '../services/Nachspielen.js';
import { useAenderungen } from '../stores/useAenderungen.js';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
});

const GELIEFERT = { x: 10, y: 2, z: 5 };
const GEZOGEN = { x: 11.5, y: 2, z: 5 };

/** Lieferstand als Map — so, wie ihn `IfcAutor` vor jeder Anwendung liest. */
const lieferstandAus = (map) => (globalId) => map.get(globalId);

/**
 * Eine AUSLEGUNG ist keine Festlegung — und schon gar keine Modelländerung.
 *
 * Der Unterschied ist nicht kosmetisch: hätte die Art `beruehrtModell`,
 * suchte `planeNachspielen` für jeden Eintrag einen Lieferstand-Wert namens
 * „Bauform" im IFC. Den gibt es nicht, also käme JEDE Auslegung als
 * `bauteil_nicht_im_modell` in den Konfliktbericht — und der Nutzer sähe
 * lauter Konflikte für etwas, das gar keinen Konflikt haben kann.
 */
describe('Bauform-Auslegung — weder Konflikt noch Anwendung', () => {
    const AUSLEGUNG = [
        { art: 'bauform', globalId: 'ERD1', nachher: 'hoehenfeld', modell: 'geliefert' },
    ];

    it('taucht im Nachspielen gar nicht erst auf — auch nicht als „fehlt"', () => {
        // Der Lieferstand ist LEER: das Bauteil steht (aus Sicht der Prüfung)
        // nicht im Modell. Genau der Fall, der bei `lage` einen Konflikt gäbe.
        const p = planeNachspielen(AUSLEGUNG, lieferstandAus(new Map()));
        expect(p.konflikte).toEqual([]);
        expect(p.anzuwenden).toEqual([]);
        expect(p.betroffeneGlobalIds ?? []).not.toContain('ERD1');
    });

    it('bekommt einen eigenen Anwendungsweg — nicht „Festlegung"', () => {
        // Sonst meldete der Viewer „die Geometrie bleibt beim Planer". Bei
        // einer Auslegung gibt es aber nichts, das der Planer ändern soll:
        // sie ist unsere Lesart SEINER Datei.
        expect(anwendungsweg(AUSLEGUNG[0])).toBe('auslegung');
        // Zur Abgrenzung — die beiden Nachbarn bleiben, wo sie waren:
        expect(anwendungsweg({ art: 'kg', globalId: 'X' })).toBe('nur-festlegung');
        expect(anwendungsweg({ art: 'lage', globalId: 'X' })).toBe('einzeln');
        expect(anwendungsweg({ art: 'erzeugt', globalId: 'X' })).toBe('neuaufbau');
    });
});

describe('planeNachspielen — die vier Fälle', () => {
    const eintraege = [
        { art: 'lage', globalId: 'H12', basis: GELIEFERT, nachher: GEZOGEN, modell: 'geliefert' },
    ];

    it('wendet an, wenn der Planer nichts angerührt hat', () => {
        const p = planeNachspielen(eintraege, lieferstandAus(new Map([['H12', GELIEFERT]])));
        expect(p.anzuwenden).toHaveLength(1);
        expect(p.anzuwenden[0].wert).toEqual(GEZOGEN);
        expect(p.konflikte).toHaveLength(0);
    });

    it('meldet Konflikt, wenn der Planer dasselbe Bauteil auch bewegt hat', () => {
        const p = planeNachspielen(eintraege, lieferstandAus(new Map([['H12', { x: 10.5, y: 2, z: 5 }]])));
        expect(p.anzuwenden).toHaveLength(0);
        expect(p.konflikte[0].zustand).toBe('konflikt');
        expect(p.konflikte[0].istWert).toEqual({ x: 10.5, y: 2, z: 5 });
    });

    it('meldet Konflikt statt stillem Verlust, wenn das Bauteil weg ist', () => {
        const p = planeNachspielen(eintraege, lieferstandAus(new Map()));
        expect(p.konflikte[0].zustand).toBe('fehlt');
        expect(p.anzuwenden).toHaveLength(0);
    });

    it('sucht ein CDE-eigenes Bauteil gar nicht erst im Lieferstand', () => {
        // Sonst wäre jede Neuanlage sofort ein Fehlalarm „nicht mehr im Modell".
        const eigen = [{ art: 'erzeugt', globalId: 'neu-1', nachher: { kategorie: 'IFCPIPESEGMENT' }, modell: 'cde' }];
        const p = planeNachspielen(eigen, lieferstandAus(new Map()));
        expect(p.anzuwenden).toHaveLength(1);
        expect(p.anzuwenden[0].modell).toBe('cde');
        expect(p.konflikte).toHaveLength(0);
    });
});

describe('Es wird der STAND angewandt, nicht die Historie — Entscheidung 4', () => {
    it('wendet bei fünf Zügen EINEN Schritt an, den letzten', async () => {
        const j = useAenderungen();
        for (const x of [10.5, 11, 11.5]) {
            await j.eintragen({ art: 'lage', globalId: 'H12', nachher: { x, y: 2, z: 5 }, basis: GELIEFERT });
        }
        expect(j.eintraege).toHaveLength(3);

        const p = planeNachspielen(j.eintraege, lieferstandAus(new Map([['H12', GELIEFERT]])));
        expect(p.anzuwenden).toHaveLength(1);
        expect(p.anzuwenden[0].wert).toEqual({ x: 11.5, y: 2, z: 5 });
    });

    it('lässt ein zurückgenommenes Bauteil aus dem Plan fallen', async () => {
        const j = useAenderungen();
        await j.eintragen({ art: 'lage', globalId: 'H12', nachher: GEZOGEN, basis: GELIEFERT });
        await j.zurueck();
        const p = planeNachspielen(j.eintraege, lieferstandAus(new Map([['H12', GELIEFERT]])));
        expect(p.anzuwenden).toHaveLength(0);
    });

    it('nimmt die Basis des Schrittes, der zuletzt gewonnen hat', async () => {
        // Nicht die des ersten — sonst prüfte man gegen einen Bezugspunkt,
        // den niemand mehr meint.
        const j = useAenderungen();
        await j.eintragen({ art: 'lage', globalId: 'H12', nachher: { x: 11, y: 2, z: 5 }, basis: GELIEFERT });
        await j.eintragen({ art: 'lage', globalId: 'H12', nachher: GEZOGEN, basis: GELIEFERT });
        const p = planeNachspielen(j.eintraege, lieferstandAus(new Map([['H12', GELIEFERT]])));
        expect(p.anzuwenden[0].eintrag.nachher).toEqual(GEZOGEN);
    });
});

describe('Idempotenz — die Eigenschaft, auf der alles ruht', () => {
    /** Ein Fake-Modell, das Anker hält und sie auf einen ZIELWERT setzt. */
    function fakeModell(start) {
        const lage = new Map(Object.entries(start));
        return {
            lieferstand: new Map(Object.entries(start)),   // eingefroren beim Laden
            anwenden(plan) { for (const a of plan.anzuwenden) lage.set(a.globalId, a.wert); },
            lageVon: (id) => lage.get(id),
        };
    }

    it('ändert beim zweiten Lauf nichts mehr', () => {
        const m = fakeModell({ H12: GELIEFERT });
        const eintraege = [{ art: 'lage', globalId: 'H12', basis: GELIEFERT, nachher: GEZOGEN, modell: 'geliefert' }];

        m.anwenden(planeNachspielen(eintraege, (id) => m.lieferstand.get(id)));
        const nachEinmal = m.lageVon('H12');

        m.anwenden(planeNachspielen(eintraege, (id) => m.lieferstand.get(id)));
        expect(m.lageVon('H12')).toEqual(nachEinmal);
        expect(m.lageVon('H12')).toEqual(GEZOGEN);
    });

    it('würde mit Zuwächsen statt Ankern auseinanderlaufen — der Grund für Entscheidung 1', () => {
        // Gegenprobe zur Entwurfsentscheidung: derselbe Ablauf, aber der Wert
        // ist ein Zuwachs statt eines Ziels.
        const lage = { H12: 10 };
        const zuwachs = 1.5;
        lage.H12 += zuwachs;
        const nachEinmal = lage.H12;
        lage.H12 += zuwachs;
        expect(lage.H12).not.toBe(nachEinmal);   // 13 statt 11,5
    });
});

describe('Die Meldung verschweigt nichts', () => {
    it('nennt Angewandtes und beide Konfliktsorten', () => {
        expect(fasseZusammen({ angewandt: 18, konflikte: 2, ueberschnitten: 1, fehlend: 1 }))
            .toBe('18 Festlegungen angewandt · 1 × auch vom Planer geändert · 1 × Bauteil nicht mehr im Modell');
    });

    it('bleibt still, wenn es nichts zu melden gibt', () => {
        expect(fasseZusammen({})).toBe('');
    });

    it('schreibt die Einzahl aus', () => {
        expect(fasseZusammen({ angewandt: 1 })).toBe('1 Festlegung angewandt');
    });
});

describe('konfliktKarte — für die Anzeige am Eintrag', () => {
    it('schlägt je Art und Bauteil nach', () => {
        const p = planeNachspielen(
            [{ art: 'lage', globalId: 'H12', basis: GELIEFERT, nachher: GEZOGEN, modell: 'geliefert' }],
            lieferstandAus(new Map()),
        );
        const karte = konfliktKarte(p.konflikte);
        expect(karte.get('lage|H12').zustand).toBe('fehlt');
        expect(karte.get('lage|H99')).toBeUndefined();
    });
});

describe('Merkmale bleiben aussen vor', () => {
    it('plant Kostengruppen nicht mit — sie berühren das Modell nicht', async () => {
        const j = useAenderungen();
        await j.eintragen({ art: 'kg', globalId: 'H12', nachher: '322' });
        const p = planeNachspielen(j.eintraege, lieferstandAus(new Map()));
        expect(p.anzuwenden).toHaveLength(0);
        expect(p.konflikte).toHaveLength(0);
    });
});

describe('Ebenen beim Nachspielen (Stufe 11.1)', () => {
    const AUFTRAG = [{ art: 'lage', globalId: 'H12', basis: GELIEFERT, nachher: GEZOGEN, modell: 'geliefert' }];

    it('spielt eine Auftragskorrektur auch ohne Modellsatz nach', () => {
        const p = planeNachspielen(AUFTRAG, lieferstandAus(new Map([['H12', GELIEFERT]])));
        expect(p.anzuwenden).toHaveLength(1);
    });

    it('lässt den Modellsatz die Auftragskorrektur überschreiben', () => {
        const satz = [{ art: 'lage', globalId: 'H12', basis: GELIEFERT, nachher: { x: 12, y: 2, z: 5 }, modell: 'geliefert' }];
        const p = planeNachspielen(AUFTRAG, lieferstandAus(new Map([['H12', GELIEFERT]])),
            { standEintraege: satz });
        expect(p.anzuwenden).toHaveLength(1);
        expect(p.anzuwenden[0].wert).toEqual({ x: 12, y: 2, z: 5 });
    });

    it('LÖSCHT die Auftragskorrektur NICHT, wenn der Satz zurücknimmt', () => {
        // Der Fallstrick der Verkettung: `null` im Satzjournal heisst „hier
        // nichts gesetzt", nicht „auch die Ebene darunter wegwerfen". Sonst
        // käme die Korrektur beim nächsten Laden nicht mehr aufs Modell.
        const satz = [{ art: 'lage', globalId: 'H12', basis: GELIEFERT, nachher: null, modell: 'geliefert' }];
        const p = planeNachspielen(AUFTRAG, lieferstandAus(new Map([['H12', GELIEFERT]])),
            { standEintraege: satz });
        expect(p.anzuwenden).toHaveLength(1);
        expect(p.anzuwenden[0].wert).toEqual(GEZOGEN);
    });
});


describe('Quellwechsel einer Ableitung (Teil XIV, G4)', () => {
    it('ein geändertes Prüfmass wird angewandt UND gemeldet — nie still', () => {
        const eintraege = [{
            id: 'e1', art: 'erzeugt', globalId: 'cde-dgm', modell: 'cde',
            nachher: { rezept: 'erdbau', rolle: 'dgm', ableitung: 'ab-1', parameter: {
                quellen: { gelaende: 'DGM0' },
                quellBasis: { gelaende: { triCount: 800, spanX: 40, spanY: 2, spanZ: 40 } },
                raster: { cell: 0.5 }, operationen: [{ art: 'gerinne', parameter: {} }],
            } },
        }];
        const gleich = planeNachspielen(eintraege, () => undefined,
            { leseQuellmass: () => ({ triCount: 800, spanX: 40, spanY: 2, spanZ: 40 }) });
        expect(gleich.hinweise).toEqual([]);
        expect(gleich.zusammenfassung.quelleGeaendert).toBe(0);

        const anders = planeNachspielen(eintraege, () => undefined,
            { leseQuellmass: () => ({ triCount: 812, spanX: 40, spanY: 2.4, spanZ: 40 }) });
        expect(anders.anzuwenden).toHaveLength(1);                       // angewandt …
        expect(anders.anzuwenden[0].grund).toBe('quelle_geaendert');
        expect(anders.hinweise[0]).toMatchObject({ globalId: 'cde-dgm', zustand: 'quelle_geaendert' });
        expect(anders.zusammenfassung.quelleGeaendert).toBe(1);
        expect(fasseZusammen(anders.zusammenfassung)).toContain('Quelle vom Planer geändert');
    });

    it('eine CDE-Quelle (kein Prüfmass lesbar) ergibt kein Urteil', () => {
        const eintraege = [{
            id: 'e1', art: 'erzeugt', globalId: 'cde-b', modell: 'cde',
            nachher: { rezept: 'erdbau', rolle: 'dgm', parameter: {
                quellen: { gelaende: 'cde-a' }, quellBasis: { gelaende: null }, operationen: [] } },
        }];
        const r = planeNachspielen(eintraege, () => undefined, { leseQuellmass: () => undefined });
        expect(r.hinweise).toEqual([]);
    });
});
