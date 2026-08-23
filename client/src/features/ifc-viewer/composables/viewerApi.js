/**
 * viewerApi — Engine-Zugriff für Kind-Komponenten des IFC-Viewers.
 *
 * IfcViewer.vue stellt ein Objekt aus Engine-Accessor-Funktionen bereit
 * (provideViewerApi); teleportierte Kinder wie IfcPdfExportModal,
 * IfcPlanningCockpit und IfcVectorStyleEditor holen es per useViewerApi()
 * — ersetzt das frühere Durchreichen von ~25 Funktions-Props.
 *
 * Die Engine-Instanz ist bewusst kein reaktiver State: Die Funktionen
 * greifen zur Aufrufzeit über eine Closure auf die aktuelle Engine zu.
 */
import { inject, provide } from 'vue';

const VIEWER_API_KEY = Symbol('ifc-viewer-api');

/**
 * Zusätzlich zum provide/inject-Weg wird die API modulweit gemerkt.
 * Grund (Sprint U): Panels docken jetzt in den Leisten der CdeView an und
 * liegen damit NEBEN dem Viewer statt darunter — inject würde dort ins Leere
 * greifen. Es gibt pro Seite genau einen Viewer, deshalb ist die Merkstelle
 * eindeutig; inject bleibt der bevorzugte Weg, die Merkstelle der Auffang.
 */
let _aktuelleApi = null;

export function provideViewerApi(api) {
  _aktuelleApi = api;
  provide(VIEWER_API_KEY, api);
}

export function useViewerApi() {
  const api = inject(VIEWER_API_KEY, null) ?? _aktuelleApi;
  if (!api) {
    throw new Error(
      'useViewerApi(): kein viewerApi bereitgestellt — es muss ein IfcViewer gerendert sein.'
    );
  }
  return api;
}
