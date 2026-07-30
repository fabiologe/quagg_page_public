/**
 * useApiTerrainFallback.js — automatisches 3D-Fallback-Gelände aus den
 * WGS84-Terrarium-Kacheln der EZG-Karte (useEzgLayer.js), für den Fall dass
 * (noch) kein eigenes DGM hochgeladen wurde (store.terrain, siehe
 * xyzTerrainImporter.js). Reprojiziert die gecachten Kacheln per
 * apiTerrainReproject.js auf ein reguläres lokales Meter-Raster in derselben
 * Form wie store.terrain, damit useTerrainLayer.js unverändert beide Quellen
 * rendern kann.
 *
 * Priorität ist immer: manuelles DGM > API-Fallback > nichts — IsybauViewer3D.vue
 * bildet das über `store.terrain || apiTerrainFallback.fallbackTerrain.value`.
 */
import { computed } from 'vue';
import { useIsybauStore } from '../../../store/index.js';
import { useEzgLayer } from '../../../composables/useEzgLayer.js';
import { computeLocalNetworkBounds, padLocalBounds } from '../../../utils/geoBounds.js';
import { buildLocalTerrainFromWgs84Grids } from '../../../utils/apiTerrainReproject.js';

export function useApiTerrainFallback() {
    const store = useIsybauStore();
    const ezgLayer = useEzgLayer();

    const fallbackTerrain = computed(() => {
        // cachedElevationGrids selbst ist nicht reaktiv (siehe useEzgLayer.js)
        // — elevationGridVersion ist die einzige reaktive Abhängigkeit, die
        // eine Neuberechnung bei neu geladenen/nachgeladenen Kacheln auslöst.
        void ezgLayer.elevationGridVersion.value;

        if (!ezgLayer.enabled.value) return null;
        const crs = store.metadata.crs;
        if (!crs?.confirmed) return null;

        const { grids, epsg } = ezgLayer.getElevationGrids();
        if (!grids || grids.length === 0) return null;

        const anchor = store.metadata.originAnchor || null;
        const rawBounds = computeLocalNetworkBounds(store.nodeArray, store.edgeArray, anchor);
        // Dieselbe Polsterung wie useEzgLayer.js' refresh() (ratio=1.0, minSpan
        // 500/2000m) — die Zielfläche soll ungefähr die bereits gefetchte
        // Terrarium-Abdeckung treffen, sonst fragt buildLocalTerrainFromWgs84Grids
        // unnötig einen Bereich an, für den ohnehin nur NODATA zurückkäme.
        const minSpan = (store.nodeArray.length === 0 && anchor) ? 2000 : 500;
        const padded = padLocalBounds(rawBounds, 1.0, minSpan);

        return buildLocalTerrainFromWgs84Grids(grids, epsg, padded);
    });

    return { fallbackTerrain };
}
