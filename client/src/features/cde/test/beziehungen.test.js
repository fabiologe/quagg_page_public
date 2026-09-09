/**
 * Der Beziehungsindex (Teil XVII, B1) — rein.
 *
 * Die vier Inseln (Netztopologie, Kollisions-Hüllenschleife, Kanalgraben-
 * Überdeckung, Ableitungs-Rückwärtsindex) werden Leser EINER Ableitung.
 * Geprüft wird hier die Systematik: jede Art an einem kleinen Netz, der
 * Sweep gegen die Brute-Force-Paarung, der Dirty-Aufbau, der Verbund und
 * die Chips für die Oberfläche.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ARTEN, ARTEN_GEBAUT, VORGABEN, GELAENDE_ID, baueBeziehungen, fasseZusammen, stationAn } from '../services/Beziehungen.js';
import { baueNetz } from '../services/Netztopologie.js';
import { REGELWERK } from '../services/Befunde.js';

const WURZEL = fileURLToPath(import.meta.url).replace(/test[\/][^\/]+$/, '');
const p = (x, z, y = 0) => ({ x, y, z });
const box = (x0, y0, z0, x1, y1, z1) => ({ min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } });

/** Ein Strang H1–H3 an S1–S4 auf der X-Achse, DN 300, Sohle 10 → 7. */
function kanalnetz() {
    const rohr = (id, a, b) => ({
        globalId: id, name: id, kategorie: 'IFCPIPESEGMENT',
        achse: { punkte: [a, b], dn: 300 },
        huelle: box(Math.min(a.x, b.x), Math.min(a.y, b.y) - 0.15, -0.15, Math.max(a.x, b.x), Math.max(a.y, b.y) + 0.15, 0.15),
    });
    const schacht = (id, pt) => ({
        globalId: id, name: id, kategorie: 'IFCDISTRIBUTIONCHAMBERELEMENT', knoten: pt,
        huelle: box(pt.x - 0.5, pt.y - 0.2, pt.z - 0.5, pt.x + 0.5, pt.y + 2.5, pt.z + 0.5),
    });
    return [
        schacht('S1', p(0, 0, 10)), schacht('S2', p(50, 0, 9)), schacht('S3', p(100, 0, 8)), schacht('S4', p(150, 0, 7)),
        rohr('H1', p(0, 0, 10), p(50, 0, 9)), rohr('H2', p(50, 0, 9), p(100, 0, 8)), rohr('H3', p(100, 0, 8), p(150, 0, 7)),
    ];
}

describe('Die Systematik', () => {
    it('kennt zehn Arten, neun davon gebaut — stapel wartet auf das Straßenmodell', () => {
        expect(Object.keys(ARTEN)).toHaveLength(10);
        expect(ARTEN_GEBAUT).toHaveLength(9);
        expect(ARTEN_GEBAUT).not.toContain('stapel');
        for (const a of ARTEN_GEBAUT) expect(ARTEN[a]).toBeTruthy();
    });

    it('die Toleranzen sind Daten: das Regelwerk trägt sie, die Vorgaben stimmen überein', () => {
        expect(REGELWERK.netzToleranzM).toBe(VORGABEN.anschlussToleranzM);
        expect(REGELWERK.naeheSchwelleM).toBe(VORGABEN.naeheSchwelleM);
        expect(REGELWERK.stationAbstandM).toBe(VORGABEN.stationAbstandM);
    });
});

