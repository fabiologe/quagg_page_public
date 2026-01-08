
import proj4 from 'proj4';
import { KostraApiService } from '../../kostra/services/KostraApiService';

// Define common CRS (Copied from isybau/utils/KostraService.js)
proj4.defs("EPSG:25832", "+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs");
proj4.defs("EPSG:25833", "+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs");
proj4.defs("EPSG:31466", "+proj=tmerc +lat_0=0 +lon_0=6 +k=1 +x_0=2500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs +type=crs");
proj4.defs("EPSG:31467", "+proj=tmerc +lat_0=0 +lon_0=9 +k=1 +x_0=3500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs +type=crs");
proj4.defs("EPSG:31468", "+proj=tmerc +lat_0=0 +lon_0=12 +k=1 +x_0=4500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs +type=crs");
proj4.defs("EPSG:31469", "+proj=tmerc +lat_0=0 +lon_0=15 +k=1 +x_0=5500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs +type=crs");

export const CRS_OPTIONS = [
    { label: "ETRS89 / UTM Zone 32N (EPSG:25832)", value: "EPSG:25832" },
    { label: "ETRS89 / UTM Zone 33N (EPSG:25833)", value: "EPSG:25833" },
    { label: "DHDN / GK Zone 2 (EPSG:31466)", value: "EPSG:31466" },
    { label: "DHDN / GK Zone 3 (EPSG:31467)", value: "EPSG:31467" },
    { label: "DHDN / GK Zone 4 (EPSG:31468)", value: "EPSG:31468" },
    { label: "DHDN / GK Zone 5 (EPSG:31469)", value: "EPSG:31469" }
];

export const transformToWGS84 = (x, y, sourceCRS) => {
    if (!sourceCRS) return null;
    try {
        return proj4(sourceCRS, 'EPSG:4326', [x, y]);
    } catch (e) {
        console.error("Transformation failed:", e);
        return null;
    }
};

// Only transform if inputs are Lat/Lon (approx < 180) to UTM 32N (Default)
export const transformToUTM = (lat, lon) => {
    try {
        if (!proj4.defs('EPSG:25832')) return { x: lon, y: lat };
        // Output from WGS84 (4326) to UTM32N (25832)
        const p = proj4('EPSG:4326', 'EPSG:25832', [lon, lat]);
        return { x: p[0], y: p[1] };
    } catch (e) {
        console.warn("UTM Transformation failed:", e);
        return { x: lon, y: lat };
    }
};

export const fetchKostraGrid = async (lat, lon) => {
    try {
        const data = await KostraApiService.fetchRainData(lat, lon);
        return {
            raw: data.raw,
            location: { lat, lon }
        };
    } catch (e) {
        console.error("Failed to fetch KOSTRA grid:", e);
        throw e;
    }
};

/**
 * Heuristically detects the CRS based on coordinate values (German bounding boxes).
 */
export const detectCRS = (x, y) => {
    // 1. WGS84 (Lat/Lon)
    if (Math.abs(x) <= 180 && Math.abs(y) <= 90) {
        return "EPSG:4326";
    }

    // 2. Gauss-Kruger (Leading digit indicates zone)
    // GK2: ~2,500,000
    if (x > 2000000 && x < 3000000) return "EPSG:31466";
    // GK3: ~3,500,000
    if (x > 3000000 && x < 4000000) return "EPSG:31467";
    // GK4: ~4,500,000
    if (x > 4000000 && x < 5000000) return "EPSG:31468";
    // GK5: ~5,500,000
    if (x > 5000000 && x < 6000000) return "EPSG:31469";

    // 3. ETRS89 / UTM
    // This is trickier because UTM 32 and 33 can overlap in 6-digit notation.
    // Default to UTM 32N (EPSG:25832) as it's most common for western/central Germany.
    // UTM coordinates are typically 6 digits (3xxxxx) or 8 digits (32xxxxxx).

    // If it starts with 32 and is 8 digits long:
    if (x > 31000000 && x < 33000000) return "EPSG:25832";

    // Default fallback
    return "EPSG:25832";
};
