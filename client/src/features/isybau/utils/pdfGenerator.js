import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getMapping } from './mappings.js';

/**
 * Generates a PDF Report from Simulation Results
 */
export const generateSimulationReport = (
    fileName,
    metadata,
    systemStats,
    nodes,
    edges,
    areas,
    nodeResults,
    edgeResults,
    subcatchmentResults,
    timeSeries
) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    // --- Header ---
    doc.setFontSize(18);
    doc.text(`Simulationsbericht: ${metadata.fileName || 'Unbenanntes Projekt'}`, 14, 20);

    doc.setFontSize(10);
    doc.text(`Erstellt am: ${new Date().toLocaleString()}`, 14, 28);
    doc.text(`Isybau Version: ${metadata.version || '1.0'}`, 14, 33);

    let yPos = 45;

    // --- System Stats ---
    doc.setFontSize(14);
    doc.text("System Zusammenfassung", 14, yPos);
    yPos += 8;

    const volStats = [
        ['Parameter', 'Volumen (m³)'],
        ['Niederschlag (Flächen)', formatVolume((systemStats?.runoff?.precip || 0) * 10000)],
        ['Versickerung & Verluste', formatVolume(((systemStats?.runoff?.evap || 0) + (systemStats?.runoff?.infil || 0)) * 10000)],
        ['Oberflächenabfluss (Zufluss)', formatVolume((systemStats?.runoff?.runoff || 0) * 10000)],
        ['Gesamtvolumen Ein (Netz)', formatVolume((systemStats?.flow?.inflowVol || 0) * 1000)],
        ['Gesamtvolumen Aus (Netz)', formatVolume((systemStats?.flow?.outflowVol || 0) * 1000)],
        ['Überstauvolumen (Flooding)', formatVolume((systemStats?.flow?.floodingVol || 0) * 1000)],
        ['Speicheränderung', formatVolume(((systemStats?.flow?.finalStoredVol || 0) - (systemStats?.flow?.initialStoredVol || 0)) * 1000)],
        ['Kontinuitätsfehler', `${(systemStats?.flow?.error || 0).toFixed(2)} %`]
    ];

    autoTable(doc, {
        startY: yPos,
        head: [['Parameter', 'Wert']],
        body: volStats,
        theme: 'striped',
        headStyles: { fillColor: [52, 152, 219] },
        styles: { fontSize: 10 }
    });

    yPos = doc.lastAutoTable.finalY + 15;

    // --- Function to add new page if needed ---
    const checkPageBreak = (needed = 30) => {
        if (yPos + needed > doc.internal.pageSize.height) {
            doc.addPage();
            yPos = 20;
            return true;
        }
        return false;
    };

    // --- Nodes Table ---
    checkPageBreak();
    doc.setFontSize(14);
    doc.text("Schächte & Bauwerke", 14, yPos);
    yPos += 8;

    // Filter & Sort Nodes
    const sortedNodes = Array.from(nodes.values()).sort((a, b) => a.id.localeCompare(b.id));

    const nodeRows = sortedNodes.map(n => {
        const res = nodeResults.get(n.id) || {};
        const status = getNodeStatusName(res);
        return [
            n.id,
            getNodeTypeLabel(n.type),
            n.z?.toFixed(2) || '-',
            res.maxDepth?.toFixed(2) || '-',
            res.maxInflow?.toFixed(2) || '-',
            // Combine Ponded/Stored vol logic usually shown in UI
            (res.maxVolumeStored || res.pondedVolume)?.toFixed(3) || '-',
            status
        ];
    });

    autoTable(doc, {
        startY: yPos,
        head: [['ID', 'Typ', 'Sohlhöhe', 'Max Tiefe', 'Max Zufl.', 'Vol (m³)', 'Status']],
        body: nodeRows,
        theme: 'grid',
        headStyles: { fillColor: [44, 62, 80] },
        styles: { fontSize: 8 },
        didParseCell: (data) => {
            // Highlight Overflows
            if (data.section === 'body' && data.column.index === 6) {
                if (data.cell.raw === 'Überstau') {
                    data.cell.styles.textColor = [231, 76, 60]; // Red
                    data.cell.styles.fontStyle = 'bold';
                }
            }
        }
    });

    yPos = doc.lastAutoTable.finalY + 15;

    // --- Edges Table ---
    checkPageBreak();
    doc.setFontSize(14);
    doc.text("Haltungen (Rohre)", 14, yPos);
    yPos += 8;

    const sortedEdges = Array.from(edges.values()).sort((a, b) => a.id.localeCompare(b.id));

    const edgeRows = sortedEdges.map(e => {
        const res = edgeResults.get(e.id) || {};

        // Calc Slope if missing
        let slope = e.slope;
        if (!slope && nodes.get(e.fromNodeId) && nodes.get(e.toNodeId)) {
            const z1 = nodes.get(e.fromNodeId).z + (e.z1 !== undefined ? (e.z1 - nodes.get(e.fromNodeId).z) : 0);
            const z2 = nodes.get(e.toNodeId).z + (e.z2 !== undefined ? (e.z2 - nodes.get(e.toNodeId).z) : 0);
            if (e.length > 0) slope = (Math.abs(z1 - z2) / e.length) * 100;
        }

        // Calc Avg V
        const vAvg = getAvgVelocity(e.id, timeSeries);

        return [
            e.id,
            e.length?.toFixed(2),
            slope ? slope.toFixed(2) : '-',
            getProfileLabel(e.profile),
            res.maxFlow?.toFixed(2) || '-',
            res.capacity?.toFixed(2) || '-',
            `${(res.utilization || 0).toFixed(0)}%`,
            res.maxVelocity?.toFixed(2) || '-',
            vAvg.toFixed(2)
        ];
    });

    autoTable(doc, {
        startY: yPos,
        head: [['ID', 'Länge', 'Gefälle %', 'Profil', 'Qmax', 'Qvoll', 'Auslast.', 'vMax', 'vAvg']],
        body: edgeRows,
        theme: 'grid',
        headStyles: { fillColor: [44, 62, 80] },
        styles: { fontSize: 8 },
        didParseCell: (data) => {
            if (data.section === 'body' && data.column.index === 6) {
                // Parse %
                const val = parseFloat(data.cell.raw);
                if (val > 100) data.cell.styles.textColor = [231, 76, 60];
            }
        }
    });

    // --- Save ---
    doc.save(`${fileName || 'Simulation_Result'}.pdf`);
};

// --- Helpers ---

const formatVolume = (val) => (val || 0).toFixed(3);

const getNodeStatusName = (res) => {
    if (!res) return 'OK';
    if (res.overflow) return 'Überstau';
    if (res.pondedVolume > 0 && res.totalOutflowVolume === undefined) return 'Überstau';
    return 'OK';
};

const getAvgVelocity = (edgeId, timeSeries) => {
    if (!timeSeries || timeSeries.length === 0) return 0;
    let sumV = 0, count = 0;
    timeSeries.forEach(step => {
        if (step.edges && step.edges[edgeId]) {
            sumV += step.edges[edgeId].v || 0;
            count++;
        }
    });
    return count > 0 ? (sumV / count) : 0;
};

const getProfileLabel = (profile) => {
    if (!profile) return '-';
    // Simplified label
    const h = Math.round(profile.height * 1000);
    const w = Math.round(profile.width * 1000);
    return `${h}/${w}`;
};

const getNodeTypeLabel = (type) => {
    // Basic simplification
    return isNaN(type) ? type : 'Schacht/Node';
};
