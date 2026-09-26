import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const read = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf-8');
const themeCss = read('styles/theme.css');
const tutorialCss = read('tutorial/tutorial.css');

describe('Tutorial-Highlight ueberlebt die globale Button-Formatierung', () => {
  // Hintergrund: theme.css legt auf JEDEN Button eine clip-path-Pixelmaske und
  // einen box-shadow — beides mit !important und Spezifitaet 0-5-2. Die
  // Highlight-Klasse (0-1-0) verliert dagegen. Folge war: <div>-Anker
  // leuchteten, jeder BUTTON blieb dunkel. clip-path schneidet zusaetzlich
  // Outline UND Glow weg, weil beide ausserhalb der Button-Form liegen.

  it('die globale Button-Regel nimmt das Highlight ausdruecklich aus', () => {
    const selectorLines = themeCss
      .split('\n')
      .filter(l => l.includes('button:not(.close-btn)'));

    expect(selectorLines.length).toBeGreaterThan(0);
    for (const line of selectorLines) {
      expect(line, `Selektor ohne Highlight-Ausnahme: ${line.trim()}`)
        .toContain(':not(.sv-tutorial-highlight)');
    }
  });

  it('das Highlight schaltet zusaetzlich komponenteneigene clip-paths ab', () => {
    // Sidebar.vue setzt clip-path direkt auf .file-btn/.folder-btn (ohne
    // !important) — dagegen genuegt das !important der Highlight-Regel.
    expect(tutorialCss).toMatch(/\.sv-tutorial-highlight\s*\{[^}]*clip-path:\s*none\s*!important/s);
  });

  it('Highlight-Rahmen und -Glow nutzen den eigenen Tutorial-Token', () => {
    // Bewusst NICHT die Grün-Familie: die wurde fuer Text-Lesbarkeit auf
    // Beige abgedunkelt, der Aufmerksamkeitsring soll dagegen knallen.
    expect(tutorialCss).toContain('--isy-tutorial-glow');
    expect(themeCss).toMatch(/--isy-tutorial-glow:\s*#/);
  });
});

describe('Lesbarkeit: Textfarben laufen ueber Tokens, nicht an ihnen vorbei', () => {
  // Wiederkehrende Fehlerklasse in diesem Modul: eine Farbe wird direkt als
  // Hex-Literal gesetzt statt ueber eine Variable. Das faellt in dem Modus,
  // in dem entwickelt wurde, nicht auf — im anderen steht der Text dann auf
  // gleichhellem Grund. Zuletzt: "[Mehr dazu]" (#f9ca24 auf #eeeae1 = 1,3:1)
  // und der Lernkarten-Fliesstext (#9df5c0 auf #eeeae1 = 1,08:1).
  // Die Regel galt lange nur fuer die zwei Tutorial-Dateien. Ein Kontrast-Sweep
  // durch das laufende Modul (hell UND dunkel, jede Oberflaeche einmal
  // geoeffnet) hat dieselbe Fehlerklasse danach in fuenf weiteren Dateien
  // gefunden — Fliesstext auf 1,0:1 im Hellmodus, Knopfbeschriftungen auf
  // 1,9:1 im Dunkelmodus. Deshalb gilt sie jetzt fuer JEDE .vue des Moduls.
  const alleVue = (() => {
    const wurzel = path.resolve(__dirname, '..');
    const treffer = [];
    const lauf = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) {
          if (['node_modules', 'test'].includes(e.name)) continue;
          lauf(path.join(dir, e.name));
        } else if (e.name.endsWith('.vue')) {
          treffer.push(path.relative(wurzel, path.join(dir, e.name)));
        }
      }
    };
    lauf(wurzel);
    return treffer.sort();
  })();

  // Begruendete Ausnahmen — beide Male eine BEWUSST modusfeste Flaeche, auf der
  // eine feste Textfarbe genau richtig ist:
  //   .code-block  dunkles Codefenster (#1e1e1e) mit hellem Text
  //   .devil-btn   Signalrot des Osterei-Knopfes auf Papier
  const AUSNAHMEN = new Set([
    'components/modals/IsybauHelpModal.vue',
    'components/modals/KostraModal.vue',
  ]);

  it.each(alleVue.filter(f => !AUSNAHMEN.has(f)))('%s setzt keine Textfarbe als rohes Hex', (rel) => {
    const styles = read(rel).split('<style')[1] || '';
    // color: #abc / #aabbcc — erlaubt ist nur var(...) oder ein Schluesselwort.
    const roh = [...styles.matchAll(/(?<!-)\bcolor:\s*(#[0-9a-fA-F]{3,8})/g)].map(m => m[1]);
    expect(roh, `hartcodierte Textfarbe(n): ${roh.join(', ')}`).toEqual([]);
  });

  it('modusabhaengige Text-Tokens sind in BEIDEN Modi definiert', () => {
    // Fehlt einer, faellt genau ein Modus still auf den var()-Fallback zurueck
    // — also wieder auf eine feste Farbe, die auf einem der beiden
    // Untergruende zwangslaeufig durchfaellt.
    const block = (mode) => {
      const m = themeCss.match(new RegExp(`:root\\[data-theme="${mode}"\\][^{]*\\{([^}]*)\\}`, 's'));
      return m ? m[1] : '';
    };
    const hell = block('light');
    const dunkel = block('dark');
    expect(hell, 'Hell-Block nicht gefunden').toBeTruthy();
    expect(dunkel, 'Dunkel-Block nicht gefunden').toBeTruthy();

    for (const token of ['--isy-pixel-green-text', '--isy-pixel-info-accent', '--isy-pixel-text-glow']) {
      expect(hell, `${token} fehlt im Hell-Modus`).toContain(token);
      expect(dunkel, `${token} fehlt im Dunkel-Modus`).toContain(token);
    }
  });
});

describe('Inline-Knoepfe entkommen der globalen Pixel-Button-Fassung', () => {
  // Die globale Regel zwingt JEDEM <button> Bevel, clip-path und Schlagschatten
  // auf (mit !important, Spezifitaet 0-5-2). Fuer einen Knopf, der inline in
  // einer Textzeile sitzt — das "x" zum Regen-Entfernen — sprengt das die
  // Zeile. `.plain-btn` ist die generische Ausnahme dafuer.
  it('jeder Selektor der globalen Regel nimmt .plain-btn aus', () => {
    const zeilen = themeCss.split('\n').filter(l => l.includes('button:not(.close-btn)'));
    expect(zeilen.length).toBeGreaterThan(0);
    for (const z of zeilen) {
      expect(z, `Selektor ohne .plain-btn-Ausnahme: ${z.trim()}`).toContain(':not(.plain-btn)');
    }
  });

  it('das Regen-x traegt die Ausnahme-Klasse', () => {
    const src = read('components/panels/SimulationControls.vue');
    const knoepfe = [...src.matchAll(/class="rain-clear[^"]*"/g)].map(m => m[0]);
    // Seit es nur noch einen Regenweg gibt (KOSTRA-Übernahme = Blockregen,
    // doc/09 Befund 1), steht genau ein x neben der Regenanzeige.
    expect(knoepfe.length, 'x neben der Regenanzeige fehlt').toBe(1);
    for (const k of knoepfe) expect(k).toContain('plain-btn');
  });
});

describe('Die aufgeklappte Auswahlliste gehoert dem Modul, nicht dem System', () => {
  // Hintergrund: die Liste eines nativen <select> zeichnet der Browser
  // ausserhalb der Seite — im echten Fenster nachgemessen ist eine <option>
  // dann 0x0 Pixel gross und elementFromPoint() findet an ihrer Stelle nichts.
  // Der erste Versuch war `appearance: base-select`; das kann aber nur
  // Chromium, und der Nutzer arbeitet in Firefox. Seit 2026-08-31 zeichnet
  // PixelSelect.vue die Liste selbst.
  const liste = themeCss.slice(themeCss.indexOf('.isy-select-liste'));

  it('das Modul benutzt keine nativen Auswahlfelder mehr', () => {
    // Ein einzelnes zurueckgerutschtes <select> faellt sonst NICHT auf: in
    // Chromium sieht es beinahe richtig aus, in Firefox gar nicht.
    const wurzel = path.resolve(__dirname, '..');
    const treffer = [];
    const lauf = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) {
          if (['node_modules', 'test'].includes(e.name)) continue;
          lauf(path.join(dir, e.name));
        } else if (e.name.endsWith('.vue')) {
          const src = fs.readFileSync(path.join(dir, e.name), 'utf-8');
          // Kommentare raus: PixelSelect.vue ERKLAERT in seinem Kopf, warum es
          // kein natives <select> mehr gibt — das ist kein Markup.
          const vorlage = src.split('<script')[0].replace(/<!--[\s\S]*?-->/g, '');
          if (/<select[\s>]/.test(vorlage)) treffer.push(path.relative(wurzel, path.join(dir, e.name)));
        }
      }
    };
    lauf(wurzel);
    expect(treffer, `natives <select> in: ${treffer.join(', ')}`).toEqual([]);
  });

  it('Feld und Liste liegen auf denselben Regeln wie die uebrigen Felder', () => {
    // .isy-select muss in der Feld-Regel stehen, sonst fehlen ihm Pixel-Ecken,
    // Bevel und Fokusring — es saehe dann anders aus als jedes Eingabefeld
    // daneben.
    expect(themeCss).toMatch(/\.isy-select,?\s*\n[^{]*\{[^}]*clip-path: var\(--isy-pixel-clip-corner\)/s);
    expect(themeCss).toMatch(/\.isy-select[^{]*\{[^}]*background-image: var\(--isy-pixel-select-pfeil\)/s);
  });

  it('die Eintraege tragen den Zeiger des Moduls', () => {
    // Das ist der eigentliche Zweck der ganzen Uebung.
    expect(themeCss).toMatch(/\.isy-select-liste__eintrag[^{]*\{[^}]*cursor: var\(--isy-cursor-hand\)/s);
  });

  it('die Liste faerbt sich ueber Tokens, nicht ueber Hex-Literale', () => {
    const farbwerte = liste.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
    expect(farbwerte, `harte Farben in der Auswahlliste: ${farbwerte.join(', ')}`).toHaveLength(0);
  });

  it('die Liste haengt nicht am Modul-Container, sondern an der Wurzel', () => {
    // Sie wird per <Teleport> an <body> gehaengt; ein Selektor unter
    // .isybau-main wuerde sie nicht mehr treffen.
    expect(themeCss).toContain('html:has(.isybau-main) .isy-select-liste');
  });
});
