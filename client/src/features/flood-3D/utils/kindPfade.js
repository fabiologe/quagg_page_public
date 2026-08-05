// Objektlisten der casespec: Auswahl-Kind → Pfad in der Spec.
// EINE Tabelle für Store und Aufräumkaskade — die zwei Kopien waren
// auseinandergelaufen (kante fehlte, Löschen scheiterte still).
export const KIND_PATHS = {
  terrain_op: (s) => s.terrain?.operations,
  structure: (s) => s.structures,
  kante: (s) => s.terrain?.kanten,
  refinement: (s) => s.mesh?.refinements,
  boundary: (s) => s.boundaries,
  vorfuellung: (s) => s.solver?.vorfuellungen,
  section: (s) => s.evaluation?.sections,
  gauge: (s) => s.evaluation?.gauges,
  target: (s) => s.evaluation?.targets,
}

export const KIND_NAMEN = {
  terrain_op: 'Geländeoperation', structure: 'Bauwerk',
  kante: 'Vermessungskante', refinement: 'Verfeinerung',
  boundary: 'Randbedingung', vorfuellung: 'Vorfüllung', section: 'Querschnitt', gauge: 'Pegel',
  target: 'Nachweiskriterium',
}
