/**
 * GeoJSONParser.js
 * Parses and validates GeoJSON input, ensuring FeatureCollection format.
 */

export const GeoJSONParser = {
    /**
     * Parses a GeoJSON string or object.
     * @param {string|Object} input - The GeoJSON input.
     * @returns {Object} A cleaned FeatureCollection.
     */
    parse(input) {
        let geojson = input;

        // Auto-parse string input
        if (typeof input === 'string') {
            try {
                geojson = JSON.parse(input);
            } catch (e) {
                console.error("GeoJSON Parse Error:", e);
                return { type: "FeatureCollection", features: [] };
            }
        }

        // Validate FeatureCollection
        if (!geojson || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
            console.warn("Input is not a valid FeatureCollection. Attempting to wrap...");
            if (geojson && geojson.type === 'Feature') {
                geojson = { type: "FeatureCollection", features: [geojson] };
            } else {
                return { type: "FeatureCollection", features: [] };
            }
        }

        const cleanFeatures = [];

        for (const feature of geojson.features) {
            if (!feature || !feature.geometry) continue;

            const type = feature.geometry.type;

            // Filter Logic: Only Polygons / MultiPolygons for now (Buildings/Walls)
            if (type === 'Polygon' || type === 'MultiPolygon') {

                // Property Defaults
                if (!feature.properties) feature.properties = {};

                // Height Default
                if (feature.properties.height === undefined || feature.properties.height === null) {
                    feature.properties.height = 10.0; // Default 10m
                }

                // Ensure numeric
                feature.properties.height = parseFloat(feature.properties.height);

                // Data Unification: Enforce type 'BUILDING' (uppercase for Store consistency)
                if (!feature.properties.type) {
                    feature.properties.type = 'BUILDING';
                } else {
                    feature.properties.type = feature.properties.type.toUpperCase();
                }

                // Assign ID if missing
                if (!feature.id) {
                    feature.id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substr(2, 9);
                }

                cleanFeatures.push(feature);
            }
        }

        return {
            type: "FeatureCollection",
            features: cleanFeatures
        };
    }
};
