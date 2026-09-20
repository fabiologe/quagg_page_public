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
import { REZEPTE, REZEPT_QUELLEN } from '../services/Bauteilrezepte.js';
import { ABLEITUNGEN } from '../services/ableitung/Ableitungen.js';
import { GELAENDE_OPS } from '../services/gelaende/Operationen.js';
import { subjektAusStand } from '../services/kommando/Subjekt.js';
import { rahmenOhneBezug } from '../services/kommando/Kommando.js';
import { WELT } from './hilfen/werkzeugProben.js';

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
    // A8: leer. `gleicherBezug` lebt im Kern (B9); der Geometrie-Leser ist als
    // IFC-Leser nach `services/ifcleser/` gezogen (B11) und importiert von dort
    // nach unten; `geometry/` ist in `geometrie/` aufgegangen — ein Kern, ein Ordner.
};

/** W1b — Anzeige/Oberfläche → `gelaende/` und `ableitung/`. Ziel: nur der Autor (A8). */
const DURCHGRIFF_ERLAUBT = {
    // BLEIBT: der Autor ist der Wirt des Ableitungslaufs — er baut aus dem Journal.
    'services/IfcAutor.js': 2,
    // A8: die Engine rechnet keine Massen mehr (`Erdmassen.js`, B13), Viewer und
    // Änderungen-Reiter fragen die Beziehungen über den Katalog. 6 → 2.
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

/** W4 — `geometrie/ops` am Kernel-Vertrag vorbei. Seit A8 leer: von aussen nur das Hilfen-Fass. */
const KERNEL_ERLAUBT = {
    // A8: leer. Von aussen nur noch das Hilfen-Fass (`geometrie/hilfen.js`) —
    // Formen laufen über `kernel.op` (B12, B18). 14 → 0.
};

/** W6 — Codezeilen mit Fachwort in der Musterschicht. 21 → 0 mit A3: Griffart und Fang heissen „knoten". */
const FACHWOERTER_ERLAUBT = {};

/**
 * W5 — Obergrenzen. `anwenden` sank mit A6 von 48 auf 32: 18 Werkzeuge sind
 * Daten, dazu zwei Fabriken (Setzer, Geländewerkzeug), die je einmal zählen. Die Rezeptfunktionen zählen seit
 * A4 in den QUELLEN des Katalogs (Deklarationen + Code-Rezepte), nicht im
 * aufgelösten Rezept: dort stehen die Funktionen des Rezeptbaus, einmal für
 * alle geschrieben. 17 → 2 (nur das Altrezept `gelaende`: verschiebe, baueMit).
 */
const HOOKS_MAX = { anwenden: 33, rezeptFunktionen: 2 };   // A6: 48 → 32, + Spiegeln (neu, geplant)

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
        // A6: leer. Die elf Setzer und „Löschen", „Bauform auslegen" sind
        // Deklarationen (`setzt`), die fünf Geländewerkzeuge entstehen aus ihrer
        // Operation (`GELAENDE_OPS[art].werkzeug`) — W7 ordnet sie über die
        // Herkunft ein (`AUS_DATEN`).
    ],
    /** Allgemeine Operation auf Bauform/Eigenschaft — oder aus Muster + Rezept ERZEUGT. */
    sauber: [
        'verschieben', 'drehen', 'kopieren', 'reihe',
        // A6: Spiegeln — eine allgemeine Lageoperation auf der Punktliste, wie Drehen.
        'spiegeln',
        // A6: „Vorlage anwenden" — eine allgemeine Operation der Bibliothek, an
        // das REZEPT des Bauteils gebunden (Daten), an keinen Namen.
        'koerper-tauschen',
        'stuetzpunkt-verschieben', 'stuetzpunkt-einfuegen', 'stuetzpunkt-entfernen', 'kante-verschieben',
        'linie-teilen', 'linie-trimmen', 'linie-versetzen',
        'flaeche-teilen', 'flaeche-vereinigen', 'flaeche-versetzen',
        // `zeichenBearbeitung(rezept)` ordnet W7 über die HERKUNFT ein (`AUS_KATALOG`).
        // AE: Operationen auf KNOTEN und KANTE — gebunden an `netzrolle`, nicht an
        // „Schacht"/„Haltung". Die Ids bleiben (sie stehen in `KUREN` und im Verlauf).
        'schacht-verschieben', 'schacht-einfuegen', 'schacht-entfernen', 'haltung-teilen',
        'an-schacht-anschliessen', 'trasse-aendern', 'strang-gefaelle-setzen', 'strang-massnahme',
        'strang-umbenennen', 'linie-umkehren',
        // A2: der Eckenzug fragt das Rezept nach `punktlisten` — jedes Rezept, das sie hat.
        'erdbau-stuetzpunkt-verschieben',
    ],
};
const RUECKFUEHRUNG_MAX = { nichtRueckfuehrbar: 3, handgeschrieben: 0 };

