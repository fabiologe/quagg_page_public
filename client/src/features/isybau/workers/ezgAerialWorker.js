/**
 * ezgAerialWorker.js — Luftbild-Kachel-Fetch + Mosaik-Stitching + PNG-Encode
 * im Web Worker (OffscreenCanvas).
 *
 * Lief vorher komplett auf dem Main-Thread (EzgImageryService.js). Profiling
 * (Playwright, monkey-gepatchte canvas-APIs) zeigte: 170 drawImage()-Aufrufe
 * zusammen nur ~43ms, aber das abschließende canvas.toBlob('image/png') für
 * ein ~11-Megapixel-Mosaik (3328×3328px, 13×13 Kacheln) allein ~7,4s — mit
 * Abstand der größte Anteil an der gesamten Ladezeit, während dem die
 * LoadingOverlay-Animation sichtbar hängen blieb (Nutzer-Feedback). fetch()
 * und OffscreenCanvas.convertToBlob() sind im Worker-Kontext ohne Weiteres
 * verfügbar — die komplette Pipeline läuft jetzt off-main-thread, das
 * kodierte PNG geht als Transferable ArrayBuffer zurück (zero-copy).
 *
 * Protokoll:
 *   → { type:'fetch', reqId, tileUrl, tileSize, z, xMin, yMin, tilesX, tilesY }
 *   ← { type:'result', reqId, buffer:ArrayBuffer, mimeType } [transfer]
 *   ← { type:'error', reqId, message }
 */

async function fetchTileBitmap(tileUrl, z, x, y) {
    const response = await fetch(`${tileUrl}/${z}/${y}/${x}`);
    if (!response.ok) {
        throw new Error(`Luftbild-Kachel ${z}/${y}/${x} fehlgeschlagen (HTTP ${response.status})`);
    }
    const blob = await response.blob();
    return createImageBitmap(blob);
}

self.onmessage = async (e) => {
    const msg = e.data;
    if (msg.type !== 'fetch') return;
    const { reqId, tileUrl, tileSize, z, xMin, yMin, tilesX, tilesY } = msg;

    try {
        const canvas = new OffscreenCanvas(tilesX * tileSize, tilesY * tileSize);
        const ctx = canvas.getContext('2d');

        const fetches = [];
        for (let ty = 0; ty < tilesY; ty++) {
            for (let tx = 0; tx < tilesX; tx++) {
                const destTx = tx, destTy = ty;
                fetches.push(
                    fetchTileBitmap(tileUrl, z, xMin + tx, yMin + ty).then((bitmap) => {
                        ctx.drawImage(bitmap, destTx * tileSize, destTy * tileSize);
                    })
                );
            }
        }
        await Promise.all(fetches);

        const blob = await canvas.convertToBlob({ type: 'image/png' });
        const buffer = await blob.arrayBuffer();
        self.postMessage({ type: 'result', reqId, buffer, mimeType: blob.type }, [buffer]);
    } catch (err) {
        self.postMessage({ type: 'error', reqId, message: err.message || String(err) });
    }
};
