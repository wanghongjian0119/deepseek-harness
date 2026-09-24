/** Terminal clipboard shortcuts resolved from xterm's keyboard events. */

/** Clipboard action a terminal keydown requests. */
export type TerminalClipboardAction = 'copy' | 'paste'

/**
 * Whether the running platform uses Command as the primary shortcut modifier.
 *
 * The macOS desktop shell marks `<html>` with `data-platform="darwin"`; a
 * browser never carries that mark, so its user agent identifies macOS there.
 * @returns true on macOS.
 */
export function macShortcutPlatform(): boolean {
  return document.documentElement.dataset.platform === 'darwin' || /mac/i.test(navigator.userAgent)
}

/**
 * Resolve the clipboard action a terminal keydown requests.
 *
 * xterm handles Ctrl+C and Ctrl+V itself: it sends the corresponding control
 * character to the PTY and cancels the browser's native copy and paste. The
 * renderer therefore resolves the clipboard combinations before xterm sees
 * them. Copy needs a selection so an unselected Ctrl+C stays SIGINT; paste
 * always wins over the literal control character, matching other integrated
 * terminals. Modified keys other than keydown, and Alt combinations (AltGr),
 * stay with the shell.
 * @param event - the keyboard event xterm received from its hidden textarea.
 * @param hasSelection - whether the emulator currently holds selected text.
 * @param mac - shortcut-modifier platform, from {@link macShortcutPlatform}.
 * @returns the requested action, or undefined to let xterm handle the key.
 */
export function terminalClipboardAction(
  event: KeyboardEvent, hasSelection: boolean, mac: boolean,
): TerminalClipboardAction | undefined {
  if (event.type !== 'keydown' || event.altKey) return undefined
  if (!(mac ? event.metaKey : event.ctrlKey)) return undefined
  const key = event.key.toLowerCase()
  if (key === 'c') return hasSelection ? 'copy' : undefined
  return key === 'v' ? 'paste' : undefined
}
