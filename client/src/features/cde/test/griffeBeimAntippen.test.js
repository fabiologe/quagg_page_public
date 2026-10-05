// @vitest-environment jsdom
/**
 * Teil XXXI, T3 — Griffe beim Antippen (Fabio 2026-10-05, E-T1: „Griffe sofort beim Antippen — … beim Bearbeiten …
 * dort wäre es eigentlich sinnvoll").
 *
 * Tabletlauf T0: antippen wählt die Wand, Griffe danach 0; bis zu einem Griff 2 Tipps („Lage" aufklappen,
 * „Verschieben"), und es stand immer nur die EINE Familie des scharfen Werkzeugs. Jetzt: im Bearbeiten-Modus stehen
 * nach dem Antippen alle Griffe des Bauteils; ein Zug schaltet das Werkzeug seines Griffs scharf und kehrt danach zu
 * allen Griffen zurück (keine Serie). Kommt der Zug aus der Tafel (Werkzeug schon scharf), bleibt es bei der Serie (K5).
 *
 * Echter Weg: RÜB über Kommandos, Einordnung über den Store wie im Viewer (Subjekt aus dem Stand), `useGriffe` mit
 * einer Engine-Attrappe, die nur Zeichnen und Strahl liefert; geschrieben wird über das Journal.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { nextTick, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useIfcStore } from '../stores/useIfcStore.js';
import { subjektAusStand } from '../services/kommando/Subjekt.js';
import { CDE_MODELL_ID } from '../services/IfcAutor.js';
import { griffFamilie, griffeFrei } from '../services/Griffe.js';
import { registriereRezepte } from '../services/katalog/Katalog.js';
import { useGriffe } from '../composables/useGriffe.js';
import { RUEB } from './hilfen/ruebKommandos.js';

class Speicher {
    constructor() { this.daten = new Map(); }
    async get(k) { return this.daten.has(k) ? JSON.parse(this.daten.get(k)) : null; }
    async set(k, v) { this.daten.set(k, JSON.stringify(v)); return true; }
    async delete(k) { this.daten.delete(k); return true; }
    async listKeys(p) { return [...this.daten.keys()].filter(k => k.startsWith(p)); }
    async getBlob() { return null; }
    async setBlob() { return false; }
    async deleteBlob() { return false; }
    async listBlobs() { return []; }
}

let b, ae;
beforeEach(async () => {
    repo.setBackend(new Speicher()); setActivePinia(createPinia());
    b = useBearbeitung(); ae = useAenderungen();
    for (const k of RUEB()) {
        const erg = await b.fuehreAus(k);
        if (!erg.ausgefuehrt) throw new Error(`${k.werkzeug}: ${erg.grund}`);
    }
    useIfcStore().modelList.push({ modelId: CDE_MODELL_ID, name: 'Eigenbau' });
});
afterEach(() => { repo.setBackend(null); registriereRezepte([]); });

const plan = (gid) => ae.wirksamerStand('erzeugt').get(gid);

function aufbau() {
    const e = {
        knotenGriffe: () => [], schachtAnschluesse: () => [],
        zeigeGriffe: vi.fn(), griffUnter: vi.fn(() => null), griffHervorheben: vi.fn(), griffVersetzen: vi.fn(),
        zeigeZugbild: vi.fn(), overlayZeige: vi.fn(), overlayLeere: vi.fn(), geistLeeren: vi.fn(),
        blickrichtung: () => ({ x: 0, y: -1, z: 0 }),
        // Ein senkrechter Strahl: Bildschirm x/y = Welt x/z.
        strahl: (x, y) => ({ origin: { x, y: 500, z: y }, direction: { x: 0, y: -1, z: 0 } }),
    };
    const nachBauen = vi.fn(async () => ({ angewandt: true }));
    const g = useGriffe({
        engine: ref(e), bearbeitung: b, aenderungen: ae,
        getSubjekt: () => b.bauteil, getTypprofil: () => b.typprofil, getBauform: () => b.einordnung?.bauform ?? null,
        getVersatz: () => ({ x: 0, y: 0, z: 0 }), getHoehenversatz: () => 0,
        holeKnotenSubjekt: async () => null, nachBauen, getWer: () => 'Fabio', melde: vi.fn(),
        farben: () => ({ accent: '#0af', warn: '#fa0', ok: '#0f0', danger: '#f00' }),
    });
    return { e, g, nachBauen };
}

/** Antippen wie im Viewer: das eigene Bauteil wird mit seinem Subjekt aus dem Stand eingeordnet. */
async function tippeAn(gid) {
    const s = subjektAusStand(gid, { wirksamerStand: ae.wirksamerStand });
    await b.einordne({ ...s, modelId: CDE_MODELL_ID, localId: 7, category: plan(gid).kategorie, type: plan(gid).kategorie }, null);
}

const familien = (gs) => new Set(gs.map(x => griffFamilie(x.werkzeug)));

/** Einen XZ-Griff um `dx` Meter nach Osten ziehen — über greifen/zugStart/zugBewegt/zugEnde. */
async function ziehe(t, griff, dx) {
    t.e.griffUnter.mockReturnValue(griff.key);
    const p = griff.pos;
    expect(t.g.greifen({ x: p.x, y: p.z, typ: 'mouse' })).toBe(true);
    t.g.zugStart({ x: p.x, y: p.z, px: { x: 0, y: 0 }, typ: 'mouse' });
    const scharfImZug = b.scharfId;
    t.g.zugBewegt({ x: p.x + dx, y: p.z, px: { x: 40, y: 0 }, typ: 'mouse', altKey: true });
    await t.g.zugEnde({ abbruch: false });
    return scharfImZug;
}

