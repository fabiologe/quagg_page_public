"""
TESTRUNDE_FLOOD3D.md -> druckfertiges A4-PDF (PyMuPDF Story).

Aufruf (aus dem Projektwurzelverzeichnis):

    backend/venv/bin/python tools/checkliste_pdf.py \
        TESTRUNDE_FLOOD3D.md TESTRUNDE_FLOOD3D.pdf

Nach jeder Aenderung an der Checkliste neu erzeugen.

Kein pandoc/Chromium auf dem Server — das Layout entsteht über die
Story-Engine von PyMuPDF. Der Konverter ist auf GENAU dieses Dokument
zugeschnitten (Überschriften, Tabellen, Pipeline-Absätze), nicht als
allgemeiner Markdown-Renderer gedacht.
"""
from __future__ import annotations

import html
import re
import sys
from pathlib import Path

import pymupdf

FONTDIR = "/usr/share/fonts/truetype/dejavu/"

# Glyphen, die DejaVu Sans nicht hat -> druckbare Entsprechung
ERSATZ = {"✅": "✓", "＋": "+", "⭙": "⊙", "🗑": "⌧", "🖌": "≈", "ⓘ": "i"}

FARBE = {
    "ink": "#16181d",        # Fließtext, leicht kühles Schwarz
    "kopf": "#12304e",       # Überschriften: tiefes Schiefer-Blau
    "akzent": "#2f6fb0",     # Linien, Abschnittsziffern
    "leise": "#5d6673",      # Nebentext
    "kopfzeile": "#e9eef4",  # Tabellenkopf-Fläche
    "linie": "#ccd5df",
}

CSS = f"""
@font-face {{font-family: dj; src: url(DejaVuSans.ttf);}}
@font-face {{font-family: dj; font-weight: bold; src: url(DejaVuSans-Bold.ttf);}}
@font-face {{font-family: djm; src: url(DejaVuSansMono.ttf);}}

* {{font-family: dj; color: {FARBE['ink']};}}
body {{font-size: 8.4pt; line-height: 1.32;}}

h1 {{font-size: 16pt; color: {FARBE['kopf']}; margin: 0 0 2pt 0;}}
h2 {{font-size: 10.5pt; color: {FARBE['kopf']}; margin: 12pt 0 4pt 0;
     background-color: {FARBE['kopfzeile']}; padding: 4pt 6pt;}}
h3 {{font-size: 8.8pt; color: {FARBE['kopf']}; margin: 8pt 0 2pt 0;}}

p {{margin: 0 0 4pt 0;}}
p.vor {{color: {FARBE['leise']}; font-size: 8.2pt;}}
p.legende {{color: {FARBE['leise']}; font-size: 8.2pt; margin-bottom: 8pt;}}
p.schluss {{color: {FARBE['leise']}; font-size: 8pt; margin-top: 10pt;}}
span.mono {{font-family: djm; font-size: 7.6pt;}}
span.ziffer {{color: {FARBE['akzent']};}}

table {{width: 100%; border-collapse: collapse; margin: 0 0 3pt 0;}}
th {{background-color: {FARBE['kopfzeile']}; color: {FARBE['kopf']};
     text-align: left; font-size: 8.2pt; font-weight: bold;
     border: 1px solid {FARBE['linie']}; padding: 3pt 4pt;}}
td {{border: 1px solid {FARBE['linie']}; padding: 3pt 4pt;
     vertical-align: top; background-color: #ffffff;}}
td.cb, th.cb {{width: 14pt; text-align: center; font-size: 11pt;
                color: {FARBE['akzent']}; padding: 2pt 0 2pt 0;}}
td.el, th.el {{width: 105pt;}}
td.was, th.was {{width: 178pt; color: {FARBE['ink']};}}
td.pruef, th.pruef {{width: 169pt; color: {FARBE['leise']};}}
td.pipe {{width: 452pt;}}
td.pipe b {{color: {FARBE['kopf']};}}
"""


def inline(t: str) -> str:
    """**fett**, *kursiv*, `code` -> HTML; Rest wird escaped."""
    t = html.escape(t, quote=False)
    t = t.replace("\\|", "|")
    t = re.sub(r"`([^`]+)`", r'<span class="mono">\1</span>', t)
    t = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", t)
    t = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<i>\1</i>", t)
    for a, b in ERSATZ.items():
        t = t.replace(a, b)
    return t


