/**
 * Domain Model for a Structure (Bauwerk) in the sewer network.
 * Represents complex objects like basins, weirs, or special chambers.
 */
export class Structure {
    constructor(options = {}) {
        this.id = options.id;
        this.type = options.type || "Bauwerk";

        // Geometry
        this.x = Number(options.x) || 0;
        this.y = Number(options.y) || 0;
        this.z = Number(options.z) || 0; // Sole Elevation

        // Dimensions
        this.width = Number(options.width) || 0;
        this.length = Number(options.length) || 0;
        this.height = Number(options.height) || 0; // Usable height

        // Metadata
        this.name = options.name || "";
        this.material = options.material || "";
        this.year = options.year || null;

        // Hydraulic Properties
        this.volume = Number(options.volume) || 0; // m3
        this.storageArea = Number(options.storageArea) || 0; // m2
        this.overflowLevel = Number(options.overflowLevel) || null;
    }

    static fromRaw(data) {
        if (!data.id) throw new Error("Structure must have an ID");
        return new Structure({
            id: data.id,
            x: data.pos?.x || data.x,
            y: data.pos?.y || data.y,
            z: data.pos?.z || data.z,
            type: data.type,
            width: data.dim?.width || data.width,
            length: data.dim?.length || data.length,
            // Add mapping from raw ISYBAU/XML fields if needed
            name: data.Objektbezeichnung || data.id,
        });
    }
}
