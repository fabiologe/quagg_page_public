// Was nicht geht, nennt den RICHTIGEN Grund (2026-09-09).
//
// Am ENQUIER-Netz gemessen: „Schacht entfernen" an einem Endschacht und
// „Schacht einfügen" bei einer Station ausserhalb der Haltung lehnen beide
// zu Recht ab — und meldeten beide „Dem Bauteil fehlt der Bezug für diese
// Bearbeitung." Die Ablehnung war richtig, die Begründung falsch: der
// Nutzer sucht einen fehlenden Bezug, den es gar nicht gibt.
//
// `anwenden` gibt null und kann nicht sagen, weshalb. Deshalb darf der
// Katalogeintrag ein `warumNicht` mitbringen, das der Store bei leerem
// Ergebnis fragt. Wer keins hat, bekommt weiter den alten Satz — er stimmt
// für die Fälle, für die er geschrieben wurde (fehlender Anker, fehlende
// Hülle).

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BEARBEITUNGEN } from '../services/Bearbeitungen.js';

const nachId = (id) => BEARBEITUNGEN.find(b => b.id === id);

/** Ein Schacht, wie ihn `_einordnenMitHuelle` liefert. */
function schacht({ anschluesse = 2, name = 'S7' } = {}) {
    return {
        globalId: 'g-schacht', name, bauform: 'koerper',
        anker: { x: 10, y: 2, z: 30 }, versatz: { x: 0, y: 0, z: 0 },
        lage: { ost: 2577382, nord: 5465755 },
        // Die Form, die `anschluesseFuer` liefert: je Anschluss das nahe
        // und das ferne Ende der Haltung, dazu DN. Eine schlankere Attrappe
        // liesse `anwenden` werfen statt ablehnen — und der Test prüfte
        // dann eine Bequemlichkeit statt der Wirklichkeit.
        anschluesse: Array.from({ length: anschluesse }, (_, i) => ({
            globalId: `r${i}`, name: `H${i}`, dn: 300,
            ende: i === 0 ? 'ende' : 'anfang',
            anfang: { x: i * 20, y: 0, z: 0 },
            ende_: { x: 10 + i * 20, y: 2, z: 30 },
        })),
    };
}

/** Eine Haltung mit gerader Achse der Länge `laenge`. */
function haltung(laenge = 100) {
    return {
        globalId: 'g-rohr', name: 'FK001', bauform: 'achse+profil',
        hoehenversatz: 0,
        achse: {
            laenge, anfang: { x: 0, y: 0, z: 0 }, ende: { x: laenge, y: 0, z: 0 },
            polyline: [{ x: 0, y: 0, z: 0 }, { x: laenge, y: 0, z: 0 }],
        },
    };
}

describe('Schacht entfernen', () => {
    const b = nachId('schacht-entfernen');

    it('am Durchgangsschacht: kein Grund, es geht', () => {
        const el = schacht({ anschluesse: 2 });
        expect(b.anwenden(el)).toBeTruthy();
        expect(b.warumNicht(el)).toBeNull();
    });

    it('am ENDschacht: lehnt ab UND sagt warum', () => {
        const el = schacht({ anschluesse: 1, name: 'FK001' });
        expect(b.anwenden(el)).toBeNull();
        const grund = b.warumNicht(el);
        expect(grund).toMatch(/Endschacht/);
        expect(grund).toMatch(/FK001/);
        // Nicht der alte Sammelsatz.
        expect(grund).not.toMatch(/fehlt der Bezug/);
    });

    it('an einem Knoten mit drei Anschlüssen: eigener Grund', () => {
        const grund = b.warumNicht(schacht({ anschluesse: 3 }));
        expect(grund).toMatch(/3 Anschlüsse/);
    });
});

