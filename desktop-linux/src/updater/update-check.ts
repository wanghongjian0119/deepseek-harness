/**
 * Update availability check for the desktop shell.
 *
 * The official repository publishes no installers, tags, or releases — only
 * the `master` branch — so the update signal is the upstream master commit
 * SHA compared against the running payload's recorded `sourceRef`. The check
 * uses the public GitHub REST API; the repo is overridable through
 * `$DSH_DESKTOP_UPDATE_REPO` (e.g. a fork), and the API base is injectable
 * for tests.
 *
 * A different SHA is not by itself an update. The configured repository's
 * head must also descend from the running payload's ref, which the compare
 * API reports; a stale source — its head behind or diverged from the running
 * payload — would otherwise install older code over newer code, because the
 * running app cannot tell which of two refs is the newer one.
 * @module @deepseek-ai/dsh-desktop-linux/update-check
 */

/** The official upstream source repository. */
export const DEFAULT_UPDATE_REPO = 'deepseek-ai/deepseek-harness'

/** Options for {@link checkForUpdate}. */
export interface CheckForUpdateOptions {
  /** `owner/repo` to watch; defaults to the official upstream repository. */
  repo?: string
  /** The running payload's source ref; `undefined` disables the comparison. */
  currentSha?: string
  /** GitHub API base; defaults to `https://api.github.com`. */
  apiBase?: string
  /** Test hook for the HTTP fetch. */
  fetchImpl?: typeof fetch
  /** Token for the API request; see `github-token.ts` for how callers resolve one. */
  token?: string
}

/**
 * How the watched branch's head relates to the running payload's ref.
 *
 * `ahead` is the only relation that permits an install. `behind` is a source
 * whose head the payload has already passed, `diverged` shares no
 * fast-forward, and `identical` needs no update; `unknown` covers a branch
 * head the comparison could not place — including a payload ref the source
 * repository does not contain, which GitHub answers with 404.
 */
export type UpdateRelation = 'ahead' | 'behind' | 'diverged' | 'identical' | 'unknown'

/** The result of an update check. */
export interface UpdateCheckResult {
  repo: string
  currentSha: string | undefined
  latestSha: string | undefined
  /** True only when the watched head descends from the payload's ref. */
  available: boolean
  /** How the watched head relates to the payload's ref. */
  relation: UpdateRelation
}

/** Compare API statuses this module recognizes; anything else is `unknown`. */
const COMPARE_STATUSES = ['ahead', 'behind', 'diverged', 'identical'] as const

/** Resolve the watched repository from the environment. */
export function updateRepo(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.DSH_DESKTOP_UPDATE_REPO
  return override !== undefined && override !== '' ? override : DEFAULT_UPDATE_REPO
}

/** Request headers for one GitHub API call. */
function apiHeaders(token: string | undefined): Record<string, string> {
  return {
    'User-Agent': 'dsh-desktop',
    ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
  }
}

/**
 * Read how `head` relates to `base` from the compare API.
 *
 * A ref the repository does not contain is the normal case for a payload
 * built from a local checkout, and reads as `unknown` rather than an error:
 * the app cannot prove the direction, so it installs nothing.
 * @param repo - `owner/repo` holding both refs.
 * @param base - the running payload's ref.
 * @param head - the watched branch head.
 * @param apiBase - GitHub API base.
 * @param fetchImpl - HTTP implementation.
 * @param token - API token, when one was resolved.
 * @returns the relation, or `unknown` when the answer places neither ref.
 * @throws on a failed API request other than a missing ref.
 */
async function compareRelation(
  repo: string,
  base: string,
  head: string,
  apiBase: string,
  fetchImpl: typeof fetch,
  token: string | undefined,
): Promise<UpdateRelation> {
  const response = await fetchImpl(`${apiBase}/repos/${repo}/compare/${base}...${head}`, {
    headers: apiHeaders(token),
  })
  if (response.status === 404) return 'unknown'
  if (!response.ok) {
    throw new Error(`update compare failed for ${repo} (HTTP ${response.status})`)
  }
  const data = (await response.json()) as { status?: unknown }
  const status = data.status
  return typeof status === 'string' && (COMPARE_STATUSES as readonly string[]).includes(status)
    ? status as UpdateRelation
    : 'unknown'
}

/**
 * Query the upstream master SHA and compare it with the running payload's.
 *
 * Unauthenticated requests share GitHub's 60-per-hour limit per IP, which a
 * shared proxy exit address spends for everyone behind it; a token lifts that
 * to 5000 and is sent only to this API host. A check costs one request, two
 * once the head differs from the payload's ref.
 * @param options - repo, current ref, token, and HTTP hooks.
 * @returns the comparison result.
 * @throws on a failed API request.
 */
export async function checkForUpdate(options: CheckForUpdateOptions = {}): Promise<UpdateCheckResult> {
  const repo = options.repo ?? updateRepo()
  const fetchImpl = options.fetchImpl ?? fetch
  const base = options.apiBase ?? 'https://api.github.com'
  const response = await fetchImpl(`${base}/repos/${repo}/commits/master`, {
    headers: apiHeaders(options.token),
  })
  if (!response.ok) {
    throw new Error(`update check failed for ${repo} (HTTP ${response.status})`)
  }
  const data = (await response.json()) as { sha?: unknown }
  const latestSha = typeof data.sha === 'string' && /^[0-9a-f]{40}$/.test(data.sha) ? data.sha : undefined
  const currentSha = options.currentSha
  if (latestSha === undefined || currentSha === undefined) {
    return { repo, currentSha, latestSha, relation: 'unknown', available: false }
  }
  if (latestSha === currentSha) {
    return { repo, currentSha, latestSha, relation: 'identical', available: false }
  }
  const relation = await compareRelation(repo, currentSha, latestSha, base, fetchImpl, options.token)
  return { repo, currentSha, latestSha, relation, available: relation === 'ahead' }
}
