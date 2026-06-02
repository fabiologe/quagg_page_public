# Behandlungsbedarf AFS63 (DWA-A 102-2)

Tool zur Ermittlung des **Behandlungsbedarfs von Niederschlagswasser** anhand des Leitparameters
**AFS63** (abfiltrierbare Stoffe < 63 µm) nach dem emissionsbezogenen Nachweis der
**DWA-A 102-2/BWK-A 3-2:2020**, Abschnitt 5.2.3.

Der Nutzer zeichnet Herkunftsflächen als Polygone auf einer Karte, ordnet jeder Fläche manuell eine
DWA-Flächengruppe zu und erhält daraus Belastungskategorie, Stoffabtrag, die Bewertung des
Behandlungserfordernisses und – optional – die Reststofffracht nach Behandlung.

> Routenpfad im Tool-Dashboard: `/tools/afs63`.

---

## 1. Zweck & Kontext

Während [`flood-check`](../flood-check/) das **Rückhaltevolumen** nach DIN 1986-100 (hydraulisch)
berechnet, ermittelt dieses Tool die **stoffliche Behandlungsbedürftigkeit** von Flächen. Anwendungsfälle
(vgl. Anwendungsbeispiel DWA-A 102-2, Abschnitt 1):

- Entwässerungstechnische Neuerschließung im Trennverfahren
- Städtebauliche/entwässerungstechnische Überplanung bestehender Siedlungsgebiete
- Überprüfung und Nachweis bestehender Anlagen

**Scope der 1. Ausbaustufe:** ausschließlich der **Emissionsnachweis** (Stoffbilanz + erforderlicher
Wirkungsgrad). Die **Anlagenbemessung** (Sedimentation/Retentionsbodenfilter/Speichervolumen,
Abschnitt 6 + Anhang B) ist als spätere Stufe vorgesehen (siehe Roadmap).

---

## 2. Bedienablauf

1. **Polygone zeichnen** – Herkunftsflächen mit dem Polygon-Werkzeug der Karte erfassen.
2. **Flächengruppe zuordnen** – pro Fläche eine Gruppe aus Tabelle A.1 wählen (Dropdown);
   Belastungskategorie und spez. Stoffabtrag folgen automatisch.
3. **Ergebnis lesen** – Stoffabtrag gesamt, spez. Stoffabtrag, Ampel „Behandlung erforderlich?“,
   erforderlicher Wirkungsgrad je Kategorie, Aufteilung nach Kategorie.
4. **(Optional) Behandlung** – Modus dezentral (η je Fläche) oder zentral (η<sub>ges</sub>) wählen →
   Reststofffracht und Zielerreichung werden angezeigt.
5. **Exportieren** – PDF-Bericht, Karten-Lageplan (PDF) oder GeoJSON.

Die In-Modul-Info (ℹ️-Button) erläutert Schritt für Schritt, *was wo wie* gerechnet wird.

---

## 3. Normative Grundlagen (extrahiert)

Quellen liegen unter [`Normative-Grundlagen/`](./Normative-Grundlagen/):
`DWA-A_102-2.pdf` (Hauptnorm), `Anwendungsbeispiel_DWA-A_102-2_...pdf` (Rechenweg),
`Korrekturblatt_A_102-2_2020_...pdf`.

### 3.1 Klassifizierung Flächengruppe → Belastungskategorie (Tabelle A.1)

| Kategorie | Flächengruppen (Kurzzeichen) |
|---|---|
| **I** – gering belastet | D, VW1, V1, BG1, BF, BL |
| **II** – mäßig belastet | VW2, V2, BG2, SD1 |
| **III** – stark belastet | V3, SV, SVW, SD2, SF, SL, BG3, SG, SA |

### 3.2 Flächenspezifischer Stoffabtrag b<sub>R,a,AFS63</sub> (Tabelle 4)

| Kategorie | Konzentration | b<sub>R,a,AFS63</sub> |
|---|---|---|
| I | 50 mg/l | **280** kg/(ha·a) |
| II | 95 mg/l | **530** kg/(ha·a) |
| III | 136 mg/l | **760** kg/(ha·a) |

### 3.3 Zulässiger Stoffaustrag

`bR,e,zul,AFS63 = 280 kg/(ha·a)` (Abschnitt 5.2.2.4). Behandlungserfordernis, sobald der
gebietsbezogene Stoffabtrag diesen Wert überschreitet.

### 3.4 Kernformeln (Gl. 3–8)

Bezugsgröße: angeschlossene befestigte Fläche `Ab,a` in **ha** (Polygonfläche in m² / 10.000).

