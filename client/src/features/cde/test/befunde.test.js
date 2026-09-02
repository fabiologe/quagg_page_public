/**
 * Befunde (Stufe 14.4) — und ihre Probe an den ECHTEN Netzen.
 *
 * Der zweite Teil dieser Datei ist der eigentliche Nachweis: Die Prüfung läuft
 * über Fabios beide Kanalnetze und muss die Fehler finden, die dort wirklich
 * drinstehen — Gegengefälle, ein 237-m-Höhensprung, DN 5000, Trapez-als-Kreis.
 * Gefunden wurden sie beim Sichten der Dateien, nicht von der Prüfung; sie
 * sind damit ein unabhängiger Massstab und keine Selbstbestätigung.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import * as WebIFC from 'web-ifc';
import { befundeFuer, befundeFuerNetz, zaehleBefunde, schwersteSchwere, mindestGefaelle,
    REGELWERK, KUREN } from '../services/Befunde.js';
import { BEARBEITUNGEN, nachId } from '../services/Bearbeitungen.js';
import { baueNetz } from '../services/Netztopologie.js';
import { IfcQuelle } from '../services/IfcQuelle.js';
import { extractAxisPolylines } from '../services/AxisAnnotations.js';
import { EINGEBAUTE_PROFILE, profilFuer } from '../services/bauform/Typprofile.js';

/** Eine Haltung, die nichts zu beanstanden hat. */
const SAUBER = {
    globalId: 'H1', kategorie: 'IFCPIPESEGMENT',
    achse: { anfang: { x: 0, y: 10, z: 0 }, ende: { x: 50, y: 9.5, z: 0 },
             laenge: 50, dn: 300 },
    typprofil: profilFuer('IFCPIPESEGMENT', EINGEBAUTE_PROFILE),
};

const mit = (achse, rest = {}) => ({ ...SAUBER, ...rest, achse: { ...SAUBER.achse, ...achse } });

describe('Was nichts zu beanstanden hat, bekommt nichts', () => {
    it('eine Haltung mit 10 ‰ bei DN 300', () => {
        expect(befundeFuer(SAUBER)).toEqual([]);
        expect(schwersteSchwere([])).toBeNull();
    });

    it('ein Bauteil ohne Achse wird nicht erfunden', () => {
        expect(befundeFuer({ globalId: 'X' })).toEqual([]);
        expect(befundeFuer(null)).toEqual([]);
    });
});

describe('Gefälle', () => {
    it('meldet Gegengefälle', () => {
        const b = befundeFuer(mit({ ende: { x: 50, y: 10.5, z: 0 } }));
        expect(b.map(x => x.regel)).toContain('gefaelle_gegen');
        expect(b[0].schwere).toBe('warnung');
        expect(b[0].text).toMatch(/bergauf/);
    });

    it('meldet zu flach — und nennt die Grenze', () => {
        // DN 300 ⇒ Mindestgefälle 3,3 ‰. Hier sind es 1 ‰.
        const b = befundeFuer(mit({ ende: { x: 50, y: 9.95, z: 0 } }));
        const f = b.find(x => x.regel === 'gefaelle_zu_flach');
        expect(f.schwere).toBe('warnung');
        expect(f.grenze).toMatch(/3\.3/);
        expect(f.quelle).toBe('Faustregel 1:DN');
    });

    it('die Grenze hängt an der Nennweite — DN 1000 darf flacher', () => {
        expect(mindestGefaelle(300)).toBeCloseTo(3.333, 3);
        expect(mindestGefaelle(1000)).toBeCloseTo(1.0, 3);
        // Dieselbe Haltung: bei DN 300 zu flach, bei DN 1000 in Ordnung.
        const flach = { ende: { x: 50, y: 9.9, z: 0 } };   // 2 ‰
        expect(befundeFuer(mit(flach)).map(x => x.regel)).toContain('gefaelle_zu_flach');
        expect(befundeFuer(mit({ ...flach, dn: 1000 })).map(x => x.regel))
            .not.toContain('gefaelle_zu_flach');
    });

    it('ein eigenes Regelwerk schlägt die Faustregel', () => {
        // Der ganze Zweck von Regel 4: Grenzwerte sind Daten.
        const eigenes = { ...REGELWERK, gefaelleMindestPromille: 1 };
        const flach = mit({ ende: { x: 50, y: 9.9, z: 0 } });     // 2 ‰
        expect(befundeFuer(flach).map(x => x.regel)).toContain('gefaelle_zu_flach');
        expect(befundeFuer(flach, eigenes).map(x => x.regel)).not.toContain('gefaelle_zu_flach');
    });

    it('meldet zu steil nur als HINWEIS — steil ist manchmal gewollt', () => {
        const b = befundeFuer(mit({ ende: { x: 50, y: 0, z: 0 } }));
        const s = b.find(x => x.regel === 'gefaelle_zu_steil');
        expect(s.schwere).toBe('hinweis');
    });

    it('meldet einen Höhensprung, der steiler als 100 % ist', () => {
        // Der A64-Fall: 237,5 m Unterschied auf einer Haltung.
        const b = befundeFuer(mit({ ende: { x: 50, y: -240, z: 0 } }));
        expect(b.map(x => x.regel)).toContain('hoehensprung');
    });
});

