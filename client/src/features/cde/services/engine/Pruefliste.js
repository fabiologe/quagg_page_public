/**
 * Prüfliste — aus der IfcEngine ausgelagert (Teil XXIII, A8; Befund B13).
 *
 * Das ganze Modell prüfen — Befunde je Bauteil, Netz und Beziehung.
 *
 * Jede Funktion bekommt die Engine als ersten Parameter (`engine`) und liest
 * nur, was sie braucht; die Engine behält eine einzeilige Weiterleitung, damit
 * ihre Aufrufer (Viewer, Tests) unverändert bleiben.
 */
import { CDE_MODELL_ID } from '../IfcAutor.js';
import { befundeAusBeziehungen, befundeFuer, befundeFuerNetz } from '../Befunde.js';
import { aufgeloestesRegelwerk } from '../regeln/Regelwerk.js';

/**
 * Das ganze Modell prüfen — die Prüfliste (Stufe 14.4).
 *
 * Läuft über die Achsen, die seit dem Laden bereitstehen; es wird nichts
 * nachgelesen. Rein beratend: kein Befund hält je etwas auf.
 *
 * @param {object} opts
 * @param {(kategorie:string) => object|null} [opts.typprofilFuer]
 * @param {object} [opts.regelwerk]
 * @returns {Array<{modelId, localId, globalId, kategorie, name, befunde}>}
 */
