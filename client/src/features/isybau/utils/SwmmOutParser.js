/**
 * Liest die SWMM-5.2-Binärausgabe (.out).
 *
 * Aufbau genau so, wie ihn der Rechenkern schreibt (solver/src/solver/output.c,
 * output_open / output_end):
 *   Kopf (7 Int32) → IDs (Länge + Zeichen) → Schadstoff-Einheiten →
 *   [InputStartPos] Eigenschaften: Teilflächen (Anzahl, Codes, je Fläche Werte),
 *   Knoten (Anzahl 3, Codes, je Knoten Int32 + 2 Float), Haltungen (Anzahl 5,
 *   Codes, je Haltung Int32 + 4 Float) → Variablen-Anzahl + Codes für Teilfläche,
 *   Knoten, Haltung, System → Startdatum (Double) → Ausgabeschritt (Int32) →
 *   [OutputStartPos] je Periode: Datum (Double) + Werte (Float32) →
 *   Schluss (6 Int32): IDStartPos, InputStartPos, OutputStartPos, Perioden, Fehlercode, Kennzahl.
 *
 * Früher suchte der Parser eine Signatur in den ersten 5000 Byte; bei mehr als
 * rund 100 Knoten lag sie dahinter und alle Ganglinien fehlten (doc/09, Befund 4b).
 */
export class SwmmOutParser {
    constructor(buffer) {
        this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        this.offset = 0;
        this.encoder = new TextDecoder('utf-8');
    }

    readInt32() {
        const val = this.view.getInt32(this.offset, true); // Little Endian
        this.offset += 4;
        return val;
    }

    readFloat32() {
        const val = this.view.getFloat32(this.offset, true);
        this.offset += 4;
        return val;
    }

    readDouble() { // Float64
        const val = this.view.getFloat64(this.offset, true);
        this.offset += 8;
        return val;
    }


    parse() {
        const MAGIC = 516114522;
        const len = this.view.byteLength;
        if (len < 7 * 4 + 6 * 4) throw new Error("Invalid SWMM Output File: Bad Magic Number");

        this.offset = 0;
        if (this.readInt32() !== MAGIC) throw new Error("Invalid SWMM Output File: Bad Magic Number");
        this.readInt32(); // Version
        this.readInt32(); // Durchflusseinheit (3 = CMS)
        const numSubcatch = this.readInt32();
        const numNodes = this.readInt32();
        const numLinks = this.readInt32();
        const numPolluts = this.readInt32();

        // Schluss: Positionen und Periodenzahl
        const t = len - 6 * 4;
        const inputStartPos = this.view.getInt32(t + 4, true);
        const outputStartPos = this.view.getInt32(t + 8, true);
        const numPeriods = this.view.getInt32(t + 12, true);
        if (this.view.getInt32(t + 20, true) !== MAGIC) {
            throw new Error("SWMM .out: Dateiende ohne Kennzahl — Lauf abgebrochen oder Datei unvollständig.");
        }

        const readId = () => {
            const n = this.readInt32();
            const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, n);
            this.offset += n;
            return this.encoder.decode(bytes);
        };
        const subcatchIds = Array.from({ length: numSubcatch }, readId);
        const nodeIds = Array.from({ length: numNodes }, readId);
        const linkIds = Array.from({ length: numLinks }, readId);
        for (let i = 0; i < numPolluts; i++) readId();
        this.offset += numPolluts * 4; // Schadstoff-Einheiten

        if (this.offset !== inputStartPos) {
            throw new Error(`SWMM .out: Eigenschaftsblock bei Byte ${this.offset} erwartet, laut Dateiende ${inputStartPos}.`);
        }

        // Eigenschaften überspringen (je Objekt: Anzahl Werte à 4 Byte)
        const skipProps = (count) => {
            const nProps = this.readInt32();
            this.offset += nProps * 4;              // Codes
            this.offset += count * nProps * 4;      // Werte (Int32/Float32, je 4 Byte)
        };
        skipProps(numSubcatch);
        skipProps(numNodes);
        skipProps(numLinks);

