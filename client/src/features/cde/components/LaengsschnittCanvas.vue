<template>
  <div class="ls-host" ref="hostRef">
    <canvas
      ref="cvRef"
      class="ls-canvas"
      @pointerdown="onZeigerAb"
      @pointermove="onZeigerBewegt"
      @pointerup="onZeigerAuf"
      @pointercancel="onZeigerAuf"
      @wheel.prevent="onRad"
      @dblclick="passendEinstellen"
    ></canvas>

    <!-- Ohne Strang gibt es nichts zu schneiden — sagen, was fehlt. -->
    <div v-if="!sicht" class="ls-leer">
      <CdeIcon name="laengsschnitt" :size="26" />
      <p>Im 3D oder Lageplan eine <strong>Haltung wählen</strong> —
         der Längsschnitt zeigt ihren Strang.</p>
    </div>

    <div v-else class="ls-info">
      <span>{{ sicht.segmente.length }} Haltung{{ sicht.segmente.length === 1 ? '' : 'en' }}
        · {{ sicht.gesamt.toFixed(1) }} m · Überhöhung {{ UEBERHOEHUNG }} : 1</span>
      <span v-if="cursor" class="ls-cursor">
        St. {{ cursor.s.toFixed(1) }} m · {{ cursor.h.toFixed(2) }} m NN
      </span>
    </div>
  </div>
</template>

<script setup>
/**
 * LaengsschnittCanvas — der Host des Längsschnitt-Modus (Stufe 17.1).
 *
 * Der Modus stand seit Sprint P im Katalog, war seit 14.1 freigeschaltet —
 * und zeigte eine LEERE Fläche: nie hat ihm jemand einen Host gebaut. Hier
 * ist er. Gezeigt wird der Strang des GEWÄHLTEN Bauteils (die Einordnung
 * trägt ihn seit 14.5 in Fliessrichtung), als Sohllinie über der
 * Stationierung, in NN, mit fester Überhöhung — und daneben GESTRICHELT die
 * geforderte Sohle aus dem Journal: „geliefert = Forderung" als Bild.
 *
 * Die Navigation ist DIESELBE Gestenmaschine wie im Lageplan (T2) — nur die
 * Abbildung ist eine andere: x ist die Station, z die Höhe. Genau dafür
 * rechnet `usePlanGesten` ausschliesslich über das injizierte `zuWelt`.
 *
 * Farben kommen zur ZEICHENZEIT aus den Tokens (getComputedStyle) — ein
 * Canvas kennt kein CSS, aber seine Farben dürfen trotzdem nicht am
 * Theme vorbei hartkodiert sein.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import CdeIcon from './ui/CdeIcon.vue';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useIfcStore } from '../stores/useIfcStore.js';
import { baueSicht, griffe, sohlZugEintraege, cdeZugEintraege } from '../services/LaengsschnittSicht.js';
import { useCdeStore } from '../stores/useCdeStore.js';
import { useViewerApi } from '../composables/viewerApi.js';
import { erzeugePlanGesten } from '../composables/usePlanGesten.js';

const UEBERHOEHUNG = 10;          // Höhen 10-fach — üblich im Kanal-Längsschnitt
const RAND_PX = 46;               // Platz für Achsbeschriftung

const hostRef = ref(null);
const cvRef = ref(null);
const bearbeitung = useBearbeitung();
const aenderungen = useAenderungen();
const ifc = useIfcStore();
const cde = useCdeStore();
const api = useViewerApi();

/** Blattlage: Station/Höhe in der Bildmitte + Lupe (px je Station-Meter). */
const mitte = ref({ s: 0, h: 0 });
const pxProM = ref(4);
const cursor = ref(null);

/**
 * Der Griff-Zug (17.2): welche Segment-Enden hängen am Finger, und auf
 * welcher Höhe stehen sie gerade. Die VORSCHAU lebt nur hier — ins Journal
 * geht beim Loslassen EIN Vorgang mit absoluten Zielhöhen.
 * Geliefertes wird dabei zur FORDERUNG (gestrichelte Linie), ein
 * CDE-eigenes Rohr wird ECHT fortgeschrieben (Bauplan + Neuaufbau) —
 * am gemischten Knoten beides mit EINEM Griff (17.3b).
 */
