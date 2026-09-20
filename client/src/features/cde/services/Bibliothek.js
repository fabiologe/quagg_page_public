/**
 * Die Bauteilbibliothek (Lücke ⑨ / Stufe 9.8, 2026-09-02).
 *
 * Fabios Wunsch aus dem allerersten Fahrplan: „Büro-Vorlagen, Bauteile und
 * Typen". Ein Bibliothekseintrag ist KEIN neues Ding, sondern die Summe von
 * dreien, die schon stehen — Rezept (Code, kurze geschlossene Liste im
 * Feature), Kategorie (Feld mit Vorgabe) und Parameter-Vorbelegung:
 *
 *   { id, name: 'Schacht DN 1000', rezept: 'schacht', vorgaben: { dn: 1000 } }
 *
 * LANDMINE aus 9.8, hier eingebaut statt nur notiert: Ein Rezept ist Code,
 * ein Bibliothekseintrag sind DATEN. Der Eintrag nennt das Rezept BEIM
 * NAMEN — `pruefeVorlage` weist alles ab, was kein bekanntes Rezept nennt
 * oder Nicht-Daten in den Vorgaben trägt. Sonst läge ausführbarer Code in
 * der RepoFacade.
 *
 * ABLAGE mit Vorrang, aber als VEREINIGUNG je Id: Projekt schlägt Büro
 * schlägt eingebauten Satz — dieselbe Regel wie bei den Typprofilen, nur
 * dass hier je EINTRAG entschieden wird, nicht je ganze Liste (die
 * `ladeSatz`-Landmine: ein Bürosatz mit einer Vorlage löschte sonst alle
 * eingebauten).
 */
import { rezeptNach } from './Bauteilrezepte.js';
import { pruefeEintrag } from './katalog/Katalogschema.js';
import { VORLAGEN_KEY, ablageFuer, katalogSchreibe } from './katalog/Katalogablage.js';

/** Der Schlüssel der Bibliothek — er wohnt in der Ablage (V8/V9, kein Importkreis). */
export const REPO_KEY = VORLAGEN_KEY;

/** Der eingebaute Satz — die gängigen Kanalbauteile. Büro und Projekt erweitern. */
export const EINGEBAUTE_VORLAGEN = Object.freeze([
    { id: 'rohr-dn300', name: 'Rohr DN 300', rezept: 'rohr',
      vorgaben: { dn: 300, kategorie: 'IFCPIPESEGMENT' } },
    { id: 'rohr-dn500', name: 'Rohr DN 500', rezept: 'rohr',
      vorgaben: { dn: 500, kategorie: 'IFCPIPESEGMENT' } },
    { id: 'schacht-dn1000', name: 'Schacht DN 1000', rezept: 'schacht',
      vorgaben: { dn: 1000, kategorie: 'IFCDISTRIBUTIONCHAMBERELEMENT' } },
    { id: 'trasse', name: 'Trasse (Alignment)', rezept: 'linie',
      vorgaben: { kategorie: 'IFCALIGNMENT' } },
]);

/**
 * Nur DATEN dürfen hinein — und das Rezept muss es wirklich geben. Seit A5
 * prüft das EINE Katalogschema; hier bleibt die alte Antwortform `{ok, grund}`.
 */
export function pruefeVorlage(vorlage) {
    const { ok, fehler } = pruefeEintrag('vorlage', vorlage);
    return { ok, grund: ok ? null : fehler[0] };
}

function _gueltige(liste) {
    return (Array.isArray(liste) ? liste : [])
        .filter(v => pruefeVorlage(v).ok && v.id);
}

/**
 * Alle Vorlagen, VEREINIGT je Id: Projekt schlägt Büro schlägt eingebaut.
 * Herkunft steht an jedem Eintrag — die Anzeige darf Eingebautes nicht
 * löschen lassen, und beim Sichern muss klar sein, wohin.
 */
export async function ladeVorlagen(repo) {
    const [projekt, buero] = await Promise.all([
        repo?.get?.(REPO_KEY) ?? null,
        repo?.buero?.get?.(REPO_KEY) ?? null,
    ]);
    const karte = new Map();
    for (const v of EINGEBAUTE_VORLAGEN) karte.set(v.id, { ...v, herkunft: 'eingebaut' });
    for (const v of _gueltige(buero)) karte.set(v.id, { ...v, herkunft: 'buero' });
    for (const v of _gueltige(projekt)) karte.set(v.id, { ...v, herkunft: 'projekt' });
    return [...karte.values()];
}

