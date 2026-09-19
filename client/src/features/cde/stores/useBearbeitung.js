/**
 * Bearbeitungs-Zustand (Stufe 9.0).
 *
 * Hausregel: **Composable = Verhalten, Store = Zustand.** Hier liegt deshalb
 * nur, WAS gerade bearbeitet wird — die Einordnung des Bauteils, die scharfe
 * Bearbeitung und die Formularwerte. Wer den Resolver oder die Engine braucht,
 * reicht sie herein; der Store holt sich nichts selbst. Dadurch bleibt er ohne
 * WebGL prüfbar und übersteht einen Modellwechsel, ohne Geometrie zu halten.
 *
 * Der Ausgang ist bewusst schmal: `ausfuehren()` schreibt NICHT selbst, sondern
 * legt einen Journaleintrag über `useAenderungen` an. Alles, was hier
 * hinzukommt, erbt damit Rücknahme und Nachvollziehbarkeit aus Stufe 7 — es
 * gibt keinen zweiten Weg, ein Bauteil zu ändern.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

import { bestimme } from '../services/bauform/Bauformen.js';
import {
    MITGELIEFERTE_REGELN, REPO_KEY as REGEL_KEY, bauformAusRegel,
    alleVorschlaege, regelAus,
} from '../services/bauform/Bauformregeln.js';
import { repo } from '../services/RepoFacade.js';
import { EINGEBAUTE_PROFILE, REPO_KEY as TYP_KEY, profilFuer } from '../services/bauform/Typprofile.js';
import { entwurfFuer, profilAusEntwurf } from '../services/bauform/Typprofilentwurf.js';
import { BEARBEITUNGEN, GRUPPEN, felderFuer, nachId, passende, pruefe, werkzeugRollen } from '../services/Bearbeitungen.js';
import { ladeKatalog } from '../services/katalog/Katalog.js';
import { eingebauteRollen, pruefeEintrag } from '../services/katalog/Katalogschema.js';
import { useAenderungen } from './useAenderungen.js';
import { modellVon, operationenMitKennung, rezeptNach, vorgangEntfernenSchritte, zufallsKennung } from '../services/Bauteilrezepte.js';
import { pruefeBezuege } from '../services/ableitung/Bezuege.js';
import { befundeFuer, befundeFuerWerte } from '../services/Befunde.js';
import { istErzeugen, kommandoAusZustand, mitHoehenversatz, pruefeKommando, rahmenOhneBezug } from '../services/kommando/Kommando.js';
import { werteAus } from '../services/kommando/Auswertung.js';
import { systemBeleg } from '../services/kommando/Beleg.js';
import { standVon, subjektAusStand } from '../services/kommando/Subjekt.js';
import { pruefeStandAusJournal } from '../services/Prueflauf.js';
import { cdeAchsenAus, verdeckteAus } from '../services/CdeAchsen.js';

/** Der leere Eingabe-Zustand — je Aufruf ein frisches Objekt, nie geteilt. */
function _eingabeLeer() {
    // `auto`: welche Formularwerte der Zug vorbelegt hat (nachZug) — geteilt,
    // damit Plan und Raum dieselben Werte als „unberührt" ansehen.
    return { phase: 'aus', punkte: [], zeiger: null, geste: null, zugGeschlossen: false, auto: {} };
}

