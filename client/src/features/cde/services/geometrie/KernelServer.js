/**
 * Das Server-Backend des Kernels (Teil XIV, G7).
 *
 * Derselbe Vertrag wie Worker und Inline: `op(name, eingaben, parameter)` →
 * `{ergebnis, warnungen}`, dazu `kann(name)` mit GRUND. Der Server wird
 * EINMAL nach seinen Fähigkeiten gefragt (`bereit()`); bis dahin und ohne
 * Antwort sind Server-Operationen gesperrt — mit Grund, nie tot.
 *
 * Der Transport kommt injiziert (`sende`, `hole`): dieser Ordner importiert
 * nichts aus `@/` (Wächter keineFremdimporte). Fachliche Ablehnungen des
 * Servers (413/422/504) sind KEIN Wurf: Ergebnis null, der Grund steht in den
 * Warnungen — wie bei jeder Nicht-Ableitbarkeit im Kernel.
 */
import { packeMeshpaket, entpackeMeshpaket, koerperAusAntwort } from './Meshpaket.js';

/** Welche Form je Schlitz ins Paket geht — je Server-Op. */
export const SERVER_FORMEN = Object.freeze({
    booleDifferenz:   { a: 'koerper', b: 'koerper' },
    booleVereinigung: { a: 'koerper', b: 'koerper' },
    booleSchnitt:     { a: 'koerper', b: 'koerper' },
    kollisionen:      { koerper: 'koerper[]' },
    huelle:           { mesh: 'mesh' },
});

/**
 * @param {object} opts
 * @param {(pfad: string, puffer: ArrayBuffer) => Promise<ArrayBuffer>} opts.sende   POST octet-stream, Antwort als ArrayBuffer
 * @param {(pfad: string) => Promise<object>} opts.hole                            GET JSON
 * @param {string} [opts.basis]                                                    Pfadpräfix, Vorgabe '/geometrie'
 */
export function erzeugeServerBackend({ sende, hole, basis = '/geometrie' } = {}) {
    if (typeof sende !== 'function' || typeof hole !== 'function') return null;
    let faehigkeiten = null;      // Antwort des Servers
    let grund = 'Server-Kernel noch nicht befragt';
    let lauf = null;

    async function bereit() {
        if (faehigkeiten) return true;
        if (!lauf) {
            lauf = (async () => {
                try {
                    const f = await hole(`${basis}/faehigkeiten`);
                    if (!Array.isArray(f?.ops)) throw new Error('keine Fähigkeitenliste');
                    faehigkeiten = f;
                    grund = null;
                } catch (e) {
                    faehigkeiten = null;
                    grund = `Server-Kernel nicht erreichbar (${e?.message ?? e})`;
                } finally {
                    lauf = null;
                }
                return !!faehigkeiten;
            })();
        }
        return lauf;
    }

    function kann(name) {
        if (!faehigkeiten) return { ok: false, grund };
        if (!faehigkeiten.ops.includes(name)) return { ok: false, grund: `Der Server kennt „${name}" nicht` };
        return { ok: true };
    }

    function _dreiecke(eingaben, formen) {
        let n = 0;
        for (const [schlitz, wert] of Object.entries(eingaben ?? {})) {
            const deklariert = formen[schlitz] ?? 'koerper';
            // Eine Liste an einem Einzel-Schlitz (booleDifferenz b) reist als Liste.
            const form = (Array.isArray(wert) && !String(deklariert).endsWith('[]')) ? `${deklariert}[]` : deklariert;
            const liste = form.endsWith('[]') ? (wert ?? []) : [wert];
            for (const w of liste) n += Number(w?.triCount) || 0;
        }
        return n;
    }

    async function op(name, eingaben = {}, parameter = {}) {
        await bereit();
        const frei = kann(name);
        if (!frei.ok) return { ergebnis: null, warnungen: [frei.grund] };
        const formen = SERVER_FORMEN[name] ?? {};
        const max = faehigkeiten?.limits?.maxDreiecke;
        const n = _dreiecke(eingaben, formen);
        if (max && n > max) return { ergebnis: null, warnungen: [`server_zu_gross: ${n} Dreiecke über ${max}`] };
        let antwort;
        try {
            antwort = await sende(`${basis}/op`, packeMeshpaket({ op: name, parameter, eingaben, formen }));
        } catch (e) {
            const status = e?.response?.status ?? e?.status;
            // Die Antwort kommt als ArrayBuffer (octet-stream) — der Fehltext des
            // Servers steckt darin als JSON. Ohne Dekodieren hiesse jeder 422 nur
            // „Request failed with status code 422" (Kanalgraben-Lauf 2026-09-09).
            let daten = e?.response?.data;
            if (daten instanceof ArrayBuffer || ArrayBuffer.isView?.(daten)) {
                try { daten = JSON.parse(new TextDecoder().decode(daten)); } catch { daten = null; }
            }
            const detail = daten?.detail ?? e?.detail ?? e?.message ?? String(e);
            return { ergebnis: null, warnungen: [status ? `server_${status}: ${detail}` : `server_nicht_erreichbar: ${detail}`] };
        }
        let kopf, bloecke;
        try {
            ({ kopf, bloecke } = entpackeMeshpaket(antwort));
        } catch (e) {
            return { ergebnis: null, warnungen: [`server_antwort_unlesbar: ${e?.message ?? e}`] };
        }
        const warnungen = [...(kopf.warnungen ?? [])];
        if (kopf.ergebnis?.form === 'paare') return { ergebnis: kopf.ergebnis.paare ?? [], warnungen };
        const koerper = koerperAusAntwort(kopf, bloecke);
        if (!koerper) return { ergebnis: null, warnungen: warnungen.length ? warnungen : ['server: kein Ergebnis'] };
        return { ergebnis: koerper, warnungen };
    }

    return { op, kann, bereit, faehigkeiten: () => faehigkeiten };
}
