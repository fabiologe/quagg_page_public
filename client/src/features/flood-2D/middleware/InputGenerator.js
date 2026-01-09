import { Rasterizer } from './Rasterizer.js';
import { Hydraulics } from './Hydraulics.js';

/**
 * InputGenerator.js
 * The Orchestrator Module.
 * Coordinates Geometry, Rasterization, and Hydraulics to produce simulation files.
 */
export class InputGenerator {
    constructor() {
        this.reset();
    }

    reset() {
        this.terrainHeader = null;
        this.files = {};
    }

    /**
     * Main entry point to process a full scenario input.
     * @param {object} scenario input data
     *    - grid: { header, data } (Pre-parsed Grid) OR xyz: string (Raw)
     *    - buildings: GeoJSON
     *    - roughness: GeoJSON
     *    - rain: { intensity: number, duration: number }
     *    - boundaries: Array
     *    - config: object (.par overrides)
     */
    processScenario(scenario) {
        this.reset();

        // 1. Terrain & Rasterization
        let header, data;

        if (scenario.grid) {
            // Use pre-parsed grid from GeoStore
            header = scenario.grid.header || scenario.grid; // Handle if flat or nested
            data = scenario.grid.data || scenario.grid.gridData;
        } else if (scenario.xyz) {
            // Parse raw
            const res = Rasterizer.createDemFromXYZ(scenario.xyz);
            header = res.header;
            data = res.data;
        } else {
            throw new Error("InputGenerator: No Terrain Grid or XYZ provided.");
        }

        this.terrainHeader = header;

        // Burn Buildings
        if (scenario.buildings) {
            Rasterizer.burnBuildings(data, header, scenario.buildings, 10.0);
        }

        const ascContent = Rasterizer.gridToASC(data, header);
        this.files['terrain.asc'] = ascContent;

        // 2. Friction / Roughness
        let useFrictionFile = false;
        if (scenario.roughness) {
            const frictionMap = Rasterizer.generateRoughnessMap(header, scenario.roughness);
            if (frictionMap) {
                this.files['friction.asc'] = frictionMap;
                useFrictionFile = true;
            }
        }

        // 3. Hydraulics

        // Rain
        if (scenario.rain) {
            // Check if it's simple intensity OR time series
            // scenario.rain might be array of {t, v} or simple config
            if (typeof scenario.rain === 'object' && scenario.rain.intensity) {
                const rainContent = Hydraulics.prepareRain(scenario.rain.intensity, scenario.rain.duration || 3600);
                this.files['rain.txt'] = rainContent;
            } else if (Array.isArray(scenario.rain)) {
                // Handle Series (TODO: Implement Hydraulics.prepareRainSeries)
                // For now assuming simple block rain if intensity provided
            }
        }

        // Boundaries
        // Pass 'data' (DEM) for validation
        const { bdyContent, bcFiles } = Hydraulics.prepareBoundaries(scenario.boundaries || [], header, data);

        if (bdyContent.length > 0) {
            this.files['flow.bdy'] = bdyContent;
            Object.assign(this.files, bcFiles);
        }

        // 4. Parameter File (run.par)
        const parContent = this.generateParFile(scenario.config, useFrictionFile, !!this.files['rain.txt']);
        this.files['run.par'] = parContent;

        return this.files;
    }

    getVirtualFiles() {
        return this.files;
    }

    generateParFile(configOverride, hasFrictionMap, hasRain) {
        // Defaults
        const config = {
            demfile: 'terrain.asc',
            resroot: 'res',
            dirroot: 'results',
            sim_time: 3600,
            initial_tstep: 1.0,
            massint: 60.0,
            saveint: 60.0,
            FPfric: 0.035, // Default roughness
            acceleration: 'ON',
            adaptoff: 'ON',
            ...configOverride
        };

        if (hasFrictionMap) {
            config.frictionfile = 'friction.asc';
        }

        if (hasRain) {
            config.rainfile = 'rain.txt';
        }

        let content = '';
        for (const [key, val] of Object.entries(config)) {
            content += `${key.padEnd(20)} ${val}\n`;
        }
        return content;
    }
}
