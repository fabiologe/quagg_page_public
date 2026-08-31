/**
 * Bauform-Schicht (Stufe 9.0b) — die tragende Prüfung des Bearbeitungsmoduls.
 *
 * Der ganze Ausbau steht auf einer Behauptung: Operationen hängen an der
 * BAUFORM, nicht am IFC-Typ, und deshalb bleibt das Modul bedienbar, obwohl
 * ständig neue IFC-Typen dazukommen. Diese Datei prüft genau das — bis hin zu
 * einer frei erfundenen Kategorie, die in keiner Liste des Hauses steht.
 *
 * Zweite Behauptung: die Bauform wird DEKLARIERT, nicht aus Kantenlängen
 * erraten (Hausregel „Regler statt Raterei"). Die Geometrie beantwortet nur,
 * wie belastbar die Deklaration im konkreten Modell ist. Auch dafür stehen
 * hier Fälle — insbesondere der, in dem eine skelettierte Achse eben NICHT
 * ausreicht, um ein Bauteil für linear zu erklären.
 *
 * Der GeometryResolver wird als Attrappe hineingereicht: die Schicht ist damit
 * ohne WebGL prüfbar, wie der Rest des Hauses.
 */
import { describe, expect, it } from 'vitest';
import {
    BAUFORMEN, GUETE_STUFEN, bestimme, guetegenuegt, istBauform,
} from '../services/bauform/Bauformen.js';

/**
 * Attrappe des Resolvers.
 * @param {object} formen  z. B. { axis: {...}, solid: {...} } — was `getForm` liefert
 */
function resolverAttrappe(formen = {}) {
    return {
        forElements() {
            return {
                async getForm(form) {
                    if (form in formen) {
                        const wert = formen[form];
                        if (wert instanceof Error) throw wert;
                        return wert;
                    }
                    return { form, data: null, perElement: [], source: 'none', path: [], warnings: [] };
                },
            };
        },
    };
}

const ECHTE_ACHSE = {
    form: 'axis',
    perElement: [{ polyline: [[0, 0, 0], [10, 0, 0]], source: 'axisRep', path: ['src:axisRep', 'axis'], warnings: [] }],
};
const SKELETT_ACHSE = {
    form: 'axis',
    perElement: [{ polyline: [[0, 0, 0], [10, 0, 0]], source: 'mesh', path: ['src:fragments', 'mesh', 'axis:skelett'], warnings: [] }],
};
const KEINE_ACHSE = {
    form: 'axis',
    perElement: [{ polyline: null, source: 'none', path: [], warnings: ['achse_nicht_ableitbar'] }],
};
const GESCHLOSSENER_KOERPER = {
    form: 'solid', data: { positions: new Float64Array(9), triCount: 1, closed: true }, warnings: [],
};
const OFFENER_KOERPER = {
    form: 'solid', data: { positions: new Float64Array(9), triCount: 1, closed: false }, warnings: [],
};

const EL = { modelId: 'm1', localId: 42, category: 'IFCPIPESEGMENT' };

/** Ein Rohr führt Achse UND Volumen; eine Trasse nur die Achse. */
const ROHR = { axis: ECHTE_ACHSE, solid: GESCHLOSSENER_KOERPER };
const TRASSE = { axis: ECHTE_ACHSE };

describe('Der Katalog der Bauformen', () => {
    it('kennt genau die acht Formen — die Liste ist der Vertrag', () => {
        expect(Object.keys(BAUFORMEN).sort()).toEqual([
            'achse+profil', 'flaeche', 'flaeche+dicke', 'hoehenfeld',
            'koerper', 'linie', 'netz', 'punkt',
        ]);
    });

    it('führt sie in der Reihenfolge der Dimension — das ist die Systematik', () => {
        // Nicht Kosmetik: die Reihenfolge IST die Begründung, warum die Liste
        // geschlossen ist. Es gibt keine neunte Dimension.
        expect(Object.keys(BAUFORMEN)).toEqual([
            'punkt', 'linie', 'achse+profil', 'flaeche',
            'flaeche+dicke', 'hoehenfeld', 'koerper', 'netz',
        ]);
    });

    it('sagt zu jeder Form, welche Repräsentation sie braucht', () => {
        for (const [name, form] of Object.entries(BAUFORMEN)) {
            expect(form.titel, name).toBeTruthy();
            expect(['axis', 'solid', 'surface', null]).toContain(form.braucht);
        }
    });

    it('erkennt erfundene Formnamen nicht an — ein Typprofil ist Nutzerdatum', () => {
        expect(istBauform('achse+profil')).toBe(true);
        expect(istBauform('bananenform')).toBe(false);
    });
});

