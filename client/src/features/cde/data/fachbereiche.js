/**
 * Fachbereiche — ein deutsches Etikett je Ast des IFC-Baums, für die Anzeige.
 *
 * Das ist DARSTELLUNG, kein Schemawissen: IFC kennt keine „TGA / Regelung".
 * Deshalb steht es hier von Hand und nicht im erzeugten Wörterbuch
 * (`entity-schema.js`, siehe backend/app/ifc/generiere_client.py).
 *
 * HERKUNFT: das bis 2026-09-11 benutzte, aus dem bSDD erzeugte Wörterbuch trug
 * je Klasse ein `domain`-Feld — von einem Generator, den es nie im Repo gab.
 * Nachgemessen: 34 Wurzeln reproduzieren 1.288 der 1.304 alten Einträge; die
 * übrigen waren abstrakte Zwischenklassen und stehen als eigene Zeilen unten.
 *
 * Die Tabelle hängt an der richtigen HÖHE im Baum: eine neue Klasse unter
 * `IfcFlowController` bekommt „TGA / Regelung", ohne dass jemand nachträgt.
 * Es gewinnt die NÄCHSTE Stufe — `IfcPipeSegment` ist „Infrastruktur / Kanal",
 * obwohl es über `IfcFlowSegment` auch „TGA / Verteilung" erben könnte.
 */