const zug = ref(null);            // { enden, hoehe, station } | null
let griffListe = [];              // Bildkoordinaten, je zeichne() neu

const sicht = computed(() => {
    const b = bearbeitung.bauteil;
    if (!b?.strang?.length) return null;
    // `geometrieStand` gehört in die Abhängigkeit: nach einer angewandten
    // Geometrieänderung liest der Viewer die Achsen neu, die Einordnung
    // des gewählten Bauteils folgt — das computed soll dann mitziehen.
    void ifc.geometrieStand;
    return baueSicht({
        strang: b.strang,
        hoehenversatz: b.hoehenversatz ?? 0,
        parametrikStand: aenderungen.wirksamerStand('parametrik'),
    });
});

// ── Abbildung Bildschirm ↔ (Station, Höhe) ──────────────────────────────────
function _kasten() { return cvRef.value?.getBoundingClientRect?.() ?? null; }

function zuWelt(clientX, clientY) {
    const k = _kasten();
    if (!k) return null;
    const cx = k.left + k.width / 2;
    const cy = k.top + k.height / 2;
    return {
        x: mitte.value.s + (clientX - cx) / pxProM.value,
        z: mitte.value.h - (clientY - cy) / (pxProM.value * UEBERHOEHUNG),
    };
}
/** Wirksame Höhe eines Segment-Endes — mit laufender Zug-Vorschau. */
function _effektiv(seg, ende) {
    const imZug = zug.value?.enden?.some(e => e.globalId === seg.globalId && e.ende === ende);
    if (imZug) return zug.value.hoehe;
    const eff = seg.gefordert ?? seg.geliefert;
    return ende === 'A' ? eff.hA : eff.hE;
}

function zuBild(s, h, k) {
    const cx = k.width / 2;
    const cy = k.height / 2;
    return {
        x: cx + (s - mitte.value.s) * pxProM.value,
        y: cy - (h - mitte.value.h) * pxProM.value * UEBERHOEHUNG,
    };
}

const gesten = erzeugePlanGesten({
    zuWelt,
    holeMitte: () => ({ x: mitte.value.s, z: mitte.value.h }),
    setzeMitte: (m) => { mitte.value = { s: m.x, h: m.z }; baldZeichnen(); },
    holeZoom: () => pxProM.value,
    setzeZoom: (v) => { pxProM.value = Math.min(200, Math.max(0.2, v)); baldZeichnen(); },
    holeBuehnenPunkt: () => {
        const k = _kasten();
        return k ? { x: k.left + k.width / 2, y: k.top + k.height / 2 } : { x: 0, y: 0 };
    },
});

function onZeigerAb(ev) {
    cvRef.value?.setPointerCapture?.(ev.pointerId);

    // Griff zuerst — nur im Bearbeiten-Modus, und nur wenn kein Zug läuft.
    if (bearbeitung.modusAn && !zug.value) {
        const k = _kasten();
        const radius = ev.pointerType === 'touch' ? 22 : 12;   // T4-Regel
        let bester = null;
        let dBest = radius;
        for (const g of griffListe) {
            const d = Math.hypot(k.left + g.x - ev.clientX, k.top + g.y - ev.clientY);
            if (d < dBest) { dBest = d; bester = g; }
        }
        if (bester) {
            zug.value = { enden: bester.enden, hoehe: bester.hoehe, station: bester.station };
            baldZeichnen();
            return;
        }
    }
    gesten.zeigerAb(ev.pointerId, ev.clientX, ev.clientY, ev.pointerType || 'mouse');
}
function onZeigerBewegt(ev) {
    const w = zuWelt(ev.clientX, ev.clientY);
    cursor.value = w ? { s: w.x, h: w.z } : null;
    if (zug.value) {
        // Nur die HÖHE folgt dem Finger — die Station steht (der Schacht
        // wandert im Längsschnitt nicht seitwärts).
        if (w) { zug.value = { ...zug.value, hoehe: w.z }; baldZeichnen(); }
        return;
    }
    gesten.zeigerBewegt(ev.pointerId, ev.clientX, ev.clientY);
}
async function onZeigerAuf(ev) {
    cvRef.value?.releasePointerCapture?.(ev.pointerId);
    if (zug.value) {
        const z = zug.value;
        zug.value = null;
        await zugAbschliessen(z, ev.type === 'pointercancel');
        baldZeichnen();
        return;
    }
    gesten.zeigerAuf(ev.pointerId);
}

