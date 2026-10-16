/**
 * Build-time CLI for `desktop-linux/resources/dsh`: assemble the backend
 * payload from the current checkout. Runs the shared pipeline in
 * `src/payload-builder.ts` with the system pnpm (`pnpm dlx pnpm@<version>`),
 * a Node runtime downloaded from nodejs.org, and the checkout's git HEAD as
 * the recorded source ref.
 * @module @deepseek-ai/dsh-desktop-linux/assemble-payload
 */

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assemblePayload, dirSize } from '../src/payload-builder.ts'
import { parsePnpmVersion } from '../src/updater/update-job.ts'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))

/**
 * The pnpm the deploy must run under: the checkout's `packageManager` pin, the
 * same field the in-app updater reads. A hardcoded version goes stale as soon
 * as upstream moves the pin, and pnpm then refuses to run under a project whose
 * declared version differs while corepack invoked it.
 * @returns the declared pnpm version, or the updater's default when unparseable.
 */
function declaredPnpmVersion(): string {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { packageManager?: string }
  return parsePnpmVersion(manifest.packageManager)
}
/** Where the payload lands before electron-builder picks it up. */
const PAYLOAD_DIR = 'desktop-linux/resources/dsh'
/** Scratch staging under desktop-linux/.stage. */
const STAGE_DIR = 'desktop-linux/.stage'

/** The checkout's git HEAD, or undefined when git is unavailable. */
function gitHead(): string | undefined {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })
  if (result.status !== 0) return undefined
  const sha = result.stdout.trim()
  return /^[0-9a-f]{40}$/.test(sha) ? sha : undefined
}

const outDir = join(root, PAYLOAD_DIR)
const sourceRef = gitHead()
await assemblePayload({
  sourceRoot: root,
  outDir,
  stageDir: join(root, STAGE_DIR),
  pnpmArgs: ['pnpm', 'dlx', `pnpm@${declaredPnpmVersion()}`],
  ...(sourceRef !== undefined ? { sourceRef } : {}),
})
const size = await dirSize(outDir)
console.log(`assemble-payload: ${outDir} (${(size / 1024 / 1024).toFixed(1)} MB)`)
