// Smoke test: verify Sprint 2 modules load & their pure-JS APIs work as expected.

// Minimal in-memory localStorage polyfill so storage-backed modules (RepoFacade)
// can be smoke-tested in Node. Real browser env is unaffected.
if (typeof globalThis.localStorage === 'undefined') {
  const _store = new Map();
  globalThis.localStorage = {
    get length() { return _store.size; },
    key(i) { return [..._store.keys()][i] ?? null; },
    getItem(k) { return _store.has(k) ? _store.get(k) : null; },
    setItem(k, v) { _store.set(String(k), String(v)); },
    removeItem(k) { _store.delete(k); },
    clear() { _store.clear(); },
  };
}

import * as VectorStyleEngine from './src/features/ifc-viewer/services/VectorStyleEngine.js';
import * as DefaultLineStyles from './src/features/ifc-viewer/services/DefaultLineStyles.js';
import * as VectorRuleEngine  from './src/features/ifc-viewer/services/VectorRuleEngine.js';
import * as VectorStylePresets from './src/features/ifc-viewer/services/VectorStylePresets.js';
import * as PolygonSimplify   from './src/features/ifc-viewer/services/PolygonSimplify.js';
import * as LabelTemplate     from './src/features/ifc-viewer/services/LabelTemplate.js';
import { RepoFacade }         from './src/features/ifc-viewer/services/RepoFacade.js';
import { DIN277_CLASSES, classifyDin277 } from './src/features/ifc-viewer/services/Din277Classifier.js';
import { KG_TREE, KG_LOOKUP, KG_DEFAULT_RULES, kgColor, kgTitle } from './src/features/ifc-viewer/services/Din276Defaults.js';
import { classifyKg } from './src/features/ifc-viewer/services/KgClassifier.js';
import { findMatchingRule, resolveRuleField } from './src/features/ifc-viewer/services/VectorRuleEngine.js';
import { summarizeQuantities, PIECE_BILLED_CATEGORIES, VOLUME_BILLED_CATEGORIES } from './src/features/ifc-viewer/services/QuantitySummary.js';

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

// ── LabelTemplate: multi-line via `;` ──────────────────────────────────────
const lblCtx = { category: 'IFCWALL', localId: 1,
                 attributes: { Name: 'W1' },
                 psets: { P: { D: '2.5', S: '0.3' } } };
eq('single line returns string',  LabelTemplate.renderLabelTemplate('{Name}', lblCtx),       'W1');
eq('three lines returns array',   LabelTemplate.renderLabelTemplate('{Name}; {P.D}; {P.S}', lblCtx), ['W1', '2.5', '0.3']);
eq('trailing ; is dropped',       LabelTemplate.renderLabelTemplate('{Name};', lblCtx),      'W1');
eq('empty middle ;; is dropped',  LabelTemplate.renderLabelTemplate('{Name};;{P.D}', lblCtx), ['W1', '2.5']);
eq('all-empty returns null',      LabelTemplate.renderLabelTemplate('{nope}; {also_nope}', lblCtx), null);
eq('literal text preserved',      LabelTemplate.renderLabelTemplate('Schacht; Höhe', lblCtx), ['Schacht', 'Höhe']);

// ── RepoFacade: persistence indirection ───────────────────────────────────
await (async () => {
  const r = new RepoFacade('test-scope');
  await r.clear();
  ok('repo.get returns null when absent',           (await r.get('foo')) === null);
  await r.set('foo', { a: 1, b: [2, 3] });
  eq('repo.get returns the stored value',           await r.get('foo'), { a: 1, b: [2, 3] });

  await r.set('bar', 'hello');
  await r.set('baz', 42);
  const keys = await r.list();
  ok('repo.list returns scoped keys',               keys.sort().join(',') === 'bar,baz,foo');

  const sub = await r.list('b');
  ok('repo.list with sub-prefix filters',           sub.sort().join(',') === 'bar,baz');

  await r.delete('bar');
  ok('repo.delete removes the key',                 (await r.get('bar')) === null);

  // Two different scopes must be isolated
  const r2 = new RepoFacade('other-scope');
  await r2.set('foo', 'isolated');
  ok('repo scopes are isolated',                    (await r2.get('foo')) === 'isolated' && (await r.get('foo')).a === 1);

  const cleared = await r.clear();
  ok('repo.clear removes everything in scope',      cleared === 2 && (await r.list()).length === 0);
  ok('repo.clear leaves other scopes alone',        (await r2.get('foo')) === 'isolated');
  await r2.clear();
})();

