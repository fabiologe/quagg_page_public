/**
 * TABLETLAUF (Teil XXXI, T0) — Bearbeiten mit dem Finger über Griffe, als Zahlen und Bilder.
 *
 * Emuliertes iPad hochkant (820 × 1180, Touch), ohne Projekt (lokale IndexedDB — schreibt in kein Projekt-Repo), gegen
 * einen laufenden Vite-Dev-Server (nie :3000 beenden). Zugang und Pfade aus der Umgebung:
 *
 *   QUAGG_NUTZER=… QUAGG_PW=… PUPPETEER_CORE=… CHROME=… BASIS=http://127.0.0.1:3001 AUS=/tmp/tablet \
 *   node docs/cde/bedienung/tabletlauf.cjs
 *
 * Ablauf: Modell laden → eine Wand über ein Kommando → antippen → wie viele Tipps bis zu einem Griff? → „Verschieben"
 * → Gizmo-Pfeil mit dem Finger ziehen (Long-Press 380 ms, dann Zug) → NACH DEM LOSLASSEN alle 250 ms: Journal
 * (Bauplan), Bild (Hülle des gebauten Teils), Geist, Griffe, Meldung — die Zeit, in der der Stand unklar ist.
 * Danach dasselbe an einem Stützpunkt.
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require(process.env.PUPPETEER_CORE || 'puppeteer-core');

const BASIS = process.env.BASIS || 'http://127.0.0.1:3001';
const AUS = process.env.AUS || path.resolve('tablet-aus');
const MODELL = path.resolve(__dirname, '../../../backend/app/ifc/tests/daten/erdbau_vergleich.ifc');
fs.mkdirSync(AUS, { recursive: true });
const zahlen = {};
const warte = (ms) => new Promise(z => setTimeout(z, ms));
let bild = 0;
const foto = (page, name) => page.screenshot({ path: path.join(AUS, `${String(++bild).padStart(2, '0')}_${name}.png`) });

/** Im Viewer ausgeführt (Dev-Build: Vue-Interna erreichbar), Ergebnis als JSON. */
async function v(page, ausdruck, arg = null) {
    return page.evaluate(async (ausdruck, arg) => {
        let st = null;
        for (const el of document.querySelectorAll('*')) { const s = el.__vueParentComponent?.setupState; if (s?.engine?.autor && s?.griffe) { st = s; break; } }
        const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
        let api = null;
        for (const el of document.querySelectorAll('*')) {
            for (let x = el.__vueParentComponent; x && !api; x = x.parent) for (const sy of Object.getOwnPropertySymbols(x.provides ?? {})) if (typeof x.provides[sy]?.eigenbauPaket === 'function') api = x.provides[sy];
            if (api) break;
        }
        const f = new Function('v', 'pinia', 'api', 'arg', `return (async () => { ${ausdruck} })();`);
        return JSON.stringify(await f(st, pinia, api, arg));
    }, ausdruck, arg).then(JSON.parse);
}
/** Ein Finger: aufsetzen, halten, ziehen, loslassen — über CDP, wie ein echter Touch. */
async function finger(page, cdp, von, nach, { halten = 500, schritte = 12 } = {}) {
    const pt = (p) => [{ x: p.x, y: p.y, id: 1, radiusX: 8, radiusY: 8, force: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(von) });
    await warte(halten);
    for (let i = 1; i <= schritte; i++) {
        const p = { x: von.x + (nach.x - von.x) * i / schritte, y: von.y + (nach.y - von.y) * i / schritte };
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(p) });
        await warte(40);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function tippe(page, cdp, p) {
    const pt = [{ x: p.x, y: p.y, id: 2, radiusX: 8, radiusY: 8, force: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt });
    await warte(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
/** Den Knopf mit genau diesem Text antippen (in einer zugeklappten Gruppe erst die Gruppe). */
async function knopf(page, cdp, text) {
    const r = await page.evaluate((text) => {
        const b = [...document.querySelectorAll('button, summary')].find(x => x.innerText.trim().replace(/\s+\d+$/, '') === text && x.getBoundingClientRect().width > 0);
        if (!b) return null;
        b.scrollIntoView({ block: 'center' });
        const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height };
    }, text);
    if (r) { await tippe(page, cdp, r); await warte(1200); }
    return r;
}

/** Der Stand nach dem Loslassen: Journal gegen Bild, je 250 ms. */
async function zeitreihe(page, gid, dauer = 12000) {
    const reihe = [];
    const t0 = Date.now();
    while (Date.now() - t0 < dauer) {
        const z = await v(page, `
            const plan = pinia._s.get('cde-aenderungen').wirksamerStand('erzeugt').get(arg);
            const p = (plan?.parameter?.punkte ?? []).map(q => Array.isArray(q) ? q[0] : q.x);
            const h = v.engine.autor.huellen?.get(arg);
            const geist = v.engine.overlay?._ebenen?.get('geist')?.children?.length ?? 0;
            return { journalX: p.length ? Math.min(...p) : null, bildX: h ? h.min.x : null, geist,
                     griffe: v.griffe.griffe.value.length, zug: !!v.griffe.zug.value,
                     meldung: document.querySelector('.kl-rueckmeldung, .cde-meldung, .tb-rueckmeldung')?.innerText?.trim() ?? '',
                     beschaeftigt: !!document.querySelector('.cde-busy, .is-busy, [aria-busy=true]'), scharf: pinia._s.get('cde-bearbeitung').scharfId,
                     tafel: document.querySelector('.tb-umbau') ? 'umbau' : document.querySelector('.tb-scharf') ? 'werkzeug' : document.querySelector('.tb-aufgabe, .tb-gruppe') ? 'liste' : '' };`, gid);
        reihe.push({ t: Date.now() - t0, ...z });
        await warte(250);
    }
    return reihe;
}
/** Wie lange Journal und Bild auseinanderlagen (ms) und was dazwischen zu sehen war. */
function auswerten(reihe, xVorher) {
    const neuImJournal = reihe.find(r => r.journalX != null && Math.abs(r.journalX - xVorher) > 0.05);
    const neuImBild = reihe.find(r => r.bildX != null && neuImJournal && Math.abs(r.bildX - neuImJournal.journalX) < 0.5);
    const zwischen = reihe.filter(r => neuImJournal && r.t >= neuImJournal.t && (!neuImBild || r.t < neuImBild.t));
    return {
        journalNachMs: neuImJournal?.t ?? null, bildNachMs: neuImBild?.t ?? null,
        unklarMs: neuImJournal && neuImBild ? neuImBild.t - neuImJournal.t : null,
        dazwischenGeist: zwischen.some(r => r.geist > 0), dazwischenGriffe: Math.max(0, ...zwischen.map(r => r.griffe)),
        dazwischenMeldungen: [...new Set(zwischen.map(r => r.meldung).filter(Boolean))],
        dazwischenBeschaeftigt: zwischen.some(r => r.beschaeftigt),
        // Wie oft die Tafel nach dem Loslassen wechselte (Werkzeug → Liste → Werkzeug = 2) — und was sie zeigte.
        tafelFolge: reihe.map(r => r.tafel).filter((t, i, a) => t && t !== a[i - 1]),
        geistBisBild: !!neuImBild && reihe.filter(r => r.t < neuImBild.t && r.t >= (neuImJournal?.t ?? 0)).every(r => r.geist > 0),
    };
}

(async () => {
    const browser = await puppeteer.launch({ executablePath: process.env.CHROME, headless: true,
        args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'], protocolTimeout: 900000 });
    const page = await browser.newPage();
    await page.emulate({ viewport: { width: 820, height: 1180, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
    const cdp = await page.target().createCDPSession();
    const fehler = [];
    page.on('pageerror', e => fehler.push(String(e.message).slice(0, 300)));
    page.on('dialog', async (d) => { fehler.push(`Dialog: ${d.message().slice(0, 80)}`); await d.dismiss(); });
    try {
        await page.goto(`${BASIS}/login`, { waitUntil: 'networkidle2' });
        await page.type('input:not([type=password])', process.env.QUAGG_NUTZER);
        await page.type('input[type=password]', process.env.QUAGG_PW);
        await Promise.all([page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 20000 }).catch(() => null), page.keyboard.press('Enter')]);
        await page.goto(`${BASIS}/cde`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForSelector('input[type=file][accept=".ifc"]', { timeout: 60000 });
        await (await page.$('input[type=file][accept=".ifc"]')).uploadFile(MODELL);
        await page.waitForFunction(() => /erdbau_vergleich/i.test(document.body.innerText), { timeout: 120000 });
        await warte(8000);
        await foto(page, 'start');

        // Eine Wand über ein Kommando (wie der Messlauf) — der Lauf misst das Bearbeiten, nicht das Zeichnen.
        const gid = await v(page, `
            const b = pinia._s.get('cde-bearbeitung'); b.modusSetzen(true);
            const { punktAusWelt } = await import('/src/features/cde/services/kommando/Kommando.js');
            const r = b.rahmen; const gid = 'cde-tablet-' + Date.now().toString(36);
            const k = { schema: 1, id: 'tablet-' + Date.now().toString(36), werkzeug: 'wand-zeichnen', ziel: [], neu: [gid], wer: 'tabletlauf', wann: new Date().toISOString(),
                eingaben: { zug: [ { ...punktAusWelt({ x: -6, z: 4 }, r), hoehe: (r?.hoehenversatz ?? 0) }, { ...punktAusWelt({ x: 6, z: 4 }, r), hoehe: (r?.hoehenversatz ?? 0) } ] },
                werte: { name: 'Tabletwand', kategorie: 'IFCWALL', hoehe: '', dicke: 0.3, wandhoehe: 2.5 } };
            const e = await b.fuehreAus(k); if (!e.ausgefuehrt) return null; await api.wendeEintragAn?.(e.eintraege?.[0] ?? e); return gid;`);
        await warte(8000);
        zahlen.wand = !!gid;
        // Abwählen, wie ein Planer: Tipp ins Leere.
        await tippe(page, cdp, { x: 40, y: 200 }); await warte(1500);

        // T1 · Antippen: ist sie gewählt? Stehen Griffe da?
        const mitte = await v(page, `const h = v.engine.autor.huellen?.get(arg); if (!h) return null;
            const s = v.engine.projectToScreen([(h.min.x + h.max.x) / 2, h.max.y, (h.min.z + h.max.z) / 2]);
            const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0].getBoundingClientRect();
            return s ? { x: c.left + s.x, y: c.top + s.y } : null;`, gid);
        if (mitte) { await tippe(page, cdp, mitte); await warte(2500); }
        zahlen.gewaehltNachTipp = (await v(page, `return pinia._s.get('cde-bearbeitung').bauteil?.globalId ?? null;`)) === gid;
        zahlen.griffeNachTipp = await v(page, `return v.griffe.griffe.value.length;`);
        await foto(page, 'nach_tipp');

        // T2 · Tipps bis zum Griff: „Verschieben" (in der Gruppe „Lage")
        let tipps = 0;
        if (await knopf(page, cdp, 'Lage')) tipps++;
        if (await knopf(page, cdp, 'Verschieben')) tipps++;
        await warte(1500);
        zahlen.tippsBisGriff = tipps;
        const griffe = await v(page, `const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0].getBoundingClientRect();
            return v.griffe.griffe.value.map(g => { const s = v.engine.projectToScreen([g.pos.x, g.pos.y, g.pos.z]);
                return { key: g.key, art: g.art, form: g.form ?? null, achse: g.achsName ?? null, x: s ? c.left + s.x : null, y: s ? c.top + s.y : null }; });`);
        zahlen.griffeVerschieben = griffe.length;
        // Wie gross ist ein Griff auf dem Schirm? GEZEICHNET gemessen (T2): der Massstab des Halters, den das Bild gesetzt
        // hat (Radius in Metern), quer zur Blickrichtung projiziert — und die Trefferfläche über `griffUnter`, vom Griff
        // aus Pixel für Pixel nach aussen (beim Pfeil quer zur Achse, an der Pfeilmitte), bis ein anderer oder keiner trifft.
        // T0 rechnete denselben Radius aus der Formel `griffRadius` (1/70 des Abstands) — damals war das, was gezeichnet wurde.
        const MISS = `const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0].getBoundingClientRect();
            const o = v.engine.overlay; const cam = o._getWorld?.()?.camera?.three;
            const rechts = { x: cam.matrixWorld.elements[0], y: cam.matrixWorld.elements[1], z: cam.matrixWorld.elements[2] };
            const px = (p) => { const s = v.engine.projectToScreen([p.x, p.y, p.z]); return s ? { x: c.left + s.x, y: c.top + s.y } : null; };
            const aus = [];
            for (const [key, e] of o._griffe) {
                if (e.versteckt) continue;
                const r = e.halter.scale.x;
                const m = e.halter.getWorldPosition(e.halter.position.clone());
                const a = px(m), b = px({ x: m.x + rechts.x * r, y: m.y + rechts.y * r, z: m.z + rechts.z * r });
                const ziel = e.hitbox.getWorldPosition(e.hitbox.position.clone()); const zp = px(ziel);
                let rx = 1, ry = 0;
                if (e.strecke) { const s0 = px(e.halter.localToWorld(e.strecke[0].clone())), s1 = px(e.halter.localToWorld(e.strecke[1].clone()));
                    const l = Math.hypot(s1.x - s0.x, s1.y - s0.y) || 1; rx = -(s1.y - s0.y) / l; ry = (s1.x - s0.x) / l; }
                let treffer = 0; while (treffer < 80 && o.griffUnter(zp.x + rx * (treffer + 1), zp.y + ry * (treffer + 1)) === key) treffer++;
                aus.push({ key, durchmesser: a && b ? Math.round(2 * Math.hypot(b.x - a.x, b.y - a.y)) : null, trefferRadius: treffer });
            }
            return aus;`;
        zahlen.griffDurchmesserPx = await v(page, MISS);
        // Dasselbe, nachdem auf die Wand gezoomt wurde — so arbeitet man an einem Bauteil.
        await v(page, `const b = pinia._s.get('cde-bearbeitung').bauteil; await v.engine.zoomToElement?.(b.modelId, b.localId, { select: false }); return 1;`);
        await warte(2500);
        zahlen.griffDurchmesserNahPx = await v(page, MISS);
        await foto(page, 'verschieben_nah');
        zahlen.leinwand = await page.evaluate(() => { const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0].getBoundingClientRect();
            return { breite: Math.round(c.width), hoehe: Math.round(c.height), anteil: +(c.width * c.height / (innerWidth * innerHeight)).toFixed(2) }; });
        zahlen.griffArten = [...new Set(griffe.map(g => `${g.art}${g.form ? '/' + g.form : ''}`))];
        await foto(page, 'verschieben');

        // T3 · Den Ost-Pfeil 120 px ziehen — und danach messen, was zu sehen ist (Griffe nach dem Zoom neu gelesen).
        griffe.splice(0, griffe.length, ...(await v(page, `const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0].getBoundingClientRect();
            return v.griffe.griffe.value.map(g => { const s = v.engine.projectToScreen([g.pos.x, g.pos.y, g.pos.z]);
                return { key: g.key, art: g.art, form: g.form ?? null, achse: g.achsName ?? null, x: s ? c.left + s.x : null, y: s ? c.top + s.y : null }; });`)));
        const pfeil = griffe.find(g => g.form === 'pfeil' && /ost/i.test(g.achse ?? '')) ?? griffe.find(g => g.form === 'pfeil') ?? griffe[0];
        const xVorher = await v(page, `const p = pinia._s.get('cde-aenderungen').wirksamerStand('erzeugt').get(arg)?.parameter?.punkte ?? []; return Math.min(...p.map(q => Array.isArray(q) ? q[0] : q.x));`, gid);
        zahlen.journalVorher = await v(page, `return pinia._s.get('cde-aenderungen').eintraege.length;`);
        if (pfeil?.x != null) {
            const reiheP = zeitreihe(page, gid, 14000);
            await finger(page, cdp, { x: pfeil.x, y: pfeil.y }, { x: pfeil.x + 120, y: pfeil.y + 10 });
            setTimeout(() => foto(page, 'los_0_3s'), 300);
            setTimeout(() => foto(page, 'los_1_5s'), 1500);
            setTimeout(() => foto(page, 'los_4s'), 4000);
            setTimeout(() => foto(page, 'los_10s'), 10000);
            const reihe = await reiheP;
            zahlen.verschieben = auswerten(reihe, xVorher);
            fs.writeFileSync(path.join(AUS, 'zeitreihe_verschieben.json'), JSON.stringify(reihe, null, 1));
        }
        zahlen.journalNachher = await v(page, `return pinia._s.get('cde-aenderungen').eintraege.length;`);
        zahlen.nachDemZug = await v(page, `const b = pinia._s.get('cde-bearbeitung'); return { gewaehlt: b.bauteil?.globalId === arg, scharf: b.scharfId, griffe: v.griffe.griffe.value.length };`, gid);

        // T4 · Ziele unter 40 px auf dem Bildschirm (Bedienelemente der Tafel und der Leisten)
        zahlen.zieleUnter40 = await page.evaluate(() => [...document.querySelectorAll('button, summary, input, select')]
            .filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && (r.height < 40 || r.width < 40); }).length);
        zahlen.zieleSichtbar = await page.evaluate(() => [...document.querySelectorAll('button, summary, input, select')]
            .filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; }).length);
    } catch (e) {
        fehler.push(`Ablauf: ${String(e.message).slice(0, 300)}`);
        await page.screenshot({ path: path.join(AUS, 'fehler.png') });
    } finally {
        zahlen.fehler = fehler;
        fs.writeFileSync(path.join(AUS, 'tabletlauf.json'), JSON.stringify(zahlen, null, 1));
        console.log(JSON.stringify(zahlen));
        await browser.close();
    }
})();
