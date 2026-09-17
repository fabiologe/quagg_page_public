# Genutzte IFC-Klassen

> Erzeugt von `backend/app/ifc/diagramme.py` aus dem Code und dem Schema-Schnappschuss (IFC4X3_ADD2, ifcopenshell 0.8.5). Nicht von Hand ändern — neu schreiben mit `cd backend && python3 -m app.ifc.diagramme`.

Grün: Klassen, die die CDE schreibt oder liest — wer, steht in der Tabelle. Die übrigen Knoten sind die Obertypen dazwischen; `<<abstract>>` lässt sich nicht instanziieren.

## Bauteile, Räume, Gelände (unter IfcProduct)

An welchen Ästen die genutzten Klassen hängen — darunter je Ast sein Baum. Ein Ast, der selbst die einzige genutzte Klasse ist, steht nur hier.

```mermaid
classDiagram
  direction LR
  IfcElement <|-- IfcBuiltElement
  IfcElement <|-- IfcCivilElement
  IfcElement <|-- IfcDistributionElement
  IfcElement <|-- IfcElectricalElement
  IfcElement <|-- IfcElementComponent
  IfcElement <|-- IfcEquipmentElement
  IfcElement <|-- IfcFeatureElement
  IfcElement <|-- IfcFurnishingElement
  IfcElement <|-- IfcGeographicElement
  IfcElement <|-- IfcGeotechnicalElement
  IfcElement <|-- IfcTransportationDevice
  IfcElement <|-- IfcVirtualElement
  IfcObject <|-- IfcProduct
  IfcObjectDefinition <|-- IfcObject
  IfcProduct <|-- IfcAnnotation
  IfcProduct <|-- IfcElement
  IfcProduct <|-- IfcLinearElement
  IfcProduct <|-- IfcPort
  IfcProduct <|-- IfcPositioningElement
  IfcProduct <|-- IfcProxy
  IfcProduct <|-- IfcSpatialElement
  IfcRoot <|-- IfcObjectDefinition
  <<abstract>> IfcElement
  <<abstract>> IfcElementComponent
  <<abstract>> IfcFeatureElement
  <<abstract>> IfcGeotechnicalElement
  <<abstract>> IfcObject
  <<abstract>> IfcObjectDefinition
  <<abstract>> IfcPort
  <<abstract>> IfcPositioningElement
  <<abstract>> IfcProduct
  <<abstract>> IfcRoot
  <<abstract>> IfcSpatialElement
  <<abstract>> IfcTransportationDevice
  style IfcAnnotation fill:#dcedc8,stroke:#558b2f
  style IfcBuiltElement fill:#dcedc8,stroke:#558b2f
  style IfcCivilElement fill:#dcedc8,stroke:#558b2f
  style IfcElectricalElement fill:#dcedc8,stroke:#558b2f
  style IfcElementComponent fill:#dcedc8,stroke:#558b2f
  style IfcEquipmentElement fill:#dcedc8,stroke:#558b2f
  style IfcFeatureElement fill:#dcedc8,stroke:#558b2f
  style IfcFurnishingElement fill:#dcedc8,stroke:#558b2f
  style IfcGeographicElement fill:#dcedc8,stroke:#558b2f
  style IfcGeotechnicalElement fill:#dcedc8,stroke:#558b2f
  style IfcLinearElement fill:#dcedc8,stroke:#558b2f
  style IfcProduct fill:#dcedc8,stroke:#558b2f
  style IfcProxy fill:#dcedc8,stroke:#558b2f
  style IfcRoot fill:#dcedc8,stroke:#558b2f
  style IfcSpatialElement fill:#dcedc8,stroke:#558b2f
  style IfcTransportationDevice fill:#dcedc8,stroke:#558b2f
  style IfcVirtualElement fill:#dcedc8,stroke:#558b2f
```

### IfcBuiltElement — 23 genutzt