| Gl. | Größe | Formel |
|---|---|---|
| (3) | Teilflächen-Abtrag | `BR,a,i = Ab,a,i · bR,a,AFS63,i` [kg/a] |
| (4) | Gesamt-Abtrag | `BR,a = Σ BR,a,i` [kg/a] |
| (5) | spez. Abtrag Gebiet | `bR,a = BR,a / Ab,a` [kg/(ha·a)] |
| (6) | erf. Wirkungsgrad | `ηerf = max(0; 1 − bR,e,zul / bR,a)` (·100 → %) |
| (7) | Reststofffracht dezentral | `BR,e,i = Ab,a,i · (1 − ηi) · bR,a,AFS63,i` |
| (8) | Reststofffracht zentral | `BR,e = (1 − ηges) · BR,a` |

### 3.5 Sonderfall: Außerortsstraßen (REwS, Tabelle 7)

Niederschlagswasser außerörtlicher Straßen ist **nicht** Gegenstand der DWA-A 102 (A 102-2,
Abschnitt 1). Wird eine Fläche im Tool als **Außerortsstraße** markiert (Schalter + DTV-Eingabe),
werden Kategorie und Fracht DTV-abhängig nach **REwS, Tabelle 7** bestimmt – abweichend von Tab. 4:

| Kategorie | DTV [Kfz/24 h] | AFS63-Abtragsfracht |
|---|---|---|
| I | < 2.000 | ≤ **280** kg/(ha·a) |
| II | 2.000 – 15.000 | **360** kg/(ha·a) *) |
| III | > 15.000 | **550** kg/(ha·a) **) |

*) Für Straßen mit DTV < 15.000 Kfz/24 h liegen außerorts nur wenige Messungen an SOW vor; Bankettproben
(Kocher, 2008) zeigen für DTV 5.000–20.000 deutlich geringere Schadstoffkonzentrationen als für höhere DTV.

**) Mittlere AFS63-Abtragsfrachten nach Grotehusmann et al. (2017), ergänzt um Messdaten von
Kat.-III-Straßenabflüssen mit angenommenem AFS63-Anteil von 84 % an AFS<sub>gesamt</sub>
(Lange et al. 2003; Krauth/Klein 1982).

Die übrigen Formeln (Gl. 3–8) bleiben unverändert; nur b<sub>R,a,AFS63,i</sub> der betroffenen Fläche
stammt aus Tabelle 7 statt Tabelle 4.

---

## 4. Rechenbeispiel (Validierung)

Aus dem Anwendungsbeispiel (Abschnitt 2.3): 8 ha Kat. I, 8 ha Kat. II, 4 ha Kat. III.

```
BR,a = 8·280 + 8·530 + 4·760 = 2.240 + 4.240 + 3.040 = 9.520 kg/a
bR,a = 9.520 / 20 ha          = 476 kg/(ha·a)   (> 280 → Behandlung erforderlich)
ηerf Kat. II = 1 − 280/530    ≈ 47 %
ηerf Kat. III = 1 − 280/760   ≈ 63 %
```

Diese Werte dienen als Smoke-Test-Fixture für den Berechnungskern.

---

## 5. Architektur

| Datei | Verantwortung |
|---|---|
| [`data/dwaA102Categories.js`](./data/dwaA102Categories.js) | Single Source of Truth: Flächengruppen (Tab. A.1), Kategorie-Frachten (Tab. 4), zulässiger Wert, Außerortsstraßen (REwS Tab. 7) |
| [`data/treatmentFacilities.js`](./data/treatmentFacilities.js) | Anlagenbibliothek (Wirkungsgrade, Kategorien, Rückhaltung) + Vorschlagsalgorithmus `suggestFacilities()` |
| [`data/facilityDimensioning.js`](./data/facilityDimensioning.js) | Stufe 2: RKB-Bemessung (η_ges, q_A,Bem, A_RKB, V_RKB) `designRetentionBasin()` + Schrägklärer |
| [`stores/useAfs63Store.js`](./stores/useAfs63Store.js) | Berechnungskern (Gl. 3–8) + Bemessung als Pinia-Store mit reaktiven computed-Werten |
| [`components/SurfaceGroupSelector.vue`](./components/SurfaceGroupSelector.vue) | Dropdown zur manuellen Flächengruppen-Zuordnung mit Kategorie-Badge |
| [`components/Afs63CalculationAudit.vue`](./components/Afs63CalculationAudit.vue) | In-Modul-Info: Eingangsgrößen, Klassifizierung, Formeln, Beispiel |
| [`services/Afs63ReportService.js`](./services/Afs63ReportService.js) | PDF-Bericht + Karten-PDF-Export |
| [`views/Afs63View.vue`](./views/Afs63View.vue) | Hauptansicht (Karte links, Werkzeug-Panel rechts) |

Wiederverwendet aus dem Bestand: `BaseMap` (Polygon-Zeichnen, GeoJSON-Import/Export),
`@turf/area`, `BaseButton`. Struktur gespiegelt von [`flood-check`](../flood-check/).