// ── Din277Classifier: structural + heuristic sanity ──────────────────────
ok('DIN277_CLASSES has all 9 classes',           Object.keys(DIN277_CLASSES).length === 9);
ok('NUF7 is "sonstige Nutzungsflächen"',         /sonstig/i.test(DIN277_CLASSES.NUF7.label));
ok('VF label is "Verkehrsflächen"',              /verkehr/i.test(DIN277_CLASSES.VF.label));

// Empty-input safety
const emptyResult = await classifyDin277();
ok('empty input → empty spaces',                 Array.isArray(emptyResult.spaces) && emptyResult.spaces.length === 0);
ok('empty input → totals exists with zero BGF',  emptyResult.totals.BGF === 0 && emptyResult.totals.NGF === 0);

// IFCSPACE-group not present → still safe
const noSpace = await classifyDin277({ categoryGroups: [{ name: 'IFCWALL', groupData: { get: async () => ({}) } }], fragmentsList: new Map(), fragmentsManager: {} });
ok('no IFCSPACE group → empty result',           noSpace.spaces.length === 0 && noSpace.totals.BGF === 0);

// Override mechanism: User override should win
const dummyGroup = {
  name: 'IFCSPACE',
  groupData: { get: async () => ({ 'm1': [101, 102] }) },
};
const dummyFragments = new Map([['m1', {
  getBoxes: async () => [
    { isEmpty: () => false, min: { x: 0, y: 0, z: 0 }, max: { x: 5, y: 3, z: 4 } }, // 20 m²
    { isEmpty: () => false, min: { x: 0, y: 0, z: 0 }, max: { x: 3, y: 3, z: 3 } }, //  9 m²
  ],
}]]);
const dummyManager = {
  getData: async () => ({
    'm1': [
      { _localId: 101, GlobalId: { value: 'GUID-A' }, Name: { value: 'Wohnzimmer' }, LongName: { value: '' }, IsDefinedBy: [] },
      { _localId: 102, GlobalId: { value: 'GUID-B' }, Name: { value: 'Flur EG' }, LongName: { value: '' }, IsDefinedBy: [] },
    ],
  }),
};
const dummyTree = {
  category: 'IFCSITE', localId: 1,
  children: [{ category: 'IFCBUILDINGSTOREY', localId: 50, children: [
    { category: 'IFCSPACE', localId: 101, children: [] },
    { category: 'IFCSPACE', localId: 102, children: [] },
  ]}],
};
const result = await classifyDin277({
  categoryGroups: [dummyGroup],
  fragmentsList: dummyFragments,
  fragmentsManager: dummyManager,
  spatialTree: dummyTree,
});
ok('two spaces extracted',                       result.spaces.length === 2);
ok('Wohnzimmer → NUF1 via heuristic',            result.spaces.find(s => s.name === 'Wohnzimmer')?.classCode === 'NUF1');
ok('Flur EG → VF via heuristic',                 result.spaces.find(s => s.name === 'Flur EG')?.classCode === 'VF');
ok('bbox area used as fallback (≈ 20 + 9)',      Math.abs(result.totals.BGF - 29) < 0.001);
ok('NGF = NUF + VF + TF = 29 m²',                Math.abs(result.totals.NGF - 29) < 0.001);
ok('storey aggregation populated',               result.byStorey.get(50)?.BGF === 29);

// Override mechanism
const result2 = await classifyDin277({
  categoryGroups: [dummyGroup],
  fragmentsList: dummyFragments,
  fragmentsManager: dummyManager,
  spatialTree: dummyTree,
  overrides: new Map([['GUID-A', 'NUF2']]), // force Wohnzimmer → Büro
});
ok('override wins over heuristic',               result2.spaces.find(s => s.globalId === 'GUID-A')?.classCode === 'NUF2');
ok('override is flagged as source',              result2.spaces.find(s => s.globalId === 'GUID-A')?.source === 'override');

