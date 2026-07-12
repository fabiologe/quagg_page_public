// Tests für die Ingenieurs-Eingaben am Kanalnetz (Node-pur, kein Docker):
//   1. prefill.js — Teilfüllungs-Physik (Manning, Q/Q_voll-Kurve, Inversion)
//   2. Vorfüllfaktor im SwmmBuilder — [DWF]-Basisabfluss + InitDepth + InitFlow
//   3. Knoten-Zufluss — konstant + Ganglinie als [INFLOWS]/[TIMESERIES] (nicht DWF)
//   4. Outfall-Randbedingung — FIXED mit Vorfluter-Wasserstand
//   5. „verdeckelt" (attrs.couple=false) — Detector nimmt den Schacht aus der Kopplung
//
//   node test_network_inflow_prefill.mjs

import { partialSection, flowRatio, fillDepthRatio, manningQfull } from '../services/swmm/prefill.js';
import { NetworkModel } from '../services/geometry/NetworkModel.js';
import { SwmmBuilder } from '../services/swmm/SwmmBuilder.js';
import { detectCouplingNodes } from '../services/geometry/couplingDetector.js';

let fails = 0;
const ok = (c, m) => { if (c) console.log('  ✅ ' + m); else { console.error('  ❌ ' + m); fails++; } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

console.log('1) Teilfüllungs-Physik (prefill.js)');
{
    // Kreis D=1 vollgefüllt: A=π/4, P=π
    const f = partialSection('CIRCULAR', 1, 0, 1);
    ok(near(f.A, Math.PI / 4, 1e-6) && near(f.P, Math.PI, 1e-6), 'Kreis voll: A=π/4, P=π');
    // Halb gefüllt: A=π/8, P=π/2 — Q/Qvoll ≈ 0.5 (klassische Teilfüllungskurve)
    const h = partialSection('CIRCULAR', 1, 0, 0.5);
    ok(near(h.A, Math.PI / 8, 1e-6) && near(h.P, Math.PI / 2, 1e-6), 'Kreis halb: A=π/8, P=π/2');
    ok(near(flowRatio('CIRCULAR', 1, 1, 0.5), 0.5, 0.02), `Q/Qvoll(y/D=0.5) ≈ 0.5 (ist ${flowRatio('CIRCULAR', 1, 1, 0.5).toFixed(3)})`);
    // Inversion: fillDepthRatio ist Umkehrung von flowRatio
    for (const fr of [0.1, 0.3, 0.5, 0.8]) {
        const y = fillDepthRatio('CIRCULAR', fr);
        ok(near(flowRatio('CIRCULAR', 1, 1, y), fr, 1e-4), `Inversion Kreis f=${fr} → y/D=${y.toFixed(3)}`);
    }
    // Rechteck 1x1: A=W·y monoton bis 1
    ok(fillDepthRatio('RECT', 1.0) > 0.99, 'Rechteck f=1 → Vollfüllung');
    // Manning-Referenz: Kreis D=1, kSt=80 (n=0.0125), S=1‰ → Q_voll ≈ 0.79 m³/s
    const Q = manningQfull('CIRCULAR', 1, 0, 0.0125, 0.001);
    ok(near(Q, 0.79, 0.03), `Q_voll(D=1, n=0.0125, S=1‰) ≈ 0.79 m³/s (ist ${Q.toFixed(3)})`);
}

// Testnetz: MH1 →(C1, DN500)→ MH2 →(C2, DN800)→ OUT, Gefälle je 5‰ über 100 m
function makeModel({ outfallAttrs = {}, mh1Attrs = {} } = {}) {
    const m = new NetworkModel();
    m.addNode({ id: 'MH1', x: 0, y: 0, invert: 10.0, rim: 12.0, role: 'manhole', attrs: mh1Attrs });
    m.addNode({ id: 'MH2', x: 100, y: 0, invert: 9.5, rim: 11.5, role: 'manhole' });
    m.addNode({ id: 'OUT', x: 200, y: 0, invert: 9.0, rim: 10.0, role: 'outfall', attrs: outfallAttrs });
    m.addLink({ id: 'C1', fromNodeId: 'MH1', toNodeId: 'MH2', length: 100, profile: { shape: 'circular', height: 0.5 }, attrs: { kSt: 80 } });
    m.addLink({ id: 'C2', fromNodeId: 'MH2', toNodeId: 'OUT', length: 100, profile: { shape: 'circular', height: 0.8 }, attrs: { kSt: 80 } });
    return m;
}
const buildInp = (model, opts = {}) => new SwmmBuilder(model.toSwmmStore()).setOptions({ coupled: true, ...opts }).build();

console.log('2) Vorfüllfaktor → DWF + InitDepth + InitFlow');
{
    const { inpContent, warnings } = buildInp(makeModel(), { prefillFraction: 0.3 });
    ok(/\[DWF\]/.test(inpContent), '[DWF]-Sektion vorhanden');
    // MH1 speist C1 (f·Qvoll), MH2 nur die Differenz (C2 größer als C1)
    const dwfMh1 = inpContent.match(/MH1\s+FLOW\s+([\d.]+)/);
    const dwfMh2 = inpContent.match(/MH2\s+FLOW\s+([\d.]+)/);
    ok(!!dwfMh1 && Number(dwfMh1[1]) > 0, `MH1 bekommt Basisabfluss (${dwfMh1?.[1]} m³/s)`);
    ok(!!dwfMh2 && Number(dwfMh2[1]) > 0, 'MH2 bekommt Differenz-Basisabfluss (C2 > C1)');
    // Bilanz: Zufluss MH1 = 0.3·Qvoll(C1); MH1+MH2 = 0.3·Qvoll(C2)
    const q1 = 0.3 * manningQfull('CIRCULAR', 0.5, 0, 1 / 80, 0.005);
    const q2 = 0.3 * manningQfull('CIRCULAR', 0.8, 0, 1 / 80, 0.005);
    ok(near(Number(dwfMh1[1]), q1, 0.001), `Bilanz MH1 = f·Qvoll(C1) (${q1.toFixed(4)})`);
    ok(near(Number(dwfMh1[1]) + Number(dwfMh2[1]), q2, 0.001), `Bilanz MH1+MH2 = f·Qvoll(C2) (${q2.toFixed(4)})`);
    // InitDepth an MH1 > 0 (Teilfüllung DN500), InitFlow in C1 > 0
    const j = inpContent.match(/MH1\s+10\.000\s+2\.000\s+([\d.]+)/);
    ok(!!j && Number(j[1]) > 0.05 && Number(j[1]) < 0.5, `MH1-InitDepth = Teilfüllung (${j?.[1]} m)`);
    const c1 = inpContent.match(/C1\s+MH1\s+MH2\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+([\d.]+)/);
    ok(!!c1 && near(Number(c1[1]), q1, 0.001), `C1-InitFlow = f·Qvoll (${c1?.[1]})`);
    ok(warnings.some(w => w.includes('Vorfüllung 30 %')), 'Warnung dokumentiert den automatischen Basisabfluss');
    // prefill=0 → keine DWF-Sektion, InitDepth 0
    const off = buildInp(makeModel(), { prefillFraction: 0 });
    ok(!/\[DWF\]/.test(off.inpContent), 'prefill=0 → kein [DWF]');
}

console.log('3) Knoten-Zufluss → [INFLOWS]/[TIMESERIES]');
{
    const m = makeModel({ mh1Attrs: { constantInflow: 30000 /* l/s = 30 m³/s */, inflowSeries: [{ t: 0, q: 0 }, { t: 90, q: 500 }] } });
    const { inpContent } = buildInp(m);
    ok(/\[INFLOWS\]/.test(inpContent), '[INFLOWS]-Sektion vorhanden');
    ok(/MH1\s+FLOW\s+TSIN_MH1\s+FLOW\s+1\.0\s+1\.0\s+30\.000000/.test(inpContent), 'Baseline 30 m³/s + Ganglinien-Referenz');
    ok(/TSIN_MH1\s+0:00\s+0\.000000/.test(inpContent) && /TSIN_MH1\s+1:30\s+0\.500000/.test(inpContent),
        '[TIMESERIES] TSIN_MH1: 0:00→0, 1:30→0.5 m³/s');
    ok(!/\[DWF\]/.test(inpContent), 'Direktzufluss landet NICHT im [DWF]');
    // nur konstant, keine Serie → TimeSeries-Spalte ""
    const m2 = makeModel({ mh1Attrs: { constantInflow: 250 } });
    ok(/MH1\s+FLOW\s+""\s+FLOW\s+1\.0\s+1\.0\s+0\.250000/.test(buildInp(m2).inpContent), 'konstant ohne Serie → Baseline 0.25 m³/s');
}

console.log('4) Outfall-Randbedingung');
{
    const fixed = buildInp(makeModel({ outfallAttrs: { outfallType: 'fixed', fixedStage: 9.8 } }));
    ok(/OUT\s+9\.000\s+FIXED\s+9\.800/.test(fixed.inpContent), 'FIXED mit Vorfluter-WSP 9.80 m');
    const normal = buildInp(makeModel({ outfallAttrs: { outfallType: 'normal' } }));
    ok(/OUT\s+9\.000\s+NORMAL/.test(normal.inpContent), 'NORMAL exportiert');
    const noStage = buildInp(makeModel({ outfallAttrs: { outfallType: 'fixed' } }));
    ok(/OUT\s+9\.000\s+FREE/.test(noStage.inpContent) && noStage.warnings.some(w => w.includes('FIXED ohne Wasserstand')),
        'FIXED ohne Stage → FREE + Warnung');
}

console.log('5) „verdeckelt" → aus der Kopplung genommen');
{
    // Mini-DEM 10x10 flach auf 11.0 (Knoten-rims drüber/drunter egal für den Skip-Test)
    const N = 10;
    const dem = { grid: Float32Array.from({ length: N * N }, () => 11.0), header: { ncols: N, nrows: N, xllcorner: -5, yllcorner: -5, cellsize: 25, NODATA_value: -9999 } };
    const open = detectCouplingNodes(makeModel(), dem);
    ok(open.couplingNodes.some(c => c.id === 'MH1'), 'Standard: MH1 koppelt');
    const sealed = detectCouplingNodes(makeModel({ mh1Attrs: { couple: false, inletType: 'sealed' } }), dem);
    ok(!sealed.couplingNodes.some(c => c.id === 'MH1'), 'couple=false: MH1 NICHT in flow.coupling');
    ok(sealed.couplingNodes.some(c => c.id === 'MH2'), 'andere Knoten koppeln weiter');
    // Amax/Cw aus den attrs landen im Kopplungsknoten (Panel-Presets)
    const amax = detectCouplingNodes(makeModel({ mh1Attrs: { Amax: 0.006, Cw: 0.8 } }), dem);
    const c = amax.couplingNodes.find(c => c.id === 'MH1');
    ok(c && near(c.Amax, 0.006, 1e-9) && near(c.Cw, 0.8, 1e-9), 'Amax=6 l/s + Cw=0.8 in flow.coupling durchgereicht');
}

console.log(fails === 0 ? '\n✅ NETZ-ZUFLUSS/VORFÜLLUNG BESTANDEN' : `\n❌ ${fails} Fehler`);
process.exit(fails === 0 ? 0 : 1);
