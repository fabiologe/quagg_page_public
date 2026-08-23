/**
 * Befehls-Registry (Sprint U, AP-U3).
 *
 * Alles, was die CDE kann, wird hier angemeldet: Werkzeuge, Panels, Exporte,
 * Projekt-Aktionen. Drei Verbraucher lesen dieselbe Liste —
 *   1. die Befehls-Palette (Strg+K),
 *   2. das Hilfe-Overlay (bisher eine hartkodierte Kopie der Tastaturlogik),
 *   3. Tooltips der Werkzeugleiste.
 * Dadurch kann eine Taste nicht mehr dokumentiert sein, ohne zu existieren —
 * und umgekehrt.
 *
 * Befehl:
 *   { id, titel, icon?, gruppe, key?, run(), verfuegbar?() }
 * `scope` bündelt Befehle einer Komponente, damit sie beim Verlassen wieder
 * abgemeldet werden können.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const usePaletteCommands = defineStore('cde-commands', () => {
  /** scope → Befehlsliste */
  const scopes = ref(new Map());
  /** zuletzt ausgeführte Befehls-IDs (jüngste zuerst) */
  const zuletzt = ref([]);

  const alle = computed(() => {
    const out = [];
    for (const liste of scopes.value.values()) out.push(...liste);
    return out.filter(c => (c.verfuegbar ? c.verfuegbar() : true));
  });

  /** Befehle mit Tastenkürzel — Grundlage des Hilfe-Overlays. */
  const mitTaste = computed(() => alle.value.filter(c => c.key));

  function register(scope, befehle) {
    const next = new Map(scopes.value);
    next.set(scope, befehle);
    scopes.value = next;
  }

  function unregister(scope) {
    if (!scopes.value.has(scope)) return;
    const next = new Map(scopes.value);
    next.delete(scope);
    scopes.value = next;
  }

  function run(id) {
    const cmd = alle.value.find(c => c.id === id);
    if (!cmd) return false;
    cmd.run();
    zuletzt.value = [id, ...zuletzt.value.filter(x => x !== id)].slice(0, 12);
    return true;
  }

  return { scopes, zuletzt, alle, mitTaste, register, unregister, run };
});

/**
 * Suche über die Befehle — reine Funktion, damit sie ohne Store testbar ist.
 *
 * Rangfolge: Titel-Präfix > Wortanfang > Teilstring; bei Gleichstand gewinnt
 * der zuletzt benutzte Befehl. Ohne Suchtext kommen die zuletzt benutzten
 * zuerst, danach die Registrierungsreihenfolge.
 */
export function filterCommands(befehle, query, zuletzt = []) {
  const q = (query ?? '').trim().toLowerCase();
  const rang = (id) => {
    const i = zuletzt.indexOf(id);
    return i === -1 ? 99 : i;
  };

  if (!q) {
    return [...befehle].sort((a, b) => rang(a.id) - rang(b.id));
  }

  const treffer = [];
  for (const c of befehle) {
    const titel = (c.titel ?? '').toLowerCase();
    const gruppe = (c.gruppe ?? '').toLowerCase();
    let score;
    if (titel.startsWith(q)) score = 0;
    else if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(titel)) score = 1;
    else if (titel.includes(q)) score = 2;
    else if (gruppe.includes(q)) score = 3;
    else continue;
    treffer.push({ c, score });
  }
  return treffer
    .sort((a, b) => (a.score - b.score) || (rang(a.c.id) - rang(b.c.id)))
    .map(t => t.c);
}
