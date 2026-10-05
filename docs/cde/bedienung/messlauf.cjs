/**
 * MESSLAUF BEDIENUNG (Teil XXX, B0) — der Durchlauf eines Planers am ersten Tag, mit echter Maus und Tastatur, als
 * Zahlen. Jede Stufe B1 … B7 misst vorher und nachher mit genau diesem Lauf (Konzept § 5).
 *
 * Läuft OHNE Projekt (lokale IndexedDB des Wegwerfprofils — schreibt in kein Projekt-Repo), gegen einen laufenden
 * Vite-Dev-Server (nie :3000 beenden). Zugang und Pfade aus der Umgebung, nie aus dieser Datei:
 *
 *   QUAGG_NUTZER=… QUAGG_PW=… PUPPETEER_CORE=/pfad/zu/puppeteer-core CHROME=/pfad/zu/chrome \
 *   BASIS=http://127.0.0.1:3001 AUS=/tmp/messlauf node docs/cde/bedienung/messlauf.cjs
 *
 * Ausgabe: `$AUS/messlauf.json` (die Zahlen) und je Schritt ein Bild.
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require(process.env.PUPPETEER_CORE || 'puppeteer-core');

const BASIS = process.env.BASIS || 'http://127.0.0.1:3001';
const AUS = process.env.AUS || path.resolve('messlauf-aus');
const MODELL = path.resolve(__dirname, '../../../backend/app/ifc/tests/daten/erdbau_vergleich.ifc');
fs.mkdirSync(AUS, { recursive: true });

const zahlen = {};
const warte = (ms) => new Promise(z => setTimeout(z, ms));
let bild = 0;
async function foto(page, name) { await page.screenshot({ path: path.join(AUS, `${String(++bild).padStart(2, '0')}_${name}.png`) }); }

/** Die Viewer-Schnittstelle und Pinia — in der Seite ausgeführt, Ergebnis als JSON (Vue-Proxys kommen sonst leer an). */
async function api(page, ausdruck, arg = null) {
    return page.evaluate(async (ausdruck, arg) => {
        const inst = document.querySelector('.kk-auf, .kk')?.__vueParentComponent ?? document.querySelector('#app').__vue_app__._instance;
        let a = null;
        const besuche = (i) => { for (let x = i; x && !a; x = x.parent) for (const s of Object.getOwnPropertySymbols(x.provides ?? {})) if (typeof x.provides[s]?.eigenbauPaket === 'function') a = x.provides[s]; };
        besuche(inst);
        if (!a) for (const el of document.querySelectorAll('*')) { if (el.__vueParentComponent) { besuche(el.__vueParentComponent); if (a) break; } }
        const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
        const f = new Function('api', 'pinia', 'arg', `return (async () => { ${ausdruck} })();`);
        return JSON.stringify(await f(a, pinia, arg));
    }, ausdruck, arg).then(JSON.parse);
}
/** Wo die Kamera steht — über das, was der Viewer per `defineExpose` zeigt (`captureViewpoint`, gespeicherte Ansichten). */
const kamera = (page) => page.evaluate(() => {
    for (const el of document.querySelectorAll('*')) {
        for (let i = el.__vueParentComponent; i; i = i.parent) {
            if (typeof i.exposed?.captureViewpoint === 'function') return i.exposed.captureViewpoint()?.camera?.position ?? null;
        }
    }
    return null;
});
const journal = (page) => api(page, `return (pinia._s.get('cde-aenderungen').eintraege ?? []).length;`);
// Eigene Bauteile, die STEHEN — ein gelöschter Eigenbau ist ein Eintrag „gelöscht", sein Bauplan bleibt im Stand.
const eigene = (page) => api(page, `const ae = pinia._s.get('cde-aenderungen'); const weg = ae.wirksamerStand('geloescht');
    return [...ae.wirksamerStand('erzeugt')].filter(([g, p]) => p && !weg.get(g)).map(([g]) => g);`);

