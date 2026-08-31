/**
 * Modelle laden und lokal ablegen (Sprint I, Stufe 5).
 *
 * Herausgelöst aus `IfcViewer.vue`, wo Dateiladen, IndexedDB-Ablage und die
 * Liste „zuletzt geöffnet" zwischen Schnitt, Messen und Tastatur lagen. Der
 * sauberste Schnitt der Vue-Seite: keine dieser Funktionen wird von einem
 * anderen Belang gelesen.
 *
 * Hausstil wie `composables/useScreenProjection.js` und
 * `flood-2D/composables/useSectionTool.js`: ein Optionsobjekt mit
 * destrukturierten Abhängigkeiten, Rückgabe ein flaches Objekt aus Refs UND
 * Handlern, Inhalt deutsch. **Composable = Verhalten, Store = Zustand.**
 *
 * Zwei Dinge bleiben bewusst HIER und wandern nicht in den Store:
 *
 *   `recentModels` ist ein Abbild von `repo.listBlobs('model:')` — abgeleitet,
 *   nicht gehalten. Im Store läge eine zweite Wahrheit neben der Ablage.
 *
 *   `_modelIdentity` schlüsselt auf `model.modelId`, und die vergibt die
 *   Engine je Sitzung neu. Persistiert wäre die Karte nach dem Neuladen voller
 *   toter Einträge.
 */

import { ref } from 'vue';
import { fehlerLesbar, repo } from '../services/RepoFacade.js';
import { computeModelIdentity } from '../services/ModelIdentity.js';

/** Wie viele Modelle die lokale Ablage höchstens behält. */
const MAX_RECENT_MODELS = 5;

