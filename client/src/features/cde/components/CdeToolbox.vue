<template>
  <!-- Die Tafel „Bauteil“ (Kassensturz H2). Vorher zwei Tafeln — „Toolbox“ und
       „Eigenschaften“ —, die sich gegenseitig aus der Leiste verdrängten.
       Reihenfolge nach der Regel „erst die Handlung, dann die Erklärung“:
       Werkzeuge, Achse, Befunde, Merkmale; „Warum?“ und das Modell zugeklappt. -->
  <div class="tb">
    <!-- OHNE AUSWAHL: was man ohne Subjekt tun kann. Eine leere Tafel sähe kaputt aus. -->
    <template v-if="!bearbeitung.bauteil">
      <!-- Ein Zeichenwerkzeug läuft ohne Auswahl: was es tut, und der Ausgang. -->
      <div v-if="bearbeitung.scharf" class="tb-scharf">
        <p class="tb-scharf-titel">
          <CdeIcon :name="bearbeitung.scharf.icon || 'edit'" :size="13" /> {{ bearbeitung.scharf.titel }}
        </p>
        <!-- DAS FORMULAR STEHT HIER (Teil XXX, B1 — Fabios E-B1); unter dem Bild bleibt eine Zeile. Ohne Viewer
             (Tests, Einzelmontage) bleibt es bei der Leiste. -->
        <p class="tb-warum">Punkte ins Gelände setzen — Enter schliesst ab, Esc bricht ab.<template v-if="!werkzeugKarte"> Die Felder stehen unten in der Leiste.</template></p>
        <CdeWerkzeugKarte v-if="werkzeugKarte" :motor="werkzeugKarte.motor" :chips="werkzeugKarte.chips.value"
                          :profile="werkzeugKarte.profile.value" @uebernehmen="werkzeugKarte.uebernehmen()"
                          @geste="werkzeugKarte.geste" @geste-ab="werkzeugKarte.gesteAb()" />
        <p v-if="rueckmeldung" class="tb-rueckmeldung">{{ rueckmeldung }}</p>
        <button v-if="bearbeitung.scharf.rezept" class="tb-btn" type="button" @click="vorlageSichern">
          <CdeIcon name="save" :size="13" /> <span>Als Vorlage sichern …</span>
        </button>
        <button v-if="!werkzeugKarte" class="tb-btn tb-btn--aus" type="button" @click="bearbeitung.abbrechen()">Abbrechen</button>
      </div>
      <template v-else>
        <p class="tb-leer">
          Kein Bauteil gewählt. Ein Klick ins Modell zeigt, was daran möglich ist.
        </p>
        <!-- ERZEUGEN (Abnahme 2026-09-12, E8): gezeichnet wird im 3D, auf dem
             Gelände in der Draufsicht — der Lageplan ist das Blatt. -->
        <h4 class="tb-kopf">Erzeugen</h4>
        <p class="tb-warum">Im Bild auf das Gelände: Punkte anklicken, Enter schliesst ab. Das Bild geht dafür in die Draufsicht.</p>
        <p v-if="rueckmeldung" class="tb-rueckmeldung">{{ rueckmeldung }}</p>
        <p v-if="sperrgrund" class="tb-sperre">
          <CdeIcon name="warn" :size="12" /> {{ sperrgrund }}
        </p>
        <!-- DIE PALETTE (Teil XXIX, G3): Suche, „Allgemein" (Grundformen, Klasse wählbar), darunter je Gewerk
             seine Bauteile und Vorlagen. Vorher eine flache Liste mit 18 Einträgen und eine zweite für Vorlagen. -->
        <input v-model="suche" class="tb-suche" type="search" placeholder="Suchen: Bauteil, Vorlage …" aria-label="Werkzeug suchen" />
        <template v-if="suche.trim()">
          <div class="tb-liste">
            <button v-for="e in suchTreffer" :key="`${e.art}:${e.id}:${e.gewerk ?? ''}`" class="tb-btn" :disabled="!!sperrgrund"
                    :title="sperrgrund || e.titel" @click="starteEintrag(e)">
              <CdeIcon :name="eintragIcon(e)" :size="13" /> <span>{{ e.titel }}</span>
            </button>
          </div>
          <p v-if="!suchTreffer.length" class="tb-warum">Nichts gefunden.</p>
        </template>
        <template v-else>
          <h5 class="tb-unterkopf">Allgemein</h5>
          <div class="tb-liste">
            <button v-for="e in pal.allgemein" :key="e.id" class="tb-btn" :disabled="!!sperrgrund"
                    :title="sperrgrund || `${e.titel} — die Klasse ist im Formular wählbar`" @click="starteEintrag(e)">
              <CdeIcon :name="eintragIcon(e)" :size="13" /> <span>{{ e.titel }}</span>
            </button>
          </div>
          <div class="tb-reiter" role="tablist" aria-label="Gewerke">
            <button v-for="g in reiter" :key="g.id" type="button" role="tab" :aria-selected="g.id === reiterId"
                    :class="['tb-reiter-btn', { 'tb-reiter-btn--an': g.id === reiterId }]" @click="waehleReiter(g.id)">
              {{ g.titel }}
            </button>
          </div>
          <template v-if="reiterInhalt">
            <template v-if="reiterInhalt.bauteile.length">
              <h5 class="tb-unterkopf">Bauteile</h5>
              <div class="tb-liste">
                <button v-for="e in reiterInhalt.bauteile" :key="e.id" class="tb-btn" :disabled="!!sperrgrund"
                        :title="sperrgrund || e.titel" @click="starteEintrag(e)">
                  <CdeIcon :name="eintragIcon(e)" :size="13" /> <span>{{ e.titel }}</span>
                </button>
              </div>
            </template>
            <template v-if="reiterInhalt.vorlagen.length">
              <h5 class="tb-unterkopf">Vorlagen</h5>
              <div class="tb-liste">
                <div v-for="e in reiterInhalt.vorlagen" :key="e.id" class="tb-vorlage">
                  <button class="tb-btn" :disabled="!!sperrgrund"
                          :title="sperrgrund || `${e.titel} — ${VORLAGE_HERKUNFT[e.herkunft] ?? 'Vorlage'}`" @click="starteEintrag(e)">
                    <CdeIcon :name="eintragIcon(e)" :size="13" /> <span>{{ e.titel }}</span>
                  </button>
                  <button v-if="e.art === 'vorlage' && e.herkunft !== 'eingebaut'" class="tb-vorlage-weg" type="button"
                          :title="`Vorlage löschen (${e.herkunft === 'buero' ? 'Büro' : 'Projekt'})`" aria-label="Vorlage löschen"
                          @click="vorlageEntfernen(e.vorlage)"><CdeIcon name="delete" :size="11" /></button>
                </div>
              </div>
            </template>
          </template>
        </template>
        <!-- GELÄNDE (K4, Fabio 2026-09-20): „das Gelände sollte am besten gar
             nicht auswählbar sein — oder nur über einen Knopf." Seit K3 fängt
             der Klick es nicht mehr; geformt wird es hier. Das Gelände wird
             dabei WIRKLICH gewählt (der Eingabe-Motor braucht ein Subjekt),
             nur ohne Klick und ohne Kamerasprung. -->
        <template v-if="gelaendeWerkzeuge.length">
          <h4 class="tb-kopf">Gelände</h4>
          <p v-if="!gelaende.length" class="tb-warum">Kein Gelände geladen — erst ein Modell mit Geländefläche öffnen.</p>
          <template v-else>
            <label v-if="gelaende.length > 1" class="tb-gelaende-wahl">
              <span>Fläche</span>
              <select v-model="gewaehltesGelaende" :disabled="!!sperrgrund">
                <option v-for="g in gelaende" :key="g.globalId" :value="g.globalId">
                  {{ g.name || (g.herkunft === 'cde' ? 'Gelände (CDE)' : 'Gelände') }}
                </option>
              </select>
            </label>
            <div class="tb-liste">
              <button
                v-for="b in gelaendeWerkzeuge"
                :key="b.id"
                class="tb-btn"
                :disabled="!!sperrgrund"
                :title="sperrgrund || b.titel"
                @click="gelaendeWerkzeug(b.id)"
              >
                <CdeIcon :name="b.icon" :size="13" />
                <span>{{ b.titel }}</span>
              </button>
            </div>
            <button
              class="tb-btn tb-btn--leise"
              type="button"
              :title="`Merkmale, Mengen und Querschnitt dieser Fläche — ohne Kamerasprung`"
              @click="gelaendeZeigen()"
            >
              <CdeIcon name="info" :size="13" /> <span>Eigenschaften</span>
            </button>
          </template>
        </template>
        <!-- KATALOG (Teil XXIII, A5): was aus Büro oder Projekt NICHT gilt, weil
             es die Prüfung nicht besteht — sonst wirkte es still als
             „Werkzeug erscheint nie". -->
        <template v-if="bearbeitung.katalogBefunde.length">
          <h4 class="tb-kopf">Katalog</h4>
          <p class="tb-warum">Diese Einträge gelten nicht — sie sind fehlerhaft:</p>
          <ul class="tb-katalog">
            <li v-for="(b, i) in bearbeitung.katalogBefunde" :key="`${b.art}|${b.id}|${i}`">
              <strong>{{ KATALOG_ART[b.art] ?? b.art }} „{{ b.id ?? '?' }}"</strong>
              <span class="tb-katalog-ebene">{{ KATALOG_EBENE[b.ebene] ?? 'Büro oder Projekt' }}</span>
              — {{ b.fehler.join(' ') }}
            </li>
          </ul>
        </template>
      </template>
    </template>

    <template v-else>
      <!-- Kopf: was ist das hier? -->
      <div class="tb-titel">
        <strong>{{ bearbeitung.bauteil.name || '(ohne Namen)' }}</strong>
        <code>{{ herleitung.kategorie }}</code>
      </div>
      <!-- DIE FACETTEN (Teil XXIX, G4): Gewerk, Ausführung, das Bauwerk mit Pfad, die Vorlage — kein Baum, Eigenschaften
           des Bauteils. Ein Bauwerk im Pfad ist ein Sprung dorthin. -->
      <div v-if="facetten.gewerk || facetten.bauwerk.length || facetten.vorlage || facetten.klasse?.predefinedType" class="tb-facetten">
        <span v-if="facetten.gewerk" class="tb-chip" :title="`Gewerk — ${GEWERK_QUELLE[facetten.gewerk.quelle] ?? ''}`">
          {{ facetten.gewerk.titel }}
        </span>
        <span v-if="facetten.klasse?.predefinedType" class="tb-chip" title="Ausführung (IFC-PredefinedType) und Objekttyp">
          {{ facetten.klasse.predefinedType }}<template v-if="facetten.klasse.objektTyp"> · {{ facetten.klasse.objektTyp }}</template>
        </span>
        <span v-if="facetten.bauwerk.length" class="tb-pfad" title="Gehört zu — ein Klick wählt das Bauwerk">
          <template v-for="(b, i) in bauwerkPfad" :key="b.globalId">
            <span v-if="i" class="tb-pfad-trenner">›</span>
            <button type="button" class="tb-chip tb-chip--link" :disabled="b.fehlt" @click="zumBauteil(b.globalId)">{{ b.name }}</button>
          </template>
        </span>
        <span v-if="facetten.vorlage?.art === 'bauwerk'" class="tb-chip tb-chip--vorlage">aus Vorlage „{{ facetten.vorlage.titel }}"</span>
        <span v-else-if="facetten.vorlage?.art === 'rolle'" class="tb-chip tb-chip--vorlage">
          Rolle {{ facetten.vorlage.rolle }} der Vorlage „{{ facetten.vorlage.titel }}"
        </span>
        <span v-else-if="facetten.vorlage?.art === 'bibliothek'" class="tb-chip tb-chip--vorlage" title="Aus der Bibliothek gezeichnet">
          Vorlage „{{ facetten.vorlage.titel }}"
        </span>
        <span v-else-if="facetten.vorlage?.art === 'baugruppe'" class="tb-chip tb-chip--vorlage" title="Aus einer Baugruppe der Bibliothek gesetzt">
          aus Baugruppe „{{ facetten.vorlage.titel }}"
        </span>
      </div>
      <p v-if="facetten.vorlage?.art === 'rolle' && facetten.vorlage.abweichend.length" class="tb-hinweis">
        Weicht von der Vorlage ab ({{ facetten.vorlage.abweichend.join(', ') }}) — beim nächsten Wertesetzen wird es übersprungen.
        Angleichen am Bauwerk „{{ facetten.vorlage.bauwerkName }}".
      </p>
      <p v-else-if="facetten.vorlage?.art === 'rolle'" class="tb-warum">
        Die Vorlage steuert Maße und Lage dieses Teils. Wer sie hier ändert, nimmt es aus der Steuerung — beim nächsten
        Wertesetzen wird es übersprungen. Stattdessen am Bauwerk „{{ facetten.vorlage.bauwerkName }}" die Werte ändern.
      </p>

      <!-- WORAUF SICH DER KLICK BEZIEHT. Bei einer Rahmenauswahl ändert eine
           Bearbeitung womöglich fünfzehn Bauteile — das muss dastehen, bevor
           man klickt, nicht danach im Verlauf. -->
      <p v-if="mehrfach" class="tb-mehrfach">
        <CdeIcon name="layers" :size="12" />
        <span>
          <strong>{{ mehrfach.anzahl }} Bauteile gewählt.</strong>
          {{ mehrfach.text }}
        </span>
      </p>

      <!-- Die scharfe Bearbeitung verdrängt die Liste — ihr FORMULAR steht nur
           in der Kontextleiste unter dem Bild (Teil XVI, S6). Hier bleibt, was
           die Tafel weiss: was die Bearbeitung bewirkt, und der Ausgang. -->
      <div v-if="bearbeitung.scharf" class="tb-scharf">
        <p class="tb-scharf-titel">
          <CdeIcon :name="bearbeitung.scharf.icon || 'edit'" :size="13" /> {{ bearbeitung.scharf.titel }}
          <span v-if="bearbeitung.bauteil?.name" class="tb-scharf-subjekt">{{ bearbeitung.bauteil.name }}</span>
        </p>
        <!-- Das Formular steht hier (Teil XXX, B1). -->
        <CdeWerkzeugKarte v-if="werkzeugKarte" :motor="werkzeugKarte.motor" :chips="werkzeugKarte.chips.value"
                          :profile="werkzeugKarte.profile.value" @uebernehmen="werkzeugKarte.uebernehmen()"
                          @geste="werkzeugKarte.geste" @geste-ab="werkzeugKarte.gesteAb()" />
        <p v-else-if="festlegungsHinweis" class="tb-hinweis">{{ festlegungsHinweis }}</p>
        <p v-if="!werkzeugKarte" class="tb-warum">Eingabe unten in der Leiste — Griffe im Bild ziehen dieselben Felder.</p>
        <p v-if="rueckmeldung" class="tb-rueckmeldung">{{ rueckmeldung }}</p>
        <button v-if="bearbeitung.scharf.rezept" class="tb-btn" type="button" @click="vorlageSichern">
          <CdeIcon name="save" :size="13" /> <span>Als Vorlage sichern …</span>
        </button>
        <button v-if="!werkzeugKarte" class="tb-btn tb-btn--aus" type="button" @click="bearbeitung.abbrechen()">Abbrechen</button>
      </div>

      <!-- DIE WERKZEUGE ZUERST. Ein Werkzeug wählen heißt bearbeiten (E4):
           grau ist ein Knopf nur mit einem echten Grund — und der steht da. -->
      <template v-else>
        <p v-if="rueckmeldung" class="tb-rueckmeldung">{{ rueckmeldung }}</p>
        <p v-if="sperrgrund" class="tb-sperre">
          <CdeIcon name="warn" :size="12" /> {{ sperrgrund }}
        </p>
        <!-- DIE VORLAGE (Teil XXIX, G4 — Konzept § 6): am Bauwerk aus einer Vorlage ihre Rollen als Tabelle — Bauteil,
             Stand (gesteuert / abweichend: Feld / fehlt), „Angleichen" je Zeile —, die Werte und „Lösen". -->
        <section v-if="facetten.vorlage?.art === 'bauwerk'" class="tb-gruppe">
          <h4 class="tb-kopf" title="Bauwerk aus einer Vorlage: die Werte steuern die Teile">Vorlage „{{ facetten.vorlage.titel }}"</h4>
          <table class="tb-rollen">
            <tbody>
              <tr v-for="r in rollen" :key="r.rolle">
                <td class="tb-rolle">{{ r.rolle }}</td>
                <td>
                  <button v-if="r.status !== 'fehlt'" type="button" class="tb-chip tb-chip--link" @click="zumBauteil(r.globalId)">{{ r.name }}</button>
                  <span v-else class="tb-leise">gelöscht</span>
                </td>
                <td>
                  <span :class="['tb-status', `tb-status--${r.status}`]" :title="r.felder.join(', ')">
                    {{ ROLLEN_STATUS[r.status] }}<template v-if="r.felder.length">: {{ r.felder.join(', ') }}</template>
                  </span>
                </td>
                <td>
                  <button v-if="r.status !== 'gesteuert'" type="button" class="tb-btn tb-btn--klein" :disabled="!!sperrgrund"
                          :title="sperrgrund || `Die Rolle ${r.rolle} wieder nach der Vorlage bauen`" @click="werkzeug('an-vorlage-angleichen', { rolle: r.rolle })">
                    Angleichen
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <div class="tb-liste">
            <button class="tb-btn" :disabled="!!sperrgrund" :title="sperrgrund || 'Die Werte der Vorlage — alle gesteuerten Teile folgen'"
                    @click="werkzeug('vorlage-werte-setzen')">
              <CdeIcon name="measure" :size="13" /> <span>Werte ändern</span>
            </button>
            <button class="tb-btn" :disabled="!!sperrgrund" :title="sperrgrund || 'Danach ein gewöhnliches Bauwerk — die Teile bleiben, nur ohne Steuerung'"
                    @click="werkzeug('von-vorlage-loesen')">
              <CdeIcon name="close" :size="13" /> <span>Von der Vorlage lösen</span>
            </button>
          </div>
        </section>
        <!-- DIE BAUGRUPPE (Teil XXIX, G5): ein fertiges Bauwerk in die Bibliothek — gesetzt wird es danach aus dem
             Reiter seines Gewerks mit einem Punkt und einer Drehung, ein Kommando. -->
        <section v-if="facetten.behaelter" class="tb-gruppe">
          <h4 class="tb-kopf" title="Das Bauwerk mit seinen Teilen als Baugruppe in die Bibliothek">Bauwerk</h4>
          <div class="tb-liste">
            <button class="tb-btn" type="button" :title="'Teile, Maße und Verweise — ohne Formeln; Ableitungen bleiben draussen'"
                    @click="baugruppeSichern">
              <CdeIcon name="save" :size="13" /> <span>Als Baugruppe sichern …</span>
            </button>
          </div>
        </section>
        <!-- „WIE DIESES" (Teil XXIX, G8 — Pipette, W4): ein neues Bauteil mit den Werten des gewählten, ohne Bibliothek.
             Das Zeichenwerkzeug, das es gemacht hat, mit seinen Feldern vorbelegt; die Punkte zeichnet man neu. -->
        <section v-if="wieDiesesPlan" class="tb-gruppe">
          <h4 class="tb-kopf" title="Ein neues Bauteil mit den Werten des gewählten — Klasse, Ausführung, Maße, Gewerk, Vorlage">Wie dieses</h4>
          <div class="tb-liste">
            <button class="tb-btn" :disabled="!!sperrgrund"
                    :title="sperrgrund || `Neu zeichnen mit: ${Object.keys(wieDiesesPlan.vorgaben).join(', ') || 'den Vorgaben des Werkzeugs'}`"
                    @click="wieDiesesZeichnen">
              <CdeIcon name="copy" :size="13" /> <span>Wie dieses zeichnen</span>
            </button>
          </div>
        </section>
        <!-- ECKEN ZIEHEN (Teil XXII, Fabio 2026-09-18: „nur in der Bearbeitung,
             nur als Knopf, dann an allen Ecken"): ohne diesen Knopf trägt ein
             Erdkörper keine Griffe. -->
        <section v-if="eckenMoeglich" class="tb-gruppe">
          <h4 class="tb-kopf" title="Oberkante, Sohle bzw. Fuss und Krone — jede Ecke mit Führungslinien">Ecken</h4>
          <div class="tb-liste">
            <button v-if="!eckenAktiv" class="tb-btn" :disabled="!!sperrgrund" :title="sperrgrund || 'Griffe an allen Ecken dieses Körpers'"
                    @click="eckenZiehen">
              <CdeIcon name="pointer" :size="13" /> <span>Ecken ziehen</span>
            </button>
            <button v-else class="tb-btn tb-btn--aus" type="button" @click="bearbeitung.eckenBeenden()">
              <CdeIcon name="check" :size="13" /> <span>Fertig</span>
            </button>
          </div>
          <p v-if="eckenAktiv" class="tb-warum">
            Jede Ecke im Bild ziehen — die Linien fangen an Kanten, rechten Winkeln und Fluchten. Der kleine Griff daneben ändert die Höhe; an der Sohle (Krone) gilt sie für den ganzen Körper. Sohlkante, Oberkante und Fuß gleiten quer und setzen ein Maß des Ganzen: Sohlbreite, Böschung, Arbeitsraum.
          </p>
        </section>
        <!-- DER GERINNE-SCHNITT (Teil XX, Stufe D): an einer Station quer zur
             Achse — Urgelände, Gelände jetzt, Soll. Nur auf Wunsch gerechnet. -->
        <section v-if="querschnittMoeglich" class="tb-gruppe">
          <h4 class="tb-kopf" title="Urgelände, Gelände jetzt und Soll-Trapez quer zur Achse">Querschnitt</h4>
          <div v-if="!querschnittOffen" class="tb-liste">
            <button class="tb-btn" type="button" title="Den Schnitt an einer Station zeigen" @click="querschnittOffen = true">
              <CdeIcon name="gerinne" :size="13" /> <span>Querschnitt zeigen</span>
            </button>
          </div>
          <template v-else>
            <CdeQuerschnitt :subjekt="bearbeitung.bauteil" />
            <div class="tb-liste">
              <button class="tb-btn tb-btn--aus" type="button" @click="querschnittOffen = false">
                <CdeIcon name="close" :size="13" /> <span>Schliessen</span>
              </button>
            </div>
          </template>
        </section>
        <section v-for="g in herleitung.gruppen" :key="g.art" class="tb-gruppe">
          <h4 class="tb-kopf" :title="g.warum">{{ g.titel }}</h4>
          <div class="tb-liste">
            <button
              v-for="b in g.eintraege"
              :key="b.id"
              class="tb-btn"
              :disabled="!!sperrgrund"
              :title="sperrgrund || (b.nurFestlegung ? 'Geht als Forderung an den Planer — die Geometrie bleibt bei ihm' : b.titel)"
              @click="werkzeug(b.id)"
            >
              <CdeIcon :name="b.icon" :size="13" />
              <span>{{ b.titel }}</span>
              <!-- Die Beschriftung, die DIESER Typ dem Feld gibt: „DN“ am Rohr,
                   „Profilreihe“ am Träger — das Vokabular kommt aus Daten. -->
              <em v-if="b.felder.length" class="tb-feld">{{ b.felder.map(f => f.label).join(', ') }}</em>
              <!-- IM BILD ZIEHBAR (K5): seit Griffe nur noch mit scharfem
                   Werkzeug stehen, muss dastehen, welcher Knopf einen bringt —
                   sonst ist der Weg unentdeckbar, auf dem Finger erst recht
                   (dort gibt es kein Schweben). Die Liste kommt aus Griffe.js. -->
              <CdeIcon v-if="GRIFF_WERKZEUGE.includes(b.id)" name="pointer" :size="11" class="tb-ziehbar"
                       title="Im Bild ziehbar — der Griff erscheint, sobald dieses Werkzeug läuft" />
              <CdeIcon v-if="b.nurFestlegung" name="documents" :size="11" class="tb-nurfest" />
            </button>
          </div>
        </section>
      </template>

      <!-- WAS DIE ACHSE SAGT (Stufe 14.2): Sohlhöhen, Gefälle, Länge und DN —
           beim reinen Ansehen die interessantesten Zahlen an einer Haltung. -->
      <dl v-if="achse" class="tb-kette tb-achse">
        <dt>Sohle</dt>
        <dd>
          <b>{{ achse.anfangNn }}</b> → <b>{{ achse.endeNn }}</b> m NN
          <span class="tb-dim">({{ achse.gefaelle }})</span>
        </dd>
        <dt>Länge</dt>
        <dd class="tb-dim">
          {{ achse.laenge }} m<template v-if="achse.dn"> · DN {{ achse.dn }}</template>
          <span class="tb-dim"> — {{ achse.herkunft }}</span>
          <template v-if="achse.umgekehrt"><br>Fliessrichtung umgekehrt festgelegt</template>
        </dd>
      </dl>

      <!-- BEFUNDE (Stufe 14.4). Sie beraten; wo einer seine Kur kennt, genügt
           ein Klick — aus der Liste wird eine Arbeitsliste. -->
      <ul v-if="bearbeitung.befunde.length" class="tb-befunde">
        <li v-for="(b, i) in bearbeitung.befunde" :key="i" :class="'tb-b--' + b.schwere">
          <CdeIcon :name="b.schwere === 'warnung' ? 'warn' : 'info'" :size="12" />
          <span>
            {{ b.text }}
            <em class="tb-dim">
              {{ b.wert }}<template v-if="b.grenze"> · {{ b.grenze }}</template>
              <template v-if="b.quelle"> · {{ b.quelle }}</template>
            </em>
            <button
              v-if="b.kur && kurTitel(b)"
              class="tb-kur"
              :disabled="!!sperrgrund"
              :title="sperrgrund || 'Diese Bearbeitung starten'"
              @click="kur(b)"
            >
              <CdeIcon name="edit" :size="11" /> {{ kurTitel(b) }}
            </button>
          </span>
        </li>
      </ul>

      <!-- MERKMALE — vorher eine eigene Tafel („Eigenschaften“). -->
      <details class="tb-merkmale" open>
        <summary>Merkmale</summary>
        <!-- EIN BAUWERK hat keinen Körper, also kein Element im Viewer — im IFC ist es ein Raumelement mit eigenen
             Angaben (Teil XXIX, nach G8). Hier, was der Schreiber für es schreibt. -->
        <table v-if="bauwerkIfc" class="tb-rollen tb-ifc">
          <tbody>
            <tr><td class="tb-rolle">Klasse</td><td>{{ bauwerkIfc.klasse }}<template v-if="bauwerkIfc.objectType"> · {{ bauwerkIfc.objectType }}</template></td></tr>
            <tr><td class="tb-rolle">Name</td><td>{{ bauwerkIfc.name || '—' }}</td></tr>
            <tr><td class="tb-rolle">CDE-Id</td>
                <td :title="'Die IFC-GlobalId entsteht beim Ausgeben aus dieser Id — sie bleibt über Ausgaben gleich.'">
                  {{ bauwerkIfc.cdeId }} <span class="tb-leise">→ GlobalId beim Ausgeben</span></td></tr>
            <tr v-if="bauwerkIfc.klassifikation"><td class="tb-rolle">Klassifizierung</td>
                <td :title="bauwerkIfc.klassifikation.quelle ?? ''">{{ bauwerkIfc.klassifikation.code }} — {{ bauwerkIfc.klassifikation.name }}
                  <span class="tb-leise">({{ [bauwerkIfc.klassifikation.system, bauwerkIfc.klassifikation.edition].filter(Boolean).join(', ') }})</span></td></tr>
            <tr><td class="tb-rolle">Quagg_CDE</td><td>CdeId {{ bauwerkIfc.merkmale.Quagg_CDE.CdeId }} · Art {{ bauwerkIfc.merkmale.Quagg_CDE.Art }}</td></tr>
            <tr><td class="tb-rolle">Enthält</td>
                <td>{{ bauwerkIfc.teile }} {{ bauwerkIfc.teile === 1 ? 'Bauteil' : 'Bauteile' }}<template v-if="bauwerkIfc.bauwerke.length">, {{ bauwerkIfc.bauwerke.join(', ') }}</template></td></tr>
            <tr v-for="sy in bauwerkIfc.systeme" :key="sy.titel"><td class="tb-rolle">System</td>
                <td>{{ sy.titel }} <span class="tb-leise">— {{ sy.klasse }} {{ sy.ausfuehrung }}<template v-if="sy.objektTyp"> „{{ sy.objektTyp }}"</template>, {{ sy.teile }} {{ sy.teile === 1 ? 'Teil' : 'Teile' }}</span></td></tr>
          </tbody>
        </table>
        <IfcSemanticWindow v-else eingebettet />
      </details>

      <!-- WARUM? Die Herleitung beantwortet „woher weiß die CDE, was hier geht?“ —
           zugeklappt, weil sie erklärt und nicht handelt. -->
      <details class="tb-herleitung">
        <summary>Warum diese Werkzeuge?</summary>

        <dl class="tb-kette">
          <dt>Form</dt>
          <dd>
            <strong>{{ herleitung.bauformTitel }}</strong>
            <span class="tb-dim">aus {{ QUELLE_TEXT[herleitung.quelle] ?? herleitung.quelle }}</span>
            <span v-if="herleitung.regel" class="tb-dim">· Regel „{{ herleitung.regel }}“</span>
          </dd>

          <dt>Güte</dt>
          <dd>
            <span :class="['tb-guete', 'tb-guete--' + herleitung.guete]">{{ herleitung.guete }}</span>
            <span class="tb-dim">{{ GUETE_TEXT[herleitung.guete] }}</span>
          </dd>

          <!-- WAS GEMESSEN WURDE: ohne Deklaration schlägt die Formsignatur vor;
               ein Klick macht den Vorschlag zur Auslegung. -->
          <template v-if="herleitung.grund && (herleitung.quelle === 'geometrie' || herleitung.quelle === 'rueckfall')">
            <dt>Gemessen</dt>
            <dd>
              <span class="tb-dim">{{ herleitung.grund }}</span>
              <button
                v-if="herleitung.quelle === 'geometrie'"
                class="tb-kur tb-bestaetigen"
                :disabled="!!sperrgrund"
                :title="sperrgrund || `Als Auslegung übernehmen — ab dann gilt ${herleitung.bauformTitel} für dieses Bauteil`"
                @click="auslegen"
              >
                <CdeIcon name="bauform" :size="11" /> Als Auslegung übernehmen
              </button>
            </dd>
          </template>

          <dt>Typprofil</dt>
          <dd v-if="herleitung.profilAus">
            <code>{{ herleitung.profilAus }}</code>
            <span v-if="herleitung.profilUeberVererbung" class="tb-erbt">geerbt</span>
            <span class="tb-dim">kennt {{ herleitung.rollen.join(', ') }}</span>
          </dd>
          <dd v-else class="tb-dim">keins — es gelten nur die allgemeinen Bearbeitungen</dd>
          <!-- ENTWURF aus den bSI-Vorlagen (Teil XXIII, A5, S6): Rollen, die das
               geltende Profil nicht kennt. Wirkt erst nach dem Übernehmen. -->
          <dd v-if="entwurf" class="tb-entwurf">
            <span class="tb-dim">Entwurf aus den bSI-Vorlagen:</span>
            <span v-for="(f, rolle) in entwurf.felder" :key="rolle" class="tb-entwurf-feld" :title="f.quelle">
              {{ f.label }} <code>{{ f.quelle }}</code>
            </span>
            <button
              class="tb-kur tb-bestaetigen"
              type="button"
              :disabled="entwurfLaeuft"
              :title="`Als Typprofil für ${entwurf.kategorie} übernehmen — ab dann fragen die Werkzeuge danach`"
              @click="entwurfUebernehmen"
            ><CdeIcon name="check" :size="11" /> Übernehmen</button>
            <span v-if="entwurfMeldung" class="tb-dim">{{ entwurfMeldung }}</span>
          </dd>

          <dt>Vererbung</dt>
          <dd v-if="!herleitung.imWoerterbuch" class="tb-dim">
            in keinem IFC-Schema (2x3, 4, 4.3) — die Vererbung greift hier nicht
          </dd>
          <dd v-else class="tb-hierarchie">
            <span
              v-for="stufe in herleitung.kette"
              :key="stufe"
              :class="{ treffer: stufe === herleitung.profilAus }"
            >{{ stufe }}</span>
          </dd>
        </dl>

        <p v-if="herleitung.luecke" class="tb-luecke">
          <CdeIcon name="info" :size="12" /> {{ herleitung.luecke.text }}
        </p>
        <p v-for="w in herleitung.warnungen" :key="w" class="tb-warnung">
          <CdeIcon name="warn" :size="12" /> {{ WARNUNG_TEXT[w] ?? w }}
        </p>
      </details>

      <details v-if="herleitung.gesperrt.length" class="tb-gesperrt">
        <summary>Hier nicht möglich ({{ herleitung.gesperrt.length }})</summary>
        <!-- „Steht nicht in der Liste“ ist die schlechteste Rückmeldung: der
             Nutzer weiß nicht, ob das Werkzeug fehlt, sein Modell zu schlecht
             ist oder er etwas falsch macht. -->
        <div v-for="b in herleitung.gesperrt" :key="b.id" class="tb-nein">
          <span>{{ b.titel }}</span>
          <em>{{ b.warum }}</em>
        </div>
      </details>
    </template>

  </div>
</template>

<script setup>
/**
 * Toolbox — alle Bearbeitungen eines Bauteils, MIT ihrer Herkunft (Stufe 9.4b).
 *
 * Sie beantwortet eine Frage, die zweimal mündlich erklärt und zweimal nicht
 * angekommen ist: „Da liegt ein IFCElementXYZ — woher weiß die CDE, was ich
 * damit machen kann?" Der Grund, warum die Erklärung nicht trug, war kein
 * Erklärungsproblem: **die Kette war nirgends zu sehen.** Ein Mechanismus, der
 * nichts unterscheidet, lässt sich nicht beobachten.
 *
 * Deshalb gruppiert diese Toolbox nach HERKUNFT und nicht nach Werkzeugart:
 *
 *   Immer möglich                  → `bauform: '*'` — Merkmale, ohne Geometrie
 *   Weil <Bauform>                 → die FORM erlaubt es (acht Formen, fest)
 *   Weil das Bauteil es hat        → Typprofil, Rezept oder Regel nennen die Eigenschaft (Daten)
 *
 * Die Rechnung selbst steht in `services/Herleitung.js` und ist rein — diese
 * Datei zeigt sie nur an. Das ist Absicht: die Antwort auf „woher weiß das
 * Programm das" darf nicht in einer Vorlage stehen, sonst lässt sie sich nicht
 * prüfen.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import CdeIcon from './ui/CdeIcon.vue';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useIfcStore } from '../stores/useIfcStore.js';
import { useViewerApi } from '../composables/viewerApi.js';
import { useCdeStore } from '../stores/useCdeStore.js';
import { repo } from '../services/RepoFacade.js';
import { ladeVorlagen, speichereVorlage, loescheVorlage } from '../services/Bibliothek.js';
import { entwurfFuer } from '../services/bauform/Typprofilentwurf.js';
import { herleite } from '../services/Herleitung.js';
import { ausGruppe, nachId, eingabeArt, vorbelegtesGelaende, werkzeugKatalog, wieDieses } from '../services/Bearbeitungen.js';
import { palette, suchePalette } from '../services/Palette.js';
import { rezeptNach } from '../services/Bauteilrezepte.js';
import { facettenVon, rollenTabelle } from '../services/Facetten.js';
import { baugruppeAus } from '../services/rezept/Baugruppe.js';
import { verdeckteAus } from '../services/CdeAchsen.js';
import { bauwerkImIfc } from '../services/EigenbauPaket.js';
import CdeWerkzeugKarte from './CdeWerkzeugKarte.vue';
import { useAenderungen } from '../stores/useAenderungen.js';
import { GRIFF_WERKZEUGE } from '../services/Griffe.js';
import { hatHoehenbezug } from '../services/Hoehenbezug.js';
import { achsAnzeige } from '../services/Achsanzeige.js';
import { hatErdbauEcken } from '../services/Griffe.js';
import IfcSemanticWindow from './IfcSemanticWindow.vue';
import CdeQuerschnitt from './CdeQuerschnitt.vue';
import { schnittachseVon } from '../services/QuerschnittSicht.js';

const bearbeitung = useBearbeitung();
const ifc = useIfcStore();
const api = useViewerApi();
/** Formular, Gesten, Chips der scharfen Bearbeitung — vom Viewer (Teil XXX, B1); ohne ihn bleibt es bei der Leiste. */
const werkzeugKarte = (typeof api.werkzeugKarte === 'object' && api.werkzeugKarte?.inTafel) ? api.werkzeugKarte : null;
// Die Tafel meldet sich an: erst dann wird die Leiste unter dem Bild schmal (das Formular steht dann HIER).
onMounted(() => { if (werkzeugKarte?.inTafel) werkzeugKarte.inTafel.value++; });
onBeforeUnmount(() => { if (werkzeugKarte?.inTafel) werkzeugKarte.inTafel.value--; });
const aenderungen = useAenderungen();

// DIE FACETTEN (Teil XXIX, G4) — `services/Facetten.js`, rein; die Tafel zeigt nur.
const GEWERK_QUELLE = Object.freeze({ bauplan: 'am Bauteil gesetzt', rezept: 'aus dem Rezept', klasse: 'nach der Klasse' });
const ROLLEN_STATUS = Object.freeze({ gesteuert: 'gesteuert', abweichend: 'abweichend', fehlt: 'fehlt' });
const bauplanVon = (gid) => aenderungen.wirksamerStand('erzeugt').get(gid) ?? null;
const facetten = computed(() => (void aenderungen.anzahl, facettenVon(bearbeitung.bauteil,
  { bauplanVon, bauform: herleitung.value?.bauform ?? null, vorlagen: vorlagen.value ?? [] })));
const bauwerkPfad = computed(() => [...facetten.value.bauwerk].reverse());
/** Ein gewähltes Bauwerk, wie es im IFC steht (Teil XXIX, nach G8) — null für jedes andere Bauteil. */
const bauwerkIfc = computed(() => (void aenderungen.anzahl, facetten.value.behaelter && bearbeitung.bauteil?.globalId
  ? bauwerkImIfc(bearbeitung.bauteil.globalId, { stand: aenderungen.wirksamerStand('erzeugt'),
                                                verdeckt: verdeckteAus(aenderungen.wirksamerStand('geloescht')) })
  : null));
const rollen = computed(() => (void aenderungen.anzahl, facetten.value.vorlage?.art === 'bauwerk'
  ? rollenTabelle(bearbeitung.bauteil?.stand?.bauplan, bauplanVon, verdeckteAus(aenderungen.wirksamerStand('geloescht'))) : []));
function zumBauteil(gid) {
  rueckmeldung.value = '';
  return api.waehleEigenes?.(gid);
}

// Der Katalog lebt: ein Rezept aus der Bibliothek bringt sein Zeichenwerkzeug
// mit (Teil XXIII, A5). `katalogStand` wandert mit jeder Registrierung.
// Dazu die Bauwerke (Teil XXVI, Z5e): angelegt, nicht gezeichnet — `zeichnen` fällt
// für alles ohne Zug auf das normale Werkzeug zurück.
// DIE PALETTE (Teil XXIX, G3) — `services/Palette.js`, rein; die Tafel zeigt nur.
const pal = computed(() => (void bearbeitung.katalogStand, palette({ katalog: werkzeugKatalog(), vorlagen: vorlagen.value })));
const suche = ref('');
const suchTreffer = computed(() => suchePalette(pal.value, suche.value));
const reiter = computed(() => pal.value.gewerke.filter(g => g.bauteile.length || g.vorlagen.length));
const REITER_SCHLUESSEL = 'cde.palette.reiter';
const reiterId = ref((() => { try { return localStorage.getItem(REITER_SCHLUESSEL) || 'entwaesserung'; } catch { return 'entwaesserung'; } })());
const reiterInhalt = computed(() => reiter.value.find(g => g.id === reiterId.value) ?? reiter.value[0] ?? null);
function waehleReiter(id) {
  reiterId.value = id;
  try { localStorage.setItem(REITER_SCHLUESSEL, id); } catch { /* ohne Speicher gilt der Reiter bis zum Neuladen */ }
}
function eintragIcon(e) {
  return e.art === 'vorlage' ? (rezeptNach(e.rezept)?.icon ?? 'route') : (e.icon ?? 'edit');
}
/** Ein Eintrag der Palette: ein Werkzeug (aus einem Reiter mit dessen Gewerk, wo es abweicht) oder eine Vorlage. */
function starteEintrag(e) {
  // Eine Vorlage darf ihr Werkzeug nennen (G-T1: ein Weg wird als Band gezeichnet, nicht als Umriss).
  if (e.art === 'vorlage') return zeichnen(e.vorlage?.werkzeug ?? `${e.rezept}-zeichnen`, { vorlage: e.vorlage });
  return zeichnen(e.id, { gewerk: e.gewerk });
}

// ── Gelände formen, ohne es anzuklicken (K4) ────────────────────────────────
//
// Die Werkzeuge kommen aus dem Katalog (`gruppe: 'gelaende'`, jedes mit einer
// `operation`) — hier steht KEIN Operationsname, sonst wäre die Tafel eine
// zweite Liste neben `GELAENDE_OPS` (Wächter W2).
const gelaendeWerkzeuge = computed(() => (void bearbeitung.katalogStand,
  ausGruppe('gelaende').filter(b => b.operation)));
/** Die Geländeflächen des geladenen Satzes — die Liste kommt vom Viewer. */
const gelaende = ref([]);
const gewaehltesGelaende = ref('');

async function gelaendeLaden() {
  try {
    const liste = await (api.gelaendeListe?.() ?? []);
    gelaende.value = Array.isArray(liste) ? liste : [];
  } catch { gelaende.value = []; }
  // Vorbelegt ist das erste GELIEFERTE — dieselbe Regel wie im Katalog
  // (`vorbelegtesGelaende`), damit Knopf und Formular dasselbe meinen.
  if (!gelaende.value.some(g => g.globalId === gewaehltesGelaende.value)) {
    gewaehltesGelaende.value = vorbelegtesGelaende({ gelaendeQuellen: gelaende.value });
  }
}

// Ohne Auswahl ist die Tafel der Einstieg; die Liste hängt an der Modellmenge
// und am Journal (eine Formung erzeugt die Anzeigefläche).
watch(() => [bearbeitung.bauteil?.globalId ?? null, ifc.geometrieStand, bearbeitung.modusAn],
      () => { if (!bearbeitung.bauteil) gelaendeLaden(); }, { immediate: true });

function gelaendeWerkzeug(id) {
  rueckmeldung.value = '';
  const ok = api.gelaendeWerkzeugStarten?.(id, gewaehltesGelaende.value || null);
  Promise.resolve(ok).then((r) => {
    if (r === false) rueckmeldung.value = bearbeitung.letzterGrund || 'Das Werkzeug liess sich gerade nicht starten.';
  });
  return ok;
}

/** Merkmale, Mengen und Querschnitt der Fläche — ohne Klick, ohne Kamerasprung. */
function gelaendeZeigen() {
  const g = gelaende.value.find(x => x.globalId === gewaehltesGelaende.value) ?? gelaende.value[0];
  if (g) api.waehleOhneFahrt?.(g.modelId, g.localId);
}

/** Was beim Katalogladen abgewiesen wurde — gemeldet, nicht still verworfen (A5, S8). */
const KATALOG_ART = Object.freeze({ rezept: 'Rezept', typprofil: 'Typprofil', bauformregel: 'Bauformregel', vorlage: 'Vorlage',
                                   symbol: 'Plansymbol', regel: 'Regelwerk' });
const KATALOG_EBENE = Object.freeze({ buero: 'Büro', projekt: 'Projekt' });

const QUELLE_TEXT = Object.freeze({
  bauplan:    'dem eigenen Rezept',
  einzelfall: 'einer Auslegung für dieses Bauteil',
  regel:      'einer Büroregel',
  typprofil:  'dem Typprofil',
  geometrie:  'der Geometrie',
  rueckfall:  'keiner Angabe (Rückfall)',
});

const GUETE_TEXT = Object.freeze({
  gemessen:   'die Form steht wirklich im Modell',
  geschaetzt: 'aus dem Netz abgeleitet — prüfen',
  unbekannt:  'nicht ableitbar',
});

const WARNUNG_TEXT = Object.freeze({
  achse_nicht_ableitbar:    'Keine Achse im Modell und keine aus dem Netz — Lage nur grob bestimmbar.',
  achse_skelettiert:        'Die Achse ist aus dem Netz geschätzt, nicht vom Planer gezeichnet.',
  kein_koerper:             'Kein Volumen — Mengen und Massen sind hier nicht belastbar.',
  koerper_nicht_geschlossen: 'Das Volumen ist nicht geschlossen — Massen nur näherungsweise.',
});

/**
 * Was die Achse des gewählten Bauteils sagt — fertig formatiert.
 *
 * Die Rechnung gehört nicht in die Vorlage, und die Umrechnung nach m NN läuft
 * über dieselbe Stelle wie überall (`Hoehenbezug`). „Anfang" und „Ende" sind
 * nur bei einer EXAKTEN Achse belastbar; bei einer skelettierten ist die
 * Reihenfolge willkürlich, deshalb steht die Herkunft dabei.
 */
const achse = computed(() => achsAnzeige(bearbeitung.bauteil?.achse, {
  // Eine festgelegte Fliessrichtung gilt auch für die Anzeige — sonst stünde
  // hier weiter „läuft bergauf", während der Befund daneben verschwunden ist.
  umgekehrt: bearbeitung.bauteil?.stand?.fliessrichtung === 'umgekehrt',
  hoehenversatz: bearbeitung.bauteil?.hoehenversatz ?? 0,
}));

/**
 * Wie die Kur eines Befunds heisst — aus dem KATALOG, nicht aus der Tabelle.
 *
 * Die Zuordnung in `Befunde.js` nennt nur die Id; der Titel steht dort, wo die
 * Bearbeitung lebt. Zwei Stellen mit demselben Namen liefen auseinander, und
 * dann hiesse derselbe Knopf an zwei Orten verschieden. Kennt der Katalog die
 * Id nicht, entfällt der Knopf — ein Werkzeug, das es nicht gibt, wird nicht
 * angeboten.
 */
function kurTitel(befund) {
  return nachId(befund?.kur?.bearbeitung)?.titel ?? null;
}

/**
 * Die Auskunft zur Mehrfachauswahl — und welche Werkzeuge sie überhaupt trifft.
 *
 * Nicht jede Bearbeitung darf auf viele: fünf Schächte auf denselben
 * Rechtswert zu schieben legt sie übereinander. Der Katalog sagt mit
 * `mehrfach`, welche es dürfen; hier wird es gezählt und benannt, damit
 * niemand raten muss, was ein Klick anrichtet.
 */
const mehrfach = computed(() => {
  const n = bearbeitung.bauteile.length;
  if (n < 2) return null;
  // `herleitung` ist eine Computed — im Skript braucht sie `.value` (im
  // Template nicht). Ohne stand hier `undefined.flatMap`: JEDE Mehrfachauswahl
  // riss seit 14.10 die Toolbox beim Rendern (Headless-Befund B2, 2026-09-08).
  const viele = (herleitung.value?.gruppen ?? [])
    .flatMap(g => g.eintraege)
    .filter(e => nachId(e.id)?.mehrfach)
    .map(e => e.titel);
  return {
    anzahl: n,
    text: viele.length
      ? `Auf alle wirken: ${viele.join(', ')}. Alles Übrige nur auf „${bearbeitung.bauteil.name || 'das erste'}".`
      : 'Keines der angebotenen Werkzeuge wirkt auf mehrere — jedes trifft nur das erste.',
  };
});

/** Nordrichtung in Grad — die Umrechnung gehört nicht in die Vorlage. */

/** Der Typprofil-Entwurf für die Klasse des gewählten Bauteils — oder null (A5, S6). */
const entwurf = computed(() => (bearbeitung.bauteil
  ? entwurfFuer(herleitung.value.kategorie ?? bearbeitung.bauteil.category, bearbeitung.profilSatz) : null));
const entwurfLaeuft = ref(false);
const entwurfMeldung = ref('');
async function entwurfUebernehmen() {
  if (!entwurf.value) return;
  entwurfLaeuft.value = true;
  try {
    const r = await bearbeitung.entwurfUebernehmen(entwurf.value.kategorie);
    entwurfMeldung.value = r.ok ? `übernommen (${r.ebene === 'projekt' ? 'Projekt' : 'Büro'})` : r.grund;
  } finally {
    entwurfLaeuft.value = false;
  }
}

const herleitung = computed(() => herleite({
  el: bearbeitung.bauteil,
  einordnung: bearbeitung.einordnung,
  profilSatz: bearbeitung.profilSatz,
  // Derselbe Kontext wie `bearbeitung.moeglich` — sonst zeigte die Toolbox
  // einen Knopf, den der Store dann ablehnt (AE).
  kontext: bearbeitung.passendeKontext,
  // Teil XXIX, G2: am einzelnen Bauteil das Formular „Eigenschaften" statt eines Knopfs je Feld.
  einzeln: bearbeitung.bauteile.length < 2,
}));

/**
 * Was die scharfe Bearbeitung bewirkt — und was nicht.
 *
 * Der Höhenhinweis ist kein Beiwerk: ein Feld „Sohlhöhe [m NN]" behauptet einen
 * Höhenbezug. Hat das Modell keinen (Versatz 0), ist der Wert eine Zahl über
 * dem Modellursprung und nicht über NN — das muss dastehen, sonst trägt jemand
 * eine Planhöhe ein und wundert sich.
 */
const festlegungsHinweis = computed(() => {
  // Zug- und Umriss-Bearbeitungen werden im BILD gefüttert — das Formular
  // hier kann sie nicht abschliessen. Ohne den Hinweis sähe der Kur-Knopf zu
  // `loses_ende` aus wie ein toter Knopf (Gesetz 10). (Bis `c8ce9c4` stand
  // hier „im Lageplan"; gezeichnet wird seitdem nur im 3D.)
  const art = eingabeArt(bearbeitung.scharf);
  if (art === 'zug') return 'Im Bild auf das Gelände tippen — dort wird diese Bearbeitung abgeschlossen.';
  if (art === 'umriss') return 'Im Bild den Umriss zeichnen — der erste Punkt schliesst ihn.';
  if (bearbeitung.scharf?.nurFestlegung) {
    return 'Wird als Forderung an den Planer geführt und geht in den Änderungsbericht — die Geometrie bleibt bei ihm.';
  }
  const brauchtHoehe = bearbeitung.scharf?.brauchtRolle === 'sohlhoehe';
  if (brauchtHoehe && !hatHoehenbezug(bearbeitung.bauteil?.hoehenversatz)) {
    return 'Kein Höhenbezug im Modell — der Wert zählt ab Modellursprung, nicht ab NN.';
  }
  return '';
});

/** Was die letzte Bearbeitung bewirkt hat — der Nutzer muss es SEHEN. */
const rueckmeldung = ref('');

/**
 * Warum ein Werkzeug gerade nicht startet — nur ein ECHTER Grund: kein
 * Modell, Millimeter, ein Published-Stand. „Bearbeiten ist aus“ ist keiner
 * mehr (Kassensturz E4): ein Werkzeug wählen schaltet die Bearbeitung ein.
 */
const sperrgrund = computed(() => (bearbeitung.modusAn ? null : (api.bearbeitenSperrgrund?.() ?? null)));

/** Ein Werkzeug starten — über den Viewer, der die Bearbeitung einschaltet. */
function werkzeug(id, vorschlag = null) {
  rueckmeldung.value = '';
  const ok = api.werkzeugStarten?.(id, vorschlag ? { vorschlag } : {});
  if (ok !== undefined) return ok;
  // Ohne Viewer (früher Aufbau, Tests): der Store allein — ohne Modus weist er ab.
  return vorschlag ? bearbeitung.starteMitVorschlag(id, vorschlag) : bearbeitung.starte(id);
}
function kur(befund) { return werkzeug(befund.kur.bearbeitung, befund.kur.werte ?? {}); }

/** „Ecken ziehen" (Teil XXII): nur an Erdkörpern mit Ecken, nur über diesen Knopf. */
const eckenMoeglich = computed(() => hatErdbauEcken(bearbeitung.bauteil?.stand?.bauplan));
const eckenAktiv = computed(() => !!bearbeitung.eckenFuer && bearbeitung.eckenFuer === bearbeitung.bauteil?.globalId);
function eckenZiehen() {
  rueckmeldung.value = '';
  const ok = api.eckenZiehen?.() ?? bearbeitung.eckenStarten(bearbeitung.bauteil?.globalId);
  if (!ok) rueckmeldung.value = bearbeitung.letzterGrund || 'Ecken ziehen liess sich gerade nicht starten.';
}
function auslegen() { return werkzeug('bauform-auslegen', { bauform: herleitung.value.bauform }); }

/** Der Gerinne-Schnitt (Teil XX, Stufe D): nur an Vorgängen mit einer Achse (Gerinne, Kanalgraben). */
const querschnittMoeglich = computed(() => {
  void ifc.geometrieStand;
  const plan = bearbeitung.bauteil?.stand?.bauplan ?? null;
  return !!schnittachseVon(plan, { lauf: api.laufVon?.(plan?.ableitung) ?? null });
});
const querschnittOffen = ref(false);
// Eine andere Auswahl schliesst ihn (die Querlinie im Raum geht mit).
watch(() => bearbeitung.bauteil?.globalId, () => { querschnittOffen.value = false; });

// ── Erzeugen im 3D (Abnahme 2026-09-12, E8) ────────────────────────────────
/** Ein Zeichenwerkzeug starten — über den Motor im Raum; Vorlagen belegen vor. */
function zeichnen(id, { vorlage = null, gewerk = null, mit = null } = {}) {
  rueckmeldung.value = '';
  const b = nachId(id);
  if (!b || !['zug', 'umriss'].includes(eingabeArt(b))) return werkzeug(id);
  const vorgaben = (gewerk || mit) ? { ...(mit ?? {}), ...(gewerk ? { gewerk } : {}) } : null;
  const ok = api.zeichnenStarten?.(id, { ...(vorlage ? { vorlage } : {}), ...(vorgaben ? { vorgaben } : {}) });
  if (ok === false) rueckmeldung.value = bearbeitung.letzterGrund || 'Zeichnen liess sich gerade nicht starten.';
  return ok;
}

/** „Wie dieses" (G8, W4): nur an Eigenbau, das ein Zeichenwerkzeug gemacht hat — sonst kein Abschnitt. */
const wieDiesesPlan = computed(() => {
  void bearbeitung.katalogStand;
  const plan = bearbeitung.bauteil?.stand?.bauplan ?? null;
  const w = plan ? wieDieses(plan) : null;
  return w?.werkzeug ? w : null;
});
function wieDiesesZeichnen() {
  const w = wieDiesesPlan.value;
  if (w) zeichnen(w.werkzeug, { mit: w.vorgaben });
}

// Bauteilbibliothek (Lücke ⑨ / Stufe 9.8) — zog mit dem Zeichnen aus dem Lageplan hierher.
const cde = useCdeStore();
const VORLAGE_HERKUNFT = Object.freeze({ eingebaut: 'eingebaute Vorlage', buero: 'Büro-Vorlage', projekt: 'Projekt-Vorlage' });
const vorlagen = ref([]);
async function vorlagenLaden() {
  try { vorlagen.value = await ladeVorlagen(repo); }
  catch (fehler) { console.warn('cde: vorlagen laden', fehler?.message ?? fehler); }
}
// Die Bibliothek hängt am Repo — das Backend steht erst nach der Auftragswahl fest.
onMounted(vorlagenLaden);
watch(() => cde.auftrag?.id, vorlagenLaden);
// Eine Vorlage kann ein Rezept der Bibliothek nennen — gültig erst, wenn es registriert ist.
watch(() => bearbeitung.katalogStand, vorlagenLaden);

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
    // `vorlage` ist die HERKUNFT des gerade Gezeichneten (A1), keine Vorgabe —
    // eine neue Vorlage darf nicht auf die alte zeigen.
    if (feld === 'name' || feld === 'hoehe' || feld === 'vorlage') continue;
    if (['string', 'number', 'boolean'].includes(typeof wert) && wert !== '') vorgaben[feld] = wert;
  }
  const ebene = repo.buero && confirm('Für ALLE Projekte sichern (Büro-Ebene)?\n„Abbrechen" sichert nur in diesem Projekt.')
    ? 'buero' : 'projekt';
  const r = await speichereVorlage(repo, { name: name.trim(), rezept: scharf.rezept, vorgaben }, { ebene });
  if (!r.ok) console.warn('cde: vorlage sichern', r.grund);
  await vorlagenLaden();
  // Auch der Katalog liest die Bibliothek (Teil XXV, V3): aus ihr füllt
  // „Tauschen" seine Auswahl. Ohne dies böte es die neue Vorlage erst nach
  // dem nächsten Laden an.
  await bearbeitung.ladeProfile();
}

