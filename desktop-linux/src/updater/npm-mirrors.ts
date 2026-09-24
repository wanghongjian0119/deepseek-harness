/**
 * npm registry mirrors offered by the desktop Update Center.
 *
 * The source tarball still comes from GitHub; only pnpm/npm package installs
 * use the selected registry. Domestic mirrors cut install time on many CN
 * networks where registry.npmjs.org is slow or unstable, so an install probes
 * the candidates and settles on one that answers before it starts.
 * @module @deepseek-ai/dsh-desktop-linux/npm-mirrors
 */

/** One selectable npm registry mirror. */
export interface NpmMirror {
  /** Stable id stored with the Update Center selection. */
  id: string
  /** Human-readable label for the UI. */
  label: string
  /** Registry base URL (no trailing path beyond the registry root). */
  url: string
}

/** Built-in mirrors; the first entry is the Update Center default. */
export const NPM_MIRRORS: readonly NpmMirror[] = [
  { id: 'npmmirror', label: 'npmmirror（淘宝）', url: 'https://registry.npmmirror.com' },
  { id: 'tencent', label: '腾讯云', url: 'https://mirrors.cloud.tencent.com/npm/' },
  { id: 'huawei', label: '华为云', url: 'https://mirrors.huaweicloud.com/repository/npm/' },
  { id: 'official', label: 'npm 官方', url: 'https://registry.npmjs.org' },
]

/** Default mirror id when the UI has no saved preference. */
export const DEFAULT_NPM_MIRROR_ID = NPM_MIRRORS[0]?.id ?? 'npmmirror'

/**
 * Resolve a mirror id or raw URL to a registry base URL.
 * @param idOrUrl - a known mirror id, or an absolute `http(s)` registry URL.
 * @returns the registry URL to pass to pnpm/npm.
 */
export function resolveNpmRegistry(idOrUrl: string | undefined): string {
  if (idOrUrl === undefined || idOrUrl === '') {
    return NPM_MIRRORS.find(m => m.id === DEFAULT_NPM_MIRROR_ID)?.url ?? 'https://registry.npmmirror.com'
  }
  const byId = NPM_MIRRORS.find(m => m.id === idOrUrl)
  if (byId !== undefined) return byId.url
  if (/^https?:\/\//.test(idOrUrl)) return idOrUrl.replace(/\/$/, '')
  return NPM_MIRRORS.find(m => m.id === DEFAULT_NPM_MIRROR_ID)?.url ?? 'https://registry.npmmirror.com'
}

/**
 * Registries to try, the selection first.
 *
 * Every built-in mirror serves the same package set, so when the selected one
 * does not answer, another is the same install over a different route. Ordering
 * the selection first keeps the user's choice winning whenever it works.
 * @param idOrUrl - the selected mirror id or raw registry URL.
 * @returns registry URLs to try; the first element is always present.
 */
export function registryCandidates(idOrUrl: string | undefined): [string, ...string[]] {
  const selected = resolveNpmRegistry(idOrUrl)
  return [selected, ...NPM_MIRRORS.map(mirror => mirror.url).filter(url => url !== selected)]
}

/**
 * The health endpoint of one registry.
 * @param registryUrl - registry base URL.
 * @returns the URL that answers with the registry's health status.
 */
export function registryPingUrl(registryUrl: string): string {
  return `${registryUrl.replace(/\/+$/, '')}/-/ping`
}

/**
 * Answer whether one registry is reachable.
 *
 * @param registryUrl - registry base URL to probe.
 * @returns true when the registry answered; the implementation may throw, which
 *   {@link selectReachableRegistry} reads as unreachable.
 */
export type RegistryProbe = (registryUrl: string) => Promise<boolean>

/**
 * Pick the first reachable registry, falling back to the selection.
 *
 * A mirror that is down, blocked, or unroutable turns a source update into a
 * multi-minute stall followed by a fetch error, so the job spends a few seconds
 * on a health request up front instead. The result is not saved as the user's
 * preference: the next run probes again, since a mirror that was slow once is
 * often fine later.
 * @param idOrUrl - the selected mirror id or raw registry URL.
 * @param probe - reachability test, run once per candidate in order.
 * @param onLog - optional detail sink for the probe outcome.
 * @returns the registry URL to use.
 */
export async function selectReachableRegistry(
  idOrUrl: string | undefined,
  probe: RegistryProbe,
  onLog?: (message: string) => void,
): Promise<string> {
  const candidates = registryCandidates(idOrUrl)
  const [selected] = candidates
  for (const url of candidates) {
    let reachable: boolean
    try {
      reachable = await probe(url)
    } catch (error) {
      // A probe that throws — DNS failure, refused TLS, a timeout — leaves the
      // registry as unproven as a negative answer, so the next candidate runs.
      onLog?.(`registry: ${url} probe failed: ${error instanceof Error ? error.message : String(error)}`)
      continue
    }
    if (reachable) {
      onLog?.(url === selected ? `registry: ${url} reachable` : `registry: ${selected} did not answer; using ${url}`)
      return url
    }
    onLog?.(`registry: ${url} did not answer the health check`)
  }
  onLog?.(`registry: no mirror answered the health check; keeping the selected ${selected}`)
  return selected
}
