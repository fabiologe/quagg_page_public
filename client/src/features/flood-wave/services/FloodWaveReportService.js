import { jsPDF } from 'jspdf'

export const FloodWaveReportService = {
    /**
     * Generates a report for the Flood Wave Calculation (HQ100).
     * @param {Object} store - The useFloodWaveStore instance.
     */
    generateFloodWaveReport(store) {
        try {
            const doc = new jsPDF()
            const pageWidth = doc.internal.pageSize.getWidth()
            let y = 20

            // --- HEADER ---
            doc.setFontSize(20)
            doc.setTextColor(44, 62, 80)
            doc.text("Hochwasserwelle HQ100", 20, y)

            doc.setFontSize(10)
            doc.setTextColor(100)
            doc.text("SCS-Verfahren & Lineare Speicherkaskade", 20, y + 6)

            doc.setFontSize(10)
            doc.text(`Datum: ${new Date().toLocaleDateString()}`, pageWidth - 20, y, { align: 'right' })

            y += 20

            // --- 1. GEOMETRIE ---
            doc.setFont(undefined, 'bold')
            doc.setFontSize(14)
            doc.setTextColor(0)
            doc.text("1. Einzugsgebiet & Geometrie", 20, y)
            y += 10

            doc.setFontSize(11)
            doc.setFont(undefined, 'normal')
            doc.text(`Fließlänge (Lf): ${store.params.Lf} km`, 25, y)
            y += 6
            doc.text(`Höhendifferenz (dH): ${store.params.deltaH} m`, 25, y)
            y += 6
            doc.text(`Konzentrationszeit (Tc): ${store.tcResult.toFixed(2)} h`, 25, y)
            y += 15

            // --- 2. FLÄCHEN ---
            doc.setFont(undefined, 'bold')
            doc.setFontSize(14)
            doc.text("2. Flächen & CN-Werte", 20, y)
            y += 10

            // Table Header
            doc.setFontSize(10)
            doc.setFont(undefined, 'bold')
            doc.text("Name", 25, y)
            doc.text("Fläche (ha)", 100, y)
            doc.text("CN", 150, y)
            doc.setFont(undefined, 'normal')
            y += 2
            doc.line(25, y, pageWidth - 20, y)
            y += 6

            // Rows
            store.areas.forEach(area => {
                doc.text(area.name || 'Unbenannt', 25, y)
                doc.text((area.area / 10000).toFixed(2), 100, y)
                doc.text(area.cn.toString(), 150, y)
                y += 6
            })

            y += 2
            doc.line(25, y, pageWidth - 20, y)
            y += 8

            doc.setFont(undefined, 'bold')
            doc.text(`Gesamtfläche: ${(store.totalArea / 10000).toFixed(2)} ha`, 100, y)
            y += 6
            doc.text(`Gewichteter CN: ${store.weightedCN.toFixed(1)}`, 100, y)
            y += 15

            // --- 3. REGEN ---
            doc.setFontSize(14)
            doc.text("3. Niederschlag (T=100a)", 20, y)
            y += 10
            doc.setFontSize(11)
            doc.setFont(undefined, 'normal')
            doc.text(`Niederschlagshöhe (P): ${store.params.P} mm`, 25, y)
            y += 6
            doc.text(`Dauer (D): ${store.params.D} min`, 25, y)
            y += 15

            // --- 4. PARAMETER ---
            doc.setFontSize(14)
            doc.setFont(undefined, 'bold')
            doc.text("4. Modellparameter", 20, y)
            y += 10
            doc.setFontSize(11)
            doc.setFont(undefined, 'normal')
            doc.text(`Basisabfluss (qBase): ${store.params.qBase} l/s*km²`, 25, y)
            y += 6
            doc.text(`Speicherkoeffizient (k): ${store.params.k} h`, 25, y)
            y += 6
            doc.text(`Kaskaden (n): ${store.params.n}`, 25, y)
            y += 6
            doc.text(`Drosselabfluss (Q_Dr): ${store.params.qDr} l/s`, 25, y)
            y += 15

            // --- 5. ERGEBNISSE ---
            doc.setFontSize(14)
            doc.setFont(undefined, 'bold')
            doc.text("5. Ergebnisse", 20, y)
            y += 10

            doc.setFontSize(12)
            doc.text(`Maximaler Abfluss (Qmax): ${store.results.qMax.toFixed(3)} m³/s`, 25, y)
            y += 8
            doc.text(`Erforderliches Rückhaltevolumen (Verf): ${store.results.vReq.toFixed(0)} m³`, 25, y)

            // Save
            doc.save('hochwasserwelle_hq100_bericht.pdf')
        } catch (error) {
            console.error("Report Generation Error:", error)
            alert(`Fehler beim Erstellen des Berichts: ${error.message}`)
        }
    }
}
