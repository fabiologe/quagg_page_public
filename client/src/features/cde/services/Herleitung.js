/**
 * Herleitung — woher die CDE weiß, was an einem Bauteil geht (Stufe 9.4b).
 *
 * DIE FRAGE, DIE DIESE DATEI BEANTWORTET: „Da liegt ein `IFCElementXYZ` — woher
 * weiß das Programm, was ich damit tun kann?" Sie ist zweimal mündlich erklärt
 * worden und zweimal nicht angekommen, und das hatte einen handfesten Grund:
 * **die Kette war nirgends zu sehen.** Der Katalog enthielt nur Bearbeitungen
 * mit `bauform: '*'`, also zeigten ein Rohr und ein Schacht exakt dieselben
 * zwei Einträge. Ein Mechanismus, der nichts unterscheidet, lässt sich nicht
 * beobachten — und was man nicht beobachten kann, glaubt man zu Recht nicht.
 *
 * Hier wird die Kette ein DATENSATZ. Die Toolbox zeigt ihn an; ein Test prüft
 * ihn; und beim nächsten unbekannten Typ steht schwarz auf weiß, an welcher
 * Stelle sie gerissen ist.
 *
 * DREI QUELLEN, DREI FRAGEN — mehr gibt es nicht:
 *
 *   1. WELCHE FORM?      → Bauform. Acht Stück, geschlossene Liste, weil es
 *                          keine neunte Art gibt, wie Geometrie im Raum
 *                          existieren kann. Liefert Operationen auf der Form
 *                          (ziehen, Bezugshöhe, teilen).
 *   2. WIE HEISSEN DIE   → Typprofil-ROLLEN. Beliebig viele, reine DATEN, und
 *      GRÖSSEN?            sie erben die IFC-Hierarchie aufwärts. Liefert
 *                          Operationen auf Parametern.
 *   3. WAS GILT IMMER?   → `bauform: '*'`. Merkmale, ohne jede Geometrie.
 *
 * Und daraus folgt die Antwort auf „wie baut man das skalierbar ein":
 *
 *   neuer Typ erbt von einem mit Profil     → NICHTS. Sofort bedienbar.
 *   neuer Typ, Form ableitbar               → NICHTS. Der Rückfall ordnet ein.
 *   neuer Typ, eigenes Vokabular            → EIN Typprofil. Daten auf der
 *                                             Büro-Ebene, keine Auslieferung.
 *   wirklich neue Bauform                   → Programmänderung, und das ist ~nie.
 *
 * Rein: kein Vue, kein WebGL, keine Engine. Alles kommt herein.
 */

import { BAUFORMEN } from './bauform/Bauformen.js';
import { imWoerterbuch, profilHerkunft, vererbungskette } from './bauform/Typprofile.js';
import { BEARBEITUNGEN, GRUPPEN, felderFuer, passende } from './Bearbeitungen.js';

/** Warum eine Bearbeitung angeboten wird — der Text neben der Gruppe. */
export const HERKUNFT_TEXT = Object.freeze({
    immer:     'Gilt für jedes Bauteil — Merkmale brauchen keine Geometrie.',
    bauform:   'Weil das Bauteil diese FORM hat.',
    rolle:     'Weil das Typprofil diese Größe kennt.',
});

/**
 * Warum eine Bearbeitung NICHT angeboten wird.
 *
 * Getrennt geführt und angezeigt, weil „steht nicht in der Liste" die
 * schlechteste Rückmeldung ist: der Nutzer weiß nicht, ob das Werkzeug fehlt,
 * ob sein Modell zu schlecht ist oder ob er etwas falsch macht.
 */
