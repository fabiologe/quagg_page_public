/**
 * Wächter über das Farbsystem der CDE.
 *
 * Anlass (2026-08-29): Sprint U0 hatte die gewachsene Palette in Tokens
 * überführt — aber farbtreu, und damit einschließlich ihrer Widersprüche.
 * Der Nachzählung nach führte das Feature
 *
 *   • DREI Akzent-Blautöne  (#4fc3f7 als Token, rgba(52,152,219,…) in den
 *     Flächen-Tokens, rgba(33,150,243,…) in 9 handgeschriebenen Regeln),
 *   • DREI Grüntöne für „bestanden",
 *   • ZEHN Beinahe-Schwarztöne für ein und dieselbe Schwebefläche,
 *
 * verteilt über rund 260 Handwerte in 20 `<style scoped>`-Blöcken.
 *
 * Diese Tests halten den aufgeräumten Zustand fest. Sie prüfen NUR
 * `<style>`-Blöcke: Hex-Werte in Script und Template sind Datenwerte
 * (Annotationsfarben, KG-Farbtabelle, Linienfarben des Plans) und dürfen
 * dort ausdrücklich stehen — dieselbe Lehre wie beim Sweep in Sprint U0.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WURZEL = new URL('..', import.meta.url).pathname;
const THEME = join(WURZEL, 'styles/theme.css');

/** Alle Quelldateien des Features — .vue UND .js, ohne Tests. */
function alleQuellen(dir = WURZEL, treffer = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'test' || name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) alleQuellen(p, treffer);
    else if (/\.(vue|js)$/.test(name)) treffer.push(p);
  }
  return treffer;
}

function vueDateien(dir = WURZEL, treffer = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'test' || name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) vueDateien(p, treffer);
    else if (name.endsWith('.vue')) treffer.push(p);
  }
  return treffer;
}

