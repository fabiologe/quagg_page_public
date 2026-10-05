/**
 * ISYBAU · Leser — die Stammdaten einer ISYBAU-XML als DATEN, nicht als Form.
 *
 * ISYBAU beschreibt ein Netz, keine Geometrie: ein Schacht ist eine Deckel- und
 * eine Sohlhöhe mit ein paar Massen, eine Haltung zwei Sohlhöhen und ein Profil.
 * Was daraus als Körper entsteht, rechnen die Muster (`../muster/`). Dieser
 * Leser liest nur, und zwar nach dem Format 2013 (abwärtskompatibel zu 2006),
 * wie es die Arbeitshilfen Abwasser 12/2015 im Anhang A-7 beschreiben:
 *
 *   AbwassertechnischeAnlage
 *     Objektbezeichnung, Objektart (1 Kante, 2 Knoten), Status, Baujahr, Entwaesserungsart
 *     Knoten/KnotenTyp (0 Schacht) · Knoten/Schacht/{Abdeckung, Aufbau, UntereSchachtzone, Unterteil}
 *     Kante/{KnotenZulauf, KnotenAblauf, SohlhoeheZulauf, SohlhoeheAblauf, Laenge, Material, Profil}
 *     Kante/{Haltung | Leitung | Rinne | Gerinne}
 *     Geometrie/Geometriedaten/{Knoten/Punkt, Kanten/Kante, Polygone/Polygon}
 *
 * DREI FALLEN, die das Feature „isyifc" hat und dieser Leser nicht:
 *   - Der Deckelbereich heisst `Abdeckung`, nicht `Deckel`.
 *   - Die Haltungsdaten stehen in `Kante`, die Haltung ist darin nur die Unterscheidung.
 *   - `HoeheAuflageringe` steht in ZENTIMETERN, alles andere in Metern; Profilmasse in mm.
 *
 * Die Sohle eines Schachts hängt an SMP, bei Altdaten aus Typ K an einem HP
 * (Tab. A-1-5); fehlt beides, gilt Deckelhöhe − Schachttiefe. Woher sie kam,
 * steht dabei.
 *
 * Rein: braucht nur einen DOMParser (Browser, jsdom).
 */

const _fin = (v) => typeof v === 'number' && Number.isFinite(v);

/** Eine Zahl, auch mit Dezimalkomma; leer → NaN. */
function _zahl(t) {
    const s = String(t ?? '').trim();
    if (!s) return NaN;
    return Number(/^-?\d+,\d+$/.test(s) ? s.replace(',', '.') : s);
}

/**
 * Direkte Kinder mit diesem lokalen Namen — ohne Rücksicht auf Gross/klein:
 * die Arbeitshilfen schreiben `PolygonArt`, echte Dateien (Format 2017) `Polygonart`.
 */
const _kinder = (el, name) => {
    const n = name.toLowerCase();
    return el ? el.c.filter(e => e.n === n) : [];
};

/**
 * Der XML-Baum EINMAL in schlichte Knoten `{n, c, t}` (Name klein, Kinder, Text).
 * Abnahme I7: über den DOM gefragt dauerte eine echte Datei mit 670 Objekten
 * 13,6 s — jede Feldabfrage las die Kinderliste neu.
 */
function _baum(el) {
    const kinder = [];
    for (let k = el.firstElementChild; k; k = k.nextElementSibling) kinder.push(_baum(k));
    return { n: el.localName.toLowerCase(), c: kinder, t: kinder.length ? '' : (el.textContent ?? '') };
}
/** Ein Pfad aus direkten Kindern, `a/b/c` — das erste Element oder null. */
function _pfad(el, pfad) {
    let aktuell = el;
    for (const teil of pfad.split('/')) {
        aktuell = _kinder(aktuell, teil)[0] ?? null;
        if (!aktuell) return null;
    }
    return aktuell;
}
const _text = (el, pfad) => _pfad(el, pfad)?.t?.trim() ?? '';
const _num = (el, pfad) => _zahl(_text(el, pfad));
const _int = (el, pfad) => { const v = parseInt(_text(el, pfad), 10); return Number.isNaN(v) ? null : v; };
const _bool = (el, pfad) => {
    const t = _text(el, pfad).toLowerCase();
    return t === '' ? null : (t === '1' || t === 'true');
};
const _code = (el, pfad) => _text(el, pfad) || null;
const _m = (el, pfad) => { const v = _num(el, pfad); return _fin(v) ? v : null; };

