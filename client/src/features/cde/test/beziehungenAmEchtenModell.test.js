/**
 * Der Beziehungsindex am ECHTEN Netz (Teil XVII, B1).
 *
 * ENQUIER: 24 Haltungen, 27 Schächte, Anschlüsse in XY exakt. Der Index
 * muss dieselben Anschlüsse liefern wie `baueNetz` (derselbe Zulieferer —
 * ein zweiter Weg zu „wer hängt an wem" wäre die Fehlerklasse, gegen die
 * er gebaut ist), Nachbarn im Netz dürfen weder „Schnitt" noch „Nähe"
 * heissen, und die Überdeckung gegen eine bekannte Ebene muss stimmen.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import * as WebIFC from 'web-ifc';
import { IfcQuelle } from '../services/IfcQuelle.js';
import { extractAxisPolylines } from '../services/AxisAnnotations.js';
import { baueNetz } from '../services/Netztopologie.js';
import { baueBeziehungen, fasseZusammen } from '../services/Beziehungen.js';

const PFAD = '/mnt/storagebox/1_Projekte/01_Laufend/1337_Genau/CDE/6275_ENQUIER_0X_2026-08-31.ifc';

function huelleAus(positions) {
    let b = null;
    for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i], y = positions[i + 1], z = positions[i + 2];
        if (!b) b = { min: { x, y, z }, max: { x, y, z } };
        else {
            b.min.x = Math.min(b.min.x, x); b.min.y = Math.min(b.min.y, y); b.min.z = Math.min(b.min.z, z);
            b.max.x = Math.max(b.max.x, x); b.max.y = Math.max(b.max.y, y); b.max.z = Math.max(b.max.z, z);
        }
    }
    return b;
}

describe.runIf(fs.existsSync(PFAD))('Beziehungsindex am ENQUIER-Netz', () => {
    let q, objekte, netz, idx, hoechste;

    beforeAll(async () => {
        q = await IfcQuelle.oeffne(WebIFC, new Uint8Array(fs.readFileSync(PFAD)), { wasmPfad: 'node_modules/web-ifc/', name: 'ENQUIER' });
        const achsen = extractAxisPolylines(q);
        const schaechte = q.platzierungen(q.ids('IFCDISTRIBUTIONCHAMBERELEMENT', { untertypen: true }));
        objekte = [];
        hoechste = -Infinity;
        for (const a of achsen) {
            const z = q.zeile(a.expressId);
            const d = q.dreiecke(a.expressId);
            const huelle = d ? huelleAus(d.positions) : null;
            if (huelle) hoechste = Math.max(hoechste, huelle.max.y);
            objekte.push({ globalId: z.GlobalId.value, name: z.Name?.value ?? '', kategorie: 'IFCPIPESEGMENT',
                           achse: { punkte: a.polyline, dn: a.dn }, huelle, ort: { localId: a.expressId } });
        }
        for (const [id, punkt] of schaechte) {
            const z = q.zeile(id);
            const d = q.dreiecke(id);
            const huelle = d ? huelleAus(d.positions) : null;
            if (huelle) hoechste = Math.max(hoechste, huelle.max.y);
            objekte.push({ globalId: z.GlobalId.value, name: z.Name?.value ?? '', kategorie: 'IFCDISTRIBUTIONCHAMBERELEMENT',
                           knoten: punkt, huelle, ort: { localId: id } });
        }
        netz = baueNetz({
            kanten: achsen.map(a => ({ id: q.zeile(a.expressId).GlobalId.value, anfang: a.polyline[0], ende: a.polyline.at(-1) })),
            knoten: [...schaechte].map(([id, punkt]) => ({ id: q.zeile(id).GlobalId.value, punkt })),
        });
        idx = baueBeziehungen({ objekte, gelaende: { globalId: 'DGM', name: 'DGM', hoeheAn: () => hoechste + 1 } });
    }, 300000);

    afterAll(() => q?.schliesse());

    it('24 Haltungen, 27 Schächte, 48 Anschlüsse — jede Haltung an zwei Schächten', () => {
        expect(objekte.filter(o => o.achse)).toHaveLength(24);
        expect(objekte.filter(o => o.knoten)).toHaveLength(27);
        expect(idx.stand.arten.anschluss).toBe(48);
        for (const o of objekte.filter(o => o.achse)) {
            expect(idx.partner(o.globalId, 'anschluss')).toHaveLength(2);
        }
        expect(idx.stand.loseEnden).toBe(0);
    });

    it('derselbe Zulieferer: Anschluss für Anschluss wie baueNetz', () => {
        for (const [gid, k] of netz.kanten) {
            const partner = idx.partner(gid, 'anschluss');
            expect(partner.find(p => p.mass.ende === 'anfang').gid).toBe(k.von);
            expect(partner.find(p => p.mass.ende === 'ende').gid).toBe(k.nach);
        }
        for (const [gid, s] of netz.knoten) {
            const meine = idx.partner(gid, 'anschluss').map(p => p.gid).sort();
            expect(meine).toEqual([...s.kantenAn, ...s.kantenAb].sort());
        }
    });

    it('Nachbarn im Netz sind weder Schnitt noch Nähe noch Enthalten', () => {
        const nah = new Set();
        for (const r of idx.paare('anschluss')) nah.add(`${r.a}|${r.b}`).add(`${r.b}|${r.a}`);
        for (const r of idx.relationen.filter(r => ['schnitt', 'naehe', 'enthalten'].includes(r.art))) {
            expect(nah.has(`${r.a}|${r.b}`)).toBe(false);
        }
        // Und der Verbund einer Haltung ist ein ganzer Teilnetz-Strang, nie leer.
        const h = objekte.find(o => o.achse);
        expect(idx.verbund(h.globalId).size).toBeGreaterThan(2);
    });

    it('Überdeckung gegen eine Ebene 1 m über dem höchsten Punkt: jede Haltung liegt mindestens 1 m unter — und die Chips sagen es', () => {
        const auflagen = idx.paare('auflage');
        expect(auflagen.length).toBe(objekte.length);
        for (const r of auflagen) {
            expect(r.mass.ueberdeckung).toBeGreaterThanOrEqual(1 - 1e-6);
            expect(r.mass.lage).toBe('unter');
        }
        const h = objekte.find(o => o.achse);
        const texte = fasseZusammen(idx.von(h.globalId), h.globalId).map(c => c.text);
        expect(texte.some(t => /^2 Anschlüsse/.test(t))).toBe(true);
        expect(texte.some(t => /^Überdeckung/.test(t))).toBe(true);
    });

    it('der Aufbau ist billig — unter 50 ms für das ganze Netz', () => {
        expect(idx.stand.dauerMs).toBeLessThan(50);
    });
});
