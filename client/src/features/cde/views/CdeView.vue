<template>
  <div class="cde-view">
    <!-- ── Der Ausweg aus dem vergrösserten Ausschnitt ──
         Zwei Finger auf dem Bildschirm vergrössern in manchen Lagen den
         SICHTBAREN Ausschnitt (nicht das Layout). `.cde-view` hängt am
         Layout-Viewport und scrollt nicht — die Leisten sind dann
         unerreichbar, und nichts sagt warum. Diese Leiste klebt deshalb am
         Ausschnitt selbst und ist die einzige Stelle, die dort ankommt. -->
    <div v-if="zoomVergroessert" class="cde-zoom-notleiste" :style="zoomStil">
      <CdeIcon name="status-warn" :size="14" />
      <span>Die Ansicht ist {{ zoomSkala.toFixed(1) }}× vergrössert — die Leisten liegen ausserhalb.</span>
      <button class="cde-zoom-btn" @click="ansichtZuruecksetzen">Ansicht zurücksetzen</button>
      <span class="cde-zoom-tipp">oder mit zwei Fingern auszoomen · Strg+0</span>
    </div>

    <!-- ── Auftrags- und Satz-Leiste (Managen) ──
         Der AUFTRAG steht fest (er kommt aus dem Ordner) und ist deshalb Text,
         kein Wähler. Gewählt wird der MODELLSATZ — die Variante. -->
    <div class="cde-bar">
      <span class="cde-brand"><CdeIcon name="cde" :size="17" /> CDE</span>

      <span v-if="cde.auftrag" class="cde-auftrag" :title="`Auftrag ${cde.auftrag.nummer} — kommt aus dem Projektordner`">
        {{ cde.auftrag.nummer }} · {{ cde.auftrag.name }}
      </span>

      <template v-if="cde.auftrag">
        <select class="cde-project-select" :value="cde.aktiverSatzId ?? ''" @change="onSatzChange"
                title="Modellsatz — eine benannte Auswahl aus den Modellen des Auftrags">
          <option value="">— ganzer Auftrag —</option>
          <option v-for="s in cde.saetze" :key="s.id" :value="s.id">
            {{ s.name }}<template v-if="s.zweck && s.zweck !== 'variante'"> ({{ s.zweck }})</template>
          </option>
        </select>

        <button class="cde-btn" @click="onNeuerSatz" title="Modellsatz anlegen — übernimmt die aktuelle Auswahl">
          <CdeIcon name="add" :size="14" /> Satz
        </button>
        <button class="cde-btn" :disabled="!cde.aktiverSatz" @click="onSatzUmbenennen" title="Modellsatz umbenennen">
          <CdeIcon name="edit" :size="14" />
        </button>
        <button class="cde-btn" :disabled="!cde.aktiverSatz" @click="onSatzLoeschen"
                title="Modellsatz löschen — die Modelle bleiben">
          <CdeIcon name="delete" :size="14" />
        </button>
        <!-- Verbund: die Modelle des Satzes (und der CDE-Eigenbau) als EIN
             geprüftes IFC4X3. Gerechnet wird auf dem Server — darum nur mit
             Projektordner, nicht in der Browser-Ablage. -->
        <button class="cde-btn" :disabled="!cde.aktiverSatz || !repo.remote" @click="verbundOeffnen"
                :title="repo.remote
                  ? 'Verbund — die Modelle des Satzes zu EINEM geprüften IFC4X3 zusammenführen'
                  : 'Der Verbund braucht den Projektordner — CDE aus dem Projekt-Cockpit öffnen'">
          <CdeIcon name="layers" :size="14" /> Verbund
        </button>
      </template>

      <button
        class="cde-btn"
        :disabled="!cde.auftrag"
        :class="{ active: showStammdaten }"
        @click="showStammdaten = !showStammdaten; showRegister = false"
        title="Auftrags-Stammdaten"
      ><CdeIcon name="stammdaten" :size="14" /> Stammdaten</button>
      <button
        class="cde-btn"
        :disabled="!cde.auftrag"
        :class="{ active: showRegister }"
        @click="showRegister = !showRegister; showStammdaten = false"
        title="Dokument-Register (ISO-19650-Status)"
      ><CdeIcon name="documents" :size="14" /> Dokumente <small v-if="cde.dokumente.length">({{ cde.dokumente.length }})</small></button>
      <button
        class="cde-btn"
        :class="{ active: showBauformen }"
        @click="oeffneBauformen"
        title="Bauformen zuordnen — was bedeuten die Namen dieses Exporteurs?"
      ><CdeIcon name="element" :size="14" /> Bauformen</button>

      <span class="cde-sep" />

      <!-- Ansichts-Umschalter (Sprint P): 3D-Modell ↔ gezeichneter Lageplan.
           Datenquelle ist der Modus-Katalog, damit Umschalter, Befehlspalette
           und Hilfe-Overlay nicht auseinanderlaufen. -->
      <div class="cde-ansicht-schalter">
        <button
          v-for="m in ansichtsModi"
          :key="m.id"
          class="cde-ansicht-btn"
          :class="{ active: ansicht.modus === m.id }"
          :disabled="!modusMoeglich(m.id)"
          :title="modusTitel(m)"
          @click="ansicht.setzeModus(m.id)"
        ><CdeIcon :name="m.icon" :size="13" /> {{ m.kurz }}</button>
      </div>

      <span class="cde-sep" />

      <!-- Panel-Umschalter (Sprint U): eine Quelle — die Panel-Registry -->
      <button
        v-for="p in panels.defs"
        :key="p.id"
        class="cde-btn ghost"
        :class="{ active: panels.isOpen(p.id) }"
        :title="`${p.titel} ein-/ausblenden`"
        @click="panels.toggle(p.id)"
      ><CdeIcon :name="p.icon" :size="14" /></button>

      <span class="cde-spacer" />

      <!-- X2: Hilfe und der Ausgang wohnen in der Kopfzeile — die
           That-Open-Zeile des Viewers ist entfallen. -->
      <button class="cde-btn ghost" title="Tastenkürzel anzeigen [?]" @click="hilfeUmschalten">
        <CdeIcon name="help" :size="14" />
      </button>
      <button class="cde-btn ghost" title="CDE verlassen — zurück zu den Tools" @click="router.push('/tools')">
        <CdeIcon name="open" :size="14" />
      </button>
      <label class="cde-bearbeiter" title="Bearbeiter-Name — Autor für Issues, Kommentare und Statuswechsel">
        <CdeIcon name="user" :size="14" />
        <input
          type="text"
          :value="cde.bearbeiter"
          placeholder="Bearbeiter…"
          @change="cde.setBearbeiter($event.target.value)"
        />
      </label>
    </div>

    <!-- Bericht der einmaligen Übernahme (Stufe 11.5). Er nennt Alteinträge
         ohne Datei beim Namen — die dürfen nicht in der Konsole enden. -->
    <div v-if="migrationsBericht" class="cde-panel cde-migration">
      <CdeIcon name="info" :size="14" />
      <span>{{ migrationsBericht }}</span>
      <button class="cde-btn sm" @click="migrationsBericht = ''" title="Ausblenden" aria-label="Ausblenden">
        <CdeIcon name="close" :size="12" />
      </button>
    </div>

    <!-- ── Auftragswähler ──
         Ohne `?projekt=` gibt es keinen Auftrag. Vorher stand hier eine
         Client-Projektliste, in der man sich Projekte ausdenken konnte, die es
         gar nicht gibt. Jetzt kommen sie aus dem Projektbestand. -->
    <div v-if="!cde.auftrag" class="cde-panel cde-auftragswahl">
      <h2>Auftrag wählen</h2>
      <p class="cde-hint">
        Die CDE arbeitet im Ordner eines Auftrags: dort liegen die Modelle, das
        Register und die Festlegungen. Ohne Auftrag lässt sich eine IFC nur
        ansehen — nichts wird abgelegt.
      </p>
      <p v-if="auftragsFehler" class="cde-fehler">{{ auftragsFehler }}</p>
      <ul v-else-if="auftraege.length" class="cde-auftragsliste">
        <li v-for="a in auftraege" :key="a.id">
          <button class="cde-auftrag-knopf" :disabled="!a.ordner" @click="onAuftragWaehlen(a.id)">
            <span class="nr">{{ a.id }}</span>
            <span class="nm">{{ a.name || '(ohne Bezeichnung)' }}</span>
            <small v-if="!a.ordner">kein Projektordner</small>
          </button>
        </li>
      </ul>
      <p v-else class="cde-hint">Keine Aufträge gefunden.</p>
    </div>

    <!-- ── Stammdaten-Panel ──
         NUR ANZEIGE. Nummer, Bezeichnung und Bauherr gehören dem Projekt und
         werden in der Akte gepflegt; sie hier bearbeitbar zu machen hiesse,
         dieselbe Angabe an zwei Orten zu führen. Genau daran sind vorher schon
         Register und Status auseinandergelaufen. -->
    <div v-if="showStammdaten && cde.auftrag" class="cde-panel">
      <div class="cde-panel-grid">
        <label>Auftrags-Nr.<input type="text" :value="cde.auftrag.nummer" readonly /></label>
        <label>Bezeichnung<input type="text" :value="cde.auftrag.name" readonly /></label>
        <label>Bauherr / AG<input type="text" :value="cde.auftrag.bauherr || '—'" readonly /></label>
        <label>Leistungsphase<input type="text" :value="cde.auftrag.lph || '—'" readonly /></label>
      </div>
      <div class="cde-panel-footer">
        <span class="cde-hint">Aus dem Projektordner — geändert wird in der Projekt-Akte.</span>
        <a class="cde-btn" :href="`/intern/projects?projekt=${cde.auftrag.id}`" target="_blank" rel="noopener">
          <CdeIcon name="open" :size="14" /> Zur Akte
        </a>
      </div>
    </div>

    <!-- ── Bauformen zuordnen (Stufe 9.3a) ──
         Manche Software gibt alles als IFCBUILDINGELEMENTPROXY aus — dann sagt
         der Typ nichts, der NAME aber sehr wohl. Hier wird einmal erklärt, was
         er bedeutet; das gilt danach für jede Datei aus derselben Software.
         Die Maschine RÄT nicht, sie zeigt nur, was sie gefunden hat. -->
    <div v-if="showBauformen" class="cde-panel">
      <p class="cde-hint">
        Was in diesem Modell wie heisst — und was es bedeutet. Die Zuordnung
        wird als Regel gespeichert und gilt für jede weitere Lieferung aus
        derselben Software.
      </p>
      <p v-if="bauformAbdeckung.gesamt" class="cde-hint">
        {{ bauformAbdeckung.mit }} von {{ bauformAbdeckung.gesamt }} benannten Bauteilen
        zugeordnet<span v-if="bauformAbdeckung.ohne"> — die übrigen
        {{ bauformAbdeckung.ohne }} werden aus der Geometrie eingeordnet und
        bleiben sichtbar, messbar und zeichenbar.</span>
      </p>
      <!-- WORAN erkennen? Nicht jeder Exporteur schreibt Namen: die
           Erdbau-Lieferungen tragen an ihren Körpern „Name = $", dort ist der
           vordefinierte Typ das einzige Merkmal, an dem man sie fassen kann. -->
      <label class="cde-hint bf-feld">
        Erkennen an
        <select class="doc-status" :value="bauformFeld" @change="setzeBauformFeld($event.target.value)">
          <option v-for="f in MERKMALSFELDER" :key="f.name" :value="f.name">{{ f.titel }}</option>
        </select>
      </label>
      <!-- Typen, die das 4.3-Wörterbuch nicht kennt (2026-09-07): gestrichen
           oder exporteureigen. Sie sind trotzdem da — strukturell gefunden —,
           aber Vererbung und Typprofile greifen nicht; die Geometrie schlägt vor. -->
      <p v-if="fremdeTypen.length" class="cde-hint">
        Nicht im IFC-4.3-Wörterbuch, strukturell erkannt:
        <span v-for="f in fremdeTypen" :key="f.typ" class="bf-fremd">{{ f.typ.replace(/^IFC/, '') }} ({{ f.anzahl }})</span>
        — ältere Schemafassung oder eigener Name; hier zuordnen.
      </p>
      <div v-if="!bauformVorschlaege.length" class="cde-empty">
        Kein Modell geladen.
      </div>
      <table v-else class="cde-doc-table">
        <thead>
          <tr><th>Kategorie</th><th>Wert</th><th>Anzahl</th><th title="Was die Geometrie an einem Beispiel misst">Gemessen</th><th>Bauform</th></tr>
        </thead>
        <tbody>
          <tr v-for="v in bauformVorschlaege" :key="`${v.category}|${v.name}|${v.art}`" :class="{ 'bf-kategorie': v.art === 'kategorie' }">
            <td class="doc-name">{{ v.category.replace(/^IFC/, '') }}</td>
            <td class="doc-name">
              <template v-if="v.art === 'kategorie'"><span class="bf-alle">ganze Kategorie</span></template>
              <template v-else>{{ v.name }}<template v-if="v.art === 'gruppe'"><span class="bf-gruppe"
                :title="`Fasst ${v.namen.length} Namen zusammen: ${v.namen.slice(0, 6).join(', ')}${v.namen.length > 6 ? ' …' : ''}`"
              >…</span></template></template>
            </td>
            <td class="doc-rev">{{ v.anzahl }}</td>
            <!-- Die Formsignatur eines BEISPIELS je Gruppe — der Vorschlag,
                 mit Grund im Tooltip. Ohne Deklaration gilt genau das. -->
            <td class="bf-messung" :title="v.geometrie?.grund ?? ''">
              <template v-if="v.geometrie">
                <span :class="['tb-guete', 'bf-guete--' + v.geometrie.guete]">{{ BAUFORMEN[v.geometrie.bauform]?.titel ?? v.geometrie.bauform }}</span>
                <span class="bf-dim">({{ v.geometrie.guete }})</span>
              </template>
              <span v-else-if="v.geometrie === null" class="bf-dim">—</span>
              <span v-else class="bf-dim">…</span>
            </td>
            <td>
              <select
                class="doc-status"
                :value="v.bauform ?? ''"
                @change="setzeBauform(v, $event.target.value)"
              >
                <option value="">— wie gemessen —</option>
                <option v-for="(b, schluessel) in BAUFORMEN" :key="schluessel" :value="schluessel">
                  {{ b.titel }}
                </option>
              </select>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── Dokument-Register ── -->
    <div v-if="showRegister && cde.auftrag" class="cde-panel">
      <div v-if="!cde.dokumente.length" class="cde-empty">
        Noch keine Modelle registriert — beim Laden einer IFC-Datei mit aktivem
        Auftrag wird sie automatisch als <b>WIP</b> aufgenommen.
      </div>
      <table v-else class="cde-doc-table">
        <thead>
          <tr>
            <!-- Die Spalte steht IMMER, nur ihr Inhalt hängt am Satz — eine
                 Zelle per `v-if` aus einer keyed `v-for`-Zeile zu nehmen ändert
                 die Kinderzahl der Zeile zwischen zwei Durchläufen. Das war
                 NICHT die Ursache der Renderabstürze (die lag in
                 IfcStoreyNav), aber es bleibt die stabilere Form. -->
            <th class="doc-satz" :title="cde.aktiverSatz ? `Im Modellsatz „${cde.aktiverSatz.name}“` : ''">
              {{ cde.aktiverSatz ? 'Satz' : '' }}
            </th>
            <th>Dokument</th><th title="Woraus die CDE das Dokument erzeugt hat — hochgeladene haben keine Herkunft">Herkunft</th><th>Rev.</th><th>Größe</th><th>Status (ISO 19650)</th><th>Aufgenommen</th><th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in sortedDokumente" :key="d.sha256">
            <!-- Stufe 11.4: Was liegt im aktiven Modellsatz? Der Haken ist die
                 EINZIGE Stelle, an der sich Varianten unterscheiden — alles
                 andere (Dateien, Register, Status) gehört dem Auftrag. -->
            <td class="doc-satz">
              <input
                v-if="cde.aktiverSatz"
                type="checkbox"
                :checked="(cde.aktiverSatz.enthaelt ?? []).includes(d.sha256)"
                :title="`In „${cde.aktiverSatz.name}“ führen`"
                @change="satzUmschalten(d.sha256)"
              />
            </td>
            <td class="doc-name" :title="d.sha256">{{ d.name }}</td>
            <!-- Stufe 3 (Aushub-Fachmodell): ein erzeugtes Dokument sagt, woraus. -->
            <td class="doc-herkunft">
              <span v-if="herkunftJe.get(d.sha256)" class="cde-badge" :class="herkunftJe.get(d.sha256).veraltet ? 'warn' : 'mute'"
                    :title="herkunftJe.get(d.sha256).titel">{{ herkunftJe.get(d.sha256).text }}</span>
            </td>
            <td class="doc-rev">{{ d.revision }}</td>
            <td class="doc-size">{{ fmtBytes(d.size) }}</td>
            <td>
              <!-- Lücke ④: das Feld bietet nur ISO-19650-Wege an — Gesperrtes
                   bleibt sichtbar (grau, Grund im title), und eine Ablehnung
                   springt zurück statt still stehen zu bleiben. -->
              <select
                class="doc-status"
                :class="`iso-${d.status.toLowerCase()}`"
                :value="d.status"
                :title="statusTitle(d)"
                @change="statusWechseln(d, $event)"
              >
                <option
                  v-for="z in statusZiele(d.status, auth.rolle)"
                  :key="z.status" :value="z.status"
                  :disabled="!z.ok" :title="z.grund ?? ''"
                >{{ z.status }}</option>
              </select>
            </td>
            <td class="doc-date">{{ fmtDate(d.addedAt) }}</td>
            <td class="doc-actions">
              <button class="cde-btn sm" @click="openDokument(d)" title="Modell öffnen" aria-label="Modell öffnen">
                <CdeIcon name="open" :size="12" />
              </button>
              <button class="cde-btn sm danger" @click="cde.removeDokument(d.sha256)" title="Aus Register entfernen" aria-label="Aus Register entfernen">
                <CdeIcon name="delete" :size="12" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="statusHinweis" class="doc-status-hinweis">
        <CdeIcon name="warn" :size="12" /> {{ statusHinweis }}
      </p>
      <!-- Übergabepaket (Lücke ⑩): Transmittal aus Shared/Published-Dokumenten
           mit Begleitschein — der formale ISO-19650-Ausgang. -->
      <div class="doc-fuss">
        <button
          class="cde-btn ghost"
          :disabled="!uebergabefaehige.length"
          :title="uebergabefaehige.length
            ? 'Übergabepaket (ZIP mit Begleitschein) aus Shared/Published-Dokumenten schnüren'
            : 'Erst ein Dokument auf Shared oder Published setzen — WIP wird nicht übergeben'"
          @click="transmittalOeffnen"
        ><CdeIcon name="send" :size="13" /> Übergabepaket…</button>
        <span v-if="transmittalProtokoll.length" class="doc-fuss-info">
          {{ transmittalProtokoll.length }} Übergabe{{ transmittalProtokoll.length === 1 ? '' : 'n' }} protokolliert
        </span>
      </div>
    </div>

    <!-- ── Arbeitsfläche: Leiste | Viewer | Leiste ──
         Panels docken an und verkleinern den Viewer, statt ihn zu verdecken —
         am Modell abzulesende Geometrie bleibt sichtbar (Sprint U). -->
    <div class="cde-workspace">
      <CdePanel
        v-if="panels.aktivLinks"
        :titel="panels.aktivLinks.titel"
        :icon="panels.aktivLinks.icon"
        seite="left"
        :breite="panels.breiten[panels.aktivLinks.id]"
        @close="panels.close(panels.aktivLinks.id)"
        @resize="(w) => panels.setBreite(panels.aktivLinks.id, w)"
      >
        <!-- Erster Nutzer des head-actions-Slots: die beiden Baum-Knöpfe, die
             früher im Modal-Kopf der Struktur saßen (Sprint P/AP-12). -->
        <template v-if="panels.isOpen('struktur')" #head-actions>
          <button class="cp-head-btn" title="Alle aufklappen" @click="strukturRef?.expandAll()">
            <CdeIcon name="chevron-down" :size="13" />
          </button>
          <button class="cp-head-btn" title="Alle zuklappen" @click="strukturRef?.collapseAll()">
            <CdeIcon name="chevron-right" :size="13" />
          </button>
        </template>
        <IfcSpatialWindow v-if="panels.isOpen('struktur')" ref="strukturRef" />
      </CdePanel>

      <div class="cde-viewer-host">
        <!-- Der 3D-Viewer bleibt IMMER im Baum und wird nur unsichtbar
             geschaltet. Zwei Gründe, beide teuer erkauft:
             (1) `onBeforeUnmount` gibt die Engine frei und entwertet den
                 viewerApi, an dem sämtliche Panels hängen;
             (2) `display:none` setzt die Canvas-Größe auf 0 — der Renderer
                 schreibt daraufhin einen 0x0-Puffer und liefert beim
                 Zurückschalten ein schwarzes Bild.
             Deshalb `visibility`, nicht `v-if` und nicht `v-show`. -->
        <div class="host-lage" :class="{ verborgen: ansicht.modus !== '3d' }">
          <IfcViewer
            ref="viewerRef"
            :propertiesOpen="panels.isOpen('eigenschaften')"
            @close="onClose"
            @open-properties="panels.open('eigenschaften')"
            @model-loaded="onModelLoaded"
          />
        </div>

        <!-- Der Längsschnitt-Host (Stufe 17.1). Der Modus stand seit
             Sprint P im Katalog und war seit 14.1 freigeschaltet — gezeigt
             hat er bis hier NICHTS: Taste 3 führte auf eine leere Fläche. -->
        <div v-if="ansicht.modus === 'laengsschnitt'" class="host-lage">
          <LaengsschnittCanvas />
        </div>

        <div v-if="ansicht.modus === 'lageplan'" class="host-lage">
          <IfcPlanCanvas
            ref="planRef"
            :optionen="planOptionen"
            :titleBlock="planSchriftfeld"
            :logo="plan.logo"
            @zeichnen-beendet="zeichenstandAbgleichen"
            @werkzeug-beendet="planWerkzeugBeendet"
          />
          <!-- Werkzeuge des Lageplans (X3): VIER GRUPPEN statt einundzwanzig
               Knöpfen — Zeichnen, Setzen, Stift als Anker mit Popover
               (das PdfToolbar-Muster), Bemaßen direkt. Die Listen kommen
               weiter aus dem Katalog; ein Werkzeug, das dort fehlt, kann
               hier nicht stehen. -->
          <div class="plan-werkzeuge">
            <button
              class="plan-wz"
              :class="{ aktiv: zeichenWerkzeug || planPopover === 'zeichnen' }"
              :disabled="!bearbeitung.modusAn"
              :title="bearbeitung.modusAn ? 'Zeichnen — Bauteile anlegen und umlegen' : 'Zeichnen — Bearbeiten ist aus (E schaltet ein)'"
              @click="planPopoverUm('zeichnen')"
            ><CdeIcon name="add" :size="14" /></button>

            <button
              class="plan-wz"
              :class="{ aktiv: planModus || planPopover === 'setzen' }"
              title="Setzen — Beschriftung und Symbole in den Plan"
              @click="planPopoverUm('setzen')"
            ><CdeIcon name="pointer" :size="14" /></button>

            <button
              class="plan-wz"
              :class="{ aktiv: stiftModus || planPopover === 'stift' }"
              title="Rotstift — freihand anmerken und radieren"
              @click="planPopoverUm('stift')"
            ><CdeIcon name="edit" :size="14" :style="stiftModus ? { color: stiftFarbe } : null" /></button>

            <span class="plan-wz-trenner"></span>

            <button
              class="plan-wz"
              :class="{ aktiv: misstImPlan }"
              title="Bemaßen — zwei Punkte im Plan anklicken [Esc beendet]"
              @click="planPopover = null; bemassungUmschalten()"
            ><CdeIcon name="bemassen" :size="14" /></button>
            <button
              v-if="ifc.planDimensions.length"
              class="plan-wz"
              :title="`Alle ${ifc.planDimensions.length} Maße entfernen`"
              @click="ifc.clearPlanDimensions()"
            >
              <CdeIcon name="delete" :size="14" />
              <span class="plan-wz-zahl">{{ ifc.planDimensions.length }}</span>
            </button>

            <!-- ── Die Popover der drei Gruppen ── -->
            <div v-if="planPopover === 'zeichnen'" class="plan-popover">
              <button
                v-for="z in ZEICHEN_WERKZEUGE"
                :key="z.id"
                class="pp-zeile"
                :class="{ aktiv: zeichenWerkzeug === z.id }"
                :title="`${z.titel} — Punkte klicken, Doppelklick schliesst ab [Esc bricht ab]`"
                @click="zeichenWerkzeugSetzen(z.id); planPopover = null"
              ><CdeIcon :name="z.icon" :size="13" /> {{ z.titel }}</button>

              <!-- Bauteilbibliothek (Lücke ⑨): Vorlagen = Rezept + vorbelegte
                   Werte. Projekt schlägt Büro schlägt eingebauten Satz. -->
              <div v-if="vorlagen.length" class="pp-trenner">Vorlagen</div>
              <div v-for="v in vorlagen" :key="v.id" class="pp-vorlage">
                <button
                  class="pp-zeile"
                  :title="`${v.name} — ${v.herkunft === 'eingebaut' ? 'eingebaute Vorlage' : v.herkunft === 'buero' ? 'Büro-Vorlage' : 'Projekt-Vorlage'}`"
                  @click="vorlageZeichnen(v)"
                ><CdeIcon :name="v.rezept === 'schacht' ? 'schacht' : v.rezept === 'rohr' ? 'laengsschnitt' : 'route'" :size="13" /> {{ v.name }}</button>
                <button
                  v-if="v.herkunft !== 'eingebaut'"
                  class="pp-vorlage-weg"
                  :title="`Vorlage löschen (${v.herkunft === 'buero' ? 'Büro' : 'Projekt'})`"
                  aria-label="Vorlage löschen"
                  @click="vorlageEntfernen(v)"
                ><CdeIcon name="delete" :size="11" /></button>
              </div>
              <button
                v-if="bearbeitung.scharf?.rezept"
                class="pp-zeile pp-sichern"
                title="Die Werte des scharfen Zeichenwerkzeugs als Vorlage sichern (ohne Bezeichnung und Höhe)"
                @click="vorlageSichern"
              ><CdeIcon name="save" :size="13" /> Als Vorlage sichern…</button>
            </div>

            <div v-if="planPopover === 'setzen'" class="plan-popover">
              <button class="pp-zeile" :class="{ aktiv: planModus === 'text' }"
                      @click="planModusSetzen('text'); planPopover = null">
                <CdeIcon name="text" :size="13" /> Beschriftung setzen
              </button>
              <button
                v-for="sym in PLAN_SYMBOL_NAMES"
                :key="sym"
                class="pp-zeile"
                :class="{ aktiv: planModus === sym }"
                @click="planModusSetzen(sym); planPopover = null"
              ><span class="plan-wz-sym">{{ SYMBOL_KURZ[sym] ?? '?' }}</span> {{ SYMBOL_TITEL[sym] ?? sym }}</button>
              <button
                v-if="planInhalt.anzahl"
                class="pp-zeile"
                :class="{ aktiv: planModus === 'loeschen' }"
                @click="planModusSetzen('loeschen'); planPopover = null"
              ><CdeIcon name="delete" :size="13" /> Planinhalt entfernen ({{ planInhalt.anzahl }})</button>
            </div>

            <div v-if="planPopover === 'stift'" class="plan-popover">
              <button class="pp-zeile" :class="{ aktiv: stiftModus === 'stift' }"
                      @click="stiftSetzen('stift'); planPopover = null">
                <CdeIcon name="edit" :size="13" :style="{ color: stiftFarbe }" /> Rotstift
              </button>
              <div class="pp-farben">
                <button
                  v-for="f in STIFT_FARBEN"
                  :key="f"
                  class="plan-wz farbe"
                  :class="{ aktiv: stiftFarbe === f }"
                  :style="{ '--farbe': f }"
                  title="Stiftfarbe"
                  @click="stiftSetzen('stift', f); planPopover = null"
                ></button>
              </div>
              <button
                v-if="rotstift.anzahl"
                class="pp-zeile"
                :class="{ aktiv: stiftModus === 'radierer' }"
                @click="stiftSetzen('radierer'); planPopover = null"
              ><CdeIcon name="radierer" :size="13" /> Radieren ({{ rotstift.anzahl }} Striche)</button>
            </div>
          </div>
        </div>
      </div>

      <CdePanel
        v-if="panels.aktivRechts"
        :titel="panels.aktivRechts.titel"
        :icon="panels.aktivRechts.icon"
        seite="right"
        :breite="panels.breiten[panels.aktivRechts.id]"
        @close="panels.close(panels.aktivRechts.id)"
        @resize="(w) => panels.setBreite(panels.aktivRechts.id, w)"
      >
        <IfcSemanticWindow  v-if="panels.isOpen('eigenschaften')" />
        <IfcPlanningCockpit v-else-if="panels.isOpen('cockpit')" />
        <IfcPlanPanel v-else-if="panels.isOpen('plan')" @stile-oeffnen="stilEditorOffen = true" />
        <CdeToolbox v-else-if="panels.isOpen('toolbox')" />
        <IfcAenderungenTab v-else-if="panels.isOpen('verlauf')" />
        <IfcAnnotations
          v-else-if="panels.isOpen('issues')"
          :annotationActive="annotationActive"
          :zoomToPoint="zoomToIssue"
          :applyViewpoint="(vp) => viewerRef?.applyViewpoint(vp)"
          :captureViewpoint="() => viewerRef?.captureViewpoint() ?? null"
          @toggle-mode="onToggleIssueMode"
        />
      </CdePanel>
    </div>

    <IfcVectorStyleEditor v-if="stilEditorOffen" @close="stilEditorOffen = false" />
    <!-- U2: Der Commit-Dialog — das Ende jeder Sitzung, egal in welcher
         Ansicht sie lief. -->
    <CommitDialog />

    <!-- Übergabepaket (Lücke ⑩): Auswahl → ZIP mit Begleitschein + Protokoll. -->
    <CdeDialog :offen="transmittalOffen" titel="Übergabepaket schnüren" icon="send"
               @close="transmittalOffen = false">
      <p class="tm-satz">
        Übergeben wird nur <b>Shared</b> oder <b>Published</b> — WIP ist
        Arbeitsstand, Archived ist aus dem Verkehr. Das Paket enthält die
        Dateien und einen Begleitschein; die Übergabe wird protokolliert.
      </p>
      <label v-for="d in uebergabefaehige" :key="d.sha256" class="tm-zeile">
        <input type="checkbox" :value="d.sha256" v-model="transmittalWahl" />
        <span class="tm-name">{{ d.name }}</span>
        <span class="tm-meta">Rev. {{ d.revision }} · {{ d.status }}</span>
      </label>
      <label class="tm-feld">
        <span>Empfänger</span>
        <input v-model="transmittalEmpfaenger" type="text" placeholder="z. B. Stadtwerke, Herr M." />
      </label>
      <label class="tm-feld">
        <span>Anmerkung</span>
        <textarea v-model="transmittalAnmerkung" rows="2" placeholder="optional"></textarea>
      </label>
      <p v-if="transmittalMeldung" class="tm-meldung">
        <CdeIcon name="warn" :size="12" /> {{ transmittalMeldung }}
      </p>
      <template #fuss>
        <button class="cde-btn ghost" @click="transmittalOffen = false">Abbrechen</button>
        <button class="cde-btn primary" :disabled="!transmittalWahl.length || transmittalLaeuft"
                @click="transmittalErzeugen">
          {{ transmittalLaeuft ? 'Packt …' : `Paket erzeugen (${transmittalWahl.length})` }}
        </button>
      </template>
    </CdeDialog>

    <!-- Verbund (2026-09-10): Modellsatz → EIN geprüftes IFC4X3, im Register und
         zum Herunterladen. Gerechnet wird auf dem Server (Unterprozess); hier
         wird angestoßen, abgeholt und der Prüfbericht gezeigt. -->
    <CdeDialog :offen="verbundOffen" :titel="verbundModus === 'erdbau' ? 'Erdbau-Dokument' : 'Verbundmodell'" icon="layers" @close="verbundOffen = false">
      <template v-if="!verbundLauf">
        <p class="tm-satz">
          Die Modelle des Satzes <b>{{ cde.aktiverSatz?.name }}</b> werden zu einer
          IFC4X3-Datei zusammengeführt — Schema, Einheiten und Bezugssystem
          vereinheitlicht, dann geprüft. Nur ein bestandener Verbund kommt als
          neues Dokument (WIP) ins Register.
        </p>
        <div v-for="d in verbundModelle" :key="d.sha256" class="tm-zeile">
          <span class="tm-name">{{ d.datei ?? d.name }}</span>
          <span class="tm-meta">
            <template v-if="verbundWeggelassen.get(d.sha256)">fällt weg — steckt in {{ verbundWeggelassen.get(d.sha256) }}</template>
            <template v-else>Rev. {{ d.revision }} · {{ d.status }}{{ d.herkunft?.art === 'erdbau' ? ' · Erdbau' : '' }}</template>
          </span>
        </div>
        <p v-if="!verbundModelle.length" class="tm-satz">Der Satz enthält kein Modell.</p>
        <p v-for="v in verbundErdbauVeraltet" :key="`alt-${v.erdbau}`" class="tm-meldung">
          <CdeIcon name="warn" :size="12" /> {{ v.erdbau }} wurde aus {{ v.quelle }} gebaut — {{ v.neu }} ist neuer: Erdbau neu registrieren
        </p>
        <!-- Stufe 3: der Erdbau kommt ENTWEDER aus einem Dokument des Satzes ODER
             live aus der CDE — beides zugleich stellte den Aushub doppelt in den
             Verbund, und der Server lehnt es ab. -->
        <label class="tm-zeile" :title="verbundErdbauImSatz.length ? `Der Satz führt ${verbundErdbauImSatz.join(', ')} — der Erdbau kommt aus dem Dokument` : ''">
          <input type="checkbox" v-model="verbundEigenbau" :disabled="verbundErdbauImSatz.length > 0" />
          <span class="tm-name">CDE-Eigenbau live mitnehmen</span>
          <span class="tm-meta">{{ verbundErdbauImSatz.length ? `nicht nötig — ${verbundErdbauImSatz.join(', ')} im Satz` : 'was die CDE selbst erzeugt hat' }}</span>
        </label>
        <p class="tm-satz">
          <b>Erdbau registrieren</b> legt den Erdbau der CDE als eigenes Dokument ab: das
          gelieferte Gelände unverändert, je Vorgang Aushub und Auftrag mit Mengen —
          geprüft wie jeder Verbund, als „Erdbau_{{ cde.aktiverSatz?.name }}_R…“.
        </p>
      </template>
      <template v-else>
        <p class="tm-satz">
          <CdeIcon :name="verbundSymbol" :size="13" />
          <b>{{ verbundZustandText }}</b>
          <template v-if="verbundLaeuft"> — {{ verbundLauf.schritt || 'wartet auf den Server' }}</template>
        </p>
        <p v-if="verbundLauf.fehler" class="tm-meldung">
          <CdeIcon name="warn" :size="12" /> {{ verbundLauf.fehler }}
        </p>
        <div v-if="verbundLauf.dokument" class="tm-zeile">
          <span class="tm-name">{{ verbundLauf.dokument.datei }}</span>
          <span class="tm-meta">Rev. {{ verbundLauf.dokument.revision }} · WIP · im Register</span>
        </div>
        <p v-if="verbundLauf.bericht?.crs" class="tm-satz">
          Bezugssystem <b>{{ verbundLauf.bericht.crs }}</b> — {{ verbundLauf.bericht.crs_herkunft }}
        </p>
        <p v-for="l in verbundEigenbauLuecken" :key="l.art" class="tm-meldung">
          <CdeIcon name="warn" :size="12" /> Eigenbau, nicht im Verbund ({{ l.art }}): {{ l.anzahl }}
        </p>
        <p v-for="w in verbundFehlendeWirte" :key="w" class="tm-meldung">
          <CdeIcon name="warn" :size="12" /> Aushub ohne sein Gelände ({{ w }}) — das gelieferte Gelände in den Satz aufnehmen
        </p>
        <p v-for="w in verbundOhneWirt" :key="`ohne-${w}`" class="tm-meldung">
          <CdeIcon name="warn" :size="12" /> Aushub {{ w }} nennt kein Gelände — im Journal fehlt seine Quelle
        </p>
        <p v-for="w in verbundLauf.weggelassen || []" :key="`weg-${w.datei}`" class="tm-satz">
          <CdeIcon name="info" :size="12" /> {{ w.datei }} — {{ w.grund }}
        </p>
        <div v-for="b in verbundLauf.befunde || []" :key="b.id" class="tm-zeile" :title="b.sagt">
          <CdeIcon :name="b.ok === true ? 'status-ok' : b.ok === false ? 'status-error' : 'status-warn'" :size="12" />
          <span class="tm-name">{{ b.id }} · {{ b.titel }}</span>
        </div>
        <template v-for="q in verbundLauf.quellen_bericht || []" :key="q.name">
          <div class="tm-zeile">
            <span class="tm-name">{{ q.name }}</span>
            <span class="tm-meta">{{ q.schema }} · Faktor {{ q.einheit_faktor }} · {{ q.uebernommen }} Bauteile</span>
          </div>
          <p v-for="(w, i) in q.warnungen || []" :key="`${q.name}-${i}`" class="tm-meldung">
            <CdeIcon name="warn" :size="12" /> {{ w }}
          </p>
        </template>
      </template>
      <p v-if="verbundMeldung" class="tm-meldung">
        <CdeIcon name="warn" :size="12" /> {{ verbundMeldung }}
      </p>
      <template #fuss>
        <button class="cde-btn ghost" @click="verbundOffen = false">{{ verbundLauf ? 'Schließen' : 'Abbrechen' }}</button>
        <button v-if="!verbundLauf" class="cde-btn" :disabled="verbundStartet"
                title="Den Erdbau der CDE als eigenes, geprüftes Dokument ins Register — Erdbau_<Satz>_R<nn>.ifc"
                @click="verbundStarten('erdbau')">
          <CdeIcon name="terrain" :size="13" /> Erdbau registrieren
        </button>
        <button v-if="!verbundLauf" class="cde-btn primary"
                :disabled="verbundStartet || (!verbundModelle.length && !verbundEigenbau)"
                @click="verbundStarten('verbund')">
          {{ verbundStartet ? 'Startet …' : 'Verbund erzeugen' }}
        </button>
        <button v-else-if="verbundLauf.dokument" class="cde-btn primary" @click="verbundHerunterladen">
          <CdeIcon name="download" :size="13" /> Herunterladen
        </button>
      </template>
    </CdeDialog>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useViewerApi } from '../composables/viewerApi.js';
