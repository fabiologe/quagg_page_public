/**
 * Ausgeben als Auswahlbaum (Fahrplan „Klare Abläufe“, S4 neu; Kassensturz E10).
 *
 * Rein: kein Store, keine Engine. Der Dialog baut beim Öffnen EIN Probe-Paket
 * (`IfcViewer.eigenbauPaket`) — daraus entsteht der Baum, und genau dieses
 * Paket, gefiltert nach den Häkchen, geht an den Server. Was du siehst, ist,
 * was du ausgibst.
 *
 * Vorher (Karte 2026-09-12): keine Wahl außer „Eigenbau live mitnehmen“ und
 * zwei Startknöpfen; der ganze Satz, der ganze Verlauf. Ein Vorgang, der sich
 * nicht bauen ließ, sperrte die ganze Ausgabe — gesagt erst nach dem Serverlauf
 * (V10). Jetzt hakt man ihn ab; das Paket nennt ihn unter `ausgelassen`, der
 * Server sperrt ihn nicht, die Datei trägt ihn am Fachmodell (K7).
 */
import { istAushub } from './Kategorien.js';
import { istOffen } from './Pruefbericht.js';

/** Bauteile ohne Erdbau-Vorgang (Gezeichnetes, Aussparungen) — ein eigener Knoten im Baum. */
export const EINZELN = 'einzeln';

/** Der Knoten eines Paket-Bauteils: sein Erdbau-Vorgang, sonst „einzeln“. */
export function gruppeVon(teil) {
    return teil?.vorgang?.ableitung ?? EINZELN;
}

const zahl = (n, eins, viele) => `${n} ${n === 1 ? eins : viele}`;

/**
 * Der Baum aus dem Probe-Paket und den Modellen des Satzes.
 *
 * @param {object} o
 * @param {object|null} o.paket   Probe-Paket: `bauteile` (mit `vorgang`), `misserfolge` (mit `vorgang`)
 * @param {Array} o.modelle       `satzModelle(satz, dokumente)` — in Satz-Reihenfolge
 * @param {Map}   o.stecktIn      sha256 → Erdbau-Dokument, in dem das Modell steckt (`imErdbauEnthalten`)
 * @returns {{modelle: Array<{sha256, name, revision, status, erdbau, stecktIn}>,
 *            gruppen: Array<{schluessel, titel, teile, aushub, fehlt: Array<{globalId, grund, name}>}>}}
 */
export function ausgabeBaum({ paket = null, modelle = [], stecktIn = new Map() } = {}) {
    const gruppen = new Map();
    const gruppe = (schluessel, titel) => {
        if (!gruppen.has(schluessel)) gruppen.set(schluessel, { schluessel, titel: null, teile: 0, aushub: 0, fehlt: [] });
        const g = gruppen.get(schluessel);
        if (!g.titel && titel) g.titel = titel;
        return g;
    };
    for (const b of paket?.bauteile ?? []) {
        const g = gruppe(gruppeVon(b), b.vorgang?.titel);
        g.teile += 1;
        if (istAushub(b.klasse)) g.aushub += 1;
    }
    for (const m of paket?.misserfolge ?? []) {
        gruppe(m?.vorgang?.ableitung ?? EINZELN, m?.vorgang?.titel)
            .fehlt.push({ globalId: m.globalId, grund: m.grund ?? '', name: m.name ?? null });
    }
    // Vorgänge in der Reihenfolge des Pakets (= des Verlaufs), Einzelnes zuletzt.
    const liste = [...gruppen.values()].sort((a, b) => (a.schluessel === EINZELN) - (b.schluessel === EINZELN));
    for (const g of liste) g.titel ??= g.schluessel === EINZELN ? 'Einzelne Bauteile' : 'Vorgang ohne Titel';
    return {
        modelle: (modelle ?? []).map(d => ({
            sha256: d.sha256, name: d.datei ?? d.name, revision: d.revision ?? null, status: d.status ?? '',
            erdbau: d.herkunft?.art === 'erdbau', stecktIn: stecktIn?.get?.(d.sha256) ?? null,
        })),
        gruppen: liste,
    };
}

/**
 * Das Paket nach den Häkchen.
 *
 * Abgewähltes steht unter `ausgelassen` ([{globalId, vorgang, grund}]) — die
 * Datei sagt es (K7), und V10 sperrt einen weggelassenen Misserfolg nicht.
 * `misserfolge` bleibt vollständig: der Server zieht das Weggelassene selbst ab
 * (`pruefe.paketregeln`). Die Quelldokumente schrumpfen auf das Gelände, das die
 * verbleibenden Teile noch brauchen; ein Aushub schneidet nur noch durch
 * Füllungen, die mitkommen.
 *
 * @param {object} paket
 * @param {Set<string>} aus  abgewählte Knoten (`gruppeVon`)
 */
