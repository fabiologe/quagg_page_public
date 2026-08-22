// @vitest-environment jsdom
/**
 * Rendert JEDE Komponente des Moduls einmal.
 *
 * Warum das der wichtigste Test dieses Moduls ist: 38 Komponenten mit 15.400
 * Zeilen hatten bisher keinen einzigen automatischen Nachweis, dass sie
 * ueberhaupt rendern. Der Build faengt Syntaxfehler, nicht Verhalten - und
 * genau diese Luecke hat schon einmal zugeschlagen: eine Warnzeile NEBEN einer
 * v-for-Schleife griff auf deren Laufvariable zu und liess den Importdialog
 * beim Rendern abstuerzen. Der Compiler meldet das nicht, der Build auch nicht.
 *
 * shallowMount statt mount: die Kinder werden ersetzt, das eigene Template
 * aber wirklich uebersetzt und ausgefuehrt. Genau dort sitzen die Fehler, die
 * hier gesucht werden - Zugriffe auf Undefiniertes, falscher Gueltigkeits-
 * bereich, kaputte computed-Werte.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { shallowMount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';

/* jsdom kennt ResizeObserver nicht. Eine Attrappe, die nichts beobachtet,
   genuegt: dieser Test prueft, DASS gerendert wird, nicht wie sich das
   Rendering bei Groessenaenderung verhaelt. */
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {} unobserve() {} disconnect() {}
  };
}

/* jsdom hat weder WebGL- noch Canvas-Kontext. Das sind Grenzen der
   Testumgebung, keine Fehler im Modul - deshalb werden genau die zwei
   Bibliotheken ersetzt, die daran scheitern, und sonst nichts. Wer mehr
   ersetzt, testet am Ende die Attrappen statt der Komponenten. */
vi.mock('three', async () => {
  const echt = await vi.importActual('three');
  /* Nur die Methoden, die useContourGpuLayer.js tatsaechlich aufruft -
     nachgesehen, nicht geraten - und zwar in BEIDEN Schreibweisen, denn
     dispose() ruft renderer?.forceContextLoss() mit Optional Chaining auf und
     faellt bei einer Suche nach "renderer." durch. Faellt dort eine neue dazu, schlaegt dieser
     Test fehl und weist darauf hin, statt sie stillschweigend zu verschlucken. */
  class WebGLRendererAttrappe {
    domElement = document.createElement('canvas');
    setPixelRatio() {} setSize() {} setViewport() {} setScissor() {}
    setScissorTest() {} setClearColor() {} clear() {} render() {} dispose() {}
    forceContextLoss() {}
    getContext() { return null; }
  }
  return { ...echt, WebGLRenderer: WebGLRendererAttrappe };
});

vi.mock('lottie-web', () => ({
  default: { loadAnimation: () => ({ destroy() {}, play() {}, stop() {}, goToAndStop() {} }) },
}));

const module = import.meta.glob('../**/*.vue', { eager: false });
const pfade = Object.keys(module)
  .filter((p) => !p.includes('/solver/'))
  .sort();

/* Mindest-Requisiten fuer Komponenten mit Pflichtangaben. Bewusst knapp: der
   Test soll das LEERE Netz abdecken, den Zustand also, in dem die App startet
   und in dem die meisten Renderfehler stecken. */
const REQUISITEN = {
  IsybauViewer:   { nodes: new Map(), edges: new Map(), areas: [], runoffDetails: [] },
  IsybauViewer3D: { nodes: new Map(), edges: new Map(), areas: [] },
  ElementInfo:    { selectedElement: null, edges: new Map() },
  ElementPropertiesModal: { isOpen: true, elementData: {}, availableNodes: [] },
  DraggableModal: { isOpen: true },
  SimulationResultsModal: { isOpen: true, nodes: new Map(), edges: new Map() },
  PreprocessingModal: { isOpen: true, network: { nodes: new Map(), edges: new Map() },
                        hydraulics: { catchments: [], areas: [] } },
  CurveTableEditor: { points: [] },
  Viewer3DInfoPanel: { element: null },
};

describe('Jede Komponente rendert', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it.each(pfade)('%s', async (pfad) => {
    const { default: komponente } = await module[pfad]();
    const name = pfad.split('/').pop().replace('.vue', '');
    const wrapper = shallowMount(komponente, {
      props: REQUISITEN[name] ?? {},
      global: { stubs: { Teleport: true, Transition: false, TransitionGroup: false } },
    });
    expect(wrapper.exists()).toBe(true);
    wrapper.unmount();
  });
});