def zellen(zeile: str) -> list[str]:
    """Tabellenzeile in Zellen — maskierte Pipes bleiben Text."""
    roh = re.split(r"(?<!\\)\|", zeile.strip())
    return [c.strip() for c in roh[1:-1]]


def zelle_teilen(c: str) -> tuple[str, str]:
    """Führende Checkbox von der Beschriftung trennen."""
    if c.startswith("☐"):
        return "☐", c[1:].strip()
    return "", c


def md_zu_html(md: str) -> str:
    aus: list[str] = []
    zeilen = md.split("\n")
    i = 0
    while i < len(zeilen):
        z = zeilen[i]
        s = z.strip()

        if not s or s == "---":
            i += 1
            continue

        if s.startswith("# "):
            aus.append(f"<h1>{inline(s[2:])}</h1>")
        elif s.startswith("## "):
            # Abschnittsziffer farblich absetzen: "3 · 3D-Editor"
            t = inline(s[3:])
            m = re.match(r"^([0-9P]+)( · | — )(.*)$", t)
            if m:
                t = (f'<span class="ziffer">{m.group(1)}</span>'
                     f"{m.group(2)}{m.group(3)}")
            aus.append(f"<h2>{t}</h2>")
        elif s.startswith("|"):
            # Tabellenblock einlesen
            block = []
            while i < len(zeilen) and zeilen[i].strip().startswith("|"):
                block.append(zeilen[i])
                i += 1
            kopf = zellen(block[0])
            rumpf = [zellen(z) for z in block[2:]]      # [1] ist die ---Zeile
            spalten = ["el", "was", "pruef"]
            aus.append('<table><thead><tr><th class="cb"></th>'
                       + "".join(f'<th class="{spalten[k % 3]}">{inline(v)}</th>'
                                 for k, v in enumerate(kopf))
                       + "</tr></thead><tbody>")
            for r in rumpf:
                cb, erste = zelle_teilen(r[0] if r else "")
                rest = r[1:] if r else []
                tds = (f'<td class="cb">{cb}</td>'
                       f'<td class="el">{inline(erste)}</td>')
                for k, c in enumerate(rest):
                    tds += (f'<td class="{["was", "pruef"][k % 2]}">'
                            f"{inline(c)}</td>")
                aus.append(f"<tr>{tds}</tr>")
            aus.append("</tbody></table>")
            continue
        elif re.match(r"^\*\*P\d", s):
            # Pipeline-Absätze als eigene Tabelle mit Ankreuzspalte
            pipes = []
            while i < len(zeilen) and re.match(r"^\*\*P\d", zeilen[i].strip()):
                t = zeilen[i].strip()
                cb = "☐" if t.endswith("☐") else ""
                pipes.append((cb, t.rstrip("☐ ").strip()))
                i += 1
            aus.append("<table><tbody>")
            for cb, t in pipes:
                aus.append(f'<tr><td class="cb">{cb}</td>'
                           f'<td class="pipe">{inline(t)}</td></tr>')
            aus.append("</tbody></table>")
            continue
        elif s.startswith("**") and s.endswith(":**"):
            aus.append(f"<h3>{inline(s[2:-3])}:</h3>")
        elif s.startswith("Legende:"):
            aus.append(f'<p class="legende">{inline(s)}</p>')
        elif s.startswith("*") and s.endswith("*") and not s.startswith("**"):
            # Schlussnotiz (mehrzeilig kursiv)
            block = [s]
            while not block[-1].rstrip().endswith("*") or len(block) == 1:
                i += 1
                if i >= len(zeilen):
                    break
                block.append(zeilen[i].strip())
            txt = " ".join(block).strip("*")
            aus.append(f'<p class="schluss"><i>{inline(txt)}</i></p>')
        else:
            # Absatz bis zur Leerzeile zusammenziehen
            block = [s]
            while i + 1 < len(zeilen) and zeilen[i + 1].strip() \
                    and not zeilen[i + 1].strip().startswith(("|", "#", "**", "---")):
                i += 1
                block.append(zeilen[i].strip())
            aus.append(f'<p class="vor">{inline(" ".join(block))}</p>')
        i += 1
    return "\n".join(aus)


