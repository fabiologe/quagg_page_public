/**
 * Typprofile — was am IFC-TYP hängt, ist Vokabular und Grenzen, kein Verhalten.
 *
 * Ein Rohr nennt seine Querschnittsgröße „DN" und darf nicht negativ sein; ein
 * Träger nennt sie „Profilreihe" und wählt aus einer Liste. Das ist ein
 * Datensatz — keine Verzweigung im Programm. Nur so bleibt das Modul für die
 * unbegrenzte und wachsende Menge der IFC-Typen ausgelegt:
 *
 *   neuer Typ, passt in eine Bauform     → nichts zu tun, sofort bedienbar
 *   neuer Typ, eigenes Vokabular         → ein Typprofil (DATEN)
 *   wirklich neue Bauform                → Programmänderung, und das ist ~nie
 *
 * ABLAGE über `repo.mitVorrang` (Stufe 6): **Projekt schlägt Büro schlägt
 * eingebauten Satz.** Ein Büro erweitert das System damit für neue Typen, ohne
 * dass eine neue Programmfassung nötig wäre — projektübergreifend.
 *
 * Der eingebaute Satz unten ist bewusst KNAPP. Er deckt, was im Tiefbau täglich
 * vorkommt, und ist kein Versuch, IFC abzubilden — dieser Versuch wäre genau
 * der Fehler, den die Bauform-Schicht vermeidet.
 *
 * Feldbeschreibung:
 *   { bauform, felder: { <rolle>: { label, einheit, typ, min?, max?, quelle? } } }
 * `rolle` ist der Name, unter dem eine Bearbeitung das Feld ANFRAGT
 * (z. B. 'profilGroesse'); `label` ist, wie der Typ es NENNT (z. B. 'DN').
 * `quelle` benennt das Pset-Feld, aus dem der Wert kommt.
 */

import { waehleMitVorrang } from '../RepoFacade.js';

export const REPO_KEY = 'typprofile';

/**
 * Eingebauter Satz. Schlüssel sind IFC-Kategorien in GROSSSCHRIFT ohne
 * Unterfassung (siehe `normalisiereKategorie`).
 */
export const EINGEBAUTE_PROFILE = Object.freeze({
    IFCPIPESEGMENT: {
        bauform: 'achse+profil',
        felder: {
            profilGroesse: {
                label: 'DN', einheit: 'mm', typ: 'zahl', min: 50, max: 4000,
                quelle: 'Pset_PipeSegmentTypeCommon.NominalDiameter',
            },
            sohlhoehe: { label: 'Sohlhöhe', einheit: 'm', typ: 'zahl' },
        },
    },
    IFCDUCTSEGMENT: {
        bauform: 'achse+profil',
        felder: {
            profilGroesse: {
                label: 'Nennweite', einheit: 'mm', typ: 'zahl', min: 50, max: 4000,
                quelle: 'Pset_DuctSegmentTypeCommon.NominalDiameterOrWidth',
            },
        },
    },
    IFCBEAM: {
        bauform: 'achse+profil',
        felder: { profilGroesse: { label: 'Profilreihe', typ: 'text' } },
    },
    IFCMEMBER: {
        bauform: 'achse+profil',
        felder: { profilGroesse: { label: 'Profilreihe', typ: 'text' } },
    },
    IFCKERB: {
        bauform: 'achse+profil',
        felder: { sohlhoehe: { label: 'Oberkante', einheit: 'm', typ: 'zahl' } },
    },
    IFCCABLECARRIERSEGMENT: { bauform: 'achse+profil', felder: {} },

    IFCWALL: {
        bauform: 'flaeche+dicke',
        felder: {
            dicke: {
                label: 'Wandstärke', einheit: 'm', typ: 'zahl', min: 0.02, max: 3,
                quelle: 'Qto_WallBaseQuantities.Width',
            },
        },
    },
    IFCSLAB: {
        bauform: 'flaeche+dicke',
        felder: {
            dicke: {
                label: 'Plattenstärke', einheit: 'm', typ: 'zahl', min: 0.02, max: 3,
                quelle: 'Qto_SlabBaseQuantities.Width',
            },
        },
    },
    IFCPLATE: { bauform: 'flaeche+dicke', felder: {} },
    IFCFOOTING: { bauform: 'flaeche+dicke', felder: {} },
    IFCCOVERING: { bauform: 'flaeche+dicke', felder: {} },

    IFCDISTRIBUTIONCHAMBERELEMENT: {
        bauform: 'koerper',
        felder: { sohlhoehe: { label: 'Sohlhöhe', einheit: 'm', typ: 'zahl' } },
    },
    IFCPUMP: { bauform: 'koerper', felder: {} },
    IFCVALVE: { bauform: 'koerper', felder: {} },
    IFCTANK: { bauform: 'koerper', felder: {} },

    IFCGEOGRAPHICELEMENT: { bauform: 'hoehenfeld', felder: {} },
    IFCEARTHWORKSELEMENT: { bauform: 'hoehenfeld', felder: {} },
    IFCEARTHWORKSFILL: { bauform: 'hoehenfeld', felder: {} },
    IFCEARTHWORKSCUT: { bauform: 'hoehenfeld', felder: {} },
});

