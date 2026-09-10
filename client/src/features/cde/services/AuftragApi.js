/**
 * AuftragApi — der schmale Draht der CDE zum Projektbestand (Stufe 11.3).
 *
 * BEWUSST EIGEN, kein Import aus `features/projects/`. Dort liegt eine
 * vollständige `ProjekteApi`, und sie zu benutzen wäre eine Zeile weniger —
 * aber eine Abhängigkeit zwischen zwei Werkzeugen, die getrennt gebaut und
 * getrennt angefasst werden sollen. Hausregel: fachliche Doppelung ist der
 * akzeptierte Preis, Verdrahtung nicht.
 *
 * Was die CDE vom Projektbestand braucht:
 *   liste()            welche Aufträge gibt es? (für den Wähler ohne ?projekt=)
 *   register(id)       Stammdaten + Dokumente + Modellsätze in EINER Antwort
 *   verbundStarten()   Modellsatz → EIN geprüftes IFC4X3 (Server, Unterprozess)
 *   verbundStatus()    den Lauf abholen, bis er fertig ist
 *   datei(pfad)        eine Datei des Projekts holen (Download des Verbunds)
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

    /**
     * Einen Verbund aus einem Modellsatz anstoßen — Antwort 202 mit `lauf_id`.
     *
     * Rechnen tut der Server in einem Unterprozess: nginx bricht nach 60 s ab,
     * der Verbund der Gruppenmodelle braucht samt Prüfung zwei Minuten. Darum
     * kehrt dieser Aufruf sofort zurück, und `verbundStatus` holt ab.
     *
     * Multipart wie der Upload (RepoFacade.setBlob). Das Eigenbau-Paket geht als
     * DATEI `eigenbau` mit, nicht als Formularfeld: es trägt Dreiecke, leicht
     * mehrere Megabyte, und als Datei behandeln Server und Proxy es wie jeden
     * anderen Upload.
     *
     * `modus: 'erdbau'` (Stufe 3 des Aushub-Fachmodells): derselbe Lauf, aber
     * die Quellen sind die Registerdateien der Wirte (`paket.quellDokumente`),
     * und ins Register kommt `Erdbau_<Satz>_R<nn>.ifc`. Ohne Paket lehnt der
     * Server ab — ein Erdbau ohne Aushub ist keiner.
     */
    async verbundStarten(id, satzId, { eigenbau = null, crs = null, projektname = null, modus = null } = {}) {
        const form = new FormData();
        form.append('satz_id', satzId);
        if (modus) form.append('modus', modus);
        if (crs) form.append('crs', crs);
        if (projektname) form.append('projektname', projektname);
        if (eigenbau) {
            form.append('eigenbau',
                new Blob([JSON.stringify(eigenbau)], { type: 'application/json' }), 'eigenbau.json');
        }
        return (await api.post(`/projekte/${id}/cde/verbund`, form)).data;
    },

    /** Stand eines Verbund-Laufs: Zustand, Schritt, Befunde — und, wenn eingetragen, das Dokument. */
    async verbundStatus(id, laufId) {
        return (await api.get(`/projekte/${id}/cde/verbund/${laufId}`)).data;
    },

    /** Eine Datei des Projektbestands, Pfad relativ zu 1_Projekte (so steht er im Laufstatus). */
    async datei(pfad) {
        return (await api.get('/projects/file', { params: { path: pfad }, responseType: 'blob' })).data;
    },
};

export default AuftragApi;
