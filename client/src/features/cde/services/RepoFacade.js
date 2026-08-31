/**
 * Persistence Indirection Layer — der Umschaltpunkt der CDE-Roadmap.
 *
 * Die Fassade spricht ein Backend über ein festes Interface an:
 *   Stufe B (jetzt):  IndexedDbBackend (JSON + Blobs), Fallback LocalStorageBackend
 *   Stufe C (später): RemoteBackend (Projekt-Repository im CDE-Backend)
 *
 * Key-Schema bleibt `ifc-repo:<scope>:<key>` — der Scope partitioniert später
 * pro Projekt (`repo.withScope(projectId)`), ohne dass Aufrufer Keys ändern.
 *
 * Blobs (IFC-Modelle) gibt es nur im IndexedDB-Backend; das localStorage-
 * Backend meldet sie als nicht unterstützt (setBlob → false, getBlob → null).
 *
 * Legacy-Migration: `ifc-repo:*`-Einträge aus localStorage werden beim ersten
 * Öffnen der IndexedDB einmalig übernommen und dort gelöscht.
 */

const PREFIX = 'ifc-repo:';

function _key(scope, key) {
    return `${PREFIX}${scope}:${key}`;
}

// ── Backend: localStorage (JSON only) ───────────────────────────────────────

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
    // Blobs werden hier nicht unterstützt — IFC-Dateien sprengen die Quota.
    async getBlob() { return null; }
    async setBlob() { return false; }
    async deleteBlob() { return false; }
    async listBlobs() { return []; }
}

// ── Backend: IndexedDB (JSON + Blobs) ───────────────────────────────────────

const IDB_NAME    = 'ifc-cde';
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
        }).then(async (db) => {
            await this._migrateLegacyLocalStorage(db);
            return db;
        });
        return this._dbPromise;
    }

    /** Einmalig: ifc-repo:*-Einträge aus localStorage in die IndexedDB heben. */
    async _migrateLegacyLocalStorage(db) {
        let legacy = [];
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith(PREFIX)) legacy.push(k);
            }
        } catch { return; }
        if (!legacy.length) return;
        for (const k of legacy) {
            try {
                const value = JSON.parse(localStorage.getItem(k));
                const tx = db.transaction(STORE_KV, 'readwrite');
                const existing = await _req(tx.objectStore(STORE_KV).get(k));
                // IndexedDB-Stand gewinnt — localStorage ist der ältere Rest.
                if (existing === undefined) {
                    await _req(tx.objectStore(STORE_KV).put(value, k));
                }
                localStorage.removeItem(k);
            } catch { /* Eintrag überspringen */ }
        }
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

// ── Backend: Remote (Stufe C) — Projekt-Repository im Projektordner ─────────
//
// Schlüssel landen als JSON-Dateien in <Projekt>/CDE/_repo/, Modell-Blobs sind
// die Dateien des CDE-Registers (manifest.yaml). Ein Lesecache hält alle
// Schlüssel; Schreiben geht sofort an den Server (Fehler nur ins Log — der
// Viewer darf am Netz nicht hängen bleiben).

const REMOTE_MODEL_PREFIX = 'model:';

/**
 * Ein Manifest-Eintrag des Servers in der Form, die der Viewer fuehrt.
 *
 * Die beiden Register benutzten unterschiedliche Feldnamen (`datei`/`name`,
 * `groesse`/`size`) und unterschiedliche Zeitformate (ISO-String gegen
 * ms-Epoche). Hier steht die Uebersetzung EINMAL — frei exportiert, damit sie
 * ohne Netz pruefbar ist.
 */
export function dokumentAusManifest(d) {
    return {
        sha256:          d.sha256,
        name:            d.datei,
        size:            d.groesse ?? 0,
        status:          d.status ?? 'WIP',
        revision:        d.revision ?? 1,
        art:             d.art ?? 'sonstiges',
        basisname:       d.basisname ?? null,
        von:             d.von ?? null,
        vorhanden:       d.vorhanden !== false,
        projectGlobalId: d.projekt_global_id ?? null,
        // Der Viewer rechnet in ms-Epoche (Date.now()), das Manifest schreibt
        // ISO-Strings. Eine Form gewinnt, sonst sortiert das Register falsch.
        addedAt:         Date.parse(d.hochgeladen_am) || 0,
        statusHistorie:  (d.status_historie || []).map(h => ({
            status: h.status, von: h.von ?? '—', am: Date.parse(h.am) || 0,
        })),
    };
}

