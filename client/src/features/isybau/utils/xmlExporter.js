import { getEffectiveBauwerkstyp } from './mappings.js';

/**
 * Serialisiert den Store-Zustand (Knoten/Haltungen/Flächen) zurück in eine
 * ISYBAU-XML (Austauschformat 2017-07). Gegenstück zu utils/xmlParser.js —
 * der Anspruch ist ein verlustarmer Roundtrip: buildIsybauXML() → parseIsybauXML()
 * muss dieselben Netz- und Bauwerksdaten wieder ergeben (siehe test/xmlExporter.test.js).
 *
 * Bauwerksfelder werden mit derselben Priorität geschrieben, mit der SwmmBuilder
 * und PreprocessingModal sie lesen: editierte UI-/Domain-Felder (weirHeight,
 * wehrWidth, maxOutflow, gateWidth, volume, maxDepth, pumpHead …) vor den
 * ursprünglich importierten bauwerkData-Rohwerten — so überleben Nutzer-Edits
 * den Export.
 *
 * @param {Object} input
 * @param {Array}  input.nodes    - Node-Instanzen oder POJOs (toJSON-Form)
 * @param {Array}  input.edges    - Edge-Instanzen oder POJOs
 * @param {Array}  input.areas    - Area-Instanzen oder POJOs
 * @param {Object} [input.metadata]
 * @returns {{ xml: string, warnings: string[] }}
 */
