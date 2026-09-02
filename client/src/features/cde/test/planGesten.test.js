/**
 * usePlanGesten (Stufe T2) — Pan, Pinch, Tipp und Trägheit als reine Maschine.
 *
 * Die Attrappe ist in der Form der Wirklichkeit (Gesetz 9): `zuWelt` hängt —
 * wie das echte zeigerZuWelt — von der AKTUELLEN Mitte und Lupe ab. Eine
 * Attrappe mit fester Abbildung hätte den Pinch-Anker gar nicht prüfen
 * können: der Fehler entsteht genau daraus, dass sich die Abbildung unter
 * der Geste ändert.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { erzeugePlanGesten, WISCH_SCHWELLE_PX } from '../composables/usePlanGesten.js';

/** Bühne 800×600, Mitte der Welt liegt in der Bildschirmmitte (400, 300). */
function baueWelt() {
    const lage = { mitte: { x: 0, z: 0 }, zoom: 2 };
    const proMeter = () => lage.zoom * 10;             // px je Weltmeter
    return {
        lage,
        zuWelt: (px, py) => ({
            x: lage.mitte.x + (px - 400) / proMeter(),
            z: lage.mitte.z + (py - 300) / proMeter(),
        }),
    };
}

function baueGesten(welt, { plane, jetzt } = {}) {
    return erzeugePlanGesten({
        zuWelt: welt.zuWelt,
        holeMitte: () => welt.lage.mitte,
        setzeMitte: (m) => { welt.lage.mitte = m; },
        holeZoom: () => welt.lage.zoom,
        setzeZoom: (v) => { welt.lage.zoom = v; },
        holeBuehnenPunkt: () => ({ x: 400, y: 300 }),
        plane: plane ?? (() => {}),
        jetzt: jetzt ?? (() => 0),
    });
}

describe('Ein Finger schleppt die Welt', () => {
    it('der Inhalt folgt der Hand — die Mitte wandert gegenläufig', () => {
        const welt = baueWelt();
        const g = baueGesten(welt);
        g.zeigerAb(1, 400, 300, 'touch');
        g.zeigerBewegt(1, 420, 300);
        // 20 px nach rechts bei 20 px/m ⇒ die Mitte rückt 1 m nach links.
        expect(welt.lage.mitte.x).toBeCloseTo(-1, 6);
        expect(welt.lage.mitte.z).toBeCloseTo(0, 6);
    });

    it('unbekannte Zeiger gehen die Geste nichts an', () => {
        const welt = baueWelt();
        const g = baueGesten(welt);
        g.zeigerBewegt(99, 500, 500);
        expect(welt.lage.mitte).toEqual({ x: 0, z: 0 });
    });
});

describe('Zwei Finger sind eine Pinch', () => {
    it('doppelter Abstand = doppelte Lupe', () => {
        const welt = baueWelt();
        const g = baueGesten(welt);
        g.zeigerAb(1, 350, 300, 'touch');
        g.zeigerAb(2, 450, 300, 'touch');
        g.zeigerBewegt(1, 300, 300);
        g.zeigerBewegt(2, 500, 300);
        expect(welt.lage.zoom).toBeCloseTo(4, 6);
    });

    it('die Welt unter der Fingermitte bleibt unter der Fingermitte', () => {
        const welt = baueWelt();
        const g = baueGesten(welt);
        // Fingermitte liegt bei (500, 300) — NICHT in der Bildschirmmitte,
        // sonst prüfte der Test den Anker gar nicht.
        const anker = welt.zuWelt(500, 300);
        g.zeigerAb(1, 450, 300, 'touch');
        g.zeigerAb(2, 550, 300, 'touch');
        g.zeigerBewegt(1, 400, 300);
        g.zeigerBewegt(2, 600, 300);
        const danach = welt.zuWelt(500, 300);
        expect(danach.x).toBeCloseTo(anker.x, 6);
        expect(danach.z).toBeCloseTo(anker.z, 6);
    });

    it('uebernimm() startet die Pinch ohne eigene Down-Ereignisse', () => {
        const welt = baueWelt();
        const g = baueGesten(welt);
        g.uebernimm([{ id: 7, x: 350, y: 300 }, { id: 8, x: 450, y: 300 }]);
        g.zeigerBewegt(7, 300, 300);
        g.zeigerBewegt(8, 500, 300);
        expect(welt.lage.zoom).toBeCloseTo(4, 6);
        // Übernommene Zeiger sind nie ein Tipp.
        expect(g.zeigerAuf(7).warTipp).toBe(false);
    });
});

