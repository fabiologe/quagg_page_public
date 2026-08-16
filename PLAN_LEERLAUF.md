# Umsetzungsplan: Leerlauf-Fall („rechne, bis es leer ist")

Stand 2026-08-16. Vorarbeit für die Laubkarten — Karte A braucht einen
echten Leerlauf, und ein Leerlauf endet nicht zu einer bekannten ZEIT,
sondern in einem ZUSTAND.

---

## 1. Was es schon gibt (nachgesehen, nicht erinnert)

| Baustein | Wo | Zustand |
|---|---|---|
| Start-Wasserspiegel global | `casespec.Solver.initial_level` | **fertig**, wirkt über `setFields` (`casebuilder.py:447`) |
| Start-Wasserspiegel lokal | `Solver.vorfuellungen` (Prismen, wirken NACH `initial_level`) | **fertig** |
| Restvolumen als Messgröße | Funktionsobjekt `water_volume` (volFieldValue über `alpha.water`) | **fertig**, schreibt im Serien-Takt |
| Abfluss je Rand | `patchflow_<patch>` (α-gewichtet, Vorzeichen: + = verlässt das Gebiet) | **fertig** |
| Lauf von außen anhalten | `local_runner._setze_stopp(case, "writeNow")` | **fertig** — wird schon für die PAUSE benutzt |
| Wächter-Schleife im Runner | `local_runner.py` ~505–535: pollt, liest das Log inkrementell, meldet Fortschritt | **fertig** — genau hier gehört die Prüfung hinein |

**Es fehlt genau ein Stück:** die Entscheidung „jetzt ist Schluss" und
ihre Verankerung in der Fallbeschreibung.

---

## 2. Entwurf

### 2.1 Das Kriterium: Stagnation (Fabios Entscheidung)

Der Lauf endet, wenn sich das **Restvolumen über ein Zeitfenster kaum
noch ändert**:

    |V(t) − V(t − T_fenster)|  <  ε · V_start

Warum diese Variante und nicht „Restvolumen unter x %": Sie fängt beide
Enden desselben Vorgangs — Becken leer **oder** es stehen nur noch
Restpfützen, die nicht mehr ablaufen. Genau diese Pfützen sind für die
Laubkarte interessant, und ein tropfender Auslass hält den Lauf nicht
künstlich am Leben.

**Zwei Sicherungen, ohne die das Kriterium falsch auslöst:**

1. **Anlaufsperre.** Am Anfang steht das Wasser still — `V` ist konstant,
   bevor der Auslass überhaupt anspringt. Ohne Sperre endet der Lauf bei
   t ≈ 0. Deshalb: Stagnation zählt erst, **nachdem** `V` einmal um
   mindestens `mindest_abfall` (Vorgabe 5 % von `V_start`) gefallen ist.
2. **`end_time` bleibt harte Obergrenze.** Das Kriterium kann den Lauf nur
   FRÜHER beenden, nie verlängern.

### 2.2 Wer prüft — der Runner, nicht der Solver

Der Wächter läuft in der vorhandenen Poll-Schleife des Runners
(`local_runner.py` ~505): er liest die vom Funktionsobjekt ohnehin
geschriebene Volumen-Datei unter `postProcessing/water_volume/…`, wertet
das Kriterium aus und schreibt bei Erfüllung `stopAt writeNow` über den
vorhandenen `_setze_stopp`.

Bewusst nicht OpenFOAMs `runTimeControl`: Der Weg über den Runner ist auf
allen Rechenorten identisch, in Python testbar (ohne Solver!), und wir
kennen den Mechanismus schon aus der Pause. Der Solver bleibt unangetastet.

### 2.3 Neue Felder in der Fallbeschreibung

```yaml
solver:
  end_time: 3600            # Obergrenze, großzügig
  abbruch:
    art: stagnation          # später ggf. restvolumen | auslauf
    fenster_s: 30            # Beobachtungsfenster
    schwelle: 0.01           # 1 % von V_start je Fenster
    mindest_abfall: 0.05     # Anlaufsperre: erst 5 % müssen weg sein
    erwartete_dauer_s: 600   # NUR für die Budgetschätzung, s. 3.2
```

`abbruch` ist optional — fehlt es, verhält sich alles wie heute.

---

## 3. Die zwei Fallstricke, die beim Nachsehen aufgefallen sind

### 3.1 Ein früh endender Lauf darf nicht wie ein abgebrochener aussehen
Heute unterscheidet nichts zwischen „bis `end_time` gerechnet",
„abgebrochen" und „Kriterium erfüllt". Deshalb: `ende_grund` ins Manifest
(`zeit` | `kriterium` | `abbruch`) samt Zeitpunkt und ausgelöstem Wert,
sichtbar im Lauf-&-Log-Panel. Ein Lauf, der nach 8 von 60 Minuten endet,
ist sonst nicht von einem Absturz zu unterscheiden.

