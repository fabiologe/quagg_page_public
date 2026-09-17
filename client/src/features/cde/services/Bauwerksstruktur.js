/**
 * Bauwerksstruktur über ALLE geladenen Modelle (Fahrplan Erdbau-Container, Stufe 8, T6).
 *
 * Bis 2026-09-11 zeigte das Fenster „Bauwerksstruktur" genau EIN Modell
 * (`IfcStoreys.getSpatialTree` nahm hart das erste), während die Fußzeile „n
 * Modelle" zählte. Die Knoten von fragments tragen nur `{category, localId,
 * children}` — keinen Namen, kein Modell —: als Beschriftung stand immer die
 * Kategorie, und ein Klick fiel ohne `modelId` aufs erste Modell zurück, auch
 * bei localId-Kollision in einem zweiten.
 *
 * Und was IFC NICHT in die Raumgliederung stellt, fehlte ganz: ein Aushub hängt
 * über `IfcRelVoidsElement` an seinem Wirt (eingeordnet werden darf er nicht,
 * `IfcFeatureElement.NotContained`), Fachmodell- und Vorgangsgruppen über
 * `IfcRelAssignsToGroup`. Hier kommen sie dazu: der Aushub unter seinem Wirt,
 * die Gruppen als eigener Zweig neben der Gliederung.
 *
 * Rein: kein Vue, keine Engine. Die Engine liefert die Bäume
 * (`getSpatialTrees`) und die Beziehungen (`strukturBeziehungen` über die
 * IfcQuelle je Modell), der Suchindex die Namen.
 */
import { getEntityInfo } from '../data/entity-schema.js';

const KATEGORIE_AUSHUB = 'IFCEARTHWORKSCUT';

/** Ein Verweis in einer web-ifc-Zeile → ExpressID (flach `{value}`, tief `{expressID}`). */
function _id(ref) {
    if (ref == null) return null;
    if (typeof ref === 'number') return ref;
    return ref.value ?? ref.expressID ?? null;
}

function _text(v) {
    const t = v?.value ?? v;
    return t == null ? '' : String(t);
}

/**
 * Aussparungen und Gruppen EINES Modells — aus seiner IfcQuelle gelesen.
 *
 * @param {IfcQuelle} quelle
 * @returns {{voids: Array<{wirt: number, aushub: number}>,
 *            gruppen: Array<{localId: number, klasse: string, name: string, objectType: string, mitglieder: number[]}>}}
 */
export function strukturBeziehungen(quelle) {
    if (!quelle?.lebt?.()) return { voids: [], gruppen: [] };
    const voids = [];
    for (const r of quelle.alle('IFCRELVOIDSELEMENT')) {
        const wirt = _id(r.RelatingBuildingElement);
        const aushub = _id(r.RelatedOpeningElement);
        if (wirt != null && aushub != null) voids.push({ wirt, aushub });
    }
    const mitglieder = new Map();
    for (const r of quelle.alle('IFCRELASSIGNSTOGROUP', { untertypen: true })) {
        const g = _id(r.RelatingGroup);
        if (g == null) continue;
        const liste = mitglieder.get(g) ?? [];
        for (const o of r.RelatedObjects ?? []) {
            const id = _id(o);
            if (id != null) liste.push(id);
        }
        mitglieder.set(g, liste);
    }
    const gruppen = quelle.ids('IFCGROUP', { untertypen: true }).map(localId => {
        const z = quelle.zeile(localId);
        return { localId, klasse: quelle.kategorieVon(z), name: _text(z?.Name), objectType: _text(z?.ObjectType),
                 mitglieder: [...new Set(mitglieder.get(localId) ?? [])] };
    });
    return { voids, gruppen };
}

/** Trifft ein Knoten — oder einer darunter — den Filter? Name UND Kategorie: der eine Maßstab von Fenster und Baum. */
export function trifft(knoten, filter) {
    const f = String(filter ?? '').toLowerCase().trim();
    if (!f) return true;
    if (!knoten) return false;
    const text = `${knoten.name ?? ''} ${knoten.category ?? ''}`.toLowerCase();
    return text.includes(f) || (knoten.children ?? []).some(k => trifft(k, f));
}

/**
 * DIE ECHTE FORM VON FRAGMENTS FALTEN (Abnahme 2026-09-12, A7).
 *
 * `getSpatialStructure` wechselt zwischen Kategorie-Knoten `{category,
 * localId: null}` und Element-Knoten `{category: null, localId}` — so baut sie
 * `getTreeItem` im Worker. Das Fenster zeigte deshalb „PROJECT › Element ›
 * SITE › Site", und die Tests sahen es nie: ihre Attrappen hatten eine
 * Mischform. Eine Kategorie mit EINEM Element wird zu diesem Element (es erbt
 * die Kategorie), eine mit mehreren zu einem Ordner „IfcPipeSegment (24)".
 * Die Mischform (Knoten mit Kategorie UND localId) bleibt, wie sie ist.
 */