/**
 * Der Zug wird zum VORGANG: je betroffenem Segment eine volle Rollen-Karte
 * (absolut, NN). „Geliefert = Forderung": nichts bewegt sich am Modell, die
 * gestrichelte Linie im Schnitt IST die Wirkung — und der Änderungsbericht
 * trägt sie zum Planer.
 */
async function zugAbschliessen(z, abgebrochen) {
    if (abgebrochen || !sicht.value) return;
    // Unter 5 mm ist es ein Tipp, kein Zug.
    const vorher = griffListe.find(g => g.station === z.station)?.hoehe;
    if (Number.isFinite(vorher) && Math.abs(z.hoehe - vorher) < 0.005) return;

    // Am gemischten Knoten zieht EIN Griff beides — jede Seite auf ihrem
    // Weg (17.3b): geliefert wird eine FORDERUNG (parametrik, gestrichelte
    // Linie), Eigenes wird ECHT (Bauplan fortgeschrieben, Neuaufbau).
    const geliefert = z.enden.filter(e => !String(e.globalId).startsWith('cde-'));
    const eigene = z.enden.filter(e => String(e.globalId).startsWith('cde-'));
    const erzStand = aenderungen.wirksamerStand('erzeugt');
    const eintraege = [
        ...sohlZugEintraege(sicht.value, geliefert, z.hoehe),
        ...cdeZugEintraege(eigene, z.hoehe, {
            bauplanVon: (gid) => erzStand.get(gid),
            hoehenversatz: bearbeitung.bauteil?.hoehenversatz ?? 0,
        }),
    ];
    if (!eintraege.length) return;
    const vorgang = eintraege.length > 1
        ? { vorgang: `vg-ls-${Date.now().toString(36)}`, vorgangTitel: 'Sohle im Längsschnitt gezogen' }
        : {};
    const geschrieben = [];
    for (const e of eintraege) {
        const drin = await aenderungen.eintragen({
            ...e, ...vorgang,
            wer: cde.bearbeiter || '',
            modellSha: api.getLoadedModelSha?.() ?? null,
            ...(e.art === 'parametrik'
                ? { basis: api.lieferstandVon?.(e.globalId) ?? null, modell: 'geliefert' }
                : {}),
        });
        if (drin) geschrieben.push(drin);
    }
    // ANWENDEN — über denselben Weg wie jede andere Anwendung (Gesetz 7):
    // die Forderung wird nur gemeldet, der fortgeschriebene Bauplan baut
    // das CDE-Modell neu, und der Hub zieht Achsen, Netz und Plan nach.
    if (geschrieben.length) {
        await api.wendeEintragAn?.(geschrieben.length > 1 ? geschrieben : geschrieben[0]);
    }
}
function onRad(ev) {
    // Zoom um den Zeiger: die Station unter der Maus bleibt unter der Maus.
    const vorher = zuWelt(ev.clientX, ev.clientY);
    pxProM.value = Math.min(200, Math.max(0.2, pxProM.value * (ev.deltaY > 0 ? 0.88 : 1 / 0.88)));
    const nachher = zuWelt(ev.clientX, ev.clientY);
    if (vorher && nachher) {
        mitte.value = {
            s: mitte.value.s + (vorher.x - nachher.x),
            h: mitte.value.h + (vorher.z - nachher.z),
        };
    }
    baldZeichnen();
}

function passendEinstellen() {
    const s = sicht.value;
    const k = _kasten();
    if (!s || !k) return;
    const spanS = Math.max(s.gesamt, 1);
    const spanH = Math.max((s.hMax - s.hMin) * UEBERHOEHUNG, 1);
    pxProM.value = Math.min(
        200,
        Math.max(0.2, Math.min((k.width - 2 * RAND_PX) / spanS, (k.height - 2 * RAND_PX) / spanH)),
    );
    mitte.value = { s: s.gesamt / 2, h: (s.hMin + s.hMax) / 2 };
    baldZeichnen();
}

