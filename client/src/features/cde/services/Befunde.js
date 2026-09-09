/**
 * Befunde — was an einem Bauteil auffällt (Stufe 14.4).
 *
 * FÜNF REGELN, die vor der ersten Prüfung feststanden:
 *
 *  1. **Abgeleitet, nie gespeichert.** Dieselbe Regel wie beim Konflikt und
 *     bei der Herkunft. Ein abgelegter Befund läuft auseinander — unbemerkt,
 *     weil er plausibel aussieht. Diese Datei rechnet, sie merkt sich nichts.
 *
 *  2. **Beraten, nicht verbieten** (Fabios Entscheidung). Wer ein Gefälle
 *     unter Mindestmass braucht — Düker, Bestand, Zwangspunkt —, muss es
 *     setzen können. Kein Befund hält je eine Festlegung auf. Deshalb gibt es
 *     hier auch keine Schwere „Fehler": was die Daten wirklich zerstören
 *     würde, fängt die Feldprüfung ab (`Bearbeitungen.pruefe`), nicht diese
 *     Datei.
 *
 *  3. **Der Befund wandert MIT in den Journaleintrag** — als Momentaufnahme.
 *     Sonst ist später nicht unterscheidbar, ob jemand es wusste.
 *
 *  4. **Grenzwerte sind DATEN, nicht Code.** `REGELWERK` unten ist die
 *     Vorgabe und gehört auf die Büro-Ebene (`repo.buero`, Vorrang Projekt →
 *     Büro → eingebaut), genau wie die Typprofile. Ein Grenzwert im Programm
 *     wäre eine Auslieferung je Regeländerung.
 *
 *  5. **Mit Herkunft.** Jeder Befund nennt seinen Wert, seine Grenze und
 *     woher sie kommt — dasselbe Muster wie `warum` an den Typprofilen und
 *     die Provenienz im Resolver.
 *
 * ZU DEN VORGABEWERTEN: Sie sind Faustregeln, keine zitierten Normzahlen. Das
 * Mindestgefälle 1:DN ist die gängige Näherung für Selbstreinigung; die
 * übrigen Werte sind Erfahrungsgrössen. Sie stehen hier, damit die Prüfung
 * überhaupt anläuft — das Büro ersetzt sie durch seine eigenen. Deshalb trägt
 * jeder Befund die Grenze sichtbar bei sich, statt sie zu verschweigen.
 *
 * Reines Modul: kein Vue, kein three, kein WebGL, keine Engine.
 */

/** Die Vorgabe-Grenzwerte. Auf der Büro-Ebene überschreibbar. */
export const REGELWERK = Object.freeze({
    /** ‰; `null` heisst „1:DN rechnen" (DN 300 ⇒ 3,3 ‰). */
    gefaelleMindestPromille: null,
    /** ‰; darüber wird die Sohle ausgespült. */
    gefaelleHoechstPromille: 100,
    /** m; kürzere Stücke sind meist Reste eines Exports. */
    laengeMindestM: 0.5,
    /** m; darüber fehlt üblicherweise ein Schacht. */
    laengeHoechstM: 100,
    /** m; wie weit ein Rohrende von einem Bauwerk entfernt sein darf. */
    netzToleranzM: 0.001,
    /** m; zwei topologisch fremde Hüllen näher als das sind „nah" (Beziehungsindex, Teil XVII). */
    naeheSchwelleM: 0.5,
    /** m; ein Punktobjekt so nah an einer Achse gilt als „an der Achse" (Station). */
    stationAbstandM: 0.5,
    /** m; Rohrscheitel unter Gelände — darunter ist die Überdeckung gering (Faustregel, frostfrei/Verkehrslast). */
    ueberdeckungMindestM: 0.8,
    /** m; lichter Abstand zweier Läufe an einer Kreuzung (Faustregel; Sparten nach DVGW/Netzbetreiber). */
    kreuzungMindestabstandM: 0.2,
    /** m; lichter Abstand zweier parallel laufender Leitungen (Faustregel; Sparten nach DVGW/Netzbetreiber). */
    mindestabstandParallelM: 0.4,
    /** Nennweiten, die üblicherweise vorkommen. */
    dnReihe: Object.freeze([
        100, 125, 150, 200, 250, 300, 350, 400, 500, 600,
        700, 800, 900, 1000, 1200, 1400, 1600, 1800, 2000,
    ]),
});

export const SCHWEREN = Object.freeze(['hinweis', 'warnung']);

