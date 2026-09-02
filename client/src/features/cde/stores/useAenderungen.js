/**
 * Journal der Merkmalsänderungen (Sprint I, Stufe 7).
 *
 * Bis hierher gab es zwei getrennte Wege, ein Bauteil zu ändern, und keiner
 * war rücknehmbar:
 *
 *   KG-Zuweisung      — eine Map GlobalId→Code in `IfcPlanningCockpit`, unter
 *                       EINEM Repo-Schlüssel abgelegt. Wer zuweist, überschreibt;
 *                       was vorher galt, ist weg.
 *   DIN-277-Klasse    — dasselbe Muster in `IfcAreaSchedule`.
 *   Merkmalssatz      — schrieb bis Lücke ⑧ (2026-09-02) am Journal vorbei
 *                       direkt ins IFC-Modell. Keine Spur, kein Zurück.
 *                       Jetzt: Eintrag hier, Anwendung über
 *                       `IfcAutor.schreibeMerkmalssatz`.
 *
 * Hier liegt stattdessen eine **append-only Liste**: jede Änderung merkt sich,
 * was vorher galt. Zurücknehmen heißt dann nicht „raten", sondern den letzten
 * Eintrag lesen und den alten Wert wieder eintragen.
 *
 * Die bestehenden Verbraucher (`KgClassifier`, `Din277Classifier`) erwarten
 * eine Map GlobalId→Wert. Die wird hier **abgeleitet** — ihre Schnittstelle
 * bleibt unberührt, und es gibt trotzdem nur eine Wahrheit.
 *
 * Das Journal hängt am Projekt-Repo (mit Server-Backend also im Projektordner)
 * und ist damit für jeden sichtbar, der das Projekt öffnet — was bei einer
 * Änderung am Bauteilbestand auch der Punkt ist.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { repo } from '../services/RepoFacade.js';
import { deltaZwischen, nennenswert, verschiebeEintrag } from '../services/JournalVersatz.js';

const REPO_KEY = 'aenderungen';

/**
 * Toleranz für Längenvergleiche in Metern (0,1 mm).
 *
 * Weit unter jedem Baumaß und weit über dem Zahlenrauschen. Sie darf so eng
 * sein, weil `lage` einen VERSATZ speichert und keine Weltkoordinate: ein
 * Versatz ist eine kleine Zahl. Eine UTM-Koordinate von 500.000 verlöre beim
 * Weg durch die Float32-Puffer von three.js rund 3 cm — ein Versatz von 0,4 m
 * verliert nichts. (Derselbe Grund, aus dem das Haus mit `coordOffsets`
 * arbeitet: welt = roh − offset.)
 */
export const LAENGEN_TOLERANZ = 1e-4;

/** Tiefer Wertevergleich für Objektwerte (Merkmalssätze, Maße). */
function gleichTief(a, b) {
    if (Object.is(a, b)) return true;
    if (a == null || b == null) return false;
    if (typeof a !== 'object' || typeof b !== 'object') return false;
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every(k => gleichTief(a[k], b[k]));
}

/**
 * Ein Parametrik-Wert als Karte Rolle → Wert.
 *
 * Verträgt die alte Form `{rolle, wert}` aus Journalen, die vor Stufe 14.2
 * entstanden sind. Ohne diese Übersetzung verlöre ein bestehendes Journal
 * seine Masse — und zwar still, weil `{rolle:'x', wert:1}` als Karte gelesen
 * zwei sinnlose Schlüssel ergäbe.
 */
function _alsMasskarte(v) {
    if (!v || typeof v !== 'object') return {};
    if (typeof v.rolle === 'string') return { [v.rolle]: v.wert ?? null };
    return v;
}

/**
 * Punktvergleich mit Bautoleranz — {x, y, z} in Weltmetern.
 *
 * `lage` speichert einen ANKER (die Mitte der Bauteilhülle), keinen Versatz.
 * Das ist wichtig genug für eine eigene Notiz, weil die erste Fassung es falsch
 * hatte: Ein Versatz-Vergleich (`dx/dy/dz`) auf einen Punkt angewandt findet
 * lauter `undefined`, macht daraus Nullen — und meldet IMMER „gleich". Jeder
 * Konflikt wäre still als sauber durchgegangen, und ausgerechnet die
 * Schutzvorrichtung hätte Erfolg gemeldet.
 *
 * Beide Seiten des Drei-Wege-Vergleichs müssen dieselbe GRÖSSE messen:
 * `basis` (Lage im gelieferten Modell) und `nachher` (gewünschte Lage) sind
 * beide Punkte. Der Versatz ist eine Anzeige-Ableitung, kein Speicherformat.
 *
 * Weltkoordinaten sind hier klein, nicht UTM-groß: das Haus normiert über
 * `coordOffsets` (welt = roh − offset). Deshalb darf die Toleranz eng sein.
 */
function gleichPunkt(a, b) {
    if (Object.is(a, b)) return true;
    if (!a || !b) return false;
    if (typeof a !== 'object' || typeof b !== 'object') return false;
    // Ein Punkt ohne x/y/z ist kein Punkt — lieber ungleich melden als still
    // Nullen vergleichen.
    const hatXYZ = (o) => ['x', 'y', 'z'].some(k => typeof o[k] === 'number');
    if (!hatXYZ(a) || !hatXYZ(b)) return false;
    return ['x', 'y', 'z'].every(
        k => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) <= LAENGEN_TOLERANZ,
    );
}

/** Der Versatz zwischen zwei Ankern — nur für die Anzeige. */
export function versatzZwischen(basis, ziel) {
    if (!basis || !ziel) return null;
    return { dx: (ziel.x ?? 0) - (basis.x ?? 0),
             dy: (ziel.y ?? 0) - (basis.y ?? 0),
             dz: (ziel.z ?? 0) - (basis.z ?? 0) };
}

/**
 * Was sich ändern lässt. Neue Arten hier ergänzen — sonst nirgends.
 *
 * `beruehrtModell` markiert die Arten, die Geometrie oder Maße des Modells
 * verändern. Nur sie brauchen eine `basis` und nehmen am Nachspielen und am
 * Drei-Wege-Vergleich teil (siehe `vergleicheMitModell`). Merkmale wie die
 * Kostengruppe leben neben dem Modell und können nicht mit ihm kollidieren.
 *
 * `gleich` ist nötig, weil `eintragen` sonst mit `===` vergliche — das trägt
 * keine Objekte, und das Journal füllte sich mit Schritten, die nichts tun.
 */
export const AENDERUNGS_ARTEN = Object.freeze({
    kg:         { titel: 'Kostengruppe',   icon: 'kg' },
    din277:     { titel: 'DIN-277-Klasse', icon: 'areas' },
    /**
     * Merkmalssätze BERÜHREN das Modell (Lücke ⑧): der Wert ist eine Karte
     * Satzname → Felder, und jeder Eintrag trägt ALLE von der CDE gesetzten
     * Sätze des Bauteils — absoluter Zielzustand, Vorgabefaltung „letzter
     * gewinnt", exakte Rücknahme. Ein `falte`-Merge wie bei `parametrik`
     * täte hier das Falsche: die Rücknahme eines neu eingeführten Satzes
     * bliebe in der Vereinigung stehen.
     */
    pset:       { titel: 'Merkmalssatz',   icon: 'info',     beruehrtModell: true, gleich: gleichTief },
    lage:       { titel: 'Lage',           icon: 'pointer',  beruehrtModell: true, gleich: gleichPunkt },
    /**
     * Masse — MEHRERE je Bauteil, deshalb eine eigene Faltung.
     *
     * Der Wert ist eine Karte Rolle → Wert (`{profilGroesse: 300}`), keine
     * einzelne Zahl: an einer Haltung gelten Nennweite, Sohle oben und Sohle
     * unten NEBENEINANDER. Ohne `falte` überschrieb jede Festlegung alle
     * übrigen, und niemand sah es — der Wert stand ja da, nur eben der
     * zuletzt gesetzte allein.
     *
     * Alte Einträge der Form `{rolle, wert}` werden beim Falten übersetzt;
     * ein Journal von gestern bleibt lesbar.
     */
    parametrik: {
        titel: 'Maß', icon: 'measure', beruehrtModell: true, gleich: gleichTief,
        falte: (vorher, nachher) => ({ ..._alsMasskarte(vorher), ..._alsMasskarte(nachher) }),
    },
    erzeugt:    { titel: 'Erzeugt',        icon: 'add',      beruehrtModell: true, gleich: gleichTief },
    geloescht:  { titel: 'Gelöscht',       icon: 'delete',   beruehrtModell: true },
    /**
     * Bezeichnung — der Name des Bauteils.
     *
     * Eine eigene Art und kein Merkmalssatz: `Name` ist in IFC ein ATTRIBUT,
     * kein Pset-Eintrag, und der Änderungsbericht soll „Bezeichnung" sagen und
     * nicht „Merkmalssatz". Sie berührt das Modell nicht — der Plan zeigt sie
     * allerdings an, deshalb steht sie im FormSchreiber unter `lageplan`.
     */
    bezeichnung: { titel: 'Bezeichnung',   icon: 'info' },
    /**
     * Sanierungsmaßnahme — eine Entscheidung, kein Messwert.
     *
     * Wie `kg` und `din277` eine Einordnung mit geschlossenem Vokabular; sie
     * berührt das Modell nicht, färbt aber den Plan.
     */
    massnahme:   { titel: 'Maßnahme',      icon: 'quality' },
});

