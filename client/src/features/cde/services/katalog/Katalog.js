/**
 * Den Katalog laden — Typprofile, Bauformregeln, Rezepte, Plansymbole und
 * Regelwerk der Bibliothek —,
 * GEPRÜFT, an einer Stelle (Teil XXIII, A5).
 *
 * Vorrang wie überall: Projekt schlägt Büro schlägt eingebaut. Was die
 * Prüfung nicht besteht, steht in `befunde` (Art, Id, Ebene, Gründe) und ist
 * NICHT aktiv; das eingebaute Gegenstück gilt weiter.
 */
import { ladeSatz } from '../bauform/Typprofile.js';
import { ladeRegeln } from '../bauform/Bauformregeln.js';
import { ladeRegelwerk, ladeRezepte, ladeSymbole } from '../Bibliothek.js';
import { setzeRegelwerk } from '../regeln/Regelwerk.js';
import { registriereSymbole } from '../PlanSymbols.js';
import { eingebauteRollen, pruefeEintrag, tabelleAusJson } from './Katalogschema.js';
import { rezeptAusDeklaration } from '../rezept/Rezeptbau.js';
import { registerStand, setzeRegistrierte } from '../rezept/Register.js';

/**
 * Rezept-Deklarationen registrieren — ERSETZT den bisherigen Satz.
 * @returns {{aktiv: string[], befunde: object[], stand: number}}
 */
export function registriereRezepte(deklarationen) {
    const befunde = [];
    const aktiv = [];
    for (const d of deklarationen ?? []) {
        const { herkunft, ...rein } = d ?? {};
        const { ok, fehler } = pruefeEintrag('rezept', rein);
        if (!ok) { befunde.push({ art: 'rezept', id: d?.id ?? null, ebene: herkunft ?? null, fehler }); continue; }
        aktiv.push({ ...rezeptAusDeklaration(rein), herkunft: herkunft ?? null });
    }
    setzeRegistrierte(aktiv);
    return { aktiv: aktiv.map(r => r.id), befunde, stand: registerStand() };
}

/**
 * @param {object} repo       RepoFacade (mit `mitVorrang`, `get`, `buero`)
 * @param {{rollen?: Set<string>}} [opt]  bekannte Typprofil-Rollen — der Aufrufer
 *        kennt die Werkzeuge (L3); ohne gilt der Wortschatz der eingebauten Profile
 */
export async function ladeKatalog(repo, { rollen = null } = {}) {
    const befunde = [];
    const bekannt = rollen ?? eingebauteRollen();
    // EIN Zug, parallel — wer den Katalog anfragt, wartet einmal, nicht fünfmal.
    const [symbole, regelwerk, profilSatz, regeln, rezepte] = await Promise.all([
        ladeSymbole(repo),
        ladeRegelwerk(repo),
        ladeSatz(repo, { pruefe: (p) => pruefeEintrag('typprofil', p, { rollen: bekannt }), befunde }),
        ladeRegeln(repo, { pruefe: (r) => pruefeEintrag('bauformregel', r), befunde }),
        ladeRezepte(repo, { pruefen: false }),
    ]);
    // Symbole VOR den Rezepten: ein Rezept der Bibliothek darf ein Symbol der
    // Bibliothek nennen — geprüft wird es beim Registrieren.
    registriereSymbole(symbole.eintraege);
    // Das Regelwerk (AR): Grenzwerte und Tabellen, Projekt schlägt Büro je Id.
    setzeRegelwerk(regelwerk.eintraege.map(e => ({ ...e, wert: tabelleAusJson(e.id, e.wert) })));
    const reg = registriereRezepte(rezepte.eintraege);
    befunde.push(...symbole.befunde, ...regelwerk.befunde, ...reg.befunde);
    return { profilSatz, regeln, rezepte: reg.aktiv, befunde, stand: reg.stand };
}