export const FACHBEREICHE = Object.freeze({
    // ── Wurzeln (nachgemessen am alten Wörterbuch) ──────────────────────────
    IFCFURNISHINGELEMENT: 'Ausstattung',
    IFCBUILDINGELEMENTPART: 'Bauteil',
    IFCDISCRETEACCESSORY: 'Bauteil',
    IFCEARTHWORKSCUT: 'Bauteil',
    IFCELEMENTASSEMBLY: 'Bauteil',
    IFCFASTENER: 'Bauteil',
    IFCFEATUREELEMENTADDITION: 'Bauteil',
    IFCIMPACTPROTECTIONDEVICE: 'Bauteil',
    IFCSIGN: 'Bauteil',
    IFCSURFACEFEATURE: 'Bauteil',
    IFCVEHICLE: 'Bauteil',
    IFCVIBRATIONDAMPER: 'Bauteil',
    IFCVIBRATIONISOLATOR: 'Bauteil',
    IFCVIRTUALELEMENT: 'Bauteil',
    IFCVOIDINGFEATURE: 'Bauteil',
    IFCTRANSPORTELEMENT: 'Förderanlagen',
    IFCGEOGRAPHICELEMENT: 'Gelände / Kartierung',
    IFCGEOTECHNICALELEMENT: 'Geotechnik',
    IFCBEAM: 'Hochbau',
    IFCBEARING: 'Hochbau',
    IFCBUILDINGELEMENTPROXY: 'Hochbau',
    IFCCHIMNEY: 'Hochbau',
    IFCCOLUMN: 'Hochbau',
    IFCCOURSE: 'Hochbau',
    IFCCOVERING: 'Hochbau',
    IFCCURTAINWALL: 'Hochbau',
    IFCDOOR: 'Hochbau',
    IFCFOOTING: 'Hochbau',
    IFCKERB: 'Hochbau',
    IFCMEMBER: 'Hochbau',
    IFCMOORINGDEVICE: 'Hochbau',
    IFCNAVIGATIONELEMENT: 'Hochbau',
    IFCOPENINGELEMENT: 'Hochbau',
    IFCPLATE: 'Hochbau',
    IFCRAIL: 'Hochbau',
    IFCRAILING: 'Hochbau',
    IFCRAMP: 'Hochbau',
    IFCRAMPFLIGHT: 'Hochbau',
    IFCROOF: 'Hochbau',
    IFCSHADINGDEVICE: 'Hochbau',
    IFCSLAB: 'Hochbau',
    IFCSTAIR: 'Hochbau',
    IFCSTAIRFLIGHT: 'Hochbau',
    IFCTRACKELEMENT: 'Hochbau',
    IFCWALL: 'Hochbau',
    IFCWINDOW: 'Hochbau',
    IFCRAILWAY: 'Infrastruktur / Bahn',
    IFCRAILWAYPART: 'Infrastruktur / Bahn',
    IFCBRIDGE: 'Infrastruktur / Brücke',
    IFCBRIDGEPART: 'Infrastruktur / Brücke',
    IFCDISTRIBUTIONCHAMBERELEMENT: 'Infrastruktur / Kanal',
    IFCPIPEFITTING: 'Infrastruktur / Kanal',
    IFCPIPESEGMENT: 'Infrastruktur / Kanal',
    IFCROAD: 'Infrastruktur / Straße',
    IFCROADPART: 'Infrastruktur / Straße',
    IFCDEEPFOUNDATION: 'Infrastruktur / Tiefbau',
    IFCEARTHWORKSELEMENT: 'Infrastruktur / Tiefbau',
    IFCPAVEMENT: 'Infrastruktur / Verkehr',
    IFCMARINEFACILITY: 'Infrastruktur / Wasserbau',
    IFCMARINEPART: 'Infrastruktur / Wasserbau',
    IFCEXTERNALSPATIALSTRUCTUREELEMENT: 'Raummodell',
    IFCSPATIALZONE: 'Raummodell',
    IFCBUILDING: 'Räumliche Struktur',
    IFCBUILDINGSTOREY: 'Räumliche Struktur',
    IFCFACILITYPARTCOMMON: 'Räumliche Struktur',
    IFCSITE: 'Räumliche Struktur',
    IFCSPACE: 'Räumliche Struktur',
    IFCCABLECARRIERSEGMENT: 'TGA / Elektro',
    IFCCABLESEGMENT: 'TGA / Elektro',
    IFCELECTRICAPPLIANCE: 'TGA / Elektro',
    IFCLIGHTFIXTURE: 'TGA / Elektro',
    IFCOUTLET: 'TGA / Elektro',
    IFCAUDIOVISUALAPPLIANCE: 'TGA / Endgerät',
    IFCCOMMUNICATIONSAPPLIANCE: 'TGA / Endgerät',
    IFCLAMP: 'TGA / Endgerät',
    IFCLIQUIDTERMINAL: 'TGA / Endgerät',
    IFCMOBILETELECOMMUNICATIONSAPPLIANCE: 'TGA / Endgerät',
    IFCSIGNAL: 'TGA / Endgerät',
    IFCSTACKTERMINAL: 'TGA / Endgerät',
    IFCENERGYCONVERSIONDEVICE: 'TGA / Energieumwandlung',
    IFCFLOWMOVINGDEVICE: 'TGA / Förderung',
    IFCDISTRIBUTIONCONTROLELEMENT: 'TGA / Gebäudeautomation',
    IFCAIRTERMINAL: 'TGA / HVAC',
    IFCDUCTSILENCER: 'TGA / HVAC',
    IFCSPACEHEATER: 'TGA / HVAC',
    IFCDUCTSEGMENT: 'TGA / Lüftung',
    IFCFILTER: 'TGA / Regelung',
    IFCFLOWCONTROLLER: 'TGA / Regelung',
    IFCFIRESUPPRESSIONTERMINAL: 'TGA / Sanitär',
    IFCINTERCEPTOR: 'TGA / Sanitär',
    IFCMEDICALDEVICE: 'TGA / Sanitär',
    IFCSANITARYTERMINAL: 'TGA / Sanitär',
    IFCWASTETERMINAL: 'TGA / Sanitär',
    IFCFLOWSTORAGEDEVICE: 'TGA / Speicher',
    IFCCABLECARRIERFITTING: 'TGA / Verbindung',
    IFCCABLEFITTING: 'TGA / Verbindung',
    IFCDUCTFITTING: 'TGA / Verbindung',
    IFCJUNCTIONBOX: 'TGA / Verbindung',
    IFCCONVEYORSEGMENT: 'TGA / Verteilung',
    IFCELECTRICFLOWTREATMENTDEVICE: 'TGA / Verteilung',
    IFCREINFORCINGELEMENT: 'Tragwerk / Bewehrung',
    IFCMECHANICALFASTENER: 'Tragwerk / Verbindung',

    // ── Abstrakte Zwischenklassen (alte Einträge, die keine Wurzel erklärt) ─
    IFCBUILTELEMENT: 'Hochbau',
    IFCDISTRIBUTIONELEMENT: 'TGA',
    IFCDISTRIBUTIONFLOWELEMENT: 'TGA / Verteilung',
    IFCELEMENT: 'Bauteil',
    IFCELEMENTCOMPONENT: 'Bauteil',
    IFCFACILITY: 'Räumliche Struktur',
    IFCFACILITYPART: 'Räumliche Struktur',
    IFCFEATUREELEMENT: 'Bauteil',
    IFCFEATUREELEMENTSUBTRACTION: 'Bauteil',
    IFCFLOWFITTING: 'TGA / Verbindung',
    IFCFLOWSEGMENT: 'TGA / Verteilung',
    IFCFLOWTERMINAL: 'TGA / Endgerät',
    IFCFLOWTREATMENTDEVICE: 'TGA / Verteilung',
    IFCSPATIALELEMENT: 'Raummodell',
    IFCSPATIALSTRUCTUREELEMENT: 'Räumliche Struktur',
});

/** Das Etikett der nächsten Stufe im Baum, die eines hat — sonst ''. */
export function fachbereichVon(hierarchy) {
    const kette = Array.isArray(hierarchy) ? hierarchy : [];
    for (let i = kette.length - 1; i >= 0; i--) {
        const f = FACHBEREICHE[String(kette[i]).toUpperCase()];
        if (f) return f;
    }
    return '';
}
