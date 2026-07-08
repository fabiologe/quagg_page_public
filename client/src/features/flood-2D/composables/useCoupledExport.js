// Dünnes Composable: kapselt die 1D/2D-Kopplungs-Anreicherung für den Solver-Runner.
// Der Runner ruft NUR `augmentInputs(files, { solverMode })` — alle Logik steckt in den
// sauberen Modulen services/geometry/* und services/swmm/coupledScenario.js.
//
// Quelle des Kanalnetzes (Phase 2 — Konvergenz): PRIMÄR der Netz-Store (useNetworkStore,
// gespeist aus ISYBAU/IFC-Import + Editor), FALLBACK das Legacy-geoStore (nodes+culvertLinks).
// So treibt das im Netz-Tab importierte/editierte Netz den gekoppelten Lauf.

import { toRaw } from 'vue';
import { fromGeoStore } from '@/features/flood-2D/services/geometry/adapters.js';
import { buildCoupledFiles } from '@/features/flood-2D/services/swmm/coupledScenario.js';
import { networkToBmiCulverts } from '@/features/flood-2D/services/geometry/networkToBmi.js';
import { useNetworkStore } from '@/features/flood-2D/stores/useNetworkStore.js';

/**
 * @param {object} deps { geoStore }
 * @returns {{ augmentInputs: (files: Record<string,string>, ctx: {solverMode:string}) => object,
 *             hasNetwork: () => boolean }}
 */
export function useCoupledExport({ geoStore }) {
    const netStore = useNetworkStore();

    /** Baut das NetworkModel: bevorzugt aus dem Netz-Store, sonst Legacy-geoStore. */
    function buildModel() {
        if (netStore.hasNetwork) return netStore.toModel();
        return fromGeoStore({
            nodes: toRaw(geoStore.nodes) || [],
            culvertLinks: toRaw(geoStore.culvertLinks) || [],
        });
    }

    function hasNetwork() {
        if (netStore.hasNetwork) return true;
        const links = toRaw(geoStore.culvertLinks) || [];
        return links.length > 0;
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
        return buildCoupledFiles(files, buildModel(), { dtCouple: 2.0 });
    }

    /**
     * BMI-Kompilat aus dem Netz-Store (lokaler Torricelli-Pfad). Liefert die activeCulverts
     * für simulation.bmi.js — oder null, wenn kein Netz-Store-Netz da ist (dann nutzt der
     * Runner seinen Legacy-geoStore.culvertLinks-Pfad weiter).
     */
    function buildBmiCulverts() {
        if (!netStore.hasNetwork) return null;
        return networkToBmiCulverts(netStore.toModel());
    }

    return { augmentInputs, hasNetwork, buildBmiCulverts };
}