export const buildIsybauXML = ({ nodes = [], edges = [], areas = [], metadata = {} }) => {
    const warnings = [];
    const today = new Date().toISOString().slice(0, 10);

    const esc = (s) => String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

    // Koordinaten/Höhen mit 3 Nachkommastellen, sonstige Zahlen getrimmt.
    const coord = (v) => Number(v).toFixed(3);
    const num = (v, dec = 3) => {
        const n = Number(v);
        if (!Number.isFinite(n)) return null;
        return String(parseFloat(n.toFixed(dec)));
    };
    const fin = (v) => Number.isFinite(Number(v)) ? Number(v) : null;
    const pos = (v) => { const n = fin(v); return n !== null && n > 0 ? n : null; };

    // Tag nur schreiben, wenn ein Wert existiert (Parser behandelt fehlende Tags als null)
    const tag = (name, value) => value === null || value === undefined || value === ''
        ? ''
        : `<${name}>${esc(value)}</${name}>`;

    // ── Knoten ──────────────────────────────────────────────────────────────
    const buildBauwerkBlock = (n, btyp) => {
        const bd = n.bauwerkData || {};
        let inner = '';

        switch (btyp) {
            case 1: { // Pumpwerk: Volumen als Grundfläche × MaxHöhe kodiert
                const h = pos(n.maxDepth) ?? pos(bd.maxDepth) ?? pos(n.depth);
                const vol = pos(n.volume) ?? pos(bd.volume);
                inner = `<Pumpwerk>${tag('Grundflaeche', vol && h ? num(vol / h) : null)}${tag('MaxHoehe', num(h))}</Pumpwerk>`;
                break;
            }
            case 2: { // Becken
                const vol = pos(n.volume) ?? pos(bd.volume);
                const h = pos(n.maxDepth) ?? pos(bd.maxDepth) ?? pos(n.depth);
                inner = `<Becken>${tag('NutzVolumen', num(vol))}${tag('MaxHoehe', num(h))}</Becken>`;
                break;
            }
            case 6: { // Pumpe: Leistung ggf. aus pumpRate/pumpHead rückgerechnet
                          // (Inverse der Vorbelegungs-Formel Q = P·η·1000/(ρ·g·H), η=0.7)
                const head = pos(n.pumpHead) ?? pos(bd.pumpHead);
                let power = pos(bd.pumpPower);
                if (power === null && pos(n.pumpRate) && head) {
                    power = n.pumpRate * 9.81 * head / 700; // l/s, m → kW
                }
                inner = `<Pumpe>${tag('FoerderhoeheGesamt', num(head))}${tag('Leistung', num(power))}</Pumpe>`;
                break;
            }
            case 7: { // Wehr/Überlauf: SchwellenhoeheMin ist absolut (m ü.NHN)
                const schwelle = pos(n.weirHeight)
                    ? (fin(n.z) ?? 0) + n.weirHeight
                    : fin(bd.wehrSchwelle);
                const laenge = pos(n.wehrWidth) ?? pos(bd.wehrLaenge);
                inner = `<Wehr_Ueberlauf>${tag('SchwellenhoeheMin', num(schwelle))}${tag('LaengeWehrschwelle', num(laenge))}</Wehr_Ueberlauf>`;
                break;
            }
            case 8: { // Drossel
                const q = pos(n.maxOutflow) ?? pos(bd.nennleistung);
                inner = `<Drossel>${tag('Nennleistung', num(q))}</Drossel>`;
                break;
            }
            case 9: { // Schieber
                const b = pos(n.gateWidth) ?? pos(bd.schieberBreite);
                inner = `<Schieber>${tag('Schieberbreite', num(b))}${tag('HubhoeheMax', num(pos(bd.hubhoeheMax)))}</Schieber>`;
                break;
            }
            case 12: { // Versickerungsanlage
                inner = `<Versickerungsanlage>${tag('MaxVersickerungsleistung', num(pos(bd.seepageRate)))}</Versickerungsanlage>`;
                break;
            }
            case 13: { // Zisterne: Volumen als Grundfläche × Tiefe kodiert
                const tiefe = pos(n.maxDepth) ?? pos(bd.maxDepth) ?? pos(n.depth);
                const vol = pos(n.volume) ?? pos(bd.volume);
                inner = `<Zisterne>${tag('GrundflaecheRn', vol && tiefe ? num(vol / tiefe) : null)}${tag('Tiefe', num(tiefe))}</Zisterne>`;
                break;
            }
            // 3,4,5,10,11,14: keine hydraulischen Parameter im ISYBAU-Bauwerksblock
        }

        return `<Bauwerk><Bauwerkstyp>${btyp}</Bauwerkstyp>${inner}</Bauwerk>`;
    };

    const buildNode = (n) => {
        let btyp = getEffectiveBauwerkstyp(n);
        if (btyp !== null && (btyp < 1 || btyp > 14)) btyp = null;
        const typeStr = String(n.type);
        if (btyp === null && typeStr === 'Auslaufbauwerk') btyp = 5;
        if (typeStr === 'Divider') {
            warnings.push(`Knoten ${n.id}: Flow-Divider hat kein ISYBAU-Äquivalent — als Schacht exportiert (Divider-Parameter gehen verloren).`);
        }

        let kern;
        if (typeStr === 'Anschlusspunkt') {
            kern = `<Anschlusspunkt>${tag('Punktkennung', n.punktkennung)}</Anschlusspunkt>`;
        } else if (btyp !== null) {
            kern = buildBauwerkBlock(n, btyp);
        } else {
            const aufbau = pos(n.diameter) ? `<Aufbau><LaengeAufbau>${num(n.diameter)}</LaengeAufbau></Aufbau>` : '';
            kern = `<Schacht><SchachtFunktion>1</SchachtFunktion>${tag('Schachttiefe', num(pos(n.depth)))}${aufbau}</Schacht>`;
        }

        const smp = `<Punkt><Rechtswert>${coord(n.x)}</Rechtswert><Hochwert>${coord(n.y)}</Hochwert>${fin(n.z) !== null ? `<Punkthoehe>${coord(n.z)}</Punkthoehe>` : ''}<PunktattributAbwasser>SMP</PunktattributAbwasser></Punkt>`;
        const dmp = fin(n.coverZ) !== null
            ? `<Punkt><Rechtswert>${coord(n.x)}</Rechtswert><Hochwert>${coord(n.y)}</Hochwert><Punkthoehe>${coord(n.coverZ)}</Punkthoehe><PunktattributAbwasser>DMP</PunktattributAbwasser></Punkt>`
            : '';

        return `<AbwassertechnischeAnlage>`
            + tag('Objektbezeichnung', n.id)
            + `<Objektart>2</Objektart>`
            + tag('Status', String(fin(n.status) ?? 0))
            + tag('Entwaesserungsart', n.entwaesserungsart || null)
            + `<Knoten><KnotenTyp>0</KnotenTyp>${kern}</Knoten>`
            + `<Geometrie><GeoObjektart>1</GeoObjektart><GeoObjekttyp>P</GeoObjekttyp>`
            + `<Geometriedaten><Knoten>${smp}${dmp}</Knoten></Geometriedaten></Geometrie>`
            + `</AbwassertechnischeAnlage>`;
    };

    // ── Haltungen ───────────────────────────────────────────────────────────
    const KANTENTYP_BY_TYPE = { Haltung: 0, Leitung: 1, Rinne: 2, Gerinne: 3 };

    const buildEdge = (e) => {
        const from = e.fromNodeId || e.from;
        const to = e.toNodeId || e.to;
        const kantenTyp = KANTENTYP_BY_TYPE[e.type] ?? 0;
        const p = e.profile || {};

        const profil = `<Profil>`
            + `<Profilart>${fin(p.type) ?? 0}</Profilart>`
            + tag('Profilbezeichnung', p.id || null)
            + tag('Profilhoehe', pos(p.height) ? String(Math.round(p.height * 1000)) : null)
            + tag('Profilbreite', pos(p.width) ? String(Math.round(p.width * 1000)) : null)
            + `</Profil>`;

        // Polyline nur schreiben, wenn echte Stützpunkte existieren — der Parser
        // fällt sonst auf die Knotenkoordinaten der Viewer zurück.
        let geometrie = '';
        if (Array.isArray(e.coords) && e.coords.length >= 2) {
            const pts = e.coords.map(c =>
                `<Punkt><Rechtswert>${coord(c.x)}</Rechtswert><Hochwert>${coord(c.y)}</Hochwert>${fin(c.z) !== null ? `<Punkthoehe>${coord(c.z)}</Punkthoehe>` : ''}<PunktattributAbwasser>RAP</PunktattributAbwasser></Punkt>`
            ).join('');
            geometrie = `<Geometrie><GeoObjektart>4</GeoObjektart><GeoObjekttyp>L</GeoObjekttyp><Geometriedaten>${pts}</Geometriedaten></Geometrie>`;
        }

        return `<AbwassertechnischeAnlage>`
            + tag('Objektbezeichnung', e.id)
            + `<Objektart>1</Objektart>`
            + tag('Status', String(fin(e.status) ?? 0))
            + tag('Entwaesserungsart', e.entwaesserungsart || null)
            + `<Kante>`
            + `<KantenTyp>${kantenTyp}</KantenTyp>`
            + tag('KnotenZulauf', from)
            + tag('KnotenAblauf', to)
            + tag('SohlhoeheZulauf', num(fin(e.z1)))
            + tag('SohlhoeheAblauf', num(fin(e.z2)))
            + tag('Laenge', num(pos(e.length), 2))
            + tag('Material', e.material || null)
            + profil
            + `</Kante>`
            + geometrie
            + `</AbwassertechnischeAnlage>`;
    };

    // ── Flächen / Einzugsgebiete ────────────────────────────────────────────
    const buildFlaeche = (a) => {
        const pts = a.points;
        // Geschlossener Ring aus Kanten-Segmenten — der Parser liest die
        // Start-Punkte jeder Kante als Polygonzug.
        const kanten = pts.map((pnt, i) => {
            const nxt = pts[(i + 1) % pts.length];
            return `<Kante>`
                + `<Start><Rechtswert>${coord(pnt.x)}</Rechtswert><Hochwert>${coord(pnt.y)}</Hochwert></Start>`
                + `<Ende><Rechtswert>${coord(nxt.x)}</Rechtswert><Hochwert>${coord(nxt.y)}</Hochwert></Ende>`
                + `</Kante>`;
        }).join('');

        // Anschluss-Referenz: Haltung bevorzugt (Import splittet 50/50 auf deren
        // Knoten), sonst direkter Knoten (Import-Fallback im Store löst ihn auf).
        const ref = a.edgeId || a.nodeId || null;

        return `<Flaeche>`
            + tag('Flaechenbezeichnung', a.id)
            + tag('Flaechenart', String(fin(a.type) ?? 0))
            + tag('Flaecheneigenschaft', String(fin(a.property) ?? 0))
            + tag('Flaechenfunktion', String(fin(a.function) ?? 0))
            + tag('Flaechennutzung', String(fin(a.usage) ?? 0))
            + tag('Verschmutzungsklasse', String(fin(a.pollution) ?? 0))
            + tag('Neigungsklasse', String(fin(a.slope) ?? 0))
            + tag('Flaechengroesse', num(fin(a.size), 4))
            + tag('Abflussbeiwert', num(fin(a.runoffCoeff), 3))
            + (ref ? `<HydraulikObjekt>${tag('Objektbezeichnung', ref)}</HydraulikObjekt>` : '')
            + `<Flaechengeometrie><Polygon><Polygonart>1</Polygonart>${kanten}</Polygon></Flaechengeometrie>`
            + `</Flaeche>`;
    };

    // Schmutzfracht-Felder gehören laut ISYBAU-Schema zu "Gebiet", nicht zu "Flaeche".
    const buildSchmutzfrachtTags = (sf) => !sf ? '' : tag('Gebietsname', sf.gebietsname)
        + tag('Kommentar', sf.kommentar)
        + tag('Einwohnerwerte', sf.einwohnerwerte != null ? num(sf.einwohnerwerte, 2) : null)
        + tag('Einwohnerdichte', sf.einwohnerdichte != null ? num(sf.einwohnerdichte, 2) : null)
        + tag('Trockenwetterkennung', sf.trockenwetterkennung);

    const buildEinzugsgebiet = (a) => `<Einzugsgebiet>`
        + tag('GebietsID', a.id)
        + tag('KnotenID', a.nodeId || null)
        + tag('Flaeche', num(fin(a.size), 4))
        + tag('Abflussbeiwert', num(fin(a.runoffCoeff), 3))
        + buildSchmutzfrachtTags(a.schmutzfracht)
        + `</Einzugsgebiet>`;

    const areasWithGeom = areas.filter(a => Array.isArray(a.points) && a.points.length >= 3);
    const areasNoGeom = areas.filter(a => !Array.isArray(a.points) || a.points.length < 3);
    // Der Import nutzt <Einzugsgebiet> nur als Fallback, wenn KEINE Flächen-Polygone
    // existieren — im Mischfall gingen die geometrielosen Flächen beim Re-Import verloren.
    if (areasWithGeom.length > 0 && areasNoGeom.length > 0) {
        warnings.push(`${areasNoGeom.length} Fläche(n) ohne Polygon-Geometrie als <Einzugsgebiet> exportiert — beim Re-Import werden sie ignoriert, solange Flächen mit Geometrie vorhanden sind.`);
    }
    // Flächen MIT Geometrie exportieren als <Flaeche> — Schmutzfracht-Daten gehören
    // aber zu <Gebiet>/<Einzugsgebiet>, nicht zu <Flaeche>. Für solche Flächen daher
    // zusätzlich einen schlanken <Einzugsgebiet>-Block (gleiche ID) nur mit den
    // Schmutzfracht-Tags exportieren, sonst gingen die Daten beim Export verloren.
    const areasWithSchmutzfracht = areasWithGeom.filter(a => a.schmutzfracht);

    const hydObjekte = edges.map(e =>
        `<HydraulikObjekt>${tag('Objektbezeichnung', e.id)}<HydObjektTyp>1</HydObjektTyp><Haltung></Haltung></HydraulikObjekt>`
    ).join('');

    // ── Gesamtdokument ──────────────────────────────────────────────────────
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
        + `<Identifikation xmlns="http://www.bfr-abwasser.de">`
        + `<Version>${esc(metadata.version || '2017-07')}</Version>`
        + `<Admindaten></Admindaten>`
        + `<Datenkollektive>`
        + `<Datenstatus>1</Datenstatus>`
        + `<Erstellungsdatum>${today}</Erstellungsdatum>`
        + `<Kennungen>`
        + `<Kollektiv><Kennung>STA01</Kennung><Kollektivart>1</Kollektivart>`
        + `<Kollektiveigenschaft><Stammdaten><Stammdatentyp>1</Stammdatentyp><Bautechnik>1</Bautechnik><Geometrie>1</Geometrie><Sanierung>0</Sanierung><Umfeld>0</Umfeld></Stammdaten></Kollektiveigenschaft>`
        + `<Regelwerk>2</Regelwerk><Bearbeitungsstand>${today}</Bearbeitungsstand></Kollektiv>`
        + `<Kollektiv><Kennung>HYD01</Kennung><Kollektivart>3</Kollektivart>`
        + `<Kollektiveigenschaft><Hydraulikdaten><Verfahren>0</Verfahren><Rechennetz>1</Rechennetz><Gebiet>0</Gebiet><Flaechen>1</Flaechen><Belastung>0</Belastung><Berechnung>1</Berechnung></Hydraulikdaten></Kollektiveigenschaft>`
        + `<Regelwerk>2</Regelwerk><Bearbeitungsstand>${today}</Bearbeitungsstand></Kollektiv>`
        + `</Kennungen>`
        + `<Stammdatenkollektiv>`
        + `<Kennung>STA01</Kennung>`
        + nodes.map(buildNode).join('')
        + edges.map(buildEdge).join('')
        + `</Stammdatenkollektiv>`
        + `<Hydraulikdatenkollektiv>`
        + `<Kennung>HYD01</Kennung>`
        + `<Rechennetz>`
        + `<Stammdatenkennung>STA01</Stammdatenkennung>`
        + `<HydraulikObjekte>${hydObjekte}</HydraulikObjekte>`
        + areasWithGeom.map(buildFlaeche).join('')
        + areasNoGeom.map(buildEinzugsgebiet).join('')
        + areasWithSchmutzfracht.map(buildEinzugsgebiet).join('')
        + `</Rechennetz>`
        + `</Hydraulikdatenkollektiv>`
        + `</Datenkollektive>`
        + `</Identifikation>`;

    return { xml: prettyPrint(xml), warnings };
};

/**
 * Minimaler XML-Pretty-Printer (ein Element pro Zeile, 1-Space-Einrückung wie
 * in den ISYBAU-Referenzdateien) — rein kosmetisch, der Parser ist whitespace-agnostisch.
 */
const prettyPrint = (xml) => {
    const withBreaks = xml.replace(/></g, '>\n<');
    let indent = 0;
    return withBreaks.split('\n').map(line => {
        if (/^<\//.test(line)) indent = Math.max(0, indent - 1);
        const out = ' '.repeat(indent) + line;
        const opens = /^<[^!?/][^>]*[^/]?>$/.test(line) && !/<\/[^>]+>$/.test(line);
        if (opens) indent++;
        return out;
    }).join('\n');
};
