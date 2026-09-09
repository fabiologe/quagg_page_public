/**
 * Der Kernel im Worker (Teil XIV, G5) — dieselben Ops, ein anderer Thread.
 *
 * Kein eigener Katalog, keine eigene Logik: der Worker legt `erzeugeKernel`
 * ohne Backends an und rechnet inline. Was zurückgeht, wird ÜBERTRAGEN
 * (Transferables), nicht kopiert — die Puffer gehören danach dem Hauptthread.
 */
import { erzeugeKernel } from './Kernel.js';

const kernel = erzeugeKernel();

function _puffer(wert, aus = []) {
    if (!wert || typeof wert !== 'object') return aus;
    if (ArrayBuffer.isView(wert)) { aus.push(wert.buffer); return aus; }
    for (const v of Object.values(wert)) _puffer(v, aus);
    return aus;
}

self.onmessage = async (ev) => {
    const { id, op, eingaben, parameter } = ev.data ?? {};
    try {
        const r = await kernel.op(op, eingaben, parameter);
        self.postMessage({ id, ergebnis: r.ergebnis, warnungen: r.warnungen }, _puffer(r.ergebnis));
    } catch (fehler) {
        self.postMessage({ id, fehler: fehler?.message ?? String(fehler) });
    }
};
