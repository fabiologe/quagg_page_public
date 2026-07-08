/**
 * scan-emojis.mjs
 *
 * Durchsucht das gesamte Projekt nach Emoji/Symbol-Glyphen und schreibt einen
 * Report (scripts/emoji-report.json) mit: Pfad, Dateiname, Zeile, Spalte, Emoji,
 * Codepoint(s) und Mapping-Status (ist es schon in svEmojiMap?).
 *
 * Ausführen (aus client/):  node scripts/scan-emojis.mjs
 *
 * Erfasst werden Extended_Pictographic sowie die Symbol-/Dingbat-/Geometrie-/
 * Misc-Blöcke (⚠ ℹ ✏ ✂ ✕ ▶ ▼ ⬡ 🛑 …). BEWUSST ausgelassen: der reine
 * Text-Pfeil-Block U+2190–U+21FF (→ ← ↑ ↓), der sonst die Hinweistexte flutet.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, relative, extname, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');       // Repo-Wurzel (für relative Pfade)
// Scan-Wurzel: Default = client/src (die App). Override per Argument:
//   node scripts/scan-emojis.mjs ../backend    bzw.   node scripts/scan-emojis.mjs .
const SCAN_ROOT = process.argv[2]
  ? join(process.cwd(), process.argv[2])
  : join(__dirname, '..', 'src');
const OUT = join(__dirname, 'emoji-report.json');

const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.output', '.cache', 'coverage',
  '.claude', '.venv', 'venv', '__pycache__', '.next', '.nuxt', '.vite',
]);
const TEXT_EXT = new Set([
  '.vue', '.js', '.ts', '.mjs', '.cjs', '.jsx', '.tsx', '.json',
  '.md', '.html', '.htm', '.css', '.scss', '.txt', '.py', '.svg',
]);
// Diese Dateien selbst nicht als "Vorkommen" zählen (sie sind Quelle/Report).
const SKIP_FILES = new Set(['svEmojiMap.js', 'emoji-report.json', 'scan-emojis.mjs']);

// Emoji/Symbol-Matcher: Startglyph + evtl. VS16/ZWJ/Folge-Piktogramme (ZWJ-Sequenzen).
const EMOJI_RE =
  /(?:\p{Extended_Pictographic}|[⌀-⏿■-◿☀-⛿✀-➿⬀-⯿])(?:[️‍]\p{Extended_Pictographic}?)*/gu;

// Variation-Selektor entfernen → "⚠️" == "⚠" (aber ZWJ-Sequenzen bleiben distinct).
const normalize = (s) => s.replace(/️/g, '');
const codepoints = (s) =>
  [...s].map((c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')).join(' ');

// Aktuelles Mapping laden (für mapped/unmapped-Flag)
const { emojiToIcon } = await import('../src/features/flood-2D/components/common/svEmojiMap.js');

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      if (!EXCLUDE_DIRS.has(name)) walk(full, files);
    } else if (TEXT_EXT.has(extname(name).toLowerCase()) && !SKIP_FILES.has(name)) {
      files.push(full);
    }
  }
  return files;
}

const files = walk(SCAN_ROOT);
const occurrences = [];
const distinct = new Map(); // normalizedEmoji -> { emoji, codepoints, count, mapped, icon, files:Set }
let filesWithEmoji = 0;

for (const file of files) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { continue; }
  if (!EMOJI_RE.test(text)) continue;
  EMOJI_RE.lastIndex = 0;
  filesWithEmoji++;
  const rel = relative(PROJECT_ROOT, file);
  const lines = text.split(/\r?\n/);

  lines.forEach((line, i) => {
    let m;
    EMOJI_RE.lastIndex = 0;
    while ((m = EMOJI_RE.exec(line)) !== null) {
      const raw = m[0];
      const emoji = normalize(raw);
      if (!emoji) continue;
      const icon = emojiToIcon(emoji);
      occurrences.push({
        file: rel,
        filename: basename(file),
        line: i + 1,
        col: m.index + 1,
        emoji,
        codepoints: codepoints(emoji),
        mapped: !!icon,
        icon: icon || null,
        context: line.trim().slice(0, 160),
      });
      let d = distinct.get(emoji);
      if (!d) {
        d = { emoji, codepoints: codepoints(emoji), count: 0, mapped: !!icon, icon: icon || null, files: new Set() };
        distinct.set(emoji, d);
      }
      d.count++;
      d.files.add(`${rel}:${i + 1}`);
    }
  });
}

const distinctArr = [...distinct.values()]
  .map((d) => ({ ...d, files: [...d.files].slice(0, 50), fileCount: d.files.size }))
  .sort((a, b) => b.count - a.count);

const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    filesScanned: files.length,
    filesWithEmoji,
    totalOccurrences: occurrences.length,
    distinctEmojis: distinctArr.length,
    mappedDistinct: distinctArr.filter((d) => d.mapped).length,
    unmappedDistinct: distinctArr.filter((d) => !d.mapped).length,
  },
  unmapped: distinctArr.filter((d) => !d.mapped),
  distinct: distinctArr,
  occurrences,
};

writeFileSync(OUT, JSON.stringify(report, null, 2));

// Konsolen-Zusammenfassung
console.log('── Emoji-Scan ──────────────────────────────');
console.log(`Dateien gescannt:      ${report.summary.filesScanned}`);
console.log(`Dateien mit Emoji:     ${report.summary.filesWithEmoji}`);
console.log(`Vorkommen gesamt:      ${report.summary.totalOccurrences}`);
console.log(`Distinct Emojis:       ${report.summary.distinctEmojis}`);
console.log(`  davon gemappt:       ${report.summary.mappedDistinct}`);
console.log(`  davon UNGEMAPPT:     ${report.summary.unmappedDistinct}`);
console.log(`Report:                ${relative(PROJECT_ROOT, OUT)}`);
console.log('\n── UNGEMAPPTE Emojis (nach Häufigkeit) ─────');
for (const d of report.unmapped) {
  console.log(`  ${d.emoji}  ${d.codepoints.padEnd(22)} ×${String(d.count).padStart(4)}  in ${d.fileCount} Datei(en)`);
}
