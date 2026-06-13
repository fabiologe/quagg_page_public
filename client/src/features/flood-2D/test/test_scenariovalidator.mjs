import { Severity, IssueCollector, bridgeSpan, validateBridgeChannelFit } from '../middleware/ScenarioValidator.js';

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

console.log(fail === 0 ? `\n✅ Alle ScenarioValidator-Tests bestanden (${pass}).` : `\n❌ ${fail} fehlgeschlagen, ${pass} ok.`);
process.exit(fail === 0 ? 0 : 1);