import IfcViewer from '../components/IfcViewer.vue';
import IfcPlanCanvas from '../components/IfcPlanCanvas.vue';
import LaengsschnittCanvas from '../components/LaengsschnittCanvas.vue';
import CommitDialog from '../components/CommitDialog.vue';
import CdeDialog from '../components/ui/CdeDialog.vue';
import { REPO_KEY_TRANSMITTALS, UEBERGABEFAEHIG, baueSchein, paketName, protokollEintrag, pruefeAuswahl } from '../services/Transmittal.js';
import IfcSemanticWindow from '../components/IfcSemanticWindow.vue';
import IfcSpatialWindow from '../components/IfcSpatialWindow.vue';
import IfcPlanningCockpit from '../components/IfcPlanningCockpit.vue';
import IfcPlanPanel from '../components/IfcPlanPanel.vue';
import CdeToolbox from '../components/CdeToolbox.vue';
import IfcVectorStyleEditor from '../components/IfcVectorStyleEditor.vue';
import IfcAnnotations from '../components/IfcAnnotations.vue';
import IfcAenderungenTab from '../components/IfcAenderungenTab.vue';
import CdeIcon from '../components/ui/CdeIcon.vue';
import CdePanel from '../components/ui/CdePanel.vue';
import { useCdeStore, ISO_STATUS, resolveWatermarkText } from '../stores/useCdeStore.js';
import { useZoomSperre } from '../composables/useZoomSperre.js';
import { statusZiele } from '../services/StatusWorkflow.js';
import { ladeVorlagen, speichereVorlage, loescheVorlage } from '../services/Bibliothek.js';
import { useAuthStore } from '@/stores/useAuthStore.js';
import { usePlan } from '../stores/usePlan.js';
import { usePlanInhalt } from '../stores/usePlanInhalt.js';
import { useRotstift, STIFT_FARBEN } from '../stores/useRotstift.js';
import { PLAN_SYMBOL_NAMES } from '../services/PlanSymbols.js';
import { repo, RemoteBackend, BueroBackend } from '../services/RepoFacade.js';
import { AuftragApi } from '../services/AuftragApi.js';
import { herkunftChip, imErdbauEnthalten, quellenVeraltet } from '../services/Herkunft.js';
import { berichtText, migriere } from '../services/SatzMigration.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { BAUFORMEN } from '../services/bauform/Bauformen.js';
import { BEARBEITUNGEN, eingabeArt } from '../services/Bearbeitungen.js';
import { MERKMALSFELDER, abdeckung } from '../services/bauform/Bauformregeln.js';
import { usePanels } from '../stores/usePanels.js';
import { useAnsicht } from '../stores/useAnsicht.js';
import { useIfcStore } from '../stores/useIfcStore.js';
import { usePaletteCommands } from '../stores/useCommands.js';
import { modusListe, istVerfuegbar } from '../services/ViewModes.js';
// Design-Tokens — landen bewusst auf :root (teleportierte Panels erben sonst nichts)
import '../styles/theme.css';

