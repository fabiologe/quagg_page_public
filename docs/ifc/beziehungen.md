# Genutzte Beziehungen und Merkmalsätze

> Erzeugt von `backend/app/ifc/diagramme.py` aus dem Code und dem Schema-Schnappschuss (IFC4X3_ADD2, ifcopenshell 0.8.5). Nicht von Hand ändern — neu schreiben mit `cd backend && python3 -m app.ifc.diagramme`.

Sechseck: eine Beziehung, die die CDE schreibt. Pfeil hinein: das `Relating…`-Ende, Pfeil hinaus: das `Related…`-Ende. Gestrichelt: ein Auswahl-Typ (SELECT) statt einer Klasse.

```mermaid
flowchart LR
  IfcRelAggregates{{IfcRelAggregates}}
  IfcObjectDefinition -->|"RelatingObject"| IfcRelAggregates
  IfcRelAggregates -->|"RelatedObjects (Menge)"| IfcObjectDefinition
  IfcRelAssignsToGroup{{IfcRelAssignsToGroup}}
  IfcRelAssignsToGroup -->|"RelatedObjects (Menge)"| IfcObjectDefinition
  IfcGroup -->|"RelatingGroup"| IfcRelAssignsToGroup
  IfcRelAssociatesClassification{{IfcRelAssociatesClassification}}
  IfcRelAssociatesClassification -->|"RelatedObjects (Menge)"| IfcDefinitionSelect
  IfcClassificationSelect -->|"RelatingClassification"| IfcRelAssociatesClassification
  IfcRelAssociatesDocument{{IfcRelAssociatesDocument}}
  IfcRelAssociatesDocument -->|"RelatedObjects (Menge)"| IfcDefinitionSelect
  IfcDocumentSelect -->|"RelatingDocument"| IfcRelAssociatesDocument
  IfcRelContainedInSpatialStructure{{IfcRelContainedInSpatialStructure}}
  IfcRelContainedInSpatialStructure -->|"RelatedElements (Menge)"| IfcProduct
  IfcSpatialElement -->|"RelatingStructure"| IfcRelContainedInSpatialStructure
  IfcRelDeclares{{IfcRelDeclares}}
  IfcContext -->|"RelatingContext"| IfcRelDeclares
  IfcRelDeclares -->|"RelatedDefinitions (Menge)"| IfcDefinitionSelect
  IfcRelDefinesByProperties{{IfcRelDefinesByProperties}}
  IfcRelDefinesByProperties -->|"RelatedObjects (Menge)"| IfcObjectDefinition
  IfcPropertySetDefinitionSelect -->|"RelatingPropertyDefinition"| IfcRelDefinesByProperties
  IfcRelDefinesByType{{IfcRelDefinesByType}}
  IfcRelDefinesByType -->|"RelatedObjects (Menge)"| IfcObject
  IfcTypeObject -->|"RelatingType"| IfcRelDefinesByType
  IfcRelServicesBuildings{{IfcRelServicesBuildings}}
  IfcSystem -->|"RelatingSystem"| IfcRelServicesBuildings
  IfcRelServicesBuildings -->|"RelatedBuildings (Menge)"| IfcSpatialElement
  IfcRelVoidsElement{{IfcRelVoidsElement}}
  IfcElement -->|"RelatingBuildingElement"| IfcRelVoidsElement
  IfcRelVoidsElement -->|"RelatedOpeningElement"| IfcFeatureElementSubtraction
  style IfcClassificationSelect stroke-dasharray: 4 3
  style IfcDefinitionSelect stroke-dasharray: 4 3
  style IfcDocumentSelect stroke-dasharray: 4 3
  style IfcPropertySetDefinitionSelect stroke-dasharray: 4 3
```

## Quagg_*-Merkmalsätze

Eigene Merkmalsätze der CDE — kein bSI-Standard. Wo sie geschrieben oder gelesen werden:

| Merkmalsatz | Fundstellen |
|---|---|
| `Quagg_CDE` | `backend/app/ifc/eigenbau.py`, `backend/app/ifc/herkunft.py`, `backend/app/ifc/schema.py`, `client/src/features/cde/services/IdsXml.js`, `client/src/features/cde/services/bimfy/muster/Herleitung.js` |
| `Quagg_Drossel` | `client/src/features/cde/services/rezept/Eingebaut.js` |
| `Quagg_Entlastung` | `client/src/features/cde/services/katalog/Merkmalsziele.js`, `client/src/features/cde/services/rezept/Eingebaut.js` |
| `Quagg_Fachmodell` | `backend/app/ifc/herkunft.py`, `backend/app/ifc/schema.py`, `backend/app/ifc/verbund.py` |
| `Quagg_Georeferenz` | `backend/app/ifc/schema.py`, `backend/app/ifc/verbund.py` |
| `Quagg_Herkunft` | `backend/app/ifc/__init__.py`, `backend/app/ifc/eigenbau.py`, `backend/app/ifc/herkunft.py`, `backend/app/ifc/schema.py`, `backend/app/ifc/verbund.py` |
| `Quagg_Rechen` | `client/src/features/cde/services/katalog/Merkmalsziele.js`, `client/src/features/cde/services/rezept/Eingebaut.js` |
| `Quagg_Speicherraum` | `client/src/features/cde/services/rezept/Eingebaut.js` |
| `Quagg_Versickerung` | `client/src/features/cde/services/rezept/Eingebaut.js` |
| `Quagg_Vorgang` | `backend/app/ifc/eigenbau.py`, `backend/app/ifc/schema.py` |