/**
 * Welche Bearbeitung einen Befund behebt — die KUR.
 *
 * Damit wird aus der Prüfliste eine Arbeitsliste: jede Zeile trägt das
 * Werkzeug bei sich, das sie erledigt, und wo die Kur eindeutig ist, gleich
 * die Werte dazu („bergauf" hat genau eine Antwort: umkehren).
 *
 * NUR EINGETRAGEN, WO ES WIRKLICH EINE GIBT. Ein Befund ohne Kur ist kein
 * Mangel dieser Tabelle, sondern eine Auskunft: dafür fehlt das Werkzeug noch.
 * Eine erfundene Zuordnung wäre schlimmer als keine — sie schickte den Nutzer
 * in ein Formular, das seinen Fall nicht trifft.
 *
 * Bewusst OHNE Kur, mit Begründung:
 *   `laenge_zu_kurz`        — Zusammenlegen GIBT es inzwischen („Schacht
 *                             entfernen", Stufe 16) — aber am SCHACHT, nicht
 *                             an der Haltung. Die Kur bräuchte einen
 *                             Subjektwechsel; bis der Kur-Mechanismus das
 *                             kann, bleibt sie Handarbeit.
 *   `schacht_ohne_anschluss` — löschen kann man ihn nicht anbieten, ohne zu
 *                              wissen, ob er nur unvollständig geliefert wurde
 */
export const KUREN = Object.freeze({
    gefaelle_gegen:      { bearbeitung: 'fliessrichtung-setzen', werte: { richtung: 'umgekehrt' } },
    gefaelle_zu_flach:   { bearbeitung: 'sohlhoehen-setzen' },
    gefaelle_zu_steil:   { bearbeitung: 'sohlhoehen-setzen' },
    hoehensprung:        { bearbeitung: 'sohlhoehen-setzen' },
    zulauf_unter_ablauf: { bearbeitung: 'sohlhoehen-setzen' },
    laenge_zu_lang:      { bearbeitung: 'schacht-einfuegen' },
    dn_ausserhalb:       { bearbeitung: 'profilgroesse-setzen' },
    dn_nicht_normreihe:  { bearbeitung: 'profilgroesse-setzen' },
    dn_nimmt_ab:         { bearbeitung: 'profilgroesse-setzen' },
    profilform_widerspruch: { bearbeitung: 'profilform-setzen' },
    loses_ende:          { bearbeitung: 'an-schacht-anschliessen' },
    // Aus dem Beziehungsindex (Teil XVII, B4):
    ueberdeckung_gering: { bearbeitung: 'sohlhoehen-setzen' },
    kreuzung_abstand:    { bearbeitung: 'sohlhoehen-setzen' },
    mindestabstand:      { bearbeitung: 'verschieben' },
    durchdringung:       { bearbeitung: 'verschieben' },
    schacht_auf_haltung: { bearbeitung: 'haltung-teilen' },
});

/** Ein Befund — immer dieselbe Form, damit die Anzeige nichts wissen muss. */
function befund(regel, schwere, text, { wert, grenze, quelle } = {}) {
    return {
        regel, schwere, text, wert: wert ?? null, grenze: grenze ?? null,
        quelle: quelle ?? 'Büro-Regelwerk (Vorgabe)',
        kur: KUREN[regel] ?? null,
    };
}

const _m = (v) => `${Number(v).toFixed(2)} m`;
const _p = (v) => `${Number(v).toFixed(1)} ‰`;

/** Das Mindestgefälle für diese Nennweite — die Faustregel 1:DN. */
export function mindestGefaelle(dnMm, regelwerk = REGELWERK) {
    if (regelwerk.gefaelleMindestPromille != null) return regelwerk.gefaelleMindestPromille;
    const dn = Number(dnMm);
    return Number.isFinite(dn) && dn > 0 ? 1000 / dn : null;
}

/**
 * Alle Befunde zu einem Bauteil.
 *
 * @param {object} pruefling
 * @param {string} pruefling.globalId
 * @param {string} [pruefling.kategorie]
 * @param {object} [pruefling.achse]     {anfang, ende, laenge, gefaelle, dn}
 * @param {object} [pruefling.typprofil] für die Wertebereiche der Rollen
 * @param {object} [pruefling.merkmale]  flache Karte aus den Merkmalssätzen
 * @param {object} [regelwerk]
 * @returns {Array<{regel, schwere, text, wert, grenze, quelle}>}
 */
