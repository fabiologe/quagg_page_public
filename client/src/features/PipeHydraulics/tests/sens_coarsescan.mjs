/**
 * Sensitivitaetsanalyse der Coarse-Scan-Schrittzahl in findWSPForQ().
 *
 * Importiert die ECHTE Vorwaertsphysik calculateAtWSP() aus dem Produktivmodul.
 * Die Inversionsschleife wird hier als findWSPForQ_N() exakt wie im Original
 * (useBridgeHydraulics.js:462-488) nachgebildet, nur die hartkodierte Zahl
 * N = 50 wird zum Funktionsargument. Bisektion (60 Schritte) und Toleranz
 * (0.001 m) bleiben fix, damit ausschliesslich der Coarse-Scan-Effekt isoliert
 * gemessen wird.
 *
 * Lauf:  node client/src/features/PipeHydraulics/tests/sens_coarsescan.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { useBridgeHydraulics } from '../composables/useBridgeHydraulics.js'

const { calculateAtWSP } = useBridgeHydraulics()

const __dir = dirname(fileURLToPath(import.meta.url))

// ─── Parametrierte Inversion (1:1-Nachbildung, nur N variabel) ──────────────
function findWSPForQ_N(params, Q_target, wspMin, wspMax, N) {
  if (Q_target <= 0) return wspMin
  const dw = (wspMax - wspMin) / N
  let lo = wspMin, hi = wspMax, found = false
  let Q_prev = calculateAtWSP({ ...params, wsp: wspMin }).Q_total
  for (let i = 1; i <= N; i++) {
    const wi = wspMin + i * dw
    const Qi = calculateAtWSP({ ...params, wsp: wi }).Q_total
    if (Math.min(Q_prev, Qi) <= Q_target && Q_target <= Math.max(Q_prev, Qi)) {
      lo = wi - dw; hi = wi; found = true; break
    }
    Q_prev = Qi
  }
  if (!found) {
    const Q_lo = calculateAtWSP({ ...params, wsp: wspMin }).Q_total
    const Q_hi = calculateAtWSP({ ...params, wsp: wspMax }).Q_total
    return Math.abs(Q_target - Q_lo) < Math.abs(Q_target - Q_hi) ? wspMin : wspMax
  }
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (hi - lo < 0.001) break
    const Q_mid = calculateAtWSP({ ...params, wsp: mid }).Q_total
    if (Q_mid < Q_target) lo = mid; else hi = mid
  }
  return Math.round((lo + hi) / 2 * 1000) / 1000
}

// ─── Echter Bestandsquerschnitt aus Projektdatei ────────────────────────────
// Vermessene Bruecke (140+ Gelaendepunkte, reale BUK/BOK, 4 kSt-Zonen) inkl.
// projekteigenem Gefaelle und Suchbereich.
const proj = JSON.parse(readFileSync(join(__dir, 'Brücke-bestand.json'), 'utf8'))

const base = {
  crossSectionPoints: proj.terrainPoints,
  bukProfile: proj.bukProfile,
  bokProfile: proj.bokProfile,
  kstZones: proj.kstZones,
  slope: proj.slope, mu: 0.80, muDeck: 0.45,
  zeta: 0, nPiers: 0, bPier: 0.5, flowMode: 'auto',
}

const wspMin = proj.wspMin
const wspMax = proj.wspMax
const bukMin = Math.min(...proj.bukProfile.map(p => p.z))

// ─── Lastfaelle ─────────────────────────────────────────────────────────────
const Q_HQ100   = 393
const Q_HQ100x2 = 786

// Uebergangsfall: Q genau im nicht-monotonen Band der Q(WSP)-Kurve am
// Freispiegel->Druck-Uebergang. Statt willkuerlich bukMin anzunehmen, wird die
// Kurve fein abgetastet und die groesste rueckwaertige Q-Stufe (Q faellt bei
// steigendem WSP) gesucht. Genau dort schliesst max(Q_orifice, Q_manning) den
// Knick nicht vollstaendig und das Bracketing wird mehrdeutig. Ziel-Q = Mitte
// dieses Bandes -> die gesuchte Wurzel liegt direkt im kritischen Bereich.
function findKinkBand() {
  const dwScan = 0.01
  let prevW = wspMin
  let prevQ = calculateAtWSP({ ...base, wsp: prevW }).Q_total
  let best = { drop: 0, qLo: 0, qHi: 0, wsp: bukMin }
  for (let w = wspMin + dwScan; w <= wspMax; w += dwScan) {
    const q = calculateAtWSP({ ...base, wsp: +w.toFixed(4) }).Q_total
    const drop = prevQ - q                 // > 0 => Q faellt bei steigendem WSP
    if (drop > best.drop) best = { drop, qLo: q, qHi: prevQ, wsp: w }
    prevW = w; prevQ = q
  }
  return best
}
const kink = findKinkBand()
// Ziel-Q in der Mitte des nicht-monotonen Bandes (faellt drop auf ~0, liegt die
// Wurzel direkt am Steigungs-Knick statt im Ruecksprung).
const Q_trans = kink.drop > 1e-6
  ? 0.5 * (kink.qLo + kink.qHi)
  : calculateAtWSP({ ...base, wsp: kink.wsp }).Q_total * 1.001

const cases = [
  { name: 'HQ100',      Q: Q_HQ100 },
  { name: 'HQ100x2',    Q: Q_HQ100x2 },
  { name: 'Uebergang',  Q: Q_trans },
]

const Ns = [10, 20, 50, 100, 200, 500]

// ─── Zeitmessung: Median der Einzellaufzeit ─────────────────────────────────
function timeMedian(fn, reps) {
  const t = []
  for (let r = 0; r < reps; r++) {
    const t0 = performance.now()
    fn()
    t.push(performance.now() - t0)
  }
  t.sort((a, b) => a - b)
  return t[Math.floor(t.length / 2)]
}

// ─── Diagnose des Bestandsquerschnitts ──────────────────────────────────────
console.log('=== Geometrie / Referenz-Diagnose ===')
console.log(`BUK_min = ${bukMin} m, BOK_min = ${Math.min(...proj.bokProfile.map(p => p.z))} m`)
console.log(`Groesste rueckwaertige Q-Stufe am Uebergang: dQ = ${kink.drop.toFixed(3)} m3/s bei WSP ~ ${kink.wsp.toFixed(3)} m`)
console.log(`  Band [${kink.qLo.toFixed(2)}, ${kink.qHi.toFixed(2)}] m3/s -> Uebergangs-Ziel-Q = ${Q_trans.toFixed(3)} m3/s`)
for (const c of cases) {
  // grobe Referenz mit feinstem N fuer State-Kontrolle
  const wRef = findWSPForQ_N(base, c.Q, wspMin, wspMax, 500)
  const st = calculateAtWSP({ ...base, wsp: wRef }).state
  console.log(`  ${c.name.padEnd(10)} Q=${c.Q.toFixed(1).padStart(7)} m3/s -> WSP(N=500)=${wRef.toFixed(3)} m, state=${st}`)
}
console.log()

// ─── Hauptmessung ───────────────────────────────────────────────────────────
const REPS = 400
const results = []   // {N, wsp:{name->wsp}, ms}
for (const N of Ns) {
  const wsp = {}
  for (const c of cases) wsp[c.name] = findWSPForQ_N(base, c.Q, wspMin, wspMax, N)
  // Zeit: eine Inversion pro Lastfall, gemittelt ueber alle drei, Median ueber REPS
  const ms = timeMedian(() => {
    for (const c of cases) findWSPForQ_N(base, c.Q, wspMin, wspMax, N)
  }, REPS) / cases.length
  results.push({ N, wsp, ms })
}

// ─── Ausgabe Tabelle ────────────────────────────────────────────────────────
console.log('=== Sensitivitaets-Tabelle ===')
console.log('Schrittzahl | WSP HQ100 | WSP HQ100x2 | WSP Uebergang | Rechenzeit (ms)')
for (const r of results) {
  console.log(
    `${String(r.N).padStart(11)} | ${r.wsp['HQ100'].toFixed(3).padStart(9)} | ` +
    `${r.wsp['HQ100x2'].toFixed(3).padStart(11)} | ${r.wsp['Uebergang'].toFixed(3).padStart(13)} | ` +
    `${r.ms.toFixed(4).padStart(15)}`
  )
}
console.log()

// ─── Konvergenz- und Round-Trip-Kontrolle ───────────────────────────────────
console.log('=== Konvergenz vs. feinster Lauf (N=500), |dWSP| in mm ===')
console.log('  N   | HQ100 | HQ100x2 | Uebergang')
const ref = results[results.length - 1].wsp
for (const r of results) {
  const d = name => (Math.abs(r.wsp[name] - ref[name]) * 1000).toFixed(1).padStart(7)
  console.log(`  ${String(r.N).padStart(3)} | ${d('HQ100')} | ${d('HQ100x2')} | ${d('Uebergang')}`)
}
console.log()

console.log('=== Round-Trip-Kontrolle (Q(WSP_result) ~ Q_target) ===')
let rtFail = 0
for (const r of results) {
  for (const c of cases) {
    const Qback = calculateAtWSP({ ...base, wsp: r.wsp[c.name] }).Q_total
    const relErr = Math.abs(Qback - c.Q) / c.Q
    if (relErr > 0.01) {   // 1% Toleranz auf Q
      rtFail++
      console.log(`  FAIL N=${r.N} ${c.name}: Q_back=${Qback.toFixed(1)} vs Q_target=${c.Q.toFixed(1)} (${(relErr*100).toFixed(2)}%)`)
    }
  }
}
console.log(rtFail === 0 ? '  alle Round-Trips < 1% Q-Fehler' : `  ${rtFail} Round-Trip(s) ausserhalb Toleranz`)