describe('im Bearbeiten-Modus: antippen zeigt ALLE Griffe des Bauteils', () => {
    it('Wand angetippt: Punkte, Kanten, Drehen, Höhe und Dicke zugleich — vorher 0 Griffe ohne Werkzeug', async () => {
        const t = aufbau();
        b.modusSetzen(true);
        await tippeAn('cde-LN');
        t.g.neuBauen();
        const gs = t.g.griffe.value;
        expect(gs.length).toBeGreaterThanOrEqual(9);
        expect(gs.every(x => x.globalId === 'cde-LN')).toBe(true);
        const f = familien(gs);
        for (const name of ['punkte', 'drehen', 'feld:wand-wandhoehe-setzen', 'feld:wand-dicke-setzen']) expect(f.has(name), name).toBe(true);
        expect(t.e.zeigeGriffe).toHaveBeenLastCalledWith(gs, expect.objectContaining({ radius: 'auto' }));
    });

    it('ohne Bearbeiten-Modus wählt ein Tipp nur aus; im Modus ohne Bauteil steht nichts', async () => {
        const t = aufbau();
        await tippeAn('cde-LN');
        t.g.neuBauen();
        expect(t.g.griffe.value).toHaveLength(0);
        b.modusSetzen(true);
        await b.einordne(null);
        t.g.neuBauen();
        expect(t.g.griffe.value).toHaveLength(0);
    });

    it('ein scharfes Werkzeug zeigt weiter nur SEINE Familie; „Ecken ziehen" weiter nur Ecken', async () => {
        const t = aufbau();
        b.modusSetzen(true);
        await tippeAn('cde-LN');
        expect(b.starte('drehen', { subjekt: b.bauteil })).toBeTruthy();
        t.g.neuBauen();
        expect([...familien(t.g.griffe.value)]).toEqual(['drehen']);
        // Der Längsschnitt (Sohlgriffe ohne Subjekt) braucht weiter sein Werkzeug.
        expect(griffeFrei({ modusAn: true, scharfId: null }, { werkzeug: 'sohle-ziehen', art: 'sohle' })).toBe(false);
    });
});

describe('ein Zug aus „alle Griffe": Werkzeug des Griffs, danach wieder alle Griffe', () => {
    it('Eckpunkt 0,5 m gezogen: schreibt über das Journal, ohne Serie, und alle Familien stehen wieder', async () => {
        const t = aufbau();
        b.modusSetzen(true);
        await tippeAn('cde-LN');
        t.g.neuBauen();
        const ecke = t.g.griffe.value.find(x => x.werkzeug === 'stuetzpunkt-verschieben');
        const vorher = plan('cde-LN').parameter.punkte.map(p => [...p]);
        const scharfImZug = await ziehe(t, ecke, 0.5);
        expect(scharfImZug).toBe('stuetzpunkt-verschieben');                     // der Griff hat sein Werkzeug scharf geschaltet
        expect(t.nachBauen).toHaveBeenCalledWith(expect.anything(), 'stuetzpunkt-verschieben', { serie: false });
        const nachher = plan('cde-LN').parameter.punkte;
        const verschoben = nachher.filter((p, i) => Math.abs(p[0] - vorher[i][0] - 0.5) < 1e-6);
        expect(verschoben).toHaveLength(1);
        expect(b.scharfId).toBe(null);
        expect(familien(t.g.griffe.value).size).toBeGreaterThanOrEqual(4);       // zurück zu allen Griffen
    });

    it('aus der Tafel (Werkzeug schon scharf): Serie wie bisher (K5)', async () => {
        const t = aufbau();
        b.modusSetzen(true);
        await tippeAn('cde-LN');
        expect(b.starte('stuetzpunkt-verschieben', { subjekt: b.bauteil })).toBeTruthy();
        t.g.neuBauen();
        const ecke = t.g.griffe.value.find(x => x.werkzeug === 'stuetzpunkt-verschieben');
        await ziehe(t, ecke, 0.5);
        expect(t.nachBauen).toHaveBeenCalledWith(expect.anything(), 'stuetzpunkt-verschieben', { serie: true });
    });
});

describe('während der Übernahme bleibt das Griffbild stehen', () => {
    it('ein Werkzeugwechsel im Umbau baut nicht um — erst, wenn der Umbau endet (vorher: 4 → 13 → 4 Griffe)', async () => {
        const t = aufbau();
        b.modusSetzen(true);
        await tippeAn('cde-LN');
        t.g.neuBauen();
        const vorher = t.g.griffe.value;
        let los;
        const umbau = b.imUmbau(() => new Promise(r => { los = r; }));
        expect(b.starte('drehen', { subjekt: b.bauteil })).toBeTruthy();
        t.g.neuBauen();
        await nextTick();
        expect(t.g.griffe.value).toBe(vorher);                                    // dasselbe Bild, nicht neu gebaut
        los(); await umbau; await nextTick();
        expect([...familien(t.g.griffe.value)]).toEqual(['drehen']);
    });
});

describe('der Viewer setzt die Serie nur fort, wenn der Griff aus der Tafel kam', () => {
    it('`nachBauenMitMeldung` nimmt `serie` und ruft `_serieFortsetzen` nur damit; beide Motoren reichen es durch', () => {
        const v = readFileSync(fileURLToPath(import.meta.url).replace(/test[\/][^\/]+$/, 'components/IfcViewer.vue'), 'utf8');
        expect(v).toContain('async function nachBauenMitMeldung(eintraege, werkzeugId = null, { serie = true } = {}) {');
        expect(v).toContain('if (serie) nextTick(() => _serieFortsetzen(werkzeugId, gid));');
        expect(v.match(/nachBauen: \(eintraege, werkzeugId, opt\) => nachBauenMitMeldung\(eintraege, werkzeugId, opt\)/g)).toHaveLength(2);
    });
});
