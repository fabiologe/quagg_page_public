/**
 * DIE FACETTEN EINES BAUTEILS (Teil XXIX, G4 — Konzept § 3, § 5, § 6).
 *
 * Ein Bauteil steht nicht in einem Baum, es trägt Facetten: seine Form, seine Bauteilart (IFC-Klasse + Ausführung), sein
 * Gewerk, das Bauwerk, zu dem es gehört (mit Pfad: Baugruppe › Anlage), und — wenn es aus einer Vorlage stammt — woher:
 * ein Bauwerk aus einer Bauwerk-Vorlage, eine Rolle darin, oder ein Bauteil aus einer Bibliotheks-Vorlage. Die Kopfzeile
 * des Bauteilfensters zeigt genau das; hier wird es EINMAL gelesen, aus dem Journal und dem Katalog.
 *
 * Dazu die ROLLENTABELLE eines Bauwerks aus einer Vorlage: je Rolle das Bauteil und sein Stand — gesteuert, abweichend
 * (welches Feld) oder fehlt. Dieselbe Regel wie der Befund `vorlage_abweichung` (`abweichungVon`), nur als Tabelle.
 *
 * Rein: kein Vue, kein Store, keine Engine. Was aus dem Journal kommt, kommt als `bauplanVon(gid)`.
 */
import { BAUFORMEN } from './bauform/Bauformen.js';
import { GEWERKE } from './katalog/Gewerke.js';
import { gewerkVon, istBehaelter, objektTypVon, predefinedTypeVon, rezeptNach } from './Bauteilrezepte.js';
import { abweichungVon, vorlageNach } from './rezept/Bauwerksvorlagen.js';

/** So tief folgt der Pfad `teilVon` höchstens — ein Zyklus wäre ein Fehler im Journal, kein Grund zu hängen. */
const PFAD_TIEFE = 8;

/** Das Bauwerk, zu dem ein Bauplan gehört, und dessen Bauwerk … — vom nächsten zum äussersten. */
export function bauwerkPfad(bauplan, bauplanVon) {
    const pfad = [];
    const gesehen = new Set();
    let gid = bauplan?.parameter?.teilVon ?? null;
    while (gid && !gesehen.has(gid) && pfad.length < PFAD_TIEFE) {
        gesehen.add(gid);
        const b = bauplanVon?.(gid) ?? null;
        pfad.push({ globalId: gid, name: b?.parameter?.name || b?.name || gid, fehlt: !b });
        gid = b?.parameter?.teilVon ?? null;
    }
    return pfad;
}

/** Woher ein Bauteil stammt — ein Bauwerk aus einer Vorlage, eine Rolle darin, eine Bibliotheks-Vorlage, oder nichts. */
export function vorlageVon(globalId, bauplan, bauplanVon) {
    const bv = bauplan?.parameter?.bauwerksvorlage;
    if (bv?.id) return { art: 'bauwerk', id: bv.id, titel: vorlageNach(bv.id)?.titel ?? bv.id, werte: bv.werte ?? {} };
    for (const b of bauwerkPfad(bauplan, bauplanVon)) {
        const plan = bauplanVon?.(b.globalId);
        const rollen = plan?.parameter?.bauwerksvorlage?.rollen ?? {};
        const rolle = Object.entries(rollen).find(([, gid]) => gid === globalId)?.[0];
        if (rolle) {
            const id = plan.parameter.bauwerksvorlage.id;
            const stand = plan.parameter.bauwerksvorlage.stand?.[rolle];
            return { art: 'rolle', rolle, bauwerk: b.globalId, bauwerkName: b.name, id, titel: vorlageNach(id)?.titel ?? id,
                     abweichend: stand ? abweichungVon(stand, bauplan.rezept, bauplan.parameter) : [] };
        }
    }
    const v = bauplan?.parameter?.vorlage;
    return v ? { art: 'bibliothek', id: String(v) } : null;
}

/**
 * Die Facetten eines Bauteils für die Kopfzeile.
 * @param {object} el  das eingeordnete Subjekt (`globalId`, `category`, `stand.bauplan`)
 * @param {{bauplanVon?: (gid) => object|null, bauform?: string|null}} opts
 */
export function facettenVon(el, { bauplanVon = null, bauform = null } = {}) {
    const plan = el?.stand?.bauplan ?? null;
    const kategorie = String(plan?.kategorie ?? el?.category ?? el?.type ?? '').toUpperCase() || null;
    const g = plan ? gewerkVon(plan) : { gewerk: null, quelle: null };
    const form = bauform ?? (plan ? (rezeptNach(plan.rezept)?.teile?.find?.(t => t.rolle === plan.rolle)?.bauform
        ?? rezeptNach(plan.rezept)?.bauform ?? null) : null);
    return {
        form: form ? { id: form, titel: BAUFORMEN[form]?.titel ?? form } : null,
        klasse: kategorie ? { kategorie, predefinedType: plan ? predefinedTypeVon(plan) : null, objektTyp: plan ? objektTypVon(plan) : null } : null,
        gewerk: g.gewerk ? { id: g.gewerk, titel: GEWERKE[g.gewerk]?.titel ?? g.gewerk, quelle: g.quelle } : null,
        bauwerk: plan ? bauwerkPfad(plan, bauplanVon) : [],
        vorlage: plan ? vorlageVon(el?.globalId, plan, bauplanVon) : null,
        behaelter: plan ? istBehaelter(plan) : false,
        eigen: !!plan,
    };
}

/**
 * DIE ROLLENTABELLE eines Bauwerks aus einer Vorlage: je Rolle das Bauteil und sein Stand.
 * @returns {Array<{rolle, globalId, name, status: 'gesteuert'|'abweichend'|'fehlt', felder: string[]}>}
 */
export function rollenTabelle(plan, bauplanVon, verdeckt = new Set()) {
    const bv = plan?.parameter?.bauwerksvorlage;
    if (!bv?.id) return [];
    return Object.entries(bv.rollen ?? {}).map(([rolle, gid]) => {
        const teil = verdeckt.has(gid) ? null : (bauplanVon?.(gid) ?? null);
        if (!teil) return { rolle, globalId: gid, name: rolle, status: 'fehlt', felder: [] };
        const felder = abweichungVon(bv.stand?.[rolle], teil.rezept, teil.parameter);
        return { rolle, globalId: gid, name: teil.parameter?.name || teil.name || rolle,
                 status: felder.length ? 'abweichend' : 'gesteuert', felder };
    });
}
