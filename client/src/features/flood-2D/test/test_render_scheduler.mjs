// Node-Test für useRenderScheduler (On-Demand-Rendering im Editor, 2026-07-27).
// Der Editor zeichnet nicht mehr stur 60 fps. Genau zwei Fehlerbilder wären schlimm:
//   a) es wird zu WENIG gezeichnet → eingefrorenes Bild,
//   b) es wird immer gezeichnet → die Optimierung ist wirkungslos.
// Beides ist hier festgenagelt. Die Zeit wird injiziert, der Test braucht keine Timer.
//
//   node src/features/flood-2D/test/test_render_scheduler.mjs

import { useRenderScheduler } from '../composables/editor/useRenderScheduler.js';

let failed = 0;
const check = (cond, msg) => {
    console.log((cond ? '  ✅ ' : '  ❌ ') + msg);
    if (!cond) failed++;
};

console.log('1) Leerlauf: keine Kamerabewegung, keine Anforderung → kein Bild');
{
    const s = useRenderScheduler({ heartbeatMs: 1000 });
    check(s.tick(false, 0) === true, 'allererstes Bild wird immer gezeichnet');
    let drawn = 0;
    // gut 1 s bei 60 fps (63 × 16 ms = 1008 ms) → genau ein Heartbeat fällt hinein
    for (let f = 1; f <= 63; f++) if (s.tick(false, f * 16)) drawn++;
    check(drawn === 1, `in 1 s Leerlauf nur der Heartbeat (${drawn} Bild statt 63)`);
}

console.log('2) Kamerabewegung: jedes Bild, solange controls.update() true liefert');
{
    const s = useRenderScheduler();
    s.tick(false, 0);
    let drawn = 0;
    for (let f = 1; f <= 30; f++) if (s.tick(true, f * 16)) drawn++;
    check(drawn === 30, 'bewegte Kamera zeichnet jedes Bild');
}

console.log('3) Damping klingt aus: letzte true-Frames zeichnen, danach Ruhe');
{
    const s = useRenderScheduler({ heartbeatMs: 100000 });   // Heartbeat aus dem Weg
    s.tick(false, 0);
    // OrbitControls meldet während des Nachlaufens true, danach false
    let drawn = 0;
    for (let f = 1; f <= 10; f++) if (s.tick(true, f * 16)) drawn++;      // Damping läuft
    const afterDamping = drawn;
    for (let f = 11; f <= 40; f++) if (s.tick(false, f * 16)) drawn++;    // ausgeklungen
    check(afterDamping === 10, 'während des Nachlaufens wird gezeichnet');
    check(drawn === 10, 'nach dem Ausklingen kein weiteres Bild');
}

console.log('4) request(): genau ein Bild');
{
    const s = useRenderScheduler({ heartbeatMs: 100000 });
    s.tick(false, 0);
    s.request(0, 100);
    check(s.tick(false, 116) === true, 'angefordertes Bild wird gezeichnet');
    check(s.tick(false, 132) === false, 'danach wieder Ruhe (Anforderung quittiert)');
}

console.log('5) request(holdMs): Aktivitätsfenster deckt Nachläufer ab');
{
    const s = useRenderScheduler({ heartbeatMs: 100000 });
    s.tick(false, 0);
    s.request(120, 100);                       // Eingabe bei t=100, Fenster bis t=220
    let drawn = 0;
    for (let t = 116; t < 220; t += 16) if (s.tick(false, t)) drawn++;
    check(drawn >= 6, `im Fenster wird durchgehend gezeichnet (${drawn} Bilder)`);
    check(s.tick(false, 240) === false, 'nach dem Fenster wieder Ruhe');
}

console.log('6) Heartbeat als Sicherheitsnetz gegen vergessene Anforderungen');
{
    const s = useRenderScheduler({ heartbeatMs: 1000 });
    s.tick(false, 0);
    check(s.tick(false, 500) === false, 'nach 0,5 s noch kein Heartbeat');
    check(s.tick(false, 1000) === true, 'nach 1 s greift der Heartbeat');
    check(s.tick(false, 1500) === false, 'Heartbeat setzt den Zähler zurück');
    check(s.tick(false, 2000) === true, 'nächster Heartbeat 1 s später');
}

console.log('7) Statistik: gezeichnete vs. übersprungene Bilder');
{
    const s = useRenderScheduler({ heartbeatMs: 100000 });
    s.tick(false, 0);
    for (let f = 1; f <= 9; f++) s.tick(false, f * 16);
    const st = s.getStats();
    check(st.rendered === 1 && st.skipped === 9,
        `Statistik stimmt (gezeichnet ${st.rendered}, übersprungen ${st.skipped})`);
}

console.log(failed === 0 ? '\n✅ RENDER-SCHEDULER BESTANDEN' : `\n❌ ${failed} FEHLER`);
process.exit(failed === 0 ? 0 : 1);