/** „Als Baugruppe sichern" (G5): das gewählte Bauwerk mit seinen Teilen in die Bibliothek. */
async function baugruppeSichern() {
  const gid = bearbeitung.bauteil?.globalId;
  if (!gid) return;
  const vorschlag = bearbeitung.bauteil?.name || 'Baugruppe';
  const name = prompt('Name der Baugruppe:', vorschlag);
  if (!name?.trim()) return;
  const { baugruppe, ausgelassen, grund } = baugruppeAus(gid, {
    bauplaene: aenderungen.wirksamerStand('erzeugt'), verdeckt: verdeckteAus(aenderungen.wirksamerStand('geloescht')), name });
  if (!baugruppe) { rueckmeldung.value = grund; return; }
  const ebene = repo.buero && confirm('Für ALLE Projekte sichern (Büro-Ebene)?\n„Abbrechen" sichert nur in diesem Projekt.')
    ? 'buero' : 'projekt';
  const r = await speichereVorlage(repo, baugruppe, { ebene });
  if (!r.ok) { rueckmeldung.value = `Nicht gesichert: ${r.grund}`; return; }
  await vorlagenLaden();
  await bearbeitung.ladeProfile();
  rueckmeldung.value = `Baugruppe „${baugruppe.name}" gesichert — ${baugruppe.teile.length} Teile`
    + (ausgelassen.length ? `; nicht mitgenommen: ${ausgelassen.map(a => `${a.name} (${a.grund})`).join(', ')}` : '') + '.';
}