export function useModellAblage({ engine, ifc, cde, onModelLoaded }) {
    /** Läuft gerade ein Ladevorgang? Sperrt die Knöpfe und zeigt den Schleier. */
    const loading = ref(false);
    /** [{ key, meta, size }] aus der lokalen Ablage, neueste zuerst. */
    const recentModels = ref([]);
    /** Meldung der Projekt-Ablage (z. B. abgelehnter Upload). null = nichts zu sagen. */
    const ablageHinweis = ref(null);
    /** engine-modelId → { key, projectGlobalId, sha256, name } */
    const _modelIdentity = new Map();

    /**
     * Gemeinsamer Lade-Pfad für Datei-Dialog, „Zuletzt geöffnet" und Deep-Link:
     * Identität (GlobalId/SHA-256) berechnen, Modell laden, Oberfläche
     * auffrischen, Blob in die lokale Ablage legen.
     */
    async function _ladeBytes(buf, name, { persist = true } = {}) {
        const bytes = new Uint8Array(buf);
        const identity = await computeModelIdentity(bytes, name);
        const model = await engine.value.loadIfc(bytes, name);
        if (model?.modelId) _modelIdentity.set(model.modelId, { ...identity, name });
        await onModelLoaded();
        if (persist) _ablegen(bytes, name, identity);

        // Bei aktivem Projekt ins Dokumentregister aufnehmen. Mit Server-Backend
        // liest das nur nach — die Datei ist durch `_ablegen` schon hochgeladen
        // und steht im Manifest.
        if (cde.auftrag?.id && identity.sha256) {
            cde.registerModel({
                sha256: identity.sha256,
                name,
                size: bytes.byteLength,
                projectGlobalId: identity.projectGlobalId,
            }).catch((fehler) => {
                // Frueher: `.catch(() => {})` mit dem Vermerk „Register
                // optional". Es IST nicht optional — wer eine IFC ins Projekt
                // laedt, will sie im Projekt haben. Ein verschluckter 401 sah
                // aus wie „es passiert gar nichts".
                ablageHinweis.value = `Nicht ins Projektregister aufgenommen: ${fehlerLesbar(fehler).text}`;
            });
        } else if (!cde.auftrag?.id) {
            // Kein Fehler, aber auch kein Erfolg: das Modell ist nur lokal.
            // Ohne diesen Satz sucht der Nutzer den Fehler bei sich.
            ablageHinweis.value = 'Kein Auftrag gewaehlt — das Modell liegt nur lokal im Browser.';
        }
    }

    /** Ein Ladevorgang mit Sperre und Fehlermeldung. */
    async function _mitSperre(was, arbeit) {
        if (loading.value) return false;
        loading.value = true;
        try {
            await arbeit();
            return true;
        } catch (fehler) {
            console.error(`[CDE] ${was}:`, fehler);
            ablageHinweis.value = `${was} fehlgeschlagen: ${fehler?.message ?? fehler}`;
            return false;
        } finally {
            loading.value = false;
        }
    }

    async function onFileUpload(e) {
        const datei = e.target.files?.[0];
        if (!datei) return;
        await _mitSperre('IFC laden', async () => _ladeBytes(await datei.arrayBuffer(), datei.name));
        e.target.value = '';
    }

    async function onFileUploadAdd(e) {
        const datei = e.target.files?.[0];
        if (!datei) return;
        await _mitSperre('IFC hinzufügen', async () => _ladeBytes(await datei.arrayBuffer(), datei.name));
        e.target.value = '';
    }

    // ── Lokale Ablage (IndexedDB bzw. Projektordner via RepoFacade) ──────────

    async function _ablegen(bytes, name, identity) {
        if (!identity?.sha256) return;      // ohne Hash keine stabile Adresse
        try {
            const ok = await repo.setBlob(`model:${identity.sha256}`, new Blob([bytes]), {
                name,
                size: bytes.byteLength,
                savedAt: Date.now(),
                projectGlobalId: identity.projectGlobalId,
                key: identity.key,
            });
            if (!ok) {
                // `false` heisst zweierlei: ein Backend ohne Blob-Faehigkeit
                // (dann ist Schweigen richtig) oder ein gescheiterter
                // Serverzugriff (dann ist es falsch). Der Grund unterscheidet
                // die beiden Faelle — nur mit ihm wird gemeldet.
                const grund = repo.letzterFehler;
                if (grund) {
                    ablageHinweis.value = `Nicht in den Projektordner geladen: ${grund.text}`;
                    repo.fehlerQuittieren();
                }
                return;
            }
            // Ablage deckeln: nur die letzten N behalten.
            const alle = (await repo.listBlobs('model:'))
                .sort((a, b) => (b.meta?.savedAt ?? 0) - (a.meta?.savedAt ?? 0));
            for (const row of alle.slice(MAX_RECENT_MODELS)) await repo.deleteBlob(row.key);
            await aktualisiereZuletzt();
        } catch (e) {
            // Der Server lehnt einen zweiten Upload gleichen NAMENS mit 422 ab.
            // Das ist kein technischer Fehler, sondern eine Aussage an den
            // Nutzer — sonst steht das Modell im Viewer, aber nicht im Projekt.
            if (e?.name === 'CdeUploadAbgelehnt') {
                ablageHinweis.value = `Nicht ins Projekt übernommen: ${e.message}`;
                return;
            }
            console.warn('[CDE] Lokale Modell-Ablage fehlgeschlagen:', e?.message ?? e);
        }
    }

    async function aktualisiereZuletzt() {
        recentModels.value = (await repo.listBlobs('model:'))
            .sort((a, b) => (b.meta?.savedAt ?? 0) - (a.meta?.savedAt ?? 0));
    }

    async function openRecent(row) {
        await _mitSperre('Modell aus der Ablage laden', async () => {
            const abgelegt = await repo.getBlob(row.key);
            if (!abgelegt?.blob) throw new Error('Blob nicht gefunden');
            await _ladeBytes(await abgelegt.blob.arrayBuffer(),
                abgelegt.meta?.name ?? 'model', { persist: false });
            // savedAt auffrischen, damit die Liste nach letzter Nutzung sortiert
            // bleibt — bewusst ohne await, das Modell steht schon.
            repo.setBlob(row.key, abgelegt.blob, { ...abgelegt.meta, savedAt: Date.now() })
                .then(aktualisiereZuletzt);
        });
    }

    async function deleteRecent(row) {
        await repo.deleteBlob(row.key);
        await aktualisiereZuletzt();
    }

    /** Modell aus dem Dokumentregister öffnen (CdeView ruft per Template-Ref). */
    async function openBySha(sha256) {
        await openRecent({ key: `model:${sha256}` });
    }

    /**
     * Modell aus dem Projektordner laden (Deep-Link aus dem Cockpit).
     * Der Pfad ist relativ zu 1_Projekte; die Datei kommt über /projects/file.
     */
    async function openFromProjectPath(pfad) {
        // Beim Deep-Link ist die Engine oft noch im Aufbau — kurz warten statt
        // scheitern. 60 × 250 ms decken auch einen kalten WASM-Start ab.
        for (let i = 0; i < 60 && !engine.value; i += 1) {
            await new Promise((r) => setTimeout(r, 250));
        }
        if (!engine.value) throw new Error('viewer-engine nicht bereit');
        const { default: api } = await import('@/services/api');
        const antwort = await api.get('/projects/file',
            { params: { path: pfad }, responseType: 'arraybuffer' });
        const name = String(pfad).split('/').pop() || 'modell.ifc';
        await _ladeBytes(antwort.data, name);
    }

    /** sha256 des zuerst geladenen Modells — für Wasserzeichen und Register. */
    function geladeneModellSha() {
        const erstes = engine.value?.getModelList()?.[0];
        return erstes ? (_modelIdentity.get(erstes.modelId)?.sha256 ?? null) : null;
    }

    /** Stabile Identität eines Modells (GlobalId > sha > Name). */
    function identitaet(modelId) {
        return _modelIdentity.get(modelId) ?? null;
    }

    function vergiss(modelId) {
        _modelIdentity.delete(modelId);
    }

    return {
        loading, recentModels, ablageHinweis,
        onFileUpload, onFileUploadAdd,
        openRecent, deleteRecent, openBySha, openFromProjectPath,
        aktualisiereZuletzt, geladeneModellSha, identitaet, vergiss,
    };
}

/** Bytes menschenlesbar. Frei, damit die Schale sie im Template nutzen kann. */
export function fmtBytes(n) {
    if (!Number.isFinite(n) || n <= 0) return '';
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function fmtDate(ts) {
    if (!ts) return '';
    return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
