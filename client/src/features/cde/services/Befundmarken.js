/**
 * Befundmarken — die Befunde der eigenen Bauteile als Marken im Raum (Teil XXX, B7).
 *
 * Bis hierher standen Befunde nur in Listen: in der Prüfliste des Cockpits und in der Tafel am gewählten Bauteil. Im
 * Raum war nicht zu sehen, WO etwas nicht stimmt (Konzept § 3, Lücke 7: „Befunde ohne Marker im Raum und ohne Zähler").
 *
 * Zwei Quellen, dieselben Regeln wie überall: der Prüflauf über das Journal (`pruefeStandAusJournal` — Gefälle,
 * Anschlüsse, Fachgrenzen) und die Befunde der Ableitungen aus dem letzten Aufbau (Überdeckung, Schicht über dem
 * Rand, Raum am Umriss). Je Bauteil EINE Marke; die stärkste Schwere gibt die Farbe.
 *
 * Rein: kein three, kein DOM. Der Ort ist die Hülle des gebauten Teils (`autor.huellen`), oben in der Mitte.
 */

const RANG = { warnung: 2, hinweis: 1 };

/**
 * @param {object} q
 * @param {Array<{globalId, befunde: Array}>} [q.eigene]   aus dem Prüflauf
 * @param {Map<string, {befunde?: Array}>} [q.ableitungen] `autor.ableitungen`
 * @param {Map<string, object>} [q.stand]                  wirksamer Stand „erzeugt" (globalId → Bauplan)
 * @param {Map<string, {min, max}>} [q.huellen]            `autor.huellen` — ohne Hülle keine Marke
 * @param {Set<string>} [q.verdeckt]
 * @param {(plan) => boolean} [q.ausnehmen]  Teile ohne eigene Marke (die Geländeanzeige)
 * @returns {Array<{globalId, name, punkt: {x,y,z}, schwere, texte: string[]}>}
 */
export function befundmarkenAus({ eigene = [], ableitungen = new Map(), stand = new Map(), huellen = new Map(), verdeckt = new Set(),
                                 ausnehmen = null } = {}) {
    const je = new Map();
    const dazu = (gid, befunde) => {
        if (!gid || verdeckt.has(gid) || ausnehmen?.(stand.get?.(gid))) return;
        for (const b of befunde ?? []) {
            if (!RANG[b?.schwere]) continue;
            const e = je.get(gid) ?? { schwere: 'hinweis', texte: [] };
            if (RANG[b.schwere] > RANG[e.schwere]) e.schwere = b.schwere;
            if (b.text && !e.texte.includes(b.text)) e.texte.push(b.text);
            je.set(gid, e);
        }
    };
    for (const z of eigene ?? []) dazu(z?.globalId, z?.befunde);
    // Ein Befund der ABLEITUNG gehört allen ihren Teilen, die im Raum stehen — die Marke sitzt am ersten mit Hülle.
    for (const [abl, a] of ableitungen ?? []) {
        if (!a?.befunde?.length) continue;
        const teil = [...(stand ?? [])].find(([gid, p]) => p?.ableitung === abl && huellen.has(gid) && !verdeckt.has(gid) && !ausnehmen?.(p))?.[0];
        dazu(teil, a.befunde);
    }
    const aus = [];
    for (const [gid, e] of je) {
        const h = huellen.get(gid);
        if (!h) continue;
        aus.push({
            globalId: gid, name: stand.get?.(gid)?.name ?? '', schwere: e.schwere, texte: e.texte,
            punkt: { x: (h.min.x + h.max.x) / 2, y: h.max.y, z: (h.min.z + h.max.z) / 2 },
        });
    }
    // Feste Reihenfolge — die Warnungen zuerst; der Zähler springt in dieser Folge.
    return aus.sort((a, b) => (RANG[b.schwere] - RANG[a.schwere]) || a.globalId.localeCompare(b.globalId));
}

/** Die Marke als Overlay-Grundformen: ein Stiel von der Oberkante nach oben, ein liegender Ring daran. */
export function markenGrundformen(marken, { farben = {}, hoehe = 1.5, radius = 0.6 } = {}) {
    return (marken ?? []).flatMap(m => {
        const farbe = m.schwere === 'warnung' ? (farben.warn ?? '#ffb74d') : (farben.accent ?? '#4fc3f7');
        const oben = { x: m.punkt.x, y: m.punkt.y + hoehe, z: m.punkt.z };
        return [
            { art: 'linie', punkte: [m.punkt, oben], farbe },
            { art: 'marke', punkt: oben, normal: { x: 0, y: 1, z: 0 }, radius, farbe },
        ];
    });
}
