# Was eine CDE können muss — Soll und Ist der Quagg-CDE

Stand 2026-10-01.

Das **Soll** stammt, wo möglich, aus **DIN EN ISO 19650-1:2019-08** (in der
Bibliothek vorhanden; Fundstellen unten belegt). Wo die Norm nichts sagt, steht
die Zeile als **Praxis** — eine Festlegung dieses Hauses, keine Normpflicht.
ISO 19650-**2** (Lieferphase) ist im Bestand **nicht** vorhanden; alles, was
dort stünde, ist hier als „nicht belegt" gekennzeichnet.

Das **Ist** ist am Code gemessen, nicht erinnert. Jede Ist-Zeile nennt ihren Ort.

---

## 0 · Was eine CDE überhaupt ist

> **3.3.15 Gemeinsame Datenumgebung, CDE** (en: Common Data Environment)
> „vereinbarte Umgebung für Informationen …"
> — DIN EN ISO 19650-1:2019-08

> **3.3.12 Informationscontainer**
> „benannte persistente Zusammenstellung von Informationen …"
> — ebd.

Zwei Wörter dieser Definitionen tragen alles Weitere:

- **vereinbart** — eine CDE ist kein Dateiserver. Sie ist ein Verfahren, dem
  alle zugestimmt haben. Was nicht geregelt ist, ist nicht in der CDE.
- **persistent** und **benannt** — ein Container verschwindet nicht und ist
  eindeutig ansprechbar. Eine Datei, die überschrieben wird, ist kein Container.

Die Norm empfiehlt ausdrücklich die maschinelle Prüfung:

> „Eine automatisierte Überprüfung der Informationen in der gemeinsamen
> Datenumgebung sollte in Betracht gezogen werden."
> — ebd., Abschn. 12.1

---

## 1 · Der Arbeitsablauf — das Herzstück

ISO 19650-1 Abschnitt 12 heißt „Gemeinsame Datenumgebung – Lösungen und
Arbeitsablauf" und gliedert sich in Zustände und **Übergänge** zwischen ihnen.
Aus dem Inhaltsverzeichnis belegt:

| Abschn. | Titel |
|---|---|
| 12.1 | Grundsätze |
| 12.2 | Der Status „in Bearbeitung" |
| 12.3 | Der Status-Übergang „Prüfen/Bewerten/Freigeben" |
| 12.4 | Der Status „geteilt" |
| 12.5 | Der Status-Übergang „Überprüfung/Autorisierung" |

> „Der Status „geteilt" wird auch für Informationscontainer verwendet, die für
> die gemeinsame Nutzung mit dem Informationsbesteller freigegeben sind und
> bereit für die Autorisierung sind."
> — ebd., Abschn. 12.4

**Der Kern der Sache: die Übergänge sind das Werk, nicht die Zustände.** Ein
Container wird nicht „geteilt", weil jemand ihn in einen Ordner legt — er wird
geteilt, weil er geprüft, bewertet und freigegeben wurde. Eine CDE, die Ordner
anbietet, aber den Übergang nicht erzwingt, ist keine CDE.

```
   ┌──────────────┐  Prüfen/Bewerten/   ┌──────────┐  Überprüfung/   ┌───────────────┐
   │in Bearbeitung│────── Freigeben ───▶│ geteilt  │── Autorisierung ▶│veröffentlicht │
   │     WIP      │      (12.3)         │  Shared  │     (12.5)       │  Published    │
   └──────────────┘                     └──────────┘                  └───────┬───────┘
    Arbeitsgruppe                     mit dem Besteller                       │
    allein, nicht                     geteilt, prüfbar,                       ▼
    zitierfähig                       noch nicht gültig              ┌───────────────┐
                                                                     │  archiviert   │
                                                                     │   Archived    │
                                                                     └───────────────┘
```

**Ist in Quagg — vollständig und erzwungen.** `backend/app/api/projekt/core/cde.py`:

```python
STATUS = ("WIP", "Shared", "Published", "Archived")

STATUS_UEBERGAENGE = {                      # Wert = Mindestrolle
    ("WIP",       "Shared"):    "WERKSTUDENT",
    ("Shared",    "WIP"):       "MITARBEITER",
    ("Shared",    "Published"): "MITARBEITER",
    ("Published", "Archived"):  "MITARBEITER",
    ("Published", "Shared"):    "ADMIN",     # Rücknahme
    ("Archived",  "Published"): "ADMIN",
}
```

Drei Eigenschaften, die über „Ordner mit Namen" hinausgehen:

1. **Was nicht in der Tabelle steht, ist kein Weg.** `WIP → Published` wird
   abgewiesen: „ist kein ISO-19650-Weg (erst über die Zwischenstufe)".
