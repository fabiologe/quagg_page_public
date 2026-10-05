// @vitest-environment jsdom
/**
 * Teil XXXI, T1 — der Stand nach dem Bearbeiten ist klar.
 *
 * Tabletlauf T0 (2026-10-05): nach dem Loslassen eines Griffs räumte `zugEnde` den Geist sofort, `ausfuehren` schloss
 * das Werkzeug, 1–6 s stand der ALTE Zustand ohne jedes Zeichen da, die Tafel sprang auf die Werkzeugliste und nach dem
 * Neuaufbau zurück — Fabios „der Stand ist irgendwie unklar". Jetzt: der Geist bleibt am neuen Ort, bis das Bild steht;
 * „Wird übernommen …" mit der Plananimation (Fabio: „aus flood-2D, nur in passender Farbe"); die Zeichenfläche nimmt so
 * lange nichts an; die Tafel zeigt den Umbau statt der Liste.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { h, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/services/api', () => ({
  default: { get: vi.fn(async () => ({ data: {} })), post: vi.fn(async () => ({ data: {} })), put: vi.fn(async () => ({ data: {} })) },
}));

import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useIfcStore } from '../stores/useIfcStore.js';
import { useGriffe } from '../composables/useGriffe.js';
import { provideViewerApi } from '../composables/viewerApi.js';
import CdeToolbox from '../components/CdeToolbox.vue';
import CdeUmbauAnzeige from '../components/CdeUmbauAnzeige.vue';

const WURZEL = fileURLToPath(import.meta.url).replace(/test[\/][^\/]+$/, '');
const lies = (p) => readFileSync(WURZEL + p, 'utf8');
let pinia;
beforeEach(() => { localStorage.clear(); pinia = createPinia(); setActivePinia(pinia); useBearbeitung().modusSetzen(true); });

describe('der Umbau im Store — ein Zähler', () => {
  it('läuft während der Arbeit, auch überlappend; endet auch nach einem Fehler', async () => {
    const b = useBearbeitung();
    expect(b.umbauLaeuft).toBe(false);
    let los1, los2;
    const a = b.imUmbau(() => new Promise(r => { los1 = r; }));
    const c = b.imUmbau(() => new Promise(r => { los2 = r; }));
    expect(b.umbauLaeuft).toBe(true);
    los1(1); await a;
    expect(b.umbauLaeuft).toBe(true);                         // der zweite läuft noch
    los2(2); await c;
    expect(b.umbauLaeuft).toBe(false);
    await expect(b.imUmbau(async () => { throw new Error('kaputt'); })).rejects.toThrow('kaputt');
    expect(b.umbauLaeuft).toBe(false);
  });
});

describe('der Griffzug: der Geist bleibt, bis das Bild steht', () => {
  const SCHAECHTE = [{ globalId: 'S1', name: 'S 1', modelId: 'm1', localId: 11, punkt: { x: 0, y: 3, z: 0 }, herkunft: 'geliefert' }];
  function baue() {
    const b = useBearbeitung();
    const e = {
      knotenGriffe: () => SCHAECHTE, schachtAnschluesse: () => [],
      zeigeGriffe: vi.fn(), griffUnter: vi.fn(() => 'knoten:S1'), griffHervorheben: vi.fn(), griffVersetzen: vi.fn(),
      zeigeZugbild: vi.fn(), overlayZeige: vi.fn(), overlayLeere: vi.fn(), geistLeeren: vi.fn(),
      blickrichtung: () => ({ x: 0, y: -0.7, z: -0.7 }),
      strahl: (x, y) => ({ origin: { x, y: 100, z: y }, direction: { x: 0, y: -1, z: 0 } }),
    };
    let fertig;
    const nachBauen = vi.fn(() => new Promise(r => { fertig = r; }));
    const g = useGriffe({
      engine: ref(e), bearbeitung: b, aenderungen: useAenderungen(),
      getSubjekt: () => b.bauteil, getTypprofil: () => b.typprofil,
      getVersatz: () => ({ x: 1000, y: 0, z: 2000 }), getHoehenversatz: () => 0,
      holeKnotenSubjekt: async (gid) => ({ globalId: gid, modelId: 'm1', localId: 11, anker: { x: 0, y: 3, z: 0 },
        lage: { ost: 1000, nord: -2000 }, versatz: { x: 1000, y: 0, z: 2000 }, lageUmkehrbar: true, anschluesse: [] }),
      lieferstandVon: () => ({ x: 0, y: 3, z: 0 }),
      nachBauen, getModellSha: () => 'sha1', getWer: () => 'Fabio', melde: vi.fn(),
      farben: () => ({ accent: '#0af', warn: '#fa0', ok: '#0f0' }),
    });
    b.starte('schacht-verschieben');
    g.neuBauen();
    return { b, e, g, nachBauen, bauFertig: () => fertig?.({ angewandt: true }) };
  }
  function ziehe(t) {
    t.g.greifen({ x: 0, y: 0, typ: 'mouse' });
    t.g.zugStart({ x: 0, y: 0, px: { x: 0, y: 0 }, typ: 'mouse' });
    t.g.zugBewegt({ x: 4, y: 3, px: { x: 4, y: 3 }, typ: 'mouse' });
  }

  it('beim Loslassen: Umbau läuft, Geist und Zugbild bleiben — erst nach dem Neuaufbau geräumt', async () => {
    const t = baue();
    ziehe(t);
    const ende = t.g.zugEnde({ abbruch: false });
    await flushPromises();
    expect(t.nachBauen).toHaveBeenCalledTimes(1);
    expect(t.b.umbauLaeuft).toBe(true);
    expect(t.e.geistLeeren).not.toHaveBeenCalled();                        // vorher: sofort beim Loslassen
    expect(t.e.zeigeZugbild).not.toHaveBeenCalledWith(null);
    t.bauFertig();
    await ende;
    expect(t.b.umbauLaeuft).toBe(false);
    expect(t.e.geistLeeren).toHaveBeenCalled();
    expect(t.e.zeigeZugbild).toHaveBeenCalledWith(null);
  });

  it('ein abgebrochener Zug räumt sofort — und es läuft kein Umbau', async () => {
    const t = baue();
    ziehe(t);
    await t.g.zugEnde({ abbruch: true });
    expect(t.e.geistLeeren).toHaveBeenCalled();
    expect(t.b.umbauLaeuft).toBe(false);
    expect(t.nachBauen).not.toHaveBeenCalled();
  });
});

describe('was man sieht', () => {
  it('die Tafel zeigt den Umbau statt kurz der Werkzeugliste', async () => {
    const b = useBearbeitung();
    useIfcStore().modelList.push({ modelId: 'm1', name: 'test.ifc' });
    await b.einordne({ modelId: 'm1', localId: 42, category: 'IFCPIPESEGMENT', type: 'IFCPIPESEGMENT', globalId: 'H1', name: 'H1',
                       anker: { x: 10, y: 300, z: 0 }, hoehenversatz: 0 }, null);
    const Huelle = { setup() { provideViewerApi({}); return () => h(CdeToolbox); } };
    const w = mount(Huelle, { global: { plugins: [pinia], stubs: { CdeIcon: { template: '<i />' }, IfcSidebar: { template: '<div />' } } } });
    await flushPromises();
    expect(w.find('.tb-aufgabe').exists()).toBe(true);
    let los;
    const p = b.imUmbau(() => new Promise(r => { los = r; }));
    await flushPromises();
    expect(w.find('.tb-umbau').exists()).toBe(true);
    expect(w.find('.tb-umbau').attributes('aria-busy')).toBe('true');
    expect(w.find('.tb-aufgabe').exists()).toBe(false);
    los(); await p; await flushPromises();
    expect(w.find('.tb-umbau').exists()).toBe(false);
    expect(w.find('.tb-aufgabe').exists()).toBe(true);
    w.unmount();
  });

  it('die Plananimation in CDE-Farbe — kopiert, nicht aus flood-2D importiert', () => {
    const w = mount(CdeUmbauAnzeige, { props: { text: 'Wird übernommen …' } });
    const svg = w.find('svg');
    expect(svg.exists()).toBe(true);
    expect(w.html()).toContain('currentColor');
    expect(w.html()).not.toMatch(/#A3E635/i);                             // das Limettengrün von flood-2D
    expect(w.text()).toContain('Wird übernommen');
    const quelle = lies('components/CdeUmbauAnzeige.vue');
    const skript = quelle.split('<script setup>')[1].split('</script>')[0].replace(/\/\*[\s\S]*?\*\//g, '');
    expect(skript).not.toMatch(/flood-2D|construction animations/);
    expect(quelle).toContain("from '../assets/plan-laden.svg?raw'");
    w.unmount();
  });

  it('der Viewer: Sperre mit aria-busy über der Zeichenfläche, jeder Anwende-Weg im Umbau, Leiste ausgeblendet', () => {
    const v = lies('components/IfcViewer.vue');
    expect(v).toMatch(/<div v-if="bearbeitung\.umbauLaeuft" class="umbau-sperre" aria-busy="true"/);
    expect(v).toContain('return bearbeitung.imUmbau ? bearbeitung.imUmbau(() => _wendeEintragAn(eintragOderListe))');
    expect(v).toMatch(/<CdeKontextleiste[\s\S]*?v-show="!bearbeitung\.umbauLaeuft"/);
  });
});
