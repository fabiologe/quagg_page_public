// @vitest-environment jsdom
/**
 * Bauformregeln (Stufe 9.3a) — wenn der Typ nichts hergibt.
 *
 * DER ANLASS, und er ist echt: Fabios Kanalmodelle kommen aus ProVI und
 * enthalten ausschliesslich `IFCBUILDINGELEMENTPROXY`. Seine Einschätzung war,
 * dass Proxies „nur Geometrie" haben und Erkennen extrem aufwendig wäre.
 *
 * Der Entwässerungs-Export im Testordner sagt etwas anderes — dieser Test liest
 * ihn und zeigt es: der Exporteur schreibt das Fachwort sehr wohl, nur nicht in
 * den Typ, sondern in den NAMEN. Das ist keine Grundlage zum Raten (ein anderes
 * Büro nennt es anders), aber eine sehr gute zum ERKLÄREN: einmal sagen, was
 * „Haltung" in diesem Export bedeutet, und es gilt für jede Datei aus derselben
 * Software.
 *
 * Genau das ist „Regler statt Raterei" — die Maschine zeigt die Namen, ein
 * Mensch ordnet zu, die Zuordnung ist ein Datensatz auf der Büro-Ebene.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
    MITGELIEFERTE_REGELN, bauformAusRegel, ladeRegeln, namensvorschlaege, regelAus,
} from '../services/bauform/Bauformregeln.js';
import { bestimme } from '../services/bauform/Bauformen.js';
import { darfZiehen, guetehinweisZiehen } from '../services/Freiheitsgrade.js';
import { beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useBearbeitung } from '../stores/useBearbeitung.js';

beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); });

const PROXY = 'IFCBUILDINGELEMENTPROXY';
const ctx = (name, category = PROXY) => ({ category, attributes: { Name: name }, psets: {} });

describe('Der echte ProVI-Export im Testordner', () => {
    // Der Beleg für die ganze Entscheidung. Bricht er, weil die Datei sich
    // ändert, muss die mitgelieferte Regel neu geprüft werden — dann stimmt
    // die Beobachtung nicht mehr, auf der sie steht.
    const datei = join(dirname(fileURLToPath(import.meta.url)), 'IFCOUT_Entwässerung Export .IFC');
    const quelle = readFileSync(datei, 'latin1');

    it('enthält NUR Proxies — kein einziger Fachtyp', () => {
        expect(quelle.match(/IFCBUILDINGELEMENTPROXY/g)?.length).toBeGreaterThan(30);
        expect(quelle).not.toMatch(/IFCPIPESEGMENT|IFCFLOWSEGMENT|IFCDISTRIBUTIONCHAMBERELEMENT/);
    });

    it('trägt das Fachwort aber im NAMEN', () => {
        const namen = [...quelle.matchAll(/IFCBUILDINGELEMENTPROXY\('[^']*', *#\d+, *'([^']*)'/g)]
            .map(m => m[1]);
        expect(new Set(namen)).toEqual(new Set(['Schacht', 'Haltung']));
        expect(namen.filter(n => n === 'Haltung').length).toBeGreaterThan(10);
    });
});

describe('namensvorschlaege — die Maschine zeigt, was sie findet', () => {
    it('zählt die Namen je Kategorie, häufigste zuerst', () => {
        const elemente = [
            ...Array(18).fill(ctx('Haltung')),
            ...Array(19).fill(ctx('Schacht')),
            ctx('Wand', 'IFCWALL'),
        ];
        const v = namensvorschlaege(elemente);
        expect(v[0]).toEqual({ category: PROXY, name: 'Schacht', anzahl: 19 });
        expect(v[1]).toEqual({ category: PROXY, name: 'Haltung', anzahl: 18 });
    });

    it('übergeht Bauteile ohne Namen, statt einen leeren Vorschlag zu machen', () => {
        expect(namensvorschlaege([{ category: PROXY, attributes: {} }])).toEqual([]);
        expect(namensvorschlaege(null)).toEqual([]);
    });
});

describe('bauformAusRegel', () => {
    it('erkennt Haltung und Schacht aus dem mitgelieferten Satz', () => {
        expect(bauformAusRegel(MITGELIEFERTE_REGELN, ctx('Haltung')).bauform).toBe('achse+profil');
        expect(bauformAusRegel(MITGELIEFERTE_REGELN, ctx('Schacht')).bauform).toBe('koerper');
    });

    it('greift NICHT bei einem anderen Namen oder einer anderen Kategorie', () => {
        expect(bauformAusRegel(MITGELIEFERTE_REGELN, ctx('Baum'))).toBe(null);
        expect(bauformAusRegel(MITGELIEFERTE_REGELN, ctx('Haltung', 'IFCWALL'))).toBe(null);
    });

    it('übergeht Regeln, die gar keine Bauform aussprechen', () => {
        // Sonst gewänne eine Linienstil-Regel mit höherer Priorität und läge
        // dann still ohne Aussage.
        const gemischt = [
            { id: 'stil', enabled: true, priority: 99, condition: { category: PROXY }, style: { color: '#f00' } },
            ...MITGELIEFERTE_REGELN,
        ];
        expect(bauformAusRegel(gemischt, ctx('Haltung')).bauform).toBe('achse+profil');
    });

    it('verwirft eine Regel mit erfundener Bauform, statt sie durchzureichen', () => {
        const unsinn = [{ id: 'x', enabled: true, priority: 99,
                          condition: { category: PROXY }, bauform: 'bananenform' }];
        expect(bauformAusRegel(unsinn, ctx('Haltung'))).toBe(null);
    });
});

describe('regelAus — was das Zuordnungs-Werkzeug schreibt', () => {
    it('baut eine Regel, die genau dieses Bauteil trifft', () => {
        const r = regelAus({ category: PROXY, name: 'Haltung', bauform: 'achse+profil' });
        expect(bauformAusRegel([r], ctx('Haltung')).bauform).toBe('achse+profil');
        expect(bauformAusRegel([r], ctx('Schacht'))).toBe(null);
    });

    it('gibt ihr Vorrang vor dem mitgelieferten Satz', () => {
        // Eine eigene Zuordnung muss die Vorgabe schlagen — sonst könnte man
        // eine falsche Beobachtung nicht korrigieren.
        const eigen = regelAus({ category: PROXY, name: 'Haltung', bauform: 'koerper' });
        expect(bauformAusRegel([...MITGELIEFERTE_REGELN, eigen], ctx('Haltung')).bauform).toBe('koerper');
    });
});

describe('ladeRegeln — Projekt schlägt Büro schlägt mitgeliefert', () => {
    it('nimmt den mitgelieferten Satz ohne Repo', async () => {
        expect(await ladeRegeln(null)).toHaveLength(MITGELIEFERTE_REGELN.length);
    });

    it('lässt eigene Regeln den mitgelieferten Satz ERSETZEN', async () => {
        const eigen = [regelAus({ category: PROXY, name: 'Rohr', bauform: 'achse+profil' })];
        const geladen = await ladeRegeln({ mitVorrang: async () => eigen });
        expect(geladen).toEqual(eigen);
    });

    it('überlebt ein kaputtes Repo', async () => {
        const geladen = await ladeRegeln({ mitVorrang: async () => { throw new Error('kein Netz'); } });
        expect(geladen).toHaveLength(MITGELIEFERTE_REGELN.length);
    });
});

// ── Und jetzt der ganze Weg ────────────────────────────────────────────────

const resolverMit = (formen) => ({
    forElements: () => ({
        async getForm(form) {
            return formen[form] ?? { form, data: null, perElement: [], warnings: [] };
        },
    }),
});

/** Ein ProVI-Proxy: Skelettachse aus dem Netz, keine Achs-Repräsentation. */
const PROVI_HALTUNG = {
    axis: { form: 'axis', perElement: [{ polyline: [[0, 0, 0], [10, 0, 0]], source: 'mesh', warnings: [] }] },
    solid: { form: 'solid', data: { positions: new Float64Array(9), triCount: 1, closed: true }, warnings: [] },
};