const router = useRouter();

/** X2: Hilfe über die viewerApi — die Merkstelle greift auch neben dem Viewer. */
function hilfeUmschalten() {
  try { useViewerApi().hilfeUmschalten?.(); } catch { /* Viewer noch nicht da */ }
}
const route = useRoute();
// Stufe C: mit ?projekt=<id> lebt das Repository im Projektordner auf dem Server.
// Muss VOR den Stores passieren — sie lesen beim Anlegen aus dem Backend.
const cockpitProjektId = Number(route.query.projekt);
if (Number.isInteger(cockpitProjektId) && cockpitProjektId > 0) {
  repo.setBackend(new RemoteBackend(cockpitProjektId));
} else if (repo.remote) {
  repo.setBackend(null);
}

// Büro-Ebene (Stufe 6): Plankopf-Vorlagen, Linienstil-Presets, Symbolsätze,
// IDS-Regelwerke und KG-Kennwerte gelten projektübergreifend. Sie liegt NEBEN
// dem Projekt-Repository, nicht darin — deshalb ein eigenes Backend und kein
// weiterer Scope. Ohne Netz bleibt sie aus; die Vorrangregel fällt dann auf
// den eingebauten Standard.
repo.setBueroBackend(new BueroBackend());
const cde = useCdeStore();

