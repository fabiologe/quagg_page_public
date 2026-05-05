const DB_NAME    = 'saintv1d';
const DB_VERSION = 1;
const STORE_NAME = 'projects';

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                store.createIndex('savedAt', 'savedAt', { unique: false });
            }
        };

        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror   = (e) => reject(e.target.error);
    });
}

function tx(db, mode) {
    return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

function wrap(req) {
    return new Promise((resolve, reject) => {
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror   = (e) => reject(e.target.error);
    });
}

export async function listProjects() {
    const db = await openDB();
    const all = await wrap(tx(db, 'readonly').getAll());
    // Nur Metadaten zurückgeben, nicht die kompletten Netz-Daten
    return all
        .map(p => ({
            id:        p.id,
            name:      p.name,
            savedAt:   p.savedAt,
            nodeCount: p.nodeCount,
            edgeCount: p.edgeCount,
            areaCount: p.areaCount,
        }))
        .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
}

export async function saveProject(name, storeSnapshot) {
    const db = await openDB();
    // Strip Vue reactive Proxy wrappers — IndexedDB structured clone can't handle them
    const plain = JSON.parse(JSON.stringify(storeSnapshot));
    const record = {
        name,
        savedAt:   new Date().toISOString(),
        nodeCount: plain.nodes.length,
        edgeCount: plain.edges.length,
        areaCount: plain.areas.length,
        data:      plain,
    };
    const id = await wrap(tx(db, 'readwrite').add(record));
    return id;
}

export async function loadProject(id) {
    const db = await openDB();
    const record = await wrap(tx(db, 'readonly').get(id));
    if (!record) throw new Error(`Projekt ${id} nicht gefunden.`);
    return record.data;
}

export async function deleteProject(id) {
    const db = await openDB();
    await wrap(tx(db, 'readwrite').delete(id));
}
