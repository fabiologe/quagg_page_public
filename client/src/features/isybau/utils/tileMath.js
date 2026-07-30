/**
 * Web-Mercator-Kachel-Mathematik (Standard-XYZ-Schema), gemeinsam genutzt von
 * ElevationService.js und EzgImageryService.js — beide stitchen ein
 * Kachel-Mosaik für eine WGS84-Bounding-Box und brauchen dieselbe
 * Lon/Lat<->Kachelindex-Umrechnung.
 */

export function lon2tileX(lon, zoom) {
    return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}
export function lat2tileY(lat, zoom) {
    const rad = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, zoom));
}

/** Fraktionaler (nicht geflooreter) Kachel-X-Index — Sub-Pixel-Genauigkeit fürs Rücksampeln. */
export function lon2tileXFrac(lon, zoom) {
    return ((lon + 180) / 360) * Math.pow(2, zoom);
}
/** Fraktionaler (nicht geflooreter) Kachel-Y-Index — Gegenstück zu lat2tileY. */
export function lat2tileYFrac(lat, zoom) {
    const rad = (lat * Math.PI) / 180;
    return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, zoom);
}
export function tileX2lon(x, zoom) {
    return (x / Math.pow(2, zoom)) * 360 - 180;
}
export function tileY2lat(y, zoom) {
    const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, zoom);
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/**
 * Höchster Zoom, bei dem das Kachel-Mosaik für eine WGS84-Box innerhalb von
 * maxTilesPerSide x maxTilesPerSide bleibt.
 * @param {{minLon:number,minLat:number,maxLon:number,maxLat:number}} wgs84Bounds
 * @param {number} maxZoom
 * @param {number} maxTilesPerSide
 */
export function chooseZoomForTileBudget(wgs84Bounds, maxZoom, maxTilesPerSide) {
    for (let z = maxZoom; z >= 1; z--) {
        const xMin = lon2tileX(wgs84Bounds.minLon, z);
        const xMax = lon2tileX(wgs84Bounds.maxLon, z);
        // Y wächst nach Süden — maxLat liefert den kleineren Kachel-Y-Index.
        const yMin = lat2tileY(wgs84Bounds.maxLat, z);
        const yMax = lat2tileY(wgs84Bounds.minLat, z);
        if (xMax - xMin + 1 <= maxTilesPerSide && yMax - yMin + 1 <= maxTilesPerSide) {
            return z;
        }
    }
    return 1;
}

/** Kachel-Indexbereich (inklusiv) für eine WGS84-Box bei gegebenem Zoom. */
export function tileRangeForBounds(wgs84Bounds, zoom) {
    return {
        xMin: lon2tileX(wgs84Bounds.minLon, zoom),
        xMax: lon2tileX(wgs84Bounds.maxLon, zoom),
        yMin: lat2tileY(wgs84Bounds.maxLat, zoom),
        yMax: lat2tileY(wgs84Bounds.minLat, zoom)
    };
}
