/**
 * BIMFY · Lagebezug — in welchem System liegt die Datei, in welchem das Projekt?
 *
 * Eine ISYBAU-Datei aus dem Saarland liegt in Gauss-Krüger Zone 2
 * (`CRSLage` DE_DHDN_3GK2, Rechtswert 2,56 Mio.), ein Projekt womöglich in UTM 32
 * — dann lägen die Bauteile hunderte Kilometer daneben. Erkannt wird mit
 * derselben Regel wie beim Laden eines Modells (`Koordinatensysteme.erkenneSystem`:
 * der Rechtswert verrät das System), umgerechnet mit denselben proj4-Zeilen.
 *
 * Nicht umgerechnet wird, was nicht sicher erkannt ist — dann sagt es eine
 * Warnung. Höhen bleiben, wie sie sind (DHHN92 → DHHN2016 sind Zentimeter; das
 * steht als Hinweis dabei, nicht still verrechnet).
 */
import proj4 from 'proj4';
import { erkenneSystem, systemNach } from '../Koordinatensysteme.js';

/** `CRSLage` (Kurzbezeichnung der AdV-Liste) → EPSG, soweit die CDE das System kennt. */
export function epsgAusCrsLage(crs) {
    const t = String(crs ?? '').toUpperCase();
    const gk = /3GK([2-5])\b/.exec(t);
    if (gk) return `EPSG:${31464 + Number(gk[1])}`;
    const utm = /UTM_?(32|33)/.exec(t);
    if (utm) return `EPSG:258${utm[1]}`;
    return null;
}

/** Das System der Geometrien: aus `CRSLage`, sonst am ersten Rechtswert erkannt. */
export function lagesystemVon(geometrien) {
    const crs = geometrien.find(g => g.isybau?.crsLage)?.isybau?.crsLage ?? null;
    const ausCrs = epsgAusCrsLage(crs);
    const p = geometrien.find(g => g.punkte?.length)?.punkte?.[0];
    const erkannt = p ? erkenneSystem(p.ost) : null;
    if (ausCrs && erkannt && erkannt.epsg !== ausCrs && !(erkannt.mehrdeutig ?? []).includes(ausCrs)) {
        return { epsg: erkannt.epsg, quelle: `Rechtswert (CRSLage „${crs}" passt nicht dazu)` };
    }
    if (ausCrs) return { epsg: ausCrs, quelle: `CRSLage „${crs}"` };
    if (erkannt) return { epsg: erkannt.epsg, quelle: 'Rechtswert', mehrdeutig: erkannt.mehrdeutig };
    return null;
}

/**
 * Der Umrechner von einem System ins andere — `(ost, nord) → {ost, nord}` —
 * oder null, wenn nichts umzurechnen ist oder ein System unbekannt.
 */
export function umrechner(vonEpsg, nachEpsg) {
    if (!vonEpsg || !nachEpsg || vonEpsg === nachEpsg) return null;
    const von = systemNach(vonEpsg), nach = systemNach(nachEpsg);
    if (!von || !nach) return null;
    const p = proj4(von.def, nach.def);
    return (ost, nord) => { const [o, n] = p.forward([ost, nord]); return { ost: o, nord: n }; };
}
