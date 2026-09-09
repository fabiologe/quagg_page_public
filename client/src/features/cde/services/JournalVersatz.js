/**
 * Journal-Anker überleben den Ladeversatz (Lücke ⑤ / Stufe 13.4, 2026-09-02).
 *
 * Der Befund stand als JOURNAL_WARNUNG in `Hoehenbezug.js`: alle Punktwerte
 * des Journals sind Three-Weltkoordinaten, und die Welt hängt am Ladeversatz
 * (`COORDINATE_TO_ORIGIN` schiebt das Modell um sein Bounding-Box-Minimum).
 * Liefert der Planer Revision B mit auch nur EINEM bewegten Bauteil, kann
 * sich das Minimum ändern — und damit läge JEDER gespeicherte Anker daneben:
 * der Drei-Wege-Vergleich meldete flächendeckend Konflikte, genau dann, wenn
 * er gebraucht wird.
 *
 * Die Kur ist eine NACHFÜHRUNG statt eines Formatwechsels: die gesicherte
 * Nutzlast trägt den Rahmen-Versatz (`versatzMerker`), unter dem sie
 * geschrieben wurde. Weicht der aktuelle ab, werden alle Punktfelder um das
 * Delta verschoben (roh = weltAlt + versatzAlt ⇒ weltNeu = weltAlt + (alt −
 * neu)) — eine reine Translation, die Bautoleranz von `gleichPunkt` und alle
 * fünfzehn Journal-Invarianten bleiben unberührt.
 *
 * WELCHE Felder Punkte sind, weiss nicht diese Datei, sondern die Quelle der
 * Werte: `lage`-Felder stehen hier, Bauplan-Parameter deklariert jedes
 * REZEPT selbst (`verschiebe`) — ein neues Rezept ohne Deklaration fällt im
 * Wächtertest, nicht erst an einer verschobenen Revision.
 */
import { rezeptNach, REZEPTE } from './Bauteilrezepte.js';
import { ABLEITUNGEN } from './ableitung/Ableitungen.js';

function _istPunkt(p) {
    return p && typeof p === 'object'
        && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}

/** {x,y,z} + delta — alles andere unverändert zurück. */
export function verschiebePunkt(p, delta) {
    if (!_istPunkt(p)) return p;
    return { ...p, x: p.x + delta.x, y: p.y + delta.y, z: p.z + delta.z };
}

/**
 * EINEN Journaleintrag in den neuen Rahmen heben. Gibt bei punktlosen Arten
 * (kg, pset, parametrik …) denselben Eintrag zurück — kein Klon auf Vorrat.
 */
export function verschiebeEintrag(eintrag, delta) {
    if (!eintrag || typeof eintrag !== 'object') return eintrag;
    let neu = eintrag;
    const setze = (feld, wert) => { neu = neu === eintrag ? { ...eintrag } : neu; neu[feld] = wert; };

    if (eintrag.art === 'lage') {
        for (const feld of ['nachher', 'vorher', 'basis']) {
            if (_istPunkt(eintrag[feld])) setze(feld, verschiebePunkt(eintrag[feld], delta));
        }
    }
    if (eintrag.art === 'erzeugt' && eintrag.nachher?.rezept) {
        const rezept = rezeptNach(eintrag.nachher.rezept);
        if (typeof rezept?.verschiebe === 'function' && eintrag.nachher.parameter) {
            setze('nachher', {
                ...eintrag.nachher,
                parameter: rezept.verschiebe(eintrag.nachher.parameter, delta),
            });
        }
    }
    if (_istPunkt(eintrag.bezug?.zielBasis)) {
        setze('bezug', { ...eintrag.bezug, zielBasis: verschiebePunkt(eintrag.bezug.zielBasis, delta) });
    }
    return neu;
}

/** Ist das Delta der Rede wert? Unter einem Zehntelmillimeter: nein. */
export function nennenswert(delta) {
    return !!delta && (Math.abs(delta.x) > 1e-4 || Math.abs(delta.y) > 1e-4 || Math.abs(delta.z) > 1e-4);
}

export function deltaZwischen(merker, aktuell) {
    if (!merker || !aktuell) return null;
    return { x: merker.x - aktuell.x, y: merker.y - aktuell.y, z: merker.z - aktuell.z };
}

/** Wächter-Helfer: jedes Rezept MUSS deklarieren, wie es verschoben wird. */
export function rezepteOhneVerschiebe() {
    return rezepteOhneDeklaration('verschiebe');
}

/** Wächter-Helfer über BEIDE Register: welches Rezept deklariert `feld` nicht? */
export function rezepteOhneDeklaration(feld) {
    return [...Object.values(REZEPTE), ...Object.values(ABLEITUNGEN)]
        .filter(r => typeof r[feld] !== 'function')
        .map(r => r.id);
}

/**
 * Welche Ableitung nennt einen Quellen-Schlitz in `formen`, aber nicht in
 * `braucht`?
 *
 * Das Formpaar-Gate prüft nur Schlitze, für die `braucht` etwas sagt. Ein
 * neues Rezept mit `formen: {x: 'raster'}` und ohne `braucht.x` liefe also
 * still OHNE Gate — und das fiele niemandem auf, weil alles funktioniert,
 * bis jemand die falsche Quelle wählt. Ein fehlendes Gate sieht aus wie ein
 * zufriedenes.
 *
 * @returns {string[]} „<rezeptId>.<schlitz>" je Lücke
 */
export function ableitungenOhneFormpaar() {
    const out = [];
    for (const r of Object.values(ABLEITUNGEN)) {
        for (const schlitz of Object.keys(r?.formen ?? {})) {
            if (!Array.isArray(r?.braucht?.[schlitz]) || !r.braucht[schlitz].length) {
                out.push(`${r.id}.${schlitz}`);
            }
        }
    }
    return out;
}
