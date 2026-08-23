/**
 * useAnnotStore — der EINZIGE Mutationspunkt für Annotationen.
 *
 * Jede Mutation läuft als Kommando über den Stack (Undo/Redo); Kommandos
 * tragen VOLLSTÄNDIGE Objekt-Klone (siehe useCommandStack-Kopfkommentar).
 * Persistenz: debounced 250 ms als JSON-Container in die PdfRepo
 * (`doc:<id>:annotations`), Muster useIfcStore.
 *
 * Radierer-Züge sind EINE Undo-Einheit: während des Zugs verschwinden
 * Striche sofort sichtbar, das Kommando entsteht erst am Zugende gesammelt.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { repo } from '../services/PdfRepo';
import { erzeugeCommandStack, klon } from '../composables/useCommandStack';

const SCHEMA_VERSION = 1;
const PERSIST_MS = 250;

export const useAnnotStore = defineStore('pdfed-annot', () => {
    const items = ref([]);
    const geladenFuer = ref(null);
    const zCounter = ref(1);

    const stack = erzeugeCommandStack(100);
    const canUndo = stack.canUndo;
    const canRedo = stack.canRedo;

    /** Seite → Annotationen; Painter und Treffer-Tests filtern hierüber. */
    const proSeite = computed(() => {
        const m = new Map();
        for (const a of items.value) {
            let liste = m.get(a.page);
            if (!liste) { liste = []; m.set(a.page, liste); }
            liste.push(a);
        }
        return m;
    });

    // ── Persistenz ──────────────────────────────────────────────────────────

    let persistTimer = 0;
    function _persist() {
        if (!geladenFuer.value) return;
        clearTimeout(persistTimer);
        const dokId = geladenFuer.value;
        persistTimer = setTimeout(() => {
            repo.set(`doc:${dokId}:annotations`, {
                schemaVersion: SCHEMA_VERSION,
                zCounter: zCounter.value,
                items: klon(items.value),
            });
        }, PERSIST_MS);
    }

    async function laden(dokId) {
        clearTimeout(persistTimer);
        stack.leere();
        auswahl.value = null;
        geladenFuer.value = dokId;
        const container = await repo.get(`doc:${dokId}:annotations`);
        if (geladenFuer.value !== dokId) return;   // inzwischen anderes Dokument
        // Migrations-Haken: künftige Schemaänderungen wandeln hier um.
        items.value = Array.isArray(container?.items) ? container.items : [];
        zCounter.value = container?.zCounter ?? (items.value.length + 1);
    }

    function leeren() {
        clearTimeout(persistTimer);
        stack.leere();
        auswahl.value = null;
        geladenFuer.value = null;
        items.value = [];
        zCounter.value = 1;
    }

    // ── Kommando-Anwendung (auch von Undo/Redo genutzt) ─────────────────────

    function _einfuegen(klone) {
        items.value = [...items.value, ...klone.map(klon)];
    }
    function _entfernen(ids) {
        const menge = new Set(ids);
        items.value = items.value.filter(a => !menge.has(a.id));
    }
    function _ersetzen(klone) {
        const nachId = new Map(klone.map(a => [a.id, a]));
        items.value = items.value.map(a => nachId.has(a.id) ? klon(nachId.get(a.id)) : a);
    }

    // ── Öffentliche Mutationen ──────────────────────────────────────────────

    /** @returns die fertige Annotation (mit id/z) */
    function fuegeHinzu(daten) {
        const annot = {
            id: crypto.randomUUID(),
            z: zCounter.value++,
            createdAt: Date.now(),
            rev: 0,
            ...daten,
        };
        stack.push({ typ: 'add', nachher: [klon(annot)] });
        _einfuegen([annot]);
        _persist();
        return annot;
    }

    function entferne(ids) {
        const menge = new Set(ids);
        const vorher = items.value.filter(a => menge.has(a.id)).map(klon);
        if (!vorher.length) return;
        stack.push({ typ: 'remove', vorher });
        _entfernen(ids);
        _persist();
    }

    /**
     * @param {Array<{id: string, patch: object}>} aenderungen
     * Punkte-Änderungen (Verschieben) müssen `rev` erhöhen — der Umriss-Cache
     * hängt an id+rev.
     */
    function aktualisiere(aenderungen) {
        const nachId = new Map(aenderungen.map(ae => [ae.id, ae.patch]));
        const vorher = [], nachher = [];
        for (const a of items.value) {
            const patch = nachId.get(a.id);
            if (!patch) continue;
            vorher.push(klon(a));
            const neu = { ...a, ...patch, modifiedAt: Date.now() };
            if (patch.points) neu.rev = (a.rev ?? 0) + 1;
            nachher.push(klon(neu));
        }
        if (!vorher.length) return;
        stack.push({ typ: 'update', vorher, nachher });
        _ersetzen(nachher);
        _persist();
    }

    // ── Radierer-Zug als eine Undo-Einheit ──────────────────────────────────
    // Der Punkt-Radierer ERSETZT Striche durch ihre überlebenden Teilstücke;
    // die Buchführung trennt „im Zug entfernte Originale" von „im Zug
    // erzeugten Fragmenten". Wird ein Fragment im selben Zug weiter zerteilt
    // oder ganz wegradiert, verschwindet es nur aus der Fragmentliste — es
    // taucht im Undo-Kommando nie auf.

    let radierZug = null;   // { entfernt: Map<id, Klon>, hinzugefuegt: Map<id, Klon> }

    function starteRadieren() {
        radierZug = { entfernt: new Map(), hinzugefuegt: new Map() };
    }

    function _bucheEntfernung(annot) {
        if (radierZug.hinzugefuegt.has(annot.id)) {
            radierZug.hinzugefuegt.delete(annot.id);
        } else if (!radierZug.entfernt.has(annot.id)) {
            radierZug.entfernt.set(annot.id, klon(annot));
        }
    }

    function radiere(ids) {
        if (!radierZug) starteRadieren();
        const menge = new Set(ids);
        for (const a of items.value) {
            if (menge.has(a.id)) _bucheEntfernung(a);
        }
        _entfernen(ids);
        _persist();
    }

    /**
     * Punkt-Radierer: Original raus, überlebende Teilstücke rein — innerhalb
     * des laufenden Radier-Zugs (EIN Undo-Schritt am Zugende).
     * @param {object} original           die getroffene Annotation
     * @param {Array<object>} fragmente   Rohdaten ohne id/rev (Kopfdaten + points)
     */
    function ersetzeBeimRadieren(original, fragmente) {
        if (!radierZug) starteRadieren();
        _bucheEntfernung(original);
        _entfernen([original.id]);
        const neue = fragmente.map(d => ({
            id: crypto.randomUUID(),
            rev: 0,
            createdAt: Date.now(),
            ...d,
        }));
        for (const n of neue) radierZug.hinzugefuegt.set(n.id, klon(n));
        _einfuegen(neue);
        _persist();
    }

    function beendeRadieren() {
        if (radierZug) {
            const vorher = [...radierZug.entfernt.values()];
            const nachher = [...radierZug.hinzugefuegt.values()];
            if (vorher.length && nachher.length) {
                stack.push({ typ: 'ersetzen', vorher, nachher });
            } else if (vorher.length) {
                stack.push({ typ: 'remove', vorher });
            }
        }
        radierZug = null;
    }

    // ── Auswahl (Lasso) ─────────────────────────────────────────────────────
    // Nur Ansichtszustand — Mutationen an der Auswahl laufen als Kommandos.

    const auswahl = ref(null);           // { page, ids: string[] } | null
    const offeneNotizId = ref(null);     // Kommentar-Popover, das gerade offen ist
    const offenesTextfeldId = ref(null); // Textfeld im Bearbeitungsmodus
    // Der Außenklick schließt den Editor schon beim pointerdown; der
    // zugehörige pointerup darf dann kein NEUES Feld anlegen (Zeitfenster).
    const textfeldGeschlossenUm = ref(0);

    function setzeAuswahl(page, ids) {
        auswahl.value = ids.length ? { page, ids: [...ids] } : null;
    }

    function leereAuswahl() { auswahl.value = null; }

    const auswahlItems = computed(() => {
        if (!auswahl.value) return [];
        const menge = new Set(auswahl.value.ids);
        return items.value.filter(a => menge.has(a.id));
    });

    /** Auswahl um (dxPt, dyPt) verschieben — EIN Undo-Schritt. */
    function verschiebeAuswahl(dxPt, dyPt) {
        if (!auswahl.value) return;
        const aenderungen = auswahlItems.value.map(a => {
            if (a.type === 'ink') {
                return { id: a.id, patch: { points: a.points.map(([x, y, p]) => [x + dxPt, y + dyPt, p]) } };
            }
            return { id: a.id, patch: { x: a.x + dxPt, y: a.y + dyPt } };
        });
        aktualisiere(aenderungen);
    }

    function loescheAuswahl() {
        if (!auswahl.value) return;
        entferne(auswahl.value.ids);
        leereAuswahl();
    }

    // ── Undo/Redo ───────────────────────────────────────────────────────────

    function undo() {
        const k = stack.undo();
        if (!k) return;
        leereAuswahl();   // die Auswahl könnte auf entfernte Objekte zeigen
        if (k.typ === 'add') _entfernen(k.nachher.map(a => a.id));
        else if (k.typ === 'remove') _einfuegen(k.vorher);
        else if (k.typ === 'update') _ersetzen(k.vorher);
        else if (k.typ === 'ersetzen') {
            _entfernen(k.nachher.map(a => a.id));
            _einfuegen(k.vorher);
        }
        _persist();
    }

    function redo() {
        const k = stack.redo();
        if (!k) return;
        leereAuswahl();
        if (k.typ === 'add') _einfuegen(k.nachher);
        else if (k.typ === 'remove') _entfernen(k.vorher.map(a => a.id));
        else if (k.typ === 'update') _ersetzen(k.nachher);
        else if (k.typ === 'ersetzen') {
            _entfernen(k.vorher.map(a => a.id));
            _einfuegen(k.nachher);
        }
        _persist();
    }

    return {
        items, proSeite, geladenFuer, canUndo, canRedo,
        laden, leeren,
        fuegeHinzu, entferne, aktualisiere,
        starteRadieren, radiere, ersetzeBeimRadieren, beendeRadieren,
        auswahl, auswahlItems, setzeAuswahl, leereAuswahl,
        verschiebeAuswahl, loescheAuswahl, offeneNotizId, offenesTextfeldId,
        textfeldGeschlossenUm,
        undo, redo,
    };
});
