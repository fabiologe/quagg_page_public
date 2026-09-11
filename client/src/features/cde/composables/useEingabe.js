/**
 * useEingabe — DER Eingabe-Motor (Teil XVI, S3; angekündigt als Stufe 12.3).
 *
 * Verallgemeinert `useZeichnen`: ein Werkzeug deklariert SCHLITZE (Subjekt,
 * Zug, Umriss) und GESTEN an Feldern (Punkt auf der Achse, Auswahl eines
 * Bauteils); der Motor sammelt, was der Mensch zeigt, und füllt damit den
 * Zug oder ein Feld. `anwenden` bleibt der eine Vertrag — es bekommt am
 * Ende dieselben Werte und denselben Zug wie bisher.
 *
 * ZUSTAND IM STORE, VERHALTEN HIER. Der Zug, der Zeiger, die Phase und die
 * Geste liegen in `bearbeitung.eingabe`. Deshalb darf es ZWEI Instanzen
 * geben — eine im Lageplan, eine im Raum — und beide sehen denselben Zug:
 * Punkt 1 im Plan, Punkt 2 im Raum, ein Bauteil. Zwei Punktelisten wären
 * zwei Züge gewesen.
 *
 * PHASEN: aus → sammeln (Punkte setzen, Vorschau läuft mit) → prüfen (Zug
 * geschlossen, Formular offen) → anwenden. Die Enter-Regel steht in
 * `Eingaben.js` — ein Weg, für Plan und Raum.
 *
 * NICHTS WIRD GESCHRIEBEN, BIS ABGESCHLOSSEN IST (Erbe von useZeichnen):
 * ein Eintrag je Klick füllte das Journal mit halben Linien.
 */

import { computed, ref, watch } from 'vue';
import { nachId, eingabeArt } from '../services/Bearbeitungen.js';
import { pruefeBauplan } from '../services/Bauteilrezepte.js';
import { eingabenFuer, enterRegel, naechsterSchritt, schliesstUmriss } from '../services/Eingaben.js';
import { stationAuf } from '../services/Fangpunkte.js';

/** Fang auf Schachtmitten beim Zug (Anschliessen): derselbe Radius wie in `anwenden`. */
const FANG_SCHACHT_M = 10;

