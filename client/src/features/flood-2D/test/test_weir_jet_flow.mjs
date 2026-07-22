// Tests: analytische Kontraktions-/Freistrahl-Überlagerung an Wehr-Durchlässen (weirJetFlow.js).
// Kernaussage: der Solver kennt keine Durchlass-Kontraktion — dieses Modul überlagert nur beim
// Rendern eine Anström-Beschleunigung/-Umlenkung + Freistrahl-Kegelaufweitung entlang der
// strukturell festen Bauwerksachse (direction 'S'/'E'), NICHT einer freien Ambient-Richtung.
// Ausführen: node src/features/flood-2D/test/test_weir_jet_flow.mjs   (aus client/)
import {
    buildJetGeometry,
    sampleAmbientForJets,
    applyJetFlow,
    JET_FLOW_DEFAULTS,
} from '../utils/weirJetFlow.js';

let failures = 0;
const assert = (cond, msg) => {
    if (cond) console.log(`  ✅ ${msg}`);
    else { console.error(`  ❌ ${msg}`); failures++; }
};

console.log('── buildJetGeometry: Achsen-Mapping direction→axisC/axisR ──');
{
    const h = { ncols: 20, nrows: 20, cellsize: 1, xllcorner: 0, yllcorner: 0 };
    const weirs = [
        { id: 'w_S', x: 10, y: 10, direction: 'S', orifice: { soffit: 2, width: 1, height: 1, type: 'round' } },
        { id: 'w_E', x: 10, y: 10, direction: 'E', orifice: { soffit: 2, width: 1, height: 1, type: 'round' } },
    ];
    const geoms = buildJetGeometry(weirs, h);
    assert(geoms.length === 2, `2 Durchlass-Geometrien erzeugt (${geoms.length})`);
    assert(geoms[0].axisC === 0 && geoms[0].axisR === 1, `'S' → Achse = Zeilen/vy (axisC=${geoms[0].axisC}, axisR=${geoms[0].axisR})`);
    assert(geoms[1].axisC === 1 && geoms[1].axisR === 0, `'E' → Achse = Spalten/vx (axisC=${geoms[1].axisC}, axisR=${geoms[1].axisR})`);
}

console.log('── buildJetGeometry: Grid-Konversion (bottom-up → top-down) ──');
{
    const h = { ncols: 20, nrows: 20, cellsize: 1, xllcorner: 0, yllcorner: 0 };
    const weirs = [{ id: 'w1', x: 12, y: 3, direction: 'S', orifice: { soffit: 2, width: 2, height: 1, type: 'round' } }];
    const [g] = buildJetGeometry(weirs, h);
    assert(g.c0 === 12, `c0 = (x-xll)/cs = 12 (${g.c0})`);
    assert(g.r0 === (20 - 1) - 3, `r0 = (nrows-1)-rowBottomUp = 16 (${g.r0})`);
}

console.log('── MIN_A_CELLS-Floor + accel-Clamp ──');
{
    const h = { ncols: 20, nrows: 20, cellsize: 1, xllcorner: 0, yllcorner: 0 };
    const narrow = buildJetGeometry([{ id: 'w_n', x: 10, y: 10, direction: 'S', orifice: { width: 0.01, soffit: 2, height: 1, type: 'round' } }], h)[0];
    assert(narrow.aCells === JET_FLOW_DEFAULTS.MIN_A_CELLS, `sehr schmaler Durchlass → aCells an MIN_A_CELLS geklemmt (${narrow.aCells})`);
    // Der MIN_A_CELLS-Floor bestimmt zugleich den impliziten Beschleunigungs-Deckel
    // (accel=1/(2·aCells) ist monoton fallend in aCells) — bei 0.2 also 1/(0.4)=2.5.
    const accelNarrow = Math.max(JET_FLOW_DEFAULTS.ACCEL_MULT_MIN, 1 / (2 * narrow.aCells));
    assert(Math.abs(accelNarrow - 1 / (2 * JET_FLOW_DEFAULTS.MIN_A_CELLS)) < 1e-9,
        `resultierende Beschleunigung am impliziten Floor-Deckel (${accelNarrow})`);

    const wide = buildJetGeometry([{ id: 'w_w', x: 10, y: 10, direction: 'S', orifice: { width: 20, soffit: 2, height: 1, type: 'round' } }], h)[0];
    const accelWide = Math.max(JET_FLOW_DEFAULTS.ACCEL_MULT_MIN, 1 / (2 * wide.aCells));
    assert(accelWide === JET_FLOW_DEFAULTS.ACCEL_MULT_MIN, `breiter Durchlass → keine Verlangsamung, Deckel bei ACCEL_MULT_MIN=1 (${accelWide})`);
}

