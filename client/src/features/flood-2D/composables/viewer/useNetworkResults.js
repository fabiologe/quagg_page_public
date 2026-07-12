/**
 * useNetworkResults — 1D-Kanalnetz-Ergebnisse (SWMM .out via handler.py) für den
 * Result-Viewer aufbereiten.
 *
 * Anders als useWeirResults muss hier nichts rekonstruiert werden: der Solver liefert
 * fertige Zeitreihen je Knoten/Haltung (networkResults aus der Result-Bridge). Diese
 * Schicht macht daraus:
 *   1. Anzeige-Serien (nodeSeries/linkSeries/systemSeries) mit Labels + Maxima,
 *   2. die Zeit-Synchronisation 2D-Frame ↔ 1D-Report-Step (verschiedene Raster:
 *      2D-Frames laufen auf saveInterval, SWMM auf reportStep),
 *   3. einen Zustands-Accessor fürs 3D-Netz (Füllgrad/Überstau je Element und Frame).
 *
 * Reine Datenschicht — kein three.js, kein Chart. Die puren Kerne sind node-testbar.
 */
import { computed, unref } from 'vue';

/** Index des letzten 1D-Zeitschritts <= tSec (Treppen-Halten, wie der Solver selbst). */
export function timeIndexAt(times, tSec) {
    if (!Array.isArray(times) || times.length === 0) return -1;
    if (tSec <= times[0]) return 0;
    let lo = 0, hi = times.length - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (times[mid] <= tSec) lo = mid; else hi = mid - 1;
    }
    return lo;
}

/**
 * Purer Kern: networkResults-JSON → Anzeige-Serien.
 * @param {object|null} net  { times[], nodes:{id:{…}}, links:{id:{…}}, system:{…} }
 * @returns {{nodes:Array, links:Array, system:object|null}}
 */
export function buildNetworkSeries(net) {
    if (!net || !Array.isArray(net.times) || net.times.length === 0) {
        return { nodes: [], links: [], system: null };
    }
    const times = net.times;
    const max = (a) => (a && a.length ? Math.max(...a) : 0);

    const nodes = Object.entries(net.nodes || {}).map(([id, n]) => ({
        id, kind: 'node',
        label: id,
        type: n.type ?? 'junction',
        invert: n.invert, maxDepth: n.maxDepth,
        times,
        depth: n.depth || [], head: n.head || [], volume: n.volume || [],
        totalInflow: n.totalInflow || [], flooding: n.flooding || [],
        depthMax: max(n.depth), floodingMax: max(n.flooding),
        surcharged: n.maxDepth > 0 && max(n.depth) >= n.maxDepth - 1e-6,
    }));

    const links = Object.entries(net.links || {}).map(([id, l]) => ({
        id, kind: 'link',
        label: id,
        type: l.type ?? 'conduit',
        maxDepth: l.maxDepth, length: l.length,
        times,
        flow: l.flow || [], depth: l.depth || [], velocity: l.velocity || [],
        volume: l.volume || [], capacity: l.capacity || [],
        Qmax: max((l.flow || []).map(Math.abs)),
        vMax: max((l.velocity || []).map(Math.abs)),
        capacityMax: max(l.capacity),
    }));

    const sys = net.system || {};
    const system = {
        times,
        inflow: sys.inflow || [], flooding: sys.flooding || [],
        outflow: sys.outflow || [], storedVolume: sys.storedVolume || [],
        storedMax: max(sys.storedVolume),
        floodingMax: max(sys.flooding),
    };
    return { nodes, links, system };
}

/**
 * Purer Kern: Element-Zustände zum 2D-Frame (für die 3D-Einfärbung).
 *
 * Zwischen zwei 1D-Report-Steps wird LINEAR interpoliert: SWMM schreibt die .out
 * typischerweise gröber (REPORT_STEP 60 s) als die 2D-Frames laufen (saveInterval).
 * Mit Treppen-Halten sprang das Netz nur alle reportStep/saveInterval Frames —
 * „Ergebnisse nicht Frame für Frame". Der SWMM-Zustand ist stetig, Interpolation
 * ist also physikalisch die bessere Anzeige.
 *
 * @returns {{nodes:Map<string,{fill:number,flooded:boolean,depth:number}>,
 *            links:Map<string,{fill:number,surcharged:boolean,flow:number}>}|null}
 */
export function networkStateAtTime(net, tSec) {
    if (!net || !Array.isArray(net.times) || net.times.length === 0) return null;
    const times = net.times;
    const i0 = timeIndexAt(times, tSec);
    if (i0 < 0) return null;
    const i1 = Math.min(i0 + 1, times.length - 1);
    const span = times[i1] - times[i0];
    // Anteil zwischen den Stützstellen (0 am linken, 1 am rechten Report-Step)
    const a = span > 0 ? Math.min(Math.max((tSec - times[i0]) / span, 0), 1) : 0;
    const lerp = (arr) => {
        const v0 = arr?.[i0] ?? 0;
        const v1 = arr?.[i1] ?? v0;
        return v0 + (v1 - v0) * a;
    };

    const nodes = new Map();
    for (const [id, n] of Object.entries(net.nodes || {})) {
        const depth = lerp(n.depth);
        const md = n.maxDepth > 0 ? n.maxDepth : 1;
        nodes.set(id, {
            depth,
            fill: Math.min(Math.max(depth / md, 0), 1),
            flooded: lerp(n.flooding) > 1e-6,
        });
    }
    const links = new Map();
    for (const [id, l] of Object.entries(net.links || {})) {
        // capacity = benetzte Fläche / Vollfüllung (0..1); Pumpen etc. haben maxDepth 0.
        const cap = lerp(l.capacity);
        links.set(id, {
            fill: Math.min(Math.max(cap, 0), 1),
            surcharged: cap >= 0.999,
            flow: lerp(l.flow),
        });
    }
    return { nodes, links, time: tSec, index: i0 };
}

/**
 * Reaktive Composable für den Result-Viewer.
 * @param {object} p
 * @param {import('vue').Ref<object|null>} p.networkResults  aus useResultDataFromOpener
 * @param {import('vue').Ref<number>|number} [p.saveInterval] Sekunden je 2D-Frame
 */
export function useNetworkResults({ networkResults, saveInterval = 0 }) {
    const series = computed(() => buildNetworkSeries(unref(networkResults)));
    const nodeSeries = computed(() => series.value.nodes);
    const linkSeries = computed(() => series.value.links);
    const systemSeries = computed(() => series.value.system);
    const hasNetworkResults = computed(() =>
        nodeSeries.value.length > 0 || linkSeries.value.length > 0);

    /** 2D-Frame → Sim-Sekunden (saveInterval 0 → Frame als Zeit interpretieren). */
    const frameToSeconds = (frame) => {
        const si = unref(saveInterval) || 0;
        return si > 0 ? frame * si : frame;
    };

    /** Zustand aller Elemente zum 2D-Frame (für 3D-Färbung); null ohne Ergebnisse. */
    const stateAtFrame = (frame) =>
        networkStateAtTime(unref(networkResults), frameToSeconds(frame));

    return { nodeSeries, linkSeries, systemSeries, hasNetworkResults, stateAtFrame, frameToSeconds };
}
