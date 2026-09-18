/**
 * Die Rezepte aus der Bibliothek — das Register (Teil XXIII, A5).
 *
 * Ein BLATT ohne eigene Importe: `Bauteilrezepte.rezeptNach` fragt hier nach,
 * und der Katalog (`katalog/Katalog.js`) füllt es nach der Prüfung. Stünde die
 * Prüfung hier, liefe ein Importkreis Bauteilrezepte → Register → Prüfung →
 * Bauteilrezepte.
 *
 * Eingebaute Rezepte stehen NICHT hier (`REZEPTE`); eine Bibliothek darf sie
 * nicht überschreiben — `rezeptNach` fragt die eingebauten zuerst, und die
 * Prüfung weist eine solche Id ab.
 *
 * `stand` zählt jede Registrierung: wer eine abgeleitete Liste hält (der
 * Werkzeugkatalog), baut sie neu, wenn der Stand wandert.
 */
let _rezepte = new Map();
let _stand = 0;

/** Den Satz ERSETZEN (nicht ergänzen): ein Projektwechsel darf keine Rezepte des vorigen behalten. */
export function setzeRegistrierte(aufgeloeste) {
    _rezepte = new Map((aufgeloeste ?? []).map(r => [r.id, r]));
    _stand += 1;
    return _stand;
}

export function registriertNach(id) {
    return _rezepte.get(String(id ?? '')) ?? null;
}

export function registrierte() {
    return [..._rezepte.values()];
}

export function registerStand() {
    return _stand;
}
