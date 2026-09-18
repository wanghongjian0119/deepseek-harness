import { describe, expect, it } from 'vitest'
import { LOADING_HTML, splashStatusScript } from '../src/splash.ts'

/** The `data:` URL prefix the splash must carry so the shell can load it. */
const DATA_URL_PREFIX = 'data:text/html;charset=utf-8,'

/** The splash document exactly as Chromium decodes it. */
function splashDocument(): string {
  expect(LOADING_HTML.startsWith(DATA_URL_PREFIX)).toBe(true)
  return decodeURIComponent(LOADING_HTML.slice(DATA_URL_PREFIX.length))
}

/** The argument text `splashStatusScript` passes to the page. */
function statusArgument(text: string): string {
  const expression = splashStatusScript(text)
  return expression.slice(expression.indexOf('(') + 1, -1)
}

describe('LOADING_HTML', () => {
  it('is a data URL Chromium can navigate to', () => {
    expect(LOADING_HTML.startsWith(DATA_URL_PREFIX)).toBe(true)
    expect(LOADING_HTML.length).toBeLessThan(2 * 1024 * 1024)
  })

  it('carries the official DeepSeek whale mark and wordmark', () => {
    const html = splashDocument()
    // Opening moveto of the whale path in apps/web/public/favicon.svg and of
    // the first glyph path in website/public/wordmark.svg.
    expect(html).toContain('M48.8354 10.0479')
    expect(html).toContain('M78.6784 18.6813')
  })

  it('loads no resource outside the document', () => {
    const html = splashDocument()
    expect(html).not.toMatch(/(?:src|href)\s*=\s*["'](?!data:)/)
    expect(html).not.toContain('@import')
  })

  it('renders the status line and the hook the main process drives', () => {
    const html = splashDocument()
    expect(html).toContain('id="dsh-status-text"')
    expect(html).toContain('window.dshSplash')
    expect(html).toContain('正在启动')
  })

  it('honours prefers-reduced-motion', () => {
    expect(splashDocument()).toContain('@media (prefers-reduced-motion:reduce)')
  })
})

describe('splashStatusScript', () => {
  it('calls the page hook with the stage text', () => {
    expect(splashStatusScript('正在启动本地服务')).toContain('window.dshSplash')
    expect(JSON.parse(statusArgument('正在启动本地服务'))).toBe('正在启动本地服务')
  })

  it('quotes text that would otherwise close the string literal', () => {
    const hostile = 'x"); (window.pwned = 1); ("'
    expect(JSON.parse(statusArgument(hostile))).toBe(hostile)
    expect(splashStatusScript(hostile)).toContain('\\"')
  })
})
