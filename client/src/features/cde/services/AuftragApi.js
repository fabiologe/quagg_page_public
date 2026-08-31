/**
 * AuftragApi — der schmale Draht der CDE zum Projektbestand (Stufe 11.3).
 *
 * BEWUSST EIGEN, kein Import aus `features/projects/`. Dort liegt eine
 * vollständige `ProjekteApi`, und sie zu benutzen wäre eine Zeile weniger —
 * aber eine Abhängigkeit zwischen zwei Werkzeugen, die getrennt gebaut und
 * getrennt angefasst werden sollen. Hausregel: fachliche Doppelung ist der
 * akzeptierte Preis, Verdrahtung nicht.
 *
 * Zwei Aufrufe, mehr braucht die CDE vom Projektbestand nicht:
 *   liste()        welche Aufträge gibt es? (für den Wähler ohne ?projekt=)
 *   register(id)   Stammdaten + Dokumente + Modellsätze in EINER Antwort
 */

import api from '@/services/api';

export const AuftragApi = {
    /**
     * Die Aufträge zur Auswahl.
     *
     * Der Endpunkt rechnet mehr, als hier gebraucht wird (Fortschritt, Geld,
     * Zeit, Aufgaben). Für einen Wähler ist das verschwenderisch, aber
     * ehrlich: einen schlanken Endpunkt zu ergänzen wäre eine Änderung am
     * Projektmodul für einen Nebenzweck. Wenn die Liste lang wird, lohnt er
     * sich — vorher nicht.
     */
    async liste() {
        const zeilen = (await api.get('/projekte')).data ?? [];
        return zeilen
            .map(z => ({ id: z.id, name: z.name ?? '', ordner: !!z.ordner_vorhanden }))
            .sort((a, b) => b.id - a.id);
    },

    /** Stammdaten, Dokumentregister und Modellsätze eines Auftrags. */
    async register(id) {
        return (await api.get(`/projekte/${id}/cde`)).data;
    },
};

export default AuftragApi;
