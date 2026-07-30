/**
 * Domain Model for a Node (Knoten/Schacht) in the sewer network.
 */
export class Node {
    constructor(options = {}) {
        const { id, x, y, z, type = "Schacht", depth = 2.0, coverZ = null, isManhole = true, status = 0, diameter = 0 } = options;

        this.id = id;
        // DEBUG LOGGING
        const rawX = Number(x);
        const rawY = Number(y);
        /*
        if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) {
             console.warn(`Node ${id} received invalid coords:`, x, y);
        }
        */

        this.x = Number.isFinite(rawX) ? rawX : 0;
        this.y = Number.isFinite(rawY) ? rawY : 0;
        this.z = Number.isFinite(Number(z)) ? Number(z) : 0; // Sohlhöhe (Invert Elevation)

        this.type = type;

        let d = Number(depth);

        // Metadata
        this.status = status || 0;
        this.diameter = Number(diameter) || 0; // Schachtdurchmesser

        // Calculate or store Cover Elevation (Deckelhöhe)
        if (coverZ !== null && coverZ !== undefined && !isNaN(Number(coverZ))) {
            this.coverZ = Number(coverZ);
            if (!d || d <= 0) {
                d = Math.max(0, this.coverZ - this.z);
            }
        } else {
            if (!d || d <= 0) d = 2.0;
            this.coverZ = this.z + d;
        }

        this.depth = d; // Max Tiefe

        // Hydraulic Properties
        this.constantInflow = Number(options.constantInflow) || 0;
        this.volume = Number(options.volume) || 0;
        this.weirHeight = Number(options.weirHeight) || 0;
        this.constantOutflow = Number(options.constantOutflow) || 0;
        this.outflowType = options.outflowType || 'free';

        // Sonderbauwerk-Parameter (Wehr/Drossel/Schieber/Pumpe/Speicher) —
        // müssen hier deklariert sein, sonst verwirft toJSON() sie und der
        // SwmmBuilder im Worker sieht sie nie.
        this.wehrWidth = Number(options.wehrWidth) || 0;
        this.dischargeCoeff = Number(options.dischargeCoeff) || 0;
        this.maxOutflow = Number(options.maxOutflow) || 0;
        this.initialOpening = (options.initialOpening !== undefined && options.initialOpening !== null)
            ? Number(options.initialOpening) : 1.0;
        this.onDepth = Number(options.onDepth) || 0;
        this.offDepth = Number(options.offDepth) || 0;
        this.pumpRate = Number(options.pumpRate) || 0;
        this.pumpHead = Number(options.pumpHead) || 0;       // Förderhöhe (m)
        this.gateWidth = Number(options.gateWidth) || 0;     // Schieberbreite (m)
        this.initDepth = Number(options.initDepth) || 0;
        this.maxDepth = Number(options.maxDepth) || 0;       // Speicher: Nutztiefe (m)
        this.storageShape = options.storageShape || 'PRISMATIC'; // PRISMATIC | CONICAL | PYRAMIDAL
        this.evapFactor = Number(options.evapFactor) || 0;   // Speicher: Verdunstungsanteil (0-1)
        this.weirType = ['TRANSVERSE', 'SIDEFLOW', 'V-NOTCH'].includes(options.weirType) ? options.weirType : 'TRANSVERSE';
        this.orificeType = options.orificeType === 'SIDE' ? 'SIDE' : 'BOTTOM';
        this.gated = options.gated === true;                 // Rückschlagklappe (Wehr/Drossel/Schieber)
        this.is_sink = options.is_sink === true;

        // Rechen/Sieb/Einlaufbauwerk (Bauwerkstyp 10/11/14): Eintrittsverlustbeiwert
        // für [LOSSES] (link_readLossParams) — die Haltung bleibt ein normaler
        // Conduit, bekommt nur einen zusätzlichen hydraulischen Verlust.
        this.lossCoeff = Number(options.lossCoeff) || 0;

        // TABULAR-Speicherkurve (Tiefe/Fläche-Paare) — Alternative zur FUNCTIONAL-
        // Näherung (storageShape). Default: 3 Stützstellen aus volume/maxDepth
        // abgeleitet, damit der Kurven-Editor nicht leer startet, wenn auf TABULAR
        // umgeschaltet wird (grobe PRISMATIC-Näherung als Startpunkt).
        if (Array.isArray(options.storageCurve) && options.storageCurve.length >= 2) {
            this.storageCurve = options.storageCurve.map(p => ({ depth: Number(p.depth) || 0, area: Number(p.area) || 0 }));
        } else {
            const d = this.maxDepth > 0 ? this.maxDepth : 3.0;
            const a = this.volume > 0 ? this.volume / d : 10.0;
            this.storageCurve = [{ depth: 0, area: a }, { depth: d / 2, area: a }, { depth: d, area: a }];
        }

        // Flow-Divider (Bauwerkstyp-Sentinel 'Divider', kein ISYBAU-Bauwerkstyp) —
        // beide ausgehenden Haltungen bleiben normale Conduits, nur der Knoten
        // bekommt einen [DIVIDERS]-Eintrag mit der ID der abgezweigten Haltung.
        this.dividerType = options.dividerType === 'CUTOFF' ? 'CUTOFF' : 'OVERFLOW';
        this.dividerLinkId = options.dividerLinkId || null;
        this.dividerCutoffFlow = Number(options.dividerCutoffFlow) || 0;

        this.punktkennung = options.punktkennung || null;
        this.bauwerkstyp  = options.bauwerkstyp  ?? null;
        this.bauwerkData  = options.bauwerkData  ?? null;

        // Kanaltyp nach ISYBAU <Entwaesserungsart> (KM/KR/KS) — für die
        // Netz-Einfärbung (mappings.js: getEntwaesserungsartColor). Nur
        // Anzeige, aktuell keine manuelle Editier-UI dafür.
        this.entwaesserungsart = options.entwaesserungsart ?? null;

        this.applyOverflowState({ isManhole, canOverflow: options.canOverflow });

        // Simulation / Runtime State (not persisted in raw basics)
        this.currentDepth = 0;
        this.currentHead = 0;
    }