describe('guetegenuegt — die Schranke der Operationen', () => {
    it('lässt Gleiches und Besseres durch, Schlechteres nicht', () => {
        expect(guetegenuegt('gemessen', 'gemessen')).toBe(true);
        expect(guetegenuegt('gemessen', 'geschaetzt')).toBe(true);
        expect(guetegenuegt('geschaetzt', 'gemessen')).toBe(false);
        expect(guetegenuegt('unbekannt', 'geschaetzt')).toBe(false);
    });

    it('weist Unbekanntes ab, statt es durchzulassen', () => {
        expect(guetegenuegt(undefined, 'gemessen')).toBe(false);
        expect(guetegenuegt('gemessen', 'quatsch')).toBe(false);
    });

    it('ist absteigend sortiert — sonst dreht sich der Vergleich um', () => {
        expect(GUETE_STUFEN).toEqual(['gemessen', 'geschaetzt', 'unbekannt']);
    });
});

describe('bestimme — ohne Typprofil, aus der Geometrie', () => {
    it('erklärt ein Bauteil mit echter Achse UND Volumen zum Schwelkörper', async () => {
        const r = await bestimme(EL, { resolver: resolverAttrappe(ROHR) });
        expect(r.bauform).toBe('achse+profil');
        expect(r.guete).toBe('gemessen');
        expect(r.quelle).toBe('geometrie');
    });

    it('erklärt eine echte Achse OHNE Volumen zur Linie, nicht zum Rohr', async () => {
        // Eine Trasse (IfcAlignment) positioniert, sie hat kein Volumen. Die
        // Unterscheidung ist keine Schätzung über Kantenlängen, sondern die
        // Frage, ob überhaupt etwas Dreidimensionales da ist.
        const r = await bestimme({ ...EL, category: 'IFCALIGNMENT' },
            { resolver: resolverAttrappe(TRASSE) });
        expect(r.bauform).toBe('linie');
        expect(r.guete).toBe('gemessen');
    });

    it('erklärt ein Bauteil mit SKELETTIERTER Achse NICHT für linear', async () => {
        // Kern der Hausregel „Regler statt Raterei": eine Skelettachse bekommt
        // man auch aus einem Würfel. Sie ist Güte-Information, kein
        // Einordnungsgrund — sonst wäre jeder Schacht ein Rohr.
        const r = await bestimme(EL, {
            resolver: resolverAttrappe({ axis: SKELETT_ACHSE, solid: OFFENER_KOERPER }),
        });
        expect(r.bauform).not.toBe('achse+profil');
        expect(r.bauform).toBe('netz');
        expect(r.guete).toBe('geschaetzt');
    });

    it('erklärt einen geschlossenen Körper ohne Achse zum Körper', async () => {
        const r = await bestimme(EL, {
            resolver: resolverAttrappe({ axis: KEINE_ACHSE, solid: GESCHLOSSENER_KOERPER }),
        });
        expect(r.bauform).toBe('koerper');
        expect(r.guete).toBe('gemessen');
    });

    it('liefert netz statt undefined, wenn sich nichts ableiten lässt', async () => {
        const r = await bestimme(EL, { resolver: resolverAttrappe({}) });
        expect(r.bauform).toBe('netz');
        expect(r.guete).toBe('unbekannt');
        expect(r.warnungen).toContain('bauform_nicht_ableitbar');
    });
});

