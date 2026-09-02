/**
 * Fanglinien für den Schacht-Griff im Lageplan (G1, 2026-09-02).
 *
 * Der Selling-Point der CDE-Bearbeitung ist, dass sie sich anfühlt wie das
 * flood-3D-Bearbeiten: greifen, ziehen, und die Führung kommt vom Werkzeug,
 * nicht vom Augenmaß. Vier Familien von Führungslinien, alle aus dem, was am
 * Schacht wirklich dranhängt:
 *
 *   verlaengerung  durch das FERNE Ende jeder angeschlossenen Haltung, in
 *                  Richtung des Schachts — die Haltung bleibt gerade
 *   quer           durch den AUSGANGSPUNKT, rechtwinklig zur Haltung — die
 *                  Trasse verschiebt sich seitlich, ohne zu knicken
 *   flucht         achsparallel durch jeden Nachbarschacht — gleicher
 *                  Rechtswert oder gleicher Hochwert
 *   raster         die schwächste Stufe: runde Koordinaten. Sie wirkt immer,
 *                  wenn keine Linie greift — Linien schlagen das Raster.
 *
 * Gerechnet wird in PROJEKTKOORDINATEN (Ost/Nord in m), nicht in Welt-XZ:
 * „gleicher Rechtswert" und „runde Koordinate" sind Aussagen über das
 * amtliche System, und nur dort sind sie für den Nutzer lesbar. Die Welt↔
 * Projekt-Umrechnung bleibt beim Aufrufer — an EINER Stelle, wie überall.
 *
 * Rein: kein Vue, kein three, kein Canvas. Eine Linie ist `{art, name, punkt,
 * richtung}` mit normierter Richtung; `fange` gibt den gefangenen Punkt und
 * die AKTIVEN Linien zurück — nur die werden gezeichnet.
 */

function _norm(ost, nord) {
    const l = Math.hypot(ost, nord);
    return l > 1e-9 ? { ost: ost / l, nord: nord / l } : null;
}

/** Senkrechter Abstand Punkt → Gerade (punkt + t·richtung, richtung normiert). */
export function abstandZurLinie(punkt, linie) {
    const dx = punkt.ost - linie.punkt.ost;
    const dy = punkt.nord - linie.punkt.nord;
    return Math.abs(dx * -linie.richtung.nord + dy * linie.richtung.ost);
}

/** Fußpunkt des Lots von `punkt` auf die Gerade. */
export function fusspunkt(punkt, linie) {
    const dx = punkt.ost - linie.punkt.ost;
    const dy = punkt.nord - linie.punkt.nord;
    const t = dx * linie.richtung.ost + dy * linie.richtung.nord;
    return {
        ost: linie.punkt.ost + t * linie.richtung.ost,
        nord: linie.punkt.nord + t * linie.richtung.nord,
    };
}

/** Schnittpunkt zweier Geraden — null bei (nahezu) parallelen. */
export function schnittpunkt(a, b) {
    const kreuz = a.richtung.ost * b.richtung.nord - a.richtung.nord * b.richtung.ost;
    if (Math.abs(kreuz) < 1e-9) return null;
    const dx = b.punkt.ost - a.punkt.ost;
    const dy = b.punkt.nord - a.punkt.nord;
    const t = (dx * b.richtung.nord - dy * b.richtung.ost) / kreuz;
    return {
        ost: a.punkt.ost + t * a.richtung.ost,
        nord: a.punkt.nord + t * a.richtung.nord,
    };
}

/**
 * Die Führungslinien eines Schachts — einmal beim Anheben des Griffs gebaut,
 * nicht je Mausbewegung.
 *
 * @param {object} opts
 * @param {{ost,nord}} opts.ausgang        die Lage des Schachts VOR dem Zug
 * @param {Array}      opts.anschluesse    [{globalId, name, fern: {ost, nord}}]
 *                                         — `fern` ist das Ende, das stehen bleibt
 * @param {Array}      opts.nachbarn       [{globalId, name, ost, nord}] andere Schächte
 */
