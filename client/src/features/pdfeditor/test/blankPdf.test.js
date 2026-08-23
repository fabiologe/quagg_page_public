// BlankPdf — leere A4/A3-Blätter und „+ Seite".

import { describe, expect, it } from 'vitest'
import { PDFDocument, degrees } from 'pdf-lib'
import { erzeugeLeeresPdf, haengeLeereSeiteAn } from '../services/BlankPdf'

describe('erzeugeLeeresPdf', () => {
  it('A4 hoch: 595,28 × 841,89 pt, eine Seite', async () => {
    const doc = await PDFDocument.load(await erzeugeLeeresPdf('A4', 'hoch'))
    expect(doc.getPageCount()).toBe(1)
    const { width, height } = doc.getPage(0).getSize()
    expect(width).toBeCloseTo(595.28, 1)
    expect(height).toBeCloseTo(841.89, 1)
  })

  it('A4 quer tauscht die Maße', async () => {
    const doc = await PDFDocument.load(await erzeugeLeeresPdf('A4', 'quer'))
    const { width, height } = doc.getPage(0).getSize()
    expect(width).toBeCloseTo(841.89, 1)
    expect(height).toBeCloseTo(595.28, 1)
  })

  it('A3 hoch: 841,89 × 1190,55 pt', async () => {
    const doc = await PDFDocument.load(await erzeugeLeeresPdf('A3', 'hoch'))
    const { width, height } = doc.getPage(0).getSize()
    expect(width).toBeCloseTo(841.89, 1)
    expect(height).toBeCloseTo(1190.55, 1)
  })
})

describe('haengeLeereSeiteAn', () => {
  it('kopiert Format und Rotation der letzten Seite', async () => {
    const original = await PDFDocument.create()
    original.addPage([300, 400])
    const letzte = original.addPage([500, 200])
    letzte.setRotation(degrees(90))

    const doc = await PDFDocument.load(await haengeLeereSeiteAn(await original.save()))
    expect(doc.getPageCount()).toBe(3)
    const neue = doc.getPage(2)
    expect(neue.getSize()).toEqual({ width: 500, height: 200 })
    expect(neue.getRotation().angle).toBe(90)
  })

  it('funktioniert auch auf einem frisch erzeugten Blatt', async () => {
    const bytes = await erzeugeLeeresPdf('A4', 'hoch')
    const doc = await PDFDocument.load(await haengeLeereSeiteAn(bytes))
    expect(doc.getPageCount()).toBe(2)
    expect(doc.getPage(1).getSize().width).toBeCloseTo(595.28, 1)
  })
})