export function befundeFuer(pruefling, regelwerk = REGELWERK) {
    const out = [];
    if (!pruefling) return out;
    // DIE FESTGELEGTE RICHTUNG GILT. Wer die Fliessrichtung korrigiert hat,
    // soll den Gefälle-Befund verschwinden sehen — sonst wäre der Klick eine
    // Behauptung ohne Wirkung. Die GEOMETRIE bleibt unberührt; getauscht wird
    // nur, was als Anfang gilt.
    const a = pruefling.umgekehrt && pruefling.achse
        ? { ...pruefling.achse, anfang: pruefling.achse.ende, ende: pruefling.achse.anfang }
        : (pruefling.achse ?? null);

    // ── Gefälle ─────────────────────────────────────────────────────────────
    if (a?.anfang && a?.ende && Number.isFinite(a.laenge) && a.laenge > 0) {
        const fall = a.anfang.y - a.ende.y;             // positiv = fällt
        // GEGEN DIE WAAGERECHTE LÄNGE, nicht gegen die 3D-Länge.
        //
        // `laenge` aus der Achse ist die räumliche Strecke — sie enthält die
        // Höhe bereits. Ein Gefälle daran zu messen ist ungenau, und die
        // Prüfung „steiler als 100 %" wird damit sogar UNMÖGLICH: |Δh| kann
        // die 3D-Länge nie übersteigen. Genau daran ist die Regel an Fabios
        // A64-Netz zunächst vorbeigelaufen, obwohl der Fall (237 m auf einer
        // Haltung) dort steht. Ein Gefälle ist Höhe je waagerechter Strecke.
        const laenge2d = Math.hypot(a.ende.x - a.anfang.x, a.ende.z - a.anfang.z);
        const bezug = laenge2d > 1e-6 ? laenge2d : a.laenge;
        const promille = (fall / bezug) * 1000;

        if (fall < -0.001) {
            // Der häufigste echte Datenfehler — im A64-Netz dreimal.
            out.push(befund('gefaelle_gegen', 'warnung',
                `Läuft bergauf: Ende liegt ${_m(-fall)} über dem Anfang.`,
                { wert: _p(promille), quelle: 'Fliessrichtung aus der Achse' }));
        } else {
            const mind = mindestGefaelle(a.dn, regelwerk);
            if (mind != null && promille < mind - 1e-9) {
                out.push(befund('gefaelle_zu_flach', 'warnung',
                    'Flacher als das Mindestgefälle — die Sohle reinigt sich nicht selbst.',
                    { wert: _p(promille), grenze: `mindestens ${_p(mind)}`,
                      quelle: regelwerk.gefaelleMindestPromille == null
                        ? 'Faustregel 1:DN' : 'Büro-Regelwerk' }));
            }
            if (promille > regelwerk.gefaelleHoechstPromille) {
                out.push(befund('gefaelle_zu_steil', 'hinweis',
                    'Sehr steil — auf Erosion und Absturzbauwerk prüfen.',
                    { wert: _p(promille), grenze: `höchstens ${_p(regelwerk.gefaelleHoechstPromille)}` }));
            }
        }

        // Ein Höhenunterschied grösser als die waagerechte Strecke ist
        // geometrisch möglich, im Kanalbau aber praktisch immer ein
        // Datenfehler — im A64-Netz mit 237,5 m auf einer Haltung.
        if (laenge2d > 1e-6 && Math.abs(fall) > laenge2d) {
            out.push(befund('hoehensprung', 'warnung',
                `Höhenunterschied ${_m(Math.abs(fall))} auf ${_m(laenge2d)} waagerechter Strecke `
                + '— steiler als 100 %.',
                { wert: _m(Math.abs(fall)), grenze: `höchstens ${_m(laenge2d)}`,
                  quelle: 'Geometrie gegen sich selbst' }));
        }
    }

    // ── Länge ───────────────────────────────────────────────────────────────
    if (Number.isFinite(a?.laenge)) {
        if (a.laenge < regelwerk.laengeMindestM) {
            out.push(befund('laenge_zu_kurz', 'hinweis',
                'Sehr kurz — oft ein Rest aus dem Export.',
                { wert: _m(a.laenge), grenze: `mindestens ${_m(regelwerk.laengeMindestM)}` }));
        } else if (a.laenge > regelwerk.laengeHoechstM) {
            out.push(befund('laenge_zu_lang', 'hinweis',
                'Länger als üblich — fehlt hier ein Schacht?',
                { wert: _m(a.laenge), grenze: `höchstens ${_m(regelwerk.laengeHoechstM)}` }));
        }
    }

    // ── Nennweite ───────────────────────────────────────────────────────────
    const dn = Number(a?.dn);
    if (Number.isFinite(dn) && dn > 0) {
        const feld = pruefling.typprofil?.felder?.profilGroesse ?? null;
        if (feld && ((feld.min != null && dn < feld.min) || (feld.max != null && dn > feld.max))) {
            out.push(befund('dn_ausserhalb', 'warnung',
                'Nennweite ausserhalb des Bereichs, den der Typ vorsieht.',
                { wert: `DN ${dn}`, grenze: `${feld.min ?? '—'}…${feld.max ?? '—'} mm`,
                  quelle: 'Typprofil' }));
        } else if (!regelwerk.dnReihe.includes(dn)) {
            out.push(befund('dn_nicht_normreihe', 'hinweis',
                'Nennweite nicht in der üblichen Reihe.',
                { wert: `DN ${dn}` }));
        }
    }

    // ── Profilform gegen Geometrie ──────────────────────────────────────────
    // Im ENQUIER-Netz tragen 16 Rohre `Description = 'Trapezoid'` und werden
    // trotzdem als Kreis geschrieben. Die Form lebt nur im Text — wer der
    // Geometrie glaubt, rechnet mit dem falschen Querschnitt.
    const form = String(pruefling.merkmale?.profilform ?? pruefling.beschreibung ?? '').trim();
    if (form && a?.dn != null && !/kreis|circ|rund/i.test(form)) {
        out.push(befund('profilform_widerspruch', 'warnung',
            `Als „${form}" bezeichnet, geometrisch aber ein Kreis.`,
            { wert: form, grenze: `DN ${a.dn} (Kreis)`, quelle: 'Beschreibung gegen Geometrie' }));
    }

    return out;
}

