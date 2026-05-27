---
name: Kalibrierung mit realen Daten
tags: [verifikation, ebene-4, kalibrierung, hec-ras, bollrich]
---

# Kalibrierung mit realen Daten

← [[index|Ebene 4 Index]]

Unit-Tests (Klassen A–E) beweisen: **Code = Formel**.
Kalibrierung beweist: **Formel = Realität**.

---

## Warum Kalibrierung?

Die analytischen Tests prüfen nur ob der Code die gewählten Formeln korrekt ausführt.
Sie prüfen **nicht** ob die Formeln für das spezifische Bauwerk gelten.

Manning-kSt ist empirisch — Literaturwerte haben ±20% Streuung.
μ-Werte für Orifice variieren je nach Kantengeometrie, Einlaufbedingung, Schwebstoffe.

---

## Methode 1 — Pegel-Vergleich

**Voraussetzung:** Bekannte Messstelle mit OW-Pegel, UW-Pegel und Q-Messung.

```
1. Querprofil eintippen (Gelände + BUK + BOK)
2. Sohlgefälle aus Vermessung
3. Ratingkurve berechnen (WSP vs. Q)
4. Mit Messung vergleichen:
   → Systematische Abweichung → kSt oder μ anpassen
   → Streuung → Messungenauigkeit oder 3D-Effekte
```

**Was bei Abweichung prüfen:**
- kSt zu hoch/niedrig? → Vorland-Rauheit, Bewuchs
- μ zu hoch? → Kantenrundung, Einstauverluste
- Δh-Unterschied? → Energieverluste im Zulauf nicht berücksichtigt

---

## Methode 2 — HEC-RAS-Vergleich

```
1. Selbes Querprofil in HEC-RAS modellieren (Normal Depth Boundaries)
2. Q bei identischem WSP vergleichen
3. Abweichung < 5% ist akzeptabel für Einzelbauwerks-Berechnung
```

**Vorteil:** HEC-RAS ist etablierter Standard — Vergleich gibt Vertrauen in die Implementierung.
**Limit:** HEC-RAS verwendet ebenfalls vereinfachte 1D-Methoden — kein "Ground Truth".

---

## Methode 3 — Bollrich/Schröder-Tabellenwerte

Bemessungsbeispiele mit ausgedruckten Lösungen aus:
- Bollrich: "Technische Hydraulik" (Brücken-Kapitel)
- Schröder: "Hydraulik für den Wasserbau"
- DIN 19661-2: Sohlbauwerke (enthält Durchlassberechnung)

**Vorteil:** Unabhängig von HEC-RAS-Implementierung, nachprüfbar.

---

## Typische Kalibrierungsparameter

| Parameter | Typischer Bereich | Kalibrierungshebel |
|-----------|-----------------|-------------------|
| μ | 0.60–0.90 | Haupthebel bei Druckabfluss |
| kSt Hauptgerinne | 25–50 | Haupthebel bei Freispiegel |
| kSt Vorland | 15–30 | Einfluss bei State 3 |
| ζ | 0–1.2 | Nur relevant bei Pfeilern |

---

## Protokoll-Vorlage

```markdown
## Kalibrierungsprotokoll — [Bauwerk, Datum]

Messstelle:     [Name, Gewässer, Fluss-km]
Vermessung:     [Datum, Quelle]
Q-Messung:      [Datum, Methode: ADCP / Flügel / Salzverdünnung]

Profil:         terrainPoints: [...]
                bukProfile:    [...]
                bokProfile:    [...]

Parameter vor Kalibrierung:  kSt=35, μ=0.80, ζ=0
Messung:                     Q=XX m³/s bei WSP=YY m
Berechnung vorher:           Q=ZZ m³/s  (Abweichung: +NN%)

Kalibrierungsschritt:        kSt=30, μ=0.75
Berechnung nachher:          Q=XX m³/s  (Abweichung: ±2%)

Fazit: [Parameter begründen]
```
