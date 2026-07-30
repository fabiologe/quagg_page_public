// Unified Geometry Engine — NetworkModel (G0).
// Single Source of Truth für das Kanalnetz als Entities + Topologie. Kompiliert nach
// SWMM (1D) über toSwmmStore() und liefert die Geometrie für Kopplung/Render.

import { makeNode, makeLink, isNode, isLink, NODE_ROLES } from './entities.js';

// Rollen → SWMM-Bauwerkstyp (bauwerkstyp), damit der portierte SwmmBuilder klassifiziert.
// (SwmmBuilder: 3/4/5=Outfall, 1/2/12/13=Storage, 6=Pumpe,7=Wehr,8=Drossel,9=Schieber.)
const ROLE_TO_BTYP = { outfall: 3, storage: 1, pump: 6, weir: 7, orifice: 8 };

export class NetworkModel {
    constructor() {
        this.nodes = new Map();   // id → node-entity
        this.links = new Map();   // id → link-entity
    }

    addNode(spec) { const n = isNode(spec) ? spec : makeNode(spec); this.nodes.set(n.id, n); return n; }
    addLink(spec) { const l = isLink(spec) ? spec : makeLink(spec); this.links.set(l.id, l); return l; }

    get nodeList() { return [...this.nodes.values()]; }
    get linkList() { return [...this.links.values()]; }

    /** Topologie: Nachbarknoten (über Links) eines Knotens. */
    neighbors(nodeId) {
        const out = [];
        for (const l of this.links.values()) {
            if (l.refs.fromNodeId === nodeId && l.refs.toNodeId) out.push(l.refs.toNodeId);
            else if (l.refs.toNodeId === nodeId && l.refs.fromNodeId) out.push(l.refs.fromNodeId);
        }
        return out;
    }