export class RemoteBackend {
    /**
     * @param {number} projektId  Projektnummer (Ordnername)
     * @param {object} api        Axios-Instanz (Default: @/services/api, lazy)
     */
    constructor(projektId, api = null) {
        this.projektId = Number(projektId);
        this._api = api;
        this._cache = null;      // Map fullKey -> value
        this._register = null;   // { basis, dokumente }
    }

    async _client() {
        if (!this._api) this._api = (await import('@/services/api')).default;
        return this._api;
    }

    _kurz(fullKey) {
        return fullKey.startsWith(PREFIX) ? fullKey.slice(PREFIX.length) : fullKey;
    }

    async _laden() {
        if (this._cache) return this._cache;
        const api = await this._client();
        const daten = (await api.get(`/projekte/${this.projektId}/cde/repo`)).data || {};
        this._cache = new Map(Object.entries(daten).map(([k, v]) => [PREFIX + k, v]));
        return this._cache;
    }

    async get(fullKey) {
        try {
            const c = await this._laden();
            return c.has(fullKey) ? c.get(fullKey) : null;
        } catch (e) { console.warn('[CDE remote] get', e?.message ?? e); return null; }
    }
    async set(fullKey, value) {
        try {
            const c = await this._laden();
            c.set(fullKey, value);
            const api = await this._client();
            await api.put(`/projekte/${this.projektId}/cde/repo/${encodeURIComponent(this._kurz(fullKey))}`, value);
            return true;
        } catch (e) { console.warn('[CDE remote] set', e?.message ?? e); return false; }
    }
    async delete(fullKey) {
        try {
            const c = await this._laden();
            c.delete(fullKey);
            const api = await this._client();
            await api.delete(`/projekte/${this.projektId}/cde/repo/${encodeURIComponent(this._kurz(fullKey))}`);
            return true;
        } catch (e) { console.warn('[CDE remote] delete', e?.message ?? e); return false; }
    }
    async listKeys(fullPrefix) {
        try {
            const c = await this._laden();
            return [...c.keys()].filter(k => k.startsWith(fullPrefix));
        } catch { return []; }
    }

    // ── Blobs = Dateien des CDE-Registers ───────────────────────────────────

    async _registerLaden(frisch = false) {
        if (this._register && !frisch) return this._register;
        const api = await this._client();
        this._register = (await api.get(`/projekte/${this.projektId}/cde`)).data;
        return this._register;
    }
    _shaAus(fullKey) {
        const kurz = this._kurz(fullKey);
        const i = kurz.indexOf(REMOTE_MODEL_PREFIX);
        return i < 0 ? null : kurz.slice(i + REMOTE_MODEL_PREFIX.length);
    }
    _zeile(d, scopeKey) {
        return {
            key: `${scopeKey}${REMOTE_MODEL_PREFIX}${d.sha256}`,
            meta: dokumentAusManifest(d),
            size: d.groesse,
        };
    }

    /**
     * Das Dokumentregister des Projekts, in der Form des Viewers.
     *
     * Bis hierher fuehrte der Viewer eine ZWEITE Liste (`_repo/…dokumente.json`)
     * neben dem Manifest — im selben Ordner, ueber dieselben Dateien, mit
     * eigener Revisionszaehlung und eigenem Status. Ein im Cockpit auf
     * "Published" gesetzter Plan trug im Export weiter "VORABZUG".
     * Bei aktivem RemoteBackend ist das Manifest die Wahrheit.
     */
    async dokumente() {
        const reg = await this._registerLaden(true);
        return (reg.dokumente || []).map(dokumentAusManifest);
    }

    /** Status am Server setzen (PUT …/cde/{sha}/status). */
    async setzeStatus(sha256, status) {
        const api = await this._client();
        await api.put(`/projekte/${this.projektId}/cde/${sha256}/status`, { status });
        this._register = null;
    }

