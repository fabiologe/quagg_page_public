/**
 * Viewer = Satz (Fahrplan „Klare Abläufe", S3, D1) — rein, ohne Engine.
 *
 * Leitsatz: WAS DU SIEHST, IST DER SATZ. Bis hierher wechselte ein Satz nur
 * die Verlaufsebene; geladen blieb, was gerade offen war, und nachgespielt
 * wurde erst beim nächsten Modell — einmal je Modell. Diese Datei sagt,
 * welche Modelle ein Satz zeigt und was beim Wechsel zu laden und zu
 * entladen ist; ausführen tut es `IfcViewer.zeigeSatz`.
 */

import { gleicheLinie, istAbgabeContainer } from './Herkunft.js';

const istModell = (d) => (d?.art ?? 'modell') === 'modell';
/** Ein Erdbau-Dokument, das aus DIESEM Satz ausgegeben wurde (K3). */
const ausDiesemSatz = (d, satz) => d?.herkunft?.art === 'erdbau' && !!satz?.id && d.herkunft.satz_id === satz.id;

/**
 * Die MODELLE eines Satzes, in Satz-Reihenfolge — die Reihenfolge zählt: das
 * erste Modell setzt den Weltrahmen. Ohne Abgabe-Container (Verbund) und
 * ohne ein Erdbau-Dokument aus diesem Satz (K3: dort baut der Verlauf den
 * eigenen Bau; in anderen Sätzen ist es ein normales Modell).
 */
export function satzModelle(satz, dokumente) {
    if (!satz) return [];
    const register = new Map((dokumente ?? []).map(d => [d.sha256, d]));
    const aus = [];
    for (const sha of satz.enthaelt ?? []) {
        const d = register.get(sha) ?? (satz.dokumente ?? []).find(x => x.sha256 === sha);
        if (!d || !istModell(d) || istAbgabeContainer(d) || ausDiesemSatz(d, satz)) continue;
        aus.push(d);
    }
    return aus;
}

/** Namen der Erdbau-Dokumente, die der Satz führt, die er aber nicht zeigt (K3) — gesagt wird es in einer Zeile. */
export function ausgelasseneErdbau(satz, dokumente) {
    if (!satz) return [];
    const register = new Map((dokumente ?? []).map(d => [d.sha256, d]));
    return (satz.enthaelt ?? []).map(sha => register.get(sha)).filter(d => ausDiesemSatz(d, satz)).map(d => d.name ?? d.sha256);
}

/**
 * K1: der erste Satz eines Projekts, „Bestand" — jede LIEFERUNG, je Linie
 * nur die jüngste Revision (zwei Revisionen desselben Modells lehnt der
 * Server ohnehin ab). Was die CDE erzeugt hat, ist Ergebnis, kein Bestand.
 */
export function bestandAus(dokumente) {
    const aus = [];
    for (const d of dokumente ?? []) {
        if (!istModell(d) || d?.herkunft?.art) continue;
        const i = aus.findIndex(x => gleicheLinie(x, d));
        if (i < 0) aus.push(d);
        else if ((d.revision ?? 1) > (aus[i].revision ?? 1)) aus[i] = d;
    }
    return aus;
}

/**
 * Was beim Wechsel zu tun ist.
 *
 * Wechselt das ERSTE Modell, gilt der Weltrahmen nicht mehr (der Ladeversatz
 * des ersten Modells hebt jeden Anker im Verlauf) — dann wird alles neu
 * geladen, in Satz-Reihenfolge (`allesNeu`). Sonst nur der Unterschied.
 *
 * @param {{geladen: string[], soll: string[]}} o  Kennungen (sha256) in Lade- bzw. Satz-Reihenfolge
 * @returns {{entladen: string[], laden: string[], allesNeu: boolean}}
 */
export function satzAbgleich({ geladen = [], soll = [] } = {}) {
    const allesNeu = geladen.length > 0 && soll.length > 0 && geladen[0] !== soll[0];
    if (allesNeu) return { entladen: [...geladen], laden: [...soll], allesNeu };
    const sollMenge = new Set(soll);
    const gelMenge = new Set(geladen);
    return { entladen: geladen.filter(s => !sollMenge.has(s)), laden: soll.filter(s => !gelMenge.has(s)), allesNeu: false };
}

/**
 * Den Plan ausführen — erst entladen, dann laden, eins nach dem anderen (die
 * Ablage nimmt nur EINE Ladung zugleich). Ein neuerer Wechsel bricht einen
 * älteren ab: `aktuell()` wird vor jedem Schritt gefragt.
 *
 * @returns {Promise<{entladen: number, geladen: number, fehlend: string[], abgebrochen: boolean}>}
 */
export async function satzUmsetzen({ plan, entlade, lade, aktuell = () => true }) {
    const r = { entladen: 0, geladen: 0, fehlend: [], abgebrochen: false };
    for (const sha of plan?.entladen ?? []) {
        if (!aktuell()) return { ...r, abgebrochen: true };
        await entlade(sha);
        r.entladen += 1;
    }
    for (const sha of plan?.laden ?? []) {
        if (!aktuell()) return { ...r, abgebrochen: true };
        const ok = await lade(sha);
        if (ok === false) r.fehlend.push(sha);
        else r.geladen += 1;
    }
    return r;
}
