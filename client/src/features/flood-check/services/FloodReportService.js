import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'

export const FloodReportService = {
    /**
     * Generates a text-based calculation report.
     * @param {Object} store - The Pinia store containing all data.
     */
    generateCalculationPdf(store) {
        try {
            const doc = new jsPDF()
            const pageWidth = doc.internal.pageSize.getWidth()
            let y = 20 // Vertical cursor

            // --- HEADER ---
            doc.setFontSize(20)
            doc.setTextColor(44, 62, 80)
            doc.text("Überflutungsnachweis", 20, y)

            doc.setFontSize(10)
            doc.setTextColor(100)
            doc.text("nach DIN 1986-100", 20, y + 6)

            doc.setFontSize(10)
            doc.text(`Datum: ${new Date().toLocaleDateString()}`, pageWidth - 20, y, { align: 'right' })

            y += 20

            // --- EINGABEDATEN (REGEN) ---
            doc.setFont(undefined, 'bold')
            doc.setFontSize(14)
            doc.setTextColor(0)
            doc.text("1. Eingabedaten (KOSTRA-DWD 2020)", 20, y)
            y += 10

            doc.setFontSize(11)
            doc.text(`Bemessungsregen (r5,2): ${store.rainData.r5_2} l/(s*ha)`, 25, y)
            y += 7
            doc.text(`Starkregen (r5,30): ${store.rainData.r5_30} l/(s*ha)`, 25, y)
            y += 7
            doc.text(`Notentwässerung (r5,100): ${store.rainData.r5_100} l/(s*ha)`, 25, y)
            y += 15

            // --- FLÄCHEN ---
            doc.setFont(undefined, 'bold')
            doc.setFontSize(14)
            doc.text("2. Erfasste Flächen", 20, y)
            y += 10

            // Table Header
            doc.setFontSize(10)
            doc.setFont(undefined, 'bold')
            doc.text("Name", 25, y)
            doc.text("Typ", 80, y)
            doc.text("Cs", 130, y)
            doc.text("Fläche (m²)", 170, y)
            doc.setFont(undefined, 'normal')
            y += 2
            doc.line(25, y, pageWidth - 20, y)
            y += 6

            // Table Rows
            store.surfaces.forEach(surface => {
                const type = store.surfaceTypes.find(t => t.id === surface.typeId)

                doc.text(surface.name || 'Unbenannt', 25, y)
                doc.text(type ? type.name.substring(0, 25) : 'Unbekannt', 80, y)
                doc.text(type ? type.cs.toString() : '-', 130, y)
                doc.text(surface.area.toFixed(2), 170, y)
                y += 7
            })

            y += 5
            doc.line(25, y, pageWidth - 20, y)
            y += 10

            // Summen
            doc.setFont(undefined, 'bold')
            doc.text(`Gesamtfläche: ${store.totalArea.toFixed(2)} m²`, 130, y)
            y += 6
            doc.text(`Effektive Fläche (Au): ${store.totalEffectiveArea.toFixed(2)} m²`, 130, y)
            y += 15

            // --- BERECHNUNG ---
            doc.setFontSize(14)
            doc.text("3. Berechnungsergebnisse", 20, y)
            doc.setFont(undefined, 'normal')
            y += 10

            // 3.1 Standard
            doc.setFontSize(12)
            doc.setFont(undefined, 'bold')
            doc.text("3.1 Standard-Nachweis", 20, y)
            doc.setFont(undefined, 'normal')
            doc.setFontSize(10)
            doc.setTextColor(100)
            doc.text("(siehe DIN 1986-100 S.84 Formel 20)", 20, y + 5)
            doc.setTextColor(0)
            doc.setFontSize(11)
            y += 12
            doc.text(`Zufluss (30a): ${store.volumeIn30.toFixed(2)} m³`, 25, y)
            y += 6
            doc.text(`Kanalabfluss (2a): - ${store.volumeOut2.toFixed(2)} m³`, 25, y)
            y += 8
            doc.setFont(undefined, 'bold')
            doc.text(`Erforderliches Volumen: ${store.retentionVolumeStandard.toFixed(2)} m³`, 25, y)
            doc.setFont(undefined, 'normal')
            y += 15

            // 3.2 Hydraulisch (Optional)
            if (store.additionalCalculations.hydraulic.active) {
                doc.setFontSize(12)
                doc.setFont(undefined, 'bold')
                doc.text("3.2 Hydraulischer Nachweis", 20, y)
                doc.setFont(undefined, 'normal')
                doc.setFontSize(10)
                doc.setTextColor(100)
                doc.text("(siehe DIN 1986-100 Formel 21)", 20, y + 5)
                doc.setTextColor(0)
                doc.setFontSize(11)
                y += 12

                const qVoll = store.additionalCalculations.hydraulic.qVoll
                doc.text(`Verwendete Rohrleistung (Q_voll): ${qVoll} l/s`, 25, y)
                y += 8
                doc.setFont(undefined, 'bold')
                doc.text(`Erforderliches Volumen: ${store.retentionVolumeHydraulic.toFixed(2)} m³`, 25, y)
                doc.setFont(undefined, 'normal')
                y += 15
            }

            // 3.3 Drossel (Optional)
            if (store.additionalCalculations.throttle.active) {
                doc.setFontSize(12)
                doc.setFont(undefined, 'bold')
                doc.text("3.3 Drossel-Nachweis", 20, y)
                doc.setFont(undefined, 'normal')
                doc.setFontSize(10)
                doc.setTextColor(100)
                doc.text("(siehe DIN 1986-100 Formel 22)", 20, y + 5)
                doc.setTextColor(0)
                doc.setFontSize(11)
                y += 12

                const qDr = store.additionalCalculations.throttle.qDr
                const fZ = store.additionalCalculations.throttle.safetyFactor
                doc.text(`Drosselabfluss (Q_Dr): ${qDr} l/s`, 25, y)
                y += 6
                doc.text(`Sicherheitsfaktor (f_Z): ${fZ}`, 25, y)
                y += 8
                doc.setFont(undefined, 'bold')
                doc.text(`Erforderliches Volumen: ${store.retentionVolumeThrottle.toFixed(2)} m³`, 25, y)
                doc.setFont(undefined, 'normal')
                y += 15
            }

            // 4. Hinweise
            if (store.roofAreaPercentage > 70) {
                doc.setFontSize(12)
                doc.setTextColor(192, 57, 43) // Red color for warning
                doc.setFont(undefined, 'bold')
                doc.text("4. Wichtige Hinweise", 20, y)
                y += 8
                doc.setFontSize(11)
                doc.text("! ACHTUNG: Dachflächenanteil > 70%", 25, y)
                y += 6
                doc.text("Nachweis der Notentwässerung (r 5,100) ist notwendig!", 25, y)
                doc.setTextColor(0)
            }

            // Save
            doc.save('ueberflutungsnachweis_berechnung.pdf')
        } catch (error) {
            console.error("PDF Generation Error:", error)
            alert(`Fehler beim Erstellen des PDFs: ${error.message}`)
        }
    },

    /**
     * Generates a high-res screenshot of the map.
     * @param {HTMLElement} mapElement - The DOM element of the map to capture.
     */
    async generateMapPdf(mapElement) {
        if (!mapElement) return

        try {
            // Use html2canvas to capture the map
            // useCORS: true is important for map tiles (if server allows it)
            // logging: false to keep console clean
            const canvas = await html2canvas(mapElement, {
                useCORS: true,
                allowTaint: true,
                logging: false,
                scale: 2 // Higher scale for better quality
            })

            const imgData = canvas.toDataURL('image/png')

            // Create Landscape PDF
            const doc = new jsPDF({
                orientation: 'landscape',
                unit: 'mm',
                format: 'a4'
            })

            const pageWidth = doc.internal.pageSize.getWidth()
            const pageHeight = doc.internal.pageSize.getHeight()

            // Add Image (fit to page)
            doc.addImage(imgData, 'PNG', 0, 0, pageWidth, pageHeight)

            // Add Title Overlay
            doc.setFillColor(255, 255, 255)
            doc.rect(10, 10, 60, 8, 'F') // White background box
            doc.setFontSize(9)
            doc.text("Lageplan: Überflutungsnachweis", 12, 15)

            doc.save('ueberflutungsnachweis_lageplan.pdf')
        } catch (error) {
            console.error("Map export failed:", error)
            alert("Fehler beim Exportieren der Karte.")
        }
    }
}