export function warumNicht(bearbeitung, { bauform, guete, typprofil }) {
    if (bearbeitung.brauchtRolle && !typprofil?.felder?.[bearbeitung.brauchtRolle]) {
        return `Der Typ kennt keine „${bearbeitung.brauchtRolle}" — ein Typprofil würde sie ergänzen`;
    }
    const erlaubt = bearbeitung.bauform === '*' ? null
        : (Array.isArray(bearbeitung.bauform) ? bearbeitung.bauform : [bearbeitung.bauform]);
    if (erlaubt && !erlaubt.includes(bauform)) {
        return `Nur für ${erlaubt.join(' oder ')} — hier ist es ${bauform ?? 'nichts Bestimmtes'}`;
    }
    if (!_guetegenuegt(guete, bearbeitung.mindestGuete)) {
        return `Braucht mindestens Güte „${bearbeitung.mindestGuete}", vorhanden ist „${guete}"`;
    }
    if (GRUPPEN[bearbeitung.gruppe]?.einstieg === 'werkzeug') {
        return 'Erzeugen hat kein Subjekt — steht in der Werkzeugleiste';
    }
    return 'Passt hier nicht';
}

/** Rangfolge der Güte — dieselbe wie in Bauformen.js, hier nur lesend. */
const RANG = { unbekannt: 0, geschaetzt: 1, gemessen: 2 };
function _guetegenuegt(ist, mindestens) {
    return (RANG[ist] ?? 0) >= (RANG[mindestens ?? 'unbekannt'] ?? 0);
}

/** Woraus wird diese Bearbeitung angeboten? */
function _herkunft(b) {
    if (b.brauchtRolle) return 'rolle';
    if (b.bauform !== '*') return 'bauform';
    return 'immer';
}

/**
 * Die vollständige Herleitung für ein Bauteil.
 *
 * @param {object} opts
 * @param {{category?, type?, globalId?}} opts.el
 * @param {{bauform, guete, quelle, warnungen, regel?}} opts.einordnung
 * @param {object} opts.profilSatz  wirksamer Typprofil-Satz (Projekt>Büro>eingebaut)
 * @param {Array} [opts.katalog]    für Tests
 * @returns {object} siehe unten — bewusst flach und ohne Vue-Bezug
 */
export function herleite({ el, einordnung, profilSatz, katalog = BEARBEITUNGEN } = {}) {
    const kategorie = String(el?.category ?? el?.type ?? '').toUpperCase().trim();
    const kette = vererbungskette(kategorie);
    const { profil, ausTyp, ueberVererbung } = profilHerkunft(kategorie, profilSatz);

    const bauform = einordnung?.bauform ?? null;
    const guete = einordnung?.guete ?? 'unbekannt';
    const moeglich = passende(einordnung, { typprofil: profil, katalog });

    // Gruppiert nach HERKUNFT, nicht nach Werkzeugart: die Frage lautet
    // „warum steht das hier?", und darauf antwortet die Herkunft.
    const gruppen = ['immer', 'bauform', 'rolle'].map(art => ({
        art,
        titel: art === 'immer' ? 'Immer möglich'
             : art === 'bauform' ? `Weil ${bauform ?? '—'}`
             : 'Weil der Typ die Größe kennt',
        warum: HERKUNFT_TEXT[art],
        eintraege: moeglich
            .filter(b => _herkunft(b) === art)
            .map(b => ({
                id: b.id, titel: b.titel, icon: b.icon, gruppe: b.gruppe,
                nurFestlegung: !!b.nurFestlegung,
                // Die Beschriftung, die DIESER Typ dem Feld gibt — das ist der
                // sichtbare Beweis: „DN" am Rohr, „Profilreihe" am Träger.
                felder: felderFuer(b, profil).map(f => ({
                    name: f.name, label: f.label ?? f.titel ?? f.name, einheit: f.einheit ?? null,
                })),
            })),
    })).filter(g => g.eintraege.length);

    const angeboten = new Set(moeglich.map(b => b.id));
    // Werkzeug-Einstiege stehen NICHT unter „nicht möglich": sie sind nicht
    // gesperrt, sie leben nur woanders (Erzeugen hat kein Subjekt). Sie hier
    // zu listen hiesse, jedem Bauteil zwei falsche Absagen anzuhängen.
    const gesperrt = katalog
        .filter(b => !angeboten.has(b.id) && GRUPPEN[b.gruppe]?.einstieg !== 'werkzeug')
        .map(b => ({ id: b.id, titel: b.titel, icon: b.icon,
                     warum: warumNicht(b, { bauform, guete, typprofil: profil }) }));

    return {
        kategorie: kategorie || null,
        // Ein Typ, den KEIN IFC-Schema kennt, ist etwas anderes als ein Typ
        // ohne Profil: der Exporteur benutzt einen eigenen Namen. Ältere
        // Schemata (IFC4, IFC2x3) führt das Wörterbuch seit 2026-09-11 mit.
        imWoerterbuch: kategorie ? imWoerterbuch(kategorie) : false,
        kette,
        profilAus: ausTyp,
        profilUeberVererbung: ueberVererbung,
        rollen: Object.keys(profil?.felder ?? {}),
        bauform,
        bauformTitel: bauform ? (BAUFORMEN[bauform]?.titel ?? bauform) : null,
        quelle: einordnung?.quelle ?? null,
        regel: einordnung?.regel ?? null,
        // Was die Geometrie GEMESSEN hat — der Grund des Vorschlags, damit
        // die Toolbox ihn zeigen und der Mensch ihn bestätigen kann.
        grund: einordnung?.grund ?? null,
        guete,
        warnungen: einordnung?.warnungen ?? [],
        gruppen,
        gesperrt,
        // Wo die Kette gerissen ist — die eine Angabe, die beim nächsten
        // unbekannten Typ sagt, was zu tun wäre.
        luecke: _luecke({ kategorie, profil, bauform, quelle: einordnung?.quelle, guete }),
    };
}

