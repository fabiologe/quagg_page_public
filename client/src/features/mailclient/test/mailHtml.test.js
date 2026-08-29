// @vitest-environment jsdom
// Sanitizer für HTML-Mails: Skripte raus, externe Bilder blockiert, Links hart.
import { describe, expect, it } from 'vitest'
import { sanitizeMailHtml, baueSrcdoc, textZuHtml } from '../services/MailHtml'

describe('sanitizeMailHtml', () => {
  it('entfernt Skripte, Event-Handler, Formulare und iframes', () => {
    const { html } = sanitizeMailHtml(
      '<p onclick="x()">Hallo</p><script>alert(1)</script><form><input></form><iframe src="https://boese.de"></iframe><object></object>',
    )
    expect(html).toContain('<p>Hallo</p>')
    expect(html).not.toMatch(/script|onclick|<form|<input|iframe|object/i)
  })

  it('blockiert externe Bilder und zählt sie', () => {
    const { html, blockierteBilder } = sanitizeMailHtml(
      '<img src="https://tracker.de/p.gif"><img src="//cdn.de/x.png"><img src="data:image/png;base64,AAAA">',
    )
    expect(blockierteBilder).toBe(2)
    expect(html).not.toContain(' src="https://tracker.de')
    expect(html).toContain('data-blocked-src="https://tracker.de/p.gif"')
    expect(html).toContain('data:image/png;base64,AAAA')
  })

  it('lädt externe Bilder nur auf Wunsch', () => {
    const { html, blockierteBilder } = sanitizeMailHtml('<img src="https://cdn.de/x.png">', { bilderLaden: true })
    expect(blockierteBilder).toBe(0)
    expect(html).toContain('src="https://cdn.de/x.png"')
    expect(html).not.toContain('data-blocked-src')
  })

  it('neutralisiert Hintergrundbilder in style-Attributen', () => {
    const { html, blockierteBilder } = sanitizeMailHtml('<div style="background:url(https://t.de/p.gif);color:red">x</div>')
    expect(blockierteBilder).toBe(1)
    expect(html).not.toContain('https://t.de')
    expect(html).toContain('color:red')
  })

  it('erzwingt target=_blank und noopener auf Links', () => {
    const { html } = sanitizeMailHtml('<a href="https://quagg-engineering.org">Q</a>')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('wirft javascript:-Links raus', () => {
    const { html } = sanitizeMailHtml('<a href="javascript:alert(1)">x</a>')
    expect(html).not.toContain('javascript:')
  })

  it('verträgt leere Eingaben', () => {
    expect(sanitizeMailHtml('')).toEqual({ html: '', blockierteBilder: 0 })
    expect(sanitizeMailHtml(null).html).toBe('')
  })
})

describe('baueSrcdoc', () => {
  it('liefert ein komplettes Dokument mit Theme-Farben', () => {
    const hell = baueSrcdoc('<p>x</p>')
    expect(hell).toMatch(/^<!doctype html>/)
    expect(hell).toContain('<base target="_blank">')
    expect(hell).toContain('background: #ffffff')
    expect(baueSrcdoc('<p>x</p>', { dunkel: true })).toContain('background: #1c1f23')
  })
})

describe('textZuHtml', () => {
  it('escaped und verlinkt', () => {
    const html = textZuHtml('Siehe <https://a.de/x?y=1>, danke.')
    expect(html).toContain('&lt;<a href="https://a.de/x?y=1">https://a.de/x?y=1</a>&gt;')
    expect(html).toContain('white-space:pre-wrap')
  })
})
