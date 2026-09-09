// @vitest-environment node
/**
 * Die Einordnung an FABIOS ECHTEN DATEIEN (2026-09-03).
 *
 * Alle übrigen Prüfungen der Bauform-Schicht laufen gegen Attrappen — und
 * genau dort ist im Haus schon dreimal etwas durchgerutscht, das erst eine
 * echte Datei zeigte (`fakeWebIfc` mit erfundenen Konstanten, `getAllCoordOffsets`,
 * zuletzt `zeile().type` als ZAHL statt als Klassenname).
 *
 * Diese Datei geht deshalb den Weg, den der Viewer geht — Datei öffnen,
 * Kontext lesen, `deklarierteBauform` fragen — nur ohne WebGL:
 *
 *     IfcQuelle.zeile()  →  Kontext {category, attributes}  →  deklarierteBauform
 *
 * Geprüft wird die AUSSAGE über die Dateien, nicht die Verkabelung.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IfcQuelle } from '../services/IfcQuelle.js';
import { deklarierteBauform } from '../services/bauform/Bauformen.js';
import { MITGELIEFERTE_REGELN, bauformAusRegel } from '../services/bauform/Bauformregeln.js';
import { EINGEBAUTE_PROFILE, profilFuer } from '../services/bauform/Typprofile.js';
import { GELAENDE_VORBELEGUNG, kandidatKategorien } from '../services/GelaendeQuelle.js';

const hier = path.dirname(fileURLToPath(import.meta.url));
const wurzel = path.resolve(hier, '../../../../');
const require = createRequire(import.meta.url);
const WASM = { wasmPfad: path.join(wurzel, 'node_modules/web-ifc/'), absolut: true };

const DATEIEN = {
    fill:  'BIM26_Gruppe5_BODEN_Erdarbeiten.ifc',    // 2 × IfcEarthworksFill, Name = $
    dgm:   'BIM26_Gruppe5_BODEN_Erdarbeiten3.ifc',   // 7 × IfcEarthworksElement, Layer DGM_Abtrag
    provi: 'IFCOUT_Entwässerung Export .IFC',        // 37 × Proxy, Name „Haltung"/„Schacht"
};

let WebIFC;
const offen = [];
beforeAll(() => { WebIFC = require('web-ifc'); });
afterAll(() => { for (const q of offen) q?.schliesse(); });

async function oeffne(name) {
    const datei = path.join(hier, name);
    if (!fs.existsSync(datei)) return null;
    const q = await IfcQuelle.oeffne(WebIFC, new Uint8Array(fs.readFileSync(datei)), WASM);
    offen.push(q);
    return q;
}

/**
 * Der Elementzusammenhang — Zeile für Zeile dasselbe wie
 * `IfcEngine._gelaendeKontext`. Steht hier absichtlich noch einmal: der Test
 * soll die Engine nicht brauchen (kein WebGL), und wenn die beiden
 * auseinanderlaufen, ist das eine Aussage über den Vertrag.
 */
function kontextVon(q, id) {
    const z = q.zeile(id);
    if (!z) return null;
    return {
        category: q.kategorieVon(z) || null,
        globalId: z.GlobalId?.value ?? null,
        attributes: {
            Name: z.Name?.value ?? '',
            Description: z.Description?.value ?? '',
            ObjectType: z.ObjectType?.value ?? '',
            PredefinedType: z.PredefinedType?.value ?? '',
        },
        psets: {},
    };
}

/** Die Einordnung, wie sie der Viewer baut — ohne Auslegung, ohne Bauplan. */
function eingeordnet(ctx, { ausEinzelfall = null } = {}) {
    return deklarierteBauform({
        ausEinzelfall,
        ausRegel: bauformAusRegel(MITGELIEFERTE_REGELN, ctx),
        typprofil: profilFuer(ctx?.category, EINGEBAUTE_PROFILE),
    });
}

/** Alle Produkte einer Datei mit ihrem Kontext. */
function produkte(q) {
    return q.ids('IFCPRODUCT', { untertypen: true })
        .map(id => kontextVon(q, id))
        .filter(Boolean);
}

describe('BIM26 BODEN „Erdarbeiten3" — IfcEarthworksElement als DGM', () => {
    let els;
    beforeAll(async () => {
        const q = await oeffne(DATEIEN.dgm);
        els = q ? produkte(q).filter(c => c.category === 'IFCEARTHWORKSELEMENT') : [];
    }, 120_000);

    it('die Datei führt sie überhaupt — sonst prüft der Rest nichts', () => {
        expect(els.length).toBe(7);
    });

    it('werden über das TYPPROFIL zum Höhenfeld — ohne Zutun des Nutzers', () => {
        for (const ctx of els) {
            expect(eingeordnet(ctx), ctx.globalId)
                .toMatchObject({ bauform: 'hoehenfeld', quelle: 'typprofil' });
        }
    });

    it('und stehen damit in der Kandidatenmenge des Geländes', () => {
        const kandidaten = new Set(kandidatKategorien({
            regeln: MITGELIEFERTE_REGELN, profilSatz: EINGEBAUTE_PROFILE,
        }));
        for (const ctx of els) expect(kandidaten).toContain(ctx.category);
    });
});