/**
 * Ein Längenmass in Metern. Das Format schreibt Meter (Decimal 4.2); ein Wert
 * über 9 ist dann sicher Millimeter einer nicht formatgerechten Datei — das
 * wird umgerechnet UND gemeldet.
 */
function _laengeM(el, pfad, warn, wo) {
    const v = _m(el, pfad);
    if (v === null) return null;
    if (v > 9) { warn(`${wo}: ${pfad} = ${v} als Millimeter gelesen (das Format schreibt Meter)`); return v / 1000; }
    return v;
}

/** Ein Punkt der Geometrie: Rechtswert, Hochwert, Punkthöhe, Punktattribut. */
function _punkt(el) {
    const ost = _num(el, 'Rechtswert'), nord = _num(el, 'Hochwert');
    if (!_fin(ost) || !_fin(nord)) return null;
    const hoehe = _num(el, 'Punkthoehe');
    return { ost, nord, ...(_fin(hoehe) ? { hoehe } : {}), attribut: (_text(el, 'PunktattributAbwasser') || '').toUpperCase() };
}

/**
 * Die Punkte eines Kreisbogens von a nach b um m — der kürzere Bogen
 * (Tab. A-1-16), in Fließrichtung, alle 10° ein Zwischenpunkt. Höhen linear.
 */
export function bogenPunkte(a, b, m, { schrittGrad = 10 } = {}) {
    const r = Math.hypot(a.ost - m.ost, a.nord - m.nord);
    let wa = Math.atan2(a.nord - m.nord, a.ost - m.ost);
    let wb = Math.atan2(b.nord - m.nord, b.ost - m.ost);
    let d = wb - wa;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    const n = Math.max(1, Math.ceil(Math.abs(d) / (schrittGrad * Math.PI / 180)));
    const aus = [];
    for (let i = 1; i < n; i++) {
        const t = i / n, w = wa + d * t;
        const p = { ost: m.ost + r * Math.cos(w), nord: m.nord + r * Math.sin(w) };
        if (_fin(a.hoehe) && _fin(b.hoehe)) p.hoehe = a.hoehe + (b.hoehe - a.hoehe) * t;
        aus.push(p);
    }
    return aus;
}

/** Eine Kantenfolge (Start, Ende, Mitte) → Polylinie, Bögen verdichtet. */
function _kantenzug(kanten) {
    const aus = [];
    for (const k of kanten) {
        const a = _pfad(k, 'Start') ? _punkt(_pfad(k, 'Start')) : null;
        const b = _pfad(k, 'Ende') ? _punkt(_pfad(k, 'Ende')) : null;
        const m = _pfad(k, 'Mitte') ? _punkt(_pfad(k, 'Mitte')) : null;
        if (!a || !b) continue;
        const letzter = aus[aus.length - 1];
        if (!letzter || Math.hypot(letzter.ost - a.ost, letzter.nord - a.nord) > 1e-3) aus.push(a);
        if (m) aus.push(...bogenPunkte(a, b, m));
        aus.push(b);
    }
    return aus;
}

/** Die Geometrie eines Objekts: Punkte, Kantenzug, Umriss (geschlossenes Polygon). */
function _geometrie(obj) {
    const daten = _pfad(obj, 'Geometrie/Geometriedaten');
    if (!daten) return { punkte: [], zug: [], umriss: null, crsLage: null };
    const punkte = _kinder(_pfad(daten, 'Knoten'), 'Punkt').map(_punkt).filter(Boolean);
    let zug = _kantenzug(_kinder(_pfad(daten, 'Kanten'), 'Kante'));
    let umriss = null;
    for (const poly of _kinder(_pfad(daten, 'Polygone'), 'Polygon')) {
        const art = _int(poly, 'Polygonart');
        const p = _kantenzug(_kinder(poly, 'Kante'));
        // 1 und 2 sind geschlossen (die Quelle nennt für Schächte „1", V105 übersetzt
        // 1 als inneren Ring — beides heisst hier: Umriss). 3 ist ein offener Zug.
        if (art === 3) { if (p.length > zug.length) zug = p; }
        else if (p.length >= 3) umriss = p;
    }
    // Das Lagesystem steht in der Geometrie (Format 2017) oder in den Geometriedaten (AH15).
    return { punkte, zug, umriss, crsLage: _text(daten, 'CRSLage') || _text(_pfad(obj, 'Geometrie'), 'CRSLage') || null };
}

