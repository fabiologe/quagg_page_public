import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useIsybauStore } from '../store/index.js';
import { Node } from '../core/domain/Node.js';
import { Area } from '../core/domain/Area.js';

describe('IsybauStore', () => {
    let store;

    beforeEach(() => {
        setActivePinia(createPinia());
        store = useIsybauStore();
    });

    it('addNode / addEdge', () => {
        const n1 = store.addNode(10, 10, 'Schacht');
        expect(store.nodes.size).toBe(1);

        const n2 = store.addNode(20, 20);
        const e1 = store.addEdge({ fromId: n1.id, toId: n2.id });
        expect(store.edges.size).toBe(1);
        expect(e1.length).toBeCloseTo(14.142, 2);
    });

    it('loadParsedData hydriert zu Klasseninstanzen', () => {
        store.loadParsedData({
            metadata: { version: '1.0' },
            network: {
                nodes: new Map([
                    ['XML_1', { id: 'XML_1', x: 100, y: 100, z: 10, type: 'Schacht' }],
                    ['XML_2', { id: 'XML_2', x: 200, y: 200, z: 9, type: 'Schacht' }]
                ]),
                edges: new Map([
                    ['XML_E1', { id: 'XML_E1', from: 'XML_1', to: 'XML_2', length: 150 }]
                ])
            }
        });
        expect(store.nodes.size).toBe(2);
        expect(store.edges.size).toBe(1);
        expect(store.metadata.version).toBe('1.0');
        expect(store.getNodeById('XML_1')).toBeInstanceOf(Node);
    });

    it('removeNode kaskadiert auf verbundene Haltungen', () => {
        const n1 = store.addNode(0, 0);
        const n2 = store.addNode(10, 0);
        store.addEdge({ fromId: n1.id, toId: n2.id });
        store.removeNode(n1.id);
        expect(store.nodes.has(n1.id)).toBe(false);
        expect(store.edges.size).toBe(0);
    });

    it('loadParsedData übernimmt Inspections', () => {
        store.loadParsedData({
            network: { nodes: new Map(), edges: new Map() },
            inspections: [{ id: 'I1', edgeId: 'E1', observations: [] }]
        });
        expect(store.inspections).toHaveLength(1);
        expect(store.inspections[0].id).toBe('I1');
    });

    it('loadParsedData nutzt Einzugsgebiete als Flächen-Fallback', () => {
        store.loadParsedData({
            network: { nodes: new Map(), edges: new Map() },
            hydraulics: {
                areas: [],
                catchments: [{ id: 'EZG1', nodeId: 'N1', area: 0.5, runoffCoeff: 0.7 }]
            }
        });
        expect(store.areas).toHaveLength(1);
        expect(store.areas[0].size).toBe(0.5);
        expect(store.areas[0].nodeId).toBe('N1');
    });

    it('loadParsedData ignoriert Einzugsgebiete, wenn Flächen-Polygone existieren (kein Doppelabfluss)', () => {
        store.loadParsedData({
            network: { nodes: new Map(), edges: new Map() },
            hydraulics: {
                areas: [{ id: 'F1', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], size: 1.0 }],
                catchments: [{ id: 'EZG1', nodeId: 'N1', area: 0.5, runoffCoeff: 0.7 }]
            }
        });
        expect(store.areas).toHaveLength(1);
        expect(store.areas[0].id).toBe('F1');
    });

    it('loadParsedData merged Schmutzfracht aus Einzugsgebiet auf gleichnamige Fläche mit Geometrie', () => {
        store.loadParsedData({
            network: { nodes: new Map(), edges: new Map() },
            hydraulics: {
                areas: [{ id: 'F1', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], size: 1.0 }],
                catchments: [{
                    id: 'F1',
                    schmutzfracht: { gebietsname: 'Testgebiet', kommentar: null, einwohnerwerte: 120, einwohnerdichte: null, trockenwetterkennung: 'T01' }
                }]
            }
        });
        expect(store.areas).toHaveLength(1);
        expect(store.areas[0].id).toBe('F1');
        expect(store.areas[0].schmutzfracht).toEqual({ gebietsname: 'Testgebiet', kommentar: null, einwohnerwerte: 120, einwohnerdichte: null, trockenwetterkennung: 'T01' });
    });

    it('loadParsedData meldet übersprungene Elemente als importWarnings', () => {
        store.loadParsedData({
            network: {
                // Node ohne id → Node.fromRaw wirft
                nodes: new Map([['bad', { x: 1, y: 1 }]]),
                edges: new Map()
            }
        });
        expect(store.ui.importWarnings.length).toBeGreaterThan(0);
    });

    it('addArea reicht Haltungs-Outlet-Daten durch (nodeId2/splitRatio/edgeId)', () => {
        const area = store.addArea({
            points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
            properties: { id: 'A1', size: 0.2, runoffCoeff: 0.8, nodeId: 'N1', nodeId2: 'N2', splitRatio: 30, edgeId: 'E1' }
        });
        expect(area.nodeId2).toBe('N2');
        expect(area.splitRatio).toBe(30);
        expect(area.edgeId).toBe('E1');
    });

    it('updateNode wendet die Überstau-Kopplung an', () => {
        const n = store.addNode(0, 0, { id: 'N1', isManhole: false });
        expect(n.canOverflow).toBe(false);

        // canOverflow=true darf bei unterirdischem Knoten nicht greifen
        store.updateNode('N1', { canOverflow: true });
        expect(store.getNodeById('N1').canOverflow).toBe(false);

        // Erst isManhole=true schaltet Überstau frei
        store.updateNode('N1', { isManhole: true, canOverflow: true });
        expect(store.getNodeById('N1').canOverflow).toBe(true);
    });

    it('removeMany löscht Knoten + kaskadierte Haltungen in EINEM Undo-Schritt', () => {
        const n1 = store.addNode(0, 0, { id: 'N1' });
        const n2 = store.addNode(10, 0, { id: 'N2' });
        const n3 = store.addNode(20, 0, { id: 'N3' });
        store.addEdge({ fromId: 'N1', toId: 'N2', properties: { id: 'E1' } });
        store.addEdge({ fromId: 'N2', toId: 'N3', properties: { id: 'E2' } });

        const undoBefore = store.history.undoStack.length;
        store.removeMany(['N1', 'E2']);

        expect(store.nodes.has('N1')).toBe(false);
        expect(store.edges.has('E1')).toBe(false); // Kaskade über N1
        expect(store.edges.has('E2')).toBe(false); // explizit gelöscht
        expect(store.nodes.has('N2')).toBe(true);
        expect(store.history.undoStack.length).toBe(undoBefore + 1);

        // Undo stellt alles in einem Schritt wieder her
        store.undo();
        expect(store.nodes.has('N1')).toBe(true);
        expect(store.edges.has('E1')).toBe(true);
        expect(store.edges.has('E2')).toBe(true);
    });

    it('updateNetworkData übernimmt Löschungen aus dem Preprocessing', () => {
        store.addNode(0, 0, { id: 'N1' });
        store.addNode(10, 0, { id: 'N2' });
        store.addNode(20, 0, { id: 'N3' });
        store.addEdge({ fromId: 'N1', toId: 'N2', properties: { id: 'E1' } });
        store.addEdge({ fromId: 'N2', toId: 'N3', properties: { id: 'E2' } });

        store.updateNetworkData({
            nodes: [], edges: [], areas: [],
            deletedNodeIds: ['N1'],
            deletedEdgeIds: ['E2']
        });

        expect(store.nodes.has('N1')).toBe(false);
        expect(store.edges.has('E1')).toBe(false); // Kaskade
        expect(store.edges.has('E2')).toBe(false);
        expect(store.nodes.has('N2')).toBe(true);
    });

    it('openPreprocessingFor merkt Fokus-ID UND -Typ vor (ISYBAU: Haltung kann Knoten-ID teilen)', () => {
        // Realistisches Szenario: Haltung "06001" hat dieselbe ID wie ihr
        // Zulaufknoten "06001" — ohne expliziten Typ würde das Preprocessing
        // immer zum Knoten statt zur Haltung springen.
        store.openPreprocessingFor('06001', 'edge');
        expect(store.ui.preprocessingFocusId).toBe('06001');
        expect(store.ui.preprocessingFocusType).toBe('edge');
        expect(store.ui.showPreprocessingModal).toBe(true);
    });

    it('blockt zweiten Simulationsstart während running', async () => {
        store.simulation.status = 'running';
        await store.runSimulation();
        // Status unverändert, kein Fehler geworfen
        expect(store.simulation.status).toBe('running');
    });

    it('loadParsedData schätzt das CRS anhand der Netz-Koordinaten (unconfirmed)', () => {
        store.loadParsedData({
            network: {
                nodes: new Map([
                    ['N1', { id: 'N1', x: 3456000, y: 5540000, z: 10 }] // GK3-typische Werte
                ]),
                edges: new Map()
            }
        });
        expect(store.metadata.crs.epsg).toBe('EPSG:31467');
        expect(store.metadata.crs.confirmed).toBe(false);
        expect(store.metadata.crs.source).toBe('auto');
    });

    it('confirmCRS markiert das CRS als bestätigt und schließt die Modal', () => {
        store.ui.showEzgCrsModal = true;
        store.confirmCRS('EPSG:25832');
        expect(store.metadata.crs).toEqual({ epsg: 'EPSG:25832', confirmed: true, source: 'confirmed' });
        expect(store.ui.showEzgCrsModal).toBe(false);
    });

    it('loadParsedData überschreibt ein bereits bestätigtes CRS nicht (z.B. beim Neuladen eines Projekts)', () => {
        store.metadata.crs = { epsg: 'EPSG:25833', confirmed: true, source: 'confirmed' };
        store.loadParsedData({
            network: {
                nodes: new Map([['N1', { id: 'N1', x: 3456000, y: 5540000, z: 10 }]]),
                edges: new Map()
            }
        });
        expect(store.metadata.crs).toEqual({ epsg: 'EPSG:25833', confirmed: true, source: 'confirmed' });
    });

    it('setOriginAnchor legt CRS ("Neu starten") UND den Referenzpunkt gleichzeitig fest', () => {
        store.setOriginAnchor({ epsg: 'EPSG:25832', x: 405000, y: 5477000, label: 'Kaiserslautern' });
        expect(store.metadata.crs).toEqual({ epsg: 'EPSG:25832', confirmed: true, source: 'anchor' });
        expect(store.metadata.originAnchor).toEqual({ x: 405000, y: 5477000, label: 'Kaiserslautern' });
    });

    describe('Flächen-Vertex-Editing (updateAreaPoint/insertAreaPoint/removeAreaPoint)', () => {
        const sq = (x0, y0, s) => [
            { x: x0, y: y0 }, { x: x0 + s, y: y0 }, { x: x0 + s, y: y0 + s }, { x: x0, y: y0 + s }
        ];

        it('updateAreaPoint verschiebt einen Punkt und liefert true', () => {
            store.areas.push(new Area({ id: 'A1', points: sq(0, 0, 10) }));
            const ok = store.updateAreaPoint('A1', 0, { x: 1, y: 1 });
            expect(ok).toBe(true);
            expect(store.areas[0].points[0]).toEqual({ x: 1, y: 1 });
        });

        it('lehnt eine selbstüberschneidende Form ab (Punkt unverändert)', () => {
            const points = sq(0, 0, 10);
            store.areas.push(new Area({ id: 'A1', points: [...points] }));
            // Punkt 1 so weit ziehen, dass ein "bowtie" entsteht (über die gegenüberliegende Kante hinweg)
            const ok = store.updateAreaPoint('A1', 1, { x: -5, y: 10 });
            expect(ok).toBe(false);
            expect(store.areas[0].points[1]).toEqual(points[1]);
        });

        it('clippt automatisch bei Überlappung mit einer anderen Fläche', () => {
            store.areas.push(new Area({ id: 'A1', points: sq(0, 0, 10) }));
            store.areas.push(new Area({ id: 'A2', points: sq(20, 0, 10) }));
            // A1's rechte obere Ecke (10,10) so weit nach rechts ziehen, dass sie in A2 hineinragt
            const ok = store.updateAreaPoint('A1', 2, { x: 25, y: 10 });
            expect(ok).toBe(true);
            // Kein Punkt von A1 darf jetzt innerhalb von A2 (x>=20) liegen
            for (const p of store.areas[0].points) {
                expect(p.x).toBeLessThanOrEqual(20.001);
            }
        });

        it('insertAreaPoint fügt einen Punkt an der richtigen Stelle ein', () => {
            store.areas.push(new Area({ id: 'A1', points: sq(0, 0, 10) }));
            store.insertAreaPoint('A1', 0, { x: 5, y: 0 });
            expect(store.areas[0].points).toHaveLength(5);
            expect(store.areas[0].points[1]).toEqual({ x: 5, y: 0 });
        });

        it('removeAreaPoint entfernt einen Punkt, aber nie unter 3 Punkte', () => {
            store.areas.push(new Area({ id: 'A1', points: sq(0, 0, 10) }));
            expect(store.removeAreaPoint('A1', 0)).toBe(true);
            expect(store.areas[0].points).toHaveLength(3);
            expect(store.removeAreaPoint('A1', 0)).toBe(false); // Guard: nicht unter 3
            expect(store.areas[0].points).toHaveLength(3);
        });
    });

    describe('Viewer-Picker (startPickRef/resolvePickRef/cancelPickRef)', () => {
        it('startPickRef setzt den Editor-Modus und merkt sich den Callback', () => {
            const cb = () => {};
            store.startPickRef('node', cb);
            expect(store.editor.mode).toBe('pickNodeRef');
            expect(store.editor.pickCallback).toBe(cb);

            store.startPickRef('edge', cb);
            expect(store.editor.mode).toBe('pickEdgeRef');
        });

        it('resolvePickRef ruft den Callback mit der Element-ID auf und setzt auf view zurück', () => {
            let received = null;
            store.startPickRef('node', (id) => { received = id; });
            store.resolvePickRef('N42');
            expect(received).toBe('N42');
            expect(store.editor.mode).toBe('view');
            expect(store.editor.pickCallback).toBeNull();
        });

        it('cancelPickRef bricht ab, OHNE den Callback aufzurufen', () => {
            let called = false;
            store.startPickRef('node', () => { called = true; });
            store.cancelPickRef();
            expect(called).toBe(false);
            expect(store.editor.mode).toBe('view');
            expect(store.editor.pickCallback).toBeNull();
        });
    });
});
