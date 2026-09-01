/**
 * Bearbeitungs-Zustand (Stufe 9.0).
 *
 * Hausregel: **Composable = Verhalten, Store = Zustand.** Hier liegt deshalb
 * nur, WAS gerade bearbeitet wird — die Einordnung des Bauteils, die scharfe
 * Bearbeitung und die Formularwerte. Wer den Resolver oder die Engine braucht,
 * reicht sie herein; der Store holt sich nichts selbst. Dadurch bleibt er ohne
 * WebGL prüfbar und übersteht einen Modellwechsel, ohne Geometrie zu halten.
 *
 * Der Ausgang ist bewusst schmal: `ausfuehren()` schreibt NICHT selbst, sondern
 * legt einen Journaleintrag über `useAenderungen` an. Alles, was hier
 * hinzukommt, erbt damit Rücknahme und Nachvollziehbarkeit aus Stufe 7 — es
 * gibt keinen zweiten Weg, ein Bauteil zu ändern.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

import { bestimme } from '../services/bauform/Bauformen.js';
import {
    REPO_KEY as REGEL_KEY, bauformAusRegel, ladeRegeln, namensvorschlaege, regelAus,
} from '../services/bauform/Bauformregeln.js';
import { repo } from '../services/RepoFacade.js';
import { EINGEBAUTE_PROFILE, ladeSatz, profilFuer } from '../services/bauform/Typprofile.js';
import { GRUPPEN, felderFuer, nachId, passende, pruefe } from '../services/Bearbeitungen.js';
import { useAenderungen } from './useAenderungen.js';

export const useBearbeitung = defineStore('cde-bearbeitung', () => {
    /** Einordnung der aktuellen Auswahl: {bauform, guete, quelle, warnungen} */
    const einordnung = ref(null);
    /** Das eingeordnete Bauteil selbst — Kennung, Kategorie, Stand. */
    const bauteil = ref(null);
    /** Wirksamer Typprofil-Satz (Projekt schlägt Büro schlägt eingebaut). */
    const profilSatz = ref({ ...EINGEBAUTE_PROFILE });
    /**
     * Bauformregeln — sie sagen, was die NAMEN eines Exporteurs bedeuten.
     *
     * Nötig, weil manche Software alles als `IFCBUILDINGELEMENTPROXY` ausgibt:
     * dann sagt der Typ nichts, der Name aber sehr wohl („Haltung", „Schacht").
     */
    const regeln = ref([]);
    /** Id der scharfen Bearbeitung, oder null. */
    const scharfId = ref(null);
    /** Formularwerte der scharfen Bearbeitung. */
    const werte = ref({});
    /** Läuft gerade eine Einordnung? (Geometrie-Ableitung kann dauern.) */
    const laeuft = ref(false);

    const typprofil = computed(() => profilFuer(bauteil.value?.category ?? bauteil.value?.type, profilSatz.value));
    const scharf = computed(() => (scharfId.value ? nachId(scharfId.value) : null));
    const felder = computed(() => (scharf.value ? felderFuer(scharf.value, typprofil.value) : []));
    const fehler = computed(() => (scharf.value ? pruefe(felder.value, werte.value) : []));
    const bereit = computed(() => !!scharf.value && fehler.value.length === 0);

    /**
     * Was an diesem Bauteil möglich ist — die EINE Antwort, aus der alle lesen.
     *
     * DAS TYPPROFIL MUSS MIT. Ohne es fällt jede Bearbeitung heraus, die über
     * `brauchtRolle` an einer typeigenen Größe hängt — also genau die, die das
     * Typprofil überhaupt erst nützlich machen. Der Fehler war schlimmer als
     * ein Fehlen: die Toolbox rechnet über `herleite` MIT Profil und zeigte
     * „Bezugshöhe setzen" an, während `starte()` hier OHNE Profil prüfte und
     * denselben Knopf ablehnte. Ein Knopf, der da ist und nichts tut.
     *
     * Wieder zwei Wege zu derselben Frage. Deshalb steht sie jetzt einmal hier,
     * und `starte` fragt dieselbe Liste — nicht eine zweite mit denselben
     * Argumenten, die beim nächsten Argument wieder auseinanderläuft.
     */
    const moeglich = computed(() => (einordnung.value
        ? passende(einordnung.value, { typprofil: typprofil.value })
        : []));

    /** Profilsatz und Bauformregeln laden. Einmal je Projekt, nicht je Auswahl. */
    async function ladeProfile(quelle = repo) {
        [profilSatz.value, regeln.value] = await Promise.all([ladeSatz(quelle), ladeRegeln(quelle)]);
    }

    // ── Zuordnen: was bedeuten die Namen dieses Exporteurs? ────────────────

    /**
     * Die Namen, die im geladenen Modell vorkommen — je Kategorie gezählt.
     *
     * Damit zeigt die Oberfläche „18 Proxies heissen hier ‚Haltung'", statt den
     * Nutzer raten zu lassen, wonach er suchen soll. Quelle ist der Suchindex,
     * der beim Laden ohnehin gebaut wird — kein zweiter Lauf über das Modell.
     */
    function vorschlaege(suchindex) {
        const roh = (suchindex ?? []).map(e => ({ category: e.category, attributes: { Name: e.name } }));
        return namensvorschlaege(roh).map(v => ({
            ...v,
            bauform: bauformAusRegel(regeln.value, { category: v.category, attributes: { Name: v.name }, psets: {} })?.bauform ?? null,
        }));
    }

    /**
     * Einer Namensgruppe eine Bauform zuordnen.
     *
     * Schreibt eine REGEL, keine Einzelzuweisung: derselbe Exporteur nennt die
     * Dinge in jeder Datei gleich, und eine Regel gilt damit auch für die
     * nächste Lieferung. `bauform: null` nimmt die Zuordnung zurück.
     */
    async function ordneZu({ category, name, bauform }, ziel = repo) {
        const ohneAlte = regeln.value.filter(
            r => !(r.condition?.category === category && r.condition?.value === name && r.bauform),
        );
        const neu = bauform ? [...ohneAlte, regelAus({ category, name, bauform })] : ohneAlte;
        regeln.value = neu;
        try {
            await ziel.set(REGEL_KEY, JSON.parse(JSON.stringify(neu)));
        } catch (fehler) {
            console.warn('cde: bauformregel sichern', fehler?.message ?? fehler);
        }
        return neu;
    }

    /**
     * Der Elementzusammenhang, wie ihn die Regel-Maschine erwartet.
     *
     * `parseItemData` liefert `type` (die Kategorie) und `name` flach; die
     * Regeln sprechen von `category` und `attributes.Name` — die Übersetzung
     * gehört genau hierher und nicht in die Regel-Maschine, die keine
     * IFC-Abhängigkeit haben soll.
     */
    function _regelKontext(el) {
        if (!el) return null;
        return {
            category: (el.category ?? el.type ?? '').toUpperCase(),
            attributes: { Name: el.name ?? '', Description: el.description ?? '',
                          PredefinedType: el.predefinedType ?? '', ...(el.attrs ?? {}) },
            psets: el.psets ?? {},
        };
    }

    /**
     * Ein Bauteil einordnen.
     *
     * Der Resolver wird HEREINGEREICHT, nicht gehalten: er cached je Modell,
     * und ein über den Modellwechsel hinweg behaltener Resolver liefert
     * Geometrie des alten Modells.
     */
    async function einordne(el, resolver) {
        abbrechen();
        bauteil.value = el ?? null;
        if (!el) { einordnung.value = null; return null; }

        laeuft.value = true;
        try {
            einordnung.value = await bestimme(el, {
                resolver,
                typprofil: profilFuer(el.category ?? el.type, profilSatz.value),
                ausRegel: bauformAusRegel(regeln.value, _regelKontext(el)),
            });
        } finally {
            laeuft.value = false;
        }
        return einordnung.value;
    }

    /** Eine Bearbeitung scharf schalten und ihr Formular vorbelegen. */
    function starte(id) {
        const b = nachId(id);
        if (!b) return false;
        // Eine Bearbeitung, die zu diesem Bauteil nicht passt, darf auch über
        // die Befehls-Palette nicht scharf werden — sonst umgeht der eine
        // Einstieg die Güteschranke der anderen.
        //
        // ERZEUGEN IST DAVON AUSGENOMMEN, weil es kein Subjekt hat: „Linie
        // zeichnen" bezieht sich nicht auf das gerade angeklickte Rohr. Ohne
        // diese Ausnahme wäre das Zeichenwerkzeug immer dann gesperrt, wenn
        // zufällig etwas ausgewählt ist — und niemand käme darauf, warum.
        const werkzeug = GRUPPEN[b.gruppe]?.einstieg === 'werkzeug';
        if (!werkzeug && einordnung.value && !moeglich.value.some(p => p.id === id)) return false;
        scharfId.value = id;
        werte.value = { ...(b.vorbelegung?.(bauteil.value ?? {}) ?? {}) };
        return true;
    }

    function setzeWert(name, wert) {
        werte.value = { ...werte.value, [name]: wert };
    }

    function abbrechen() {
        scharfId.value = null;
        werte.value = {};
    }

    /**
     * Die scharfe Bearbeitung ausführen.
     *
     * @returns {Promise<object|null>} der Journaleintrag, oder null wenn nichts
     *   zu tun war (ungültig, oder derselbe Wert wie zuvor — `eintragen` sagt
     *   das selbst und schreibt dann keinen leeren Schritt).
     */
    /**
     * Warum das letzte `ausfuehren` nichts ergeben hat.
     *
     * `ausfuehren` gibt in DREI verschiedenen Fällen `null` zurück, und sie
     * bedeuten Verschiedenes: die Bearbeitung war nicht bereit, sie konnte
     * nichts beschreiben (dem Bauteil fehlt der Bezug — etwa die Hülle), oder
     * der Wert galt schon. Die Oberfläche hat daraus einen Satz gemacht und
     * damit einen Grund BEHAUPTET, den sie nicht kannte. Ein falscher Grund ist
     * schlimmer als keiner: er schickt den Nutzer in die falsche Richtung.
     */
    const letzterGrund = ref('');

    async function ausfuehren({ wer = '', modellSha = null, subjekt = null } = {}) {
        letzterGrund.value = '';
        const b = scharf.value;
        // ERZEUGEN HAT KEIN SUBJEKT (Stufe 9.4): dort steht das GEZEICHNETE an
        // der Stelle des angeklickten Bauteils und wird hereingereicht. Keine
        // Ausnahme in der Mechanik — nur eine andere Herkunft des Subjekts;
        // Journal, Rücknahme und Nachvollziehbarkeit bleiben dieselben.
        const gegenstand = subjekt ?? bauteil.value;
        if (!b || !bereit.value || !gegenstand) {
            letzterGrund.value = 'Bearbeitung ist nicht bereit.';
            return null;
        }

        const beschreibung = b.anwenden(gegenstand, werte.value);
        if (!beschreibung?.art) {
            // Der häufigste Fall: `bezugshoehe-setzen` gibt null, wenn dem
            // Bauteil der Anker fehlt (keine Hülle gelesen). Das ist etwas
            // ganz anderes als „Wert galt schon".
            letzterGrund.value = 'Dem Bauteil fehlt der Bezug für diese Bearbeitung.';
            return null;
        }

        const aenderungen = useAenderungen();
        const eintrag = await aenderungen.eintragen({ ...beschreibung, wer, modellSha });
        if (!eintrag) letzterGrund.value = 'Der Wert galt schon — nichts einzutragen.';
        abbrechen();
        return eintrag;
    }

    return {
        einordnung, bauteil, profilSatz, regeln, scharfId, werte, laeuft, letzterGrund,
        typprofil, scharf, felder, fehler, bereit, moeglich,
        ladeProfile, einordne, starte, setzeWert, abbrechen, ausfuehren,
        vorschlaege, ordneZu,
    };
});
