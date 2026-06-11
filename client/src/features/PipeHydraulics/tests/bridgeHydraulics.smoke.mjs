import { useBridgeHydraulics } from '../composables/useBridgeHydraulics.js'

const { calculateAtWSP } = useBridgeHydraulics()

const terrain = [{x:-24,z:5},{x:-5,z:0},{x:5,z:0},{x:24,z:5}]
const buk = [{x:-15,z:5},{x:15,z:5}]
const bok = [{x:-15,z:6.2},{x:15,z:6.2}]
const kst1 = [{id:'z0',xLeft:null,xRight:null,kst:40,label:'H'}]

const base = { crossSectionPoints: terrain, bukProfile: buk, bokProfile: bok,
  kstZones: kst1, slope:0.001, mu:0.8, muDeck:0.45, zeta:0, nPiers:0, bPier:0.5, flowMode:'auto' }

let fails = 0
function check(name, cond, info='') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${info}`)
  if (!cond) fails++
}

// 1. Freispiegel ohne Pfeiler
const r1 = calculateAtWSP({ ...base, wsp: 4 })
check('1 Freispiegel state=1, Q>0', r1.state === 1 && r1.Q_total > 0, `Q=${r1.Q_total.toFixed(3)}`)
check('1 Fr_open > 0, dh_pier = 0, phi = 0', r1.Fr_open > 0 && r1.dh_pier === 0 && r1.phi === 0,
  `Fr_open=${r1.Fr_open.toFixed(3)}`)

// 2. Freispiegel mit Pfeilern (φ + ζ)
const r2 = calculateAtWSP({ ...base, wsp: 4, nPiers: 2, bPier: 1.5, zeta: 0.9 })
check('2 Pfeiler reduzieren Q (Freispiegel)', r2.Q_total < r1.Q_total,
  `Q ${r1.Q_total.toFixed(3)} -> ${r2.Q_total.toFixed(3)}`)
check('2 phi = 2*1.5/30 = 0.1', Math.abs(r2.phi - 0.1) < 1e-9, `phi=${r2.phi}`)
check('2 dh_pier > 0', r2.dh_pier > 0, `dh_pier=${(r2.dh_pier*100).toFixed(2)} cm`)
check('2 A1 reduziert um ~phi (Öffnung=ganzer benetzter Bereich)',
  r2.A1_total < r1.A1_total, `A1 ${r1.A1_total.toFixed(2)} -> ${r2.A1_total.toFixed(2)}`)

// 3. Druckabfluss
const r3 = calculateAtWSP({ ...base, wsp: 5.5, nPiers: 2, bPier: 1.5, zeta: 0.9 })
check('3 Druck state=2, Q_orifice>0', r3.state === 2 && r3.Q_orifice > 0, `Q_or=${r3.Q_orifice.toFixed(3)}`)
check('3 A_netto = A_bridge*(1-phi)', Math.abs(r3.A_netto - r3.A_bridge * 0.9) < 1e-9,
  `A_br=${r3.A_bridge.toFixed(2)} A_net=${r3.A_netto.toFixed(2)}`)
check('3 Fr_open=0, dh_pier=0 im Druckzustand', r3.Fr_open === 0 && r3.dh_pier === 0)

// 4. Überströmung ohne UW
const r4 = calculateAtWSP({ ...base, wsp: 6.5 })
check('4 Overflow state=3, Q_poleni>0, sigma=1', r4.state === 3 && r4.Q_poleni > 0 && r4.weirSigma === 1,
  `Q_pol=${r4.Q_poleni.toFixed(3)} sigma=${r4.weirSigma}`)

// 5. Überströmung mit eingestautem UW
const r5 = calculateAtWSP({ ...base, wsp: 6.5, wspUW: 6.4 })
check('5 Rückstau: sigma < 1, Q_poleni reduziert', r5.weirSubmerged && r5.weirSigma < 1 && r5.Q_poleni < r4.Q_poleni,
  `sigma=${r5.weirSigma.toFixed(3)} Q_pol ${r4.Q_poleni.toFixed(3)} -> ${r5.Q_poleni.toFixed(3)}`)
const r5b = calculateAtWSP({ ...base, wsp: 6.5, wspUW: 3.0 })
check('5b UW unter BOK: sigma = 1', r5b.weirSigma === 1, `sigma=${r5b.weirSigma}`)

// 6. Totwasserzone (rechtes Vorland inaktiv)
const kst2 = [
  {id:'z0',xLeft:null,xRight:null,kst:40,label:'H'},
  {id:'z1',xLeft:5,xRight:24,kst:40,label:'Totwasser',inactive:true},
]
const r6 = calculateAtWSP({ ...base, wsp: 4, kstZones: kst2 })
check('6 Totwasser reduziert Q und A', r6.Q_total < r1.Q_total && r6.A1_total < r1.A1_total,
  `Q ${r1.Q_total.toFixed(3)} -> ${r6.Q_total.toFixed(3)}, A ${r1.A1_total.toFixed(2)} -> ${r6.A1_total.toFixed(2)}`)

// 7. Alle Zonen inaktiv → Q = 0
const r7 = calculateAtWSP({ ...base, wsp: 4,
  kstZones: [{id:'z0',xLeft:null,xRight:null,kst:40,inactive:true}] })
check('7 Alles Totwasser: Q = 0, A = 0', r7.Q_total === 0 && r7.A1_total === 0)

// 8. Übergangs-Stetigkeit (Manning-Untergrenze beim Zustandswechsel)
const qa = calculateAtWSP({ ...base, wsp: 4.99 }).Q_total
const qb = calculateAtWSP({ ...base, wsp: 5.01 }).Q_total
check('8 Kein Q-Einbruch am Übergang', qb >= qa * 0.98, `Q(4.99)=${qa.toFixed(3)} Q(5.01)=${qb.toFixed(3)}`)

// 9. Monotonie der Ratingkurve (mit Pfeilern + UW)
let prev = 0, mono = true
for (let w = 0.5; w <= 8; w += 0.25) {
  const q = calculateAtWSP({ ...base, wsp: w, nPiers: 2, bPier: 1.0, zeta: 0.9 }).Q_total
  if (q < prev - 1e-9) { mono = false; console.log(`   nicht-monoton bei wsp=${w}: ${prev.toFixed(3)} -> ${q.toFixed(3)}`) }
  prev = q
}
check('9 Ratingkurve monoton steigend', mono)

// 10. Choking-Warnung bei steilem Gefälle + enger Öffnung
const r10 = calculateAtWSP({ ...base, wsp: 3, slope: 0.05 })
check('10 chokeWarn-Feld vorhanden (steiles Gefälle)', typeof r10.chokeWarn === 'boolean',
  `Fr_open=${r10.Fr_open.toFixed(2)} choke=${r10.chokeWarn}`)

console.log(fails === 0 ? '\nALLE TESTS BESTANDEN' : `\n${fails} TEST(S) FEHLGESCHLAGEN`)
process.exit(fails === 0 ? 0 : 1)
