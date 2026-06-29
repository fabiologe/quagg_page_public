import { Severity, IssueCollector, bridgeSpan, validateBridgeChannelFit, validateInflowNozzles, validateBoundaryHydraulics, validateBoundaryProfiles, validateWeirOpenings } from '../middleware/ScenarioValidator.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { console.log(`  ✅ ${msg}`); pass++; } else { console.log(`  ❌ ${msg}`); fail++; } };

console.log('── IssueCollector ──');
{
    const c = new IssueCollector();
    c.warn('a'); c.warn('a');                 // dedup per message
    c.error('boom', { code: 'x' }); c.error('anders', { code: 'x' }); // dedup per code
    c.info('hint');
    ok(c.count === 3, `dedup: 3 Issues (got ${c.count})`);
    ok(c.has(Severity.ERROR), 'has(ERROR)');
    ok(c.maxSeverity === Severity.ERROR, `maxSeverity = error (got ${c.maxSeverity})`);
    ok(c.bySeverity(Severity.WARN).length === 1, 'bySeverity(WARN) = 1');
    ok(JSON.stringify(c.messages) === JSON.stringify(['a', 'boom', 'hint']), 'messages = String[] (Reihenfolge)');

    const c2 = new IssueCollector();
    c2.warn('a'); c2.warn('neu');
    c.merge(c2);
    ok(c.count === 4, `merge mit Dedup (got ${c.count})`);
    ok(new IssueCollector().maxSeverity === null, 'leer → maxSeverity null');
}

console.log('── bridgeSpan ──');
{
    const axisBridge = { axis: [{ x: 0, y: 0 }, { x: 30, y: 0 }] };
    ok(bridgeSpan(axisBridge) === 30, `Achslänge 30 (got ${bridgeSpan(axisBridge)})`);
    const cellBridge = { cells: [{ x: 0, y: 0 }, { x: 3, y: 4 }] };
    ok(bridgeSpan(cellBridge) === 5, `Footprint-BBox-Diagonale 5 (got ${bridgeSpan(cellBridge)})`);
    ok(bridgeSpan({}) === 0, 'ohne Geometrie → 0');
}

console.log('── validateBridgeChannelFit ──');
{
    const bridges = [
        { id: 'breit-01', axis: [{ x: 0, y: 0 }, { x: 35, y: 0 }] },  // 35 m
        { id: 'passt-02', axis: [{ x: 0, y: 0 }, { x: 4, y: 0 }] },   // 4 m
    ];
    const issues = validateBridgeChannelFit(bridges, { width: 5 }).issues;
    ok(issues.length === 1, `nur die zu breite Brücke meldet (got ${issues.length})`);
    ok(issues[0].severity === Severity.WARN, 'Schweregrad WARN');
    ok(issues[0].context.bridgeId === 'breit-01', 'richtige Brücke im Kontext');
    ok(validateBridgeChannelFit([], { width: 5 }).issues.length === 0, 'keine Brücken → keine Issues');
    ok(validateBridgeChannelFit(bridges, { width: 0 }).issues.length === 0, 'kein Gerinne → keine Issues');
}

