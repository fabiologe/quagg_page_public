/**
 * useZeichnen — einen Zug im Lageplan setzen und daraus ein Bauteil machen
 * (Stufe 9.4).
 *
 * Hausstil wie `useSchnitt`, `useMessen`: Datei und Export
 * englisch, Inhalt deutsch, ein Optionsobjekt hinein, ein flaches Objekt aus
 * Refs und Handlern heraus. Verhalten gehört ins Composable, Zustand in den
 * Store.
 *
 * WARUM IM LAGEPLAN UND NICHT IM RAUM: dort liegt die Zeichen-Maschinerie
 * schon (Weltkoordinaten über `zeigerZuWelt`, Trefferradius, Stift/Finger-
 * Regeln), und im Tiefbau arbeitet man ohnehin von oben. Die Höhe ist eine
 * ANGABE im Formular, kein dritter Klick — im Grundriss lässt sie sich gar
 * nicht zeigen, und ein Wert, den man nicht sieht, wird lieber getippt als
 * geraten.
 *
 * ERZEUGEN HAT KEIN SUBJEKT. Alle anderen Bearbeitungen hängen an einem
 * angeklickten Bauteil; diese hängt an nichts. Deshalb steht der GEZEICHNETE
 * ZUG an der Stelle des Bauteils: `ausfuehren({ subjekt: { punkte } })`. Das
 * ist keine Ausnahme in der Mechanik, nur eine andere Herkunft des Subjekts —
 * Journal, Rücknahme und Nachvollziehbarkeit bleiben dieselben.
 *
 * NICHTS WIRD GESCHRIEBEN, BIS DER ZUG ABGESCHLOSSEN IST. Ein Eintrag je Klick
 * füllte das Journal mit halben Linien, und „zurück" bräuchte so viele Klicks,
 * wie man Punkte gesetzt hat — dieselbe Überlegung wie beim Ziehen (9.3), wo
 * der Eintrag erst beim Loslassen entsteht.
 */

import { computed, ref } from 'vue';
import { nachId, eingabeArt } from '../services/Bearbeitungen.js';
import { pruefeBauplan } from '../services/Bauteilrezepte.js';