export const useBearbeitung = defineStore('cde-bearbeitung', () => {
    /** Einordnung der aktuellen Auswahl: {bauform, guete, quelle, warnungen} */
    const einordnung = ref(null);
    /** Das eingeordnete Bauteil selbst — Kennung, Kategorie, Stand. */
    const bauteil = ref(null);
    /**
     * WEITERE Bauteile derselben Auswahl (Stufe 14.10).
     *
     * Der Rahmen im Viewer wählt seit jeher mehrere aus und hebt sie hervor —
     * die Bearbeitung erfuhr davon nur nichts. `bauteil` bleibt das erste und
     * bestimmt die Einordnung; hier stehen alle, auf die eine als `mehrfach`
     * gekennzeichnete Bearbeitung zusätzlich angewandt wird.
     *
     * Eine LISTE und kein Ersatz für `bauteil`: die Einordnung, die
     * Vorbelegung und die ganze Herleitung hängen an einem Bauteil, und daran
     * soll sich nichts ändern, nur weil man fünf angeklickt hat.
     */
    const bauteile = ref([]);
    /** Wirksamer Typprofil-Satz (Projekt schlägt Büro schlägt eingebaut). */
    const profilSatz = ref({ ...EINGEBAUTE_PROFILE });
    /**
     * Bauformregeln — sie sagen, was die NAMEN eines Exporteurs bedeuten.
     *
     * Nötig, weil manche Software alles als `IFCBUILDINGELEMENTPROXY` ausgibt:
     * dann sagt der Typ nichts, der Name aber sehr wohl („Haltung", „Schacht").
     *
     * VORBELEGT mit den mitgelieferten Regeln — derselbe Rückfall, den auch
     * `ladeRegeln` ohne Repo nimmt. Eine leere Startliste war harmlos, solange
     * die Regeln nur beim Klick auf ein Bauteil zählten; seit sie
     * mitentscheiden, WAS Gelände ist, wäre sie ein Rennen: ein Modell, das
     * vor dem Laden der Bürodaten fertig ist, verlöre sein IfcGeographicElement
     * mit PredefinedType TERRAIN — und niemand sähe einen Fehler, nur fehlendes
     * Gelände.
     */
    const regeln = ref([...MITGELIEFERTE_REGELN]);
    /** Was beim Katalogladen abgewiesen wurde: `{art, id, ebene, fehler[]}` (A5). */
    const katalogBefunde = ref([]);
    /** Der Stand des Rezept-Registers — wandert mit jeder Registrierung (A5). */
    const katalogStand = ref(0);
    /** Id der scharfen Bearbeitung, oder null. */
    const scharfId = ref(null);
    /** Formularwerte der scharfen Bearbeitung. */
    const werte = ref({});
    /** Läuft gerade eine Einordnung? (Geometrie-Ableitung kann dauern.) */
    const laeuft = ref(false);

    /**
     * DER EINGABE-ZUSTAND (Teil XVI, S1) — was der Nutzer gerade sammelt.
     *
     * Wohnt im Store und nicht im Composable, weil ZWEI Flächen ihn lesen:
     * der Lageplan zeichnet den Zug, der Raum zeigt ihn als Vorschau (S2)
     * und setzt ab S3 selbst Punkte. Ein Zustand je Fläche wären zwei
     * Züge — zwei Punkte im Plan, einer im Raum — und genau die Klasse
     * „gespiegelter Zustand läuft auseinander", die das Haus schon zweimal
     * getroffen hat.
     *
     *   phase           'aus' | 'sammeln' | 'pruefen'
     *   punkte          [{x, y?, z, ausserhalb?}] in Welt — der Zug/Umriss
     *   zeiger          {x, z} | null — nur fürs Gummiband, nie im Journal
     *   geste           {feld, art, auf, kandidaten} | null — welches Feld
     *                   gerade per Geste gefüllt wird (S3)
     *   zugGeschlossen  ob der Zug schon abgeschlossen ist (PRÜFEN)
     *   auto            {feld: wert} — vom Zug vorbelegte Werte (nachZug)
     */
    const eingabe = ref(_eingabeLeer());

    /**
     * DER BEARBEITEN-MODUS. Aus heisst: nichts ändert das Modell. Punkt.
     *
     * Bisher war Bearbeiten überall gleichzeitig möglich — ein Knopf in der
     * Werkzeugleiste, die Taste G, das Kontextmenü am Bauteil, die Toolbox,
     * die Befehlspalette, die Zeichenwerkzeuge im Lageplan. Sieben Einstiege
     * ohne gemeinsamen Schalter. Wer das Modell nur ansehen wollte, konnte
     * mit einem verrutschten Zug eine Festlegung erzeugen, ohne es zu merken.
     *
     * Der Modus ist deshalb kein Sichtbarkeits-Kniff, sondern eine SPERRE an
     * den zwei Engstellen `starte` und `ausfuehren` — plus dem Ziehen, das
     * als einziges daran vorbeiging (das inzwischen entfernte Ziehen). Ob eine Oberfläche
     * ihre Knöpfe zusätzlich ausblendet, ist Darstellung; ob etwas passiert,
     * entscheidet sich hier.
     *
     * NICHT GEMERKT ÜBER DAS NEULADEN. Eine Sperre, die ein Neuladen
     * überdauert, ist keine: der sichere Zustand muss der sein, in den man
     * ohne Zutun gerät. Einschalten kostet einen Klick.
     */
    const modusAn = ref(false);

    const typprofil = computed(() => profilFuer(bauteil.value?.category ?? bauteil.value?.type, profilSatz.value));
    const scharf = computed(() => (scharfId.value ? nachId(scharfId.value) : null));

    /**
     * Was am gewählten Bauteil auffällt.
     *
     * ABGELEITET, nie gespeichert — dieselbe Regel wie beim Konflikt. Und sie
     * halten nichts auf: `bereit` fragt sie nicht, `ausfuehren` prüft sie
     * nicht. Sie beraten (Fabios Entscheidung).
     */
    // Das Regelwerk kommt mit dem Katalog (AR) — ein Nachladen rechnet die Befunde neu.
    const befunde = computed(() => (void katalogStand.value, befundeFuer({
        globalId: bauteil.value?.globalId,
        kategorie: bauteil.value?.category ?? bauteil.value?.type,
        beschreibung: bauteil.value?.description ?? null,
        achse: bauteil.value?.achse ?? null,
        umgekehrt: bauteil.value?.stand?.fliessrichtung === 'umgekehrt',
        typprofil: typprofil.value,
    })));
    const felder = computed(() => (scharf.value ? felderFuer(scharf.value, typprofil.value, bauteil.value) : []));
    const fehler = computed(() => (scharf.value ? pruefe(felder.value, werte.value) : []));
    const bereit = computed(() => !!scharf.value && fehler.value.length === 0);
    // FACHGRENZEN (K10, Fabios E5): was über der üblichen Grenze liegt, sperrt
    // nicht mehr — es wird gesagt, ausgeführt und am Eintrag markiert.
    const grenzhinweise = computed(() => (scharf.value ? befundeFuerWerte(felder.value, werte.value) : []));

    /**
     * Was an diesem Bauteil möglich ist — die EINE Antwort, aus der alle lesen.
     *
     * DAS TYPPROFIL MUSS MIT. Ohne es fällt jede Bearbeitung heraus, die über
     * `brauchtRolle` an einer typeigenen Größe hängt — also genau die, die das
     * Typprofil überhaupt erst nützlich machen. Der Fehler war schlimmer als
     * ein Fehlen: die Toolbox rechnet über `herleite` MIT Profil und zeigte
     * „Bezugshöhe setzen" an, während `starte()` hier OHNE Profil prüfte und
     * denselben Knopf ablehnte. Ein Knopf, der da ist und nichts tut.
     *
     * Wieder zwei Wege zu derselben Frage. Deshalb steht sie jetzt einmal hier,
     * und `starte` fragt dieselbe Liste — nicht eine zweite mit denselben
     * Argumenten, die beim nächsten Argument wieder auseinanderläuft.
     */
    /**
     * WAS DAS BAUTEIL HAT — die Fragen, die `passende` stellt, EINMAL
     * zusammengestellt (Teil XXIII, AE): das Typprofil der Familie, ob es
     * eigen ist, das Rezept eines eigenen Bauteils, die Bauformregel eines
     * Proxys. Store UND Toolbox (`herleite`) nehmen diesen Kontext — zwei
     * Wege mit je eigenen Argumenten liefen schon einmal auseinander.
     */
    const regelTreffer = computed(() => (bauteil.value
        ? (bauformAusRegel(regeln.value, _regelKontext(bauteil.value))?.regel ?? null) : null));
    const passendeKontext = computed(() => ({
        typprofil: typprofil.value,
        // `eigenes`: ein Bauplan im Stand heisst „von hier" — nur dort gibt es
        // Werkzeuge wie „Stützpunkt verschieben" (Teil XVI, S4).
        eigenes: !!bauteil.value?.stand?.bauplan,
        rezept: rezeptNach(bauteil.value?.stand?.bauplan?.rezept),
        regel: regelTreffer.value,
    }));
    const moeglich = computed(() => (einordnung.value ? passende(einordnung.value, passendeKontext.value) : []));

    /** Profilsatz und Bauformregeln laden. Einmal je Projekt, nicht je Auswahl. */
    /**
     * DER KATALOG, GEPRÜFT (Teil XXIII, A5): Typprofile, Bauformregeln und die
     * Rezepte der Bibliothek in einem Zug. Was die Prüfung nicht besteht,
     * steht in `katalogBefunde` und ist nicht aktiv. `katalogStand` wandert
     * mit jeder Registrierung — wer eine Werkzeugliste zeigt, liest ihn mit.
     */
    /**
     * Einen Typprofil-ENTWURF bestätigen (A5, S6) — erst damit wirkt er.
     *
     * Gespeichert wird auf der Ebene, auf der die Typprofile heute gelten: hat
     * das Projekt eigene, dort (sie verdecken die des Büros ganz —
     * `mitVorrang`), sonst im Büro. Vorher geprüft wie beim Laden; danach
     * neu geladen, damit Werkzeuge und Toolbox es sofort sehen.
     */
    async function entwurfUebernehmen(kategorie, ziel = repo) {
        const e = entwurfFuer(kategorie, profilSatz.value);
        if (!e) return { ok: false, grund: 'Kein Entwurf für diese Klasse.' };
        const profil = profilAusEntwurf(e, profilSatz.value);
        const rollen = new Set([...eingebauteRollen(), ...werkzeugRollen(BEARBEITUNGEN)]);
        const p = pruefeEintrag('typprofil', { kategorie: e.kategorie, ...profil }, { rollen });
        if (!p.ok) return { ok: false, grund: p.fehler.join(' ') };
        const imProjekt = !!(await ziel.get?.(TYP_KEY));
        const ebene = imProjekt ? ziel : ziel.buero;
        if (!ebene) return { ok: false, grund: 'Die Büroablage ist hier nicht verbunden.' };
        const bisher = (await ebene.get(TYP_KEY)) ?? {};
        const geschrieben = await ebene.set(TYP_KEY, JSON.parse(JSON.stringify({ ...bisher, [e.kategorie]: profil })));
        if (geschrieben === false) return { ok: false, grund: 'Sichern fehlgeschlagen.' };
        await ladeProfile(ziel);
        return { ok: true, grund: null, ebene: imProjekt ? 'projekt' : 'buero' };
    }

    async function ladeProfile(quelle = repo) {
        const rollen = new Set([...eingebauteRollen(), ...werkzeugRollen(BEARBEITUNGEN)]);
        const k = await ladeKatalog(quelle, { rollen });
        profilSatz.value = k.profilSatz;
        regeln.value = k.regeln;
        katalogBefunde.value = k.befunde;
        katalogStand.value = k.stand;
    }

    // ── Zuordnen: was bedeuten die Namen dieses Exporteurs? ────────────────

    /**
     * Die Namen, die im geladenen Modell vorkommen — je Kategorie gezählt.
     *
     * Damit zeigt die Oberfläche „18 Proxies heissen hier ‚Haltung'", statt den
     * Nutzer raten zu lassen, wonach er suchen soll. Quelle ist der Suchindex,
     * der beim Laden ohnehin gebaut wird — kein zweiter Lauf über das Modell.
     */
    function vorschlaege(suchindex, feld = 'Name') {
        const roh = (suchindex ?? []).map(e => ({
            category: e.category,
            attributes: {
                Name: e.name ?? '',
                PredefinedType: e.predefinedType ?? '',
                ObjectType: e.objectType ?? '',
                Description: e.description ?? '',
            },
            // Der ORT des Elements — das Panel misst je Gruppe an einem
            // Beispiel die Formsignatur (2026-09-07).
            ort: (e.modelId && e.localId != null) ? { modelId: e.modelId, localId: e.localId } : null,
        }));
        return alleVorschlaege(roh, { feld }).map(v => ({
            ...v,
            bauform: bauformAusRegel(regeln.value, {
                category: v.category, attributes: { [feld]: v.name }, psets: {},
            })?.bauform ?? null,
        }));
    }

    /**
     * Einer Namensgruppe eine Bauform zuordnen.
     *
     * Schreibt eine REGEL, keine Einzelzuweisung: derselbe Exporteur nennt die
     * Dinge in jeder Datei gleich, und eine Regel gilt damit auch für die
     * nächste Lieferung. `bauform: null` nimmt die Zuordnung zurück.
     *
     * `art` MUSS DURCHGEREICHT WERDEN. Bis 2026-09-03 fehlte es hier: die
     * Oberfläche bot eine Gruppenzeile an („Haltung…", 18 Bauteile), gab
     * `art: 'gruppe'` mit, und `regelAus` fiel auf seinen Standardwert
     * `'genau'` zurück. Geschrieben wurde dann `equals 'Haltung'` — was auf
     * „Haltung 1" … „Haltung 18" NIE passt. Die Abdeckung blieb bei null, es
     * gab keinen Fehler, und kein Test kreuzte den Weg: `regelAus` wurde mit
     * `art: 'gruppe'` geprüft, `ordneZu` nur ohne.
     */
    async function ordneZu({ category, name, bauform, art = 'genau',
                            propertyName = 'Name', psetName = null }, ziel = repo) {
        // Der Schlüssel muss das FELD mitführen: dieselbe Kategorie kann eine
        // Regel auf `Name` und eine auf `PredefinedType` tragen, und die eine
        // darf die andere nicht wegräumen.
        const ohneAlte = regeln.value.filter(r => {
            if (!r.bauform || r.condition?.category !== category) return true;
            // Eine Kategorie-Regel hat kein Merkmal — sie wird nur von einer
            // Kategorie-Zuordnung ersetzt, nie von einer benannten.
            if (art === 'kategorie') return !!(r.condition?.propertyName || r.condition?.psetName);
            if (!r.condition?.propertyName && !r.condition?.psetName) return true;
            return !(r.condition?.value === name
                     && (r.condition?.propertyName ?? 'Name') === (propertyName || 'Name')
                     && (r.condition?.psetName ?? null) === psetName);
        });
        const neu = bauform
            ? [...ohneAlte, regelAus({ category, name, bauform, art, propertyName, psetName })]
            : ohneAlte;
        regeln.value = neu;
        try {
            await ziel.set(REGEL_KEY, JSON.parse(JSON.stringify(neu)));
        } catch (fehler) {
            console.warn('cde: bauformregel sichern', fehler?.message ?? fehler);
        }
        return neu;
    }

    /**
     * Der Elementzusammenhang, wie ihn die Regel-Maschine erwartet.
     *
     * `parseItemData` liefert `type` (die Kategorie) und `name` flach; die
     * Regeln sprechen von `category` und `attributes.Name` — die Übersetzung
     * gehört genau hierher und nicht in die Regel-Maschine, die keine
     * IFC-Abhängigkeit haben soll.
     */
    function _regelKontext(el) {
        if (!el) return null;
        return {
            category: (el.category ?? el.type ?? '').toUpperCase(),
            attributes: { Name: el.name ?? '', Description: el.description ?? '',
                          PredefinedType: el.predefinedType ?? '', ...(el.attrs ?? {}) },
            psets: el.psets ?? {},
        };
    }

    /**
     * Ein Bauteil einordnen.
     *
     * Der Resolver wird HEREINGEREICHT, nicht gehalten: er cached je Modell,
     * und ein über den Modellwechsel hinweg behaltener Resolver liefert
     * Geometrie des alten Modells.
     */
    async function einordne(el, resolver, { weitere = [] } = {}) {
        abbrechen();
        // Dasselbe Bauteil neu eingeordnet (nach jedem Eckenzug) behält „Ecken
        // ziehen"; ein anderes oder keins beendet es.
        if (eckenFuer.value && eckenFuer.value !== el?.globalId) eckenFuer.value = null;
        bauteil.value = el ? { ...el, stand: _standVon(el.globalId) } : null;
        bauteile.value = el
            ? [bauteil.value, ...weitere.map(w => ({ ...w, stand: _standVon(w.globalId) }))]
            : [];
        if (!el) { einordnung.value = null; return null; }

        laeuft.value = true;
        try {
            einordnung.value = await bestimme(el, {
                resolver,
                typprofil: profilFuer(el.category ?? el.type, profilSatz.value),
                ausRegel: bauformAusRegel(regeln.value, _regelKontext(el)),
                // Stufe 15: ein selbst gebautes Bauteil kennt seine Bauform
                // aus dem Rezept — sonst verlöre ein geformtes Gelände nach
                // der ersten Formung seine Werkzeuge.
                ausBauplan: bauteil.value?.stand?.bauplan?.bauform ?? null,
                // Die Auslegung für GENAU dieses Bauteil — sie schlägt die
                // Regel, aber nicht den Bauplan.
                ausEinzelfall: bauteil.value?.stand?.bauformAusnahme ?? null,
            });
        } finally {
            laeuft.value = false;
        }
        return einordnung.value;
    }

    /**
     * Was für dieses Bauteil GERADE gilt — aus dem Journal, nicht aus der Datei.
     * Die Faltung lebt seit Teil XXIV (K3) in `kommando/Subjekt.standVon`: der
     * Kommandoweg ohne Oberfläche braucht dieselbe, und zwei Fassungen liefen
     * auseinander.
     */
    function _standVon(globalId) {
        return standVon(globalId, useAenderungen().wirksamerStand);
    }

    /**
     * Den Modus setzen. Ausschalten entwaffnet, was gerade scharf ist —
     * ein offenes Formular nach dem Ausschalten wäre ein Knopf, der nichts
     * tut, und davon hatte dieses Feature schon genug.
     */
    /**
     * Eine Bearbeitung scharf schalten UND gleich vorbelegen — die Kur.
     *
     * Wo ein Befund seine Antwort kennt („läuft bergauf" ⇒ umkehren), soll ein
     * Klick genügen. Die Werte kommen NACH `starte`, weil das die Vorbelegung
     * setzt; sonst überschriebe sie den Vorschlag sofort wieder.
     */
    function starteMitVorschlag(id, vorschlag = {}) {
        if (!starte(id)) return false;
        for (const [name, wert] of Object.entries(vorschlag)) setzeWert(name, wert);
        return true;
    }

    /**
     * Ein Werkzeug wählen heißt bearbeiten (Kassensturz E4).
     *
     * Ist der Modus aus, schaltet `einschalten` ihn ein — das ist der Viewer:
     * er prüft die echten Sperren (kein Modell, Millimeter, ein Published-
     * Stand) und beginnt die Bearbeitung. Lehnt er ab, startet nichts, und
     * der Viewer sagt warum. Vorher war jeder Werkzeugknopf ohne Modus grau:
     * „Bearbeiten ist aus — oben einschalten (oder E)".
     */
    function starteMitModus(id, { einschalten = null, vorschlag = null, subjekt = null } = {}) {
        if (!modusAn.value && !einschalten?.()) {
            letzterGrund.value = 'Bearbeiten lässt sich gerade nicht einschalten.';
            return false;
        }
        if (vorschlag) return starteMitVorschlag(id, vorschlag);
        return starte(id, subjekt ? { subjekt } : {});
    }

    function modusSetzen(an) {
        const neu = !!an;
        if (neu === modusAn.value) return neu;
        modusAn.value = neu;
        if (!neu) { abbrechen(); eckenFuer.value = null; }
        return neu;
    }

    /**
     * „ECKEN ZIEHEN" (Teil XXII, Fabio 2026-09-18: „das Ziehen von Ecken
     * sollte nur in der Bearbeitung — auch nur als Knopf — gehen, und dann an
     * allen Ecken eines Körpers").
     *
     * Bis hierher standen die Eckgriffe eines Erdkörpers da, sobald er im
     * Modus E gewählt war — ein Klick mit einem Zucken zog eine Ecke. Jetzt
     * zeigt sie nur dieser Zustand, und nur für DIESES Bauteil. Er ist kein
     * scharfes Werkzeug: jeder Zug läuft wie bisher über „Knickpunkt
     * verschieben" (starten, ausführen, abbrechen), und der Modus überlebt
     * das — bis Fertig, Esc, eine andere Auswahl oder Bearbeiten aus.
     */
    const eckenFuer = ref(null);
    function eckenStarten(globalId = bauteil.value?.globalId ?? null, { einschalten = null } = {}) {
        if (!globalId) return false;
        if (!modusAn.value && !einschalten?.()) {
            letzterGrund.value = 'Bearbeiten lässt sich gerade nicht einschalten.';
            return false;
        }
        if (scharfId.value) abbrechen();
        eckenFuer.value = globalId;
        return true;
    }
    function eckenBeenden() { eckenFuer.value = null; }
    function modusUm() { return modusSetzen(!modusAn.value); }

    /**
     * Eine Bearbeitung scharf schalten und ihr Formular vorbelegen.
     *
     * `subjekt` ist die Ausnahme fürs ERZEUGEN — genau wie bei `ausfuehren`:
     * dort gibt es kein angeklicktes Bauteil, und die Vorbelegung braucht
     * trotzdem einen Bezug (den Höhenversatz, damit die Zeichenhöhe in m NN
     * steht und nicht in Three-Welt-Y). Ohne ihn stünde im Feld 0, und wer
     * das übernimmt, zeichnet um den ganzen Ladeversatz zu tief.
     */
    /**
     * DER EINE WERKZEUG-SLOT (Teil XI, U1).
     *
     * Fabios Befund aus dem Gerätetest: „mehrere Stellen aktivieren
     * Bearbeitung, aber kein einziger Modus." Vorher hielten 3D
     * (Messen, Notiz, Schnitt), Lageplan (Stift, Setzen, Bemaßen,
     * Zeichnen — deren Exklusivität DOPPELT gepflegt, in CdeView UND im
     * Canvas) und die scharfe Bearbeitung je eigene Zustände; Messen und
     * Notiz konnten gleichzeitig an sein, weil ihr Ausschluss nur als
     * Kommentar existierte.
     *
     * Jetzt gilt: es gibt genau EIN aktives Werkzeug. Wer eines anschaltet,
     * BELEGT den Slot und hinterlegt seinen Ausschalter; das nächste
     * Werkzeug ruft ihn. Exklusivität ist damit eine Eigenschaft des Slots,
     * nicht eine Vereinbarung zwischen zwölf Settern (Gesetz 7).
     */
    /** Der Commit-Dialog (U2) — Viewer öffnet ihn, die CdeView zeigt ihn. */
    const commitDialogOffen = ref(false);

    const werkzeug = ref(null);
    let _werkzeugAus = null;

    function belegeWerkzeug(id, ausschalter = null) {
        if (!id) { gebeWerkzeugFrei(werkzeug.value); return; }
        if (werkzeug.value && werkzeug.value !== id) {
            const aus = _werkzeugAus;
            _werkzeugAus = null;
            aus?.();                       // der Vorgänger räumt sich selbst
        }
        werkzeug.value = id;
        _werkzeugAus = ausschalter;
    }

    /** Nur der Besitzer gibt frei — ein Fremder mit falscher Kennung nicht. */
    function gebeWerkzeugFrei(id) {
        if (id && werkzeug.value !== id) return;
        werkzeug.value = null;
        _werkzeugAus = null;
    }

    function starte(id, { subjekt = null } = {}) {
        if (!modusAn.value) {
            letzterGrund.value = 'Der Bearbeiten-Modus ist aus.';
            return false;
        }
        const b = nachId(id);
        if (!b) return false;
        // Eine Bearbeitung, die zu diesem Bauteil nicht passt, darf auch über
        // die Befehls-Palette nicht scharf werden — sonst umgeht der eine
        // Einstieg die Güteschranke der anderen.
        //
        // ERZEUGEN IST DAVON AUSGENOMMEN, weil es kein Subjekt hat: „Linie
        // zeichnen" bezieht sich nicht auf das gerade angeklickte Rohr. Ohne
        // diese Ausnahme wäre das Zeichenwerkzeug immer dann gesperrt, wenn
        // zufällig etwas ausgewählt ist — und niemand käme darauf, warum.
        // EIN EIGENES SUBJEKT EBENFALLS (G1): der Schacht-Griff im Lageplan
        // zieht ein Bauteil, das in 3D gar nicht ausgewählt ist. Die Prüfung
        // gegen `moeglich` fragt aber die AUSWAHL — sie würde den Griff genau
        // dann sperren, wenn zufällig ein Rohr angeklickt war. Wer ein Subjekt
        // hereinreicht, bürgt dafür; `ausfuehren` prüft ohnehin erneut.
        const werkzeug = GRUPPEN[b.gruppe]?.einstieg === 'werkzeug';
        if (!werkzeug && !subjekt && einordnung.value && !moeglich.value.some(p => p.id === id)) return false;
        scharfId.value = id;
        werte.value = { ...(b.vorbelegung?.(subjekt ?? bauteil.value ?? {}) ?? {}) };
        belegeWerkzeug(`bearbeitung:${id}`, () => abbrechen());
        return true;
    }

    function setzeWert(name, wert) {
        werte.value = { ...werte.value, [name]: wert };
    }

    /**
     * Ein Werkzeug aus einer VORLAGE vorbelegen (Teil XXIII, A1): ihre
     * Vorgaben als Werte — und ihre Id, damit das Bauteil weiss, woher es
     * stammt. Der Viewer ruft genau das beim „Aus Vorlage zeichnen"; der Test
     * auch — so prüft er die Naht, nicht eine nachgebaute Eingabe.
     */
    function vorbelegeAusVorlage(vorlage) {
        if (!vorlage?.id) return false;
        for (const [feld, wert] of Object.entries(vorlage.vorgaben ?? {})) {
            if (feld !== 'vorlage') setzeWert(feld, wert);
        }
        setzeWert('vorlage', vorlage.id);
        return true;
    }

    function abbrechen() {
        const war = scharfId.value;
        scharfId.value = null;
        werte.value = {};
        leereEingabe();
        if (war) gebeWerkzeugFrei(`bearbeitung:${war}`);
    }

    /** Einzelne Felder des Eingabe-Zustands setzen — immer als neues Objekt (Reaktivität). */
    function setzeEingabe(patch) {
        eingabe.value = { ...eingabe.value, ...(patch ?? {}) };
    }

    function leereEingabe() {
        eingabe.value = _eingabeLeer();
    }

    /**
     * ESC — der EINE Ausgang aus dem Slot.
     *
     * Ruft den Ausschalter, den der Besitzer beim Belegen hinterlegt hat
     * (Messen → beenden, Notiz → umschalten, Bearbeitung → abbrechen, Plan-
     * Werkzeuge → ihre Schalter). Vorher stand Esc an fünf Stellen mit je
     * eigener Rangfolge; jetzt fragt der Tastatur-Handler nur noch hier.
     *
     * @returns {boolean} ob ein Werkzeug offen war
     */
    function slotAus() {
        const id = werkzeug.value;
        if (!id) return false;
        const aus = _werkzeugAus;
        _werkzeugAus = null;
        aus?.();
        // Ein Ausschalter, der den Slot nicht freigibt, lässt ihn nicht hängen.
        if (werkzeug.value === id) gebeWerkzeugFrei(id);
        return true;
    }

    /**
     * Die scharfe Bearbeitung ausführen.
     *
     * @returns {Promise<object|null>} der Journaleintrag, oder null wenn nichts
     *   zu tun war (ungültig, oder derselbe Wert wie zuvor — `eintragen` sagt
     *   das selbst und schreibt dann keinen leeren Schritt).
     */
    /**
     * Warum das letzte `ausfuehren` nichts ergeben hat.
     *
     * `ausfuehren` gibt in DREI verschiedenen Fällen `null` zurück, und sie
     * bedeuten Verschiedenes: die Bearbeitung war nicht bereit, sie konnte
     * nichts beschreiben (dem Bauteil fehlt der Bezug — etwa die Hülle), oder
     * der Wert galt schon. Die Oberfläche hat daraus einen Satz gemacht und
     * damit einen Grund BEHAUPTET, den sie nicht kannte. Ein falscher Grund ist
     * schlimmer als keiner: er schickt den Nutzer in die falsche Richtung.
     */
    const letzterGrund = ref('');

    /**
     * @param {object} opts
     * @param {string} [opts.wer]
     * @param {string} [opts.modellSha]
     * @param {object} [opts.subjekt]  bei `erzeugen` das Gezeichnete
     * @param {object} [opts.basis]    der Wert im GELIEFERTEN Modell
     * @param {'geliefert'|'cde'} [opts.modell]  wo das Bauteil lebt
     *
     * `basis` und `modell` kommen von AUSSEN, wie `wer` und `modellSha`. Sie
     * fehlten bisher ganz, und beides hatte Folgen, die niemand sah:
     *
     *   - ohne `basis` ist der Drei-Wege-Vergleich abgeschaltet
     *     (`vergleicheMitModell` meldet `ohne_basis`) — jede Festlegung aus
     *     dem Formular ging bei einer neuen Revision still als „sauber"
     *     durch, und ausgerechnet die Schutzvorrichtung schwieg;
     *   - ohne `modell` fällt der Eintrag auf `'geliefert'`. Eine Bezugshöhe
     *     auf ein SELBST erzeugtes Bauteil ist damit dauerhaft unanwendbar:
     *     `IfcAutor.wendeAn` sucht es in `globalIdZuLocalId` statt unter dem
     *     Erzeugten und meldet `keine_localId`.
     *
     * Das fruehere Ziehen hat beides von Anfang an mitgegeben — es waren zwei Wege zu
     * derselben Sache, und einer davon war falsch.
     */
    async function ausfuehren({ wer = '', modellSha = null, subjekt = null,
                                basis = undefined, modell = undefined, zug = null } = {}) {
        letzterGrund.value = '';
        if (!modusAn.value) {
            // Zweite Sperre, nicht nur die erste: `starte` und `ausfuehren`
            // sind getrennte Wege, und der Modus kann zwischen beiden
            // ausgeschaltet werden.
            letzterGrund.value = 'Der Bearbeiten-Modus ist aus.';
            return null;
        }
        const b = scharf.value;
        // ERZEUGEN HAT KEIN SUBJEKT (Stufe 9.4): dort steht das GEZEICHNETE an
        // der Stelle des angeklickten Bauteils und wird hereingereicht. Keine
        // Ausnahme in der Mechanik — nur eine andere Herkunft des Subjekts;
        // Journal, Rücknahme und Nachvollziehbarkeit bleiben dieselben.
        const gegenstand = subjekt ?? bauteil.value;
        if (!b || !bereit.value || !gegenstand) {
            letzterGrund.value = 'Bearbeitung ist nicht bereit.';
            return null;
        }

        // MEHRFACH: dieselbe Bearbeitung auf jedes Bauteil der Auswahl.
        //
        // Nur wo der Katalog es ausdrücklich erlaubt. Die Vorgabe ist „eines",
        // weil es Bearbeitungen gibt, für die eine Massenanwendung Unsinn wäre:
        // fünf Schächte auf denselben Rechtswert zu schieben legt sie
        // übereinander, und fünf Haltungen dieselbe Sohlhöhe zu geben ebnet den
        // Strang ein. Ein stillschweigendes „gilt für alle" wäre der
        // gefährlichste Vorgabewert, den dieses Feature haben könnte.
        const gegenstaende = (b.mehrfach && !subjekt && bauteile.value.length > 1)
            ? bauteile.value
            : [gegenstand];

        // DAS KOMMANDO (Teil XXIV, K1). Was die Oberfläche hält — scharfes
        // Werkzeug, Formularwerte, Subjekte, gezeichnete Punkte —, wird EIN
        // Wert, und geschrieben wird nur, was die Auswertung dieses Werts
        // ergibt. Derselbe Weg, den ein Skript ohne Oberfläche nimmt
        // (`fuehreAus`); hier kommen nur die Bequemlichkeiten der Oberfläche
        // dazu: der Modus, die Formularprüfung von `bereit`, die Rückmeldung.
        const erzeugt = istErzeugen(b);
        const r = mitHoehenversatz(rahmen.value ?? rahmenOhneBezug(), gegenstand?.hoehenversatz);
        const { kommando, ziele, ohneKennung } = kommandoAusZustand({
            werkzeug: b, werte: werte.value, subjekte: gegenstaende, rahmen: r, wer,
            // Erzeugen: das Gezeichnete steht an der Stelle des Subjekts.
            punkte: erzeugt ? (gegenstand?.punkte ?? null) : zug,
        });
        // OHNE KENNUNG KEIN ZIEL. Ein solches Subjekt lief bisher durch
        // `anwenden` und kam leer zurück — gezählt als „übersprungen", allein
        // mit dem Grund, den das Werkzeug nennt.
        if (!erzeugt && !ziele.length) {
            let grund = null;
            try { grund = b.warumNicht?.(gegenstaende[0], werte.value, { zug: zug ?? [] }) ?? null; }
            catch { grund = null; }
            letzterGrund.value = grund || 'Dem Bauteil fehlt der Bezug für diese Bearbeitung.';
            return null;
        }
        const karte = new Map(ziele.map(s => [s.globalId, s]));
        const erg = await fuehreAus(kommando, {
            subjektVon: (gid) => karte.get(gid) ?? null,
            rahmen: r,
            // Die Oberfläche vergibt ihre Kennungen beim Auswerten (E2); das
            // ausgewertete Kommando nennt sie danach in `neu`.
            kennungsgeber: zufallsKennung,
            // Die Formularprüfung hat `bereit` schon gemacht — mit genau den
            // Feldern, die das Formular zeigt. Keine zweite mit anderem Profil.
            pruefeWerte: () => fehler.value,
            felder: felder.value,
            basis, modell, modellSha,
            hauptSubjekt: gegenstand,
            befunde: befunde.value,
            uebersprungenVorab: ohneKennung.length,
        });
        letzterGrund.value = erg.grund ?? '';
        if (!erg.ausgefuehrt) return null;
        abbrechen();
        // Einteilig bleibt einteilig: der Rückgabewert ist DER Eintrag, nicht
        // eine Liste mit einem. Sonst müssten alle bisherigen Aufrufer
        // umgeschrieben werden, obwohl sich für sie nichts geändert hat.
        return erg.mehrteilig ? erg.eintraege : (erg.eintraege[0] ?? null);
    }

    /**
     * DIE MARKIERUNG OHNE OBERFLÄCHE (Teil XXIV, K6): die Befunde der eigenen
     * Bauteile aus dem Journal — dieselben Regeln, dasselbe Regelwerk wie die
     * Prüfliste der Engine. Ein geliefertes Bauteil braucht sein Modell; hier
     * hat es keine Zeile.
     */
    function pruefeEigenes() {
        return pruefeStandAusJournal(useAenderungen().wirksamerStand, {
            typprofilFuer: (kategorie) => profilFuer(kategorie, profilSatz.value),
            hoehenversatz: rahmen.value?.hoehenversatz ?? 0,
        });
    }
    function befundeVon(globalId) {
        return pruefeEigenes().find(z => z.globalId === globalId)?.befunde ?? [];
    }

    /** Der Rahmen Welt ↔ Projektkoordinaten — der Viewer setzt ihn, wenn ein Modell seinen Bezug hat. */
    const rahmen = ref(null);
    function setzeRahmen(r) { rahmen.value = r ?? null; }

    /**
     * EIN KOMMANDO AUSFÜHREN — ganz oder gar nicht (Teil XXIV, K1).
     *
     * Der Weg ohne Oberfläche: kein Bearbeiten-Modus, kein scharfes Werkzeug,
     * keine Formularwerte im Store — nur das Kommando und der Kontext, aus dem
     * die Auswertung liest (`Auswertung.werteAus`). Abgelehnt wird, was
     * technisch nicht geht (E5): ein ungültiges Kommando, ein fehlendes Ziel,
     * eine Kennung in `neu`, die es schon gibt, ein unzulässiger Bezug, ein
     * Journal, das nur gelesen wird. Fachregeln lehnen NIE ab; sie markieren
     * nach dem Schreiben (Befunde).
     *
     * @param {object} kommando  siehe `services/kommando/Kommando.js`
     * @param {object} [k]       Kontext: `subjektVon`, `rahmen`, `kennungsgeber`,
     *        `pruefeWerte`, `felder` (die das Formular zeigt), `basis`, `modell`,
     *        `modellSha`, `jeEintrag` (GlobalId → {basis, modell, modellSha} des Eintrags —
     *        ein Kommando über gelieferte UND eigene Bauteile, O6), `hauptSubjekt`,
     *        `befunde` (Momentaufnahme), `uebersprungenVorab`.
     *        `subjektVon` darf für ein eigenes Bauteil nichts wissen — dann gilt der Stand.
     * @returns {Promise<{ausgefuehrt: boolean, grund: string|null, eintraege: object[],
     *                    mehrteilig: boolean, kommando: object, hinweise?: object[]}>}
     *          `kommando` ist das AUSGEWERTETE — mit den verwendeten Kennungen in `neu`;
     *          `hinweise` die überschrittenen Fachgrenzen (K10) — ausgeführt trotzdem.
     */
    async function fuehreAus(kommando, { subjektVon = null, knotenVon = null, rahmen: rahmenK = null, kennungsgeber = null,
                                        pruefeWerte = null, felder: felderVorgabe = null, basis = undefined,
                                        modell = undefined, modellSha = null, jeEintrag = null,
                                        hauptSubjekt = null, befunde: moment = [], uebersprungenVorab = 0 } = {}) {
        const abgelehnt = (grund) => ({ ausgefuehrt: false, grund, eintraege: [], mehrteilig: false, kommando });
        const fehlerKommando = pruefeKommando(kommando);
        if (fehlerKommando.length) return abgelehnt(fehlerKommando.join(' · '));

        const typprofilFuer = (el) => profilFuer(el?.category ?? el?.type, profilSatz.value);
        const rahmenWirksam = rahmenK ?? rahmen.value ?? rahmenOhneBezug();
        // OHNE OBERFLÄCHE (Teil XXIV, K3): das Subjekt eines EIGENEN Bauteils
        // kommt aus dem Stand — dieselbe Funktion, die der Viewer für eigene
        // Bauteile ruft. Ein geliefertes Bauteil lebt in seiner Datei; ohne
        // geladenes Modell gibt es sein Subjekt nicht — das ist technisch
        // unmöglich, nicht regelwidrig (E5), und wird so gesagt.
        if (!subjektVon) {
            const geliefert = (kommando.ziel ?? []).filter(gid => modellVon(gid) !== 'cde');
            if (geliefert.length) {
                return abgelehnt(`${geliefert.join(', ')}: ein geliefertes Bauteil braucht sein geladenes Modell — ohne Oberfläche kennt ein Kommando nur eigene Bauteile.`);
            }
        }
        const ae0 = useAenderungen();
        // Was der Aufrufer kennt (der Viewer: das Angereicherte; der Längsschnitt:
        // die gelieferten Glieder), sonst der Stand — je Kennung einmal.
        const subjekte = new Map();
        const subjektWirksam = (gid) => {
            if (!subjekte.has(gid)) {
                subjekte.set(gid, subjektVon?.(gid)
                    ?? subjektAusStand(gid, { wirksamerStand: ae0.wirksamerStand, rahmen: rahmenWirksam }));
            }
            return subjekte.get(gid);
        };
        // Die KNOTEN, auf die ein Zug zeigen darf (K8): die eigenen aus dem
        // Journal, dazu, was der Aufrufer kennt (der Viewer: das Gelieferte).
        const eigeneKnoten = new Map(cdeAchsenAus(ae0.wirksamerStand('erzeugt')).knoten
            .filter(kn => !verdeckteAus(ae0.wirksamerStand('geloescht')).has(kn.globalId))
            .map(kn => [kn.globalId, { ...kn.punkt, hoehenbezug: kn.hoehenbezug ?? null }]));
        const aus = werteAus(kommando, {
            subjektVon: subjektWirksam,
            bauplanVon: (gid) => ae0.wirksamerStand('erzeugt').get(gid) ?? null,
            knotenVon: (gid) => eigeneKnoten.get(gid) ?? knotenVon?.(gid) ?? null,
            rahmen: rahmenWirksam,
            kennungsgeber,
            typprofilFuer,
            ...(pruefeWerte ? { pruefeWerte } : {}),
            ...(felderVorgabe ? { felder: felderVorgabe } : {}),
        });
        if (aus.grund) return abgelehnt(aus.grund);
        // FACHGRENZEN (K10, E5): ausgeführt wird trotzdem — markiert am Eintrag
        // (die Momentaufnahme der Befunde) und im Ergebnis.
        const hinweise = aus.hinweise ?? [];
        const momentMitHinweisen = [...(moment ?? []), ...hinweise];
        const beschreibungen = aus.schritte;
        const uebersprungen = aus.uebersprungen + uebersprungenVorab;
        const ausgewertet = { ...kommando, ...(aus.neu.length ? { neu: aus.neu } : {}) };
        const b = aus.werkzeug;
        const gegenstand = hauptSubjekt ?? (kommando.ziel?.length ? subjektWirksam(kommando.ziel[0]) : null);

        const aenderungen = useAenderungen();
        // NUR LESEN (A7): das Journal verlangt eine neuere CDE — das sagen,
        // nicht „der Wert galt schon".
        if (aenderungen.nurLesen) return abgelehnt(aenderungen.nurLesen.grund);

        // NEU HEISST NEU (E2): eine Kennung, die das Journal schon kennt, darf
        // kein zweites Bauteil bekommen — die Faltung „letzter gewinnt" ersetzte
        // sonst still das alte.
        const bekannt = new Set(aenderungen.eintraege.map(e => e.globalId));
        // … und dasselbe für Operationen (E3): eine Operationskennung gehört einer Operation.
        for (const plan of aenderungen.wirksamerStand('erzeugt').values()) {
            for (const op of operationenMitKennung(plan?.parameter?.operationen)) if (op?.id) bekannt.add(op.id);
        }
        const doppelt = aus.neu.filter(id => bekannt.has(id));
        if (doppelt.length) return abgelehnt(`Die Kennung ${doppelt.join(', ')} gibt es schon — „neu" heisst neu.`);

        // BEZÜGE PRÜFEN, bevor etwas im Journal steht (Teil XIV, G4): eine
        // Ableitung, die auf sich selbst oder im Kreis zeigt, oder von der
        // Auftragsebene auf ein Variantenbauteil — eine Zeile hier, kein
        // topologischer Sortierer später.
        const erzeugtStand = aenderungen.wirksamerStand('erzeugt');
        // Die Historie weist eine zurückgenommene Gelände-Quelle ab (Fahrplan
        // Erdbau-Container, Stufe 1) — die Ansicht war dann nicht mehr aktuell.
        const historie = aenderungen.historischerStand?.('erzeugt') ?? null;
        for (const s of beschreibungen) {
            const quellen = s?.art === 'erzeugt' ? s.nachher?.parameter?.quellen : null;
            if (!quellen) continue;
            const fehler = pruefeBezuege({
                quellen, globalId: s.globalId, stand: erzeugtStand,
                ebeneVon: (gid) => aenderungen.ebeneVon(gid),
                zielEbene: aenderungen.vorgabeEbene,
                historie, rezeptNach,
            });
            if (fehler.length) return abgelehnt(`Bezug unzulässig: ${fehler.join(' · ')}`);
        }

        // EINE BEARBEITUNG DARF MEHRERE EINTRÄGE SCHREIBEN (Stufe 14.3).
        //
        // „Haltung teilen" ist ein Löschen und zwei Erzeugen. Ein Eintrag hat
        // trotzdem weiterhin GENAU EIN Subjekt — daran hängen fünfzehn Stellen
        // im Journal, vom Faltmechanismus bis zum Drei-Wege-Vergleich. Die
        // Klammer ist ein `vorgang`, kein Bauteil-Array.
        const mehrteilig = beschreibungen.length > 1;
        // Was nicht ging, wird GEZÄHLT und gemeldet. „Auf 12 von 15 angewandt"
        // ist eine Auskunft; ein stilles Überspringen wäre eine Behauptung.
        const uebersprungenText = uebersprungen
            ? ` — ${uebersprungen} übersprungen (Bezug fehlt)` : '';
        // EIN KOMMANDO IST EIN VORGANG (Teil XXIV, K2 — Fabios E1): die
        // Vorgangskennung IST die Kommandokennung, auch bei einem einzigen
        // Eintrag. Der Titel bleibt, wie er war: nur mehrteilige Vorgänge
        // heissen nach dem Werkzeug, ein einzelner Eintrag nach seiner Art.
        const { ok, eintraege: geschrieben, grund: grundVorgang } = await aenderungen.eintragenVorgang(
            beschreibungen.map((beschreibung) => {
              // JE EINTRAG, was der Aufrufer über SEIN Bauteil weiss (O6): am
              // gemischten Knoten ist eine Haltung geliefert (Basis, Modell),
              // die andere eigen — ein Vorgabewert für alle träfe eine falsch.
              const je = jeEintrag?.(beschreibung.globalId) ?? {};
              return {
                // Was die Bearbeitung selbst schon sagt, gilt: `erzeugtEintrag`
                // setzt `modell: 'cde'`, und das darf ein Vorgabewert von aussen
                // nicht überschreiben.
                basis: 'basis' in je ? je.basis : basis, modell: je.modell ?? modell,
                ...beschreibung, wer: kommando.wer ?? '',
                // DAS BEARBEITETE MODELL (Stufe 4, Lücke L6): was die Bearbeitung
                // selbst sagt (Erdbau: die Datei des Ur-Geländes), sonst der
                // Aufrufer je Eintrag, sonst das Subjekt, sonst der Aufrufer — der
                // nennt nur das ZUERST geladene Modell, und genau das stand bis
                // hierher in jedem Commit.
                modellSha: beschreibung.modellSha ?? je.modellSha ?? gegenstand?.modellSha ?? modellSha,
                // WAS BEIM SETZEN BEKANNT WAR (Stufe 14.4). Eine Momentaufnahme
                // der Befunde, nicht ihr laufender Stand — der wird abgeleitet
                // und ändert sich mit dem Modell. Ohne sie ist später nicht zu
                // unterscheiden, ob jemand das flache Gefälle in Kauf nahm oder
                // nichts davon wusste.
                ...(momentMitHinweisen.length ? { befunde: momentMitHinweisen } : {}),
              };
            }),
            {
                vorgang: kommando.id,
                // Ein Werkzeug darf seinen Vorgang nach den Werten nennen („Radieren").
                ...(mehrteilig ? { vorgangTitel: b.vorgangstitel?.(kommando.werte ?? {}) || b.titel } : {}),
                // Der Beleg: die Absicht, wie sie ausgewertet wurde (mit `neu`).
                kommando: ausgewertet,
                ...(kommando.ebene ? { ebene: kommando.ebene } : {}),
            });
        if (!ok) return abgelehnt(grundVorgang);
        let grund = null;
        if (!geschrieben.length) {
            grund = beschreibungen[0].globalId
                ? `Der Wert galt schon — nichts einzutragen.${uebersprungenText}`
                : 'Dem Bauteil fehlt die GlobalId — es lässt sich nicht eintragen.';
        } else if (uebersprungen) {
            grund = `Auf ${geschrieben.length} angewandt${uebersprungenText}.`;
        }
        return { ausgefuehrt: true, grund, eintraege: geschrieben, mehrteilig, kommando: ausgewertet, hinweise };
    }

    /**
     * „Vorgang entfernen" (Abnahme 2026-09-12, A6) — durch DIESE Engstelle, nicht
     * daneben: Modus an, sonst ein Grund; die Einträge rechnet
     * `vorgangEntfernenSchritte` rein aus dem Stand, geschrieben wird EIN Vorgang.
     *
     * @returns {Promise<Array|object|null>} das Geschriebene (für `wendeEintragAn`), sonst null
     */
    async function entferneVorgang(ableitung, { wer = '', einschalten = null } = {}) {
        letzterGrund.value = '';
        // Eine Handlung schaltet die Bearbeitung ein (Kassensturz E4, Abnahme M4):
        // der Viewer reicht seinen Einschalter mit den echten Sperren herein.
        if (!modusAn.value && !einschalten?.()) {
            letzterGrund.value = einschalten
                ? 'Bearbeiten lässt sich gerade nicht einschalten.'
                : 'Bearbeiten ist aus — oben einschalten (oder E), dann entfernen.';
            return null;
        }
        const aenderungen = useAenderungen();
        const schritte = vorgangEntfernenSchritte(aenderungen.wirksamerStand('erzeugt'), ableitung,
                                                  { geloescht: aenderungen.wirksamerStand('geloescht') });
        if (!schritte.length) {
            letzterGrund.value = 'Diesen Vorgang gibt es nicht mehr.';
            return null;
        }
        // Ganz oder gar nicht (Teil XXIV, K2), mit Beleg (O4) — der Vorgang
        // heisst wie sein Beleg, auch wenn er nur einen Eintrag hat.
        const beleg = systemBeleg('vorgang-entfernen', { ziel: schritte.map(s => s.globalId), werte: { ableitung }, wer });
        const { ok, eintraege: geschrieben, grund } = await aenderungen.eintragenVorgang(
            schritte.map(s => ({ ...s, wer })),
            { vorgang: beleg.id, vorgangTitel: schritte.length > 1 ? 'Vorgang entfernen' : undefined, kommando: beleg });
        if (!ok) { letzterGrund.value = grund; return null; }
        return geschrieben.length > 1 ? geschrieben : (geschrieben[0] ?? null);
    }

    return {
        entferneVorgang,
        einordnung, bauteil, bauteile, profilSatz, regeln, katalogBefunde, katalogStand, scharfId, werte, laeuft, letzterGrund,
        typprofil, passendeKontext, scharf, felder, fehler, bereit, grenzhinweise, moeglich, befunde,
        modusAn, werkzeug, belegeWerkzeug, gebeWerkzeugFrei, slotAus, commitDialogOffen, modusSetzen, modusUm,
        eckenFuer, eckenStarten, eckenBeenden,
        eingabe, setzeEingabe, leereEingabe,
        ladeProfile, entwurfUebernehmen, einordne, starte, starteMitVorschlag, starteMitModus, setzeWert, vorbelegeAusVorlage, abbrechen, ausfuehren,
        vorschlaege, ordneZu,
        // Teil XXIV, K1: der Kommandoweg — auch ohne Oberfläche.
        fuehreAus, rahmen, setzeRahmen,
        // Teil XXIV, K6: die Markierung ohne Oberfläche.
        pruefeEigenes, befundeVon,
    };
});