/**
 * Zoom-Sperre und Ausweg (2026-09-03). Die Sperre wirkt, solange die CDE
 * steht; die Notleiste erscheint nur, wenn der Ausschnitt trotzdem
 * vergrössert ist — etwa weil er es beim Laden schon war.
 */
const { vergroessert: zoomVergroessert, skala: zoomSkala, leistenStil: zoomStil } = useZoomSperre();
/** Neu laden setzt den Ausschnitt zurück — JS kann ihn nicht selbst verkleinern. */
function ansichtZuruecksetzen() { window.location.reload(); }
const auth = useAuthStore();
const aenderungen = useAenderungen();
/** Die Aufträge zur Auswahl — nur gefüllt, wenn `?projekt=` fehlt. */
const auftraege = ref([]);
const auftragsFehler = ref('');
/** Was die einmalige Übernahme alter Client-Projekte ergeben hat (Stufe 11.5). */
const migrationsBericht = ref('');
const panels = usePanels();
const ansicht = useAnsicht();
const ifc = useIfcStore();
const bearbeitung = useBearbeitung();
const plan = usePlan();
const planInhalt = usePlanInhalt();
const rotstift = useRotstift();
const cmds = usePaletteCommands();

const viewerRef = ref(null);
const planRef = ref(null);
const strukturRef = ref(null);
const showStammdaten = ref(false);
/** Linienstil-Editor. Sein einziger Einhängepunkt war bisher das PDF-Modal. */
const stilEditorOffen = ref(false);
const showRegister = ref(false);
const showBauformen = ref(false);
/** Die Namen des geladenen Modells samt bereits zugeordneter Bauform. */
const bauformVorschlaege = ref([]);
/** Woran erkannt wird — Name, vordefinierter Typ, Objekttyp, Beschreibung. */
const bauformFeld = ref('Name');
/** Wie viel davon zugeordnet ist — damit man weiss, wann man aufhören kann. */
const bauformAbdeckung = ref({ mit: 0, ohne: 0, gesamt: 0 });

/** Typen ausserhalb des 4.3-Wörterbuchs — aus den geladenen Dateien. */
const fremdeTypen = ref([]);
let _messLauf = 0;

/**
 * Je Gruppe die Formsignatur EINES Beispiels messen — asynchron, nach dem
 * Aufbau der Liste. Ein späterer Aufbau verwirft die Antworten des früheren
 * (Laufnummer); begrenzt, damit ein grosses Modell das Panel nicht blockiert.
 */
async function messeVorschlaege(zeilen) {
  const lauf = ++_messLauf;
  for (const v of zeilen.slice(0, 60)) {
    if (!v.beispiel) { v.geometrie = null; continue; }
    v.geometrie = undefined;
    try {
      const r = await viewerRef.value?.getFormsignatur?.(v.beispiel.modelId, v.beispiel.localId);
      if (lauf !== _messLauf) return;
      v.geometrie = r ? { bauform: r.bauform, guete: r.guete, grund: r.grund } : null;
    } catch {
      if (lauf !== _messLauf) return;
      v.geometrie = null;
    }
  }
}

/** Vorschläge und Abdeckung neu berechnen — nach jeder Zuordnung. */
function frischeVorschlaege() {
  const index = ifc.getSearchIndex();
  bauformVorschlaege.value = bearbeitung.vorschlaege(index, bauformFeld.value)
    .map(v => ({ ...v, geometrie: undefined }));
  fremdeTypen.value = viewerRef.value?.getFremdeTypen?.() ?? [];
  messeVorschlaege(bauformVorschlaege.value);
  // Die Abdeckung zählt über ALLE Merkmale, nicht nur über das gewählte —
  // sonst sänke sie beim blossen Umschalten der Ansicht, und das läse sich
  // wie ein Verlust.
  bauformAbdeckung.value = abdeckung(
    (index ?? []).map(e => ({
      category: e.category,
      attributes: {
        Name: e.name ?? '', PredefinedType: e.predefinedType ?? '',
        ObjectType: e.objectType ?? '', Description: e.description ?? '',
      },
    })),
    bearbeitung.regeln,
  );
}

function setzeBauformFeld(feld) {
  bauformFeld.value = feld;
  frischeVorschlaege();
}

function oeffneBauformen() {
  showBauformen.value = !showBauformen.value;
  showStammdaten.value = false;
  showRegister.value = false;
  // Frisch berechnen: der Suchindex kommt erst nach dem Laden, und eine
  // Zuordnung ändert die Spalte „Bauform" sofort.
  if (showBauformen.value) frischeVorschlaege();
}

async function setzeBauform(v, bauform) {
  // `art` UND `propertyName` müssen mit: ohne `art` schriebe eine Gruppenzeile
  // eine `equals`-Regel, die auf „Haltung 1" … „Haltung 18" nie passt (bis
  // 2026-09-03 genau so, still).
  await bearbeitung.ordneZu({
    category: v.category, name: v.name, art: v.art,
    propertyName: v.feld ?? 'Name', bauform: bauform || null,
  });
  frischeVorschlaege();
}

// ── Ansichts-Umschaltung (Sprint P, AP-8) ────────────────────────────────────

const ansichtsModi = modusListe();

function modusMoeglich(id) { return istVerfuegbar(id, ansicht.stand); }
function modusTitel(m) {
  return modusMoeglich(m.id)
    ? `${m.titel} (Taste ${m.taste})`
    : `${m.titel} — erst mit geladenem Modell verfügbar`;
}

// Der Modellstand entscheidet, welche Modi bedienbar sind. Ohne Modell wäre
// der Lageplan ein weißes Blatt — also sperren statt hineinlaufen lassen.
watch(() => ifc.modelList?.length ?? 0, (n) => {
  // `hatAchsen` setzt der Viewer, sobald gezählt ist (Stufe 14.1) — hier ist
  // die Zählung noch nicht gelaufen. Ohne Modell gibt es auch keine Achsen.
  ansicht.setzeStand({ hatModell: n > 0 });
  if (!n) ansicht.setzeStand({ hatAchsen: false });
  if (!n) ansicht.setzeModus('3d');
}, { immediate: true });

/**
 * Zeichenoptionen des Plans. Vorläufig die Standardausstattung — sobald das
 * Plan-Panel steht (AP-9), kommen sie von dort. Die Stile stammen aus dem
 * IFC-Store, damit Bildschirm und Export dieselbe Farbtabelle benutzen.
 */
/**
 * Zeichenoptionen des Plans.
 *
 * Kamen bis Sprint I als feste Standardausstattung von hier — zehn Optionen,
 * die `IfcPlanCanvas` längst durchreicht, waren am Bildschirm damit still aus
 * (Böschungsschraffur, Höhenlinien, UTM-Kreuze, Haltungsbeschriftung …).
 * Jetzt bedient sie das Plan-Panel über `usePlan`.
 */
const planOptionen = computed(() => {
  const o = plan.optionen;
  return {
    // Was der Store weiß. Die Engine-Teile (web-ifc-Instanzen für die
    // Haltungsbeschriftung, Koordinaten-Versatz für die UTM-Kreuze, das
    // Achsenraster) ergänzt IfcPlanCanvas — nur der hat die viewerApi.
    ...plan.zeichenOptionen,
    ifcGrids:         o.ifcGrids,
    styleMap:         ifc.resolvedVectorStyleMap,
    styleMapPerModel: ifc.vectorStylesByModel ?? null,
    rules:            ifc.vectorRules ?? [],
    labelTemplateFor: (cat) => ifc.vectorStyles?.[cat]?.labelTemplate ?? '',
    annotations:      o.annotations ? (ifc.annotations ?? []) : [],
    dimensions:       o.dimensions ? ifc.planDimensions : [],
    planInhalte:      planInhalt.inhalte,
    rotstift:         rotstift.striche,
    measurements:     o.measurements ? (viewerRef.value?.messungen?.() ?? []) : [],
    watermark:        planWasserzeichen.value,
  };
});

/** Handeintrag schlägt den ISO-19650-Status des Dokuments. */
const planWasserzeichen = computed(() => {
  const eigen = (plan.optionen.watermarkText ?? '').trim();
  if (eigen) return eigen;
  // Alle geladenen Dateien — der unreifste Status gilt (Stufe 4, nachgereicht).
  const sha = viewerRef.value?.geladeneModellShas?.() ?? viewerRef.value?.geladeneModellSha?.();
  return (sha ? resolveWatermarkText(cde.dokumente, sha) : null) || null;
});

/**
 * Schriftfeld. Der Nutzer pflegt es im Panel; leer gelassene Felder fallen
 * auf die Projektakte zurück, damit ein frisches Projekt sofort ein
 * brauchbares Blatt liefert.
 */
const planSchriftfeld = computed(() => ({
  ...plan.schriftfeld,
  projekt:      plan.schriftfeld.projekt
                || [cde.auftrag?.nummer, cde.auftrag?.name].filter(Boolean).join(' '),
  auftraggeber: plan.schriftfeld.auftraggeber || (cde.auftrag?.bauherr ?? ''),
  bearbeiter:   plan.schriftfeld.bearbeiter   || (cde.bearbeiter ?? ''),
  massstab:     `1:${ansicht.massstab}`,
}));

