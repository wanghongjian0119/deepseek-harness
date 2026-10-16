import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closureDeployArgs, flattenDeployedClosure, redundantClosureCopies } from '../src/payload-builder.ts'

/** Registry and store flags the in-app updater hands to every pnpm invocation. */
const REGISTRY_FLAGS = [
  '--registry', 'https://registry.npmmirror.com',
  '--store-dir=/home/user/.dsh/desktop/pnpm-store',
  '--fetch-timeout=1800000',
  '--network-concurrency=2',
]

describe('closureDeployArgs', () => {
  it('places the run-level flags between the invocation prefix and the deploy', () => {
    expect(closureDeployArgs(
      ['/payload/node/bin/node', '/work/pnpm-extract/package/bin/pnpm.cjs'],
      REGISTRY_FLAGS,
      '/home/user/.dsh/desktop/payloads/abc/runtime',
    )).toEqual([
      '/work/pnpm-extract/package/bin/pnpm.cjs',
      ...REGISTRY_FLAGS,
      '--filter', 'dsh-desktop-web-runtime-pkg',
      'deploy', '--legacy', '--prod',
      '--config.node-linker=hoisted',
      '--config.auto-install-peers=false',
      '--config.link-workspace-packages=true',
      '--config.allowUnusedPatches=true',
      '/home/user/.dsh/desktop/payloads/abc/runtime',
    ])
  })

  it('keeps a multi-word invocation prefix intact when no flags are given', () => {
    expect(closureDeployArgs(['pnpm', 'dlx', 'pnpm@11.7.0'], [], '/payload/runtime').slice(0, 4))
      .toEqual(['dlx', 'pnpm@11.7.0', '--filter', 'dsh-desktop-web-runtime-pkg'])
  })
})

describe('redundantClosureCopies', () => {
  const closure = new Map([['left-pad', '1.0.0'], ['@scope/pkg', '2.0.0']])

  it('keeps only the copies the closure root already holds at the same version', () => {
    expect(redundantClosureCopies(
      [['left-pad', '1.0.0'], ['conflicted', '2.0.0'], ['only-nested', '1.0.0'], ['@scope/pkg', '1.0.0']],
      closure,
    )).toEqual(['left-pad'])
  })

  it('keeps a copy whose version differs or that has no closure twin', () => {
    expect(redundantClosureCopies(
      [['left-pad', '1.0.1'], ['left-pad', undefined], ['only-nested', '1.0.0']],
      closure,
    )).toEqual([])
  })
})

describe('flattenDeployedClosure', () => {
  let payload: string

  /** Write one package directory holding only the manifest the flatten pass reads. */
  const makePackage = async (directory: string, version?: string): Promise<void> => {
    await mkdir(directory, { recursive: true })
    if (version !== undefined) {
      await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'ignored', version }))
    }
  }

  beforeEach(async () => { payload = await mkdtemp(join(tmpdir(), 'dsh-flatten-')) })
  afterEach(async () => { await rm(payload, { recursive: true, force: true }) })

  it('drops nested copies repeating the closure root and keeps genuine conflicts', async () => {
    const root = join(payload, 'node_modules')
    await makePackage(join(root, 'left-pad'), '1.0.0')
    await makePackage(join(root, '@scope/pkg'), '2.0.0')
    await makePackage(join(root, 'conflicted'), '1.0.0')
    const nested = join(root, 'consumer/node_modules')
    await makePackage(join(nested, 'left-pad'), '1.0.0')
    await makePackage(join(nested, '@scope/pkg'), '2.0.0')
    await makePackage(join(nested, 'conflicted'), '2.0.0')
    await makePackage(join(nested, 'only-nested'), '1.0.0')
    await makePackage(join(nested, 'only-nested/node_modules/left-pad'), '1.0.0')

    await flattenDeployedClosure(payload)

    // The repeated copies go, at both depths.
    expect(existsSync(join(nested, 'left-pad'))).toBe(false)
    expect(existsSync(join(nested, '@scope/pkg'))).toBe(false)
    expect(existsSync(join(nested, 'only-nested/node_modules/left-pad'))).toBe(false)
    // A different version is a different package, so it stays with its own manifest.
    expect(JSON.parse(await readFile(join(nested, 'conflicted/package.json'), 'utf8'))).toEqual({ name: 'ignored', version: '2.0.0' })
    // A package the closure root does not hold is not a duplicate of anything.
    expect(existsSync(join(nested, 'only-nested/package.json'))).toBe(true)
    // The closure root itself is untouched.
    expect(existsSync(join(root, 'left-pad/package.json'))).toBe(true)
  })

  it('removes a nested tree once every entry in it repeats the closure root', async () => {
    const root = join(payload, 'node_modules')
    await makePackage(join(root, 'left-pad'), '1.0.0')
    const nested = join(root, 'consumer/node_modules')
    await makePackage(join(nested, 'left-pad'), '1.0.0')

    await flattenDeployedClosure(payload)

    expect(existsSync(nested)).toBe(false)
  })
})