/**
 * Eine Vorlage sichern — auf der Projekt- oder der Büro-Ebene.
 * @returns {{ok, grund}} — nie werfen: der Aufrufer zeigt den Grund an.
 */
export async function speichereVorlage(repo, vorlage, { ebene = 'projekt' } = {}) {
    const pruefung = pruefeVorlage(vorlage);
    if (!pruefung.ok) return pruefung;
    const id = vorlage.id || `v-${Date.now().toString(36)}`;
    // Durch den EINEN Schreibweg (Teil XXV, V8) — dort setzt der
    // Katalogverlauf später an (E4).
    const r = await katalogSchreibe('vorlage', ablageFuer(repo, ebene),
        (bisher) => [..._gueltige(bisher).filter(v => v.id !== id), { ...vorlage, id }], { ebene });
    return r.ok ? { ok: true, grund: null, id } : { ok: false, grund: r.grund };
}

/** Eine selbst angelegte Vorlage entfernen — Eingebautes bleibt. */
export async function loescheVorlage(repo, id, { ebene = 'projekt' } = {}) {
    const r = await katalogSchreibe('vorlage', ablageFuer(repo, ebene), (bisher) => {
        const liste = _gueltige(bisher);
        return liste.some(v => v.id === id) ? liste.filter(v => v.id !== id) : null;
    }, { ebene });
    return r.ok && r.geaendert;
}

/**
 * WOHER EIN BAUTEIL STAMMT — und wie weit es davon abweicht (Teil XXIII, A1).
 *
 * Bis hierher wurden die Vorgaben einer Vorlage in die Parameter KOPIERT, und
 * damit war die Herkunft weg: niemand wusste danach, dass dieser Schacht ein
 * „Schacht DN 1000" war, keine geänderte Vorlage liess sich nachziehen, keine
 * Abweichung zeigen. Das war der einzige Befund des Architektur-Audits ohne
 * Rückweg — jede so entstandene Instanz blieb für immer vorlagenlos.
 *
 * Jetzt trägt die Instanz `parameter.vorlage` (die Id). Sie darf frei von der
 * Vorlage abweichen, der Bezug bleibt — dasselbe Muster wie die eigene
 * Sohlbreite neben der Norm (`Grabenregeln.grabenbreite`, `eigene`).
 *
 * Verglichen werden nur Felder, die das Rezept kennt: eine Vorgabe, die kein
 * Rezeptfeld ist, landet beim Zeichnen gar nicht im Bauplan und wäre sonst
 * eine Abweichung, die es nicht gibt. Die Kategorie zählt mit — sie ist der
 * IFC-Typ, den eine Vorlage festlegen darf.
 *
 * @param {object|null} bauplan     `{rezept, kategorie, parameter}`
 * @param {Array} vorlagen          aus `ladeVorlagen`
 * @returns {null | {id, name, herkunft, fehlt, abweichend: Array<{feld, soll, ist}>}}
 *          null = das Bauteil stammt aus keiner Vorlage
 */
export function vorlagenbezugVon(bauplan, vorlagen = []) {
    const id = bauplan?.parameter?.vorlage;
    if (id === undefined || id === null || id === '') return null;
    const v = (vorlagen ?? []).find(x => x?.id === id && x?.rezept === bauplan.rezept);
    if (!v) return { id: String(id), name: null, herkunft: null, fehlt: true, abweichend: [] };
    const felder = new Set((rezeptNach(bauplan.rezept)?.felder ?? []).map(f => f.name));
    const abweichend = [];
    for (const [feld, soll] of Object.entries(v.vorgaben ?? {})) {
        if (feld === 'name' || feld === 'vorlage') continue;
        if (feld === 'kategorie') {
            const ist = String(bauplan.kategorie ?? '').toUpperCase();
            if (String(soll).toUpperCase() !== ist) abweichend.push({ feld, soll: String(soll).toUpperCase(), ist });
            continue;
        }
        if (felder.size && !felder.has(feld)) continue;
        const ist = bauplan.parameter?.[feld];
        if (!_gleicherWert(ist, soll)) abweichend.push({ feld, soll, ist: ist ?? null });
    }
    return { id: v.id, name: v.name, herkunft: v.herkunft ?? null, fehlt: false, abweichend };
}