// ── Planinhalte setzen (Stufe 7) ───────────────────────────────────────────
//
// Kurzzeichen statt Icons: für Schacht, Pumpe, Einlauf, Hydrant und Armatur
// gibt es keine lucide-Entsprechung, und ein erfundenes Icon wäre schlechter
// als das Kürzel, das auch auf dem Blatt steht.
const SYMBOL_KURZ = {
  schacht: 'S', pumpe: 'P', einlauf: 'E', hydrant: 'H', armatur: 'A',
};
const SYMBOL_TITEL = {
  schacht: 'Schacht', pumpe: 'Pumpe', einlauf: 'Straßeneinlauf',
  hydrant: 'Hydrant', armatur: 'Armatur',
};

// ── Rotstift (Stufe 7) ─────────────────────────────────────────────────────
/**
 * DIE PLAN-WERKZEUGE HÄNGEN AM EINEN SLOT (Teil XI, U1).
 *
 * Vorher pflegten VIER Setter hier und DREI exponierte Setter im Canvas
 * dieselbe Exklusivität von Hand — die klassische Doppel-Pflege, die
 * auseinanderläuft. Jetzt: jeder Setter ist ein reiner Schalter, der den
 * Slot BELEGT und seinen Ausschalter hinterlegt; wer als Nächstes kommt,
 * räumt den Vorgänger über genau diesen einen Mechanismus.
 */
const stiftModus = ref(null);
const stiftFarbe = ref(STIFT_FARBEN[0]);
function _stiftAus() {
  stiftModus.value = null;
  planRef.value?.setzeStift?.(null, stiftFarbe.value);
}
function stiftSetzen(m, farbe = null) {
  // Auf dieselbe Farbe nochmal geklickt schaltet ab; eine neue Farbe schaltet
  // den Stift an und wechselt nur.
  const gleicheFarbe = !farbe || farbe === stiftFarbe.value;
  const ziel = (stiftModus.value === m && gleicheFarbe) ? null : m;
  if (farbe) stiftFarbe.value = farbe;
  stiftModus.value = ziel;
  planRef.value?.setzeStift?.(ziel, stiftFarbe.value);
  if (ziel) bearbeitung.belegeWerkzeug('plan:stift', _stiftAus);
  else bearbeitung.gebeWerkzeugFrei('plan:stift');
}

const planModus = ref(null);
function _setzenAus() {
  planModus.value = null;
  planRef.value?.setzeModus?.(null);
}
function planModusSetzen(m) {
  // Nochmal derselbe Knopf schaltet ab — sonst kommt man aus dem Modus nur
  // über Esc heraus, und das weiß nicht jeder.
  const ziel = planModus.value === m ? null : m;
  planModus.value = ziel;
  planRef.value?.setzeModus?.(ziel);
  if (ziel) bearbeitung.belegeWerkzeug('plan:setzen', _setzenAus);
  else bearbeitung.gebeWerkzeugFrei('plan:setzen');
}

// ── Zeichnen im Plan (Stufe 9.4) ───────────────────────────────────────────
/**
 * Die Zeichenwerkzeuge — abgeleitet aus dem Katalog, nicht hier aufgezählt.
 *
 * Erzeugen hat kein Subjekt, deshalb steht es in der WERKZEUGLEISTE und nicht
 * im Kontextmenü am Bauteil. Genau diese Trennung führt `GRUPPEN[...].einstieg`
 * im Katalog, und `passende()` hält sich daran.
 */
/**
 * Was im Lageplan gezeichnet werden kann.
 *
 * Nicht mehr „die Gruppe Erzeugen", sondern „alles, dessen EINGABE ein
 * gezeichneter Zug ist". „Trasse ändern" gehört zur Gruppe Lage und wird
 * trotzdem hier bedient — die Gruppe sagt, wo etwas angeboten wird, die
 * Eingabeart, womit es gefüttert wird.
 *
 * Werkzeuge, die ein Bauteil brauchen, erscheinen erst, wenn eines gewählt
 * ist. Ein Knopf, der nur eine Absage erzeugt, ist ein toter Knopf.
 */
const ZEICHEN_WERKZEUGE = computed(() => BEARBEITUNGEN.filter((b) => {
  if (!['zug', 'umriss'].includes(eingabeArt(b))) return false;
  return b.gruppe === 'erzeugen' || !!bearbeitung.bauteil;
}));
const zeichenWerkzeug = ref(null);

/** X3: welches Gruppen-Popover der Plan-Leiste offen ist. */
const planPopover = ref(null);
function planPopoverUm(gruppe) {
  planPopover.value = planPopover.value === gruppe ? null : gruppe;
  // Die Bibliothek lädt beim Aufklappen — nicht beim Start: sie hängt am
  // Repo, und das Backend steht erst nach der Auftragswahl fest.
  if (planPopover.value === 'zeichnen') vorlagenLaden();
}

// ── Bauteilbibliothek (Lücke ⑨ / Stufe 9.8) ────────────────────────────────
const vorlagen = ref([]);
async function vorlagenLaden() {
  try { vorlagen.value = await ladeVorlagen(repo); }
  catch (fehler) { console.warn('cde: vorlagen laden', fehler?.message ?? fehler); }
}

/**
 * Eine Vorlage zeichnen: dasselbe Werkzeug wie der rohe Rezept-Knopf, nur
 * mit VORBELEGTEN Werten — der eigentliche Zweck der Bibliothek: nicht
 * jedes Mal DN 1000 tippen.
 */
function vorlageZeichnen(v) {
  if (!bearbeitung.modusAn) return;
  const werkzeugId = `${v.rezept}-zeichnen`;
  // Erst den eigenen Slot freigeben (Teil XVI): `bearbeitung.starte` ruft
  // sonst den Ausschalter des Vorgängers — und der ist dieses Werkzeug
  // selbst, das das gerade Gestartete wieder abräumte.
  bearbeitung.gebeWerkzeugFrei('plan:zeichnen');
  const ok = planRef.value?.zeichneMit?.(werkzeugId);
  zeichenWerkzeug.value = ok ? werkzeugId : null;
  if (!ok) return;
  for (const [feld, wert] of Object.entries(v.vorgaben ?? {})) {
    bearbeitung.setzeWert(feld, wert);
  }
  bearbeitung.belegeWerkzeug('plan:zeichnen', _zeichnenAus);
  planPopover.value = null;
}

/**
 * Die WERTE des scharfen Zeichenwerkzeugs als Vorlage sichern. Bezeichnung
 * und Höhe bleiben draußen — sie gehören zum einzelnen Bauteil, nicht zur
 * Vorlage (ein „Schacht DN 1000" hat keine feste Sohlhöhe).
 */
async function vorlageSichern() {
  const scharf = bearbeitung.scharf;
  if (!scharf?.rezept) return;
  const name = prompt('Name der Vorlage:', scharf.titel?.replace(' zeichnen', '') ?? '');
  if (!name?.trim()) return;
  const vorgaben = {};
  for (const [feld, wert] of Object.entries(bearbeitung.werte ?? {})) {
    if (feld === 'name' || feld === 'hoehe') continue;
    if (['string', 'number', 'boolean'].includes(typeof wert) && wert !== '') vorgaben[feld] = wert;
  }
  const ebene = repo.buero && confirm('Für ALLE Projekte sichern (Büro-Ebene)?\n„Abbrechen" sichert nur in diesem Auftrag.')
    ? 'buero' : 'projekt';
  const r = await speichereVorlage(repo, { name: name.trim(), rezept: scharf.rezept, vorgaben }, { ebene });
  if (!r.ok) console.warn('cde: vorlage sichern', r.grund);
  await vorlagenLaden();
}

// ── Übergabepakete (Lücke ⑩) ────────────────────────────────────────────────
const transmittalOffen = ref(false);
const transmittalWahl = ref([]);
const transmittalEmpfaenger = ref('');
const transmittalAnmerkung = ref('');
const transmittalLaeuft = ref(false);
const transmittalMeldung = ref('');
const transmittalProtokoll = ref([]);

const uebergabefaehige = computed(() =>
  cde.dokumente.filter(d => UEBERGABEFAEHIG.includes(d.status)));

async function transmittalOeffnen() {
  transmittalMeldung.value = '';
  transmittalWahl.value = uebergabefaehige.value.map(d => d.sha256);
  transmittalOffen.value = true;
  try {
    const liste = await repo.get(REPO_KEY_TRANSMITTALS);
    transmittalProtokoll.value = Array.isArray(liste) ? liste : [];
  } catch { /* Protokoll ist Zusatz, kein Blocker */ }
}

/**
 * Das Paket schnüren: Dateien holen, Schein dazulegen, ZIP herunterladen,
 * Übergabe protokollieren. FEHLENDE Dateien brechen ab und werden benannt —
 * ein Paket, das still unvollständig ist, wäre schlimmer als keines.
 */
async function transmittalErzeugen() {
  const gewaehlt = uebergabefaehige.value.filter(d => transmittalWahl.value.includes(d.sha256));
  const pruefung = pruefeAuswahl(gewaehlt);
  if (!pruefung.ok) { transmittalMeldung.value = pruefung.grund; return; }
  transmittalLaeuft.value = true;
  transmittalMeldung.value = '';
  try {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    const fehlend = [];
    for (const d of gewaehlt) {
      const abgelegt = await repo.getBlob(`model:${d.sha256}`);
      if (!abgelegt?.blob) { fehlend.push(d.name); continue; }
      zip.file(d.name, abgelegt.blob);
    }
    if (fehlend.length) {
      transmittalMeldung.value = `Datei nicht in der Ablage: ${fehlend.join(', ')} — Paket nicht erzeugt.`;
      return;
    }
    const wann = Date.now();
    const schein = baueSchein({
      auftrag: cde.auftrag, empfaenger: transmittalEmpfaenger.value,
      anmerkung: transmittalAnmerkung.value, wer: cde.bearbeiter, wann,
      dokumente: gewaehlt,
    });
    zip.file('UEBERGABESCHEIN.txt', schein);
    const paket = await zip.generateAsync({ type: 'blob' });

    const url = URL.createObjectURL(paket);
    const a = document.createElement('a');
    a.href = url;
    a.download = paketName(cde.auftrag, wann);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);

    // Protokoll: append-only in der Auftragsablage — das Paket geht raus,
    // der Nachweis bleibt.
    const eintrag = protokollEintrag({
      empfaenger: transmittalEmpfaenger.value, anmerkung: transmittalAnmerkung.value,
      wer: cde.bearbeiter, wann, dokumente: gewaehlt,
    });
    transmittalProtokoll.value = [...transmittalProtokoll.value, eintrag];
    await repo.set(REPO_KEY_TRANSMITTALS, JSON.parse(JSON.stringify(transmittalProtokoll.value)));
    transmittalOffen.value = false;
  } catch (fehler) {
    console.error('cde: transmittal', fehler);
    transmittalMeldung.value = `Fehler: ${fehler?.message ?? fehler}`;
  } finally {
    transmittalLaeuft.value = false;
  }
}

// ── Verbund (Modellsatz → EIN geprüftes IFC4X3) ─────────────────────────────
// Gerechnet wird auf dem Server, in einem Unterprozess: nginx bricht nach 60 s
// ab, der Verbund der Gruppenmodelle braucht samt Prüfung zwei Minuten. Darum
// anstoßen (202) und alle zwei Sekunden abholen, bis ein Endzustand dasteht.
// Ins Register kommt nur, was die Prüfung bestanden hat — das entscheidet der
// Server, nicht dieser Dialog.
const verbundOffen = ref(false);
const verbundEigenbau = ref(true);
const verbundStartet = ref(false);
const verbundLauf = ref(null);
const verbundMeldung = ref('');
// verbund | erdbau (Stufe 3) — derselbe Lauf, eine andere Quellenliste und ein anderer Dateiname.
const verbundModus = ref('verbund');
let verbundUhr = null;

const verbundModelle = computed(() => {
  const satz = cde.aktiverSatz;
  if (!satz) return [];
  // Der Server liefert die Dokumente des Satzes aufgelöst mit; fehlen sie,
  // werden sie aus dem Register nachgeschlagen.
  const liste = satz.dokumente
    ?? (satz.enthaelt ?? []).map(sha => cde.dokumente.find(d => d.sha256 === sha)).filter(Boolean);
  return liste.filter(d => (d.art ?? 'modell') === 'modell');
});
const verbundLaeuft = computed(() => ['wartet', 'laeuft'].includes(verbundLauf.value?.zustand));
const verbundZustandText = computed(() => ({
  wartet: 'Angenommen', laeuft: 'Rechnet',
  geprueft: verbundLauf.value?.dokument ? 'Geprüft und im Register' : 'Geprüft — wird eingetragen',
  abgelehnt: 'Abgelehnt', fehler: 'Fehler', abgebrochen: 'Abgebrochen',
})[verbundLauf.value?.zustand] ?? verbundLauf.value?.zustand ?? '');
const verbundSymbol = computed(() => ({
  geprueft: 'status-ok', abgelehnt: 'status-error', fehler: 'status-error', abgebrochen: 'status-warn',
})[verbundLauf.value?.zustand] ?? 'busy');
// Was vom CDE-Eigenbau NICHT in den Verbund kam (misslungen, leer, ausgeblendet).
// Ein Export, der still weniger enthält als die Ansicht, wäre eine falsche Aussage.
const verbundEigenbauLuecken = computed(() =>
  Object.entries(verbundLauf.value?.bericht?.eigenbau?.nicht_im_paket ?? {})
    .map(([art, liste]) => ({ art, anzahl: Array.isArray(liste) ? liste.length : Number(liste) || 0 }))
    .filter(l => l.anzahl > 0));
