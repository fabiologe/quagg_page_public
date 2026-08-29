/**
 * Merkmalsdaten aus web-ifc (Sprint I, Stufe 5 — erster Engine-Schnitt).
 *
 * `parseItemData` lag als Methode in `IfcEngine` und war damit ungetestet:
 * kein einziger der 42 Tests importiert die Engine, weil sie WebGL braucht.
 * Die Funktion selbst brauchte davon nie etwas — sie nimmt ein einfaches
 * Objekt und gibt eines zurück. Ausgelagert ist sie sofort prüfbar, und genau
 * das ist der eigentliche Gewinn der Entflechtung.
 *
 * Was sie leistet, ist die Übersetzung der web-ifc-Rohform in das, was die
 * Eigenschaftsleiste zeigt. web-ifc verpackt fast jeden Wert in `{value: …}` —
 * mal nicht, und Mengen tragen je nach Art einen anderen Feldnamen
 * (LengthValue, AreaValue, VolumeValue …). Beides ist hier festgehalten.
 */
import { describe, expect, it } from 'vitest';
import { parseItemData } from '../services/IfcItemData';

/** Rohform von `fragments.getData`: { modelId: [item, …] }. */
const roh = (item) => ({ 'modell-1': [item] });

describe('parseItemData', () => {
  it('liest die Kopfdaten und macht die Kategorie zu Großbuchstaben', () => {
    const d = parseItemData(roh({
      _category: { value: 'IfcWall' },
      GlobalId: { value: '0aB$cd' },
      Name: { value: 'Außenwand' },
      Description: { value: 'tragend' },
      PredefinedType: { value: 'SOLIDWALL' },
    }));
    expect(d).toMatchObject({
      type: 'IFCWALL', globalId: '0aB$cd', name: 'Außenwand',
      description: 'tragend', predefinedType: 'SOLIDWALL',
    });
  });

  it('nimmt Werte mit UND ohne {value}-Hülle', () => {
    // web-ifc ist darin nicht einheitlich; wer nur eine Form kennt, verliert
    // stillschweigend die andere.
    const d = parseItemData(roh({ _category: 'IFCSLAB', Name: 'Decke' }));
    expect(d.type).toBe('IFCSLAB');
    expect(d.name).toBe('Decke');
  });

  it('lässt reservierte Felder aus der Attributliste weg', () => {
    // Name, GlobalId und die Beziehungen haben eigene Plätze in der Anzeige —
    // sie noch einmal als Attribut zu führen wäre doppelt.
    const d = parseItemData(roh({
      _category: { value: 'IFCWALL' },
      GlobalId: { value: 'x' }, Name: { value: 'W' }, Description: { value: 'd' },
      OwnerHistory: { value: 'weg' }, IsDefinedBy: [], IsTypedBy: [], HasAssociations: [],
      Tag: { value: 'W-01' },
    }));
    expect(d.attrs).toEqual([{ name: 'Tag', value: 'W-01' }]);
  });

  it('überspringt leere und verschachtelte Attributwerte', () => {
    const d = parseItemData(roh({
      _category: { value: 'IFCWALL' },
      Leer: { value: '' }, Nix: null, Objekt: { a: 1 }, Gut: { value: 42 },
    }));
    expect(d.attrs).toEqual([{ name: 'Gut', value: '42' }]);
  });

  it('trennt Merkmalssätze von Mengen', () => {
    const d = parseItemData(roh({
      _category: { value: 'IFCWALL' },
      IsDefinedBy: [
        { Name: { value: 'Pset_WallCommon' },
          HasProperties: [{ Name: { value: 'IsExternal' }, NominalValue: { value: true } }] },
        { Name: { value: 'Qto_WallBaseQuantities' },
          HasQuantities: [
            { Name: { value: 'Length' }, LengthValue: { value: 5.2 } },
            { Name: { value: 'NetSideArea' }, AreaValue: { value: 13 } },
            { Name: { value: 'NetVolume' }, VolumeValue: { value: 3.1 } },
          ] },
      ],
    }));
    expect(d.psets).toEqual([
      { name: 'Pset_WallCommon', props: [{ name: 'IsExternal', value: true }] },
    ]);
    expect(d.quantities[0].name).toBe('Qto_WallBaseQuantities');
    // Je Mengenart ein anderer Feldname — alle drei müssen ankommen.
    expect(d.quantities[0].props).toEqual([
      { name: 'Length', value: 5.2 },
      { name: 'NetSideArea', value: 13 },
      { name: 'NetVolume', value: 3.1 },
    ]);
  });

  it('lässt namenlose Merkmale weg, behält aber den Satz', () => {
    const d = parseItemData(roh({
      _category: { value: 'IFCWALL' },
      IsDefinedBy: [{ Name: { value: 'Pset_Leer' }, HasProperties: [{ NominalValue: { value: 'x' } }] }],
    }));
    expect(d.psets).toEqual([{ name: 'Pset_Leer', props: [] }]);
  });

  it('liest Typnamen und Materialien', () => {
    const d = parseItemData(roh({
      _category: { value: 'IFCWALL' },
      IsTypedBy: [{ Name: { value: 'Wandtyp 24' } }],
      HasAssociations: [
        { RelatingMaterial: { Name: { value: 'Beton C25/30' } } },
        { RelatingMaterial: { Name: 'Dämmung' } },
        { RelatingMaterial: {} },            // ohne Namen — faellt weg
        { },                                  // ohne Material — faellt weg
      ],
    }));
    expect(d.typeName).toBe('Wandtyp 24');
    expect(d.materials).toEqual(['Beton C25/30', 'Dämmung']);
  });

  it('gibt null, wenn nichts da ist', () => {
    expect(parseItemData({})).toBeNull();
    expect(parseItemData({ 'modell-1': [] })).toBeNull();
  });

  it('kommt ohne jede Beziehung aus', () => {
    const d = parseItemData(roh({ _category: { value: 'IFCBEAM' } }));
    expect(d).toMatchObject({ type: 'IFCBEAM', name: '', psets: [], quantities: [], materials: [] });
    expect(d.typeName).toBeNull();
  });
});