async function vorlageEntfernen(v) {
  if (v.herkunft === 'eingebaut') return;
  if (!confirm(`Vorlage „${v.name}" löschen?`)) return;
  await loescheVorlage(repo, v.id, { ebene: v.herkunft });
  await vorlagenLaden();
  await bearbeitung.ladeProfile();
}

</script>

<style scoped>
.tb { display: flex; flex-direction: column; gap: 0.6rem; padding: 0.2rem 0 0.6rem; }

/* Kassensturz H2: ein echter Sperrgrund steht als Zeile da, nicht nur im Tooltip. */
.tb-sperre {
  display: flex; align-items: flex-start; gap: 0.35rem;
  margin: 0; padding: 0.35rem 0.5rem;
  border-radius: var(--cde-radius-sm);
  background: color-mix(in srgb, var(--cde-warn) 12%, transparent);
  color: var(--cde-warn-soft);
  font-size: var(--cde-font-sm);
}
/* Die Merkmale — vorher eine eigene Tafel. */
.tb-merkmale { border-top: 1px solid var(--cde-line); padding-top: 0.35rem; }
.tb-merkmale > summary {
  cursor: pointer; padding: 0.2rem 0;
  font-size: var(--cde-font-sm); font-weight: 600; color: var(--cde-text-bright);
}