/** Der Kopf jedes Objekts. */
function _kopf(obj, geo) {
    return {
        name: _text(obj, 'Objektbezeichnung'),
        status: _int(obj, 'Status'),
        crsLage: geo.crsLage,
        baujahr: _int(obj, 'Baujahr'),
        entwaesserungsart: _code(obj, 'Entwaesserungsart'),
        kommentar: _text(obj, 'Kommentar') || null,
    };
}

/** Ein Schacht (Knoten, KnotenTyp 0). */
function _schacht(obj, warn) {
    const geo = _geometrie(obj);
    const k = _kopf(obj, geo);
    const s = _pfad(obj, 'Knoten/Schacht');
    const deckel = geo.punkte.filter(p => p.attribut === 'DMP');
    const smp = geo.punkte.find(p => p.attribut === 'SMP');
    const hp = geo.punkte.find(p => p.attribut === 'HP');
    const wo = `Schacht „${k.name}"`;
    const L = (el, pfad) => _laengeM(el, pfad, warn, wo);

    const schachttiefe = s ? _m(s, 'Schachttiefe') : null;
    const deckelHoehe = deckel.find(p => _fin(p.hoehe))?.hoehe ?? null;
    let sohle = null;
    if (smp && _fin(smp.hoehe)) sohle = { hoehe: smp.hoehe, quelle: 'SMP' };
    else if (hp && _fin(hp.hoehe)) sohle = { hoehe: hp.hoehe, quelle: 'HP' };
    else if (deckelHoehe !== null && schachttiefe !== null) sohle = { hoehe: deckelHoehe - schachttiefe, quelle: 'Deckelhöhe − Schachttiefe' };

    // Der Ort: der Schachtmittelpunkt (SMP, beim flächenförmigen Schacht der
    // Schwerpunkt des Unterteils), sonst der erste Deckel, sonst irgendein Punkt.
    const ortPunkt = smp ?? deckel[0] ?? geo.punkte[0] ?? null;
    // Der Deckel: `Schacht/Abdeckung` (AH15, Format 2013) oder `Knoten/Abdeckungen/Deckel` (Format 2017, je Deckel ein Index).
    const ab = (s && _pfad(s, 'Abdeckung')) || _pfad(obj, 'Knoten/Abdeckungen/Deckel');
    const au = s && _pfad(s, 'Aufbau');
    const uz = s && _pfad(s, 'UntereSchachtzone'), ut = s && _pfad(s, 'Unterteil');
    const hoeheRingeCm = ab ? _m(ab, 'HoeheAuflageringe') : null;

    return {
        ...k,
        art: 'schacht',
        funktion: s ? _int(s, 'SchachtFunktion') : null,
        ort: ortPunkt ? { ost: ortPunkt.ost, nord: ortPunkt.nord } : null,
        deckel: deckel.map(p => ({ ost: p.ost, nord: p.nord, hoehe: p.hoehe ?? null })),
        deckelHoehe,
        sohle,
        schachttiefe,
        umriss: geo.umriss,
        einstieghilfe: s ? _bool(s, 'Einstieghilfe') : null,
        artEinstieghilfe: s ? _int(s, 'ArtEinstieghilfe') : null,
        materialSteighilfen: s ? _int(s, 'MaterialSteighilfen') : null,
        innenschutz: s ? _code(s, 'Innenschutz') : null,
        anzahlAnschluesse: s ? _int(s, 'AnzahlAnschluesse') : null,
        anzahlDeckel: s ? _int(s, 'AnzahlDeckel') : null,
        abdeckung: ab ? {
            deckelform: _code(ab, 'Deckelform'),
            deckeltyp: _int(ab, 'Deckeltyp'),
            laenge: L(ab, 'LaengeDeckel'),
            breite: L(ab, 'BreiteDeckel'),
            klasse: _code(ab, 'Abdeckungsklasse'),
            material: _code(ab, 'MaterialAbdeckung'),
            anzahlAuflageringe: _int(ab, 'AnzahlAuflageringe'),
            // ZENTIMETER im Format (Tab. A-7-25) — hier in Metern weitergegeben.
            hoeheAuflageringe: hoeheRingeCm === null ? null : hoeheRingeCm / 100,
            schmutzfaenger: _bool(ab, 'Schmutzfaenger'),
        } : null,
        aufbau: au ? {
            form: _code(au, 'Aufbauform'),
            abdeckplatte: _bool(au, 'Abdeckplatte'),
            konus: _bool(au, 'Konus'),
            laenge: L(au, 'LaengeAufbau'),
            breite: L(au, 'BreiteAufbau'),
            hoehe: L(au, 'HoeheAufbau'),
            material: _code(au, 'MaterialAufbau'),
        } : null,
        untereZone: uz ? {
            form: _code(uz, 'UntereSchachtzoneForm'),
            uebergangsplatte: _bool(uz, 'Uebergangsplatte'),
            konus: _bool(uz, 'Konus'),
            laenge: L(uz, 'LaengeUnten'),
            breite: L(uz, 'BreiteUnten'),
            hoehe: L(uz, 'HoeheUnten'),
            material: _code(uz, 'MaterialUnten'),
            podest: _bool(uz, 'Podest'),
        } : null,
        unterteil: ut ? {
            form: _code(ut, 'Unterteilform'),
            laenge: L(ut, 'LaengeUnterteil'),
            breite: L(ut, 'BreiteUnterteil'),
            hoehe: L(ut, 'HoeheUnterteil'),
            material: _code(ut, 'MaterialUnterteil'),
            gerinneform: _int(ut, 'Gerinneform'),
            materialGerinne: _code(ut, 'MaterialGerinne'),
        } : null,
    };
}

