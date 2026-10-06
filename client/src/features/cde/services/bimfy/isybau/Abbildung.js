/**
 * ISYBAU · Abbildung der Sachdaten auf IFC (Fahrplan Sachdaten P4).
 *
 * Die Sachdaten stehen roh in `ISYBAU_Stammdaten` (P3). Diese Tabelle legt
 * dazu, was IFC selbst kennt:
 *
 *   1. den KLARTEXT eines Schlüssels — `Material = B` bekommt
 *      `Material_Text = Beton` im selben Satz (P‑E3), aus `Schluessel.js`;
 *   2. die bSI-Merkmale, wo ein Feld passt — `Pset_…Common.Reference` und
 *      `.Status` je nach IFC-Klasse.
 *
 * Kein Wert ohne Quelle (P5): ein unbekannter Schlüssel bekommt keinen Text,
 * ein Status ohne Gegenstück kein bSI-Merkmal, und beides steht im Befund.
 * Baujahr hat KEIN Ziel: IFC kennt nur ein Datum (`InstallationDate`), und
 * ein erfundener 1. Januar wäre ein Wert ohne Quelle.
 *
 * Jede Regel hat ein `beispiel`; der Wächter prüft jede (bimfySachdaten.test.js).
 * Rein: Daten hinein, Daten heraus.
 */
import {
    G102_MATERIAL, G105_STATUS, G205_PROFILART, G300_KNOTENTYP, G301_SCHACHTFUNKTION, G302_DECKELFORM,
    G303_DECKELTYP, G304_ABDECKUNGSKLASSE, G305_AUFBAUFORM, G306_STEIGHILFE, G307_MATERIAL_STEIGHILFE,
    G308_UNTERTEILFORM, G309_GERINNEFORM, G310_PUNKTKENNUNG, G400_BAUWERKSTYP,
} from './Schluessel.js';

/** Die Endung des Klartexts neben seinem Schlüssel. */
export const TEXT_ENDUNG = '_Text';

/**
 * Welche Liste ein Feld schlüsselt — nach dem LETZTEN Namen im Pfad, weil
 * dasselbe Feld je Format woanders hängt (`Knoten.Schacht.Abdeckung.…` 2013,
 * `Knoten.Abdeckungen.Deckel.…` 2017).
 */
export const SCHLUESSEL_JE_FELD = Object.freeze({
    Status: G105_STATUS,
    Material: G102_MATERIAL, MaterialAufbau: G102_MATERIAL, MaterialUnterteil: G102_MATERIAL,
    MaterialAbdeckung: G102_MATERIAL, MaterialGerinne: G102_MATERIAL, MaterialUntereSchachtzone: G102_MATERIAL,
    Profilart: G205_PROFILART,
    KnotenTyp: G300_KNOTENTYP,
    SchachtFunktion: G301_SCHACHTFUNKTION,
    Deckelform: G302_DECKELFORM, Deckeltyp: G303_DECKELTYP, Abdeckungsklasse: G304_ABDECKUNGSKLASSE,
    Aufbauform: G305_AUFBAUFORM, Unterteilform: G308_UNTERTEILFORM,
    ArtEinstieghilfe: G306_STEIGHILFE, MaterialSteighilfen: G307_MATERIAL_STEIGHILFE,
    Gerinneform: G309_GERINNEFORM,
    Punktkennung: G310_PUNKTKENNUNG,
    Bauwerkstyp: G400_BAUWERKSTYP,
});

/** Der Common-Satz je IFC-Klasse — nur Klassen, deren Vorlage `Reference` und `Status` kennt. */
export const COMMON_SATZ = Object.freeze({
    IFCDISTRIBUTIONCHAMBERELEMENT: 'Pset_DistributionChamberElementCommon',
    IFCPIPESEGMENT: 'Pset_PipeSegmentTypeCommon',
    IFCPIPEFITTING: 'Pset_PipeFittingTypeCommon',
    IFCWASTETERMINAL: 'Pset_WasteTerminalTypeCommon',
});

/**
 * G105 Status → `Pset_…Common.Status` (DEMOLISH, EXISTING, NEW, TEMPORARY,
 * OTHER, NOTKNOWN, UNSET). Je Zeile ein Grund.
 */
