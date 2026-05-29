/**
 * Vector Rule Engine
 *
 * Evaluates user-defined style-rules against a single element's properties.
 * A rule consists of a condition (what makes it match) and a style override.
 * Multiple rules may match a single element — the one with highest priority wins.
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
 *     style:     { color, lineWidth, lineDash, hatchPattern }
 *   }
 *
 * The engine has zero IFC dependency — pure logic. The caller supplies the
 * element context: { category, attributes, psets }.
 */

/**
 * Evaluate all rules against a single element context. Returns the merged
 * style override from the highest-priority matching rule, or null if none match.
 *
 * @param {Array<Rule>} rules
 * @param {{ category: string, attributes?: Record<string,any>, psets?: Record<string, Record<string,any>> }} ctx
 * @returns {object|null}  style patch, or null
 */
export function resolveRuleStyle(rules, ctx) {
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
    return bestRule?.style ?? null;
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