// Aushübe des Eigenbaus, deren Wirt (das GELIEFERTE Gelände) nicht im Satz liegt.
// Der Verbund bleibt dann zu Recht rot (IfcRelVoidsElement fehlt, SPF lehnt ab) —
// aber er soll sagen, WAS fehlt, statt nur, dass etwas fehlt.
const verbundFehlendeWirte = computed(() =>
  verbundLauf.value?.bericht?.nachbearbeitung?.wirte?.fehlende_wirte ?? []);
// Ein eigener Aushub, der GAR KEIN Gelände nennt: dort fehlt nicht ein Dokument
// im Satz, sondern die Quelle im Journal — ein anderer Satz an den Planer.
const verbundOhneWirt = computed(() =>
  verbundLauf.value?.bericht?.nachbearbeitung?.wirte?.ohne_wirtangabe ?? []);
// Erdbau-Dokumente im Satz, und was in ihnen steckt (Stufe 3) — dieselbe Regel
// wie der Server: das Gelände darin fällt im Verbund weg.
const verbundWeggelassen = computed(() => imErdbauEnthalten(verbundModelle.value));
const verbundErdbauImSatz = computed(() =>
  verbundModelle.value.filter(d => d.herkunft?.art === 'erdbau').map(d => d.datei ?? d.name));
// Stufe 4: ein Erdbau-Dokument im Satz, dessen Gelände im Register neuer ist.
// Führt der Satz die neuere Revision, lehnt der Server ab; sonst warnt der Dialog.
const verbundErdbauVeraltet = computed(() => verbundModelle.value
  .filter(d => d.herkunft?.art === 'erdbau')
  .flatMap(d => quellenVeraltet(d, cde.dokumente).map(v => ({ ...v, erdbau: d.datei ?? d.name }))));

function verbundOeffnen() {
  // Ein laufender Verbund bleibt stehen: wer den Dialog schließt und wieder
  // öffnet, sieht den Stand, statt versehentlich einen zweiten zu starten.
  if (!verbundLaeuft.value) {
    verbundLauf.value = null;
    verbundMeldung.value = '';
    verbundModus.value = 'verbund';
  }
  verbundOffen.value = true;
}

async function verbundStarten(modus = 'verbund') {
  const satz = cde.aktiverSatz;
  if (!satz || !cde.auftrag?.id) return;
  verbundStartet.value = true;
  verbundMeldung.value = '';
  verbundModus.value = modus;
  const erdbau = modus === 'erdbau';
  let eigenbau = null;
  // Der Live-Stand: beim Erdbau Pflicht; beim Verbund nur, wenn kein
  // Erdbau-Dokument im Satz steht (sonst stünde der Aushub doppelt).
  if (erdbau || (verbundEigenbau.value && !verbundErdbauImSatz.value.length)) {
    try {
      eigenbau = (await useViewerApi().eigenbauPaket?.()) ?? null;
    } catch (fehler) {
      // Beim Verbund kein Abbruch: ohne Eigenbau bleibt der Verbund der Lieferungen. Gesagt wird es trotzdem.
      verbundMeldung.value = `CDE-Eigenbau nicht dabei: ${fehler?.message ?? fehler}`;
    }
    if (erdbau && !eigenbau) {
      verbundMeldung.value ||= 'Der Erdbau braucht den Stand der CDE — erst ein Modell laden.';
      verbundStartet.value = false;
      return;
    }
  }
  try {
    const angenommen = await AuftragApi.verbundStarten(cde.auftrag.id, satz.id, { eigenbau, modus });
    verbundLauf.value = { ...angenommen, schritt: '' };
    verbundAbholen(angenommen.lauf_id);
  } catch (fehler) {
    verbundMeldung.value = fehler?.response?.data?.detail || fehler?.message || 'Der Verbund ließ sich nicht starten.';
  } finally {
    verbundStartet.value = false;
  }
}

function verbundAbholen(laufId, fehlversuche = 0) {
  clearTimeout(verbundUhr);
  verbundUhr = setTimeout(async () => {
    try {
      const st = await AuftragApi.verbundStatus(cde.auftrag.id, laufId);
      verbundLauf.value = st;
      if (['wartet', 'laeuft'].includes(st.zustand) || (st.zustand === 'geprueft' && !st.dokument)) {
        verbundAbholen(laufId);
        return;
      }
      if (st.dokument) {
        // Das neue Dokument soll in der Liste stehen, ohne dass jemand neu lädt.
        await cde.uebernehmeRegister(await AuftragApi.register(cde.auftrag.id), cde.auftrag.id);
      }
    } catch (fehler) {
      // Ein Aussetzer beim Abholen ist kein Ergebnis — weiterfragen, aber nicht ewig.
      if (fehlversuche < 5) { verbundAbholen(laufId, fehlversuche + 1); return; }
      verbundMeldung.value = `Abholen misslang: ${fehler?.response?.data?.detail || fehler?.message || fehler}`;
    }
  }, 2000);
}
onBeforeUnmount(() => clearTimeout(verbundUhr));

async function verbundHerunterladen() {
  const d = verbundLauf.value?.dokument;
  if (!d) return;
  try {
    const blob = await AuftragApi.datei(d.pfad);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = d.datei;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (fehler) {
    verbundMeldung.value = `Herunterladen misslang: ${fehler?.message ?? fehler}`;
  }
}

async function vorlageEntfernen(v) {
  if (v.herkunft === 'eingebaut') return;
  if (!confirm(`Vorlage „${v.name}" löschen?`)) return;
  await loescheVorlage(repo, v.id, { ebene: v.herkunft });
  await vorlagenLaden();
}

function _zeichnenAus() {
  zeichenWerkzeug.value = null;
  planRef.value?.zeichneMit?.(null);
}
function zeichenWerkzeugSetzen(id) {
  // Zeichnen ist Bearbeiten: ohne Modus passiert nichts. `zeichneMit` läuft
  // ohnehin über `bearbeitung.starte` und würde abgewiesen — der Knopf soll
  // aber gar nicht erst so tun, als ginge es.
  if (id && !bearbeitung.modusAn) return;
  // Nochmal derselbe Knopf schaltet ab — wie bei Setzmodus und Stift.
  const ziel = zeichenWerkzeug.value === id ? null : id;
  // Erst den eigenen Slot freigeben — siehe `vorlageZeichnen`.
  bearbeitung.gebeWerkzeugFrei('plan:zeichnen');
  const ok = planRef.value?.zeichneMit?.(ziel);
  zeichenWerkzeug.value = ziel && ok ? ziel : null;
  if (zeichenWerkzeug.value) bearbeitung.belegeWerkzeug('plan:zeichnen', _zeichnenAus);
  else bearbeitung.gebeWerkzeugFrei('plan:zeichnen');
}

/** Wenn der Plan von sich aus aufhört (abgeschlossen, Esc), nachziehen. */
function zeichenstandAbgleichen() {
  zeichenWerkzeug.value = planRef.value?.zeichnetGerade?.() ?? null;
  if (!zeichenWerkzeug.value) bearbeitung.gebeWerkzeugFrei('plan:zeichnen');
}

/** Esc im Canvas hat ein Werkzeug beendet — Spiegel UND Slot nachziehen. */
function planWerkzeugBeendet(art) {
  if (art === 'stift') { stiftModus.value = null; bearbeitung.gebeWerkzeugFrei('plan:stift'); }
  if (art === 'setzen') { planModus.value = null; bearbeitung.gebeWerkzeugFrei('plan:setzen'); }
  if (art === 'bemassung') { misstImPlan.value = false; bearbeitung.gebeWerkzeugFrei('plan:bemassung'); }
}

// ── Bemaßung im Plan (AP-10) ───────────────────────────────────────────────
const misstImPlan = ref(false);
function _bemassungAus() {
  misstImPlan.value = false;
  planRef.value?.messenUmschalten?.(false);
}
function bemassungUmschalten() {
  planRef.value?.messenUmschalten?.();
  misstImPlan.value = planRef.value?.misstGerade?.() ?? false;
  if (misstImPlan.value) bearbeitung.belegeWerkzeug('plan:bemassung', _bemassungAus);
  else bearbeitung.gebeWerkzeugFrei('plan:bemassung');
}

// Tasten 1/2/3 sind frei — der Viewer belegt M V N H I T R ? Esc und Strg+K/F.
function onKeyDown(e) {
  const t = e.target;
  if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const treffer = ansichtsModi.find(m => m.taste === e.key);
  if (treffer) { e.preventDefault(); ansicht.setzeModus(treffer.id); }
}

/**
 * Deep-Link aus dem Projekt-Cockpit: /cde?projekt=<id>&datei=<pfad relativ zu 1_Projekte>.
 * Stammdaten kommen aus der Projektakte (kein Handeintrag), das CDE-Projekt wird
 * bei Bedarf angelegt und aktiv gesetzt; eine Datei wird direkt geladen.
 */
/**
 * Den Auftrag aus dem Projektordner übernehmen.
 *
 * EIN Aufruf liefert Stammdaten, Dokumente UND Modellsätze — sie werden in den
 * Store hineingereicht, statt dass er sie ein zweites Mal holt. Genau daran
 * sind Register und Viewer-Liste in Stufe 3 auseinandergelaufen.
 *
 * Die CDE legt KEINE Aufträge mehr an. Ein Auftrag ist ein Ordner auf der
 * StorageBox; wer hier einen erfände, bekäme ein Projekt ohne Ordner, ohne
 * Nummer und ohne Bauherrn — und genau zwei davon standen am Ende in
 * `1337_Genau`.
 */
async function auftragAusOrdner() {
  const id = Number(route.query.projekt);
  if (!Number.isInteger(id) || id <= 0) { auftragsListeLaden(); return; }
  try {
    const register = await AuftragApi.register(id);
    await cde.ready;
    await cde.uebernehmeRegister(register, id);

    // Stufe 11.5: die alten Client-Projekte einmalig zu Modellsätzen machen.
    // Läuft VOR dem Setzen des Satzes, damit ein frisch übernommener gleich
    // gewählt werden kann. Idempotent — die Marke hält fest, dass es lief.
    try {
        const bericht = await migriere({
            repo, manifest: cde.dokumente,
            satzAnlegen: (daten) => cde.satzAnlegen(daten),
        });
        migrationsBericht.value = berichtText(bericht);
        if (bericht.angelegt.length) await cde.ladeSaetze();
    } catch (fehler) {
        console.warn('cde: satz-migration', fehler);
    }

    await aenderungen.setzeSatz(cde.aktiverSatzId);
    const datei = route.query.datei;
    if (datei) await viewerRef.value?.openFromProjectPath?.(String(datei));
  } catch (fehler) {
    auftragsFehler.value = 'Der Projektordner ist nicht erreichbar.';
    console.warn('cde: auftrag aus ordner', fehler);
  }
}

/** Ohne `?projekt=` zeigt die CDE die echten Aufträge zur Auswahl. */
async function auftragsListeLaden() {
  try {
    auftraege.value = await AuftragApi.liste();
  } catch (fehler) {
    auftragsFehler.value = 'Die Projektliste ist nicht erreichbar — angemeldet?';
    console.warn('cde: auftragsliste', fehler);
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  // ERST der Auftrag, DANN die Modelle: `auftragAusOrdner` setzt den
  // Modellsatz und damit das Journal — würde ein Modell vorher geladen,
  // spielte es gegen ein Journal nach, das noch nicht steht.
  //
  // Ein Deep-Link (`?datei=`) hat Vorrang: dann ist schon eins geladen, und
  // `stelleOffeneWiederHer` tut von sich aus nichts.
  auftragAusOrdner().finally(() => {
    viewerRef.value?.stelleOffeneWiederHer?.()
      ?.catch?.(fehler => console.warn('cde: wiederherstellen', fehler?.message ?? fehler));
  });
  // Der Modus ist ein Belang der Schale, nicht des Viewers — er wird hier
  // angemeldet und erscheint dadurch automatisch in Palette und Hilfe.
  cmds.register('ansicht', ansichtsModi.map(m => ({
    id: `ansicht.${m.id}`,
    titel: `Ansicht: ${m.titel}`,
    icon: m.icon,
    gruppe: 'Ansicht',
    key: m.taste,
    verfuegbar: () => istVerfuegbar(m.id, ansicht.stand),
    run: () => ansicht.setzeModus(m.id),
  })));
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
  cmds.unregister('ansicht');
});

const sortedDokumente = computed(() =>
  [...cde.dokumente].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0)));