```mermaid
classDiagram
  direction LR
  IfcBuiltElement <|-- IfcBeam
  IfcBuiltElement <|-- IfcBuildingElementProxy
  IfcBuiltElement <|-- IfcColumn
  IfcBuiltElement <|-- IfcCourse
  IfcBuiltElement <|-- IfcCovering
  IfcBuiltElement <|-- IfcCurtainWall
  IfcBuiltElement <|-- IfcDeepFoundation
  IfcBuiltElement <|-- IfcDoor
  IfcBuiltElement <|-- IfcEarthworksElement
  IfcBuiltElement <|-- IfcKerb
  IfcBuiltElement <|-- IfcMember
  IfcBuiltElement <|-- IfcNavigationElement
  IfcBuiltElement <|-- IfcPavement
  IfcBuiltElement <|-- IfcPlate
  IfcBuiltElement <|-- IfcRail
  IfcBuiltElement <|-- IfcRailing
  IfcBuiltElement <|-- IfcRoof
  IfcBuiltElement <|-- IfcShadingDevice
  IfcBuiltElement <|-- IfcSlab
  IfcBuiltElement <|-- IfcWall
  IfcBuiltElement <|-- IfcWindow
  IfcDeepFoundation <|-- IfcPile
  IfcEarthworksElement <|-- IfcEarthworksFill
  style IfcBeam fill:#dcedc8,stroke:#558b2f
  style IfcBuildingElementProxy fill:#dcedc8,stroke:#558b2f
  style IfcBuiltElement fill:#dcedc8,stroke:#558b2f
  style IfcColumn fill:#dcedc8,stroke:#558b2f
  style IfcCourse fill:#dcedc8,stroke:#558b2f
  style IfcCovering fill:#dcedc8,stroke:#558b2f
  style IfcCurtainWall fill:#dcedc8,stroke:#558b2f
  style IfcDoor fill:#dcedc8,stroke:#558b2f
  style IfcEarthworksElement fill:#dcedc8,stroke:#558b2f
  style IfcEarthworksFill fill:#dcedc8,stroke:#558b2f
  style IfcKerb fill:#dcedc8,stroke:#558b2f
  style IfcMember fill:#dcedc8,stroke:#558b2f
  style IfcNavigationElement fill:#dcedc8,stroke:#558b2f
  style IfcPavement fill:#dcedc8,stroke:#558b2f
  style IfcPile fill:#dcedc8,stroke:#558b2f
  style IfcPlate fill:#dcedc8,stroke:#558b2f
  style IfcRail fill:#dcedc8,stroke:#558b2f
  style IfcRailing fill:#dcedc8,stroke:#558b2f
  style IfcRoof fill:#dcedc8,stroke:#558b2f
  style IfcShadingDevice fill:#dcedc8,stroke:#558b2f
  style IfcSlab fill:#dcedc8,stroke:#558b2f
  style IfcWall fill:#dcedc8,stroke:#558b2f
  style IfcWindow fill:#dcedc8,stroke:#558b2f
```

### IfcDistributionElement — 13 genutzt

```mermaid
classDiagram
  direction LR
  IfcDistributionElement <|-- IfcDistributionControlElement
  IfcDistributionElement <|-- IfcDistributionFlowElement
  IfcDistributionFlowElement <|-- IfcDistributionChamberElement
  IfcDistributionFlowElement <|-- IfcFlowController
  IfcDistributionFlowElement <|-- IfcFlowFitting
  IfcDistributionFlowElement <|-- IfcFlowMovingDevice
  IfcDistributionFlowElement <|-- IfcFlowSegment
  IfcDistributionFlowElement <|-- IfcFlowStorageDevice
  IfcDistributionFlowElement <|-- IfcFlowTerminal
  IfcDistributionFlowElement <|-- IfcFlowTreatmentDevice
  IfcFlowController <|-- IfcElectricDistributionPoint
  IfcFlowController <|-- IfcValve
  IfcFlowMovingDevice <|-- IfcPump
  IfcFlowSegment <|-- IfcCableCarrierSegment
  IfcFlowSegment <|-- IfcPipeSegment
  IfcFlowStorageDevice <|-- IfcTank
  IfcFlowTerminal <|-- IfcSignal
  style IfcCableCarrierSegment fill:#dcedc8,stroke:#558b2f
  style IfcDistributionChamberElement fill:#dcedc8,stroke:#558b2f
  style IfcDistributionControlElement fill:#dcedc8,stroke:#558b2f
  style IfcDistributionFlowElement fill:#dcedc8,stroke:#558b2f
  style IfcElectricDistributionPoint fill:#dcedc8,stroke:#558b2f
  style IfcFlowFitting fill:#dcedc8,stroke:#558b2f
  style IfcFlowSegment fill:#dcedc8,stroke:#558b2f
  style IfcFlowTreatmentDevice fill:#dcedc8,stroke:#558b2f
  style IfcPipeSegment fill:#dcedc8,stroke:#558b2f
  style IfcPump fill:#dcedc8,stroke:#558b2f
  style IfcSignal fill:#dcedc8,stroke:#558b2f
  style IfcTank fill:#dcedc8,stroke:#558b2f
  style IfcValve fill:#dcedc8,stroke:#558b2f
```

