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

/** Panel-Katalog. `seite` bestimmt die Leiste, `breite` den Startwert in px. */
export const PANEL_DEFS = Object.freeze([
  { id: 'eigenschaften', titel: 'Eigenschaften',      icon: 'info',    seite: 'right', breite: 330 },
  { id: 'struktur',      titel: 'Bauwerksstruktur',   icon: 'tree',    seite: 'left',  breite: 300 },
  { id: 'cockpit',       titel: 'Planungs-Cockpit',   icon: 'cockpit', seite: 'right', breite: 540 },
  { id: 'issues',        titel: 'Issues',             icon: 'issues',  seite: 'right', breite: 330 },
  { id: 'plan',          titel: 'Planinhalt',         icon: 'karte', seite: 'right', breite: 340 },
  { id: 'toolbox',       titel: 'Toolbox',            icon: 'edit',    seite: 'right', breite: 340 },
  // Teil XII, X1: Der Versionsverlauf ist ERSTKLASSIG — vorher steckte er
  // als Reiter im Cockpit, wo ihn niemand suchte.
  { id: 'verlauf',       titel: 'Verlauf',            icon: 'verlauf', seite: 'right', breite: 360 },
]);

const MIN_BREITE = 240;
const MAX_BREITE = 720;

export const usePanels = defineStore('cde-panels', () => {
  /** offene Panel-IDs */
  const offen = ref(new Set());
  /** id → Breite in px (nur für das jeweils sichtbare Panel einer Seite) */
  const breiten = ref(Object.fromEntries(PANEL_DEFS.map(p => [p.id, p.breite])));

  const defs = computed(() => PANEL_DEFS);
  const byId = (id) => PANEL_DEFS.find(p => p.id === id) ?? null;

  const isOpen = (id) => offen.value.has(id);

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
    next.add(id);
    offen.value = next;
    _persist();
  }

  function close(id) {
    if (!offen.value.has(id)) return;
    const next = new Set(offen.value);
    next.delete(id);
    offen.value = next;
    _persist();
  }

  function toggle(id) {
    if (offen.value.has(id)) close(id);
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
    const v = Math.max(MIN_BREITE, Math.min(MAX_BREITE, Math.round(px)));
    breiten.value = { ...breiten.value, [id]: v };
    _persist();
  }

  /** Gesicherten Zustand laden (unbekannte IDs werden verworfen). */
  async function laden() {
    const gespeichert = await repo.get(REPO_KEY);
    if (!gespeichert) return;
    if (Array.isArray(gespeichert.offen)) {
      const gueltig = gespeichert.offen.filter(id => byId(id));
      // pro Seite höchstens eines
      const proSeite = new Map();
      for (const id of gueltig) proSeite.set(byId(id).seite, id);
      offen.value = new Set(proSeite.values());
    }
    if (gespeichert.breiten && typeof gespeichert.breiten === 'object') {
      const zusammen = { ...breiten.value };
      for (const [id, px] of Object.entries(gespeichert.breiten)) {
        if (byId(id) && Number.isFinite(px)) {
          zusammen[id] = Math.max(MIN_BREITE, Math.min(MAX_BREITE, px));
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
