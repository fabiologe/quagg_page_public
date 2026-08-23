/**
 * Service Worker des PDF-Editors — Scope /pdf-editor, sonst NICHTS.
 *
 * Sicherheitsarchitektur (Plan, Stufe 7): Die Registrierung in
 * PdfEditorView verengt den Scope auf /pdf-editor; dieser Worker
 * kontrolliert also nie andere Seiten der Produktions-Site. Precache ist
 * bewusst winzig (index.html, Manifest, Editor-Icons — NICHT die
 * IFC-/Flood-Chunks); die content-gehashten /assets/-Dateien kommen zur
 * Laufzeit in einen CacheFirst-Bestand, sobald sie einmal geladen wurden.
 * Damit funktioniert offline genau das, was einmal online besucht war.
 */

import { precacheAndRoute, cleanupOutdatedCaches, matchPrecache } from 'workbox-precaching';
import { registerRoute, setCatchHandler } from 'workbox-routing';
import { CacheFirst, NetworkFirst, NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

self.skipWaiting();
self.addEventListener('activate', () => self.clients.claim());

// Android-Share-Target: „Teilen → Quagg PDF" POSTet die PDF hierher.
// Eigener fetch-Listener VOR den Workbox-Routen (die matchen ohnehin nur
// GET); die Datei wandert in den Cache, die Seite holt sie über
// services/GeteilteDatei.js wieder ab.
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'POST' || url.pathname !== '/pdf-editor/teilen') return;
    event.respondWith((async () => {
        try {
            const formular = await event.request.formData();
            const datei = formular.get('pdf');
            if (datei) {
                const cache = await caches.open('pdfed-geteilt');
                await cache.put('/geteilte-datei', new Response(datei, {
                    headers: {
                        'Content-Type': 'application/pdf',
                        'X-Datei-Name': datei.name || 'Geteilt.pdf',
                    },
                }));
            }
        } catch { /* leer geteilt — Startseite reicht */ }
        return Response.redirect('/pdf-editor?geteilt=1', 303);
    })());
});

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Navigationen unter /pdf-editor: frisch, wenn das Netz da ist; sonst der
// precachte Index (SPA-Fallback wie nginx es online macht).
registerRoute(
    ({ request, url }) => request.mode === 'navigate' && url.pathname.startsWith('/pdf-editor'),
    new NetworkFirst({ cacheName: 'pdfed-nav', networkTimeoutSeconds: 3 }),
);

// Gebaute Assets sind content-gehasht → einmal geholt, immer gültig.
// Alte Hashes bleiben bis zur Verdrängung liegen — deshalb funktioniert
// auch ein veralteter Offline-Index weiter.
registerRoute(
    ({ url }) => url.pathname.startsWith('/assets/'),
    new CacheFirst({
        cacheName: 'pdfed-assets',
        plugins: [new ExpirationPlugin({ maxEntries: 80 })],
    }),
);

// APIs niemals cachen.
registerRoute(
    ({ url }) => /^\/(api|FastAPI|flood2dpod)\//.test(url.pathname),
    new NetworkOnly(),
);

setCatchHandler(async ({ request }) => {
    if (request.mode === 'navigate') {
        const index = await matchPrecache('index.html');
        if (index) return index;
    }
    return Response.error();
});
