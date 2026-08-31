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
 *   Merkmalssatz      — `addPsetToElement` schreibt direkt ins IFC-Modell.
 *                       Keine Spur, kein Zurück.
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
    pset:       { titel: 'Merkmalssatz',   icon: 'info',     gleich: gleichTief },
    lage:       { titel: 'Lage',           icon: 'pointer',  beruehrtModell: true, gleich: gleichPunkt },
    parametrik: { titel: 'Maß',            icon: 'measure',  beruehrtModell: true, gleich: gleichTief },
    erzeugt:    { titel: 'Erzeugt',        icon: 'add',      beruehrtModell: true, gleich: gleichTief },
    geloescht:  { titel: 'Gelöscht',       icon: 'delete',   beruehrtModell: true },
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
    const stand = new Map();
    for (const e of eintraege) {
        if (e.art !== art || !e.globalId) continue;
        if (e.nachher === null || e.nachher === undefined) stand.delete(e.globalId);
        else stand.set(e.globalId, { wert: e.nachher, eintrag: e });
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
            await _repoFuer(ebene).set(REPO_KEY, JSON.parse(JSON.stringify(_liste(ebene).value)));
        } catch (fehler) {
            console.warn('cde: aenderungen sichern', fehler?.message ?? fehler);
        }
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
    async function eintragen({ art, globalId, nachher, wer = '', modellSha = null, basis, modell, ebene }) {
        if (!(art in AENDERUNGS_ARTEN) || !globalId) return null;
        const ziel = ebene ?? vorgabeEbene.value;
        const stand = wirksamerStand(art);
        const vorher = stand.has(globalId) ? stand.get(globalId) : null;
        // Dieselbe Zuweisung noch einmal ist keine Änderung — sonst füllt sich
        // das Journal mit Schritten, die nichts tun, und „zurück" braucht
        // mehrere Klicks für einen sichtbaren Effekt. Der Vergleich kommt aus
        // der Art: Objektwerte (Anker, Maße) tragen kein `===`.
        if (gleichFuer(art)(vorher, nachher ?? null)) return null;

        const eintrag = {
            id: 'ae-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
            art, globalId, vorher, nachher: nachher ?? null,
            wer, wann: Date.now(), modellSha,
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
        const letzter = letzterOffener(_liste(ziel).value);
        if (!letzter) return null;
        const eintrag = {
            id: 'ae-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
            art: letzter.art, globalId: letzter.globalId,
            vorher: letzter.nachher, nachher: letzter.vorher,
            wer, wann: Date.now(), modellSha: letzter.modellSha,
            // Die Rücknahme erbt Bezugspunkt und Modell des Schrittes, den sie
            // zurücknimmt. Ohne das verlöre der Gegeneintrag seine `basis` und
            // gälte beim Nachspielen als „ohne Basis" — ausgerechnet der
            // Eintrag, der am Ende gilt.
            ...(letzter.basis !== undefined ? { basis: letzter.basis } : {}),
            ...(letzter.modell !== undefined ? { modell: letzter.modell } : {}),
            ruecknahmeVon: letzter.id,
        };
        _liste(ziel).value.push(eintrag);
        await _sichern(ziel);
        return eintrag;
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
    async function verwerfe(art, wer = '', { ebene } = {}) {
        const ziel = ebene ?? vorgabeEbene.value;
        for (const [globalId] of standAus(_liste(ziel).value, art)) {
            await eintragen({ art, globalId, nachher: null, wer, ebene: ziel });
        }
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
            if (Array.isArray(gespeichert)) _liste(ebene).value = gespeichert;
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
        if (!id) return;
        await _ladeEbene('stand');
    }

    async function laden() {
        await _ladeEbene('auftrag');
        if (satzId.value) await _ladeEbene('stand');
    }

    const bereit = laden();

    return {
        auftragsEintraege, standEintraege, satzId, eintraege, vorgabeEbene,
        anzahl, kannZurueck, beruehrteBauteile, kgStand, din277Stand, bereit,
        wirksamerStand, eintragen, zurueck, hebeAufAuftragsebene, verwerfe,
        verlauf, setzeSatz, neuLaden: laden,
    };
});
