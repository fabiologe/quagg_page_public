<!-- Fabios Entscheidungen zu E1–E9 aus dem Abgleich (abgleich-2026-09-18.md, Abschnitt A6), wörtlich, 2026-09-18. Der Stand von E7 wird unten nachgetragen, sobald gemessen ist. -->

# Entscheidungen E1 bis E9

## E1 Was ist die Wahrheit
Variante a. Das Zustandsjournal bleibt die Wahrheit. Vorher und nachher
je Bauteil werden weiterhin gespeichert.
Das Kommando kommt als Beleg am Vorgang hinzu und ist die Naht zwischen
Oberfläche und Modell, nicht der gespeicherte Zustand.
Begründung. Ein reines Kommandojournal wertet beim Revisionswechsel
still anders aus. Der Drei Wege Vergleich über basis löst genau das
heute auf Zustandsebene und bleibt erhalten.
Folge. Ein Vorgang trägt künftig zwei Dinge, das Kommando als Absicht
und die Einträge als ausgewertetes Ergebnis. Bei Widerspruch gewinnt
das Ergebnis.

## E2 Kennungsvergabe
Der Aufrufer vergibt die Kennung, im Kommando, als Feld neu mit der
Liste der erzeugten GlobalIds.
neueGlobalId wandert aus dem Werkzeug heraus.
Begründung. Ohne das gibt es kein deterministisches Redo, keine
Skriptbarkeit und kein Folgekommando, das ein neu erzeugtes Objekt
referenziert.

## E3 Stabile Kennungen für Unterelemente
Operationen eines Vorgangs bekommen eine eigene stabile Kennung, weil
Auffüllung bis Planum sonst kein adressierbares Ziel hat.
Stützpunkte bekommen keine. Ein Kommando trägt entweder die volle
Punktliste oder adressiert über den alten Punktwert, niemals über einen
Index.

## E4 Reichweite
Regel, nicht Umbauauftrag. Umgebaut wird erst nach dem Durchstich.

Modelljournal, werden Kommandos.
Planinhalt und Rotstift, Issues und BCF, Messungen und Bemaßung.

Eigener Katalogverlauf, getrennt vom Modelljournal.
Vorlagen und Bibliotheksrezepte, Typprofile, Bauformregeln, Regelwerk.

Kein Verlauf.
Ansicht, Zoom, Linienstile, Presets, Planoptionen, Schriftfeld,
Modellsatzwahl, Einheitenlesart.

Kennwerte und Pauschalen bleiben vorerst außen vor und werden nach dem
Durchstich neu bewertet.

## E5 Grenze zwischen ungültig und regelwidrig
Ablehnen darf nur, was sich technisch nicht bauen oder speichern lässt.
Das sind Schemafehler, fehlendes oder gelöschtes Ziel, Zyklus in den
Bezügen, nurLesen und der Mehrbenutzerwächter.
Jede Fachgrenze wird ausgeführt und markiert. Das betrifft namentlich
den DN Bereich 50 bis 4000, den Schachtdurchmesser 300 bis 4000, die
Auffüllhöhe über 60 Meter und die Mindestgüte beim Teilen einer Achse.
Folge für die Oberfläche. Formularfelder verlieren ihre sperrende
Wirkung über bereit. Werte außerhalb des Bereichs sind eingebbar und
erzeugen einen Befund der Schwere warnung.
Das ist bewusst Mehrarbeit in der Oberfläche und wird als eigener
Arbeitsschritt geführt, nicht nebenbei erledigt.

## E6 Verknüpfung
Eigene Bauteile deklarieren ihren Anschluss im Bauplan, als anschluss
mit anfang und ende als GlobalId.
Koinzidenz bleibt der Weg für gelieferte Modelle.
Weichen Deklaration und Koinzidenz voneinander ab, ist das ein Befund
und kein Fehler.
Nebenauftrag. Die feste Toleranz von einem Millimeter in
Netztopologie wird durch den Regelwerkswert netzToleranzM ersetzt,
damit die Regel nicht länger lose im Katalog liegt.

## E7 Höhenbezug eigener Haltungen
Noch keine Entscheidung. Zuerst messen.
Prüfe im Browser an einer eigenen Haltung, ob die im Längsschnitt
angezeigte und geschriebene Sohlhöhe mit der Lage des Rohrkörpers
zusammenpasst oder um den halben Durchmesser abweicht.
Vorgesehene Richtung, falls die Abweichung bestätigt wird. Das Kommando
spricht in Sohlhöhe in Meter über NN, der Bauplan nennt seinen Bezug
ausdrücklich, neue Haltungen schreiben sohle.
Der Messbefund gehört in den Bericht, bevor das Schema entsteht.

## E8 Gelöschtes Ziel
Folgt aus E5.
Bei der Eingabe ablehnen, weil ein fehlendes Ziel technisch unmöglich
ist.
Beim Wiederabspielen oder Rebasen nicht abbrechen. Der Schritt wird
übersprungen und der Vorgang als teilweise wirkungslos markiert.

## E9 Redo
Das gespeicherte Ergebnis wird wieder angewendet, nicht neu ausgewertet.
Begründung. Deterministisch, konsistent mit E1 und mit der Idempotenz
absoluter Werte.
Neu ausgewertet wird nur beim Rebase auf eine neue Lieferrevision, und
dort ist die Neuauswertung gewollt.

## Rangfolge für die Umsetzung
Zuerst E1, E2 und E3, weil das Schema daran hängt.
Danach E7, sobald gemessen ist.
E5 und E6 nach dem Durchstich.
E4 ist eine Regel für künftige Entscheidungen und löst jetzt keinen
Umbau aus.

---

## Nachtrag — Stand von E7

Gemessen am 2026-09-18, siehe [messbefund-e7-hoehenbezug-2026-09-18.md](messbefund-e7-hoehenbezug-2026-09-18.md).
Die Abweichung ist bestätigt: genau DN/2, dreimal gemessen (ohne Browser,
eigene Haltung allein im Browser, eigene Haltung im gelieferten Strang im
Browser). Damit ist die Bedingung erfüllt, und die vorgesehene Richtung gilt:
das Kommando spricht in Sohlhöhe m NN, der Bauplan nennt seinen Bezug,
neue Haltungen schreiben `sohle`.
