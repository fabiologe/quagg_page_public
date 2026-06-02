/**
 * Vector Rule Engine — generic condition matcher with multiple output slots.
 *
 * Originally built for vector-style overrides (rule.style); now also drives
 * DIN 276 KG-classification (rule.kgCode) and could be extended to LV-bindings
 * (rule.lvBinding) or material/LCA mappings (rule.lcaMaterial). Same matching
 * machinery, different output fields — one rule may carry several.
 *
 * Rule shape:
 *   {
 *     id:        'rule-<uuid>',
 *     name:      'Außenwände dick',
 *     enabled:   true,
 *     priority:  10,                      // higher wins
 *     condition: {
 *       category:     'IFCWALL' | null,  // matches all if null
 *       psetName:     'Pset_WallCommon',  // optional
 *       propertyName: 'IsExternal',       // optional
 *       operator:     'equals' | 'notEquals' | 'contains' | 'gt' | 'lt' | 'exists',
 *       value:        'true',             // compared as string (case-insensitive)
 *     },
 *     // Output slots — any combination, all are optional
 *     style?:      { color, lineWidth, lineDash, hatchPattern, labelTemplate, … },
 *     kgCode?:     '330',
 *     lvBinding?:  { position, factor, unit },   // future
 *     lcaMaterial?: 'concrete-c30',              // future
 *   }
 *
 * The engine has zero IFC dependency — pure logic. The caller supplies the
 * element context: { category, attributes, psets }.
 */

/**
 * Return the highest-priority rule that matches the context, or null. The
 * caller picks which output slot (style, kgCode, …) is relevant.
 */
export function findMatchingRule(rules, ctx) {
    if (!Array.isArray(rules) || !rules.length || !ctx) return null;
    let bestRule = null;
    let bestPriority = -Infinity;
    for (const rule of rules) {
        if (!rule || rule.enabled === false) continue;
        if (!_matches(rule.condition, ctx)) continue;
        const p = rule.priority ?? 0;
        if (p > bestPriority) {
            bestPriority = p;
            bestRule = rule;
        }
    }
    return bestRule;
}

/**
 * Generic accessor: highest-priority match's value at `field`, or undefined.
 * Wraps findMatchingRule for callers that want a single output type.
 */
export function resolveRuleField(rules, ctx, field) {
    return findMatchingRule(rules, ctx)?.[field];
}

/**
 * Evaluate all rules against a single element context. Returns the style
 * override from the highest-priority matching rule, or null if none match.
 *
 * Kept as a back-compat helper for the vector plot pipeline.
 */
export function resolveRuleStyle(rules, ctx) {
    return findMatchingRule(rules, ctx)?.style ?? null;
}

/**
 * Quick predicate: do any rules in the list depend on Pset or attribute reads?
 * The exporter uses this to skip expensive fragments.getData() calls when not needed.
 */
export function rulesNeedElementData(rules) {
    return Array.isArray(rules) && rules.some(r =>
        r?.enabled !== false && (r?.condition?.psetName || r?.condition?.propertyName)
    );
}

/**
 * Filter rules down to those that target a given category (or all-categories rules).
 * Used to short-circuit evaluation for categories that no rule cares about.
 */
export function rulesForCategory(rules, category) {
    if (!Array.isArray(rules)) return [];
    return rules.filter(r => {
        if (!r || r.enabled === false) return false;
        const cat = r.condition?.category;
        return !cat || cat === category;
    });
}

// ── Condition matching ─────────────────────────────────────────────────────

function _matches(cond, ctx) {
    if (!cond) return false;
    if (cond.category && cond.category !== ctx.category) return false;

    // No pset/property check → category-only match
    if (!cond.psetName && !cond.propertyName) return true;

    // Find the value to compare against
    const value = _readValue(cond, ctx);

    // "exists" operator
    if (cond.operator === 'exists') return value !== undefined && value !== null && value !== '';

    if (value === undefined || value === null) return false;

    const lhs = String(value).toLowerCase();
    const rhs = String(cond.value ?? '').toLowerCase();

    switch (cond.operator) {
        case 'equals':     return lhs === rhs;
        case 'notEquals':  return lhs !== rhs;
        case 'contains':   return lhs.includes(rhs);
        case 'gt':         return Number(value) > Number(cond.value);
        case 'lt':         return Number(value) < Number(cond.value);
        default:           return lhs === rhs;
    }
}

function _readValue(cond, ctx) {
    if (cond.psetName) {
        // Look inside a named pset
        const pset = ctx.psets?.[cond.psetName];
        if (!pset) return undefined;
        if (!cond.propertyName) return pset; // existence of pset itself
        return pset[cond.propertyName];
    }
    if (cond.propertyName) {
        // Top-level attribute on the element (Name, Description, GlobalId, Tag, …)
        return ctx.attributes?.[cond.propertyName];
    }
    return undefined;
}