// Stufe 3: der Herkunfts-Chip je Registerzeile — einmal je Stand gerechnet, nicht je Zelle.
const herkunftJe = computed(() => new Map(sortedDokumente.value.map(d => {
  const chip = herkunftChip(d);
  if (!chip) return [d.sha256, null];
  // Stufe 4: ist eine Quelle inzwischen neuer? Dann sagt der Chip es — der
  // Erdbau zeigt den Aushub sonst am alten Gelände.
  const alt = quellenVeraltet(d, cde.dokumente);
  return [d.sha256, alt.length
    ? { ...chip, veraltet: true, text: `${chip.text} · Quelle neuer`,
        titel: [...alt.map(v => `${v.quelle} → ${v.neu} vorhanden — neu erzeugen`), chip.titel].join(' · ') }
    : chip];
})));

/** Beim ersten geladenen Modell die Struktur-Leiste anbieten. */
function onModelLoaded() {
  if (!panels.aktivLinks) panels.open('struktur');
}

/** Issue-Pin im 3D anfahren (Panel liegt außerhalb des Viewers). */
function zoomToIssue(position) {
  viewerRef.value?.zoomToPoint?.(position);
}

/**
 * Pin-Setz-Modus des Viewers vom Issues-Panel aus schalten.
 *
 * Gelesen wird direkt aus dem Viewer — KEINE eigene Kopie danebenlegen.
 * Der Modus endet auch ohne diesen Knopf (Esc, oder von selbst, sobald ein Pin
 * gesetzt ist); eine gespiegelte Variable liefe dann auseinander und der Knopf
 * zeigte weiter „Aktiv".
 */
const annotationActive = computed(() => viewerRef.value?.annotationActive ?? false);
function onToggleIssueMode() {
  viewerRef.value?.toggleAnnotationMode?.();
}

function onClose() {
  router.push('/tools');
}

/**
 * Modellsatz wechseln.
 *
 * Der Wechsel lädt DAS JOURNAL des Satzes nach — danach gilt ein anderer
 * wirksamer Stand. Anschliessend läuft das Nachspielen erneut; genau das ist
 * der Variantenwechsel, und es braucht dafür keinen eigenen Mechanismus.
 */
async function onSatzChange(e) {
  // U2: Bei OFFENER Sitzung ist der Wechsel gesperrt — sonst stapeln sich
  // Schritte gegen den falschen Satz. Erst abschließen oder verwerfen.
  if (aenderungen.sitzungSchritte.length) {
    e.target.value = cde.aktiverSatzId ?? '';
    bearbeitung.commitDialogOffen = true;
    return;
  }
  await cde.setzeSatz(e.target.value || null);
  await aenderungen.setzeSatz(cde.aktiverSatzId);
  showRegister.value = false;
}

/** Einen Modellsatz anlegen — er übernimmt die Auswahl des aktuellen. */
async function onNeuerSatz() {
  const name = prompt('Name des Modellsatzes (z. B. „Variante Nord"):', '');
  if (name === null || !name.trim()) return;
  try {
    // Wie `git branch`: der neue Satz startet mit dem, was gerade gilt.
    await cde.satzAnlegen({ name: name.trim(), enthaelt: cde.aktiverSatz?.enthaelt ?? [] });
    await aenderungen.setzeSatz(cde.aktiverSatzId);
  } catch (fehler) {
    alert(fehler?.response?.data?.detail || fehler?.message || 'Modellsatz konnte nicht angelegt werden.');
  }
}

async function onSatzUmbenennen() {
  const s = cde.aktiverSatz;
  if (!s) return;
  const name = prompt('Neuer Name:', s.name);
  if (name === null || !name.trim()) return;
  try { await cde.satzAendern(s.id, { name: name.trim() }); }
  catch (fehler) { alert(fehler?.response?.data?.detail || 'Umbenennen fehlgeschlagen.'); }
}

/**
 * Einen Modellsatz löschen.
 *
 * Die DATEIEN bleiben — sie gehören dem Auftrag, nicht dem Satz. Das steht
 * ausdrücklich in der Rückfrage, sonst klingt „löschen" nach mehr, als es ist.
 */
async function onSatzLoeschen() {
  const s = cde.aktiverSatz;
  if (!s) return;
  if (!confirm(`Modellsatz „${s.name}" löschen?\nDie Modelle selbst bleiben im Projekt — ein Satz ist nur eine Auswahl.`)) return;
  await cde.satzLoeschen(s.id);
  await aenderungen.setzeSatz(cde.aktiverSatzId);
  showRegister.value = false;
}

/** Ein Modell in den aktiven Satz aufnehmen oder herausnehmen. */
async function satzUmschalten(sha256) {
  const s = cde.aktiverSatz;
  if (!s) return;
  const drin = (s.enthaelt ?? []).includes(sha256);
  const neu = drin ? s.enthaelt.filter(x => x !== sha256) : [...(s.enthaelt ?? []), sha256];
  try {
    await cde.satzAendern(s.id, { enthaelt: neu });
  } catch (fehler) {
    // Der Server lehnt zwei Revisionen desselben Modells ab. Das ist keine
    // Panne, sondern die Invariante — sie gehört im Klartext gezeigt.
    alert(fehler?.response?.data?.detail || 'Das geht in diesem Satz nicht.');
  }
}

/** Zu einem anderen Auftrag wechseln — über die URL, nicht im laufenden Betrieb. */
function onAuftragWaehlen(id) {
  if (!id) return;
  // `repo.setBackend` läuft beim Aufbau der Ansicht. Es hier im Betrieb zu
  // tauschen wäre ein zweiter Weg zum selben Zustand — und die Stores haben
  // bereits gelesen. Deshalb neu laden.
  window.location.href = `/cde?projekt=${id}`;
}

function openDokument(d) {
  viewerRef.value?.openBySha(d.sha256);
}

function statusTitle(d) {
  const h = d.statusHistorie ?? [];
  return h.map(e => `${e.status} — ${e.von}, ${fmtDate(e.am)}`).join('\n');
}

/**
 * Statuswechsel mit sichtbarer Ablehnung (Lücke ④): schlägt der Wechsel fehl
 * (kein ISO-Weg, Rang fehlt, Server sagt nein), springt das Feld auf den
 * geltenden Status zurück und der Grund steht kurz daneben — ein Feld, das
 * still beim gewünschten Wert stehen bliebe, wäre eine Lüge über den Server.
 */
async function statusWechseln(d, ev) {
  const ok = await cde.setDokumentStatus(d.sha256, ev.target.value);
  if (!ok) {
    ev.target.value = d.status;
    if (cde.statusGrund) {
      statusHinweis.value = cde.statusGrund;
      clearTimeout(_statusHinweisTimer);
      _statusHinweisTimer = setTimeout(() => { statusHinweis.value = ''; }, 5000);
    }
  }
}
const statusHinweis = ref('');
let _statusHinweisTimer = 0;

function fmtBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return '–';
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
function fmtDate(ts) {
  if (!ts) return '–';
  return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
</script>

<style scoped>
/* Werkzeuge am Lageplan — schweben über der Zeichenfläche, links oben. */
.plan-werkzeuge {
  position: absolute;
  top: 0.6rem; left: 0.6rem;
  display: flex; gap: 0.25rem;
  z-index: var(--cde-z-hud);
}
.plan-wz {
  display: inline-flex; align-items: center; gap: 0.25rem;
  padding: 0.32rem 0.42rem;
  background: var(--cde-float);
  border: 1px solid var(--cde-line-strong);
  border-radius: var(--cde-radius-sm);
  box-shadow: var(--cde-shadow-float);
  color: var(--cde-text-soft);
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.plan-wz:hover { background: var(--cde-fill-hover); color: var(--cde-text-bright); }
.plan-wz.aktiv {
  background: var(--cde-accent-fill-hi);
  border-color: var(--cde-accent-line);
  color: var(--cde-accent);
}
.plan-wz-zahl { font-size: 0.66rem; font-variant-numeric: tabular-nums; }
.plan-wz-sym {
  display: inline-block; width: 14px; text-align: center;
  font-size: 0.76rem; font-weight: 700; line-height: 1;
}
.plan-wz.farbe {
  width: 1.5rem; padding: 0.32rem 0;
  justify-content: center;
}
.plan-wz.farbe::after {
  content: ''; width: 11px; height: 11px; border-radius: 50%;
  background: var(--farbe);
  box-shadow: 0 0 0 1px var(--cde-line-strong);
}
.plan-wz.farbe.aktiv::after { box-shadow: 0 0 0 2px var(--cde-text-bright); }

.plan-popover {
  position: absolute; left: 0; top: calc(100% + 0.4rem);
  display: flex; flex-direction: column; gap: 0.15rem;
  min-width: 15rem;
  background: var(--cde-float); padding: 0.35rem;
  border: 1px solid var(--cde-tint); border-radius: 10px;
  box-shadow: var(--cde-shadow-float);
}
/* Übergabepaket (Lücke ⑩) */
.doc-fuss {
  display: flex; align-items: center; gap: 0.6rem;
  margin-top: 0.45rem;
}
.doc-fuss-info { font-size: var(--cde-font-xs); color: var(--cde-text-dim); }
.tm-satz { margin: 0 0 0.5rem; font-size: var(--cde-font-sm); color: var(--cde-text-dim); }
.tm-zeile {
  display: flex; align-items: baseline; gap: 0.45rem;
  padding: 0.25rem 0.1rem; font-size: var(--cde-font-sm); cursor: pointer;
}
.tm-name { color: var(--cde-text-bright); }
.tm-meta { color: var(--cde-text-dim); font-size: var(--cde-font-xs); }
.tm-feld { display: flex; flex-direction: column; gap: 0.2rem; margin-top: 0.5rem; }
.tm-feld span { font-size: var(--cde-font-xs); color: var(--cde-text-dim); }
.tm-feld input, .tm-feld textarea {
  background: var(--cde-fill); color: var(--cde-text);
  border: 1px solid var(--cde-line); border-radius: var(--cde-radius-sm);
  padding: 0.3rem 0.45rem; font-size: var(--cde-font-sm); font-family: inherit;
}
.tm-meldung {
  display: flex; align-items: center; gap: 0.35rem;
  margin: 0.5rem 0 0; font-size: var(--cde-font-sm); color: var(--cde-warn);
}

/* Bauteilbibliothek (Lücke ⑨) */
.pp-trenner {
  margin: 0.3rem 0 0.1rem; padding: 0.15rem 0.5rem;
  font-size: var(--cde-font-xs); color: var(--cde-text-dimmer);
  text-transform: uppercase; letter-spacing: 0.04em;
  border-top: 1px solid var(--cde-tint-weak);
}
.pp-vorlage { display: flex; align-items: center; }
.pp-vorlage .pp-zeile { flex: 1; }
.pp-vorlage-weg {
  display: inline-flex; align-items: center; justify-content: center;
  background: none; border: none; color: var(--cde-text-mute);
  padding: 0.2rem 0.35rem; cursor: pointer; border-radius: var(--cde-radius-sm);
}
.pp-vorlage-weg:hover { color: var(--cde-danger); background: var(--cde-fill); }
.pp-sichern { color: var(--cde-text-dim); }

.pp-zeile {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.4rem 0.6rem; cursor: pointer; text-align: left;
  background: transparent; border: 0; border-radius: 7px;
  color: var(--cde-text); font-size: var(--cde-font-sm);
  touch-action: manipulation;
}
.pp-zeile:hover { background: var(--cde-tint); }
.pp-zeile.aktiv { color: var(--cde-accent); }
.pp-farben { display: flex; gap: 0.3rem; padding: 0.2rem 0.6rem; }

.plan-wz-trenner {
  width: 1px; align-self: stretch; margin: 0 0.15rem;
  background: var(--cde-line-strong);
}

.cde-view {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--cde-bg-deep);
  /* DIE PINCH-SPERRE (2026-09-03). `pan-x pan-y` erlaubt weiter das
     Ein-Finger-Scrollen in den Panels, nimmt dem Browser aber den
     Zwei-Finger-Zoom: der vergrössert nur den sichtbaren Ausschnitt, und
     weil dieses Element `fixed` ist und nicht scrollt, wäre die Kopfzeile
     danach unerreichbar. Der Canvas bleibt bei `touch-action: none` und
     bekommt seine eigenen Gesten — strenger als der Vorfahr ist erlaubt. */
  touch-action: pan-x pan-y;
}

/* Die Notleiste sitzt am SICHTBAREN Ausschnitt (Stil kommt aus
   `useZoomSperre.leistenStil`), nicht im Layout — sonst wäre sie genauso
   unerreichbar wie das, worüber sie berichtet. */
.cde-zoom-notleiste {
  position: fixed;
  z-index: 9999;
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.45rem 0.7rem;
  background: color-mix(in srgb, var(--cde-warn) 22%, var(--cde-bg-alt));
  color: var(--cde-text-bright);
  border-bottom: 1px solid var(--cde-warn);
  font-size: 0.8rem;
  box-shadow: var(--cde-shadow-float);
}
.cde-zoom-btn {
  background: var(--cde-warn);
  /* Modus-Fläche ⇒ Modus-Text: auf der warmen Warnfläche liest sich der
     tiefe Hintergrund, nicht die helle Schrift. */
  color: var(--cde-bg-deep);
  border: none; border-radius: 5px;
  padding: 0.25rem 0.6rem;
  font-size: 0.78rem; font-weight: 700;
  cursor: pointer;
  touch-action: manipulation;
}
.cde-zoom-tipp { opacity: 0.75; }

/* ── Projekt-Leiste ── */
.cde-bar {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.4rem 0.8rem;
  background: var(--cde-bg-alt);
  border-bottom: 1px solid var(--cde-tint);
  flex-shrink: 0;
}
.cde-brand { color: var(--cde-text-bright); font-weight: 700; font-size: 0.9rem; letter-spacing: 0.02em; }
.cde-spacer { flex: 1; }

.cde-project-select {
  background: var(--cde-tint-weak);
  border: 1px solid var(--cde-tint-max);
  color: var(--cde-text-bright);
  border-radius: 5px;
  padding: 0.25rem 0.4rem;
  font-size: 0.78rem;
  min-width: 200px; max-width: 320px;
}

.cde-btn {
  background: var(--cde-tint-weak);
  border: 1px solid var(--cde-tint-max);
  color: var(--cde-text);
  border-radius: 5px;
  padding: 0.25rem 0.55rem;
  font-size: 0.75rem;
  cursor: pointer;
  white-space: nowrap;
}
.cde-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--cde-accent) 20%, transparent); color: var(--cde-text-bright); }
.cde-btn.active { background: color-mix(in srgb, var(--cde-accent) 30%, transparent); border-color: color-mix(in srgb, var(--cde-accent) 60%, transparent); color: var(--cde-accent-soft); }
.cde-btn:disabled { opacity: 0.4; cursor: default; }
.cde-btn.danger:hover { background: color-mix(in srgb, var(--cde-danger) 20%, transparent); color: var(--cde-danger-soft); border-color: color-mix(in srgb, var(--cde-danger) 50%, transparent); }
.cde-btn.sm { padding: 0.1rem 0.35rem; font-size: 0.7rem; }
.cde-btn small { color: var(--cde-text-dim); }

