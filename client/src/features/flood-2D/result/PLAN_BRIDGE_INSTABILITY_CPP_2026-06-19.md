# Plan: Brücken-Instabilität physikalisch sauber fixen (LISFLOOD-FP C++-Patch)

**Datum:** 2026-06-19
**Solver:** `backend/app/api/flood2D/engines/LISFLOOD-FP-trunk/weir_flow.cpp` + `input.cpp`
**Symptom:** `WARNING: Unexpected Bridge flow calc fail at t=…, Soffit … m.` — z.T. nur kosmetisch (Solver
fällt auf Offenkanal zurück), bei dauerhafter Degeneration + Überstau aber instabil (spurious Wasser,
früher die `0.0000.000`-Ausgabekorruption).

> **STATUS 2026-06-19:** Fix **A + B umgesetzt** im Patch `engines/patches/quagg-weir-flow.patch`
> (deckt jetzt `weir_flow.cpp` UND `input.cpp` ab). Verifiziert: Patch applied clean gegen pristine
> 8.0.3, `g++ -fsyntax-only` OK. **Docker-Image `lisflood-fp:latest` neu gebaut** — Patch im Build
> angewandt, `input.cpp`+`weir_flow.cpp` kompiliert, Binary läuft (LISFLOOD-FP 8.0.3).
> **Fix C umgesetzt** (Client `InputGenerator`): `bridgeOpeningGrounded()` prüft Soffit gegen Zelle UND
> Nachbar quer zur Fließachse (orientierungs-agnostisch, ±cs) → degenerierte Kanten erreichen den Solver
> kaum noch. Test `test_bridge_soffit_dem.mjs` um den Nachbar-Fall erweitert; alle Struktur-Tests grün.
> **Offen:** (1) echter Brücken-Lauf zur Verifikation; (2) `lisflood-fp:cuda` (GPU/RunPod) bei GPU-Nutzung
> neu bauen; (3) optionale Deck-Überström-Physik (§4).

---

## 1. Was ist das Problem — exakt

Der Brücken-Orifice in `CalcWeirQx`/`CalcWeirQy` wählt das Fließregime so (weir_flow.cpp ~153–170):

```
Z      = getmin(Soffit−z0, Soffit−z1);   // Öffnungshöhe = Soffit − HÖHERES Bett (Sill)
Area   = Width * Z;
Zratio = h / Z;                          // h = Fließtiefe der Anström-Seite
if (hu < Soffit && hd < Soffit)      Q = Qoc;        // (a) Offenkanal (unter Soffit)
else if (Zratio >= 1 && Zratio<=Tz)  Q = Übergang;   // (b)
else if (Zratio > Tz)                Q = Qp;         // (c) Druck/Orifice
else { printf("Unexpected Bridge flow calc fail…"); Q = Qoc; } // (d) FAIL
```

**Beweis, wann (d) feuert:** Für jede nicht-degenerierte Geometrie (Z > 0) gilt: sobald ein Wasserspiegel
≥ Soffit ist, ist `Zratio ≥ 1` → Zweig (b)/(c). (d) ist mathematisch **nur** erreichbar, wenn
**`Z = min(Soffit−z0, Soffit−z1) ≤ 0`** — dann ist `Zratio = h/Z` negativ (Z<0) bzw. ±∞ (Z=0), trifft
keine Schwelle, und (d) greift. `Z ≤ 0` heißt: **der Soffit liegt auf/unter dem höheren der beiden
Nachbar-Bette** (Sill) — der Brücken­unterzug ist dort „im Boden" (Widerlager / unter die Brücke
ansteigendes Terrain).

**Warum es ungebremst passiert:** `input.cpp:278–299` hat zwar einen Soffit-vs-DEM-Schutz, aber er ist
**doppelt deaktiviert**:
1. Der ganze Korrektur-Block steckt in `if (verbose == ON)` → in Produktion (verbose aus) **übersprungen**.
2. Selbst mit verbose wird nur `EWeir_Weir` korrigiert (Krone → `max(z0,z1)`); der **Brücken-Zweig ist
   auskommentiert** (Zeilen 293–297, inkl. `//Arrptr->Weir_Typ[i] = 0;`).