    /**
     * Netz-Validierung (E4): Topologie + Hydraulik-Plausibilität.
     *  error   — verhindert sinnvollen SWMM-Lauf (fehlende Endknoten, Sohle über Deckel,
     *            Sonderbauwerk ohne abgehende Haltung → würde stiller Junction)
     *  warning — läuft, aber verdächtig (Gegengefälle, Nullängen, isolierte Knoten,
     *            Teilnetz ohne Auslass → Wasser kann das Netz nicht verlassen)
     */
    validate() {
        const issues = [];
        // hint = Lösungsvorschlag für die klickbare Prüfliste (NetworkTable → IssueList);
        // id = betroffenes Element, wird dort zum Auswahl-Sprungziel.
        const err = (id, msg, hint) => issues.push({ level: 'error', id, msg, hint });
        const warn = (id, msg, hint) => issues.push({ level: 'warning', id, msg, hint });

        // Knoten-Checks
        const linkedNodes = new Set();
        const outgoing = new Map();   // nodeId → Anzahl abgehender Haltungen
        for (const l of this.links.values()) {
            if (l.refs.fromNodeId) {
                linkedNodes.add(l.refs.fromNodeId);
                outgoing.set(l.refs.fromNodeId, (outgoing.get(l.refs.fromNodeId) ?? 0) + 1);
            }
            if (l.refs.toNodeId) linkedNodes.add(l.refs.toNodeId);
        }
        for (const n of this.nodes.values()) {
            if (Number.isFinite(n.geom.invert) && Number.isFinite(n.geom.rim)
                && n.geom.invert > n.geom.rim + 1e-6)
                err(n.id, `Schacht ${n.id}: Sohle (${n.geom.invert.toFixed(2)}) liegt über dem Deckel (${n.geom.rim.toFixed(2)})`,
                    'Deckel- (rim) bzw. Sohlhöhe (invert) im Eigenschaften-Panel korrigieren.');
            if (this.links.size > 0 && !linkedNodes.has(n.id))
                warn(n.id, `Schacht ${n.id}: isoliert (keine Haltung angeschlossen)`,
                    'Haltung anschließen („Neu erstellen → Haltung ziehen") oder den Schacht löschen.');
            // Sonderbauwerk-Regel (SwmmBuilder): Pumpe/Wehr/Drossel wird nur zum SWMM-
            // Sonder-Link, wenn eine Haltung vom Knoten ABGEHT — sonst stiller Junction.
            if (['pump', 'weir', 'orifice'].includes(n.role) && !(outgoing.get(n.id) > 0))
                err(n.id, `${n.role === 'pump' ? 'Pumpe' : n.role === 'weir' ? 'Wehr' : 'Drossel'} ${n.id}: keine abgehende Haltung (würde als einfacher Schacht exportiert)`,
                    'Vom Knoten eine ABGEHENDE Haltung ziehen — erst dann wird das Sonderbauwerk exportiert.');
        }

        // Haltungs-Checks
        for (const l of this.links.values()) {
            const from = l.refs.fromNodeId ? this.nodes.get(l.refs.fromNodeId) : null;
            const to = l.refs.toNodeId ? this.nodes.get(l.refs.toNodeId) : null;
            if (!from) err(l.id, `Haltung ${l.id}: Anfangsknoten fehlt/unbekannt`,
                'Haltung löschen und neu von Schacht zu Schacht ziehen.');
            if (!to) err(l.id, `Haltung ${l.id}: Endknoten fehlt/unbekannt`,
                'Haltung löschen und neu von Schacht zu Schacht ziehen.');
            if (!from || !to) continue;
            const len = l.geom.length
                ?? Math.hypot(to.geom.x - from.geom.x, to.geom.y - from.geom.y);
            if (len < 0.5)
                warn(l.id, `Haltung ${l.id}: (nahezu) Nulllänge (${len.toFixed(2)} m)`,
                    'Endpunkte prüfen (Doppel-Import? identische Schächte?) — ggf. Haltung löschen.');
            // Gegengefälle: Sohle am Ende höher als am Anfang (z1/z2-Offsets bevorzugt)
            const z1 = Number.isFinite(Number(l.attrs.z1)) ? Number(l.attrs.z1) : from.geom.invert;
            const z2 = Number.isFinite(Number(l.attrs.z2)) ? Number(l.attrs.z2) : to.geom.invert;
            if (l.conveyance !== 'open' && Number.isFinite(z1) && Number.isFinite(z2) && z2 > z1 + 1e-3)
                warn(l.id, `Haltung ${l.id}: Gegengefälle (Sohle ${z1.toFixed(2)} → ${z2.toFixed(2)} m)`,
                    'Sohlhöhen prüfen: z1/z2-Offsets der Haltung bzw. die Schacht-Sohlen im Eigenschaften-Panel.');
        }

        // Teilnetz ohne Auslass: Zusammenhangskomponenten über ungerichtete Kanten;
        // jede Komponente mit Haltungen braucht mindestens einen Outfall.
        const parent = new Map();
        const find = (a) => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; };
        const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
        for (const id of this.nodes.keys()) parent.set(id, id);
        for (const l of this.links.values()) {
            if (this.nodes.has(l.refs.fromNodeId) && this.nodes.has(l.refs.toNodeId))
                union(l.refs.fromNodeId, l.refs.toNodeId);
        }
        const compHasOutfall = new Map();
        const compSize = new Map();
        for (const n of this.nodes.values()) {
            if (!linkedNodes.has(n.id)) continue;   // isolierte Knoten oben gemeldet
            const root = find(n.id);
            compSize.set(root, (compSize.get(root) ?? 0) + 1);
            if (n.role === 'outfall') compHasOutfall.set(root, true);
        }
        for (const [root, size] of compSize) {
            if (size > 1 && !compHasOutfall.get(root))
                warn(root, `Teilnetz um ${root} (${size} Knoten): kein Auslass (outfall) — Wasser kann das Netz nicht verlassen`,
                    'Den tiefsten Schacht des Teilnetzes im Eigenschaften-Panel auf Rolle „outfall" stellen (oder eine Haltung zum restlichen Netz ziehen).');
        }
        return issues;
    }

    /**
     * 1D-Compiler-Adapter: liefert ein store-artiges Objekt, das der portierte
     * SwmmBuilder (services/swmm/SwmmBuilder.js) direkt konsumiert.
     */
    toSwmmStore() {
        const swmmNodes = this.nodeList
            .filter(n => NODE_ROLES.has(n.role))
            .map(n => {
                const depth = Math.max(0, n.geom.rim - n.geom.invert);
                return {
                    id: n.id, x: n.geom.x, y: n.geom.y,
                    z: n.geom.invert, coverZ: n.geom.rim, depth,
                    isManhole: n.role !== 'junction' ? (n.attrs.isManhole ?? true) : (n.attrs.isManhole ?? false),
                    canOverflow: n.attrs.canOverflow ?? true,
                    is_sink: n.role === 'outfall',
                    type: n.attrs.type ?? n.role,
                    // PUMPENSUMPF-REGEL (QA-Fund 2026-07, test_coupling_pump.py): eine Pumpe
                    // an einem SWMM-JUNCTION friert bei Zufluss-Slug > Förderleistung dauerhaft
                    // ein (Preissmann-SLOT pressurisiert, Pumpe fördert nie wieder — auch
                    // standalone reproduzierbar). Ein Pumpen-Knoten bekommt daher immer ein
                    // echtes Sumpf-Volumen → SwmmBuilder klassifiziert ihn als [STORAGE]
                    // (Nassschacht, 4 m² Sohlfläche), der Sonder-Link [PUMPS] bleibt über
                    // bauwerkstyp=6 erhalten.
                    volume: num0(n.attrs.volume)
                        || (n.role === 'pump' ? Math.max(depth, 0.5) * 4.0 : 0),
                    bauwerkstyp: n.attrs.bauwerkstyp ?? ROLE_TO_BTYP[n.role] ?? null,
                    constantInflow: num0(n.attrs.constantInflow),
                    // Zufluss-Ganglinie [{t: Minuten, q: l/s}] → SWMM [INFLOWS]+[TIMESERIES]
                    inflowSeries: Array.isArray(n.attrs.inflowSeries) ? n.attrs.inflowSeries : null,
                    // Outfall-Randbedingung: 'free'|'normal'|'fixed' + Vorfluter-WSP [m NHN]
                    outflowType: n.attrs.outfallType ?? null,
                    fixedStage: n.attrs.fixedStage ?? null,
                    // Sonderbauwerk-Parameter (Editor-Authoring, P-Phase): der SwmmBuilder
                    // liest sie direkt vom Knoten (addPumps/addCurves/addWeirs/addOrifices).
                    pumpRate: num0(n.attrs.pumpRate),      // Förderleistung [l/s]
                    onDepth: num0(n.attrs.onDepth),        // Pumpe EIN ab Wasserstand [m]
                    offDepth: num0(n.attrs.offDepth),      // Pumpe AUS unter Wasserstand [m]
                    wehrHeight: num0(n.attrs.wehrHeight),  // Schwellenhöhe ab Sohle [m]
                    wehrWidth: num0(n.attrs.wehrWidth),    // Wehrbreite [m]
                    maxOutflow: num0(n.attrs.maxOutflow),  // Drossel-Abfluss [l/s]
                };
            });
        const swmmEdges = this.linkList
            .filter(l => l.conveyance !== 'open')   // offene Gerinne gehen NICHT nach SWMM (→ SGC/2D)
            .map(l => ({
                id: l.id, fromNodeId: l.refs.fromNodeId, toNodeId: l.refs.toNodeId,
                length: l.geom.length ?? 0,
                roughness: num0(l.attrs.kSt ?? l.attrs.roughness),
                z1: l.attrs.z1, z2: l.attrs.z2,
                profile: { type: l.geom.profile.shape, height: l.geom.profile.height, width: l.geom.profile.width },
            }));
        return { getAllNodes: swmmNodes, getAllEdges: swmmEdges, edges: swmmEdges, areas: [] };
    }
}

function num0(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
