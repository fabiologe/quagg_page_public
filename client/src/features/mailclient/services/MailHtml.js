/**
 * MailHtml — HTML-Mails entschärfen und für das sandboxed <iframe> aufbereiten.
 *
 * Sicherheitsmodell (zwei Schichten):
 *  1. DOMPurify entfernt Skripte, Formulare, Objekte, Event-Handler.
 *  2. Das iframe läuft mit sandbox OHNE allow-same-origin und OHNE
 *     allow-scripts — selbst ein Durchrutscher hätte keinen Zugriff auf
 *     Token/DOM der App. (Der alte EmailListTable hatte allow-same-origin
 *     gesetzt — genau das darf hier nie wieder passieren.)
 *
 * Externe Bilder werden standardmäßig BLOCKIERT (Tracking-Pixel), der Nutzer
 * kann sie je Mail nachladen.
 */
import DOMPurify from 'dompurify'

const VERBOTENE_TAGS = ['script', 'iframe', 'frame', 'object', 'embed', 'form', 'input',
  'button', 'select', 'textarea', 'link', 'meta', 'base', 'svg', 'math']
const VERBOTENE_ATTR = ['srcset', 'ping', 'formaction', 'action', 'xlink:href']

function istExtern(url) {
  return /^\s*(https?:)?\/\//i.test(url || '')
}

/**
 * @param {string} html      Roh-HTML aus der Mail
 * @param {{bilderLaden?: boolean}} opts
 * @returns {{ html: string, blockierteBilder: number }}
 */
export function sanitizeMailHtml(html, { bilderLaden = false } = {}) {
  let blockierteBilder = 0

  const hook = (node, data) => {
    // Externe Bilder: src parken, bis der Nutzer sie freigibt
    if (data.attrName === 'src' && node.tagName === 'IMG' && istExtern(data.attrValue)) {
      if (!bilderLaden) {
        node.setAttribute('data-blocked-src', data.attrValue)
        data.attrValue = ''
        blockierteBilder += 1
      }
      return
    }
    // Hintergrundbilder in style-Attributen sind ebenso Tracking-fähig
    if (data.attrName === 'style' && /url\s*\(/i.test(data.attrValue)) {
      if (!bilderLaden) {
        blockierteBilder += 1
        data.attrValue = data.attrValue.replace(/url\s*\([^)]*\)/gi, 'none')
      }
      return
    }
    // Links immer in neuem Tab, ohne Referrer
    if (data.attrName === 'href' && node.tagName === 'A') {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }
  }

  DOMPurify.addHook('uponSanitizeAttribute', hook)
  try {
    const sauber = DOMPurify.sanitize(String(html ?? ''), {
      FORBID_TAGS: VERBOTENE_TAGS,
      FORBID_ATTR: VERBOTENE_ATTR,
      ADD_ATTR: ['target', 'data-blocked-src'],
      ALLOW_UNKNOWN_PROTOCOLS: false,
      WHOLE_DOCUMENT: false,
    })
    return { html: sauber, blockierteBilder }
  } finally {
    DOMPurify.removeHook('uponSanitizeAttribute')
  }
}

/** Vollständiges Dokument für <iframe srcdoc>. Farben folgen dem Theme. */
export function baueSrcdoc(sauberesHtml, { dunkel = false } = {}) {
  const bg = dunkel ? '#1c1f23' : '#ffffff'
  const fg = dunkel ? '#e7e9ec' : '#22262b'
  const link = dunkel ? '#3cc7b7' : '#0f766e'
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="referrer" content="no-referrer">
<base target="_blank">
<style>
  html, body { margin: 0; padding: 0; background: ${bg}; color: ${fg}; }
  body { padding: 4px 2px 16px; font: 14px/1.5 'Segoe UI', system-ui, -apple-system, Arial, sans-serif; word-break: break-word; overflow-wrap: anywhere; }
  img, table { max-width: 100% !important; height: auto; }
  img[data-blocked-src] { display: none; }
  a { color: ${link}; }
  blockquote { margin: 8px 0; padding-left: 10px; border-left: 3px solid #b9b5ac; color: #6d757e; }
  pre { white-space: pre-wrap; }
</style></head><body>${sauberesHtml}</body></html>`
}

const RE_URL = /https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)]/g

function escape(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Text-Mails: Links auf dem ROHTEXT finden, dann Segment für Segment escapen. */
export function textZuHtml(text) {
  const roh = String(text ?? '')
  const teile = []
  let ende = 0
  for (const m of roh.matchAll(RE_URL)) {
    teile.push(escape(roh.slice(ende, m.index)))
    const url = escape(m[0])
    teile.push(`<a href="${url}">${url}</a>`)
    ende = m.index + m[0].length
  }
  teile.push(escape(roh.slice(ende)))
  return `<pre style="margin:0;white-space:pre-wrap;font:inherit">${teile.join('')}</pre>`
}