/** Wie viele Befunde je Schwere — für Zähler und Ampeln. */
export function zaehleBefunde(befunde) {
    const out = { hinweis: 0, warnung: 0, gesamt: 0 };
    for (const b of befunde ?? []) {
        if (out[b.schwere] !== undefined) out[b.schwere]++;
        out.gesamt++;
    }
    return out;
}

/**
 * Die schwerste Schwere in einer Liste, oder null.
 *
 * Für die Ampel am Bauteil: eine Warnung schlägt jeden Hinweis.
 */
export function schwersteSchwere(befunde) {
    if (befunde?.some(b => b.schwere === 'warnung')) return 'warnung';
    if (befunde?.length) return 'hinweis';
    return null;
}

// ── Befunde, die ein einzelnes Bauteil nicht sehen kann ────────────────────

/**
 * Netz-Befunde: was erst im Zusammenhang auffällt.
 *
 * Die vier Familien aus der Entwurfsrunde, für die es eine TOPOLOGIE braucht.
 * Sie kommt aus der XY-Koinzidenz (`Netztopologie.js`), nicht aus erklärten
 * IFC-Beziehungen — die gibt es in Fabios Dateien schlicht nicht.
 *
 * Dieselben fünf Regeln wie oben: abgeleitet, beratend, mit Herkunft. Und
 * dieselbe Form, damit die Anzeige nichts Neues lernen muss.
 *
 * @param {object} netz aus `baueNetz`
 * @returns {Map<string, Array>} Bauteil-Id → Befunde
 */