/** Die Vergleichsfunktion einer Art; Rückfall ist Identität. */
export function gleichFuer(art, arten = AENDERUNGS_ARTEN) {
    return arten[art]?.gleich ?? Object.is;
}

/**
 * Den Stand einer Art als Map GlobalId→Wert.
 *
 * Rein und frei exportiert, damit die Ableitung ohne Store prüfbar ist. Sie
 * läuft von vorn nach hinten durch: der letzte Eintrag je Bauteil gewinnt,
 * und `null` als Wert bedeutet „zurück zur Regel" und nimmt den Eintrag
 * wieder heraus.
 */
export function standAus(eintraege, art) {
    const stand = new Map();
    for (const [globalId, { wert }] of standMitEintrag(eintraege, art)) {
        stand.set(globalId, wert);
    }
    return stand;
}

/**
 * Der wirksame Stand aus BEIDEN Ebenen (Stufe 11.1).
 *
 * Auftragsjournal: „das Rohr liegt 20 cm tiefer als geliefert" — wahr in jeder
 * Variante. Standjournal: „hier probiere ich 12,40" — nur in diesem Modellsatz.
 *
 * WARUM NICHT EINFACH VERKETTEN: `standAus([...auftrag, ...stand])` sähe
 * verlockend aus, ist aber falsch. In `standAus` heißt `null` „Eintrag
 * herausnehmen" — und ein `null` im STANDJOURNAL löschte damit auch die
 * Auftragskorrektur, die darunter liegt. Wer im Modellsatz eine Festlegung
 * zurücknimmt, verlöre die Korrektur des Auftrags gleich mit.
 *
 * Richtig ist, JEDE EBENE FÜR SICH zu falten und dann schlüsselweise zu
 * überlagern. Dann heißt `null` im Standjournal nur noch „an dieser Stelle
 * nichts gesetzt", und der Auftragswert scheint wieder durch. Das ist dieselbe
 * Form wie `waehleMitVorrang` aus Stufe 6 — Projekt schlägt Büro schlägt
 * Standard, hier Modellsatz schlägt Auftrag.
 */
export function ebenenStand(auftragsEintraege, standEintraege, art) {
    const wirksam = standAus(auftragsEintraege ?? [], art);
    for (const [globalId, wert] of standAus(standEintraege ?? [], art)) {
        wirksam.set(globalId, wert);
    }
    return wirksam;
}

/**
 * Derselbe Stand, aber mit dem Eintrag, der ihn erzeugt hat.
 *
 * Das Nachspielen braucht mehr als den Wert: es braucht die `basis` des
 * Schrittes, der zuletzt gewonnen hat — sonst lässt sich nicht prüfen, ob der
 * Planer dasselbe Bauteil inzwischen auch angefasst hat.
 *
 * `standAus` leitet sich hieraus ab, statt die Faltung ein zweites Mal zu
 * schreiben. Zwei Faltungen nebeneinander wären zwei Wahrheiten, und die
 * laufen auseinander — genau die Fehlerklasse, gegen die dieses Journal
 * überhaupt angetreten ist.
 */
export function standMitEintrag(eintraege, art) {
    const falte = AENDERUNGS_ARTEN[art]?.falte ?? null;
    const stand = new Map();
    for (const e of eintraege) {
        if (e.art !== art || !e.globalId) continue;
        if (e.nachher === null || e.nachher === undefined) { stand.delete(e.globalId); continue; }
        // „Letzter gewinnt" ist die Vorgabe und bleibt es. Eine Art darf eine
        // eigene Faltung mitbringen — `parametrik` braucht sie, weil an einem
        // Bauteil MEHRERE Masse nebeneinander gelten: wer erst die Nennweite
        // und dann die Stärke festlegte, verlor die Nennweite.
        const vorher = stand.get(e.globalId)?.wert;
        const wert = falte ? falte(vorher, e.nachher) : e.nachher;
        stand.set(e.globalId, { wert, eintrag: e });
    }
    return stand;
}

/** Eine Länge in Metern lesbar machen — mm-genau, mit Vorzeichen. */
function _laenge(m) {
    const v = Number(m ?? 0);
    if (!Number.isFinite(v)) return '?';
    const s = Math.abs(v) < 1 ? `${(v * 1000).toFixed(0)} mm` : `${v.toFixed(3)} m`;
    return v > 0 ? `+${s}` : s;
}

/** Einen Anker knapp ausschreiben — für den Fall ohne Basis. */
function _punkt(p) {
    if (!p) return '—';
    return ['x', 'y', 'z'].map(k => (Number(p[k]) || 0).toFixed(2)).join(' / ');
}

/**
 * Einen Journalwert für die Anzeige beschreiben.
 *
 * Nötig, weil `lage` und `parametrik` Objekte tragen — ohne das stünde
 * `[object Object]` im Änderungen-Reiter.
 *
 * BEWUSST OHNE HIMMELSRICHTUNGEN. „0,40 m nach Osten" wäre lesbarer, behauptete
 * aber eine Georeferenz, die nicht gesichert ist: welche IFC-Achse nach Osten
 * zeigt, hängt am Autorensystem — genau die Frage, die aus Stufe 0 noch offen
 * ist (Achskonvention, UTM-Vorzeichen). Bis sie am georeferenzierten
 * Kanalmodell geklärt ist, heißen die Achsen X, Y und H.
 */
export function beschreibeWert(art, wert, basis = null) {
    if (wert === null || wert === undefined) return '— (Regel)';
    if (art === 'lage') {
        // Gespeichert wird der ANKER, angezeigt der VERSATZ dorthin — eine
        // Weltkoordinate sagt niemandem etwas, „400 mm tiefer" schon. Ohne
        // Basis (Altbestand) bleibt nur der Anker selbst.
        const d = versatzZwischen(basis, wert);
        if (!d) return `Anker ${_punkt(wert)}`;
        const teile = [];
        if (Math.abs(d.dx) > LAENGEN_TOLERANZ) teile.push(`X ${_laenge(d.dx)}`);
        if (Math.abs(d.dz) > LAENGEN_TOLERANZ) teile.push(`Y ${_laenge(d.dz)}`);
        if (Math.abs(d.dy) > LAENGEN_TOLERANZ) teile.push(`H ${_laenge(d.dy)}`);
        return teile.length ? teile.join(' · ') : 'unverändert';
    }
    if (art === 'erzeugt') {
        // Der Rohwert ist ein Bauplan (Rezept, Typ, Parameter). Ihn Feld für
        // Feld auszuschreiben ergäbe „parameter: [object Object]" — lesbar ist
        // die Frage, die der Nutzer stellt: was steht da, und wie gross ist es?
        const punkte = wert?.parameter?.punkte?.length ?? 0;
        const bezeichnung = wert?.name || wert?.kategorie || wert?.rezept || 'Bauteil';
        return `${bezeichnung} · ${punkte} ${punkte === 1 ? 'Punkt' : 'Punkte'}`;
    }
    if (typeof wert === 'object') {
        return Object.entries(wert)
            .map(([k, v]) => `${k}: ${typeof v === 'number' ? v : String(v)}`)
            .join(' · ') || '—';
    }
    return String(wert);
}