/**
 * Was fehlt, damit dieses Bauteil bedienbarer wird?
 *
 * Ausdrücklich keine Fehlermeldung, sondern eine Handlungsanweisung. Der Fall
 * „unbekannter Typ" ist der Normalfall in IFC, nicht die Ausnahme — und die
 * richtige Reaktion ist fast nie eine Programmänderung.
 */
function _luecke({ kategorie, profil, bauform, quelle, guete = 'unbekannt' }) {
    if (!kategorie) return null;
    if (!imWoerterbuch(kategorie)) {
        return { stufe: 'schema', text: `„${kategorie}" steht in keinem IFC-Schema (IFC2x3, IFC4, IFC4.3 ADD2), `
            + 'auch nicht unter einem Altnamen — der Exporteur benutzt einen eigenen Namen. '
            + 'Die Vererbung greift hier nicht — ein Typprofil unter genau diesem Namen wirkt trotzdem.' };
    }
    if (!profil && bauform === 'netz') {
        return { stufe: 'form', text: `Für „${kategorie}" gibt es kein Typprofil, und aus der Geometrie `
            + 'liess sich keine Form ableiten. Ein Typprofil auf der Büro-Ebene löst beides — es ist ein Datensatz, keine Programmänderung. '
            + 'Für dieses eine Bauteil genügt „Bauform auslegen".' };
    }
    // Nur ein GESCHÄTZTER Vorschlag will bestätigt werden — ein geschlossener
    // Körper aus der Geometrie ist gemessen, da gibt es nichts zu bestätigen.
    if (!profil && quelle === 'geometrie' && guete === 'geschaetzt') {
        return { stufe: 'vorschlag', text: `Die Form ist aus der Geometrie GESCHÄTZT (${bauform}). Stimmt sie, `
            + 'einmal bestätigen — dann gilt sie als Auslegung, und für alle gleichen Bauteile als Regel im Panel „Bauformen".' };
    }
    if (!profil) {
        return { stufe: 'vokabular', text: `Die Form steht (${bauform}, aus ${quelle}), aber „${kategorie}" hat kein `
            + 'Typprofil — deshalb fehlen die typeigenen Größen. Ein Typprofil auf der Büro-Ebene ergänzt sie, ohne neue Programmfassung.' };
    }
    return null;
}
