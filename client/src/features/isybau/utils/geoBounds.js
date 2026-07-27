/**
 * Bounding-Box-Hilfsfunktionen für die EZG-Karte (Luftbild/Höhenlinien).
 * Arbeitet ausschließlich auf den lokalen Netz-Koordinaten (Meter, wie
 * Node.x/Node.y) — die Umrechnung nach WGS84 passiert erst am Schluss,
 * pro Ecke einzeln (siehe localBoundsToWGS84).
 */
import proj4 from 'proj4';
// Reine Side-Effect-Import: registriert die proj4.defs() für GK2-5/UTM32/33,
// die localBoundsToWGS84 unten voraussetzt.
import './KostraService.js';

/**
 * Min/Max-Bounding-Box aus Nodes UND (falls übergeben) Edge-Polylinien
 * (Edge.coords — gebogene Haltungen). Eine Haltung ist nicht zwingend die
 * Gerade zwischen ihren beiden Endknoten; ohne die coords-Punkte fiele ein
 * Kanal, der außerhalb dieser Geraden verläuft, aus der berechneten Box und
 * damit aus dem später geholten Luftbild/Höhenraster heraus.
 *
 * Ist das Netz komplett leer (kein Node, keine Edge-Koordinate) UND ein
 * `anchor` übergeben ("Neu starten"-Startort), wird eine Punkt-Box am Anker
 * zurückgegeben statt der bedeutungslosen {0,0,0,0}-Box — sonst würde EZG-Karte
 * für ein frisch verankertes, aber noch leeres Projekt Luftbild bei lokal
 * (0,0) statt am gewählten Ort anfragen.
 * @param {Array<{x:number,y:number}>} nodeArray
 * @param {Array<{coords?: Array<{x:number,y:number}>}>} [edgeArray]
 * @param {{x:number,y:number}|null} [anchor]
 */
export function computeLocalNetworkBounds(nodeArray, edgeArray = [], anchor = null) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    const include = (x, y) => {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
    };

    for (const node of nodeArray) include(node.x, node.y);
    for (const edge of edgeArray) {
        for (const p of edge.coords || []) include(p.x, p.y);
    }

    if (!Number.isFinite(minX)) {
        if (anchor && Number.isFinite(anchor.x) && Number.isFinite(anchor.y)) {
            return { minX: anchor.x, minY: anchor.y, maxX: anchor.x, maxY: anchor.y };
        }
        return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }
    return { minX, minY, maxX, maxY };
}

/**
 * Erweitert eine Bounding-Box um `ratio` (Standard 25%) der größeren Kantenlänge,
 * auf allen vier Seiten gleich — in lokalen Metern, damit die Randbedingungen
 * unabhängig von der späteren CRS-Umrechnung ist (ein Breitengrad ist keine
 * konstante Distanz, ein Meter schon).
 * `minSpan` (Standard 1m) ist die Mindestkantenlänge, bevor die Prozent-
 * Polsterung greift — für eine reine Anker-Punkt-Box (Breite/Höhe = 0) auf
 * einen größeren Wert setzen, sonst kommt nur ein nutzloser Meter-Fleck raus.
 */
export function padLocalBounds(bounds, ratio = 0.25, minSpan = 1) {
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    const pad = Math.max(width, height, minSpan) * ratio;

    return {
        minX: bounds.minX - pad,
        minY: bounds.minY - pad,
        maxX: bounds.maxX + pad,
        maxY: bounds.maxY + pad
    };
}

/**
 * Transformiert alle VIER Ecken der Box nach WGS84 (statt nur zwei
 * gegenüberliegender Ecken) und bildet die umschließende Box der Ergebnisse.
 * Bei Gauss-Krüger/UTM ist die Achse gegenüber WGS84 leicht verdreht — mit nur
 * zwei Ecken würde die reale Ausdehnung leicht unterschätzt.
 */
export function localBoundsToWGS84(bounds, epsg) {
    const corners = [
        [bounds.minX, bounds.minY],
        [bounds.minX, bounds.maxY],
        [bounds.maxX, bounds.minY],
        [bounds.maxX, bounds.maxY]
    ];

    const transformed = corners.map(([x, y]) => proj4(epsg, 'EPSG:4326', [x, y]));

    const lons = transformed.map(p => p[0]);
    const lats = transformed.map(p => p[1]);

    return {
        minLon: Math.min(...lons),
        minLat: Math.min(...lats),
        maxLon: Math.max(...lons),
        maxLat: Math.max(...lats)
    };
}

