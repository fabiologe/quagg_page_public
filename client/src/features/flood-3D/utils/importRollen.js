// Rollenkatalog des Geometrie-Imports — EINE Quelle für den Import-Dialog
// und die nachträgliche Umzuordnung (PropertyPanel „Zuordnung ändern").
// Nach WIRKUNG gruppiert, nicht alphabetisch: eine Linie formt entweder
// das Gelände, oder sie wird ein Bauteil, das umströmt wird.
export const ROLE_LABELS = {
  gelaende: 'Gelände (Höhenfläche)',
  gelaende_koerper: 'Gelände als Volumenkörper',
  wand: 'Wand', pfeiler: 'Pfeiler', wehr: 'Wehr',
  becken: 'Becken', bauwerk: 'Bauwerk', querschnitt: 'Querschnitt',
  boeschung_ok: 'Böschungsoberkante', boeschung_uk: 'Böschungsunterkante',
  bruchkante: 'Bruchkante (Gelände)',
  sohle: 'Sohle (Ankerfläche)', beckenrand: 'Beckenrand', krone: 'Krone',
  mauer: 'Mauerkrone → Wand', wehrkrone: 'Überfallkante → Wehr',
  zusatzraster: 'Zusatzraster (Bereich ersetzen)',
  zulaufrohr: 'Rohr am Zulauf', ablaufrohr: 'Rohr am Ablauf',
  gerinne: 'Gerinne einschneiden', damm: 'Dammschüttung',
  planum: 'Planum', stutzen: 'Stutzen (Rohr)',
  verfeinerung: 'Verfeinerungsbox',
  ignorieren: '— ignorieren —',
}
export const MESH_ROLES = ['gelaende', 'gelaende_koerper', 'wand', 'pfeiler',
  'wehr', 'becken', 'bauwerk', 'ignorieren']
export const MATERIAL_LABELS = {
  stahl: 'Stahl (k_s 0,1 mm)', beton_glatt: 'Beton glatt (0,5 mm)',
  beton: 'Beton (2 mm)', mauerwerk: 'Mauerwerk (5 mm)',
  holz: 'Holz (0,8 mm)', erde: 'Erde (30 mm)',
  steinschuettung: 'Steinschüttung (100 mm)',
}

export const MATERIALS = ['stahl', 'beton_glatt', 'beton', 'mauerwerk',
  'holz', 'erde', 'steinschuettung']
export const SOLID_ROLES = new Set(['wand', 'pfeiler', 'wehr', 'becken',
  'bauwerk'])
// Rollen, aus denen ein GELÄNDE entstehen kann. Mauerkrone und
// Überfallkante gehören ausdrücklich nicht dazu: sie werden Bauteile.
export const KANTEN_ROLLEN = new Set(['bruchkante', 'boeschung_ok',
  'boeschung_uk', 'sohle', 'beckenrand', 'krone'])
export const LINIEN_ROLLEN = [
  { titel: 'formt das Gelände',
    rollen: ['bruchkante', 'boeschung_ok', 'boeschung_uk', 'sohle',
      'beckenrand', 'krone', 'gerinne', 'damm', 'planum'] },
  { titel: 'wird ein Bauteil (umströmt)',
    rollen: ['mauer', 'wehrkrone', 'wand', 'becken', 'stutzen'] },
  { titel: 'sonstiges',
    rollen: ['querschnitt', 'verfeinerung', 'ignorieren'] },
]
export const RASTER_ROLLEN = [{ titel: 'Höhendaten',
  rollen: ['gelaende', 'zusatzraster', 'ignorieren'] }]
export const ROHR_ROLLEN = [{ titel: 'Rohrmündung',
  rollen: ['zulaufrohr', 'ablaufrohr', 'ignorieren'] }]
export const NETZ_ROLLEN = [
  { titel: 'Gelände', rollen: ['gelaende', 'gelaende_koerper'] },
  { titel: 'Bauteil', rollen: MESH_ROLES.filter((r) => SOLID_ROLES.has(r)) },
  { titel: 'sonstiges', rollen: ['ignorieren'] },
]
export const NUR_IGNORIEREN = [{ titel: 'sonstiges', rollen: ['ignorieren'] }]
export const rollenFuerKind = (kind) => (kind === 'polyline' ? LINIEN_ROLLEN
  : kind === 'raster' ? RASTER_ROLLEN
    : kind === 'kreis' ? ROHR_ROLLEN
      : (kind === 'acis' || kind === 'hinweis') ? NUR_IGNORIEREN
        : NETZ_ROLLEN)
