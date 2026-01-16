/**
 * Domain Model for a Connection Point (Anschlusspunkt).
 * Represents a lateral connection, inlet, or virtual node.
 */
export class ConnectionPoint {
    constructor(options = {}) {
        this.id = options.id;
        this.type = options.type || "Anschlusspunkt";

        // Psition
        this.x = Number(options.x) || 0;
        this.y = Number(options.y) || 0;
        this.z = Number(options.z) || 0;

        // Reference
        this.connectedEdgeId = options.connectedEdgeId || null; // Connects to pipe?
        this.houseConnectionChange = options.houseConnectionChange || null; // Stationing
    }

    static fromRaw(data) {
        if (!data.id) throw new Error("ConnectionPoint must have an ID");
        return new ConnectionPoint({
            id: data.id,
            x: data.pos?.x || data.x,
            y: data.pos?.y || data.y,
            z: data.pos?.z || data.z,
            type: data.type,
            connectedEdgeId: data.connected_edge || null
        });
    }
}
