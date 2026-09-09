/**
 * Das Meshpaket (Teil XIV, G7) — der Draht zum Server-Kernel.
 *
 * `[u32 kopfLaenge][Kopf-JSON utf8][Float64-Blöcke in Kopf-Reihenfolge]`
 *
 * Ein Block ist eine unindizierte Dreiecksliste (9 Zahlen je Dreieck) oder
 * eine Punktliste (3 je Punkt) — Float64, Welt, three-Konvention. Der Kopf
 * nennt je Block Name, Form und Zahl; `eingaben` ordnet die Schlitze der
 * Operation den Blöcken zu (Listen-Schlitze wie `koerper[]` zeigen auf
 * mehrere). Python liest es mit `np.frombuffer`; beide Seiten prüfen sich
 * gegen DIESELBE Golden-Datei (`test/fixtures/meshpaket_v1.bin`).
 *
 * Rein: kein Netz, keine Engine. Die Bytes gehören dem Aufrufer.
 */
export const MESHPAKET_VERSION = 1;
const DREIECKS_FORMEN = new Set(['mesh', 'koerper']);

function _werteJe(form) { return DREIECKS_FORMEN.has(form) ? 9 : 3; }

function _flach(wert, form) {
    if (DREIECKS_FORMEN.has(form)) return wert?.positions instanceof Float64Array ? wert.positions : Float64Array.from(wert?.positions ?? []);
    // Punktlisten: [{x,y,z}] → flach
    const p = wert?.punkte ?? wert ?? [];
    const out = new Float64Array(p.length * 3);
    p.forEach((q, i) => { out[i * 3] = q.x; out[i * 3 + 1] = q.y; out[i * 3 + 2] = q.z; });
    return out;
}

/**
 * @param {{op: string, parameter?: object, eingaben: object, formen: object}} auftrag
 *   `formen` sagt je Schlitz die Form ('koerper', 'koerper[]', 'mesh', 'linie').
 * @returns {ArrayBuffer}
 */
export function packeMeshpaket({ op, parameter = {}, eingaben = {}, formen = {} }) {
    const bloecke = [];
    const zuordnung = {};
    for (const [schlitz, wert] of Object.entries(eingaben)) {
        // Eine LISTE an einem Einzel-Schlitz reist als Liste (booleDifferenz
        // b = alle Rohre eines Strangs — der Server kettet in-process).
        const deklariert = String(formen[schlitz] ?? 'koerper');
        const form = (Array.isArray(wert) && !deklariert.endsWith('[]')) ? `${deklariert}[]` : deklariert;
        if (form.endsWith('[]')) {
            const einzeln = form.slice(0, -2);
            zuordnung[schlitz] = (wert ?? []).map((w, i) => {
                const name = `${schlitz}[${i}]`;
                bloecke.push({ name, form: einzeln, daten: _flach(w, einzeln) });
                return name;
            });
        } else {
            zuordnung[schlitz] = schlitz;
            bloecke.push({ name: schlitz, form, daten: _flach(wert, form) });
        }
    }
    const kopf = {
        version: MESHPAKET_VERSION, op, parameter, eingaben: zuordnung,
        bloecke: bloecke.map(b => (DREIECKS_FORMEN.has(b.form)
            ? { name: b.name, form: b.form, triCount: b.daten.length / 9 }
            : { name: b.name, form: b.form, n: b.daten.length / 3 })),
    };
    const kopfBytes = new TextEncoder().encode(JSON.stringify(kopf));
    const gesamt = 4 + kopfBytes.length + bloecke.reduce((s, b) => s + b.daten.byteLength, 0);
    const puffer = new ArrayBuffer(gesamt);
    const sicht = new DataView(puffer);
    sicht.setUint32(0, kopfBytes.length, true);
    new Uint8Array(puffer, 4, kopfBytes.length).set(kopfBytes);
    let off = 4 + kopfBytes.length;
    for (const b of bloecke) {
        // Float64 an ungerader Byte-Lage: kopieren über Uint8, nie über eine Float64-Sicht.
        new Uint8Array(puffer, off, b.daten.byteLength).set(new Uint8Array(b.daten.buffer, b.daten.byteOffset, b.daten.byteLength));
        off += b.daten.byteLength;
    }
    return puffer;
}

/**
 * @param {ArrayBuffer} puffer
 * @returns {{kopf: object, bloecke: Map<string, Float64Array>}}
 */
export function entpackeMeshpaket(puffer) {
    const bytes = puffer instanceof ArrayBuffer ? new Uint8Array(puffer) : new Uint8Array(puffer.buffer, puffer.byteOffset, puffer.byteLength);
    if (bytes.byteLength < 4) throw new Error('meshpaket: zu kurz');
    const n = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true);
    if (4 + n > bytes.byteLength) throw new Error('meshpaket: Kopf reicht über das Paket hinaus');
    const kopf = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + n)));
    if (kopf?.version !== MESHPAKET_VERSION) throw new Error(`meshpaket: Version ${kopf?.version} statt ${MESHPAKET_VERSION}`);
    let off = 4 + n;
    const bloecke = new Map();
    for (const b of kopf.bloecke ?? []) {
        const werte = Number(b.triCount ?? b.n ?? 0) * _werteJe(b.form);
        const groesse = werte * 8;
        if (off + groesse > bytes.byteLength) throw new Error(`meshpaket: Block „${b.name}" reicht über das Paket hinaus`);
        // Kopie in ein sauber ausgerichtetes Float64Array.
        const daten = new Float64Array(werte);
        new Uint8Array(daten.buffer).set(bytes.subarray(off, off + groesse));
        bloecke.set(String(b.name), daten);
        off += groesse;
    }
    if (off !== bytes.byteLength) throw new Error(`meshpaket: ${bytes.byteLength - off} Bytes ohne Block am Ende`);
    return { kopf, bloecke };
}

/** Der Kernel-Körper aus einer Server-Antwort — oder null. */
export function koerperAusAntwort(kopf, bloecke) {
    const e = kopf?.ergebnis;
    if (!e || e.form !== 'koerper') return null;
    const positions = bloecke.get(e.block ?? 'ergebnis');
    if (!positions) return null;
    return { positions, triCount: positions.length / 9, closed: !!e.closed, volumen: Number(e.volumen) || 0, warnungen: [] };
}
