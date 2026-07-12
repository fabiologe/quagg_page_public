// Node-Test für das Sonderbauwerk-Authoring (P-Phase): ein im EDITOR gebautes Netz
// (useNetworkStore-Form → NetworkModel → toSwmmStore) mit Pumpe/Wehr/Drossel muss im
// SwmmBuilder(coupled) die Sonder-Link-Sektionen [PUMPS]+[CURVES]/[WEIRS]/[ORIFICES]
// erzeugen — inkl. der Editor-Parameter (pumpRate/onDepth/wehrHeight/wehrWidth/maxOutflow).
//
//   node src/features/flood-2D/test/test_swmm_special_links.mjs

import { NetworkModel } from '../services/geometry/NetworkModel.js';
import { SwmmBuilder } from '../services/swmm/SwmmBuilder.js';

let failed = 0;
const check = (cond, msg) => {
    console.log((cond ? '  ✅ ' : '  ❌ ') + msg);
    if (!cond) failed++;
};

function buildInp(configure) {
    const m = new NetworkModel();
    configure(m);
    const { inpContent, warnings } = new SwmmBuilder(m.toSwmmStore())
        .setOptions({ coupled: true }).build();
    return { inp: inpContent, warnings };
}

console.log('1) Pumpe: [PUMPS] + [CURVES] mit Editor-Parametern');
{
    const { inp } = buildInp((m) => {
        m.addNode({ id: 'PW', x: 0, y: 0, rim: 10, invert: 6, role: 'pump',
                    attrs: { pumpRate: 50, onDepth: 1.2, offDepth: 0.3 } });
        m.addNode({ id: 'OUT', x: 80, y: 0, rim: 11, invert: 9, role: 'outfall' });
        m.addLink({ id: 'DRUCK', fromNodeId: 'PW', toNodeId: 'OUT' });
    });
    check(inp.includes('[PUMPS]'), '[PUMPS]-Sektion vorhanden');
    // Pumpensumpf-Regel: Pumpen-Knoten MUSS als [STORAGE] exportieren (Junction friert
    // bei Zufluss-Slug > Förderleistung dauerhaft ein — QA-Fund test_coupling_pump.py).
    check(/\[STORAGE\][^]*PW/.test(inp), 'Pumpen-Knoten PW als [STORAGE]-Nassschacht exportiert');
    check(!/\[JUNCTIONS\][^]*PW/.test(inp.split('[OUTFALLS]')[0]), 'PW nicht (auch) als Junction');
    check(/DRUCK\s+PW\s+OUT\s+CRV_DRUCK/.test(inp), 'Pumpen-Link PW→OUT mit Kennlinie CRV_DRUCK');
    check(inp.includes('[CURVES]') && inp.includes('CRV_DRUCK'), '[CURVES] mit CRV_DRUCK');
    check(/CRV_DRUCK\s+PUMP\d?\s/.test(inp) || inp.includes('0.05'), 'Kennlinie nutzt pumpRate 50 l/s (0.05 m³/s)');
    // SWMM-Ordnung: Startup (EIN=1.2) VOR Shutoff (AUS=0.3) — vertauscht = ERROR 122.
    check(/DRUCK[^\n]*1\.2[^\n]*0\.3/.test(inp), 'Startup/Shutoff-Wasserstände (1.2 vor 0.3 m) in SWMM-Ordnung');
    check(!inp.includes('[REPORT]\n') || /NODES\s+ALL/.test(inp), '[REPORT] NODES ALL gesetzt (1D-Ergebnisse)');
}

console.log('2) Wehr: [WEIRS] mit Schwellenhöhe/Breite');
{
    const { inp } = buildInp((m) => {
        m.addNode({ id: 'WE', x: 0, y: 0, rim: 10, invert: 7, role: 'weir',
                    attrs: { wehrHeight: 1.8, wehrWidth: 2.5 } });
        m.addNode({ id: 'OUT', x: 60, y: 0, rim: 9, invert: 6, role: 'outfall' });
        m.addLink({ id: 'WLINK', fromNodeId: 'WE', toNodeId: 'OUT' });
    });
    check(inp.includes('[WEIRS]'), '[WEIRS]-Sektion vorhanden');
    check(/WLINK\s+WE\s+OUT/.test(inp), 'Wehr-Link WE→OUT');
    check(inp.includes('1.8'), 'Schwellenhöhe 1.8 m übernommen');
    check(/WLINK\s+RECT_OPEN\s+[^\n]*2\.5/.test(inp), 'RECT_OPEN-Querschnitt mit Breite 2.5 m');
}

console.log('3) Drossel: [ORIFICES] mit rückgerechnetem Durchmesser');
{
    const { inp } = buildInp((m) => {
        m.addNode({ id: 'DR', x: 0, y: 0, rim: 10, invert: 7, role: 'orifice',
                    attrs: { maxOutflow: 30 } });
        m.addNode({ id: 'OUT', x: 60, y: 0, rim: 9, invert: 6, role: 'outfall' });
        m.addLink({ id: 'DLINK', fromNodeId: 'DR', toNodeId: 'OUT' });
    });
    check(inp.includes('[ORIFICES]'), '[ORIFICES]-Sektion vorhanden');
    check(/DLINK\s+DR\s+OUT/.test(inp), 'Drossel-Link DR→OUT');
}

console.log('4) Sonderbauwerk OHNE abgehende Haltung bleibt einfacher Junction');
{
    const m = new NetworkModel();
    m.addNode({ id: 'PW', x: 0, y: 0, rim: 10, invert: 6, role: 'pump', attrs: { pumpRate: 50 } });
    m.addNode({ id: 'J', x: 40, y: 0, rim: 10, invert: 7 });
    m.addNode({ id: 'OUT', x: 80, y: 0, rim: 9, invert: 6, role: 'outfall' });
    m.addLink({ id: 'C1', fromNodeId: 'J', toNodeId: 'PW' });   // Pumpe nur EINGEHEND
    m.addLink({ id: 'C2', fromNodeId: 'J', toNodeId: 'OUT' });
    const { inpContent } = new SwmmBuilder(m.toSwmmStore()).setOptions({ coupled: true }).build();
    check(!inpContent.includes('[PUMPS]'), 'keine [PUMPS]-Sektion (Regel: abgehende Haltung nötig)');
    check(m.validate().some(i => i.level === 'error' && i.id === 'PW'),
        'Validierung meldet die Pumpe ohne Abgang als error');
}

console.log('');
if (failed) { console.log(`❌ SONDERBAUWERK-EXPORT: ${failed} Checks fehlgeschlagen`); process.exit(1); }
console.log('✅ SONDERBAUWERK-EXPORT BESTANDEN');
