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

export function provideViewerApi(api) {
  provide(VIEWER_API_KEY, api);
}

export function useViewerApi() {
  const api = inject(VIEWER_API_KEY, null);
  if (!api) {
    throw new Error(
      'useViewerApi(): kein viewerApi bereitgestellt — Komponente muss unterhalb von IfcViewer.vue gerendert werden.'
    );
  }
  return api;
}
