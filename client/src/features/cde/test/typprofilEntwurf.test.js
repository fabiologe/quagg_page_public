// @vitest-environment jsdom
/**
 * Typprofil-Entwürfe aus den bSI-Vorlagen (Teil XXIII, A5; Befund S6) — und
 * „unbestätigt" als Katalogzustand im Bauformen-Panel (S7).
 *
 * Gemessen 2026-09-18: mit der heutigen Rollentabelle (Nennweite, Dicke)
 * tragen die Vorlagen für ZWEI Bauteilklassen etwas bei, das ihr geltendes
 * Profil nicht kennt (IfcSign, IfcTubeBundle). Die Maschine steht; ihr Nutzen
 * wächst mit der Tabelle — nicht auf Vorrat erweitert.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { entwurfFuer, profilAusEntwurf } from '../services/bauform/Typprofilentwurf.js';
import { EINGEBAUTE_PROFILE, profilFuer } from '../services/bauform/Typprofile.js';
import { ENTITY_META } from '../data/entity-schema.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { istUnbestaetigt } from '../services/bauform/Bauformregeln.js';

function repoMit({ projekt = {}, buero = {} } = {}) {
    const lese = (q) => async (k) => (k in q ? JSON.parse(JSON.stringify(q[k])) : null);
    return {
        get: lese(projekt), set: async (k, v) => { projekt[k] = v; return true; },
        buero: { get: lese(buero), set: async (k, v) => { buero[k] = v; return true; } },
        mitVorrang: async (k, vorgabe) => (k in projekt ? projekt[k] : k in buero ? buero[k] : vorgabe),
        _projekt: projekt, _buero: buero,
    };
}

describe('Entwürfe', () => {
    it('nur für Bauteilklassen, nur mit Rollen, die das geltende Profil nicht kennt', () => {
        const mit = Object.keys(ENTITY_META).filter(k => entwurfFuer(k, EINGEBAUTE_PROFILE));
        expect(mit.sort()).toEqual(['IFCSIGN', 'IFCTUBEBUNDLE']);
        expect(entwurfFuer('IFCPIPESEGMENTTYPE', EINGEBAUTE_PROFILE)).toBeNull();     // Typobjekt
        expect(entwurfFuer('IFCPIPESEGMENT', EINGEBAUTE_PROFILE)).toBeNull();         // kennt profilGroesse schon
    });

    it('jedes Feld nennt seine Quelle; das Profil beim Bestätigen behält das Geerbte', () => {
        const e = entwurfFuer('IFCTUBEBUNDLE', EINGEBAUTE_PROFILE);
        expect(e.felder.profilGroesse.quelle).toBe('Pset_TubeBundleTypeCommon.NominalDiameter');
        const p = profilAusEntwurf(e, EINGEBAUTE_PROFILE);
        const geerbt = profilFuer('IFCTUBEBUNDLE', EINGEBAUTE_PROFILE);
        for (const r of Object.keys(geerbt?.felder ?? {})) expect(p.felder, r).toHaveProperty(r);
        expect(p.felder).toHaveProperty('profilGroesse');
    });
});

describe('Bestätigen über den Store: geprüft, gespeichert, sofort wirksam', () => {
    beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); });

    it('ohne Projekt-Typprofile landet es im Büro — und gilt nach dem Neuladen', async () => {
        const b = useBearbeitung();
        const repo = repoMit();
        await b.ladeProfile(repo);
        const r = await b.entwurfUebernehmen('IFCTUBEBUNDLE', repo);
        expect(r).toMatchObject({ ok: true, ebene: 'buero' });
        expect(repo._buero.typprofile.IFCTUBEBUNDLE.felder.profilGroesse.quelle).toMatch(/NominalDiameter/);
        expect(profilFuer('IFCTUBEBUNDLE', b.profilSatz).felder).toHaveProperty('profilGroesse');
        expect(entwurfFuer('IFCTUBEBUNDLE', b.profilSatz)).toBeNull();                // erledigt
        expect(b.katalogBefunde).toEqual([]);
    });

    it('hat das Projekt eigene Typprofile, dorthin — sonst verdeckten sie den Büroeintrag', async () => {
        const b = useBearbeitung();
        const repo = repoMit({ projekt: { typprofile: { IFCWALL: EINGEBAUTE_PROFILE.IFCWALL } } });
        await b.ladeProfile(repo);
        const r = await b.entwurfUebernehmen('IFCSIGN', repo);
        expect(r.ebene).toBe('projekt');
        expect(Object.keys(repo._projekt.typprofile).sort()).toEqual(['IFCSIGN', 'IFCWALL']);
        expect(repo._buero.typprofile).toBeUndefined();
    });
});

describe('Unbestätigt im Bauformen-Panel (S7)', () => {
    const zeile = (bauform, geometrie) => ({ category: 'IFCBUILDINGELEMENTPROXY', name: 'Haltung', bauform, geometrie });

    it('ohne Regel und mit gemessener Bauform: unbestätigt', () => {
        expect(istUnbestaetigt(zeile(null, { bauform: 'koerper', guete: 'gemessen' }))).toBe(true);
        expect(istUnbestaetigt(zeile(null, { bauform: 'achse+profil', guete: 'geschaetzt' }))).toBe(true);
    });
    it('eine Regel ist eine Entscheidung — auch ein Nein (andere Bauform)', () => {
        expect(istUnbestaetigt(zeile('achse+profil', { bauform: 'koerper', guete: 'gemessen' }))).toBe(false);
    });
    it('keine Messung, „netz" oder „unbekannt" ist kein Vorschlag', () => {
        expect(istUnbestaetigt(zeile(null, null))).toBe(false);
        expect(istUnbestaetigt(zeile(null, undefined))).toBe(false);
        expect(istUnbestaetigt(zeile(null, { bauform: 'netz', guete: 'unbekannt' }))).toBe(false);
        expect(istUnbestaetigt(zeile(null, { bauform: 'koerper', guete: 'unbekannt' }))).toBe(false);
    });
    it('„Übernehmen" schreibt über den Store eine Regel mit der gemessenen Bauform — danach bestätigt', async () => {
        localStorage.clear(); setActivePinia(createPinia());
        const b = useBearbeitung();
        const v = zeile(null, { bauform: 'koerper', guete: 'gemessen' });
        const ziel = { set: async () => true };
        // Derselbe Aufruf wie `setzeBauform(v, v.geometrie.bauform)` im Panel.
        await b.ordneZu({ category: v.category, name: v.name, art: 'genau', propertyName: 'Name', bauform: v.geometrie.bauform }, ziel);
        const neu = b.vorschlaege([{ category: v.category, name: v.name }]).find(x => x.name === 'Haltung');
        expect(neu.bauform).toBe('koerper');
        expect(istUnbestaetigt({ ...neu, geometrie: v.geometrie })).toBe(false);
    });
});
