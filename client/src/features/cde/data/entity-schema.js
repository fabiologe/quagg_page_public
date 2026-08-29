/**
 * IFC 4.3 Entity schema — auto-generated from BuildingSMART ifc-4.3.json
 * DO NOT EDIT MANUALLY — run scripts/gen_ifc_schema.py to regenerate.
 */

export const ENTITY_META = {

  IFCACTIONREQUEST: {
    name:        'IfcActionRequest',
    label:       'Action Request',
    description: 'A request is the act or instance of asking for something, such as a request for information, bid submission, or performance of work.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcActionRequest'],
  },

  IFCACTIONREQUESTEMAIL: {
    name:        'IfcActionRequestEMAIL',
    label:       'Email',
    description: 'Request was made through email.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcActionRequest', 'IfcActionRequestEMAIL'],
  },

  IFCACTIONREQUESTFAX: {
    name:        'IfcActionRequestFAX',
    label:       'Fax',
    description: 'Request was made through facsimile.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcActionRequest', 'IfcActionRequestFAX'],
  },

  IFCACTIONREQUESTPHONE: {
    name:        'IfcActionRequestPHONE',
    label:       'Phone',
    description: 'Request was made verbally over a telephone.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcActionRequest', 'IfcActionRequestPHONE'],
  },

  IFCACTIONREQUESTPOST: {
    name:        'IfcActionRequestPOST',
    label:       'Post',
    description: 'Request was made through postal mail.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcActionRequest', 'IfcActionRequestPOST'],
  },

  IFCACTIONREQUESTVERBAL: {
    name:        'IfcActionRequestVERBAL',
    label:       'Verbal',
    description: 'Request was made verbally in person.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcActionRequest', 'IfcActionRequestVERBAL'],
  },

  IFCACTOR: {
    name:        'IfcActor',
    label:       'Actor',
    description: 'The [[IfcActor]] defines all actors or human agents involved in a project during its full life cycle. It facilitates the use of person and organization definitions in the resource part of the IFC obje',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcActor'],
  },

  IFCACTUATOR: {
    name:        'IfcActuator',
    label:       'Actuator',
    description: 'An actuator is a mechanical device for moving or controlling a mechanism or system. An actuator takes energy, usually created by air, electricity, or liquid, and converts that into some kind of motion',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcActuator'],
  },

  IFCACTUATORELECTRICACTUATOR: {
    name:        'IfcActuatorELECTRICACTUATOR',
    label:       'Electric Actuator',
    description: 'A device that electrically actuates a control element.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcActuator', 'IfcActuatorELECTRICACTUATOR'],
  },

  IFCACTUATORHANDOPERATEDACTUATOR: {
    name:        'IfcActuatorHANDOPERATEDACTUATOR',
    label:       'Hand Operated Actuator',
    description: 'A device that manually actuates a control element.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcActuator', 'IfcActuatorHANDOPERATEDACTUATOR'],
  },

  IFCACTUATORHYDRAULICACTUATOR: {
    name:        'IfcActuatorHYDRAULICACTUATOR',
    label:       'Hydraulic Actuator',
    description: 'A device that hydraulically actuates a control element.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcActuator', 'IfcActuatorHYDRAULICACTUATOR'],
  },

  IFCACTUATORPNEUMATICACTUATOR: {
    name:        'IfcActuatorPNEUMATICACTUATOR',
    label:       'Pneumatic Actuator',
    description: 'A device that pneumatically actuates a control element.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcActuator', 'IfcActuatorPNEUMATICACTUATOR'],
  },

  IFCACTUATORTHERMOSTATICACTUATOR: {
    name:        'IfcActuatorTHERMOSTATICACTUATOR',
    label:       'Thermostatic Actuator',
    description: 'A device that thermostatically actuates a control element.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcActuator', 'IfcActuatorTHERMOSTATICACTUATOR'],
  },

  IFCAIRTERMINAL: {
    name:        'IfcAirTerminal',
    label:       'Air Terminal',
    description: 'An air terminal is a terminating or origination point for the transfer of air between distribution system(s) and one or more spaces. It can also be used for the transfer of air between adjacent spaces',
    domain:      'TGA / HVAC',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcAirTerminal'],
  },

  IFCAIRTERMINALBOX: {
    name:        'IfcAirTerminalBox',
    label:       'Air Terminal Box',
    description: 'An air terminal box typically participates in an HVAC duct distribution system and is used to control or modulate the amount of air delivered to its downstream ductwork. An air terminal box type is of',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcAirTerminalBox'],
  },

  IFCAIRTERMINALBOXCONSTANTFLOW: {
    name:        'IfcAirTerminalBoxCONSTANTFLOW',
    label:       'Constant Flow',
    description: 'Terminal box does not include a means to reset the volume automatically to an outside signal such as thermostat.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcAirTerminalBox', 'IfcAirTerminalBoxCONSTANTFLOW'],
  },

  IFCAIRTERMINALBOXVARIABLEFLOWPRESSUREDEPENDANT: {
    name:        'IfcAirTerminalBoxVARIABLEFLOWPRESSUREDEPENDANT',
    label:       'Variable Flow Pressure Dependant',
    description: 'air-flow rate depends on supply pressure.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcAirTerminalBox', 'IfcAirTerminalBoxVARIABLEFLOWPRESSUREDEPENDANT'],
  },

  IFCAIRTERMINALBOXVARIABLEFLOWPRESSUREINDEPENDANT: {
    name:        'IfcAirTerminalBoxVARIABLEFLOWPRESSUREINDEPENDANT',
    label:       'Variable Flow Pressure Independant',
    description: 'air-flow rate is independent of supply pressure.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcAirTerminalBox', 'IfcAirTerminalBoxVARIABLEFLOWPRESSUREINDEPENDANT'],
  },

  IFCAIRTERMINALDIFFUSER: {
    name:        'IfcAirTerminalDIFFUSER',
    label:       'Diffuser',
    description: 'An outlet discharging supply air in various directions and planes.',
    domain:      'TGA / HVAC',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcAirTerminal', 'IfcAirTerminalDIFFUSER'],
  },

  IFCAIRTERMINALGRILLE: {
    name:        'IfcAirTerminalGRILLE',
    label:       'Grille',
    description: 'A covering for any area through which air passes.',
    domain:      'TGA / HVAC',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcAirTerminal', 'IfcAirTerminalGRILLE'],
  },

  IFCAIRTERMINALLOUVRE: {
    name:        'IfcAirTerminalLOUVRE',
    label:       'Louvre',
    description: 'A rectilinear louvre.',
    domain:      'TGA / HVAC',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcAirTerminal', 'IfcAirTerminalLOUVRE'],
  },

  IFCAIRTERMINALREGISTER: {
    name:        'IfcAirTerminalREGISTER',
    label:       'Register',
    description: 'A grille typically equipped with a damper or control valve.',
    domain:      'TGA / HVAC',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcAirTerminal', 'IfcAirTerminalREGISTER'],
  },

  IFCAIRTOAIRHEATRECOVERY: {
    name:        'IfcAirToAirHeatRecovery',
    label:       'Air to Air Heat Recovery',
    description: 'An air-to-air heat recovery device employs a counter-flow heat exchanger between inbound and outbound air flow. It is typically used to transfer heat from warmer air in one chamber to cooler air in th',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcAirToAirHeatRecovery'],
  },

  IFCAIRTOAIRHEATRECOVERYFIXEDPLATECOUNTERFLOWEXCHAN: {
    name:        'IfcAirToAirHeatRecoveryFIXEDPLATECOUNTERFLOWEXCHAN',
    label:       'Fixed Plate Counter Flow Exchanger',
    description: '[[Heat]] exchanger with moving parts and alternate layers of plates, separated and sealed from the exhaust and supply air stream passages with primary air entering at secondary air outlet location and',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcAirToAirHeatRecovery', 'IfcAirToAirHeatRecoveryFIXEDPLATECOUNTERFLOWEXCHAN'],
  },

  IFCAIRTOAIRHEATRECOVERYFIXEDPLATECROSSFLOWEXCHANGE: {
    name:        'IfcAirToAirHeatRecoveryFIXEDPLATECROSSFLOWEXCHANGE',
    label:       'Fixed Plate Cross Flow Exchanger',
    description: '[[Heat]] exchanger with moving parts and alternate layers of plates, separated and sealed from the exhaust and supply air stream passages with secondary air flow in the direction perpendicular to prim',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcAirToAirHeatRecovery', 'IfcAirToAirHeatRecoveryFIXEDPLATECROSSFLOWEXCHANGE'],
  },

  IFCAIRTOAIRHEATRECOVERYFIXEDPLATEPARALLELFLOWEXCHA: {
    name:        'IfcAirToAirHeatRecoveryFIXEDPLATEPARALLELFLOWEXCHA',
    label:       'Fixed Plate Parallel Flow Exchanger',
    description: '[[Heat]] exchanger with moving parts and alternate layers of plates, separated and sealed from the exhaust and supply air stream passages with primary air entering at secondary air inlet location and',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcAirToAirHeatRecovery', 'IfcAirToAirHeatRecoveryFIXEDPLATEPARALLELFLOWEXCHA'],
  },

  IFCAIRTOAIRHEATRECOVERYHEATPIPE: {
    name:        'IfcAirToAirHeatRecoveryHEATPIPE',
    label:       'Heat Pipe',
    description: 'A passive energy recovery device with a heat pipe divided into evaporator and condenser sections.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcAirToAirHeatRecovery', 'IfcAirToAirHeatRecoveryHEATPIPE'],
  },

  IFCAIRTOAIRHEATRECOVERYROTARYWHEEL: {
    name:        'IfcAirToAirHeatRecoveryROTARYWHEEL',
    label:       'Rotary Wheel',
    description: 'A heat wheel with a revolving cylinder filled with an air-permeable medium having a large internal surface area.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcAirToAirHeatRecovery', 'IfcAirToAirHeatRecoveryROTARYWHEEL'],
  },

  IFCAIRTOAIRHEATRECOVERYRUNAROUNDCOILLOOP: {
    name:        'IfcAirToAirHeatRecoveryRUNAROUNDCOILLOOP',
    label:       'Runaround Coil Loop',
    description: 'A typical coil energy recovery loop places extended surface, finned tube water coils in the supply and exhaust airstreams of a building.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcAirToAirHeatRecovery', 'IfcAirToAirHeatRecoveryRUNAROUNDCOILLOOP'],
  },

  IFCAIRTOAIRHEATRECOVERYTHERMOSIPHONCOILTYPEHEATEXC: {
    name:        'IfcAirToAirHeatRecoveryTHERMOSIPHONCOILTYPEHEATEXC',
    label:       'Thermo Siphon Coil Type Heat Exchangers',
    description: 'Sealed systems that consist of an evaporator, a condenser, interconnecting piping, and an intermediate working fluid that is present in both liquid and vapor phases where the evaporator and condensor',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcAirToAirHeatRecovery', 'IfcAirToAirHeatRecoveryTHERMOSIPHONCOILTYPEHEATEXC'],
  },

  IFCAIRTOAIRHEATRECOVERYTHERMOSIPHONSEALEDTUBEHEATE: {
    name:        'IfcAirToAirHeatRecoveryTHERMOSIPHONSEALEDTUBEHEATE',
    label:       'Thermo Siphon Sealed Tube Heat Exchangers',
    description: 'Sealed systems that consist of an evaporator, a condenser, interconnecting piping, and an intermediate working fluid that is present in both liquid and vapor phases where the evaporator and the conden',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcAirToAirHeatRecovery', 'IfcAirToAirHeatRecoveryTHERMOSIPHONSEALEDTUBEHEATE'],
  },

  IFCAIRTOAIRHEATRECOVERYTWINTOWERENTHALPYRECOVERYLO: {
    name:        'IfcAirToAirHeatRecoveryTWINTOWERENTHALPYRECOVERYLO',
    label:       'Twin Tower Enthalpy Recovery Loops',
    description: 'An air-to-liquid, liquid-to-air enthalpy recovery system with a sorbent liquid circulates continuously between supply and exhaust airstreams, alternately contacting both airstreams directly in contact',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcAirToAirHeatRecovery', 'IfcAirToAirHeatRecoveryTWINTOWERENTHALPYRECOVERYLO'],
  },

  IFCALARM: {
    name:        'IfcAlarm',
    label:       'Alarm',
    description: 'An alarm is a device that signals the existence of a condition or situation that is outside the boundaries of normal expectation or that activates such a device.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcAlarm'],
  },

  IFCALARMBELL: {
    name:        'IfcAlarmBELL',
    label:       'Bell',
    description: 'An audible alarm.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcAlarm', 'IfcAlarmBELL'],
  },

  IFCALARMBREAKGLASSBUTTON: {
    name:        'IfcAlarmBREAKGLASSBUTTON',
    label:       'Break Glass Button',
    description: 'An alarm activation mechanism in which a protective glass has to be broken to enable a button to be pressed.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcAlarm', 'IfcAlarmBREAKGLASSBUTTON'],
  },

  IFCALARMLIGHT: {
    name:        'IfcAlarmLIGHT',
    label:       'Light',
    description: 'A visual alarm.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcAlarm', 'IfcAlarmLIGHT'],
  },

  IFCALARMMANUALPULLBOX: {
    name:        'IfcAlarmMANUALPULLBOX',
    label:       'Manual Pull Box',
    description: 'An alarm activation mechanism in which activation is achieved by a pulling action.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcAlarm', 'IfcAlarmMANUALPULLBOX'],
  },

  IFCALARMRAILWAYCROCODILE: {
    name:        'IfcAlarmRAILWAYCROCODILE',
    label:       'Railway Crocodile',
    description: 'An electrical contact placed between the rails (in the four-foot way) to provide warnings in the locomotive cab.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcAlarm', 'IfcAlarmRAILWAYCROCODILE'],
  },

  IFCALARMRAILWAYDETONATOR: {
    name:        'IfcAlarmRAILWAYDETONATOR',
    label:       'Railway Detonator',
    description: 'A coin-sized device that is used as a loud warning signal to train drivers. It is usually placed on the top of the rail, usually secured with two lead straps, one on each side.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcAlarm', 'IfcAlarmRAILWAYDETONATOR'],
  },

  IFCALARMSIREN: {
    name:        'IfcAlarmSIREN',
    label:       'Siren',
    description: 'An audible alarm.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcAlarm', 'IfcAlarmSIREN'],
  },

  IFCALARMWHISTLE: {
    name:        'IfcAlarmWHISTLE',
    label:       'Whistle',
    description: 'An audible alarm.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcAlarm', 'IfcAlarmWHISTLE'],
  },

  IFCALIGNMENT: {
    name:        'IfcAlignment',
    label:       'Alignment',
    description: 'For the purposes of IFC the English term \\\'alignment\\\' defines three separate but closely interconnected concepts.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcPositioningElement', 'IfcLinearPositioningElement', 'IfcAlignment'],
  },

  IFCANNOTATION: {
    name:        'IfcAnnotation',
    label:       'Annotation',
    description: 'An annotation is an information element within the geometric (and spatial) context of a project, that adds a note or meaning to the objects which constitutes the project model. Annotations include add',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcAnnotation'],
  },

  IFCANNOTATIONCONTOURLINE: {
    name:        'IfcAnnotationCONTOURLINE',
    label:       'Contourline',
    description: 'Annotation used to illustrate lines connecting points of equal elevation or depth, on a map or chart.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcAnnotation', 'IfcAnnotationCONTOURLINE'],
  },

  IFCANNOTATIONDIMENSION: {
    name:        'IfcAnnotationDIMENSION',
    label:       'Dimension',
    description: 'Annotation used to illustrate the measurement or size of an object, often accompanied by numerical values.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcAnnotation', 'IfcAnnotationDIMENSION'],
  },

  IFCANNOTATIONISOBAR: {
    name:        'IfcAnnotationISOBAR',
    label:       'Isobar',
    description: 'Annotation used to illustrate lines connecting points of equal pressure on a map or chart.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcAnnotation', 'IfcAnnotationISOBAR'],
  },

  IFCANNOTATIONISOLUX: {
    name:        'IfcAnnotationISOLUX',
    label:       'Isolux',
    description: 'Annotation used to illustrate lines connecting points of equal illuminance or light intensity.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcAnnotation', 'IfcAnnotationISOLUX'],
  },

  IFCANNOTATIONISOTHERM: {
    name:        'IfcAnnotationISOTHERM',
    label:       'Isotherm',
    description: 'Annotation used to illustrate lines connecting points of equal temperature on a map or chart.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcAnnotation', 'IfcAnnotationISOTHERM'],
  },

  IFCANNOTATIONLEADER: {
    name:        'IfcAnnotationLEADER',
    label:       'Leader',
    description: 'Annotation that includes a line or arrow.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcAnnotation', 'IfcAnnotationLEADER'],
  },

  IFCANNOTATIONSURVEY: {
    name:        'IfcAnnotationSURVEY',
    label:       'Survey',
    description: 'Annotation used for survey information, such as survey points, survey lines or survey areas.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcAnnotation', 'IfcAnnotationSURVEY'],
  },

  IFCANNOTATIONSYMBOL: {
    name:        'IfcAnnotationSYMBOL',
    label:       'Symbol',
    description: 'Annotation that employs graphical symbols or icons to represent specific meanings.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcAnnotation', 'IfcAnnotationSYMBOL'],
  },

  IFCANNOTATIONTEXT: {
    name:        'IfcAnnotationTEXT',
    label:       'Text',
    description: 'A textual annotation.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcAnnotation', 'IfcAnnotationTEXT'],
  },

  IFCASSET: {
    name:        'IfcAsset',
    label:       'Asset',
    description: 'An asset is a uniquely identifiable grouping of elements acting as a single entity that has a financial value or that can be operated on as a single unit.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcAsset'],
  },

  IFCAUDIOVISUALAPPLIANCE: {
    name:        'IfcAudioVisualAppliance',
    label:       'Audio Visual Appliance',
    description: 'An audio-visual appliance is a device that displays, captures, transmits, or receives audio or video.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcAudioVisualAppliance'],
  },

  IFCAUDIOVISUALAPPLIANCEAMPLIFIER: {
    name:        'IfcAudioVisualApplianceAMPLIFIER',
    label:       'Amplifier',
    description: 'A device that receives an audio signal and amplifies it to play through speakers.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcAudioVisualAppliance', 'IfcAudioVisualApplianceAMPLIFIER'],
  },

  IFCAUDIOVISUALAPPLIANCECAMERA: {
    name:        'IfcAudioVisualApplianceCAMERA',
    label:       'Camera',
    description: 'A device that records images, either as a still photograph or as moving images known as videos or movies. Note that a camera may operate with light from the visible spectrum or from other parts of the',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcAudioVisualAppliance', 'IfcAudioVisualApplianceCAMERA'],
  },

  IFCAUDIOVISUALAPPLIANCECOMMUNICATIONTERMINAL: {
    name:        'IfcAudioVisualApplianceCOMMUNICATIONTERMINAL',
    label:       'Communication Terminal',
    description: 'A communication terminal is an audio communication device that is usually installed along transportation infrastructure (railways, roads, tunnels etc.) in order to be used by the general public or ope',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcAudioVisualAppliance', 'IfcAudioVisualApplianceCOMMUNICATIONTERMINAL'],
  },

  IFCAUDIOVISUALAPPLIANCEDISPLAY: {
    name:        'IfcAudioVisualApplianceDISPLAY',
    label:       'Display',
    description: 'An electronic device that represents information in visual form such as a flat-panel display or television.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcAudioVisualAppliance', 'IfcAudioVisualApplianceDISPLAY'],
  },

  IFCAUDIOVISUALAPPLIANCEMICROPHONE: {
    name:        'IfcAudioVisualApplianceMICROPHONE',
    label:       'Microphone',
    description: 'An acoustic-to-electric transducer or sensor that converts sound into an electrical signal. Microphones types in use include electromagnetic induction (dynamic microphones), capacitance change (conden',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcAudioVisualAppliance', 'IfcAudioVisualApplianceMICROPHONE'],
  },

  IFCAUDIOVISUALAPPLIANCEPLAYER: {
    name:        'IfcAudioVisualAppliancePLAYER',
    label:       'P Layer',
    description: 'A device that plays audio and/or video content directly or to another device, having fixed or removable storage media.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcAudioVisualAppliance', 'IfcAudioVisualAppliancePLAYER'],
  },

  IFCAUDIOVISUALAPPLIANCEPROJECTOR: {
    name:        'IfcAudioVisualAppliancePROJECTOR',
    label:       'Projector',
    description: 'An apparatus for projecting a picture on a screen. Whether the device is an overhead, slide projector, or a film projector, it is usually referred to as simply a projector.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcAudioVisualAppliance', 'IfcAudioVisualAppliancePROJECTOR'],
  },

  IFCAUDIOVISUALAPPLIANCERECEIVER: {
    name:        'IfcAudioVisualApplianceRECEIVER',
    label:       'Receiver',
    description: 'A device that receives audio and/or video signals, switches sources, and amplifies signals to play through speakers.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcAudioVisualAppliance', 'IfcAudioVisualApplianceRECEIVER'],
  },

  IFCAUDIOVISUALAPPLIANCERECORDINGEQUIPMENT: {
    name:        'IfcAudioVisualApplianceRECORDINGEQUIPMENT',
    label:       'Recording Equipment',
    description: 'A recording equipment is a device that records telephone calls or other types of audio data. It also provides the function of archiving and immediate replay.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcAudioVisualAppliance', 'IfcAudioVisualApplianceRECORDINGEQUIPMENT'],
  },

  IFCAUDIOVISUALAPPLIANCESPEAKER: {
    name:        'IfcAudioVisualApplianceSPEAKER',
    label:       'Speaker',
    description: 'A loudspeaker, speaker, or speaker system is an electroacoustical transducer that converts an electrical signal to sound.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcAudioVisualAppliance', 'IfcAudioVisualApplianceSPEAKER'],
  },

  IFCAUDIOVISUALAPPLIANCESWITCHER: {
    name:        'IfcAudioVisualApplianceSWITCHER',
    label:       'Switcher',
    description: 'A device that receives audio and/or video signals, switches sources, and transmits signals to downstream devices.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcAudioVisualAppliance', 'IfcAudioVisualApplianceSWITCHER'],
  },

  IFCAUDIOVISUALAPPLIANCETELEPHONE: {
    name:        'IfcAudioVisualApplianceTELEPHONE',
    label:       'Telephone',
    description: 'A telecommunications device that is used to transmit and receive sound, and optionally video.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcAudioVisualAppliance', 'IfcAudioVisualApplianceTELEPHONE'],
  },

  IFCAUDIOVISUALAPPLIANCETUNER: {
    name:        'IfcAudioVisualApplianceTUNER',
    label:       'Tuner',
    description: 'An electronic receiver that detects, demodulates, and amplifies transmitted signals.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcAudioVisualAppliance', 'IfcAudioVisualApplianceTUNER'],
  },

  IFCBEAM: {
    name:        'IfcBeam',
    label:       'Beam',
    description: 'An [[IfcBeam]] is typically a horizontal, or nearly horizontal, structural member that is capable of withstanding load primarily by resisting bending. It may also represent such a member from an archi',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcBeam'],
  },

  IFCBEAMBEAM: {
    name:        'IfcBeamBEAM',
    label:       'Beam',
    description: 'A standard beam usually used horizontally.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcBeam', 'IfcBeamBEAM'],
  },

  IFCBEAMCORNICE: {
    name:        'IfcBeamCORNICE',
    label:       'Cornice',
    description: 'A non-loadbearing beam on the longitudinal edge of bridge slab, usually encasing installations.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcBeam', 'IfcBeamCORNICE'],
  },

  IFCBEAMDIAPHRAGM: {
    name:        'IfcBeamDIAPHRAGM',
    label:       'Diaphragm',
    description: 'End portion of a girder transmitting loads to supports and providing moment resistance to adjoining segment.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcBeam', 'IfcBeamDIAPHRAGM'],
  },

  IFCBEAMEDGEBEAM: {
    name:        'IfcBeamEDGEBEAM',
    label:       'Edgebeam',
    description: 'A beam on the longitudinal edge of bridge slab, usually concrete, providing additional stiffening and protection from the elements.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcBeam', 'IfcBeamEDGEBEAM'],
  },

  IFCBEAMGIRDER_SEGMENT: {
    name:        'IfcBeamGIRDER_SEGMENT',
    label:       'Girder Segment',
    description: 'A segment of a girder (e.g. each span of a continuous girder).',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcBeam', 'IfcBeamGIRDER_SEGMENT'],
  },

  IFCBEAMHATSTONE: {
    name:        'IfcBeamHATSTONE',
    label:       'Hatstone',
    description: 'A beam on top of a retaining wall or a wing wall, preventing earth movement.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcBeam', 'IfcBeamHATSTONE'],
  },

  IFCBEAMHOLLOWCORE: {
    name:        'IfcBeamHOLLOWCORE',
    label:       'Hollow Core',
    description: 'A wide often prestressed beam with a hollow-core profile that usually serves as a slab component.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcBeam', 'IfcBeamHOLLOWCORE'],
  },

  IFCBEAMJOIST: {
    name:        'IfcBeamJOIST',
    label:       'Joist',
    description: 'A beam used to support a floor or ceiling.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcBeam', 'IfcBeamJOIST'],
  },

  IFCBEAMLINTEL: {
    name:        'IfcBeamLINTEL',
    label:       'Lintel',
    description: 'A beam or horizontal piece of material over an opening (e.g. door, window).',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcBeam', 'IfcBeamLINTEL'],
  },

  IFCBEAMPIERCAP: {
    name:        'IfcBeamPIERCAP',
    label:       'Pier Cap',
    description: 'A transversal beam on top of a pier (on a single column or extending from one column of a pier to another column of the same pier).',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcBeam', 'IfcBeamPIERCAP'],
  },

  IFCBEAMSPANDREL: {
    name:        'IfcBeamSPANDREL',
    label:       'Spandrel',
    description: 'A tall beam placed on the facade of a building. One tall side is usually finished to provide the exterior of the building. Can be used to support joists or slab elements on its interior side.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcBeam', 'IfcBeamSPANDREL'],
  },

  IFCBEAMT_BEAM: {
    name:        'IfcBeamT_BEAM',
    label:       'T Beam',
    description: 'A beam that forms part of a slab construction and acts together with the slab which it carries. Such beams are often of T-shape (therefore the English name), but may have other shapes as well, e.g. an',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcBeam', 'IfcBeamT_BEAM'],
  },

  IFCBEARING: {
    name:        'IfcBearing',
    label:       'Bearing',
    description: '[[Type]] of building element that is usually used to transmit loads from superstructure to substructure, and usually allowing movement (displacement or rotation) in one or more degrees of freedom. It',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcBearing'],
  },

  IFCBEARINGCYLINDRICAL: {
    name:        'IfcBearingCYLINDRICAL',
    label:       'Cylindrical',
    description: 'The bearing functionality is provided by cylinder in a concave cylinder.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcBearing', 'IfcBearingCYLINDRICAL'],
  },

  IFCBEARINGDISK: {
    name:        'IfcBearingDISK',
    label:       'Disk',
    description: 'A disk bearing consist of an elastomeric disc between two metal plates.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcBearing', 'IfcBearingDISK'],
  },

  IFCBEARINGELASTOMERIC: {
    name:        'IfcBearingELASTOMERIC',
    label:       'Elastomeric',
    description: 'A pad bearing which carries vertical load by contact stresses between a sheet of sliding material and a mating surface that permits movements by sliding and accommodates rotation by deformation of the',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcBearing', 'IfcBearingELASTOMERIC'],
  },

  IFCBEARINGGUIDE: {
    name:        'IfcBearingGUIDE',
    label:       'Guide',
    description: 'A bearing that ensures that the structure maintains the correct location or expansion/contraction path and takes no vertical load. Includes also restraint bearings.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcBearing', 'IfcBearingGUIDE'],
  },

  IFCBEARINGPOT: {
    name:        'IfcBearingPOT',
    label:       'Pot',
    description: 'A bearing which carries vertical load by compression of an (elastomeric) disc confined in a (steel) cylinder and which accommodates rotations by deformations of the disc.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcBearing', 'IfcBearingPOT'],
  },

  IFCBEARINGROCKER: {
    name:        'IfcBearingROCKER',
    label:       'Rocker',
    description: 'The bearing functionality is provided by a rocker construction. Includes line rocker and point rocker bearings.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcBearing', 'IfcBearingROCKER'],
  },

  IFCBEARINGROLLER: {
    name:        'IfcBearingROLLER',
    label:       'Roller',
    description: 'The bearing functionality is provided by one or more rollers that are placed between two plates.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcBearing', 'IfcBearingROLLER'],
  },

  IFCBEARINGSPHERICAL: {
    name:        'IfcBearingSPHERICAL',
    label:       'Spherical',
    description: 'The bearing functionality is provided by convex dome in a concave basin.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcBearing', 'IfcBearingSPHERICAL'],
  },

  IFCBOILER: {
    name:        'IfcBoiler',
    label:       'Boiler',
    description: 'A boiler is a closed, pressure-rated vessel in which water or other fluid is heated using an energy source such as natural gas, heating oil, or electricity. The fluid in the vessel is then circulated',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcBoiler'],
  },

  IFCBOILERSTEAM: {
    name:        'IfcBoilerSTEAM',
    label:       'Steam',
    description: '[[Steam]] boiler.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcBoiler', 'IfcBoilerSTEAM'],
  },

  IFCBOILERWATER: {
    name:        'IfcBoilerWATER',
    label:       'Water',
    description: '[[Water]] boiler.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcBoiler', 'IfcBoilerWATER'],
  },

  IFCBOREHOLE: {
    name:        'IfcBorehole',
    label:       'Borehole',
    description: 'Representation of the concept of a linear geological and geotechnical model, usually an interpretation but sometimes created direct from ground penetrating measurement; The assembly may contain one of',
    domain:      'Geotechnik',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcGeotechnicalElement', 'IfcGeotechnicalAssembly', 'IfcBorehole'],
  },

  IFCBRIDGE: {
    name:        'IfcBridge',
    label:       'Bridge',
    description: 'A Bridge is a civil engineering work that affords passage to pedestrians, animals, vehicles, and services above obstacles or between two points at a height above ground.',
    domain:      'Infrastruktur / Brücke',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacility', 'IfcBridge'],
  },

  IFCBRIDGEARCHED: {
    name:        'IfcBridgeARCHED',
    label:       'Arched',
    description: 'Bridge that has one or more arches as its main structure.',
    domain:      'Infrastruktur / Brücke',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacility', 'IfcBridge', 'IfcBridgeARCHED'],
  },

  IFCBRIDGECABLE_STAYED: {
    name:        'IfcBridgeCABLE_STAYED',
    label:       'Cable Stayed',
    description: 'Bridge with one or more towers and inclined cables that are connected to the top or the shaft of the tower and support the deck.',
    domain:      'Infrastruktur / Brücke',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacility', 'IfcBridge', 'IfcBridgeCABLE_STAYED'],
  },

  IFCBRIDGECANTILEVER: {
    name:        'IfcBridgeCANTILEVER',
    label:       'Cantilever',
    description: 'Bridge, the main structural members of which are cantilevers.',
    domain:      'Infrastruktur / Brücke',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacility', 'IfcBridge', 'IfcBridgeCANTILEVER'],
  },

  IFCBRIDGECULVERT: {
    name:        'IfcBridgeCULVERT',
    label:       'Culvert',
    description: 'Transverse drain or waterway construction under a road, railway, or canal, or through an embankment, in the form of a large pipe or enclosed channel.',
    domain:      'Infrastruktur / Brücke',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacility', 'IfcBridge', 'IfcBridgeCULVERT'],
  },

  IFCBRIDGEFRAMEWORK: {
    name:        'IfcBridgeFRAMEWORK',
    label:       'Framework',
    description: 'Framework bridge.',
    domain:      'Infrastruktur / Brücke',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacility', 'IfcBridge', 'IfcBridgeFRAMEWORK'],
  },

  IFCBRIDGEGIRDER: {
    name:        'IfcBridgeGIRDER',
    label:       'Girder',
    description: 'A bridge that uses girders as the means of supporting its deck.',
    domain:      'Infrastruktur / Brücke',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacility', 'IfcBridge', 'IfcBridgeGIRDER'],
  },

  IFCBRIDGEPART: {
    name:        'IfcBridgePart',
    label:       'Bridge Part',
    description: 'Part of a bridge.',
    domain:      'Infrastruktur / Brücke',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcBridgePart'],
  },

  IFCBRIDGEPARTABUTMENT: {
    name:        'IfcBridgePartABUTMENT',
    label:       'Abutment',
    description: 'The substructures at the ends of a bridge, supporting its superstructure. They may be composed of wing walls (on each side), head wall, stem wall, and cone',
    domain:      'Infrastruktur / Brücke',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcBridgePart', 'IfcBridgePartABUTMENT'],
  },

  IFCBRIDGEPARTDECK: {
    name:        'IfcBridgePartDECK',
    label:       'Deck',
    description: 'A bridge deck is comprised of those elements used for conveying traffic but does not perform structural functions of the superstructure',
    domain:      'Infrastruktur / Brücke',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcBridgePart', 'IfcBridgePartDECK'],
  },

  IFCBRIDGEPARTDECK_SEGMENT: {
    name:        'IfcBridgePartDECK_SEGMENT',
    label:       'Deck Segment',
    description: 'A segment of the bridge deck. Segments may be separated by construction or expansion joints',
    domain:      'Infrastruktur / Brücke',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcBridgePart', 'IfcBridgePartDECK_SEGMENT'],
  },

  IFCBRIDGEPARTFOUNDATION: {
    name:        'IfcBridgePartFOUNDATION',
    label:       'Foundation',
    description: 'The structural elements that support and anchor the bridge to the ground, transmitting all loads to the supporting strata',
    domain:      'Infrastruktur / Brücke',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcBridgePart', 'IfcBridgePartFOUNDATION'],
  },

  IFCBRIDGEPARTPIER: {
    name:        'IfcBridgePartPIER',
    label:       'Pier',
    description: 'A bridge pier is a type of structure that extends to the ground below or into the water. It is used to support bridge superstructure and transfer the loads to the foundation.',
    domain:      'Infrastruktur / Brücke',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcBridgePart', 'IfcBridgePartPIER'],
  },

  IFCBRIDGEPARTPIER_SEGMENT: {
    name:        'IfcBridgePartPIER_SEGMENT',
    label:       'Pier Segment',
    description: 'A segment of the bridge pier. Segments may be separated by construction or expansion joints',
    domain:      'Infrastruktur / Brücke',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcBridgePart', 'IfcBridgePartPIER_SEGMENT'],
  },

  IFCBRIDGEPARTPYLON: {
    name:        'IfcBridgePartPYLON',
    label:       'Pylon',
    description: 'A vertical structure supporting cables in suspended or stayed structures',
    domain:      'Infrastruktur / Brücke',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcBridgePart', 'IfcBridgePartPYLON'],
  },

  IFCBRIDGEPARTSUBSTRUCTURE: {
    name:        'IfcBridgePartSUBSTRUCTURE',
    label:       'Sub Structure',
    description: 'The elements that transfer loads to the ground. It includes abutments and piers',
    domain:      'Infrastruktur / Brücke',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcBridgePart', 'IfcBridgePartSUBSTRUCTURE'],
  },

  IFCBRIDGEPARTSUPERSTRUCTURE: {
    name:        'IfcBridgePartSUPERSTRUCTURE',
    label:       'Super Structure',
    description: 'The part of the bridge that span horizontally and transfers the traffic load to the bridge substructures',
    domain:      'Infrastruktur / Brücke',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcBridgePart', 'IfcBridgePartSUPERSTRUCTURE'],
  },

  IFCBRIDGEPARTSURFACESTRUCTURE: {
    name:        'IfcBridgePartSURFACESTRUCTURE',
    label:       'Surface Structure',
    description: '',
    domain:      'Infrastruktur / Brücke',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcBridgePart', 'IfcBridgePartSURFACESTRUCTURE'],
  },

  IFCBRIDGESUSPENSION: {
    name:        'IfcBridgeSUSPENSION',
    label:       'Suspension',
    description: 'Bridge, the main structural members of which are catenary cables from which the deck is suspended.',
    domain:      'Infrastruktur / Brücke',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacility', 'IfcBridge', 'IfcBridgeSUSPENSION'],
  },

  IFCBRIDGETRUSS: {
    name:        'IfcBridgeTRUSS',
    label:       'Truss',
    description: 'Bridge with braced triangulated frame designed to act as a beam.',
    domain:      'Infrastruktur / Brücke',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacility', 'IfcBridge', 'IfcBridgeTRUSS'],
  },

  IFCBUILDING: {
    name:        'IfcBuilding',
    label:       'Building',
    description: 'A building represents a structure that provides shelter for its occupants or contents and stands in one place. The building is also used to provide a basic element within the spatial structure hierarc',
    domain:      'Räumliche Struktur',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacility', 'IfcBuilding'],
  },

  IFCBUILDINGELEMENTPART: {
    name:        'IfcBuildingElementPart',
    label:       'Building Element Part',
    description: '[[IfcBuildingElementPart]] represents major components as subordinate parts of a building element. Typical usage examples include precast concrete sandwich walls, where the layers may have different g',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcBuildingElementPart'],
  },

  IFCBUILDINGELEMENTPARTAPRON: {
    name:        'IfcBuildingElementPartAPRON',
    label:       'Apron',
    description: 'A form of scour protection consisting of timber, concrete, riprap, paving, or other construction placed adjacent to abutments and piers to prevent undermining.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcBuildingElementPart', 'IfcBuildingElementPartAPRON'],
  },

  IFCBUILDINGELEMENTPARTARMOURUNIT: {
    name:        'IfcBuildingElementPartARMOURUNIT',
    label:       'Armour Unit',
    description: 'A large quarry stone or concrete shaped unit used as erosion prevention on slopes such as revetments and breakwaters. These units are grouped together into a Course layer.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcBuildingElementPart', 'IfcBuildingElementPartARMOURUNIT'],
  },

  IFCBUILDINGELEMENTPARTINSULATION: {
    name:        'IfcBuildingElementPartINSULATION',
    label:       'Insulation',
    description: 'The part provides thermal insulation, for example as insulation layer between wall panels in sandwich walls or as infill in stud walls.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcBuildingElementPart', 'IfcBuildingElementPartINSULATION'],
  },

  IFCBUILDINGELEMENTPARTPRECASTPANEL: {
    name:        'IfcBuildingElementPartPRECASTPANEL',
    label:       'Precast Panel',
    description: 'The part is a precast panel, usually as an internal or external layer in a sandwich wall panel.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcBuildingElementPart', 'IfcBuildingElementPartPRECASTPANEL'],
  },

  IFCBUILDINGELEMENTPARTSAFETYCAGE: {
    name:        'IfcBuildingElementPartSAFETYCAGE',
    label:       'Safety Cage',
    description: 'Safety cages are an assembly of circular and vertical bars that are fastened to the stiles of fixed ladders and are arranged to enclose the path of a worker when climbing the ladder. Ladders so enclos',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcBuildingElementPart', 'IfcBuildingElementPartSAFETYCAGE'],
  },

  IFCBUILDINGELEMENTPROXY: {
    name:        'IfcBuildingElementProxy',
    label:       'Building Element Proxy',
    description: 'The [[IfcBuildingElementProxy]] is a proxy definition that provides the same functionality as subtypes of [[IfcBuiltElement]], but without having a predefined meaning of the special type of building e',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcBuildingElementProxy'],
  },

  IFCBUILDINGSTOREY: {
    name:        'IfcBuildingStorey',
    label:       'Building Storey',
    description: 'The building storey has an elevation and typically represents a (nearly) horizontal aggregation of spaces that are vertically bound.',
    domain:      'Räumliche Struktur',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcBuildingStorey'],
  },

  IFCBUILTELEMENT: {
    name:        'IfcBuiltElement',
    label:       'Built Element',
    description: 'The built element comprises all elements that are primarily part of the construction of a built facility, i.e., its structural and space separating system. Built elements are all physically existent a',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement'],
  },

  IFCBUILTSYSTEM: {
    name:        'IfcBuiltSystem',
    label:       'Built System',
    description: 'A built system is a group by which built elements are grouped according to a common function within the facility.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcBuiltSystem'],
  },

  IFCBUILTSYSTEMEROSIONPREVENTION: {
    name:        'IfcBuiltSystemEROSIONPREVENTION',
    label:       'Erosion Prevention',
    description: 'A grouping of elements into a built system for preventing unwanted relocation of material particles in earthworks slopes or rock faces.;Planting; Solid; Framework; Anchored framework; Shotcrete; Scree',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcBuiltSystem', 'IfcBuiltSystemEROSIONPREVENTION'],
  },

  IFCBUILTSYSTEMFENESTRATION: {
    name:        'IfcBuiltSystemFENESTRATION',
    label:       'Fenestration',
    description: '[[System]] of doors, windows, and other fillings in openings in a built envelope that are designed to permit the passage of air or light.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcBuiltSystem', 'IfcBuiltSystemFENESTRATION'],
  },

  IFCBUILTSYSTEMFOUNDATION: {
    name:        'IfcBuiltSystemFOUNDATION',
    label:       'Foundation',
    description: '[[System]] of shallow and deep foundation elements that transmit forces to the supporting ground.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcBuiltSystem', 'IfcBuiltSystemFOUNDATION'],
  },

  IFCBUILTSYSTEMLOADBEARING: {
    name:        'IfcBuiltSystemLOADBEARING',
    label:       'Loadbearing',
    description: '[[System]] of built elements that transmit forces and stiffen the construction.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcBuiltSystem', 'IfcBuiltSystemLOADBEARING'],
  },

  IFCBUILTSYSTEMMOORING: {
    name:        'IfcBuiltSystemMOORING',
    label:       'Mooring',
    description: '[[System]] of components and elements responsible for keeping or holding an element (a vessel, platform or set of catenary lines) in a desired position.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcBuiltSystem', 'IfcBuiltSystemMOORING'],
  },

  IFCBUILTSYSTEMOUTERSHELL: {
    name:        'IfcBuiltSystemOUTERSHELL',
    label:       'Outer Shell',
    description: '[[System]] of built elements that provide the outer skin to protect the construction (such as the facade).',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcBuiltSystem', 'IfcBuiltSystemOUTERSHELL'],
  },

  IFCBUILTSYSTEMPRESTRESSING: {
    name:        'IfcBuiltSystemPRESTRESSING',
    label:       'Prestressing',
    description: '[[System]] of elements providing pre-stressing to the structure, including typically manufactured products such as tendons, anchorages (active, dead, coupling), ducts, vents and deviators, and in-situ',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcBuiltSystem', 'IfcBuiltSystemPRESTRESSING'],
  },

  IFCBUILTSYSTEMRAILWAYLINE: {
    name:        'IfcBuiltSystemRAILWAYLINE',
    label:       'Railway Line',
    description: 'A set of functional tracks with explicit terminals. It is usually composed of a set of tracks with continuous track parts and alignments.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcBuiltSystem', 'IfcBuiltSystemRAILWAYLINE'],
  },

  IFCBUILTSYSTEMRAILWAYTRACK: {
    name:        'IfcBuiltSystemRAILWAYTRACK',
    label:       'Railway Track',
    description: 'Railway track system. It is usually composed of continuous sequences of track parts and alignments.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcBuiltSystem', 'IfcBuiltSystemRAILWAYTRACK'],
  },

  IFCBUILTSYSTEMREINFORCING: {
    name:        'IfcBuiltSystemREINFORCING',
    label:       'Reinforcing',
    description: '[[System]] of elements providing reinforcing to the structure.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcBuiltSystem', 'IfcBuiltSystemREINFORCING'],
  },

  IFCBUILTSYSTEMSHADING: {
    name:        'IfcBuiltSystemSHADING',
    label:       'Shading',
    description: '[[System]] of shading elements (external or internal) that permits the limitation or control of impact of natural sun light.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcBuiltSystem', 'IfcBuiltSystemSHADING'],
  },

  IFCBUILTSYSTEMTRACKCIRCUIT: {
    name:        'IfcBuiltSystemTRACKCIRCUIT',
    label:       'Track Circuit',
    description: 'A track circuit is an electric circuit of which the rails of a track section form a part, with usually a source of current connected at one end and a detection device at the other end for detecting wh',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcBuiltSystem', 'IfcBuiltSystemTRACKCIRCUIT'],
  },

  IFCBUILTSYSTEMTRANSPORT: {
    name:        'IfcBuiltSystemTRANSPORT',
    label:       'Transport',
    description: '[[System]] of all transport elements in a facility that enable the transport of people or goods.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcBuiltSystem', 'IfcBuiltSystemTRANSPORT'],
  },

  IFCBURNER: {
    name:        'IfcBurner',
    label:       'Burner',
    description: 'A burner is a device that converts fuel into heat through combustion. It includes gas, oil, and wood burners.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcBurner'],
  },

  IFCCABLECARRIERFITTING: {
    name:        'IfcCableCarrierFitting',
    label:       'Cable Carrier Fitting',
    description: 'A cable carrier fitting is a fitting that is placed at junction or transition in a cable carrier system.',
    domain:      'TGA / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowFitting', 'IfcCableCarrierFitting'],
  },

  IFCCABLECARRIERFITTINGBEND: {
    name:        'IfcCableCarrierFittingBEND',
    label:       'Bend',
    description: 'A fitting that changes the route of the cable carrier.',
    domain:      'TGA / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowFitting', 'IfcCableCarrierFitting', 'IfcCableCarrierFittingBEND'],
  },

  IFCCABLECARRIERFITTINGCONNECTOR: {
    name:        'IfcCableCarrierFittingCONNECTOR',
    label:       'Connector',
    description: 'Connector fitting, typically used to join two ports together within a flow distribution system (e.g., a coupling used to join two duct segments).',
    domain:      'TGA / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowFitting', 'IfcCableCarrierFitting', 'IfcCableCarrierFittingCONNECTOR'],
  },

  IFCCABLECARRIERFITTINGCROSS: {
    name:        'IfcCableCarrierFittingCROSS',
    label:       'Cross',
    description: 'A fitting at which two branches are taken from the main route of the cable carrier simultaneously.',
    domain:      'TGA / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowFitting', 'IfcCableCarrierFitting', 'IfcCableCarrierFittingCROSS'],
  },

  IFCCABLECARRIERFITTINGJUNCTION: {
    name:        'IfcCableCarrierFittingJUNCTION',
    label:       'Junction',
    description: 'A fitting with typically more than two ports used to redistribute flow among the ports and/or to change the direction of flow between connected elements (e.g, tee, cross, wye, etc.).',
    domain:      'TGA / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowFitting', 'IfcCableCarrierFitting', 'IfcCableCarrierFittingJUNCTION'],
  },

  IFCCABLECARRIERFITTINGREDUCER: {
    name:        'IfcCableCarrierFittingREDUCER',
    label:       'Reducer',
    description: 'A fitting that changes the physical size of the main route of the cable carrier.',
    domain:      'TGA / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowFitting', 'IfcCableCarrierFitting', 'IfcCableCarrierFittingREDUCER'],
  },

  IFCCABLECARRIERFITTINGTEE: {
    name:        'IfcCableCarrierFittingTEE',
    label:       'Tee',
    description: 'A fitting at which a branch is taken from the main route of the cable carrier.',
    domain:      'TGA / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowFitting', 'IfcCableCarrierFitting', 'IfcCableCarrierFittingTEE'],
  },

  IFCCABLECARRIERFITTINGTRANSITION: {
    name:        'IfcCableCarrierFittingTRANSITION',
    label:       'Transition',
    description: 'A fitting with typically two ports having different shapes or sizes. Can also be used to change the direction of flow between connected elements.',
    domain:      'TGA / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowFitting', 'IfcCableCarrierFitting', 'IfcCableCarrierFittingTRANSITION'],
  },

  IFCCABLECARRIERSEGMENT: {
    name:        'IfcCableCarrierSegment',
    label:       'Cable Carrier Segment',
    description: 'A cable carrier segment is a flow segment that is specifically used to carry and support cabling.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowSegment', 'IfcCableCarrierSegment'],
  },

  IFCCABLECARRIERSEGMENTCABLEBRACKET: {
    name:        'IfcCableCarrierSegmentCABLEBRACKET',
    label:       'Cable Bracket',
    description: 'A cable bracket is a horizontal cable support fixed at one end only, spaced at intervals, on which cables rest.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowSegment', 'IfcCableCarrierSegment', 'IfcCableCarrierSegmentCABLEBRACKET'],
  },

  IFCCABLECARRIERSEGMENTCABLELADDERSEGMENT: {
    name:        'IfcCableCarrierSegmentCABLELADDERSEGMENT',
    label:       'Cable Ladder Segment',
    description: 'An open carrier segment on which cables are carried on a ladder structure.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowSegment', 'IfcCableCarrierSegment', 'IfcCableCarrierSegmentCABLELADDERSEGMENT'],
  },

  IFCCABLECARRIERSEGMENTCABLETRAYSEGMENT: {
    name:        'IfcCableCarrierSegmentCABLETRAYSEGMENT',
    label:       'Cable Tray Segment',
    description: 'A (typically) open carrier segment onto which cables are laid.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowSegment', 'IfcCableCarrierSegment', 'IfcCableCarrierSegmentCABLETRAYSEGMENT'],
  },

  IFCCABLECARRIERSEGMENTCABLETRUNKINGSEGMENT: {
    name:        'IfcCableCarrierSegmentCABLETRUNKINGSEGMENT',
    label:       'Cable Trunking Segment',
    description: 'An enclosed carrier segment with one or more compartments into which cables are placed.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowSegment', 'IfcCableCarrierSegment', 'IfcCableCarrierSegmentCABLETRUNKINGSEGMENT'],
  },

  IFCCABLECARRIERSEGMENTCATENARYWIRE: {
    name:        'IfcCableCarrierSegmentCATENARYWIRE',
    label:       'Catenary Wire',
    description: 'A catenary wire is a longitudinal wire supporting the grooved contact wires either directly or indirectly.;definition from UIC 719-1.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowSegment', 'IfcCableCarrierSegment', 'IfcCableCarrierSegmentCATENARYWIRE'],
  },

  IFCCABLECARRIERSEGMENTCONDUITSEGMENT: {
    name:        'IfcCableCarrierSegmentCONDUITSEGMENT',
    label:       'Conduit Segment',
    description: 'An enclosed tubular carrier segment through which cables are pulled.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowSegment', 'IfcCableCarrierSegment', 'IfcCableCarrierSegmentCONDUITSEGMENT'],
  },

  IFCCABLECARRIERSEGMENTDROPPER: {
    name:        'IfcCableCarrierSegmentDROPPER',
    label:       'Dropper',
    description: 'A dropper is a cable carrier used to suspend cable from another cable. It could also conduct electricity.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowSegment', 'IfcCableCarrierSegment', 'IfcCableCarrierSegmentDROPPER'],
  },

  IFCCABLEFITTING: {
    name:        'IfcCableFitting',
    label:       'Cable Fitting',
    description: 'A cable fitting is a fitting that is placed at a junction, transition or termination in a cable system.',
    domain:      'TGA / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowFitting', 'IfcCableFitting'],
  },

  IFCCABLEFITTINGCONNECTOR: {
    name:        'IfcCableFittingCONNECTOR',
    label:       'Connector',
    description: 'A fitting that joins two cable segments of the same connector type (though potentially different gender).',
    domain:      'TGA / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowFitting', 'IfcCableFitting', 'IfcCableFittingCONNECTOR'],
  },

  IFCCABLEFITTINGENTRY: {
    name:        'IfcCableFittingENTRY',
    label:       'Entry',
    description: 'A fitting that begins a cable segment at a non-electrical element such as a grounding clamp attached to a pipe.',
    domain:      'TGA / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowFitting', 'IfcCableFitting', 'IfcCableFittingENTRY'],
  },

  IFCCABLEFITTINGEXIT: {
    name:        'IfcCableFittingEXIT',
    label:       'Exit',
    description: 'A fitting that ends a cable segment at a non-electrical element such as a grounding clamp attached to a pipe or to the ground.',
    domain:      'TGA / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowFitting', 'IfcCableFitting', 'IfcCableFittingEXIT'],
  },

  IFCCABLEFITTINGFANOUT: {
    name:        'IfcCableFittingFANOUT',
    label:       'Fanout',
    description: 'A fan out is a special cable fitting that provides a safe transition from multi-fiber cable units to individual fibers.',
    domain:      'TGA / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowFitting', 'IfcCableFitting', 'IfcCableFittingFANOUT'],
  },

  IFCCABLEFITTINGJUNCTION: {
    name:        'IfcCableFittingJUNCTION',
    label:       'Junction',
    description: 'A fitting that joins three or more segments of arbitrary connector types for signal splitting or multiplexing.',
    domain:      'TGA / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowFitting', 'IfcCableFitting', 'IfcCableFittingJUNCTION'],
  },

  IFCCABLEFITTINGTRANSITION: {
    name:        'IfcCableFittingTRANSITION',
    label:       'Transition',
    description: 'A fitting that joins two cable segments of different connector types.',
    domain:      'TGA / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowFitting', 'IfcCableFitting', 'IfcCableFittingTRANSITION'],
  },

  IFCCABLESEGMENT: {
    name:        'IfcCableSegment',
    label:       'Cable Segment',
    description: 'A cable segment is a flow segment used to carry electrical power, data, or telecommunications signals.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowSegment', 'IfcCableSegment'],
  },

  IFCCABLESEGMENTBUSBARSEGMENT: {
    name:        'IfcCableSegmentBUSBARSEGMENT',
    label:       'Busbar Segment',
    description: 'Electrical conductor that makes a common connection between several electrical circuits. Properties of a busbar are the same as those of a cable segment and are captured by the cable segment property',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowSegment', 'IfcCableSegment', 'IfcCableSegmentBUSBARSEGMENT'],
  },

  IFCCABLESEGMENTCABLESEGMENT: {
    name:        'IfcCableSegmentCABLESEGMENT',
    label:       'Cable Segment',
    description: 'Cable with a specific purpose to lead electric current within a circuit or any other electric construction. Includes all types of electric cables, mainly several core segments or conductor segments wr',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowSegment', 'IfcCableSegment', 'IfcCableSegmentCABLESEGMENT'],
  },

  IFCCABLESEGMENTCONDUCTORSEGMENT: {
    name:        'IfcCableSegmentCONDUCTORSEGMENT',
    label:       'Conductors Egment',
    description: 'A single linear element within a cable or an exposed wire (such as for grounding) with the specific purpose to lead electric current, data, or a telecommunications signal.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowSegment', 'IfcCableSegment', 'IfcCableSegmentCONDUCTORSEGMENT'],
  },

  IFCCABLESEGMENTCONTACTWIRESEGMENT: {
    name:        'IfcCableSegmentCONTACTWIRESEGMENT',
    label:       'Contact Wire Segment',
    description: 'An electric conductor of an overhead contact line with which the current collectors make contact.;definition from IEC60050 811-33-15.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowSegment', 'IfcCableSegment', 'IfcCableSegmentCONTACTWIRESEGMENT'],
  },

  IFCCABLESEGMENTCORESEGMENT: {
    name:        'IfcCableSegmentCORESEGMENT',
    label:       'Core Segment',
    description: 'A self contained element of a cable that comprises one or more conductors and sheathing.The core of one lead is normally single wired or multiwired which are intertwined.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowSegment', 'IfcCableSegment', 'IfcCableSegmentCORESEGMENT'],
  },

  IFCCABLESEGMENTFIBERSEGMENT: {
    name:        'IfcCableSegmentFIBERSEGMENT',
    label:       'Fiber Segment',
    description: 'A fiber segment is an individual optical fiber used in telecommunication systems to transmit data by means of optical signals.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowSegment', 'IfcCableSegment', 'IfcCableSegmentFIBERSEGMENT'],
  },

  IFCCABLESEGMENTFIBERTUBE: {
    name:        'IfcCableSegmentFIBERTUBE',
    label:       'Fiber Tube',
    description: 'A fiber tube is semi-rigid hollow plastic tube with a very small radius that houses and protects a certain number of optical fiber segments. An optical cable segment may contain many fiber tubes.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowSegment', 'IfcCableSegment', 'IfcCableSegmentFIBERTUBE'],
  },

  IFCCABLESEGMENTOPTICALCABLESEGMENT: {
    name:        'IfcCableSegmentOPTICALCABLESEGMENT',
    label:       'Optical Cable Segment',
    description: 'An optical cable segment is a cable segment that contains a variable number of optical fiber segments.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowSegment', 'IfcCableSegment', 'IfcCableSegmentOPTICALCABLESEGMENT'],
  },

  IFCCABLESEGMENTSTITCHWIRE: {
    name:        'IfcCableSegmentSTITCHWIRE',
    label:       'Stitch Wire',
    description: 'A stitch wire consists of auxiliary wires and different components (clamp) used in stitched suspension.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowSegment', 'IfcCableSegment', 'IfcCableSegmentSTITCHWIRE'],
  },

  IFCCABLESEGMENTWIREPAIRSEGMENT: {
    name:        'IfcCableSegmentWIREPAIRSEGMENT',
    label:       'Wi Repair Segment',
    description: 'A pair of conductors contained in a copper cable. The pair is always used together to form a circuit to transmit data by means of electric signals.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowSegment', 'IfcCableSegment', 'IfcCableSegmentWIREPAIRSEGMENT'],
  },

  IFCCAISSONFOUNDATION: {
    name:        'IfcCaissonFoundation',
    label:       'Caisson Foundation',
    description: 'CaissonFoundation essentially is a hollow box that can be either open or closed.',
    domain:      'Infrastruktur / Tiefbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcDeepFoundation', 'IfcCaissonFoundation'],
  },

  IFCCAISSONFOUNDATIONCAISSON: {
    name:        'IfcCaissonFoundationCAISSON',
    label:       'Caisson',
    description: 'Closed box.',
    domain:      'Infrastruktur / Tiefbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcDeepFoundation', 'IfcCaissonFoundation', 'IfcCaissonFoundationCAISSON'],
  },

  IFCCAISSONFOUNDATIONWELL: {
    name:        'IfcCaissonFoundationWELL',
    label:       'Well',
    description: 'Open box.',
    domain:      'Infrastruktur / Tiefbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcDeepFoundation', 'IfcCaissonFoundation', 'IfcCaissonFoundationWELL'],
  },

  IFCCHILLER: {
    name:        'IfcChiller',
    label:       'Chiller',
    description: 'A chiller is a device used to remove heat from a liquid via a vapor-compression or absorption refrigeration cycle to cool a fluid, typically water or a mixture of water and glycol. The chilled fluid i',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcChiller'],
  },

  IFCCHILLERAIRCOOLED: {
    name:        'IfcChillerAIRCOOLED',
    label:       'Air Cooled',
    description: 'Air cooled chiller.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcChiller', 'IfcChillerAIRCOOLED'],
  },

  IFCCHILLERHEATRECOVERY: {
    name:        'IfcChillerHEATRECOVERY',
    label:       'Heat Recovery',
    description: '[[Heat]] recovery chiller.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcChiller', 'IfcChillerHEATRECOVERY'],
  },

  IFCCHILLERWATERCOOLED: {
    name:        'IfcChillerWATERCOOLED',
    label:       'Water Cooled',
    description: '[[Water]] cooled chiller.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcChiller', 'IfcChillerWATERCOOLED'],
  },

  IFCCHIMNEY: {
    name:        'IfcChimney',
    label:       'Chimney',
    description: 'Chimneys are typically vertical, or as near as vertical, parts of the construction of a building and part of the building fabric. Often constructed by pre-cast or insitu concrete, today seldom by bric',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcChimney'],
  },

  IFCCOIL: {
    name:        'IfcCoil',
    label:       'Coil',
    description: 'A coil is a device used to provide heat transfer between non-mixing media. A common example is a cooling coil, which utilizes a finned coil in which circulates chilled water, antifreeze, or refrigeran',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcCoil'],
  },

  IFCCOILDXCOOLINGCOIL: {
    name:        'IfcCoilDXCOOLINGCOIL',
    label:       'Dxcooling Coil',
    description: 'Cooling coil using a refrigerant to cool the air stream directly.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcCoil', 'IfcCoilDXCOOLINGCOIL'],
  },

  IFCCOILELECTRICHEATINGCOIL: {
    name:        'IfcCoilELECTRICHEATINGCOIL',
    label:       'Electric Heating Coil',
    description: 'Heating coil using electricity as a heating source.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcCoil', 'IfcCoilELECTRICHEATINGCOIL'],
  },

  IFCCOILGASHEATINGCOIL: {
    name:        'IfcCoilGASHEATINGCOIL',
    label:       'Gas Heating Coil',
    description: 'Heating coil using gas as a heating source.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcCoil', 'IfcCoilGASHEATINGCOIL'],
  },

  IFCCOILHYDRONICCOIL: {
    name:        'IfcCoilHYDRONICCOIL',
    label:       'Hydronic Coil',
    description: 'Cooling or Heating coil that uses a hydronic fluid as a cooling or heating source.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcCoil', 'IfcCoilHYDRONICCOIL'],
  },

  IFCCOILSTEAMHEATINGCOIL: {
    name:        'IfcCoilSTEAMHEATINGCOIL',
    label:       'Steam Heating Coil',
    description: 'Heating coil using steam as heating source.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcCoil', 'IfcCoilSTEAMHEATINGCOIL'],
  },

  IFCCOILWATERCOOLINGCOIL: {
    name:        'IfcCoilWATERCOOLINGCOIL',
    label:       'Water Cooling Coil',
    description: 'Cooling coil using chilled water. HYDRONICCOIL supercedes this enumerator.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcCoil', 'IfcCoilWATERCOOLINGCOIL'],
  },

  IFCCOILWATERHEATINGCOIL: {
    name:        'IfcCoilWATERHEATINGCOIL',
    label:       'Water Heating Coil',
    description: 'Heating coil using hot water as a heating source. HYDRONICCOIL supercedes this enumerator.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcCoil', 'IfcCoilWATERHEATINGCOIL'],
  },

  IFCCOLUMN: {
    name:        'IfcColumn',
    label:       'Column',
    description: 'An [[IfcColumn]] is a vertical structural or architectural member which often is aligned with a structural grid intersection. In most cases it represents a vertical, or nearly vertical, structural mem',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcColumn'],
  },

  IFCCOLUMNCOLUMN: {
    name:        'IfcColumnCOLUMN',
    label:       'Column',
    description: 'A usually vertical member that may be load bearing and requiring resistance to vertical forces by compression but also sometimes to lateral forces.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcColumn', 'IfcColumnCOLUMN'],
  },

  IFCCOLUMNPIERSTEM: {
    name:        'IfcColumnPIERSTEM',
    label:       'Pier Stem',
    description: 'An individual vertical part of a pier, may be a simple column, i.e. no breakdown into segments or separate structural parts such as flanges and web(s), or may be an aggregation of segments and/or part',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcColumn', 'IfcColumnPIERSTEM'],
  },

  IFCCOLUMNPIERSTEM_SEGMENT: {
    name:        'IfcColumnPIERSTEM_SEGMENT',
    label:       'Pier Stem Segment',
    description: 'A vertical segment of a pier column.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcColumn', 'IfcColumnPIERSTEM_SEGMENT'],
  },

  IFCCOLUMNPILASTER: {
    name:        'IfcColumnPILASTER',
    label:       'Pilaster',
    description: 'A column element embedded within a wall that can be required to be load bearing but may also only be used for decorative purposes.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcColumn', 'IfcColumnPILASTER'],
  },

  IFCCOLUMNSTANDCOLUMN: {
    name:        'IfcColumnSTANDCOLUMN',
    label:       'Stand Column',
    description: 'A column transmitting vertical loads from a superstructure to an arch below it.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcColumn', 'IfcColumnSTANDCOLUMN'],
  },

  IFCCOMMUNICATIONSAPPLIANCE: {
    name:        'IfcCommunicationsAppliance',
    label:       'Communications Appliance',
    description: 'A communications appliance transmits and receives electronic or digital information as data or sound.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcCommunicationsAppliance'],
  },

  IFCCOMMUNICATIONSAPPLIANCEANTENNA: {
    name:        'IfcCommunicationsApplianceANTENNA',
    label:       'Antenna',
    description: 'A transducer designed to transmit or receive electromagnetic waves.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcCommunicationsAppliance', 'IfcCommunicationsApplianceANTENNA'],
  },

  IFCCOMMUNICATIONSAPPLIANCEAUTOMATON: {
    name:        'IfcCommunicationsApplianceAUTOMATON',
    label:       'Automaton',
    description: 'A self-acting artificial device, the behaviour of which is governed either in a stepwise manner by given decision rules or continuously in time by defined relationships, while the output variables of',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcCommunicationsAppliance', 'IfcCommunicationsApplianceAUTOMATON'],
  },

  IFCCOMMUNICATIONSAPPLIANCECOMPUTER: {
    name:        'IfcCommunicationsApplianceCOMPUTER',
    label:       'Computer',
    description: 'A desktop, laptop, tablet, or other type of computer that can be moved from one place to another and connected to an electrical supply via a plugged outlet.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcCommunicationsAppliance', 'IfcCommunicationsApplianceCOMPUTER'],
  },

  IFCCOMMUNICATIONSAPPLIANCEFAX: {
    name:        'IfcCommunicationsApplianceFAX',
    label:       'Fax',
    description: 'A machine that has the primary function of transmitting a facsimile copy of printed matter using a telephone line.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcCommunicationsAppliance', 'IfcCommunicationsApplianceFAX'],
  },

  IFCCOMMUNICATIONSAPPLIANCEGATEWAY: {
    name:        'IfcCommunicationsApplianceGATEWAY',
    label:       'Gateway',
    description: 'A gateway connects multiple network segments with different protocols at all layers (layers 1-7) of the Open Systems Interconnection (OSI) model.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcCommunicationsAppliance', 'IfcCommunicationsApplianceGATEWAY'],
  },

  IFCCOMMUNICATIONSAPPLIANCEINTELLIGENTPERIPHERAL: {
    name:        'IfcCommunicationsApplianceINTELLIGENTPERIPHERAL',
    label:       'Intelligent Peripheral',
    description: 'An intelligent peripheral is a device that offers a variety of specialized resources according to the corresponding service logical program under the control of SCP. These resources contain the receiv',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcCommunicationsAppliance', 'IfcCommunicationsApplianceINTELLIGENTPERIPHERAL'],
  },

  IFCCOMMUNICATIONSAPPLIANCEIPNETWORKEQUIPMENT: {
    name:        'IfcCommunicationsApplianceIPNETWORKEQUIPMENT',
    label:       'IP Network Equipment',
    description: 'An IP network equipment is a device that provides IP data transmission channel for telecom subsystems or other subsystems e.g., routers, network switches or firewalls.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcCommunicationsAppliance', 'IfcCommunicationsApplianceIPNETWORKEQUIPMENT'],
  },

  IFCCOMMUNICATIONSAPPLIANCELINESIDEELECTRONICUNIT: {
    name:        'IfcCommunicationsApplianceLINESIDEELECTRONICUNIT',
    label:       'Line Side Electronic Unit',
    description: 'The lineside electronic unit (LEU) is the interface between the balise and interlocking in railway. The LEU acquires the information from the interlocking, and sends the appropriate information to the',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcCommunicationsAppliance', 'IfcCommunicationsApplianceLINESIDEELECTRONICUNIT'],
  },

  IFCCOMMUNICATIONSAPPLIANCEMODEM: {
    name:        'IfcCommunicationsApplianceMODEM',
    label:       'Modem',
    description: 'A modem (from modulator-demodulator) is a device that modulates an analog carrier signal to encode digital information, and also demodulates such a carrier signal to decode the transmitted information',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcCommunicationsAppliance', 'IfcCommunicationsApplianceMODEM'],
  },

  IFCCOMMUNICATIONSAPPLIANCENETWORKAPPLIANCE: {
    name:        'IfcCommunicationsApplianceNETWORKAPPLIANCE',
    label:       'Network Appliance',
    description: 'A network appliance performs a dedicated function such as firewall protection, content filtering, load balancing, or equipment management.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcCommunicationsAppliance', 'IfcCommunicationsApplianceNETWORKAPPLIANCE'],
  },

  IFCCOMMUNICATIONSAPPLIANCENETWORKBRIDGE: {
    name:        'IfcCommunicationsApplianceNETWORKBRIDGE',
    label:       'Network Bridge',
    description: 'A network bridge connects multiple network segments at the data link layer (layer 2) of the OSI model, and the term layer 2 switch is very often used interchangeably with bridge.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcCommunicationsAppliance', 'IfcCommunicationsApplianceNETWORKBRIDGE'],
  },

  IFCCOMMUNICATIONSAPPLIANCENETWORKHUB: {
    name:        'IfcCommunicationsApplianceNETWORKHUB',
    label:       'Network Hub',
    description: 'A network hub connects multiple network segments at the physical layer (layer 1) of the OSI model.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcCommunicationsAppliance', 'IfcCommunicationsApplianceNETWORKHUB'],
  },

  IFCCOMMUNICATIONSAPPLIANCEOPTICALLINETERMINAL: {
    name:        'IfcCommunicationsApplianceOPTICALLINETERMINAL',
    label:       'Opticalline Terminal',
    description: 'An optical line terminal is a service provider endpoint of a passive or active optical network. It is the terminal equipment for connecting fiber optic trunks.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcCommunicationsAppliance', 'IfcCommunicationsApplianceOPTICALLINETERMINAL'],
  },

  IFCCOMMUNICATIONSAPPLIANCEOPTICALNETWORKUNIT: {
    name:        'IfcCommunicationsApplianceOPTICALNETWORKUNIT',
    label:       'Optical Network Unit',
    description: 'An optical network unit is a kind of optical transmission network connection equipment which is installed at user side.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcCommunicationsAppliance', 'IfcCommunicationsApplianceOPTICALNETWORKUNIT'],
  },

  IFCCOMMUNICATIONSAPPLIANCEPRINTER: {
    name:        'IfcCommunicationsAppliancePRINTER',
    label:       'Printer',
    description: 'A machine that has the primary function of printing text and/or graphics onto paper or other media.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcCommunicationsAppliance', 'IfcCommunicationsAppliancePRINTER'],
  },

  IFCCOMMUNICATIONSAPPLIANCERADIOBLOCKCENTER: {
    name:        'IfcCommunicationsApplianceRADIOBLOCKCENTER',
    label:       'Radio Block Center',
    description: 'A radio block center is a specialised computing device in railway with specification for generating Movement Authorities (MA) and transmitting it to trains. It gets information from signalling control',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcCommunicationsAppliance', 'IfcCommunicationsApplianceRADIOBLOCKCENTER'],
  },

  IFCCOMMUNICATIONSAPPLIANCEREPEATER: {
    name:        'IfcCommunicationsApplianceREPEATER',
    label:       'Repeater',
    description: 'A repeater is an electronic device that receives a signal and retransmits it at a higher level and/or higher power, or onto the other side of an obstruction, so that the signal can cover longer distan',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcCommunicationsAppliance', 'IfcCommunicationsApplianceREPEATER'],
  },

  IFCCOMMUNICATIONSAPPLIANCEROUTER: {
    name:        'IfcCommunicationsApplianceROUTER',
    label:       'Router',
    description: 'A router is a networking device whose software and hardware are usually tailored to the tasks of routing and forwarding information. For example, on the Internet, information is directed to various pa',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcCommunicationsAppliance', 'IfcCommunicationsApplianceROUTER'],
  },

  IFCCOMMUNICATIONSAPPLIANCESCANNER: {
    name:        'IfcCommunicationsApplianceSCANNER',
    label:       'Scanner',
    description: 'A machine that has the primary function of scanning the content of printed matter and converting it to digital format that can be stored in a computer.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcCommunicationsAppliance', 'IfcCommunicationsApplianceSCANNER'],
  },

  IFCCOMMUNICATIONSAPPLIANCETELECOMMAND: {
    name:        'IfcCommunicationsApplianceTELECOMMAND',
    label:       'Telecommand',
    description: 'A system sending command to control and monitor the switches and circuit breakers or systems directly or not connected (e.g. via wires) within the traction power system remotely.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcCommunicationsAppliance', 'IfcCommunicationsApplianceTELECOMMAND'],
  },

  IFCCOMMUNICATIONSAPPLIANCETELEPHONYEXCHANGE: {
    name:        'IfcCommunicationsApplianceTELEPHONYEXCHANGE',
    label:       'Telephony Exchange',
    description: 'A telephony exchange is a device that ensures the routing of telephone calls and communications.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcCommunicationsAppliance', 'IfcCommunicationsApplianceTELEPHONYEXCHANGE'],
  },

  IFCCOMMUNICATIONSAPPLIANCETRANSITIONCOMPONENT: {
    name:        'IfcCommunicationsApplianceTRANSITIONCOMPONENT',
    label:       'Transition Component',
    description: 'A transition component is a minor active device that converts electric signals to optical signals at the sender, and converts optical signals to electric signals at the receiver.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcCommunicationsAppliance', 'IfcCommunicationsApplianceTRANSITIONCOMPONENT'],
  },

  IFCCOMMUNICATIONSAPPLIANCETRANSPONDER: {
    name:        'IfcCommunicationsApplianceTRANSPONDER',
    label:       'Transponder',
    description: 'A transponder is a communication, monitoring, or control device that, upon receiving a signal, emits a different signal in response. Transponders can be either passive or active (e.g., electronic beac',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcCommunicationsAppliance', 'IfcCommunicationsApplianceTRANSPONDER'],
  },

  IFCCOMMUNICATIONSAPPLIANCETRANSPORTEQUIPMENT: {
    name:        'IfcCommunicationsApplianceTRANSPORTEQUIPMENT',
    label:       'Transport Equipment',
    description: 'A transport equipment is a network element responsible for providing functionality of transport, multiplexing, switching, management and supervision of transmission channels between different hosts.th',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcCommunicationsAppliance', 'IfcCommunicationsApplianceTRANSPORTEQUIPMENT'],
  },

  IFCCOMPRESSOR: {
    name:        'IfcCompressor',
    label:       'Compressor',
    description: 'A compressor is a device that compresses a fluid typically used in a refrigeration circuit.',
    domain:      'TGA / Förderung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowMovingDevice', 'IfcCompressor'],
  },

  IFCCOMPRESSORBOOSTER: {
    name:        'IfcCompressorBOOSTER',
    label:       'Booster',
    description: 'Positive-displacement reciprocating compressor where pressure is increased by a booster.',
    domain:      'TGA / Förderung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowMovingDevice', 'IfcCompressor', 'IfcCompressorBOOSTER'],
  },

  IFCCOMPRESSORDYNAMIC: {
    name:        'IfcCompressorDYNAMIC',
    label:       'Dynamic',
    description: 'The pressure of refrigerant vapor is increased by a continuous transfer of angular momentum from a rotating member to the vapor followed by conversion of this momentum into static pressure.',
    domain:      'TGA / Förderung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowMovingDevice', 'IfcCompressor', 'IfcCompressorDYNAMIC'],
  },

  IFCCOMPRESSORHERMETIC: {
    name:        'IfcCompressorHERMETIC',
    label:       'Hermetic',
    description: 'Positive-displacement reciprocating compressor where the motor and compressor are contained within the same housing, with the motor shaft integral with the compressor crankshaft and the motor in conta',
    domain:      'TGA / Förderung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowMovingDevice', 'IfcCompressor', 'IfcCompressorHERMETIC'],
  },

  IFCCOMPRESSOROPENTYPE: {
    name:        'IfcCompressorOPENTYPE',
    label:       'Open Type',
    description: 'Positive-displacement reciprocating compressor where the shaft extends through a seal in the crankcase for an external drive.',
    domain:      'TGA / Förderung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowMovingDevice', 'IfcCompressor', 'IfcCompressorOPENTYPE'],
  },

  IFCCOMPRESSORRECIPROCATING: {
    name:        'IfcCompressorRECIPROCATING',
    label:       'Reciprocating',
    description: 'Positive-displacement compressor using a piston driven by a connecting rod from a crankshaft.',
    domain:      'TGA / Förderung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowMovingDevice', 'IfcCompressor', 'IfcCompressorRECIPROCATING'],
  },

  IFCCOMPRESSORROLLINGPISTON: {
    name:        'IfcCompressorROLLINGPISTON',
    label:       'Rolling Piston',
    description: 'Positive-displacement rotary compressor using a roller mounted on the eccentric of a shaft with a single vane in the nonrotating cylindrical housing.',
    domain:      'TGA / Förderung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowMovingDevice', 'IfcCompressor', 'IfcCompressorROLLINGPISTON'],
  },

  IFCCOMPRESSORROTARY: {
    name:        'IfcCompressorROTARY',
    label:       'Rotary',
    description: 'Positive-displacement compressor using a roller or rotor device.',
    domain:      'TGA / Förderung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowMovingDevice', 'IfcCompressor', 'IfcCompressorROTARY'],
  },

  IFCCOMPRESSORROTARYVANE: {
    name:        'IfcCompressorROTARYVANE',
    label:       'Rotary Vane',
    description: 'Positive-displacement rotary compressor using a roller mounted on the eccentric of a shaft with multiple vanes in the nontotating cylindrical housing.',
    domain:      'TGA / Förderung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowMovingDevice', 'IfcCompressor', 'IfcCompressorROTARYVANE'],
  },

  IFCCOMPRESSORSCROLL: {
    name:        'IfcCompressorSCROLL',
    label:       'Scroll',
    description: 'Positive-displacement compressor using two inter-fitting, spiral-shaped scroll members.',
    domain:      'TGA / Förderung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowMovingDevice', 'IfcCompressor', 'IfcCompressorSCROLL'],
  },

  IFCCOMPRESSORSEMIHERMETIC: {
    name:        'IfcCompressorSEMIHERMETIC',
    label:       'Semihermetic',
    description: 'Positive-displacement reciprocating compressor where the hermetic compressors use bolted construction amenable to field repair.',
    domain:      'TGA / Förderung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowMovingDevice', 'IfcCompressor', 'IfcCompressorSEMIHERMETIC'],
  },

  IFCCOMPRESSORSINGLESCREW: {
    name:        'IfcCompressorSINGLESCREW',
    label:       'Single Screw',
    description: 'Positive-displacement rotary compressor using a single cylindrical main rotor that works with a pair of gate rotors.',
    domain:      'TGA / Förderung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowMovingDevice', 'IfcCompressor', 'IfcCompressorSINGLESCREW'],
  },

  IFCCOMPRESSORSINGLESTAGE: {
    name:        'IfcCompressorSINGLESTAGE',
    label:       'Single Stage',
    description: 'Positive-displacement reciprocating compressor where vapor is compressed in a single stage.',
    domain:      'TGA / Förderung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowMovingDevice', 'IfcCompressor', 'IfcCompressorSINGLESTAGE'],
  },

  IFCCOMPRESSORTROCHOIDAL: {
    name:        'IfcCompressorTROCHOIDAL',
    label:       'Trochoidal',
    description: 'Positive-displacement compressor using a rolling motion of one circle outside or inside the circumference of a basic circle and produce either epitrochoids or hypotrochoids.',
    domain:      'TGA / Förderung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowMovingDevice', 'IfcCompressor', 'IfcCompressorTROCHOIDAL'],
  },

  IFCCOMPRESSORTWINSCREW: {
    name:        'IfcCompressorTWINSCREW',
    label:       'Twin Screw',
    description: 'Positive-displacement rotary compressor using two mating helically grooved rotors, male (lobes) and female (flutes) in a stationary housing with inlet and outlet gas ports.',
    domain:      'TGA / Förderung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowMovingDevice', 'IfcCompressor', 'IfcCompressorTWINSCREW'],
  },

  IFCCOMPRESSORWELDEDSHELLHERMETIC: {
    name:        'IfcCompressorWELDEDSHELLHERMETIC',
    label:       'Welded Shell Hermetic',
    description: 'Positive-displacement reciprocating compressor where the motor compressor is mounted inside a steel shell, which, in turn is sealed by welding.',
    domain:      'TGA / Förderung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowMovingDevice', 'IfcCompressor', 'IfcCompressorWELDEDSHELLHERMETIC'],
  },

  IFCCONDENSER: {
    name:        'IfcCondenser',
    label:       'Condenser',
    description: 'A condenser is a device that is used to dissipate heat, typically by condensing a substance such as a refrigerant from its gaseous to its liquid state.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcCondenser'],
  },

  IFCCONDENSERAIRCOOLED: {
    name:        'IfcCondenserAIRCOOLED',
    label:       'Air Cooled',
    description: 'A condenser in which heat is transferred to an air-stream.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcCondenser', 'IfcCondenserAIRCOOLED'],
  },

  IFCCONDENSEREVAPORATIVECOOLED: {
    name:        'IfcCondenserEVAPORATIVECOOLED',
    label:       'Evaporative Cooled',
    description: 'A condenser that is cooled evaporatively.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcCondenser', 'IfcCondenserEVAPORATIVECOOLED'],
  },

  IFCCONDENSERWATERCOOLED: {
    name:        'IfcCondenserWATERCOOLED',
    label:       'Water Cooled',
    description: '[[Water]]-cooled condenser with unspecified operation.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcCondenser', 'IfcCondenserWATERCOOLED'],
  },

  IFCCONDENSERWATERCOOLEDBRAZEDPLATE: {
    name:        'IfcCondenserWATERCOOLEDBRAZEDPLATE',
    label:       'Water Cooled Brazedplate',
    description: '[[Water]]-cooled condenser with plates brazed together to form an assembly of separate channels.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcCondenser', 'IfcCondenserWATERCOOLEDBRAZEDPLATE'],
  },

  IFCCONDENSERWATERCOOLEDSHELLCOIL: {
    name:        'IfcCondenserWATERCOOLEDSHELLCOIL',
    label:       'Water Cooled Shell Coil',
    description: '[[Water]]-cooled condenser with cooling water circulated through one or more continuous or assembled coils contained within the shell.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcCondenser', 'IfcCondenserWATERCOOLEDSHELLCOIL'],
  },

  IFCCONDENSERWATERCOOLEDSHELLTUBE: {
    name:        'IfcCondenserWATERCOOLEDSHELLTUBE',
    label:       'Water Cooled Shell Tube',
    description: '[[Water]]-cooled condenser with cooling water circulated through one or more tubes contained within the shell.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcCondenser', 'IfcCondenserWATERCOOLEDSHELLTUBE'],
  },

  IFCCONDENSERWATERCOOLEDTUBEINTUBE: {
    name:        'IfcCondenserWATERCOOLEDTUBEINTUBE',
    label:       'Water Cooled Tube In Tube',
    description: '[[Water]]-cooled condenser consisting of one or more assemblies of two tubes, one within the other.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcCondenser', 'IfcCondenserWATERCOOLEDTUBEINTUBE'],
  },

  IFCCONTEXT: {
    name:        'IfcContext',
    label:       'Context',
    description: '[[IfcContext]] is the generalization of a project context in which objects, type objects, property sets, and properties are defined. The [[IfcProject]] as subtype of [[IfcContext]] provides the contex',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcContext'],
  },

  IFCCONTROL: {
    name:        'IfcControl',
    label:       'Control',
    description: '[[IfcControl]] is the abstract generalization of all concepts that control or constrain the utilization of products, processes, or resources in general. It can be seen as a regulation, cost schedule,',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl'],
  },

  IFCCONTROLLER: {
    name:        'IfcController',
    label:       'Controller',
    description: 'A controller is a device that monitors inputs and controls outputs within a building automation system.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcController'],
  },

  IFCCONTROLLERFLOATING: {
    name:        'IfcControllerFLOATING',
    label:       'Floating',
    description: 'Output increases or decreases at a constant or accelerating rate.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcController', 'IfcControllerFLOATING'],
  },

  IFCCONTROLLERMULTIPOSITION: {
    name:        'IfcControllerMULTIPOSITION',
    label:       'Multiposition',
    description: 'Output is discrete value, can be one of three or more values.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcController', 'IfcControllerMULTIPOSITION'],
  },

  IFCCONTROLLERPROGRAMMABLE: {
    name:        'IfcControllerPROGRAMMABLE',
    label:       'Programmable',
    description: 'Output is programmable such as Discrete Digital Control (DDC).',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcController', 'IfcControllerPROGRAMMABLE'],
  },

  IFCCONTROLLERPROPORTIONAL: {
    name:        'IfcControllerPROPORTIONAL',
    label:       'Proportional',
    description: 'Output is proportional to the control error and optionally time integral and derivative.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcController', 'IfcControllerPROPORTIONAL'],
  },

  IFCCONTROLLERTWOPOSITION: {
    name:        'IfcControllerTWOPOSITION',
    label:       'Twoposition',
    description: 'Output can be either on or off.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcController', 'IfcControllerTWOPOSITION'],
  },

  IFCCONVEYORSEGMENT: {
    name:        'IfcConveyorSegment',
    label:       'Conveyor Segment',
    description: 'A conveyor segment defines an occurrence of a flow segment/ continuous run within a conveyor system that joins two sections of the system. these can utilise different carrying methods such as belt, ro',
    domain:      'TGA / Verteilung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowSegment', 'IfcConveyorSegment'],
  },

  IFCCONVEYORSEGMENTBELTCONVEYOR: {
    name:        'IfcConveyorSegmentBELTCONVEYOR',
    label:       'Belt Conveyor',
    description: 'An endless belt for carrying material without stretching.',
    domain:      'TGA / Verteilung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowSegment', 'IfcConveyorSegment', 'IfcConveyorSegmentBELTCONVEYOR'],
  },

  IFCCONVEYORSEGMENTBUCKETCONVEYOR: {
    name:        'IfcConveyorSegmentBUCKETCONVEYOR',
    label:       'Bucket Conveyor',
    description: 'A conveyor in the form of connected buckets or segments that move in a continuous loop',
    domain:      'TGA / Verteilung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowSegment', 'IfcConveyorSegment', 'IfcConveyorSegmentBUCKETCONVEYOR'],
  },

  IFCCONVEYORSEGMENTCHUTECONVEYOR: {
    name:        'IfcConveyorSegmentCHUTECONVEYOR',
    label:       'Chute Conveyor',
    description: 'Gravity-operated conveyor where media descends through a trough or chute.',
    domain:      'TGA / Verteilung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowSegment', 'IfcConveyorSegment', 'IfcConveyorSegmentCHUTECONVEYOR'],
  },

  IFCCONVEYORSEGMENTSCREWCONVEYOR: {
    name:        'IfcConveyorSegmentSCREWCONVEYOR',
    label:       'Screw Conveyor',
    description: 'composed of a longitudinal screw in a trough or pipe that rotates to force media through the segment',
    domain:      'TGA / Verteilung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowSegment', 'IfcConveyorSegment', 'IfcConveyorSegmentSCREWCONVEYOR'],
  },

  IFCCOOLEDBEAM: {
    name:        'IfcCooledBeam',
    label:       'Cooled Beam',
    description: 'A cooled beam (or chilled beam) is a device typically used to cool air by circulating a fluid such as chilled water through exposed finned tubes above a space. Typically mounted overhead near or withi',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcCooledBeam'],
  },

  IFCCOOLEDBEAMACTIVE: {
    name:        'IfcCooledBeamACTIVE',
    label:       'Active',
    description: 'An active or ventilated cooled beam provides cooling (and heating) but can also function as an air terminal in a ventilation system.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcCooledBeam', 'IfcCooledBeamACTIVE'],
  },

  IFCCOOLEDBEAMPASSIVE: {
    name:        'IfcCooledBeamPASSIVE',
    label:       'Passive',
    description: 'A passive or static cooled beam provides cooling (and heating) to a room or zone.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcCooledBeam', 'IfcCooledBeamPASSIVE'],
  },

  IFCCOOLINGTOWER: {
    name:        'IfcCoolingTower',
    label:       'Cooling Tower',
    description: 'A cooling tower is a device which rejects heat to ambient air by circulating a fluid such as water through it to reduce its temperature by partial evaporation.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcCoolingTower'],
  },

  IFCCOOLINGTOWERMECHANICALFORCEDDRAFT: {
    name:        'IfcCoolingTowerMECHANICALFORCEDDRAFT',
    label:       'Mechanical Forced Draft',
    description: 'Air flow is produced by a mechanical device, typically one or more fans, located on the inlet air side of the cooling tower.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcCoolingTower', 'IfcCoolingTowerMECHANICALFORCEDDRAFT'],
  },

  IFCCOOLINGTOWERMECHANICALINDUCEDDRAFT: {
    name:        'IfcCoolingTowerMECHANICALINDUCEDDRAFT',
    label:       'Mechanical Induced Draft',
    description: 'Air flow is produced by a mechanical device, typically one or more fans, located on the air outlet side of the cooling tower.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcCoolingTower', 'IfcCoolingTowerMECHANICALINDUCEDDRAFT'],
  },

  IFCCOOLINGTOWERNATURALDRAFT: {
    name:        'IfcCoolingTowerNATURALDRAFT',
    label:       'Natural Draft',
    description: 'Air flow is produced naturally.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcCoolingTower', 'IfcCoolingTowerNATURALDRAFT'],
  },

  IFCCOSTITEM: {
    name:        'IfcCostItem',
    label:       'Cost Item',
    description: 'An [[IfcCostItem]] describes a cost or financial value together with descriptive information that describes its context in a form that enables it to be used within a cost schedule. An [[IfcCostItem]]',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcCostItem'],
  },

  IFCCOSTSCHEDULE: {
    name:        'IfcCostSchedule',
    label:       'Cost Schedule',
    description: 'An [[IfcCostSchedule]] brings together instances of [[IfcCostItem]] either for the purpose of identifying purely cost information as in an estimate for constructions costs or for including cost inform',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcCostSchedule'],
  },

  IFCCOSTSCHEDULEBUDGET: {
    name:        'IfcCostScheduleBUDGET',
    label:       'Budget',
    description: 'An allocation of money for a particular purpose.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcCostSchedule', 'IfcCostScheduleBUDGET'],
  },

  IFCCOSTSCHEDULECOSTPLAN: {
    name:        'IfcCostScheduleCOSTPLAN',
    label:       'Cost Plan',
    description: 'An assessment of the amount of money needing to be expended for a defined purpose based on incomplete information about the goods and services required for a construction or installation.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcCostSchedule', 'IfcCostScheduleCOSTPLAN'],
  },

  IFCCOSTSCHEDULEESTIMATE: {
    name:        'IfcCostScheduleESTIMATE',
    label:       'Estimate',
    description: 'An assessment of the amount of money needing to be expended for a defined purpose based on actual information about the goods and services required for a construction or installation.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcCostSchedule', 'IfcCostScheduleESTIMATE'],
  },

  IFCCOSTSCHEDULEPRICEDBILLOFQUANTITIES: {
    name:        'IfcCostSchedulePRICEDBILLOFQUANTITIES',
    label:       'Priced Bill of Quantities',
    description: 'A complete listing of all work items forming construction or installation works in which costs have been allocated to work items.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcCostSchedule', 'IfcCostSchedulePRICEDBILLOFQUANTITIES'],
  },

  IFCCOSTSCHEDULESCHEDULEOFRATES: {
    name:        'IfcCostScheduleSCHEDULEOFRATES',
    label:       'Schedule of Rates',
    description: 'A listing of each type of goods forming construction or installation works with the cost of purchase, construction/installation, overheads and profit assigned so that additional items of that type can',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcCostSchedule', 'IfcCostScheduleSCHEDULEOFRATES'],
  },

  IFCCOSTSCHEDULETENDER: {
    name:        'IfcCostScheduleTENDER',
    label:       'Tender',
    description: 'An offer to provide goods and services.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcCostSchedule', 'IfcCostScheduleTENDER'],
  },

  IFCCOSTSCHEDULEUNPRICEDBILLOFQUANTITIES: {
    name:        'IfcCostScheduleUNPRICEDBILLOFQUANTITIES',
    label:       'Unpriced Bill of Quantities',
    description: 'A complete listing of all work items forming construction or installation works in which costs have not yet been allocated to work items.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcCostSchedule', 'IfcCostScheduleUNPRICEDBILLOFQUANTITIES'],
  },

  IFCCOURSE: {
    name:        'IfcCourse',
    label:       'Course',
    description: 'A built element whose length greatly exceeds its thickness and often also its width, usually of a single material laid on site on top of another horizontal or nearly horizontal built element. A course',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcCourse'],
  },

  IFCCOURSEARMOUR: {
    name:        'IfcCourseARMOUR',
    label:       'Armour',
    description: 'An Aggregate layer whose primary function is to protect against erosion of the underlying material by water e.g. riprap.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcCourse', 'IfcCourseARMOUR'],
  },

  IFCCOURSEBALLASTBED: {
    name:        'IfcCourseBALLASTBED',
    label:       'Ballastbed',
    description: 'Layer composed of broken stones under the sleepers.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcCourse', 'IfcCourseBALLASTBED'],
  },

  IFCCOURSECORE: {
    name:        'IfcCourseCORE',
    label:       'Core',
    description: 'A core course is the bulk internal structure of aggregate structures.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcCourse', 'IfcCourseCORE'],
  },

  IFCCOURSEFILTER: {
    name:        'IfcCourseFILTER',
    label:       'Filter',
    description: 'An Intermediate layer whose primary function is to prevent the washing through of fine materials.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcCourse', 'IfcCourseFILTER'],
  },

  IFCCOURSEPAVEMENT: {
    name:        'IfcCoursePAVEMENT',
    label:       'Pavement',
    description: 'A layer within a pavement structure that forms a paved area or road.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcCourse', 'IfcCoursePAVEMENT'],
  },

  IFCCOURSEPROTECTION: {
    name:        'IfcCoursePROTECTION',
    label:       'Protection',
    description: 'Layer with the primary task to provide protection against erosion and scour.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcCourse', 'IfcCoursePROTECTION'],
  },

  IFCCOVERING: {
    name:        'IfcCovering',
    label:       'Covering',
    description: 'A covering is an element which covers some part of another element and is fully dependent on that other element. The [[IfcCovering]] defines the occurrence of a covering type, that (if given) is expre',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcCovering'],
  },

  IFCCOVERINGCEILING: {
    name:        'IfcCoveringCEILING',
    label:       'Ceiling',
    description: 'The covering is used to represent a ceiling.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcCovering', 'IfcCoveringCEILING'],
  },

  IFCCOVERINGCLADDING: {
    name:        'IfcCoveringCLADDING',
    label:       'Cladding',
    description: 'The covering is used to represent a cladding.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcCovering', 'IfcCoveringCLADDING'],
  },

  IFCCOVERINGCOPING: {
    name:        'IfcCoveringCOPING',
    label:       'Coping',
    description: 'A protective capping or covering of a wall or a parapet.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcCovering', 'IfcCoveringCOPING'],
  },

  IFCCOVERINGFLOORING: {
    name:        'IfcCoveringFLOORING',
    label:       'Flooring',
    description: 'The covering is used to represent a flooring.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcCovering', 'IfcCoveringFLOORING'],
  },

  IFCCOVERINGINSULATION: {
    name:        'IfcCoveringINSULATION',
    label:       'Insulation',
    description: 'The covering is used to insulate an element for thermal or acoustic purposes.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcCovering', 'IfcCoveringINSULATION'],
  },

  IFCCOVERINGMEMBRANE: {
    name:        'IfcCoveringMEMBRANE',
    label:       'Membrane',
    description: 'An impervious layer that could be used for e.g. roof covering (below tiling - that may be known as sarking etc.) or as a damp proof course membrane; also, waterproofing material on a bridge structure',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcCovering', 'IfcCoveringMEMBRANE'],
  },

  IFCCOVERINGMOLDING: {
    name:        'IfcCoveringMOLDING',
    label:       'Molding',
    description: 'The covering is used to represent a molding being a strip of material to cover the transition of surfaces (often between wall cladding and ceiling).',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcCovering', 'IfcCoveringMOLDING'],
  },

  IFCCOVERINGROOFING: {
    name:        'IfcCoveringROOFING',
    label:       'Roofing',
    description: 'The covering is used to represent a roof covering.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcCovering', 'IfcCoveringROOFING'],
  },

  IFCCOVERINGSKIRTINGBOARD: {
    name:        'IfcCoveringSKIRTINGBOARD',
    label:       'Skirting Board',
    description: 'The covering is used to represent a skirting board being a strip of material to cover the transition between the wall cladding and the flooring.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcCovering', 'IfcCoveringSKIRTINGBOARD'],
  },

  IFCCOVERINGSLEEVING: {
    name:        'IfcCoveringSLEEVING',
    label:       'Sleeving',
    description: 'The covering is used to isolate a distribution element from a space in which it is contained.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcCovering', 'IfcCoveringSLEEVING'],
  },

  IFCCOVERINGTOPPING: {
    name:        'IfcCoveringTOPPING',
    label:       'Topping',
    description: 'A layer of material used for leveling or flattening a surface.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcCovering', 'IfcCoveringTOPPING'],
  },

  IFCCOVERINGWRAPPING: {
    name:        'IfcCoveringWRAPPING',
    label:       'Wrapping',
    description: 'The covering is used for wrapping particularly of distribution elements using tape.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcCovering', 'IfcCoveringWRAPPING'],
  },

  IFCCURTAINWALL: {
    name:        'IfcCurtainWall',
    label:       'Curtain Wall',
    description: 'A curtain wall is a wall of a building which is an assembly of components, hung from the edge of the floor/roof structure rather than bearing on a floor. Curtain wall is represented as a building elem',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcCurtainWall'],
  },

  IFCDAMPER: {
    name:        'IfcDamper',
    label:       'Damper',
    description: 'A damper typically participates in an HVAC duct distribution system and is used to control or modulate the flow of air.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcDamper'],
  },

  IFCDAMPERBACKDRAFTDAMPER: {
    name:        'IfcDamperBACKDRAFTDAMPER',
    label:       'Back Draft Damper',
    description: 'Damper used for purposes of manually balancing pressure differences. Commonly operated by mechanical adjustment.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcDamper', 'IfcDamperBACKDRAFTDAMPER'],
  },

  IFCDAMPERBALANCINGDAMPER: {
    name:        'IfcDamperBALANCINGDAMPER',
    label:       'Balancing Damper',
    description: 'Backdraft damper used to restrict the movement of air in one direction. Commonly operated by mechanical spring.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcDamper', 'IfcDamperBALANCINGDAMPER'],
  },

  IFCDAMPERBLASTDAMPER: {
    name:        'IfcDamperBLASTDAMPER',
    label:       'Blast Damper',
    description: 'Blast damper used to prevent protect occupants and equipment against overpressures resultant of an explosion. Commonly operated by mechanical spring.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcDamper', 'IfcDamperBLASTDAMPER'],
  },

  IFCDAMPERCONTROLDAMPER: {
    name:        'IfcDamperCONTROLDAMPER',
    label:       'Control Damper',
    description: 'Control damper used to modulate the flow of air by adjusting the position of the blades. Commonly operated by an actuator of a building automation system.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcDamper', 'IfcDamperCONTROLDAMPER'],
  },

  IFCDAMPERFIREDAMPER: {
    name:        'IfcDamperFIREDAMPER',
    label:       'Fire Damper',
    description: 'Fire damper used to prevent the spread of fire for a specified duration. Commonly operated by fusable link that melts above a certain temperature.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcDamper', 'IfcDamperFIREDAMPER'],
  },

  IFCDAMPERFIRESMOKEDAMPER: {
    name:        'IfcDamperFIRESMOKEDAMPER',
    label:       'Fire Smoke Damper',
    description: 'Combination fire and smoke damper used to prevent the spread of fire and smoke. Commonly operated by a fusable link and a smoke detector.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcDamper', 'IfcDamperFIRESMOKEDAMPER'],
  },

  IFCDAMPERFUMEHOODEXHAUST: {
    name:        'IfcDamperFUMEHOODEXHAUST',
    label:       'Fumehood Exhaust',
    description: 'Fume hood exhaust damper. Commonly operated by actuator.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcDamper', 'IfcDamperFUMEHOODEXHAUST'],
  },

  IFCDAMPERGRAVITYDAMPER: {
    name:        'IfcDamperGRAVITYDAMPER',
    label:       'Gravity Damper',
    description: 'Gravity damper closes from the force of gravity. Commonly operated by gravitational weight.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcDamper', 'IfcDamperGRAVITYDAMPER'],
  },

  IFCDAMPERGRAVITYRELIEFDAMPER: {
    name:        'IfcDamperGRAVITYRELIEFDAMPER',
    label:       'Gravity Relief Damper',
    description: 'Gravity-relief damper used to allow air to move upon a buildup of enough pressure to overcome the gravitational force exerted upon the damper blades. Commonly operated by gravitational weight.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcDamper', 'IfcDamperGRAVITYRELIEFDAMPER'],
  },

  IFCDAMPERRELIEFDAMPER: {
    name:        'IfcDamperRELIEFDAMPER',
    label:       'Relief Damper',
    description: 'Relief damper used to allow air to move upon a buildup of a specified pressure differential. Commonly operated by mechanical spring.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcDamper', 'IfcDamperRELIEFDAMPER'],
  },

  IFCDAMPERSMOKEDAMPER: {
    name:        'IfcDamperSMOKEDAMPER',
    label:       'Smoke Damper',
    description: 'Smoke damper used to prevent the spread of smoke. Commonly operated by a smoke detector of a building automation system.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcDamper', 'IfcDamperSMOKEDAMPER'],
  },

  IFCDEEPFOUNDATION: {
    name:        'IfcDeepFoundation',
    label:       'Deep Foundation',
    description: 'Deep foundation is a type of foundation that transfers loads deeper than shallow foundation below the soft soils not capable of bearing the above structure. Depending on the soil strength it might hav',
    domain:      'Infrastruktur / Tiefbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcDeepFoundation'],
  },

  IFCDISCRETEACCESSORY: {
    name:        'IfcDiscreteAccessory',
    label:       'Discrete Accessory',
    description: 'A discrete accessory is a representation of different kinds of accessories included in or added to elements.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcDiscreteAccessory'],
  },

  IFCDISCRETEACCESSORYANCHORPLATE: {
    name:        'IfcDiscreteAccessoryANCHORPLATE',
    label:       'Anchorplate',
    description: 'An accessory consisting of a steel plate, shear stud connectors or welded-on rebar which is embedded into the surface of a concrete element so that other elements can be welded or bolted onto it later',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcDiscreteAccessory', 'IfcDiscreteAccessoryANCHORPLATE'],
  },

  IFCDISCRETEACCESSORYBIRDPROTECTION: {
    name:        'IfcDiscreteAccessoryBIRDPROTECTION',
    label:       'Bird Protection',
    description: 'A device that prevents a sitting down of birds at electrically critical points and thus birds are protected against electrical shocks and disturbances by short circuit are avoided.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcDiscreteAccessory', 'IfcDiscreteAccessoryBIRDPROTECTION'],
  },

  IFCDISCRETEACCESSORYBRACKET: {
    name:        'IfcDiscreteAccessoryBRACKET',
    label:       'Bracket',
    description: 'An L-shaped or similarly shaped accessory attached in a corner between elements to hold them together or to carry a secondary element.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcDiscreteAccessory', 'IfcDiscreteAccessoryBRACKET'],
  },

  IFCDISCRETEACCESSORYCABLEARRANGER: {
    name:        'IfcDiscreteAccessoryCABLEARRANGER',
    label:       'Cable Arranger',
    description: 'A cable arranger is a flexible accessory or a part of a component placed around cables to arrange and minimize flexing of them at the point where it is placed.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcDiscreteAccessory', 'IfcDiscreteAccessoryCABLEARRANGER'],
  },

  IFCDISCRETEACCESSORYELASTIC_CUSHION: {
    name:        'IfcDiscreteAccessoryELASTIC_CUSHION',
    label:       'Elastic Cushion',
    description: 'A track elastic cushion is a kind of layer set on grooved sides of a concrete base, which is used for mitigating the impact of longitudinal and lateral load on track structures. A track elastic cushio',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcDiscreteAccessory', 'IfcDiscreteAccessoryELASTIC_CUSHION'],
  },

  IFCDISCRETEACCESSORYEXPANSION_JOINT_DEVICE: {
    name:        'IfcDiscreteAccessoryEXPANSION_JOINT_DEVICE',
    label:       'Expansion Joint Device',
    description: 'Assembly connection element between construction elements to allow for thermic differential expansions.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcDiscreteAccessory', 'IfcDiscreteAccessoryEXPANSION_JOINT_DEVICE'],
  },

  IFCDISCRETEACCESSORYFILLER: {
    name:        'IfcDiscreteAccessoryFILLER',
    label:       'Filler',
    description: 'Sealant, gap filler rod, packing material or other used to close a gap.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcDiscreteAccessory', 'IfcDiscreteAccessoryFILLER'],
  },

  IFCDISCRETEACCESSORYFLASHING: {
    name:        'IfcDiscreteAccessoryFLASHING',
    label:       'Flashing',
    description: '[[Construction]] material used to manage the passage of water around objects.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcDiscreteAccessory', 'IfcDiscreteAccessoryFLASHING'],
  },

  IFCDISCRETEACCESSORYINSULATOR: {
    name:        'IfcDiscreteAccessoryINSULATOR',
    label:       'Insulator',
    description: 'A device designed to support and insulate a conductive element.;definition from IEC 151-15-39.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcDiscreteAccessory', 'IfcDiscreteAccessoryINSULATOR'],
  },

  IFCDISCRETEACCESSORYLOCK: {
    name:        'IfcDiscreteAccessoryLOCK',
    label:       'Lock',
    description: 'A lock is a mechanical or electronic fastening device that is released either by a physical object (e.g., key, fingerprint, RFID card, security token etc.), by supplying secret information (e.g., numb',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcDiscreteAccessory', 'IfcDiscreteAccessoryLOCK'],
  },

  IFCDISCRETEACCESSORYPANEL_STRENGTHENING: {
    name:        'IfcDiscreteAccessoryPANEL_STRENGTHENING',
    label:       'Panel Strengthening',
    description: 'A component that minimizes pump effects of the substructure.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcDiscreteAccessory', 'IfcDiscreteAccessoryPANEL_STRENGTHENING'],
  },

  IFCDISCRETEACCESSORYPOINTMACHINEMOUNTINGDEVICE: {
    name:        'IfcDiscreteAccessoryPOINTMACHINEMOUNTINGDEVICE',
    label:       'Point Machine Mounting Device',
    description: 'Point machine mounting device.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcDiscreteAccessory', 'IfcDiscreteAccessoryPOINTMACHINEMOUNTINGDEVICE'],
  },

  IFCDISCRETEACCESSORYPOINT_MACHINE_LOCKING_DEVICE: {
    name:        'IfcDiscreteAccessoryPOINT_MACHINE_LOCKING_DEVICE',
    label:       'Point Machine Locking Device',
    description: 'Point machine locking device.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcDiscreteAccessory', 'IfcDiscreteAccessoryPOINT_MACHINE_LOCKING_DEVICE'],
  },

  IFCDISCRETEACCESSORYRAILBRACE: {
    name:        'IfcDiscreteAccessoryRAILBRACE',
    label:       'Rail Brace',
    description: 'A rail component that prevents rails from tipping and twisting.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcDiscreteAccessory', 'IfcDiscreteAccessoryRAILBRACE'],
  },

  IFCDISCRETEACCESSORYRAILPAD: {
    name:        'IfcDiscreteAccessoryRAILPAD',
    label:       'Rail Pad',
    description: 'A non-metallic pad placed between rail and baseplate or rail and sleeper, bearer or slab.;definition from EN 13481-1.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcDiscreteAccessory', 'IfcDiscreteAccessoryRAILPAD'],
  },

  IFCDISCRETEACCESSORYRAIL_LUBRICATION: {
    name:        'IfcDiscreteAccessoryRAIL_LUBRICATION',
    label:       'Rail Lubrication',
    description: 'A device that prevents wearing of the rails throughout the flange of wheel to reduce noise emissions. It is often located at inner side of the outer rail in a curve or near turnouts (depends on functi',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcDiscreteAccessory', 'IfcDiscreteAccessoryRAIL_LUBRICATION'],
  },

  IFCDISCRETEACCESSORYRAIL_MECHANICAL_EQUIPMENT: {
    name:        'IfcDiscreteAccessoryRAIL_MECHANICAL_EQUIPMENT',
    label:       'Rail Mechanical Equipment',
    description: 'A rail mechanical equipment is a mechnical equipment installed at railside, like blocking device, speed regulator, bias loaded inspector, track scale or controllable retarder.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcDiscreteAccessory', 'IfcDiscreteAccessoryRAIL_MECHANICAL_EQUIPMENT'],
  },

  IFCDISCRETEACCESSORYSHOE: {
    name:        'IfcDiscreteAccessorySHOE',
    label:       'Shoe',
    description: 'A column shoe or a beam shoe (beam hanger) used to support or secure an element.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcDiscreteAccessory', 'IfcDiscreteAccessorySHOE'],
  },

  IFCDISCRETEACCESSORYSLIDINGCHAIR: {
    name:        'IfcDiscreteAccessorySLIDINGCHAIR',
    label:       'Sliding Chair',
    description: 'A component which supports and retains the stock rail and a flat surface upon which the foot of the switch rail slides.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcDiscreteAccessory', 'IfcDiscreteAccessorySLIDINGCHAIR'],
  },

  IFCDISCRETEACCESSORYSOUNDABSORPTION: {
    name:        'IfcDiscreteAccessorySOUNDABSORPTION',
    label:       'Sound Absorption',
    description: 'A component in the track for sound absorption and may also absorb vibrations. It is often used in combination with slab tracks.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcDiscreteAccessory', 'IfcDiscreteAccessorySOUNDABSORPTION'],
  },

  IFCDISCRETEACCESSORYTENSIONINGEQUIPMENT: {
    name:        'IfcDiscreteAccessoryTENSIONINGEQUIPMENT',
    label:       'Tensioning Equipment',
    description: 'An equipment used to maintain the tension of conductors or cables.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcDiscreteAccessory', 'IfcDiscreteAccessoryTENSIONINGEQUIPMENT'],
  },

  IFCDISTRIBUTIONBOARD: {
    name:        'IfcDistributionBoard',
    label:       'Distribution Board',
    description: 'A distribution board is a flow controller in which instances of electrical or communication devices are brought together at a single place for a particular purpose.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcDistributionBoard'],
  },

  IFCDISTRIBUTIONBOARDCONSUMERUNIT: {
    name:        'IfcDistributionBoardCONSUMERUNIT',
    label:       'Consumer Unit',
    description: 'A distribution point on the incoming electrical supply, typically in domestic premises, at which protective devices are located.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcDistributionBoard', 'IfcDistributionBoardCONSUMERUNIT'],
  },

  IFCDISTRIBUTIONBOARDDISPATCHINGBOARD: {
    name:        'IfcDistributionBoardDISPATCHINGBOARD',
    label:       'Dispatching Board',
    description: 'A distribution point at which voice and data communication signals are managed between communication devices.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcDistributionBoard', 'IfcDistributionBoardDISPATCHINGBOARD'],
  },

  IFCDISTRIBUTIONBOARDDISTRIBUTIONBOARD: {
    name:        'IfcDistributionBoardDISTRIBUTIONBOARD',
    label:       'Distribution Board',
    description: 'A distribution point at which connections are made for distribution of electrical circuits usually through protective devices.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcDistributionBoard', 'IfcDistributionBoardDISTRIBUTIONBOARD'],
  },

  IFCDISTRIBUTIONBOARDDISTRIBUTIONFRAME: {
    name:        'IfcDistributionBoardDISTRIBUTIONFRAME',
    label:       'Distribution Frame',
    description: 'A distribution frame is used to interconnect and manage wiring between active equipment and subscriber. It might be composed of multiple distribution boards and other components.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcDistributionBoard', 'IfcDistributionBoardDISTRIBUTIONFRAME'],
  },

  IFCDISTRIBUTIONBOARDMOTORCONTROLCENTRE: {
    name:        'IfcDistributionBoardMOTORCONTROLCENTRE',
    label:       'Motor Control Centre',
    description: 'A distribution point at which starting and control devices for major plant items are located.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcDistributionBoard', 'IfcDistributionBoardMOTORCONTROLCENTRE'],
  },

  IFCDISTRIBUTIONBOARDSWITCHBOARD: {
    name:        'IfcDistributionBoardSWITCHBOARD',
    label:       'Switch Board',
    description: 'A distribution point at which switching devices are located.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcDistributionBoard', 'IfcDistributionBoardSWITCHBOARD'],
  },

  IFCDISTRIBUTIONCHAMBERELEMENT: {
    name:        'IfcDistributionChamberElement',
    label:       'Distribution Chamber Element',
    description: 'A distribution chamber element defines a place at which distribution systems and their constituent elements may be inspected or through which they may travel.',
    domain:      'Infrastruktur / Kanal',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcDistributionChamberElement'],
  },

  IFCDISTRIBUTIONCHAMBERELEMENTFORMEDDUCT: {
    name:        'IfcDistributionChamberElementFORMEDDUCT',
    label:       'Formed Duct',
    description: 'Space formed in the ground for the passage of pipes, cables, ducts.',
    domain:      'Infrastruktur / Kanal',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcDistributionChamberElement', 'IfcDistributionChamberElementFORMEDDUCT'],
  },

  IFCDISTRIBUTIONCHAMBERELEMENTINSPECTIONCHAMBER: {
    name:        'IfcDistributionChamberElementINSPECTIONCHAMBER',
    label:       'Inspection Chamber',
    description: 'Chamber constructed on a drain, sewer or pipeline with a removable cover that permits visible inspection.',
    domain:      'Infrastruktur / Kanal',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcDistributionChamberElement', 'IfcDistributionChamberElementINSPECTIONCHAMBER'],
  },

  IFCDISTRIBUTIONCHAMBERELEMENTINSPECTIONPIT: {
    name:        'IfcDistributionChamberElementINSPECTIONPIT',
    label:       'Inspection Pit',
    description: 'Recess or chamber formed to permit access for inspection of substructure and services.',
    domain:      'Infrastruktur / Kanal',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcDistributionChamberElement', 'IfcDistributionChamberElementINSPECTIONPIT'],
  },

  IFCDISTRIBUTIONCHAMBERELEMENTMANHOLE: {
    name:        'IfcDistributionChamberElementMANHOLE',
    label:       'Manhole',
    description: 'Chamber constructed on a drain, sewer or pipeline with a removable cover that permits the entry of a person.',
    domain:      'Infrastruktur / Kanal',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcDistributionChamberElement', 'IfcDistributionChamberElementMANHOLE'],
  },

  IFCDISTRIBUTIONCHAMBERELEMENTMETERCHAMBER: {
    name:        'IfcDistributionChamberElementMETERCHAMBER',
    label:       'Meter Chamber',
    description: 'Chamber that houses a meter(s).',
    domain:      'Infrastruktur / Kanal',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcDistributionChamberElement', 'IfcDistributionChamberElementMETERCHAMBER'],
  },

  IFCDISTRIBUTIONCHAMBERELEMENTSUMP: {
    name:        'IfcDistributionChamberElementSUMP',
    label:       'Sump',
    description: 'Recessed or small chamber into which liquid is drained to facilitate its collection for removal.',
    domain:      'Infrastruktur / Kanal',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcDistributionChamberElement', 'IfcDistributionChamberElementSUMP'],
  },

  IFCDISTRIBUTIONCHAMBERELEMENTTRENCH: {
    name:        'IfcDistributionChamberElementTRENCH',
    label:       'Trench',
    description: 'Excavated chamber, the length of which typically exceeds the width.',
    domain:      'Infrastruktur / Kanal',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcDistributionChamberElement', 'IfcDistributionChamberElementTRENCH'],
  },

  IFCDISTRIBUTIONCHAMBERELEMENTVALVECHAMBER: {
    name:        'IfcDistributionChamberElementVALVECHAMBER',
    label:       'Valve Chamber',
    description: 'Chamber that houses a valve(s).',
    domain:      'Infrastruktur / Kanal',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcDistributionChamberElement', 'IfcDistributionChamberElementVALVECHAMBER'],
  },

  IFCDISTRIBUTIONCIRCUIT: {
    name:        'IfcDistributionCircuit',
    label:       'Distribution Circuit',
    description: 'A distribution circuit is a partition of a distribution system that is conditionally switched such as an electrical circuit.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionCircuit'],
  },

  IFCDISTRIBUTIONCONTROLELEMENT: {
    name:        'IfcDistributionControlElement',
    label:       'Distribution Control Element',
    description: 'The distribution element [[IfcDistributionControlElement]] defines occurrence elements of a building automation control system that are used to impart control over elements of a distribution system.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement'],
  },

  IFCDISTRIBUTIONELEMENT: {
    name:        'IfcDistributionElement',
    label:       'Distribution Element',
    description: '[[IfcDistributionElement]] is a generalization of all elements that participate in a distribution system.',
    domain:      'TGA',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement'],
  },

  IFCDISTRIBUTIONFLOWELEMENT: {
    name:        'IfcDistributionFlowElement',
    label:       'Distribution Flow Element',
    description: 'The distribution element [[IfcDistributionFlowElement]] defines occurrence elements of a distribution system that facilitate the distribution of energy or matter, such as air, water or power.',
    domain:      'TGA / Verteilung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement'],
  },

  IFCDISTRIBUTIONPORT: {
    name:        'IfcDistributionPort',
    label:       'Distribution Port',
    description: 'A distribution port is an inlet or outlet of a product through which a particular substance may flow.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcPort', 'IfcDistributionPort'],
  },

  IFCDISTRIBUTIONPORTCABLE: {
    name:        'IfcDistributionPortCABLE',
    label:       'Cable',
    description: 'Connection to cable segment or fitting for distribution of electricity.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcPort', 'IfcDistributionPort', 'IfcDistributionPortCABLE'],
  },

  IFCDISTRIBUTIONPORTCABLECARRIER: {
    name:        'IfcDistributionPortCABLECARRIER',
    label:       'Cable Carrier',
    description: 'Connection to cable carrier segment or fitting for enclosing cables.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcPort', 'IfcDistributionPort', 'IfcDistributionPortCABLECARRIER'],
  },

  IFCDISTRIBUTIONPORTDUCT: {
    name:        'IfcDistributionPortDUCT',
    label:       'Duct',
    description: 'Connection to duct segment or fitting for distribution of air.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcPort', 'IfcDistributionPort', 'IfcDistributionPortDUCT'],
  },

  IFCDISTRIBUTIONPORTPIPE: {
    name:        'IfcDistributionPortPIPE',
    label:       'Pipe',
    description: 'Connection to pipe segment or fitting for distribution of solid, liquid, or gas.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcPort', 'IfcDistributionPort', 'IfcDistributionPortPIPE'],
  },

  IFCDISTRIBUTIONPORTWIRELESS: {
    name:        'IfcDistributionPortWIRELESS',
    label:       'Wire Less',
    description: 'Wireless connection to communication appliances for distribution of data or communication.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcPort', 'IfcDistributionPort', 'IfcDistributionPortWIRELESS'],
  },

  IFCDISTRIBUTIONSYSTEM: {
    name:        'IfcDistributionSystem',
    label:       'Distribution System',
    description: 'A distribution system is a network designed to receive, store, maintain, distribute, or control the flow of a distribution media. A common example is a heating hot water system that consists of a pump',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem'],
  },

  IFCDISTRIBUTIONSYSTEMAIRCONDITIONING: {
    name:        'IfcDistributionSystemAIRCONDITIONING',
    label:       'Air Conditioning',
    description: 'Conditioned air distribution system for purposes of maintaining a temperature range within one or more spaces.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemAIRCONDITIONING'],
  },

  IFCDISTRIBUTIONSYSTEMAUDIOVISUAL: {
    name:        'IfcDistributionSystemAUDIOVISUAL',
    label:       'Audiovisual',
    description: 'A transport of a single media source, having audio and/or video streams.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemAUDIOVISUAL'],
  },

  IFCDISTRIBUTIONSYSTEMCATENARY_SYSTEM: {
    name:        'IfcDistributionSystemCATENARY_SYSTEM',
    label:       'Catenary System',
    description: 'A longitudinal distribution system that supports contact wires, including catenary wire droppers and stich wires.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemCATENARY_SYSTEM'],
  },

  IFCDISTRIBUTIONSYSTEMCHEMICAL: {
    name:        'IfcDistributionSystemCHEMICAL',
    label:       'Chemical',
    description: 'Arbitrary chemical further qualified by property set, such as for medical or industrial use.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemCHEMICAL'],
  },

  IFCDISTRIBUTIONSYSTEMCHILLEDWATER: {
    name:        'IfcDistributionSystemCHILLEDWATER',
    label:       'Chilled Water',
    description: 'Nonpotable chilled water, such as circulated through an evaporator.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemCHILLEDWATER'],
  },

  IFCDISTRIBUTIONSYSTEMCOMMUNICATION: {
    name:        'IfcDistributionSystemCOMMUNICATION',
    label:       'Communication',
    description: 'Communication',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemCOMMUNICATION'],
  },

  IFCDISTRIBUTIONSYSTEMCOMPRESSEDAIR: {
    name:        'IfcDistributionSystemCOMPRESSEDAIR',
    label:       'Compressed Air',
    description: 'Compressed air system.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemCOMPRESSEDAIR'],
  },

  IFCDISTRIBUTIONSYSTEMCONDENSERWATER: {
    name:        'IfcDistributionSystemCONDENSERWATER',
    label:       'Condenser Water',
    description: 'Nonpotable water, such as circulated through a condenser.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemCONDENSERWATER'],
  },

  IFCDISTRIBUTIONSYSTEMCONTROL: {
    name:        'IfcDistributionSystemCONTROL',
    label:       'Control',
    description: 'A transport or network dedicated to control system usage.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemCONTROL'],
  },

  IFCDISTRIBUTIONSYSTEMCONVEYING: {
    name:        'IfcDistributionSystemCONVEYING',
    label:       'Conveying',
    description: 'Arbitrary supply of substances.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemCONVEYING'],
  },

  IFCDISTRIBUTIONSYSTEMDATA: {
    name:        'IfcDistributionSystemDATA',
    label:       'Data',
    description: 'A network having general-purpose usage.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemDATA'],
  },

  IFCDISTRIBUTIONSYSTEMDISPOSAL: {
    name:        'IfcDistributionSystemDISPOSAL',
    label:       'Disposal',
    description: 'Arbitrary disposal of substances.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemDISPOSAL'],
  },

  IFCDISTRIBUTIONSYSTEMDOMESTICCOLDWATER: {
    name:        'IfcDistributionSystemDOMESTICCOLDWATER',
    label:       'Domestic Cold Water',
    description: 'Unheated potable water distribution system.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemDOMESTICCOLDWATER'],
  },

  IFCDISTRIBUTIONSYSTEMDOMESTICHOTWATER: {
    name:        'IfcDistributionSystemDOMESTICHOTWATER',
    label:       'Domestic Hot Water',
    description: 'Heated potable water distribution system.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemDOMESTICHOTWATER'],
  },

  IFCDISTRIBUTIONSYSTEMDRAINAGE: {
    name:        'IfcDistributionSystemDRAINAGE',
    label:       'Drainage',
    description: 'Drainage collection system.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemDRAINAGE'],
  },

  IFCDISTRIBUTIONSYSTEMEARTHING: {
    name:        'IfcDistributionSystemEARTHING',
    label:       'Earthing',
    description: 'A path for equipotential bonding, conducting current to the ground.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemEARTHING'],
  },

  IFCDISTRIBUTIONSYSTEMELECTRICAL: {
    name:        'IfcDistributionSystemELECTRICAL',
    label:       'Electrical',
    description: 'A circuit for delivering electrical power.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemELECTRICAL'],
  },

  IFCDISTRIBUTIONSYSTEMELECTROACOUSTIC: {
    name:        'IfcDistributionSystemELECTROACOUSTIC',
    label:       'Electro Acoustic',
    description: 'An amplified audio signal such as for loudspeakers.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemELECTROACOUSTIC'],
  },

  IFCDISTRIBUTIONSYSTEMEXHAUST: {
    name:        'IfcDistributionSystemEXHAUST',
    label:       'Exhaust',
    description: 'Exhaust air collection system for removing stale or noxious air from one or more spaces.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemEXHAUST'],
  },

  IFCDISTRIBUTIONSYSTEMFIREPROTECTION: {
    name:        'IfcDistributionSystemFIREPROTECTION',
    label:       'Fire Protection',
    description: 'Fire protection sprinkler system.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemFIREPROTECTION'],
  },

  IFCDISTRIBUTIONSYSTEMFIXEDTRANSMISSIONNETWORK: {
    name:        'IfcDistributionSystemFIXEDTRANSMISSIONNETWORK',
    label:       'Fixed Transmission Network',
    description: 'Represents all wired networks that provide a data transmission channel using optical fiber cables, copper cables or both. It aggregates many technologies that are based on the multiplexing method.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemFIXEDTRANSMISSIONNETWORK'],
  },

  IFCDISTRIBUTIONSYSTEMFUEL: {
    name:        'IfcDistributionSystemFUEL',
    label:       'Fuel',
    description: 'Arbitrary supply of fuel.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemFUEL'],
  },

  IFCDISTRIBUTIONSYSTEMGAS: {
    name:        'IfcDistributionSystemGAS',
    label:       'Gas',
    description: 'Gas-phase materials such as methane or natural gas.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemGAS'],
  },

  IFCDISTRIBUTIONSYSTEMHAZARDOUS: {
    name:        'IfcDistributionSystemHAZARDOUS',
    label:       'Hazardous',
    description: 'Hazardous material or fluid collection system.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemHAZARDOUS'],
  },

  IFCDISTRIBUTIONSYSTEMHEATING: {
    name:        'IfcDistributionSystemHEATING',
    label:       'Heating',
    description: '[[Water]] or steam heated from a boiler and circulated through radiators.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemHEATING'],
  },

  IFCDISTRIBUTIONSYSTEMLIGHTING: {
    name:        'IfcDistributionSystemLIGHTING',
    label:       'Light Ing',
    description: 'A circuit dedicated for lighting, such as a fixture having sockets for lamps.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemLIGHTING'],
  },

  IFCDISTRIBUTIONSYSTEMLIGHTNINGPROTECTION: {
    name:        'IfcDistributionSystemLIGHTNINGPROTECTION',
    label:       'Lightning Protection',
    description: 'A path for conducting lightning current to the ground.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemLIGHTNINGPROTECTION'],
  },

  IFCDISTRIBUTIONSYSTEMMOBILENETWORK: {
    name:        'IfcDistributionSystemMOBILENETWORK',
    label:       'Mobile Network',
    description: 'Mobile network insures wireless communication by providing a secure platform for voice and data communication between infrastructure operators, including drivers, dispatchers, shunting team members an',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemMOBILENETWORK'],
  },

  IFCDISTRIBUTIONSYSTEMMONITORINGSYSTEM: {
    name:        'IfcDistributionSystemMONITORINGSYSTEM',
    label:       'Monitoring System',
    description: 'Sensor-based system for building and infastructure environmental monitoring and control.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemMONITORINGSYSTEM'],
  },

  IFCDISTRIBUTIONSYSTEMMUNICIPALSOLIDWASTE: {
    name:        'IfcDistributionSystemMUNICIPALSOLIDWASTE',
    label:       'Municipal Solid Waste',
    description: 'Items consumed and discarded, commonly known as trash or garbage.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemMUNICIPALSOLIDWASTE'],
  },

  IFCDISTRIBUTIONSYSTEMOIL: {
    name:        'IfcDistributionSystemOIL',
    label:       'Oil',
    description: 'Oil distribution system.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemOIL'],
  },

  IFCDISTRIBUTIONSYSTEMOPERATIONAL: {
    name:        'IfcDistributionSystemOPERATIONAL',
    label:       'Operational',
    description: 'Operating supplies system.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemOPERATIONAL'],
  },

  IFCDISTRIBUTIONSYSTEMOPERATIONALTELEPHONYSYSTEM: {
    name:        'IfcDistributionSystemOPERATIONALTELEPHONYSYSTEM',
    label:       'Operational Telephony System',
    description: 'A system that allows communications between operators (e.g. switchtender, traffic regulator, operational agents, etc.) in operational centers and on the infrastructure site (e.g. railway, tunnel or ro',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemOPERATIONALTELEPHONYSYSTEM'],
  },

  IFCDISTRIBUTIONSYSTEMOVERHEAD_CONTACTLINE_SYSTEM: {
    name:        'IfcDistributionSystemOVERHEAD_CONTACTLINE_SYSTEM',
    label:       'Overhead Contact Line System',
    description: 'An overhead contact line system above the upper limit of the train using an overhead contact line and a catenary system to supply current to traction units.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemOVERHEAD_CONTACTLINE_SYSTEM'],
  },

  IFCDISTRIBUTIONSYSTEMPOWERGENERATION: {
    name:        'IfcDistributionSystemPOWERGENERATION',
    label:       'Power Generation',
    description: 'A path for power generation.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemPOWERGENERATION'],
  },

  IFCDISTRIBUTIONSYSTEMRAINWATER: {
    name:        'IfcDistributionSystemRAINWATER',
    label:       'Rain Water',
    description: 'Rainwater resulting from precipitation which directly falls on a parcel.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemRAINWATER'],
  },

  IFCDISTRIBUTIONSYSTEMREFRIGERATION: {
    name:        'IfcDistributionSystemREFRIGERATION',
    label:       'Refrigeration',
    description: 'Refrigerant distribution system for purposes of fulfilling all or parts of a refrigeration cycle.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemREFRIGERATION'],
  },

  IFCDISTRIBUTIONSYSTEMRETURN_CIRCUIT: {
    name:        'IfcDistributionSystemRETURN_CIRCUIT',
    label:       'Return Circuit',
    description: 'A distribution system which forms the intended path for the traction return current and the current under fault conditions.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemRETURN_CIRCUIT'],
  },

  IFCDISTRIBUTIONSYSTEMSECURITY: {
    name:        'IfcDistributionSystemSECURITY',
    label:       'Security',
    description: 'A transport or network dedicated to security system usage.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemSECURITY'],
  },

  IFCDISTRIBUTIONSYSTEMSEWAGE: {
    name:        'IfcDistributionSystemSEWAGE',
    label:       'Sewage',
    description: 'Sewage collection system.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemSEWAGE'],
  },

  IFCDISTRIBUTIONSYSTEMSIGNAL: {
    name:        'IfcDistributionSystemSIGNAL',
    label:       'Signal',
    description: 'A raw analog signal, such as modulated data or measurements from sensors.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemSIGNAL'],
  },

  IFCDISTRIBUTIONSYSTEMSTORMWATER: {
    name:        'IfcDistributionSystemSTORMWATER',
    label:       'Storm Water',
    description: 'Stormwater resulting from precipitation which runs off or travels over the ground surface.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemSTORMWATER'],
  },

  IFCDISTRIBUTIONSYSTEMTELEPHONE: {
    name:        'IfcDistributionSystemTELEPHONE',
    label:       'Telephone',
    description: 'A transport or network dedicated to telephone system usage.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemTELEPHONE'],
  },

  IFCDISTRIBUTIONSYSTEMTV: {
    name:        'IfcDistributionSystemTV',
    label:       'TV',
    description: 'A transport of multiple media sources such as analog cable TV, satellite TV, or over-the-air TV.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemTV'],
  },

  IFCDISTRIBUTIONSYSTEMVACUUM: {
    name:        'IfcDistributionSystemVACUUM',
    label:       'Vacuum',
    description: 'Vacuum distribution system.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemVACUUM'],
  },

  IFCDISTRIBUTIONSYSTEMVENT: {
    name:        'IfcDistributionSystemVENT',
    label:       'Vent',
    description: 'Vent system for wastewater piping systems.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemVENT'],
  },

  IFCDISTRIBUTIONSYSTEMVENTILATION: {
    name:        'IfcDistributionSystemVENTILATION',
    label:       'Ventilation',
    description: '[[Ventilation]] air distribution system involved in either the exchange of air to the outside as well as circulation of air within a building.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemVENTILATION'],
  },

  IFCDISTRIBUTIONSYSTEMWASTEWATER: {
    name:        'IfcDistributionSystemWASTEWATER',
    label:       'Waste Water',
    description: '[[Water]] adversely affected in quality by anthropogenic influence, possibly originating from sewage, drainage, or other source.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemWASTEWATER'],
  },

  IFCDISTRIBUTIONSYSTEMWATERSUPPLY: {
    name:        'IfcDistributionSystemWATERSUPPLY',
    label:       'Water Supply',
    description: 'Arbitrary water supply.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcDistributionSystem', 'IfcDistributionSystemWATERSUPPLY'],
  },

  IFCDOOR: {
    name:        'IfcDoor',
    label:       'Door',
    description: 'The door is a built element that is predominately used to provide controlled access for people, goods, animals and vehicles. It includes constructions with hinged, pivoted, sliding, and additionally r',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcDoor'],
  },

  IFCDOORBOOM_BARRIER: {
    name:        'IfcDoorBOOM_BARRIER',
    label:       'Boom Barrier',
    description: 'A boom barrier (also known as a boom gate) is a bar, or pole pivoted to allow the boom to block vehicular or pedestrian access through a controlled point.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcDoor', 'IfcDoorBOOM_BARRIER'],
  },

  IFCDOORDOOR: {
    name:        'IfcDoorDOOR',
    label:       'Door',
    description: 'A standard door usually within a wall opening, as a door panel in a curtain wall, or as a \\\'free standing\\\' door.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcDoor', 'IfcDoorDOOR'],
  },

  IFCDOORGATE: {
    name:        'IfcDoorGATE',
    label:       'Gate',
    description: 'A gate is a point of entry into a space usually within an opening in a fence. Or as a \\\'free standing\\\' gate.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcDoor', 'IfcDoorGATE'],
  },

  IFCDOORTRAPDOOR: {
    name:        'IfcDoorTRAPDOOR',
    label:       'Trapdoor',
    description: 'A special door that lies horizonally in a slab opening. Often used for accessing cellar or attic.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcDoor', 'IfcDoorTRAPDOOR'],
  },

  IFCDOORTURNSTILE: {
    name:        'IfcDoorTURNSTILE',
    label:       'Turnstile',
    description: 'A mechanical gate consisting of revolving arms, allowing only one person at a time to pass through.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcDoor', 'IfcDoorTURNSTILE'],
  },

  IFCDUCTFITTING: {
    name:        'IfcDuctFitting',
    label:       'Duct Fitting',
    description: 'A duct fitting is a junction or transition in a ducted flow distribution system or used to connect duct segments, resulting in changes in flow characteristics to the fluid such as direction and flow r',
    domain:      'TGA / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowFitting', 'IfcDuctFitting'],
  },

  IFCDUCTFITTINGBEND: {
    name:        'IfcDuctFittingBEND',
    label:       'Bend',
    description: 'A fitting with typically two ports used to change the direction of flow between connected elements.',
    domain:      'TGA / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowFitting', 'IfcDuctFitting', 'IfcDuctFittingBEND'],
  },

  IFCDUCTFITTINGCONNECTOR: {
    name:        'IfcDuctFittingCONNECTOR',
    label:       'Connector',
    description: 'Connector fitting, typically used to join two ports together within a flow distribution system (e.g., a coupling used to join two duct segments).',
    domain:      'TGA / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowFitting', 'IfcDuctFitting', 'IfcDuctFittingCONNECTOR'],
  },

  IFCDUCTFITTINGENTRY: {
    name:        'IfcDuctFittingENTRY',
    label:       'Entry',
    description: 'Entry fitting, typically unconnected at one port and connected to a flow distribution system at the other (e.g., an outside air duct system intake opening).',
    domain:      'TGA / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowFitting', 'IfcDuctFitting', 'IfcDuctFittingENTRY'],
  },

  IFCDUCTFITTINGEXIT: {
    name:        'IfcDuctFittingEXIT',
    label:       'Exit',
    description: 'Exit fitting, typically unconnected at one port and connected to a flow distribution system at the other (e.g., an exhaust air discharge opening).',
    domain:      'TGA / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowFitting', 'IfcDuctFitting', 'IfcDuctFittingEXIT'],
  },

  IFCDUCTFITTINGJUNCTION: {
    name:        'IfcDuctFittingJUNCTION',
    label:       'Junction',
    description: 'A fitting with typically more than two ports used to redistribute flow among the ports and/or to change the direction of flow between connected elements (e.g, tee, cross, wye, etc.).',
    domain:      'TGA / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowFitting', 'IfcDuctFitting', 'IfcDuctFittingJUNCTION'],
  },

  IFCDUCTFITTINGOBSTRUCTION: {
    name:        'IfcDuctFittingOBSTRUCTION',
    label:       'Obstruction',
    description: 'A fitting with typically two ports used to obstruct or restrict flow between the connected elements (e.g., screen, perforated plate, etc.).',
    domain:      'TGA / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowFitting', 'IfcDuctFitting', 'IfcDuctFittingOBSTRUCTION'],
  },

  IFCDUCTFITTINGTRANSITION: {
    name:        'IfcDuctFittingTRANSITION',
    label:       'Transition',
    description: 'A fitting with typically two ports having different shapes or sizes. Can also be used to change the direction of flow between connected elements.',
    domain:      'TGA / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowFitting', 'IfcDuctFitting', 'IfcDuctFittingTRANSITION'],
  },

  IFCDUCTSEGMENT: {
    name:        'IfcDuctSegment',
    label:       'Duct Segment',
    description: 'A duct segment is used to typically join two sections of duct network.',
    domain:      'TGA / Lüftung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowSegment', 'IfcDuctSegment'],
  },

  IFCDUCTSEGMENTFLEXIBLESEGMENT: {
    name:        'IfcDuctSegmentFLEXIBLESEGMENT',
    label:       'Flexible Segment',
    description: 'A flexible segment is a continuous non-linear segment of duct that can be deformed and change the direction of flow.',
    domain:      'TGA / Lüftung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowSegment', 'IfcDuctSegment', 'IfcDuctSegmentFLEXIBLESEGMENT'],
  },

  IFCDUCTSEGMENTRIGIDSEGMENT: {
    name:        'IfcDuctSegmentRIGIDSEGMENT',
    label:       'Rigid Segment',
    description: 'A rigid segment is a continuous linear segment of duct that cannot be deformed.',
    domain:      'TGA / Lüftung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowSegment', 'IfcDuctSegment', 'IfcDuctSegmentRIGIDSEGMENT'],
  },

  IFCDUCTSILENCER: {
    name:        'IfcDuctSilencer',
    label:       'Duct Silencer',
    description: 'A duct silencer is a device that is typically installed inside a duct distribution system for the purpose of reducing the noise levels from air movement, fan noise, etc. in the adjacent space or downs',
    domain:      'TGA / HVAC',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTreatmentDevice', 'IfcDuctSilencer'],
  },

  IFCDUCTSILENCERFLATOVAL: {
    name:        'IfcDuctSilencerFLATOVAL',
    label:       'Flat Oval',
    description: 'Flat-oval shaped duct silencer type.',
    domain:      'TGA / HVAC',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTreatmentDevice', 'IfcDuctSilencer', 'IfcDuctSilencerFLATOVAL'],
  },

  IFCDUCTSILENCERRECTANGULAR: {
    name:        'IfcDuctSilencerRECTANGULAR',
    label:       'Rectangular',
    description: 'Rectangular shaped duct silencer type.',
    domain:      'TGA / HVAC',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTreatmentDevice', 'IfcDuctSilencer', 'IfcDuctSilencerRECTANGULAR'],
  },

  IFCDUCTSILENCERROUND: {
    name:        'IfcDuctSilencerROUND',
    label:       'Round',
    description: 'Round duct silencer type.',
    domain:      'TGA / HVAC',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTreatmentDevice', 'IfcDuctSilencer', 'IfcDuctSilencerROUND'],
  },

  IFCEARTHWORKSCUT: {
    name:        'IfcEarthworksCut',
    label:       'Earthworks Cut',
    description: 'The resulting void from modification of existing terrain or road structure by excavation or by other means of removing material.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFeatureElement', 'IfcFeatureElementSubtraction', 'IfcEarthworksCut'],
  },

  IFCEARTHWORKSCUTBASE_EXCAVATION: {
    name:        'IfcEarthworksCutBASE_EXCAVATION',
    label:       'Base Excavation',
    description: 'Excavation for basements of buildings, abutments of bridges or similar structures either partially or completely below ground level.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFeatureElement', 'IfcFeatureElementSubtraction', 'IfcEarthworksCut', 'IfcEarthworksCutBASE_EXCAVATION'],
  },

  IFCEARTHWORKSCUTCUT: {
    name:        'IfcEarthworksCutCUT',
    label:       'Cut',
    description: 'Excavation where soil or rock below topsoil is cut to the depth required for the construction of facilities such as roads and railways. The removed material can be used as fill ([[IfcEarthworksElement',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFeatureElement', 'IfcFeatureElementSubtraction', 'IfcEarthworksCut', 'IfcEarthworksCutCUT'],
  },

  IFCEARTHWORKSCUTDREDGING: {
    name:        'IfcEarthworksCutDREDGING',
    label:       'Dredging',
    description: 'Underwater excavation to recover material or to create a greater depth of water.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFeatureElement', 'IfcFeatureElementSubtraction', 'IfcEarthworksCut', 'IfcEarthworksCutDREDGING'],
  },

  IFCEARTHWORKSCUTEXCAVATION: {
    name:        'IfcEarthworksCutEXCAVATION',
    label:       'Excavation',
    description: 'General type of excavation when more accurate type is not specified.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFeatureElement', 'IfcFeatureElementSubtraction', 'IfcEarthworksCut', 'IfcEarthworksCutEXCAVATION'],
  },

  IFCEARTHWORKSCUTOVEREXCAVATION: {
    name:        'IfcEarthworksCutOVEREXCAVATION',
    label:       'Over Excavation',
    description: 'Excavation that goes beyond the depth required for construction, in order to replace unsuitable material.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFeatureElement', 'IfcFeatureElementSubtraction', 'IfcEarthworksCut', 'IfcEarthworksCutOVEREXCAVATION'],
  },

  IFCEARTHWORKSCUTPAVEMENTMILLING: {
    name:        'IfcEarthworksCutPAVEMENTMILLING',
    label:       'Pavement Milling',
    description: 'Removal of expired material from top of pavement to be replaced by new material.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFeatureElement', 'IfcFeatureElementSubtraction', 'IfcEarthworksCut', 'IfcEarthworksCutPAVEMENTMILLING'],
  },

  IFCEARTHWORKSCUTSTEPEXCAVATION: {
    name:        'IfcEarthworksCutSTEPEXCAVATION',
    label:       'Step Excavation',
    description: 'Removal of the soft part of the existing road slope, where it is dug into steps, when widening a road.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFeatureElement', 'IfcFeatureElementSubtraction', 'IfcEarthworksCut', 'IfcEarthworksCutSTEPEXCAVATION'],
  },

  IFCEARTHWORKSCUTTOPSOILREMOVAL: {
    name:        'IfcEarthworksCutTOPSOILREMOVAL',
    label:       'Top Soil Removal',
    description: 'Excavation where the topmost layer of soil containing organic material is cut or stripped. The removed topsoil can be used as fill (EarthworksElement) e.g. where planting is planned.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFeatureElement', 'IfcFeatureElementSubtraction', 'IfcEarthworksCut', 'IfcEarthworksCutTOPSOILREMOVAL'],
  },

  IFCEARTHWORKSCUTTRENCH: {
    name:        'IfcEarthworksCutTRENCH',
    label:       'Trench',
    description: 'Excavation whose length greatly exceeds the depth and width. Trench is typically excavated for strip foundations or for buried services such as drainage or cabling.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFeatureElement', 'IfcFeatureElementSubtraction', 'IfcEarthworksCut', 'IfcEarthworksCutTRENCH'],
  },

  IFCEARTHWORKSELEMENT: {
    name:        'IfcEarthworksElement',
    label:       'Earthworks Element',
    description: 'A type of built element created by earthwork activities to build subgrade, to raise the level of the ground in general or reinforce or stabilize soil by some mechanical or chemical method.',
    domain:      'Infrastruktur / Tiefbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcEarthworksElement'],
  },

  IFCEARTHWORKSFILL: {
    name:        'IfcEarthworksFill',
    label:       'Earthworks Fill',
    description: 'A type of earthworks element created by earthwork activities to build subgrade or to raise the level of the ground in general.',
    domain:      'Infrastruktur / Tiefbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcEarthworksElement', 'IfcEarthworksFill'],
  },

  IFCEARTHWORKSFILLBACKFILL: {
    name:        'IfcEarthworksFillBACKFILL',
    label:       'Backfill',
    description: 'Fill behind retaining walls or other structures such as quays, behind abutments and bridges.',
    domain:      'Infrastruktur / Tiefbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcEarthworksElement', 'IfcEarthworksFill', 'IfcEarthworksFillBACKFILL'],
  },

  IFCEARTHWORKSFILLCOUNTERWEIGHT: {
    name:        'IfcEarthworksFillCOUNTERWEIGHT',
    label:       'Counterweight',
    description: 'Embankment built on the side of the main road structure to reduce the settlement of the road.',
    domain:      'Infrastruktur / Tiefbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcEarthworksElement', 'IfcEarthworksFill', 'IfcEarthworksFillCOUNTERWEIGHT'],
  },

  IFCEARTHWORKSFILLEMBANKMENT: {
    name:        'IfcEarthworksFillEMBANKMENT',
    label:       'Embankment',
    description: 'Predominantly longitudinal type of earthworks element with no other particular assigned type according to its role in Pavement or Subgrade.;',
    domain:      'Infrastruktur / Tiefbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcEarthworksElement', 'IfcEarthworksFill', 'IfcEarthworksFillEMBANKMENT'],
  },

  IFCEARTHWORKSFILLSLOPEFILL: {
    name:        'IfcEarthworksFillSLOPEFILL',
    label:       'Slopefill',
    description: '[[Side]] slope (batter) fill abutting the road structure or back slope fill.',
    domain:      'Infrastruktur / Tiefbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcEarthworksElement', 'IfcEarthworksFill', 'IfcEarthworksFillSLOPEFILL'],
  },

  IFCEARTHWORKSFILLSUBGRADE: {
    name:        'IfcEarthworksFillSUBGRADE',
    label:       'Subgrade',
    description: '[[Type]] of earthworks element forming the structure below pavement and above natural soil.;',
    domain:      'Infrastruktur / Tiefbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcEarthworksElement', 'IfcEarthworksFill', 'IfcEarthworksFillSUBGRADE'],
  },

  IFCEARTHWORKSFILLSUBGRADEBED: {
    name:        'IfcEarthworksFillSUBGRADEBED',
    label:       'Subgrade Bed',
    description: 'Upper part of the soil, natural or constructed, that supports the loads transmitted by the overlying structure of a road, runway, or similar hard surface.',
    domain:      'Infrastruktur / Tiefbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcEarthworksElement', 'IfcEarthworksFill', 'IfcEarthworksFillSUBGRADEBED'],
  },

  IFCEARTHWORKSFILLTRANSITIONSECTION: {
    name:        'IfcEarthworksFillTRANSITIONSECTION',
    label:       'Transition Section',
    description: 'Section of subgrade to ensure the consistency of stiffness and prevent uneven settlement. Transition section may appear e.g.embankment and bridge abutment; embankment and transverse structure; cutting',
    domain:      'Infrastruktur / Tiefbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcEarthworksElement', 'IfcEarthworksFill', 'IfcEarthworksFillTRANSITIONSECTION'],
  },

  IFCELECTRICAPPLIANCE: {
    name:        'IfcElectricAppliance',
    label:       'Electric Appliance',
    description: 'An electric appliance is a device intended for consumer usage that is powered by electricity.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcElectricAppliance'],
  },

  IFCELECTRICAPPLIANCEDISHWASHER: {
    name:        'IfcElectricApplianceDISHWASHER',
    label:       'Dishwasher',
    description: 'An appliance that has the primary function of washing dishes.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcElectricAppliance', 'IfcElectricApplianceDISHWASHER'],
  },

  IFCELECTRICAPPLIANCEELECTRICCOOKER: {
    name:        'IfcElectricApplianceELECTRICCOOKER',
    label:       'Electric Cooker',
    description: 'An electrical appliance that has the primary function of cooking food (including oven, hob, grill).',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcElectricAppliance', 'IfcElectricApplianceELECTRICCOOKER'],
  },

  IFCELECTRICAPPLIANCEFREESTANDINGELECTRICHEATER: {
    name:        'IfcElectricApplianceFREESTANDINGELECTRICHEATER',
    label:       'Freestanding Electric Heater',
    description: 'An electrical appliance that is used occasionally to provide heat. A freestanding electric heater is a \\\'plugged\\\' appliance whose load may be removed from an electric circuit.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcElectricAppliance', 'IfcElectricApplianceFREESTANDINGELECTRICHEATER'],
  },

  IFCELECTRICAPPLIANCEFREESTANDINGFAN: {
    name:        'IfcElectricApplianceFREESTANDINGFAN',
    label:       'Freestanding Fan',
    description: 'An electrical appliance that is used occasionally to provide ventilation. A freestanding fan is a \\\'plugged\\\' appliance whose load may be removed from an electric circuit.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcElectricAppliance', 'IfcElectricApplianceFREESTANDINGFAN'],
  },

  IFCELECTRICAPPLIANCEFREESTANDINGWATERCOOLER: {
    name:        'IfcElectricApplianceFREESTANDINGWATERCOOLER',
    label:       'Freestanding Water Cooler',
    description: 'A small, local electrical appliance for cooling water. A freestanding water cooler is a \\\'plugged\\\' appliance whose load may be removed from an electric circuit.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcElectricAppliance', 'IfcElectricApplianceFREESTANDINGWATERCOOLER'],
  },

  IFCELECTRICAPPLIANCEFREESTANDINGWATERHEATER: {
    name:        'IfcElectricApplianceFREESTANDINGWATERHEATER',
    label:       'Freestanding Water Heater',
    description: 'A small, local electrical appliance for heating water. A freestanding water heater is a \\\'plugged\\\' appliance whose load may be removed from an electric circuit.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcElectricAppliance', 'IfcElectricApplianceFREESTANDINGWATERHEATER'],
  },

  IFCELECTRICAPPLIANCEFREEZER: {
    name:        'IfcElectricApplianceFREEZER',
    label:       'Freezer',
    description: 'An electrical appliance that has the primary function of storing food at temperatures below the freezing point of water.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcElectricAppliance', 'IfcElectricApplianceFREEZER'],
  },

  IFCELECTRICAPPLIANCEFRIDGE_FREEZER: {
    name:        'IfcElectricApplianceFRIDGE_FREEZER',
    label:       'Fridge Freezer',
    description: 'An electrical appliance that combines the functions of a freezer and a refrigerator through the provision of separate compartments.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcElectricAppliance', 'IfcElectricApplianceFRIDGE_FREEZER'],
  },

  IFCELECTRICAPPLIANCEHANDDRYER: {
    name:        'IfcElectricApplianceHANDDRYER',
    label:       'Hand Dryer',
    description: 'An electrical appliance that has the primary function of drying hands.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcElectricAppliance', 'IfcElectricApplianceHANDDRYER'],
  },

  IFCELECTRICAPPLIANCEKITCHENMACHINE: {
    name:        'IfcElectricApplianceKITCHENMACHINE',
    label:       'Kitchen Machine',
    description: 'A specialized appliance used in commercial kitchens such as a mixer.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcElectricAppliance', 'IfcElectricApplianceKITCHENMACHINE'],
  },

  IFCELECTRICAPPLIANCEMICROWAVE: {
    name:        'IfcElectricApplianceMICROWAVE',
    label:       'Microwave',
    description: 'An electrical appliance that has the primary function of cooking food using microwaves.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcElectricAppliance', 'IfcElectricApplianceMICROWAVE'],
  },

  IFCELECTRICAPPLIANCEPHOTOCOPIER: {
    name:        'IfcElectricAppliancePHOTOCOPIER',
    label:       'Photocopier',
    description: 'A machine that has the primary function of reproduction of printed matter.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcElectricAppliance', 'IfcElectricAppliancePHOTOCOPIER'],
  },

  IFCELECTRICAPPLIANCEREFRIGERATOR: {
    name:        'IfcElectricApplianceREFRIGERATOR',
    label:       'Refrigerator',
    description: 'An electrical appliance that has the primary function of storing food at low temperature but above the freezing point of water.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcElectricAppliance', 'IfcElectricApplianceREFRIGERATOR'],
  },

  IFCELECTRICAPPLIANCETUMBLEDRYER: {
    name:        'IfcElectricApplianceTUMBLEDRYER',
    label:       'Tumble Dryer',
    description: 'An electrical appliance that has the primary function of drying clothes.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcElectricAppliance', 'IfcElectricApplianceTUMBLEDRYER'],
  },

  IFCELECTRICAPPLIANCEVENDINGMACHINE: {
    name:        'IfcElectricApplianceVENDINGMACHINE',
    label:       'Vending Machine',
    description: 'An appliance that stores and vends goods including food, drink, tickets, and goods of various types.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcElectricAppliance', 'IfcElectricApplianceVENDINGMACHINE'],
  },

  IFCELECTRICAPPLIANCEWASHINGMACHINE: {
    name:        'IfcElectricApplianceWASHINGMACHINE',
    label:       'Washing Machine',
    description: 'An appliance that has the primary function of washing clothes.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcElectricAppliance', 'IfcElectricApplianceWASHINGMACHINE'],
  },

  IFCELECTRICFLOWSTORAGEDEVICE: {
    name:        'IfcElectricFlowStorageDevice',
    label:       'Electric Flow Storage Device',
    description: 'An electric flow storage device is a device in which electrical energy is stored and from which energy may be progressively released.',
    domain:      'TGA / Speicher',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowStorageDevice', 'IfcElectricFlowStorageDevice'],
  },

  IFCELECTRICFLOWSTORAGEDEVICEBATTERY: {
    name:        'IfcElectricFlowStorageDeviceBATTERY',
    label:       'Battery',
    description: 'A device for storing energy in chemical form so that it can be released as electrical energy.',
    domain:      'TGA / Speicher',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowStorageDevice', 'IfcElectricFlowStorageDevice', 'IfcElectricFlowStorageDeviceBATTERY'],
  },

  IFCELECTRICFLOWSTORAGEDEVICECAPACITOR: {
    name:        'IfcElectricFlowStorageDeviceCAPACITOR',
    label:       'Capacitor',
    description: 'A device that stores electric charge when an external power supply is present using the electrical property of capacitance. Two-terminal device characterized essentially by its capacitance.;definition',
    domain:      'TGA / Speicher',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowStorageDevice', 'IfcElectricFlowStorageDevice', 'IfcElectricFlowStorageDeviceCAPACITOR'],
  },

  IFCELECTRICFLOWSTORAGEDEVICECAPACITORBANK: {
    name:        'IfcElectricFlowStorageDeviceCAPACITORBANK',
    label:       'Capacitorbank',
    description: 'A device that stores electrical energy when an external power supply is present using the electrical property of capacitance.',
    domain:      'TGA / Speicher',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowStorageDevice', 'IfcElectricFlowStorageDevice', 'IfcElectricFlowStorageDeviceCAPACITORBANK'],
  },

  IFCELECTRICFLOWSTORAGEDEVICECOMPENSATOR: {
    name:        'IfcElectricFlowStorageDeviceCOMPENSATOR',
    label:       'Compensator',
    description: 'A device that is used to fix or adjust the parameter of electric energy, such as voltage loss, power factor and so on.',
    domain:      'TGA / Speicher',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowStorageDevice', 'IfcElectricFlowStorageDevice', 'IfcElectricFlowStorageDeviceCOMPENSATOR'],
  },

  IFCELECTRICFLOWSTORAGEDEVICEHARMONICFILTER: {
    name:        'IfcElectricFlowStorageDeviceHARMONICFILTER',
    label:       'Harmonic Filter',
    description: 'A device that constantly injects currents that precisely correspond to the harmonic components drawn by the load.',
    domain:      'TGA / Speicher',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowStorageDevice', 'IfcElectricFlowStorageDevice', 'IfcElectricFlowStorageDeviceHARMONICFILTER'],
  },

  IFCELECTRICFLOWSTORAGEDEVICEINDUCTOR: {
    name:        'IfcElectricFlowStorageDeviceINDUCTOR',
    label:       'Inductor',
    description: 'A device used in circuits or power systems due to their inductance, acting as a component of electric storage device.',
    domain:      'TGA / Speicher',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowStorageDevice', 'IfcElectricFlowStorageDevice', 'IfcElectricFlowStorageDeviceINDUCTOR'],
  },

  IFCELECTRICFLOWSTORAGEDEVICEINDUCTORBANK: {
    name:        'IfcElectricFlowStorageDeviceINDUCTORBANK',
    label:       'Inductor Bank',
    description: 'A device that stores electrical energy in a magnetic field using electrical property of inductance.',
    domain:      'TGA / Speicher',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowStorageDevice', 'IfcElectricFlowStorageDevice', 'IfcElectricFlowStorageDeviceINDUCTORBANK'],
  },

  IFCELECTRICFLOWSTORAGEDEVICERECHARGER: {
    name:        'IfcElectricFlowStorageDeviceRECHARGER',
    label:       'Recharger',
    description: 'A recharger or battery charger is a device used to put energy into a secondary cell or rechargeable battery by forcing an electric current through it.',
    domain:      'TGA / Speicher',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowStorageDevice', 'IfcElectricFlowStorageDevice', 'IfcElectricFlowStorageDeviceRECHARGER'],
  },

  IFCELECTRICFLOWSTORAGEDEVICEUPS: {
    name:        'IfcElectricFlowStorageDeviceUPS',
    label:       'UPS',
    description: 'A device that provides a time limited alternative source of power supply in the event of failure of the main supply.',
    domain:      'TGA / Speicher',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowStorageDevice', 'IfcElectricFlowStorageDevice', 'IfcElectricFlowStorageDeviceUPS'],
  },

  IFCELECTRICFLOWTREATMENTDEVICE: {
    name:        'IfcElectricFlowTreatmentDevice',
    label:       'Electric Flow Treatment Device',
    description: 'An electric flow treatment device is used to remove unwanted matter from an electric or electronic signal in a flow distribution system.',
    domain:      'TGA / Verteilung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTreatmentDevice', 'IfcElectricFlowTreatmentDevice'],
  },

  IFCELECTRICFLOWTREATMENTDEVICEELECTRONICFILTER: {
    name:        'IfcElectricFlowTreatmentDeviceELECTRONICFILTER',
    label:       'Electronic Filter',
    description: 'Linear two-port device designed to transmit spectral components of the input quantity according to a specified law, generally in order to pass the components in certain frequency bands and to attenuat',
    domain:      'TGA / Verteilung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTreatmentDevice', 'IfcElectricFlowTreatmentDevice', 'IfcElectricFlowTreatmentDeviceELECTRONICFILTER'],
  },

  IFCELECTRICGENERATOR: {
    name:        'IfcElectricGenerator',
    label:       'Electric Generator',
    description: 'An electric generator is an engine that is a machine for converting mechanical energy into electrical energy.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcElectricGenerator'],
  },

  IFCELECTRICGENERATORCHP: {
    name:        'IfcElectricGeneratorCHP',
    label:       'CHP',
    description: 'Combined heat and power supply, used not only as a source of electric energy but also as a heating source for the building. It may therefore be not only part of an electrical system but also of a heat',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcElectricGenerator', 'IfcElectricGeneratorCHP'],
  },

  IFCELECTRICGENERATORENGINEGENERATOR: {
    name:        'IfcElectricGeneratorENGINEGENERATOR',
    label:       'Engine Generator',
    description: 'Electrical generator with a fuel-driven engine, for example a diesel-driven emergency power supply.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcElectricGenerator', 'IfcElectricGeneratorENGINEGENERATOR'],
  },

  IFCELECTRICGENERATORSTANDALONE: {
    name:        'IfcElectricGeneratorSTANDALONE',
    label:       'Standalone',
    description: 'Electrical generator which does not include its source of kinetic energy, that is, a motor, engine, or turbine are all modeled separately.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcElectricGenerator', 'IfcElectricGeneratorSTANDALONE'],
  },

  IFCELECTRICMOTOR: {
    name:        'IfcElectricMotor',
    label:       'Electric Motor',
    description: 'An electric motor is an engine that is a machine for converting electrical energy into mechanical energy.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcElectricMotor'],
  },

  IFCELECTRICMOTORDC: {
    name:        'IfcElectricMotorDC',
    label:       'DC',
    description: 'A motor using either generated or rectified Direct [[Current]] (DC) power.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcElectricMotor', 'IfcElectricMotorDC'],
  },

  IFCELECTRICMOTORINDUCTION: {
    name:        'IfcElectricMotorINDUCTION',
    label:       'Induction',
    description: 'An alternating current motor in which the primary winding on one member (usually the stator) is connected to the power source and a secondary winding or a squirrel-cage secondary winding on the other',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcElectricMotor', 'IfcElectricMotorINDUCTION'],
  },

  IFCELECTRICMOTORPOLYPHASE: {
    name:        'IfcElectricMotorPOLYPHASE',
    label:       'Polyphase',
    description: 'A two or three-phase induction motor in which the windings, one for each phase, are evenly divided by the same number of electrical degrees.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcElectricMotor', 'IfcElectricMotorPOLYPHASE'],
  },

  IFCELECTRICMOTORRELUCTANCESYNCHRONOUS: {
    name:        'IfcElectricMotorRELUCTANCESYNCHRONOUS',
    label:       'Reluctance Synchronous',
    description: 'A synchronous motor with a special rotor design which directly lines the rotor up with the rotating magnetic field of the stator, allowing for no slip under load.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcElectricMotor', 'IfcElectricMotorRELUCTANCESYNCHRONOUS'],
  },

  IFCELECTRICMOTORSYNCHRONOUS: {
    name:        'IfcElectricMotorSYNCHRONOUS',
    label:       'Synchronous',
    description: 'A motor that operates at a constant speed up to full load. The rotor speed is equal to the speed of the rotating magnetic field of the stator; there is no slip.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcElectricMotor', 'IfcElectricMotorSYNCHRONOUS'],
  },

  IFCELECTRICTIMECONTROL: {
    name:        'IfcElectricTimeControl',
    label:       'Electric Time Control',
    description: 'An electric time control is a device that applies control to the provision or flow of electrical energy over time.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcElectricTimeControl'],
  },

  IFCELECTRICTIMECONTROLRELAY: {
    name:        'IfcElectricTimeControlRELAY',
    label:       'Relay',
    description: 'Electromagnetically operated contactor for making or breaking a control circuit.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcElectricTimeControl', 'IfcElectricTimeControlRELAY'],
  },

  IFCELECTRICTIMECONTROLTIMECLOCK: {
    name:        'IfcElectricTimeControlTIMECLOCK',
    label:       'Time Clock',
    description: 'A control that causes action to occur at set times.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcElectricTimeControl', 'IfcElectricTimeControlTIMECLOCK'],
  },

  IFCELECTRICTIMECONTROLTIMEDELAY: {
    name:        'IfcElectricTimeControlTIMEDELAY',
    label:       'Time Delay',
    description: 'A control that causes action to occur following a set duration.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcElectricTimeControl', 'IfcElectricTimeControlTIMEDELAY'],
  },

  IFCELEMENT: {
    name:        'IfcElement',
    label:       'Element',
    description: 'An element is a generalization of all components that make up a facility.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement'],
  },

  IFCELEMENTASSEMBLY: {
    name:        'IfcElementAssembly',
    label:       'Element Assembly',
    description: 'The [[IfcElementAssembly]] represents complex element assemblies aggregated from several elements, such as discrete elements, building elements, or other elements.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementAssembly'],
  },

  IFCELEMENTASSEMBLYABUTMENT: {
    name:        'IfcElementAssemblyABUTMENT',
    label:       'Abutment',
    description: 'A bridge abutment built up of walls, beams, slabs etc.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementAssembly', 'IfcElementAssemblyABUTMENT'],
  },

  IFCELEMENTASSEMBLYACCESSORY_ASSEMBLY: {
    name:        'IfcElementAssemblyACCESSORY_ASSEMBLY',
    label:       'Accessory Assembly',
    description: 'Assembled accessories or components.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementAssembly', 'IfcElementAssemblyACCESSORY_ASSEMBLY'],
  },

  IFCELEMENTASSEMBLYARCH: {
    name:        'IfcElementAssemblyARCH',
    label:       'Arch',
    description: 'A curved structure.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementAssembly', 'IfcElementAssemblyARCH'],
  },

  IFCELEMENTASSEMBLYBEAM_GRID: {
    name:        'IfcElementAssemblyBEAM_GRID',
    label:       'Beam Grid',
    description: 'Interconnected beams, located in one (typically horizontal) plane.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementAssembly', 'IfcElementAssemblyBEAM_GRID'],
  },

  IFCELEMENTASSEMBLYBRACED_FRAME: {
    name:        'IfcElementAssemblyBRACED_FRAME',
    label:       'Braced Frame',
    description: 'A rigid frame with additional bracing members.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementAssembly', 'IfcElementAssemblyBRACED_FRAME'],
  },

  IFCELEMENTASSEMBLYCROSS_BRACING: {
    name:        'IfcElementAssemblyCROSS_BRACING',
    label:       'Cross Bracing',
    description: 'A Structural linear member or assembly of members inside a box girder or between girders, typically on a pier, to resist lateral forces and transfer them to the support.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementAssembly', 'IfcElementAssemblyCROSS_BRACING'],
  },

  IFCELEMENTASSEMBLYDECK: {
    name:        'IfcElementAssemblyDECK',
    label:       'Deck',
    description: 'A platform (such as floor or bridge deck) built up of beams, slabs.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementAssembly', 'IfcElementAssemblyDECK'],
  },

  IFCELEMENTASSEMBLYDILATATIONPANEL: {
    name:        'IfcElementAssemblyDILATATIONPANEL',
    label:       'Dilatation Panel',
    description: 'Device which permits longitudinal relative rail movement of two adjacent rails, while maintaining correct guidance and support.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementAssembly', 'IfcElementAssemblyDILATATIONPANEL'],
  },

  IFCELEMENTASSEMBLYENTRANCEWORKS: {
    name:        'IfcElementAssemblyENTRANCEWORKS',
    label:       'Entrance Works',
    description: 'An assembly forming the support structure of a chamber (lock, dock) gate and associated elements, plus the containment of operational equipment.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementAssembly', 'IfcElementAssemblyENTRANCEWORKS'],
  },

  IFCELEMENTASSEMBLYGIRDER: {
    name:        'IfcElementAssemblyGIRDER',
    label:       'Girder',
    description: 'A beam-like superstructure, such as bridge main girder extending between abutments and piers built up of beams, braces (as Members) etc. - may also be an aggregation of girder segments.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementAssembly', 'IfcElementAssemblyGIRDER'],
  },

  IFCELEMENTASSEMBLYGRID: {
    name:        'IfcElementAssemblyGRID',
    label:       'Grid',
    description: 'A framework of spaced cables or bars that are parallel to or cross each other.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementAssembly', 'IfcElementAssemblyGRID'],
  },

  IFCELEMENTASSEMBLYMAST: {
    name:        'IfcElementAssemblyMAST',
    label:       'Mast',
    description: 'An assembly of plates, members, cables or fasteners that form a vertical structure for the support or mounting of other equipment such as lights, sonar or wireless transmitters.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementAssembly', 'IfcElementAssemblyMAST'],
  },

  IFCELEMENTASSEMBLYPIER: {
    name:        'IfcElementAssemblyPIER',
    label:       'Pier',
    description: 'An intermediate support e.g. in a bridge, built up of walls, columns, beams etc.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementAssembly', 'IfcElementAssemblyPIER'],
  },

  IFCELEMENTASSEMBLYPYLON: {
    name:        'IfcElementAssemblyPYLON',
    label:       'Pylon',
    description: 'A vertical structure supporting cables in suspended or stayed structure.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementAssembly', 'IfcElementAssemblyPYLON'],
  },

  IFCELEMENTASSEMBLYRAIL_MECHANICAL_EQUIPMENT_ASSEMB: {
    name:        'IfcElementAssemblyRAIL_MECHANICAL_EQUIPMENT_ASSEMB',
    label:       'Rail Mechanical Equipment Assembly',
    description: 'A complex assembly made up of several components like blocking device, speed regulator, bias loaded inspector, track scale or controllable retarder.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementAssembly', 'IfcElementAssemblyRAIL_MECHANICAL_EQUIPMENT_ASSEMB'],
  },

  IFCELEMENTASSEMBLYREINFORCEMENT_UNIT: {
    name:        'IfcElementAssemblyREINFORCEMENT_UNIT',
    label:       'Reinforcement Unit',
    description: 'Assembled reinforcement elements.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementAssembly', 'IfcElementAssemblyREINFORCEMENT_UNIT'],
  },

  IFCELEMENTASSEMBLYRIGID_FRAME: {
    name:        'IfcElementAssemblyRIGID_FRAME',
    label:       'Rigid Frame',
    description: 'A structure built up of beams, columns, etc. with moment-resisting joints, such as gantry',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementAssembly', 'IfcElementAssemblyRIGID_FRAME'],
  },

  IFCELEMENTASSEMBLYSHELTER: {
    name:        'IfcElementAssemblySHELTER',
    label:       'Shelter',
    description: 'A structure, fairly quick to setup, move or dismantle, used to give protection, especially from the weather or intrusion.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementAssembly', 'IfcElementAssemblySHELTER'],
  },

  IFCELEMENTASSEMBLYSIGNALASSEMBLY: {
    name:        'IfcElementAssemblySIGNALASSEMBLY',
    label:       'Signal Assembly',
    description: 'An assembly to physically aggregate together one or more signal instances (and also sign instances) including any supporting structural elements such as a simple pole or a rigid frame gantry.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementAssembly', 'IfcElementAssemblySIGNALASSEMBLY'],
  },

  IFCELEMENTASSEMBLYSLAB_FIELD: {
    name:        'IfcElementAssemblySLAB_FIELD',
    label:       'Slab Field',
    description: 'Slabs, laid out in one plane.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementAssembly', 'IfcElementAssemblySLAB_FIELD'],
  },

  IFCELEMENTASSEMBLYSUMPBUSTER: {
    name:        'IfcElementAssemblySUMPBUSTER',
    label:       'Sump Buster',
    description: 'An obstacle (with oil catchment basin) installed typically in a bus lane to prevent other traffic with lower ground clearance from using it. Also Sump breaker or Sump trap.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementAssembly', 'IfcElementAssemblySUMPBUSTER'],
  },

  IFCELEMENTASSEMBLYSUPPORTINGASSEMBLY: {
    name:        'IfcElementAssemblySUPPORTINGASSEMBLY',
    label:       'Supporting Assembly',
    description: 'An assembly intends to support Overhead Contact Line [[System]]. It includes foundation, supporting elements and suspension assembly.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementAssembly', 'IfcElementAssemblySUPPORTINGASSEMBLY'],
  },

  IFCELEMENTASSEMBLYSUSPENSIONASSEMBLY: {
    name:        'IfcElementAssemblySUSPENSIONASSEMBLY',
    label:       'Suspension Assembly',
    description: 'A complex assembly of components used to suspend elements or cable segments.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementAssembly', 'IfcElementAssemblySUSPENSIONASSEMBLY'],
  },

  IFCELEMENTASSEMBLYTRACKPANEL: {
    name:        'IfcElementAssemblyTRACKPANEL',
    label:       'Track Panel',
    description: 'Trackwork ensuring the support and guidance of a vehicle along a route. It consists of assembly of rail, sleepers and fastenings.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementAssembly', 'IfcElementAssemblyTRACKPANEL'],
  },

  IFCELEMENTASSEMBLYTRACTION_SWITCHING_ASSEMBLY: {
    name:        'IfcElementAssemblyTRACTION_SWITCHING_ASSEMBLY',
    label:       'Traction Switching Assembly',
    description: 'A common assembly used to insure the switching function. It is composed of switches, control instruments and other components.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementAssembly', 'IfcElementAssemblyTRACTION_SWITCHING_ASSEMBLY'],
  },

  IFCELEMENTASSEMBLYTRAFFIC_CALMING_DEVICE: {
    name:        'IfcElementAssemblyTRAFFIC_CALMING_DEVICE',
    label:       'Traffic Calming Device',
    description: 'A structure on the carriageway to control the speed of vehicles.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementAssembly', 'IfcElementAssemblyTRAFFIC_CALMING_DEVICE'],
  },

  IFCELEMENTASSEMBLYTRUSS: {
    name:        'IfcElementAssemblyTRUSS',
    label:       'Truss',
    description: 'A structure built up of members with (quasi) pinned joint.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementAssembly', 'IfcElementAssemblyTRUSS'],
  },

  IFCELEMENTASSEMBLYTURNOUTPANEL: {
    name:        'IfcElementAssemblyTURNOUTPANEL',
    label:       'Turnout Panel',
    description: 'Trackwork ensuring the support and guidance of a vehicle along any given route among various diverging or intersecting tracks.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementAssembly', 'IfcElementAssemblyTURNOUTPANEL'],
  },

  IFCELEMENTCOMPONENT: {
    name:        'IfcElementComponent',
    label:       'Element Component',
    description: 'An element component is a representation for minor items included in, added to or connecting to or between elements, which usually are not of interest from the overall building structure viewpoint. Ho',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent'],
  },

  IFCENERGYCONVERSIONDEVICE: {
    name:        'IfcEnergyConversionDevice',
    label:       'Energy Conversion Device',
    description: 'The distribution flow element [[IfcEnergyConversionDevice]] defines the occurrence of a device used to perform energy conversion or heat transfer and typically participates in a flow distribution syst',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice'],
  },

  IFCENGINE: {
    name:        'IfcEngine',
    label:       'Engine',
    description: 'An engine is a device that converts fuel into mechanical energy through combustion.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcEngine'],
  },

  IFCENGINEEXTERNALCOMBUSTION: {
    name:        'IfcEngineEXTERNALCOMBUSTION',
    label:       'External Combustion',
    description: 'Combustion is external.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcEngine', 'IfcEngineEXTERNALCOMBUSTION'],
  },

  IFCENGINEINTERNALCOMBUSTION: {
    name:        'IfcEngineINTERNALCOMBUSTION',
    label:       'Internal Combustion',
    description: 'Combustion is internal.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcEngine', 'IfcEngineINTERNALCOMBUSTION'],
  },

  IFCEVAPORATIVECOOLER: {
    name:        'IfcEvaporativeCooler',
    label:       'Evaporative Cooler',
    description: 'An evaporative cooler is a device that cools air by saturating it with water vapor.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcEvaporativeCooler'],
  },

  IFCEVAPORATIVECOOLERDIRECTEVAPORATIVEAIRWASHER: {
    name:        'IfcEvaporativeCoolerDIRECTEVAPORATIVEAIRWASHER',
    label:       'Direct Evaporative Air Washer',
    description: 'Cools the air stream by evaporating water dircectly into the air stream using coolers with spray-type air washer consist of a chamber or casing containing spray nozzles, and tank for collecting spray',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcEvaporativeCooler', 'IfcEvaporativeCoolerDIRECTEVAPORATIVEAIRWASHER'],
  },

  IFCEVAPORATIVECOOLERDIRECTEVAPORATIVEPACKAGEDROTAR: {
    name:        'IfcEvaporativeCoolerDIRECTEVAPORATIVEPACKAGEDROTAR',
    label:       'Direct Evaporative Packaged Rotary Air Cooler',
    description: 'Cools the air stream by evaporating water dircectly into the air stream using coolers that wet and wash the evaporative pad by rotating it through a water bath.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcEvaporativeCooler', 'IfcEvaporativeCoolerDIRECTEVAPORATIVEPACKAGEDROTAR'],
  },

  IFCEVAPORATIVECOOLERDIRECTEVAPORATIVERANDOMMEDIAAI: {
    name:        'IfcEvaporativeCoolerDIRECTEVAPORATIVERANDOMMEDIAAI',
    label:       'Direct Evaporative Random Media Air Cooler',
    description: 'Cools the air stream by evaporating water dircectly into the air stream using coolers with evaporative pads, usually of aspen wood or plastic fiber/foam.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcEvaporativeCooler', 'IfcEvaporativeCoolerDIRECTEVAPORATIVERANDOMMEDIAAI'],
  },

  IFCEVAPORATIVECOOLERDIRECTEVAPORATIVERIGIDMEDIAAIR: {
    name:        'IfcEvaporativeCoolerDIRECTEVAPORATIVERIGIDMEDIAAIR',
    label:       'Direct Evaporative Rigid Media Air Cooler',
    description: 'Cools the air stream by evaporating water dircectly into the air stream using coolers with sheets of rigid, corrugated material as the wetted surface.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcEvaporativeCooler', 'IfcEvaporativeCoolerDIRECTEVAPORATIVERIGIDMEDIAAIR'],
  },

  IFCEVAPORATIVECOOLERDIRECTEVAPORATIVESLINGERSPACKA: {
    name:        'IfcEvaporativeCoolerDIRECTEVAPORATIVESLINGERSPACKA',
    label:       'Direct Evaporative Slingers Packaged Air Cooler',
    description: 'Cools the air stream by evaporating water dircectly into the air stream using coolers with a water slinger in an evaporative cooling section and a fan section.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcEvaporativeCooler', 'IfcEvaporativeCoolerDIRECTEVAPORATIVESLINGERSPACKA'],
  },

  IFCEVAPORATIVECOOLERINDIRECTDIRECTCOMBINATION: {
    name:        'IfcEvaporativeCoolerINDIRECTDIRECTCOMBINATION',
    label:       'Indirect Direct Combination',
    description: 'Cools the air stream by evaporating water indirectly and without adding moisture into the air stream using a two-stage cooler with a first-stage indirect evaporative cooler and second-stage direct eva',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcEvaporativeCooler', 'IfcEvaporativeCoolerINDIRECTDIRECTCOMBINATION'],
  },

  IFCEVAPORATIVECOOLERINDIRECTEVAPORATIVECOOLINGTOWE: {
    name:        'IfcEvaporativeCoolerINDIRECTEVAPORATIVECOOLINGTOWE',
    label:       'Indirect Evaporative Cooling Tower or Coil Cooler',
    description: 'Cools the air stream by evaporating water indirectly and without adding moisture into the air stream using a combination of a cooling tower or other evaporative water cooler with a water-to-air heat e',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcEvaporativeCooler', 'IfcEvaporativeCoolerINDIRECTEVAPORATIVECOOLINGTOWE'],
  },

  IFCEVAPORATIVECOOLERINDIRECTEVAPORATIVEPACKAGEAIRC: {
    name:        'IfcEvaporativeCoolerINDIRECTEVAPORATIVEPACKAGEAIRC',
    label:       'Indirect Evaporative Package Air Cooler',
    description: 'Cools the air stream by evaporating water indirectly and without adding moisture into the air stream. On one side of the heat exchanger, the secondary air stream is cooled by evaporation, while on the',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcEvaporativeCooler', 'IfcEvaporativeCoolerINDIRECTEVAPORATIVEPACKAGEAIRC'],
  },

  IFCEVAPORATIVECOOLERINDIRECTEVAPORATIVEWETCOIL: {
    name:        'IfcEvaporativeCoolerINDIRECTEVAPORATIVEWETCOIL',
    label:       'Indirect Evaporative Wet Coil',
    description: 'Cools the air stream by evaporating water indirectly and without adding moisture into the air stream. [[Water]] is sprayed directly on the tubes of the heat exchanger where latent cooling takes place',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcEvaporativeCooler', 'IfcEvaporativeCoolerINDIRECTEVAPORATIVEWETCOIL'],
  },

  IFCEVAPORATOR: {
    name:        'IfcEvaporator',
    label:       'Evaporator',
    description: 'An evaporator is a device in which a liquid refrigerent is vaporized and absorbs heat from the surrounding fluid.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcEvaporator'],
  },

  IFCEVAPORATORDIRECTEXPANSION: {
    name:        'IfcEvaporatorDIRECTEXPANSION',
    label:       'Direct Expansion',
    description: 'Direct-expansion evaporator.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcEvaporator', 'IfcEvaporatorDIRECTEXPANSION'],
  },

  IFCEVAPORATORDIRECTEXPANSIONBRAZEDPLATE: {
    name:        'IfcEvaporatorDIRECTEXPANSIONBRAZEDPLATE',
    label:       'Direct Expansion Brazed Plate',
    description: 'Direct-expansion evaporator where a refrigerant evaporates inside plates brazed or welded together to make up an assembly of separate channels.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcEvaporator', 'IfcEvaporatorDIRECTEXPANSIONBRAZEDPLATE'],
  },

  IFCEVAPORATORDIRECTEXPANSIONSHELLANDTUBE: {
    name:        'IfcEvaporatorDIRECTEXPANSIONSHELLANDTUBE',
    label:       'Direct Expansion Shell and Tube',
    description: 'Direct-expansion evaporator where a refrigerant evaporates inside a series of baffles that channel the fluid throughout the shell side.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcEvaporator', 'IfcEvaporatorDIRECTEXPANSIONSHELLANDTUBE'],
  },

  IFCEVAPORATORDIRECTEXPANSIONTUBEINTUBE: {
    name:        'IfcEvaporatorDIRECTEXPANSIONTUBEINTUBE',
    label:       'Direct Expansion Tube In Tube',
    description: 'Direct-expansion evaporator where a refrigerant evaporates inside one or more pairs of coaxial tubes.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcEvaporator', 'IfcEvaporatorDIRECTEXPANSIONTUBEINTUBE'],
  },

  IFCEVAPORATORFLOODEDSHELLANDTUBE: {
    name:        'IfcEvaporatorFLOODEDSHELLANDTUBE',
    label:       'Flooded Shell and Tube',
    description: 'Evaporator in which refrigerant evaporates outside tubes.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcEvaporator', 'IfcEvaporatorFLOODEDSHELLANDTUBE'],
  },

  IFCEVAPORATORSHELLANDCOIL: {
    name:        'IfcEvaporatorSHELLANDCOIL',
    label:       'Shell and Coil',
    description: 'Evaporator in which refrigerant evaporates inside a simple coiled tube immersed in the fluid to be cooled.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcEvaporator', 'IfcEvaporatorSHELLANDCOIL'],
  },

  IFCEVENT: {
    name:        'IfcEvent',
    label:       'Event',
    description: 'An [[IfcEvent]] is something that happens that triggers an action or response.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProcess', 'IfcEvent'],
  },

  IFCEVENTENDEVENT: {
    name:        'IfcEventENDEVENT',
    label:       'End Event',
    description: 'A terminating event of a process.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProcess', 'IfcEvent', 'IfcEventENDEVENT'],
  },

  IFCEVENTINTERMEDIATEEVENT: {
    name:        'IfcEventINTERMEDIATEEVENT',
    label:       'Intermediate Event',
    description: 'An event that occurs at an intermediate stage of a process.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProcess', 'IfcEvent', 'IfcEventINTERMEDIATEEVENT'],
  },

  IFCEVENTSTARTEVENT: {
    name:        'IfcEventSTARTEVENT',
    label:       'Start Event',
    description: 'An initiating event of a process.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProcess', 'IfcEvent', 'IfcEventSTARTEVENT'],
  },

  IFCEXTERNALSPATIALELEMENT: {
    name:        'IfcExternalSpatialElement',
    label:       'External Spatial Element',
    description: 'The external spatial element defines external regions at the building site.',
    domain:      'Raummodell',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcExternalSpatialStructureElement', 'IfcExternalSpatialElement'],
  },

  IFCEXTERNALSPATIALELEMENTEXTERNAL: {
    name:        'IfcExternalSpatialElementEXTERNAL',
    label:       'External',
    description: 'External air space around the building.',
    domain:      'Raummodell',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcExternalSpatialStructureElement', 'IfcExternalSpatialElement', 'IfcExternalSpatialElementEXTERNAL'],
  },

  IFCEXTERNALSPATIALELEMENTEXTERNAL_EARTH: {
    name:        'IfcExternalSpatialElementEXTERNAL_EARTH',
    label:       'External Earth',
    description: 'External volume covered by earth around the building.',
    domain:      'Raummodell',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcExternalSpatialStructureElement', 'IfcExternalSpatialElement', 'IfcExternalSpatialElementEXTERNAL_EARTH'],
  },

  IFCEXTERNALSPATIALELEMENTEXTERNAL_FIRE: {
    name:        'IfcExternalSpatialElementEXTERNAL_FIRE',
    label:       'External Fire',
    description: 'Space occupied by a neighboring building.',
    domain:      'Raummodell',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcExternalSpatialStructureElement', 'IfcExternalSpatialElement', 'IfcExternalSpatialElementEXTERNAL_FIRE'],
  },

  IFCEXTERNALSPATIALELEMENTEXTERNAL_WATER: {
    name:        'IfcExternalSpatialElementEXTERNAL_WATER',
    label:       'External Water',
    description: 'External volume covered with water around the building.',
    domain:      'Raummodell',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcExternalSpatialStructureElement', 'IfcExternalSpatialElement', 'IfcExternalSpatialElementEXTERNAL_WATER'],
  },

  IFCEXTERNALSPATIALSTRUCTUREELEMENT: {
    name:        'IfcExternalSpatialStructureElement',
    label:       'External Spatial Structure Element',
    description: 'The external spatial structure element is an abstract entity provided for different kind of external spaces, regions, and volumes.',
    domain:      'Raummodell',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcExternalSpatialStructureElement'],
  },

  IFCFACILITY: {
    name:        'IfcFacility',
    label:       'Facility',
    description: 'A Facility (derived from [[IfcSpatialStructureElement]]) may be an [[IfcBuilding]], an [[IfcBridge]], an [[IfcRailway]], an [[IfcRoad]], an [[IfcMarineFacility]] (or any other type of built facility d',
    domain:      'Räumliche Struktur',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacility'],
  },

  IFCFACILITYPART: {
    name:        'IfcFacilityPart',
    label:       'Facility Part',
    description: '[[IfcFacilityPart]] provides for spatial breakdown of built facilities. It may be further specialised according to the type of facility being broken down.',
    domain:      'Räumliche Struktur',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart'],
  },

  IFCFACILITYPARTCOMMON: {
    name:        'IfcFacilityPartCommon',
    label:       'Facility Part Common',
    description: 'A part that is not clearly part of one domain but is a hybrid and has shared responsibilities in multiple domains.',
    domain:      'Räumliche Struktur',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcFacilityPartCommon'],
  },

  IFCFACILITYPARTCOMMONABOVEGROUND: {
    name:        'IfcFacilityPartCommonABOVEGROUND',
    label:       'Above Ground',
    description: 'A vertical facility part for elements belonging to the space above the finished ground.',
    domain:      'Räumliche Struktur',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcFacilityPartCommon', 'IfcFacilityPartCommonABOVEGROUND'],
  },

  IFCFACILITYPARTCOMMONBELOWGROUND: {
    name:        'IfcFacilityPartCommonBELOWGROUND',
    label:       'Below Ground',
    description: 'A vertical facility part for the containment of elements below the finished ground. This may include for example earthworks elements and elements in a pavement structure.',
    domain:      'Räumliche Struktur',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcFacilityPartCommon', 'IfcFacilityPartCommonBELOWGROUND'],
  },

  IFCFACILITYPARTCOMMONJUNCTION: {
    name:        'IfcFacilityPartCommonJUNCTION',
    label:       'Junction',
    description: 'A longitudinal facility part providing an at grade junction between two or more segments of longitudinal facilities usually of the same type.',
    domain:      'Räumliche Struktur',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcFacilityPartCommon', 'IfcFacilityPartCommonJUNCTION'],
  },

  IFCFACILITYPARTCOMMONLEVELCROSSING: {
    name:        'IfcFacilityPartCommonLEVELCROSSING',
    label:       'Level Crossing',
    description: 'A longitudinal facility part providing an at grade crossing between two or more different modes of transport e.g. road and railway or road and pedestrian.',
    domain:      'Räumliche Struktur',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcFacilityPartCommon', 'IfcFacilityPartCommonLEVELCROSSING'],
  },

  IFCFACILITYPARTCOMMONSEGMENT: {
    name:        'IfcFacilityPartCommonSEGMENT',
    label:       'Segment',
    description: 'A longitudinal facility part encompassing a linear portion of the facility defined by some uniform characteristics, or a transition between segments of uniform characteristics.',
    domain:      'Räumliche Struktur',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcFacilityPartCommon', 'IfcFacilityPartCommonSEGMENT'],
  },

  IFCFACILITYPARTCOMMONSUBSTRUCTURE: {
    name:        'IfcFacilityPartCommonSUBSTRUCTURE',
    label:       'Sub Structure',
    description: 'A vertical facility part comprising of an underlying or supporting structure. this can be above or below finished ground level.',
    domain:      'Räumliche Struktur',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcFacilityPartCommon', 'IfcFacilityPartCommonSUBSTRUCTURE'],
  },

  IFCFACILITYPARTCOMMONSUPERSTRUCTURE: {
    name:        'IfcFacilityPartCommonSUPERSTRUCTURE',
    label:       'Super Structure',
    description: 'A vertical facility part comprising of the upper volume of a structure, usually forming the volume of operation or the receiving of live loading.',
    domain:      'Räumliche Struktur',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcFacilityPartCommon', 'IfcFacilityPartCommonSUPERSTRUCTURE'],
  },

  IFCFACILITYPARTCOMMONTERMINAL: {
    name:        'IfcFacilityPartCommonTERMINAL',
    label:       'Terminal',
    description: 'A longitudinal facility part that represents a termination segment of a longitudinal facility such as the end of a breakwater, road or rail section.',
    domain:      'Räumliche Struktur',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcFacilityPartCommon', 'IfcFacilityPartCommonTERMINAL'],
  },

  IFCFAN: {
    name:        'IfcFan',
    label:       'Fan',
    description: 'A fan is a device which imparts mechanical work on a gas. A typical usage of a fan is to induce airflow in a building services air distribution system.',
    domain:      'TGA / Förderung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowMovingDevice', 'IfcFan'],
  },

  IFCFANCENTRIFUGALAIRFOIL: {
    name:        'IfcFanCENTRIFUGALAIRFOIL',
    label:       'Centrifugal Air Foil',
    description: 'Air flows through the impeller radially using blades that are airfoil shaped.',
    domain:      'TGA / Förderung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowMovingDevice', 'IfcFan', 'IfcFanCENTRIFUGALAIRFOIL'],
  },

  IFCFANCENTRIFUGALBACKWARDINCLINEDCURVED: {
    name:        'IfcFanCENTRIFUGALBACKWARDINCLINEDCURVED',
    label:       'Centrifugal Backward Inclined Curved',
    description: 'Air flows through the impeller radially using blades that are backward curved.',
    domain:      'TGA / Förderung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowMovingDevice', 'IfcFan', 'IfcFanCENTRIFUGALBACKWARDINCLINEDCURVED'],
  },

  IFCFANCENTRIFUGALFORWARDCURVED: {
    name:        'IfcFanCENTRIFUGALFORWARDCURVED',
    label:       'Centrifugal Forward Curved',
    description: 'Air flows through the impeller radially using blades that are forward curved.',
    domain:      'TGA / Förderung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowMovingDevice', 'IfcFan', 'IfcFanCENTRIFUGALFORWARDCURVED'],
  },

  IFCFANCENTRIFUGALRADIAL: {
    name:        'IfcFanCENTRIFUGALRADIAL',
    label:       'Centrifugal Radial',
    description: 'Air flows through the impeller radially using blades that are uncurved or slightly forward curved.',
    domain:      'TGA / Förderung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowMovingDevice', 'IfcFan', 'IfcFanCENTRIFUGALRADIAL'],
  },

  IFCFANPROPELLORAXIAL: {
    name:        'IfcFanPROPELLORAXIAL',
    label:       'Propellor Axial',
    description: 'Air flows through the impeller axially and small hub-to-tip ratio impeller mounted in an orifice plate or inlet ring.',
    domain:      'TGA / Förderung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowMovingDevice', 'IfcFan', 'IfcFanPROPELLORAXIAL'],
  },

  IFCFANTUBEAXIAL: {
    name:        'IfcFanTUBEAXIAL',
    label:       'Tube Axial',
    description: 'Air flows through the impeller axially with reduced tip clearance and operating at higher tip speeds.',
    domain:      'TGA / Förderung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowMovingDevice', 'IfcFan', 'IfcFanTUBEAXIAL'],
  },

  IFCFANVANEAXIAL: {
    name:        'IfcFanVANEAXIAL',
    label:       'Vane Axial',
    description: 'Air flows through the impeller axially with guide vanes and reduced running blade tip clearance.',
    domain:      'TGA / Förderung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowMovingDevice', 'IfcFan', 'IfcFanVANEAXIAL'],
  },

  IFCFASTENER: {
    name:        'IfcFastener',
    label:       'Fastener',
    description: 'Representations of fixing parts which are used as fasteners to connect or join elements with other elements. Excluded are mechanical fasteners which are modeled by a separate entity ([[IfcMechanicalFa',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcFastener'],
  },

  IFCFASTENERGLUE: {
    name:        'IfcFastenerGLUE',
    label:       'Glue',
    description: 'A fastening connection where glue is used to join together elements.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcFastener', 'IfcFastenerGLUE'],
  },

  IFCFASTENERMORTAR: {
    name:        'IfcFastenerMORTAR',
    label:       'Mortar',
    description: 'A composition of mineralic or other materials used to fill jointing gaps and possibly fulfilling a load carrying role.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcFastener', 'IfcFastenerMORTAR'],
  },

  IFCFASTENERWELD: {
    name:        'IfcFastenerWELD',
    label:       'Weld',
    description: 'A weld seam between parts of metallic material or other suitable materials.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcFastener', 'IfcFastenerWELD'],
  },

  IFCFEATUREELEMENT: {
    name:        'IfcFeatureElement',
    label:       'Feature Element',
    description: 'A feature element is a generalization of all existence dependent elements which modify the shape and appearance of the associated master element. The [[IfcFeatureElement]] offers the ability to handle',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFeatureElement'],
  },

  IFCFEATUREELEMENTADDITION: {
    name:        'IfcFeatureElementAddition',
    label:       'Feature Element Addition',
    description: 'A feature element addition is a specialization of the general feature element, that represents an existence dependent element which modifies the shape and appearance of the associated master element.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFeatureElement', 'IfcFeatureElementAddition'],
  },

  IFCFEATUREELEMENTSUBTRACTION: {
    name:        'IfcFeatureElementSubtraction',
    label:       'Feature Element Subtraction',
    description: 'The [[IfcFeatureElementSubtraction]] is specialization of the general feature element, that represents an existence dependent element which modifies the shape and appearance of the associated master e',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFeatureElement', 'IfcFeatureElementSubtraction'],
  },

  IFCFILTER: {
    name:        'IfcFilter',
    label:       'Filter',
    description: 'A filter is an apparatus used to remove particulate or gaseous matter from fluids and gases.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTreatmentDevice', 'IfcFilter'],
  },

  IFCFILTERAIRPARTICLEFILTER: {
    name:        'IfcFilterAIRPARTICLEFILTER',
    label:       'Air Particle Filter',
    description: 'A filter used to remove particulates from air.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTreatmentDevice', 'IfcFilter', 'IfcFilterAIRPARTICLEFILTER'],
  },

  IFCFILTERCOMPRESSEDAIRFILTER: {
    name:        'IfcFilterCOMPRESSEDAIRFILTER',
    label:       'Compressed Air Filter',
    description: 'A filter used to remove particulates from compressed air.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTreatmentDevice', 'IfcFilter', 'IfcFilterCOMPRESSEDAIRFILTER'],
  },

  IFCFILTERODORFILTER: {
    name:        'IfcFilterODORFILTER',
    label:       'Odor Filter',
    description: 'A filter used to remove odors from air.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTreatmentDevice', 'IfcFilter', 'IfcFilterODORFILTER'],
  },

  IFCFILTEROILFILTER: {
    name:        'IfcFilterOILFILTER',
    label:       'Oil Filter',
    description: 'A filter used to remove particulates from oil.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTreatmentDevice', 'IfcFilter', 'IfcFilterOILFILTER'],
  },

  IFCFILTERSTRAINER: {
    name:        'IfcFilterSTRAINER',
    label:       'St Rain Er',
    description: 'A filter used to remove particulates from a fluid.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTreatmentDevice', 'IfcFilter', 'IfcFilterSTRAINER'],
  },

  IFCFILTERWATERFILTER: {
    name:        'IfcFilterWATERFILTER',
    label:       'Water Filter',
    description: 'A filter used to remove particulates from water.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTreatmentDevice', 'IfcFilter', 'IfcFilterWATERFILTER'],
  },

  IFCFIRESUPPRESSIONTERMINAL: {
    name:        'IfcFireSuppressionTerminal',
    label:       'Fire Suppression Terminal',
    description: 'A fire suppression terminal has the purpose of delivering a fluid (gas or liquid) that will suppress a fire.',
    domain:      'TGA / Sanitär',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcFireSuppressionTerminal'],
  },

  IFCFIRESUPPRESSIONTERMINALBREECHINGINLET: {
    name:        'IfcFireSuppressionTerminalBREECHINGINLET',
    label:       'Breeching Inlet',
    description: 'Symmetrical pipe fitting that unites two or more inlets into a single pipe. A breeching inlet may be used on either a wet or dry riser. Used by fire services personnel for fast connection of fire appl',
    domain:      'TGA / Sanitär',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcFireSuppressionTerminal', 'IfcFireSuppressionTerminalBREECHINGINLET'],
  },

  IFCFIRESUPPRESSIONTERMINALFIREHYDRANT: {
    name:        'IfcFireSuppressionTerminalFIREHYDRANT',
    label:       'Fire Hydrant',
    description: 'Device, fitted to a pipe, through which a temporary supply of water may be provided. May also be termed a stand pipe.',
    domain:      'TGA / Sanitär',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcFireSuppressionTerminal', 'IfcFireSuppressionTerminalFIREHYDRANT'],
  },

  IFCFIRESUPPRESSIONTERMINALFIREMONITOR: {
    name:        'IfcFireSuppressionTerminalFIREMONITOR',
    label:       'Fire Monitor',
    description: 'Fire monitor.',
    domain:      'TGA / Sanitär',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcFireSuppressionTerminal', 'IfcFireSuppressionTerminalFIREMONITOR'],
  },

  IFCFIRESUPPRESSIONTERMINALHOSEREEL: {
    name:        'IfcFireSuppressionTerminalHOSEREEL',
    label:       'Hose Reel',
    description: 'A supporting framework on which a hose may be wound.',
    domain:      'TGA / Sanitär',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcFireSuppressionTerminal', 'IfcFireSuppressionTerminalHOSEREEL'],
  },

  IFCFIRESUPPRESSIONTERMINALSPRINKLER: {
    name:        'IfcFireSuppressionTerminalSPRINKLER',
    label:       'Sprinkler',
    description: 'Device for sprinkling water from a pipe under pressure over an area.',
    domain:      'TGA / Sanitär',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcFireSuppressionTerminal', 'IfcFireSuppressionTerminalSPRINKLER'],
  },

  IFCFIRESUPPRESSIONTERMINALSPRINKLERDEFLECTOR: {
    name:        'IfcFireSuppressionTerminalSPRINKLERDEFLECTOR',
    label:       'Sprinkler Deflector',
    description: 'Device attached to a sprinkler to deflect the water flow into a spread pattern to cover the required area.',
    domain:      'TGA / Sanitär',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcFireSuppressionTerminal', 'IfcFireSuppressionTerminalSPRINKLERDEFLECTOR'],
  },

  IFCFLOWCONTROLLER: {
    name:        'IfcFlowController',
    label:       'Flow Controller',
    description: 'The distribution flow element [[IfcFlowController]] defines the occurrence of elements of a distribution system that are used to regulate flow through a distribution system. Examples include dampers,',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController'],
  },

  IFCFLOWFITTING: {
    name:        'IfcFlowFitting',
    label:       'Flow Fitting',
    description: 'The distribution flow element [[IfcFlowFitting]] defines the occurrence of a junction or transition in a flow distribution system, such as an elbow or tee. Its type is defined by IfcFlowFittingType or',
    domain:      'TGA / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowFitting'],
  },

  IFCFLOWINSTRUMENT: {
    name:        'IfcFlowInstrument',
    label:       'Flow Instrument',
    description: 'A flow instrument reads and displays the value of a particular property of a system at a point, or displays the difference in the value of a property between two points.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcFlowInstrument'],
  },

  IFCFLOWINSTRUMENTAMMETER: {
    name:        'IfcFlowInstrumentAMMETER',
    label:       'AM Meter',
    description: 'A device that reads and displays the current flow in a circuit.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcFlowInstrument', 'IfcFlowInstrumentAMMETER'],
  },

  IFCFLOWINSTRUMENTCOMBINED: {
    name:        'IfcFlowInstrumentCOMBINED',
    label:       'Combined',
    description: 'A device that reads and displays the value of multiple properties of a system at a point, or displays the difference in the value of a property between two points.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcFlowInstrument', 'IfcFlowInstrumentCOMBINED'],
  },

  IFCFLOWINSTRUMENTFREQUENCYMETER: {
    name:        'IfcFlowInstrumentFREQUENCYMETER',
    label:       'Frequency Meter',
    description: 'A device that reads and displays the electrical frequency of an alternating current circuit.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcFlowInstrument', 'IfcFlowInstrumentFREQUENCYMETER'],
  },

  IFCFLOWINSTRUMENTPHASEANGLEMETER: {
    name:        'IfcFlowInstrumentPHASEANGLEMETER',
    label:       'Phaseangle Meter',
    description: 'A device that reads and displays the phase angle of a phase in a polyphase electrical circuit.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcFlowInstrument', 'IfcFlowInstrumentPHASEANGLEMETER'],
  },

  IFCFLOWINSTRUMENTPOWERFACTORMETER: {
    name:        'IfcFlowInstrumentPOWERFACTORMETER',
    label:       'Powerfactor Meter',
    description: 'A device that reads and displays the power factor of an electrical circuit.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcFlowInstrument', 'IfcFlowInstrumentPOWERFACTORMETER'],
  },

  IFCFLOWINSTRUMENTPRESSUREGAUGE: {
    name:        'IfcFlowInstrumentPRESSUREGAUGE',
    label:       'Pressure Gauge',
    description: 'A device that reads and displays a pressure value at a point or the pressure difference between two points.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcFlowInstrument', 'IfcFlowInstrumentPRESSUREGAUGE'],
  },

  IFCFLOWINSTRUMENTTHERMOMETER: {
    name:        'IfcFlowInstrumentTHERMOMETER',
    label:       'Thermo Meter',
    description: 'A device that reads and displays a temperature value at a point.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcFlowInstrument', 'IfcFlowInstrumentTHERMOMETER'],
  },

  IFCFLOWINSTRUMENTVOLTMETER: {
    name:        'IfcFlowInstrumentVOLTMETER',
    label:       'Volt Meter',
    description: 'A device that measures and displays the voltage in a circuit.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcFlowInstrument', 'IfcFlowInstrumentVOLTMETER'],
  },

  IFCFLOWINSTRUMENTVOLTMETER_PEAK: {
    name:        'IfcFlowInstrumentVOLTMETER_PEAK',
    label:       'Volt Meter Peak',
    description: 'A device that reads and displays the peak voltage in an electrical circuit.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcFlowInstrument', 'IfcFlowInstrumentVOLTMETER_PEAK'],
  },

  IFCFLOWINSTRUMENTVOLTMETER_RMS: {
    name:        'IfcFlowInstrumentVOLTMETER_RMS',
    label:       'Volt Meter Rms',
    description: 'A device that reads and displays the RMS (mean) voltage in an electrical circuit.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcFlowInstrument', 'IfcFlowInstrumentVOLTMETER_RMS'],
  },

  IFCFLOWMETER: {
    name:        'IfcFlowMeter',
    label:       'Flow Meter',
    description: 'A flow meter is a device that is used to measure the flow rate in a system.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcFlowMeter'],
  },

  IFCFLOWMETERENERGYMETER: {
    name:        'IfcFlowMeterENERGYMETER',
    label:       'Energy Meter',
    description: 'An electric meter or energy meter is a device that measures the amount of electrical energy supplied to or produced by a residence, business or machine.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcFlowMeter', 'IfcFlowMeterENERGYMETER'],
  },

  IFCFLOWMETERGASMETER: {
    name:        'IfcFlowMeterGASMETER',
    label:       'Gas Meter',
    description: 'A device that measures the quantity of a gas or fuel.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcFlowMeter', 'IfcFlowMeterGASMETER'],
  },

  IFCFLOWMETEROILMETER: {
    name:        'IfcFlowMeterOILMETER',
    label:       'Oil Meter',
    description: 'A device that measures the quantity of oil.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcFlowMeter', 'IfcFlowMeterOILMETER'],
  },

  IFCFLOWMETERWATERMETER: {
    name:        'IfcFlowMeterWATERMETER',
    label:       'Water Meter',
    description: 'A device that measures the quantity of water.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcFlowMeter', 'IfcFlowMeterWATERMETER'],
  },

  IFCFLOWMOVINGDEVICE: {
    name:        'IfcFlowMovingDevice',
    label:       'Flow Moving Device',
    description: 'The distribution flow element [[IfcFlowMovingDevice]] defines the occurrence of an apparatus used to distribute, circulate or perform conveyance of fluids, including liquids and gases (such as a pump',
    domain:      'TGA / Förderung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowMovingDevice'],
  },

  IFCFLOWSEGMENT: {
    name:        'IfcFlowSegment',
    label:       'Flow Segment',
    description: 'The distribution flow element [[IfcFlowSegment]] defines the occurrence of a segment of a flow distribution system.',
    domain:      'TGA / Verteilung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowSegment'],
  },

  IFCFLOWSTORAGEDEVICE: {
    name:        'IfcFlowStorageDevice',
    label:       'Flow Storage Device',
    description: 'The distribution flow element [[IfcFlowStorageDevice]] defines the occurrence of a device that participates in a distribution system and is used for temporary storage (such as a tank). Its type is def',
    domain:      'TGA / Speicher',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowStorageDevice'],
  },

  IFCFLOWTERMINAL: {
    name:        'IfcFlowTerminal',
    label:       'Flow Terminal',
    description: 'The distribution flow element [[IfcFlowTerminal]] defines the occurrence of a permanently attached element that acts as a terminus or beginning of a distribution system (such as an air outlet, drain,',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal'],
  },

  IFCFLOWTREATMENTDEVICE: {
    name:        'IfcFlowTreatmentDevice',
    label:       'Flow Treatment Device',
    description: 'The distribution flow element [[IfcFlowTreatmentDevice]] defines the occurrence of a device typically used to remove unwanted matter from a fluid, either liquid or gas, and typically participates in a',
    domain:      'TGA / Verteilung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTreatmentDevice'],
  },

  IFCFOOTING: {
    name:        'IfcFooting',
    label:       'Footing',
    description: 'A footing is a part of the foundation of a structure that spreads and transmits the load to the soil. A footing is also characterized as shallow foundation, where the loads are transferred to the grou',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcFooting'],
  },

  IFCFOOTINGCAISSON_FOUNDATION: {
    name:        'IfcFootingCAISSON_FOUNDATION',
    label:       'Caisson Foundation',
    description: 'A foundation construction type used in underwater construction.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcFooting', 'IfcFootingCAISSON_FOUNDATION'],
  },

  IFCFOOTINGFOOTING_BEAM: {
    name:        'IfcFootingFOOTING_BEAM',
    label:       'Footing Beam',
    description: 'Footing elements that are in bending and are supported clear of the ground. They will normally span between piers, piles or pile caps. They are distinguished from beams in the building superstructure',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcFooting', 'IfcFootingFOOTING_BEAM'],
  },

  IFCFOOTINGPAD_FOOTING: {
    name:        'IfcFootingPAD_FOOTING',
    label:       'Pad Footing',
    description: 'An element that transfers the load of a single column (possibly two) to the ground.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcFooting', 'IfcFootingPAD_FOOTING'],
  },

  IFCFOOTINGPILE_CAP: {
    name:        'IfcFootingPILE_CAP',
    label:       'Pile Cap',
    description: 'An element that transfers the load from a column or group of columns to a pier or pile or group of piers or piles.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcFooting', 'IfcFootingPILE_CAP'],
  },

  IFCFOOTINGSTRIP_FOOTING: {
    name:        'IfcFootingSTRIP_FOOTING',
    label:       'Strip Footing',
    description: 'A linear element that transfers loads into the ground from either a continuous element, such as a wall, or from a series of elements, such as columns.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcFooting', 'IfcFootingSTRIP_FOOTING'],
  },

  IFCFURNISHINGELEMENT: {
    name:        'IfcFurnishingElement',
    label:       'Furnishing Element',
    description: 'A furnishing element is a generalization of all furniture related objects. Furnishing objects are characterized as being',
    domain:      'Ausstattung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFurnishingElement'],
  },

  IFCFURNITURE: {
    name:        'IfcFurniture',
    label:       'Furniture',
    description: 'Furniture defines complete furnishings such as a table, desk, chair, or cabinet, which may or may not be permanently attached to a building structure.',
    domain:      'Ausstattung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFurnishingElement', 'IfcFurniture'],
  },

  IFCFURNITUREBED: {
    name:        'IfcFurnitureBED',
    label:       'Bed',
    description: 'Furniture for sleeping.',
    domain:      'Ausstattung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFurnishingElement', 'IfcFurniture', 'IfcFurnitureBED'],
  },

  IFCFURNITURECHAIR: {
    name:        'IfcFurnitureCHAIR',
    label:       'Chair',
    description: 'Furniture for seating a single person.',
    domain:      'Ausstattung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFurnishingElement', 'IfcFurniture', 'IfcFurnitureCHAIR'],
  },

  IFCFURNITUREDESK: {
    name:        'IfcFurnitureDESK',
    label:       'Desk',
    description: 'Furniture with a countertop and optional drawers for a single person.',
    domain:      'Ausstattung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFurnishingElement', 'IfcFurniture', 'IfcFurnitureDESK'],
  },

  IFCFURNITUREFILECABINET: {
    name:        'IfcFurnitureFILECABINET',
    label:       'File Cabinet',
    description: 'Furniture with sliding drawers for storing files.',
    domain:      'Ausstattung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFurnishingElement', 'IfcFurniture', 'IfcFurnitureFILECABINET'],
  },

  IFCFURNITURESHELF: {
    name:        'IfcFurnitureSHELF',
    label:       'Shelf',
    description: 'Furniture for storing books or other items.',
    domain:      'Ausstattung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFurnishingElement', 'IfcFurniture', 'IfcFurnitureSHELF'],
  },

  IFCFURNITURESOFA: {
    name:        'IfcFurnitureSOFA',
    label:       'Sofa',
    description: 'Furniture for seating multiple people.',
    domain:      'Ausstattung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFurnishingElement', 'IfcFurniture', 'IfcFurnitureSOFA'],
  },

  IFCFURNITURETABLE: {
    name:        'IfcFurnitureTABLE',
    label:       'Table',
    description: 'Furniture with a countertop for multiple people.',
    domain:      'Ausstattung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFurnishingElement', 'IfcFurniture', 'IfcFurnitureTABLE'],
  },

  IFCFURNITURETECHNICALCABINET: {
    name:        'IfcFurnitureTECHNICALCABINET',
    label:       'Technical Cabinet',
    description: 'A technical cabinet is a piece of furniture for holding, displaying and protecting technical appliances, usually organized in shelves, drawers or racks.',
    domain:      'Ausstattung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFurnishingElement', 'IfcFurniture', 'IfcFurnitureTECHNICALCABINET'],
  },

  IFCGEOGRAPHICELEMENT: {
    name:        'IfcGeographicElement',
    label:       'Geographic Element',
    description: 'An [[IfcGeographicElement]] is a generalization of all elements within a geographical landscape. It includes occurrences of typical geographical elements, often referred to as features, such as trees',
    domain:      'Gelände / Kartierung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcGeographicElement'],
  },

  IFCGEOGRAPHICELEMENTSOIL_BORING_POINT: {
    name:        'IfcGeographicElementSOIL_BORING_POINT',
    label:       'Soil Boring Point',
    description: 'Soil boring point',
    domain:      'Gelände / Kartierung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcGeographicElement', 'IfcGeographicElementSOIL_BORING_POINT'],
  },

  IFCGEOGRAPHICELEMENTTERRAIN: {
    name:        'IfcGeographicElementTERRAIN',
    label:       'Ter Rain',
    description: 'Terrain',
    domain:      'Gelände / Kartierung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcGeographicElement', 'IfcGeographicElementTERRAIN'],
  },

  IFCGEOGRAPHICELEMENTVEGETATION: {
    name:        'IfcGeographicElementVEGETATION',
    label:       'Vegetation',
    description: 'Plant life or plant cover (as of an area). For example trees, shrubs, herbs, grasses, ferns, and mosses.',
    domain:      'Gelände / Kartierung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcGeographicElement', 'IfcGeographicElementVEGETATION'],
  },

  IFCGEOMODEL: {
    name:        'IfcGeomodel',
    label:       'Geomodel',
    description: 'Representation of the concept of a volumetric geological and geotechnical model, usually an interpretation but sometimes created direct from ground penetrating measurement.; The assembly may contain o',
    domain:      'Geotechnik',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcGeotechnicalElement', 'IfcGeotechnicalAssembly', 'IfcGeomodel'],
  },

  IFCGEOSLICE: {
    name:        'IfcGeoslice',
    label:       'Geoslice',
    description: 'Representation of the concept of a sectional planar geological and geotechnical model, usually an interpretation but sometimes created direct from ground penetrating measurement. The assembly may cont',
    domain:      'Geotechnik',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcGeotechnicalElement', 'IfcGeotechnicalAssembly', 'IfcGeoslice'],
  },

  IFCGEOTECHNICALASSEMBLY: {
    name:        'IfcGeotechnicalAssembly',
    label:       'Geotechnical Assembly',
    description: 'Representation of the abstract concept of a geological and geotechnical model, usually an interpretation but sometimes created direct from ground penetrating measurement.; Use of an assembly is option',
    domain:      'Geotechnik',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcGeotechnicalElement', 'IfcGeotechnicalAssembly'],
  },

  IFCGEOTECHNICALELEMENT: {
    name:        'IfcGeotechnicalElement',
    label:       'Geotechnical Element',
    description: 'Abstract supertype for geotechnical entities.',
    domain:      'Geotechnik',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcGeotechnicalElement'],
  },

  IFCGEOTECHNICALSTRATUM: {
    name:        'IfcGeotechnicalStratum',
    label:       'Geotechnical Stratum',
    description: 'Representation of the concept of an identified discrete almost homogeneous geological feature with either an irregular solid or \\\'Yabuki\\\' top surface shape or a regular voxel cubic shape. A stratum i',
    domain:      'Geotechnik',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcGeotechnicalElement', 'IfcGeotechnicalStratum'],
  },

  IFCGEOTECHNICALSTRATUMSOLID: {
    name:        'IfcGeotechnicalStratumSOLID',
    label:       'Solid',
    description: 'Representation of the concept of an identified discrete almost homogenous solid geological or surface feature, including discontinuities such as faults, fractures, boundaries and interfaces that are n',
    domain:      'Geotechnik',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcGeotechnicalElement', 'IfcGeotechnicalStratum', 'IfcGeotechnicalStratumSOLID'],
  },

  IFCGEOTECHNICALSTRATUMVOID: {
    name:        'IfcGeotechnicalStratumVOID',
    label:       'Void',
    description: 'Representation of the concept of an identified discrete air filled geological feature, including caves and other voids.',
    domain:      'Geotechnik',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcGeotechnicalElement', 'IfcGeotechnicalStratum', 'IfcGeotechnicalStratumVOID'],
  },

  IFCGEOTECHNICALSTRATUMWATER: {
    name:        'IfcGeotechnicalStratumWATER',
    label:       'Water',
    description: 'Representation of the concept of an identified discrete water filled geological or surface feature including lakes, rivers and seas.',
    domain:      'Geotechnik',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcGeotechnicalElement', 'IfcGeotechnicalStratum', 'IfcGeotechnicalStratumWATER'],
  },

  IFCGRID: {
    name:        'IfcGrid',
    label:       'Grid',
    description: '[[IfcGrid]] ia a planar design grid defined in 3D space used as an aid in locating structural and design elements. The position of the grid (ObjectPlacement) is defined by a 3D coordinate system (and',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcPositioningElement', 'IfcGrid'],
  },

  IFCGRIDIRREGULAR: {
    name:        'IfcGridIRREGULAR',
    label:       'Irregular',
    description: 'An [[IfcGrid]] with u-axes, v-axes, and optionally w-axes that cannot be described by the patterns.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcPositioningElement', 'IfcGrid', 'IfcGridIRREGULAR'],
  },

  IFCGRIDRADIAL: {
    name:        'IfcGridRADIAL',
    label:       'Radial',
    description: 'An [[IfcGrid]] with straight u-axes and curved v-axes. All grid axes being part of V-axes have the same center point and are concentric circular arcs. All grid axes being part of u-axes intersect at t',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcPositioningElement', 'IfcGrid', 'IfcGridRADIAL'],
  },

  IFCGRIDRECTANGULAR: {
    name:        'IfcGridRECTANGULAR',
    label:       'Rectangular',
    description: 'An [[IfcGrid]] with straight u-axes and straight v-axes being perpendicular to each other. All grid axes being part of u-axes can be described by one axis line and all other axes being 2D offsets from',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcPositioningElement', 'IfcGrid', 'IfcGridRECTANGULAR'],
  },

  IFCGRIDTRIANGULAR: {
    name:        'IfcGridTRIANGULAR',
    label:       'Triangular',
    description: 'An [[IfcGrid]] with u-axes, v-axes, and w-axes all being co-linear axis lines with a 2D offset. The v-axes are at 60 degree rotated counter clockwise from the u-axes, and the w-axes are at 120 degree',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcPositioningElement', 'IfcGrid', 'IfcGridTRIANGULAR'],
  },

  IFCGROUP: {
    name:        'IfcGroup',
    label:       'Group',
    description: '[[IfcGroup]] is an generalization of any arbitrary group. A group is a logical collection of objects. It does not have its own position, nor can it hold its own shape representation. Therefore a group',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup'],
  },

  IFCHEATEXCHANGER: {
    name:        'IfcHeatExchanger',
    label:       'Heat Exchanger',
    description: 'A heat exchanger is a device used to provide heat transfer between non-mixing media such as plate and shell and tube heat exchangers.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcHeatExchanger'],
  },

  IFCHEATEXCHANGERPLATE: {
    name:        'IfcHeatExchangerPLATE',
    label:       'Plate',
    description: 'Plate heat exchanger.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcHeatExchanger', 'IfcHeatExchangerPLATE'],
  },

  IFCHEATEXCHANGERSHELLANDTUBE: {
    name:        'IfcHeatExchangerSHELLANDTUBE',
    label:       'Shell and Tube',
    description: 'Shell and Tube heat exchanger.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcHeatExchanger', 'IfcHeatExchangerSHELLANDTUBE'],
  },

  IFCHEATEXCHANGERTURNOUTHEATING: {
    name:        'IfcHeatExchangerTURNOUTHEATING',
    label:       'Turnout Heating',
    description: 'A device used to remove snow from railways. E.g. electric heating device, gas heater',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcHeatExchanger', 'IfcHeatExchangerTURNOUTHEATING'],
  },

  IFCHUMIDIFIER: {
    name:        'IfcHumidifier',
    label:       'Humidifier',
    description: 'A humidifier is a device that adds moisture into the air.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcHumidifier'],
  },

  IFCHUMIDIFIERADIABATICAIRWASHER: {
    name:        'IfcHumidifierADIABATICAIRWASHER',
    label:       'Adiabatic Air Washer',
    description: '[[Water]] vapor is added into the airstream through adiabatic evaporation using an air washing element.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcHumidifier', 'IfcHumidifierADIABATICAIRWASHER'],
  },

  IFCHUMIDIFIERADIABATICATOMIZING: {
    name:        'IfcHumidifierADIABATICATOMIZING',
    label:       'Adiabatic Atomizing',
    description: '[[Water]] vapor is added into the airstream through adiabatic evaporation using an atomizing element.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcHumidifier', 'IfcHumidifierADIABATICATOMIZING'],
  },

  IFCHUMIDIFIERADIABATICCOMPRESSEDAIRNOZZLE: {
    name:        'IfcHumidifierADIABATICCOMPRESSEDAIRNOZZLE',
    label:       'Adiabatic Compressed Air Nozzle',
    description: '[[Water]] vapor is added into the airstream through adiabatic evaporation using a compressed air nozzle.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcHumidifier', 'IfcHumidifierADIABATICCOMPRESSEDAIRNOZZLE'],
  },

  IFCHUMIDIFIERADIABATICPAN: {
    name:        'IfcHumidifierADIABATICPAN',
    label:       'Adiabatic Pan',
    description: '[[Water]] vapor is added into the airstream through adiabatic evaporation using a pan.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcHumidifier', 'IfcHumidifierADIABATICPAN'],
  },

  IFCHUMIDIFIERADIABATICRIGIDMEDIA: {
    name:        'IfcHumidifierADIABATICRIGIDMEDIA',
    label:       'Adiabatic Rigid Media',
    description: '[[Water]] vapor is added into the airstream through adiabatic evaporation using a rigid media.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcHumidifier', 'IfcHumidifierADIABATICRIGIDMEDIA'],
  },

  IFCHUMIDIFIERADIABATICULTRASONIC: {
    name:        'IfcHumidifierADIABATICULTRASONIC',
    label:       'Adiabatic Ultrasonic',
    description: '[[Water]] vapor is added into the airstream through adiabatic evaporation using an ultrasonic element.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcHumidifier', 'IfcHumidifierADIABATICULTRASONIC'],
  },

  IFCHUMIDIFIERADIABATICWETTEDELEMENT: {
    name:        'IfcHumidifierADIABATICWETTEDELEMENT',
    label:       'Adiabatic Wetted Element',
    description: '[[Water]] vapor is added into the airstream through adiabatic evaporation using a wetted element.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcHumidifier', 'IfcHumidifierADIABATICWETTEDELEMENT'],
  },

  IFCHUMIDIFIERASSISTEDBUTANE: {
    name:        'IfcHumidifierASSISTEDBUTANE',
    label:       'Assisted Butane',
    description: '[[Water]] vapor is added into the airstream through water heated evaporation using a butane heater.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcHumidifier', 'IfcHumidifierASSISTEDBUTANE'],
  },

  IFCHUMIDIFIERASSISTEDELECTRIC: {
    name:        'IfcHumidifierASSISTEDELECTRIC',
    label:       'Assisted Electric',
    description: '[[Water]] vapor is added into the airstream through water heated evaporation using an electric heater.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcHumidifier', 'IfcHumidifierASSISTEDELECTRIC'],
  },

  IFCHUMIDIFIERASSISTEDNATURALGAS: {
    name:        'IfcHumidifierASSISTEDNATURALGAS',
    label:       'Assisted Natural Gas',
    description: '[[Water]] vapor is added into the airstream through water heated evaporation using a natural gas heater.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcHumidifier', 'IfcHumidifierASSISTEDNATURALGAS'],
  },

  IFCHUMIDIFIERASSISTEDPROPANE: {
    name:        'IfcHumidifierASSISTEDPROPANE',
    label:       'Assisted Propane',
    description: '[[Water]] vapor is added into the airstream through water heated evaporation using a propane heater.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcHumidifier', 'IfcHumidifierASSISTEDPROPANE'],
  },

  IFCHUMIDIFIERASSISTEDSTEAM: {
    name:        'IfcHumidifierASSISTEDSTEAM',
    label:       'Assisted Steam',
    description: '[[Water]] vapor is added into the airstream through water heated evaporation using a steam heater.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcHumidifier', 'IfcHumidifierASSISTEDSTEAM'],
  },

  IFCHUMIDIFIERSTEAMINJECTION: {
    name:        'IfcHumidifierSTEAMINJECTION',
    label:       'Steam Injection',
    description: '[[Water]] vapor is added into the airstream through direct steam injection.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcHumidifier', 'IfcHumidifierSTEAMINJECTION'],
  },

  IFCIMPACTPROTECTIONDEVICE: {
    name:        'IfcImpactProtectionDevice',
    label:       'Impact Protection Device',
    description: 'An impact protection device is a component used to protect other built elements from kinetic damage.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcImpactProtectionDevice'],
  },

  IFCIMPACTPROTECTIONDEVICEBUMPER: {
    name:        'IfcImpactProtectionDeviceBUMPER',
    label:       'Bumper',
    description: 'A bumper is a buffer object at end of track that prevents driving over. It can be fixed on rails or the track panel, or can also be a natural element (e.g. rock, sand).',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcImpactProtectionDevice', 'IfcImpactProtectionDeviceBUMPER'],
  },

  IFCIMPACTPROTECTIONDEVICECRASHCUSHION: {
    name:        'IfcImpactProtectionDeviceCRASHCUSHION',
    label:       'Crashcushion',
    description: '',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcImpactProtectionDevice', 'IfcImpactProtectionDeviceCRASHCUSHION'],
  },

  IFCIMPACTPROTECTIONDEVICEDAMPINGSYSTEM: {
    name:        'IfcImpactProtectionDeviceDAMPINGSYSTEM',
    label:       'Damping System',
    description: 'An elastic element inserted between the superstructure (track and plate on slab track or ballast bed with ballast inserted in) and the tunnel structure (tunnel floor). Some of the elastic elements hav',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcImpactProtectionDevice', 'IfcImpactProtectionDeviceDAMPINGSYSTEM'],
  },

  IFCIMPACTPROTECTIONDEVICEFENDER: {
    name:        'IfcImpactProtectionDeviceFENDER',
    label:       'Fender',
    description: 'A passive or active device formed of a damper and impact panel that is mounted on the quayside to protect against vessel impact.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcImpactProtectionDevice', 'IfcImpactProtectionDeviceFENDER'],
  },

  IFCINTERCEPTOR: {
    name:        'IfcInterceptor',
    label:       'Interceptor',
    description: 'An interceptor is a device designed and installed in order to separate and retain deleterious, hazardous or undesirable matter while permitting normal sewage or liquids to discharge into a collection',
    domain:      'TGA / Sanitär',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTreatmentDevice', 'IfcInterceptor'],
  },

  IFCINTERCEPTORCYCLONIC: {
    name:        'IfcInterceptorCYCLONIC',
    label:       'Cyclonic',
    description: 'Removes larger liquid drops or larger solid particles.',
    domain:      'TGA / Sanitär',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTreatmentDevice', 'IfcInterceptor', 'IfcInterceptorCYCLONIC'],
  },

  IFCINTERCEPTORGREASE: {
    name:        'IfcInterceptorGREASE',
    label:       'Grease',
    description: 'Chamber, on the line of a drain or discharge pipe, that prevents grease passing into a drainage system.',
    domain:      'TGA / Sanitär',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTreatmentDevice', 'IfcInterceptor', 'IfcInterceptorGREASE'],
  },

  IFCINTERCEPTOROIL: {
    name:        'IfcInterceptorOIL',
    label:       'Oil',
    description: 'One or more chambers arranged to prevent the ingress of oil to a drain or sewer that retains the oil for later removal.',
    domain:      'TGA / Sanitär',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTreatmentDevice', 'IfcInterceptor', 'IfcInterceptorOIL'],
  },

  IFCINTERCEPTORPETROL: {
    name:        'IfcInterceptorPETROL',
    label:       'Petrol',
    description: 'Two or more chambers with inlet and outlet pipes arranged to allow petrol/gasoline collected on the surface of water drained into them to evaporate through ventilating pipes.',
    domain:      'TGA / Sanitär',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTreatmentDevice', 'IfcInterceptor', 'IfcInterceptorPETROL'],
  },

  IFCINVENTORY: {
    name:        'IfcInventory',
    label:       'Inventory',
    description: 'An inventory is a list of items within an enterprise.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcInventory'],
  },

  IFCINVENTORYASSETINVENTORY: {
    name:        'IfcInventoryASSETINVENTORY',
    label:       'Asset Inventory',
    description: 'A collection of asset instances of type [[IfcAsset]].',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcInventory', 'IfcInventoryASSETINVENTORY'],
  },

  IFCINVENTORYFURNITUREINVENTORY: {
    name:        'IfcInventoryFURNITUREINVENTORY',
    label:       'Furniture Inventory',
    description: 'A collection of furniture instances of type [[IfcFurnishingElement]].',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcInventory', 'IfcInventoryFURNITUREINVENTORY'],
  },

  IFCINVENTORYSPACEINVENTORY: {
    name:        'IfcInventorySPACEINVENTORY',
    label:       'Space Inventory',
    description: 'A collection of space instances of type [[IfcSpace]].',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcInventory', 'IfcInventorySPACEINVENTORY'],
  },

  IFCJUNCTIONBOX: {
    name:        'IfcJunctionBox',
    label:       'Junction Box',
    description: 'A junction box is an enclosure within which cables are connected.',
    domain:      'TGA / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowFitting', 'IfcJunctionBox'],
  },

  IFCJUNCTIONBOXDATA: {
    name:        'IfcJunctionBoxDATA',
    label:       'Data',
    description: 'Contains cables, outlets, and/or switches for communications use.',
    domain:      'TGA / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowFitting', 'IfcJunctionBox', 'IfcJunctionBoxDATA'],
  },

  IFCJUNCTIONBOXPOWER: {
    name:        'IfcJunctionBoxPOWER',
    label:       'Power',
    description: 'Contains cables, outlets, and/or switches for electrical power.',
    domain:      'TGA / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowFitting', 'IfcJunctionBox', 'IfcJunctionBoxPOWER'],
  },

  IFCKERB: {
    name:        'IfcKerb',
    label:       'Kerb',
    description: 'A border of stone, concrete or other rigid material formed at the edge of the carriageway or footway.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcKerb'],
  },

  IFCLAMP: {
    name:        'IfcLamp',
    label:       'Lamp',
    description: 'A lamp is an artificial light source such as a light bulb or tube.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcLamp'],
  },

  IFCLAMPCOMPACTFLUORESCENT: {
    name:        'IfcLampCOMPACTFLUORESCENT',
    label:       'Compact Fluorescent',
    description: 'A fluorescent lamp having a compact form factor produced by shaping the tube.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcLamp', 'IfcLampCOMPACTFLUORESCENT'],
  },

  IFCLAMPFLUORESCENT: {
    name:        'IfcLampFLUORESCENT',
    label:       'Fluorescent',
    description: 'A typically tubular discharge lamp in which most of the light is emitted by one or several layers of phosphors excited by ultraviolet radiation from the discharge.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcLamp', 'IfcLampFLUORESCENT'],
  },

  IFCLAMPHALOGEN: {
    name:        'IfcLampHALOGEN',
    label:       'Halogen',
    description: 'An incandescent lamp in which a tungsten filament is sealed into a compact transport envelope filled with an inert gas and a small amount of halogen such as iodine or bromine.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcLamp', 'IfcLampHALOGEN'],
  },

  IFCLAMPHIGHPRESSUREMERCURY: {
    name:        'IfcLampHIGHPRESSUREMERCURY',
    label:       'High Pressure Mercury',
    description: 'A discharge lamp in which most of the light is emitted by exciting mercury at high pressure.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcLamp', 'IfcLampHIGHPRESSUREMERCURY'],
  },

  IFCLAMPHIGHPRESSURESODIUM: {
    name:        'IfcLampHIGHPRESSURESODIUM',
    label:       'High Pressure Sodium',
    description: 'A discharge lamp in which most of the light is emitted by exciting sodium at high pressure.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcLamp', 'IfcLampHIGHPRESSURESODIUM'],
  },

  IFCLAMPLED: {
    name:        'IfcLampLED',
    label:       'LED',
    description: 'A solid state lamp that uses light-emitting diodes as the source of light.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcLamp', 'IfcLampLED'],
  },

  IFCLAMPMETALHALIDE: {
    name:        'IfcLampMETALHALIDE',
    label:       'Metalhalide',
    description: 'A discharge lamp in which most of the light is emitted by exciting a metal halide.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcLamp', 'IfcLampMETALHALIDE'],
  },

  IFCLAMPOLED: {
    name:        'IfcLampOLED',
    label:       'OLED',
    description: 'A solid state lamp that uses light-emitting diodes as the source of light whose emissive electroluminescent layer is composed of a film of organic compounds.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcLamp', 'IfcLampOLED'],
  },

  IFCLAMPTUNGSTENFILAMENT: {
    name:        'IfcLampTUNGSTENFILAMENT',
    label:       'Tungsten Filament',
    description: 'A lamp that emits light by passing an electrical current through a tungsten wire filament in a near vacuum.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcLamp', 'IfcLampTUNGSTENFILAMENT'],
  },

  IFCLIGHTFIXTURE: {
    name:        'IfcLightFixture',
    label:       'Light Fixture',
    description: 'A light fixture is a container that is designed for the purpose of housing one or more lamps and optionally devices that control, restrict or vary their emission.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcLightFixture'],
  },

  IFCLIGHTFIXTUREDIRECTIONSOURCE: {
    name:        'IfcLightFixtureDIRECTIONSOURCE',
    label:       'Direction Source',
    description: 'A light fixture that is considered to have a length or surface area from which it emits light in a direction. A light fixture containing one or more fluorescent lamps is an example of a direction sour',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcLightFixture', 'IfcLightFixtureDIRECTIONSOURCE'],
  },

  IFCLIGHTFIXTUREPOINTSOURCE: {
    name:        'IfcLightFixturePOINTSOURCE',
    label:       'Point Source',
    description: 'A light fixture that is considered to have negligible area and that emit light with approximately equal intensity in all directions. A light fixture containing a tungsten, halogen or similar bulb is a',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcLightFixture', 'IfcLightFixturePOINTSOURCE'],
  },

  IFCLIGHTFIXTURESECURITYLIGHTING: {
    name:        'IfcLightFixtureSECURITYLIGHTING',
    label:       'Security Light Ing',
    description: 'A light fixture having specific purpose of directing occupants in an emergency, such as an illuminated exit sign or emergency flood light.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcLightFixture', 'IfcLightFixtureSECURITYLIGHTING'],
  },

  IFCLINEARELEMENT: {
    name:        'IfcLinearElement',
    label:       'Linear Element',
    description: 'A generalization of all linear elements that are parts of an alignment.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcLinearElement'],
  },

  IFCLINEARPOSITIONINGELEMENT: {
    name:        'IfcLinearPositioningElement',
    label:       'Linear Positioning Element',
    description: 'An [[IfcLinearPositioningElement]] is an entity describing positioning according to a curve.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcPositioningElement', 'IfcLinearPositioningElement'],
  },

  IFCLIQUIDTERMINAL: {
    name:        'IfcLiquidTerminal',
    label:       'Liquid Terminal',
    description: 'A liquid terminal is a terminating or origination point for the transfer of liquid between distribution system(s). this is the point where the liquid distribution system interacts with the external en',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcLiquidTerminal'],
  },

  IFCLIQUIDTERMINALHOSEREEL: {
    name:        'IfcLiquidTerminalHOSEREEL',
    label:       'Hose Reel',
    description: 'A Supporting framework on which a hose may be wound whose primary purpose is to connect and interact with the external environment.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcLiquidTerminal', 'IfcLiquidTerminalHOSEREEL'],
  },

  IFCLIQUIDTERMINALLOADINGARM: {
    name:        'IfcLiquidTerminalLOADINGARM',
    label:       'Loading Arm',
    description: 'A loading arm permits the transfer of liquid or liquefied gas from one system to another, through the use of an articulated arm that accounts for the movement of docked vessels.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcLiquidTerminal', 'IfcLiquidTerminalLOADINGARM'],
  },

  IFCMARINEFACILITY: {
    name:        'IfcMarineFacility',
    label:       'Marine Facility',
    description: 'A marine facility represents any major structure or entity that is specific to the ports and waterways domain. examples of this include quays, jetties, shipyards, breakwaters etc.',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacility', 'IfcMarineFacility'],
  },

  IFCMARINEFACILITYBARRIERBEACH: {
    name:        'IfcMarineFacilityBARRIERBEACH',
    label:       'Barrier Beach',
    description: 'a sand ridge that rises slightly above the surface of the sea and runs roughly parallel to the shore, from which it is separated by a lagoon.',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacility', 'IfcMarineFacility', 'IfcMarineFacilityBARRIERBEACH'],
  },

  IFCMARINEFACILITYBREAKWATER: {
    name:        'IfcMarineFacilityBREAKWATER',
    label:       'Break Water',
    description: 'A longitudinal structure that protects a shore area, harbour, basin or estuary from waves.;',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacility', 'IfcMarineFacility', 'IfcMarineFacilityBREAKWATER'],
  },

  IFCMARINEFACILITYCANAL: {
    name:        'IfcMarineFacilityCANAL',
    label:       'Canal',
    description: 'A man-made watercourse constructed usually, to join rivers, lakes or seas and often of a size suitable for navigation.;',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacility', 'IfcMarineFacility', 'IfcMarineFacilityCANAL'],
  },

  IFCMARINEFACILITYDRYDOCK: {
    name:        'IfcMarineFacilityDRYDOCK',
    label:       'Dry Dock',
    description: 'a Dry dock is an enclosed chamber (by gate) that allows the draining of water for the construction or repair of marine vessels.;',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacility', 'IfcMarineFacility', 'IfcMarineFacilityDRYDOCK'],
  },

  IFCMARINEFACILITYFLOATINGDOCK: {
    name:        'IfcMarineFacilityFLOATINGDOCK',
    label:       'Floatingdock',
    description: 'A spatial element that encompasses a floating dry dock and supporting quay side ancillaries.',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacility', 'IfcMarineFacility', 'IfcMarineFacilityFLOATINGDOCK'],
  },

  IFCMARINEFACILITYHYDROLIFT: {
    name:        'IfcMarineFacilityHYDROLIFT',
    label:       'Hydrolift',
    description: 'A type of vessel launch recovery facility, also known as a hydraulic lift dock, where ships are lifted vertically by water impounding systems, then floated laterally across the land to berths which su',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacility', 'IfcMarineFacility', 'IfcMarineFacilityHYDROLIFT'],
  },

  IFCMARINEFACILITYJETTY: {
    name:        'IfcMarineFacilityJETTY',
    label:       'Jetty',
    description: 'A berthing structure, that extends out into the sea usually perpendicular to the coastline, primarily for the transfer of liquid bulk materials.;',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacility', 'IfcMarineFacility', 'IfcMarineFacilityJETTY'],
  },

  IFCMARINEFACILITYLAUNCHRECOVERY: {
    name:        'IfcMarineFacilityLAUNCHRECOVERY',
    label:       'Launch Recovery',
    description: 'Subset of facilities for the function of launching or recovering vessels.',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacility', 'IfcMarineFacility', 'IfcMarineFacilityLAUNCHRECOVERY'],
  },

  IFCMARINEFACILITYMARINEDEFENCE: {
    name:        'IfcMarineFacilityMARINEDEFENCE',
    label:       'Marine Defence',
    description: 'A subset of facilities with the primary function of protection or defence of a coastal or flood area.',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacility', 'IfcMarineFacility', 'IfcMarineFacilityMARINEDEFENCE'],
  },

  IFCMARINEFACILITYNAVIGATIONALCHANNEL: {
    name:        'IfcMarineFacilityNAVIGATIONALCHANNEL',
    label:       'Navigational Channel',
    description: 'A natural navigable watercourse (such as a river) that needs to be managed or have improvements applied. This includes defined navigational areas in open seas and bays.;',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacility', 'IfcMarineFacility', 'IfcMarineFacilityNAVIGATIONALCHANNEL'],
  },

  IFCMARINEFACILITYPORT: {
    name:        'IfcMarineFacilityPORT',
    label:       'Port',
    description: 'A complex/facility for shipping and marine activities, this includes cargo, people and storage of vessels (marinas harbours).',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacility', 'IfcMarineFacility', 'IfcMarineFacilityPORT'],
  },

  IFCMARINEFACILITYQUAY: {
    name:        'IfcMarineFacilityQUAY',
    label:       'Quay',
    description: 'a facility for the mooring of vessels accompanied with the loading and unloading of cargo or passengers or the maintenance of vessels.',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacility', 'IfcMarineFacility', 'IfcMarineFacilityQUAY'],
  },

  IFCMARINEFACILITYREVETMENT: {
    name:        'IfcMarineFacilityREVETMENT',
    label:       'Revetment',
    description: 'A marine defensive structure made from earthworks, masonry or activities, built in such a way as to absorb the energy of incoming water.',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacility', 'IfcMarineFacility', 'IfcMarineFacilityREVETMENT'],
  },

  IFCMARINEFACILITYSHIPLIFT: {
    name:        'IfcMarineFacilitySHIPLIFT',
    label:       'Ship Lift',
    description: 'A type of vessel launch recovery facility, where ships are lifted vertically out of the water on platforms connected to winches, then transferred horizontally to land based berths on rail, wheel or tr',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacility', 'IfcMarineFacility', 'IfcMarineFacilitySHIPLIFT'],
  },

  IFCMARINEFACILITYSHIPLOCK: {
    name:        'IfcMarineFacilitySHIPLOCK',
    label:       'Ship Lock',
    description: 'A facility used for raising and lowering boats, ships and other watercraft between stretches of water of different levels on rivers and canal waterways or between impounded basins. This is achieved vi',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacility', 'IfcMarineFacility', 'IfcMarineFacilitySHIPLOCK'],
  },

  IFCMARINEFACILITYSHIPYARD: {
    name:        'IfcMarineFacilitySHIPYARD',
    label:       'Ship Yard',
    description: 'A coastal/waterside facility where ships are built and repaired.',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacility', 'IfcMarineFacility', 'IfcMarineFacilitySHIPYARD'],
  },

  IFCMARINEFACILITYSLIPWAY: {
    name:        'IfcMarineFacilitySLIPWAY',
    label:       'Slipway',
    description: 'A facility for the dynamic launch or recovery of a vessel utilizing an inclined ramp and gravitational or mechanical hauling systems.',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacility', 'IfcMarineFacility', 'IfcMarineFacilitySLIPWAY'],
  },

  IFCMARINEFACILITYWATERWAY: {
    name:        'IfcMarineFacilityWATERWAY',
    label:       'Waterway',
    description: 'A subset of facilities that have the primary function of providing a navigable area of water.',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacility', 'IfcMarineFacility', 'IfcMarineFacilityWATERWAY'],
  },

  IFCMARINEFACILITYWATERWAYSHIPLIFT: {
    name:        'IfcMarineFacilityWATERWAYSHIPLIFT',
    label:       'Waterway Ship Lift',
    description: 'A facility used for raising and lowering boats, ships and other watercraft between stretches of water of different levels on river and canal waterways or between impounded basins. This is achieved via',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacility', 'IfcMarineFacility', 'IfcMarineFacilityWATERWAYSHIPLIFT'],
  },

  IFCMARINEPART: {
    name:        'IfcMarinePart',
    label:       'Marine Part',
    description: 'Part of a marine facility.',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcMarinePart'],
  },

  IFCMARINEPARTABOVEWATERLINE: {
    name:        'IfcMarinePartABOVEWATERLINE',
    label:       'Above Water Line',
    description: 'A vertical spatial part that represents the part above the mean waterline defined within the site area.',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcMarinePart', 'IfcMarinePartABOVEWATERLINE'],
  },

  IFCMARINEPARTANCHORAGE: {
    name:        'IfcMarinePartANCHORAGE',
    label:       'Anchorage',
    description: 'A region spatial part that represents a managed area for the anchorage of vessels awaiting space and conditions to enter a port.',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcMarinePart', 'IfcMarinePartANCHORAGE'],
  },

  IFCMARINEPARTAPPROACHCHANNEL: {
    name:        'IfcMarinePartAPPROACHCHANNEL',
    label:       'Approach Channel',
    description: 'A longitudinal spatial part of a waterway or port facility that covers the approach of the primary facility.',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcMarinePart', 'IfcMarinePartAPPROACHCHANNEL'],
  },

  IFCMARINEPARTBELOWWATERLINE: {
    name:        'IfcMarinePartBELOWWATERLINE',
    label:       'Below Water Line',
    description: 'A vertical spatial part that represents the part below the mean waterline defined within the site area.',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcMarinePart', 'IfcMarinePartBELOWWATERLINE'],
  },

  IFCMARINEPARTBERTHINGSTRUCTURE: {
    name:        'IfcMarinePartBERTHINGSTRUCTURE',
    label:       'Berthing Structure',
    description: 'A longitudinal spatial part of a waterway or port facility that provides facilities for the berthing of vessels while waiting for the waterway facility to become available. For example waiting for a l',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcMarinePart', 'IfcMarinePartBERTHINGSTRUCTURE'],
  },

  IFCMARINEPARTCHAMBER: {
    name:        'IfcMarinePartCHAMBER',
    label:       'Chamber',
    description: 'A longitudinal spatial part of a waterway or port facility that forms the impounded chamber of a facility, such as a ship lock, dry dock or hydrolift',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcMarinePart', 'IfcMarinePartCHAMBER'],
  },

  IFCMARINEPARTCILL_LEVEL: {
    name:        'IfcMarinePartCILL_LEVEL',
    label:       'Cill Level',
    description: 'A vertical spatial part that represents the elevation of the cill and floor level of an impounded facility such as a ship lock or dry lock.',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcMarinePart', 'IfcMarinePartCILL_LEVEL'],
  },

  IFCMARINEPARTCOPELEVEL: {
    name:        'IfcMarinePartCOPELEVEL',
    label:       'Cope Level',
    description: 'A vertical spatial part that represents the elevation working surface of the quay for the placement of quay furniture and plant.',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcMarinePart', 'IfcMarinePartCOPELEVEL'],
  },

  IFCMARINEPARTCORE: {
    name:        'IfcMarinePartCORE',
    label:       'Core',
    description: 'A lateral spatial part that sub divides the core structure of a facility such as a breakwater or embankment',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcMarinePart', 'IfcMarinePartCORE'],
  },

  IFCMARINEPARTCREST: {
    name:        'IfcMarinePartCREST',
    label:       'Crest',
    description: 'A lateral spatial part that forms the crest area of breakwater or embankment where additional structures are placed such as access items or roads.',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcMarinePart', 'IfcMarinePartCREST'],
  },

  IFCMARINEPARTGATEHEAD: {
    name:        'IfcMarinePartGATEHEAD',
    label:       'Gate Head',
    description: 'A longitudinal spatial part of a waterway or port facility that forms the gate, supporting structure plant of an impounded facility such as a ship lock, dry dock or hydrolift.',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcMarinePart', 'IfcMarinePartGATEHEAD'],
  },

  IFCMARINEPARTGUDINGSTRUCTURE: {
    name:        'IfcMarinePartGUDINGSTRUCTURE',
    label:       'Guding Structure',
    description: 'A longitudinal spatial part of a waterway or port facility that forms the guiding and assistive structures at the entrance to an impounded facility.',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcMarinePart', 'IfcMarinePartGUDINGSTRUCTURE'],
  },

  IFCMARINEPARTHIGHWATERLINE: {
    name:        'IfcMarinePartHIGHWATERLINE',
    label:       'High Water Line',
    description: 'A vertical spatial part that represents the elevation of the high waterline, multiple high waterlines can be used to represent the different high tide types.',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcMarinePart', 'IfcMarinePartHIGHWATERLINE'],
  },

  IFCMARINEPARTLANDFIELD: {
    name:        'IfcMarinePartLANDFIELD',
    label:       'Land Field',
    description: 'A region or lateral facility part that covers the land field of a waterside facility such as a quay.',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcMarinePart', 'IfcMarinePartLANDFIELD'],
  },

  IFCMARINEPARTLEEWARDSIDE: {
    name:        'IfcMarinePartLEEWARDSIDE',
    label:       'Leeward Side',
    description: 'A lateral spatial part that covers the side of protective structures that do not experience weather or wave effects.',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcMarinePart', 'IfcMarinePartLEEWARDSIDE'],
  },

  IFCMARINEPARTLOWWATERLINE: {
    name:        'IfcMarinePartLOWWATERLINE',
    label:       'Low Water Line',
    description: 'A vertical spatial part that represents the elevation of the low waterline, multiple low waterlines can be used to represent the different low tide types.',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcMarinePart', 'IfcMarinePartLOWWATERLINE'],
  },

  IFCMARINEPARTMANUFACTURING: {
    name:        'IfcMarinePartMANUFACTURING',
    label:       'Manufacturing',
    description: 'A region spatial part that forms a sub division of a facility for the purpose of manufacturing. This covers areas that are open air and do not constitute a building or the building is only a small par',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcMarinePart', 'IfcMarinePartMANUFACTURING'],
  },

  IFCMARINEPARTNAVIGATIONALAREA: {
    name:        'IfcMarinePartNAVIGATIONALAREA',
    label:       'Navigational Area',
    description: 'A region spatial part that covers a managed navigational area that is maintained for an operational reason, this could be a dredged turning circle or waiting area.',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcMarinePart', 'IfcMarinePartNAVIGATIONALAREA'],
  },

  IFCMARINEPARTPROTECTION: {
    name:        'IfcMarinePartPROTECTION',
    label:       'Protection',
    description: 'A lateral or region spatial part that forms the area which contains protective measures for scour and erosion of a facility.',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcMarinePart', 'IfcMarinePartPROTECTION'],
  },

  IFCMARINEPARTSHIPTRANSFER: {
    name:        'IfcMarinePartSHIPTRANSFER',
    label:       'Ship Transfer',
    description: 'A region spatial part that represents a clear area used for the transfer and movement of vessels this area could include complex rail tracks and additional loading requirements.',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcMarinePart', 'IfcMarinePartSHIPTRANSFER'],
  },

  IFCMARINEPARTSTORAGEAREA: {
    name:        'IfcMarinePartSTORAGEAREA',
    label:       'Storage Area',
    description: 'A region spatial part that forms a sub division of a facility for the purpose of storing cargo. For example container stacks, dry bulk storage yards, material storage yards.',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcMarinePart', 'IfcMarinePartSTORAGEAREA'],
  },

  IFCMARINEPARTVEHICLESERVICING: {
    name:        'IfcMarinePartVEHICLESERVICING',
    label:       'Vehicle Servicing',
    description: 'A region spatial part that represents a functional division designed for the maintenance and/or storage of vehicles used for facility operations.',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcMarinePart', 'IfcMarinePartVEHICLESERVICING'],
  },

  IFCMARINEPARTWATERFIELD: {
    name:        'IfcMarinePartWATERFIELD',
    label:       'Water Field',
    description: 'A region or lateral facility part that covers the water field of a waterside facility such as a quay.',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcMarinePart', 'IfcMarinePartWATERFIELD'],
  },

  IFCMARINEPARTWEATHERSIDE: {
    name:        'IfcMarinePartWEATHERSIDE',
    label:       'Weather Side',
    description: 'A lateral spatial part that covers the side of protective structures that is designed to protect and be impacted by weather or wave effects. such as the outer side of breakwaters or the riverside of f',
    domain:      'Infrastruktur / Wasserbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcMarinePart', 'IfcMarinePartWEATHERSIDE'],
  },

  IFCMATERIAL: {
    name:        'IfcMaterial',
    label:       'Material',
    description: '[[IfcMaterial]] is a homogeneous or inhomogeneous substance that can be used to form elements (physical products or their components).',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcMaterial'],
  },

  IFCMECHANICALFASTENER: {
    name:        'IfcMechanicalFastener',
    label:       'Mechanical Fastener',
    description: 'A mechanical fasteners connecting building elements or parts mechanically. A single instance of this class may represent one or many of actual mechanical fasteners, for example an array of bolts or a',
    domain:      'Tragwerk / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcMechanicalFastener'],
  },

  IFCMECHANICALFASTENERANCHORBOLT: {
    name:        'IfcMechanicalFastenerANCHORBOLT',
    label:       'Anchorbolt',
    description: 'A special bolt which is anchored into concrete, stone, or brickwork.',
    domain:      'Tragwerk / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcMechanicalFastener', 'IfcMechanicalFastenerANCHORBOLT'],
  },

  IFCMECHANICALFASTENERBOLT: {
    name:        'IfcMechanicalFastenerBOLT',
    label:       'Bolt',
    description: 'A threaded cylindrical rod that engages with a similarly threaded hole in a nut or any other part to form a fastener. The mechanical fastener often also includes one or more washers and one or more nu',
    domain:      'Tragwerk / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcMechanicalFastener', 'IfcMechanicalFastenerBOLT'],
  },

  IFCMECHANICALFASTENERCHAIN: {
    name:        'IfcMechanicalFastenerCHAIN',
    label:       'Chain',
    description: 'a series of linked metal rings used for fastening or securing something, or for pulling loads.',
    domain:      'Tragwerk / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcMechanicalFastener', 'IfcMechanicalFastenerCHAIN'],
  },

  IFCMECHANICALFASTENERCOUPLER: {
    name:        'IfcMechanicalFastenerCOUPLER',
    label:       'Coupler',
    description: 'A part connecting two rod or bars, such as reinforcement bars.',
    domain:      'Tragwerk / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcMechanicalFastener', 'IfcMechanicalFastenerCOUPLER'],
  },

  IFCMECHANICALFASTENERDOWEL: {
    name:        'IfcMechanicalFastenerDOWEL',
    label:       'Dowel',
    description: 'A cylindrical rod that is driven into holes of the connected pieces.',
    domain:      'Tragwerk / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcMechanicalFastener', 'IfcMechanicalFastenerDOWEL'],
  },

  IFCMECHANICALFASTENERNAIL: {
    name:        'IfcMechanicalFastenerNAIL',
    label:       'Nail',
    description: 'A thin pointed piece of metal that is hammered into materials as a fastener.',
    domain:      'Tragwerk / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcMechanicalFastener', 'IfcMechanicalFastenerNAIL'],
  },

  IFCMECHANICALFASTENERNAILPLATE: {
    name:        'IfcMechanicalFastenerNAILPLATE',
    label:       'Nail Plate',
    description: 'A piece of sheet metal with punched points that overlaps the connected pieces and is pressed into their material.',
    domain:      'Tragwerk / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcMechanicalFastener', 'IfcMechanicalFastenerNAILPLATE'],
  },

  IFCMECHANICALFASTENERRAILFASTENING: {
    name:        'IfcMechanicalFastenerRAILFASTENING',
    label:       'Rail Fastening',
    description: 'An assembly of components which secures a rail to the supporting structure and retains it in the required position whilst permitting any necessary vertical, lateral and longitudinal movement.;definiti',
    domain:      'Tragwerk / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcMechanicalFastener', 'IfcMechanicalFastenerRAILFASTENING'],
  },

  IFCMECHANICALFASTENERRAILJOINT: {
    name:        'IfcMechanicalFastenerRAILJOINT',
    label:       'Rail Joint',
    description: 'A mechanical assembly with e.g. fishplates to join two rail ends with optional functions (insulation or expansion capacity).',
    domain:      'Tragwerk / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcMechanicalFastener', 'IfcMechanicalFastenerRAILJOINT'],
  },

  IFCMECHANICALFASTENERRIVET: {
    name:        'IfcMechanicalFastenerRIVET',
    label:       'Rivet',
    description: 'A fastening part having a head at one end and the other end being hammered flat after being passed through holes in the pieces that are fastened together.',
    domain:      'Tragwerk / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcMechanicalFastener', 'IfcMechanicalFastenerRIVET'],
  },

  IFCMECHANICALFASTENERROPE: {
    name:        'IfcMechanicalFastenerROPE',
    label:       'Rope',
    description: 'a length of thick strong cord made by twisting together strands of hemp, sisal, nylon, or similar material. used primarily for mooring vessels',
    domain:      'Tragwerk / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcMechanicalFastener', 'IfcMechanicalFastenerROPE'],
  },

  IFCMECHANICALFASTENERSCREW: {
    name:        'IfcMechanicalFastenerSCREW',
    label:       'Screw',
    description: 'A fastener with a tapered threaded shank and a slotted head.',
    domain:      'Tragwerk / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcMechanicalFastener', 'IfcMechanicalFastenerSCREW'],
  },

  IFCMECHANICALFASTENERSHEARCONNECTOR: {
    name:        'IfcMechanicalFastenerSHEARCONNECTOR',
    label:       'Shear Connector',
    description: 'A ring connector that is accepted by ring keyways in the connected pieces; or a toothed circular or square connector that is pressed into the connected pieces.',
    domain:      'Tragwerk / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcMechanicalFastener', 'IfcMechanicalFastenerSHEARCONNECTOR'],
  },

  IFCMECHANICALFASTENERSTAPLE: {
    name:        'IfcMechanicalFastenerSTAPLE',
    label:       'Staple',
    description: 'A doubly pointed piece of metal that is hammered into materials as a fastener.',
    domain:      'Tragwerk / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcMechanicalFastener', 'IfcMechanicalFastenerSTAPLE'],
  },

  IFCMECHANICALFASTENERSTUDSHEARCONNECTOR: {
    name:        'IfcMechanicalFastenerSTUDSHEARCONNECTOR',
    label:       'Stud Shear Connector',
    description: 'Stud shear connectors are cylindrical fastening parts with a head on one side. On the other side they are welded on steel members for the use in composite steel and concrete structures.',
    domain:      'Tragwerk / Verbindung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcMechanicalFastener', 'IfcMechanicalFastenerSTUDSHEARCONNECTOR'],
  },

  IFCMEDICALDEVICE: {
    name:        'IfcMedicalDevice',
    label:       'Medical Device',
    description: 'A medical device is attached to a medical piping system and operates upon medical gases to perform a specific function. Medical gases include medical air, medical vacuum, oxygen, carbon dioxide, nitro',
    domain:      'TGA / Sanitär',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcMedicalDevice'],
  },

  IFCMEDICALDEVICEAIRSTATION: {
    name:        'IfcMedicalDeviceAIRSTATION',
    label:       'Air Station',
    description: 'Device that provides purified medical air, composed of an air compressor and air treatment line.',
    domain:      'TGA / Sanitär',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcMedicalDevice', 'IfcMedicalDeviceAIRSTATION'],
  },

  IFCMEDICALDEVICEFEEDAIRUNIT: {
    name:        'IfcMedicalDeviceFEEDAIRUNIT',
    label:       'Feed Air Unit',
    description: 'Device that feeds air to an oxygen generator, composed of an air compressor, air treatment line, and an air receiver.',
    domain:      'TGA / Sanitär',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcMedicalDevice', 'IfcMedicalDeviceFEEDAIRUNIT'],
  },

  IFCMEDICALDEVICEOXYGENGENERATOR: {
    name:        'IfcMedicalDeviceOXYGENGENERATOR',
    label:       'Oxygen Generator',
    description: 'Device that generates oxygen from air.',
    domain:      'TGA / Sanitär',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcMedicalDevice', 'IfcMedicalDeviceOXYGENGENERATOR'],
  },

  IFCMEDICALDEVICEOXYGENPLANT: {
    name:        'IfcMedicalDeviceOXYGENPLANT',
    label:       'Oxygen Plant',
    description: 'Device that combines a feed air unit, oxygen generator, and backup oxygen cylinders.',
    domain:      'TGA / Sanitär',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcMedicalDevice', 'IfcMedicalDeviceOXYGENPLANT'],
  },

  IFCMEDICALDEVICEVACUUMSTATION: {
    name:        'IfcMedicalDeviceVACUUMSTATION',
    label:       'Vacuum Station',
    description: 'Device that provides suction, composed of a vacuum pump and bacterial filtration line.',
    domain:      'TGA / Sanitär',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcMedicalDevice', 'IfcMedicalDeviceVACUUMSTATION'],
  },

  IFCMEMBER: {
    name:        'IfcMember',
    label:       'Member',
    description: 'An [[IfcMember]] is a structural member designed to carry loads between or beyond points of support. It is not required to be load bearing. The orientation of the member (being horizontal, vertical or',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcMember'],
  },

  IFCMEMBERARCH_SEGMENT: {
    name:        'IfcMemberARCH_SEGMENT',
    label:       'Arch Segment',
    description: 'Individual segment of an arch structure.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcMember', 'IfcMemberARCH_SEGMENT'],
  },

  IFCMEMBERBRACE: {
    name:        'IfcMemberBRACE',
    label:       'Brace',
    description: 'A linear element (usually sloped) often used for bracing of a girder or truss.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcMember', 'IfcMemberBRACE'],
  },

  IFCMEMBERCHORD: {
    name:        'IfcMemberCHORD',
    label:       'Chord',
    description: 'Upper or lower longitudinal member of a truss, used horizontally or sloped.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcMember', 'IfcMemberCHORD'],
  },

  IFCMEMBERCOLLAR: {
    name:        'IfcMemberCOLLAR',
    label:       'Collar',
    description: 'A linear element (usually used horizontally) within a roof structure to connect rafters and posts.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcMember', 'IfcMemberCOLLAR'],
  },

  IFCMEMBERMEMBER: {
    name:        'IfcMemberMEMBER',
    label:       'Member',
    description: 'A linear element within a girder or truss with no further meaning.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcMember', 'IfcMemberMEMBER'],
  },

  IFCMEMBERMULLION: {
    name:        'IfcMemberMULLION',
    label:       'Mullion',
    description: 'A linear element within a curtain wall system to connect two (or more) panels.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcMember', 'IfcMemberMULLION'],
  },

  IFCMEMBERPLATE: {
    name:        'IfcMemberPLATE',
    label:       'Plate',
    description: 'A linear continuous horizontal element in wall framing, such as a head piece or a sole plate.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcMember', 'IfcMemberPLATE'],
  },

  IFCMEMBERPOST: {
    name:        'IfcMemberPOST',
    label:       'Post',
    description: 'A linear (usually vertical) member used to support something or to mark a point.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcMember', 'IfcMemberPOST'],
  },

  IFCMEMBERPURLIN: {
    name:        'IfcMemberPURLIN',
    label:       'Purlin',
    description: 'A linear element (usually used horizontally) within a roof structure to support rafters.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcMember', 'IfcMemberPURLIN'],
  },

  IFCMEMBERRAFTER: {
    name:        'IfcMemberRAFTER',
    label:       'Rafter',
    description: 'A linear elements used to support roof slabs or roof covering, usually used with slope.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcMember', 'IfcMemberRAFTER'],
  },

  IFCMEMBERSTAY_CABLE: {
    name:        'IfcMemberSTAY_CABLE',
    label:       'Stay Cable',
    description: 'A sloped element suspending a structure (such as bridge deck) from a pylon.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcMember', 'IfcMemberSTAY_CABLE'],
  },

  IFCMEMBERSTIFFENING_RIB: {
    name:        'IfcMemberSTIFFENING_RIB',
    label:       'Stiffening Rib',
    description: 'A linear element added to a flange or a web plate of a girder for local stiffening.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcMember', 'IfcMemberSTIFFENING_RIB'],
  },

  IFCMEMBERSTRINGER: {
    name:        'IfcMemberSTRINGER',
    label:       'Stringer',
    description: 'A linear element used to support stair or ramp flights, usually used with slope.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcMember', 'IfcMemberSTRINGER'],
  },

  IFCMEMBERSTRUCTURALCABLE: {
    name:        'IfcMemberSTRUCTURALCABLE',
    label:       'Structural Cable',
    description: 'A linear cable element used to secure or stabilise a structure by resisting lateral and longitudinal loading through tension only, but cannot resist compression. usually formed of a flexible cable or',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcMember', 'IfcMemberSTRUCTURALCABLE'],
  },

  IFCMEMBERSTRUT: {
    name:        'IfcMemberSTRUT',
    label:       'Strut',
    description: 'A linear element often used within a girder or truss.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcMember', 'IfcMemberSTRUT'],
  },

  IFCMEMBERSTUD: {
    name:        'IfcMemberSTUD',
    label:       'Stud',
    description: 'Vertical element in wall framing.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcMember', 'IfcMemberSTUD'],
  },

  IFCMEMBERSUSPENDER: {
    name:        'IfcMemberSUSPENDER',
    label:       'Suspender',
    description: 'A vertical element suspending a structure (such as bridge deck) from a suspension cable or an arch.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcMember', 'IfcMemberSUSPENDER'],
  },

  IFCMEMBERSUSPENSION_CABLE: {
    name:        'IfcMemberSUSPENSION_CABLE',
    label:       'Suspension Cable',
    description: 'A suspended element, typically comprising steel wire, sheath, etc.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcMember', 'IfcMemberSUSPENSION_CABLE'],
  },

  IFCMEMBERTIEBAR: {
    name:        'IfcMemberTIEBAR',
    label:       'Tiebar',
    description: 'A linear bar element used to secure or stabilise a structure by resisting lateral and longitudinal loading through tension and or compression. usually formed by a solid bar.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcMember', 'IfcMemberTIEBAR'],
  },

  IFCMOBILETELECOMMUNICATIONSAPPLIANCE: {
    name:        'IfcMobileTelecommunicationsAppliance',
    label:       'Mobile Telecommunications Appliance',
    description: 'A mobile telecommunications appliance is a device that transmits, converts, amplifies or receives signals used in mobile networks.;This entity is used to define specific appliances used in mobile tele',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcMobileTelecommunicationsAppliance'],
  },

  IFCMOBILETELECOMMUNICATIONSAPPLIANCEACCESSPOINT: {
    name:        'IfcMobileTelecommunicationsApplianceACCESSPOINT',
    label:       'Access Point',
    description: 'An access point is a device that allows wireless devices to connect to a wired network.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcMobileTelecommunicationsAppliance', 'IfcMobileTelecommunicationsApplianceACCESSPOINT'],
  },

  IFCMOBILETELECOMMUNICATIONSAPPLIANCEBASEBANDUNIT: {
    name:        'IfcMobileTelecommunicationsApplianceBASEBANDUNIT',
    label:       'Base Band Unit',
    description: 'A baseband unit is a component of a distributed base transceiver station for implementing baseband processing functions.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcMobileTelecommunicationsAppliance', 'IfcMobileTelecommunicationsApplianceBASEBANDUNIT'],
  },

  IFCMOBILETELECOMMUNICATIONSAPPLIANCEBASETRANSCEIVE: {
    name:        'IfcMobileTelecommunicationsApplianceBASETRANSCEIVE',
    label:       'Base Transceivers Tation',
    description: 'A base transceiver station (BTS) is a network component which serves one cell. It completes the conversion between base station controller and wireless channel, and realizes the wireless transmission',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcMobileTelecommunicationsAppliance', 'IfcMobileTelecommunicationsApplianceBASETRANSCEIVE'],
  },

  IFCMOBILETELECOMMUNICATIONSAPPLIANCEE_UTRAN_NODE_B: {
    name:        'IfcMobileTelecommunicationsApplianceE_UTRAN_NODE_B',
    label:       'E Utran Node B',
    description: 'An E-utran nodel B is a logical network component which serves one or more E-utran cells. It is the hardware connected to the evolved packet core (EPC), more specifically to the mobility management en',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcMobileTelecommunicationsAppliance', 'IfcMobileTelecommunicationsApplianceE_UTRAN_NODE_B'],
  },

  IFCMOBILETELECOMMUNICATIONSAPPLIANCEGATEWAY_GPRS_S: {
    name:        'IfcMobileTelecommunicationsApplianceGATEWAY_GPRS_S',
    label:       'Gateway GPRS Support Node',
    description: 'The gateway GPRS support node is a component of the GPRS core network that extends the GSM to allow packet switching functionalities. This component is responsible for the internetworking between the',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcMobileTelecommunicationsAppliance', 'IfcMobileTelecommunicationsApplianceGATEWAY_GPRS_S'],
  },

  IFCMOBILETELECOMMUNICATIONSAPPLIANCEMASTERUNIT: {
    name:        'IfcMobileTelecommunicationsApplianceMASTERUNIT',
    label:       'Master Unit',
    description: 'A master unit is a component of a repeater for coupling base station signals.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcMobileTelecommunicationsAppliance', 'IfcMobileTelecommunicationsApplianceMASTERUNIT'],
  },

  IFCMOBILETELECOMMUNICATIONSAPPLIANCEMOBILESWITCHIN: {
    name:        'IfcMobileTelecommunicationsApplianceMOBILESWITCHIN',
    label:       'Mobile Switching Center',
    description: 'The mobile switching centre (MSC) constitutes the interface between the radio system and the fixed networks. It is an exchange which performs all the switching and signalling functions for mobile stat',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcMobileTelecommunicationsAppliance', 'IfcMobileTelecommunicationsApplianceMOBILESWITCHIN'],
  },

  IFCMOBILETELECOMMUNICATIONSAPPLIANCEMSCSERVER: {
    name:        'IfcMobileTelecommunicationsApplianceMSCSERVER',
    label:       'MSC Server',
    description: 'The MSC server mainly comprises the call control (CC) and mobility control parts of a mobile switching center (MSC). An MSC server and a media gateway make up the full functionality of an MSC.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcMobileTelecommunicationsAppliance', 'IfcMobileTelecommunicationsApplianceMSCSERVER'],
  },

  IFCMOBILETELECOMMUNICATIONSAPPLIANCEPACKETCONTROLU: {
    name:        'IfcMobileTelecommunicationsAppliancePACKETCONTROLU',
    label:       'Packet Control Unit',
    description: 'A packet control unit performs some of the processing tasks of the base station controller for packet data. It is responsible for data packet, wireless channel management, error sending detection and',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcMobileTelecommunicationsAppliance', 'IfcMobileTelecommunicationsAppliancePACKETCONTROLU'],
  },

  IFCMOBILETELECOMMUNICATIONSAPPLIANCEREMOTERADIOUNI: {
    name:        'IfcMobileTelecommunicationsApplianceREMOTERADIOUNI',
    label:       'Remote Radio Unit',
    description: 'A remote radio unit is a component of a distributed base transceiver station that converts digital baseband signals into high-frequency (rf) signals and sends high-frequency (rf) signals to the antenn',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcMobileTelecommunicationsAppliance', 'IfcMobileTelecommunicationsApplianceREMOTERADIOUNI'],
  },

  IFCMOBILETELECOMMUNICATIONSAPPLIANCEREMOTEUNIT: {
    name:        'IfcMobileTelecommunicationsApplianceREMOTEUNIT',
    label:       'Remote Unit',
    description: 'A remote unit is a device used to amplify a base station signal.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcMobileTelecommunicationsAppliance', 'IfcMobileTelecommunicationsApplianceREMOTEUNIT'],
  },

  IFCMOBILETELECOMMUNICATIONSAPPLIANCESERVICE_GPRS_S: {
    name:        'IfcMobileTelecommunicationsApplianceSERVICE_GPRS_S',
    label:       'Service GPRS Support Node',
    description: 'The service GPRS support node (SGSN) is a component of the GPRS core network. It is the GPRS support node of mobile station service, and it can achieve mobility management and packet routing and trans',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcMobileTelecommunicationsAppliance', 'IfcMobileTelecommunicationsApplianceSERVICE_GPRS_S'],
  },

  IFCMOBILETELECOMMUNICATIONSAPPLIANCESUBSCRIBERSERV: {
    name:        'IfcMobileTelecommunicationsApplianceSUBSCRIBERSERV',
    label:       'Subscriber Server',
    description: 'It is a database in charge of the management of mobile subscribers. It can be an authentication center (AuC) or a home location register (HLR).',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcMobileTelecommunicationsAppliance', 'IfcMobileTelecommunicationsApplianceSUBSCRIBERSERV'],
  },

  IFCMOORINGDEVICE: {
    name:        'IfcMooringDevice',
    label:       'Mooring Device',
    description: 'A mooring device is an active or passive built element who\\\'s primary function is to participate in the mooring of a vessel, this could be in the form of a bollard used as an attachment point for line',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcMooringDevice'],
  },

  IFCMOORINGDEVICEBOLLARD: {
    name:        'IfcMooringDeviceBOLLARD',
    label:       'Bollard',
    description: 'a short, thick post on the deck of a ship or a quay side, to which ship\\\'s rope may be secured. not to be confused with traffic bollards.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcMooringDevice', 'IfcMooringDeviceBOLLARD'],
  },

  IFCMOORINGDEVICELINETENSIONER: {
    name:        'IfcMooringDeviceLINETENSIONER',
    label:       'Line Tensioner',
    description: 'A mechanical device used to apply a tensioning load to mooring lines to improve vessel stability for port operations.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcMooringDevice', 'IfcMooringDeviceLINETENSIONER'],
  },

  IFCMOORINGDEVICEMAGNETICDEVICE: {
    name:        'IfcMooringDeviceMAGNETICDEVICE',
    label:       'Magnetic Device',
    description: 'Mooring device that uses magnets as the primary method of securing the vessel.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcMooringDevice', 'IfcMooringDeviceMAGNETICDEVICE'],
  },

  IFCMOORINGDEVICEMOORINGHOOKS: {
    name:        'IfcMooringDeviceMOORINGHOOKS',
    label:       'Mooring Hooks',
    description: 'Quick release mooring hooks - an active device used to secure a vessel and provide automated release of vessels.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcMooringDevice', 'IfcMooringDeviceMOORINGHOOKS'],
  },

  IFCMOORINGDEVICEVACUUMDEVICE: {
    name:        'IfcMooringDeviceVACUUMDEVICE',
    label:       'Vacuum Device',
    description: 'Mooring device that uses vacuum suction as the primary method of securing the vessel.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcMooringDevice', 'IfcMooringDeviceVACUUMDEVICE'],
  },

  IFCMOTORCONNECTION: {
    name:        'IfcMotorConnection',
    label:       'Motor Connection',
    description: 'A motor connection provides the means for connecting a motor as the driving device to the driven device.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcMotorConnection'],
  },

  IFCMOTORCONNECTIONBELTDRIVE: {
    name:        'IfcMotorConnectionBELTDRIVE',
    label:       'Belt Drive',
    description: 'An indirect connection made through the medium of a shaped, flexible continuous loop.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcMotorConnection', 'IfcMotorConnectionBELTDRIVE'],
  },

  IFCMOTORCONNECTIONCOUPLING: {
    name:        'IfcMotorConnectionCOUPLING',
    label:       'Coupling',
    description: 'An indirect connection made through the medium of the viscosity of a fluid.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcMotorConnection', 'IfcMotorConnectionCOUPLING'],
  },

  IFCMOTORCONNECTIONDIRECTDRIVE: {
    name:        'IfcMotorConnectionDIRECTDRIVE',
    label:       'Direct Drive',
    description: 'A direct, physical connection made between the motor and the driven device.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcMotorConnection', 'IfcMotorConnectionDIRECTDRIVE'],
  },

  IFCNAVIGATIONELEMENT: {
    name:        'IfcNavigationElement',
    label:       'Navigation Element',
    description: 'A navigation element is an active or passive built element who\\\'s primary function is to provide navigational instructions and warnings to vessels, this could be in the form of a floating buoy, a fixe',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcNavigationElement'],
  },

  IFCNAVIGATIONELEMENTBEACON: {
    name:        'IfcNavigationElementBEACON',
    label:       'Beacon',
    description: 'a fixed vertical structure serving as a navigation mark, to show reefs or other hazards, or provide navigational directions.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcNavigationElement', 'IfcNavigationElementBEACON'],
  },

  IFCNAVIGATIONELEMENTBUOY: {
    name:        'IfcNavigationElementBUOY',
    label:       'Buoy',
    description: 'an anchored floating structure serving as a navigation mark, to show reefs or other hazards, or provide navigational directions.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcNavigationElement', 'IfcNavigationElementBUOY'],
  },

  IFCOBJECT: {
    name:        'IfcObject',
    label:       'Object',
    description: 'An [[IfcObject]] is the generalization of any semantically treated thing or process. Objects are things as they appear - i.e. occurrences.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject'],
  },

  IFCOBJECTDEFINITION: {
    name:        'IfcObjectDefinition',
    label:       'Object Definition',
    description: 'An [[IfcObjectDefinition]] is the generalization of any semantically treated thing or process, either being a type or an occurrence. Object definitions can be named, using the inherited [[Name]] attri',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition'],
  },

  IFCOCCUPANT: {
    name:        'IfcOccupant',
    label:       'Occupant',
    description: 'An occupant is a type of actor that defines the form of occupancy of a property.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcActor', 'IfcOccupant'],
  },

  IFCOCCUPANTASSIGNEE: {
    name:        'IfcOccupantASSIGNEE',
    label:       'Assignee',
    description: 'Actor receiving the assignment of a property agreement from an assignor.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcActor', 'IfcOccupant', 'IfcOccupantASSIGNEE'],
  },

  IFCOCCUPANTASSIGNOR: {
    name:        'IfcOccupantASSIGNOR',
    label:       'Assignor',
    description: 'Actor assigning a property agreement to an assignor.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcActor', 'IfcOccupant', 'IfcOccupantASSIGNOR'],
  },

  IFCOCCUPANTLESSEE: {
    name:        'IfcOccupantLESSEE',
    label:       'Lessee',
    description: 'Actor receiving the lease of a property from a lessor.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcActor', 'IfcOccupant', 'IfcOccupantLESSEE'],
  },

  IFCOCCUPANTLESSOR: {
    name:        'IfcOccupantLESSOR',
    label:       'Lessor',
    description: 'Actor leasing a property to a lessee.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcActor', 'IfcOccupant', 'IfcOccupantLESSOR'],
  },

  IFCOCCUPANTLETTINGAGENT: {
    name:        'IfcOccupantLETTINGAGENT',
    label:       'Letting Agent',
    description: 'Actor participating in a property agreement on behalf of an owner, lessor or assignor.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcActor', 'IfcOccupant', 'IfcOccupantLETTINGAGENT'],
  },

  IFCOCCUPANTOWNER: {
    name:        'IfcOccupantOWNER',
    label:       'Owner',
    description: 'Actor that owns a property.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcActor', 'IfcOccupant', 'IfcOccupantOWNER'],
  },

  IFCOCCUPANTTENANT: {
    name:        'IfcOccupantTENANT',
    label:       'Tenant',
    description: 'Actor renting the use of a property fro a period of time.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcActor', 'IfcOccupant', 'IfcOccupantTENANT'],
  },

  IFCOPENINGELEMENT: {
    name:        'IfcOpeningElement',
    label:       'Opening Element',
    description: 'The opening element stands for opening, recess or chase, all reflecting voids. It represents a void within any element that has physical manifestation. Openings can be inserted into walls, slabs, beam',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFeatureElement', 'IfcFeatureElementSubtraction', 'IfcOpeningElement'],
  },

  IFCOPENINGELEMENTOPENING: {
    name:        'IfcOpeningElementOPENING',
    label:       'Open Ing',
    description: 'An opening as subtraction feature that cuts through the element it voids. It thereby creates a hole. An opening in addition has a particular meaning for either providing a void for doors or windows, o',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFeatureElement', 'IfcFeatureElementSubtraction', 'IfcOpeningElement', 'IfcOpeningElementOPENING'],
  },

  IFCOPENINGELEMENTRECESS: {
    name:        'IfcOpeningElementRECESS',
    label:       'Recess',
    description: 'An opening as subtraction feature that does not cut through the element it voids. It creates a niche or similar voiding pattern.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFeatureElement', 'IfcFeatureElementSubtraction', 'IfcOpeningElement', 'IfcOpeningElementRECESS'],
  },

  IFCOUTLET: {
    name:        'IfcOutlet',
    label:       'Outlet',
    description: 'An outlet is a device installed at a point to receive one or more inserted plugs for electrical power or communications.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcOutlet'],
  },

  IFCOUTLETAUDIOVISUALOUTLET: {
    name:        'IfcOutletAUDIOVISUALOUTLET',
    label:       'Audiovisual Outlet',
    description: 'An outlet used for an audio or visual device.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcOutlet', 'IfcOutletAUDIOVISUALOUTLET'],
  },

  IFCOUTLETCOMMUNICATIONSOUTLET: {
    name:        'IfcOutletCOMMUNICATIONSOUTLET',
    label:       'Communications Outlet',
    description: 'An outlet used for connecting communications equipment.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcOutlet', 'IfcOutletCOMMUNICATIONSOUTLET'],
  },

  IFCOUTLETDATAOUTLET: {
    name:        'IfcOutletDATAOUTLET',
    label:       'Data Outlet',
    description: 'An outlet used for connecting data communications equipment.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcOutlet', 'IfcOutletDATAOUTLET'],
  },

  IFCOUTLETPOWEROUTLET: {
    name:        'IfcOutletPOWEROUTLET',
    label:       'Power Outlet',
    description: 'An outlet used for connecting electrical devices requiring power.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcOutlet', 'IfcOutletPOWEROUTLET'],
  },

  IFCOUTLETTELEPHONEOUTLET: {
    name:        'IfcOutletTELEPHONEOUTLET',
    label:       'Telephone Outlet',
    description: 'An outlet used for connecting telephone communications equipment.',
    domain:      'TGA / Elektro',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcOutlet', 'IfcOutletTELEPHONEOUTLET'],
  },

  IFCPAVEMENT: {
    name:        'IfcPavement',
    label:       'Pavement',
    description: '[[Type]] of built element in a road or other paved area to provide an even surface sustaining loads from vehicles or pedestrians, usually comprising several courses.;',
    domain:      'Infrastruktur / Verkehr',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcPavement'],
  },

  IFCPAVEMENTFLEXIBLE: {
    name:        'IfcPavementFLEXIBLE',
    label:       'Flexible',
    description: 'Pavement with a bituminous surfacing and with a base layer with or without a hydrocarbon binder.',
    domain:      'Infrastruktur / Verkehr',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcPavement', 'IfcPavementFLEXIBLE'],
  },

  IFCPAVEMENTRIGID: {
    name:        'IfcPavementRIGID',
    label:       'Rigid',
    description: 'Pavement substantially constructed of cement concrete.',
    domain:      'Infrastruktur / Verkehr',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcPavement', 'IfcPavementRIGID'],
  },

  IFCPERFORMANCEHISTORY: {
    name:        'IfcPerformanceHistory',
    label:       'Performance History',
    description: '[[IfcPerformanceHistory]] is used to document the actual performance of an occurrence instance over time. It includes machine-measured data from building automation systems and human-specified data su',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcPerformanceHistory'],
  },

  IFCPERMIT: {
    name:        'IfcPermit',
    label:       'Permit',
    description: 'A permit is a permission to perform work in places and on artifacts where regulatory, security or other access restrictions apply.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcPermit'],
  },

  IFCPERMITACCESS: {
    name:        'IfcPermitACCESS',
    label:       'Access',
    description: 'Enables access to an identified area.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcPermit', 'IfcPermitACCESS'],
  },

  IFCPERMITBUILDING: {
    name:        'IfcPermitBUILDING',
    label:       'Building',
    description: 'Enables work to proceed by getting regulatory permissions.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcPermit', 'IfcPermitBUILDING'],
  },

  IFCPERMITWORK: {
    name:        'IfcPermitWORK',
    label:       'Work',
    description: 'Enables work to be carried out in an identified area.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcPermit', 'IfcPermitWORK'],
  },

  IFCPILE: {
    name:        'IfcPile',
    label:       'Pile',
    description: 'A pile is a slender timber, concrete, or steel structural element, driven, jetted, or otherwise embedded on end in the ground for the purpose of supporting a load. A pile is also characterized as deep',
    domain:      'Infrastruktur / Tiefbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcDeepFoundation', 'IfcPile'],
  },

  IFCPILEBORED: {
    name:        'IfcPileBORED',
    label:       'Bored',
    description: 'A bore pile.',
    domain:      'Infrastruktur / Tiefbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcDeepFoundation', 'IfcPile', 'IfcPileBORED'],
  },

  IFCPILECOHESION: {
    name:        'IfcPileCOHESION',
    label:       'Cohesion',
    description: 'A cohesion pile.',
    domain:      'Infrastruktur / Tiefbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcDeepFoundation', 'IfcPile', 'IfcPileCOHESION'],
  },

  IFCPILEDRIVEN: {
    name:        'IfcPileDRIVEN',
    label:       'Driven',
    description: 'A rammed, vibrated, or otherwise driven pile.',
    domain:      'Infrastruktur / Tiefbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcDeepFoundation', 'IfcPile', 'IfcPileDRIVEN'],
  },

  IFCPILEFRICTION: {
    name:        'IfcPileFRICTION',
    label:       'Friction',
    description: 'A friction pile.',
    domain:      'Infrastruktur / Tiefbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcDeepFoundation', 'IfcPile', 'IfcPileFRICTION'],
  },

  IFCPILEJETGROUTING: {
    name:        'IfcPileJETGROUTING',
    label:       'Jetgrouting',
    description: 'An injected pile-like construction.',
    domain:      'Infrastruktur / Tiefbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcDeepFoundation', 'IfcPile', 'IfcPileJETGROUTING'],
  },

  IFCPILESUPPORT: {
    name:        'IfcPileSUPPORT',
    label:       'Support',
    description: 'A support pile.',
    domain:      'Infrastruktur / Tiefbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcDeepFoundation', 'IfcPile', 'IfcPileSUPPORT'],
  },

  IFCPIPEFITTING: {
    name:        'IfcPipeFitting',
    label:       'Pipe Fitting',
    description: 'A pipe fitting is a junction or transition in a piping flow distribution system used to connect pipe segments, resulting in changes in flow characteristics to the fluid such as direction or flow rate.',
    domain:      'Infrastruktur / Kanal',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowFitting', 'IfcPipeFitting'],
  },

  IFCPIPEFITTINGBEND: {
    name:        'IfcPipeFittingBEND',
    label:       'Bend',
    description: 'A fitting with typically two ports used to change the direction of flow between connected elements.',
    domain:      'Infrastruktur / Kanal',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowFitting', 'IfcPipeFitting', 'IfcPipeFittingBEND'],
  },

  IFCPIPEFITTINGCONNECTOR: {
    name:        'IfcPipeFittingCONNECTOR',
    label:       'Connector',
    description: 'Connector fitting, typically used to join two ports together within a flow distribution system (e.g., a coupling used to join two pipe segments).',
    domain:      'Infrastruktur / Kanal',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowFitting', 'IfcPipeFitting', 'IfcPipeFittingCONNECTOR'],
  },

  IFCPIPEFITTINGENTRY: {
    name:        'IfcPipeFittingENTRY',
    label:       'Entry',
    description: 'Entry fitting, typically unconnected at one port and connected to a flow distribution system at the other (e.g., a breeching inlet).',
    domain:      'Infrastruktur / Kanal',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowFitting', 'IfcPipeFitting', 'IfcPipeFittingENTRY'],
  },

  IFCPIPEFITTINGEXIT: {
    name:        'IfcPipeFittingEXIT',
    label:       'Exit',
    description: 'Exit fitting, typically unconnected at one port and connected to a flow distribution system at the other (e.g., a hose bibb).',
    domain:      'Infrastruktur / Kanal',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowFitting', 'IfcPipeFitting', 'IfcPipeFittingEXIT'],
  },

  IFCPIPEFITTINGJUNCTION: {
    name:        'IfcPipeFittingJUNCTION',
    label:       'Junction',
    description: 'A fitting with typically more than two ports used to redistribute flow among the ports and/or to change the direction of flow between connected elements (e.g, tee, cross, wye, etc.).',
    domain:      'Infrastruktur / Kanal',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowFitting', 'IfcPipeFitting', 'IfcPipeFittingJUNCTION'],
  },

  IFCPIPEFITTINGOBSTRUCTION: {
    name:        'IfcPipeFittingOBSTRUCTION',
    label:       'Obstruction',
    description: 'A fitting with typically two ports used to obstruct or restrict flow between the connected elements (e.g., screen, perforated plate, etc.).',
    domain:      'Infrastruktur / Kanal',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowFitting', 'IfcPipeFitting', 'IfcPipeFittingOBSTRUCTION'],
  },

  IFCPIPEFITTINGTRANSITION: {
    name:        'IfcPipeFittingTRANSITION',
    label:       'Transition',
    description: 'A fitting with typically two ports having different shapes or sizes. Can also be used to change the direction of flow between connected elements.',
    domain:      'Infrastruktur / Kanal',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowFitting', 'IfcPipeFitting', 'IfcPipeFittingTRANSITION'],
  },

  IFCPIPESEGMENT: {
    name:        'IfcPipeSegment',
    label:       'Pipe Segment',
    description: 'A pipe segment is used to typically join two sections of a piping network.',
    domain:      'Infrastruktur / Kanal',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowSegment', 'IfcPipeSegment'],
  },

  IFCPIPESEGMENTCULVERT: {
    name:        'IfcPipeSegmentCULVERT',
    label:       'Culvert',
    description: 'A covered channel or large pipe that forms a watercourse below ground level, usually under a road or railway.',
    domain:      'Infrastruktur / Kanal',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowSegment', 'IfcPipeSegment', 'IfcPipeSegmentCULVERT'],
  },

  IFCPIPESEGMENTFLEXIBLESEGMENT: {
    name:        'IfcPipeSegmentFLEXIBLESEGMENT',
    label:       'Flexible Segment',
    description: 'A flexible segment is a continuous non-linear segment of pipe that can be deformed and change the direction of flow.',
    domain:      'Infrastruktur / Kanal',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowSegment', 'IfcPipeSegment', 'IfcPipeSegmentFLEXIBLESEGMENT'],
  },

  IFCPIPESEGMENTGUTTER: {
    name:        'IfcPipeSegmentGUTTER',
    label:       'Gutter',
    description: 'A gutter segment is a continuous open-channel segment of pipe.',
    domain:      'Infrastruktur / Kanal',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowSegment', 'IfcPipeSegment', 'IfcPipeSegmentGUTTER'],
  },

  IFCPIPESEGMENTRIGIDSEGMENT: {
    name:        'IfcPipeSegmentRIGIDSEGMENT',
    label:       'Rigid Segment',
    description: 'A rigid segment is continuous linear segment of pipe that cannot be deformed.',
    domain:      'Infrastruktur / Kanal',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowSegment', 'IfcPipeSegment', 'IfcPipeSegmentRIGIDSEGMENT'],
  },

  IFCPIPESEGMENTSPOOL: {
    name:        'IfcPipeSegmentSPOOL',
    label:       'Spool',
    description: 'A type of rigid segment that is typically shorter and used for providing connectivity within a piping network.',
    domain:      'Infrastruktur / Kanal',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowSegment', 'IfcPipeSegment', 'IfcPipeSegmentSPOOL'],
  },

  IFCPLATE: {
    name:        'IfcPlate',
    label:       'Plate',
    description: 'An [[IfcPlate]] is a planar and often flat part with constant thickness. A plate may carry loads between or beyond points of support, or provide stiffening. The location of the plate (being horizontal',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcPlate'],
  },

  IFCPLATEBASE_PLATE: {
    name:        'IfcPlateBASE_PLATE',
    label:       'Base Plate',
    description: 'A plate used to spread load over a surface, such as underneath a bearing or column.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcPlate', 'IfcPlateBASE_PLATE'],
  },

  IFCPLATECOVER_PLATE: {
    name:        'IfcPlateCOVER_PLATE',
    label:       'Cover Plate',
    description: 'A plate (underneath or above) a flange to provide additional load capacity.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcPlate', 'IfcPlateCOVER_PLATE'],
  },

  IFCPLATECURTAIN_PANEL: {
    name:        'IfcPlateCURTAIN_PANEL',
    label:       'Curtain Panel',
    description: 'A planar element within a curtain wall, often consisting of a frame with fixed glazing.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcPlate', 'IfcPlateCURTAIN_PANEL'],
  },

  IFCPLATEFLANGE_PLATE: {
    name:        'IfcPlateFLANGE_PLATE',
    label:       'Flange Plate',
    description: 'A flange plate in linear members having box or I-profile (e.g. top or bottom flange plate in box-girder).',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcPlate', 'IfcPlateFLANGE_PLATE'],
  },

  IFCPLATEGUSSET_PLATE: {
    name:        'IfcPlateGUSSET_PLATE',
    label:       'Gusset Plate',
    description: 'a plate or bracket for strengthening an angle in framework (as in a building or bridge).',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcPlate', 'IfcPlateGUSSET_PLATE'],
  },

  IFCPLATESHEET: {
    name:        'IfcPlateSHEET',
    label:       'Sheet',
    description: 'A planar, flat and thin element, comes usually as metal sheet, and is often used as an additional part within an assembly.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcPlate', 'IfcPlateSHEET'],
  },

  IFCPLATESPLICE_PLATE: {
    name:        'IfcPlateSPLICE_PLATE',
    label:       'Splice Plate',
    description: 'A plate connecting two members joined at ends.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcPlate', 'IfcPlateSPLICE_PLATE'],
  },

  IFCPLATESTIFFENER_PLATE: {
    name:        'IfcPlateSTIFFENER_PLATE',
    label:       'Stiffener Plate',
    description: 'A transversal plate added to a flange or a web plate for local stiffening.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcPlate', 'IfcPlateSTIFFENER_PLATE'],
  },

  IFCPLATEWEB_PLATE: {
    name:        'IfcPlateWEB_PLATE',
    label:       'Web Plate',
    description: 'A plate connecting flange plates in linear members having box or I-profile.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcPlate', 'IfcPlateWEB_PLATE'],
  },

  IFCPORT: {
    name:        'IfcPort',
    label:       'Port',
    description: 'A port provides the means for an element to connect to other elements.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcPort'],
  },

  IFCPOSITIONINGELEMENT: {
    name:        'IfcPositioningElement',
    label:       'Positioning Element',
    description: 'New and abstract entity definition for positioning and annotating elements that are used to position other elements relatively.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcPositioningElement'],
  },

  IFCPROCEDURE: {
    name:        'IfcProcedure',
    label:       'Procedure',
    description: 'An [[IfcProcedure]] is a logical set of actions to be taken in response to an event or to cause an event to occur.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProcess', 'IfcProcedure'],
  },

  IFCPROCEDUREADVICE_CAUTION: {
    name:        'IfcProcedureADVICE_CAUTION',
    label:       'Advice Caution',
    description: 'A caution that should be taken note of as a procedure or when carrying out a procedure.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProcess', 'IfcProcedure', 'IfcProcedureADVICE_CAUTION'],
  },

  IFCPROCEDUREADVICE_NOTE: {
    name:        'IfcProcedureADVICE_NOTE',
    label:       'Advice Note',
    description: 'Additional information or advice that should be taken note of as a procedure or when carrying out a procedure.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProcess', 'IfcProcedure', 'IfcProcedureADVICE_NOTE'],
  },

  IFCPROCEDUREADVICE_WARNING: {
    name:        'IfcProcedureADVICE_WARNING',
    label:       'Advice Warning',
    description: 'A warning of potential danger that should be taken note of as a procedure or when carrying out a procedure.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProcess', 'IfcProcedure', 'IfcProcedureADVICE_WARNING'],
  },

  IFCPROCEDURECALIBRATION: {
    name:        'IfcProcedureCALIBRATION',
    label:       'Calibration',
    description: 'A procedure undertaken to calibrate an artifact.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProcess', 'IfcProcedure', 'IfcProcedureCALIBRATION'],
  },

  IFCPROCEDUREDIAGNOSTIC: {
    name:        'IfcProcedureDIAGNOSTIC',
    label:       'Diagnostic',
    description: 'Diagnostic',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProcess', 'IfcProcedure', 'IfcProcedureDIAGNOSTIC'],
  },

  IFCPROCEDURESHUTDOWN: {
    name:        'IfcProcedureSHUTDOWN',
    label:       'Shutdown',
    description: 'A procedure undertaken to shutdown the operation of an artifact.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProcess', 'IfcProcedure', 'IfcProcedureSHUTDOWN'],
  },

  IFCPROCEDURESTARTUP: {
    name:        'IfcProcedureSTARTUP',
    label:       'Startup',
    description: 'A procedure undertaken to start up the operation of an artifact.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProcess', 'IfcProcedure', 'IfcProcedureSTARTUP'],
  },

  IFCPROCESS: {
    name:        'IfcProcess',
    label:       'Process',
    description: '[[IfcProcess]] is defined as one individual activity or event, that is ordered in time, that has sequence relationships with other processes, which transforms input in output, and may connect to other',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProcess'],
  },

  IFCPRODUCT: {
    name:        'IfcProduct',
    label:       'Product',
    description: 'The [[IfcProduct]] is an abstract representation of any object that relates to a geometric or spatial context. An [[IfcProduct]] occurs at a specific location in space if it has a geometric representa',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct'],
  },

  IFCPROJECT: {
    name:        'IfcProject',
    label:       'Project',
    description: '[[IfcProject]] establishes the context for information to be exchanged or shared, and it may represent a construction project but does not have to. The [[IfcProject]]\\\'s main purpose in an exchange st',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcContext', 'IfcProject'],
  },

  IFCPROJECTLIBRARY: {
    name:        'IfcProjectLibrary',
    label:       'Project Library',
    description: 'An [[IfcProjectLibrary]] collects all library elements that are included within a referenced project data set.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcContext', 'IfcProjectLibrary'],
  },

  IFCPROJECTORDER: {
    name:        'IfcProjectOrder',
    label:       'Project Order',
    description: 'A project order is a directive to purchase products and/or perform work, such as for construction or facilities management.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcProjectOrder'],
  },

  IFCPROJECTORDERCHANGEORDER: {
    name:        'IfcProjectOrderCHANGEORDER',
    label:       'Change Order',
    description: 'An instruction to make a change to a product or work being undertaken and a description of the work that is to be performed.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcProjectOrder', 'IfcProjectOrderCHANGEORDER'],
  },

  IFCPROJECTORDERMAINTENANCEWORKORDER: {
    name:        'IfcProjectOrderMAINTENANCEWORKORDER',
    label:       'Maintenance Work Order',
    description: 'An instruction to carry out maintenance work and a description of the work that is to be performed.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcProjectOrder', 'IfcProjectOrderMAINTENANCEWORKORDER'],
  },

  IFCPROJECTORDERMOVEORDER: {
    name:        'IfcProjectOrderMOVEORDER',
    label:       'Move Order',
    description: 'An instruction to move persons and artefacts and a description of the move locations, objects to be moved, etc.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcProjectOrder', 'IfcProjectOrderMOVEORDER'],
  },

  IFCPROJECTORDERPURCHASEORDER: {
    name:        'IfcProjectOrderPURCHASEORDER',
    label:       'Purchase Order',
    description: 'An instruction to purchase goods and/or services and a description of the goods and/or services to be purchased that is to be performed.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcProjectOrder', 'IfcProjectOrderPURCHASEORDER'],
  },

  IFCPROJECTORDERWORKORDER: {
    name:        'IfcProjectOrderWORKORDER',
    label:       'Work Order',
    description: 'A general instruction to carry out work and a description of the work to be done. Note the difference between a work order generally and a maintenance work order.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcProjectOrder', 'IfcProjectOrderWORKORDER'],
  },

  IFCPROJECTIONELEMENT: {
    name:        'IfcProjectionElement',
    label:       'Projection Element',
    description: 'The projection element is a specialization of the general feature element to represent projections applied to building elements. It represents a solid attached to any element that has physical manifes',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFeatureElement', 'IfcFeatureElementAddition', 'IfcProjectionElement'],
  },

  IFCPROJECTIONELEMENTBLISTER: {
    name:        'IfcProjectionElementBLISTER',
    label:       'Blister',
    description: 'Part of concrete where the anchor for pre-stressing tendon can be embedded.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFeatureElement', 'IfcFeatureElementAddition', 'IfcProjectionElement', 'IfcProjectionElementBLISTER'],
  },

  IFCPROJECTIONELEMENTDEVIATOR: {
    name:        'IfcProjectionElementDEVIATOR',
    label:       'Deviator',
    description: 'Part of concrete where re-direction of an external pre-stressed tendon can be embedded.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFeatureElement', 'IfcFeatureElementAddition', 'IfcProjectionElement', 'IfcProjectionElementDEVIATOR'],
  },

  IFCPROTECTIVEDEVICE: {
    name:        'IfcProtectiveDevice',
    label:       'Protective Device',
    description: 'A protective device breaks an electrical circuit when a stated electric current that passes through it is exceeded.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcProtectiveDevice'],
  },

  IFCPROTECTIVEDEVICEANTI_ARCING_DEVICE: {
    name:        'IfcProtectiveDeviceANTI_ARCING_DEVICE',
    label:       'Anti Arcing Device',
    description: 'An anti-arcing device is an equipment that prevents electric arc.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcProtectiveDevice', 'IfcProtectiveDeviceANTI_ARCING_DEVICE'],
  },

  IFCPROTECTIVEDEVICECIRCUITBREAKER: {
    name:        'IfcProtectiveDeviceCIRCUITBREAKER',
    label:       'Circuit Breaker',
    description: 'A mechanical switching device capable of making, carrying, and breaking currents under normal circuit conditions and also making, carrying for a specified time and breaking, current under specified ab',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcProtectiveDevice', 'IfcProtectiveDeviceCIRCUITBREAKER'],
  },

  IFCPROTECTIVEDEVICEEARTHINGSWITCH: {
    name:        'IfcProtectiveDeviceEARTHINGSWITCH',
    label:       'Earthing Switch',
    description: 'A safety device used to open or close a circuit when there is no current. Used to isolate a part of a circuit, a machine, a part of an overhead line or an underground line so that maintenance can be s',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcProtectiveDevice', 'IfcProtectiveDeviceEARTHINGSWITCH'],
  },

  IFCPROTECTIVEDEVICEEARTHLEAKAGECIRCUITBREAKER: {
    name:        'IfcProtectiveDeviceEARTHLEAKAGECIRCUITBREAKER',
    label:       'Earth Leakage Circuit Breaker',
    description: 'A device that opens, closes, or isolates a circuit and has short circuit protection but no overload protection. It attempts to break the circuit when there is a leakage of current from phase to earth,',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcProtectiveDevice', 'IfcProtectiveDeviceEARTHLEAKAGECIRCUITBREAKER'],
  },

  IFCPROTECTIVEDEVICEFUSEDISCONNECTOR: {
    name:        'IfcProtectiveDeviceFUSEDISCONNECTOR',
    label:       'Fuse Disconnector',
    description: 'A device that will electrically open the circuit after a period of prolonged, abnormal current flow.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcProtectiveDevice', 'IfcProtectiveDeviceFUSEDISCONNECTOR'],
  },

  IFCPROTECTIVEDEVICERESIDUALCURRENTCIRCUITBREAKER: {
    name:        'IfcProtectiveDeviceRESIDUALCURRENTCIRCUITBREAKER',
    label:       'Residualcurrent Circuit Breaker',
    description: 'A device that opens, closes, or isolates a circuit and has short circuit and overload protection. It attempts to break the circuit when there is a difference in current between any two phases. May als',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcProtectiveDevice', 'IfcProtectiveDeviceRESIDUALCURRENTCIRCUITBREAKER'],
  },

  IFCPROTECTIVEDEVICERESIDUALCURRENTSWITCH: {
    name:        'IfcProtectiveDeviceRESIDUALCURRENTSWITCH',
    label:       'Residual Currents Witch',
    description: 'A device that opens, closes or isolates a circuit and has no short circuit or overload protection. May also be identified as a \\\'ground fault switch\\\'.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcProtectiveDevice', 'IfcProtectiveDeviceRESIDUALCURRENTSWITCH'],
  },

  IFCPROTECTIVEDEVICESPARKGAP: {
    name:        'IfcProtectiveDeviceSPARKGAP',
    label:       'Spark Gap',
    description: 'A spark gap is a device used to connect a circuit to earth in the event of a fault in live circuits.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcProtectiveDevice', 'IfcProtectiveDeviceSPARKGAP'],
  },

  IFCPROTECTIVEDEVICETRIPPINGUNIT: {
    name:        'IfcProtectiveDeviceTrippingUnit',
    label:       'Protective Device Tripping Unit',
    description: 'A protective device tripping unit breaks an electrical circuit at a separate breaking unit when a stated electric current that passes through the unit is exceeded.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcProtectiveDeviceTrippingUnit'],
  },

  IFCPROTECTIVEDEVICETRIPPINGUNITELECTROMAGNETIC: {
    name:        'IfcProtectiveDeviceTrippingUnitELECTROMAGNETIC',
    label:       'Electromagnetic',
    description: 'A tripping unit activated by electromagnetic action.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcProtectiveDeviceTrippingUnit', 'IfcProtectiveDeviceTrippingUnitELECTROMAGNETIC'],
  },

  IFCPROTECTIVEDEVICETRIPPINGUNITELECTRONIC: {
    name:        'IfcProtectiveDeviceTrippingUnitELECTRONIC',
    label:       'Electronic',
    description: 'A tripping unit activated by electronic action.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcProtectiveDeviceTrippingUnit', 'IfcProtectiveDeviceTrippingUnitELECTRONIC'],
  },

  IFCPROTECTIVEDEVICETRIPPINGUNITRESIDUALCURRENT: {
    name:        'IfcProtectiveDeviceTrippingUnitRESIDUALCURRENT',
    label:       'Residualcurrent',
    description: 'A tripping unit activated by residual current detection.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcProtectiveDeviceTrippingUnit', 'IfcProtectiveDeviceTrippingUnitRESIDUALCURRENT'],
  },

  IFCPROTECTIVEDEVICETRIPPINGUNITTHERMAL: {
    name:        'IfcProtectiveDeviceTrippingUnitTHERMAL',
    label:       'Thermal',
    description: 'A tripping unit activated by thermal action.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcProtectiveDeviceTrippingUnit', 'IfcProtectiveDeviceTrippingUnitTHERMAL'],
  },

  IFCPROTECTIVEDEVICEVARISTOR: {
    name:        'IfcProtectiveDeviceVARISTOR',
    label:       'Varistor',
    description: 'A high voltage surge protection device.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcProtectiveDevice', 'IfcProtectiveDeviceVARISTOR'],
  },

  IFCPROTECTIVEDEVICEVOLTAGELIMITER: {
    name:        'IfcProtectiveDeviceVOLTAGELIMITER',
    label:       'Voltage Limiter',
    description: 'a voltage limiter is an equipment that prevents the over voltage.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcProtectiveDevice', 'IfcProtectiveDeviceVOLTAGELIMITER'],
  },

  IFCPUMP: {
    name:        'IfcPump',
    label:       'Pump',
    description: 'A pump is a device which imparts mechanical work on fluids or slurries to move them through a channel or pipeline. A typical use of a pump is to circulate chilled water or heating hot water in a build',
    domain:      'TGA / Förderung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowMovingDevice', 'IfcPump'],
  },

  IFCPUMPCIRCULATOR: {
    name:        'IfcPumpCIRCULATOR',
    label:       'Circulator',
    description: 'A Circulator pump is a generic low-pressure, low-capacity pump. It may have a wet rotor and may be driven by a flexible-coupled motor.',
    domain:      'TGA / Förderung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowMovingDevice', 'IfcPump', 'IfcPumpCIRCULATOR'],
  },

  IFCPUMPENDSUCTION: {
    name:        'IfcPumpENDSUCTION',
    label:       'Endsuction',
    description: 'An End Suction pump, when mounted horizontally, has a single horizontal inlet on the impeller suction side and a vertical discharge. It may have a direct or close-coupled motor.',
    domain:      'TGA / Förderung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowMovingDevice', 'IfcPump', 'IfcPumpENDSUCTION'],
  },

  IFCPUMPSPLITCASE: {
    name:        'IfcPumpSPLITCASE',
    label:       'Splitcase',
    description: 'A Split Case pump, when mounted horizontally, has an inlet and outlet on each side of the impeller. The impeller can be easily accessed by removing the front of the impeller casing. It may have a dire',
    domain:      'TGA / Förderung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowMovingDevice', 'IfcPump', 'IfcPumpSPLITCASE'],
  },

  IFCPUMPSUBMERSIBLEPUMP: {
    name:        'IfcPumpSUBMERSIBLEPUMP',
    label:       'Submersible Pump',
    description: 'A pump designed to be immersed in a fluid, typically a collection tank.',
    domain:      'TGA / Förderung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowMovingDevice', 'IfcPump', 'IfcPumpSUBMERSIBLEPUMP'],
  },

  IFCPUMPSUMPPUMP: {
    name:        'IfcPumpSUMPPUMP',
    label:       'Sump Pump',
    description: 'A pump designed to sit above a collection tank with a suction inlet extending into the tank.',
    domain:      'TGA / Förderung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowMovingDevice', 'IfcPump', 'IfcPumpSUMPPUMP'],
  },

  IFCPUMPVERTICALINLINE: {
    name:        'IfcPumpVERTICALINLINE',
    label:       'Vertical Inline',
    description: 'A Vertical Inline pump has the pump and motor close-coupled on the pump casing. The pump depends on the connected, horizontal piping for support, with the suction and discharge along the piping axis.',
    domain:      'TGA / Förderung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowMovingDevice', 'IfcPump', 'IfcPumpVERTICALINLINE'],
  },

  IFCPUMPVERTICALTURBINE: {
    name:        'IfcPumpVERTICALTURBINE',
    label:       'Vertical Turbine',
    description: 'A Vertical Turbine pump has a motor mounted vertically on the pump casing for either; wet-pit sump mounting or dry-well mounting.',
    domain:      'TGA / Förderung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowMovingDevice', 'IfcPump', 'IfcPumpVERTICALTURBINE'],
  },

  IFCRAIL: {
    name:        'IfcRail',
    label:       'Rail',
    description: 'A rail is a predominately linear built element that has a special section profile. Rail is distinctive from built elements with similar geometric shapes (e.g. beam, member) that its major function is',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcRail'],
  },

  IFCRAILBLADE: {
    name:        'IfcRailBLADE',
    label:       'Blade',
    description: 'A blade is a machined rail, often of special section, but fixed and/or joined at the heel end to a rail to provide continuity of wheel support. The two switch rails in a set are the two inside rails.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcRail', 'IfcRailBLADE'],
  },

  IFCRAILCHECKRAIL: {
    name:        'IfcRailCHECKRAIL',
    label:       'Check Rail',
    description: 'A check rail is a rail laid close to the gauge face of a running rail which takes part in lateral guidance of the wheel and prevents derailment in small radius curved track and switches and crossings.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcRail', 'IfcRailCHECKRAIL'],
  },

  IFCRAILGUARDRAIL: {
    name:        'IfcRailGUARDRAIL',
    label:       'Guard Rail',
    description: 'A guard rail is a rail that limits risk of train derailment, normally not loaded.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcRail', 'IfcRailGUARDRAIL'],
  },

  IFCRAILRACKRAIL: {
    name:        'IfcRailRACKRAIL',
    label:       'Rack Rail',
    description: 'A rack rail is a building module for enhancing traction and break performance.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcRail', 'IfcRailRACKRAIL'],
  },

  IFCRAILRAIL: {
    name:        'IfcRailRAIL',
    label:       'Rail',
    description: 'A rail is a special section bar (usually of steel) ensuring the guidance of the wheel of a rolling stock or other heavy machineries. In railway, two rails are combined to form a track.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcRail', 'IfcRailRAIL'],
  },

  IFCRAILSTOCKRAIL: {
    name:        'IfcRailSTOCKRAIL',
    label:       'Stock Rail',
    description: 'A stock rail is a fixed machined rail, ensuring the continuity on the main or diverging track with the switch in the open position. The machined part of the stock rail supports its switch rail in the',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcRail', 'IfcRailSTOCKRAIL'],
  },

  IFCRAILING: {
    name:        'IfcRailing',
    label:       'Railing',
    description: 'The railing is a frame assembly adjacent to human or vehicle circulation spaces and at some space boundaries where it is used in lieu of walls or to complement walls. Designed as an optional physical',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcRailing'],
  },

  IFCRAILINGBALUSTRADE: {
    name:        'IfcRailingBALUSTRADE',
    label:       'Balustrade',
    description: 'Guardrail located at the edge of a floor, rather then a stair or ramp. Examples are balustrades at roof-tops or balconies, or along a bridge or on top of a retaining wall.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcRailing', 'IfcRailingBALUSTRADE'],
  },

  IFCRAILINGFENCE: {
    name:        'IfcRailingFENCE',
    label:       'Fence',
    description: '',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcRailing', 'IfcRailingFENCE'],
  },

  IFCRAILINGGUARDRAIL: {
    name:        'IfcRailingGUARDRAIL',
    label:       'Guard Rail',
    description: 'A type of railing designed to guard human or vehicle occupants from falling off a stair, ramp or landing where there is a vertical drop at the edge of such floors/landings, or to provide restraint to',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcRailing', 'IfcRailingGUARDRAIL'],
  },

  IFCRAILINGHANDRAIL: {
    name:        'IfcRailingHANDRAIL',
    label:       'Hand Rail',
    description: 'A type of railing designed to serve as an optional structural support for loads applied by human occupants (at hand height). Generally located adjacent to ramps and stairs. Generally floor or wall mou',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcRailing', 'IfcRailingHANDRAIL'],
  },

  IFCRAILWAY: {
    name:        'IfcRailway',
    label:       'Railway',
    description: 'An [[IfcRailway]] is a spatial structure element as a route from one location to another for guided passage of wheeled vehicles on rails. An [[IfcRailway]] acts as a basic spatial structure element th',
    domain:      'Infrastruktur / Bahn',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacility', 'IfcRailway'],
  },

  IFCRAILWAYPART: {
    name:        'IfcRailwayPart',
    label:       'Railway Part',
    description: 'Part of a railway.',
    domain:      'Infrastruktur / Bahn',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcRailwayPart'],
  },

  IFCRAILWAYPARTABOVETRACK: {
    name:        'IfcRailwayPartABOVETRACK',
    label:       'Above Track',
    description: 'A spatial structure element that contains elements that are positioned above or over the track, for example catenary lines and suspension systems.',
    domain:      'Infrastruktur / Bahn',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcRailwayPart', 'IfcRailwayPartABOVETRACK'],
  },

  IFCRAILWAYPARTDILATIONTRACK: {
    name:        'IfcRailwayPartDILATIONTRACK',
    label:       'Dilation Track',
    description: '',
    domain:      'Infrastruktur / Bahn',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcRailwayPart', 'IfcRailwayPartDILATIONTRACK'],
  },

  IFCRAILWAYPARTLINESIDE: {
    name:        'IfcRailwayPartLINESIDE',
    label:       'Line Side',
    description: 'A spatial structure element that contains elements of the railway that are not in or over the tracks, hence line-side.',
    domain:      'Infrastruktur / Bahn',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcRailwayPart', 'IfcRailwayPartLINESIDE'],
  },

  IFCRAILWAYPARTLINESIDEPART: {
    name:        'IfcRailwayPartLINESIDEPART',
    label:       'Line Side Part',
    description: 'A spatial structure element to further divide a line-side part. It can be used to distinguish line-side parts into more manageable volumes, for engineering purposes.',
    domain:      'Infrastruktur / Bahn',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcRailwayPart', 'IfcRailwayPartLINESIDEPART'],
  },

  IFCRAILWAYPARTPLAINTRACK: {
    name:        'IfcRailwayPartPLAINTRACK',
    label:       'Plaintrack',
    description: 'A spatial structure element to further divide a track. It does do not contain any turnout panel or dilatation panel.',
    domain:      'Infrastruktur / Bahn',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcRailwayPart', 'IfcRailwayPartPLAINTRACK'],
  },

  IFCRAILWAYPARTSUBSTRUCTURE: {
    name:        'IfcRailwayPartSUBSTRUCTURE',
    label:       'Sub Structure',
    description: 'A spatial structure element that contains elements that are positioned below the track, for example the earthwork platform, prepared subgrade and embankment. This can be above or below finished ground',
    domain:      'Infrastruktur / Bahn',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcRailwayPart', 'IfcRailwayPartSUBSTRUCTURE'],
  },

  IFCRAILWAYPARTTRACK: {
    name:        'IfcRailwayPartTRACK',
    label:       'Track',
    description: 'A spatial structure element that contains track-related elements, for example rails and sleepers.',
    domain:      'Infrastruktur / Bahn',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcRailwayPart', 'IfcRailwayPartTRACK'],
  },

  IFCRAILWAYPARTTRACKPART: {
    name:        'IfcRailwayPartTRACKPART',
    label:       'Trackpart',
    description: 'A spatial structure element to further divide a track,plain-track, turnout-track, dilatation-track.',
    domain:      'Infrastruktur / Bahn',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcRailwayPart', 'IfcRailwayPartTRACKPART'],
  },

  IFCRAILWAYPARTTURNOUTTRACK: {
    name:        'IfcRailwayPartTURNOUTTRACK',
    label:       'Turnout Track',
    description: 'A spatial structure element to further divide a track. It contains turnouts, and does not contain any plain track or dilatation panel.',
    domain:      'Infrastruktur / Bahn',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcRailwayPart', 'IfcRailwayPartTURNOUTTRACK'],
  },

  IFCRAMP: {
    name:        'IfcRamp',
    label:       'Ramp',
    description: 'A ramp is a vertical passageway which provides a human or vehicle circulation link between one floor level and another floor level at a different elevation. It may include a landing as an intermediate',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcRamp'],
  },

  IFCRAMPFLIGHT: {
    name:        'IfcRampFlight',
    label:       'Ramp Flight',
    description: 'A ramp comprises a single inclined segment, or several inclined segments that are connected by a horizontal segment, referred to as a landing. A ramp flight is the single inclined segment and part of',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcRampFlight'],
  },

  IFCRAMPFLIGHTSPIRAL: {
    name:        'IfcRampFlightSPIRAL',
    label:       'Spiral',
    description: 'A ramp flight with a circular or elliptic walking line.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcRampFlight', 'IfcRampFlightSPIRAL'],
  },

  IFCRAMPFLIGHTSTRAIGHT: {
    name:        'IfcRampFlightSTRAIGHT',
    label:       'Straight',
    description: 'A ramp flight with a straight walking line.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcRampFlight', 'IfcRampFlightSTRAIGHT'],
  },

  IFCRAMPHALF_TURN_RAMP: {
    name:        'IfcRampHALF_TURN_RAMP',
    label:       'Half Turn Ramp',
    description: 'A ramp making a 180° turn, consisting of two straight flights connected; by a halfspace landing. The orientation of the turn is determined by the walking line.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcRamp', 'IfcRampHALF_TURN_RAMP'],
  },

  IFCRAMPQUARTER_TURN_RAMP: {
    name:        'IfcRampQUARTER_TURN_RAMP',
    label:       'Quarter Turn Ramp',
    description: 'A ramp making a 90° turn, consisting of two straight flights connected by; a quarterspace landing. The direction of the turn is determined by the walking line.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcRamp', 'IfcRampQUARTER_TURN_RAMP'],
  },

  IFCRAMPSPIRAL_RAMP: {
    name:        'IfcRampSPIRAL_RAMP',
    label:       'Spiral Ramp',
    description: 'A ramp constructed around a circular or elliptical well without newels and; landings.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcRamp', 'IfcRampSPIRAL_RAMP'],
  },

  IFCRAMPSTRAIGHT_RUN_RAMP: {
    name:        'IfcRampSTRAIGHT_RUN_RAMP',
    label:       'Straight Run Ramp',
    description: 'A ramp - which is a sloping floor, walk, or roadway - connecting two levels.; The straight ramp consists of one straight flight without turns or winders.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcRamp', 'IfcRampSTRAIGHT_RUN_RAMP'],
  },

  IFCRAMPTWO_QUARTER_TURN_RAMP: {
    name:        'IfcRampTWO_QUARTER_TURN_RAMP',
    label:       'Two Quarter Turn Ramp',
    description: 'A ramp making a 180° turn, consisting of three straight flights connected; by two quarterspace landings. The direction of the turn is determined by the walking line.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcRamp', 'IfcRampTWO_QUARTER_TURN_RAMP'],
  },

  IFCRAMPTWO_STRAIGHT_RUN_RAMP: {
    name:        'IfcRampTWO_STRAIGHT_RUN_RAMP',
    label:       'Two Straight Run Ramp',
    description: 'A straight ramp consisting of two straight flights without turns but with one; landing.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcRamp', 'IfcRampTWO_STRAIGHT_RUN_RAMP'],
  },

  IFCREFERENT: {
    name:        'IfcReferent',
    label:       'Referent',
    description: '[[IfcReferent]] defines a position at a particular offset along an alignment curve.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcPositioningElement', 'IfcReferent'],
  },

  IFCREFERENTBOUNDARY: {
    name:        'IfcReferentBOUNDARY',
    label:       'Boundary',
    description: 'The referent represents where an administrative or maintenance boundary crosses the linear element being measured. This is typically the first time the boundary crosses the linear element. If the boun',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcPositioningElement', 'IfcReferent', 'IfcReferentBOUNDARY'],
  },

  IFCREFERENTINTERSECTION: {
    name:        'IfcReferentINTERSECTION',
    label:       'Intersection',
    description: 'The referent is the location of an intersection specified by the referent name. The intersection location is typically taken as the location of the intersection of the reference lines of the streets c',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcPositioningElement', 'IfcReferent', 'IfcReferentINTERSECTION'],
  },

  IFCREFERENTKILOPOINT: {
    name:        'IfcReferentKILOPOINT',
    label:       'Kilo Point',
    description: 'Kilo point',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcPositioningElement', 'IfcReferent', 'IfcReferentKILOPOINT'],
  },

  IFCREFERENTLANDMARK: {
    name:        'IfcReferentLANDMARK',
    label:       'Landmark',
    description: 'The referent is the location of a physical landmark visible in the field.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcPositioningElement', 'IfcReferent', 'IfcReferentLANDMARK'],
  },

  IFCREFERENTMILEPOINT: {
    name:        'IfcReferentMILEPOINT',
    label:       'Mile Point',
    description: 'Mile point',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcPositioningElement', 'IfcReferent', 'IfcReferentMILEPOINT'],
  },

  IFCREFERENTPOSITION: {
    name:        'IfcReferentPOSITION',
    label:       'Position',
    description: 'Used to fully describe a linearly referenced location given by the linear element being measured (the [[IfcAlignment]] into which the [[IfcReferent]] is nested), the method of measurement ([[Pset_Line',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcPositioningElement', 'IfcReferent', 'IfcReferentPOSITION'],
  },

  IFCREFERENTREFERENCEMARKER: {
    name:        'IfcReferentREFERENCEMARKER',
    label:       'Reference Marker',
    description: 'The reference marker is a notation referent, typically located in the right of way of the road, rail or other transportation system. Usually reference markers are initially spaced at a uniform distanc',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcPositioningElement', 'IfcReferent', 'IfcReferentREFERENCEMARKER'],
  },

  IFCREFERENTSTATION: {
    name:        'IfcReferentSTATION',
    label:       'Station',
    description: '[[Station]]',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcPositioningElement', 'IfcReferent', 'IfcReferentSTATION'],
  },

  IFCREFERENTSUPERELEVATIONEVENT: {
    name:        'IfcReferentSUPERELEVATIONEVENT',
    label:       'Super Elevation Event',
    description: 'A kind of event that specifies the superelevation (cross slope) at a specific location along a road alignment, and the type of transition from the previous location. The locations are specified using',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcPositioningElement', 'IfcReferent', 'IfcReferentSUPERELEVATIONEVENT'],
  },

  IFCREFERENTWIDTHEVENT: {
    name:        'IfcReferentWIDTHEVENT',
    label:       'Width Event',
    description: 'A kind of event that specifies the width at a specific location along a road alignment, and the type of transition from the previous location. The locations are specified using an IfcLinearPlacement m',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcPositioningElement', 'IfcReferent', 'IfcReferentWIDTHEVENT'],
  },

  IFCREINFORCEDSOIL: {
    name:        'IfcReinforcedSoil',
    label:       'Reinforced Soil',
    description: 'Soil reinforced or stabilized by some mechanical or chemical method.',
    domain:      'Infrastruktur / Tiefbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcEarthworksElement', 'IfcReinforcedSoil'],
  },

  IFCREINFORCEDSOILDYNAMICALLYCOMPACTED: {
    name:        'IfcReinforcedSoilDYNAMICALLYCOMPACTED',
    label:       'Dynamically Compacted',
    description: 'The method of using dynamic tamping machine usually free falling a heavy hammer from the height, compacting the soil and quickly improving the bearing capacity of the foundation.',
    domain:      'Infrastruktur / Tiefbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcEarthworksElement', 'IfcReinforcedSoil', 'IfcReinforcedSoilDYNAMICALLYCOMPACTED'],
  },

  IFCREINFORCEDSOILGROUTED: {
    name:        'IfcReinforcedSoilGROUTED',
    label:       'Grouted',
    description: 'A method of injecting curable slurry into cracks or pores of a geotechnical foundation to improve its physical and mechanical properties.',
    domain:      'Infrastruktur / Tiefbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcEarthworksElement', 'IfcReinforcedSoil', 'IfcReinforcedSoilGROUTED'],
  },

  IFCREINFORCEDSOILREPLACED: {
    name:        'IfcReinforcedSoilREPLACED',
    label:       'Replaced',
    description: 'Dig out the soft soil in a certain range below the foundation ground and then backfill the area with high strength, low compressibility and no corrosive materials.',
    domain:      'Infrastruktur / Tiefbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcEarthworksElement', 'IfcReinforcedSoil', 'IfcReinforcedSoilREPLACED'],
  },

  IFCREINFORCEDSOILROLLERCOMPACTED: {
    name:        'IfcReinforcedSoilROLLERCOMPACTED',
    label:       'Roller Compacted',
    description: 'A kind of compacting method that adopts rolling machinery, repeated rolling and vibration compacts the foundation soil, increasing strength and descreasing compressibility.',
    domain:      'Infrastruktur / Tiefbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcEarthworksElement', 'IfcReinforcedSoil', 'IfcReinforcedSoilROLLERCOMPACTED'],
  },

  IFCREINFORCEDSOILSURCHARGEPRELOADED: {
    name:        'IfcReinforcedSoilSURCHARGEPRELOADED',
    label:       'Surcharge Preloaded',
    description: 'A method that applies load to the foundation to discharge pore water, and the foundation is consolidated to improve the foundation strength. Unloading when the carrying capacity reaches the required l',
    domain:      'Infrastruktur / Tiefbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcEarthworksElement', 'IfcReinforcedSoil', 'IfcReinforcedSoilSURCHARGEPRELOADED'],
  },

  IFCREINFORCEDSOILVERTICALLYDRAINED: {
    name:        'IfcReinforcedSoilVERTICALLYDRAINED',
    label:       'Vertically Drained',
    description: 'A method to set vertical drainage measures in the foundation, so that pore water in the soil is discharged and the foundation strength is improved.',
    domain:      'Infrastruktur / Tiefbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcEarthworksElement', 'IfcReinforcedSoil', 'IfcReinforcedSoilVERTICALLYDRAINED'],
  },

  IFCREINFORCEMENTDEFINITIONPROPERTIES: {
    name:        'IfcReinforcementDefinitionProperties',
    label:       'Reinforcement Definition Properties',
    description: '[[IfcReinforcementDefinitionProperties]] defines the cross section properties of reinforcement included in reinforced concrete building elements. The property set definition may be used both in conjun',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcReinforcementDefinitionProperties'],
  },

  IFCREINFORCINGBAR: {
    name:        'IfcReinforcingBar',
    label:       'Reinforcing Bar',
    description: 'A reinforcing bar is usually made of steel with manufactured deformations in the surface, and used in concrete and masonry construction to provide additional strength. A single instance of this class',
    domain:      'Tragwerk / Bewehrung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcReinforcingElement', 'IfcReinforcingBar'],
  },

  IFCREINFORCINGBARANCHORING: {
    name:        'IfcReinforcingBarANCHORING',
    label:       'Anchoring',
    description: 'Anchoring reinforcement.',
    domain:      'Tragwerk / Bewehrung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcReinforcingElement', 'IfcReinforcingBar', 'IfcReinforcingBarANCHORING'],
  },

  IFCREINFORCINGBAREDGE: {
    name:        'IfcReinforcingBarEDGE',
    label:       'Edge',
    description: 'Edge reinforcement.',
    domain:      'Tragwerk / Bewehrung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcReinforcingElement', 'IfcReinforcingBar', 'IfcReinforcingBarEDGE'],
  },

  IFCREINFORCINGBARLIGATURE: {
    name:        'IfcReinforcingBarLIGATURE',
    label:       'Ligature',
    description: 'The reinforcing bar is a ligature (link, stirrup).',
    domain:      'Tragwerk / Bewehrung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcReinforcingElement', 'IfcReinforcingBar', 'IfcReinforcingBarLIGATURE'],
  },

  IFCREINFORCINGBARMAIN: {
    name:        'IfcReinforcingBarMAIN',
    label:       'Main',
    description: 'The reinforcing bar is a main bar.',
    domain:      'Tragwerk / Bewehrung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcReinforcingElement', 'IfcReinforcingBar', 'IfcReinforcingBarMAIN'],
  },

  IFCREINFORCINGBARPUNCHING: {
    name:        'IfcReinforcingBarPUNCHING',
    label:       'Punching',
    description: 'Punching reinforcement.',
    domain:      'Tragwerk / Bewehrung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcReinforcingElement', 'IfcReinforcingBar', 'IfcReinforcingBarPUNCHING'],
  },

  IFCREINFORCINGBARRING: {
    name:        'IfcReinforcingBarRING',
    label:       'Ring',
    description: 'Ring reinforcement.',
    domain:      'Tragwerk / Bewehrung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcReinforcingElement', 'IfcReinforcingBar', 'IfcReinforcingBarRING'],
  },

  IFCREINFORCINGBARSHEAR: {
    name:        'IfcReinforcingBarSHEAR',
    label:       'Shear',
    description: 'The reinforcing bar is a shear bar.',
    domain:      'Tragwerk / Bewehrung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcReinforcingElement', 'IfcReinforcingBar', 'IfcReinforcingBarSHEAR'],
  },

  IFCREINFORCINGBARSPACEBAR: {
    name:        'IfcReinforcingBarSPACEBAR',
    label:       'Space Bar',
    description: 'A stirrup in pre-stressing system to position TendonConduit.',
    domain:      'Tragwerk / Bewehrung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcReinforcingElement', 'IfcReinforcingBar', 'IfcReinforcingBarSPACEBAR'],
  },

  IFCREINFORCINGBARSTUD: {
    name:        'IfcReinforcingBarSTUD',
    label:       'Stud',
    description: 'The reinforcing bar is a stud.',
    domain:      'Tragwerk / Bewehrung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcReinforcingElement', 'IfcReinforcingBar', 'IfcReinforcingBarSTUD'],
  },

  IFCREINFORCINGELEMENT: {
    name:        'IfcReinforcingElement',
    label:       'Reinforcing Element',
    description: 'A reinforcing element represents bars, wires, strands, meshes, tendons, and other components embedded in concrete in such a manner that the reinforcement and the concrete act together in resisting for',
    domain:      'Tragwerk / Bewehrung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcReinforcingElement'],
  },

  IFCREINFORCINGMESH: {
    name:        'IfcReinforcingMesh',
    label:       'Reinforcing Mesh',
    description: 'A reinforcing mesh is a series of longitudinal and transverse wires or bars of various gauges, arranged at right angles to each other and welded at all points of intersection; usually used for concret',
    domain:      'Tragwerk / Bewehrung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcReinforcingElement', 'IfcReinforcingMesh'],
  },

  IFCROAD: {
    name:        'IfcRoad',
    label:       'Road',
    description: 'A route built on land to allow travel from one location to another, including highways, streets, cycle and foot paths, but excluding railways. As a type of Facility, Road provides the basic element in',
    domain:      'Infrastruktur / Straße',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacility', 'IfcRoad'],
  },

  IFCROADPART: {
    name:        'IfcRoadPart',
    label:       'Road Part',
    description: 'Part of a road.',
    domain:      'Infrastruktur / Straße',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcRoadPart'],
  },

  IFCROADPARTBICYCLECROSSING: {
    name:        'IfcRoadPartBICYCLECROSSING',
    label:       'Bicycle Crossing',
    description: 'Designated level crossing over a road for cyclists.',
    domain:      'Infrastruktur / Straße',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcRoadPart', 'IfcRoadPartBICYCLECROSSING'],
  },

  IFCROADPARTBUS_STOP: {
    name:        'IfcRoadPartBUS_STOP',
    label:       'Bus Stop',
    description: 'Lateral part of Road for stopping buses allowing them to draw out of the traffic lanes and wait for short periods.',
    domain:      'Infrastruktur / Straße',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcRoadPart', 'IfcRoadPartBUS_STOP'],
  },

  IFCROADPARTCARRIAGEWAY: {
    name:        'IfcRoadPartCARRIAGEWAY',
    label:       'Carriageway',
    description: 'Unitary lateral part of Road built for traffic. Carriageway may comprise several kinds of traffic lanes and lay-bys, as well as traffic islands, and in case of dual carriageway road they are separated',
    domain:      'Infrastruktur / Straße',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcRoadPart', 'IfcRoadPartCARRIAGEWAY'],
  },

  IFCROADPARTCENTRALISLAND: {
    name:        'IfcRoadPartCENTRALISLAND',
    label:       'Central Island',
    description: 'The center of a roundabout not intended for traffic, can be painted or upraised.',
    domain:      'Infrastruktur / Straße',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcRoadPart', 'IfcRoadPartCENTRALISLAND'],
  },

  IFCROADPARTCENTRALRESERVE: {
    name:        'IfcRoadPartCENTRALRESERVE',
    label:       'Central Reserve',
    description: 'Lateral RoadPart separating two carriageways of the same road or separating traffic lanes and sidewalk.',
    domain:      'Infrastruktur / Straße',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcRoadPart', 'IfcRoadPartCENTRALRESERVE'],
  },

  IFCROADPARTHARDSHOULDER: {
    name:        'IfcRoadPartHARDSHOULDER',
    label:       'Hard Shoulder',
    description: 'A type of Shoulder that is surfaced, providing for safe use by vehicles in distress.',
    domain:      'Infrastruktur / Straße',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcRoadPart', 'IfcRoadPartHARDSHOULDER'],
  },

  IFCROADPARTINTERSECTION: {
    name:        'IfcRoadPartINTERSECTION',
    label:       'Intersection',
    description: 'At-grade junction where two or more roads meet or cross. Intersections may be further classified by number of road segments, traffic controls, and/or lane design.',
    domain:      'Infrastruktur / Straße',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcRoadPart', 'IfcRoadPartINTERSECTION'],
  },

  IFCROADPARTLAYBY: {
    name:        'IfcRoadPartLAYBY',
    label:       'Layby',
    description: 'A lateral part of Road where vehicles can divert from ordinary stream of traffic.',
    domain:      'Infrastruktur / Straße',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcRoadPart', 'IfcRoadPartLAYBY'],
  },

  IFCROADPARTPARKINGBAY: {
    name:        'IfcRoadPartPARKINGBAY',
    label:       'Parking Bay',
    description: 'Lateral part of Road for parking vehicles.',
    domain:      'Infrastruktur / Straße',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcRoadPart', 'IfcRoadPartPARKINGBAY'],
  },

  IFCROADPARTPASSINGBAY: {
    name:        'IfcRoadPartPASSINGBAY',
    label:       'Passing Bay',
    description: 'A lateral part of Road that is a widening of an otherwise single lane road where a vehicle may move over to enable another vehicle to pass.',
    domain:      'Infrastruktur / Straße',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcRoadPart', 'IfcRoadPartPASSINGBAY'],
  },

  IFCROADPARTPEDESTRIAN_CROSSING: {
    name:        'IfcRoadPartPEDESTRIAN_CROSSING',
    label:       'Pedestrian Crossing',
    description: 'Designated level crossing over a road for pedestrians.',
    domain:      'Infrastruktur / Straße',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcRoadPart', 'IfcRoadPartPEDESTRIAN_CROSSING'],
  },

  IFCROADPARTRAILWAYCROSSING: {
    name:        'IfcRoadPartRAILWAYCROSSING',
    label:       'Railway Crossing',
    description: 'At-grade crossing between road and railway.',
    domain:      'Infrastruktur / Straße',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcRoadPart', 'IfcRoadPartRAILWAYCROSSING'],
  },

  IFCROADPARTREFUGEISLAND: {
    name:        'IfcRoadPartREFUGEISLAND',
    label:       'Refuge Island',
    description: 'A raised platform or a guarded area so sited in the carriageway as to divide the streams of traffic and to provide a safety area for pedestrians.',
    domain:      'Infrastruktur / Straße',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcRoadPart', 'IfcRoadPartREFUGEISLAND'],
  },

  IFCROADPARTROADSEGMENT: {
    name:        'IfcRoadPartROADSEGMENT',
    label:       'Road Segment',
    description: 'Longitudinal, linear segment of a road, either defined by uniform characteristics, or as a transition segment (e.g. number of lanes changing).',
    domain:      'Infrastruktur / Straße',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcRoadPart', 'IfcRoadPartROADSEGMENT'],
  },

  IFCROADPARTROADSIDE: {
    name:        'IfcRoadPartROADSIDE',
    label:       'Road Side',
    description: 'A lateral RoadPart located along the Road adjoining the outer edges of the Shoulders. A general concept comprising the areas outside RoadwayPlateau not intended for vehicles.',
    domain:      'Infrastruktur / Straße',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcRoadPart', 'IfcRoadPartROADSIDE'],
  },

  IFCROADPARTROADSIDEPART: {
    name:        'IfcRoadPartROADSIDEPART',
    label:       'Road Side Part',
    description: 'A general concept for various parts of the Roadside.',
    domain:      'Infrastruktur / Straße',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcRoadPart', 'IfcRoadPartROADSIDEPART'],
  },

  IFCROADPARTROADWAYPLATEAU: {
    name:        'IfcRoadPartROADWAYPLATEAU',
    label:       'Roadway Plateau',
    description: 'Lateral part of Road comprising the carriageway(s), shoulders and medians.',
    domain:      'Infrastruktur / Straße',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcRoadPart', 'IfcRoadPartROADWAYPLATEAU'],
  },

  IFCROADPARTROUNDABOUT: {
    name:        'IfcRoadPartROUNDABOUT',
    label:       'Roundabout',
    description: '[[Type]] of at-grade junction at which traffic streams are directed around a circle.',
    domain:      'Infrastruktur / Straße',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcRoadPart', 'IfcRoadPartROUNDABOUT'],
  },

  IFCROADPARTSHOULDER: {
    name:        'IfcRoadPartSHOULDER',
    label:       'Shoulder',
    description: 'A lateral part of Road adjacent to, and usually at the same level as the Carriageway; not intended for vehicular traffic but may be used in case of emergency.',
    domain:      'Infrastruktur / Straße',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcRoadPart', 'IfcRoadPartSHOULDER'],
  },

  IFCROADPARTSIDEWALK: {
    name:        'IfcRoadPartSIDEWALK',
    label:       'Side Walk',
    description: 'A footpath along the side of a road. May accommodate moderate changes in grade (elevation) and is normally separated from the vehicular section by a kerb. There may be a central reserve or road verge',
    domain:      'Infrastruktur / Straße',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcRoadPart', 'IfcRoadPartSIDEWALK'],
  },

  IFCROADPARTSOFTSHOULDER: {
    name:        'IfcRoadPartSOFTSHOULDER',
    label:       'Soft Shoulder',
    description: 'A type of Shoulder that is not surfaced.',
    domain:      'Infrastruktur / Straße',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcRoadPart', 'IfcRoadPartSOFTSHOULDER'],
  },

  IFCROADPARTTOLLPLAZA: {
    name:        'IfcRoadPartTOLLPLAZA',
    label:       'Toll Plaza',
    description: 'A part of road facility where tolls are collected for use of toll road, tunnel or bridge.',
    domain:      'Infrastruktur / Straße',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcRoadPart', 'IfcRoadPartTOLLPLAZA'],
  },

  IFCROADPARTTRAFFICISLAND: {
    name:        'IfcRoadPartTRAFFICISLAND',
    label:       'Traffic Island',
    description: 'A central or subsidiary area raised or marked on the carriageway, generally at a road junction or level crossing, shaped and placed so as to direct traffic movement and/or provide refuge for pedestria',
    domain:      'Infrastruktur / Straße',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcRoadPart', 'IfcRoadPartTRAFFICISLAND'],
  },

  IFCROADPARTTRAFFICLANE: {
    name:        'IfcRoadPartTRAFFICLANE',
    label:       'Traffic Lane',
    description: 'Lateral part of carriageway designated to vehicular traffic for a particular purpose.',
    domain:      'Infrastruktur / Straße',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcFacilityPart', 'IfcRoadPart', 'IfcRoadPartTRAFFICLANE'],
  },

  IFCROOF: {
    name:        'IfcRoof',
    label:       'Roof',
    description: 'A roof is the covering of the top part of a building, it protects the building against the effects of weather.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcRoof'],
  },

  IFCROOFBARREL_ROOF: {
    name:        'IfcRoofBARREL_ROOF',
    label:       'Barrel Roof',
    description: 'A roof or ceiling having a semicylindrical form.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcRoof', 'IfcRoofBARREL_ROOF'],
  },

  IFCROOFBUTTERFLY_ROOF: {
    name:        'IfcRoofBUTTERFLY_ROOF',
    label:       'Butterfly Roof',
    description: 'A roof having two slopes, each descending inward from the eaves.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcRoof', 'IfcRoofBUTTERFLY_ROOF'],
  },

  IFCROOFDOME_ROOF: {
    name:        'IfcRoofDOME_ROOF',
    label:       'Dome Roof',
    description: 'A hemispherical hip roof.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcRoof', 'IfcRoofDOME_ROOF'],
  },

  IFCROOFFLAT_ROOF: {
    name:        'IfcRoofFLAT_ROOF',
    label:       'Flat Roof',
    description: 'A roof having no slope, or one with only a slight pitch so as to drain; rainwater.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcRoof', 'IfcRoofFLAT_ROOF'],
  },

  IFCROOFFREEFORM: {
    name:        'IfcRoofFREEFORM',
    label:       'Freeform',
    description: 'Free form roof.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcRoof', 'IfcRoofFREEFORM'],
  },

  IFCROOFGABLE_ROOF: {
    name:        'IfcRoofGABLE_ROOF',
    label:       'Gable Roof',
    description: 'A roof sloping downward in two parts from a central ridge, so as to form a; gable at each end.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcRoof', 'IfcRoofGABLE_ROOF'],
  },

  IFCROOFGAMBREL_ROOF: {
    name:        'IfcRoofGAMBREL_ROOF',
    label:       'Gambrel Roof',
    description: 'A roof sloping downward in two parts from a central ridge, so as to form a; gable at each end.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcRoof', 'IfcRoofGAMBREL_ROOF'],
  },

  IFCROOFHIPPED_GABLE_ROOF: {
    name:        'IfcRoofHIPPED_GABLE_ROOF',
    label:       'Hipped Gable Roof',
    description: 'A roof having a hipped end truncating a gable.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcRoof', 'IfcRoofHIPPED_GABLE_ROOF'],
  },

  IFCROOFHIP_ROOF: {
    name:        'IfcRoofHIP_ROOF',
    label:       'Hip Roof',
    description: 'A roof having sloping ends and sides meeting at an inclined projecting; angle.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcRoof', 'IfcRoofHIP_ROOF'],
  },

  IFCROOFMANSARD_ROOF: {
    name:        'IfcRoofMANSARD_ROOF',
    label:       'Mansard Roof',
    description: 'A roof having on each side a steeper lower part and a shallower upper; part.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcRoof', 'IfcRoofMANSARD_ROOF'],
  },

  IFCROOFPAVILION_ROOF: {
    name:        'IfcRoofPAVILION_ROOF',
    label:       'Pavilion Roof',
    description: 'A pyramidal hip roof.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcRoof', 'IfcRoofPAVILION_ROOF'],
  },

  IFCROOFRAINBOW_ROOF: {
    name:        'IfcRoofRAINBOW_ROOF',
    label:       'Rain Bow Roof',
    description: 'A gable roof in the form of a broad Gothic arch, with gently sloping convex; surfaces.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcRoof', 'IfcRoofRAINBOW_ROOF'],
  },

  IFCROOFSHED_ROOF: {
    name:        'IfcRoofSHED_ROOF',
    label:       'Shed Roof',
    description: 'A roof having a single slope.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcRoof', 'IfcRoofSHED_ROOF'],
  },

  IFCROOT: {
    name:        'IfcRoot',
    label:       'Root',
    description: '[[IfcRoot]] is the most abstract and root class for all entity definitions that roots in the kernel or in subsequent layers of the IFC specification. It is therefore the common supertype of all IFC en',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot'],
  },

  IFCSANITARYTERMINAL: {
    name:        'IfcSanitaryTerminal',
    label:       'Sanitary Terminal',
    description: 'A sanitary terminal is a fixed appliance or terminal usually supplied with water and used for drinking, cleaning or foul water disposal or that is an item of equipment directly used with such an appli',
    domain:      'TGA / Sanitär',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcSanitaryTerminal'],
  },

  IFCSANITARYTERMINALBATH: {
    name:        'IfcSanitaryTerminalBATH',
    label:       'Bath',
    description: 'Sanitary appliance for immersion of the human body or parts of it.',
    domain:      'TGA / Sanitär',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcSanitaryTerminal', 'IfcSanitaryTerminalBATH'],
  },

  IFCSANITARYTERMINALBIDET: {
    name:        'IfcSanitaryTerminalBIDET',
    label:       'Bidet',
    description: 'Waste water appliance for washing the excretory organs while sitting astride the bowl.',
    domain:      'TGA / Sanitär',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcSanitaryTerminal', 'IfcSanitaryTerminalBIDET'],
  },

  IFCSANITARYTERMINALCISTERN: {
    name:        'IfcSanitaryTerminalCISTERN',
    label:       'Cistern',
    description: 'A water storage unit attached to a sanitary terminal that is fitted with a device, operated automatically or by the user, that discharges water to cleanse a water closet (toilet) pan, urinal or slop h',
    domain:      'TGA / Sanitär',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcSanitaryTerminal', 'IfcSanitaryTerminalCISTERN'],
  },

  IFCSANITARYTERMINALSANITARYFOUNTAIN: {
    name:        'IfcSanitaryTerminalSANITARYFOUNTAIN',
    label:       'Sanitary Fountain',
    description: 'A sanitary terminal that provides a low pressure jet of water for a specific purpose.',
    domain:      'TGA / Sanitär',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcSanitaryTerminal', 'IfcSanitaryTerminalSANITARYFOUNTAIN'],
  },

  IFCSANITARYTERMINALSHOWER: {
    name:        'IfcSanitaryTerminalSHOWER',
    label:       'Shower',
    description: 'Installation or waste water appliance that emits a spray of water to wash the human body.',
    domain:      'TGA / Sanitär',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcSanitaryTerminal', 'IfcSanitaryTerminalSHOWER'],
  },

  IFCSANITARYTERMINALSINK: {
    name:        'IfcSanitaryTerminalSINK',
    label:       'Sink',
    description: 'Waste water appliance for receiving, retaining or disposing of domestic, culinary, laboratory or industrial process liquids.',
    domain:      'TGA / Sanitär',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcSanitaryTerminal', 'IfcSanitaryTerminalSINK'],
  },

  IFCSANITARYTERMINALTOILETPAN: {
    name:        'IfcSanitaryTerminalTOILETPAN',
    label:       'Toilet Pan',
    description: 'Soil appliance for the disposal of excrement.',
    domain:      'TGA / Sanitär',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcSanitaryTerminal', 'IfcSanitaryTerminalTOILETPAN'],
  },

  IFCSANITARYTERMINALURINAL: {
    name:        'IfcSanitaryTerminalURINAL',
    label:       'Urinal',
    description: 'Soil appliance that receives urine and directs it to a waste outlet.',
    domain:      'TGA / Sanitär',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcSanitaryTerminal', 'IfcSanitaryTerminalURINAL'],
  },

  IFCSANITARYTERMINALWASHHANDBASIN: {
    name:        'IfcSanitaryTerminalWASHHANDBASIN',
    label:       'Washhand Basin',
    description: 'Waste water appliance for washing the upper parts of the body.',
    domain:      'TGA / Sanitär',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcSanitaryTerminal', 'IfcSanitaryTerminalWASHHANDBASIN'],
  },

  IFCSANITARYTERMINALWCSEAT: {
    name:        'IfcSanitaryTerminalWCSEAT',
    label:       'Wc Seat',
    description: 'Deprecated Hinged seat that fits on the top of a water closet (WC) pan.',
    domain:      'TGA / Sanitär',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcSanitaryTerminal', 'IfcSanitaryTerminalWCSEAT'],
  },

  IFCSENSOR: {
    name:        'IfcSensor',
    label:       'Sensor',
    description: 'A sensor is a device that measures a physical quantity and converts it into a signal which can be read by an observer or by an instrument.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcSensor'],
  },

  IFCSENSORCO2SENSOR: {
    name:        'IfcSensorCO2SENSOR',
    label:       'CO2 Sensor',
    description: 'A device that senses or detects carbon dioxide.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcSensor', 'IfcSensorCO2SENSOR'],
  },

  IFCSENSORCONDUCTANCESENSOR: {
    name:        'IfcSensorCONDUCTANCESENSOR',
    label:       'Conductance Sensor',
    description: 'A device that senses or detects electrical conductance.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcSensor', 'IfcSensorCONDUCTANCESENSOR'],
  },

  IFCSENSORCONTACTSENSOR: {
    name:        'IfcSensorCONTACTSENSOR',
    label:       'Contact Sensor',
    description: 'A device that senses or detects contact, such as for detecting if a door is closed.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcSensor', 'IfcSensorCONTACTSENSOR'],
  },

  IFCSENSORCOSENSOR: {
    name:        'IfcSensorCOSENSOR',
    label:       'Cosensor',
    description: 'A device that senses or detects carbon monoxide.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcSensor', 'IfcSensorCOSENSOR'],
  },

  IFCSENSOREARTHQUAKESENSOR: {
    name:        'IfcSensorEARTHQUAKESENSOR',
    label:       'Earthquake Sensor',
    description: 'A device that senses or detects the seismic wave and measures the seismic intensity in case of earthquake.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcSensor', 'IfcSensorEARTHQUAKESENSOR'],
  },

  IFCSENSORFIRESENSOR: {
    name:        'IfcSensorFIRESENSOR',
    label:       'Fire Sensor',
    description: 'A device that senses or detects fire',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcSensor', 'IfcSensorFIRESENSOR'],
  },

  IFCSENSORFLOWSENSOR: {
    name:        'IfcSensorFLOWSENSOR',
    label:       'Flow Sensor',
    description: 'A device that senses or detects flow in a fluid.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcSensor', 'IfcSensorFLOWSENSOR'],
  },

  IFCSENSORFOREIGNOBJECTDETECTIONSENSOR: {
    name:        'IfcSensorFOREIGNOBJECTDETECTIONSENSOR',
    label:       'Foreign Object Detection Sensor',
    description: 'A device that senses or detects foreign objects that shock or break the power network. It may alarm when such accidents happen.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcSensor', 'IfcSensorFOREIGNOBJECTDETECTIONSENSOR'],
  },

  IFCSENSORFROSTSENSOR: {
    name:        'IfcSensorFROSTSENSOR',
    label:       'Frost Sensor',
    description: 'A device that senses or detects frost on a window.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcSensor', 'IfcSensorFROSTSENSOR'],
  },

  IFCSENSORGASSENSOR: {
    name:        'IfcSensorGASSENSOR',
    label:       'Gas Sensor',
    description: 'A device that senses or detects gas concentration (other than CO2)',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcSensor', 'IfcSensorGASSENSOR'],
  },

  IFCSENSORHEATSENSOR: {
    name:        'IfcSensorHEATSENSOR',
    label:       'Heat Sensor',
    description: 'A device that senses or detects heat.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcSensor', 'IfcSensorHEATSENSOR'],
  },

  IFCSENSORHUMIDITYSENSOR: {
    name:        'IfcSensorHUMIDITYSENSOR',
    label:       'Humidity Sensor',
    description: 'A device that senses or detects humidity.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcSensor', 'IfcSensorHUMIDITYSENSOR'],
  },

  IFCSENSORIDENTIFIERSENSOR: {
    name:        'IfcSensorIDENTIFIERSENSOR',
    label:       'Identifier Sensor',
    description: 'A device that reads a tag, such as for gaining access to a door or elevator',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcSensor', 'IfcSensorIDENTIFIERSENSOR'],
  },

  IFCSENSORIONCONCENTRATIONSENSOR: {
    name:        'IfcSensorIONCONCENTRATIONSENSOR',
    label:       'Ion Concentration Sensor',
    description: 'A device that senses or detects ion concentration, such as for water hardness.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcSensor', 'IfcSensorIONCONCENTRATIONSENSOR'],
  },

  IFCSENSORLEVELSENSOR: {
    name:        'IfcSensorLEVELSENSOR',
    label:       'Level Sensor',
    description: 'A device that senses or detects fill level, such as for a tank.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcSensor', 'IfcSensorLEVELSENSOR'],
  },

  IFCSENSORLIGHTSENSOR: {
    name:        'IfcSensorLIGHTSENSOR',
    label:       'Light Sensor',
    description: 'A device that senses or detects light.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcSensor', 'IfcSensorLIGHTSENSOR'],
  },

  IFCSENSORMOISTURESENSOR: {
    name:        'IfcSensorMOISTURESENSOR',
    label:       'Moisture Sensor',
    description: 'A device that senses or detects moisture.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcSensor', 'IfcSensorMOISTURESENSOR'],
  },

  IFCSENSORMOVEMENTSENSOR: {
    name:        'IfcSensorMOVEMENTSENSOR',
    label:       'Movement Sensor',
    description: 'A device that senses or detects movement.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcSensor', 'IfcSensorMOVEMENTSENSOR'],
  },

  IFCSENSOROBSTACLESENSOR: {
    name:        'IfcSensorOBSTACLESENSOR',
    label:       'Obstacle Sensor',
    description: 'A device that senses or detects any obstacles.detectors sensing objects falling from a bridge, rock-fall detectors, etc.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcSensor', 'IfcSensorOBSTACLESENSOR'],
  },

  IFCSENSORPHSENSOR: {
    name:        'IfcSensorPHSENSOR',
    label:       'Phsensor',
    description: 'A device that senses or detects acidity.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcSensor', 'IfcSensorPHSENSOR'],
  },

  IFCSENSORPRESSURESENSOR: {
    name:        'IfcSensorPRESSURESENSOR',
    label:       'Pressure Sensor',
    description: 'A device that senses or detects pressure.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcSensor', 'IfcSensorPRESSURESENSOR'],
  },

  IFCSENSORRADIATIONSENSOR: {
    name:        'IfcSensorRADIATIONSENSOR',
    label:       'Radiation Sensor',
    description: 'A device that senses or detects pressure.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcSensor', 'IfcSensorRADIATIONSENSOR'],
  },

  IFCSENSORRADIOACTIVITYSENSOR: {
    name:        'IfcSensorRADIOACTIVITYSENSOR',
    label:       'Radioactivity Sensor',
    description: 'A device that senses or detects atomic decay.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcSensor', 'IfcSensorRADIOACTIVITYSENSOR'],
  },

  IFCSENSORRAINSENSOR: {
    name:        'IfcSensorRAINSENSOR',
    label:       'Rain Sensor',
    description: 'A device that senses or collects rainfall related information.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcSensor', 'IfcSensorRAINSENSOR'],
  },

  IFCSENSORSMOKESENSOR: {
    name:        'IfcSensorSMOKESENSOR',
    label:       'Smoke Sensor',
    description: 'A device that senses or detects smoke.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcSensor', 'IfcSensorSMOKESENSOR'],
  },

  IFCSENSORSNOWDEPTHSENSOR: {
    name:        'IfcSensorSNOWDEPTHSENSOR',
    label:       'Snow Depth Sensor',
    description: 'A device that senses or measures the depth of snowfall.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcSensor', 'IfcSensorSNOWDEPTHSENSOR'],
  },

  IFCSENSORSOUNDSENSOR: {
    name:        'IfcSensorSOUNDSENSOR',
    label:       'Sound Sensor',
    description: 'A device that senses or detects sound.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcSensor', 'IfcSensorSOUNDSENSOR'],
  },

  IFCSENSORTEMPERATURESENSOR: {
    name:        'IfcSensorTEMPERATURESENSOR',
    label:       'Temperature Sensor',
    description: 'A device that senses or detects temperature.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcSensor', 'IfcSensorTEMPERATURESENSOR'],
  },

  IFCSENSORTRAINSENSOR: {
    name:        'IfcSensorTRAINSENSOR',
    label:       'T Rain Sensor',
    description: 'A device, usually attached to the rear end of the last vehicle of a train, acting on a fixed equipment to give an indication that the train is complete.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcSensor', 'IfcSensorTRAINSENSOR'],
  },

  IFCSENSORTURNOUTCLOSURESENSOR: {
    name:        'IfcSensorTURNOUTCLOSURESENSOR',
    label:       'Turnout Closure Sensor',
    description: 'A device that senses or detects the position of a blade of a turnout.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcSensor', 'IfcSensorTURNOUTCLOSURESENSOR'],
  },

  IFCSENSORWHEELSENSOR: {
    name:        'IfcSensorWHEELSENSOR',
    label:       'Wheel Sensor',
    description: 'A device that senses or detects the passage of a wheel.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcSensor', 'IfcSensorWHEELSENSOR'],
  },

  IFCSENSORWINDSENSOR: {
    name:        'IfcSensorWINDSENSOR',
    label:       'Wind Sensor',
    description: 'A device that senses or detects airflow speed and direction.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcSensor', 'IfcSensorWINDSENSOR'],
  },

  IFCSHADINGDEVICE: {
    name:        'IfcShadingDevice',
    label:       'Shading Device',
    description: 'Shading devices are purpose built devices to protect from the sunlight, from natural light, or screening them from view. Shading devices can form part of the facade or can be mounted inside the buildi',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcShadingDevice'],
  },

  IFCSHADINGDEVICEAWNING: {
    name:        'IfcShadingDeviceAWNING',
    label:       'Awning',
    description: 'A rooflike shelter of canvas or other material extending over a doorway, from the top of a window, over a deck, or similar, in order to provide protection, as from the sun.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcShadingDevice', 'IfcShadingDeviceAWNING'],
  },

  IFCSHADINGDEVICEJALOUSIE: {
    name:        'IfcShadingDeviceJALOUSIE',
    label:       'Jalousie',
    description: 'A blind with adjustable horizontal slats for admitting light and air while excluding direct sun and rain.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcShadingDevice', 'IfcShadingDeviceJALOUSIE'],
  },

  IFCSHADINGDEVICESHUTTER: {
    name:        'IfcShadingDeviceSHUTTER',
    label:       'Shutter',
    description: 'A mechanical device that limits the passage of light. Often used as a a solid or louvered movable cover for a window.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcShadingDevice', 'IfcShadingDeviceSHUTTER'],
  },

  IFCSIGN: {
    name:        'IfcSign',
    label:       'Sign',
    description: 'A sign is a notice on display that gives information or instructions in a written, symbolic or other form. Signs are passive with the most common form of a pictorial panel. An instance of [[IfcSign]]',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcSign'],
  },

  IFCSIGNMARKER: {
    name:        'IfcSignMARKER',
    label:       'Marker',
    description: 'A Sign type formed of a vertical post (possibly with some lettering or symbols) usually used to delimitate distance or the location of some equipment.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcSign', 'IfcSignMARKER'],
  },

  IFCSIGNMIRROR: {
    name:        'IfcSignMIRROR',
    label:       'Mirror',
    description: 'A sign type that provides information via a reflective mirror surface.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcSign', 'IfcSignMIRROR'],
  },

  IFCSIGNPICTORAL: {
    name:        'IfcSignPICTORAL',
    label:       'Pictoral',
    description: 'A sign type formed of a flat plate with some written or symbolic images on it.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcSign', 'IfcSignPICTORAL'],
  },

  IFCSIGNAL: {
    name:        'IfcSignal',
    label:       'Signal',
    description: 'A signal is an active device that conveys information or instructions to users, by means of an audio, visual signal or a combination of both.; The primary distinction from an [[IfcSign]] is that a sig',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcSignal'],
  },

  IFCSIGNALAUDIO: {
    name:        'IfcSignalAUDIO',
    label:       'Audio',
    description: 'A signal type formed of an active device conveying information by emitting an audio signal such as a beep, ring, horn or explosive sound.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcSignal', 'IfcSignalAUDIO'],
  },

  IFCSIGNALMIXED: {
    name:        'IfcSignalMIXED',
    label:       'Mixed',
    description: 'A signal type formed of an active device conveying information in both a visual and audio manner.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcSignal', 'IfcSignalMIXED'],
  },

  IFCSIGNALVISUAL: {
    name:        'IfcSignalVISUAL',
    label:       'Visual',
    description: 'A signal type formed of an active device conveying information in a visual manner such as a light, cluster of lights, or mechanical moving shapes.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcSignal', 'IfcSignalVISUAL'],
  },

  IFCSITE: {
    name:        'IfcSite',
    label:       'Site',
    description: 'A site is a defined area of land, possibly covered with water, on which the project construction is to be completed. A site may be used to erect, retrofit or turn down building(s), or for other constr',
    domain:      'Räumliche Struktur',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcSite'],
  },

  IFCSLAB: {
    name:        'IfcSlab',
    label:       'Slab',
    description: 'A slab is a component of the construction that may enclose a space vertically. The slab may provide the lower support (floor) or upper construction (roof slab) in any space in a building.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcSlab'],
  },

  IFCSLABAPPROACH_SLAB: {
    name:        'IfcSlabAPPROACH_SLAB',
    label:       'Approach Slab',
    description: 'Iis part of bridge abutment providing transition from embankment to the bridge',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcSlab', 'IfcSlabAPPROACH_SLAB'],
  },

  IFCSLABBASESLAB: {
    name:        'IfcSlabBASESLAB',
    label:       'Baseslab',
    description: 'The slab is used to represent a floor slab against the ground (and thereby being a part of the foundation). Another name is mat foundation.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcSlab', 'IfcSlabBASESLAB'],
  },

  IFCSLABFLOOR: {
    name:        'IfcSlabFLOOR',
    label:       'Floor',
    description: 'The slab is used to represent a floor slab or a bridge deck.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcSlab', 'IfcSlabFLOOR'],
  },

  IFCSLABLANDING: {
    name:        'IfcSlabLANDING',
    label:       'Landing',
    description: 'The slab is used to represent a landing within a stair or ramp.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcSlab', 'IfcSlabLANDING'],
  },

  IFCSLABPAVING: {
    name:        'IfcSlabPAVING',
    label:       'Paving',
    description: 'Rigid pavement course of a road or other paved area, usually concrete.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcSlab', 'IfcSlabPAVING'],
  },

  IFCSLABROOF: {
    name:        'IfcSlabROOF',
    label:       'Roof',
    description: 'The slab is used to represent a roof slab (either flat or sloped).',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcSlab', 'IfcSlabROOF'],
  },

  IFCSLABSIDEWALK: {
    name:        'IfcSlabSIDEWALK',
    label:       'Side Walk',
    description: 'The slab is used to represent a sidewalk.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcSlab', 'IfcSlabSIDEWALK'],
  },

  IFCSLABTRACKSLAB: {
    name:        'IfcSlabTRACKSLAB',
    label:       'Tracks Lab',
    description: 'A track slab is a reinforced concrete slab or prestressed reinforced concrete slab, which is a main element of slab track. It can be prefabricated or cast on site and may have sleepers embedded.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcSlab', 'IfcSlabTRACKSLAB'],
  },

  IFCSLABWEARING: {
    name:        'IfcSlabWEARING',
    label:       'Wearing',
    description: 'The slab is used to represent a wearing surface.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcSlab', 'IfcSlabWEARING'],
  },

  IFCSOLARDEVICE: {
    name:        'IfcSolarDevice',
    label:       'Solar Device',
    description: 'A solar device converts solar radiation into other energy such as electric current or thermal energy.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcSolarDevice'],
  },

  IFCSOLARDEVICESOLARCOLLECTOR: {
    name:        'IfcSolarDeviceSOLARCOLLECTOR',
    label:       'Solar Collector',
    description: 'A device that converts solar radiation into thermal energy (heating water, etc.).',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcSolarDevice', 'IfcSolarDeviceSOLARCOLLECTOR'],
  },

  IFCSOLARDEVICESOLARPANEL: {
    name:        'IfcSolarDeviceSOLARPANEL',
    label:       'Solar Panel',
    description: 'A device that converts solar radiation into electric current.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcSolarDevice', 'IfcSolarDeviceSOLARPANEL'],
  },

  IFCSPACE: {
    name:        'IfcSpace',
    label:       'Space',
    description: 'A space represents an area or volume bounded actually or theoretically. Spaces are areas or volumes that provide for certain functions within a building.',
    domain:      'Räumliche Struktur',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcSpace'],
  },

  IFCSPACEBERTH: {
    name:        'IfcSpaceBERTH',
    label:       'Berth',
    description: 'A space dedicated to the berthing of vessels within a port or managed area',
    domain:      'Räumliche Struktur',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcSpace', 'IfcSpaceBERTH'],
  },

  IFCSPACEEXTERNAL: {
    name:        'IfcSpaceEXTERNAL',
    label:       'External',
    description: 'A space outside of a facility.',
    domain:      'Räumliche Struktur',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcSpace', 'IfcSpaceEXTERNAL'],
  },

  IFCSPACEGFA: {
    name:        'IfcSpaceGFA',
    label:       'GFA',
    description: 'Gross Floor [[Area]] - a specific kind of space for each building story that includes all net area and construction area (also the external envelop). Provision of such a specific space is often requir',
    domain:      'Räumliche Struktur',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcSpace', 'IfcSpaceGFA'],
  },

  IFCSPACEHEATER: {
    name:        'IfcSpaceHeater',
    label:       'Space Heater',
    description: 'Space heaters utilize a combination of radiation and/or natural convection using a heating source such as electricity, steam or hot water to heat a limited space or area. Examples of space heaters inc',
    domain:      'TGA / HVAC',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcSpaceHeater'],
  },

  IFCSPACEHEATERCONVECTOR: {
    name:        'IfcSpaceHeaterCONVECTOR',
    label:       'Convector',
    description: 'A heat-distributing unit that operates with gravity-circulated air.',
    domain:      'TGA / HVAC',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcSpaceHeater', 'IfcSpaceHeaterCONVECTOR'],
  },

  IFCSPACEHEATERRADIATOR: {
    name:        'IfcSpaceHeaterRADIATOR',
    label:       'Radiator',
    description: 'A heat-distributing unit that operates with thermal radiation.',
    domain:      'TGA / HVAC',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcSpaceHeater', 'IfcSpaceHeaterRADIATOR'],
  },

  IFCSPACEINTERNAL: {
    name:        'IfcSpaceINTERNAL',
    label:       'Internal',
    description: 'A space inside a facility.',
    domain:      'Räumliche Struktur',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcSpace', 'IfcSpaceINTERNAL'],
  },

  IFCSPACEPARKING: {
    name:        'IfcSpacePARKING',
    label:       'Parking',
    description: 'A space dedication for use as a parking spot for vehicles, including access, such as a parking aisle.',
    domain:      'Räumliche Struktur',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcSpace', 'IfcSpacePARKING'],
  },

  IFCSPACESPACE: {
    name:        'IfcSpaceSPACE',
    label:       'Space',
    description: 'Any space not falling into another category.',
    domain:      'Räumliche Struktur',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcSpace', 'IfcSpaceSPACE'],
  },

  IFCSPATIALELEMENT: {
    name:        'IfcSpatialElement',
    label:       'Spatial Element',
    description: 'A spatial element is the generalization of all spatial elements that might be used to define a spatial structure or to define spatial zones.',
    domain:      'Raummodell',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement'],
  },

  IFCSPATIALSTRUCTUREELEMENT: {
    name:        'IfcSpatialStructureElement',
    label:       'Spatial Structure Element',
    description: 'A spatial structure element is the generalization of all spatial elements that might be used to define a spatial structure. The spatial structure can be used to provide a spatial organization of a pro',
    domain:      'Räumliche Struktur',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement'],
  },

  IFCSPATIALZONE: {
    name:        'IfcSpatialZone',
    label:       'Spatial Zone',
    description: 'A spatial zone is a non-hierarchical and potentially overlapping decomposition of the project under some functional consideration. A spatial zone might be used to represent a thermal zone, a construct',
    domain:      'Raummodell',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialZone'],
  },

  IFCSPATIALZONECONSTRUCTION: {
    name:        'IfcSpatialZoneCONSTRUCTION',
    label:       'Construction',
    description: 'The spatial zone is used to represent a construction zone for the production process.',
    domain:      'Raummodell',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialZone', 'IfcSpatialZoneCONSTRUCTION'],
  },

  IFCSPATIALZONEFIRESAFETY: {
    name:        'IfcSpatialZoneFIRESAFETY',
    label:       'Fire Safety',
    description: 'The spatial zone is used to represent a fire safety zone, or fire compartment.',
    domain:      'Raummodell',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialZone', 'IfcSpatialZoneFIRESAFETY'],
  },

  IFCSPATIALZONEINTERFERENCE: {
    name:        'IfcSpatialZoneINTERFERENCE',
    label:       'Interference',
    description: 'The spatial zone is used to define an interference between [[IfcSpatialElement]] occurrences.',
    domain:      'Raummodell',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialZone', 'IfcSpatialZoneINTERFERENCE'],
  },

  IFCSPATIALZONELIGHTING: {
    name:        'IfcSpatialZoneLIGHTING',
    label:       'Light Ing',
    description: 'The spatial zone is used to represent a lighting zone; a daylight zone, or an artificial lighting zone.',
    domain:      'Raummodell',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialZone', 'IfcSpatialZoneLIGHTING'],
  },

  IFCSPATIALZONEOCCUPANCY: {
    name:        'IfcSpatialZoneOCCUPANCY',
    label:       'Occupancy',
    description: 'The spatial zone is used to represent a zone of particular occupancy.',
    domain:      'Raummodell',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialZone', 'IfcSpatialZoneOCCUPANCY'],
  },

  IFCSPATIALZONERESERVATION: {
    name:        'IfcSpatialZoneRESERVATION',
    label:       'Reservation',
    description: 'A spatial zone that marks some sort of reservation within the project extent.',
    domain:      'Raummodell',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialZone', 'IfcSpatialZoneRESERVATION'],
  },

  IFCSPATIALZONESECURITY: {
    name:        'IfcSpatialZoneSECURITY',
    label:       'Security',
    description: 'The spatial zone is used to represent a zone for security planning and maintenance work.',
    domain:      'Raummodell',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialZone', 'IfcSpatialZoneSECURITY'],
  },

  IFCSPATIALZONETHERMAL: {
    name:        'IfcSpatialZoneTHERMAL',
    label:       'Thermal',
    description: 'The spatial zone is used to represent a thermal zone.',
    domain:      'Raummodell',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialZone', 'IfcSpatialZoneTHERMAL'],
  },

  IFCSPATIALZONETRANSPORT: {
    name:        'IfcSpatialZoneTRANSPORT',
    label:       'Transport',
    description: 'The spatial zone is used to represent an area primarily dedicated to the movement of people or goods.',
    domain:      'Raummodell',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialZone', 'IfcSpatialZoneTRANSPORT'],
  },

  IFCSPATIALZONEVENTILATION: {
    name:        'IfcSpatialZoneVENTILATION',
    label:       'Ventilation',
    description: 'The spatial zone is used to represent a ventilation zone.',
    domain:      'Raummodell',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialZone', 'IfcSpatialZoneVENTILATION'],
  },

  IFCSTACKTERMINAL: {
    name:        'IfcStackTerminal',
    label:       'Stack Terminal',
    description: 'A stack terminal is placed at the top of a ventilating stack (such as to prevent ingress by birds or rainwater) or rainwater pipe (to act as a collector or hopper for discharge from guttering).',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcStackTerminal'],
  },

  IFCSTACKTERMINALBIRDCAGE: {
    name:        'IfcStackTerminalBIRDCAGE',
    label:       'Bird Cage',
    description: 'Guard cage, typically wire mesh, at the top of the stack preventing access by birds.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcStackTerminal', 'IfcStackTerminalBIRDCAGE'],
  },

  IFCSTACKTERMINALCOWL: {
    name:        'IfcStackTerminalCOWL',
    label:       'Cowl',
    description: 'A cowling placed at the top of a stack to eliminate downdraft.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcStackTerminal', 'IfcStackTerminalCOWL'],
  },

  IFCSTACKTERMINALRAINWATERHOPPER: {
    name:        'IfcStackTerminalRAINWATERHOPPER',
    label:       'Rain Water Hopper',
    description: 'A box placed at the top of a rainwater downpipe to catch rainwater from guttering.',
    domain:      'TGA / Endgerät',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcStackTerminal', 'IfcStackTerminalRAINWATERHOPPER'],
  },

  IFCSTAIR: {
    name:        'IfcStair',
    label:       'Stair',
    description: 'A stair is a vertical passageway allowing occupants to walk (step) from one floor level to another floor level at a different elevation. It may include a landing as an intermediate floor slab.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcStair'],
  },

  IFCSTAIRCURVED_RUN_STAIR: {
    name:        'IfcStairCURVED_RUN_STAIR',
    label:       'Curved Run Stair',
    description: 'A stair extending from one level to another without turns or winders. The stair is consisting of one curved flight.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcStair', 'IfcStairCURVED_RUN_STAIR'],
  },

  IFCSTAIRDOUBLE_RETURN_STAIR: {
    name:        'IfcStairDOUBLE_RETURN_STAIR',
    label:       'Double Return Stair',
    description: 'A stair having one straight flight to a wide quarterspace landing, and two side flights from that landing into opposite directions. The stair is making a 90° turn. The direction of traffic is determin',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcStair', 'IfcStairDOUBLE_RETURN_STAIR'],
  },

  IFCSTAIRFLIGHT: {
    name:        'IfcStairFlight',
    label:       'Stair Flight',
    description: 'A stair flight is an assembly of building components in a single \\\'run\\\' of stair steps (not interrupted by a landing). The stair steps and any stringers are included in the stair flight. A winder is',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcStairFlight'],
  },

  IFCSTAIRFLIGHTCURVED: {
    name:        'IfcStairFlightCURVED',
    label:       'Curved',
    description: 'A stair flight with a curved walking line.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcStairFlight', 'IfcStairFlightCURVED'],
  },

  IFCSTAIRFLIGHTFREEFORM: {
    name:        'IfcStairFlightFREEFORM',
    label:       'Freeform',
    description: 'A stair flight with a free form walking line (and outer boundaries).',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcStairFlight', 'IfcStairFlightFREEFORM'],
  },

  IFCSTAIRFLIGHTSPIRAL: {
    name:        'IfcStairFlightSPIRAL',
    label:       'Spiral',
    description: 'A stair flight with a circular or elliptic walking line.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcStairFlight', 'IfcStairFlightSPIRAL'],
  },

  IFCSTAIRFLIGHTSTRAIGHT: {
    name:        'IfcStairFlightSTRAIGHT',
    label:       'Straight',
    description: 'A stair flight with a straight walking line.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcStairFlight', 'IfcStairFlightSTRAIGHT'],
  },

  IFCSTAIRFLIGHTWINDER: {
    name:        'IfcStairFlightWINDER',
    label:       'Winder',
    description: 'A stair flight with a walking line including straight and curved sections.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcStairFlight', 'IfcStairFlightWINDER'],
  },

  IFCSTAIRHALF_TURN_STAIR: {
    name:        'IfcStairHALF_TURN_STAIR',
    label:       'Half Turn Stair',
    description: 'A stair making a 180° turn, consisting of two straight flights connectedby a halfspace landing. The orientation of the turn is determined by the walking line.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcStair', 'IfcStairHALF_TURN_STAIR'],
  },

  IFCSTAIRHALF_WINDING_STAIR: {
    name:        'IfcStairHALF_WINDING_STAIR',
    label:       'Half Wind Ing Stair',
    description: 'A stair consisting of one flight with one half winder, which makes a 180° turn. The orientation of the turn is determined by the walking line.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcStair', 'IfcStairHALF_WINDING_STAIR'],
  },

  IFCSTAIRLADDER: {
    name:        'IfcStairLADDER',
    label:       'Ladder',
    description: 'a piece of equipment consisting of a series of bars or steps between two upright elements used for climbing up or down something',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcStair', 'IfcStairLADDER'],
  },

  IFCSTAIRQUARTER_TURN_STAIR: {
    name:        'IfcStairQUARTER_TURN_STAIR',
    label:       'Quarter Turn Stair',
    description: 'A stair making a 90° turn, consisting of two straight flights connected by a quarterspace landing. The direction of the turn is determined by the walking line.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcStair', 'IfcStairQUARTER_TURN_STAIR'],
  },

  IFCSTAIRQUARTER_WINDING_STAIR: {
    name:        'IfcStairQUARTER_WINDING_STAIR',
    label:       'Quarter Wind Ing Stair',
    description: 'A stair consisting of one flight with a quarter winder, which is making a 90° turn. The direction of the turn is determined by the walking line.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcStair', 'IfcStairQUARTER_WINDING_STAIR'],
  },

  IFCSTAIRSPIRAL_STAIR: {
    name:        'IfcStairSPIRAL_STAIR',
    label:       'Spiral Stair',
    description: 'A stair constructed with winders around a circular newel often without landings. Depending on outer boundary it can be either a circular, elliptical or rectangular spiral stair. The orientation of the',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcStair', 'IfcStairSPIRAL_STAIR'],
  },

  IFCSTAIRSTRAIGHT_RUN_STAIR: {
    name:        'IfcStairSTRAIGHT_RUN_STAIR',
    label:       'Straight Run Stair',
    description: 'A stair extending from one level to another without turns or winders. The stair consists of one straight flight.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcStair', 'IfcStairSTRAIGHT_RUN_STAIR'],
  },

  IFCSTAIRTHREE_QUARTER_TURN_STAIR: {
    name:        'IfcStairTHREE_QUARTER_TURN_STAIR',
    label:       'Three Quarter Turn Stair',
    description: 'A stair making a 270° turn, consisting of four straight flights connected; by three quarterspace landings. The direction of the turns is determined by the walking line.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcStair', 'IfcStairTHREE_QUARTER_TURN_STAIR'],
  },

  IFCSTAIRTHREE_QUARTER_WINDING_STAIR: {
    name:        'IfcStairTHREE_QUARTER_WINDING_STAIR',
    label:       'Three Quarter Wind Ing Stair',
    description: 'A stair consisting of one flight with three quarter winders, which make a; 90° turn. The stair makes a 270° turn. The direction of the turns is determined by the walking line.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcStair', 'IfcStairTHREE_QUARTER_WINDING_STAIR'],
  },

  IFCSTAIRTWO_CURVED_RUN_STAIR: {
    name:        'IfcStairTWO_CURVED_RUN_STAIR',
    label:       'Two Curved Run Stair',
    description: 'A curved stair consisting of two curved flights without turns but with one landing.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcStair', 'IfcStairTWO_CURVED_RUN_STAIR'],
  },

  IFCSTAIRTWO_QUARTER_TURN_STAIR: {
    name:        'IfcStairTWO_QUARTER_TURN_STAIR',
    label:       'Two Quarter Turn Stair',
    description: 'A stair making a 180° turn, consisting of three straight flights connected by two quarterspace landings. The direction of the turns is determined by the walking line.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcStair', 'IfcStairTWO_QUARTER_TURN_STAIR'],
  },

  IFCSTAIRTWO_QUARTER_WINDING_STAIR: {
    name:        'IfcStairTWO_QUARTER_WINDING_STAIR',
    label:       'Two Quarter Wind Ing Stair',
    description: 'A stair consisting of one flight with two quarter winders, which make a; 90° turn. The stair makes a 180° turn. The direction of the turns is determined by the walking line.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcStair', 'IfcStairTWO_QUARTER_WINDING_STAIR'],
  },

  IFCSTAIRTWO_STRAIGHT_RUN_STAIR: {
    name:        'IfcStairTWO_STRAIGHT_RUN_STAIR',
    label:       'Two Straight Run Stair',
    description: 'A straight stair consisting of two straight flights without turns but with one landing.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcStair', 'IfcStairTWO_STRAIGHT_RUN_STAIR'],
  },

  IFCSTRUCTURALACTION: {
    name:        'IfcStructuralAction',
    label:       'Structural Action',
    description: 'A structural action is a structural activity that acts upon a structural item or building element.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralActivity', 'IfcStructuralAction'],
  },

  IFCSTRUCTURALACTIVITY: {
    name:        'IfcStructuralActivity',
    label:       'Structural Activity',
    description: 'The abstract entity [[IfcStructuralActivity]] combines the definition of actions (such as forces, displacements, etc.) and reactions (support reactions, internal forces, deflections, etc.) which are s',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralActivity'],
  },

  IFCSTRUCTURALANALYSISMODEL: {
    name:        'IfcStructuralAnalysisModel',
    label:       'Structural Analysis Model',
    description: 'The [[IfcStructuralAnalysisModel]] is used to assemble all information needed to represent a structural analysis model. It encompasses certain general properties (such as analysis type), references to',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcStructuralAnalysisModel'],
  },

  IFCSTRUCTURALANALYSISMODELIN_PLANE_LOADING_2D: {
    name:        'IfcStructuralAnalysisModelIN_PLANE_LOADING_2D',
    label:       'In Plane Loading 2D',
    description: 'In plan loading 2D',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcStructuralAnalysisModel', 'IfcStructuralAnalysisModelIN_PLANE_LOADING_2D'],
  },

  IFCSTRUCTURALANALYSISMODELLOADING_3D: {
    name:        'IfcStructuralAnalysisModelLOADING_3D',
    label:       'Loading 3D',
    description: 'Loading 3D',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcStructuralAnalysisModel', 'IfcStructuralAnalysisModelLOADING_3D'],
  },

  IFCSTRUCTURALANALYSISMODELOUT_PLANE_LOADING_2D: {
    name:        'IfcStructuralAnalysisModelOUT_PLANE_LOADING_2D',
    label:       'Out Plane Loading 2D',
    description: 'Out plane loading 2D',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcStructuralAnalysisModel', 'IfcStructuralAnalysisModelOUT_PLANE_LOADING_2D'],
  },

  IFCSTRUCTURALCONNECTION: {
    name:        'IfcStructuralConnection',
    label:       'Structural Connection',
    description: 'An [[IfcStructuralConnection]] represents a structural connection object (node connection, edge connection, or surface connection) or supports.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralItem', 'IfcStructuralConnection'],
  },

  IFCSTRUCTURALCURVEACTION: {
    name:        'IfcStructuralCurveAction',
    label:       'Structural Curve Action',
    description: 'A structural curve action defines an action which is distributed over a curve. A curve action may be connected with a curve member or curve connection, or surface member or surface connection.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralActivity', 'IfcStructuralAction', 'IfcStructuralCurveAction'],
  },

  IFCSTRUCTURALCURVEACTIONCONST: {
    name:        'IfcStructuralCurveActionCONST',
    label:       'Const',
    description: 'The load has a constant value over its entire extent.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralActivity', 'IfcStructuralAction', 'IfcStructuralCurveAction', 'IfcStructuralCurveActionCONST'],
  },

  IFCSTRUCTURALCURVEACTIONDISCRETE: {
    name:        'IfcStructuralCurveActionDISCRETE',
    label:       'Discrete',
    description: 'The load is specified as a series of discrete load points.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralActivity', 'IfcStructuralAction', 'IfcStructuralCurveAction', 'IfcStructuralCurveActionDISCRETE'],
  },

  IFCSTRUCTURALCURVEACTIONEQUIDISTANT: {
    name:        'IfcStructuralCurveActionEQUIDISTANT',
    label:       'Equidistant',
    description: 'The load consists of n consecutive sections of same length and is specified by n+1 load samples. The interpolation type over the segments is not defined by this distribution type but may be qualified',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralActivity', 'IfcStructuralAction', 'IfcStructuralCurveAction', 'IfcStructuralCurveActionEQUIDISTANT'],
  },

  IFCSTRUCTURALCURVEACTIONLINEAR: {
    name:        'IfcStructuralCurveActionLINEAR',
    label:       'Linear',
    description: 'The load value is linearly distributed over the load\\\'s extent.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralActivity', 'IfcStructuralAction', 'IfcStructuralCurveAction', 'IfcStructuralCurveActionLINEAR'],
  },

  IFCSTRUCTURALCURVEACTIONPARABOLA: {
    name:        'IfcStructuralCurveActionPARABOLA',
    label:       'Parabola',
    description: 'The load value is distributed as a half wave described by a symmetric quadratic parabola.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralActivity', 'IfcStructuralAction', 'IfcStructuralCurveAction', 'IfcStructuralCurveActionPARABOLA'],
  },

  IFCSTRUCTURALCURVEACTIONPOLYGONAL: {
    name:        'IfcStructuralCurveActionPOLYGONAL',
    label:       'Polygonal',
    description: 'The load consists of several consecutive linear sections.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralActivity', 'IfcStructuralAction', 'IfcStructuralCurveAction', 'IfcStructuralCurveActionPOLYGONAL'],
  },

  IFCSTRUCTURALCURVEACTIONSINUS: {
    name:        'IfcStructuralCurveActionSINUS',
    label:       'Sinus',
    description: 'The load value is distributed as a sinus half wave.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralActivity', 'IfcStructuralAction', 'IfcStructuralCurveAction', 'IfcStructuralCurveActionSINUS'],
  },

  IFCSTRUCTURALCURVECONNECTION: {
    name:        'IfcStructuralCurveConnection',
    label:       'Structural Curve Connection',
    description: 'Instances of [[IfcStructuralCurveConnection]] describe edge \\\'nodes\\\', i.e. edges where two or more surface members are joined, or edge supports. Edge curves may be straight or curved.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralItem', 'IfcStructuralConnection', 'IfcStructuralCurveConnection'],
  },

  IFCSTRUCTURALCURVEMEMBER: {
    name:        'IfcStructuralCurveMember',
    label:       'Structural Curve Member',
    description: 'Instances of [[IfcStructuralCurveMember]] describe edge members, i.e. structural analysis idealizations of beams, columns, rods etc. Curve members may be straight or curved.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralItem', 'IfcStructuralMember', 'IfcStructuralCurveMember'],
  },

  IFCSTRUCTURALCURVEMEMBERCABLE: {
    name:        'IfcStructuralCurveMemberCABLE',
    label:       'Cable',
    description: 'A tension member which is able to carry transverse loads only under large deflection.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralItem', 'IfcStructuralMember', 'IfcStructuralCurveMember', 'IfcStructuralCurveMemberCABLE'],
  },

  IFCSTRUCTURALCURVEMEMBERCOMPRESSION_MEMBER: {
    name:        'IfcStructuralCurveMemberCOMPRESSION_MEMBER',
    label:       'Compression Member',
    description: 'A member without tensional stiffness.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralItem', 'IfcStructuralMember', 'IfcStructuralCurveMember', 'IfcStructuralCurveMemberCOMPRESSION_MEMBER'],
  },

  IFCSTRUCTURALCURVEMEMBERPIN_JOINED_MEMBER: {
    name:        'IfcStructuralCurveMemberPIN_JOINED_MEMBER',
    label:       'Pin Joined Member',
    description: 'A member with capacity to carry axial loads only, i.e. a link. Typically used in trusses.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralItem', 'IfcStructuralMember', 'IfcStructuralCurveMember', 'IfcStructuralCurveMemberPIN_JOINED_MEMBER'],
  },

  IFCSTRUCTURALCURVEMEMBERRIGID_JOINED_MEMBER: {
    name:        'IfcStructuralCurveMemberRIGID_JOINED_MEMBER',
    label:       'Rigid Joined Member',
    description: 'A member with capacity to carry transverse and axial loads, i.e. a beam. Its actual joints may be rigid or pinned. Typically used in rigid frames.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralItem', 'IfcStructuralMember', 'IfcStructuralCurveMember', 'IfcStructuralCurveMemberRIGID_JOINED_MEMBER'],
  },

  IFCSTRUCTURALCURVEMEMBERTENSION_MEMBER: {
    name:        'IfcStructuralCurveMemberTENSION_MEMBER',
    label:       'Tension Member',
    description: 'A member without compressional stiffness.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralItem', 'IfcStructuralMember', 'IfcStructuralCurveMember', 'IfcStructuralCurveMemberTENSION_MEMBER'],
  },

  IFCSTRUCTURALCURVEMEMBERVARYING: {
    name:        'IfcStructuralCurveMemberVarying',
    label:       'Structural Curve Member Varying',
    description: 'This entity describes edge members with varying profile properties. Each instance of [[IfcStructuralCurveMemberVarying]] is composed of two or more instances of [[IfcStructuralCurveMember]] with diffe',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralItem', 'IfcStructuralMember', 'IfcStructuralCurveMember', 'IfcStructuralCurveMemberVarying'],
  },

  IFCSTRUCTURALCURVEREACTION: {
    name:        'IfcStructuralCurveReaction',
    label:       'Structural Curve Reaction',
    description: 'This entity defines a reaction which occurs distributed over a curve. A curve reaction may be connected with a curve member or curve connection, or surface member or surface connection.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralActivity', 'IfcStructuralReaction', 'IfcStructuralCurveReaction'],
  },

  IFCSTRUCTURALCURVEREACTIONCONST: {
    name:        'IfcStructuralCurveReactionCONST',
    label:       'Const',
    description: 'The load has a constant value over its entire extent.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralActivity', 'IfcStructuralReaction', 'IfcStructuralCurveReaction', 'IfcStructuralCurveReactionCONST'],
  },

  IFCSTRUCTURALCURVEREACTIONDISCRETE: {
    name:        'IfcStructuralCurveReactionDISCRETE',
    label:       'Discrete',
    description: 'The load is specified as a series of discrete load points.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralActivity', 'IfcStructuralReaction', 'IfcStructuralCurveReaction', 'IfcStructuralCurveReactionDISCRETE'],
  },

  IFCSTRUCTURALCURVEREACTIONEQUIDISTANT: {
    name:        'IfcStructuralCurveReactionEQUIDISTANT',
    label:       'Equidistant',
    description: 'The load consists of n consecutive sections of same length and is specified by n+1 load samples. The interpolation type over the segments is not defined by this distribution type but may be qualified',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralActivity', 'IfcStructuralReaction', 'IfcStructuralCurveReaction', 'IfcStructuralCurveReactionEQUIDISTANT'],
  },

  IFCSTRUCTURALCURVEREACTIONLINEAR: {
    name:        'IfcStructuralCurveReactionLINEAR',
    label:       'Linear',
    description: 'The load value is linearly distributed over the load\\\'s extent.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralActivity', 'IfcStructuralReaction', 'IfcStructuralCurveReaction', 'IfcStructuralCurveReactionLINEAR'],
  },

  IFCSTRUCTURALCURVEREACTIONPARABOLA: {
    name:        'IfcStructuralCurveReactionPARABOLA',
    label:       'Parabola',
    description: 'The load value is distributed as a half wave described by a symmetric quadratic parabola.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralActivity', 'IfcStructuralReaction', 'IfcStructuralCurveReaction', 'IfcStructuralCurveReactionPARABOLA'],
  },

  IFCSTRUCTURALCURVEREACTIONPOLYGONAL: {
    name:        'IfcStructuralCurveReactionPOLYGONAL',
    label:       'Polygonal',
    description: 'The load consists of several consecutive linear sections.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralActivity', 'IfcStructuralReaction', 'IfcStructuralCurveReaction', 'IfcStructuralCurveReactionPOLYGONAL'],
  },

  IFCSTRUCTURALCURVEREACTIONSINUS: {
    name:        'IfcStructuralCurveReactionSINUS',
    label:       'Sinus',
    description: 'The load value is distributed as a sinus half wave.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralActivity', 'IfcStructuralReaction', 'IfcStructuralCurveReaction', 'IfcStructuralCurveReactionSINUS'],
  },

  IFCSTRUCTURALITEM: {
    name:        'IfcStructuralItem',
    label:       'Structural Item',
    description: 'The abstract entity [[IfcStructuralItem]] is the generalization of structural members and structural connections, that is, analysis idealizations of elements in the building model. It defines the rela',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralItem'],
  },

  IFCSTRUCTURALLINEARACTION: {
    name:        'IfcStructuralLinearAction',
    label:       'Structural Linear Action',
    description: 'This entity defines an action with constant value which is distributed over a curve.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralActivity', 'IfcStructuralAction', 'IfcStructuralCurveAction', 'IfcStructuralLinearAction'],
  },

  IFCSTRUCTURALLOAD: {
    name:        'IfcStructuralLoad',
    label:       'Structural Load',
    description: 'This abstract entity is the supertype of all loads (actions or reactions) or of certain requirements resulting from structural analysis, or certain provisions which influence structural analysis.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcStructuralLoad'],
  },

  IFCSTRUCTURALLOADCASE: {
    name:        'IfcStructuralLoadCase',
    label:       'Structural Load Case',
    description: 'A load case is a load group, commonly used to group loads from the same action source.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcStructuralLoadGroup', 'IfcStructuralLoadCase'],
  },

  IFCSTRUCTURALLOADGROUP: {
    name:        'IfcStructuralLoadGroup',
    label:       'Structural Load Group',
    description: 'The entity [[IfcStructuralLoadGroup]] is used to structure the physical impacts. By using the grouping features inherited from [[IfcGroup]], instances of [[IfcStructuralAction]] (or its subclasses) an',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcStructuralLoadGroup'],
  },

  IFCSTRUCTURALLOADGROUPLOAD_CASE: {
    name:        'IfcStructuralLoadGroupLOAD_CASE',
    label:       'Load Case',
    description: 'Groups LOAD_GROUPs and instances of subtypes of [[IfcStructuralAction]].; It should be used as a container for loads with the same origin.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcStructuralLoadGroup', 'IfcStructuralLoadGroupLOAD_CASE'],
  },

  IFCSTRUCTURALLOADGROUPLOAD_COMBINATION: {
    name:        'IfcStructuralLoadGroupLOAD_COMBINATION',
    label:       'Load Combination',
    description: 'An intermediate level between LOAD_CASE and LOAD_COMBINATION. This level is obsolete and deprecated. Before the introduction of IfcRelAssignsToGroupByFactor, the purpose of this level was to provide a',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcStructuralLoadGroup', 'IfcStructuralLoadGroupLOAD_COMBINATION'],
  },

  IFCSTRUCTURALLOADGROUPLOAD_GROUP: {
    name:        'IfcStructuralLoadGroupLOAD_GROUP',
    label:       'Load Group',
    description: 'Groups instances of subtypes of [[IfcStructuralAction]]. It shall be used as a container for loads grouped together for specific purposes, such as loads which are part of a special load pattern.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcStructuralLoadGroup', 'IfcStructuralLoadGroupLOAD_GROUP'],
  },

  IFCSTRUCTURALMEMBER: {
    name:        'IfcStructuralMember',
    label:       'Structural Member',
    description: 'The abstract entity [[IfcStructuralMember]] is the superclass of all structural items which represent the idealized structural behavior of building elements.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralItem', 'IfcStructuralMember'],
  },

  IFCSTRUCTURALPLANARACTION: {
    name:        'IfcStructuralPlanarAction',
    label:       'Structural Planar Action',
    description: 'This entity defines an action with constant value which is distributed over a surface.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralActivity', 'IfcStructuralAction', 'IfcStructuralSurfaceAction', 'IfcStructuralPlanarAction'],
  },

  IFCSTRUCTURALPOINTACTION: {
    name:        'IfcStructuralPointAction',
    label:       'Structural Point Action',
    description: 'This entity defines an action which acts on a point. A point action is typically connected with a point connection. It may also be connected with a curve member or curve connection, or surface member',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralActivity', 'IfcStructuralAction', 'IfcStructuralPointAction'],
  },

  IFCSTRUCTURALPOINTCONNECTION: {
    name:        'IfcStructuralPointConnection',
    label:       'Structural Point Connection',
    description: 'Instances of [[IfcStructuralPointConnection]] describe structural nodes or point supports.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralItem', 'IfcStructuralConnection', 'IfcStructuralPointConnection'],
  },

  IFCSTRUCTURALPOINTREACTION: {
    name:        'IfcStructuralPointReaction',
    label:       'Structural Point Reaction',
    description: 'This entity defines a reaction which occurs at a point. A point reaction is typically connected with a point connection. It may also be connected with a curve member or curve connection, or surface me',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralActivity', 'IfcStructuralReaction', 'IfcStructuralPointReaction'],
  },

  IFCSTRUCTURALREACTION: {
    name:        'IfcStructuralReaction',
    label:       'Structural Reaction',
    description: 'A structural reaction is a structural activity that results from a structural action imposed to a structural item or building element. Examples are support reactions, internal forces, and deflections.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralActivity', 'IfcStructuralReaction'],
  },

  IFCSTRUCTURALRESULTGROUP: {
    name:        'IfcStructuralResultGroup',
    label:       'Structural Result Group',
    description: 'Instances of the entity [[IfcStructuralResultGroup]] are used to group results of structural analysis calculations and to capture the connection to the underlying basic load group. The basic functiona',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcStructuralResultGroup'],
  },

  IFCSTRUCTURALSURFACEACTION: {
    name:        'IfcStructuralSurfaceAction',
    label:       'Structural Surface Action',
    description: 'This entity defines an action which is distributed over a surface. A surface action may be connected with a surface member or surface connection.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralActivity', 'IfcStructuralAction', 'IfcStructuralSurfaceAction'],
  },

  IFCSTRUCTURALSURFACEACTIONBILINEAR: {
    name:        'IfcStructuralSurfaceActionBILINEAR',
    label:       'Bilinear',
    description: 'The load value is bilinearly distributed over the load\\\'s extent.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralActivity', 'IfcStructuralAction', 'IfcStructuralSurfaceAction', 'IfcStructuralSurfaceActionBILINEAR'],
  },

  IFCSTRUCTURALSURFACEACTIONCONST: {
    name:        'IfcStructuralSurfaceActionCONST',
    label:       'Const',
    description: 'The load has a constant value over its entire extent.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralActivity', 'IfcStructuralAction', 'IfcStructuralSurfaceAction', 'IfcStructuralSurfaceActionCONST'],
  },

  IFCSTRUCTURALSURFACEACTIONDISCRETE: {
    name:        'IfcStructuralSurfaceActionDISCRETE',
    label:       'Discrete',
    description: 'The load is specified as a series of discrete load points.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralActivity', 'IfcStructuralAction', 'IfcStructuralSurfaceAction', 'IfcStructuralSurfaceActionDISCRETE'],
  },

  IFCSTRUCTURALSURFACEACTIONISOCONTOUR: {
    name:        'IfcStructuralSurfaceActionISOCONTOUR',
    label:       'Isocontour',
    description: 'The load is specified by a series of iso-curves (level sets), i.e. curves at which the load value is constant. These curves run perpendicularly to the load gradient.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralActivity', 'IfcStructuralAction', 'IfcStructuralSurfaceAction', 'IfcStructuralSurfaceActionISOCONTOUR'],
  },

  IFCSTRUCTURALSURFACECONNECTION: {
    name:        'IfcStructuralSurfaceConnection',
    label:       'Structural Surface Connection',
    description: 'Instances of [[IfcStructuralSurfaceConnection]] describe face \\\'nodes\\\', i.e. faces where two or more surface members are joined, or face supports. Face surfaces may be planar or curved.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralItem', 'IfcStructuralConnection', 'IfcStructuralSurfaceConnection'],
  },

  IFCSTRUCTURALSURFACEMEMBER: {
    name:        'IfcStructuralSurfaceMember',
    label:       'Structural Surface Member',
    description: 'Instances of [[IfcStructuralSurfaceMember]] describe face members, that is, structural analysis idealizations of slabs, walls, and shells. Surface members may be planar or curved.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralItem', 'IfcStructuralMember', 'IfcStructuralSurfaceMember'],
  },

  IFCSTRUCTURALSURFACEMEMBERBENDING_ELEMENT: {
    name:        'IfcStructuralSurfaceMemberBENDING_ELEMENT',
    label:       'Bending Element',
    description: 'A member with capacity to carry out-of-plane loads, i.e. a plate.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralItem', 'IfcStructuralMember', 'IfcStructuralSurfaceMember', 'IfcStructuralSurfaceMemberBENDING_ELEMENT'],
  },

  IFCSTRUCTURALSURFACEMEMBERMEMBRANE_ELEMENT: {
    name:        'IfcStructuralSurfaceMemberMEMBRANE_ELEMENT',
    label:       'Membrane Element',
    description: 'A member with capacity to carry in-plane loads, for example a shear wall.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralItem', 'IfcStructuralMember', 'IfcStructuralSurfaceMember', 'IfcStructuralSurfaceMemberMEMBRANE_ELEMENT'],
  },

  IFCSTRUCTURALSURFACEMEMBERSHELL: {
    name:        'IfcStructuralSurfaceMemberSHELL',
    label:       'Shell',
    description: 'A member with capacity to carry in-plane and out-of-plane loads, i.e. a combination of bending element and membrane element.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralItem', 'IfcStructuralMember', 'IfcStructuralSurfaceMember', 'IfcStructuralSurfaceMemberSHELL'],
  },

  IFCSTRUCTURALSURFACEMEMBERVARYING: {
    name:        'IfcStructuralSurfaceMemberVarying',
    label:       'Structural Surface Member Varying',
    description: 'This entity describes surface members with varying section properties. The properties are provided by means of [[Pset_StructuralSurfaceMemberVaryingThickness]] via IfcRelDefinesByProperties,An instanc',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralItem', 'IfcStructuralMember', 'IfcStructuralSurfaceMember', 'IfcStructuralSurfaceMemberVarying'],
  },

  IFCSTRUCTURALSURFACEREACTION: {
    name:        'IfcStructuralSurfaceReaction',
    label:       'Structural Surface Reaction',
    description: 'This entity defines a reaction which occurs distributed over a surface. A surface reaction may be connected with a surface member or surface connection.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralActivity', 'IfcStructuralReaction', 'IfcStructuralSurfaceReaction'],
  },

  IFCSTRUCTURALSURFACEREACTIONBILINEAR: {
    name:        'IfcStructuralSurfaceReactionBILINEAR',
    label:       'Bilinear',
    description: 'The load value is bilinearly distributed over the load\\\'s extent.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralActivity', 'IfcStructuralReaction', 'IfcStructuralSurfaceReaction', 'IfcStructuralSurfaceReactionBILINEAR'],
  },

  IFCSTRUCTURALSURFACEREACTIONCONST: {
    name:        'IfcStructuralSurfaceReactionCONST',
    label:       'Const',
    description: 'The load has a constant value over its entire extent.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralActivity', 'IfcStructuralReaction', 'IfcStructuralSurfaceReaction', 'IfcStructuralSurfaceReactionCONST'],
  },

  IFCSTRUCTURALSURFACEREACTIONDISCRETE: {
    name:        'IfcStructuralSurfaceReactionDISCRETE',
    label:       'Discrete',
    description: 'The load is specified as a series of discrete load points.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralActivity', 'IfcStructuralReaction', 'IfcStructuralSurfaceReaction', 'IfcStructuralSurfaceReactionDISCRETE'],
  },

  IFCSTRUCTURALSURFACEREACTIONISOCONTOUR: {
    name:        'IfcStructuralSurfaceReactionISOCONTOUR',
    label:       'Isocontour',
    description: 'The load is specified by a series of iso-curves (level sets), i.e. curves at which the load value is constant. These curves run perpendicularly to the load gradient.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcStructuralActivity', 'IfcStructuralReaction', 'IfcStructuralSurfaceReaction', 'IfcStructuralSurfaceReactionISOCONTOUR'],
  },

  IFCSURFACEFEATURE: {
    name:        'IfcSurfaceFeature',
    label:       'Surface Feature',
    description: 'A surface feature is a modification at (onto, or into) of the surface of an element. Parts of the surface of the entire surface may be affected. The volume and mass of the element may be increased, re',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFeatureElement', 'IfcSurfaceFeature'],
  },

  IFCSURFACEFEATUREDEFECT: {
    name:        'IfcSurfaceFeatureDEFECT',
    label:       'Defect',
    description: 'Detected defect on the surface of an element, such as corroded or eroded area.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFeatureElement', 'IfcSurfaceFeature', 'IfcSurfaceFeatureDEFECT'],
  },

  IFCSURFACEFEATUREHATCHMARKING: {
    name:        'IfcSurfaceFeatureHATCHMARKING',
    label:       'Hatch Marking',
    description: 'surface markings defined by enclosed 2d shape with defined hatch fillings.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFeatureElement', 'IfcSurfaceFeature', 'IfcSurfaceFeatureHATCHMARKING'],
  },

  IFCSURFACEFEATURELINEMARKING: {
    name:        'IfcSurfaceFeatureLINEMARKING',
    label:       'Line Marking',
    description: '2D lines painted on pavement surfaces to form boundaries, centrelines and edge markings.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFeatureElement', 'IfcSurfaceFeature', 'IfcSurfaceFeatureLINEMARKING'],
  },

  IFCSURFACEFEATUREMARK: {
    name:        'IfcSurfaceFeatureMARK',
    label:       'Mark',
    description: 'A point, line, cross, or other mark, applied for example for easier adjustment of elements during assembly.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFeatureElement', 'IfcSurfaceFeature', 'IfcSurfaceFeatureMARK'],
  },

  IFCSURFACEFEATURENONSKIDSURFACING: {
    name:        'IfcSurfaceFeatureNONSKIDSURFACING',
    label:       'Nonskid Surfacing',
    description: 'Paint or surfacing to prevent sliding or skidding.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFeatureElement', 'IfcSurfaceFeature', 'IfcSurfaceFeatureNONSKIDSURFACING'],
  },

  IFCSURFACEFEATUREPAVEMENTSURFACEMARKING: {
    name:        'IfcSurfaceFeaturePAVEMENTSURFACEMARKING',
    label:       'Pavement Surface Marking',
    description: 'Painted or chemical lines or symbols on the surface of pavements (a road or paved area)',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFeatureElement', 'IfcSurfaceFeature', 'IfcSurfaceFeaturePAVEMENTSURFACEMARKING'],
  },

  IFCSURFACEFEATURERUMBLESTRIP: {
    name:        'IfcSurfaceFeatureRUMBLESTRIP',
    label:       'Rumble Strip',
    description: 'Raised and often textured strips on road center line or on shoulder, or across lanes to alert drivers by vibration and noise. Also Jiggle bars.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFeatureElement', 'IfcSurfaceFeature', 'IfcSurfaceFeatureRUMBLESTRIP'],
  },

  IFCSURFACEFEATURESYMBOLMARKING: {
    name:        'IfcSurfaceFeatureSYMBOLMARKING',
    label:       'Symbol Marking',
    description: 'Surface markings that convey information in the form of symbols and shapes such as arrows, text or pictorial symbols.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFeatureElement', 'IfcSurfaceFeature', 'IfcSurfaceFeatureSYMBOLMARKING'],
  },

  IFCSURFACEFEATURETAG: {
    name:        'IfcSurfaceFeatureTAG',
    label:       'Tag',
    description: 'A name tag, which allows to identify an element during production, delivery and assembly. May be manufactured in different ways, e.g. by printing or punching the tracking code onto the element or by a',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFeatureElement', 'IfcSurfaceFeature', 'IfcSurfaceFeatureTAG'],
  },

  IFCSURFACEFEATURETRANSVERSERUMBLESTRIP: {
    name:        'IfcSurfaceFeatureTRANSVERSERUMBLESTRIP',
    label:       'Transverse Rumble Strip',
    description: '[[Type]] of rumble strip running across lane(s).',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFeatureElement', 'IfcSurfaceFeature', 'IfcSurfaceFeatureTRANSVERSERUMBLESTRIP'],
  },

  IFCSURFACEFEATURETREATMENT: {
    name:        'IfcSurfaceFeatureTREATMENT',
    label:       'Treatment',
    description: 'A subtractive surface feature, e.g. grinding, or an additive surface feature, e.g. coating, or an impregnating treatment, or a series of any of these kinds of treatments.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFeatureElement', 'IfcSurfaceFeature', 'IfcSurfaceFeatureTREATMENT'],
  },

  IFCSWITCHINGDEVICE: {
    name:        'IfcSwitchingDevice',
    label:       'Switching Device',
    description: 'A switch is used in a cable distribution system (electrical circuit) to control or modulate the flow of electricity.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcSwitchingDevice'],
  },

  IFCSWITCHINGDEVICECONTACTOR: {
    name:        'IfcSwitchingDeviceCONTACTOR',
    label:       'Contact or',
    description: 'An electrical device used to control the flow of power in a circuit on or off.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcSwitchingDevice', 'IfcSwitchingDeviceCONTACTOR'],
  },

  IFCSWITCHINGDEVICEDIMMERSWITCH: {
    name:        'IfcSwitchingDeviceDIMMERSWITCH',
    label:       'Dimmer Switch',
    description: 'A dimmer switch has variable positions, and may adjust electrical power or other setting (according to the switched port type).',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcSwitchingDevice', 'IfcSwitchingDeviceDIMMERSWITCH'],
  },

  IFCSWITCHINGDEVICEEMERGENCYSTOP: {
    name:        'IfcSwitchingDeviceEMERGENCYSTOP',
    label:       'Emergency Stop',
    description: 'An emergency stop device acts to remove as quickly as possible any danger that may have arisen unexpectedly.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcSwitchingDevice', 'IfcSwitchingDeviceEMERGENCYSTOP'],
  },

  IFCSWITCHINGDEVICEKEYPAD: {
    name:        'IfcSwitchingDeviceKEYPAD',
    label:       'Key Pad',
    description: 'A set of buttons or switches, each potentially applicable to a different device.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcSwitchingDevice', 'IfcSwitchingDeviceKEYPAD'],
  },

  IFCSWITCHINGDEVICEMOMENTARYSWITCH: {
    name:        'IfcSwitchingDeviceMOMENTARYSWITCH',
    label:       'Momentary Switch',
    description: 'A momentary switch has no position, and may trigger some action to occur.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcSwitchingDevice', 'IfcSwitchingDeviceMOMENTARYSWITCH'],
  },

  IFCSWITCHINGDEVICERELAY: {
    name:        'IfcSwitchingDeviceRELAY',
    label:       'Relay',
    description: 'A device designed to produce sudden predetermined changes in one or more electric output circuits, when certain conditions are fulfilled in the electric input circuits controlling the device.;definiti',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcSwitchingDevice', 'IfcSwitchingDeviceRELAY'],
  },

  IFCSWITCHINGDEVICESELECTORSWITCH: {
    name:        'IfcSwitchingDeviceSELECTORSWITCH',
    label:       'Selector Switch',
    description: 'A selector switch has multiple positions, and may change the source or level of power or other setting (according to the switched port type).',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcSwitchingDevice', 'IfcSwitchingDeviceSELECTORSWITCH'],
  },

  IFCSWITCHINGDEVICESTARTER: {
    name:        'IfcSwitchingDeviceSTARTER',
    label:       'Starter',
    description: 'A starter is a switch which in the closed position controls the application of power to an electrical device.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcSwitchingDevice', 'IfcSwitchingDeviceSTARTER'],
  },

  IFCSWITCHINGDEVICESTART_AND_STOP_EQUIPMENT: {
    name:        'IfcSwitchingDeviceSTART_AND_STOP_EQUIPMENT',
    label:       'Start and Stop Equipment',
    description: 'A switch for alternatively closing and opening one or more electric circuits.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcSwitchingDevice', 'IfcSwitchingDeviceSTART_AND_STOP_EQUIPMENT'],
  },

  IFCSWITCHINGDEVICESWITCHDISCONNECTOR: {
    name:        'IfcSwitchingDeviceSWITCHDISCONNECTOR',
    label:       'Switch Disconnector',
    description: 'A switch disconnector is a switch which in the open position satisfies the isolating requirements specified for a disconnector.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcSwitchingDevice', 'IfcSwitchingDeviceSWITCHDISCONNECTOR'],
  },

  IFCSWITCHINGDEVICETOGGLESWITCH: {
    name:        'IfcSwitchingDeviceTOGGLESWITCH',
    label:       'Toggle Switch',
    description: 'A toggle switch has two positions, and may enable or isolate electrical power or other setting (according to the switched port type).',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcSwitchingDevice', 'IfcSwitchingDeviceTOGGLESWITCH'],
  },

  IFCSYSTEM: {
    name:        'IfcSystem',
    label:       'System',
    description: 'A system is an organized combination of related parts within an AEC product, composed for a common purpose or function or to provide a service. A system is essentially a functionally related aggregati',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem'],
  },

  IFCSYSTEMFURNITUREELEMENT: {
    name:        'IfcSystemFurnitureElement',
    label:       'System Furniture Element',
    description: 'A system furniture element defines components of modular furniture which are not directly placed in a building structure but aggregated inside furniture.',
    domain:      'Ausstattung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFurnishingElement', 'IfcSystemFurnitureElement'],
  },

  IFCSYSTEMFURNITUREELEMENTPANEL: {
    name:        'IfcSystemFurnitureElementPANEL',
    label:       'Panel',
    description: 'Vertical panel used to divide work spaces.',
    domain:      'Ausstattung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFurnishingElement', 'IfcSystemFurnitureElement', 'IfcSystemFurnitureElementPANEL'],
  },

  IFCSYSTEMFURNITUREELEMENTSUBRACK: {
    name:        'IfcSystemFurnitureElementSUBRACK',
    label:       'Subrack',
    description: 'A subrack is a part of technical cabinet which is used to store and mount pluggable electric subunits.',
    domain:      'Ausstattung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFurnishingElement', 'IfcSystemFurnitureElement', 'IfcSystemFurnitureElementSUBRACK'],
  },

  IFCSYSTEMFURNITUREELEMENTWORKSURFACE: {
    name:        'IfcSystemFurnitureElementWORKSURFACE',
    label:       'Work Surface',
    description: 'Workstation countertop.',
    domain:      'Ausstattung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFurnishingElement', 'IfcSystemFurnitureElement', 'IfcSystemFurnitureElementWORKSURFACE'],
  },

  IFCTANK: {
    name:        'IfcTank',
    label:       'Tank',
    description: 'A tank is a vessel or container in which a fluid or gas is stored for later use.',
    domain:      'TGA / Speicher',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowStorageDevice', 'IfcTank'],
  },

  IFCTANKBASIN: {
    name:        'IfcTankBASIN',
    label:       'Basin',
    description: 'An arbitrary open tank type.',
    domain:      'TGA / Speicher',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowStorageDevice', 'IfcTank', 'IfcTankBASIN'],
  },

  IFCTANKBREAKPRESSURE: {
    name:        'IfcTankBREAKPRESSURE',
    label:       'Break Pressure',
    description: 'An open container that breaks the hydraulic pressure in a distribution system, typically located between the fluid reservoir and the fluid supply points. A typical break pressure tank allows the flow',
    domain:      'TGA / Speicher',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowStorageDevice', 'IfcTank', 'IfcTankBREAKPRESSURE'],
  },

  IFCTANKEXPANSION: {
    name:        'IfcTankEXPANSION',
    label:       'Expansion',
    description: 'A closed container used in a closed fluid distribution system to mitigate the effects of thermal expansion or water hammer. The tank is typically constructed with a diaphragm dividing the tank into tw',
    domain:      'TGA / Speicher',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowStorageDevice', 'IfcTank', 'IfcTankEXPANSION'],
  },

  IFCTANKFEEDANDEXPANSION: {
    name:        'IfcTankFEEDANDEXPANSION',
    label:       'Feed and Expansion',
    description: 'An open tank that is used for both storage and thermal expansion. A typical example is a tank used to store make-up water at ambient pressure for supply to a hot water system, simultaneously accommoda',
    domain:      'TGA / Speicher',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowStorageDevice', 'IfcTank', 'IfcTankFEEDANDEXPANSION'],
  },

  IFCTANKOILRETENTIONTRAY: {
    name:        'IfcTankOILRETENTIONTRAY',
    label:       'Oil Retention Tray',
    description: 'An open container for environmental protection and storage of chemical products.',
    domain:      'TGA / Speicher',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowStorageDevice', 'IfcTank', 'IfcTankOILRETENTIONTRAY'],
  },

  IFCTANKPRESSUREVESSEL: {
    name:        'IfcTankPRESSUREVESSEL',
    label:       'Pressure Vessel',
    description: 'A closed container used for storing fluids or gases at a pressure different from the ambient pressure. A pressure vessel is typically rated by an authority having jurisdiction for the operational pres',
    domain:      'TGA / Speicher',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowStorageDevice', 'IfcTank', 'IfcTankPRESSUREVESSEL'],
  },

  IFCTANKSTORAGE: {
    name:        'IfcTankSTORAGE',
    label:       'Storage',
    description: 'An open or closed container used for storing a fluid at ambient pressure and from which it can be supplied to the fluid distribution system. There are many examples of storage tanks, such as potable w',
    domain:      'TGA / Speicher',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowStorageDevice', 'IfcTank', 'IfcTankSTORAGE'],
  },

  IFCTANKVESSEL: {
    name:        'IfcTankVESSEL',
    label:       'Vessel',
    description: 'An arbitrary closed tank type.',
    domain:      'TGA / Speicher',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowStorageDevice', 'IfcTank', 'IfcTankVESSEL'],
  },

  IFCTASK: {
    name:        'IfcTask',
    label:       'Task',
    description: 'An [[IfcTask]] is an identifiable unit of work to be carried out in a construction project.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProcess', 'IfcTask'],
  },

  IFCTASKADJUSTMENT: {
    name:        'IfcTaskADJUSTMENT',
    label:       'Adjustment',
    description: 'Making changes to the physical configuration of something.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProcess', 'IfcTask', 'IfcTaskADJUSTMENT'],
  },

  IFCTASKATTENDANCE: {
    name:        'IfcTaskATTENDANCE',
    label:       'Attendance',
    description: 'Attendance or waiting on other things happening.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProcess', 'IfcTask', 'IfcTaskATTENDANCE'],
  },

  IFCTASKCALIBRATION: {
    name:        'IfcTaskCALIBRATION',
    label:       'Calibration',
    description: 'Making changes to the operational configuration of something.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProcess', 'IfcTask', 'IfcTaskCALIBRATION'],
  },

  IFCTASKCONSTRUCTION: {
    name:        'IfcTaskCONSTRUCTION',
    label:       'Construction',
    description: 'Constructing or building something.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProcess', 'IfcTask', 'IfcTaskCONSTRUCTION'],
  },

  IFCTASKDEMOLITION: {
    name:        'IfcTaskDEMOLITION',
    label:       'Demolition',
    description: 'Demolishing or breaking down something.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProcess', 'IfcTask', 'IfcTaskDEMOLITION'],
  },

  IFCTASKDISMANTLE: {
    name:        'IfcTaskDISMANTLE',
    label:       'Dismantle',
    description: 'Taking something apart carefully so that it can be recycled or reused.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProcess', 'IfcTask', 'IfcTaskDISMANTLE'],
  },

  IFCTASKDISPOSAL: {
    name:        'IfcTaskDISPOSAL',
    label:       'Disposal',
    description: 'Disposing or getting rid of something.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProcess', 'IfcTask', 'IfcTaskDISPOSAL'],
  },

  IFCTASKEMERGENCY: {
    name:        'IfcTaskEMERGENCY',
    label:       'Emergency',
    description: 'Tasks required when responding to, or ensuring the ability to respond to, an emergency situation.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProcess', 'IfcTask', 'IfcTaskEMERGENCY'],
  },

  IFCTASKINSPECTION: {
    name:        'IfcTaskINSPECTION',
    label:       'Inspection',
    description: 'Check if something is installed and is operating within expected parameters.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProcess', 'IfcTask', 'IfcTaskINSPECTION'],
  },

  IFCTASKINSTALLATION: {
    name:        'IfcTaskINSTALLATION',
    label:       'Installation',
    description: 'Installing something (equivalent to construction but more commonly used for engineering tasks).',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProcess', 'IfcTask', 'IfcTaskINSTALLATION'],
  },

  IFCTASKLOGISTIC: {
    name:        'IfcTaskLOGISTIC',
    label:       'Logistic',
    description: 'Transportation or delivery of something.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProcess', 'IfcTask', 'IfcTaskLOGISTIC'],
  },

  IFCTASKMAINTENANCE: {
    name:        'IfcTaskMAINTENANCE',
    label:       'Maintenance',
    description: 'Tasks required to keep an object in good working order.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProcess', 'IfcTask', 'IfcTaskMAINTENANCE'],
  },

  IFCTASKMOVE: {
    name:        'IfcTaskMOVE',
    label:       'Move',
    description: 'Moving things from one place to another.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProcess', 'IfcTask', 'IfcTaskMOVE'],
  },

  IFCTASKOPERATION: {
    name:        'IfcTaskOPERATION',
    label:       'Operation',
    description: 'A procedure undertaken to start up the operation an artifact.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProcess', 'IfcTask', 'IfcTaskOPERATION'],
  },

  IFCTASKREMOVAL: {
    name:        'IfcTaskREMOVAL',
    label:       'Removal',
    description: 'Removal of an item from use and taking it from its place of use.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProcess', 'IfcTask', 'IfcTaskREMOVAL'],
  },

  IFCTASKRENOVATION: {
    name:        'IfcTaskRENOVATION',
    label:       'Renovation',
    description: 'Bringing something to an \\\'as-new\\\' state.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProcess', 'IfcTask', 'IfcTaskRENOVATION'],
  },

  IFCTASKSAFETY: {
    name:        'IfcTaskSAFETY',
    label:       'Safety',
    description: 'Tasks required to ensure safe use of the object. For example electrical \\\'lock-out\\\' instructions.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProcess', 'IfcTask', 'IfcTaskSAFETY'],
  },

  IFCTASKSHUTDOWN: {
    name:        'IfcTaskSHUTDOWN',
    label:       'Shutdown',
    description: 'The set of tasks required for an orderly shut down without adverse impacts, typically applied to systems.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProcess', 'IfcTask', 'IfcTaskSHUTDOWN'],
  },

  IFCTASKSTARTUP: {
    name:        'IfcTaskSTARTUP',
    label:       'Startup',
    description: 'The set of tasks required to begin or restart operation without adverse impacts, typically applied to systems.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProcess', 'IfcTask', 'IfcTaskSTARTUP'],
  },

  IFCTASKTESTING: {
    name:        'IfcTaskTESTING',
    label:       'Testing',
    description: 'The set of tasks required to evaluate the performance of an object, to ensure if something is installed and is operating within expected parameters.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProcess', 'IfcTask', 'IfcTaskTESTING'],
  },

  IFCTASKTROUBLESHOOTING: {
    name:        'IfcTaskTROUBLESHOOTING',
    label:       'Troubleshooting',
    description: 'The set of tasks required to diagnose commonly encountered performance problems, typically applied to element types and systems.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProcess', 'IfcTask', 'IfcTaskTROUBLESHOOTING'],
  },

  IFCTENDON: {
    name:        'IfcTendon',
    label:       'Tendon',
    description: 'A tendon is a steel element such as a wire, cable, bar, rod, or strand used to impart prestress to concrete when the element is tensioned.',
    domain:      'Tragwerk / Bewehrung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcReinforcingElement', 'IfcTendon'],
  },

  IFCTENDONANCHOR: {
    name:        'IfcTendonAnchor',
    label:       'Tendon Anchor',
    description: 'A tendon anchor is the end connection for tendons in prestressed or posttensioned concrete.',
    domain:      'Tragwerk / Bewehrung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcReinforcingElement', 'IfcTendonAnchor'],
  },

  IFCTENDONANCHORCOUPLER: {
    name:        'IfcTendonAnchorCOUPLER',
    label:       'Coupler',
    description: 'The anchor is an intermediate device which connects two tendons.',
    domain:      'Tragwerk / Bewehrung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcReinforcingElement', 'IfcTendonAnchor', 'IfcTendonAnchorCOUPLER'],
  },

  IFCTENDONANCHORFIXED_END: {
    name:        'IfcTendonAnchorFIXED_END',
    label:       'Fixed End',
    description: 'The anchor fixes the end of a tendon.',
    domain:      'Tragwerk / Bewehrung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcReinforcingElement', 'IfcTendonAnchor', 'IfcTendonAnchorFIXED_END'],
  },

  IFCTENDONANCHORTENSIONING_END: {
    name:        'IfcTendonAnchorTENSIONING_END',
    label:       'Tensioning End',
    description: 'The anchor is used or can be used to prestress the tendon.',
    domain:      'Tragwerk / Bewehrung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcReinforcingElement', 'IfcTendonAnchor', 'IfcTendonAnchorTENSIONING_END'],
  },

  IFCTENDONBAR: {
    name:        'IfcTendonBAR',
    label:       'Bar',
    description: 'The tendon is configured as a bar.',
    domain:      'Tragwerk / Bewehrung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcReinforcingElement', 'IfcTendon', 'IfcTendonBAR'],
  },

  IFCTENDONCOATED: {
    name:        'IfcTendonCOATED',
    label:       'Coated',
    description: 'The tendon is coated.',
    domain:      'Tragwerk / Bewehrung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcReinforcingElement', 'IfcTendon', 'IfcTendonCOATED'],
  },

  IFCTENDONCONDUIT: {
    name:        'IfcTendonConduit',
    label:       'Tendon Conduit',
    description: 'A TendonConduit represents the components of the conduit system for tendons embedded in concrete structure.',
    domain:      'Tragwerk / Bewehrung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcReinforcingElement', 'IfcTendonConduit'],
  },

  IFCTENDONCONDUITCOUPLER: {
    name:        'IfcTendonConduitCOUPLER',
    label:       'Coupler',
    description: 'A part to connect the conduits located in two different deck segments and related to the same tendon.',
    domain:      'Tragwerk / Bewehrung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcReinforcingElement', 'IfcTendonConduit', 'IfcTendonConduitCOUPLER'],
  },

  IFCTENDONCONDUITDIABOLO: {
    name:        'IfcTendonConduitDIABOLO',
    label:       'Diabolo',
    description: 'A part of tendon conduit associated to deviator.',
    domain:      'Tragwerk / Bewehrung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcReinforcingElement', 'IfcTendonConduit', 'IfcTendonConduitDIABOLO'],
  },

  IFCTENDONCONDUITDUCT: {
    name:        'IfcTendonConduitDUCT',
    label:       'Duct',
    description: 'A Sleeve or duct is related to the thickness of the conduit depending on the conduit, either cast into the concrete structure or placed adjacent to it.',
    domain:      'Tragwerk / Bewehrung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcReinforcingElement', 'IfcTendonConduit', 'IfcTendonConduitDUCT'],
  },

  IFCTENDONCONDUITGROUTING_DUCT: {
    name:        'IfcTendonConduitGROUTING_DUCT',
    label:       'Grouting Duct',
    description: 'An additional small conduit connected to the main conduit to allow grouting in case of bonded post-tensioning, such as Grout inlet, Grout outlet and Grout vent.',
    domain:      'Tragwerk / Bewehrung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcReinforcingElement', 'IfcTendonConduit', 'IfcTendonConduitGROUTING_DUCT'],
  },

  IFCTENDONCONDUITTRUMPET: {
    name:        'IfcTendonConduitTRUMPET',
    label:       'Trumpet',
    description: 'A specific part of conduit which has to be widened when reaching the tendon anchor because the strands are connected individually on the anchor.',
    domain:      'Tragwerk / Bewehrung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcReinforcingElement', 'IfcTendonConduit', 'IfcTendonConduitTRUMPET'],
  },

  IFCTENDONSTRAND: {
    name:        'IfcTendonSTRAND',
    label:       'Strand',
    description: 'The tendon is a strand.',
    domain:      'Tragwerk / Bewehrung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcReinforcingElement', 'IfcTendon', 'IfcTendonSTRAND'],
  },

  IFCTENDONWIRE: {
    name:        'IfcTendonWIRE',
    label:       'Wire',
    description: 'The tendon is a wire.',
    domain:      'Tragwerk / Bewehrung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcReinforcingElement', 'IfcTendon', 'IfcTendonWIRE'],
  },

  IFCTEXTURECOORDINATEINDICES: {
    name:        'IfcTextureCoordinateIndices',
    label:       'Texture Coordinate Indices',
    description: 'The [[IfcTextureCoordinateIndices]] provide the texture coordinates for an IfcIndexedPolygonalFace. The [[TexCoordIndex]] holds a list of indices pointing into the IfcTextureVertexList for texture coo',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcTextureCoordinateIndices'],
  },

  IFCTEXTURECOORDINATEINDICESWITHVOIDS: {
    name:        'IfcTextureCoordinateIndicesWithVoids',
    label:       'Texture Coordinate Indices with Voids',
    description: 'The [[IfcTextureCoordinateIndicesWithVoids]] is a subtype of [[IfcTextureCoordinateIndices]] to be used to provide texture coordinates to polygonal faces with inner loops.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcTextureCoordinateIndices', 'IfcTextureCoordinateIndicesWithVoids'],
  },

  IFCTRACKELEMENT: {
    name:        'IfcTrackElement',
    label:       'Track Element',
    description: 'A track element is a built element used specifically in the track domain in railway.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcTrackElement'],
  },

  IFCTRACKELEMENTBLOCKINGDEVICE: {
    name:        'IfcTrackElementBLOCKINGDEVICE',
    label:       'Blocking Device',
    description: 'A device composed of pneumatic, mechanic or electric components causing the braking of a train in case of emergency.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcTrackElement', 'IfcTrackElementBLOCKINGDEVICE'],
  },

  IFCTRACKELEMENTDERAILER: {
    name:        'IfcTrackElementDERAILER',
    label:       'Derailer',
    description: 'A fixed device which, when placed on the rail, derails the wheels of a vehicle, and serves to protect a converging line.;definition from IEC 60050-821.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcTrackElement', 'IfcTrackElementDERAILER'],
  },

  IFCTRACKELEMENTFROG: {
    name:        'IfcTrackElementFROG',
    label:       'Frog',
    description: 'A frog is an arrangement ensuring the intersection of two opposite running edges of turnouts or diamond crossings and having one crossing vee and two wing rails.;definition from EN 13232-1-2004.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcTrackElement', 'IfcTrackElementFROG'],
  },

  IFCTRACKELEMENTHALF_SET_OF_BLADES: {
    name:        'IfcTrackElementHALF_SET_OF_BLADES',
    label:       'Half Set of Blades',
    description: 'A half set of blades consists of one stock rail and its switch rail complete with small fittings. It is right or left hand as seen by an observer in the centre of the track facing the switch heel from',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcTrackElement', 'IfcTrackElementHALF_SET_OF_BLADES'],
  },

  IFCTRACKELEMENTSLEEPER: {
    name:        'IfcTrackElementSLEEPER',
    label:       'Sleeper',
    description: 'A sleeper is a track element that supports running rails, guard rails and check rails usually at right angles to its axis.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcTrackElement', 'IfcTrackElementSLEEPER'],
  },

  IFCTRACKELEMENTSPEEDREGULATOR: {
    name:        'IfcTrackElementSPEEDREGULATOR',
    label:       'Speed Regulator',
    description: 'A device composed of pneumatic, mechanic or electric components causing the breaking of a train in case of emergency.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcTrackElement', 'IfcTrackElementSPEEDREGULATOR'],
  },

  IFCTRACKELEMENTTRACKENDOFALIGNMENT: {
    name:        'IfcTrackElementTRACKENDOFALIGNMENT',
    label:       'Track End of Alignment',
    description: 'A track end of alignment is a special functional installation such as axle-gauge changeover point or transporter wagon loading point.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcTrackElement', 'IfcTrackElementTRACKENDOFALIGNMENT'],
  },

  IFCTRACKELEMENTVEHICLESTOP: {
    name:        'IfcTrackElementVEHICLESTOP',
    label:       'Vehicle Stop',
    description: 'A fixed installation at the end of the track which stops any vehicle movement (e.g., buffer stop, sand hump, etc.).',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcTrackElement', 'IfcTrackElementVEHICLESTOP'],
  },

  IFCTRANSFORMER: {
    name:        'IfcTransformer',
    label:       'Transformer',
    description: 'A transformer is an inductive stationary device that transfers electrical energy from one circuit to another.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcTransformer'],
  },

  IFCTRANSFORMERCHOPPER: {
    name:        'IfcTransformerCHOPPER',
    label:       'Chopper',
    description: 'A chopper is an electronic power DC convertor without an intermediate AC link giving a variable output voltage by varying the periods of conduction and non-conduction in an adjustable ratio.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcTransformer', 'IfcTransformerCHOPPER'],
  },

  IFCTRANSFORMERCOMBINED: {
    name:        'IfcTransformerCOMBINED',
    label:       'Combined',
    description: 'A transformer that changes different quantities between circuits.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcTransformer', 'IfcTransformerCOMBINED'],
  },

  IFCTRANSFORMERCURRENT: {
    name:        'IfcTransformerCURRENT',
    label:       'Current',
    description: 'A transformer that changes the current between circuits.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcTransformer', 'IfcTransformerCURRENT'],
  },

  IFCTRANSFORMERFREQUENCY: {
    name:        'IfcTransformerFREQUENCY',
    label:       'Frequency',
    description: 'A transformer that changes the frequency between circuits.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcTransformer', 'IfcTransformerFREQUENCY'],
  },

  IFCTRANSFORMERINVERTER: {
    name:        'IfcTransformerINVERTER',
    label:       'Inverter',
    description: 'A transformer that converts from direct current (DC) to alternating current (AC).',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcTransformer', 'IfcTransformerINVERTER'],
  },

  IFCTRANSFORMERRECTIFIER: {
    name:        'IfcTransformerRECTIFIER',
    label:       'Rectifier',
    description: 'A transformer that converts from alternating current (AC) to direct current (DC).',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcTransformer', 'IfcTransformerRECTIFIER'],
  },

  IFCTRANSFORMERVOLTAGE: {
    name:        'IfcTransformerVOLTAGE',
    label:       'Voltage',
    description: 'A transformer that changes the voltage between circuits.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcTransformer', 'IfcTransformerVOLTAGE'],
  },

  IFCTRANSPORTELEMENT: {
    name:        'IfcTransportElement',
    label:       'Transport Element',
    description: 'A transport element is a generalization of all transport related objects that move people, animals or goods within a Facility. The [[IfcTransportElement]] defines the occurrence of a transport element',
    domain:      'Förderanlagen',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcTransportationDevice', 'IfcTransportElement'],
  },

  IFCTRANSPORTELEMENTCRANEWAY: {
    name:        'IfcTransportElementCRANEWAY',
    label:       'Craneway',
    description: 'A crane way system, normally including the crane rails, fasteners and the crane. It is primarily used to move heavy goods in a factory or other industry buildings.',
    domain:      'Förderanlagen',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcTransportationDevice', 'IfcTransportElement', 'IfcTransportElementCRANEWAY'],
  },

  IFCTRANSPORTELEMENTELEVATOR: {
    name:        'IfcTransportElementELEVATOR',
    label:       'Elevator',
    description: 'Elevator or lift being a transport device to move people or goods vertically.',
    domain:      'Förderanlagen',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcTransportationDevice', 'IfcTransportElement', 'IfcTransportElementELEVATOR'],
  },

  IFCTRANSPORTELEMENTESCALATOR: {
    name:        'IfcTransportElementESCALATOR',
    label:       'Escalator',
    description: 'Escalator being a transport device to move people. It consists of individual linked steps that move up and down on tracks while keeping the threads horizontal.',
    domain:      'Förderanlagen',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcTransportationDevice', 'IfcTransportElement', 'IfcTransportElementESCALATOR'],
  },

  IFCTRANSPORTELEMENTHAULINGGEAR: {
    name:        'IfcTransportElementHAULINGGEAR',
    label:       'Hauling Gear',
    description: 'A device used for hauling goods.',
    domain:      'Förderanlagen',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcTransportationDevice', 'IfcTransportElement', 'IfcTransportElementHAULINGGEAR'],
  },

  IFCTRANSPORTELEMENTLIFTINGGEAR: {
    name:        'IfcTransportElementLIFTINGGEAR',
    label:       'Lifting Gear',
    description: 'A device used for lifting or lowering heavy goods. It may be manually operated or electrically or pneumatically driven.',
    domain:      'Förderanlagen',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcTransportationDevice', 'IfcTransportElement', 'IfcTransportElementLIFTINGGEAR'],
  },

  IFCTRANSPORTELEMENTMOVINGWALKWAY: {
    name:        'IfcTransportElementMOVINGWALKWAY',
    label:       'Moving Walkway',
    description: 'Moving walkway being a transport device to move people horizontally or on an incline. It is a slow conveyor belt that transports people.',
    domain:      'Förderanlagen',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcTransportationDevice', 'IfcTransportElement', 'IfcTransportElementMOVINGWALKWAY'],
  },

  IFCTRANSPORTATIONDEVICE: {
    name:        'IfcTransportationDevice',
    label:       'Transportation Device',
    description: 'Abstract intermediate supertype for transportation devices.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcTransportationDevice'],
  },

  IFCTUBEBUNDLE: {
    name:        'IfcTubeBundle',
    label:       'Tube Bundle',
    description: 'A tube bundle is a device consisting of tubes and bundles of tubes used for heat transfer and contained typically within other energy conversion devices, such as a chiller or coil.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcTubeBundle'],
  },

  IFCTUBEBUNDLEFINNED: {
    name:        'IfcTubeBundleFINNED',
    label:       'Finned',
    description: 'Finned tube bundle type.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcTubeBundle', 'IfcTubeBundleFINNED'],
  },

  IFCUNITARYCONTROLELEMENT: {
    name:        'IfcUnitaryControlElement',
    label:       'Unitary Control Element',
    description: 'A unitary control element combines a number of control components into a single product, such as a thermostat or humidistat.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcUnitaryControlElement'],
  },

  IFCUNITARYCONTROLELEMENTALARMPANEL: {
    name:        'IfcUnitaryControlElementALARMPANEL',
    label:       'Alarm Panel',
    description: 'A control element at which alarms are annunciated.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcUnitaryControlElement', 'IfcUnitaryControlElementALARMPANEL'],
  },

  IFCUNITARYCONTROLELEMENTBASESTATIONCONTROLLER: {
    name:        'IfcUnitaryControlElementBASESTATIONCONTROLLER',
    label:       'Base Station Controller',
    description: 'A base station controller (BSC) is a network component with the functions for controlling one or more base transceiver stations. BSC is responsible for the management of various interfaces, wireless r',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcUnitaryControlElement', 'IfcUnitaryControlElementBASESTATIONCONTROLLER'],
  },

  IFCUNITARYCONTROLELEMENTCOMBINED: {
    name:        'IfcUnitaryControlElementCOMBINED',
    label:       'Combined',
    description: 'Combination of at least two predefined types of unitary control element.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcUnitaryControlElement', 'IfcUnitaryControlElementCOMBINED'],
  },

  IFCUNITARYCONTROLELEMENTCONTROLPANEL: {
    name:        'IfcUnitaryControlElementCONTROLPANEL',
    label:       'Control Panel',
    description: 'A control element at which devices that control or monitor the operation of a site, building or part of a building are located',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcUnitaryControlElement', 'IfcUnitaryControlElementCONTROLPANEL'],
  },

  IFCUNITARYCONTROLELEMENTGASDETECTIONPANEL: {
    name:        'IfcUnitaryControlElementGASDETECTIONPANEL',
    label:       'Gas Detection Panel',
    description: 'A control element at which the detection of gas is annunciated.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcUnitaryControlElement', 'IfcUnitaryControlElementGASDETECTIONPANEL'],
  },

  IFCUNITARYCONTROLELEMENTHUMIDISTAT: {
    name:        'IfcUnitaryControlElementHUMIDISTAT',
    label:       'Humidistat',
    description: 'A control element that senses and regulates the humidity of a system or space so that the humidity is maintained near a desired setpoint.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcUnitaryControlElement', 'IfcUnitaryControlElementHUMIDISTAT'],
  },

  IFCUNITARYCONTROLELEMENTINDICATORPANEL: {
    name:        'IfcUnitaryControlElementINDICATORPANEL',
    label:       'Indicator Panel',
    description: 'A control element at which equipment operational status, condition, safety state or other required parameters are indicated.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcUnitaryControlElement', 'IfcUnitaryControlElementINDICATORPANEL'],
  },

  IFCUNITARYCONTROLELEMENTMIMICPANEL: {
    name:        'IfcUnitaryControlElementMIMICPANEL',
    label:       'Mimic Panel',
    description: 'A control element at which information that is available elsewhere is repeated or \\\'mimicked\\\'.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcUnitaryControlElement', 'IfcUnitaryControlElementMIMICPANEL'],
  },

  IFCUNITARYCONTROLELEMENTTHERMOSTAT: {
    name:        'IfcUnitaryControlElementTHERMOSTAT',
    label:       'Thermostat',
    description: 'A control element that senses and regulates the temperature of an element, system or space so that the temperature is maintained near a desired setpoint.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcUnitaryControlElement', 'IfcUnitaryControlElementTHERMOSTAT'],
  },

  IFCUNITARYCONTROLELEMENTWEATHERSTATION: {
    name:        'IfcUnitaryControlElementWEATHERSTATION',
    label:       'Weather Station',
    description: 'A control element that senses multiple climate properties such as temperature, humidity, pressure, wind, and rain.',
    domain:      'TGA / Gebäudeautomation',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionControlElement', 'IfcUnitaryControlElement', 'IfcUnitaryControlElementWEATHERSTATION'],
  },

  IFCUNITARYEQUIPMENT: {
    name:        'IfcUnitaryEquipment',
    label:       'Unitary Equipment',
    description: 'Unitary equipment typically combine a number of components into a single product, such as air handlers, pre-packaged rooftop air-conditioning units, heat pumps, and split systems.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcUnitaryEquipment'],
  },

  IFCUNITARYEQUIPMENTAIRCONDITIONINGUNIT: {
    name:        'IfcUnitaryEquipmentAIRCONDITIONINGUNIT',
    label:       'Air Conditioning Unit',
    description: 'A unitary packaged air-conditioning unit typically used in residential or light commercial applications.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcUnitaryEquipment', 'IfcUnitaryEquipmentAIRCONDITIONINGUNIT'],
  },

  IFCUNITARYEQUIPMENTAIRHANDLER: {
    name:        'IfcUnitaryEquipmentAIRHANDLER',
    label:       'Air Handler',
    description: 'A unitary air handling unit typically containing a fan, economizer, and coils.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcUnitaryEquipment', 'IfcUnitaryEquipmentAIRHANDLER'],
  },

  IFCUNITARYEQUIPMENTDEHUMIDIFIER: {
    name:        'IfcUnitaryEquipmentDEHUMIDIFIER',
    label:       'Dehumidifier',
    description: 'A unitary packaged dehumidification unit.units supporting multiple modes (dehumidification, cooling, and/or heating) should use AIRCONDITIONINGUNIT.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcUnitaryEquipment', 'IfcUnitaryEquipmentDEHUMIDIFIER'],
  },

  IFCUNITARYEQUIPMENTROOFTOPUNIT: {
    name:        'IfcUnitaryEquipmentROOFTOPUNIT',
    label:       'Roof Top Unit',
    description: 'A packaged assembly that is either field-erected or manufactured atop the roof of a large residential or commercial building and acts as a unitary component.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcUnitaryEquipment', 'IfcUnitaryEquipmentROOFTOPUNIT'],
  },

  IFCUNITARYEQUIPMENTSPLITSYSTEM: {
    name:        'IfcUnitaryEquipmentSPLITSYSTEM',
    label:       'Split System',
    description: 'A system which separates the compressor from the evaporator, but acts as a unitary component typically within residential or light commercial applications.',
    domain:      'TGA / Energieumwandlung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcEnergyConversionDevice', 'IfcUnitaryEquipment', 'IfcUnitaryEquipmentSPLITSYSTEM'],
  },

  IFCVALVE: {
    name:        'IfcValve',
    label:       'Valve',
    description: 'A valve is used in a building services piping distribution system to control or modulate the flow of the fluid.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcValve'],
  },

  IFCVALVEAIRRELEASE: {
    name:        'IfcValveAIRRELEASE',
    label:       'Air Release',
    description: 'Valve used to release air from a pipe or fitting.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcValve', 'IfcValveAIRRELEASE'],
  },

  IFCVALVEANTIVACUUM: {
    name:        'IfcValveANTIVACUUM',
    label:       'Anti Vacuum',
    description: 'Valve that opens to admit air if the pressure falls below atmospheric pressure.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcValve', 'IfcValveANTIVACUUM'],
  },

  IFCVALVECHANGEOVER: {
    name:        'IfcValveCHANGEOVER',
    label:       'Change Over',
    description: 'Valve that enables flow to be switched between pipelines (3 or 4 port).',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcValve', 'IfcValveCHANGEOVER'],
  },

  IFCVALVECHECK: {
    name:        'IfcValveCHECK',
    label:       'Check',
    description: 'Valve that permits water to flow in one direction only and is enclosed when there is no flow (2 port).',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcValve', 'IfcValveCHECK'],
  },

  IFCVALVECOMMISSIONING: {
    name:        'IfcValveCOMMISSIONING',
    label:       'Commissioning',
    description: 'Valve used to facilitate commissioning of a system (2 port).',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcValve', 'IfcValveCOMMISSIONING'],
  },

  IFCVALVEDIVERTING: {
    name:        'IfcValveDIVERTING',
    label:       'Diverting',
    description: 'Valve that enables flow to be diverted from one branch of a pipeline to another (3 port).',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcValve', 'IfcValveDIVERTING'],
  },

  IFCVALVEDOUBLECHECK: {
    name:        'IfcValveDOUBLECHECK',
    label:       'Double Check',
    description: 'An assembly that incorporates two valves used to prevent backflow.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcValve', 'IfcValveDOUBLECHECK'],
  },

  IFCVALVEDOUBLEREGULATING: {
    name:        'IfcValveDOUBLEREGULATING',
    label:       'Double Regulating',
    description: 'Valve used to facilitate regulation of fluid flow in a system.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcValve', 'IfcValveDOUBLEREGULATING'],
  },

  IFCVALVEDRAWOFFCOCK: {
    name:        'IfcValveDRAWOFFCOCK',
    label:       'Draw Off Cock',
    description: 'A valve used to remove fluid from a piping system.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcValve', 'IfcValveDRAWOFFCOCK'],
  },

  IFCVALVEFAUCET: {
    name:        'IfcValveFAUCET',
    label:       'Faucet',
    description: 'Faucet valve typically used as a flow discharge.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcValve', 'IfcValveFAUCET'],
  },

  IFCVALVEFLUSHING: {
    name:        'IfcValveFLUSHING',
    label:       'Flushing',
    description: 'Valve that flushes a predetermined quantity of water to cleanse a toilet, urinal, etc.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcValve', 'IfcValveFLUSHING'],
  },

  IFCVALVEGASCOCK: {
    name:        'IfcValveGASCOCK',
    label:       'Gas Cock',
    description: 'Valve that is used for controlling the flow of gas.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcValve', 'IfcValveGASCOCK'],
  },

  IFCVALVEGASTAP: {
    name:        'IfcValveGASTAP',
    label:       'Gas Tap',
    description: 'Gas tap typically used for venting or discharging gas from a system.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcValve', 'IfcValveGASTAP'],
  },

  IFCVALVEISOLATING: {
    name:        'IfcValveISOLATING',
    label:       'Isolating',
    description: 'Valve that closes off flow in a pipeline.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcValve', 'IfcValveISOLATING'],
  },

  IFCVALVEMIXING: {
    name:        'IfcValveMIXING',
    label:       'Mixing',
    description: 'Valve that enables flow from two branches of a pipeline to be mixed together (3 port).',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcValve', 'IfcValveMIXING'],
  },

  IFCVALVEPRESSUREREDUCING: {
    name:        'IfcValvePRESSUREREDUCING',
    label:       'Pressure Reducing',
    description: 'Valve that reduces the pressure of a fluid immediately downstream of its position in a pipeline to a preselected value or by a predetermined ratio.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcValve', 'IfcValvePRESSUREREDUCING'],
  },

  IFCVALVEPRESSURERELIEF: {
    name:        'IfcValvePRESSURERELIEF',
    label:       'Pressure Relief',
    description: 'Spring or weight loaded valve that automatically discharges to a safe place fluid that has built up to excessive pressure in pipes or fittings.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcValve', 'IfcValvePRESSURERELIEF'],
  },

  IFCVALVEREGULATING: {
    name:        'IfcValveREGULATING',
    label:       'Regulating',
    description: 'Valve used to facilitate regulation of fluid flow in a system.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcValve', 'IfcValveREGULATING'],
  },

  IFCVALVESAFETYCUTOFF: {
    name:        'IfcValveSAFETYCUTOFF',
    label:       'Safety Cut Off',
    description: 'Valve that closes under the action of a safety mechanism such as a drop weight, solenoid etc.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcValve', 'IfcValveSAFETYCUTOFF'],
  },

  IFCVALVESTEAMTRAP: {
    name:        'IfcValveSTEAMTRAP',
    label:       'Steamtrap',
    description: 'Valve that restricts flow of steam while allowing condensate to pass through.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcValve', 'IfcValveSTEAMTRAP'],
  },

  IFCVALVESTOPCOCK: {
    name:        'IfcValveSTOPCOCK',
    label:       'Stop Cock',
    description: 'An isolating valve used on a domestic water service.',
    domain:      'TGA / Regelung',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowController', 'IfcValve', 'IfcValveSTOPCOCK'],
  },

  IFCVEHICLE: {
    name:        'IfcVehicle',
    label:       'Vehicle',
    description: 'Piece of equipment designed to transport people or cargo.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcTransportationDevice', 'IfcVehicle'],
  },

  IFCVEHICLECARGO: {
    name:        'IfcVehicleCARGO',
    label:       'Cargo',
    description: 'A mobile transport element that represents a discrete unit of cargo managed by a facility.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcTransportationDevice', 'IfcVehicle', 'IfcVehicleCARGO'],
  },

  IFCVEHICLEROLLINGSTOCK: {
    name:        'IfcVehicleROLLINGSTOCK',
    label:       'Rolling Stock',
    description: 'Refers to railway vehicles, including both powered and unpowered vehicles, for example locomotives, railroad cars, coaches, private railroad cars and wagons.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcTransportationDevice', 'IfcVehicle', 'IfcVehicleROLLINGSTOCK'],
  },

  IFCVEHICLEVEHICLE: {
    name:        'IfcVehicleVEHICLE',
    label:       'Vehicle',
    description: 'A generalisation of a vehicle that interacts with a facility (e.g. as a user/customer) or as a specified operational asset within the facility.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcTransportationDevice', 'IfcVehicle', 'IfcVehicleVEHICLE'],
  },

  IFCVEHICLEVEHICLEAIR: {
    name:        'IfcVehicleVEHICLEAIR',
    label:       'Vehicle Air',
    description: 'A specialisation of a vehicle that represents powered and unpowered flying vehicles, such as airplanes, helicopters, gliders etc.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcTransportationDevice', 'IfcVehicle', 'IfcVehicleVEHICLEAIR'],
  },

  IFCVEHICLEVEHICLEMARINE: {
    name:        'IfcVehicleVEHICLEMARINE',
    label:       'Vehicle Marine',
    description: 'A specialisation of a vehicle that operates on water as a marine vessel.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcTransportationDevice', 'IfcVehicle', 'IfcVehicleVEHICLEMARINE'],
  },

  IFCVEHICLEVEHICLETRACKED: {
    name:        'IfcVehicleVEHICLETRACKED',
    label:       'Vehicle Tracked',
    description: 'A specialisation of a vehicle that operates on land tracked (Caterpillar).',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcTransportationDevice', 'IfcVehicle', 'IfcVehicleVEHICLETRACKED'],
  },

  IFCVEHICLEVEHICLEWHEELED: {
    name:        'IfcVehicleVEHICLEWHEELED',
    label:       'Vehicle Wheeled',
    description: 'A specialisation of a vehicle that operates on land as a multi wheeled vehicle such as a car, lorry, forklift etc.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcTransportationDevice', 'IfcVehicle', 'IfcVehicleVEHICLEWHEELED'],
  },

  IFCVIBRATIONDAMPER: {
    name:        'IfcVibrationDamper',
    label:       'Vibration Damper',
    description: 'A vibration damper is a device used to minimize the effects of vibration in a structure by dissipating kinetic energy. The damper may be passive (elastic, frictional, inertia) or active (in a system u',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcVibrationDamper'],
  },

  IFCVIBRATIONDAMPERAXIAL_YIELD: {
    name:        'IfcVibrationDamperAXIAL_YIELD',
    label:       'Axial Yield',
    description: 'A displacement dependent type damper in which the resistance force generated is determined by the plastic strain amount utilizing the plastic deformation of the steel material. The axial yield type is',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcVibrationDamper', 'IfcVibrationDamperAXIAL_YIELD'],
  },

  IFCVIBRATIONDAMPERBENDING_YIELD: {
    name:        'IfcVibrationDamperBENDING_YIELD',
    label:       'Bending Yield',
    description: 'A displacement dependent type damper in which the resistance force generated is determined by the plastic strain amount utilizing the plastic deformation of the steel material. The bending yield type',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcVibrationDamper', 'IfcVibrationDamperBENDING_YIELD'],
  },

  IFCVIBRATIONDAMPERFRICTION: {
    name:        'IfcVibrationDamperFRICTION',
    label:       'Friction',
    description: 'The friction type is a damper utilizing friction acting on the contact surface of a material.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcVibrationDamper', 'IfcVibrationDamperFRICTION'],
  },

  IFCVIBRATIONDAMPERRUBBER: {
    name:        'IfcVibrationDamperRUBBER',
    label:       'Rubber',
    description: 'The rubber mold is a damper that absorbs energy by utilizing deformation of laminated rubber. The difference between the seismic isolation bearing and the rubber type damper is whether or not to suppo',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcVibrationDamper', 'IfcVibrationDamperRUBBER'],
  },

  IFCVIBRATIONDAMPERSHEAR_YIELD: {
    name:        'IfcVibrationDamperSHEAR_YIELD',
    label:       'Shear Yield',
    description: 'A displacement dependent type damper in which the resistance force generated is determined by the plastic strain amount utilizing the plastic deformation of the steel material. The shear yield type is',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcVibrationDamper', 'IfcVibrationDamperSHEAR_YIELD'],
  },

  IFCVIBRATIONDAMPERVISCOUS: {
    name:        'IfcVibrationDamperVISCOUS',
    label:       'Viscous',
    description: 'The viscous type is a damper that absorbs energy by utilizing the resistance of a viscous body.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcVibrationDamper', 'IfcVibrationDamperVISCOUS'],
  },

  IFCVIBRATIONISOLATOR: {
    name:        'IfcVibrationIsolator',
    label:       'Vibration Isolator',
    description: 'A vibration isolator is a device used to minimize the effects of vibration transmissibility in a structure.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcVibrationIsolator'],
  },

  IFCVIBRATIONISOLATORBASE: {
    name:        'IfcVibrationIsolatorBASE',
    label:       'Base',
    description: 'Base isolator preventing transfer of energy from the ground to the structure.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcVibrationIsolator', 'IfcVibrationIsolatorBASE'],
  },

  IFCVIBRATIONISOLATORCOMPRESSION: {
    name:        'IfcVibrationIsolatorCOMPRESSION',
    label:       'Compression',
    description: 'Compression type vibration isolator.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcVibrationIsolator', 'IfcVibrationIsolatorCOMPRESSION'],
  },

  IFCVIBRATIONISOLATORSPRING: {
    name:        'IfcVibrationIsolatorSPRING',
    label:       'Spring',
    description: 'Spring type vibration isolator.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcElementComponent', 'IfcVibrationIsolator', 'IfcVibrationIsolatorSPRING'],
  },

  IFCVIRTUALELEMENT: {
    name:        'IfcVirtualElement',
    label:       'Virtual Element',
    description: 'A virtual element is a special element used to provide imaginary, placeholder, or provisional areas, volumes, and boundaries. Virtual elements are usually not displayed and do not have quantities, ass',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcVirtualElement'],
  },

  IFCVIRTUALELEMENTBOUNDARY: {
    name:        'IfcVirtualElementBOUNDARY',
    label:       'Boundary',
    description: 'An imaginary boundary, such as between two adjacent spaces that are not separated by a physical boundary.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcVirtualElement', 'IfcVirtualElementBOUNDARY'],
  },

  IFCVIRTUALELEMENTCLEARANCE: {
    name:        'IfcVirtualElementCLEARANCE',
    label:       'Clearance',
    description: 'The virtual element denotes a clearance area or volume.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcVirtualElement', 'IfcVirtualElementCLEARANCE'],
  },

  IFCVIRTUALELEMENTPROVISIONFORVOID: {
    name:        'IfcVirtualElementPROVISIONFORVOID',
    label:       'Provision for Void',
    description: 'The virtual element denotes a proposed provision for voids (an proposed opening not applied as void yet).',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcVirtualElement', 'IfcVirtualElementPROVISIONFORVOID'],
  },

  IFCVOIDINGFEATURE: {
    name:        'IfcVoidingFeature',
    label:       'Voiding Feature',
    description: 'A voiding feature is a modification of an element which reduces its volume. Such a feature may be manufactured in different ways, for example by cutting, drilling, or milling of members made of variou',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFeatureElement', 'IfcFeatureElementSubtraction', 'IfcVoidingFeature'],
  },

  IFCVOIDINGFEATURECHAMFER: {
    name:        'IfcVoidingFeatureCHAMFER',
    label:       'Chamfer',
    description: 'A skewed plane end cut, removing material only across a part of the profile of the voided element.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFeatureElement', 'IfcFeatureElementSubtraction', 'IfcVoidingFeature', 'IfcVoidingFeatureCHAMFER'],
  },

  IFCVOIDINGFEATURECUTOUT: {
    name:        'IfcVoidingFeatureCUTOUT',
    label:       'Cutout',
    description: 'An internal cutout (creating an opening) or external cutout (creating a recess) of arbitrary shape. The edges between cutting planes may be overcut or undercut, i.e. rounded.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFeatureElement', 'IfcFeatureElementSubtraction', 'IfcVoidingFeature', 'IfcVoidingFeatureCUTOUT'],
  },

  IFCVOIDINGFEATUREEDGE: {
    name:        'IfcVoidingFeatureEDGE',
    label:       'Edge',
    description: 'A shape modification along an edge of the element with the edge length as the predominant dimension of the feature, and feature profile dimensions which are typically much smaller than the edge length',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFeatureElement', 'IfcFeatureElementSubtraction', 'IfcVoidingFeature', 'IfcVoidingFeatureEDGE'],
  },

  IFCVOIDINGFEATUREHOLE: {
    name:        'IfcVoidingFeatureHOLE',
    label:       'Hole',
    description: 'A circular or slotted or threaded hole, typically but not necessarily of smaller dimension than what would be considered a cutout.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFeatureElement', 'IfcFeatureElementSubtraction', 'IfcVoidingFeature', 'IfcVoidingFeatureHOLE'],
  },

  IFCVOIDINGFEATUREMITER: {
    name:        'IfcVoidingFeatureMITER',
    label:       'Miter',
    description: 'A skewed plane end cut, removing material across the entire profile of the voided element.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFeatureElement', 'IfcFeatureElementSubtraction', 'IfcVoidingFeature', 'IfcVoidingFeatureMITER'],
  },

  IFCVOIDINGFEATURENOTCH: {
    name:        'IfcVoidingFeatureNOTCH',
    label:       'Notch',
    description: 'An external cutout of with a mostly rectangular cutting profile. The edges between cutting planes may be overcut or undercut, i.e. rounded.',
    domain:      'Bauteil',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcFeatureElement', 'IfcFeatureElementSubtraction', 'IfcVoidingFeature', 'IfcVoidingFeatureNOTCH'],
  },

  IFCWALL: {
    name:        'IfcWall',
    label:       'Wall',
    description: 'The wall represents a vertical construction that may bound or subdivide spaces. Wall are usually vertical, or nearly vertical, planar elements, often designed to bear structural loads. A wall is howev',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcWall'],
  },

  IFCWALLELEMENTEDWALL: {
    name:        'IfcWallELEMENTEDWALL',
    label:       'Elemented Wall',
    description: 'A stud wall framed with studs and faced with sheetings, sidings, wallboard, or plasterwork.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcWall', 'IfcWallELEMENTEDWALL'],
  },

  IFCWALLMOVABLE: {
    name:        'IfcWallMOVABLE',
    label:       'Movable',
    description: 'A movable wall that is either movable, such as folding wall or a sliding wall, or can be easily removed as a removable partitioning or mounting wall. Movable walls do normally not define space boundar',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcWall', 'IfcWallMOVABLE'],
  },

  IFCWALLPARAPET: {
    name:        'IfcWallPARAPET',
    label:       'Parapet',
    description: 'A wall-like barrier to protect human or vehicle from falling, or to prevent the spread of fires. Often designed at the edge of balconies, terraces or roofs, or along edges of bridges.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcWall', 'IfcWallPARAPET'],
  },

  IFCWALLPARTITIONING: {
    name:        'IfcWallPARTITIONING',
    label:       'Partitioning',
    description: 'A wall designed to partition spaces that often has a light-weight, sandwich-like construction (e.g. using gypsum board). Partitioning walls are normally non load bearing.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcWall', 'IfcWallPARTITIONING'],
  },

  IFCWALLPLUMBINGWALL: {
    name:        'IfcWallPLUMBINGWALL',
    label:       'Plumbing Wall',
    description: 'A pier, or enclosure, or encasement, normally used to enclose plumbing in sanitary rooms. Such walls often do not extend to the ceiling.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcWall', 'IfcWallPLUMBINGWALL'],
  },

  IFCWALLPOLYGONAL: {
    name:        'IfcWallPOLYGONAL',
    label:       'Polygonal',
    description: 'A polygonal wall, extruded vertically, where the wall thickness varies along the wall path.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcWall', 'IfcWallPOLYGONAL'],
  },

  IFCWALLRETAININGWALL: {
    name:        'IfcWallRETAININGWALL',
    label:       'Retaining Wall',
    description: 'A supporting wall used to protect against soil layers behind. Special types of a retaining wall may be e.g. Gabion wall and Grib wall. Examples of retaining walls are wing wall, headwall, stem wall, p',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcWall', 'IfcWallRETAININGWALL'],
  },

  IFCWALLSHEAR: {
    name:        'IfcWallSHEAR',
    label:       'Shear',
    description: 'A wall designed to withstand shear loads. Examples of shear wall are diaphragms inside a box girder, typically on a pier, to resist lateral forces and transfer them to the support.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcWall', 'IfcWallSHEAR'],
  },

  IFCWALLSOLIDWALL: {
    name:        'IfcWallSOLIDWALL',
    label:       'Solid Wall',
    description: 'A massive wall construction for the wall core being the single layer or having multiple layers attached. Such walls are often masonry or concrete walls (both cast in-situ or precast) that are load bea',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcWall', 'IfcWallSOLIDWALL'],
  },

  IFCWALLSTANDARD: {
    name:        'IfcWallSTANDARD',
    label:       'Standard',
    description: 'A standard wall, extruded vertically with a constant thickness along the wall path.;',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcWall', 'IfcWallSTANDARD'],
  },

  IFCWALLWAVEWALL: {
    name:        'IfcWallWAVEWALL',
    label:       'Wave Wall',
    description: 'Protective wall or screen to block overtopping and impact of waves across a breakwater',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcWall', 'IfcWallWAVEWALL'],
  },

  IFCWASTETERMINAL: {
    name:        'IfcWasteTerminal',
    label:       'Waste Terminal',
    description: 'A waste terminal has the purpose of collecting or intercepting waste from one or more sanitary terminals or other fluid waste generating equipment and discharging it into a single waste/drainage syste',
    domain:      'TGA / Sanitär',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcWasteTerminal'],
  },

  IFCWASTETERMINALFLOORTRAP: {
    name:        'IfcWasteTerminalFLOORTRAP',
    label:       'Floortrap',
    description: 'Pipe fitting, set into the floor, that retains liquid to prevent the passage of foul air',
    domain:      'TGA / Sanitär',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcWasteTerminal', 'IfcWasteTerminalFLOORTRAP'],
  },

  IFCWASTETERMINALFLOORWASTE: {
    name:        'IfcWasteTerminalFLOORWASTE',
    label:       'Floor Waste',
    description: 'Pipe fitting, set into the floor, that collects waste water and discharges it to a separate trap.',
    domain:      'TGA / Sanitär',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcWasteTerminal', 'IfcWasteTerminalFLOORWASTE'],
  },

  IFCWASTETERMINALGULLYSUMP: {
    name:        'IfcWasteTerminalGULLYSUMP',
    label:       'Gully Sump',
    description: 'Pipe fitting or assembly of fittings to receive surface water or waste water, fitted with a grating or sealed cover.',
    domain:      'TGA / Sanitär',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcWasteTerminal', 'IfcWasteTerminalGULLYSUMP'],
  },

  IFCWASTETERMINALGULLYTRAP: {
    name:        'IfcWasteTerminalGULLYTRAP',
    label:       'Gullytrap',
    description: 'Pipe fitting or assembly of fittings that receives surface water or waste water; fitted with a grating or sealed cover that discharges water through a trap.',
    domain:      'TGA / Sanitär',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcWasteTerminal', 'IfcWasteTerminalGULLYTRAP'],
  },

  IFCWASTETERMINALROOFDRAIN: {
    name:        'IfcWasteTerminalROOFDRAIN',
    label:       'Roofd Rain',
    description: 'Pipe fitting, set into the roof, that collects rainwater for discharge into the rainwater system.',
    domain:      'TGA / Sanitär',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcWasteTerminal', 'IfcWasteTerminalROOFDRAIN'],
  },

  IFCWASTETERMINALWASTEDISPOSALUNIT: {
    name:        'IfcWasteTerminalWASTEDISPOSALUNIT',
    label:       'Waste Disposal Unit',
    description: 'Electrically operated device that reduces kitchen or other waste into fragments small enough to be flushed into a drainage system.',
    domain:      'TGA / Sanitär',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcWasteTerminal', 'IfcWasteTerminalWASTEDISPOSALUNIT'],
  },

  IFCWASTETERMINALWASTETRAP: {
    name:        'IfcWasteTerminalWASTETRAP',
    label:       'Waste Trap',
    description: 'Pipe fitting, set adjacent to a sanitary terminal, that retains liquid to prevent the passage of foul air.',
    domain:      'TGA / Sanitär',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcDistributionElement', 'IfcDistributionFlowElement', 'IfcFlowTerminal', 'IfcWasteTerminal', 'IfcWasteTerminalWASTETRAP'],
  },

  IFCWINDOW: {
    name:        'IfcWindow',
    label:       'Window',
    description: 'The window is a building element that is predominately used to provide natural light and fresh air. It includes vertical opening but also horizontal opening such as skylights or light domes. It includ',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcWindow'],
  },

  IFCWINDOWLIGHTDOME: {
    name:        'IfcWindowLIGHTDOME',
    label:       'Light Dome',
    description: 'A special window that lies horizonally in a roof slab opening.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcWindow', 'IfcWindowLIGHTDOME'],
  },

  IFCWINDOWSKYLIGHT: {
    name:        'IfcWindowSKYLIGHT',
    label:       'Sky Light',
    description: 'A window within a sloped building element, usually a roof slab.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcWindow', 'IfcWindowSKYLIGHT'],
  },

  IFCWINDOWWINDOW: {
    name:        'IfcWindowWINDOW',
    label:       'Window',
    description: 'A standard window usually within a wall opening, as a window panel in a curtain wall, or as a \\\'free standing\\\' window.',
    domain:      'Hochbau',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuiltElement', 'IfcWindow', 'IfcWindowWINDOW'],
  },

  IFCWORKCALENDAR: {
    name:        'IfcWorkCalendar',
    label:       'Work Calendar',
    description: 'An [[IfcWorkCalendar]] defines working and non-working time periods for tasks and resources. It enables to define both specific time periods,00 on 25th August 2009, as well as repetitive time periods',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcWorkCalendar'],
  },

  IFCWORKCALENDARFIRSTSHIFT: {
    name:        'IfcWorkCalendarFIRSTSHIFT',
    label:       'First Shift',
    description: 'Belongs to the first shift.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcWorkCalendar', 'IfcWorkCalendarFIRSTSHIFT'],
  },

  IFCWORKCALENDARSECONDSHIFT: {
    name:        'IfcWorkCalendarSECONDSHIFT',
    label:       'Second Shift',
    description: 'Belongs to the second shift.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcWorkCalendar', 'IfcWorkCalendarSECONDSHIFT'],
  },

  IFCWORKCALENDARTHIRDSHIFT: {
    name:        'IfcWorkCalendarTHIRDSHIFT',
    label:       'Third Shift',
    description: 'Belongs to the third shift.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcWorkCalendar', 'IfcWorkCalendarTHIRDSHIFT'],
  },

  IFCWORKCONTROL: {
    name:        'IfcWorkControl',
    label:       'Work Control',
    description: 'An [[IfcWorkControl]] is an abstract supertype which captures information that is common to both [[IfcWorkPlan]] and [[IfcWorkSchedule]].',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcWorkControl'],
  },

  IFCWORKPLAN: {
    name:        'IfcWorkPlan',
    label:       'Work Plan',
    description: 'An [[IfcWorkPlan]] represents work plans in a construction or a facilities management project.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcWorkControl', 'IfcWorkPlan'],
  },

  IFCWORKPLANACTUAL: {
    name:        'IfcWorkPlanACTUAL',
    label:       'Actual',
    description: 'A control in which actual items undertaken are indicated.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcWorkControl', 'IfcWorkPlan', 'IfcWorkPlanACTUAL'],
  },

  IFCWORKPLANBASELINE: {
    name:        'IfcWorkPlanBASELINE',
    label:       'Baseline',
    description: 'A control that is a baseline from which changes that are made later can be recognized.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcWorkControl', 'IfcWorkPlan', 'IfcWorkPlanBASELINE'],
  },

  IFCWORKPLANPLANNED: {
    name:        'IfcWorkPlanPLANNED',
    label:       'Planned',
    description: 'Planned',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcWorkControl', 'IfcWorkPlan', 'IfcWorkPlanPLANNED'],
  },

  IFCWORKSCHEDULE: {
    name:        'IfcWorkSchedule',
    label:       'Work Schedule',
    description: 'An [[IfcWorkSchedule]] represents a task schedule of a work plan, which in turn can contain a set of schedules for different purposes.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcWorkControl', 'IfcWorkSchedule'],
  },

  IFCWORKSCHEDULEACTUAL: {
    name:        'IfcWorkScheduleACTUAL',
    label:       'Actual',
    description: 'A process in which actual items undertaken are indicated.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcWorkControl', 'IfcWorkSchedule', 'IfcWorkScheduleACTUAL'],
  },

  IFCWORKSCHEDULEBASELINE: {
    name:        'IfcWorkScheduleBASELINE',
    label:       'Baseline',
    description: 'A process that is a baseline from which changes that are made later can be recognized.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcWorkControl', 'IfcWorkSchedule', 'IfcWorkScheduleBASELINE'],
  },

  IFCWORKSCHEDULEPLANNED: {
    name:        'IfcWorkSchedulePLANNED',
    label:       'Planned',
    description: 'A process showing planned items.',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcControl', 'IfcWorkControl', 'IfcWorkSchedule', 'IfcWorkSchedulePLANNED'],
  },

  IFCZONE: {
    name:        'IfcZone',
    label:       'Zone',
    description: 'A zone is a group of spaces, partial spaces or other zones. These spaces may or may not be adjacent. A zone does not have its own shape representation. Zone structures may not be hierarchical (in cont',
    domain:      '',
    schema:      ['IFC4x3'],
    hierarchy:   ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcGroup', 'IfcSystem', 'IfcZone'],
  },
};

/** Return the metadata entry for an entity type (uppercase key), or minimal fallback. */
export function getEntityInfo(ifcTypeUpper) {
  if (!ifcTypeUpper) return null;
  const upper = ifcTypeUpper.toUpperCase();
  const entry = ENTITY_META[upper];
  if (entry) return entry;
  // Minimal fallback for unknown types
  return {
    name: upper, label: upper, description: '',
    domain: '', schema: [], hierarchy: [],
  };
}