/**
 * Einmalige Übernahme der alten Client-Projekte in Modellsätze (Stufe 11.5).
 *
 * WAS DA LIEGT: Bis Stufe 11 führte die CDE eine eigene Projektliste neben dem
 * Auftrag. In `1337_Genau` standen dadurch zwei erfundene „Projekte" mit
 * derselben Nummer — beide gemeint als Variantenuntersuchung, beide unter
 * falschem Namen. Fabio: *„es wäre sinnvoll beide zu erhalten."*
 *
 * Genau das tut diese Datei: aus jedem Alt-Projekt wird ein MODELLSATZ, und
 * seine Ablage (Ansichten, Stile, Issues, Journal) zieht vom Scope
 * `project:<id>` nach `stand:<satz-id>` um. Nichts geht verloren.
 *
 * ZWEI EIGENSCHAFTEN, die eine Migration haben muss:
 *
 *   IDEMPOTENT — zweimal ausgeführt ändert nichts. Eine Marke hält fest, dass
 *                sie lief; ohne sie legte jeder Seitenaufruf neue Sätze an.
 *   LAUT       — sie gibt einen Bericht zurück, statt still zu arbeiten. Vor
 *                allem über die PHANTOME: das alte Register führte Dateien,
 *                die nie hochgeladen wurden (der Upload scheiterte am
 *                FormData-Fehler, `2f8e447`). Sie einfach zu übernehmen hiesse,
 *                einen Satz auf eine Datei zeigen zu lassen, die es nie gab.
 *
 * Muster: die KG-Übernahme in `IfcPlanningCockpit.vue` — lesen, umschreiben,
 * Marke setzen, Altbestand stehen lassen.
 */

export const MARKE = 'cde-migration-saetze';
export const MARKE_FASSUNG = 1;

/** Die Schlüssel, die NICHT mitwandern — sie gehören dem Auftrag. */
const BLEIBT_BEIM_AUFTRAG = new Set(['dokumente']);

/**
 * Aus welchen Alt-Dokumenten wird die Auswahl des Satzes?
 *
 * Rein und frei exportiert, damit die Prüfung ohne Repo läuft.
 *
 * @param {Array} altDokumente  aus `project:<id>:dokumente`
 * @param {Array} manifest      die echten Dokumente des Auftrags
 * @returns {{enthaelt: string[], phantome: object[]}}
 */
export function auswahlAus(altDokumente, manifest) {
    const echt = new Set((manifest ?? []).map(d => d.sha256));
    const enthaelt = [];
    const phantome = [];
    for (const d of altDokumente ?? []) {
        if (!d?.sha256) continue;
        if (echt.has(d.sha256)) enthaelt.push(d.sha256);
        else phantome.push({ sha256: d.sha256, name: d.name ?? '' });
    }
    return { enthaelt, phantome };
}

/**
 * Aus einem Alt-Projekt einen Satznamen machen.
 *
 * Der Name des Alt-Projekts ist das Aussagekräftigste, was da steht; die
 * Nummer war ohnehin nur eine Kopie der Auftragsnummer und wäre als Satzname
 * verwirrend („1337" als Variante von 1337).
 */
export function satzNameAus(projekt, benutzt = new Set()) {
    const roh = (projekt?.name || projekt?.nummer || 'Übernommen').trim();
    let name = roh;
    let n = 2;
    while (benutzt.has(name)) name = `${roh} (${n++})`;
    return name;
}

/**
 * Die Migration ausführen.
 *
 * @param {object} opts
 * @param {object} opts.repo    die RepoFacade (Auftragsebene)
 * @param {Array}  opts.manifest  die echten Dokumente des Auftrags
 * @param {(daten) => Promise<object>} opts.satzAnlegen
 * @returns {Promise<object>} Bericht
 */
