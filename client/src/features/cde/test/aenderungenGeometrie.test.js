// @vitest-environment jsdom
/**
 * Journal für Geometrie (Stufe 9.1) — absolute Werte und der Drei-Wege-Vergleich.
 *
 * Fabios Bild für das Ganze ist Git: der Lieferstand ist der Basis-Stand, deine
 * Festlegungen sind Commits, eine neue Modellrevision ist ein bewegter
 * Upstream, das Nachspielen ist ein Rebase. Diese Datei prüft die zwei
 * Entscheidungen, auf denen das ruht.
 *
 * ENTSCHEIDUNG 1 — absolute Werte, keine Zuwächse. Ziehst du ein Rohr erst
 * 1,00 m und dann 0,50 m nach Osten, trägt der zweite Eintrag +1,50 m gegenüber
 * Lieferstand, nicht +0,50. Der zwingende Grund ist die Idempotenz: zweimal
 * nachgespielt darf sich nichts ändern. Zuwächse verdoppeln sich.
 *
 * ENTSCHEIDUNG 3 — jeder modellberührende Eintrag trägt seine `basis`, den Wert
 * des GELIEFERTEN Modells. Erst damit ist beim Nachspielen unterscheidbar, ob
 * nur du geändert hast (sauber) oder auch der Planer (Konflikt).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
    AENDERUNGS_ARTEN, LAENGEN_TOLERANZ, gleichFuer, standAus,
    beschreibeWert, useAenderungen, vergleicheMitModell,
} from '../stores/useAenderungen.js';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
});

// `lage` speichert einen ANKER (Mitte der Bauteilhülle), keinen Versatz —
// beide Seiten des Drei-Wege-Vergleichs müssen dieselbe Größe messen.
const GELIEFERT = { x: 10, y: 2, z: 5 };      // Lage im gelieferten Modell
const OST_100   = { x: 11, y: 2, z: 5 };      // 1,00 m weiter
const OST_150   = { x: 11.5, y: 2, z: 5 };    // 1,50 m weiter

describe('Die Arten', () => {
    it('trennt modellberührende von daneben liegenden', () => {
        expect(AENDERUNGS_ARTEN.lage.beruehrtModell).toBe(true);
        expect(AENDERUNGS_ARTEN.parametrik.beruehrtModell).toBe(true);
        expect(AENDERUNGS_ARTEN.kg.beruehrtModell).toBeFalsy();
        expect(AENDERUNGS_ARTEN.din277.beruehrtModell).toBeFalsy();
    });

    it('gibt jeder Art mit Objektwerten einen eigenen Vergleich', () => {
        for (const [name, art] of Object.entries(AENDERUNGS_ARTEN)) {
            if (art.beruehrtModell && name !== 'geloescht') {
                expect(typeof art.gleich, name).toBe('function');
            }
        }
    });
});

describe('gleichFuer — ohne den trägt das Journal keine Objekte', () => {
    it('vergleicht Anker mit Bautoleranz, nicht mit ===', () => {
        const gleich = gleichFuer('lage');
        expect(gleich({ ...OST_100 }, { ...OST_100 })).toBe(true);
        expect(gleich(OST_100, OST_150)).toBe(false);
    });

    it('lässt Zahlenrauschen unter der Toleranz durchgehen', () => {
        const gleich = gleichFuer('lage');
        expect(gleich({ x: 1, y: 0, z: 0 }, { x: 1 + LAENGEN_TOLERANZ / 2, y: 0, z: 0 })).toBe(true);
        expect(gleich({ x: 1, y: 0, z: 0 }, { x: 1 + LAENGEN_TOLERANZ * 10, y: 0, z: 0 })).toBe(false);
    });

    it('meldet UNGLEICH, wenn eine Seite gar kein Punkt ist', () => {
        // Der Fehler der ersten Fassung: ein Versatz-Vergleich auf einem Punkt
        // fand lauter undefined, machte Nullen daraus und meldete IMMER
        // „gleich" — jeder Konflikt wäre still als sauber durchgegangen.
        const gleich = gleichFuer('lage');
        expect(gleich({ dx: 1, dy: 0, dz: 0 }, { x: 99, y: 99, z: 99 })).toBe(false);
        expect(gleich({}, { x: 0, y: 0, z: 0 })).toBe(false);
    });

    it('vergleicht Maße tief', () => {
        expect(gleichFuer('parametrik')({ dn: 300 }, { dn: 300 })).toBe(true);
        expect(gleichFuer('parametrik')({ dn: 300 }, { dn: 400 })).toBe(false);
    });

    it('fällt bei Arten ohne eigenen Vergleich auf Identität zurück', () => {
        expect(gleichFuer('kg')('322', '322')).toBe(true);
        expect(gleichFuer('kg')('322', '331')).toBe(false);
    });
});

describe('Absolute Werte — Entscheidung 1', () => {
    it('trägt beim zweiten Zug den Gesamtversatz, nicht den Zuwachs', async () => {
        const j = useAenderungen();
        await j.eintragen({ art: 'lage', globalId: 'H12', nachher: OST_100, basis: GELIEFERT });
        await j.eintragen({ art: 'lage', globalId: 'H12', nachher: OST_150, basis: GELIEFERT });
        expect(j.eintraege).toHaveLength(2);
        expect(standAus(j.eintraege, 'lage').get('H12')).toEqual(OST_150);
    });

    it('faltet weiter „letzter gewinnt" — die Stufe-7-Regel bleibt unberührt', async () => {
        const j = useAenderungen();
        await j.eintragen({ art: 'lage', globalId: 'H12', nachher: OST_150, basis: GELIEFERT });
        await j.eintragen({ art: 'lage', globalId: 'H12', nachher: OST_100, basis: GELIEFERT });
        // Nicht 2,50 m — der letzte Wert IST das Ergebnis.
        expect(standAus(j.eintraege, 'lage').get('H12')).toEqual(OST_100);
    });

    it('schreibt für denselben Zug zweimal nur EINEN Eintrag', async () => {
        // Ohne `gleich` verglich das Journal Objekte mit === und hielte jeden
        // Zug für neu — die Liste füllte sich mit Schritten, die nichts tun.
        const j = useAenderungen();
        await j.eintragen({ art: 'lage', globalId: 'H12', nachher: OST_100, basis: GELIEFERT });
        await j.eintragen({ art: 'lage', globalId: 'H12', nachher: { ...OST_100 }, basis: GELIEFERT });
        expect(j.eintraege).toHaveLength(1);
    });

    it('nimmt einen Zug auf den Ausgangszustand zurück, nicht irgendwohin', async () => {
        const j = useAenderungen();
        await j.eintragen({ art: 'lage', globalId: 'H12', nachher: OST_100, basis: GELIEFERT });
        await j.eintragen({ art: 'lage', globalId: 'H12', nachher: OST_150, basis: GELIEFERT });
        await j.zurueck();
        expect(standAus(j.eintraege, 'lage').get('H12')).toEqual(OST_100);
        await j.zurueck();
        expect(standAus(j.eintraege, 'lage').get('H12') ?? null).toBe(null);
    });
});

describe('basis — Entscheidung 3', () => {
    it('führt sie bei modellberührenden Arten mit', async () => {
        const j = useAenderungen();
        const e = await j.eintragen({ art: 'lage', globalId: 'H12', nachher: OST_100, basis: GELIEFERT });
        expect(e.basis).toEqual(GELIEFERT);
        expect(e.modell).toBe('geliefert');
    });

    it('führt sie NICHT bei Merkmalen — dort wäre sie ein Feld ohne Bedeutung', async () => {
        const j = useAenderungen();
        const e = await j.eintragen({ art: 'kg', globalId: 'H12', nachher: '322' });
        expect('basis' in e).toBe(false);
        expect('modell' in e).toBe(false);
    });

    it('merkt sich, dass ein erzeugtes Bauteil im CDE-Modell lebt', async () => {
        // Ohne das suchte das Nachspielen es im gelieferten Modell und fände
        // es nie.
        const j = useAenderungen();
        const e = await j.eintragen({
            art: 'erzeugt', globalId: 'neu-1', nachher: { kategorie: 'IFCPIPESEGMENT' },
            basis: null, modell: 'cde',
        });
        expect(e.modell).toBe('cde');
    });

    it('vererbt Basis und Modell an die Rücknahme', async () => {
        // Sonst gälte ausgerechnet der Eintrag, der am Ende wirkt, als
        // „ohne Basis" und entzöge sich dem Vergleich.
        const j = useAenderungen();
        await j.eintragen({ art: 'lage', globalId: 'H12', nachher: OST_100, basis: GELIEFERT, modell: 'geliefert' });
        const [gegen] = await j.zurueck();
        expect(gegen.basis).toEqual(GELIEFERT);
        expect(gegen.modell).toBe('geliefert');
    });
});

describe('vergleicheMitModell — der Drei-Wege-Vergleich', () => {
    const eintrag = { art: 'lage', globalId: 'H12', basis: GELIEFERT, nachher: OST_150 };

    it('ist sauber, wenn der Planer nichts angerührt hat', () => {
        expect(vergleicheMitModell(eintrag, GELIEFERT).zustand).toBe('sauber');
    });

    it('meldet KONFLIKT, wenn der Planer dasselbe Bauteil auch bewegt hat', () => {
        // Beide haben geändert. Das kann kein Programm entscheiden.
        const r = vergleicheMitModell(eintrag, { x: 10.2, y: 2, z: 5 });
        expect(r.zustand).toBe('konflikt');
        expect(r.grund).toBe('planer_hat_auch_geaendert');
    });

    it('meldet FEHLT, wenn das Bauteil nicht mehr im Modell ist', () => {
        const r = vergleicheMitModell(eintrag, undefined);
        expect(r.zustand).toBe('fehlt');
        expect(r.grund).toBe('bauteil_nicht_im_modell');
    });

    it('erklärt Merkmale immer für sauber — sie kollidieren nicht mit dem Modell', () => {
        const kg = { art: 'kg', globalId: 'H12', nachher: '322' };
        expect(vergleicheMitModell(kg, undefined).zustand).toBe('sauber');
    });

    it('wendet Altbestand ohne basis an, sagt aber warum', () => {
        const alt = { art: 'lage', globalId: 'H12', nachher: OST_150 };
        const r = vergleicheMitModell(alt, GELIEFERT);
        expect(r.zustand).toBe('sauber');
        expect(r.grund).toBe('ohne_basis');
    });

    it('benutzt die Bautoleranz, nicht die Bitgleichheit', () => {
        const r = vergleicheMitModell(eintrag, { ...GELIEFERT, x: GELIEFERT.x + LAENGEN_TOLERANZ / 2 });
        expect(r.zustand).toBe('sauber');
    });
});

describe('beschreibeWert — der Reiter zeigt keine [object Object]', () => {
    it('leitet den Versatz aus Basis und Ziel ab — gespeichert ist der Anker', () => {
        const basis = { x: 0, y: 0, z: 0 };
        expect(beschreibeWert('lage', { x: 0.4, y: -0.1, z: 0 }, basis))
            .toBe('X +400 mm · H -100 mm');
    });

    it('nennt KEINE Himmelsrichtungen — die Achskonvention ist noch offen', () => {
        const s = beschreibeWert('lage', { x: 1.5, y: 0, z: 2.25 }, { x: 0, y: 0, z: 0 });
        expect(s).toBe('X +1.500 m · Y +2.250 m');
        expect(s).not.toMatch(/Ost|West|Nord|Süd/);
    });

    it('verschweigt Achsen unterhalb der Toleranz', () => {
        expect(beschreibeWert('lage', { x: 0.4, y: LAENGEN_TOLERANZ / 2, z: 0 }, { x: 0, y: 0, z: 0 }))
            .toBe('X +400 mm');
    });

    it('sagt „unverändert" statt einer leeren Zeile', () => {
        expect(beschreibeWert('lage', GELIEFERT, GELIEFERT)).toBe('unverändert');
    });

    it('zeigt ohne Basis den Anker selbst, statt zu schweigen', () => {
        expect(beschreibeWert('lage', { x: 10, y: 2, z: 5 })).toBe('Anker 10.00 / 2.00 / 5.00');
    });

    it('beschreibt Maße als Feld-Werte-Paare', () => {
        expect(beschreibeWert('parametrik', { dn: 300 })).toBe('dn: 300');
    });

    it('reicht einfache Werte unverändert durch', () => {
        expect(beschreibeWert('kg', '322')).toBe('322');
        expect(beschreibeWert('kg', null)).toBe('— (Regel)');
    });
});
