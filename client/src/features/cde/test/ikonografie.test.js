/**
 * Wächter über die Bildsprache der CDE.
 *
 * Anlass (2026-08-29): Die Oberfläche trug rund 120 Emoji als Symbole —
 * verteilt über 20 Komponenten, teils mit Bedeutung (die Ampel der
 * IDS-Prüfung war 🔴/🟡/🟢). Emoji sind dafür schlecht geeignet: ihre
 * Darstellung wechselt je Betriebssystem, sie folgen nicht der Textfarbe
 * (eine ausgeblendete Ebene konnte ihr Symbol nicht mitverblassen lassen),
 * und wo die Farbe IM ZEICHEN steckt, ist sie für Farbenblinde weg.
 *
 * Seit Sprint U gibt es dafür `components/ui/CdeIcon.vue` als einziges
 * Icon-Tor. Diese Tests halten fest, dass es auch das einzige bleibt:
 *
 *   1. keine Emoji mehr in den Quellen des Features,
 *   2. jeder benutzte Icon-NAME existiert wirklich (sonst rendert CdeIcon
 *      still ein Fragezeichen — ein Tippfehler fällt sonst erst am Bild auf),
 *   3. Tabelle und Namensliste in CdeIcon laufen nicht auseinander.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WURZEL = new URL('..', import.meta.url).pathname;
const CDE_ICON = join(WURZEL, 'components/ui/CdeIcon.vue');

/** Alle Quelldateien des Features — Tests und Fremddaten ausgenommen. */
function quellen(dir = WURZEL, treffer = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'test' || name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) quellen(p, treffer);
    // ifc-4.3.json ist ein 61-MB-Schema von buildingSMART, keine Quelle von uns.
    else if (/\.(vue|js)$/.test(name)) treffer.push(p);
  }
  return treffer;
}

/**
 * Piktogramm-Emoji. Bewusst NICHT enthalten: typografische Pfeile (→ ↑ ↓),
 * die in den deutschen Kommentaren als Satzzeichen dienen und dort richtig
 * sind — sie sind keine Symbole der Oberfläche.
 */
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu;