/**
 * Berechnet den aktuell sichtbaren Welt-Ausschnitt aus bounds + Pan/Zoom-
 * Zustand — Umkehrung von IsybauViewer.vues transformString
 * (translate(cx+tx,cy+ty) scale(s) translate(-cx,-cy)), angewendet auf die
 * vier ViewBox-Ecken (0,0)-(width,height), dann zurück in Welt-Koordinaten
 * über bounds.minX/maxY. Gemeinsam genutzt von useContourGpuLayer.js (Kamera-
 * Frustum) und IsybauViewer.vue (Pan-Nachlade-Trigger für die Luftbild-
 * Abdeckung) — beide müssen exakt denselben Ausschnitt sehen.
 * @param {{minX:number,maxY:number,width:number,height:number,centerX:number,centerY:number}} bounds
 */
export function computeViewportWorldBounds(bounds, translateX, translateY, scale) {
    const cx = bounds.centerX, cy = bounds.centerY;

    const localLeft = (0 - cx - translateX) / scale + cx;
    const localRight = (bounds.width - cx - translateX) / scale + cx;
    const localTop = (0 - cy - translateY) / scale + cy;
    const localBottom = (bounds.height - cy - translateY) / scale + cy;

    return {
        minX: localLeft + bounds.minX,
        maxX: localRight + bounds.minX,
        minY: bounds.maxY - localBottom,
        maxY: bounds.maxY - localTop
    };
}

/** Umschließende Box zweier Boxen — für das Wachsen der geladenen EZG-Fläche beim Pan-Nachladen. */
export function unionLocalBounds(a, b) {
    return {
        minX: Math.min(a.minX, b.minX),
        minY: Math.min(a.minY, b.minY),
        maxX: Math.max(a.maxX, b.maxX),
        maxY: Math.max(a.maxY, b.maxY)
    };
}

/**
 * Prüft, ob `inner` vollständig innerhalb von `outer` liegt, mit einem
 * Sicherheitsabstand (`marginRatio` der jeweiligen Kantenlänge von `outer`)
 * zum Rand — für den Pan-Nachlade-Trigger: erst nachladen, wenn der
 * sichtbare Bereich sich dem Rand der geladenen Fläche nähert, nicht erst
 * wenn er ihn tatsächlich verlässt (sonst kurz sichtbare Lücke).
 */
export function containsWithMargin(outer, inner, marginRatio) {
    const w = outer.maxX - outer.minX;
    const h = outer.maxY - outer.minY;
    const mx = w * marginRatio;
    const my = h * marginRatio;
    return (
        inner.minX >= outer.minX + mx &&
        inner.maxX <= outer.maxX - mx &&
        inner.minY >= outer.minY + my &&
        inner.maxY <= outer.maxY - my
    );
}

/**
 * Umkehrung von localBoundsToWGS84: transformiert alle vier Ecken einer
 * WGS84-Box zurück ins lokale CRS. Gebraucht, weil das gestitchte
 * Kachel-Mosaik (EzgImageryService.js) kachel-ausgerichtet ist und dadurch
 * eine leicht ANDERE Ausdehnung hat als die ursprünglich angefragte lokale
 * Box — IsybauViewer.vue muss das <image> an der TATSÄCHLICHEN Bildgröße
 * ausrichten, nicht an der ursprünglichen Anfrage.
 */
export function wgs84BoundsToLocal(wgs84Bounds, epsg) {
    const corners = [
        [wgs84Bounds.minLon, wgs84Bounds.minLat],
        [wgs84Bounds.minLon, wgs84Bounds.maxLat],
        [wgs84Bounds.maxLon, wgs84Bounds.minLat],
        [wgs84Bounds.maxLon, wgs84Bounds.maxLat]
    ];

    const transformed = corners.map(([lon, lat]) => proj4('EPSG:4326', epsg, [lon, lat]));

    const xs = transformed.map((p) => p[0]);
    const ys = transformed.map((p) => p[1]);

    return {
        minX: Math.min(...xs),
        minY: Math.min(...ys),
        maxX: Math.max(...xs),
        maxY: Math.max(...ys)
    };
}
