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

export const REPO_KEY = 'bauteil-vorlagen';

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

/** Nur DATEN dürfen hinein — und das Rezept muss es wirklich geben. */
export function pruefeVorlage(vorlage) {
    if (!vorlage || typeof vorlage !== 'object') return { ok: false, grund: 'keine Vorlage' };
    if (!String(vorlage.name ?? '').trim()) return { ok: false, grund: 'Der Name fehlt.' };
    if (!rezeptNach(vorlage.rezept)) return { ok: false, grund: `Unbekanntes Rezept „${vorlage.rezept}".` };
    const vorgaben = vorlage.vorgaben ?? {};
    if (typeof vorgaben !== 'object' || Array.isArray(vorgaben)) {
        return { ok: false, grund: 'Vorgaben müssen ein Objekt sein.' };
    }
    for (const [feld, wert] of Object.entries(vorgaben)) {
        if (!['string', 'number', 'boolean'].includes(typeof wert)) {
            return { ok: false, grund: `Vorgabe „${feld}" ist kein einfacher Wert.` };
        }
    }
    return { ok: true, grund: null };
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
    const ziel = ebene === 'buero' ? repo?.buero : repo;
    if (!ziel) return { ok: false, grund: 'Die Büroablage ist hier nicht verbunden.' };
    const bisher = _gueltige(await ziel.get(REPO_KEY));
    const id = vorlage.id || `v-${Date.now().toString(36)}`;
    const neu = [...bisher.filter(v => v.id !== id), { ...vorlage, id }];
    const geschrieben = await ziel.set(REPO_KEY, JSON.parse(JSON.stringify(neu)));
    return geschrieben === false
        ? { ok: false, grund: 'Sichern fehlgeschlagen.' }
        : { ok: true, grund: null, id };
}

/** Eine selbst angelegte Vorlage entfernen — Eingebautes bleibt. */
export async function loescheVorlage(repo, id, { ebene = 'projekt' } = {}) {
    const ziel = ebene === 'buero' ? repo?.buero : repo;
    if (!ziel) return false;
    const bisher = _gueltige(await ziel.get(REPO_KEY));
    if (!bisher.some(v => v.id === id)) return false;
    await ziel.set(REPO_KEY, JSON.parse(JSON.stringify(bisher.filter(v => v.id !== id))));
    return true;
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