describe('Der Tipp', () => {
    it('unter der Wischschwelle ist es ein Tipp', () => {
        const g = baueGesten(baueWelt());
        g.zeigerAb(1, 400, 300, 'touch');
        g.zeigerBewegt(1, 402, 301);
        expect(g.zeigerAuf(1).warTipp).toBe(true);
    });

    it('darüber ist es ein Wisch — auch wenn der Weg zurückführt', () => {
        // Der WEG zählt, nicht der Abstand: hin und zurück ist kein Tipp.
        const g = baueGesten(baueWelt());
        g.zeigerAb(1, 400, 300, 'touch');
        g.zeigerBewegt(1, 400 + WISCH_SCHWELLE_PX, 300);
        g.zeigerBewegt(1, 400, 300);
        expect(g.zeigerAuf(1).warTipp).toBe(false);
    });

    it('war ein zweiter Finger im Spiel, ist es kein Tipp mehr', () => {
        const g = baueGesten(baueWelt());
        g.zeigerAb(1, 400, 300, 'touch');
        g.zeigerAb(2, 500, 300, 'touch');
        g.zeigerAuf(2);
        expect(g.zeigerAuf(1).warTipp).toBe(false);
    });

    it('die Maus tippt hier nie — sie wirkt beim Aufsetzen', () => {
        const g = baueGesten(baueWelt());
        g.zeigerAb(1, 400, 300, 'mouse');
        expect(g.zeigerAuf(1).warTipp).toBe(false);
    });
});

describe('Die Trägheit', () => {
    /** Uhr und Frameplaner von Hand: jeder plane()-Aufruf ist ein Frame. */
    function baueTakt() {
        let zeit = 0;
        const warteschlange = [];
        return {
            jetzt: () => zeit,
            plane: (cb) => warteschlange.push(cb),
            tick(ms) {
                zeit += ms;
                const cb = warteschlange.shift();
                if (cb) cb();
            },
            offen: () => warteschlange.length,
        };
    }

    function wirf(g, takt) {
        g.zeigerAb(1, 400, 300, 'touch');
        for (let i = 1; i <= 5; i++) { takt.tick(16); g.zeigerBewegt(1, 400 + i * 20, 300); }
        g.zeigerAuf(1);
    }

    it('nach dem Wurf gleitet die Welt weiter und kommt zur Ruhe', () => {
        const welt = baueWelt();
        const takt = baueTakt();
        const g = baueGesten(welt, takt);
        wirf(g, takt);
        const beimLoslassen = welt.lage.mitte.x;
        let frames = 0;
        while (takt.offen() && frames < 500) { takt.tick(16); frames++; }
        expect(welt.lage.mitte.x).toBeLessThan(beimLoslassen);   // gleitet in Wurfrichtung weiter
        expect(frames).toBeGreaterThan(3);                        // mehr als ein Zucken …
        expect(takt.offen()).toBe(0);                             // … und sie ENDET von selbst
    });

    it('ein neuer Finger stoppt das Gleiten sofort', () => {
        const welt = baueWelt();
        const takt = baueTakt();
        const g = baueGesten(welt, takt);
        wirf(g, takt);
        takt.tick(16);                    // ein Gleit-Frame läuft an
        g.zeigerAb(2, 100, 100, 'touch'); // der Finger greift zu
        const stand = welt.lage.mitte.x;
        while (takt.offen()) takt.tick(16);
        expect(welt.lage.mitte.x).toBe(stand);
    });

    it('die Maus gleitet nicht', () => {
        const welt = baueWelt();
        const takt = baueTakt();
        const g = baueGesten(welt, takt);
        g.zeigerAb(1, 400, 300, 'mouse');
        for (let i = 1; i <= 5; i++) { takt.tick(16); g.zeigerBewegt(1, 400 + i * 20, 300); }
        g.zeigerAuf(1);
        expect(takt.offen()).toBe(0);
    });
});