describe('Der ganze Weg: aus einem Proxy wird eine ziehbare Leitung', () => {
    const el = { modelId: 'm1', localId: 1, category: PROXY, name: 'Haltung' };

    it('ordnet ihn OHNE Regel als Körper ein — nicht als Leitung', async () => {
        // Der Rückfall sieht ein geschlossenes Volumen und eine geschätzte
        // Achse. Ohne menschliche Aussage ist „Körper" das Ehrlichste.
        const r = await bestimme(el, { resolver: resolverMit(PROVI_HALTUNG) });
        expect(r.bauform).toBe('koerper');
        expect(r.quelle).toBe('geometrie');
    });

    it('ordnet ihn MIT Regel als Leitung ein', async () => {
        const r = await bestimme(el, {
            resolver: resolverMit(PROVI_HALTUNG),
            ausRegel: bauformAusRegel(MITGELIEFERTE_REGELN, ctx('Haltung')),
        });
        expect(r.bauform).toBe('achse+profil');
        expect(r.quelle).toBe('regel');
        expect(r.regel).toMatch(/ProVI/);
    });

    it('lässt ihn DANN auch ziehen, obwohl die Achse geschätzt ist', async () => {
        // Ohne diese Ausnahme wäre der ganze Kanalbestand unbearbeitbar. Die
        // Schranke schützt vor Raterei der MASCHINE — hier hat ein Mensch
        // gesagt, was es ist; geschätzt ist nur noch die Richtung.
        const r = await bestimme(el, {
            resolver: resolverMit(PROVI_HALTUNG),
            ausRegel: bauformAusRegel(MITGELIEFERTE_REGELN, ctx('Haltung')),
        });
        expect(r.guete).toBe('geschaetzt');
        expect(darfZiehen(r)).toBe(true);
    });

    it('sagt dabei, dass die Richtung geschätzt ist — der Hinweis bleibt', () => {
        const hinweis = guetehinweisZiehen({ bauform: 'achse+profil', guete: 'geschaetzt', quelle: 'regel' });
        expect(hinweis).toMatch(/geschätzt/);
    });

    it('lässt eine ungeklärte Skelettachse weiterhin NICHT ziehen', () => {
        // Die Schranke gilt unverändert, wo niemand etwas erklärt hat.
        expect(darfZiehen({ bauform: 'achse+profil', guete: 'geschaetzt', quelle: 'geometrie' })).toBe(false);
    });
});