describe('Länge und Nennweite', () => {
    it('meldet ein Reststück und eine überlange Haltung', () => {
        expect(befundeFuer(mit({ laenge: 0.2 })).map(x => x.regel)).toContain('laenge_zu_kurz');
        expect(befundeFuer(mit({ laenge: 250 })).map(x => x.regel)).toContain('laenge_zu_lang');
    });

    it('meldet eine Nennweite ausserhalb des Typprofils', () => {
        // DN 5000 — der Ausreisser aus dem ENQUIER-Netz. Das Typprofil sagt
        // 50…4000 mm.
        const b = befundeFuer(mit({ dn: 5000 }));
        const d = b.find(x => x.regel === 'dn_ausserhalb');
        expect(d.schwere).toBe('warnung');
        expect(d.quelle).toBe('Typprofil');
    });

    it('meldet eine Nennweite ausserhalb der üblichen Reihe nur als Hinweis', () => {
        const b = befundeFuer(mit({ dn: 275 }));
        expect(b.find(x => x.regel === 'dn_nicht_normreihe').schwere).toBe('hinweis');
    });
});

describe('Profilform gegen Geometrie', () => {
    it('meldet „Trapezoid", wenn ein Kreis dasteht', () => {
        // 16 Rohre im ENQUIER-Netz. Die Form lebt nur im Beschreibungstext;
        // wer der Geometrie glaubt, rechnet mit dem falschen Querschnitt.
        const b = befundeFuer({ ...SAUBER, beschreibung: 'Trapezoid' });
        const p = b.find(x => x.regel === 'profilform_widerspruch');
        expect(p.schwere).toBe('warnung');
        expect(p.wert).toBe('Trapezoid');
    });

    it('„Kreisprofil" ist kein Widerspruch', () => {
        expect(befundeFuer({ ...SAUBER, beschreibung: 'Kreisprofil' })
            .map(x => x.regel)).not.toContain('profilform_widerspruch');
    });
});

describe('Kein Befund blockiert je etwas', () => {
    it('es gibt nur „hinweis" und „warnung" — keine Stufe, die verbietet', () => {
        // Fabios Entscheidung: beraten, nicht verbieten. Wer ein Gefälle unter
        // Mindestmass braucht (Düker, Bestand, Zwangspunkt), muss es setzen
        // können. Was die Daten wirklich zerstört, fängt die Feldprüfung ab.
        const alle = [
            ...befundeFuer(mit({ ende: { x: 50, y: 99, z: 0 }, dn: 5000, laenge: 0.1 })),
            ...befundeFuer({ ...SAUBER, beschreibung: 'Ei' }),
        ];
        expect(alle.length).toBeGreaterThan(3);
        for (const b of alle) expect(['hinweis', 'warnung']).toContain(b.schwere);
    });

    it('jeder Befund nennt Wert und Herkunft', () => {
        for (const b of befundeFuer(mit({ ende: { x: 50, y: 9.99, z: 0 } }))) {
            expect(b.wert, b.regel).toBeTruthy();
            expect(b.quelle, b.regel).toBeTruthy();
        }
    });

    it('zählt nach Schwere', () => {
        const b = befundeFuer(mit({ ende: { x: 50, y: 10.5, z: 0 }, dn: 275 }));
        expect(zaehleBefunde(b)).toEqual({ hinweis: 1, warnung: 1, gesamt: 2 });
        expect(schwersteSchwere(b)).toBe('warnung');
    });
});