export const STATUS_NACH_BSI = Object.freeze({
    0: Object.freeze({ wert: 'EXISTING', grund: 'vorhanden' }),
    1: Object.freeze({ wert: 'NEW', grund: 'geplant' }),
    2: Object.freeze({ wert: 'OTHER', grund: 'fiktiv — bSI kennt keinen gedachten Bestand' }),
    3: Object.freeze({ wert: 'EXISTING', grund: 'ausser Betrieb, aber noch im Boden' }),
    4: Object.freeze({ wert: 'OTHER', grund: 'verdämmt/verfüllt — weder Bestand im Betrieb noch Abbruch' }),
    5: Object.freeze({ wert: 'OTHER', grund: 'sonstige' }),
    6: Object.freeze({ wert: 'DEMOLISH', grund: 'rückgebaut bzw. zu löschen (AH15 G105)' }),
});

/**
 * Die Regeln, in Reihenfolge. Jede bekommt `(stammdaten, kontext)` mit
 * `kontext.klasse` (IFC-Klasse gross) und gibt `{texte?, merkmale?, befunde?}`.
 */
export const ABBILDUNGSREGELN = Object.freeze([
    Object.freeze({
        id: 'klartext',
        text: 'Jeder Schlüssel bekommt seinen Klartext als `<Pfad>_Text` (Schluessel.js, AH15 A-7.8.2).',
        beispiel: { stammdaten: { 'Kante.Material': 'B' }, erwartet: { texte: { 'Kante.Material_Text': 'Beton' } } },
        regel(sd) {
            const texte = {}, befunde = [];
            for (const [pfad, wert] of Object.entries(sd)) {
                const liste = SCHLUESSEL_JE_FELD[pfad.split('.').at(-1).replace(/\[\d+\]$/, '')];
                if (!liste) continue;
                const text = liste[wert] ?? liste[String(wert).toUpperCase()];
                if (text) texte[`${pfad}${TEXT_ENDUNG}`] = text;
                else befunde.push({ regel: 'klartext-unbekannt', text: `${pfad} = „${wert}" steht in keiner Schlüsselliste — ohne Klartext` });
            }
            return { texte, befunde };
        },
    }),
    Object.freeze({
        id: 'reference',
        text: 'Objektbezeichnung → Pset_…Common.Reference.',
        beispiel: { stammdaten: { Objektbezeichnung: 'S1' }, kontext: { klasse: 'IFCDISTRIBUTIONCHAMBERELEMENT' },
                    erwartet: { merkmale: { Pset_DistributionChamberElementCommon: { Reference: 'S1' } } } },
        regel(sd, { klasse }) {
            const satz = COMMON_SATZ[klasse];
            return satz && sd.Objektbezeichnung ? { merkmale: { [satz]: { Reference: sd.Objektbezeichnung } } } : {};
        },
    }),
    Object.freeze({
        id: 'status',
        text: 'Status (G105) → Pset_…Common.Status nach STATUS_NACH_BSI.',
        beispiel: { stammdaten: { Status: '6' }, kontext: { klasse: 'IFCPIPESEGMENT' },
                    erwartet: { merkmale: { Pset_PipeSegmentTypeCommon: { Status: 'DEMOLISH' } } } },
        regel(sd, { klasse }) {
            const satz = COMMON_SATZ[klasse];
            if (!satz || sd.Status === undefined) return {};
            const z = STATUS_NACH_BSI[sd.Status];
            if (!z) return { befunde: [{ regel: 'status-unbekannt', text: `Status „${sd.Status}" steht nicht in G105 — kein Pset-Status` }] };
            return { merkmale: { [satz]: { Status: z.wert } } };
        },
    }),
]);

/**
 * Alle Regeln auf die Sachdaten eines Trägers.
 * @param {Record<string,string>} stammdaten
 * @param {{klasse?: string}} [kontext]
 * @returns {{texte: Record<string,string>, merkmale: Record<string,object>, befunde: object[]}}
 */
export function bildeAb(stammdaten, kontext = {}) {
    const aus = { texte: {}, merkmale: {}, befunde: [] };
    if (!stammdaten || typeof stammdaten !== 'object') return aus;
    const k = { klasse: String(kontext.klasse ?? '').toUpperCase() };
    for (const r of ABBILDUNGSREGELN) {
        const e = r.regel(stammdaten, k) ?? {};
        Object.assign(aus.texte, e.texte ?? {});
        for (const [satz, werte] of Object.entries(e.merkmale ?? {})) aus.merkmale[satz] = { ...(aus.merkmale[satz] ?? {}), ...werte };
        aus.befunde.push(...(e.befunde ?? []));
    }
    return aus;
}
