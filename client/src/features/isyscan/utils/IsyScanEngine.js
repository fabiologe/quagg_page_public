import projektData from '../ProjektToJson.json' with { type: "json" };
import schemaConfig from '../isybau_schema_config.json' with { type: "json" };

/**
 * Kern-Logik für die Konvertierung von JSON zu ISYBAU XML (Format 2017/07).
 * Strategy: "Direct-Link Parser"
 */
export class IsyScanEngine {
    constructor(loggerCallback) {
        this.logger = loggerCallback;
        this.config = schemaConfig;

        // Globale Offsets
        this.utmx = 0;
        this.utmy = 0;
    }

    async run() {
        this.log("INIT", "Starte IsyScan Engine...", "info");

        try {
            // 1. Data Loading
            const data = await this.fetchProjectData();
            this.utmx = data.utmx || 0;
            this.utmy = data.utmy || 0;

            // 2. Parse Nodes
            const { nodeMap, nodes } = this.parseNodes(data.schächte || []);

            // 3. Parse Edges
            const { edges, virtualNodes } = this.parseEdges(data.leitungen || [], nodeMap);
            const allNodes = [...nodes, ...virtualNodes];

            this.log("STATS", `Nodes: ${allNodes.length}, Edges: ${edges.length}`, "info");

            // 4. XML Generation
            const xml = this.generateXML(allNodes, edges);
            return xml;

        } catch (error) {
            this.log("ERROR", `Abbruch: ${error.message}`, "error");
            throw error;
        }
    }

    log(step, message, status = 'info') {
        if (this.logger) {
            this.logger({ step, message, status, timestamp: new Date().toLocaleTimeString() });
        }
    }

    async fetchProjectData() {
        await new Promise(r => setTimeout(r, 50));
        return projektData;
    }

    // --- NODE PARSING ---
    parseNodes(rawNodes) {
        const nodeMap = new Map();
        const nodes = [];

        rawNodes.forEach(n => {
            const rawName = n.name || n.id;
            const x = (n.position?.x || 0) + this.utmx;
            const y = (n.position?.y || 0) + this.utmy;
            const z = n.position?.z || 0;

            const nodeObj = {
                id: n.id,
                name: rawName.trim(),
                x: x,
                y: y,
                z: z,
                isybauType: this.determineNodeType(n),
                original: n
            };

            nodes.push(nodeObj);
            nodeMap.set(nodeObj.name, nodeObj);
        });

        return { nodeMap, nodes };
    }

    determineNodeType(node) {
        const name = (node.name || "").toUpperCase();
        if (name.startsWith("S") || name.includes("SCHACHT")) return 0; // Schacht
        return 0; // Default
    }

    // --- EDGE PARSING ---
    parseEdges(rawEdges, nodeMap) {
        const edges = [];
        const virtualNodes = [];
        let vNodeCounter = 1000;

        rawEdges.forEach(e => {
            const props = e.eigenschaften || [];
            const getProp = (t) => props.find(p => p.titel && p.titel.includes(t))?.text;

            const startName = getProp("Knotenbezeichnung oben");
            const endName = getProp("Knotenbezeichnung unten");
            // Parse Diameter (Profilhöhe) - Default to 0 if not found
            const diameterStr = getProp("Profilhöhe (mm)") || "0";
            const diameter = parseFloat(diameterStr.replace(',', '.')) || 0;

            const geometry = (e.points || []).map(p => ({
                x: (p.x || 0) + this.utmx,
                y: (p.y || 0) + this.utmy,
                z: p.z || 0
            }));

            if (geometry.length < 2) return;

            let startNodeId = null;
            let endNodeId = null;

            // Start
            if (startName && nodeMap.has(startName.trim())) {
                startNodeId = nodeMap.get(startName.trim()).id;
            } else {
                const vName = `V_Start_${e.name || vNodeCounter}`;
                const vNode = this.createVirtualNode(geometry[0], vName, vNodeCounter++);
                virtualNodes.push(vNode);
                startNodeId = vNode.id;
            }

            // End
            if (endName && nodeMap.has(endName.trim())) {
                endNodeId = nodeMap.get(endName.trim()).id;
            } else {
                const vName = `V_End_${e.name || vNodeCounter}`;
                const vNode = this.createVirtualNode(geometry[geometry.length - 1], vName, vNodeCounter++);
                virtualNodes.push(vNode);
                endNodeId = vNode.id;
            }

            const materialCode = this.mapMaterial(props);

            edges.push({
                id: e.id,
                name: e.name || e.id,
                startNodeId,
                endNodeId,
                startNodeName: startName || "Unknown",
                endNodeName: endName || "Unknown",
                geometry,
                materialCode,
                diameter,
                isybauType: 0 // 0 = Haltung
            });
        });

        return { edges, virtualNodes };
    }