describe('BIM26 BODEN „Erdarbeiten" — IfcEarthworksFill OHNE Namen', () => {
    let els;
    beforeAll(async () => {
        const q = await oeffne(DATEIEN.fill);
        els = q ? produkte(q).filter(c => c.category === 'IFCEARTHWORKSFILL') : [];
    }, 120_000);

    it('die Datei führt zwei — und keiner trägt einen Namen', () => {
        expect(els.length).toBe(2);
        // DER Grund, warum eine Regel-Maschine mehr können muss als `Name`:
        // hier gibt es nichts zu benennen. Bis 2026-09-03 konnte die
        // Oberfläche ausschliesslich Namen zuordnen — für diese Datei hatte
        // sie damit kein einziges Werkzeug.
        for (const ctx of els) expect(ctx.attributes.Name).toBe('');
    });

    it('sind KÖRPER, nicht Gelände — der aufgelöste Widerspruch', () => {
        // Die alte Kategorienliste zählte `IFCEARTHWORKSFILL` zum Gelände,
        // während das Typprofil ihn als Auftragskörper führt. Zwei Antworten
        // auf dieselbe Frage, beide grün. Jetzt entscheidet die Bauform.
        for (const ctx of els) {
            expect(eingeordnet(ctx), ctx.globalId)
                .toMatchObject({ bauform: 'koerper', quelle: 'typprofil' });
        }
    });

    it('bleiben aber KANDIDATEN — grosszügig suchen, streng entscheiden', () => {
        // Über die Vererbung von `IFCEARTHWORKSELEMENT`. Der Vorfilter darf
        // sie einsammeln; herausfallen tun sie am eigenen Typprofil.
        expect(kandidatKategorien({ profilSatz: EINGEBAUTE_PROFILE })).toContain('IFCEARTHWORKSFILL');
    });

    it('eine AUSLEGUNG macht einen davon zum Gelände — und nur ihn', () => {
        // Fabios Fall, an seiner Datei: der Projektleiter hat den Erdkörper
        // als Geländemodell gemeint. Der Nutzer sagt es einmal für DIESES
        // Bauteil; das andere bleibt, was es war.
        const [erstes, zweites] = els;
        expect(eingeordnet(erstes, { ausEinzelfall: 'hoehenfeld' }))
            .toMatchObject({ bauform: 'hoehenfeld', quelle: 'einzelfall' });
        expect(eingeordnet(zweites)).toMatchObject({ bauform: 'koerper' });
    });
});

describe('ProVI-Entwässerung — alles ist ein Proxy', () => {
    let els;
    beforeAll(async () => {
        const q = await oeffne(DATEIEN.provi);
        els = q ? produkte(q).filter(c => c.category === 'IFCBUILDINGELEMENTPROXY') : [];
    }, 120_000);

    it('37 Proxies, und der Typ sagt über die Form NICHTS', () => {
        expect(els.length).toBe(37);
        // `bauform: null` im Typprofil ist eine SPERRE gegen die Vererbung,
        // kein fehlender Eintrag: ohne sie erbte der Proxy `koerper` von
        // `IFCBUILTELEMENT`, und eine ProVI-Haltung wäre als Klotz DEKLARIERT.
        expect(EINGEBAUTE_PROFILE.IFCBUILDINGELEMENTPROXY.bauform).toBe(null);
    });

    it('der NAME trägt die Fachaussage — und die mitgelieferte Regel liest sie', () => {
        const haltungen = els.filter(c => c.attributes.Name === 'Haltung');
        const schaechte = els.filter(c => c.attributes.Name === 'Schacht');
        expect(haltungen.length).toBe(18);
        expect(schaechte.length).toBe(19);
        for (const ctx of haltungen) {
            expect(eingeordnet(ctx)).toMatchObject({ bauform: 'achse+profil', quelle: 'regel' });
        }
        for (const ctx of schaechte) {
            expect(eingeordnet(ctx)).toMatchObject({ bauform: 'koerper', quelle: 'regel' });
        }
    });

    it('nichts davon ist Gelände — und die Vorbelegung sucht dort auch nicht', () => {
        for (const ctx of els) expect(eingeordnet(ctx)?.bauform).not.toBe('hoehenfeld');
        expect(GELAENDE_VORBELEGUNG).not.toContain('IFCBUILDINGELEMENTPROXY');
    });
});