### IfcElementComponent — 5 genutzt

```mermaid
classDiagram
  direction LR
  IfcElementComponent <|-- IfcReinforcingElement
  IfcElementComponent <|-- IfcSign
  IfcReinforcingElement <|-- IfcReinforcingBar
  IfcReinforcingElement <|-- IfcReinforcingMesh
  IfcReinforcingElement <|-- IfcTendon
  <<abstract>> IfcElementComponent
  <<abstract>> IfcReinforcingElement
  style IfcElementComponent fill:#dcedc8,stroke:#558b2f
  style IfcReinforcingBar fill:#dcedc8,stroke:#558b2f
  style IfcReinforcingMesh fill:#dcedc8,stroke:#558b2f
  style IfcSign fill:#dcedc8,stroke:#558b2f
  style IfcTendon fill:#dcedc8,stroke:#558b2f
```

### IfcFeatureElement — 4 genutzt

```mermaid
classDiagram
  direction LR
  IfcFeatureElement <|-- IfcFeatureElementSubtraction
  IfcFeatureElement <|-- IfcSurfaceFeature
  IfcFeatureElementSubtraction <|-- IfcEarthworksCut
  <<abstract>> IfcFeatureElement
  <<abstract>> IfcFeatureElementSubtraction
  style IfcEarthworksCut fill:#dcedc8,stroke:#558b2f
  style IfcFeatureElement fill:#dcedc8,stroke:#558b2f
  style IfcFeatureElementSubtraction fill:#dcedc8,stroke:#558b2f
  style IfcSurfaceFeature fill:#dcedc8,stroke:#558b2f
```

### IfcGeotechnicalElement — 3 genutzt

```mermaid
classDiagram
  direction LR
  IfcGeotechnicalAssembly <|-- IfcBorehole
  IfcGeotechnicalAssembly <|-- IfcGeoslice
  IfcGeotechnicalElement <|-- IfcGeotechnicalAssembly
  <<abstract>> IfcGeotechnicalAssembly
  <<abstract>> IfcGeotechnicalElement
  style IfcBorehole fill:#dcedc8,stroke:#558b2f
  style IfcGeoslice fill:#dcedc8,stroke:#558b2f
  style IfcGeotechnicalElement fill:#dcedc8,stroke:#558b2f
```

### IfcPort — 1 genutzt

```mermaid
classDiagram
  direction LR
  IfcPort <|-- IfcDistributionPort
  <<abstract>> IfcPort
  style IfcDistributionPort fill:#dcedc8,stroke:#558b2f
```

### IfcPositioningElement — 4 genutzt

```mermaid
classDiagram
  direction LR
  IfcLinearPositioningElement <|-- IfcAlignment
  IfcPositioningElement <|-- IfcGrid
  IfcPositioningElement <|-- IfcLinearPositioningElement
  IfcPositioningElement <|-- IfcReferent
  <<abstract>> IfcPositioningElement
  style IfcAlignment fill:#dcedc8,stroke:#558b2f
  style IfcGrid fill:#dcedc8,stroke:#558b2f
  style IfcLinearPositioningElement fill:#dcedc8,stroke:#558b2f
  style IfcReferent fill:#dcedc8,stroke:#558b2f
```