2. **Jeder Übergang hat eine Mindestrolle.** Rückwärts kostet mehr als vorwärts.
   `ADMIN` darf springen — die Korrektur-Eskape —, und jeder Wechsel wird
   auditiert (`audit_schreiben`).
3. **`WIP → Shared` verlangt bei Modellen einen Prüfbericht.**
   `UEBERGANG_VERLANGT_PRUEFUNG = {("WIP", "Shared")}` — und zwar einen
   *vorhandenen*, keinen grünen. Der Kommentar im Code sagt, warum: „die
   Lieferung gehört dem Planer, die CDE meldet." Das ist genau die
   „automatisierte Überprüfung", die 12.1 empfiehlt.

### Die Eignung — wofür, neben dem wo

Der Status sagt, **wo** ein Container steht. Die Eignung sagt, **wofür** er
taugt. Die Codes folgen dem britischen Anhang NA zu ISO 19650-2:

| Code | Bedeutung | Vorgabe bei Status |
|---|---|---|
| `S1` | Koordination | erzeugte Container |
| `S2` | Information | `Shared` |
| `S3` | Prüfung und Kommentar | — |
| `S4` | Freigabe | — |
| `A1` | Freigegeben | `Published` |
| `CR` | Bestand | `Archived` |

Ist: `EIGNUNG` / `EIGNUNG_VORGABE` in `cde.py`, Spiegel im Client
`services/StatusWorkflow.js`; `test_cde.py` hält beide Seiten gleich.

---

## 2 · Die Mussleistungen M1–M24

Spalte **Quelle**: `19650` = belegte Normstelle · `Praxis` = Festlegung dieses
Hauses · `nicht belegt` = steht vermutlich in ISO 19650-2, die hier fehlt.

Spalte **Ist**: ● trägt · ◐ teilweise · ○ fehlt.

### A · Container und Identität

| # | Soll | Quelle | Ist | Ort / Lücke |
|---|---|---|---|---|
| **M1** | Jeder Container ist **benannt und persistent** — er wird nie überschrieben, nur ergänzt | 19650 3.3.12 | ● | `_registriere` ist die EINE Schreibstelle; Dateien unter `CDE/`, Register in `manifest.yaml` |
| **M2** | Jeder Container hat eine **eindeutige, prüfbare Kennung** | Praxis | ● | `sha256` ist der Schlüssel, nicht der Name — Dubletten sind erkennbar |
| **M3** | **Revisionen** je Linie, aufsteigend, lückenlos | 19650 (Container-Verlauf) | ● | `revision` je `(basisname, art)`; Linie wird aus dem **Dateinamen** gerechnet, mit Datumsschutz (`2026-08-31` wird nicht als Revision gefressen) |
| **M4** | **Revisionslinien erkennen**, auch wenn der Name wechselt | Praxis | ◐ | paarweise über `projekt_global_id` (IFCPROJECT-GUID) **und** Basisnamen; trägt nur eine Seite die GUID, entscheidet der Name |
| **M5** | **Benennungskonvention** für Container (Projekt–Urheber–Bauwerk–Ebene–Typ–Disziplin–Nummer) | nicht belegt | **○** | der Dateiname ist frei. Kein Feld für Urheber-Organisation, Disziplin, Bauwerk, Ebene — **größte Lücke im Container-Teil** |
| **M6** | **Metadaten** am Container: Art, Größe, wer, wann, Schema | Praxis | ● | `art, groesse, von, hochgeladen_am, schema, einheit_hinweis` |
| **M7** | **Löschen ist Rückzug, nicht Vernichtung** | Praxis | ● | entfernte Dateien gehen nach `_geloescht/`; ein Container mit Journalbezug wird gar nicht entfernt (422, nennt Satz und Anzahl) |

### B · Zustand, Freigabe, Nachweis

| # | Soll | Quelle | Ist | Ort / Lücke |
|---|---|---|---|---|
| **M8** | Die **vier Zustände** und nur die erlaubten Übergänge | 19650 §12 | ● | `STATUS`, `STATUS_UEBERGAENGE` — Abschnitt 1 |
| **M9** | Der Übergang trägt eine **Rolle** | nicht belegt | ● | Mindestrolle je Übergang; `ADMIN` als Eskape |
| **M10** | **Eignung** neben dem Status | nicht belegt (NA) | ● | `EIGNUNG`, S1–S4/A1/CR |
| **M11** | **Statusverlauf** je Container, unveränderlich | Praxis | ● | `status_historie: [{status, von, am}]` am Eintrag |
| **M12** | **Auditspur** über alle Handlungen | Praxis | ● | `audit_schreiben` bei hochladen, status, pruefung, entfernen, satz_* |
| **M13** | **Formale Übergabe** (Transmittal) mit Begleitschein und Protokoll | nicht belegt | ● | `services/Transmittal.js` + Dialog in `CdeView.vue`: ZIP aus `Shared`/`Published`, Begleitschein, Empfänger, protokolliert |
| **M14** | **Frist und Zuständigkeit** an einer Lieferung | nicht belegt | **○** | kein Feld, keine Erinnerung, keine Benachrichtigung — `grep benachricht\|notif\|mail` in `cde.py`/`router.py` = 0 |

