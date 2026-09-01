/**
 * Georeferenz — was die DATEI über ihre Lage auf der Erde sagt (Stufe 13.1).
 *
 * DER ANLASS, in Fabios Worten: „In der Praxis weiß ehrlich gesagt keiner, ob
 * man reale CAD-Koordinaten nimmt oder einen Einfügepunkt und dann relative
 * Koordinaten der Elemente. Der Viewer zeigt nochmal andere Koordinaten. Wir
 * haben hier ein Wirrwarr an Bezugssystemen."
 *
 * Er hat recht, und der Befund war: die CDE liest von der Georeferenz **nichts**.
 * Ihr ganzes Bezugssystem ruhte auf einem Ladeversatz, den `web-ifc` aus dem
 * Modellinhalt zurückrechnet (`COORDINATE_TO_ORIGIN`) — nicht auf dem, was der
 * Autor erklärt hat. Die Nordrichtung war ein Schalter in der Oberfläche, die
 * Einheit eine Annahme.
 *
 * Diese Datei liest ALLES, was die Norm anbietet, und sagt zu jedem Wert, WOHER
 * er kommt. Sie entscheidet noch nichts — das Auflösen ist Stufe 13.2. Erst
 * sehen, was dasteht.
 *
 * WAS DIE NORM ANBIETET (nachgelesen in ifc43-docs.standards.buildingsmart.org,
 * nicht aus dem Gedächtnis):
 *
 *   IfcMapConversion      Eastings · Northings · OrthogonalHeight ·
 *   (IFC4 aufwärts)       XAxisAbscissa · XAxisOrdinate · Scale.
 *                         Reihenfolge: skalieren → um z drehen → verschieben.
 *                         IFC4.3 ergänzt IfcMapConversionScaled mit getrennten
 *                         Faktoren je Achse.
 *   IfcProjectedCRS       Name (EPSG), GeodeticDatum, MapProjection, MapZone
 *   WorldCoordinateSystem der Ursprung des Engineering-Systems. Bei vorhandener
 *                         MapConversion ist er der Versatz zwischen ihm und dem
 *                         geografischen Bezugspunkt. Und ausdrücklich:
 *                         „In case of inconsistency, the value provided with
 *                         IfcMapConversion shall take precedence."
 *   TrueNorth             2D-Richtung, Vorgabe [0,1]
 *   IfcSite.Ref*          laut Norm „approximate indication … not meant to
 *                         replace precise georeferencing" — deshalb hier NUR
 *                         als Gegenprobe, nie als Rechengrundlage
 *   IfcUnitAssignment     die Längeneinheit. Meter wurde bisher angenommen;
 *                         eine Testdatei im Repo ist in Millimetern.
 *
 * VERFÜGBARKEIT (aus den web-ifc-Schemata gemessen): IFC2x3 kennt weder
 * `IfcMapConversion` noch `IfcProjectedCRS` — dort gibt es nur
 * `WorldCoordinateSystem`, `IfcSite.Ref*` und die Platzierungskette. Ein Modell
 * ohne Georeferenz ist deshalb kein Fehler, sondern der Normalfall bei älteren
 * Lieferungen; diese Datei liefert dann eine leere, aber gültige Auskunft.
 *
 * Kein Vue, kein three.js. Herein kommt die rohe web-ifc-API — dasselbe Muster
 * wie `AxisAnnotations.extractAxisPolylines`.
 */

/** Wert aus der web-ifc-Hülle `{type, value}` holen. `null` bleibt `null`. */
function _wert(a) {
    if (a === null || a === undefined) return null;
    return typeof a === 'object' && 'value' in a ? a.value : a;
}

/** Dasselbe, aber es muss eine Zahl sein. */
function _zahl(a, vorgabe = null) {
    const v = Number(_wert(a));
    return Number.isFinite(v) ? v : vorgabe;
}

/**
 * Alles über die QUELLE, nicht über rohe API-Aufrufe.
 *
 * Der Unterschied ist nicht Bequemlichkeit: `IfcQuelle` hat einen
 * Lebendnachweis und löst die Typkonstanten am Modul auf. Beides fehlte, als
 * diese Datei noch direkt auf `ifcLoader.webIfc` zugriff — einen Handle, der
 * nie ein Modell offen hatte.
 */
