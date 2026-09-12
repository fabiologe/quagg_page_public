/**
 * IDS-Startregeln der Vorschau (Cockpit-Karte „BIM-Qualität").
 *
 * SEIT 2026-09-11 AUS DER IDS-DATEI (Fahrplan IFC-Konsistenz, Stufe 5). Bis
 * dahin stand hier eine handgeschriebene Liste im Eigenformat — ein zweiter Ort
 * für dieselben Anforderungen, den das Backend nie gesehen hat. Kanonisch ist
 * jetzt `data/quagg-starter.ids` (IDS 1.0, Kopie von
 * backend/app/ifc/daten/quagg-starter.ids, geschrieben von generiere_client.py):
 * das Backend prüft sie verbindlich mit ifctester, hier wird sie für die
 * Vorschau übersetzt (services/IdsXml.js). Was die Vorschau nicht kann, steht
 * in IDS_NICHT_IN_VORSCHAU — beim Starter-Set die zwei Typ-Regeln des
 * Erdbau-Containers (PredefinedType als Aufzählung, xs:restriction).
 *
 * Die zwölf bisherigen Regeln kommen inhaltlich unverändert heraus (gleiche
 * Kennung, Schwere, Anwendbarkeit, Anforderung); dazu zwei Erdbau-Mengenregeln
 * und vier für den abgeleiteten Container (Fahrplan Erdbau-Container, Stufe 4):
 * Herkunft lesbar und PredefinedType bestimmt, je für Aushub und Auftrag der CDE.
 * Umbenannt ist nur `spec-pipe-system`: sie hiess „System-Klassifikation" und
 * prüfte die Nennweite.
 *
 * Spec-Shape (das Eigenformat, das IdsValidator.js prüft):
 *   { id, name, description, enabled, severity: 'error' | 'warning' | 'info',
 *     applicability: { category, psetCondition?: { psetName, propertyName, value } },  // value null = vorhanden
 *     requirements: [ { kind: 'attribute', name, message }
 *                   | { kind: 'pset', psetName, propertyName, message }
 *                   | { kind: 'pset-equals', psetName, propertyName, value, message } ] }
 *
 * Severity: error = Phase-Gate-Blocker · warning = Hinweis · info = Statistik.
 * In der IDS-Datei steht sie als `instructions="Schwere: …"` der Spezifikation.
 */
import starterXml from '../data/quagg-starter.ids?raw';
import { parseIds } from './IdsXml.js';

const _starter = parseIds(starterXml);

export const IDS_STARTER_TITEL = _starter.titel;
export const IDS_DEFAULT_SPECS = Object.freeze(_starter.specs);
export const IDS_NICHT_IN_VORSCHAU = Object.freeze(_starter.nichtInVorschau);
