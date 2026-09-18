/**
 * Typprofil-ENTWÜRFE aus den bSI-Vorlagen (Teil XXIII, A5; Befund S6).
 *
 * Die Pset-/Qto-Vorlagen von buildingSMART stehen seit dem Wörterbuch im
 * Client (`data/pset-templates.js`, ERZEUGT). Eine kleine Tabelle legt die
 * Merkmale, die ein Werkzeug versteht, auf ihre ROLLE: `NominalDiameter` ist
 * eine Nennweite, `NominalThickness` eine Dicke. Für eine Klasse, deren
 * geltendes Typprofil eine solche Rolle NICHT kennt, entsteht so ein Entwurf —
 * mit Quelle je Feld. Erst das Bestätigen macht ihn zum Typprofil (Store:
 * `entwurfUebernehmen`); vorher wirkt er nicht.
 *
 * Abgeleitet, NICHT als zweite erzeugte Datei geschrieben: die Vorlagen sind
 * die eine Quelle, die Rollentabelle ist Client-Wissen (Rollen gibt es nur
 * hier). Eine Datei `typprofil-entwuerfe.js` daneben wäre eine Kopie, die
 * `--pruefe` zusätzlich hüten müsste.
 */
import { getPsetsForType } from '../../data/pset-templates.js';
import { ENTITY_META } from '../../data/entity-schema.js';
import { profilFuer } from './Typprofile.js';

/** Welches bSI-Merkmal welche Rolle trägt — klein und wachsend; nur Rollen, die ein Werkzeug fragt. */
export const ROLLEN_AUS_MERKMAL = Object.freeze({
    NominalDiameter:  { rolle: 'profilGroesse', label: 'Nennweite', einheit: 'mm', typ: 'zahl' },
    NominalThickness: { rolle: 'dicke', label: 'Dicke', einheit: 'm', typ: 'zahl' },
    Thickness:        { rolle: 'dicke', label: 'Dicke', einheit: 'm', typ: 'zahl' },
});

/**
 * Der Entwurf für eine Klasse — oder null, wenn die Vorlagen nichts beitragen,
 * was das geltende Profil nicht schon kennt.
 * @returns {{kategorie, status: 'entwurf', bauform, felder: object, warum: string} | null}
 */
export function entwurfFuer(kategorie, satz) {
    const kat = String(kategorie ?? '').toUpperCase().trim();
    // Nur BAUTEILE: ein Typobjekt (`IfcPipeSegmentType`) wählt niemand aus, und
    // sein Typprofil fragte nie ein Werkzeug.
    if (!ENTITY_META[kat]?.hierarchy?.includes('IfcProduct')) return null;
    const gilt = profilFuer(kat, satz);
    const vorhanden = new Set(Object.keys(gilt?.felder ?? {}));
    const felder = {};
    for (const [psetName, tpl] of getPsetsForType(kat)) {
        for (const prop of tpl.props ?? []) {
            const z = ROLLEN_AUS_MERKMAL[prop.name];
            if (!z || vorhanden.has(z.rolle) || felder[z.rolle]) continue;
            felder[z.rolle] = { label: z.label, einheit: z.einheit, typ: z.typ, quelle: `${psetName}.${prop.name}` };
        }
    }
    if (!Object.keys(felder).length) return null;
    return { kategorie: kat, status: 'entwurf', bauform: gilt?.bauform ?? null, felder,
             warum: 'Entwurf aus den bSI-Vorlagen' };
}

/**
 * Das Typprofil, das beim Bestätigen gespeichert wird: das geltende (auch ein
 * geerbtes — sonst verlöre die Klasse mit dem eigenen Profil die Rollen ihrer
 * Familie) plus die Felder des Entwurfs.
 */
export function profilAusEntwurf(entwurf, satz) {
    if (!entwurf) return null;
    const gilt = profilFuer(entwurf.kategorie, satz) ?? {};
    return {
        bauform: entwurf.bauform,
        ...(gilt.netzrolle ? { netzrolle: gilt.netzrolle } : {}),
        warum: 'bestätigter Entwurf aus den bSI-Vorlagen',
        felder: { ...(gilt.felder ?? {}), ...entwurf.felder },
    };
}
