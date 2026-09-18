/**
 * DER ARCHITEKTUR-WÄCHTER (Teil XXIII, A0).
 *
 * Zwei Audits am 2026-09-18 haben dasselbe gefunden: das Fundament trägt, aber
 * die Fachschicht wächst im falschen Stil — Bauteilnamen in Verzweigungen,
 * Importe nach oben, Werkzeuge, die sich nicht auf Muster + Operation +
 * Katalogeintrag zurückführen lassen. Ein Umbau ohne Netz bringt das nicht weg,
 * er verschiebt es nur: die nächste Stufe Facharbeit schreibt es wieder hinein.
 *
 * Dieser Test ist das Netz. Er MISST acht Dinge am Quelltext und hält je Datei
 * fest, wie viele Verstösse sie HEUTE hat. Die Regel:
 *
 *     DIE LISTEN DÜRFEN NUR SCHRUMPFEN.
 *
 *   - ein NEUER Verstoss (mehr als erlaubt, oder in einer neuen Datei) → rot
 *   - ein BEHOBENER Verstoss, der noch in der Liste steht            → rot,
 *     mit dem Satz „Liste nachziehen: X 3 → 2". Sonst wäre der Platz frei für
 *     den nächsten, und niemand merkte es.
 *
 * Gezählt wird je DATEI, nicht je Zeile: Zeilennummern wandern bei jedem
 * Commit, eine Anzahl nicht.
 *
 * MESSEN statt raten — der Stufenbericht braucht „Zahl vorher/nachher":
 *     ARCHITEKTUR_MESSEN=/pfad/aus.json npx vitest run …/architekturWaechter.test.js
 * schreibt alle gefundenen Zahlen in die Datei (nach dem Muster
 * `PAKET_VERTRAG_SCHREIBEN`). `console.log` taugt dafür nicht: der Build
 * streicht es als „pure".
 *
 * Die Schichtkarte unten ist zugleich die Dokumentation der Schichten.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { BEARBEITUNGEN } from '../services/Bearbeitungen.js';
import { REZEPTE } from '../services/Bauteilrezepte.js';
import { ABLEITUNGEN } from '../services/ableitung/Ableitungen.js';
import { GELAENDE_OPS } from '../services/gelaende/Operationen.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (p) => path.relative(WURZEL, p).split(path.sep).join('/');

function quellen(d = WURZEL, out = []) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) {
            if (!['node_modules', 'test', 'data'].includes(e.name)) quellen(p, out);
        } else if (/\.(js|vue)$/.test(e.name)) {
            out.push(p);
        }
    }
    return out;
}
const DATEIEN = quellen().map(p => ({ pfad: rel(p), text: fs.readFileSync(p, 'utf8') }));

/** Zeilen ohne Kommentar: Blockkommentare, `*`-Zeilen und der `//`-Rest fallen weg. */
function codezeilen(text) {
    const ohneBlock = text.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ''));
    return ohneBlock.split('\n').map(z => z.replace(/(^|[^:'"`])\/\/.*$/, '$1'));
}

/** Je Datei zählen, wie oft `regex` im CODE trifft. */
function zaehle(regex, { nur = () => true } = {}) {
    const aus = new Map();
    for (const { pfad, text } of DATEIEN) {
        if (!nur(pfad)) continue;
        let n = 0;
        for (const z of codezeilen(text)) n += (z.match(regex) ?? []).length;
        if (n) aus.set(pfad, n);
    }
    return aus;
}

/**
 * Die Ratsche: gefunden gegen erlaubt.
 * @returns {{neu: string[], nachziehen: string[]}}
 */
function ratsche(gefunden, erlaubt) {
    const neu = [], nachziehen = [];
    for (const [d, n] of gefunden) {
        const e = erlaubt[d] ?? 0;
        if (n > e) neu.push(`${d}: ${n} (erlaubt ${e})`);
    }
    for (const [d, e] of Object.entries(erlaubt)) {
        const n = gefunden.get(d) ?? 0;
        if (n < e) nachziehen.push(`${d}: ${e} → ${n}`);
    }
    return { neu: neu.sort(), nachziehen: nachziehen.sort() };
}

const MESSUNG = {};
const merke = (regel, gefunden) => {
    MESSUNG[regel] = gefunden instanceof Map ? Object.fromEntries([...gefunden].sort()) : gefunden;
};
afterAll(() => {
    const ziel = process.env.ARCHITEKTUR_MESSEN;
    if (ziel) fs.writeFileSync(ziel, JSON.stringify(MESSUNG, null, 2));
});

/** Eine Regel mit Ratsche als zwei Tests — „nichts Neues" und „Liste nachgezogen". */
function regel(name, gefunden, erlaubt) {
    merke(name, gefunden);
    const summe = Object.values(erlaubt).reduce((a, b) => a + b, 0);
    const r = ratsche(gefunden, erlaubt);
    it(`${name}: kein neuer Verstoss (heute erlaubt: ${summe})`, () => {
        expect(r.neu, 'neu hinzugekommen — beheben, nicht in die Liste schreiben').toEqual([]);
    });
    it(`${name}: die Liste ist nachgezogen`, () => {
        expect(r.nachziehen, 'behoben — die erlaubte Zahl in diesem Test senken').toEqual([]);
    });
}

// ═══ DIE LISTEN — Stand 2026-09-18, nach Teil XXII. Sie dürfen nur schrumpfen. ═══
//
// Sie stehen OBEN, weil `describe` seinen Rumpf beim Laden ausführt: eine
// Konstante weiter unten wäre dort noch nicht da.

/** W1 — Importe NACH OBEN. Ziel: leer (A8). */
const AUFWAERTS_ERLAUBT = {
    // Der Kern kennt die Geländeschicht (`gleicherBezug`) — Audit B9.
    'services/geometrie/ops/Koerper.js': 1,
    'services/geometrie/ops/Raster.js': 1,
    // Der Geometrie-Leser kennt IFC-Kategorien, Rohrsemantik und die
    // IFC-Datenkonfiguration — er IST der IFC-Leser und zieht in A8 aus dem
    // Kern aus (B11).
    'services/geometry/GeometryResolver.js': 3,
};

/** W1b — Anzeige/Oberfläche → `gelaende/` und `ableitung/`. Ziel: nur der Autor (A8). */
const DURCHGRIFF_ERLAUBT = {
    'components/IfcAenderungenTab.vue': 1,
    'components/IfcViewer.vue': 1,
    // BLEIBT: der Autor ist der Wirt des Ableitungslaufs — er baut aus dem Journal.
    'services/IfcAutor.js': 2,
    // `formeNach`/`massenAus` und `aushubMasseVon`: Massen rechnet nicht der Renderer (B13).
    'services/IfcEngine.js': 2,
};

/** W1c — `ERDBAU_PUNKTHOEHEN`, `KOERPERHAFT` ausserhalb der Katalogschicht. 7 → 0 mit A2 (Punktlisten fragt man das Rezept). */
const INTERNA_ERLAUBT = {};

/** W2 — Op-Namen in Verzweigungen. 38 → 0 mit A2: alles steht am Eintrag der Registry. */
const OPNAMEN_ERLAUBT = {};

/** W3 — Rezeptnamen ausserhalb des Katalogs. 19 → 0 mit A3: gefragt wird, was das Rezept KANN. */
const REZEPTNAMEN_ERLAUBT = {};

/**
 * W3b — Werkzeuge, die beim SCHREIBEN ein Netzrezept beim Namen nennen
 * (`rezept: 'rohr'`). Sie ersetzen gelieferte Netzelemente durch eigene Kopien;
 * WELCHES Rezept eine Kante oder ein Knoten bekommt, beantwortet AE
 * (Eigenschaftsart Netzrolle → Katalogrezept). Ziel: 0 (AE).
 */
const NETZREZEPT_SCHREIBER_ERLAUBT = {};      // AE: 6 → 0 — `rezeptFuerNetzrolle` fragt den Katalog

/** W4 — `geometrie/ops` am Kernel-Vertrag vorbei. Ziel: nur das Hilfen-Fass (A8). */
const KERNEL_ERLAUBT = {
    'components/IfcViewer.vue': 2,
    'services/Bauteilrezepte.js': 2,
    'services/Bearbeitungen.js': 1,
    'services/GlobalIdAbbildung.js': 1,
    'services/IfcEngine.js': 2,
    'services/Nachspielen.js': 1,
    'services/ableitung/Ableitungen.js': 5,
};

/** W6 — Codezeilen mit Fachwort in der Musterschicht. 21 → 0 mit A3: Griffart und Fang heissen „knoten". */
const FACHWOERTER_ERLAUBT = {};

/** W5 — Obergrenzen. `anwenden` sinkt mit A6, die Rezeptfunktionen mit A4. */
const HOOKS_MAX = { anwenden: 48, rezeptFunktionen: 17 };

/**
 * W7 — die Rückführung aus dem Audit „Bearbeitungsstruktur" (2026-09-18).
 * Mit A6 nennt jeder Katalogeintrag `muster`, `operation`, `katalog` selbst;
 * bis dahin steht die Einordnung hier.
 */
const RUECKFUEHRUNG = {
    /**
     * Bewusst ein Werkzeug je Bauteil: die ABLEITUNGEN bleiben Code (Entscheidung
     * E1) — ihr Werkzeug ist ihr Rezept. (AE: 16 → 3; die Netzwerkzeuge hängen
     * seit AE an Eigenschaften, der Eckenzug seit A2 an `punktlisten`.)
     */
    nichtRueckfuehrbar: [
        'kanalgraben-ableiten', 'bauwerksgrube-ableiten', 'aussparung-ableiten',
    ],
    /** Muster + Operation + Katalogeintrag gäbe es — trotzdem von Hand geschrieben (A6). */
    handgeschrieben: [
        'graben-ausheben', 'auffuellen', 'planum-herstellen', 'gerinne-einschneiden', 'boeschung-anschliessen',
        'sohlhoehen-setzen', 'deckelhoehe-setzen', 'bezugshoehe-setzen',
        'profilgroesse-setzen', 'profilform-setzen', 'staerke-setzen',
        'kg-setzen', 'din277-setzen', 'massnahme-setzen', 'umbenennen',
        'koerper-tauschen', 'loeschen', 'bauform-auslegen',
    ],
    /** Allgemeine Operation auf Bauform/Eigenschaft — oder aus Muster + Rezept ERZEUGT. */
    sauber: [
        'verschieben', 'drehen', 'kopieren', 'reihe',
        'stuetzpunkt-verschieben', 'stuetzpunkt-einfuegen', 'stuetzpunkt-entfernen', 'kante-verschieben',
        'linie-teilen', 'linie-trimmen', 'linie-versetzen',
        'flaeche-teilen', 'flaeche-vereinigen', 'flaeche-versetzen',
        // `zeichenBearbeitung(rezept)` — das Soll, einmal schon gebaut:
        'linie-zeichnen', 'flaeche-zeichnen', 'rohr-zeichnen', 'schacht-zeichnen',
        // AE: Operationen auf KNOTEN und KANTE — gebunden an `netzrolle`, nicht an
        // „Schacht"/„Haltung". Die Ids bleiben (sie stehen in `KUREN` und im Verlauf).
        'schacht-verschieben', 'schacht-einfuegen', 'schacht-entfernen', 'haltung-teilen',
        'an-schacht-anschliessen', 'trasse-aendern', 'strang-gefaelle-setzen', 'strang-massnahme',
        'strang-umbenennen', 'fliessrichtung-setzen', 'linie-umkehren',
        // A2: der Eckenzug fragt das Rezept nach `punktlisten` — jedes Rezept, das sie hat.
        'erdbau-stuetzpunkt-verschieben',
    ],
};
const RUECKFUEHRUNG_MAX = { nichtRueckfuehrbar: 3, handgeschrieben: 18 };

/** W8 — Fachregeln, die LOSE im Code liegen statt in einer Regeltabelle. Ziel: leer (AR). */
const LOSE_REGELN = [
    { name: 'MINDEST_UEBERDECKUNG', datei: 'services/ableitung/Ableitungen.js',
      muster: /export const MINDEST_UEBERDECKUNG\s*=/, quelle: 'DIN EN 1610, Regelfall ≥ 0,8 m' },
    { name: 'KANALGRABEN_ANSCHLUSS', datei: 'services/ableitung/Ableitungen.js',
      muster: /export const KANALGRABEN_ANSCHLUSS\s*=/, quelle: 'Setzung des Hauses' },
    { name: 'FANG_KNOTEN_M', datei: 'composables/useEingabe.js',
      muster: /const FANG_KNOTEN_M\s*=/, quelle: 'Setzung des Hauses — und in Schicht 1 (A3: umbenannt, zieht mit AR ins Regelwerk)' },
    { name: 'mindestGefaelle (1:DN)', datei: 'services/Befunde.js',
      muster: /1000\s*\/\s*dn/, quelle: 'Faustregel; die Norm nennt der Code nicht' },
];

// ═══ Die Schichtkarte ═══════════════════════════════════════════════════════
//
// Eine Schicht kennt sich selbst und was UNTER ihr liegt. Nach oben importiert
// niemand. Dateien, die hier nicht stehen, sind (noch) nicht zugeordnet und
// werden nicht geprüft — eine Zuordnung ist ein bewusster Schritt, kein Raten.
const SCHICHTEN = [
    { id: 'L0', titel: 'Kern — Knoten, Verbindungen, Flächen, Körper',
      passt: p => p.startsWith('services/geometrie/') || p.startsWith('services/geometry/') },
    { id: 'L1', titel: 'Fachregeln und Eigenschaftsarten',
      passt: p => /^services\/(gelaende|bauform|eigenschaften)\//.test(p)
          || ['services/Achsbezug.js', 'services/Hoehenbezug.js', 'services/Kategorien.js'].includes(p) },
    // Die Stationierung ist Geometrie und lebt im Kern (`geometrie/Stationierung.js`, AE):
    // der Profilkörper braucht sie, und der Kern importiert nicht nach oben.
    { id: 'L2', titel: 'Katalog — Rezepte, Ableitungen, Bibliothek, Regelwerk',
      passt: p => /^services\/(ableitung|rezept|katalog)\//.test(p)
          || ['services/Bauteilrezepte.js', 'services/Bibliothek.js'].includes(p) },
    { id: 'L3', titel: 'Journal und Werkzeuge',
      passt: p => p.startsWith('stores/')
          || /^services\/(Bearbeitungen|Griffe|Eingaben|Nachspielen|Journal\w+|Vorschau)\.js$/.test(p) },
    { id: 'L4', titel: 'Anzeige',
      passt: p => /^services\/(Ifc\w+|GelaendeKanten|ErdbauUmrisse)\.js$/.test(p) },
    { id: 'L5', titel: 'Oberfläche',
      passt: p => /^(composables|components|views)\//.test(p) },
];
const schichtVon = (p) => SCHICHTEN.findIndex(s => s.passt(p));

/** Alle relativen Importe einer Datei, aufgelöst auf den Pfad im Feature. */
function importeVon({ pfad, text }) {
    const aus = [];
    const muster = /(?:import|export)\s[^'"]*?from\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)|import\s*['"](\.[^'"]+)['"]/g;
    for (const m of text.matchAll(muster)) {
        const ziel = m[1] ?? m[2] ?? m[3];
        const voll = path.posix.normalize(path.posix.join(path.posix.dirname(pfad), ziel));
        aus.push({ ziel: voll, zeile: m[0].replace(/\s+/g, ' ') });
    }
    return aus;
}

describe('W1 — Schichten: niemand importiert nach oben', () => {
    const gefunden = new Map();
    for (const d of DATEIEN) {
        const von = schichtVon(d.pfad);
        if (von < 0) continue;
        let n = 0;
        for (const { ziel } of importeVon(d)) {
            const nach = schichtVon(ziel);
            if (nach > von) n++;
        }
        if (n) gefunden.set(d.pfad, n);
    }
    regel('W1 aufwärts', gefunden, AUFWAERTS_ERLAUBT);

    it('die Karte ordnet jede Datei höchstens EINER Schicht zu', () => {
        const doppelt = DATEIEN.filter(d => SCHICHTEN.filter(s => s.passt(d.pfad)).length > 1).map(d => d.pfad);
        expect(doppelt).toEqual([]);
    });
});

describe('W1b — Anzeige und Oberfläche greifen nicht an der Katalogschicht vorbei', () => {
    // L4/L5 → `gelaende/` (L1) und `ableitung/` (L2): zwei Ebenen tief. Der
    // Autor ist der WIRT des Ableitungslaufs — das bleibt, mit Grund.
    const gefunden = new Map();
    for (const d of DATEIEN) {
        if (schichtVon(d.pfad) < 4) continue;
        const n = importeVon(d).filter(i => /^services\/(gelaende|ableitung)\//.test(i.ziel)).length;
        if (n) gefunden.set(d.pfad, n);
    }
    regel('W1b Durchgriff', gefunden, DURCHGRIFF_ERLAUBT);
});

describe('W1c — Rezept-Interna bleiben in der Katalogschicht', () => {
    // `ERDBAU_PUNKTHOEHEN`, `KOERPERHAFT` sind Innereien der Ableitungen; wer sie
    // ausserhalb liest, weiss, wie ein Rezept gebaut ist (Audit B14).
    const gefunden = zaehle(/\b(ERDBAU_PUNKTHOEHEN|ERDBAU_HOEHENFELDER|KOERPERHAFT)\b/g,
        { nur: p => !/^services\/(ableitung|gelaende)\//.test(p) });
    regel('W1c Rezept-Interna', gefunden, INTERNA_ERLAUBT);
});

describe('W2 — Geländeoperationen: ihr Name steht nur in ihrer Registry', () => {
    const namen = Object.keys(GELAENDE_OPS).join('|');
    const muster = new RegExp(`(?:art\\s*[!=]==\\s*'(?:${namen})')|(?:case\\s*'(?:${namen})'\\s*:)`, 'g');
    // `Operationen.js` zählt MIT: dort stehen die Verzweigungen `wirkbereichVon`,
    // `wirkflaecheVon`, `kennweiteVon`, die A2 in die Registry zieht.
    regel('W2 Op-Namen', zaehle(muster), OPNAMEN_ERLAUBT);
});

describe('W3 — Rezeptnamen stehen nur im Katalog', () => {
    const namen = [...Object.keys(REZEPTE), ...Object.keys(ABLEITUNGEN)].join('|');
    // Drei Formen derselben Sache: der Vergleich (`rezept === 'rohr'`, auch
    // über `.id`), die Liste (`new Set(['linie', …`) und das NACHSCHLAGEN über
    // den Namen (`{ kanalgraben: … }[b.rezept]`). Die dritte fehlte bis A3 —
    // ein Wächter mit blindem Fleck zählt zu wenig und beweist nichts.
    // `case` zählt NICHT: `case 'linie'` ist dort eine Primitivart, kein Rezept.
    const muster = new RegExp(`(?:(?:rezept|\\.id)\\s*[!=]==\\s*'(?:${namen})')|(?:new Set\\(\\[\\s*'(?:${namen})')|(?:\\}\\[\\s*[\\w.?]*rezept\\s*\\])`, 'g');
    const gefunden = zaehle(muster, { nur: p => !/^services\/(ableitung\/|Bauteilrezepte\.js|Bibliothek\.js)/.test(p) });
    regel('W3 Rezeptnamen', gefunden, REZEPTNAMEN_ERLAUBT);
});

describe('W3b — Werkzeuge schreiben kein Netzrezept beim Namen', () => {
    const muster = /rezept:\s*'(?:rohr|schacht|linie|flaeche)'/g;
    const gefunden = zaehle(muster, { nur: p => !/^services\/(ableitung\/|Bauteilrezepte\.js|Bibliothek\.js)/.test(p) });
    regel('W3b Netzrezept-Schreiber', gefunden, NETZREZEPT_SCHREIBER_ERLAUBT);
});

describe('W4 — der Kernel-Vertrag: `geometrie/ops` importiert nur der Kern', () => {
    const gefunden = new Map();
    for (const d of DATEIEN) {
        if (d.pfad.startsWith('services/geometrie/')) continue;
        const n = importeVon(d).filter(i => i.ziel.startsWith('services/geometrie/ops/')).length;
        if (n) gefunden.set(d.pfad, n);
    }
    regel('W4 Kernel-Umgehung', gefunden, KERNEL_ERLAUBT);
});

describe('W5 — Code-Hooks im Katalog werden weniger, nicht mehr', () => {
    const hooks = (DATEIEN.find(d => d.pfad === 'services/Bearbeitungen.js').text.match(/^\s*anwenden:/gm) ?? []).length;
    const funktionen = Object.values(REZEPTE)
        .reduce((n, r) => n + Object.values(r).filter(v => typeof v === 'function').length, 0);
    merke('W5 Code-Hooks', { anwenden: hooks, rezeptFunktionen: funktionen });

    it(`Werkzeuge mit eigenem \`anwenden\`: höchstens ${HOOKS_MAX.anwenden}`, () => {
        expect(hooks).toBeLessThanOrEqual(HOOKS_MAX.anwenden);
    });
    it(`Funktionen in REZEPTE: höchstens ${HOOKS_MAX.rezeptFunktionen}`, () => {
        expect(funktionen).toBeLessThanOrEqual(HOOKS_MAX.rezeptFunktionen);
    });
    it('die Obergrenzen sind nachgezogen', () => {
        expect({ anwenden: hooks, rezeptFunktionen: funktionen }).toEqual(HOOKS_MAX);
    });
});

describe('W6 — die Musterschicht ist fachblind', () => {
    // Schicht 1: WIE der Nutzer Geometrie eingibt. Punkt setzen, Achse ziehen,
    // Fläche aufspannen — das kennt keinen Schacht.
    const MUSTER = ['services/Eingaben.js', 'composables/useEingabe.js', 'composables/useGriffe.js',
                    'services/Achszug.js', 'services/Fanglinien.js', 'services/Fangpunkte.js', 'composables/useVorschau.js'];
    const gefunden = new Map();
    for (const d of DATEIEN) {
        if (!MUSTER.includes(d.pfad)) continue;
        const n = codezeilen(d.text).filter(z => /schacht|haltung|\brohr|graben|erdbau|sohle|deckel|kanal|gerinne|boeschung/i.test(z)).length;
        if (n) gefunden.set(d.pfad, n);
    }
    regel('W6 Fachwörter im Muster', gefunden, FACHWOERTER_ERLAUBT);

    it('alle Musterdateien gibt es noch — sonst misst die Regel nichts', () => {
        expect(MUSTER.filter(p => !DATEIEN.some(d => d.pfad === p))).toEqual([]);
    });
});

describe('W7 — jedes Werkzeug lässt sich zurückführen: Muster + Operation + Katalogeintrag', () => {
    const ids = BEARBEITUNGEN.map(b => b.id);
    const alle = [...RUECKFUEHRUNG.nichtRueckfuehrbar, ...RUECKFUEHRUNG.handgeschrieben, ...RUECKFUEHRUNG.sauber];
    merke('W7 Rückführung', { nichtRueckfuehrbar: RUECKFUEHRUNG.nichtRueckfuehrbar.length,
                               handgeschrieben: RUECKFUEHRUNG.handgeschrieben.length,
                               sauber: RUECKFUEHRUNG.sauber.length, katalog: ids.length });

    it('ein NEUES Werkzeug muss eingeordnet werden — wer es schreibt, sagt, woraus es besteht', () => {
        expect(ids.filter(id => !alle.includes(id)), 'nicht eingeordnet').toEqual([]);
    });
    it('die Einordnung kennt kein Werkzeug, das es nicht mehr gibt', () => {
        expect(alle.filter(id => !ids.includes(id)), 'verwaist').toEqual([]);
    });
    it('kein Werkzeug steht in zwei Gruppen', () => {
        expect(alle.filter((id, i) => alle.indexOf(id) !== i)).toEqual([]);
    });
    it(`nicht rückführbar: höchstens ${RUECKFUEHRUNG_MAX.nichtRueckfuehrbar}, handgeschrieben: höchstens ${RUECKFUEHRUNG_MAX.handgeschrieben}`, () => {
        expect(RUECKFUEHRUNG.nichtRueckfuehrbar.length).toBeLessThanOrEqual(RUECKFUEHRUNG_MAX.nichtRueckfuehrbar);
        expect(RUECKFUEHRUNG.handgeschrieben.length).toBeLessThanOrEqual(RUECKFUEHRUNG_MAX.handgeschrieben);
    });
});

describe('W8 — Fachregeln stehen im Regelwerk, nicht lose im Code', () => {
    // Bis AR sind das Tabellen im Code; LOSE daneben liegen diese. Jede trägt
    // ihre Fundstelle — verschwindet sie dort, muss sie im Regelwerk angekommen
    // sein, und die Zeile hier fällt.
    const vorhanden = LOSE_REGELN.filter(({ datei, muster }) => {
        const d = DATEIEN.find(x => x.pfad === datei);
        return !!d && muster.test(d.text);
    }).map(r => r.name);
    merke('W8 lose Regeln', vorhanden);

    it('die Liste der losen Regeln ist nachgezogen', () => {
        expect(vorhanden).toEqual(LOSE_REGELN.map(r => r.name));
    });
    it('keine NEUE Normkonstante ausserhalb der Regeltabellen', () => {
        const erlaubt = new Set(LOSE_REGELN.map(r => r.name));
        const neu = [];
        const muster = /export const ([A-Z_]*(?:MINDEST_UEBERDECKUNG|GEFAELLE|UEBERDECKUNG|BOESCHUNGSWINKEL|ARBEITSRAUM)[A-Z_]*)\s*=/g;
        for (const d of DATEIEN) {
            if (/^services\/(gelaende\/Grabenregeln|Befunde)\.js$/.test(d.pfad)) continue;
            for (const m of d.text.matchAll(muster)) if (!erlaubt.has(m[1])) neu.push(`${d.pfad}: ${m[1]}`);
        }
        expect(neu).toEqual([]);
    });
});