// Isolierte Formel-Tests: synthetischer Durchlass bei (c0=10,r0=10), Achse = Zeilen (axisR=1),
// Ambient strömt in +r-Richtung (sign=1) — Anströmung liegt bei r<10, Strahl bei r>10.
const g = { c0: 10, r0: 10, aCells: 0.3, axisC: 0, axisR: 1,
    convLen: 0.3 * JET_FLOW_DEFAULTS.CONVERGENCE_LEN_MULT, jetLen: 0.3 * JET_FLOW_DEFAULTS.JET_LEN_MULT };
const amb = [{ sign: 1, speed: 1 }];
// raw = Ambient-Richtung (0,1)*1 — isoliert die reine Jet-Abweichung, wie im Pfeiler-Test.
const RAW_VX = 0, RAW_VY = 1;

console.log('── Anströmzone: monotone Beschleunigung + laterale Umlenkung zur Achse ──');
{
    const speedAt = (r) => { const d = applyJetFlow(g.c0, r, RAW_VX, RAW_VY, [g], amb); return Math.hypot(d.vx, d.vy); };
    const s08 = speedAt(g.r0 - 0.8), s05 = speedAt(g.r0 - 0.5), s02 = speedAt(g.r0 - 0.2);
    assert(s02 > s05 && s05 > s08, `Geschwindigkeit steigt monoton Richtung Öffnung (${s08.toFixed(3)} < ${s05.toFixed(3)} < ${s02.toFixed(3)})`);

    const onAxis = applyJetFlow(g.c0, g.r0 - 0.3, RAW_VX, RAW_VY, [g], amb);
    assert(onAxis.vx === RAW_VX, `auf der Achse (cross=0) keine laterale Umlenkung (vx=${onAxis.vx})`);

    const offAxisEast = applyJetFlow(g.c0 + 0.3, g.r0 - 0.3, RAW_VX, RAW_VY, [g], amb);
    assert(offAxisEast.vx < RAW_VX, `östlich der Achse: vx wird negativ (Zug zur Mittelachse), vx=${offAxisEast.vx.toFixed(4)}`);
}

console.log('── Freistrahlzone: Zentrallinien-Abklingen + Kegelaufweitung ──');
{
    const centerNear = applyJetFlow(g.c0, g.r0 + 0.05, RAW_VX, RAW_VY, [g], amb);
    const centerFar = applyJetFlow(g.c0, g.r0 + g.jetLen * 0.9, RAW_VX, RAW_VY, [g], amb);
    const sNear = Math.hypot(centerNear.vx, centerNear.vy), sFar = Math.hypot(centerFar.vx, centerFar.vy);
    assert(sNear > sFar, `Zentrallinie klingt mit der Distanz ab (nah=${sNear.toFixed(3)} > fern=${sFar.toFixed(3)})`);

    // Kegelbreite wächst mit der Distanz: derselbe Queranteil ist nah außerhalb, fern innerhalb des Kegels.
    const crossPt = 0.35; // > aCells(0.3) am Mund, aber < halfWidthAt(along=1.5)
    const nearCone = applyJetFlow(g.c0 + crossPt, g.r0 + 0.01, RAW_VX, RAW_VY, [g], amb);
    const farCone = applyJetFlow(g.c0 + crossPt, g.r0 + 1.5, RAW_VX, RAW_VY, [g], amb);
    assert(nearCone.vx === RAW_VX && nearCone.vy === RAW_VY, 'knapp hinter dem Mund: Punkt außerhalb des (noch schmalen) Kegels unverändert');
    assert(!(farCone.vx === RAW_VX && farCone.vy === RAW_VY), 'weiter stromab: derselbe Queranteil liegt jetzt im (aufgeweiteten) Kegel');
}

