// Dünnes Composable: kapselt die 1D/2D-Kopplungs-Anreicherung für den Solver-Runner.
// Der Runner ruft NUR `augmentInputs(files, { solverMode })` — alle Logik steckt in den
// sauberen Modulen services/geometry/* und services/swmm/coupledScenario.js.
//
// Quelle des Kanalnetzes ist AUSSCHLIESSLICH der Netz-Store (useNetworkStore, gespeist
// aus ISYBAU/IFC-Import + Editor). Der Legacy-Pfad (geoStore.nodes/culvertLinks aus
// NodeTool/CulvertLinkManager) wurde 2026-07 entfernt.

import { buildCoupledFiles } from '@/features/flood-2D/services/swmm/coupledScenario.js';
import { networkToBmiCulverts } from '@/features/flood-2D/services/geometry/networkToBmi.js';
import { useNetworkStore } from '@/features/flood-2D/stores/useNetworkStore.js';

/**
 * @returns {{ augmentInputs: (files: Record<string,string>, ctx: {solverMode:string}) => object,
 *             hasNetwork: () => boolean, buildBmiCulverts: () => Array|null }}
 */
export function useCoupledExport() {
    const netStore = useNetworkStore();

    function hasNetwork() {
        return netStore.hasNetwork;
    }

    /**
     * Reichert den fertigen Datei-Satz um die Kopplung an — aber NUR im runpod-Modus mit
     * vorhandenem Netz. In allen anderen Fällen bleibt `files` unverändert (active:false),
     * insbesondere behält 'bmi' seinen bestehenden Torricelli-Pfad.
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

    /**
     * BMI-Kompilat aus dem Netz-Store (lokaler Torricelli-Pfad). Liefert die activeCulverts
     * für simulation.bmi.js — oder null ohne Netz (dann läuft der 2D-Solver ungekoppelt).
     */
    function buildBmiCulverts() {
        if (!netStore.hasNetwork) return null;
        return networkToBmiCulverts(netStore.toModel());
    }

    return { augmentInputs, hasNetwork, buildBmiCulverts };
}