    /**
     * Creates a safe Node instance from raw parsed data (e.g. from XML parser or JSON).
     * @param {Object} data 
     */
    static fromRaw(data) {
        if (!data.id) throw new Error("Node must have an ID");

        return new Node({
            id: data.id,
            x: data.x || 0,
            y: data.y || 0,
            z: data.z || 0,
            type: data.type,
            depth: data.depth || 0,
            coverZ: data.coverZ,
            status: data.status,
            diameter: data.diameter,
            // Prioritize imported isManhole flag (e.g. from Status 2), otherwise fallback to type check
            isManhole: (data.isManhole !== undefined) ? data.isManhole : (data.type === "Schacht" || data.type === "Bauwerk"),

            constantInflow: data.constantInflow,
            volume: data.volume,
            weirHeight: data.weirHeight,
            constantOutflow: data.constantOutflow,
            outflowType: data.outflowType,
            canOverflow: data.canOverflow,
            punktkennung: data.punktkennung,
            bauwerkstyp:  data.bauwerkstyp,
            bauwerkData:  data.bauwerkData,
            entwaesserungsart: data.entwaesserungsart,
            wehrWidth: data.wehrWidth,
            dischargeCoeff: data.dischargeCoeff,
            maxOutflow: data.maxOutflow,
            initialOpening: data.initialOpening,
            onDepth: data.onDepth,
            offDepth: data.offDepth,
            pumpRate: data.pumpRate,
            pumpHead: data.pumpHead,
            gateWidth: data.gateWidth,
            initDepth: data.initDepth,
            maxDepth: data.maxDepth,
            storageShape: data.storageShape,
            evapFactor: data.evapFactor,
            weirType: data.weirType,
            orificeType: data.orificeType,
            gated: data.gated,
            is_sink: data.is_sink,
            lossCoeff: data.lossCoeff,
            storageCurve: data.storageCurve,
            dividerType: data.dividerType,
            dividerLinkId: data.dividerLinkId,
            dividerCutoffFlow: data.dividerCutoffFlow
        });
    }

    /**
     * Single source of truth für die Überstau-Kopplung:
     * isManhole=false (unterirdisch/virtuell, z.B. ISYBAU Status 2) erzwingt
     * canOverflow=false. Jede Mutation der beiden Flags MUSS hier durchlaufen,
     * damit beide Editoren (ElementInfo, ElementPropertiesModal) denselben
     * Zustand erzeugen.
     */
    applyOverflowState({ isManhole = this.isManhole, canOverflow = this.canOverflow } = {}) {
        this.isManhole = isManhole !== false;
        this.canOverflow = this.isManhole ? (canOverflow !== false) : false;
    }

    /**
     * Updates coordinates (e.g. from Editor drag)
     */
    move(x, y) {
        this.x = x;
        this.y = y;
    }

    /**
     * Validation check
     */
    isValid() {
        return !isNaN(this.x) && !isNaN(this.y) && !isNaN(this.z);
    }

    toJSON() {
        return {
            id: this.id,
            x: this.x,
            y: this.y,
            z: this.z,
            type: this.type,
            depth: this.depth,
            coverZ: this.coverZ,
            status: this.status,
            diameter: this.diameter,
            // special props
            constantInflow: this.constantInflow,
            volume: this.volume,
            weirHeight: this.weirHeight,
            constantOutflow: this.constantOutflow,
            outflowType: this.outflowType,
            canOverflow: this.canOverflow,
            isManhole: this.isManhole,
            punktkennung: this.punktkennung,
            bauwerkstyp:  this.bauwerkstyp,
            bauwerkData:  this.bauwerkData,
            entwaesserungsart: this.entwaesserungsart,
            wehrWidth: this.wehrWidth,
            dischargeCoeff: this.dischargeCoeff,
            maxOutflow: this.maxOutflow,
            initialOpening: this.initialOpening,
            onDepth: this.onDepth,
            offDepth: this.offDepth,
            pumpRate: this.pumpRate,
            pumpHead: this.pumpHead,
            gateWidth: this.gateWidth,
            initDepth: this.initDepth,
            maxDepth: this.maxDepth,
            storageShape: this.storageShape,
            evapFactor: this.evapFactor,
            weirType: this.weirType,
            orificeType: this.orificeType,
            gated: this.gated,
            is_sink: this.is_sink,
            lossCoeff: this.lossCoeff,
            storageCurve: this.storageCurve,
            dividerType: this.dividerType,
            dividerLinkId: this.dividerLinkId,
            dividerCutoffFlow: this.dividerCutoffFlow
        };
    }
}
