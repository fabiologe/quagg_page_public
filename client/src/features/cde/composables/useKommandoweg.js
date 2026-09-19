/**
 * DER KOMMANDOWEG DER FENSTER (Teil XXIV, O6).
 *
 * Werkzeugleiste und Raum setzen ihre Kommandos über `useBearbeitung.ausfuehren`
 * ab — mit scharfem Werkzeug und Formular. Fenster und Listen haben beides
 * nicht: der Längsschnitt (ein Griff), das Merkmalsfenster (ein Satz), das
 * Planungs-Cockpit (eine Zeile der Kostengruppen oder Flächen). Bis O6 schrieben
 * sie deshalb selbst ins Journal — ohne Beleg, am Werkzeugkatalog vorbei.
 *
 * Hier steht einmal, was alle drei brauchen: die SPERRE des Bearbeiten-Modus
 * (Stufe 12.0d — `fuehreAus` ist der Weg ohne Oberfläche und prüft ihn nicht;
 * ein Fenster ist Oberfläche), das Kommando aus Werkzeug, Ziel und Werten
 * (Kennung, Bearbeiter, Zeit), das Modell je Eintrag, und das
 * Subjekt eines GELIEFERTEN Bauteils, von dem das Fenster nur die Kennung kennt
 * (`subjektAusKennung`). Ein eigenes kommt aus dem Stand (`fuehreAus`).
 * Angewandt wird nicht hier — was danach zu tun ist, weiss das Fenster.
 */
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useCdeStore } from '../stores/useCdeStore.js';
import { useViewerApi } from './viewerApi.js';
import { KOMMANDO_SCHEMA, neueKommandoId } from '../services/kommando/Kommando.js';
import { subjektAusKennung } from '../services/kommando/Subjekt.js';
import { modellVon } from '../services/Bauteilrezepte.js';

export function useKommandoweg() {
    const bearbeitung = useBearbeitung();
    const aenderungen = useAenderungen();
    const cde = useCdeStore();
    const api = useViewerApi();

    /**
     * @param {object} a
     * @param {string} a.werkzeug      Katalog-Id
     * @param {string[]} [a.ziel]
     * @param {object} [a.werte]
     * @param {object} [a.eingaben]
     * @param {function} [a.subjektVon]  was das Fenster über ein Bauteil weiss (null = nichts)
     * @param {function} [a.jeEintrag]   Zusätzliches je Eintrag (Basis, Modell)
     * @param {object} [a.rahmen]
     * @returns {Promise<object>} das Ergebnis von `fuehreAus`
     */
    async function absetzen({ werkzeug, ziel = [], werte = {}, eingaben = null, subjektVon = null, jeEintrag = null, rahmen = null }) {
        if (!bearbeitung.modusAn) {
            return { ausgefuehrt: false, grund: 'Der Bearbeiten-Modus ist aus.', eintraege: [], mehrteilig: false, kommando: null };
        }
        const kommando = {
            schema: KOMMANDO_SCHEMA, id: neueKommandoId(), werkzeug, ziel, werte,
            ...(eingaben ? { eingaben } : {}),
            wer: cde.bearbeiter || '', wann: new Date().toISOString(),
        };
        return bearbeitung.fuehreAus(kommando, {
            ...(rahmen ? { rahmen } : {}),
            subjektVon: (gid) => subjektVon?.(gid)
                ?? (modellVon(gid) === 'cde' ? null : subjektAusKennung(gid, { wirksamerStand: aenderungen.wirksamerStand })),
            jeEintrag: (gid) => ({
                modellSha: api.modellShaVon?.(gid) ?? api.getLoadedModelSha?.() ?? null,
                ...(jeEintrag?.(gid) ?? {}),
            }),
        });
    }

    return { absetzen };
}