describe('anschluss — derselbe Zulieferer wie das Netz', () => {
    it('je Rohrende eine gerichtete Beziehung Rohr → Schacht mit Ende und Höhendifferenz', () => {
        const idx = baueBeziehungen({ objekte: kanalnetz() });
        expect(idx.stand.arten.anschluss).toBe(6);
        const s2 = idx.partner('S2', 'anschluss');
        expect(s2.map(x => `${x.gid}:${x.mass.ende}`).sort()).toEqual(['H1:ende', 'H2:anfang']);
        expect(s2.every(x => x.rolle === 'b')).toBe(true);
        const h1 = idx.partner('H1', 'anschluss');
        expect(h1.map(x => x.gid).sort()).toEqual(['S1', 'S2']);
        expect(h1.find(x => x.gid === 'S1').mass.dz).toBe(0);
    });

    it('stimmt mit baueNetz überein — Kante für Kante', () => {
        const objekte = kanalnetz();
        const idx = baueBeziehungen({ objekte });
        const netz = baueNetz({
            kanten: objekte.filter(o => o.achse).map(o => ({ id: o.globalId, anfang: o.achse.punkte[0], ende: o.achse.punkte[1] })),
            knoten: objekte.filter(o => o.knoten).map(o => ({ id: o.globalId, punkt: o.knoten })),
        });
        for (const [id, k] of netz.kanten) {
            const partner = idx.partner(id, 'anschluss');
            expect(partner.find(x => x.mass.ende === 'anfang')?.gid ?? null).toBe(k.von);
            expect(partner.find(x => x.mass.ende === 'ende')?.gid ?? null).toBe(k.nach);
        }
    });

    it('topologisch Nahes ist weder Schnitt noch Nähe — ein Rohr „kollidiert" nicht mit seinem Schacht', () => {
        const idx = baueBeziehungen({ objekte: kanalnetz() });
        expect(idx.paare('schnitt')).toEqual([]);
        expect(idx.paare('naehe')).toEqual([]);
        expect(idx.paare('enthalten')).toEqual([]);
    });

    it('der Verbund über Anschlüsse ist der ganze Strang', () => {
        const idx = baueBeziehungen({ objekte: kanalnetz() });
        expect([...idx.verbund('H2')].sort()).toEqual(['H1', 'H3', 'S1', 'S2', 'S3', 'S4']);
        expect(idx.verbund('S4').has('H1')).toBe(true);
    });
});

