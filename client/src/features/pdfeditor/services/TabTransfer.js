/**
 * TabTransfer — Tabs zwischen zwei Editor-Fenstern verschieben.
 *
 * Die Fenster teilen sich dieselbe IndexedDB (origin-weit) — „verschieben"
 * heißt also nur: das Zielfenster öffnet die dokId als Tab und meldet die
 * Übernahme über einen BroadcastChannel; das Quellfenster schließt daraufhin
 * seinen Tab. So ist das Dokument nie in zwei Fenstern zugleich offen
 * (die debounced Annotations-Persistenz würde sich sonst überschreiben).
 *
 * Der Kanal-Konstruktor ist injizierbar (jsdom kennt BroadcastChannel nicht
 * überall); ohne Kanal wird alles zum No-op — Drag&Drop im selben Fenster
 * (Reorder) funktioniert unabhängig davon.
 */

export const TAB_DRAG_TYP = 'application/x-quagg-pdf-dok';

export function erzeugeTabTransfer({ kanalKonstruktor } = {}) {
    const Kanal = kanalKonstruktor
        ?? (typeof BroadcastChannel !== 'undefined' ? BroadcastChannel : null);
    const instanzId = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : String(Math.random());
    let kanal = null;
    let handler = null;

    if (Kanal) {
        kanal = new Kanal('quagg-pdf-tabs');
        kanal.onmessage = (ev) => {
            const d = ev?.data;
            if (d?.art === 'uebernommen' && d.von !== instanzId && d.dokId) {
                handler?.(d.dokId);
            }
        };
    }

    return {
        instanzId,

        /** Meldet allen anderen Fenstern: dieses Fenster hat dokId übernommen. */
        meldeUebernahme(dokId) {
            kanal?.postMessage({ art: 'uebernommen', dokId, von: instanzId });
        },

        /** cb(dokId) — ein ANDERES Fenster hat dokId übernommen. */
        aufUebernahme(cb) { handler = cb; },

        schliesse() {
            kanal?.close();
            kanal = null;
            handler = null;
        },
    };
}

// EIN Kanal je Fenster (TabBar, Startseite und View teilen ihn).
let _instanz = null;

export function holeTabTransfer() {
    if (!_instanz) _instanz = erzeugeTabTransfer();
    return _instanz;
}

export function schliesseTabTransfer() {
    _instanz?.schliesse();
    _instanz = null;
}
