// Smoke test: verify Sprint 2 modules load & their pure-JS APIs work as expected.
import * as VectorStyleEngine from './src/features/ifc-viewer/services/VectorStyleEngine.js';
import * as DefaultLineStyles from './src/features/ifc-viewer/services/DefaultLineStyles.js';
import * as VectorRuleEngine  from './src/features/ifc-viewer/services/VectorRuleEngine.js';
import * as VectorStylePresets from './src/features/ifc-viewer/services/VectorStylePresets.js';
import * as PolygonSimplify   from './src/features/ifc-viewer/services/PolygonSimplify.js';

let passed = 0, failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`);
  ok ? passed++ : failed++;
}
function ok(name, cond, info) {
  console.log(`${cond ? '✓' : '✗'} ${name}${cond ? '' : '  ' + (info ?? '')}`);
  cond ? passed++ : failed++;
}

// ── DefaultLineStyles ───────────────────────────────────────────────────────
ok('DEFAULT_LINE_STYLES has IFCWALL',     !!DefaultLineStyles.DEFAULT_LINE_STYLES.IFCWALL);
ok('cloneDefaults is deep',                DefaultLineStyles.cloneDefaults().IFCWALL !== DefaultLineStyles.DEFAULT_LINE_STYLES.IFCWALL);
ok('DASH_PATTERNS has phantom',            Array.isArray(DefaultLineStyles.DASH_PATTERNS.phantom));

// ── VectorStyleEngine ──────────────────────────────────────────────────────
const resolver = VectorStyleEngine.makeStyleResolver({
  IFCWALL: { color: '#ff0000', lineWidth: 0.5, lineDash: 'dashed', hatchPattern: 'none' },
});
eq('resolver returns wall',                resolver('IFCWALL').color, '#ff0000');
ok('resolver falls back to defaults',      resolver('IFCROOF').color === DefaultLineStyles.DEFAULT_LINE_STYLES.IFCROOF.color);

const legacy = VectorStyleEngine.styleToLegacy({ color: '#10c800', lineWidth: 0.3, lineDash: 'dashed', hatchPattern: 'steel' });
eq('styleToLegacy color r',                legacy.r, 16);
eq('styleToLegacy color g',                legacy.g, 200);
eq('styleToLegacy color b',                legacy.b, 0);
eq('styleToLegacy w',                      legacy.w, 0.3);
ok('styleToLegacy dash bool',              legacy.dash === true);
ok('styleToLegacy dashPattern array',      Array.isArray(legacy.dashPattern) && legacy.dashPattern.length > 0);
ok('styleToLegacy hatch',                  legacy.hatch === 'steel');
ok('styleToLegacy enabled true',           legacy.enabled === true);

// ── VectorRuleEngine ───────────────────────────────────────────────────────
const rules = [
  { id: 'r1', enabled: true, priority: 10,
    condition: { category: 'IFCWALL', psetName: 'Pset_WallCommon', propertyName: 'IsExternal', operator: 'equals', value: 'true' },
    style: { color: '#000000', lineWidth: 0.5 } },
  { id: 'r2', enabled: true, priority: 20,
    condition: { category: 'IFCWALL', psetName: 'Pset_WallCommon', propertyName: 'IsExternal', operator: 'equals', value: 'true' },
    style: { color: '#ff0000', lineWidth: 0.8 } },
  { id: 'r3', enabled: false, priority: 50,
    condition: { category: 'IFCWALL' },
    style: { color: '#00ff00' } },
  { id: 'r4', enabled: true, priority: 5,
    condition: { category: 'IFCWALL' },
    style: { color: '#888888' } },
];

const externalCtx = { category: 'IFCWALL', attributes: {}, psets: { Pset_WallCommon: { IsExternal: 'true' } } };
const internalCtx = { category: 'IFCWALL', attributes: {}, psets: { Pset_WallCommon: { IsExternal: 'false' } } };
const otherCtx    = { category: 'IFCSLAB', attributes: {}, psets: {} };

const winnerExternal = VectorRuleEngine.resolveRuleStyle(rules, externalCtx);
ok('priority wins on external',            winnerExternal?.color === '#ff0000');

const winnerInternal = VectorRuleEngine.resolveRuleStyle(rules, internalCtx);
ok('category-only rule applies to internal', winnerInternal?.color === '#888888');

const winnerOther = VectorRuleEngine.resolveRuleStyle(rules, otherCtx);
ok('no match for IFCSLAB',                 winnerOther === null);

ok('rulesNeedElementData=true when pset',  VectorRuleEngine.rulesNeedElementData(rules) === true);
ok('rulesNeedElementData=false when none', VectorRuleEngine.rulesNeedElementData([
  { enabled: true, condition: { category: 'IFCWALL' } }]) === false);

const wallRules = VectorRuleEngine.rulesForCategory(rules, 'IFCWALL');
ok('rulesForCategory excludes disabled',   wallRules.every(r => r.enabled !== false));
ok('rulesForCategory includes all-cat',    wallRules.some(r => !r.condition?.category));

// ── VectorStylePresets ─────────────────────────────────────────────────────
ok('built-in presets are 3',               VectorStylePresets.BUILT_IN_PRESETS.length === 3);
ok('DIN preset is builtin',                VectorStylePresets.BUILT_IN_PRESETS[0].builtin === true);
ok('Sewer preset has pipes',               !!VectorStylePresets.BUILT_IN_PRESETS[1].styles.IFCPIPESEGMENT);

// ── PolygonSimplify ────────────────────────────────────────────────────────
const ringStraight = [[0,0],[5,0],[5.001,0.0001],[10,0],[10,5],[0,5],[0,0]]; // a tiny zigzag in the middle
const simpl = PolygonSimplify.simplifyRing(ringStraight, 0.01);
ok('simplify removes near-collinear vertex', simpl.length < ringStraight.length);
ok('simplify keeps closed ring',            JSON.stringify(simpl[0]) === JSON.stringify(simpl[simpl.length - 1]));

const tinyRing = [[0,0],[0.1,0],[0,0.1],[0,0]];
const tinyOk = PolygonSimplify.simplifyRing(tinyRing, 1);
ok('simplify refuses to flatten tiny ring', tinyOk.length === tinyRing.length);

console.log(`\n--- ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
