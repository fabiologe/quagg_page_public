/**
 * Typprofile (Stufe 9.0b) — das Typspezifische als DATEN.
 *
 * Die Bauform sagt, WIE ein Bauteil bearbeitet wird; das Typprofil sagt, wie
 * der Typ die Dinge NENNT und welche Grenzen gelten. Genau diese Trennung hält
 * das Modul offen für die wachsende Menge der IFC-Typen: ein neuer Typ mit
 * eigenem Vokabular braucht einen Datensatz, keine Programmfassung.
 *
 * Zwei Feinheiten stehen hier im Mittelpunkt:
 *  1. `IFCWALLSTANDARDCASE` IST eine Wand. Ohne Normierung fiele jede
 *     IFC-Unterfassung durch den Rost — die klassische Falle bei Typ-Strings,
 *     hier auf EINE Stelle eingegrenzt.
 *  2. Gemischt wird je Kategorie, nicht je Feld. Ein Büro, das `IFCWALL`
 *     neu belegt, belegt es GANZ — sonst entstünde eine halb eingebaute, halb
 *     eigene Wand, und niemand könnte sagen, woher eine Grenze stammt.
 */
import { describe, expect, it } from 'vitest';
import {
    EINGEBAUTE_PROFILE, feldAusProfil, ladeSatz, normalisiereKategorie, profilFuer,
    vererbungskette,
} from '../services/bauform/Typprofile.js';

describe('normalisiereKategorie', () => {
    it('streift die Modellierungs-Unterfassung ab', () => {
        expect(normalisiereKategorie('IFCWALLSTANDARDCASE')).toBe('IFCWALL');
        expect(normalisiereKategorie('IfcSlabElementedCase')).toBe('IFCSLAB');
    });

    it('lässt gewöhnliche Kategorien in Ruhe', () => {
        expect(normalisiereKategorie('IFCPIPESEGMENT')).toBe('IFCPIPESEGMENT');
    });

    it('erträgt Leeres, statt zu werfen', () => {
        expect(normalisiereKategorie(null)).toBe('');
        expect(normalisiereKategorie('')).toBe('');
    });
});

describe('profilFuer', () => {
    it('findet das Profil einer gewöhnlichen Kategorie', () => {
        expect(profilFuer('IFCPIPESEGMENT').bauform).toBe('achse+profil');
    });

    it('findet die Wand auch über die Unterfassung — sonst wäre sie profillos', () => {
        expect(profilFuer('IFCWALLSTANDARDCASE').bauform).toBe('flaeche+dicke');
    });

    it('ist unempfindlich gegen Schreibweise', () => {
        expect(profilFuer('ifcPipeSegment').bauform).toBe('achse+profil');
    });

    it('liefert null für Unbekanntes — dann übernimmt die Ableitung', () => {
        expect(profilFuer('IFCHYPERLOOPTUBE')).toBe(null);
        expect(profilFuer(null)).toBe(null);
    });
});

describe('ladeSatz — Projekt schlägt Büro schlägt eingebaut', () => {
    const repoMit = (wert) => ({ mitVorrang: async () => wert });

    it('nimmt den eingebauten Satz, wenn kein Repo da ist', async () => {
        const satz = await ladeSatz(null);
        expect(satz.IFCPIPESEGMENT.bauform).toBe('achse+profil');
    });

    it('ergänzt eigene Kategorien um die eingebauten', async () => {
        const satz = await ladeSatz(repoMit({
            IFCHYPERLOOPTUBE: { bauform: 'achse+profil', felder: {} },
        }));
        expect(satz.IFCHYPERLOOPTUBE).toBeTruthy();      // neu
        expect(satz.IFCWALL.bauform).toBe('flaeche+dicke'); // eingebautes bleibt
    });

    it('ersetzt eine Kategorie GANZ, statt Felder zu vermischen', async () => {
        const satz = await ladeSatz(repoMit({
            IFCWALL: { bauform: 'flaeche+dicke', felder: { dicke: { label: 'Stärke nach Büro' } } },
        }));
        expect(satz.IFCWALL.felder.dicke.label).toBe('Stärke nach Büro');
        // Die eingebaute Grenze ist MIT weg — die Kategorie gehört jetzt dem Büro.
        expect(satz.IFCWALL.felder.dicke.min).toBeUndefined();
    });

    it('normiert die Schreibweise eigener Schlüssel', async () => {
        const satz = await ladeSatz(repoMit({ ifchyperlooptube: { bauform: 'netz', felder: {} } }));
        expect(satz.IFCHYPERLOOPTUBE.bauform).toBe('netz');
    });

    it('überlebt ein kaputtes Repo mit dem eingebauten Satz', async () => {
        const satz = await ladeSatz({ mitVorrang: async () => { throw new Error('kein Netz'); } });
        expect(satz.IFCPIPESEGMENT.bauform).toBe('achse+profil');
    });

    it('ignoriert Unsinn im gespeicherten Satz, statt ihn durchzureichen', async () => {
        const satz = await ladeSatz(repoMit({ IFCWALL: 'kaputt', IFCSLAB: null }));
        expect(satz.IFCWALL.bauform).toBe('flaeche+dicke');   // eingebautes gerettet
        expect(satz.IFCSLAB.bauform).toBe('flaeche+dicke');
    });

    it('rührt den eingebauten Satz nicht an — er ist geteilter Zustand', async () => {
        await ladeSatz(repoMit({ IFCWALL: { bauform: 'netz', felder: {} } }));
        expect(EINGEBAUTE_PROFILE.IFCWALL.bauform).toBe('flaeche+dicke');
    });
});

