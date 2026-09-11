/**
 * Der Ableitungslauf — ein Durchlauf, ein Cache (Teil XIV, G2).
 *
 * `baueErzeugte` baut den ganzen Stand; die Ableitungen darin lösen ihre
 * Quellen LAZY und rekursiv auf: eine Quelle, die selbst ein CDE-Teil ist,
 * wird beim ersten Bedarf gebaut — egal, an welcher Stelle der Liste sie
 * steht. Damit ist die Iterationsreihenfolge des Standes NIE tragend (das
 * Journal iteriert Art für Art, und `planeNachspielen` erst recht).
 *
 * Was der Lauf garantiert:
 *   - `leite` läuft EINMAL je Ableitung, auch wenn drei Teile daran hängen
 *     (Memo je `ableitung`-Kennung).
 *   - Ein Zyklus (A braucht B braucht A) ist ein Misserfolg mit Namen.
 *   - Fehler in `leite` machen KEIN halbes Ding: alle Teile der Ableitung
 *     fallen mit demselben Grund.
 *   - Ein Teil kann LEER sein (kein Auftrag beim reinen Gerinne) — das ist
 *     kein Fehler, das Bauteil entsteht einfach nicht, die Kennzahl sagt 0.
 *   - Der Cache stirbt mit dem Lauf. Ein überlebender Cache wäre stilles
 *     Veralten.
 *
 * DER ERDBAU-STAPEL (Stufe 1 des Aushub-Fachmodells, 2026-09-10): alle
 * Erdbau-Vorgänge (Gelände formen, Kanalgraben, Bauwerksgrube) fussen auf dem
 * GELIEFERTEN Gelände und werden in Vorgangsreihenfolge übereinander gefaltet.
 * Jeder Vorgang rechnet seinen Aushub zwischen „vorher" (das Gelände nach
 * allen Vorgängern) und „nachher" — so nimmt der zweite Cut nur, was noch da
 * ist, und die Summe der Vorgänge ist die Gesamtmasse. Vorher kettete sich
 * jede Ableitung an das geformte DGM der vorigen und brachte ihre eigene
 * Geländekopie mit: drei Vorgänge, drei TERRAIN, zwei davon verborgen.
 * Die Reihenfolge entscheidet der Planer (`vorgaenge` an der Anzeige-
 * Ableitung); was er nicht geordnet hat, folgt in Stand-Reihenfolge.
 */
import { formeNach } from '../gelaende/Operationen.js';
import { erdbauStapelVon, urGelaendeVon } from './Bezuege.js';

/**
 * @param {object} opts
 * @param {Map<string, object>} opts.stand   globalId → Bauplan (nachher) des ganzen erzeugt-Standes
 * @param {(id: string) => object|null} opts.rezeptNach
 * @param {(globalId, form, opts) => Promise<any|null>} opts.holeQuellForm  Form eines GELIEFERTEN Objekts
 * @param {(globalId) => Promise<string|null>} [opts.holeQuellBauform]
 *   Die BAUFORM eines gelieferten Bauteils — fürs Formpaar-Gate (`braucht`).
 *   Ohne sie bleibt das Gate für gelieferte Quellen ungeprüft und sagt es.
 * @param {object} opts.kernel
 * @param {number} [opts.hoehenversatz]
 */