### 3.2 Eine großzügige `end_time` vergröbert heute das Netz der Feldausgabe
`foamfields.py:190-197` schätzt die Zahl der Ausgabezeitpunkte als
`end_time / write_interval_fields` und leitet daraus ab, **wie fein das
Visualisierungsgitter sein darf**. Setzt man `end_time` großzügig (was der
Auto-Stopp ja gerade erlaubt) und `write_interval_fields` fein (was die
Laubkarten brauchen), schrumpft das Budget — und die automatische
Vergröberung frisst genau die Auflösung, um die es geht.

**Kur:** Steht `abbruch.erwartete_dauer_s`, wird das Budget daraus
geschätzt statt aus `end_time`. Ehrlich formuliert: „Ich rechne höchstens
bis `end_time`, erwarte aber `T` — bemiss das Budget nach `T`."

---

## 4. Stufen

**S1 — Spec + Validierung.** `Abbruch`-Modell in `casespec.py` samt
Migration (fehlt = wie bisher). Befunde in `validate.py`:
- Leerlauf ohne Anfangswasser (kein `initial_level`, keine Vorfüllung)
  → **Fehler**: es gibt nichts zu entleeren.
- Abbruch `stagnation` bei dauerhaftem Zufluss (`inflow_constant q > 0`)
  → **Warnung**: wird nie stagnieren, läuft bis `end_time`.
- `fenster_s` kleiner als das Serien-Schreibintervall → **Warnung**:
  das Fenster sieht dann höchstens einen Messpunkt.

**S2 — Der Wächter (reine Logik zuerst).** `core/leerlauf.py` mit
`stagnation_erreicht(zeiten, volumen, cfg) -> (bool, grund)` — ohne
Dateien, ohne Solver, voll testbar: Anlaufsperre, Fenster, Schwelle,
Restpfützen-Fall, monoton fallendes V, Rauschen.

**S3 — Einhängen in den Runner.** In der Poll-Schleife
(`local_runner.py` ~505) die Volumen-Datei lesen (Glob, robust gegen den
Zeitordner-Namen), Kriterium prüfen, bei Erfüllung `_setze_stopp(case,
"writeNow")`, `emit(event="log", …)` mit Klartext und `ende_grund` melden.
Nach dem Anhalten `stopAt` wieder auf `endTime` zurückstellen (sonst
stoppt eine Wiederaufnahme sofort — dieselbe Falle wie bei der Pause,
dort schon einmal passiert).

**S4 — Budget entkoppeln.** `foamfields.py`: `erwartete_dauer_s` schlägt
`end_time` in der Schätzung (3.2). Test: gleiche Spec mit großzügiger
`end_time` liefert dieselbe Gitterweite wie ohne.

**S5 — Oberfläche.** Im Simulations-Panel ein Block „Ende des Laufs":
Zeit | Leerlauf-Kriterium, mit den Parametern und dem Klartext „rechnet
höchstens bis …". Im Lauf-&-Log-Panel der `ende_grund` als Zeile.

**S6 — Betriebsnotiz.** Wie ein Leerlauf-/Schwall-Paar aufgesetzt wird
(gleiches Netz = gleicher `netz_hash`, Leerlauf mit Anfangsspiegel +
Abbruchkriterium, Schwall über `BcInflowHydrograph`), inklusive der
CFL-Faustformel für `write_interval_fields` aus dem Laubkarten-Befund:
`Δt ≤ 0,5 · dx / u_max`.

---

## 5. Verifikation

- **Ohne Solver:** Die Kriteriumslogik gegen erfundene Volumenverläufe —
  glatter Leerlauf, Restpfütze (V fällt und bleibt stehen), tropfender
  Auslass (V fällt sehr langsam weiter), Rauschen um einen konstanten
  Wert, und der Anlauf (V konstant am Start ⇒ darf NICHT auslösen).
- **Mit Solver, klein:** Ein Mini-Fall mit `initial_level` und offenem
  Auslass, `end_time` bewusst 10× zu groß. Erwartung: Lauf endet nach dem
  Entleeren, Manifest trägt `ende_grund: kriterium`, und die Gitterweite
  ist dieselbe wie bei knapp gesetzter `end_time`.
- Suiten grün (aktuell 638 pytest / 242 vitest).
- Kein Cloud-Lauf ohne Go.

---

## 6. Bewusst offen

- Die anderen zwei Kriterien (Restvolumen, Auslauf-Q) sind vorgesehen,
  aber nicht Teil dieser Runde — das Modell (`art`) trägt sie bereits.
- Automatisches Anschließen eines Schwalls an den Endzustand des
  Leerlaufs (Kette) — eigenes Thema.
- Ob der Leerlauf ohne Zufluss oder mit Drosselabfluss gerechnet wird,
  bleibt Modellierung des Nutzers; das Werkzeug prüft nur auf
  Widersprüche.