describe('Schacht einfügen', () => {
    const b = nachId('schacht-einfuegen');

    it('mittig: kein Grund', () => {
        const el = haltung(100);
        expect(b.anwenden(el, { station: 50, deckel: 10, durchmesser: 1000 })).toBeTruthy();
        expect(b.warumNicht(el, { station: 50 })).toBeNull();
    });

    it('ausserhalb: nennt die Station UND die Grenzen', () => {
        const el = haltung(133.5);
        expect(b.anwenden(el, { station: 183.5, deckel: 10, durchmesser: 1000 })).toBeNull();
        const grund = b.warumNicht(el, { station: 183.5 });
        // Deutsche Zahlschreibweise — mit Komma, wie überall sonst.
        expect(grund).toMatch(/183,50/);
        expect(grund).toMatch(/133,50/);
        expect(grund).not.toMatch(/fehlt der Bezug/);
    });

    it('am Anfang und am Ende ebenso — dort entstünde ein Bauteil der Länge null', () => {
        const el = haltung(100);
        expect(b.warumNicht(el, { station: 0 })).toMatch(/liegt nicht auf der Haltung/);
        expect(b.warumNicht(el, { station: 100 })).toMatch(/liegt nicht auf der Haltung/);
    });

    it('ohne Station: eigener Grund', () => {
        expect(b.warumNicht(haltung(100), {})).toMatch(/Ohne Station/);
    });

    // Grund und Regel messen DIESELBE Grösse — sonst lehnt das eine ab,
    // während das andere „geht schon" sagt.
    it('Grund und Anwendung stimmen an der Grenze überein', () => {
        const el = haltung(100);
        for (const st of [-1, 0, 0.005, 0.5, 50, 99.5, 99.995, 100, 101]) {
            const geht = b.anwenden(el, { station: st, deckel: 10, durchmesser: 1000 }) !== null;
            expect(b.warumNicht(el, { station: st }) === null).toBe(geht);
        }
    });
});

describe('Schacht verschieben', () => {
    const b = nachId('schacht-verschieben');

    it('auf denselben Ort: lehnt ab und sagt es', () => {
        const el = schacht();
        const grund = b.warumNicht(el, { ost: el.lage.ost, nord: el.lage.nord });
        expect(grund).toMatch(/liegt schon dort/);
    });

    it('woanders hin: kein Grund', () => {
        const el = schacht();
        expect(b.warumNicht(el, { ost: el.lage.ost + 5, nord: el.lage.nord })).toBeNull();
    });

    it('ohne umkehrbare Abbildung: eigener Grund', () => {
        const el = { ...schacht(), lageUmkehrbar: false };
        expect(b.warumNicht(el, { ost: 1, nord: 2 })).toMatch(/umkehrbar/);
    });
});

describe('der Store fragt das Werkzeug', () => {
    it('jedes `warumNicht` ist eine Funktion und wirft nicht', () => {
        for (const b of BEARBEITUNGEN) {
            if (!b.warumNicht) continue;
            expect(typeof b.warumNicht).toBe('function');
            // Auch mit leerem Bauteil darf es nicht werfen — der Store ruft
            // es genau dann, wenn schon etwas fehlt.
            expect(() => b.warumNicht({}, {}, { zug: [] })).not.toThrow();
        }
    });

    it('der Store ruft es (Textwächter)', () => {
        const quelle = readFileSync(
            resolve(process.cwd(), 'src/features/cde/stores/useBearbeitung.js'), 'utf8');
        expect(quelle).toMatch(/b\.warumNicht\?\./);
        // Und der alte Satz bleibt als Rückfall.
        expect(quelle).toMatch(/fehlt der Bezug für diese Bearbeitung/);
    });
});