describe('feldAusProfil — dasselbe Feld heißt am Rohr anders als am Träger', () => {
    const rueckfall = { label: 'Querschnitt', einheit: 'm', typ: 'zahl' };

    it('nimmt Beschriftung und Grenze aus dem Profil', () => {
        const feld = feldAusProfil('profilGroesse', profilFuer('IFCPIPESEGMENT'), rueckfall);
        expect(feld.label).toBe('DN');
        expect(feld.einheit).toBe('mm');
        expect(feld.min).toBe(50);
    });

    it('liefert am Träger dasselbe Rollenfeld unter anderem Namen', () => {
        const feld = feldAusProfil('profilGroesse', profilFuer('IFCBEAM'), rueckfall);
        expect(feld.label).toBe('Profilreihe');
    });

    it('fällt auf die Katalogvorgabe zurück, wenn das Profil die Rolle nicht kennt', () => {
        const feld = feldAusProfil('profilGroesse', profilFuer('IFCKERB'), rueckfall);
        expect(feld).toEqual(rueckfall);
    });

    it('fällt zurück, wenn es gar kein Profil gibt', () => {
        expect(feldAusProfil('profilGroesse', null, rueckfall)).toEqual(rueckfall);
    });
});


describe('Vererbung — die eigentliche Antwort auf „immer neue IFC-Typen"', () => {
    it('liest die IFC-Kette, spezifisch zuerst', () => {
        const kette = vererbungskette('IFCPIPESEGMENT');
        expect(kette[0]).toBe('IFCPIPESEGMENT');
        expect(kette).toContain('IFCFLOWSEGMENT');
        expect(kette[kette.length - 1]).toBe('IFCROOT');
    });

    it('DAS ist der Punkt: ein nirgends gelisteter Typ erbt sein Profil', () => {
        // IFCCABLESEGMENT steht in KEINEM Satz dieser Datei. Es hängt aber
        // unter IfcFlowSegment — und bekommt dessen Profil. Genau so verhält
        // sich jeder Typ, den eine künftige IFC-Fassung mitbringt.
        expect(EINGEBAUTE_PROFILE.IFCCABLESEGMENT).toBeUndefined();
        expect(profilFuer('IFCCABLESEGMENT').bauform).toBe('achse+profil');
    });

    it('lässt das eigene Profil über das geerbte gewinnen', () => {
        // Das Rohr nennt seine Größe „DN", der allgemeine Fließabschnitt
        // „Nennweite". Der spezifischere Satz muss gewinnen.
        expect(profilFuer('IFCPIPESEGMENT').felder.profilGroesse.label).toBe('DN');
        expect(profilFuer('IFCFLOWSEGMENT').felder.profilGroesse.label).toBe('Nennweite');
        expect(profilFuer('IFCDUCTSEGMENT').felder.profilGroesse.label).toBe('Nennweite');
    });

    it('ordnet eine Trasse als Linie ein, nicht als Bauteil', () => {
        expect(profilFuer('IFCALIGNMENT').bauform).toBe('linie');
    });

    it('erbt auch über die Unterfassung hinweg', () => {
        expect(profilFuer('IFCWALLSTANDARDCASE').bauform).toBe('flaeche+dicke');
    });

    it('liefert für einen Typ ausserhalb des IFC-Katalogs null statt zu werfen', () => {
        expect(vererbungskette('IFCHYPERLOOPTUBE')).toEqual([]);
        expect(profilFuer('IFCHYPERLOOPTUBE')).toBe(null);
    });

    it('erbt auch aus einem Büro-Satz, nicht nur aus dem eingebauten', async () => {
        // Ein Büro, das ein Profil an einer HOHEN Stelle setzt, erweitert das
        // System damit für alle Nachfahren — ohne neue Programmfassung. Das
        // Beispiel sitzt bewusst dort, wo der eingebaute Satz mit Absicht
        // schweigt (räumliche Elemente): so zeigt es, dass ein Büro eine
        // Lücke schliessen kann, die wir offen gelassen haben.
        expect(profilFuer('IFCBUILDINGSTOREY')).toBe(null);
        const satz = await ladeSatz({
            mitVorrang: async () => ({ IFCSPATIALSTRUCTUREELEMENT: { bauform: 'flaeche', felder: {} } }),
        });
        expect(profilFuer('IFCBUILDINGSTOREY', satz).bauform).toBe('flaeche');
        expect(profilFuer('IFCSITE', satz).bauform).toBe('flaeche');
    });

    it('lässt den SPEZIELLEREN Eintrag gewinnen, auch wenn der allgemeine vom Büro kommt', () => {
        // Die Vorrangregel der Sätze (Projekt > Büro > eingebaut) gilt JE
        // SCHLÜSSEL. Über die Vererbung gewinnt danach immer der tiefere Knoten
        // — sonst könnte ein Büro-Eintrag an `IFCBUILTELEMENT` jede eingebaute
        // Feinheit darunter platt machen, und ein Bordstein wäre ein Klotz.
        // Wer `IFCRAILING` überschreiben will, schreibt `IFCRAILING`.
        const satz = { ...EINGEBAUTE_PROFILE, IFCBUILTELEMENT: { bauform: 'koerper', felder: {} } };
        expect(profilFuer('IFCRAILING', satz).bauform).toBe('achse+profil');
        expect(profilFuer('IFCCHIMNEY', satz).bauform).toBe('koerper');   // dort greift er
    });
});