→ Brücken-Soffits unter Bett erreichen den Solver unverändert. `Area = Width*Z < 0`, `Qp` wird mit
negativer Fläche/`sqrt` als Müll berechnet (in (d) ungenutzt), und der Offenkanal-Fallback `Qoc` „löst"
die Brücke effektiv auf (Wasser fließt durch das Widerlager) — physikalisch falsch und potenziell instabil.

**Nicht das Problem:** Orientierung/Resampling (ausgeschlossen), QVAR-Skalierung (verifiziert korrekt),
NoData-Front (korrekt). Es gibt **keine** Brücken-Duplikate in fv1/dg2/cuda — `weir_flow.cpp` ist die
einzige Stelle (2 Kopien: Qx, Qy). Es gibt **keine Deck-Höhe** im Solver (nur Soffit=`Weir_hc`, Tz=`Weir_m`,
Cd, Width=`Weir_w`) → kein Deck-Überström-Term.

---

## 2. Was physikalisch passieren SOLLTE

| Geometrie an der Brückenkante | korrektes Verhalten |
|---|---|
| Soffit > max(z0,z1)  (echte Öffnung, Z>0) | Orifice/Druck + Übergang + Offenkanal — wie bisher ✅ |
| Soffit ≤ max(z0,z1)  (Sill versperrt, Z≤0) | **KEIN** Unterfluss (Unterzug im Boden). Wasser kann nur ÜBER den Sill = **Wehr auf `max(z0,z1)`**. Also: Barriere mit Überfall, NICHT „transparent" (Qoc) und NICHT Crash. |

Der reine Offenkanal-Fallback (Qoc) ist **falsch** für Widerlager — er macht das Widerlager durchlässig.
Korrekt ist die Behandlung als **Wehr am Sill**.

---

## 3. Empfohlener Fix (physikalisch sauber + robust)

Drei Ebenen, von „Ursache" zu „Sicherheitsnetz":

### A) `input.cpp` — Soffit-vs-Bett-Korrektur reparieren *(Kern-Fix)*
Den Korrektur-Block (278–299) **aus `if (verbose == ON)` herausziehen** (immer aktiv) und für **Brücken
aktivieren**: Hat eine Brückenkante `Soffit ≤ max(z0,z1)`, wird sie zur **Wehr-Kante** mit Krone am Sill:
```cpp
if (Arrptr->Weir_hc[i] < z0 || Arrptr->Weir_hc[i] < z1) {
    if (Arrptr->Weir_Typ[i] == EWeir_Bridge) {
        Arrptr->Weir_Typ[i] = EWeir_Weir;          // grounded → Wehr (Überfall am Sill)
        Arrptr->Weir_hc[i]  = getmax(z0, z1);      // Krone = höheres Bett
    } else {                                       // bestehendes Wehr
        Arrptr->Weir_hc[i]  = getmax(z0, z1);
    }
    if (verbose == ON) printf("Bridge/Weir %i: Soffit unter Bett → Wehr @ %.3f m\n", i, Arrptr->Weir_hc[i]);
}
```
Damit landet die Kante im **bestehenden, stabilen Wehr-Pfad** (Poleni) — kein Brücken-Orifice, kein Fail.
*(Das ist genau die Intention der heute auskommentierten Zeilen 295–296, korrekt umgesetzt + un-gated.)*

### B) `weir_flow.cpp` — Laufzeit-Guard `Z ≤ 0` *(Sicherheitsnetz, beide Kopien Qx+Qy)*
Falls trotz (A) eine degenerierte Kante durchrutscht (FP-Kanten, SGC-Bett-Änderung zur Laufzeit):
```cpp
Z = getmin(Soffit-z1, Soffit-z0);
if (Z <= C(0.0)) {
    Q = C(0.0);   // Unterzug im Boden → kein Unterfluss; Überfall regelt der Wehr-Pfad (A)
    // (kein printf-Spam, kein Müll-Qp/Qoc)
}
else {
    Area = Width*Z;
    … (bisheriger Orifice-Code unverändert) …
}
```
→ Patch `quagg-weir-flow.patch` um diese Hunks erweitern (an beiden `Z = getmin…`-Stellen).