console.log('── validateInflowNozzles ──');
{
    const header = { ncols: 100, nrows: 100, cellsize: 1, xllcorner: 0, yllcorner: 0 };
    const line = (id, coords) => ({ type: 'Feature', id, geometry: { type: 'LineString', coordinates: coords } });
    const has = (coll, prefix) => coll.issues.some(i => (i.code || '').startsWith(prefix));

    // 1. längs zur Fließrichtung (horizontale Linie + Ost-Fluss) → Korridor-Warnung
    {
        const b = line('par', [[10, 50], [40, 50]]);
        const c = validateInflowNozzles({ par: { type: 'INFLOW_DYNAMIC', flowAngleDeg: 0 } }, [b], header);
        ok(has(c, 'nozzle-parallel-par'), '∥-Fluss (horizontale Linie + Ost) ⇒ Korridor-Warnung');
    }
    // quer zur Fließrichtung (vertikale Linie + Ost-Fluss) → KEINE Warnung
    {
        const b = line('perp', [[50, 10], [50, 40]]);
        const c = validateInflowNozzles({ perp: { type: 'INFLOW_DYNAMIC', flowAngleDeg: 0 } }, [b], header);
        ok(!has(c, 'nozzle-parallel'), '⟂-Fluss (vertikale Linie + Ost) ⇒ keine Korridor-Warnung');
    }
    // richtungslos ⇒ gar keine Nozzle-Prüfung
    {
        const b = line('none', [[10, 50], [40, 50]]);
        const c = validateInflowNozzles({ none: { type: 'INFLOW_DYNAMIC' } }, [b], header);
        ok(c.count === 0, 'richtungslos ⇒ keine Nozzle-Issues');
    }
    // 2. benachbarte Zuläufe mit gegensätzlicher Richtung → Konflikt-Warnung
    {
        const a = line('A', [[50, 10], [50, 40]]);   // col 50, Ost
        const b = line('B', [[51, 10], [51, 40]]);   // col 51 (Nachbar), West
        const c = validateInflowNozzles(
            { A: { type: 'INFLOW_DYNAMIC', flowAngleDeg: 0 }, B: { type: 'INFLOW_DYNAMIC', flowAngleDeg: 180 } },
            [a, b], header);
        ok(has(c, 'nozzle-conflict'), 'benachbart + gegenläufig ⇒ Konflikt-Warnung');
    }
    // gleiche Richtung benachbart ⇒ KEIN Konflikt
    {
        const a = line('A', [[50, 10], [50, 40]]);
        const b = line('B', [[51, 10], [51, 40]]);
        const c = validateInflowNozzles(
            { A: { type: 'INFLOW_DYNAMIC', flowAngleDeg: 0 }, B: { type: 'INFLOW_DYNAMIC', flowAngleDeg: 0 } },
            [a, b], header);
        ok(!has(c, 'nozzle-conflict'), 'benachbart + gleiche Richtung ⇒ kein Konflikt');
    }
    // 3. geschlossener Ring → Taschen-Warnung
    {
        const b = line('ring', [[10, 10], [20, 10], [20, 20], [10, 20], [10, 10]]);
        const c = validateInflowNozzles({ ring: { type: 'INFLOW_DYNAMIC', flowAngleDeg: 0 } }, [b], header);
        ok(has(c, 'nozzle-closed-ring'), 'geschlossener Ring ⇒ Taschen-Warnung');
    }
}

console.log('── Boundary außerhalb Raster (validateBoundaryHydraulics) ──');
{
    const header = { ncols: 100, nrows: 100, cellsize: 1, xllcorner: 0, yllcorner: 0 };
    const line = (id, coords, edge = null) => ({ type: 'Feature', id, geometry: { type: 'LineString', coordinates: coords }, properties: { edge } });
    const has = (coll, prefix) => coll.issues.some(i => (i.code || '').startsWith(prefix));

    // vollständig außerhalb → ERROR
    {
        const b = line('out', [[200, 200], [210, 200]]);
        const c = validateBoundaryHydraulics({ out: { type: 'INFLOW_DYNAMIC' } }, [b], header);
        ok(has(c, 'bnd-outside-out'), 'komplett außerhalb ⇒ ERROR');
        ok(c.has(Severity.ERROR), 'Schweregrad ERROR');
    }
    // teilweise außerhalb → WARN (clip)
    {
        const b = line('clip', [[95, 50], [110, 50]]);
        const c = validateBoundaryHydraulics({ clip: { type: 'INFLOW_DYNAMIC' } }, [b], header);
        ok(has(c, 'bnd-clip-clip'), 'teilweise außerhalb ⇒ WARN (clip)');
    }
    // vollständig innerhalb → keine Raster-Warnung
    {
        const b = line('in', [[10, 50], [40, 50]]);
        const c = validateBoundaryHydraulics({ in: { type: 'INFLOW_DYNAMIC' } }, [b], header);
        ok(!has(c, 'bnd-outside') && !has(c, 'bnd-clip'), 'innerhalb ⇒ keine Raster-Warnung');
    }
}

