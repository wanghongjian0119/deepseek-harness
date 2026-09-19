/**
 * The desktop window icon has to stay small enough for Electron to publish it.
 *
 * `BrowserWindow`'s `icon` reaches the window manager as `_NET_WM_ICON`.
 * Electron drops an image larger than 128px and leaves the property empty, so
 * the window shows a generic icon wherever no desktop entry claims it. The
 * packaged icon is the file electron-builder copies to `Resources/icon.png`,
 * which is what the main process reads at runtime.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** Largest side Electron accepts for a window icon; measured on Electron 44. */
const MAX_WINDOW_ICON_PX = 128

/** Pixel dimensions from a PNG's IHDR chunk. */
function pngSize(bytes: Buffer): { width: number; height: number } {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

describe('packaged window icon', () => {
  it('stays within the size Electron publishes as _NET_WM_ICON', () => {
    const config = readFileSync(fileURLToPath(new URL('../electron-builder.yml', import.meta.url)), 'utf8')
    const from = /- from: (build\/icons\/\d+x\d+\.png)\s*\n\s*to: icon\.png/.exec(config)?.[1]
    expect(from).toBeDefined()
    const icon = readFileSync(fileURLToPath(new URL(`../${from ?? ''}`, import.meta.url)))
    const { width, height } = pngSize(icon)
    expect(Math.max(width, height)).toBeLessThanOrEqual(MAX_WINDOW_ICON_PX)
  })
})