// ── Die Probe an den echten Netzen ─────────────────────────────────────────

const NETZE = [
    { name: 'ENQUIER (51 Bauteile)',
      pfad: '/mnt/storagebox/1_Projekte/01_Laufend/1337_Genau/CDE/6275_ENQUIER_0X_2026-08-31.ifc' },
    { name: 'A64 (1.025 Bauteile)',
      pfad: '/home/fabio/quagg_page/client/testdata-local/6178_A64-2BA_0_2026-03-18 (12).ifc' },
];
const vorhanden = NETZE.every(n => fs.existsSync(n.pfad));

describe.runIf(vorhanden)('An den echten Netzen', () => {
    const ergebnis = new Map();
    const quellen = [];

    beforeAll(async () => {
        const profil = profilFuer('IFCPIPESEGMENT', EINGEBAUTE_PROFILE);
        for (const netz of NETZE) {
            const q = await IfcQuelle.oeffne(WebIFC, new Uint8Array(fs.readFileSync(netz.pfad)),
                { wasmPfad: 'node_modules/web-ifc/', name: netz.name });
            quellen.push(q);
            const nachRegel = new Map();
            for (const a of extractAxisPolylines(q)) {
                const zeile = q.zeile(a.expressId);
                const bs = befundeFuer({
                    globalId: String(a.expressId),
                    kategorie: a.category,
                    beschreibung: zeile?.Description?.value ?? null,
                    achse: { anfang: a.polyline[0], ende: a.polyline.at(-1), laenge: a.laenge, dn: a.dn },
                    typprofil: profil,
                });
                for (const b of bs) nachRegel.set(b.regel, (nachRegel.get(b.regel) ?? 0) + 1);
            }
            ergebnis.set(netz.name, nachRegel);
        }
    }, 300000);

    afterAll(() => quellen.forEach(q => q.schliesse()));

    it('findet im A64-Netz genau die drei Haltungen mit Gegengefälle', () => {
        // Unabhängig gefunden beim Sichten der Datei, bevor es diese Prüfung
        // gab. Weicht die Zahl ab, stimmt entweder die Regel nicht oder die
        // Achse wird anders gelesen — beides will man wissen.
        expect(ergebnis.get('A64 (1.025 Bauteile)').get('gefaelle_gegen')).toBe(3);
    });

    it('findet den Höhensprung von 237 m', () => {
        expect(ergebnis.get('A64 (1.025 Bauteile)').get('hoehensprung')).toBeGreaterThanOrEqual(1);
    });

    it('findet das DN 5000 im ENQUIER-Netz — genau eines', () => {
        expect(ergebnis.get('ENQUIER (51 Bauteile)').get('dn_ausserhalb')).toBe(1);
    });

    it('findet die 16 Rohre, die sich Trapez nennen und Kreis sind', () => {
        expect(ergebnis.get('ENQUIER (51 Bauteile)').get('profilform_widerspruch')).toBe(16);
    });

    it('meldet nicht ALLES — sonst wäre die Liste wertlos', () => {
        // Eine Prüfung, die jedes Bauteil anmeckert, liest niemand. Im
        // ENQUIER-Netz hat die Mehrheit der 24 Haltungen keinen Befund der
        // Schwere „warnung" ausser dem Profilform-Widerspruch.
        const e = ergebnis.get('ENQUIER (51 Bauteile)');
        expect(e.get('gefaelle_gegen') ?? 0).toBe(0);
        expect(e.get('hoehensprung') ?? 0).toBe(0);
    });
});

// ── Aus der Prüfliste wird eine Arbeitsliste ───────────────────────────────