// ── VectorRuleEngine: generalised matcher ────────────────────────────────
const styleRules = [
  { enabled: true, priority: 10, condition: { category: 'IFCWALL' },
    style: { color: '#000' }, kgCode: '340' },
  { enabled: true, priority: 20, condition: { category: 'IFCWALL', psetName: 'Pset_WallCommon', propertyName: 'IsExternal', operator: 'equals', value: 'true' },
    style: { color: '#222' }, kgCode: '330' },
];
const ctxExt = { category: 'IFCWALL', attributes: {}, psets: { Pset_WallCommon: { IsExternal: 'true' } } };
const ctxInt = { category: 'IFCWALL', attributes: {}, psets: { Pset_WallCommon: { IsExternal: 'false' } } };
ok('findMatchingRule returns highest-priority match',  findMatchingRule(styleRules, ctxExt)?.kgCode === '330');
ok('findMatchingRule falls through to lower priority', findMatchingRule(styleRules, ctxInt)?.kgCode === '340');
ok('resolveRuleField extracts any output slot',        resolveRuleField(styleRules, ctxExt, 'kgCode') === '330');
ok('resolveRuleField returns undefined when no match', resolveRuleField(styleRules, { category: 'IFCSLAB', attributes:{}, psets:{} }, 'kgCode') === undefined);

// ── Din276Defaults: tree structure + helpers ─────────────────────────────
ok('KG_TREE has 300 and 400 groups',          KG_TREE.length === 2 && KG_TREE[0].code === '300' && KG_TREE[1].code === '400');
ok('KG_LOOKUP knows 330',                     KG_LOOKUP.get('330')?.label.includes('Außenwände'));
ok('KG_LOOKUP gives parent code',             KG_LOOKUP.get('331')?.parentCode === '330');
ok('kgColor walks up to parent',              kgColor('331') === kgColor('330'));
ok('kgColor falls back to grey for unknown',  kgColor('999') === '#888');
ok('kgTitle formats nicely',                  /^330 — Außenwände/.test(kgTitle('330')));
ok('KG_DEFAULT_RULES has plausible count',    KG_DEFAULT_RULES.length >= 20);
ok('default external-wall rule sets kgCode 330',
   KG_DEFAULT_RULES.find(r => r.id === 'kg-wall-external')?.kgCode === '330');

// ── KgClassifier: mapping with mocked engine accessors ───────────────────
const kgRules = [...KG_DEFAULT_RULES];
const kgCategoryGroups = [
  { name: 'IFCWALL', groupData: { get: async () => ({ 'm1': [10, 11] }) } },
  { name: 'IFCSLAB', groupData: { get: async () => ({ 'm1': [20] }) } },
  { name: 'IFCPIPESEGMENT', groupData: { get: async () => ({ 'm1': [30, 31, 32] }) } },
];
const mkBox = (sx, sy, sz) => ({
  isEmpty: () => false,
  min: { x: 0, y: 0, z: 0 }, max: { x: sx, y: sy, z: sz },
  getSize(v) { v.x = sx; v.y = sy; v.z = sz; return v; },
});
const kgFragmentsList = new Map([['m1', {
  getBoxes: async (ids) => ids.map(id => mkBox(2, 2, 0.3)),
}]]);
const kgFragmentsManager = {
  getData: async (req) => ({
    'm1': [
      { _localId: 10, GlobalId: { value: 'WALL-EXT' }, Name: { value: 'Aussenwand' },
        IsDefinedBy: [{ Name: { value: 'Pset_WallCommon' }, HasProperties: [
          { Name: { value: 'IsExternal' }, NominalValue: { value: 'true' } }] }] },
      { _localId: 11, GlobalId: { value: 'WALL-INT' }, Name: { value: 'Innenwand' },
        IsDefinedBy: [{ Name: { value: 'Pset_WallCommon' }, HasProperties: [
          { Name: { value: 'IsExternal' }, NominalValue: { value: 'false' } }] }] },
      { _localId: 20, GlobalId: { value: 'SLAB-1' }, Name: { value: 'Decke' },
        IsDefinedBy: [] },
      { _localId: 30, GlobalId: { value: 'PIPE-1' }, IsDefinedBy: [] },
      { _localId: 31, GlobalId: { value: 'PIPE-2' }, IsDefinedBy: [] },
      { _localId: 32, GlobalId: { value: 'PIPE-3' }, IsDefinedBy: [] },
    ],
  }),
};

