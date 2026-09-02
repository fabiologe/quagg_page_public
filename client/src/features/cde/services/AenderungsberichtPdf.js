/**
 * AenderungsberichtPdf — die Darstellung des Berichts (Stufe 9.5).
 *
 * Bewusst NUR Darstellung: die Struktur kommt fertig aus
 * `Aenderungsbericht.baueBericht`. Ein schlichtes A4-Textdokument mit
 * Zeilenumbruch und Seitenwechsel — kein Plot, kein Schriftfeld; der
 * Bericht ist ein Schreiben an den Planer, kein Plan.
 */
import { jsPDF } from 'jspdf';

const RAND = 18;          // mm
const BREITE = 210 - 2 * RAND;
const UNTEN = 297 - 16;

export function schreibeBericht(bericht) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    let y = RAND;

    const umbruch = (brauch = 8) => {
        if (y + brauch > UNTEN) { doc.addPage(); y = RAND; }
    };
    const text = (t, { groesse = 10, fett = false, einzug = 0, abstand = 4.6 } = {}) => {
        doc.setFontSize(groesse);
        doc.setFont('helvetica', fett ? 'bold' : 'normal');
        for (const zeile of doc.splitTextToSize(t, BREITE - einzug)) {
            umbruch(abstand + 1);
            doc.text(zeile, RAND + einzug, y);
            y += abstand;
        }
    };
    const abschnitt = (titel) => {
        y += 4; umbruch(12);
        text(titel, { groesse: 13, fett: true, abstand: 6.5 });
        y += 1;
    };

    // ── Kopf ────────────────────────────────────────────────────────────────
    const k = bericht.kopf;
    text(k.titel, { groesse: 18, fett: true, abstand: 8.5 });
    const kopfzeilen = [
        k.projekt && `Projekt: ${k.projekt}`,
        k.modell && `Modell: ${k.modell}`,
        k.modellSha && `Modellstand (sha): ${k.modellSha}`,
        `Erstellt: ${k.datum}`,
        k.bearbeiter.length && `Bearbeiter: ${k.bearbeiter.join(', ')}`,
        `${k.anzahlEintraege} Einträge in ${k.anzahlVorgaenge} Vorgängen`,
    ].filter(Boolean);
    for (const z of kopfzeilen) text(z, { groesse: 9.5, abstand: 4.4 });
    text('Die CDE ändert das Autorenmodell nicht. Zeilen ohne Kennzeichen sind '
        + 'FORDERUNGEN an den Planer; „eigenes Bauteil" heisst: in der CDE erzeugt.',
        { groesse: 8.5, abstand: 4 });

    // ── 1. Wirksamer Stand ──────────────────────────────────────────────────
    abschnitt(`Wirksamer Stand — ${bericht.stand.length} Festlegungen`);
    if (!bericht.stand.length) text('Keine wirksamen Festlegungen.', { groesse: 9.5 });
    for (const z of bericht.stand) {
        umbruch(10);
        text(`${z.bauteil} — ${z.art}${z.eigen ? ' (eigenes Bauteil)' : ''}`,
            { groesse: 10, fett: true, abstand: 4.8 });
        text(z.text, { groesse: 9.5, einzug: 4 });
        for (const b of z.befunde) {
            text(`Befund beim Setzen: ${b}`, { groesse: 8.5, einzug: 4 });
        }
        y += 1.5;
    }

    // ── 2. Verlauf ──────────────────────────────────────────────────────────
    abschnitt('Verlauf');
    for (const v of bericht.verlauf) {
        umbruch(12);
        text(`${v.titel} — ${v.wer}${v.wann ? `, ${v.wann}` : ''}`,
            { groesse: 10, fett: true, abstand: 4.8 });
        for (const z of v.zeilen) {
            text(`${z.bauteil} · ${z.art}: ${z.text}`, { groesse: 9, einzug: 4 });
        }
        y += 1.5;
    }

    // ── 3. Konflikte ────────────────────────────────────────────────────────
    if (bericht.konflikte.length) {
        abschnitt(`Konflikte beim Nachspielen — ${bericht.konflikte.length}`);
        for (const kfl of bericht.konflikte) {
            text(`${kfl.globalId} · ${kfl.art}: ${kfl.zustand}`
                + (kfl.grund ? ` (${kfl.grund})` : ''), { groesse: 9, einzug: 4 });
        }
    }

    return doc;
}