.cde-bearbeiter {
  display: flex; align-items: center; gap: 0.3rem;
  color: var(--cde-text-dim); font-size: 0.8rem;
}
.cde-bearbeiter input {
  background: var(--cde-tint-weak);
  border: 1px solid var(--cde-tint-max);
  color: var(--cde-text-bright);
  border-radius: 5px;
  padding: 0.22rem 0.4rem;
  font-size: 0.75rem;
  width: 130px;
}

/* ── Panels (Stammdaten / Register) ── */
.cde-panel {
  background: var(--cde-bg);
  border-bottom: 1px solid var(--cde-tint);
  padding: 0.6rem 0.8rem;
  flex-shrink: 0;
  max-height: 40vh;
  overflow-y: auto;
}
.cde-panel-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(140px, 1fr));
  gap: 0.5rem;
}
.cde-panel-grid label {
  display: flex; flex-direction: column; gap: 0.15rem;
  color: var(--cde-text-dim); font-size: 0.68rem;
}
.cde-panel-grid label.wide { grid-column: span 2; }
.cde-panel-grid input, .cde-panel-grid select {
  background: var(--cde-tint-weak);
  border: 1px solid var(--cde-tint-max);
  color: var(--cde-text-bright);
  border-radius: 4px;
  padding: 0.25rem 0.4rem;
  font-size: 0.76rem;
}
.cde-panel-footer {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 0.5rem;
}
.cde-hint { color: var(--cde-text-faint); font-size: 0.66rem; font-style: italic; }
.cde-empty { color: var(--cde-text-dim); font-size: 0.75rem; padding: 0.4rem; }

/* ── Dokument-Register ── */
.cde-doc-table { width: 100%; border-collapse: collapse; font-size: 0.75rem; color: var(--cde-text); }
.cde-doc-table th {
  text-align: left; color: var(--cde-text-dim); font-weight: 500;
  padding: 0.25rem 0.4rem;
  border-bottom: 1px solid var(--cde-tint-strong);
}
.cde-doc-table td { padding: 0.25rem 0.4rem; border-bottom: 1px solid var(--cde-tint-weak); }
.doc-name { color: var(--cde-text-bright); max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.doc-rev, .doc-size, .doc-date { font-variant-numeric: tabular-nums; color: var(--cde-text-dim); }
.doc-herkunft { white-space: nowrap; max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
.doc-actions { display: flex; gap: 0.25rem; }

.doc-status-hinweis {
  display: flex; align-items: center; gap: 0.35rem;
  margin: 0.35rem 0 0; padding: 0.25rem 0.45rem;
  font-size: var(--cde-font-xs); color: var(--cde-warn);
}
.doc-status {
  border-radius: 4px;
  padding: 0.12rem 0.3rem;
  font-size: 0.7rem;
  border: 1px solid;
  background: var(--cde-sunken);
}
.doc-status.iso-wip       { color: var(--cde-warn-soft); border-color: color-mix(in srgb, var(--cde-warn) 50%, transparent); }
.doc-status.iso-shared    { color: var(--cde-accent-soft); border-color: color-mix(in srgb, var(--cde-accent) 50%, transparent); }
.doc-status.iso-published { color: var(--cde-success); border-color: color-mix(in srgb, var(--cde-success-strong) 50%, transparent); }
.doc-status.iso-archived  { color: var(--cde-text-dim); border-color: color-mix(in srgb, var(--cde-text-invert) 20%, transparent); }

/* ── Viewer-Host ── */
.cde-workspace {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: stretch;
}

/* ── T5: Hochkant/schmal — Viewer oben, Panels als Bodenblätter ─────────────
   Breakpoint 900px paarweise mit CdePanel.vue (siehe dort). Grid statt
   flex-wrap: die Zeilenhöhen sind damit DETERMINIERT (Viewer = Rest,
   Blätter = 42dvh), statt vom align-content-Verteilungsalgorithmus
   abzuhängen. Zwei offene Blätter teilen sich die Zeile; ein einzelnes
   nimmt über :has() die volle Breite. flood-3D hat das Stapeln nachträglich
   versucht und wieder ausgebaut (17 Überlappungen) — deshalb ist die
   Hochkant-Gestalt hier Teil des Layouts, kein Nachtrag. */
@media (max-width: 900px) {
  .cde-workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) auto;
  }
  .cde-viewer-host { grid-row: 1; grid-column: 1 / -1; }
  .cde-workspace > .cde-panel { grid-row: 2; height: 42dvh; min-height: 0; }
  .cde-workspace > .side-left  { grid-column: 1; }
  .cde-workspace > .side-right { grid-column: 2; }
  .cde-workspace:not(:has(> .side-right)) > .side-left  { grid-column: 1 / -1; }
  .cde-workspace:not(:has(> .side-left))  > .side-right { grid-column: 1 / -1; }

  /* DIE KOPFZEILE BRICHT UM (Tablet-Rezept 2026-09-09). Am iPad hochkant
     (834 px) lagen ZEHN Bedienelemente ausserhalb des Bildes — darunter
     JEDER Panel-Knopf, die Hilfe und der Ausgang: Toolbox, Verlauf und
     Prüfliste waren schlicht nicht erreichbar. Gemessen, nicht vermutet.
     Der Umbruch kostet zwei Zeilen Höhe; unerreichbare Knöpfe kosten das
     Werkzeug. Marke und Abstandhalter fallen weg — die eine sagt nichts,
     der andere verhindert den Umbruch (flex: 1 füllt die Zeile). */
  .cde-bar { flex-wrap: wrap; row-gap: 0.35rem; }
  .cde-brand,
  .cde-spacer { display: none; }
  .cde-bearbeiter { order: 99; }
  .cde-project-select { min-width: 120px; max-width: 46vw; }
  /* Fingerziele 40 × 40 (gemessen: die Panel-Knöpfe waren 29 px breit).
     Das kostet eine Zeile mehr — ein Knopf, den man nicht trifft, kostet
     das Werkzeug. */
  .cde-bar button,
  .cde-bar .cde-ansicht-btn,
  .cde-bar select { min-height: 40px; }
  .cde-bar button { min-width: 40px; }
}

.cde-viewer-host {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

/* Beide Ansichten liegen deckungsgleich im selben Stapel. Der 3D-Viewer wird
   nur unsichtbar geschaltet, damit seine Canvas ihre Größe behält — mit
   `display:none` käme er schwarz zurück (siehe Kommentar im Template). */
.cp-head-btn {
  display: flex; align-items: center; justify-content: center;
  width: 20px; height: 20px;
  background: none; border: none; border-radius: var(--cde-radius-sm);
  color: var(--cde-text-mute); cursor: pointer;
}
.cp-head-btn:hover { background: var(--cde-fill-hover); color: var(--cde-accent); }

.host-lage { position: absolute; inset: 0; }
.host-lage.verborgen { visibility: hidden; pointer-events: none; }

.cde-ansicht-schalter {
  display: flex;
  gap: 2px;
  padding: 2px;
  background: var(--cde-fill);
  border: 1px solid var(--cde-line);
  border-radius: var(--cde-radius);
}
.cde-ansicht-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 2px 8px;
  background: none; border: none;
  border-radius: var(--cde-radius-sm);
  color: var(--cde-text-dim);
  font-size: var(--cde-font-xs);
  cursor: pointer;
  white-space: nowrap;
}
.cde-ansicht-btn:hover:not(:disabled) { background: var(--cde-fill-hover); color: var(--cde-text); }
.cde-ansicht-btn.active {
  background: var(--cde-accent-fill-hi);
  color: var(--cde-accent);
}
.cde-ansicht-btn:disabled { opacity: 0.4; cursor: default; }

.cde-sep {
  width: 1px; height: 1.3rem;
  background: var(--cde-line-strong);
  margin: 0 0.15rem;
}
.cde-btn.ghost { padding: 0.25rem 0.4rem; }

/* ── Auftragswahl und Auftragsanzeige (Stufe 11.3) ──────────────────────── */
.cde-auftrag {
  font-size: var(--cde-font-sm);
  color: var(--cde-text-bright);
  padding: 0.15rem 0.5rem;
  border: 1px solid var(--cde-line);
  border-radius: var(--cde-radius-sm);
  background: var(--cde-fill);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 26ch;
}
.cde-auftragswahl { max-width: 46rem; }
.cde-auftragswahl h2 {
  margin: 0 0 0.3rem; font-size: var(--cde-font-md); color: var(--cde-text-bright);
}
.cde-fehler { color: var(--cde-danger); font-size: var(--cde-font-sm); margin: 0.4rem 0; }
.cde-auftragsliste {
  list-style: none; padding: 0; margin: 0.6rem 0 0;
  display: flex; flex-direction: column; gap: 0.2rem;
  max-height: 22rem; overflow-y: auto;
}
.cde-auftrag-knopf {
  width: 100%; display: flex; align-items: baseline; gap: 0.6rem;
  padding: 0.35rem 0.5rem; text-align: left; cursor: pointer;
  background: var(--cde-fill); color: var(--cde-text);
  border: 1px solid var(--cde-line); border-radius: var(--cde-radius-sm);
  font-size: var(--cde-font-sm);
}
.cde-auftrag-knopf:hover:not(:disabled) { background: var(--cde-accent-fill-hi); color: var(--cde-accent); }
.cde-auftrag-knopf:disabled { opacity: 0.45; cursor: not-allowed; }
.cde-auftrag-knopf .nr { font-variant-numeric: tabular-nums; color: var(--cde-text-dim); min-width: 4ch; }
.cde-auftrag-knopf .nm { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.doc-satz { width: 2.4rem; text-align: center; }
.doc-satz input { accent-color: var(--cde-accent); cursor: pointer; }
.cde-migration {
  display: flex; align-items: center; gap: 0.5rem;
  border-left: 3px solid var(--cde-accent);
  font-size: var(--cde-font-sm); color: var(--cde-text);
}
.bf-alle { font-style: italic; color: var(--cde-text-dim); }
.bf-kategorie td { border-bottom: 1px solid var(--cde-tint); }
.bf-messung { white-space: nowrap; }
.bf-dim { color: var(--cde-text-dimmer); margin-left: 0.3rem; font-size: 0.7rem; }
.bf-guete--gemessen   { color: var(--cde-success-strong); }
.bf-guete--geschaetzt { color: var(--cde-warn); }
.bf-guete--unbekannt  { color: var(--cde-danger); }
.bf-fremd {
  display: inline-block; margin: 0 0.2rem; padding: 0 0.35rem; border-radius: 3px;
  background: var(--cde-tint-weak); color: var(--cde-text-bright); font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.bf-gruppe {
  margin-left: 0.2rem; padding: 0 0.25rem;
  border: 1px solid var(--cde-line); border-radius: var(--cde-radius-sm);
  color: var(--cde-accent); font-size: var(--cde-font-xs); cursor: help;
}
.bf-feld {
  display: flex; align-items: center; gap: 0.4rem;
  margin: 0.35rem 0 0.5rem;
}
</style>