describe('Zuordnen über den Store — der Weg, auf dem die Regel entsteht', () => {
    /** Ein Repo-Doppel, das nur merkt, was geschrieben wurde. */
    function fakeRepo(start = null) {
        let abgelegt = start;
        return {
            mitVorrang: async () => abgelegt,
            set: async (_k, v) => { abgelegt = v; },
            gespeichert: () => abgelegt,
        };
    }

    it('zeigt die Namen des Modells samt schon zugeordneter Bauform', async () => {
        const b = useBearbeitung();
        await b.ladeProfile(null);
        const v = b.vorschlaege([
            ...Array(18).fill({ category: PROXY, name: 'Haltung' }),
            ...Array(19).fill({ category: PROXY, name: 'Schacht' }),
            { category: PROXY, name: 'Unbekanntes Ding' },
        ]);
        expect(v.find(x => x.name === 'Haltung')).toMatchObject({ anzahl: 18, bauform: 'achse+profil' });
        expect(v.find(x => x.name === 'Schacht')).toMatchObject({ anzahl: 19, bauform: 'koerper' });
        // Was niemand zugeordnet hat, bleibt LEER — nicht geraten.
        expect(v.find(x => x.name === 'Unbekanntes Ding').bauform).toBe(null);
    });

    it('schreibt beim Zuordnen eine Regel, keine Einzelzuweisung', async () => {
        // Derselbe Exporteur nennt die Dinge in jeder Datei gleich — eine Regel
        // gilt damit auch für die nächste Lieferung.
        const b = useBearbeitung();
        await b.ladeProfile(null);
        const ziel = fakeRepo();
        await b.ordneZu({ category: PROXY, name: 'Rohrleitung', bauform: 'achse+profil' }, ziel);

        expect(bauformAusRegel(ziel.gespeichert(), ctx('Rohrleitung')).bauform).toBe('achse+profil');
    });

    it('ersetzt eine bestehende Zuordnung, statt sie zu stapeln', async () => {
        const b = useBearbeitung();
        await b.ladeProfile(null);
        const ziel = fakeRepo();
        await b.ordneZu({ category: PROXY, name: 'Haltung', bauform: 'koerper' }, ziel);
        await b.ordneZu({ category: PROXY, name: 'Haltung', bauform: 'achse+profil' }, ziel);

        const treffend = ziel.gespeichert().filter(r => r.condition?.value === 'Haltung' && r.bauform);
        expect(treffend).toHaveLength(1);
        expect(treffend[0].bauform).toBe('achse+profil');
    });

    it('nimmt eine Zuordnung mit null zurück — dann entscheidet wieder die Geometrie', async () => {
        const b = useBearbeitung();
        await b.ladeProfile(null);
        const ziel = fakeRepo();
        await b.ordneZu({ category: PROXY, name: 'Haltung', bauform: null }, ziel);
        expect(bauformAusRegel(ziel.gespeichert(), ctx('Haltung'))).toBe(null);
    });

    it('überlebt ein Repo, das nicht schreiben kann', async () => {
        // Ohne Netz soll die Zuordnung wenigstens in dieser Sitzung wirken.
        const b = useBearbeitung();
        await b.ladeProfile(null);
        const kaputt = { mitVorrang: async () => null, set: async () => { throw new Error('kein Netz'); } };
        await b.ordneZu({ category: PROXY, name: 'Rohr', bauform: 'achse+profil' }, kaputt);
        expect(bauformAusRegel(b.regeln, ctx('Rohr')).bauform).toBe('achse+profil');
    });
});