/** Namen aus dem exportierten ICON_NAMES-Array (ohne die .vue zu importieren). */
function bekannteNamen() {
  const src = readFileSync(CDE_ICON, 'utf8');
  const block = src.slice(src.indexOf('export const ICON_NAMES = ['));
  const liste = block.slice(0, block.indexOf('];'));
  return new Set([...liste.matchAll(/'([^']+)'/g)].map((m) => m[1]));
}

/** Schlüssel der ICONS-Tabelle — das ist, was zur Laufzeit wirklich zählt. */
function tabellenSchluessel() {
  const src = readFileSync(CDE_ICON, 'utf8');
  const block = src.slice(src.indexOf('const ICONS = {'), src.indexOf('const props'));
  return new Set([...block.matchAll(/^\s*'([^']+)':/gm)].map((m) => m[1]));
}

describe('CdeIcon — Tabelle und Namensliste', () => {
  it('führen dieselben Namen', () => {
    const tabelle = tabellenSchluessel();
    const namen = bekannteNamen();
    // Fehlt ein Name in der Liste, taucht das Icon in keiner Registry auf;
    // fehlt er in der Tabelle, rendert CdeIcon still ein Fragezeichen.
    expect([...tabelle].filter((n) => !namen.has(n))).toEqual([]);
    expect([...namen].filter((n) => !tabelle.has(n))).toEqual([]);
  });

  it('kennt die Ampel-Namen der IDS-Prüfung', () => {
    const tabelle = tabellenSchluessel();
    for (const n of ['status-ok', 'status-warn', 'status-error']) {
      expect(tabelle.has(n)).toBe(true);
    }
  });
});

describe('Bildsprache', () => {
  it('kommt ohne Emoji aus', () => {
    const fundstellen = [];
    for (const datei of quellen()) {
      const inhalt = readFileSync(datei, 'utf8');
      inhalt.split('\n').forEach((zeile, i) => {
        const treffer = zeile.match(EMOJI);
        if (treffer) {
          fundstellen.push(`${datei.replace(WURZEL, '')}:${i + 1}  ${treffer.join('')}`);
        }
      });
    }
    expect(fundstellen).toEqual([]);
  });

  it('benutzt nur Icon-Namen, die es gibt', () => {
    const namen = bekannteNamen();
    const unbekannt = [];

    for (const datei of quellen()) {
      const inhalt = readFileSync(datei, 'utf8');

      // a) <CdeIcon name="foo" />
      for (const m of inhalt.matchAll(/<CdeIcon[^>]*?\sname="([a-z0-9-]+)"/g)) {
        if (!namen.has(m[1])) unbekannt.push(`${datei.replace(WURZEL, '')}: ${m[1]}`);
      }

      // b) <CdeIcon :name="bedingung ? 'a' : 'b'" /> — beide ZWEIGE prüfen,
      //    nicht die Bedingung: dort stehen Vergleichswerte wie 'asc' oder
      //    'dxf', die keine Icon-Namen sind.
      for (const m of inhalt.matchAll(/<CdeIcon[^>]*?\s:name="([^"]+)"/g)) {
        const ausdruck = m[1];
        const ternaer = ausdruck.match(/\?\s*'([a-z0-9-]+)'\s*:\s*'([a-z0-9-]+)'/);
        const kandidaten = ternaer
          ? [ternaer[1], ternaer[2]]
          // Kein Ternär: nur ein einzelnes Literal zählt (`:name="'foo'"`).
          //  Alles andere ist eine Variable — die kann dieser Test nicht sehen.
          : (ausdruck.match(/^\s*'([a-z0-9-]+)'\s*$/)?.slice(1) ?? []);
        for (const k of kandidaten) {
          if (!namen.has(k)) unbekannt.push(`${datei.replace(WURZEL, '')}: ${k}`);
        }
      }
    }
    expect(unbekannt).toEqual([]);
  });

  it('bildet jede IFC-Kategorie des Ebenen-Panels auf ein echtes Icon ab', () => {
    const namen = bekannteNamen();
    const src = readFileSync(join(WURZEL, 'components/IfcLayerPanel.vue'), 'utf8');
    const block = src.slice(src.indexOf('const ICON_MAP = {'), src.indexOf('function categoryIcon'));
    const werte = [...block.matchAll(/:\s*'([a-z0-9-]+)'/g)].map((m) => m[1]);

    expect(werte.length).toBeGreaterThan(20);   // die Tabelle ist wirklich gefüllt
    expect(werte.filter((w) => !namen.has(w))).toEqual([]);

    // Und der Rückfall für unbekannte Kategorien muss ebenfalls existieren.
    expect(src).toContain("?? 'element'");
    expect(namen.has('element')).toBe(true);
  });

  it('nennt in den Cockpit-Reitern dieselben Icons wie die Kachelköpfe', () => {
    // Reiter und Kachelkopf zeigten früher verschiedene Emoji für dieselbe
    // Sache. Jetzt teilen sie den semantischen Namen — das ist prüfbar.
    const cockpit = readFileSync(join(WURZEL, 'components/IfcPlanningCockpit.vue'), 'utf8');
    const reiter = Object.fromEntries(
      [...cockpit.matchAll(/\{\s*id:\s*'([a-z]+)',\s*icon:\s*'([a-z-]+)'/g)].map((m) => [m[1], m[2]]),
    );
    expect(Object.keys(reiter).length).toBe(7);

    const kachelDatei = {
      areas:    'IfcAreaSchedule.vue',
      kg:       'IfcKgEditor.vue',
      volume:   'IfcVolumeTab.vue',
      count:    'IfcCountTab.vue',
      kosten:   'IfcKostenTab.vue',
      pauschal: 'IfcPauschalTab.vue',
      quality:  'IfcQualityTab.vue',
    };
    for (const [id, datei] of Object.entries(kachelDatei)) {
      const src = readFileSync(join(WURZEL, 'components', datei), 'utf8');
      const kopf = src.match(/<CdeCardHeader\s+icon="([a-z-]+)"/);
      expect(kopf, `${datei} hat keinen CdeCardHeader`).not.toBeNull();
      expect(kopf[1], `Reiter "${id}" und ${datei} zeigen verschiedene Icons`).toBe(reiter[id]);
    }
  });
});
