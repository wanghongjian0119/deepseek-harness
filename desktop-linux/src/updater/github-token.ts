/**
 * GitHub token resolution for the update API request.
 *
 * The unauthenticated GitHub API allows 60 requests per hour per IP, a quota
 * every user behind one proxy exit address shares and one that fails the check
 * with HTTP 403 once spent. Authenticating raises it to 5000. The environment
 * is read first; when it names no token, the GitHub CLI's stored credential is
 * used, so a machine that already ran `gh auth login` needs no extra setup.
 * Every failure path resolves to no token because the check stays valid
 * unauthenticated.
 * @module @deepseek-ai/dsh-desktop-linux/github-token
 */

import { execFile } from 'node:child_process'

/** Environment variables that may carry a token, most specific first. */
export const UPDATE_TOKEN_ENV_VARS = ['DSH_DESKTOP_UPDATE_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'] as const

/** How long `gh auth token` has to answer before the check runs unauthenticated. */
const GH_TOKEN_TIMEOUT_MS = 3_000

/**
 * Read a token from an environment.
 * @param env - environment to read; defaults to `process.env`.
 * @returns the first non-empty token, or undefined.
 */
export function tokenFromEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  for (const name of UPDATE_TOKEN_ENV_VARS) {
    const value = env[name]
    if (value !== undefined && value !== '') return value
  }
  return undefined
}

/** Reads the GitHub CLI's stored token; injected so tests need no `gh` binary. */
export type GhTokenReader = () => Promise<string | undefined>

/** Ask the GitHub CLI for its token, treating every failure as "no token". */
function ghAuthToken(): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile('gh', ['auth', 'token'], { encoding: 'utf8', timeout: GH_TOKEN_TIMEOUT_MS, windowsHide: true }, (error, stdout) => {
      const token = stdout.trim()
      resolve(error === null && token !== '' ? token : undefined)
    })
  })
}

/**
 * Resolve the token the update check should present.
 * @param env - environment to read first; defaults to `process.env`.
 * @param readGhToken - GitHub CLI reader; defaults to the real `gh auth token`.
 * @returns the token, or undefined when none is available.
 */
export async function resolveGitHubToken(
  env: NodeJS.ProcessEnv = process.env, readGhToken: GhTokenReader = ghAuthToken,
): Promise<string | undefined> {
  return tokenFromEnv(env) ?? await readGhToken()
}