/** Ein Profilmass in Metern: das Format schreibt ganze Millimeter. */
const _profilM = (v) => (_fin(v) && v > 0 ? v / 1000 : null);

/** Eine Kante (Haltung, Leitung, Rinne, Gerinne). */
function _kante(obj, warn) {
    const geo = _geometrie(obj);
    const k = _kopf(obj, geo);
    const ka = _pfad(obj, 'Kante');
    // Ohne Unterscheidung (nicht formatgerecht) gilt sie als Haltung.
    const art = ['Haltung', 'Leitung', 'Rinne', 'Gerinne'].find(a => ka && _pfad(ka, a)) ?? 'Haltung';
    const unter = ka ? _pfad(ka, art) : null;
    const pr = ka ? _pfad(ka, 'Profil') : null;
    // Die Profilart ist eine Zahl (G205) — echte Dateien schreiben auch „DN" (Kreis mit Nennweite).
    const profilartText = pr ? _text(pr, 'Profilart').toUpperCase() : '';
    const profilart = profilartText === 'DN' ? 0 : (pr ? _int(pr, 'Profilart') : null);
    const breite = pr ? _profilM(_num(pr, 'Profilbreite')) : null;
    const hoehe = pr ? _profilM(_num(pr, 'Profilhoehe')) : null;
    if (pr && profilart === 0 && hoehe === null && breite !== null) {
        warn(`Haltung „${k.name}": Kreisprofil ohne Profilhoehe — Profilbreite als Durchmesser genommen`);
    }
    return {
        ...k,
        art: art.toLowerCase(),
        kantentyp: ka ? _int(ka, 'KantenTyp') : null,
        von: ka ? (_text(ka, 'KnotenZulauf') || null) : null,
        bis: ka ? (_text(ka, 'KnotenAblauf') || null) : null,
        sohleZulauf: ka ? _m(ka, 'SohlhoeheZulauf') : null,
        sohleAblauf: ka ? _m(ka, 'SohlhoeheAblauf') : null,
        laenge: ka ? _m(ka, 'Laenge') : null,
        material: ka ? _code(ka, 'Material') : null,
        profil: pr ? {
            art: profilart,
            sonder: _bool(pr, 'SonderprofilVorhanden'),
            // Beim Kreis IST die Profilhöhe der Nenndurchmesser (Tab. A-7-16).
            breite: breite ?? (profilart === 0 ? hoehe : null),
            hoehe: hoehe ?? (profilart === 0 ? breite : null),
        } : null,
        funktion: unter ? (_int(unter, 'HaltungsFunktion') ?? _int(unter, 'LeitungsFunktion')) : null,
        innenschutz: unter ? _code(unter, 'Innenschutz') : null,
        auskleidung: unter ? _int(unter, 'Auskleidung') : null,
        materialAuskleidung: unter ? _code(unter, 'MaterialAuskleidung') : null,
        zug: geo.zug,
    };
}