console.log('── Glatte Naht bei along=0 ──');
{
    const eps = 1e-4;
    const justBefore = applyJetFlow(g.c0, g.r0 - eps, RAW_VX, RAW_VY, [g], amb);
    const justAfter = applyJetFlow(g.c0, g.r0 + eps, RAW_VX, RAW_VY, [g], amb);
    const sBefore = Math.hypot(justBefore.vx, justBefore.vy), sAfter = Math.hypot(justAfter.vx, justAfter.vy);
    assert(Math.abs(sBefore - sAfter) < 1e-3, `Anström-/Freistrahlzone treffen sich nahtlos bei along=0 (${sBefore.toFixed(5)} ≈ ${sAfter.toFixed(5)})`);
}

console.log('── Zero-Jet-Fastpath ──');
{
    const noop = applyJetFlow(5, 5, 3, -2, [], []);
    assert(noop.vx === 3 && noop.vy === -2, 'ohne Durchlässe: No-op, Rohwert unverändert');
}

console.log('── sampleAmbientForJets: nur Achsenprojektion, Queranteil ignoriert ──');
{
    const ncols = 20, nrows = 20;
    const gg = { c0: 10, r0: 10, axisC: 0, axisR: 1, ambUp: { c: 10, r: 5 }, ambDn: { c: 10, r: 15 } };

    // vx=5 (starker Queranteil) + vy=3 (Achsenanteil) überall — nur vy darf in speed=3 landen.
    const vxArr = new Float32Array(ncols * nrows).fill(5);
    const vyArr = new Float32Array(ncols * nrows).fill(3);
    const amb1 = sampleAmbientForJets([gg], vxArr, vyArr, ncols, nrows, null);
    assert(amb1[0] !== null && amb1[0].sign === 1 && Math.abs(amb1[0].speed - 3) < 1e-6,
        `Queranteil (vx=5) ignoriert, nur Achsenbetrag übernommen: speed=${amb1[0].speed.toFixed(3)}`);

    const vyRev = new Float32Array(ncols * nrows).fill(-3);
    const amb2 = sampleAmbientForJets([gg], vxArr, vyRev, ncols, nrows, null);
    assert(amb2[0] !== null && amb2[0].sign === -1 && Math.abs(amb2[0].speed - 3) < 1e-6,
        `umgekehrte Fließrichtung → sign=-1, Betrag weiterhin korrekt (speed=${amb2[0].speed.toFixed(3)})`);

    const mask = new Uint8Array(ncols * nrows).fill(255);
    mask[5 * ncols + 10] = 0; // Ambient-Punkt stromauf maskiert
    const amb3 = sampleAmbientForJets([gg], vxArr, vyArr, ncols, nrows, mask);
    assert(amb3[0] !== null && Math.abs(amb3[0].speed - 3) < 1e-6, `stromauf maskiert → Fallback auf stromab-Punkt liefert weiterhin speed=3 (${amb3[0].speed.toFixed(3)})`);

    const maskAll = new Uint8Array(ncols * nrows).fill(0);
    const amb4 = sampleAmbientForJets([gg], vxArr, vyArr, ncols, nrows, maskAll);
    assert(amb4[0] === null, 'beide Ambient-Punkte maskiert → kein Ambient (null)');
}

console.log('── buildJetGeometry-Filter: nur orifice!=null-Zellen erzeugen Geometrie ──');
{
    const h = { ncols: 20, nrows: 20, cellsize: 1, xllcorner: 0, yllcorner: 0 };
    const weirs = [
        { id: 'crest1', x: 5, y: 5, direction: 'S', orifice: null },
        { id: 'open1', x: 6, y: 5, direction: 'S', orifice: { soffit: 2, width: 1, height: 1, type: 'round' } },
        { id: 'crest2', x: 7, y: 5, direction: 'S', orifice: null },
        { id: 'open2', x: 8, y: 5, direction: 'E', orifice: { soffit: 2, width: 1.5, height: 1, type: 'rect' } },
    ];
    const geoms = buildJetGeometry(weirs, h);
    assert(geoms.length === 2, `nur die 2 orifice-Zellen erzeugen Geometrie (${geoms.length})`);
}

console.log(failures === 0 ? '\n✅ Alle Durchlass-Jet-Tests bestanden.' : `\n❌ ${failures} Test(s) fehlgeschlagen.`);
process.exit(failures === 0 ? 0 : 1);
