/**
 * svEmojiMap.js
 *
 * Zentrales Mapping Emoji → Pixel-Icon (public/saintv1d/icons/<name>.svg).
 * Genutzt von <SvEmoji>, das das Icon Lime-eingefärbt rendert und bei fehlendem
 * Mapping das Original-Emoji als Fallback zeigt.
 *
 * „Maximal" gemappt (auch lose Treffer). Bewusst NICHT gemappt bleiben reine
 * Funktions-Glyphen, für die es kein sinnvolles Icon gibt und deren Bedeutung
 * an der Form hängt: Pfeile (▶ ▼ ▲ ▸ ▾ ⬆ ⬇ ⬅ ➖), Close/Delete (✕ ✖ ❌ ✗),
 * Haken (✅ ✓ ✔), Formwähler (⬡ ⬠ ▭ ▣), Status-Punkte (🔴 🟢 🔵 ⚪ ⭕ ○ ◎ ⬜ ⬛)
 * und Add-Kreuze (✚ ✛). Die rendert <SvEmoji> unverändert als Glyph.
 */

const MAP = {
  // ── Status / Alert ─────────────────────────────────────────────
  '⚠': 'Interface-Essential-Alert-Triangle-1',
  '❗': 'Interface-Essential-Alert-Circle-1',
  '‼': 'Interface-Essential-Alert-Circle-1',
  'ℹ': 'Interface-Essential-Information-Circle-2',
  '❓': 'Interface-Essential-Question-Help-Circle-2',
  '❔': 'Interface-Essential-Question-Help-Circle-2',
  '🛑': 'Interface-Essential-Alert-Circle-1',
  '⛔': 'Interface-Essential-Alert-Circle-1',
  '🚫': 'Interface-Essential-Alert-Circle-1',
  '😕': 'Interface-Essential-Alert-Circle-2',
  '👹': 'Interface-Essential-Alert-Triangle-2', // Hazard/Gefahr

  // ── Wasser / Wetter (lose) ─────────────────────────────────────
  '🌊': 'Business-Products-Boat-Success',        // Wasserspiegel/Welle (Boot = Wasser)
  '💧': 'Design-Dropper-1',                       // Tiefe/Tropfen
  '🚰': 'Design-Dropper-2',
  '💨': 'Interface-Essential-Flash',              // Velocity/Geschwindigkeit
  '🌧': 'Weather-Umbrella',
  '☁': 'Weather-Cloud-Sun-Fine',
  '⛅': 'Weather-Cloud-Sun-Fine',
  '🏜': 'Weather-Cloud-Sun-Fine',                 // Trocken/Sonne (Bodenvorfeuchte)

  // ── Aus-/Zufluss (semantische Pfeile, KEINE UI-Control-Pfeile) ─────────────
  '↗': 'Interface-Essential-Share-1',            // freier Auslauf (raus)
  '↘': 'Interface-Essential-Share-1',            // freier Auslauf (raus)

  // ── Karte / Navigation ─────────────────────────────────────────
  '📍': 'Map-Navigation-Pin-Location-1',
  '🗺': 'Interface-Essential-Map',
  '🧭': 'Map-Navigation-Compass-Direction',
  '🌐': 'Interface-Essential-Global-Public',
  '🌍': 'Interface-Essential-Global-Public',
  '🎯': 'Interface-Essential-Cursor-Click-Point',
  '🌀': 'Interface-Essential-Synchronize-Arrows-Square-2', // Strömungslinien (Wirbel)

  // ── Messen / Statistik ─────────────────────────────────────────
  '📏': 'Design-Ruler',
  '📐': 'Design-Half-Circle-Ruler',
  '📈': 'Interface-Essential-Stat',
  '📉': 'Interface-Essential-Stat',
  '📊': 'Interface-Essential-Stat',
  '⚖': 'Business-Product-Scale',
  '🔢': 'Interface-Essential-Text-Input-Area-1',
  '🧪': 'Design-Dropper-2',
  '🔬': 'Health-Brain-2',

  // ── Aktion / Run / Settings ────────────────────────────────────
  '⚡': 'Interface-Essential-Flash',
  '🚀': 'Social-Rewards-Trends-Hot-Flame',
  '🔥': 'Social-Rewards-Trends-Hot-Flame',
  '⚙': 'Interface-Essential-Cog-Double',
  '🛠': 'Interface-Essential-Cog-Double',
  '🎛': 'Interface-Essential-Setting-Slide',
  '🔧': 'Interface-Essential-Cog-Double',
  '🔄': 'Interface-Essential-Synchronize-Arrows-Square-2',
  '🔃': 'Interface-Essential-Synchronize-Arrows-Square-2',

  // ── Verbindung / Link ──────────────────────────────────────────
  '🔌': 'Interface-Essential-Link',
  '🔗': 'Interface-Essential-Hyperlink',
  '🕳': 'Interface-Essential-Link-Broken-2',      // Durchlass/Loch

  // ── Dateien / IO ───────────────────────────────────────────────
  '📄': 'Content-Files-Note',
  '📃': 'Content-Files-Note',
  '📁': 'Content-Files-Folder-Open',
  '📂': 'Content-Files-Folder-Open',
  '📋': 'Content-Files-Notepad',
  '📝': 'Content-Files-Write-Note',
  '📦': 'Social-Rewards-Reward-Gift',
  '📥': 'Interface-Essential-Clound-Download',
  '⬇': 'Interface-Essential-Clound-Download',
  '📤': 'Interface-Essential-Share-1',
  '💾': 'Interface-Essential-Floppy-Disk',
  '🖨': 'Interface-Essential-Print',
  '🖼': 'Photography-Photo-Image',
  '📷': 'Photography-Camera-1',
  '🔒': 'Interface-Essential-Key-Lock',
  '🔐': 'Interface-Essential-Key-Lock',
  '🕒': 'Interface-Essential-Waiting-Hourglass-Loading',
  '⏳': 'Interface-Essential-Waiting-Hourglass-Loading',
  '⏱': 'Interface-Essential-Waiting-Hourglass-Loading',

  // ── Edit / Design ──────────────────────────────────────────────
  '🎨': 'Design-Color-Painting-Palette',
  '✏': 'Design-Pencil',
  '✎': 'Design-Pencil',
  '✒': 'Design-Ink-Pen',
  '🖌': 'Content-Files-Pencil-Brush',
  '🖊': 'Content-Files-Pen',
  '✂': 'Interface-Essential-Scisor',
  '🪣': 'Design-Color-Bucket',
  '🪥': 'Content-Files-Pencil-Brush',

  // ── Struktur / Objekte ─────────────────────────────────────────
  '🌉': 'Building-Real-Eastate-Location',
  '🏢': 'Building-Real-Eastate-House-2',   // Gebäude → einheitliches Haus-Icon
  '🏠': 'Building-Real-Eastate-House-2',
  '🏘': 'Building-Real-Eastate-House-2',
  '🏗': 'Building-Real-Eastate-House-2',   // Bauwerk/Gebäude
  '🧊': 'Design-Layer',                            // Brückenkörper/Volumen
  '🧱': 'Design-Artboard-Shapes',                  // Wehr/Wand
  '🧠': 'Health-Brain-1',
  '🐛': 'Coding-Apps-Websites-Programming-Bug',
  '🐟': 'Food-Drink-Fish',
  '🐠': 'Food-Drink-Fish',
  '📡': 'Interface-Essential-Wifi-Feed',
  '📶': 'Interface-Essential-Wifi-Feed',

  // ── Aus Projekt-Scan ergänzt (scan-emojis.mjs) ─────────────────
  '✍': 'Content-Files-Quill-Ink',
  '〰': 'Business-Products-Boat-Success',      // Welle/Wehr
  '☂': 'Weather-Umbrella',
  '☔': 'Weather-Umbrella',
  '🌨': 'Weather-Umbrella-Snowing',
  '🏛': 'Building-Real-Eastate-House-2',
  '💰': 'Business-Products-Bag-Money',
  '📌': 'Map-Navigation-Pin-Location-1',
  '🖱': 'Interface-Essential-Cursor',
  '⌨': 'Computers-Devices-Electronics-Board',
  '🌳': 'Photography-Focus-Flower',
  '🌱': 'Photography-Focus-Flower',
  '⛁': 'Computers-Devices-Electronicscd-Disk', // Datenstapel
  '🖍': 'Content-Files-Pencil-Brush',
  '📖': 'Content-Files-Open-Book',
  '📕': 'Content-Files-Books-2',
  '📚': 'Content-Files-Archive-Books-2',
  '🚨': 'Interface-Essential-Alert-Circle-1',
  '🪄': 'Design-Magic-Wand',
  '🔓': 'Interface-Essential-Key-Lock',
  '🎬': 'Video-Movies-Vintage-Tv-1',
  '📺': 'Video-Movies-Vintage-Tv-1',
  '🎵': 'Music-Clef-Sheet',
  '🏆': 'Social-Rewards-Certified-Diploma',
  '⭐': 'Social-Rewards-Rating-Star-1',
  '❤': 'Social-Rewards-Heart-Like-Circle',
  '🎁': 'Social-Rewards-Reward-Gift',
};

// Variation-Selektoren / ZWJ entfernen, damit "⚠️" == "⚠".
function normalize(emoji) {
  return String(emoji || '').replace(/[︎️‍]/g, '').trim();
}

// Alle Dateien tragen das Suffix "--Streamline-Pixel"; die Map hält die Kurznamen
// für Lesbarkeit. SvIcon hängt nur ".svg" an → Suffix hier ergänzen.
const SUFFIX = '--Streamline-Pixel';

export function emojiToIcon(emoji) {
  const key = normalize(emoji);
  return MAP[key] ? MAP[key] + SUFFIX : null;
}

export const emojiIconMap = MAP;
