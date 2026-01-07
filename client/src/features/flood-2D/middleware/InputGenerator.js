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
     *    - xyz: string
     *    - buildings: GeoJSON
     *    - roughness: GeoJSON
     *    - rain: { intensity: number, duration: number }
     *    - boundaries: Array
     *    - config: object (.par overrides)
     */
    processScenario(scenario) {
        this.reset();

        // 1. Terrain & Rasterization
        const { header, data } = Rasterizer.createDemFromXYZ(scenario.xyz);
        this.terrainHeader = header;

        Rasterizer.burnBuildings(data, header, scenario.buildings, 10.0); // +10m Height

        const ascContent = Rasterizer.gridToASC(data, header);
        this.files['terrain.asc'] = ascContent;

        // 2. Friction / Roughness
        // Determine global or distributed
        const frictionMap = Rasterizer.generateRoughnessMap(header, scenario.roughness);
        let useFrictionFile = false;
        if (frictionMap) {
            this.files['friction.asc'] = frictionMap;
            useFrictionFile = true;
        }

        // 3. Hydraulics

        // Rain
        if (scenario.rain && scenario.rain.intensity > 0) {
            const rainContent = Hydraulics.prepareRain(scenario.rain.intensity, scenario.rain.duration || 3600);
            this.files['rain.txt'] = rainContent;
        }

        // Boundaries
        // Pass 'data' (DEM) for validation (Point on NoData check)
        const { bdyContent, bcFiles } = Hydraulics.prepareBoundaries(scenario.boundaries || [], header, data);

        if (bdyContent.length > 0) {
            this.files['flow.bdy'] = bdyContent;
            // Merge time series files
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
