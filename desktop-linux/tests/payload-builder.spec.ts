import { describe, expect, it } from 'vitest'
import { closureDeployArgs } from '../src/payload-builder.ts'

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
