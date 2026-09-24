/** GitHub token resolution for the update API request. */
import { describe, expect, it, vi } from 'vitest'
import { resolveGitHubToken, tokenFromEnv, UPDATE_TOKEN_ENV_VARS } from '../src/updater/github-token.ts'

describe('tokenFromEnv', () => {
  it('prefers the desktop variable over the generic GitHub ones', () => {
    expect(UPDATE_TOKEN_ENV_VARS).toEqual(['DSH_DESKTOP_UPDATE_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'])
    expect(tokenFromEnv({ DSH_DESKTOP_UPDATE_TOKEN: 'desktop', GH_TOKEN: 'gh', GITHUB_TOKEN: 'github' })).toBe('desktop')
    expect(tokenFromEnv({ GH_TOKEN: 'gh', GITHUB_TOKEN: 'github' })).toBe('gh')
    expect(tokenFromEnv({ GITHUB_TOKEN: 'github' })).toBe('github')
  })

  it('skips empty values and answers undefined when nothing is set', () => {
    expect(tokenFromEnv({ DSH_DESKTOP_UPDATE_TOKEN: '', GH_TOKEN: 'gh' })).toBe('gh')
    expect(tokenFromEnv({ DSH_DESKTOP_UPDATE_TOKEN: '' })).toBeUndefined()
    expect(tokenFromEnv({})).toBeUndefined()
  })
})

describe('resolveGitHubToken', () => {
  it('uses the environment before asking the GitHub CLI', async () => {
    const readGhToken = vi.fn(async () => 'from-gh')
    await expect(resolveGitHubToken({ GH_TOKEN: 'from-env' }, readGhToken)).resolves.toBe('from-env')
    expect(readGhToken).not.toHaveBeenCalled()
  })

  it('falls back to the GitHub CLI credential', async () => {
    await expect(resolveGitHubToken({}, async () => 'from-gh')).resolves.toBe('from-gh')
  })

  it('answers undefined when the GitHub CLI has no token', async () => {
    await expect(resolveGitHubToken({}, async () => undefined)).resolves.toBeUndefined()
  })
})