def geister_entfernen(seite) -> int:
    """
    Story lässt beim Umbruch angeschnittene Tabellenkopf-Flächen stehen:
    getönte Streifen ohne Text, die zu keiner echten Kopfzeile gehören.
    Erkennung über die FÜLLFARBE plus zwei Bedingungen — der Streifen
    enthält keinen Text UND liegt in keiner echten Kopfzeile bzw. keinem
    Abschnittsbalken (die sind >= 15 pt hoch). Damit bleiben Kopfzeilen,
    Balken und die Wort-Hinterlegungen darin unangetastet.
    """
    ton = (0.9137254953384399, 0.9333333373069763, 0.95686274766922)

    def gleich(f):
        return f is not None and all(abs(a - b) < 0.01 for a, b in zip(f, ton))

    getoent = [d["rect"] for d in seite.get_drawings() if gleich(d.get("fill"))]
    traeger = [r for r in getoent if r.height >= 15]      # echte Köpfe/Balken
    woerter = [pymupdf.Rect(w[:4]) for w in seite.get_text("words")]

    weg = 0
    for r in getoent:
        if r.height >= 15:
            continue
        if any(w.intersects(r) for w in woerter):
            continue
        if any(t.y0 - 1 <= r.y0 and r.y1 <= t.y1 + 1 for t in traeger):
            continue
        seite.draw_rect(r + (-0.6, -0.6, 0.6, 0.6), color=None, fill=(1, 1, 1))
        weg += 1
    return weg


def fusszeilen(pfad: Path, titel: str) -> None:
    """Artefakte tilgen, dann Akzentlinie + Seitenzahl auf jede Seite."""
    doc = pymupdf.open(pfad)
    schrift = FONTDIR + "DejaVuSans.ttf"
    n = doc.page_count
    weg = 0
    for k, seite in enumerate(doc, start=1):
        weg += geister_entfernen(seite)
        b = seite.rect
        y = b.y1 - 34
        seite.draw_line(pymupdf.Point(46, y), pymupdf.Point(b.x1 - 46, y),
                        color=pymupdf.utils.getColor("gray"), width=0.4)
        seite.insert_text((46, y + 12), titel, fontsize=7.2,
                          fontfile=schrift, fontname="dj",
                          color=(0.36, 0.40, 0.45))
        rechts = f"Seite {k} von {n}"
        breite = pymupdf.get_text_length(rechts, fontname="helv", fontsize=7.2)
        seite.insert_text((b.x1 - 46 - breite, y + 12), rechts, fontsize=7.2,
                          fontfile=schrift, fontname="dj",
                          color=(0.36, 0.40, 0.45))
    if weg:
        print(f"{weg} Story-Artefakte überdeckt")
    doc.save(pfad.with_suffix(".tmp.pdf"))
    doc.close()
    pfad.with_suffix(".tmp.pdf").replace(pfad)


def main(md_pfad: str, pdf_pfad: str) -> None:
    md = Path(md_pfad).read_text()
    body = md_zu_html(md)
    story = pymupdf.Story(html=f"<body>{body}</body>", user_css=CSS,
                          archive=pymupdf.Archive(FONTDIR))
    writer = pymupdf.DocumentWriter(pdf_pfad)
    seite = pymupdf.paper_rect("A4")
    rahmen = seite + (46, 50, -46, -46)
    weiter = 1
    while weiter:
        dev = writer.begin_page(seite)
        weiter, _ = story.place(rahmen)
        story.draw(dev)
        writer.end_page()
    writer.close()
    fusszeilen(Path(pdf_pfad),
               "flood-3D · Testrunden- und Dokumentations-Checkliste · "
               "Stand 2026-08-11")
    doc = pymupdf.open(pdf_pfad)
    # DejaVu bringt den ganzen Unicode-Vorrat mit — eingebettet sind das
    # ~2,8 MB fuer fuenf Seiten. Untermenge = nur die benutzten Zeichen.
    doc.subset_fonts(verbose=False)
    doc.set_metadata({"title": "flood-3D Testrunden-Checkliste",
                      "author": "quagg engineering",
                      "subject": "Bedienelemente und Rechenwege, Stand "
                                 "flood3d-v1.0-beta"})
    doc.save(pdf_pfad + ".tmp", garbage=4, deflate=True)
    doc.close()
    Path(pdf_pfad + ".tmp").replace(pdf_pfad)
    doc = pymupdf.open(pdf_pfad)
    kb = round(Path(pdf_pfad).stat().st_size / 1024)
    print(f"{pdf_pfad}: {doc.page_count} Seiten, {kb} KB")
    doc.close()


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
