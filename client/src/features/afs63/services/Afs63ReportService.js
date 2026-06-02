import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'

// Deutsche Zahlenformatierung (Komma-Dezimal, Tausenderpunkt).
function fmt(value, dec = 0) {
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(value ?? 0)
}

// PDF- und Karten-Export für den AFS63-Behandlungsbedarf (DWA-A 102-2:2020).
// Struktur analog FloodReportService, Inhalt auf die emissionsbezogene Stoffbilanz angepasst.
export const Afs63ReportService = {
  /**
   * Erzeugt den textbasierten Berechnungsbericht.
   * @param {Object} store - Pinia-Store (useAfs63Store)
   */
  generateCalculationPdf(store) {
    try {
      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      let y = 20

      const checkPageBreak = (heightNeeded) => {
        if (y + heightNeeded > pageHeight - 20) {
          doc.addPage()
          y = 20
          return true
        }
        return false
      }

      // --- HEADER ---
      doc.setFontSize(20)
      doc.setTextColor(44, 62, 80)
      doc.text('Behandlungsbedarf AFS63', 20, y)
      doc.setFontSize(10)
      doc.setTextColor(100)
      doc.text('nach DWA-A 102-2/BWK-A 3-2:2020', 20, y + 6)
      doc.text(`Datum: ${new Date().toLocaleDateString()}`, pageWidth - 20, y, { align: 'right' })
      y += 20

      // --- 1. FLÄCHEN ---
      checkPageBreak(30)
      doc.setFont(undefined, 'bold')
      doc.setFontSize(14)
      doc.setTextColor(0)
      doc.text('1. Erfasste Flächen und Stoffabtrag', 20, y)
      y += 10

      const drawTableHeader = (currentY) => {
        doc.setFontSize(9)
        doc.setFont(undefined, 'bold')
        doc.text('Name', 22, currentY)
        doc.text('Gruppe', 70, currentY)
        doc.text('Kat.', 100, currentY)
        doc.text('Ab,a [ha]', 120, currentY)
        doc.text('bR,a', 150, currentY)
        doc.text('BR,a,i [kg/a]', 172, currentY)
        doc.setFont(undefined, 'normal')
        doc.line(22, currentY + 2, pageWidth - 20, currentY + 2)
        return currentY + 7
      }

      y = drawTableHeader(y)
      doc.setFontSize(9)

      store.surfaceLoads.forEach(s => {
        if (checkPageBreak(8)) {
          y = drawTableHeader(y)
        }
        doc.text((s.name || 'Unbenannt').substring(0, 24), 22, y)
        doc.text(s.isRuralRoad ? `AOS/${s.dtv}` : s.groupId, 70, y)
        doc.text(s.category, 100, y)
        doc.text(fmt(s.areaHa, 3), 120, y)
        doc.text(`${s.specificLoad}${s.footnote || ''}`, 150, y)
        doc.text(fmt(s.load, 1), 172, y)
        y += 6
      })

      y += 2
      checkPageBreak(10)
      doc.line(22, y, pageWidth - 20, y)
      y += 8

      // --- 2. BILANZ ---
      checkPageBreak(40)
      doc.setFont(undefined, 'bold')
      doc.setFontSize(14)
      doc.text('2. Stoffbilanz (Gl. 4 / 5)', 20, y)
      doc.setFont(undefined, 'normal')
      y += 10
      doc.setFontSize(11)
      doc.text(`Gesamtfläche Ab,a: ${fmt(store.totalAreaHa, 3)} ha`, 25, y); y += 7
      doc.text(`Stoffabtrag gesamt BR,a: ${fmt(store.totalLoad, 1)} kg/a`, 25, y); y += 7
      doc.text(`Spez. Stoffabtrag bR,a: ${fmt(store.specificLoad, 1)} kg/(ha·a)`, 25, y); y += 7
      doc.text(`Zulässiger Wert bR,e,zul: ${store.allowedSpecificLoad} kg/(ha·a)`, 25, y); y += 12

      // Kategorie-Aufteilung
      checkPageBreak(40)
      doc.setFontSize(12)
      doc.setFont(undefined, 'bold')
      doc.text('Aufteilung nach Belastungskategorie', 20, y)
      doc.setFont(undefined, 'normal')
      doc.setFontSize(9)
      y += 8
      doc.setFont(undefined, 'bold')
      doc.text('Kat.', 25, y)
      doc.text('Fläche [ha]', 55, y)
      doc.text('Anteil [%]', 95, y)
      doc.text('BR,a [kg/a]', 135, y)
      doc.setFont(undefined, 'normal')
      y += 6
      store.categoryBreakdown.forEach(c => {
        doc.text(c.id, 25, y)
        doc.text(fmt(c.areaHa, 3), 55, y)
        doc.text(fmt(c.areaPct, 1), 95, y)
        doc.text(fmt(c.load, 1), 135, y)
        y += 6
      })
      y += 8

      // --- 3. BEWERTUNG ---
      checkPageBreak(50)
      doc.setFontSize(14)
      doc.setFont(undefined, 'bold')
      doc.text('3. Bewertung des Behandlungsbedarfs (Gl. 6)', 20, y)
      doc.setFont(undefined, 'normal')
      y += 10
      doc.setFontSize(11)

      if (store.treatmentRequired) {
        doc.setTextColor(192, 57, 43)
        doc.setFont(undefined, 'bold')
        doc.text('Behandlung ERFORDERLICH', 25, y)
        doc.setFont(undefined, 'normal')
        doc.setTextColor(0)
        y += 7
        doc.text(`Gebietsbezogen erforderlicher Wirkungsgrad ηerf: ${fmt(store.requiredEfficiency, 0)} %`, 25, y)
        y += 9
        doc.setFontSize(10)
        doc.text('Erforderlicher Wirkungsgrad je Kategorie:', 25, y); y += 6
        store.requiredEfficiencyByCategory.forEach(c => {
          if (c.requiredEfficiency > 0) {
            doc.text(`Kat. ${c.id} (${c.specificLoad} kg/(ha·a)): ηerf ≥ ${fmt(c.requiredEfficiency, 0)} %`, 30, y)
            y += 6
          }
        })
      } else {
        doc.setTextColor(39, 174, 96)
        doc.setFont(undefined, 'bold')
        doc.text('Keine Behandlung erforderlich', 25, y)
        doc.setFont(undefined, 'normal')
        doc.setTextColor(0)
        y += 7
        doc.text(`Spez. Stoffabtrag ${fmt(store.specificLoad, 1)} ≤ ${store.allowedSpecificLoad} kg/(ha·a)`, 25, y)
        y += 9
      }

      // --- 3b. ANLAGENVORSCHLÄGE ---
      if (store.treatmentSuggestions.length) {
        checkPageBreak(30)
        y += 3
        doc.setFontSize(12)
        doc.setFont(undefined, 'bold')
        doc.text('Empfohlene Behandlungsanlagen (Vorschlagsalgorithmus)', 20, y)
        doc.setFont(undefined, 'normal')
        doc.setFontSize(10)
        y += 8
        store.treatmentSuggestions.forEach(grp => {
          checkPageBreak(14)
          doc.setFont(undefined, 'bold')
          doc.text(`Kat. ${grp.category}${grp.isRuralRoad ? ' (REwS)' : ''} – ηerf ≥ ${fmt(grp.requiredEfficiency, 0)} %`, 25, y)
          doc.setFont(undefined, 'normal')
          y += 6
          grp.facilities.forEach(f => {
            checkPageBreak(6)
            const mark = f.status === 'geeignet' ? '[+]' : f.status === 'grenzwertig' ? '[~]' : '[-]'
            doc.text(`${mark} ${f.name} – ${f.achievable}%${f.retention ? ' (mit Rückhaltung)' : ''}`, 30, y)
            y += 5
          })
          y += 2
        })
        y += 4
      }

      // --- 4. RESTSTOFFFRACHT (optional) ---
      if (store.treatmentMode !== 'none') {
        checkPageBreak(30)
        y += 5
        doc.setFontSize(12)
        doc.setFont(undefined, 'bold')
        doc.text('4. Resultierende Reststofffracht (Gl. 7 / 8)', 20, y)
        doc.setFont(undefined, 'normal')
        doc.setFontSize(10)
        doc.setTextColor(100)
        const modeLabel = store.treatmentMode === 'central' ? 'zentrale Behandlung' : 'dezentrale Behandlung'
        doc.text(`(${modeLabel})`, 20, y + 5)
        doc.setTextColor(0)
        doc.setFontSize(11)
        y += 12
        doc.text(`Reststofffracht BR,e: ${fmt(store.residualLoad, 1)} kg/a`, 25, y); y += 7
        doc.text(`Spez. Reststoffaustrag: ${fmt(store.residualSpecificLoad, 1)} kg/(ha·a)`, 25, y); y += 7
        if (store.residualWithinLimit) {
          doc.setTextColor(39, 174, 96)
          doc.text('Ziel erreicht (≤ 280 kg/(ha·a)).', 25, y)
        } else {
          doc.setTextColor(192, 57, 43)
          doc.text('Ziel NICHT erreicht – höherer Wirkungsgrad erforderlich.', 25, y)
        }
        doc.setTextColor(0)
        y += 10
      }

      // --- 5. ANLAGENBEMESSUNG REGENKLÄRBECKEN (Stufe 2) ---
      if (store.dimensioning.enabled && store.dimensioningResult) {
        const r = store.dimensioningResult
        const d = store.dimensioning
        checkPageBreak(50)
        y += 3
        doc.setFontSize(12)
        doc.setFont(undefined, 'bold')
        doc.text('5. Anlagenbemessung Regenklärbecken (Abschnitt 6.2)', 20, y)
        doc.setFont(undefined, 'normal')
        doc.setFontSize(10)
        y += 8
        doc.text(`Eingaben: a_BÜ = ${fmt(d.overflowFraction, 2)}, r_krit = ${fmt(d.rkrit, 1)} l/(s·ha), Q_F = ${fmt(d.foreignWater, 1)} l/s, f_D = ${fmt(d.fD, 2)}, h_RKB = ${fmt(d.basinDepth, 1)} m`, 25, y)
        y += 8
        if (r.feasible) {
          doc.text(`Erf. Gesamtwirkungsgrad η_ges: ${fmt(r.etaGes * 100, 1)} %`, 25, y); y += 6
          doc.text(`Oberflächenbeschickung q_A,Bem (Bild 4): ${fmt(r.qABem, 2)} m/h`, 25, y); y += 6
          doc.text(`Bemessungszufluss Q_Bem,Tr: ${fmt(r.qBemTr, 1)} l/s`, 25, y); y += 6
          doc.setFont(undefined, 'bold')
          doc.text(`Beckenoberfläche A_RKB (Gl. 10): ${fmt(r.aRKB, 1)} m²`, 25, y); y += 6
          doc.text(`Beckenvolumen V_RKB (Gl. 11): ${fmt(r.vRKB, 0)} m³`, 25, y); y += 6
          doc.setFont(undefined, 'normal')
          doc.text(`Spez. Volumen: ${fmt(r.specificVolume, 1)} m³/ha · Abmessungen L×B: ${fmt(r.length, 1)} × ${fmt(r.width, 1)} m`, 25, y); y += 6
          if (d.facility === 'schraegklaerer' && r.lamella) {
            doc.text(`Schrägklärer A_eff (Gl. 12, q_A,max = ${fmt(d.qAmax, 1)} m/h): ${fmt(r.lamella.aEff, 1)} m²`, 25, y); y += 6
          }
        } else {
          doc.setTextColor(192, 57, 43)
          doc.text('η_ges zu hoch – Regenklärbecken nicht darstellbar; RBF nach DWA-A 178 erforderlich.', 25, y)
          doc.setTextColor(0)
          y += 6
        }
        y += 6
      }

      // --- Fußnoten (REwS, Tabelle 7 – Außerortsstraßen) ---
      const footnotes = []
      store.surfaceLoads.forEach(s => {
        if (s.footnote && s.footnoteText && !footnotes.some(f => f.marker === s.footnote)) {
          footnotes.push({ marker: s.footnote, text: s.footnoteText })
        }
      })
      if (footnotes.length) {
        checkPageBreak(20)
        y += 5
        doc.setFontSize(9)
        doc.setTextColor(100)
        doc.text('Fußnoten (REwS, Tabelle 7):', 20, y)
        y += 5
        footnotes.forEach(f => {
          const lines = doc.splitTextToSize(`${f.marker}) ${f.text}`, pageWidth - 45)
          lines.forEach(line => {
            checkPageBreak(6)
            doc.text(line, 25, y)
            y += 4.5
          })
          y += 2
        })
        doc.setTextColor(0)
      }

      doc.save('afs63_behandlungsbedarf.pdf')
    } catch (error) {
      console.error('PDF Generation Error:', error)
      alert(`Fehler beim Erstellen des PDFs: ${error.message}`)
    }
  },

  /**
   * Erzeugt einen hochauflösenden Screenshot der Karte als PDF.
   * @param {HTMLElement} mapElement
   */
  async generateMapPdf(mapElement) {
    if (!mapElement) return
    try {
      const canvas = await html2canvas(mapElement, {
        useCORS: true,
        allowTaint: true,
        logging: false,
        scale: 2
      })
      const imgData = canvas.toDataURL('image/png')
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      doc.addImage(imgData, 'PNG', 0, 0, pageWidth, pageHeight)
      doc.setFillColor(255, 255, 255)
      doc.rect(10, 10, 70, 8, 'F')
      doc.setFontSize(9)
      doc.text('Lageplan: Behandlungsbedarf AFS63', 12, 15)
      doc.save('afs63_lageplan.pdf')
    } catch (error) {
      console.error('Map export failed:', error)
      alert('Fehler beim Exportieren der Karte.')
    }
  }
}