/** W8 — Fachregeln, die LOSE im Code liegen statt in einer Regeltabelle. Ziel: leer (AR). */
const LOSE_REGELN = [
    // AR: leer. Mindestüberdeckung, Anschlussweite, Knotenfang und die 1:DN-
    // Formel stehen im Regelwerk (`regeln/Regelwerk.js`) — je Wert mit
    // Eigenschaft, Art und Quelle, von Büro und Projekt überschreibbar.
]

// ═══ Die Schichtkarte ═══════════════════════════════════════════════════════
//
// Eine Schicht kennt sich selbst und was UNTER ihr liegt. Nach oben importiert
// niemand. Dateien, die hier nicht stehen, sind (noch) nicht zugeordnet und
// werden nicht geprüft — eine Zuordnung ist ein bewusster Schritt, kein Raten.
const SCHICHTEN = [
    { id: 'L0', titel: 'Kern — Knoten, Verbindungen, Flächen, Körper',
      passt: p => p.startsWith('services/geometrie/') },
    { id: 'L1', titel: 'Fachregeln und Eigenschaftsarten',
      passt: p => /^services\/(gelaende|bauform|eigenschaften|regeln)\//.test(p)
          || ['services/Achsbezug.js', 'services/Hoehenbezug.js', 'services/Kategorien.js'].includes(p) },
    // Die Stationierung ist Geometrie und lebt im Kern (`geometrie/Stationierung.js`, AE):
    // der Profilkörper braucht sie, und der Kern importiert nicht nach oben.
    { id: 'L2', titel: 'Katalog — Rezepte, Ableitungen, Bibliothek, Regelwerk',
      passt: p => /^services\/(ableitung|rezept|katalog)\//.test(p)
          || ['services/Bauteilrezepte.js', 'services/Bibliothek.js'].includes(p) },
    // Das Kommando (Teil XXIV, K1) ist die Naht zwischen Oberfläche und Modell —
    // es gehört zu Journal und Werkzeugen, nie darüber.
    { id: 'L3', titel: 'Journal und Werkzeuge',
      passt: p => p.startsWith('stores/') || p.startsWith('services/kommando/')
          || /^services\/(Bearbeitungen|Griffe|Eingaben|Nachspielen|Journal\w+|Vorschau|Prueflauf)\.js$/.test(p) },
    { id: 'L4', titel: 'Anzeige und IFC-Leser',
      passt: p => /^services\/(Ifc\w+|GelaendeKanten|ErdbauUmrisse)\.js$/.test(p) || p.startsWith('services/ifcleser/') },
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
    const funktionen = REZEPT_QUELLEN
        .reduce((n, r) => n + Object.values(r).filter(v => typeof v === 'function').length, 0);
    merke('W5 Code-Hooks', { anwenden: hooks, rezeptFunktionen: funktionen });

    it(`Werkzeuge mit eigenem \`anwenden\`: höchstens ${HOOKS_MAX.anwenden}`, () => {
        expect(hooks).toBeLessThanOrEqual(HOOKS_MAX.anwenden);
    });
    it(`Funktionen in den Katalogquellen: höchstens ${HOOKS_MAX.rezeptFunktionen}`, () => {
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
    // AUS DATEN ERZEUGT — das Soll. Eingeordnet durch die HERKUNFT, nicht
    // durch eine Namensliste: ein Rezept aus der Bibliothek (A5) bringt sein
    // Werkzeug mit, eine neue Geländeoperation ihres (A6).
    //   ausRezept   Muster + Rezept (`zeichenBearbeitung`, Setzer eines Rezeptfelds)
    //   setzt       Muster + allgemeine Operation + Rolle/Merkmal (Setzer-Deklaration)
    //   operation   Muster + Geländeoperation (`formwerkzeugFuer`)
    const AUS_DATEN = BEARBEITUNGEN.filter(b => b.ausRezept || b.setzt || b.operation).map(b => b.id);
    const alle = [...RUECKFUEHRUNG.nichtRueckfuehrbar, ...RUECKFUEHRUNG.handgeschrieben,
                  ...RUECKFUEHRUNG.sauber, ...AUS_DATEN];
    merke('W7 Rückführung', { nichtRueckfuehrbar: RUECKFUEHRUNG.nichtRueckfuehrbar.length,
                               handgeschrieben: RUECKFUEHRUNG.handgeschrieben.length,
                               sauber: RUECKFUEHRUNG.sauber.length, ausDaten: AUS_DATEN.length, katalog: ids.length });

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

/**
 * W9 — DER SUBJEKTVERTRAG (Teil XXV, V0).
 *
 * Die Werkzeuge lesen ihr Bauteil als Objekt (`el.achse`, `el.stand`, …). Für
 * ein EIGENES Bauteil baut `kommando/Subjekt.js` dieses Objekt aus dem Journal
 * (K3) — ohne Viewer, ohne Engine. Jedes Feld, das ein Werkzeug liest und der
 * Stand nicht liefert, ist ein Werkzeug, das ohne Oberfläche nicht läuft
 * (gemessen: `reichweite.test.js`).
 *
 * Gemessen am 2026-09-20: neun Felder fehlten, davon drei ohne Bezug zu einem
 * Bauteil (siehe `KEIN_BAUTEILFELD`). Von den sechs übrigen hat V3 drei
 * geholt: `erdbau` steht im Journal und kommt mit `subjektAusStand`,
 * `eigeneFlaechen` und `vorlagen` sind keine Felder mehr — die beiden
 * Werkzeuge fragen den Kandidaten-Auföser (`kommando/Kandidaten.js`).
 * Es bleiben drei, und die kommen aus GELIEFERTER Geometrie.
 */
const SUBJEKT_ERLAUBT = {
    // Kandidaten aus der Engine: welche Gelände- bzw. Körperquellen es im
    // geladenen Modell gibt. Kein eigenes Bauteil beschreibt sie.
    'gelaendeQuellen': 1,
    'koerperQuellen': 1,
    // Das Prüfmass einer gelieferten Quelle (Dreiecke, Spannweiten) — es
    // entsteht beim Auflösen der Geometrie, nicht im Journal.
    'quellmass': 1,
};

/** Felder, die kein Bauteil beschreiben — sie gehören nicht in den Subjektvertrag. */
const KEIN_BAUTEILFELD = new Set([
    'punkte',            // das GEZEICHNETE beim Erzeugen (`{punkte, hoehenversatz}`)
    'modelId', 'modellSha',  // die Datei, aus der es stammt — der Aufrufer weiss sie
]);

describe('W9 — was ein Werkzeug vom Bauteil liest, liefert der Stand', () => {
    const quelle = fs.readFileSync(path.join(WURZEL, 'services/Bearbeitungen.js'), 'utf8');
    const gelesen = new Set([...quelle.matchAll(/\bel\??\.([a-zA-Z][a-zA-Z0-9]*)/g)].map(m => m[1]));
    // Was `subjektAusStand` für ein eigenes Bauteil liefert — an der echten
    // Probenwelt gemessen, nicht am Text der Datei.
    const wirksamerStand = (art) => (art === 'erzeugt' ? WELT : new Map());
    const rahmen = rahmenOhneBezug({ hoehenversatz: 300 });
    const geliefert = new Set();
    for (const gid of WELT.keys()) {
        const s = subjektAusStand(gid, { wirksamerStand, rahmen });
        if (s) for (const k of Object.keys(s)) geliefert.add(k);
    }
    const fehlend = new Map();
    for (const k of gelesen) {
        if (geliefert.has(k) || KEIN_BAUTEILFELD.has(k)) continue;
        fehlend.set(k, 1);
    }
    regel('W9 Subjektvertrag', fehlend, SUBJEKT_ERLAUBT);

    it('der Stand liefert, woran die Auswertung hängt: Achse, Strang, Anschlüsse, Stand, Erdbau', () => {
        for (const feld of ['achse', 'strang', 'anschluesse', 'stand', 'anker', 'versatz', 'knotenImNetz', 'erdbau']) {
            expect(geliefert.has(feld), feld).toBe(true);
        }
    });

    it('Katalogdaten gehen durch EINEN Schreibweg (V8)', () => {
        // Vorlagen, Rezepte, Typprofile, Bauformregeln und das Regelwerk wurden
        // an sechs Stellen in zwei Dateien geschrieben, jede mit eigener
        // Fehlerbehandlung — und keine hinterlässt eine Spur (E4 nennt dafür
        // einen eigenen Verlauf, F7 steht seit dem Abgleich). Ab hier ist es
        // eine Naht: `katalog/Katalogablage.js`.
        const schluessel = ['bauteil-vorlagen', 'bauteil-rezepte', 'typprofile', 'bauformregeln', 'regelwerk'];
        const treffer = [];
        for (const d of DATEIEN) {
            if (d.pfad.startsWith('test/') || d.pfad === 'services/katalog/Katalogablage.js') continue;
            // `REPO_KEY` heisst in drei Modulen verschieden (Journal, Ansicht,
            // Bibliothek) — er zählt nur, wo die Datei eine Katalogquelle holt.
            const ausKatalog = /from '.*(Bibliothek|bauform\/Typprofile|bauform\/Bauformregeln)\.js'/.test(d.text);
            for (const zeile of d.text.split('\n')) {
                if (!/\.set\s*\(/.test(zeile)) continue;
                const wortlaut = schluessel.some(k => zeile.includes(`'${k}'`));
                const konstante = /\.set\s*\((TYP_KEY|REGEL_KEY|REZEPTE_KEY|REGELWERK_KEY)\b/.test(zeile)
                    || (ausKatalog && /\.set\s*\(REPO_KEY\b/.test(zeile));
                if (wortlaut || konstante) treffer.push(`${d.pfad}: ${zeile.trim().slice(0, 60)}`);
            }
        }
        expect(treffer).toEqual([]);                               // vorher: 6
    });

    it('kein Produktionsweg schreibt einen Einzelschritt OHNE Beleg (V6)', () => {
        // `useAenderungen.eintragen` schreibt EINEN Schritt ohne Kommando und
        // ohne Systembeleg. Seit R2 geht jeder Schreibweg der Produktion über
        // `eintragenVorgang` und trägt einen Beleg (O4); gemessen 2026-09-20:
        // null Aufrufer ausserhalb der Tests. Der Export bleibt — Tests nutzen
        // ihn als Einzelschritt-Helfer —, aber die Tür ist zu.
        const treffer = DATEIEN
            .filter(d => !d.pfad.startsWith('test/') && d.pfad !== 'stores/useAenderungen.js')
            .filter(d => /\.eintragen\s*\(/.test(d.text.replace(/eintragenVorgang\s*\(/g, '')))
            .map(d => d.pfad);
        expect(treffer).toEqual([]);
    });

    it('kein Werkzeug erwartet mehr eine fertige LISTE am Subjekt (V3)', () => {
        // `optionen: (el) => …` liest eine Liste vom Subjekt; `optionenAus`
        // nennt eine Kandidatenart und fragt damit dieselbe Stelle wie die
        // Auswertung. Übrig sind die drei Ableitungen: ihre Kandidaten kommen
        // aus der ENGINE (Gelände- und Körperquellen des geladenen Modells).
        const mitFunktion = BEARBEITUNGEN
            .filter(b => (b.felder ?? []).some(f => typeof f.optionen === 'function')).map(b => b.id);
        expect(mitFunktion.sort()).toEqual([                       // vorher: 5
            'aussparung-ableiten', 'bauwerksgrube-ableiten', 'kanalgraben-ableiten',
        ]);
    });
});