/**
 * Eine ISYBAU-XML lesen.
 * @returns {{schaechte: object[], kanten: object[], warnungen: string[], gezaehlt: object}}
 */
export function liesIsybauDaten(text) {
    if (typeof DOMParser === 'undefined') throw new Error('kein XML-Leser in dieser Umgebung');
    // REPARATUR (Abnahme I7, echte Datei): ein leeres Element ohne Namen `<></>` macht
    // die ganze Datei ungültig — kein Leser nähme sie an. Es trägt nichts; es fällt
    // weg und wird gezählt.
    const roh = String(text ?? '');
    const leer = (roh.match(/<\s*>\s*<\/\s*>/g) ?? []).length;
    const doc = new DOMParser().parseFromString(leer ? roh.replace(/<\s*>\s*<\/\s*>/g, '') : roh, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('kein gültiges XML');
    const objekte = [];
    const sammle = (k) => { if (k.n === 'abwassertechnischeanlage') objekte.push(k); else k.c.forEach(sammle); };
    sammle(_baum(doc.documentElement));
    if (!objekte.length) throw new Error('keine AbwassertechnischeAnlage — ist das eine ISYBAU-Datei?');

    const warnungen = [];
    const warn = (t) => warnungen.push(`ISYBAU: ${t}`);
    if (leer) warn(`${leer} leere Elemente „<></>" entfernt — die Datei war kein gültiges XML`);
    const schaechte = [], kanten = [];
    const gezaehlt = { Anschlusspunkt: 0, Bauwerk: 0, andere: 0 };
    for (const o of objekte) {
        const art = _int(o, 'Objektart');
        if (art === 2) {
            const typ = _int(o, 'Knoten/KnotenTyp');
            if (typ === 0) schaechte.push(_schacht(o, warn));
            else if (typ === 1) gezaehlt.Anschlusspunkt++;
            else if (typ === 2) gezaehlt.Bauwerk++;
            else gezaehlt.andere++;
        } else if (art === 1) {
            kanten.push(_kante(o, warn));
        } else {
            gezaehlt.andere++;
        }
    }
    return { schaechte, kanten, warnungen, gezaehlt };
}

/**
 * Die Lage einer Kante: ihr eigener Zug, sonst die Orte ihrer Knoten; die
 * Höhen sind die SOHLE (Start/Ende tragen die Sohlhöhe von Rohranfang und
 * -ende, A-1.2.3), fehlen sie, linear zwischen SohlhoeheZulauf und -Ablauf.
 */
export function kantenzugMitSohle(kante, schachtNach) {
    let punkte = kante.zug?.length >= 2 ? kante.zug.map(p => ({ ost: p.ost, nord: p.nord, hoehe: p.hoehe })) : [];
    if (punkte.length < 2) {
        const a = schachtNach(kante.von)?.ort, b = schachtNach(kante.bis)?.ort;
        if (!a || !b) return null;
        punkte = [{ ...a }, { ...b }];
    }
    const oben = kante.sohleZulauf ?? schachtNach(kante.von)?.sohle?.hoehe ?? null;
    const unten = kante.sohleAblauf ?? schachtNach(kante.bis)?.sohle?.hoehe ?? null;
    if (_fin(oben) && _fin(unten)) {
        const l = [0];
        for (let i = 1; i < punkte.length; i++) l.push(l[i - 1] + Math.hypot(punkte[i].ost - punkte[i - 1].ost, punkte[i].nord - punkte[i - 1].nord));
        const g = l[l.length - 1] || 1;
        // Die Sohlhöhen der Kante sind „immer erforderlich" (Tab. A-7-15) und gelten an den
        // Enden; dazwischen zählt ein gemessener Knickpunkt, sonst die Gerade.
        punkte = punkte.map((p, i) => ({
            ost: p.ost, nord: p.nord,
            hoehe: i === 0 ? oben : i === punkte.length - 1 ? unten : (_fin(p.hoehe) ? p.hoehe : oben + (unten - oben) * l[i] / g),
        }));
    }
    return punkte;
}
