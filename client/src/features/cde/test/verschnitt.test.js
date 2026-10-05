// @vitest-environment jsdom
/**
 * Teil XXXII, O1 — zwei eigene Körper verschneiden (Fabio 2026-10-05: „zwei Objekte miteinander verschneiden";
 * entschieden: ein LEBENDES Rezept wie die Aussparung, A und B verborgen, Klasse von A).
 *
 * Echter Weg: Wand und Platte über Kommandos, „Verschneiden" über `fuehreAus` ins Journal, der Ableitungslauf mit
 * dem echten Stand; nur der Server-Kernel (trimesh) ist eine Attrappe, die festhält, womit er gerufen wurde.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { nachId, passende } from '../services/Bearbeitungen.js';
import { rezeptNach } from '../services/Bauteilrezepte.js';
import { neuerAbleitungslauf } from '../services/ableitung/Ableitungslauf.js';
import { rezepteOhneDeklaration } from '../services/JournalVersatz.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { extrudiere } from '../services/geometrie/ops/Sweep.js';
import { kommando } from './hilfen/ruebKommandos.js';
import { Speicher } from './hilfen/vorlagenKommandos.js';

let b, ae;
const e = (ost, nord, hoehe) => ({ ost, nord, hoehe });
beforeEach(async () => {
    repo.setBackend(new Speicher()); setActivePinia(createPinia());
    b = useBearbeitung(); ae = useAenderungen();
    for (const k of [
        kommando('wand-zeichnen', { neu: ['cde-W'], werte: { name: 'Wand', kategorie: 'IFCWALL', hoehe: '', dicke: 0.3, wandhoehe: 2.5 },
                                    eingaben: { zug: [e(0, 0, 100), e(6, 0, 100)] } }),
        kommando('platte-zeichnen', { neu: ['cde-P'], werte: { name: 'Sockel', kategorie: 'IFCSLAB', hoehe: '', dicke: 0.4 },
                                      eingaben: { umriss: [e(-1, 1, 100), e(7, 1, 100), e(7, -1, 100), e(-1, -1, 100)] } }),
    ]) {
        const r = await b.fuehreAus(k);
        if (!r.ausgefuehrt) throw new Error(r.grund);
    }
});
afterEach(() => repo.setBackend(null));

const verschneide = (art = 'vereinigung', ziel = 'cde-W', mit = 'cde-P') =>
    b.fuehreAus(kommando('verschneiden', { ziel: [ziel], werte: { mit, art } }), { kennungsgeber: (a) => `${a === 'operation' ? 'op' : 'cde'}-v${Math.random().toString(36).slice(2, 8)}` });
const teil = () => [...ae.wirksamerStand('erzeugt')].find(([, p]) => p?.rezept === 'verschnitt');
const KASTEN = extrudiere({ umriss: { ring: [{ x: -1, z: -1 }, { x: 7, z: -1 }, { x: 7, z: 1 }, { x: -1, z: 1 }] } }, { von: 99.6, bis: 102.5 }).ergebnis;

function lauf(server) {
    return neuerAbleitungslauf({ stand: ae.wirksamerStand('erzeugt'), rezeptNach, holeQuellForm: async () => null,
                                 kernel: erzeugeKernel({ server }) });
}

describe('der Katalog', () => {
    it('„Verschneiden" an jedem eigenen Körper; der zweite Körper aus den Kandidaten (wie „Steht auf"); drei Arten', () => {
        for (const bauform of ['koerper', 'flaeche+dicke', 'achse+profil']) {
            expect(passende({ bauform, guete: 'gemessen' }, { eigenes: true }).map(w => w.id), bauform).toContain('verschneiden');
        }
        expect(passende({ bauform: 'linie', guete: 'gemessen' }, { eigenes: true }).map(w => w.id)).not.toContain('verschneiden');
        const w = nachId('verschneiden');
        expect(w.felder.find(f => f.name === 'mit')).toMatchObject({ optionenAus: 'eigene:traeger', aus: { geste: 'auswahl' } });
        expect(w.felder.find(f => f.name === 'art').optionen.map(o => o.wert)).toEqual(['vereinigung', 'schnitt', 'differenz']);
        for (const feld of ['verschiebe', 'fachmodell', 'beschreibe']) expect(rezepteOhneDeklaration(feld)).not.toContain('verschnitt');
    });
});

describe('das Kommando', () => {
    it('Wand ∪ Sockel: beide verborgen, EIN neues Teil mit beiden als Quellen und der Klasse der Wand — ein Vorgang', async () => {
        const n = ae.eintraege.length;
        const r = await verschneide('vereinigung');
        expect(r.ausgefuehrt, r.grund).toBe(true);
        const neu = ae.eintraege.slice(n);
        expect(new Set(neu.map(x => x.vorgang)).size).toBe(1);
        const verdeckt = ae.wirksamerStand('geloescht');
        expect(verdeckt.get('cde-W')).toBe(true);
        expect(verdeckt.get('cde-P')).toBe(true);
        const [, plan] = teil();
        expect(plan).toMatchObject({ rezept: 'verschnitt', kategorie: 'IFCWALL', name: 'Wand ∪ Sockel' });
        expect(plan.parameter.quellen).toEqual({ a: 'cde-W', b: 'cde-P' });
        expect(plan.parameter.operationen[0].parameter).toMatchObject({ art: 'vereinigung', kategorie: 'IFCWALL' });
        // A und B stehen weiter im Stand — sie sind die Quellen.
        expect(ae.wirksamerStand('erzeugt').get('cde-P').rezept).toBe('platte');
    });

    it('mit sich selbst, ohne zweiten Körper oder mit unbekannter Art: abgelehnt, mit Grund', async () => {
        // Sich selbst bietet die Auswahl gar nicht an — die Formularprüfung sagt es schon dort.
        expect((await verschneide('vereinigung', 'cde-W', 'cde-W')).grund).toMatch(/nicht in der Auswahl|mit sich selbst/);
        expect((await verschneide('vereinigung', 'cde-W', '')).grund).toMatch(/mit: fehlt|zweiten Körper/);
        expect((await verschneide('quatsch')).ausgefuehrt).toBe(false);
    });
});

describe('der Lauf — ein lebendes Rezept', () => {
    it('der Server bekommt die Körper von Wand und Sockel aus ihren Bauplänen; das Ergebnis trägt sein Volumen', async () => {
        await verschneide('vereinigung');
        const server = { kann: () => ({ ok: true }), op: vi.fn(async () => ({ ergebnis: KASTEN, warnungen: [] })) };
        const [gid, plan] = teil();
        const l = lauf(server);
        const r = await l.baue(gid);
        expect(r.ok && r.teil.form === 'koerper', JSON.stringify(r.fehler ?? '')).toBe(true);
        const [op, eingaben] = server.op.mock.calls[0];
        expect(op).toBe('booleVereinigung');
        expect(eingaben.a.closed && eingaben.b.closed).toBe(true);
        expect(eingaben.a.volumen).toBeCloseTo(6 * 0.3 * 2.5, 6);              // die Wand
        expect(eingaben.b.volumen).toBeCloseTo(8 * 2 * 0.4, 6);                // der Sockel
        expect(l.ableitungen.get(plan.ableitung).kennzahlen.volumen).toBeCloseTo(KASTEN.volumen, 6);
    });

    it('wird der (verborgene) Sockel dicker, rechnet das Ergebnis mit dem neuen Sockel — ohne neues Verschneiden', async () => {
        await verschneide('differenz');
        const server = { kann: () => ({ ok: true }), op: vi.fn(async () => ({ ergebnis: KASTEN, warnungen: [] })) };
        await lauf(server).baue(teil()[0]);
        expect(server.op.mock.calls[0][0]).toBe('booleDifferenz');
        // Ein verborgener Körper ist kein Kommandoziel mehr (E8) — sein Bauplan ändert sich über FOLGEN (aufstellen,
        // Knoten, Rebase, Rückgängig), die direkt ins Journal schreiben. Genau so hier:
        expect((await b.fuehreAus(kommando('platte-dicke-setzen', { ziel: ['cde-P'], werte: { dicke: 0.8 } }))).ausgefuehrt).toBe(false);
        const p = ae.wirksamerStand('erzeugt').get('cde-P');
        await ae.eintragen({ art: 'erzeugt', globalId: 'cde-P', modell: 'cde', nachher: { ...p, parameter: { ...p.parameter, dicke: 0.8 } } });
        await lauf(server).baue(teil()[0]);
        expect(server.op.mock.calls[1][1].b.volumen).toBeCloseTo(8 * 2 * 0.8, 6);
    });

    it('eine leere Schnittmenge ist ein Befund, kein stiller Nullkörper', async () => {
        await verschneide('schnitt');
        const server = { kann: () => ({ ok: true }), op: vi.fn(async () => ({ ergebnis: null, warnungen: ['leer'] })) };
        const [gid, plan] = teil();
        const l = lauf(server);
        await l.baue(gid);
        expect(l.ableitungen.get(plan.ableitung)?.befunde?.map(x => x.regel) ?? []).toContain('verschnitt_leer');
    });
});

describe('Verschnitt lösen (O1-Rest)', () => {
    it('das Ergebnis weg, Wand und Sockel wieder sichtbar und wieder Kommandoziel — ein Vorgang', async () => {
        await verschneide('vereinigung');
        const [gid] = teil();
        const n = ae.eintraege.length;
        const r = await b.fuehreAus(kommando('verschnitt-loesen', { ziel: [gid], werte: {} }));
        expect(r.ausgefuehrt, r.grund).toBe(true);
        expect(new Set(ae.eintraege.slice(n).map(x => x.vorgang)).size).toBe(1);
        expect(teil()).toBeUndefined();
        const verdeckt = ae.wirksamerStand('geloescht');
        expect(verdeckt.get('cde-W') ?? null).toBe(null);
        expect(verdeckt.get('cde-P') ?? null).toBe(null);
        // Der Sockel ist wieder ein Ziel (vorher E8: verborgen → abgelehnt).
        expect((await b.fuehreAus(kommando('platte-dicke-setzen', { ziel: ['cde-P'], werte: { dicke: 0.8 } }))).ausgefuehrt).toBe(true);
    });

    it('nur an einem Verschnitt angeboten; an einer Wand abgelehnt, mit Grund', async () => {
        await verschneide('vereinigung');
        const [, plan] = teil();
        const an = (rezept) => passende({ bauform: 'koerper', guete: 'gemessen' }, { eigenes: true, rezept: rezeptNach(rezept) }).map(w => w.id);
        expect(an(plan.rezept)).toContain('verschnitt-loesen');
        expect(an('platte')).not.toContain('verschnitt-loesen');
        await b.fuehreAus(kommando('verschnitt-loesen', { ziel: [teil()[0]], werte: {} }));
        const r = await b.fuehreAus(kommando('verschnitt-loesen', { ziel: ['cde-W'], werte: {} }));
        expect(r.ausgefuehrt).toBe(false);
    });
});