export function paketAuswahl(paket, aus = new Set()) {
    if (!paket) return null;
    if (!aus?.size) return paket;
    const weg = (schluessel) => aus.has(schluessel);
    const bleiben = (paket.bauteile ?? []).filter(b => !weg(gruppeVon(b)));
    const ids = new Set(bleiben.map(b => b.cdeId));
    const ausgelassen = [
        ...(paket.bauteile ?? []).filter(b => weg(gruppeVon(b)))
            .map(b => ({ globalId: b.cdeId, vorgang: b.vorgang?.titel ?? null, grund: 'weggelassen' })),
        ...(paket.misserfolge ?? []).filter(m => weg(m?.vorgang?.ableitung ?? EINZELN))
            .map(m => ({ globalId: m.globalId, vorgang: m.vorgang?.titel ?? null, grund: 'nicht baubar, weggelassen' })),
    ];
    return {
        ...paket,
        bauteile: bleiben.map(b => (b.schneidetAuffuellung?.length
            ? { ...b, schneidetAuffuellung: b.schneidetAuffuellung.filter(id => ids.has(id)) } : b)),
        quellDokumente: quellenFuer(paket.quellDokumente, bleiben),
        ausgelassen,
    };
}

/** Nur die Registerdateien, deren Gelände die verbleibenden Teile noch brauchen. */
export function quellenFuer(quellDokumente = [], bauteile = []) {
    const noetig = new Set(bauteile.flatMap(b => [b.wirt, b.quellen?.gelaende]).filter(Boolean));
    return (quellDokumente ?? [])
        .map(q => ({ ...q, globalIds: (q.globalIds ?? []).filter(g => noetig.has(g)) }))
        .filter(q => q.globalIds.length);
}

/**
 * Welches Modell fehlt einem Knoten? Jeder Schritt im Verlauf merkt die Datei,
 * an der er hängt (`modellSha`, bei einem Kanalgraben die der Rohre). Steht
 * sie im Register, aber nicht im Satz, holt „Laden“ sie. Eindeutig oder gar
 * nicht — geraten wird nicht.
 *
 * @returns {Map<string, {sha256, name}>}  Knoten → Modell
 */
export function ladbarFuer({ gruppen = [], eintraege = [], satzShas = [], dokumente = [] } = {}) {
    const juengster = new Map();                          // globalId → Eintrag mit Datei
    for (const e of eintraege ?? []) {
        if (e?.art !== 'erzeugt' || !e.globalId || !e.modellSha) continue;
        const da = juengster.get(e.globalId);
        if (!da || (e.wann ?? 0) >= (da.wann ?? 0)) juengster.set(e.globalId, e);
    }
    const imSatz = new Set(satzShas);
    const karte = new Map();
    for (const g of gruppen) {
        const shas = new Set(g.fehlt.map(f => juengster.get(f.globalId)?.modellSha).filter(s => s && !imSatz.has(s)));
        if (shas.size !== 1) continue;
        const [sha256] = shas;
        const d = (dokumente ?? []).find(x => x.sha256 === sha256);
        if (d) karte.set(g.schluessel, { sha256, name: d.datei ?? d.name });
    }
    return karte;
}

/**
 * EINE Zeile Stand — und beim ersten Problem genau EIN Satz mit Knöpfen
 * (Karte, „Der Ausgeben-Dialog“). Blockierendes vor Hinweisen; ein Hinweis
 * (`hinweis`) lässt die Ausgabe zu.
 *
 * @returns {{ok: boolean, zeile: string, satz: string|null,
 *            knoepfe: Array<{art: 'laden'|'weglassen'|'anhaken'|'eigenbau-aus'|'crs-auto', text: string, schluessel?, sha256?}>}}
 */