const _zeile = (q, id) => q.zeile(id);
const _alle = (q, typName) => q.alle(typName);

/**
 * Die Vorfaktoren der SI-Präfixe.
 *
 * Bewusst vollständig statt „die üblichen drei": ein Modell in Zentimetern ist
 * selten, aber wenn es kommt, soll es nicht stillschweigend als Meter gelten.
 */
const PRAEFIX = Object.freeze({
    EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3,
    HECTO: 1e2, DECA: 1e1, DECI: 1e-1, CENTI: 1e-2, MILLI: 1e-3,
    MICRO: 1e-6, NANO: 1e-9, PICO: 1e-12, FEMTO: 1e-15, ATTO: 1e-18,
});

/**
 * Die Längeneinheit des Modells, als Faktor auf METER.
 *
 * `IfcSIUnit` mit `UnitType = LENGTHUNIT` und optionalem `Prefix`. Daneben
 * kann eine `IfcConversionBasedUnit` stehen (Fuß, Zoll) — die trägt ihren
 * Faktor in einer `IfcMeasureWithUnit`, und die lesen wir mit.
 */
function _laengeneinheit(q) {
    for (const za of _alle(q, 'IFCUNITASSIGNMENT')) {
        for (const ref of za.Units ?? []) {
            const u = _zeile(q, _wert(ref));
            if (!u || _wert(u.UnitType) !== 'LENGTHUNIT') continue;

            // IfcSIUnit
            if (u.Name !== undefined && u.Dimensions !== undefined) {
                const faktor = PRAEFIX[_wert(u.Prefix) ?? ''] ?? 1;
                return { faktor, name: _wert(u.Name) ?? 'METRE',
                         praefix: _wert(u.Prefix) ?? null, quelle: 'IfcSIUnit' };
            }
            // IfcConversionBasedUnit — Fuß, Zoll, …
            const mwu = _zeile(q, _wert(u.ConversionFactor));
            const faktor = _zahl(mwu?.ValueComponent, null);
            if (faktor !== null) {
                return { faktor, name: _wert(u.Name) ?? 'unbekannt',
                         praefix: null, quelle: 'IfcConversionBasedUnit' };
            }
        }
    }
    // Keine Angabe: Meter ist die IFC-Vorgabe — aber es steht dabei, dass es
    // eine ANNAHME ist und nicht in der Datei stand.
    return { faktor: 1, name: 'METRE', praefix: null, quelle: 'angenommen' };
}

/**
 * Der Kartenbezug aus `IfcMapConversion`.
 *
 * Die Drehung kommt aus `atan2(XAxisOrdinate, XAxisAbscissa)` — beide sind
 * OPTIONAL, und fehlen sie, ist die x-Achse nach Osten gerichtet (Drehung 0).
 * `Scale` fehlt ebenfalls oft; die Norm sagt dann 1,0.
 */
function _kartenbezug(q) {
    const alle = [
        ..._alle(q, 'IFCMAPCONVERSIONSCALED'),
        ..._alle(q, 'IFCMAPCONVERSION'),
    ];
    if (!alle.length) return null;
    const mc = alle[0];

    const abszisse = _zahl(mc.XAxisAbscissa, 1);
    const ordinate = _zahl(mc.XAxisOrdinate, 0);
    return {
        ost: _zahl(mc.Eastings, 0),
        nord: _zahl(mc.Northings, 0),
        hoehe: _zahl(mc.OrthogonalHeight, 0),
        drehung: Math.atan2(ordinate, abszisse),
        massstab: _zahl(mc.Scale, 1),
        // IFC4.3: getrennte Faktoren je Achse. Fehlen sie, gilt `massstab`.
        faktoren: {
            x: _zahl(mc.FactorX, null), y: _zahl(mc.FactorY, null), z: _zahl(mc.FactorZ, null),
        },
        zielCrsId: _wert(mc.TargetCRS),
        quelle: mc.FactorX !== undefined ? 'IfcMapConversionScaled' : 'IfcMapConversion',
    };
}

