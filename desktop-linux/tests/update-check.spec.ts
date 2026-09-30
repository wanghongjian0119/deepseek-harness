import { describe, expect, it, vi } from 'vitest'
import { checkForUpdate, DEFAULT_UPDATE_REPO, updateRepo } from '../src/updater/update-check.ts'

const SHA = 'a'.repeat(40)
const OTHER = 'b'.repeat(40)

/** The GitHub base every URL assertion below is built from. */
const API_BASE = 'https://api.example'

/**
 * A fetch double answering both endpoints the check uses: the branch head,
 * and the comparison it asks for once that head differs from the payload ref.
 */
function fakeFetch(sha: string, compareStatus = 'ahead', status = 200): typeof fetch {
  return vi.fn(async (input: string | URL | Request) => {
    if (String(input).includes('/compare/')) {
      return new Response(JSON.stringify({ status: compareStatus }), { status: 200 })
    }
    return new Response(JSON.stringify({ sha }), { status })
  }) as unknown as typeof fetch
}

/** The comparison URL the check must request for the SHA pair used here. */
function compareUrl(apiBase = API_BASE): string {
  return `${apiBase}/repos/owner/repo/compare/${SHA}...${OTHER}`
}

describe('checkForUpdate', () => {
  it('reports available when the branch head descends from the payload ref', async () => {
    const result = await checkForUpdate({ repo: 'owner/repo', currentSha: SHA, fetchImpl: fakeFetch(OTHER, 'ahead') })
    expect(result.available).toBe(true)
    expect(result.relation).toBe('ahead')
    expect(result.latestSha).toBe(OTHER)
  })

  it('refuses a source whose head is behind the payload ref', async () => {
    const result = await checkForUpdate({ repo: 'owner/repo', currentSha: SHA, fetchImpl: fakeFetch(OTHER, 'behind') })
    expect(result.available).toBe(false)
    expect(result.relation).toBe('behind')
    expect(result.latestSha).toBe(OTHER)
  })

  it('refuses a diverged branch head', async () => {
    const result = await checkForUpdate({ repo: 'owner/repo', currentSha: SHA, fetchImpl: fakeFetch(OTHER, 'diverged') })
    expect(result.available).toBe(false)
    expect(result.relation).toBe('diverged')
  })

  it('refuses a comparison it cannot make, such as a payload ref the source lacks', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => (
      String(input).includes('/compare/')
        ? new Response('{}', { status: 404 })
        : new Response(JSON.stringify({ sha: OTHER }), { status: 200 })
    )) as unknown as typeof fetch
    const result = await checkForUpdate({ repo: 'owner/repo', currentSha: SHA, fetchImpl })
    expect(result.relation).toBe('unknown')
    expect(result.available).toBe(false)
  })

  it('treats an unrecognized comparison status as unknown', async () => {
    const result = await checkForUpdate({ repo: 'owner/repo', currentSha: SHA, fetchImpl: fakeFetch(OTHER, 'unexpected') })
    expect(result.relation).toBe('unknown')
    expect(result.available).toBe(false)
  })

  it('compares the two refs once the branch head differs', async () => {
    const fetchImpl = fakeFetch(OTHER, 'ahead')
    await checkForUpdate({ repo: 'owner/repo', currentSha: SHA, fetchImpl, apiBase: API_BASE })
    expect(fetchImpl).toHaveBeenLastCalledWith(
      compareUrl(),
      expect.objectContaining({ headers: { 'User-Agent': 'dsh-desktop' } }),
    )
  })

  it('reports no update when the SHAs match, without comparing', async () => {
    const fetchImpl = fakeFetch(SHA)
    const result = await checkForUpdate({ repo: 'owner/repo', currentSha: SHA, fetchImpl })
    expect(result.available).toBe(false)
    expect(result.relation).toBe('identical')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('reports no update without a payload ref', async () => {
    const result = await checkForUpdate({ repo: 'owner/repo', fetchImpl: fakeFetch(OTHER) })
    expect(result.available).toBe(false)
    expect(result.relation).toBe('unknown')
  })

  it('queries the master branch of the given repo', async () => {
    const fetchImpl = fakeFetch(SHA)
    await checkForUpdate({ repo: 'owner/repo', currentSha: SHA, fetchImpl, apiBase: 'https://api.example' })
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example/repos/owner/repo/commits/master',
      expect.objectContaining({ headers: { 'User-Agent': 'dsh-desktop' } }),
    )
  })

  it('authenticates the request when a token is available', async () => {
    const fetchImpl = fakeFetch(SHA)
    await checkForUpdate({ repo: 'owner/repo', currentSha: SHA, fetchImpl, apiBase: 'https://api.example', token: 'secret' })
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example/repos/owner/repo/commits/master',
      expect.objectContaining({ headers: { 'User-Agent': 'dsh-desktop', Authorization: 'Bearer secret' } }),
    )
  })

  it('defaults to the official upstream repository', () => {
    expect(DEFAULT_UPDATE_REPO).toBe('deepseek-ai/deepseek-harness')
    expect(updateRepo({})).toBe(DEFAULT_UPDATE_REPO)
    expect(updateRepo({ DSH_DESKTOP_UPDATE_REPO: 'fork/repo' })).toBe('fork/repo')
  })

  it('throws on a failed API request', async () => {
    const fetchImpl = fakeFetch('', 'ahead', 403)
    await expect(checkForUpdate({ repo: 'owner/repo', currentSha: SHA, fetchImpl })).rejects.toThrow(/HTTP 403/)
  })

  it('throws on a failed comparison request', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => (
      String(input).includes('/compare/')
        ? new Response('{}', { status: 500 })
        : new Response(JSON.stringify({ sha: OTHER }), { status: 200 })
    )) as unknown as typeof fetch
    await expect(checkForUpdate({ repo: 'owner/repo', currentSha: SHA, fetchImpl })).rejects.toThrow(/HTTP 500/)
  })

  it('ignores a malformed SHA from the API', async () => {
    const result = await checkForUpdate({ repo: 'owner/repo', currentSha: SHA, fetchImpl: fakeFetch('not-a-sha') })
    expect(result.latestSha).toBeUndefined()
    expect(result.available).toBe(false)
  })
})