export function befundeFuerNetz(netz, regelwerk = REGELWERK) {
    const out = new Map();
    if (!netz) return out;
    const anhaengen = (id, b) => {
        if (!out.has(id)) out.set(id, []);
        out.get(id).push(b);
    };

    // Ein Schacht, den keine Haltung berührt. Im A64-Netz fünfzehnmal.
    for (const id of netz.ohneAnschluss) {
        anhaengen(id, befund('schacht_ohne_anschluss', 'warnung',
            'Kein Anschluss — keine Haltung endet an diesem Bauwerk.',
            { wert: '0 Anschlüsse', quelle: 'Netz aus der Geometrie' }));
    }

    // Ein Rohrende, das auf keinem Schacht sitzt.
    for (const l of netz.loseEnden) {
        anhaengen(l.kante, befund('loses_ende', 'warnung',
            `Das ${l.ende === 'anfang' ? 'obere' : 'untere'} Ende trifft kein Bauwerk.`,
            { wert: `${l.punkt.x.toFixed(2)} / ${l.punkt.z.toFixed(2)}`,
              grenze: `Suchradius ${(regelwerk.netzToleranzM ?? 0.001) * 1000} mm`,
              quelle: 'Netz aus der Geometrie' }));
    }

    for (const knoten of netz.knoten.values()) {
        const zu = knoten.kantenAn.map(id => netz.kanten.get(id)).filter(Boolean);
        const ab = knoten.kantenAb.map(id => netz.kanten.get(id)).filter(Boolean);
        if (!zu.length || !ab.length) continue;

        // Die Nennweite darf in Fliessrichtung nicht abnehmen — sonst staut
        // sich der Abfluss am Übergang.
        const groesstZu = Math.max(...zu.map(k => Number(k.dn) || 0));
        for (const k of ab) {
            const dn = Number(k.dn) || 0;
            if (dn > 0 && groesstZu > 0 && dn < groesstZu) {
                anhaengen(k.id, befund('dn_nimmt_ab', 'warnung',
                    'Nennweite wird in Fliessrichtung kleiner.',
                    { wert: `DN ${dn}`, grenze: `mindestens DN ${groesstZu} (Zulauf)`,
                      quelle: 'Netz aus der Geometrie' }));
            }
        }

        // Der Zulauf darf nicht unter dem Ablauf liegen — sonst steht Wasser
        // im Schacht. Verglichen werden die Sohlhöhen an DIESEM Knoten.
        const tiefsterAb = Math.min(...ab.map(k => k.anfang.y));
        for (const k of zu) {
            if (k.ende.y < tiefsterAb - 0.005) {
                anhaengen(k.id, befund('zulauf_unter_ablauf', 'warnung',
                    'Zulaufsohle liegt unter der Ablaufsohle — das Wasser müsste steigen.',
                    { wert: _m(k.ende.y), grenze: `mindestens ${_m(tiefsterAb)}`,
                      quelle: 'Netz aus der Geometrie' }));
            }
        }
    }

    return out;
}


/**
 * BEFUNDE AUS DEM BEZIEHUNGSINDEX (Teil XVII, B4) — die Familie „Raum" und
 * „Nachbarschaft" von Teil IX §4, endlich mit Daten: Überdeckung für ALLE
 * Läufe (nicht nur im Kanalgraben), lichter Abstand an Kreuzungen und in
 * Parallellage, Durchdringungen, ein Schacht mitten auf einer Haltung ohne
 * Anschluss (der fehlende Teilungspunkt — mit Kur und Station).
 *
 * Nur Beziehungen der Güte `form` tragen ein Mass, dem man trauen kann; die
 * Hüllen-Kandidaten (Körper zu Körper) bleiben der Server-Kollisionsprüfung.
 * Beraten, nicht verbieten; abgeleitet, nie gespeichert; jeder Befund nennt
 * Wert, Grenze und Herkunft.
 *
 * @param {object} index      aus `baueBeziehungen` (relationen, objekt)
 * @param {object} [regelwerk]
 * @returns {Map<string, Array>} GlobalId → Befunde
 */