    createVirtualNode(point, name, idSuffix) {
        return {
            id: `VNODE_${idSuffix}`,
            name: name,
            x: point.x,
            y: point.y,
            z: point.z,
            isybauType: 1
        };
    }

    mapMaterial(props) {
        const findValue = (keys) => {
            const entry = props.find(p => keys.some(k => p.titel && p.titel.includes(k)));
            return entry ? entry.text : null;
        };

        const rawVal = findValue(["Material", "Werkstoff"]);
        const dict = this.config.reference_dictionaries?.G102;

        if (rawVal && dict) {
            const rawMaterial = String(rawVal);
            for (const [code, val] of Object.entries(dict)) {
                const text = String(val);
                if (text === rawMaterial || rawMaterial.includes(text) || text.includes(rawMaterial)) {
                    return code;
                }
            }
        }
        return null;
    }

    // --- XML GENERATION (ISYBAU 2017) ---
    generateXML(nodes, edges) {
        const writer = new XmlWriter();

        // Header
        const lines = [
            '<?xml version="1.0" encoding="ISO-8859-1" standalone="yes" ?>',
            '<Identifikation xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns="http://www.bfr-abwasser.de">',
            ' <Version>2017-07</Version>',
            ' <Admindaten></Admindaten>',
            ' <Datenkollektive>',
            '  <Datenstatus>1</Datenstatus>',
            `  <Erstellungsdatum>${new Date().toISOString().split('T')[0]}</Erstellungsdatum>`,
            '  <Kennungen>',
            '   <Kollektiv>',
            '    <Kennung>STA01</Kennung>',
            '    <Kollektivart>1</Kollektivart>',
            '    <Kollektiveigenschaft>',
            '     <Stammdaten>',
            '      <Stammdatentyp>1</Stammdatentyp>',
            '      <Bautechnik>1</Bautechnik>',
            '      <Geometrie>1</Geometrie>',
            '      <Sanierung>0</Sanierung>',
            '      <Umfeld>0</Umfeld>',
            '      </Stammdaten>',
            '     </Kollektiveigenschaft>',
            '    </Kollektiv>',
            '   </Kennungen>',
            '  <Stammdatenkollektiv>',
            '   <Kennung>STA01</Kennung>'
        ];

        // Nodes
        nodes.forEach(n => {
            lines.push('   <AbwassertechnischeAnlage>');
            lines.push(`    <Objektbezeichnung>${n.name}</Objektbezeichnung>`);
            lines.push('    <Objektart>2</Objektart>');
            lines.push('    <Status>0</Status>');
            lines.push('    <Knoten>');
            lines.push(`     <KnotenTyp>${n.isybauType}</KnotenTyp>`);
            lines.push('    </Knoten>');
            lines.push(writer.writeNodeGeometry(n));
            lines.push('   </AbwassertechnischeAnlage>');
        });

        // Edges
        edges.forEach(e => {
            const length = this.calcLength(e.geometry).toFixed(2);
            const zStart = e.geometry[0].z.toFixed(3);
            const zEnd = e.geometry[e.geometry.length - 1].z.toFixed(3);

            lines.push('   <AbwassertechnischeAnlage>');
            lines.push(`    <Objektbezeichnung>${e.name}</Objektbezeichnung>`);
            lines.push('    <Objektart>1</Objektart>');
            lines.push('    <Status>0</Status>');

            lines.push('    <Kante>');
            lines.push(`     <KantenTyp>${e.isybauType}</KantenTyp>`);
            lines.push(`     <KnotenZulauf>${e.startNodeName}</KnotenZulauf>`);
            lines.push(`     <KnotenAblauf>${e.endNodeName}</KnotenAblauf>`);
            // Add Sohlhoehe (Sohle) for Zulauf/Ablauf based on geometry
            lines.push(`     <SohlhoeheZulauf>${zStart}</SohlhoeheZulauf>`);
            lines.push(`     <SohlhoeheAblauf>${zEnd}</SohlhoeheAblauf>`);
            lines.push(`     <Laenge>${length}</Laenge>`);

            if (e.materialCode) lines.push(`     <Material>${e.materialCode}</Material>`);

            // Profil (Diameter)
            if (e.diameter > 0) {
                lines.push('     <Profil>');
                lines.push('      <SonderprofilVorhanden>0</SonderprofilVorhanden>');
                lines.push('      <Profilart>0</Profilart>'); // Kreis
                lines.push(`      <Profilhoehe>${e.diameter}</Profilhoehe>`);
                lines.push('     </Profil>');
            }

            if (e.isybauType === 0) {
                lines.push('     <Haltung>');
                lines.push(`      <Rohrlaenge>${length}</Rohrlaenge>`);
                lines.push('     </Haltung>');
            }
            lines.push('    </Kante>');

            lines.push(writer.writeEdgeGeometry(e.geometry));
            lines.push('   </AbwassertechnischeAnlage>');
        });

        lines.push('  </Stammdatenkollektiv>');
        lines.push(' </Datenkollektive>');
        lines.push('</Identifikation>');

        return lines.join("\n");
    }

