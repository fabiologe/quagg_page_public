# Abdeckung der Gewerke-Liste gegen Bezugslisten (Teil XXIX, 2026-10-04).
# Je Eintrag: Zuordnung in der NEUEN Liste (v2). v1 (Konzept vom 04.10. früh, 9 Gewerke) ergibt sich daraus.
# Sonderwerte: 'ZUSTAND' = Facette Bauzustand (temporär), 'MASSNAHME' = Facette Maßnahme (Neubau/Rückbau …),
#              'HOCHBAU' = Gebäude-TGA/Ausbau, ausserhalb des Auftrags, 'BAHN' = Erweiterung Gleisbau.
V2 = ['erdbau', 'entwaesserung', 'wasserbau', 'konstruktiv', 'verkehr', 'ausstattung', 'leitungen', 'ta', 'landschaft', 'baugrund']
V1 = {'erdbau', 'entwaesserung', 'konstruktiv', 'verkehr', 'ausstattung', 'leitungen', 'ta', 'landschaft', 'vermessung'}
V1_DA = {'Gelände/DGM'}   # stand in v1 unter „Vermessung & Bestand"
ALT = {'wasserbau': None, 'baugrund': None, 'ZUSTAND': None, 'MASSNAHME': None}   # v1 hatte dafür keinen Ort