describe('kreuzung, station, naehe, enthalten, schnitt', () => {
    it('kreuzung: zwei Achsen, die sich im Grundriss schneiden — das Mass ist der Höhenabstand', () => {
        const objekte = [
            ...kanalnetz(),
            { globalId: 'W1', name: 'Wasser', achse: { punkte: [p(75, -10, 11.5), p(75, 10, 11.5)], dn: 150 } },
        ];
        const idx = baueBeziehungen({ objekte });
        const k = idx.paare('kreuzung');
        expect(k).toHaveLength(1);
        expect(new Set([k[0].a, k[0].b])).toEqual(new Set(['H2', 'W1']));
        const m = k[0].mass;
        // H2 liegt bei x=75 auf 8,5 m, W1 auf 11,5 m → H2 ist 3 m unter W1.
        const vorzeichen = k[0].a === 'H2' ? 1 : -1;
        expect(m.hoehenabstand * vorzeichen).toBeCloseTo(-3, 6);
        expect(m.winkelGrad).toBeCloseTo(90, 6);
        expect(m.punkt.x).toBeCloseTo(75, 9);
        // Station auf H2 (Anfang bei x=50): 25 m; auf W1 (Anfang z=−10): 10 m.
        const stH2 = k[0].a === 'H2' ? m.stationA : m.stationB;
        const stW1 = k[0].a === 'H2' ? m.stationB : m.stationA;
        expect(stH2).toBeCloseTo(25, 6);
        expect(stW1).toBeCloseTo(10, 6);
        // Parallel oder nur berührend zählt nicht.
        expect(idx.paare('kreuzung').some(r => r.a === 'H1' && r.b === 'H2')).toBe(false);
    });

    it('station: ein Schacht mitten auf der Haltung ohne Anschluss — der fehlende Teilungspunkt', () => {
        const objekte = [
            ...kanalnetz(),
            { globalId: 'SX', name: 'SX', knoten: p(70, 0.2, 8.6), huelle: box(69.5, 8.4, -0.3, 70.5, 11, 0.7) },
        ];
        const idx = baueBeziehungen({ objekte });
        const st = idx.paare('station');
        expect(st).toHaveLength(1);
        expect(st[0]).toMatchObject({ a: 'SX', b: 'H2' });
        expect(st[0].mass.station).toBeCloseTo(20, 6);
        expect(st[0].mass.quer).toBeCloseTo(0.2, 6);
        // SX hängt an nichts an — kein Anschluss (die Toleranz ist 1 mm).
        expect(idx.partner('SX', 'anschluss')).toEqual([]);
        // Und die Chips sagen es dem Menschen.
        expect(fasseZusammen(idx.von('SX'), 'SX').map(c => c.text)).toContain('an H2, St. 20,00 m');
        expect(fasseZusammen(idx.von('H2'), 'H2').map(c => c.text)).toContain('1 an der Achse (SX)');
    });

    it('station: ein Schacht AM ENDE ist Anschluss, nie Station', () => {
        const idx = baueBeziehungen({ objekte: kanalnetz() });
        expect(idx.paare('station')).toEqual([]);
    });

    it('naehe: nur topologisch Fremde, nur unter der Schwelle', () => {
        const objekte = [
            ...kanalnetz(),
            // Eine fremde Leitung parallel zu H1, 0,4 m daneben — nah. Und eine 2 m weiter — nicht.
            { globalId: 'G1', name: 'Gas', huelle: box(10, 9.3, 0.55, 40, 9.5, 0.75) },
            { globalId: 'G2', name: 'Gas fern', huelle: box(10, 9.3, 2.2, 40, 9.5, 2.4) },
        ];
        const idx = baueBeziehungen({ objekte });
        const n = idx.paare('naehe');
        expect(n).toHaveLength(1);
        expect(new Set([n[0].a, n[0].b])).toEqual(new Set(['H1', 'G1']));
        // H1 ist ein Lauf: Achse bei z=0, Radius 0,15, Gas ab z=0,55 → 0,40 m Körperabstand, Güte `form`.
        expect(n[0].mass.abstand).toBeCloseTo(0.4, 9);
        expect(n[0].guete).toBe('form');
        // Die Schwelle ist ein Datum: mit 3 m sind es drei (H1–G1, H1–G2, G1–G2).
        expect(baueBeziehungen({ objekte, regeln: { naeheSchwelleM: 3 } }).paare('naehe')).toHaveLength(3);
    });

    it('enthalten: das Rohr liegt im Graben; schnitt: das Fundament überschneidet die Haltung', () => {
        const objekte = [
            ...kanalnetz(),
            { globalId: 'GR', name: 'Graben', herkunft: 'cde', huelle: box(-1, 5, -1, 151, 13, 1) },
            { globalId: 'F1', name: 'Fundament', huelle: box(20, 9, -0.1, 24, 12, 0.9) },
        ];
        const idx = baueBeziehungen({ objekte });
        const drin = idx.paare('enthalten').map(r => `${r.a}⊂${r.b}`).sort();
        // Alle Rohre UND Schächte UND das Fundament liegen im Graben.
        expect(drin).toEqual(['F1⊂GR', 'H1⊂GR', 'H2⊂GR', 'H3⊂GR', 'S1⊂GR', 'S2⊂GR', 'S3⊂GR', 'S4⊂GR']);
        const s = idx.paare('schnitt');
        expect(s).toHaveLength(1);
        expect(new Set([s[0].a, s[0].b])).toEqual(new Set(['H1', 'F1']));
        expect(s[0].mass.volumenHuelle).toBeGreaterThan(0);
        expect(fasseZusammen(idx.von('H1'), 'H1').find(c => c.art === 'schnitt')).toMatchObject({ warnung: true, text: 'schneidet Fundament' });
        expect(fasseZusammen(idx.von('GR'), 'GR').find(c => c.art === 'enthalten').text).toMatch(/^enthält 8 /);
    });
});