function _falte(kinder) {
    return (kinder ?? []).flatMap((k) => {
        if (!k) return [];
        if (k.localId != null || !k.category || !(k.children ?? []).length) return [k];
        const elemente = k.children.map(e => (e?.category ? e : { ...e, category: k.category }));
        if (elemente.length === 1) return elemente;
        const titel = getEntityInfo(String(k.category).toUpperCase())?.name ?? k.category;
        return [{ ...k, ordner: true, name: `${titel} (${elemente.length})`, children: elemente }];
    });
}

/**
 * Der Zweig „Gruppen": Fachmodell → Vorgang → Mitglieder (Verweise), Systeme daneben.
 *
 * Eine Gruppe, die Mitglied einer anderen ist, hängt darunter. Ein Vorgang, der
 * nirgends Mitglied ist, hängt unter dem Fachmodell, mit dem er die meisten
 * Bauteile teilt — dort stehen dann nur noch die Bauteile, die keiner seiner
 * Vorgänge schon zeigt.
 */
function _gruppenZweig(gruppen, modelId, blatt) {
    if (!gruppen.length) return null;
    const nach = new Map(gruppen.map(g => [g.localId, g]));
    const eltern = new Map();
    for (const g of gruppen) {
        for (const m of g.mitglieder) if (nach.has(m) && m !== g.localId && !eltern.has(m)) eltern.set(m, g.localId);
    }
    const fachmodelle = gruppen.filter(g => g.objectType === 'Fachmodell');
    for (const g of gruppen) {
        if (eltern.has(g.localId) || g.objectType !== 'Vorgang') continue;
        const eigene = new Set(g.mitglieder);
        let bester = null;
        let treffer = 0;
        for (const f of fachmodelle) {
            const t = f.mitglieder.filter(m => eigene.has(m)).length;
            if (t > treffer) { bester = f; treffer = t; }
        }
        if (bester) eltern.set(g.localId, bester.localId);
    }
    const knoten = (g, weg) => {
        const unter = new Set([...weg, g.localId]);
        const kinder = gruppen.filter(x => eltern.get(x.localId) === g.localId && !unter.has(x.localId));
        const abgedeckt = new Set(kinder.flatMap(x => x.mitglieder));
        return {
            localId: g.localId, modelId, category: g.klasse, objectType: g.objectType, gruppe: true,
            name: g.name || g.objectType || g.klasse,
            children: [
                ...kinder.map(x => knoten(x, unter)),
                ...g.mitglieder.filter(m => !nach.has(m) && !abgedeckt.has(m)).map(m => blatt(m, { verweis: true })),
            ],
        };
    };
    return {
        localId: null, modelId, category: 'GRUPPEN', gruppe: true, name: `Gruppen (${gruppen.length})`,
        children: gruppen.filter(g => !eltern.has(g.localId)).map(g => knoten(g, new Set())),
    };
}

/**
 * Die Bäume für das Fenster — je Modell einer, der Baum von fragments bleibt unberührt.
 *
 * @param {object} o
 * @param {Array<{modelId, name, wurzel}>} o.baeume   `engine.getSpatialTrees()`
 * @param {Array<{modelId, localId, name, globalId, category}>} o.index  der Suchindex
 * @param {Map<string, {voids, gruppen}>} o.beziehungen  je Modell `strukturBeziehungen`
 * @param {(modelId: string) => string|null} o.shaVon  die Datei hinter dem Modell (Herkunft im Fensterkopf)
 * @returns {Array<{modelId, name, sha256, wurzel, gruppen, knoten}>}
 */
export function baueBaeume({ baeume = [], index = [], beziehungen = new Map(), shaVon = () => null } = {}) {
    const je = new Map();
    for (const e of index ?? []) je.set(`${e.modelId}:${e.localId}`, e);
    return (baeume ?? []).map(({ modelId, name, wurzel }) => {
        const bez = beziehungen?.get?.(modelId) ?? null;
        const eintrag = (localId) => je.get(`${modelId}:${localId}`) ?? null;
        const aushuebe = new Map();
        for (const { wirt, aushub } of bez?.voids ?? []) aushuebe.set(wirt, [...(aushuebe.get(wirt) ?? []), aushub]);
        const imBaum = new Set();
        const merke = (k) => {
            if (!k) return;
            if (k.localId != null) imBaum.add(k.localId);
            (k.children ?? []).forEach(merke);
        };
        merke(wurzel);
        let knoten = 0;
        const blatt = (localId, extra = {}) => {
            const e = eintrag(localId);
            return { localId, modelId, category: e?.category ?? null, name: e?.name || null,
                     globalId: e?.globalId ?? null, children: [], ...extra };
        };
        const reich = (k) => {
            if (!k) return null;
            knoten++;
            const e = k.localId != null ? eintrag(k.localId) : null;
            const kinder = _falte(k.children).map(reich).filter(Boolean);
            for (const a of (k.localId != null ? aushuebe.get(k.localId) ?? [] : [])) {
                if (imBaum.has(a)) continue;                 // führt fragments ihn schon: nicht doppelt
                imBaum.add(a);
                knoten++;
                kinder.push(blatt(a, { aussparung: true, category: eintrag(a)?.category ?? KATEGORIE_AUSHUB }));
            }
            return { ...k, modelId, category: k.category ?? e?.category ?? null, name: e?.name || k.name || null,
                     globalId: e?.globalId ?? null, children: kinder };
        };
        const [oben = null, ...weitere] = _falte(wurzel ? [wurzel] : []);
        const baum = reich(weitere.length ? { ...wurzel, children: [oben, ...weitere] } : oben);
        return { modelId, name, sha256: shaVon?.(modelId) ?? null, wurzel: baum,
                 gruppen: _gruppenZweig(bez?.gruppen ?? [], modelId, blatt), knoten };
    });
}

