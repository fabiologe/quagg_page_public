/**
 * Der Geometrie-Kernel — EIN Vertrag, drei Backends (Teil XIV, G1).
 *
 * Zehn Disziplinen der Infrastrukturplanung teilen sich ein Dutzend
 * Grundoperationen (Teil XIV, §1). Dieser Katalog benennt sie DEKLARATIV:
 * welche Form in welchem Schlitz, welche Form heraus, wo gerechnet wird.
 * Ein Rezept (Ableitung) ruft `kernel.op(name, eingaben, parameter)` — und
 * weiss nichts davon, ob die Rechnung inline, im Worker oder auf dem Server
 * läuft. Das ist der Hybrid-Beschluss (Fabio, 02.09.): 2,5D im Client,
 * echte 3D-Booleans als CDE-eigener Server-Dienst.
 *
 * ZWEI SORTEN VON NEIN, sauber getrennt (Gesetz 10):
 *   - fachlich nicht ableitbar (leeres Raster, nirgends dicker als eps) →
 *     `{ergebnis: null, warnungen: [...]}` — nie ein Wurf.
 *   - Vertragsbruch (Op unbekannt, falsche Form im Schlitz, Pflichtparameter
 *     fehlt) → `throw` — ein Programmierfehler, den ein Test fangen soll.
 *   - Backend nicht da (Server nicht verbunden, Op noch nicht gebaut) →
 *     `kann(name)` sagt es MIT GRUND, `op` gibt null + Warnung zurück.
 *
 * Der Katalog nennt auch, was noch nicht gebaut ist (`stufe`) — die Sperre
 * mit Grund ist besser als ein Loch im Vertrag.
 */
import { pruefeForm } from './Formen.js';
import { rasterAusMesh, rasterResample, rasterDifferenz } from './ops/Raster.js';
import { koerperZwischenRastern } from './ops/Koerper.js';
import { grabenkoerper } from './ops/Graben.js';
import { drape, offset, isolinie } from './ops/Linien.js';
import { sweep, extrudiere } from './ops/Sweep.js';

export const OPS = Object.freeze({
    rasterAusMesh:          { eingaben: { mesh: 'mesh' },                     ausgabe: 'raster',  ort: 'client', kosten: 'mittel', pflicht: ['cell'] },
    rasterResample:         { eingaben: { raster: 'raster' },                 ausgabe: 'raster',  ort: 'client', kosten: 'klein',  pflicht: ['bezug'] },
    rasterDifferenz:        { eingaben: { a: 'raster', b: 'raster' },         ausgabe: 'raster',  ort: 'client', kosten: 'klein' },
    koerperZwischenRastern: { eingaben: { oben: 'raster', unten: 'raster' },  ausgabe: 'koerper', ort: 'client', kosten: 'mittel' },
    grabenkoerper:          { eingaben: { raster: 'raster' },                 ausgabe: 'koerper', ort: 'client', kosten: 'mittel', pflicht: ['stationen'] },
    isolinie:               { eingaben: { raster: 'raster' },                 ausgabe: 'linien',  ort: 'client', kosten: 'mittel' },
    drape:                  { eingaben: { linie: 'linie', raster: 'raster' }, ausgabe: 'linie',   ort: 'client', kosten: 'klein' },
    offset:                 { eingaben: { linie: 'linie' },                   ausgabe: 'umriss',  ort: 'client', kosten: 'klein',  pflicht: ['abstand'] },
    extrudiere:             { eingaben: { umriss: 'umriss' },                 ausgabe: 'koerper', ort: 'client', kosten: 'klein',  pflicht: ['von', 'bis'] },
    sweep:                  { eingaben: { profil: 'profil', achse: 'linie' }, ausgabe: 'koerper', ort: 'client', kosten: 'klein' },
    cdt:                    { eingaben: { punkte: 'punkte', bruchkanten: 'linien' }, ausgabe: 'mesh', ort: 'client', kosten: 'gross', stufe: 'G8' },
    booleDifferenz:         { eingaben: { a: 'koerper', b: 'koerper' },       ausgabe: 'koerper', ort: 'server', stufe: 'G7' },
    booleVereinigung:       { eingaben: { a: 'koerper', b: 'koerper' },       ausgabe: 'koerper', ort: 'server', stufe: 'G7' },
    booleSchnitt:           { eingaben: { a: 'koerper', b: 'koerper' },       ausgabe: 'koerper', ort: 'server', stufe: 'G7' },
    kollisionen:            { eingaben: { koerper: 'koerper[]' },             ausgabe: 'paare',   ort: 'server', stufe: 'G7' },
    huelle:                 { eingaben: { mesh: 'mesh' },                     ausgabe: 'koerper', ort: 'server', stufe: 'G7' },
});