describe('Läufe mit echtem Abstand — die Hülle eines schrägen Rohrs ist kein Beleg', () => {
    const rohr = (id, a, b, dn = 300) => ({
        globalId: id, name: id, achse: { punkte: [a, b], dn },
        huelle: box(Math.min(a.x, b.x) - 0.15, Math.min(a.y, b.y) - 0.15, Math.min(a.z, b.z) - 0.15,
                    Math.max(a.x, b.x) + 0.15, Math.max(a.y, b.y) + 0.15, Math.max(a.z, b.z) + 0.15),
    });

    it('zwei schräge Rohre mit überlappenden Hüllen, deren Achsen 3 m auseinanderliegen: kein Schnitt, keine Nähe', () => {
        const idx = baueBeziehungen({ objekte: [rohr('A', p(0, 0, 10), p(40, 40, 10)), rohr('B', p(0, 40, 10), p(40, 0, 13.3))] });
        expect(idx.paare('schnitt')).toEqual([]);
        expect(idx.paare('naehe')).toEqual([]);
        // Im Grundriss kreuzen sie sich — das bleibt eine Kreuzung mit Höhenabstand.
        expect(idx.paare('kreuzung')).toHaveLength(1);
        expect(Math.abs(idx.paare('kreuzung')[0].mass.hoehenabstand)).toBeCloseTo(1.65, 6);
    });

    it('zwei Rohre, die sich wirklich durchdringen: Schnitt in Form-Güte, mit Abstand und Ort', () => {
        const idx = baueBeziehungen({ objekte: [rohr('A', p(0, 0, 10), p(40, 40, 10)), rohr('B', p(0, 40, 10.1), p(40, 0, 10.1))] });
        const s = idx.paare('schnitt');
        expect(s).toHaveLength(1);
        expect(s[0].guete).toBe('form');
        expect(s[0].mass.abstand).toBeCloseTo(0.1, 6);
        expect(s[0].mass.punkt.x).toBeCloseTo(20, 6);
        expect(fasseZusammen(idx.von('A'), 'A').find(c => c.art === 'schnitt')).toMatchObject({ warnung: true, text: 'schneidet B' });
    });

    it('nahe, aber nicht berührend: die Nähe rechnet Körper zu Körper (Radien abgezogen)', () => {
        // Achsen 0,55 m auseinander, Radien 0,15 + 0,15 → Körperabstand 0,25 m < Schwelle 0,5.
        const idx = baueBeziehungen({ objekte: [rohr('A', p(0, 0, 10), p(40, 0, 10)), rohr('B', p(0, 0.55, 10), p(40, 0.55, 10))] });
        expect(idx.paare('schnitt')).toEqual([]);
        const n = idx.paare('naehe');
        expect(n).toHaveLength(1);
        expect(n[0].mass.abstand).toBeCloseTo(0.25, 6);
        expect(n[0].guete).toBe('form');
    });

    it('Rohr durchs Fundament = Schnitt; Rohr im Graben = Enthalten — beides Form-Güte', () => {
        const objekte = [
            rohr('H', p(0, 0, 10), p(50, 0, 9)),
            { globalId: 'F', name: 'Fundament', huelle: box(20, 9, -1, 24, 12, 1) },
            { globalId: 'GR', name: 'Graben', huelle: box(-1, 7, -1, 51, 12, 1) },
        ];
        const idx = baueBeziehungen({ objekte });
        expect(idx.paare('schnitt').map(r => `${[r.a, r.b].sort().join('|')}:${r.guete}`)).toEqual(['F|H:form']);
        const drin = idx.paare('enthalten');
        expect(drin.map(r => `${r.a}⊂${r.b}:${r.guete}`).sort()).toEqual(['F⊂GR:huelle', 'H⊂GR:form']);
    });

    it('ein Rohr, das knapp am Fundament vorbeiläuft, ist nah — nicht Schnitt', () => {
        const objekte = [rohr('H', p(0, 0, 10), p(50, 0, 10)), { globalId: 'F', name: 'Fundament', huelle: box(20, 9, 0.4, 24, 12, 3) }];
        const idx = baueBeziehungen({ objekte });
        expect(idx.paare('schnitt')).toEqual([]);
        // Achse bei z=0, Box ab z=0,4, Radius 0,15 → 0,25 m.
        expect(idx.paare('naehe')[0].mass.abstand).toBeCloseTo(0.25, 6);
    });

    it('Körper gegen Körper bleibt Hüllen-Güte — und die Chips nennen es einen Kandidaten, keine Warnung', () => {
        const objekte = [{ globalId: 'A', name: 'A', huelle: box(0, 0, 0, 2, 2, 2) }, { globalId: 'B', name: 'B', huelle: box(1, 1, 1, 3, 3, 3) }];
        const idx = baueBeziehungen({ objekte });
        expect(idx.paare('schnitt')[0].guete).toBe('huelle');
        expect(fasseZusammen(idx.von('A'), 'A')).toEqual([{ art: 'schnitt', text: 'Hülle berührt B' }]);
    });
});