/** Die Zeichenfläche (die grösste Leinwand) in Seitenpixeln. */
const leinwand = (page) => page.evaluate(() => {
    const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
    const r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height };
});
/** Welcher Anteil der Zeichenfläche ist von Oberfläche verdeckt? Ein Raster 40 × 30, je Punkt das oberste Element. */
const verdeckt = (page) => page.evaluate(() => {
    const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
    const r = c.getBoundingClientRect();
    let zu = 0, n = 0, mitte = 0, mn = 0;
    for (let i = 0; i < 40; i++) for (let j = 0; j < 30; j++) {
        const x = r.left + (i + 0.5) * r.width / 40, y = r.top + (j + 0.5) * r.height / 30;
        const oben = document.elementFromPoint(x, y);
        const frei = oben === c || (oben && oben.tagName === 'CANVAS');
        n++; if (!frei) zu++;
        // Das mittlere Drittel — dort liegt in der Draufsicht das Modell.
        if (i >= 13 && i < 27 && j >= 10 && j < 20) { mn++; if (!frei) mitte++; }
    }
    return { gesamt: +(zu / n).toFixed(3), mitte: +(mitte / mn).toFixed(3) };
});
async function knopf(page, text, bereich = 'body') {
    return page.evaluate((text, bereich) => {
        const b = [...document.querySelectorAll(`${bereich} button`)].find(x => x.innerText.trim().startsWith(text) && x.getBoundingClientRect().width > 0);
        if (!b) return false; b.click(); return true;
    }, text, bereich);
}
async function strg(page, taste) { await page.keyboard.down('Control'); await page.keyboard.press(taste); await page.keyboard.up('Control'); await warte(1500); }

