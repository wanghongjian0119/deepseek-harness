import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  BACKEND_PRELOAD_FILENAME,
  ensureBackendPreload,
  locateFlockEntry,
  warmFlockPreloadSource,
} from '../src/backend-preload.ts'

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'dsh-desktop-preload-'))
})
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

/** Build `<root>/runtime/node_modules/@deepseek-ai/<package>/...` and return the CLI entry. */
function seedPayload(root: string, options: { flock: boolean } = { flock: true }): string {
  const scope = join(root, 'runtime', 'node_modules', '@deepseek-ai')
  const cliEntry = join(scope, 'dsh', 'lib', 'bin.js')
  mkdirSync(join(scope, 'dsh', 'lib'), { recursive: true })
  writeFileSync(cliEntry, '// cli\n')
  if (options.flock) {
    mkdirSync(join(scope, 'node-addon-system', 'lib'), { recursive: true })
    writeFileSync(join(scope, 'node-addon-system', 'lib', 'flock.js'), '// flock\n')
  }
  return cliEntry
}

describe('locateFlockEntry', () => {
  it('finds the sibling addon package from the CLI entry', () => {
    const cliEntry = seedPayload(tmp)
    const entry = locateFlockEntry(cliEntry)
    expect(entry).toBe(join(tmp, 'runtime', 'node_modules', '@deepseek-ai', 'node-addon-system', 'lib', 'flock.js'))
  })

  it('returns undefined when the payload does not carry the addon', () => {
    const cliEntry = seedPayload(tmp, { flock: false })
    expect(locateFlockEntry(cliEntry)).toBeUndefined()
  })
})

describe('warmFlockPreloadSource', () => {
  it('embeds the absolute entry and tolerates a failed warm-up', () => {
    const entry = join(tmp, 'runtime', 'node_modules', '@deepseek-ai', 'node-addon-system', 'lib', 'flock.js')
    const source = warmFlockPreloadSource(entry)
    expect(source).toContain(JSON.stringify(entry))
    expect(source).toContain('tryLockExclusive')
    expect(source).toContain('pathToFileURL')
    // The preload runs before user code: a broken binding must be reported,
    // never thrown into Node's module loader.
    expect(source).toMatch(/catch \(error\)/)
  })
})

describe('ensureBackendPreload', () => {
  it('writes the preload under the harness home and reuses an identical file', () => {
    const source = warmFlockPreloadSource('/payload/flock.js')
    const path = ensureBackendPreload(tmp, source)
    expect(path).toBe(join(tmp, 'desktop', BACKEND_PRELOAD_FILENAME))
    expect(readFileSync(path, 'utf8')).toBe(source)
    const before = statSync(path).mtimeMs
    expect(ensureBackendPreload(tmp, source)).toBe(path)
    expect(statSync(path).mtimeMs).toBe(before)
  })

  it('rewrites the preload when the payload location changes', () => {
    ensureBackendPreload(tmp, warmFlockPreloadSource('/payload/one/flock.js'))
    const next = warmFlockPreloadSource('/payload/two/flock.js')
    const path = ensureBackendPreload(tmp, next)
    expect(readFileSync(path, 'utf8')).toBe(next)
  })

  it('creates the harness desktop directory on first launch', () => {
    expect(existsSync(join(tmp, 'desktop'))).toBe(false)
    ensureBackendPreload(tmp, warmFlockPreloadSource('/payload/flock.js'))
    expect(existsSync(join(tmp, 'desktop'))).toBe(true)
  })
})