/** Nur die <style>-Blöcke einer SFC — ohne Zeilen mit eingebetteten SVG-URLs. */
function stilBloecke(quelle) {
  return [...quelle.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .map((m) => m[1])
    .join('\n')
    // Kommentare zuerst blockweise weg — sie dürfen alte Werte zur
    // Erklärung nennen, und sie laufen über mehrere Zeilen.
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    // In `cursor: url("data:image/svg+xml,…")` stecken Farben INNERHALB der
    // Grafik. Die gehören zum Bild, nicht zum Thema.
    .filter((z) => !z.includes('data:image'));
}

const FARBE = /#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d/;

describe('Farbsystem', () => {
  it('definiert alle Farben in theme.css, nicht in den Komponenten', () => {
    const fundstellen = [];
    for (const datei of vueDateien()) {
      const zeilen = stilBloecke(readFileSync(datei, 'utf8'));
      for (const z of zeilen) {
        if (FARBE.test(z)) fundstellen.push(`${datei.replace(WURZEL, '')}  ${z.trim()}`);
      }
    }
    expect(fundstellen).toEqual([]);
  });

  it('benutzt nur Tokens, die theme.css auch definiert', () => {
    // Fehlerklasse aus flood-3D (2026-08-07): drei var(--f3d-…) zeigten auf
    // Tokens, die es nie gab. CSS meldet das nicht — die Eigenschaft fällt
    // ersatzlos weg, der Text stand unlesbar auf dunklem Grund.
    const css = readFileSync(THEME, 'utf8');
    const definiert = new Set(
      [...css.matchAll(/^\s*(--cde-[a-z0-9-]+)\s*:/gm)].map((m) => m[1]),
    );
    expect(definiert.size).toBeGreaterThan(50);

    const unbekannt = [];
    for (const datei of [...vueDateien(), THEME]) {
      const quelle = readFileSync(datei, 'utf8');
      const text = datei === THEME ? quelle : stilBloecke(quelle).join('\n');
      for (const m of text.matchAll(/var\(\s*(--cde-[a-z0-9-]+)\s*(?:,|\))/g)) {
        if (!definiert.has(m[1])) unbekannt.push(`${datei.replace(WURZEL, '')}: ${m[1]}`);
      }
    }
    expect([...new Set(unbekannt)]).toEqual([]);
  });

  it('führt genau EINEN Akzent- und EINEN Erfolgs-Grundton', () => {
    const css = readFileSync(THEME, 'utf8');
    // Die Flächen werden gemischt, nicht getrennt notiert — sonst können
    // Grundton und Fläche wieder auseinanderlaufen.
    for (const token of ['--cde-accent-fill', '--cde-accent-fill-hi', '--cde-accent-line']) {
      const zeile = css.split('\n').find((z) => z.trim().startsWith(token + ':'));
      expect(zeile, `${token} fehlt`).toBeDefined();
      expect(zeile).toContain('color-mix');
      expect(zeile).toContain('var(--cde-accent)');
    }
    const danger = css.split('\n').find((z) => z.trim().startsWith('--cde-danger-fill:'));
    expect(danger).toContain('var(--cde-danger)');
  });

  it('mischt die Schwebeflächen-Leiter aus einem Grundton', () => {
    const css = readFileSync(THEME, 'utf8');
    for (const t of ['--cde-float', '--cde-float-sheer', '--cde-float-deep', '--cde-float-deeper']) {
      expect(css).toContain(t + ':');
    }
    // Die Alpha-Schreibweise muss die Schrägstrich-Form sein; mit Komma
    // entstünde `rgb(30, 35, 50 / 0.95)` — gemischte Syntax, die der
    // Browser still verwirft und das Panel durchsichtig lässt.
    const tint = css.split('\n').find((z) => z.includes('--cde-float-tint:'));
    expect(tint).toMatch(/--cde-float-tint:\s*\d+ \d+ \d+;/);
  });

  it('hält die Papier-Nachbildung von den Themenrollen getrennt', () => {
    const css = readFileSync(THEME, 'utf8');
    // Blattvorschau und Schriftfeld bilden einen Ausdruck nach. Sie dürfen
    // NICHT mit dem Thema umschlagen — sonst zeigt die Vorschau etwas
    // anderes als das erzeugte PDF.
    for (const t of ['--cde-papier', '--cde-papier-text', '--cde-papier-rand']) {
      expect(css).toContain(t + ':');
    }
  });
});

describe('Kachel-Bausteine', () => {
  const KACHELN = [
    'IfcAreaSchedule.vue', 'IfcKgEditor.vue', 'IfcVolumeTab.vue', 'IfcCountTab.vue',
    'IfcKostenTab.vue', 'IfcPauschalTab.vue', 'IfcQualityTab.vue',
  ];

  it('stehen einmal in theme.css statt siebenmal in den Kacheln', () => {
    const css = readFileSync(THEME, 'utf8');
    for (const k of ['.cde-card-header', '.cde-card-title', '.cde-card-btn', '.cde-state-msg',
                     '.cde-totals', '.cde-total-cell', '.cde-table', '.cde-hint']) {
      expect(css, `${k} fehlt im Baustein-Layer`).toContain(k);
    }

    // Und keine Kachel darf sie erneut definieren.
    const doppelt = [];
    for (const name of KACHELN) {
      const zeilen = stilBloecke(readFileSync(join(WURZEL, 'components', name), 'utf8'));
      for (const z of zeilen) {
        if (/^\s*\.(card-header|card-title|card-btn|card-actions|state-msg|totals-bar|total-cell|total-label|total-value)\b/.test(z)) {
          doppelt.push(`${name}  ${z.trim()}`);
        }
      }
    }
    expect(doppelt).toEqual([]);
  });

  it('setzen ihre Leitfarbe über --card-accent', () => {
    // Die Summenzellen mischen ihre Fläche daraus. Fehlt die Zeile, fällt
    // die Kachel auf den Vorgabewert `.cde-card` zurück — kein Fehler, aber
    // dann sind alle sieben gleich blau und die Unterscheidung ist weg.
    for (const name of KACHELN) {
      const quelle = readFileSync(join(WURZEL, 'components', name), 'utf8');
      expect(stilBloecke(quelle).join('\n'), `${name} setzt --card-accent nicht`)
        .toMatch(/--card-accent:\s*var\(--cde-[a-z-]+\)/);
    }
  });
});

describe('Zustand des Pin-Modus', () => {
  it('wird gelesen statt gespiegelt', () => {
    // Gefunden am 2026-08-29: Die CdeView hielt eine eigene Kopie und
    // schrieb sie NUR beim Klick auf den Panel-Knopf fort. Endete der Modus
    // anders (Esc, oder von selbst nach dem Setzen eines Pins), blieb der
    // Knopf auf „Aktiv" stehen. Siehe die Fehlerklasse „gespiegelter
    // Zustand läuft auseinander".
    const cde = readFileSync(join(WURZEL, 'views/CdeView.vue'), 'utf8');
    expect(cde).toMatch(/const annotationActive = computed\(/);
    expect(cde).not.toMatch(/const annotationActive = ref\(/);
    expect(cde).not.toContain('isAnnotationActive');

    // Der Viewer muss den Zustand als Ref herausgeben, nicht als Getter —
    // sonst kann das computed die Änderung nicht nachverfolgen.
    const viewer = readFileSync(join(WURZEL, 'components/IfcViewer.vue'), 'utf8');
    const expose = viewer.slice(viewer.indexOf('defineExpose({'));
    expect(expose.slice(0, expose.indexOf('});'))).toMatch(/^\s*annotationActive,\s*$/m);
  });
});


describe('Das PDF-Modal ist aufgelöst (Sprint I, AP-11)', () => {
  it('hinterlässt keinen Fremdimport in der CDE', () => {
    // Es war der letzte Nutzer von `DraggableModal` aus isyifc — zusammen mit
    // dem `standalone`-Zweig des Viewers, den seit Sprint A niemand mehr nahm
    // (die CdeView, sein einziger Aufrufer, setzte die Prop fest). Damit ist
    // das Feature import-seitig geschlossen; isyifc bleibt unangetastet.
    const fremd = [];
    for (const datei of vueDateien(WURZEL)) {
      for (const m of readFileSync(datei, 'utf8').matchAll(/from '(@\/features\/[^']+)'/g)) {
        if (!m[1].startsWith('@/features/cde/')) fremd.push(`${datei.replace(WURZEL, '')}: ${m[1]}`);
      }
    }
    expect(fremd).toEqual([]);
  });

  it('lässt keine toten viewerApi-Schlüssel zurück', () => {
    // Sechzehn Schlüssel hatten nur das Modal als Nutzer, vier waren schon
    // vorher tot. Was bleibt, muss auch jemand rufen.
    const viewer = readFileSync(join(WURZEL, 'components/IfcViewer.vue'), 'utf8');
    const block = viewer.slice(viewer.indexOf('provideViewerApi({'));
    const schluessel = [...block.slice(0, block.indexOf('\n});'))
      .matchAll(/^ {2}([a-zA-Z_][a-zA-Z0-9_]*):/gm)].map((m) => m[1]);
    expect(schluessel.length).toBeGreaterThan(10);   // Schutz gegen Leerlauf

    // ALLE Quellen, nicht nur .vue: die Konsumenten sitzen zur Hälfte in
    // Composables und Diensten (PlanContent, usePlanExport).
    const quellen = alleQuellen(WURZEL)
      .filter((f) => !f.endsWith('IfcViewer.vue'))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    const ungenutzt = schluessel.filter((k) => !new RegExp(`\\b${k}\\b`).test(quellen));
    expect(ungenutzt).toEqual([]);
  });
});
