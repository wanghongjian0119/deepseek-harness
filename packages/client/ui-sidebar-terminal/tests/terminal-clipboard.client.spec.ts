// @vitest-environment jsdom
/** Terminal clipboard combinations resolved before xterm consumes them. */
import { afterEach, expect, it, vi } from 'vitest'
import { macShortcutPlatform, terminalClipboardAction } from '../src/client/terminal-clipboard.ts'

afterEach(() => { vi.unstubAllGlobals(); delete document.documentElement.dataset.platform })

function key(type: string, init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent(type, init)
}

it('copies only a selected terminal and pastes the clipboard', () => {
  expect(terminalClipboardAction(key('keydown', { key: 'c', ctrlKey: true }), true, false)).toBe('copy')
  expect(terminalClipboardAction(key('keydown', { key: 'C', ctrlKey: true }), false, false)).toBeUndefined()
  expect(terminalClipboardAction(key('keydown', { key: 'v', ctrlKey: true }), false, false)).toBe('paste')
  expect(terminalClipboardAction(key('keydown', { key: 'x', ctrlKey: true }), true, false)).toBeUndefined()
})

it('leaves Alt combinations and non-keydown events to the shell', () => {
  expect(terminalClipboardAction(key('keydown', { key: 'c', ctrlKey: true, altKey: true }), true, false)).toBeUndefined()
  expect(terminalClipboardAction(key('keyup', { key: 'c', ctrlKey: true }), true, false)).toBeUndefined()
  expect(terminalClipboardAction(key('keypress', { key: 'v', ctrlKey: true }), false, false)).toBeUndefined()
})

it('requires Command on macOS and ignores it elsewhere', () => {
  expect(terminalClipboardAction(key('keydown', { key: 'c', metaKey: true }), true, true)).toBe('copy')
  expect(terminalClipboardAction(key('keydown', { key: 'v', metaKey: true }), false, true)).toBe('paste')
  expect(terminalClipboardAction(key('keydown', { key: 'c', ctrlKey: true }), true, true)).toBeUndefined()
  expect(terminalClipboardAction(key('keydown', { key: 'c', metaKey: true }), true, false)).toBeUndefined()
})

it('reads the macOS mark from the shell document and otherwise from the user agent', () => {
  vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' })
  expect(macShortcutPlatform()).toBe(false)
  document.documentElement.dataset.platform = 'darwin'
  expect(macShortcutPlatform()).toBe(true)
  delete document.documentElement.dataset.platform
  vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' })
  expect(macShortcutPlatform()).toBe(true)
})