/** Das Ziel-Bezugssystem, so wie die Datei es NENNT (nicht: wie es stimmt). */
function _crs(q, id) {
    const z = id != null ? _zeile(q, id) : (_alle(q, 'IFCPROJECTEDCRS')[0] ?? null);
    if (!z) return null;
    return {
        name: _wert(z.Name) ?? null,                 // meist 'EPSG:25832'
        beschreibung: _wert(z.Description) ?? null,
        datum: _wert(z.GeodeticDatum) ?? null,
        vertikalDatum: _wert(z.VerticalDatum) ?? null,
        projektion: _wert(z.MapProjection) ?? null,
        zone: _wert(z.MapZone) ?? null,
        quelle: 'IfcProjectedCRS',
    };
}

/** Einen Punkt aus `IfcCartesianPoint` lesen. */
function _punkt(q, id) {
    const p = _zeile(q, id);
    const c = p?.Coordinates;
    if (!Array.isArray(c)) return null;
    return { x: _zahl(c[0], 0), y: _zahl(c[1], 0), z: _zahl(c[2], 0) };
}

/**
 * Der Ursprung des Engineering-Systems und die Nordrichtung.
 *
 * Beide hängen am `IfcGeometricRepresentationContext` mit `ContextType='Model'`.
 * Es kann mehrere Kontexte geben (Model, Plan) — der 3D-Kontext ist der, auf
 * den sich die Geometrie bezieht.
 */
function _kontext(q) {
    const alle = _alle(q, 'IFCGEOMETRICREPRESENTATIONCONTEXT');
    const ctx = alle.find(c => String(_wert(c.ContextType) ?? '').toLowerCase() === 'model') ?? alle[0];
    // Nie `null` für die Nordrichtung: die Norm gibt [0,1] vor, und ein `null`
    // hier zöge sich als Absturz durch jeden Aufrufer.
    if (!ctx) return { weltursprung: null, nordrichtung: { rad: 0, quelle: 'vorgabe' }, genauigkeit: null };

    const wcs = _zeile(q, _wert(ctx.WorldCoordinateSystem));
    const ursprung = wcs ? _punkt(q, _wert(wcs.Location)) : null;

    // TrueNorth ist eine 2D-Richtung; Vorgabe [0,1] = Nord entlang +y.
    const tn = _zeile(q, _wert(ctx.TrueNorth));
    const dr = tn?.DirectionRatios;
    const nordrichtung = Array.isArray(dr)
        ? { rad: Math.atan2(_zahl(dr[0], 0), _zahl(dr[1], 1)), quelle: 'TrueNorth' }
        : { rad: 0, quelle: 'vorgabe' };

    return {
        weltursprung: ursprung,
        nordrichtung,
        genauigkeit: _zahl(ctx.Precision, null),
    };
}

/**
 * `IfcSite.RefLatitude/RefLongitude/RefElevation` — NUR als Gegenprobe.
 *
 * Die Norm nennt sie ausdrücklich „approximate indication … not meant to
 * replace precise georeferencing". Sie hier mitzulesen ist trotzdem wertvoll:
 * wenn die Rechnung über die MapConversion woanders landet als diese Angabe,
 * stimmt eines von beiden nicht — und das will man wissen.
 *
 * Breite und Länge kommen als `IfcCompoundPlaneAngleMeasure`: ganze Zahlen für
 * Grad, Minuten, Sekunden und optional Millionstelsekunden. Vorzeichen trägt
 * die erste Komponente.
 */
function _standort(q) {
    const site = _alle(q, 'IFCSITE')[0];
    if (!site) return null;
    const grad = (a) => {
        const c = _wert(a);
        if (!Array.isArray(c) || !c.length) return null;
        const [g = 0, m = 0, s = 0, ms = 0] = c.map(v => _zahl(v, 0));
        const betrag = Math.abs(g) + Math.abs(m) / 60 + Math.abs(s) / 3600 + Math.abs(ms) / 3.6e9;
        return (g < 0 ? -1 : 1) * betrag;
    };
    const breite = grad(site.RefLatitude);
    const laenge = grad(site.RefLongitude);
    const hoehe = _zahl(site.RefElevation, null);
    if (breite === null && laenge === null && hoehe === null) return null;
    return { breite, laenge, hoehe, quelle: 'IfcSite (laut Norm nur ungefähr)' };
}