export function useZeichnen({ bearbeitung, cde, getModellSha, nachBauen,
                              getHoehenversatz } = {}) {
    /** Die scharfe Zeichen-Bearbeitung, oder null. */
    const werkzeug = ref(null);
    /** Gesetzte Punkte in Welt-XZ, in Reihenfolge. */
    const punkte = ref([]);
    /** Wo der Zeiger gerade steht — nur fürs Gummiband, nie im Journal. */
    const zeiger = ref(null);
    /** Was zuletzt schiefging; wird beim nächsten Start gelöscht. */
    const grund = ref('');

    const aktiv = computed(() => !!werkzeug.value);
    const mindestPunkte = computed(() => werkzeug.value?.mindestPunkte ?? 2);
    const genug = computed(() => punkte.value.length >= mindestPunkte.value);

    /** Der laufende Zug für den Plotter — gesetzte Punkte plus Gummiband. */
    const zug = computed(() => (aktiv.value
        ? { punkte: punkte.value, zeiger: zeiger.value, geschlossen: !!werkzeug.value.geschlossen }
        : null));

    /** Was oben im Plan steht, solange gezeichnet wird. */
    const hinweis = computed(() => {
        if (!aktiv.value) return '';
        const fehlt = mindestPunkte.value - punkte.value.length;
        if (fehlt > 0) return `${werkzeug.value.titel}: noch ${fehlt} ${fehlt === 1 ? 'Punkt' : 'Punkte'}`;
        return `${werkzeug.value.titel}: ${punkte.value.length} Punkte — Doppelklick oder Enter schliesst ab`;
    });

    /**
     * Ein Zeichenwerkzeug scharf schalten.
     *
     * Geht über `bearbeitung.starte`, damit das Formular (Bezeichnung, IFC-Typ,
     * Höhe) aus demselben Katalog kommt wie bei jeder anderen Bearbeitung. Ein
     * zweites Formularsystem fürs Zeichnen wäre der Anfang von zwei Wegen zu
     * denselben Feldern.
     */
    function starte(id) {
        const b = nachId(id);
        // NICHT MEHR „nur Erzeugen", sondern „braucht einen Zug".
        //
        // „Trasse ändern" ist die erste Bearbeitung, die ein vorhandenes
        // Bauteil UND einen gezeichneten Zug braucht. Die Eingabeart steht am
        // Katalogeintrag (`eingabe`), und daran hängt es jetzt — nicht mehr an
        // der Gruppe. Eine Gruppe sagt, wo etwas ANGEBOTEN wird; womit es
        // gefüttert wird, ist eine andere Frage.
        if (!b || !['zug', 'umriss'].includes(eingabeArt(b))) {
            grund.value = 'Kein Zeichenwerkzeug'; return false;
        }
        // Der Höhenversatz gehört schon zur VORBELEGUNG, nicht erst zum
        // Abschluss: sonst steht im Feld 0 statt der Geländehöhe. Bei einer
        // Bearbeitung MIT Subjekt bleibt das angeklickte Bauteil stehen — sie
        // braucht es ja.
        const brauchtSubjekt = b.gruppe !== 'erzeugen';
        const bezug = { hoehenversatz: getHoehenversatz?.() ?? 0 };
        if (!bearbeitung?.starte(id, brauchtSubjekt ? {} : { subjekt: bezug })) {
            grund.value = 'Werkzeug liess sich nicht starten'; return false;
        }
        if (brauchtSubjekt && !bearbeitung?.bauteil) {
            bearbeitung?.abbrechen?.();
            grund.value = 'Erst ein Bauteil wählen'; return false;
        }
        werkzeug.value = b;
        punkte.value = [];
        zeiger.value = null;
        grund.value = '';
        return true;
    }

    /** Einen Punkt setzen. `{x, z}` aus dem Lageplan. */
    function setzePunkt(p) {
        if (!aktiv.value || !p) return false;
        punkte.value = [...punkte.value, { x: p.x, z: p.z }];
        return true;
    }

    function bewegeZeiger(p) {
        if (aktiv.value) zeiger.value = p ? { x: p.x, z: p.z } : null;
    }

    /** Den letzten Punkt zurücknehmen — der Radiergummi beim Zeichnen. */
    function entferneLetzten() {
        if (!aktiv.value || !punkte.value.length) return false;
        punkte.value = punkte.value.slice(0, -1);
        return true;
    }

    /**
     * Den Zug abschliessen: ein Journaleintrag entsteht.
     *
     * Geprüft wird VORHER. Ein Eintrag, der sich nicht bauen lässt, überlebte
     * jedes Neuladen, meldete jedes Mal denselben Fehler und liesse sich nur
     * über „zurück" wieder loswerden — deshalb kommt er gar nicht erst hinein.
     *
     * @returns {Promise<object|null>} der Journaleintrag, oder null
     */
    async function abschliessen() {
        if (!aktiv.value) return null;
        if (!genug.value) {
            grund.value = `Mindestens ${mindestPunkte.value} Punkte nötig`;
            return null;
        }
        // Derselbe Bauplan, den `ausfuehren` gleich ins Journal legt — hier nur
        // ohne ihn zu schreiben. `anwenden` mutiert nichts, das ist der Vertrag
        // des Katalogs, und darum lässt er sich gefahrlos zweimal fragen.
        // ZWEI WEGE, und der Unterschied ist das Subjekt.
        //
        // Erzeugen hat keines: das Gezeichnete IST das Bauteil und wird als
        // Subjekt hereingereicht. „Trasse ändern" hat eines — dort ist der Zug
        // eine zusätzliche Eingabe am angeklickten Bauteil, kein Ersatz dafür.
        const amBauteil = werkzeug.value.gruppe !== 'erzeugen';
        const gezeichnet = { punkte: punkte.value, hoehenversatz: getHoehenversatz?.() ?? 0 };

        if (!amBauteil) {
            const probe = werkzeug.value.anwenden(gezeichnet, bearbeitung.werte);
            const fehler = pruefeBauplan(probe?.nachher);
            if (fehler.length) { grund.value = fehler.join(' · '); return null; }
        }

        const eintrag = await bearbeitung.ausfuehren({
            wer: cde?.bearbeiter || '',
            modellSha: getModellSha?.() ?? null,
            ...(amBauteil ? { zug: punkte.value } : { subjekt: gezeichnet }),
        });
        beenden();
        if (eintrag) await nachBauen?.();
        return eintrag;
    }

    /** Aufhören, ohne etwas festzulegen. */
    function abbrechen() {
        bearbeitung?.abbrechen();
        beenden();
    }

    function beenden() {
        werkzeug.value = null;
        punkte.value = [];
        zeiger.value = null;
    }

    return {
        werkzeug, punkte, zeiger, grund, aktiv, genug, zug, hinweis, mindestPunkte,
        starte, setzePunkt, bewegeZeiger, entferneLetzten, abschliessen, abbrechen,
    };
}