    // ── Modellsaetze (Stufe 11) ────────────────────────────────────────
    // Sie leben im selben Manifest wie die Dokumente und kommen mit
    // `_registerLaden` ohnehin mit; die Methoden hier sind fuers Schreiben und
    // fuer das gezielte Nachlesen nach einer Aenderung.

    async saetzeLesen() {
        const api = await this._client();
        return (await api.get(`/projekte/${this.projektId}/cde/saetze`)).data;
    }

    async satzAnlegen({ name, zweck = 'variante', enthaelt = [] }) {
        const api = await this._client();
        const antwort = await api.post(`/projekte/${this.projektId}/cde/saetze`, { name, zweck, enthaelt });
        this._register = null;          // die Register-Antwort fuehrt die Saetze mit
        return antwort.data;
    }

    async satzAendern(satzId, patch) {
        const api = await this._client();
        const antwort = await api.put(`/projekte/${this.projektId}/cde/saetze/${satzId}`, patch);
        this._register = null;
        return antwort.data;
    }

    async satzLoeschen(satzId) {
        const api = await this._client();
        await api.delete(`/projekte/${this.projektId}/cde/saetze/${satzId}`);
        this._register = null;
        return true;
    }

    /** Eintrag aus dem Register nehmen (DELETE …/cde/{sha}). */
    async entferne(sha256) {
        const api = await this._client();
        await api.delete(`/projekte/${this.projektId}/cde/${sha256}`);
        this._register = null;
    }
    async listBlobs(fullPrefix) {
        try {
            const reg = await this._registerLaden(true);
            const scopeKey = fullPrefix.slice(0, fullPrefix.indexOf(REMOTE_MODEL_PREFIX) >= 0
                ? fullPrefix.indexOf(REMOTE_MODEL_PREFIX) : fullPrefix.length);
            return (reg.dokumente || [])
                .filter(d => d.art === 'modell' && d.vorhanden !== false)
                .map(d => this._zeile(d, scopeKey))
                .filter(r => r.key.startsWith(fullPrefix));
        } catch (e) { console.warn('[CDE remote] listBlobs', e?.message ?? e); return []; }
    }
    async getBlob(fullKey) {
        try {
            const sha = this._shaAus(fullKey);
            const reg = await this._registerLaden();
            const d = (reg.dokumente || []).find(x => x.sha256 === sha);
            if (!d) return null;
            const api = await this._client();
            const antwort = await api.get('/projects/file', { params: { path: `${reg.basis}/${d.pfad}` }, responseType: 'blob' });
            return { blob: antwort.data, meta: this._zeile(d, '').meta };
        } catch (e) { console.warn('[CDE remote] getBlob', e?.message ?? e); return null; }
    }
    /**
     * Neues Modell -> Upload ins CDE-Register (WIP); bekanntes (gleiche sha) -> nichts zu tun.
     *
     * Der Server weist einen zweiten Upload GLEICHEN NAMENS mit 422 ab, prueft
     * dabei aber den Namen, nicht die Pruefsumme. Bisher verschwand dieser Fall
     * in einem console.warn — der Upload scheiterte, das Modell landete
     * trotzdem im lokalen Register, und die beiden liefen auseinander. Der
     * Fall wird jetzt durchgereicht, damit der Viewer ihn zeigen kann.
     */
    async setBlob(fullKey, blob, meta = {}) {
        const sha = this._shaAus(fullKey);
        let reg;
        try { reg = await this._registerLaden(true); }
        catch (e) {
            // Der GRUND bleibt stehen, nicht nur das Scheitern. Ohne ihn sah
            // der Nutzer bei fehlender Anmeldung genau nichts: der Fehler
            // wurde hier zu `false`, `_ablegen` gab bei `false` stumm auf, und
            // `registerModel` hatte ein leeres catch. Drei Schichten Schweigen
            // ergeben „es passiert gar nichts".
            this._letzterFehler = fehlerLesbar(e);
            console.warn('[CDE remote] setBlob/register', e?.message ?? e);
            return false;
        }
        if ((reg.dokumente || []).some(x => x.sha256 === sha)) return true;

        const api = await this._client();
        const form = new FormData();
        form.append('datei', blob, meta.name || 'modell.ifc');
        try {
            await api.post(`/projekte/${this.projektId}/cde/upload`, form, {
                // Die IFCPROJECT-GlobalId wandert mit ins Manifest. Sie zaehlt
                // keine Revisionen (das tut der Dateiname), sagt aber, welche
                // Dateien dasselbe Ursprungsmodell meinen — Grundlage fuer den
                // spaeteren Modellvergleich.
                params: { status: 'WIP', projekt_global_id: meta.projectGlobalId ?? undefined },
            });
            this._register = null;
            return true;
        } catch (e) {
            if (e?.response?.status === 422) {
                const fehler = new Error(e.response.data?.detail || 'Datei gleichen Namens liegt schon im Projekt.');
                fehler.name = 'CdeUploadAbgelehnt';
                throw fehler;
            }
            console.warn('[CDE remote] setBlob', e?.message ?? e);
            return false;
        }
    }
    /** Projektdateien werden aus dem Viewer nie gelöscht — Status im Cockpit pflegen. */
    async deleteBlob() { return false; }
}