/** „1000" und 1000 sind dasselbe Mass — das Formular liefert mal Text, mal Zahl. */
function _gleicherWert(a, b) {
    const na = Number(a), nb = Number(b);
    if (a !== '' && b !== '' && a !== null && b !== null && Number.isFinite(na) && Number.isFinite(nb)) {
        return Math.abs(na - nb) < 1e-9;
    }
    return String(a ?? '') === String(b ?? '');
}


// ── Rezepte aus der Bibliothek (Teil XXIII, A5) ─────────────────────────────
//
// Die zweite Eintragsart: ein REZEPT als Deklaration (dieselbe Form wie die
// eingebauten in `rezept/Eingebaut.js`). EIGENER Schlüssel, nicht in der
// Vorlagenliste: ein älterer Tab, der eine Vorlage sichert, filtert seine
// Liste mit `pruefeVorlage` und schreibt sie ZURÜCK — ein Rezept darin
// fiele dabei still heraus (Leitplanke 4 des Umbaus).

export const REZEPTE_KEY = 'bauteil-rezepte';

/**
 * Alle Rezept-Deklarationen, VEREINIGT je Id: Projekt schlägt Büro. Was die
 * Prüfung nicht besteht, steht in `befunde` (mit Ebene und Grund) und fehlt
 * in `eintraege` — nie halb aktiv.
 * @returns {Promise<{eintraege: object[], befunde: {art, id, ebene, fehler}[]}>}
 */
export async function ladeRezepte(repo, { pruefen = true } = {}) {
    return _ladeEintraege(repo, REZEPTE_KEY, 'rezept', { pruefen });
}

/** Plansymbole aus der Bibliothek (A5) — dieselbe Form wie `EINGEBAUTE_SYMBOLE`. */
export const SYMBOLE_KEY = 'plansymbole';
export async function ladeSymbole(repo) {
    return _ladeEintraege(repo, SYMBOLE_KEY, 'symbol');
}

/**
 * Das Regelwerk des Büros bzw. Projekts (AR) — je Wert ein Eintrag
 * `{id, wert, quelle?}`, Projekt schlägt Büro je Id; geprüft wie alles.
 */
export const REGELWERK_KEY = 'regelwerk';
export async function ladeRegelwerk(repo) {
    return _ladeEintraege(repo, REGELWERK_KEY, 'regel');
}

async function _ladeEintraege(repo, schluessel, art, { pruefen = true } = {}) {
    const lies = async (quelle) => {
        try { return await quelle?.get?.(schluessel) ?? null; }
        catch (fehler) { console.warn(`cde: bibliothek ${art} laden`, fehler?.message ?? fehler); return null; }
    };
    const [projekt, buero] = await Promise.all([lies(repo), lies(repo?.buero)]);
    const karte = new Map();
    const befunde = [];
    for (const [ebene, liste] of [['buero', buero], ['projekt', projekt]]) {
        for (const d of Array.isArray(liste) ? liste : []) {
            // Ungeprüft nur für den Katalog-Lader: er prüft beim Registrieren,
            // NACH den Symbolen, die ein Rezept nennen darf.
            if (pruefen) {
                const { ok, fehler } = pruefeEintrag(art, d);
                if (!ok) { befunde.push({ art, id: d?.id ?? null, ebene, fehler }); continue; }
            } else if (!d?.id) continue;
            karte.set(d.id, { ...d, herkunft: ebene });
        }
    }
    return { eintraege: [...karte.values()], befunde };
}

/** Eine Rezept-Deklaration sichern — Projekt oder Büro. Nie werfen. */
export async function speichereRezept(repo, deklaration, { ebene = 'projekt' } = {}) {
    const { herkunft, ...d } = deklaration ?? {};
    const { ok, fehler } = pruefeEintrag('rezept', d);
    if (!ok) return { ok: false, grund: fehler.join(' ') };
    const r = await katalogSchreibe('rezept', ablageFuer(repo, ebene),
        (bisher) => [...(Array.isArray(bisher) ? bisher : []).filter(x => x?.id !== d.id), d], { ebene });
    return r.ok ? { ok: true, grund: null, id: d.id } : { ok: false, grund: r.grund };
}

/** Eine Rezept-Deklaration entfernen. Bauteile im Journal bleiben — sie melden dann „Rezept fehlt". */
export async function loescheRezept(repo, id, { ebene = 'projekt' } = {}) {
    const r = await katalogSchreibe('rezept', ablageFuer(repo, ebene), (bisher) => (
        Array.isArray(bisher) && bisher.some(x => x?.id === id) ? bisher.filter(x => x?.id !== id) : null), { ebene });
    return r.ok && r.geaendert;
}
