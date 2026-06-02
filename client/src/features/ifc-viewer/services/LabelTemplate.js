/**
 * Label Template Renderer
 *
 * Resolves a template string like "Wand {Name} — {Pset_WallCommon.IsExternal}"
 * against an element's attributes + psets. Pure-JS, zero IFC dependency.
 *
 * Token syntax:
 *   {Name}                          → top-level attribute
 *   {Pset_WallCommon.IsExternal}    → pset property (dot-separated)
 *   {category}                      → IFC entity type (special)
 *   {localId}                       → fragment local id (special)
 *
 * Missing values → empty string. Tokens are interpreted case-insensitively
 * for property/pset names (IFC props often have lower/uppercase variants).
 *
 * Optional formatters appended with a colon:
 *   {Pset_WallCommon.Thickness:mm}  → "200 mm" (treats raw value as mm)
 *   {Pset_QuantitySet.Length:m}     → "2.50 m" (raw value in m, formatted)
 *   {Name:upper} / {Name:lower}     → case transform
 *   {Pset_X.Y:trim20}               → max 20 chars + ellipsis
 */

const TOKEN_RE = /\{([^}]+)\}/g;

export function renderLabelTemplate(template, ctx) {
    if (!template) return null;
    const text = String(template).replace(TOKEN_RE, (m, body) => {
        const [keysRaw, formatter] = body.split(':');
        // Fallback chain: {Name|ObjectType|category} → first non-empty wins
        const keys = keysRaw.split('|').map(k => k.trim()).filter(Boolean);
        let value = null;
        for (const key of keys) {
            const v = _readKey(key, ctx);
            if (v != null && v !== '') { value = v; break; }
        }
        if (value == null || value === '') return '';
        return _applyFormatter(value, formatter?.trim());
    });
    // Split on ';' → multi-line label. Empty segments (e.g. trailing ';') are dropped.
    const lines = text.split(';').map(s => s.trim()).filter(Boolean);
    if (lines.length === 0) return null;
    if (lines.length === 1) return lines[0];
    return lines;
}

// ── Key resolution ──────────────────────────────────────────────────────────

function _readKey(key, ctx) {
    const lower = key.toLowerCase();
    if (lower === 'category') return ctx?.category ?? '';
    if (lower === 'localid')  return ctx?.localId  ?? '';

    if (key.includes('.')) {
        // pset.property form
        const dot = key.indexOf('.');
        const psetName = key.slice(0, dot);
        const propName = key.slice(dot + 1);
        const pset = _lookupCaseInsensitive(ctx?.psets, psetName);
        if (!pset) return null;
        return _lookupCaseInsensitive(pset, propName);
    }
    // Plain key — first try top-level attribute, then any pset that has this property
    const fromAttrs = _lookupCaseInsensitive(ctx?.attributes, key);
    if (fromAttrs != null && fromAttrs !== '') return fromAttrs;
    if (ctx?.psets) {
        for (const psetName of Object.keys(ctx.psets)) {
            const v = _lookupCaseInsensitive(ctx.psets[psetName], key);
            if (v != null && v !== '') return v;
        }
    }
    return null;
}

function _lookupCaseInsensitive(obj, name) {
    if (!obj || !name) return null;
    if (Object.prototype.hasOwnProperty.call(obj, name)) return obj[name];
    const lower = String(name).toLowerCase();
    for (const k of Object.keys(obj)) {
        if (k.toLowerCase() === lower) return obj[k];
    }
    return null;
}

// ── Formatters ──────────────────────────────────────────────────────────────

function _applyFormatter(value, fmt) {
    if (!fmt) return String(value);
    const f = fmt.toLowerCase();
    if (f === 'upper')  return String(value).toUpperCase();
    if (f === 'lower')  return String(value).toLowerCase();
    if (f.startsWith('trim')) {
        const n = parseInt(f.slice(4), 10);
        const s = String(value);
        return Number.isFinite(n) && s.length > n ? s.slice(0, Math.max(0, n - 1)) + '…' : s;
    }
    if (f === 'mm') {
        const n = Number(value);
        return Number.isFinite(n) ? `${Math.round(n)} mm` : String(value);
    }
    if (f === 'm') {
        const n = Number(value);
        return Number.isFinite(n) ? `${n.toFixed(2)} m` : String(value);
    }
    if (f === 'fixed1') {
        const n = Number(value);
        return Number.isFinite(n) ? n.toFixed(1) : String(value);
    }
    if (f === 'fixed2') {
        const n = Number(value);
        return Number.isFinite(n) ? n.toFixed(2) : String(value);
    }
    return String(value);
}

// ── Template introspection (used by the UI) ─────────────────────────────────

/** Return the set of tokens (without braces) referenced in a template. */
export function tokensIn(template) {
    if (!template) return [];
    const out = new Set();
    String(template).replace(TOKEN_RE, (_, body) => {
        const keysPart = body.split(':')[0];
        for (const k of keysPart.split('|')) {
            const key = k.trim();
            if (key) out.add(key);
        }
        return _;
    });
    return [...out];
}