console.log('── validateBoundaryProfiles ──');
{
    const bnd = (id) => ({ id, geometry: { type: 'Point', coordinates: [10, 10] } });
    const has = (coll, prefix) => coll.issues.some(i => (i.code || '').startsWith(prefix));

    // INFLOW_DYNAMIC ohne Ganglinie und ohne Wert → ERROR
    {
        const c = validateBoundaryProfiles({ a: { type: 'INFLOW_DYNAMIC' } }, [bnd('a')], {});
        ok(has(c, 'bnd-no-source-a'), 'INFLOW_DYNAMIC ohne Quelle ⇒ ERROR');
        ok(c.has(Severity.ERROR), 'Schweregrad ERROR');
    }
    // INFLOW_CONSTANT mit konstantem Wert → ok (synthetische Ganglinie)
    {
        const c = validateBoundaryProfiles({ a: { type: 'INFLOW_CONSTANT', value: 2.5 } }, [bnd('a')], {});
        ok(c.count === 0, 'INFLOW_CONSTANT mit Wert ⇒ keine Issues');
    }
    // INFLOW_DYNAMIC mit profileId + Daten → ok
    {
        const gl = { g1: { name: 'G1', data: [{ t: 0, v: 1 }, { t: 60, v: 2 }] } };
        const c = validateBoundaryProfiles({ a: { type: 'INFLOW_DYNAMIC', profileId: 'g1' } }, [bnd('a')], gl);
        ok(c.count === 0, 'INFLOW_DYNAMIC mit gefüllter Ganglinie ⇒ keine Issues');
    }
    // profileId zeigt auf leere Ganglinie → ERROR
    {
        const gl = { g1: { name: 'G1', data: [] } };
        const c = validateBoundaryProfiles({ a: { type: 'INFLOW_DYNAMIC', profileId: 'g1' } }, [bnd('a')], gl);
        ok(has(c, 'bnd-no-source-a'), 'leere Ganglinie ⇒ ERROR');
    }
    // OUTFLOW_FREE braucht keine Quelle
    {
        const c = validateBoundaryProfiles({ a: { type: 'OUTFLOW_FREE' } }, [bnd('a')], {});
        ok(c.count === 0, 'OUTFLOW_FREE ⇒ keine Quelle nötig');
    }
    // verwaiste Zuweisung (keine Boundary) → ignoriert
    {
        const c = validateBoundaryProfiles({ ghost: { type: 'INFLOW_DYNAMIC' } }, [], {});
        ok(c.count === 0, 'verwaiste Zuweisung ⇒ ignoriert');
    }
}

console.log('── validateWeirOpenings ──');
{
    const header = { ncols: 10, nrows: 10, cellsize: 1, xllcorner: 0, yllcorner: 0 };
    const dem = new Float32Array(100).fill(5);   // Gelände überall 5 m
    const points = [{ x: 2, y: 2, z: 10 }, { x: 8, y: 2, z: 10 }]; // Krone 10 m
    const line = (openings) => ({ id: 'wl', points, openings });
    const has = (coll, prefix) => coll.issues.some(i => (i.code || '').startsWith(prefix));

    // Soffitte über der Krone → ERROR
    {
        const c = validateWeirOpenings([line([{ x: 5, y: 2, type: 'rect', soffit: 12, width: 2, height: 2 }])], header, dem);
        ok(has(c, 'weir-open-above-crest'), 'Soffitte > Krone ⇒ ERROR');
        ok(c.has(Severity.ERROR), 'Schweregrad ERROR');
    }
    // Soffitte unter Gelände → ERROR
    {
        const c = validateWeirOpenings([line([{ x: 5, y: 2, type: 'rect', soffit: 4, width: 2, height: 2 }])], header, dem);
        ok(has(c, 'weir-open-below-terrain'), 'Soffitte ≤ Gelände ⇒ ERROR');
    }
    // gültige Öffnung (Gelände < Soffitte < Krone) → keine Issues
    {
        const c = validateWeirOpenings([line([{ x: 5, y: 2, type: 'rect', soffit: 8, width: 2, height: 2 }])], header, dem);
        ok(c.count === 0, 'gültige Öffnung ⇒ keine Issues');
    }
    // Breite 0 → WARN
    {
        const c = validateWeirOpenings([line([{ x: 5, y: 2, type: 'round', soffit: 8, width: 0 }])], header, dem);
        ok(has(c, 'weir-open-zero-width'), 'Breite 0 ⇒ WARN');
    }
    // ohne demGrid entfällt nur die Gelände-Prüfung (über-Krone trotzdem erkannt)
    {
        const c = validateWeirOpenings([line([{ x: 5, y: 2, type: 'rect', soffit: 12, width: 2, height: 2 }])], null, null);
        ok(has(c, 'weir-open-above-crest') && !has(c, 'weir-open-below-terrain'), 'ohne DEM: Krone geprüft, Gelände übersprungen');
    }
}

console.log(fail === 0 ? `\n✅ Alle ScenarioValidator-Tests bestanden (${pass}).` : `\n❌ ${fail} fehlgeschlagen, ${pass} ok.`);
process.exit(fail === 0 ? 0 : 1);