(async () => {
    const browser = await puppeteer.launch({ executablePath: process.env.CHROME, headless: true,
        args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'], defaultViewport: { width: 1600, height: 1000 }, protocolTimeout: 900000 });
    const page = await browser.newPage();
    const fehler = [];
    page.on('pageerror', e => fehler.push(String(e.message).slice(0, 300)));
    page.on('dialog', async (d) => { fehler.push(`Dialog: ${d.type()} ${d.message().slice(0, 80)}`); await d.dismiss(); });
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
        zahlen.startVerdeckt = await verdeckt(page);
        zahlen.leinwandHoehe = Math.round((await leinwand(page)).h);

        // M1 · Klicks, bis die Palette („Wand") zu sehen ist.
        let klicks = 0;
        const wandSichtbar = () => page.evaluate(() => [...document.querySelectorAll('.tb button')].some(b => b.innerText.trim().startsWith('Wand') && b.getBoundingClientRect().width > 0));
        if (!(await wandSichtbar())) {
            await page.evaluate(() => [...document.querySelectorAll('button, a, div')].find(x => x.innerText?.trim() === 'Bauteil' && x.getBoundingClientRect().left > 1400)?.click());
            klicks++; await warte(1500);
        }
        zahlen.klicksBisPalette = (await wandSichtbar()) ? klicks : null;

        // M2 · Eine Wand zeichnen: verdeckte Zeichenfläche, zwei Klicks in die Bildmitte, Enter.
        const kameraVorher = await kamera(page);
        const vorJ = await journal(page), vorE = await eigene(page);
        await knopf(page, 'Wand', '.tb'); await warte(2500);
        await foto(page, 'wand_scharf');
        zahlen.zeichnenVerdeckt = await verdeckt(page);
        const L = await leinwand(page);
        await page.mouse.click(L.x + L.w * 0.42, L.y + L.h * 0.5); await warte(900);
        await page.mouse.click(L.x + L.w * 0.58, L.y + L.h * 0.5); await warte(900);
        await page.keyboard.press('Enter'); await warte(5000);
        await foto(page, 'nach_enter');
        const nachJ = await journal(page), nachE = await eigene(page);
        const neu = nachE.filter(g => !vorE.includes(g));
        zahlen.zeichnenMitteGeklappt = nachJ > vorJ && neu.length === 1;
        // M3/M4 · Danach: ist das Neue gewählt? Ist die Kamera zurück?
        zahlen.neuesGewaehlt = neu.length === 1 && (await api(page, `return pinia._s.get('cde-bearbeitung').bauteil?.globalId ?? null;`)) === neu[0];
        const kameraNachher = await kamera(page);
        const a = kameraVorher, b = kameraNachher;
        zahlen.kameraZurueck = a && b ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 0.5 : null;

        // Für die Tasten braucht es ein Bauteil: das Gezeichnete — oder, wenn das Zeichnen mit der Maus scheiterte, eine
        // Wand über ein Kommando (dieselbe Wand, damit Entf, Strg+Z, Strg+C/V unabhängig davon gemessen werden).
        let ziel = neu[0] ?? null;
        if (!ziel) {
            await page.keyboard.press('Escape'); await warte(800);
            await api(page, `pinia._s.get('cde-bearbeitung').abbrechen?.(); return true;`);
            ziel = await api(page, `
                const b = pinia._s.get('cde-bearbeitung');
                const { punktAusWelt } = await import('/src/features/cde/services/kommando/Kommando.js');
                const r = b.rahmen; const P = (x, z) => ({ ...punktAusWelt({ x, z }, r), hoehe: '' });
                const zentrum = pinia._s.get('cde-bearbeitung').gelaendeListe?.[0] ?? null;
                const gid = 'cde-messwand-' + Date.now().toString(36);
                const k = { schema: 1, id: 'messlauf-' + Date.now().toString(36), werkzeug: 'wand-zeichnen', ziel: [], neu: [gid], wer: 'messlauf', wann: new Date().toISOString(),
                    eingaben: { zug: [ { ...punktAusWelt({ x: -5, z: 0 }, r), hoehe: (r?.hoehenversatz ?? 0) + 0 }, { ...punktAusWelt({ x: 5, z: 0 }, r), hoehe: (r?.hoehenversatz ?? 0) + 0 } ] },
                    werte: { name: 'Messwand', kategorie: 'IFCWALL', hoehe: '', dicke: 0.3, wandhoehe: 2.5 } };
                const e = await b.fuehreAus(k);
                return e.ausgefuehrt ? gid : null;`);
            zahlen.wandPerKommando = !!ziel;
            await warte(5000);
        }
        if (ziel) { await api(page, `await api.waehleEigenes(arg); return true;`, ziel); await warte(1500); }
        // M5 · Entf löscht die Auswahl.
        let j0 = await journal(page);
        await page.keyboard.press('Delete'); await warte(3000);
        zahlen.entfLoescht = !!ziel && (await journal(page)) > j0 && !(await eigene(page)).includes(ziel);
        await foto(page, 'entf');
        // M6 · Strg+Z holt es zurück.
        if (zahlen.entfLoescht) { await strg(page, 'KeyZ'); await warte(3000); }
        zahlen.strgZ = !!ziel && (await eigene(page)).includes(ziel);
        // M7 · Strg+C, Strg+V, ein Klick setzt die Kopie.
        if (ziel) { await api(page, `await api.waehleEigenes(arg); return true;`, ziel); await warte(1500); }
        j0 = await journal(page); const e0 = await eigene(page);
        await strg(page, 'KeyC'); await strg(page, 'KeyV');
        // Die Kopie hängt am Zeiger — bewegen, dann ein Klick aufs Gelände nahe der Bildmitte setzt sie.
        await page.mouse.move(L.x + L.w * 0.56, L.y + L.h * 0.56); await warte(800);
        await page.mouse.click(L.x + L.w * 0.56, L.y + L.h * 0.56); await warte(5000);
        await foto(page, 'strg_v');
        zahlen.strgCVKopie = (await journal(page)) > j0 && (await eigene(page)).length === e0.length + 1;
        // M8 · Strg+A wählt alles Eigene.
        await page.keyboard.press('Escape'); await warte(800);
        await strg(page, 'KeyA'); await warte(1500);
        zahlen.strgAWaehlt = await api(page, `return pinia._s.get('cde-bearbeitung').bauteile?.length ?? 0;`);
        zahlen.eigeneBauteile = (await eigene(page)).length;
    } catch (e) {
        fehler.push(`Ablauf: ${String(e.message).slice(0, 300)}`);
        await page.screenshot({ path: path.join(AUS, 'fehler.png') });
    } finally {
        zahlen.fehler = fehler;
        fs.writeFileSync(path.join(AUS, 'messlauf.json'), JSON.stringify(zahlen, null, 1));
        console.log(JSON.stringify(zahlen));
        await browser.close();
    }
})();