const kgResult = await classifyKg({
  categoryGroups: kgCategoryGroups,
  fragmentsList: kgFragmentsList,
  fragmentsManager: kgFragmentsManager,
  rules: kgRules,
});
ok('IFCWALL+external is mapped to KG 330',     kgResult.byKg.get('330')?.count === 1);
ok('IFCWALL+internal is mapped to KG 340',     kgResult.byKg.get('340')?.count === 1);
ok('IFCSLAB is mapped to KG 350',              kgResult.byKg.get('350')?.count === 1);
ok('IFCPIPESEGMENT is mapped to KG 411 (3×)',  kgResult.byKg.get('411')?.count === 3);
ok('perElement reverse lookup works',          kgResult.perElement.get('m1|10') === '330');
ok('volume_m3 is summed per KG',               Math.abs((kgResult.byKg.get('330')?.volume_m3 ?? 0) - (2 * 2 * 0.3)) < 0.001);

// Override
const kgResult2 = await classifyKg({
  categoryGroups: kgCategoryGroups,
  fragmentsList: kgFragmentsList,
  fragmentsManager: kgFragmentsManager,
  rules: kgRules,
  overrides: new Map([['WALL-EXT', '370']]), // force outer wall → KG 370 Einbauten
});
ok('override moves element across KG buckets', kgResult2.byKg.get('370')?.count === 1 && (kgResult2.byKg.get('330')?.count ?? 0) === 0);

// ── QuantitySummary: per-category aggregation ────────────────────────────
ok('PIECE_BILLED_CATEGORIES has IFCDOOR',  PIECE_BILLED_CATEGORIES.has('IFCDOOR'));
ok('PIECE_BILLED_CATEGORIES has Schächte', PIECE_BILLED_CATEGORIES.has('IFCDISTRIBUTIONCHAMBERELEMENT'));
ok('VOLUME_BILLED_CATEGORIES has IFCWALL', VOLUME_BILLED_CATEGORIES.has('IFCWALL'));
ok('VOLUME_BILLED_CATEGORIES has IFCSLAB', VOLUME_BILLED_CATEGORIES.has('IFCSLAB'));

// Empty input safety
const qEmpty = await summarizeQuantities();
ok('summarizeQuantities() with no args → empty Map', qEmpty.byCategory.size === 0 && qEmpty.totals.count === 0);

// Use the same mock data as KG test
const qSummary = await summarizeQuantities({
  categoryGroups: kgCategoryGroups,
  fragmentsList: kgFragmentsList,
});
ok('summarizeQuantities returns category map',     qSummary.byCategory.size === 3);
ok('summarizeQuantities IFCWALL count = 2',        qSummary.byCategory.get('IFCWALL')?.count === 2);
ok('summarizeQuantities IFCPIPESEGMENT count = 3', qSummary.byCategory.get('IFCPIPESEGMENT')?.count === 3);
ok('summarizeQuantities totals count = 6',         qSummary.totals.count === 6);
ok('summarizeQuantities BBox volume = 2×2×0.3 per element',
   Math.abs(qSummary.byCategory.get('IFCWALL')?.volume_m3 - 2 * 1.2) < 0.001); // 2 walls × 1.2 m³
ok('summarizeQuantities avgVolume_m3 = 1.2 for IFCWALL',
   Math.abs(qSummary.byCategory.get('IFCWALL')?.avgVolume_m3 - 1.2) < 0.001);

// With KG annotation: byKg should be populated per category
const qWithKg = await summarizeQuantities({
  categoryGroups: kgCategoryGroups,
  fragmentsList: kgFragmentsList,
  perElementKg: kgResult.perElement,
});
const wallByKg = qWithKg.byCategory.get('IFCWALL')?.byKg;
ok('byKg map populated when perElementKg provided', wallByKg instanceof Map && wallByKg.size === 2);
ok('wall split between KG 330 and 340',             wallByKg.get('330')?.count === 1 && wallByKg.get('340')?.count === 1);

console.log(`\n--- ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