export function fanglinienFuer({ ausgang, anschluesse = [], nachbarn = [] } = {}) {
    const linien = [];
    if (!ausgang) return linien;

    for (const a of anschluesse) {
        if (!a?.fern) continue;
        const r = _norm(ausgang.ost - a.fern.ost, ausgang.nord - a.fern.nord);
        // Haltung ohne Länge (fern == ausgang): keine Richtung, keine Führung.
        if (!r) continue;
        const name = a.name || a.globalId || '';
        linien.push({ art: 'verlaengerung', name, punkt: { ...a.fern }, richtung: r });
        linien.push({ art: 'quer', name, punkt: { ...ausgang }, richtung: { ost: -r.nord, nord: r.ost } });
    }

    for (const n of nachbarn) {
        if (!Number.isFinite(n?.ost) || !Number.isFinite(n?.nord)) continue;
        const name = n.name || n.globalId || '';
        const punkt = { ost: n.ost, nord: n.nord };
        // gleicher Hochwert (Linie läuft in Ost-Richtung) …
        linien.push({ art: 'flucht', name, punkt, richtung: { ost: 1, nord: 0 } });
        // … und gleicher Rechtswert (Linie läuft in Nord-Richtung).
        linien.push({ art: 'flucht', name, punkt, richtung: { ost: 0, nord: 1 } });
    }

    return linien;
}

/**
 * Einen Kandidatenpunkt fangen.
 *
 * Reihenfolge der Stärke: Schnitt zweier Linien (Eckfang) > eine Linie
 * (Lotfußpunkt) > Raster. Der Eckfang greift nur, wenn der Schnittpunkt
 * selbst nah genug liegt — sonst zöge eine ferne Kreuzung den Griff quer
 * über das Blatt.
 *
 * @param {object} opts
 * @param {{ost,nord}} opts.punkt   der rohe Kandidat unter dem Zeiger
 * @param {Array}      opts.linien  aus `fanglinienFuer`
 * @param {number}     opts.radius  Fangradius in m (maßstabsabhängig, vom Aufrufer)
 * @param {number}     opts.raster  Rasterweite in m; 0 schaltet das Raster ab
 * @returns {{punkt: {ost,nord}, aktiv: Array}}
 */
export function fange({ punkt, linien = [], radius = 1, raster = 0 } = {}) {
    if (!punkt) return { punkt: null, aktiv: [] };

    const nah = linien
        .map(linie => ({ linie, d: abstandZurLinie(punkt, linie) }))
        .filter(x => x.d <= radius)
        .sort((x, y) => x.d - y.d);

    if (nah.length) {
        const erste = nah[0].linie;
        for (const { linie } of nah.slice(1)) {
            const s = schnittpunkt(erste, linie);
            if (s && Math.hypot(s.ost - punkt.ost, s.nord - punkt.nord) <= radius * 1.5) {
                return { punkt: s, aktiv: [erste, linie] };
            }
        }
        return { punkt: fusspunkt(punkt, erste), aktiv: [erste] };
    }

    if (raster > 0) {
        return {
            punkt: {
                ost: Math.round(punkt.ost / raster) * raster,
                nord: Math.round(punkt.nord / raster) * raster,
            },
            aktiv: [{ art: 'raster', name: `${raster} m` }],
        };
    }

    return { punkt: { ...punkt }, aktiv: [] };
}

/**
 * Eine RUNDE Rasterweite zum Maßstab — etwa zwei Papier-Millimeter.
 *
 * 1:250 → 0,5 m · 1:500 → 1 m · 1:1000 → 2 m. Runde Stufen statt der rohen
 * Formel, damit die gefangenen Koordinaten lesbar bleiben (2,5 statt 2,4).
 */
export function rasterFuerMassstab(massstab) {
    const roh = (2 / 1000) * (Number(massstab) || 500);
    for (const stufe of [0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50]) {
        if (roh <= stufe) return stufe;
    }
    return 100;
}
