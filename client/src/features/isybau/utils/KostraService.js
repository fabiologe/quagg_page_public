import proj4 from 'proj4';

// Define common CRS
// ETRS89 / UTM zone 32N (EPSG:25832) - Very common in Germany
proj4.defs("EPSG:25832", "+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs");
// ETRS89 / UTM zone 33N (EPSG:25833) - East Germany
proj4.defs("EPSG:25833", "+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs");

// DHDN / 3-degree Gauss-Kruger zone 2 (EPSG:31466)
proj4.defs("EPSG:31466", "+proj=tmerc +lat_0=0 +lon_0=6 +k=1 +x_0=2500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs +type=crs");
// DHDN / 3-degree Gauss-Kruger zone 3 (EPSG:31467)
proj4.defs("EPSG:31467", "+proj=tmerc +lat_0=0 +lon_0=9 +k=1 +x_0=3500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs +type=crs");
// DHDN / 3-degree Gauss-Kruger zone 4 (EPSG:31468)
proj4.defs("EPSG:31468", "+proj=tmerc +lat_0=0 +lon_0=12 +k=1 +x_0=4500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs +type=crs");
// DHDN / 3-degree Gauss-Kruger zone 5 (EPSG:31469)
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

import { KostraApiService } from '../../kostra/services/KostraApiService';

export const fetchKostraData = async (lat, lon) => {
    try {
        console.log(`Fetching KOSTRA data for ${lat}, ${lon}`);
        const data = await KostraApiService.fetchRainData(lat, lon);

        // We need r(15,1) -> Duration 15 min, Return Period 1 year (RN_001A)
        // The service returns 'raw' data which we assume follows the structure data[duration][return_period_key]

        let r_15_1 = 0;
        if (data.raw && data.raw['15']) {
            r_15_1 = data.raw['15'].RN_001A || 0;
        } else {
            console.warn("KOSTRA: No 15-min data found, falling back to mock/default or available data.");
            // Fallback or error handling
        }

        return {
            r_15_1: r_15_1,
            source: "KOSTRA-DWD-2020 (Live)",
            raw: data.raw
        };
    } catch (e) {
        console.error("Failed to fetch KOSTRA data:", e);
        return null;
    }
};