export async function migriere({ repo, manifest = [], satzAnlegen } = {}) {
    const bericht = { gelaufen: false, angelegt: [], verschoben: 0, phantome: [], fehler: [] };
    if (!repo || typeof satzAnlegen !== 'function') return bericht;

    const marke = await repo.get(MARKE).catch(() => null);
    // Nicht erreichbar heißt NICHT „nichts zu übernehmen" (T3): sonst setzte
    // die Marke sich hier, und die Migration liefe nie wieder.
    if (repo.unerreichbar) return { ...bericht, fehler: [repo.unerreichbar.text] };
    if (marke && marke.fassung >= MARKE_FASSUNG) return bericht;

    let alteProjekte = null;
    try { alteProjekte = await repo.get('cde-projects'); } catch { /* nichts da */ }
    if (!Array.isArray(alteProjekte) || !alteProjekte.length) {
        // Nichts zu übernehmen — die Marke trotzdem setzen, sonst sucht jeder
        // Aufruf aufs Neue. Nur als „gelaufen" melden, wenn sie auch sitzt.
        const ok = await repo.set(MARKE, { fassung: MARKE_FASSUNG, am: Date.now(), angelegt: 0 });
        return { ...bericht, gelaufen: ok !== false };
    }

    const benutzt = new Set();
    for (const projekt of alteProjekte) {
        if (!projekt?.id) continue;
        const quelle = repo.withScope(`project:${projekt.id}`);

        let altDokumente = null;
        try { altDokumente = await quelle.get('dokumente'); } catch { /* leer */ }
        const { enthaelt, phantome } = auswahlAus(altDokumente, manifest);
        bericht.phantome.push(...phantome.map(p => ({ ...p, ausProjekt: projekt.name || projekt.id })));

        const name = satzNameAus(projekt, benutzt);
        benutzt.add(name);

        let satz;
        try {
            satz = await satzAnlegen({ name, zweck: 'variante', enthaelt });
        } catch (fehler) {
            bericht.fehler.push(`${name}: ${fehler?.response?.data?.detail ?? fehler?.message ?? fehler}`);
            continue;
        }
        bericht.angelegt.push({ id: satz.id, name, ausProjekt: projekt.id, enthaelt: enthaelt.length });

        // Die Ablage umziehen. `dokumente` bleibt zurück: sie gehört dem
        // Auftrag, und das Manifest führt sie längst.
        const ziel = repo.withScope(`stand:${satz.id}`);
        let schluessel = [];
        try { schluessel = await quelle.list(); } catch { /* nichts umzuziehen */ }
        for (const k of schluessel) {
            if (BLEIBT_BEIM_AUFTRAG.has(k)) continue;
            try {
                const wert = await quelle.get(k);
                if (wert === null || wert === undefined) continue;
                await ziel.set(k, wert);
                bericht.verschoben++;
            } catch (fehler) {
                bericht.fehler.push(`${name}/${k}: ${fehler?.message ?? fehler}`);
            }
        }
    }

    // Der Altbestand wird NICHT gelöscht. Er kostet nichts, und wenn an der
    // Übernahme etwas schiefging, ist er die einzige Quelle — dieselbe
    // Zurückhaltung wie bei den `ifc-viewer-*`-Schlüsseln aus Stufe 1.
    await repo.set(MARKE, { fassung: MARKE_FASSUNG, am: Date.now(), angelegt: bericht.angelegt.length });
    return { ...bericht, gelaufen: true };
}

/** Den Bericht in einen Satz fassen — für den Hinweis in der Oberfläche. */
export function berichtText(bericht) {
    if (!bericht?.gelaufen || !bericht.angelegt.length) return '';
    const teile = [`${bericht.angelegt.length} ${bericht.angelegt.length === 1 ? 'Modellsatz' : 'Modellsätze'} übernommen`];
    if (bericht.phantome.length) {
        teile.push(`${bericht.phantome.length} Eintrag ohne Datei übersprungen (${bericht.phantome.map(p => p.name).join(', ')})`);
    }
    if (bericht.fehler.length) teile.push(`${bericht.fehler.length} Fehler`);
    return teile.join(' · ');
}