describe('auflage — gegen den Sampler', () => {
    const ebene = (h) => (x, z) => (x >= -5 && x <= 200 ? h : NaN);

    it('Rohr: Scheitel gegen Gelände an Stützpunkten und Segmentmitten; Schacht: Deckel „auf"', () => {
        const idx = baueBeziehungen({ objekte: kanalnetz(), gelaende: { globalId: 'DGM', name: 'DGM', hoeheAn: ebene(12.5) } });
        const h1 = idx.partner('H1', 'auflage')[0];
        expect(h1.gid).toBe('DGM');
        // Scheitel am Anfang: 10 + 0,15 → Überdeckung 2,35 (das Minimum, Sohle fällt nach Osten).
        expect(h1.mass.ueberdeckung).toBeCloseTo(2.35, 9);
        expect(h1.mass.lage).toBe('unter');
        const s1 = idx.partner('S1', 'auflage')[0];
        expect(s1.mass.lage).toBe('auf');            // Deckel bei 12,5 = Gelände
        expect(fasseZusammen(idx.von('H1'), 'H1').map(c => c.text)).toContain('Überdeckung 2,35 m');
        expect(fasseZusammen(idx.von('S1'), 'S1').map(c => c.text)).toContain('auf dem Gelände');
    });

    it('ohne Treffer keine Beziehung — NaN wird nicht zu 0', () => {
        const objekte = [{ globalId: 'X', achse: { punkte: [p(300, 0, 1), p(310, 0, 1)], dn: 200 } }];
        const idx = baueBeziehungen({ objekte, gelaende: { hoeheAn: ebene(5) } });
        expect(idx.paare('auflage')).toEqual([]);
    });

    it('ohne Sampler keine auflage, ohne Gelände-Kennung die Pseudo-Kennung', () => {
        expect(baueBeziehungen({ objekte: kanalnetz() }).paare('auflage')).toEqual([]);
        const idx = baueBeziehungen({ objekte: kanalnetz(), gelaende: { hoeheAn: ebene(20) } });
        expect(idx.paare('auflage')[0].b).toBe(GELAENDE_ID);
        // Der Verbund läuft DURCH den Pseudo-Knoten (so findet `gruppe` alle
        // Mitglieder) — „über die Auflage verbunden" heisst: alles auf demselben
        // Gelände. Der Pseudo-Knoten selbst ist kein Objekt und fehlt im Ergebnis.
        const v = idx.verbund('H1', ['auflage']);
        expect(v.size).toBe(6);
        expect(v.has(GELAENDE_ID)).toBe(false);
    });
});

describe('ableitung und gruppe — erklärt, nicht gemessen', () => {
    it('Teil → Quelle aus dem Journal, Mitglied → Gruppe aus IFC; der Verbund über die Gruppe findet alle Mitglieder', () => {
        const idx = baueBeziehungen({
            objekte: kanalnetz(),
            ableitungen: [{ teil: 'GR', quelle: 'H1', teilName: 'Graben' }, { teil: 'GR', quelle: 'DGM0' }],
            gruppen: new Map([['H1', ['KR']], ['H2', ['KR']], ['H3', ['KW']]]),
        });
        expect(idx.partner('H1', 'ableitung')).toEqual([expect.objectContaining({ gid: 'GR', name: 'Graben', rolle: 'b' })]);
        expect(idx.partner('GR', 'ableitung').map(x => x.gid).sort()).toEqual(['DGM0', 'H1']);
        expect(fasseZusammen(idx.von('H1'), 'H1').map(c => c.text)).toContain('1 Ableitung');
        expect([...idx.verbund('H1', ['gruppe'])].sort()).toEqual(['H2']);
        expect(fasseZusammen(idx.von('H3'), 'H3').map(c => c.text)).toContain('Gruppe KW');
    });
});