/* Ausserhalb des Modus bleiben die Bearbeitungen sichtbar — die Herleitung ist
   auch beim reinen Ansehen die interessanteste Auskunft. Sie sehen aber
   gesperrt aus, statt beim Klick eine Absage zu erzeugen. */
.tb-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* Die Achszahlen stehen dicht am Kopf — sie beschreiben das Bauteil, nicht
   eine Bearbeitung. */
/* Die Mehrfach-Auskunft steht dicht am Kopf und ist ruhig — sie warnt nicht,
   sie sagt Bescheid. */
.tb-mehrfach {
  display: flex; gap: 0.35rem; align-items: flex-start; margin: 0;
  padding: 0.3rem 0.45rem; border-radius: var(--cde-radius-sm);
  background: var(--cde-accent-fill); font-size: var(--cde-font-xs); line-height: 1.35;
}

.tb-achse { margin: 0.1rem 0 0.2rem; }
.tb-achse b { font-weight: 600; }

/* Befunde: sichtbar, aber nicht laut. Sie beraten — wer ein Gefälle unter
   Mindestmass braucht, soll es setzen können, ohne angeschrien zu werden. */
.tb-befunde { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.25rem; }
.tb-befunde li {
  display: flex; gap: 0.35rem; align-items: flex-start;
  padding: 0.3rem 0.4rem; border-radius: var(--cde-radius-sm);
  font-size: var(--cde-font-xs); line-height: 1.35;
  border-left: 2px solid var(--cde-line-strong);
  background: var(--cde-fill);
}
.tb-befunde em { display: block; font-style: normal; }
.tb-b--warnung { border-left-color: var(--cde-amber); }
.tb-b--hinweis { border-left-color: var(--cde-line-strong); }
.tb-kur {
  display: inline-flex; align-items: center; gap: 0.2rem; margin-top: 0.25rem;
  padding: 0.15rem 0.4rem; cursor: pointer;
  border: 1px solid var(--cde-line-strong); border-radius: var(--cde-radius-sm);
  background: var(--cde-fill); color: var(--cde-text); font: inherit;
  font-size: var(--cde-font-xs);
}
.tb-kur:hover:not(:disabled) { background: var(--cde-fill-hover); }
.tb-kur:disabled { opacity: 0.5; cursor: not-allowed; }
.tb-bestaetigen { margin-top: 0.25rem; }

