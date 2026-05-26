/**
 * IFC 4.3 Property Set templates — auto-generated from BuildingSMART ifc-4.3.json
 * DO NOT EDIT MANUALLY — run scripts/gen_ifc_schema.py to regenerate.
 */

export const PSET_TEMPLATES = {

  'Pset_ActionRequest': {
    label:       'Property Set: Action Request',
    description: 'An action request is a request for an action to fulfill a need.',
    applicableTo: ['IFCACTIONREQUEST', 'IFCACTIONREQUESTEMAIL', 'IFCACTIONREQUESTFAX', 'IFCACTIONREQUESTPHONE', 'IFCACTIONREQUESTPOST', 'IFCACTIONREQUESTVERBAL'],
    props: [
      { name: 'RequestComments', type: 'IfcLabel', description: 'Comments that may be made on the request.' },
      { name: 'RequestSourceLabel', type: 'IfcLabel', description: 'A specific name or label that further qualifies the identity of a request source. In the event of an email, this may be' },
      { name: 'RequestSourceName', type: 'IfcTimeSeries', description: 'The person making the request, where known.' },
    ],
  },

  'Pset_ActorCommon': {
    label:       'Property Set: Actor Common',
    description: 'A property set that enables further classification of actors, including the ability to give a number of actors to be designated as a population, the number being specified as a pro',
    applicableTo: ['IFCACTOR', 'IFCOCCUPANT', 'IFCOCCUPANTASSIGNEE', 'IFCOCCUPANTASSIGNOR', 'IFCOCCUPANTLESSEE', 'IFCOCCUPANTLESSOR', 'IFCOCCUPANTLETTINGAGENT', 'IFCOCCUPANTOWNER', 'IFCOCCUPANTTENANT'],
    props: [
      { name: 'ActorCategory', type: 'IfcLabel', description: 'Designation of the category into which the actors in the population belong.' },
      { name: 'NumberOfActors', type: 'IfcInteger', description: 'The number of actors that are to be dealt with together in the population.' },
      { name: 'SkillLevel', type: 'IfcLabel', description: 'Skill level exhibited by the actor and which indicates an extent of their capability to perform actions on the artefacts' },
    ],
  },

  'Pset_ActuatorPHistory': {
    label:       'Property Set: Actuator Phistory',
    description: 'Properties for history of actuators.',
    applicableTo: ['IFCACTUATOR', 'IFCACTUATORELECTRICACTUATOR', 'IFCACTUATORHANDOPERATEDACTUATOR', 'IFCACTUATORHYDRAULICACTUATOR', 'IFCACTUATORPNEUMATICACTUATOR', 'IFCACTUATORTHERMOSTATICACTUATOR'],
    props: [
      { name: 'PositionHistory', type: 'IfcTimeSeries', description: 'Indicates position of the actuator over time where 0.0 is fully closed and 1.0 is fully open.' },
      { name: 'QualityHistory', type: 'IfcTimeSeries', description: 'Indicates the quality of measurement or failure condition, which may be further qualified by the Status.measured values' },
      { name: 'StatusHistory', type: 'IfcTimeSeries', description: 'Indicates an error code or identifier, whose meaning is specific to the particular automation system.\\\'ConfigurationError' },
    ],
  },

  'Pset_ActuatorTypeCommon': {
    label:       'Property Set: Actuator Type Common',
    description: 'Actuator type common attributes.',
    applicableTo: ['IFCACTUATOR', 'IFCACTUATORELECTRICACTUATOR', 'IFCACTUATORHANDOPERATEDACTUATOR', 'IFCACTUATORHYDRAULICACTUATOR', 'IFCACTUATORPNEUMATICACTUATOR', 'IFCACTUATORTHERMOSTATICACTUATOR'],
    props: [
      { name: 'ActuatorApplication', type: 'IfcLabel', description: 'Indicates application of actuator.' },
      { name: 'ActuatorStatus', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'FailPosition', type: 'IfcLabel', description: 'Specifies the required fail-safe position of the actuator.' },
      { name: 'ManualOverride', type: 'IfcBoolean', description: 'Identifies whether hand-operated operation is provided as an override (= TRUE) or not (= FALSE). Note that this value sh' },
    ],
  },

  'Pset_ActuatorTypeElectricActuator': {
    label:       'Property Set: Actuator Type Electric Actuator',
    description: 'A device that electrically actuates a control element.',
    applicableTo: ['IFCACTUATORELECTRICACTUATOR'],
    props: [
      { name: 'ActuatorInputPower', type: 'IfcReal', description: 'Maximum input power requirement.' },
      { name: 'ControlPulseCurrent', type: 'IfcReal', description: 'The current of the electric actuator control pulse.' },
      { name: 'ElectricActuatorType', type: 'IfcLabel', description: 'Enumeration that identifies electric actuator as defined by its operational principle.' },
    ],
  },

  'Pset_ActuatorTypeHydraulicActuator': {
    label:       'Property Set: Actuator Type Hydraulic Actuator',
    description: 'A device that hydraulically actuates a control element.',
    applicableTo: ['IFCACTUATORHYDRAULICACTUATOR'],
    props: [
      { name: 'InputFlowrate', type: 'IfcReal', description: 'Maximum input flowrate requirement.' },
      { name: 'InputPressure', type: 'IfcReal', description: 'Maximum input or design pressure for the object.' },
    ],
  },

  'Pset_ActuatorTypeLinearActuation': {
    label:       'Property Set: Actuator Type Linear Actuation',
    description: 'Characteristics of linear actuation of an actuator;Replaces Pset_LinearActuator',
    applicableTo: ['IFCACTUATOR', 'IFCACTUATORELECTRICACTUATOR', 'IFCACTUATORHANDOPERATEDACTUATOR', 'IFCACTUATORHYDRAULICACTUATOR', 'IFCACTUATORPNEUMATICACTUATOR', 'IFCACTUATORTHERMOSTATICACTUATOR'],
    props: [
      { name: 'Force', type: 'IfcReal', description: 'Indicates the maximum close-off force for the actuator.' },
      { name: 'Stroke', type: 'IfcReal', description: 'Indicates the maximum distance the actuator must traverse.' },
    ],
  },

  'Pset_ActuatorTypePneumaticActuator': {
    label:       'Property Set: Actuator Type Pneumatic Actuator',
    description: 'A device that pneumatically actuates a control element',
    applicableTo: ['IFCACTUATORPNEUMATICACTUATOR'],
    props: [
      { name: 'InputFlowrate', type: 'IfcReal', description: 'Maximum input flowrate requirement.' },
      { name: 'InputPressure', type: 'IfcReal', description: 'Maximum input or design pressure for the object.' },
    ],
  },

  'Pset_ActuatorTypeRotationalActuation': {
    label:       'Property Set: Actuator Type Rotational Actuation',
    description: 'Characteristics of rotational actuation of an actuator;Replaces Pset_RotationalActuator',
    applicableTo: ['IFCACTUATOR', 'IFCACTUATORELECTRICACTUATOR', 'IFCACTUATORHANDOPERATEDACTUATOR', 'IFCACTUATORHYDRAULICACTUATOR', 'IFCACTUATORPNEUMATICACTUATOR', 'IFCACTUATORTHERMOSTATICACTUATOR'],
    props: [
      { name: 'RangeAngle', type: 'IfcReal', description: 'Indicates the maximum rotation the actuator must traverse.' },
      { name: 'Torque', type: 'IfcReal', description: 'Indicates the maximum close-off torque for the actuator.' },
    ],
  },

  'Pset_Address': {
    label:       'Property Set: Address',
    description: 'This Property Set represents an address for delivery of paper based mail and other postal deliveries.',
    applicableTo: ['IFCACTOR', 'IFCBUILDING', 'IFCOCCUPANT', 'IFCOCCUPANTASSIGNEE', 'IFCOCCUPANTASSIGNOR', 'IFCOCCUPANTLESSEE', 'IFCOCCUPANTLESSOR', 'IFCOCCUPANTLETTINGAGENT', 'IFCOCCUPANTOWNER', 'IFCOCCUPANTTENANT', 'IFCSITE'],
    props: [
      { name: 'AddressLines', type: 'IfcLabel', description: 'The postal address.' },
      { name: 'Country', type: 'IfcLabel', description: 'The two letter country code (from ISO 3166).' },
      { name: 'Description', type: 'IfcLabel', description: 'Optional description, provided for exchanging informative comments.' },
      { name: 'ElectronicMailAddresses', type: 'IfcLabel', description: 'The list of Email addresses at which Email messages may be received.' },
      { name: 'FacsimileNumbers', type: 'IfcLabel', description: 'The list of fax numbers at which fax messages may be received.' },
      { name: 'InternalLocation', type: 'IfcLabel', description: 'An organization defined address for internal mail delivery.' },
      { name: 'MessagingIDs', type: 'IfcLabel', description: 'IDs or addresses for any other means of telecommunication, for example instant messaging, voice-over-IP, or file transfe' },
      { name: 'PagerNumber', type: 'IfcLabel', description: 'The pager number at which paging messages may be received.' },
      { name: 'PostalBox', type: 'IfcLabel', description: 'An address that is implied by an identifiable mail drop.' },
      { name: 'PostalCode', type: 'IfcLabel', description: 'The code that is used by the country\\\'s postal service.' },
      { name: 'Purpose', type: 'IfcLabel', description: 'Indication of the purpose of this object' },
      { name: 'Region', type: 'IfcLabel', description: 'The name of a region.' },
      { name: 'TelephoneNumbers', type: 'IfcLabel', description: 'The list of telephone numbers at which telephone messages may be received.' },
      { name: 'Town', type: 'IfcLabel', description: 'The name of a town.' },
      { name: 'UserDefinedPurpose', type: 'IfcLabel', description: 'Allows for specification of user specific purpose of the address beyond the enumeration values provided by Purpose attri' },
      { name: 'WWWHomePageURL', type: 'IfcLabel', description: 'The world wide web address at which the preliminary page of information for the person or organization can be located.' },
    ],
  },

  'Pset_AirSideSystemInformation': {
    label:       'Property Set: Air Side System Information',
    description: '[[Attributes]] that apply to an air side HVAC system.',
    applicableTo: ['IFCBRIDGE', 'IFCBRIDGEARCHED', 'IFCBRIDGECABLE_STAYED', 'IFCBRIDGECANTILEVER', 'IFCBRIDGECULVERT', 'IFCBRIDGEFRAMEWORK', 'IFCBRIDGEGIRDER', 'IFCBRIDGEPART', 'IFCBRIDGEPARTABUTMENT', 'IFCBRIDGEPARTDECK', 'IFCBRIDGEPARTDECK_SEGMENT', 'IFCBRIDGEPARTFOUNDATION', 'IFCBRIDGEPARTPIER', 'IFCBRIDGEPARTPIER_SEGMENT', 'IFCBRIDGEPARTPYLON', 'IFCBRIDGEPARTSUBSTRUCTURE', 'IFCBRIDGEPARTSUPERSTRUCTURE', 'IFCBRIDGEPARTSURFACESTRUCTURE', 'IFCBRIDGESUSPENSION', 'IFCBRIDGETRUSS', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCEXTERNALSPATIALELEMENT', 'IFCEXTERNALSPATIALELEMENTEXTERNAL', 'IFCEXTERNALSPATIALELEMENTEXTERNAL_EARTH', 'IFCEXTERNALSPATIALELEMENTEXTERNAL_FIRE', 'IFCEXTERNALSPATIALELEMENTEXTERNAL_WATER', 'IFCEXTERNALSPATIALSTRUCTUREELEMENT', 'IFCFACILITY', 'IFCFACILITYPART', 'IFCFACILITYPARTCOMMON', 'IFCFACILITYPARTCOMMONABOVEGROUND', 'IFCFACILITYPARTCOMMONBELOWGROUND', 'IFCFACILITYPARTCOMMONJUNCTION', 'IFCFACILITYPARTCOMMONLEVELCROSSING', 'IFCFACILITYPARTCOMMONSEGMENT', 'IFCFACILITYPARTCOMMONSUBSTRUCTURE', 'IFCFACILITYPARTCOMMONSUPERSTRUCTURE', 'IFCFACILITYPARTCOMMONTERMINAL', 'IFCMARINEFACILITY', 'IFCMARINEFACILITYBARRIERBEACH', 'IFCMARINEFACILITYBREAKWATER', 'IFCMARINEFACILITYCANAL', 'IFCMARINEFACILITYDRYDOCK', 'IFCMARINEFACILITYFLOATINGDOCK', 'IFCMARINEFACILITYHYDROLIFT', 'IFCMARINEFACILITYJETTY', 'IFCMARINEFACILITYLAUNCHRECOVERY', 'IFCMARINEFACILITYMARINEDEFENCE', 'IFCMARINEFACILITYNAVIGATIONALCHANNEL', 'IFCMARINEFACILITYPORT', 'IFCMARINEFACILITYQUAY', 'IFCMARINEFACILITYREVETMENT', 'IFCMARINEFACILITYSHIPLIFT', 'IFCMARINEFACILITYSHIPLOCK', 'IFCMARINEFACILITYSHIPYARD', 'IFCMARINEFACILITYSLIPWAY', 'IFCMARINEFACILITYWATERWAY', 'IFCMARINEFACILITYWATERWAYSHIPLIFT', 'IFCMARINEPART', 'IFCMARINEPARTABOVEWATERLINE', 'IFCMARINEPARTANCHORAGE', 'IFCMARINEPARTAPPROACHCHANNEL', 'IFCMARINEPARTBELOWWATERLINE', 'IFCMARINEPARTBERTHINGSTRUCTURE', 'IFCMARINEPARTCHAMBER', 'IFCMARINEPARTCILL_LEVEL', 'IFCMARINEPARTCOPELEVEL', 'IFCMARINEPARTCORE', 'IFCMARINEPARTCREST', 'IFCMARINEPARTGATEHEAD', 'IFCMARINEPARTGUDINGSTRUCTURE', 'IFCMARINEPARTHIGHWATERLINE', 'IFCMARINEPARTLANDFIELD', 'IFCMARINEPARTLEEWARDSIDE', 'IFCMARINEPARTLOWWATERLINE', 'IFCMARINEPARTMANUFACTURING', 'IFCMARINEPARTNAVIGATIONALAREA', 'IFCMARINEPARTPROTECTION', 'IFCMARINEPARTSHIPTRANSFER', 'IFCMARINEPARTSTORAGEAREA', 'IFCMARINEPARTVEHICLESERVICING', 'IFCMARINEPARTWATERFIELD', 'IFCMARINEPARTWEATHERSIDE', 'IFCRAILWAY', 'IFCRAILWAYPART', 'IFCRAILWAYPARTABOVETRACK', 'IFCRAILWAYPARTDILATIONTRACK', 'IFCRAILWAYPARTLINESIDE', 'IFCRAILWAYPARTLINESIDEPART', 'IFCRAILWAYPARTPLAINTRACK', 'IFCRAILWAYPARTSUBSTRUCTURE', 'IFCRAILWAYPARTTRACK', 'IFCRAILWAYPARTTRACKPART', 'IFCRAILWAYPARTTURNOUTTRACK', 'IFCROAD', 'IFCROADPART', 'IFCROADPARTBICYCLECROSSING', 'IFCROADPARTBUS_STOP', 'IFCROADPARTCARRIAGEWAY', 'IFCROADPARTCENTRALISLAND', 'IFCROADPARTCENTRALRESERVE', 'IFCROADPARTHARDSHOULDER', 'IFCROADPARTINTERSECTION', 'IFCROADPARTLAYBY', 'IFCROADPARTPARKINGBAY', 'IFCROADPARTPASSINGBAY', 'IFCROADPARTPEDESTRIAN_CROSSING', 'IFCROADPARTRAILWAYCROSSING', 'IFCROADPARTREFUGEISLAND', 'IFCROADPARTROADSEGMENT', 'IFCROADPARTROADSIDE', 'IFCROADPARTROADSIDEPART', 'IFCROADPARTROADWAYPLATEAU', 'IFCROADPARTROUNDABOUT', 'IFCROADPARTSHOULDER', 'IFCROADPARTSIDEWALK', 'IFCROADPARTSOFTSHOULDER', 'IFCROADPARTTOLLPLAZA', 'IFCROADPARTTRAFFICISLAND', 'IFCROADPARTTRAFFICLANE', 'IFCSITE', 'IFCSPACE', 'IFCSPACEBERTH', 'IFCSPACEEXTERNAL', 'IFCSPACEGFA', 'IFCSPACEINTERNAL', 'IFCSPACEPARKING', 'IFCSPACESPACE', 'IFCSPATIALELEMENT', 'IFCSPATIALSTRUCTUREELEMENT', 'IFCSPATIALZONE', 'IFCSPATIALZONECONSTRUCTION', 'IFCSPATIALZONEFIRESAFETY', 'IFCSPATIALZONEINTERFERENCE', 'IFCSPATIALZONELIGHTING', 'IFCSPATIALZONEOCCUPANCY', 'IFCSPATIALZONERESERVATION', 'IFCSPATIALZONESECURITY', 'IFCSPATIALZONETHERMAL', 'IFCSPATIALZONETRANSPORT', 'IFCSPATIALZONEVENTILATION', 'IFCZONE'],
    props: [
      { name: 'AirFlowSensible', type: 'IfcReal', description: 'The air flowrate required to satisfy the sensible peak loads.' },
      { name: 'AirSideSystemDistributionType', type: 'IfcLabel', description: 'This enumeration defines the basic types of air side systems (e.g., SingleDuct, DualDuct, Multizone, etc.).' },
      { name: 'AirSideSystemType', type: 'IfcLabel', description: 'This enumeration specifies the basic types of possible air side systems (e.g., Constant Volume, Variable Volume, etc.).' },
      { name: 'ApplianceDiversity', type: 'IfcReal', description: 'Diversity of appliance load.' },
      { name: 'CoolingTemperatureDelta', type: 'IfcReal', description: 'Cooling temperature difference for calculating space air flow rates.' },
      { name: 'Description', type: 'IfcLabel', description: 'Optional description, provided for exchanging informative comments.' },
      { name: 'EnergyGainSensible', type: 'IfcReal', description: 'The sum of total energy gains for the spaces served by the system during the peak cooling conditions, plus any system-le' },
      { name: 'EnergyGainTotal', type: 'IfcReal', description: 'The total amount of energy gains for the spaces served by the system during the peak cooling conditions, plus any system' },
      { name: 'EnergyLoss', type: 'IfcReal', description: 'The sum of energy losses for the spaces served by the system during the peak heating conditions.' },
      { name: 'FanPower', type: 'IfcReal', description: 'Fan motor loads contributing to the cooling load.' },
      { name: 'HeatingTemperatureDelta', type: 'IfcReal', description: 'Heating temperature difference for calculating space air flow rates.' },
      { name: 'InfiltrationDiversitySummer', type: 'IfcReal', description: 'Diversity factor for Summer infiltration.' },
      { name: 'InfiltrationDiversityWinter', type: 'IfcReal', description: 'Diversity factor for Winter infiltration.' },
      { name: 'TotalAirFlow', type: 'IfcReal', description: 'The total design supply air flowrate required for the system for either heating or cooling conditions, whichever is grea' },
      { name: 'Ventilation', type: 'IfcReal', description: 'Required outside air ventilation.' },
    ],
  },

  'Pset_AirTerminalBoxPHistory': {
    label:       'Property Set: Air Terminal Box Phistory',
    description: 'Air terminal box performance history attributes.',
    applicableTo: ['IFCAIRTERMINALBOX', 'IFCAIRTERMINALBOXCONSTANTFLOW', 'IFCAIRTERMINALBOXVARIABLEFLOWPRESSUREDEPENDANT', 'IFCAIRTERMINALBOXVARIABLEFLOWPRESSUREINDEPENDANT'],
    props: [
      { name: 'AirFlowCurve', type: 'IfcTimeSeries', description: 'Air flowrate versus damper position relationship;airflow = f ( valve position).' },
      { name: 'AtmosphericPressure', type: 'IfcTimeSeries', description: 'Ambient atmospheric pressure.' },
      { name: 'DamperPosition', type: 'IfcTimeSeries', description: 'Control damper position, ranging from 0 to 1; damper position (0=closed=90deg position angle, 1=open=0deg position angle' },
      { name: 'Sound', type: 'IfcTimeSeries', description: 'Sound performance.' },
    ],
  },

  'Pset_AirTerminalBoxTypeCommon': {
    label:       'Property Set: Air Terminal Box Type Common',
    description: 'Air terminal box type common attributes.',
    applicableTo: ['IFCAIRTERMINALBOX', 'IFCAIRTERMINALBOXCONSTANTFLOW', 'IFCAIRTERMINALBOXVARIABLEFLOWPRESSUREDEPENDANT', 'IFCAIRTERMINALBOXVARIABLEFLOWPRESSUREINDEPENDANT'],
    props: [
      { name: 'AirFlowRateRange', type: 'IfcReal', description: 'Possible range of airflow that can be delivered.' },
      { name: 'AirPressureRange', type: 'IfcReal', description: 'Allowable air static pressure range at the entrance of the air terminal box.' },
      { name: 'ArrangementType', type: 'IfcLabel', description: 'Terminal box arrangement.;Terminal box receives warm or cold air from a single air supply duct.;Terminal box receives wa' },
      { name: 'HasFan', type: 'IfcBoolean', description: 'Terminal box has a fan inside (fan powered box).' },
      { name: 'HasReturnAir', type: 'IfcBoolean', description: 'Terminal box has return air mixed with supply air from duct work.' },
      { name: 'HasSoundAttenuator', type: 'IfcBoolean', description: 'If TRUE, the object has sound attenuation.' },
      { name: 'HousingThickness', type: 'IfcReal', description: 'Air terminal box housing material thickness.' },
      { name: 'NominalAirFlowRate', type: 'IfcReal', description: 'Nominal air flow rate.' },
      { name: 'NominalDamperDiameter', type: 'IfcReal', description: 'Nominal damper diameter.' },
      { name: 'NominalInletAirPressure', type: 'IfcReal', description: 'Nominal airflow inlet static pressure.' },
      { name: 'OperationTemperatureRange', type: 'IfcReal', description: 'Allowable operation ambient air temperature range.' },
      { name: 'ReheatType', type: 'IfcLabel', description: 'Terminal box reheat type.' },
      { name: 'ReturnAirFractionRange', type: 'IfcReal', description: 'Allowable return air fraction range as a fraction of discharge airflow.' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_AirTerminalOccurrence': {
    label:       'Property Set: Air Terminal Occurrence',
    description: 'Air terminal occurrence attributes attached to an instance of [[IfcAirTerminal]].',
    applicableTo: ['IFCAIRTERMINAL', 'IFCAIRTERMINALDIFFUSER', 'IFCAIRTERMINALGRILLE', 'IFCAIRTERMINALLOUVRE', 'IFCAIRTERMINALREGISTER'],
    props: [
      { name: 'AirFlowRate', type: 'IfcReal', description: 'Air flow rate.' },
      { name: 'AirFlowType', type: 'IfcLabel', description: 'Enumeration defining the functional type of air flow through the terminal.' },
      { name: 'AirTerminalLocation', type: 'IfcLabel', description: 'Location (a single type of diffuser can be used for multiple locations); high means close to ceiling.' },
    ],
  },

  'Pset_AirTerminalPHistory': {
    label:       'Property Set: Air Terminal Phistory',
    description: 'Air terminal performance history common attributes.',
    applicableTo: ['IFCAIRTERMINAL', 'IFCAIRTERMINALDIFFUSER', 'IFCAIRTERMINALGRILLE', 'IFCAIRTERMINALLOUVRE', 'IFCAIRTERMINALREGISTER'],
    props: [
      { name: 'AirFlowRateHistory', type: 'IfcTimeSeries', description: 'Volumetric flow rate.' },
      { name: 'CenterlineAirVelocity', type: 'IfcReal', description: 'Centerline air velocity versus distance from the diffuser and temperature differential; a function of distance from diff' },
      { name: 'InductionRatio', type: 'IfcReal', description: 'Induction ratio versus distance from the diffuser and its discharge direction; induction ratio (or entrainment ratio) is' },
      { name: 'NeckAirVelocity', type: 'IfcTimeSeries', description: 'Air velocity at the neck.' },
      { name: 'PressureDrop', type: 'IfcTimeSeries', description: 'Pressure drop.' },
      { name: 'SupplyAirTemperatureCooling', type: 'IfcTimeSeries', description: 'Supply air temperature in cooling mode.' },
      { name: 'SupplyAirTemperatureHeating', type: 'IfcTimeSeries', description: 'Supply air temperature in heating mode.' },
    ],
  },

  'Pset_AirTerminalTypeCommon': {
    label:       'Property Set: Air Terminal Type Common',
    description: 'Air terminal type common attributes.;Use IfcSoundProperties instead.',
    applicableTo: ['IFCAIRTERMINAL', 'IFCAIRTERMINALDIFFUSER', 'IFCAIRTERMINALGRILLE', 'IFCAIRTERMINALLOUVRE', 'IFCAIRTERMINALREGISTER'],
    props: [
      { name: 'AirDiffusionPerformanceIndex', type: 'IfcReal', description: 'The Air Diffusion Performance Index (ADPI) is used for cooling mode conditions. If several measurements of air velocity' },
      { name: 'AirFlowRateRange', type: 'IfcReal', description: 'Possible range of airflow that can be delivered.' },
      { name: 'AirFlowrateVersusFlowControlElement', type: 'IfcReal', description: 'Air flowrate versus flow control element position at nominal pressure drop.' },
      { name: 'AirTerminalMountingType', type: 'IfcLabel', description: 'The way the air terminal is mounted to the ceiling, wall, etc.mounted to the surface of something (e.g., wall, duct, etc' },
      { name: 'AirTerminalShape', type: 'IfcLabel', description: 'Shape of the air terminal. Slot is typically a long narrow supply device with an aspect ratio generally greater than 10' },
      { name: 'CoreSetHorizontal', type: 'IfcReal', description: 'Degree of horizontal (in the X-axis of the LocalPlacement) blade set from the centerline.' },
      { name: 'CoreSetVertical', type: 'IfcReal', description: 'Degree of vertical (in the Y-axis of the LocalPlacement) blade set from the centerline.' },
      { name: 'CoreType', type: 'IfcLabel', description: 'Identifies the way the core of the AirTerminal is constructed.' },
      { name: 'DischargeDirection', type: 'IfcLabel', description: 'Discharge direction of the air terminal.discharges parallel to mounting surface designed so that flow attaches to the su' },
      { name: 'EffectiveArea', type: 'IfcReal', description: 'Effective discharge area of the air terminal.' },
      { name: 'FaceType', type: 'IfcLabel', description: 'Identifies how the terminal face of an AirTerminal is constructed.' },
      { name: 'FinishColour', type: 'IfcLabel', description: 'The finish colour of the object.' },
      { name: 'FinishType', type: 'IfcLabel', description: 'The type of finish for the air terminal.' },
      { name: 'FlowControlType', type: 'IfcLabel', description: 'Type of flow control element that may be included as a part of the construction of the air terminal.' },
      { name: 'FlowPattern', type: 'IfcLabel', description: 'Flow pattern.' },
      { name: 'HasIntegralControl', type: 'IfcBoolean', description: 'If TRUE, a self powered temperature control is included in the AirTerminal.' },
      { name: 'HasSoundAttenuator', type: 'IfcBoolean', description: 'If TRUE, the object has sound attenuation.' },
      { name: 'HasThermalInsulation', type: 'IfcBoolean', description: 'If TRUE, the air terminal has thermal insulation.' },
      { name: 'NeckArea', type: 'IfcReal', description: 'Neck area of the air terminal.' },
      { name: 'NumberOfSlots', type: 'IfcInteger', description: 'Indicates the number of slots.' },
      { name: 'SlotLength', type: 'IfcReal', description: 'Slot length.' },
      { name: 'SlotWidth', type: 'IfcReal', description: 'Slot width.' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'TemperatureRange', type: 'IfcReal', description: 'Allowable maximum and minimum temperature.' },
      { name: 'ThrowLength', type: 'IfcReal', description: 'The horizontal or vertical axial distance an airstream travels after leaving an AirTerminal before the maximum stream ve' },
    ],
  },

  'Pset_AirToAirHeatRecoveryPHistory': {
    label:       'Property Set: Air To Air Heat Recovery Phistory',
    description: 'Air to Air [[Heat]] Recovery performance history common attributes.',
    applicableTo: ['IFCAIRTOAIRHEATRECOVERY', 'IFCAIRTOAIRHEATRECOVERYFIXEDPLATECOUNTERFLOWEXCHAN', 'IFCAIRTOAIRHEATRECOVERYFIXEDPLATECROSSFLOWEXCHANGE', 'IFCAIRTOAIRHEATRECOVERYFIXEDPLATEPARALLELFLOWEXCHA', 'IFCAIRTOAIRHEATRECOVERYHEATPIPE', 'IFCAIRTOAIRHEATRECOVERYROTARYWHEEL', 'IFCAIRTOAIRHEATRECOVERYRUNAROUNDCOILLOOP', 'IFCAIRTOAIRHEATRECOVERYTHERMOSIPHONCOILTYPEHEATEXC', 'IFCAIRTOAIRHEATRECOVERYTHERMOSIPHONSEALEDTUBEHEATE', 'IFCAIRTOAIRHEATRECOVERYTWINTOWERENTHALPYRECOVERYLO'],
    props: [
      { name: 'AirPressureDropCurves', type: 'IfcTimeSeries', description: 'Air pressure drop as function of air flow rate.' },
      { name: 'DefrostTemperatureEffectiveness', type: 'IfcTimeSeries', description: 'Temperature heat transfer effectiveness when defrosting is active.' },
      { name: 'HumidityEffectiveness', type: 'IfcTimeSeries', description: 'The ratio of primary airflow absolute humidity changes to maximum possible absolute humidity changes.' },
      { name: 'LatentHeatTransferRate', type: 'IfcTimeSeries', description: 'Latent heat transfer rate.' },
      { name: 'SensibleEffectiveness', type: 'IfcTimeSeries', description: 'Sensible heat transfer effectiveness, where effectiveness is defined as the ratio of heat transfer to maximum possible h' },
      { name: 'SensibleEffectivenessTable', type: 'IfcTimeSeries', description: 'Sensible heat transfer effectiveness curve as a function of the primary and secondary air flow rate.' },
      { name: 'SensibleHeatTransferRate', type: 'IfcTimeSeries', description: 'Sensible heat transfer rate.' },
      { name: 'TemperatureEffectiveness', type: 'IfcTimeSeries', description: 'The ratio of primary airflow temperature changes to maximum possible temperature changes.' },
      { name: 'TotalEffectiveness', type: 'IfcTimeSeries', description: 'The ratio of heat transfer to the maximum possible heat transfer.' },
      { name: 'TotalEffectivenessTable', type: 'IfcTimeSeries', description: 'Total heat transfer effectiveness curve as a function of the primary and secondary air flow rate.' },
      { name: 'TotalHeatTransferRate', type: 'IfcTimeSeries', description: 'Total heat transfer rate.' },
    ],
  },

  'Pset_AirToAirHeatRecoveryTypeCommon': {
    label:       'Property Set: Air To Air Heat Recovery Type Common',
    description: 'Air to Air [[Heat]] Recovery type common attributes.',
    applicableTo: ['IFCAIRTOAIRHEATRECOVERY', 'IFCAIRTOAIRHEATRECOVERYFIXEDPLATECOUNTERFLOWEXCHAN', 'IFCAIRTOAIRHEATRECOVERYFIXEDPLATECROSSFLOWEXCHANGE', 'IFCAIRTOAIRHEATRECOVERYFIXEDPLATEPARALLELFLOWEXCHA', 'IFCAIRTOAIRHEATRECOVERYHEATPIPE', 'IFCAIRTOAIRHEATRECOVERYROTARYWHEEL', 'IFCAIRTOAIRHEATRECOVERYRUNAROUNDCOILLOOP', 'IFCAIRTOAIRHEATRECOVERYTHERMOSIPHONCOILTYPEHEATEXC', 'IFCAIRTOAIRHEATRECOVERYTHERMOSIPHONSEALEDTUBEHEATE', 'IFCAIRTOAIRHEATRECOVERYTWINTOWERENTHALPYRECOVERYLO'],
    props: [
      { name: 'HasDefrost', type: 'IfcBoolean', description: 'has the heat exchanger has defrost function or not.' },
      { name: 'HeatTransferTypeEnum', type: 'IfcLabel', description: 'Type of heat transfer between the two air streams.' },
      { name: 'OperationalTemperatureRange', type: 'IfcReal', description: 'The temperature range in which the device operates normally.' },
      { name: 'PrimaryAirFlowRateRange', type: 'IfcReal', description: 'possible range of primary airflow that can be delivered.' },
      { name: 'SecondaryAirFlowRateRange', type: 'IfcReal', description: 'possible range of secondary airflow that can be delivered.' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_AlarmPHistory': {
    label:       'Property Set: Alarm Phistory',
    description: 'Properties for history of alarm values.',
    applicableTo: ['IFCALARM', 'IFCALARMBELL', 'IFCALARMBREAKGLASSBUTTON', 'IFCALARMLIGHT', 'IFCALARMMANUALPULLBOX', 'IFCALARMRAILWAYCROCODILE', 'IFCALARMRAILWAYDETONATOR', 'IFCALARMSIREN', 'IFCALARMWHISTLE'],
    props: [
      { name: 'Acknowledge', type: 'IfcTimeSeries', description: 'Indicates acknowledgement status where False indicates acknowlegement is required and outstanding, True indicates condit' },
      { name: 'ConditionHistory', type: 'IfcTimeSeries', description: 'Indicates alarm condition over time. The range of possible values and their meanings is defined by Pset_AlarmTypeCommon.' },
      { name: 'Enabled', type: 'IfcTimeSeries', description: 'Indicates whether alarm is enabled or disabled over time.' },
      { name: 'Severity', type: 'IfcTimeSeries', description: 'Indicates alarm severity over time, where the scale of values is determined by the control system configuration. A zero' },
      { name: 'UserHistory', type: 'IfcTimeSeries', description: 'Indicates acknowledging user over time by identification corresponding to IfcPerson.Identification on an IfcActor.' },
    ],
  },

  'Pset_AlarmTypeCommon': {
    label:       'Property Set: Alarm Type Common',
    description: 'Alarm type common attributes.',
    applicableTo: ['IFCALARM', 'IFCALARMBELL', 'IFCALARMBREAKGLASSBUTTON', 'IFCALARMLIGHT', 'IFCALARMMANUALPULLBOX', 'IFCALARMRAILWAYCROCODILE', 'IFCALARMRAILWAYDETONATOR', 'IFCALARMSIREN', 'IFCALARMWHISTLE'],
    props: [
      { name: 'AlarmCondition', type: 'IfcLabel', description: 'Table mapping alarm condition identifiers to descriptive labels, which may be used for interpreting Pset_AlarmPHistory.C' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_AnnotationContourLine': {
    label:       'Property Set: Annotation Contour Line',
    description: 'Specifies properties of a standard curve that has a single, consistent measure value.',
    applicableTo: ['IFCANNOTATIONCONTOURLINE'],
    props: [
      { name: 'ContourValue', type: 'IfcReal', description: 'Value of the elevation of the contour above or below a reference plane.' },
    ],
  },

  'Pset_AnnotationLineOfSight': {
    label:       'Property Set: Annotation Line Of Sight',
    description: 'Specifies the properties of the line of sight. For example, it can be used to define the line of sight visibility at the junction between two roads (particularly between an access',
    applicableTo: ['IFCANNOTATION', 'IFCANNOTATIONCONTOURLINE', 'IFCANNOTATIONDIMENSION', 'IFCANNOTATIONISOBAR', 'IFCANNOTATIONISOLUX', 'IFCANNOTATIONISOTHERM', 'IFCANNOTATIONLEADER', 'IFCANNOTATIONSURVEY', 'IFCANNOTATIONSYMBOL', 'IFCANNOTATIONTEXT'],
    props: [
      { name: 'RoadVisibleDistanceLeft', type: 'IfcReal', description: 'Distance visible to the left of the access.' },
      { name: 'RoadVisibleDistanceRight', type: 'IfcReal', description: 'Distance visible to the right of the access.' },
      { name: 'SetbackDistance', type: 'IfcReal', description: 'Setback distance from the point of connection on the major element along the axis of the minor element (e.g. distance fr' },
      { name: 'VisibleAngleLeft', type: 'IfcReal', description: 'Angle of visibility to the left of the access.' },
      { name: 'VisibleAngleRight', type: 'IfcReal', description: 'Angle of visibility to the right of the access.' },
    ],
  },

  'Pset_AnnotationSurveyArea': {
    label:       'Property Set: Annotation Survey Area',
    description: 'Specifies particular properties of survey methods to be assigned to survey point set or resulting surface patches',
    applicableTo: ['IFCANNOTATIONSURVEY'],
    props: [
      { name: 'AccuracyQualityExpected', type: 'IfcReal', description: 'A measure of the accuracy quality of survey points as expected expressed in percentage terms.' },
      { name: 'AccuracyQualityObtained', type: 'IfcReal', description: 'A measure of the accuracy quality of survey points as obtained expressed in percentage terms.' },
      { name: 'AcquisitionMethod', type: 'IfcLabel', description: 'The means by which survey data was acquired.' },
    ],
  },

  'Pset_Asset': {
    label:       'Property Set: Asset',
    description: 'An asset is a uniquely identifiable element which has a financial value and against which maintenance actions are recorded.',
    applicableTo: ['IFCASSET'],
    props: [
      { name: 'AssetAccountingType', type: 'IfcLabel', description: 'Identifies the predefined types of risk from which the type required may be set.' },
      { name: 'AssetInsuranceType', type: 'IfcLabel', description: 'Identifies the predefined types of insurance rating from which the type required may be set.' },
      { name: 'AssetStatus', type: 'IfcLabel', description: 'Current status or stage in life cycle.' },
      { name: 'AssetTaxType', type: 'IfcLabel', description: 'Identifies the predefined types of taxation group from which the type required may be set.' },
      { name: 'AssetUse', type: 'IfcLabel', description: 'General use category of the asset' },
    ],
  },

  'Pset_AudioVisualAppliancePHistory': {
    label:       'Property Set: Audio Visual Appliance Phistory',
    description: 'Captures realtime information for audio-video devices, such as for security camera footage and retail information displays.',
    applicableTo: ['IFCAUDIOVISUALAPPLIANCE', 'IFCAUDIOVISUALAPPLIANCEAMPLIFIER', 'IFCAUDIOVISUALAPPLIANCECAMERA', 'IFCAUDIOVISUALAPPLIANCECOMMUNICATIONTERMINAL', 'IFCAUDIOVISUALAPPLIANCEDISPLAY', 'IFCAUDIOVISUALAPPLIANCEMICROPHONE', 'IFCAUDIOVISUALAPPLIANCEPLAYER', 'IFCAUDIOVISUALAPPLIANCEPROJECTOR', 'IFCAUDIOVISUALAPPLIANCERECEIVER', 'IFCAUDIOVISUALAPPLIANCERECORDINGEQUIPMENT', 'IFCAUDIOVISUALAPPLIANCESPEAKER', 'IFCAUDIOVISUALAPPLIANCESWITCHER', 'IFCAUDIOVISUALAPPLIANCETELEPHONE', 'IFCAUDIOVISUALAPPLIANCETUNER'],
    props: [
      { name: 'AudioVolumeHistory', type: 'IfcTimeSeries', description: 'Indicates the audio volume level where the integer level corresponds to an entry or interpolation within Pset_AudioVisua' },
      { name: 'MediaContent', type: 'IfcTimeSeries', description: 'Indicates the media content storage location, such as URLs to camera footage within particular time periods.' },
      { name: 'MediaSourceHistory', type: 'IfcTimeSeries', description: 'Indicates the media source where the identifier corresponds to an entry within the table of available media sources on P' },
      { name: 'PowerState', type: 'IfcTimeSeries', description: 'Indicates the power state of the device where True is on and False is off.' },
    ],
  },

  'Pset_AudioVisualApplianceTypeAmplifier': {
    label:       'Property Set: Audio Visual Appliance Type Amplifier',
    description: 'An audio-visual amplifier is a device that renders audio from a single external source connected from a port.',
    applicableTo: ['IFCAUDIOVISUALAPPLIANCEAMPLIFIER'],
    props: [
      { name: 'AmplifierType', type: 'IfcLabel', description: 'Indicates the type of amplifier.' },
      { name: 'AudioAmplification', type: 'IfcReal', description: 'Indicates audio amplification frequency ranges.' },
      { name: 'AudioMode', type: 'IfcLabel', description: 'Indicates audio sound modes and corresponding labels, if applicable.' },
    ],
  },

  'Pset_AudioVisualApplianceTypeCamera': {
    label:       'Property Set: Audio Visual Appliance Type Camera',
    description: 'An audio-visual camera is a device that captures video, such as for security.',
    applicableTo: ['IFCAUDIOVISUALAPPLIANCECAMERA'],
    props: [
      { name: 'CameraType', type: 'IfcLabel', description: 'Indicates the type of camera.' },
      { name: 'IsOutdoors', type: 'IfcBoolean', description: 'Indicates if camera is designed to be used outdoors.' },
      { name: 'PanHorizontal', type: 'IfcReal', description: 'Indicates horizontal range for panning.' },
      { name: 'PanTiltZoomPreset', type: 'IfcLabel', description: 'Indicates pan/tilt/zoom position presets.' },
      { name: 'PanVertical', type: 'IfcReal', description: 'Indicates vertical range for panning.' },
      { name: 'TiltHorizontal', type: 'IfcReal', description: 'Indicates horizontal range for pivoting, where positive values indicate the camera rotating clockwise,' },
      { name: 'TiltVertical', type: 'IfcReal', description: 'Indicates vertical range for pivoting, where 0.0 is level, +90 degrees is looking up, -90 degrees is looking down.' },
      { name: 'VideoCaptureInterval', type: 'IfcReal', description: 'Indicates video frame capture time intervals.' },
      { name: 'VideoResolutionHeight', type: 'IfcInteger', description: 'Indicates the number of vertical pixels (the largest native video resolution height).' },
      { name: 'VideoResolutionMode', type: 'IfcLabel', description: 'Indicates video resolution modes.' },
      { name: 'VideoResolutionWidth', type: 'IfcInteger', description: 'Indicates the number of horizontal pixels (the largest native video resolution width).' },
      { name: 'Zoom', type: 'IfcReal', description: 'Indicates the zoom range.' },
    ],
  },

  'Pset_AudioVisualApplianceTypeCommon': {
    label:       'Property Set: Audio Visual Appliance Type Common',
    description: 'An audio-visual appliance is a device that renders or captures audio and/or video.',
    applicableTo: ['IFCAUDIOVISUALAPPLIANCE', 'IFCAUDIOVISUALAPPLIANCEAMPLIFIER', 'IFCAUDIOVISUALAPPLIANCECAMERA', 'IFCAUDIOVISUALAPPLIANCECOMMUNICATIONTERMINAL', 'IFCAUDIOVISUALAPPLIANCEDISPLAY', 'IFCAUDIOVISUALAPPLIANCEMICROPHONE', 'IFCAUDIOVISUALAPPLIANCEPLAYER', 'IFCAUDIOVISUALAPPLIANCEPROJECTOR', 'IFCAUDIOVISUALAPPLIANCERECEIVER', 'IFCAUDIOVISUALAPPLIANCERECORDINGEQUIPMENT', 'IFCAUDIOVISUALAPPLIANCESPEAKER', 'IFCAUDIOVISUALAPPLIANCESWITCHER', 'IFCAUDIOVISUALAPPLIANCETELEPHONE', 'IFCAUDIOVISUALAPPLIANCETUNER'],
    props: [
      { name: 'AudioVolume', type: 'IfcReal', description: 'Indicates discrete audio volume levels and corresponding sound power offsets, if applicable. Missing values may be inter' },
      { name: 'MediaSource', type: 'IfcLabel', description: 'Indicates media sources and corresponding names of ports (IfcDistributionPort with FlowDirection=SINK and PredefinedType' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_AudioVisualApplianceTypeDisplay': {
    label:       'Property Set: Audio Visual Appliance Type Display',
    description: 'An audio-visual display is a device that renders video from a screen.',
    applicableTo: ['IFCAUDIOVISUALAPPLIANCEDISPLAY'],
    props: [
      { name: 'AudioMode', type: 'IfcLabel', description: 'Indicates audio sound modes and corresponding labels, if applicable.' },
      { name: 'Brightness', type: 'IfcReal', description: 'Indicates the display brightness.' },
      { name: 'ContrastRatio', type: 'IfcReal', description: 'Indicates the display contrast ratio.' },
      { name: 'DisplayHeight', type: 'IfcReal', description: 'Indicates the physical height of the screen (only the display surface).' },
      { name: 'DisplayType', type: 'IfcLabel', description: 'Indicates the type of display.' },
      { name: 'DisplayWidth', type: 'IfcReal', description: 'Indicates the physical width of the screen (only the display surface).' },
      { name: 'NominalSize', type: 'IfcReal', description: 'Indicates the diagonal screen size.' },
      { name: 'RefreshRate', type: 'IfcReal', description: 'Indicates the display refresh frequency.' },
      { name: 'TouchScreen', type: 'IfcLabel', description: 'Indicates touchscreen support.' },
      { name: 'VideoCaptionMode', type: 'IfcLabel', description: 'Indicates video closed captioning modes.' },
      { name: 'VideoResolutionHeight', type: 'IfcInteger', description: 'Indicates the number of vertical pixels (the largest native video resolution height).' },
      { name: 'VideoResolutionMode', type: 'IfcLabel', description: 'Indicates video resolution modes.' },
      { name: 'VideoResolutionWidth', type: 'IfcInteger', description: 'Indicates the number of horizontal pixels (the largest native video resolution width).' },
      { name: 'VideoScaleMode', type: 'IfcLabel', description: 'Indicates video scaling modes.' },
    ],
  },

  'Pset_AudioVisualApplianceTypePlayer': {
    label:       'Property Set: Audio Visual Appliance Type Player',
    description: 'An audio-visual player is a device that plays stored media into a stream of audio and/or video, such as camera footage in security systems, background audio in retail areas, or med',
    applicableTo: ['IFCAUDIOVISUALAPPLIANCEPLAYER'],
    props: [
      { name: 'PlayerMediaEject', type: 'IfcBoolean', description: 'Indicates whether the media can be ejected from the player (if physical media).' },
      { name: 'PlayerMediaFormat', type: 'IfcLabel', description: 'Indicates supported media formats.' },
      { name: 'PlayerType', type: 'IfcLabel', description: 'Indicates the type of player.' },
    ],
  },

  'Pset_AudioVisualApplianceTypeProjector': {
    label:       'Property Set: Audio Visual Appliance Type Projector',
    description: 'An audio-visual projector is a device that projects video to a surface.',
    applicableTo: ['IFCAUDIOVISUALAPPLIANCEPROJECTOR'],
    props: [
      { name: 'ProjectorType', type: 'IfcLabel', description: 'Indicates the type of projector.' },
      { name: 'VideoCaptionMode', type: 'IfcLabel', description: 'Indicates video closed captioning modes.' },
      { name: 'VideoResolutionHeight', type: 'IfcInteger', description: 'Indicates the number of vertical pixels (the largest native video resolution height).' },
      { name: 'VideoResolutionMode', type: 'IfcLabel', description: 'Indicates video resolution modes.' },
      { name: 'VideoResolutionWidth', type: 'IfcInteger', description: 'Indicates the number of horizontal pixels (the largest native video resolution width).' },
      { name: 'VideoScaleMode', type: 'IfcLabel', description: 'Indicates video scaling modes.' },
    ],
  },

  'Pset_AudioVisualApplianceTypeRailwayCommunicationT': {
    label:       'Property Set: Audio Visual Appliance Type Railway Communication Terminal',
    description: 'Properties used for railway communication terminals.',
    applicableTo: ['IFCAUDIOVISUALAPPLIANCECOMMUNICATIONTERMINAL'],
    props: [
    ],
  },

  'Pset_AudioVisualApplianceTypeReceiver': {
    label:       'Property Set: Audio Visual Appliance Type Receiver',
    description: 'An audio-visual receiver is a device that switches audio and/or video from multiple sources, including external sources connected from ports and internal aggregated sources.',
    applicableTo: ['IFCAUDIOVISUALAPPLIANCERECEIVER'],
    props: [
      { name: 'AudioAmplification', type: 'IfcReal', description: 'Indicates audio amplification frequency ranges.' },
      { name: 'AudioMode', type: 'IfcLabel', description: 'Indicates audio sound modes and corresponding labels, if applicable.' },
      { name: 'ReceiverType', type: 'IfcLabel', description: 'Indicates the type of receiver.' },
    ],
  },

  'Pset_AudioVisualApplianceTypeRecordingEquipment': {
    label:       'Property Set: Audio Visual Appliance Type Recording Equipment',
    description: 'Properties common to [[IfcAudioVisualAppliance]] with predefined type set to RECORDINGEQUIPMENT.',
    applicableTo: ['IFCAUDIOVISUALAPPLIANCERECORDINGEQUIPMENT'],
    props: [
      { name: 'NumberOfInterfaces', type: 'IfcInteger', description: 'Indicates the types of interfaces and their number in the device.' },
      { name: 'StorageCapacity', type: 'IfcInteger', description: 'Indicates the total data storage capacity of the device. It is defined by bytes.' },
    ],
  },

  'Pset_AudioVisualApplianceTypeSpeaker': {
    label:       'Property Set: Audio Visual Appliance Type Speaker',
    description: 'An audio-visual speaker is a device that converts amplified audio signals into sound waves.',
    applicableTo: ['IFCAUDIOVISUALAPPLIANCESPEAKER'],
    props: [
      { name: 'FrequencyResponse', type: 'IfcReal', description: 'Indicates the output over a specified range of frequencies.' },
      { name: 'Impedence', type: 'IfcReal', description: 'Indicates the speaker impedence.' },
      { name: 'SpeakerDriverSize', type: 'IfcReal', description: 'Indicates the number of drivers and their sizes.' },
      { name: 'SpeakerMounting', type: 'IfcLabel', description: 'Indicates how the speaker is designed to be mounted.' },
      { name: 'SpeakerType', type: 'IfcLabel', description: 'Indicates the type of speaker.' },
    ],
  },

  'Pset_AudioVisualApplianceTypeTuner': {
    label:       'Property Set: Audio Visual Appliance Type Tuner',
    description: 'An audio-visual tuner is a device that demodulates a signal into a stream of audio and/or video.',
    applicableTo: ['IFCAUDIOVISUALAPPLIANCETUNER'],
    props: [
      { name: 'TunerChannel', type: 'IfcLabel', description: 'Indicates the tuner channels, if applicable.' },
      { name: 'TunerFrequency', type: 'IfcReal', description: 'Indicates the tuner frequencies, if applicable.' },
      { name: 'TunerMode', type: 'IfcLabel', description: 'Indicates the tuner modes (or bands). For example, \\\'AnalogCable\\\', \\\'DigitalAir\\\', \\\'AM\\\', \\\'FM\\\'.' },
      { name: 'TunerType', type: 'IfcLabel', description: 'Indicates the tuner type.' },
    ],
  },

  'Pset_AxleCountingEquipment': {
    label:       'Property Set: Axle Counting Equipment',
    description: 'Properties that are applicable for [[IfcSensor]] with predefined type WHEELSENSOR, indicated that the wheel sensor is a axle counting equipment.',
    applicableTo: ['IFCSENSORWHEELSENSOR'],
    props: [
      { name: 'AxleCounterResponseTime', type: 'IfcReal', description: 'The time that axle counter can detect the axles of locomotive and vehicle.' },
      { name: 'AxleCountingEquipmentType', type: 'IfcLabel', description: 'The type of axle counting equipment.' },
      { name: 'DetectionRange', type: 'IfcReal', description: 'The detection range of the equipment.' },
      { name: 'FailureInformation', type: 'IfcLabel', description: 'The information for failure description.' },
      { name: 'ImpactParameter', type: 'IfcReal', description: 'Impact parameter of the equipment.' },
      { name: 'InsulationResistance', type: 'IfcReal', description: 'Minimum resistance between one terminal or several terminals connected together and the case or enclosure of a component' },
      { name: 'MaximumVibration', type: 'IfcReal', description: 'Maximum tolerable vibration level of the device.' },
      { name: 'NominalWeight', type: 'IfcReal', description: 'Nominal weight of the object.' },
      { name: 'OperationalTemperatureRange', type: 'IfcReal', description: 'The temperature range in which the device operates normally.' },
      { name: 'RatedVoltage', type: 'IfcReal', description: 'The range of allowed voltage that a device is certified to handle. The upper bound of this value is the maximum.' },
    ],
  },

  'Pset_BalanceWeightTensionerDesignCriteria': {
    label:       'Property Set: Balance Weight Tensioner Design Criteria',
    description: 'Properties of a weight tensioner. The property set can be used by the predefined type TENSIONINGEQUIPMENT of [[IfcDiscreteAccessory]].',
    applicableTo: ['IFCDISCRETEACCESSORYTENSIONINGEQUIPMENT'],
    props: [
      { name: 'ReferenceDistanceRopeToPulley', type: 'IfcReal', description: 'The reference design criteria for distance from the end of the rope to the fixed pulley.It defines the nominal distance' },
      { name: 'ReferenceDistanceTensionerToGround', type: 'IfcReal', description: 'The reference design criteria distance from the last tensioner to the ground or the base surface (B value). It defines t' },
    ],
  },

  'Pset_BeamCommon': {
    label:       'Property Set: Beam Common',
    description: 'Properties common to the definition of all occurrence and type objects of beam.',
    applicableTo: ['IFCBEAM', 'IFCBEAMBEAM', 'IFCBEAMCORNICE', 'IFCBEAMDIAPHRAGM', 'IFCBEAMEDGEBEAM', 'IFCBEAMGIRDER_SEGMENT', 'IFCBEAMHATSTONE', 'IFCBEAMHOLLOWCORE', 'IFCBEAMJOIST', 'IFCBEAMLINTEL', 'IFCBEAMPIERCAP', 'IFCBEAMSPANDREL', 'IFCBEAMT_BEAM'],
    props: [
      { name: 'FireRating', type: 'IfcLabel', description: 'Fire rating for this object. It is given according to the national fire safety classification.' },
      { name: 'IsExternal', type: 'IfcBoolean', description: 'Indication whether the element is designed for use in the exterior (TRUE) or not (FALSE). If (TRUE) it is an external el' },
      { name: 'LoadBearing', type: 'IfcBoolean', description: 'Indicates whether the object is intended to carry loads (TRUE) or not (FALSE).' },
      { name: 'Roll', type: 'IfcReal', description: 'Rotation against the longitudinal axis.' },
      { name: 'Slope', type: 'IfcReal', description: 'Slope angle - relative to horizontal (0.0 degrees).The shape information is provided in addition to the shape representa' },
      { name: 'Span', type: 'IfcReal', description: 'Clear span for this object.The shape information is provided in addition to the shape representation and the geometric p' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'ThermalTransmittance', type: 'IfcReal', description: 'Thermal transmittance coefficient (U-Value) of an element, within the direction of the thermal flow (including all mater' },
    ],
  },

  'Pset_BearingCommon': {
    label:       'Property Set: Bearing Common',
    description: 'Common properties for [[IfcBearing]].',
    applicableTo: ['IFCBEARING', 'IFCBEARINGCYLINDRICAL', 'IFCBEARINGDISK', 'IFCBEARINGELASTOMERIC', 'IFCBEARINGGUIDE', 'IFCBEARINGPOT', 'IFCBEARINGROCKER', 'IFCBEARINGROLLER', 'IFCBEARINGSPHERICAL'],
    props: [
      { name: 'DisplacementAccommodated', type: 'IfcBoolean', description: 'A list of exactly three boolean values representing an accommodated displacement (value TRUE or 1) or no displacement (v' },
      { name: 'RotationAccommodated', type: 'IfcBoolean', description: 'A list of exactly three boolean values representing an accommodated rotation (value TRUE or 1) or no rotation (value FAL' },
    ],
  },

  'Pset_BerthCommon': {
    label:       'Property Set: Berth Common',
    description: 'properties common to the definition of all occurrences of [[IfcSpace]] and types of IfcSpaceType with the predefined type set to BERTH',
    applicableTo: ['IFCSPACEBERTH'],
    props: [
      { name: 'AbnormalBerthingFactor', type: 'IfcReal', description: 'Risk assessed safety factor' },
      { name: 'BerthApproach', type: 'IfcLabel', description: 'How the vessel approaches the berth' },
      { name: 'BerthingAngle', type: 'IfcReal', description: 'Angle of approach for the vessel to the berth' },
      { name: 'BerthingVelocity', type: 'IfcReal', description: 'Velocity of the vessel as it berths' },
      { name: 'BerthMode', type: 'IfcLabel', description: 'Orientation of vessel as it approaches berth' },
    ],
  },

  'Pset_BoilerPHistory': {
    label:       'Property Set: Boiler Phistory',
    description: 'Boiler performance history common attributes.;Use IfcMaterialProperties instead.Use IfcMaterialProperties instead.',
    applicableTo: ['IFCBOILER', 'IFCBOILERSTEAM', 'IFCBOILERWATER'],
    props: [
      { name: 'AuxiliaryEnergyConsumption', type: 'IfcTimeSeries', description: 'Boiler secondary energy source consumption (i.e., the electricity consumed by electrical devices such as fans and pumps)' },
      { name: 'CombustionChamberTemperature', type: 'IfcTimeSeries', description: 'Average combustion chamber temperature.' },
      { name: 'CombustionEfficiency', type: 'IfcTimeSeries', description: 'Combustion efficiency under nominal condition.' },
      { name: 'EnergySourceConsumption', type: 'IfcTimeSeries', description: 'Energy consumption.' },
      { name: 'Load', type: 'IfcTimeSeries', description: 'Boiler real load.' },
      { name: 'OperationalEfficiency', type: 'IfcTimeSeries', description: 'boiler output divided by total energy input (electrical and fuel).' },
      { name: 'PartLoadRatio', type: 'IfcTimeSeries', description: 'Ratio of the real to the nominal capacity.' },
      { name: 'PrimaryEnergyConsumption', type: 'IfcTimeSeries', description: 'Boiler primary energy source consumption (i.e., the fuel consumed for changing the thermodynamic state of the fluid).' },
      { name: 'WorkingPressureHistory', type: 'IfcTimeSeries', description: 'Boiler working pressure.' },
    ],
  },

  'Pset_BoilerTypeCommon': {
    label:       'Property Set: Boiler Type Common',
    description: 'Boiler type common attributes.;Use IfcSoundProperties instead.Use IfcMaterialProperties instead.',
    applicableTo: ['IFCBOILER', 'IFCBOILERSTEAM', 'IFCBOILERWATER'],
    props: [
      { name: 'EnergySource', type: 'IfcLabel', description: 'Enumeration defining the energy source or fuel cumbusted.' },
      { name: 'HeatTransferSurfaceArea', type: 'IfcReal', description: 'Total heat transfer area of the vessel.' },
      { name: 'IsWaterStorageHeater', type: 'IfcBoolean', description: 'This is used to identify if the boiler has storage capacity (TRUE). If FALSE, then there is no storage capacity built in' },
      { name: 'NominalEnergyConsumption', type: 'IfcReal', description: 'Nominal fuel consumption rate required to produce the total boiler heat output.' },
      { name: 'NominalPartLoadRatio', type: 'IfcReal', description: 'Allowable part load ratio range.' },
      { name: 'OperatingMode', type: 'IfcLabel', description: 'Identifies the operating mode of the boiler.' },
      { name: 'OutletTemperatureRange', type: 'IfcReal', description: 'Allowable outlet temperature of either the water or the steam.' },
      { name: 'PartialLoadEfficiencyCurves', type: 'IfcReal', description: 'Boiler efficiency as a function of the partial load factor; E = f (partialLaodfactor).' },
      { name: 'PressureRating', type: 'IfcReal', description: 'Pressure rating of the object.' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'WaterInletTemperatureRange', type: 'IfcReal', description: 'Allowable water inlet temperature range.' },
      { name: 'WaterStorageCapacity', type: 'IfcReal', description: 'Water storage capacity.' },
    ],
  },

  'Pset_BoilerTypeSteam': {
    label:       'Property Set: Boiler Type Steam',
    description: '[[Steam]] boiler type common attributes.',
    applicableTo: ['IFCBOILERSTEAM'],
    props: [
      { name: 'HeatOutput', type: 'IfcReal', description: 'Total nominal heat output as listed by the Boiler manufacturer.' },
      { name: 'MaximumOutletPressure', type: 'IfcLabel', description: 'Maximum steam outlet pressure.' },
      { name: 'NominalEfficiencyTable', type: 'IfcReal', description: 'The nominal efficiency of the boiler as defined by the manufacturer. For steam boilers, a function of inlet temperature' },
    ],
  },

  'Pset_BoilerTypeWater': {
    label:       'Property Set: Boiler Type Water',
    description: '[[Water]] boiler type common attributes.',
    applicableTo: ['IFCBOILERWATER'],
    props: [
      { name: 'HeatOutput', type: 'IfcReal', description: 'Total nominal heat output as listed by the Boiler manufacturer.' },
      { name: 'NominalEfficiency', type: 'IfcReal', description: 'Nominal object efficiency under nominal conditions.' },
    ],
  },

  'Pset_BoreholeCommon': {
    label:       'Property Set: Borehole Common',
    description: 'Properties describing the features of a borehole (if not modelled separately).',
    applicableTo: ['IFCBOREHOLE'],
    props: [
      { name: 'BoreholeState', type: 'IfcLabel', description: 'The state the borehole or trial pit has been left in. (boreholeML).' },
      { name: 'CapDepth', type: 'IfcReal', description: 'Depth of cap (boreholeML).' },
      { name: 'CapMaterial', type: 'IfcLabel', description: 'Cap material or \\\'NOT CAPPED\\\' or \\\'UNKNOWN\\\' (boreholeML).' },
      { name: 'FillingDepth', type: 'IfcReal', description: 'Depth of filling (boreholeML).' },
      { name: 'FillingMaterial', type: 'IfcLabel', description: 'Filling material or \\\'NOT FILLED\\\' or \\\'UNKNOWN\\\' (boreholeML).' },
      { name: 'GroundwaterDepth', type: 'IfcReal', description: 'Depth groundwater encountered (boreholeML).' },
      { name: 'LiningMaterial', type: 'IfcLabel', description: 'Lining material or \\\'NOT LINED\\\' or \\\'UNKNOWN\\\' (boreholeML).' },
      { name: 'LiningThickness', type: 'IfcReal', description: 'Thickness of the lining.' },
    ],
  },

  'Pset_BoundedCourseCommon': {
    label:       'Property Set: Bounded Course Common',
    description: 'Properties for a bounded course.',
    applicableTo: ['IFCCOURSE', 'IFCCOURSEARMOUR', 'IFCCOURSEBALLASTBED', 'IFCCOURSECORE', 'IFCCOURSEFILTER', 'IFCCOURSEPAVEMENT', 'IFCCOURSEPROTECTION'],
    props: [
      { name: 'SpreadingRate', type: 'IfcReal', description: 'The nominal overall mass of material per area covered by the course.' },
    ],
  },

  'Pset_BreakwaterCommon': {
    label:       'Property Set: Breakwater Common',
    description: 'Properties common to the definition of all occurrences of [[IfcMarineFacility]] with the predefined type set to BREAKWATER.',
    applicableTo: ['IFCMARINEFACILITYBREAKWATER'],
    props: [
      { name: 'Elevation', type: 'IfcReal', description: 'Elevation of the entity' },
      { name: 'StructuralStyle', type: 'IfcLabel', description: 'Structural style of the element' },
    ],
  },

  'Pset_BridgeCommon': {
    label:       'Property Set: Bridge Common',
    description: 'Common property set for bridges.',
    applicableTo: ['IFCBRIDGE', 'IFCBRIDGEARCHED', 'IFCBRIDGECABLE_STAYED', 'IFCBRIDGECANTILEVER', 'IFCBRIDGECULVERT', 'IFCBRIDGEFRAMEWORK', 'IFCBRIDGEGIRDER', 'IFCBRIDGESUSPENSION', 'IFCBRIDGETRUSS'],
    props: [
      { name: 'StructureIndicator', type: 'IfcLabel', description: 'The type of bridge structure (composite, coated, homogeneous or other)' },
    ],
  },

  'Pset_BuildingCommon': {
    label:       'Property Set: Building Common',
    description: 'Properties common to the definition of all instances of [[IfcBuilding]]. Please note that several building attributes are handled directly at the [[IfcBuilding]] instance, the buil',
    applicableTo: ['IFCBUILDING'],
    props: [
      { name: 'BuildingID', type: 'IfcLabel', description: 'A unique identifier assigned to a building. A temporary identifier is initially assigned at the time of making a plannin' },
      { name: 'ConstructionMethod', type: 'IfcLabel', description: 'The type of construction action to the object, e.g. new construction, renovation, refurbishment, etc.' },
      { name: 'ElevationOfRefHeight', type: 'IfcReal', description: 'Elevation above sea level of the reference height used for all storey elevation measures, equals to height 0.0. It is us' },
      { name: 'ElevationOfTerrain', type: 'IfcReal', description: 'Elevation above the minimal terrain level around the foot print of the building, given in elevation above sea level.' },
      { name: 'FireProtectionClass', type: 'IfcLabel', description: 'Main fire protection class for the building which is assigned from the fire protection classification table as given by' },
      { name: 'GrossPlannedArea', type: 'IfcReal', description: 'Total planned gross area of the spatial structure element. Used for programming the spatial structure element.' },
      { name: 'IsLandmarked', type: 'IfcValue', description: 'This builing is listed as a historic building (TRUE), or not (FALSE), or unknown.' },
      { name: 'IsPermanentID', type: 'IfcBoolean', description: 'Indicates whether the identity assigned to the object is permanent (= TRUE) or temporary (=FALSE).' },
      { name: 'NetPlannedArea', type: 'IfcReal', description: 'Total planned net area of the object. Used for programming the object.' },
      { name: 'NumberOfStoreys', type: 'IfcInteger', description: 'The number of storeys within a building.; Captured for those cases where the IfcBuildingStorey entity is not used. Note' },
      { name: 'OccupancyType', type: 'IfcLabel', description: 'Occupancy type for this object.; It is defined according to the presiding national building code.' },
      { name: 'SprinklerProtection', type: 'IfcBoolean', description: 'Indication whether this object is sprinkler protected (TRUE) or not (FALSE).' },
      { name: 'SprinklerProtectionAutomatic', type: 'IfcBoolean', description: 'Indication whether this object has an automatic sprinkler protection (TRUE) or not (FALSE).; It should only be given, if' },
      { name: 'YearOfConstruction', type: 'IfcLabel', description: 'Year of construction of this building, including expected year of completion.' },
      { name: 'YearOfLastRefurbishment', type: 'IfcLabel', description: 'Year of last major refurbishment, or reconstruction, of the building (applies to reconstruction works).' },
    ],
  },

  'Pset_BuildingElementProxyCommon': {
    label:       'Property Set: Building Element Proxy Common',
    description: 'Common properties for built elements that don\\\'t have a specific entity name.',
    applicableTo: ['IFCBUILDINGELEMENTPROXY'],
    props: [
      { name: 'FireRating', type: 'IfcLabel', description: 'Fire rating for this object. It is given according to the national fire safety classification.' },
      { name: 'IsExternal', type: 'IfcBoolean', description: 'Indication whether the element is designed for use in the exterior (TRUE) or not (FALSE). If (TRUE) it is an external el' },
      { name: 'LoadBearing', type: 'IfcBoolean', description: 'Indicates whether the object is intended to carry loads (TRUE) or not (FALSE).' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'ThermalTransmittance', type: 'IfcReal', description: 'Thermal transmittance coefficient (U-Value) of an element, within the direction of the thermal flow (including all mater' },
    ],
  },

  'Pset_BuildingStoreyCommon': {
    label:       'Property Set: Building Storey Common',
    description: 'Properties common to the definition of all instances of [[IfcBuildingStorey]]. Please note that several building attributes are handled directly at the [[IfcBuildingStorey]] instan',
    applicableTo: ['IFCBUILDINGSTOREY'],
    props: [
      { name: 'AboveGround', type: 'IfcValue', description: 'Indication whether this building storey is fully above ground (TRUE), or below ground (FALSE), or partially above and be' },
      { name: 'ElevationOfFFLRelative', type: 'IfcReal', description: 'Elevation of the top surface of the finished floor level given in elevation above the local zero height. If the level va' },
      { name: 'ElevationOfSSLRelative', type: 'IfcReal', description: 'Elevation of the top surface of the structural slab level given in elevation above the local zero height. If the level v' },
      { name: 'EntranceLevel', type: 'IfcBoolean', description: 'Indication whether this building storey is an entrance level to the building (TRUE), or (FALSE) if otherwise.' },
      { name: 'GrossPlannedArea', type: 'IfcReal', description: 'Total planned gross area of the spatial structure element. Used for programming the spatial structure element.' },
      { name: 'LoadBearingCapacity', type: 'IfcReal', description: 'Maximum load bearing capacity of the floor structure throughtout the storey as designed.' },
      { name: 'NetPlannedArea', type: 'IfcReal', description: 'Total planned net area of the object. Used for programming the object.' },
      { name: 'SprinklerProtection', type: 'IfcBoolean', description: 'Indication whether this object is sprinkler protected (TRUE) or not (FALSE).' },
      { name: 'SprinklerProtectionAutomatic', type: 'IfcBoolean', description: 'Indication whether this object has an automatic sprinkler protection (TRUE) or not (FALSE).; It should only be given, if' },
    ],
  },

  'Pset_BuildingUse': {
    label:       'Property Set: Building Use',
    description: 'Provides information on on the real estate context of the building of interest both current and anticipated.',
    applicableTo: ['IFCBUILDING'],
    props: [
      { name: 'MarketCategory', type: 'IfcLabel', description: 'Category of use e.g. residential, commercial, recreation etc.' },
      { name: 'MarketSubCategoriesAvailableFuture', type: 'IfcLabel', description: 'A list of the sub categories of property that are expected to be available in the future expressed in terms of IfcLabel.' },
      { name: 'MarketSubCategoriesAvailableNow', type: 'IfcLabel', description: 'A list of the sub categories of property that are currently available expressed in terms of IfcLabel.' },
      { name: 'MarketSubCategory', type: 'IfcLabel', description: 'Subset of category of use e.g. multi-family, 2 bedroom, low rise.' },
      { name: 'NarrativeText', type: 'IfcLabel', description: 'Added information relating to the adjacent building use that is not appropriate to the general descriptive text associat' },
      { name: 'PlanningControlStatus', type: 'IfcLabel', description: 'Label of zoning category or class, or planning control category for the site or facility.' },
      { name: 'RentalRatesInCategoryFuture', type: 'IfcReal', description: 'Range of the cost rates for property expected to be available in the future in the required category.' },
      { name: 'RentalRatesInCategoryNow', type: 'IfcReal', description: 'Range of the cost rates for property currently available in the required category.' },
      { name: 'TenureModesAvailableFuture', type: 'IfcLabel', description: 'A list of the tenure modes that are expected to be available in the future expressed in terms of IfcLabel.' },
      { name: 'TenureModesAvailableNow', type: 'IfcLabel', description: 'A list of the tenure modes that are currently available expressed in terms of IfcLabel.' },
      { name: 'VacancyRateInCategoryFuture', type: 'IfcReal', description: 'Percentage of vacancy found in the particular category expected in the future.' },
      { name: 'VacancyRateInCategoryNow', type: 'IfcReal', description: 'Percentage of vacancy found in the particular category currently.' },
    ],
  },

  'Pset_BuildingUseAdjacent': {
    label:       'Property Set: Building Use Adjacent',
    description: 'Provides information on adjacent buildings and their uses to enable their impact on the building of interest to be determined. Note that for each instance of the property set used,',
    applicableTo: ['IFCBUILDING'],
    props: [
      { name: 'MarketCategory', type: 'IfcLabel', description: 'Category of use e.g. residential, commercial, recreation etc.' },
      { name: 'MarketSubCategory', type: 'IfcLabel', description: 'Subset of category of use e.g. multi-family, 2 bedroom, low rise.' },
      { name: 'NarrativeText', type: 'IfcLabel', description: 'Added information relating to the adjacent building use that is not appropriate to the general descriptive text associat' },
      { name: 'PlanningControlStatus', type: 'IfcLabel', description: 'Label of zoning category or class, or planning control category for the site or facility.' },
    ],
  },

  'Pset_BuiltSystemRailwayLine': {
    label:       'Property Set: Built System Railway Line',
    description: 'Properties common to the definition of a railway line system, which is a set of functional tracks with explicit terminals. It is usually composed of a set of tracks with continuous',
    applicableTo: ['IFCBUILTSYSTEMRAILWAYLINE'],
    props: [
      { name: 'IsElectrified', type: 'IfcBoolean', description: 'Indicates whether the track system is electrified or not.' },
      { name: 'LineCharacteristic', type: 'IfcLabel', description: 'Indicates the characteristic of the line.' },
      { name: 'LineID', type: 'IfcLabel', description: 'The unique identifier of the line.' },
    ],
  },

  'Pset_BuiltSystemRailwayTrack': {
    label:       'Property Set: Built System Railway Track',
    description: 'Properties common to the definition of a track system. It is usually composed of continuous sequences of track parts and alignments.',
    applicableTo: ['IFCBUILTSYSTEMRAILWAYTRACK'],
    props: [
      { name: 'TrackCharacteristic', type: 'IfcLabel', description: 'Indicates the characteristic of the track.' },
      { name: 'TrackID', type: 'IfcLabel', description: 'The unique identification number of the track.' },
      { name: 'TrackNumber', type: 'IfcLabel', description: 'Indicates the local identification number of the track.' },
      { name: 'TrackUsage', type: 'IfcLabel', description: 'The expected primary usage of the track.' },
    ],
  },

  'Pset_BurnerTypeCommon': {
    label:       'Property Set: Burner Type Common',
    description: 'Common attributes of burner types.',
    applicableTo: ['IFCBURNER'],
    props: [
      { name: 'EnergySource', type: 'IfcLabel', description: 'Enumeration defining the energy source or fuel cumbusted.' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_CableCarrierFittingTypeCommon': {
    label:       'Property Set: Cable Carrier Fitting Type Common',
    description: 'Common properties for cable carrier fittings.',
    applicableTo: ['IFCCABLECARRIERFITTING', 'IFCCABLECARRIERFITTINGBEND', 'IFCCABLECARRIERFITTINGCONNECTOR', 'IFCCABLECARRIERFITTINGCROSS', 'IFCCABLECARRIERFITTINGJUNCTION', 'IFCCABLECARRIERFITTINGREDUCER', 'IFCCABLECARRIERFITTINGTEE', 'IFCCABLECARRIERFITTINGTRANSITION'],
    props: [
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_CableCarrierSegmentTypeCableLadderSegment': {
    label:       'Property Set: Cable Carrier Segment Type Cable Ladder Segment',
    description: 'An open carrier segment on which cables are carried on a ladder structure.;',
    applicableTo: ['IFCCABLECARRIERSEGMENTCABLELADDERSEGMENT'],
    props: [
      { name: 'LadderConfiguration', type: 'IfcLabel', description: 'Description of the configuration of the ladder structure used.' },
    ],
  },

  'Pset_CableCarrierSegmentTypeCableTraySegment': {
    label:       'Property Set: Cable Carrier Segment Type Cable Tray Segment',
    description: 'An (typically) open carrier segment onto which cables are laid.;',
    applicableTo: ['IFCCABLECARRIERSEGMENTCABLETRAYSEGMENT'],
    props: [
      { name: 'HasCover', type: 'IfcBoolean', description: 'Indication of whether the cable tray has a cover (=TRUE) or not (= FALSE). By default, this value should be set to FALSE' },
    ],
  },

  'Pset_CableCarrierSegmentTypeCableTrunkingSegment': {
    label:       'Property Set: Cable Carrier Segment Type Cable Trunking Segment',
    description: 'An enclosed carrier segment with one or more compartments into which cables are placed.;',
    applicableTo: ['IFCCABLECARRIERSEGMENTCABLETRUNKINGSEGMENT'],
    props: [
      { name: 'NumberOfCompartments', type: 'IfcInteger', description: 'The number of separate internal compartments within the trunking.' },
    ],
  },

  'Pset_CableCarrierSegmentTypeCatenaryWire': {
    label:       'Property Set: Cable Carrier Segment Type Catenary Wire',
    description: 'Properties of a catenary wire, which is a longtitudinal wire supporting the grooved contact wires. Properties in this property set are applicable to a type or an occurrence [[IfcCa',
    applicableTo: ['IFCCABLECARRIERSEGMENTCATENARYWIRE'],
    props: [
      { name: 'ACResistance', type: 'IfcReal', description: 'The resistance under AC.' },
      { name: 'CatenaryWireType', type: 'IfcLabel', description: 'Indicate the type of Catenary wire.' },
      { name: 'CurrentCarryingCapacity', type: 'IfcReal', description: 'Maximum value of electric current which can be carried continuously by a conductor, a device or an apparatus, under spec' },
      { name: 'DCResistance', type: 'IfcReal', description: 'The resistance under direct current and 20 degrees centigrade.' },
      { name: 'LayRatio', type: 'IfcReal', description: 'The ratio between lay length and the diameter of the single conductor.' },
      { name: 'MassPerLength', type: 'IfcReal', description: 'Mass per length, i.e. mass of a beam with a unit length of extrusion. For example measured in kg/m.' },
      { name: 'MechanicalTension', type: 'IfcReal', description: 'Nominal value of mechanical force applied to a flow segment.' },
      { name: 'PhysicalDescriptionReference', type: 'IfcTimeSeries', description: 'Physical description as external reference of the equipment, including e.g.weight, shape, model, length, height, diamete' },
      { name: 'StrandingMethod', type: 'IfcLabel', description: 'Specifies the method used to strand the cable. Stranding is the process where a particular number of stranding elements' },
      { name: 'TensileStrength', type: 'IfcReal', description: 'Indicates the ability to withstand breakage apart under applied force.' },
      { name: 'ThermalExpansionCoefficient', type: 'IfcReal', description: 'Quantity characterizing the variation with thermodynamic temperature T of the distance l between two points of a body, u' },
      { name: 'UltimateTensileStrength', type: 'IfcReal', description: 'Indicates the maximum stress that a material or element can withstand before breaking while being stretched or pulled.' },
      { name: 'YoungModulus', type: 'IfcReal', description: 'A measure of the Young\\\'s modulus of elasticity of the material.' },
    ],
  },

  'Pset_CableCarrierSegmentTypeCommon': {
    label:       'Property Set: Cable Carrier Segment Type Common',
    description: 'Common properties for cable carrier segments.',
    applicableTo: ['IFCCABLECARRIERSEGMENT', 'IFCCABLECARRIERSEGMENTCABLEBRACKET', 'IFCCABLECARRIERSEGMENTCABLELADDERSEGMENT', 'IFCCABLECARRIERSEGMENTCABLETRAYSEGMENT', 'IFCCABLECARRIERSEGMENTCABLETRUNKINGSEGMENT', 'IFCCABLECARRIERSEGMENTCATENARYWIRE', 'IFCCABLECARRIERSEGMENTCONDUITSEGMENT', 'IFCCABLECARRIERSEGMENTDROPPER'],
    props: [
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_CableCarrierSegmentTypeConduitSegment': {
    label:       'Property Set: Cable Carrier Segment Type Conduit Segment',
    description: 'An enclosed tubular carrier segment through which cables are pulled.;',
    applicableTo: ['IFCCABLECARRIERSEGMENTCONDUITSEGMENT'],
    props: [
      { name: 'ConduitShapeType', type: 'IfcLabel', description: 'The shape of the conduit segment.' },
      { name: 'IsRigid', type: 'IfcBoolean', description: 'Indication of whether the conduit is rigid (= TRUE) or flexible (= FALSE).' },
      { name: 'NominalDiameter', type: 'IfcReal', description: 'Nominal diameter or width of the object.' },
      { name: 'NominalHeight', type: 'IfcReal', description: 'The nominal height of the object. The size information is provided in addition to the shape representation and the geome' },
      { name: 'NominalWidth', type: 'IfcReal', description: 'The nominal overall width of the object. The size information is provided in addition to the shape representation and th' },
    ],
  },

  'Pset_CableCarrierSegmentTypeDropper': {
    label:       'Property Set: Cable Carrier Segment Type Dropper',
    description: 'Properties that are applicable to a type or an occurrence of dropper.',
    applicableTo: ['IFCCABLECARRIERSEGMENTDROPPER'],
    props: [
      { name: 'AssemblyInstruction', type: 'IfcTimeSeries', description: 'Instructions to describe how the system / equipment / facility is assembled.' },
      { name: 'CurrentCarryingCapacity', type: 'IfcReal', description: 'Maximum value of electric current which can be carried continuously by a conductor, a device or an apparatus, under spec' },
      { name: 'IsAdjustable', type: 'IfcBoolean', description: 'Indicates whether the element is adjustable or not.' },
      { name: 'IsCurrentCarrying', type: 'IfcBoolean', description: 'To indicate whether the current will go through the dropper.' },
      { name: 'IsRigid', type: 'IfcBoolean', description: 'Indication of whether the conduit is rigid (= TRUE) or flexible (= FALSE).' },
      { name: 'NominalLoad', type: 'IfcReal', description: 'The nominal load that a component can support.' },
      { name: 'TensileStrength', type: 'IfcReal', description: 'Indicates the ability to withstand breakage apart under applied force.' },
      { name: 'UltimateTensileStrength', type: 'IfcReal', description: 'Indicates the maximum stress that a material or element can withstand before breaking while being stretched or pulled.' },
    ],
  },

  'Pset_CableFittingTypeCommon': {
    label:       'Property Set: Cable Fitting Type Common',
    description: 'Common properties for cable fittings.',
    applicableTo: ['IFCCABLEFITTING', 'IFCCABLEFITTINGCONNECTOR', 'IFCCABLEFITTINGENTRY', 'IFCCABLEFITTINGEXIT', 'IFCCABLEFITTINGFANOUT', 'IFCCABLEFITTINGJUNCTION', 'IFCCABLEFITTINGTRANSITION'],
    props: [
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_CableFittingTypeExit': {
    label:       'Property Set: Cable Fitting Type Exit',
    description: 'Properties of the exit type of cable fitting which ends a cable segment at a non-electric element.',
    applicableTo: ['IFCCABLEFITTINGEXIT'],
    props: [
      { name: 'GroundResistance', type: 'IfcReal', description: 'The soil or ground resistance to electrical current from the cable fitting.' },
    ],
  },

  'Pset_CableFittingTypeFanout': {
    label:       'Property Set: Cable Fitting Type Fanout',
    description: 'Properties of the fanout type of cable fitting.',
    applicableTo: ['IFCCABLEFITTINGFANOUT'],
    props: [
      { name: 'NumberOfTubes', type: 'IfcInteger', description: 'Number of fiber tubes.' },
      { name: 'TubeDiameter', type: 'IfcReal', description: 'Indicates the diameter of the fiber tubes that are used in the fan out.' },
    ],
  },

  'Pset_CableSegmentConnector': {
    label:       'Property Set: Cable Segment Connector',
    description: 'Properties about cable connectors. This property set is applicable to a type or occurrence of [[IfcCableSegment]], indicated that the cable segment has one or two connectors affili',
    applicableTo: ['IFCCABLESEGMENT', 'IFCCABLESEGMENTBUSBARSEGMENT', 'IFCCABLESEGMENTCABLESEGMENT', 'IFCCABLESEGMENTCONDUCTORSEGMENT', 'IFCCABLESEGMENTCONTACTWIRESEGMENT', 'IFCCABLESEGMENTCORESEGMENT', 'IFCCABLESEGMENTFIBERSEGMENT', 'IFCCABLESEGMENTFIBERTUBE', 'IFCCABLESEGMENTOPTICALCABLESEGMENT', 'IFCCABLESEGMENTSTITCHWIRE', 'IFCCABLESEGMENTWIREPAIRSEGMENT'],
    props: [
      { name: 'ConnectorAColour', type: 'IfcLabel', description: 'Indicates the colour A- end of connector.' },
      { name: 'ConnectorAGender', type: 'IfcLabel', description: 'Indicates the gender of A-end connector.' },
      { name: 'ConnectorAType', type: 'IfcLabel', description: 'Indicates the type of A-end connector.' },
      { name: 'ConnectorBColour', type: 'IfcLabel', description: 'Indicates the colour B- end of connector.' },
      { name: 'ConnectorBGender', type: 'IfcLabel', description: 'Indicates the gender of B-end connector.' },
      { name: 'ConnectorBType', type: 'IfcLabel', description: 'Indicates the type of B-end connector.' },
    ],
  },

  'Pset_CableSegmentOccurenceFiberSegment': {
    label:       'Property Set: Cable Segment Occurence Fiber Segment',
    description: 'Properties of fiber segment occurrences. This property set is applicable to occurrences of [[IfcCableSegment]] with predefined type FIBERSEGMENT.',
    applicableTo: ['IFCCABLESEGMENTFIBERSEGMENT'],
    props: [
      { name: 'InUse', type: 'IfcBoolean', description: 'Indicates whether the fiber has been assigned to some specific use.' },
    ],
  },

  'Pset_CableSegmentOccurrence': {
    label:       'Property Set: Cable Segment Occurrence',
    description: 'Properties for the occurrence of an electrical cable, core or conductor that conforms to a type as specified by an appropriate type definition within IFC.',
    applicableTo: ['IFCCABLESEGMENT', 'IFCCABLESEGMENTBUSBARSEGMENT', 'IFCCABLESEGMENTCABLESEGMENT', 'IFCCABLESEGMENTCONDUCTORSEGMENT', 'IFCCABLESEGMENTCONTACTWIRESEGMENT', 'IFCCABLESEGMENTCORESEGMENT', 'IFCCABLESEGMENTFIBERSEGMENT', 'IFCCABLESEGMENTFIBERTUBE', 'IFCCABLESEGMENTOPTICALCABLESEGMENT', 'IFCCABLESEGMENTSTITCHWIRE', 'IFCCABLESEGMENTWIREPAIRSEGMENT'],
    props: [
      { name: 'CarrierStackNumber', type: 'IfcInteger', description: 'Number of carrier segments (tray, ladder etc.) that are vertically stacked (vertical is measured as the z-axis of the lo' },
      { name: 'CurrentCarryingCapacity', type: 'IfcReal', description: 'Maximum value of electric current which can be carried continuously by a conductor, a device or an apparatus, under spec' },
      { name: 'DesignAmbientTemperature', type: 'IfcReal', description: 'The highest and lowest local ambient temperature likely to be encountered.' },
      { name: 'DistanceBetweenParallelCircuits', type: 'IfcReal', description: 'Distance measured between parallel circuits.' },
      { name: 'InstallationMethod', type: 'IfcLabel', description: 'Method of installation of cable/conductor. Installation methods are typically defined by reference in standards such as' },
      { name: 'InstallationMethodFlagEnum', type: 'IfcLabel', description: '2001 reference installation methods C and D.' },
      { name: 'IsHorizontalCable', type: 'IfcBoolean', description: 'Indication of whether the cable occurrences are mounted horizontally (= TRUE) or vertically (= FALSE).' },
      { name: 'IsMountedFlatCable', type: 'IfcBoolean', description: 'Indication of whether the cable occurrences are mounted flat (= TRUE) or in a trefoil pattern (= FALSE).' },
      { name: 'MaximumCableLength', type: 'IfcReal', description: 'Maximum cable length based on voltagedrop.' },
      { name: 'MountingMethod', type: 'IfcLabel', description: 'The method of mounting cable segment occurrences on a cable carrier occurrence from which the method required can be sel' },
      { name: 'NumberOfParallelCircuits', type: 'IfcInteger', description: 'Number of parallel circuits.' },
      { name: 'PowerLoss', type: 'IfcReal', description: 'The power loss in W.' },
      { name: 'SequentialCode', type: 'IfcLabel', description: 'Indicates the sequential code of the cable or wire.' },
      { name: 'SoilConductivity', type: 'IfcReal', description: 'Thermal conductivity of soil. Generally, within standards such as IEC 60364-5-52, table 52A-16, the resistivity of soil' },
      { name: 'UserCorrectionFactor', type: 'IfcReal', description: 'An arbitrary correction factor that may be applied by the user.' },
    ],
  },

  'Pset_CableSegmentTypeBusBarSegment': {
    label:       'Property Set: Cable Segment Type Bus Bar Segment',
    description: 'Properties specific to busbar cable segments.',
    applicableTo: ['IFCCABLESEGMENTBUSBARSEGMENT'],
    props: [
      { name: 'ACResistance', type: 'IfcReal', description: 'The resistance under AC.' },
      { name: 'CrossSectionalArea', type: 'IfcReal', description: 'Cross section area of the phase(s) lead(s).' },
      { name: 'CurrentCarryingCapacity', type: 'IfcReal', description: 'Maximum value of electric current which can be carried continuously by a conductor, a device or an apparatus, under spec' },
      { name: 'DCResistance', type: 'IfcReal', description: 'The resistance under direct current and 20 degrees centigrade.' },
      { name: 'InsulationMethod', type: 'IfcLabel', description: 'The method used to insulate.' },
      { name: 'IsHorizontalBusbar', type: 'IfcBoolean', description: 'Indication of whether the busbar occurrences are routed horizontally (= TRUE) or vertically (= FALSE).' },
      { name: 'MassPerLength', type: 'IfcReal', description: 'Mass per length, i.e. mass of a beam with a unit length of extrusion. For example measured in kg/m.' },
      { name: 'NominalCurrent', type: 'IfcReal', description: 'The nominal current that is designed to be measured.' },
      { name: 'OperationalTemperatureRange', type: 'IfcReal', description: 'The temperature range in which the device operates normally.' },
      { name: 'OverallDiameter', type: 'IfcReal', description: 'The overall diameter of a object.' },
      { name: 'RatedVoltage', type: 'IfcReal', description: 'The range of allowed voltage that a device is certified to handle. The upper bound of this value is the maximum.' },
      { name: 'TensileStrength', type: 'IfcReal', description: 'Indicates the ability to withstand breakage apart under applied force.' },
      { name: 'ThermalExpansionCoefficient', type: 'IfcReal', description: 'Quantity characterizing the variation with thermodynamic temperature T of the distance l between two points of a body, u' },
      { name: 'UltimateTensileStrength', type: 'IfcReal', description: 'Indicates the maximum stress that a material or element can withstand before breaking while being stretched or pulled.' },
      { name: 'YoungModulus', type: 'IfcReal', description: 'A measure of the Young\\\'s modulus of elasticity of the material.' },
    ],
  },

  'Pset_CableSegmentTypeCableSegment': {
    label:       'Property Set: Cable Segment Type Cable Segment',
    description: 'Electrical cable with a specific purpose to lead electric current within a circuit or any other electric construction. Includes all types of electric cables, mainly several electri',
    applicableTo: ['IFCCABLESEGMENTCABLESEGMENT'],
    props: [
      { name: 'ACResistance', type: 'IfcReal', description: 'The resistance under AC.' },
      { name: 'CurrentCarryingCapacity', type: 'IfcReal', description: 'Maximum value of electric current which can be carried continuously by a conductor, a device or an apparatus, under spec' },
      { name: 'DCResistance', type: 'IfcReal', description: 'The resistance under direct current and 20 degrees centigrade.' },
      { name: 'FunctionReliable', type: 'IfcBoolean', description: 'Element (such as cable, bus, core) maintain given properties/functions over a given (tested) time and conditions. Accord' },
      { name: 'HalogenProof', type: 'IfcBoolean', description: 'Produces small amount of smoke and irritating Deaerator/Gas.' },
      { name: 'HasProtectiveEarth', type: 'IfcBoolean', description: 'Indicates whether the object has a protective earth connection (=TRUE) or not (= FALSE).' },
      { name: 'InsulationVoltage', type: 'IfcReal', description: 'The insulation voltage.' },
      { name: 'MassPerLength', type: 'IfcReal', description: 'Mass per length, i.e. mass of a beam with a unit length of extrusion. For example measured in kg/m.' },
      { name: 'MaximumBendingRadius', type: 'IfcReal', description: 'The maximum bending radius that the cable could withstand.' },
      { name: 'MaximumCurrent', type: 'IfcReal', description: 'The maximum allowed current that a device is certified to handle.' },
      { name: 'MaximumOperatingTemperature', type: 'IfcReal', description: 'The maximum temperature at which a cable or bus is certified to operate.' },
      { name: 'MaximumShortCircuitTemperature', type: 'IfcReal', description: 'The maximum short circuit temperature at which a cable or bus is certified to operate.' },
      { name: 'NumberOfCores', type: 'IfcInteger', description: 'The number of cores.' },
      { name: 'NumberOfWires', type: 'IfcInteger', description: 'The number of wires used in the element.' },
      { name: 'OverallDiameter', type: 'IfcReal', description: 'The overall diameter of a object.' },
      { name: 'RatedTemperature', type: 'IfcReal', description: 'The range of allowed temperature that a device is certified to handle. The upper bound of this value is the maximum.' },
      { name: 'RatedVoltage', type: 'IfcReal', description: 'The range of allowed voltage that a device is certified to handle. The upper bound of this value is the maximum.' },
      { name: 'ScreenDiameter', type: 'IfcReal', description: 'The diameter of the screen around an object (if present).' },
      { name: 'SelfExtinguishing60332_1', type: 'IfcBoolean', description: 'Self Extinguishing cable/core according to IEC 60332.1.' },
      { name: 'SelfExtinguishing60332_3', type: 'IfcBoolean', description: 'Self Extinguishing cable/core according to IEC 60332.3.' },
      { name: 'SpecialConstruction', type: 'IfcLabel', description: 'Special construction capabilities like self-supporting, flat devidable cable or bus flat non devidable cable or bus supp' },
      { name: 'Standard', type: 'IfcLabel', description: 'The designation of the standard applicable for the definition of the object used.' },
      { name: 'Weight', type: 'IfcReal', description: 'Total weight of object' },
    ],
  },

  'Pset_CableSegmentTypeCommon': {
    label:       'Property Set: Cable Segment Type Common',
    description: 'Properties for the definitions of electrical cable segments.',
    applicableTo: ['IFCCABLESEGMENT', 'IFCCABLESEGMENTBUSBARSEGMENT', 'IFCCABLESEGMENTCABLESEGMENT', 'IFCCABLESEGMENTCONDUCTORSEGMENT', 'IFCCABLESEGMENTCONTACTWIRESEGMENT', 'IFCCABLESEGMENTCORESEGMENT', 'IFCCABLESEGMENTFIBERSEGMENT', 'IFCCABLESEGMENTFIBERTUBE', 'IFCCABLESEGMENTOPTICALCABLESEGMENT', 'IFCCABLESEGMENTSTITCHWIRE', 'IFCCABLESEGMENTWIREPAIRSEGMENT'],
    props: [
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_CableSegmentTypeConductorSegment': {
    label:       'Property Set: Cable Segment Type Conductor Segment',
    description: 'An electrical conductor is a single linear element with the specific purpose to lead electric current. The core of one lead is normally single wired or multiwired which are intertw',
    applicableTo: ['IFCCABLESEGMENTCONDUCTORSEGMENT'],
    props: [
      { name: 'ACResistance', type: 'IfcReal', description: 'The resistance under AC.' },
      { name: 'ConductorMaterial', type: 'IfcLabel', description: 'Type of material from which the conductor is constructed.' },
      { name: 'ConductorShape', type: 'IfcLabel', description: 'Indication of the shape of the conductor.' },
      { name: 'Construction', type: 'IfcLabel', description: 'Purpose of informing on how the vonductor is constructed (interwined or solid). I.e. Solid (IEV 461-01-06), stranded (IE' },
      { name: 'CrossSectionalArea', type: 'IfcReal', description: 'Cross section area of the phase(s) lead(s).' },
      { name: 'CurrentCarryingCapacity', type: 'IfcReal', description: 'Maximum value of electric current which can be carried continuously by a conductor, a device or an apparatus, under spec' },
      { name: 'DCResistance', type: 'IfcReal', description: 'The resistance under direct current and 20 degrees centigrade.' },
      { name: 'Function', type: 'IfcLabel', description: 'Type of function for which the conductor is intended.' },
      { name: 'MassPerLength', type: 'IfcReal', description: 'Mass per length, i.e. mass of a beam with a unit length of extrusion. For example measured in kg/m.' },
      { name: 'NominalCurrent', type: 'IfcReal', description: 'The nominal current that is designed to be measured.' },
      { name: 'NumberOfCores', type: 'IfcInteger', description: 'The number of cores.' },
      { name: 'OverallDiameter', type: 'IfcReal', description: 'The overall diameter of a object.' },
      { name: 'RatedVoltage', type: 'IfcReal', description: 'The range of allowed voltage that a device is certified to handle. The upper bound of this value is the maximum.' },
      { name: 'TensileStrength', type: 'IfcReal', description: 'Indicates the ability to withstand breakage apart under applied force.' },
      { name: 'ThermalExpansionCoefficient', type: 'IfcReal', description: 'Quantity characterizing the variation with thermodynamic temperature T of the distance l between two points of a body, u' },
      { name: 'UltimateTensileStrength', type: 'IfcReal', description: 'Indicates the maximum stress that a material or element can withstand before breaking while being stretched or pulled.' },
      { name: 'YoungModulus', type: 'IfcReal', description: 'A measure of the Young\\\'s modulus of elasticity of the material.' },
    ],
  },

  'Pset_CableSegmentTypeContactWire': {
    label:       'Property Set: Cable Segment Type Contact Wire',
    description: 'Properties of contact wires used in overhead contact line systems. This property set is applicable to a type or occurrence of [[IfcCableSegment]] with predefined type CONTACTWIRESE',
    applicableTo: ['IFCCABLESEGMENTCONTACTWIRESEGMENT'],
    props: [
      { name: 'ACResistance', type: 'IfcReal', description: 'The resistance under AC.' },
      { name: 'CrossSectionalArea', type: 'IfcReal', description: 'Cross section area of the phase(s) lead(s).' },
      { name: 'CurrentCarryingCapacity', type: 'IfcReal', description: 'Maximum value of electric current which can be carried continuously by a conductor, a device or an apparatus, under spec' },
      { name: 'DCResistance', type: 'IfcReal', description: 'The resistance under direct current and 20 degrees centigrade.' },
      { name: 'MassPerLength', type: 'IfcReal', description: 'Mass per length, i.e. mass of a beam with a unit length of extrusion. For example measured in kg/m.' },
      { name: 'TensileStrength', type: 'IfcReal', description: 'Indicates the ability to withstand breakage apart under applied force.' },
      { name: 'ThermalExpansionCoefficient', type: 'IfcReal', description: 'Quantity characterizing the variation with thermodynamic temperature T of the distance l between two points of a body, u' },
      { name: 'TorsionalStrength', type: 'IfcReal', description: 'Shear strength in torsion.' },
      { name: 'YoungModulus', type: 'IfcReal', description: 'A measure of the Young\\\'s modulus of elasticity of the material.' },
    ],
  },

  'Pset_CableSegmentTypeCoreSegment': {
    label:       'Property Set: Cable Segment Type Core Segment',
    description: 'An assembly comprising a conductor with its own insulation (and screens if any)',
    applicableTo: ['IFCCABLESEGMENTCORESEGMENT'],
    props: [
      { name: 'ACResistance', type: 'IfcReal', description: 'The resistance under AC.' },
      { name: 'CoreIdentifier', type: 'IfcLabel', description: 'The core identification used Identifiers may be used such as by color (Black, Brown, Grey) or by number (1, 2, 3) or by' },
      { name: 'CurrentCarryingCapacity', type: 'IfcReal', description: 'Maximum value of electric current which can be carried continuously by a conductor, a device or an apparatus, under spec' },
      { name: 'DCResistance', type: 'IfcReal', description: 'The resistance under direct current and 20 degrees centigrade.' },
      { name: 'FunctionReliable', type: 'IfcBoolean', description: 'Element (such as cable, bus, core) maintain given properties/functions over a given (tested) time and conditions. Accord' },
      { name: 'HalogenProof', type: 'IfcBoolean', description: 'Produces small amount of smoke and irritating Deaerator/Gas.' },
      { name: 'LayRatio', type: 'IfcReal', description: 'The ratio between lay length and the diameter of the single conductor.' },
      { name: 'MassPerLength', type: 'IfcReal', description: 'Mass per length, i.e. mass of a beam with a unit length of extrusion. For example measured in kg/m.' },
      { name: 'OverallDiameter', type: 'IfcReal', description: 'The overall diameter of a object.' },
      { name: 'RatedTemperature', type: 'IfcReal', description: 'The range of allowed temperature that a device is certified to handle. The upper bound of this value is the maximum.' },
      { name: 'RatedVoltage', type: 'IfcReal', description: 'The range of allowed voltage that a device is certified to handle. The upper bound of this value is the maximum.' },
      { name: 'ScreenDiameter', type: 'IfcReal', description: 'The diameter of the screen around an object (if present).' },
      { name: 'SelfExtinguishing60332_1', type: 'IfcBoolean', description: 'Self Extinguishing cable/core according to IEC 60332.1.' },
      { name: 'SelfExtinguishing60332_3', type: 'IfcBoolean', description: 'Self Extinguishing cable/core according to IEC 60332.3.' },
      { name: 'SheathColours', type: 'IfcLabel', description: 'Colour of the core (derived from IEC 60757). Note that the combined color \\\'GreenAndYellow\\\' shall be used only as Protect' },
      { name: 'Standard', type: 'IfcLabel', description: 'The designation of the standard applicable for the definition of the object used.' },
      { name: 'StrandingMethod', type: 'IfcLabel', description: 'Specifies the method used to strand the cable. Stranding is the process where a particular number of stranding elements' },
      { name: 'TensileStrength', type: 'IfcReal', description: 'Indicates the ability to withstand breakage apart under applied force.' },
      { name: 'ThermalExpansionCoefficient', type: 'IfcReal', description: 'Quantity characterizing the variation with thermodynamic temperature T of the distance l between two points of a body, u' },
      { name: 'UltimateTensileStrength', type: 'IfcReal', description: 'Indicates the maximum stress that a material or element can withstand before breaking while being stretched or pulled.' },
      { name: 'Weight', type: 'IfcReal', description: 'Total weight of object' },
      { name: 'YoungModulus', type: 'IfcReal', description: 'A measure of the Young\\\'s modulus of elasticity of the material.' },
    ],
  },

  'Pset_CableSegmentTypeEarthingConductor': {
    label:       'Property Set: Cable Segment Type Earthing Conductor',
    description: 'Properties of earthing conductors used in overhead contact line systems. This property set is applicable to a type or occurrence of [[IfcCableSegment]] with predefined type CONDUCT',
    applicableTo: ['IFCCABLESEGMENTCONDUCTORSEGMENT'],
    props: [
      { name: 'ResistanceToGround', type: 'IfcReal', description: 'The resistance through earthing conductor to the ground.195-01-18' },
    ],
  },

  'Pset_CableSegmentTypeFiberSegment': {
    label:       'Property Set: Cable Segment Type Fiber Segment',
    description: 'Properties of fiber segments. This property set is applicable to a type or occurrence of [[IfcCableSegment]] with predefined type FIBERSEGMENT.',
    applicableTo: ['IFCCABLESEGMENTFIBERSEGMENT'],
    props: [
      { name: 'FiberColour', type: 'IfcLabel', description: 'Indicates the colour of a single fiber.' },
      { name: 'FiberType', type: 'IfcLabel', description: 'Indicates the type of the single fiber.' },
      { name: 'HasTightJacket', type: 'IfcBoolean', description: 'Indicates whether the fiber has a tight jacket or not.' },
    ],
  },

  'Pset_CableSegmentTypeFiberTubeSegment': {
    label:       'Property Set: Cable Segment Type Fiber Tube Segment',
    description: 'Properties of Fiber tubes segments. This property set is applicable to a type or occurrence of [[IfcCableSegment]] with predefined type FIBERTUBESEGMENT.',
    applicableTo: ['IFCCABLESEGMENTFIBERTUBE'],
    props: [
      { name: 'FiberTubeColour', type: 'IfcLabel', description: 'Indicates the colour of a single fiber tube.' },
      { name: 'NumberOfFibers', type: 'IfcInteger', description: 'Indicates the number of fibers in the single tube or cable.' },
    ],
  },

  'Pset_CableSegmentTypeOpticalCableSegment': {
    label:       'Property Set: Cable Segment Type Optical Cable Segment',
    description: 'Properties of optical cables segments. This property set is applicable to a type or occurrence of [[IfcCableSegment]] with predefined type OPTICALCABLESEGMENT.',
    applicableTo: ['IFCCABLESEGMENTOPTICALCABLESEGMENT'],
    props: [
      { name: 'FiberMode', type: 'IfcLabel', description: 'Indicates the fiber mode.' },
      { name: 'NumberOfFibers', type: 'IfcInteger', description: 'Indicates the number of fibers in the single tube or cable.' },
      { name: 'NumberOfMultiModeFibers', type: 'IfcInteger', description: 'Total number of multi-mode fibers in the optical fiber cable.' },
      { name: 'NumberOfSingleModeFibers', type: 'IfcInteger', description: 'Total number of single-mode fibers in the optical fiber cable.' },
      { name: 'NumberOfTubes', type: 'IfcInteger', description: 'Number of fiber tubes.' },
      { name: 'OpticalCableStructure', type: 'IfcLabel', description: 'Distinguishes between different structures of an optical fiber cable.' },
    ],
  },

  'Pset_CableSegmentTypeStitchWire': {
    label:       'Property Set: Cable Segment Type Stitch Wire',
    description: 'Properties of stitch wires. This property set is applicable to a type or occurrence of [[IfcCableSegment]] with predefined type STICHWIRE.',
    applicableTo: ['IFCCABLESEGMENTSTITCHWIRE'],
    props: [
      { name: 'AssemblyInstruction', type: 'IfcTimeSeries', description: 'Instructions to describe how the system / equipment / facility is assembled.' },
      { name: 'MechanicalTension', type: 'IfcReal', description: 'Nominal value of mechanical force applied to a flow segment.' },
      { name: 'NominalLength', type: 'IfcReal', description: 'The nominal overall length of the object. The size information is provided in addition to the shape representation and t' },
      { name: 'TensileStrength', type: 'IfcReal', description: 'Indicates the ability to withstand breakage apart under applied force.' },
      { name: 'UltimateTensileStrength', type: 'IfcReal', description: 'Indicates the maximum stress that a material or element can withstand before breaking while being stretched or pulled.' },
    ],
  },

  'Pset_CableSegmentTypeWirePairSegment': {
    label:       'Property Set: Cable Segment Type Wire Pair Segment',
    description: 'Properties of wire pair segments. This property set is applicable to a type or occurrence of [[IfcCableSegment]] with predefined type WIREPAIRSEGMENT.',
    applicableTo: ['IFCCABLESEGMENTWIREPAIRSEGMENT'],
    props: [
      { name: 'CharacteristicImpedance', type: 'IfcReal', description: '; Z1 = S/ I2; Z2 = U2 / S; Z3 = U / I; where Z is the complex characteristic impedance, S the complex power and U and I' },
      { name: 'ConductorDiameter', type: 'IfcReal', description: 'Indicates the conductor diameter. It is only used for twisted and untwisted wire pair.' },
      { name: 'CoreConductorDiameter', type: 'IfcReal', description: 'Indicates the core conductor diameter. It is only used for coaxial wire pair.' },
      { name: 'JacketColour', type: 'IfcLabel', description: 'Indicates the colour of the cable or fitting jacket.' },
      { name: 'ShieldConductorDiameter', type: 'IfcReal', description: 'Indicates the shielded conductor diameter. It is only used for coaxial wire pair.' },
      { name: 'WirePairType', type: 'IfcLabel', description: 'Indicates the type of wire pair, i.e., twisted, untwisted or coaxial pair.' },
    ],
  },

  'Pset_CargoCommon': {
    label:       'Property Set: Cargo Common',
    description: 'Properties common to the definition of all occurrences of [[IfcTransportElement]] and types of IfcTransportElementType with the predefined type set to CARGO.',
    applicableTo: ['IFCVEHICLECARGO'],
    props: [
      { name: 'AdditionalProcessing', type: 'IfcLabel', description: 'Any additional or special processing requirements on the associated cargo.' },
      { name: 'ProcessDirection', type: 'IfcLabel', description: 'The direction of flow of the cargo within the process.' },
      { name: 'ProcessItem', type: 'IfcLabel', description: 'The type of item (and its measurement method) being modelled within a process. This can be cargo, passengers or vehicles' },
    ],
  },

  'Pset_CessBetweenRails': {
    label:       'Property Set: Cess Between Rails',
    description: 'Properties in this property set are applicable for [[IfcSlab]] with PredefinedType TRACKSLAB, indicated that the slab is a cess or covering between rails.',
    applicableTo: ['IFCSLABTRACKSLAB'],
    props: [
      { name: 'CheckRailType', type: 'IfcLabel', description: 'Type of the check rail. Check rail types enumerated in this property are defined based on EN 13674.' },
      { name: 'JointRelativePosition', type: 'IfcLabel', description: 'Indicates the relative position of the joint, which lies in the left or right rail or in the middle, or in combination.' },
      { name: 'LoadCapacity', type: 'IfcReal', description: 'Indicates the highest permissible load capacity.' },
      { name: 'UsagePurpose', type: 'IfcLabel', description: 'The purpose of usage of the cess between rails, e.g. maintenance, rescue services.' },
    ],
  },

  'Pset_ChillerPHistory': {
    label:       'Property Set: Chiller Phistory',
    description: 'Chiller performance history attributes.',
    applicableTo: ['IFCCHILLER', 'IFCCHILLERAIRCOOLED', 'IFCCHILLERHEATRECOVERY', 'IFCCHILLERWATERCOOLED'],
    props: [
      { name: 'Capacity', type: 'IfcTimeSeries', description: 'The capacity of the element.' },
      { name: 'CoefficientOfPerformance', type: 'IfcTimeSeries', description: 'The Coefficient of performance (COP) is the ratio of heat removed to energy input.; The energy input may be obtained by' },
      { name: 'EnergyEfficiencyRatio', type: 'IfcTimeSeries', description: 'Energy efficiency ratio (EER).' },
    ],
  },

  'Pset_ChillerTypeCommon': {
    label:       'Property Set: Chiller Type Common',
    description: 'Chiller type common attributes.',
    applicableTo: ['IFCCHILLER', 'IFCCHILLERAIRCOOLED', 'IFCCHILLERHEATRECOVERY', 'IFCCHILLERWATERCOOLED'],
    props: [
      { name: 'CapacityCurve', type: 'IfcReal', description: 'Chiller cooling capacity is a function of condensing temperature and evaporating temperature, data is in table form, Cap' },
      { name: 'ChillerCapacity', type: 'IfcReal', description: 'Nominal cooling capacity of chiller at standardized conditions as defined by the agency having jurisdiction.' },
      { name: 'CoefficientOfPerformanceCurve', type: 'IfcReal', description: 'Chiller coefficient of performance (COP) is function of condensing temperature and evaporating temperature, data is in t' },
      { name: 'FullLoadRatioCurve', type: 'IfcReal', description: 'Ratio of actual power to full load power as a quadratic function of part load, at certain condensing and evaporating tem' },
      { name: 'NominalCondensingTemperature', type: 'IfcReal', description: 'Chiller condensing temperature.' },
      { name: 'NominalEfficiency', type: 'IfcReal', description: 'Nominal object efficiency under nominal conditions.' },
      { name: 'NominalEvaporatingTemperature', type: 'IfcReal', description: 'Chiller evaporating temperature.' },
      { name: 'NominalHeatRejectionRate', type: 'IfcReal', description: 'Sum of the refrigeration effect and the heat equivalent of the power input to the compressor.' },
      { name: 'NominalPowerConsumption', type: 'IfcReal', description: 'Nominal total power consumption.' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_ChimneyCommon': {
    label:       'Property Set: Chimney Common',
    description: 'Properties common to the definition of all occurrence and type objects of chimneys.',
    applicableTo: ['IFCCHIMNEY'],
    props: [
      { name: 'FireRating', type: 'IfcLabel', description: 'Fire rating for this object. It is given according to the national fire safety classification.' },
      { name: 'IsExternal', type: 'IfcBoolean', description: 'Indication whether the element is designed for use in the exterior (TRUE) or not (FALSE). If (TRUE) it is an external el' },
      { name: 'LoadBearing', type: 'IfcBoolean', description: 'Indicates whether the object is intended to carry loads (TRUE) or not (FALSE).' },
      { name: 'NumberOfDrafts', type: 'IfcInteger', description: 'Number of the chimney drafts, continuous holes in the chimney through which the air passes, within the single chimney.' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'ThermalTransmittance', type: 'IfcReal', description: 'Thermal transmittance coefficient (U-Value) of an element, within the direction of the thermal flow (including all mater' },
    ],
  },

  'Pset_CoaxialCable': {
    label:       'Property Set: Coaxial Cable',
    description: 'Properties applicable to a coaxial cable, which is a copper cable with a variable number of copper coaxial pair conductors used to transmit data by means of electrical signals, esp',
    applicableTo: ['IFCCABLESEGMENTCABLESEGMENT'],
    props: [
      { name: 'CharacteristicImpedance', type: 'IfcReal', description: '; Z1 = S/ I2; Z2 = U2 / S; Z3 = U / I; where Z is the complex characteristic impedance, S the complex power and U and I' },
      { name: 'CouplingLoss', type: 'IfcReal', description: 'Indicates the coupling loss of a leaky coaxial cable (radiating cable).' },
      { name: 'MaximumTransmissionAttenuation', type: 'IfcReal', description: 'Indicates the Maximum transmission attenuation of feeder.' },
      { name: 'NumberOfCoaxialPairs', type: 'IfcInteger', description: 'Indicates the total number of coaxial pairs in the coaxial cable.' },
      { name: 'PropagationSpeedCoefficient', type: 'IfcReal', description: 'Indicates the propagation speed coefficient.' },
      { name: 'RadiantFrequency', type: 'IfcReal', description: 'Indicates the radiant frequency of the leaky coaxial cable (radiating cable).' },
      { name: 'TransmissionLoss', type: 'IfcReal', description: 'Indicates the transmission loss of the leaky coaxial cable (radiating cable).' },
    ],
  },

  'Pset_CoilOccurrence': {
    label:       'Property Set: Coil Occurrence',
    description: 'Coil occurrence attributes attached to an instance of [[IfcCoil]].',
    applicableTo: ['IFCCOIL', 'IFCCOILDXCOOLINGCOIL', 'IFCCOILELECTRICHEATINGCOIL', 'IFCCOILGASHEATINGCOIL', 'IFCCOILHYDRONICCOIL', 'IFCCOILSTEAMHEATINGCOIL', 'IFCCOILWATERCOOLINGCOIL', 'IFCCOILWATERHEATINGCOIL'],
    props: [
      { name: 'HasSoundAttenuation', type: 'IfcBoolean', description: 'TRUE if the coil has sound attenuation, FALSE if it does not.' },
    ],
  },

  'Pset_CoilPHistory': {
    label:       'Property Set: Coil Phistory',
    description: 'Coil performance history common attributes.;Use IfcSoundProperties instead.',
    applicableTo: ['IFCCOIL', 'IFCCOILDXCOOLINGCOIL', 'IFCCOILELECTRICHEATINGCOIL', 'IFCCOILGASHEATINGCOIL', 'IFCCOILHYDRONICCOIL', 'IFCCOILSTEAMHEATINGCOIL', 'IFCCOILWATERCOOLINGCOIL', 'IFCCOILWATERHEATINGCOIL'],
    props: [
      { name: 'AirPressureDropCurveHistory', type: 'IfcTimeSeries', description: 'Air pressure drop curve, pressure drop flow rate curve, AirPressureDrop = f (AirflowRate).' },
      { name: 'AtmosphericPressure', type: 'IfcTimeSeries', description: 'Ambient atmospheric pressure.' },
      { name: 'FaceVelocity', type: 'IfcTimeSeries', description: 'Air velocity through the coil.' },
      { name: 'SoundCurveHistory', type: 'IfcTimeSeries', description: 'Regenerated sound versus air-flow rate.' },
    ],
  },

  'Pset_CoilTypeCommon': {
    label:       'Property Set: Coil Type Common',
    description: 'Coil type common attributes.',
    applicableTo: ['IFCCOIL', 'IFCCOILDXCOOLINGCOIL', 'IFCCOILELECTRICHEATINGCOIL', 'IFCCOILGASHEATINGCOIL', 'IFCCOILHYDRONICCOIL', 'IFCCOILSTEAMHEATINGCOIL', 'IFCCOILWATERCOOLINGCOIL', 'IFCCOILWATERHEATINGCOIL'],
    props: [
      { name: 'AirFlowRateRange', type: 'IfcReal', description: 'Possible range of airflow that can be delivered.' },
      { name: 'CoilPlacement', type: 'IfcLabel', description: 'Indicates the placement of the coil.; FLOOR indicates an under floor heater (if coil type is WATERHEATINGCOIL or ELECTRI' },
      { name: 'NominalLatentCapacity', type: 'IfcReal', description: 'Nominal latent capacity.' },
      { name: 'NominalSensibleCapacity', type: 'IfcReal', description: 'Nominal sensible capacity.' },
      { name: 'NominalUA', type: 'IfcReal', description: 'Nominal UA value.' },
      { name: 'OperationalTemperatureRange', type: 'IfcReal', description: 'The temperature range in which the device operates normally.' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_CoilTypeHydronic': {
    label:       'Property Set: Coil Type Hydronic',
    description: 'Hydronic coil type attributes.',
    applicableTo: ['IFCCOIL', 'IFCCOILDXCOOLINGCOIL', 'IFCCOILELECTRICHEATINGCOIL', 'IFCCOILGASHEATINGCOIL', 'IFCCOILHYDRONICCOIL', 'IFCCOILSTEAMHEATINGCOIL', 'IFCCOILWATERCOOLINGCOIL', 'IFCCOILWATERHEATINGCOIL'],
    props: [
      { name: 'BypassFactor', type: 'IfcReal', description: 'Fraction of air that is bypassed by the coil (0-1).' },
      { name: 'CoilConnectionDirection', type: 'IfcLabel', description: 'Coil connection direction (facing into the air stream).' },
      { name: 'CoilCoolant', type: 'IfcLabel', description: 'The fluid used for heating or cooling used by the hydronic coil.' },
      { name: 'CoilFaceArea', type: 'IfcReal', description: 'Coil face area in the direction against air the flow.' },
      { name: 'CoilFluidArrangement', type: 'IfcLabel', description: 'Fluid flow arrangement of the coil.Air and water flow enter in different directions.;Air and water flow are perpendicula' },
      { name: 'FluidPressureRange', type: 'IfcReal', description: 'Allowable water working pressure range inside the tube.' },
      { name: 'HeatExchangeSurfaceArea', type: 'IfcReal', description: 'Heat exchange surface area associated with U-value.' },
      { name: 'PrimarySurfaceArea', type: 'IfcReal', description: 'Primary heat transfer surface area of the tubes and headers.' },
      { name: 'SecondarySurfaceArea', type: 'IfcReal', description: 'Secondary heat transfer surface area created by fins.' },
      { name: 'SensibleHeatRatio', type: 'IfcReal', description: 'Air-side sensible heat ratio, or fraction of sensible heat transfer to the total heat transfer.' },
      { name: 'TotalUACurves', type: 'IfcReal', description: 'Total UA curves, UA - air and water velocities, UA = (C1 * AirFlowRate\\0.8)\\-1 + (C2 * WaterFlowRate\\0.8)\\-1\\-1.as two v' },
      { name: 'WaterPressureDropCurve', type: 'IfcReal', description: 'Water pressure drop curve, pressure drop flow rate curve, WaterPressureDrop = f(WaterflowRate).' },
      { name: 'WetCoilFraction', type: 'IfcReal', description: 'Fraction of coil surface area that is wet (0-1).' },
    ],
  },

  'Pset_ColumnCommon': {
    label:       'Property Set: Column Common',
    description: 'Properties common to the definition of all occurrence and type objects of column.',
    applicableTo: ['IFCCOLUMN', 'IFCCOLUMNCOLUMN', 'IFCCOLUMNPIERSTEM', 'IFCCOLUMNPIERSTEM_SEGMENT', 'IFCCOLUMNPILASTER', 'IFCCOLUMNSTANDCOLUMN'],
    props: [
      { name: 'FireRating', type: 'IfcLabel', description: 'Fire rating for this object. It is given according to the national fire safety classification.' },
      { name: 'IsExternal', type: 'IfcBoolean', description: 'Indication whether the element is designed for use in the exterior (TRUE) or not (FALSE). If (TRUE) it is an external el' },
      { name: 'LoadBearing', type: 'IfcBoolean', description: 'Indicates whether the object is intended to carry loads (TRUE) or not (FALSE).' },
      { name: 'Roll', type: 'IfcReal', description: 'Rotation against the longitudinal axis.' },
      { name: 'Slope', type: 'IfcReal', description: 'Slope angle - relative to horizontal (0.0 degrees).The shape information is provided in addition to the shape representa' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'ThermalTransmittance', type: 'IfcReal', description: 'Thermal transmittance coefficient (U-Value) of an element, within the direction of the thermal flow (including all mater' },
    ],
  },

  'Pset_CommunicationsAppliancePHistory': {
    label:       'Property Set: Communications Appliance Phistory',
    description: 'Captures realtime information for communications devices, such as for server farm energy usage.',
    applicableTo: ['IFCCOMMUNICATIONSAPPLIANCE', 'IFCCOMMUNICATIONSAPPLIANCEANTENNA', 'IFCCOMMUNICATIONSAPPLIANCEAUTOMATON', 'IFCCOMMUNICATIONSAPPLIANCECOMPUTER', 'IFCCOMMUNICATIONSAPPLIANCEFAX', 'IFCCOMMUNICATIONSAPPLIANCEGATEWAY', 'IFCCOMMUNICATIONSAPPLIANCEINTELLIGENTPERIPHERAL', 'IFCCOMMUNICATIONSAPPLIANCEIPNETWORKEQUIPMENT', 'IFCCOMMUNICATIONSAPPLIANCELINESIDEELECTRONICUNIT', 'IFCCOMMUNICATIONSAPPLIANCEMODEM', 'IFCCOMMUNICATIONSAPPLIANCENETWORKAPPLIANCE', 'IFCCOMMUNICATIONSAPPLIANCENETWORKBRIDGE', 'IFCCOMMUNICATIONSAPPLIANCENETWORKHUB', 'IFCCOMMUNICATIONSAPPLIANCEOPTICALLINETERMINAL', 'IFCCOMMUNICATIONSAPPLIANCEOPTICALNETWORKUNIT', 'IFCCOMMUNICATIONSAPPLIANCEPRINTER', 'IFCCOMMUNICATIONSAPPLIANCERADIOBLOCKCENTER', 'IFCCOMMUNICATIONSAPPLIANCEREPEATER', 'IFCCOMMUNICATIONSAPPLIANCEROUTER', 'IFCCOMMUNICATIONSAPPLIANCESCANNER', 'IFCCOMMUNICATIONSAPPLIANCETELECOMMAND', 'IFCCOMMUNICATIONSAPPLIANCETELEPHONYEXCHANGE', 'IFCCOMMUNICATIONSAPPLIANCETRANSITIONCOMPONENT', 'IFCCOMMUNICATIONSAPPLIANCETRANSPONDER', 'IFCCOMMUNICATIONSAPPLIANCETRANSPORTEQUIPMENT'],
    props: [
      { name: 'PowerState', type: 'IfcTimeSeries', description: 'Indicates the power state of the device where True is on and False is off.' },
    ],
  },

  'Pset_CommunicationsApplianceTypeAntenna': {
    label:       'Property Set: Communications Appliance Type Antenna',
    description: 'Properties common to an antenna. This property set is applied to a type or occurrence of [[IfcCommunicationsAppliance]] with the predefined type ANTENNA.',
    applicableTo: ['IFCCOMMUNICATIONSAPPLIANCEANTENNA'],
    props: [
      { name: 'AntennaGain', type: 'IfcReal', description: 'Indicates the antenna gain, which is a ratio of the power transmitted by an antenna in a specific direction compared to' },
      { name: 'AntennaType', type: 'IfcLabel', description: 'Indicates the type of antenna.' },
      { name: 'PolarizationMode', type: 'IfcLabel', description: 'Indicates the polarization mode of antenna.' },
      { name: 'RadiationPattern', type: 'IfcLabel', description: 'Indicates the radiation pattern of antenna.' },
    ],
  },

  'Pset_CommunicationsApplianceTypeAutomaton': {
    label:       'Property Set: Communications Appliance Type Automaton',
    description: 'Properties common to automaton appliances. This property set is applied to a type or occurrence of [[IfcCommunicationsAppliance]] with predefined type of AUTOMATON.',
    applicableTo: ['IFCCOMMUNICATIONSAPPLIANCEAUTOMATON'],
    props: [
      { name: 'InputSignalType', type: 'IfcLabel', description: 'The type of the input signal.' },
      { name: 'OutputSignalType', type: 'IfcLabel', description: 'The type of the output signal.' },
    ],
  },

  'Pset_CommunicationsApplianceTypeCommon': {
    label:       'Property Set: Communications Appliance Type Common',
    description: 'Common properties for communications appliances.',
    applicableTo: ['IFCCOMMUNICATIONSAPPLIANCE', 'IFCCOMMUNICATIONSAPPLIANCEANTENNA', 'IFCCOMMUNICATIONSAPPLIANCEAUTOMATON', 'IFCCOMMUNICATIONSAPPLIANCECOMPUTER', 'IFCCOMMUNICATIONSAPPLIANCEFAX', 'IFCCOMMUNICATIONSAPPLIANCEGATEWAY', 'IFCCOMMUNICATIONSAPPLIANCEINTELLIGENTPERIPHERAL', 'IFCCOMMUNICATIONSAPPLIANCEIPNETWORKEQUIPMENT', 'IFCCOMMUNICATIONSAPPLIANCELINESIDEELECTRONICUNIT', 'IFCCOMMUNICATIONSAPPLIANCEMODEM', 'IFCCOMMUNICATIONSAPPLIANCENETWORKAPPLIANCE', 'IFCCOMMUNICATIONSAPPLIANCENETWORKBRIDGE', 'IFCCOMMUNICATIONSAPPLIANCENETWORKHUB', 'IFCCOMMUNICATIONSAPPLIANCEOPTICALLINETERMINAL', 'IFCCOMMUNICATIONSAPPLIANCEOPTICALNETWORKUNIT', 'IFCCOMMUNICATIONSAPPLIANCEPRINTER', 'IFCCOMMUNICATIONSAPPLIANCERADIOBLOCKCENTER', 'IFCCOMMUNICATIONSAPPLIANCEREPEATER', 'IFCCOMMUNICATIONSAPPLIANCEROUTER', 'IFCCOMMUNICATIONSAPPLIANCESCANNER', 'IFCCOMMUNICATIONSAPPLIANCETELECOMMAND', 'IFCCOMMUNICATIONSAPPLIANCETELEPHONYEXCHANGE', 'IFCCOMMUNICATIONSAPPLIANCETRANSITIONCOMPONENT', 'IFCCOMMUNICATIONSAPPLIANCETRANSPONDER', 'IFCCOMMUNICATIONSAPPLIANCETRANSPORTEQUIPMENT'],
    props: [
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_CommunicationsApplianceTypeComputer': {
    label:       'Property Set: Communications Appliance Type Computer',
    description: 'Properties common to a computer. This property set is applied to a type or occurrence of [[IfcCommunicationsAppliance]] with predefined type of COMPUTER.',
    applicableTo: ['IFCCOMMUNICATIONSAPPLIANCECOMPUTER'],
    props: [
      { name: 'StorageCapacity', type: 'IfcInteger', description: 'Indicates the total data storage capacity of the device. It is defined by bytes.' },
      { name: 'UserInterfaceType', type: 'IfcLabel', description: 'Indicates the user interface of the computer.' },
    ],
  },

  'Pset_CommunicationsApplianceTypeGateway': {
    label:       'Property Set: Communications Appliance Type Gateway',
    description: 'Properties common to a gateway. This property set is applied to a type or occurrence of [[IfcCommunicationsAppliance]] with predefined type of GATEWAY.',
    applicableTo: ['IFCCOMMUNICATIONSAPPLIANCEGATEWAY'],
    props: [
      { name: 'NumberOfInterfaces', type: 'IfcInteger', description: 'Indicates the types of interfaces and their number in the device.' },
    ],
  },

  'Pset_CommunicationsApplianceTypeIntelligentPeriphe': {
    label:       'Property Set: Communications Appliance Type Intelligent Peripheral',
    description: 'Properties common to a intelligent peripheral. This property set is applied to a type or occurrence of [[IfcCommunicationsAppliance]] with predefined type of INTELLIGENT_PERIPHERAL',
    applicableTo: ['IFCCOMMUNICATIONSAPPLIANCEINTELLIGENTPERIPHERAL'],
    props: [
    ],
  },

  'Pset_CommunicationsApplianceTypeIpNetworkEquipment': {
    label:       'Property Set: Communications Appliance Type Ip Network Equipment',
    description: 'Properties common to a IP network equipment. This property set is applied to a type or occurrence of [[IfcCommunicationsAppliance]] with predefined type of IP_NETWORK_EQUIPMENT.',
    applicableTo: ['IFCCOMMUNICATIONSAPPLIANCEIPNETWORKEQUIPMENT'],
    props: [
      { name: 'EquipmentCapacity', type: 'IfcInteger', description: 'Indicates the equipment capacity of the appliance. The value is defined in bits/s.' },
      { name: 'ManagingSoftware', type: 'IfcLabel', description: 'Indicates the type of software responsible for managing the equipment.' },
      { name: 'NumberOfCoolingFans', type: 'IfcInteger', description: 'Indicates the number of cooling fans in the equipment.' },
      { name: 'NumberOfInterfaces', type: 'IfcInteger', description: 'Indicates the types of interfaces and their number in the device.' },
      { name: 'NumberOfSlots', type: 'IfcInteger', description: 'Indicates the number of slots.' },
      { name: 'SupportedProtocol', type: 'IfcLabel', description: 'Indicates the protocol supported by the IP network equipment.' },
    ],
  },

  'Pset_CommunicationsApplianceTypeModem': {
    label:       'Property Set: Communications Appliance Type Modem',
    description: 'Properties common to a modem. This property set is applied to a type or occurrence of [[IfcCommunicationsAppliance]] with predefined type MODEM.',
    applicableTo: ['IFCCOMMUNICATIONSAPPLIANCEMODEM'],
    props: [
      { name: 'CommonInterfaceType', type: 'IfcLabel', description: 'Indicates the type of the device common interfaces.' },
      { name: 'NumberOfCommonInterfaces', type: 'IfcInteger', description: 'Indicates the number of common interfaces on the device.' },
      { name: 'NumberOfTrafficInterfaces', type: 'IfcInteger', description: 'Indicates the number of traffic interfaces on the device.' },
      { name: 'TrafficInterfaceType', type: 'IfcLabel', description: 'Indicates the type of the device traffic interfaces.' },
    ],
  },

  'Pset_CommunicationsApplianceTypeOpticalLineTermina': {
    label:       'Property Set: Communications Appliance Type Optical Line Terminal',
    description: 'Properties common to a optical line terminal. This property set is applied to a type or occurrence of [[IfcCommunicationsAppliance]] with predefined type OPTICALLINETERMINAL.',
    applicableTo: ['IFCCOMMUNICATIONSAPPLIANCEOPTICALLINETERMINAL'],
    props: [
    ],
  },

  'Pset_CommunicationsApplianceTypeOpticalNetworkUnit': {
    label:       'Property Set: Communications Appliance Type Optical Network Unit',
    description: 'Properties common to a optical network unit. This property set is applied to a type or occurrence of [[IfcCommunicationsAppliance]] with predefined type OPTICAL_NETWORK_UNIT.',
    applicableTo: ['IFCCOMMUNICATIONSAPPLIANCEOPTICALNETWORKUNIT'],
    props: [
      { name: 'NumberOfInterfaces', type: 'IfcInteger', description: 'Indicates the types of interfaces and their number in the device.' },
      { name: 'OpticalNetworkUnitType', type: 'IfcLabel', description: 'Indicates the type of the optical network unit equipment.' },
    ],
  },

  'Pset_CommunicationsApplianceTypeTelecommand': {
    label:       'Property Set: Communications Appliance Type Telecommand',
    description: 'Properties common to a telecommand. This property set is applied to a type or occurrence of [[IfcCommunicationsAppliance]] with predefined type TELECOMMAND.',
    applicableTo: ['IFCCOMMUNICATIONSAPPLIANCETELECOMMAND'],
    props: [
      { name: 'NumberOfCPUs', type: 'IfcInteger', description: 'The number of CPUs used by the equipment.' },
      { name: 'NumberOfWorkstations', type: 'IfcInteger', description: 'Indicates the types or purposes of workstations and their number in the equipment. The defined purpose can be e.g. \\\'Diag' },
    ],
  },

  'Pset_CommunicationsApplianceTypeTelephonyExchange': {
    label:       'Property Set: Communications Appliance Type Telephony Exchange',
    description: 'Properties common to a telephony exchange. This property set is applied to a type or occurrence of [[IfcCommunicationsAppliance]] with predefined type TELEPHONYEX',
    applicableTo: ['IFCCOMMUNICATIONSAPPLIANCETELEPHONYEXCHANGE'],
    props: [
      { name: 'UserCapacity', type: 'IfcInteger', description: 'Indicates the user capacity of the device, defined as the maximum number of users that can be active at the same time.' },
    ],
  },

  'Pset_CommunicationsApplianceTypeTransportEquipment': {
    label:       'Property Set: Communications Appliance Type Transport Equipment',
    description: 'Properties common to a transport equipment. This property set is applied to a type or occurrence of [[IfcCommunicationsAppliance]] with predefined type TRANSPORTEQUIPMENT.',
    applicableTo: ['IFCCOMMUNICATIONSAPPLIANCETRANSPORTEQUIPMENT'],
    props: [
      { name: 'ElectricalCrossCapacity', type: 'IfcLabel', description: 'Indicates the electrical cross capacity of the transport equipment.' },
      { name: 'IsUpgradable', type: 'IfcBoolean', description: 'Indicates whether the transport equipment can be upgraded or not.' },
      { name: 'NumberOfSlots', type: 'IfcInteger', description: 'Indicates the number of slots.' },
      { name: 'TransportEquipmentAssemblyType', type: 'IfcLabel', description: 'Indicates the type of transport equipment assembly.' },
      { name: 'TransportEquipmentType', type: 'IfcLabel', description: 'Indicates the type of transport equipment.' },
    ],
  },

  'Pset_CompressorPHistory': {
    label:       'Property Set: Compressor Phistory',
    description: 'Compressor performance history attributes.',
    applicableTo: ['IFCCOMPRESSOR', 'IFCCOMPRESSORBOOSTER', 'IFCCOMPRESSORDYNAMIC', 'IFCCOMPRESSORHERMETIC', 'IFCCOMPRESSOROPENTYPE', 'IFCCOMPRESSORRECIPROCATING', 'IFCCOMPRESSORROLLINGPISTON', 'IFCCOMPRESSORROTARY', 'IFCCOMPRESSORROTARYVANE', 'IFCCOMPRESSORSCROLL', 'IFCCOMPRESSORSEMIHERMETIC', 'IFCCOMPRESSORSINGLESCREW', 'IFCCOMPRESSORSINGLESTAGE', 'IFCCOMPRESSORTROCHOIDAL', 'IFCCOMPRESSORTWINSCREW', 'IFCCOMPRESSORWELDEDSHELLHERMETIC'],
    props: [
      { name: 'CoefficientOfPerformance', type: 'IfcTimeSeries', description: 'The Coefficient of performance (COP) is the ratio of heat removed to energy input.; The energy input may be obtained by' },
      { name: 'CompressionEfficiency', type: 'IfcTimeSeries', description: 'Ratio of the work required for isentropic compression of the gas to the work delivered to the gas within the compression' },
      { name: 'CompressorCapacity', type: 'IfcTimeSeries', description: 'The product of the ideal capacity and the overall volumetric efficiency of the compressor.' },
      { name: 'CompressorTotalEfficiency', type: 'IfcTimeSeries', description: 'Ratio of the thermal cooling capacity to electrical input.' },
      { name: 'CompressorTotalHeatGain', type: 'IfcTimeSeries', description: 'Compressor total heat gain.' },
      { name: 'EnergyEfficiencyRatio', type: 'IfcTimeSeries', description: 'Energy efficiency ratio (EER).' },
      { name: 'FrictionHeatGain', type: 'IfcTimeSeries', description: 'Friction heat gain.' },
      { name: 'FullLoadRatio', type: 'IfcTimeSeries', description: 'Ratio of actual power to full load power as a quadratic function of part load, at certain condensing and evaporating tem' },
      { name: 'InputPower', type: 'IfcTimeSeries', description: 'Input power to the compressor motor.' },
      { name: 'IsentropicEfficiency', type: 'IfcTimeSeries', description: 'Ratio of the work required for isentropic compression of the gas to work input to the compressor shaft.' },
      { name: 'LubricantPumpHeatGain', type: 'IfcTimeSeries', description: 'Lubricant pump heat gain.' },
      { name: 'MechanicalEfficiency', type: 'IfcTimeSeries', description: 'The objects operational mechanical efficiency.' },
      { name: 'ShaftPower', type: 'IfcTimeSeries', description: 'The actual shaft power input to the compressor.' },
      { name: 'VolumetricEfficiency', type: 'IfcTimeSeries', description: 'Ratio of the actual volume of gas entering the compressor to the theoretical displacement of the compressor.' },
    ],
  },

  'Pset_CompressorTypeCommon': {
    label:       'Property Set: Compressor Type Common',
    description: 'Compressor type common attributes.',
    applicableTo: ['IFCCOMPRESSOR', 'IFCCOMPRESSORBOOSTER', 'IFCCOMPRESSORDYNAMIC', 'IFCCOMPRESSORHERMETIC', 'IFCCOMPRESSOROPENTYPE', 'IFCCOMPRESSORRECIPROCATING', 'IFCCOMPRESSORROLLINGPISTON', 'IFCCOMPRESSORROTARY', 'IFCCOMPRESSORROTARYVANE', 'IFCCOMPRESSORSCROLL', 'IFCCOMPRESSORSEMIHERMETIC', 'IFCCOMPRESSORSINGLESCREW', 'IFCCOMPRESSORSINGLESTAGE', 'IFCCOMPRESSORTROCHOIDAL', 'IFCCOMPRESSORTWINSCREW', 'IFCCOMPRESSORWELDEDSHELLHERMETIC'],
    props: [
      { name: 'CompressorSpeed', type: 'IfcReal', description: 'Compressor speed.' },
      { name: 'HasHotGasBypass', type: 'IfcBoolean', description: 'Whether or not hot gas bypass is provided for the compressor. TRUE = Yes, FALSE = No.' },
      { name: 'IdealCapacity', type: 'IfcReal', description: 'Compressor capacity under ideal conditions.' },
      { name: 'IdealShaftPower', type: 'IfcReal', description: 'Compressor shaft power under ideal conditions.' },
      { name: 'ImpellerDiameter', type: 'IfcReal', description: 'Diameter of object - used to scale performance of geometrically similar objects.' },
      { name: 'MaximumPartLoadRatio', type: 'IfcReal', description: 'Maximum part load ratio as a fraction of nominal capacity.' },
      { name: 'MinimumPartLoadRatio', type: 'IfcReal', description: 'Minimum part load ratio as a fraction of nominal capacity.' },
      { name: 'NominalCapacity', type: 'IfcReal', description: 'The total nominal or volumetric capacity of the object.' },
      { name: 'PowerSource', type: 'IfcLabel', description: 'Type of power driving the compressor.' },
      { name: 'RefrigerantClass', type: 'IfcLabel', description: 'Refrigerant class used by the object.;Chlorofluorocarbons.;Hydrochlorofluorocarbons.;Hydrofluorocarbons.' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_ConcreteElementGeneral': {
    label:       'Property Set: Concrete Element General',
    description: 'General properties common to different types of concrete elements, including reinforced concrete elements. The property set can be used by a number of subtypes of [[IfcBuiltElement',
    applicableTo: ['IFCBEAM', 'IFCBEAMBEAM', 'IFCBEAMCORNICE', 'IFCBEAMDIAPHRAGM', 'IFCBEAMEDGEBEAM', 'IFCBEAMGIRDER_SEGMENT', 'IFCBEAMHATSTONE', 'IFCBEAMHOLLOWCORE', 'IFCBEAMJOIST', 'IFCBEAMLINTEL', 'IFCBEAMPIERCAP', 'IFCBEAMSPANDREL', 'IFCBEAMT_BEAM', 'IFCBUILDINGELEMENTPROXY', 'IFCCHIMNEY', 'IFCCOLUMN', 'IFCCOLUMNCOLUMN', 'IFCCOLUMNPIERSTEM', 'IFCCOLUMNPIERSTEM_SEGMENT', 'IFCCOLUMNPILASTER', 'IFCCOLUMNSTANDCOLUMN', 'IFCFOOTING', 'IFCFOOTINGCAISSON_FOUNDATION', 'IFCFOOTINGFOOTING_BEAM', 'IFCFOOTINGPAD_FOOTING', 'IFCFOOTINGPILE_CAP', 'IFCFOOTINGSTRIP_FOOTING', 'IFCMEMBER', 'IFCMEMBERARCH_SEGMENT', 'IFCMEMBERBRACE', 'IFCMEMBERCHORD', 'IFCMEMBERCOLLAR', 'IFCMEMBERMEMBER', 'IFCMEMBERMULLION', 'IFCMEMBERPLATE', 'IFCMEMBERPOST', 'IFCMEMBERPURLIN', 'IFCMEMBERRAFTER', 'IFCMEMBERSTAY_CABLE', 'IFCMEMBERSTIFFENING_RIB', 'IFCMEMBERSTRINGER', 'IFCMEMBERSTRUCTURALCABLE', 'IFCMEMBERSTRUT', 'IFCMEMBERSTUD', 'IFCMEMBERSUSPENDER', 'IFCMEMBERSUSPENSION_CABLE', 'IFCMEMBERTIEBAR', 'IFCPILE', 'IFCPILEBORED', 'IFCPILECOHESION', 'IFCPILEDRIVEN', 'IFCPILEFRICTION', 'IFCPILEJETGROUTING', 'IFCPILESUPPORT', 'IFCPLATE', 'IFCPLATEBASE_PLATE', 'IFCPLATECOVER_PLATE', 'IFCPLATECURTAIN_PANEL', 'IFCPLATEFLANGE_PLATE', 'IFCPLATEGUSSET_PLATE', 'IFCPLATESHEET', 'IFCPLATESPLICE_PLATE', 'IFCPLATESTIFFENER_PLATE', 'IFCPLATEWEB_PLATE', 'IFCRAILING', 'IFCRAILINGBALUSTRADE', 'IFCRAILINGFENCE', 'IFCRAILINGGUARDRAIL', 'IFCRAILINGHANDRAIL', 'IFCRAMP', 'IFCRAMPFLIGHT', 'IFCRAMPFLIGHTSPIRAL', 'IFCRAMPFLIGHTSTRAIGHT', 'IFCRAMPHALF_TURN_RAMP', 'IFCRAMPQUARTER_TURN_RAMP', 'IFCRAMPSPIRAL_RAMP', 'IFCRAMPSTRAIGHT_RUN_RAMP', 'IFCRAMPTWO_QUARTER_TURN_RAMP', 'IFCRAMPTWO_STRAIGHT_RUN_RAMP', 'IFCROOF', 'IFCROOFBARREL_ROOF', 'IFCROOFBUTTERFLY_ROOF', 'IFCROOFDOME_ROOF', 'IFCROOFFLAT_ROOF', 'IFCROOFFREEFORM', 'IFCROOFGABLE_ROOF', 'IFCROOFGAMBREL_ROOF', 'IFCROOFHIPPED_GABLE_ROOF', 'IFCROOFHIP_ROOF', 'IFCROOFMANSARD_ROOF', 'IFCROOFPAVILION_ROOF', 'IFCROOFRAINBOW_ROOF', 'IFCROOFSHED_ROOF', 'IFCSLAB', 'IFCSLABAPPROACH_SLAB', 'IFCSLABBASESLAB', 'IFCSLABFLOOR', 'IFCSLABLANDING', 'IFCSLABPAVING', 'IFCSLABROOF', 'IFCSLABSIDEWALK', 'IFCSLABTRACKSLAB', 'IFCSLABWEARING', 'IFCSTAIR', 'IFCSTAIRCURVED_RUN_STAIR', 'IFCSTAIRDOUBLE_RETURN_STAIR', 'IFCSTAIRFLIGHT', 'IFCSTAIRFLIGHTCURVED', 'IFCSTAIRFLIGHTFREEFORM', 'IFCSTAIRFLIGHTSPIRAL', 'IFCSTAIRFLIGHTSTRAIGHT', 'IFCSTAIRFLIGHTWINDER', 'IFCSTAIRHALF_TURN_STAIR', 'IFCSTAIRHALF_WINDING_STAIR', 'IFCSTAIRLADDER', 'IFCSTAIRQUARTER_TURN_STAIR', 'IFCSTAIRQUARTER_WINDING_STAIR', 'IFCSTAIRSPIRAL_STAIR', 'IFCSTAIRSTRAIGHT_RUN_STAIR', 'IFCSTAIRTHREE_QUARTER_TURN_STAIR', 'IFCSTAIRTHREE_QUARTER_WINDING_STAIR', 'IFCSTAIRTWO_CURVED_RUN_STAIR', 'IFCSTAIRTWO_QUARTER_TURN_STAIR', 'IFCSTAIRTWO_QUARTER_WINDING_STAIR', 'IFCSTAIRTWO_STRAIGHT_RUN_STAIR', 'IFCWALL', 'IFCWALLELEMENTEDWALL', 'IFCWALLMOVABLE', 'IFCWALLPARAPET', 'IFCWALLPARTITIONING', 'IFCWALLPLUMBINGWALL', 'IFCWALLPOLYGONAL', 'IFCWALLRETAININGWALL', 'IFCWALLSHEAR', 'IFCWALLSOLIDWALL', 'IFCWALLSTANDARD', 'IFCWALLWAVEWALL'],
    props: [
      { name: 'AssemblyPlace', type: 'IfcLabel', description: 'Enumeration defining where the assembly is intended to take place, either in a factory, other offsite location or on the' },
      { name: 'CastingMethod', type: 'IfcLabel', description: 'The method of casting the concrete into its designed form.' },
      { name: 'ConcreteCover', type: 'IfcReal', description: 'The protective concrete cover at the reinforcing bars according to local building regulations.' },
      { name: 'ConcreteCoverAtLinks', type: 'IfcReal', description: 'The protective concrete cover at the reinforcement links according to local building regulations.' },
      { name: 'ConcreteCoverAtMainBars', type: 'IfcReal', description: 'The protective concrete cover at the main reinforcing bars according to local building regulations.' },
      { name: 'ConstructionToleranceClass', type: 'IfcLabel', description: 'Classification designation of the on-site construction tolerances according to local standards.' },
      { name: 'DimensionalAccuracyClass', type: 'IfcLabel', description: 'Classification designation of the dimensional accuracy requirement according to local standards.' },
      { name: 'ExposureClass', type: 'IfcLabel', description: 'Classification of exposure to environmental conditions, usually specified in accordance with the concrete design code wh' },
      { name: 'ReinforcementAreaRatio', type: 'IfcReal', description: 'The required ratio of the effective area of the reinforcement to the effective area of the concrete At any section of a' },
      { name: 'ReinforcementStrengthClass', type: 'IfcLabel', description: 'Classification of the reinforcement strength in accordance with the concrete design code which is applied in the project' },
      { name: 'ReinforcementVolumeRatio', type: 'IfcReal', description: 'The required ratio of the effective mass of the reinforcement to the effective volume of the concrete of a reinforced co' },
      { name: 'StrengthClass', type: 'IfcLabel', description: 'Classification of the concrete strength in accordance with the concrete design code which is applied in the project.' },
      { name: 'StructuralClass', type: 'IfcLabel', description: 'The structural class defined for the concrete structure (e.g. \\\'1\\\').' },
    ],
  },

  'Pset_CondenserPHistory': {
    label:       'Property Set: Condenser Phistory',
    description: 'Condenser performance history attributes.',
    applicableTo: ['IFCCONDENSER', 'IFCCONDENSERAIRCOOLED', 'IFCCONDENSEREVAPORATIVECOOLED', 'IFCCONDENSERWATERCOOLED', 'IFCCONDENSERWATERCOOLEDBRAZEDPLATE', 'IFCCONDENSERWATERCOOLEDSHELLCOIL', 'IFCCONDENSERWATERCOOLEDSHELLTUBE', 'IFCCONDENSERWATERCOOLEDTUBEINTUBE'],
    props: [
      { name: 'CompressorCondenserHeatGain', type: 'IfcTimeSeries', description: 'Heat gain between condenser inlet to compressor outlet.' },
      { name: 'CompressorCondenserPressureDrop', type: 'IfcTimeSeries', description: 'Pressure drop between condenser inlet and compressor outlet.' },
      { name: 'CondenserMeanVoidFraction', type: 'IfcTimeSeries', description: 'Mean void fraction in condenser.' },
      { name: 'CondensingTemperature', type: 'IfcTimeSeries', description: 'Refrigerant condensing temperature.' },
      { name: 'ExteriorHeatTransferCoefficient', type: 'IfcTimeSeries', description: 'Exterior heat transfer coefficient associated with exterior surface area.' },
      { name: 'HeatRejectionRate', type: 'IfcTimeSeries', description: 'Sum of the refrigeration effect and the heat equivalent of the power input to the compressor.' },
      { name: 'InteriorHeatTransferCoefficient', type: 'IfcTimeSeries', description: 'Interior heat transfer coefficient associated with interior surface area.' },
      { name: 'LogarithmicMeanTemperatureDifference', type: 'IfcTimeSeries', description: 'Logarithmic mean temperature difference between refrigerant and water or air.' },
      { name: 'RefrigerantFoulingResistance', type: 'IfcTimeSeries', description: 'Fouling resistance on the refrigerant side.' },
      { name: 'UAcurves', type: 'IfcTimeSeries', description: 'UV = f (VExterior, VInterior), UV as a function of interior and exterior fluid flow velocity at the entrance.' },
      { name: 'WaterFoulingResistance', type: 'IfcTimeSeries', description: 'Fouling resistance on water/air side.' },
    ],
  },

  'Pset_CondenserTypeCommon': {
    label:       'Property Set: Condenser Type Common',
    description: 'Condenser type common attributes.',
    applicableTo: ['IFCCONDENSER', 'IFCCONDENSERAIRCOOLED', 'IFCCONDENSEREVAPORATIVECOOLED', 'IFCCONDENSERWATERCOOLED', 'IFCCONDENSERWATERCOOLEDBRAZEDPLATE', 'IFCCONDENSERWATERCOOLEDSHELLCOIL', 'IFCCONDENSERWATERCOOLEDSHELLTUBE', 'IFCCONDENSERWATERCOOLEDTUBEINTUBE'],
    props: [
      { name: 'ExternalSurfaceArea', type: 'IfcReal', description: 'External surface area (both primary and secondary area).' },
      { name: 'InternalRefrigerantVolume', type: 'IfcReal', description: 'Internal volume of object (refrigerant side).' },
      { name: 'InternalSurfaceArea', type: 'IfcReal', description: 'Internal surface area.' },
      { name: 'InternalWaterVolume', type: 'IfcReal', description: 'Internal volume of object (water side).' },
      { name: 'NominalHeatTransferArea', type: 'IfcReal', description: 'Nominal heat transfer surface area associated with nominal overall heat transfer coefficient.' },
      { name: 'NominalHeatTransferCoefficient', type: 'IfcReal', description: 'Nominal overall heat transfer coefficient associated with nominal heat transfer area.' },
      { name: 'RefrigerantClass', type: 'IfcLabel', description: 'Refrigerant class used by the object.;Chlorofluorocarbons.;Hydrochlorofluorocarbons.;Hydrofluorocarbons.' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_Condition': {
    label:       'Property Set: Condition',
    description: 'Determines the state or condition of an element at a particular point in time.',
    applicableTo: ['*'],
    props: [
      { name: 'AssessmentCondition', type: 'IfcLabel', description: 'The overall condition of a product based on an assessment of the contributions to the overall condition made by the vari' },
      { name: 'AssessmentDate', type: 'IfcLabel', description: 'Date on which the overall condition is assessed' },
      { name: 'AssessmentDescription', type: 'IfcLabel', description: 'Qualitative description of the condition.' },
      { name: 'AssessmentFrequency', type: 'IfcReal', description: 'Indicates how often the equipment should be assessed, to have a clear estimation on its working state, based on which th' },
      { name: 'AssessmentMethod', type: 'IfcTimeSeries', description: 'External reference to assessment method or application used to perform the assessment.' },
      { name: 'AssessmentType', type: 'IfcLabel', description: 'Category of latest condition assessment report of the asset.' },
      { name: 'LastAssessmentReport', type: 'IfcLabel', description: 'Reference to latest condition (state of health) report.' },
      { name: 'NextAssessmentDate', type: 'IfcLabel', description: 'Date of next condition inspection' },
    ],
  },

  'Pset_ConstructionAdministration': {
    label:       'Property Set: Construction Administration',
    description: 'Properties for [[Construction]] Administration. Often used for facility and asset management.',
    applicableTo: ['*'],
    props: [
      { name: 'ProcurementMethod', type: 'IfcLabel', description: 'The method by which an IfcProductType/IfcProduct is acquired and installed.CFCI (meaning Contractor Furnished Contractor' },
      { name: 'SpecificationSectionNumber', type: 'IfcLabel', description: 'A reference number to an external contract technical specification section describing either (a) minimum performance req' },
      { name: 'SubmittalIdentifer', type: 'IfcLabel', description: 'The reference number to an external construction administration submittal used by the construction contractor and/or sub' },
    ],
  },

  'Pset_ConstructionOccurence': {
    label:       'Property Set: Construction Occurence',
    description: 'Property set for construction occurrence.',
    applicableTo: ['*'],
    props: [
      { name: 'AssetIdentifier', type: 'IfcLabel', description: 'A unique identification assigned to an asset that enables its differentiation from other assets.' },
      { name: 'InstallationDate', type: 'IfcLabel', description: 'Date on which the element is installed.' },
      { name: 'ModelNumber', type: 'IfcLabel', description: 'The model number and/or unit designator assigned by the manufacturer of the manufactured item.' },
      { name: 'TagNumber', type: 'IfcLabel', description: 'Tag number.' },
    ],
  },

  'Pset_ControllerPHistory': {
    label:       'Property Set: Controller Phistory',
    description: 'Properties for history of controller values.',
    applicableTo: ['IFCCONTROLLER', 'IFCCONTROLLERFLOATING', 'IFCCONTROLLERMULTIPOSITION', 'IFCCONTROLLERPROGRAMMABLE', 'IFCCONTROLLERPROPORTIONAL', 'IFCCONTROLLERTWOPOSITION'],
    props: [
      { name: 'Quality', type: 'IfcTimeSeries', description: 'Indicates the quality of measurement or failure condition, which may be further qualified by the Status.measured values' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'ValueHistory', type: 'IfcTimeSeries', description: 'Indicates values over time which may be recorded continuously or only when changed beyond a particular deadband. The ran' },
    ],
  },

  'Pset_ControllerTypeCommon': {
    label:       'Property Set: Controller Type Common',
    description: 'Controller type common attributes.',
    applicableTo: ['IFCCONTROLLER', 'IFCCONTROLLERFLOATING', 'IFCCONTROLLERMULTIPOSITION', 'IFCCONTROLLERPROGRAMMABLE', 'IFCCONTROLLERPROPORTIONAL', 'IFCCONTROLLERTWOPOSITION'],
    props: [
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_ControllerTypeFloating': {
    label:       'Property Set: Controller Type Floating',
    description: 'Properties for signal handling for an analog controller taking disparate valued multiple inputs and creating a single valued output.',
    applicableTo: ['IFCCONTROLLERFLOATING'],
    props: [
      { name: 'ControlType', type: 'IfcLabel', description: 'The type controller, signal modification effected and applicable ports' },
      { name: 'Labels', type: 'IfcLabel', description: 'Table mapping values to labels' },
      { name: 'Range', type: 'IfcReal', description: 'The physical range of values supported by the device.' },
      { name: 'SignalFactor', type: 'IfcReal', description: 'Factor multiplied onto offset signal.' },
      { name: 'SignalOffset', type: 'IfcReal', description: 'Offset constant added to modified signal.' },
      { name: 'SignalTime', type: 'IfcReal', description: 'Time factor used for integral and running average controllers.' },
      { name: 'Value', type: 'IfcTimeSeries', description: 'The expected range and default value.' },
    ],
  },

  'Pset_ControllerTypeMultiPosition': {
    label:       'Property Set: Controller Type Multi Position',
    description: 'Properties for discrete inputs, outputs, and values within a programmable logic controller.',
    applicableTo: ['IFCCONTROLLERMULTIPOSITION'],
    props: [
      { name: 'ControlType', type: 'IfcLabel', description: 'The type controller, signal modification effected and applicable ports' },
      { name: 'IntegerRange', type: 'IfcInteger', description: 'The physical range of values supported by the device.' },
      { name: 'Labels', type: 'IfcLabel', description: 'Table mapping values to labels' },
      { name: 'Value', type: 'IfcTimeSeries', description: 'The expected range and default value.' },
    ],
  },

  'Pset_ControllerTypeProgrammable': {
    label:       'Property Set: Controller Type Programmable',
    description: 'Properties for Discrete Digital Control (DDC) or programmable logic controllers.',
    applicableTo: ['IFCCONTROLLERPROGRAMMABLE'],
    props: [
      { name: 'Application', type: 'IfcLabel', description: 'Indicates application of controller.' },
      { name: 'ControlType', type: 'IfcLabel', description: 'The type controller, signal modification effected and applicable ports' },
      { name: 'FirmwareVersion', type: 'IfcLabel', description: 'Indicates version of device firmware according to device manufacturer.' },
      { name: 'SoftwareVersion', type: 'IfcLabel', description: 'Indicates version of application software according to systems integrator.' },
    ],
  },

  'Pset_ControllerTypeProportional': {
    label:       'Property Set: Controller Type Proportional',
    description: 'Properties for signal handling for an proportional controller taking setpoint and feedback inputs and creating a single valued output.',
    applicableTo: ['IFCCONTROLLERPROPORTIONAL'],
    props: [
      { name: 'ControlType', type: 'IfcLabel', description: 'The type controller, signal modification effected and applicable ports' },
      { name: 'DerivativeConstant', type: 'IfcReal', description: 'The derivative gain factor of the controller (usually referred to as Kd). Asserted where ControlType is PROPORTIONALINTE' },
      { name: 'IntegralConstant', type: 'IfcReal', description: 'The integral gain factor of the controller (usually referred to as Ki). Asserted where ControlType is PROPORTIONALINTEGR' },
      { name: 'Labels', type: 'IfcLabel', description: 'Table mapping values to labels' },
      { name: 'ProportionalConstant', type: 'IfcReal', description: 'The proportional gain factor of the controller (usually referred to as Kp).' },
      { name: 'Range', type: 'IfcReal', description: 'The physical range of values supported by the device.' },
      { name: 'SignalTimeDecrease', type: 'IfcReal', description: 'Time factor used for exponential decrease.' },
      { name: 'SignalTimeIncrease', type: 'IfcReal', description: 'Time factor used for exponential increase.' },
      { name: 'Value', type: 'IfcTimeSeries', description: 'The expected range and default value.' },
    ],
  },

  'Pset_ControllerTypeTwoPosition': {
    label:       'Property Set: Controller Type Two Position',
    description: 'Properties for signal handling for an analog controller taking disparate valued multiple inputs and creating a single valued binary output.',
    applicableTo: ['IFCCONTROLLERTWOPOSITION'],
    props: [
      { name: 'ControlType', type: 'IfcLabel', description: 'The type controller, signal modification effected and applicable ports' },
      { name: 'Labels', type: 'IfcLabel', description: 'Table mapping values to labels' },
      { name: 'Polarity', type: 'IfcBoolean', description: 'True indicates normal polarity; False indicates reverse polarity.' },
      { name: 'Value', type: 'IfcTimeSeries', description: 'The expected range and default value.' },
    ],
  },

  'Pset_CooledBeamPHistory': {
    label:       'Property Set: Cooled Beam Phistory',
    description: 'Common performance history attributes for a cooled beam.',
    applicableTo: ['IFCCOOLEDBEAM', 'IFCCOOLEDBEAMACTIVE', 'IFCCOOLEDBEAMPASSIVE'],
    props: [
      { name: 'BeamCoolingCapacity', type: 'IfcTimeSeries', description: 'Cooling capacity of beam. This excludes cooling capacity of supply air.' },
      { name: 'BeamHeatingCapacity', type: 'IfcTimeSeries', description: 'Heating capacity of beam. This excludes heating capacity of supply air.' },
      { name: 'CoolingWaterFlowRate', type: 'IfcTimeSeries', description: 'Water flow rate for cooling.' },
      { name: 'CorrectionFactorForCooling', type: 'IfcTimeSeries', description: 'Correction factor k as a function of water flow rate (used to calculate cooling capacity).' },
      { name: 'CorrectionFactorForHeating', type: 'IfcTimeSeries', description: 'Correction factor k as a function of water flow rate (used to calculate heating capacity).' },
      { name: 'HeatingWaterFlowRate', type: 'IfcTimeSeries', description: 'Water flow rate for heating.' },
      { name: 'ReturnWaterTemperatureCooling', type: 'IfcTimeSeries', description: 'Return water temperature in cooling mode.' },
      { name: 'ReturnWaterTemperatureHeating', type: 'IfcTimeSeries', description: 'Return water temperature in heating mode.' },
      { name: 'SupplyWaterTemperatureCooling', type: 'IfcTimeSeries', description: 'Supply water temperature in cooling mode.' },
      { name: 'SupplyWaterTemperatureHeating', type: 'IfcTimeSeries', description: 'Supply water temperature in heating mode.' },
      { name: 'TotalCoolingCapacity', type: 'IfcTimeSeries', description: 'Total cooling capacity. This includes cooling capacity of beam and cooling capacity of supply air.' },
      { name: 'TotalHeatingCapacity', type: 'IfcTimeSeries', description: 'Total heating capacity. This includes heating capacity of beam and heating capacity of supply air.' },
      { name: 'WaterPressureDropCurves', type: 'IfcTimeSeries', description: 'Water pressure drop as function of water flow rate.' },
    ],
  },

  'Pset_CooledBeamPHistoryActive': {
    label:       'Property Set: Cooled Beam Phistory Active',
    description: '[[Performance]] history attributes for an active cooled beam.',
    applicableTo: ['IFCCOOLEDBEAMACTIVE'],
    props: [
      { name: 'AirFlowRate', type: 'IfcReal', description: 'Air flow rate.' },
      { name: 'AirPressureDropCurves', type: 'IfcTimeSeries', description: 'Air pressure drop as function of air flow rate.' },
      { name: 'Throw', type: 'IfcTimeSeries', description: 'Distance cooled beam throws the air.' },
    ],
  },

  'Pset_CooledBeamTypeActive': {
    label:       'Property Set: Cooled Beam Type Active',
    description: 'Active (ventilated) cooled beam common attributes.',
    applicableTo: ['IFCCOOLEDBEAMACTIVE'],
    props: [
      { name: 'AirFlowConfiguration', type: 'IfcLabel', description: 'Air flow configuration type of cooled beam.' },
      { name: 'AirFlowRateRange', type: 'IfcReal', description: 'Possible range of airflow that can be delivered.' },
      { name: 'ConnectionSize', type: 'IfcReal', description: 'The connection size of the object.' },
      { name: 'SupplyAirConnectionType', type: 'IfcLabel', description: 'The manner in which the pipe connection is made to the cooled beam.' },
    ],
  },

  'Pset_CooledBeamTypeCommon': {
    label:       'Property Set: Cooled Beam Type Common',
    description: 'Cooled beam common attributes.;Use IfcSoundProperties instead.',
    applicableTo: ['IFCCOOLEDBEAM', 'IFCCOOLEDBEAMACTIVE', 'IFCCOOLEDBEAMPASSIVE'],
    props: [
      { name: 'CoilLength', type: 'IfcReal', description: 'Length of coil.' },
      { name: 'CoilWidth', type: 'IfcReal', description: 'Width of coil.' },
      { name: 'FinishColour', type: 'IfcLabel', description: 'The finish colour of the object.' },
      { name: 'IntegratedLightingType', type: 'IfcLabel', description: 'Integrated lighting in cooled beam.' },
      { name: 'IsFreeHanging', type: 'IfcBoolean', description: 'Is it free hanging type (not mounted in a false ceiling)?' },
      { name: 'NominalCoolingCapacity', type: 'IfcReal', description: 'Nominal cooling capacity.' },
      { name: 'NominalHeatingCapacity', type: 'IfcReal', description: 'Nominal heating capacity.' },
      { name: 'NominalReturnWaterTemperatureCooling', type: 'IfcReal', description: 'Nominal return water temperature (refers to nominal cooling capacity).' },
      { name: 'NominalReturnWaterTemperatureHeating', type: 'IfcReal', description: 'Nominal return water temperature (refers to nominal heating capacity).' },
      { name: 'NominalSupplyWaterTemperatureCooling', type: 'IfcReal', description: 'Nominal supply water temperature (refers to nominal cooling capacity).' },
      { name: 'NominalSupplyWaterTemperatureHeating', type: 'IfcReal', description: 'Nominal supply water temperature (refers to nominal heating capacity).' },
      { name: 'NominalSurroundingHumidityCooling', type: 'IfcReal', description: 'Nominal surrounding humidity (refers to nominal cooling capacity).' },
      { name: 'NominalSurroundingTemperatureCooling', type: 'IfcReal', description: 'Nominal surrounding temperature (refers to nominal cooling capacity).' },
      { name: 'NominalSurroundingTemperatureHeating', type: 'IfcReal', description: 'Nominal surrounding temperature (refers to nominal heating capacity).' },
      { name: 'NominalWaterFlowCooling', type: 'IfcReal', description: 'Nominal water flow (refers to nominal cooling capacity).' },
      { name: 'NominalWaterFlowHeating', type: 'IfcReal', description: 'Nominal water flow (refers to nominal heating capacity).' },
      { name: 'PipeConnection', type: 'IfcLabel', description: 'The manner in which the pipe connection is made to the cooled beam.' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'WaterFlowControlSystemType', type: 'IfcLabel', description: 'Factory fitted waterflow control system.' },
      { name: 'WaterPressureRange', type: 'IfcReal', description: 'Allowable water circuit working pressure range.' },
    ],
  },

  'Pset_CoolingTowerPHistory': {
    label:       'Property Set: Cooling Tower Phistory',
    description: 'Cooling tower performance history attributes.',
    applicableTo: ['IFCCOOLINGTOWER', 'IFCCOOLINGTOWERMECHANICALFORCEDDRAFT', 'IFCCOOLINGTOWERMECHANICALINDUCEDDRAFT', 'IFCCOOLINGTOWERNATURALDRAFT'],
    props: [
      { name: 'Capacity', type: 'IfcTimeSeries', description: 'The capacity of the element.' },
      { name: 'HeatTransferCoefficient', type: 'IfcTimeSeries', description: 'Heat transfer coefficient-area product.' },
      { name: 'Performance', type: 'IfcTimeSeries', description: 'Water temperature change as a function of wet-bulb temperature, water entering temperature, water flow rate, air flow ra' },
      { name: 'SumpHeaterPower', type: 'IfcTimeSeries', description: 'Electrical heat power of sump heater.' },
      { name: 'UACurve', type: 'IfcTimeSeries', description: 'UA value.' },
    ],
  },

  'Pset_CoolingTowerTypeCommon': {
    label:       'Property Set: Cooling Tower Type Common',
    description: 'Cooling tower type common attributes.; [[WaterRequirement]] attribute unit type modified in IFC2x2 Pset Addendum.',
    applicableTo: ['IFCCOOLINGTOWER', 'IFCCOOLINGTOWERMECHANICALFORCEDDRAFT', 'IFCCOOLINGTOWERMECHANICALINDUCEDDRAFT', 'IFCCOOLINGTOWERNATURALDRAFT'],
    props: [
      { name: 'AmbientDesignDryBulbTemperature', type: 'IfcReal', description: 'Ambient design dry bulb temperature used for selecting the cooling tower.' },
      { name: 'AmbientDesignWetBulbTemperature', type: 'IfcReal', description: 'Ambient design wet bulb temperature used for selecting the cooling tower.' },
      { name: 'BasinReserveVolume', type: 'IfcReal', description: 'Volume between operating and overflow levels in cooling tower basin.' },
      { name: 'CapacityControl', type: 'IfcLabel', description: 'Fan is cycled on and off to control duty.;Fan is switched between low and high speed to control duty.;Fan speed is varie' },
      { name: 'CircuitType', type: 'IfcLabel', description: 'Exposes water directly to the cooling atmosphere.;The fluid is separated from the atmosphere by a heat exchanger.;The ai' },
      { name: 'ControlStrategy', type: 'IfcLabel', description: 'The capacity is controlled to maintain a fixed exiting water temperature.;The set-point is reset based on the wet-bulb t' },
      { name: 'FlowArrangement', type: 'IfcLabel', description: 'Air and water flow enter in different directions.;Air and water flow are perpendicular.;Air and water flow enter in same' },
      { name: 'LiftElevationDifference', type: 'IfcReal', description: 'Elevation difference between cooling tower sump and the top of the tower.' },
      { name: 'NominalCapacity', type: 'IfcReal', description: 'The total nominal or volumetric capacity of the object.' },
      { name: 'NumberOfCells', type: 'IfcInteger', description: 'Number of cells in one cooling tower unit.' },
      { name: 'OperationTemperatureRange', type: 'IfcReal', description: 'Allowable operation ambient air temperature range.' },
      { name: 'SprayType', type: 'IfcLabel', description: 'Water is sprayed into airflow.;water cascades over successive rows of splash bars.;water flows in a thin layer over clos' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'WaterRequirement', type: 'IfcReal', description: 'Make-up water requirement.' },
    ],
  },

  'Pset_CourseApplicationConditions': {
    label:       'Property Set: Course Application Conditions',
    description: 'Properties regarding the conditions when applying a course.',
    applicableTo: ['IFCCOURSE', 'IFCCOURSEARMOUR', 'IFCCOURSEBALLASTBED', 'IFCCOURSECORE', 'IFCCOURSEFILTER', 'IFCCOURSEPAVEMENT', 'IFCCOURSEPROTECTION'],
    props: [
      { name: 'ApplicationTemperature', type: 'IfcReal', description: 'Indicates the ambient temperature at which the course is applied' },
      { name: 'WeatherConditions', type: 'IfcLabel', description: 'Indicates the weather conditions during the application of the course' },
    ],
  },

  'Pset_CourseCommon': {
    label:       'Property Set: Course Common',
    description: 'Common properties for courses.',
    applicableTo: ['IFCCOURSE', 'IFCCOURSEARMOUR', 'IFCCOURSEBALLASTBED', 'IFCCOURSECORE', 'IFCCOURSEFILTER', 'IFCCOURSEPAVEMENT', 'IFCCOURSEPROTECTION'],
    props: [
      { name: 'NominalLength', type: 'IfcReal', description: 'The nominal overall length of the object. The size information is provided in addition to the shape representation and t' },
      { name: 'NominalThickness', type: 'IfcReal', description: 'The nominal thickness of the object. The size information is provided in addition to the shape representation and the ge' },
      { name: 'NominalWidth', type: 'IfcReal', description: 'The nominal overall width of the object. The size information is provided in addition to the shape representation and th' },
    ],
  },

  'Pset_CoveringCommon': {
    label:       'Property Set: Covering Common',
    description: 'Properties common to the definition of all occurrence and type objects of covering',
    applicableTo: ['IFCCOVERING', 'IFCCOVERINGCEILING', 'IFCCOVERINGCLADDING', 'IFCCOVERINGCOPING', 'IFCCOVERINGFLOORING', 'IFCCOVERINGINSULATION', 'IFCCOVERINGMEMBRANE', 'IFCCOVERINGMOLDING', 'IFCCOVERINGROOFING', 'IFCCOVERINGSKIRTINGBOARD', 'IFCCOVERINGSLEEVING', 'IFCCOVERINGTOPPING', 'IFCCOVERINGWRAPPING'],
    props: [
      { name: 'AcousticRating', type: 'IfcLabel', description: 'Acoustic rating for this object.; It is provided according to the national building code. It indicates the sound transmi' },
      { name: 'Combustible', type: 'IfcBoolean', description: 'Indication whether the object is made from combustible material (TRUE) or not (FALSE).' },
      { name: 'Finish', type: 'IfcLabel', description: 'Description of the (surface) finish of the object for informational purposes.' },
      { name: 'FireRating', type: 'IfcLabel', description: 'Fire rating for this object. It is given according to the national fire safety classification.' },
      { name: 'FlammabilityRating', type: 'IfcLabel', description: 'Flammability Rating for this object.; It is given according to the national building code that governs the rating of fla' },
      { name: 'FragilityRating', type: 'IfcLabel', description: 'Indication on the fragility of the covering (e.g., under fire conditions). It is given according to the national buildin' },
      { name: 'IsExternal', type: 'IfcBoolean', description: 'Indication whether the element is designed for use in the exterior (TRUE) or not (FALSE). If (TRUE) it is an external el' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'SurfaceSpreadOfFlame', type: 'IfcLabel', description: 'Indication on how the flames spread around the surface,; It is given according to the national building code that govern' },
      { name: 'ThermalTransmittance', type: 'IfcReal', description: 'Thermal transmittance coefficient (U-Value) of an element, within the direction of the thermal flow (including all mater' },
    ],
  },

  'Pset_CoveringFlooring': {
    label:       'Property Set: Covering Flooring',
    description: 'Properties common to the definition of all occurrence and type objects of covering with the predefined type set to FLOORING.',
    applicableTo: ['IFCCOVERINGFLOORING'],
    props: [
      { name: 'HasAntiStaticSurface', type: 'IfcBoolean', description: 'Indication whether the surface finish is designed to prevent electrostatic charge (TRUE) or not (FALSE).' },
      { name: 'HasNonSkidSurface', type: 'IfcBoolean', description: 'Indication whether the surface finish is designed to prevent slippery (TRUE) or not (FALSE).' },
    ],
  },

  'Pset_CoveringTypeMembrane': {
    label:       'Property Set: Covering Type Membrane',
    description: 'Property set for overing [[Type]] Membrane.',
    applicableTo: ['IFCCOVERINGMEMBRANE'],
    props: [
      { name: 'NominalInstallationDepth', type: 'IfcReal', description: 'Nominal installation depth underground.' },
      { name: 'NominalTransverseInclination', type: 'IfcReal', description: 'Required nominal angle of transverse slope.' },
    ],
  },

  'Pset_CurrentInstrumentTransformer': {
    label:       'Property Set: Current Instrument Transformer',
    description: 'Instrument transformers are high accuracy class electrical devices used to isolate or transform voltage or current levels. The main function of instrument transformers is to operat',
    applicableTo: ['IFCFLOWINSTRUMENTAMMETER', 'IFCFLOWINSTRUMENTCOMBINED'],
    props: [
      { name: 'AccuracyClass', type: 'IfcReal', description: 'A designation assigned to an instrument transformer the current (or voltage) error and phase displacement of which remai' },
      { name: 'AccuracyGrade', type: 'IfcLabel', description: 'The grade of accuracy.' },
      { name: 'NominalCurrent', type: 'IfcReal', description: 'The nominal current that is designed to be measured.' },
      { name: 'NominalPower', type: 'IfcReal', description: 'A conventional value of apparent power determining a value of the rated current that may be carried with rated voltage a' },
      { name: 'NumberOfPhases', type: 'IfcInteger', description: 'Number of phases that the equipment operates on.' },
      { name: 'PrimaryCurrent', type: 'IfcReal', description: 'The current that is going to be transformed and that runs into the transformer on the primary side.' },
      { name: 'PrimaryFrequency', type: 'IfcReal', description: 'The frequency that is going to be transformed and that runs into the transformer on the primary side.' },
      { name: 'RatedVoltage', type: 'IfcReal', description: 'The range of allowed voltage that a device is certified to handle. The upper bound of this value is the maximum.' },
      { name: 'SecondaryCurrent', type: 'IfcReal', description: 'The current that has been transformed and is running out of the transformer on the secondary side.' },
      { name: 'SecondaryFrequency', type: 'IfcReal', description: 'The frequency that has been transformed and is running out of the transformer on the secondary side.' },
    ],
  },

  'Pset_CurtainWallCommon': {
    label:       'Property Set: Curtain Wall Common',
    description: 'Properties common to the definition of all occurrences of [[IfcCurtainWall]].',
    applicableTo: ['IFCCURTAINWALL'],
    props: [
      { name: 'AcousticRating', type: 'IfcLabel', description: 'Acoustic rating for this object.; It is provided according to the national building code. It indicates the sound transmi' },
      { name: 'Combustible', type: 'IfcBoolean', description: 'Indication whether the object is made from combustible material (TRUE) or not (FALSE).' },
      { name: 'FireRating', type: 'IfcLabel', description: 'Fire rating for this object. It is given according to the national fire safety classification.' },
      { name: 'IsExternal', type: 'IfcBoolean', description: 'Indication whether the element is designed for use in the exterior (TRUE) or not (FALSE). If (TRUE) it is an external el' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'SurfaceSpreadOfFlame', type: 'IfcLabel', description: 'Indication on how the flames spread around the surface,; It is given according to the national building code that govern' },
      { name: 'ThermalTransmittance', type: 'IfcReal', description: 'Thermal transmittance coefficient (U-Value) of an element, within the direction of the thermal flow (including all mater' },
    ],
  },

  'Pset_DamperOccurrence': {
    label:       'Property Set: Damper Occurrence',
    description: 'Damper occurrence attributes attached to an instance of [[IfcDamper]]',
    applicableTo: ['IFCDAMPER', 'IFCDAMPERBACKDRAFTDAMPER', 'IFCDAMPERBALANCINGDAMPER', 'IFCDAMPERBLASTDAMPER', 'IFCDAMPERCONTROLDAMPER', 'IFCDAMPERFIREDAMPER', 'IFCDAMPERFIRESMOKEDAMPER', 'IFCDAMPERFUMEHOODEXHAUST', 'IFCDAMPERGRAVITYDAMPER', 'IFCDAMPERGRAVITYRELIEFDAMPER', 'IFCDAMPERRELIEFDAMPER', 'IFCDAMPERSMOKEDAMPER'],
    props: [
      { name: 'SizingMethod', type: 'IfcLabel', description: 'Nominal sizing method.;Exact sizing method.' },
    ],
  },

  'Pset_DamperPHistory': {
    label:       'Property Set: Damper Phistory',
    description: 'Damper performance history attributes.',
    applicableTo: ['IFCDAMPER', 'IFCDAMPERBACKDRAFTDAMPER', 'IFCDAMPERBALANCINGDAMPER', 'IFCDAMPERBLASTDAMPER', 'IFCDAMPERCONTROLDAMPER', 'IFCDAMPERFIREDAMPER', 'IFCDAMPERFIRESMOKEDAMPER', 'IFCDAMPERFUMEHOODEXHAUST', 'IFCDAMPERGRAVITYDAMPER', 'IFCDAMPERGRAVITYRELIEFDAMPER', 'IFCDAMPERRELIEFDAMPER', 'IFCDAMPERSMOKEDAMPER'],
    props: [
      { name: 'AirFlowRate', type: 'IfcReal', description: 'Air flow rate.' },
      { name: 'BladePositionAngle', type: 'IfcTimeSeries', description: 'Blade position angle; angle between the blade and flow direction ( 0 - 90).' },
      { name: 'DamperPosition', type: 'IfcTimeSeries', description: 'Control damper position, ranging from 0 to 1; damper position (0=closed=90deg position angle, 1=open=0deg position angle' },
      { name: 'Leakage', type: 'IfcTimeSeries', description: 'Air leakage rate.' },
      { name: 'PressureDrop', type: 'IfcTimeSeries', description: 'Pressure drop.' },
      { name: 'PressureLossCoefficient', type: 'IfcTimeSeries', description: 'Pressure loss coefficient.' },
    ],
  },

  'Pset_DamperTypeCommon': {
    label:       'Property Set: Damper Type Common',
    description: 'Damper type common attributes.',
    applicableTo: ['IFCDAMPER', 'IFCDAMPERBACKDRAFTDAMPER', 'IFCDAMPERBALANCINGDAMPER', 'IFCDAMPERBLASTDAMPER', 'IFCDAMPERCONTROLDAMPER', 'IFCDAMPERFIREDAMPER', 'IFCDAMPERFIRESMOKEDAMPER', 'IFCDAMPERFUMEHOODEXHAUST', 'IFCDAMPERGRAVITYDAMPER', 'IFCDAMPERGRAVITYRELIEFDAMPER', 'IFCDAMPERRELIEFDAMPER', 'IFCDAMPERSMOKEDAMPER'],
    props: [
      { name: 'BladeAction', type: 'IfcLabel', description: 'Blade action.' },
      { name: 'BladeEdge', type: 'IfcLabel', description: 'Blade edge.' },
      { name: 'BladeShape', type: 'IfcLabel', description: 'Blade shape. Flat means triple V-groove.' },
      { name: 'BladeThickness', type: 'IfcReal', description: 'The thickness of the damper blade.' },
      { name: 'CloseOffRating', type: 'IfcReal', description: 'Close off rating.' },
      { name: 'FaceArea', type: 'IfcReal', description: 'Face area open to the airstream.' },
      { name: 'FrameDepth', type: 'IfcReal', description: 'The length (or depth) of the frame.' },
      { name: 'FrameThickness', type: 'IfcReal', description: 'The thickness of the frame.' },
      { name: 'FrameType', type: 'IfcLabel', description: 'The type of frame used by the damper (e.g., Standard, Single Flange, Single Reversed Flange, Double Flange, etc.).' },
      { name: 'LeakageCurve', type: 'IfcReal', description: 'Leakage versus pressure drop; Leakage = f (pressure).' },
      { name: 'LeakageFullyClosed', type: 'IfcReal', description: 'Leakage when fully closed.' },
      { name: 'LossCoefficentCurve', type: 'IfcReal', description: 'Loss coefficient blade position angle curve; ratio of pressure drop to velocity pressure versus blade angle; C = f (blad' },
      { name: 'MaximumAirFlowRate', type: 'IfcReal', description: 'Maximum allowable air flow rate.' },
      { name: 'MaximumWorkingPressure', type: 'IfcReal', description: 'Maximum pressure that the object is manufactured to withstand.' },
      { name: 'NominalAirFlowRate', type: 'IfcReal', description: 'Nominal air flow rate.' },
      { name: 'NumberofBlades', type: 'IfcInteger', description: 'Number of blades.' },
      { name: 'OpenPressureDrop', type: 'IfcReal', description: 'Total pressure drop across damper.' },
      { name: 'Operation', type: 'IfcLabel', description: 'The operational mechanism for the damper operation.' },
      { name: 'Orientation', type: 'IfcLabel', description: 'The intended orientation for the damper as specified by the manufacturer.' },
      { name: 'RegeneratedSoundCurve', type: 'IfcReal', description: 'Regenerated sound versus air flow rate.' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'TemperatureRange', type: 'IfcReal', description: 'Allowable maximum and minimum temperature.' },
      { name: 'TemperatureRating', type: 'IfcReal', description: 'Temperature rating.' },
    ],
  },

  'Pset_DamperTypeControlDamper': {
    label:       'Property Set: Damper Type Control Damper',
    description: 'Control damper type attributes.; Pset renamed from Pset_DamperTypeControl to [[Pset_DamperTypeControlDamper]] in IFC2x2 Pset Addendum.',
    applicableTo: ['IFCDAMPERCONTROLDAMPER'],
    props: [
      { name: 'ControlDamperOperation', type: 'IfcLabel', description: 'The inherent characteristic of the control damper operation.' },
      { name: 'TorqueRange', type: 'IfcReal', description: 'minimum operational torque to maximum allowable torque.' },
    ],
  },

  'Pset_DamperTypeFireDamper': {
    label:       'Property Set: Damper Type Fire Damper',
    description: 'Fire damper type attributes.; Pset renamed from Pset_DamperTypeFire to [[Pset_DamperTypeFireDamper]] in IFC2x2 Pset Addendum.',
    applicableTo: ['IFCDAMPERFIREDAMPER'],
    props: [
      { name: 'ActuationType', type: 'IfcLabel', description: 'Enumeration that identifies the different types of dampers.' },
      { name: 'ClosureRatingEnum', type: 'IfcLabel', description: 'Enumeration that identifies the closure rating for the damper.' },
      { name: 'FireResistanceRating', type: 'IfcLabel', description: 'Measure of the fire resistance rating in hours (e.g., 1.5 hours, 2 hours, etc.).' },
      { name: 'FusibleLinkTemperature', type: 'IfcReal', description: 'The temperature that the fusible link melts.' },
    ],
  },

  'Pset_DamperTypeFireSmokeDamper': {
    label:       'Property Set: Damper Type Fire Smoke Damper',
    description: 'Combination Fire and Smoke damper type attributes.; New Pset in IFC2x2 Pset Addendum.',
    applicableTo: ['IFCDAMPERFIRESMOKEDAMPER'],
    props: [
      { name: 'ActuationType', type: 'IfcLabel', description: 'Enumeration that identifies the different types of dampers.' },
      { name: 'ClosureRatingEnum', type: 'IfcLabel', description: 'Enumeration that identifies the closure rating for the damper.' },
      { name: 'DamperControlType', type: 'IfcLabel', description: 'The type of control used to operate the damper (e.g., Open/Closed Indicator, Resettable Temperature Sensor, Temperature' },
      { name: 'FireResistanceRating', type: 'IfcLabel', description: 'Measure of the fire resistance rating in hours (e.g., 1.5 hours, 2 hours, etc.).' },
      { name: 'FusibleLinkTemperature', type: 'IfcReal', description: 'The temperature that the fusible link melts.' },
    ],
  },

  'Pset_DamperTypeSmokeDamper': {
    label:       'Property Set: Damper Type Smoke Damper',
    description: 'Smoke damper type attributes.; Pset renamed from Pset_DamperTypeSmoke to [[Pset_DamperTypeSmokeDamper]] in IFC2x2 Pset Addendum.',
    applicableTo: ['IFCDAMPERSMOKEDAMPER'],
    props: [
      { name: 'ControlType', type: 'IfcLabel', description: 'The type controller, signal modification effected and applicable ports' },
    ],
  },

  'Pset_DataTransmissionUnit': {
    label:       'Property Set: Data Transmission Unit',
    description: 'Properties common to a data transmission unit. This property set is applied to a type or occurrence of [[IfcCommunicationsAppliance]] with predefined type MODEM.',
    applicableTo: ['IFCCOMMUNICATIONSAPPLIANCEMODEM'],
    props: [
      { name: 'DataTransmissionUnitUsage', type: 'IfcLabel', description: 'Indicates the usage of the data transmission unit. It can be used to transmit data for different types of sensors.' },
      { name: 'SerialInterfaceType', type: 'IfcLabel', description: 'Indicates the type of serial interface used by the device.' },
      { name: 'WorkingState', type: 'IfcLabel', description: 'Indicates the working state of device or system.' },
    ],
  },

  'Pset_DiscreteAccessoryColumnShoe': {
    label:       'Property Set: Discrete Accessory Column Shoe',
    description: 'Shape properties common to column shoes.',
    applicableTo: ['IFCDISCRETEACCESSORYSHOE'],
    props: [
      { name: 'ColumnShoeBasePlateDepth', type: 'IfcReal', description: 'The depth of the column shoe base plate.' },
      { name: 'ColumnShoeBasePlateThickness', type: 'IfcReal', description: 'The thickness of the column shoe base plate.' },
      { name: 'ColumnShoeBasePlateWidth', type: 'IfcReal', description: 'The width of the column shoe base plate.' },
      { name: 'ColumnShoeCasingDepth', type: 'IfcReal', description: 'The depth of the column shoe casing.' },
      { name: 'ColumnShoeCasingHeight', type: 'IfcReal', description: 'The height of the column shoe casing.' },
      { name: 'ColumnShoeCasingWidth', type: 'IfcReal', description: 'The width of the column shoe casing.' },
    ],
  },

  'Pset_DiscreteAccessoryCornerFixingPlate': {
    label:       'Property Set: Discrete Accessory Corner Fixing Plate',
    description: 'Properties specific to corner fixing plates.',
    applicableTo: ['IFCDISCRETEACCESSORY', 'IFCDISCRETEACCESSORYANCHORPLATE', 'IFCDISCRETEACCESSORYBIRDPROTECTION', 'IFCDISCRETEACCESSORYBRACKET', 'IFCDISCRETEACCESSORYCABLEARRANGER', 'IFCDISCRETEACCESSORYELASTIC_CUSHION', 'IFCDISCRETEACCESSORYEXPANSION_JOINT_DEVICE', 'IFCDISCRETEACCESSORYFILLER', 'IFCDISCRETEACCESSORYFLASHING', 'IFCDISCRETEACCESSORYINSULATOR', 'IFCDISCRETEACCESSORYLOCK', 'IFCDISCRETEACCESSORYPANEL_STRENGTHENING', 'IFCDISCRETEACCESSORYPOINTMACHINEMOUNTINGDEVICE', 'IFCDISCRETEACCESSORYPOINT_MACHINE_LOCKING_DEVICE', 'IFCDISCRETEACCESSORYRAILBRACE', 'IFCDISCRETEACCESSORYRAILPAD', 'IFCDISCRETEACCESSORYRAIL_LUBRICATION', 'IFCDISCRETEACCESSORYRAIL_MECHANICAL_EQUIPMENT', 'IFCDISCRETEACCESSORYSHOE', 'IFCDISCRETEACCESSORYSLIDINGCHAIR', 'IFCDISCRETEACCESSORYSOUNDABSORPTION', 'IFCDISCRETEACCESSORYTENSIONINGEQUIPMENT'],
    props: [
      { name: 'CornerFixingPlateFlangeWidthInPlaneX', type: 'IfcReal', description: 'The flange width of the L-shaped corner plate in plane X.' },
      { name: 'CornerFixingPlateFlangeWidthInPlaneZ', type: 'IfcReal', description: 'The flange width of the L-shaped corner plate in plane Z.' },
      { name: 'CornerFixingPlateLength', type: 'IfcReal', description: 'The length of the L-shaped corner plate.' },
      { name: 'CornerFixingPlateThickness', type: 'IfcReal', description: 'The thickness of the L-shaped corner plate.' },
    ],
  },

  'Pset_DiscreteAccessoryDiagonalTrussConnector': {
    label:       'Property Set: Discrete Accessory Diagonal Truss Connector',
    description: 'Shape properties specific to connecting accessories in truss form with diagonal cross-bars.',
    applicableTo: ['IFCDISCRETEACCESSORY', 'IFCDISCRETEACCESSORYANCHORPLATE', 'IFCDISCRETEACCESSORYBIRDPROTECTION', 'IFCDISCRETEACCESSORYBRACKET', 'IFCDISCRETEACCESSORYCABLEARRANGER', 'IFCDISCRETEACCESSORYELASTIC_CUSHION', 'IFCDISCRETEACCESSORYEXPANSION_JOINT_DEVICE', 'IFCDISCRETEACCESSORYFILLER', 'IFCDISCRETEACCESSORYFLASHING', 'IFCDISCRETEACCESSORYINSULATOR', 'IFCDISCRETEACCESSORYLOCK', 'IFCDISCRETEACCESSORYPANEL_STRENGTHENING', 'IFCDISCRETEACCESSORYPOINTMACHINEMOUNTINGDEVICE', 'IFCDISCRETEACCESSORYPOINT_MACHINE_LOCKING_DEVICE', 'IFCDISCRETEACCESSORYRAILBRACE', 'IFCDISCRETEACCESSORYRAILPAD', 'IFCDISCRETEACCESSORYRAIL_LUBRICATION', 'IFCDISCRETEACCESSORYRAIL_MECHANICAL_EQUIPMENT', 'IFCDISCRETEACCESSORYSHOE', 'IFCDISCRETEACCESSORYSLIDINGCHAIR', 'IFCDISCRETEACCESSORYSOUNDABSORPTION', 'IFCDISCRETEACCESSORYTENSIONINGEQUIPMENT'],
    props: [
      { name: 'DiagonalTrussBaseBarDiameter', type: 'IfcReal', description: 'The nominal diameter of the base bar.' },
      { name: 'DiagonalTrussCrossBarDiameter', type: 'IfcReal', description: 'The nominal diameter of the diagonal cross-bars.' },
      { name: 'DiagonalTrussCrossBarSpacing', type: 'IfcReal', description: 'The spacing between diagonal cross-bar sections.' },
      { name: 'DiagonalTrussHeight', type: 'IfcReal', description: 'The overall height of the truss connector.' },
      { name: 'DiagonalTrussLength', type: 'IfcReal', description: 'The overall length of the truss connector.' },
      { name: 'DiagonalTrussSecondaryBarDiameter', type: 'IfcReal', description: 'The nominal diameter of the secondary bar.' },
    ],
  },

  'Pset_DiscreteAccessoryEdgeFixingPlate': {
    label:       'Property Set: Discrete Accessory Edge Fixing Plate',
    description: 'Properties specific to edge fixing plates.',
    applicableTo: ['IFCDISCRETEACCESSORY', 'IFCDISCRETEACCESSORYANCHORPLATE', 'IFCDISCRETEACCESSORYBIRDPROTECTION', 'IFCDISCRETEACCESSORYBRACKET', 'IFCDISCRETEACCESSORYCABLEARRANGER', 'IFCDISCRETEACCESSORYELASTIC_CUSHION', 'IFCDISCRETEACCESSORYEXPANSION_JOINT_DEVICE', 'IFCDISCRETEACCESSORYFILLER', 'IFCDISCRETEACCESSORYFLASHING', 'IFCDISCRETEACCESSORYINSULATOR', 'IFCDISCRETEACCESSORYLOCK', 'IFCDISCRETEACCESSORYPANEL_STRENGTHENING', 'IFCDISCRETEACCESSORYPOINTMACHINEMOUNTINGDEVICE', 'IFCDISCRETEACCESSORYPOINT_MACHINE_LOCKING_DEVICE', 'IFCDISCRETEACCESSORYRAILBRACE', 'IFCDISCRETEACCESSORYRAILPAD', 'IFCDISCRETEACCESSORYRAIL_LUBRICATION', 'IFCDISCRETEACCESSORYRAIL_MECHANICAL_EQUIPMENT', 'IFCDISCRETEACCESSORYSHOE', 'IFCDISCRETEACCESSORYSLIDINGCHAIR', 'IFCDISCRETEACCESSORYSOUNDABSORPTION', 'IFCDISCRETEACCESSORYTENSIONINGEQUIPMENT'],
    props: [
      { name: 'EdgeFixingPlateFlangeWidthInPlaneX', type: 'IfcReal', description: 'The flange width of the L-shaped edge plate in plane X.' },
      { name: 'EdgeFixingPlateFlangeWidthInPlaneZ', type: 'IfcReal', description: 'The flange width of the L-shaped edge plate in plane Z.' },
      { name: 'EdgeFixingPlateLength', type: 'IfcReal', description: 'The length of the L-shaped edge plate.' },
      { name: 'EdgeFixingPlateThickness', type: 'IfcReal', description: 'The thickness of the L-shaped edge plate.' },
    ],
  },

  'Pset_DiscreteAccessoryFixingSocket': {
    label:       'Property Set: Discrete Accessory Fixing Socket',
    description: 'Properties common to fixing sockets.',
    applicableTo: ['IFCDISCRETEACCESSORY', 'IFCDISCRETEACCESSORYANCHORPLATE', 'IFCDISCRETEACCESSORYBIRDPROTECTION', 'IFCDISCRETEACCESSORYBRACKET', 'IFCDISCRETEACCESSORYCABLEARRANGER', 'IFCDISCRETEACCESSORYELASTIC_CUSHION', 'IFCDISCRETEACCESSORYEXPANSION_JOINT_DEVICE', 'IFCDISCRETEACCESSORYFILLER', 'IFCDISCRETEACCESSORYFLASHING', 'IFCDISCRETEACCESSORYINSULATOR', 'IFCDISCRETEACCESSORYLOCK', 'IFCDISCRETEACCESSORYPANEL_STRENGTHENING', 'IFCDISCRETEACCESSORYPOINTMACHINEMOUNTINGDEVICE', 'IFCDISCRETEACCESSORYPOINT_MACHINE_LOCKING_DEVICE', 'IFCDISCRETEACCESSORYRAILBRACE', 'IFCDISCRETEACCESSORYRAILPAD', 'IFCDISCRETEACCESSORYRAIL_LUBRICATION', 'IFCDISCRETEACCESSORYRAIL_MECHANICAL_EQUIPMENT', 'IFCDISCRETEACCESSORYSHOE', 'IFCDISCRETEACCESSORYSLIDINGCHAIR', 'IFCDISCRETEACCESSORYSOUNDABSORPTION', 'IFCDISCRETEACCESSORYTENSIONINGEQUIPMENT'],
    props: [
      { name: 'FixingSocketHeight', type: 'IfcReal', description: 'The overall height of the fixing socket.' },
      { name: 'FixingSocketThreadDiameter', type: 'IfcReal', description: 'The nominal diameter of the thread.' },
      { name: 'FixingSocketThreadLength', type: 'IfcReal', description: 'The length of the threaded part of the fixing socket.' },
      { name: 'FixingSocketTypeReference', type: 'IfcTimeSeries', description: 'Type reference for the fixing socket according to local standards.' },
    ],
  },

  'Pset_DiscreteAccessoryLadderTrussConnector': {
    label:       'Property Set: Discrete Accessory Ladder Truss Connector',
    description: 'Shape properties specific to connecting accessories in truss form with straight cross-bars in ladder shape.',
    applicableTo: ['IFCDISCRETEACCESSORY', 'IFCDISCRETEACCESSORYANCHORPLATE', 'IFCDISCRETEACCESSORYBIRDPROTECTION', 'IFCDISCRETEACCESSORYBRACKET', 'IFCDISCRETEACCESSORYCABLEARRANGER', 'IFCDISCRETEACCESSORYELASTIC_CUSHION', 'IFCDISCRETEACCESSORYEXPANSION_JOINT_DEVICE', 'IFCDISCRETEACCESSORYFILLER', 'IFCDISCRETEACCESSORYFLASHING', 'IFCDISCRETEACCESSORYINSULATOR', 'IFCDISCRETEACCESSORYLOCK', 'IFCDISCRETEACCESSORYPANEL_STRENGTHENING', 'IFCDISCRETEACCESSORYPOINTMACHINEMOUNTINGDEVICE', 'IFCDISCRETEACCESSORYPOINT_MACHINE_LOCKING_DEVICE', 'IFCDISCRETEACCESSORYRAILBRACE', 'IFCDISCRETEACCESSORYRAILPAD', 'IFCDISCRETEACCESSORYRAIL_LUBRICATION', 'IFCDISCRETEACCESSORYRAIL_MECHANICAL_EQUIPMENT', 'IFCDISCRETEACCESSORYSHOE', 'IFCDISCRETEACCESSORYSLIDINGCHAIR', 'IFCDISCRETEACCESSORYSOUNDABSORPTION', 'IFCDISCRETEACCESSORYTENSIONINGEQUIPMENT'],
    props: [
      { name: 'LadderTrussBaseBarDiameter', type: 'IfcReal', description: 'The nominal diameter of the base bar.' },
      { name: 'LadderTrussCrossBarDiameter', type: 'IfcReal', description: 'The nominal diameter of the straight cross-bars.' },
      { name: 'LadderTrussCrossBarSpacing', type: 'IfcReal', description: 'The spacing between the straight cross-bars.' },
      { name: 'LadderTrussHeight', type: 'IfcReal', description: 'The overall height of the truss connector.' },
      { name: 'LadderTrussLength', type: 'IfcReal', description: 'The overall length of the truss connector.' },
      { name: 'LadderTrussSecondaryBarDiameter', type: 'IfcReal', description: 'The nominal diameter of the secondary bar.' },
    ],
  },

  'Pset_DiscreteAccessoryStandardFixingPlate': {
    label:       'Property Set: Discrete Accessory Standard Fixing Plate',
    description: 'Properties specific to standard fixing plates.',
    applicableTo: ['IFCDISCRETEACCESSORY', 'IFCDISCRETEACCESSORYANCHORPLATE', 'IFCDISCRETEACCESSORYBIRDPROTECTION', 'IFCDISCRETEACCESSORYBRACKET', 'IFCDISCRETEACCESSORYCABLEARRANGER', 'IFCDISCRETEACCESSORYELASTIC_CUSHION', 'IFCDISCRETEACCESSORYEXPANSION_JOINT_DEVICE', 'IFCDISCRETEACCESSORYFILLER', 'IFCDISCRETEACCESSORYFLASHING', 'IFCDISCRETEACCESSORYINSULATOR', 'IFCDISCRETEACCESSORYLOCK', 'IFCDISCRETEACCESSORYPANEL_STRENGTHENING', 'IFCDISCRETEACCESSORYPOINTMACHINEMOUNTINGDEVICE', 'IFCDISCRETEACCESSORYPOINT_MACHINE_LOCKING_DEVICE', 'IFCDISCRETEACCESSORYRAILBRACE', 'IFCDISCRETEACCESSORYRAILPAD', 'IFCDISCRETEACCESSORYRAIL_LUBRICATION', 'IFCDISCRETEACCESSORYRAIL_MECHANICAL_EQUIPMENT', 'IFCDISCRETEACCESSORYSHOE', 'IFCDISCRETEACCESSORYSLIDINGCHAIR', 'IFCDISCRETEACCESSORYSOUNDABSORPTION', 'IFCDISCRETEACCESSORYTENSIONINGEQUIPMENT'],
    props: [
      { name: 'StandardFixingPlateDepth', type: 'IfcReal', description: 'The depth of the standard fixing plate.' },
      { name: 'StandardFixingPlateThickness', type: 'IfcReal', description: 'The thickness of the standard fixing plate.' },
      { name: 'StandardFixingPlateWidth', type: 'IfcReal', description: 'The width of the standard fixing plate.' },
    ],
  },

  'Pset_DiscreteAccessoryTypeBracket': {
    label:       'Property Set: Discrete Accessory Type Bracket',
    description: 'Properties of a bracket. The property set can be used by the predefined type BRACKET of [[IfcDiscreteAccessory]].',
    applicableTo: ['IFCDISCRETEACCESSORYBRACKET'],
    props: [
      { name: 'IsInsulated', type: 'IfcBoolean', description: 'Indicates whether the element is insulated or not.' },
    ],
  },

  'Pset_DiscreteAccessoryTypeCableArranger': {
    label:       'Property Set: Discrete Accessory Type Cable Arranger',
    description: 'Properties used for a cable arranger. The property set can be used by the predefined type CABLEARRANGER of [[IfcDiscreteAccessory]].',
    applicableTo: ['IFCDISCRETEACCESSORYCABLEARRANGER'],
    props: [
      { name: 'CableArrangerPosition', type: 'IfcLabel', description: 'vertical, horizontal, front or rear. It is relative to the element (usually a cabinet) that the cable arranger is affili' },
    ],
  },

  'Pset_DiscreteAccessoryTypeInsulator': {
    label:       'Property Set: Discrete Accessory Type Insulator',
    description: 'Properties of an insulator. The property set can be used by the predefined type INSULATOR of [[IfcDiscreteAccessory]].',
    applicableTo: ['IFCDISCRETEACCESSORYINSULATOR'],
    props: [
      { name: 'BendingStrength', type: 'IfcReal', description: 'Bending strength.' },
      { name: 'BreakdownVoltageTolerance', type: 'IfcReal', description: 'Nominal value of the spark gap breakdown voltage tolerance.' },
      { name: 'CreepageDistance', type: 'IfcReal', description: 'Shortest distance or the sum of the shortest distances along the surface on an insulator between two conductive parts wh' },
      { name: 'InstallationMethod', type: 'IfcLabel', description: 'Method of installation of cable/conductor. Installation methods are typically defined by reference in standards such as' },
      { name: 'InsulationMethod', type: 'IfcLabel', description: 'The method used to insulate.' },
      { name: 'InsulationVoltage', type: 'IfcReal', description: 'The insulation voltage.' },
      { name: 'LightningPeakVoltage', type: 'IfcReal', description: 'The peak lightning voltage that the insulator could withstand.' },
      { name: 'OperationalTemperatureRange', type: 'IfcReal', description: 'The temperature range in which the device operates normally.' },
      { name: 'RatedCurrent', type: 'IfcReal', description: 'The current that a device is designed to handle.' },
      { name: 'RatedVoltage', type: 'IfcReal', description: 'The range of allowed voltage that a device is certified to handle. The upper bound of this value is the maximum.' },
      { name: 'RMSWithstandVoltage', type: 'IfcReal', description: 'Rms value of sinusoidal power frequency voltage that the insulation of the given equipment can withstand during tests ma' },
      { name: 'Voltage', type: 'IfcReal', description: 'The actual voltage and operable range.' },
    ],
  },

  'Pset_DiscreteAccessoryTypeLock': {
    label:       'Property Set: Discrete Accessory Type Lock',
    description: 'Properties of locking equipment. The property set can be used by the predefined type LOCK of [[IfcDiscreteAccessory]].',
    applicableTo: ['IFCDISCRETEACCESSORYLOCK'],
    props: [
      { name: 'InstallationPlan', type: 'IfcTimeSeries', description: 'Reference to external information source about installation or construction plan of the element.' },
      { name: 'RequiredClosureSpacing', type: 'IfcReal', description: 'Required length of the closure spacing.' },
    ],
  },

  'Pset_DiscreteAccessoryTypeRailBrace': {
    label:       'Property Set: Discrete Accessory Type Rail Brace',
    description: 'Properties of a rail brace. The property set can be used by the predefined type RAILBRACE of [[IfcDiscreteAccessory]].',
    applicableTo: ['IFCDISCRETEACCESSORYRAILBRACE'],
    props: [
      { name: 'IsTemporary', type: 'IfcBoolean', description: 'Indicates if the installation of the element is temporary or not.' },
    ],
  },

  'Pset_DiscreteAccessoryTypeRailLubrication': {
    label:       'Property Set: Discrete Accessory Type Rail Lubrication',
    description: 'Properties of rail lubrication equipment. The property set can be used by the predefined type RAIL_LUBRICATION of [[IfcDiscreteAccessory]].',
    applicableTo: ['IFCDISCRETEACCESSORYRAIL_LUBRICATION'],
    props: [
      { name: 'LubricationPowerSupplyType', type: 'IfcLabel', description: 'Type of power supply method used by the rail lubrication.' },
      { name: 'LubricationSystemType', type: 'IfcLabel', description: 'Design and type of lubricating system e.g. active, passive.' },
      { name: 'MaximumNoiseEmissions', type: 'IfcReal', description: 'Maximum noise emissions limit at this location.' },
      { name: 'PositionInTrack', type: 'IfcLabel', description: 'Indicates the relative position of the element in track, which lies to the left or right as facing in the direction of i' },
    ],
  },

  'Pset_DiscreteAccessoryTypeRailPad': {
    label:       'Property Set: Discrete Accessory Type Rail Pad',
    description: 'Properties of rail pads. The property set can be used by the predefined type RAILPAD of [[IfcDiscreteAccessory]].',
    applicableTo: ['IFCDISCRETEACCESSORYRAILPAD'],
    props: [
      { name: 'RailPadStiffness', type: 'IfcLabel', description: 'Indicates the stiffness of a rail pad.' },
    ],
  },

  'Pset_DiscreteAccessoryTypeSlidingChair': {
    label:       'Property Set: Discrete Accessory Type Sliding Chair',
    description: 'Properties of a sliding chair. The property set can be used by the predefined type SLIDINGCHAIR of [[IfcDiscreteAccessory]].',
    applicableTo: ['IFCDISCRETEACCESSORYSLIDINGCHAIR'],
    props: [
      { name: 'IsSelfLubricated', type: 'IfcBoolean', description: 'Indicates whether the element is self lubricated or not.' },
    ],
  },

  'Pset_DiscreteAccessoryTypeSoundAbsorption': {
    label:       'Property Set: Discrete Accessory Type Sound Absorption',
    description: 'Properties of sound absorption equipment used in railway. The property set can be used by the predefined type SOUNDABSORPTION of [[IfcDiscreteAccessory]].',
    applicableTo: ['IFCDISCRETEACCESSORYSOUNDABSORPTION'],
    props: [
      { name: 'SoundAbsorptionLimit', type: 'IfcReal', description: 'Mandatory limit values in sound absorption.' },
    ],
  },

  'Pset_DiscreteAccessoryTypeTensioningEquipment': {
    label:       'Property Set: Discrete Accessory Type Tensioning Equipment',
    description: 'Properties of tensioning equipment used in railway. The property set can be used by the predefined type TENSIONINGEQUIPMENT of [[IfcDiscreteAccessory]].',
    applicableTo: ['IFCDISCRETEACCESSORYTENSIONINGEQUIPMENT'],
    props: [
      { name: 'AssemblyInstruction', type: 'IfcTimeSeries', description: 'Instructions to describe how the system / equipment / facility is assembled.' },
      { name: 'HasBreakLineLock', type: 'IfcBoolean', description: 'Indicates whether the equipment has the function of brake line lock or not.' },
      { name: 'RatioOfWireTension', type: 'IfcReal', description: 'The ratio of wire tension to tensioner weight.' },
      { name: 'ReferenceEnvironmentTemperature', type: 'IfcReal', description: 'Ideal temperature range.' },
      { name: 'TensileStrength', type: 'IfcReal', description: 'Indicates the ability to withstand breakage apart under applied force.' },
      { name: 'TransmissionEfficiency', type: 'IfcReal', description: 'Transmission efficiency of the tensioning equipment.' },
    ],
  },

  'Pset_DiscreteAccessoryWireLoop': {
    label:       'Property Set: Discrete Accessory Wire Loop',
    description: 'Shape properties common to wire loop joint connectors.',
    applicableTo: ['IFCDISCRETEACCESSORY', 'IFCDISCRETEACCESSORYANCHORPLATE', 'IFCDISCRETEACCESSORYBIRDPROTECTION', 'IFCDISCRETEACCESSORYBRACKET', 'IFCDISCRETEACCESSORYCABLEARRANGER', 'IFCDISCRETEACCESSORYELASTIC_CUSHION', 'IFCDISCRETEACCESSORYEXPANSION_JOINT_DEVICE', 'IFCDISCRETEACCESSORYFILLER', 'IFCDISCRETEACCESSORYFLASHING', 'IFCDISCRETEACCESSORYINSULATOR', 'IFCDISCRETEACCESSORYLOCK', 'IFCDISCRETEACCESSORYPANEL_STRENGTHENING', 'IFCDISCRETEACCESSORYPOINTMACHINEMOUNTINGDEVICE', 'IFCDISCRETEACCESSORYPOINT_MACHINE_LOCKING_DEVICE', 'IFCDISCRETEACCESSORYRAILBRACE', 'IFCDISCRETEACCESSORYRAILPAD', 'IFCDISCRETEACCESSORYRAIL_LUBRICATION', 'IFCDISCRETEACCESSORYRAIL_MECHANICAL_EQUIPMENT', 'IFCDISCRETEACCESSORYSHOE', 'IFCDISCRETEACCESSORYSLIDINGCHAIR', 'IFCDISCRETEACCESSORYSOUNDABSORPTION', 'IFCDISCRETEACCESSORYTENSIONINGEQUIPMENT'],
    props: [
      { name: 'WireDiameter', type: 'IfcReal', description: 'The nominal diameter of the wire.' },
      { name: 'WireEmbeddingLength', type: 'IfcReal', description: 'The length of the part of wire which is embedded in the precast concrete element.' },
      { name: 'WireLoopBasePlateLength', type: 'IfcReal', description: 'The length of the base plate.' },
      { name: 'WireLoopBasePlateThickness', type: 'IfcReal', description: 'The thickness of the base plate.' },
      { name: 'WireLoopBasePlateWidth', type: 'IfcReal', description: 'The width of the base plate.' },
      { name: 'WireLoopLength', type: 'IfcReal', description: 'The length of the fastening loop part of the wire.' },
    ],
  },

  'Pset_DistributionBoardTypeDispatchingBoard': {
    label:       'Property Set: Distribution Board Type Dispatching Board',
    description: 'Properties for [[IfcDistributionBoard]] with PredefinedType DISPATCHINGBOARD.',
    applicableTo: ['IFCDISTRIBUTIONBOARDDISPATCHINGBOARD'],
    props: [
      { name: 'DispatchingBoardType', type: 'IfcLabel', description: 'Indicates the type of dispatching board.' },
      { name: 'NumberOfInterfaces', type: 'IfcInteger', description: 'Indicates the types of interfaces and their number in the device.' },
    ],
  },

  'Pset_DistributionBoardTypeDistributionFrame': {
    label:       'Property Set: Distribution Board Type Distribution Frame',
    description: 'Properties for [[IfcDistributionBoard]] with PredefinedType DISTRIBUTIONFRAME.',
    applicableTo: ['IFCDISTRIBUTIONBOARDDISTRIBUTIONFRAME'],
    props: [
      { name: 'PortCapacity', type: 'IfcInteger', description: 'Indicates the number of ports in the passive device that can be used to interconnect cables.' },
    ],
  },

  'Pset_DistributionChamberElementCommon': {
    label:       'Property Set: Distribution Chamber Element Common',
    description: 'Common properties of all occurrences of [[IfcDistributionChamberElement]].',
    applicableTo: ['IFCDISTRIBUTIONCHAMBERELEMENT', 'IFCDISTRIBUTIONCHAMBERELEMENTFORMEDDUCT', 'IFCDISTRIBUTIONCHAMBERELEMENTINSPECTIONCHAMBER', 'IFCDISTRIBUTIONCHAMBERELEMENTINSPECTIONPIT', 'IFCDISTRIBUTIONCHAMBERELEMENTMANHOLE', 'IFCDISTRIBUTIONCHAMBERELEMENTMETERCHAMBER', 'IFCDISTRIBUTIONCHAMBERELEMENTSUMP', 'IFCDISTRIBUTIONCHAMBERELEMENTTRENCH', 'IFCDISTRIBUTIONCHAMBERELEMENTVALVECHAMBER'],
    props: [
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_DistributionChamberElementTypeFormedDuct': {
    label:       'Property Set: Distribution Chamber Element Type Formed Duct',
    description: 'Space formed in the ground for the passage of pipes, cables, ducts.',
    applicableTo: ['IFCDISTRIBUTIONCHAMBERELEMENTFORMEDDUCT'],
    props: [
      { name: 'AccessCoverLoadRating', type: 'IfcLabel', description: 'The load rating of the access cover (which may be a value or an alphanumerically defined class rating).' },
      { name: 'BaseThickness', type: 'IfcReal', description: 'The thickness of the base construction, assumed to be constructed at a single thickness.' },
      { name: 'CableDuctOccupancyRatio', type: 'IfcReal', description: 'Indicates the ratio between the number of cables in the duct and the maximum number of cables that the duct can contain.' },
      { name: 'ClearDepth', type: 'IfcReal', description: 'The clear depth.' },
      { name: 'ClearWidth', type: 'IfcReal', description: 'The clear width.' },
      { name: 'WallThickness', type: 'IfcReal', description: 'The thickness of the wall construction.;' },
    ],
  },

  'Pset_DistributionChamberElementTypeInspectionChamb': {
    label:       'Property Set: Distribution Chamber Element Type Inspection Chamber',
    description: 'Chamber constructed on a drain, sewer or pipeline and with a removable cover, that permits visible inspection.',
    applicableTo: ['IFCDISTRIBUTIONCHAMBERELEMENTINSPECTIONCHAMBER'],
    props: [
    ],
  },

  'Pset_DistributionChamberElementTypeInspectionPit': {
    label:       'Property Set: Distribution Chamber Element Type Inspection Pit',
    description: 'Recess or chamber formed to permit access for inspection of substructure and services (definition modified from BS6100 221 4128).',
    applicableTo: ['IFCDISTRIBUTIONCHAMBERELEMENTINSPECTIONPIT'],
    props: [
      { name: 'Depth', type: 'IfcReal', description: 'The depth of the object.' },
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
      { name: 'Width', type: 'IfcReal', description: 'The width of the object. Only given, if the object has constant thickness (prismatic).' },
    ],
  },

  'Pset_DistributionChamberElementTypeManhole': {
    label:       'Property Set: Distribution Chamber Element Type Manhole',
    description: 'Chamber constructed on a drain, sewer or pipeline and with a removable cover, that permits the entry of a person.',
    applicableTo: ['IFCDISTRIBUTIONCHAMBERELEMENTMANHOLE'],
    props: [
      { name: 'AccessCoverLoadRating', type: 'IfcLabel', description: 'The load rating of the access cover (which may be a value or an alphanumerically defined class rating).' },
      { name: 'AccessCoverMaterial', type: 'IfcTimeSeries', description: 'The material from which the access cover to the chamber is constructed.;' },
      { name: 'AccessLengthOrRadius', type: 'IfcReal', description: 'The length of the chamber access cover or, where the plan shape of the cover is circular, the radius.' },
      { name: 'AccessWidth', type: 'IfcReal', description: 'The width of the chamber access cover where the plan shape of the cover is not circular.' },
      { name: 'BaseMaterial', type: 'IfcTimeSeries', description: 'The material from which the base of the chamber is constructed.;' },
      { name: 'BaseThickness', type: 'IfcReal', description: 'The thickness of the base construction, assumed to be constructed at a single thickness.' },
      { name: 'HasSteps', type: 'IfcBoolean', description: 'Indicates whether the chamber has steps (TRUE) or not (FALSE).' },
      { name: 'InvertLevel', type: 'IfcReal', description: 'Level of the lowest part of the cross section as measured from ground level.' },
      { name: 'IsAccessibleOnFoot', type: 'IfcBoolean', description: 'Indicates whether the element is accessible on foot (TRUE) or not (FALSE).' },
      { name: 'IsLocked', type: 'IfcBoolean', description: 'Indicates whether the element is locked (TRUE) or not (FALSE).' },
      { name: 'IsShallow', type: 'IfcBoolean', description: 'Indicates whether the chamber has been designed as being shallow (TRUE) or deep (FALSE).' },
      { name: 'NumberOfCableEntries', type: 'IfcInteger', description: 'Indicates the number of cable entries in the manhole.' },
      { name: 'NumberOfManholeCovers', type: 'IfcInteger', description: 'Indicates the number of manhole covers.' },
      { name: 'SoffitLevel', type: 'IfcReal', description: 'Level of the highest internal part of the cross section as measured from ground level.' },
      { name: 'TypeOfShaft', type: 'IfcLabel', description: 'Additional information on the purpose of the shaft.' },
      { name: 'WallMaterial', type: 'IfcTimeSeries', description: 'The material from which the wall of the chamber is constructed.;' },
      { name: 'WallThickness', type: 'IfcReal', description: 'The thickness of the wall construction.;' },
      { name: 'WithBackdrop', type: 'IfcBoolean', description: 'Indicates whether the chamber has a backdrop or tumbling bay (TRUE) or not (FALSE).' },
    ],
  },

  'Pset_DistributionChamberElementTypeMeterChamber': {
    label:       'Property Set: Distribution Chamber Element Type Meter Chamber',
    description: 'Chamber that houses a meter(s) (definition modified from BS6100 250 6224).',
    applicableTo: ['IFCDISTRIBUTIONCHAMBERELEMENTMETERCHAMBER'],
    props: [
      { name: 'AccessCoverMaterial', type: 'IfcTimeSeries', description: 'The material from which the access cover to the chamber is constructed.;' },
      { name: 'BaseMaterial', type: 'IfcTimeSeries', description: 'The material from which the base of the chamber is constructed.;' },
      { name: 'BaseThickness', type: 'IfcReal', description: 'The thickness of the base construction, assumed to be constructed at a single thickness.' },
      { name: 'ChamberLengthOrRadius', type: 'IfcReal', description: 'Length or, in the event of the shape being circular in plan, the radius of the chamber.' },
      { name: 'ChamberWidth', type: 'IfcReal', description: 'Width, in the event of the shape being non circular in plan.' },
      { name: 'WallMaterial', type: 'IfcTimeSeries', description: 'The material from which the wall of the chamber is constructed.;' },
      { name: 'WallThickness', type: 'IfcReal', description: 'The thickness of the wall construction.;' },
    ],
  },

  'Pset_DistributionChamberElementTypeSump': {
    label:       'Property Set: Distribution Chamber Element Type Sump',
    description: 'Recess or small chamber into which liquid is drained to facilitate its removal.',
    applicableTo: ['IFCDISTRIBUTIONCHAMBERELEMENTSUMP'],
    props: [
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
      { name: 'SumpInvertLevel', type: 'IfcReal', description: 'The lowest point in the cross section of the sump.' },
      { name: 'Width', type: 'IfcReal', description: 'The width of the object. Only given, if the object has constant thickness (prismatic).' },
    ],
  },

  'Pset_DistributionChamberElementTypeTrench': {
    label:       'Property Set: Distribution Chamber Element Type Trench',
    description: 'Excavation, the length of which greatly exceeds the width.',
    applicableTo: ['IFCDISTRIBUTIONCHAMBERELEMENTTRENCH'],
    props: [
      { name: 'Depth', type: 'IfcReal', description: 'The depth of the object.' },
      { name: 'InvertLevel', type: 'IfcReal', description: 'Level of the lowest part of the cross section as measured from ground level.' },
      { name: 'Width', type: 'IfcReal', description: 'The width of the object. Only given, if the object has constant thickness (prismatic).' },
    ],
  },

  'Pset_DistributionChamberElementTypeValveChamber': {
    label:       'Property Set: Distribution Chamber Element Type Valve Chamber',
    description: 'Chamber that houses a valve(s).',
    applicableTo: ['IFCDISTRIBUTIONCHAMBERELEMENTVALVECHAMBER'],
    props: [
      { name: 'AccessCoverMaterial', type: 'IfcTimeSeries', description: 'The material from which the access cover to the chamber is constructed.;' },
      { name: 'BaseMaterial', type: 'IfcTimeSeries', description: 'The material from which the base of the chamber is constructed.;' },
      { name: 'BaseThickness', type: 'IfcReal', description: 'The thickness of the base construction, assumed to be constructed at a single thickness.' },
      { name: 'ChamberLengthOrRadius', type: 'IfcReal', description: 'Length or, in the event of the shape being circular in plan, the radius of the chamber.' },
      { name: 'ChamberWidth', type: 'IfcReal', description: 'Width, in the event of the shape being non circular in plan.' },
      { name: 'WallMaterial', type: 'IfcTimeSeries', description: 'The material from which the wall of the chamber is constructed.;' },
      { name: 'WallThickness', type: 'IfcReal', description: 'The thickness of the wall construction.;' },
    ],
  },

  'Pset_DistributionPortCommon': {
    label:       'Property Set: Distribution Port Common',
    description: 'Common attributes attached to an instance of [[IfcDistributionPort]].',
    applicableTo: ['IFCDISTRIBUTIONPORT', 'IFCDISTRIBUTIONPORTCABLE', 'IFCDISTRIBUTIONPORTCABLECARRIER', 'IFCDISTRIBUTIONPORTDUCT', 'IFCDISTRIBUTIONPORTPIPE', 'IFCDISTRIBUTIONPORTWIRELESS'],
    props: [
      { name: 'ColourCode', type: 'IfcLabel', description: 'Name of a colour for identifying the connector, if applicable.' },
      { name: 'PortNumber', type: 'IfcInteger', description: 'The port index for logically ordering the port within the containing element or element type.' },
    ],
  },

  'Pset_DistributionPortPHistoryCable': {
    label:       'Property Set: Distribution Port Phistory Cable',
    description: 'Log of electrical activity attached to an instance of [[IfcPerformanceHistory]] having an assigned [[IfcDistributionPort]] of type CABLE.',
    applicableTo: ['IFCDISTRIBUTIONPORTCABLE'],
    props: [
      { name: 'ApparentPower', type: 'IfcTimeSeries', description: 'Apparent power.' },
      { name: 'CurrentHistory', type: 'IfcTimeSeries', description: 'Log of electrical current.' },
      { name: 'DataReceived', type: 'IfcTimeSeries', description: 'For data ports, captures log of data received. The LIST at IfcTimeSeriesValue.Values may split out data according to Pse' },
      { name: 'DataTransmitted', type: 'IfcTimeSeries', description: 'For data ports, captures log of data transmitted. The LIST at IfcTimeSeriesValue.Values may split out data according to' },
      { name: 'PowerFactorHistory', type: 'IfcTimeSeries', description: 'Power factor.' },
      { name: 'ReactivePower', type: 'IfcTimeSeries', description: 'Reactive power.' },
      { name: 'RealPower', type: 'IfcTimeSeries', description: 'Real power.' },
      { name: 'VoltageHistory', type: 'IfcTimeSeries', description: 'Log of electrical voltage.' },
    ],
  },

  'Pset_DistributionPortPHistoryDuct': {
    label:       'Property Set: Distribution Port Phistory Duct',
    description: 'Fluid flow performance history attached to an instance of [[IfcPerformanceHistory]] assigned to [[IfcDistributionPort]]. This replaces the deprecated IfcFluidFlowProperties for per',
    applicableTo: ['IFCDISTRIBUTIONPORTDUCT'],
    props: [
      { name: 'FlowConditionHistory', type: 'IfcTimeSeries', description: 'Defines the flow condition as a percentage of the cross-sectional area.' },
      { name: 'MassFlowRateHistory', type: 'IfcTimeSeries', description: 'The mass flow rate of the fluid.' },
      { name: 'PressureHisotry', type: 'IfcTimeSeries', description: 'The pressure of the fluid.' },
      { name: 'TemperatureHistory', type: 'IfcTimeSeries', description: 'Temperature of the fluid. For air this value represents the dry bulb temperature.' },
      { name: 'VelocityHistory', type: 'IfcTimeSeries', description: 'The velocity of the fluid.' },
      { name: 'VolumetricFlowRateHistory', type: 'IfcTimeSeries', description: 'The volumetric flow rate of the fluid.' },
      { name: 'WetBulbTemperatureHistory', type: 'IfcTimeSeries', description: 'Wet bulb temperature of the fluid; only applicable if the fluid is air.' },
    ],
  },

  'Pset_DistributionPortPHistoryPipe': {
    label:       'Property Set: Distribution Port Phistory Pipe',
    description: 'Log of substance usage attached to an instance of [[IfcPerformanceHistory]] having an assigned [[IfcDistributionPort]] of type PIPE.',
    applicableTo: ['IFCDISTRIBUTIONPORTPIPE'],
    props: [
      { name: 'Flowrate', type: 'IfcTimeSeries', description: 'The flowrate of the fluid.' },
      { name: 'Pressure', type: 'IfcReal', description: 'The pressure of fluid.' },
      { name: 'Temperature', type: 'IfcTimeSeries', description: 'Temperature of the fluid.' },
    ],
  },

  'Pset_DistributionPortTypeCable': {
    label:       'Property Set: Distribution Port Type Cable',
    description: 'Cable port occurrence attributes attached to an instance of [[IfcDistributionPort]].',
    applicableTo: ['IFCDISTRIBUTIONPORTCABLE'],
    props: [
      { name: 'ConductorFunction', type: 'IfcLabel', description: 'Indicates function of the conductors to which the load is connected. Where L1, L2 and L3 represent the phase lines accor' },
      { name: 'ConnectionGender', type: 'IfcLabel', description: 'The physical connection gender.' },
      { name: 'ConnectionSubtype', type: 'IfcLabel', description: 'The physical port connection subtype that further qualifies the ConnectionType.A, B, C, D, E, F, EF, G, H, I, J, K, L, M' },
      { name: 'Current', type: 'IfcReal', description: 'The actual current and operable range.' },
      { name: 'CurrentContent3rdHarmonic', type: 'IfcReal', description: 'The ratio between the third harmonic current and the phase current.' },
      { name: 'ElectricalConnectionType', type: 'IfcLabel', description: 'AC plug;DC plug;bare wire' },
      { name: 'HasConnector', type: 'IfcBoolean', description: 'Indicate whether the wire pair end point is terminated with a connector or not.' },
      { name: 'IsWelded', type: 'IfcBoolean', description: 'Indicates whether the wire pair end point is joined to another wire pair end point by means of a welded junction.' },
      { name: 'Power', type: 'IfcReal', description: 'The actual power and operable range.' },
      { name: 'Protocols', type: 'IfcLabel', description: 'For data ports, identifies the protocols used as defined by the Open System Interconnection (OSI) Basic Reference Model' },
      { name: 'Voltage', type: 'IfcReal', description: 'The actual voltage and operable range.' },
    ],
  },

  'Pset_DistributionPortTypeDuct': {
    label:       'Property Set: Distribution Port Type Duct',
    description: 'Duct port occurrence attributes attached to an instance of [[IfcDistributionPort]].',
    applicableTo: ['IFCDISTRIBUTIONPORTDUCT'],
    props: [
      { name: 'ConnectionSubtype', type: 'IfcLabel', description: 'The physical port connection subtype that further qualifies the ConnectionType.A, B, C, D, E, F, EF, G, H, I, J, K, L, M' },
      { name: 'ConnectionType', type: 'IfcLabel', description: 'Beaded Sleeve.;Compression.;Crimp.;Drawband.;Drive slip.;Flanged.;Outside Sleeve.;Slipon.;Soldered.;S-Slip.;Standing sea' },
      { name: 'DryBulbTemperature', type: 'IfcReal', description: 'Dry bulb temperature of the object.' },
      { name: 'NominalHeight', type: 'IfcReal', description: 'The nominal height of the object. The size information is provided in addition to the shape representation and the geome' },
      { name: 'NominalThickness', type: 'IfcReal', description: 'The nominal thickness of the object. The size information is provided in addition to the shape representation and the ge' },
      { name: 'NominalWidth', type: 'IfcReal', description: 'The nominal overall width of the object. The size information is provided in addition to the shape representation and th' },
      { name: 'Pressure', type: 'IfcReal', description: 'The pressure of fluid.' },
      { name: 'Velocity', type: 'IfcReal', description: 'The velocity of the fluid.' },
      { name: 'VolumetricFlowRate', type: 'IfcReal', description: 'The volumetric flow rate of the fluid.' },
      { name: 'WetBulbTemperature', type: 'IfcReal', description: 'Wet bulb temperature of the air.' },
    ],
  },

  'Pset_DistributionPortTypePipe': {
    label:       'Property Set: Distribution Port Type Pipe',
    description: 'Pipe port occurrence attributes attached to an instance of [[IfcDistributionPort]].',
    applicableTo: ['IFCDISTRIBUTIONPORTPIPE'],
    props: [
      { name: 'ConnectionSubtype', type: 'IfcLabel', description: 'The physical port connection subtype that further qualifies the ConnectionType.A, B, C, D, E, F, EF, G, H, I, J, K, L, M' },
      { name: 'ConnectionType', type: 'IfcLabel', description: 'Beaded Sleeve.;Compression.;Crimp.;Drawband.;Drive slip.;Flanged.;Outside Sleeve.;Slipon.;Soldered.;S-Slip.;Standing sea' },
      { name: 'FlowCondition', type: 'IfcReal', description: 'Defines the flow condition as a percentage of the cross-sectional area.' },
      { name: 'InnerDiameter', type: 'IfcReal', description: 'The actual inner diameter of the object.' },
      { name: 'MassFlowRate', type: 'IfcReal', description: 'The mass flow rate of the fluid.' },
      { name: 'NominalDiameter', type: 'IfcReal', description: 'Nominal diameter or width of the object.' },
      { name: 'OuterDiameter', type: 'IfcReal', description: 'The actual outer diameter of the object.' },
      { name: 'Pressure', type: 'IfcReal', description: 'The pressure of fluid.' },
      { name: 'Temperature', type: 'IfcTimeSeries', description: 'Temperature of the fluid.' },
      { name: 'Velocity', type: 'IfcReal', description: 'The velocity of the fluid.' },
      { name: 'VolumetricFlowRate', type: 'IfcReal', description: 'The volumetric flow rate of the fluid.' },
    ],
  },

  'Pset_DistributionSystemTypeElectrical': {
    label:       'Property Set: Distribution System Type Electrical',
    description: 'Properties of electrical circuits.',
    applicableTo: ['IFCDISTRIBUTIONSYSTEMELECTRICAL'],
    props: [
      { name: 'Diversity', type: 'IfcReal', description: 'The ratio, expressed as a numerical; value or as a percentage, of the; simultaneous maximum demand of; a group of electr' },
      { name: 'ElectricalSystemCategory', type: 'IfcLabel', description: 'Designates the voltage range of the circuit, according to IEC. HIGHVOLTAGE indicates >1000V AC or >1500V DV; LOWVOLTAGE' },
      { name: 'ElectricalSystemType', type: 'IfcLabel', description: 'For certain purposes of electrical regulations, IEC 60364 defines types of system using type identifiers. Assignment of' },
      { name: 'MaximumAllowedVoltageDrop', type: 'IfcReal', description: 'The maximum voltage drop across the circuit that must not be exceeded.; There are two voltage drop limit settings that m' },
      { name: 'NetImpedance', type: 'IfcReal', description: 'The maximum earth loop impedance upstream of a circuit (typically stated as the variable Zs). This value is for 55o C (1' },
      { name: 'NumberOfLiveConductors', type: 'IfcInteger', description: 'Number of live conductors within this circuit. Either this property or the ConductorFunction property (if only one) may' },
      { name: 'RatedVoltageRange', type: 'IfcReal', description: '2010, 3.3.10.5.' },
    ],
  },

  'Pset_DistributionSystemTypeOverheadContactlineSyst': {
    label:       'Property Set: Distribution System Type Overhead Contactline System',
    description: 'Properties of an overhead contact line system. The property set is associated with the predefined type OVERHEAD_CONTACT_LINE_SYSTEM of [[IfcDistributionSystem]].',
    applicableTo: ['IFCDISTRIBUTIONSYSTEMOVERHEAD_CONTACTLINE_SYSTEM'],
    props: [
    ],
  },

  'Pset_DistributionSystemTypeVentilation': {
    label:       'Property Set: Distribution System Type Ventilation',
    description: 'This property set is used to define the general characteristics of the duct design parameters within a system.;',
    applicableTo: ['IFCDISTRIBUTIONSYSTEMVENTILATION'],
    props: [
      { name: 'AspectRatio', type: 'IfcReal', description: 'The default aspect ratio.' },
      { name: 'DesignName', type: 'IfcLabel', description: 'A name for the design values.' },
      { name: 'DuctSealant', type: 'IfcTimeSeries', description: 'Type of sealant used on the duct and fittings.' },
      { name: 'DuctSizingMethod', type: 'IfcLabel', description: 'Enumeration that identifies the methodology to be used to size system components.' },
      { name: 'FrictionLoss', type: 'IfcReal', description: 'The pressure loss due to friction per unit length. (Data type = PressureMeasure/LengthMeasure)' },
      { name: 'LeakageClass', type: 'IfcReal', description: 'Nominal leakage rating for the system components.' },
      { name: 'MaximumVelocity', type: 'IfcReal', description: 'The maximum design velocity of the air in the duct or fitting.' },
      { name: 'MinimumHeight', type: 'IfcReal', description: 'The minimum duct height for rectangular, oval or round duct.' },
      { name: 'MinimumWidth', type: 'IfcReal', description: 'The minimum duct width for oval or rectangular duct.' },
      { name: 'PressureClass', type: 'IfcReal', description: 'Nominal pressure rating of the object.' },
      { name: 'ScrapFactor', type: 'IfcReal', description: 'Sheet metal scrap factor.' },
    ],
  },

  'Pset_DoorCommon': {
    label:       'Property Set: Door Common',
    description: 'Properties common to the definition of all occurrences of [[IfcDoor]].',
    applicableTo: ['IFCDOOR', 'IFCDOORBOOM_BARRIER', 'IFCDOORDOOR', 'IFCDOORGATE', 'IFCDOORTRAPDOOR', 'IFCDOORTURNSTILE'],
    props: [
      { name: 'AcousticRating', type: 'IfcLabel', description: 'Acoustic rating for this object.; It is provided according to the national building code. It indicates the sound transmi' },
      { name: 'DurabilityRating', type: 'IfcLabel', description: 'Durability against mechanical stress. It is given according to the national code or regulation.' },
      { name: 'FireExit', type: 'IfcBoolean', description: 'Indication whether this object is designed to serve as an exit in the case of fire (TRUE) or not (FALSE).' },
      { name: 'FireRating', type: 'IfcLabel', description: 'Fire rating for this object. It is given according to the national fire safety classification.' },
      { name: 'GlazingAreaFraction', type: 'IfcReal', description: 'Fraction of the glazing area relative to the total area of the filling element.; It shall be used, if the glazing area i' },
      { name: 'HandicapAccessible', type: 'IfcBoolean', description: 'Indication that this object is designed to be accessible by the handicapped. Set to (TRUE) if this object is rated as ha' },
      { name: 'HasDrive', type: 'IfcBoolean', description: 'Indication whether this object has an automatic drive to operate it (TRUE) or no drive (FALSE)' },
      { name: 'HygrothermalRating', type: 'IfcLabel', description: 'Resistance against hygrothermal impact from different temperatures and humidities inside and outside. It is given accord' },
      { name: 'Infiltration', type: 'IfcReal', description: 'Infiltration flowrate of outside air for the filler object based on the area of the filler object at a pressure level of' },
      { name: 'IsExternal', type: 'IfcBoolean', description: 'Indication whether the element is designed for use in the exterior (TRUE) or not (FALSE). If (TRUE) it is an external el' },
      { name: 'MechanicalLoadRating', type: 'IfcLabel', description: 'Mechanical load rating for this object.; It is provided according to the national building code.' },
      { name: 'SecurityRating', type: 'IfcLabel', description: 'Index based rating system indicating security level.; It is giving according to the national building code.' },
      { name: 'SelfClosing', type: 'IfcBoolean', description: 'Indication whether this object is designed to close automatically after use (TRUE) or not (FALSE).' },
      { name: 'SmokeStop', type: 'IfcBoolean', description: 'Indication whether the object is designed to provide a smoke stop (TRUE) or not (FALSE).' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'ThermalTransmittance', type: 'IfcReal', description: 'Thermal transmittance coefficient (U-Value) of an element, within the direction of the thermal flow (including all mater' },
      { name: 'WaterTightnessRating', type: 'IfcLabel', description: 'Water tightness rating for this object.; It is provided according to the national building code.' },
      { name: 'WindLoadRating', type: 'IfcLabel', description: 'Wind load resistance rating for this object.; It is provided according to the national building code.' },
    ],
  },

  'Pset_DoorLiningProperties': {
    label:       'Property Set: Door Lining Properties',
    description: 'Properties of the door lining.',
    applicableTo: ['IFCDOOR', 'IFCDOORBOOM_BARRIER', 'IFCDOORDOOR', 'IFCDOORGATE', 'IFCDOORTRAPDOOR', 'IFCDOORTURNSTILE', 'IFCMEMBER', 'IFCMEMBERARCH_SEGMENT', 'IFCMEMBERBRACE', 'IFCMEMBERCHORD', 'IFCMEMBERCOLLAR', 'IFCMEMBERMEMBER', 'IFCMEMBERMULLION', 'IFCMEMBERPLATE', 'IFCMEMBERPOST', 'IFCMEMBERPURLIN', 'IFCMEMBERRAFTER', 'IFCMEMBERSTAY_CABLE', 'IFCMEMBERSTIFFENING_RIB', 'IFCMEMBERSTRINGER', 'IFCMEMBERSTRUCTURALCABLE', 'IFCMEMBERSTRUT', 'IFCMEMBERSTUD', 'IFCMEMBERSUSPENDER', 'IFCMEMBERSUSPENSION_CABLE', 'IFCMEMBERTIEBAR'],
    props: [
      { name: 'CasingDepth', type: 'IfcReal', description: 'Depth of the casing.' },
      { name: 'CasingThickness', type: 'IfcReal', description: 'Thickness of the casing.' },
      { name: 'LiningDepth', type: 'IfcReal', description: 'The depth of the lining.' },
      { name: 'LiningOffset', type: 'IfcReal', description: 'Offset of the lining.' },
      { name: 'LiningThickness', type: 'IfcReal', description: 'Thickness of the lining.' },
      { name: 'LiningToPanelOffsetX', type: 'IfcReal', description: 'Offset between the lining and the panel, measured along the x-axis of the local placement.' },
      { name: 'LiningToPanelOffsetY', type: 'IfcReal', description: 'Offset between the lining and the panel, measured along the y-axis of the local placement.' },
      { name: 'ThresholdDepth', type: 'IfcReal', description: 'Depth (dimension in plane perpendicular to door leaf) of the door threshold. Only given if the door lining includes a th' },
      { name: 'ThresholdOffset', type: 'IfcReal', description: 'Offset (dimension in plane perpendicular to door leaf) of the door threshold. The offset is given as distance to the x a' },
      { name: 'ThresholdThickness', type: 'IfcReal', description: '. If ThresholdThickness value is 0. (zero) it denotes a door without a threshold (ThresholdDepth shall be set to NIL in' },
      { name: 'TransomOffset', type: 'IfcReal', description: 'Offset of the transom (if given) which divides the door leaf from a glazing (or window) above. The offset is given from' },
      { name: 'TransomThickness', type: 'IfcReal', description: 'Thickness of the transom.' },
    ],
  },

  'Pset_DoorPanelProperties': {
    label:       'Property Set: Door Panel Properties',
    description: 'Properties of the door panel.',
    applicableTo: ['IFCDOOR', 'IFCDOORBOOM_BARRIER', 'IFCDOORDOOR', 'IFCDOORGATE', 'IFCDOORTRAPDOOR', 'IFCDOORTURNSTILE', 'IFCPLATE', 'IFCPLATEBASE_PLATE', 'IFCPLATECOVER_PLATE', 'IFCPLATECURTAIN_PANEL', 'IFCPLATEFLANGE_PLATE', 'IFCPLATEGUSSET_PLATE', 'IFCPLATESHEET', 'IFCPLATESPLICE_PLATE', 'IFCPLATESTIFFENER_PLATE', 'IFCPLATEWEB_PLATE'],
    props: [
      { name: 'PanelDepth', type: 'IfcReal', description: 'Depth of the panel.' },
      { name: 'PanelOperation', type: 'IfcLabel', description: 'The way of operation of a panel.' },
      { name: 'PanelPosition', type: 'IfcLabel', description: 'Position of the panel.' },
      { name: 'PanelWidth', type: 'IfcReal', description: 'Width of the panel.' },
    ],
  },

  'Pset_DoorTypeTurnstile': {
    label:       'Property Set: Door Type Turnstile',
    description: 'Properties common to turnstiles or automatic gates used to control the flow of people or vehicles. This property set is applied to [[IfcDoor]] instances of predefined type TURNSTIL',
    applicableTo: ['IFCDOORTURNSTILE'],
    props: [
      { name: 'IsBidirectional', type: 'IfcBoolean', description: 'Indicates whether the turnstile is bidirectional.' },
      { name: 'NarrowChannelWidth', type: 'IfcReal', description: 'Indicates the width of the narrow channel.' },
      { name: 'TurnstileType', type: 'IfcLabel', description: 'Indicates the type of turnstile gate.' },
      { name: 'WideChannelWidth', type: 'IfcReal', description: 'Indicates the width of the wide channel.' },
    ],
  },

  'Pset_DoorWindowGlazingType': {
    label:       'Property Set: Door Window Glazing Type',
    description: 'Properties common to the definition of the glazing component of occurrences of [[IfcDoor]] and [[IfcWindow]], used for thermal and lighting calculations.',
    applicableTo: ['IFCDOOR', 'IFCDOORBOOM_BARRIER', 'IFCDOORDOOR', 'IFCDOORGATE', 'IFCDOORTRAPDOOR', 'IFCDOORTURNSTILE', 'IFCWINDOW', 'IFCWINDOWLIGHTDOME', 'IFCWINDOWSKYLIGHT', 'IFCWINDOWWINDOW'],
    props: [
      { name: 'FillGas', type: 'IfcLabel', description: 'Name of the gas by which the gap between two glass layers is filled. It is given for information purposes only.' },
      { name: 'GlassColour', type: 'IfcLabel', description: 'Colour (tint) selection for this glazing. It is given for information purposes only.' },
      { name: 'GlassLayers', type: 'IfcInteger', description: 'Number of glass layers within the frame. E.g. \\\'2\\\' for double glazing.' },
      { name: 'GlassThickness1', type: 'IfcReal', description: 'Thickness of the first (inner) glass layer.' },
      { name: 'GlassThickness2', type: 'IfcReal', description: 'Thickness of the second (intermediate or outer) glass layer.' },
      { name: 'GlassThickness3', type: 'IfcReal', description: 'Thickness of the third (outer) glass layer.' },
      { name: 'IsCoated', type: 'IfcBoolean', description: 'Indication whether the glass is coated with a material (TRUE) or not (FALSE).' },
      { name: 'IsLaminated', type: 'IfcBoolean', description: 'Indication whether the glass is layered with other materials (TRUE) or not (FALSE).' },
      { name: 'IsTempered', type: 'IfcBoolean', description: 'Indication whether the glass is tempered (TRUE) or not (FALSE) .' },
      { name: 'IsWired', type: 'IfcBoolean', description: 'Indication whether the glass includes a contained wire mesh to prevent break-in (TRUE) or not (FALSE)' },
      { name: 'ShadingCoefficient', type: 'IfcReal', description: 'The measure of the ability of a glazing to transmit solar heat, relative to that ability for 3 mm (1/8-inch) clear, doub' },
      { name: 'SolarAbsorption', type: 'IfcReal', description: '(Asol) The ratio of incident solar radiation that is absorbed by a glazing system. It is the sum of the absorption distr' },
      { name: 'SolarHeatGainTransmittance', type: 'IfcReal', description: 'The ratio of incident solar radiation that contributes to the heat gain of the interior, it is the solar radiation that' },
      { name: 'SolarReflectance', type: 'IfcReal', description: 'The ratio of incident solar radiation that is reflected by a glazing system (also named ρe). Note the following equation' },
      { name: 'SolarTransmittance', type: 'IfcReal', description: 'The ratio of incident solar radiation that directly passes through a system (also named τe). Note the following equation' },
      { name: 'ThermalTransmittanceSummer', type: 'IfcReal', description: 'Thermal transmittance coefficient (U-Value) of a material.; Summer thermal transmittance coefficient of the glazing only' },
      { name: 'ThermalTransmittanceWinter', type: 'IfcReal', description: 'Thermal transmittance coefficient (U-Value) of a material.; Winter thermal transmittance coefficient of the glazing only' },
      { name: 'VisibleLightReflectance', type: 'IfcReal', description: 'Fraction of the visible light that is reflected by the glazing at normal incidence. It is a value without unit.' },
      { name: 'VisibleLightTransmittance', type: 'IfcReal', description: 'Fraction of the visible light that passes the object at normal incidence. It is a value without unit.' },
    ],
  },

  'Pset_DuctFittingOccurrence': {
    label:       'Property Set: Duct Fitting Occurrence',
    description: 'Duct fitting occurrence attributes.',
    applicableTo: ['IFCDUCTFITTING', 'IFCDUCTFITTINGBEND', 'IFCDUCTFITTINGCONNECTOR', 'IFCDUCTFITTINGENTRY', 'IFCDUCTFITTINGEXIT', 'IFCDUCTFITTINGJUNCTION', 'IFCDUCTFITTINGOBSTRUCTION', 'IFCDUCTFITTINGTRANSITION'],
    props: [
      { name: 'Colour', type: 'IfcLabel', description: 'Colour of this object.' },
      { name: 'HasLiner', type: 'IfcBoolean', description: 'TRUE if the fitting has interior duct insulating lining, FALSE if it does not.' },
      { name: 'InteriorRoughnessCoefficient', type: 'IfcReal', description: 'The interior roughness of the material of the object.' },
    ],
  },

  'Pset_DuctFittingPHistory': {
    label:       'Property Set: Duct Fitting Phistory',
    description: 'Duct fitting performance history common attributes.',
    applicableTo: ['IFCDUCTFITTING', 'IFCDUCTFITTINGBEND', 'IFCDUCTFITTINGCONNECTOR', 'IFCDUCTFITTINGENTRY', 'IFCDUCTFITTINGEXIT', 'IFCDUCTFITTINGJUNCTION', 'IFCDUCTFITTINGOBSTRUCTION', 'IFCDUCTFITTINGTRANSITION'],
    props: [
      { name: 'AirFlowLeakage', type: 'IfcTimeSeries', description: 'Volumetric leakage flow rate.' },
      { name: 'AtmosphericPressure', type: 'IfcTimeSeries', description: 'Ambient atmospheric pressure.' },
      { name: 'LossCoefficient', type: 'IfcTimeSeries', description: 'Dimensionless loss coefficient used for calculating fluid resistance representing the ratio of total pressure loss to ve' },
    ],
  },

  'Pset_DuctFittingTypeCommon': {
    label:       'Property Set: Duct Fitting Type Common',
    description: 'Duct fitting type common attributes.',
    applicableTo: ['IFCDUCTFITTING', 'IFCDUCTFITTINGBEND', 'IFCDUCTFITTINGCONNECTOR', 'IFCDUCTFITTINGENTRY', 'IFCDUCTFITTINGEXIT', 'IFCDUCTFITTINGJUNCTION', 'IFCDUCTFITTINGOBSTRUCTION', 'IFCDUCTFITTINGTRANSITION'],
    props: [
      { name: 'PressureClass', type: 'IfcReal', description: 'Nominal pressure rating of the object.' },
      { name: 'PressureRange', type: 'IfcReal', description: 'Allowable maximum and minimum working pressure (relative to ambient pressure).' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'TemperatureRange', type: 'IfcReal', description: 'Allowable maximum and minimum temperature.' },
    ],
  },

  'Pset_DuctSegmentOccurrence': {
    label:       'Property Set: Duct Segment Occurrence',
    description: 'Duct segment occurrence attributes attached to an instance of [[IfcDuctSegment]].',
    applicableTo: ['IFCDUCTSEGMENT', 'IFCDUCTSEGMENTFLEXIBLESEGMENT', 'IFCDUCTSEGMENTRIGIDSEGMENT'],
    props: [
      { name: 'Colour', type: 'IfcLabel', description: 'Colour of this object.' },
      { name: 'HasLiner', type: 'IfcBoolean', description: 'TRUE if the fitting has interior duct insulating lining, FALSE if it does not.' },
      { name: 'InteriorRoughnessCoefficient', type: 'IfcReal', description: 'The interior roughness of the material of the object.' },
    ],
  },

  'Pset_DuctSegmentPHistory': {
    label:       'Property Set: Duct Segment Phistory',
    description: 'Duct segment performance history common attributes.',
    applicableTo: ['IFCDUCTSEGMENT', 'IFCDUCTSEGMENTFLEXIBLESEGMENT', 'IFCDUCTSEGMENTRIGIDSEGMENT'],
    props: [
      { name: 'AtmosphericPressure', type: 'IfcTimeSeries', description: 'Ambient atmospheric pressure.' },
      { name: 'FluidFlowLeakage', type: 'IfcTimeSeries', description: 'Volumetric leakage flow rate.' },
      { name: 'LeakageCurveHistory', type: 'IfcTimeSeries', description: 'Leakage per unit length curve versus working pressure. If a scalar is expressed then it represents LeakageClass which is' },
      { name: 'LossCoefficient', type: 'IfcTimeSeries', description: 'Dimensionless loss coefficient used for calculating fluid resistance representing the ratio of total pressure loss to ve' },
    ],
  },

  'Pset_DuctSegmentTypeCommon': {
    label:       'Property Set: Duct Segment Type Common',
    description: 'Duct segment type common attributes.',
    applicableTo: ['IFCDUCTSEGMENT', 'IFCDUCTSEGMENTFLEXIBLESEGMENT', 'IFCDUCTSEGMENTRIGIDSEGMENT'],
    props: [
      { name: 'CrossSectionShape', type: 'IfcLabel', description: 'Cross sectional shape. Note that this shape is uniform throughout the length of the segment. For nonuniform shapes, a tr' },
      { name: 'LongitudinalSeam', type: 'IfcLabel', description: 'The type of seam to be used along the longitudinal axis of the duct segment.' },
      { name: 'NominalDiameterOrWidth', type: 'IfcReal', description: 'The nominal diameter or width of the duct segment.' },
      { name: 'NominalHeight', type: 'IfcReal', description: 'The nominal height of the object. The size information is provided in addition to the shape representation and the geome' },
      { name: 'PressureRange', type: 'IfcReal', description: 'Allowable maximum and minimum working pressure (relative to ambient pressure).' },
      { name: 'Reinforcement', type: 'IfcLabel', description: 'The type of reinforcement, if any, used for the duct segment.' },
      { name: 'ReinforcementSpacing', type: 'IfcReal', description: 'The spacing between reinforcing elements.' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'TemperatureRange', type: 'IfcReal', description: 'Allowable maximum and minimum temperature.' },
      { name: 'WorkingPressure', type: 'IfcReal', description: 'Working pressure.' },
    ],
  },

  'Pset_DuctSilencerPHistory': {
    label:       'Property Set: Duct Silencer Phistory',
    description: 'Duct silencer performance history common attributes.',
    applicableTo: ['IFCDUCTSILENCER', 'IFCDUCTSILENCERFLATOVAL', 'IFCDUCTSILENCERRECTANGULAR', 'IFCDUCTSILENCERROUND'],
    props: [
      { name: 'AirFlowRate', type: 'IfcReal', description: 'Air flow rate.' },
      { name: 'AirPressureDropCurve', type: 'IfcTimeSeries', description: 'Air pressure drop as a function of air flow rate.' },
    ],
  },

  'Pset_DuctSilencerTypeCommon': {
    label:       'Property Set: Duct Silencer Type Common',
    description: 'Duct silencer type common attributes.;Use IfcSoundProperties instead.',
    applicableTo: ['IFCDUCTSILENCER', 'IFCDUCTSILENCERFLATOVAL', 'IFCDUCTSILENCERRECTANGULAR', 'IFCDUCTSILENCERROUND'],
    props: [
      { name: 'AirFlowRateRange', type: 'IfcReal', description: 'Possible range of airflow that can be delivered.' },
      { name: 'HasExteriorInsulation', type: 'IfcBoolean', description: 'TRUE if the silencer has exterior insulation. FALSE if it does not.' },
      { name: 'HydraulicDiameter', type: 'IfcReal', description: 'Hydraulic diameter.' },
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'TemperatureRange', type: 'IfcReal', description: 'Allowable maximum and minimum temperature.' },
      { name: 'Weight', type: 'IfcReal', description: 'Total weight of object' },
      { name: 'WorkingPressureRange', type: 'IfcReal', description: 'Allowable minimum and maximum working pressure (relative to ambient pressure).' },
    ],
  },

  'Pset_ElectricAppliancePHistory': {
    label:       'Property Set: Electric Appliance Phistory',
    description: 'Captures realtime information for electric appliances, such as for energy usage.',
    applicableTo: ['IFCELECTRICAPPLIANCE', 'IFCELECTRICAPPLIANCEDISHWASHER', 'IFCELECTRICAPPLIANCEELECTRICCOOKER', 'IFCELECTRICAPPLIANCEFREESTANDINGELECTRICHEATER', 'IFCELECTRICAPPLIANCEFREESTANDINGFAN', 'IFCELECTRICAPPLIANCEFREESTANDINGWATERCOOLER', 'IFCELECTRICAPPLIANCEFREESTANDINGWATERHEATER', 'IFCELECTRICAPPLIANCEFREEZER', 'IFCELECTRICAPPLIANCEFRIDGE_FREEZER', 'IFCELECTRICAPPLIANCEHANDDRYER', 'IFCELECTRICAPPLIANCEKITCHENMACHINE', 'IFCELECTRICAPPLIANCEMICROWAVE', 'IFCELECTRICAPPLIANCEPHOTOCOPIER', 'IFCELECTRICAPPLIANCEREFRIGERATOR', 'IFCELECTRICAPPLIANCETUMBLEDRYER', 'IFCELECTRICAPPLIANCEVENDINGMACHINE', 'IFCELECTRICAPPLIANCEWASHINGMACHINE'],
    props: [
      { name: 'PowerState', type: 'IfcTimeSeries', description: 'Indicates the power state of the device where True is on and False is off.' },
    ],
  },

  'Pset_ElectricApplianceTypeCommon': {
    label:       'Property Set: Electric Appliance Type Common',
    description: 'Common properties for electric appliances.',
    applicableTo: ['IFCELECTRICAPPLIANCE', 'IFCELECTRICAPPLIANCEDISHWASHER', 'IFCELECTRICAPPLIANCEELECTRICCOOKER', 'IFCELECTRICAPPLIANCEFREESTANDINGELECTRICHEATER', 'IFCELECTRICAPPLIANCEFREESTANDINGFAN', 'IFCELECTRICAPPLIANCEFREESTANDINGWATERCOOLER', 'IFCELECTRICAPPLIANCEFREESTANDINGWATERHEATER', 'IFCELECTRICAPPLIANCEFREEZER', 'IFCELECTRICAPPLIANCEFRIDGE_FREEZER', 'IFCELECTRICAPPLIANCEHANDDRYER', 'IFCELECTRICAPPLIANCEKITCHENMACHINE', 'IFCELECTRICAPPLIANCEMICROWAVE', 'IFCELECTRICAPPLIANCEPHOTOCOPIER', 'IFCELECTRICAPPLIANCEREFRIGERATOR', 'IFCELECTRICAPPLIANCETUMBLEDRYER', 'IFCELECTRICAPPLIANCEVENDINGMACHINE', 'IFCELECTRICAPPLIANCEWASHINGMACHINE'],
    props: [
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_ElectricApplianceTypeDishwasher': {
    label:       'Property Set: Electric Appliance Type Dishwasher',
    description: 'Common properties for dishwasher appliances.',
    applicableTo: ['IFCELECTRICAPPLIANCEDISHWASHER'],
    props: [
      { name: 'DishwasherType', type: 'IfcLabel', description: 'Type of dishwasher.' },
    ],
  },

  'Pset_ElectricApplianceTypeElectricCooker': {
    label:       'Property Set: Electric Appliance Type Electric Cooker',
    description: 'Common properties for electric cooker appliances.',
    applicableTo: ['IFCELECTRICAPPLIANCEELECTRICCOOKER'],
    props: [
      { name: 'ElectricCookerType', type: 'IfcLabel', description: 'Type of electric cooker.' },
    ],
  },

  'Pset_ElectricFlowStorageDeviceTypeBattery': {
    label:       'Property Set: Electric Flow Storage Device Type Battery',
    description: 'Properties of batteries. The property set can be used by the predefined type BATTERY of [[IfcElectricFlowStorageDevice]].',
    applicableTo: ['IFCELECTRICFLOWSTORAGEDEVICEBATTERY'],
    props: [
      { name: 'AssemblyInstruction', type: 'IfcTimeSeries', description: 'Instructions to describe how the system / equipment / facility is assembled.' },
      { name: 'BatteryChargingType', type: 'IfcLabel', description: 'Identifies the predefined types of battery charging.' },
      { name: 'CurrentRegulationRate', type: 'IfcReal', description: 'It shows the ability of DC regulated power supply to suppress the fluctuation of output voltage caused by the change of' },
      { name: 'EncapsulationTechnologyCode', type: 'IfcLabel', description: 'Code indicating the encapsulation technology which has been applied in an electric, electronic or electromechanical comp' },
      { name: 'NominalSupplyCurrent', type: 'IfcReal', description: 'The nominal current of the supply.' },
      { name: 'OpenCircuitVoltage', type: 'IfcReal', description: 'Voltage of a cell or battery when the discharge current is zero Source IEC 482-03-32' },
      { name: 'VoltageRegulationRate', type: 'IfcReal', description: 'When the input side voltage changes from the lowest allowable input value to the specified maximum value, the relative c' },
    ],
  },

  'Pset_ElectricFlowStorageDeviceTypeCapacitor': {
    label:       'Property Set: Electric Flow Storage Device Type Capacitor',
    description: 'Properties of capacitors. The property set can be used by the predefined type CAPACITOR of [[IfcElectricFlowStorageDevice]].',
    applicableTo: ['IFCELECTRICFLOWSTORAGEDEVICECAPACITOR'],
    props: [
      { name: 'NumberOfPhases', type: 'IfcInteger', description: 'Number of phases that the equipment operates on.' },
    ],
  },

  'Pset_ElectricFlowStorageDeviceTypeCommon': {
    label:       'Property Set: Electric Flow Storage Device Type Common',
    description: 'The characteristics of the supply associated with an electrical device occurrence acting as a source of supply to an electrical distribution system',
    applicableTo: ['IFCELECTRICFLOWSTORAGEDEVICE', 'IFCELECTRICFLOWSTORAGEDEVICEBATTERY', 'IFCELECTRICFLOWSTORAGEDEVICECAPACITOR', 'IFCELECTRICFLOWSTORAGEDEVICECAPACITORBANK', 'IFCELECTRICFLOWSTORAGEDEVICECOMPENSATOR', 'IFCELECTRICFLOWSTORAGEDEVICEHARMONICFILTER', 'IFCELECTRICFLOWSTORAGEDEVICEINDUCTOR', 'IFCELECTRICFLOWSTORAGEDEVICEINDUCTORBANK', 'IFCELECTRICFLOWSTORAGEDEVICERECHARGER', 'IFCELECTRICFLOWSTORAGEDEVICEUPS'],
    props: [
      { name: 'ConnectedConductorFunction', type: 'IfcLabel', description: 'Function of the conductors to which the load is connected.' },
      { name: 'EarthFault1PoleMaximumState', type: 'IfcReal', description: 'Maximum 1 pole earth fault current provided at the point of supply i.e. the fault between 1 phase and PE/PEN.' },
      { name: 'EarthFault1PoleMinimumState', type: 'IfcReal', description: 'Minimum 1 pole earth fault current provided at the point of supply i.e. the fault between 1 phase and PE/PEN.' },
      { name: 'EarthFault1PolePowerFactorMaximumState', type: 'IfcReal', description: 'Power factor of the maximum 1 pole earth fault current provided at the point of supply i.e. the fault between 1 phase an' },
      { name: 'EarthFault1PolePowerFactorMinimumState', type: 'IfcReal', description: 'Power factor of the minimum 1 pole earth fault current provided at the point of supply i.e. the fault between 1 phase an' },
      { name: 'MaximumInsulatedVoltage', type: 'IfcReal', description: 'The max voltage that the insulation would operate normally' },
      { name: 'NominalFrequency', type: 'IfcReal', description: 'The nominal frequency of the supply.' },
      { name: 'NominalSupplyVoltage', type: 'IfcReal', description: 'The nominal voltage of the supply.' },
      { name: 'NominalSupplyVoltageOffset', type: 'IfcReal', description: 'The maximum and minimum allowed voltage of the supply e.g. boundaries of 380V/440V may be applied for a nominal voltage' },
      { name: 'PowerCapacity', type: 'IfcReal', description: 'Power capacity of the equipment' },
      { name: 'RatedCapacitance', type: 'IfcReal', description: 'Capacitance value determined under specified conditions and declared by the manufacturer.' },
      { name: 'ShortCircuit1PoleMaximumState', type: 'IfcReal', description: 'Maximum 1 pole short circuit current provided at the point of supply i.e. the fault between 1 phase and N.' },
      { name: 'ShortCircuit1PoleMinimumState', type: 'IfcReal', description: 'Minimum 1 pole short circuit current provided at the point of supply i.e. the fault between 1 phase and N.' },
      { name: 'ShortCircuit1PolePowerFactorMaximumState', type: 'IfcReal', description: 'Power factor of the maximum 1 pole short circuit current provided at the point of supply i.e. the fault between 1 phase' },
      { name: 'ShortCircuit1PolePowerFactorMinimumState', type: 'IfcReal', description: 'Power factor of the minimum 1 pole short circuit current provided at the point of supply i.e. the fault between 1 phase' },
      { name: 'ShortCircuit2PoleMinimumState', type: 'IfcReal', description: 'Minimum 2 pole short circuit current provided at the point of supply.' },
      { name: 'ShortCircuit2PolePowerFactorMinimumState', type: 'IfcReal', description: 'Power factor of the minimum 2 pole short circuit current provided at the point of supply.' },
      { name: 'ShortCircuit3PoleMaximumState', type: 'IfcReal', description: 'Maximum 3 pole short circuit current provided at the point of supply.' },
      { name: 'ShortCircuit3PolePowerFactorMaximumState', type: 'IfcReal', description: 'Power factor of the maximum 3 pole short circuit current provided at the point of supply.' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_ElectricFlowStorageDeviceTypeInductor': {
    label:       'Property Set: Electric Flow Storage Device Type Inductor',
    description: 'Properties of inductors. The property set can be used by the predefined type INDUCTOR of [[IfcElectricFlowStorageDevice]].',
    applicableTo: ['IFCELECTRICFLOWSTORAGEDEVICEINDUCTOR'],
    props: [
      { name: 'Inductance', type: 'IfcReal', description: 'Measure of the Inductance.' },
      { name: 'NumberOfPhases', type: 'IfcInteger', description: 'Number of phases that the equipment operates on.' },
    ],
  },

  'Pset_ElectricFlowStorageDeviceTypeRecharger': {
    label:       'Property Set: Electric Flow Storage Device Type Recharger',
    description: 'Properties of battery rechargers. The property set can be used by the predefined type RECHARGER of [[IfcElectricFlowStorageDevice]].',
    applicableTo: ['IFCELECTRICFLOWSTORAGEDEVICERECHARGER'],
    props: [
      { name: 'NominalSupplyCurrent', type: 'IfcReal', description: 'The nominal current of the supply.' },
    ],
  },

  'Pset_ElectricFlowStorageDeviceTypeUPS': {
    label:       'Property Set: Electric Flow Storage Device Type Ups',
    description: 'Properties of uninterruptible power supply equipment. The property set can be used by the predefined type UPS of [[IfcElectricFlowStorageDevice]].',
    applicableTo: ['IFCELECTRICFLOWSTORAGEDEVICEUPS'],
    props: [
      { name: 'AssemblyInstruction', type: 'IfcTimeSeries', description: 'Instructions to describe how the system / equipment / facility is assembled.' },
      { name: 'CurrentRegulationRate', type: 'IfcReal', description: 'It shows the ability of DC regulated power supply to suppress the fluctuation of output voltage caused by the change of' },
      { name: 'NominalSupplyCurrent', type: 'IfcReal', description: 'The nominal current of the supply.' },
      { name: 'VoltageRegulationRate', type: 'IfcReal', description: 'When the input side voltage changes from the lowest allowable input value to the specified maximum value, the relative c' },
    ],
  },

  'Pset_ElectricFlowTreatmentDeviceTypeElectronicFilt': {
    label:       'Property Set: Electric Flow Treatment Device Type Electronic Filter',
    description: 'Properties associated to electronic filter.; An electronic filter is a device designed to transmit spectral components of signals according to a specified law, generally in order t',
    applicableTo: ['IFCELECTRICFLOWTREATMENTDEVICEELECTRONICFILTER'],
    props: [
    ],
  },

  'Pset_ElectricGeneratorTypeCommon': {
    label:       'Property Set: Electric Generator Type Common',
    description: 'Defines a particular type of engine that is a machine for converting mechanical energy into electrical energy.',
    applicableTo: ['IFCELECTRICGENERATOR', 'IFCELECTRICGENERATORCHP', 'IFCELECTRICGENERATORENGINEGENERATOR', 'IFCELECTRICGENERATORSTANDALONE'],
    props: [
      { name: 'ElectricGeneratorEfficiency', type: 'IfcReal', description: 'The ratio of output capacity to intake capacity.' },
      { name: 'MaximumPowerOutput', type: 'IfcReal', description: 'The maximum output power rating of the engine.' },
      { name: 'StartCurrentFactor', type: 'IfcReal', description: 'IEC. Start current factor defines how large the peak starting current will become on the engine. StartCurrentFactor is m' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_ElectricMotorTypeCommon': {
    label:       'Property Set: Electric Motor Type Common',
    description: 'Defines a particular type of engine that is a machine for converting electrical energy into mechanical energy. Note that in cases where a close coupled or monobloc pump or close co',
    applicableTo: ['IFCELECTRICMOTOR', 'IFCELECTRICMOTORDC', 'IFCELECTRICMOTORINDUCTION', 'IFCELECTRICMOTORPOLYPHASE', 'IFCELECTRICMOTORRELUCTANCESYNCHRONOUS', 'IFCELECTRICMOTORSYNCHRONOUS'],
    props: [
      { name: 'ElectricMotorEfficiency', type: 'IfcReal', description: 'The ratio of output capacity to intake capacity.' },
      { name: 'FrameSize', type: 'IfcLabel', description: 'Designation of the frame size according to the named range of frame sizes designated at the place of use or according to' },
      { name: 'HasPartWinding', type: 'IfcBoolean', description: 'Indication of whether the motor is single speed, i.e. has a single winding (= FALSE) or multi-speed i.e.has part winding' },
      { name: 'IsGuarded', type: 'IfcBoolean', description: 'Indication of whether the motor enclosure is guarded (= TRUE) or not (= FALSE).' },
      { name: 'LockedRotorCurrent', type: 'IfcReal', description: 'Input current when a motor armature is energized but not rotating.' },
      { name: 'MaximumPowerOutput', type: 'IfcReal', description: 'The maximum output power rating of the engine.' },
      { name: 'MotorEnclosureType', type: 'IfcLabel', description: 'A list of the available types of motor enclosure from which that required may be selected.' },
      { name: 'StartCurrentFactor', type: 'IfcReal', description: 'IEC. Start current factor defines how large the peak starting current will become on the engine. StartCurrentFactor is m' },
      { name: 'StartingTime', type: 'IfcReal', description: 'The time (in s) needed for the motor to reach its rated speed with its driven equipment attached, starting from standsti' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'TeTime', type: 'IfcReal', description: 'The maximum time (in s) at which the motor could run with locked rotor when the motor is used in an EX-environment. The' },
    ],
  },

  'Pset_ElectricTimeControlTypeCommon': {
    label:       'Property Set: Electric Time Control Type Common',
    description: 'Common properties for electric time control devices.',
    applicableTo: ['IFCELECTRICTIMECONTROL', 'IFCELECTRICTIMECONTROLRELAY', 'IFCELECTRICTIMECONTROLTIMECLOCK', 'IFCELECTRICTIMECONTROLTIMEDELAY'],
    props: [
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_ElectricalDeviceCommon': {
    label:       'Property Set: Electrical Device Common',
    description: 'A collection of properties that are commonly used by electrical device types.',
    applicableTo: ['*'],
    props: [
      { name: 'ConductorFunction', type: 'IfcLabel', description: 'Indicates function of the conductors to which the load is connected. Where L1, L2 and L3 represent the phase lines accor' },
      { name: 'EarthingStyle', type: 'IfcLabel', description: 'Indicates the earthing style of the electric device.' },
      { name: 'HasProtectiveEarth', type: 'IfcBoolean', description: 'Indicates whether the object has a protective earth connection (=TRUE) or not (= FALSE).' },
      { name: 'HeatDissipation', type: 'IfcReal', description: 'Indicates the heat dissipation of the electric device measured in power.' },
      { name: 'IK_Code', type: 'IfcLabel', description: 'IK Code according to IEC 62262 (2002) is a numeric classification for the degree of protection provided by enclosures fo' },
      { name: 'InsulationStandardClass', type: 'IfcLabel', description: 'Insulation standard classes provides basic protection information against electric shock. Defines levels of insulation r' },
      { name: 'IP_Code', type: 'IfcLabel', description: 'IP Code, the International Protection Marking, IEC 60529), classifies and rates the degree of protection provided agains' },
      { name: 'NominalFrequencyRange', type: 'IfcReal', description: 'The upper and lower limits of frequency for which the operation of the device is certified.' },
      { name: 'NominalPowerConsumption', type: 'IfcReal', description: 'Nominal total power consumption.' },
      { name: 'NumberOfPoles', type: 'IfcInteger', description: 'Number of poles that the object would affect.' },
      { name: 'NumberOfPowerSupplyPorts', type: 'IfcInteger', description: 'Indicates the number of power supply ports of the electric device.' },
      { name: 'Power', type: 'IfcReal', description: 'The actual power and operable range.' },
      { name: 'PowerFactor', type: 'IfcReal', description: 'Power factor; usually as ratio.' },
      { name: 'RatedCurrent', type: 'IfcReal', description: 'The current that a device is designed to handle.' },
      { name: 'RatedVoltage', type: 'IfcReal', description: 'The range of allowed voltage that a device is certified to handle. The upper bound of this value is the maximum.' },
    ],
  },

  'Pset_ElectricalDeviceCompliance': {
    label:       'Property Set: Electrical Device Compliance',
    description: 'Properties related to information about compliance to standards or regulations of electric devices.',
    applicableTo: ['*'],
    props: [
      { name: 'ElectroMagneticStandardsCompliance', type: 'IfcBoolean', description: 'Information about compliance with regard to electro magnetic related standards.' },
      { name: 'ExplosiveAtmosphereStandardsCompliance', type: 'IfcBoolean', description: 'Information about compliance with regard to explosive atmosphere related standards.' },
      { name: 'FireProofingStandardsCompliance', type: 'IfcBoolean', description: 'Information about compliance with regard to fire proofing related standards.' },
      { name: 'LightningProtectionStandardsCompliance', type: 'IfcBoolean', description: 'Information about compliance with regard to lightning protection related standards.' },
    ],
  },

  'Pset_ElectricalFeederLine': {
    label:       'Property Set: Electrical Feeder Line',
    description: 'Properties of conductors used as feeder line. This property set is applicable to a type or occurrence of [[IfcCableSegment]] with predefined type CONDUCTORSEGMENT.',
    applicableTo: ['IFCCABLESEGMENTCONDUCTORSEGMENT'],
    props: [
      { name: 'CurrentCarryingCapacity', type: 'IfcReal', description: 'Maximum value of electric current which can be carried continuously by a conductor, a device or an apparatus, under spec' },
      { name: 'DesignAmbientTemperature', type: 'IfcReal', description: 'The highest and lowest local ambient temperature likely to be encountered.' },
      { name: 'ElectricalClearanceDistance', type: 'IfcReal', description: 'The distance between two conductive parts along a string stretched the shortest way between these conductive parts. (IEV' },
      { name: 'ElectricalFeederType', type: 'IfcLabel', description: 'Type of electrical feeder.' },
    ],
  },

  'Pset_ElementAssemblyCommon': {
    label:       'Property Set: Element Assembly Common',
    description: 'Properties common to the definition of all occurrence and type objects of element assembly.',
    applicableTo: ['IFCELEMENTASSEMBLY', 'IFCELEMENTASSEMBLYABUTMENT', 'IFCELEMENTASSEMBLYACCESSORY_ASSEMBLY', 'IFCELEMENTASSEMBLYARCH', 'IFCELEMENTASSEMBLYBEAM_GRID', 'IFCELEMENTASSEMBLYBRACED_FRAME', 'IFCELEMENTASSEMBLYCROSS_BRACING', 'IFCELEMENTASSEMBLYDECK', 'IFCELEMENTASSEMBLYDILATATIONPANEL', 'IFCELEMENTASSEMBLYENTRANCEWORKS', 'IFCELEMENTASSEMBLYGIRDER', 'IFCELEMENTASSEMBLYGRID', 'IFCELEMENTASSEMBLYMAST', 'IFCELEMENTASSEMBLYPIER', 'IFCELEMENTASSEMBLYPYLON', 'IFCELEMENTASSEMBLYRAIL_MECHANICAL_EQUIPMENT_ASSEMB', 'IFCELEMENTASSEMBLYREINFORCEMENT_UNIT', 'IFCELEMENTASSEMBLYRIGID_FRAME', 'IFCELEMENTASSEMBLYSHELTER', 'IFCELEMENTASSEMBLYSIGNALASSEMBLY', 'IFCELEMENTASSEMBLYSLAB_FIELD', 'IFCELEMENTASSEMBLYSUMPBUSTER', 'IFCELEMENTASSEMBLYSUPPORTINGASSEMBLY', 'IFCELEMENTASSEMBLYSUSPENSIONASSEMBLY', 'IFCELEMENTASSEMBLYTRACKPANEL', 'IFCELEMENTASSEMBLYTRACTION_SWITCHING_ASSEMBLY', 'IFCELEMENTASSEMBLYTRAFFIC_CALMING_DEVICE', 'IFCELEMENTASSEMBLYTRUSS', 'IFCELEMENTASSEMBLYTURNOUTPANEL'],
    props: [
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_ElementAssemblyTypeCantilever': {
    label:       'Property Set: Element Assembly Type Cantilever',
    description: 'Energy cantilever properties used in railway. The property set can be used by the predefined type SUSPENSION_ASSEMBLY of [[IfcElementAssembly]].',
    applicableTo: ['IFCELEMENTASSEMBLYSUSPENSIONASSEMBLY'],
    props: [
      { name: 'AssemblyInstruction', type: 'IfcTimeSeries', description: 'Instructions to describe how the system / equipment / facility is assembled.' },
      { name: 'CantileverType', type: 'IfcLabel', description: 'Type of cantilever assembly.' },
      { name: 'ContactWireStagger', type: 'IfcReal', description: 'Lateral displacement of the contact wire to opposite sides of the track centre at successive supports.' },
      { name: 'SystemHeight', type: 'IfcReal', description: 'Vertical distance between the main catenary wire and the contact wire measured at a support point.' },
    ],
  },

  'Pset_ElementAssemblyTypeDilatationPanel': {
    label:       'Property Set: Element Assembly Type Dilatation Panel',
    description: 'Adjustment switch panel properties used in railway. The property set can be used by the predefined type DILATATION_PANEL of [[IfcElementAssembly]].',
    applicableTo: ['IFCELEMENTASSEMBLYDILATATIONPANEL'],
    props: [
      { name: 'BladesOrientation', type: 'IfcLabel', description: 'Orientation of internal blades.' },
      { name: 'DilatationLength', type: 'IfcReal', description: 'Length dilatation admitted by the element.' },
      { name: 'ExpansionDirection', type: 'IfcLabel', description: 'The expansion direction, e.g. single direction, bi-direction' },
      { name: 'InstallationPlan', type: 'IfcTimeSeries', description: 'Reference to external information source about installation or construction plan of the element.' },
      { name: 'TechnicalStandard', type: 'IfcTimeSeries', description: 'The technical standard which the element should comply with.' },
    ],
  },

  'Pset_ElementAssemblyTypeHeadSpan': {
    label:       'Property Set: Element Assembly Type Head Span',
    description: 'Energy Head [[Span]] properties used in railway. The property set can be used by the predefined type SUSPENSION_ASSEMBLY of [[IfcElementAssembly]].',
    applicableTo: ['IFCELEMENTASSEMBLYSUPPORTINGASSEMBLY'],
    props: [
      { name: 'AssemblyInstruction', type: 'IfcTimeSeries', description: 'Instructions to describe how the system / equipment / facility is assembled.' },
      { name: 'NumberOfTracksCrossed', type: 'IfcInteger', description: 'Indicates the number of tracks which OCS supporting system crosses.' },
      { name: 'Span', type: 'IfcReal', description: 'Clear span for this object.The shape information is provided in addition to the shape representation and the geometric p' },
    ],
  },

  'Pset_ElementAssemblyTypeMast': {
    label:       'Property Set: Element Assembly Type Mast',
    description: 'Telecom Tower properties used in railway. The property set can be used by the predefined type MAST of [[IfcElementAssembly]].',
    applicableTo: ['IFCELEMENTASSEMBLYMAST'],
    props: [
      { name: 'WithLightningRod', type: 'IfcBoolean', description: 'Indicates whether the element is equipped with a lightning rod (TRUE) or not (FALSE).' },
    ],
  },

  'Pset_ElementAssemblyTypeOCSSuspension': {
    label:       'Property Set: Element Assembly Type Ocssuspension',
    description: 'Common energy suspension properties used in railway. The property set can be used by the predefined type SUSPENSION_ASSEMBLY of [[IfcElementAssembly]].',
    applicableTo: ['IFCELEMENTASSEMBLYSUSPENSIONASSEMBLY'],
    props: [
      { name: 'ContactWireHeight', type: 'IfcReal', description: 'Distance from the top of the rail to the lower face of the contact wire, measured perpendicular to the track.' },
      { name: 'ContactWireStagger', type: 'IfcReal', description: 'Lateral displacement of the contact wire to opposite sides of the track centre at successive supports.' },
    ],
  },

  'Pset_ElementAssemblyTypeRigidFrame': {
    label:       'Property Set: Element Assembly Type Rigid Frame',
    description: 'Energy Cross Beam properties used in railway. The property set can be used by the predefined type RIGID_FRAME of [[IfcElementAssembly]].',
    applicableTo: ['IFCELEMENTASSEMBLYRIGID_FRAME'],
    props: [
      { name: 'AssemblyInstruction', type: 'IfcTimeSeries', description: 'Instructions to describe how the system / equipment / facility is assembled.' },
      { name: 'LoadCapacity', type: 'IfcReal', description: 'Indicates the highest permissible load capacity.' },
      { name: 'NumberOfTracksCrossed', type: 'IfcInteger', description: 'Indicates the number of tracks which OCS supporting system crosses.' },
      { name: 'Span', type: 'IfcReal', description: 'Clear span for this object.The shape information is provided in addition to the shape representation and the geometric p' },
    ],
  },

  'Pset_ElementAssemblyTypeSteadyDevice': {
    label:       'Property Set: Element Assembly Type Steady Device',
    description: 'Energy steady device properties used in railway. The property set can be used by the predefined type SUSPENSION_ASSEMBLY of [[IfcElementAssembly]].',
    applicableTo: ['IFCELEMENTASSEMBLYSUSPENSIONASSEMBLY'],
    props: [
      { name: 'AssemblyInstruction', type: 'IfcTimeSeries', description: 'Instructions to describe how the system / equipment / facility is assembled.' },
      { name: 'ContactWireStagger', type: 'IfcReal', description: 'Lateral displacement of the contact wire to opposite sides of the track centre at successive supports.' },
      { name: 'IsSetOnWorkingWire', type: 'IfcBoolean', description: 'Indicates whether the steady device is set on the working wire.' },
      { name: 'SteadyDeviceType', type: 'IfcLabel', description: 'To indicate the mode of registration.' },
    ],
  },

  'Pset_ElementAssemblyTypeSupportingAssembly': {
    label:       'Property Set: Element Assembly Type Supporting Assembly',
    description: 'Energy supporting assembly properties used in railway. The property set can be used by the predefined type SUPPORTING_ASSEMBLY of [[IfcElementAssembly]].',
    applicableTo: ['IFCELEMENTASSEMBLYSUPPORTINGASSEMBLY'],
    props: [
      { name: 'NumberOfCantilevers', type: 'IfcInteger', description: 'Indicates the number of cantilevers in the OCS supporting system.' },
      { name: 'TypeOfSupportingSystem', type: 'IfcLabel', description: 'Type of foundation in the OCS supporting system.' },
    ],
  },

  'Pset_ElementAssemblyTypeTrackPanel': {
    label:       'Property Set: Element Assembly Type Track Panel',
    description: 'Track panel properties used in railway. The property set can be used by the predefined type TRACK_PANEL of [[IfcElementAssembly]].',
    applicableTo: ['IFCELEMENTASSEMBLYTRACKPANEL'],
    props: [
      { name: 'InstallationPlan', type: 'IfcTimeSeries', description: 'Reference to external information source about installation or construction plan of the element.' },
      { name: 'IsAccessibleByVehicle', type: 'IfcBoolean', description: 'Indicates whether the element is accessible by a vehicle or not.' },
      { name: 'TrackExpansion', type: 'IfcReal', description: 'In curvature context, bounded value of the expansion distance that can be added to rail gauge.' },
    ],
  },

  'Pset_ElementAssemblyTypeTractionSwitchingAssembly': {
    label:       'Property Set: Element Assembly Type Traction Switching Assembly',
    description: 'Energy switching assembly properties used in railway. The property set can be used by the predefined type TRACTION_SWITCHING_ASSEMBLY of [[IfcElementAssembly]].',
    applicableTo: ['IFCELEMENTASSEMBLYTRACTION_SWITCHING_ASSEMBLY'],
    props: [
      { name: 'DesignAmbientTemperature', type: 'IfcReal', description: 'The highest and lowest local ambient temperature likely to be encountered.' },
      { name: 'NominalCurrent', type: 'IfcReal', description: 'The nominal current that is designed to be measured.' },
      { name: 'NominalPower', type: 'IfcReal', description: 'A conventional value of apparent power determining a value of the rated current that may be carried with rated voltage a' },
      { name: 'RatedVoltage', type: 'IfcReal', description: 'The range of allowed voltage that a device is certified to handle. The upper bound of this value is the maximum.' },
    ],
  },

  'Pset_ElementAssemblyTypeTurnoutPanel': {
    label:       'Property Set: Element Assembly Type Turnout Panel',
    description: 'Turnout panel properties used in railway. The property set can be used by the predefined type TURNOUT_PANEL of [[IfcElementAssembly]].',
    applicableTo: ['IFCELEMENTASSEMBLYTURNOUTPANEL'],
    props: [
      { name: 'BranchLineDirection', type: 'IfcLabel', description: 'Describes the direction associated to the branch line of the turnout (deviated branch).' },
      { name: 'InstallationPlan', type: 'IfcTimeSeries', description: 'Reference to external information source about installation or construction plan of the element.' },
      { name: 'IsAccessibleByVehicle', type: 'IfcBoolean', description: 'Indicates whether the element is accessible by a vehicle or not.' },
      { name: 'IsSharedTurnout', type: 'IfcBoolean', description: 'Indicates if the turnout makes a connection to another infrastructure owner (for sharing costs).' },
      { name: 'MaximumSpeedLimitOfDivergingLine', type: 'IfcReal', description: 'Maximum speed for diverging line that corresponds to the type of turnout and design constraints.' },
      { name: 'PercentShared', type: 'IfcReal', description: 'Percent of costs paid by the other infrastructure owner.' },
      { name: 'TrackElementOrientation', type: 'IfcLabel', description: 'Turnout panels can be placed in 2 mirror-symmetric directions in the field. To distinguish both ends of the turnout pane' },
      { name: 'TrackExpansion', type: 'IfcReal', description: 'In curvature context, bounded value of the expansion distance that can be added to rail gauge.' },
      { name: 'TrackGaugeLength', type: 'IfcReal', description: 'Basic track gauge of permanent way.' },
      { name: 'TurnoutCurvedRadius', type: 'IfcReal', description: 'If turnout is curved, the main branch radius of curvature.' },
      { name: 'TurnoutHeaterType', type: 'IfcLabel', description: 'Defines the kind of turnout heater installed.' },
      { name: 'TurnoutPointMachineCount', type: 'IfcInteger', description: 'Count of point machines inside turnout panel.' },
      { name: 'TypeOfCurvedTurnout', type: 'IfcLabel', description: 'Turnouts that are positioned in the curved part of the alignment.' },
      { name: 'TypeOfDrivingDevice', type: 'IfcLabel', description: 'Type of the driving device used for the turnout.' },
      { name: 'TypeOfJunction', type: 'IfcLabel', description: 'The turnout part of the continuous welded rail.' },
      { name: 'TypeOfTurnout', type: 'IfcLabel', description: 'Type of turnout.' },
    ],
  },

  'Pset_ElementComponentCommon': {
    label:       'Property Set: Element Component Common',
    description: 'Set of common properties of component elements (especially discrete accessories, but also fasteners, reinforcement elements, or other types of components).',
    applicableTo: ['IFCBUILDINGELEMENTPART', 'IFCBUILDINGELEMENTPARTAPRON', 'IFCBUILDINGELEMENTPARTARMOURUNIT', 'IFCBUILDINGELEMENTPARTINSULATION', 'IFCBUILDINGELEMENTPARTPRECASTPANEL', 'IFCBUILDINGELEMENTPARTSAFETYCAGE', 'IFCDISCRETEACCESSORY', 'IFCDISCRETEACCESSORYANCHORPLATE', 'IFCDISCRETEACCESSORYBIRDPROTECTION', 'IFCDISCRETEACCESSORYBRACKET', 'IFCDISCRETEACCESSORYCABLEARRANGER', 'IFCDISCRETEACCESSORYELASTIC_CUSHION', 'IFCDISCRETEACCESSORYEXPANSION_JOINT_DEVICE', 'IFCDISCRETEACCESSORYFILLER', 'IFCDISCRETEACCESSORYFLASHING', 'IFCDISCRETEACCESSORYINSULATOR', 'IFCDISCRETEACCESSORYLOCK', 'IFCDISCRETEACCESSORYPANEL_STRENGTHENING', 'IFCDISCRETEACCESSORYPOINTMACHINEMOUNTINGDEVICE', 'IFCDISCRETEACCESSORYPOINT_MACHINE_LOCKING_DEVICE', 'IFCDISCRETEACCESSORYRAILBRACE', 'IFCDISCRETEACCESSORYRAILPAD', 'IFCDISCRETEACCESSORYRAIL_LUBRICATION', 'IFCDISCRETEACCESSORYRAIL_MECHANICAL_EQUIPMENT', 'IFCDISCRETEACCESSORYSHOE', 'IFCDISCRETEACCESSORYSLIDINGCHAIR', 'IFCDISCRETEACCESSORYSOUNDABSORPTION', 'IFCDISCRETEACCESSORYTENSIONINGEQUIPMENT', 'IFCELEMENTCOMPONENT', 'IFCFASTENER', 'IFCFASTENERGLUE', 'IFCFASTENERMORTAR', 'IFCFASTENERWELD', 'IFCIMPACTPROTECTIONDEVICE', 'IFCIMPACTPROTECTIONDEVICEBUMPER', 'IFCIMPACTPROTECTIONDEVICECRASHCUSHION', 'IFCIMPACTPROTECTIONDEVICEDAMPINGSYSTEM', 'IFCIMPACTPROTECTIONDEVICEFENDER', 'IFCMECHANICALFASTENER', 'IFCMECHANICALFASTENERANCHORBOLT', 'IFCMECHANICALFASTENERBOLT', 'IFCMECHANICALFASTENERCHAIN', 'IFCMECHANICALFASTENERCOUPLER', 'IFCMECHANICALFASTENERDOWEL', 'IFCMECHANICALFASTENERNAIL', 'IFCMECHANICALFASTENERNAILPLATE', 'IFCMECHANICALFASTENERRAILFASTENING', 'IFCMECHANICALFASTENERRAILJOINT', 'IFCMECHANICALFASTENERRIVET', 'IFCMECHANICALFASTENERROPE', 'IFCMECHANICALFASTENERSCREW', 'IFCMECHANICALFASTENERSHEARCONNECTOR', 'IFCMECHANICALFASTENERSTAPLE', 'IFCMECHANICALFASTENERSTUDSHEARCONNECTOR', 'IFCREINFORCINGBAR', 'IFCREINFORCINGBARANCHORING', 'IFCREINFORCINGBAREDGE', 'IFCREINFORCINGBARLIGATURE', 'IFCREINFORCINGBARMAIN', 'IFCREINFORCINGBARPUNCHING', 'IFCREINFORCINGBARRING', 'IFCREINFORCINGBARSHEAR', 'IFCREINFORCINGBARSPACEBAR', 'IFCREINFORCINGBARSTUD', 'IFCREINFORCINGELEMENT', 'IFCREINFORCINGMESH', 'IFCSIGN', 'IFCSIGNMARKER', 'IFCSIGNMIRROR', 'IFCSIGNPICTORAL', 'IFCTENDON', 'IFCTENDONANCHOR', 'IFCTENDONANCHORCOUPLER', 'IFCTENDONANCHORFIXED_END', 'IFCTENDONANCHORTENSIONING_END', 'IFCTENDONBAR', 'IFCTENDONCOATED', 'IFCTENDONCONDUIT', 'IFCTENDONCONDUITCOUPLER', 'IFCTENDONCONDUITDIABOLO', 'IFCTENDONCONDUITDUCT', 'IFCTENDONCONDUITGROUTING_DUCT', 'IFCTENDONCONDUITTRUMPET', 'IFCTENDONSTRAND', 'IFCTENDONWIRE', 'IFCVIBRATIONDAMPER', 'IFCVIBRATIONDAMPERAXIAL_YIELD', 'IFCVIBRATIONDAMPERBENDING_YIELD', 'IFCVIBRATIONDAMPERFRICTION', 'IFCVIBRATIONDAMPERRUBBER', 'IFCVIBRATIONDAMPERSHEAR_YIELD', 'IFCVIBRATIONDAMPERVISCOUS', 'IFCVIBRATIONISOLATOR', 'IFCVIBRATIONISOLATORBASE', 'IFCVIBRATIONISOLATORCOMPRESSION', 'IFCVIBRATIONISOLATORSPRING'],
    props: [
      { name: 'CorrosionTreatment', type: 'IfcLabel', description: 'Determines corrosion treatment for metal components. This property is provided if the requirement needs to be expressed' },
      { name: 'DeliveryType', type: 'IfcLabel', description: 'Determines how the accessory will be delivered to the site.' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_ElementKinematics': {
    label:       'Property Set: Element Kinematics',
    description: 'Information confirming that the element has cyclic and/or pathed kinematic behaviour. The resulting envelope may be available as a \\\'clearance\\\' shape representation.',
    applicableTo: ['*'],
    props: [
      { name: 'CyclicPath', type: 'IfcReal', description: 'angle table of the kinematic behaviour.' },
      { name: 'CyclicRange', type: 'IfcReal', description: 'Identifies the angular range of the kinematic behaviour' },
      { name: 'LinearPath', type: 'IfcReal', description: 'distance table of the kinematic behaviour.' },
      { name: 'LinearRange', type: 'IfcReal', description: 'Identifies the linear range of the kinematic behaviour.' },
      { name: 'MaximumAngularVelocity', type: 'IfcReal', description: 'Identifies the maximum angular velocity of the kinematic behaviour.' },
      { name: 'MaximumConstantSpeed', type: 'IfcReal', description: 'Identifies the maximum constant speed over the kinematic path.' },
      { name: 'MinimumTime', type: 'IfcReal', description: 'Identifies the minimum time for the kinematic behaviour.' },
    ],
  },

  'Pset_ElementSize': {
    label:       'Property Set: Element Size',
    description: 'Property set with properties about size of the element.',
    applicableTo: ['IFCAIRTERMINAL', 'IFCAIRTERMINALBOX', 'IFCAIRTERMINALBOXCONSTANTFLOW', 'IFCAIRTERMINALBOXVARIABLEFLOWPRESSUREDEPENDANT', 'IFCAIRTERMINALBOXVARIABLEFLOWPRESSUREINDEPENDANT', 'IFCAIRTERMINALDIFFUSER', 'IFCAIRTERMINALGRILLE', 'IFCAIRTERMINALLOUVRE', 'IFCAIRTERMINALREGISTER', 'IFCAIRTOAIRHEATRECOVERY', 'IFCAIRTOAIRHEATRECOVERYFIXEDPLATECOUNTERFLOWEXCHAN', 'IFCAIRTOAIRHEATRECOVERYFIXEDPLATECROSSFLOWEXCHANGE', 'IFCAIRTOAIRHEATRECOVERYFIXEDPLATEPARALLELFLOWEXCHA', 'IFCAIRTOAIRHEATRECOVERYHEATPIPE', 'IFCAIRTOAIRHEATRECOVERYROTARYWHEEL', 'IFCAIRTOAIRHEATRECOVERYRUNAROUNDCOILLOOP', 'IFCAIRTOAIRHEATRECOVERYTHERMOSIPHONCOILTYPEHEATEXC', 'IFCAIRTOAIRHEATRECOVERYTHERMOSIPHONSEALEDTUBEHEATE', 'IFCAIRTOAIRHEATRECOVERYTWINTOWERENTHALPYRECOVERYLO', 'IFCAUDIOVISUALAPPLIANCE', 'IFCAUDIOVISUALAPPLIANCEAMPLIFIER', 'IFCAUDIOVISUALAPPLIANCECAMERA', 'IFCAUDIOVISUALAPPLIANCECOMMUNICATIONTERMINAL', 'IFCAUDIOVISUALAPPLIANCEDISPLAY', 'IFCAUDIOVISUALAPPLIANCEMICROPHONE', 'IFCAUDIOVISUALAPPLIANCEPLAYER', 'IFCAUDIOVISUALAPPLIANCEPROJECTOR', 'IFCAUDIOVISUALAPPLIANCERECEIVER', 'IFCAUDIOVISUALAPPLIANCERECORDINGEQUIPMENT', 'IFCAUDIOVISUALAPPLIANCESPEAKER', 'IFCAUDIOVISUALAPPLIANCESWITCHER', 'IFCAUDIOVISUALAPPLIANCETELEPHONE', 'IFCAUDIOVISUALAPPLIANCETUNER', 'IFCBOILER', 'IFCBOILERSTEAM', 'IFCBOILERWATER', 'IFCBURNER', 'IFCCHILLER', 'IFCCHILLERAIRCOOLED', 'IFCCHILLERHEATRECOVERY', 'IFCCHILLERWATERCOOLED', 'IFCCOIL', 'IFCCOILDXCOOLINGCOIL', 'IFCCOILELECTRICHEATINGCOIL', 'IFCCOILGASHEATINGCOIL', 'IFCCOILHYDRONICCOIL', 'IFCCOILSTEAMHEATINGCOIL', 'IFCCOILWATERCOOLINGCOIL', 'IFCCOILWATERHEATINGCOIL', 'IFCCOMMUNICATIONSAPPLIANCE', 'IFCCOMMUNICATIONSAPPLIANCEANTENNA', 'IFCCOMMUNICATIONSAPPLIANCEAUTOMATON', 'IFCCOMMUNICATIONSAPPLIANCECOMPUTER', 'IFCCOMMUNICATIONSAPPLIANCEFAX', 'IFCCOMMUNICATIONSAPPLIANCEGATEWAY', 'IFCCOMMUNICATIONSAPPLIANCEINTELLIGENTPERIPHERAL', 'IFCCOMMUNICATIONSAPPLIANCEIPNETWORKEQUIPMENT', 'IFCCOMMUNICATIONSAPPLIANCELINESIDEELECTRONICUNIT', 'IFCCOMMUNICATIONSAPPLIANCEMODEM', 'IFCCOMMUNICATIONSAPPLIANCENETWORKAPPLIANCE', 'IFCCOMMUNICATIONSAPPLIANCENETWORKBRIDGE', 'IFCCOMMUNICATIONSAPPLIANCENETWORKHUB', 'IFCCOMMUNICATIONSAPPLIANCEOPTICALLINETERMINAL', 'IFCCOMMUNICATIONSAPPLIANCEOPTICALNETWORKUNIT', 'IFCCOMMUNICATIONSAPPLIANCEPRINTER', 'IFCCOMMUNICATIONSAPPLIANCERADIOBLOCKCENTER', 'IFCCOMMUNICATIONSAPPLIANCEREPEATER', 'IFCCOMMUNICATIONSAPPLIANCEROUTER', 'IFCCOMMUNICATIONSAPPLIANCESCANNER', 'IFCCOMMUNICATIONSAPPLIANCETELECOMMAND', 'IFCCOMMUNICATIONSAPPLIANCETELEPHONYEXCHANGE', 'IFCCOMMUNICATIONSAPPLIANCETRANSITIONCOMPONENT', 'IFCCOMMUNICATIONSAPPLIANCETRANSPONDER', 'IFCCOMMUNICATIONSAPPLIANCETRANSPORTEQUIPMENT', 'IFCCOMPRESSOR', 'IFCCOMPRESSORBOOSTER', 'IFCCOMPRESSORDYNAMIC', 'IFCCOMPRESSORHERMETIC', 'IFCCOMPRESSOROPENTYPE', 'IFCCOMPRESSORRECIPROCATING', 'IFCCOMPRESSORROLLINGPISTON', 'IFCCOMPRESSORROTARY', 'IFCCOMPRESSORROTARYVANE', 'IFCCOMPRESSORSCROLL', 'IFCCOMPRESSORSEMIHERMETIC', 'IFCCOMPRESSORSINGLESCREW', 'IFCCOMPRESSORSINGLESTAGE', 'IFCCOMPRESSORTROCHOIDAL', 'IFCCOMPRESSORTWINSCREW', 'IFCCOMPRESSORWELDEDSHELLHERMETIC', 'IFCCONDENSER', 'IFCCONDENSERAIRCOOLED', 'IFCCONDENSEREVAPORATIVECOOLED', 'IFCCONDENSERWATERCOOLED', 'IFCCONDENSERWATERCOOLEDBRAZEDPLATE', 'IFCCONDENSERWATERCOOLEDSHELLCOIL', 'IFCCONDENSERWATERCOOLEDSHELLTUBE', 'IFCCONDENSERWATERCOOLEDTUBEINTUBE', 'IFCCOOLEDBEAM', 'IFCCOOLEDBEAMACTIVE', 'IFCCOOLEDBEAMPASSIVE', 'IFCCOOLINGTOWER', 'IFCCOOLINGTOWERMECHANICALFORCEDDRAFT', 'IFCCOOLINGTOWERMECHANICALINDUCEDDRAFT', 'IFCCOOLINGTOWERNATURALDRAFT', 'IFCDAMPER', 'IFCDAMPERBACKDRAFTDAMPER', 'IFCDAMPERBALANCINGDAMPER', 'IFCDAMPERBLASTDAMPER', 'IFCDAMPERCONTROLDAMPER', 'IFCDAMPERFIREDAMPER', 'IFCDAMPERFIRESMOKEDAMPER', 'IFCDAMPERFUMEHOODEXHAUST', 'IFCDAMPERGRAVITYDAMPER', 'IFCDAMPERGRAVITYRELIEFDAMPER', 'IFCDAMPERRELIEFDAMPER', 'IFCDAMPERSMOKEDAMPER', 'IFCDISTRIBUTIONBOARD', 'IFCDISTRIBUTIONBOARDCONSUMERUNIT', 'IFCDISTRIBUTIONBOARDDISPATCHINGBOARD', 'IFCDISTRIBUTIONBOARDDISTRIBUTIONBOARD', 'IFCDISTRIBUTIONBOARDDISTRIBUTIONFRAME', 'IFCDISTRIBUTIONBOARDMOTORCONTROLCENTRE', 'IFCDISTRIBUTIONBOARDSWITCHBOARD', 'IFCDISTRIBUTIONCHAMBERELEMENT', 'IFCDISTRIBUTIONCHAMBERELEMENTFORMEDDUCT', 'IFCDISTRIBUTIONCHAMBERELEMENTINSPECTIONCHAMBER', 'IFCDISTRIBUTIONCHAMBERELEMENTINSPECTIONPIT', 'IFCDISTRIBUTIONCHAMBERELEMENTMANHOLE', 'IFCDISTRIBUTIONCHAMBERELEMENTMETERCHAMBER', 'IFCDISTRIBUTIONCHAMBERELEMENTSUMP', 'IFCDISTRIBUTIONCHAMBERELEMENTTRENCH', 'IFCDISTRIBUTIONCHAMBERELEMENTVALVECHAMBER', 'IFCDUCTSILENCER', 'IFCDUCTSILENCERFLATOVAL', 'IFCDUCTSILENCERRECTANGULAR', 'IFCDUCTSILENCERROUND', 'IFCELECTRICAPPLIANCE', 'IFCELECTRICAPPLIANCEDISHWASHER', 'IFCELECTRICAPPLIANCEELECTRICCOOKER', 'IFCELECTRICAPPLIANCEFREESTANDINGELECTRICHEATER', 'IFCELECTRICAPPLIANCEFREESTANDINGFAN', 'IFCELECTRICAPPLIANCEFREESTANDINGWATERCOOLER', 'IFCELECTRICAPPLIANCEFREESTANDINGWATERHEATER', 'IFCELECTRICAPPLIANCEFREEZER', 'IFCELECTRICAPPLIANCEFRIDGE_FREEZER', 'IFCELECTRICAPPLIANCEHANDDRYER', 'IFCELECTRICAPPLIANCEKITCHENMACHINE', 'IFCELECTRICAPPLIANCEMICROWAVE', 'IFCELECTRICAPPLIANCEPHOTOCOPIER', 'IFCELECTRICAPPLIANCEREFRIGERATOR', 'IFCELECTRICAPPLIANCETUMBLEDRYER', 'IFCELECTRICAPPLIANCEVENDINGMACHINE', 'IFCELECTRICAPPLIANCEWASHINGMACHINE', 'IFCELECTRICFLOWSTORAGEDEVICE', 'IFCELECTRICFLOWSTORAGEDEVICEBATTERY', 'IFCELECTRICFLOWSTORAGEDEVICECAPACITOR', 'IFCELECTRICFLOWSTORAGEDEVICECAPACITORBANK', 'IFCELECTRICFLOWSTORAGEDEVICECOMPENSATOR', 'IFCELECTRICFLOWSTORAGEDEVICEHARMONICFILTER', 'IFCELECTRICFLOWSTORAGEDEVICEINDUCTOR', 'IFCELECTRICFLOWSTORAGEDEVICEINDUCTORBANK', 'IFCELECTRICFLOWSTORAGEDEVICERECHARGER', 'IFCELECTRICFLOWSTORAGEDEVICEUPS', 'IFCELECTRICFLOWTREATMENTDEVICE', 'IFCELECTRICFLOWTREATMENTDEVICEELECTRONICFILTER', 'IFCELECTRICGENERATOR', 'IFCELECTRICGENERATORCHP', 'IFCELECTRICGENERATORENGINEGENERATOR', 'IFCELECTRICGENERATORSTANDALONE', 'IFCELECTRICMOTOR', 'IFCELECTRICMOTORDC', 'IFCELECTRICMOTORINDUCTION', 'IFCELECTRICMOTORPOLYPHASE', 'IFCELECTRICMOTORRELUCTANCESYNCHRONOUS', 'IFCELECTRICMOTORSYNCHRONOUS', 'IFCELECTRICTIMECONTROL', 'IFCELECTRICTIMECONTROLRELAY', 'IFCELECTRICTIMECONTROLTIMECLOCK', 'IFCELECTRICTIMECONTROLTIMEDELAY', 'IFCENERGYCONVERSIONDEVICE', 'IFCENGINE', 'IFCENGINEEXTERNALCOMBUSTION', 'IFCENGINEINTERNALCOMBUSTION', 'IFCEVAPORATIVECOOLER', 'IFCEVAPORATIVECOOLERDIRECTEVAPORATIVEAIRWASHER', 'IFCEVAPORATIVECOOLERDIRECTEVAPORATIVEPACKAGEDROTAR', 'IFCEVAPORATIVECOOLERDIRECTEVAPORATIVERANDOMMEDIAAI', 'IFCEVAPORATIVECOOLERDIRECTEVAPORATIVERIGIDMEDIAAIR', 'IFCEVAPORATIVECOOLERDIRECTEVAPORATIVESLINGERSPACKA', 'IFCEVAPORATIVECOOLERINDIRECTDIRECTCOMBINATION', 'IFCEVAPORATIVECOOLERINDIRECTEVAPORATIVECOOLINGTOWE', 'IFCEVAPORATIVECOOLERINDIRECTEVAPORATIVEPACKAGEAIRC', 'IFCEVAPORATIVECOOLERINDIRECTEVAPORATIVEWETCOIL', 'IFCEVAPORATOR', 'IFCEVAPORATORDIRECTEXPANSION', 'IFCEVAPORATORDIRECTEXPANSIONBRAZEDPLATE', 'IFCEVAPORATORDIRECTEXPANSIONSHELLANDTUBE', 'IFCEVAPORATORDIRECTEXPANSIONTUBEINTUBE', 'IFCEVAPORATORFLOODEDSHELLANDTUBE', 'IFCEVAPORATORSHELLANDCOIL', 'IFCFAN', 'IFCFANCENTRIFUGALAIRFOIL', 'IFCFANCENTRIFUGALBACKWARDINCLINEDCURVED', 'IFCFANCENTRIFUGALFORWARDCURVED', 'IFCFANCENTRIFUGALRADIAL', 'IFCFANPROPELLORAXIAL', 'IFCFANTUBEAXIAL', 'IFCFANVANEAXIAL', 'IFCFILTER', 'IFCFILTERAIRPARTICLEFILTER', 'IFCFILTERCOMPRESSEDAIRFILTER', 'IFCFILTERODORFILTER', 'IFCFILTEROILFILTER', 'IFCFILTERSTRAINER', 'IFCFILTERWATERFILTER', 'IFCFIRESUPPRESSIONTERMINAL', 'IFCFIRESUPPRESSIONTERMINALBREECHINGINLET', 'IFCFIRESUPPRESSIONTERMINALFIREHYDRANT', 'IFCFIRESUPPRESSIONTERMINALFIREMONITOR', 'IFCFIRESUPPRESSIONTERMINALHOSEREEL', 'IFCFIRESUPPRESSIONTERMINALSPRINKLER', 'IFCFIRESUPPRESSIONTERMINALSPRINKLERDEFLECTOR', 'IFCFLOWCONTROLLER', 'IFCFLOWMETER', 'IFCFLOWMETERENERGYMETER', 'IFCFLOWMETERGASMETER', 'IFCFLOWMETEROILMETER', 'IFCFLOWMETERWATERMETER', 'IFCFLOWMOVINGDEVICE', 'IFCFLOWSTORAGEDEVICE', 'IFCFLOWTERMINAL', 'IFCFLOWTREATMENTDEVICE', 'IFCHEATEXCHANGER', 'IFCHEATEXCHANGERPLATE', 'IFCHEATEXCHANGERSHELLANDTUBE', 'IFCHEATEXCHANGERTURNOUTHEATING', 'IFCHUMIDIFIER', 'IFCHUMIDIFIERADIABATICAIRWASHER', 'IFCHUMIDIFIERADIABATICATOMIZING', 'IFCHUMIDIFIERADIABATICCOMPRESSEDAIRNOZZLE', 'IFCHUMIDIFIERADIABATICPAN', 'IFCHUMIDIFIERADIABATICRIGIDMEDIA', 'IFCHUMIDIFIERADIABATICULTRASONIC', 'IFCHUMIDIFIERADIABATICWETTEDELEMENT', 'IFCHUMIDIFIERASSISTEDBUTANE', 'IFCHUMIDIFIERASSISTEDELECTRIC', 'IFCHUMIDIFIERASSISTEDNATURALGAS', 'IFCHUMIDIFIERASSISTEDPROPANE', 'IFCHUMIDIFIERASSISTEDSTEAM', 'IFCHUMIDIFIERSTEAMINJECTION', 'IFCINTERCEPTOR', 'IFCINTERCEPTORCYCLONIC', 'IFCINTERCEPTORGREASE', 'IFCINTERCEPTOROIL', 'IFCINTERCEPTORPETROL', 'IFCLAMP', 'IFCLAMPCOMPACTFLUORESCENT', 'IFCLAMPFLUORESCENT', 'IFCLAMPHALOGEN', 'IFCLAMPHIGHPRESSUREMERCURY', 'IFCLAMPHIGHPRESSURESODIUM', 'IFCLAMPLED', 'IFCLAMPMETALHALIDE', 'IFCLAMPOLED', 'IFCLAMPTUNGSTENFILAMENT', 'IFCLIGHTFIXTURE', 'IFCLIGHTFIXTUREDIRECTIONSOURCE', 'IFCLIGHTFIXTUREPOINTSOURCE', 'IFCLIGHTFIXTURESECURITYLIGHTING', 'IFCLIQUIDTERMINAL', 'IFCLIQUIDTERMINALHOSEREEL', 'IFCLIQUIDTERMINALLOADINGARM', 'IFCMEDICALDEVICE', 'IFCMEDICALDEVICEAIRSTATION', 'IFCMEDICALDEVICEFEEDAIRUNIT', 'IFCMEDICALDEVICEOXYGENGENERATOR', 'IFCMEDICALDEVICEOXYGENPLANT', 'IFCMEDICALDEVICEVACUUMSTATION', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCE', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCEACCESSPOINT', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCEBASEBANDUNIT', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCEBASETRANSCEIVE', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCEE_UTRAN_NODE_B', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCEGATEWAY_GPRS_S', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCEMASTERUNIT', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCEMOBILESWITCHIN', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCEMSCSERVER', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCEPACKETCONTROLU', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCEREMOTERADIOUNI', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCEREMOTEUNIT', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCESERVICE_GPRS_S', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCESUBSCRIBERSERV', 'IFCMOTORCONNECTION', 'IFCMOTORCONNECTIONBELTDRIVE', 'IFCMOTORCONNECTIONCOUPLING', 'IFCMOTORCONNECTIONDIRECTDRIVE', 'IFCOUTLET', 'IFCOUTLETAUDIOVISUALOUTLET', 'IFCOUTLETCOMMUNICATIONSOUTLET', 'IFCOUTLETDATAOUTLET', 'IFCOUTLETPOWEROUTLET', 'IFCOUTLETTELEPHONEOUTLET', 'IFCPROTECTIVEDEVICE', 'IFCPROTECTIVEDEVICEANTI_ARCING_DEVICE', 'IFCPROTECTIVEDEVICECIRCUITBREAKER', 'IFCPROTECTIVEDEVICEEARTHINGSWITCH', 'IFCPROTECTIVEDEVICEEARTHLEAKAGECIRCUITBREAKER', 'IFCPROTECTIVEDEVICEFUSEDISCONNECTOR', 'IFCPROTECTIVEDEVICERESIDUALCURRENTCIRCUITBREAKER', 'IFCPROTECTIVEDEVICERESIDUALCURRENTSWITCH', 'IFCPROTECTIVEDEVICESPARKGAP', 'IFCPROTECTIVEDEVICEVARISTOR', 'IFCPROTECTIVEDEVICEVOLTAGELIMITER', 'IFCPUMP', 'IFCPUMPCIRCULATOR', 'IFCPUMPENDSUCTION', 'IFCPUMPSPLITCASE', 'IFCPUMPSUBMERSIBLEPUMP', 'IFCPUMPSUMPPUMP', 'IFCPUMPVERTICALINLINE', 'IFCPUMPVERTICALTURBINE', 'IFCSANITARYTERMINAL', 'IFCSANITARYTERMINALBATH', 'IFCSANITARYTERMINALBIDET', 'IFCSANITARYTERMINALCISTERN', 'IFCSANITARYTERMINALSANITARYFOUNTAIN', 'IFCSANITARYTERMINALSHOWER', 'IFCSANITARYTERMINALSINK', 'IFCSANITARYTERMINALTOILETPAN', 'IFCSANITARYTERMINALURINAL', 'IFCSANITARYTERMINALWASHHANDBASIN', 'IFCSANITARYTERMINALWCSEAT', 'IFCSIGNAL', 'IFCSIGNALAUDIO', 'IFCSIGNALMIXED', 'IFCSIGNALVISUAL', 'IFCSOLARDEVICE', 'IFCSOLARDEVICESOLARCOLLECTOR', 'IFCSOLARDEVICESOLARPANEL', 'IFCSPACEHEATER', 'IFCSPACEHEATERCONVECTOR', 'IFCSPACEHEATERRADIATOR', 'IFCSTACKTERMINAL', 'IFCSTACKTERMINALBIRDCAGE', 'IFCSTACKTERMINALCOWL', 'IFCSTACKTERMINALRAINWATERHOPPER', 'IFCSWITCHINGDEVICE', 'IFCSWITCHINGDEVICECONTACTOR', 'IFCSWITCHINGDEVICEDIMMERSWITCH', 'IFCSWITCHINGDEVICEEMERGENCYSTOP', 'IFCSWITCHINGDEVICEKEYPAD', 'IFCSWITCHINGDEVICEMOMENTARYSWITCH', 'IFCSWITCHINGDEVICERELAY', 'IFCSWITCHINGDEVICESELECTORSWITCH', 'IFCSWITCHINGDEVICESTARTER', 'IFCSWITCHINGDEVICESTART_AND_STOP_EQUIPMENT', 'IFCSWITCHINGDEVICESWITCHDISCONNECTOR', 'IFCSWITCHINGDEVICETOGGLESWITCH', 'IFCTANK', 'IFCTANKBASIN', 'IFCTANKBREAKPRESSURE', 'IFCTANKEXPANSION', 'IFCTANKFEEDANDEXPANSION', 'IFCTANKOILRETENTIONTRAY', 'IFCTANKPRESSUREVESSEL', 'IFCTANKSTORAGE', 'IFCTANKVESSEL', 'IFCTRANSFORMER', 'IFCTRANSFORMERCHOPPER', 'IFCTRANSFORMERCOMBINED', 'IFCTRANSFORMERCURRENT', 'IFCTRANSFORMERFREQUENCY', 'IFCTRANSFORMERINVERTER', 'IFCTRANSFORMERRECTIFIER', 'IFCTRANSFORMERVOLTAGE', 'IFCTUBEBUNDLE', 'IFCTUBEBUNDLEFINNED', 'IFCUNITARYEQUIPMENT', 'IFCUNITARYEQUIPMENTAIRCONDITIONINGUNIT', 'IFCUNITARYEQUIPMENTAIRHANDLER', 'IFCUNITARYEQUIPMENTDEHUMIDIFIER', 'IFCUNITARYEQUIPMENTROOFTOPUNIT', 'IFCUNITARYEQUIPMENTSPLITSYSTEM', 'IFCVALVE', 'IFCVALVEAIRRELEASE', 'IFCVALVEANTIVACUUM', 'IFCVALVECHANGEOVER', 'IFCVALVECHECK', 'IFCVALVECOMMISSIONING', 'IFCVALVEDIVERTING', 'IFCVALVEDOUBLECHECK', 'IFCVALVEDOUBLEREGULATING', 'IFCVALVEDRAWOFFCOCK', 'IFCVALVEFAUCET', 'IFCVALVEFLUSHING', 'IFCVALVEGASCOCK', 'IFCVALVEGASTAP', 'IFCVALVEISOLATING', 'IFCVALVEMIXING', 'IFCVALVEPRESSUREREDUCING', 'IFCVALVEPRESSURERELIEF', 'IFCVALVEREGULATING', 'IFCVALVESAFETYCUTOFF', 'IFCVALVESTEAMTRAP', 'IFCVALVESTOPCOCK', 'IFCWASTETERMINAL', 'IFCWASTETERMINALFLOORTRAP', 'IFCWASTETERMINALFLOORWASTE', 'IFCWASTETERMINALGULLYSUMP', 'IFCWASTETERMINALGULLYTRAP', 'IFCWASTETERMINALROOFDRAIN', 'IFCWASTETERMINALWASTEDISPOSALUNIT', 'IFCWASTETERMINALWASTETRAP'],
    props: [
      { name: 'NominalHeight', type: 'IfcReal', description: 'The nominal height of the object. The size information is provided in addition to the shape representation and the geome' },
      { name: 'NominalLength', type: 'IfcReal', description: 'The nominal overall length of the object. The size information is provided in addition to the shape representation and t' },
      { name: 'NominalWidth', type: 'IfcReal', description: 'The nominal overall width of the object. The size information is provided in addition to the shape representation and th' },
    ],
  },

  'Pset_EmbeddedTrack': {
    label:       'Property Set: Embedded Track',
    description: 'Properties for track slab that have embedded tracks recessed into road surface.',
    applicableTo: ['IFCSLABTRACKSLAB'],
    props: [
      { name: 'HasDrainage', type: 'IfcBoolean', description: 'Indicates whether the infrastructure element has drainage embedded or not.' },
      { name: 'IsAccessibleByVehicle', type: 'IfcBoolean', description: 'Indicates whether the element is accessible by a vehicle or not.' },
      { name: 'PermissibleRoadLoad', type: 'IfcReal', description: 'Permissible traffic load for the road design.' },
    ],
  },

  'Pset_EnergyRequirements': {
    label:       'Property Set: Energy Requirements',
    description: 'Property set for the application of energy requirements to facility and physical elements',
    applicableTo: ['*'],
    props: [
      { name: 'EnergyConsumption', type: 'IfcReal', description: 'Annual energy consumption requirement' },
      { name: 'EnergyConversionEfficiency', type: 'IfcReal', description: 'Measure of the efficiency of conversion of fuel energy to mechanical energy' },
      { name: 'EnergySourceLabel', type: 'IfcLabel', description: 'Type of energy source e.g. Electricity, Diesel, LPG etc. utilised by the element.' },
      { name: 'PowerDemand', type: 'IfcReal', description: 'Power demand of the element' },
    ],
  },

  'Pset_EngineTypeCommon': {
    label:       'Property Set: Engine Type Common',
    description: 'Engine type common attributes.',
    applicableTo: ['IFCENGINE', 'IFCENGINEEXTERNALCOMBUSTION', 'IFCENGINEINTERNALCOMBUSTION'],
    props: [
      { name: 'EnergySource', type: 'IfcLabel', description: 'Enumeration defining the energy source or fuel cumbusted.' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_EnvironmentalCondition': {
    label:       'Property Set: Environmental Condition',
    description: 'Properties defining environment conditions required by the element.',
    applicableTo: ['*'],
    props: [
      { name: 'MaximumAtmosphericPressure', type: 'IfcReal', description: 'Maximum level of atmospheric pressure that the equipment can operate effectively in.' },
      { name: 'MaximumRainIntensity', type: 'IfcReal', description: 'Maximum level of rain intensity that the equipment can operate effectively in. It is usually measured in millimeter per' },
      { name: 'MaximumSolarRadiation', type: 'IfcReal', description: 'Maximum level of solar irradiance that the equipment can operate effectively in. This is usually tested and measured by' },
      { name: 'MaximumWindSpeed', type: 'IfcReal', description: 'Maximum resistance to wind load exposure.' },
      { name: 'OperationalTemperatureRange', type: 'IfcReal', description: 'The temperature range in which the device operates normally.' },
      { name: 'ReferenceAirRelativeHumidity', type: 'IfcReal', description: 'Measurement of the ratio of water vapor in the air.' },
      { name: 'ReferenceEnvironmentTemperature', type: 'IfcReal', description: 'Ideal temperature range.' },
      { name: 'SaltMistLevel', type: 'IfcLabel', description: 'Maximum level of salt mist that the equipment can operate effectively in. It is provided according to an international o' },
      { name: 'SeismicResistance', type: 'IfcReal', description: 'Maximum magnitude of earthquake that the equipment complies with. The value indicates earthquake intensity measured in R' },
      { name: 'SmokeLevel', type: 'IfcLabel', description: 'Maximum level of smoke that the equipment complies with. It is provided according to an international or national standa' },
      { name: 'StorageTemperatureRange', type: 'IfcReal', description: 'Allowed storage temperature range that the element complies with.' },
    ],
  },

  'Pset_EnvironmentalEmissions': {
    label:       'Property Set: Environmental Emissions',
    description: 'Property set for the application of energy emissions produced by facility and physical elements.',
    applicableTo: ['*'],
    props: [
      { name: 'CarbonDioxideEmissions', type: 'IfcReal', description: 'Rate of emission of carbon dioxide' },
      { name: 'NitrogenOxidesEmissions', type: 'IfcReal', description: 'Rate of emission of nitrogen oxides' },
      { name: 'NoiseEmissions', type: 'IfcReal', description: 'Level of sound emission' },
      { name: 'ParticulateMatterEmissions', type: 'IfcReal', description: 'Rate of emission of particulate matter' },
      { name: 'SulphurDioxideEmissions', type: 'IfcReal', description: 'Rate of emission of sulphur dioxide' },
    ],
  },

  'Pset_EnvironmentalImpactIndicators': {
    label:       'Property Set: Environmental Impact Indicators',
    description: 'Environmental impact indicators are related to a given functional unit (ISO 14040 concept). An example of functional unit is a \\\'Double glazing window with PVC frame\\\' and the unit',
    applicableTo: ['*'],
    props: [
      { name: 'AtmosphericAcidificationPerUnit', type: 'IfcReal', description: 'Quantity of gases responsible for the atmospheric acidification calculated in equivalent SO2' },
      { name: 'ClimateChangePerUnit', type: 'IfcReal', description: 'Quantity of greenhouse gases emitted calculated in equivalent CO2' },
      { name: 'EutrophicationPerUnit', type: 'IfcReal', description: 'Quantity of eutrophicating compounds calculated in equivalent PO4' },
      { name: 'ExpectedServiceLife', type: 'IfcReal', description: 'Expected service life in years.' },
      { name: 'FunctionalUnitReference', type: 'IfcLabel', description: 'Reference to a database or a classification' },
      { name: 'HazardousWastePerUnit', type: 'IfcReal', description: 'Quantity of hazardous waste generated' },
      { name: 'IndicatorsUnit', type: 'IfcLabel', description: 'The unit of the quantity the environmental indicators values are related with.' },
      { name: 'InertWastePerUnit', type: 'IfcReal', description: 'Quantity of inert waste generated' },
      { name: 'LifeCyclePhase', type: 'IfcLabel', description: 'The whole life cycle or only a given phase from which environmental data are valid.' },
      { name: 'NonHazardousWastePerUnit', type: 'IfcReal', description: 'Quantity of non hazardous waste generated' },
      { name: 'NonRenewableEnergyConsumptionPerUnit', type: 'IfcReal', description: '2007' },
      { name: 'PhotochemicalOzoneFormationPerUnit', type: 'IfcReal', description: 'Quantity of gases creating the photochemical ozone calculated in equivalent ethylene' },
      { name: 'RadioactiveWastePerUnit', type: 'IfcReal', description: 'Quantity of radioactive waste generated' },
      { name: 'RenewableEnergyConsumptionPerUnit', type: 'IfcReal', description: '2007' },
      { name: 'ResourceDepletionPerUnit', type: 'IfcReal', description: 'Quantity of resources used calculated in equivalent antimony' },
      { name: 'StratosphericOzoneLayerDestructionPerUnit', type: 'IfcReal', description: 'Quantity of gases destroying the stratospheric ozone layer calculated in equivalent CFC-R11' },
      { name: 'TotalPrimaryEnergyConsumptionPerUnit', type: 'IfcReal', description: '2007.' },
      { name: 'WaterConsumptionPerUnit', type: 'IfcReal', description: 'Quantity of water used.' },
    ],
  },

  'Pset_EnvironmentalImpactValues': {
    label:       'Property Set: Environmental Impact Values',
    description: 'The following properties capture environmental impact values of an element. They correspond to the indicators defined into [[Pset_EnvironmentalImpactIndicators]].; Environmental im',
    applicableTo: ['*'],
    props: [
      { name: 'AtmosphericAcidification', type: 'IfcReal', description: 'Quantity of gases responsible for the atmospheric acidification calculated in equivalent SO2.' },
      { name: 'ClimateChange', type: 'IfcReal', description: 'Quantity of greenhouse gases emitted calculated in equivalent CO2.' },
      { name: 'Duration', type: 'IfcLabel', description: 'Duration.' },
      { name: 'Eutrophication', type: 'IfcReal', description: 'Quantity of eutrophicating compounds calculated in equivalent PO4.' },
      { name: 'HazardousWaste', type: 'IfcReal', description: 'Quantity of hazardous waste generated.' },
      { name: 'InertWaste', type: 'IfcReal', description: 'Quantity of inert waste generated .' },
      { name: 'LeadInTime', type: 'IfcLabel', description: 'Lead in time before start of process.' },
      { name: 'LeadOutTime', type: 'IfcLabel', description: 'Lead out time after end of process.' },
      { name: 'NonHazardousWaste', type: 'IfcReal', description: 'Quantity of non hazardous waste generated.' },
      { name: 'NonRenewableEnergyConsumption', type: 'IfcReal', description: '2007' },
      { name: 'PhotochemicalOzoneFormation', type: 'IfcReal', description: 'Quantity of gases creating the photochemical ozone calculated in equivalent ethylene.' },
      { name: 'RadioactiveWaste', type: 'IfcReal', description: 'Quantity of radioactive waste generated.' },
      { name: 'RenewableEnergyConsumption', type: 'IfcReal', description: '2007' },
      { name: 'ResourceDepletion', type: 'IfcReal', description: 'Quantity of resources used calculated in equivalent antimony.' },
      { name: 'StratosphericOzoneLayerDestruction', type: 'IfcReal', description: 'Quantity of gases destroying the stratospheric ozone layer calculated in equivalent CFC-R11.' },
      { name: 'TotalPrimaryEnergyConsumption', type: 'IfcReal', description: '2007.' },
      { name: 'WaterConsumption', type: 'IfcReal', description: 'Quantity of water used.' },
    ],
  },

  'Pset_EvaporativeCoolerPHistory': {
    label:       'Property Set: Evaporative Cooler Phistory',
    description: 'Evaporative cooler performance history attributes.',
    applicableTo: ['IFCEVAPORATIVECOOLER', 'IFCEVAPORATIVECOOLERDIRECTEVAPORATIVEAIRWASHER', 'IFCEVAPORATIVECOOLERDIRECTEVAPORATIVEPACKAGEDROTAR', 'IFCEVAPORATIVECOOLERDIRECTEVAPORATIVERANDOMMEDIAAI', 'IFCEVAPORATIVECOOLERDIRECTEVAPORATIVERIGIDMEDIAAIR', 'IFCEVAPORATIVECOOLERDIRECTEVAPORATIVESLINGERSPACKA', 'IFCEVAPORATIVECOOLERINDIRECTDIRECTCOMBINATION', 'IFCEVAPORATIVECOOLERINDIRECTEVAPORATIVECOOLINGTOWE', 'IFCEVAPORATIVECOOLERINDIRECTEVAPORATIVEPACKAGEAIRC', 'IFCEVAPORATIVECOOLERINDIRECTEVAPORATIVEWETCOIL'],
    props: [
      { name: 'Effectiveness', type: 'IfcTimeSeries', description: 'Effectiveness, represented as ratio.' },
      { name: 'LatentHeatTransferRate', type: 'IfcTimeSeries', description: 'Latent heat transfer rate.' },
      { name: 'SensibleHeatTransferRate', type: 'IfcTimeSeries', description: 'Sensible heat transfer rate.' },
      { name: 'TotalHeatTransferRate', type: 'IfcTimeSeries', description: 'Total heat transfer rate.' },
      { name: 'WaterSumpTemperature', type: 'IfcTimeSeries', description: 'Water sump temperature.' },
    ],
  },

  'Pset_EvaporativeCoolerTypeCommon': {
    label:       'Property Set: Evaporative Cooler Type Common',
    description: 'Evaporative cooler type common attributes.;Use IfcSoundProperties instead. [[WaterRequirement]] attribute unit type modified in IFC2x2 Pset Addendum.',
    applicableTo: ['IFCEVAPORATIVECOOLER', 'IFCEVAPORATIVECOOLERDIRECTEVAPORATIVEAIRWASHER', 'IFCEVAPORATIVECOOLERDIRECTEVAPORATIVEPACKAGEDROTAR', 'IFCEVAPORATIVECOOLERDIRECTEVAPORATIVERANDOMMEDIAAI', 'IFCEVAPORATIVECOOLERDIRECTEVAPORATIVERIGIDMEDIAAIR', 'IFCEVAPORATIVECOOLERDIRECTEVAPORATIVESLINGERSPACKA', 'IFCEVAPORATIVECOOLERINDIRECTDIRECTCOMBINATION', 'IFCEVAPORATIVECOOLERINDIRECTEVAPORATIVECOOLINGTOWE', 'IFCEVAPORATIVECOOLERINDIRECTEVAPORATIVEPACKAGEAIRC', 'IFCEVAPORATIVECOOLERINDIRECTEVAPORATIVEWETCOIL'],
    props: [
      { name: 'AirPressureDropCurve', type: 'IfcTimeSeries', description: 'Air pressure drop as a function of air flow rate.' },
      { name: 'EffectivenessTable', type: 'IfcReal', description: 'Total heat transfer effectiveness curve as a function of the primary air flow rate.' },
      { name: 'FlowArrangement', type: 'IfcLabel', description: 'Air and water flow enter in different directions.;Air and water flow are perpendicular.;Air and water flow enter in same' },
      { name: 'HeatExchangeArea', type: 'IfcReal', description: 'Heat exchange area.' },
      { name: 'OperationTemperatureRange', type: 'IfcReal', description: 'Allowable operation ambient air temperature range.' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'WaterPressDropCurve', type: 'IfcReal', description: 'Water pressure drop as function of water flow rate.' },
      { name: 'WaterRequirement', type: 'IfcReal', description: 'Make-up water requirement.' },
    ],
  },

  'Pset_EvaporatorPHistory': {
    label:       'Property Set: Evaporator Phistory',
    description: 'Evaporator performance history attributes.',
    applicableTo: ['IFCEVAPORATOR', 'IFCEVAPORATORDIRECTEXPANSION', 'IFCEVAPORATORDIRECTEXPANSIONBRAZEDPLATE', 'IFCEVAPORATORDIRECTEXPANSIONSHELLANDTUBE', 'IFCEVAPORATORDIRECTEXPANSIONTUBEINTUBE', 'IFCEVAPORATORFLOODEDSHELLANDTUBE', 'IFCEVAPORATORSHELLANDCOIL'],
    props: [
      { name: 'CompressorEvaporatorHeatGain', type: 'IfcTimeSeries', description: 'Heat gain between the evaporator outlet and the compressor inlet.' },
      { name: 'CompressorEvaporatorPressureDrop', type: 'IfcTimeSeries', description: 'Pressure drop between the evaporator outlet and the compressor inlet.' },
      { name: 'EvaporatingTemperature', type: 'IfcTimeSeries', description: 'Refrigerant evaporating temperature.' },
      { name: 'EvaporatorMeanVoidFraction', type: 'IfcTimeSeries', description: 'Mean void fraction in evaporator.' },
      { name: 'ExteriorHeatTransferCoefficient', type: 'IfcTimeSeries', description: 'Exterior heat transfer coefficient associated with exterior surface area.' },
      { name: 'HeatRejectionRate', type: 'IfcTimeSeries', description: 'Sum of the refrigeration effect and the heat equivalent of the power input to the compressor.' },
      { name: 'InteriorHeatTransferCoefficient', type: 'IfcTimeSeries', description: 'Interior heat transfer coefficient associated with interior surface area.' },
      { name: 'LogarithmicMeanTemperatureDifference', type: 'IfcTimeSeries', description: 'Logarithmic mean temperature difference between refrigerant and water or air.' },
      { name: 'RefrigerantFoulingResistance', type: 'IfcTimeSeries', description: 'Fouling resistance on the refrigerant side.' },
      { name: 'UAcurves', type: 'IfcTimeSeries', description: 'UV = f (VExterior, VInterior), UV as a function of interior and exterior fluid flow velocity at the entrance.' },
      { name: 'WaterFoulingResistance', type: 'IfcTimeSeries', description: 'Fouling resistance on water/air side.' },
    ],
  },

  'Pset_EvaporatorTypeCommon': {
    label:       'Property Set: Evaporator Type Common',
    description: 'Evaporator type common attributes.',
    applicableTo: ['IFCEVAPORATOR', 'IFCEVAPORATORDIRECTEXPANSION', 'IFCEVAPORATORDIRECTEXPANSIONBRAZEDPLATE', 'IFCEVAPORATORDIRECTEXPANSIONSHELLANDTUBE', 'IFCEVAPORATORDIRECTEXPANSIONTUBEINTUBE', 'IFCEVAPORATORFLOODEDSHELLANDTUBE', 'IFCEVAPORATORSHELLANDCOIL'],
    props: [
      { name: 'EvaporatorCoolant', type: 'IfcLabel', description: 'The fluid used for the coolant in the evaporator.' },
      { name: 'EvaporatorMediumType', type: 'IfcLabel', description: 'Evaporator is using liquid type of fluid to exchange heat with refrigerant.;Evaporator is using air to exchange heat wit' },
      { name: 'ExternalSurfaceArea', type: 'IfcReal', description: 'External surface area (both primary and secondary area).' },
      { name: 'InternalRefrigerantVolume', type: 'IfcReal', description: 'Internal volume of object (refrigerant side).' },
      { name: 'InternalSurfaceArea', type: 'IfcReal', description: 'Internal surface area.' },
      { name: 'InternalWaterVolume', type: 'IfcReal', description: 'Internal volume of object (water side).' },
      { name: 'NominalHeatTransferArea', type: 'IfcReal', description: 'Nominal heat transfer surface area associated with nominal overall heat transfer coefficient.' },
      { name: 'NominalHeatTransferCoefficient', type: 'IfcReal', description: 'Nominal overall heat transfer coefficient associated with nominal heat transfer area.' },
      { name: 'RefrigerantClass', type: 'IfcLabel', description: 'Refrigerant class used by the object.;Chlorofluorocarbons.;Hydrochlorofluorocarbons.;Hydrofluorocarbons.' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_FanCentrifugal': {
    label:       'Property Set: Fan Centrifugal',
    description: 'Centrifugal fan occurrence attributes attached to an instance of [[IfcFan]].',
    applicableTo: ['IFCFANCENTRIFUGALAIRFOIL', 'IFCFANCENTRIFUGALBACKWARDINCLINEDCURVED', 'IFCFANCENTRIFUGALFORWARDCURVED', 'IFCFANCENTRIFUGALRADIAL'],
    props: [
      { name: 'DirectionOfRotation', type: 'IfcLabel', description: 'The direction of the centrifugal fan wheel rotation when viewed from the drive side of the fan.Clockwise.;Counter-clockw' },
      { name: 'DischargePosition', type: 'IfcLabel', description: 'Centrifugal fan discharge position.Top horizontal discharge.;Top angular down discharge.;Downblast discharge.;Bottom ang' },
      { name: 'FanArrangement', type: 'IfcLabel', description: 'Defines the fan and motor drive arrangement as defined by AMCA.Arrangement 1.;Arrangement 2.;Arrangement 3.;Arrangement' },
    ],
  },

  'Pset_FanOccurrence': {
    label:       'Property Set: Fan Occurrence',
    description: 'Fan occurrence attributes attached to an instance of [[IfcFan]].',
    applicableTo: ['IFCFAN', 'IFCFANCENTRIFUGALAIRFOIL', 'IFCFANCENTRIFUGALBACKWARDINCLINEDCURVED', 'IFCFANCENTRIFUGALFORWARDCURVED', 'IFCFANCENTRIFUGALRADIAL', 'IFCFANPROPELLORAXIAL', 'IFCFANTUBEAXIAL', 'IFCFANVANEAXIAL'],
    props: [
      { name: 'ApplicationOfFan', type: 'IfcLabel', description: 'The functional application of the fan.Supply air fan.;Return air fan.;Exhaust air fan.;Other type of application not def' },
      { name: 'CoilPosition', type: 'IfcLabel', description: 'Defines the relationship between a fan and a coil.Fan located downstream of the coil.;Fan located upstream of the coil.' },
      { name: 'DischargeType', type: 'IfcLabel', description: 'Defines the type of connection at the fan discharge.Discharge into ductwork.;Discharge into screen outlet.;Discharge int' },
      { name: 'FanMountingType', type: 'IfcLabel', description: 'Defines the method of mounting the fan in the building.' },
      { name: 'FractionOfMotorHeatToAirStream', type: 'IfcReal', description: 'Fraction of the motor heat released into the fluid flow.' },
      { name: 'ImpellerDiameter', type: 'IfcReal', description: 'Diameter of object - used to scale performance of geometrically similar objects.' },
      { name: 'MotorPosition', type: 'IfcLabel', description: 'Defines the location of the motor relative to the air stream.Fan motor is in the air stream.;Fan motor is out of the air' },
    ],
  },

  'Pset_FanPHistory': {
    label:       'Property Set: Fan Phistory',
    description: 'Fan performance history attributes.',
    applicableTo: ['IFCFAN', 'IFCFANCENTRIFUGALAIRFOIL', 'IFCFANCENTRIFUGALBACKWARDINCLINEDCURVED', 'IFCFANCENTRIFUGALFORWARDCURVED', 'IFCFANCENTRIFUGALRADIAL', 'IFCFANPROPELLORAXIAL', 'IFCFANTUBEAXIAL', 'IFCFANVANEAXIAL'],
    props: [
      { name: 'DischargePressureLoss', type: 'IfcTimeSeries', description: 'Fan discharge pressure loss associated with the discharge arrangement.' },
      { name: 'DischargeVelocity', type: 'IfcTimeSeries', description: 'The speed at which air discharges from the fan through the fan housing discharge opening.' },
      { name: 'DrivePowerLoss', type: 'IfcTimeSeries', description: 'Fan drive power losses associated with the type of connection between the motor and the fan wheel.' },
      { name: 'FanEfficiency', type: 'IfcTimeSeries', description: 'Fan mechanical efficiency.' },
      { name: 'FanPowerRate', type: 'IfcTimeSeries', description: 'Fan power consumption.' },
      { name: 'FanRotationSpeed', type: 'IfcTimeSeries', description: 'Fan rotation speed.' },
      { name: 'OverallEfficiency', type: 'IfcTimeSeries', description: 'Total efficiency of object.' },
      { name: 'ShaftPowerRate', type: 'IfcTimeSeries', description: 'Fan shaft power.' },
      { name: 'WheelTipSpeed', type: 'IfcTimeSeries', description: 'Fan blade tip speed, typically defined as the linear speed of the tip of the fan blade furthest from the shaft.' },
    ],
  },

  'Pset_FanTypeCommon': {
    label:       'Property Set: Fan Type Common',
    description: 'Fan type common attributes.',
    applicableTo: ['IFCFAN', 'IFCFANCENTRIFUGALAIRFOIL', 'IFCFANCENTRIFUGALBACKWARDINCLINEDCURVED', 'IFCFANCENTRIFUGALFORWARDCURVED', 'IFCFANCENTRIFUGALRADIAL', 'IFCFANPROPELLORAXIAL', 'IFCFANTUBEAXIAL', 'IFCFANVANEAXIAL'],
    props: [
      { name: 'CapacityControlType', type: 'IfcLabel', description: 'Control by adjusting inlet vane.;Control by variable speed drive.;Control by adjusting blade pitch angle.;Control by swi' },
      { name: 'EfficiencyCurve', type: 'IfcReal', description: 'Fan efficiency =f (flow rate).' },
      { name: 'MotorDriveType', type: 'IfcLabel', description: ';Direct drive.;Belt drive.;Coupling.;Other type of motor drive.;Unknown motor drive type.' },
      { name: 'NominalAirFlowRate', type: 'IfcReal', description: 'Nominal air flow rate.' },
      { name: 'NominalPowerRate', type: 'IfcReal', description: 'Nominal fan power rate.' },
      { name: 'NominalRotationSpeed', type: 'IfcReal', description: 'Rotational speed of the object under nominal conditions.' },
      { name: 'NominalStaticPressure', type: 'IfcReal', description: 'The static pressure within the air stream that the fan must overcome to insure designed circulation of air.' },
      { name: 'NominalTotalPressure', type: 'IfcReal', description: 'Nominal total pressure rise across the fan.' },
      { name: 'OperationalCriteria', type: 'IfcReal', description: 'Time of operation at maximum operational ambient air temperature.' },
      { name: 'OperationTemperatureRange', type: 'IfcReal', description: 'Allowable operation ambient air temperature range.' },
      { name: 'PressureCurve', type: 'IfcReal', description: 'Pressure rise = f (flow rate).' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_FastenerRailWeld': {
    label:       'Property Set: Fastener Rail Weld',
    description: 'Properties of Welded rail joint used in railway. The property set can be used by the predefined type [[WELD]] of [[IfcFastener]].',
    applicableTo: ['IFCFASTENERWELD'],
    props: [
      { name: 'AssemblyPlace', type: 'IfcLabel', description: 'Enumeration defining where the assembly is intended to take place, either in a factory, other offsite location or on the' },
      { name: 'IsLiftingBracket', type: 'IfcBoolean', description: 'Indicates whether the connection is done between rail with different height (TRUE) or with same height (FALSE).' },
      { name: 'JointRelativePosition', type: 'IfcLabel', description: 'Indicates the relative position of the joint, which lies in the left or right rail or in the middle, or in combination.' },
      { name: 'TemperatureDuringInstallation', type: 'IfcReal', description: 'Normalised working temperature.' },
    ],
  },

  'Pset_FastenerWeld': {
    label:       'Property Set: Fastener Weld',
    description: 'Properties related to welded connections.',
    applicableTo: ['IFCFASTENERWELD'],
    props: [
      { name: 'DeepPenetrationThroatThickness', type: 'IfcReal', description: 'Nominal throat thickness or effective throat thickness to which a certain amount of fusion penetration is added.' },
      { name: 'Intermittent', type: 'IfcBoolean', description: 'If fillet weld, intermittent or not' },
      { name: 'NominalThroatThickness', type: 'IfcReal', description: 'Design value of the height of the largest isosceles triangle that can be inscribed in the section of a fillet weld.' },
      { name: 'NumberOfWeldElements', type: 'IfcInteger', description: 'Number of weld elements.' },
      { name: 'Process', type: 'IfcInteger', description: 'Reference number of the welding process according to ISO 4063, an up to three digits long code' },
      { name: 'ProcessName', type: 'IfcLabel', description: 'Name of the welding process. Alternative to the numeric Process property.' },
      { name: 'Staggered', type: 'IfcBoolean', description: 'If intermittent weld, staggered or not' },
      { name: 'Surface1', type: 'IfcLabel', description: 'Aspect of weld seam surface, i.e. \\\'plane\\\', \\\'curved\\\' or \\\'hollow\\\'. Combined welds are given by two corresponding symbols a' },
      { name: 'Surface2', type: 'IfcLabel', description: 'See Surface1.' },
      { name: 'Type1', type: 'IfcLabel', description: 'Type of weld seam according to ISO 2553. Note, combined welds are given by two corresponding symbols in the direction of' },
      { name: 'Type2', type: 'IfcLabel', description: 'See Type1.' },
      { name: 'WeldDiameter', type: 'IfcReal', description: 'Dimension of the required hole diameter at the faying surface, or required spot weld diameter at the faying surface, or' },
      { name: 'WeldElementLength', type: 'IfcReal', description: 'Length of each weld element.' },
      { name: 'WeldElementSpacing', type: 'IfcReal', description: 'Spacing between weld elements (centre to centre)' },
      { name: 'WeldLegLength', type: 'IfcReal', description: 'Distance from the actual or projected intersection of the fusion faces and the toe of a fillet weld, measured across the' },
      { name: 'WeldWidth', type: 'IfcReal', description: 'Required elongated hole width at the faying surface or seam weld width at the faying surface.' },
    ],
  },

  'Pset_FenderCommon': {
    label:       'Property Set: Fender Common',
    description: 'Properties common to the definition of all occurrences of [[IfcImpactProtectionDevice]] and types of IfcImpactProtectionDeviceType with the predefined type set to FENDER.',
    applicableTo: ['IFCIMPACTPROTECTIONDEVICEFENDER'],
    props: [
      { name: 'CoefficientOfFriction', type: 'IfcReal', description: 'Coefficient of friction value for the fender' },
      { name: 'EnergyAbsorption', type: 'IfcReal', description: 'Energy absorption capacity of the element.' },
      { name: 'EnergyAbsorptionTolerance', type: 'IfcReal', description: 'Manufacturing tolerance on energy absorption' },
      { name: 'FenderType', type: 'IfcLabel', description: 'The type of fender' },
      { name: 'MaximumTemperatureFactor', type: 'IfcReal', description: 'Deviation in performance due to maximum design temperature' },
      { name: 'MaxReaction', type: 'IfcReal', description: 'Maximum reaction from the element' },
      { name: 'MaxReactionTolerance', type: 'IfcReal', description: 'Manufacturing tolerance on maximum reaction at fender support.' },
      { name: 'MinimumTemperatureFactor', type: 'IfcReal', description: 'Deviation in performance due to minimum design temperature' },
      { name: 'VelocityFactorEnergy', type: 'IfcReal', description: 'Deviation in energy absorption performance due to strain rate' },
      { name: 'VelocityFactorReaction', type: 'IfcReal', description: 'Deviation in reaction due to strain rate' },
    ],
  },

  'Pset_FenderDesignCriteria': {
    label:       'Property Set: Fender Design Criteria',
    description: 'Properties common to the definition of design criteria of all occurrences of [[IfcImpactProtectionDevice]] and types of IfcImpactProtectionDeviceType with the predefined type set t',
    applicableTo: ['IFCSPACEBERTH'],
    props: [
      { name: 'AddedMassCoefficientMethod', type: 'IfcLabel', description: 'Method used to determine the Added Mass Coefficient used for design' },
      { name: 'CoefficientOfFriction', type: 'IfcReal', description: 'Coefficient of friction value for the fender' },
      { name: 'EnergyAbsorption', type: 'IfcReal', description: 'Energy absorption capacity of the element.' },
      { name: 'EnergyAbsorptionTolerance', type: 'IfcReal', description: 'Manufacturing tolerance on energy absorption' },
      { name: 'MaximumTemperatureFactor', type: 'IfcReal', description: 'Deviation in performance due to maximum design temperature' },
      { name: 'MaxReaction', type: 'IfcReal', description: 'Maximum reaction from the element' },
      { name: 'MaxReactionTolerance', type: 'IfcReal', description: 'Manufacturing tolerance on maximum reaction at fender support.' },
      { name: 'MinCompressedFenderHeight', type: 'IfcReal', description: 'Minimum height required for a compressed fender to prevent vessels striking the structure' },
      { name: 'MinimumTemperatureFactor', type: 'IfcReal', description: 'Deviation in performance due to minimum design temperature' },
      { name: 'VelocityFactorEnergy', type: 'IfcReal', description: 'Deviation in energy absorption performance due to strain rate' },
      { name: 'VelocityFactorReaction', type: 'IfcReal', description: 'Deviation in reaction due to strain rate' },
    ],
  },

  'Pset_FilterPHistory': {
    label:       'Property Set: Filter Phistory',
    description: 'Filter performance history attributes.',
    applicableTo: ['IFCFILTER', 'IFCFILTERAIRPARTICLEFILTER', 'IFCFILTERCOMPRESSEDAIRFILTER', 'IFCFILTERODORFILTER', 'IFCFILTEROILFILTER', 'IFCFILTERSTRAINER', 'IFCFILTERWATERFILTER'],
    props: [
      { name: 'CountedEfficiency', type: 'IfcTimeSeries', description: 'Filter efficiency based the particle counts concentration before and after filter against particles with certain size di' },
      { name: 'ParticleMassHolding', type: 'IfcTimeSeries', description: 'Mass of particle holding in the filter.' },
      { name: 'WeightedEfficiency', type: 'IfcTimeSeries', description: 'Filter efficiency based the particle weight concentration before and after filter against particles with certain size di' },
    ],
  },

  'Pset_FilterTypeAirParticleFilter': {
    label:       'Property Set: Filter Type Air Particle Filter',
    description: 'Air particle filter type attributes.',
    applicableTo: ['IFCFILTERAIRPARTICLEFILTER'],
    props: [
      { name: 'AirParticleFilterType', type: 'IfcLabel', description: 'A panel dry type extended surface filter is a dry-type air filter with random fiber mats or blankets in the forms of poc' },
      { name: 'CountedEfficiencyCurve', type: 'IfcReal', description: 'Counted efficiency curve as a function of dust holding weight, efficiency = f (dust holding weight).' },
      { name: 'DustHoldingCapacity', type: 'IfcReal', description: 'Maximum filter dust holding capacity.' },
      { name: 'FaceSurfaceArea', type: 'IfcReal', description: 'Face area of filter frame.' },
      { name: 'FrameMaterial', type: 'IfcTimeSeries', description: 'Filter frame material.' },
      { name: 'MediaExtendedArea', type: 'IfcReal', description: 'Total extended media area.' },
      { name: 'NominalCountedEfficiency', type: 'IfcReal', description: 'Nominal filter efficiency based the particle count concentration before and after the filter against particles with a ce' },
      { name: 'NominalWeightedEfficiency', type: 'IfcReal', description: 'Nominal filter efficiency based the particle weight concentration before and after the filter against particles with a c' },
      { name: 'PressureDropCurve', type: 'IfcReal', description: 'Under certain dust holding weight, DelPressure = f (fluidflowRate)' },
      { name: 'SeparationType', type: 'IfcLabel', description: 'Air particulate filter media separation type.' },
      { name: 'WeightedEfficiencyCurve', type: 'IfcReal', description: 'Weighted efficiency curve as a function of dust holding weight, efficiency = f (dust holding weight).' },
    ],
  },

  'Pset_FilterTypeCommon': {
    label:       'Property Set: Filter Type Common',
    description: 'Filter type common attributes.',
    applicableTo: ['IFCFILTER', 'IFCFILTERAIRPARTICLEFILTER', 'IFCFILTERCOMPRESSEDAIRFILTER', 'IFCFILTERODORFILTER', 'IFCFILTEROILFILTER', 'IFCFILTERSTRAINER', 'IFCFILTERWATERFILTER'],
    props: [
      { name: 'FinalResistance', type: 'IfcReal', description: 'Filter fluid resistance when replacement is required (i.e., Pressure drop at the maximum air flowrate across the filter' },
      { name: 'FlowRateRange', type: 'IfcReal', description: 'Allowable range of volume of fluid being pumped against the resistance specified.' },
      { name: 'InitialResistance', type: 'IfcReal', description: 'Initial new filter fluid resistance (i.e., pressure drop at the maximum air flowrate across the filter when the filter i' },
      { name: 'NominalFilterFaceVelocity', type: 'IfcReal', description: 'Filter face velocity.' },
      { name: 'NominalFlowrate', type: 'IfcReal', description: 'Nominal fluid flow rate through the filter.' },
      { name: 'NominalMediaSurfaceVelocity', type: 'IfcReal', description: 'Average fluid velocity at the media surface.' },
      { name: 'NominalParticleGeometricMeanDiameter', type: 'IfcReal', description: 'Particle geometric mean diameter associated with nominal efficiency.' },
      { name: 'NominalParticleGeometricStandardDeviation', type: 'IfcReal', description: 'Particle geometric standard deviation associated with nominal efficiency.' },
      { name: 'NominalPressureDrop', type: 'IfcReal', description: 'Total pressure drop across the filter.' },
      { name: 'OperationTemperatureRange', type: 'IfcReal', description: 'Allowable operation ambient air temperature range.' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'Weight', type: 'IfcReal', description: 'Total weight of object' },
    ],
  },

  'Pset_FilterTypeCompressedAirFilter': {
    label:       'Property Set: Filter Type Compressed Air Filter',
    description: 'Compressed air filter type attributes.',
    applicableTo: ['IFCFILTERCOMPRESSEDAIRFILTER'],
    props: [
      { name: 'AutomaticCondensateDischarge', type: 'IfcBoolean', description: 'Whether or not the condensing water or oil is discharged automatically from the filter.' },
      { name: 'CloggingIndicator', type: 'IfcBoolean', description: 'Whether the filter has an indicator to display the degree of clogging of the filter.' },
      { name: 'CompressedAirFilterType', type: 'IfcLabel', description: 'absorbs oil vapor and odor;used to absorb solid particles of medium size;used to absorb fine solid, oil, and water parti' },
      { name: 'OperationPressureMax', type: 'IfcReal', description: 'Maximum pressure under normal operating conditions.' },
      { name: 'ParticleAbsorptionCurve', type: 'IfcReal', description: 'Ratio of particles that are removed by the filter. Each entry describes the ratio of particles absorbed greater than equ' },
    ],
  },

  'Pset_FilterTypeWaterFilter': {
    label:       'Property Set: Filter Type Water Filter',
    description: '[[Water]] filter type attributes.',
    applicableTo: ['IFCFILTERWATERFILTER'],
    props: [
      { name: 'WaterFilterType', type: 'IfcLabel', description: 'Further qualifies the type of water filter. Filtration removes undissolved matter; Purification removes dissolved matter' },
    ],
  },

  'Pset_FireSuppressionTerminalTypeBreechingInlet': {
    label:       'Property Set: Fire Suppression Terminal Type Breeching Inlet',
    description: 'Symmetrical pipe fitting that unites two or more inlets into a single pipe (BS6100 330 114 adapted).',
    applicableTo: ['IFCFIRESUPPRESSIONTERMINALBREECHINGINLET'],
    props: [
      { name: 'BreechingInletType', type: 'IfcLabel', description: 'Defines the type of breeching inlet.' },
      { name: 'CouplingType', type: 'IfcLabel', description: 'Defines the type coupling on the inlet of the breeching inlet.' },
      { name: 'HasCaps', type: 'IfcBoolean', description: 'Does the inlet connection have protective caps.' },
      { name: 'InletDiameter', type: 'IfcReal', description: 'The inlet diameter of the breeching inlet.' },
      { name: 'OutletDiameter', type: 'IfcReal', description: 'The outlet diameter of the breeching inlet.' },
    ],
  },

  'Pset_FireSuppressionTerminalTypeCommon': {
    label:       'Property Set: Fire Suppression Terminal Type Common',
    description: 'Common properties for fire suppression terminals.',
    applicableTo: ['IFCFIRESUPPRESSIONTERMINAL', 'IFCFIRESUPPRESSIONTERMINALBREECHINGINLET', 'IFCFIRESUPPRESSIONTERMINALFIREHYDRANT', 'IFCFIRESUPPRESSIONTERMINALFIREMONITOR', 'IFCFIRESUPPRESSIONTERMINALHOSEREEL', 'IFCFIRESUPPRESSIONTERMINALSPRINKLER', 'IFCFIRESUPPRESSIONTERMINALSPRINKLERDEFLECTOR'],
    props: [
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_FireSuppressionTerminalTypeFireHydrant': {
    label:       'Property Set: Fire Suppression Terminal Type Fire Hydrant',
    description: 'Device, fitted to a pipe, through which a temporary supply of water may be provided (BS6100 330 6107)',
    applicableTo: ['IFCFIRESUPPRESSIONTERMINALFIREHYDRANT'],
    props: [
      { name: 'BodyColour', type: 'IfcLabel', description: 'Colour of the body of the hydrant.Consult local fire regulations for statutory colours that may be required for hydrant' },
      { name: 'CapColour', type: 'IfcLabel', description: 'Colour of the caps of the hydrant.Consult local fire regulations for statutory colours that may be required for hydrant' },
      { name: 'DischargeFlowRate', type: 'IfcReal', description: 'The volumetric rate of fluid discharge.' },
      { name: 'FireHydrantType', type: 'IfcLabel', description: 'Defines the range of hydrant types from which the required type can be selected where. A hydrant that has isolating valv' },
      { name: 'FlowClass', type: 'IfcLabel', description: 'Alphanumeric indication of the flow class of a hydrant (may be used in connection with or instead of the FlowRate proper' },
      { name: 'HoseConnectionSize', type: 'IfcReal', description: 'The size of connections to which a hose may be connected (other than that to be linked to a pumping unit).' },
      { name: 'NumberOfHoseConnections', type: 'IfcInteger', description: 'The number of hose connections on the hydrant (excluding the pumper connection).' },
      { name: 'PressureRating', type: 'IfcReal', description: 'Pressure rating of the object.' },
      { name: 'PumperConnectionSize', type: 'IfcReal', description: 'The size of a connection to which a fire hose may be connected that is then linked to a pumping unit.' },
      { name: 'WaterIsPotable', type: 'IfcBoolean', description: 'Indication of whether the water flow from the hydrant is potable (set TRUE) or non potable (set FALSE).' },
    ],
  },

  'Pset_FireSuppressionTerminalTypeHoseReel': {
    label:       'Property Set: Fire Suppression Terminal Type Hose Reel',
    description: 'A supporting framework on which a hose may be wound (BS6100 155 8201).',
    applicableTo: ['IFCFIRESUPPRESSIONTERMINALHOSEREEL'],
    props: [
      { name: 'ClassificationAuthority', type: 'IfcLabel', description: 'The name of the authority that applies the classification of service to the hose reel (e.g. NFPA/FEMA).' },
      { name: 'ClassOfService', type: 'IfcLabel', description: 'A classification of usage of the hose reel that may be applied.' },
      { name: 'HoseDiameter', type: 'IfcReal', description: 'Notional diameter (bore) of the hose.' },
      { name: 'HoseLength', type: 'IfcReal', description: 'Notional length of the hose fitted to the hose reel when fully extended.' },
      { name: 'HoseNozzleType', type: 'IfcLabel', description: 'Identifies the predefined types of nozzle (in terms of spray pattern) fitted to the end of the hose from which the type' },
      { name: 'HoseReelMountingType', type: 'IfcLabel', description: 'Identifies the predefined types of hose reel mounting from which the type required may be set.' },
      { name: 'HoseReelType', type: 'IfcLabel', description: 'Identifies the predefined types of hose arrangement from which the type required may be set.' },
      { name: 'InletConnectionSize', type: 'IfcReal', description: 'Size of the inlet connection.; Note that all inlet connections are assumed to be the same size.' },
    ],
  },

  'Pset_FireSuppressionTerminalTypeSprinkler': {
    label:       'Property Set: Fire Suppression Terminal Type Sprinkler',
    description: 'Device for sprinkling water from a pipe under pressure over an area (BS6100 100 3432)',
    applicableTo: ['IFCFIRESUPPRESSIONTERMINALSPRINKLER'],
    props: [
      { name: 'Activation', type: 'IfcLabel', description: 'Identifies the predefined methods of sprinkler activation from which that required may be set.' },
      { name: 'ActivationTemperature', type: 'IfcReal', description: 'The temperature at which the object is designed to activate.' },
      { name: 'BulbLiquidColour', type: 'IfcLabel', description: 'The colour of the liquid in the bulb for a bulb activated sprinkler. Note that the liquid colour varies according to the' },
      { name: 'ConnectionSize', type: 'IfcReal', description: 'The connection size of the object.' },
      { name: 'CoverageArea', type: 'IfcReal', description: 'The area that is covered by the object.' },
      { name: 'DischargeCoefficient', type: 'IfcReal', description: 'The coefficient of flow at the sprinkler.' },
      { name: 'DischargeFlowRate', type: 'IfcReal', description: 'The volumetric rate of fluid discharge.' },
      { name: 'HasDeflector', type: 'IfcBoolean', description: 'Indication of whether the sprinkler has a deflector (baffle) fitted to diffuse the discharge on activation (= TRUE) or n' },
      { name: 'MaximumWorkingPressure', type: 'IfcReal', description: 'Maximum pressure that the object is manufactured to withstand.' },
      { name: 'ResidualFlowingPressure', type: 'IfcReal', description: 'The residual flowing pressure in the pipeline at which the discharge flow rate is determined.' },
      { name: 'Response', type: 'IfcLabel', description: 'Identifies the predefined methods of sprinkler response from which that required may be set.' },
      { name: 'SprinklerType', type: 'IfcLabel', description: 'Identifies the predefined types of sprinkler from which the type required may be set.' },
    ],
  },

  'Pset_FittingBend': {
    label:       'Property Set: Fitting Bend',
    description: 'Properties about the bend angles.',
    applicableTo: ['IFCCABLECARRIERFITTINGBEND', 'IFCDUCTFITTINGBEND', 'IFCPIPEFITTINGBEND'],
    props: [
      { name: 'BendAngle', type: 'IfcReal', description: 'The change of direction of flow.' },
      { name: 'BendRadius', type: 'IfcReal', description: 'The radius of bending if circular arc or zero if sharp bend.' },
    ],
  },

  'Pset_FittingJunction': {
    label:       'Property Set: Fitting Junction',
    description: 'Properties about Fitting Junction.',
    applicableTo: ['IFCCABLECARRIERFITTINGJUNCTION', 'IFCCABLEFITTINGJUNCTION', 'IFCDUCTFITTINGJUNCTION', 'IFCPIPEFITTINGJUNCTION'],
    props: [
      { name: 'JunctionLeftAngle', type: 'IfcReal', description: 'The change of direction of flow for the left junction.' },
      { name: 'JunctionLeftRadius', type: 'IfcReal', description: 'The radius of bending for the left junction.' },
      { name: 'JunctionRightAngle', type: 'IfcReal', description: 'The change of direction of flow for the right junction where 0 indicates straight segment.' },
      { name: 'JunctionRightRadius', type: 'IfcReal', description: 'The radius of bending for the right junction where 0 indicates sharp bend.' },
      { name: 'JunctionType', type: 'IfcLabel', description: 'The type of junction. TEE=3 ports, CROSS = 4 ports.' },
    ],
  },

  'Pset_FittingTransition': {
    label:       'Property Set: Fitting Transition',
    description: 'Properties about Fitting Transition.',
    applicableTo: ['IFCCABLECARRIERFITTINGTRANSITION', 'IFCCABLEFITTINGTRANSITION', 'IFCDUCTFITTINGTRANSITION', 'IFCPIPEFITTINGTRANSITION'],
    props: [
      { name: 'EccentricityInY', type: 'IfcReal', description: 'Distance in y direction between the two points (or vertex points) engaged in the point connection.' },
      { name: 'EccentricityInZ', type: 'IfcReal', description: 'Distance in z direction between the two points (or vertex points) engaged in the point connection.' },
      { name: 'NominalLength', type: 'IfcReal', description: 'The nominal overall length of the object. The size information is provided in addition to the shape representation and t' },
    ],
  },

  'Pset_FlowInstrumentPHistory': {
    label:       'Property Set: Flow Instrument Phistory',
    description: 'Properties for history of flow instrument values.',
    applicableTo: ['IFCFLOWINSTRUMENT', 'IFCFLOWINSTRUMENTAMMETER', 'IFCFLOWINSTRUMENTCOMBINED', 'IFCFLOWINSTRUMENTFREQUENCYMETER', 'IFCFLOWINSTRUMENTPHASEANGLEMETER', 'IFCFLOWINSTRUMENTPOWERFACTORMETER', 'IFCFLOWINSTRUMENTPRESSUREGAUGE', 'IFCFLOWINSTRUMENTTHERMOMETER', 'IFCFLOWINSTRUMENTVOLTMETER', 'IFCFLOWINSTRUMENTVOLTMETER_PEAK', 'IFCFLOWINSTRUMENTVOLTMETER_RMS'],
    props: [
      { name: 'Quality', type: 'IfcTimeSeries', description: 'Indicates the quality of measurement or failure condition, which may be further qualified by the Status.measured values' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'Value', type: 'IfcTimeSeries', description: 'The expected range and default value.' },
    ],
  },

  'Pset_FlowInstrumentTypeCommon': {
    label:       'Property Set: Flow Instrument Type Common',
    description: 'Flow Instrument type common attributes.',
    applicableTo: ['IFCFLOWINSTRUMENT', 'IFCFLOWINSTRUMENTAMMETER', 'IFCFLOWINSTRUMENTCOMBINED', 'IFCFLOWINSTRUMENTFREQUENCYMETER', 'IFCFLOWINSTRUMENTPHASEANGLEMETER', 'IFCFLOWINSTRUMENTPOWERFACTORMETER', 'IFCFLOWINSTRUMENTPRESSUREGAUGE', 'IFCFLOWINSTRUMENTTHERMOMETER', 'IFCFLOWINSTRUMENTVOLTMETER', 'IFCFLOWINSTRUMENTVOLTMETER_PEAK', 'IFCFLOWINSTRUMENTVOLTMETER_RMS'],
    props: [
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_FlowInstrumentTypePressureGauge': {
    label:       'Property Set: Flow Instrument Type Pressure Gauge',
    description: 'A device that reads and displays a pressure value at a point or the pressure difference between two points.',
    applicableTo: ['IFCFLOWINSTRUMENTPRESSUREGAUGE'],
    props: [
      { name: 'DisplaySize', type: 'IfcReal', description: 'The physical size of the display.' },
      { name: 'PressureGaugeType', type: 'IfcLabel', description: 'Identifies the means by which pressure is displayed.' },
    ],
  },

  'Pset_FlowInstrumentTypeThermometer': {
    label:       'Property Set: Flow Instrument Type Thermometer',
    description: 'A device that reads and displays a temperature value at a point.',
    applicableTo: ['IFCFLOWINSTRUMENTTHERMOMETER'],
    props: [
      { name: 'DisplaySize', type: 'IfcReal', description: 'The physical size of the display.' },
      { name: 'ThermometerType', type: 'IfcLabel', description: 'Identifies the means by which temperature is displayed.' },
    ],
  },

  'Pset_FlowMeterOccurrence': {
    label:       'Property Set: Flow Meter Occurrence',
    description: 'Flow meter occurrence common attributes.',
    applicableTo: ['IFCFLOWMETER', 'IFCFLOWMETERENERGYMETER', 'IFCFLOWMETERGASMETER', 'IFCFLOWMETEROILMETER', 'IFCFLOWMETERWATERMETER'],
    props: [
      { name: 'FlowMeterOurpose', type: 'IfcLabel', description: 'Enumeration defining the purpose of the flow meter occurrence.' },
    ],
  },

  'Pset_FlowMeterTypeCommon': {
    label:       'Property Set: Flow Meter Type Common',
    description: 'Common attributes of a flow meter type',
    applicableTo: ['IFCFLOWMETER', 'IFCFLOWMETERENERGYMETER', 'IFCFLOWMETERGASMETER', 'IFCFLOWMETEROILMETER', 'IFCFLOWMETERWATERMETER'],
    props: [
      { name: 'ReadOutType', type: 'IfcLabel', description: 'Indication of the form that readout from the meter takes. In the case of a dial read out, this may comprise multiple dia' },
      { name: 'RemoteReading', type: 'IfcBoolean', description: 'Indicates whether the meter has a connection for remote reading through connection of a communication device (set TRUE)' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_FlowMeterTypeEnergyMeter': {
    label:       'Property Set: Flow Meter Type Energy Meter',
    description: 'Device that measures, indicates and sometimes records, the energy usage in a system.',
    applicableTo: ['IFCFLOWMETERENERGYMETER'],
    props: [
      { name: 'MaximumCurrent', type: 'IfcReal', description: 'The maximum allowed current that a device is certified to handle.' },
      { name: 'MultipleTarriff', type: 'IfcBoolean', description: 'Indicates whether meter has built-in support for multiple tarriffs (variable energy cost rates).' },
      { name: 'NominalCurrent', type: 'IfcReal', description: 'The nominal current that is designed to be measured.' },
    ],
  },

  'Pset_FlowMeterTypeGasMeter': {
    label:       'Property Set: Flow Meter Type Gas Meter',
    description: 'Device that measures, indicates and sometimes records, the volume of gas that passes through it without interrupting the flow.',
    applicableTo: ['IFCFLOWMETERGASMETER'],
    props: [
      { name: 'ConnectionSize', type: 'IfcReal', description: 'The connection size of the object.' },
      { name: 'GasType', type: 'IfcLabel', description: 'Defines the types of gas that may be specified.' },
      { name: 'MaximumFlowRate', type: 'IfcReal', description: 'Maximum rate of flow which the meter is expected to pass.' },
      { name: 'MaximumPressureLoss', type: 'IfcReal', description: 'Pressure loss expected across the meter under conditions of maximum flow.' },
    ],
  },

  'Pset_FlowMeterTypeOilMeter': {
    label:       'Property Set: Flow Meter Type Oil Meter',
    description: 'Device that measures, indicates and sometimes records, the volume of oil that passes through it without interrupting the flow.',
    applicableTo: ['IFCFLOWMETEROILMETER'],
    props: [
      { name: 'ConnectionSize', type: 'IfcReal', description: 'The connection size of the object.' },
      { name: 'MaximumFlowRate', type: 'IfcReal', description: 'Maximum rate of flow which the meter is expected to pass.' },
    ],
  },

  'Pset_FlowMeterTypeWaterMeter': {
    label:       'Property Set: Flow Meter Type Water Meter',
    description: 'Device that measures, indicates and sometimes records, the volume of water that passes through it without interrupting the flow.',
    applicableTo: ['IFCFLOWMETERWATERMETER'],
    props: [
      { name: 'BackflowPreventerType', type: 'IfcLabel', description: 'Identifies the type of backflow preventer installed to prevent the backflow of contaminated or polluted water from an ir' },
      { name: 'ConnectionSize', type: 'IfcReal', description: 'The connection size of the object.' },
      { name: 'MaximumFlowRate', type: 'IfcReal', description: 'Maximum rate of flow which the meter is expected to pass.' },
      { name: 'MaximumPressureLoss', type: 'IfcReal', description: 'Pressure loss expected across the meter under conditions of maximum flow.' },
      { name: 'Type', type: 'IfcLabel', description: 'Defines the allowed values for selection of the flow meter operation type.' },
    ],
  },

  'Pset_FootingCommon': {
    label:       'Property Set: Footing Common',
    description: 'Properties common to the definition of all occurrences of [[IfcFooting]].',
    applicableTo: ['IFCFOOTING', 'IFCFOOTINGCAISSON_FOUNDATION', 'IFCFOOTINGFOOTING_BEAM', 'IFCFOOTINGPAD_FOOTING', 'IFCFOOTINGPILE_CAP', 'IFCFOOTINGSTRIP_FOOTING'],
    props: [
      { name: 'LoadBearing', type: 'IfcBoolean', description: 'Indicates whether the object is intended to carry loads (TRUE) or not (FALSE).' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_FootingTypePadFooting': {
    label:       'Property Set: Footing Type Pad Footing',
    description: 'Properties of footing. The property set can be used by the predefined type PAD_FOOTING of [[IfcFooting]].',
    applicableTo: ['IFCFOOTINGPAD_FOOTING'],
    props: [
      { name: 'IsReinforced', type: 'IfcBoolean', description: 'Indicates whether the foundation is reinforced (TRUE) or not (FALSE).' },
      { name: 'LoadBearingCapacity', type: 'IfcReal', description: 'Maximum load bearing capacity of the floor structure throughtout the storey as designed.' },
    ],
  },

  'Pset_FurnitureTypeChair': {
    label:       'Property Set: Furniture Type Chair',
    description: 'A set of specific properties for furniture type chair.',
    applicableTo: ['IFCFURNITURECHAIR'],
    props: [
      { name: 'HighestSeatingHeight', type: 'IfcReal', description: 'The value of seating height of high level if the chair height is adjustable.' },
      { name: 'LowestSeatingHeight', type: 'IfcReal', description: 'The value of seating height of low level if the chair height is adjustable.' },
      { name: 'SeatingHeight', type: 'IfcReal', description: 'The value of seating height if the chair height is not adjustable.' },
    ],
  },

  'Pset_FurnitureTypeCommon': {
    label:       'Property Set: Furniture Type Common',
    description: 'Common properties for all types of furniture such as chair, desk, table, and file cabinet.',
    applicableTo: ['IFCFURNITURE', 'IFCFURNITUREBED', 'IFCFURNITURECHAIR', 'IFCFURNITUREDESK', 'IFCFURNITUREFILECABINET', 'IFCFURNITURESHELF', 'IFCFURNITURESOFA', 'IFCFURNITURETABLE', 'IFCFURNITURETECHNICALCABINET'],
    props: [
      { name: 'IsBuiltIn', type: 'IfcBoolean', description: 'Indicates whether the furniture type is intended to be \\\'built in\\\' i.e. physically attached to a building or facility (=' },
      { name: 'MainColour', type: 'IfcLabel', description: 'The main colour of the furniture of this type.' },
      { name: 'NominalDepth', type: 'IfcReal', description: 'Nominal Depth of the object' },
      { name: 'NominalHeight', type: 'IfcReal', description: 'The nominal height of the object. The size information is provided in addition to the shape representation and the geome' },
      { name: 'NominalLength', type: 'IfcReal', description: 'The nominal overall length of the object. The size information is provided in addition to the shape representation and t' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'Style', type: 'IfcLabel', description: 'Description of the furniture style.' },
    ],
  },

  'Pset_FurnitureTypeDesk': {
    label:       'Property Set: Furniture Type Desk',
    description: 'A set of specific properties for furniture type desk.',
    applicableTo: ['IFCFURNITUREDESK'],
    props: [
      { name: 'WorksurfaceArea', type: 'IfcReal', description: 'The value of the work surface area of the desk.' },
    ],
  },

  'Pset_FurnitureTypeFileCabinet': {
    label:       'Property Set: Furniture Type File Cabinet',
    description: 'A set of specific properties for furniture type file cabinet',
    applicableTo: ['IFCFURNITUREFILECABINET'],
    props: [
      { name: 'WithLock', type: 'IfcBoolean', description: 'Indicates whether the file cabinet is lockable (= TRUE) or not (= FALSE).' },
    ],
  },

  'Pset_FurnitureTypeTable': {
    label:       'Property Set: Furniture Type Table',
    description: '',
    applicableTo: ['IFCFURNITURETABLE'],
    props: [
      { name: 'NumberOfChairs', type: 'IfcInteger', description: 'Maximum number of chairs that can fit with the table for normal use.' },
      { name: 'WorksurfaceArea', type: 'IfcReal', description: 'The value of the work surface area of the desk.' },
    ],
  },

  'Pset_GateHeadCommon': {
    label:       'Property Set: Gate Head Common',
    description: 'Properties common to the definition of all occurrences of [[IfcMarinePart]] with the predefined type set to GATEHEAD.',
    applicableTo: ['IFCMARINEPARTGATEHEAD'],
    props: [
      { name: 'StructuralType', type: 'IfcLabel', description: 'Structural type of the object' },
    ],
  },

  'Pset_GeotechnicalAssemblyCommon': {
    label:       'Property Set: Geotechnical Assembly Common',
    description: 'Properties describing the characteristics of any geotechnical model. A [[Status]] of \\\'New\\\' should not be associated to a [[IfcGeotechnicalAssembly]] or [[IfcGeotechnicalStratum]]',
    applicableTo: ['IFCBOREHOLE', 'IFCGEOMODEL', 'IFCGEOSLICE', 'IFCGEOTECHNICALASSEMBLY'],
    props: [
      { name: 'BoreHolePurpose', type: 'IfcLabel', description: 'Purpose for which the borehole, section or volumetric model was created. (EU Inspire, boreholeML)' },
      { name: 'Limitations', type: 'IfcLabel', description: 'Limitations on usage.' },
      { name: 'Methodology', type: 'IfcLabel', description: 'Methodology used to prepare the contents of the geotechnical assembly.' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_GeotechnicalStratumCommon': {
    label:       'Property Set: Geotechnical Stratum Common',
    description: 'Properties describing the characteristics of any solid, water or void stratum. A status of \\\'New\\\' should not be associated to a [[IfcGeotechnicalAssembly]] or IfcSolidStratum, as',
    applicableTo: ['IFCGEOTECHNICALSTRATUM', 'IFCGEOTECHNICALSTRATUMSOLID', 'IFCGEOTECHNICALSTRATUMVOID', 'IFCGEOTECHNICALSTRATUMWATER'],
    props: [
      { name: 'IsTopographic', type: 'IfcValue', description: 'Is the stratum ever topmost and so a visible topographic feature' },
      { name: 'PiezometricHead', type: 'IfcReal', description: 'Pressure head of water content.' },
      { name: 'PiezometricPressure', type: 'IfcReal', description: 'Pressure of water content.' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'StratumColour', type: 'IfcLabel', description: 'Stratum colour' },
      { name: 'Texture', type: 'IfcLabel', description: 'Stratum texture' },
    ],
  },

  'Pset_HeatExchangerTypeCommon': {
    label:       'Property Set: Heat Exchanger Type Common',
    description: '[[Heat]] exchanger type common attributes.',
    applicableTo: ['IFCHEATEXCHANGER', 'IFCHEATEXCHANGERPLATE', 'IFCHEATEXCHANGERSHELLANDTUBE', 'IFCHEATEXCHANGERTURNOUTHEATING'],
    props: [
      { name: 'FlowArrangement', type: 'IfcLabel', description: 'Air and water flow enter in different directions.;Air and water flow are perpendicular.;Air and water flow enter in same' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_HeatExchangerTypePlate': {
    label:       'Property Set: Heat Exchanger Type Plate',
    description: 'Plate heat exchanger type common attributes.',
    applicableTo: ['IFCHEATEXCHANGERPLATE'],
    props: [
      { name: 'NumberOfPlates', type: 'IfcInteger', description: 'Number of plates used by the plate heat exchanger.' },
    ],
  },

  'Pset_HumidifierPHistory': {
    label:       'Property Set: Humidifier Phistory',
    description: 'Humidifier performance history attributes.;Use IfcSoundProperties instead.',
    applicableTo: ['IFCHUMIDIFIER', 'IFCHUMIDIFIERADIABATICAIRWASHER', 'IFCHUMIDIFIERADIABATICATOMIZING', 'IFCHUMIDIFIERADIABATICCOMPRESSEDAIRNOZZLE', 'IFCHUMIDIFIERADIABATICPAN', 'IFCHUMIDIFIERADIABATICRIGIDMEDIA', 'IFCHUMIDIFIERADIABATICULTRASONIC', 'IFCHUMIDIFIERADIABATICWETTEDELEMENT', 'IFCHUMIDIFIERASSISTEDBUTANE', 'IFCHUMIDIFIERASSISTEDELECTRIC', 'IFCHUMIDIFIERASSISTEDNATURALGAS', 'IFCHUMIDIFIERASSISTEDPROPANE', 'IFCHUMIDIFIERASSISTEDSTEAM', 'IFCHUMIDIFIERSTEAMINJECTION'],
    props: [
      { name: 'AtmosphericPressure', type: 'IfcTimeSeries', description: 'Ambient atmospheric pressure.' },
      { name: 'SaturationEfficiency', type: 'IfcTimeSeries', description: 'Ratio of leaving air absolute humidity to the maximum absolute humidity.' },
    ],
  },

  'Pset_HumidifierTypeCommon': {
    label:       'Property Set: Humidifier Type Common',
    description: 'Humidifier type common attributes.; WaterProperties attribute renamed to [[WaterRequirement]] and unit type modified in IFC2x2 Pset Addendum.',
    applicableTo: ['IFCHUMIDIFIER', 'IFCHUMIDIFIERADIABATICAIRWASHER', 'IFCHUMIDIFIERADIABATICATOMIZING', 'IFCHUMIDIFIERADIABATICCOMPRESSEDAIRNOZZLE', 'IFCHUMIDIFIERADIABATICPAN', 'IFCHUMIDIFIERADIABATICRIGIDMEDIA', 'IFCHUMIDIFIERADIABATICULTRASONIC', 'IFCHUMIDIFIERADIABATICWETTEDELEMENT', 'IFCHUMIDIFIERASSISTEDBUTANE', 'IFCHUMIDIFIERASSISTEDELECTRIC', 'IFCHUMIDIFIERASSISTEDNATURALGAS', 'IFCHUMIDIFIERASSISTEDPROPANE', 'IFCHUMIDIFIERASSISTEDSTEAM', 'IFCHUMIDIFIERSTEAMINJECTION'],
    props: [
      { name: 'AirPressureDropCurve', type: 'IfcTimeSeries', description: 'Air pressure drop as a function of air flow rate.' },
      { name: 'HumidifierApplication', type: 'IfcLabel', description: 'Humidifier application.Humidifier installed in a ducted flow distribution system.;Humidifier is not installed in a ducte' },
      { name: 'InternalControl', type: 'IfcLabel', description: 'Internal modulation control.' },
      { name: 'NominalAirFlowRate', type: 'IfcReal', description: 'Nominal air flow rate.' },
      { name: 'NominalMoistureGain', type: 'IfcReal', description: 'Nominal rate of water vapor added into the airstream.' },
      { name: 'SaturationEfficiencyCurve', type: 'IfcReal', description: 'Saturation efficiency as a function of the air flow rate.' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'WaterRequirement', type: 'IfcReal', description: 'Make-up water requirement.' },
      { name: 'Weight', type: 'IfcReal', description: 'Total weight of object' },
    ],
  },

  'Pset_ImpactProtectionDeviceOccurrenceBumper': {
    label:       'Property Set: Impact Protection Device Occurrence Bumper',
    description: 'Properties common to all occurrences of [[IfcImpactProtectionDevice]] with PredefinedType set to BUMPER.',
    applicableTo: ['IFCIMPACTPROTECTIONDEVICEBUMPER'],
    props: [
      { name: 'BrakingLength', type: 'IfcReal', description: 'Length of the braking distance as a design parameter of the bumper occurrence.' },
      { name: 'BumperOrientation', type: 'IfcLabel', description: 'Direction in which the bumper is aligned, e.g. same direction as increasing stationing values or opposite.' },
      { name: 'IsRemovableBumper', type: 'IfcBoolean', description: 'Indicates if the bumper is removable or not.' },
    ],
  },

  'Pset_ImpactProtectionDeviceTypeBumper': {
    label:       'Property Set: Impact Protection Device Type Bumper',
    description: 'Properties common to all occurrences and types of [[IfcImpactProtectionDevice]] with PredefinedType set to BUMPER.',
    applicableTo: ['IFCIMPACTPROTECTIONDEVICEBUMPER'],
    props: [
      { name: 'EnergyAbsorption', type: 'IfcReal', description: 'Energy absorption capacity of the element.' },
      { name: 'IsAbsorbingEnergy', type: 'IfcBoolean', description: 'Indicates whether the bumper absorbs energy or not.' },
      { name: 'MaximumLoadRetention', type: 'IfcReal', description: 'Maximum possible impact load retention.' },
    ],
  },

  'Pset_InstallationOccurrence': {
    label:       'Property Set: Installation Occurrence',
    description: 'Properties defining installation information for occurrences of element, asset or system.',
    applicableTo: ['*'],
    props: [
      { name: 'AcceptanceDate', type: 'IfcLabel', description: 'Date on which the element is accepted by the manager or administrator.' },
      { name: 'InstallationDate', type: 'IfcLabel', description: 'Date on which the element is installed.' },
      { name: 'PutIntoOperationDate', type: 'IfcLabel', description: 'Date on which the element is put into operation.' },
    ],
  },

  'Pset_InterceptorTypeCommon': {
    label:       'Property Set: Interceptor Type Common',
    description: 'Common properties for interceptors.',
    applicableTo: ['IFCINTERCEPTOR', 'IFCINTERCEPTORCYCLONIC', 'IFCINTERCEPTORGREASE', 'IFCINTERCEPTOROIL', 'IFCINTERCEPTORPETROL'],
    props: [
      { name: 'CoverLength', type: 'IfcReal', description: 'The length measured along the x-axis in the local coordinate system or the radius (in the case of a circular shape in pl' },
      { name: 'CoverWidth', type: 'IfcReal', description: 'The length measured along the y-axis in the local coordinate system of the cover of the object.' },
      { name: 'InletConnectionSize', type: 'IfcReal', description: 'Size of the inlet connection.; Note that all inlet connections are assumed to be the same size.' },
      { name: 'NominalBodyDepth', type: 'IfcReal', description: 'Nominal or quoted length measured along the z-axis of the local coordinate system of the object.' },
      { name: 'NominalBodyLength', type: 'IfcReal', description: 'Nominal or quoted length measured along the x-axis of the local coordinate system of the object.' },
      { name: 'NominalBodyWidth', type: 'IfcReal', description: 'Nominal or quoted length, measured along the y-axis of the local coordinate system of the object.' },
      { name: 'OutletConnectionSize', type: 'IfcReal', description: 'Size of the outlet connection from the object.' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'VentilatingPipeSize', type: 'IfcReal', description: 'Size of the ventilating pipe(s).' },
    ],
  },

  'Pset_IpNetworkEquipmentPHistory': {
    label:       'Property Set: Ip Network Equipment Phistory',
    description: 'Properties defining performance information for IP network equipment.',
    applicableTo: ['IFCCOMMUNICATIONSAPPLIANCEIPNETWORKEQUIPMENT'],
    props: [
      { name: 'NumberOfPackets', type: 'IfcTimeSeries', description: 'Indicates the number of packets of the IP network equipment.' },
    ],
  },

  'Pset_JettyCommon': {
    label:       'Property Set: Jetty Common',
    description: 'Properties common to the definition of all occurrences of [[IfcMarineFacility]] with the predefined type set to JETTY.',
    applicableTo: ['IFCMARINEFACILITYJETTY'],
    props: [
      { name: 'BentSpacing', type: 'IfcReal', description: 'Bent (upright) spacing' },
      { name: 'Elevation', type: 'IfcReal', description: 'Elevation of the entity' },
      { name: 'PierSectionType', type: 'IfcLabel', description: 'Whether the structure presents a solid/closed barrier to the passage of water or is open.' },
      { name: 'StructuralType', type: 'IfcLabel', description: 'Structural type of the object' },
    ],
  },

  'Pset_JettyDesignCriteria': {
    label:       'Property Set: Jetty Design Criteria',
    description: 'Properties common to the definition of design criteria of all occurrences of [[IfcMarineFacility]] with the predefined type set to JETTY.',
    applicableTo: ['IFCMARINEFACILITYJETTY'],
    props: [
      { name: 'EquipmentLoading', type: 'IfcReal', description: 'Loading from equipment' },
      { name: 'ExtremeHighWaterLevel', type: 'IfcReal', description: 'Extreme high water level' },
      { name: 'ExtremeLowWaterLevel', type: 'IfcReal', description: 'Extreme low water level' },
      { name: 'FlowLoading', type: 'IfcReal', description: 'Flow loading force' },
      { name: 'HighWaterLevel', type: 'IfcReal', description: 'High water level' },
      { name: 'LowWaterLevel', type: 'IfcReal', description: 'Low water level' },
      { name: 'ShipLoading', type: 'IfcReal', description: 'Ship loading force' },
      { name: 'UniformlyDistributedLoad', type: 'IfcReal', description: 'Uniformly Distributed Load' },
      { name: 'WaveLoading', type: 'IfcReal', description: 'Wave loading force' },
    ],
  },

  'Pset_JunctionBoxTypeCommon': {
    label:       'Property Set: Junction Box Type Common',
    description: 'A junction box is an enclosure within which cables are connected.',
    applicableTo: ['IFCJUNCTIONBOX', 'IFCJUNCTIONBOXDATA', 'IFCJUNCTIONBOXPOWER'],
    props: [
      { name: 'ClearDepth', type: 'IfcReal', description: 'The clear depth.' },
      { name: 'IP_Code', type: 'IfcLabel', description: 'IP Code, the International Protection Marking, IEC 60529), classifies and rates the degree of protection provided agains' },
      { name: 'IsExternal', type: 'IfcBoolean', description: 'Indication whether the element is designed for use in the exterior (TRUE) or not (FALSE). If (TRUE) it is an external el' },
      { name: 'JunctionBoxMountingType', type: 'IfcLabel', description: 'Method of mounting to be adopted for the type of junction box.' },
      { name: 'NominalHeight', type: 'IfcReal', description: 'The nominal height of the object. The size information is provided in addition to the shape representation and the geome' },
      { name: 'NominalLength', type: 'IfcReal', description: 'The nominal overall length of the object. The size information is provided in addition to the shape representation and t' },
      { name: 'NominalWidth', type: 'IfcReal', description: 'The nominal overall width of the object. The size information is provided in addition to the shape representation and th' },
      { name: 'NumberOfGangs', type: 'IfcInteger', description: 'Number of gangs in the object.' },
      { name: 'PlacingType', type: 'IfcLabel', description: 'Location at which the type of junction box can be located.' },
      { name: 'ShapeType', type: 'IfcLabel', description: 'Shape of the junction box.' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_JunctionBoxTypeData': {
    label:       'Property Set: Junction Box Type Data',
    description: 'The property set can be used by the predefined type [[DATA]] of [[IfcJunctionBox]].',
    applicableTo: ['IFCJUNCTIONBOXDATA'],
    props: [
      { name: 'DataConnectionType', type: 'IfcLabel', description: 'Indicates the data connection type of the junction box e.g. copper pair, fiber or others.' },
    ],
  },

  'Pset_KerbCommon': {
    label:       'Property Set: Kerb Common',
    description: 'Properties for a kerb.',
    applicableTo: ['IFCKERB'],
    props: [
      { name: 'CombinedKerbGutter', type: 'IfcBoolean', description: 'Indicating the use of a combined kerb and gutter.' },
      { name: 'Mountable', type: 'IfcBoolean', description: 'Specifies whether the kerb can be readily climbed by a vehicle or not.' },
      { name: 'Upstand', type: 'IfcReal', description: 'The height difference between the two separated surfaces.' },
    ],
  },

  'Pset_KerbStone': {
    label:       'Property Set: Kerb Stone',
    description: 'Properties for kerb stones.',
    applicableTo: ['IFCKERB'],
    props: [
      { name: 'NominalHeight', type: 'IfcReal', description: 'The nominal height of the object. The size information is provided in addition to the shape representation and the geome' },
      { name: 'NominalLength', type: 'IfcReal', description: 'The nominal overall length of the object. The size information is provided in addition to the shape representation and t' },
      { name: 'NominalWidth', type: 'IfcReal', description: 'The nominal overall width of the object. The size information is provided in addition to the shape representation and th' },
      { name: 'StoneFinishes', type: 'IfcLabel', description: 'Eg. \\\'Polished\\\', \\\'Bush Hammered\\\', \\\'Split\\\', \\\'Sawn\\\', \\\'Flamed\\\'' },
      { name: 'TypeDesignation', type: 'IfcLabel', description: 'Type designator for the element. The content depends on local standards. Eg. \\\'Bull nose\\\', \\\'Half batter\\\', \\\'Dropper\\\', \\\'Cha' },
    ],
  },

  'Pset_LampTypeCommon': {
    label:       'Property Set: Lamp Type Common',
    description: 'A lamp is a component within a light fixture that is designed to emit light.',
    applicableTo: ['IFCLAMP', 'IFCLAMPCOMPACTFLUORESCENT', 'IFCLAMPFLUORESCENT', 'IFCLAMPHALOGEN', 'IFCLAMPHIGHPRESSUREMERCURY', 'IFCLAMPHIGHPRESSURESODIUM', 'IFCLAMPLED', 'IFCLAMPMETALHALIDE', 'IFCLAMPOLED', 'IFCLAMPTUNGSTENFILAMENT'],
    props: [
      { name: 'ColourAppearance', type: 'IfcLabel', description: 'In both the DIN and CIE standards, artificial light sources are classified in terms of their colour appearance. To the h' },
      { name: 'ColourRenderingIndex', type: 'IfcInteger', description: 'The CRI indicates how well a light source renders eight standard colours compared to perfect reference lamp with the sam' },
      { name: 'ColourTemperature', type: 'IfcReal', description: 'The colour temperature of any source of radiation is defined as the temperature (in Kelvin) of a black-body or Planckian' },
      { name: 'ContributedLuminousFlux', type: 'IfcReal', description: 'Luminous flux is a photometric measure of radiant flux, i.e. the volume of light emitted from a light source. Luminous f' },
      { name: 'LampBallastType', type: 'IfcLabel', description: 'The type of ballast used to stabilise gas discharge by limiting the current during operation and to deliver the necessar' },
      { name: 'LampCompensationType', type: 'IfcLabel', description: 'Identifies the form of compensation used for power factor correction and radio suppression.' },
      { name: 'LampMaintenanceFactor', type: 'IfcReal', description: 'Non recoverable losses of luminous flux of a lamp due to lamp depreciation; i.e. the decreasing of light output of a lum' },
      { name: 'LightEmitterNominalPower', type: 'IfcReal', description: 'Light emitter nominal power.' },
      { name: 'Spectrum', type: 'IfcReal', description: 'The spectrum of radiation describes its composition with regard to wavelength. Light, for example, as the portion of ele' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_LandRegistration': {
    label:       'Property Set: Land Registration',
    description: 'Specifies the identity of land within a statutory registration system.',
    applicableTo: ['IFCSITE'],
    props: [
      { name: 'IsPermanentID', type: 'IfcBoolean', description: 'Indicates whether the identity assigned to the object is permanent (= TRUE) or temporary (=FALSE).' },
      { name: 'LandID', type: 'IfcLabel', description: 'Identification number assigned by the statutory registration authority to a land parcel.' },
      { name: 'LandTitleID', type: 'IfcLabel', description: 'Identification number assigned by the statutory registration authority to the title to a land parcel.' },
    ],
  },

  'Pset_LightFixtureTypeCommon': {
    label:       'Property Set: Light Fixture Type Common',
    description: 'Common data for light fixtures.;',
    applicableTo: ['IFCLIGHTFIXTURE', 'IFCLIGHTFIXTUREDIRECTIONSOURCE', 'IFCLIGHTFIXTUREPOINTSOURCE', 'IFCLIGHTFIXTURESECURITYLIGHTING'],
    props: [
      { name: 'LightFixtureMountingType', type: 'IfcLabel', description: 'A list of the available types of mounting for light fixtures from which that required may be selected.' },
      { name: 'LightFixturePlacingType', type: 'IfcLabel', description: 'A list of the available types of placing specification for light fixtures from which that required may be selected.' },
      { name: 'MaintenanceFactor', type: 'IfcReal', description: 'The arithmetical allowance made for depreciation of lamps and reflective equipment from their initial values due to dirt' },
      { name: 'MaximumPlenumSensibleLoad', type: 'IfcReal', description: 'Maximum or Peak sensible thermal load contributed to return air plenum by the light fixture.' },
      { name: 'MaximumSpaceSensibleLoad', type: 'IfcReal', description: 'Maximum or Peak sensible thermal load contributed to the conditioned space by the light fixture.' },
      { name: 'NumberOfSources', type: 'IfcInteger', description: 'Number of sources .' },
      { name: 'SensibleLoadToRadiant', type: 'IfcReal', description: 'Percent of sensible thermal load to radiant heat.' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'TotalWattage', type: 'IfcReal', description: 'Wattage on whole lightfitting device with all sources intact.' },
    ],
  },

  'Pset_LightFixtureTypeSecurityLighting': {
    label:       'Property Set: Light Fixture Type Security Lighting',
    description: 'Properties that characterize security lighting.',
    applicableTo: ['IFCLIGHTFIXTURESECURITYLIGHTING'],
    props: [
      { name: 'Addressablility', type: 'IfcLabel', description: 'The type of addressability.' },
      { name: 'BackupSupplySystem', type: 'IfcLabel', description: 'The type of backup supply system.' },
      { name: 'FixtureHeight', type: 'IfcReal', description: 'The height of the fixture, such as the text height of an exit sign.' },
      { name: 'PictogramEscapeDirection', type: 'IfcLabel', description: 'The direction of escape pictogram.' },
      { name: 'SecurityLightingType', type: 'IfcLabel', description: 'The type of security lighting.' },
      { name: 'SelfTestFunction', type: 'IfcLabel', description: 'The type of self test function.' },
    ],
  },

  'Pset_LinearReferencingMethod': {
    label:       'Property Set: Linear Referencing Method',
    description: 'Describes the manner in which measurements are made along (and optionally offset from) a linear element.',
    applicableTo: ['IFCALIGNMENT', 'IFCREFERENT', 'IFCREFERENTBOUNDARY', 'IFCREFERENTINTERSECTION', 'IFCREFERENTKILOPOINT', 'IFCREFERENTLANDMARK', 'IFCREFERENTMILEPOINT', 'IFCREFERENTPOSITION', 'IFCREFERENTREFERENCEMARKER', 'IFCREFERENTSTATION', 'IFCREFERENTSUPERELEVATIONEVENT', 'IFCREFERENTWIDTHEVENT'],
    props: [
      { name: 'LRMConstraint', type: 'IfcLabel', description: 'Allows for the specification of constraints imposed by this Linear Referencing Method. For example, a Reference Post Lin' },
      { name: 'LRMName', type: 'IfcLabel', description: 'Gives the name of this Linear Referencing Method, such as kilometre-point.' },
      { name: 'LRMType', type: 'IfcLabel', description: 'Gives the type of this Linear Referencing Method.' },
      { name: 'LRMUnit', type: 'IfcLabel', description: 'Specifies the units of measure used by this Linear Referencing Method for measures along the linear element being measur' },
      { name: 'UserDefinedLRMType', type: 'IfcLabel', description: 'Gives the user defined type of this Linear Referencing Method when property LRMType is LRM_USERDEFINED.' },
    ],
  },

  'Pset_MaintenanceStrategy': {
    label:       'Property Set: Maintenance Strategy',
    description: 'Property set for the association of a maintenance strategy to an element, asset of system.',
    applicableTo: ['*'],
    props: [
      { name: 'AccidentResponse', type: 'IfcLabel', description: 'Accident response chosen for the asset' },
      { name: 'AssetCriticality', type: 'IfcLabel', description: 'Rating of the asset\\\'s criticality to the operation of the facility' },
      { name: 'AssetFrailty', type: 'IfcLabel', description: 'Rating of the asset\\\'s frailty to breakage or deterioration' },
      { name: 'AssetPriority', type: 'IfcLabel', description: 'Combined criticality and frailty rating indicating the operational and maintenance priority of the asset' },
      { name: 'MonitoringType', type: 'IfcLabel', description: 'Monitoring strategy chosen for the asset' },
    ],
  },

  'Pset_MaintenanceTriggerCondition': {
    label:       'Property Set: Maintenance Trigger Condition',
    description: 'Trigger levels for an asset that has an inspection-based maintenance strategy',
    applicableTo: ['*'],
    props: [
      { name: 'ConditionDisposalLevel', type: 'IfcLabel', description: 'Condition that will trigger a disposal process' },
      { name: 'ConditionMaintenanceLevel', type: 'IfcLabel', description: 'Condition that will trigger maintenance' },
      { name: 'ConditionReplacementLevel', type: 'IfcLabel', description: 'Condition that will trigger a replacement process' },
      { name: 'ConditionTargetPerformance', type: 'IfcLabel', description: 'Target condition of the asset' },
    ],
  },

  'Pset_MaintenanceTriggerDuration': {
    label:       'Property Set: Maintenance Trigger Duration',
    description: 'Trigger levels for an asset that has an PPM based maintenance strategy.',
    applicableTo: ['*'],
    props: [
      { name: 'DurationDisposalLevel', type: 'IfcLabel', description: 'Duration interval at which disposal is performed' },
      { name: 'DurationMaintenanceLevel', type: 'IfcLabel', description: 'Duration interval at which maintenance is performed' },
      { name: 'DurationReplacementLevel', type: 'IfcLabel', description: 'Duration interval at which replacement is performed' },
      { name: 'DurationTargetPerformance', type: 'IfcLabel', description: 'Target time to failure of the asset' },
    ],
  },

  'Pset_MaintenanceTriggerPerformance': {
    label:       'Property Set: Maintenance Trigger Performance',
    description: 'Properties for performance based maintenance policies',
    applicableTo: ['*'],
    props: [
      { name: 'DisposalLevel', type: 'IfcReal', description: 'Performance level at which disposal takes place' },
      { name: 'PerformanceMaintenanceLevel', type: 'IfcReal', description: 'Performance level at which maintenance takes place' },
      { name: 'ReplacementLevel', type: 'IfcReal', description: 'Performance level at which replacement takes place' },
      { name: 'TargetPerformance', type: 'IfcReal', description: 'Target capacity or performance of the asset. Units of the performance value are specified through the propertyValue unit' },
    ],
  },

  'Pset_ManufacturerOccurrence': {
    label:       'Property Set: Manufacturer Occurrence',
    description: 'Defines properties of individual instances of manufactured products that may be given by the manufacturer.;',
    applicableTo: ['*'],
    props: [
      { name: 'AcquisitionDate', type: 'IfcLabel', description: 'The date that the manufactured item was purchased.' },
      { name: 'AssemblyPlace', type: 'IfcLabel', description: 'Enumeration defining where the assembly is intended to take place, either in a factory, other offsite location or on the' },
      { name: 'BarCode', type: 'IfcLabel', description: 'The identity of the bar code given to an occurrence of the product.' },
      { name: 'BatchReference', type: 'IfcLabel', description: 'The identity of the batch reference from which an occurrence of a product is taken.' },
      { name: 'ManufacturingDate', type: 'IfcLabel', description: 'Date on which the element was manufactured.' },
      { name: 'SerialNumber', type: 'IfcLabel', description: 'The manufacturer\\\'s serial number assigned to an occurrence of a product.' },
    ],
  },

  'Pset_ManufacturerTypeInformation': {
    label:       'Property Set: Manufacturer Type Information',
    description: 'Defines characteristics of types (ranges) of manufactured products that may be given by the manufacturer. Note that the term \\\'manufactured\\\' may also be used to refer to products',
    applicableTo: ['*'],
    props: [
      { name: 'ArticleNumber', type: 'IfcLabel', description: 'Article number or reference that is be applied to a configured product according to a standard scheme for article number' },
      { name: 'AssemblyPlace', type: 'IfcLabel', description: 'Enumeration defining where the assembly is intended to take place, either in a factory, other offsite location or on the' },
      { name: 'GlobalTradeItemNumber', type: 'IfcLabel', description: 'The Global Trade Item Number (GTIN) is an identifier for trade items developed by GS1 (www.gs1.org).' },
      { name: 'Manufacturer', type: 'IfcLabel', description: 'The organization that manufactured and/or assembled the item.' },
      { name: 'ModelLabel', type: 'IfcLabel', description: 'The descriptive model name of the product model (or product line) as assigned by the manufacturer of the manufactured it' },
      { name: 'ModelReference', type: 'IfcLabel', description: 'The model number or designator of the product model (or product line) as assigned by the manufacturer of the manufacture' },
      { name: 'OperationalDocument', type: 'IfcTimeSeries', description: 'Manufacturer\\\'s operational document' },
      { name: 'PerformanceCertificate', type: 'IfcTimeSeries', description: 'Manufacturer\\\'s performance certificate' },
      { name: 'ProductionYear', type: 'IfcLabel', description: 'The year of production of the manufactured item.' },
      { name: 'SafetyDocument', type: 'IfcTimeSeries', description: 'Manufacturer\\\'s safety document' },
    ],
  },

  'Pset_MarineFacilityTransportation': {
    label:       'Property Set: Marine Facility Transportation',
    description: 'Properties common to the definition of all occurrences of [[IfcMarineFacility]] which are catagorised as transportation facilities such as Ports, marinas etc.',
    applicableTo: ['IFCMARINEFACILITY', 'IFCMARINEFACILITYBARRIERBEACH', 'IFCMARINEFACILITYBREAKWATER', 'IFCMARINEFACILITYCANAL', 'IFCMARINEFACILITYDRYDOCK', 'IFCMARINEFACILITYFLOATINGDOCK', 'IFCMARINEFACILITYHYDROLIFT', 'IFCMARINEFACILITYJETTY', 'IFCMARINEFACILITYLAUNCHRECOVERY', 'IFCMARINEFACILITYMARINEDEFENCE', 'IFCMARINEFACILITYNAVIGATIONALCHANNEL', 'IFCMARINEFACILITYPORT', 'IFCMARINEFACILITYQUAY', 'IFCMARINEFACILITYREVETMENT', 'IFCMARINEFACILITYSHIPLIFT', 'IFCMARINEFACILITYSHIPLOCK', 'IFCMARINEFACILITYSHIPYARD', 'IFCMARINEFACILITYSLIPWAY', 'IFCMARINEFACILITYWATERWAY', 'IFCMARINEFACILITYWATERWAYSHIPLIFT'],
    props: [
      { name: 'BerthCargoWeight', type: 'IfcReal', description: 'Total cargo weight of berths within the facility' },
      { name: 'BerthGrade', type: 'IfcLabel', description: 'Berth grade' },
      { name: 'Berths', type: 'IfcInteger', description: 'Number of standard berths within the facility' },
    ],
  },

  'Pset_MarinePartChamberCommon': {
    label:       'Property Set: Marine Part Chamber Common',
    description: 'Properties common to the definition of all occurrences of [[IfcMarinePart]] with the predefined type set to CHAMBER.',
    applicableTo: ['IFCMARINEPARTCHAMBER'],
    props: [
      { name: 'EffectiveChamberSize', type: 'IfcReal', description: 'Volumetric measure defining the effective chamber size for operational and design activities.' },
      { name: 'StructuralType', type: 'IfcLabel', description: 'Structural type of the object' },
    ],
  },

  'Pset_MarineVehicleCommon': {
    label:       'Property Set: Marine Vehicle Common',
    description: 'Properties common to the definition of all occurrences of [[IfcTransportElement]] and types of IfcTransportElementType with the predefined type set to VEHICLEMARINE.',
    applicableTo: ['IFCVEHICLEVEHICLEMARINE'],
    props: [
      { name: 'AboveDeckProjectedWindEnd', type: 'IfcReal', description: 'End on projected windage area above the main deck' },
      { name: 'AboveDeckProjectedWindSide', type: 'IfcReal', description: 'Side on projected windage area above the main deck' },
      { name: 'CargoDeadWeight', type: 'IfcReal', description: 'Weight of (bulk) cargo carried' },
      { name: 'Displacement', type: 'IfcReal', description: 'Weight of water displaced by the vessel' },
      { name: 'LaneMeters', type: 'IfcReal', description: 'Length of lanes accommodating vehicles on roll-on, roll-off vessels' },
      { name: 'LengthBetweenPerpendiculars', type: 'IfcReal', description: 'Length of vessel from rudder shaft to crossing point of the bow and the loaded waterline.' },
      { name: 'VesselDepth', type: 'IfcReal', description: 'Depth of the vessel from the main deck to the keel.' },
      { name: 'VesselDraft', type: 'IfcReal', description: 'Depth of vessel from the waterline to the keel (LightShip, Ballasted, Maximum)' },
    ],
  },

  'Pset_MarineVehicleDesignCriteria': {
    label:       'Property Set: Marine Vehicle Design Criteria',
    description: 'Properties common to the definition of design criteria of all occurrences of [[IfcTransportElement]] and types of IfcTransportElementType with the predefined type set to MARINEVEHI',
    applicableTo: ['IFCVEHICLEVEHICLEMARINE'],
    props: [
      { name: 'AllowableHullPressure', type: 'IfcReal', description: 'Allowable contact pressure between fender and hull' },
      { name: 'SoftnessCoefficient', type: 'IfcReal', description: 'Vessel flexibility factor - proportion of impact energy absorbed by the hull.' },
    ],
  },

  'Pset_MarkerGeneral': {
    label:       'Property Set: Marker General',
    description: 'Properties common to a signalling marker made as an assembly of elements. The property set can be used by the predefined type SIGNAL_ASSEMBLY of [[IfcElementAssembly]].',
    applicableTo: ['IFCELEMENTASSEMBLYSIGNALASSEMBLY'],
    props: [
      { name: 'ApproachSpeed', type: 'IfcReal', description: 'The design speed of trains approaching the signal if different from the line speed.' },
      { name: 'MarkerType', type: 'IfcLabel', description: 'The type of marker (sign) e.g. stop signal, restriction signal, track circuit tuning zone sign or others specified in PE' },
      { name: 'NominalHeight', type: 'IfcReal', description: 'The nominal height of the object. The size information is provided in addition to the shape representation and the geome' },
      { name: 'NominalWidth', type: 'IfcReal', description: 'The nominal overall width of the object. The size information is provided in addition to the shape representation and th' },
      { name: 'Symbol', type: 'IfcTimeSeries', description: 'Content which is shown on the sign, e.g. text, number, arrow or icon. The string can also be a pointer to a symbol catal' },
    ],
  },

  'Pset_MarkingLinesCommon': {
    label:       'Property Set: Marking Lines Common',
    description: 'Properties for line markings.',
    applicableTo: ['IFCSURFACEFEATURELINEMARKING'],
    props: [
      { name: 'DashedLine', type: 'IfcBoolean', description: 'State if the line is dashed or continuous' },
      { name: 'DashedLinePattern', type: 'IfcLabel', description: 'Indicates the pattern for dashed line types e.g. \\\'3+9\\\'' },
      { name: 'NominalWidth', type: 'IfcReal', description: 'The nominal overall width of the object. The size information is provided in addition to the shape representation and th' },
    ],
  },

  'Pset_MaterialCombustion': {
    label:       'Property Set: Material Combustion',
    description: 'A set of extended material properties of products of combustion generated by elements typically used within the context of building services and flow distribution systems.',
    applicableTo: ['IFCMATERIAL'],
    props: [
      { name: 'CO2Content', type: 'IfcReal', description: 'Carbon dioxide (CO2) content of the products of combustion. This is measured in weight of CO2 per unit weight and is the' },
      { name: 'COContent', type: 'IfcReal', description: 'Carbon monoxide (CO) content of the products of combustion. This is measured in weight of CO per unit weight and is ther' },
      { name: 'N20Content', type: 'IfcReal', description: 'Nitrous oxide (N2O) content of the products of combustion. This is measured in weight of N2O per unit weight and is ther' },
      { name: 'SpecificHeatCapacity', type: 'IfcReal', description: 'Defines the specific heat capacity of a material.' },
    ],
  },

  'Pset_MaterialCommon': {
    label:       'Property Set: Material Common',
    description: 'A set of general material properties.',
    applicableTo: ['IFCMATERIAL'],
    props: [
      { name: 'MassDensity', type: 'IfcReal', description: 'Material mass density.' },
      { name: 'MolecularWeight', type: 'IfcReal', description: 'Molecular weight of material (typically gas).' },
      { name: 'Porosity', type: 'IfcReal', description: 'The void fraction of the total volume occupied by material (Vbr - Vnet)/Vbr.' },
    ],
  },

  'Pset_MaterialConcrete': {
    label:       'Property Set: Material Concrete',
    description: 'A set of extended mechanical properties related to concrete materials.',
    applicableTo: ['IFCMATERIAL'],
    props: [
      { name: 'AdmixturesDescription', type: 'IfcLabel', description: 'Description of the admixtures added to the concrete mix.' },
      { name: 'CompressiveStrength', type: 'IfcReal', description: 'The compressive strength of the object or material.' },
      { name: 'MaxAggregateSize', type: 'IfcReal', description: 'The maximum aggregate size of the concrete.' },
      { name: 'ProtectivePoreRatio', type: 'IfcReal', description: 'The protective pore ratio indicating the frost-resistance of the concrete.' },
      { name: 'WaterImpermeability', type: 'IfcLabel', description: 'Description of the water impermeability denoting the water repelling properties.' },
      { name: 'Workability', type: 'IfcLabel', description: 'Description of the workability of the fresh concrete defined according to local standards.' },
    ],
  },

  'Pset_MaterialEnergy': {
    label:       'Property Set: Material Energy',
    description: 'A set of extended material properties for energy calculation purposes.',
    applicableTo: ['IFCMATERIAL'],
    props: [
      { name: 'GasPressure', type: 'IfcReal', description: 'Fill pressure (e.g.the pressure exerted by a mass of gas confined in a constant volume.' },
      { name: 'MoistureCapacityThermalGradient', type: 'IfcReal', description: 'Thermal gradient coefficient for moisture capacity. Based on water vapor density.' },
      { name: 'SolarRefractionIndex', type: 'IfcReal', description: 'Index of refraction (solar) defines the \\\'bending\\\' of the solar ray when it passes from one medium into another.' },
      { name: 'SpecificHeatTemperatureDerivative', type: 'IfcReal', description: 'Specific heat temperature derivative.' },
      { name: 'ThermalConductivityTemperatureDerivative', type: 'IfcReal', description: 'Thermal conductivity temperature derivative.' },
      { name: 'ViscosityTemperatureDerivative', type: 'IfcReal', description: 'Viscosity temperature derivative.' },
      { name: 'VisibleRefractionIndex', type: 'IfcReal', description: 'Index of refraction (visible) defines the \\\'bending\\\' of the sola! r ray in the visible spectrum when it passes from one m' },
    ],
  },

  'Pset_MaterialFuel': {
    label:       'Property Set: Material Fuel',
    description: 'A set of extended material properties of fuel energy typically used within the context of building services and flow distribution systems.',
    applicableTo: ['IFCMATERIAL'],
    props: [
      { name: 'CarbonContent', type: 'IfcReal', description: 'The carbon content in the fuel. This is measured in weight of carbon per unit weight of fuel and is therefore unitless.' },
      { name: 'CombustionTemperature', type: 'IfcReal', description: 'Combustion temperature.' },
      { name: 'HigherHeatingValue', type: 'IfcReal', description: 'Higher Heating Value is defined as the amount of energy released (MJ/kg) when a fuel is burned completely, and H2O is in' },
      { name: 'LowerHeatingValue', type: 'IfcReal', description: 'Lower Heating Value is defined as the amount of energy released (MJ/kg) when a fuel is burned completely, and H2O is in' },
    ],
  },

  'Pset_MaterialHygroscopic': {
    label:       'Property Set: Material Hygroscopic',
    description: 'A set of hygroscopic properties of materials.',
    applicableTo: ['IFCMATERIAL'],
    props: [
      { name: 'IsothermalMoistureCapacity', type: 'IfcReal', description: 'Based on water vapor density.' },
      { name: 'LowerVaporResistanceFactor', type: 'IfcReal', description: 'The vapor permeability relationship of air/material (typically value > 1), measured in low relative humidity (typically' },
      { name: 'MoistureDiffusivity', type: 'IfcReal', description: 'Moisture diffusivity is a transport property that is frequently used in the hygrothermal analysis of building envelope c' },
      { name: 'UpperVaporResistanceFactor', type: 'IfcReal', description: 'The vapor permeability relationship of air/material (typically value > 1), measured in high relative humidity (typically' },
      { name: 'VaporPermeability', type: 'IfcReal', description: 'The rate of water vapor transmission per unit area per unit of vapor pressure differential under test conditions.' },
    ],
  },

  'Pset_MaterialMechanical': {
    label:       'Property Set: Material Mechanical',
    description: 'A set of mechanical material properties normally used for structural analysis purpose. It contains all properties which are independent of the actual material type.',
    applicableTo: ['IFCMATERIAL'],
    props: [
      { name: 'DynamicViscosity', type: 'IfcReal', description: 'A measure of the viscous resistance of the material.' },
      { name: 'PoissonRatio', type: 'IfcReal', description: 'A measure of the lateral deformations in the elastic range.' },
      { name: 'ShearModulus', type: 'IfcReal', description: 'A measure of the shear modulus of elasticity of the material.' },
      { name: 'ThermalExpansionCoefficient', type: 'IfcReal', description: 'Quantity characterizing the variation with thermodynamic temperature T of the distance l between two points of a body, u' },
      { name: 'YoungModulus', type: 'IfcReal', description: 'A measure of the Young\\\'s modulus of elasticity of the material.' },
    ],
  },

  'Pset_MaterialOptical': {
    label:       'Property Set: Material Optical',
    description: 'A set of optical properties of materials.',
    applicableTo: ['IFCMATERIAL'],
    props: [
      { name: 'SolarReflectanceBack', type: 'IfcReal', description: 'back side. Defines the fraction of the solar ray that is reflected and not transmitted when the ray passes from one medi' },
      { name: 'SolarReflectanceFront', type: 'IfcReal', description: 'front side. Defines the fraction of the solar ray that is reflected and not transmitted when the ray passes from one med' },
      { name: 'SolarTransmittance', type: 'IfcReal', description: 'The ratio of incident solar radiation that directly passes through a system (also named τe). Note the following equation' },
      { name: 'ThermalIrEmissivityBack', type: 'IfcReal', description: 'back side. Defines the fraction of thermal energy emitted per unit area to \\\'blackbody\\\' at the same temperature, through' },
      { name: 'ThermalIrEmissivityFront', type: 'IfcReal', description: 'front side. Defines the fraction of thermal energy emitted per unit area to \\\'blackbody\\\' at the same temperature, through' },
      { name: 'ThermalIrTransmittance', type: 'IfcReal', description: 'Thermal IR transmittance at normal incidence. Defines the fraction of thermal energy that passes through per unit area,' },
      { name: 'VisibleReflectanceBack', type: 'IfcReal', description: 'back side. Defines the fraction of the solar ray in the visible spectrum that is reflected and not transmitted when the' },
      { name: 'VisibleReflectanceFront', type: 'IfcReal', description: 'front side. Defines the fraction of the solar ray in the visible spectrum that is reflected and not transmitted when the' },
      { name: 'VisibleTransmittance', type: 'IfcReal', description: 'Transmittance at normal incidence (visible). Defines the fraction of the visible spectrum of solar radiation that passes' },
    ],
  },

  'Pset_MaterialSteel': {
    label:       'Property Set: Material Steel',
    description: 'A set of extended mechanical properties related to steel (or other metallic and isotropic) materials.',
    applicableTo: ['IFCMATERIAL'],
    props: [
      { name: 'HardeningModule', type: 'IfcReal', description: 'A measure of the hardening module of the material (slope of stress versus strain curve after yield range).' },
      { name: 'PlasticStrain', type: 'IfcReal', description: 'A measure of the permanent displacement, as in slip or twinning, which remains after the stress has been removed. Curren' },
      { name: 'ProportionalStress', type: 'IfcReal', description: 'A measure of the proportional stress of the material. It describes the stress before the first plastic deformation occur' },
      { name: 'Relaxations', type: 'IfcReal', description: 'Measures of decrease in stress over long time intervals resulting from plastic flow. Different relaxation values for dif' },
      { name: 'StructuralGrade', type: 'IfcLabel', description: 'Classification label to define mechanical properties according to structural grades defined in published standards; desi' },
      { name: 'UltimateStrain', type: 'IfcReal', description: 'A measure of the (engineering) strain at the state of ultimate stress of the material.' },
      { name: 'UltimateStress', type: 'IfcReal', description: 'A measure of the ultimate stress of the material.' },
      { name: 'YieldStress', type: 'IfcReal', description: 'A measure of the yield stress (or characteristic 0.2 percent proof stress) of the material.' },
    ],
  },

  'Pset_MaterialThermal': {
    label:       'Property Set: Material Thermal',
    description: 'A set of thermal material properties.',
    applicableTo: ['IFCMATERIAL'],
    props: [
      { name: 'BoilingPoint', type: 'IfcReal', description: 'The boiling point of the material (fluid).' },
      { name: 'FreezingPoint', type: 'IfcReal', description: 'The freezing point of the material (fluid).' },
      { name: 'SpecificHeatCapacity', type: 'IfcReal', description: 'Defines the specific heat capacity of a material.' },
      { name: 'ThermalConductivity', type: 'IfcReal', description: 'The thermal conductivity of the object.' },
    ],
  },

  'Pset_MaterialWater': {
    label:       'Property Set: Material Water',
    description: 'A set of extended material properties for of water typically used within the context of building services and flow distribution systems.',
    applicableTo: ['IFCMATERIAL'],
    props: [
      { name: 'AcidityConcentration', type: 'IfcReal', description: 'Maximum CaCO3 equivalent that would neutralize the acid.' },
      { name: 'AlkalinityConcentration', type: 'IfcReal', description: 'Maximum alkalinity concentration (maximum sum of concentrations of each of the negative ions substances measured as CaCO' },
      { name: 'DissolvedSolidsContent', type: 'IfcReal', description: 'Fraction of the dissolved solids to the total amount of water. This is measured in weight of dissolved solids per weight' },
      { name: 'Hardness', type: 'IfcReal', description: 'Water hardness as positive, multivalent ion concentration in the water (usually concentrations of calcium and magnesium' },
      { name: 'ImpuritiesContent', type: 'IfcReal', description: 'Fraction of impurities such as dust to the total amount of water. This is measured in weight of impurities per weight of' },
      { name: 'IsPotable', type: 'IfcBoolean', description: 'If TRUE, then the water is considered potable.' },
      { name: 'PHLevel', type: 'IfcReal', description: 'Maximum water PH in a range from 0-14.' },
    ],
  },

  'Pset_MaterialWood': {
    label:       'Property Set: Material Wood',
    description: 'This is a collection of properties applicable to wood-based materials that specify kind and grade of material as well as moisture related parameters.',
    applicableTo: ['IFCMATERIAL'],
    props: [
      { name: 'AppearanceGrade', type: 'IfcLabel', description: 'Grade with respect to visual quality.' },
      { name: 'DimensionalChangeCoefficient', type: 'IfcReal', description: 'Weighted dimensional change coefficient, relative to 1% change in moisture content.' },
      { name: 'Layers', type: 'IfcInteger', description: 'Number of layers.' },
      { name: 'Layup', type: 'IfcLabel', description: 'Configuration of the lamination.' },
      { name: 'MoistureContent', type: 'IfcReal', description: 'Total weight of moisture relative to oven-dried weight of the wood.' },
      { name: 'Plies', type: 'IfcInteger', description: 'Number of plies.' },
      { name: 'Species', type: 'IfcLabel', description: 'Wood species of a solid wood or laminated wood product.' },
      { name: 'StrengthGrade', type: 'IfcLabel', description: 'Grade with respect to mechanical strength and stiffness.' },
      { name: 'ThicknessSwelling', type: 'IfcReal', description: 'Swelling ratio relative to board depth.' },
    ],
  },

  'Pset_MaterialWoodBasedStructure': {
    label:       'Property Set: Material Wood Based Structure',
    description: 'Properties about Material of Wood Based [[Structure]].',
    applicableTo: ['IFCMATERIAL'],
    props: [
      { name: 'ApplicableStructuralDesignMethod', type: 'IfcLabel', description: 'Determines whether mechanical material properties are applicable to \\\'ASD\\\' = allowable stress design (working stress desi' },
    ],
  },

  'Pset_MechanicalBeamInPlane': {
    label:       'Property Set: Mechanical Beam In Plane',
    description: 'Properties about Mechanical Beam in Plane.',
    applicableTo: ['IFCMATERIAL'],
    props: [
      { name: 'BendingStrength', type: 'IfcReal', description: 'Bending strength.' },
      { name: 'CompStrength', type: 'IfcReal', description: 'Compressive strength, α=0°.' },
      { name: 'CompStrengthPerp', type: 'IfcReal', description: 'Compressive strength, α=90°.' },
      { name: 'InstabilityFactors', type: 'IfcReal', description: 'slenderness ratios;either factors or divisors of the strength,divisors).' },
      { name: 'RaisedCompStrengthPerp', type: 'IfcReal', description: 'Alternative value for compressive strength, α=90°, which may be used under material and code dependent conditions (e.g.' },
      { name: 'ReferenceDepth', type: 'IfcReal', description: 'Depth in bending for which the mechanical properties are valid; provided as a means to check the integrity of material a' },
      { name: 'ShearModulus', type: 'IfcReal', description: 'A measure of the shear modulus of elasticity of the material.' },
      { name: 'ShearModulusMin', type: 'IfcReal', description: 'Shear modulus, minimal value.' },
      { name: 'ShearStrength', type: 'IfcReal', description: 'α;shear strength.' },
      { name: 'TensileStrength', type: 'IfcReal', description: 'Indicates the ability to withstand breakage apart under applied force.' },
      { name: 'TensileStrengthPerp', type: 'IfcReal', description: 'Tensile strength, α=90°.' },
      { name: 'TorsionalStrength', type: 'IfcReal', description: 'Shear strength in torsion.' },
      { name: 'YoungModulus', type: 'IfcReal', description: 'A measure of the Young\\\'s modulus of elasticity of the material.' },
      { name: 'YoungModulusMin', type: 'IfcReal', description: 'Elastic modulus, minimal value, α=0°.' },
      { name: 'YoungModulusPerp', type: 'IfcReal', description: 'Elastic modulus, mean value, α=90°.' },
      { name: 'YoungModulusPerpMin', type: 'IfcReal', description: 'Elastic modulus, minimal value, α=90°.' },
    ],
  },

  'Pset_MechanicalBeamInPlaneNegative': {
    label:       'Property Set: Mechanical Beam In Plane Negative',
    description: 'Properties about Mechanical Beam in Plane Negative.',
    applicableTo: ['IFCMATERIAL'],
    props: [
      { name: 'BendingStrength', type: 'IfcReal', description: 'Bending strength.' },
      { name: 'CompStrength', type: 'IfcReal', description: 'Compressive strength, α=0°.' },
      { name: 'CompStrengthPerp', type: 'IfcReal', description: 'Compressive strength, α=90°.' },
      { name: 'InstabilityFactors', type: 'IfcReal', description: 'slenderness ratios;either factors or divisors of the strength,divisors).' },
      { name: 'RaisedCompStrengthPerp', type: 'IfcReal', description: 'Alternative value for compressive strength, α=90°, which may be used under material and code dependent conditions (e.g.' },
      { name: 'ReferenceDepth', type: 'IfcReal', description: 'Depth in bending for which the mechanical properties are valid; provided as a means to check the integrity of material a' },
      { name: 'ShearModulus', type: 'IfcReal', description: 'A measure of the shear modulus of elasticity of the material.' },
      { name: 'ShearModulusMin', type: 'IfcReal', description: 'Shear modulus, minimal value.' },
      { name: 'ShearStrength', type: 'IfcReal', description: 'α;shear strength.' },
      { name: 'TensileStrength', type: 'IfcReal', description: 'Indicates the ability to withstand breakage apart under applied force.' },
      { name: 'TensileStrengthPerp', type: 'IfcReal', description: 'Tensile strength, α=90°.' },
      { name: 'TorsionalStrength', type: 'IfcReal', description: 'Shear strength in torsion.' },
      { name: 'YoungModulus', type: 'IfcReal', description: 'A measure of the Young\\\'s modulus of elasticity of the material.' },
      { name: 'YoungModulusMin', type: 'IfcReal', description: 'Elastic modulus, minimal value, α=0°.' },
      { name: 'YoungModulusPerp', type: 'IfcReal', description: 'Elastic modulus, mean value, α=90°.' },
      { name: 'YoungModulusPerpMin', type: 'IfcReal', description: 'Elastic modulus, minimal value, α=90°.' },
    ],
  },

  'Pset_MechanicalBeamOutOfPlane': {
    label:       'Property Set: Mechanical Beam Out Of Plane',
    description: 'Properties about Mechanical Beam Out Of Plane.',
    applicableTo: ['IFCMATERIAL'],
    props: [
      { name: 'BendingStrength', type: 'IfcReal', description: 'Bending strength.' },
      { name: 'CompStrength', type: 'IfcReal', description: 'Compressive strength, α=0°.' },
      { name: 'CompStrengthPerp', type: 'IfcReal', description: 'Compressive strength, α=90°.' },
      { name: 'InstabilityFactors', type: 'IfcReal', description: 'slenderness ratios;either factors or divisors of the strength,divisors).' },
      { name: 'RaisedCompStrengthPerp', type: 'IfcReal', description: 'Alternative value for compressive strength, α=90°, which may be used under material and code dependent conditions (e.g.' },
      { name: 'ReferenceDepth', type: 'IfcReal', description: 'Depth in bending for which the mechanical properties are valid; provided as a means to check the integrity of material a' },
      { name: 'ShearModulus', type: 'IfcReal', description: 'A measure of the shear modulus of elasticity of the material.' },
      { name: 'ShearModulusMin', type: 'IfcReal', description: 'Shear modulus, minimal value.' },
      { name: 'ShearStrength', type: 'IfcReal', description: 'α;shear strength.' },
      { name: 'TensileStrength', type: 'IfcReal', description: 'Indicates the ability to withstand breakage apart under applied force.' },
      { name: 'TensileStrengthPerp', type: 'IfcReal', description: 'Tensile strength, α=90°.' },
      { name: 'TorsionalStrength', type: 'IfcReal', description: 'Shear strength in torsion.' },
      { name: 'YoungModulus', type: 'IfcReal', description: 'A measure of the Young\\\'s modulus of elasticity of the material.' },
      { name: 'YoungModulusMin', type: 'IfcReal', description: 'Elastic modulus, minimal value, α=0°.' },
      { name: 'YoungModulusPerp', type: 'IfcReal', description: 'Elastic modulus, mean value, α=90°.' },
      { name: 'YoungModulusPerpMin', type: 'IfcReal', description: 'Elastic modulus, minimal value, α=90°.' },
    ],
  },

  'Pset_MechanicalFastenerAnchorBolt': {
    label:       'Property Set: Mechanical Fastener Anchor Bolt',
    description: 'Properties common to different types of anchor bolts.',
    applicableTo: ['IFCMECHANICALFASTENERANCHORBOLT'],
    props: [
      { name: 'AnchorBoltDiameter', type: 'IfcReal', description: 'The nominal diameter of the anchor bolt bar(s).' },
      { name: 'AnchorBoltLength', type: 'IfcReal', description: 'The length of the anchor bolt.' },
      { name: 'AnchorBoltProtrusionLength', type: 'IfcReal', description: 'The length of the protruding part of the anchor bolt.' },
      { name: 'AnchorBoltThreadLength', type: 'IfcReal', description: 'The length of the threaded part of the anchor bolt.' },
    ],
  },

  'Pset_MechanicalFastenerBolt': {
    label:       'Property Set: Mechanical Fastener Bolt',
    description: 'Properties related to bolt-type fasteners. The properties of a whole set with bolt, washers and nut may be provided. Note, it is usually not necessary to transmit these properties',
    applicableTo: ['IFCMECHANICALFASTENERBOLT'],
    props: [
      { name: 'HeadShape', type: 'IfcLabel', description: 'Shape of the bolt\\\'s head, e.g. \\\'Hexagon\\\', \\\'Countersunk\\\', \\\'Cheese\\\'' },
      { name: 'KeyShape', type: 'IfcLabel', description: 'If applicable, shape of the head\\\'s slot, e.g. \\\'Slot\\\', \\\'Allen\\\'' },
      { name: 'NutsCount', type: 'IfcInteger', description: 'Count of nuts to be mounted on one bolt' },
      { name: 'NutShape', type: 'IfcLabel', description: 'Shape of the nut, e.g. \\\'Hexagon\\\', \\\'Cap\\\', \\\'Castle\\\', \\\'Wing\\\'' },
      { name: 'ThreadDiameter', type: 'IfcReal', description: 'Nominal diameter of the thread, if different from the bolt\\\'s overall nominal diameter' },
      { name: 'ThreadLength', type: 'IfcReal', description: 'Nominal length of the thread' },
      { name: 'WashersCount', type: 'IfcInteger', description: 'Count of washers to be mounted on one bolt' },
      { name: 'WasherShape', type: 'IfcLabel', description: 'Shape of the washers, e.g. \\\'Standard\\\', \\\'Square\\\'' },
    ],
  },

  'Pset_MechanicalFastenerOCSFitting': {
    label:       'Property Set: Mechanical Fastener Ocsfitting',
    description: 'Common properties of clamps and fittings used in railway overhead contact system (OCS).',
    applicableTo: ['IFCMECHANICALFASTENERCOUPLER'],
    props: [
      { name: 'ManufacturingTechnology', type: 'IfcLabel', description: 'The method / technology used to produce the equipment.' },
      { name: 'OCSFasteningType', type: 'IfcLabel', description: 'Indicates the type of the overhead contact system (OCS) mechanical fastener.' },
    ],
  },

  'Pset_MechanicalFastenerTypeRailFastening': {
    label:       'Property Set: Mechanical Fastener Type Rail Fastening',
    description: 'Properties of rail fastening used in railway track system. The property set can be used by the predefined type RAILFASTENING of [[IfcMechanicalFastener]].',
    applicableTo: ['IFCMECHANICALFASTENERRAILFASTENING'],
    props: [
      { name: 'IsReducedResistanceFastening', type: 'IfcBoolean', description: 'Indicates whether the rail fastening is a reduced resistance fastening (YES) or not (NO).' },
      { name: 'TechnicalStandard', type: 'IfcTimeSeries', description: 'The technical standard which the element should comply with.' },
      { name: 'TrackFasteningElasticityType', type: 'IfcLabel', description: 'Track fastening elasticity type.' },
    ],
  },

  'Pset_MechanicalFastenerTypeRailJoint': {
    label:       'Property Set: Mechanical Fastener Type Rail Joint',
    description: 'Properties common to a rail joint of a railway track system. The property set can be used by the predefined type RAILJOINT of [[IfcMechanicalFastener]].',
    applicableTo: ['IFCMECHANICALFASTENERRAILJOINT'],
    props: [
      { name: 'AssemblyPlace', type: 'IfcLabel', description: 'Enumeration defining where the assembly is intended to take place, either in a factory, other offsite location or on the' },
      { name: 'IsCWRJoint', type: 'IfcBoolean', description: 'Indicates if the rail joint is associated to a continuous welded rail.' },
      { name: 'IsJointControlEquipment', type: 'IfcBoolean', description: 'Indicates whether security equipment is checking the mechanical functionality of the rail joint.' },
      { name: 'IsJointInsulated', type: 'IfcBoolean', description: 'Indicates if the rail joint is insulated.' },
      { name: 'IsLiftingBracketConnection', type: 'IfcBoolean', description: 'Indicates if the connection is between two different heights (TRUE) or not (FALSE).' },
      { name: 'NumberOfScrews', type: 'IfcInteger', description: 'Number of screws/bolts/connections.' },
      { name: 'RailGap', type: 'IfcReal', description: 'The gap between the rail profiles.' },
      { name: 'SleeperArrangement', type: 'IfcLabel', description: 'Define the rail joint sleeper method of assembly (\\\'twin sleeper\\\' type or \\\'between sleepers\\\' type).' },
    ],
  },

  'Pset_MechanicalPanelInPlane': {
    label:       'Property Set: Mechanical Panel In Plane',
    description: 'Properties for Mechanical Panels In Plane.',
    applicableTo: ['IFCMATERIAL'],
    props: [
      { name: 'BearingStrength', type: 'IfcReal', description: 'α;bearing strength of bolt holes, i.e. intrados pressure.' },
      { name: 'BendingStrength', type: 'IfcReal', description: 'Bending strength.' },
      { name: 'CompressiveStrength', type: 'IfcReal', description: 'The compressive strength of the object or material.' },
      { name: 'RaisedCompressiveStrength', type: 'IfcReal', description: 'Alternative value for compressive strength which may be used under material and code dependent conditions (e.g. if defor' },
      { name: 'ReferenceDepth', type: 'IfcReal', description: 'Depth in bending for which the mechanical properties are valid; provided as a means to check the integrity of material a' },
      { name: 'ShearModulus', type: 'IfcReal', description: 'A measure of the shear modulus of elasticity of the material.' },
      { name: 'ShearStrength', type: 'IfcReal', description: 'α;shear strength.' },
      { name: 'TensileStrength', type: 'IfcReal', description: 'Indicates the ability to withstand breakage apart under applied force.' },
      { name: 'YoungModulusBending', type: 'IfcReal', description: 'α;elastic modulus in bending.' },
      { name: 'YoungModulusCompression', type: 'IfcReal', description: 'Elastic modulus in compression.' },
      { name: 'YoungModulusTension', type: 'IfcReal', description: 'α;elastic modulus in tension.' },
    ],
  },

  'Pset_MechanicalPanelOutOfPlane': {
    label:       'Property Set: Mechanical Panel Out Of Plane',
    description: 'Properties for Mechanica lPanels Out Of Plane.',
    applicableTo: ['IFCMATERIAL'],
    props: [
      { name: 'BearingStrength', type: 'IfcReal', description: 'α;bearing strength of bolt holes, i.e. intrados pressure.' },
      { name: 'BendingStrength', type: 'IfcReal', description: 'Bending strength.' },
      { name: 'CompressiveStrength', type: 'IfcReal', description: 'The compressive strength of the object or material.' },
      { name: 'RaisedCompressiveStrength', type: 'IfcReal', description: 'Alternative value for compressive strength which may be used under material and code dependent conditions (e.g. if defor' },
      { name: 'ReferenceDepth', type: 'IfcReal', description: 'Depth in bending for which the mechanical properties are valid; provided as a means to check the integrity of material a' },
      { name: 'ShearModulus', type: 'IfcReal', description: 'A measure of the shear modulus of elasticity of the material.' },
      { name: 'ShearStrength', type: 'IfcReal', description: 'α;shear strength.' },
      { name: 'TensileStrength', type: 'IfcReal', description: 'Indicates the ability to withstand breakage apart under applied force.' },
      { name: 'YoungModulusBending', type: 'IfcReal', description: 'α;elastic modulus in bending.' },
      { name: 'YoungModulusCompression', type: 'IfcReal', description: 'Elastic modulus in compression.' },
      { name: 'YoungModulusTension', type: 'IfcReal', description: 'α;elastic modulus in tension.' },
    ],
  },

  'Pset_MechanicalPanelOutOfPlaneNegative': {
    label:       'Property Set: Mechanical Panel Out Of Plane Negative',
    description: 'Properties for Mechanical Panels Out Of Plane Negative.',
    applicableTo: ['IFCMATERIAL'],
    props: [
      { name: 'BearingStrength', type: 'IfcReal', description: 'α;bearing strength of bolt holes, i.e. intrados pressure.' },
      { name: 'BendingStrength', type: 'IfcReal', description: 'Bending strength.' },
      { name: 'CompressiveStrength', type: 'IfcReal', description: 'The compressive strength of the object or material.' },
      { name: 'RaisedCompressiveStrength', type: 'IfcReal', description: 'Alternative value for compressive strength which may be used under material and code dependent conditions (e.g. if defor' },
      { name: 'ReferenceDepth', type: 'IfcReal', description: 'Depth in bending for which the mechanical properties are valid; provided as a means to check the integrity of material a' },
      { name: 'ShearModulus', type: 'IfcReal', description: 'A measure of the shear modulus of elasticity of the material.' },
      { name: 'ShearStrength', type: 'IfcReal', description: 'α;shear strength.' },
      { name: 'TensileStrength', type: 'IfcReal', description: 'Indicates the ability to withstand breakage apart under applied force.' },
      { name: 'YoungModulusBending', type: 'IfcReal', description: 'α;elastic modulus in bending.' },
      { name: 'YoungModulusCompression', type: 'IfcReal', description: 'Elastic modulus in compression.' },
      { name: 'YoungModulusTension', type: 'IfcReal', description: 'α;elastic modulus in tension.' },
    ],
  },

  'Pset_MedicalDeviceTypeCommon': {
    label:       'Property Set: Medical Device Type Common',
    description: 'Medical device type common attributes.',
    applicableTo: ['IFCMEDICALDEVICE', 'IFCMEDICALDEVICEAIRSTATION', 'IFCMEDICALDEVICEFEEDAIRUNIT', 'IFCMEDICALDEVICEOXYGENGENERATOR', 'IFCMEDICALDEVICEOXYGENPLANT', 'IFCMEDICALDEVICEVACUUMSTATION'],
    props: [
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_MemberCommon': {
    label:       'Property Set: Member Common',
    description: 'Properties common to the definition of all occurrences of [[IfcMember]].',
    applicableTo: ['IFCMEMBER', 'IFCMEMBERARCH_SEGMENT', 'IFCMEMBERBRACE', 'IFCMEMBERCHORD', 'IFCMEMBERCOLLAR', 'IFCMEMBERMEMBER', 'IFCMEMBERMULLION', 'IFCMEMBERPLATE', 'IFCMEMBERPOST', 'IFCMEMBERPURLIN', 'IFCMEMBERRAFTER', 'IFCMEMBERSTAY_CABLE', 'IFCMEMBERSTIFFENING_RIB', 'IFCMEMBERSTRINGER', 'IFCMEMBERSTRUCTURALCABLE', 'IFCMEMBERSTRUT', 'IFCMEMBERSTUD', 'IFCMEMBERSUSPENDER', 'IFCMEMBERSUSPENSION_CABLE', 'IFCMEMBERTIEBAR'],
    props: [
      { name: 'FireRating', type: 'IfcLabel', description: 'Fire rating for this object. It is given according to the national fire safety classification.' },
      { name: 'IsExternal', type: 'IfcBoolean', description: 'Indication whether the element is designed for use in the exterior (TRUE) or not (FALSE). If (TRUE) it is an external el' },
      { name: 'LoadBearing', type: 'IfcBoolean', description: 'Indicates whether the object is intended to carry loads (TRUE) or not (FALSE).' },
      { name: 'Roll', type: 'IfcReal', description: 'Rotation against the longitudinal axis.' },
      { name: 'Slope', type: 'IfcReal', description: 'Slope angle - relative to horizontal (0.0 degrees).The shape information is provided in addition to the shape representa' },
      { name: 'Span', type: 'IfcReal', description: 'Clear span for this object.The shape information is provided in addition to the shape representation and the geometric p' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'ThermalTransmittance', type: 'IfcReal', description: 'Thermal transmittance coefficient (U-Value) of an element, within the direction of the thermal flow (including all mater' },
    ],
  },

  'Pset_MemberTypeAnchoringBar': {
    label:       'Property Set: Member Type Anchoring Bar',
    description: 'Properties of anchoring bar. The anchoring bar is used to connect stay from pole to the foundation.',
    applicableTo: ['IFCMEMBERBRACE'],
    props: [
      { name: 'HasLightningRod', type: 'IfcBoolean', description: 'Indicates whether the element is equipped with a lightning rod (TRUE) or not (FALSE).' },
      { name: 'MechanicalStressType', type: 'IfcLabel', description: 'Indicates which type of stress is applied to the element.' },
    ],
  },

  'Pset_MemberTypeCatenaryStay': {
    label:       'Property Set: Member Type Catenary Stay',
    description: 'Properties of catenary stay used in railway. The property set can be used by the predefined type STAY_CABLE of [[IfcMember]].',
    applicableTo: ['IFCMEMBERSTAY_CABLE'],
    props: [
      { name: 'AssemblyInstruction', type: 'IfcTimeSeries', description: 'Instructions to describe how the system / equipment / facility is assembled.' },
      { name: 'CatenaryStayType', type: 'IfcLabel', description: 'Indicates the type of catenary stay used.' },
      { name: 'NominalHeight', type: 'IfcReal', description: 'The nominal height of the object. The size information is provided in addition to the shape representation and the geome' },
      { name: 'NominalLength', type: 'IfcReal', description: 'The nominal overall length of the object. The size information is provided in addition to the shape representation and t' },
    ],
  },

  'Pset_MemberTypeOCSRigidSupport': {
    label:       'Property Set: Member Type Ocsrigid Support',
    description: 'Properties of rigid catenary support used in railway overhead contact system.',
    applicableTo: ['IFCMEMBERMEMBER'],
    props: [
      { name: 'AssemblyInstruction', type: 'IfcTimeSeries', description: 'Instructions to describe how the system / equipment / facility is assembled.' },
      { name: 'ContactWireStagger', type: 'IfcReal', description: 'Lateral displacement of the contact wire to opposite sides of the track centre at successive supports.' },
    ],
  },

  'Pset_MemberTypePost': {
    label:       'Property Set: Member Type Post',
    description: 'Properties of a post. A post is a linear (usually vertical) member used to support something or to mark a point.',
    applicableTo: ['IFCMEMBERPOST'],
    props: [
      { name: 'BendingStrength', type: 'IfcReal', description: 'Bending strength.' },
      { name: 'ConicityRatio', type: 'IfcReal', description: 'The ratio of the diameter of the cone bottom surface to the height of the pole.' },
      { name: 'LoadBearingCapacity', type: 'IfcReal', description: 'Maximum load bearing capacity of the floor structure throughtout the storey as designed.' },
      { name: 'NominalHeight', type: 'IfcReal', description: 'The nominal height of the object. The size information is provided in addition to the shape representation and the geome' },
      { name: 'TorsionalStrength', type: 'IfcReal', description: 'Shear strength in torsion.' },
      { name: 'WindLoadRating', type: 'IfcLabel', description: 'Wind load resistance rating for this object.; It is provided according to the national building code.' },
    ],
  },

  'Pset_MemberTypeTieBar': {
    label:       'Property Set: Member Type Tie Bar',
    description: 'Properties of tie bar. A tie bar is a linear bar element used to secure or stabilise a structure by resisting lateral and longitudinal loading through tension and or compression. u',
    applicableTo: ['IFCMEMBERTIEBAR'],
    props: [
      { name: 'IsTemporaryInstallation', type: 'IfcBoolean', description: 'Indicates whether the installation (in the construction stage) is permanent (TRUE) or temporary (FALSE)' },
    ],
  },

  'Pset_MobileTeleCommunicationsApplianceTypeRemoteRa': {
    label:       'Property Set: Mobile Tele Communications Appliance Type Remote Radio Unit',
    description: 'Properties common to the definition of all occurrences of [[IfcMobileTelecommunicationsAppliance]] and types of IfcMobileTelecommunicationsApplianceType with the predefined type se',
    applicableTo: ['IFCMOBILETELECOMMUNICATIONSAPPLIANCEREMOTERADIOUNI'],
    props: [
    ],
  },

  'Pset_MobileTelecommunicationsApplianceTypeAccessPo': {
    label:       'Property Set: Mobile Telecommunications Appliance Type Access Point',
    description: 'Properties common to the definition of all occurrences of [[IfcMobileTelecommunicationsAppliance]] and types of IfcMobileTelecommunicationsApplianceType with the predefined type se',
    applicableTo: ['IFCMOBILETELECOMMUNICATIONSAPPLIANCEACCESSPOINT'],
    props: [
    ],
  },

  'Pset_MobileTelecommunicationsApplianceTypeBaseTran': {
    label:       'Property Set: Mobile Telecommunications Appliance Type Base Transceiver Station',
    description: 'Properties common to the definition of all occurrences of [[IfcMobileTelecommunicationsAppliance]] and types of IfcMobileTelecommunicationsApplianceType with the predefined type se',
    applicableTo: ['IFCMOBILETELECOMMUNICATIONSAPPLIANCEBASETRANSCEIVE'],
    props: [
    ],
  },

  'Pset_MobileTelecommunicationsApplianceTypeBaseband': {
    label:       'Property Set: Mobile Telecommunications Appliance Type Baseband Unit',
    description: 'Properties common to the definition of all occurrences of [[IfcMobileTelecommunicationsAppliance]] and types of IfcMobileTelecommunicationsApplianceType with the predefined type se',
    applicableTo: ['IFCMOBILETELECOMMUNICATIONSAPPLIANCEBASEBANDUNIT'],
    props: [
    ],
  },

  'Pset_MobileTelecommunicationsApplianceTypeCommon': {
    label:       'Property Set: Mobile Telecommunications Appliance Type Common',
    description: 'Properties common to the definition of all occurrences of [[IfcMobileTelecommunicationsAppliance]] and types of IfcMobileTelecommunicationsApplianceType.',
    applicableTo: ['IFCMOBILETELECOMMUNICATIONSAPPLIANCE', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCEACCESSPOINT', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCEBASEBANDUNIT', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCEBASETRANSCEIVE', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCEE_UTRAN_NODE_B', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCEGATEWAY_GPRS_S', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCEMASTERUNIT', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCEMOBILESWITCHIN', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCEMSCSERVER', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCEPACKETCONTROLU', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCEREMOTERADIOUNI', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCEREMOTEUNIT', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCESERVICE_GPRS_S', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCESUBSCRIBERSERV'],
    props: [
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_MobileTelecommunicationsApplianceTypeEUtranNo': {
    label:       'Property Set: Mobile Telecommunications Appliance Type Eutran Node B',
    description: 'Properties common to the definition of all occurrences of [[IfcMobileTelecommunicationsAppliance]] and types of IfcMobileTelecommunicationsApplianceType with the predefined type se',
    applicableTo: ['IFCMOBILETELECOMMUNICATIONSAPPLIANCEE_UTRAN_NODE_B'],
    props: [
    ],
  },

  'Pset_MobileTelecommunicationsApplianceTypeMSCServe': {
    label:       'Property Set: Mobile Telecommunications Appliance Type Mscserver',
    description: 'Properties common to the definition of all occurrences of [[IfcMobileTelecommunicationsAppliance]] and types of IfcMobileTelecommunicationsApplianceType with the predefined type se',
    applicableTo: ['IFCMOBILETELECOMMUNICATIONSAPPLIANCEMSCSERVER'],
    props: [
    ],
  },

  'Pset_MobileTelecommunicationsApplianceTypeMasterUn': {
    label:       'Property Set: Mobile Telecommunications Appliance Type Master Unit',
    description: 'Properties common to the definition of all occurrences of [[IfcMobileTelecommunicationsAppliance]] and types of IfcMobileTelecommunicationsApplianceType with the predefined type se',
    applicableTo: ['IFCMOBILETELECOMMUNICATIONSAPPLIANCEMASTERUNIT'],
    props: [
    ],
  },

  'Pset_MobileTelecommunicationsApplianceTypeMobileSw': {
    label:       'Property Set: Mobile Telecommunications Appliance Type Mobile Switching Center',
    description: 'Properties common to the definition of all occurrences of [[IfcMobileTelecommunicationsAppliance]] and types of IfcMobileTelecommunicationsApplianceType with the predefined type se',
    applicableTo: ['IFCMOBILETELECOMMUNICATIONSAPPLIANCEMOBILESWITCHIN'],
    props: [
    ],
  },

  'Pset_MobileTelecommunicationsApplianceTypeRemoteUn': {
    label:       'Property Set: Mobile Telecommunications Appliance Type Remote Unit',
    description: 'Properties common to the definition of all occurrences of [[IfcMobileTelecommunicationsAppliance]] and types of IfcMobileTelecommunicationsApplianceType with the predefined type se',
    applicableTo: ['IFCMOBILETELECOMMUNICATIONSAPPLIANCEREMOTEUNIT'],
    props: [
    ],
  },

  'Pset_MooringDeviceCommon': {
    label:       'Property Set: Mooring Device Common',
    description: 'Properties common to the definition of all occurrences of [[IfcMooringDevice]] and types of IfcMooringDeviceType.',
    applicableTo: ['IFCMOORINGDEVICE', 'IFCMOORINGDEVICEBOLLARD', 'IFCMOORINGDEVICELINETENSIONER', 'IFCMOORINGDEVICEMAGNETICDEVICE', 'IFCMOORINGDEVICEMOORINGHOOKS', 'IFCMOORINGDEVICEVACUUMDEVICE'],
    props: [
      { name: 'AnchorageType', type: 'IfcLabel', description: 'Mooring device anchorage type' },
      { name: 'DeviceCapacity', type: 'IfcReal', description: 'Mooring device force capacity' },
      { name: 'DeviceType', type: 'IfcLabel', description: 'Mooring device type' },
      { name: 'MaximumLineCount', type: 'IfcInteger', description: 'Maximum number of lines that may be secured to the mooring device.' },
      { name: 'MaximumLineSlope', type: 'IfcReal', description: 'Maximum allowable line angle in degrees (negative if below horizontal from quay)' },
      { name: 'MinumumLineSlope', type: 'IfcReal', description: 'Minimum allowable line angle in degrees (negative if below horizontal from quay)' },
    ],
  },

  'Pset_MotorConnectionTypeCommon': {
    label:       'Property Set: Motor Connection Type Common',
    description: 'Common properties for motor connections.',
    applicableTo: ['IFCMOTORCONNECTION', 'IFCMOTORCONNECTIONBELTDRIVE', 'IFCMOTORCONNECTIONCOUPLING', 'IFCMOTORCONNECTIONDIRECTDRIVE'],
    props: [
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_OnSiteCastKerb': {
    label:       'Property Set: On Site Cast Kerb',
    description: 'Properties for an on site cast kerb.',
    applicableTo: ['IFCKERB'],
    props: [
      { name: 'NominalHeight', type: 'IfcReal', description: 'The nominal height of the object. The size information is provided in addition to the shape representation and the geome' },
      { name: 'NominalWidth', type: 'IfcReal', description: 'The nominal overall width of the object. The size information is provided in addition to the shape representation and th' },
    ],
  },

  'Pset_OnSiteTelecomControlUnit': {
    label:       'Property Set: On Site Telecom Control Unit',
    description: 'Properties for on-site telecom control unit used for railway.',
    applicableTo: ['IFCCONTROLLER', 'IFCCONTROLLERFLOATING', 'IFCCONTROLLERMULTIPOSITION', 'IFCCONTROLLERPROGRAMMABLE', 'IFCCONTROLLERPROPORTIONAL', 'IFCCONTROLLERTWOPOSITION'],
    props: [
      { name: 'ControllerInterfaceType', type: 'IfcLabel', description: 'Indicates the type of serial interface used by the device.' },
      { name: 'HasEarthquakeAlarm', type: 'IfcBoolean', description: 'Indicates whether the on-site control unit includes earthquake alarm function.' },
      { name: 'HasEarthquakeCollection', type: 'IfcBoolean', description: 'Indicates whether the on-site control unit collects earthquake information.' },
      { name: 'HasForeignObjectCollection', type: 'IfcBoolean', description: 'Indicates whether the on-site control unit collects foreign object information.' },
      { name: 'HasOutputFunction', type: 'IfcBoolean', description: 'Indicates whether the on-site control unit includes an output function.' },
      { name: 'HasRainCollection', type: 'IfcBoolean', description: 'Indicates whether the on-site control unit collects information on rain.' },
      { name: 'HasSnowCollection', type: 'IfcBoolean', description: 'Indicates whether the on-site control unit collects information on snow depth.' },
      { name: 'HasWindCollection', type: 'IfcBoolean', description: 'Indicates whether the on-site control unit collects information on wind.' },
    ],
  },

  'Pset_OpeningElementCommon': {
    label:       'Property Set: Opening Element Common',
    description: 'Properties common to the definition of all instances of [[IfcOpeningElement]].',
    applicableTo: ['IFCOPENINGELEMENT', 'IFCOPENINGELEMENTOPENING', 'IFCOPENINGELEMENTRECESS'],
    props: [
      { name: 'AcousticRating', type: 'IfcLabel', description: 'Acoustic rating for this object.; It is provided according to the national building code. It indicates the sound transmi' },
      { name: 'FireExit', type: 'IfcBoolean', description: 'Indication whether this object is designed to serve as an exit in the case of fire (TRUE) or not (FALSE).' },
      { name: 'FireRating', type: 'IfcLabel', description: 'Fire rating for this object. It is given according to the national fire safety classification.' },
      { name: 'Purpose', type: 'IfcLabel', description: 'Indication of the purpose of this object' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_OpticalAdapter': {
    label:       'Property Set: Optical Adapter',
    description: 'Properties in this property set are applicable to the transition type of cable fitting. Indicated that such transition is an optical adapter.',
    applicableTo: ['IFCCABLEFITTINGTRANSITION'],
    props: [
      { name: 'FiberType', type: 'IfcLabel', description: 'Indicates the type of the single fiber.' },
    ],
  },

  'Pset_OpticalPigtail': {
    label:       'Property Set: Optical Pigtail',
    description: 'Property set for optical pigtail. This property set is applicable to a type or occurrence of [[IfcCableSegment]] with predefined type OPTICALCABLESEGMENT.',
    applicableTo: ['IFCCABLESEGMENTOPTICALCABLESEGMENT'],
    props: [
      { name: 'ConnectorType', type: 'IfcLabel', description: 'Indicates the type of connector.' },
      { name: 'FiberType', type: 'IfcLabel', description: 'Indicates the type of the single fiber.' },
      { name: 'JacketColour', type: 'IfcLabel', description: 'Indicates the colour of the cable or fitting jacket.' },
    ],
  },

  'Pset_OpticalSplitter': {
    label:       'Property Set: Optical Splitter',
    description: 'Properties of optical splitter used in the telecommunication domain. This property set can be used by the predefined type [[DATA]] of [[IfcJunctionBox]].',
    applicableTo: ['IFCJUNCTIONBOXDATA'],
    props: [
      { name: 'NumberOfBranches', type: 'IfcInteger', description: 'Indicates the number of branches that can be supported by the optical splitter.' },
      { name: 'NumberOfInterfaces', type: 'IfcInteger', description: 'Indicates the types of interfaces and their number in the device.' },
      { name: 'OpticalSplitterType', type: 'IfcLabel', description: 'Indicates the type of optical splitter, single mode or multi-mode.' },
    ],
  },

  'Pset_OutletTypeCommon': {
    label:       'Property Set: Outlet Type Common',
    description: 'Common properties for different outlet types.',
    applicableTo: ['IFCOUTLET', 'IFCOUTLETAUDIOVISUALOUTLET', 'IFCOUTLETCOMMUNICATIONSOUTLET', 'IFCOUTLETDATAOUTLET', 'IFCOUTLETPOWEROUTLET', 'IFCOUTLETTELEPHONEOUTLET'],
    props: [
      { name: 'IsPluggableOutlet', type: 'IfcValue', description: 'Indication of whether the outlet accepts a loose plug connection (= TRUE) or whether it is directly connected (= FALSE)' },
      { name: 'NumberOfSockets', type: 'IfcInteger', description: 'The number of sockets that may be connected. In case of inconsistency, sockets defined on ports take precedence.' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_OutsideDesignCriteria': {
    label:       'Property Set: Outside Design Criteria',
    description: 'Outside air conditions used as the basis for calculating thermal loads at peak conditions, as well as the weather data location from which these conditions were obtained.',
    applicableTo: ['IFCBUILDING'],
    props: [
      { name: 'BuildingThermalExposure', type: 'IfcLabel', description: 'The thermal exposure expected by the building based on surrounding site conditions.' },
      { name: 'CoolingDesignDay', type: 'IfcLabel', description: 'The month, day and time that has been selected for the cooling design calculations.' },
      { name: 'CoolingDryBulb', type: 'IfcReal', description: 'Dry bulb temperature, usually for for cooling design.' },
      { name: 'CoolingWetBulb', type: 'IfcReal', description: 'Outside wet bulb temperature for cooling design.' },
      { name: 'HeatingDesignDay', type: 'IfcLabel', description: 'The month, day and time that has been selected for the heating design calculations.' },
      { name: 'HeatingDryBulb', type: 'IfcReal', description: 'Dry bulb temperature for heating design.' },
      { name: 'HeatingWetBulb', type: 'IfcReal', description: 'Outside wet bulb temperature for heating design.' },
      { name: 'PrevailingWindDirection', type: 'IfcReal', description: 'The prevailing wind angle direction measured from True North (0 degrees) in a clockwise direction.' },
      { name: 'PrevailingWindVelocity', type: 'IfcReal', description: 'The design wind velocity coming from the direction specified by the PrevailingWindDirection attribute.' },
      { name: 'WeatherDataDate', type: 'IfcLabel', description: 'The date for which the weather data was gathered.' },
      { name: 'WeatherDataStation', type: 'IfcLabel', description: 'The site weather data station description or reference to the data source from which weather data was obtained for use i' },
    ],
  },

  'Pset_PackingInstructions': {
    label:       'Property Set: Packing Instructions',
    description: 'Packing instructions are specific instructions relating to the packing that is required for an artifact in the event of a move (or transport).',
    applicableTo: ['IFCTASKMOVE'],
    props: [
      { name: 'ContainerMaterial', type: 'IfcTimeSeries', description: 'Special requirements for material used to contain an artefact.' },
      { name: 'PackingCareType', type: 'IfcLabel', description: 'artefact may be broken during a move through careless handling.;artefact may be damaged during a move through careless h' },
      { name: 'SpecialInstructions', type: 'IfcLabel', description: 'Special instructions.' },
      { name: 'WrappingMaterial', type: 'IfcTimeSeries', description: 'Special requirements for material used to wrap an artefact.' },
    ],
  },

  'Pset_PatchCordCable': {
    label:       'Property Set: Patch Cord Cable',
    description: 'This property set has properties that are applicable to cable segment and optical cable segment, indicated that the cable is a patch cord cable, which is fitted with connectors at',
    applicableTo: ['IFCCABLESEGMENTCABLESEGMENT', 'IFCCABLESEGMENTOPTICALCABLESEGMENT'],
    props: [
      { name: 'JacketColour', type: 'IfcLabel', description: 'Indicates the colour of the cable or fitting jacket.' },
    ],
  },

  'Pset_PavementCommon': {
    label:       'Property Set: Pavement Common',
    description: 'Describes the common properties and nominal dimensions of pavement.',
    applicableTo: ['IFCPAVEMENT', 'IFCPAVEMENTFLEXIBLE', 'IFCPAVEMENTRIGID'],
    props: [
      { name: 'NominalLength', type: 'IfcReal', description: 'The nominal overall length of the object. The size information is provided in addition to the shape representation and t' },
      { name: 'NominalThickness', type: 'IfcReal', description: 'The nominal thickness of the object. The size information is provided in addition to the shape representation and the ge' },
      { name: 'NominalThicknessEnd', type: 'IfcReal', description: 'The nominal thickness of the object after a transition from its original value. The size information is provided in addi' },
      { name: 'NominalWidth', type: 'IfcReal', description: 'The nominal overall width of the object. The size information is provided in addition to the shape representation and th' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'StructuralSlope', type: 'IfcReal', description: 'The nominal side slope (allowable steepness) of the pavement structure (not including side slope fill) as a positive rat' },
      { name: 'StructuralSlopeType', type: 'IfcLabel', description: 'User defined description on the type of slope used for the pavement structure (not including side slope fill) . Examples' },
    ],
  },

  'Pset_PavementMillingCommon': {
    label:       'Property Set: Pavement Milling Common',
    description: 'Properties for pavement milling.',
    applicableTo: ['IFCEARTHWORKSCUTPAVEMENTMILLING'],
    props: [
      { name: 'NominalDepth', type: 'IfcReal', description: 'Nominal Depth of the object' },
      { name: 'NominalWidth', type: 'IfcReal', description: 'The nominal overall width of the object. The size information is provided in addition to the shape representation and th' },
    ],
  },

  'Pset_PavementSurfaceCommon': {
    label:       'Property Set: Pavement Surface Common',
    description: 'Properties for a pavement surface.',
    applicableTo: ['IFCPAVEMENT', 'IFCPAVEMENTFLEXIBLE', 'IFCPAVEMENTRIGID'],
    props: [
      { name: 'PavementRoughness', type: 'IfcReal', description: 'An assessment of the functional condition of the pavement surface indicated as an index according to the International R' },
      { name: 'PavementTexture', type: 'IfcReal', description: 'Characterization of pavement texture by mean profile depth' },
    ],
  },

  'Pset_PermeableCoveringProperties': {
    label:       'Property Set: Permeable Covering Properties',
    description: 'Properties of the permeable covering.',
    applicableTo: ['IFCDOOR', 'IFCDOORBOOM_BARRIER', 'IFCDOORDOOR', 'IFCDOORGATE', 'IFCDOORTRAPDOOR', 'IFCDOORTURNSTILE', 'IFCMEMBER', 'IFCMEMBERARCH_SEGMENT', 'IFCMEMBERBRACE', 'IFCMEMBERCHORD', 'IFCMEMBERCOLLAR', 'IFCMEMBERMEMBER', 'IFCMEMBERMULLION', 'IFCMEMBERPLATE', 'IFCMEMBERPOST', 'IFCMEMBERPURLIN', 'IFCMEMBERRAFTER', 'IFCMEMBERSTAY_CABLE', 'IFCMEMBERSTIFFENING_RIB', 'IFCMEMBERSTRINGER', 'IFCMEMBERSTRUCTURALCABLE', 'IFCMEMBERSTRUT', 'IFCMEMBERSTUD', 'IFCMEMBERSUSPENDER', 'IFCMEMBERSUSPENSION_CABLE', 'IFCMEMBERTIEBAR', 'IFCWINDOW', 'IFCWINDOWLIGHTDOME', 'IFCWINDOWSKYLIGHT', 'IFCWINDOWWINDOW'],
    props: [
      { name: 'FrameDepth', type: 'IfcReal', description: 'The length (or depth) of the frame.' },
      { name: 'FrameThickness', type: 'IfcReal', description: 'The thickness of the frame.' },
      { name: 'OperationType', type: 'IfcLabel', description: 'Type of operations. Also used to assign standard symbolic presentations according to national building standards.' },
      { name: 'PanelPosition', type: 'IfcLabel', description: 'Position of the panel.' },
    ],
  },

  'Pset_Permit': {
    label:       'Property Set: Permit',
    description: 'A permit is a document that allows permission to gain access to an area or carry out work in a situation where security or other access restrictions apply.;',
    applicableTo: ['IFCPERMIT', 'IFCPERMITACCESS', 'IFCPERMITBUILDING', 'IFCPERMITWORK'],
    props: [
      { name: 'EndDate', type: 'IfcLabel', description: 'Date and time at which the permit ceases to be valid.' },
      { name: 'EscortRequirement', type: 'IfcBoolean', description: 'Indicates whether or not an escort is required to accompany persons carrying out a work order at or to/from the place of' },
      { name: 'SpecialRequirements', type: 'IfcLabel', description: 'Any additional special requirements that need to be included in the permit to work.' },
      { name: 'StartDate', type: 'IfcLabel', description: 'Date and time from which the permit becomes valid.' },
    ],
  },

  'Pset_PileCommon': {
    label:       'Property Set: Pile Common',
    description: 'Properties common to the definition of all occurrences of [[IfcPile]].',
    applicableTo: ['IFCPILE', 'IFCPILEBORED', 'IFCPILECOHESION', 'IFCPILEDRIVEN', 'IFCPILEFRICTION', 'IFCPILEJETGROUTING', 'IFCPILESUPPORT'],
    props: [
      { name: 'LoadBearing', type: 'IfcBoolean', description: 'Indicates whether the object is intended to carry loads (TRUE) or not (FALSE).' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_PipeConnectionFlanged': {
    label:       'Property Set: Pipe Connection Flanged',
    description: 'This property set is used to define the specifics of a flanged pipe connection used between occurrences of pipe segments and fittings.',
    applicableTo: ['IFCPIPESEGMENT', 'IFCPIPESEGMENTCULVERT', 'IFCPIPESEGMENTFLEXIBLESEGMENT', 'IFCPIPESEGMENTGUTTER', 'IFCPIPESEGMENTRIGIDSEGMENT', 'IFCPIPESEGMENTSPOOL'],
    props: [
      { name: 'BoltholePitch', type: 'IfcReal', description: 'Diameter of the circle along which the boltholes are placed.' },
      { name: 'BoltSize', type: 'IfcReal', description: 'Size of the bolts securing the flange.' },
      { name: 'BoreSize', type: 'IfcReal', description: 'The nominal bore of the pipe flange.' },
      { name: 'FlangeDiameter', type: 'IfcReal', description: 'Overall diameter of the flange.' },
      { name: 'FlangeStandard', type: 'IfcLabel', description: 'Designation of the standard describing the flange table.' },
      { name: 'FlangeTable', type: 'IfcLabel', description: 'Designation of the standard table to which the flange conforms.' },
      { name: 'FlangeThickness', type: 'IfcReal', description: 'Thickness of the material from which the pipe bend is constructed.' },
      { name: 'NumberOfBoltholes', type: 'IfcInteger', description: 'Number of boltholes in the flange.' },
    ],
  },

  'Pset_PipeFittingOccurrence': {
    label:       'Property Set: Pipe Fitting Occurrence',
    description: 'Pipe segment occurrence attributes attached to an instance of [[IfcPipeSegment]].',
    applicableTo: ['IFCPIPEFITTING', 'IFCPIPEFITTINGBEND', 'IFCPIPEFITTINGCONNECTOR', 'IFCPIPEFITTINGENTRY', 'IFCPIPEFITTINGEXIT', 'IFCPIPEFITTINGJUNCTION', 'IFCPIPEFITTINGOBSTRUCTION', 'IFCPIPEFITTINGTRANSITION'],
    props: [
      { name: 'Colour', type: 'IfcLabel', description: 'Colour of this object.' },
      { name: 'InteriorRoughnessCoefficient', type: 'IfcReal', description: 'The interior roughness of the material of the object.' },
    ],
  },

  'Pset_PipeFittingPHistory': {
    label:       'Property Set: Pipe Fitting Phistory',
    description: 'Pipe fitting performance history common attributes.',
    applicableTo: ['IFCPIPEFITTING', 'IFCPIPEFITTINGBEND', 'IFCPIPEFITTINGCONNECTOR', 'IFCPIPEFITTINGENTRY', 'IFCPIPEFITTINGEXIT', 'IFCPIPEFITTINGJUNCTION', 'IFCPIPEFITTINGOBSTRUCTION', 'IFCPIPEFITTINGTRANSITION'],
    props: [
      { name: 'FlowrateLeakage', type: 'IfcTimeSeries', description: 'Leakage flowrate versus pressure difference.' },
      { name: 'LossCoefficient', type: 'IfcTimeSeries', description: 'Dimensionless loss coefficient used for calculating fluid resistance representing the ratio of total pressure loss to ve' },
    ],
  },

  'Pset_PipeFittingTypeCommon': {
    label:       'Property Set: Pipe Fitting Type Common',
    description: 'Pipe fitting type common attributes.',
    applicableTo: ['IFCPIPEFITTING', 'IFCPIPEFITTINGBEND', 'IFCPIPEFITTINGCONNECTOR', 'IFCPIPEFITTINGENTRY', 'IFCPIPEFITTINGEXIT', 'IFCPIPEFITTINGJUNCTION', 'IFCPIPEFITTINGOBSTRUCTION', 'IFCPIPEFITTINGTRANSITION'],
    props: [
      { name: 'FittingLossFactor', type: 'IfcReal', description: 'A factor that determines the pressure loss due to friction through the fitting.' },
      { name: 'PressureClass', type: 'IfcReal', description: 'Nominal pressure rating of the object.' },
      { name: 'PressureRange', type: 'IfcReal', description: 'Allowable maximum and minimum working pressure (relative to ambient pressure).' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'TemperatureRange', type: 'IfcReal', description: 'Allowable maximum and minimum temperature.' },
    ],
  },

  'Pset_PipeSegmentOccurrence': {
    label:       'Property Set: Pipe Segment Occurrence',
    description: 'Pipe segment occurrence attributes attached to an instance of [[IfcPipeSegment]].',
    applicableTo: ['IFCPIPESEGMENT', 'IFCPIPESEGMENTCULVERT', 'IFCPIPESEGMENTFLEXIBLESEGMENT', 'IFCPIPESEGMENTGUTTER', 'IFCPIPESEGMENTRIGIDSEGMENT', 'IFCPIPESEGMENTSPOOL'],
    props: [
      { name: 'Colour', type: 'IfcLabel', description: 'Colour of this object.' },
      { name: 'Gradient', type: 'IfcReal', description: 'The gradient of the pipe segment.' },
      { name: 'InteriorRoughnessCoefficient', type: 'IfcReal', description: 'The interior roughness of the material of the object.' },
      { name: 'InvertElevation', type: 'IfcReal', description: 'The invert elevation relative to the datum established for the project.' },
    ],
  },

  'Pset_PipeSegmentPHistory': {
    label:       'Property Set: Pipe Segment Phistory',
    description: 'Pipe segment performance history common attributes.',
    applicableTo: ['IFCPIPESEGMENT', 'IFCPIPESEGMENTCULVERT', 'IFCPIPESEGMENTFLEXIBLESEGMENT', 'IFCPIPESEGMENTGUTTER', 'IFCPIPESEGMENTRIGIDSEGMENT', 'IFCPIPESEGMENTSPOOL'],
    props: [
      { name: 'FluidFlowLeakage', type: 'IfcTimeSeries', description: 'Volumetric leakage flow rate.' },
      { name: 'LeakageCurve', type: 'IfcReal', description: 'Leakage versus pressure drop; Leakage = f (pressure).' },
    ],
  },

  'Pset_PipeSegmentTypeCommon': {
    label:       'Property Set: Pipe Segment Type Common',
    description: 'Pipe segment type common attributes.',
    applicableTo: ['IFCPIPESEGMENT', 'IFCPIPESEGMENTCULVERT', 'IFCPIPESEGMENTFLEXIBLESEGMENT', 'IFCPIPESEGMENTGUTTER', 'IFCPIPESEGMENTRIGIDSEGMENT', 'IFCPIPESEGMENTSPOOL'],
    props: [
      { name: 'InnerDiameter', type: 'IfcReal', description: 'The actual inner diameter of the object.' },
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
      { name: 'NominalDiameter', type: 'IfcReal', description: 'Nominal diameter or width of the object.' },
      { name: 'OuterDiameter', type: 'IfcReal', description: 'The actual outer diameter of the object.' },
      { name: 'PressureRange', type: 'IfcReal', description: 'Allowable maximum and minimum working pressure (relative to ambient pressure).' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'TemperatureRange', type: 'IfcReal', description: 'Allowable maximum and minimum temperature.' },
      { name: 'WorkingPressure', type: 'IfcReal', description: 'Working pressure.' },
    ],
  },

  'Pset_PipeSegmentTypeCulvert': {
    label:       'Property Set: Pipe Segment Type Culvert',
    description: 'Covered channel or large pipe that forms a watercourse below ground level, usually under a road or railway (BS6100).',
    applicableTo: ['IFCPIPESEGMENTCULVERT'],
    props: [
      { name: 'ClearDepth', type: 'IfcReal', description: 'The clear depth.' },
      { name: 'InternalWidth', type: 'IfcReal', description: 'The internal width of the culvert.' },
    ],
  },

  'Pset_PipeSegmentTypeGutter': {
    label:       'Property Set: Pipe Segment Type Gutter',
    description: 'Gutter segment type common attributes.',
    applicableTo: ['IFCPIPESEGMENTGUTTER'],
    props: [
      { name: 'Complementaryfunction', type: 'IfcLabel', description: 'Indicates the complementary function of the drain channel.' },
      { name: 'FlowRating', type: 'IfcReal', description: 'Actual flow capacity for the gutter. Value of 0.00 means this value has not been set.' },
      { name: 'IsCovered', type: 'IfcBoolean', description: 'This property defines if the drain channel has a cover (TRUE) or not (FALSE).' },
      { name: 'IsMonitored', type: 'IfcBoolean', description: 'This property defines if the Drain Channel is monitored (TRUE) or not (FALSE).' },
      { name: 'OrthometricHeight', type: 'IfcReal', description: 'The orthometric height is the vertical distance H along the plumb line from a point of interest to a reference surface k' },
      { name: 'Slope', type: 'IfcReal', description: 'Slope angle - relative to horizontal (0.0 degrees).The shape information is provided in addition to the shape representa' },
    ],
  },

  'Pset_PlateCommon': {
    label:       'Property Set: Plate Common',
    description: 'Properties common to the definition of all occurrences of [[IfcPlate]].',
    applicableTo: ['IFCPLATE', 'IFCPLATEBASE_PLATE', 'IFCPLATECOVER_PLATE', 'IFCPLATECURTAIN_PANEL', 'IFCPLATEFLANGE_PLATE', 'IFCPLATEGUSSET_PLATE', 'IFCPLATESHEET', 'IFCPLATESPLICE_PLATE', 'IFCPLATESTIFFENER_PLATE', 'IFCPLATEWEB_PLATE'],
    props: [
      { name: 'AcousticRating', type: 'IfcLabel', description: 'Acoustic rating for this object.; It is provided according to the national building code. It indicates the sound transmi' },
      { name: 'FireRating', type: 'IfcLabel', description: 'Fire rating for this object. It is given according to the national fire safety classification.' },
      { name: 'IsExternal', type: 'IfcBoolean', description: 'Indication whether the element is designed for use in the exterior (TRUE) or not (FALSE). If (TRUE) it is an external el' },
      { name: 'LoadBearing', type: 'IfcBoolean', description: 'Indicates whether the object is intended to carry loads (TRUE) or not (FALSE).' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'ThermalTransmittance', type: 'IfcReal', description: 'Thermal transmittance coefficient (U-Value) of an element, within the direction of the thermal flow (including all mater' },
    ],
  },

  'Pset_PointMachine': {
    label:       'Property Set: Point Machine',
    description: 'Properties of point machine used in railway. The property set can be used by [[IfcActuator]] with predefined type set to ELECTRICACTUATOR, HYDRAULICACTUATOR, HANDOPERATEDACTUATOR,',
    applicableTo: ['IFCACTUATORELECTRICACTUATOR', 'IFCACTUATORHANDOPERATEDACTUATOR', 'IFCACTUATORHYDRAULICACTUATOR', 'IFCACTUATORPNEUMATICACTUATOR'],
    props: [
      { name: 'ActionBarMovementLength', type: 'IfcReal', description: 'The movement of the bar that pulls the point of a turnout.' },
      { name: 'ConversionTime', type: 'IfcReal', description: 'Turnout conversion completion time.' },
      { name: 'Current', type: 'IfcReal', description: 'The actual current and operable range.' },
      { name: 'HasLockInside', type: 'IfcBoolean', description: 'Indicates whether the locking is inside (TRUE) or outside (FALSE) of the point machine.' },
      { name: 'LockingForce', type: 'IfcReal', description: 'Locking force of the point machine motor.' },
      { name: 'MarkingRodMovementLength', type: 'IfcReal', description: 'The length of the movement bar which indicates the turnout position.' },
      { name: 'MaximumOperatingTime', type: 'IfcReal', description: 'The maximum duration of the turnout movement before the interlocking turns to out of control status.' },
      { name: 'MinimumOperatingSpeed', type: 'IfcReal', description: 'Minimum operating speed of the point machine.' },
      { name: 'TractionForce', type: 'IfcReal', description: 'Traction force of the point machine in turnout conversion.' },
    ],
  },

  'Pset_PowerControlSystem': {
    label:       'Property Set: Power Control System',
    description: 'Properties of power control system. The property set can be used by the predefined type [[ELECTRICAL]] of [[IfcDistributionSystem]]. The property set can be used to characterize th',
    applicableTo: ['IFCDISTRIBUTIONSYSTEMELECTRICAL'],
    props: [
      { name: 'AssemblyInstruction', type: 'IfcTimeSeries', description: 'Instructions to describe how the system / equipment / facility is assembled.' },
    ],
  },

  'Pset_PrecastConcreteElementFabrication': {
    label:       'Property Set: Precast Concrete Element Fabrication',
    description: 'Production and manufacturing related properties common to different types of precast concrete elements. The Pset applies to manufactured pieces. It can be used by a number of subty',
    applicableTo: ['IFCBEAM', 'IFCBEAMBEAM', 'IFCBEAMCORNICE', 'IFCBEAMDIAPHRAGM', 'IFCBEAMEDGEBEAM', 'IFCBEAMGIRDER_SEGMENT', 'IFCBEAMHATSTONE', 'IFCBEAMHOLLOWCORE', 'IFCBEAMJOIST', 'IFCBEAMLINTEL', 'IFCBEAMPIERCAP', 'IFCBEAMSPANDREL', 'IFCBEAMT_BEAM', 'IFCBUILDINGELEMENTPROXY', 'IFCCHIMNEY', 'IFCCOLUMN', 'IFCCOLUMNCOLUMN', 'IFCCOLUMNPIERSTEM', 'IFCCOLUMNPIERSTEM_SEGMENT', 'IFCCOLUMNPILASTER', 'IFCCOLUMNSTANDCOLUMN', 'IFCFOOTING', 'IFCFOOTINGCAISSON_FOUNDATION', 'IFCFOOTINGFOOTING_BEAM', 'IFCFOOTINGPAD_FOOTING', 'IFCFOOTINGPILE_CAP', 'IFCFOOTINGSTRIP_FOOTING', 'IFCMEMBER', 'IFCMEMBERARCH_SEGMENT', 'IFCMEMBERBRACE', 'IFCMEMBERCHORD', 'IFCMEMBERCOLLAR', 'IFCMEMBERMEMBER', 'IFCMEMBERMULLION', 'IFCMEMBERPLATE', 'IFCMEMBERPOST', 'IFCMEMBERPURLIN', 'IFCMEMBERRAFTER', 'IFCMEMBERSTAY_CABLE', 'IFCMEMBERSTIFFENING_RIB', 'IFCMEMBERSTRINGER', 'IFCMEMBERSTRUCTURALCABLE', 'IFCMEMBERSTRUT', 'IFCMEMBERSTUD', 'IFCMEMBERSUSPENDER', 'IFCMEMBERSUSPENSION_CABLE', 'IFCMEMBERTIEBAR', 'IFCPILE', 'IFCPILEBORED', 'IFCPILECOHESION', 'IFCPILEDRIVEN', 'IFCPILEFRICTION', 'IFCPILEJETGROUTING', 'IFCPILESUPPORT', 'IFCPLATE', 'IFCPLATEBASE_PLATE', 'IFCPLATECOVER_PLATE', 'IFCPLATECURTAIN_PANEL', 'IFCPLATEFLANGE_PLATE', 'IFCPLATEGUSSET_PLATE', 'IFCPLATESHEET', 'IFCPLATESPLICE_PLATE', 'IFCPLATESTIFFENER_PLATE', 'IFCPLATEWEB_PLATE', 'IFCRAMP', 'IFCRAMPFLIGHT', 'IFCRAMPFLIGHTSPIRAL', 'IFCRAMPFLIGHTSTRAIGHT', 'IFCRAMPHALF_TURN_RAMP', 'IFCRAMPQUARTER_TURN_RAMP', 'IFCRAMPSPIRAL_RAMP', 'IFCRAMPSTRAIGHT_RUN_RAMP', 'IFCRAMPTWO_QUARTER_TURN_RAMP', 'IFCRAMPTWO_STRAIGHT_RUN_RAMP', 'IFCROOF', 'IFCROOFBARREL_ROOF', 'IFCROOFBUTTERFLY_ROOF', 'IFCROOFDOME_ROOF', 'IFCROOFFLAT_ROOF', 'IFCROOFFREEFORM', 'IFCROOFGABLE_ROOF', 'IFCROOFGAMBREL_ROOF', 'IFCROOFHIPPED_GABLE_ROOF', 'IFCROOFHIP_ROOF', 'IFCROOFMANSARD_ROOF', 'IFCROOFPAVILION_ROOF', 'IFCROOFRAINBOW_ROOF', 'IFCROOFSHED_ROOF', 'IFCSLAB', 'IFCSLABAPPROACH_SLAB', 'IFCSLABBASESLAB', 'IFCSLABFLOOR', 'IFCSLABLANDING', 'IFCSLABPAVING', 'IFCSLABROOF', 'IFCSLABSIDEWALK', 'IFCSLABTRACKSLAB', 'IFCSLABWEARING', 'IFCSTAIR', 'IFCSTAIRCURVED_RUN_STAIR', 'IFCSTAIRDOUBLE_RETURN_STAIR', 'IFCSTAIRFLIGHT', 'IFCSTAIRFLIGHTCURVED', 'IFCSTAIRFLIGHTFREEFORM', 'IFCSTAIRFLIGHTSPIRAL', 'IFCSTAIRFLIGHTSTRAIGHT', 'IFCSTAIRFLIGHTWINDER', 'IFCSTAIRHALF_TURN_STAIR', 'IFCSTAIRHALF_WINDING_STAIR', 'IFCSTAIRLADDER', 'IFCSTAIRQUARTER_TURN_STAIR', 'IFCSTAIRQUARTER_WINDING_STAIR', 'IFCSTAIRSPIRAL_STAIR', 'IFCSTAIRSTRAIGHT_RUN_STAIR', 'IFCSTAIRTHREE_QUARTER_TURN_STAIR', 'IFCSTAIRTHREE_QUARTER_WINDING_STAIR', 'IFCSTAIRTWO_CURVED_RUN_STAIR', 'IFCSTAIRTWO_QUARTER_TURN_STAIR', 'IFCSTAIRTWO_QUARTER_WINDING_STAIR', 'IFCSTAIRTWO_STRAIGHT_RUN_STAIR', 'IFCWALL', 'IFCWALLELEMENTEDWALL', 'IFCWALLMOVABLE', 'IFCWALLPARAPET', 'IFCWALLPARTITIONING', 'IFCWALLPLUMBINGWALL', 'IFCWALLPOLYGONAL', 'IFCWALLRETAININGWALL', 'IFCWALLSHEAR', 'IFCWALLSOLIDWALL', 'IFCWALLSTANDARD', 'IFCWALLWAVEWALL'],
    props: [
      { name: 'ActualErectionDate', type: 'IfcLabel', description: 'Date erected.' },
      { name: 'ActualProductionDate', type: 'IfcLabel', description: 'Production date (stripped from form).' },
      { name: 'AsBuiltLocationNumber', type: 'IfcLabel', description: 'Defines a unique location within a structure, the slot into which the piece was installed. Where pieces share the same p' },
      { name: 'PieceMark', type: 'IfcLabel', description: 'Defines a unique piece for production purposes. All pieces with the same piece mark value are identical and interchangea' },
      { name: 'ProductionLotId', type: 'IfcLabel', description: 'The manufacturer\\\'s production lot identifier.' },
      { name: 'SerialNumber', type: 'IfcLabel', description: 'The manufacturer\\\'s serial number assigned to an occurrence of a product.' },
      { name: 'TypeDesignation', type: 'IfcLabel', description: 'Type designator for the element. The content depends on local standards. Eg. \\\'Bull nose\\\', \\\'Half batter\\\', \\\'Dropper\\\', \\\'Cha' },
    ],
  },

  'Pset_PrecastConcreteElementGeneral': {
    label:       'Property Set: Precast Concrete Element General',
    description: 'Production and manufacturing related properties common to different types of precast concrete elements. The Pset can be used by a number of subtypes of [[IfcBuiltElement]]. If the',
    applicableTo: ['IFCBEAM', 'IFCBEAMBEAM', 'IFCBEAMCORNICE', 'IFCBEAMDIAPHRAGM', 'IFCBEAMEDGEBEAM', 'IFCBEAMGIRDER_SEGMENT', 'IFCBEAMHATSTONE', 'IFCBEAMHOLLOWCORE', 'IFCBEAMJOIST', 'IFCBEAMLINTEL', 'IFCBEAMPIERCAP', 'IFCBEAMSPANDREL', 'IFCBEAMT_BEAM', 'IFCBUILDINGELEMENTPROXY', 'IFCCHIMNEY', 'IFCCOLUMN', 'IFCCOLUMNCOLUMN', 'IFCCOLUMNPIERSTEM', 'IFCCOLUMNPIERSTEM_SEGMENT', 'IFCCOLUMNPILASTER', 'IFCCOLUMNSTANDCOLUMN', 'IFCFOOTING', 'IFCFOOTINGCAISSON_FOUNDATION', 'IFCFOOTINGFOOTING_BEAM', 'IFCFOOTINGPAD_FOOTING', 'IFCFOOTINGPILE_CAP', 'IFCFOOTINGSTRIP_FOOTING', 'IFCMEMBER', 'IFCMEMBERARCH_SEGMENT', 'IFCMEMBERBRACE', 'IFCMEMBERCHORD', 'IFCMEMBERCOLLAR', 'IFCMEMBERMEMBER', 'IFCMEMBERMULLION', 'IFCMEMBERPLATE', 'IFCMEMBERPOST', 'IFCMEMBERPURLIN', 'IFCMEMBERRAFTER', 'IFCMEMBERSTAY_CABLE', 'IFCMEMBERSTIFFENING_RIB', 'IFCMEMBERSTRINGER', 'IFCMEMBERSTRUCTURALCABLE', 'IFCMEMBERSTRUT', 'IFCMEMBERSTUD', 'IFCMEMBERSUSPENDER', 'IFCMEMBERSUSPENSION_CABLE', 'IFCMEMBERTIEBAR', 'IFCPILE', 'IFCPILEBORED', 'IFCPILECOHESION', 'IFCPILEDRIVEN', 'IFCPILEFRICTION', 'IFCPILEJETGROUTING', 'IFCPILESUPPORT', 'IFCPLATE', 'IFCPLATEBASE_PLATE', 'IFCPLATECOVER_PLATE', 'IFCPLATECURTAIN_PANEL', 'IFCPLATEFLANGE_PLATE', 'IFCPLATEGUSSET_PLATE', 'IFCPLATESHEET', 'IFCPLATESPLICE_PLATE', 'IFCPLATESTIFFENER_PLATE', 'IFCPLATEWEB_PLATE', 'IFCRAMP', 'IFCRAMPFLIGHT', 'IFCRAMPFLIGHTSPIRAL', 'IFCRAMPFLIGHTSTRAIGHT', 'IFCRAMPHALF_TURN_RAMP', 'IFCRAMPQUARTER_TURN_RAMP', 'IFCRAMPSPIRAL_RAMP', 'IFCRAMPSTRAIGHT_RUN_RAMP', 'IFCRAMPTWO_QUARTER_TURN_RAMP', 'IFCRAMPTWO_STRAIGHT_RUN_RAMP', 'IFCROOF', 'IFCROOFBARREL_ROOF', 'IFCROOFBUTTERFLY_ROOF', 'IFCROOFDOME_ROOF', 'IFCROOFFLAT_ROOF', 'IFCROOFFREEFORM', 'IFCROOFGABLE_ROOF', 'IFCROOFGAMBREL_ROOF', 'IFCROOFHIPPED_GABLE_ROOF', 'IFCROOFHIP_ROOF', 'IFCROOFMANSARD_ROOF', 'IFCROOFPAVILION_ROOF', 'IFCROOFRAINBOW_ROOF', 'IFCROOFSHED_ROOF', 'IFCSLAB', 'IFCSLABAPPROACH_SLAB', 'IFCSLABBASESLAB', 'IFCSLABFLOOR', 'IFCSLABLANDING', 'IFCSLABPAVING', 'IFCSLABROOF', 'IFCSLABSIDEWALK', 'IFCSLABTRACKSLAB', 'IFCSLABWEARING', 'IFCSTAIR', 'IFCSTAIRCURVED_RUN_STAIR', 'IFCSTAIRDOUBLE_RETURN_STAIR', 'IFCSTAIRFLIGHT', 'IFCSTAIRFLIGHTCURVED', 'IFCSTAIRFLIGHTFREEFORM', 'IFCSTAIRFLIGHTSPIRAL', 'IFCSTAIRFLIGHTSTRAIGHT', 'IFCSTAIRFLIGHTWINDER', 'IFCSTAIRHALF_TURN_STAIR', 'IFCSTAIRHALF_WINDING_STAIR', 'IFCSTAIRLADDER', 'IFCSTAIRQUARTER_TURN_STAIR', 'IFCSTAIRQUARTER_WINDING_STAIR', 'IFCSTAIRSPIRAL_STAIR', 'IFCSTAIRSTRAIGHT_RUN_STAIR', 'IFCSTAIRTHREE_QUARTER_TURN_STAIR', 'IFCSTAIRTHREE_QUARTER_WINDING_STAIR', 'IFCSTAIRTWO_CURVED_RUN_STAIR', 'IFCSTAIRTWO_QUARTER_TURN_STAIR', 'IFCSTAIRTWO_QUARTER_WINDING_STAIR', 'IFCSTAIRTWO_STRAIGHT_RUN_STAIR', 'IFCWALL', 'IFCWALLELEMENTEDWALL', 'IFCWALLMOVABLE', 'IFCWALLPARAPET', 'IFCWALLPARTITIONING', 'IFCWALLPLUMBINGWALL', 'IFCWALLPOLYGONAL', 'IFCWALLRETAININGWALL', 'IFCWALLSHEAR', 'IFCWALLSOLIDWALL', 'IFCWALLSTANDARD', 'IFCWALLWAVEWALL'],
    props: [
      { name: 'BatterAtEnd', type: 'IfcReal', description: 'The angle, in radians, by which the formwork at the ending face of a piece is to be rotated from the vertical in order t' },
      { name: 'BatterAtStart', type: 'IfcReal', description: 'The angle, in radians, by which the formwork at the starting face of a piece is to be rotated from the vertical in order' },
      { name: 'CamberAtMidspan', type: 'IfcReal', description: 'The camber deflection, measured from the midpoint of a cambered face of a piece to the midpoint of the chord joining the' },
      { name: 'CornerChamfer', type: 'IfcReal', description: 'The chamfer in the corners of the precast element. The chamfer is presumed to be equal in both directions.' },
      { name: 'DesignLocationNumber', type: 'IfcLabel', description: 'Defines a unique location within a structure, the slot for which the piece was designed.' },
      { name: 'FormStrippingStrength', type: 'IfcReal', description: 'The minimum required compressive strength of the concrete at form stripping time.' },
      { name: 'HollowCorePlugging', type: 'IfcLabel', description: 'they may be left open, closed with a plug, or sealed with cast concrete. Values would be,\\\'Unplugged\\\', \\\'Plugged\\\', \\\'Sealed' },
      { name: 'InitialTension', type: 'IfcReal', description: 'The initial stress of the tendon. This property applies to prestressed concrete elements only.' },
      { name: 'LiftingStrength', type: 'IfcReal', description: 'The minimum required compressive strength of the concrete when the concrete element is lifted.' },
      { name: 'ManufacturingToleranceClass', type: 'IfcLabel', description: 'Classification designation of the manufacturing tolerances according to local standards.' },
      { name: 'MinimumAllowableSupportLength', type: 'IfcReal', description: 'The minimum allowable support length.' },
      { name: 'PieceMark', type: 'IfcLabel', description: 'Defines a unique piece for production purposes. All pieces with the same piece mark value are identical and interchangea' },
      { name: 'ReleaseStrength', type: 'IfcReal', description: 'The minimum required compressive strength of the concrete when the tendon stress is released. This property applies to p' },
      { name: 'Shortening', type: 'IfcReal', description: 'The ratio of the distance by which a precast piece is shortened after release from its form (due to compression induced' },
      { name: 'SupportDuringTransportDescription', type: 'IfcLabel', description: 'Textual description of how the concrete element is supported during transportation.' },
      { name: 'SupportDuringTransportDocReference', type: 'IfcTimeSeries', description: 'Reference to an external document defining how the concrete element is supported during transportation.' },
      { name: 'TendonRelaxation', type: 'IfcReal', description: 'The maximum allowable relaxation of the tendon (usually expressed as %/1000 h).This property applies to prestressed conc' },
      { name: 'TransportationStrength', type: 'IfcReal', description: 'The minimum required compressive strength of the concrete required for transportation.' },
      { name: 'Twisting', type: 'IfcReal', description: 'The angle, in radians, through which the end face of a precast piece is rotated with respect to its starting face, along' },
      { name: 'TypeDesignation', type: 'IfcLabel', description: 'Type designator for the element. The content depends on local standards. Eg. \\\'Bull nose\\\', \\\'Half batter\\\', \\\'Dropper\\\', \\\'Cha' },
    ],
  },

  'Pset_PrecastKerbStone': {
    label:       'Property Set: Precast Kerb Stone',
    description: 'Properties for precast kerb stone.',
    applicableTo: ['IFCKERB'],
    props: [
      { name: 'NominalHeight', type: 'IfcReal', description: 'The nominal height of the object. The size information is provided in addition to the shape representation and the geome' },
      { name: 'NominalLength', type: 'IfcReal', description: 'The nominal overall length of the object. The size information is provided in addition to the shape representation and t' },
      { name: 'NominalWidth', type: 'IfcReal', description: 'The nominal overall width of the object. The size information is provided in addition to the shape representation and th' },
      { name: 'TypeDesignation', type: 'IfcLabel', description: 'Type designator for the element. The content depends on local standards. Eg. \\\'Bull nose\\\', \\\'Half batter\\\', \\\'Dropper\\\', \\\'Cha' },
    ],
  },

  'Pset_PrecastSlab': {
    label:       'Property Set: Precast Slab',
    description: 'Layout and component information defining how prestressed slab components are laid out in a precast slab assembly. The values are global defaults for the slab as a whole, but can b',
    applicableTo: ['IFCSLAB', 'IFCSLABAPPROACH_SLAB', 'IFCSLABBASESLAB', 'IFCSLABFLOOR', 'IFCSLABLANDING', 'IFCSLABPAVING', 'IFCSLABROOF', 'IFCSLABSIDEWALK', 'IFCSLABTRACKSLAB', 'IFCSLABWEARING'],
    props: [
      { name: 'AngleBetweenComponentAxes', type: 'IfcReal', description: 'The angle between the axes of each pair of components.' },
      { name: 'AngleToFirstAxis', type: 'IfcReal', description: 'The angle of rotation of the axis of the first component relative to the West edge of the slab.' },
      { name: 'DistanceBetweenComponentAxes', type: 'IfcReal', description: 'The distance between the axes of the components, measured along the South edge of the slab.' },
      { name: 'EdgeDistanceToFirstAxis', type: 'IfcReal', description: 'The distance from the left (West) edge of the slab (in the direction of span of the components) to the axis of the first' },
      { name: 'NominalThickness', type: 'IfcReal', description: 'The nominal thickness of the object. The size information is provided in addition to the shape representation and the ge' },
      { name: 'NominalToppingThickness', type: 'IfcReal', description: 'The nominal thickness of the topping.' },
      { name: 'ToppingType', type: 'IfcLabel', description: 'Defines if a topping is applied and what kind. Values are Full topping, Perimeter Wash, None' },
      { name: 'TypeDesignation', type: 'IfcLabel', description: 'Type designator for the element. The content depends on local standards. Eg. \\\'Bull nose\\\', \\\'Half batter\\\', \\\'Dropper\\\', \\\'Cha' },
    ],
  },

  'Pset_ProcessCapacity': {
    label:       'Property Set: Process Capacity',
    description: 'Property set for the application of process data to spatial elements and transport assets',
    applicableTo: ['IFCBUILTSYSTEM', 'IFCBUILTSYSTEMEROSIONPREVENTION', 'IFCBUILTSYSTEMFENESTRATION', 'IFCBUILTSYSTEMFOUNDATION', 'IFCBUILTSYSTEMLOADBEARING', 'IFCBUILTSYSTEMMOORING', 'IFCBUILTSYSTEMOUTERSHELL', 'IFCBUILTSYSTEMPRESTRESSING', 'IFCBUILTSYSTEMRAILWAYLINE', 'IFCBUILTSYSTEMRAILWAYTRACK', 'IFCBUILTSYSTEMREINFORCING', 'IFCBUILTSYSTEMSHADING', 'IFCBUILTSYSTEMTRACKCIRCUIT', 'IFCBUILTSYSTEMTRANSPORT', 'IFCDISTRIBUTIONCIRCUIT', 'IFCDISTRIBUTIONSYSTEM', 'IFCDISTRIBUTIONSYSTEMAIRCONDITIONING', 'IFCDISTRIBUTIONSYSTEMAUDIOVISUAL', 'IFCDISTRIBUTIONSYSTEMCATENARY_SYSTEM', 'IFCDISTRIBUTIONSYSTEMCHEMICAL', 'IFCDISTRIBUTIONSYSTEMCHILLEDWATER', 'IFCDISTRIBUTIONSYSTEMCOMMUNICATION', 'IFCDISTRIBUTIONSYSTEMCOMPRESSEDAIR', 'IFCDISTRIBUTIONSYSTEMCONDENSERWATER', 'IFCDISTRIBUTIONSYSTEMCONTROL', 'IFCDISTRIBUTIONSYSTEMCONVEYING', 'IFCDISTRIBUTIONSYSTEMDATA', 'IFCDISTRIBUTIONSYSTEMDISPOSAL', 'IFCDISTRIBUTIONSYSTEMDOMESTICCOLDWATER', 'IFCDISTRIBUTIONSYSTEMDOMESTICHOTWATER', 'IFCDISTRIBUTIONSYSTEMDRAINAGE', 'IFCDISTRIBUTIONSYSTEMEARTHING', 'IFCDISTRIBUTIONSYSTEMELECTRICAL', 'IFCDISTRIBUTIONSYSTEMELECTROACOUSTIC', 'IFCDISTRIBUTIONSYSTEMEXHAUST', 'IFCDISTRIBUTIONSYSTEMFIREPROTECTION', 'IFCDISTRIBUTIONSYSTEMFIXEDTRANSMISSIONNETWORK', 'IFCDISTRIBUTIONSYSTEMFUEL', 'IFCDISTRIBUTIONSYSTEMGAS', 'IFCDISTRIBUTIONSYSTEMHAZARDOUS', 'IFCDISTRIBUTIONSYSTEMHEATING', 'IFCDISTRIBUTIONSYSTEMLIGHTING', 'IFCDISTRIBUTIONSYSTEMLIGHTNINGPROTECTION', 'IFCDISTRIBUTIONSYSTEMMOBILENETWORK', 'IFCDISTRIBUTIONSYSTEMMONITORINGSYSTEM', 'IFCDISTRIBUTIONSYSTEMMUNICIPALSOLIDWASTE', 'IFCDISTRIBUTIONSYSTEMOIL', 'IFCDISTRIBUTIONSYSTEMOPERATIONAL', 'IFCDISTRIBUTIONSYSTEMOPERATIONALTELEPHONYSYSTEM', 'IFCDISTRIBUTIONSYSTEMOVERHEAD_CONTACTLINE_SYSTEM', 'IFCDISTRIBUTIONSYSTEMPOWERGENERATION', 'IFCDISTRIBUTIONSYSTEMRAINWATER', 'IFCDISTRIBUTIONSYSTEMREFRIGERATION', 'IFCDISTRIBUTIONSYSTEMRETURN_CIRCUIT', 'IFCDISTRIBUTIONSYSTEMSECURITY', 'IFCDISTRIBUTIONSYSTEMSEWAGE', 'IFCDISTRIBUTIONSYSTEMSIGNAL', 'IFCDISTRIBUTIONSYSTEMSTORMWATER', 'IFCDISTRIBUTIONSYSTEMTELEPHONE', 'IFCDISTRIBUTIONSYSTEMTV', 'IFCDISTRIBUTIONSYSTEMVACUUM', 'IFCDISTRIBUTIONSYSTEMVENT', 'IFCDISTRIBUTIONSYSTEMVENTILATION', 'IFCDISTRIBUTIONSYSTEMWASTEWATER', 'IFCDISTRIBUTIONSYSTEMWATERSUPPLY', 'IFCDOOR', 'IFCDOORBOOM_BARRIER', 'IFCDOORDOOR', 'IFCDOORGATE', 'IFCDOORTRAPDOOR', 'IFCDOORTURNSTILE', 'IFCSPACE', 'IFCSPACEBERTH', 'IFCSPACEEXTERNAL', 'IFCSPACEGFA', 'IFCSPACEINTERNAL', 'IFCSPACEPARKING', 'IFCSPACESPACE', 'IFCTRANSPORTELEMENT', 'IFCTRANSPORTELEMENTCRANEWAY', 'IFCTRANSPORTELEMENTELEVATOR', 'IFCTRANSPORTELEMENTESCALATOR', 'IFCTRANSPORTELEMENTHAULINGGEAR', 'IFCTRANSPORTELEMENTLIFTINGGEAR', 'IFCTRANSPORTELEMENTMOVINGWALKWAY', 'IFCTRANSPORTATIONDEVICE', 'IFCVEHICLE', 'IFCVEHICLECARGO', 'IFCVEHICLEROLLINGSTOCK', 'IFCVEHICLEVEHICLE', 'IFCVEHICLEVEHICLEAIR', 'IFCVEHICLEVEHICLEMARINE', 'IFCVEHICLEVEHICLETRACKED', 'IFCVEHICLEVEHICLEWHEELED', 'IFCZONE'],
    props: [
      { name: 'DownstreamConnections', type: 'IfcLabel', description: 'Names of downstream connected equipment and spaces, if not otherwise represented' },
      { name: 'ProcessCapacity', type: 'IfcInteger', description: 'The number of units that can be processed in the time defined in ProcessPerformance' },
      { name: 'ProcessItem', type: 'IfcLabel', description: 'The type of item (and its measurement method) being modelled within a process. This can be cargo, passengers or vehicles' },
      { name: 'ProcessPerformance', type: 'IfcLabel', description: 'Minimum time to accept or dispatch the entire item capacity.' },
      { name: 'UpstreamConnections', type: 'IfcLabel', description: 'Names of upstream connected equipment and spaces, if not otherwise represented' },
    ],
  },

  'Pset_ProjectCommon': {
    label:       'Property Set: Project Common',
    description: 'Property set for the application of high level project information.',
    applicableTo: ['IFCPROJECT'],
    props: [
      { name: 'FundingSource', type: 'IfcLabel', description: 'Investment funding source' },
      { name: 'NetEarnedValue', type: 'IfcTimeSeries', description: 'Net earned value' },
      { name: 'PaybackPeriod', type: 'IfcLabel', description: 'Payback period of investment' },
      { name: 'ProjectInvestmentEstimate', type: 'IfcTimeSeries', description: 'Estimate of investment cost' },
      { name: 'ProjectType', type: 'IfcLabel', description: 'Additional typing of a project' },
      { name: 'ROI', type: 'IfcReal', description: 'Return on Investment' },
    ],
  },

  'Pset_ProjectOrderChangeOrder': {
    label:       'Property Set: Project Order Change Order',
    description: 'A change order is an instruction to make a change to a product or work being undertake. Note that the change order status is defined in the same way as a work order status since a',
    applicableTo: ['IFCPROJECTORDERCHANGEORDER'],
    props: [
      { name: 'BudgetSource', type: 'IfcLabel', description: 'The budget source requested.' },
      { name: 'ReasonForChange', type: 'IfcLabel', description: 'A description of the problem for why a change is needed.' },
    ],
  },

  'Pset_ProjectOrderMaintenanceWorkOrder': {
    label:       'Property Set: Project Order Maintenance Work Order',
    description: 'A MaintenanceWorkOrder is a detailed description of maintenance work that is to be performed. Note that the Scheduled Frequency property of the maintenance work order is used when',
    applicableTo: ['IFCPROJECTORDERMAINTENANCEWORKORDER'],
    props: [
      { name: 'ContractualType', type: 'IfcLabel', description: 'The contractual type of the work.' },
      { name: 'FaultPriorityType', type: 'IfcLabel', description: 'action is required urgently.;action can occur within a reasonable period of time.;action can occur when convenient.' },
      { name: 'IfNotAccomplished', type: 'IfcLabel', description: 'Comments if the job is not accomplished.' },
      { name: 'LocationPriorityType', type: 'IfcLabel', description: 'action is required urgently.;action can occur within a reasonable period of time.;action can occur when convenient.' },
      { name: 'MaintenanceType', type: 'IfcLabel', description: 'generated as a result of the condition of an asset or artefact being less than a determined value.;generated as a result' },
      { name: 'ProductDescription', type: 'IfcLabel', description: 'A textual description of the products that require the work.' },
      { name: 'ScheduledFrequency', type: 'IfcReal', description: 'The period of time between expected instantiations of a work order that may have been predefined.' },
      { name: 'WorkTypeRequested', type: 'IfcLabel', description: 'Work type requested in circumstances where there are categorizations of types of work task. It could be used to identify' },
    ],
  },

  'Pset_ProjectOrderMoveOrder': {
    label:       'Property Set: Project Order Move Order',
    description: 'Defines the requirements for move orders. Note that the move order status is defined in the same way as a work order status since a move order implies a work requirement.',
    applicableTo: ['IFCPROJECTORDERMOVEORDER'],
    props: [
      { name: 'SpecialInstructions', type: 'IfcLabel', description: 'Special instructions.' },
    ],
  },

  'Pset_ProjectOrderPurchaseOrder': {
    label:       'Property Set: Project Order Purchase Order',
    description: 'Defines the requirements for purchase orders in a project.',
    applicableTo: ['IFCPROJECTORDERPURCHASEORDER'],
    props: [
      { name: 'IsFOB', type: 'IfcBoolean', description: 'Indication of whether contents of the purchase order are delivered \\\'Free on Board\\\' (= True) or not (= False). FOB is a s' },
      { name: 'ShipMethod', type: 'IfcLabel', description: 'Method of shipping that will be used for goods or services.' },
    ],
  },

  'Pset_ProjectOrderWorkOrder': {
    label:       'Property Set: Project Order Work Order',
    description: 'Defines the requirements for purchase orders in a project.',
    applicableTo: ['IFCPROJECTORDERWORKORDER'],
    props: [
      { name: 'ContractualType', type: 'IfcLabel', description: 'The contractual type of the work.' },
      { name: 'IfNotAccomplished', type: 'IfcLabel', description: 'Comments if the job is not accomplished.' },
      { name: 'ProductDescription', type: 'IfcLabel', description: 'A textual description of the products that require the work.' },
      { name: 'WorkTypeRequested', type: 'IfcLabel', description: 'Work type requested in circumstances where there are categorizations of types of work task. It could be used to identify' },
    ],
  },

  'Pset_PropertyAgreement': {
    label:       'Property Set: Property Agreement',
    description: 'A property agreement is an agreement that enables the occupation of a property for a period of time.',
    applicableTo: ['IFCBRIDGE', 'IFCBRIDGEARCHED', 'IFCBRIDGECABLE_STAYED', 'IFCBRIDGECANTILEVER', 'IFCBRIDGECULVERT', 'IFCBRIDGEFRAMEWORK', 'IFCBRIDGEGIRDER', 'IFCBRIDGEPART', 'IFCBRIDGEPARTABUTMENT', 'IFCBRIDGEPARTDECK', 'IFCBRIDGEPARTDECK_SEGMENT', 'IFCBRIDGEPARTFOUNDATION', 'IFCBRIDGEPARTPIER', 'IFCBRIDGEPARTPIER_SEGMENT', 'IFCBRIDGEPARTPYLON', 'IFCBRIDGEPARTSUBSTRUCTURE', 'IFCBRIDGEPARTSUPERSTRUCTURE', 'IFCBRIDGEPARTSURFACESTRUCTURE', 'IFCBRIDGESUSPENSION', 'IFCBRIDGETRUSS', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCFACILITY', 'IFCFACILITYPART', 'IFCFACILITYPARTCOMMON', 'IFCFACILITYPARTCOMMONABOVEGROUND', 'IFCFACILITYPARTCOMMONBELOWGROUND', 'IFCFACILITYPARTCOMMONJUNCTION', 'IFCFACILITYPARTCOMMONLEVELCROSSING', 'IFCFACILITYPARTCOMMONSEGMENT', 'IFCFACILITYPARTCOMMONSUBSTRUCTURE', 'IFCFACILITYPARTCOMMONSUPERSTRUCTURE', 'IFCFACILITYPARTCOMMONTERMINAL', 'IFCMARINEFACILITY', 'IFCMARINEFACILITYBARRIERBEACH', 'IFCMARINEFACILITYBREAKWATER', 'IFCMARINEFACILITYCANAL', 'IFCMARINEFACILITYDRYDOCK', 'IFCMARINEFACILITYFLOATINGDOCK', 'IFCMARINEFACILITYHYDROLIFT', 'IFCMARINEFACILITYJETTY', 'IFCMARINEFACILITYLAUNCHRECOVERY', 'IFCMARINEFACILITYMARINEDEFENCE', 'IFCMARINEFACILITYNAVIGATIONALCHANNEL', 'IFCMARINEFACILITYPORT', 'IFCMARINEFACILITYQUAY', 'IFCMARINEFACILITYREVETMENT', 'IFCMARINEFACILITYSHIPLIFT', 'IFCMARINEFACILITYSHIPLOCK', 'IFCMARINEFACILITYSHIPYARD', 'IFCMARINEFACILITYSLIPWAY', 'IFCMARINEFACILITYWATERWAY', 'IFCMARINEFACILITYWATERWAYSHIPLIFT', 'IFCMARINEPART', 'IFCMARINEPARTABOVEWATERLINE', 'IFCMARINEPARTANCHORAGE', 'IFCMARINEPARTAPPROACHCHANNEL', 'IFCMARINEPARTBELOWWATERLINE', 'IFCMARINEPARTBERTHINGSTRUCTURE', 'IFCMARINEPARTCHAMBER', 'IFCMARINEPARTCILL_LEVEL', 'IFCMARINEPARTCOPELEVEL', 'IFCMARINEPARTCORE', 'IFCMARINEPARTCREST', 'IFCMARINEPARTGATEHEAD', 'IFCMARINEPARTGUDINGSTRUCTURE', 'IFCMARINEPARTHIGHWATERLINE', 'IFCMARINEPARTLANDFIELD', 'IFCMARINEPARTLEEWARDSIDE', 'IFCMARINEPARTLOWWATERLINE', 'IFCMARINEPARTMANUFACTURING', 'IFCMARINEPARTNAVIGATIONALAREA', 'IFCMARINEPARTPROTECTION', 'IFCMARINEPARTSHIPTRANSFER', 'IFCMARINEPARTSTORAGEAREA', 'IFCMARINEPARTVEHICLESERVICING', 'IFCMARINEPARTWATERFIELD', 'IFCMARINEPARTWEATHERSIDE', 'IFCRAILWAY', 'IFCRAILWAYPART', 'IFCRAILWAYPARTABOVETRACK', 'IFCRAILWAYPARTDILATIONTRACK', 'IFCRAILWAYPARTLINESIDE', 'IFCRAILWAYPARTLINESIDEPART', 'IFCRAILWAYPARTPLAINTRACK', 'IFCRAILWAYPARTSUBSTRUCTURE', 'IFCRAILWAYPARTTRACK', 'IFCRAILWAYPARTTRACKPART', 'IFCRAILWAYPARTTURNOUTTRACK', 'IFCROAD', 'IFCROADPART', 'IFCROADPARTBICYCLECROSSING', 'IFCROADPARTBUS_STOP', 'IFCROADPARTCARRIAGEWAY', 'IFCROADPARTCENTRALISLAND', 'IFCROADPARTCENTRALRESERVE', 'IFCROADPARTHARDSHOULDER', 'IFCROADPARTINTERSECTION', 'IFCROADPARTLAYBY', 'IFCROADPARTPARKINGBAY', 'IFCROADPARTPASSINGBAY', 'IFCROADPARTPEDESTRIAN_CROSSING', 'IFCROADPARTRAILWAYCROSSING', 'IFCROADPARTREFUGEISLAND', 'IFCROADPARTROADSEGMENT', 'IFCROADPARTROADSIDE', 'IFCROADPARTROADSIDEPART', 'IFCROADPARTROADWAYPLATEAU', 'IFCROADPARTROUNDABOUT', 'IFCROADPARTSHOULDER', 'IFCROADPARTSIDEWALK', 'IFCROADPARTSOFTSHOULDER', 'IFCROADPARTTOLLPLAZA', 'IFCROADPARTTRAFFICISLAND', 'IFCROADPARTTRAFFICLANE', 'IFCSITE', 'IFCSPACE', 'IFCSPACEBERTH', 'IFCSPACEEXTERNAL', 'IFCSPACEGFA', 'IFCSPACEINTERNAL', 'IFCSPACEPARKING', 'IFCSPACESPACE', 'IFCSPATIALSTRUCTUREELEMENT'],
    props: [
      { name: 'AgreementDate', type: 'IfcLabel', description: 'The date on which the version of the agreement became applicable.' },
      { name: 'AgreementType', type: 'IfcLabel', description: 'Identifies the predefined types of property agreement from which the type required may be set.' },
      { name: 'AgreementVersion', type: 'IfcLabel', description: 'The version number of the agreement that is identified.' },
      { name: 'CommencementDate', type: 'IfcLabel', description: 'Date on which the agreement commences.' },
      { name: 'ConditionCommencement', type: 'IfcLabel', description: 'Condition of property provided on commencement of the agreement e.g. cold shell, warm lit shell, broom clean, turn-key.' },
      { name: 'ConditionTermination', type: 'IfcLabel', description: 'Condition of property required on termination of the agreement e.g. cold shell, warm lit shell, broom clean, turn-key.' },
      { name: 'Duration', type: 'IfcLabel', description: 'Duration.' },
      { name: 'Options', type: 'IfcLabel', description: 'A statement of the options available in the agreement.' },
      { name: 'PropertyName', type: 'IfcLabel', description: 'Addressing details of the property as stated within the agreement.' },
      { name: 'Restrictions', type: 'IfcLabel', description: 'Restrictions that may be placed by a competent authority.' },
      { name: 'TerminationDate', type: 'IfcLabel', description: 'Date on which the agreement terminates.' },
      { name: 'TrackingIdentifier', type: 'IfcLabel', description: 'The identifier assigned to the agreement for the purposes of tracking.' },
    ],
  },

  'Pset_ProtectiveDeviceBreakerUnitI2TCurve': {
    label:       'Property Set: Protective Device Breaker Unit I2Tcurve',
    description: 'A coherent set of attributes representing a curve for let-through energy of a protective device. Note - A protective device may be associated with different instances of this pSet',
    applicableTo: ['IFCPROTECTIVEDEVICE', 'IFCPROTECTIVEDEVICEANTI_ARCING_DEVICE', 'IFCPROTECTIVEDEVICECIRCUITBREAKER', 'IFCPROTECTIVEDEVICEEARTHINGSWITCH', 'IFCPROTECTIVEDEVICEEARTHLEAKAGECIRCUITBREAKER', 'IFCPROTECTIVEDEVICEFUSEDISCONNECTOR', 'IFCPROTECTIVEDEVICERESIDUALCURRENTCIRCUITBREAKER', 'IFCPROTECTIVEDEVICERESIDUALCURRENTSWITCH', 'IFCPROTECTIVEDEVICESPARKGAP', 'IFCPROTECTIVEDEVICEVARISTOR', 'IFCPROTECTIVEDEVICEVOLTAGELIMITER'],
    props: [
      { name: 'BreakerUnitCurve', type: 'IfcReal', description: 'A curve that establishes the let through energy of a breaker unit when a particular prospective current is applied.A lis' },
      { name: 'NominalCurrent', type: 'IfcReal', description: 'The nominal current that is designed to be measured.' },
      { name: 'VoltageLevel', type: 'IfcLabel', description: 'The voltage levels for which the data of the instance is valid. More than one value may be selected in the enumeration.' },
    ],
  },

  'Pset_ProtectiveDeviceBreakerUnitI2TFuseCurve': {
    label:       'Property Set: Protective Device Breaker Unit I2Tfuse Curve',
    description: 'A coherent set of attributes representing curves for melting- and breaking-energy of a fuse. Note - A fuse may be associated with different instances of this property set providing',
    applicableTo: ['IFCPROTECTIVEDEVICE', 'IFCPROTECTIVEDEVICEANTI_ARCING_DEVICE', 'IFCPROTECTIVEDEVICECIRCUITBREAKER', 'IFCPROTECTIVEDEVICEEARTHINGSWITCH', 'IFCPROTECTIVEDEVICEEARTHLEAKAGECIRCUITBREAKER', 'IFCPROTECTIVEDEVICEFUSEDISCONNECTOR', 'IFCPROTECTIVEDEVICERESIDUALCURRENTCIRCUITBREAKER', 'IFCPROTECTIVEDEVICERESIDUALCURRENTSWITCH', 'IFCPROTECTIVEDEVICESPARKGAP', 'IFCPROTECTIVEDEVICEVARISTOR', 'IFCPROTECTIVEDEVICEVOLTAGELIMITER'],
    props: [
      { name: 'BreakerUnitFuseBreakingingCurve', type: 'IfcReal', description: 'A curve that establishes the let through breaking energy of a breaker unit when a particular prospective breaking curren' },
      { name: 'BreakerUnitFuseMeltingCurve', type: 'IfcReal', description: 'A curve that establishes the energy required to melt the fuse of a breaker unit when a particular prospective melting cu' },
      { name: 'VoltageLevel', type: 'IfcLabel', description: 'The voltage levels for which the data of the instance is valid. More than one value may be selected in the enumeration.' },
    ],
  },

  'Pset_ProtectiveDeviceBreakerUnitIPICurve': {
    label:       'Property Set: Protective Device Breaker Unit Ipicurve',
    description: 'A coherent set of attributes representing curves for let-through currents of a protective device. Note - A protective device may be associated with different instances of this pSet',
    applicableTo: ['IFCPROTECTIVEDEVICE', 'IFCPROTECTIVEDEVICEANTI_ARCING_DEVICE', 'IFCPROTECTIVEDEVICECIRCUITBREAKER', 'IFCPROTECTIVEDEVICEEARTHINGSWITCH', 'IFCPROTECTIVEDEVICEEARTHLEAKAGECIRCUITBREAKER', 'IFCPROTECTIVEDEVICEFUSEDISCONNECTOR', 'IFCPROTECTIVEDEVICERESIDUALCURRENTCIRCUITBREAKER', 'IFCPROTECTIVEDEVICERESIDUALCURRENTSWITCH', 'IFCPROTECTIVEDEVICESPARKGAP', 'IFCPROTECTIVEDEVICEVARISTOR', 'IFCPROTECTIVEDEVICEVOLTAGELIMITER'],
    props: [
      { name: 'BreakerUnitIPICurve', type: 'IfcReal', description: 'A curve that establishes the let through peak current of a breaker unit when a particular prospective current is applied' },
      { name: 'NominalCurrent', type: 'IfcReal', description: 'The nominal current that is designed to be measured.' },
      { name: 'VoltageLevel', type: 'IfcLabel', description: 'The voltage levels for which the data of the instance is valid. More than one value may be selected in the enumeration.' },
    ],
  },

  'Pset_ProtectiveDeviceBreakerUnitTypeMCB': {
    label:       'Property Set: Protective Device Breaker Unit Type Mcb',
    description: 'A coherent set of attributes representing the breaking capacities of an MCB. Note - A protective device may be associated with different instances of this property set providing in',
    applicableTo: ['IFCPROTECTIVEDEVICECIRCUITBREAKER'],
    props: [
      { name: 'ICN60898', type: 'IfcReal', description: 'The nominal breaking capacity in A for an MCB tested in accordance with the IEC 60898 series.' },
      { name: 'ICS60898', type: 'IfcReal', description: 'The service breaking capacity in A for an MCB tested in accordance with the IEC 60898 series.' },
      { name: 'ICS60947', type: 'IfcReal', description: 'The service breaking capacity in A for an object tested in accordance with the IEC 60947 series.' },
      { name: 'ICU60947', type: 'IfcReal', description: 'The ultimate breaking capacity in A for an object tested in accordance with the IEC 60947 series.' },
      { name: 'NominalCurrents', type: 'IfcReal', description: 'A set of values providing information on available modules (chips) for setting the nominal current of the protective dev' },
      { name: 'PowerLoss', type: 'IfcReal', description: 'The power loss in W.' },
      { name: 'VoltageLevel', type: 'IfcLabel', description: 'The voltage levels for which the data of the instance is valid. More than one value may be selected in the enumeration.' },
    ],
  },

  'Pset_ProtectiveDeviceBreakerUnitTypeMotorProtectio': {
    label:       'Property Set: Protective Device Breaker Unit Type Motor Protection',
    description: 'A coherent set of attributes representing different capacities of a a motor protection device, defined in accordance with IEC 60947. Note - A protective device may be associated wi',
    applicableTo: ['IFCPROTECTIVEDEVICE', 'IFCPROTECTIVEDEVICEANTI_ARCING_DEVICE', 'IFCPROTECTIVEDEVICECIRCUITBREAKER', 'IFCPROTECTIVEDEVICEEARTHINGSWITCH', 'IFCPROTECTIVEDEVICEEARTHLEAKAGECIRCUITBREAKER', 'IFCPROTECTIVEDEVICEFUSEDISCONNECTOR', 'IFCPROTECTIVEDEVICERESIDUALCURRENTCIRCUITBREAKER', 'IFCPROTECTIVEDEVICERESIDUALCURRENTSWITCH', 'IFCPROTECTIVEDEVICESPARKGAP', 'IFCPROTECTIVEDEVICEVARISTOR', 'IFCPROTECTIVEDEVICEVOLTAGELIMITER'],
    props: [
    ],
  },

  'Pset_ProtectiveDeviceOccurrence': {
    label:       'Property Set: Protective Device Occurrence',
    description: 'Properties that are applied to an occurrence of a protective device.',
    applicableTo: ['IFCPROTECTIVEDEVICE', 'IFCPROTECTIVEDEVICEANTI_ARCING_DEVICE', 'IFCPROTECTIVEDEVICECIRCUITBREAKER', 'IFCPROTECTIVEDEVICEEARTHINGSWITCH', 'IFCPROTECTIVEDEVICEEARTHLEAKAGECIRCUITBREAKER', 'IFCPROTECTIVEDEVICEFUSEDISCONNECTOR', 'IFCPROTECTIVEDEVICERESIDUALCURRENTCIRCUITBREAKER', 'IFCPROTECTIVEDEVICERESIDUALCURRENTSWITCH', 'IFCPROTECTIVEDEVICESPARKGAP', 'IFCPROTECTIVEDEVICEVARISTOR', 'IFCPROTECTIVEDEVICEVOLTAGELIMITER'],
    props: [
      { name: 'GroundFaultCurrentSetValue', type: 'IfcReal', description: 'Ground fault current set value. The set value of the ground tripping current if adjustable.' },
      { name: 'GroundFaultFunction', type: 'IfcBoolean', description: 'Applying ground fault function. A flag indicating that the ground fault function of the device is used. The value should' },
      { name: 'GroundFaulti2tFunction', type: 'IfcBoolean', description: 'Applying ground fault i2t function. A flag indicating that the I2t ground fault function of the device is used. The valu' },
      { name: 'GroundFaultTrippingTime', type: 'IfcReal', description: 'Ground fault tripping time. The set value of the ground fault tripping current if adjustable.' },
      { name: 'InstantaneousCurrentSetValue', type: 'IfcReal', description: 'Instantaneous current set value. The set value of the instantaneous tripping current if adjustable.' },
      { name: 'InstantaneousTrippingTime', type: 'IfcReal', description: 'Instantaneous tripping time. The set value of the instantaneous tripping time if adjustable.' },
      { name: 'LongTimeCurrentSetValue', type: 'IfcReal', description: 'Long time current set value. The set value of the long time tripping current if adjustable.' },
      { name: 'LongTimeDelay', type: 'IfcReal', description: 'Long time delay. The set value of the long time time-delay if adjustable.' },
      { name: 'LongTimeFunction', type: 'IfcBoolean', description: 'Applying long time function; A flag indicating that the long time function (i.e. the thermal tripping) of the device is' },
      { name: 'PoleUsage', type: 'IfcLabel', description: 'Pole usage.' },
      { name: 'ShortTimeCurrentSetValue', type: 'IfcReal', description: 'Short time current set value. The set value of the long time tripping current if adjustable.' },
      { name: 'ShortTimeFunction', type: 'IfcBoolean', description: 'Applying short time function A flag indicating that the short time function of the device is used. The value should be s' },
      { name: 'ShortTimei2tFunction', type: 'IfcBoolean', description: 'Applying short time i2t function. A flag indicating that the I2t short time function of the device is used. The value sh' },
      { name: 'ShortTimeTrippingTime', type: 'IfcReal', description: 'Short time tripping time. The set value of the short time tripping time if adjustable.' },
    ],
  },

  'Pset_ProtectiveDeviceTrippingCurve': {
    label:       'Property Set: Protective Device Tripping Curve',
    description: 'Tripping curves are applied to thermal, thermal magnetic or MCB_RCD tripping units (i.e. tripping units having type property sets for thermal, thermal magnetic or MCB_RCD tripping',
    applicableTo: ['IFCPROTECTIVEDEVICE', 'IFCPROTECTIVEDEVICEANTI_ARCING_DEVICE', 'IFCPROTECTIVEDEVICECIRCUITBREAKER', 'IFCPROTECTIVEDEVICEEARTHINGSWITCH', 'IFCPROTECTIVEDEVICEEARTHLEAKAGECIRCUITBREAKER', 'IFCPROTECTIVEDEVICEFUSEDISCONNECTOR', 'IFCPROTECTIVEDEVICERESIDUALCURRENTCIRCUITBREAKER', 'IFCPROTECTIVEDEVICERESIDUALCURRENTSWITCH', 'IFCPROTECTIVEDEVICESPARKGAP', 'IFCPROTECTIVEDEVICEVARISTOR', 'IFCPROTECTIVEDEVICEVOLTAGELIMITER'],
    props: [
      { name: 'TrippingCurve', type: 'IfcReal', description: 'A curve that establishes the release time of a tripping unit when a particular prospective current is applied.(1) Defini' },
      { name: 'TrippingCurveType', type: 'IfcLabel', description: 'The type of tripping curve that is represented by the property set.' },
    ],
  },

  'Pset_ProtectiveDeviceTrippingFunctionGCurve': {
    label:       'Property Set: Protective Device Tripping Function Gcurve',
    description: 'Tripping functions are applied to electronic tripping units (i.e. tripping units having type property sets for electronic tripping defined). They are not applied to thermal, therma',
    applicableTo: ['IFCPROTECTIVEDEVICETRIPPINGUNIT', 'IFCPROTECTIVEDEVICETRIPPINGUNITELECTROMAGNETIC', 'IFCPROTECTIVEDEVICETRIPPINGUNITELECTRONIC', 'IFCPROTECTIVEDEVICETRIPPINGUNITRESIDUALCURRENT', 'IFCPROTECTIVEDEVICETRIPPINGUNITTHERMAL'],
    props: [
      { name: 'CurrentTolerance1', type: 'IfcReal', description: 'The tolerance for the current of time/current-curve in %.' },
      { name: 'CurrentTolerance2', type: 'IfcReal', description: 'The tolerance for the current of time/current-curve in % valid for times above CurrentTolereanceLimit1.' },
      { name: 'CurrentToleranceLimit1', type: 'IfcReal', description: 'The time limit in s limiting the application of CurrentTolerance1, if any. If the value is set to 0, the value of the Cu' },
      { name: 'ExternalAdjusted', type: 'IfcBoolean', description: 'An indication if the ground fault protection may be adjusted according to an external current coil or not.' },
      { name: 'IsCurrentTolerancePositiveOnly', type: 'IfcBoolean', description: 'Indication whether the value of CurrentTolerance1 is provided as a positive tolereance only or not. If not, the value is' },
      { name: 'IsSelectable', type: 'IfcBoolean', description: 'Indication whether something can be switched off or not.' },
      { name: 'IsTimeTolerancePositiveOnly', type: 'IfcBoolean', description: 'Indication whether the value of TimeTolerance1 is provided as a positive tolereance only or not. If not, the value is pr' },
      { name: 'NominalCurrentAdjusted', type: 'IfcBoolean', description: 'An indication if the tripping currents of the short time protection is related to the nominal current multiplied with th' },
      { name: 'ReleaseCurrent', type: 'IfcReal', description: 'The release current in x In for the initial tripping of the S-function.' },
      { name: 'ReleaseCurrentI2tEnd', type: 'IfcReal', description: 'The release current in x In.' },
      { name: 'ReleaseCurrentI2tStart', type: 'IfcReal', description: 'The release current in x In.' },
      { name: 'ReleaseTime', type: 'IfcReal', description: 'The release time in s for the initial tripping of the relevant part. This time indicates that for current lower than the' },
      { name: 'ReleaseTimeI2tEnd', type: 'IfcReal', description: 'The release time in s.' },
      { name: 'ReleaseTimeI2tStart', type: 'IfcReal', description: 'The release time in s.' },
      { name: 'TimeTolerance1', type: 'IfcReal', description: 'The tolerance for the time of time/current-curve in %.' },
      { name: 'TimeTolerance2', type: 'IfcReal', description: 'The tolerance for the time of the time/current-curve in % valid for currents above TimeToleranceLimit1.' },
      { name: 'TimeToleranceLimit1', type: 'IfcReal', description: 'The current limit in x In limiting the application of TimeTolerance1, if any. If the value is set to 0, the value of the' },
    ],
  },

  'Pset_ProtectiveDeviceTrippingFunctionICurve': {
    label:       'Property Set: Protective Device Tripping Function Icurve',
    description: 'Tripping functions are applied to electronic tripping units (i.e. tripping units having type property sets for electronic tripping defined). They are not applied to thermal, therma',
    applicableTo: ['IFCPROTECTIVEDEVICETRIPPINGUNIT', 'IFCPROTECTIVEDEVICETRIPPINGUNITELECTROMAGNETIC', 'IFCPROTECTIVEDEVICETRIPPINGUNITELECTRONIC', 'IFCPROTECTIVEDEVICETRIPPINGUNITRESIDUALCURRENT', 'IFCPROTECTIVEDEVICETRIPPINGUNITTHERMAL'],
    props: [
      { name: 'CurrentTolerance1', type: 'IfcReal', description: 'The tolerance for the current of time/current-curve in %.' },
      { name: 'CurrentTolerance2', type: 'IfcReal', description: 'The tolerance for the current of time/current-curve in % valid for times above CurrentTolereanceLimit1.' },
      { name: 'CurrentToleranceLimit1', type: 'IfcReal', description: 'The time limit in s limiting the application of CurrentTolerance1, if any. If the value is set to 0, the value of the Cu' },
      { name: 'IsCurrentTolerancePositiveOnly', type: 'IfcBoolean', description: 'Indication whether the value of CurrentTolerance1 is provided as a positive tolereance only or not. If not, the value is' },
      { name: 'IsOffWhenSFunctionOn', type: 'IfcBoolean', description: 'Indication whether the I-function is automatically switched off when the S-function is switched on.' },
      { name: 'IsSelectable', type: 'IfcBoolean', description: 'Indication whether something can be switched off or not.' },
      { name: 'IsTimeTolerancePositiveOnly', type: 'IfcBoolean', description: 'Indication whether the value of TimeTolerance1 is provided as a positive tolereance only or not. If not, the value is pr' },
      { name: 'MaxAdjustmentX_ICS', type: 'IfcReal', description: 'Provides the maximum setting value for the available current adjustment in relation to the Ics breaking capacity of the' },
      { name: 'NominalCurrentAdjusted', type: 'IfcBoolean', description: 'An indication if the tripping currents of the short time protection is related to the nominal current multiplied with th' },
      { name: 'ReleaseCurrent', type: 'IfcReal', description: 'The release current in x In for the initial tripping of the S-function.' },
      { name: 'ReleaseTime', type: 'IfcReal', description: 'The release time in s for the initial tripping of the relevant part. This time indicates that for current lower than the' },
      { name: 'TimeTolerance1', type: 'IfcReal', description: 'The tolerance for the time of time/current-curve in %.' },
      { name: 'TimeTolerance2', type: 'IfcReal', description: 'The tolerance for the time of the time/current-curve in % valid for currents above TimeToleranceLimit1.' },
      { name: 'TimeToleranceLimit1', type: 'IfcReal', description: 'The current limit in x In limiting the application of TimeTolerance1, if any. If the value is set to 0, the value of the' },
    ],
  },

  'Pset_ProtectiveDeviceTrippingFunctionLCurve': {
    label:       'Property Set: Protective Device Tripping Function Lcurve',
    description: 'Tripping functions are applied to electronic tripping units (i.e. tripping units having type property sets for electronic tripping defined). They are not applied to thermal, therma',
    applicableTo: ['IFCPROTECTIVEDEVICETRIPPINGUNIT', 'IFCPROTECTIVEDEVICETRIPPINGUNITELECTROMAGNETIC', 'IFCPROTECTIVEDEVICETRIPPINGUNITELECTRONIC', 'IFCPROTECTIVEDEVICETRIPPINGUNITRESIDUALCURRENT', 'IFCPROTECTIVEDEVICETRIPPINGUNITTHERMAL'],
    props: [
      { name: 'IsSelectable', type: 'IfcBoolean', description: 'Indication whether something can be switched off or not.' },
      { name: 'LowerCurrent1', type: 'IfcReal', description: 'The current in x In, indicating that for currents smaller than LowerCurrent1 the I2t part of the L-function will not tri' },
      { name: 'LowerCurrent2', type: 'IfcReal', description: 'The current in x In, indicating the upper current limit of the lower time/current curve of the I2t part of the L-functio' },
      { name: 'LowerTime1', type: 'IfcReal', description: 'The time in s, indicating that tripping times of the lower time/current curve lower than LowerTime1 is determined by the' },
      { name: 'LowerTime2', type: 'IfcReal', description: 'The time in s, indicating the tripping times of the upper time/current curve at the LowerCurrent2.' },
      { name: 'UpperCurrent1', type: 'IfcReal', description: 'The current in x In, indicating that for currents larger than UpperCurrent1 the I2t part of the L-function will trip the' },
      { name: 'UpperCurrent2', type: 'IfcReal', description: 'The current in x In, indicating the upper current limit of the upper time/current curve of the I2t part of the L-functio' },
      { name: 'UpperTime1', type: 'IfcReal', description: 'The time in s, indicating that tripping times of the upper time/current curve lower than UpperTime1 is determined by the' },
      { name: 'UpperTime2', type: 'IfcReal', description: 'The time in s, indicating the tripping times of the upper time/current curve at the UpperCurrent2.' },
    ],
  },

  'Pset_ProtectiveDeviceTrippingFunctionSCurve': {
    label:       'Property Set: Protective Device Tripping Function Scurve',
    description: 'Tripping functions are applied to electronic tripping units (i.e. tripping units having type property sets for electronic tripping defined). They are not applied to thermal, therma',
    applicableTo: ['IFCPROTECTIVEDEVICETRIPPINGUNIT', 'IFCPROTECTIVEDEVICETRIPPINGUNITELECTROMAGNETIC', 'IFCPROTECTIVEDEVICETRIPPINGUNITELECTRONIC', 'IFCPROTECTIVEDEVICETRIPPINGUNITRESIDUALCURRENT', 'IFCPROTECTIVEDEVICETRIPPINGUNITTHERMAL'],
    props: [
      { name: 'CurrentTolerance1', type: 'IfcReal', description: 'The tolerance for the current of time/current-curve in %.' },
      { name: 'CurrentTolerance2', type: 'IfcReal', description: 'The tolerance for the current of time/current-curve in % valid for times above CurrentTolereanceLimit1.' },
      { name: 'CurrentToleranceLimit1', type: 'IfcReal', description: 'The time limit in s limiting the application of CurrentTolerance1, if any. If the value is set to 0, the value of the Cu' },
      { name: 'IsCurrentTolerancePositiveOnly', type: 'IfcBoolean', description: 'Indication whether the value of CurrentTolerance1 is provided as a positive tolereance only or not. If not, the value is' },
      { name: 'IsOffWhenLfunctionOn', type: 'IfcBoolean', description: 'Indication whether the S-function is automatically switched off when the I-function is switched on.' },
      { name: 'IsSelectable', type: 'IfcBoolean', description: 'Indication whether something can be switched off or not.' },
      { name: 'IsTimeTolerancePositiveOnly', type: 'IfcBoolean', description: 'Indication whether the value of TimeTolerance1 is provided as a positive tolereance only or not. If not, the value is pr' },
      { name: 'NominalCurrentAdjusted', type: 'IfcBoolean', description: 'An indication if the tripping currents of the short time protection is related to the nominal current multiplied with th' },
      { name: 'ReleaseCurrent', type: 'IfcReal', description: 'The release current in x In for the initial tripping of the S-function.' },
      { name: 'ReleaseCurrentI2tEnd', type: 'IfcReal', description: 'The release current in x In.' },
      { name: 'ReleaseCurrentI2tStart', type: 'IfcReal', description: 'The release current in x In.' },
      { name: 'ReleaseTime', type: 'IfcReal', description: 'The release time in s for the initial tripping of the relevant part. This time indicates that for current lower than the' },
      { name: 'ReleaseTimeI2tEnd', type: 'IfcReal', description: 'The release time in s.' },
      { name: 'ReleaseTimeI2tStart', type: 'IfcReal', description: 'The release time in s.' },
      { name: 'TimeTolerance1', type: 'IfcReal', description: 'The tolerance for the time of time/current-curve in %.' },
      { name: 'TimeTolerance2', type: 'IfcReal', description: 'The tolerance for the time of the time/current-curve in % valid for currents above TimeToleranceLimit1.' },
      { name: 'TimeToleranceLimit1', type: 'IfcReal', description: 'The current limit in x In limiting the application of TimeTolerance1, if any. If the value is set to 0, the value of the' },
    ],
  },

  'Pset_ProtectiveDeviceTrippingUnitCurrentAdjustment': {
    label:       'Property Set: Protective Device Tripping Unit Current Adjustment',
    description: 'A set of current adjustment values that may be applied to an electronic or thermal tripping unit type.',
    applicableTo: ['IFCPROTECTIVEDEVICETRIPPINGUNIT', 'IFCPROTECTIVEDEVICETRIPPINGUNITELECTROMAGNETIC', 'IFCPROTECTIVEDEVICETRIPPINGUNITELECTRONIC', 'IFCPROTECTIVEDEVICETRIPPINGUNITRESIDUALCURRENT', 'IFCPROTECTIVEDEVICETRIPPINGUNITTHERMAL'],
    props: [
      { name: 'AdjustmentDesignation', type: 'IfcLabel', description: 'The desgnation on the device for the adjustment.' },
      { name: 'AdjustmentValueType', type: 'IfcLabel', description: 'The type of adjustment value that is applied through the property set. This determines the properties that should be ass' },
      { name: 'CurrentAdjustmentRange', type: 'IfcReal', description: 'Upper and lower current adjustment limits for an AdjustmentValueType = RANGE. Note that this property should not have a' },
      { name: 'CurrentAdjustmentRangeStepValue', type: 'IfcReal', description: 'Step value of current adjustment for an AdjustmentValueType = RANGE. Note that this property should not have a value for' },
      { name: 'CurrentAdjustmentValues', type: 'IfcReal', description: 'A list of current adjustment values that may be applied to a tripping unit for an AdjustmentValueType = LIST. A minimum' },
    ],
  },

  'Pset_ProtectiveDeviceTrippingUnitTimeAdjustment': {
    label:       'Property Set: Protective Device Tripping Unit Time Adjustment',
    description: 'A set of time adjustment values that may be applied to an electronic or thermal tripping unit type.',
    applicableTo: ['IFCPROTECTIVEDEVICETRIPPINGUNIT', 'IFCPROTECTIVEDEVICETRIPPINGUNITELECTROMAGNETIC', 'IFCPROTECTIVEDEVICETRIPPINGUNITELECTRONIC', 'IFCPROTECTIVEDEVICETRIPPINGUNITRESIDUALCURRENT', 'IFCPROTECTIVEDEVICETRIPPINGUNITTHERMAL'],
    props: [
      { name: 'AdjustmentDesignation', type: 'IfcLabel', description: 'The desgnation on the device for the adjustment.' },
      { name: 'AdjustmentValueType', type: 'IfcLabel', description: 'The type of adjustment value that is applied through the property set. This determines the properties that should be ass' },
      { name: 'CurrentForTimeDelay', type: 'IfcReal', description: 'The tripping current in x In at which the time delay is specified. A value for this property should only be asserted for' },
      { name: 'I2TApplicability', type: 'IfcLabel', description: 'The applicability of the time adjustment related to the tripping function.' },
      { name: 'TimeAdjustmentRange', type: 'IfcReal', description: 'Upper and lower time adjustment limits for an AdjustmentValueType = RANGE. Note that this property should not have a val' },
      { name: 'TimeAdjustmentRangeStepValue', type: 'IfcReal', description: 'Step value of time adjustment for an AdjustmentValueType = RANGE. Note that this property should not have a value for an' },
      { name: 'TimeAdjustmentValues', type: 'IfcReal', description: 'A list of time adjustment values that may be applied to a tripping unit for an AdjustmentValueType = LIST. A minimum of' },
    ],
  },

  'Pset_ProtectiveDeviceTrippingUnitTypeCommon': {
    label:       'Property Set: Protective Device Tripping Unit Type Common',
    description: 'Common information concerning tripping units that area associated with protective devices',
    applicableTo: ['IFCPROTECTIVEDEVICETRIPPINGUNIT', 'IFCPROTECTIVEDEVICETRIPPINGUNITELECTROMAGNETIC', 'IFCPROTECTIVEDEVICETRIPPINGUNITELECTRONIC', 'IFCPROTECTIVEDEVICETRIPPINGUNITRESIDUALCURRENT', 'IFCPROTECTIVEDEVICETRIPPINGUNITTHERMAL'],
    props: [
      { name: 'AtexVerified', type: 'IfcBoolean', description: 'An indication whether the tripping_unit is verified to be applied in EX-environment or not.' },
      { name: 'LimitingTerminalSize', type: 'IfcReal', description: 'The maximum terminal size capacity of the device.' },
      { name: 'OldDevice', type: 'IfcBoolean', description: 'Indication whether the protection_ unit is out-dated or not. If not out-dated, the device is still for sale.' },
      { name: 'Standard', type: 'IfcLabel', description: 'The designation of the standard applicable for the definition of the object used.' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'UseInDiscrimination', type: 'IfcBoolean', description: 'An indication whether the time/current tripping information can be applied in a discrimination; analysis or not.' },
    ],
  },

  'Pset_ProtectiveDeviceTrippingUnitTypeElectroMagnet': {
    label:       'Property Set: Protective Device Tripping Unit Type Electro Magnetic',
    description: 'Information on tripping units that are electrically or magnetically tripped.',
    applicableTo: ['IFCPROTECTIVEDEVICETRIPPINGUNITELECTROMAGNETIC'],
    props: [
    ],
  },

  'Pset_ProtectiveDeviceTrippingUnitTypeElectronic': {
    label:       'Property Set: Protective Device Tripping Unit Type Electronic',
    description: 'Information on tripping units that are electronically tripped.',
    applicableTo: ['IFCPROTECTIVEDEVICETRIPPINGUNITELECTRONIC'],
    props: [
      { name: 'ElectronicTrippingUnitType', type: 'IfcLabel', description: 'A list of the available types of electronic tripping unit from which that required may be selected.' },
      { name: 'N_Protection', type: 'IfcBoolean', description: 'An indication whether the electronic tripping unit has separate protection for the N conductor, or not.' },
      { name: 'N_Protection_100', type: 'IfcBoolean', description: 'An indication whether the electronic tripping unit is tripping if the current in the N conductor is more than 100% of th' },
      { name: 'N_Protection_50', type: 'IfcBoolean', description: 'An indication whether the electronic tripping unit is tripping if the current in the N conductor is more than 50% of tha' },
      { name: 'N_Protection_Select', type: 'IfcBoolean', description: 'An indication whether the use of the N_Protection can be selected by the user or not. If both the properties N_Protectio' },
      { name: 'NominalCurrents', type: 'IfcReal', description: 'A set of values providing information on available modules (chips) for setting the nominal current of the protective dev' },
    ],
  },

  'Pset_ProtectiveDeviceTrippingUnitTypeResidualCurre': {
    label:       'Property Set: Protective Device Tripping Unit Type Residual Current',
    description: 'Information on tripping units that are activated by residual current.',
    applicableTo: ['IFCPROTECTIVEDEVICETRIPPINGUNITRESIDUALCURRENT'],
    props: [
    ],
  },

  'Pset_ProtectiveDeviceTrippingUnitTypeThermal': {
    label:       'Property Set: Protective Device Tripping Unit Type Thermal',
    description: 'Information on tripping units that are thermally tripped.',
    applicableTo: ['IFCPROTECTIVEDEVICETRIPPINGUNITTHERMAL'],
    props: [
      { name: 'CurveDesignation', type: 'IfcLabel', description: 'The designation of the trippingcurve given by the manufacturer. For a MCB the designation should be in accordance with t' },
      { name: 'DefinedTemperature', type: 'IfcReal', description: 'The ambient temperature at which the thermal current/time-curve associated with this protection device is defined.' },
      { name: 'I1', type: 'IfcReal', description: 'The (thermal) lower testing current limit in x In, indicating that for currents lower than I1, the tripping time shall b' },
      { name: 'I2', type: 'IfcReal', description: 'The (thermal) upper testing current limit in x In, indicating that for currents larger than I2, the tripping time shall' },
      { name: 'T2', type: 'IfcReal', description: 'The (thermal) testing time in s associated with the testing currents I1 and I2.' },
      { name: 'TemperatureFactor', type: 'IfcReal', description: 'The correction factor (typically measured as %/deg K) for adjusting the thermal current/time to an ambient temperature d' },
      { name: 'ThermalTrippingUnitType', type: 'IfcLabel', description: 'A list of the available types of thermal tripping unit from which that required may be selected.' },
    ],
  },

  'Pset_ProtectiveDeviceTypeAntiArcingDevice': {
    label:       'Property Set: Protective Device Type Anti Arcing Device',
    description: 'Anti arcing device properties used in energy domain. The property set can be used by the predefined type ANTI_ARCING_DEVICE of [[IfcProtectiveDevice]].',
    applicableTo: ['IFCPROTECTIVEDEVICEANTI_ARCING_DEVICE'],
    props: [
      { name: 'GroundingType', type: 'IfcLabel', description: 'The type of grounding connection.' },
      { name: 'RatedVoltage', type: 'IfcReal', description: 'The range of allowed voltage that a device is certified to handle. The upper bound of this value is the maximum.' },
    ],
  },

  'Pset_ProtectiveDeviceTypeCircuitBreaker': {
    label:       'Property Set: Protective Device Type Circuit Breaker',
    description: 'A coherent set of attributes representing different capacities of a circuit breaker or of a motor protection device, defined in accordance with IEC 60947. Note - A protective devic',
    applicableTo: ['IFCPROTECTIVEDEVICECIRCUITBREAKER'],
    props: [
      { name: 'ICM60947', type: 'IfcReal', description: 'The making capacity in A for a circuit breaker or motor protection device tested in accordance with the IEC 60947 series' },
      { name: 'ICS60947', type: 'IfcReal', description: 'The service breaking capacity in A for an object tested in accordance with the IEC 60947 series.' },
      { name: 'ICU60947', type: 'IfcReal', description: 'The ultimate breaking capacity in A for an object tested in accordance with the IEC 60947 series.' },
      { name: 'ICW60947', type: 'IfcReal', description: 'The thermal withstand current in A for a circuit breaker or motor protection device tested in accordance with the IEC 60' },
      { name: 'PerformanceClasses', type: 'IfcLabel', description: 'A set of designations of performance classes for the breaker unit for which the data of this instance is valid.' },
      { name: 'VoltageLevel', type: 'IfcLabel', description: 'The voltage levels for which the data of the instance is valid. More than one value may be selected in the enumeration.' },
    ],
  },

  'Pset_ProtectiveDeviceTypeCommon': {
    label:       'Property Set: Protective Device Type Common',
    description: 'Properties that are applied to a definition of a protective device.',
    applicableTo: ['IFCPROTECTIVEDEVICE', 'IFCPROTECTIVEDEVICEANTI_ARCING_DEVICE', 'IFCPROTECTIVEDEVICECIRCUITBREAKER', 'IFCPROTECTIVEDEVICEEARTHINGSWITCH', 'IFCPROTECTIVEDEVICEEARTHLEAKAGECIRCUITBREAKER', 'IFCPROTECTIVEDEVICEFUSEDISCONNECTOR', 'IFCPROTECTIVEDEVICERESIDUALCURRENTCIRCUITBREAKER', 'IFCPROTECTIVEDEVICERESIDUALCURRENTSWITCH', 'IFCPROTECTIVEDEVICESPARKGAP', 'IFCPROTECTIVEDEVICEVARISTOR', 'IFCPROTECTIVEDEVICEVOLTAGELIMITER'],
    props: [
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_ProtectiveDeviceTypeEarthLeakageCircuitBreake': {
    label:       'Property Set: Protective Device Type Earth Leakage Circuit Breaker',
    description: 'An earth failure device acts to protect people and equipment from the effects of current leakage.',
    applicableTo: ['IFCPROTECTIVEDEVICEEARTHLEAKAGECIRCUITBREAKER'],
    props: [
    ],
  },

  'Pset_ProtectiveDeviceTypeFuseDisconnector': {
    label:       'Property Set: Protective Device Type Fuse Disconnector',
    description: 'A coherent set of attributes representing the breaking capacity of a fuse, defined in accordance with IEC 60269. Note - A protective device may be associated with different instanc',
    applicableTo: ['IFCPROTECTIVEDEVICEFUSEDISCONNECTOR'],
    props: [
      { name: 'ArcExtinctionType', type: 'IfcLabel', description: 'Type of arc extinction used.' },
      { name: 'BreakingCapacity', type: 'IfcReal', description: 'The current that a fuse, circuit breaker, or other electrical apparatus is able to interrupt without being destroyed or' },
      { name: 'FuseDisconnectorType', type: 'IfcLabel', description: 'A fuse whose characteristic is specifically designed for the protection of a motor or generator.;A switch disconnector i' },
      { name: 'IC60269', type: 'IfcReal', description: 'The breaking capacity in A for fuses in accordance with the IEC 60269 series.' },
      { name: 'NominalCurrent', type: 'IfcReal', description: 'The nominal current that is designed to be measured.' },
      { name: 'NominalFrequency', type: 'IfcReal', description: 'The nominal frequency of the supply.' },
      { name: 'NumberOfPhases', type: 'IfcInteger', description: 'Number of phases that the equipment operates on.' },
      { name: 'NumberOfPoles', type: 'IfcInteger', description: 'Number of poles that the object would affect.' },
      { name: 'PowerLoss', type: 'IfcReal', description: 'The power loss in W.' },
      { name: 'RatedVoltage', type: 'IfcReal', description: 'The range of allowed voltage that a device is certified to handle. The upper bound of this value is the maximum.' },
      { name: 'ReferenceEnvironmentTemperature', type: 'IfcReal', description: 'Ideal temperature range.' },
      { name: 'TransformationRatio', type: 'IfcReal', description: 'The ratio of the actual primary current or voltage to the actual secondary current or voltage.' },
      { name: 'VoltageLevel', type: 'IfcLabel', description: 'The voltage levels for which the data of the instance is valid. More than one value may be selected in the enumeration.' },
    ],
  },

  'Pset_ProtectiveDeviceTypeResidualCurrentCircuitBre': {
    label:       'Property Set: Protective Device Type Residual Current Circuit Breaker',
    description: 'A residual current circuit breaker opens, closes or isolates a circuit and has short circuit and overload protection.',
    applicableTo: ['IFCPROTECTIVEDEVICERESIDUALCURRENTCIRCUITBREAKER'],
    props: [
    ],
  },

  'Pset_ProtectiveDeviceTypeResidualCurrentSwitch': {
    label:       'Property Set: Protective Device Type Residual Current Switch',
    description: 'A residual current switch opens, closes or isolates a circuit and has no short circuit or overload protection.',
    applicableTo: ['IFCPROTECTIVEDEVICERESIDUALCURRENTSWITCH'],
    props: [
      { name: 'Sensitivity', type: 'IfcReal', description: 'Sensitivity.' },
    ],
  },

  'Pset_ProtectiveDeviceTypeSparkGap': {
    label:       'Property Set: Protective Device Type Spark Gap',
    description: 'Spark gap properties used in energy domain. The property set can be used by the predefined type SPARKGAP and VOLTAGELIMITER of [[IfcProtectiveDevice]].',
    applicableTo: ['IFCPROTECTIVEDEVICESPARKGAP', 'IFCPROTECTIVEDEVICEVOLTAGELIMITER'],
    props: [
      { name: 'BreakdownVoltageTolerance', type: 'IfcReal', description: 'Nominal value of the spark gap breakdown voltage tolerance.' },
      { name: 'Capacitance', type: 'IfcReal', description: 'Maximum value of the capacitance between the electrodes at specified frequency and temperature.' },
      { name: 'CurrentRMS', type: 'IfcReal', description: 'Maximum rms (root mean square) current of an electric-electronic or electromechanical component at specified ambient tem' },
      { name: 'PowerDissipation', type: 'IfcReal', description: 'Permissible power which may be dissipated continuously, at specified conditions.' },
      { name: 'Resistivity', type: 'IfcReal', description: 'Electrical resistivity of a rock or soil (Ohm-m).' },
      { name: 'SparkGapType', type: 'IfcLabel', description: 'Type of Spark gap.' },
    ],
  },

  'Pset_ProtectiveDeviceTypeVaristor': {
    label:       'Property Set: Protective Device Type Varistor',
    description: 'A high voltage surge protection device.',
    applicableTo: ['IFCPROTECTIVEDEVICEVARISTOR'],
    props: [
      { name: 'CharacteristicFunction', type: 'IfcLabel', description: 'The characteristic function to show the relationship between varistor current and voltage.' },
      { name: 'VaristorType', type: 'IfcLabel', description: 'A list of the available types of varistor from which that required may be selected.' },
    ],
  },

  'Pset_ProvisionForVoid': {
    label:       'Property Set: Provision For Void',
    description: 'Properties for Provisions For Voids.',
    applicableTo: ['IFCVIRTUALELEMENTPROVISIONFORVOID'],
    props: [
      { name: 'Depth', type: 'IfcReal', description: 'The depth of the object.' },
      { name: 'Diameter', type: 'IfcReal', description: 'The Diameter of the object.' },
      { name: 'Height', type: 'IfcReal', description: 'Characteristic height' },
      { name: 'System', type: 'IfcLabel', description: 'The building service system that requires the provision for voids, e.g. \\\'Air Conditioning\\\', \\\'Plumbing\\\', \\\'Electro\\\', etc.' },
      { name: 'VoidShape', type: 'IfcLabel', description: 'The shape form of the provision for void, the minimum set of agreed values includes \\\'Rectangle\\\', \\\'Round\\\', and \\\'Undefined' },
      { name: 'Width', type: 'IfcReal', description: 'The width of the object. Only given, if the object has constant thickness (prismatic).' },
    ],
  },

  'Pset_PumpOccurrence': {
    label:       'Property Set: Pump Occurrence',
    description: 'Pump occurrence attributes attached to an instance of [[IfcPump]].',
    applicableTo: ['IFCPUMP', 'IFCPUMPCIRCULATOR', 'IFCPUMPENDSUCTION', 'IFCPUMPSPLITCASE', 'IFCPUMPSUBMERSIBLEPUMP', 'IFCPUMPSUMPPUMP', 'IFCPUMPVERTICALINLINE', 'IFCPUMPVERTICALTURBINE'],
    props: [
      { name: 'BaseType', type: 'IfcLabel', description: 'Defines general types of pump bases.Frame.;Base.;There is no pump base, such as an inline pump.;Other type of pump base.' },
      { name: 'DriveConnectionType', type: 'IfcLabel', description: 'The way the pump drive mechanism is connected to the pump.Direct drive.;Belt drive.;Coupling.;Other type of drive connec' },
      { name: 'ImpellerDiameter', type: 'IfcReal', description: 'Diameter of object - used to scale performance of geometrically similar objects.' },
    ],
  },

  'Pset_PumpPHistory': {
    label:       'Property Set: Pump Phistory',
    description: 'Pump performance history attributes.',
    applicableTo: ['IFCPUMP', 'IFCPUMPCIRCULATOR', 'IFCPUMPENDSUCTION', 'IFCPUMPSPLITCASE', 'IFCPUMPSUBMERSIBLEPUMP', 'IFCPUMPSUMPPUMP', 'IFCPUMPVERTICALINLINE', 'IFCPUMPVERTICALTURBINE'],
    props: [
      { name: 'Flowrate', type: 'IfcTimeSeries', description: 'The flowrate of the fluid.' },
      { name: 'MechanicalEfficiency', type: 'IfcTimeSeries', description: 'The objects operational mechanical efficiency.' },
      { name: 'OverallEfficiency', type: 'IfcTimeSeries', description: 'Total efficiency of object.' },
      { name: 'PowerHistory', type: 'IfcTimeSeries', description: 'The actual power consumption of the pump.' },
      { name: 'PressureRise', type: 'IfcTimeSeries', description: 'The developed pressure.' },
      { name: 'RotationSpeed', type: 'IfcTimeSeries', description: 'Pump rotational speed.' },
    ],
  },

  'Pset_PumpTypeCommon': {
    label:       'Property Set: Pump Type Common',
    description: 'Common attributes of a pump type.',
    applicableTo: ['IFCPUMP', 'IFCPUMPCIRCULATOR', 'IFCPUMPENDSUCTION', 'IFCPUMPSPLITCASE', 'IFCPUMPSUBMERSIBLEPUMP', 'IFCPUMPSUMPPUMP', 'IFCPUMPVERTICALINLINE', 'IFCPUMPVERTICALTURBINE'],
    props: [
      { name: 'ConnectionSize', type: 'IfcReal', description: 'The connection size of the object.' },
      { name: 'FlowRateRange', type: 'IfcReal', description: 'Allowable range of volume of fluid being pumped against the resistance specified.' },
      { name: 'FlowResistanceRange', type: 'IfcReal', description: 'Allowable range of frictional resistance against which the fluid is being pumped.' },
      { name: 'NetPositiveSuctionHead', type: 'IfcReal', description: 'Minimum liquid pressure at the pump inlet to prevent cavitation.' },
      { name: 'NominalRotationSpeed', type: 'IfcReal', description: 'Rotational speed of the object under nominal conditions.' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'TemperatureRange', type: 'IfcReal', description: 'Allowable maximum and minimum temperature.' },
    ],
  },

  'Pset_QuayCommon': {
    label:       'Property Set: Quay Common',
    description: 'Properties common to the definition of all occurrences of [[IfcMarineFacility]] with the predefined type set to QUAY.',
    applicableTo: ['IFCMARINEFACILITYQUAY'],
    props: [
      { name: 'BentSpacing', type: 'IfcReal', description: 'Bent (upright) spacing' },
      { name: 'Elevation', type: 'IfcReal', description: 'Elevation of the entity' },
      { name: 'QuaySectionType', type: 'IfcLabel', description: 'Whether the structure presents a solid/closed barrier to the passage of water or is open.' },
      { name: 'StructuralType', type: 'IfcLabel', description: 'Structural type of the object' },
    ],
  },

  'Pset_QuayDesignCriteria': {
    label:       'Property Set: Quay Design Criteria',
    description: 'Properties common to the definition of design criteria of all occurrences of [[IfcMarineFacility]] with the predefined type set to QUAY.',
    applicableTo: ['IFCMARINEFACILITYQUAY'],
    props: [
      { name: 'EquipmentLoading', type: 'IfcReal', description: 'Loading from equipment' },
      { name: 'ExtremeHighWaterLevel', type: 'IfcReal', description: 'Extreme high water level' },
      { name: 'ExtremeLowWaterLevel', type: 'IfcReal', description: 'Extreme low water level' },
      { name: 'FlowLoading', type: 'IfcReal', description: 'Flow loading force' },
      { name: 'HighWaterLevel', type: 'IfcReal', description: 'High water level' },
      { name: 'LowWaterLevel', type: 'IfcReal', description: 'Low water level' },
      { name: 'ShipLoading', type: 'IfcReal', description: 'Ship loading force' },
      { name: 'UniformlyDistributedLoad', type: 'IfcReal', description: 'Uniformly Distributed Load' },
      { name: 'WaveLoading', type: 'IfcReal', description: 'Wave loading force' },
    ],
  },

  'Pset_RadiiKerbStone': {
    label:       'Property Set: Radii Kerb Stone',
    description: 'Properties describing the keb stone radii.',
    applicableTo: ['IFCKERB'],
    props: [
      { name: 'CurveShape', type: 'IfcLabel', description: 'Shape according to CurveShapeEnum' },
      { name: 'Radius', type: 'IfcReal', description: 'The radius of the object. The size information is provided in addition to the shape representation and the geometric par' },
    ],
  },

  'Pset_RailTypeBlade': {
    label:       'Property Set: Rail Type Blade',
    description: 'Properties common to [[IfcRail]] types and occurrences with PredefinedType set to BLADE.',
    applicableTo: ['IFCRAILBLADE'],
    props: [
      { name: 'BladeRadius', type: 'IfcReal', description: 'The radius of the blade bend defined as design parameter.' },
      { name: 'IsArticulatedBlade', type: 'IfcBoolean', description: 'Indicates whether the blade is articulated or not.' },
      { name: 'IsFallbackBlade', type: 'IfcBoolean', description: 'Indicates whether the blade always returns to the same position as a trailable turnout or not.' },
      { name: 'NominalLength', type: 'IfcReal', description: 'The nominal overall length of the object. The size information is provided in addition to the shape representation and t' },
    ],
  },

  'Pset_RailTypeCheckRail': {
    label:       'Property Set: Rail Type Check Rail',
    description: 'Properties common to [[IfcRail]] types and occurrences with PredefinedType set to CHECKRAIL.',
    applicableTo: ['IFCRAILCHECKRAIL'],
    props: [
      { name: 'CheckRailType', type: 'IfcLabel', description: 'Type of the check rail. Check rail types enumerated in this property are defined based on EN 13674.' },
      { name: 'InstallationPlan', type: 'IfcTimeSeries', description: 'Reference to external information source about installation or construction plan of the element.' },
    ],
  },

  'Pset_RailTypeGuardRail': {
    label:       'Property Set: Rail Type Guard Rail',
    description: 'Properties common to [[IfcRail]] types and occurrences with PredefinedType set to GUARDRAIL.',
    applicableTo: ['IFCRAILGUARDRAIL'],
    props: [
      { name: 'GuardRailConnection', type: 'IfcLabel', description: 'Indicates how the guard rail is connected along its length, when the fasteners are not explicitly modelled.' },
      { name: 'GuardRailType', type: 'IfcLabel', description: 'Type of the guard rail.' },
      { name: 'PositionInTrack', type: 'IfcLabel', description: 'Indicates the relative position of the element in track, which lies to the left or right as facing in the direction of i' },
    ],
  },

  'Pset_RailTypeRail': {
    label:       'Property Set: Rail Type Rail',
    description: 'Properties common to [[IfcRail]] types and occurrences with PredefinedType set to RAIL.',
    applicableTo: ['IFCRAILRAIL'],
    props: [
      { name: 'DrillOnRail', type: 'IfcLabel', description: 'Indicates if the manufactured rail is drilled at its extremities or not. It can have holes on one, both or none of its e' },
      { name: 'InstallationPlan', type: 'IfcTimeSeries', description: 'Reference to external information source about installation or construction plan of the element.' },
      { name: 'IsStainless', type: 'IfcBoolean', description: 'Indicates whether the rail is stainless or not.' },
      { name: 'MinimumTensileStrength', type: 'IfcReal', description: 'Indicates the minimum tensile strength.' },
      { name: 'PositionInTrack', type: 'IfcLabel', description: 'Indicates the relative position of the element in track, which lies to the left or right as facing in the direction of i' },
      { name: 'RailCondition', type: 'IfcLabel', description: 'Assessment of the condition of the rail at point of installation.' },
      { name: 'RailDeliveryState', type: 'IfcLabel', description: 'The delivery state of rail, which indicates the final treatment at the end in manufacturing.' },
      { name: 'RailElementaryLength', type: 'IfcLabel', description: 'The standardised length of rail supplied from the manufacturer.' },
      { name: 'TechnicalStandard', type: 'IfcTimeSeries', description: 'The technical standard which the element should comply with.' },
    ],
  },

  'Pset_RailTypeStockRail': {
    label:       'Property Set: Rail Type Stock Rail',
    description: 'Properties common to [[IfcRail]] types and occurrences with PredefinedType set to STOCKRAIL.',
    applicableTo: ['IFCRAILSTOCKRAIL'],
    props: [
      { name: 'InstallationPlan', type: 'IfcTimeSeries', description: 'Reference to external information source about installation or construction plan of the element.' },
      { name: 'NominalLength', type: 'IfcReal', description: 'The nominal overall length of the object. The size information is provided in addition to the shape representation and t' },
      { name: 'StockRailRadius', type: 'IfcReal', description: 'The radius of the stock rail bend defined as design parameter.' },
    ],
  },

  'Pset_RailingCommon': {
    label:       'Property Set: Railing Common',
    description: 'Properties common to the definition of all occurrences of [[IfcRailing]].',
    applicableTo: ['IFCRAILING', 'IFCRAILINGBALUSTRADE', 'IFCRAILINGFENCE', 'IFCRAILINGGUARDRAIL', 'IFCRAILINGHANDRAIL'],
    props: [
      { name: 'Diameter', type: 'IfcReal', description: 'The Diameter of the object.' },
      { name: 'Height', type: 'IfcReal', description: 'Characteristic height' },
      { name: 'IsExternal', type: 'IfcBoolean', description: 'Indication whether the element is designed for use in the exterior (TRUE) or not (FALSE). If (TRUE) it is an external el' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_RailwayBalise': {
    label:       'Property Set: Railway Balise',
    description: 'Properties applicable to a railway balise. This property set is applied to a type or occurrence of [[IfcCommunicationsAppliance]] with predefined type TRANSPONDER.',
    applicableTo: ['IFCCOMMUNICATIONSAPPLIANCETRANSPONDER'],
    props: [
      { name: 'DetectionRange', type: 'IfcReal', description: 'The detection range of the equipment.' },
      { name: 'FailureInformation', type: 'IfcLabel', description: 'The information for failure description.' },
      { name: 'InformationLength', type: 'IfcInteger', description: 'Indicates supported bytes of the data Information, e.g.127 bytes.' },
      { name: 'IP_Code', type: 'IfcLabel', description: 'IP Code, the International Protection Marking, IEC 60529), classifies and rates the degree of protection provided agains' },
      { name: 'NominalHeight', type: 'IfcReal', description: 'The nominal height of the object. The size information is provided in addition to the shape representation and the geome' },
      { name: 'NominalLength', type: 'IfcReal', description: 'The nominal overall length of the object. The size information is provided in addition to the shape representation and t' },
      { name: 'NominalWeight', type: 'IfcReal', description: 'Nominal weight of the object.' },
      { name: 'NominalWidth', type: 'IfcReal', description: 'The nominal overall width of the object. The size information is provided in addition to the shape representation and th' },
      { name: 'OperationalTemperatureRange', type: 'IfcReal', description: 'The temperature range in which the device operates normally.' },
      { name: 'RailwayBaliseType', type: 'IfcLabel', description: 'Type of the railway balise.' },
      { name: 'TransmissionRate', type: 'IfcInteger', description: 'Data transmission rate between the device and the receiving module in bits per second.' },
    ],
  },

  'Pset_RailwayCableCarrier': {
    label:       'Property Set: Railway Cable Carrier',
    description: 'Common properties for cable carrier segments constructed in railway projects.',
    applicableTo: ['IFCCABLECARRIERSEGMENT', 'IFCCABLECARRIERSEGMENTCABLEBRACKET', 'IFCCABLECARRIERSEGMENTCABLELADDERSEGMENT', 'IFCCABLECARRIERSEGMENTCABLETRAYSEGMENT', 'IFCCABLECARRIERSEGMENTCABLETRUNKINGSEGMENT', 'IFCCABLECARRIERSEGMENTCATENARYWIRE', 'IFCCABLECARRIERSEGMENTCONDUITSEGMENT', 'IFCCABLECARRIERSEGMENTDROPPER'],
    props: [
      { name: 'NumberOfCrossedTracks', type: 'IfcInteger', description: 'Number of tracks crossed in cable route.' },
    ],
  },

  'Pset_RailwayLevelCrossing': {
    label:       'Property Set: Railway Level Crossing',
    description: 'Properties applicable to [[IfcFacilityPartCommon]] with PredefinedType set to LEVELCROSSING.',
    applicableTo: ['IFCFACILITYPARTCOMMONLEVELCROSSING'],
    props: [
      { name: 'HasRailDrainage', type: 'IfcBoolean', description: 'Indicates whether there is rail drainage or not.' },
      { name: 'IsAccessibleByVehicle', type: 'IfcBoolean', description: 'Indicates whether the element is accessible by a vehicle or not.' },
      { name: 'IsExceptionalTransportRoute', type: 'IfcBoolean', description: 'Indicates whether the route is suitable for exceptional transport (load, structure gauge, road),' },
      { name: 'IsPrivateOwner', type: 'IfcBoolean', description: 'Indicates if the owner of the crossed road is private or not.' },
      { name: 'IsSecuredBySignalingSystem', type: 'IfcBoolean', description: 'Indicates whether the level crossing is secured by a signalling system or not.' },
      { name: 'PermissiblePavementLoad', type: 'IfcReal', description: 'Permissible traffic load on the pavement.' },
    ],
  },

  'Pset_RailwaySignalAspect': {
    label:       'Property Set: Railway Signal Aspect',
    description: 'Properties in this property set are applicable for [[IfcSignal]] and [[IfcSign]] applied in railways. These properties describe the signal aspect, which is the information on the s',
    applicableTo: ['IFCSIGN', 'IFCSIGNMARKER', 'IFCSIGNMIRROR', 'IFCSIGNPICTORAL', 'IFCSIGNAL', 'IFCSIGNALAUDIO', 'IFCSIGNALMIXED', 'IFCSIGNALVISUAL'],
    props: [
      { name: 'AppliesToTrainCategory', type: 'IfcLabel', description: 'Sign information relative to train category, e.g. freight, passenger.' },
      { name: 'SignalAspectSymbol', type: 'IfcTimeSeries', description: 'Content which is shown on the signal or sign, e.g. text, number, arrow or icon.' },
      { name: 'SignalAspectType', type: 'IfcLabel', description: 'The type of aspect, e.g. 2-display aspect for distant signal, 3-display aspect for block signal.' },
      { name: 'SignLegend', type: 'IfcLabel', description: 'Text information written on the signal or sign.' },
    ],
  },

  'Pset_RailwaySignalOccurrence': {
    label:       'Property Set: Railway Signal Occurrence',
    description: 'Properties common to the definition of occurrences of [[IfcSignal]] applied in railways.',
    applicableTo: ['IFCSIGNAL', 'IFCSIGNALAUDIO', 'IFCSIGNALMIXED', 'IFCSIGNALVISUAL'],
    props: [
      { name: 'ApproachSpeed', type: 'IfcReal', description: 'The design speed of trains approaching the signal if different from the line speed.' },
      { name: 'DistanceToStopMark', type: 'IfcReal', description: 'Distance from the signal to the nearest stop mark at a platform.' },
      { name: 'HandSignallingProhibited', type: 'IfcBoolean', description: 'Indicates if hand signalling is prohibited in case of any failure.' },
      { name: 'HinderingObstaclesDescription', type: 'IfcLabel', description: 'Description of obstacles that hinder the visibility for the staff in the station.' },
      { name: 'LimitedClearances', type: 'IfcLabel', description: 'tunnels, bridges, viaducts.' },
      { name: 'NumberOfLampsNotUsed', type: 'IfcInteger', description: 'Number of lamps which are not needed and blanked out (sealed).' },
      { name: 'RequiresBannerSignal', type: 'IfcBoolean', description: 'Indicates whether a banner repeater signal is required.' },
      { name: 'RequiresOLEMesh', type: 'IfcBoolean', description: 'Indicates whether an OLE mesh is required to protect the signal or maintainer.' },
      { name: 'RequiresSafetyHandrail', type: 'IfcBoolean', description: 'Indicates whether a safety handrail is required.' },
      { name: 'SignalPostTelephoneID', type: 'IfcLabel', description: 'The identifier of the signal post telephone attached to the signal.' },
      { name: 'SignalPostTelephoneType', type: 'IfcLabel', description: 'Indicates the type of the signal post telephone, e.g. locked, direct line, dial phone.' },
      { name: 'SignalWalkwayLength', type: 'IfcReal', description: 'Indicates the length of the walkway from signal to signal post telephone.' },
      { name: 'SpecialPositionArrangement', type: 'IfcLabel', description: 'Type of special position at which the signal is placed.' },
    ],
  },

  'Pset_RailwaySignalSighting': {
    label:       'Property Set: Railway Signal Sighting',
    description: 'Properties that define information about signal sighting or visibility in railways. These properties are applicable to occurrences of [[IfcSignal]] and [[IfcSign]].',
    applicableTo: ['IFCSIGN', 'IFCSIGNMARKER', 'IFCSIGNMIRROR', 'IFCSIGNPICTORAL', 'IFCSIGNAL', 'IFCSIGNALAUDIO', 'IFCSIGNALMIXED', 'IFCSIGNALVISUAL'],
    props: [
      { name: 'SignalSightingAchievableDistance', type: 'IfcReal', description: 'Reading distance of the signal, which is achievable with the help of mitigation works.' },
      { name: 'SignalSightingAvailableDistance', type: 'IfcReal', description: 'Reading distance of the signal without having any mitigation works.' },
      { name: 'SignalSightingCombinedWithRepeater', type: 'IfcReal', description: 'Combined reading distance for the signal and any associated repeaters.' },
      { name: 'SignalSightingMinimum', type: 'IfcReal', description: 'Minimal distance in which the signal has to be readable.' },
      { name: 'SignalSightingPreferred', type: 'IfcReal', description: 'Preferred distance in which the signal shall be readable.' },
      { name: 'SignalSightingRouteIndicator', type: 'IfcReal', description: 'Required reading distance for the route indicator.' },
      { name: 'SignalViewingMinimumInFront', type: 'IfcReal', description: 'Smallest distance where the signal has to be readable (for train very close to the signal).' },
    ],
  },

  'Pset_RailwaySignalType': {
    label:       'Property Set: Railway Signal Type',
    description: 'Properties common to the definition of occurrences and types of [[IfcSignal]] applied in railways.',
    applicableTo: ['IFCSIGNAL', 'IFCSIGNALAUDIO', 'IFCSIGNALMIXED', 'IFCSIGNALVISUAL'],
    props: [
      { name: 'HasConductorRailGuardBoard', type: 'IfcBoolean', description: 'Indicates if a guard board is provided.' },
      { name: 'HotStripOrientation', type: 'IfcLabel', description: 'Position of the hot strip, which indicates the direction of the focus of the light beam and is given in terms like \\\'left' },
      { name: 'IsHighType', type: 'IfcBoolean', description: 'Indicates if the signal is high (TRUE) or dwarf (ground mounted) (FALSE).' },
      { name: 'LensDiffuserOrientation', type: 'IfcLabel', description: 'Orientation the lens diffuser has to have, which indicates the direction of the lens diffuser and is given in terms like' },
      { name: 'LensDiffuserType', type: 'IfcLabel', description: 'Type of the lens diffuser the signal is equipped with.' },
      { name: 'MaximumDisplayDistance', type: 'IfcReal', description: 'The maximum distance that can be displayed. The value relates only to the signal type, not to the circumstances at a spe' },
      { name: 'NumberOfLamps', type: 'IfcInteger', description: 'Number of lamps the signal is composed of.' },
      { name: 'RailwaySignalType', type: 'IfcLabel', description: 'The type of railway signal, e.g. home signal, starting signal, shunting signal, level crossing signal.' },
      { name: 'RequiredDisplayDistance', type: 'IfcReal', description: 'The required distance that has to be displayed. The value relates only to the signal type, not to the circumstances at a' },
      { name: 'SignalHoodLength', type: 'IfcReal', description: 'Nominal length of the signal hood, which is the signal lamp cover against glaring sun.' },
      { name: 'SignalIndicatorType', type: 'IfcLabel', description: 'Type of the indicators on a signal, e.g. route indicator, speed restriction indicator etc.' },
      { name: 'SignalMessage', type: 'IfcLabel', description: 'All possible message available at this signal, e.g. \\\'3/4- display automatic blocking\\\'.' },
    ],
  },

  'Pset_RailwayTrackStructurePart': {
    label:       'Property Set: Railway Track Structure Part',
    description: 'Properties applicable to [[IfcRailwayPart]] with PredefinedType set to TRACK, or more specialized types including PLAINTRACK, TURNOUTTRACK, DILATATIONTRACK or TRACKPART.',
    applicableTo: ['IFCRAILWAYPARTDILATIONTRACK', 'IFCRAILWAYPARTPLAINTRACK', 'IFCRAILWAYPARTTRACK', 'IFCRAILWAYPARTTRACKPART', 'IFCRAILWAYPARTTURNOUTTRACK'],
    props: [
      { name: 'HasBallastTrack', type: 'IfcBoolean', description: 'Indicates whether the track has ballast or not.' },
      { name: 'HasCWR', type: 'IfcBoolean', description: 'Indicates if the track has continuous welded rails.' },
      { name: 'IsSunExposed', type: 'IfcBoolean', description: 'Indicates if the object is in exposed position to sunshine.' },
      { name: 'TrackSupportingStructure', type: 'IfcLabel', description: 'Indicates the supporting structure for track part.' },
    ],
  },

  'Pset_RampCommon': {
    label:       'Property Set: Ramp Common',
    description: 'Properties common to the definition of all occurrences of [[IfcRamp]].',
    applicableTo: ['IFCRAMP', 'IFCRAMPHALF_TURN_RAMP', 'IFCRAMPQUARTER_TURN_RAMP', 'IFCRAMPSPIRAL_RAMP', 'IFCRAMPSTRAIGHT_RUN_RAMP', 'IFCRAMPTWO_QUARTER_TURN_RAMP', 'IFCRAMPTWO_STRAIGHT_RUN_RAMP'],
    props: [
      { name: 'FireExit', type: 'IfcBoolean', description: 'Indication whether this object is designed to serve as an exit in the case of fire (TRUE) or not (FALSE).' },
      { name: 'FireRating', type: 'IfcLabel', description: 'Fire rating for this object. It is given according to the national fire safety classification.' },
      { name: 'HandicapAccessible', type: 'IfcBoolean', description: 'Indication that this object is designed to be accessible by the handicapped. Set to (TRUE) if this object is rated as ha' },
      { name: 'HasNonSkidSurface', type: 'IfcBoolean', description: 'Indication whether the surface finish is designed to prevent slippery (TRUE) or not (FALSE).' },
      { name: 'IsExternal', type: 'IfcBoolean', description: 'Indication whether the element is designed for use in the exterior (TRUE) or not (FALSE). If (TRUE) it is an external el' },
      { name: 'LoadBearing', type: 'IfcBoolean', description: 'Indicates whether the object is intended to carry loads (TRUE) or not (FALSE).' },
      { name: 'RequiredHeadroom', type: 'IfcReal', description: 'Required headroom clearance for the passageway according to the applicable building code or additional requirements.' },
      { name: 'RequiredSlope', type: 'IfcReal', description: 'Required sloping angle of the object - relative to horizontal (0.0 degrees).; Required maximum slope for the passageway' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'ThermalTransmittance', type: 'IfcReal', description: 'Thermal transmittance coefficient (U-Value) of an element, within the direction of the thermal flow (including all mater' },
    ],
  },

  'Pset_RampFlightCommon': {
    label:       'Property Set: Ramp Flight Common',
    description: 'Properties common to the definition of all occurrences of [[IfcRampFlight]].',
    applicableTo: ['IFCRAMPFLIGHT', 'IFCRAMPFLIGHTSPIRAL', 'IFCRAMPFLIGHTSTRAIGHT'],
    props: [
      { name: 'ClearWidth', type: 'IfcReal', description: 'The clear width.' },
      { name: 'CounterSlope', type: 'IfcReal', description: 'Sloping angle of the object, measured perpendicular to the slope - relative to horizontal (0.0 degrees).; Actual maximum' },
      { name: 'Headroom', type: 'IfcReal', description: 'Actual headroom clearance for the passageway according to the current design.; The shape information is provided in addi' },
      { name: 'Slope', type: 'IfcReal', description: 'Slope angle - relative to horizontal (0.0 degrees).The shape information is provided in addition to the shape representa' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_ReferentCommon': {
    label:       'Property Set: Referent Common',
    description: 'Specifies common properties for [[IfcReferent]]',
    applicableTo: ['IFCREFERENT', 'IFCREFERENTBOUNDARY', 'IFCREFERENTINTERSECTION', 'IFCREFERENTKILOPOINT', 'IFCREFERENTLANDMARK', 'IFCREFERENTMILEPOINT', 'IFCREFERENTPOSITION', 'IFCREFERENTREFERENCEMARKER', 'IFCREFERENTSTATION', 'IFCREFERENTSUPERELEVATIONEVENT', 'IFCREFERENTWIDTHEVENT'],
    props: [
      { name: 'NameFormat', type: 'IfcLabel', description: 'Specifies a reference to or description of the formatting or encoding of the Name attribute of the IfcReferent occurrenc' },
    ],
  },

  'Pset_ReinforcementBarCountOfIndependentFooting': {
    label:       'Property Set: Reinforcement Bar Count Of Independent Footing',
    description: 'The amount number information of reinforcement bar with the independent footing. The X and Y direction are based on the local coordinate system of building storey. The X and Y dire',
    applicableTo: ['IFCFOOTING', 'IFCFOOTINGCAISSON_FOUNDATION', 'IFCFOOTINGFOOTING_BEAM', 'IFCFOOTINGPAD_FOOTING', 'IFCFOOTINGPILE_CAP', 'IFCFOOTINGSTRIP_FOOTING'],
    props: [
      { name: 'Description', type: 'IfcLabel', description: 'Optional description, provided for exchanging informative comments.' },
      { name: 'XDirectionLowerBarCount', type: 'IfcInteger', description: 'The number of bars with X direction lower bar.' },
      { name: 'XDirectionUpperBarCount', type: 'IfcInteger', description: 'The number of bars with X direction upper bar.' },
      { name: 'YDirectionLowerBarCount', type: 'IfcInteger', description: 'The number of bars with Y direction lower bar.' },
      { name: 'YDirectionUpperBarCount', type: 'IfcInteger', description: 'The number of bars with Y direction upper bar.' },
    ],
  },

  'Pset_ReinforcementBarPitchOfBeam': {
    label:       'Property Set: Reinforcement Bar Pitch Of Beam',
    description: 'The pitch length information of reinforcement bar with the beam.',
    applicableTo: ['IFCBEAM', 'IFCBEAMBEAM', 'IFCBEAMCORNICE', 'IFCBEAMDIAPHRAGM', 'IFCBEAMEDGEBEAM', 'IFCBEAMGIRDER_SEGMENT', 'IFCBEAMHATSTONE', 'IFCBEAMHOLLOWCORE', 'IFCBEAMJOIST', 'IFCBEAMLINTEL', 'IFCBEAMPIERCAP', 'IFCBEAMSPANDREL', 'IFCBEAMT_BEAM'],
    props: [
      { name: 'Description', type: 'IfcLabel', description: 'Optional description, provided for exchanging informative comments.' },
      { name: 'SpacingBarPitch', type: 'IfcReal', description: 'The pitch length of the spacing bar.' },
      { name: 'StirrupBarPitch', type: 'IfcReal', description: 'The pitch length of the stirrup bar.' },
    ],
  },

  'Pset_ReinforcementBarPitchOfColumn': {
    label:       'Property Set: Reinforcement Bar Pitch Of Column',
    description: 'The pitch length information of reinforcement bar with the column. The X and Y direction are based on the local coordinate system of building storey. The X and Y direction of the r',
    applicableTo: ['IFCCOLUMN', 'IFCCOLUMNCOLUMN', 'IFCCOLUMNPIERSTEM', 'IFCCOLUMNPIERSTEM_SEGMENT', 'IFCCOLUMNPILASTER', 'IFCCOLUMNSTANDCOLUMN'],
    props: [
      { name: 'Description', type: 'IfcLabel', description: 'Optional description, provided for exchanging informative comments.' },
      { name: 'HoopBarPitch', type: 'IfcReal', description: 'The pitch length of the hoop bar.' },
      { name: 'ReinforcementBarType', type: 'IfcLabel', description: 'Defines the type of the reinforcement bar.' },
      { name: 'XDirectionTieHoopBarPitch', type: 'IfcReal', description: 'The X direction pitch length of the tie hoop.' },
      { name: 'XDirectionTieHoopCount', type: 'IfcInteger', description: 'The number of bars with X direction tie hoop bars.' },
      { name: 'YDirectionTieHoopBarPitch', type: 'IfcReal', description: 'The Y direction pitch length of the tie hoop.' },
      { name: 'YDirectionTieHoopCount', type: 'IfcInteger', description: 'The number of bars with Y direction tie hoop bars.' },
    ],
  },

  'Pset_ReinforcementBarPitchOfContinuousFooting': {
    label:       'Property Set: Reinforcement Bar Pitch Of Continuous Footing',
    description: 'The pitch length information of reinforcement bar with the continuous footing.',
    applicableTo: ['IFCFOOTING', 'IFCFOOTINGCAISSON_FOUNDATION', 'IFCFOOTINGFOOTING_BEAM', 'IFCFOOTINGPAD_FOOTING', 'IFCFOOTINGPILE_CAP', 'IFCFOOTINGSTRIP_FOOTING'],
    props: [
      { name: 'CrossingLowerBarPitch', type: 'IfcReal', description: 'The pitch length of the crossing lower bar.' },
      { name: 'CrossingUpperBarPitch', type: 'IfcReal', description: 'The pitch length of the crossing upper bar.' },
      { name: 'Description', type: 'IfcLabel', description: 'Optional description, provided for exchanging informative comments.' },
    ],
  },

  'Pset_ReinforcementBarPitchOfSlab': {
    label:       'Property Set: Reinforcement Bar Pitch Of Slab',
    description: 'The pitch length information of reinforcement bar with the slab.',
    applicableTo: ['IFCSLAB', 'IFCSLABAPPROACH_SLAB', 'IFCSLABBASESLAB', 'IFCSLABFLOOR', 'IFCSLABLANDING', 'IFCSLABPAVING', 'IFCSLABROOF', 'IFCSLABSIDEWALK', 'IFCSLABTRACKSLAB', 'IFCSLABWEARING'],
    props: [
      { name: 'Description', type: 'IfcLabel', description: 'Optional description, provided for exchanging informative comments.' },
      { name: 'LongInsideCenterLowerBarPitch', type: 'IfcReal', description: 'The pitch length of the long inside center lower bar.' },
      { name: 'LongInsideCenterTopBarPitch', type: 'IfcReal', description: 'The pitch length of the long inside center top bar.' },
      { name: 'LongInsideEndLowerBarPitch', type: 'IfcReal', description: 'The pitch length of the long inside end lower bar.' },
      { name: 'LongInsideEndTopBarPitch', type: 'IfcReal', description: 'The pitch length of the long inside end top bar.' },
      { name: 'LongOutsideLowerBarPitch', type: 'IfcReal', description: 'The pitch length of the long outside lower bar.' },
      { name: 'LongOutsideTopBarPitch', type: 'IfcReal', description: 'The pitch length of the long outside top bar.' },
      { name: 'ShortInsideCenterLowerBarPitch', type: 'IfcReal', description: 'The pitch length of the short inside center lower bar.' },
      { name: 'ShortInsideCenterTopBarPitch', type: 'IfcReal', description: 'The pitch length of the short inside center top bar.' },
      { name: 'ShortInsideEndLowerBarPitch', type: 'IfcReal', description: 'The pitch length of the short inside end lower bar.' },
      { name: 'ShortInsideEndTopBarPitch', type: 'IfcReal', description: 'The pitch length of the short inside end top bar.' },
      { name: 'ShortOutsideLowerBarPitch', type: 'IfcReal', description: 'The pitch length of the short outside lower bar.' },
      { name: 'ShortOutsideTopBarPitch', type: 'IfcReal', description: 'The pitch length of the short outside top bar.' },
    ],
  },

  'Pset_ReinforcementBarPitchOfWall': {
    label:       'Property Set: Reinforcement Bar Pitch Of Wall',
    description: 'The pitch length information of reinforcement bar with the wall.',
    applicableTo: ['IFCWALL', 'IFCWALLELEMENTEDWALL', 'IFCWALLMOVABLE', 'IFCWALLPARAPET', 'IFCWALLPARTITIONING', 'IFCWALLPLUMBINGWALL', 'IFCWALLPOLYGONAL', 'IFCWALLRETAININGWALL', 'IFCWALLSHEAR', 'IFCWALLSOLIDWALL', 'IFCWALLSTANDARD', 'IFCWALLWAVEWALL'],
    props: [
      { name: 'BarAllocationType', type: 'IfcLabel', description: 'Defines the type of the reinforcement bar allocation.' },
      { name: 'Description', type: 'IfcLabel', description: 'Optional description, provided for exchanging informative comments.' },
      { name: 'HorizontalBarPitch', type: 'IfcReal', description: 'The pitch length of the horizontal bar.' },
      { name: 'SpacingBarPitch', type: 'IfcReal', description: 'The pitch length of the spacing bar.' },
      { name: 'VerticalBarPitch', type: 'IfcReal', description: 'The pitch length of the vertical bar.' },
    ],
  },

  'Pset_RepairOccurrence': {
    label:       'Property Set: Repair Occurrence',
    description: 'Properties defining repair information for occurrences of element, asset or system.',
    applicableTo: ['*'],
    props: [
      { name: 'MeanTimeToRepair', type: 'IfcReal', description: 'Mean time to repair.' },
      { name: 'RepairContent', type: 'IfcLabel', description: 'Content of repair, reason and nature can be given, e.g. display faults, communication failure, display exchange.' },
      { name: 'RepairDate', type: 'IfcLabel', description: 'Date on which the last repair is done on the asset.' },
    ],
  },

  'Pset_RevetmentCommon': {
    label:       'Property Set: Revetment Common',
    description: 'Properties common to the definition of all occurrences of [[IfcMarineFacility]] with the predefined type set to REVETMENT.',
    applicableTo: ['IFCMARINEFACILITYREVETMENT'],
    props: [
      { name: 'Elevation', type: 'IfcReal', description: 'Elevation of the entity' },
      { name: 'StructuralType', type: 'IfcLabel', description: 'Structural type of the object' },
    ],
  },

  'Pset_Risk': {
    label:       'Property Set: Risk',
    description: 'An indication of exposure to mischance, peril, menace, hazard or loss. Documentation of a potential hazard,2017, which can be assigned to or associated with a product, activity and',
    applicableTo: ['*'],
    props: [
      { name: 'AssociatedActivity', type: 'IfcLabel', description: 'An indication or link to any associated activity or process that may trigger the hazard. If used directly on an annotati' },
      { name: 'AssociatedLocation', type: 'IfcLabel', description: 'An indication or link to any associated location or space that may trigger the hazard. If used directly on an annotation' },
      { name: 'AssociatedProduct', type: 'IfcLabel', description: 'An indication or link to any associated product or material that may trigger the hazard. If used directly on an annotati' },
      { name: 'MitigatedRiskConsequence', type: 'IfcLabel', description: 'Identifies the consequence of the hazard given the planned mitigation.' },
      { name: 'MitigatedRiskLikelihood', type: 'IfcLabel', description: 'Identifies the likelihood of the hazard given the planned mitigation.' },
      { name: 'MitigatedRiskSignificance', type: 'IfcLabel', description: 'Identifies the significance of the risk given the mitigation of likelihood and consequence.' },
      { name: 'MitigationPlanned', type: 'IfcLabel', description: 'The planned (agreed and irrevocable) mitigation of the likelhood and consequences of the hazard.' },
      { name: 'MitigationProposed', type: 'IfcLabel', description: 'Any proposed, but not yet agreed and irrevocable, mitigation of the likelhood and consequences of the hazard.' },
      { name: 'NatureOfRisk', type: 'IfcLabel', description: 'A description of the generic nature of the context or hazard that might be encountered.' },
      { name: 'RiskAssessmentMethodology', type: 'IfcLabel', description: 'An indication or link to the chosen risk assessment methodology, for example PAS1192-6 or a chosen ISO13100 annex.' },
      { name: 'RiskName', type: 'IfcLabel', description: 'A locally unique identifier for the risk entry that can be used to track the development and mitigation of the risk thro' },
      { name: 'RiskType', type: 'IfcLabel', description: 'Identifies the predefined types of risk from which the type required may be set.' },
      { name: 'UnmitigatedRiskConsequence', type: 'IfcLabel', description: 'Identifies the consequence of the hazard prior to any specific mitigation.' },
      { name: 'UnmitigatedRiskLikelihood', type: 'IfcLabel', description: 'Identifies the likelihood of the hazard prior to any specific mitigation.' },
      { name: 'UnmitigatedRiskSignificance', type: 'IfcLabel', description: 'Identifies the significance of the risk given the likelihood and consequence prior to any specific mitigation.' },
    ],
  },

  'Pset_RoadDesignCriteriaCommon': {
    label:       'Property Set: Road Design Criteria Common',
    description: 'Road design criteria that may be attached to road parts.',
    applicableTo: ['IFCFACILITYPARTCOMMONJUNCTION', 'IFCFACILITYPARTCOMMONLEVELCROSSING', 'IFCFACILITYPARTCOMMONSEGMENT', 'IFCROAD', 'IFCROADPARTBICYCLECROSSING', 'IFCROADPARTINTERSECTION', 'IFCROADPARTPEDESTRIAN_CROSSING', 'IFCROADPARTRAILWAYCROSSING', 'IFCROADPARTROADSEGMENT', 'IFCROADPARTROUNDABOUT', 'IFCROADPARTTOLLPLAZA'],
    props: [
      { name: 'Crossfall', type: 'IfcReal', description: 'Specifies the nominal crossfall as a ratio measure (slope) at the location of the event.' },
      { name: 'DesignSpeed', type: 'IfcReal', description: 'Speed selected in designing a new road or in modernizing, strengthening or rehabilitating an existing road section, to d' },
      { name: 'DesignTrafficVolume', type: 'IfcInteger', description: 'The traffic volume used for planning and design purposes specified as the number of vehicles per day . Typically given a' },
      { name: 'DesignVehicleClass', type: 'IfcLabel', description: 'A vehicle designator with content according to local standards.' },
      { name: 'LaneWidth', type: 'IfcReal', description: 'Standard nominal width of one trough lane.' },
      { name: 'NumberOfThroughLanes', type: 'IfcInteger', description: 'The total number of through lanes on the segment. This excludes auxiliary lanes, parking and turning lanes, acceleration' },
      { name: 'RoadDesignClass', type: 'IfcLabel', description: 'A road design class designator with content according to local standards.' },
    ],
  },

  'Pset_RoadGuardElement': {
    label:       'Property Set: Road Guard Element',
    description: 'Properties assigned to [[IfcWall]]/PARAPET or [[IfcRailing]]/GUARDRAIL when assigned as road guard elements.',
    applicableTo: ['IFCRAILINGGUARDRAIL', 'IFCWALLPARAPET'],
    props: [
      { name: 'IsMoveable', type: 'IfcBoolean', description: 'True if element is moveable.' },
      { name: 'IsTerminal', type: 'IfcBoolean', description: 'True if element is a terminal. See class Terminal.' },
      { name: 'IsTransition', type: 'IfcBoolean', description: 'True if element is a transition. See class Transition.' },
      { name: 'TerminalType', type: 'IfcLabel', description: 'Specifies the kind of terminal if IsTerminal is true.' },
    ],
  },

  'Pset_RoadMarkingCommon': {
    label:       'Property Set: Road Marking Common',
    description: 'Properties for road markings.',
    applicableTo: ['IFCSURFACEFEATUREHATCHMARKING', 'IFCSURFACEFEATURELINEMARKING', 'IFCSURFACEFEATUREPAVEMENTSURFACEMARKING', 'IFCSURFACEFEATURESYMBOLMARKING'],
    props: [
      { name: 'ApplicationMethod', type: 'IfcLabel', description: 'State the application method used... e.g. spray, extruded' },
      { name: 'DiagramNumber', type: 'IfcLabel', description: 'A designator with content according to local standards, e.g. M25.' },
      { name: 'MaterialColour', type: 'IfcLabel', description: 'Actual colour on the road marking material' },
      { name: 'MaterialThickness', type: 'IfcReal', description: 'Nominal thickness of the applied material' },
      { name: 'MaterialType', type: 'IfcLabel', description: 'Material type used... e.g. paint, tape, thermoplastic, stone' },
      { name: 'Structure', type: 'IfcLabel', description: 'State if marking is Structured or not, and what type... e.g. Kamflex, Longflex, Dropflex' },
    ],
  },

  'Pset_RoadSymbolsCommon': {
    label:       'Property Set: Road Symbols Common',
    description: 'Properties for road symbols.',
    applicableTo: ['IFCSURFACEFEATURESYMBOLMARKING'],
    props: [
      { name: 'Text', type: 'IfcLabel', description: 'Text content' },
      { name: 'TypeDesignation', type: 'IfcLabel', description: 'Type designator for the element. The content depends on local standards. Eg. \\\'Bull nose\\\', \\\'Half batter\\\', \\\'Dropper\\\', \\\'Cha' },
    ],
  },

  'Pset_RoofCommon': {
    label:       'Property Set: Roof Common',
    description: 'Properties common to the definition of all occurrences of [[IfcRoof]].Properties for [[ProjectedArea]] and [[TotalArea]] added in IFC 2x3',
    applicableTo: ['IFCROOF', 'IFCROOFBARREL_ROOF', 'IFCROOFBUTTERFLY_ROOF', 'IFCROOFDOME_ROOF', 'IFCROOFFLAT_ROOF', 'IFCROOFFREEFORM', 'IFCROOFGABLE_ROOF', 'IFCROOFGAMBREL_ROOF', 'IFCROOFHIPPED_GABLE_ROOF', 'IFCROOFHIP_ROOF', 'IFCROOFMANSARD_ROOF', 'IFCROOFPAVILION_ROOF', 'IFCROOFRAINBOW_ROOF', 'IFCROOFSHED_ROOF'],
    props: [
      { name: 'AcousticRating', type: 'IfcLabel', description: 'Acoustic rating for this object.; It is provided according to the national building code. It indicates the sound transmi' },
      { name: 'FireRating', type: 'IfcLabel', description: 'Fire rating for this object. It is given according to the national fire safety classification.' },
      { name: 'IsExternal', type: 'IfcBoolean', description: 'Indication whether the element is designed for use in the exterior (TRUE) or not (FALSE). If (TRUE) it is an external el' },
      { name: 'LoadBearing', type: 'IfcBoolean', description: 'Indicates whether the object is intended to carry loads (TRUE) or not (FALSE).' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'ThermalTransmittance', type: 'IfcReal', description: 'Thermal transmittance coefficient (U-Value) of an element, within the direction of the thermal flow (including all mater' },
    ],
  },

  'Pset_SanitaryTerminalTypeBath': {
    label:       'Property Set: Sanitary Terminal Type Bath',
    description: 'Sanitary appliance for immersion of the human body or parts of it (BS6100).',
    applicableTo: ['IFCSANITARYTERMINALBATH'],
    props: [
      { name: 'BathType', type: 'IfcLabel', description: 'The property enumeration defines the types of bath that may be specified within the property set.' },
      { name: 'DrainSize', type: 'IfcReal', description: 'The size of the drain outlet connection from the object.' },
      { name: 'HasGrabHandles', type: 'IfcBoolean', description: 'Indicates whether the bath is fitted with handles that provide assistance to a bather in entering or leaving the bath.' },
    ],
  },

  'Pset_SanitaryTerminalTypeBidet': {
    label:       'Property Set: Sanitary Terminal Type Bidet',
    description: 'Waste water appliance for washing the excretory organs while sitting astride the bowl (BS6100).',
    applicableTo: ['IFCSANITARYTERMINALBIDET'],
    props: [
      { name: 'DrainSize', type: 'IfcReal', description: 'The size of the drain outlet connection from the object.' },
      { name: 'Mounting', type: 'IfcLabel', description: 'The property enumeration Pset_SanitaryMountingEnum defines the forms of mounting or fixing of the sanitary terminal that' },
      { name: 'SpilloverLevel', type: 'IfcReal', description: 'The level at which water spills out of the object.' },
    ],
  },

  'Pset_SanitaryTerminalTypeCistern': {
    label:       'Property Set: Sanitary Terminal Type Cistern',
    description: 'A water storage unit attached to a sanitary terminal that is fitted with a device, operated automatically or by the user, that discharges water to cleanse a water closet (toilet) p',
    applicableTo: ['IFCSANITARYTERMINALCISTERN'],
    props: [
      { name: 'CisternCapacity', type: 'IfcReal', description: 'Volumetric capacity of the cistern' },
      { name: 'CisternHeight', type: 'IfcLabel', description: 'Enumeration that identifies the height of the cistern or, if set to \\\'None\\\' if the urinal has no cistern and is flushed u' },
      { name: 'FlushRate', type: 'IfcReal', description: 'The minimum and maximum volume of water used at each flush. Where a single flush is used, the value of upper bound and l' },
      { name: 'FlushType', type: 'IfcLabel', description: 'Flushing is achieved by twisting a lever that causes a predetermined flow of water to be passed from a cistern to the sa' },
      { name: 'IsAutomaticFlush', type: 'IfcBoolean', description: 'Boolean value that determines if the cistern is flushed automatically either after each use or periodically (TRUE) or wh' },
      { name: 'IsSingleFlush', type: 'IfcBoolean', description: 'Indicates whether the cistern is single flush = TRUE (i.e. the same amount of water is used for each and every flush) or' },
    ],
  },

  'Pset_SanitaryTerminalTypeCommon': {
    label:       'Property Set: Sanitary Terminal Type Common',
    description: 'Common properties for sanitary terminals.',
    applicableTo: ['IFCSANITARYTERMINAL', 'IFCSANITARYTERMINALBATH', 'IFCSANITARYTERMINALBIDET', 'IFCSANITARYTERMINALCISTERN', 'IFCSANITARYTERMINALSANITARYFOUNTAIN', 'IFCSANITARYTERMINALSHOWER', 'IFCSANITARYTERMINALSINK', 'IFCSANITARYTERMINALTOILETPAN', 'IFCSANITARYTERMINALURINAL', 'IFCSANITARYTERMINALWASHHANDBASIN', 'IFCSANITARYTERMINALWCSEAT'],
    props: [
      { name: 'Colour', type: 'IfcLabel', description: 'Colour of this object.' },
      { name: 'NominalDepth', type: 'IfcReal', description: 'Nominal Depth of the object' },
      { name: 'NominalLength', type: 'IfcReal', description: 'The nominal overall length of the object. The size information is provided in addition to the shape representation and t' },
      { name: 'NominalWidth', type: 'IfcReal', description: 'The nominal overall width of the object. The size information is provided in addition to the shape representation and th' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_SanitaryTerminalTypeSanitaryFountain': {
    label:       'Property Set: Sanitary Terminal Type Sanitary Fountain',
    description: 'Asanitary terminal that provides a low pressure jet of water for a specific purpose (IAI).',
    applicableTo: ['IFCSANITARYTERMINALSANITARYFOUNTAIN'],
    props: [
      { name: 'DrainSize', type: 'IfcReal', description: 'The size of the drain outlet connection from the object.' },
      { name: 'FountainType', type: 'IfcLabel', description: 'Sanitary appliance that provides a low pressure jet of drinking water.; Waste water appliance, usually installed in work' },
      { name: 'Mounting', type: 'IfcLabel', description: 'The property enumeration Pset_SanitaryMountingEnum defines the forms of mounting or fixing of the sanitary terminal that' },
    ],
  },

  'Pset_SanitaryTerminalTypeShower': {
    label:       'Property Set: Sanitary Terminal Type Shower',
    description: 'Installation or waste water appliance that emits a spray of water to wash the human body (BS6100).',
    applicableTo: ['IFCSANITARYTERMINALSHOWER'],
    props: [
      { name: 'DrainSize', type: 'IfcReal', description: 'The size of the drain outlet connection from the object.' },
      { name: 'HasTray', type: 'IfcBoolean', description: 'Indicates whether the shower has a separate receptacle that catches the water in a shower and directs it to a waste outl' },
      { name: 'ShowerHeadDescription', type: 'IfcLabel', description: 'A description of the shower head(s) that emit the spray of water.' },
      { name: 'ShowerType', type: 'IfcLabel', description: 'Shower that rapidly gives a thorough soaking in an emergency.; Shower unit that is typically enclosed and is for the use' },
    ],
  },

  'Pset_SanitaryTerminalTypeSink': {
    label:       'Property Set: Sanitary Terminal Type Sink',
    description: 'Waste water appliance for receiving, retaining or disposing of domestic, culinary, laboratory or industrial process liquids.',
    applicableTo: ['IFCSANITARYTERMINALSINK'],
    props: [
      { name: 'Colour', type: 'IfcLabel', description: 'Colour of this object.' },
      { name: 'DrainSize', type: 'IfcReal', description: 'The size of the drain outlet connection from the object.' },
      { name: 'Mounting', type: 'IfcLabel', description: 'The property enumeration Pset_SanitaryMountingEnum defines the forms of mounting or fixing of the sanitary terminal that' },
      { name: 'MountingOffset', type: 'IfcReal', description: 'For counter top mounted basins the vertical offset between the top of the sink and the counter top.' },
      { name: 'SinkType', type: 'IfcLabel', description: 'Deep sink that has a plain edge and a weir overflow; .; Sink at low level, with protected front edge, that facilitates f' },
    ],
  },

  'Pset_SanitaryTerminalTypeToiletPan': {
    label:       'Property Set: Sanitary Terminal Type Toilet Pan',
    description: 'Soil appliance for the disposal of excrement.',
    applicableTo: ['IFCSANITARYTERMINALTOILETPAN'],
    props: [
      { name: 'PanMounting', type: 'IfcLabel', description: 'The property enumeration Pset_SanitaryMountingEnum defines the forms of mounting or fixing of the sanitary terminal that' },
      { name: 'SpilloverLevel', type: 'IfcReal', description: 'The level at which water spills out of the object.' },
      { name: 'ToiletPanType', type: 'IfcLabel', description: 'Toilet pan in which excrement is removed by siphonage induced by the flushing water.; Toilet pan with an elongated bowl' },
      { name: 'ToiletType', type: 'IfcLabel', description: 'Enclosed soil appliance in which bedpans and urinal bottles are emptied and cleansed.;Portable receptacle or soil applia' },
    ],
  },

  'Pset_SanitaryTerminalTypeUrinal': {
    label:       'Property Set: Sanitary Terminal Type Urinal',
    description: 'Soil appliance that receives urine and directs it to a waste outlet (BS6100).',
    applicableTo: ['IFCSANITARYTERMINALURINAL'],
    props: [
      { name: 'Mounting', type: 'IfcLabel', description: 'The property enumeration Pset_SanitaryMountingEnum defines the forms of mounting or fixing of the sanitary terminal that' },
      { name: 'SpilloverLevel', type: 'IfcReal', description: 'The level at which water spills out of the object.' },
      { name: 'UrinalType', type: 'IfcLabel', description: 'Individual wall mounted urinal.;Urinal that consists of a slab or sheet fixed to a wall and down which urinal flows into' },
    ],
  },

  'Pset_SanitaryTerminalTypeWashHandBasin': {
    label:       'Property Set: Sanitary Terminal Type Wash Hand Basin',
    description: 'Waste water appliance for washing the upper parts of the body.',
    applicableTo: ['IFCSANITARYTERMINALWASHHANDBASIN'],
    props: [
      { name: 'DrainSize', type: 'IfcReal', description: 'The size of the drain outlet connection from the object.' },
      { name: 'Mounting', type: 'IfcLabel', description: 'The property enumeration Pset_SanitaryMountingEnum defines the forms of mounting or fixing of the sanitary terminal that' },
      { name: 'MountingOffset', type: 'IfcReal', description: 'For counter top mounted basins the vertical offset between the top of the sink and the counter top.' },
      { name: 'WashHandBasinType', type: 'IfcLabel', description: 'Waste water appliance that receives and flushes away mouth washings; .;Wall mounted wash hand basin that has an overall' },
    ],
  },

  'Pset_SectionInsulator': {
    label:       'Property Set: Section Insulator',
    description: 'Properties applicable to the insulator type of discrete accessory, indicated that the insulator is a section insulator used in the overhead contact line system.',
    applicableTo: ['IFCDISCRETEACCESSORYINSULATOR'],
    props: [
      { name: 'ACResistance', type: 'IfcReal', description: 'The resistance under AC.' },
      { name: 'IsArcSuppressing', type: 'IfcBoolean', description: 'Indicates whether the element has the ability to suppress an arc.' },
      { name: 'NumberOfWires', type: 'IfcInteger', description: 'The number of wires used in the element.' },
      { name: 'TensileStrength', type: 'IfcReal', description: 'Indicates the ability to withstand breakage apart under applied force.' },
    ],
  },

  'Pset_SectioningDevice': {
    label:       'Property Set: Sectioning Device',
    description: 'Properties of sectioning device used in railway. The property set can be used by the predefined type INSULATOR of [[IfcDiscreteAccessory]].',
    applicableTo: ['IFCDISCRETEACCESSORYINSULATOR'],
    props: [
      { name: 'SectioningDeviceType', type: 'IfcLabel', description: 'Indicates the sectioning device type.' },
    ],
  },

  'Pset_SensorPHistory': {
    label:       'Property Set: Sensor Phistory',
    description: 'Properties for history of controller values.',
    applicableTo: ['IFCSENSOR', 'IFCSENSORCO2SENSOR', 'IFCSENSORCONDUCTANCESENSOR', 'IFCSENSORCONTACTSENSOR', 'IFCSENSORCOSENSOR', 'IFCSENSOREARTHQUAKESENSOR', 'IFCSENSORFIRESENSOR', 'IFCSENSORFLOWSENSOR', 'IFCSENSORFOREIGNOBJECTDETECTIONSENSOR', 'IFCSENSORFROSTSENSOR', 'IFCSENSORGASSENSOR', 'IFCSENSORHEATSENSOR', 'IFCSENSORHUMIDITYSENSOR', 'IFCSENSORIDENTIFIERSENSOR', 'IFCSENSORIONCONCENTRATIONSENSOR', 'IFCSENSORLEVELSENSOR', 'IFCSENSORLIGHTSENSOR', 'IFCSENSORMOISTURESENSOR', 'IFCSENSORMOVEMENTSENSOR', 'IFCSENSOROBSTACLESENSOR', 'IFCSENSORPHSENSOR', 'IFCSENSORPRESSURESENSOR', 'IFCSENSORRADIATIONSENSOR', 'IFCSENSORRADIOACTIVITYSENSOR', 'IFCSENSORRAINSENSOR', 'IFCSENSORSMOKESENSOR', 'IFCSENSORSNOWDEPTHSENSOR', 'IFCSENSORSOUNDSENSOR', 'IFCSENSORTEMPERATURESENSOR', 'IFCSENSORTRAINSENSOR', 'IFCSENSORTURNOUTCLOSURESENSOR', 'IFCSENSORWHEELSENSOR', 'IFCSENSORWINDSENSOR'],
    props: [
      { name: 'Direction', type: 'IfcTimeSeries', description: 'Indicates sensed direction for sensors capturing magnitude and direction measured from True North (0 degrees) in a clock' },
      { name: 'Quality', type: 'IfcTimeSeries', description: 'Indicates the quality of measurement or failure condition, which may be further qualified by the Status.measured values' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'Value', type: 'IfcTimeSeries', description: 'The expected range and default value.' },
    ],
  },

  'Pset_SensorTypeCO2Sensor': {
    label:       'Property Set: Sensor Type Co2Sensor',
    description: 'A device that senses or detects carbon dioxide.',
    applicableTo: ['IFCSENSORCO2SENSOR'],
    props: [
      { name: 'SetPointCO2Concentration', type: 'IfcReal', description: 'The carbon dioxide concentration to be sensed. Use IfcPropertyBoundedValue.SetPointValue to set the set point value.' },
    ],
  },

  'Pset_SensorTypeCommon': {
    label:       'Property Set: Sensor Type Common',
    description: 'Sensor type common attributes.',
    applicableTo: ['IFCSENSOR', 'IFCSENSORCO2SENSOR', 'IFCSENSORCONDUCTANCESENSOR', 'IFCSENSORCONTACTSENSOR', 'IFCSENSORCOSENSOR', 'IFCSENSOREARTHQUAKESENSOR', 'IFCSENSORFIRESENSOR', 'IFCSENSORFLOWSENSOR', 'IFCSENSORFOREIGNOBJECTDETECTIONSENSOR', 'IFCSENSORFROSTSENSOR', 'IFCSENSORGASSENSOR', 'IFCSENSORHEATSENSOR', 'IFCSENSORHUMIDITYSENSOR', 'IFCSENSORIDENTIFIERSENSOR', 'IFCSENSORIONCONCENTRATIONSENSOR', 'IFCSENSORLEVELSENSOR', 'IFCSENSORLIGHTSENSOR', 'IFCSENSORMOISTURESENSOR', 'IFCSENSORMOVEMENTSENSOR', 'IFCSENSOROBSTACLESENSOR', 'IFCSENSORPHSENSOR', 'IFCSENSORPRESSURESENSOR', 'IFCSENSORRADIATIONSENSOR', 'IFCSENSORRADIOACTIVITYSENSOR', 'IFCSENSORRAINSENSOR', 'IFCSENSORSMOKESENSOR', 'IFCSENSORSNOWDEPTHSENSOR', 'IFCSENSORSOUNDSENSOR', 'IFCSENSORTEMPERATURESENSOR', 'IFCSENSORTRAINSENSOR', 'IFCSENSORTURNOUTCLOSURESENSOR', 'IFCSENSORWHEELSENSOR', 'IFCSENSORWINDSENSOR'],
    props: [
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_SensorTypeConductanceSensor': {
    label:       'Property Set: Sensor Type Conductance Sensor',
    description: 'A device that senses or detects electrical conductance.',
    applicableTo: ['IFCSENSORCONDUCTANCESENSOR'],
    props: [
      { name: 'SetPointConductance', type: 'IfcReal', description: 'The fill level value to be sensed. Use IfcPropertyBoundedValue.SetPointValue to set the set point value.' },
    ],
  },

  'Pset_SensorTypeContactSensor': {
    label:       'Property Set: Sensor Type Contact Sensor',
    description: 'A device that senses or detects contact.',
    applicableTo: ['IFCSENSORCONTACTSENSOR'],
    props: [
      { name: 'SetPointContact', type: 'IfcInteger', description: 'The contact value to be sensed. Use IfcPropertyBoundedValue.SetPointValue to set the set point value.' },
    ],
  },

  'Pset_SensorTypeEarthquakeSensor': {
    label:       'Property Set: Sensor Type Earthquake Sensor',
    description: 'Properties that are applicable for [[IfcSensor]] with predefined type EARTHQUAKESENSOR.',
    applicableTo: ['IFCSENSOREARTHQUAKESENSOR'],
    props: [
      { name: 'DataCollectionType', type: 'IfcLabel', description: 'Indicates the type or manner of data collection.' },
      { name: 'DegreeOfLinearity', type: 'IfcReal', description: 'Indicates the degree of linearity of the earthquake sensor or accelerometer.' },
      { name: 'DynamicRange', type: 'IfcReal', description: 'Indicates the dynamic range of the sensor.' },
      { name: 'EarthquakeSensorRange', type: 'IfcReal', description: 'Indicates the measuring range of the earthquake sensor or accelerometer.' },
      { name: 'EarthquakeSensorType', type: 'IfcLabel', description: 'Indicates the type of earthquake sensor or accelerometer.' },
      { name: 'FullScaleOutput', type: 'IfcReal', description: 'Indicates the full scale output of the earthquake sensor or accelerometer.' },
      { name: 'LinearVelocityResolution', type: 'IfcReal', description: 'Indicates the resolution of the detected linear velocity.' },
      { name: 'MarginOfError', type: 'IfcReal', description: 'Indicates the margin of error of the measurement.' },
      { name: 'SamplingFrequency', type: 'IfcReal', description: 'Indicates the sampling frequency of the device.' },
      { name: 'SerialInterfaceType', type: 'IfcLabel', description: 'Indicates the type of serial interface used by the device.' },
      { name: 'TransverseSensitivityRatio', type: 'IfcReal', description: 'Indicates the transverse sensitivity ratio of the sensor.' },
      { name: 'WorkingState', type: 'IfcLabel', description: 'Indicates the working state of device or system.' },
    ],
  },

  'Pset_SensorTypeFireSensor': {
    label:       'Property Set: Sensor Type Fire Sensor',
    description: 'A device that senses or detects the presence of fire.',
    applicableTo: ['IFCSENSORFIRESENSOR'],
    props: [
      { name: 'AccuracyOfFireSensor', type: 'IfcReal', description: 'The accuracy of the sensor.' },
      { name: 'FireSensorSetPoint', type: 'IfcReal', description: 'The temperature value to be sensed to indicate the presence of fire.' },
      { name: 'TimeConstant', type: 'IfcReal', description: 'The time constant of the sensor.' },
    ],
  },

  'Pset_SensorTypeFlowSensor': {
    label:       'Property Set: Sensor Type Flow Sensor',
    description: 'A device that senses or detects flow.',
    applicableTo: ['IFCSENSORFLOWSENSOR'],
    props: [
      { name: 'SetPointFlow', type: 'IfcReal', description: 'The volumetric flow value to be sensed. Use IfcPropertyBoundedValue.SetPointValue to set the set point value.' },
    ],
  },

  'Pset_SensorTypeForeignObjectDetectionSensor': {
    label:       'Property Set: Sensor Type Foreign Object Detection Sensor',
    description: 'Properties that are applicable for [[IfcSensor]] with predefined type FOREIGNOBJECTDETECTIONSENSOR.',
    applicableTo: ['IFCSENSORFOREIGNOBJECTDETECTIONSENSOR'],
    props: [
      { name: 'ForeignObjectDetectionSensorType', type: 'IfcLabel', description: 'Indicates the type of foreign object detection sensor.' },
      { name: 'SerialInterfaceType', type: 'IfcLabel', description: 'Indicates the type of serial interface used by the device.' },
      { name: 'WorkingState', type: 'IfcLabel', description: 'Indicates the working state of device or system.' },
    ],
  },

  'Pset_SensorTypeFrostSensor': {
    label:       'Property Set: Sensor Type Frost Sensor',
    description: 'A device that senses or detects the presence of frost.',
    applicableTo: ['IFCSENSORFROSTSENSOR'],
    props: [
      { name: 'SetPointFrost', type: 'IfcReal', description: 'The detection of frost.' },
    ],
  },

  'Pset_SensorTypeGasSensor': {
    label:       'Property Set: Sensor Type Gas Sensor',
    description: 'A device that senses or detects gas.',
    applicableTo: ['IFCSENSORGASSENSOR'],
    props: [
      { name: 'CoverageArea', type: 'IfcReal', description: 'The area that is covered by the object.' },
      { name: 'GasDetected', type: 'IfcLabel', description: 'Identification of the gas that is being detected, according to chemical formula. For example, carbon monoxide is \\\'CO\\\', c' },
      { name: 'SetPointConcentration', type: 'IfcReal', description: 'The concentration to be sensed. Use IfcPropertyBoundedValue.SetPointValue to set the set point value.' },
    ],
  },

  'Pset_SensorTypeHeatSensor': {
    label:       'Property Set: Sensor Type Heat Sensor',
    description: 'A device that senses or detects heat.',
    applicableTo: ['IFCSENSORHEATSENSOR'],
    props: [
      { name: 'CoverageArea', type: 'IfcReal', description: 'The area that is covered by the object.' },
      { name: 'RateOfTemperatureRise', type: 'IfcReal', description: 'The rate of temperature rise that is to be sensed as being hazardous.' },
      { name: 'SetPointTemperature', type: 'IfcReal', description: 'The temperature value to be sensed. Use IfcPropertyBoundedValue.SetPointValue to set the set point value.' },
    ],
  },

  'Pset_SensorTypeHumiditySensor': {
    label:       'Property Set: Sensor Type Humidity Sensor',
    description: 'A device that senses or detects humidity.',
    applicableTo: ['IFCSENSORHUMIDITYSENSOR'],
    props: [
      { name: 'SetPointHumidity', type: 'IfcReal', description: 'The humidity value to be sensed. Use IfcPropertyBoundedValue.SetPointValue to set the set point value.' },
    ],
  },

  'Pset_SensorTypeIdentifierSensor': {
    label:       'Property Set: Sensor Type Identifier Sensor',
    description: 'A device that senses identification tags.',
    applicableTo: ['IFCSENSORIDENTIFIERSENSOR'],
    props: [
      { name: 'SetPointIdentifier', type: 'IfcLabel', description: 'The detected tag value.' },
    ],
  },

  'Pset_SensorTypeIonConcentrationSensor': {
    label:       'Property Set: Sensor Type Ion Concentration Sensor',
    description: 'A device that senses or detects ion concentration such as water hardness.',
    applicableTo: ['IFCSENSORIONCONCENTRATIONSENSOR'],
    props: [
      { name: 'SetPointIonConcentration', type: 'IfcReal', description: 'The ion concentration value to be sensed. Use IfcPropertyBoundedValue.SetPointValue to set the set point value.' },
      { name: 'SubstanceDetected', type: 'IfcLabel', description: 'Identification of the substance that is being detected according to chemical formula. For example, calcium carbonate is' },
    ],
  },

  'Pset_SensorTypeLevelSensor': {
    label:       'Property Set: Sensor Type Level Sensor',
    description: 'A device that senses or detects fill level.',
    applicableTo: ['IFCSENSORLEVELSENSOR'],
    props: [
      { name: 'SetPointLevel', type: 'IfcReal', description: 'The fill level value to be sensed. Use IfcPropertyBoundedValue.SetPointValue to set the set point value.' },
    ],
  },

  'Pset_SensorTypeLightSensor': {
    label:       'Property Set: Sensor Type Light Sensor',
    description: 'A device that senses or detects light.',
    applicableTo: ['IFCSENSORLIGHTSENSOR'],
    props: [
      { name: 'SetPointIlluminance', type: 'IfcReal', description: 'The illuminance value to be sensed. Use IfcPropertyBoundedValue.SetPointValue to set the set point value.' },
    ],
  },

  'Pset_SensorTypeMoistureSensor': {
    label:       'Property Set: Sensor Type Moisture Sensor',
    description: 'A device that senses or detects moisture.',
    applicableTo: ['IFCSENSORMOISTURESENSOR'],
    props: [
      { name: 'SetPointMoisture', type: 'IfcReal', description: 'The moisture value to be sensed. Use IfcPropertyBoundedValue.SetPointValue to set the set point value.' },
    ],
  },

  'Pset_SensorTypeMovementSensor': {
    label:       'Property Set: Sensor Type Movement Sensor',
    description: 'A device that senses or detects movement.',
    applicableTo: ['IFCSENSORMOVEMENTSENSOR'],
    props: [
      { name: 'MovementSensingType', type: 'IfcLabel', description: 'Enumeration that identifies the type of movement sensing mechanism.' },
      { name: 'SetPointMovement', type: 'IfcReal', description: 'The movement to be sensed.' },
    ],
  },

  'Pset_SensorTypePHSensor': {
    label:       'Property Set: Sensor Type Phsensor',
    description: 'A device that senses or detects acidity.',
    applicableTo: ['IFCSENSORPHSENSOR'],
    props: [
      { name: 'SetPointPH', type: 'IfcReal', description: 'The fill level value to be sensed. Use IfcPropertyBoundedValue.SetPointValue to set the set point value.' },
    ],
  },

  'Pset_SensorTypePressureSensor': {
    label:       'Property Set: Sensor Type Pressure Sensor',
    description: 'A device that senses or detects pressure.',
    applicableTo: ['IFCSENSORPRESSURESENSOR'],
    props: [
      { name: 'IsSwitch', type: 'IfcBoolean', description: 'Identifies if the sensor also functions as a switch at the set point (=TRUE) or not (= FALSE).' },
      { name: 'SetPointPressure', type: 'IfcReal', description: 'The pressure value to be sensed. Use IfcPropertyBoundedValue.SetPointValue to set the set point value.' },
    ],
  },

  'Pset_SensorTypeRadiationSensor': {
    label:       'Property Set: Sensor Type Radiation Sensor',
    description: 'A device that senses or detects radiation.',
    applicableTo: ['IFCSENSORRADIATIONSENSOR'],
    props: [
      { name: 'SetPointRadiation', type: 'IfcReal', description: 'The radiation power value to be sensed. Use IfcPropertyBoundedValue.SetPointValue to set the set point value.' },
    ],
  },

  'Pset_SensorTypeRadioactivitySensor': {
    label:       'Property Set: Sensor Type Radioactivity Sensor',
    description: 'A device that senses or detects atomic decay.',
    applicableTo: ['IFCSENSORRADIOACTIVITYSENSOR'],
    props: [
      { name: 'SetPointRadioactivity', type: 'IfcReal', description: 'The radioactivity value to be sensed. Use IfcPropertyBoundedValue.SetPointValue to set the set point value.' },
    ],
  },

  'Pset_SensorTypeRainSensor': {
    label:       'Property Set: Sensor Type Rain Sensor',
    description: 'Properties that are applicable for [[IfcSensor]] with predefined type RAINSENSOR.',
    applicableTo: ['IFCSENSORRAINSENSOR'],
    props: [
      { name: 'DataCollectionType', type: 'IfcLabel', description: 'Indicates the type or manner of data collection.' },
      { name: 'LengthMeasureResolution', type: 'IfcReal', description: 'Indicates the resolution for length measure of the device.' },
      { name: 'MarginOfError', type: 'IfcReal', description: 'Indicates the margin of error of the measurement.' },
      { name: 'RainMeasureRange', type: 'IfcReal', description: 'Indicates the measuring range of rain gauge.' },
      { name: 'RainSensorType', type: 'IfcLabel', description: 'Indicates the type of rain sensor or gauge.' },
      { name: 'SamplingFrequency', type: 'IfcReal', description: 'Indicates the sampling frequency of the device.' },
      { name: 'SerialInterfaceType', type: 'IfcLabel', description: 'Indicates the type of serial interface used by the device.' },
      { name: 'WorkingState', type: 'IfcLabel', description: 'Indicates the working state of device or system.' },
    ],
  },

  'Pset_SensorTypeSmokeSensor': {
    label:       'Property Set: Sensor Type Smoke Sensor',
    description: 'A device that senses or detects smoke.',
    applicableTo: ['IFCSENSORSMOKESENSOR'],
    props: [
      { name: 'CoverageArea', type: 'IfcReal', description: 'The area that is covered by the object.' },
      { name: 'HasBuiltInAlarm', type: 'IfcBoolean', description: 'Indicates whether the smoke sensor is included as an element within a smoke alarm/sensor unit (TRUE) or not (FALSE).' },
      { name: 'SetPointConcentration', type: 'IfcReal', description: 'The concentration to be sensed. Use IfcPropertyBoundedValue.SetPointValue to set the set point value.' },
    ],
  },

  'Pset_SensorTypeSnowSensor': {
    label:       'Property Set: Sensor Type Snow Sensor',
    description: 'Properties that are applicable for [[IfcSensor]] with predefined type SNOWDEPTHSENSOR.',
    applicableTo: ['IFCSENSORSNOWDEPTHSENSOR'],
    props: [
      { name: 'DataCollectionType', type: 'IfcLabel', description: 'Indicates the type or manner of data collection.' },
      { name: 'ImageResolution', type: 'IfcLabel', description: 'Indicates the image resolution of snow depth meter.' },
      { name: 'ImageShootingMode', type: 'IfcLabel', description: 'Indicates the type or manner of snow depth meter image shooting.' },
      { name: 'LengthMeasureResolution', type: 'IfcReal', description: 'Indicates the resolution for length measure of the device.' },
      { name: 'MarginOfError', type: 'IfcReal', description: 'Indicates the margin of error of the measurement.' },
      { name: 'SamplingFrequency', type: 'IfcReal', description: 'Indicates the sampling frequency of the device.' },
      { name: 'SerialInterfaceType', type: 'IfcLabel', description: 'Indicates the type of serial interface used by the device.' },
      { name: 'SnowSensorMeasureRange', type: 'IfcReal', description: 'Indicates the measuring range of snow depth meter.' },
      { name: 'SnowSensorType', type: 'IfcLabel', description: 'Indicates the type of snow depth meter.' },
    ],
  },

  'Pset_SensorTypeSoundSensor': {
    label:       'Property Set: Sensor Type Sound Sensor',
    description: 'A device that senses or detects sound.',
    applicableTo: ['IFCSENSORSOUNDSENSOR'],
    props: [
      { name: 'SetPointSound', type: 'IfcReal', description: 'The sound pressure value to be sensed. Use IfcPropertyBoundedValue.SetPointValue to set the set point value.' },
    ],
  },

  'Pset_SensorTypeTemperatureSensor': {
    label:       'Property Set: Sensor Type Temperature Sensor',
    description: 'A device that senses or detects temperature.',
    applicableTo: ['IFCSENSORTEMPERATURESENSOR'],
    props: [
      { name: 'SetPointTemperature', type: 'IfcReal', description: 'The temperature value to be sensed. Use IfcPropertyBoundedValue.SetPointValue to set the set point value.' },
      { name: 'TemperatureSensorType', type: 'IfcLabel', description: 'Enumeration that Identifies the types of temperature sensor that can be specified.' },
    ],
  },

  'Pset_SensorTypeTurnoutClosureSensor': {
    label:       'Property Set: Sensor Type Turnout Closure Sensor',
    description: 'Properties that are applicable for [[IfcSensor]] with predefined type TURNOUTCLOSURESENSOR.',
    applicableTo: ['IFCSENSORTURNOUTCLOSURESENSOR'],
    props: [
      { name: 'DetectionRange', type: 'IfcReal', description: 'The detection range of the equipment.' },
      { name: 'IndicationRodMovementRange', type: 'IfcReal', description: 'Indicates the range of indication rod movement.' },
    ],
  },

  'Pset_SensorTypeWindSensor': {
    label:       'Property Set: Sensor Type Wind Sensor',
    description: 'A device that senses or detects wind speed and direction.',
    applicableTo: ['IFCSENSORWINDSENSOR'],
    props: [
      { name: 'DampingRatio', type: 'IfcReal', description: 'Indicates the damping ratio of the device.' },
      { name: 'DataCollectionType', type: 'IfcLabel', description: 'Indicates the type or manner of data collection.' },
      { name: 'LinearVelocityResolution', type: 'IfcReal', description: 'Indicates the resolution of the detected linear velocity.' },
      { name: 'MarginOfError', type: 'IfcReal', description: 'Indicates the margin of error of the measurement.' },
      { name: 'SamplingFrequency', type: 'IfcReal', description: 'Indicates the sampling frequency of the device.' },
      { name: 'SerialInterfaceType', type: 'IfcLabel', description: 'Indicates the type of serial interface used by the device.' },
      { name: 'SetPointSpeed', type: 'IfcReal', description: 'The wind speed value to be sensed. Use IfcPropertyBoundedValue.SetPointValue to set the set point value.' },
      { name: 'StartingWindSpeed', type: 'IfcReal', description: 'Indicates the starting wind speed of the wind sensor.' },
      { name: 'TimeConstant', type: 'IfcReal', description: 'The time constant of the sensor.' },
      { name: 'WindAngleRange', type: 'IfcReal', description: 'Indicates the wind angle range the sensor can monitor.' },
      { name: 'WindSensorType', type: 'IfcLabel', description: 'Enumeration that Identifies the types of wind sensors that can be specified.' },
      { name: 'WindSpeedRange', type: 'IfcReal', description: 'Indicates the range of wind speed the sensor can monitor.' },
      { name: 'WorkingState', type: 'IfcLabel', description: 'Indicates the working state of device or system.' },
    ],
  },

  'Pset_ServiceLife': {
    label:       'Property Set: Service Life',
    description: 'Captures the period of time that an artifact will last.',
    applicableTo: ['*'],
    props: [
      { name: 'MeanTimeBetweenFailure', type: 'IfcLabel', description: 'The average time duration between instances of failure of a product.' },
      { name: 'ServiceLifeDuration', type: 'IfcLabel', description: 'The length or duration of a service life.The lower bound indicates pessimistic service life, the upper bound indicates o' },
    ],
  },

  'Pset_ServiceLifeFactors': {
    label:       'Property Set: Service Life Factors',
    description: 'Captures various factors that impact the expected service life of elements within the system or zone.',
    applicableTo: ['IFCBUILTSYSTEM', 'IFCBUILTSYSTEMEROSIONPREVENTION', 'IFCBUILTSYSTEMFENESTRATION', 'IFCBUILTSYSTEMFOUNDATION', 'IFCBUILTSYSTEMLOADBEARING', 'IFCBUILTSYSTEMMOORING', 'IFCBUILTSYSTEMOUTERSHELL', 'IFCBUILTSYSTEMPRESTRESSING', 'IFCBUILTSYSTEMRAILWAYLINE', 'IFCBUILTSYSTEMRAILWAYTRACK', 'IFCBUILTSYSTEMREINFORCING', 'IFCBUILTSYSTEMSHADING', 'IFCBUILTSYSTEMTRACKCIRCUIT', 'IFCBUILTSYSTEMTRANSPORT', 'IFCDISTRIBUTIONCIRCUIT', 'IFCDISTRIBUTIONSYSTEM', 'IFCDISTRIBUTIONSYSTEMAIRCONDITIONING', 'IFCDISTRIBUTIONSYSTEMAUDIOVISUAL', 'IFCDISTRIBUTIONSYSTEMCATENARY_SYSTEM', 'IFCDISTRIBUTIONSYSTEMCHEMICAL', 'IFCDISTRIBUTIONSYSTEMCHILLEDWATER', 'IFCDISTRIBUTIONSYSTEMCOMMUNICATION', 'IFCDISTRIBUTIONSYSTEMCOMPRESSEDAIR', 'IFCDISTRIBUTIONSYSTEMCONDENSERWATER', 'IFCDISTRIBUTIONSYSTEMCONTROL', 'IFCDISTRIBUTIONSYSTEMCONVEYING', 'IFCDISTRIBUTIONSYSTEMDATA', 'IFCDISTRIBUTIONSYSTEMDISPOSAL', 'IFCDISTRIBUTIONSYSTEMDOMESTICCOLDWATER', 'IFCDISTRIBUTIONSYSTEMDOMESTICHOTWATER', 'IFCDISTRIBUTIONSYSTEMDRAINAGE', 'IFCDISTRIBUTIONSYSTEMEARTHING', 'IFCDISTRIBUTIONSYSTEMELECTRICAL', 'IFCDISTRIBUTIONSYSTEMELECTROACOUSTIC', 'IFCDISTRIBUTIONSYSTEMEXHAUST', 'IFCDISTRIBUTIONSYSTEMFIREPROTECTION', 'IFCDISTRIBUTIONSYSTEMFIXEDTRANSMISSIONNETWORK', 'IFCDISTRIBUTIONSYSTEMFUEL', 'IFCDISTRIBUTIONSYSTEMGAS', 'IFCDISTRIBUTIONSYSTEMHAZARDOUS', 'IFCDISTRIBUTIONSYSTEMHEATING', 'IFCDISTRIBUTIONSYSTEMLIGHTING', 'IFCDISTRIBUTIONSYSTEMLIGHTNINGPROTECTION', 'IFCDISTRIBUTIONSYSTEMMOBILENETWORK', 'IFCDISTRIBUTIONSYSTEMMONITORINGSYSTEM', 'IFCDISTRIBUTIONSYSTEMMUNICIPALSOLIDWASTE', 'IFCDISTRIBUTIONSYSTEMOIL', 'IFCDISTRIBUTIONSYSTEMOPERATIONAL', 'IFCDISTRIBUTIONSYSTEMOPERATIONALTELEPHONYSYSTEM', 'IFCDISTRIBUTIONSYSTEMOVERHEAD_CONTACTLINE_SYSTEM', 'IFCDISTRIBUTIONSYSTEMPOWERGENERATION', 'IFCDISTRIBUTIONSYSTEMRAINWATER', 'IFCDISTRIBUTIONSYSTEMREFRIGERATION', 'IFCDISTRIBUTIONSYSTEMRETURN_CIRCUIT', 'IFCDISTRIBUTIONSYSTEMSECURITY', 'IFCDISTRIBUTIONSYSTEMSEWAGE', 'IFCDISTRIBUTIONSYSTEMSIGNAL', 'IFCDISTRIBUTIONSYSTEMSTORMWATER', 'IFCDISTRIBUTIONSYSTEMTELEPHONE', 'IFCDISTRIBUTIONSYSTEMTV', 'IFCDISTRIBUTIONSYSTEMVACUUM', 'IFCDISTRIBUTIONSYSTEMVENT', 'IFCDISTRIBUTIONSYSTEMVENTILATION', 'IFCDISTRIBUTIONSYSTEMWASTEWATER', 'IFCDISTRIBUTIONSYSTEMWATERSUPPLY', 'IFCSTRUCTURALANALYSISMODEL', 'IFCSTRUCTURALANALYSISMODELIN_PLANE_LOADING_2D', 'IFCSTRUCTURALANALYSISMODELLOADING_3D', 'IFCSTRUCTURALANALYSISMODELOUT_PLANE_LOADING_2D', 'IFCSYSTEM', 'IFCZONE'],
    props: [
      { name: 'DesignLevel', type: 'IfcReal', description: 'Adjustment of the service life resulting from the effect of design level employed.' },
      { name: 'IndoorEnvironment', type: 'IfcReal', description: 'Adjustment of the service life resulting from the effect of the indoor environment (where appropriate).' },
      { name: 'InUseConditions', type: 'IfcReal', description: 'Adjustment of the service life resulting from the effect of the conditions in which components are operating.' },
      { name: 'MaintenanceLevel', type: 'IfcReal', description: 'Adjustment of the service life resulting from the effect of the level or degree of maintenance applied to dcomponents.' },
      { name: 'OutdoorEnvironment', type: 'IfcReal', description: 'Adjustment of the service life resulting from the effect of the outdoor environment (where appropriate)' },
      { name: 'QualityOfComponents', type: 'IfcReal', description: 'Adjustment of the service life resulting from the effect of the quality of components used.' },
      { name: 'WorkExecutionLevel', type: 'IfcReal', description: 'Adjustment of the service life resulting from the effect of the quality of work executed.' },
    ],
  },

  'Pset_ShadingDeviceCommon': {
    label:       'Property Set: Shading Device Common',
    description: 'Shading device properties associated with an element that represents a shading device',
    applicableTo: ['IFCSHADINGDEVICE', 'IFCSHADINGDEVICEAWNING', 'IFCSHADINGDEVICEJALOUSIE', 'IFCSHADINGDEVICESHUTTER'],
    props: [
      { name: 'IsExternal', type: 'IfcBoolean', description: 'Indication whether the element is designed for use in the exterior (TRUE) or not (FALSE). If (TRUE) it is an external el' },
      { name: 'MechanicalOperated', type: 'IfcBoolean', description: 'Indication whether the element is operated machanically (TRUE) or not, i.e. manually (FALSE).' },
      { name: 'Roughness', type: 'IfcLabel', description: 'A measure of the vertical deviations of the surface.' },
      { name: 'ShadingDeviceType', type: 'IfcLabel', description: 'Specifies the type of shading device.' },
      { name: 'SolarReflectance', type: 'IfcReal', description: 'The ratio of incident solar radiation that is reflected by a glazing system (also named ρe). Note the following equation' },
      { name: 'SolarTransmittance', type: 'IfcReal', description: 'The ratio of incident solar radiation that directly passes through a system (also named τe). Note the following equation' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'SurfaceColour', type: 'IfcLabel', description: 'The colour of the surface.' },
      { name: 'ThermalTransmittance', type: 'IfcReal', description: 'Thermal transmittance coefficient (U-Value) of an element, within the direction of the thermal flow (including all mater' },
      { name: 'VisibleLightReflectance', type: 'IfcReal', description: 'Fraction of the visible light that is reflected by the glazing at normal incidence. It is a value without unit.' },
      { name: 'VisibleLightTransmittance', type: 'IfcReal', description: 'Fraction of the visible light that passes the object at normal incidence. It is a value without unit.' },
    ],
  },

  'Pset_ShadingDevicePHistory': {
    label:       'Property Set: Shading Device Phistory',
    description: 'Shading device performance history attributes.',
    applicableTo: ['IFCSHADINGDEVICE', 'IFCSHADINGDEVICEAWNING', 'IFCSHADINGDEVICEJALOUSIE', 'IFCSHADINGDEVICESHUTTER'],
    props: [
      { name: 'Azimuth', type: 'IfcTimeSeries', description: 'The azimuth of the outward normal for the outward or upward facing surface.' },
      { name: 'TiltAngle', type: 'IfcTimeSeries', description: 'The angle of tilt defined in the plane perpendicular to the extrusion axis (X-Axis of the local placement). The angle sh' },
    ],
  },

  'Pset_ShipLockCommon': {
    label:       'Property Set: Ship Lock Common',
    description: 'Properties common to the definition of all occurrences of [[IfcMarineFacility]] with the predefined type set to SHIPLOCK.',
    applicableTo: ['IFCMARINEFACILITYSHIPLOCK'],
    props: [
      { name: 'CillLevelLowerHead', type: 'IfcReal', description: 'Height of the lower head cill level' },
      { name: 'CillLevelUpperHead', type: 'IfcReal', description: 'Height of the upper head cill level' },
      { name: 'WaterDeliverySystemType', type: 'IfcLabel', description: 'Type of water delivery system' },
      { name: 'WaterDeliveryValveType', type: 'IfcLabel', description: 'Type of water delivery valve' },
    ],
  },

  'Pset_ShiplockComplex': {
    label:       'Property Set: Shiplock Complex',
    description: 'Properties common to the definition of occurrences of [[IfcMarineFacility]] with the predefined type set to SHIPLOCK, where the facility represents a complex of multiple shiplocks.',
    applicableTo: ['IFCMARINEFACILITYSHIPLOCK'],
    props: [
      { name: 'LockChamberLevels', type: 'IfcInteger', description: 'Number of steps (chambers) in a lock line' },
      { name: 'LockGrade', type: 'IfcLabel', description: 'Operational grading of the ship lock complex' },
      { name: 'LockLines', type: 'IfcInteger', description: 'Number of Parallel lock series' },
      { name: 'LockMode', type: 'IfcLabel', description: 'Type of lock system used.' },
    ],
  },

  'Pset_ShiplockDesignCriteria': {
    label:       'Property Set: Shiplock Design Criteria',
    description: 'Properties common to the definition of design criteria of all occurrences of [[IfcMarineFacility]] with the predefined type set to SHIPLOCK.',
    applicableTo: ['IFCMARINEFACILITYSHIPLOCK'],
    props: [
      { name: 'DownstreamFloodWaterLevel', type: 'IfcReal', description: 'the design minimum upstream water level for the lock complex' },
      { name: 'DownstreamMaintenanceWaterLevel', type: 'IfcReal', description: 'Design minimum upstream water level for the lock complex' },
      { name: 'MaximumDownstreamNavigableWaterLevel', type: 'IfcReal', description: 'Design maximum downstream water level for the lock complex' },
      { name: 'MaximumUpstreamNavigableWaterLevel', type: 'IfcReal', description: 'Design maximum upstream water level for the lock complex' },
      { name: 'MinimumDownstreamNavigableWaterLevel', type: 'IfcReal', description: 'Design minimum downstream water level for the lock complex' },
      { name: 'MinimumUpstreamNavigableWaterLevel', type: 'IfcReal', description: 'Design minimum upstream water level for the lock complex' },
      { name: 'UpstreamFloodWaterLevel', type: 'IfcReal', description: 'Design maximum upstream water level for the lock complex' },
      { name: 'UpstreamMaintenanceWaterLevel', type: 'IfcReal', description: 'Design maximum upstream water level for the lock complex' },
    ],
  },

  'Pset_ShipyardCommon': {
    label:       'Property Set: Shipyard Common',
    description: 'Properties common to the definition of all occurrences of [[IfcMarineFacility]] with the predefined type set to SHIPYARD.',
    applicableTo: ['IFCMARINEFACILITYSHIPYARD'],
    props: [
      { name: 'PrimaryProductionType', type: 'IfcLabel', description: 'Primary type of ship production of the facility' },
    ],
  },

  'Pset_SignCommon': {
    label:       'Property Set: Sign Common',
    description: 'Common properties for Signs.',
    applicableTo: ['IFCSIGN', 'IFCSIGNMARKER', 'IFCSIGNMIRROR', 'IFCSIGNPICTORAL'],
    props: [
      { name: 'Category', type: 'IfcLabel', description: 'Definition of the category (group or type) of material, in more general terms than given by attribute Name.It is recomme' },
      { name: 'IsExternal', type: 'IfcBoolean', description: 'Indication whether the element is designed for use in the exterior (TRUE) or not (FALSE). If (TRUE) it is an external el' },
      { name: 'TactileMarking', type: 'IfcBoolean', description: 'The kind of Tactile Marking of the element.' },
    ],
  },

  'Pset_SignalFrame': {
    label:       'Property Set: Signal Frame',
    description: 'Properties that define signal frame parameters for occurrences and types of [[IfcSignal]] applied in railways.',
    applicableTo: ['IFCSIGNAL', 'IFCSIGNALAUDIO', 'IFCSIGNALMIXED', 'IFCSIGNALVISUAL'],
    props: [
      { name: 'BackboardType', type: 'IfcLabel', description: 'The type of the backboard of the signal frame.' },
      { name: 'NominalWidth', type: 'IfcReal', description: 'The nominal overall width of the object. The size information is provided in addition to the shape representation and th' },
      { name: 'SignalFrameBackboardDiameter', type: 'IfcReal', description: 'The nominal diameter of the signal frame backboard.' },
      { name: 'SignalFrameBackboardHeight', type: 'IfcReal', description: 'The nominal height of the signal frame backboard.' },
      { name: 'SignalFrameType', type: 'IfcLabel', description: 'Type of frame, e.g. main frame, route indicator, speed indicator, direction indicator, etc.' },
      { name: 'SignalIndicatorType', type: 'IfcLabel', description: 'Type of the indicators on a signal, e.g. route indicator, speed restriction indicator etc.' },
    ],
  },

  'Pset_SiteCommon': {
    label:       'Property Set: Site Common',
    description: 'Properties common to the definition of all occurrences of [[IfcSite]]. Please note that several site attributes are handled directly at the [[IfcSite]] instance, the site number (o',
    applicableTo: ['IFCSITE'],
    props: [
      { name: 'BuildableArea', type: 'IfcReal', description: 'The area of site utilization expressed as a maximum value according to local building codes.' },
      { name: 'BuildingHeightLimit', type: 'IfcReal', description: 'Allowed maximum height of buildings on this site - according to local building codes.' },
      { name: 'FloorAreaRatio', type: 'IfcReal', description: 'The ratio of all floor areas to the buildable area as the maximum floor area utilization of the site as a maximum value' },
      { name: 'SiteCoverageRatio', type: 'IfcReal', description: 'The ratio of the utilization, TotalArea / BuildableArea, expressed as a maximum value. The ratio value may be used to de' },
      { name: 'TotalArea', type: 'IfcReal', description: 'Total planned area for the site. Used for programming the site space.' },
    ],
  },

  'Pset_SiteWeather': {
    label:       'Property Set: Site Weather',
    description: 'Properties for site weather',
    applicableTo: ['IFCSITE'],
    props: [
      { name: 'MaxAmbientTemp', type: 'IfcReal', description: 'Maximum ambient temperature of the site used as a basis of design' },
      { name: 'MinAmbientTemp', type: 'IfcReal', description: 'Minimum ambient temperature of the site used as a basis of design' },
    ],
  },

  'Pset_SlabCommon': {
    label:       'Property Set: Slab Common',
    description: 'Properties common to the definition of all occurrences of [[IfcSlab]].Properties for [[PitchAngle]] added in IFC 2x3',
    applicableTo: ['IFCSLAB', 'IFCSLABAPPROACH_SLAB', 'IFCSLABBASESLAB', 'IFCSLABFLOOR', 'IFCSLABLANDING', 'IFCSLABPAVING', 'IFCSLABROOF', 'IFCSLABSIDEWALK', 'IFCSLABTRACKSLAB', 'IFCSLABWEARING'],
    props: [
      { name: 'AcousticRating', type: 'IfcLabel', description: 'Acoustic rating for this object.; It is provided according to the national building code. It indicates the sound transmi' },
      { name: 'Combustible', type: 'IfcBoolean', description: 'Indication whether the object is made from combustible material (TRUE) or not (FALSE).' },
      { name: 'Compartmentation', type: 'IfcBoolean', description: 'Indication whether the object is designed to serve as a fire compartmentation (TRUE) or not (FALSE).' },
      { name: 'FireRating', type: 'IfcLabel', description: 'Fire rating for this object. It is given according to the national fire safety classification.' },
      { name: 'IsExternal', type: 'IfcBoolean', description: 'Indication whether the element is designed for use in the exterior (TRUE) or not (FALSE). If (TRUE) it is an external el' },
      { name: 'LoadBearing', type: 'IfcBoolean', description: 'Indicates whether the object is intended to carry loads (TRUE) or not (FALSE).' },
      { name: 'PitchAngle', type: 'IfcReal', description: 'Angle of the slab to the horizontal when used as a component for the roof (specified as 0 degrees or not asserted for ca' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'SurfaceSpreadOfFlame', type: 'IfcLabel', description: 'Indication on how the flames spread around the surface,; It is given according to the national building code that govern' },
      { name: 'ThermalTransmittance', type: 'IfcReal', description: 'Thermal transmittance coefficient (U-Value) of an element, within the direction of the thermal flow (including all mater' },
    ],
  },

  'Pset_SlabTypeTrackSlab': {
    label:       'Property Set: Slab Type Track Slab',
    description: 'Properties in this property set are generally applicable slabs used in railway tracks, modelled as [[IfcSlab]] with PredefinedType TRACKSLAB.',
    applicableTo: ['IFCSLABTRACKSLAB'],
    props: [
      { name: 'TechnicalStandard', type: 'IfcTimeSeries', description: 'The technical standard which the element should comply with.' },
    ],
  },

  'Pset_SolarDeviceTypeCommon': {
    label:       'Property Set: Solar Device Type Common',
    description: 'Common properties for solar device types.',
    applicableTo: ['IFCSOLARDEVICE', 'IFCSOLARDEVICESOLARCOLLECTOR', 'IFCSOLARDEVICESOLARPANEL'],
    props: [
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_SolidStratumCapacity': {
    label:       'Property Set: Solid Stratum Capacity',
    description: 'Properties expressing the capacity of a stratum using physical measures. Regional and National conventions should be captured through classification and specific property sets.',
    applicableTo: ['IFCGEOTECHNICALSTRATUMSOLID'],
    props: [
      { name: 'CohesionBehaviour', type: 'IfcReal', description: 'Cohesive shear strength of a rock or soil that is independent of interparticle friction.' },
      { name: 'FrictionAngle', type: 'IfcReal', description: 'Friction angle is the tested inclination angle from horizontal.' },
      { name: 'FrictionBehaviour', type: 'IfcReal', description: 'Friction shear strength of a rock or soil that is dependent on interparticle friction.' },
      { name: 'GrainSize', type: 'IfcReal', description: 'Grain size diameter.' },
      { name: 'HydraulicConductivity', type: 'IfcReal', description: 'Hydraulic Conductivity (permeability) of soil for water, given with the K or Kf value in m/s' },
      { name: 'LoadBearingCapacity', type: 'IfcReal', description: 'Maximum load bearing capacity of the floor structure throughtout the storey as designed.' },
      { name: 'NValue', type: 'IfcInteger', description: 'Blow count from standard penetration testing, to ISO 22476-3, ASTM D15861 and Australian Standards AS 1289.6.3.1, which' },
      { name: 'PermeabilityBehaviour', type: 'IfcReal', description: 'Proportionality constant in Darcy\\\'s law which relates flow rate and viscosity to a pressure gradient applied to the poro' },
      { name: 'PoisonsRatio', type: 'IfcReal', description: 'Ratio of transverse contraction strain to longitudinal extension strain in the direction of stretching force.' },
      { name: 'PwaveVelocity', type: 'IfcReal', description: 'P-wave velocity of a rock or soil.' },
      { name: 'Resistivity', type: 'IfcReal', description: 'Electrical resistivity of a rock or soil (Ohm-m).' },
      { name: 'SettlementBehaviour', type: 'IfcReal', description: 'Estimate of the settlement/compaction behaviour of the stratum.' },
      { name: 'SwaveVelocity', type: 'IfcReal', description: 'S-wave velocity of a rock or soil.' },
    ],
  },

  'Pset_SolidStratumComposition': {
    label:       'Property Set: Solid Stratum Composition',
    description: 'Properties expressing the composition of a stratum using volume measures, implementing ISO14688 Part 2 Table 1 Primary fractions and composite fractions. Regional and National conv',
    applicableTo: ['IFCGEOTECHNICALSTRATUMSOLID'],
    props: [
      { name: 'AirVolume', type: 'IfcReal', description: 'Relative volume of air stratum constituents.' },
      { name: 'BouldersVolume', type: 'IfcReal', description: 'Relative volume of boulders (typically larger than 200mm) stratum constituents.' },
      { name: 'ClayVolume', type: 'IfcReal', description: 'Relative volume of clay (typically smaller than 0.002mm) stratum constituents.' },
      { name: 'CobblesVolume', type: 'IfcReal', description: 'Relative volume of cobbles (typically larger than 63mm) stratum constituents.' },
      { name: 'CompositeFractions', type: 'IfcLabel', description: 'Denomination into soil groups by composite fractions' },
      { name: 'ContaminantVolume', type: 'IfcReal', description: 'Relative volume of contaminant stratum constituents.' },
      { name: 'FillVolume', type: 'IfcReal', description: 'Relative volume of fill (controlled placement of anthropogenic soil) stratum constituents.' },
      { name: 'GravelVolume', type: 'IfcReal', description: 'Relative volume of gravel (typically larger than 2mm) stratum constituents.' },
      { name: 'OrganicVolume', type: 'IfcReal', description: 'Relative volume of organic (peat/humus) stratum constituents especially soil.' },
      { name: 'RockVolume', type: 'IfcReal', description: 'Relative volume of rock stratum constituents.' },
      { name: 'SandVolume', type: 'IfcReal', description: 'Relative volume of sand (typically smaller than 2mm) stratum constituents.' },
      { name: 'SiltVolume', type: 'IfcReal', description: 'Relative volume of silt (typically smaller than 0.063mm) stratum constituents.' },
      { name: 'WaterVolume', type: 'IfcReal', description: 'Relative volume of water stratum constituents.' },
    ],
  },

  'Pset_SoundAttenuation': {
    label:       'Property Set: Sound Attenuation',
    description: 'Common definition to capture sound pressure at a point on behalf of a device typically used within the context of building services and flow distribution systems. To indicate sound',
    applicableTo: ['IFCANNOTATION', 'IFCANNOTATIONCONTOURLINE', 'IFCANNOTATIONDIMENSION', 'IFCANNOTATIONISOBAR', 'IFCANNOTATIONISOLUX', 'IFCANNOTATIONISOTHERM', 'IFCANNOTATIONLEADER', 'IFCANNOTATIONSURVEY', 'IFCANNOTATIONSYMBOL', 'IFCANNOTATIONTEXT'],
    props: [
      { name: 'SoundFrequency', type: 'IfcReal', description: 'List of nominal sound frequencies, correlated to the SoundPressure time series values (IfcTimeSeries.ListValues)' },
      { name: 'SoundPressure', type: 'IfcTimeSeries', description: 'A time series of sound pressure values measured in decibels at a reference pressure of 20 microPascals for the reference' },
      { name: 'SoundScale', type: 'IfcLabel', description: 'The reference sound scale.Decibels in an A-weighted scale;Decibels in an B-weighted scale;Decibels in an C-weighted scal' },
    ],
  },

  'Pset_SoundGeneration': {
    label:       'Property Set: Sound Generation',
    description: 'Common definition to capture the properties of sound typically used within the context of building services and flow distribution systems. This property set is instantiated multipl',
    applicableTo: ['IFCAIRTERMINAL', 'IFCAIRTERMINALBOX', 'IFCAIRTERMINALBOXCONSTANTFLOW', 'IFCAIRTERMINALBOXVARIABLEFLOWPRESSUREDEPENDANT', 'IFCAIRTERMINALBOXVARIABLEFLOWPRESSUREINDEPENDANT', 'IFCAIRTERMINALDIFFUSER', 'IFCAIRTERMINALGRILLE', 'IFCAIRTERMINALLOUVRE', 'IFCAIRTERMINALREGISTER', 'IFCAIRTOAIRHEATRECOVERY', 'IFCAIRTOAIRHEATRECOVERYFIXEDPLATECOUNTERFLOWEXCHAN', 'IFCAIRTOAIRHEATRECOVERYFIXEDPLATECROSSFLOWEXCHANGE', 'IFCAIRTOAIRHEATRECOVERYFIXEDPLATEPARALLELFLOWEXCHA', 'IFCAIRTOAIRHEATRECOVERYHEATPIPE', 'IFCAIRTOAIRHEATRECOVERYROTARYWHEEL', 'IFCAIRTOAIRHEATRECOVERYRUNAROUNDCOILLOOP', 'IFCAIRTOAIRHEATRECOVERYTHERMOSIPHONCOILTYPEHEATEXC', 'IFCAIRTOAIRHEATRECOVERYTHERMOSIPHONSEALEDTUBEHEATE', 'IFCAIRTOAIRHEATRECOVERYTWINTOWERENTHALPYRECOVERYLO', 'IFCAUDIOVISUALAPPLIANCE', 'IFCAUDIOVISUALAPPLIANCEAMPLIFIER', 'IFCAUDIOVISUALAPPLIANCECAMERA', 'IFCAUDIOVISUALAPPLIANCECOMMUNICATIONTERMINAL', 'IFCAUDIOVISUALAPPLIANCEDISPLAY', 'IFCAUDIOVISUALAPPLIANCEMICROPHONE', 'IFCAUDIOVISUALAPPLIANCEPLAYER', 'IFCAUDIOVISUALAPPLIANCEPROJECTOR', 'IFCAUDIOVISUALAPPLIANCERECEIVER', 'IFCAUDIOVISUALAPPLIANCERECORDINGEQUIPMENT', 'IFCAUDIOVISUALAPPLIANCESPEAKER', 'IFCAUDIOVISUALAPPLIANCESWITCHER', 'IFCAUDIOVISUALAPPLIANCETELEPHONE', 'IFCAUDIOVISUALAPPLIANCETUNER', 'IFCBOILER', 'IFCBOILERSTEAM', 'IFCBOILERWATER', 'IFCBURNER', 'IFCCABLECARRIERFITTING', 'IFCCABLECARRIERFITTINGBEND', 'IFCCABLECARRIERFITTINGCONNECTOR', 'IFCCABLECARRIERFITTINGCROSS', 'IFCCABLECARRIERFITTINGJUNCTION', 'IFCCABLECARRIERFITTINGREDUCER', 'IFCCABLECARRIERFITTINGTEE', 'IFCCABLECARRIERFITTINGTRANSITION', 'IFCCABLECARRIERSEGMENT', 'IFCCABLECARRIERSEGMENTCABLEBRACKET', 'IFCCABLECARRIERSEGMENTCABLELADDERSEGMENT', 'IFCCABLECARRIERSEGMENTCABLETRAYSEGMENT', 'IFCCABLECARRIERSEGMENTCABLETRUNKINGSEGMENT', 'IFCCABLECARRIERSEGMENTCATENARYWIRE', 'IFCCABLECARRIERSEGMENTCONDUITSEGMENT', 'IFCCABLECARRIERSEGMENTDROPPER', 'IFCCABLEFITTING', 'IFCCABLEFITTINGCONNECTOR', 'IFCCABLEFITTINGENTRY', 'IFCCABLEFITTINGEXIT', 'IFCCABLEFITTINGFANOUT', 'IFCCABLEFITTINGJUNCTION', 'IFCCABLEFITTINGTRANSITION', 'IFCCABLESEGMENT', 'IFCCABLESEGMENTBUSBARSEGMENT', 'IFCCABLESEGMENTCABLESEGMENT', 'IFCCABLESEGMENTCONDUCTORSEGMENT', 'IFCCABLESEGMENTCONTACTWIRESEGMENT', 'IFCCABLESEGMENTCORESEGMENT', 'IFCCABLESEGMENTFIBERSEGMENT', 'IFCCABLESEGMENTFIBERTUBE', 'IFCCABLESEGMENTOPTICALCABLESEGMENT', 'IFCCABLESEGMENTSTITCHWIRE', 'IFCCABLESEGMENTWIREPAIRSEGMENT', 'IFCCHILLER', 'IFCCHILLERAIRCOOLED', 'IFCCHILLERHEATRECOVERY', 'IFCCHILLERWATERCOOLED', 'IFCCOIL', 'IFCCOILDXCOOLINGCOIL', 'IFCCOILELECTRICHEATINGCOIL', 'IFCCOILGASHEATINGCOIL', 'IFCCOILHYDRONICCOIL', 'IFCCOILSTEAMHEATINGCOIL', 'IFCCOILWATERCOOLINGCOIL', 'IFCCOILWATERHEATINGCOIL', 'IFCCOMMUNICATIONSAPPLIANCE', 'IFCCOMMUNICATIONSAPPLIANCEANTENNA', 'IFCCOMMUNICATIONSAPPLIANCEAUTOMATON', 'IFCCOMMUNICATIONSAPPLIANCECOMPUTER', 'IFCCOMMUNICATIONSAPPLIANCEFAX', 'IFCCOMMUNICATIONSAPPLIANCEGATEWAY', 'IFCCOMMUNICATIONSAPPLIANCEINTELLIGENTPERIPHERAL', 'IFCCOMMUNICATIONSAPPLIANCEIPNETWORKEQUIPMENT', 'IFCCOMMUNICATIONSAPPLIANCELINESIDEELECTRONICUNIT', 'IFCCOMMUNICATIONSAPPLIANCEMODEM', 'IFCCOMMUNICATIONSAPPLIANCENETWORKAPPLIANCE', 'IFCCOMMUNICATIONSAPPLIANCENETWORKBRIDGE', 'IFCCOMMUNICATIONSAPPLIANCENETWORKHUB', 'IFCCOMMUNICATIONSAPPLIANCEOPTICALLINETERMINAL', 'IFCCOMMUNICATIONSAPPLIANCEOPTICALNETWORKUNIT', 'IFCCOMMUNICATIONSAPPLIANCEPRINTER', 'IFCCOMMUNICATIONSAPPLIANCERADIOBLOCKCENTER', 'IFCCOMMUNICATIONSAPPLIANCEREPEATER', 'IFCCOMMUNICATIONSAPPLIANCEROUTER', 'IFCCOMMUNICATIONSAPPLIANCESCANNER', 'IFCCOMMUNICATIONSAPPLIANCETELECOMMAND', 'IFCCOMMUNICATIONSAPPLIANCETELEPHONYEXCHANGE', 'IFCCOMMUNICATIONSAPPLIANCETRANSITIONCOMPONENT', 'IFCCOMMUNICATIONSAPPLIANCETRANSPONDER', 'IFCCOMMUNICATIONSAPPLIANCETRANSPORTEQUIPMENT', 'IFCCOMPRESSOR', 'IFCCOMPRESSORBOOSTER', 'IFCCOMPRESSORDYNAMIC', 'IFCCOMPRESSORHERMETIC', 'IFCCOMPRESSOROPENTYPE', 'IFCCOMPRESSORRECIPROCATING', 'IFCCOMPRESSORROLLINGPISTON', 'IFCCOMPRESSORROTARY', 'IFCCOMPRESSORROTARYVANE', 'IFCCOMPRESSORSCROLL', 'IFCCOMPRESSORSEMIHERMETIC', 'IFCCOMPRESSORSINGLESCREW', 'IFCCOMPRESSORSINGLESTAGE', 'IFCCOMPRESSORTROCHOIDAL', 'IFCCOMPRESSORTWINSCREW', 'IFCCOMPRESSORWELDEDSHELLHERMETIC', 'IFCCONDENSER', 'IFCCONDENSERAIRCOOLED', 'IFCCONDENSEREVAPORATIVECOOLED', 'IFCCONDENSERWATERCOOLED', 'IFCCONDENSERWATERCOOLEDBRAZEDPLATE', 'IFCCONDENSERWATERCOOLEDSHELLCOIL', 'IFCCONDENSERWATERCOOLEDSHELLTUBE', 'IFCCONDENSERWATERCOOLEDTUBEINTUBE', 'IFCCONVEYORSEGMENT', 'IFCCONVEYORSEGMENTBELTCONVEYOR', 'IFCCONVEYORSEGMENTBUCKETCONVEYOR', 'IFCCONVEYORSEGMENTCHUTECONVEYOR', 'IFCCONVEYORSEGMENTSCREWCONVEYOR', 'IFCCOOLEDBEAM', 'IFCCOOLEDBEAMACTIVE', 'IFCCOOLEDBEAMPASSIVE', 'IFCCOOLINGTOWER', 'IFCCOOLINGTOWERMECHANICALFORCEDDRAFT', 'IFCCOOLINGTOWERMECHANICALINDUCEDDRAFT', 'IFCCOOLINGTOWERNATURALDRAFT', 'IFCDAMPER', 'IFCDAMPERBACKDRAFTDAMPER', 'IFCDAMPERBALANCINGDAMPER', 'IFCDAMPERBLASTDAMPER', 'IFCDAMPERCONTROLDAMPER', 'IFCDAMPERFIREDAMPER', 'IFCDAMPERFIRESMOKEDAMPER', 'IFCDAMPERFUMEHOODEXHAUST', 'IFCDAMPERGRAVITYDAMPER', 'IFCDAMPERGRAVITYRELIEFDAMPER', 'IFCDAMPERRELIEFDAMPER', 'IFCDAMPERSMOKEDAMPER', 'IFCDISTRIBUTIONBOARD', 'IFCDISTRIBUTIONBOARDCONSUMERUNIT', 'IFCDISTRIBUTIONBOARDDISPATCHINGBOARD', 'IFCDISTRIBUTIONBOARDDISTRIBUTIONBOARD', 'IFCDISTRIBUTIONBOARDDISTRIBUTIONFRAME', 'IFCDISTRIBUTIONBOARDMOTORCONTROLCENTRE', 'IFCDISTRIBUTIONBOARDSWITCHBOARD', 'IFCDISTRIBUTIONCHAMBERELEMENT', 'IFCDISTRIBUTIONCHAMBERELEMENTFORMEDDUCT', 'IFCDISTRIBUTIONCHAMBERELEMENTINSPECTIONCHAMBER', 'IFCDISTRIBUTIONCHAMBERELEMENTINSPECTIONPIT', 'IFCDISTRIBUTIONCHAMBERELEMENTMANHOLE', 'IFCDISTRIBUTIONCHAMBERELEMENTMETERCHAMBER', 'IFCDISTRIBUTIONCHAMBERELEMENTSUMP', 'IFCDISTRIBUTIONCHAMBERELEMENTTRENCH', 'IFCDISTRIBUTIONCHAMBERELEMENTVALVECHAMBER', 'IFCDISTRIBUTIONFLOWELEMENT', 'IFCDUCTFITTING', 'IFCDUCTFITTINGBEND', 'IFCDUCTFITTINGCONNECTOR', 'IFCDUCTFITTINGENTRY', 'IFCDUCTFITTINGEXIT', 'IFCDUCTFITTINGJUNCTION', 'IFCDUCTFITTINGOBSTRUCTION', 'IFCDUCTFITTINGTRANSITION', 'IFCDUCTSEGMENT', 'IFCDUCTSEGMENTFLEXIBLESEGMENT', 'IFCDUCTSEGMENTRIGIDSEGMENT', 'IFCDUCTSILENCER', 'IFCDUCTSILENCERFLATOVAL', 'IFCDUCTSILENCERRECTANGULAR', 'IFCDUCTSILENCERROUND', 'IFCELECTRICAPPLIANCE', 'IFCELECTRICAPPLIANCEDISHWASHER', 'IFCELECTRICAPPLIANCEELECTRICCOOKER', 'IFCELECTRICAPPLIANCEFREESTANDINGELECTRICHEATER', 'IFCELECTRICAPPLIANCEFREESTANDINGFAN', 'IFCELECTRICAPPLIANCEFREESTANDINGWATERCOOLER', 'IFCELECTRICAPPLIANCEFREESTANDINGWATERHEATER', 'IFCELECTRICAPPLIANCEFREEZER', 'IFCELECTRICAPPLIANCEFRIDGE_FREEZER', 'IFCELECTRICAPPLIANCEHANDDRYER', 'IFCELECTRICAPPLIANCEKITCHENMACHINE', 'IFCELECTRICAPPLIANCEMICROWAVE', 'IFCELECTRICAPPLIANCEPHOTOCOPIER', 'IFCELECTRICAPPLIANCEREFRIGERATOR', 'IFCELECTRICAPPLIANCETUMBLEDRYER', 'IFCELECTRICAPPLIANCEVENDINGMACHINE', 'IFCELECTRICAPPLIANCEWASHINGMACHINE', 'IFCELECTRICFLOWSTORAGEDEVICE', 'IFCELECTRICFLOWSTORAGEDEVICEBATTERY', 'IFCELECTRICFLOWSTORAGEDEVICECAPACITOR', 'IFCELECTRICFLOWSTORAGEDEVICECAPACITORBANK', 'IFCELECTRICFLOWSTORAGEDEVICECOMPENSATOR', 'IFCELECTRICFLOWSTORAGEDEVICEHARMONICFILTER', 'IFCELECTRICFLOWSTORAGEDEVICEINDUCTOR', 'IFCELECTRICFLOWSTORAGEDEVICEINDUCTORBANK', 'IFCELECTRICFLOWSTORAGEDEVICERECHARGER', 'IFCELECTRICFLOWSTORAGEDEVICEUPS', 'IFCELECTRICFLOWTREATMENTDEVICE', 'IFCELECTRICFLOWTREATMENTDEVICEELECTRONICFILTER', 'IFCELECTRICGENERATOR', 'IFCELECTRICGENERATORCHP', 'IFCELECTRICGENERATORENGINEGENERATOR', 'IFCELECTRICGENERATORSTANDALONE', 'IFCELECTRICMOTOR', 'IFCELECTRICMOTORDC', 'IFCELECTRICMOTORINDUCTION', 'IFCELECTRICMOTORPOLYPHASE', 'IFCELECTRICMOTORRELUCTANCESYNCHRONOUS', 'IFCELECTRICMOTORSYNCHRONOUS', 'IFCELECTRICTIMECONTROL', 'IFCELECTRICTIMECONTROLRELAY', 'IFCELECTRICTIMECONTROLTIMECLOCK', 'IFCELECTRICTIMECONTROLTIMEDELAY', 'IFCENERGYCONVERSIONDEVICE', 'IFCENGINE', 'IFCENGINEEXTERNALCOMBUSTION', 'IFCENGINEINTERNALCOMBUSTION', 'IFCEVAPORATIVECOOLER', 'IFCEVAPORATIVECOOLERDIRECTEVAPORATIVEAIRWASHER', 'IFCEVAPORATIVECOOLERDIRECTEVAPORATIVEPACKAGEDROTAR', 'IFCEVAPORATIVECOOLERDIRECTEVAPORATIVERANDOMMEDIAAI', 'IFCEVAPORATIVECOOLERDIRECTEVAPORATIVERIGIDMEDIAAIR', 'IFCEVAPORATIVECOOLERDIRECTEVAPORATIVESLINGERSPACKA', 'IFCEVAPORATIVECOOLERINDIRECTDIRECTCOMBINATION', 'IFCEVAPORATIVECOOLERINDIRECTEVAPORATIVECOOLINGTOWE', 'IFCEVAPORATIVECOOLERINDIRECTEVAPORATIVEPACKAGEAIRC', 'IFCEVAPORATIVECOOLERINDIRECTEVAPORATIVEWETCOIL', 'IFCEVAPORATOR', 'IFCEVAPORATORDIRECTEXPANSION', 'IFCEVAPORATORDIRECTEXPANSIONBRAZEDPLATE', 'IFCEVAPORATORDIRECTEXPANSIONSHELLANDTUBE', 'IFCEVAPORATORDIRECTEXPANSIONTUBEINTUBE', 'IFCEVAPORATORFLOODEDSHELLANDTUBE', 'IFCEVAPORATORSHELLANDCOIL', 'IFCFAN', 'IFCFANCENTRIFUGALAIRFOIL', 'IFCFANCENTRIFUGALBACKWARDINCLINEDCURVED', 'IFCFANCENTRIFUGALFORWARDCURVED', 'IFCFANCENTRIFUGALRADIAL', 'IFCFANPROPELLORAXIAL', 'IFCFANTUBEAXIAL', 'IFCFANVANEAXIAL', 'IFCFILTER', 'IFCFILTERAIRPARTICLEFILTER', 'IFCFILTERCOMPRESSEDAIRFILTER', 'IFCFILTERODORFILTER', 'IFCFILTEROILFILTER', 'IFCFILTERSTRAINER', 'IFCFILTERWATERFILTER', 'IFCFIRESUPPRESSIONTERMINAL', 'IFCFIRESUPPRESSIONTERMINALBREECHINGINLET', 'IFCFIRESUPPRESSIONTERMINALFIREHYDRANT', 'IFCFIRESUPPRESSIONTERMINALFIREMONITOR', 'IFCFIRESUPPRESSIONTERMINALHOSEREEL', 'IFCFIRESUPPRESSIONTERMINALSPRINKLER', 'IFCFIRESUPPRESSIONTERMINALSPRINKLERDEFLECTOR', 'IFCFLOWCONTROLLER', 'IFCFLOWFITTING', 'IFCFLOWMETER', 'IFCFLOWMETERENERGYMETER', 'IFCFLOWMETERGASMETER', 'IFCFLOWMETEROILMETER', 'IFCFLOWMETERWATERMETER', 'IFCFLOWMOVINGDEVICE', 'IFCFLOWSEGMENT', 'IFCFLOWSTORAGEDEVICE', 'IFCFLOWTERMINAL', 'IFCFLOWTREATMENTDEVICE', 'IFCHEATEXCHANGER', 'IFCHEATEXCHANGERPLATE', 'IFCHEATEXCHANGERSHELLANDTUBE', 'IFCHEATEXCHANGERTURNOUTHEATING', 'IFCHUMIDIFIER', 'IFCHUMIDIFIERADIABATICAIRWASHER', 'IFCHUMIDIFIERADIABATICATOMIZING', 'IFCHUMIDIFIERADIABATICCOMPRESSEDAIRNOZZLE', 'IFCHUMIDIFIERADIABATICPAN', 'IFCHUMIDIFIERADIABATICRIGIDMEDIA', 'IFCHUMIDIFIERADIABATICULTRASONIC', 'IFCHUMIDIFIERADIABATICWETTEDELEMENT', 'IFCHUMIDIFIERASSISTEDBUTANE', 'IFCHUMIDIFIERASSISTEDELECTRIC', 'IFCHUMIDIFIERASSISTEDNATURALGAS', 'IFCHUMIDIFIERASSISTEDPROPANE', 'IFCHUMIDIFIERASSISTEDSTEAM', 'IFCHUMIDIFIERSTEAMINJECTION', 'IFCINTERCEPTOR', 'IFCINTERCEPTORCYCLONIC', 'IFCINTERCEPTORGREASE', 'IFCINTERCEPTOROIL', 'IFCINTERCEPTORPETROL', 'IFCJUNCTIONBOX', 'IFCJUNCTIONBOXDATA', 'IFCJUNCTIONBOXPOWER', 'IFCLAMP', 'IFCLAMPCOMPACTFLUORESCENT', 'IFCLAMPFLUORESCENT', 'IFCLAMPHALOGEN', 'IFCLAMPHIGHPRESSUREMERCURY', 'IFCLAMPHIGHPRESSURESODIUM', 'IFCLAMPLED', 'IFCLAMPMETALHALIDE', 'IFCLAMPOLED', 'IFCLAMPTUNGSTENFILAMENT', 'IFCLIGHTFIXTURE', 'IFCLIGHTFIXTUREDIRECTIONSOURCE', 'IFCLIGHTFIXTUREPOINTSOURCE', 'IFCLIGHTFIXTURESECURITYLIGHTING', 'IFCLIQUIDTERMINAL', 'IFCLIQUIDTERMINALHOSEREEL', 'IFCLIQUIDTERMINALLOADINGARM', 'IFCMEDICALDEVICE', 'IFCMEDICALDEVICEAIRSTATION', 'IFCMEDICALDEVICEFEEDAIRUNIT', 'IFCMEDICALDEVICEOXYGENGENERATOR', 'IFCMEDICALDEVICEOXYGENPLANT', 'IFCMEDICALDEVICEVACUUMSTATION', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCE', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCEACCESSPOINT', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCEBASEBANDUNIT', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCEBASETRANSCEIVE', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCEE_UTRAN_NODE_B', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCEGATEWAY_GPRS_S', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCEMASTERUNIT', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCEMOBILESWITCHIN', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCEMSCSERVER', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCEPACKETCONTROLU', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCEREMOTERADIOUNI', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCEREMOTEUNIT', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCESERVICE_GPRS_S', 'IFCMOBILETELECOMMUNICATIONSAPPLIANCESUBSCRIBERSERV', 'IFCMOTORCONNECTION', 'IFCMOTORCONNECTIONBELTDRIVE', 'IFCMOTORCONNECTIONCOUPLING', 'IFCMOTORCONNECTIONDIRECTDRIVE', 'IFCOUTLET', 'IFCOUTLETAUDIOVISUALOUTLET', 'IFCOUTLETCOMMUNICATIONSOUTLET', 'IFCOUTLETDATAOUTLET', 'IFCOUTLETPOWEROUTLET', 'IFCOUTLETTELEPHONEOUTLET', 'IFCPIPEFITTING', 'IFCPIPEFITTINGBEND', 'IFCPIPEFITTINGCONNECTOR', 'IFCPIPEFITTINGENTRY', 'IFCPIPEFITTINGEXIT', 'IFCPIPEFITTINGJUNCTION', 'IFCPIPEFITTINGOBSTRUCTION', 'IFCPIPEFITTINGTRANSITION', 'IFCPIPESEGMENT', 'IFCPIPESEGMENTCULVERT', 'IFCPIPESEGMENTFLEXIBLESEGMENT', 'IFCPIPESEGMENTGUTTER', 'IFCPIPESEGMENTRIGIDSEGMENT', 'IFCPIPESEGMENTSPOOL', 'IFCPROTECTIVEDEVICE', 'IFCPROTECTIVEDEVICEANTI_ARCING_DEVICE', 'IFCPROTECTIVEDEVICECIRCUITBREAKER', 'IFCPROTECTIVEDEVICEEARTHINGSWITCH', 'IFCPROTECTIVEDEVICEEARTHLEAKAGECIRCUITBREAKER', 'IFCPROTECTIVEDEVICEFUSEDISCONNECTOR', 'IFCPROTECTIVEDEVICERESIDUALCURRENTCIRCUITBREAKER', 'IFCPROTECTIVEDEVICERESIDUALCURRENTSWITCH', 'IFCPROTECTIVEDEVICESPARKGAP', 'IFCPROTECTIVEDEVICEVARISTOR', 'IFCPROTECTIVEDEVICEVOLTAGELIMITER', 'IFCPUMP', 'IFCPUMPCIRCULATOR', 'IFCPUMPENDSUCTION', 'IFCPUMPSPLITCASE', 'IFCPUMPSUBMERSIBLEPUMP', 'IFCPUMPSUMPPUMP', 'IFCPUMPVERTICALINLINE', 'IFCPUMPVERTICALTURBINE', 'IFCSANITARYTERMINAL', 'IFCSANITARYTERMINALBATH', 'IFCSANITARYTERMINALBIDET', 'IFCSANITARYTERMINALCISTERN', 'IFCSANITARYTERMINALSANITARYFOUNTAIN', 'IFCSANITARYTERMINALSHOWER', 'IFCSANITARYTERMINALSINK', 'IFCSANITARYTERMINALTOILETPAN', 'IFCSANITARYTERMINALURINAL', 'IFCSANITARYTERMINALWASHHANDBASIN', 'IFCSANITARYTERMINALWCSEAT', 'IFCSIGNAL', 'IFCSIGNALAUDIO', 'IFCSIGNALMIXED', 'IFCSIGNALVISUAL', 'IFCSOLARDEVICE', 'IFCSOLARDEVICESOLARCOLLECTOR', 'IFCSOLARDEVICESOLARPANEL', 'IFCSPACEHEATER', 'IFCSPACEHEATERCONVECTOR', 'IFCSPACEHEATERRADIATOR', 'IFCSTACKTERMINAL', 'IFCSTACKTERMINALBIRDCAGE', 'IFCSTACKTERMINALCOWL', 'IFCSTACKTERMINALRAINWATERHOPPER', 'IFCSWITCHINGDEVICE', 'IFCSWITCHINGDEVICECONTACTOR', 'IFCSWITCHINGDEVICEDIMMERSWITCH', 'IFCSWITCHINGDEVICEEMERGENCYSTOP', 'IFCSWITCHINGDEVICEKEYPAD', 'IFCSWITCHINGDEVICEMOMENTARYSWITCH', 'IFCSWITCHINGDEVICERELAY', 'IFCSWITCHINGDEVICESELECTORSWITCH', 'IFCSWITCHINGDEVICESTARTER', 'IFCSWITCHINGDEVICESTART_AND_STOP_EQUIPMENT', 'IFCSWITCHINGDEVICESWITCHDISCONNECTOR', 'IFCSWITCHINGDEVICETOGGLESWITCH', 'IFCTANK', 'IFCTANKBASIN', 'IFCTANKBREAKPRESSURE', 'IFCTANKEXPANSION', 'IFCTANKFEEDANDEXPANSION', 'IFCTANKOILRETENTIONTRAY', 'IFCTANKPRESSUREVESSEL', 'IFCTANKSTORAGE', 'IFCTANKVESSEL', 'IFCTRANSFORMER', 'IFCTRANSFORMERCHOPPER', 'IFCTRANSFORMERCOMBINED', 'IFCTRANSFORMERCURRENT', 'IFCTRANSFORMERFREQUENCY', 'IFCTRANSFORMERINVERTER', 'IFCTRANSFORMERRECTIFIER', 'IFCTRANSFORMERVOLTAGE', 'IFCTUBEBUNDLE', 'IFCTUBEBUNDLEFINNED', 'IFCUNITARYEQUIPMENT', 'IFCUNITARYEQUIPMENTAIRCONDITIONINGUNIT', 'IFCUNITARYEQUIPMENTAIRHANDLER', 'IFCUNITARYEQUIPMENTDEHUMIDIFIER', 'IFCUNITARYEQUIPMENTROOFTOPUNIT', 'IFCUNITARYEQUIPMENTSPLITSYSTEM', 'IFCVALVE', 'IFCVALVEAIRRELEASE', 'IFCVALVEANTIVACUUM', 'IFCVALVECHANGEOVER', 'IFCVALVECHECK', 'IFCVALVECOMMISSIONING', 'IFCVALVEDIVERTING', 'IFCVALVEDOUBLECHECK', 'IFCVALVEDOUBLEREGULATING', 'IFCVALVEDRAWOFFCOCK', 'IFCVALVEFAUCET', 'IFCVALVEFLUSHING', 'IFCVALVEGASCOCK', 'IFCVALVEGASTAP', 'IFCVALVEISOLATING', 'IFCVALVEMIXING', 'IFCVALVEPRESSUREREDUCING', 'IFCVALVEPRESSURERELIEF', 'IFCVALVEREGULATING', 'IFCVALVESAFETYCUTOFF', 'IFCVALVESTEAMTRAP', 'IFCVALVESTOPCOCK', 'IFCWASTETERMINAL', 'IFCWASTETERMINALFLOORTRAP', 'IFCWASTETERMINALFLOORWASTE', 'IFCWASTETERMINALGULLYSUMP', 'IFCWASTETERMINALGULLYTRAP', 'IFCWASTETERMINALROOFDRAIN', 'IFCWASTETERMINALWASTEDISPOSALUNIT', 'IFCWASTETERMINALWASTETRAP'],
    props: [
      { name: 'SoundCurve', type: 'IfcReal', description: 'Sound curve.' },
    ],
  },

  'Pset_SpaceAirHandlingDimensioning': {
    label:       'Property Set: Space Air Handling Dimensioning',
    description: 'Properties for Space AirHandling Dimensioning.',
    applicableTo: ['IFCBRIDGE', 'IFCBRIDGEARCHED', 'IFCBRIDGECABLE_STAYED', 'IFCBRIDGECANTILEVER', 'IFCBRIDGECULVERT', 'IFCBRIDGEFRAMEWORK', 'IFCBRIDGEGIRDER', 'IFCBRIDGEPART', 'IFCBRIDGEPARTABUTMENT', 'IFCBRIDGEPARTDECK', 'IFCBRIDGEPARTDECK_SEGMENT', 'IFCBRIDGEPARTFOUNDATION', 'IFCBRIDGEPARTPIER', 'IFCBRIDGEPARTPIER_SEGMENT', 'IFCBRIDGEPARTPYLON', 'IFCBRIDGEPARTSUBSTRUCTURE', 'IFCBRIDGEPARTSUPERSTRUCTURE', 'IFCBRIDGEPARTSURFACESTRUCTURE', 'IFCBRIDGESUSPENSION', 'IFCBRIDGETRUSS', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCEXTERNALSPATIALELEMENT', 'IFCEXTERNALSPATIALELEMENTEXTERNAL', 'IFCEXTERNALSPATIALELEMENTEXTERNAL_EARTH', 'IFCEXTERNALSPATIALELEMENTEXTERNAL_FIRE', 'IFCEXTERNALSPATIALELEMENTEXTERNAL_WATER', 'IFCEXTERNALSPATIALSTRUCTUREELEMENT', 'IFCFACILITY', 'IFCFACILITYPART', 'IFCFACILITYPARTCOMMON', 'IFCFACILITYPARTCOMMONABOVEGROUND', 'IFCFACILITYPARTCOMMONBELOWGROUND', 'IFCFACILITYPARTCOMMONJUNCTION', 'IFCFACILITYPARTCOMMONLEVELCROSSING', 'IFCFACILITYPARTCOMMONSEGMENT', 'IFCFACILITYPARTCOMMONSUBSTRUCTURE', 'IFCFACILITYPARTCOMMONSUPERSTRUCTURE', 'IFCFACILITYPARTCOMMONTERMINAL', 'IFCMARINEFACILITY', 'IFCMARINEFACILITYBARRIERBEACH', 'IFCMARINEFACILITYBREAKWATER', 'IFCMARINEFACILITYCANAL', 'IFCMARINEFACILITYDRYDOCK', 'IFCMARINEFACILITYFLOATINGDOCK', 'IFCMARINEFACILITYHYDROLIFT', 'IFCMARINEFACILITYJETTY', 'IFCMARINEFACILITYLAUNCHRECOVERY', 'IFCMARINEFACILITYMARINEDEFENCE', 'IFCMARINEFACILITYNAVIGATIONALCHANNEL', 'IFCMARINEFACILITYPORT', 'IFCMARINEFACILITYQUAY', 'IFCMARINEFACILITYREVETMENT', 'IFCMARINEFACILITYSHIPLIFT', 'IFCMARINEFACILITYSHIPLOCK', 'IFCMARINEFACILITYSHIPYARD', 'IFCMARINEFACILITYSLIPWAY', 'IFCMARINEFACILITYWATERWAY', 'IFCMARINEFACILITYWATERWAYSHIPLIFT', 'IFCMARINEPART', 'IFCMARINEPARTABOVEWATERLINE', 'IFCMARINEPARTANCHORAGE', 'IFCMARINEPARTAPPROACHCHANNEL', 'IFCMARINEPARTBELOWWATERLINE', 'IFCMARINEPARTBERTHINGSTRUCTURE', 'IFCMARINEPARTCHAMBER', 'IFCMARINEPARTCILL_LEVEL', 'IFCMARINEPARTCOPELEVEL', 'IFCMARINEPARTCORE', 'IFCMARINEPARTCREST', 'IFCMARINEPARTGATEHEAD', 'IFCMARINEPARTGUDINGSTRUCTURE', 'IFCMARINEPARTHIGHWATERLINE', 'IFCMARINEPARTLANDFIELD', 'IFCMARINEPARTLEEWARDSIDE', 'IFCMARINEPARTLOWWATERLINE', 'IFCMARINEPARTMANUFACTURING', 'IFCMARINEPARTNAVIGATIONALAREA', 'IFCMARINEPARTPROTECTION', 'IFCMARINEPARTSHIPTRANSFER', 'IFCMARINEPARTSTORAGEAREA', 'IFCMARINEPARTVEHICLESERVICING', 'IFCMARINEPARTWATERFIELD', 'IFCMARINEPARTWEATHERSIDE', 'IFCRAILWAY', 'IFCRAILWAYPART', 'IFCRAILWAYPARTABOVETRACK', 'IFCRAILWAYPARTDILATIONTRACK', 'IFCRAILWAYPARTLINESIDE', 'IFCRAILWAYPARTLINESIDEPART', 'IFCRAILWAYPARTPLAINTRACK', 'IFCRAILWAYPARTSUBSTRUCTURE', 'IFCRAILWAYPARTTRACK', 'IFCRAILWAYPARTTRACKPART', 'IFCRAILWAYPARTTURNOUTTRACK', 'IFCROAD', 'IFCROADPART', 'IFCROADPARTBICYCLECROSSING', 'IFCROADPARTBUS_STOP', 'IFCROADPARTCARRIAGEWAY', 'IFCROADPARTCENTRALISLAND', 'IFCROADPARTCENTRALRESERVE', 'IFCROADPARTHARDSHOULDER', 'IFCROADPARTINTERSECTION', 'IFCROADPARTLAYBY', 'IFCROADPARTPARKINGBAY', 'IFCROADPARTPASSINGBAY', 'IFCROADPARTPEDESTRIAN_CROSSING', 'IFCROADPARTRAILWAYCROSSING', 'IFCROADPARTREFUGEISLAND', 'IFCROADPARTROADSEGMENT', 'IFCROADPARTROADSIDE', 'IFCROADPARTROADSIDEPART', 'IFCROADPARTROADWAYPLATEAU', 'IFCROADPARTROUNDABOUT', 'IFCROADPARTSHOULDER', 'IFCROADPARTSIDEWALK', 'IFCROADPARTSOFTSHOULDER', 'IFCROADPARTTOLLPLAZA', 'IFCROADPARTTRAFFICISLAND', 'IFCROADPARTTRAFFICLANE', 'IFCSITE', 'IFCSPACE', 'IFCSPACEBERTH', 'IFCSPACEEXTERNAL', 'IFCSPACEGFA', 'IFCSPACEINTERNAL', 'IFCSPACEPARKING', 'IFCSPACESPACE', 'IFCSPATIALELEMENT', 'IFCSPATIALSTRUCTUREELEMENT', 'IFCSPATIALZONE', 'IFCSPATIALZONECONSTRUCTION', 'IFCSPATIALZONEFIRESAFETY', 'IFCSPATIALZONEINTERFERENCE', 'IFCSPATIALZONELIGHTING', 'IFCSPATIALZONEOCCUPANCY', 'IFCSPATIALZONERESERVATION', 'IFCSPATIALZONESECURITY', 'IFCSPATIALZONETHERMAL', 'IFCSPATIALZONETRANSPORT', 'IFCSPATIALZONEVENTILATION'],
    props: [
      { name: 'BoundaryAreaHeatLoss', type: 'IfcReal', description: 'Heat loss per unit area for the boundary object. This is a design input value for use in the absence of calculated load' },
      { name: 'CeilingRAPlenum', type: 'IfcBoolean', description: 'Ceiling plenum used for return air or not. TRUE = Yes, FALSE = No.' },
      { name: 'CoolingDesignAirFlow', type: 'IfcReal', description: 'The air flowrate required during the peak cooling conditions.' },
      { name: 'CoolingDryBulb', type: 'IfcReal', description: 'Dry bulb temperature, usually for for cooling design.' },
      { name: 'CoolingRelativeHumidity', type: 'IfcReal', description: 'Inside relative humidity for cooling design.' },
      { name: 'DesignAirFlow', type: 'IfcReal', description: 'Design air flow rate for the space.' },
      { name: 'HeatingDesignAirFlow', type: 'IfcReal', description: 'The air flowrate required during the peak heating conditions, but could also be determined by minimum ventilation requir' },
      { name: 'HeatingDryBulb', type: 'IfcReal', description: 'Dry bulb temperature for heating design.' },
      { name: 'HeatingRelativeHumidity', type: 'IfcReal', description: 'Inside relative humidity for heating design.' },
      { name: 'SensibleHeatGain', type: 'IfcReal', description: 'The sensible heat or energy gained by the space during the peak conditions.' },
      { name: 'TotalHeatGain', type: 'IfcReal', description: 'The total (sensible+latent) amount of heat or energy gained by the space at the time of the space\\\'s peak cooling conditi' },
      { name: 'TotalHeatLoss', type: 'IfcReal', description: 'The total amount of heat or energy lost by the space at the time of the space\\\'s peak heating conditions.' },
      { name: 'VentilationDesignAirFlow', type: 'IfcReal', description: 'Ventilation outside air requirement for the space.' },
    ],
  },

  'Pset_SpaceCommon': {
    label:       'Property Set: Space Common',
    description: 'Properties common to the definition of all occurrences of [[IfcSpace]]. Please note that several space attributes are handled directly at the [[IfcSpace]] instance, the space numbe',
    applicableTo: ['IFCBRIDGE', 'IFCBRIDGEARCHED', 'IFCBRIDGECABLE_STAYED', 'IFCBRIDGECANTILEVER', 'IFCBRIDGECULVERT', 'IFCBRIDGEFRAMEWORK', 'IFCBRIDGEGIRDER', 'IFCBRIDGEPART', 'IFCBRIDGEPARTABUTMENT', 'IFCBRIDGEPARTDECK', 'IFCBRIDGEPARTDECK_SEGMENT', 'IFCBRIDGEPARTFOUNDATION', 'IFCBRIDGEPARTPIER', 'IFCBRIDGEPARTPIER_SEGMENT', 'IFCBRIDGEPARTPYLON', 'IFCBRIDGEPARTSUBSTRUCTURE', 'IFCBRIDGEPARTSUPERSTRUCTURE', 'IFCBRIDGEPARTSURFACESTRUCTURE', 'IFCBRIDGESUSPENSION', 'IFCBRIDGETRUSS', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCEXTERNALSPATIALELEMENT', 'IFCEXTERNALSPATIALELEMENTEXTERNAL', 'IFCEXTERNALSPATIALELEMENTEXTERNAL_EARTH', 'IFCEXTERNALSPATIALELEMENTEXTERNAL_FIRE', 'IFCEXTERNALSPATIALELEMENTEXTERNAL_WATER', 'IFCEXTERNALSPATIALSTRUCTUREELEMENT', 'IFCFACILITY', 'IFCFACILITYPART', 'IFCFACILITYPARTCOMMON', 'IFCFACILITYPARTCOMMONABOVEGROUND', 'IFCFACILITYPARTCOMMONBELOWGROUND', 'IFCFACILITYPARTCOMMONJUNCTION', 'IFCFACILITYPARTCOMMONLEVELCROSSING', 'IFCFACILITYPARTCOMMONSEGMENT', 'IFCFACILITYPARTCOMMONSUBSTRUCTURE', 'IFCFACILITYPARTCOMMONSUPERSTRUCTURE', 'IFCFACILITYPARTCOMMONTERMINAL', 'IFCMARINEFACILITY', 'IFCMARINEFACILITYBARRIERBEACH', 'IFCMARINEFACILITYBREAKWATER', 'IFCMARINEFACILITYCANAL', 'IFCMARINEFACILITYDRYDOCK', 'IFCMARINEFACILITYFLOATINGDOCK', 'IFCMARINEFACILITYHYDROLIFT', 'IFCMARINEFACILITYJETTY', 'IFCMARINEFACILITYLAUNCHRECOVERY', 'IFCMARINEFACILITYMARINEDEFENCE', 'IFCMARINEFACILITYNAVIGATIONALCHANNEL', 'IFCMARINEFACILITYPORT', 'IFCMARINEFACILITYQUAY', 'IFCMARINEFACILITYREVETMENT', 'IFCMARINEFACILITYSHIPLIFT', 'IFCMARINEFACILITYSHIPLOCK', 'IFCMARINEFACILITYSHIPYARD', 'IFCMARINEFACILITYSLIPWAY', 'IFCMARINEFACILITYWATERWAY', 'IFCMARINEFACILITYWATERWAYSHIPLIFT', 'IFCMARINEPART', 'IFCMARINEPARTABOVEWATERLINE', 'IFCMARINEPARTANCHORAGE', 'IFCMARINEPARTAPPROACHCHANNEL', 'IFCMARINEPARTBELOWWATERLINE', 'IFCMARINEPARTBERTHINGSTRUCTURE', 'IFCMARINEPARTCHAMBER', 'IFCMARINEPARTCILL_LEVEL', 'IFCMARINEPARTCOPELEVEL', 'IFCMARINEPARTCORE', 'IFCMARINEPARTCREST', 'IFCMARINEPARTGATEHEAD', 'IFCMARINEPARTGUDINGSTRUCTURE', 'IFCMARINEPARTHIGHWATERLINE', 'IFCMARINEPARTLANDFIELD', 'IFCMARINEPARTLEEWARDSIDE', 'IFCMARINEPARTLOWWATERLINE', 'IFCMARINEPARTMANUFACTURING', 'IFCMARINEPARTNAVIGATIONALAREA', 'IFCMARINEPARTPROTECTION', 'IFCMARINEPARTSHIPTRANSFER', 'IFCMARINEPARTSTORAGEAREA', 'IFCMARINEPARTVEHICLESERVICING', 'IFCMARINEPARTWATERFIELD', 'IFCMARINEPARTWEATHERSIDE', 'IFCRAILWAY', 'IFCRAILWAYPART', 'IFCRAILWAYPARTABOVETRACK', 'IFCRAILWAYPARTDILATIONTRACK', 'IFCRAILWAYPARTLINESIDE', 'IFCRAILWAYPARTLINESIDEPART', 'IFCRAILWAYPARTPLAINTRACK', 'IFCRAILWAYPARTSUBSTRUCTURE', 'IFCRAILWAYPARTTRACK', 'IFCRAILWAYPARTTRACKPART', 'IFCRAILWAYPARTTURNOUTTRACK', 'IFCROAD', 'IFCROADPART', 'IFCROADPARTBICYCLECROSSING', 'IFCROADPARTBUS_STOP', 'IFCROADPARTCARRIAGEWAY', 'IFCROADPARTCENTRALISLAND', 'IFCROADPARTCENTRALRESERVE', 'IFCROADPARTHARDSHOULDER', 'IFCROADPARTINTERSECTION', 'IFCROADPARTLAYBY', 'IFCROADPARTPARKINGBAY', 'IFCROADPARTPASSINGBAY', 'IFCROADPARTPEDESTRIAN_CROSSING', 'IFCROADPARTRAILWAYCROSSING', 'IFCROADPARTREFUGEISLAND', 'IFCROADPARTROADSEGMENT', 'IFCROADPARTROADSIDE', 'IFCROADPARTROADSIDEPART', 'IFCROADPARTROADWAYPLATEAU', 'IFCROADPARTROUNDABOUT', 'IFCROADPARTSHOULDER', 'IFCROADPARTSIDEWALK', 'IFCROADPARTSOFTSHOULDER', 'IFCROADPARTTOLLPLAZA', 'IFCROADPARTTRAFFICISLAND', 'IFCROADPARTTRAFFICLANE', 'IFCSITE', 'IFCSPACE', 'IFCSPACEBERTH', 'IFCSPACEEXTERNAL', 'IFCSPACEGFA', 'IFCSPACEINTERNAL', 'IFCSPACEPARKING', 'IFCSPACESPACE', 'IFCSPATIALELEMENT', 'IFCSPATIALSTRUCTUREELEMENT', 'IFCSPATIALZONE', 'IFCSPATIALZONECONSTRUCTION', 'IFCSPATIALZONEFIRESAFETY', 'IFCSPATIALZONEINTERFERENCE', 'IFCSPATIALZONELIGHTING', 'IFCSPATIALZONEOCCUPANCY', 'IFCSPATIALZONERESERVATION', 'IFCSPATIALZONESECURITY', 'IFCSPATIALZONETHERMAL', 'IFCSPATIALZONETRANSPORT', 'IFCSPATIALZONEVENTILATION'],
    props: [
      { name: 'GrossPlannedArea', type: 'IfcReal', description: 'Total planned gross area of the spatial structure element. Used for programming the spatial structure element.' },
      { name: 'HandicapAccessible', type: 'IfcBoolean', description: 'Indication that this object is designed to be accessible by the handicapped. Set to (TRUE) if this object is rated as ha' },
      { name: 'IsExternal', type: 'IfcBoolean', description: 'Indication whether the element is designed for use in the exterior (TRUE) or not (FALSE). If (TRUE) it is an external el' },
      { name: 'NetPlannedArea', type: 'IfcReal', description: 'Total planned net area of the object. Used for programming the object.' },
      { name: 'PubliclyAccessible', type: 'IfcBoolean', description: 'Indication whether this space (in case of e.g., a toilet) is designed to serve as a publicly accessible space, e.g., for' },
    ],
  },

  'Pset_SpaceCoveringRequirements': {
    label:       'Property Set: Space Covering Requirements',
    description: 'Properties common to the definition of covering requirements of [[IfcSpace]]. Those properties define the requirements coming from a space program in early project phases and can l',
    applicableTo: ['IFCBRIDGE', 'IFCBRIDGEARCHED', 'IFCBRIDGECABLE_STAYED', 'IFCBRIDGECANTILEVER', 'IFCBRIDGECULVERT', 'IFCBRIDGEFRAMEWORK', 'IFCBRIDGEGIRDER', 'IFCBRIDGEPART', 'IFCBRIDGEPARTABUTMENT', 'IFCBRIDGEPARTDECK', 'IFCBRIDGEPARTDECK_SEGMENT', 'IFCBRIDGEPARTFOUNDATION', 'IFCBRIDGEPARTPIER', 'IFCBRIDGEPARTPIER_SEGMENT', 'IFCBRIDGEPARTPYLON', 'IFCBRIDGEPARTSUBSTRUCTURE', 'IFCBRIDGEPARTSUPERSTRUCTURE', 'IFCBRIDGEPARTSURFACESTRUCTURE', 'IFCBRIDGESUSPENSION', 'IFCBRIDGETRUSS', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCEXTERNALSPATIALELEMENT', 'IFCEXTERNALSPATIALELEMENTEXTERNAL', 'IFCEXTERNALSPATIALELEMENTEXTERNAL_EARTH', 'IFCEXTERNALSPATIALELEMENTEXTERNAL_FIRE', 'IFCEXTERNALSPATIALELEMENTEXTERNAL_WATER', 'IFCEXTERNALSPATIALSTRUCTUREELEMENT', 'IFCFACILITY', 'IFCFACILITYPART', 'IFCFACILITYPARTCOMMON', 'IFCFACILITYPARTCOMMONABOVEGROUND', 'IFCFACILITYPARTCOMMONBELOWGROUND', 'IFCFACILITYPARTCOMMONJUNCTION', 'IFCFACILITYPARTCOMMONLEVELCROSSING', 'IFCFACILITYPARTCOMMONSEGMENT', 'IFCFACILITYPARTCOMMONSUBSTRUCTURE', 'IFCFACILITYPARTCOMMONSUPERSTRUCTURE', 'IFCFACILITYPARTCOMMONTERMINAL', 'IFCMARINEFACILITY', 'IFCMARINEFACILITYBARRIERBEACH', 'IFCMARINEFACILITYBREAKWATER', 'IFCMARINEFACILITYCANAL', 'IFCMARINEFACILITYDRYDOCK', 'IFCMARINEFACILITYFLOATINGDOCK', 'IFCMARINEFACILITYHYDROLIFT', 'IFCMARINEFACILITYJETTY', 'IFCMARINEFACILITYLAUNCHRECOVERY', 'IFCMARINEFACILITYMARINEDEFENCE', 'IFCMARINEFACILITYNAVIGATIONALCHANNEL', 'IFCMARINEFACILITYPORT', 'IFCMARINEFACILITYQUAY', 'IFCMARINEFACILITYREVETMENT', 'IFCMARINEFACILITYSHIPLIFT', 'IFCMARINEFACILITYSHIPLOCK', 'IFCMARINEFACILITYSHIPYARD', 'IFCMARINEFACILITYSLIPWAY', 'IFCMARINEFACILITYWATERWAY', 'IFCMARINEFACILITYWATERWAYSHIPLIFT', 'IFCMARINEPART', 'IFCMARINEPARTABOVEWATERLINE', 'IFCMARINEPARTANCHORAGE', 'IFCMARINEPARTAPPROACHCHANNEL', 'IFCMARINEPARTBELOWWATERLINE', 'IFCMARINEPARTBERTHINGSTRUCTURE', 'IFCMARINEPARTCHAMBER', 'IFCMARINEPARTCILL_LEVEL', 'IFCMARINEPARTCOPELEVEL', 'IFCMARINEPARTCORE', 'IFCMARINEPARTCREST', 'IFCMARINEPARTGATEHEAD', 'IFCMARINEPARTGUDINGSTRUCTURE', 'IFCMARINEPARTHIGHWATERLINE', 'IFCMARINEPARTLANDFIELD', 'IFCMARINEPARTLEEWARDSIDE', 'IFCMARINEPARTLOWWATERLINE', 'IFCMARINEPARTMANUFACTURING', 'IFCMARINEPARTNAVIGATIONALAREA', 'IFCMARINEPARTPROTECTION', 'IFCMARINEPARTSHIPTRANSFER', 'IFCMARINEPARTSTORAGEAREA', 'IFCMARINEPARTVEHICLESERVICING', 'IFCMARINEPARTWATERFIELD', 'IFCMARINEPARTWEATHERSIDE', 'IFCRAILWAY', 'IFCRAILWAYPART', 'IFCRAILWAYPARTABOVETRACK', 'IFCRAILWAYPARTDILATIONTRACK', 'IFCRAILWAYPARTLINESIDE', 'IFCRAILWAYPARTLINESIDEPART', 'IFCRAILWAYPARTPLAINTRACK', 'IFCRAILWAYPARTSUBSTRUCTURE', 'IFCRAILWAYPARTTRACK', 'IFCRAILWAYPARTTRACKPART', 'IFCRAILWAYPARTTURNOUTTRACK', 'IFCROAD', 'IFCROADPART', 'IFCROADPARTBICYCLECROSSING', 'IFCROADPARTBUS_STOP', 'IFCROADPARTCARRIAGEWAY', 'IFCROADPARTCENTRALISLAND', 'IFCROADPARTCENTRALRESERVE', 'IFCROADPARTHARDSHOULDER', 'IFCROADPARTINTERSECTION', 'IFCROADPARTLAYBY', 'IFCROADPARTPARKINGBAY', 'IFCROADPARTPASSINGBAY', 'IFCROADPARTPEDESTRIAN_CROSSING', 'IFCROADPARTRAILWAYCROSSING', 'IFCROADPARTREFUGEISLAND', 'IFCROADPARTROADSEGMENT', 'IFCROADPARTROADSIDE', 'IFCROADPARTROADSIDEPART', 'IFCROADPARTROADWAYPLATEAU', 'IFCROADPARTROUNDABOUT', 'IFCROADPARTSHOULDER', 'IFCROADPARTSIDEWALK', 'IFCROADPARTSOFTSHOULDER', 'IFCROADPARTTOLLPLAZA', 'IFCROADPARTTRAFFICISLAND', 'IFCROADPARTTRAFFICLANE', 'IFCSITE', 'IFCSPACE', 'IFCSPACEBERTH', 'IFCSPACEEXTERNAL', 'IFCSPACEGFA', 'IFCSPACEINTERNAL', 'IFCSPACEPARKING', 'IFCSPACESPACE', 'IFCSPATIALELEMENT', 'IFCSPATIALSTRUCTUREELEMENT', 'IFCSPATIALZONE', 'IFCSPATIALZONECONSTRUCTION', 'IFCSPATIALZONEFIRESAFETY', 'IFCSPATIALZONEINTERFERENCE', 'IFCSPATIALZONELIGHTING', 'IFCSPATIALZONEOCCUPANCY', 'IFCSPATIALZONERESERVATION', 'IFCSPATIALZONESECURITY', 'IFCSPATIALZONETHERMAL', 'IFCSPATIALZONETRANSPORT', 'IFCSPATIALZONEVENTILATION'],
    props: [
      { name: 'CeilingCovering', type: 'IfcLabel', description: 'Label to indicate the material or finish of the space ceiling. The label is used for room book information and often dis' },
      { name: 'CeilingCoveringThickness', type: 'IfcReal', description: 'Thickness of the material layer(s) for the space ceiling.The thickness information is provided in absence of an IfcCover' },
      { name: 'ConcealedCeiling', type: 'IfcBoolean', description: 'Indication whether this space is designed to have a concealed flooring space (TRUE) or not (FALSE). A concealed ceiling' },
      { name: 'ConcealedCeilingOffset', type: 'IfcReal', description: 'Distance between the upper floor slab and the suspended ceiling, often used for distribution systems. Often referred to' },
      { name: 'ConcealedFlooring', type: 'IfcBoolean', description: 'Indication whether this space is designed to have a concealed flooring space (TRUE) or not (FALSE). A concealed flooring' },
      { name: 'ConcealedFlooringOffset', type: 'IfcReal', description: 'Distance between the floor slab and the floor covering, often used for cables and other installations. Often referred to' },
      { name: 'FloorCovering', type: 'IfcLabel', description: 'Label to indicate the material or finish of the space flooring. The label is used for room book information and often di' },
      { name: 'FloorCoveringThickness', type: 'IfcReal', description: 'Thickness of the material layer(s) for the space flooring.The thickness information is provided in absence of an IfcCove' },
      { name: 'Molding', type: 'IfcLabel', description: 'Label to indicate the material or construction of the molding around the space ceiling. The label is used for room book' },
      { name: 'MoldingHeight', type: 'IfcReal', description: 'Height of the molding.The height information is provided in absence of an IfcCovering (type=MOLDING) object with own sha' },
      { name: 'SkirtingBoard', type: 'IfcLabel', description: 'Label to indicate the material or construction of the skirting board around the space flooring. The label is used for ro' },
      { name: 'SkirtingBoardHeight', type: 'IfcReal', description: 'Height of the skirting board.The height information is provided in absence of an IfcCovering (type=SKIRTINGBOARD) object' },
      { name: 'WallCovering', type: 'IfcLabel', description: 'Label to indicate the material or finish of the space cladding. The label is used for room book information and often di' },
      { name: 'WallCoveringThickness', type: 'IfcReal', description: 'Thickness of the material layer(s) for the space cladding.The thickness information is provided in absence of an IfcCove' },
    ],
  },

  'Pset_SpaceFireSafetyRequirements': {
    label:       'Property Set: Space Fire Safety Requirements',
    description: 'Properties related to fire protection of spaces that apply to the occurrences of [[IfcSpace]] or [[IfcZone]].',
    applicableTo: ['IFCBRIDGE', 'IFCBRIDGEARCHED', 'IFCBRIDGECABLE_STAYED', 'IFCBRIDGECANTILEVER', 'IFCBRIDGECULVERT', 'IFCBRIDGEFRAMEWORK', 'IFCBRIDGEGIRDER', 'IFCBRIDGEPART', 'IFCBRIDGEPARTABUTMENT', 'IFCBRIDGEPARTDECK', 'IFCBRIDGEPARTDECK_SEGMENT', 'IFCBRIDGEPARTFOUNDATION', 'IFCBRIDGEPARTPIER', 'IFCBRIDGEPARTPIER_SEGMENT', 'IFCBRIDGEPARTPYLON', 'IFCBRIDGEPARTSUBSTRUCTURE', 'IFCBRIDGEPARTSUPERSTRUCTURE', 'IFCBRIDGEPARTSURFACESTRUCTURE', 'IFCBRIDGESUSPENSION', 'IFCBRIDGETRUSS', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCEXTERNALSPATIALELEMENT', 'IFCEXTERNALSPATIALELEMENTEXTERNAL', 'IFCEXTERNALSPATIALELEMENTEXTERNAL_EARTH', 'IFCEXTERNALSPATIALELEMENTEXTERNAL_FIRE', 'IFCEXTERNALSPATIALELEMENTEXTERNAL_WATER', 'IFCEXTERNALSPATIALSTRUCTUREELEMENT', 'IFCFACILITY', 'IFCFACILITYPART', 'IFCFACILITYPARTCOMMON', 'IFCFACILITYPARTCOMMONABOVEGROUND', 'IFCFACILITYPARTCOMMONBELOWGROUND', 'IFCFACILITYPARTCOMMONJUNCTION', 'IFCFACILITYPARTCOMMONLEVELCROSSING', 'IFCFACILITYPARTCOMMONSEGMENT', 'IFCFACILITYPARTCOMMONSUBSTRUCTURE', 'IFCFACILITYPARTCOMMONSUPERSTRUCTURE', 'IFCFACILITYPARTCOMMONTERMINAL', 'IFCMARINEFACILITY', 'IFCMARINEFACILITYBARRIERBEACH', 'IFCMARINEFACILITYBREAKWATER', 'IFCMARINEFACILITYCANAL', 'IFCMARINEFACILITYDRYDOCK', 'IFCMARINEFACILITYFLOATINGDOCK', 'IFCMARINEFACILITYHYDROLIFT', 'IFCMARINEFACILITYJETTY', 'IFCMARINEFACILITYLAUNCHRECOVERY', 'IFCMARINEFACILITYMARINEDEFENCE', 'IFCMARINEFACILITYNAVIGATIONALCHANNEL', 'IFCMARINEFACILITYPORT', 'IFCMARINEFACILITYQUAY', 'IFCMARINEFACILITYREVETMENT', 'IFCMARINEFACILITYSHIPLIFT', 'IFCMARINEFACILITYSHIPLOCK', 'IFCMARINEFACILITYSHIPYARD', 'IFCMARINEFACILITYSLIPWAY', 'IFCMARINEFACILITYWATERWAY', 'IFCMARINEFACILITYWATERWAYSHIPLIFT', 'IFCMARINEPART', 'IFCMARINEPARTABOVEWATERLINE', 'IFCMARINEPARTANCHORAGE', 'IFCMARINEPARTAPPROACHCHANNEL', 'IFCMARINEPARTBELOWWATERLINE', 'IFCMARINEPARTBERTHINGSTRUCTURE', 'IFCMARINEPARTCHAMBER', 'IFCMARINEPARTCILL_LEVEL', 'IFCMARINEPARTCOPELEVEL', 'IFCMARINEPARTCORE', 'IFCMARINEPARTCREST', 'IFCMARINEPARTGATEHEAD', 'IFCMARINEPARTGUDINGSTRUCTURE', 'IFCMARINEPARTHIGHWATERLINE', 'IFCMARINEPARTLANDFIELD', 'IFCMARINEPARTLEEWARDSIDE', 'IFCMARINEPARTLOWWATERLINE', 'IFCMARINEPARTMANUFACTURING', 'IFCMARINEPARTNAVIGATIONALAREA', 'IFCMARINEPARTPROTECTION', 'IFCMARINEPARTSHIPTRANSFER', 'IFCMARINEPARTSTORAGEAREA', 'IFCMARINEPARTVEHICLESERVICING', 'IFCMARINEPARTWATERFIELD', 'IFCMARINEPARTWEATHERSIDE', 'IFCRAILWAY', 'IFCRAILWAYPART', 'IFCRAILWAYPARTABOVETRACK', 'IFCRAILWAYPARTDILATIONTRACK', 'IFCRAILWAYPARTLINESIDE', 'IFCRAILWAYPARTLINESIDEPART', 'IFCRAILWAYPARTPLAINTRACK', 'IFCRAILWAYPARTSUBSTRUCTURE', 'IFCRAILWAYPARTTRACK', 'IFCRAILWAYPARTTRACKPART', 'IFCRAILWAYPARTTURNOUTTRACK', 'IFCROAD', 'IFCROADPART', 'IFCROADPARTBICYCLECROSSING', 'IFCROADPARTBUS_STOP', 'IFCROADPARTCARRIAGEWAY', 'IFCROADPARTCENTRALISLAND', 'IFCROADPARTCENTRALRESERVE', 'IFCROADPARTHARDSHOULDER', 'IFCROADPARTINTERSECTION', 'IFCROADPARTLAYBY', 'IFCROADPARTPARKINGBAY', 'IFCROADPARTPASSINGBAY', 'IFCROADPARTPEDESTRIAN_CROSSING', 'IFCROADPARTRAILWAYCROSSING', 'IFCROADPARTREFUGEISLAND', 'IFCROADPARTROADSEGMENT', 'IFCROADPARTROADSIDE', 'IFCROADPARTROADSIDEPART', 'IFCROADPARTROADWAYPLATEAU', 'IFCROADPARTROUNDABOUT', 'IFCROADPARTSHOULDER', 'IFCROADPARTSIDEWALK', 'IFCROADPARTSOFTSHOULDER', 'IFCROADPARTTOLLPLAZA', 'IFCROADPARTTRAFFICISLAND', 'IFCROADPARTTRAFFICLANE', 'IFCSITE', 'IFCSPACE', 'IFCSPACEBERTH', 'IFCSPACEEXTERNAL', 'IFCSPACEGFA', 'IFCSPACEINTERNAL', 'IFCSPACEPARKING', 'IFCSPACESPACE', 'IFCSPATIALELEMENT', 'IFCSPATIALSTRUCTUREELEMENT', 'IFCSPATIALZONE', 'IFCSPATIALZONECONSTRUCTION', 'IFCSPATIALZONEFIRESAFETY', 'IFCSPATIALZONEINTERFERENCE', 'IFCSPATIALZONELIGHTING', 'IFCSPATIALZONEOCCUPANCY', 'IFCSPATIALZONERESERVATION', 'IFCSPATIALZONESECURITY', 'IFCSPATIALZONETHERMAL', 'IFCSPATIALZONETRANSPORT', 'IFCSPATIALZONEVENTILATION', 'IFCZONE'],
    props: [
      { name: 'AirPressurization', type: 'IfcBoolean', description: 'Indication whether the space is required to have pressurized air (TRUE) or not (FALSE).' },
      { name: 'FireExit', type: 'IfcBoolean', description: 'Indication whether this object is designed to serve as an exit in the case of fire (TRUE) or not (FALSE).' },
      { name: 'FireRiskFactor', type: 'IfcLabel', description: 'Fire Risk factor assigned to the space according to local building regulations. It defines the fire risk of the space at' },
      { name: 'FlammableStorage', type: 'IfcBoolean', description: 'Indication whether the space is intended to serve as a storage of flammable material (which is regarded as such by the p' },
      { name: 'SprinklerProtection', type: 'IfcBoolean', description: 'Indication whether this object is sprinkler protected (TRUE) or not (FALSE).' },
      { name: 'SprinklerProtectionAutomatic', type: 'IfcBoolean', description: 'Indication whether this object has an automatic sprinkler protection (TRUE) or not (FALSE).; It should only be given, if' },
    ],
  },

  'Pset_SpaceHVACDesign': {
    label:       'Property Set: Space Hvacdesign',
    description: 'Properties for HVAC requirements for spaces.',
    applicableTo: ['IFCBRIDGE', 'IFCBRIDGEARCHED', 'IFCBRIDGECABLE_STAYED', 'IFCBRIDGECANTILEVER', 'IFCBRIDGECULVERT', 'IFCBRIDGEFRAMEWORK', 'IFCBRIDGEGIRDER', 'IFCBRIDGEPART', 'IFCBRIDGEPARTABUTMENT', 'IFCBRIDGEPARTDECK', 'IFCBRIDGEPARTDECK_SEGMENT', 'IFCBRIDGEPARTFOUNDATION', 'IFCBRIDGEPARTPIER', 'IFCBRIDGEPARTPIER_SEGMENT', 'IFCBRIDGEPARTPYLON', 'IFCBRIDGEPARTSUBSTRUCTURE', 'IFCBRIDGEPARTSUPERSTRUCTURE', 'IFCBRIDGEPARTSURFACESTRUCTURE', 'IFCBRIDGESUSPENSION', 'IFCBRIDGETRUSS', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCEXTERNALSPATIALELEMENT', 'IFCEXTERNALSPATIALELEMENTEXTERNAL', 'IFCEXTERNALSPATIALELEMENTEXTERNAL_EARTH', 'IFCEXTERNALSPATIALELEMENTEXTERNAL_FIRE', 'IFCEXTERNALSPATIALELEMENTEXTERNAL_WATER', 'IFCEXTERNALSPATIALSTRUCTUREELEMENT', 'IFCFACILITY', 'IFCFACILITYPART', 'IFCFACILITYPARTCOMMON', 'IFCFACILITYPARTCOMMONABOVEGROUND', 'IFCFACILITYPARTCOMMONBELOWGROUND', 'IFCFACILITYPARTCOMMONJUNCTION', 'IFCFACILITYPARTCOMMONLEVELCROSSING', 'IFCFACILITYPARTCOMMONSEGMENT', 'IFCFACILITYPARTCOMMONSUBSTRUCTURE', 'IFCFACILITYPARTCOMMONSUPERSTRUCTURE', 'IFCFACILITYPARTCOMMONTERMINAL', 'IFCMARINEFACILITY', 'IFCMARINEFACILITYBARRIERBEACH', 'IFCMARINEFACILITYBREAKWATER', 'IFCMARINEFACILITYCANAL', 'IFCMARINEFACILITYDRYDOCK', 'IFCMARINEFACILITYFLOATINGDOCK', 'IFCMARINEFACILITYHYDROLIFT', 'IFCMARINEFACILITYJETTY', 'IFCMARINEFACILITYLAUNCHRECOVERY', 'IFCMARINEFACILITYMARINEDEFENCE', 'IFCMARINEFACILITYNAVIGATIONALCHANNEL', 'IFCMARINEFACILITYPORT', 'IFCMARINEFACILITYQUAY', 'IFCMARINEFACILITYREVETMENT', 'IFCMARINEFACILITYSHIPLIFT', 'IFCMARINEFACILITYSHIPLOCK', 'IFCMARINEFACILITYSHIPYARD', 'IFCMARINEFACILITYSLIPWAY', 'IFCMARINEFACILITYWATERWAY', 'IFCMARINEFACILITYWATERWAYSHIPLIFT', 'IFCMARINEPART', 'IFCMARINEPARTABOVEWATERLINE', 'IFCMARINEPARTANCHORAGE', 'IFCMARINEPARTAPPROACHCHANNEL', 'IFCMARINEPARTBELOWWATERLINE', 'IFCMARINEPARTBERTHINGSTRUCTURE', 'IFCMARINEPARTCHAMBER', 'IFCMARINEPARTCILL_LEVEL', 'IFCMARINEPARTCOPELEVEL', 'IFCMARINEPARTCORE', 'IFCMARINEPARTCREST', 'IFCMARINEPARTGATEHEAD', 'IFCMARINEPARTGUDINGSTRUCTURE', 'IFCMARINEPARTHIGHWATERLINE', 'IFCMARINEPARTLANDFIELD', 'IFCMARINEPARTLEEWARDSIDE', 'IFCMARINEPARTLOWWATERLINE', 'IFCMARINEPARTMANUFACTURING', 'IFCMARINEPARTNAVIGATIONALAREA', 'IFCMARINEPARTPROTECTION', 'IFCMARINEPARTSHIPTRANSFER', 'IFCMARINEPARTSTORAGEAREA', 'IFCMARINEPARTVEHICLESERVICING', 'IFCMARINEPARTWATERFIELD', 'IFCMARINEPARTWEATHERSIDE', 'IFCRAILWAY', 'IFCRAILWAYPART', 'IFCRAILWAYPARTABOVETRACK', 'IFCRAILWAYPARTDILATIONTRACK', 'IFCRAILWAYPARTLINESIDE', 'IFCRAILWAYPARTLINESIDEPART', 'IFCRAILWAYPARTPLAINTRACK', 'IFCRAILWAYPARTSUBSTRUCTURE', 'IFCRAILWAYPARTTRACK', 'IFCRAILWAYPARTTRACKPART', 'IFCRAILWAYPARTTURNOUTTRACK', 'IFCROAD', 'IFCROADPART', 'IFCROADPARTBICYCLECROSSING', 'IFCROADPARTBUS_STOP', 'IFCROADPARTCARRIAGEWAY', 'IFCROADPARTCENTRALISLAND', 'IFCROADPARTCENTRALRESERVE', 'IFCROADPARTHARDSHOULDER', 'IFCROADPARTINTERSECTION', 'IFCROADPARTLAYBY', 'IFCROADPARTPARKINGBAY', 'IFCROADPARTPASSINGBAY', 'IFCROADPARTPEDESTRIAN_CROSSING', 'IFCROADPARTRAILWAYCROSSING', 'IFCROADPARTREFUGEISLAND', 'IFCROADPARTROADSEGMENT', 'IFCROADPARTROADSIDE', 'IFCROADPARTROADSIDEPART', 'IFCROADPARTROADWAYPLATEAU', 'IFCROADPARTROUNDABOUT', 'IFCROADPARTSHOULDER', 'IFCROADPARTSIDEWALK', 'IFCROADPARTSOFTSHOULDER', 'IFCROADPARTTOLLPLAZA', 'IFCROADPARTTRAFFICISLAND', 'IFCROADPARTTRAFFICLANE', 'IFCSITE', 'IFCSPACE', 'IFCSPACEBERTH', 'IFCSPACEEXTERNAL', 'IFCSPACEGFA', 'IFCSPACEINTERNAL', 'IFCSPACEPARKING', 'IFCSPACESPACE', 'IFCSPATIALELEMENT', 'IFCSPATIALSTRUCTUREELEMENT', 'IFCSPATIALZONE', 'IFCSPATIALZONECONSTRUCTION', 'IFCSPATIALZONEFIRESAFETY', 'IFCSPATIALZONEINTERFERENCE', 'IFCSPATIALZONELIGHTING', 'IFCSPATIALZONEOCCUPANCY', 'IFCSPATIALZONERESERVATION', 'IFCSPATIALZONESECURITY', 'IFCSPATIALZONETHERMAL', 'IFCSPATIALZONETRANSPORT', 'IFCSPATIALZONEVENTILATION', 'IFCZONE'],
    props: [
      { name: 'AirConditioning', type: 'IfcBoolean', description: 'Indication whether this space requires air conditioning provided (TRUE) or not (FALSE).' },
      { name: 'AirConditioningCentral', type: 'IfcBoolean', description: 'Indication whether the space requires a central air conditioning provided (TRUE) or not (FALSE).; It should only be give' },
      { name: 'AirHandlingName', type: 'IfcLabel', description: 'The name of the air side system.IfcRelServicesBuildings should be used to reference the correct AirHandlingSystem (IfcSy' },
      { name: 'DiscontinuedHeating', type: 'IfcBoolean', description: 'Indication whether discontinued heating is required/desirable from user/designer view point. (TRUE) if yes, (FALSE) othe' },
      { name: 'HumidityMax', type: 'IfcReal', description: 'Maximal permitted humidity of the space or zone that is required from user/designer view point. If no summer or winter s' },
      { name: 'HumidityMin', type: 'IfcReal', description: 'Minimal permitted humidity of the space or zone that is required from user/designer view point. If no summer or winter s' },
      { name: 'HumiditySetPoint', type: 'IfcReal', description: 'Humidity of the space or zone that is required from user/designer view point. If no summer or winter space humidity requ' },
      { name: 'HumiditySummer', type: 'IfcReal', description: 'Humidity of the space or zone for the hot (summer) period, that is required from user/designer view point and provided a' },
      { name: 'HumidityWinter', type: 'IfcReal', description: 'Humidity of the space or zone for the cold (winter) period that is required from user/designer view point and provided a' },
      { name: 'MechanicalVentilation', type: 'IfcBoolean', description: 'Indication whether the space is required to have mechanical ventilation (TRUE), or not (FALSE).' },
      { name: 'MechanicalVentilationRate', type: 'IfcReal', description: 'Indication of the requirement of a particular mechanical air ventilation rate, given in air changes per hour.' },
      { name: 'NaturalVentilation', type: 'IfcBoolean', description: 'Indication whether the space is required to have natural ventilation (TRUE), or not (FALSE).' },
      { name: 'NaturalVentilationRate', type: 'IfcReal', description: 'Indication of the requirement of a particular natural air ventilation rate, given in air changes per hour.' },
      { name: 'TemperatureMax', type: 'IfcReal', description: 'Maximal temperature of the space or zone, that is required from user/designer view point. If no summer or winter space t' },
      { name: 'TemperatureMin', type: 'IfcReal', description: 'Minimal temperature of the space or zone, that is required from user/designer view point. If no summer or winter space t' },
      { name: 'TemperatureSetPoint', type: 'IfcReal', description: 'The temperature setpoint range and default setpoint.' },
      { name: 'TemperatureSummerMax', type: 'IfcReal', description: 'Maximal temperature of the space or zone for the hot (summer) period, that is required from user/designer view point and' },
      { name: 'TemperatureSummerMin', type: 'IfcReal', description: 'Minimal temperature of the space or zone for the hot (summer) period, that is required from user/designer view point and' },
      { name: 'TemperatureWinterMax', type: 'IfcReal', description: 'Maximal temperature of the space or zone for the cold (winter) period, that is required from user/designer view point an' },
      { name: 'TemperatureWinterMin', type: 'IfcReal', description: 'Minimal temperature of the space or zone for the cold (winter) period, that is required from user/designer view point an' },
    ],
  },

  'Pset_SpaceHeaterPHistory': {
    label:       'Property Set: Space Heater Phistory',
    description: 'Space heater performance history common attributes.',
    applicableTo: ['IFCSPACEHEATER', 'IFCSPACEHEATERCONVECTOR', 'IFCSPACEHEATERRADIATOR'],
    props: [
      { name: 'AirResistanceCurve', type: 'IfcTimeSeries', description: 'Air resistance curve (w/ fan only); Pressure = f ( flow rate).' },
      { name: 'AuxiliaryEnergySourceConsumption', type: 'IfcTimeSeries', description: 'Auxiliary energy source consumption.' },
      { name: 'CharacteristicExponent', type: 'IfcTimeSeries', description: 'Characteristic exponent, slope of log(heat output) vs log (surface temperature minus environmental temperature).' },
      { name: 'Effectiveness', type: 'IfcTimeSeries', description: 'Effectiveness, represented as ratio.' },
      { name: 'FractionConvectiveHeatTransfer', type: 'IfcTimeSeries', description: 'Fraction of the total heat transfer rate as the convective heat transfer.' },
      { name: 'FractionRadiantHeatTransfer', type: 'IfcTimeSeries', description: 'Fraction of the total heat transfer rate as the radiant heat transfer.' },
      { name: 'HeatOutputRate', type: 'IfcTimeSeries', description: 'Overall heat transfer rate.' },
      { name: 'OutputCapacityCurve', type: 'IfcTimeSeries', description: 'Partial output capacity curve (as a function of water temperature); Q = f (Twater).' },
      { name: 'SpaceAirTemperature', type: 'IfcTimeSeries', description: 'Dry bulb temperature in the space.' },
      { name: 'SpaceMeanRadiantTemperature', type: 'IfcTimeSeries', description: 'Mean radiant temperature in the space.' },
      { name: 'SurfaceTemperature', type: 'IfcTimeSeries', description: 'Average surface temperature of the component.' },
      { name: 'UACurve', type: 'IfcTimeSeries', description: 'UA value.' },
    ],
  },

  'Pset_SpaceHeaterTypeCommon': {
    label:       'Property Set: Space Heater Type Common',
    description: 'Space heater type common attributes.;Use IfcSoundProperties instead. Properties added in',
    applicableTo: ['IFCSPACEHEATER', 'IFCSPACEHEATERCONVECTOR', 'IFCSPACEHEATERRADIATOR'],
    props: [
      { name: 'BodyMass', type: 'IfcReal', description: 'Overall body mass of the heater.' },
      { name: 'EnergySource', type: 'IfcLabel', description: 'Enumeration defining the energy source or fuel cumbusted.' },
      { name: 'HeatTransferDimension', type: 'IfcLabel', description: 'Indicates how heat is transmitted according to the shape of the space heater.' },
      { name: 'HeatTransferMedium', type: 'IfcLabel', description: 'Enumeration defining the heat transfer medium if applicable.' },
      { name: 'NumberOfPanels', type: 'IfcInteger', description: 'Number of panels.' },
      { name: 'NumberOfSections', type: 'IfcInteger', description: 'Number of sections.' },
      { name: 'OutputCapacity', type: 'IfcReal', description: 'Total nominal heat output as listed by the manufacturer.' },
      { name: 'SpaceHeaterPlacement', type: 'IfcLabel', description: 'Indicates how the space heater is designed to be placed.' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'TemperatureClassification', type: 'IfcLabel', description: 'Enumeration defining the temperature classification of the space heater surface temperature.; low temperature - surface' },
      { name: 'ThermalEfficiency', type: 'IfcReal', description: 'Overall Thermal Efficiency is defined as gross energy output of the heat transfer device divided by the energy input.' },
      { name: 'ThermalMassHeatCapacity', type: 'IfcReal', description: 'Product of component mass and specific heat.' },
    ],
  },

  'Pset_SpaceHeaterTypeConvector': {
    label:       'Property Set: Space Heater Type Convector',
    description: 'Space heater type convector attributes.',
    applicableTo: ['IFCSPACEHEATERCONVECTOR'],
    props: [
      { name: 'ConvectorType', type: 'IfcLabel', description: 'Indicates the type of convector, whether forced air (mechanically driven) or natural (gravity).' },
    ],
  },

  'Pset_SpaceHeaterTypeRadiator': {
    label:       'Property Set: Space Heater Type Radiator',
    description: 'Space heater type radiator attributes.',
    applicableTo: ['IFCSPACEHEATERRADIATOR'],
    props: [
      { name: 'RadiatorType', type: 'IfcLabel', description: 'Indicates the type of radiator.' },
      { name: 'TubingLength', type: 'IfcReal', description: 'Water tube length inside the component.' },
      { name: 'WaterContent', type: 'IfcReal', description: 'Weight of water content within the heater.' },
    ],
  },

  'Pset_SpaceLightingDesign': {
    label:       'Property Set: Space Lighting Design',
    description: 'Properties for requirements on [[Lighting]] of spaces.',
    applicableTo: ['IFCBRIDGE', 'IFCBRIDGEARCHED', 'IFCBRIDGECABLE_STAYED', 'IFCBRIDGECANTILEVER', 'IFCBRIDGECULVERT', 'IFCBRIDGEFRAMEWORK', 'IFCBRIDGEGIRDER', 'IFCBRIDGEPART', 'IFCBRIDGEPARTABUTMENT', 'IFCBRIDGEPARTDECK', 'IFCBRIDGEPARTDECK_SEGMENT', 'IFCBRIDGEPARTFOUNDATION', 'IFCBRIDGEPARTPIER', 'IFCBRIDGEPARTPIER_SEGMENT', 'IFCBRIDGEPARTPYLON', 'IFCBRIDGEPARTSUBSTRUCTURE', 'IFCBRIDGEPARTSUPERSTRUCTURE', 'IFCBRIDGEPARTSURFACESTRUCTURE', 'IFCBRIDGESUSPENSION', 'IFCBRIDGETRUSS', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCEXTERNALSPATIALELEMENT', 'IFCEXTERNALSPATIALELEMENTEXTERNAL', 'IFCEXTERNALSPATIALELEMENTEXTERNAL_EARTH', 'IFCEXTERNALSPATIALELEMENTEXTERNAL_FIRE', 'IFCEXTERNALSPATIALELEMENTEXTERNAL_WATER', 'IFCEXTERNALSPATIALSTRUCTUREELEMENT', 'IFCFACILITY', 'IFCFACILITYPART', 'IFCFACILITYPARTCOMMON', 'IFCFACILITYPARTCOMMONABOVEGROUND', 'IFCFACILITYPARTCOMMONBELOWGROUND', 'IFCFACILITYPARTCOMMONJUNCTION', 'IFCFACILITYPARTCOMMONLEVELCROSSING', 'IFCFACILITYPARTCOMMONSEGMENT', 'IFCFACILITYPARTCOMMONSUBSTRUCTURE', 'IFCFACILITYPARTCOMMONSUPERSTRUCTURE', 'IFCFACILITYPARTCOMMONTERMINAL', 'IFCMARINEFACILITY', 'IFCMARINEFACILITYBARRIERBEACH', 'IFCMARINEFACILITYBREAKWATER', 'IFCMARINEFACILITYCANAL', 'IFCMARINEFACILITYDRYDOCK', 'IFCMARINEFACILITYFLOATINGDOCK', 'IFCMARINEFACILITYHYDROLIFT', 'IFCMARINEFACILITYJETTY', 'IFCMARINEFACILITYLAUNCHRECOVERY', 'IFCMARINEFACILITYMARINEDEFENCE', 'IFCMARINEFACILITYNAVIGATIONALCHANNEL', 'IFCMARINEFACILITYPORT', 'IFCMARINEFACILITYQUAY', 'IFCMARINEFACILITYREVETMENT', 'IFCMARINEFACILITYSHIPLIFT', 'IFCMARINEFACILITYSHIPLOCK', 'IFCMARINEFACILITYSHIPYARD', 'IFCMARINEFACILITYSLIPWAY', 'IFCMARINEFACILITYWATERWAY', 'IFCMARINEFACILITYWATERWAYSHIPLIFT', 'IFCMARINEPART', 'IFCMARINEPARTABOVEWATERLINE', 'IFCMARINEPARTANCHORAGE', 'IFCMARINEPARTAPPROACHCHANNEL', 'IFCMARINEPARTBELOWWATERLINE', 'IFCMARINEPARTBERTHINGSTRUCTURE', 'IFCMARINEPARTCHAMBER', 'IFCMARINEPARTCILL_LEVEL', 'IFCMARINEPARTCOPELEVEL', 'IFCMARINEPARTCORE', 'IFCMARINEPARTCREST', 'IFCMARINEPARTGATEHEAD', 'IFCMARINEPARTGUDINGSTRUCTURE', 'IFCMARINEPARTHIGHWATERLINE', 'IFCMARINEPARTLANDFIELD', 'IFCMARINEPARTLEEWARDSIDE', 'IFCMARINEPARTLOWWATERLINE', 'IFCMARINEPARTMANUFACTURING', 'IFCMARINEPARTNAVIGATIONALAREA', 'IFCMARINEPARTPROTECTION', 'IFCMARINEPARTSHIPTRANSFER', 'IFCMARINEPARTSTORAGEAREA', 'IFCMARINEPARTVEHICLESERVICING', 'IFCMARINEPARTWATERFIELD', 'IFCMARINEPARTWEATHERSIDE', 'IFCRAILWAY', 'IFCRAILWAYPART', 'IFCRAILWAYPARTABOVETRACK', 'IFCRAILWAYPARTDILATIONTRACK', 'IFCRAILWAYPARTLINESIDE', 'IFCRAILWAYPARTLINESIDEPART', 'IFCRAILWAYPARTPLAINTRACK', 'IFCRAILWAYPARTSUBSTRUCTURE', 'IFCRAILWAYPARTTRACK', 'IFCRAILWAYPARTTRACKPART', 'IFCRAILWAYPARTTURNOUTTRACK', 'IFCROAD', 'IFCROADPART', 'IFCROADPARTBICYCLECROSSING', 'IFCROADPARTBUS_STOP', 'IFCROADPARTCARRIAGEWAY', 'IFCROADPARTCENTRALISLAND', 'IFCROADPARTCENTRALRESERVE', 'IFCROADPARTHARDSHOULDER', 'IFCROADPARTINTERSECTION', 'IFCROADPARTLAYBY', 'IFCROADPARTPARKINGBAY', 'IFCROADPARTPASSINGBAY', 'IFCROADPARTPEDESTRIAN_CROSSING', 'IFCROADPARTRAILWAYCROSSING', 'IFCROADPARTREFUGEISLAND', 'IFCROADPARTROADSEGMENT', 'IFCROADPARTROADSIDE', 'IFCROADPARTROADSIDEPART', 'IFCROADPARTROADWAYPLATEAU', 'IFCROADPARTROUNDABOUT', 'IFCROADPARTSHOULDER', 'IFCROADPARTSIDEWALK', 'IFCROADPARTSOFTSHOULDER', 'IFCROADPARTTOLLPLAZA', 'IFCROADPARTTRAFFICISLAND', 'IFCROADPARTTRAFFICLANE', 'IFCSITE', 'IFCSPACE', 'IFCSPACEBERTH', 'IFCSPACEEXTERNAL', 'IFCSPACEGFA', 'IFCSPACEINTERNAL', 'IFCSPACEPARKING', 'IFCSPACESPACE', 'IFCSPATIALELEMENT', 'IFCSPATIALSTRUCTUREELEMENT', 'IFCSPATIALZONE', 'IFCSPATIALZONECONSTRUCTION', 'IFCSPATIALZONEFIRESAFETY', 'IFCSPATIALZONEINTERFERENCE', 'IFCSPATIALZONELIGHTING', 'IFCSPATIALZONEOCCUPANCY', 'IFCSPATIALZONERESERVATION', 'IFCSPATIALZONESECURITY', 'IFCSPATIALZONETHERMAL', 'IFCSPATIALZONETRANSPORT', 'IFCSPATIALZONEVENTILATION', 'IFCZONE'],
    props: [
      { name: 'ArtificialLighting', type: 'IfcBoolean', description: 'Indication whether this space requires artificial lighting (as natural lighting would be not sufficient). (TRUE) indicat' },
      { name: 'Illuminance', type: 'IfcReal', description: 'Required average illuminance value for this space.' },
    ],
  },

  'Pset_SpaceOccupancyRequirements': {
    label:       'Property Set: Space Occupancy Requirements',
    description: 'Properties concerning work activities occurring or expected to occur within one or a set of similar spatial structure elements.',
    applicableTo: ['IFCBRIDGE', 'IFCBRIDGEARCHED', 'IFCBRIDGECABLE_STAYED', 'IFCBRIDGECANTILEVER', 'IFCBRIDGECULVERT', 'IFCBRIDGEFRAMEWORK', 'IFCBRIDGEGIRDER', 'IFCBRIDGEPART', 'IFCBRIDGEPARTABUTMENT', 'IFCBRIDGEPARTDECK', 'IFCBRIDGEPARTDECK_SEGMENT', 'IFCBRIDGEPARTFOUNDATION', 'IFCBRIDGEPARTPIER', 'IFCBRIDGEPARTPIER_SEGMENT', 'IFCBRIDGEPARTPYLON', 'IFCBRIDGEPARTSUBSTRUCTURE', 'IFCBRIDGEPARTSUPERSTRUCTURE', 'IFCBRIDGEPARTSURFACESTRUCTURE', 'IFCBRIDGESUSPENSION', 'IFCBRIDGETRUSS', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCEXTERNALSPATIALELEMENT', 'IFCEXTERNALSPATIALELEMENTEXTERNAL', 'IFCEXTERNALSPATIALELEMENTEXTERNAL_EARTH', 'IFCEXTERNALSPATIALELEMENTEXTERNAL_FIRE', 'IFCEXTERNALSPATIALELEMENTEXTERNAL_WATER', 'IFCEXTERNALSPATIALSTRUCTUREELEMENT', 'IFCFACILITY', 'IFCFACILITYPART', 'IFCFACILITYPARTCOMMON', 'IFCFACILITYPARTCOMMONABOVEGROUND', 'IFCFACILITYPARTCOMMONBELOWGROUND', 'IFCFACILITYPARTCOMMONJUNCTION', 'IFCFACILITYPARTCOMMONLEVELCROSSING', 'IFCFACILITYPARTCOMMONSEGMENT', 'IFCFACILITYPARTCOMMONSUBSTRUCTURE', 'IFCFACILITYPARTCOMMONSUPERSTRUCTURE', 'IFCFACILITYPARTCOMMONTERMINAL', 'IFCMARINEFACILITY', 'IFCMARINEFACILITYBARRIERBEACH', 'IFCMARINEFACILITYBREAKWATER', 'IFCMARINEFACILITYCANAL', 'IFCMARINEFACILITYDRYDOCK', 'IFCMARINEFACILITYFLOATINGDOCK', 'IFCMARINEFACILITYHYDROLIFT', 'IFCMARINEFACILITYJETTY', 'IFCMARINEFACILITYLAUNCHRECOVERY', 'IFCMARINEFACILITYMARINEDEFENCE', 'IFCMARINEFACILITYNAVIGATIONALCHANNEL', 'IFCMARINEFACILITYPORT', 'IFCMARINEFACILITYQUAY', 'IFCMARINEFACILITYREVETMENT', 'IFCMARINEFACILITYSHIPLIFT', 'IFCMARINEFACILITYSHIPLOCK', 'IFCMARINEFACILITYSHIPYARD', 'IFCMARINEFACILITYSLIPWAY', 'IFCMARINEFACILITYWATERWAY', 'IFCMARINEFACILITYWATERWAYSHIPLIFT', 'IFCMARINEPART', 'IFCMARINEPARTABOVEWATERLINE', 'IFCMARINEPARTANCHORAGE', 'IFCMARINEPARTAPPROACHCHANNEL', 'IFCMARINEPARTBELOWWATERLINE', 'IFCMARINEPARTBERTHINGSTRUCTURE', 'IFCMARINEPARTCHAMBER', 'IFCMARINEPARTCILL_LEVEL', 'IFCMARINEPARTCOPELEVEL', 'IFCMARINEPARTCORE', 'IFCMARINEPARTCREST', 'IFCMARINEPARTGATEHEAD', 'IFCMARINEPARTGUDINGSTRUCTURE', 'IFCMARINEPARTHIGHWATERLINE', 'IFCMARINEPARTLANDFIELD', 'IFCMARINEPARTLEEWARDSIDE', 'IFCMARINEPARTLOWWATERLINE', 'IFCMARINEPARTMANUFACTURING', 'IFCMARINEPARTNAVIGATIONALAREA', 'IFCMARINEPARTPROTECTION', 'IFCMARINEPARTSHIPTRANSFER', 'IFCMARINEPARTSTORAGEAREA', 'IFCMARINEPARTVEHICLESERVICING', 'IFCMARINEPARTWATERFIELD', 'IFCMARINEPARTWEATHERSIDE', 'IFCRAILWAY', 'IFCRAILWAYPART', 'IFCRAILWAYPARTABOVETRACK', 'IFCRAILWAYPARTDILATIONTRACK', 'IFCRAILWAYPARTLINESIDE', 'IFCRAILWAYPARTLINESIDEPART', 'IFCRAILWAYPARTPLAINTRACK', 'IFCRAILWAYPARTSUBSTRUCTURE', 'IFCRAILWAYPARTTRACK', 'IFCRAILWAYPARTTRACKPART', 'IFCRAILWAYPARTTURNOUTTRACK', 'IFCROAD', 'IFCROADPART', 'IFCROADPARTBICYCLECROSSING', 'IFCROADPARTBUS_STOP', 'IFCROADPARTCARRIAGEWAY', 'IFCROADPARTCENTRALISLAND', 'IFCROADPARTCENTRALRESERVE', 'IFCROADPARTHARDSHOULDER', 'IFCROADPARTINTERSECTION', 'IFCROADPARTLAYBY', 'IFCROADPARTPARKINGBAY', 'IFCROADPARTPASSINGBAY', 'IFCROADPARTPEDESTRIAN_CROSSING', 'IFCROADPARTRAILWAYCROSSING', 'IFCROADPARTREFUGEISLAND', 'IFCROADPARTROADSEGMENT', 'IFCROADPARTROADSIDE', 'IFCROADPARTROADSIDEPART', 'IFCROADPARTROADWAYPLATEAU', 'IFCROADPARTROUNDABOUT', 'IFCROADPARTSHOULDER', 'IFCROADPARTSIDEWALK', 'IFCROADPARTSOFTSHOULDER', 'IFCROADPARTTOLLPLAZA', 'IFCROADPARTTRAFFICISLAND', 'IFCROADPARTTRAFFICLANE', 'IFCSITE', 'IFCSPACE', 'IFCSPACEBERTH', 'IFCSPACEEXTERNAL', 'IFCSPACEGFA', 'IFCSPACEINTERNAL', 'IFCSPACEPARKING', 'IFCSPACESPACE', 'IFCSPATIALELEMENT', 'IFCSPATIALSTRUCTUREELEMENT', 'IFCSPATIALZONE', 'IFCSPATIALZONECONSTRUCTION', 'IFCSPATIALZONEFIRESAFETY', 'IFCSPATIALZONEINTERFERENCE', 'IFCSPATIALZONELIGHTING', 'IFCSPATIALZONEOCCUPANCY', 'IFCSPATIALZONERESERVATION', 'IFCSPATIALZONESECURITY', 'IFCSPATIALZONETHERMAL', 'IFCSPATIALZONETRANSPORT', 'IFCSPATIALZONEVENTILATION', 'IFCZONE'],
    props: [
      { name: 'AreaPerOccupant', type: 'IfcReal', description: 'Design occupancy loading for this type of usage assigned to this space.' },
      { name: 'IsOutlookDesirable', type: 'IfcBoolean', description: 'An indication of whether the outlook is desirable (set TRUE) or not (set FALSE)' },
      { name: 'MinimumHeadroom', type: 'IfcReal', description: 'Headroom required for the activity assigned to this space.' },
      { name: 'OccupancyNumber', type: 'IfcInteger', description: 'Number of people required for the activity assigned to this space.' },
      { name: 'OccupancyNumberPeak', type: 'IfcInteger', description: 'Maximal number of people required for the activity assigned to this space in peak time.' },
      { name: 'OccupancyTimePerDay', type: 'IfcReal', description: 'The amount of time during the day that the activity is required within this space.' },
      { name: 'OccupancyType', type: 'IfcLabel', description: 'Occupancy type for this object.; It is defined according to the presiding national building code.' },
    ],
  },

  'Pset_SpaceParking': {
    label:       'Property Set: Space Parking',
    description: 'Properties common to the definition of all occurrences of [[IfcSpace]] which have an attribute value for [[ObjectType]] = \\\'Parking\\\'.',
    applicableTo: ['IFCSPACEPARKING'],
    props: [
      { name: 'IsAisle', type: 'IfcBoolean', description: 'Indicates that this parking zone is for accessing the parking units, i.e. an aisle (TRUE) and not a parking unit itself' },
      { name: 'IsOneWay', type: 'IfcBoolean', description: 'Indicates whether the parking aisle is designed for oneway traffic (TRUE) or twoway traffic (FALSE). Should only be prov' },
      { name: 'ParkingUnits', type: 'IfcInteger', description: 'Indicates the number of transportation units of the type specified by the property ParkingUse that may be accommodated w' },
      { name: 'ParkingUse', type: 'IfcLabel', description: 'Identifies the type of transportation for which the parking space is designed. Values are not predefined but might inclu' },
    ],
  },

  'Pset_SpaceThermalLoad': {
    label:       'Property Set: Space Thermal Load',
    description: 'The space thermal load defines all thermal losses and gains occurring within a space or zone. The thermal load source attribute defines an enumeration of possible sources of the th',
    applicableTo: ['IFCBRIDGE', 'IFCBRIDGEARCHED', 'IFCBRIDGECABLE_STAYED', 'IFCBRIDGECANTILEVER', 'IFCBRIDGECULVERT', 'IFCBRIDGEFRAMEWORK', 'IFCBRIDGEGIRDER', 'IFCBRIDGEPART', 'IFCBRIDGEPARTABUTMENT', 'IFCBRIDGEPARTDECK', 'IFCBRIDGEPARTDECK_SEGMENT', 'IFCBRIDGEPARTFOUNDATION', 'IFCBRIDGEPARTPIER', 'IFCBRIDGEPARTPIER_SEGMENT', 'IFCBRIDGEPARTPYLON', 'IFCBRIDGEPARTSUBSTRUCTURE', 'IFCBRIDGEPARTSUPERSTRUCTURE', 'IFCBRIDGEPARTSURFACESTRUCTURE', 'IFCBRIDGESUSPENSION', 'IFCBRIDGETRUSS', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCEXTERNALSPATIALELEMENT', 'IFCEXTERNALSPATIALELEMENTEXTERNAL', 'IFCEXTERNALSPATIALELEMENTEXTERNAL_EARTH', 'IFCEXTERNALSPATIALELEMENTEXTERNAL_FIRE', 'IFCEXTERNALSPATIALELEMENTEXTERNAL_WATER', 'IFCEXTERNALSPATIALSTRUCTUREELEMENT', 'IFCFACILITY', 'IFCFACILITYPART', 'IFCFACILITYPARTCOMMON', 'IFCFACILITYPARTCOMMONABOVEGROUND', 'IFCFACILITYPARTCOMMONBELOWGROUND', 'IFCFACILITYPARTCOMMONJUNCTION', 'IFCFACILITYPARTCOMMONLEVELCROSSING', 'IFCFACILITYPARTCOMMONSEGMENT', 'IFCFACILITYPARTCOMMONSUBSTRUCTURE', 'IFCFACILITYPARTCOMMONSUPERSTRUCTURE', 'IFCFACILITYPARTCOMMONTERMINAL', 'IFCMARINEFACILITY', 'IFCMARINEFACILITYBARRIERBEACH', 'IFCMARINEFACILITYBREAKWATER', 'IFCMARINEFACILITYCANAL', 'IFCMARINEFACILITYDRYDOCK', 'IFCMARINEFACILITYFLOATINGDOCK', 'IFCMARINEFACILITYHYDROLIFT', 'IFCMARINEFACILITYJETTY', 'IFCMARINEFACILITYLAUNCHRECOVERY', 'IFCMARINEFACILITYMARINEDEFENCE', 'IFCMARINEFACILITYNAVIGATIONALCHANNEL', 'IFCMARINEFACILITYPORT', 'IFCMARINEFACILITYQUAY', 'IFCMARINEFACILITYREVETMENT', 'IFCMARINEFACILITYSHIPLIFT', 'IFCMARINEFACILITYSHIPLOCK', 'IFCMARINEFACILITYSHIPYARD', 'IFCMARINEFACILITYSLIPWAY', 'IFCMARINEFACILITYWATERWAY', 'IFCMARINEFACILITYWATERWAYSHIPLIFT', 'IFCMARINEPART', 'IFCMARINEPARTABOVEWATERLINE', 'IFCMARINEPARTANCHORAGE', 'IFCMARINEPARTAPPROACHCHANNEL', 'IFCMARINEPARTBELOWWATERLINE', 'IFCMARINEPARTBERTHINGSTRUCTURE', 'IFCMARINEPARTCHAMBER', 'IFCMARINEPARTCILL_LEVEL', 'IFCMARINEPARTCOPELEVEL', 'IFCMARINEPARTCORE', 'IFCMARINEPARTCREST', 'IFCMARINEPARTGATEHEAD', 'IFCMARINEPARTGUDINGSTRUCTURE', 'IFCMARINEPARTHIGHWATERLINE', 'IFCMARINEPARTLANDFIELD', 'IFCMARINEPARTLEEWARDSIDE', 'IFCMARINEPARTLOWWATERLINE', 'IFCMARINEPARTMANUFACTURING', 'IFCMARINEPARTNAVIGATIONALAREA', 'IFCMARINEPARTPROTECTION', 'IFCMARINEPARTSHIPTRANSFER', 'IFCMARINEPARTSTORAGEAREA', 'IFCMARINEPARTVEHICLESERVICING', 'IFCMARINEPARTWATERFIELD', 'IFCMARINEPARTWEATHERSIDE', 'IFCRAILWAY', 'IFCRAILWAYPART', 'IFCRAILWAYPARTABOVETRACK', 'IFCRAILWAYPARTDILATIONTRACK', 'IFCRAILWAYPARTLINESIDE', 'IFCRAILWAYPARTLINESIDEPART', 'IFCRAILWAYPARTPLAINTRACK', 'IFCRAILWAYPARTSUBSTRUCTURE', 'IFCRAILWAYPARTTRACK', 'IFCRAILWAYPARTTRACKPART', 'IFCRAILWAYPARTTURNOUTTRACK', 'IFCROAD', 'IFCROADPART', 'IFCROADPARTBICYCLECROSSING', 'IFCROADPARTBUS_STOP', 'IFCROADPARTCARRIAGEWAY', 'IFCROADPARTCENTRALISLAND', 'IFCROADPARTCENTRALRESERVE', 'IFCROADPARTHARDSHOULDER', 'IFCROADPARTINTERSECTION', 'IFCROADPARTLAYBY', 'IFCROADPARTPARKINGBAY', 'IFCROADPARTPASSINGBAY', 'IFCROADPARTPEDESTRIAN_CROSSING', 'IFCROADPARTRAILWAYCROSSING', 'IFCROADPARTREFUGEISLAND', 'IFCROADPARTROADSEGMENT', 'IFCROADPARTROADSIDE', 'IFCROADPARTROADSIDEPART', 'IFCROADPARTROADWAYPLATEAU', 'IFCROADPARTROUNDABOUT', 'IFCROADPARTSHOULDER', 'IFCROADPARTSIDEWALK', 'IFCROADPARTSOFTSHOULDER', 'IFCROADPARTTOLLPLAZA', 'IFCROADPARTTRAFFICISLAND', 'IFCROADPARTTRAFFICLANE', 'IFCSITE', 'IFCSPACE', 'IFCSPACEBERTH', 'IFCSPACEEXTERNAL', 'IFCSPACEGFA', 'IFCSPACEINTERNAL', 'IFCSPACEPARKING', 'IFCSPACESPACE', 'IFCSPATIALELEMENT', 'IFCSPATIALSTRUCTUREELEMENT', 'IFCSPATIALZONE', 'IFCSPATIALZONECONSTRUCTION', 'IFCSPATIALZONEFIRESAFETY', 'IFCSPATIALZONEINTERFERENCE', 'IFCSPATIALZONELIGHTING', 'IFCSPATIALZONEOCCUPANCY', 'IFCSPATIALZONERESERVATION', 'IFCSPATIALZONESECURITY', 'IFCSPATIALZONETHERMAL', 'IFCSPATIALZONETRANSPORT', 'IFCSPATIALZONEVENTILATION'],
    props: [
      { name: 'AirExchangeRate', type: 'IfcReal', description: 'Loads from the air exchange rate.' },
      { name: 'DryBulbTemperature', type: 'IfcReal', description: 'Dry bulb temperature of the object.' },
      { name: 'EquipmentSensible', type: 'IfcReal', description: 'Heat gains and losses from equipment.' },
      { name: 'ExhaustAir', type: 'IfcReal', description: 'Loads from exhaust air.' },
      { name: 'InfiltrationSensible', type: 'IfcReal', description: 'Heat gains and losses from infiltration.' },
      { name: 'Lighting', type: 'IfcReal', description: 'Lighting loads.' },
      { name: 'People', type: 'IfcReal', description: 'Heat gains and losses from people.' },
      { name: 'RecirculatedAir', type: 'IfcReal', description: 'Loads from recirculated air.' },
      { name: 'RelativeHumidity', type: 'IfcReal', description: 'Loads from the relative humidity.' },
      { name: 'TotalLatentLoad', type: 'IfcReal', description: 'Total energy added or removed from air that affects its humidity or concentration of water vapor. If a value is less tha' },
      { name: 'TotalRadiantLoad', type: 'IfcReal', description: 'Total electromagnetic energy added or removed by emission or absorption. If a value is less than zero (negative), then t' },
      { name: 'TotalSensibleLoad', type: 'IfcReal', description: 'Total energy added or removed from air that affects its temperature. If a value is less than zero (negative), then the t' },
      { name: 'VentilationIndoorAir', type: 'IfcReal', description: 'Ventilation loads from indoor air.' },
      { name: 'VentilationOutdoorAir', type: 'IfcReal', description: 'Ventilation loads from outdoor air.' },
    ],
  },

  'Pset_SpaceThermalLoadPHistory': {
    label:       'Property Set: Space Thermal Load Phistory',
    description: 'This property set defines actual measured thermal losses and gains occurring within a space or zone. The thermal load source attribute defines an enumeration of possible sources of',
    applicableTo: ['IFCBRIDGE', 'IFCBRIDGEARCHED', 'IFCBRIDGECABLE_STAYED', 'IFCBRIDGECANTILEVER', 'IFCBRIDGECULVERT', 'IFCBRIDGEFRAMEWORK', 'IFCBRIDGEGIRDER', 'IFCBRIDGEPART', 'IFCBRIDGEPARTABUTMENT', 'IFCBRIDGEPARTDECK', 'IFCBRIDGEPARTDECK_SEGMENT', 'IFCBRIDGEPARTFOUNDATION', 'IFCBRIDGEPARTPIER', 'IFCBRIDGEPARTPIER_SEGMENT', 'IFCBRIDGEPARTPYLON', 'IFCBRIDGEPARTSUBSTRUCTURE', 'IFCBRIDGEPARTSUPERSTRUCTURE', 'IFCBRIDGEPARTSURFACESTRUCTURE', 'IFCBRIDGESUSPENSION', 'IFCBRIDGETRUSS', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCEXTERNALSPATIALELEMENT', 'IFCEXTERNALSPATIALELEMENTEXTERNAL', 'IFCEXTERNALSPATIALELEMENTEXTERNAL_EARTH', 'IFCEXTERNALSPATIALELEMENTEXTERNAL_FIRE', 'IFCEXTERNALSPATIALELEMENTEXTERNAL_WATER', 'IFCEXTERNALSPATIALSTRUCTUREELEMENT', 'IFCFACILITY', 'IFCFACILITYPART', 'IFCFACILITYPARTCOMMON', 'IFCFACILITYPARTCOMMONABOVEGROUND', 'IFCFACILITYPARTCOMMONBELOWGROUND', 'IFCFACILITYPARTCOMMONJUNCTION', 'IFCFACILITYPARTCOMMONLEVELCROSSING', 'IFCFACILITYPARTCOMMONSEGMENT', 'IFCFACILITYPARTCOMMONSUBSTRUCTURE', 'IFCFACILITYPARTCOMMONSUPERSTRUCTURE', 'IFCFACILITYPARTCOMMONTERMINAL', 'IFCMARINEFACILITY', 'IFCMARINEFACILITYBARRIERBEACH', 'IFCMARINEFACILITYBREAKWATER', 'IFCMARINEFACILITYCANAL', 'IFCMARINEFACILITYDRYDOCK', 'IFCMARINEFACILITYFLOATINGDOCK', 'IFCMARINEFACILITYHYDROLIFT', 'IFCMARINEFACILITYJETTY', 'IFCMARINEFACILITYLAUNCHRECOVERY', 'IFCMARINEFACILITYMARINEDEFENCE', 'IFCMARINEFACILITYNAVIGATIONALCHANNEL', 'IFCMARINEFACILITYPORT', 'IFCMARINEFACILITYQUAY', 'IFCMARINEFACILITYREVETMENT', 'IFCMARINEFACILITYSHIPLIFT', 'IFCMARINEFACILITYSHIPLOCK', 'IFCMARINEFACILITYSHIPYARD', 'IFCMARINEFACILITYSLIPWAY', 'IFCMARINEFACILITYWATERWAY', 'IFCMARINEFACILITYWATERWAYSHIPLIFT', 'IFCMARINEPART', 'IFCMARINEPARTABOVEWATERLINE', 'IFCMARINEPARTANCHORAGE', 'IFCMARINEPARTAPPROACHCHANNEL', 'IFCMARINEPARTBELOWWATERLINE', 'IFCMARINEPARTBERTHINGSTRUCTURE', 'IFCMARINEPARTCHAMBER', 'IFCMARINEPARTCILL_LEVEL', 'IFCMARINEPARTCOPELEVEL', 'IFCMARINEPARTCORE', 'IFCMARINEPARTCREST', 'IFCMARINEPARTGATEHEAD', 'IFCMARINEPARTGUDINGSTRUCTURE', 'IFCMARINEPARTHIGHWATERLINE', 'IFCMARINEPARTLANDFIELD', 'IFCMARINEPARTLEEWARDSIDE', 'IFCMARINEPARTLOWWATERLINE', 'IFCMARINEPARTMANUFACTURING', 'IFCMARINEPARTNAVIGATIONALAREA', 'IFCMARINEPARTPROTECTION', 'IFCMARINEPARTSHIPTRANSFER', 'IFCMARINEPARTSTORAGEAREA', 'IFCMARINEPARTVEHICLESERVICING', 'IFCMARINEPARTWATERFIELD', 'IFCMARINEPARTWEATHERSIDE', 'IFCRAILWAY', 'IFCRAILWAYPART', 'IFCRAILWAYPARTABOVETRACK', 'IFCRAILWAYPARTDILATIONTRACK', 'IFCRAILWAYPARTLINESIDE', 'IFCRAILWAYPARTLINESIDEPART', 'IFCRAILWAYPARTPLAINTRACK', 'IFCRAILWAYPARTSUBSTRUCTURE', 'IFCRAILWAYPARTTRACK', 'IFCRAILWAYPARTTRACKPART', 'IFCRAILWAYPARTTURNOUTTRACK', 'IFCROAD', 'IFCROADPART', 'IFCROADPARTBICYCLECROSSING', 'IFCROADPARTBUS_STOP', 'IFCROADPARTCARRIAGEWAY', 'IFCROADPARTCENTRALISLAND', 'IFCROADPARTCENTRALRESERVE', 'IFCROADPARTHARDSHOULDER', 'IFCROADPARTINTERSECTION', 'IFCROADPARTLAYBY', 'IFCROADPARTPARKINGBAY', 'IFCROADPARTPASSINGBAY', 'IFCROADPARTPEDESTRIAN_CROSSING', 'IFCROADPARTRAILWAYCROSSING', 'IFCROADPARTREFUGEISLAND', 'IFCROADPARTROADSEGMENT', 'IFCROADPARTROADSIDE', 'IFCROADPARTROADSIDEPART', 'IFCROADPARTROADWAYPLATEAU', 'IFCROADPARTROUNDABOUT', 'IFCROADPARTSHOULDER', 'IFCROADPARTSIDEWALK', 'IFCROADPARTSOFTSHOULDER', 'IFCROADPARTTOLLPLAZA', 'IFCROADPARTTRAFFICISLAND', 'IFCROADPARTTRAFFICLANE', 'IFCSITE', 'IFCSPACE', 'IFCSPACEBERTH', 'IFCSPACEEXTERNAL', 'IFCSPACEGFA', 'IFCSPACEINTERNAL', 'IFCSPACEPARKING', 'IFCSPACESPACE', 'IFCSPATIALELEMENT', 'IFCSPATIALSTRUCTUREELEMENT', 'IFCSPATIALZONE', 'IFCSPATIALZONECONSTRUCTION', 'IFCSPATIALZONEFIRESAFETY', 'IFCSPATIALZONEINTERFERENCE', 'IFCSPATIALZONELIGHTING', 'IFCSPATIALZONEOCCUPANCY', 'IFCSPATIALZONERESERVATION', 'IFCSPATIALZONESECURITY', 'IFCSPATIALZONETHERMAL', 'IFCSPATIALZONETRANSPORT', 'IFCSPATIALZONEVENTILATION'],
    props: [
      { name: 'AirExchangeRateTimeHistory', type: 'IfcTimeSeries', description: 'Loads from the air exchange rate.' },
      { name: 'DryBulbTemperatureHistory', type: 'IfcTimeSeries', description: 'Loads from the dry bulb temperature.' },
      { name: 'EquipmentSensibleHistory', type: 'IfcTimeSeries', description: 'Heat gains and losses from equipment.' },
      { name: 'ExhaustAirHistory', type: 'IfcTimeSeries', description: 'Loads from exhaust air.' },
      { name: 'InfiltrationSensibleHistory', type: 'IfcTimeSeries', description: 'Heat gains and losses from infiltration.' },
      { name: 'LightingHistory', type: 'IfcTimeSeries', description: 'Lighting loads.' },
      { name: 'PeopleHistory', type: 'IfcTimeSeries', description: 'Heat gains and losses from people.' },
      { name: 'RecirculatedAirHistory', type: 'IfcTimeSeries', description: 'Loads from recirculated air.' },
      { name: 'RelativeHumidityHistory', type: 'IfcTimeSeries', description: 'Loads from the relative humidity.' },
      { name: 'TotalLatentLoadHistory', type: 'IfcTimeSeries', description: 'Total energy added or removed from air that affects its humidity or concentration of water vapor. If a value is less tha' },
      { name: 'TotalRadiantLoadHistory', type: 'IfcTimeSeries', description: 'Total electromagnetic energy added or removed by emission or absorption. If a value is less than zero (negative), then t' },
      { name: 'TotalSensibleLoadHistory', type: 'IfcTimeSeries', description: 'Total energy added or removed from air that affects its temperature. If a value is less than zero (negative), then the t' },
      { name: 'VentilationIndoorAirHistory', type: 'IfcTimeSeries', description: 'Ventilation loads from indoor air.' },
      { name: 'VentilationOutdoorAirHistory', type: 'IfcTimeSeries', description: 'Ventilation loads from outdoor air.' },
    ],
  },

  'Pset_SpaceThermalPHistory': {
    label:       'Property Set: Space Thermal Phistory',
    description: 'Thermal and air flow conditions of a space or zone.',
    applicableTo: ['IFCBRIDGE', 'IFCBRIDGEARCHED', 'IFCBRIDGECABLE_STAYED', 'IFCBRIDGECANTILEVER', 'IFCBRIDGECULVERT', 'IFCBRIDGEFRAMEWORK', 'IFCBRIDGEGIRDER', 'IFCBRIDGEPART', 'IFCBRIDGEPARTABUTMENT', 'IFCBRIDGEPARTDECK', 'IFCBRIDGEPARTDECK_SEGMENT', 'IFCBRIDGEPARTFOUNDATION', 'IFCBRIDGEPARTPIER', 'IFCBRIDGEPARTPIER_SEGMENT', 'IFCBRIDGEPARTPYLON', 'IFCBRIDGEPARTSUBSTRUCTURE', 'IFCBRIDGEPARTSUPERSTRUCTURE', 'IFCBRIDGEPARTSURFACESTRUCTURE', 'IFCBRIDGESUSPENSION', 'IFCBRIDGETRUSS', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCEXTERNALSPATIALELEMENT', 'IFCEXTERNALSPATIALELEMENTEXTERNAL', 'IFCEXTERNALSPATIALELEMENTEXTERNAL_EARTH', 'IFCEXTERNALSPATIALELEMENTEXTERNAL_FIRE', 'IFCEXTERNALSPATIALELEMENTEXTERNAL_WATER', 'IFCEXTERNALSPATIALSTRUCTUREELEMENT', 'IFCFACILITY', 'IFCFACILITYPART', 'IFCFACILITYPARTCOMMON', 'IFCFACILITYPARTCOMMONABOVEGROUND', 'IFCFACILITYPARTCOMMONBELOWGROUND', 'IFCFACILITYPARTCOMMONJUNCTION', 'IFCFACILITYPARTCOMMONLEVELCROSSING', 'IFCFACILITYPARTCOMMONSEGMENT', 'IFCFACILITYPARTCOMMONSUBSTRUCTURE', 'IFCFACILITYPARTCOMMONSUPERSTRUCTURE', 'IFCFACILITYPARTCOMMONTERMINAL', 'IFCMARINEFACILITY', 'IFCMARINEFACILITYBARRIERBEACH', 'IFCMARINEFACILITYBREAKWATER', 'IFCMARINEFACILITYCANAL', 'IFCMARINEFACILITYDRYDOCK', 'IFCMARINEFACILITYFLOATINGDOCK', 'IFCMARINEFACILITYHYDROLIFT', 'IFCMARINEFACILITYJETTY', 'IFCMARINEFACILITYLAUNCHRECOVERY', 'IFCMARINEFACILITYMARINEDEFENCE', 'IFCMARINEFACILITYNAVIGATIONALCHANNEL', 'IFCMARINEFACILITYPORT', 'IFCMARINEFACILITYQUAY', 'IFCMARINEFACILITYREVETMENT', 'IFCMARINEFACILITYSHIPLIFT', 'IFCMARINEFACILITYSHIPLOCK', 'IFCMARINEFACILITYSHIPYARD', 'IFCMARINEFACILITYSLIPWAY', 'IFCMARINEFACILITYWATERWAY', 'IFCMARINEFACILITYWATERWAYSHIPLIFT', 'IFCMARINEPART', 'IFCMARINEPARTABOVEWATERLINE', 'IFCMARINEPARTANCHORAGE', 'IFCMARINEPARTAPPROACHCHANNEL', 'IFCMARINEPARTBELOWWATERLINE', 'IFCMARINEPARTBERTHINGSTRUCTURE', 'IFCMARINEPARTCHAMBER', 'IFCMARINEPARTCILL_LEVEL', 'IFCMARINEPARTCOPELEVEL', 'IFCMARINEPARTCORE', 'IFCMARINEPARTCREST', 'IFCMARINEPARTGATEHEAD', 'IFCMARINEPARTGUDINGSTRUCTURE', 'IFCMARINEPARTHIGHWATERLINE', 'IFCMARINEPARTLANDFIELD', 'IFCMARINEPARTLEEWARDSIDE', 'IFCMARINEPARTLOWWATERLINE', 'IFCMARINEPARTMANUFACTURING', 'IFCMARINEPARTNAVIGATIONALAREA', 'IFCMARINEPARTPROTECTION', 'IFCMARINEPARTSHIPTRANSFER', 'IFCMARINEPARTSTORAGEAREA', 'IFCMARINEPARTVEHICLESERVICING', 'IFCMARINEPARTWATERFIELD', 'IFCMARINEPARTWEATHERSIDE', 'IFCRAILWAY', 'IFCRAILWAYPART', 'IFCRAILWAYPARTABOVETRACK', 'IFCRAILWAYPARTDILATIONTRACK', 'IFCRAILWAYPARTLINESIDE', 'IFCRAILWAYPARTLINESIDEPART', 'IFCRAILWAYPARTPLAINTRACK', 'IFCRAILWAYPARTSUBSTRUCTURE', 'IFCRAILWAYPARTTRACK', 'IFCRAILWAYPARTTRACKPART', 'IFCRAILWAYPARTTURNOUTTRACK', 'IFCROAD', 'IFCROADPART', 'IFCROADPARTBICYCLECROSSING', 'IFCROADPARTBUS_STOP', 'IFCROADPARTCARRIAGEWAY', 'IFCROADPARTCENTRALISLAND', 'IFCROADPARTCENTRALRESERVE', 'IFCROADPARTHARDSHOULDER', 'IFCROADPARTINTERSECTION', 'IFCROADPARTLAYBY', 'IFCROADPARTPARKINGBAY', 'IFCROADPARTPASSINGBAY', 'IFCROADPARTPEDESTRIAN_CROSSING', 'IFCROADPARTRAILWAYCROSSING', 'IFCROADPARTREFUGEISLAND', 'IFCROADPARTROADSEGMENT', 'IFCROADPARTROADSIDE', 'IFCROADPARTROADSIDEPART', 'IFCROADPARTROADWAYPLATEAU', 'IFCROADPARTROUNDABOUT', 'IFCROADPARTSHOULDER', 'IFCROADPARTSIDEWALK', 'IFCROADPARTSOFTSHOULDER', 'IFCROADPARTTOLLPLAZA', 'IFCROADPARTTRAFFICISLAND', 'IFCROADPARTTRAFFICLANE', 'IFCSITE', 'IFCSPACE', 'IFCSPACEBERTH', 'IFCSPACEEXTERNAL', 'IFCSPACEGFA', 'IFCSPACEINTERNAL', 'IFCSPACEPARKING', 'IFCSPACESPACE', 'IFCSPATIALELEMENT', 'IFCSPATIALSTRUCTUREELEMENT', 'IFCSPATIALZONE', 'IFCSPATIALZONECONSTRUCTION', 'IFCSPATIALZONEFIRESAFETY', 'IFCSPATIALZONEINTERFERENCE', 'IFCSPATIALZONELIGHTING', 'IFCSPATIALZONEOCCUPANCY', 'IFCSPATIALZONERESERVATION', 'IFCSPATIALZONESECURITY', 'IFCSPATIALZONETHERMAL', 'IFCSPATIALZONETRANSPORT', 'IFCSPATIALZONEVENTILATION'],
    props: [
      { name: 'CoolingAirFlowRate', type: 'IfcTimeSeries', description: 'Cooling air flow rate in the space.' },
      { name: 'ExhaustAirFlowRate', type: 'IfcTimeSeries', description: 'Design exhaust air flow rate for the space.' },
      { name: 'HeatingAirFlowRate', type: 'IfcTimeSeries', description: 'Heating air flow rate in the space.' },
      { name: 'SpaceRelativeHumidity', type: 'IfcTimeSeries', description: 'The relative humidity of the space.' },
      { name: 'SpaceTemperatureHistory', type: 'IfcTimeSeries', description: 'Temperature of the space.' },
      { name: 'VentilationAirFlowRateHistory', type: 'IfcTimeSeries', description: 'Ventilation air flow rate in the space.' },
    ],
  },

  'Pset_SpatialZoneCommon': {
    label:       'Property Set: Spatial Zone Common',
    description: 'Common properties for Spatial Zones.',
    applicableTo: ['IFCSPATIALZONE', 'IFCSPATIALZONECONSTRUCTION', 'IFCSPATIALZONEFIRESAFETY', 'IFCSPATIALZONEINTERFERENCE', 'IFCSPATIALZONELIGHTING', 'IFCSPATIALZONEOCCUPANCY', 'IFCSPATIALZONERESERVATION', 'IFCSPATIALZONESECURITY', 'IFCSPATIALZONETHERMAL', 'IFCSPATIALZONETRANSPORT', 'IFCSPATIALZONEVENTILATION'],
    props: [
      { name: 'IsExternal', type: 'IfcBoolean', description: 'Indication whether the element is designed for use in the exterior (TRUE) or not (FALSE). If (TRUE) it is an external el' },
    ],
  },

  'Pset_SpringTensioner': {
    label:       'Property Set: Spring Tensioner',
    description: 'Properties of spring tensioner used in railway. The property set can be used by the predefined type TENSIONINGEQUIPMENT of [[IfcDiscreteAccessory]].',
    applicableTo: ['IFCDISCRETEACCESSORYTENSIONINGEQUIPMENT'],
    props: [
      { name: 'NominalWeight', type: 'IfcReal', description: 'Nominal weight of the object.' },
      { name: 'TensileStrength', type: 'IfcReal', description: 'Indicates the ability to withstand breakage apart under applied force.' },
      { name: 'TensioningWorkingRange', type: 'IfcReal', description: 'The working range of the tensioning equipment under normal operation.' },
    ],
  },

  'Pset_StackTerminalTypeCommon': {
    label:       'Property Set: Stack Terminal Type Common',
    description: 'Common properties for stack terminals.',
    applicableTo: ['IFCSTACKTERMINAL', 'IFCSTACKTERMINALBIRDCAGE', 'IFCSTACKTERMINALCOWL', 'IFCSTACKTERMINALRAINWATERHOPPER'],
    props: [
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_StairCommon': {
    label:       'Property Set: Stair Common',
    description: 'Properties common to the definition of all occurrences of [[IfcStair]].',
    applicableTo: ['IFCSTAIR', 'IFCSTAIRCURVED_RUN_STAIR', 'IFCSTAIRDOUBLE_RETURN_STAIR', 'IFCSTAIRHALF_TURN_STAIR', 'IFCSTAIRHALF_WINDING_STAIR', 'IFCSTAIRLADDER', 'IFCSTAIRQUARTER_TURN_STAIR', 'IFCSTAIRQUARTER_WINDING_STAIR', 'IFCSTAIRSPIRAL_STAIR', 'IFCSTAIRSTRAIGHT_RUN_STAIR', 'IFCSTAIRTHREE_QUARTER_TURN_STAIR', 'IFCSTAIRTHREE_QUARTER_WINDING_STAIR', 'IFCSTAIRTWO_CURVED_RUN_STAIR', 'IFCSTAIRTWO_QUARTER_TURN_STAIR', 'IFCSTAIRTWO_QUARTER_WINDING_STAIR', 'IFCSTAIRTWO_STRAIGHT_RUN_STAIR'],
    props: [
      { name: 'FireExit', type: 'IfcBoolean', description: 'Indication whether this object is designed to serve as an exit in the case of fire (TRUE) or not (FALSE).' },
      { name: 'FireRating', type: 'IfcLabel', description: 'Fire rating for this object. It is given according to the national fire safety classification.' },
      { name: 'HandicapAccessible', type: 'IfcBoolean', description: 'Indication that this object is designed to be accessible by the handicapped. Set to (TRUE) if this object is rated as ha' },
      { name: 'HasNonSkidSurface', type: 'IfcBoolean', description: 'Indication whether the surface finish is designed to prevent slippery (TRUE) or not (FALSE).' },
      { name: 'IsExternal', type: 'IfcBoolean', description: 'Indication whether the element is designed for use in the exterior (TRUE) or not (FALSE). If (TRUE) it is an external el' },
      { name: 'LoadBearing', type: 'IfcBoolean', description: 'Indicates whether the object is intended to carry loads (TRUE) or not (FALSE).' },
      { name: 'NosingLength', type: 'IfcReal', description: 'Horizontal distance from the front of the tread to the riser underneath. It is the overhang of the tread.' },
      { name: 'NumberOfRiser', type: 'IfcInteger', description: 'Total number of the risers included in the stair or stair flight.' },
      { name: 'NumberOfTreads', type: 'IfcInteger', description: 'Total number of treads included in the stair or stairflight.' },
      { name: 'RequiredHeadroom', type: 'IfcReal', description: 'Required headroom clearance for the passageway according to the applicable building code or additional requirements.' },
      { name: 'RiserHeight', type: 'IfcReal', description: 'Vertical distance from tread to tread.; The riser height is supposed to be equal for all steps of a stair or stair fligh' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'ThermalTransmittance', type: 'IfcReal', description: 'Thermal transmittance coefficient (U-Value) of an element, within the direction of the thermal flow (including all mater' },
      { name: 'TreadLength', type: 'IfcReal', description: 'Horizontal distance from the front of the thread to the front of the next tread.; The tread length is supposed to be equ' },
      { name: 'TreadLengthAtInnerSide', type: 'IfcReal', description: 'Minimum length of treads at the inner side of the winder.; Only relevant in case of winding flights, for straight flight' },
      { name: 'TreadLengthAtOffset', type: 'IfcReal', description: 'Length of treads at a given offset.; Walking line position is given by the \\\'WalkingLineOffset\\\'. The resulting value shou' },
      { name: 'WaistThickness', type: 'IfcReal', description: 'Minimum thickness of the stair flight, measured perpendicular to the slope of the flight to the inner corner of riser an' },
      { name: 'WalkingLineOffset', type: 'IfcReal', description: 'Offset of the walking line from the inner side of the flight.;the walking line may have a own shape representation (in c' },
    ],
  },

  'Pset_StairFlightCommon': {
    label:       'Property Set: Stair Flight Common',
    description: 'Properties common to the definition of all occurrences of [[IfcStairFlight]].',
    applicableTo: ['IFCSTAIRFLIGHT', 'IFCSTAIRFLIGHTCURVED', 'IFCSTAIRFLIGHTFREEFORM', 'IFCSTAIRFLIGHTSPIRAL', 'IFCSTAIRFLIGHTSTRAIGHT', 'IFCSTAIRFLIGHTWINDER'],
    props: [
      { name: 'Headroom', type: 'IfcReal', description: 'Actual headroom clearance for the passageway according to the current design.; The shape information is provided in addi' },
      { name: 'NosingLength', type: 'IfcReal', description: 'Horizontal distance from the front of the tread to the riser underneath. It is the overhang of the tread.' },
      { name: 'NumberOfRiser', type: 'IfcInteger', description: 'Total number of the risers included in the stair or stair flight.' },
      { name: 'NumberOfTreads', type: 'IfcInteger', description: 'Total number of treads included in the stair or stairflight.' },
      { name: 'RiserHeight', type: 'IfcReal', description: 'Vertical distance from tread to tread.; The riser height is supposed to be equal for all steps of a stair or stair fligh' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'TreadLength', type: 'IfcReal', description: 'Horizontal distance from the front of the thread to the front of the next tread.; The tread length is supposed to be equ' },
      { name: 'TreadLengthAtInnerSide', type: 'IfcReal', description: 'Minimum length of treads at the inner side of the winder.; Only relevant in case of winding flights, for straight flight' },
      { name: 'TreadLengthAtOffset', type: 'IfcReal', description: 'Length of treads at a given offset.; Walking line position is given by the \\\'WalkingLineOffset\\\'. The resulting value shou' },
      { name: 'WaistThickness', type: 'IfcReal', description: 'Minimum thickness of the stair flight, measured perpendicular to the slope of the flight to the inner corner of riser an' },
      { name: 'WalkingLineOffset', type: 'IfcReal', description: 'Offset of the walking line from the inner side of the flight.;the walking line may have a own shape representation (in c' },
    ],
  },

  'Pset_Stationing': {
    label:       'Property Set: Stationing',
    description: 'Specifies stationing parameters for [[IfcReferent]].',
    applicableTo: ['IFCREFERENT', 'IFCREFERENTBOUNDARY', 'IFCREFERENTINTERSECTION', 'IFCREFERENTKILOPOINT', 'IFCREFERENTLANDMARK', 'IFCREFERENTMILEPOINT', 'IFCREFERENTPOSITION', 'IFCREFERENTREFERENCEMARKER', 'IFCREFERENTSTATION', 'IFCREFERENTSUPERELEVATIONEVENT', 'IFCREFERENTWIDTHEVENT'],
    props: [
      { name: 'HasIncreasingStation', type: 'IfcBoolean', description: 'Inform on the increasing or decreasing progress of stationing values, for referents nested in a given alignment.If prese' },
      { name: 'IncomingStation', type: 'IfcReal', description: 'The optional station value of the incoming segment that ends at this location. This value needs to be set if the intenti' },
      { name: 'Station', type: 'IfcReal', description: 'The station value at this location.' },
    ],
  },

  'Pset_StructuralSurfaceMemberVaryingThickness': {
    label:       'Property Set: Structural Surface Member Varying Thickness',
    description: '[[Thickness]] parameters of a surface member (structural analysis item) with varying thickness, particularly with linearly varying thickness. The thickness is interpolated/ extrapo',
    applicableTo: ['IFCSTRUCTURALSURFACEMEMBERVARYING'],
    props: [
      { name: 'Location1Global', type: 'IfcReal', description: 'Global X,Y,Z coordinates of the point in which Thickness1 is given' },
      { name: 'Location1Local', type: 'IfcReal', description: 'Local x,y coordinates of the point in which Thickness1 is given' },
      { name: 'Location2Global', type: 'IfcReal', description: 'Global X,Y,Z coordinates of the point in which Thickness2 is given' },
      { name: 'Location2Local', type: 'IfcReal', description: 'Local x,y coordinates of the point in which Thickness2 is given' },
      { name: 'Location3Global', type: 'IfcReal', description: 'Global X,Y,Z coordinates of the point in which Thickness3 is given' },
      { name: 'Location3Local', type: 'IfcReal', description: 'Local x,y coordinates of the point in which Thickness3 is given' },
      { name: 'Thickness1', type: 'IfcReal', description: 'First thickness parameter of a surface member with varying thickness' },
      { name: 'Thickness2', type: 'IfcReal', description: 'Second thickness parameter of a surface member with varying thickness' },
      { name: 'Thickness3', type: 'IfcReal', description: 'Third thickness parameter of a surface member with varying thickness' },
    ],
  },

  'Pset_SumpBusterCommon': {
    label:       'Property Set: Sump Buster Common',
    description: 'Properties for a sump buster.',
    applicableTo: ['IFCELEMENTASSEMBLYSUMPBUSTER'],
    props: [
      { name: 'TypeDesignation', type: 'IfcLabel', description: 'Type designator for the element. The content depends on local standards. Eg. \\\'Bull nose\\\', \\\'Half batter\\\', \\\'Dropper\\\', \\\'Cha' },
    ],
  },

  'Pset_Superelevation': {
    label:       'Property Set: Superelevation',
    description: 'Specifies the general properties for a [[Superelevation]] event.',
    applicableTo: ['IFCREFERENTSUPERELEVATIONEVENT'],
    props: [
      { name: 'Side', type: 'IfcLabel', description: 'Specifies if the width is measured to the RIGHT or to the LEFT of the curve referenced by the placement, or if the same' },
      { name: 'Superelevation', type: 'IfcReal', description: 'Specifies the superelevation as a ratio measure (slope) at the location of the event.' },
      { name: 'TransitionSuperelevation', type: 'IfcLabel', description: 'The type of transition of superelevation from previous event to this one.' },
    ],
  },

  'Pset_SwitchingDeviceTypeCommon': {
    label:       'Property Set: Switching Device Type Common',
    description: 'A switching device is a device designed to make or break the current in one or more electric circuits.',
    applicableTo: ['IFCSWITCHINGDEVICE', 'IFCSWITCHINGDEVICECONTACTOR', 'IFCSWITCHINGDEVICEDIMMERSWITCH', 'IFCSWITCHINGDEVICEEMERGENCYSTOP', 'IFCSWITCHINGDEVICEKEYPAD', 'IFCSWITCHINGDEVICEMOMENTARYSWITCH', 'IFCSWITCHINGDEVICERELAY', 'IFCSWITCHINGDEVICESELECTORSWITCH', 'IFCSWITCHINGDEVICESTARTER', 'IFCSWITCHINGDEVICESTART_AND_STOP_EQUIPMENT', 'IFCSWITCHINGDEVICESWITCHDISCONNECTOR', 'IFCSWITCHINGDEVICETOGGLESWITCH'],
    props: [
      { name: 'HasLock', type: 'IfcBoolean', description: 'Indication of whether a switching device has a key operated lock (=TRUE) or not (= FALSE).' },
      { name: 'IsIlluminated', type: 'IfcBoolean', description: 'An indication of whether there is an illuminated indicator to show that the switch is on (=TRUE) or not (= FALSE).' },
      { name: 'Legend', type: 'IfcLabel', description: 'A text inscribed or applied to the switch as a legend to indicate purpose or function.' },
      { name: 'NumberOfGangs', type: 'IfcInteger', description: 'Number of gangs in the object.' },
      { name: 'SetPoint', type: 'IfcTimeSeries', description: 'Indicates the setpoint and label.' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'SwitchFunction', type: 'IfcLabel', description: 'Indicates types of switches which differs in functionality.' },
    ],
  },

  'Pset_SwitchingDeviceTypeContactor': {
    label:       'Property Set: Switching Device Type Contactor',
    description: 'An electrical device used to control the flow of power in a circuit on or off.',
    applicableTo: ['IFCSWITCHINGDEVICECONTACTOR'],
    props: [
      { name: 'ContactorType', type: 'IfcLabel', description: 'for switching 3 phase single or multi-step capacitor banks.;requires the use of low resistance contacts.;enables the con' },
    ],
  },

  'Pset_SwitchingDeviceTypeDimmerSwitch': {
    label:       'Property Set: Switching Device Type Dimmer Switch',
    description: 'A dimmer switch is a switch that adjusts electrical power through a variable position level action.',
    applicableTo: ['IFCSWITCHINGDEVICEDIMMERSWITCH'],
    props: [
      { name: 'DimmerType', type: 'IfcLabel', description: 'A list of the available types of dimmer switch from which that required may be selected.' },
    ],
  },

  'Pset_SwitchingDeviceTypeEmergencyStop': {
    label:       'Property Set: Switching Device Type Emergency Stop',
    description: 'An emergency stop device acts to remove as quickly as possible any danger that may have arisen unexpectedly.',
    applicableTo: ['IFCSWITCHINGDEVICEEMERGENCYSTOP'],
    props: [
      { name: 'BreakingCapacity', type: 'IfcReal', description: 'The current that a fuse, circuit breaker, or other electrical apparatus is able to interrupt without being destroyed or' },
      { name: 'NominalCurrent', type: 'IfcReal', description: 'The nominal current that is designed to be measured.' },
      { name: 'NumberOfAffectedPoles', type: 'IfcInteger', description: 'Number of poles that the equipment affects.' },
      { name: 'NumberOfEarthFaultRelays', type: 'IfcInteger', description: 'Indicates the number of relays used for preventing earth fault.' },
      { name: 'NumberOfEmergencyButtons', type: 'IfcInteger', description: 'The number of emergency buttons built in the device.' },
      { name: 'NumberOfOverCurrentRelays', type: 'IfcInteger', description: 'Indicates number of relays used for preventing over current.' },
      { name: 'NumberOfPhases', type: 'IfcInteger', description: 'Number of phases that the equipment operates on.' },
      { name: 'NumberOfRelays', type: 'IfcInteger', description: 'Indicates number of relays built in the device.' },
      { name: 'RatedFrequency', type: 'IfcReal', description: 'Frequency of the AC electric power supply when the device or system reaches its optimum operating condition.' },
      { name: 'RatedVoltage', type: 'IfcReal', description: 'The range of allowed voltage that a device is certified to handle. The upper bound of this value is the maximum.' },
      { name: 'ReferenceEnvironmentTemperature', type: 'IfcReal', description: 'Ideal temperature range.' },
      { name: 'SwitchOperation', type: 'IfcLabel', description: 'Indicates operation of emergency stop switch.' },
      { name: 'TransformationRatio', type: 'IfcReal', description: 'The ratio of the actual primary current or voltage to the actual secondary current or voltage.' },
    ],
  },

  'Pset_SwitchingDeviceTypeKeypad': {
    label:       'Property Set: Switching Device Type Keypad',
    description: 'A keypad is a switch supporting multiple functions.',
    applicableTo: ['IFCSWITCHINGDEVICEKEYPAD'],
    props: [
      { name: 'KeypadType', type: 'IfcLabel', description: 'A list of the available types of keypad switch from which that required may be selected.' },
    ],
  },

  'Pset_SwitchingDeviceTypeMomentarySwitch': {
    label:       'Property Set: Switching Device Type Momentary Switch',
    description: 'A momentary switch is a switch that does not hold state.',
    applicableTo: ['IFCSWITCHINGDEVICEMOMENTARYSWITCH'],
    props: [
      { name: 'MomentaryType', type: 'IfcLabel', description: 'A list of the available types of momentary switch from which that required may be selected.' },
    ],
  },

  'Pset_SwitchingDeviceTypePHistory': {
    label:       'Property Set: Switching Device Type Phistory',
    description: 'Indicates switch positions or levels over time, such as for energy management or surveillance.',
    applicableTo: ['IFCSWITCHINGDEVICE', 'IFCSWITCHINGDEVICECONTACTOR', 'IFCSWITCHINGDEVICEDIMMERSWITCH', 'IFCSWITCHINGDEVICEEMERGENCYSTOP', 'IFCSWITCHINGDEVICEKEYPAD', 'IFCSWITCHINGDEVICEMOMENTARYSWITCH', 'IFCSWITCHINGDEVICERELAY', 'IFCSWITCHINGDEVICESELECTORSWITCH', 'IFCSWITCHINGDEVICESTARTER', 'IFCSWITCHINGDEVICESTART_AND_STOP_EQUIPMENT', 'IFCSWITCHINGDEVICESWITCHDISCONNECTOR', 'IFCSWITCHINGDEVICETOGGLESWITCH'],
    props: [
      { name: 'SetPointHistory', type: 'IfcTimeSeries', description: 'Indicates the switch position over time according to Pset_SwitchingDeviceTypeCommon.SetPoint.' },
    ],
  },

  'Pset_SwitchingDeviceTypeRelay': {
    label:       'Property Set: Switching Device Type Relay',
    description: 'Properties in this property set are applicable for [[IfcSwitchingDevice]] with PredefinedType RELAY.',
    applicableTo: ['IFCSWITCHINGDEVICERELAY'],
    props: [
      { name: 'ContactResistance', type: 'IfcReal', description: 'Resistance when electrical node is closed.' },
      { name: 'Current', type: 'IfcReal', description: 'The actual current and operable range.' },
      { name: 'InsulationResistance', type: 'IfcReal', description: 'Minimum resistance between one terminal or several terminals connected together and the case or enclosure of a component' },
      { name: 'NominalHeight', type: 'IfcReal', description: 'The nominal height of the object. The size information is provided in addition to the shape representation and the geome' },
      { name: 'NominalLength', type: 'IfcReal', description: 'The nominal overall length of the object. The size information is provided in addition to the shape representation and t' },
      { name: 'NominalWidth', type: 'IfcReal', description: 'The nominal overall width of the object. The size information is provided in addition to the shape representation and th' },
      { name: 'PullInVoltage', type: 'IfcReal', description: 'Working voltage of relay in excitation state.' },
      { name: 'ReleaseVoltage', type: 'IfcReal', description: 'The maximum voltage to guarantee the drop of the relay node.' },
      { name: 'Voltage', type: 'IfcReal', description: 'The actual voltage and operable range.' },
    ],
  },

  'Pset_SwitchingDeviceTypeSelectorSwitch': {
    label:       'Property Set: Switching Device Type Selector Switch',
    description: 'A selector switch is a switch that adjusts electrical power through a multi-position action.',
    applicableTo: ['IFCSWITCHINGDEVICESELECTORSWITCH'],
    props: [
      { name: 'NominalCurrent', type: 'IfcReal', description: 'The nominal current that is designed to be measured.' },
      { name: 'NominalPower', type: 'IfcReal', description: 'A conventional value of apparent power determining a value of the rated current that may be carried with rated voltage a' },
      { name: 'NumberOfPhases', type: 'IfcInteger', description: 'Number of phases that the equipment operates on.' },
      { name: 'RatedFrequency', type: 'IfcReal', description: 'Frequency of the AC electric power supply when the device or system reaches its optimum operating condition.' },
      { name: 'ReferenceEnvironmentTemperature', type: 'IfcReal', description: 'Ideal temperature range.' },
      { name: 'SelectorType', type: 'IfcLabel', description: 'A list of the available types of selector switch from which that required may be selected.' },
      { name: 'SwitchActivation', type: 'IfcLabel', description: 'A list of the available activations for switches from which that required may be selected.' },
      { name: 'SwitchUsage', type: 'IfcLabel', description: 'A list of the available usages for switches from which that required may be selected.' },
    ],
  },

  'Pset_SwitchingDeviceTypeStarter': {
    label:       'Property Set: Switching Device Type Starter',
    description: 'A starter is a switch which in the closed position controls the application of power to an electrical device.',
    applicableTo: ['IFCSWITCHINGDEVICESTARTER'],
    props: [
      { name: 'StarterType', type: 'IfcLabel', description: 'A starter for an induction motor which uses for starting one or more reduced voltages derived from an auto transformer.' },
    ],
  },

  'Pset_SwitchingDeviceTypeSwitchDisconnector': {
    label:       'Property Set: Switching Device Type Switch Disconnector',
    description: 'A switch disconnector is a switch which in the open position satisfies the isolating requirements specified for a disconnector.',
    applicableTo: ['IFCSWITCHINGDEVICESWITCHDISCONNECTOR'],
    props: [
      { name: 'LoadDisconnectionType', type: 'IfcLabel', description: 'A list of the available types of load disconnection from which that required may be selected.' },
      { name: 'SwitchDisconnectorType', type: 'IfcLabel', description: 'A disconnector in which both contacts of each pole are movable and engage at a point substantially midway between their' },
    ],
  },

  'Pset_SwitchingDeviceTypeToggleSwitch': {
    label:       'Property Set: Switching Device Type Toggle Switch',
    description: 'A toggle switch is a switch that enables or isolates electrical power through a two position on/off action.',
    applicableTo: ['IFCSWITCHINGDEVICETOGGLESWITCH'],
    props: [
      { name: 'SwitchActivation', type: 'IfcLabel', description: 'A list of the available activations for switches from which that required may be selected.' },
      { name: 'SwitchUsage', type: 'IfcLabel', description: 'A list of the available usages for switches from which that required may be selected.' },
      { name: 'ToggleSwitchType', type: 'IfcLabel', description: 'A list of the available types of toggle switch from which that required may be selected.' },
    ],
  },

  'Pset_SymmetricPairCable': {
    label:       'Property Set: Symmetric Pair Cable',
    description: 'Properties applicable to a symmetric pair cable, which is is a copper cable with a variable number of copper twisted symmetric pair conductors used to transmit data by means of ele',
    applicableTo: ['IFCCABLESEGMENTCABLESEGMENT'],
    props: [
      { name: 'NumberOfTwistedPairs', type: 'IfcInteger', description: 'Total number of twisted wire pairs in copper pair cables.' },
      { name: 'NumberOfUntwistedPairs', type: 'IfcInteger', description: 'Total number of untwisted wire pairs in the copper pair cable.' },
    ],
  },

  'Pset_SystemFurnitureElementTypeCommon': {
    label:       'Property Set: System Furniture Element Type Common',
    description: 'Common properties for all systems furniture (I.e. modular furniture) element types (e.g. vertical panels, work surfaces, and storage).',
    applicableTo: ['IFCSYSTEMFURNITUREELEMENT', 'IFCSYSTEMFURNITUREELEMENTPANEL', 'IFCSYSTEMFURNITUREELEMENTSUBRACK', 'IFCSYSTEMFURNITUREELEMENTWORKSURFACE'],
    props: [
      { name: 'Finishing', type: 'IfcLabel', description: 'The finishing applied to system furniture elements of this type e.g. walnut, fabric.' },
      { name: 'GroupCode', type: 'IfcLabel', description: 'e.g. panels, worksurfaces, storage, etc.' },
      { name: 'IsUsed', type: 'IfcBoolean', description: 'Indicates whether the element is being used in a workstation (= TRUE) or not.(= FALSE).' },
      { name: 'NominalHeight', type: 'IfcReal', description: 'The nominal height of the object. The size information is provided in addition to the shape representation and the geome' },
      { name: 'NominalWidth', type: 'IfcReal', description: 'The nominal overall width of the object. The size information is provided in addition to the shape representation and th' },
    ],
  },

  'Pset_SystemFurnitureElementTypePanel': {
    label:       'Property Set: System Furniture Element Type Panel',
    description: 'A set of specific properties for vertical panels that assembly workstations.',
    applicableTo: ['IFCSYSTEMFURNITUREELEMENTPANEL'],
    props: [
      { name: 'FurniturePanelType', type: 'IfcLabel', description: 'Available panel types from which that required may be selected.' },
      { name: 'HasOpening', type: 'IfcBoolean', description: 'indicates whether the panel has an opening (= TRUE) or not (= FALSE).' },
      { name: 'NominalThickness', type: 'IfcReal', description: 'The nominal thickness of the object. The size information is provided in addition to the shape representation and the ge' },
    ],
  },

  'Pset_SystemFurnitureElementTypeSubrack': {
    label:       'Property Set: System Furniture Element Type Subrack',
    description: 'Properties of subrack used in railway telecom. The property set can be used by the predefined type SUBRACK of [[IfcSystemFurnitureElement]]',
    applicableTo: ['IFCSYSTEMFURNITUREELEMENTSUBRACK'],
    props: [
      { name: 'NumberOfOccupiedUnits', type: 'IfcInteger', description: 'Indicates the number of vertical units occupied by the equipment.' },
      { name: 'NumberOfSlots', type: 'IfcInteger', description: 'Indicates the number of slots.' },
      { name: 'NumberOfUnits', type: 'IfcInteger', description: 'Indicates the number of vertical units.' },
    ],
  },

  'Pset_SystemFurnitureElementTypeWorkSurface': {
    label:       'Property Set: System Furniture Element Type Work Surface',
    description: 'A set of specific properties for work surfaces used in workstations.',
    applicableTo: ['IFCSYSTEMFURNITUREELEMENTWORKSURFACE'],
    props: [
      { name: 'HangingHeight', type: 'IfcReal', description: 'The hanging height of the worksurface.' },
      { name: 'NominalThickness', type: 'IfcReal', description: 'The nominal thickness of the object. The size information is provided in addition to the shape representation and the ge' },
      { name: 'ShapeDescription', type: 'IfcLabel', description: 'A description of the shape of the work surface e.g. corner square, rectangle, etc.' },
      { name: 'SupportType', type: 'IfcLabel', description: 'Available support types from which that required may be selected.' },
      { name: 'UsePurpose', type: 'IfcLabel', description: 'The principal purpose for which the work surface is intended to be used e.g. writing/reading, computer, meeting, printer' },
    ],
  },

  'Pset_TankOccurrence': {
    label:       'Property Set: Tank Occurrence',
    description: 'Properties that relate to a tank. Note that a partial tank may be considered as a compartment within a compartmentalized tank.',
    applicableTo: ['IFCTANK', 'IFCTANKBASIN', 'IFCTANKBREAKPRESSURE', 'IFCTANKEXPANSION', 'IFCTANKFEEDANDEXPANSION', 'IFCTANKOILRETENTIONTRAY', 'IFCTANKPRESSUREVESSEL', 'IFCTANKSTORAGE', 'IFCTANKVESSEL'],
    props: [
      { name: 'HasLadder', type: 'IfcBoolean', description: 'Indication of whether the tank is provided with a ladder (set TRUE) for access to the top. If no ladder is provided then' },
      { name: 'HasVisualIndicator', type: 'IfcBoolean', description: 'Indication of whether the tank is provided with a visual indicator (set TRUE) that shows the water level in the tank. If' },
      { name: 'TankComposition', type: 'IfcLabel', description: 'Defines the level of element composition where.A set of elementary units aggregated together to fulfill the overall requ' },
    ],
  },

  'Pset_TankTypeCommon': {
    label:       'Property Set: Tank Type Common',
    description: 'Common attributes of a tank type.',
    applicableTo: ['IFCTANK', 'IFCTANKBASIN', 'IFCTANKBREAKPRESSURE', 'IFCTANKEXPANSION', 'IFCTANKFEEDANDEXPANSION', 'IFCTANKOILRETENTIONTRAY', 'IFCTANKPRESSUREVESSEL', 'IFCTANKSTORAGE', 'IFCTANKVESSEL'],
    props: [
      { name: 'AccessType', type: 'IfcLabel', description: 'Defines the types of access (or cover) to a tank that may be specified.Note that covers are generally specified for rect' },
      { name: 'EffectiveCapacity', type: 'IfcReal', description: 'The total effective or actual volumetric capacity of the tank.' },
      { name: 'EndShapeType', type: 'IfcLabel', description: 'Defines the types of end shapes that can be used for preformed tanks. The convention for reading these enumerated values' },
      { name: 'FirstCurvatureRadius', type: 'IfcReal', description: 'FirstCurvatureRadius should be defined as the base or left side radius of curvature value.' },
      { name: 'NominalDepth', type: 'IfcReal', description: 'Nominal Depth of the object' },
      { name: 'NominalLengthOrDiameter', type: 'IfcReal', description: 'The nominal length or, in the case of a vertical cylindrical tank, the nominal diameter of the tank.' },
      { name: 'NominalWidthOrDiameter', type: 'IfcReal', description: 'The nominal width or, in the case of a horizontal cylindrical tank, the nominal diameter of the tank.Not required for a' },
      { name: 'NumberOfSections', type: 'IfcInteger', description: 'Number of sections.' },
      { name: 'OperatingWeight', type: 'IfcReal', description: 'Operating weight of the tank including all of its contents.' },
      { name: 'PatternType', type: 'IfcLabel', description: 'Defines the types of pattern (or shape of a tank that may be specified.' },
      { name: 'SecondCurvatureRadius', type: 'IfcReal', description: 'SecondCurvatureRadius should be defined as the top or right side radius of curvature value.' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'StorageType', type: 'IfcLabel', description: 'Defines the general material category intended to be stored.' },
      { name: 'TankNominalCapacity', type: 'IfcReal', description: 'The total nominal or design volumetric capacity of the tank.' },
    ],
  },

  'Pset_TankTypeExpansion': {
    label:       'Property Set: Tank Type Expansion',
    description: 'Common attributes of an expansion type tank.',
    applicableTo: ['IFCTANKEXPANSION'],
    props: [
      { name: 'ChargePressure', type: 'IfcReal', description: 'Nominal or design operating pressure of the tank.' },
      { name: 'PressureRegulatorSetting', type: 'IfcReal', description: 'Pressure that is automatically maintained in the tank.' },
      { name: 'ReliefValveSetting', type: 'IfcReal', description: 'Pressure at which the relief valve activates.' },
    ],
  },

  'Pset_TankTypePreformed': {
    label:       'Property Set: Tank Type Preformed',
    description: 'Fixed vessel manufactured as a single unit with one or more compartments for storing a liquid.',
    applicableTo: ['IFCTANK', 'IFCTANKBASIN', 'IFCTANKBREAKPRESSURE', 'IFCTANKEXPANSION', 'IFCTANKFEEDANDEXPANSION', 'IFCTANKOILRETENTIONTRAY', 'IFCTANKPRESSUREVESSEL', 'IFCTANKSTORAGE', 'IFCTANKVESSEL'],
    props: [
      { name: 'EndShapeType', type: 'IfcLabel', description: 'Defines the types of end shapes that can be used for preformed tanks. The convention for reading these enumerated values' },
      { name: 'FirstCurvatureRadius', type: 'IfcReal', description: 'FirstCurvatureRadius should be defined as the base or left side radius of curvature value.' },
      { name: 'PatternType', type: 'IfcLabel', description: 'Defines the types of pattern (or shape of a tank that may be specified.' },
      { name: 'SecondCurvatureRadius', type: 'IfcReal', description: 'SecondCurvatureRadius should be defined as the top or right side radius of curvature value.' },
    ],
  },

  'Pset_TankTypePressureVessel': {
    label:       'Property Set: Tank Type Pressure Vessel',
    description: 'Common attributes of a pressure vessel.',
    applicableTo: ['IFCTANKPRESSUREVESSEL'],
    props: [
      { name: 'ChargePressure', type: 'IfcReal', description: 'Nominal or design operating pressure of the tank.' },
      { name: 'PressureRegulatorSetting', type: 'IfcReal', description: 'Pressure that is automatically maintained in the tank.' },
      { name: 'ReliefValveSetting', type: 'IfcReal', description: 'Pressure at which the relief valve activates.' },
    ],
  },

  'Pset_TankTypeSectional': {
    label:       'Property Set: Tank Type Sectional',
    description: 'Fixed vessel constructed from sectional parts with one or more compartments for storing a liquid.',
    applicableTo: ['IFCTANK', 'IFCTANKBASIN', 'IFCTANKBREAKPRESSURE', 'IFCTANKEXPANSION', 'IFCTANKFEEDANDEXPANSION', 'IFCTANKOILRETENTIONTRAY', 'IFCTANKPRESSUREVESSEL', 'IFCTANKSTORAGE', 'IFCTANKVESSEL'],
    props: [
      { name: 'NumberOfSections', type: 'IfcInteger', description: 'Number of sections.' },
      { name: 'SectionLength', type: 'IfcReal', description: 'The length of a section used in the construction of the tank.' },
      { name: 'SectionWidth', type: 'IfcReal', description: 'The width of a section used in the construction of the tank.' },
    ],
  },

  'Pset_TelecomCableGeneral': {
    label:       'Property Set: Telecom Cable General',
    description: 'Properties common to occurrences and types of [[IfcCableSegment]] and [[IfcCableFitting]] applied in telecommunication domain.',
    applicableTo: ['IFCCABLEFITTING', 'IFCCABLEFITTINGCONNECTOR', 'IFCCABLEFITTINGENTRY', 'IFCCABLEFITTINGEXIT', 'IFCCABLEFITTINGFANOUT', 'IFCCABLEFITTINGJUNCTION', 'IFCCABLEFITTINGTRANSITION', 'IFCCABLESEGMENT', 'IFCCABLESEGMENTBUSBARSEGMENT', 'IFCCABLESEGMENTCABLESEGMENT', 'IFCCABLESEGMENTCONDUCTORSEGMENT', 'IFCCABLESEGMENTCONTACTWIRESEGMENT', 'IFCCABLESEGMENTCORESEGMENT', 'IFCCABLESEGMENTFIBERSEGMENT', 'IFCCABLESEGMENTFIBERTUBE', 'IFCCABLESEGMENTOPTICALCABLESEGMENT', 'IFCCABLESEGMENTSTITCHWIRE', 'IFCCABLESEGMENTWIREPAIRSEGMENT'],
    props: [
      { name: 'Attenuation', type: 'IfcReal', description: 'Indicates the optical or electrical attenuation of the cable measured in dB, at a certain wavelength or frequency, chang' },
      { name: 'CableArmourType', type: 'IfcLabel', description: 'The armour type of the cable for mechanical protection.' },
      { name: 'CableFunctionType', type: 'IfcLabel', description: 'Distinguishes between Telecom and Power Supply cables.' },
      { name: 'FireRating', type: 'IfcLabel', description: 'Fire rating for this object. It is given according to the national fire safety classification.' },
      { name: 'IsFireResistant', type: 'IfcBoolean', description: 'Indicates whether the cable is fire resistant.' },
      { name: 'JacketColour', type: 'IfcLabel', description: 'Indicates the colour of the cable or fitting jacket.' },
      { name: 'NominalDiameter', type: 'IfcReal', description: 'Nominal diameter or width of the object.' },
    ],
  },

  'Pset_ThermalLoad': {
    label:       'Property Set: Thermal Load',
    description: 'Properties for thermal loads of elements.',
    applicableTo: ['IFCBRIDGE', 'IFCBRIDGEARCHED', 'IFCBRIDGECABLE_STAYED', 'IFCBRIDGECANTILEVER', 'IFCBRIDGECULVERT', 'IFCBRIDGEFRAMEWORK', 'IFCBRIDGEGIRDER', 'IFCBRIDGEPART', 'IFCBRIDGEPARTABUTMENT', 'IFCBRIDGEPARTDECK', 'IFCBRIDGEPARTDECK_SEGMENT', 'IFCBRIDGEPARTFOUNDATION', 'IFCBRIDGEPARTPIER', 'IFCBRIDGEPARTPIER_SEGMENT', 'IFCBRIDGEPARTPYLON', 'IFCBRIDGEPARTSUBSTRUCTURE', 'IFCBRIDGEPARTSUPERSTRUCTURE', 'IFCBRIDGEPARTSURFACESTRUCTURE', 'IFCBRIDGESUSPENSION', 'IFCBRIDGETRUSS', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCEXTERNALSPATIALELEMENT', 'IFCEXTERNALSPATIALELEMENTEXTERNAL', 'IFCEXTERNALSPATIALELEMENTEXTERNAL_EARTH', 'IFCEXTERNALSPATIALELEMENTEXTERNAL_FIRE', 'IFCEXTERNALSPATIALELEMENTEXTERNAL_WATER', 'IFCEXTERNALSPATIALSTRUCTUREELEMENT', 'IFCFACILITY', 'IFCFACILITYPART', 'IFCFACILITYPARTCOMMON', 'IFCFACILITYPARTCOMMONABOVEGROUND', 'IFCFACILITYPARTCOMMONBELOWGROUND', 'IFCFACILITYPARTCOMMONJUNCTION', 'IFCFACILITYPARTCOMMONLEVELCROSSING', 'IFCFACILITYPARTCOMMONSEGMENT', 'IFCFACILITYPARTCOMMONSUBSTRUCTURE', 'IFCFACILITYPARTCOMMONSUPERSTRUCTURE', 'IFCFACILITYPARTCOMMONTERMINAL', 'IFCMARINEFACILITY', 'IFCMARINEFACILITYBARRIERBEACH', 'IFCMARINEFACILITYBREAKWATER', 'IFCMARINEFACILITYCANAL', 'IFCMARINEFACILITYDRYDOCK', 'IFCMARINEFACILITYFLOATINGDOCK', 'IFCMARINEFACILITYHYDROLIFT', 'IFCMARINEFACILITYJETTY', 'IFCMARINEFACILITYLAUNCHRECOVERY', 'IFCMARINEFACILITYMARINEDEFENCE', 'IFCMARINEFACILITYNAVIGATIONALCHANNEL', 'IFCMARINEFACILITYPORT', 'IFCMARINEFACILITYQUAY', 'IFCMARINEFACILITYREVETMENT', 'IFCMARINEFACILITYSHIPLIFT', 'IFCMARINEFACILITYSHIPLOCK', 'IFCMARINEFACILITYSHIPYARD', 'IFCMARINEFACILITYSLIPWAY', 'IFCMARINEFACILITYWATERWAY', 'IFCMARINEFACILITYWATERWAYSHIPLIFT', 'IFCMARINEPART', 'IFCMARINEPARTABOVEWATERLINE', 'IFCMARINEPARTANCHORAGE', 'IFCMARINEPARTAPPROACHCHANNEL', 'IFCMARINEPARTBELOWWATERLINE', 'IFCMARINEPARTBERTHINGSTRUCTURE', 'IFCMARINEPARTCHAMBER', 'IFCMARINEPARTCILL_LEVEL', 'IFCMARINEPARTCOPELEVEL', 'IFCMARINEPARTCORE', 'IFCMARINEPARTCREST', 'IFCMARINEPARTGATEHEAD', 'IFCMARINEPARTGUDINGSTRUCTURE', 'IFCMARINEPARTHIGHWATERLINE', 'IFCMARINEPARTLANDFIELD', 'IFCMARINEPARTLEEWARDSIDE', 'IFCMARINEPARTLOWWATERLINE', 'IFCMARINEPARTMANUFACTURING', 'IFCMARINEPARTNAVIGATIONALAREA', 'IFCMARINEPARTPROTECTION', 'IFCMARINEPARTSHIPTRANSFER', 'IFCMARINEPARTSTORAGEAREA', 'IFCMARINEPARTVEHICLESERVICING', 'IFCMARINEPARTWATERFIELD', 'IFCMARINEPARTWEATHERSIDE', 'IFCRAILWAY', 'IFCRAILWAYPART', 'IFCRAILWAYPARTABOVETRACK', 'IFCRAILWAYPARTDILATIONTRACK', 'IFCRAILWAYPARTLINESIDE', 'IFCRAILWAYPARTLINESIDEPART', 'IFCRAILWAYPARTPLAINTRACK', 'IFCRAILWAYPARTSUBSTRUCTURE', 'IFCRAILWAYPARTTRACK', 'IFCRAILWAYPARTTRACKPART', 'IFCRAILWAYPARTTURNOUTTRACK', 'IFCROAD', 'IFCROADPART', 'IFCROADPARTBICYCLECROSSING', 'IFCROADPARTBUS_STOP', 'IFCROADPARTCARRIAGEWAY', 'IFCROADPARTCENTRALISLAND', 'IFCROADPARTCENTRALRESERVE', 'IFCROADPARTHARDSHOULDER', 'IFCROADPARTINTERSECTION', 'IFCROADPARTLAYBY', 'IFCROADPARTPARKINGBAY', 'IFCROADPARTPASSINGBAY', 'IFCROADPARTPEDESTRIAN_CROSSING', 'IFCROADPARTRAILWAYCROSSING', 'IFCROADPARTREFUGEISLAND', 'IFCROADPARTROADSEGMENT', 'IFCROADPARTROADSIDE', 'IFCROADPARTROADSIDEPART', 'IFCROADPARTROADWAYPLATEAU', 'IFCROADPARTROUNDABOUT', 'IFCROADPARTSHOULDER', 'IFCROADPARTSIDEWALK', 'IFCROADPARTSOFTSHOULDER', 'IFCROADPARTTOLLPLAZA', 'IFCROADPARTTRAFFICISLAND', 'IFCROADPARTTRAFFICLANE', 'IFCSITE', 'IFCSPACE', 'IFCSPACEBERTH', 'IFCSPACEEXTERNAL', 'IFCSPACEGFA', 'IFCSPACEINTERNAL', 'IFCSPACEPARKING', 'IFCSPACESPACE', 'IFCSPATIALELEMENT', 'IFCSPATIALSTRUCTUREELEMENT', 'IFCSPATIALZONE', 'IFCSPATIALZONECONSTRUCTION', 'IFCSPATIALZONEFIRESAFETY', 'IFCSPATIALZONEINTERFERENCE', 'IFCSPATIALZONELIGHTING', 'IFCSPATIALZONEOCCUPANCY', 'IFCSPATIALZONERESERVATION', 'IFCSPATIALZONESECURITY', 'IFCSPATIALZONETHERMAL', 'IFCSPATIALZONETRANSPORT', 'IFCSPATIALZONEVENTILATION'],
    props: [
      { name: 'ApplianceDiversity', type: 'IfcReal', description: 'Diversity of appliance load.' },
      { name: 'AppliancePercentLoadToRadiant', type: 'IfcReal', description: 'Percent of sensible load to radiant heat.' },
      { name: 'InfiltrationDiversitySummer', type: 'IfcReal', description: 'Diversity factor for Summer infiltration.' },
      { name: 'InfiltrationDiversityWinter', type: 'IfcReal', description: 'Diversity factor for Winter infiltration.' },
      { name: 'LightingDiversity', type: 'IfcReal', description: 'Lighting diversity.' },
      { name: 'LightingLoadIntensity', type: 'IfcReal', description: 'Average lighting load intensity in the space per unit area (PowerMeasure/IfcAreaMeasure).' },
      { name: 'LightingPercentLoadToReturnAir', type: 'IfcReal', description: 'Percent of lighting load to the return air plenum.' },
      { name: 'LoadSafetyFactor', type: 'IfcReal', description: 'Load safety factor.' },
      { name: 'OccupancyDiversity', type: 'IfcReal', description: 'Diversity factor that may be applied to the number of people in the space.' },
      { name: 'OutsideAirPerPerson', type: 'IfcReal', description: 'Design quantity of outside air to be provided per person in the space.' },
      { name: 'ReceptacleLoadIntensity', type: 'IfcReal', description: 'Average power use intensity of appliances and other non-HVAC equipment in the space per unit area.(PowerMeasure/IfcAreaM' },
      { name: 'TotalCoolingLoad', type: 'IfcReal', description: 'The peak total cooling load for the building, zone or space.' },
      { name: 'TotalHeatingLoad', type: 'IfcReal', description: 'The peak total heating load for the building, zone or space.' },
    ],
  },

  'Pset_TicketProcessing': {
    label:       'Property Set: Ticket Processing',
    description: 'Properties for indicating performance ratings for ticket processing of entry elements (e.g. turnstile, boom barrier).',
    applicableTo: ['IFCDOORBOOM_BARRIER', 'IFCDOORTURNSTILE'],
    props: [
      { name: 'TicketProcessingTime', type: 'IfcReal', description: 'Indicates the processing time of a ticket.' },
      { name: 'TicketStuckRatio', type: 'IfcReal', description: 'Indicates the ratio of tickets being stuck or jammed in the appliance.' },
    ],
  },

  'Pset_TicketVendingMachine': {
    label:       'Property Set: Ticket Vending Machine',
    description: 'Properties of ticket vending machine. The property set can be used by [[IfcElectricAppliance]] with PredefinedType VENDINGMACHINE.',
    applicableTo: ['IFCELECTRICAPPLIANCEVENDINGMACHINE'],
    props: [
      { name: 'MoneyStuckRatio', type: 'IfcReal', description: 'Indicates the ratio of money being stuck or jammed in appliance.' },
      { name: 'PaymentMethod', type: 'IfcLabel', description: 'Indicates the vending machine payment method.' },
      { name: 'TicketProductionSpeed', type: 'IfcInteger', description: 'Indicates the production speed of the ticket. It is measured by counting the number of tickets that can be produced per' },
      { name: 'TicketStuckRatio', type: 'IfcReal', description: 'Indicates the ratio of tickets being stuck or jammed in the appliance.' },
      { name: 'TicketVendingMachineType', type: 'IfcLabel', description: 'Indicates the type of ticket vending machine.' },
      { name: 'VendingMachineUserInterface', type: 'IfcLabel', description: 'Indicates the type of vending machine user interface.' },
    ],
  },

  'Pset_Tiling': {
    label:       'Property Set: Tiling',
    description: 'Properties about tiles.',
    applicableTo: ['IFCCOVERING', 'IFCCOVERINGCEILING', 'IFCCOVERINGCLADDING', 'IFCCOVERINGCOPING', 'IFCCOVERINGFLOORING', 'IFCCOVERINGINSULATION', 'IFCCOVERINGMEMBRANE', 'IFCCOVERINGMOLDING', 'IFCCOVERINGROOFING', 'IFCCOVERINGSKIRTINGBOARD', 'IFCCOVERINGSLEEVING', 'IFCCOVERINGTOPPING', 'IFCCOVERINGWRAPPING', 'IFCPAVEMENT', 'IFCPAVEMENTFLEXIBLE', 'IFCPAVEMENTRIGID'],
    props: [
      { name: 'Permeability', type: 'IfcReal', description: 'Ratio of the permeability of the ceiling.; The ration can be used to indicate an open ceiling (that enables identificati' },
      { name: 'TileLength', type: 'IfcReal', description: 'Length of ceiling tiles. The size information is provided in addition to the shape representation and the geometric para' },
      { name: 'TileWidth', type: 'IfcReal', description: 'Width of ceiling tiles. The size information is provided in addition to the shape representation and the geometric param' },
    ],
  },

  'Pset_Tolerance': {
    label:       'Property Set: Tolerance',
    description: 'Properties expressing the tolerance relating to locating and shaping of an intended element or feature. [[Range]] diameters are non-negative describing a linear, rectangular or box',
    applicableTo: ['*'],
    props: [
      { name: 'ElevationalFlatness', type: 'IfcReal', description: 'Indicative (95%-100%) range flatness associated to the elevational surface in ZX, if different to the overall flatness.' },
      { name: 'HorizontalFlatness', type: 'IfcReal', description: 'Indicative (95%-100%) range flatness associated to the horizontal surface in XY, if different to the overall flatness.' },
      { name: 'HorizontalOrthogonality', type: 'IfcReal', description: 'Indicative (95%-100%) range orthogonality associated to the horizontal shape and orientation in X, if different to the o' },
      { name: 'HorizontalStraightness', type: 'IfcReal', description: 'Indicative (95%-100%) range straightness associated to the horizontal shape in X, if different to the overall straightne' },
      { name: 'HorizontalTolerance', type: 'IfcReal', description: 'Indicative (95%-100%) range tolerance associated to the horizontal shape and position in X, if different to the overall' },
      { name: 'OrthogonalOrthogonality', type: 'IfcReal', description: 'Indicative (95%-100%) range orthogonality associated to the horizontal shape and orientation in Y, if different to the o' },
      { name: 'OrthogonalStraightness', type: 'IfcReal', description: 'Indicative (95%-100%) range straightness associated to the horizontal shape in Y, if different to the overall straightne' },
      { name: 'OrthogonalTolerance', type: 'IfcReal', description: 'Indicative (95%-100%) range tolerance associated to the horizontal shape and position in Y, if different to the overall' },
      { name: 'OverallOrthogonality', type: 'IfcReal', description: 'Indicative (95%-100%) range orthogonality associated to the intended shape and orientation in XYZ.' },
      { name: 'OverallStraightness', type: 'IfcReal', description: 'Indicative (95%-100%) range straightness associated to the intended shape.' },
      { name: 'OverallTolerance', type: 'IfcReal', description: 'Indicative (95%-100%) range tolerance associated to the intended shape and position in XYZ.' },
      { name: 'PlanarFlatness', type: 'IfcReal', description: 'Indicative (95%-100%) range flatness associated to the intended shape and position in XYZ.' },
      { name: 'SideFlatness', type: 'IfcReal', description: 'Indicative (95%-100%) range flatness associated to the side surface in YZ, if different to the overall flatness.' },
      { name: 'ToleranceBasis', type: 'IfcLabel', description: 'Indication of the basis of the tolerance requirement' },
      { name: 'ToleranceDescription', type: 'IfcLabel', description: 'General description of the tolerance associated to the element or feature, its source and implications.' },
      { name: 'VerticalOrthogonality', type: 'IfcReal', description: 'Indicative (95%-100%) range orthogonality associated to the vertical shape and orientation in Z, if different to the ove' },
      { name: 'VerticalStraightness', type: 'IfcReal', description: 'Indicative (95%-100%) range straightness associated to the vertical shape in Z, if different to the overall straightness' },
      { name: 'VerticalTolerance', type: 'IfcReal', description: 'Indicative (95%-100%) range tolerance associated to the vertical shape and position in Z, if different to the overall to' },
    ],
  },

  'Pset_TrackBase': {
    label:       'Property Set: Track Base',
    description: 'Properties in this property set are applicable for [[IfcSlab]] with PredefinedType BASESLAB, indicated that the base slab is a track base slab.',
    applicableTo: ['IFCSLABBASESLAB'],
    props: [
      { name: 'IsSurfaceGalling', type: 'IfcBoolean', description: 'Indicates whether the surface is galling or not.' },
      { name: 'SurfaceGallingArea', type: 'IfcReal', description: 'The galling area of the object surface.' },
    ],
  },

  'Pset_TrackElementOccurrenceSleeper': {
    label:       'Property Set: Track Element Occurrence Sleeper',
    description: 'Properties common to the definition to all occurrences of [[IfcTrackElement]] with PredefinedType set to SLEEPER.',
    applicableTo: ['IFCTRACKELEMENTSLEEPER'],
    props: [
      { name: 'HasSpecialEquipment', type: 'IfcBoolean', description: 'Indicates whether the sleeper has any special equipment for fastening components (e.g. Balise, signum magnet) or not.' },
      { name: 'IsContaminatedSleeper', type: 'IfcBoolean', description: 'Indicates whether the sleeper is contaminated and requires special disposal or not.' },
      { name: 'SequenceInTrackPanel', type: 'IfcInteger', description: 'Sequence of the sleeper within the track panel.' },
      { name: 'UnderSleeperPadStiffness', type: 'IfcLabel', description: 'Indicates the stiffness of the under-sleeper pad as design reference for the sleeper.' },
    ],
  },

  'Pset_TrackElementPHistoryDerailer': {
    label:       'Property Set: Track Element Phistory Derailer',
    description: 'Indicates derailer information over time for operation management.',
    applicableTo: ['IFCTRACKELEMENTDERAILER'],
    props: [
      { name: 'IsDerailing', type: 'IfcTimeSeries', description: 'Indicates whether the derailer is on or not.' },
    ],
  },

  'Pset_TrackElementTypeDerailer': {
    label:       'Property Set: Track Element Type Derailer',
    description: 'Properties common to the definition to all occurrences and types of [[IfcTrackElement]] with PredefinedType set to DERAILER.',
    applicableTo: ['IFCTRACKELEMENTDERAILER'],
    props: [
      { name: 'AppliedLineLoad', type: 'IfcReal', description: 'The load of line where the derailer is installed. It is a design parameter and is defined by mass per length.' },
      { name: 'DerailmentHeight', type: 'IfcReal', description: 'Height of derailment block when derailer in protection state.' },
      { name: 'DerailmentMaximumSpeedLimit', type: 'IfcReal', description: 'Indicates the maximum allowable train speed for the derailer.' },
      { name: 'DerailmentWheelDiameter', type: 'IfcReal', description: 'Indicates the wheel diameter requirement for the derailer.' },
    ],
  },

  'Pset_TrackElementTypeSleeper': {
    label:       'Property Set: Track Element Type Sleeper',
    description: 'Properties common to the definition to all occurrences and types of [[IfcTrackElement]] with PredefinedType set to SLEEPER.',
    applicableTo: ['IFCTRACKELEMENTSLEEPER'],
    props: [
      { name: 'FasteningType', type: 'IfcLabel', description: 'Indicates the type of fastening used to generate traction between the foot of the rail and the sleeper. It depends on bu' },
      { name: 'HollowSleeperUsage', type: 'IfcLabel', description: 'Indicates the purpose of using hollow sleeper. The possible value can be eg. cable trenching, protection of turnout mech' },
      { name: 'InstalledCondition', type: 'IfcLabel', description: 'Assessment of the condition of the element at point of installation.' },
      { name: 'IsElectricallyInsulated', type: 'IfcBoolean', description: 'Indicates whether the sleeper is electrically insulated due to its design or the running rails or not.' },
      { name: 'IsHollowSleeper', type: 'IfcBoolean', description: 'Indicates whether the sleeper is hollowed or not.' },
      { name: 'NumberOfTrackCenters', type: 'IfcInteger', description: 'Indicates the number of track centers running over the sleepers.' },
      { name: 'SleeperType', type: 'IfcLabel', description: 'Indicates the sleeper type.' },
      { name: 'TechnicalStandard', type: 'IfcTimeSeries', description: 'The technical standard which the element should comply with.' },
    ],
  },

  'Pset_TractionPowerSystem': {
    label:       'Property Set: Traction Power System',
    description: 'Properties of a traction power system. The property is associated to the predefined type [[ELECTRICAL]] of [[IfcDistributionSystem]], and is used to characterise systems such as ra',
    applicableTo: ['IFCDISTRIBUTIONSYSTEMELECTRICAL'],
    props: [
      { name: 'ElectrificationType', type: 'IfcLabel', description: 'Indicates the type of railway electrification.' },
      { name: 'NominalVoltage', type: 'IfcReal', description: 'The optimum voltage for the electrical appliance or system.' },
      { name: 'PowerSupplyMode', type: 'IfcLabel', description: 'Power supply mode of the equipment or system.' },
      { name: 'RatedFrequency', type: 'IfcReal', description: 'Frequency of the AC electric power supply when the device or system reaches its optimum operating condition.' },
    ],
  },

  'Pset_TrafficCalmingDeviceCommon': {
    label:       'Property Set: Traffic Calming Device Common',
    description: 'Properties for a traffic calming device.',
    applicableTo: ['IFCELEMENTASSEMBLYTRAFFIC_CALMING_DEVICE'],
    props: [
      { name: 'TypeDesignation', type: 'IfcLabel', description: 'Type designator for the element. The content depends on local standards. Eg. \\\'Bull nose\\\', \\\'Half batter\\\', \\\'Dropper\\\', \\\'Cha' },
    ],
  },

  'Pset_TransformerTypeCommon': {
    label:       'Property Set: Transformer Type Common',
    description: 'An inductive stationary device that transfers electrical energy from one circuit to another.',
    applicableTo: ['IFCTRANSFORMER', 'IFCTRANSFORMERCHOPPER', 'IFCTRANSFORMERCOMBINED', 'IFCTRANSFORMERCURRENT', 'IFCTRANSFORMERFREQUENCY', 'IFCTRANSFORMERINVERTER', 'IFCTRANSFORMERRECTIFIER', 'IFCTRANSFORMERVOLTAGE'],
    props: [
      { name: 'ImaginaryImpedanceRatio', type: 'IfcReal', description: 'The ratio between the imaginary part of the zero sequence impedance and the imaginary part of the positive impedance (i.' },
      { name: 'IsNeutralPrimaryTerminalAvailable', type: 'IfcBoolean', description: 'An indication of whether the neutral point of the primary winding is available as a terminal (=TRUE) or not (= FALSE).' },
      { name: 'IsNeutralSecondaryTerminalAvailable', type: 'IfcBoolean', description: 'An indication of whether the neutral point of the secondary winding is available as a terminal (=TRUE) or not (= FALSE).' },
      { name: 'MaximumApparentPower', type: 'IfcReal', description: 'Maximum apparent power/capacity in VA (volt ampere).' },
      { name: 'PrimaryApparentPower', type: 'IfcReal', description: 'The power in VA (volt ampere) that has been transformed and that runs into the transformer on the primary side.' },
      { name: 'PrimaryCurrent', type: 'IfcReal', description: 'The current that is going to be transformed and that runs into the transformer on the primary side.' },
      { name: 'PrimaryFrequency', type: 'IfcReal', description: 'The frequency that is going to be transformed and that runs into the transformer on the primary side.' },
      { name: 'PrimaryVoltage', type: 'IfcReal', description: 'The voltage that is going to be transformed and that runs into the transformer on the primary side.' },
      { name: 'RealImpedanceRatio', type: 'IfcReal', description: 'The ratio between the real part of the zero sequence impedance and the real part of the positive impedance (i.e. real pa' },
      { name: 'SecondaryApparentPower', type: 'IfcReal', description: 'The power in VA (volt ampere) that has been transformed and is running out of the transformer on the secondary side.' },
      { name: 'SecondaryCurrent', type: 'IfcReal', description: 'The current that has been transformed and is running out of the transformer on the secondary side.' },
      { name: 'SecondaryCurrentType', type: 'IfcLabel', description: 'A list of the secondary current types that can result from transformer output.' },
      { name: 'SecondaryFrequency', type: 'IfcReal', description: 'The frequency that has been transformed and is running out of the transformer on the secondary side.' },
      { name: 'SecondaryVoltage', type: 'IfcReal', description: 'The voltage that has been transformed and is running out of the transformer on the secondary side.' },
      { name: 'ShortCircuitVoltage', type: 'IfcReal', description: 'A complex number that specifies the real and imaginary parts of the short-circuit voltage at rated current of a transfor' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'TransformerVectorGroup', type: 'IfcLabel', description: 'List of the possible vector groups for the transformer from which that required may be set. Values in the enumeration li' },
    ],
  },

  'Pset_TransitionSectionCommon': {
    label:       'Property Set: Transition Section Common',
    description: 'Properties for a transition section.',
    applicableTo: ['IFCEARTHWORKSFILLTRANSITIONSECTION'],
    props: [
      { name: 'NominalLength', type: 'IfcReal', description: 'The nominal overall length of the object. The size information is provided in addition to the shape representation and t' },
    ],
  },

  'Pset_TransportElementCommon': {
    label:       'Property Set: Transport Element Common',
    description: 'Properties common to the definition of all occurrences of [[IfcTransportElement]] or IfcTransportElementType',
    applicableTo: ['IFCTRANSPORTELEMENT', 'IFCTRANSPORTELEMENTCRANEWAY', 'IFCTRANSPORTELEMENTELEVATOR', 'IFCTRANSPORTELEMENTESCALATOR', 'IFCTRANSPORTELEMENTHAULINGGEAR', 'IFCTRANSPORTELEMENTLIFTINGGEAR', 'IFCTRANSPORTELEMENTMOVINGWALKWAY', 'IFCTRANSPORTATIONDEVICE', 'IFCVEHICLE', 'IFCVEHICLECARGO', 'IFCVEHICLEROLLINGSTOCK', 'IFCVEHICLEVEHICLE', 'IFCVEHICLEVEHICLEAIR', 'IFCVEHICLEVEHICLEMARINE', 'IFCVEHICLEVEHICLETRACKED', 'IFCVEHICLEVEHICLEWHEELED'],
    props: [
      { name: 'CapacityPeople', type: 'IfcInteger', description: 'Capacity of the transportation element measured in numbers of person.' },
      { name: 'CapacityWeight', type: 'IfcReal', description: 'Capacity of the transport element measured by weight.' },
      { name: 'FireExit', type: 'IfcBoolean', description: 'Indication whether this object is designed to serve as an exit in the case of fire (TRUE) or not (FALSE).' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_TransportElementElevator': {
    label:       'Property Set: Transport Element Elevator',
    description: 'Properties common to the definition of all occurrences of [[IfcTransportElement]] with the predefined type =\\\'ELEVATOR\\\'',
    applicableTo: ['IFCTRANSPORTELEMENTELEVATOR'],
    props: [
      { name: 'ClearDepth', type: 'IfcReal', description: 'The clear depth.' },
      { name: 'ClearHeight', type: 'IfcReal', description: 'Clear height of the object (elevator).; The shape information is provided in addition to the shape representation and th' },
      { name: 'ClearWidth', type: 'IfcReal', description: 'The clear width.' },
      { name: 'FireFightingLift', type: 'IfcBoolean', description: 'Indication whether the elevator is designed to serve as a fire fighting lift the case of fire (TRUE) or not (FALSE). A f' },
    ],
  },

  'Pset_TransportEquipmentOTN': {
    label:       'Property Set: Transport Equipment Otn',
    description: 'Properties in this property set are applied to transport equipment that act in optical transport network (OTN) system.',
    applicableTo: ['IFCCOMMUNICATIONSAPPLIANCETRANSPORTEQUIPMENT'],
    props: [
      { name: 'ChromaticDispersionTolerance', type: 'IfcReal', description: 'Indicates the tolerance of the transport equipment chromatic dispersion. The value is defined by picosecond per nanomete' },
      { name: 'EquipmentCapacity', type: 'IfcInteger', description: 'Indicates the equipment capacity of the appliance. The value is defined in bits/s.' },
      { name: 'MinimumOpticalSignalToNoiseRatio', type: 'IfcReal', description: 'Indicates the minimum optical signal to noise ratio of the transport equipment.' },
      { name: 'PolarizationModeDispersionTolerance', type: 'IfcReal', description: 'Indicates the polarization mode dispersion tolerance of the transport equipment. It is usually measured by picosecond.' },
      { name: 'SingleChannelAveragePower', type: 'IfcReal', description: 'Indicates the average power of a single channel of the transport equipment.' },
      { name: 'SingleChannelPower', type: 'IfcReal', description: 'Indicates the power range of a single channel of the transport equipment.' },
      { name: 'SingleWaveTransmissionRate', type: 'IfcReal', description: 'Indicates the single wave transmission rate of the transport equipment.' },
    ],
  },

  'Pset_TrenchExcavationCommon': {
    label:       'Property Set: Trench Excavation Common',
    description: 'Properties for a trench excavation.',
    applicableTo: ['IFCEARTHWORKSCUTTRENCH'],
    props: [
      { name: 'NominalDepth', type: 'IfcReal', description: 'Nominal Depth of the object' },
      { name: 'NominalWidth', type: 'IfcReal', description: 'The nominal overall width of the object. The size information is provided in addition to the shape representation and th' },
    ],
  },

  'Pset_TubeBundleTypeCommon': {
    label:       'Property Set: Tube Bundle Type Common',
    description: 'Tube bundle type common attributes.',
    applicableTo: ['IFCTUBEBUNDLE', 'IFCTUBEBUNDLEFINNED'],
    props: [
      { name: 'FoulingFactor', type: 'IfcReal', description: 'Fouling factor of the tubes in the tube bundle.' },
      { name: 'HasTurbulator', type: 'IfcBoolean', description: 'TRUE if the tube has a turbulator, FALSE if it does not.' },
      { name: 'HorizontalSpacing', type: 'IfcReal', description: 'Horizontal spacing between tubes in the tube bundle.' },
      { name: 'InLineRowSpacing', type: 'IfcReal', description: 'In-line tube row spacing.' },
      { name: 'InsideDiameter', type: 'IfcReal', description: 'Actual inner diameter of the tube in the tube bundle.' },
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
      { name: 'NominalDiameter', type: 'IfcReal', description: 'Nominal diameter or width of the object.' },
      { name: 'NumberOfCircuits', type: 'IfcInteger', description: 'Number of circuits.' },
      { name: 'NumberOfRows', type: 'IfcInteger', description: 'Number of tube rows in the tube bundle assembly.' },
      { name: 'OutsideDiameter', type: 'IfcReal', description: 'Actual outside diameter of the tube in the tube bundle.' },
      { name: 'StaggeredRowSpacing', type: 'IfcReal', description: 'Staggered tube row spacing.' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'ThermalConductivity', type: 'IfcReal', description: 'The thermal conductivity of the object.' },
      { name: 'VerticalSpacing', type: 'IfcReal', description: 'Vertical spacing between tubes in the tube bundle.' },
      { name: 'Volume', type: 'IfcReal', description: 'Volume of the element.' },
    ],
  },

  'Pset_TubeBundleTypeFinned': {
    label:       'Property Set: Tube Bundle Type Finned',
    description: 'Finned tube bundle type attributes.; Contains the attributes related to the fins attached to a tube in a finned tube bundle such as is commonly found in coils.',
    applicableTo: ['IFCTUBEBUNDLEFINNED'],
    props: [
      { name: 'Diameter', type: 'IfcReal', description: 'The Diameter of the object.' },
      { name: 'FinCorrugatedType', type: 'IfcLabel', description: 'Description of a fin corrugated type.' },
      { name: 'HasCoating', type: 'IfcBoolean', description: 'TRUE if the fin has a coating, FALSE if it does not.' },
      { name: 'Height', type: 'IfcReal', description: 'Characteristic height' },
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
      { name: 'Spacing', type: 'IfcReal', description: 'Distance between fins on a tube in the tube bundle.' },
      { name: 'ThermalConductivity', type: 'IfcReal', description: 'The thermal conductivity of the object.' },
      { name: 'Thickness', type: 'IfcReal', description: 'The geometric thickness of the object.' },
    ],
  },

  'Pset_Uncertainty': {
    label:       'Property Set: Uncertainty',
    description: 'Property set capturing the geometric uncertainty regarding measurements including how the way that uncertainty was assessed.',
    applicableTo: ['*'],
    props: [
      { name: 'HorizontalUncertainty', type: 'IfcReal', description: 'Indicative (95%-100%) range diameter associated to the vertical shape and position in X, if different to the linear unce' },
      { name: 'LinearUncertainty', type: 'IfcReal', description: 'Indicative (95%-100%) range diameter associated to the overall shape and position in XYZ.' },
      { name: 'OrthogonalUncertainty', type: 'IfcReal', description: 'Indicative (95%-100%) range diameter associated to the horizontal shape and position in Y, if different to the horizonta' },
      { name: 'UncertaintyBasis', type: 'IfcLabel', description: 'Indication of the basis of the uncertainty' },
      { name: 'UncertaintyDescription', type: 'IfcLabel', description: 'General description of the uncertainty associated to the element or feature, its source and implications.' },
      { name: 'VerticalUncertainty', type: 'IfcReal', description: 'Indicative (95%-100%) range diameter associated to the vertical shape and position in Z, if different to the linear unce' },
    ],
  },

  'Pset_UnitaryControlElementBaseStationController': {
    label:       'Property Set: Unitary Control Element Base Station Controller',
    description: 'Properties that are applicable to [[IfcUnitaryControlElement]] with the predefined type set to BASESTATIONCONTROLLER.',
    applicableTo: ['IFCUNITARYCONTROLELEMENTBASESTATIONCONTROLLER'],
    props: [
      { name: 'NumberOfInterfaces', type: 'IfcInteger', description: 'Indicates the types of interfaces and their number in the device.' },
      { name: 'NumberOfManagedBTSs', type: 'IfcInteger', description: 'Indicates the maximum number of base transceiver stations (BTSs) that can be handled by the device.' },
      { name: 'NumberOfManagedCarriers', type: 'IfcInteger', description: 'Indicates how many carrier frequencies can be managed by the device.' },
    ],
  },

  'Pset_UnitaryControlElementPHistory': {
    label:       'Property Set: Unitary Control Element Phistory',
    description: 'Properties for history and operating schedules of thermostats.',
    applicableTo: ['IFCUNITARYCONTROLELEMENT', 'IFCUNITARYCONTROLELEMENTALARMPANEL', 'IFCUNITARYCONTROLELEMENTBASESTATIONCONTROLLER', 'IFCUNITARYCONTROLELEMENTCOMBINED', 'IFCUNITARYCONTROLELEMENTCONTROLPANEL', 'IFCUNITARYCONTROLELEMENTGASDETECTIONPANEL', 'IFCUNITARYCONTROLELEMENTHUMIDISTAT', 'IFCUNITARYCONTROLELEMENTINDICATORPANEL', 'IFCUNITARYCONTROLELEMENTMIMICPANEL', 'IFCUNITARYCONTROLELEMENTTHERMOSTAT', 'IFCUNITARYCONTROLELEMENTWEATHERSTATION'],
    props: [
      { name: 'Fan', type: 'IfcTimeSeries', description: 'Indicates fan operation where True is on, False is off, and Unknown is automatic.' },
      { name: 'OperationModeHistory', type: 'IfcTimeSeries', description: 'Indicates operation mode corresponding to Pset_UnitaryControlTypeCommon.Mode. For example, \\\'HEAT\\\', \\\'COOL\\\', \\\'AUTO\\\'.' },
      { name: 'SetPoint', type: 'IfcTimeSeries', description: 'Indicates the setpoint and label.' },
      { name: 'Temperature', type: 'IfcTimeSeries', description: 'Temperature of the fluid.' },
    ],
  },

  'Pset_UnitaryControlElementTypeCommon': {
    label:       'Property Set: Unitary Control Element Type Common',
    description: 'Unitary control element type common attributes.',
    applicableTo: ['IFCUNITARYCONTROLELEMENT', 'IFCUNITARYCONTROLELEMENTALARMPANEL', 'IFCUNITARYCONTROLELEMENTBASESTATIONCONTROLLER', 'IFCUNITARYCONTROLELEMENTCOMBINED', 'IFCUNITARYCONTROLELEMENTCONTROLPANEL', 'IFCUNITARYCONTROLELEMENTGASDETECTIONPANEL', 'IFCUNITARYCONTROLELEMENTHUMIDISTAT', 'IFCUNITARYCONTROLELEMENTINDICATORPANEL', 'IFCUNITARYCONTROLELEMENTMIMICPANEL', 'IFCUNITARYCONTROLELEMENTTHERMOSTAT', 'IFCUNITARYCONTROLELEMENTWEATHERSTATION'],
    props: [
      { name: 'OperationMode', type: 'IfcLabel', description: 'Table mapping operation mode identifiers to descriptive labels, which may be used for interpreting Pset_UnitaryControlEl' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_UnitaryControlElementTypeControlPanel': {
    label:       'Property Set: Unitary Control Element Type Control Panel',
    description: 'Properties that are applicable to [[IfcUnitaryControlElement]] with the predefined type set to CONTROLPANEL.',
    applicableTo: ['IFCUNITARYCONTROLELEMENTCONTROLPANEL'],
    props: [
      { name: 'NominalCurrent', type: 'IfcReal', description: 'The nominal current that is designed to be measured.' },
      { name: 'NominalPower', type: 'IfcReal', description: 'A conventional value of apparent power determining a value of the rated current that may be carried with rated voltage a' },
      { name: 'RatedVoltage', type: 'IfcReal', description: 'The range of allowed voltage that a device is certified to handle. The upper bound of this value is the maximum.' },
      { name: 'ReferenceAirRelativeHumidity', type: 'IfcReal', description: 'Measurement of the ratio of water vapor in the air.' },
      { name: 'ReferenceEnvironmentTemperature', type: 'IfcReal', description: 'Ideal temperature range.' },
    ],
  },

  'Pset_UnitaryControlElementTypeIndicatorPanel': {
    label:       'Property Set: Unitary Control Element Type Indicator Panel',
    description: 'Unitary control element type indicator panel attributes.',
    applicableTo: ['IFCUNITARYCONTROLELEMENTINDICATORPANEL'],
    props: [
      { name: 'UnitaryApplication', type: 'IfcLabel', description: 'The application of the unitary control element.' },
    ],
  },

  'Pset_UnitaryControlElementTypeThermostat': {
    label:       'Property Set: Unitary Control Element Type Thermostat',
    description: 'Unitary control element type thermostat attributes.',
    applicableTo: ['IFCUNITARYCONTROLELEMENTTHERMOSTAT'],
    props: [
      { name: 'TemperatureSetPoint', type: 'IfcReal', description: 'The temperature setpoint range and default setpoint.' },
    ],
  },

  'Pset_UnitaryEquipmentTypeAirConditioningUnit': {
    label:       'Property Set: Unitary Equipment Type Air Conditioning Unit',
    description: 'Air conditioning unit equipment type attributes.; Note that these attributes were formerly Pset_PackagedACUnit prior to IFC2x2.;Use IfcMaterialProperties instead.',
    applicableTo: ['IFCUNITARYEQUIPMENTAIRCONDITIONINGUNIT'],
    props: [
      { name: 'CondenserEnteringTemperature', type: 'IfcReal', description: 'Temperature of fluid entering condenser.' },
      { name: 'CondenserFlowrate', type: 'IfcReal', description: 'Flow rate of fluid through the condenser.' },
      { name: 'CondenserLeavingTemperature', type: 'IfcReal', description: 'Temperature of fluid leaving condenser.' },
      { name: 'CoolingEfficiency', type: 'IfcReal', description: 'Ratio of cooling energy output to energy input under full load operating conditions.' },
      { name: 'HeatingCapacity', type: 'IfcReal', description: 'Heating capacity.' },
      { name: 'HeatingEfficiency', type: 'IfcReal', description: 'Heating efficiency under full load heating conditions.' },
      { name: 'LatentCoolingCapacity', type: 'IfcReal', description: 'Latent cooling capacity.' },
      { name: 'OutsideAirFlowrate', type: 'IfcReal', description: 'Flow rate of outside air entering the unit.' },
      { name: 'SensibleCoolingCapacity', type: 'IfcReal', description: 'Sensible cooling capacity.' },
    ],
  },

  'Pset_UnitaryEquipmentTypeAirHandler': {
    label:       'Property Set: Unitary Equipment Type Air Handler',
    description: 'Air handler unitary equipment type attributes.; Note that these attributes were formerly Pset_AirHandler prior to IFC2x2.',
    applicableTo: ['IFCUNITARYEQUIPMENTAIRHANDLER'],
    props: [
      { name: 'AirHandlerConstruction', type: 'IfcLabel', description: 'Enumeration defining how the air handler might be fabricated.' },
      { name: 'AirHandlerFanCoilArrangement', type: 'IfcLabel', description: 'Enumeration defining the arrangement of the supply air fan and the cooling coil.' },
      { name: 'DualDeck', type: 'IfcBoolean', description: 'Does the AirHandler have a dual deck? TRUE = Yes, FALSE = No.' },
    ],
  },

  'Pset_UnitaryEquipmentTypeCommon': {
    label:       'Property Set: Unitary Equipment Type Common',
    description: 'Unitary equipment type common attributes.',
    applicableTo: ['IFCUNITARYEQUIPMENT', 'IFCUNITARYEQUIPMENTAIRCONDITIONINGUNIT', 'IFCUNITARYEQUIPMENTAIRHANDLER', 'IFCUNITARYEQUIPMENTDEHUMIDIFIER', 'IFCUNITARYEQUIPMENTROOFTOPUNIT', 'IFCUNITARYEQUIPMENTSPLITSYSTEM'],
    props: [
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_UtilityConsumptionPHistory': {
    label:       'Property Set: Utility Consumption Phistory',
    description: 'Consumption of utility resources, typically applied to the [[IfcBuilding]] instance, used to identify how much was consumed on I.e., a monthly basis.',
    applicableTo: ['IFCBUILDING'],
    props: [
      { name: 'Electricity', type: 'IfcTimeSeries', description: 'The amount of electricity consumed during the period specified in the time series.' },
      { name: 'Fuel', type: 'IfcTimeSeries', description: 'The amount of fuel consumed during the period specified in the time series.' },
      { name: 'Heat', type: 'IfcTimeSeries', description: 'The amount of heat energy consumed during the period specified in the time series.' },
      { name: 'Steam', type: 'IfcTimeSeries', description: 'The amount of steam consumed during the period specified in the time series.' },
      { name: 'Water', type: 'IfcTimeSeries', description: 'The amount of water consumed during the period specified in the time series.' },
    ],
  },

  'Pset_ValvePHistory': {
    label:       'Property Set: Valve Phistory',
    description: 'Valve performance history common attributes of a typical 2 port pattern type valve.',
    applicableTo: ['IFCVALVE', 'IFCVALVEAIRRELEASE', 'IFCVALVEANTIVACUUM', 'IFCVALVECHANGEOVER', 'IFCVALVECHECK', 'IFCVALVECOMMISSIONING', 'IFCVALVEDIVERTING', 'IFCVALVEDOUBLECHECK', 'IFCVALVEDOUBLEREGULATING', 'IFCVALVEDRAWOFFCOCK', 'IFCVALVEFAUCET', 'IFCVALVEFLUSHING', 'IFCVALVEGASCOCK', 'IFCVALVEGASTAP', 'IFCVALVEISOLATING', 'IFCVALVEMIXING', 'IFCVALVEPRESSUREREDUCING', 'IFCVALVEPRESSURERELIEF', 'IFCVALVEREGULATING', 'IFCVALVESAFETYCUTOFF', 'IFCVALVESTEAMTRAP', 'IFCVALVESTOPCOCK'],
    props: [
      { name: 'MeasuredFlowRate', type: 'IfcTimeSeries', description: 'The rate of flow of a fluid measured across the valve.' },
      { name: 'MeasuredPressureDrop', type: 'IfcTimeSeries', description: 'The actual pressure drop in the fluid measured across the valve.' },
      { name: 'PercentageOpen', type: 'IfcTimeSeries', description: 'The ratio between the amount that the valve is open to the full open position of the valve.' },
    ],
  },

  'Pset_ValveTypeAirRelease': {
    label:       'Property Set: Valve Type Air Release',
    description: 'Valve used to release air from a pipe or fitting.; Note that an air release valve is constrained to have a single port pattern',
    applicableTo: ['IFCVALVEAIRRELEASE'],
    props: [
      { name: 'IsAutomatic', type: 'IfcBoolean', description: 'Indication of whether the valve is automatically operated (TRUE) or manually operated (FALSE).' },
    ],
  },

  'Pset_ValveTypeCommon': {
    label:       'Property Set: Valve Type Common',
    description: 'Valve type common attributes.',
    applicableTo: ['IFCVALVE', 'IFCVALVEAIRRELEASE', 'IFCVALVEANTIVACUUM', 'IFCVALVECHANGEOVER', 'IFCVALVECHECK', 'IFCVALVECOMMISSIONING', 'IFCVALVEDIVERTING', 'IFCVALVEDOUBLECHECK', 'IFCVALVEDOUBLEREGULATING', 'IFCVALVEDRAWOFFCOCK', 'IFCVALVEFAUCET', 'IFCVALVEFLUSHING', 'IFCVALVEGASCOCK', 'IFCVALVEGASTAP', 'IFCVALVEISOLATING', 'IFCVALVEMIXING', 'IFCVALVEPRESSUREREDUCING', 'IFCVALVEPRESSURERELIEF', 'IFCVALVEREGULATING', 'IFCVALVESAFETYCUTOFF', 'IFCVALVESTEAMTRAP', 'IFCVALVESTOPCOCK'],
    props: [
      { name: 'CloseOffRating', type: 'IfcReal', description: 'Close off rating.' },
      { name: 'FlowCoefficient', type: 'IfcReal', description: 'Flow coefficient (the quantity of fluid that passes through a fully open valve at unit pressure drop), typically express' },
      { name: 'Size', type: 'IfcReal', description: 'The size of the connection to the valve (or to each connection for faucets, mixing valves, etc.).' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'TestPressure', type: 'IfcReal', description: 'The maximum pressure to which the valve has been subjected under test.' },
      { name: 'ValveMechanism', type: 'IfcLabel', description: 'Valve that has a ported ball that can be turned relative to the body seat ports.;Valve in which a streamlined disc pivot' },
      { name: 'ValveOperation', type: 'IfcLabel', description: 'A valve that is closed by the action of a weighted lever being released, the weight normally being prevented from droppi' },
      { name: 'ValvePattern', type: 'IfcLabel', description: 'Valve that has a single entry port from the system that it serves, the exit port being to the surrounding environment.;V' },
      { name: 'WorkingPressure', type: 'IfcReal', description: 'Working pressure.' },
    ],
  },

  'Pset_ValveTypeDrawOffCock': {
    label:       'Property Set: Valve Type Draw Off Cock',
    description: 'A small diameter valve, used to drain water from a cistern or water filled system.',
    applicableTo: ['IFCVALVEDRAWOFFCOCK'],
    props: [
      { name: 'HasHoseUnion', type: 'IfcBoolean', description: 'Indicates whether the object is fitted with a hose union connection (= TRUE) or not (= FALSE).' },
    ],
  },

  'Pset_ValveTypeFaucet': {
    label:       'Property Set: Valve Type Faucet',
    description: 'A small diameter valve, with a free outlet, from which water is drawn.',
    applicableTo: ['IFCVALVEFAUCET'],
    props: [
      { name: 'FaucetFunction', type: 'IfcLabel', description: 'Defines the operating temperature of a faucet that may be specified.' },
      { name: 'FaucetOperation', type: 'IfcLabel', description: 'Quick action faucet with a ceramic seal to open or close the orifice; .;Quick action faucet that is operated by a lever' },
      { name: 'FaucetTopDescription', type: 'IfcLabel', description: 'Description of the operating mechanism/top of the faucet.' },
      { name: 'FaucetType', type: 'IfcLabel', description: 'Faucet with a horizontal inlet and a nozzle that discharges downwards.; Faucet fitted through the end of a bath, with a' },
      { name: 'Finish', type: 'IfcLabel', description: 'Description of the (surface) finish of the object for informational purposes.' },
    ],
  },

  'Pset_ValveTypeFlushing': {
    label:       'Property Set: Valve Type Flushing',
    description: 'Valve that flushes a predetermined quantity of water to cleanse a WC, urinal or slop hopper.; Note that a flushing valve is constrained to have a 2 port pattern.',
    applicableTo: ['IFCVALVEFLUSHING'],
    props: [
      { name: 'FlushingRate', type: 'IfcReal', description: 'The predetermined quantity of water to be flushed.' },
      { name: 'HasIntegralShutOffDevice', type: 'IfcBoolean', description: 'Indication of whether the flushing valve has an integral shut off device fitted (set TRUE) or not (set FALSE).' },
      { name: 'IsHighPressure', type: 'IfcBoolean', description: 'Indication of whether the flushing valve is suitable for use on a high pressure water main (set TRUE) or not (set FALSE)' },
    ],
  },

  'Pset_ValveTypeGasTap': {
    label:       'Property Set: Valve Type Gas Tap',
    description: 'A small diameter valve, used to discharge gas from a system.',
    applicableTo: ['IFCVALVEGASTAP'],
    props: [
      { name: 'HasHoseUnion', type: 'IfcBoolean', description: 'Indicates whether the object is fitted with a hose union connection (= TRUE) or not (= FALSE).' },
    ],
  },

  'Pset_ValveTypeIsolating': {
    label:       'Property Set: Valve Type Isolating',
    description: 'Valve that is used to isolate system components.; Note that an isolating valve is constrained to have a 2 port pattern.',
    applicableTo: ['IFCVALVEISOLATING'],
    props: [
      { name: 'IsNormallyOpen', type: 'IfcBoolean', description: 'If TRUE, the valve is normally open. If FALSE is is normally closed.' },
      { name: 'IsolatingPurpose', type: 'IfcLabel', description: 'Defines the purpose for which the isolating valve is used since the way in which the valve is identified as an isolating' },
    ],
  },

  'Pset_ValveTypeMixing': {
    label:       'Property Set: Valve Type Mixing',
    description: 'A valve where typically the temperature of the outlet is determined by mixing hot and cold water inlet flows.',
    applicableTo: ['IFCVALVEMIXING'],
    props: [
      { name: 'MixerControl', type: 'IfcLabel', description: 'Defines the form of control of the mixing valve.' },
      { name: 'OutletConnectionSize', type: 'IfcReal', description: 'Size of the outlet connection from the object.' },
    ],
  },

  'Pset_ValveTypePressureReducing': {
    label:       'Property Set: Valve Type Pressure Reducing',
    description: 'Valve that reduces the pressure of a fluid immediately downstream of its position in a pipeline to a preselected value or by a predetermined ratio.; Note that a pressure reducing v',
    applicableTo: ['IFCVALVEPRESSUREREDUCING'],
    props: [
      { name: 'DownstreamPressure', type: 'IfcReal', description: 'The operating pressure of the fluid downstream of the pressure reducing valve.' },
      { name: 'UpstreamPressure', type: 'IfcReal', description: 'The operating pressure of the fluid upstream of the pressure reducing valve.' },
    ],
  },

  'Pset_ValveTypePressureRelief': {
    label:       'Property Set: Valve Type Pressure Relief',
    description: 'Spring or weight loaded valve that automatically discharges to a safe place fluid that has built up to excessive pressure in pipes or fittings.; Note that a pressure relief valve i',
    applicableTo: ['IFCVALVEPRESSURERELIEF'],
    props: [
      { name: 'ReliefPressure', type: 'IfcReal', description: 'The pressure at which the spring or weight in the valve is set to discharge fluid.' },
    ],
  },

  'Pset_VegetationCommon': {
    label:       'Property Set: Vegetation Common',
    description: 'Properties for vegetation and plants, modelled as instances of [[IfcGeographicElement]] with the predefined type set to VEGETATION.',
    applicableTo: ['IFCGEOGRAPHICELEMENTVEGETATION'],
    props: [
      { name: 'BotanicalName', type: 'IfcLabel', description: 'Formal scientific name conforming to the International Code of Nomenclature for algae, fungi, and plants (ICN)' },
      { name: 'LocalName', type: 'IfcLabel', description: 'The local name that the plant is known as.' },
    ],
  },

  'Pset_VehicleAvailability': {
    label:       'Property Set: Vehicle Availability',
    description: 'Property set for the application of availability data to vehicles and equipment.',
    applicableTo: ['IFCVEHICLEROLLINGSTOCK', 'IFCVEHICLEVEHICLE', 'IFCVEHICLEVEHICLEAIR', 'IFCVEHICLEVEHICLEMARINE', 'IFCVEHICLEVEHICLETRACKED'],
    props: [
      { name: 'MaintenanceDowntime', type: 'IfcReal', description: 'Maintenance downtime proportion.' },
      { name: 'VehicleAvailability', type: 'IfcReal', description: 'Vehicle or Plant availability' },
      { name: 'WeatherDowntime', type: 'IfcReal', description: 'Weather downtime proportion' },
    ],
  },

  'Pset_VesselLineCommon': {
    label:       'Property Set: Vessel Line Common',
    description: 'Properties for vessel lines and anchoring',
    applicableTo: ['IFCMECHANICALFASTENERROPE'],
    props: [
      { name: 'CentreLineToFairlead', type: 'IfcReal', description: 'Distance from the vessel centreline to the fairlead for the line' },
      { name: 'FairleadToTermination', type: 'IfcReal', description: 'Distance from the fairlead to the bitt or winch on the vessel where the line terminates' },
      { name: 'HeightAboveMainDeck', type: 'IfcReal', description: 'Height of the fairlead above the main deck of the vessel' },
      { name: 'LineIdentifier', type: 'IfcLabel', description: 'Reference ID relative to a design vessel in the project' },
      { name: 'LineStrength', type: 'IfcReal', description: 'Breaking load of the line (note that ultimate stress is not part of any of the material Psets)' },
      { name: 'LineType', type: 'IfcLabel', description: 'Mooring line type' },
      { name: 'MidshipToFairLead', type: 'IfcReal', description: 'Distance from the vessel midship to the fairlead for the line' },
      { name: 'PreTensionAim', type: 'IfcReal', description: 'Line force that the winch is set to maintain (minimum load)' },
      { name: 'TailDiameter', type: 'IfcReal', description: 'Diameter of the tail' },
      { name: 'TailLength', type: 'IfcReal', description: 'Length of the tail' },
      { name: 'TailStrength', type: 'IfcReal', description: 'Breaking load of the tail (note that ultimate stress is not part of any of the material Psets)' },
      { name: 'TailType', type: 'IfcLabel', description: 'Mooring tail type' },
      { name: 'WinchBreakLimit', type: 'IfcReal', description: 'Line force at which the winch starts to release the line (maximum load)' },
    ],
  },

  'Pset_VibrationIsolatorTypeCommon': {
    label:       'Property Set: Vibration Isolator Type Common',
    description: 'Vibration isolator type common attributes.',
    applicableTo: ['IFCVIBRATIONISOLATOR', 'IFCVIBRATIONISOLATORBASE', 'IFCVIBRATIONISOLATORCOMPRESSION', 'IFCVIBRATIONISOLATORSPRING'],
    props: [
      { name: 'IsolatorCompressibility', type: 'IfcReal', description: 'The compressibility of the vibration isolator.' },
      { name: 'IsolatorStaticDeflection', type: 'IfcReal', description: 'Static deflection of the vibration isolator.' },
      { name: 'MaximumSupportedWeight', type: 'IfcReal', description: 'The maximum weight that can be carried by the vibration isolator.' },
      { name: 'NominalHeight', type: 'IfcReal', description: 'The nominal height of the object. The size information is provided in addition to the shape representation and the geome' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'VibrationTransmissibility', type: 'IfcReal', description: 'The vibration transmissibility percentage.' },
    ],
  },

  'Pset_VoltageInstrumentTransformer': {
    label:       'Property Set: Voltage Instrument Transformer',
    description: 'Instrument transformers are high accuracy class electrical devices used to isolate or transform voltage or current levels. The main function of instrument transformers is to operat',
    applicableTo: ['IFCFLOWINSTRUMENTCOMBINED', 'IFCFLOWINSTRUMENTVOLTMETER'],
    props: [
      { name: 'AccuracyClass', type: 'IfcReal', description: 'A designation assigned to an instrument transformer the current (or voltage) error and phase displacement of which remai' },
      { name: 'AccuracyGrade', type: 'IfcLabel', description: 'The grade of accuracy.' },
      { name: 'NominalCurrent', type: 'IfcReal', description: 'The nominal current that is designed to be measured.' },
      { name: 'NominalPower', type: 'IfcReal', description: 'A conventional value of apparent power determining a value of the rated current that may be carried with rated voltage a' },
      { name: 'NumberOfPhases', type: 'IfcInteger', description: 'Number of phases that the equipment operates on.' },
      { name: 'PrimaryFrequency', type: 'IfcReal', description: 'The frequency that is going to be transformed and that runs into the transformer on the primary side.' },
      { name: 'PrimaryVoltage', type: 'IfcReal', description: 'The voltage that is going to be transformed and that runs into the transformer on the primary side.' },
      { name: 'RatedVoltage', type: 'IfcReal', description: 'The range of allowed voltage that a device is certified to handle. The upper bound of this value is the maximum.' },
      { name: 'SecondaryFrequency', type: 'IfcReal', description: 'The frequency that has been transformed and is running out of the transformer on the secondary side.' },
      { name: 'SecondaryVoltage', type: 'IfcReal', description: 'The voltage that has been transformed and is running out of the transformer on the secondary side.' },
    ],
  },

  'Pset_WallCommon': {
    label:       'Property Set: Wall Common',
    description: 'Properties common to the definition of all occurrences of [[IfcWall]].',
    applicableTo: ['IFCWALL', 'IFCWALLELEMENTEDWALL', 'IFCWALLMOVABLE', 'IFCWALLPARAPET', 'IFCWALLPARTITIONING', 'IFCWALLPLUMBINGWALL', 'IFCWALLPOLYGONAL', 'IFCWALLRETAININGWALL', 'IFCWALLSHEAR', 'IFCWALLSOLIDWALL', 'IFCWALLSTANDARD', 'IFCWALLWAVEWALL'],
    props: [
      { name: 'AcousticRating', type: 'IfcLabel', description: 'Acoustic rating for this object.; It is provided according to the national building code. It indicates the sound transmi' },
      { name: 'Combustible', type: 'IfcBoolean', description: 'Indication whether the object is made from combustible material (TRUE) or not (FALSE).' },
      { name: 'Compartmentation', type: 'IfcBoolean', description: 'Indication whether the object is designed to serve as a fire compartmentation (TRUE) or not (FALSE).' },
      { name: 'ExtendToStructure', type: 'IfcBoolean', description: 'Indicates whether the object extend to the structure above (TRUE) or not (FALSE).' },
      { name: 'FireRating', type: 'IfcLabel', description: 'Fire rating for this object. It is given according to the national fire safety classification.' },
      { name: 'IsExternal', type: 'IfcBoolean', description: 'Indication whether the element is designed for use in the exterior (TRUE) or not (FALSE). If (TRUE) it is an external el' },
      { name: 'LoadBearing', type: 'IfcBoolean', description: 'Indicates whether the object is intended to carry loads (TRUE) or not (FALSE).' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'SurfaceSpreadOfFlame', type: 'IfcLabel', description: 'Indication on how the flames spread around the surface,; It is given according to the national building code that govern' },
      { name: 'ThermalTransmittance', type: 'IfcReal', description: 'Thermal transmittance coefficient (U-Value) of an element, within the direction of the thermal flow (including all mater' },
    ],
  },

  'Pset_Warranty': {
    label:       'Property Set: Warranty',
    description: 'An assurance given by the seller or provider of an artefact that the artefact is without defects and will operate as described for a defined period of time without failure and that',
    applicableTo: ['*'],
    props: [
      { name: 'Exclusions', type: 'IfcLabel', description: 'Items, conditions or actions that may be excluded from the warranty or that may cause the warranty to become void.' },
      { name: 'IsExtendedWarranty', type: 'IfcBoolean', description: 'Indication of whether this is an extended warranty whose duration is greater than that normally assigned to an artefact' },
      { name: 'PointOfContact', type: 'IfcLabel', description: 'The organization that should be contacted for action under the terms of the warranty. Note that the role of the organiza' },
      { name: 'WarrantyContent', type: 'IfcLabel', description: 'The content of the warranty.' },
      { name: 'WarrantyIdentifier', type: 'IfcLabel', description: 'The identifier assigned to a warranty.' },
      { name: 'WarrantyPeriod', type: 'IfcLabel', description: 'The time duration during which a manufacturer or supplier guarantees or warrants the performance of an artefact.' },
      { name: 'WarrantyStartDate', type: 'IfcLabel', description: 'The date on which the warranty commences.' },
    ],
  },

  'Pset_WasteTerminalTypeCommon': {
    label:       'Property Set: Waste Terminal Type Common',
    description: 'Common properties for waste terminals.',
    applicableTo: ['IFCWASTETERMINAL', 'IFCWASTETERMINALFLOORTRAP', 'IFCWASTETERMINALFLOORWASTE', 'IFCWASTETERMINALGULLYSUMP', 'IFCWASTETERMINALGULLYTRAP', 'IFCWASTETERMINALROOFDRAIN', 'IFCWASTETERMINALWASTEDISPOSALUNIT', 'IFCWASTETERMINALWASTETRAP'],
    props: [
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
    ],
  },

  'Pset_WasteTerminalTypeFloorTrap': {
    label:       'Property Set: Waste Terminal Type Floor Trap',
    description: 'Pipe fitting, set into the floor, that retains liquid to prevent the passage of foul air.',
    applicableTo: ['IFCWASTETERMINALFLOORTRAP'],
    props: [
      { name: 'CoverLength', type: 'IfcReal', description: 'The length measured along the x-axis in the local coordinate system or the radius (in the case of a circular shape in pl' },
      { name: 'CoverMaterial', type: 'IfcTimeSeries', description: 'Material from which the cover or grating is constructed.' },
      { name: 'CoverWidth', type: 'IfcReal', description: 'The length measured along the y-axis in the local coordinate system of the cover of the object.' },
      { name: 'HasStrainer', type: 'IfcBoolean', description: 'Indicates whether the gully trap has a strainer (= TRUE) or not (= FALSE).' },
      { name: 'InletConnectionSize', type: 'IfcReal', description: 'Size of the inlet connection.; Note that all inlet connections are assumed to be the same size.' },
      { name: 'InletPatternType', type: 'IfcLabel', description: 'Identifies the pattern of inlet connections to a trap.A trap may have 0,1,2,3 or 4 inlet connections and the pattern of' },
      { name: 'IsForSullageWater', type: 'IfcBoolean', description: 'Indicates if the purpose of the floor trap is to receive sullage water, or if that is amongst its purposes (= TRUE), or' },
      { name: 'NominalBodyDepth', type: 'IfcReal', description: 'Nominal or quoted length measured along the z-axis of the local coordinate system of the object.' },
      { name: 'NominalBodyLength', type: 'IfcReal', description: 'Nominal or quoted length measured along the x-axis of the local coordinate system of the object.' },
      { name: 'NominalBodyWidth', type: 'IfcReal', description: 'Nominal or quoted length, measured along the y-axis of the local coordinate system of the object.' },
      { name: 'OutletConnectionSize', type: 'IfcReal', description: 'Size of the outlet connection from the object.' },
      { name: 'SpilloverLevel', type: 'IfcReal', description: 'The level at which water spills out of the object.' },
      { name: 'TrapType', type: 'IfcLabel', description: 'Identifies the predefined types of trap from which the type required may be set.' },
    ],
  },

  'Pset_WasteTerminalTypeFloorWaste': {
    label:       'Property Set: Waste Terminal Type Floor Waste',
    description: 'Pipe fitting, set into the floor, that collects waste water and discharges it to a separate trap.',
    applicableTo: ['IFCWASTETERMINALFLOORWASTE'],
    props: [
      { name: 'CoverLength', type: 'IfcReal', description: 'The length measured along the x-axis in the local coordinate system or the radius (in the case of a circular shape in pl' },
      { name: 'CoverWidth', type: 'IfcReal', description: 'The length measured along the y-axis in the local coordinate system of the cover of the object.' },
      { name: 'NominalBodyDepth', type: 'IfcReal', description: 'Nominal or quoted length measured along the z-axis of the local coordinate system of the object.' },
      { name: 'NominalBodyLength', type: 'IfcReal', description: 'Nominal or quoted length measured along the x-axis of the local coordinate system of the object.' },
      { name: 'NominalBodyWidth', type: 'IfcReal', description: 'Nominal or quoted length, measured along the y-axis of the local coordinate system of the object.' },
      { name: 'OutletConnectionSize', type: 'IfcReal', description: 'Size of the outlet connection from the object.' },
    ],
  },

  'Pset_WasteTerminalTypeGullySump': {
    label:       'Property Set: Waste Terminal Type Gully Sump',
    description: 'Pipe fitting or assembly of fittings to receive surface water or waste water, fitted with a grating or sealed cover.',
    applicableTo: ['IFCWASTETERMINALGULLYSUMP'],
    props: [
      { name: 'BackInletPatternType', type: 'IfcLabel', description: 'Identifies the pattern of inlet connections to a gully trap.A gulley trap may have 0,1,2,3 or 4 inlet connections and th' },
      { name: 'CoverLength', type: 'IfcReal', description: 'The length measured along the x-axis in the local coordinate system or the radius (in the case of a circular shape in pl' },
      { name: 'CoverWidth', type: 'IfcReal', description: 'The length measured along the y-axis in the local coordinate system of the cover of the object.' },
      { name: 'GullyType', type: 'IfcLabel', description: 'Identifies the predefined types of gully from which the type required may be set.' },
      { name: 'InletConnectionSize', type: 'IfcReal', description: 'Size of the inlet connection.; Note that all inlet connections are assumed to be the same size.' },
      { name: 'NominalSumpDepth', type: 'IfcReal', description: 'Nominal or quoted length measured along the z-axis in the local coordinate system of the sump.' },
      { name: 'NominalSumpLength', type: 'IfcReal', description: 'Nominal or quoted length measured along the x-axis in the local coordinate system or the radius (in the case of a circul' },
      { name: 'NominalSumpWidth', type: 'IfcReal', description: 'Nominal or quoted length measured along the y-axis in the local coordinate system of the sump.' },
      { name: 'OutletConnectionSize', type: 'IfcReal', description: 'Size of the outlet connection from the object.' },
      { name: 'TrapType', type: 'IfcLabel', description: 'Identifies the predefined types of trap from which the type required may be set.' },
    ],
  },

  'Pset_WasteTerminalTypeGullyTrap': {
    label:       'Property Set: Waste Terminal Type Gully Trap',
    description: 'Pipe fitting or assembly of fittings to receive surface water or waste water, fitted with a grating or sealed cover and discharging through a trap (BS6100 330 3504 modified)',
    applicableTo: ['IFCWASTETERMINALGULLYTRAP'],
    props: [
      { name: 'BackInletPatternType', type: 'IfcLabel', description: 'Identifies the pattern of inlet connections to a gully trap.A gulley trap may have 0,1,2,3 or 4 inlet connections and th' },
      { name: 'CoverLength', type: 'IfcReal', description: 'The length measured along the x-axis in the local coordinate system or the radius (in the case of a circular shape in pl' },
      { name: 'CoverWidth', type: 'IfcReal', description: 'The length measured along the y-axis in the local coordinate system of the cover of the object.' },
      { name: 'GullyType', type: 'IfcLabel', description: 'Identifies the predefined types of gully from which the type required may be set.' },
      { name: 'HasStrainer', type: 'IfcBoolean', description: 'Indicates whether the gully trap has a strainer (= TRUE) or not (= FALSE).' },
      { name: 'InletConnectionSize', type: 'IfcReal', description: 'Size of the inlet connection.; Note that all inlet connections are assumed to be the same size.' },
      { name: 'NominalBodyDepth', type: 'IfcReal', description: 'Nominal or quoted length measured along the z-axis of the local coordinate system of the object.' },
      { name: 'NominalBodyLength', type: 'IfcReal', description: 'Nominal or quoted length measured along the x-axis of the local coordinate system of the object.' },
      { name: 'NominalBodyWidth', type: 'IfcReal', description: 'Nominal or quoted length, measured along the y-axis of the local coordinate system of the object.' },
      { name: 'OutletConnectionSize', type: 'IfcReal', description: 'Size of the outlet connection from the object.' },
      { name: 'TrapType', type: 'IfcLabel', description: 'Identifies the predefined types of trap from which the type required may be set.' },
    ],
  },

  'Pset_WasteTerminalTypeRoofDrain': {
    label:       'Property Set: Waste Terminal Type Roof Drain',
    description: 'Pipe fitting, set into the roof, that collects rainwater for discharge into the rainwater system.',
    applicableTo: ['IFCWASTETERMINALROOFDRAIN'],
    props: [
      { name: 'CoverLength', type: 'IfcReal', description: 'The length measured along the x-axis in the local coordinate system or the radius (in the case of a circular shape in pl' },
      { name: 'CoverWidth', type: 'IfcReal', description: 'The length measured along the y-axis in the local coordinate system of the cover of the object.' },
      { name: 'NominalBodyDepth', type: 'IfcReal', description: 'Nominal or quoted length measured along the z-axis of the local coordinate system of the object.' },
      { name: 'NominalBodyLength', type: 'IfcReal', description: 'Nominal or quoted length measured along the x-axis of the local coordinate system of the object.' },
      { name: 'NominalBodyWidth', type: 'IfcReal', description: 'Nominal or quoted length, measured along the y-axis of the local coordinate system of the object.' },
      { name: 'OutletConnectionSize', type: 'IfcReal', description: 'Size of the outlet connection from the object.' },
    ],
  },

  'Pset_WasteTerminalTypeWasteDisposalUnit': {
    label:       'Property Set: Waste Terminal Type Waste Disposal Unit',
    description: 'Electrically operated device that reduces kitchen or other waste into fragments small enough to be flushed into a drainage system.',
    applicableTo: ['IFCWASTETERMINALWASTEDISPOSALUNIT'],
    props: [
      { name: 'DrainConnectionSize', type: 'IfcReal', description: 'Size of the drain connection inlet to the waste disposal unit.' },
      { name: 'NominalDepth', type: 'IfcReal', description: 'Nominal Depth of the object' },
      { name: 'OutletConnectionSize', type: 'IfcReal', description: 'Size of the outlet connection from the object.' },
    ],
  },

  'Pset_WasteTerminalTypeWasteTrap': {
    label:       'Property Set: Waste Terminal Type Waste Trap',
    description: 'Pipe fitting, set adjacent to a sanitary terminal, that retains liquid to prevent the passage of foul air.',
    applicableTo: ['IFCWASTETERMINALWASTETRAP'],
    props: [
      { name: 'InletConnectionSize', type: 'IfcReal', description: 'Size of the inlet connection.; Note that all inlet connections are assumed to be the same size.' },
      { name: 'OutletConnectionSize', type: 'IfcReal', description: 'Size of the outlet connection from the object.' },
      { name: 'WasteTrapType', type: 'IfcLabel', description: 'Identifies the predefined types of trap from which the type required may be set.' },
    ],
  },

  'Pset_WaterStratumCommon': {
    label:       'Property Set: Water Stratum Common',
    description: 'Properties expressing the composition and any variability in the height of the body of water. Ranges are non-negative describing a spread.',
    applicableTo: ['IFCGEOTECHNICALSTRATUMWATER'],
    props: [
      { name: 'AnnualRange', type: 'IfcReal', description: 'Indicative (95%-100%) annual range in levels.' },
      { name: 'AnnualTrend', type: 'IfcReal', description: 'Indicative (95%-100%) annual rise in level.' },
      { name: 'IsFreshwater', type: 'IfcValue', description: 'Indication of freshwater (true,false or unknown)' },
      { name: 'SeicheRange', type: 'IfcReal', description: 'Indicative (95%-100%) range between peaks and troughts of seiche (resonant) waves.' },
      { name: 'TidalRange', type: 'IfcReal', description: 'Indicative (95%-100%) range between high and low tide levels.' },
      { name: 'WaveRange', type: 'IfcReal', description: 'Indicative (95%-100%) range between peaks and troughs of waves' },
    ],
  },

  'Pset_Width': {
    label:       'Property Set: Width',
    description: 'Specifies the general properties for a [[Width]] event.',
    applicableTo: ['IFCREFERENTWIDTHEVENT'],
    props: [
      { name: 'NominalWidth', type: 'IfcReal', description: 'The nominal overall width of the object. The size information is provided in addition to the shape representation and th' },
      { name: 'Side', type: 'IfcLabel', description: 'Specifies if the width is measured to the RIGHT or to the LEFT of the curve referenced by the placement, or if the same' },
      { name: 'TransitionWidth', type: 'IfcLabel', description: 'The type of transition of width used between the previous event and this event.' },
    ],
  },

  'Pset_WindowCommon': {
    label:       'Property Set: Window Common',
    description: 'Properties common to the definition of all occurrences of Window.',
    applicableTo: ['IFCWINDOW', 'IFCWINDOWLIGHTDOME', 'IFCWINDOWSKYLIGHT', 'IFCWINDOWWINDOW'],
    props: [
      { name: 'AcousticRating', type: 'IfcLabel', description: 'Acoustic rating for this object.; It is provided according to the national building code. It indicates the sound transmi' },
      { name: 'FireExit', type: 'IfcBoolean', description: 'Indication whether this object is designed to serve as an exit in the case of fire (TRUE) or not (FALSE).' },
      { name: 'FireRating', type: 'IfcLabel', description: 'Fire rating for this object. It is given according to the national fire safety classification.' },
      { name: 'GlazingAreaFraction', type: 'IfcReal', description: 'Fraction of the glazing area relative to the total area of the filling element.; It shall be used, if the glazing area i' },
      { name: 'HasDrive', type: 'IfcBoolean', description: 'Indication whether this object has an automatic drive to operate it (TRUE) or no drive (FALSE)' },
      { name: 'HasSillExternal', type: 'IfcBoolean', description: 'Indication whether the window opening has an external sill (TRUE) or not (FALSE).' },
      { name: 'HasSillInternal', type: 'IfcBoolean', description: 'Indication whether the window opening has an internal sill (TRUE) or not (FALSE).' },
      { name: 'Infiltration', type: 'IfcReal', description: 'Infiltration flowrate of outside air for the filler object based on the area of the filler object at a pressure level of' },
      { name: 'IsExternal', type: 'IfcBoolean', description: 'Indication whether the element is designed for use in the exterior (TRUE) or not (FALSE). If (TRUE) it is an external el' },
      { name: 'MechanicalLoadRating', type: 'IfcLabel', description: 'Mechanical load rating for this object.; It is provided according to the national building code.' },
      { name: 'SecurityRating', type: 'IfcLabel', description: 'Index based rating system indicating security level.; It is giving according to the national building code.' },
      { name: 'SmokeStop', type: 'IfcBoolean', description: 'Indication whether the object is designed to provide a smoke stop (TRUE) or not (FALSE).' },
      { name: 'Status', type: 'IfcLabel', description: 'Status of the element, predominately used in renovation or retrofitting projects. The status can be assigned to as \\\'New\\\'' },
      { name: 'ThermalTransmittance', type: 'IfcReal', description: 'Thermal transmittance coefficient (U-Value) of an element, within the direction of the thermal flow (including all mater' },
      { name: 'WaterTightnessRating', type: 'IfcLabel', description: 'Water tightness rating for this object.; It is provided according to the national building code.' },
      { name: 'WindLoadRating', type: 'IfcLabel', description: 'Wind load resistance rating for this object.; It is provided according to the national building code.' },
    ],
  },

  'Pset_WindowLiningProperties': {
    label:       'Property Set: Window Lining Properties',
    description: 'Properties of the window lining.',
    applicableTo: ['IFCMEMBER', 'IFCMEMBERARCH_SEGMENT', 'IFCMEMBERBRACE', 'IFCMEMBERCHORD', 'IFCMEMBERCOLLAR', 'IFCMEMBERMEMBER', 'IFCMEMBERMULLION', 'IFCMEMBERPLATE', 'IFCMEMBERPOST', 'IFCMEMBERPURLIN', 'IFCMEMBERRAFTER', 'IFCMEMBERSTAY_CABLE', 'IFCMEMBERSTIFFENING_RIB', 'IFCMEMBERSTRINGER', 'IFCMEMBERSTRUCTURALCABLE', 'IFCMEMBERSTRUT', 'IFCMEMBERSTUD', 'IFCMEMBERSUSPENDER', 'IFCMEMBERSUSPENSION_CABLE', 'IFCMEMBERTIEBAR', 'IFCWINDOW', 'IFCWINDOWLIGHTDOME', 'IFCWINDOWSKYLIGHT', 'IFCWINDOWWINDOW'],
    props: [
      { name: 'FirstMullionOffset', type: 'IfcReal', description: 'Offset of the mullion centerline, measured along the x-axis of the window placement coordinate system. An offset value =' },
      { name: 'FirstTransomOffset', type: 'IfcReal', description: 'Offset of the transom centerline, measured along the z-axis of the window placement coordinate system. An offset value =' },
      { name: 'LiningDepth', type: 'IfcReal', description: 'The depth of the lining.' },
      { name: 'LiningOffset', type: 'IfcReal', description: 'Offset of the lining.' },
      { name: 'LiningThickness', type: 'IfcReal', description: 'Thickness of the lining.' },
      { name: 'LiningToPanelOffsetX', type: 'IfcReal', description: 'Offset between the lining and the panel, measured along the x-axis of the local placement.' },
      { name: 'LiningToPanelOffsetY', type: 'IfcReal', description: 'Offset between the lining and the panel, measured along the y-axis of the local placement.' },
      { name: 'MullionThickness', type: 'IfcReal', description: 'Thickness of the mullion.' },
      { name: 'SecondMullionOffset', type: 'IfcReal', description: 'Offset of the mullion centerline for the second mullion, measured along the x-axis of the window placement co-ordinate s' },
      { name: 'SecondTransomOffset', type: 'IfcReal', description: 'Offset of the transom centerline for the second transom, measured along the x-axis of the window placement co-ordinate s' },
      { name: 'TransomThickness', type: 'IfcReal', description: 'Thickness of the transom.' },
    ],
  },

  'Pset_WindowPanelProperties': {
    label:       'Property Set: Window Panel Properties',
    description: 'Properties of the window panel.',
    applicableTo: ['IFCPLATE', 'IFCPLATEBASE_PLATE', 'IFCPLATECOVER_PLATE', 'IFCPLATECURTAIN_PANEL', 'IFCPLATEFLANGE_PLATE', 'IFCPLATEGUSSET_PLATE', 'IFCPLATESHEET', 'IFCPLATESPLICE_PLATE', 'IFCPLATESTIFFENER_PLATE', 'IFCPLATEWEB_PLATE', 'IFCWINDOW', 'IFCWINDOWLIGHTDOME', 'IFCWINDOWSKYLIGHT', 'IFCWINDOWWINDOW'],
    props: [
      { name: 'FrameDepth', type: 'IfcReal', description: 'The length (or depth) of the frame.' },
      { name: 'FrameThickness', type: 'IfcReal', description: 'The thickness of the frame.' },
      { name: 'OperationType', type: 'IfcLabel', description: 'Type of operations. Also used to assign standard symbolic presentations according to national building standards.' },
      { name: 'PanelPosition', type: 'IfcLabel', description: 'Position of the panel.' },
    ],
  },

  'Pset_WiredCommunicationPortCommon': {
    label:       'Property Set: Wired Communication Port Common',
    description: 'Properties used for wired communication port.',
    applicableTo: ['IFCDISTRIBUTIONPORTCABLE'],
    props: [
      { name: 'CommunicationStandard', type: 'IfcLabel', description: 'Indicates the communication standard supported by the physical wired communication port.' },
      { name: 'MaximumTransferRate', type: 'IfcInteger', description: 'Indicates the transmission rate in bit/s over the wired port.' },
    ],
  },

  'Pset_WorkControlCommon': {
    label:       'Property Set: Work Control Common',
    description: 'Properties common to the definition of all occurrences of [[IfcWorkPlan]] and [[IfcWorkSchedule]] (subtypes of [[IfcWorkControl]]).',
    applicableTo: ['IFCWORKCONTROL', 'IFCWORKPLAN', 'IFCWORKPLANACTUAL', 'IFCWORKPLANBASELINE', 'IFCWORKPLANPLANNED', 'IFCWORKSCHEDULE', 'IFCWORKSCHEDULEACTUAL', 'IFCWORKSCHEDULEBASELINE', 'IFCWORKSCHEDULEPLANNED'],
    props: [
      { name: 'WorkDayDuration', type: 'IfcLabel', description: 'The elapsed time within a worktime-based day. For presentation purposes, applications may choose to display IfcTask dura' },
      { name: 'WorkFinishTime', type: 'IfcLabel', description: 'The default time of day a task is scheduled to finish. For presentation purposes, if the finish time of a task matches t' },
      { name: 'WorkMonthDuration', type: 'IfcLabel', description: 'The elapsed time within a worktime-based month. For presentation purposes, applications may choose to display IfcTask du' },
      { name: 'WorkStartTime', type: 'IfcLabel', description: 'The default time of day a task is scheduled to start. For presentation purposes, if the start time of a task matches the' },
      { name: 'WorkWeekDuration', type: 'IfcLabel', description: 'The elapsed time within a worktime-based week. For presentation purposes, applications may choose to display IfcTask dur' },
    ],
  },

  'Pset_ZoneCommon': {
    label:       'Property Set: Zone Common',
    description: 'Properties common to the definition of all occurrences of [[IfcZone]].',
    applicableTo: ['IFCZONE'],
    props: [
      { name: 'GrossPlannedArea', type: 'IfcReal', description: 'Total planned gross area of the spatial structure element. Used for programming the spatial structure element.' },
      { name: 'HandicapAccessible', type: 'IfcBoolean', description: 'Indication that this object is designed to be accessible by the handicapped. Set to (TRUE) if this object is rated as ha' },
      { name: 'IsExternal', type: 'IfcBoolean', description: 'Indication whether the element is designed for use in the exterior (TRUE) or not (FALSE). If (TRUE) it is an external el' },
      { name: 'NetPlannedArea', type: 'IfcReal', description: 'Total planned net area of the object. Used for programming the object.' },
      { name: 'PubliclyAccessible', type: 'IfcBoolean', description: 'Indication whether this space (in case of e.g., a toilet) is designed to serve as a publicly accessible space, e.g., for' },
    ],
  },

  'Qto_ActuatorBaseQuantities': {
    label:       'Quantity Set: Actuator Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of actuator.',
    applicableTo: ['IFCACTUATOR', 'IFCACTUATORELECTRICACTUATOR', 'IFCACTUATORHANDOPERATEDACTUATOR', 'IFCACTUATORHYDRAULICACTUATOR', 'IFCACTUATORPNEUMATICACTUATOR', 'IFCACTUATORTHERMOSTATICACTUATOR'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_AirTerminalBaseQuantities': {
    label:       'Quantity Set: Air Terminal Base Quantities',
    description: 'Base quantities that are common to the definition of all types of air terminals.',
    applicableTo: ['IFCAIRTERMINAL', 'IFCAIRTERMINALDIFFUSER', 'IFCAIRTERMINALGRILLE', 'IFCAIRTERMINALLOUVRE', 'IFCAIRTERMINALREGISTER'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
      { name: 'Perimeter', type: 'IfcReal', description: 'Perimeter of the object.' },
      { name: 'TotalSurfaceArea', type: 'IfcReal', description: 'Total surface area of the element.' },
    ],
  },

  'Qto_AirTerminalBoxTypeBaseQuantities': {
    label:       'Quantity Set: Air Terminal Box Type Base Quantities',
    description: 'Base quantities that are common to the definition of all types of air terminal boxes.',
    applicableTo: ['IFCAIRTERMINALBOX', 'IFCAIRTERMINALBOXCONSTANTFLOW', 'IFCAIRTERMINALBOXVARIABLEFLOWPRESSUREDEPENDANT', 'IFCAIRTERMINALBOXVARIABLEFLOWPRESSUREINDEPENDANT'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_AirToAirHeatRecoveryBaseQuantities': {
    label:       'Quantity Set: Air To Air Heat Recovery Base Quantities',
    description: 'Base quantities that are common to the definition of all types of air-to-air heat recovery elements.',
    applicableTo: ['IFCAIRTOAIRHEATRECOVERY', 'IFCAIRTOAIRHEATRECOVERYFIXEDPLATECOUNTERFLOWEXCHAN', 'IFCAIRTOAIRHEATRECOVERYFIXEDPLATECROSSFLOWEXCHANGE', 'IFCAIRTOAIRHEATRECOVERYFIXEDPLATEPARALLELFLOWEXCHA', 'IFCAIRTOAIRHEATRECOVERYHEATPIPE', 'IFCAIRTOAIRHEATRECOVERYROTARYWHEEL', 'IFCAIRTOAIRHEATRECOVERYRUNAROUNDCOILLOOP', 'IFCAIRTOAIRHEATRECOVERYTHERMOSIPHONCOILTYPEHEATEXC', 'IFCAIRTOAIRHEATRECOVERYTHERMOSIPHONSEALEDTUBEHEATE', 'IFCAIRTOAIRHEATRECOVERYTWINTOWERENTHALPYRECOVERYLO'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_AlarmBaseQuantities': {
    label:       'Quantity Set: Alarm Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of alarm.',
    applicableTo: ['IFCALARM', 'IFCALARMBELL', 'IFCALARMBREAKGLASSBUTTON', 'IFCALARMLIGHT', 'IFCALARMMANUALPULLBOX', 'IFCALARMRAILWAYCROCODILE', 'IFCALARMRAILWAYDETONATOR', 'IFCALARMSIREN', 'IFCALARMWHISTLE'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_ArealStratumBaseQuantities': {
    label:       'Quantity Set: Areal Stratum Base Quantities',
    description: 'Quantity measures associated to areal stratum such as in a geotechnical slice. Uncertainty is documented in [[Pset_Uncertainty]].',
    applicableTo: ['IFCGEOTECHNICALSTRATUM', 'IFCGEOTECHNICALSTRATUMSOLID', 'IFCGEOTECHNICALSTRATUMVOID', 'IFCGEOTECHNICALSTRATUMWATER'],
    props: [
      { name: 'Area', type: 'IfcReal', description: 'Calculated area for the object.' },
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
      { name: 'PlanLength', type: 'IfcReal', description: 'Projected plan length of upper edge of slice.' },
    ],
  },

  'Qto_AudioVisualApplianceBaseQuantities': {
    label:       'Quantity Set: Audio Visual Appliance Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of audio visual appliance.',
    applicableTo: ['IFCAUDIOVISUALAPPLIANCE', 'IFCAUDIOVISUALAPPLIANCEAMPLIFIER', 'IFCAUDIOVISUALAPPLIANCECAMERA', 'IFCAUDIOVISUALAPPLIANCECOMMUNICATIONTERMINAL', 'IFCAUDIOVISUALAPPLIANCEDISPLAY', 'IFCAUDIOVISUALAPPLIANCEMICROPHONE', 'IFCAUDIOVISUALAPPLIANCEPLAYER', 'IFCAUDIOVISUALAPPLIANCEPROJECTOR', 'IFCAUDIOVISUALAPPLIANCERECEIVER', 'IFCAUDIOVISUALAPPLIANCERECORDINGEQUIPMENT', 'IFCAUDIOVISUALAPPLIANCESPEAKER', 'IFCAUDIOVISUALAPPLIANCESWITCHER', 'IFCAUDIOVISUALAPPLIANCETELEPHONE', 'IFCAUDIOVISUALAPPLIANCETUNER'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_BeamBaseQuantities': {
    label:       'Quantity Set: Beam Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of beams.',
    applicableTo: ['IFCBEAM', 'IFCBEAMBEAM', 'IFCBEAMCORNICE', 'IFCBEAMDIAPHRAGM', 'IFCBEAMEDGEBEAM', 'IFCBEAMGIRDER_SEGMENT', 'IFCBEAMHATSTONE', 'IFCBEAMHOLLOWCORE', 'IFCBEAMJOIST', 'IFCBEAMLINTEL', 'IFCBEAMPIERCAP', 'IFCBEAMSPANDREL', 'IFCBEAMT_BEAM'],
    props: [
      { name: 'CrossSectionArea', type: 'IfcReal', description: 'Total area of the cross section (or profile) of the object.' },
      { name: 'GrossSurfaceArea', type: 'IfcReal', description: 'Total gross area of the object, normally generated as perimeter * length + 2 * cross section area. It is the sum of Oute' },
      { name: 'GrossVolume', type: 'IfcReal', description: 'Total gross volume of the object. Openings, recesses, enclosed objects and projections are not taken into account.' },
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
      { name: 'NetSurfaceArea', type: 'IfcReal', description: 'Net surface area of the object, normally generated as perimeter * length + 2 * cross section area taking into account po' },
      { name: 'NetVolume', type: 'IfcReal', description: 'Total net volume of the object, taking into account possible processing features (cut-out\\\'s, etc.) or openings and reces' },
      { name: 'NetWeight', type: 'IfcReal', description: 'Total net weight of the object without add-on parts, taking into account possible processing features (cut-out\\\'s, etc.)' },
      { name: 'OuterSurfaceArea', type: 'IfcReal', description: 'Total area of the surfaces of the object (not taking into account the end cap areas), normally generated as perimeter *' },
    ],
  },

  'Qto_BodyGeometryValidation': {
    label:       'Quantity Set: Body Geometry Validation',
    description: 'Quantities supplied for validating the correct interpretation of the body shape representation at import. In case of multiple representation items, the quantities are summed for ea',
    applicableTo: ['*'],
    props: [
      { name: 'GrossSurfaceArea', type: 'IfcReal', description: 'Total gross area of the object, normally generated as perimeter * length + 2 * cross section area. It is the sum of Oute' },
      { name: 'GrossVolume', type: 'IfcReal', description: 'Total gross volume of the object. Openings, recesses, enclosed objects and projections are not taken into account.' },
      { name: 'NetSurfaceArea', type: 'IfcReal', description: 'Net surface area of the object, normally generated as perimeter * length + 2 * cross section area taking into account po' },
      { name: 'NetVolume', type: 'IfcReal', description: 'Total net volume of the object, taking into account possible processing features (cut-out\\\'s, etc.) or openings and reces' },
      { name: 'SurfaceGenusAfterFeatures', type: 'IfcReal', description: 'The Surface Genus of the evaluated representation items after applying product-level geometric features such as openings' },
      { name: 'SurfaceGenusBeforeFeatures', type: 'IfcReal', description: 'The Surface Genus of the evaluated representation items before applying product-level geometric features such as opening' },
    ],
  },

  'Qto_BoilerBaseQuantities': {
    label:       'Quantity Set: Boiler Base Quantities',
    description: 'Base quantities that are common to the definition of all types of boilers.',
    applicableTo: ['IFCBOILER', 'IFCBOILERSTEAM', 'IFCBOILERWATER'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
      { name: 'NetWeight', type: 'IfcReal', description: 'Total net weight of the object without add-on parts, taking into account possible processing features (cut-out\\\'s, etc.)' },
      { name: 'TotalSurfaceArea', type: 'IfcReal', description: 'Total surface area of the element.' },
    ],
  },

  'Qto_BuildingBaseQuantities': {
    label:       'Quantity Set: Building Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of building.',
    applicableTo: ['IFCBUILDING'],
    props: [
      { name: 'EavesHeight', type: 'IfcReal', description: 'Standard net height of this storey, from the top surface of the construction floor, to the bottom surface of the constru' },
      { name: 'FootPrintArea', type: 'IfcReal', description: 'Gross area of the site covered by the building(s).' },
      { name: 'GrossFloorArea', type: 'IfcReal', description: 'Sum of all gross floor areas within the spatial structure element.' },
      { name: 'GrossVolume', type: 'IfcReal', description: 'Total gross volume of the object. Openings, recesses, enclosed objects and projections are not taken into account.' },
      { name: 'Height', type: 'IfcReal', description: 'Characteristic height' },
      { name: 'NetFloorArea', type: 'IfcReal', description: 'Sum of all net usable floor areas.' },
      { name: 'NetVolume', type: 'IfcReal', description: 'Total net volume of the object, taking into account possible processing features (cut-out\\\'s, etc.) or openings and reces' },
    ],
  },

  'Qto_BuildingElementProxyQuantities': {
    label:       'Quantity Set: Building Element Proxy Quantities',
    description: 'Quantity set for Building Element Proxies.',
    applicableTo: ['IFCBUILDINGELEMENTPROXY'],
    props: [
      { name: 'NetSurfaceArea', type: 'IfcReal', description: 'Net surface area of the object, normally generated as perimeter * length + 2 * cross section area taking into account po' },
      { name: 'NetVolume', type: 'IfcReal', description: 'Total net volume of the object, taking into account possible processing features (cut-out\\\'s, etc.) or openings and reces' },
    ],
  },

  'Qto_BuildingStoreyBaseQuantities': {
    label:       'Quantity Set: Building Storey Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of building storey.',
    applicableTo: ['IFCBUILDINGSTOREY'],
    props: [
      { name: 'GrossFloorArea', type: 'IfcReal', description: 'Sum of all gross floor areas within the spatial structure element.' },
      { name: 'GrossHeight', type: 'IfcReal', description: 'Standard gross height of this storey, from the top surface of the construction floor, to the top surface of the construc' },
      { name: 'GrossPerimeter', type: 'IfcReal', description: 'Gross perimeter at the outer contour of the object.' },
      { name: 'GrossVolume', type: 'IfcReal', description: 'Total gross volume of the object. Openings, recesses, enclosed objects and projections are not taken into account.' },
      { name: 'NetFloorArea', type: 'IfcReal', description: 'Sum of all net usable floor areas.' },
      { name: 'NetHeight', type: 'IfcReal', description: 'Standard net height of this storey, from the top surface of the construction floor, to the bottom surface of the constru' },
      { name: 'NetVolume', type: 'IfcReal', description: 'Total net volume of the object, taking into account possible processing features (cut-out\\\'s, etc.) or openings and reces' },
    ],
  },

  'Qto_BurnerBaseQuantities': {
    label:       'Quantity Set: Burner Base Quantities',
    description: 'Base quantities that are common to the definition of all types of burners.',
    applicableTo: ['IFCBURNER'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_CableCarrierFittingBaseQuantities': {
    label:       'Quantity Set: Cable Carrier Fitting Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of cable carrier fitting.',
    applicableTo: ['IFCCABLECARRIERFITTING', 'IFCCABLECARRIERFITTINGBEND', 'IFCCABLECARRIERFITTINGCONNECTOR', 'IFCCABLECARRIERFITTINGCROSS', 'IFCCABLECARRIERFITTINGJUNCTION', 'IFCCABLECARRIERFITTINGREDUCER', 'IFCCABLECARRIERFITTINGTEE', 'IFCCABLECARRIERFITTINGTRANSITION'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_CableCarrierSegmentBaseQuantities': {
    label:       'Quantity Set: Cable Carrier Segment Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of cable carrier segment.',
    applicableTo: ['IFCCABLECARRIERSEGMENT', 'IFCCABLECARRIERSEGMENTCABLEBRACKET', 'IFCCABLECARRIERSEGMENTCABLELADDERSEGMENT', 'IFCCABLECARRIERSEGMENTCABLETRAYSEGMENT', 'IFCCABLECARRIERSEGMENTCABLETRUNKINGSEGMENT', 'IFCCABLECARRIERSEGMENTCATENARYWIRE', 'IFCCABLECARRIERSEGMENTCONDUITSEGMENT', 'IFCCABLECARRIERSEGMENTDROPPER'],
    props: [
      { name: 'CrossSectionArea', type: 'IfcReal', description: 'Total area of the cross section (or profile) of the object.' },
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
      { name: 'OuterSurfaceArea', type: 'IfcReal', description: 'Total area of the surfaces of the object (not taking into account the end cap areas), normally generated as perimeter *' },
    ],
  },

  'Qto_CableFittingBaseQuantities': {
    label:       'Quantity Set: Cable Fitting Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of flow cable fitting.',
    applicableTo: ['IFCCABLEFITTING', 'IFCCABLEFITTINGCONNECTOR', 'IFCCABLEFITTINGENTRY', 'IFCCABLEFITTINGEXIT', 'IFCCABLEFITTINGFANOUT', 'IFCCABLEFITTINGJUNCTION', 'IFCCABLEFITTINGTRANSITION'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_CableSegmentBaseQuantities': {
    label:       'Quantity Set: Cable Segment Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of cable segment.',
    applicableTo: ['IFCCABLESEGMENT', 'IFCCABLESEGMENTBUSBARSEGMENT', 'IFCCABLESEGMENTCABLESEGMENT', 'IFCCABLESEGMENTCONDUCTORSEGMENT', 'IFCCABLESEGMENTCONTACTWIRESEGMENT', 'IFCCABLESEGMENTCORESEGMENT', 'IFCCABLESEGMENTFIBERSEGMENT', 'IFCCABLESEGMENTFIBERTUBE', 'IFCCABLESEGMENTOPTICALCABLESEGMENT', 'IFCCABLESEGMENTSTITCHWIRE', 'IFCCABLESEGMENTWIREPAIRSEGMENT'],
    props: [
      { name: 'CrossSectionArea', type: 'IfcReal', description: 'Total area of the cross section (or profile) of the object.' },
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
      { name: 'OuterSurfaceArea', type: 'IfcReal', description: 'Total area of the surfaces of the object (not taking into account the end cap areas), normally generated as perimeter *' },
    ],
  },

  'Qto_ChillerBaseQuantities': {
    label:       'Quantity Set: Chiller Base Quantities',
    description: 'Base quantities that are common to the definition of all types of chillers.',
    applicableTo: ['IFCCHILLER', 'IFCCHILLERAIRCOOLED', 'IFCCHILLERHEATRECOVERY', 'IFCCHILLERWATERCOOLED'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_ChimneyBaseQuantities': {
    label:       'Quantity Set: Chimney Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of chimneys.',
    applicableTo: ['IFCCHIMNEY'],
    props: [
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
    ],
  },

  'Qto_CoilBaseQuantities': {
    label:       'Quantity Set: Coil Base Quantities',
    description: 'Base quantities that are common to the definition of all types of coils.',
    applicableTo: ['IFCCOIL', 'IFCCOILDXCOOLINGCOIL', 'IFCCOILELECTRICHEATINGCOIL', 'IFCCOILGASHEATINGCOIL', 'IFCCOILHYDRONICCOIL', 'IFCCOILSTEAMHEATINGCOIL', 'IFCCOILWATERCOOLINGCOIL', 'IFCCOILWATERHEATINGCOIL'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_ColumnBaseQuantities': {
    label:       'Quantity Set: Column Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of columns.',
    applicableTo: ['IFCCOLUMN', 'IFCCOLUMNCOLUMN', 'IFCCOLUMNPIERSTEM', 'IFCCOLUMNPIERSTEM_SEGMENT', 'IFCCOLUMNPILASTER', 'IFCCOLUMNSTANDCOLUMN'],
    props: [
      { name: 'CrossSectionArea', type: 'IfcReal', description: 'Total area of the cross section (or profile) of the object.' },
      { name: 'GrossSurfaceArea', type: 'IfcReal', description: 'Total gross area of the object, normally generated as perimeter * length + 2 * cross section area. It is the sum of Oute' },
      { name: 'GrossVolume', type: 'IfcReal', description: 'Total gross volume of the object. Openings, recesses, enclosed objects and projections are not taken into account.' },
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
      { name: 'NetSurfaceArea', type: 'IfcReal', description: 'Net surface area of the object, normally generated as perimeter * length + 2 * cross section area taking into account po' },
      { name: 'NetVolume', type: 'IfcReal', description: 'Total net volume of the object, taking into account possible processing features (cut-out\\\'s, etc.) or openings and reces' },
      { name: 'NetWeight', type: 'IfcReal', description: 'Total net weight of the object without add-on parts, taking into account possible processing features (cut-out\\\'s, etc.)' },
      { name: 'OuterSurfaceArea', type: 'IfcReal', description: 'Total area of the surfaces of the object (not taking into account the end cap areas), normally generated as perimeter *' },
    ],
  },

  'Qto_CommunicationsApplianceBaseQuantities': {
    label:       'Quantity Set: Communications Appliance Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of communications appliance.',
    applicableTo: ['IFCCOMMUNICATIONSAPPLIANCE', 'IFCCOMMUNICATIONSAPPLIANCEANTENNA', 'IFCCOMMUNICATIONSAPPLIANCEAUTOMATON', 'IFCCOMMUNICATIONSAPPLIANCECOMPUTER', 'IFCCOMMUNICATIONSAPPLIANCEFAX', 'IFCCOMMUNICATIONSAPPLIANCEGATEWAY', 'IFCCOMMUNICATIONSAPPLIANCEINTELLIGENTPERIPHERAL', 'IFCCOMMUNICATIONSAPPLIANCEIPNETWORKEQUIPMENT', 'IFCCOMMUNICATIONSAPPLIANCELINESIDEELECTRONICUNIT', 'IFCCOMMUNICATIONSAPPLIANCEMODEM', 'IFCCOMMUNICATIONSAPPLIANCENETWORKAPPLIANCE', 'IFCCOMMUNICATIONSAPPLIANCENETWORKBRIDGE', 'IFCCOMMUNICATIONSAPPLIANCENETWORKHUB', 'IFCCOMMUNICATIONSAPPLIANCEOPTICALLINETERMINAL', 'IFCCOMMUNICATIONSAPPLIANCEOPTICALNETWORKUNIT', 'IFCCOMMUNICATIONSAPPLIANCEPRINTER', 'IFCCOMMUNICATIONSAPPLIANCERADIOBLOCKCENTER', 'IFCCOMMUNICATIONSAPPLIANCEREPEATER', 'IFCCOMMUNICATIONSAPPLIANCEROUTER', 'IFCCOMMUNICATIONSAPPLIANCESCANNER', 'IFCCOMMUNICATIONSAPPLIANCETELECOMMAND', 'IFCCOMMUNICATIONSAPPLIANCETELEPHONYEXCHANGE', 'IFCCOMMUNICATIONSAPPLIANCETRANSITIONCOMPONENT', 'IFCCOMMUNICATIONSAPPLIANCETRANSPONDER', 'IFCCOMMUNICATIONSAPPLIANCETRANSPORTEQUIPMENT'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_CompressorBaseQuantities': {
    label:       'Quantity Set: Compressor Base Quantities',
    description: 'Base quantities that are common to the definition of all types of compressors.',
    applicableTo: ['IFCCOMPRESSOR', 'IFCCOMPRESSORBOOSTER', 'IFCCOMPRESSORDYNAMIC', 'IFCCOMPRESSORHERMETIC', 'IFCCOMPRESSOROPENTYPE', 'IFCCOMPRESSORRECIPROCATING', 'IFCCOMPRESSORROLLINGPISTON', 'IFCCOMPRESSORROTARY', 'IFCCOMPRESSORROTARYVANE', 'IFCCOMPRESSORSCROLL', 'IFCCOMPRESSORSEMIHERMETIC', 'IFCCOMPRESSORSINGLESCREW', 'IFCCOMPRESSORSINGLESTAGE', 'IFCCOMPRESSORTROCHOIDAL', 'IFCCOMPRESSORTWINSCREW', 'IFCCOMPRESSORWELDEDSHELLHERMETIC'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_CondenserBaseQuantities': {
    label:       'Quantity Set: Condenser Base Quantities',
    description: 'Base quantities that are common to the definition of all types of condensers.',
    applicableTo: ['IFCCONDENSER', 'IFCCONDENSERAIRCOOLED', 'IFCCONDENSEREVAPORATIVECOOLED', 'IFCCONDENSERWATERCOOLED', 'IFCCONDENSERWATERCOOLEDBRAZEDPLATE', 'IFCCONDENSERWATERCOOLEDSHELLCOIL', 'IFCCONDENSERWATERCOOLEDSHELLTUBE', 'IFCCONDENSERWATERCOOLEDTUBEINTUBE'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_ConduitSegmentBaseQuantities': {
    label:       'Quantity Set: Conduit Segment Base Quantities',
    description: 'Quantity set of Conduit Segment Base.',
    applicableTo: ['IFCCABLECARRIERSEGMENTCONDUITSEGMENT'],
    props: [
      { name: 'InnerDiameter', type: 'IfcReal', description: 'The actual inner diameter of the object.' },
      { name: 'OuterDiameter', type: 'IfcReal', description: 'The actual outer diameter of the object.' },
    ],
  },

  'Qto_ControllerBaseQuantities': {
    label:       'Quantity Set: Controller Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of controller.',
    applicableTo: ['IFCCONTROLLER', 'IFCCONTROLLERFLOATING', 'IFCCONTROLLERMULTIPOSITION', 'IFCCONTROLLERPROGRAMMABLE', 'IFCCONTROLLERPROPORTIONAL', 'IFCCONTROLLERTWOPOSITION'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_CooledBeamBaseQuantities': {
    label:       'Quantity Set: Cooled Beam Base Quantities',
    description: 'Base quantities that are common to the definition of all types of cooled beams.',
    applicableTo: ['IFCCOOLEDBEAM', 'IFCCOOLEDBEAMACTIVE', 'IFCCOOLEDBEAMPASSIVE'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_CoolingTowerBaseQuantities': {
    label:       'Quantity Set: Cooling Tower Base Quantities',
    description: 'Base quantities that are common to the definition of all types of cooling towers.',
    applicableTo: ['IFCCOOLINGTOWER', 'IFCCOOLINGTOWERMECHANICALFORCEDDRAFT', 'IFCCOOLINGTOWERMECHANICALINDUCEDDRAFT', 'IFCCOOLINGTOWERNATURALDRAFT'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_CourseBaseQuantities': {
    label:       'Quantity Set: Course Base Quantities',
    description: 'Quantity set for Course base.',
    applicableTo: ['IFCCOURSE', 'IFCCOURSEARMOUR', 'IFCCOURSEBALLASTBED', 'IFCCOURSECORE', 'IFCCOURSEFILTER', 'IFCCOURSEPAVEMENT', 'IFCCOURSEPROTECTION'],
    props: [
      { name: 'GrossVolume', type: 'IfcReal', description: 'Total gross volume of the object. Openings, recesses, enclosed objects and projections are not taken into account.' },
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
      { name: 'Thickness', type: 'IfcReal', description: 'The geometric thickness of the object.' },
      { name: 'Volume', type: 'IfcReal', description: 'Volume of the element.' },
      { name: 'Weight', type: 'IfcReal', description: 'Total weight of object' },
      { name: 'Width', type: 'IfcReal', description: 'The width of the object. Only given, if the object has constant thickness (prismatic).' },
    ],
  },

  'Qto_CoveringBaseQuantities': {
    label:       'Quantity Set: Covering Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of coverings applied to spaces.',
    applicableTo: ['IFCCOVERING', 'IFCCOVERINGCEILING', 'IFCCOVERINGCLADDING', 'IFCCOVERINGCOPING', 'IFCCOVERINGFLOORING', 'IFCCOVERINGINSULATION', 'IFCCOVERINGMEMBRANE', 'IFCCOVERINGMOLDING', 'IFCCOVERINGROOFING', 'IFCCOVERINGSKIRTINGBOARD', 'IFCCOVERINGSLEEVING', 'IFCCOVERINGTOPPING', 'IFCCOVERINGWRAPPING'],
    props: [
      { name: 'GrossArea', type: 'IfcReal', description: 'Gross Area of the object. Openings, recesses, projections and cut-outs are not taken into account.' },
      { name: 'NetArea', type: 'IfcReal', description: 'Total net area of the object. Openings, recesses and cut-outs are taken into account by subtraction, projections by addi' },
      { name: 'Width', type: 'IfcReal', description: 'The width of the object. Only given, if the object has constant thickness (prismatic).' },
    ],
  },

  'Qto_CurtainWallQuantities': {
    label:       'Quantity Set: Curtain Wall Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of curtain walls.',
    applicableTo: ['IFCCURTAINWALL'],
    props: [
      { name: 'GrossSideArea', type: 'IfcReal', description: 'Area of the wall as viewed by an elevation view of the middle plane of the wall. It does not take into account any wall' },
      { name: 'Height', type: 'IfcReal', description: 'Characteristic height' },
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
      { name: 'NetSideArea', type: 'IfcReal', description: 'Area of the object as viewed by an elevation view of the middle plane of the object. It does take into account all objec' },
      { name: 'Width', type: 'IfcReal', description: 'The width of the object. Only given, if the object has constant thickness (prismatic).' },
    ],
  },

  'Qto_DamperBaseQuantities': {
    label:       'Quantity Set: Damper Base Quantities',
    description: 'Base quantities that are common to the definition of all types of dampers.',
    applicableTo: ['IFCDAMPER', 'IFCDAMPERBACKDRAFTDAMPER', 'IFCDAMPERBALANCINGDAMPER', 'IFCDAMPERBLASTDAMPER', 'IFCDAMPERCONTROLDAMPER', 'IFCDAMPERFIREDAMPER', 'IFCDAMPERFIRESMOKEDAMPER', 'IFCDAMPERFUMEHOODEXHAUST', 'IFCDAMPERGRAVITYDAMPER', 'IFCDAMPERGRAVITYRELIEFDAMPER', 'IFCDAMPERRELIEFDAMPER', 'IFCDAMPERSMOKEDAMPER'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_DistributionChamberElementBaseQuantities': {
    label:       'Quantity Set: Distribution Chamber Element Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of distribution chamber elements.',
    applicableTo: ['IFCDISTRIBUTIONCHAMBERELEMENT', 'IFCDISTRIBUTIONCHAMBERELEMENTFORMEDDUCT', 'IFCDISTRIBUTIONCHAMBERELEMENTINSPECTIONCHAMBER', 'IFCDISTRIBUTIONCHAMBERELEMENTINSPECTIONPIT', 'IFCDISTRIBUTIONCHAMBERELEMENTMANHOLE', 'IFCDISTRIBUTIONCHAMBERELEMENTMETERCHAMBER', 'IFCDISTRIBUTIONCHAMBERELEMENTSUMP', 'IFCDISTRIBUTIONCHAMBERELEMENTTRENCH', 'IFCDISTRIBUTIONCHAMBERELEMENTVALVECHAMBER'],
    props: [
      { name: 'Depth', type: 'IfcReal', description: 'The depth of the object.' },
      { name: 'GrossSurfaceArea', type: 'IfcReal', description: 'Total gross area of the object, normally generated as perimeter * length + 2 * cross section area. It is the sum of Oute' },
      { name: 'GrossVolume', type: 'IfcReal', description: 'Total gross volume of the object. Openings, recesses, enclosed objects and projections are not taken into account.' },
      { name: 'NetSurfaceArea', type: 'IfcReal', description: 'Net surface area of the object, normally generated as perimeter * length + 2 * cross section area taking into account po' },
      { name: 'NetVolume', type: 'IfcReal', description: 'Total net volume of the object, taking into account possible processing features (cut-out\\\'s, etc.) or openings and reces' },
    ],
  },

  'Qto_DoorBaseQuantities': {
    label:       'Quantity Set: Door Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of doors.',
    applicableTo: ['IFCDOOR', 'IFCDOORBOOM_BARRIER', 'IFCDOORDOOR', 'IFCDOORGATE', 'IFCDOORTRAPDOOR', 'IFCDOORTURNSTILE'],
    props: [
      { name: 'Area', type: 'IfcReal', description: 'Calculated area for the object.' },
      { name: 'Height', type: 'IfcReal', description: 'Characteristic height' },
      { name: 'Perimeter', type: 'IfcReal', description: 'Perimeter of the object.' },
      { name: 'Width', type: 'IfcReal', description: 'The width of the object. Only given, if the object has constant thickness (prismatic).' },
    ],
  },

  'Qto_DuctFittingBaseQuantities': {
    label:       'Quantity Set: Duct Fitting Base Quantities',
    description: 'Base quantities that are common to the definition of all types and occurrences of duct fittings.',
    applicableTo: ['IFCDUCTFITTING', 'IFCDUCTFITTINGBEND', 'IFCDUCTFITTINGCONNECTOR', 'IFCDUCTFITTINGENTRY', 'IFCDUCTFITTINGEXIT', 'IFCDUCTFITTINGJUNCTION', 'IFCDUCTFITTINGOBSTRUCTION', 'IFCDUCTFITTINGTRANSITION'],
    props: [
      { name: 'GrossCrossSectionArea', type: 'IfcReal', description: 'Area of the cross section.' },
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
      { name: 'NetCrossSectionArea', type: 'IfcReal', description: 'Area of the cross section of the object.' },
      { name: 'OuterSurfaceArea', type: 'IfcReal', description: 'Total area of the surfaces of the object (not taking into account the end cap areas), normally generated as perimeter *' },
    ],
  },

  'Qto_DuctSegmentBaseQuantities': {
    label:       'Quantity Set: Duct Segment Base Quantities',
    description: 'Base quantities that are common to the definition of all types and occurrences of duct segments.',
    applicableTo: ['IFCDUCTSEGMENT', 'IFCDUCTSEGMENTFLEXIBLESEGMENT', 'IFCDUCTSEGMENTRIGIDSEGMENT'],
    props: [
      { name: 'GrossCrossSectionArea', type: 'IfcReal', description: 'Area of the cross section.' },
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
      { name: 'NetCrossSectionArea', type: 'IfcReal', description: 'Area of the cross section of the object.' },
      { name: 'OuterSurfaceArea', type: 'IfcReal', description: 'Total area of the surfaces of the object (not taking into account the end cap areas), normally generated as perimeter *' },
    ],
  },

  'Qto_DuctSilencerBaseQuantities': {
    label:       'Quantity Set: Duct Silencer Base Quantities',
    description: 'Base quantities that are common to the definition of all types of duct silencers.',
    applicableTo: ['IFCDUCTSILENCER', 'IFCDUCTSILENCERFLATOVAL', 'IFCDUCTSILENCERRECTANGULAR', 'IFCDUCTSILENCERROUND'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_EarthworksCutBaseQuantities': {
    label:       'Quantity Set: Earthworks Cut Base Quantities',
    description: 'Quantity set for Earthworks Cut Base.',
    applicableTo: ['IFCEARTHWORKSCUT', 'IFCEARTHWORKSCUTBASE_EXCAVATION', 'IFCEARTHWORKSCUTCUT', 'IFCEARTHWORKSCUTDREDGING', 'IFCEARTHWORKSCUTEXCAVATION', 'IFCEARTHWORKSCUTOVEREXCAVATION', 'IFCEARTHWORKSCUTPAVEMENTMILLING', 'IFCEARTHWORKSCUTSTEPEXCAVATION', 'IFCEARTHWORKSCUTTOPSOILREMOVAL', 'IFCEARTHWORKSCUTTRENCH'],
    props: [
      { name: 'Depth', type: 'IfcReal', description: 'The depth of the object.' },
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
      { name: 'LooseVolume', type: 'IfcReal', description: 'Volume of the earthworks when in a loose piled state' },
      { name: 'UndisturbedVolume', type: 'IfcReal', description: 'Undisturbed Volume' },
      { name: 'Weight', type: 'IfcReal', description: 'Total weight of object' },
      { name: 'Width', type: 'IfcReal', description: 'The width of the object. Only given, if the object has constant thickness (prismatic).' },
    ],
  },

  'Qto_EarthworksFillBaseQuantities': {
    label:       'Quantity Set: Earthworks Fill Base Quantities',
    description: 'Quantity set for Earthworks Fill Base.',
    applicableTo: ['IFCEARTHWORKSFILL', 'IFCEARTHWORKSFILLBACKFILL', 'IFCEARTHWORKSFILLCOUNTERWEIGHT', 'IFCEARTHWORKSFILLEMBANKMENT', 'IFCEARTHWORKSFILLSLOPEFILL', 'IFCEARTHWORKSFILLSUBGRADE', 'IFCEARTHWORKSFILLSUBGRADEBED', 'IFCEARTHWORKSFILLTRANSITIONSECTION'],
    props: [
      { name: 'CompactedVolume', type: 'IfcReal', description: 'Volume of the earthworks when finished and compacted in place.' },
      { name: 'Depth', type: 'IfcReal', description: 'The depth of the object.' },
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
      { name: 'LooseVolume', type: 'IfcReal', description: 'Volume of the earthworks when in a loose piled state' },
      { name: 'Width', type: 'IfcReal', description: 'The width of the object. Only given, if the object has constant thickness (prismatic).' },
    ],
  },

  'Qto_ElectricApplianceBaseQuantities': {
    label:       'Quantity Set: Electric Appliance Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of electric appliance.',
    applicableTo: ['IFCELECTRICAPPLIANCE', 'IFCELECTRICAPPLIANCEDISHWASHER', 'IFCELECTRICAPPLIANCEELECTRICCOOKER', 'IFCELECTRICAPPLIANCEFREESTANDINGELECTRICHEATER', 'IFCELECTRICAPPLIANCEFREESTANDINGFAN', 'IFCELECTRICAPPLIANCEFREESTANDINGWATERCOOLER', 'IFCELECTRICAPPLIANCEFREESTANDINGWATERHEATER', 'IFCELECTRICAPPLIANCEFREEZER', 'IFCELECTRICAPPLIANCEFRIDGE_FREEZER', 'IFCELECTRICAPPLIANCEHANDDRYER', 'IFCELECTRICAPPLIANCEKITCHENMACHINE', 'IFCELECTRICAPPLIANCEMICROWAVE', 'IFCELECTRICAPPLIANCEPHOTOCOPIER', 'IFCELECTRICAPPLIANCEREFRIGERATOR', 'IFCELECTRICAPPLIANCETUMBLEDRYER', 'IFCELECTRICAPPLIANCEVENDINGMACHINE', 'IFCELECTRICAPPLIANCEWASHINGMACHINE'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_ElectricFlowStorageDeviceBaseQuantities': {
    label:       'Quantity Set: Electric Flow Storage Device Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of electric flow storage device.',
    applicableTo: ['IFCELECTRICFLOWSTORAGEDEVICE', 'IFCELECTRICFLOWSTORAGEDEVICEBATTERY', 'IFCELECTRICFLOWSTORAGEDEVICECAPACITOR', 'IFCELECTRICFLOWSTORAGEDEVICECAPACITORBANK', 'IFCELECTRICFLOWSTORAGEDEVICECOMPENSATOR', 'IFCELECTRICFLOWSTORAGEDEVICEHARMONICFILTER', 'IFCELECTRICFLOWSTORAGEDEVICEINDUCTOR', 'IFCELECTRICFLOWSTORAGEDEVICEINDUCTORBANK', 'IFCELECTRICFLOWSTORAGEDEVICERECHARGER', 'IFCELECTRICFLOWSTORAGEDEVICEUPS'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_ElectricGeneratorBaseQuantities': {
    label:       'Quantity Set: Electric Generator Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of electric generator.',
    applicableTo: ['IFCELECTRICGENERATOR', 'IFCELECTRICGENERATORCHP', 'IFCELECTRICGENERATORENGINEGENERATOR', 'IFCELECTRICGENERATORSTANDALONE'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_ElectricMotorBaseQuantities': {
    label:       'Quantity Set: Electric Motor Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of electric motor.',
    applicableTo: ['IFCELECTRICMOTOR', 'IFCELECTRICMOTORDC', 'IFCELECTRICMOTORINDUCTION', 'IFCELECTRICMOTORPOLYPHASE', 'IFCELECTRICMOTORRELUCTANCESYNCHRONOUS', 'IFCELECTRICMOTORSYNCHRONOUS'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_ElectricTimeControlBaseQuantities': {
    label:       'Quantity Set: Electric Time Control Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of electric time control.',
    applicableTo: ['IFCELECTRICTIMECONTROL', 'IFCELECTRICTIMECONTROLRELAY', 'IFCELECTRICTIMECONTROLTIMECLOCK', 'IFCELECTRICTIMECONTROLTIMEDELAY'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_EvaporativeCoolerBaseQuantities': {
    label:       'Quantity Set: Evaporative Cooler Base Quantities',
    description: 'Base quantities that are common to the definition of all types of evaporative coolers.',
    applicableTo: ['IFCEVAPORATIVECOOLER', 'IFCEVAPORATIVECOOLERDIRECTEVAPORATIVEAIRWASHER', 'IFCEVAPORATIVECOOLERDIRECTEVAPORATIVEPACKAGEDROTAR', 'IFCEVAPORATIVECOOLERDIRECTEVAPORATIVERANDOMMEDIAAI', 'IFCEVAPORATIVECOOLERDIRECTEVAPORATIVERIGIDMEDIAAIR', 'IFCEVAPORATIVECOOLERDIRECTEVAPORATIVESLINGERSPACKA', 'IFCEVAPORATIVECOOLERINDIRECTDIRECTCOMBINATION', 'IFCEVAPORATIVECOOLERINDIRECTEVAPORATIVECOOLINGTOWE', 'IFCEVAPORATIVECOOLERINDIRECTEVAPORATIVEPACKAGEAIRC', 'IFCEVAPORATIVECOOLERINDIRECTEVAPORATIVEWETCOIL'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_EvaporatorBaseQuantities': {
    label:       'Quantity Set: Evaporator Base Quantities',
    description: 'Base quantities that are common to the definition of all types of evaporators.',
    applicableTo: ['IFCEVAPORATOR', 'IFCEVAPORATORDIRECTEXPANSION', 'IFCEVAPORATORDIRECTEXPANSIONBRAZEDPLATE', 'IFCEVAPORATORDIRECTEXPANSIONSHELLANDTUBE', 'IFCEVAPORATORDIRECTEXPANSIONTUBEINTUBE', 'IFCEVAPORATORFLOODEDSHELLANDTUBE', 'IFCEVAPORATORSHELLANDCOIL'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_FacilityPartBaseQuantities': {
    label:       'Quantity Set: Facility Part Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of [[IfcFacilityPart]].',
    applicableTo: ['IFCBRIDGEPART', 'IFCBRIDGEPARTABUTMENT', 'IFCBRIDGEPARTDECK', 'IFCBRIDGEPARTDECK_SEGMENT', 'IFCBRIDGEPARTFOUNDATION', 'IFCBRIDGEPARTPIER', 'IFCBRIDGEPARTPIER_SEGMENT', 'IFCBRIDGEPARTPYLON', 'IFCBRIDGEPARTSUBSTRUCTURE', 'IFCBRIDGEPARTSUPERSTRUCTURE', 'IFCBRIDGEPARTSURFACESTRUCTURE', 'IFCFACILITYPART', 'IFCFACILITYPARTCOMMON', 'IFCFACILITYPARTCOMMONABOVEGROUND', 'IFCFACILITYPARTCOMMONBELOWGROUND', 'IFCFACILITYPARTCOMMONJUNCTION', 'IFCFACILITYPARTCOMMONLEVELCROSSING', 'IFCFACILITYPARTCOMMONSEGMENT', 'IFCFACILITYPARTCOMMONSUBSTRUCTURE', 'IFCFACILITYPARTCOMMONSUPERSTRUCTURE', 'IFCFACILITYPARTCOMMONTERMINAL', 'IFCMARINEPART', 'IFCMARINEPARTABOVEWATERLINE', 'IFCMARINEPARTANCHORAGE', 'IFCMARINEPARTAPPROACHCHANNEL', 'IFCMARINEPARTBELOWWATERLINE', 'IFCMARINEPARTBERTHINGSTRUCTURE', 'IFCMARINEPARTCHAMBER', 'IFCMARINEPARTCILL_LEVEL', 'IFCMARINEPARTCOPELEVEL', 'IFCMARINEPARTCORE', 'IFCMARINEPARTCREST', 'IFCMARINEPARTGATEHEAD', 'IFCMARINEPARTGUDINGSTRUCTURE', 'IFCMARINEPARTHIGHWATERLINE', 'IFCMARINEPARTLANDFIELD', 'IFCMARINEPARTLEEWARDSIDE', 'IFCMARINEPARTLOWWATERLINE', 'IFCMARINEPARTMANUFACTURING', 'IFCMARINEPARTNAVIGATIONALAREA', 'IFCMARINEPARTPROTECTION', 'IFCMARINEPARTSHIPTRANSFER', 'IFCMARINEPARTSTORAGEAREA', 'IFCMARINEPARTVEHICLESERVICING', 'IFCMARINEPARTWATERFIELD', 'IFCMARINEPARTWEATHERSIDE', 'IFCRAILWAYPART', 'IFCRAILWAYPARTABOVETRACK', 'IFCRAILWAYPARTDILATIONTRACK', 'IFCRAILWAYPARTLINESIDE', 'IFCRAILWAYPARTLINESIDEPART', 'IFCRAILWAYPARTPLAINTRACK', 'IFCRAILWAYPARTSUBSTRUCTURE', 'IFCRAILWAYPARTTRACK', 'IFCRAILWAYPARTTRACKPART', 'IFCRAILWAYPARTTURNOUTTRACK', 'IFCROADPART', 'IFCROADPARTBICYCLECROSSING', 'IFCROADPARTBUS_STOP', 'IFCROADPARTCARRIAGEWAY', 'IFCROADPARTCENTRALISLAND', 'IFCROADPARTCENTRALRESERVE', 'IFCROADPARTHARDSHOULDER', 'IFCROADPARTINTERSECTION', 'IFCROADPARTLAYBY', 'IFCROADPARTPARKINGBAY', 'IFCROADPARTPASSINGBAY', 'IFCROADPARTPEDESTRIAN_CROSSING', 'IFCROADPARTRAILWAYCROSSING', 'IFCROADPARTREFUGEISLAND', 'IFCROADPARTROADSEGMENT', 'IFCROADPARTROADSIDE', 'IFCROADPARTROADSIDEPART', 'IFCROADPARTROADWAYPLATEAU', 'IFCROADPARTROUNDABOUT', 'IFCROADPARTSHOULDER', 'IFCROADPARTSIDEWALK', 'IFCROADPARTSOFTSHOULDER', 'IFCROADPARTTOLLPLAZA', 'IFCROADPARTTRAFFICISLAND', 'IFCROADPARTTRAFFICLANE'],
    props: [
      { name: 'Area', type: 'IfcReal', description: 'Calculated area for the object.' },
      { name: 'Height', type: 'IfcReal', description: 'Characteristic height' },
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
      { name: 'Volume', type: 'IfcReal', description: 'Volume of the element.' },
      { name: 'Width', type: 'IfcReal', description: 'The width of the object. Only given, if the object has constant thickness (prismatic).' },
    ],
  },

  'Qto_FanBaseQuantities': {
    label:       'Quantity Set: Fan Base Quantities',
    description: 'Base quantities that are common to the definition of all types of fans.',
    applicableTo: ['IFCFAN', 'IFCFANCENTRIFUGALAIRFOIL', 'IFCFANCENTRIFUGALBACKWARDINCLINEDCURVED', 'IFCFANCENTRIFUGALFORWARDCURVED', 'IFCFANCENTRIFUGALRADIAL', 'IFCFANPROPELLORAXIAL', 'IFCFANTUBEAXIAL', 'IFCFANVANEAXIAL'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_FilterBaseQuantities': {
    label:       'Quantity Set: Filter Base Quantities',
    description: 'Base quantities that are common to the definition of all types of filters.',
    applicableTo: ['IFCFILTER', 'IFCFILTERAIRPARTICLEFILTER', 'IFCFILTERCOMPRESSEDAIRFILTER', 'IFCFILTERODORFILTER', 'IFCFILTEROILFILTER', 'IFCFILTERSTRAINER', 'IFCFILTERWATERFILTER'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_FireSuppressionTerminalBaseQuantities': {
    label:       'Quantity Set: Fire Suppression Terminal Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of fire suppression terminal.',
    applicableTo: ['IFCFIRESUPPRESSIONTERMINAL', 'IFCFIRESUPPRESSIONTERMINALBREECHINGINLET', 'IFCFIRESUPPRESSIONTERMINALFIREHYDRANT', 'IFCFIRESUPPRESSIONTERMINALFIREMONITOR', 'IFCFIRESUPPRESSIONTERMINALHOSEREEL', 'IFCFIRESUPPRESSIONTERMINALSPRINKLER', 'IFCFIRESUPPRESSIONTERMINALSPRINKLERDEFLECTOR'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_FlowInstrumentBaseQuantities': {
    label:       'Quantity Set: Flow Instrument Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of flow instrument.',
    applicableTo: ['IFCFLOWINSTRUMENT', 'IFCFLOWINSTRUMENTAMMETER', 'IFCFLOWINSTRUMENTCOMBINED', 'IFCFLOWINSTRUMENTFREQUENCYMETER', 'IFCFLOWINSTRUMENTPHASEANGLEMETER', 'IFCFLOWINSTRUMENTPOWERFACTORMETER', 'IFCFLOWINSTRUMENTPRESSUREGAUGE', 'IFCFLOWINSTRUMENTTHERMOMETER', 'IFCFLOWINSTRUMENTVOLTMETER', 'IFCFLOWINSTRUMENTVOLTMETER_PEAK', 'IFCFLOWINSTRUMENTVOLTMETER_RMS'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_FlowMeterBaseQuantities': {
    label:       'Quantity Set: Flow Meter Base Quantities',
    description: 'Base quantities that are common to the definition of all types of flow meters.',
    applicableTo: ['IFCFLOWMETER', 'IFCFLOWMETERENERGYMETER', 'IFCFLOWMETERGASMETER', 'IFCFLOWMETEROILMETER', 'IFCFLOWMETERWATERMETER'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_FootingBaseQuantities': {
    label:       'Quantity Set: Footing Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of footings.',
    applicableTo: ['IFCFOOTING', 'IFCFOOTINGCAISSON_FOUNDATION', 'IFCFOOTINGFOOTING_BEAM', 'IFCFOOTINGPAD_FOOTING', 'IFCFOOTINGPILE_CAP', 'IFCFOOTINGSTRIP_FOOTING'],
    props: [
      { name: 'CrossSectionArea', type: 'IfcReal', description: 'Total area of the cross section (or profile) of the object.' },
      { name: 'GrossSurfaceArea', type: 'IfcReal', description: 'Total gross area of the object, normally generated as perimeter * length + 2 * cross section area. It is the sum of Oute' },
      { name: 'GrossVolume', type: 'IfcReal', description: 'Total gross volume of the object. Openings, recesses, enclosed objects and projections are not taken into account.' },
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
      { name: 'Height', type: 'IfcReal', description: 'Characteristic height' },
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
      { name: 'NetVolume', type: 'IfcReal', description: 'Total net volume of the object, taking into account possible processing features (cut-out\\\'s, etc.) or openings and reces' },
      { name: 'NetWeight', type: 'IfcReal', description: 'Total net weight of the object without add-on parts, taking into account possible processing features (cut-out\\\'s, etc.)' },
      { name: 'OuterSurfaceArea', type: 'IfcReal', description: 'Total area of the surfaces of the object (not taking into account the end cap areas), normally generated as perimeter *' },
      { name: 'Width', type: 'IfcReal', description: 'The width of the object. Only given, if the object has constant thickness (prismatic).' },
    ],
  },

  'Qto_HeatExchangerBaseQuantities': {
    label:       'Quantity Set: Heat Exchanger Base Quantities',
    description: 'Base quantities that are common to the definition of all types of heat exchangers.',
    applicableTo: ['IFCHEATEXCHANGER', 'IFCHEATEXCHANGERPLATE', 'IFCHEATEXCHANGERSHELLANDTUBE', 'IFCHEATEXCHANGERTURNOUTHEATING'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_HumidifierBaseQuantities': {
    label:       'Quantity Set: Humidifier Base Quantities',
    description: 'Base quantities that are common to the definition of all types of humidifiers.',
    applicableTo: ['IFCHUMIDIFIER', 'IFCHUMIDIFIERADIABATICAIRWASHER', 'IFCHUMIDIFIERADIABATICATOMIZING', 'IFCHUMIDIFIERADIABATICCOMPRESSEDAIRNOZZLE', 'IFCHUMIDIFIERADIABATICPAN', 'IFCHUMIDIFIERADIABATICRIGIDMEDIA', 'IFCHUMIDIFIERADIABATICULTRASONIC', 'IFCHUMIDIFIERADIABATICWETTEDELEMENT', 'IFCHUMIDIFIERASSISTEDBUTANE', 'IFCHUMIDIFIERASSISTEDELECTRIC', 'IFCHUMIDIFIERASSISTEDNATURALGAS', 'IFCHUMIDIFIERASSISTEDPROPANE', 'IFCHUMIDIFIERASSISTEDSTEAM', 'IFCHUMIDIFIERSTEAMINJECTION'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_ImpactProtectionDeviceBaseQuantities': {
    label:       'Quantity Set: Impact Protection Device Base Quantities',
    description: 'Quantity set Impact Protection Device Base.',
    applicableTo: ['IFCIMPACTPROTECTIONDEVICE', 'IFCIMPACTPROTECTIONDEVICEBUMPER', 'IFCIMPACTPROTECTIONDEVICECRASHCUSHION', 'IFCIMPACTPROTECTIONDEVICEDAMPINGSYSTEM', 'IFCIMPACTPROTECTIONDEVICEFENDER'],
    props: [
      { name: 'Weight', type: 'IfcReal', description: 'Total weight of object' },
    ],
  },

  'Qto_InterceptorBaseQuantities': {
    label:       'Quantity Set: Interceptor Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of interceptor.',
    applicableTo: ['IFCINTERCEPTOR', 'IFCINTERCEPTORCYCLONIC', 'IFCINTERCEPTORGREASE', 'IFCINTERCEPTOROIL', 'IFCINTERCEPTORPETROL'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_JunctionBoxBaseQuantities': {
    label:       'Quantity Set: Junction Box Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of junction box.',
    applicableTo: ['IFCJUNCTIONBOX', 'IFCJUNCTIONBOXDATA', 'IFCJUNCTIONBOXPOWER'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
      { name: 'Height', type: 'IfcReal', description: 'Characteristic height' },
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
      { name: 'NumberOfGangs', type: 'IfcInteger', description: 'Number of gangs in the object.' },
      { name: 'Width', type: 'IfcReal', description: 'The width of the object. Only given, if the object has constant thickness (prismatic).' },
    ],
  },

  'Qto_KerbBaseQuantities': {
    label:       'Quantity Set: Kerb Base Quantities',
    description: 'Quantity set for Kerb Base.',
    applicableTo: ['IFCKERB'],
    props: [
      { name: 'Depth', type: 'IfcReal', description: 'The depth of the object.' },
      { name: 'Height', type: 'IfcReal', description: 'Characteristic height' },
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
      { name: 'Volume', type: 'IfcReal', description: 'Volume of the element.' },
      { name: 'Weight', type: 'IfcReal', description: 'Total weight of object' },
      { name: 'Width', type: 'IfcReal', description: 'The width of the object. Only given, if the object has constant thickness (prismatic).' },
    ],
  },

  'Qto_LampBaseQuantities': {
    label:       'Quantity Set: Lamp Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of lamp.',
    applicableTo: ['IFCLAMP', 'IFCLAMPCOMPACTFLUORESCENT', 'IFCLAMPFLUORESCENT', 'IFCLAMPHALOGEN', 'IFCLAMPHIGHPRESSUREMERCURY', 'IFCLAMPHIGHPRESSURESODIUM', 'IFCLAMPLED', 'IFCLAMPMETALHALIDE', 'IFCLAMPOLED', 'IFCLAMPTUNGSTENFILAMENT'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_LightFixtureBaseQuantities': {
    label:       'Quantity Set: Light Fixture Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of light fixture.',
    applicableTo: ['IFCLIGHTFIXTURE', 'IFCLIGHTFIXTUREDIRECTIONSOURCE', 'IFCLIGHTFIXTUREPOINTSOURCE', 'IFCLIGHTFIXTURESECURITYLIGHTING'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_LinearStratumBaseQuantities': {
    label:       'Quantity Set: Linear Stratum Base Quantities',
    description: 'Quantity measures associated to a linear stratum such as in a borehole. Uncertainty is documented in [[Pset_Uncertainty]].',
    applicableTo: ['IFCGEOTECHNICALSTRATUM', 'IFCGEOTECHNICALSTRATUMSOLID', 'IFCGEOTECHNICALSTRATUMVOID', 'IFCGEOTECHNICALSTRATUMWATER'],
    props: [
      { name: 'Diameter', type: 'IfcReal', description: 'The Diameter of the object.' },
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
    ],
  },

  'Qto_MarineFacilityBaseQuantities': {
    label:       'Quantity Set: Marine Facility Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of [[IfcMarineFacility]].',
    applicableTo: ['IFCMARINEFACILITY', 'IFCMARINEFACILITYBARRIERBEACH', 'IFCMARINEFACILITYBREAKWATER', 'IFCMARINEFACILITYCANAL', 'IFCMARINEFACILITYDRYDOCK', 'IFCMARINEFACILITYFLOATINGDOCK', 'IFCMARINEFACILITYHYDROLIFT', 'IFCMARINEFACILITYJETTY', 'IFCMARINEFACILITYLAUNCHRECOVERY', 'IFCMARINEFACILITYMARINEDEFENCE', 'IFCMARINEFACILITYNAVIGATIONALCHANNEL', 'IFCMARINEFACILITYPORT', 'IFCMARINEFACILITYQUAY', 'IFCMARINEFACILITYREVETMENT', 'IFCMARINEFACILITYSHIPLIFT', 'IFCMARINEFACILITYSHIPLOCK', 'IFCMARINEFACILITYSHIPYARD', 'IFCMARINEFACILITYSLIPWAY', 'IFCMARINEFACILITYWATERWAY', 'IFCMARINEFACILITYWATERWAYSHIPLIFT'],
    props: [
      { name: 'Area', type: 'IfcReal', description: 'Calculated area for the object.' },
      { name: 'Height', type: 'IfcReal', description: 'Characteristic height' },
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
      { name: 'Volume', type: 'IfcReal', description: 'Volume of the element.' },
      { name: 'Width', type: 'IfcReal', description: 'The width of the object. Only given, if the object has constant thickness (prismatic).' },
    ],
  },

  'Qto_MemberBaseQuantities': {
    label:       'Quantity Set: Member Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of members.',
    applicableTo: ['IFCMEMBER', 'IFCMEMBERARCH_SEGMENT', 'IFCMEMBERBRACE', 'IFCMEMBERCHORD', 'IFCMEMBERCOLLAR', 'IFCMEMBERMEMBER', 'IFCMEMBERMULLION', 'IFCMEMBERPLATE', 'IFCMEMBERPOST', 'IFCMEMBERPURLIN', 'IFCMEMBERRAFTER', 'IFCMEMBERSTAY_CABLE', 'IFCMEMBERSTIFFENING_RIB', 'IFCMEMBERSTRINGER', 'IFCMEMBERSTRUCTURALCABLE', 'IFCMEMBERSTRUT', 'IFCMEMBERSTUD', 'IFCMEMBERSUSPENDER', 'IFCMEMBERSUSPENSION_CABLE', 'IFCMEMBERTIEBAR'],
    props: [
      { name: 'CrossSectionArea', type: 'IfcReal', description: 'Total area of the cross section (or profile) of the object.' },
      { name: 'GrossSurfaceArea', type: 'IfcReal', description: 'Total gross area of the object, normally generated as perimeter * length + 2 * cross section area. It is the sum of Oute' },
      { name: 'GrossVolume', type: 'IfcReal', description: 'Total gross volume of the object. Openings, recesses, enclosed objects and projections are not taken into account.' },
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
      { name: 'NetSurfaceArea', type: 'IfcReal', description: 'Net surface area of the object, normally generated as perimeter * length + 2 * cross section area taking into account po' },
      { name: 'NetVolume', type: 'IfcReal', description: 'Total net volume of the object, taking into account possible processing features (cut-out\\\'s, etc.) or openings and reces' },
      { name: 'NetWeight', type: 'IfcReal', description: 'Total net weight of the object without add-on parts, taking into account possible processing features (cut-out\\\'s, etc.)' },
      { name: 'OuterSurfaceArea', type: 'IfcReal', description: 'Total area of the surfaces of the object (not taking into account the end cap areas), normally generated as perimeter *' },
    ],
  },

  'Qto_MotorConnectionBaseQuantities': {
    label:       'Quantity Set: Motor Connection Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of motor connection.',
    applicableTo: ['IFCMOTORCONNECTION', 'IFCMOTORCONNECTIONBELTDRIVE', 'IFCMOTORCONNECTIONCOUPLING', 'IFCMOTORCONNECTIONDIRECTDRIVE'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_OpeningElementBaseQuantities': {
    label:       'Quantity Set: Opening Element Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of opening elements.',
    applicableTo: ['IFCOPENINGELEMENT', 'IFCOPENINGELEMENTOPENING', 'IFCOPENINGELEMENTRECESS'],
    props: [
      { name: 'Area', type: 'IfcReal', description: 'Calculated area for the object.' },
      { name: 'Depth', type: 'IfcReal', description: 'The depth of the object.' },
      { name: 'Height', type: 'IfcReal', description: 'Characteristic height' },
      { name: 'Volume', type: 'IfcReal', description: 'Volume of the element.' },
      { name: 'Width', type: 'IfcReal', description: 'The width of the object. Only given, if the object has constant thickness (prismatic).' },
    ],
  },

  'Qto_OutletBaseQuantities': {
    label:       'Quantity Set: Outlet Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of outlet.',
    applicableTo: ['IFCOUTLET', 'IFCOUTLETAUDIOVISUALOUTLET', 'IFCOUTLETCOMMUNICATIONSOUTLET', 'IFCOUTLETDATAOUTLET', 'IFCOUTLETPOWEROUTLET', 'IFCOUTLETTELEPHONEOUTLET'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_PavementBaseQuantities': {
    label:       'Quantity Set: Pavement Base Quantities',
    description: 'Quantity set for Pavement.',
    applicableTo: ['IFCPAVEMENT', 'IFCPAVEMENTFLEXIBLE', 'IFCPAVEMENTRIGID'],
    props: [
      { name: 'Depth', type: 'IfcReal', description: 'The depth of the object.' },
      { name: 'GrossArea', type: 'IfcReal', description: 'Gross Area of the object. Openings, recesses, projections and cut-outs are not taken into account.' },
      { name: 'GrossVolume', type: 'IfcReal', description: 'Total gross volume of the object. Openings, recesses, enclosed objects and projections are not taken into account.' },
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
      { name: 'NetArea', type: 'IfcReal', description: 'Total net area of the object. Openings, recesses and cut-outs are taken into account by subtraction, projections by addi' },
      { name: 'NetVolume', type: 'IfcReal', description: 'Total net volume of the object, taking into account possible processing features (cut-out\\\'s, etc.) or openings and reces' },
      { name: 'Width', type: 'IfcReal', description: 'The width of the object. Only given, if the object has constant thickness (prismatic).' },
    ],
  },

  'Qto_PictorialSignQuantities': {
    label:       'Quantity Set: Pictorial Sign Quantities',
    description: 'Quantity set for Pictorial Signs.',
    applicableTo: ['IFCSIGNPICTORAL'],
    props: [
      { name: 'Area', type: 'IfcReal', description: 'Calculated area for the object.' },
      { name: 'SignArea', type: 'IfcReal', description: 'Sign Area' },
    ],
  },

  'Qto_PileBaseQuantities': {
    label:       'Quantity Set: Pile Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of piles.',
    applicableTo: ['IFCPILE', 'IFCPILEBORED', 'IFCPILECOHESION', 'IFCPILEDRIVEN', 'IFCPILEFRICTION', 'IFCPILEJETGROUTING', 'IFCPILESUPPORT'],
    props: [
      { name: 'CrossSectionArea', type: 'IfcReal', description: 'Total area of the cross section (or profile) of the object.' },
      { name: 'GrossSurfaceArea', type: 'IfcReal', description: 'Total gross area of the object, normally generated as perimeter * length + 2 * cross section area. It is the sum of Oute' },
      { name: 'GrossVolume', type: 'IfcReal', description: 'Total gross volume of the object. Openings, recesses, enclosed objects and projections are not taken into account.' },
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
      { name: 'NetVolume', type: 'IfcReal', description: 'Total net volume of the object, taking into account possible processing features (cut-out\\\'s, etc.) or openings and reces' },
      { name: 'NetWeight', type: 'IfcReal', description: 'Total net weight of the object without add-on parts, taking into account possible processing features (cut-out\\\'s, etc.)' },
      { name: 'OuterSurfaceArea', type: 'IfcReal', description: 'Total area of the surfaces of the object (not taking into account the end cap areas), normally generated as perimeter *' },
    ],
  },

  'Qto_PipeFittingBaseQuantities': {
    label:       'Quantity Set: Pipe Fitting Base Quantities',
    description: 'Base quantities that are common to the definition of all types and occurrences of pipe fittings.',
    applicableTo: ['IFCPIPEFITTING', 'IFCPIPEFITTINGBEND', 'IFCPIPEFITTINGCONNECTOR', 'IFCPIPEFITTINGENTRY', 'IFCPIPEFITTINGEXIT', 'IFCPIPEFITTINGJUNCTION', 'IFCPIPEFITTINGOBSTRUCTION', 'IFCPIPEFITTINGTRANSITION'],
    props: [
      { name: 'GrossCrossSectionArea', type: 'IfcReal', description: 'Area of the cross section.' },
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
      { name: 'NetCrossSectionArea', type: 'IfcReal', description: 'Area of the cross section of the object.' },
      { name: 'NetWeight', type: 'IfcReal', description: 'Total net weight of the object without add-on parts, taking into account possible processing features (cut-out\\\'s, etc.)' },
      { name: 'OuterSurfaceArea', type: 'IfcReal', description: 'Total area of the surfaces of the object (not taking into account the end cap areas), normally generated as perimeter *' },
    ],
  },

  'Qto_PipeSegmentBaseQuantities': {
    label:       'Quantity Set: Pipe Segment Base Quantities',
    description: 'Base quantities that are common to the definition of all types and occurrences of pipe segments.',
    applicableTo: ['IFCPIPESEGMENT', 'IFCPIPESEGMENTCULVERT', 'IFCPIPESEGMENTFLEXIBLESEGMENT', 'IFCPIPESEGMENTGUTTER', 'IFCPIPESEGMENTRIGIDSEGMENT', 'IFCPIPESEGMENTSPOOL'],
    props: [
      { name: 'FootPrintArea', type: 'IfcReal', description: 'Gross area of the site covered by the building(s).' },
      { name: 'GrossCrossSectionArea', type: 'IfcReal', description: 'Area of the cross section.' },
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
      { name: 'NetCrossSectionArea', type: 'IfcReal', description: 'Area of the cross section of the object.' },
      { name: 'NetWeight', type: 'IfcReal', description: 'Total net weight of the object without add-on parts, taking into account possible processing features (cut-out\\\'s, etc.)' },
      { name: 'OuterSurfaceArea', type: 'IfcReal', description: 'Total area of the surfaces of the object (not taking into account the end cap areas), normally generated as perimeter *' },
    ],
  },

  'Qto_PlateBaseQuantities': {
    label:       'Quantity Set: Plate Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of plates.',
    applicableTo: ['IFCPLATE', 'IFCPLATEBASE_PLATE', 'IFCPLATECOVER_PLATE', 'IFCPLATECURTAIN_PANEL', 'IFCPLATEFLANGE_PLATE', 'IFCPLATEGUSSET_PLATE', 'IFCPLATESHEET', 'IFCPLATESPLICE_PLATE', 'IFCPLATESTIFFENER_PLATE', 'IFCPLATEWEB_PLATE'],
    props: [
      { name: 'GrossArea', type: 'IfcReal', description: 'Gross Area of the object. Openings, recesses, projections and cut-outs are not taken into account.' },
      { name: 'GrossVolume', type: 'IfcReal', description: 'Total gross volume of the object. Openings, recesses, enclosed objects and projections are not taken into account.' },
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
      { name: 'NetArea', type: 'IfcReal', description: 'Total net area of the object. Openings, recesses and cut-outs are taken into account by subtraction, projections by addi' },
      { name: 'NetVolume', type: 'IfcReal', description: 'Total net volume of the object, taking into account possible processing features (cut-out\\\'s, etc.) or openings and reces' },
      { name: 'NetWeight', type: 'IfcReal', description: 'Total net weight of the object without add-on parts, taking into account possible processing features (cut-out\\\'s, etc.)' },
      { name: 'Perimeter', type: 'IfcReal', description: 'Perimeter of the object.' },
      { name: 'Width', type: 'IfcReal', description: 'The width of the object. Only given, if the object has constant thickness (prismatic).' },
    ],
  },

  'Qto_ProjectionElementBaseQuantities': {
    label:       'Quantity Set: Projection Element Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of projection elements.',
    applicableTo: ['IFCPROJECTIONELEMENT', 'IFCPROJECTIONELEMENTBLISTER', 'IFCPROJECTIONELEMENTDEVIATOR'],
    props: [
      { name: 'Area', type: 'IfcReal', description: 'Calculated area for the object.' },
      { name: 'Volume', type: 'IfcReal', description: 'Volume of the element.' },
    ],
  },

  'Qto_ProtectiveDeviceBaseQuantities': {
    label:       'Quantity Set: Protective Device Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of protective device.',
    applicableTo: ['IFCPROTECTIVEDEVICE', 'IFCPROTECTIVEDEVICEANTI_ARCING_DEVICE', 'IFCPROTECTIVEDEVICECIRCUITBREAKER', 'IFCPROTECTIVEDEVICEEARTHINGSWITCH', 'IFCPROTECTIVEDEVICEEARTHLEAKAGECIRCUITBREAKER', 'IFCPROTECTIVEDEVICEFUSEDISCONNECTOR', 'IFCPROTECTIVEDEVICERESIDUALCURRENTCIRCUITBREAKER', 'IFCPROTECTIVEDEVICERESIDUALCURRENTSWITCH', 'IFCPROTECTIVEDEVICESPARKGAP', 'IFCPROTECTIVEDEVICEVARISTOR', 'IFCPROTECTIVEDEVICEVOLTAGELIMITER'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_ProtectiveDeviceTrippingUnitBaseQuantities': {
    label:       'Quantity Set: Protective Device Tripping Unit Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of protective device tripping unit.',
    applicableTo: ['IFCPROTECTIVEDEVICETRIPPINGUNIT', 'IFCPROTECTIVEDEVICETRIPPINGUNITELECTROMAGNETIC', 'IFCPROTECTIVEDEVICETRIPPINGUNITELECTRONIC', 'IFCPROTECTIVEDEVICETRIPPINGUNITRESIDUALCURRENT', 'IFCPROTECTIVEDEVICETRIPPINGUNITTHERMAL'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_PumpBaseQuantities': {
    label:       'Quantity Set: Pump Base Quantities',
    description: 'Base quantities that are common to the definition of all types of pumps.',
    applicableTo: ['IFCPUMP', 'IFCPUMPCIRCULATOR', 'IFCPUMPENDSUCTION', 'IFCPUMPSPLITCASE', 'IFCPUMPSUBMERSIBLEPUMP', 'IFCPUMPSUMPPUMP', 'IFCPUMPVERTICALINLINE', 'IFCPUMPVERTICALTURBINE'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_RailBaseQuantities': {
    label:       'Quantity Set: Rail Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of rail.',
    applicableTo: ['IFCRAIL', 'IFCRAILBLADE', 'IFCRAILCHECKRAIL', 'IFCRAILGUARDRAIL', 'IFCRAILRACKRAIL', 'IFCRAILRAIL', 'IFCRAILSTOCKRAIL'],
    props: [
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
      { name: 'Volume', type: 'IfcReal', description: 'Volume of the element.' },
      { name: 'Weight', type: 'IfcReal', description: 'Total weight of object' },
    ],
  },

  'Qto_RailingBaseQuantities': {
    label:       'Quantity Set: Railing Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of railings.',
    applicableTo: ['IFCRAILING', 'IFCRAILINGBALUSTRADE', 'IFCRAILINGFENCE', 'IFCRAILINGGUARDRAIL', 'IFCRAILINGHANDRAIL'],
    props: [
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
    ],
  },

  'Qto_RampFlightBaseQuantities': {
    label:       'Quantity Set: Ramp Flight Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of ramp flights.',
    applicableTo: ['IFCRAMPFLIGHT', 'IFCRAMPFLIGHTSPIRAL', 'IFCRAMPFLIGHTSTRAIGHT'],
    props: [
      { name: 'GrossArea', type: 'IfcReal', description: 'Gross Area of the object. Openings, recesses, projections and cut-outs are not taken into account.' },
      { name: 'GrossVolume', type: 'IfcReal', description: 'Total gross volume of the object. Openings, recesses, enclosed objects and projections are not taken into account.' },
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
      { name: 'NetArea', type: 'IfcReal', description: 'Total net area of the object. Openings, recesses and cut-outs are taken into account by subtraction, projections by addi' },
      { name: 'NetVolume', type: 'IfcReal', description: 'Total net volume of the object, taking into account possible processing features (cut-out\\\'s, etc.) or openings and reces' },
      { name: 'Width', type: 'IfcReal', description: 'The width of the object. Only given, if the object has constant thickness (prismatic).' },
    ],
  },

  'Qto_ReinforcedSoilBaseQuantities': {
    label:       'Quantity Set: Reinforced Soil Base Quantities',
    description: 'Quantity sets for Reinforced Soil Base.',
    applicableTo: ['IFCREINFORCEDSOIL', 'IFCREINFORCEDSOILDYNAMICALLYCOMPACTED', 'IFCREINFORCEDSOILGROUTED', 'IFCREINFORCEDSOILREPLACED', 'IFCREINFORCEDSOILROLLERCOMPACTED', 'IFCREINFORCEDSOILSURCHARGEPRELOADED', 'IFCREINFORCEDSOILVERTICALLYDRAINED'],
    props: [
      { name: 'Area', type: 'IfcReal', description: 'Calculated area for the object.' },
      { name: 'Depth', type: 'IfcReal', description: 'The depth of the object.' },
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
      { name: 'Volume', type: 'IfcReal', description: 'Volume of the element.' },
      { name: 'Width', type: 'IfcReal', description: 'The width of the object. Only given, if the object has constant thickness (prismatic).' },
    ],
  },

  'Qto_ReinforcingElementBaseQuantities': {
    label:       'Quantity Set: Reinforcing Element Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of reinforcement.',
    applicableTo: ['IFCREINFORCINGBAR', 'IFCREINFORCINGBARANCHORING', 'IFCREINFORCINGBAREDGE', 'IFCREINFORCINGBARLIGATURE', 'IFCREINFORCINGBARMAIN', 'IFCREINFORCINGBARPUNCHING', 'IFCREINFORCINGBARRING', 'IFCREINFORCINGBARSHEAR', 'IFCREINFORCINGBARSPACEBAR', 'IFCREINFORCINGBARSTUD', 'IFCREINFORCINGELEMENT', 'IFCREINFORCINGMESH', 'IFCTENDON', 'IFCTENDONANCHOR', 'IFCTENDONANCHORCOUPLER', 'IFCTENDONANCHORFIXED_END', 'IFCTENDONANCHORTENSIONING_END', 'IFCTENDONBAR', 'IFCTENDONCOATED', 'IFCTENDONCONDUIT', 'IFCTENDONCONDUITCOUPLER', 'IFCTENDONCONDUITDIABOLO', 'IFCTENDONCONDUITDUCT', 'IFCTENDONCONDUITGROUTING_DUCT', 'IFCTENDONCONDUITTRUMPET', 'IFCTENDONSTRAND', 'IFCTENDONWIRE'],
    props: [
      { name: 'Count', type: 'IfcReal', description: 'Total count of reinforcing items.' },
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
      { name: 'Weight', type: 'IfcReal', description: 'Total weight of object' },
    ],
  },

  'Qto_RoofBaseQuantities': {
    label:       'Quantity Set: Roof Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of roof.',
    applicableTo: ['IFCROOF', 'IFCROOFBARREL_ROOF', 'IFCROOFBUTTERFLY_ROOF', 'IFCROOFDOME_ROOF', 'IFCROOFFLAT_ROOF', 'IFCROOFFREEFORM', 'IFCROOFGABLE_ROOF', 'IFCROOFGAMBREL_ROOF', 'IFCROOFHIPPED_GABLE_ROOF', 'IFCROOFHIP_ROOF', 'IFCROOFMANSARD_ROOF', 'IFCROOFPAVILION_ROOF', 'IFCROOFRAINBOW_ROOF', 'IFCROOFSHED_ROOF'],
    props: [
      { name: 'GrossArea', type: 'IfcReal', description: 'Gross Area of the object. Openings, recesses, projections and cut-outs are not taken into account.' },
      { name: 'NetArea', type: 'IfcReal', description: 'Total net area of the object. Openings, recesses and cut-outs are taken into account by subtraction, projections by addi' },
      { name: 'ProjectedArea', type: 'IfcReal', description: 'Total gross area of the outer surfaces of the roof, projected tp the ground. It is the sum of all projected roof slab gr' },
    ],
  },

  'Qto_SanitaryTerminalBaseQuantities': {
    label:       'Quantity Set: Sanitary Terminal Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of sanitary terminal.',
    applicableTo: ['IFCSANITARYTERMINAL', 'IFCSANITARYTERMINALBATH', 'IFCSANITARYTERMINALBIDET', 'IFCSANITARYTERMINALCISTERN', 'IFCSANITARYTERMINALSANITARYFOUNTAIN', 'IFCSANITARYTERMINALSHOWER', 'IFCSANITARYTERMINALSINK', 'IFCSANITARYTERMINALTOILETPAN', 'IFCSANITARYTERMINALURINAL', 'IFCSANITARYTERMINALWASHHANDBASIN', 'IFCSANITARYTERMINALWCSEAT'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_SensorBaseQuantities': {
    label:       'Quantity Set: Sensor Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of sensor.',
    applicableTo: ['IFCSENSOR', 'IFCSENSORCO2SENSOR', 'IFCSENSORCONDUCTANCESENSOR', 'IFCSENSORCONTACTSENSOR', 'IFCSENSORCOSENSOR', 'IFCSENSOREARTHQUAKESENSOR', 'IFCSENSORFIRESENSOR', 'IFCSENSORFLOWSENSOR', 'IFCSENSORFOREIGNOBJECTDETECTIONSENSOR', 'IFCSENSORFROSTSENSOR', 'IFCSENSORGASSENSOR', 'IFCSENSORHEATSENSOR', 'IFCSENSORHUMIDITYSENSOR', 'IFCSENSORIDENTIFIERSENSOR', 'IFCSENSORIONCONCENTRATIONSENSOR', 'IFCSENSORLEVELSENSOR', 'IFCSENSORLIGHTSENSOR', 'IFCSENSORMOISTURESENSOR', 'IFCSENSORMOVEMENTSENSOR', 'IFCSENSOROBSTACLESENSOR', 'IFCSENSORPHSENSOR', 'IFCSENSORPRESSURESENSOR', 'IFCSENSORRADIATIONSENSOR', 'IFCSENSORRADIOACTIVITYSENSOR', 'IFCSENSORRAINSENSOR', 'IFCSENSORSMOKESENSOR', 'IFCSENSORSNOWDEPTHSENSOR', 'IFCSENSORSOUNDSENSOR', 'IFCSENSORTEMPERATURESENSOR', 'IFCSENSORTRAINSENSOR', 'IFCSENSORTURNOUTCLOSURESENSOR', 'IFCSENSORWHEELSENSOR', 'IFCSENSORWINDSENSOR'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_SignBaseQuantities': {
    label:       'Quantity Set: Sign Base Quantities',
    description: 'Base quantities for Signs.',
    applicableTo: ['IFCSIGN', 'IFCSIGNMARKER', 'IFCSIGNMIRROR', 'IFCSIGNPICTORAL'],
    props: [
      { name: 'Height', type: 'IfcReal', description: 'Characteristic height' },
      { name: 'Thickness', type: 'IfcReal', description: 'The geometric thickness of the object.' },
      { name: 'Weight', type: 'IfcReal', description: 'Total weight of object' },
      { name: 'Width', type: 'IfcReal', description: 'The width of the object. Only given, if the object has constant thickness (prismatic).' },
    ],
  },

  'Qto_SignalBaseQuantities': {
    label:       'Quantity Set: Signal Base Quantities',
    description: 'Base quantities for Signals.',
    applicableTo: ['IFCSIGNAL', 'IFCSIGNALAUDIO', 'IFCSIGNALMIXED', 'IFCSIGNALVISUAL'],
    props: [
      { name: 'Weight', type: 'IfcReal', description: 'Total weight of object' },
    ],
  },

  'Qto_SiteBaseQuantities': {
    label:       'Quantity Set: Site Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of site.',
    applicableTo: ['IFCSITE'],
    props: [
      { name: 'GrossArea', type: 'IfcReal', description: 'Gross Area of the object. Openings, recesses, projections and cut-outs are not taken into account.' },
      { name: 'GrossPerimeter', type: 'IfcReal', description: 'Gross perimeter at the outer contour of the object.' },
    ],
  },

  'Qto_SlabBaseQuantities': {
    label:       'Quantity Set: Slab Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of slabs.',
    applicableTo: ['IFCSLAB', 'IFCSLABAPPROACH_SLAB', 'IFCSLABBASESLAB', 'IFCSLABFLOOR', 'IFCSLABLANDING', 'IFCSLABPAVING', 'IFCSLABROOF', 'IFCSLABSIDEWALK', 'IFCSLABTRACKSLAB', 'IFCSLABWEARING'],
    props: [
      { name: 'Depth', type: 'IfcReal', description: 'The depth of the object.' },
      { name: 'GrossArea', type: 'IfcReal', description: 'Gross Area of the object. Openings, recesses, projections and cut-outs are not taken into account.' },
      { name: 'GrossVolume', type: 'IfcReal', description: 'Total gross volume of the object. Openings, recesses, enclosed objects and projections are not taken into account.' },
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
      { name: 'NetArea', type: 'IfcReal', description: 'Total net area of the object. Openings, recesses and cut-outs are taken into account by subtraction, projections by addi' },
      { name: 'NetVolume', type: 'IfcReal', description: 'Total net volume of the object, taking into account possible processing features (cut-out\\\'s, etc.) or openings and reces' },
      { name: 'NetWeight', type: 'IfcReal', description: 'Total net weight of the object without add-on parts, taking into account possible processing features (cut-out\\\'s, etc.)' },
      { name: 'Perimeter', type: 'IfcReal', description: 'Perimeter of the object.' },
      { name: 'Width', type: 'IfcReal', description: 'The width of the object. Only given, if the object has constant thickness (prismatic).' },
    ],
  },

  'Qto_SleeperBaseQuantities': {
    label:       'Quantity Set: Sleeper Base Quantities',
    description: 'Base quantities common to the definition to all occurrences of [[IfcTrackElement]] with PredefinedType set to SLEEPER.',
    applicableTo: ['IFCTRACKELEMENTSLEEPER'],
    props: [
      { name: 'Height', type: 'IfcReal', description: 'Characteristic height' },
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
      { name: 'Width', type: 'IfcReal', description: 'The width of the object. Only given, if the object has constant thickness (prismatic).' },
    ],
  },

  'Qto_SolarDeviceBaseQuantities': {
    label:       'Quantity Set: Solar Device Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of solar devices.',
    applicableTo: ['IFCSOLARDEVICE', 'IFCSOLARDEVICESOLARCOLLECTOR', 'IFCSOLARDEVICESOLARPANEL'],
    props: [
      { name: 'GrossArea', type: 'IfcReal', description: 'Gross Area of the object. Openings, recesses, projections and cut-outs are not taken into account.' },
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_SpaceBaseQuantities': {
    label:       'Quantity Set: Space Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of spaces.',
    applicableTo: ['IFCSPACE', 'IFCSPACEBERTH', 'IFCSPACEEXTERNAL', 'IFCSPACEGFA', 'IFCSPACEINTERNAL', 'IFCSPACEPARKING', 'IFCSPACESPACE'],
    props: [
      { name: 'FinishCeilingHeight', type: 'IfcReal', description: 'Height of the suspended ceiling (from top of flooring to the bottom of the suspended ceiling). To be provided only if th' },
      { name: 'FinishFloorHeight', type: 'IfcReal', description: 'Height of the flooring (from base slab without flooring to the flooring height). To be provided only if the space has a' },
      { name: 'GrossCeilingArea', type: 'IfcReal', description: 'Sum of all ceiling areas of the space. It includes the area covered by elementsinside the space (columns, inner walls, e' },
      { name: 'GrossFloorArea', type: 'IfcReal', description: 'Sum of all gross floor areas within the spatial structure element.' },
      { name: 'GrossPerimeter', type: 'IfcReal', description: 'Gross perimeter at the outer contour of the object.' },
      { name: 'GrossVolume', type: 'IfcReal', description: 'Total gross volume of the object. Openings, recesses, enclosed objects and projections are not taken into account.' },
      { name: 'GrossWallArea', type: 'IfcReal', description: 'Sum of all wall (and other vertically bounding elements, like columns) areas bounded by the space. It includes the area' },
      { name: 'Height', type: 'IfcReal', description: 'Characteristic height' },
      { name: 'NetCeilingArea', type: 'IfcReal', description: 'Sum of all ceiling areas of the space. It excludes the area covered by elementsinside the space (columns, inner walls, e' },
      { name: 'NetFloorArea', type: 'IfcReal', description: 'Sum of all net usable floor areas.' },
      { name: 'NetPerimeter', type: 'IfcReal', description: 'Net perimeter at the floor level of this space. It excludes those parts of the perimeter that are created by by virtual' },
      { name: 'NetVolume', type: 'IfcReal', description: 'Total net volume of the object, taking into account possible processing features (cut-out\\\'s, etc.) or openings and reces' },
      { name: 'NetWallArea', type: 'IfcReal', description: 'Sum of all wall (and other vertically bounding elements, like columns) areas bounded by the space. It excludes the area' },
    ],
  },

  'Qto_SpaceHeaterBaseQuantities': {
    label:       'Quantity Set: Space Heater Base Quantities',
    description: 'Base quantities that are common to the definition of all types of space heaters.',
    applicableTo: ['IFCSPACEHEATER', 'IFCSPACEHEATERCONVECTOR', 'IFCSPACEHEATERRADIATOR'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
      { name: 'NetWeight', type: 'IfcReal', description: 'Total net weight of the object without add-on parts, taking into account possible processing features (cut-out\\\'s, etc.)' },
    ],
  },

  'Qto_SpatialZoneBaseQuantities': {
    label:       'Quantity Set: Spatial Zone Base Quantities',
    description: 'Base quantities set for Spatial Zones.',
    applicableTo: ['IFCSPATIALZONE', 'IFCSPATIALZONECONSTRUCTION', 'IFCSPATIALZONEFIRESAFETY', 'IFCSPATIALZONEINTERFERENCE', 'IFCSPATIALZONELIGHTING', 'IFCSPATIALZONEOCCUPANCY', 'IFCSPATIALZONERESERVATION', 'IFCSPATIALZONESECURITY', 'IFCSPATIALZONETHERMAL', 'IFCSPATIALZONETRANSPORT', 'IFCSPATIALZONEVENTILATION'],
    props: [
      { name: 'Height', type: 'IfcReal', description: 'Characteristic height' },
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
      { name: 'Width', type: 'IfcReal', description: 'The width of the object. Only given, if the object has constant thickness (prismatic).' },
    ],
  },

  'Qto_StackTerminalBaseQuantities': {
    label:       'Quantity Set: Stack Terminal Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of stack terminal.',
    applicableTo: ['IFCSTACKTERMINAL', 'IFCSTACKTERMINALBIRDCAGE', 'IFCSTACKTERMINALCOWL', 'IFCSTACKTERMINALRAINWATERHOPPER'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_StairFlightBaseQuantities': {
    label:       'Quantity Set: Stair Flight Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of stair flights.',
    applicableTo: ['IFCSTAIRFLIGHT', 'IFCSTAIRFLIGHTCURVED', 'IFCSTAIRFLIGHTFREEFORM', 'IFCSTAIRFLIGHTSPIRAL', 'IFCSTAIRFLIGHTSTRAIGHT', 'IFCSTAIRFLIGHTWINDER'],
    props: [
      { name: 'GrossVolume', type: 'IfcReal', description: 'Total gross volume of the object. Openings, recesses, enclosed objects and projections are not taken into account.' },
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
      { name: 'NetVolume', type: 'IfcReal', description: 'Total net volume of the object, taking into account possible processing features (cut-out\\\'s, etc.) or openings and reces' },
    ],
  },

  'Qto_SurfaceFeatureBaseQuantities': {
    label:       'Quantity Set: Surface Feature Base Quantities',
    description: 'Base quantities for Surface Features.',
    applicableTo: ['IFCSURFACEFEATURE', 'IFCSURFACEFEATUREDEFECT', 'IFCSURFACEFEATUREHATCHMARKING', 'IFCSURFACEFEATURELINEMARKING', 'IFCSURFACEFEATUREMARK', 'IFCSURFACEFEATURENONSKIDSURFACING', 'IFCSURFACEFEATUREPAVEMENTSURFACEMARKING', 'IFCSURFACEFEATURERUMBLESTRIP', 'IFCSURFACEFEATURESYMBOLMARKING', 'IFCSURFACEFEATURETAG', 'IFCSURFACEFEATURETRANSVERSERUMBLESTRIP', 'IFCSURFACEFEATURETREATMENT'],
    props: [
      { name: 'Area', type: 'IfcReal', description: 'Calculated area for the object.' },
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
    ],
  },

  'Qto_SwitchingDeviceBaseQuantities': {
    label:       'Quantity Set: Switching Device Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of switching device.',
    applicableTo: ['IFCSWITCHINGDEVICE', 'IFCSWITCHINGDEVICECONTACTOR', 'IFCSWITCHINGDEVICEDIMMERSWITCH', 'IFCSWITCHINGDEVICEEMERGENCYSTOP', 'IFCSWITCHINGDEVICEKEYPAD', 'IFCSWITCHINGDEVICEMOMENTARYSWITCH', 'IFCSWITCHINGDEVICERELAY', 'IFCSWITCHINGDEVICESELECTORSWITCH', 'IFCSWITCHINGDEVICESTARTER', 'IFCSWITCHINGDEVICESTART_AND_STOP_EQUIPMENT', 'IFCSWITCHINGDEVICESWITCHDISCONNECTOR', 'IFCSWITCHINGDEVICETOGGLESWITCH'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_TankBaseQuantities': {
    label:       'Quantity Set: Tank Base Quantities',
    description: 'Base quantities that are common to the definition of all types of tanks.',
    applicableTo: ['IFCTANK', 'IFCTANKBASIN', 'IFCTANKBREAKPRESSURE', 'IFCTANKEXPANSION', 'IFCTANKFEEDANDEXPANSION', 'IFCTANKOILRETENTIONTRAY', 'IFCTANKPRESSUREVESSEL', 'IFCTANKSTORAGE', 'IFCTANKVESSEL'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
      { name: 'NetWeight', type: 'IfcReal', description: 'Total net weight of the object without add-on parts, taking into account possible processing features (cut-out\\\'s, etc.)' },
      { name: 'TotalSurfaceArea', type: 'IfcReal', description: 'Total surface area of the element.' },
    ],
  },

  'Qto_TransformerBaseQuantities': {
    label:       'Quantity Set: Transformer Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of transformer.',
    applicableTo: ['IFCTRANSFORMER', 'IFCTRANSFORMERCHOPPER', 'IFCTRANSFORMERCOMBINED', 'IFCTRANSFORMERCURRENT', 'IFCTRANSFORMERFREQUENCY', 'IFCTRANSFORMERINVERTER', 'IFCTRANSFORMERRECTIFIER', 'IFCTRANSFORMERVOLTAGE'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_TubeBundleBaseQuantities': {
    label:       'Quantity Set: Tube Bundle Base Quantities',
    description: 'Base quantities that are common to the definition of all types of tube bundles.',
    applicableTo: ['IFCTUBEBUNDLE', 'IFCTUBEBUNDLEFINNED'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
      { name: 'NetWeight', type: 'IfcReal', description: 'Total net weight of the object without add-on parts, taking into account possible processing features (cut-out\\\'s, etc.)' },
    ],
  },

  'Qto_UnitaryControlElementBaseQuantities': {
    label:       'Quantity Set: Unitary Control Element Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of unitary control element.',
    applicableTo: ['IFCUNITARYCONTROLELEMENT', 'IFCUNITARYCONTROLELEMENTALARMPANEL', 'IFCUNITARYCONTROLELEMENTBASESTATIONCONTROLLER', 'IFCUNITARYCONTROLELEMENTCOMBINED', 'IFCUNITARYCONTROLELEMENTCONTROLPANEL', 'IFCUNITARYCONTROLELEMENTGASDETECTIONPANEL', 'IFCUNITARYCONTROLELEMENTHUMIDISTAT', 'IFCUNITARYCONTROLELEMENTINDICATORPANEL', 'IFCUNITARYCONTROLELEMENTMIMICPANEL', 'IFCUNITARYCONTROLELEMENTTHERMOSTAT', 'IFCUNITARYCONTROLELEMENTWEATHERSTATION'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_UnitaryEquipmentBaseQuantities': {
    label:       'Quantity Set: Unitary Equipment Base Quantities',
    description: 'Base quantities that are common to the definition of all types of unitary equipment.',
    applicableTo: ['IFCUNITARYEQUIPMENT', 'IFCUNITARYEQUIPMENTAIRCONDITIONINGUNIT', 'IFCUNITARYEQUIPMENTAIRHANDLER', 'IFCUNITARYEQUIPMENTDEHUMIDIFIER', 'IFCUNITARYEQUIPMENTROOFTOPUNIT', 'IFCUNITARYEQUIPMENTSPLITSYSTEM'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_ValveBaseQuantities': {
    label:       'Quantity Set: Valve Base Quantities',
    description: 'Base quantities that are common to the definition of all types of valves.',
    applicableTo: ['IFCVALVE', 'IFCVALVEAIRRELEASE', 'IFCVALVEANTIVACUUM', 'IFCVALVECHANGEOVER', 'IFCVALVECHECK', 'IFCVALVECOMMISSIONING', 'IFCVALVEDIVERTING', 'IFCVALVEDOUBLECHECK', 'IFCVALVEDOUBLEREGULATING', 'IFCVALVEDRAWOFFCOCK', 'IFCVALVEFAUCET', 'IFCVALVEFLUSHING', 'IFCVALVEGASCOCK', 'IFCVALVEGASTAP', 'IFCVALVEISOLATING', 'IFCVALVEMIXING', 'IFCVALVEPRESSUREREDUCING', 'IFCVALVEPRESSURERELIEF', 'IFCVALVEREGULATING', 'IFCVALVESAFETYCUTOFF', 'IFCVALVESTEAMTRAP', 'IFCVALVESTOPCOCK'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_VehicleBaseQuantities': {
    label:       'Quantity Set: Vehicle Base Quantities',
    description: 'Quantities for vehicles',
    applicableTo: ['IFCVEHICLEROLLINGSTOCK', 'IFCVEHICLEVEHICLE', 'IFCVEHICLEVEHICLEAIR', 'IFCVEHICLEVEHICLEMARINE', 'IFCVEHICLEVEHICLETRACKED'],
    props: [
      { name: 'Height', type: 'IfcReal', description: 'Characteristic height' },
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
      { name: 'Width', type: 'IfcReal', description: 'The width of the object. Only given, if the object has constant thickness (prismatic).' },
    ],
  },

  'Qto_VibrationIsolatorBaseQuantities': {
    label:       'Quantity Set: Vibration Isolator Base Quantities',
    description: 'Base quantities that are common to the definition of all types of vibration isolators.',
    applicableTo: ['IFCVIBRATIONISOLATOR', 'IFCVIBRATIONISOLATORBASE', 'IFCVIBRATIONISOLATORCOMPRESSION', 'IFCVIBRATIONISOLATORSPRING'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_VolumetricStratumBaseQuantities': {
    label:       'Quantity Set: Volumetric Stratum Base Quantities',
    description: 'Quantity measures associated to volumetric stratum such as in a geotechnical model. Uncertainty is documented in [[Pset_Uncertainty]].',
    applicableTo: ['IFCGEOTECHNICALSTRATUM', 'IFCGEOTECHNICALSTRATUMSOLID', 'IFCGEOTECHNICALSTRATUMVOID', 'IFCGEOTECHNICALSTRATUMWATER'],
    props: [
      { name: 'Area', type: 'IfcReal', description: 'Calculated area for the object.' },
      { name: 'Mass', type: 'IfcReal', description: 'Mass represented, if lower surface of stratum known.' },
      { name: 'PlanArea', type: 'IfcReal', description: 'Projected plan area of upper surface of model.' },
      { name: 'Volume', type: 'IfcReal', description: 'Volume of the element.' },
    ],
  },

  'Qto_WallBaseQuantities': {
    label:       'Quantity Set: Wall Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of walls.',
    applicableTo: ['IFCWALL', 'IFCWALLELEMENTEDWALL', 'IFCWALLMOVABLE', 'IFCWALLPARAPET', 'IFCWALLPARTITIONING', 'IFCWALLPLUMBINGWALL', 'IFCWALLPOLYGONAL', 'IFCWALLRETAININGWALL', 'IFCWALLSHEAR', 'IFCWALLSOLIDWALL', 'IFCWALLSTANDARD', 'IFCWALLWAVEWALL'],
    props: [
      { name: 'GrossFootPrintArea', type: 'IfcReal', description: 'Area of the wall as viewed by a ground floor view, not taking any wall modifications (like recesses) into account. It is' },
      { name: 'GrossSideArea', type: 'IfcReal', description: 'Area of the wall as viewed by an elevation view of the middle plane of the wall. It does not take into account any wall' },
      { name: 'GrossVolume', type: 'IfcReal', description: 'Total gross volume of the object. Openings, recesses, enclosed objects and projections are not taken into account.' },
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
      { name: 'Height', type: 'IfcReal', description: 'Characteristic height' },
      { name: 'Length', type: 'IfcReal', description: 'The length of the object.' },
      { name: 'NetFootPrintArea', type: 'IfcReal', description: 'Area of the wall as viewed by a ground floor view, taking all wall modifications (like recesses) into account. It is als' },
      { name: 'NetSideArea', type: 'IfcReal', description: 'Area of the object as viewed by an elevation view of the middle plane of the object. It does take into account all objec' },
      { name: 'NetVolume', type: 'IfcReal', description: 'Total net volume of the object, taking into account possible processing features (cut-out\\\'s, etc.) or openings and reces' },
      { name: 'NetWeight', type: 'IfcReal', description: 'Total net weight of the object without add-on parts, taking into account possible processing features (cut-out\\\'s, etc.)' },
      { name: 'Width', type: 'IfcReal', description: 'The width of the object. Only given, if the object has constant thickness (prismatic).' },
    ],
  },

  'Qto_WasteTerminalBaseQuantities': {
    label:       'Quantity Set: Waste Terminal Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of waste terminal.',
    applicableTo: ['IFCWASTETERMINAL', 'IFCWASTETERMINALFLOORTRAP', 'IFCWASTETERMINALFLOORWASTE', 'IFCWASTETERMINALGULLYSUMP', 'IFCWASTETERMINALGULLYTRAP', 'IFCWASTETERMINALROOFDRAIN', 'IFCWASTETERMINALWASTEDISPOSALUNIT', 'IFCWASTETERMINALWASTETRAP'],
    props: [
      { name: 'GrossWeight', type: 'IfcReal', description: 'Total Gross Weight of the object without any add-on parts and not taking into account possible processing features (cut-' },
    ],
  },

  'Qto_WindowBaseQuantities': {
    label:       'Quantity Set: Window Base Quantities',
    description: 'Base quantities that are common to the definition of all occurrences of windows.',
    applicableTo: ['IFCWINDOW', 'IFCWINDOWLIGHTDOME', 'IFCWINDOWSKYLIGHT', 'IFCWINDOWWINDOW'],
    props: [
      { name: 'Area', type: 'IfcReal', description: 'Calculated area for the object.' },
      { name: 'Height', type: 'IfcReal', description: 'Characteristic height' },
      { name: 'Perimeter', type: 'IfcReal', description: 'Perimeter of the object.' },
      { name: 'Width', type: 'IfcReal', description: 'The width of the object. Only given, if the object has constant thickness (prismatic).' },
    ],
  },
};

/** Return templates matching a given IFC entity type (uppercase). */
export function getPsetsForType(ifcType) {
  const upper = (ifcType ?? '').toUpperCase();
  return Object.entries(PSET_TEMPLATES).filter(([, tpl]) =>
    tpl.applicableTo.includes('*') || tpl.applicableTo.includes(upper)
  );
}

/** Return all templates as sorted [name, template] pairs. */
export function getAllPsets() {
  return Object.entries(PSET_TEMPLATES);
}