describe('Sweep und Dirty-Aufbau', () => {
    function zufall(n, seed = 7) {
        let s = seed;
        const r = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
        const out = [];
        for (let i = 0; i < n; i++) {
            const x = r() * 150, y = r() * 20, z = r() * 150;
            out.push({ globalId: `B${i}`, huelle: box(x, y, z, x + 1 + r() * 6, y + 1 + r() * 3, z + 1 + r() * 6) });
        }
        return out;
    }
    const paarschluessel = (r) => [r.a, r.b].sort().join('|');

    it('der Sweep findet genau die Paare der Brute-Force-Prüfung (Schnitt, Enthalten, Nähe)', () => {
        const objekte = zufall(400);
        const idx = baueBeziehungen({ objekte });
        const ausSweep = new Set(idx.relationen.filter(r => ['schnitt', 'enthalten', 'naehe'].includes(r.art)).map(paarschluessel));
        const brute = new Set();
        const abstand = (a, b) => Math.hypot(
            Math.max(0, b.min.x - a.max.x, a.min.x - b.max.x),
            Math.max(0, b.min.y - a.max.y, a.min.y - b.max.y),
            Math.max(0, b.min.z - a.max.z, a.min.z - b.max.z));
        for (let i = 0; i < objekte.length; i++) for (let j = i + 1; j < objekte.length; j++) {
            if (abstand(objekte[i].huelle, objekte[j].huelle) <= VORGABEN.naeheSchwelleM) brute.add(`${objekte[i].globalId}|${objekte[j].globalId}`.split('|').sort().join('|'));
        }
        expect(brute.size).toBeGreaterThan(20);
        expect(ausSweep).toEqual(brute);
    });

    it('dirty: nur Paare mit einem bewegten Objekt werden neu gerechnet, der Rest bleibt DASSELBE Objekt', () => {
        const objekte = zufall(200);
        const vorher = baueBeziehungen({ objekte, gelaende: { hoeheAn: () => 100 } });
        // B5 wandert weit weg; alles andere bleibt.
        const bewegt = objekte.map(o => (o.globalId === 'B5' ? { ...o, huelle: box(900, 0, 900, 902, 2, 902) } : o));
        const hoeheAn = vi.fn(() => 100);
        const nachher = baueBeziehungen({ objekte: bewegt, gelaende: { hoeheAn }, vorher, dirty: new Set(['B5']) });
        expect(nachher.stand.teilweise).toBe(true);
        expect(nachher.von('B5').filter(r => r.art !== 'auflage')).toEqual([]);
        // Der Sampler lief NUR für B5 (ein Objekt ohne Achse = ein Aufruf).
        expect(hoeheAn).toHaveBeenCalledTimes(1);
        // Alles Übrige ist identisch mit dem vollen Neuaufbau — und dieselben Objekte wie vorher.
        const voll = baueBeziehungen({ objekte: bewegt, gelaende: { hoeheAn: () => 100 } });
        const ohneB5 = (i) => i.relationen.filter(r => r.a !== 'B5' && r.b !== 'B5').map(r => `${r.art}:${paarschluessel(r)}`).sort();
        expect(ohneB5(nachher)).toEqual(ohneB5(voll));
        const alt = vorher.relationen.find(r => r.art === 'schnitt' && r.a !== 'B5' && r.b !== 'B5');
        expect(nachher.relationen).toContain(alt);
    });

    it('dirty: ein verschwundenes Objekt nimmt seine Beziehungen mit', () => {
        const objekte = kanalnetz();
        const vorher = baueBeziehungen({ objekte: [...objekte, { globalId: 'F1', huelle: box(20, 9, -0.1, 24, 12, 3) }] });
        expect(vorher.paare('schnitt')).toHaveLength(1);
        const nachher = baueBeziehungen({ objekte, vorher, dirty: new Set(['F1']) });
        expect(nachher.paare('schnitt')).toEqual([]);
        expect(nachher.von('F1')).toEqual([]);
    });

    it('stationAn: Station und Querabstand auf einer geknickten Polylinie', () => {
        const st = stationAn([p(0, 0, 0), p(10, 0, 0), p(10, 10, 0)], { x: 11, z: 4 });
        expect(st.station).toBeCloseTo(14, 9);
        expect(st.quer).toBeCloseTo(1, 9);
        expect(st.laenge).toBeCloseTo(20, 9);
    });
});

describe('Wächter', () => {
    it('der Dienst ist rein: kein three, kein Vue, keine Engine — und er rechnet keine Körper (das ist der Server)', () => {
        const code = readFileSync(WURZEL + 'services/Beziehungen.js', 'utf8');
        expect(code).not.toMatch(/from ['"]three['"]|from ['"]vue['"]|IfcEngine|@thatopen/);
        expect(code).not.toMatch(/booleSchnitt|kernel\.op\(/);
    });
});
