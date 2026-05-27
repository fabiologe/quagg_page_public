---
name: Klasse A — Analytisch exakte Lösungen
tags: [verifikation, ebene-4, klasse-a, unit-test, analytisch]
---

# Klasse A — Analytisch exakte Lösungen

← [[index|Ebene 4 Index]]

Für einfache Geometrien ist der korrekte Wert per Hand berechenbar.
Diese Tests beweisen: **Code = Formel**.

---

## Manning

### A.1 — Rechteck-Gerinne (Freispiegel)

```
Geometrie: terrain=[(-5,0),(5,0)], WSP=2.0, kSt=40, I=0.001

A = B · h = 10 · 2 = 20 m²
P = 10 m  (nur Sohle, keine Böschungen bei diesem Profil)
R = A/P = 20/10 = 2.0 m

Q = 40 · 20 · 2.0^(2/3) · √0.001
  = 40 · 20 · 1.587 · 0.03162
  = 40.09 m³/s
```

**Erwarteter Output:** `Q_total ≈ 40.09 m³/s`, `state = 0` (kein BUK)

---

### A.2 — Zwei-Zonen-Manning

```
Geometrie: terrain=[(-10,0),(0,0),(10,0)]
           Zone links  (-10 bis 0): kSt=20
           Zone rechts (0 bis 10):  kSt=40
           WSP=1.0, I=0.001

Zone links:  A=10, P=10, R=1.0
             Q_l = 20 · 10 · 1.0^(2/3) · √0.001 = 6.32 m³/s

Zone rechts: A=10, P=10, R=1.0
             Q_r = 40 · 10 · 1.0^(2/3) · √0.001 = 12.65 m³/s

Q_total = 6.32 + 12.65 = 18.97 m³/s
```

**Erwarteter Output:** `Q_total ≈ 18.97 m³/s`

---

### A.3 — Q-Skalierung mit I

```
Params wie A.1, nur I variiert:

Q(I=0.001) = 40.09 m³/s
Q(I=0.004) = 40.09 · √(0.004/0.001) = 40.09 · 2.0 = 80.18 m³/s

Ratio: Q(4·I) / Q(I) = exakt 2.0
```

**Erwarteter Output:** Verhältnis = 2.000 (exakt, kein Rundungsfehler)

---

## Orifice

### A.4 — Rechteck-Orifice (freier Ausfluss)

```
Geometrie: terrain=[(-3,0),(3,0)], BUK=[(-3,3),(3,3)]
           WSP=5.0, μ=0.80, ζ=0

A_bridge = B · h_öffn = 6 · 3 = 18 m²
z_centroid = (0+3)/2 = 1.5 m  (Mitte der Öffnung)
h_drive = WSP - z_centroid = 5.0 - 1.5 = 3.5 m

Q = 0.80 · 18 · √(2 · 9.81 · 3.5)
  = 14.4 · √68.67
  = 14.4 · 8.287
  = 119.3 m³/s
```

**Erwarteter Output:** `Q_orifice ≈ 119.3 m³/s`, `state = 2`

---

### A.5 — Orifice mit Rückstau

```
Wie A.4, zusätzlich wspUW=3.0

h_drive = WSP - wspUW = 5.0 - 3.0 = 2.0 m   (nicht Zentroid!)

Q = 0.80 · 18 · √(2 · 9.81 · 2.0)
  = 14.4 · √39.24
  = 14.4 · 6.264
  = 90.2 m³/s
```

**Erwarteter Output:** `Q_orifice ≈ 90.2 m³/s`, `isUWActive = true`

---

### A.6 — ζ-Korrektur

```
Wie A.4, zusätzlich ζ=0.5

μ_eff = 0.80 / √(1 + 0.80² · 0.5)
       = 0.80 / √(1 + 0.32)
       = 0.80 / √1.32
       = 0.80 / 1.149
       = 0.696

Q = 0.696 · 18 · √(2 · 9.81 · 3.5)
  = 12.53 · 8.287
  = 103.8 m³/s
```

**Erwarteter Output:** `mu_eff ≈ 0.696`, `Q_orifice ≈ 103.8 m³/s`

---

## Poleni

### A.7 — Gleichmäßige Überströmung

```
Geometrie: BUK=[(-3,3),(3,3)], BOK=[(-3,4),(3,4)]
           WSP=5.0, μD=0.45

h_ü = WSP - BOK_z = 5.0 - 4.0 = 1.0 m
L_BOK = 6 m

Q = (2/3) · μD · √(2g) · h_ü^(3/2) · L
  = (2/3) · 0.45 · √19.62 · 1.0^1.5 · 6
  = 0.667 · 0.45 · 4.429 · 1.0 · 6
  = 7.97 m³/s
```

**Erwarteter Output:** `Q_poleni ≈ 7.97 m³/s`, `state = 3`