describe('bestimme — mit Typprofil: die Deklaration gewinnt', () => {
    it('nimmt die deklarierte Bauform, auch wenn die Geometrie sie nicht hergäbe', async () => {
        const r = await bestimme(EL, {
            resolver: resolverAttrappe({ axis: SKELETT_ACHSE }),
            typprofil: { bauform: 'achse+profil' },
        });
        expect(r.bauform).toBe('achse+profil');
        expect(r.quelle).toBe('typprofil');
    });

    it('stuft die Güte herunter und sagt WARUM, wenn die Achse nur geschätzt ist', async () => {
        const r = await bestimme(EL, {
            resolver: resolverAttrappe({ axis: SKELETT_ACHSE }),
            typprofil: { bauform: 'achse+profil' },
        });
        expect(r.guete).toBe('geschaetzt');
        expect(r.warnungen).toContain('achse_skelettiert');
    });

    it('meldet unbekannt, wenn die deklarierte Form gar nicht da ist', async () => {
        const r = await bestimme(EL, {
            resolver: resolverAttrappe({ axis: KEINE_ACHSE }),
            typprofil: { bauform: 'achse+profil' },
        });
        expect(r.bauform).toBe('achse+profil');
        expect(r.guete).toBe('unbekannt');
        expect(r.warnungen).toContain('achse_nicht_ableitbar');
    });

    it('lässt punkt und netz ohne Formprüfung gelten', async () => {
        const r = await bestimme(EL, { resolver: resolverAttrappe({}), typprofil: { bauform: 'punkt' } });
        expect(r.bauform).toBe('punkt');
        expect(r.guete).toBe('gemessen');
    });

    it('verwirft eine erfundene Bauform aus dem Profil und sagt es', async () => {
        const r = await bestimme(EL, {
            resolver: resolverAttrappe(ROHR),
            typprofil: { bauform: 'bananenform' },
        });
        expect(r.bauform).toBe('achse+profil');       // Rückfall auf die Geometrie
        expect(r.warnungen).toContain('typprofil_bauform_unbekannt:bananenform');
    });
});

describe('Die eigentliche Behauptung: neue IFC-Typen brauchen keinen Code', () => {
    it('ordnet eine frei erfundene Kategorie richtig ein, wenn ein Profil sie deklariert', async () => {
        // Steht in keiner Liste des Hauses — weder in LINEAR_CATEGORIES noch
        // in EINGEBAUTE_PROFILE. Genau das ist der Fall „IFC 5 bringt einen
        // neuen Typ" bzw. „das Büro modelliert etwas Eigenes".
        const exot = { modelId: 'm1', localId: 7, category: 'IFCHYPERLOOPTUBE' };
        const r = await bestimme(exot, {
            resolver: resolverAttrappe({ axis: ECHTE_ACHSE }),
            typprofil: { bauform: 'achse+profil' },
        });
        expect(r.bauform).toBe('achse+profil');
        expect(r.guete).toBe('gemessen');
    });

    it('ordnet dieselbe erfundene Kategorie auch OHNE Profil ein, wenn die Achse echt ist', async () => {
        const exot = { modelId: 'm1', localId: 7, category: 'IFCHYPERLOOPTUBE' };
        const r = await bestimme(exot, { resolver: resolverAttrappe(ROHR) });
        expect(r.bauform).toBe('achse+profil');
    });
});

describe('Kein stilles Scheitern', () => {
    it('gibt auch ohne Element eine Bauform zurück', async () => {
        const r = await bestimme(null, { resolver: resolverAttrappe({}) });
        expect(r.bauform).toBe('netz');
        expect(r.warnungen).toContain('kein_element');
    });

    it('gibt auch ohne Resolver eine Bauform zurück', async () => {
        const r = await bestimme(EL, {});
        expect(r.bauform).toBe('netz');
        expect(r.warnungen).toContain('kein_resolver');
    });

    it('fängt einen werfenden Resolver, statt die Bearbeitung abzureißen', async () => {
        const r = await bestimme(EL, {
            resolver: resolverAttrappe({ axis: new Error('webgl weg'), solid: new Error('auch weg') }),
        });
        expect(r.bauform).toBe('netz');
        expect(r.warnungen.some(w => w.startsWith('achse_fehler:'))).toBe(true);
    });
});
