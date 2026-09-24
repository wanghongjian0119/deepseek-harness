import { createServer, type Server } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { isProxyReachable, parseChromiumProxyRules } from '../src/updater/electron-net.ts'

describe('parseChromiumProxyRules', () => {
  it('turns a PROXY or HTTPS rule into both proxy variables', () => {
    expect(parseChromiumProxyRules('PROXY 127.0.0.1:7890')).toEqual({
      http_proxy: 'http://127.0.0.1:7890',
      https_proxy: 'http://127.0.0.1:7890',
    })
    expect(parseChromiumProxyRules('HTTPS proxy.internal:3128')).toEqual({
      http_proxy: 'http://proxy.internal:3128',
      https_proxy: 'http://proxy.internal:3128',
    })
  })

  it('goes direct when Chromium would', () => {
    expect(parseChromiumProxyRules('DIRECT')).toBeUndefined()
    expect(parseChromiumProxyRules('')).toBeUndefined()
  })

  it('skips a SOCKS-only route instead of handing pnpm an unsupported proxy', () => {
    expect(parseChromiumProxyRules('SOCKS5 127.0.0.1:1080')).toBeUndefined()
    expect(parseChromiumProxyRules('SOCKS5 127.0.0.1:1080; PROXY 127.0.0.1:7890')).toEqual({
      http_proxy: 'http://127.0.0.1:7890',
      https_proxy: 'http://127.0.0.1:7890',
    })
  })

  it('reads the first usable rule of a PAC-derived list', () => {
    expect(parseChromiumProxyRules('PROXY a.example:8080; PROXY b.example:8080')).toEqual({
      http_proxy: 'http://a.example:8080',
      https_proxy: 'http://a.example:8080',
    })
  })
})

describe('isProxyReachable', () => {
  let server: Server | undefined

  afterEach(async () => {
    if (server === undefined) return
    await new Promise<void>((resolve) => { server?.close(() => resolve()) })
    server = undefined
  })

  /** Start a listener on an OS-assigned port and return its URL. */
  async function listen(): Promise<string> {
    const started = createServer()
    server = started
    await new Promise<void>((resolve) => { started.listen(0, '127.0.0.1', resolve) })
    const address = started.address()
    if (address === null || typeof address === 'string') throw new Error('test server has no port')
    return `http://127.0.0.1:${address.port}`
  }

  it('accepts an endpoint that answers a connect', async () => {
    expect(await isProxyReachable(await listen())).toBe(true)
  })

  it('rejects an endpoint whose port is closed', async () => {
    const url = await listen()
    await new Promise<void>((resolve) => { server?.close(() => resolve()) })
    server = undefined
    expect(await isProxyReachable(url)).toBe(false)
  })

  it('rejects a URL that names no endpoint', async () => {
    expect(await isProxyReachable('not a url')).toBe(false)
    expect(await isProxyReachable('http://')).toBe(false)
  })
})