/**
 * Der Reifegrad der Georeferenzierung.
 *
 * Angelehnt an die in der Praxis gebräuchliche LoGeoRef-Einteilung, aber
 * bewusst mit EIGENEN Worten und ohne Anspruch, sie exakt abzubilden — sie ist
 * nicht Teil der Norm, und eine falsch behauptete Norm wäre schlimmer als gar
 * keine. Was zählt, ist die Aussage: wie genau lässt sich dieses Modell
 * verorten?
 */
function _stufe({ kartenbezug, crs, weltursprung, standort }) {
    if (kartenbezug && crs?.name) return { wert: 50, text: 'MapConversion mit benanntem CRS — vollständig verortbar' };
    if (kartenbezug) return { wert: 40, text: 'MapConversion ohne CRS-Angabe — verortbar, aber ohne System' };
    if (standort?.breite != null) return { wert: 20, text: 'nur IfcSite-Angabe — laut Norm ungefähr' };
    if (weltursprung && (weltursprung.x || weltursprung.y || weltursprung.z)) {
        return { wert: 10, text: 'nur ein Ursprungsversatz im Kontext' };
    }
    return { wert: 0, text: 'keine Georeferenz in der Datei' };
}

/**
 * Alles lesen, was die Datei über ihre Lage sagt.
 *
 * @param {IfcQuelle} q  eine LEBENDE Quelle (siehe IfcQuelle.lebt())
 * @returns {object} Auskunft mit Provenienz an jedem Wert; nie null
 */
export function leseGeoreferenz(q) {
    const befunde = [];
    if (!q?.lebt?.()) {
        return { kartenbezug: null, crs: null, weltursprung: null, nordrichtung: { rad: 0, quelle: 'vorgabe' },
                 einheit: { faktor: 1, name: 'METRE', quelle: 'angenommen' }, standort: null,
                 stufe: { wert: 0, text: 'keine lebende Quelle' }, befunde: [{ schwere: 'warnung', text: 'Keine lebende IFC-Quelle — nichts zu lesen.' }] };
    }

    const kartenbezug = _kartenbezug(q);
    const crs = _crs(q, kartenbezug?.zielCrsId);
    const { weltursprung, nordrichtung, genauigkeit } = _kontext(q);
    const einheit = _laengeneinheit(q);
    const standort = _standort(q);

    if (einheit.quelle === 'angenommen') {
        befunde.push({ schwere: 'hinweis', text: 'Keine Längeneinheit in der Datei — Meter angenommen.' });
    } else if (einheit.faktor !== 1) {
        befunde.push({ schwere: 'hinweis',
                       text: `Längeneinheit ist ${einheit.praefix ?? ''}${einheit.name} (Faktor ${einheit.faktor}).` });
    }
    if (kartenbezug && !crs) {
        befunde.push({ schwere: 'warnung', text: 'MapConversion ohne IfcProjectedCRS — das Zielsystem ist unbenannt.' });
    }
    if (!kartenbezug && standort) {
        befunde.push({ schwere: 'hinweis',
                       text: 'Nur IfcSite-Koordinaten vorhanden. Die Norm nennt sie ausdrücklich ungefähr.' });
    }
    if (kartenbezug && Math.abs(kartenbezug.drehung) > 1e-9) {
        const g = (kartenbezug.drehung * 180 / Math.PI).toFixed(4);
        befunde.push({ schwere: 'hinweis', text: `Die Karte ist um ${g}° gedreht (XAxisAbscissa/Ordinate).` });
    }

    return { kartenbezug, crs, weltursprung, nordrichtung, einheit, standort, genauigkeit,
             stufe: _stufe({ kartenbezug, crs, weltursprung, standort }), befunde };
}
