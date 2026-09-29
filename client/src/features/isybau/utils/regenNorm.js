/**
 * Regeln für den Bemessungsregen — EINE Stelle für Modellregen-Fenster,
 * KOSTRA-Fenster, Vorab-Prüfung und Ergebnis/PDF.
 *
 * DWA-A 118 (Januar 2024), Abschn. 5.5.1: „Einzelmodellregen eignen sich für
 * kleinere bis mittlere Einzugsgebiete. Die Regendauer sollte der doppelten
 * Fließzeit im Einzugsgebiet entsprechen, mindestens aber 60 min betragen.“
 * (Fahrplan „Grenzen beheben“, Stufe 2; doc/GrenzenEvaluierung.md B3.)
 */

export const MIN_REGENDAUER_MIN = 60;

/** Wiederkehrzeiten der KOSTRA-Spalten (RN_*); kurz für Tabellenköpfe, lang für Texte. */
export const WIEDERKEHRZEITEN = [
    { key: 'RN_001A', jahre: 1 },
    { key: 'RN_002A', jahre: 2 },
    { key: 'RN_003A', jahre: 3 },
    { key: 'RN_005A', jahre: 5 },
    { key: 'RN_010A', jahre: 10 },
    { key: 'RN_020A', jahre: 20 },
    { key: 'RN_030A', jahre: 30 },
    { key: 'RN_050A', jahre: 50 },
    { key: 'RN_100A', jahre: 100 },
].map(w => ({ ...w, kurz: `${w.jahre} a`, lang: w.jahre === 1 ? '1 Jahr' : `${w.jahre} Jahre` }));

export const wiederkehrText = (key) => WIEDERKEHRZEITEN.find(w => w.key === key)?.lang ?? key ?? '';

/**
 * Dauerstufen, die die KOSTRA-Daten wirklich enthalten, aufsteigend, bis `maxMin`.
 * Vorher fest 5 … 120 min — die Daten reichen bis 7 d, und für die „doppelte
 * Fließzeit“ größerer Netze fehlten die längeren Stufen. Nicht-numerische
 * Schlüssel (z. B. „_quelle“ der Fixture) fallen heraus.
 */
export function kostraDauern(kostraDaten, maxMin = 1440) {
    if (!kostraDaten) return [];
    return Object.keys(kostraDaten)
        .map(Number)
        .filter(d => Number.isFinite(d) && d > 0 && d <= maxMin)
        .sort((a, b) => a - b);
}

/** Dauer eines Regens in Minuten: aus den Metadaten, sonst Schritte × Intervall. */
export function regenDauerMin(regen) {
    if (!regen) return null;
    const d = Number(regen.metadata?.duration);
    if (Number.isFinite(d) && d > 0) return d;
    const n = regen.series?.length ?? 0;
    const iv = Number(regen.metadata?.interval) || 5;
    return n > 0 ? n * iv : null;
}

/** Hinweistext, wenn ein Regen kürzer ist als A 118:2024 verlangt; sonst ''. */
export function regenDauerHinweis(dauerMin) {
    if (!(dauerMin > 0) || dauerMin >= MIN_REGENDAUER_MIN) return '';
    return `Regendauer ${dauerMin} min < ${MIN_REGENDAUER_MIN} min — nach DWA-A 118:2024 (5.5.1) kein `
        + `Nachweisregen: mindestens ${MIN_REGENDAUER_MIN} min, besser die doppelte Fließzeit.`;
}

/** Empfohlene Regendauer aus der Fließzeit: max(60, 2·t_f), auf 5 min aufgerundet. */
export const empfohleneRegendauer = (fliesszeitMin) =>
    Math.max(MIN_REGENDAUER_MIN, Math.ceil((2 * (Number(fliesszeitMin) || 0)) / 5) * 5);

/**
 * DWA-A 118 (Januar 2024), Abschn. 6.2.1, Tabelle 4 „Hydraulische Anforderungen an
 * Entwässerungssysteme“: Überstauhäufigkeit „einmal in x Jahren“ (Bestand / Neubau)
 * und Überflutungshäufigkeit je Schutzkategorie (SK). Die Beispiele sind gekürzt.
 */
export const SCHUTZKATEGORIEN = [
    { sk: 1, text: 'gering — z. B. ländliche Gebiete, Grün- und Freiflächen', bestand: 1, neubau: 2, ueberflutung: 10 },
    { sk: 2, text: 'mäßig — z. B. Wohn- und Mischgebiete ohne genutzte Untergeschosse', bestand: 2, neubau: 3, ueberflutung: 20 },
    { sk: 3, text: 'stark — z. B. Stadtzentren, genutzte Untergeschosse, Gewerbe, Tiefgaragen', bestand: 3, neubau: 5, ueberflutung: 30 },
    { sk: 4, text: 'sehr stark — z. B. kritische Infrastruktur', bestand: 5, neubau: 10, ueberflutung: 50 },
];

const bereich = (liste) => (liste.length ? (liste.length === 1 ? `SK ${liste[0]}` : `SK ${liste[0]}–${liste.at(-1)}`) : 'keine SK');

/**
 * Wofür ein gerechneter Einzelmodellregen als Überstaunachweis taugt (A 118:2024,
 * 5.5.1: der Überstau entspricht der Wiederkehrzeit des Regens; 6.2.1 Tab. 4).
 * @param {object} regen  activeModelRain (metadata.returnPeriod, duration)
 * @param {number} ueberstauKnoten  Zahl überstauter Knoten des Laufs
 * @returns {{ text: string, erfuellt: boolean|null } | null}  null = Regen ohne Wiederkehrzeit
 */
export function ueberstauNachweis(regen, ueberstauKnoten) {
    const jahre = WIEDERKEHRZEITEN.find(w => w.key === regen?.metadata?.returnPeriod)?.jahre;
    if (!jahre) return null;
    const dauer = regenDauerMin(regen);
    if (dauer != null && dauer < MIN_REGENDAUER_MIN) {
        return { text: `T = ${jahre} a, aber ${dauer} min < ${MIN_REGENDAUER_MIN} min — kein Nachweisregen`, erfuellt: null };
    }
    const bestand = SCHUTZKATEGORIEN.filter(k => k.bestand <= jahre).map(k => k.sk);
    const neubau = SCHUTZKATEGORIEN.filter(k => k.neubau <= jahre).map(k => k.sk);
    const deckt = `T = ${jahre} a deckt Bestand ${bereich(bestand)}, Neubau ${bereich(neubau)}`;
    if (!(ueberstauKnoten >= 0)) return { text: deckt, erfuellt: null };
    return ueberstauKnoten > 0
        ? { text: `${deckt} — nicht erfüllt: ${ueberstauKnoten} Knoten überstaut`, erfuellt: false }
        : { text: `${deckt} — erfüllt: kein Knoten überstaut`, erfuellt: true };
}
