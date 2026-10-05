/**
 * DIE WERKZEUGKARTE (Teil XXX, B1 — Fabios E-B1: „das Formular in die Tafel rechts, das Bild bleibt frei").
 *
 * Was eine scharfe Bearbeitung dem Nutzer sagt — nächster Schritt, Text des Übernehmen-Knopfs, ob er bereit ist, die
 * Fehler, die zeigbaren Felder (Gesten) — an EINEM Ort gerechnet. Die schmale Leiste unter dem Bild und die Karte in
 * der Tafel lesen beide hier; vorher stand das alles in der Kontextleiste, und die Leiste stand mit elf Feldern mitten
 * über dem Gelände (Messlauf B0: 85,7 % des mittleren Bilddrittels verdeckt, zwei Klicks trafen das Formular).
 *
 * @param {{motor: object|null}} quelle  der Eingabe-Motor des Raums (useEingabe), als Getter
 */
import { computed } from 'vue';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { eingabeArt, schreibtAmBauplan } from '../services/Bearbeitungen.js';
import { hatHoehenbezug } from '../services/Hoehenbezug.js';

export function useWerkzeugKarte(motorVon) {
    const bearbeitung = useBearbeitung();
    const motor = () => (typeof motorVon === 'function' ? motorVon() : motorVon) ?? null;

    /** Läuft ein Zug im Motor? Dann führt er Hinweis, Fehler und Knopf. */
    const zugLaeuft = computed(() => !!motor()?.aktiv?.value && !!motor()?.zug?.value);
    const geste = computed(() => motor()?.geste?.value ?? null);
    const gesteText = computed(() => {
        const g = geste.value;
        if (!g) return '';
        return g.art === 'auswahl' ? 'Bauteil im Raum antippen — Esc bricht die Geste ab'
            : g.auf === 'achse' ? 'Ort auf der Achse antippen — Esc bricht die Geste ab'
            : g.auf ? 'Ort auf dem Bauteil antippen — Esc bricht die Geste ab'
            : 'Ort im Raum antippen — Esc bricht die Geste ab';
    });
    function feldTitel(name) {
        const f = (bearbeitung.felder ?? []).find(x => x.name === name);
        return f?.label || f?.titel || name;
    }
    // Aus `gestenFelder` (scharfe Bearbeitung, auch ohne laufenden Zug) — der Knopf beginnt das Sammeln.
    const gesten = computed(() => (motor()?.gestenFelder?.value ?? motor()?.eingaben?.value?.felderMitGeste ?? []).map(g => ({
        name: g.name,
        text: g.geste === 'auswahl' ? `${feldTitel(g.name)}: im Raum antippen`
            : g.auf === 'achse' ? `${feldTitel(g.name)}: auf der Achse zeigen` : `${feldTitel(g.name)}: im Raum zeigen`,
        titel: `Das Feld „${feldTitel(g.name)}" per Tipp füllen`,
    })));
    const bereit = computed(() => (zugLaeuft.value ? bearbeitung.bereit && !!motor().genug.value : bearbeitung.bereit));
    const okText = computed(() => {
        if (!zugLaeuft.value) return 'Übernehmen';
        const m = motor();
        if (m.genug.value) return 'Übernehmen';
        const fehlt = m.mindestPunkte.value - m.punkte.value.length;
        return `Noch ${fehlt} ${fehlt === 1 ? 'Punkt' : 'Punkte'}`;
    });
    const fehler = computed(() => (zugLaeuft.value && motor().grund?.value
        ? [motor().grund.value, ...bearbeitung.fehler] : bearbeitung.fehler));

    /**
     * Was der nächste Schritt ist — oder was das Werkzeug NICHT tut. Zug/Umriss kommen aus dem Raum (E8);
     * Forderungen bleiben beim Planer; ohne Höhenbezug zählt der Wert ab Modellursprung.
     */
    function naechsterSchritt() {
        const s = bearbeitung.scharf;
        if (!s) return '';
        const art = eingabeArt(s);
        if (art === 'zug' || art === 'umriss') {
            if (motor()?.hinweis?.value) return motor().hinweis.value;
            return `${art === 'zug' ? 'Zug' : 'Umriss'} im Bild setzen — Punkte anklicken, Enter schliesst ab.`;
        }
        if (s.nurFestlegung && !schreibtAmBauplan(s, bearbeitung.bauteil)) return 'Wird als Forderung an den Planer geführt — die Geometrie bleibt bei ihm.';
        if (s.brauchtRolle === 'sohlhoehe' && !hatHoehenbezug(bearbeitung.bauteil?.hoehenversatz)) {
            return 'Kein Höhenbezug im Modell — der Wert zählt ab Modellursprung, nicht ab NN.';
        }
        const e = bearbeitung.einordnung;
        if (e && e.guete !== 'gemessen') return `Form nur ${e.guete} — Wert prüfen.`;
        return '';
    }
    const hinweis = computed(() => {
        // Eine überschrittene FACHGRENZE (K10, Fabios E5) sperrt nicht — sie wird hier gesagt, vor dem nächsten Schritt.
        const grenze = bearbeitung.grenzhinweise?.[0]?.text ?? '';
        const weiter = naechsterSchritt();
        return grenze && weiter ? `${grenze} · ${weiter}` : (grenze || weiter);
    });

    return { zugLaeuft, geste, gesteText, gesten, bereit, okText, fehler, hinweis, feldTitel };
}