export function useEingabe({ bearbeitung, cde, getModellSha, nachBauen,
                             getHoehenversatz, getHoeheAn = null, bereiteHoehenVor = null } = {}) {
    let hoehenBereit = null;
    /** Was zuletzt schiefging; wird beim nächsten Start gelöscht. */
    const grund = ref('');

    const imStore = () => typeof bearbeitung?.setzeEingabe === 'function' && !!bearbeitung.eingabe;
    /** Lokaler Rückfall für Attrappen ohne Eingabe-Zustand. */
    const _lokal = ref({ phase: 'aus', punkte: [], zeiger: null, geste: null, zugGeschlossen: false, auto: {} });
    const zustand = () => (imStore() ? bearbeitung.eingabe : _lokal.value);
    function schreibe(patch) {
        if (imStore()) bearbeitung.setzeEingabe(patch);
        else _lokal.value = { ..._lokal.value, ...patch };
    }

    const phase = computed(() => zustand().phase ?? 'aus');
    /** Die scharfe Bearbeitung, solange der Motor läuft — sonst null. */
    const werkzeug = computed(() => (phase.value !== 'aus' ? (bearbeitung?.scharf ?? null) : null));
    const aktiv = computed(() => !!werkzeug.value);
    const eingaben = computed(() => eingabenFuer(werkzeug.value));
    // Die GESTEN-FELDER der scharfen Bearbeitung — auch wenn kein Zug läuft.
    // „Haltung teilen" hat keinen Zug, nur die Station als Punkt-Geste; die
    // Kontextleiste muss den Knopf zeigen, BEVOR der Motor sammelt (der Klick
    // darauf startet ihn erst). Headless-Lauf 2026-09-08: ohne diese Sicht
    // blieb die Leiste bei allen Gesten-nur-Werkzeugen ohne Knopf.
    const gestenFelder = computed(() => eingabenFuer(bearbeitung?.scharf ?? null).felderMitGeste);
    const zugSchlitz = computed(() => eingaben.value.schlitze.find(s => s.schlitz === 'zug' || s.schlitz === 'umriss') ?? null);
    const geste = computed(() => zustand().geste ?? null);

    const punkte = computed({
        get: () => zustand().punkte ?? [],
        set: (v) => schreibe({ punkte: v }),
    });
    const zeiger = computed({
        get: () => zustand().zeiger ?? null,
        set: (v) => schreibe({ zeiger: v }),
    });

    const mindestPunkte = computed(() => zugSchlitz.value?.anzahl.min ?? werkzeug.value?.mindestPunkte ?? 2);
    const hoechstPunkte = computed(() => zugSchlitz.value?.anzahl.max ?? Infinity);
    const genug = computed(() => punkte.value.length >= mindestPunkte.value);

    /** Der laufende Zug für den Plotter — gesetzte Punkte plus Gummiband. */
    const zug = computed(() => (aktiv.value && zugSchlitz.value
        // Ein UMRISS ist geschlossen gemeint — der Plotter zeigt die Schlusskante
        // schon beim Sammeln (Teil XX); bis dahin nur bei Rezept-Werkzeugen.
        ? { punkte: punkte.value, zeiger: zeiger.value, geschlossen: !!werkzeug.value.geschlossen || zugSchlitz.value.schlitz === 'umriss' }
        : null));

    const schritt = computed(() => naechsterSchritt(eingaben.value, {
        punkte: punkte.value.length, zugGeschlossen: !!zustand().zugGeschlossen,
        bereit: !!bearbeitung?.bereit, geste: geste.value,
    }));

    /** Was oben im Plan bzw. in der Kontextleiste steht, solange der Motor läuft. */
    const hinweis = computed(() => {
        if (!aktiv.value) return '';
        const ohne = werkzeug.value.hoehenAus === 'gelaende'
            ? punkte.value.filter(p => p.ausserhalb).length : 0;
        const zusatz = ohne ? ` — ${ohne} ${ohne === 1 ? 'Punkt liegt' : 'Punkte liegen'} ausserhalb des Geländes` : '';
        return `${werkzeug.value.titel}: ${schritt.value.hinweis}${zusatz}`;
    });

    // Ein Werkzeug mit Zug, das von AUSSEN scharf wird (HUD, Toolbox,
    // Kontextleiste) — der Motor fängt an zu sammeln, ohne dass jemand
    // `starte` ruft. Beide Instanzen sehen dieselbe Phase; der Wächter
    // `phase === 'aus'` hält das idempotent.
    // SYNCHRON: wer das Werkzeug startet und im selben Zug den ersten Punkt
    // setzt (Griff, Test), darf keinen gepufferten Watcher abwarten müssen.
    watch(() => bearbeitung?.scharfId, (id) => {
        if (!id || phase.value !== 'aus') return;
        const b = bearbeitung.scharf;
        if (!b || !['zug', 'umriss'].includes(eingabeArt(b))) return;
        _beginne(b);
    }, { flush: 'sync' });

    function _beginne(b) {
        grund.value = '';
        schreibe({ phase: 'sammeln', punkte: [], zeiger: null, geste: null, zugGeschlossen: false, auto: {} });
        hoehenBereit = (b.hoehenAus === 'gelaende' && bereiteHoehenVor)
            ? Promise.resolve(bereiteHoehenVor()).catch(() => null)
            : null;
    }

    /**
     * Ein Zeichenwerkzeug scharf schalten — über `bearbeitung.starte`, damit
     * das Formular aus demselben Katalog kommt wie bei jeder anderen
     * Bearbeitung. Erzeugen hat kein Subjekt: das Gezeichnete steht an seiner
     * Stelle, der Höhenversatz geht als Bezug mit (Vorbelegung in m NN).
     */
    function starte(id) {
        const b = nachId(id);
        if (!b || !['zug', 'umriss'].includes(eingabeArt(b))) {
            grund.value = 'Kein Zeichenwerkzeug'; return false;
        }
        const brauchtSubjekt = b.gruppe !== 'erzeugen';
        const bezug = { hoehenversatz: getHoehenversatz?.() ?? 0 };
        if (!bearbeitung?.starte(id, brauchtSubjekt ? {} : { subjekt: bezug })) {
            grund.value = 'Werkzeug liess sich nicht starten'; return false;
        }
        if (brauchtSubjekt && !bearbeitung?.bauteil) {
            bearbeitung?.abbrechen?.();
            grund.value = 'Erst ein Bauteil wählen'; return false;
        }
        _beginne(b);
        return true;
    }

    const aufGelaende = () => werkzeug.value?.hoehenAus === 'gelaende';

    function _mitHoehe(p) {
        if (!aufGelaende() || !getHoeheAn) return { x: p.x, z: p.z };
        const y = getHoeheAn(p.x, p.z);
        return Number.isFinite(y) ? { x: p.x, y, z: p.z } : { x: p.x, z: p.z, ...(y === null ? { ausserhalb: true } : {}) };
    }

    /** Formularwerte aus dem Zug vorbelegen — nur, was der Nutzer nicht selbst gesetzt hat. */
    function _nachZug() {
        const b = werkzeug.value;
        if (!b?.nachZug || !genug.value) return;
        const auto = { ...(zustand().auto ?? {}) };
        const vorschlag = b.nachZug(bearbeitung?.bauteil ?? null, punkte.value) ?? {};
        let geaendert = false;
        for (const [feld, wert] of Object.entries(vorschlag)) {
            const jetzt = bearbeitung?.werte?.[feld];
            const unberuehrt = jetzt === undefined || jetzt === null || jetzt === '' || jetzt === auto[feld];
            if (!unberuehrt) continue;
            bearbeitung?.setzeWert?.(feld, wert);
            auto[feld] = wert;
            geaendert = true;
        }
        if (geaendert) schreibe({ auto });
    }

    /** Fang auf Schachtmitten, wenn der Schlitz es verlangt (Anschliessen). */
    function _gefangen(p) {
        if (zugSchlitz.value?.fang !== 'schacht') return p;
        const knoten = bearbeitung?.bauteil?.schachtKnoten ?? [];
        let bester = null;
        for (const k of knoten) {
            const d = Math.hypot(k.punkt.x - p.x, k.punkt.z - p.z);
            if (d <= FANG_SCHACHT_M && (!bester || d < bester.d)) bester = { d, k };
        }
        return bester ? { ...p, x: bester.k.punkt.x, z: bester.k.punkt.z, fang: bester.k.name || 'Schacht' } : p;
    }

    /**
     * Der SCHLIESSFANG (Teil XX): schliesst den Umriss, wenn `nahe(ersterPunkt)`
     * — die Regel steht in `Eingaben.schliesstUmriss`, die Nähe misst der
     * Aufrufer. Schreibt nichts: der Zug geht auf „prüfen".
     * @returns {boolean} geschlossen?
     */
    function schliesseWennNahe(nahe) {
        if (!aktiv.value || !zugSchlitz.value || zustand().zugGeschlossen || typeof nahe !== 'function') return false;
        const p0 = punkte.value[0];
        if (!schliesstUmriss({ schlitz: zugSchlitz.value.schlitz, punkte: punkte.value.length,
                               mindest: mindestPunkte.value, nahe: !!p0 && !!nahe(p0) })) return false;
        return schliesseZug();
    }

    /**
     * Einen Punkt setzen — `{x, z}` aus dem Lageplan, `{x, y, z}` aus dem Raum.
     * `nahe(p0)` (optional) sagt, ob der Tipp beim ersten Punkt liegt: dann
     * schliesst er den Umriss statt einen Punkt anzuhängen.
     */
    function setzePunkt(p, { nahe = null } = {}) {
        if (!aktiv.value || !p || !zugSchlitz.value) return false;
        if (schliesseWennNahe(nahe)) return true;
        // Schon geschlossen und wieder auf den ersten Punkt getippt: bleibt zu.
        if (zustand().zugGeschlossen && typeof nahe === 'function' && punkte.value[0] && nahe(punkte.value[0])) return true;
        if (zustand().zugGeschlossen) oeffneZug();
        if (punkte.value.length >= hoechstPunkte.value) return false;
        punkte.value = [...punkte.value, _gefangen(_mitHoehe(p))];
        _nachZug();
        // Ein Zug mit Höchstzahl (Anschliessen: 1) ist fertig, sobald sie erreicht ist.
        if (punkte.value.length >= hoechstPunkte.value) schreibe({ zugGeschlossen: true, phase: 'pruefen', zeiger: null });
        return true;
    }

    function bewegeZeiger(p) {
        if (!aktiv.value) return;
        zeiger.value = p ? { x: p.x, ...(Number.isFinite(p.y) ? { y: p.y } : {}), z: p.z } : null;
    }

    /** Den letzten Punkt zurücknehmen — der Radiergummi beim Zeichnen. */
    function entferneLetzten() {
        if (!aktiv.value) return false;
        if (zustand().zugGeschlossen) { oeffneZug(); return true; }
        if (!punkte.value.length) return false;
        punkte.value = punkte.value.slice(0, -1);
        _nachZug();
        return true;
    }

    function schliesseZug() {
        if (!aktiv.value) return false;
        schreibe({ zugGeschlossen: true, phase: 'pruefen', zeiger: null });
        return true;
    }

    function oeffneZug() {
        if (!aktiv.value) return false;
        schreibe({ zugGeschlossen: false, phase: 'sammeln' });
        return true;
    }

    /** Enter/Doppelklick — die eine Regel: anwenden, prüfen oder nichts. */
    async function enter() {
        const regel = enterRegel({ phase: phase.value, genug: genug.value, bereit: !!bearbeitung?.bereit });
        if (regel === 'anwenden') return abschliessen();
        if (regel === 'pruefen') { schliesseZug(); return null; }
        if (!genug.value && aktiv.value) grund.value = `Mindestens ${mindestPunkte.value} Punkte nötig`;
        return null;
    }

    // ── Gesten an Feldern ────────────────────────────────────────────────

    /** Ein Feld per Geste füllen: „Ort auf der Achse zeigen", „Gelände antippen". */
    function starteGeste(feldName) {
        const b = bearbeitung?.scharf;
        const g = eingabenFuer(b).felderMitGeste.find(f => f.name === feldName);
        if (!b || !g) { grund.value = `Feld „${feldName}" hat keine Geste`; return false; }
        if (phase.value === 'aus') schreibe({ phase: 'sammeln' });
        let kandidaten = [];
        if (g.geste === 'auswahl') {
            const feld = (bearbeitung.felder ?? []).find(f => f.name === feldName);
            kandidaten = (feld?.optionen ?? []).map(o => o.wert).filter(Boolean);
        }
        grund.value = '';
        schreibe({ geste: { feld: feldName, art: g.geste, auf: g.auf ?? null, liefert: g.liefert ?? null, kandidaten } });
        return true;
    }

    function brichGesteAb() {
        if (!geste.value) return false;
        schreibe({ geste: null });
        // Ohne Zug-Schlitz war der Motor nur für die Geste an.
        if (!zugSchlitz.value) schreibe({ phase: 'aus' });
        return true;
    }

    /**
     * Ein Treffer aus dem Raum (oder Plan): `{point:{x,y,z}, globalId?, modelId?, localId?}`.
     * Erst die Geste, dann der Zug. `true` heisst: verbraucht.
     */
    function aufTreffer(t) {
        const g = geste.value;
        if (g) {
            if (!t?.point) { grund.value = 'Kein Treffer — ein Bauteil antippen'; return true; }
            if (g.art === 'punkt') {
                if (g.auf === 'achse') {
                    const a = bearbeitung?.bauteil?.achse ?? null;
                    const stuetz = a?.polyline ?? a?.punkte ?? (a?.anfang && a?.ende ? [a.anfang, a.ende] : null);
                    const st = stuetz ? stationAuf({ punkte: stuetz }, t.point) : null;
                    if (!st) { grund.value = 'Das Bauteil hat keine Achse'; return true; }
                    bearbeitung.setzeWert(g.feld, Math.round(st.station * 1000) / 1000);
                } else {
                    bearbeitung.setzeWert(g.feld, { x: t.point.x, y: t.point.y, z: t.point.z });
                }
                brichGesteAb();
                return true;
            }
            if (g.art === 'auswahl') {
                const gid = t.globalId ?? null;
                if (!gid || !g.kandidaten.includes(gid)) {
                    grund.value = 'Kein Kandidat — dieses Bauteil kommt hier nicht in Frage';
                    return true;
                }
                bearbeitung.setzeWert(g.feld, gid);
                brichGesteAb();
                return true;
            }
            return true;
        }
        if (aktiv.value && zugSchlitz.value && t?.point) {
            setzePunkt({ x: t.point.x, y: t.point.y, z: t.point.z }, { nahe: t.nahe ?? null });
            // Ein Zug mit HÖCHSTZAHL (Anschliessen: 1 Punkt) ist mit dem Tipp
            // fertig und wird übernommen, wie bisher. Nach dem SCHLIESSFANG nie:
            // ein Tipp schreibt nicht (Teil XX — sonst hätte das Schliessen
            // eines Aushubs schon eingetragen, weil Tiefe und Neigung vorbelegt sind).
            if (zustand().zugGeschlossen && punkte.value.length >= hoechstPunkte.value && bearbeitung?.bereit) enter();
            return true;
        }
        return false;
    }

    // ── Abschluss ────────────────────────────────────────────────────────

    /**
     * Den Zug abschliessen: ein Journaleintrag entsteht. Geprüft wird VORHER —
     * ein Eintrag, der sich nicht bauen lässt, überlebte jedes Neuladen.
     * @returns {Promise<object|null>} der Journaleintrag, oder null
     */
    async function abschliessen() {
        if (!aktiv.value) return null;
        if (!genug.value) {
            grund.value = `Mindestens ${mindestPunkte.value} Punkte nötig`;
            return null;
        }
        if (aufGelaende() && hoehenBereit) {
            await hoehenBereit;
            punkte.value = punkte.value.map(p => (Number.isFinite(p.y) ? p : _mitHoehe(p)));
            _nachZug();
        }
        const b = werkzeug.value;
        const amBauteil = b.gruppe !== 'erzeugen';
        const gezeichnet = { punkte: punkte.value, hoehenversatz: getHoehenversatz?.() ?? 0 };

        if (!amBauteil) {
            // `anwenden` mutiert nichts (Vertrag des Katalogs) — deshalb lässt
            // es sich gefahrlos zweimal fragen.
            const probe = b.anwenden(gezeichnet, bearbeitung.werte);
            const fehler = pruefeBauplan(probe?.nachher);
            if (fehler.length) { grund.value = fehler.join(' · '); return null; }
        }

        const eintrag = await bearbeitung.ausfuehren({
            wer: cde?.bearbeiter || '',
            modellSha: getModellSha?.() ?? null,
            ...(amBauteil ? { zug: punkte.value } : { subjekt: gezeichnet }),
        });
        // `ausfuehren` räumt das Werkzeug in jedem Fall — ein Nein muss also
        // HIER sichtbar werden, sonst endet der Zug still (Gesetz 10).
        if (!eintrag) grund.value = bearbeitung?.letzterGrund || 'Nichts eingetragen';
        beenden();
        if (eintrag) await nachBauen?.(eintrag);
        return eintrag;
    }

    /** Aufhören, ohne etwas festzulegen. */
    function abbrechen() {
        bearbeitung?.abbrechen();
        beenden();
    }

    function beenden() {
        schreibe({ phase: 'aus', punkte: [], zeiger: null, geste: null, zugGeschlossen: false, auto: {} });
    }

    return {
        werkzeug, punkte, zeiger, grund, aktiv, genug, zug, hinweis, mindestPunkte, hoechstPunkte,
        phase, eingaben, gestenFelder, schritt, geste,
        starte, setzePunkt, bewegeZeiger, entferneLetzten, abschliessen, abbrechen,
        enter, schliesseZug, oeffneZug, schliesseWennNahe, starteGeste, brichGesteAb, aufTreffer,
    };
}