STLK = {  # STLK-StB Leistungsbereiche (gelesen, Agent/NormRAG)
 '101 Baustelleneinrichtung': 'ZUSTAND', '102 Entsorgung (Abfälle der Baustelle)': 'MASSNAHME', '103 Bodenerkundung': 'baugrund',
 '104 Pflanzenlieferung': 'landschaft', '105 Verkehrssicherung': 'ZUSTAND', '106 Erdbau': 'erdbau', '107 Landschaftsbau': 'landschaft',
 '108 Baugruben, Leitungsgräben': 'erdbau', '109 Wasserhaltung': 'ZUSTAND', '110 Entwässerung für Straßen': 'entwaesserung',
 '111 Entwässerung für Ingenieurbauten': 'entwaesserung', '112 Schichten ohne Bindemittel': 'verkehr', '113 Asphaltbauweisen': 'verkehr',
 '114 Betonbauweisen': 'verkehr', '115 Pflaster, Platten, Einfassungen': 'verkehr', '116 Gerüste, Behelfsbrücken': 'ZUSTAND',
 '117 Verbau, Gründung': 'konstruktiv', '118 Kunstbauten Beton/Stahlbeton': 'konstruktiv', '119 Mauerwerk': 'konstruktiv',
 '120 Ingenieurbauten aus Stahl': 'konstruktiv', '121 Lager, Übergänge, Geländer': 'konstruktiv', '122 Korrosionsschutz': 'konstruktiv',
 '123 Dichtungsschichten, Fugen': 'konstruktiv', '124 Schutz/Instandsetzung Beton': 'konstruktiv', '125 Tunnelbau': 'konstruktiv',
 '127 Lärmschutz': 'ausstattung', '128 Zäune': 'ausstattung', '129 Fahrzeug-Rückhaltesysteme': 'ausstattung', '130 Verkehrsschilder': 'ausstattung',
 '131 Markierungen': 'verkehr', '132 Lichtsignalanlagen': 'ausstattung', '134 Kabel- und Leitungstechnik': 'leitungen',
}
STLB = {  # STLB-Bau, Tiefbau-relevant (gelesen, GAEB-Übersicht)
 '000 Baustelleneinrichtung': 'ZUSTAND', '002 Erdarbeiten': 'erdbau', '005 Brunnenbau': 'leitungen', '006 Spezialtiefbau': 'konstruktiv',
 '007 Untertagebau': 'konstruktiv', '008 Wasserhaltung': 'ZUSTAND', '009 Entwässerungskanalarbeiten': 'entwaesserung',
 '010 Drän- und Versickerarbeiten': 'entwaesserung', '011 Abscheider, Kleinkläranlagen': 'entwaesserung', '013 Betonarbeiten': 'konstruktiv',
 '017 Stahlbau': 'konstruktiv', '018 Abdichtung': 'konstruktiv', '043 Druckrohrleitungen': 'leitungen', '080 Straßen, Wege, Plätze': 'verkehr',
 '081 Betonerhaltung': 'konstruktiv', '084 Abbruch': 'MASSNAHME', '085 Rohrvortrieb': 'entwaesserung', '096 Bahnübergänge': 'BAHN', '097 Gleise, Weichen': 'BAHN',
}
HOAI = {  # §41, §45, §53 (gelesen, NormRAG)
 '§41-1 Wasserversorgung': 'leitungen', '§41-2 Abwasserentsorgung': 'entwaesserung', '§41-3 Wasserbau': 'wasserbau',
 '§41-4 Ver-/Entsorgung Gase, Feststoffe': 'leitungen', '§41-5 Abfallentsorgung': 'HOCHBAU', '§41-6 konstr. Ingenieurbauwerke Verkehr': 'konstruktiv',
 '§41-7 sonstige Einzelbauwerke': 'konstruktiv', '§45-1 Straßenverkehr': 'verkehr', '§45-2 Schienenverkehr': 'BAHN', '§45-3 Flugverkehr': 'verkehr',
 '§53-1 Abwasser-, Wasser-, Gasanlagen': 'ta', '§53-2 Wärme': 'HOCHBAU', '§53-3 Lufttechnik': 'HOCHBAU', '§53-4 Starkstrom': 'ta',
 '§53-5 Fernmelde, IT': 'ta', '§53-6 Förderanlagen': 'ta', '§53-7 nutzungsspezifische, verfahrenstechnische Anlagen': 'ta', '§53-8 Automation': 'ta',
}
BIMKLASSEN = {  # BIM-Klassen der Verkehrswege 2.0, Fachbereiche (gelesen, Agent)
 'Bahn': 'BAHN', 'Baugrund': 'baugrund', 'Straße/Entwässerung': 'verkehr', 'Brücke/Ingenieurbauwerk': 'konstruktiv', 'Tunnel': 'konstruktiv',
 'Wasserwege': 'wasserbau', 'Bestand': 'MASSNAHME',
}
IFC_BUILT = {  # IfcBuiltSystemTypeEnum (gelesen, Schema)
 'EROSIONPREVENTION': 'wasserbau', 'FENESTRATION': 'HOCHBAU', 'FOUNDATION': 'konstruktiv', 'LOADBEARING': 'konstruktiv', 'MOORING': 'wasserbau',
 'OUTERSHELL': 'HOCHBAU', 'PRESTRESSING': 'konstruktiv', 'RAILWAYLINE': 'BAHN', 'RAILWAYTRACK': 'BAHN', 'REINFORCING': 'konstruktiv',
 'SHADING': 'HOCHBAU', 'TRACKCIRCUIT': 'BAHN', 'TRANSPORT': 'verkehr',
}
IFC_DIST = {  # IfcDistributionSystemEnum (gelesen, Schema) — nur die für Infrastruktur sinnvollen eingeordnet, Gebäude-TGA = HOCHBAU
 'DRAINAGE': 'entwaesserung', 'RAINWATER': 'entwaesserung', 'STORMWATER': 'entwaesserung', 'SEWAGE': 'entwaesserung', 'WASTEWATER': 'entwaesserung',
 'DISPOSAL': 'entwaesserung', 'WATERSUPPLY': 'leitungen', 'GAS': 'leitungen', 'FUEL': 'leitungen', 'OIL': 'leitungen', 'ELECTRICAL': 'leitungen',
 'POWERGENERATION': 'ta', 'EARTHING': 'ta', 'LIGHTNINGPROTECTION': 'ta', 'LIGHTING': 'ta', 'COMMUNICATION': 'leitungen', 'DATA': 'leitungen',
 'FIXEDTRANSMISSIONNETWORK': 'leitungen', 'MOBILENETWORK': 'leitungen', 'TELEPHONE': 'leitungen', 'TV': 'leitungen', 'CONTROL': 'ta',
 'MONITORINGSYSTEM': 'ta', 'SECURITY': 'ta', 'SIGNAL': 'ausstattung', 'FIREPROTECTION': 'ta', 'HAZARDOUS': 'ta', 'CHEMICAL': 'ta',
 'MUNICIPALSOLIDWASTE': 'HOCHBAU', 'CATENARY_SYSTEM': 'BAHN', 'OVERHEAD_CONTACTLINE_SYSTEM': 'BAHN', 'RETURN_CIRCUIT': 'BAHN',
 'OPERATIONAL': 'ta', 'OPERATIONALTELEPHONYSYSTEM': 'ta', 'CONVEYING': 'ta', 'COMPRESSEDAIR': 'ta', 'VACUUM': 'ta',
 'AIRCONDITIONING': 'HOCHBAU', 'AUDIOVISUAL': 'HOCHBAU', 'CHILLEDWATER': 'HOCHBAU', 'CONDENSERWATER': 'HOCHBAU', 'DOMESTICCOLDWATER': 'HOCHBAU',
 'DOMESTICHOTWATER': 'HOCHBAU', 'ELECTROACOUSTIC': 'HOCHBAU', 'EXHAUST': 'HOCHBAU', 'HEATING': 'leitungen', 'REFRIGERATION': 'HOCHBAU',
 'VENT': 'HOCHBAU', 'VENTILATION': 'HOCHBAU',
}
UNICLASS_EF = {  # Uniclass 2015 EF (gelesen, CSV) — Hochbau-Ausbau = HOCHBAU
 'EF_15_10 Groundworks and earthworks': 'erdbau', 'EF_15_30 Remediation, repair and renovation': 'MASSNAHME', 'EF_20_05 Substructure': 'konstruktiv',
 'EF_20_10 Superstructure': 'konstruktiv', 'EF_20_50 Bridge structures': 'konstruktiv', 'EF_25_10 Walls': 'konstruktiv', 'EF_25_30 Doors and windows': 'HOCHBAU',
 'EF_25_55 Barriers': 'ausstattung', 'EF_30_10 Roofs': 'HOCHBAU', 'EF_30_20 Floors': 'konstruktiv', 'EF_30_25 Ceilings and soffits': 'HOCHBAU',
 'EF_30_30 Decks': 'konstruktiv', 'EF_30_60 Pavements': 'verkehr', 'EF_35_10 Stairs': 'konstruktiv', 'EF_35_20 Ramps': 'konstruktiv',
 'EF_37_16 Vessels and trenches': 'konstruktiv', 'EF_37_17 Towers, chimneys and masts': 'konstruktiv', 'EF_37_50 Tunnels and shafts': 'konstruktiv',
 'EF_40_10 Signage': 'ausstattung', 'EF_40_20 Fittings': 'ausstattung', 'EF_40_30 Furnishings': 'ausstattung', 'EF_40_40 Equipment': 'ta',
 'EF_45_03 Aquatic fauna elements': 'landschaft', 'EF_45_05 Aquatic flora elements': 'landschaft', 'EF_45_20 Grass and meadow elements': 'landschaft',
 'EF_45_45 Land fauna elements': 'landschaft', 'EF_45_90 Tree, shrub and herbaceous plant elements': 'landschaft',
 'EF_50_10 Gas waste collection': 'HOCHBAU', 'EF_50_20 Wet waste collection': 'entwaesserung', 'EF_50_30 Above-ground drainage collection': 'entwaesserung',
 'EF_50_35 Below-ground drainage collection': 'entwaesserung', 'EF_50_40 Dry waste collection': 'HOCHBAU', 'EF_50_50 Gas waste treatment and disposal': 'HOCHBAU',
 'EF_50_60 Wet waste treatment and disposal': 'entwaesserung', 'EF_50_70 Drainage treatment and disposal': 'entwaesserung',
 'EF_50_75 Wastewater treatment and disposal': 'entwaesserung', 'EF_50_80 Dry waste treatment and disposal': 'HOCHBAU',
 'EF_55_05 Gas extraction and treatment': 'leitungen', 'EF_55_10 Liquid fuel extraction and treatment': 'leitungen', 'EF_55_15 Water extraction and treatment': 'leitungen',
 'EF_55_20 Gas supply': 'leitungen', 'EF_55_30 Fire-extinguishing supply': 'leitungen', 'EF_55_40 Steam supply': 'leitungen', 'EF_55_50 Liquid fuel distribution supply': 'leitungen',
 'EF_55_60 Process liquid supply': 'leitungen', 'EF_55_70 Water supply': 'leitungen', 'EF_55_90 Piped solids supply': 'leitungen',
 'EF_60_30 Rail and paving heating': 'ta', 'EF_60_40 Space heating and cooling': 'HOCHBAU', 'EF_60_60 Refrigeration': 'HOCHBAU', 'EF_60_80 Drying': 'HOCHBAU',
 'EF_65_40 Ventilation': 'ta', 'EF_65_80 Air conditioning': 'HOCHBAU', 'EF_70_10 Electrical power generation': 'ta',
 'EF_70_30 Electricity distribution and transmission': 'leitungen', 'EF_70_80 Lighting': 'ta', 'EF_75_10 Communication': 'leitungen', 'EF_75_30 Signalling': 'ausstattung',
 'EF_75_40 Security': 'ta', 'EF_75_50 Safety and protection': 'ta', 'EF_75_60 Environmental safety': 'ta', 'EF_75_70 Control and management': 'ta',
 'EF_75_80 Protection': 'ta', 'EF_80_10 Cable transport': 'HOCHBAU', 'EF_80_20 Conveyors': 'ta', 'EF_80_30 Cranes and hoists': 'ta', 'EF_80_50 Lifts': 'HOCHBAU',
 'EF_80_70 Rail tracks': 'BAHN',
}
OBJEKTE = {  # typische Objekte aus Fabios Nachricht und den Szenarien P1–P11 (eingeschätzt)
 'Kanalschacht': 'entwaesserung', 'Haltung': 'entwaesserung', 'Regenüberlaufbecken (Bauteile)': 'konstruktiv', 'Rechen, Drossel, Schwelle': 'entwaesserung',
 'Retentionsteich: Mulde': 'erdbau', 'Retentionsteich: Abdichtung': 'wasserbau', 'Retentionsteich: Ufer-/Sohlsicherung': 'wasserbau',
 'Retentionsteich: Ein-/Auslaufbauwerk': 'wasserbau', 'Retentionsteich: Notüberlauf': 'wasserbau', 'Retentionsteich: Bepflanzung': 'landschaft',
 'Retentionsteich: Wartungsweg': 'verkehr', 'Retentionsteich: Zaun': 'ausstattung', 'Durchlass/Düker': 'wasserbau', 'Gewässerprofil': 'wasserbau',
 'Deich/Hochwasserschutzwand': 'wasserbau', 'Sanitär-/Trinkwasserleitung': 'leitungen', 'Hausanschluss': 'entwaesserung', 'Kabel/Leerrohr': 'leitungen',
 'Straße: Fahrbahn': 'verkehr', 'Bordstein': 'verkehr', 'Straßenablauf': 'entwaesserung', 'Mulde/Rigole': 'entwaesserung', 'Schutzplanke': 'ausstattung',
 'Brücke: Überbau': 'konstruktiv', 'Brücke: Kappe': 'konstruktiv', 'Brücke: Lager': 'konstruktiv', 'Straßenbeleuchtung': 'ta', 'Pumpwerk: Pumpe': 'ta',
 'Stützwand': 'konstruktiv', 'Baugrube mit Verbau (Bauzustand)': 'ZUSTAND', 'Bohrung/Bodenschicht': 'baugrund', 'Bestandsleitung': 'MASSNAHME',
 'Gelände/DGM': 'baugrund', 'Lärmschutzwand': 'ausstattung',
}
LISTEN = {'STLK-StB': STLK, 'STLB-Bau (Tiefbau)': STLB, 'HOAI §41/45/53': HOAI, 'BIM-Klassen Verkehrswege 2.0': BIMKLASSEN,
          'IfcBuiltSystem': IFC_BUILT, 'IfcDistributionSystem': IFC_DIST, 'Uniclass EF': UNICLASS_EF, 'Objekte P1–P11': OBJEKTE}