.tb-titel { display: flex; flex-direction: column; gap: 0.1rem; }
.tb-titel code { font-size: var(--cde-font-xs); color: var(--cde-text-dim); }

.tb-leer, .tb-fuss { margin: 0; font-size: var(--cde-font-xs); color: var(--cde-text-dim); }

/* ── Herleitung ────────────────────────────────────────────────────────── */
.tb-herleitung {
  border: 1px solid var(--cde-line);
  border-radius: var(--cde-radius-sm);
  padding: 0.35rem 0.45rem;
  background: var(--cde-fill);
}
.tb-herleitung > summary {
  cursor: pointer; font-size: var(--cde-font-xs);
  color: var(--cde-text-dim); user-select: none;
}
.tb-kette {
  display: grid; grid-template-columns: auto 1fr; gap: 0.15rem 0.5rem;
  margin: 0.4rem 0 0; font-size: var(--cde-font-xs);
}
.tb-kette dt { color: var(--cde-text-dim); }
.tb-kette dd { margin: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.3rem; }
.tb-dim { color: var(--cde-text-dim); }
.tb-erbt {
  padding: 0 0.25rem; border-radius: var(--cde-radius-sm);
  background: var(--cde-accent-fill-hi); color: var(--cde-accent);
}
.tb-guete { font-weight: 600; }
.tb-guete--gemessen   { color: var(--cde-success-strong); }
.tb-guete--geschaetzt { color: var(--cde-warn); }
.tb-guete--unbekannt  { color: var(--cde-danger); }