### C · Prüfung und Qualität

| # | Soll | Quelle | Ist | Ort / Lücke |
|---|---|---|---|---|
| **M15** | **Maschinelle Prüfung** der Container | 19650 12.1 („sollte in Betracht gezogen werden") | ● | `backend/app/ifc/pruefe.py`, Stufen `schema · verbund · ids · gherkin · motor`; zweiter Motor als Gegenprobe |
| **M16** | Die Prüfung **hängt am Container**, nicht am Lauf | Praxis | ● | `pruefung` am Registereintrag; `hat_pruefung()` liest auch `herkunft.pruefung` erzeugter Container |
| **M17** | **Prüfregeln als Daten**, nicht als Code | Praxis | ● | IDS 1.0 ist kanonisch (`daten/quagg-starter.ids`, 18 Spezifikationen), Vorschau im Client gegen ifctester gehalten |
| **M18** | Nur **echte Fehler sperren** — Warnungen beraten | Praxis | ● | `pruefe.offen` sperrt allein bei Schwere „fehler"; `ok=None` = ungeprüft = nicht bestanden |

### D · Zusammenarbeit

| # | Soll | Quelle | Ist | Ort / Lücke |
|---|---|---|---|---|
| **M19** | **Issues** am Modell, verortet, mit Blickpunkt | nicht belegt | ● | `services/BcfService.js`, `IfcAnnotations.vue`, Issues je Modell (`issuesJeModell.test.js`) |
| **M20** | **BCF**-Austausch | nicht belegt | ◐ | `BcfService.js` vorhanden; Umfang (BCF-Version, Import/Export-Richtung) in diesem Durchgang **nicht geprüft** |
| **M21** | **Gleichzeitige Bearbeiter** dürfen sich nicht überschreiben | Praxis | ● | Mehrbenutzer-Wächter (Lücke ⑥, 2026-09-02): ein Sichern gegen fremden neueren Stand wird verweigert, der Vorgang kommt zurück; nichts wird überschrieben |
| **M22** | **Kommentar am Container** (nicht nur am Bauteil) | nicht belegt | **○** | nur `anmerkung` im Transmittal |

### E · Koordination über Modelle hinweg

| # | Soll | Quelle | Ist | Ort / Lücke |
|---|---|---|---|---|
| **M23** | **Federation** — mehrere Container als ein Bild, ohne sie zu verschmelzen | 19650 3.3.12 Anm. („Die einzelnen Informationscontainer, die während der Federation verwendet werden, können von verschiedenen Arbeitsgruppen stammen") | ● | Modellsatz; der Viewer lädt mehrere Modelle, Journal je Ebene |
| **M24** | **Ein geprüfter Verbund** als eigener Container, mit Herkunft | Praxis | ● | Verbundexport: `Erdbau_<Satz>_R<nn>.ifc` bzw. Verbund, `herkunft{art, quellen[], commit, pruefung}`; Quellen, die in einem erzeugten Container stecken, fallen aus dem Satz |

---

## 3 · Was Quagg kann, was eine Standard-CDE nicht kann

Die Liste oben misst Quagg an dem, was eine CDE sein muss. Sie verfehlt damit
das Besondere: **in Quagg ist die CDE kein Ablagesystem mit Betrachter, sondern
ein Planungswerkzeug mit Ablage.** Vier Dinge, die eine gekaufte CDE nicht hat:

| | Sache | Ort |
|---|---|---|
| **Q1** | **Eigene Bauteile entstehen in der CDE** und werden zu einem geprüften IFC — nicht nur hochgeladene fremde Modelle | `Bauteilrezepte.js`, `eigenbau.py` |
| **Q2** | **Das Journal ist die Wahrheit, nicht die Datei.** Jede Änderung ist ein Zustandswechsel an einem Bauteil, mit Vorher und Nachher, rückgängig je Vorgang, über Sitzungen hinweg | `stores/useAenderungen.js` |
| **Q3** | **Eine Lieferrevision bricht die eigene Arbeit nicht.** Drei-Wege-Vergleich gegen die Basis, Rebase R01 → R02 mit bestätigter GlobalId-Abbildung | `JournalRebase.js`, `Nachspielen.js` |
| **Q4** | **Abgeleitetes wird gerechnet, nicht gespeichert.** Kanalgraben, Aushub, Verfüllung, Anzeige entstehen bei jedem Aufbau neu aus Rezept und Quelle — ändert sich das Gelände, ändern sich die Massen | `services/ableitung/` |

Das ist der Grund, warum die Mussleistungsliste nicht das Maß der Dinge ist:
**eine CDE, die nur ablegt, braucht M1–M24. Eine, in der geplant wird, braucht
zusätzlich alles aus [planungswerkzeug.md](planungswerkzeug.md).**

---

## 4 · Die Lücken, nach Schmerz geordnet

| Rang | Lücke | warum es wehtut | Aufwand |
|---|---|---|---|
| **1** | **M5 Benennungskonvention** | Ohne Urheber, Disziplin und Bauwerk im Namen ist ein Register ab ~50 Containern unlesbar, und eine Übergabe an ein Büro mit ISO-19650-Vorgaben wird zurückgewiesen. Betrifft `_basisname`, `_registriere`, Upload-Dialog, Transmittal-Begleitschein | mittel |
| **2** | **M14 Frist und Zuständigkeit** | „Wer schuldet mir was bis wann" ist die häufigste Frage an eine CDE, und sie ist hier gar nicht stellbar. Braucht ein Feld am Container, eine Liste, und — damit es wirkt — eine Benachrichtigung über den vorhandenen Mail-Dienst | mittel |
| **3** | **M22 Kommentar am Container** | Heute landet jede Rückmeldung zu einer Lieferung außerhalb des Systems (Mail, Telefon). Der Statusverlauf trägt kein Wort, nur Zustände | klein |
| **4** | **M20 BCF-Umfang** | ungeprüft — erst messen, dann bewerten. Ein halber BCF-Export ist schlimmer als keiner, weil der Empfänger ihn für vollständig hält | erst messen |
| **5** | **M4 Revisionslinie** | funktioniert, solange Dateinamen stabil sind. Ein Planer, der umbenennt *und* keine Projekt-GUID führt, erzeugt eine zweite Linie | klein |

**Was ausdrücklich nicht auf der Liste steht** und warum:

- **Rechte je Container** — die Rollen gelten projektweit. Für ein Büro dieser
  Größe ist das richtig; Rechte je Container sind Verwaltungsaufwand ohne
  Gegenwert, solange alle Beteiligten dasselbe Projekt bearbeiten.
- **Workflow-Designer** — Übergänge als Daten konfigurierbar zu machen, wäre
  ein zweiter Interpreter für sechs Übergänge. Abstraktion auf Vorrat.
- **Volltextsuche über Containerinhalte** — löst ein Problem, das ab M5 kleiner
  ist als heute. Erst M5.

---

## Quellen

**Norm, wörtlich belegt aus der Bibliothek:**
DIN EN ISO 19650-1:2019-08 „Organisation und Digitalisierung von Informationen
zu Bauwerken und Ingenieurleistungen … — Teil 1: Begriffe und Grundsätze",
Abschn. 3.3.12, 3.3.15, 12.1, 12.3, 12.4, 12.5.
Ebenfalls im Bestand: E DIN EN ISO 19650-1:2017-04 (Entwurf).
**Nicht im Bestand:** ISO 19650-2 (Lieferphase) — alle Zeilen „nicht belegt"
beziehen sich vermutlich darauf und sind hier Praxis, nicht Normzitat.

**Code, am 2026-10-01 gelesen:**
`backend/app/api/projekt/core/cde.py` (Status, Eignung, Register, Audit),
`backend/app/ifc/pruefe.py` (Prüftor), `backend/app/ifc/daten/quagg-starter.ids`,
`client/src/features/cde/services/{StatusWorkflow,Transmittal,BcfService}.js`,
`client/src/features/cde/views/CdeView.vue`.

**Vorgeschichte:** die Lücken ①–⑩ des Audits vom 2026-09-02 sind im Code
vermerkt und alle geschlossen — ① Einheitenwache, ④ ISO-Wege im Statusfeld,
⑤ Journal-Anker über den Ladeversatz, ⑥ Mehrbenutzer-Wächter, ⑦ Satz-Vergleich,
⑧ Merkmale neu lesen, ⑨ Bauteilbibliothek, ⑩ Übergabepaket. Dieses Dokument
ist ihre erste Ablage außerhalb der Quelltextkommentare.