// ── Backend: Buero (projektuebergreifend) ───────────────────────────────────

/**
 * Die Bueroablage — was fuer ALLE Projekte gilt.
 *
 * Plankoepfe, Blattformate, Linienstil-Presets, Symbolsaetze, IDS-Regelwerke
 * und KG-Kennwerte sind Buerowissen. Bisher lagen sie je Projekt im Repo und
 * fingen in jedem neuen Projekt bei null an.
 *
 * Absichtlich schmaler als `RemoteBackend`: nur Schluessel-Werte, keine Blobs.
 * Modelle gehoeren zu einem Projekt; eine Bauteilbibliothek mit eigenen
 * Dateien waere ein eigener Schritt und braucht dann auch ein eigenes
 * Register — nicht dieses.
 *
 * Ohne Netz gibt es keine Bueroablage. Das ist kein Fehler: Bueroeinstellungen
 * sind nichts, was der Browser eines Einzelnen halten sollte. Die Fassade gibt
 * dann `null` zurueck, und die Vorrangregel faellt auf den eingebauten
 * Standard.
 */
export class BueroBackend {
    constructor(api = null) {
        this._api = api;
        this._cache = null;
    }

    async _client() {
        if (!this._api) this._api = (await import('@/services/api')).default;
        return this._api;
    }

    /** Ein Schluessel OHNE Scope — die Bueroablage hat nur eine Ebene. */
    _kurz(fullKey) {
        const ohnePrefix = fullKey.startsWith(PREFIX) ? fullKey.slice(PREFIX.length) : fullKey;
        // Scope abschneiden: 'global:plankopf' -> 'plankopf'. Im Buero gibt es
        // keine Projekt-Namensraeume, und ein Doppelpunkt im Dateinamen waere
        // nur Ballast.
        const i = ohnePrefix.indexOf(':');
        return i < 0 ? ohnePrefix : ohnePrefix.slice(i + 1);
    }

    async _laden() {
        if (this._cache) return this._cache;
        const api = await this._client();
        const daten = (await api.get('/buero/cde/repo')).data || {};
        this._cache = new Map(Object.entries(daten));
        return this._cache;
    }

    async get(fullKey) {
        try {
            const cache = await this._laden();
            const v = cache.get(this._kurz(fullKey));
            return v === undefined ? null : v;
        } catch (e) { console.warn('[CDE buero] get', e?.message ?? e); return null; }
    }

    async set(fullKey, value) {
        const kurz = this._kurz(fullKey);
        try {
            const cache = await this._laden();
            cache.set(kurz, value);
            const api = await this._client();
            await api.put(`/buero/cde/repo/${encodeURIComponent(kurz)}`, value);
            return true;
        } catch (e) { console.warn('[CDE buero] set', e?.message ?? e); return false; }
    }

    async delete(fullKey) {
        const kurz = this._kurz(fullKey);
        try {
            const cache = await this._laden();
            cache.delete(kurz);
            const api = await this._client();
            await api.delete(`/buero/cde/repo/${encodeURIComponent(kurz)}`);
            return true;
        } catch (e) { console.warn('[CDE buero] delete', e?.message ?? e); return false; }
    }

