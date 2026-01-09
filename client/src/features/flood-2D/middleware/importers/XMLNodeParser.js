/**
 * XMLNodeParser.js
 * Parses specialized XML format (ISYBAU-like) to extract manholes and nodes.
 */

export const XMLNodeParser = {
    /**
     * Parses an XML string and extracts nodes.
     * @param {string} xmlString - The raw XML content.
     * @returns {Array<Object>} Array of parsed node objects.
     */
    parse(xmlString) {
        if (!xmlString) return [];

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "text/xml");

        const nodes = [];
        const facilities = xmlDoc.getElementsByTagName("AbwassertechnischeAnlage");

        for (let i = 0; i < facilities.length; i++) {
            const facility = facilities[i];

            try {
                // 1. ID
                const idTag = facility.getElementsByTagName("Objektbezeichnung")[0];
                const id = idTag ? idTag.textContent.trim() : `UNKNOWN_${i}`;

                // 2. Geometry
                const geometrie = facility.getElementsByTagName("Geometriedaten")[0];
                if (!geometrie) continue;

                const knoten = geometrie.getElementsByTagName("Knoten")[0];
                if (!knoten) continue;

                const punktList = knoten.getElementsByTagName("Punkt");
                if (!punktList || punktList.length === 0) continue;

                // Aggregate Points for this Node
                let x = null;
                let y = null;
                let bottom_level = null;
                let cover_level = null;

                for (let j = 0; j < punktList.length; j++) {
                    const pkt = punktList[j];

                    // Helper to get text of child tag
                    const getText = (tag) => {
                        const el = pkt.getElementsByTagName(tag)[0];
                        return el ? el.textContent.trim() : null;
                    };

                    const rwStr = getText("Rechtswert");
                    const hwStr = getText("Hochwert");
                    const zStr = getText("Punkthoehe");
                    const attr = getText("PunktattributAbwasser"); // 'SMP' or 'DMP'

                    if (rwStr && hwStr) {
                        // We assume all points of the same node have same X/Y (vertical shaft)
                        if (x === null) x = parseFloat(rwStr);
                        if (y === null) y = parseFloat(hwStr);
                    }

                    if (zStr && attr) {
                        const zVal = parseFloat(zStr);
                        if (attr === 'SMP') bottom_level = zVal;
                        else if (attr === 'DMP') cover_level = zVal;
                        else if (attr === 'SBD') {
                            if (bottom_level === null) bottom_level = zVal;
                        }
                    }
                }

                if (x !== null && y !== null) {
                    nodes.push({
                        id,
                        x,
                        y,
                        bottom_level: bottom_level !== null ? bottom_level : 0,
                        cover_level: cover_level !== null ? cover_level : (bottom_level || 0),
                        type: 'manhole'
                    });
                }

            } catch (err) {
                console.warn(`Error parsing facility ${i}:`, err);
            }
        }

        return nodes;
    }
};

/**
 * Helper Alias for named import
 */
export const parseXMLNodes = (xmlString) => {
    return XMLNodeParser.parse(xmlString);
};
