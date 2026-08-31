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
import { bauformAusRegel, ladeRegeln } from '../services/bauform/Bauformregeln.js';
import { EINGEBAUTE_PROFILE, ladeSatz, profilFuer } from '../services/bauform/Typprofile.js';
import { felderFuer, nachId, passende, pruefe } from '../services/Bearbeitungen.js';
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

    /** Was an diesem Bauteil möglich ist — die Liste fürs Kontextmenü. */
    const moeglich = computed(() => (einordnung.value ? passende(einordnung.value) : []));

    /** Profilsatz und Bauformregeln laden. Einmal je Projekt, nicht je Auswahl. */
    async function ladeProfile(repo) {
        [profilSatz.value, regeln.value] = await Promise.all([ladeSatz(repo), ladeRegeln(repo)]);
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
        if (einordnung.value && !passende(einordnung.value).some(p => p.id === id)) return false;
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
    async function ausfuehren({ wer = '', modellSha = null } = {}) {
        const b = scharf.value;
        if (!b || !bereit.value || !bauteil.value) return null;

        const beschreibung = b.anwenden(bauteil.value, werte.value);
        if (!beschreibung?.art) return null;

        const aenderungen = useAenderungen();
        const eintrag = await aenderungen.eintragen({ ...beschreibung, wer, modellSha });
        abbrechen();
        return eintrag;
    }

    return {
        einordnung, bauteil, profilSatz, regeln, scharfId, werte, laeuft,
        typprofil, scharf, felder, fehler, bereit, moeglich,
        ladeProfile, einordne, starte, setzeWert, abbrechen, ausfuehren,
    };
});
