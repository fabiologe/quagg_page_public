/**
 * PdfRepo — Persistenz-Fassade des PDF-Editors (Kopie des RepoFacade-Musters
 * aus ifc-viewer/services/RepoFacade.js, eigener Namensraum).
 *
 * Backend heute: IndexedDB (JSON + Blobs), Fallback localStorage (nur JSON).
 * Backend später: RemoteBackend über die quagg-API — die Fassade ist der
 * vereinbarte Umschaltpunkt, Aufrufer ändern dann keine Keys.
 *
 * Key-Schema: `pdf-repo:<scope>:<key>` — Scope heute 'global'.
 * Belegte Keys (siehe Plan):
 *   Blob  doc:<id>:file         PDF-Original + Meta
 *   KV    doc:<id>:meta         Name, Seitenzahl, Kalibrierung, schemaVersion
 *   KV    doc:<id>:annotations  Annotationscontainer
 *   KV    doc-index             Liste aller Dokumente für „Zuletzt geöffnet"
 *   KV    signatures            wiederverwendbare Vektor-Signaturen
 *   KV    einstellungen         Theme, Eingabemodus, letzte Werkzeuge
 */

const PREFIX = 'pdf-repo:';

function _key(scope, key) {
    return `${PREFIX}${scope}:${key}`;
}

// ── Backend: localStorage (nur JSON, Notnagel) ──────────────────────────────

export class LocalStorageBackend {
    async get(fullKey) {
        try {
            const raw = localStorage.getItem(fullKey);
            return raw == null ? null : JSON.parse(raw);
        } catch { return null; }
    }
    async set(fullKey, value) {
        try { localStorage.setItem(fullKey, JSON.stringify(value)); return true; }
        catch { return false; }
    }
    async delete(fullKey) {
        try { localStorage.removeItem(fullKey); return true; }
        catch { return false; }
    }
    async listKeys(fullPrefix) {
        const out = [];
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith(fullPrefix)) out.push(k);
            }
        } catch { /* */ }
        return out;
    }
    // PDFs sprengen die localStorage-Quota — Blobs gibt es hier nicht.
    async getBlob() { return null; }
    async setBlob() { return false; }
    async deleteBlob() { return false; }
    async listBlobs() { return []; }
}

// ── Backend: IndexedDB (JSON + Blobs) ───────────────────────────────────────

const IDB_NAME    = 'pdf-editor';
const IDB_VERSION = 1;
const STORE_KV    = 'kv';     // fullKey → beliebiger JSON-Wert
const STORE_BLOBS = 'blobs';  // fullKey → { blob, meta }

function _req(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror   = () => reject(request.error);
    });
}

export class IndexedDbBackend {
    constructor(dbName = IDB_NAME) {
        this._dbName = dbName;
        this._dbPromise = null;
    }