/**
 * Der Drei-Wege-Vergleich: passt eine Festlegung noch zum geladenen Modell?
 *
 * Das ist die Stelle, an der das Git-Bild wörtlich wird. Beim Nachspielen auf
 * eine NEUE Modellrevision stehen drei Werte nebeneinander:
 *
 *     eintrag.basis   was der Planer damals hatte    (Basis-Stand)
 *     eintrag.nachher was du daraus gemacht hast     (deine Festlegung)
 *     istWert         was der Planer JETZT hat       (bewegter Upstream)
 *
 * Ist der Ist-Wert noch die Basis, hat der Planer nichts angerührt — die
 * Festlegung greift sauber. Weicht er ab, haben BEIDE geändert, und das kann
 * kein Programm entscheiden: das ist ein Konflikt für einen Menschen.
 *
 * Der Zustand wird ABGELEITET und nie gespeichert. Ein gespeichertes
 * Konfliktkennzeichen wäre ein zweiter Zustand neben dem Journal und liefe
 * auseinander; abgeleitet heilt er von selbst, wenn ein Bauteil in einer
 * späteren Revision zurückkommt.
 *
 * @param {object} eintrag
 * @param {*} istWert  Wert im geladenen Modell; `undefined` = Bauteil fehlt
 * @returns {{zustand: 'sauber'|'konflikt'|'fehlt', grund: string|null}}
 */
export function vergleicheMitModell(eintrag, istWert, arten = AENDERUNGS_ARTEN) {
    const art = arten[eintrag?.art];
    // Merkmale leben neben dem Modell — sie können nicht mit ihm kollidieren.
    if (!art?.beruehrtModell) return { zustand: 'sauber', grund: null };

    if (istWert === undefined) {
        return { zustand: 'fehlt', grund: 'bauteil_nicht_im_modell' };
    }
    // Einträge aus der Zeit vor der `basis` (Stufe 7) lassen sich nicht
    // dreiwegig prüfen. Sie anzuwenden ist richtiger, als sie stillzulegen —
    // aber der Grund wird mitgegeben, damit die Anzeige es sagen kann.
    if (eintrag.basis === undefined) {
        return { zustand: 'sauber', grund: 'ohne_basis' };
    }
    const gleich = gleichFuer(eintrag.art, arten);
    if (gleich(istWert, eintrag.basis)) return { zustand: 'sauber', grund: null };
    return { zustand: 'konflikt', grund: 'planer_hat_auch_geaendert' };
}

/**
 * Der jüngste Schritt, der noch zurückgenommen werden kann.
 *
 * Rein und frei exportiert — die Regel ist die einzige Stelle, an der sich
 * Zurücknehmen von Wiederholen unterscheidet, und sie gehört geprüft.
 *
 * @returns {object|null}
 */
export function letzterOffener(eintraege) {
    const zurueckgenommen = new Set(
        eintraege.map(e => e.ruecknahmeVon).filter(Boolean),
    );
    for (let i = eintraege.length - 1; i >= 0; i--) {
        const e = eintraege[i];
        if (e.ruecknahmeVon) continue;              // selbst eine Rücknahme
        if (zurueckgenommen.has(e.id)) continue;    // schon zurückgenommen
        return e;
    }
    return null;
}

/**
 * Wie `ebenenStand`, aber mit dem Eintrag, der den Wert erzeugt hat.
 *
 * Das Nachspielen braucht die `basis` des Schrittes, der zuletzt gewonnen hat.
 * Ohne die Ebenentrennung fiele es auf denselben Fallstrick wie die Anzeige:
 * ein `null` im Standjournal löschte die Auftragskorrektur mit aus dem Plan,
 * und sie käme beim nächsten Laden nicht mehr aufs Modell.
 */
export function standMitEintragEbenen(auftragsEintraege, standEintraege, art) {
    const wirksam = standMitEintrag(auftragsEintraege ?? [], art);
    for (const [globalId, satz] of standMitEintrag(standEintraege ?? [], art)) {
        wirksam.set(globalId, satz);
    }
    return wirksam;
}