export function neuerAbleitungslauf({ stand, rezeptNach, holeQuellForm, holeQuellBauform = null,
                                      kernel, hoehenversatz = 0 } = {}) {
    const memo = new Map();       // ableitungId → Promise<leite-Ergebnis>
    const memoPlan = new Map();   // ableitungId → JSON der Parameter des ersten Aufrufs
    const teilForm = new Map();   // globalId → {form, daten}
    const inArbeit = new Set();
    const ableitungen = new Map(); // ableitungId → {rezept, teile:{rolle: globalId}, leer:[], kennzahlen, befunde, warnungen}
    const misserfolge = [];
    /** Formpaare, die nicht geprüft werden konnten — sichtbar, nicht verschluckt. */
    const _ungeprueft = [];
    const stapelMemo = new Map();  // urGid → erdbauStapelVon(...)

    // ── Der Erdbau-Stapel ────────────────────────────────────────────────────

    /** Formt dieses Rezept das Gelände? (erdbau, kanalgraben, bauwerksgrube — nie die Anzeige) */
    function _istErdbau(rz) { return !!rz?.erdbau; }

    /** Das Ur-Gelände hinter einer Quelle — geliefert, oder die Wurzel einer Alt-Kette. */
    function urGidVon(gid) { return urGelaendeVon(stand, gid, { rezeptNach }); }

    /**
     * Die Erdbau-Vorgänge auf EINEM Ur-Gelände, geordnet — die Regel steht
     * in `erdbauStapelVon` (Bezuege.js), hier nur memoisiert je Lauf.
     * @returns {string[]} Ableitungs-Kennungen in Vorgangsreihenfolge
     */
    function stapelVon(urGid) {
        return _stapel(urGid).vorgaenge.map(v => v.ableitung);
    }
    function _stapel(urGid) {
        if (!stapelMemo.has(urGid)) stapelMemo.set(urGid, erdbauStapelVon(stand, urGid, { rezeptNach }));
        return stapelMemo.get(urGid);
    }
    /** Je Vorgänger seine Operationen (in Welt), in Stapelreihenfolge — die ersten `bis`. */
    async function _opsListen(urGid, bis) {
        const { vorgaenge } = _stapel(urGid);
        const listen = [];
        for (const v of vorgaenge.slice(0, Math.max(0, bis))) listen.push((await _leiten(v.bauplan))?.ops ?? []);
        return listen;
    }

    /** Die Operationen aller Vorgänger, flach — die bisherige Schnittstelle, jetzt über `_opsListen`. */
    async function opsVor(ableitungId, urGid, { alle = false } = {}) {
        const { vorgaenge } = _stapel(urGid);
        const bis = alle ? vorgaenge.length : vorgaenge.findIndex(v => v.ableitung === ableitungId);
        return (await _opsListen(urGid, Math.max(0, bis))).flat();
    }

    /**
     * DER PRÄFIX-CACHE (Teil XX): seit jede Anwendung ein eigener Vorgang
     * ist, wächst der Stapel schnell — und jeder Vorgang faltete ALLE seine
     * Vorgänger neu (O(n²) Faltungen, der Auffüllungs-Nachweis sogar O(n³)).
     * Hier wird je Ausgangsraster (grob, feiner Korridor) und Ur der Stand
     * nach k Vorgängen genau EINMAL je Lauf gerechnet. Vorgang für Vorgang
     * gefaltet ist dasselbe wie alles in einem `formeNach`: jede Operation
     * rechnet ihren Bereich ohnehin am Stand davor.
     */
    const praefixe = new WeakMap();   // Ausgangsraster → Map(urGid → [Stand nach 0, 1, … Vorgängen])
    function _gefaltet(raster, urGid, listen, bis) {
        let je = praefixe.get(raster);
        if (!je) { je = new Map(); praefixe.set(raster, je); }
        let stufen = je.get(urGid);
        if (!stufen) { stufen = [raster]; je.set(urGid, stufen); }
        for (let k = stufen.length; k <= bis; k++) {
            const ops = listen[k - 1] ?? [];
            stufen.push(ops.length ? formeNach(stufen[k - 1], ops, { ur: raster }).raster : stufen[k - 1]);
        }
        return stufen[bis];
    }

    /**
     * Wie viel eines Aushubs lag ÜBER dem Ur-Gelände — war also Auftrag eines
     * früheren Vorgangs? Und welcher Vorgänge? (Stufe 2, Entscheidung 3.)
     *
     * Dieselbe Zellformel wie `massenAus` (Mittel der vier Knoten × Zellfläche):
     * die Kennzahl steht neben `aushubRaster` und muss sich an ihm messen
     * lassen. Je Knoten: entfernt über dem Ur = vorher − max(nachher, ur).
     * Zugeordnet wird an DENSELBEN Knoten: ein Vorgänger zählt, wenn er genau
     * dort aufgefüllt hat — nicht, weil sein Umriss in der Nähe liegt.
     */
    async function _durchAuffuellung({ ur: urGid, ableitung }, vorher, ops, urRaster) {
        const nachher = formeNach(vorher, ops, { ur: urRaster }).raster;
        const { nx, nz, cell } = vorher;
        const ueber = new Float64Array(nx * nz);
        const knoten = [];
        for (let i = 0; i < ueber.length; i++) {
            const v = vorher.heights[i], n = nachher.heights[i], u = urRaster.heights[i];
            if (!Number.isFinite(v) || !Number.isFinite(n) || !Number.isFinite(u)) { ueber[i] = NaN; continue; }
            ueber[i] = Math.max(0, v - Math.max(n, u));
            if (ueber[i] > 1e-9) knoten.push(i);
        }
        if (!knoten.length) return { volumen: 0, vorgaenge: [] };
        let volumen = 0;
        for (let ix = 0; ix + 1 < nx; ix++) {
            for (let iz = 0; iz + 1 < nz; iz++) {
                let summe = 0;
                let gueltig = true;
                for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
                    const w = ueber[(ix + dx) * nz + (iz + dz)];
                    if (!Number.isFinite(w)) { gueltig = false; break; }
                    summe += w;
                }
                if (gueltig) volumen += (summe / 4) * cell * cell;
            }
        }
        const { vorgaenge } = _stapel(urGid);
        const bis = vorgaenge.findIndex(v => v.ableitung === ableitung);
        const listen = await _opsListen(urGid, Math.max(0, bis));
        const treffer = [];
        let davor = urRaster;
        for (let k = 0; k < listen.length; k++) {
            const danach = _gefaltet(urRaster, urGid, listen, k + 1);
            if (knoten.some(i => danach.heights[i] - davor.heights[i] > 1e-9)) treffer.push(vorgaenge[k].ableitung);
            davor = danach;
        }
        return { volumen, vorgaenge: treffer };
    }

    function _eintrag(ableitungId, rezeptId) {
        if (!ableitungen.has(ableitungId)) {
            ableitungen.set(ableitungId, { rezept: rezeptId, teile: {}, leer: [], kennzahlen: {}, befunde: [], warnungen: [] });
        }
        return ableitungen.get(ableitungId);
    }

    async function _leiten(bauplan) {
        const id = bauplan.ableitung ?? `einzel:${bauplan.rolle ?? ''}`;
        const parameterJson = JSON.stringify(bauplan.parameter ?? {});
        if (memo.has(id)) {
            if (memoPlan.get(id) !== parameterJson) {
                _eintrag(id, bauplan.rezept).befunde.push({
                    regel: 'ableitung_uneinheitlich', schwere: 'warnung',
                    text: `Die Teile der Ableitung ${id} tragen verschiedene Parameter — gebaut wird der zuerst gelesene Stand.`,
                });
            }
            return memo.get(id);
        }
        memoPlan.set(id, parameterJson);
        const versprechen = (async () => {
            const rezept = rezeptNach(bauplan.rezept);
            if (typeof rezept?.leite !== 'function') throw new Error(`Rezept „${bauplan.rezept}" ist keine Ableitung`);
            const quellen = {};
            const genanntRoh = bauplan.parameter?.quellen ?? {};
            // ERDBAU FUSST AUF DEM UR-GELÄNDE (Stufe 1): nennt der Bauplan eine
            // Anzeigeform oder ein Alt-DGM als Gelände, wird die Wurzel aufgelöst.
            // Das Rezept sieht dann das gelieferte Gelände — nach allen
            // Vorgängern gefaltet (unten), nie die Kopie eines anderen Vorgangs.
            const erdbauArtig = _istErdbau(rezept) || rezept.id === 'anzeige';
            const urGid = erdbauArtig && genanntRoh.gelaende ? urGidVon(genanntRoh.gelaende) : null;
            const genannt = urGid ? { ...genanntRoh, gelaende: urGid } : genanntRoh;
            for (const [schlitz, roh] of Object.entries(genannt)) {
              // Ein Schlitz darf eine LISTE tragen (B3: `rohre`, `schaechte`) —
              // jede Quelle läuft durch dasselbe Gate und dieselbe Auflösung;
              // das Rezept bekommt dann eine Liste.
              const liste = Array.isArray(roh);
              const daten = [];
              for (const gid of (liste ? roh : [roh])) {
                // ── DAS FORMPAAR-GATE ────────────────────────────────────
                // `braucht: {gelaende: ['hoehenfeld']}` stand seit Teil XIV in
                // jedem Ableitungsrezept und wurde von NIEMANDEM gelesen: der
                // „eigentliche Explosionsschutz" existierte nur als Kommentar.
                // Ohne ihn läuft ein Kanalgraben klaglos gegen eine Stützwand
                // als „Gelände" — er rechnet dann irgendetwas, statt zu sagen,
                // warum es nicht geht.
                //
                // Geprüft wird VOR dem Auflösen der Form, und getrennt davon:
                // `_formOderGrund` ist ein reiner Form-Auflöser und wird auch
                // ohne Schlitzbezug gerufen (`formVon`) — dort kennt niemand
                // ein `braucht`.
                await _pruefeFormpaar(rezept, schlitz, gid);
                const form = rezept.formen?.[schlitz] ?? 'mesh';
                const { daten: d, grund } = await _formOderGrund(gid, form, { cell: bauplan.parameter?.raster?.cell ?? null });
                // Der GRUND wandert mit nach aussen — sonst hiesse ein Zyklus
                // am Ende nur „nicht ableitbar", und niemand fände ihn.
                if (!d) throw new Error(`Quelle „${gid}" (${schlitz}) nicht ableitbar${grund ? ` — ${grund}` : ''}`);
                daten.push(d);
              }
              quellen[schlitz] = liste ? daten : daten[0];
            }
            // DER STAPEL: das Gelände, das dieses Rezept sieht, ist das Ur-Gelände
            // nach allen VORGÄNGERN. Die Anzeige sieht es nach ALLEN Vorgängen.
            let stapel = null;
            if (urGid && quellen.gelaende) {
                const { vorgaenge } = _stapel(urGid);
                const bis = rezept.id === 'anzeige' ? vorgaenge.length : vorgaenge.findIndex(v => v.ableitung === id);
                const listen = await _opsListen(urGid, Math.max(0, bis));
                const vor = listen.flat();
                const urRaster = quellen.gelaende;
                quellen.gelaende = _gefaltet(urRaster, urGid, listen, listen.length);
                stapel = {
                    ur: urGid, urRaster, ableitung: id, opsVor: vor,
                    reihe: Math.max(0, stapelVon(urGid).indexOf(id)),
                    // Dieselbe Faltung für ein anderes Raster derselben Quelle —
                    // der feine Korridor braucht die Vorgänger genauso (eigener Präfix-Cache).
                    vorherVon: (r) => (r ? _gefaltet(r, urGid, listen, listen.length) : r),
                };
            }
            // ZUSATZQUELLEN (Teil XVII, B3): ein Rezept darf NACH den Hauptquellen
            // weitere Formen derselben Kennungen verlangen — mit Wissen um die
            // anderen Quellen (der Kanalgraben schneidet sich ein feines Raster
            // im Korridor der Rohre zu). Kein Vorrat: nur, wenn das Rezept fragt.
            if (typeof rezept.zusatzQuellen === 'function') {
                const zusatz = rezept.zusatzQuellen(bauplan.parameter, quellen, genannt) ?? {};
                for (const [name, z] of Object.entries(zusatz)) {
                    if (!z?.gid || !z?.form) continue;
                    const { daten, grund } = await _formOderGrund(z.gid, z.form, { cell: bauplan.parameter?.raster?.cell ?? null, ...(z.opts ?? {}) });
                    if (!daten) { _ungeprueft.push(`Zusatzquelle „${name}" (${z.gid}) nicht ableitbar${grund ? ` — ${grund}` : ''}`); continue; }
                    quellen[name] = daten;
                }
            }
            const erg = await rezept.leite(bauplan.parameter, quellen, { kernel, hoehenversatz, stapel });
            // DURCH EINE AUFFÜLLUNG GESCHNITTEN (Stufe 2, Fabios Entscheidung 3):
            // der Wirt eines Cuts bleibt IMMER das Ur-Gelände. Schneidet er durch
            // den Auftrag eines früheren Vorgangs, sagen das eine Kennzahl (wie
            // viel davon über dem Ur lag) und die Liste dieser Vorgänge — keine
            // zweite Wirt-Beziehung, kein Fill als Wirt.
            if (stapel && _istErdbau(rezept) && erg?.ops?.length) {
                // Auf DEMSELBEN Raster wie `aushubRaster`: dem feinen Korridor,
                // wenn das Rezept einen bekam — roh ist er das Ur in feiner
                // Auflösung. Sonst stünden zwei Kennzahlen aus zwei Rastern
                // nebeneinander, und ihre Differenz hiesse nichts.
                const fein = quellen.gelaendeFein ?? null;
                const auff = fein
                    ? await _durchAuffuellung(stapel, stapel.vorherVon(fein), erg.ops, fein)
                    : await _durchAuffuellung(stapel, quellen.gelaende, erg.ops, stapel.urRaster);
                erg.kennzahlen = { ...(erg.kennzahlen ?? {}),
                                   aushubAusAuffuellung: auff.volumen, schneidetAuffuellung: auff.vorgaenge };
            }
            // DER EINTRAG entsteht HIER, nicht erst in `baue`: eine Ableitung,
            // die nur als Vorgänger im Stapel gefaltet wurde (Stufe 1), hat
            // trotzdem Kennzahlen und Befunde — der Mengenreiter und der Export
            // fragen danach, ohne je ihr Teil gebaut zu haben.
            const eintrag = _eintrag(id, bauplan.rezept);
            eintrag.kennzahlen = erg.kennzahlen ?? {};
            eintrag.befunde = [...(eintrag.befunde ?? []), ...(erg.befunde ?? [])]
                .filter((b, i, a) => a.findIndex(x => x.regel === b.regel && x.text === b.text) === i);
            // Ungeprüfte Formpaare wandern als WARNUNG mit: „Gate lief nicht"
            // ist etwas anderes als „Gate war zufrieden", und der Unterschied
            // muss sichtbar sein, sonst hat man ein Gate, das man nicht sieht.
            eintrag.warnungen = [...new Set([
                ...(eintrag.warnungen ?? []), ...(erg.warnungen ?? []), ..._ungeprueft,
            ])];
            if (erg.bild) eintrag.bild = erg.bild;         // das Planbild (G5), nie im Journal
            return erg;
        })();
        memo.set(id, versprechen);
        return versprechen;
    }

    /**
     * Passt die BAUFORM dieser Quelle zu dem, was das Rezept braucht?
     *
     * Wirft mit benanntem Grund, wenn nicht — der Wurf landet über den
     * `catch` in `baue` in den Misserfolgen und von dort in der Rückmeldung,
     * dieselbe Bahn wie „Zyklus".
     *
     * ZWEI FÄLLE VON „WEISS NICHT", die verschieden behandelt werden müssen:
     * ein Rezept ohne `braucht`-Eintrag für diesen Schlitz erklärt nichts und
     * wird nicht geprüft. Eine Quelle, deren Bauform sich nicht ermitteln
     * lässt, darf dagegen nicht durchfallen — sonst wäre jede CDE-Quelle ohne
     * Bauform ein Fehler. Sie geht durch, aber MIT Vermerk: stillschweigend
     * durchzulassen hiesse, ein Gate zu haben, das man nicht sieht.
     */
    async function _pruefeFormpaar(rezept, schlitz, globalId) {
        const erlaubt = rezept?.braucht?.[schlitz];
        if (!Array.isArray(erlaubt) || !erlaubt.length) return;
        const ist = await _bauformVon(globalId);
        if (!ist) {
            _ungeprueft.push(`Bauform von „${globalId}" (${schlitz}) unbekannt — Formpaar ungeprüft`);
            return;
        }
        if (erlaubt.includes(ist)) return;
        throw new Error(`Quelle „${globalId}" (${schlitz}) ist ${ist} — gebraucht wird ${erlaubt.join(' oder ')}`);
    }

    /**
     * Die Bauform einer Quelle.
     *
     * CDE-Teile tragen sie im Rezept (bei Ableitungen am TEIL, sonst am
     * Rezept selbst) — frei und deklarativ. Für GELIEFERTE Bauteile kommt sie
     * von aussen: `holeQuellBauform` beantwortet sie aus derselben
     * `deklarierteBauform`-Quelle, die auch der Sampler und die Toolbox
     * fragen. Zwei Rechnungen sagten sonst irgendwann Verschiedenes — und der
     * Nutzer sähe „Gelände" im Formular und „kein Gelände" im Lauf.
     */
    async function _bauformVon(globalId) {
        if (stand.has(globalId)) {
            const plan = stand.get(globalId);
            const rz = rezeptNach(plan?.rezept);
            if (plan?.rolle && Array.isArray(rz?.teile)) {
                const teil = rz.teile.find(t => t.rolle === plan.rolle);
                if (teil?.bauform) return teil.bauform;
            }
            return rz?.bauform ?? plan?.bauform ?? null;
        }
        if (typeof holeQuellBauform !== 'function') return null;
        try { return (await holeQuellBauform(globalId)) ?? null; } catch { return null; }
    }

    /**
     * Die Kernel-Form eines Objekts: CDE-Teil → aus dem Lauf, Geliefertes →
     * aus der Quelle. `null`, wenn nicht ableitbar (der Aufrufer meldet).
     */
    async function _formOderGrund(globalId, form, opts = {}) {
        if (stand.has(globalId)) {
            const plan = stand.get(globalId);
            const rz = rezeptNach(plan?.rezept);
            if (rz && typeof rz.leite !== 'function') {
                // Ein EINFACHES Rezept (Rohr, Schacht) ist keine Ableitung: seine
                // Form kommt aus den Bauplan-Parametern, nicht aus einem Lauf
                // (G6 — der Kanalgraben liest die Achse eines eigenen Rohrs).
                const daten = typeof rz.formAus === 'function'
                    ? (rz.formAus(plan.parameter ?? {}, form, plan) ?? null) : null;
                return { daten, grund: daten ? null : `Rezept „${plan?.rezept}" liefert keine Form „${form}"` };
            }
            const r = await baue(globalId);
            if (!r.ok) return { daten: null, grund: r.fehler.join(' · ') };
            if (r.leer) return { daten: null, grund: 'das Teil ist leer' };
            if (r.teil.form === form) return { daten: r.teil.daten, grund: null };
            if (form === 'mesh' && r.teil.form === 'koerper') return { daten: r.teil.daten, grund: null };
            return { daten: null, grund: `liefert ${r.teil.form}, gebraucht wird ${form}` };
        }
        const daten = await holeQuellForm(globalId, form, opts);
        return { daten: daten ?? null, grund: daten ? null : 'nicht im Modell' };
    }

    async function formVon(globalId, form, opts = {}) {
        return (await _formOderGrund(globalId, form, opts)).daten;
    }

    /**
     * @returns {Promise<{ok: true, teil, kennzahlen, befunde, warnungen} |
     *                   {ok: true, leer: true, kennzahlen} | {ok: false, fehler: string[]}>}
     */
    async function baue(globalId) {
        if (teilForm.has(globalId)) return { ok: true, teil: teilForm.get(globalId), kennzahlen: {}, befunde: [], warnungen: [] };
        const bauplan = stand.get(globalId);
        if (!bauplan) return { ok: false, fehler: [`„${globalId}" steht nicht im Stand`] };
        if (inArbeit.has(globalId)) {
            const kette = [...inArbeit, globalId].join(' → ');
            const fehler = `zyklus: ${kette}`;
            misserfolge.push({ globalId, grund: fehler });
            return { ok: false, fehler: [fehler] };
        }
        inArbeit.add(globalId);
        try {
            const erg = await _leiten(bauplan);
            const eintrag = _eintrag(bauplan.ableitung ?? `einzel:${bauplan.rolle ?? ''}`, bauplan.rezept);
            const teil = erg.teile?.[bauplan.rolle] ?? null;
            if (!teil) {
                if (!eintrag.leer.includes(bauplan.rolle)) eintrag.leer.push(bauplan.rolle);
                return { ok: true, leer: true, kennzahlen: erg.kennzahlen ?? {} };
            }
            eintrag.teile[bauplan.rolle] = globalId;
            teilForm.set(globalId, teil);
            return { ok: true, teil, kennzahlen: erg.kennzahlen ?? {}, befunde: erg.befunde ?? [], warnungen: erg.warnungen ?? [] };
        } catch (fehler) {
            const grund = fehler?.message ?? String(fehler);
            misserfolge.push({ globalId, grund });
            return { ok: false, fehler: [grund] };
        } finally {
            inArbeit.delete(globalId);
        }
    }

    return { baue, formVon, ableitungen, misserfolge, stapelVon, urGidVon, opsVor };
}
