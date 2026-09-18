/**
 * Erdmassen — aus der IfcEngine ausgelagert (Teil XXIII, A8; Befund B13).
 *
 * Die Massen je Vorgang und gesamt — gerechnet aus dem, was der Autor beim
 * Aufbau festhält (`autor.ableitungen`), nicht vom Renderer. Liegt in der
 * Auswertungsschicht: sie darf Gelände und Ableitungen kennen, die Engine nicht.
 *
 * Jede Funktion bekommt die Engine als ersten Parameter (`engine`) und liest
 * nur, was sie braucht; die Engine behält eine einzeilige Weiterleitung, damit
 * ihre Aufrufer (Viewer, Tests) unverändert bleiben.
 */
import { rezeptNach as _rezeptNach } from './Bauteilrezepte.js';
import { aushubMasseVon } from './ableitung/Ableitungen.js';
import { formeNach, massenAus } from './gelaende/Operationen.js';

/**
 * Die Füllungsspalten des Mengen-Reiters — aus dem REZEPT (Teil XXIII, A3).
 *
 * Der Teil, der eine verdichtete Menge trägt (`menge.compactedVolume`), ist
 * die Füllung des Vorgangs. Heisst er `verfuellung`, füllt er einen Graben
 * wieder (Graben − Rohr), sonst ist er ein Auftrag. Ohne solchen Teil (die
 * Baugrube) bleiben beide Spalten leer. Bis A3 stand hier, WELCHE Rezepte
 * welche Spalte füllen — beim Namen.
 */
function _fuellungsspalten(rz, k) {
    const teil = (rz?.teile ?? []).find(t => t?.menge?.compactedVolume);
    if (!teil) return { auftrag: null, verfuellung: null };
    const wert = k?.[teil.menge.compactedVolume] ?? null;
    return teil.rolle === 'verfuellung' ? { auftrag: null, verfuellung: wert } : { auftrag: wert, verfuellung: null };
}


/**
 * Erdmassen je geformtem Gelände (Stufe 15): Ausgangsraster gegen das
 * nach der Operationsliste geformte — Aushub und Auftrag getrennt.
 * Nichts wird gespeichert; jede Zeile entsteht aus Journal + Ableitung.
 */
export async function erdmassen(engine, bauplaene = []) {
    const zeilen = [];
    const gesehen = new Set();
    for (const b of bauplaene) {
        const rz = _rezeptNach(b?.rezept);
        // DIE ANZEIGE (Stufe 1): je Ur-Gelände eine Zeile GESAMT — das
        // Ur gegen das Gelände nach allen Vorgängen. Sie muss die Summe
        // der Vorgangszeilen sein; ist sie es nicht, ist etwas falsch.
        if (rz?.summe) {
            if (!b.ableitung || gesehen.has(b.ableitung)) continue;
            gesehen.add(b.ableitung);
            const k = engine.autor?.ableitungen?.get(b.ableitung)?.kennzahlen ?? null;
            const name = (rz.quellnameAus?.(b) ?? String(b.name ?? '')) + ' · Gesamt';
            if (!k) { zeilen.push({ name, art: 'anzeige', gesamt: true, aushub: null, auftrag: null, grund: 'noch nicht aufgebaut' }); continue; }
            zeilen.push({ name, ableitung: b.ableitung, art: 'anzeige', gesamt: true,
                          aushub: k.aushubGesamt ?? null, auftrag: k.auftragGesamt ?? null,
                          vorgaenge: (b.parameter?.vorgaenge ?? []).length, befunde: [] });
            continue;
        }
        // Teil XIV: eine Ableitung trägt ihre Massen als KENNZAHLEN des
        // letzten Aufbaus — Körper UND Raster, die Gegenprobe steht daneben.
        // Die Teile teilen sich eine Ableitung: je Ableitung eine Zeile.
        if (rz?.erdbau) {
            if (!b.ableitung || gesehen.has(b.ableitung)) continue;
            gesehen.add(b.ableitung);
            const a = engine.autor?.ableitungen?.get(b.ableitung) ?? null;
            const k = a?.kennzahlen;
            const anhang = rz.mengenzeile ? ` · ${rz.mengenzeile}` : '';
            const name = String(b.name ?? '')
                .replace(/ · (Aushub|Auftrag|Graben|Verfüllung|Baugrube)$/, '')
                .replace(/ \((geformt|mit Graben|mit Baugrube)\)$/, '')
                + anhang;
            if (!k) {
                zeilen.push({ name, aushub: null, auftrag: null, grund: 'noch nicht aufgebaut' });
                continue;
            }
            zeilen.push({
                name, ableitung: b.ableitung, art: b.rezept, reihe: k.reihe ?? null,
                // Die GELTENDE Masse (Teil XXI, P6) — dieselbe Zahl wie in
                // der Meldung, im Eigenschaftsfenster und in der IFC-Qto.
                aushub: aushubMasseVon(k),
                massenQuelle: k.massenQuelle ?? null,
                // Beim Kanalgraben ist der „Auftrag" die VERFÜLLUNG (Graben − Rohr).
                // Was der Vorgang AUFFÜLLT, sagt sein Rezept: der Teil, der eine
                // verdichtete Menge trägt — beim Graben die Verfüllung, sonst der
                // Auftrag. Eine Baugrube hat keinen.
                ..._fuellungsspalten(rz, k),
                rohrVolumen: k.rohrVolumen ?? null,
                aushubKoerper: k.aushubKoerper ?? null, auftragKoerper: k.auftragKoerper ?? null,
                // Teil XXI (P4): die LOSE Masse (die abgefahren wird), der
                // Faktor, mit dem sie entstand, und die Gegenprobe als Zahl
                // — sie sprach bisher nur, wenn sie ausschlug.
                aushubLose: k.aushubLose ?? null, auflockerung: k.auflockerung ?? null,
                gegenprobeAushub: k.gegenprobeAushub ?? null, gegenprobeAuftrag: k.gegenprobeAuftrag ?? null,
                befunde: a.befunde ?? [],
            });
            continue;
        }
        // Altbestand vor Teil XIV: das Rezept, das sein Quellraster braucht.
        if (rz?.braucht !== 'quellraster') continue;
        const quelle = b.parameter?.quelle;
        const raster = quelle
            ? await engine._quellrasterVon(quelle, { cell: b.parameter?.raster?.cell ?? null })
            : null;
        if (!raster) {
            zeilen.push({ name: b.name || quelle || '—', aushub: null, auftrag: null,
                          grund: 'Quellraster nicht ableitbar' });
            continue;
        }
        const { raster: geformt } = formeNach(raster, b.parameter?.operationen ?? []);
        const m = massenAus(raster, geformt);
        zeilen.push({ name: b.name || quelle, aushub: m?.aushub ?? null, auftrag: m?.auftrag ?? null });
    }
    return zeilen;
}
