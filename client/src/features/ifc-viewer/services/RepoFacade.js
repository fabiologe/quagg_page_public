/**
 * Persistence Indirection Layer
 *
 * Sits between UI/store code and the actual persistence backend.
 *   Today: localStorage (synchronous under the hood, async API outside)
 *   Tomorrow: IndexedDB for multi-project local mode
 *   Day after: remote project repository for true CDE multi-user
 *
 * Why async-by-default: real backends are async. If we pretended they were
 * sync today, every call-site would need a Promise-refactor later. The cost
 * of `await` now is near-zero; the cost of retro-fitting it across the
 * codebase later is many days.
 *
 * Scope: an optional namespace string (default 'global'). Lets us partition
 * data per project once project containers exist, without changing keys.
 *
 * Note: this facade is for NEW code (Planning-Cockpit, DIN-Klassifikation,
 * IDS-results, etc.). Existing stores using the debounced localStorage
 * pattern stay as they are — migrating them would be a separate big-bang.
 */

const PREFIX = 'ifc-repo:';

function _key(scope, key) {
    return `${PREFIX}${scope}:${key}`;
}

export class RepoFacade {
    /**
     * @param {string} scope  namespace (e.g. project id, or 'global')
     */
    constructor(scope = 'global') {
        this.scope = scope;
    }

    /**
     * Read a value. Returns null when absent or on parse error.
     * @returns {Promise<any|null>}
     */
    async get(key) {
        try {
            const raw = localStorage.getItem(_key(this.scope, key));
            return raw == null ? null : JSON.parse(raw);
        } catch {
            return null;
        }
    }

    /**
     * Write a value (JSON-serialised). Returns false on quota / other error.
     * @returns {Promise<boolean>}
     */
    async set(key, value) {
        try {
            localStorage.setItem(_key(this.scope, key), JSON.stringify(value));
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Remove a single key. Returns false on error.
     * @returns {Promise<boolean>}
     */
    async delete(key) {
        try {
            localStorage.removeItem(_key(this.scope, key));
            return true;
        } catch {
            return false;
        }
    }

    /**
     * List keys under this scope, optionally filtered by sub-prefix.
     * @returns {Promise<string[]>}  keys WITHOUT the scope/global prefix
     */
    async list(subPrefix = '') {
        const scopePrefixFull = _key(this.scope, '');
        const matchPrefix     = _key(this.scope, subPrefix);
        const out = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(matchPrefix)) {
                out.push(k.slice(scopePrefixFull.length));
            }
        }
        return out;
    }

    /**
     * Remove all keys under this scope.
     * @returns {Promise<number>}  number of keys deleted
     */
    async clear() {
        const keys = await this.list();
        let n = 0;
        for (const k of keys) {
            if (await this.delete(k)) n++;
        }
        return n;
    }

    /** Create a sibling facade under a different scope (e.g. per project). */
    withScope(scope) {
        return new RepoFacade(scope);
    }
}

/**
 * Default global instance. Consumers can either import this singleton or
 * construct their own scoped facade. The singleton's scope is fine until
 * we have project containers — at that point most consumers should switch
 * to `repo.withScope(projectId)`.
 */
export const repo = new RepoFacade();