ok = set(V2) | {'ZUSTAND', 'MASSNAHME', 'HOCHBAU', 'BAHN'}
for name, liste in LISTEN.items():
    assert all(v in ok for v in liste.values()), [k for k, v in liste.items() if v not in ok]
def v1(z): return ALT.get(z, z if z in V1 else ('verm' if z == 'baugrund' else z))
zeilen = []
gesamt = {'n': 0, 'infra': 0, 'v1_luecke': 0, 'v2_luecke': 0}
for name, liste in LISTEN.items():
    infra = {k: v for k, v in liste.items() if v != 'HOCHBAU'}
    l1 = [k for k, v in infra.items() if (ALT.get(v, 'x') is None or v == 'BAHN') and k not in V1_DA]
    l2 = [k for k, v in infra.items() if v == 'BAHN']
    je = {g: sum(1 for v in infra.values() if v == g) for g in V2 + ['ZUSTAND', 'MASSNAHME', 'BAHN']}
    zeilen.append((name, len(liste), len(infra), len(l1), len(l2), je, l1))
    for k, w in (('n', len(liste)), ('infra', len(infra)), ('v1_luecke', len(l1)), ('v2_luecke', len(l2))): gesamt[k] += w
for z in zeilen:
    print(f"{z[0]}: {z[1]} Einträge, {z[2]} Infrastruktur; ohne Ort in v1: {z[3]}; in v2: {z[4]}")
    print('   je Gewerk v2:', {k: v for k, v in z[5].items() if v})
    print('   v1-Lücken:', '; '.join(z[6]))
print('GESAMT', gesamt)
leer = [g for g in V2 if not any(v == g for l in LISTEN.values() for v in l.values())]
print('Gewerke ohne Treffer:', leer)
