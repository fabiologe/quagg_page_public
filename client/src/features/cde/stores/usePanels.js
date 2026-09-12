/**
 * Panel-Registry (Sprint U, AP-U2).
 *
 * Ersetzt die 13 verstreuten boolean-refs, mit denen der Viewer bisher seine
 * Fenster auf- und zuklappte. Ein Panel ist jetzt ein DATENSATZ — dadurch
 * können Befehls-Palette (AP-U3), Hilfe-Overlay und Werkzeugleiste dieselbe
 * Quelle lesen, statt die Liste jeweils zu wiederholen.
 *
 * Die Panels docken in zwei Leisten (links/rechts) an und verkleinern den
 * Viewer, statt ihn zu überdecken: am Modell abzulesende Geometrie soll nicht
 * hinter einem Fenster verschwinden.
 *
 * Zustand (offene Panels, Leistenbreiten) wird über die RepoFacade gesichert —
 * derselbe Weg wie Ansichten, Stile und Overrides.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { repo } from '../services/RepoFacade.js';

const REPO_KEY = 'panel-state';

/**
 * Panel-Katalog. `seite` bestimmt die Leiste, `breite` den Startwert in px,
 * `kurz` die Beschriftung in der Reiterleiste (Kassensturz H1: die Tafeln
 * heissen nach dem, was man darin tut), `nurIn` den Ansichtsmodus, in dem die
 * Tafel überhaupt angeboten wird (H2).
 */
export const PANEL_DEFS = Object.freeze([
  { id: 'struktur', titel: 'Bauwerksstruktur',  kurz: 'Struktur', icon: 'tree',    seite: 'left',  breite: 300 },
  // Kassensturz H2: Werkzeuge und Merkmale sind EINE Tafel. Beide handeln vom
  // gewählten Bauteil — als zwei Tafeln verdrängten sie sich gegenseitig.
  { id: 'bauteil',  titel: 'Bauteil',                             icon: 'element', seite: 'right', breite: 360 },
  // Teil XII, X1: Der Versionsverlauf ist ERSTKLASSIG — vorher steckte er
  // als Reiter im Cockpit, wo ihn niemand suchte.
  { id: 'verlauf',  titel: 'Verlauf',                             icon: 'verlauf', seite: 'right', breite: 360 },
  { id: 'cockpit',  titel: 'Mengen und Kosten', kurz: 'Mengen',   icon: 'cockpit', seite: 'right', breite: 540 },
  { id: 'issues',   titel: 'Notizen',                             icon: 'issues',  seite: 'right', breite: 330 },
  { id: 'plan',     titel: 'Planinhalt',        kurz: 'Plan',     icon: 'karte',   seite: 'right', breite: 340, nurIn: 'lageplan' },
]);

/**
 * Alte IDs → die Tafel, in der sie aufgegangen sind. Gesicherte Zustände
 * tragen sie noch, und wer „toolbox" öffnet, soll die Tafel bekommen, die es
 * heute ist — nicht nichts.
 */
export const PANEL_ALIAS = Object.freeze({ toolbox: 'bauteil', eigenschaften: 'bauteil' });
const kanon = (id) => PANEL_ALIAS[id] ?? id;

const MIN_BREITE = 240;
const MAX_BREITE = 720;

export const usePanels = defineStore('cde-panels', () => {
  /** offene Panel-IDs */
  const offen = ref(new Set());
  /** id → Breite in px (nur für das jeweils sichtbare Panel einer Seite) */
  const breiten = ref(Object.fromEntries(PANEL_DEFS.map(p => [p.id, p.breite])));

  const defs = computed(() => PANEL_DEFS);
  const byId = (id) => PANEL_DEFS.find(p => p.id === kanon(id)) ?? null;

  const isOpen = (id) => offen.value.has(kanon(id));

  /** Sichtbares Panel einer Seite — pro Leiste zeigen wir genau eines. */
  const aktivLinks  = computed(() => PANEL_DEFS.find(p => p.seite === 'left'  && offen.value.has(p.id)) ?? null);
  const aktivRechts = computed(() => PANEL_DEFS.find(p => p.seite === 'right' && offen.value.has(p.id)) ?? null);

  function _persist() {
    repo.set(REPO_KEY, { offen: [...offen.value], breiten: { ...breiten.value } });
  }

  /** Öffnet ein Panel und schließt das bisherige derselben Leiste. */
  function open(id) {
    const def = byId(id);
    if (!def) return;
    const next = new Set(offen.value);
    for (const p of PANEL_DEFS) {
      if (p.seite === def.seite) next.delete(p.id);
    }
    next.add(def.id);
    offen.value = next;
    _persist();
  }

  function close(id) {
    const k = kanon(id);
    if (!offen.value.has(k)) return;
    const next = new Set(offen.value);
    next.delete(k);
    offen.value = next;
    _persist();
  }

  function toggle(id) {
    if (isOpen(id)) close(id);
    else open(id);
  }

  function closeSide(seite) {
    const next = new Set(offen.value);
    for (const p of PANEL_DEFS) {
      if (p.seite === seite) next.delete(p.id);
    }
    offen.value = next;
    _persist();
  }

  function setBreite(id, px) {
    const def = byId(id);
    if (!def) return;
    const v = Math.max(MIN_BREITE, Math.min(MAX_BREITE, Math.round(px)));
    breiten.value = { ...breiten.value, [def.id]: v };
    _persist();
  }

  /** Gesicherten Zustand laden (alte IDs umgeleitet, unbekannte verworfen). */
  async function laden() {
    const gespeichert = await repo.get(REPO_KEY);
    if (!gespeichert) return;
    if (Array.isArray(gespeichert.offen)) {
      // pro Seite höchstens eines
      const proSeite = new Map();
      for (const def of gespeichert.offen.map(byId).filter(Boolean)) proSeite.set(def.seite, def.id);
      offen.value = new Set(proSeite.values());
    }
    if (gespeichert.breiten && typeof gespeichert.breiten === 'object') {
      const zusammen = { ...breiten.value };
      for (const [id, px] of Object.entries(gespeichert.breiten)) {
        const def = byId(id);
        if (def && Number.isFinite(px)) {
          zusammen[def.id] = Math.max(MIN_BREITE, Math.min(MAX_BREITE, px));
        }
      }
      breiten.value = zusammen;
    }
  }

  const bereit = laden();

  return {
    defs, offen, breiten, bereit,
    byId, isOpen, aktivLinks, aktivRechts,
    open, close, toggle, closeSide, setBreite, laden,
  };
});