/**
 * Mitführen erhält die Topologie (2026-09-09, am ENQUIER-Netz gemessen).
 *
 * Der ANKER eines Schachts ist der Bezugspunkt seiner Hülle, der NETZKNOTEN
 * der Sohlpunkt der Achse — bei den echten Schächten liegen sie 10 mm
 * auseinander. Wer die mitgeführten Rohrenden auf den ANKER setzt, legt sie
 * 10 mm neben den Knoten; die Netztoleranz ist 1 mm. Gemessen: 4 Anschlüsse
 * vorher, 0 nachher. Mit dem DELTA bleibt jede Beziehung erhalten.
 */
describe('Schacht verschieben: die Anschlüsse wandern um das DELTA', () => {
    const b = nachId('schacht-verschieben');

    /** Anker und Rohrenden bewusst 10 mm auseinander — wie in der Wirklichkeit. */
    function mitVersatz() {
        const knoten = { x: 100, y: 5, z: 200 };            // hier enden die Rohre
        const anker = { x: knoten.x + 0.01, y: 5, z: knoten.z };  // 10 mm daneben
        return {
            globalId: 'g-s', name: 'SR06', bauform: 'koerper',
            anker, versatz: { x: 0, y: 0, z: 0 },
            lage: { ost: anker.x, nord: -anker.z },
            anschluesse: [
                { globalId: 'r1', name: 'H1', dn: 300, ende: 'ende',
                  anfang: { x: 60, y: 4, z: 200 }, ende_: { ...knoten } },
                { globalId: 'r2', name: 'H2', dn: 300, ende: 'anfang',
                  anfang: { ...knoten }, ende_: { x: 140, y: 6, z: 200 } },
            ],
        };
    }

    it('das nahe Ende behält seinen Abstand zum Knoten — hier: null', () => {
        const el = mitVersatz();
        const knoten = { x: 100, z: 200 };
        const dOst = 12, dNord = 9;
        const eintraege = b.anwenden(el, {
            ost: el.lage.ost + dOst, nord: el.lage.nord + dNord, mitfuehren: 'wirklich',
        });
        expect(eintraege).toBeTruthy();

        // Der Knoten wandert um dasselbe Delta wie der Anker.
        const knotenNeu = { x: knoten.x + dOst, z: knoten.z - dNord };

        const erzeugt = eintraege.filter(e => e.art === 'erzeugt');
        expect(erzeugt).toHaveLength(2);
        for (const e of erzeugt) {
            const p = e.nachher.parameter.punkte;
            // Das Ende, das AM SCHACHT liegt — das andere bleibt stehen.
            const nah = p
                .map(([x, , z]) => ({ x, z }))
                .reduce((a, q) => (Math.hypot(q.x - knotenNeu.x, q.z - knotenNeu.z)
                    < Math.hypot(a.x - knotenNeu.x, a.z - knotenNeu.z) ? q : a));
            const abstandMm = Math.hypot(nah.x - knotenNeu.x, nah.z - knotenNeu.z) * 1000;
            expect(abstandMm).toBeLessThan(1);      // Netztoleranz
        }
    });

    it('das ferne Ende bleibt, wo es war — sonst wanderte das halbe Netz mit', () => {
        const el = mitVersatz();
        const eintraege = b.anwenden(el, { ost: el.lage.ost + 12, nord: el.lage.nord + 9, mitfuehren: 'wirklich' });
        const punkte = eintraege.filter(e => e.art === 'erzeugt').map(e => e.nachher.parameter.punkte);
        expect(punkte[0][0]).toEqual([60, 4, 200]);      // H1 fernes Ende
        expect(punkte[1][1]).toEqual([140, 6, 200]);     // H2 fernes Ende
    });

    it('als Forderung wandert nichts — nur der Anschlusspunkt wird festgelegt', () => {
        const el = mitVersatz();
        const eintraege = b.anwenden(el, { ost: el.lage.ost + 12, nord: el.lage.nord + 9, mitfuehren: 'forderung' });
        expect(eintraege.filter(e => e.art === 'erzeugt')).toHaveLength(0);
        expect(eintraege.filter(e => e.art === 'parametrik')).toHaveLength(2);
    });
});