    calcLength(points) {
        let len = 0;
        for (let i = 0; i < points.length - 1; i++) {
            const dx = points[i + 1].x - points[i].x;
            const dy = points[i + 1].y - points[i].y;
            len += Math.sqrt(dx * dx + dy * dy);
        }
        return len;
    }
}

class XmlWriter {
    writeNodeGeometry(node) {
        return `    <Geometrie>
     <GeoObjektart>1</GeoObjektart>
     <GeoObjekttyp>P</GeoObjekttyp>
     <Geometriedaten>
      <Knoten>
       <Punkt>
        <Rechtswert>${node.x.toFixed(3)}</Rechtswert>
        <Hochwert>${node.y.toFixed(3)}</Hochwert>
        <Punkthoehe>${node.z.toFixed(3)}</Punkthoehe>
        <PunktattributAbwasser>SOH</PunktattributAbwasser>
       </Punkt>
      </Knoten>
     </Geometriedaten>
    </Geometrie>`;
    }

    writeEdgeGeometry(points) {
        const start = points[0];
        const end = points[points.length - 1];

        return `    <Geometrie>
     <GeoObjektart>4</GeoObjektart>
     <GeoObjekttyp>L</GeoObjekttyp>
     <Geometriedaten>
      <Polygone>
       <Polygon>
        <Polygonart>3</Polygonart>
        <Kante>
         <Start>
           <Rechtswert>${start.x.toFixed(3)}</Rechtswert>
           <Hochwert>${start.y.toFixed(3)}</Hochwert>
           <Punkthoehe>${start.z.toFixed(3)}</Punkthoehe>
         </Start>
         <Ende>
           <Rechtswert>${end.x.toFixed(3)}</Rechtswert>
           <Hochwert>${end.y.toFixed(3)}</Hochwert>
           <Punkthoehe>${end.z.toFixed(3)}</Punkthoehe>
         </Ende>
        </Kante>
       </Polygon>
      </Polygone>
     </Geometriedaten>
    </Geometrie>`;
    }
}
