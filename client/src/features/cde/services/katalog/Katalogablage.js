/**
 * DER EINE SCHREIBWEG FÜR KATALOGDATEN (Teil XXV, V8).
 *
 * Vorlagen, Rezepte, Typprofile, Bauformregeln und das Regelwerk werden aus
 * der Oberfläche geändert — und jede Art tat das bisher für sich: Ziel
 * wählen, Schlüssel lesen, Liste umbauen, schreiben. Sechs Stellen in zwei
 * Dateien, sechs eigene Fehlerbehandlungen, und keine davon hinterlässt eine
 * Spur: Katalogdaten haben keinen Verlauf und kein Rückgängig (Fabios E4
 * nennt dafür einen EIGENEN Verlauf, getrennt vom Modelljournal; Auditbefund
 * F7 steht seit dem Abgleich).
 *
 * Diese Etappe baut den Verlauf NICHT. Sie legt die Stelle an, an der er
 * später ansetzt: ab hier geht jede Katalogänderung durch `katalogSchreibe`,
 * und wer ihn baut, braucht genau eine Naht statt sechs.
 *
 * Die Art sagt, wo ihre Daten liegen und welche Gestalt sie haben:
 *
 *   liste   eine Liste von Einträgen mit `id` (Vorlagen, Rezepte, Regeln)
 *   karte   ein Objekt Schlüssel → Wert (Typprofile je IFC-Kategorie)
 *
 * Die EBENE ist Projekt oder Büro; das Büro ist nicht überall verbunden, und
 * das ist kein Fehler, sondern eine Auskunft.
 *
 * Rein: kein Vue, kein Store. Nie werfen — der Aufrufer zeigt den Grund.
 */
import { REPO_KEY as TYPPROFIL_KEY } from '../bauform/Typprofile.js';
import { REPO_KEY as BAUFORMREGEL_KEY } from '../bauform/Bauformregeln.js';

/**
 * Der Schlüssel der Bibliothek steht HIER, nicht in `Bibliothek.js`.
 *
 * Andersherum entstünde ein Importkreis: die Bibliothek schreibt über diese
 * Ablage, und die Ablage hätte ihren Schlüssel von der Bibliothek geholt. Im
 * Browser brach das beim Laden ab („Cannot access 'VORLAGEN_KEY' before
 * initialization") — gefunden in der Browserprobe zu V9, von keinem Test.
 * `Bibliothek.js` reicht ihn unter seinem alten Namen weiter.
 */
export const VORLAGEN_KEY = 'bauteil-vorlagen';

/** Wo eine Katalogart liegt und wie sie aussieht. */
export const KATALOG_ARTEN = Object.freeze({
    vorlage:      { schluessel: VORLAGEN_KEY,     form: 'liste' },
    rezept:       { schluessel: 'bauteil-rezepte', form: 'liste' },
    typprofil:    { schluessel: TYPPROFIL_KEY,    form: 'karte' },
    bauformregel: { schluessel: BAUFORMREGEL_KEY, form: 'liste' },
    regel:        { schluessel: 'regelwerk',      form: 'liste' },
});

/**
 * Eine Katalogänderung schreiben.
 *
 * @param {string} art            Schlüssel aus `KATALOG_ARTEN`
 * @param {object} ziel           die Ablage (Projekt- oder Büro-Repo)
 * @param {function} aendere      `(bisher) => neu` — `null` heisst „nichts zu tun"
 * @param {object} [o]
 * @param {'projekt'|'buero'} [o.ebene]  nur für die Meldung, wenn die Ablage fehlt
 * @returns {Promise<{ok: boolean, grund: string|null, geaendert: boolean, vorher?, nachher?}>}
 *          `vorher`/`nachher` sind der Stand der Art — das, was ein künftiger
 *          Katalogverlauf aufzeichnen würde.
 */
export async function katalogSchreibe(art, ziel, aendere, { ebene = 'projekt' } = {}) {
    const a = KATALOG_ARTEN[art];
    if (!a) return { ok: false, grund: `Katalogart „${art}" gibt es nicht.`, geaendert: false };
    // Die Meldung nennt die EBENE — „nicht verbunden" allein sagt dem Nutzer
    // nicht, woran es liegt, und das Büro ist der übliche Fall.
    if (!ziel?.set) {
        return { ok: false, geaendert: false,
                 grund: ebene === 'buero' ? 'Die Büroablage ist hier nicht verbunden.'
                                          : 'Die Projektablage ist hier nicht verbunden.' };
    }
    // LESEN IST FREIWILLIG: wer den neuen Stand schon hat (die Bauformregeln
    // führt der Store selbst), braucht den alten nicht. Dann ist `vorher`
    // unbekannt — ein künftiger Katalogverlauf hält für diese Art fest, was
    // geschrieben wurde, nicht die Differenz.
    let bisher = null;
    if (typeof ziel.get === 'function') {
        try { bisher = (await ziel.get(a.schluessel)) ?? null; }
        catch (fehler) { return { ok: false, grund: `Lesen fehlgeschlagen: ${fehler?.message ?? fehler}`, geaendert: false }; }
    }
    const vorher = bisher ?? (a.form === 'karte' ? {} : []);
    let nachher;
    try { nachher = aendere(vorher); }
    catch (fehler) { return { ok: false, grund: `${fehler?.message ?? fehler}`, geaendert: false }; }
    // `null` heisst: der Aufrufer hat nichts gefunden, was sich ändern liesse.
    if (nachher === null || nachher === undefined) return { ok: true, grund: null, geaendert: false, vorher, nachher: vorher };
    let geschrieben;
    try { geschrieben = await ziel.set(a.schluessel, JSON.parse(JSON.stringify(nachher))); }
    catch (fehler) { return { ok: false, grund: `Sichern fehlgeschlagen: ${fehler?.message ?? fehler}`, geaendert: false }; }
    return geschrieben === false
        ? { ok: false, grund: 'Sichern fehlgeschlagen.', geaendert: false }
        : { ok: true, grund: null, geaendert: true, vorher, nachher };
}

/** Die Ablage der Ebene — das Büro ist nicht überall verbunden. */
export function ablageFuer(repo, ebene = 'projekt') {
    return ebene === 'buero' ? (repo?.buero ?? null) : (repo ?? null);
}