export function bereitschaft({ art = 'verbund', baum, paket = null, probeFehler = null, aus = new Set(),
                               modelleAus = new Set(), eigenbauAn = true, aushubGanzFehlt = null,
                               ladbar = new Map(), crsWahl = '', crsPruefung = null, hinweis = null } = {}) {
    const gruppen = baum?.gruppen ?? [];
    const mitEigenbau = art === 'erdbau' || eigenbauAn;
    const gruppenAn = mitEigenbau ? gruppen.filter(g => !aus.has(g.schluessel)) : [];
    const teile = gruppenAn.reduce((n, g) => n + g.teile, 0);
    const vorgaenge = gruppenAn.filter(g => g.schluessel !== EINZELN && g.teile).length;
    const weg = mitEigenbau ? gruppen.filter(g => aus.has(g.schluessel)).reduce((n, g) => n + g.teile + g.fehlt.length, 0) : 0;
    const modelleAn = (baum?.modelle ?? []).filter(m => !modelleAus.has(m.sha256));
    const abgewaehlt = (baum?.modelle ?? []).length - modelleAn.length;

    const stand = [];
    if (art === 'erdbau') {
        stand.push(gruppen.length ? `${zahl(teile, 'Teil', 'Teile')} aus ${zahl(vorgaenge, 'Vorgang', 'Vorgängen')}` : 'kein Eigenbau');
    }
    else {
        stand.push(zahl(modelleAn.length, 'Modell', 'Modelle'));
        if (teile) stand.push(`Eigenbau ${zahl(teile, 'Teil', 'Teile')}`);
        if (abgewaehlt) stand.push(`${abgewaehlt} abgewählt`);
    }
    if (weg) stand.push(`${weg} weggelassen`);
    const antwort = (ok, satz = null, knoepfe = []) =>
        ({ ok, zeile: `${ok ? 'Bereit' : 'Nicht bereit'} · ${stand.join(' · ')}`, satz, knoepfe });

    if (art === 'erdbau') {
        if (!paket) return antwort(false, probeFehler ?? 'Ohne geladenes Modell gibt es keinen Eigenbau.');
        if (aushubGanzFehlt) return antwort(false, aushubGanzFehlt);
        if (!gruppenAn.some(g => g.aushub)) return antwort(false, 'Ohne Aushub kein Erdbau-Dokument — einen Vorgang mit Aushub anhaken.');
    }
    for (const g of gruppenAn) {
        if (!g.fehlt.length) continue;
        const grund = g.fehlt.map(f => f.grund).find(Boolean);
        const knoepfe = [];
        const modell = ladbar.get?.(g.schluessel);
        if (modell) knoepfe.push({ art: 'laden', text: `${modell.name} laden`, sha256: modell.sha256 });
        knoepfe.push({ art: 'weglassen', text: 'Weglassen', schluessel: g.schluessel });
        return antwort(false, `${g.titel}: ${zahl(g.fehlt.length, 'Teil lässt', 'Teile lassen')} sich nicht bauen`
            + `${grund ? ` (${grund})` : ''}${modell ? ` — ${modell.name} steht nicht im Satz` : ''}.`, knoepfe);
    }
    // Ein Aushub braucht sein Gelände — liegt es in einem abgewählten Knoten, fehlt es in der Datei.
    const angehakt = new Set(gruppenAn.flatMap(g => (paket?.bauteile ?? []).filter(b => gruppeVon(b) === g.schluessel).map(b => b.cdeId)));
    for (const b of paket?.bauteile ?? []) {
        if (!angehakt.has(b.cdeId) || !String(b.wirt ?? '').startsWith('cde-') || angehakt.has(b.wirt)) continue;
        const traeger = (paket.bauteile ?? []).find(x => x.cdeId === b.wirt);
        if (!traeger) continue;
        const von = gruppen.find(g => g.schluessel === gruppeVon(b));
        const nach = gruppen.find(g => g.schluessel === gruppeVon(traeger));
        return antwort(false, `${von?.titel ?? 'Ein Vorgang'}: der Aushub braucht sein Gelände aus „${nach?.titel}“.`,
            [{ art: 'anhaken', text: 'Mit anhaken', schluessel: nach?.schluessel }]);
    }
    if (art === 'verbund') {
        if (!modelleAn.length && !teile) return antwort(false, 'Nichts angehakt.');
        const erdbauDok = modelleAn.find(m => m.erdbau);
        if (erdbauDok && teile) {
            return antwort(false, `${erdbauDok.name} und der Eigenbau zugleich — der Aushub stünde doppelt.`,
                [{ art: 'eigenbau-aus', text: 'Eigenbau weglassen' }]);
        }
    }
    if (crsWahl && crsPruefung && !crsPruefung.stimmt) {
        return antwort(false, `${crsWahl} passt nicht: ${crsPruefung.grund}`, [{ art: 'crs-auto', text: 'Wie ermittelt' }]);
    }
    return antwort(true, hinweis ?? null);
}

/** Der Zustand eines Laufs in einem Wort — die Zeile nach dem Start. */
export function laufZeile(lauf) {
    if (!lauf) return '';
    const z = lauf.zustand;
    if (z === 'geprueft') return lauf.dokument ? `Geprüft · ${lauf.dokument.datei} im Register` : 'Geprüft · wird eingetragen';
    return ({ wartet: 'Angenommen', laeuft: 'Rechnet', abgelehnt: 'Abgelehnt', fehler: 'Fehler', abgebrochen: 'Abgebrochen' })[z] ?? z ?? '';
}

// Die häufigsten Ablehnungen in einem Satz für Menschen — der Bericht steht unter „Details“.
const ABLEHNUNG = {
    V10: (b) => `${zahl(b.zahl ?? 0, 'Teil lässt', 'Teile lassen')} sich nicht bauen — den Vorgang weglassen oder das fehlende Modell laden.`,
    SPF: (b) => `${b.zahl ? zahl(b.zahl, 'Stelle verletzt', 'Stellen verletzen') : 'Stellen verletzen'} das IFC-Schema.`,
};

/**
 * Warum ein Lauf nicht ins Register kam — EIN Satz aus dem ersten sperrenden
 * Befund (dieselbe Regel wie der Server: `Pruefbericht.istOffen`).
 */
export function laufSatz(lauf) {
    if (!lauf || !['abgelehnt', 'fehler', 'abgebrochen'].includes(lauf.zustand)) return null;
    const erster = (lauf.befunde ?? []).find(istOffen);
    const grund = erster
        ? (ABLEHNUNG[erster.id]?.(erster) ?? `${erster.titel}: ${String(erster.sagt ?? '').slice(0, 200)}`)
        : (lauf.fehler ?? 'Der Server nennt keinen Grund.');
    return lauf.zustand === 'abgelehnt' ? `Kein Dokument entstanden. ${grund}` : grund;
}
