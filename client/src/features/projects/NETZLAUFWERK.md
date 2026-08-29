# Projektordner als Netzlaufwerk unter Windows (O1)

Die Projektordner liegen auf der Hetzner StorageBox unter `1_Projekte/`. Für Word, Excel und den
Explorer werden sie als Laufwerk eingebunden — dann öffnet „In Word öffnen" im Cockpit die Datei
direkt, und Änderungen landen ohne Upload im Projektordner.

## Weg 1: WebDAV (empfohlen — funktioniert von überall)

1. Hetzner Console → Storage Box → **WebDAV aktivieren** (kostenlos, Port 443).
2. Windows-Explorer → „Dieser PC" → **Netzlaufwerk verbinden** → Laufwerk `P:` →
   Ordner: `https://uXXXXXX.your-storagebox.de/1_Projekte` (Nutzername/Passwort der StorageBox,
   „Anmeldedaten speichern" anhaken).
3. Danach liegt jedes Projekt unter `P:\01_Laufend\1338_Kanal_MH\…`.

Hinweis: Windows bremst WebDAV-Laufwerke bei sehr großen Dateien (Standardlimit 50 MB) —
`HKLM\SYSTEM\CurrentControlSet\Services\WebClient\Parameters\FileSizeLimitInBytes` auf
`4294967295` setzen und den Dienst „WebClient" neu starten.

## Weg 2: SMB (schneller, aber nur wenn der Anschluss Port 445 durchlässt)

1. Hetzner Console → Storage Box → **Samba/CIFS aktivieren** und „Externe Erreichbarkeit" einschalten.
2. Netzlaufwerk verbinden → `\\uXXXXXX.your-storagebox.de\backup\1_Projekte`.

Viele Provider sperren Port 445 ins Internet — dann bleibt WebDAV.

## Wie das Cockpit die Datei öffnet

Der Knopf „In Word/Excel öffnen" (Stufe 5) ruft das offizielle Office-URI-Schema auf:
`ms-word:ofe|u|https://uXXXXXX.your-storagebox.de/1_Projekte/<Phase>/<Projekt>/<Datei>.docx`.
Office öffnet die Datei über WebDAV zum Bearbeiten; die gespeicherten Anmeldedaten aus Schritt 2
werden wiederverwendet. Meldet Office eine Sicherheitszonen-Warnung, die Adresse
`https://uXXXXXX.your-storagebox.de` unter Internetoptionen → Sicherheit → „Vertrauenswürdige Sites"
eintragen.

Die WebDAV-Basisadresse trägt das Backend aus `PROJEKTE_WEBDAV_URL` (backend/.env) in die Links ein;
ohne den Eintrag zeigt das Cockpit den Pfad zum Kopieren an.