export function befundeAusBeziehungen(index, regelwerk = REGELWERK) {
    const je = new Map();
    const add = (gid, b) => { if (!gid) return; if (!je.has(gid)) je.set(gid, []); je.get(gid).push(b); };
    const rel = index?.relationen ?? [];
    const radius = (gid) => { const o = index?.objekt?.(gid); const dn = o?.achse?.dn; return Number.isFinite(dn) && dn > 0 ? dn / 2000 : 0; };
    const name = (gid, n) => n || gid;
    const ueberMin = regelwerk.ueberdeckungMindestM ?? 0.8;
    const kreuzMin = regelwerk.kreuzungMindestabstandM ?? 0.2;
    const parallelMin = regelwerk.mindestabstandParallelM ?? 0.4;
    // Ein Lauf IM OFFENEN AUSHUB (enthalten in einem IfcEarthworksCut): das
    // Gelände darüber ist die Grabensohle — ein Bauzustand, keine Überdeckung.
    // Die Überdeckung des Fertiggeländes meldet die Ableitung selbst.
    const imAushub = new Set();
    for (const r of rel) {
        if (r.art !== 'enthalten') continue;
        const huelle = index?.objekt?.(r.b);
        if (String(huelle?.kategorie ?? '').toUpperCase() === 'IFCEARTHWORKSCUT') imAushub.add(r.a);
    }

    for (const r of rel) {
        const m = r.mass ?? {};
        if (r.art === 'auflage') {
            // Nur LÄUFE — ein Schacht steht „auf". Und nicht nur „unter": ein
            // Rohr, dessen Scheitel ÜBER dem Gelände liegt, hat die geringste
            // Überdeckung von allen (negativ) — das ist kein Grund zu schweigen.
            if (!index?.objekt?.(r.a)?.achse || !Number.isFinite(m.ueberdeckung)) continue;
            if (imAushub.has(r.a)) continue;
            if (m.ueberdeckung < ueberMin) {
                add(r.a, befund('ueberdeckung_gering', 'warnung',
                    `Überdeckung ${_m(m.ueberdeckung)} unter ${_m(ueberMin)} (Rohrscheitel gegen ${name(r.b, r.bn)})`,
                    { wert: _m(m.ueberdeckung), grenze: `mindestens ${_m(ueberMin)}` }));
            }
        } else if (r.art === 'kreuzung') {
            if (!Number.isFinite(m.hoehenabstand)) continue;
            const licht = Math.abs(m.hoehenabstand) - radius(r.a) - radius(r.b);
            if (licht < kreuzMin) {
                const text = (ich, andere, anderesName) => `${licht < 0 ? 'Durchdringt' : 'Kreuzt'} ${name(andere, anderesName)} mit ${_m(Math.max(0, licht))} lichtem Abstand — mindestens ${_m(kreuzMin)}`;
                add(r.a, befund('kreuzung_abstand', 'warnung', text(r.a, r.b, r.bn), { wert: _m(Math.max(0, licht)), grenze: `mindestens ${_m(kreuzMin)}` }));
                add(r.b, befund('kreuzung_abstand', 'warnung', text(r.b, r.a, r.an), { wert: _m(Math.max(0, licht)), grenze: `mindestens ${_m(kreuzMin)}` }));
            }
        } else if (r.art === 'naehe') {
            if (r.guete !== 'form' || !Number.isFinite(m.abstand) || m.abstand >= parallelMin) continue;
            add(r.a, befund('mindestabstand', 'warnung', `${name(r.b, r.bn)} in ${_m(m.abstand)} — mindestens ${_m(parallelMin)}`, { wert: _m(m.abstand), grenze: `mindestens ${_m(parallelMin)}` }));
            add(r.b, befund('mindestabstand', 'warnung', `${name(r.a, r.an)} in ${_m(m.abstand)} — mindestens ${_m(parallelMin)}`, { wert: _m(m.abstand), grenze: `mindestens ${_m(parallelMin)}` }));
        } else if (r.art === 'schnitt') {
            if (r.guete !== 'form') continue;               // Hüllen-Kandidaten prüft der Server
            add(r.a, befund('durchdringung', 'warnung', `Durchdringt ${name(r.b, r.bn)}`, { wert: Number.isFinite(m.abstand) ? _m(m.abstand) : null, grenze: 'kein Schnitt' }));
            add(r.b, befund('durchdringung', 'warnung', `Durchdringt ${name(r.a, r.an)}`, { wert: Number.isFinite(m.abstand) ? _m(m.abstand) : null, grenze: 'kein Schnitt' }));
        } else if (r.art === 'station') {
            // Nur ein KNOTEN (Schacht) auf der Haltung ist der fehlende
            // Teilungspunkt — ein Fundament neben der Achse ist keiner.
            if (!Number.isFinite(m.station) || !index?.objekt?.(r.a)?.knoten) continue;
            // Am Schacht: Hinweis ohne Kur. An der Haltung: die Kur „Haltung teilen" mit der Station.
            const amSchacht = befund('schacht_auf_haltung', 'hinweis', `Liegt auf ${name(r.b, r.bn)} bei St. ${_m(m.station)}, ohne Anschluss (${_m(m.quer ?? 0)} neben der Achse)`, { wert: _m(m.quer ?? 0) });
            amSchacht.kur = null;
            add(r.a, amSchacht);
            const b = befund('schacht_auf_haltung', 'hinweis', `${name(r.a, r.an)} liegt bei St. ${_m(m.station)} auf der Haltung, ohne Anschluss — hier teilen?`, { wert: _m(m.station) });
            b.kur = { bearbeitung: 'haltung-teilen', werte: { station: Math.round(m.station * 100) / 100 } };
            add(r.b, b);
        }
    }
    return je;
}
