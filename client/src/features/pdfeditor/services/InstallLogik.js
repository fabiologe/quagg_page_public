/**
 * InstallLogik — Entscheidungslogik des „Als App installieren"-Hinweises.
 *
 * Pur gehalten (Fenster/UA/Uhr injizierbar): Der Hinweis erscheint nie in
 * der installierten App, nie auf Plattformen ohne Install-Weg, und nach
 * einem Wegklicken erst nach 14 Tagen wieder. Die eigentliche Installation
 * macht der BROWSER (beforeinstallprompt.prompt()) — bewusst kein
 * Installer-Download: unsignierte .exe/.dmg/.apk lösen SmartScreen/
 * Gatekeeper/Sideload-Warnungen aus, der Browser-Install nicht.
 */

export const INSTALL_RUHE_MS = 14 * 24 * 3600 * 1000;

/** Läuft die App bereits installiert (eigenes Fenster)? */
export function istInstalliert(win = globalThis.window) {
    if (!win) return false;
    return win.matchMedia?.('(display-mode: standalone)')?.matches === true
        || win.navigator?.standalone === true;   // iOS-Safari-Sonderweg
}

/**
 * Grobe Plattform-Weiche für den Hinweistext.
 * @returns {'android'|'chromium'|'safari-ios'|'safari-mac'|'sonstig'}
 *   android    → Install-Knopf (Chrome) UND/ODER APK-Download — gilt für
 *                JEDEN Android-Browser: Firefox & Co. haben kein
 *                beforeinstallprompt, die APK ist dort der einzige Weg.
 *   chromium   → echter Install-Knopf (beforeinstallprompt), Desktop
 *   safari-*   → Anleitung (Teilen → Home-Bildschirm / Dock)
 *   sonstig    → kein Hinweis (z. B. Desktop-Firefox: kein PWA-Install)
 */
export function plattform(ua = navigator.userAgent, maxTouchPoints = navigator.maxTouchPoints ?? 0) {
    if (/Android/.test(ua)) return 'android';
    if (/iPhone|iPad|iPod/.test(ua)) return 'safari-ios';
    // iPadOS tarnt sich als Macintosh — der Touchscreen verrät es.
    if (/Macintosh/.test(ua) && maxTouchPoints > 1) return 'safari-ios';
    if (/Edg\/|Chrome\//.test(ua)) return 'chromium';
    if (/Macintosh/.test(ua) && /Safari\//.test(ua)) return 'safari-mac';
    return 'sonstig';
}

/**
 * Soll der sanfte Hinweis (nach der Anlaufzeit) gezeigt werden?
 * @param {{installiert: boolean, plattformName: string,
 *          abgelehntUm: number|null, jetzt: number}} lage
 */
export function sollteHinweisZeigen({ installiert, plattformName, abgelehntUm, jetzt }) {
    if (installiert) return false;
    if (plattformName === 'sonstig') return false;
    if (abgelehntUm && jetzt - abgelehntUm < INSTALL_RUHE_MS) return false;
    return true;
}
