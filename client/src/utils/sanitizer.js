import { toRaw, isRef, isProxy } from 'vue';

/**
 * Deeply sanitizes an object for serialization (e.g. postMessage).
 * - Unwraps Vue Proxies/Refs.
 * - Converts Maps/Sets to Arrays (optional, but we keep Maps for now as structured clone supports them).
 * - Removes functions, DOM nodes, and other non-clonable types.
 * - Handles circular references (by breaking them).
 */
export const deepSanitize = (obj, seen = new WeakMap()) => {
    // 1. Unwrap Vue Reactivity
    let raw = obj;
    while (isRef(raw) || isProxy(raw)) {
        raw = toRaw(raw);
    }

    // 2. Handle Primitives
    if (raw === null || typeof raw !== 'object') {
        if (typeof raw === 'function') return undefined; // Strip functions
        if (typeof raw === 'symbol') return undefined; // Strip symbols
        return raw;
    }

    // 3. Handle Circular Refs
    if (seen.has(raw)) {
        return seen.get(raw);
    }

    // 4. Handle Specific Types

    // DOM Nodes (The likely culprit)
    if (raw instanceof Node || raw instanceof Event) {
        console.warn("Sanitizer: Removed DOM Node/Event", raw);
        return undefined;
    }

    // Typed Arrays (Safe)
    if (ArrayBuffer.isView(raw)) {
        return raw; // Float32Array, etc. are clonable
    }

    // Date (Safe)
    if (raw instanceof Date) {
        return new Date(raw);
    }

    // Map
    if (raw instanceof Map) {
        const newMap = new Map();
        seen.set(raw, newMap);
        for (const [key, value] of raw) {
            const safeKey = deepSanitize(key, seen);
            const safeValue = deepSanitize(value, seen);
            if (safeKey !== undefined && safeValue !== undefined) {
                newMap.set(safeKey, safeValue);
            }
        }
        return newMap;
    }

    // Set
    if (raw instanceof Set) {
        const newSet = new Set();
        seen.set(raw, newSet);
        for (const value of raw) {
            const safeValue = deepSanitize(value, seen);
            if (safeValue !== undefined) {
                newSet.add(safeValue);
            }
        }
        return newSet;
    }

    // Array
    if (Array.isArray(raw)) {
        const newArr = [];
        seen.set(raw, newArr);
        for (let i = 0; i < raw.length; i++) {
            const safeValue = deepSanitize(raw[i], seen);
            if (safeValue !== undefined) {
                newArr.push(safeValue);
            }
        }
        return newArr;
    }

    // Plain Object
    const newObj = {};
    seen.set(raw, newObj);
    for (const key in raw) {
        if (Object.prototype.hasOwnProperty.call(raw, key)) {
            const safeValue = deepSanitize(raw[key], seen);
            if (safeValue !== undefined) {
                newObj[key] = safeValue;
            }
        }
    }
    return newObj;
};
