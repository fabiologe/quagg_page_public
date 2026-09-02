/**
 * Übergabepakete — Transmittals (Lücke ⑩, 2026-09-02).
 *
 * Der formale ISO-19650-Ausgang: WAS wurde WEM WANN übergeben. Ein
 * Transmittal ist ein ZIP aus ausgewählten Dokumenten des Registers plus
 * einem Begleitschein — und ein PROTOKOLLEINTRAG, der bleibt (append-only,
 * in der Auftragsablage): das Paket verlässt das Haus, der Nachweis nicht.
 *
 * Die fachliche Regel, die hier wohnt: übergeben wird nur SHARED oder
 * PUBLISHED. WIP ist Arbeitsstand (per Definition nicht teilbar), Archived
 * ist aus dem Verkehr gezogen. Wer Archiviertes verschicken will, hebt es
 * erst zurück — sichtbar, mit Rang (Lücke ④), nicht über die Hintertür
 * eines Pakets.
 *
 * Rein: kein Zip, kein DOM — Schein und Protokoll sind Daten; das Packen
 * und der Download bleiben beim Aufrufer (jszip, Browser).
 */

export const REPO_KEY_TRANSMITTALS = 'transmittals';

export const UEBERGABEFAEHIG = Object.freeze(['Shared', 'Published']);

/** @returns {{ok, grund}} */
export function pruefeAuswahl(dokumente) {
    if (!Array.isArray(dokumente) || !dokumente.length) {
        return { ok: false, grund: 'Kein Dokument gewählt.' };
    }
    const falsch = dokumente.filter(d => !UEBERGABEFAEHIG.includes(d?.status));
    if (falsch.length) {
        return {
            ok: false,
            grund: `${falsch.map(d => d?.name ?? '?').join(', ')}: nur Shared oder `
                + 'Published wird übergeben — WIP ist Arbeitsstand, Archived ist aus dem Verkehr.',
        };
    }
    return { ok: true, grund: null };
}

/** Der Begleitschein als Klartext — er liegt MIT im Paket. */
export function baueSchein({ auftrag, empfaenger = '', anmerkung = '', wer = '',
                             wann = Date.now(), dokumente = [] } = {}) {
    const datum = new Date(wann).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
    const zeilen = [
        'ÜBERGABESCHEIN (Transmittal, ISO 19650)',
        '='.repeat(46),
        '',
        `Auftrag:     ${auftrag?.nummer ?? ''} ${auftrag?.name ?? ''}`.trim(),
        `Empfänger:   ${empfaenger || '—'}`,
        `Übergeben:   ${datum} von ${wer || '—'}`,
    ];
    if (anmerkung) zeilen.push('', `Anmerkung:   ${anmerkung}`);
    zeilen.push('', `Dokumente (${dokumente.length}):`, '-'.repeat(46));
    for (const d of dokumente) {
        zeilen.push(
            `  ${d.name}`,
            `      Revision ${d.revision ?? '—'} · Status ${d.status}`,
            `      SHA-256  ${d.sha256}`,
        );
    }
    zeilen.push('', 'Die Prüfsummen benennen den übergebenen Stand eindeutig —',
        'eine spätere Fassung gleichen Namens ist ein ANDERES Dokument.', '');
    return zeilen.join('\n');
}

/** Der Protokolleintrag — bleibt in der Auftragsablage, append-only. */
export function protokollEintrag({ empfaenger = '', anmerkung = '', wer = '',
                                   wann = Date.now(), dokumente = [] } = {}) {
    return {
        id: `t-${wann.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        empfaenger, anmerkung, wer, wann,
        dokumente: dokumente.map(d => ({
            name: d.name, sha256: d.sha256, revision: d.revision ?? null, status: d.status,
        })),
    };
}

/** Dateiname des Pakets — sprechend und sortierbar. */
export function paketName(auftrag, wann = Date.now()) {
    const d = new Date(wann);
    const stempel = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const nummer = String(auftrag?.nummer ?? 'CDE').replace(/[^\w-]+/g, '_');
    return `Uebergabe_${nummer}_${stempel}.zip`;
}