    _open() {
        if (this._dbPromise) return this._dbPromise;
        this._dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(this._dbName, IDB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE_KV))    db.createObjectStore(STORE_KV);
                if (!db.objectStoreNames.contains(STORE_BLOBS)) db.createObjectStore(STORE_BLOBS);
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror   = () => reject(req.error);
        });
        return this._dbPromise;
    }

    async _store(name, mode, fn) {
        const db = await this._open();
        const tx = db.transaction(name, mode);
        return fn(tx.objectStore(name));
    }

    async get(fullKey) {
        try {
            const v = await this._store(STORE_KV, 'readonly', s => _req(s.get(fullKey)));
            return v === undefined ? null : v;
        } catch { return null; }
    }
    async set(fullKey, value) {
        try { await this._store(STORE_KV, 'readwrite', s => _req(s.put(value, fullKey))); return true; }
        catch { return false; }
    }
    async delete(fullKey) {
        try { await this._store(STORE_KV, 'readwrite', s => _req(s.delete(fullKey))); return true; }
        catch { return false; }
    }
    async listKeys(fullPrefix) {
        try {
            const keys = await this._store(STORE_KV, 'readonly', s => _req(s.getAllKeys()));
            return keys.filter(k => typeof k === 'string' && k.startsWith(fullPrefix));
        } catch { return []; }
    }

    async getBlob(fullKey) {
        try {
            const v = await this._store(STORE_BLOBS, 'readonly', s => _req(s.get(fullKey)));
            return v ?? null;
        } catch { return null; }
    }
    async setBlob(fullKey, blob, meta = {}) {
        try { await this._store(STORE_BLOBS, 'readwrite', s => _req(s.put({ blob, meta }, fullKey))); return true; }
        catch { return false; }
    }
    async deleteBlob(fullKey) {
        try { await this._store(STORE_BLOBS, 'readwrite', s => _req(s.delete(fullKey))); return true; }
        catch { return false; }
    }
    /** Nur Metadaten listen — die Blobs selbst bleiben liegen. */
    async listBlobs(fullPrefix) {
        try {
            const db = await this._open();
            const tx = db.transaction(STORE_BLOBS, 'readonly');
            const store = tx.objectStore(STORE_BLOBS);
            const [keys, values] = await Promise.all([_req(store.getAllKeys()), _req(store.getAll())]);
            const out = [];
            for (let i = 0; i < keys.length; i++) {
                const k = keys[i];
                if (typeof k === 'string' && k.startsWith(fullPrefix)) {
                    out.push({ key: k, meta: values[i]?.meta ?? {}, size: values[i]?.blob?.size ?? 0 });
                }
            }
            return out;
        } catch { return []; }
    }
}

// ── Fassade ─────────────────────────────────────────────────────────────────

export class PdfRepo {
    /**
     * @param {string} scope    Namensraum (heute 'global', später Projekt-ID)
     * @param {object} backend  Backend-Instanz (Default: geteiltes Auto-Backend)
     */
    constructor(scope = 'global', backend = null) {
        this.scope = scope;
        this._backend = backend ?? _defaultBackend();
    }

    /** @returns {Promise<any|null>} null bei Fehlen oder Fehler */
    async get(key) { return this._backend.get(_key(this.scope, key)); }

    /** @returns {Promise<boolean>} false bei Quota/Fehler */
    async set(key, value) { return this._backend.set(_key(this.scope, key), value); }

    /** @returns {Promise<boolean>} */
    async delete(key) { return this._backend.delete(_key(this.scope, key)); }

    /** @returns {Promise<string[]>} Keys OHNE Scope-Präfix */
    async list(subPrefix = '') {
        const scopePrefixFull = _key(this.scope, '');
        const keys = await this._backend.listKeys(_key(this.scope, subPrefix));
        return keys.map(k => k.slice(scopePrefixFull.length));
    }

    // ── Blobs (PDF-Originale) ───────────────────────────────────────────────

    /** @returns {Promise<{blob: Blob, meta: object}|null>} */
    async getBlob(key) { return this._backend.getBlob(_key(this.scope, key)); }

    /** @returns {Promise<boolean>} false wenn das Backend keine Blobs kann */
    async setBlob(key, blob, meta = {}) { return this._backend.setBlob(_key(this.scope, key), blob, meta); }

    /** @returns {Promise<boolean>} */
    async deleteBlob(key) { return this._backend.deleteBlob(_key(this.scope, key)); }

    /** @returns {Promise<Array<{key, meta, size}>>} Keys OHNE Scope-Präfix */
    async listBlobs(subPrefix = '') {
        const scopePrefixFull = _key(this.scope, '');
        const rows = await this._backend.listBlobs(_key(this.scope, subPrefix));
        return rows.map(r => ({ ...r, key: r.key.slice(scopePrefixFull.length) }));
    }

    /** Geschwister-Fassade unter anderem Scope (z. B. pro Projekt). */
    withScope(scope) {
        return new PdfRepo(scope, this._backend);
    }
}

// ── Backend-Auswahl ─────────────────────────────────────────────────────────

let _shared = null;
function _defaultBackend() {
    if (_shared) return _shared;
    _shared = (typeof indexedDB !== 'undefined')
        ? new IndexedDbBackend()
        : new LocalStorageBackend();
    return _shared;
}

/** Globale Default-Instanz des Editors. */
export const repo = new PdfRepo();
