import { describe, expect, it } from 'vitest'
import { describeUpdateCheck, initialUpdateCenterState, shortRef } from '../src/updater/update-center.ts'
import type { UpdateCheckResult, UpdateRelation } from '../src/updater/update-check.ts'

const CURRENT = 'a'.repeat(40)
const LATEST = 'b'.repeat(40)

/** One check result, with the relation under test. */
function checked(relation: UpdateRelation, available = false): UpdateCheckResult {
  return { repo: 'owner/repo', currentSha: CURRENT, latestSha: LATEST, relation, available }
}

describe('shortRef', () => {
  it('shortens a full SHA and passes short values through', () => {
    expect(shortRef('a'.repeat(40))).toBe('a'.repeat(12))
    expect(shortRef('abc123')).toBe('abc123')
    expect(shortRef(undefined)).toBeUndefined()
    expect(shortRef('')).toBeUndefined()
  })
})

describe('describeUpdateCheck', () => {
  it('offers the install for a descendant head', () => {
    const described = describeUpdateCheck(checked('ahead', true))
    expect(described.messageKind).toBe('warn')
    expect(described.message).toContain(LATEST.slice(0, 12))
    expect(described.message).toContain('可下载并安装')
  })

  it('reports a matched head as current', () => {
    const described = describeUpdateCheck(checked('identical'))
    expect(described.messageKind).toBe('ok')
    expect(described.message).toContain('已是最新')
  })

  it('names the stale source that sits behind the running payload', () => {
    const described = describeUpdateCheck(checked('behind'))
    expect(described.messageKind).toBe('warn')
    expect(described.message).toContain('落后')
    expect(described.message).toContain(CURRENT.slice(0, 12))
    expect(described.message).toContain('不提供安装')
  })

  it('names a diverged source', () => {
    const described = describeUpdateCheck(checked('diverged'))
    expect(described.messageKind).toBe('warn')
    expect(described.message).toContain('已分叉')
    expect(described.message).toContain('无法快进安装')
  })

  it('explains an unprovable comparison', () => {
    const described = describeUpdateCheck(checked('unknown'))
    expect(described.messageKind).toBe('warn')
    expect(described.message).toContain('无法确认')
    expect(described.message).toContain('不提供安装')
  })

  it('reports an unreadable head as an error', () => {
    const described = describeUpdateCheck({
      repo: 'owner/repo', currentSha: CURRENT, latestSha: undefined, relation: 'unknown', available: false,
    })
    expect(described.messageKind).toBe('err')
    expect(described.message).toContain('未能读取上游提交')
  })

  it('names an unrecorded ref rather than printing undefined', () => {
    const described = describeUpdateCheck({
      repo: 'owner/repo', currentSha: undefined, latestSha: LATEST, relation: 'unknown', available: false,
    })
    expect(described.message).toContain('未记录')
    expect(described.message).not.toContain('undefined')
  })
})

describe('initialUpdateCenterState', () => {
  it('warns when the payload has no source ref', () => {
    const state = initialUpdateCenterState(undefined)
    expect(state.available).toBe(false)
    expect(state.messageKind).toBe('warn')
    expect(state.phase).toBe('idle')
  })

  it('prompts a check when a source ref is present', () => {
    const sha = 'b'.repeat(40)
    const state = initialUpdateCenterState(sha)
    expect(state.currentSha).toBe(sha)
    expect(state.messageKind).toBe('busy')
    expect(state.busy).toBe(false)
    expect(state.mirrors.length).toBeGreaterThan(0)
    expect(state.registryId).toBeTruthy()
  })
})