/** Was im Client heute WIRKLICH rechnet. Neue Ops hier anmelden — sonst nirgends. */
const CLIENT_OPS = Object.freeze({
    rasterAusMesh, rasterResample, rasterDifferenz, koerperZwischenRastern, grabenkoerper,
    drape, offset, isolinie,
    sweep, extrudiere,
});

/** Ab dieser Zahl Werte (Höhen oder Koordinaten) geht eine mittlere Op in den Worker. */
export const WORKER_SCHWELLE = 200000;

function _groesse(eingaben) {
    let n = 0;
    for (const v of Object.values(eingaben ?? {})) {
        if (ArrayBuffer.isView(v?.heights)) n += v.heights.length;
        if (ArrayBuffer.isView(v?.positions)) n += v.positions.length;
    }
    return n;
}

const jetzt = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * @param {object} [backends]
 * @param {{op(name, eingaben, parameter): Promise<{ergebnis, warnungen}>}|null} [backends.worker]
 * @param {{kann(name): {ok, grund?}, op(name, eingaben, parameter): Promise<{ergebnis, warnungen}>}|null} [backends.server]
 */
export function erzeugeKernel({ worker = null, server = null } = {}) {
    // Ein Worker, der einmal ausfällt (fehlender Chunk, abgestürzt, Timeout),
    // wird für diesen Kernel abgemeldet: die Rechnung läuft inline weiter und
    // sagt es — Gesetz 10, laut statt tot. Kein zweiter Anlauf je Aufruf.
    let workerTot = false;

    function kann(name) {
        const def = OPS[name];
        if (!def) return { ok: false, grund: `Operation „${name}" ist unbekannt.` };
        if (def.ort === 'server') {
            if (!server) return { ok: false, grund: `„${name}" rechnet auf dem Server — kein Server-Kernel verbunden.` };
            return server.kann?.(name) ?? { ok: true };
        }
        if (!CLIENT_OPS[name]) return { ok: false, grund: `„${name}" ist noch nicht gebaut (Stufe ${def.stufe ?? '?'}).` };
        return { ok: true };
    }

    async function op(name, eingaben = {}, parameter = {}) {
        const def = OPS[name];
        if (!def) throw new Error(`kernel: op_unbekannt: ${name}`);
        for (const [schlitz, form] of Object.entries(def.eingaben)) {
            // Eine LISTE, wo ein Einzelner deklariert ist (booleDifferenz b = alle
            // Rohre eines Strangs): geprüft als Liste — der Server kettet sie
            // in-process, statt je Rohr eine Rundreise zu machen (B3-Nachprüfung).
            const wert = eingaben[schlitz];
            const formHier = (Array.isArray(wert) && !String(form).endsWith('[]')) ? `${form}[]` : form;
            const fehler = pruefeForm(wert, formHier);
            if (fehler.length) throw new Error(`kernel: form_ungueltig: ${name}.${schlitz} (${form}) — ${fehler.join('; ')}`);
        }
        for (const p of def.pflicht ?? []) {
            if (parameter[p] === undefined || parameter[p] === null) {
                throw new Error(`kernel: parameter_fehlt: ${name} braucht „${p}"`);
            }
        }
        // Ein Server-Backend wird EINMAL nach seinen Fähigkeiten gefragt —
        // vorher kann `kann` nur „noch nicht befragt" sagen.
        if (def.ort === 'server' && typeof server?.bereit === 'function') await server.bereit();
        const frei = kann(name);
        const start = jetzt();
        const fertig = (backend, r) => ({
            ergebnis: r?.ergebnis ?? null,
            warnungen: r?.warnungen ?? [],
            provenienz: { op: name, backend, dauerMs: Math.round(jetzt() - start) },
        });
        if (!frei.ok) return fertig('keins', { ergebnis: null, warnungen: [frei.grund] });

        if (def.ort === 'server') return fertig('server', await server.op(name, eingaben, parameter));
        // Grosses geht immer in den Worker, Mittleres ab der Schwelle — damit
        // ein grosses DGM den Hauptthread beim Neuaufbau nicht blockiert.
        const inWorker = worker && !workerTot && (def.kosten === 'gross'
            || (def.kosten === 'mittel' && _groesse(eingaben) > WORKER_SCHWELLE));
        if (inWorker) {
            try {
                return fertig('worker', await worker.op(name, eingaben, parameter));
            } catch (e) {
                workerTot = true;
                worker.beenden?.();
                const r = CLIENT_OPS[name](eingaben, parameter);
                return fertig('client', {
                    ergebnis: r?.ergebnis ?? null,
                    warnungen: [`worker_ausgefallen: ${e?.message ?? e} — inline gerechnet`, ...(r?.warnungen ?? [])],
                });
            }
        }
        return fertig('client', CLIENT_OPS[name](eingaben, parameter));
    }

    return { op, kann, OPS, bereit: async () => (typeof server?.bereit === 'function' ? server.bereit() : false) };
}