### IfcSpatialElement — 4 genutzt

```mermaid
classDiagram
  direction LR
  IfcSpatialElement <|-- IfcSpatialStructureElement
  IfcSpatialStructureElement <|-- IfcSite
  IfcSpatialStructureElement <|-- IfcSpace
  <<abstract>> IfcSpatialElement
  <<abstract>> IfcSpatialStructureElement
  style IfcSite fill:#dcedc8,stroke:#558b2f
  style IfcSpace fill:#dcedc8,stroke:#558b2f
  style IfcSpatialElement fill:#dcedc8,stroke:#558b2f
  style IfcSpatialStructureElement fill:#dcedc8,stroke:#558b2f
```

## Projekt, Gruppen, Merkmalsätze

```mermaid
classDiagram
  direction LR
  IfcContext <|-- IfcProject
  IfcObject <|-- IfcGroup
  IfcObjectDefinition <|-- IfcContext
  IfcObjectDefinition <|-- IfcObject
  IfcPropertyDefinition <|-- IfcPropertySetDefinition
  IfcPropertySetDefinition <|-- IfcPropertySet
  IfcPropertySetDefinition <|-- IfcQuantitySet
  IfcQuantitySet <|-- IfcElementQuantity
  IfcRoot <|-- IfcObjectDefinition
  IfcRoot <|-- IfcPropertyDefinition
  <<abstract>> IfcContext
  <<abstract>> IfcObject
  <<abstract>> IfcObjectDefinition
  <<abstract>> IfcPropertyDefinition
  <<abstract>> IfcPropertySetDefinition
  <<abstract>> IfcQuantitySet
  <<abstract>> IfcRoot
  style IfcElementQuantity fill:#dcedc8,stroke:#558b2f
  style IfcGroup fill:#dcedc8,stroke:#558b2f
  style IfcProject fill:#dcedc8,stroke:#558b2f
  style IfcPropertySet fill:#dcedc8,stroke:#558b2f
  style IfcRoot fill:#dcedc8,stroke:#558b2f
```

Die Beziehungen stehen mit ihren Enden in [beziehungen.md](beziehungen.md).

## Alle genutzten Klassen unter IfcRoot