/**
 * Der Abschnitt „Eigenbau" — aus dem Verlauf, nicht aus fragments (Abnahme 2026-09-12, A7).
 *
 * Das CDE-Modell hat keine Raumgliederung: seine Teile entstehen im Delta des
 * Editors, ohne Einordnung. Bis hierher stand es als leerer Knoten
 * „cde-eigenbau · lokal" im Fenster, der nicht aufklappte. Jetzt: je
 * Erdbau-Vorgang ein Knoten mit seinen Teilen (Aushub, Auftrag), das geformte
 * Gelände und übrige eigene Teile daneben — mit den localIds des letzten
 * Aufbaus, damit Klick und Auge wirken. Ein Vorgang trägt seine Ableitung
 * (`vorgang`) — daran hängt „Vorgang entfernen".
 *
 * @param {object} o
 * @param {Map<string, object>} o.stand     wirksamer Stand `erzeugt`
 * @param {Map<string, number>} [o.karte]   globalId → localId des letzten Aufbaus
 * @param {Map<string, string>} [o.titel]   Ableitung → Vorgangstitel (`vorgangstitelAus`)
 * @param {Set<string>} [o.verborgen]       eigene Teile, die verborgen sind (G6)
 * @param {Set<string>} [o.leer]            eigene Teile ohne Volumen — kein Fehlschlag (Auftrag eines reinen Aushubs)
 * @param {Map<string, {sichtbar: boolean, verdecktVon: Array}>} [o.vorgangsAugen]
 *   Je Ableitung, was die Engine über ihre Sichtbarkeit sagt (Teil XXI, E3).
 *   Ein Vorgang, den ein späterer überformt hat, steht nicht im Raum — der
 *   Knoten sagt es und trägt das Auge, das ihn zurückholt.
 * @param {string} o.modelId                das Eigenbau-Modell
 * @returns {{modelId, name, sha256: null, eigenbau: true, wurzel, gruppen: null, knoten}|null}
 */
export function eigenbauBaum({ stand = new Map(), karte = new Map(), titel = new Map(), verborgen = new Set(),
                               leer = new Set(), vorgangsAugen = new Map(), modelId } = {}) {
    if (!stand?.size) return null;
    const teil = (gid, wert) => {
        const localId = karte?.get?.(gid) ?? null;
        const zusatz = localId != null ? ''
            : verborgen?.has?.(gid) ? ' (verborgen)'
            : leer?.has?.(gid) ? ' (leer)'
            : ' (nicht gebaut)';
        return { localId, modelId, category: wert?.kategorie ?? null, name: `${wert?.name || 'Teil ohne Namen'}${zusatz}`,
                 globalId: gid, children: [], ...(localId == null ? { nichtImRaum: true } : {}) };
    };
    const vorgaenge = new Map();
    const uebrige = [];
    for (const [gid, wert] of stand) {
        const a = wert?.ableitung ?? null;
        if (a && titel?.has?.(a)) {
            if (!vorgaenge.has(a)) {
                // ÜBERDECKT (Teil XXI, E3): der Knoten sagt, WER den Vorgang
                // überformt hat, und trägt das Auge, das ihn zurückholt. Ohne
                // Angabe der Engine gilt „sichtbar" — ein Baum ohne Raum
                // (Test, Kopfleiste) soll nichts verbergen.
                const auge = vorgangsAugen?.get?.(a) ?? null;
                const verdecktVon = (auge?.verdecktVon ?? []).map(v => titel.get(v.ableitung) || v.ableitung);
                vorgaenge.set(a, { localId: null, modelId, category: 'VORGANG', gruppe: true, vorgang: a,
                                   name: titel.get(a) || 'Vorgang', children: [],
                                   sichtbar: auge ? !!auge.sichtbar : true,
                                   ...(verdecktVon.length ? { verdecktVon } : {}) });
            }
            vorgaenge.get(a).children.push(teil(gid, wert));
        } else {
            uebrige.push(teil(gid, wert));
        }
    }
    const wurzel = { localId: null, modelId, category: 'EIGENBAU', gruppe: true, name: 'Eigenbau',
                     children: [...vorgaenge.values(), ...uebrige] };
    return { modelId, name: 'Eigenbau', sha256: null, eigenbau: true, wurzel, gruppen: null, knoten: stand.size };
}