---

## 5b. Anlagenbibliothek & Vorschlagsalgorithmus

[`data/treatmentFacilities.js`](./data/treatmentFacilities.js) hält ~17 Behandlungs- und
Quellmaßnahmen mit strukturierten AFS63-Wirkungsgraden (`numeric` mit min/max bzw. je Kategorie,
oder `qualitative`), anwendbaren Belastungskategorien und der Eigenschaft „Rückhaltung".

`suggestFacilities(category, ηerf, { needRetention })` bewertet jede für die Kategorie zugelassene
Anlage gegen den erforderlichen Wirkungsgrad:

- **geeignet** – erreichbarer Wirkungsgrad ≥ η<sub>erf</sub>
- **grenzwertig** – bis 5 %-Punkte darunter
- **unzureichend** – mehr als 5 %-Punkte darunter

Sortierung: geeignete zuerst (geringste Überdimensionierung = wirtschaftlichste), dann grenzwertige,
dann unzureichende. Bei **zentraler** Behandlung werden nur Anlagen mit Rückhaltung berücksichtigt.
Der Store stellt die Vorschläge je behandlungsbedürftiger Kategorie als `treatmentSuggestions` bereit;
die View zeigt sie im Ergebnisblock, der PDF-Bericht in Abschnitt 3b.

---

## 5c. Anlagenbemessung Regenklärbecken (Stufe 2)

[`data/facilityDimensioning.js`](./data/facilityDimensioning.js) bemisst ein **Regenklärbecken (RKB)**
nach DWA-A 102-2 Abschnitt 6.2 + Anhang B (= Excel-Hilfe „Bemessung Regenklärbecken" / Tab. 7):

```
b_BÜ     = b_a · a_BÜ                              (Beckenüberlauf-Anteil, ≈ 0,10 bei r_krit=15)
η_ges    = 1 − (280 − b_BÜ) / (b_a − b_BÜ)
q_A,Bem  = −8,333 · ln(η_ges) − 1,6629   [m/h]      (Bild 4, Regression)
Q_Bem,Tr = r_krit · A_b,a · f_D + Q_F    [l/s]      (Gl. B.2)
A_RKB    = 3,6 · Q_Bem,Tr / q_A,Bem      [m²]       (Gl. 10)
V_RKB    = A_RKB · h_RKB                  [m³]       (Gl. 11, h_RKB ≥ 2,0 m)
```

`designRetentionBasin(...)` liefert zusätzlich spez. Volumen und Abmessungen L×B (DWA-A 166,
L:B ≈ 3,5). **Gültigkeit:** q_A,Bem > 0 nur für η_ges < ~0,82 → sonst `feasible=false`, UI/PDF
empfehlen Retentionsbodenfilter (DWA-A 178). Optional Schrägklärer `A_eff = 3,6·Q_Bem,Tr/q_A,max`
(Gl. 12). Store: `dimensioning` (Eingaben) + `dimensioningResult` (computed). View: ausklappbarer
Abschnitt, PDF: Abschnitt 5.

**Validierung (Tab. 7, 8/8/4 ha):** b_a=476 → η_ges=0,458 → q_A,Bem=4,85 m/h → A_RKB=222,5 m² →
V_RKB=445 m³ (≈ 22,3 m³/ha; L×B ≈ 27,9 × 8,0 m).

---

## 6. Annahmen & Grenzen

- Emissionsnachweis (Abschnitt 5.2.3) + RKB-Bemessung (Abschnitt 6.2) im **Trennverfahren**.
- Klassifizierung **manuell** je Polygon (keine automatische Flächenerkennung).
- Abgekoppelte Teilflächen (Abschnitt 5.2.3.4) werden nicht gesondert behandelt – nur die
  gezeichneten, angeschlossenen befestigten Flächen gehen in die Bilanz ein.
- Flächengruppen B/S sind teils objektspezifisch; die Einordnung obliegt dem Anwender.
- **Retentionsbodenfilter** werden nach DWA-A 178 bemessen (dort geregelt, nicht in A 102-2) –
  im Tool nur als Hinweis. **Schrägklärer**: nur A_eff; η_ges/Speicherwirkung per Schmutzfracht­simulation.

---

## 7. Roadmap

- **Mischwasserbehandlung**: erforderliches Gesamtspeichervolumen (Abschnitt 7.3.2 / Excel-Hilfe
  `Zusatzdatei_..._Ermittlung_Gesamtspeichervolumen.xlsx`) – anderes Anwendungsfeld (Mischsystem),
  benötigt Trockenwetter-/Kläranlagen-Kennwerte. Andockbar als eigener Store-Block.
- Retentionsbodenfilter-Bemessung nach DWA-A 178 (eigener Normbezug).