| Klasse | genutzt von | abstrakt | Schema |
|---|---|---|---|
| [IfcAlignment](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcAlignment.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcAnnotation](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcAnnotation.htm) | Bauteilrezepte, Eigenbau, Typprofile | nein | IFC4X3_ADD2 |
| [IfcBeam](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcBeam.htm) | Kategorien, Typprofile | nein | IFC4X3_ADD2 |
| [IfcBorehole](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcBorehole.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcBuildingElementProxy](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcBuildingElementProxy.htm) | Bauteilrezepte, Typprofile | nein | IFC4X3_ADD2 |
| [IfcBuiltElement](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcBuiltElement.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcCableCarrierSegment](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcCableCarrierSegment.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcCivilElement](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcCivilElement.htm) | Gelände, Typprofile | nein | IFC4X3_ADD2 (abgekündigt) |
| [IfcColumn](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcColumn.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcCourse](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcCourse.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcCovering](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcCovering.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcCurtainWall](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcCurtainWall.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcDistributionChamberElement](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcDistributionChamberElement.htm) | Bauteilrezepte, Kategorien, Typprofile | nein | IFC4X3_ADD2 |
| [IfcDistributionControlElement](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcDistributionControlElement.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcDistributionFlowElement](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcDistributionFlowElement.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcDistributionPort](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcDistributionPort.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcDoor](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcDoor.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcEarthworksCut](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcEarthworksCut.htm) | Eigenbau-Paket, Kategorien, Typprofile | nein | IFC4X3_ADD2 |
| [IfcEarthworksElement](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcEarthworksElement.htm) | Gelände, Typprofile | nein | IFC4X3_ADD2 |
| [IfcEarthworksFill](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcEarthworksFill.htm) | Eigenbau-Paket, Gelände, Typprofile | nein | IFC4X3_ADD2 |
| [IfcElectricDistributionPoint](https://standards.buildingsmart.org/IFC/RELEASE/IFC2x3/TC1/HTML/ifcelectricaldomain/lexical/ifcelectricdistributionpoint.htm) | Typprofile | nein | nur IFC2X3 |
| [IfcElectricalElement](https://standards.buildingsmart.org/IFC/RELEASE/IFC2x3/TC1/HTML/ifcproductextension/lexical/ifcelectricalelement.htm) | Typprofile | nein | nur IFC2X3 |
| [IfcElementComponent](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcElementComponent.htm) | Typprofile | ja | IFC4X3_ADD2 |
| [IfcElementQuantity](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcElementQuantity.htm) | Eigenbau | nein | IFC4X3_ADD2 |
| [IfcEquipmentElement](https://standards.buildingsmart.org/IFC/RELEASE/IFC2x3/TC1/HTML/ifcproductextension/lexical/ifcequipmentelement.htm) | Typprofile | nein | nur IFC2X3 |
| [IfcFeatureElement](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcFeatureElement.htm) | Eigenbau, Typprofile | ja | IFC4X3_ADD2 |
| [IfcFeatureElementSubtraction](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcFeatureElementSubtraction.htm) | Eigenbau | ja | IFC4X3_ADD2 |
| [IfcFlowFitting](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcFlowFitting.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcFlowSegment](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcFlowSegment.htm) | Kategorien, Typprofile | nein | IFC4X3_ADD2 |
| [IfcFlowTreatmentDevice](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcFlowTreatmentDevice.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcFurnishingElement](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcFurnishingElement.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcGeographicElement](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcGeographicElement.htm) | Bauteilrezepte, Gelände, Typprofile | nein | IFC4X3_ADD2 |
| [IfcGeoslice](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcGeoslice.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcGeotechnicalElement](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcGeotechnicalElement.htm) | Typprofile | ja | IFC4X3_ADD2 |
| [IfcGrid](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcGrid.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcGroup](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcGroup.htm) | Eigenbau, Verbund | nein | IFC4X3_ADD2 |
| [IfcKerb](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcKerb.htm) | Kategorien, Typprofile | nein | IFC4X3_ADD2 |
| [IfcLinearElement](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcLinearElement.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcLinearPositioningElement](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcLinearPositioningElement.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcMember](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcMember.htm) | Kategorien, Typprofile | nein | IFC4X3_ADD2 |
| [IfcNavigationElement](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcNavigationElement.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcPavement](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcPavement.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcPile](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcPile.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcPipeSegment](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcPipeSegment.htm) | Bauteilrezepte, Typprofile | nein | IFC4X3_ADD2 |
| [IfcPlate](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcPlate.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcProduct](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcProduct.htm) | Verbund | ja | IFC4X3_ADD2 |
| [IfcProject](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcProject.htm) | Verbund | nein | IFC4X3_ADD2 |
| [IfcPropertySet](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcPropertySet.htm) | Eigenbau, Herkunft, Verbund | nein | IFC4X3_ADD2 |
| [IfcProxy](https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2_TC1/HTML/schema/ifckernel/lexical/ifcproxy.htm) | Typprofile | nein | nur IFC2X3, IFC4 |
| [IfcPump](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcPump.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcRail](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcRail.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcRailing](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcRailing.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcReferent](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcReferent.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcReinforcingBar](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcReinforcingBar.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcReinforcingMesh](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcReinforcingMesh.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcRelAggregates](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcRelAggregates.htm) | Verbund | nein | IFC4X3_ADD2 |
| [IfcRelAssignsToGroup](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcRelAssignsToGroup.htm) | Eigenbau, Verbund | nein | IFC4X3_ADD2 |
| [IfcRelAssociatesDocument](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcRelAssociatesDocument.htm) | Herkunft | nein | IFC4X3_ADD2 |
| [IfcRelContainedInSpatialStructure](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcRelContainedInSpatialStructure.htm) | Eigenbau | nein | IFC4X3_ADD2 |
| [IfcRelDefinesByProperties](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcRelDefinesByProperties.htm) | Eigenbau, Herkunft, Verbund | nein | IFC4X3_ADD2 |
| [IfcRelVoidsElement](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcRelVoidsElement.htm) | Eigenbau | nein | IFC4X3_ADD2 |
| [IfcRelationship](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcRelationship.htm) | Verbund | ja | IFC4X3_ADD2 |
| [IfcRoof](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcRoof.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcRoot](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcRoot.htm) | Verbund | ja | IFC4X3_ADD2 |
| [IfcShadingDevice](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcShadingDevice.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcSign](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcSign.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcSignal](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcSignal.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcSite](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcSite.htm) | Verbund | nein | IFC4X3_ADD2 |
| [IfcSlab](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcSlab.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcSpace](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcSpace.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcSpatialElement](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcSpatialElement.htm) | Verbund | ja | IFC4X3_ADD2 |
| [IfcSpatialStructureElement](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcSpatialStructureElement.htm) | Verbund | ja | IFC4X3_ADD2 |
| [IfcSurfaceFeature](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcSurfaceFeature.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcTank](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcTank.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcTendon](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcTendon.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcTransportationDevice](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcTransportationDevice.htm) | Typprofile | ja | IFC4X3_ADD2 |
| [IfcValve](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcValve.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcVirtualElement](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcVirtualElement.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcWall](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcWall.htm) | Typprofile | nein | IFC4X3_ADD2 |
| [IfcWindow](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcWindow.htm) | Typprofile | nein | IFC4X3_ADD2 |

## Ressourcen (nicht unter IfcRoot)

Geometrie, Einheiten, Werte, Stile — ohne GlobalId, deshalb nicht im Baum oben.

| Klasse | genutzt von |
|---|---|
| IfcApplication | Verbund |
| IfcAxis2Placement3D | Eigenbau, Verbund |
| IfcCartesianPoint | Eigenbau, Verbund |
| IfcCartesianPointList3D | Eigenbau, Verbund |
| IfcColourRgb | Eigenbau |
| IfcDirection | Verbund |
| IfcDocumentInformation | Herkunft, Verbund |
| IfcDocumentReference | Herkunft, Verbund |
| IfcGeometricRepresentationContext | Verbund |
| IfcGeometricRepresentationSubContext | Eigenbau, Verbund |
| IfcIndexedPolyCurve | Eigenbau |
| IfcLocalPlacement | Eigenbau, Verbund |
| IfcMapConversion | Verbund |
| IfcOrganization | Verbund |
| IfcOwnerHistory | Eigenbau, Verbund |
| IfcPerson | Verbund |
| IfcPersonAndOrganization | Verbund |
| IfcPresentationLayerAssignment | Verbund |
| IfcProductDefinitionShape | Eigenbau |
| IfcProjectedCRS | Verbund |
| IfcPropertySingleValue | Eigenbau, Herkunft, Verbund |
| IfcQuantityArea | Eigenbau |
| IfcQuantityCount | Eigenbau |
| IfcQuantityLength | Eigenbau |
| IfcQuantityVolume | Eigenbau |
| IfcQuantityWeight | Eigenbau |
| IfcRepresentation | Verbund |
| IfcSIUnit | Verbund |
| IfcShapeRepresentation | Eigenbau |
| IfcStyledItem | Eigenbau, Verbund |
| IfcSurfaceStyle | Eigenbau |
| IfcSurfaceStyleShading | Eigenbau |
| IfcTriangulatedFaceSet | Eigenbau |
| IfcUnitAssignment | Verbund |

Im Code genannt, aber keine Klasse des Schnappschusses — Datentypen oder Klassen älterer Schemata, die ADD2 nicht mehr führt (9): `IfcBoolean`, `IfcDateTime`, `IfcIdentifier`, `IfcInteger`, `IfcLabel`, `IfcPresentationStyleAssignment`, `IfcReal`, `IfcText`, `IfcVolumeMeasure`.