// ── Zeichnen ────────────────────────────────────────────────────────────────
let rafId = 0;
function baldZeichnen() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => { rafId = 0; zeichne(); });
}

function _token(name) {
    return getComputedStyle(hostRef.value ?? document.documentElement)
        .getPropertyValue(name).trim() || undefined;
}

/** Runde Schrittweite, damit ~`zielPx` Pixel dazwischen liegen. */
function _schritt(proEinheitPx, zielPx = 70) {
    const roh = zielPx / Math.max(proEinheitPx, 1e-9);
    const zehner = Math.pow(10, Math.floor(Math.log10(roh)));
    for (const f of [1, 2, 5, 10]) if (zehner * f >= roh) return zehner * f;
    return zehner * 10;
}

function zeichne() {
    const cv = cvRef.value;
    const k = _kasten();
    if (!cv || !k) return;
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(k.width * dpr) || cv.height !== Math.round(k.height * dpr)) {
        cv.width = Math.round(k.width * dpr);
        cv.height = Math.round(k.height * dpr);
    }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, k.width, k.height);

    const farbe = {
        linie: _token('--cde-line'),
        linieStark: _token('--cde-line-strong'),
        text: _token('--cde-text'),
        textDim: _token('--cde-text-dim'),
        sohle: _token('--cde-accent'),
        forderung: _token('--cde-warn'),
        hintergrund: _token('--cde-bg'),
    };
    const s = sicht.value;
    if (!s) return;

    // Gitter: runde NN-Höhen und runde Stationen.
    ctx.font = '11px system-ui, sans-serif';
    const hSchritt = _schritt(pxProM.value * UEBERHOEHUNG, 44);
    const sSchritt = _schritt(pxProM.value, 90);
    const wLinks = zuWelt(k.left, k.top + k.height);
    const wRechts = zuWelt(k.left + k.width, k.top);
    if (!wLinks || !wRechts) return;

    ctx.strokeStyle = farbe.linie;
    ctx.fillStyle = farbe.textDim;
    ctx.lineWidth = 1;
    for (let h = Math.ceil(wLinks.z / hSchritt) * hSchritt; h <= wRechts.z; h += hSchritt) {
        const y = zuBild(0, h, k).y;
        ctx.beginPath(); ctx.moveTo(RAND_PX, y); ctx.lineTo(k.width, y); ctx.stroke();
        ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText(`${h.toFixed(hSchritt < 1 ? 1 : 0)} m NN`, 4, y - 2);
    }
    for (let st = Math.ceil(wLinks.x / sSchritt) * sSchritt; st <= wRechts.x; st += sSchritt) {
        const x = zuBild(st, 0, k).x;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, k.height - RAND_PX / 2); ctx.stroke();
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(`${st.toFixed(0)}`, x, k.height - 6);
    }

    // Knoten (Schachtgrenzen): senkrechte Marken.
    ctx.strokeStyle = farbe.linieStark;
    for (const kn of s.knoten) {
        const x = zuBild(kn.s, 0, k).x;
        if (x < RAND_PX - 20 || x > k.width + 20) continue;
        ctx.beginPath(); ctx.moveTo(x, 8); ctx.lineTo(x, k.height - RAND_PX / 2); ctx.stroke();
    }

    // Geforderte Sohle GESTRICHELT — samt laufender Zug-Vorschau. Unter der
    // Vollinie gezeichnet, damit die Lieferung das letzte Wort im Bild behält.
    ctx.strokeStyle = farbe.forderung;
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    for (const seg of s.segmente) {
        const hA = _effektiv(seg, 'A');
        const hE = _effektiv(seg, 'E');
        if (hA === seg.geliefert.hA && hE === seg.geliefert.hE) continue;
        const a = zuBild(seg.s0, hA, k);
        const e = zuBild(seg.s1, hE, k);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(e.x, e.y); ctx.stroke();
    }
    ctx.setLineDash([]);

    // Gelieferte Sohle: die Hauptlinie, gewähltes Bauteil betont.
    for (const seg of s.segmente) {
        const a = zuBild(seg.s0, seg.geliefert.hA, k);
        const e = zuBild(seg.s1, seg.geliefert.hE, k);
        const gewaehlt = seg.globalId === bearbeitung.bauteil?.globalId;
        ctx.strokeStyle = farbe.sohle;
        ctx.lineWidth = gewaehlt ? 3.5 : 2;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(e.x, e.y); ctx.stroke();

        // Beschriftung, wenn Platz ist: Name · DN · Gefälle.
        const breite = e.x - a.x;
        if (breite > 70) {
            ctx.fillStyle = gewaehlt ? farbe.text : farbe.textDim;
            ctx.textAlign = 'center'; ctx.textBaseline = 'top';
            const teile = [seg.name || seg.globalId];
            if (seg.dn) teile.push(`DN ${seg.dn}`);
            if (Number.isFinite(seg.gefaellePromille)) teile.push(`${seg.gefaellePromille.toFixed(1)} ‰`);
            ctx.fillText(teile.join(' · '), (a.x + e.x) / 2, Math.max(a.y, e.y) + 8);
        }
    }

    // Griffe (17.2) — nur im Bearbeiten-Modus, nur an GELIEFERTEN Segmenten.
    griffListe = [];
    if (bearbeitung.modusAn) {
        for (const g of griffe(s)) {
            // Seit 17.3b sind auch CDE-Enden greifbar — „Eigenes = echt".
            const enden = g.enden;
            const imZug = zug.value?.station === g.station;
            const hoehe = imZug ? zug.value.hoehe : g.hoehe;
            const p = zuBild(g.station, hoehe, k);
            griffListe.push({ x: p.x, y: p.y, station: g.station, hoehe: g.hoehe, enden });
            ctx.beginPath();
            ctx.arc(p.x, p.y, imZug ? 7 : 5, 0, Math.PI * 2);
            ctx.fillStyle = imZug ? farbe.forderung : farbe.hintergrund;
            ctx.fill();
            ctx.strokeStyle = imZug ? farbe.forderung : farbe.sohle;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        if (zug.value) {
            const p = zuBild(zug.value.station, zug.value.hoehe, k);
            ctx.fillStyle = farbe.text;
            ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.fillText(`${zug.value.hoehe.toFixed(2)} m NN`, p.x + 12, p.y);
        }
    }
}

