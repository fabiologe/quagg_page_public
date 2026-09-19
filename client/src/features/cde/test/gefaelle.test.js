// @vitest-environment jsdom
/**
 * Ein Gefälle, eine Rechnung (Teil XXIV, K5).
 *
 * Bis K5 rechneten fünf Stellen selbst, und nicht gegen dieselbe Länge:
 * Achsbeschriftung gegen die Weglänge in der Draufsicht, Befund, Längsschnitt-
 * Sicht und Vorschau gegen die gerade Sehne, „Strang-Gefälle setzen" verteilte
 * nach der räumlichen Länge. Die alten Rechnungen stehen hier eingefroren.
 *
 *   1. Gerade Haltungen (der Normalfall): alle alten Rechnungen und die neue
 *      sind zahlengleich — auf 500 Zufallsachsen.
 *   2. Haltungen mit Knick: es gilt die Weglänge. Die Sehne machte das
 *      Gefälle steiler — ein zu flaches Rohr mit Knick fiel durch den Befund.
 *   3. „Strang-Gefälle setzen": nach der waagerechten Länge verteilt, Sohlen
 *      als Sohlen, eigene Glieder bekommen ihren Bauplan fortgeschrieben.
 *   4. Die Anzeige in der Tafel: Sohle und Gefälle auch an einer eigenen Haltung.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { gefaelle, gefaellePromille, punkteDerAchse } from '../services/geometrie/Stationierung.js';
import { polylineGefaellePromille } from '../services/AxisAnnotations.js';
import { baueSicht } from '../services/LaengsschnittSicht.js';
import { befundeFuer } from '../services/Befunde.js';
import { nachId } from '../services/Bearbeitungen.js';
import { rezeptNach } from '../services/Bauteilrezepte.js';
import { achsAnzeige } from '../services/Achsanzeige.js';
import { KOMMANDO_SCHEMA } from '../services/kommando/Kommando.js';
import { subjektAusStand } from '../services/kommando/Subjekt.js';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
});

// ── Die alten Rechnungen, eingefroren (Stand vor K5) ────────────────────────
const ALT = {
    achsbeschriftung(pts) {
        let l2d = 0;
        for (let i = 0; i + 1 < pts.length; i++) l2d += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
        if (l2d < 1e-9) return null;
        const dy = (pts[0].y ?? 0) - (pts[pts.length - 1].y ?? 0);
        if (Math.abs(dy) < 1e-9) return null;
        return (dy / l2d) * 1000;
    },
    befund(a) {
        const laenge2d = Math.hypot(a.ende.x - a.anfang.x, a.ende.z - a.anfang.z);
        const bezug = laenge2d > 1e-6 ? laenge2d : a.laenge;
        return ((a.anfang.y - a.ende.y) / bezug) * 1000;
    },
    sicht(k, hA, hE) {
        const l = Math.hypot(k.ende.x - k.anfang.x, k.ende.z - k.anfang.z);
        return l > 0 ? ((hA - hE) / l) * 1000 : null;
    },
    vorschau(p1, p2) {
        return ((p1.y - p2.y) / Math.hypot(p2.x - p1.x, p2.z - p1.z)) * 1000;
    },
};

/** Ein fester Zufall (mulberry32) — derselbe Lauf bei jedem Test. */
function zufall(saat = 7) {
    let a = saat >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

describe('1 — gerade Haltungen: alte Rechnungen und die neue sind zahlengleich', () => {
    it('500 Zufallsachsen, vier alte Rechnungen', () => {
        const r = zufall();
        for (let n = 0; n < 500; n++) {
            const anfang = { x: r() * 200 - 100, y: 90 + r() * 20, z: r() * 200 - 100 };
            const ende = { x: anfang.x + (r() - 0.5) * 80, y: anfang.y + (r() - 0.7) * 2, z: anfang.z + (r() - 0.5) * 80 };
            const a = { anfang, ende, polyline: [anfang, ende], laenge: Math.hypot(ende.x - anfang.x, ende.y - anfang.y, ende.z - anfang.z) };
            const neu = gefaellePromille(punkteDerAchse(a));
            expect(polylineGefaellePromille(a.polyline)).toBeCloseTo(ALT.achsbeschriftung(a.polyline), 9);
            expect(neu).toBeCloseTo(ALT.befund(a), 9);
            const seg = baueSicht({ strang: [{ globalId: 'H', ...a }] }).segmente[0];
            expect(seg.gefaellePromille).toBeCloseTo(ALT.sicht(a, seg.geliefert.hA, seg.geliefert.hE), 9);
            expect(neu).toBeCloseTo(ALT.vorschau(anfang, ende), 9);
        }
    });

    it('waagerecht bleibt in der Anzeige „waagerecht", im Befund 0 ‰', () => {
        const pts = [{ x: 0, y: 5, z: 0 }, { x: 10, y: 5, z: 0 }];
        expect(polylineGefaellePromille(pts)).toBeNull();
        expect(gefaellePromille(pts)).toBe(0);
        const b = befundeFuer({ globalId: 'H', kategorie: 'IFCPIPESEGMENT', achse: { anfang: pts[0], ende: pts[1], polyline: pts, laenge: 10, dn: 300 } });
        expect(b.map(x => x.regel)).toContain('gefaelle_zu_flach');
    });
});

describe('2 — mit Knick: die Weglänge, nicht die Sehne', () => {
    // Ein L aus 20 m + 20 m, 12 cm Fall: 3,0 ‰ entlang der Haltung. Die Sehne
    // ist 28,28 m — dagegen 4,24 ‰, über dem Mindestgefälle für DN 300 (3,33 ‰).
    const L = [{ x: 0, y: 100, z: 0 }, { x: 20, y: 99.94, z: 0 }, { x: 20, y: 99.88, z: 20 }];
    const achse = { anfang: L[0], ende: L[2], polyline: L, laenge: 40, dn: 300 };

    it('die neue Rechnung misst 3,0 ‰; die Sehne hätte 4,24 ‰ gesagt', () => {
        expect(gefaellePromille(L)).toBeCloseTo(3, 9);
        expect(ALT.befund(achse)).toBeCloseTo(4.243, 3);
    });

    it('der Befund meldet das zu flache Rohr (vorher: nichts)', () => {
        const b = befundeFuer({ globalId: 'H', kategorie: 'IFCPIPESEGMENT', achse });
        const flach = b.filter(x => x.regel === 'gefaelle_zu_flach');
        expect(flach).toHaveLength(1);
        expect(flach[0].wert).toMatch(/^3[.,]0/);
    });

    it('festgelegte Fliessrichtung: die Punkte laufen mit — Gegengefälle, dieselbe Länge', () => {
        const b = befundeFuer({ globalId: 'H', kategorie: 'IFCPIPESEGMENT', achse, umgekehrt: true });
        const gegen = b.filter(x => x.regel === 'gefaelle_gegen');
        expect(gegen).toHaveLength(1);
        expect(gegen[0].wert).toMatch(/^-3[.,]0/);
    });

    it('der Längsschnitt stationiert entlang der Haltung — 40 m, 3,0 ‰', () => {
        const s = baueSicht({ strang: [{ globalId: 'H', anfang: L[0], ende: L[2], punkte: L, dn: 300 }] });
        expect(s.gesamt).toBeCloseTo(40, 9);
        expect(s.segmente[0].gefaellePromille).toBeCloseTo(3, 9);
    });
});

// ── Ein eigener Strang: A —H1→ B —H2→ C, H2 mit Knick ─────────────────────────
const kommando = (id, werkzeug, rest) => ({ schema: KOMMANDO_SCHEMA, id, werkzeug, ziel: [], wer: 'fabio', wann: '2026-09-19T09:00:00Z', ...rest });
const schacht = (id, gid, ost, sohle) => kommando(id, 'schacht-zeichnen', { neu: [gid], werte: { name: gid, kategorie: 'IFCDISTRIBUTIONCHAMBERELEMENT', hoehe: '', dn: 1000 },
    eingaben: { zug: [{ ost, nord: 0, hoehe: sohle }, { ost, nord: -0.001, hoehe: sohle + 2.5 }] } });
async function strang() {
    const b = useBearbeitung();
    for (const k of [
        schacht('ko-a', 'cde-A', 0, 100), schacht('ko-b', 'cde-B', 30, 99.9),
        // H1 fällt anfangs einen Meter — ihre RÄUMLICHE Länge ist damit länger
        // als die von H2, die waagerechte gleich: nur so unterscheiden sich
        // die beiden Verteilungen.
        kommando('ko-h1', 'rohr-zeichnen', { neu: ['cde-H1'], werte: { name: 'H1', kategorie: 'IFCPIPESEGMENT', hoehe: '', dn: 300 },
            eingaben: { zug: [{ ost: 0, nord: 0, hoehe: 100 }, { ost: 30, nord: 0, hoehe: 99.0 }] } }),
        // H2: 15 m nach Osten, dann 15 m nach Norden — 30 m Weglänge, 21,2 m Sehne.
        kommando('ko-h2', 'rohr-zeichnen', { neu: ['cde-H2'], werte: { name: 'H2', kategorie: 'IFCPIPESEGMENT', hoehe: '', dn: 300 },
            eingaben: { zug: [{ ost: 30, nord: 0, hoehe: 99.9 }, { ost: 45, nord: 0, hoehe: 99.85 }, { ost: 45, nord: 15, hoehe: 99.8 }] } }),
    ]) expect((await b.fuehreAus(k)).grund).toBe(null);
    const ae = useAenderungen();
    return { b, ae, plan: (gid) => ae.wirksamerStand('erzeugt').get(gid),
             subjekt: (gid) => subjektAusStand(gid, { wirksamerStand: ae.wirksamerStand }) };
}

describe('3 — „Strang-Gefälle setzen": Weglänge, Sohlen, eigene Glieder echt', () => {
    it('die Vorbelegung nennt die SOHLEN an Anfang und Ende des Strangs', async () => {
        const { subjekt } = await strang();
        expect(subjekt('cde-H1').strang.map(k => k.globalId)).toEqual(['cde-H1', 'cde-H2']);
        expect(nachId('strang-gefaelle-setzen').vorbelegung(subjekt('cde-H1'))).toEqual({ anfang: 100, ende: 99.8 });
    });

    it('gleichmässig über 60 m Weglänge: H1 und H2 je 30 m — und beide Baupläne werden fortgeschrieben', async () => {
        const { b, plan } = await strang();
        const erg = await b.fuehreAus(kommando('ko-s', 'strang-gefaelle-setzen', { ziel: ['cde-H1'], werte: { anfang: 100, ende: 99.7 } }));
        expect(erg.grund).toBe(null);
        expect(erg.eintraege.map(e => [e.globalId, e.art])).toEqual([['cde-H1', 'erzeugt'], ['cde-H2', 'erzeugt']]);
        const s = rezeptNach('rohr').sohlen;
        const h1 = s.lies(plan('cde-H1').parameter), h2 = s.lies(plan('cde-H2').parameter);
        expect(h1[0]).toBeCloseTo(100, 9);
        expect(h1[1]).toBeCloseTo(99.85, 9);                 // nach 30 von 60 m — mit der räumlichen Länge knapp daneben
        expect(h2[0]).toBeCloseTo(99.85, 9);
        expect(h2[1]).toBeCloseTo(99.775, 9);                 // der Knick liegt nach 15 m
        expect(h2[2]).toBeCloseTo(99.7, 9);
        expect(gefaellePromille(punkteDerAchse({ punkte: plan('cde-H2').parameter.punkte.map(([x, y, z]) => ({ x, y, z })) }))).toBeCloseTo(5, 9);
    });
});

describe('4 — die Anzeige in der Tafel', () => {
    it('an einer eigenen Haltung: Sohlen, Gefälle entlang der Achse, Herkunft Bauplan', async () => {
        const { subjekt } = await strang();
        const z = achsAnzeige(subjekt('cde-H2').achse, { hoehenversatz: 0 });
        expect(z).toMatchObject({ anfangNn: '99.90', endeNn: '99.80', gefaelle: '3,3 ‰', herkunft: 'aus dem Bauplan' });
        expect(achsAnzeige(subjekt('cde-H2').achse, { umgekehrt: true }).gefaelle).toBe('3,3 ‰');   // Betrag; die Richtung sagt der Befund
    });
});