/**
 * Kategorie auf den Profilschlüssel normieren.
 *
 * `IFCWALLSTANDARDCASE` ist eine WAND — das Suffix beschreibt, wie sie
 * modelliert ist, nicht was sie ist. Ohne diese Normierung fiele jede
 * Unterfassung durch den Rost und bekäme kein Profil, obwohl eines dasteht.
 * Das ist die Fehlerklasse, wegen der Typ-Strings nicht als Hauptweg taugen —
 * hier ist sie eingegrenzt auf EINE Stelle.
 */
export function normalisiereKategorie(kategorie) {
    if (!kategorie) return '';
    const k = String(kategorie).toUpperCase().trim();
    return k.replace(/(STANDARDCASE|ELEMENTEDCASE)$/, '');
}

/**
 * Profil für eine Kategorie aus einem Satz holen.
 *
 * Erst der genaue Schlüssel, dann der normierte. Kein Treffer → `null`;
 * die Bauform-Ableitung übernimmt dann (siehe Bauformen.js).
 */
export function profilFuer(kategorie, satz = EINGEBAUTE_PROFILE) {
    if (!kategorie || !satz) return null;
    const roh = String(kategorie).toUpperCase().trim();
    if (satz[roh]) return satz[roh];
    const norm = normalisiereKategorie(kategorie);
    return satz[norm] ?? null;
}

/**
 * Den wirksamen Satz laden: Projekt schlägt Büro schlägt eingebaut.
 *
 * Die Sätze werden NICHT tief gemischt. Ein Büro, das `IFCWALL` neu belegt,
 * belegt es ganz — sonst entstünde eine halb eingebaute, halb eigene Wand, und
 * niemand könnte sagen, woher eine Grenze stammt. Gemischt wird nur je
 * Kategorie: eine Kategorie, die der Büro-Satz nicht nennt, kommt weiter aus
 * dem eingebauten.
 */
export async function ladeSatz(repo) {
    if (!repo?.mitVorrang) return { ...EINGEBAUTE_PROFILE };
    let eigene = null;
    try {
        eigene = await repo.mitVorrang(REPO_KEY, null);
    } catch (fehler) {
        console.warn('cde: typprofile laden', fehler?.message ?? fehler);
    }
    if (!eigene || typeof eigene !== 'object') return { ...EINGEBAUTE_PROFILE };

    const satz = { ...EINGEBAUTE_PROFILE };
    for (const [kategorie, profil] of Object.entries(eigene)) {
        if (!profil || typeof profil !== 'object') continue;
        satz[String(kategorie).toUpperCase().trim()] = profil;
    }
    return satz;
}

/**
 * Ein Feld für eine Bearbeitung auflösen.
 *
 * Der Katalogeintrag nennt eine ROLLE (`ausTypprofil: 'profilGroesse'`) und
 * einen Rückfall. Findet sich im Profil ein Feld dieser Rolle, gewinnt dessen
 * Beschriftung, Einheit und Grenze — sonst der Rückfall. So kann derselbe
 * Katalogeintrag am Rohr „DN" heißen und am Träger „Profilreihe", ohne dass
 * eine Verzweigung nach Typ nötig wäre.
 */
export function feldAusProfil(rolle, profil, rueckfall = null) {
    const ausProfil = rolle && profil?.felder ? profil.felder[rolle] : null;
    return waehleMitVorrang(ausProfil, null, rueckfall);
}
