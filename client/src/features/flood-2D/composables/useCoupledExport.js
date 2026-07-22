// Dünnes Composable: kapselt die 1D/2D-Kopplungs-Anreicherung für den Solver-Runner.
// Der Runner ruft NUR `augmentInputs(files, { solverMode })` — alle Logik steckt in den
// sauberen Modulen services/geometry/* und services/swmm/coupledScenario.js.
//
// Quelle des Kanalnetzes ist AUSSCHLIESSLICH der Netz-Store (useNetworkStore, gespeist
// aus ISYBAU/IFC-Import + Editor). Der Legacy-Pfad (geoStore.nodes/culvertLinks aus
// NodeTool/CulvertLinkManager) wurde 2026-07 entfernt.

import { buildCoupledFiles } from '@/features/flood-2D/services/swmm/coupledScenario.js';
import { useNetworkStore } from '@/features/flood-2D/stores/useNetworkStore.js';

/**
 * @returns {{ augmentInputs: (files: Record<string,string>, ctx: {solverMode:string}) => object,
 *             hasNetwork: () => boolean }}
 */
export function useCoupledExport() {
    const netStore = useNetworkStore();

    function hasNetwork() {
        return netStore.hasNetwork;
    }

    /**
     * Reichert den fertigen Datei-Satz um die Kopplung an — aber NUR im runpod-Modus mit
     * vorhandenem Netz. In allen anderen Fällen bleibt `files` unverändert (active:false).
     */
    function augmentInputs(files, { solverMode } = {}) {
        if (solverMode !== 'runpod' || !hasNetwork()) {
            return { files, active: false, warnings: [], summary: '' };
        }
        // Vorfüllfaktor aus dem Netz-Store: EIN Wert („Netz zu x % ausgelastet"), die
        // physikalische Übersetzung (Basisabfluss/InitDepth/InitFlow) macht der Builder.
        const prefillFraction = Math.min(Math.max(Number(netStore.prefillPercent) || 0, 0), 100) / 100;
        return buildCoupledFiles(files, netStore.toModel(), { dtCouple: 2.0, swmm: { prefillFraction } });
    }

    return { augmentInputs, hasNetwork };
}