export const useAenderungen = defineStore('cde-aenderungen', () => {
    /**
     * ZWEI JOURNALE, nicht eines (Stufe 11.1).
     *
     * Bis hierher lag alles unter EINEM Schlüssel im globalen Scope. Bei
     * aktivem Server-Backend war das schon der richtige Ort — er landet in
     * `CDE/_repo/global:aenderungen.json` im Auftragsordner. Der Fehler war
     * nicht der Ort, sondern dass die zweite Ebene fehlte: eine Festlegung im
     * Modellsatz „Nord" galt auch in „Süd", weil es beide gar nicht gab.
     */
    const auftragsEintraege = ref([]);   // gilt in JEDEM Modellsatz
    const standEintraege    = ref([]);   // nur im aktiven Modellsatz

    /**
     * DAS COMMIT-MODELL (Teil XI, U2 — „wie git").
     *
     * Die flachen Listen oben bleiben die QUELLE für Faltung, Drei-Wege
     * und Nachspielen (die fünfzehn Invarianten ruhen dort). Darüber liegt
     * die Struktur, die der Nutzer sieht: COMMITS (abgeschlossene
     * Sitzungen mit Nachricht) und DIE OFFENE SITZUNG (das Staging —
     * ihre Schritte wirken sofort, sind aber noch unversioniert und
     * dürfen als Entwurf wieder entfernt werden, ohne Gegeneintrag:
     * git verwirft eine Arbeitskopie auch, ohne sie zu committen).
     *
     * Persistiert wird Format v2: { version: 2, commits, sitzung } je
     * Ebene. Ein v1-Journal (rohes Array) wird beim Laden VERWORFEN und
     * im Log vermerkt — Fabios Entscheidung vom 2026-09-02: die
     * Test-Historie beginnt frisch.
     */
    const commitsJe = { auftrag: ref([]), stand: ref([]) };
    const sitzungJe = { auftrag: ref(null), stand: ref(null) };
    const commits = computed(() => [...commitsJe.auftrag.value, ...commitsJe.stand.value]);
    const sitzung = computed(() => sitzungJe[vorgabeEbene.value].value);
    const sitzungOffen = computed(() => !!sitzung.value);
    const sitzungSchritte = computed(() => {
        const s = sitzung.value;
        if (!s) return [];
        const ids = new Set(s.schrittIds);
        return _liste(vorgabeEbene.value).value.filter(e => ids.has(e.id));
    });
    /** Der aktive Modellsatz, oder null — dann gibt es nur die Auftragsebene. */
    const satzId = ref(null);

    /**
     * Beide Ebenen in einer Liste — für Anzeige, Verlauf und Nachspielen.
     *
     * Die REIHENFOLGE ist bedeutungslos für den wirksamen Stand (den rechnet
     * `ebenenStand` je Ebene) und bedeutsam für die Anzeige: Auftragsschritte
     * zuerst, Satzschritte darüber, so wie sie wirken.
     */
    const eintraege = computed(() => [...auftragsEintraege.value, ...standEintraege.value]);

    /** In welche Ebene geschrieben wird, solange nichts anderes gesagt wird. */
    const vorgabeEbene = computed(() => (satzId.value ? 'stand' : 'auftrag'));

    function _liste(ebene) {
        return ebene === 'auftrag' ? auftragsEintraege : standEintraege;
    }
    function _repoFuer(ebene) {
        return ebene === 'auftrag' || !satzId.value ? repo : repo.withScope(`stand:${satzId.value}`);
    }

    // ── Mehrbenutzer-Wächter (Lücke ⑥, 2026-09-02) ──────────────────────────
    // Zwei Leute im selben Auftrag, und der Zweite überschreibt still die
    // Commits des Ersten — das war der Stand. Minimaler Schutz: jede
    // Nutzlast trägt einen `schreibstand` {zaehler, marke, wer, wann}; vor
    // dem Sichern wird der Serverstand FRISCH gelesen, und liegt dort ein
    // höherer Zähler mit fremder Marke, wird NICHT geschrieben — die fremde
    // Arbeit bleibt, die eigene bleibt lokal, und der Konflikt steht sichtbar
    // im Verlauf. Kein Verschmelzen, keine Raterei: neu laden entscheidet.
    // (GET+PUT sind nicht atomar — das fängt den Alltagsfall „Kollege hat
    // vorhin gearbeitet", nicht den exakt gleichzeitigen Klick.)
    const SCHREIBMARKE = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const _schreibstaende = { auftrag: 0, stand: 0 };
    /** {ebene, wer, wann} | null — gesetzt, sobald ein Sichern verweigert wurde. */
    const schreibKonflikt = ref(null);

    // ── Rahmen-Nachführung (Lücke ⑤ / Stufe 13.4, 2026-09-02) ────────────────
    // Alle Punktwerte des Journals sind Weltkoordinaten, und die Welt hängt am
    // Ladeversatz des ERSTEN Modells (COORDINATE_TO_ORIGIN = Bounding-Box-
    // Minimum). Eine neue Revision kann das Minimum verschieben — dann läge
    // jeder Anker daneben und der Drei-Wege-Vergleich meldete flächendeckend
    // Konflikte. Deshalb trägt jede Nutzlast den Rahmen (`versatzMerker`);
    // beim Laden mit anderem Rahmen werden die Punktfelder um das Delta
    // gehoben (JournalVersatz.js) und neu gesichert. Der Viewer meldet den
    // Rahmen über `setzeWeltversatz`, BEVOR das Nachspielen läuft.
    let _weltVersatz = null;
    const _versatzMerkerJe = { auftrag: null, stand: null };

    function _gleicheVersatzAb(ebene) {
        if (!_weltVersatz) return;
        const merker = _versatzMerkerJe[ebene];
        const liste = _liste(ebene).value;
        if (!merker) {
            // Alteinträge ohne Rahmen: NICHT raten — melden, und ab jetzt den
            // Rahmen mitschreiben (die nächste Sicherung stempelt ihn).
            if (liste.length) {
                console.warn('[CDE] Journal ohne Rahmen-Versatz — Anker können bei '
                    + 'einer neuen Revision daneben liegen (Lücke ⑤); der Rahmen wird '
                    + 'ab jetzt mitgeführt.');
            }
            _versatzMerkerJe[ebene] = { ..._weltVersatz };
            return;
        }
        const delta = deltaZwischen(merker, _weltVersatz);
        if (!nennenswert(delta)) { _versatzMerkerJe[ebene] = { ..._weltVersatz }; return; }
        _liste(ebene).value = liste.map(e => verschiebeEintrag(e, delta));
        _versatzMerkerJe[ebene] = { ..._weltVersatz };
        console.info(`[CDE] Journal dem neuen Ladeversatz nachgeführt `
            + `(Δ ${delta.x.toFixed(3)}/${delta.y.toFixed(3)}/${delta.z.toFixed(3)} m, `
            + `${liste.length} Einträge, Ebene ${ebene})`);
        _sichern(ebene);
    }

    /**
     * Der Viewer meldet den Welt-Rahmen (Ladeversatz des ersten Modells).
     * SYNCHRON verschoben — das Nachspielen liest `eintraege` direkt danach;
     * die Neusicherung läuft im Hintergrund.
     */
    function setzeWeltversatz(v) {
        if (!v || ![v.x, v.y, v.z].every(Number.isFinite)) return;
        _weltVersatz = { x: v.x, y: v.y, z: v.z };
        _gleicheVersatzAb('auftrag');
        _gleicheVersatzAb('stand');
    }

    const anzahl = computed(() => eintraege.value.length);
    /**
     * Gibt es noch etwas zurückzunehmen?
     *
     * Gefragt wird die Ebene, in die geschrieben wird — sonst böte der Knopf
     * an, eine Auftragskorrektur zurückzunehmen, während man in einer Variante
     * arbeitet.
     */
    const kannZurueck = computed(() => letzterOffener(_liste(vorgabeEbene.value).value) !== null);
    /** Wie viele Bauteile insgesamt berührt sind (nicht wie viele Schritte). */
    const beruehrteBauteile = computed(() => new Set(eintraege.value.map(e => e.globalId)).size);

    const kgStand     = computed(() => ebenenStand(auftragsEintraege.value, standEintraege.value, 'kg'));
    const din277Stand = computed(() => ebenenStand(auftragsEintraege.value, standEintraege.value, 'din277'));

    /** Der wirksame Stand einer beliebigen Art — für Nachspielen und Anzeige. */
    function wirksamerStand(art) {
        return ebenenStand(auftragsEintraege.value, standEintraege.value, art);
    }

    async function _sichern(ebene) {
        try {
            // MEHRBENUTZER-WÄCHTER (Lücke ⑥): erst nachsehen, ob auf dem
            // Server inzwischen ein FREMDER Stand liegt. Wenn ja, wird die
            // fremde Arbeit nicht überschrieben — die eigene bleibt im
            // Speicher, der Konflikt wird angezeigt, und Neuladen führt
            // zusammen. Ein v1/leerer Stand trägt keinen `schreibstand` und
            // kann deshalb nichts sperren.
            const ablage = _repoFuer(ebene);
            const fremd = (await ablage.getFrisch?.(REPO_KEY)) ?? null;
            const fs = fremd?.schreibstand;
            if (fs && fs.marke !== SCHREIBMARKE && (fs.zaehler ?? 0) > _schreibstaende[ebene]) {
                schreibKonflikt.value = { ebene, wer: fs.wer ?? '', wann: fs.wann ?? null };
                console.error('cde: Journal NICHT gesichert — auf dem Server liegt ein neuerer Stand',
                    schreibKonflikt.value);
                return;
            }

            // Format v2: die Schritte leben IN ihren Commits bzw. der
            // offenen Sitzung — die flache Liste ist daraus rekonstruierbar
            // und wird nicht doppelt gespeichert.
            const liste = _liste(ebene).value;
            const je = new Map(liste.map(e => [e.id, e]));
            const nutzlast = {
                version: 2,
                commits: commitsJe[ebene].value.map(c => ({
                    ...c, schrittIds: undefined,
                    schritte: c.schrittIds.map(id => je.get(id)).filter(Boolean),
                })),
                sitzung: sitzungJe[ebene].value
                    ? {
                        begonnen: sitzungJe[ebene].value.begonnen,
                        wer: sitzungJe[ebene].value.wer,
                        schritte: sitzungJe[ebene].value.schrittIds
                            .map(id => je.get(id)).filter(Boolean),
                    }
                    : null,
                schreibstand: {
                    zaehler: _schreibstaende[ebene] + 1,
                    marke: SCHREIBMARKE,
                    wer: sitzungJe[ebene].value?.wer
                        || commitsJe[ebene].value.at(-1)?.wer || '',
                    wann: Date.now(),
                },
                // Der Rahmen, unter dem diese Punkte geschrieben wurden
                // (Lücke ⑤) — ohne Modell noch unbekannt, dann fehlt er ehrlich.
                ...(_versatzMerkerJe[ebene] ? { versatzMerker: _versatzMerkerJe[ebene] } : {}),
            };
            const ok = await ablage.set(REPO_KEY, JSON.parse(JSON.stringify(nutzlast)));
            if (ok !== false) _schreibstaende[ebene] += 1;
        } catch (fehler) {
            console.warn('cde: aenderungen sichern', fehler?.message ?? fehler);
        }
    }

    /** Nutzlast v2 in die drei Zustände auspacken. */
    function _uebernimmV2(ebene, roh) {
        const flach = [];
        const commits = [];
        for (const c of roh.commits ?? []) {
            const schritte = Array.isArray(c.schritte) ? c.schritte : [];
            flach.push(...schritte);
            commits.push({
                id: c.id, nachricht: c.nachricht ?? '', wer: c.wer ?? '',
                wann: c.wann ?? 0, modellSha: c.modellSha ?? null,
                schrittIds: schritte.map(e => e.id),
            });
        }
        let sitzung = null;
        if (roh.sitzung) {
            const schritte = Array.isArray(roh.sitzung.schritte) ? roh.sitzung.schritte : [];
            flach.push(...schritte);
            sitzung = {
                begonnen: roh.sitzung.begonnen ?? Date.now(),
                wer: roh.sitzung.wer ?? '',
                schrittIds: schritte.map(e => e.id),
            };
        }
        _liste(ebene).value = flach;
        commitsJe[ebene].value = commits;
        sitzungJe[ebene].value = sitzung;
        // Der Mehrbenutzer-Wächter merkt sich, welchen Serverstand wir
        // ZULETZT GESEHEN haben — jede spätere fremde Schreibung zählt höher.
        _schreibstaende[ebene] = roh.schreibstand?.zaehler ?? 0;
        if (schreibKonflikt.value?.ebene === ebene) schreibKonflikt.value = null;
        // Rahmen-Nachführung (Lücke ⑤): unter welchem Ladeversatz wurden diese
        // Punkte geschrieben? Ist der aktuelle Rahmen schon bekannt (Satz-
        // Wechsel nach dem Laden), wird sofort abgeglichen.
        _versatzMerkerJe[ebene] = roh.versatzMerker ?? null;
        if (_weltVersatz) _gleicheVersatzAb(ebene);
    }

    /**
     * Eine Änderung eintragen.
     *
     * `vorher` wird NICHT vom Aufrufer geraten, sondern aus dem WIRKSAMEN Stand
     * gelesen — aus beiden Ebenen also, denn das ist der Wert, den der Nutzer
     * gesehen hat. Sonst schriebe jeder Aufrufer seine eigene Vorstellung davon
     * hinein, und das Zurücknehmen führte irgendwohin.
     *
     * @param {'stand'|'auftrag'} [ebene]  Vorgabe: Modellsatz, wenn einer aktiv ist
     * @returns {object|null} der Eintrag, oder null wenn nichts zu tun war
     */
    async function eintragen({ art, globalId, nachher, wer = '', modellSha = null,
                               basis, modell, ebene, vorgang, vorgangTitel, befunde }) {
        if (!(art in AENDERUNGS_ARTEN) || !globalId) return null;
        const ziel = ebene ?? vorgabeEbene.value;
        const stand = wirksamerStand(art);
        const vorher = stand.has(globalId) ? stand.get(globalId) : null;
        // Dieselbe Zuweisung noch einmal ist keine Änderung — sonst füllt sich
        // das Journal mit Schritten, die nichts tun, und „zurück" braucht
        // mehrere Klicks für einen sichtbaren Effekt. Der Vergleich kommt aus
        // der Art: Objektwerte (Anker, Maße) tragen kein `===`.
        if (gleichFuer(art)(vorher, nachher ?? null)) return null;

        // Jeder Schritt gehört zu einer SITZUNG (U2). Wer ohne offene
        // schreibt (Tests, System-Übernahmen), eröffnet implizit eine —
        // committet wird sie wie jede andere.
        if (!sitzungJe[ziel].value) {
            sitzungJe[ziel].value = { begonnen: Date.now(), wer, schrittIds: [] };
        }

        const eintrag = {
            id: 'ae-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
            art, globalId, vorher, nachher: nachher ?? null,
            wer, wann: Date.now(), modellSha,
            // Ein VORGANG bindet mehrere Einträge zusammen, ohne die Invariante
            // „ein Eintrag, ein Bauteil" anzutasten — an der hängen fünfzehn
            // Stellen. Rein additiv: ohne ihn verhält sich alles wie zuvor.
            ...(vorgang ? { vorgang, vorgangTitel } : {}),
            // Momentaufnahme, kein laufender Stand — siehe `useBearbeitung`.
            ...(befunde?.length ? { befunde } : {}),
        };
        // `basis` ist der Wert im GELIEFERTEN Modell — der Bezugspunkt des
        // Drei-Wege-Vergleichs. Nur Arten, die das Modell berühren, führen ihn;
        // bei den übrigen wäre er ein Feld ohne Bedeutung.
        if (AENDERUNGS_ARTEN[art].beruehrtModell) {
            eintrag.basis = basis;
            // Erzeugte Bauteile leben im CDE-eigenen Modell. Ohne diese Angabe
            // suchte das Nachspielen sie im gelieferten und fände sie nie.
            eintrag.modell = modell ?? 'geliefert';
        }
        _liste(ziel).value.push(eintrag);
        sitzungJe[ziel].value.schrittIds.push(eintrag.id);
        await _sichern(ziel);
        return eintrag;
    }

    /**
     * Den jüngsten offenen Schritt der ARBEITSEBENE zurücknehmen.
     *
     * Kein Löschen des Eintrags, sondern ein GEGENEINTRAG: die Spur bleibt
     * vollständig. Wer im Register liest, was mit einem Bauteil passiert ist,
     * soll auch die Rücknahme sehen — sonst sieht es aus, als wäre nie etwas
     * gewesen.
     *
     * „Offen" heißt: noch nicht zurückgenommen, und selbst keine Rücknahme.
     * Ohne diese Unterscheidung nähme der zweite Klick die RÜCKNAHME zurück
     * statt den Schritt davor — man pendelte zwischen zwei Ständen.
     *
     * EBENENTREU (Stufe 11.1): gesucht wird nur in der Ebene, in die auch
     * geschrieben wird. Sonst nähme „zurück" in einer Variante eine
     * Auftragskorrektur zurück, die dort gar nicht gemacht wurde.
     */
    async function zurueck(wer = '', { ebene } = {}) {
        const ziel = ebene ?? vorgabeEbene.value;

        // WÄHREND einer offenen Sitzung heisst „zurück": den letzten Vorgang
        // aus dem ENTWURF nehmen (Unstage) — kein Gegeneintrag, die Historie
        // beginnt erst mit dem Commit (U2).
        const s = sitzungJe[ziel].value;
        if (s?.schrittIds.length) {
            const liste = _liste(ziel).value;
            const letzterId = s.schrittIds[s.schrittIds.length - 1];
            const letzterE = liste.find(e => e.id === letzterId);
            if (letzterE) {
                return entferneSitzungsVorgang(letzterE.vorgang ?? letzterE.id, { ebene: ziel });
            }
        }

        const liste = _liste(ziel).value;
        const letzter = letzterOffener(liste);
        if (!letzter) return [];

        // EIN VORGANG WIRD GANZ ZURÜCKGENOMMEN (Stufe 14.3).
        //
        // „Haltung teilen" sind drei Einträge — einer gelöscht, zwei erzeugt.
        // Nur den letzten zurückzunehmen liesse zwei halbe Hälften und eine
        // verschwundene Haltung stehen: ein Zustand, den niemand gemeint hat
        // und der sich per Hand kaum wieder auflösen lässt.
        //
        // Ohne `vorgang` bleibt alles wie bisher — genau ein Schritt.
        const zurueckgenommen = new Set(liste.map(e => e.ruecknahmeVon).filter(Boolean));
        const betroffen = letzter.vorgang
            ? liste.filter(e => e.vorgang === letzter.vorgang
                && !e.ruecknahmeVon && !zurueckgenommen.has(e.id))
            : [letzter];

        // Die Gegeneinträge bilden ihrerseits EINEN Vorgang. Ohne das nähme der
        // nächste Klick die Rücknahme stückweise zurück.
        const gegenVorgang = betroffen.length > 1 ? _neueVorgangsId() : undefined;
        const geschrieben = [];
        // Rückwärts: der zuletzt gemachte Schritt wird zuerst rückgängig.
        for (const q of [...betroffen].reverse()) {
            const eintrag = {
                id: 'ae-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
                art: q.art, globalId: q.globalId,
                vorher: q.nachher, nachher: q.vorher,
                wer, wann: Date.now(), modellSha: q.modellSha,
                // Die Rücknahme erbt Bezugspunkt und Modell des Schrittes, den
                // sie zurücknimmt. Ohne das verlöre der Gegeneintrag seine
                // `basis` und gälte beim Nachspielen als „ohne Basis" —
                // ausgerechnet der Eintrag, der am Ende gilt.
                ...(q.basis !== undefined ? { basis: q.basis } : {}),
                ...(q.modell !== undefined ? { modell: q.modell } : {}),
                ...(gegenVorgang ? { vorgang: gegenVorgang,
                                     vorgangTitel: `${q.vorgangTitel ?? 'Vorgang'} zurückgenommen` } : {}),
                ruecknahmeVon: q.id,
            };
            liste.push(eintrag);
            geschrieben.push(eintrag);
        }
        // Auf Commits ist die Rücknahme selbst ein COMMIT — „Revert: …",
        // wie bei git (U2).
        await _commitAus(ziel, geschrieben,
            `Revert: ${letzter.vorgangTitel ?? AENDERUNGS_ARTEN[letzter.art]?.titel ?? letzter.art}`,
            wer);
        return geschrieben;
    }

    /**
     * Die ZEITLEISTE: das Journal als Vorgangs-Liste, neueste zuerst
     * (Stufe 9, git-artig). Jeder Vorgang trägt Titel, wer, wann, seine
     * Einträge, die berührten Bauteile — und ob er ZURÜCKGENOMMEN ist
     * (alle seine Einträge haben Gegeneinträge). Rücknahmen selbst sind
     * eigene Vorgänge mit `ruecknahme: true`; nichts wird versteckt,
     * die Spur bleibt vollständig (append-only).
     */
    const vorgaenge = computed(() => {
        const liste = eintraege.value;
        const zurueckgenommen = new Set(liste.map(e => e.ruecknahmeVon).filter(Boolean));
        const karte = new Map();
        const reihenfolge = [];
        for (const e of liste) {
            const schluessel = e.vorgang ?? e.id;
            let v = karte.get(schluessel);
            if (!v) {
                v = {
                    schluessel,
                    titel: e.vorgangTitel
                        ?? AENDERUNGS_ARTEN[e.art]?.titel ?? e.art,
                    wer: e.wer ?? '',
                    wann: e.wann ?? 0,
                    ruecknahme: !!e.ruecknahmeVon,
                    basisHebung: !!e.basisGehoben,
                    zeilen: [],
                };
                karte.set(schluessel, v);
                reihenfolge.push(v);
            }
            v.zeilen.push(e);
            if ((e.wann ?? 0) > v.wann) v.wann = e.wann;
        }
        for (const v of reihenfolge) {
            v.zurueckgenommen = !v.ruecknahme
                && v.zeilen.every(z => zurueckgenommen.has(z.id));
            v.bauteile = [...new Set(v.zeilen.map(z => z.globalId))];
            v.arten = [...new Set(v.zeilen.map(z => z.art))];
        }
        return reihenfolge.reverse();
    });

    /**
     * BIS VOR einen Vorgang zurücksetzen — das git-reset dieser Zeitleiste,
     * nur append-only: es entstehen Gegen-Vorgänge, vom neuesten offenen
     * abwärts bis einschliesslich des genannten. Kein Sprung MITTEN hinein:
     * ein Gegen-Eintrag ist immer der neueste und überschriebe sonst
     * spätere Arbeit am selben Bauteil — deshalb gibt es nur „bis hierher",
     * nie „nur diesen mittendrin".
     *
     * @returns {Array} alle Gegen-Einträge (für die Anwendung am Modell)
     */
    async function zurueckBis(schluessel, wer = '', { ebene } = {}) {
        const ziel = ebene ?? vorgabeEbene.value;
        const geschrieben = [];
        for (let schutz = 0; schutz < 200; schutz++) {
            const liste = _liste(ziel).value;
            const zurueckgenommen = new Set(liste.map(e => e.ruecknahmeVon).filter(Boolean));
            const offenImZiel = liste.some(e =>
                (e.vorgang ?? e.id) === schluessel
                && !e.ruecknahmeVon && !zurueckgenommen.has(e.id));
            if (!offenImZiel) break;
            const schritt = await zurueck(wer, { ebene: ziel });
            if (!schritt.length) break;         // nichts mehr offen — fertig
            geschrieben.push(...schritt);
        }
        return geschrieben;
    }

    /**
     * KONFLIKT-ENTSCHEIDUNG „Übernehmen": die Festlegung gilt weiter, gegen
     * den NEUEN Planerstand — `basis` wird auf den Ist-Wert gehoben.
     *
     * Das ist die EINZIGE Stelle im Modul, an der ein Journaleintrag
     * nachträglich geändert wird (Landmine aus Teil II, dort dokumentiert).
     * Deshalb wird sie protokolliert: ein eigener Eintrag hält fest, dass
     * die Basis gehoben wurde — sonst verlöre die Spur genau den Schritt,
     * der am meisten erklärt.
     */
    async function hebeBasisAn(eintragId, istWert, wer = '') {
        for (const ebene of ['auftrag', 'stand']) {
            const liste = _liste(ebene).value;
            const q = liste.find(e => e.id === eintragId);
            if (!q) continue;
            q.basis = istWert;
            const protokoll = {
                id: 'ae-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
                art: q.art, globalId: q.globalId,
                vorher: q.nachher, nachher: q.nachher,
                basis: istWert,
                wer, wann: Date.now(), modellSha: q.modellSha,
                basisGehoben: q.id,
                vorgangTitel: 'Basis auf Planerstand gehoben (Konflikt übernommen)',
            };
            liste.push(protokoll);
            await _commitAus(ebene, [protokoll],
                'Konflikt übernommen — Basis auf Planerstand gehoben', wer);
            return protokoll;
        }
        return null;
    }

    /**
     * KONFLIKT-ENTSCHEIDUNG „Verwerfen": der Planerwert gilt — ein
     * Gegeneintrag zu GENAU diesem Eintrag, auch mitten in der Historie.
     * (Für Konflikte ist das sicher: der Eintrag ist ohnehin nicht
     * anwendbar, spätere Arbeit auf dem Bauteil gibt es nicht.)
     */
    async function verwerfeEinen(eintragId, wer = '') {
        for (const ebene of ['auftrag', 'stand']) {
            const liste = _liste(ebene).value;
            const q = liste.find(e => e.id === eintragId);
            if (!q) continue;
            const gegen = {
                id: 'ae-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
                art: q.art, globalId: q.globalId,
                vorher: q.nachher, nachher: q.vorher ?? null,
                wer, wann: Date.now(), modellSha: q.modellSha,
                ...(q.basis !== undefined ? { basis: q.basis } : {}),
                ...(q.modell !== undefined ? { modell: q.modell } : {}),
                ruecknahmeVon: q.id,
                vorgangTitel: 'Nach Konflikt verworfen — der Planerwert gilt',
            };
            liste.push(gegen);
            await _commitAus(ebene, [gegen],
                'Konflikt verworfen — der Planerwert gilt', wer);
            return gegen;
        }
        return null;
    }

    /**
     * KONFLIKT-ENTSCHEIDUNG „Übertragen auf …": die Festlegung wandert auf
     * ein anderes Bauteil (die Haltung wurde geteilt, der Nachfolger heisst
     * anders). Ein neuer Eintrag dort + der Gegeneintrag hier, als EIN
     * Vorgang geklammert.
     */
    async function uebertrageAuf(eintragId, zielGlobalId, { wer = '', basis, modell } = {}) {
        const q = eintraege.value.find(e => e.id === eintragId);
        if (!q || !zielGlobalId || zielGlobalId === q.globalId) return [];
        const vorgang = _neueVorgangsId();
        const titel = 'Vom Konflikt übertragen';
        const neu = await eintragen({
            art: q.art, globalId: zielGlobalId, nachher: q.nachher,
            wer, modellSha: q.modellSha,
            basis, modell: modell ?? q.modell,
            vorgang, vorgangTitel: titel,
        });
        const gegen = await verwerfeEinen(q.id, wer);
        if (gegen) { gegen.vorgang = vorgang; gegen.vorgangTitel = titel; }
        const beide = [neu, gegen].filter(Boolean);
        await _commitAus(vorgabeEbene.value, beide,
            `Konflikt übertragen auf ${zielGlobalId}`, wer);
        return beide;
    }

    /**
     * DIE ZEITLEISTE AUF COMMIT-EBENE (U3) — was der Nutzer als
     * Versionsverlauf sieht: oben die offene Sitzung (unversioniert),
     * darunter die Commits, neueste zuerst. `zurueckgenommen` gilt einem
     * Commit, wenn JEDER seiner Schritte einen Gegeneintrag in einem
     * späteren Revert-Commit hat.
     */
    const commitZeitleiste = computed(() => {
        const ebene = vorgabeEbene.value;
        const liste = _liste(ebene).value;
        const je = new Map(liste.map(e => [e.id, e]));
        const revertiert = new Set(liste.map(e => e.ruecknahmeVon).filter(Boolean));

        const zeile = (e) => ({ ...e });
        const eintraegeVon = (ids) => ids.map(id => je.get(id)).filter(Boolean);
        const alsVorgaenge = (schritte) => {
            const gruppen = new Map();
            for (const e of schritte) {
                const schluessel = e.vorgang ?? e.id;
                let v = gruppen.get(schluessel);
                if (!v) {
                    v = { schluessel,
                          titel: e.vorgangTitel ?? (AENDERUNGS_ARTEN[e.art]?.titel ?? e.art),
                          zeilen: [] };
                    gruppen.set(schluessel, v);
                }
                v.zeilen.push(zeile(e));
            }
            return [...gruppen.values()];
        };

        const out = [];
        const s = sitzungJe[ebene].value;
        if (s?.schrittIds.length) {
            const schritte = eintraegeVon(s.schrittIds);
            out.push({
                typ: 'sitzung', id: 'sitzung',
                titel: 'Offene Sitzung — unversioniert',
                wer: s.wer ?? '', wann: schritte.at(-1)?.wann ?? s.begonnen,
                vorgaenge: alsVorgaenge(schritte),
                bauteile: [...new Set(schritte.map(e => e.globalId))],
                arten: [...new Set(schritte.map(e => e.art))],
            });
        }
        for (const c of [...commitsJe[ebene].value].reverse()) {
            const schritte = eintraegeVon(c.schrittIds);
            const revert = schritte.length > 0 && schritte.every(e => e.ruecknahmeVon);
            out.push({
                typ: revert ? 'revert' : 'commit',
                id: c.id, titel: c.nachricht, wer: c.wer, wann: c.wann,
                vorgaenge: alsVorgaenge(schritte),
                bauteile: [...new Set(schritte.map(e => e.globalId))],
                arten: [...new Set(schritte.map(e => e.art))],
                zurueckgenommen: !revert && schritte.length > 0
                    && schritte.every(e => revertiert.has(e.id)),
            });
        }
        return out;
    });

    /**
     * EINEN Commit rückgängig machen — als EIN Revert-Commit (U3).
     *
     * Alle noch offenen Schritte des Commits bekommen Gegeneinträge,
     * rückwärts; zusammen werden sie „Revert: <nachricht>". Angeboten wird
     * das nur für den NEUESTEN offenen Commit — ein Revert mitten in der
     * Historie überschriebe spätere Arbeit am selben Bauteil (der
     * Gegeneintrag ist immer der neueste). `zurueckBisCommit` hangelt sich
     * deshalb vom neuesten abwärts.
     */
    async function revertiereCommit(commitId, wer = '', { ebene } = {}) {
        const ziel = ebene ?? vorgabeEbene.value;
        const c = commitsJe[ziel].value.find(x => x.id === commitId);
        if (!c) return [];
        const liste = _liste(ziel).value;
        const revertiert = new Set(liste.map(e => e.ruecknahmeVon).filter(Boolean));
        const offen = c.schrittIds
            .map(id => liste.find(e => e.id === id))
            .filter(e => e && !e.ruecknahmeVon && !revertiert.has(e.id));
        if (!offen.length) return [];

        const gegenVorgang = _neueVorgangsId();
        const geschrieben = [];
        for (const q of [...offen].reverse()) {
            const eintrag = {
                id: 'ae-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
                art: q.art, globalId: q.globalId,
                vorher: q.nachher, nachher: q.vorher ?? null,
                wer, wann: Date.now(), modellSha: q.modellSha,
                ...(q.basis !== undefined ? { basis: q.basis } : {}),
                ...(q.modell !== undefined ? { modell: q.modell } : {}),
                vorgang: gegenVorgang,
                vorgangTitel: `Revert: ${c.nachricht}`,
                ruecknahmeVon: q.id,
            };
            liste.push(eintrag);
            geschrieben.push(eintrag);
        }
        await _commitAus(ziel, geschrieben, `Revert: ${c.nachricht}`, wer);
        return geschrieben;
    }

    /**
     * Bis VOR einen Commit zurücksetzen — vom neuesten offenen abwärts bis
     * einschliesslich des genannten, je Commit EIN Revert.
     */
    async function zurueckBisCommit(commitId, wer = '', { ebene } = {}) {
        const ziel = ebene ?? vorgabeEbene.value;
        const alle = commitsJe[ziel].value;
        const zielIndex = alle.findIndex(c => c.id === commitId);
        if (zielIndex < 0) return [];
        const geschrieben = [];
        for (let i = alle.length - 1; i >= zielIndex; i--) {
            geschrieben.push(...await revertiereCommit(alle[i].id, wer, { ebene: ziel }));
        }
        return geschrieben;
    }

    // ── Die Sitzung (U2): beginnen, stapeln, entfernen, committen ──────────

    function beginneSitzung({ wer = '', ebene } = {}) {
        const ziel = ebene ?? vorgabeEbene.value;
        if (!sitzungJe[ziel].value) {
            sitzungJe[ziel].value = { begonnen: Date.now(), wer, schrittIds: [] };
        }
        return sitzungJe[ziel].value;
    }

    /** Die Schritte der offenen Sitzung als VORGÄNGE — für Leiste und Dialog. */
    const sitzungVorgaenge = computed(() => {
        const gruppen = new Map();
        for (const e of sitzungSchritte.value) {
            const schluessel = e.vorgang ?? e.id;
            let v = gruppen.get(schluessel);
            if (!v) {
                v = { schluessel, titel: e.vorgangTitel ?? (AENDERUNGS_ARTEN[e.art]?.titel ?? e.art),
                      wann: e.wann ?? 0, zeilen: [] };
                gruppen.set(schluessel, v);
            }
            v.zeilen.push(e);
        }
        for (const v of gruppen.values()) {
            v.bauteile = [...new Set(v.zeilen.map(z => z.globalId))];
        }
        return [...gruppen.values()];
    });

    /**
     * Vorschlag für die Commit-Nachricht — aus den Vorgängen, nicht aus den
     * Rohzeilen: „Sohlhöhen setzen (2×) · Haltung geteilt" sagt, was geschah.
     */
    function nachrichtVorschlag() {
        const zaehler = new Map();
        for (const v of sitzungVorgaenge.value) {
            zaehler.set(v.titel, (zaehler.get(v.titel) ?? 0) + 1);
        }
        return [...zaehler]
            .map(([titel, n]) => (n > 1 ? `${titel} (${n}×)` : titel))
            .join(' · ');
    }

    /**
     * EINEN Vorgang aus der offenen Sitzung entfernen — das Unstaging.
     *
     * ANDERS als `zurueck` auf Commits: die Sitzung ist ein ENTWURF, ihre
     * Schritte verschwinden wirklich (git verwirft eine Arbeitskopie auch,
     * ohne sie zu committen). Zurück kommen SYNTHETISCHE Gegen-Einträge —
     * nur für die Anwendung am Modell, nie für die Historie.
     */
    async function entferneSitzungsVorgang(schluessel, { ebene } = {}) {
        const ziel = ebene ?? vorgabeEbene.value;
        const s = sitzungJe[ziel].value;
        if (!s) return [];
        const liste = _liste(ziel).value;
        const raus = liste.filter(e =>
            s.schrittIds.includes(e.id) && (e.vorgang ?? e.id) === schluessel);
        if (!raus.length) return [];
        const rausIds = new Set(raus.map(e => e.id));
        _liste(ziel).value = liste.filter(e => !rausIds.has(e.id));
        s.schrittIds = s.schrittIds.filter(id => !rausIds.has(id));
        await _sichern(ziel);
        // Rückwärts, wie beim echten Zurücknehmen — der letzte Schritt zuerst.
        return [...raus].reverse().map(q => ({
            art: q.art, globalId: q.globalId,
            vorher: q.nachher, nachher: q.vorher ?? null,
            ...(q.basis !== undefined ? { basis: q.basis } : {}),
            ...(q.modell !== undefined ? { modell: q.modell } : {}),
            synthetisch: true,
        }));
    }

    /** Die ganze Sitzung verwerfen — alle Vorgänge, ein Aufruf. */
    async function verwerfeSitzung({ ebene } = {}) {
        const ziel = ebene ?? vorgabeEbene.value;
        const gegen = [];
        // Vom NEUESTEN Vorgang abwärts — dieselbe Ordnung wie beim Zurücknehmen.
        const vorgaengeRueckwaerts = [...sitzungVorgaenge.value].reverse();
        for (const v of vorgaengeRueckwaerts) {
            gegen.push(...await entferneSitzungsVorgang(v.schluessel, { ebene: ziel }));
        }
        sitzungJe[ziel].value = null;
        await _sichern(ziel);
        return gegen;
    }

    /**
     * Die Sitzung wird ein COMMIT — der Moment, für den alles hier gebaut
     * ist. Die Schritte bleiben, wo sie sind (die Faltung ändert sich um
     * NICHTS); nur ihre Zugehörigkeit wandert vom Entwurf in die Historie.
     */
    async function commitSitzung(nachricht, { wer = '', modellSha = null, ebene } = {}) {
        const ziel = ebene ?? vorgabeEbene.value;
        const s = sitzungJe[ziel].value;
        if (!s || !s.schrittIds.length) { sitzungJe[ziel].value = null; return null; }
        const commit = {
            id: 'c-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
            nachricht: (nachricht ?? '').trim() || nachrichtVorschlag() || 'Bearbeitung',
            wer: wer || s.wer || '',
            wann: Date.now(),
            modellSha,
            schrittIds: [...s.schrittIds],
        };
        commitsJe[ziel].value.push(commit);
        sitzungJe[ziel].value = null;
        await _sichern(ziel);
        return commit;
    }

    /** Leere Sitzung still schliessen (Modus aus ohne einen Schritt). */
    function schliesseLeereSitzung({ ebene } = {}) {
        const ziel = ebene ?? vorgabeEbene.value;
        if (sitzungJe[ziel].value && !sitzungJe[ziel].value.schrittIds.length) {
            sitzungJe[ziel].value = null;
        }
    }

    /**
     * Einträge, die NICHT aus der Hand des Nutzers kommen (Rücknahmen,
     * Konflikt-Entscheidungen), werden ihr EIGENER Commit — auch mitten in
     * einer offenen Sitzung: die Ids werden aus ihr herausgelöst, der
     * Commit steht für sich. Ohne das mischte sich eine
     * Konflikt-Entscheidung in die Arbeit des Nutzers.
     */
    async function _commitAus(ziel, eintraege, nachricht, wer = '') {
        const ids = (eintraege ?? []).filter(Boolean).map(e => e.id);
        if (!ids.length) return null;
        const s = sitzungJe[ziel].value;
        if (s) s.schrittIds = s.schrittIds.filter(id => !ids.includes(id));
        const commit = {
            id: 'c-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
            nachricht, wer, wann: Date.now(),
            modellSha: eintraege.find(e => e?.modellSha)?.modellSha ?? null,
            schrittIds: ids,
        };
        commitsJe[ziel].value.push(commit);
        await _sichern(ziel);
        return commit;
    }

    /** Eine Kennung für einen mehrteiligen Vorgang. */
    function _neueVorgangsId() {
        return 'vg-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    }

    /**
     * Eine Festlegung auf die Auftragsebene heben — der cherry-pick.
     *
     * „Das gilt nicht nur hier, das gilt überall." Der Eintrag WANDERT, er wird
     * nicht kopiert: läge er in beiden Ebenen, überschriebe die Satzfassung die
     * Auftragsfassung für immer, und ein späteres „gilt doch nur hier" wäre
     * nicht mehr davon zu unterscheiden.
     */
    async function hebeAufAuftragsebene(id, wer = '') {
        const i = standEintraege.value.findIndex(e => e.id === id);
        if (i < 0) return null;
        const [eintrag] = standEintraege.value.splice(i, 1);
        auftragsEintraege.value.push({ ...eintrag, gehobenVon: wer || undefined });
        await Promise.all([_sichern('stand'), _sichern('auftrag')]);
        return eintrag;
    }

    /** Alle Änderungen einer Art auf der Arbeitsebene verwerfen. */
    /**
     * @returns {Promise<object[]>} die geschriebenen Gegeneinträge
     *
     * Sie WERDEN zurückgegeben, weil der Aufrufer sie ans Modell bringen muss.
     * Vorher gab die Funktion nichts heraus, und „verwerfen" blieb bis zum
     * Neuladen ohne sichtbare Wirkung — dieselbe Lücke wie bei `zurueck`.
     */
    async function verwerfe(art, wer = '', { ebene } = {}) {
        const ziel = ebene ?? vorgabeEbene.value;
        const geschrieben = [];
        for (const [globalId] of standAus(_liste(ziel).value, art)) {
            const e = await eintragen({ art, globalId, nachher: null, wer, ebene: ziel });
            if (e) geschrieben.push(e);
        }
        return geschrieben;
    }

    /** Die Schritte zu einem Bauteil, neueste zuerst — für die Anzeige. */
    function verlauf(globalId) {
        return eintraege.value.filter(e => e.globalId === globalId).slice().reverse();
    }

    /**
     * Eine Ebene nachladen.
     *
     * Zugewiesen wird NUR, wenn wirklich etwas gespeichert war. Ein blindes
     * `= []` bei leerem Speicher überschriebe Einträge, die zwischen dem Start
     * des Ladens und seiner Antwort geschrieben wurden — der Store legt sich
     * beim Anlegen an, und die erste Bearbeitung kann schneller sein als die
     * RepoFacade. Geleert wird deshalb nur dort, wo es gemeint ist: beim
     * Satzwechsel.
     */
    async function _ladeEbene(ebene) {
        try {
            const gespeichert = await _repoFuer(ebene).get(REPO_KEY);
            if (gespeichert?.version === 2) {
                _uebernimmV2(ebene, gespeichert);
            } else if (Array.isArray(gespeichert) && gespeichert.length) {
                // v1: das flache Vor-Commit-Journal. Entscheidung 2026-09-02:
                // VERWERFEN, nie stillschweigend — die Zeitleiste beginnt
                // frisch, und das Log sagt, was fiel.
                console.info(`[CDE] v1-Journal verworfen (${gespeichert.length} Einträge) — Umstieg auf das Commit-Format`);
            }
        } catch { /* egal — dann bleibt, was da ist */ }
    }

    /**
     * Den aktiven Modellsatz wechseln.
     *
     * Lädt DESSEN Journal nach; die Auftragsebene bleibt stehen. Danach ergibt
     * `wirksamerStand` einen anderen Wert — genau das ist der Variantenwechsel.
     */
    async function setzeSatz(id) {
        satzId.value = id ?? null;
        // HIER ist das Leeren gemeint: die Einträge des vorigen Satzes dürfen
        // nicht stehen bleiben, sonst wanderten sie in den neuen mit.
        standEintraege.value = [];
        commitsJe.stand.value = [];
        sitzungJe.stand.value = null;
        if (!id) return;
        await _ladeEbene('stand');
    }

    async function laden() {
        await _ladeEbene('auftrag');
        if (satzId.value) await _ladeEbene('stand');
    }

    const bereit = laden();

    return {
        neueVorgangsId: _neueVorgangsId,
        auftragsEintraege, standEintraege, satzId, eintraege, vorgabeEbene,
        anzahl, kannZurueck, beruehrteBauteile, kgStand, din277Stand, bereit,
        wirksamerStand, eintragen, zurueck, zurueckBis, verwerfeEinen, hebeBasisAn, uebertrageAuf, vorgaenge, hebeAufAuftragsebene, verwerfe,
        commits, sitzung, sitzungOffen, sitzungSchritte, sitzungVorgaenge,
        beginneSitzung, entferneSitzungsVorgang, verwerfeSitzung, commitSitzung,
        commitZeitleiste, revertiereCommit, zurueckBisCommit,
        schliesseLeereSitzung, nachrichtVorschlag,
        verlauf, setzeSatz, neuLaden: laden,
        schreibKonflikt, setzeWeltversatz,
    };
});