    async listKeys(fullPrefix) {
        try {
            const cache = await this._laden();
            const kurz = this._kurz(fullPrefix);
            return [...cache.keys()].filter(k => k.startsWith(kurz)).map(k => `${PREFIX}buero:${k}`);
        } catch { return []; }
    }

    /** Modelle gehoeren zu einem Projekt, nicht ins Buero. */
    async listBlobs() { return []; }
    async getBlob() { return null; }
    async setBlob() { return false; }
    async deleteBlob() { return false; }
}

/**
 * Projekt schlägt Büro schlägt Standard.
 *
 * Rein und frei exportiert, damit die Regel prüfbar ist, ohne ein Backend zu
 * bauen — und damit sie an genau EINER Stelle steht.
 *
 * `null` und `undefined` heißen „nicht gesetzt". Ein leeres Array oder ein
 * leeres Objekt heißen dagegen „bewusst leer" und gewinnen: wer die
 * Linienstile eines Projekts auf nichts setzt, will nicht die Bürostile
 * zurückbekommen.
 */
/**
 * Einen Netzfehler in einen Satz übersetzen, den man handeln kann.
 *
 * 401 ist der häufigste und der einzige, bei dem der Nutzer selbst etwas tun
 * kann — deshalb steht er zuerst und nennt die Abhilfe.
 */
export function fehlerLesbar(e) {
    const status = e?.response?.status ?? null;
    if (status === 401 || status === 403) {
        return { status, text: 'Nicht angemeldet — ohne Sitzung ist der Projektordner nicht erreichbar.' };
    }
    if (status === 404) return { status, text: 'Projektordner nicht gefunden.' };
    if (status === 422) return { status, text: 'Der Server hat die Datei abgelehnt (gleicher Name schon vorhanden?).' };
    if (status) return { status, text: `Server antwortete mit ${status}.` };
    return { status: null, text: e?.message ? `Kein Zugriff auf den Projektordner: ${e.message}` : 'Kein Zugriff auf den Projektordner.' };
}

export function waehleMitVorrang(projekt, buero, standard = null) {
    if (projekt !== null && projekt !== undefined) return projekt;
    if (buero !== null && buero !== undefined) return buero;
    return standard;
}

// ── Fassade ─────────────────────────────────────────────────────────────────