.tb-hierarchie { flex-wrap: wrap; gap: 0.15rem; }
.tb-hierarchie > span {
  font-size: 0.68rem; color: var(--cde-text-dim);
  padding: 0 0.2rem; border-radius: var(--cde-radius-sm);
}
.tb-hierarchie > span:not(:last-child)::after { content: ' →'; }
.tb-hierarchie > span.treffer {
  background: var(--cde-accent-fill-hi); color: var(--cde-accent); font-weight: 600;
}

.tb-luecke, .tb-warnung {
  margin: 0.4rem 0 0; font-size: var(--cde-font-xs);
  display: flex; gap: 0.3rem; align-items: flex-start;
}
.tb-luecke  { color: var(--cde-text-dim); }
.tb-warnung { color: var(--cde-warn); }

.tb-rueckmeldung {
  margin: 0; padding: 0.3rem 0.4rem;
  font-size: var(--cde-font-xs); color: var(--cde-accent);
  background: var(--cde-accent-fill); border-radius: var(--cde-radius-sm);
}

/* ── Gruppen ───────────────────────────────────────────────────────────── */
.tb-gruppe { display: flex; flex-direction: column; gap: 0.2rem; }
.tb-kopf {
  margin: 0; font-size: var(--cde-font-xs); text-transform: uppercase;
  letter-spacing: 0.06em; color: var(--cde-text-dim);
}
.tb-warum { margin: 0; font-size: 0.68rem; color: var(--cde-text-dim); }
.tb-katalog {
  margin: 0; padding-left: 1rem; font-size: 0.68rem; color: var(--cde-warn-soft);
  display: flex; flex-direction: column; gap: 0.2rem;
}
.tb-katalog-ebene { color: var(--cde-text-dim); }
.tb-entwurf { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem; }
.tb-entwurf-feld { font-size: 0.68rem; color: var(--cde-text); }
.tb-vorlage { display: flex; align-items: center; gap: 0.2rem; }
.tb-suche {
  width: 100%; box-sizing: border-box; margin: 0.2rem 0; padding: 0.3rem 0.45rem;
  background: var(--cde-fill); color: var(--cde-text);
  border: 1px solid var(--cde-line); border-radius: var(--cde-radius-sm); font: inherit; font-size: 0.75rem;
}
.tb-unterkopf { margin: 0.35rem 0 0; font-size: 0.66rem; font-weight: 600; color: var(--cde-text-dim); }
.tb-reiter { display: flex; flex-wrap: wrap; gap: 0.2rem; margin-top: 0.45rem; }
.tb-reiter-btn {
  padding: 0.2rem 0.45rem; font: inherit; font-size: 0.68rem; cursor: pointer; touch-action: manipulation;
  background: none; color: var(--cde-text-dim); border: 1px solid var(--cde-line); border-radius: 999px;
}
.tb-reiter-btn:hover { color: var(--cde-text); }
/* DIE FACETTEN (Teil XXIX, G4): Gewerk, Ausführung, Bauwerk-Pfad, Vorlage — Chips unter dem Titel. */
.tb-facetten { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem; margin: 0.2rem 0 0.3rem; }
.tb-chip {
  padding: 0.1rem 0.4rem; font: inherit; font-size: var(--cde-font-xs); color: var(--cde-text-dim);
  background: var(--cde-fill); border: 1px solid var(--cde-line); border-radius: 999px;
}
.tb-chip--link { cursor: pointer; color: var(--cde-accent); border-color: var(--cde-accent-line); touch-action: manipulation; }
.tb-chip--link:hover { background: var(--cde-accent-fill); }
.tb-chip--link:disabled { cursor: default; color: var(--cde-text-dim); border-color: var(--cde-line); }
.tb-chip--vorlage { border-style: dashed; }
.tb-pfad { display: inline-flex; align-items: center; gap: 0.15rem; }
.tb-pfad-trenner { color: var(--cde-text-dim); font-size: var(--cde-font-xs); }
.tb-rollen { width: 100%; border-collapse: collapse; font-size: var(--cde-font-xs); margin-bottom: 0.3rem; }
.tb-rollen td { padding: 0.15rem 0.2rem; border-bottom: 1px solid var(--cde-line); vertical-align: middle; }
.tb-rolle { color: var(--cde-text-dim); }
.tb-leise { color: var(--cde-text-dim); font-style: italic; }
.tb-status { white-space: nowrap; }
.tb-status--gesteuert { color: var(--cde-success-strong); }
.tb-status--abweichend { color: var(--cde-warn); }
.tb-status--fehlt { color: var(--cde-danger); }
.tb-btn--klein { padding: 0.1rem 0.4rem; font-size: var(--cde-font-xs); }
.tb-reiter-btn--an { background: var(--cde-fill); color: var(--cde-text); border-color: var(--cde-text-dim); }
.tb-vorlage > .tb-btn { flex: 1; min-width: 0; }
.tb-vorlage-weg {
  background: none; border: none; border-radius: var(--cde-radius-sm);
  padding: 0.3rem; color: var(--cde-text-dim); cursor: pointer;
  touch-action: manipulation;
}
.tb-vorlage-weg:hover { color: var(--cde-danger); background: var(--cde-fill); }
/* Die scharfe Bearbeitung — ohne Formular (das steht in der Leiste). */
.tb-scharf { display: flex; flex-direction: column; gap: 0.35rem; padding: 0.4rem 0; }
.tb-scharf-titel { margin: 0; display: flex; align-items: center; gap: 0.35rem; font-weight: 600; color: var(--cde-text); }
.tb-scharf-subjekt { color: var(--cde-text-dim); font-weight: 400; }
.tb-btn--aus { align-self: flex-start; }
.tb-liste { display: flex; flex-direction: column; gap: 0.15rem; margin-top: 0.15rem; }
.tb-btn {
  display: flex; align-items: center; gap: 0.35rem;
  padding: 0.28rem 0.4rem; text-align: left;
  background: var(--cde-fill); color: var(--cde-text);
  border: 1px solid var(--cde-line); border-radius: var(--cde-radius-sm);
  cursor: pointer; font-size: var(--cde-font-xs);
}
.tb-btn:hover { border-color: var(--cde-accent-line); color: var(--cde-accent); }
.tb-btn--aus { opacity: 0.6; cursor: default; }
/* Zweitrangig neben den Werkzeugen: „Eigenschaften" ist kein Werkzeug (K4). */
.tb-btn--leise { align-self: flex-start; margin-top: 0.3rem; opacity: 0.8; }
/* „im Bild ziehbar" — leise, aber da (K5). */
.tb-ziehbar { margin-left: auto; opacity: 0.55; }
.tb-gelaende-wahl { display: flex; align-items: center; gap: 0.4rem; margin: 0.2rem 0 0.35rem; font-size: 0.78rem; color: var(--cde-text-dim); }
.tb-gelaende-wahl select { flex: 1; min-width: 0; }
.tb-btn--aus:hover { border-color: var(--cde-line); color: var(--cde-text); }
.tb-feld { margin-left: auto; font-style: normal; color: var(--cde-text-dim); font-size: 0.68rem; }
.tb-nurfest { color: var(--cde-text-dim); }

.tb-gesperrt > summary {
  cursor: pointer; font-size: var(--cde-font-xs); color: var(--cde-text-dim); user-select: none;
}
.tb-nein {
  display: flex; flex-direction: column;
  padding: 0.25rem 0.4rem; font-size: var(--cde-font-xs); color: var(--cde-text-dim);
}
.tb-nein > em { font-style: normal; font-size: 0.68rem; opacity: 0.8; }

/* T1 (Tablet-Pass): Fingerziele — Listenzeilen wachsen WIRKLICH (die Spalte
   scrollt ohnehin). Unsichtbare Trefferflächen wären hier falsch: in einer
   dichten Liste überlappten sie, und der untere Knopf gewönne jeden Streit. */
.tb-btn, .tb-kur, .tb-modus { touch-action: manipulation; }
@media (pointer: coarse) {
  .tb-btn { padding: 0.6rem 0.5rem; }
  .tb-kur { padding: 0.45rem 0.6rem; }
}
</style>
