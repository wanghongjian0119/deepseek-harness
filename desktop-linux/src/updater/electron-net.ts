/**
 * The route update traffic takes, as Electron's network stack sees it.
 *
 * Downloads run on Chromium's fetch (`net.fetch`), which follows the host's
 * proxy configuration — GNOME's network settings, `--proxy-server`, a PAC file.
 * The pnpm, npm, and git subprocesses the update spawns do not: they read
 * `http_proxy` / `https_proxy`, which a GUI launch leaves unset when the proxy
 * lives in the desktop's settings rather than the shell environment. Left
 * alone, an update then downloads through the proxy while resolving packages
 * and fetching tarballs directly, which is how a working proxy still yields
 * timeouts. Resolution happens here so both halves of the job take one route,
 * with a proxy configured or without one.
 * @module @deepseek-ai/dsh-desktop-linux/electron-net
 */

import { connect } from 'node:net'

/** Proxy environment variables handed to one update subprocess. */
export interface ProxyEnv {
  /** Proxy for plain HTTP requests. */
  http_proxy: string
  /** Proxy for HTTPS requests. */
  https_proxy: string
}

/** A resolved proxy plus what it was resolved for. */
export interface ResolvedProxy extends ProxyEnv {
  /** URL whose route produced this answer. */
  forUrl: string
}

/**
 * Electron's Chromium-backed fetch, which resolves proxies per request.
 *
 * Imported on demand: this module is unit-tested outside the Electron runtime,
 * where a static `electron` import would fail to resolve.
 * @returns a `fetch`-compatible implementation running on Chromium's stack.
 */
export async function chromiumFetch(): Promise<typeof globalThis.fetch> {
  const { net } = await import('electron')
  return net.fetch as unknown as typeof globalThis.fetch
}

/**
 * Convert a Chromium proxy rule list into proxy environment variables.
 *
 * `resolveProxy` answers with the rule list it would apply to a URL: `DIRECT`,
 * or entries such as `PROXY host:port`, `HTTPS host:port`, `SOCKS5 host:port`
 * separated by `;` in the order they would be tried.
 *
 * SOCKS entries are skipped: pnpm ships no SOCKS agent, so handing it one would
 * break every registry request rather than route it. A host whose only route is
 * SOCKS is left direct, which is what the installer did before this module.
 * @param rules - the rule list returned by `resolveProxy`.
 * @returns the environment variables for the first usable entry, or undefined
 *   when Chromium would go direct.
 */
export function parseChromiumProxyRules(rules: string): ProxyEnv | undefined {
  for (const rule of rules.split(';')) {
    const [kind, hostPort] = rule.trim().split(/\s+/)
    if (kind === undefined || hostPort === undefined) continue
    if (kind !== 'PROXY' && kind !== 'HTTPS') continue
    const proxy = `http://${hostPort}`
    return { http_proxy: proxy, https_proxy: proxy }
  }
  return undefined
}

/**
 * Resolve the proxy update subprocesses should use.
 *
 * Takes the first URL whose route names a proxy: callers pass the endpoints the
 * job will reach, so a PAC file that proxies one host and not another is
 * honored for whichever host actually needs it.
 * @param urls - URLs the job will reach, most authoritative first.
 * @returns the proxy and the URL it was resolved for, or undefined when
 *   Chromium would reach all of them directly.
 */
export async function resolveSystemProxy(urls: readonly string[]): Promise<ResolvedProxy | undefined> {
  const { session } = await import('electron')
  for (const url of urls) {
    const rules = await session.defaultSession.resolveProxy(url)
    const proxy = parseChromiumProxyRules(rules)
    if (proxy !== undefined) return { ...proxy, forUrl: url }
  }
  return undefined
}

/** How long a proxy endpoint has to accept a TCP connection. */
const PROXY_CONNECT_TIMEOUT_MS = 1_500

/**
 * Check that a proxy endpoint accepts connections before routing through it.
 *
 * A configured proxy is not always a running one: hosts keep a manual proxy in
 * their network settings after the client that served it — a VPN or a local
 * proxy — has exited, and Chromium reports the same rules either way. Handing a
 * dead endpoint to pnpm, npm, and git replaces an update that worked over a
 * direct connection with ECONNREFUSED on every request, so the job confirms the
 * endpoint answers a connect first and goes direct when it does not.
 * @param proxyUrl - proxy base URL, as it would be written into the child environment.
 * @param timeoutMs - how long the endpoint has to accept; defaults to 1500.
 * @returns whether the endpoint accepted a connection.
 */
export async function isProxyReachable(proxyUrl: string, timeoutMs = PROXY_CONNECT_TIMEOUT_MS): Promise<boolean> {
  let parsed: URL
  try {
    parsed = new URL(proxyUrl)
  } catch {
    // A malformed proxy URL names no endpoint to connect to, so nothing is reachable through it.
    return false
  }
  if (parsed.hostname === '') return false
  const port = parsed.port === '' ? (parsed.protocol === 'https:' ? 443 : 80) : Number(parsed.port)
  return await new Promise<boolean>((resolve) => {
    const socket = connect({ host: parsed.hostname, port })
    const settle = (reachable: boolean): void => {
      socket.destroy()
      resolve(reachable)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => { settle(true) })
    socket.once('timeout', () => { settle(false) })
    socket.once('error', () => { settle(false) })
  })
}
