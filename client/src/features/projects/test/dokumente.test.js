import { describe, expect, it } from 'vitest';
import { endung, officeArt, onlineBearbeitbar, relativZumProjekt, vorschauArt } from '../services/Dokumente';

describe('Dokumente', () => {
  it('erkennt Endungen, Office-Art und Vorschau', () => {
    expect(endung('Angebot Nr 1.DOCX')).toBe('docx');
    expect(endung('ohne')).toBe('');
    expect(officeArt('a.docx')).toBe('word');
    expect(officeArt('a.xlsx')).toBe('excel');
    expect(officeArt('a.dwg')).toBeNull();
    expect(vorschauArt('a.pdf')).toBe('pdf');
    expect(vorschauArt('a.md')).toBe('text');
    expect(vorschauArt('a.png')).toBe('bild');
    expect(vorschauArt('a.dwg')).toBeNull();
    expect(onlineBearbeitbar('a.pptx')).toBe(true);
    expect(onlineBearbeitbar('a.doc')).toBe(false);
  });
  it('rechnet Explorer-Pfade auf den Projektordner um', () => {
    expect(relativZumProjekt('01_Laufend/1338_x/00_Vertrag/a.docx', '01_Laufend/1338_x')).toBe('00_Vertrag/a.docx');
    expect(relativZumProjekt('fremd/a.docx', '01_Laufend/1338_x')).toBe('fremd/a.docx');
  });
});
