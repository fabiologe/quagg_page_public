#!/usr/bin/env node
/**
 * run-node-tests.mjs — faehrt die handgeschriebenen Node-Testskripte, die vitest
 * NICHT findet.
 *
 * Hintergrund (Audit 2026-08-01): unter src/features/<feature>/test/ liegen 50
 * Skripte im Muster test_*.mjs. Sie sind keine vitest-Suites (kein describe/it),
 * sondern eigenstaendige Programme, die selbst assertieren und per
 * process.exit(0|1) bestehen/fehlschlagen. vitest sammelt per Default nur
 * *.{test,spec}.* ein — diese Dateien liefen deshalb NIE bei `npm test`, obwohl
 * sie den Grossteil der flood-2D-Abdeckung ausmachen. "Alle Tests gruen" war
 * damit eine unbelegte Aussage.
 *
 * Umbenennen auf *.test.mjs waere der falsche Weg: vitest bricht bei Dateien
 * ohne Testsuite mit "No test suite found" ab. Also ein eigener Runner.
 *
 * Aufruf:
 *   node scripts/run-node-tests.mjs             # alle
 *   node scripts/run-node-tests.mjs sgc bridge  # nur passende Dateinamen
 *
 * Exit-Code: 0 = alle bestanden, 1 = mindestens einer fehlgeschlagen.
 */
import { readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FEATURES = join(ROOT, 'src', 'features');
const TIMEOUT_MS = 10 * 60 * 1000;   // einzelne Tests fahren echte Docker-Laeufe

const filters = process.argv.slice(2);

/** Alle test_*.mjs unter src/features/<feature>/test/ einsammeln. */
function collect() {
    const found = [];
    for (const feature of readdirSync(FEATURES, { withFileTypes: true })) {
        if (!feature.isDirectory()) continue;
        const testDir = join(FEATURES, feature.name, 'test');
        if (!existsSync(testDir)) continue;
        for (const f of readdirSync(testDir)) {
            // diag_*.mjs sind Diagnose-Skripte ohne Pass/Fail-Semantik.
            if (f.startsWith('test_') && f.endsWith('.mjs')) {
                found.push(join(testDir, f));
            }
        }
    }
    return found.sort();
}

let files = collect();
if (filters.length) {
    files = files.filter((f) => filters.some((needle) => f.includes(needle)));
}

if (!files.length) {
    console.error('Keine passenden test_*.mjs gefunden.');
    process.exit(1);
}

console.log(`\nNode-Testskripte: ${files.length} Datei(en)\n`);

const failed = [];
const started = Date.now();

for (const file of files) {
    const rel = relative(ROOT, file);
    const t0 = Date.now();
    const res = spawnSync(process.execPath, [file], {
        cwd: dirname(file),
        encoding: 'utf8',
        timeout: TIMEOUT_MS,
    });
    const secs = ((Date.now() - t0) / 1000).toFixed(1);

    if (res.status === 0) {
        console.log(`  \x1b[32mPASS\x1b[0m  ${rel}  (${secs}s)`);
    } else {
        const why = res.error?.code === 'ETIMEDOUT'
            ? `Timeout nach ${TIMEOUT_MS / 1000}s`
            : `Exit ${res.status ?? res.error?.message ?? '?'}`;
        console.log(`  \x1b[31mFAIL\x1b[0m  ${rel}  (${secs}s — ${why})`);
        failed.push({ rel, out: `${res.stdout ?? ''}${res.stderr ?? ''}`.trimEnd() });
    }
}

const total = ((Date.now() - started) / 1000).toFixed(1);

// Ausgabe nur der Fehlgeschlagenen — sonst ersaeuft das Ergebnis in Logs.
for (const { rel, out } of failed) {
    console.log(`\n${'─'.repeat(70)}\n${rel}\n${'─'.repeat(70)}`);
    console.log(out.split('\n').slice(-40).join('\n'));
}

console.log(
    `\n${failed.length ? '\x1b[31m' : '\x1b[32m'}`
    + `${files.length - failed.length}/${files.length} bestanden\x1b[0m  (${total}s)\n`,
);

process.exit(failed.length ? 1 : 0);