export function pruefeAlles(engine, { typprofilFuer = () => null, umgekehrtFuer = () => false, regelwerk = aufgeloestesRegelwerk() } = {}) {
    const out = [];
    for (const [modelId, achsen] of (engine._achsen ?? new Map())) {
        const quelle = engine.quelleVon(modelId);
        // Netz-Befunde zuerst: sie betreffen auch Bauteile OHNE Achse
        // (einen Schacht ohne Anschluss etwa), die die Schleife darunter
        // gar nicht besucht.
        const netzBefunde = befundeFuerNetz(engine.netzVon(modelId), regelwerk);
        for (const [localId, achse] of achsen) {
            // Verdeckte prüfen nicht mit — ein unsichtbares Bauteil mit
            // sichtbaren Befunden wäre eine Liste, der niemand traut.
            if (achse.globalId && engine._verdeckt?.has(achse.globalId)) {
                netzBefunde.delete(localId);
                continue;
            }
            const zeile = quelle?.zeile(localId) ?? null;
            const kategorie = achse.kategorie
                ?? (zeile?.constructor?.name ?? '').toUpperCase()
                ?? '';
            const globalId = achse.globalId ?? String(localId);
            const befunde = befundeFuer({
                globalId,
                kategorie,
                beschreibung: zeile?.Description?.value ?? null,
                achse,
                umgekehrt: umgekehrtFuer(globalId),
                typprofil: typprofilFuer(kategorie),
            }, regelwerk).concat(netzBefunde.get(localId) ?? []);
            netzBefunde.delete(localId);
            if (!befunde.length) continue;
            out.push({
                modelId, localId,
                globalId: zeile?.GlobalId?.value ?? null,
                kategorie,
                name: zeile?.Name?.value ?? '',
                befunde,
            });
        }

        // Die CDE-KANTEN durch dieselben Regeln — ein selbst gebautes
        // Rohr mit Gegengefälle verdient denselben Befund wie ein
        // geliefertes (Stufe 17.3).
        for (const [gid, k] of engine._cdeKanten ?? new Map()) {
            if (engine._verdeckt?.has(gid)) continue;
            const kantenId = `cde:${gid}`;
            const befunde = befundeFuer({
                globalId: gid,
                kategorie: k.kategorie ?? 'IFCPIPESEGMENT',
                achse: k,
                umgekehrt: umgekehrtFuer(gid),
                typprofil: typprofilFuer(k.kategorie ?? 'IFCPIPESEGMENT'),
            }, regelwerk).concat(netzBefunde.get(kantenId) ?? []);
            netzBefunde.delete(kantenId);
            if (!befunde.length) continue;
            out.push({
                modelId, localId: kantenId,
                globalId: gid, kategorie: k.kategorie ?? 'IFCPIPESEGMENT',
                name: k.name ?? '', befunde,
            });
        }

        // Was übrig bleibt, sind Bauteile ohne Achse — die Schächte
        // (gelieferte über die Quelle, selbst gesetzte über den Stand)
        // und die CDE-Kanten, deren Befunde die Schleife oben nicht sah.
        for (const [localId, befunde] of netzBefunde) {
            if (typeof localId === 'string' && localId.startsWith('cde:')) {
                const gid = localId.slice(4);
                const meta = engine._cdeKnoten?.get(gid) ?? engine._cdeKanten?.get(gid) ?? null;
                out.push({
                    modelId, localId,
                    globalId: gid,
                    kategorie: meta?.kategorie ?? 'IFCDISTRIBUTIONCHAMBERELEMENT',
                    name: meta?.name ?? '',
                    befunde,
                });
                continue;
            }
            const zeile = quelle?.zeile(localId) ?? null;
            const knotenMeta = engine._knoten?.get(modelId)?.get(localId) ?? null;
            if (knotenMeta?.globalId && engine._verdeckt?.has(knotenMeta.globalId)) continue;
            out.push({
                modelId, localId,
                globalId: zeile?.GlobalId?.value ?? null,
                kategorie: (zeile?.constructor?.name ?? '').toUpperCase(),
                name: zeile?.Name?.value ?? '',
                befunde,
            });
        }
    }

    // Das Schwerste zuerst — eine Liste, die man von oben abarbeitet.
    // Die Befunde der ABLEITUNGEN (Teil XIV): die Gegenprobe Körper gegen
    // Raster steht an ihrem DGM-Teil — abgeleitet im letzten Aufbau, nie
    // gespeichert. Ohne Aufbau gibt es keine, und das ist richtig so.
    const zeilenJeGid = new Map(out.filter(z => z.globalId).map(z => [z.globalId, z]));
    for (const [ableitungId, a] of engine.autor?.ableitungen ?? new Map()) {
        if (!a?.befunde?.length) continue;
        // Ein Befund, der ein BAUTEIL nennt (die Überdeckung je Rohr), steht an
        // dessen Zeile — vorher hingen acht Rohr-Befunde an einem DGM-Teil.
        const amDgm = [];
        for (const b of a.befunde) {
            const z = b?.globalId ? zeilenJeGid.get(b.globalId) : null;
            if (z) { z.befunde.push(b); continue; }
            if (b?.globalId && engine._beziehungen?.objekt?.(b.globalId)) {
                const o = engine._beziehungen.objekt(b.globalId);
                const neu = { modelId: o.ort?.modelId ?? CDE_MODELL_ID, localId: o.ort?.localId ?? `cde:${b.globalId}`,
                              globalId: b.globalId, kategorie: o.kategorie ?? '', name: o.name ?? '', befunde: [b] };
                out.push(neu); zeilenJeGid.set(b.globalId, neu);
                continue;
            }
            amDgm.push(b);
        }
        if (!amDgm.length) continue;
        const gid = a.teile?.dgm ?? Object.values(a.teile ?? {})[0] ?? ableitungId;
        out.push({
            modelId: CDE_MODELL_ID, localId: `cde:${gid}`, globalId: gid,
            kategorie: 'IFCGEOGRAPHICELEMENT', name: `Ableitung ${a.rezept ?? ''}`.trim(),
            befunde: amDgm,
        });
    }
    // AUS DEM BEZIEHUNGSINDEX (Teil XVII, B4): Überdeckung, Kreuzungs- und
    // Parallelabstand, Durchdringung, Schacht auf der Haltung — für alle
    // Bauteile, die der Index kennt, an ihre Zeile gehängt (oder als neue).
    // Abgeleitet aus dem letzten Aufbau; ohne Index gibt es keine.
    const idx = engine._beziehungen ?? null;
    if (idx) {
        const zeilen = new Map(out.filter(z => z.globalId).map(z => [z.globalId, z]));
        for (const [gid, befunde] of befundeAusBeziehungen(idx, regelwerk)) {
            if (!befunde.length || engine._verdeckt?.has(gid)) continue;
            const z = zeilen.get(gid);
            if (z) { z.befunde.push(...befunde); continue; }
            const o = idx.objekt(gid);
            if (!o) continue;
            const neu = {
                modelId: o.ort?.modelId ?? CDE_MODELL_ID,
                localId: o.ort?.localId ?? `cde:${gid}`,
                globalId: gid, kategorie: o.kategorie ?? '', name: o.name ?? '', befunde,
            };
            out.push(neu);
            zeilen.set(gid, neu);
        }
    }
    // KOLLISIONEN (G7): das Ergebnis der letzten Serverprüfung — am eigenen
    // Körper, mit dem gelieferten Partner beim Namen.
    const kollisionen = new Map();
    for (const k of engine._kollisionen ?? []) {
        if (!k.eigen) continue;
        if (!kollisionen.has(k.eigen)) kollisionen.set(k.eigen, []);
        kollisionen.get(k.eigen).push({
            regel: 'kollision', schwere: 'warnung',
            text: `Kollision mit ${k.partnerName || k.partnerKategorie?.replace(/^IFC/, '') || k.partner || 'Bauteil'} — ${k.volumen.toFixed(2)} m³ Überschneidung`,
            wert: k.volumen, quelle: 'Server-Kernel',
        });
    }
    for (const [gid, befunde] of kollisionen) {
        out.push({ modelId: CDE_MODELL_ID, localId: `cde:${gid}`, globalId: gid,
                   kategorie: 'IFCEARTHWORKSCUT', name: engine._cdeNameVon?.(gid) ?? 'eigener Körper', befunde });
    }
    return out.sort((a, b) =>
        (b.befunde.some(x => x.schwere === 'warnung') ? 1 : 0)
        - (a.befunde.some(x => x.schwere === 'warnung') ? 1 : 0)
        || b.befunde.length - a.befunde.length);
}