### C) Client `InputGenerator` — T4.3 um Nachbar-Bett erweitern *(weniger Solver-Konversionen)*
Heutiger T4.3-Check verwirft Brückenzellen mit `soffit ≤ DEM(Zelle)+MIN`. Der Solver braucht aber
`soffit > max(z0,z1)` (Zelle **und** Nachbar quer zur Fließachse). Den Check auf die **Nachbarzelle in der
Blockier-Achse** ausweiten (Richtung→Nachbar: S/N→±row, E/W→±col), dann erreichen kaum noch degenerierte
Kanten den Solver. Datei: `client/src/features/flood-2D/middleware/InputGenerator.js` (mesh3d- & Legacy-
Zweig, wo `cell.soffit` gegen `sampleGridZ` geprüft wird).

---

## 4. Optionale Genauigkeits-Erweiterung (eigene Phase, größer)
Das Brücken­modell kennt **keine Deck-Überströmung**: Steigt das Wasser über die **Deckoberkante**, müsste
es zusätzlich als breitkroniges **Wehr über das Deck** abfließen — aktuell bleibt es im Druckast (Qp) und
**unterschätzt** den Abfluss. Umsetzung bräuchte eine **Deck-Höhe als neuen Parameter** (`.weir`-Format +
`input.cpp` + ein zweiter Term `Qp + Q_deckweir`). Der Editor hat die Deckhöhe bereits (`bridge.deck`); sie
müsste durch Export/Format/Solver gereicht werden. **Empfehlung:** erst nach (A)/(B), separat.

---

## 5. Betroffene Dateien
- `backend/app/api/flood2D/engines/LISFLOOD-FP-trunk/input.cpp` — Block 278–299 (Fix A).
- `backend/app/api/flood2D/engines/LISFLOOD-FP-trunk/weir_flow.cpp` — 2× `Z = getmin…` (Fix B).
- `backend/app/api/flood2D/engines/patches/quagg-weir-flow.patch` — neue Hunks aufnehmen.
- `client/src/features/flood-2D/middleware/InputGenerator.js` — T4.3 Nachbar-Check (Fix C, optional).

## 6. Verifikation
1. **Docker-Image neu bauen** (`engines/docker`) — der Patch greift nur im Build.
2. **Kontrollierter Lauf:** Brücke, deren Footprint über ansteigendes Terrain spannt (Soffit zwischen den
   Abutments unter Bett). Erwartung: **keine** `Unexpected Bridge flow calc fail`-Warnung mehr; Abutment-
   Kanten wirken als Wehr (Wasser staut/überfällt, fließt NICHT durch); `res.mass` Qerror klein; keine
   15-m-Tiefenspitzen.
3. **Gegenprobe:** Brücke vollständig über Gerinne (Soffit > Bett überall) → Orifice-Pfad unverändert
   (Regressions-Vergleich gegen einen früheren guten Lauf).
4. **Editor-Test:** `test_bridge_soffit_dem.mjs` um den Nachbar-Bett-Fall erweitern (Fix C).

## 7. Risiken
- Ändert **Solver-Physik** an grounded-Kanten (Orifice→Wehr) → nur per echtem Lauf verifizierbar, **Docker-
  Rebuild nötig**. Hier nicht testbar.
- Wehr-Konversion nutzt die Brücken-Cd/w (Cd~0.8 statt Wehr~1.7) — vertretbare Näherung für eine grounded
  Kante; bei Bedarf Cd beim Konvertieren auf einen Wehr-Default setzen.
- Reihenfolge: **A + B zuerst** (behebt Crash/Instabilität definitiv), C danach (Hygiene), Deck-Überfall
  optional separat.