        // Ergebnisvariablen: Anzahl + Codes (Codes = enums.h *ResultType)
        const readCodes = () => Array.from({ length: this.readInt32() }, () => this.readInt32());
        const subCodes = readCodes();
        const nodeCodes = readCodes();
        const linkCodes = readCodes();
        const sysCodes = readCodes();
        this.readDouble(); // Startdatum
        this.readInt32();  // Ausgabeschritt (s)

        const numSubVars = subCodes.length, numNodeVars = nodeCodes.length;
        const numLinkVars = linkCodes.length, numSysVars = sysCodes.length;
        const bytesPerStep = 8 + 4 * (numSubcatch * numSubVars + numNodes * numNodeVars + numLinks * numLinkVars + numSysVars);

        if (this.offset !== outputStartPos || outputStartPos + numPeriods * bytesPerStep + 6 * 4 !== len) {
            throw new Error(`SWMM .out: Aufbau passt nicht zur Dateilänge (Ergebnisbeginn ${this.offset} ≠ ${outputStartPos} oder Länge ≠ ${numPeriods} Perioden).`);
        }

        // Position einer Größe innerhalb des Datensatzes — über den Code, nicht geraten.
        const pos = (codes, code) => {
            const i = codes.indexOf(code);
            if (i < 0) throw new Error(`SWMM .out: Ergebnisgröße ${code} fehlt.`);
            return i * 4;
        };
        const SUB_RUNOFF = pos(subCodes, 4);                                   // SUBCATCH_RUNOFF
        const N_DEPTH = pos(nodeCodes, 0), N_VOL = pos(nodeCodes, 2);          // NODE_DEPTH, NODE_VOLUME
        const N_INFLOW = pos(nodeCodes, 4), N_FLOOD = pos(nodeCodes, 5);       // NODE_INFLOW, NODE_OVERFLOW
        const L_FLOW = pos(linkCodes, 0), L_VEL = pos(linkCodes, 2);           // LINK_FLOW, LINK_VELOCITY
        const L_VOL = pos(linkCodes, 3), L_CAP = pos(linkCodes, 4);            // LINK_VOLUME, LINK_CAPACITY

        const f32 = (o) => this.view.getFloat32(o, true);
        const timeSeries = [];
        for (let p = 0; p < numPeriods; p++) {
            const date = this.readDouble(); // Julianisches Datum
            const stepData = { time: 0, date, nodes: {}, edges: {}, subcatchments: {} };

            for (let i = 0; i < numSubcatch; i++) {
                stepData.subcatchments[subcatchIds[i]] = { runoff: f32(this.offset + SUB_RUNOFF) };
                this.offset += numSubVars * 4;
            }
            for (let i = 0; i < numNodes; i++) {
                stepData.nodes[nodeIds[i]] = {
                    depth: f32(this.offset + N_DEPTH),
                    vol: f32(this.offset + N_VOL),
                    inflow: f32(this.offset + N_INFLOW) * 1000, // CMS -> l/s
                    flooding: f32(this.offset + N_FLOOD)
                };
                this.offset += numNodeVars * 4;
            }
            for (let i = 0; i < numLinks; i++) {
                const flow = f32(this.offset + L_FLOW);
                stepData.edges[linkIds[i]] = {
                    q: Math.abs(flow) * 1000,   // CMS -> l/s
                    signedQ: flow * 1000,       // mit Vorzeichen (Fließrichtung)
                    v: f32(this.offset + L_VEL),
                    vol: f32(this.offset + L_VOL),
                    utilization: f32(this.offset + L_CAP) // Füllungsgrad A/Avoll (0–1)
                };
                this.offset += numLinkVars * 4;
            }
            this.offset += numSysVars * 4;
            timeSeries.push(stepData);
        }

        // Zeitachse in Sekunden ab dem ersten Ausgabezeitpunkt
        if (timeSeries.length > 0) {
            const startJD = timeSeries[0].date;
            for (const step of timeSeries) step.time = (step.date - startJD) * 86400;
        }
        return timeSeries;
    }
}
