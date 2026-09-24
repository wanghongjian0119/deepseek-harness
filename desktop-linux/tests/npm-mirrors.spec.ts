import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NPM_MIRROR_ID,
  NPM_MIRRORS,
  registryCandidates,
  registryPingUrl,
  resolveNpmRegistry,
  selectReachableRegistry,
} from '../src/updater/npm-mirrors.ts'

describe('resolveNpmRegistry', () => {
  it('defaults to the first built-in mirror', () => {
    expect(resolveNpmRegistry(undefined)).toBe(
      NPM_MIRRORS.find(m => m.id === DEFAULT_NPM_MIRROR_ID)?.url,
    )
  })

  it('resolves known mirror ids', () => {
    expect(resolveNpmRegistry('official')).toBe('https://registry.npmjs.org')
    expect(resolveNpmRegistry('npmmirror')).toBe('https://registry.npmmirror.com')
  })

  it('accepts a raw https registry URL', () => {
    expect(resolveNpmRegistry('https://example.com/npm/')).toBe('https://example.com/npm')
  })
})

describe('registryCandidates', () => {
  it('puts the selection first and keeps every built-in mirror as a fallback', () => {
    expect(registryCandidates('official')).toEqual([
      'https://registry.npmjs.org',
      ...NPM_MIRRORS.map(mirror => mirror.url).filter(url => url !== 'https://registry.npmjs.org'),
    ])
    expect(registryCandidates('official')[0]).toBe('https://registry.npmjs.org')
  })

  it('keeps a raw registry URL ahead of the built-ins', () => {
    expect(registryCandidates('https://mirror.internal/npm')[0]).toBe('https://mirror.internal/npm')
  })
})

describe('registryPingUrl', () => {
  it('appends the health endpoint to a registry root whether or not it ends in a slash', () => {
    expect(registryPingUrl('https://registry.npmmirror.com')).toBe('https://registry.npmmirror.com/-/ping')
    expect(registryPingUrl('https://mirrors.cloud.tencent.com/npm/')).toBe('https://mirrors.cloud.tencent.com/npm/-/ping')
  })
})

describe('selectReachableRegistry', () => {
  it('keeps the selection when it answers, probing nothing else', async () => {
    const probed: string[] = []
    const chosen = await selectReachableRegistry('official', async (url) => {
      probed.push(url)
      return url === 'https://registry.npmjs.org'
    })
    expect(chosen).toBe('https://registry.npmjs.org')
    expect(probed).toEqual(['https://registry.npmjs.org'])
  })

  it('falls back to a mirror that answers', async () => {
    const lines: string[] = []
    const chosen = await selectReachableRegistry('official', async (url) => {
      return url === 'https://registry.npmmirror.com'
    }, line => { lines.push(line) })
    expect(chosen).toBe('https://registry.npmmirror.com')
    expect(lines.some(line => line.includes('did not answer'))).toBe(true)
  })

  it('treats a probe that throws as unreachable and keeps trying', async () => {
    const chosen = await selectReachableRegistry('official', async (url) => {
      if (url === 'https://registry.npmjs.org') throw new Error('getaddrinfo ENOTFOUND')
      return true
    })
    expect(chosen).toBe('https://registry.npmmirror.com')
  })

  it('keeps the selection when no registry answers, leaving the report to the install', async () => {
    const chosen = await selectReachableRegistry('huawei', async () => false)
    expect(chosen).toBe('https://mirrors.huaweicloud.com/repository/npm/')
  })
})
