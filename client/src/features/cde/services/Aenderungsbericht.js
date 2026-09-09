/**
 * Aenderungsbericht — das Journal als Dokument (Stufe 9.5, jetzt fällig).
 *
 * DER WICHTIGSTE AUSGANG der CDE: Es gibt keinen Weg von Fragments zurück
 * nach IFC, und es soll keinen geben — die CDE ändert das Autorenmodell
 * nicht, sie stellt FORDERUNGEN (ISO 19650). Dieser Bericht ist die Form,
 * in der die Forderung den Planer erreicht: was gilt (der wirksame Stand),
 * wie es dazu kam (der Verlauf, je Vorgang), und was beim Nachspielen
 * hakte (die Konflikte — nichts verschwindet still).
 *
 * ZWEI HERKÜNFTE, EIN KENNZEICHEN: `modell: 'cde'` heisst „eigenes
 * Bauteil" (die CDE hat es selbst gebaut — Eigenleistung), alles andere
 * ist eine Forderung an den Planer. Genau die Trennlinie aus Teil IX
 * („geliefert = Forderung, Eigenes = echt"), hier als Wort im Dokument.
 *
 * Rein: kein Vue, kein jsPDF — der Bericht ist eine Datenstruktur, der
 * PDF-Schreiber daneben nur ihre Darstellung.
 */
import { AENDERUNGS_ARTEN, beschreibeWert, standMitEintrag } from '../stores/useAenderungen.js';

const _wann = (ms) => (Number.isFinite(ms)
    ? new Date(ms).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
    : '');

/** Der Name eines Bauteils, so gut ihn der Eintrag hergibt. */
function _bauteilName(eintrag) {
    const name = eintrag?.nachher?.name;
    return name ? `${name} (${eintrag.globalId})` : (eintrag?.globalId ?? '—');
}

function _zeile(eintrag, wert) {
    const art = AENDERUNGS_ARTEN[eintrag.art] ?? { titel: eintrag.art };
    return {
        bauteil: _bauteilName(eintrag),
        globalId: eintrag.globalId,
        art: art.titel ?? eintrag.art,
        text: beschreibeWert(eintrag.art, wert ?? eintrag.nachher, eintrag.basis ?? null),
        eigen: eintrag.modell === 'cde',
        // Die MOMENTAUFNAHME aus dem Eintrag (14.4): was beim Setzen bekannt
        // war. Nie neu gerechnet — der Bericht sagt, was der Bearbeiter
        // wusste, nicht was heute gälte.
        befunde: (eintrag.befunde ?? []).map(b => b.text).filter(Boolean),
        wer: eintrag.wer ?? '',
        wann: _wann(eintrag.wann),
    };
}

/**
 * @param {object} opts
 * @param {Array}  opts.eintraege   das Journal (chronologisch, append-only)
 * @param {Array}  [opts.konflikte] aus dem letzten Nachspielen
 * @param {object} [opts.meta]      { projekt, modell, modellSha }
 */
export function baueBericht({ eintraege = [], konflikte = [], meta = {}, zeitleiste = null } = {}) {
    // ── 1. Der wirksame Stand: die eigentliche Forderungsliste. ────────────
    //
    // AUSLEGUNGEN gehören NICHT hierher. Der Bericht geht an den Planer und
    // sagt, was er ändern soll. „Dieser Körper ist für uns ein Höhenfeld" ist
    // keine Forderung, sondern unsere Lesart seiner Datei — in der
    // Forderungsliste stünde sie als Arbeitsauftrag, den niemand ausführen
    // kann. Sie wandert stattdessen in einen eigenen Block: der Planer soll
    // sehen, WIE wir sein Modell gelesen haben, denn wenn wir falsch liegen,
    // liegen alle daraus abgeleiteten Massen falsch.
    const stand = [];
    const auslegung = [];
    for (const [art, meta_] of Object.entries(AENDERUNGS_ARTEN)) {
        const ziel = meta_?.auslegung ? auslegung : stand;
        for (const [, { wert, eintrag }] of standMitEintrag(eintraege, art)) {
            if (wert === null || wert === undefined) continue;   // aufgehoben
            ziel.push(_zeile(eintrag, wert));
        }
    }

    // ── 2. Der Verlauf. Seit U3 kommt er aus der COMMIT-Zeitleiste: je
    //    Commit ein Abschnitt mit seiner NACHRICHT — die offene Sitzung als
    //    „unversioniert" gekennzeichnet. Ohne Zeitleiste (Altaufrufer,
    //    Tests) gilt die Vorgangs-Gruppierung wie bisher.
    const verlauf = [];
    if (zeitleiste) {
        for (const v of zeitleiste) {
            verlauf.push({
                schluessel: v.id,
                titel: v.typ === 'sitzung' ? `${v.titel} (unversioniert)` : v.titel,
                wer: v.wer ?? '',
                wann: _wann(v.wann),
                zeilen: (v.vorgaenge ?? []).flatMap(vg => vg.zeilen.map(e => _zeile(e))),
            });
        }
    }
    for (const e of (zeitleiste ? [] : eintraege)) {
        const schluessel = e.vorgang ?? e.id;
        const letzter = verlauf[verlauf.length - 1];
        const zeile = _zeile(e);
        if (letzter && letzter.schluessel === schluessel) {
            letzter.zeilen.push(zeile);
        } else {
            verlauf.push({
                schluessel,
                titel: e.vorgangTitel
                    ?? (AENDERUNGS_ARTEN[e.art]?.titel ?? e.art),
                wer: e.wer ?? '',
                wann: _wann(e.wann),
                zeilen: [zeile],
            });
        }
    }

    const bearbeiter = [...new Set(eintraege.map(e => e.wer).filter(Boolean))];

    return {
        kopf: {
            titel: 'Änderungsbericht',
            datum: _wann(Date.now()),
            projekt: meta.projekt ?? '',
            modell: meta.modell ?? '',
            modellSha: meta.modellSha ?? '',
            bearbeiter,
            anzahlEintraege: eintraege.length,
            anzahlVorgaenge: verlauf.length,
        },
        stand,
        // „So liest die CDE dieses Modell" — kein Änderungswunsch.
        auslegung,
        verlauf,
        konflikte: (konflikte ?? []).map(k => ({
            globalId: k.globalId,
            art: AENDERUNGS_ARTEN[k.art]?.titel ?? k.art ?? '',
            zustand: k.zustand ?? '',
            grund: k.grund ?? '',
        })),
    };
}