// ── Lebenslauf ──────────────────────────────────────────────────────────────
let beobachter = null;
onMounted(() => {
    beobachter = new ResizeObserver(baldZeichnen);
    if (hostRef.value) beobachter.observe(hostRef.value);
    passendEinstellen();
});
onBeforeUnmount(() => {
    beobachter?.disconnect();
    if (rafId) cancelAnimationFrame(rafId);
});

// Neuer Strang → einpassen; Journal/Geometrie → neu zeichnen.
watch(() => bearbeitung.bauteil?.globalId, () => { passendEinstellen(); });
watch(sicht, baldZeichnen);
</script>

<style scoped>
.ls-host {
  position: absolute; inset: 0;
  background: var(--cde-bg);
}
.ls-canvas {
  position: absolute; inset: 0; width: 100%; height: 100%;
  /* Die Fläche gehört dem Schnitt — Finger wischen den Strang, nie die Seite. */
  touch-action: none;
  cursor: grab;
}
.ls-canvas:active { cursor: grabbing; }

.ls-leer {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 0.6rem; color: var(--cde-text-dim);
  pointer-events: none;
  text-align: center; font-size: var(--cde-font-md);
}
.ls-leer p { max-width: 34ch; margin: 0; }

.ls-info {
  position: absolute; top: 0.5rem; left: 0.75rem; right: 0.75rem;
  display: flex; justify-content: space-between; gap: 1rem;
  color: var(--cde-text-dim); font-size: var(--cde-font-xs);
  pointer-events: none;
}
.ls-cursor { font-variant-numeric: tabular-nums; color: var(--cde-text); }
</style>