describe('Jeder Befund kennt sein Werkzeug — oder sagt, dass es keines gibt', () => {
    it('KEINE Kur zeigt auf eine Bearbeitung, die es nicht gibt', () => {
        // Der eigentliche Wächter. Wird eine Bearbeitung umbenannt oder
        // entfernt, hinge der Knopf sonst in der Luft — und der Nutzer klickte
        // ins Leere, an genau der Stelle, an der ihm geholfen werden sollte.
        const bekannt = new Set(BEARBEITUNGEN.map(b => b.id));
        for (const [regel, kur] of Object.entries(KUREN)) {
            expect(bekannt.has(kur.bearbeitung), `${regel} → ${kur.bearbeitung}`).toBe(true);
        }
    });

    it('vorgeschlagene Werte treffen FELDER, die es an der Bearbeitung gibt', () => {
        // Ein Vorschlag für ein Feld, das nicht existiert, verschwindet
        // stillschweigend — und der Nutzer sähe ein leeres Formular, wo eine
        // fertige Antwort stehen sollte.
        for (const [regel, kur] of Object.entries(KUREN)) {
            if (!kur.werte) continue;
            const namen = new Set(nachId(kur.bearbeitung).felder.map(f => f.name));
            for (const feld of Object.keys(kur.werte)) {
                expect(namen.has(feld), `${regel}: ${kur.bearbeitung}.${feld}`).toBe(true);
            }
        }
    });

    it('„läuft bergauf" bringt seine Antwort gleich mit', () => {
        // Der eine Fall, in dem die Kur eindeutig ist: ein Klick genügt.
        const b = befundeFuer({
            globalId: 'H1', kategorie: 'IFCPIPESEGMENT',
            achse: { anfang: { x: 0, y: 9, z: 0 }, ende: { x: 50, y: 10, z: 0 }, laenge: 50, dn: 300 },
        }).find(x => x.regel === 'gefaelle_gegen');
        expect(b.kur).toEqual({ bearbeitung: 'fliessrichtung-setzen', werte: { richtung: 'umgekehrt' } });
    });

    it('der Profilform-Widerspruch kennt seit Stufe 16 seine Kur', () => {
        // Bis dahin stand hier ausdrücklich KEINE — „der Querschnitt ist
        // keine Nennweite". Jetzt gibt es die Rolle `profilform` und ihr
        // Werkzeug; die 16 Trapez-als-Kreis-Rohre bekommen einen Knopf.
        const trapez = befundeFuer({ globalId: 'H1', beschreibung: 'Trapezoid',
            achse: { anfang: { x: 0, y: 10, z: 0 }, ende: { x: 50, y: 9.5, z: 0 }, laenge: 50, dn: 300 } })
            .find(x => x.regel === 'profilform_widerspruch');
        expect(trapez.kur?.bearbeitung).toBe('profilform-setzen');
    });

    it('wo es kein Werkzeug gibt, steht ausdrücklich KEINE Kur', () => {
        // Eine erfundene Zuordnung wäre schlimmer als keine — sie schickte den
        // Nutzer in ein Formular, das seinen Fall nicht trifft.
        const netz = baueNetz({
            knoten: [{ id: 'ALLEIN', punkt: { x: 999, y: 0, z: 999 } }],
            kanten: [],
        });
        expect(befundeFuerNetz(netz).get('ALLEIN')[0].kur).toBeNull();
    });

    it('Netz-Befunde tragen ihre Kur genauso', () => {
        const netz = baueNetz({
            knoten: [{ id: 'S0', punkt: { x: -50, y: 0, z: 0 } },
                     { id: 'S1', punkt: { x: 0, y: 0, z: 0 } },
                     { id: 'S2', punkt: { x: 50, y: 0, z: 0 } }],
            kanten: [
                { id: 'ZU', anfang: { x: -50, y: 0, z: 0 }, ende: { x: 0, y: 0, z: 0 }, dn: 500 },
                { id: 'AB', anfang: { x: 0, y: 0, z: 0 }, ende: { x: 50, y: 0, z: 0 }, dn: 300 },
            ],
        });
        expect(befundeFuerNetz(netz).get('AB')[0].kur.bearbeitung).toBe('profilgroesse-setzen');
    });
});