export class RepoFacade {
    /**
     * @param {string} scope    Namespace (Projekt-ID oder 'global')
     * @param {object} backend  Backend-Instanz (Default: geteiltes Auto-Backend)
     */
    constructor(scope = 'global', backend = null) {
        this.scope = scope;
        this._backend = backend ?? _defaultBackend();
        /** Geschwister-Fassade auf die Büroablage, oder null. */
        this._buero = null;
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

    /** @returns {Promise<number>} Anzahl gelöschter Keys */
    async clear() {
        const keys = await this.list();
        let n = 0;
        for (const k of keys) {
            if (await this.delete(k)) n++;
        }
        return n;
    }

    // ── Blobs (IFC-Dateien, Snapshots) ──────────────────────────────────────

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

    // ── Dokumentregister (nur mit Server-Backend) ───────────────────────────
    //
    // Diese drei greifen bewusst NICHT auf den Scope zu: das Register gehoert
    // dem Projektordner, nicht einem Namensraum darin. Ohne Server-Backend
    // gibt es kein Register — dann fuehrt der Store seine eigene Liste weiter
    // (Offline-Fall, IndexedDB).

    /** @returns {Promise<Array|null>} null, wenn kein Server-Register da ist */
    async dokumente() {
        return this._backend.dokumente ? this._backend.dokumente() : null;
    }

    /** @returns {Promise<boolean>} false, wenn das Backend keinen Status kennt */
    async setzeStatus(sha256, status) {
        if (!this._backend.setzeStatus) return false;
        await this._backend.setzeStatus(sha256, status);
        return true;
    }

    /**
     * Modellsaetze — nur das RemoteBackend fuehrt sie.
     *
     * Ohne Server gibt es keine Saetze: sie leben im Manifest des
     * Projektordners. Der Store faellt dann auf „kein Satz" zurueck, und alles
     * liegt auf der Auftragsebene — das ist der Offline-Fall, nicht ein Fehler.
     */
    async saetzeLesen() {
        return this._backend.saetzeLesen ? this._backend.saetzeLesen() : [];
    }
    async satzAnlegen(daten) {
        if (!this._backend.satzAnlegen) throw new Error('Modellsätze brauchen ein Projekt auf dem Server.');
        return this._backend.satzAnlegen(daten);
    }
    async satzAendern(satzId, patch) {
        if (!this._backend.satzAendern) throw new Error('Modellsätze brauchen ein Projekt auf dem Server.');
        return this._backend.satzAendern(satzId, patch);
    }
    async satzLoeschen(satzId) {
        if (!this._backend.satzLoeschen) return false;
        return this._backend.satzLoeschen(satzId);
    }

    /** @returns {Promise<boolean>} false, wenn das Backend nichts entfernen kann */
    async entferne(sha256) {
        if (!this._backend.entferne) return false;
        await this._backend.entferne(sha256);
        return true;
    }

    /** Geschwister-Fassade unter anderem Scope (z. B. pro Projekt). */
    withScope(scope) {
        const f = new RepoFacade(scope, this._backend);
        // Die Büroebene ist KEIN Scope des Projekts — sie liegt daneben. Die
        // Geschwister-Fassade muss sie trotzdem kennen, sonst verlöre ein
        // Aufruf im Projekt-Scope den Vorrang-Rückfall.
        f._buero = this._buero;
        return f;
    }

    /**
     * Backend tauschen (Stufe C): VOR der Store-Initialisierung aufrufen —
     * bereits geladene Stores halten sonst den Stand des alten Backends.
     */
    setBackend(backend) {
        this._backend = backend ?? _defaultBackend();
    }

    // ── Büro-Ebene (Sprint I, Stufe 6) ──────────────────────────────────────

    /**
     * Die projektübergreifende Ablage.
     *
     * `null`, solange keine gesetzt ist (Arbeit ohne Netz). Aufrufer prüfen
     * das nicht selbst — dafür gibt es `mitVorrang`.
     */
    get buero() { return this._buero ?? null; }

    /**
     * Warum der letzte Server-Zugriff scheiterte — oder `null`.
     *
     * Die Backends geben `false`/`null` zurück, damit ein Ausfall die Arbeit
     * nicht abreisst. Der GRUND darf darüber aber nicht verloren gehen: sonst
     * steht der Nutzer vor einem Knopf, der nichts tut, und niemand sagt ihm,
     * dass ihm nur die Anmeldung fehlt.
     */
    get letzterFehler() { return this._backend?._letzterFehler ?? null; }

    /** Nach dem Anzeigen zurücksetzen — sonst klebt eine alte Meldung. */
    fehlerQuittieren() { if (this._backend) this._backend._letzterFehler = null; }

    setBueroBackend(backend) {
        this._buero = backend ? new RepoFacade('buero', backend) : null;
    }

    /**
     * Ein Wert mit Vorrang: **Projekt schlägt Büro schlägt Standard.**
     *
     * Die Regel selbst steht in `waehleMitVorrang` — hier wird nur beschafft.
     * Das ist die einzige Stelle, an der die drei Ebenen zusammenkommen; ohne
     * sie fragte jeder Aufrufer selbst nach und käme irgendwann zu einer
     * anderen Reihenfolge.
     *
     * @param {string} key      Schlüssel in beiden Ebenen derselbe
     * @param {*}      standard eingebaute Vorgabe
     */
    async mitVorrang(key, standard = null) {
        const [projekt, buero] = await Promise.all([
            this.get(key),
            this._buero ? this._buero.get(key) : Promise.resolve(null),
        ]);
        return waehleMitVorrang(projekt, buero, standard);
    }

    /** true, wenn ein Projekt-Repository auf dem Server aktiv ist. */
    get remote() {
        return this._backend instanceof RemoteBackend;
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

/**
 * Globale Default-Instanz. Mit `?projekt=<id>` (Cockpit-Deep-Link) schaltet
 * CdeView sie per `repo.setBackend(new RemoteBackend(id))` auf den Projektordner.
 */
export const repo = new RepoFacade();
