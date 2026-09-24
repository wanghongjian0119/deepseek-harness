/**
 * Context menu for the shell window.
 *
 * Electron renders no context menu of its own, so a right-click reaches the
 * page and nothing appears. Build the standard editing menu for an editable
 * target and a lone Copy for selected read-only text, honoring the edit flags
 * Chromium reports for that click.
 * @module @deepseek-ai/dsh-desktop-linux/context-menu
 */

import type { ContextMenuParams, MenuItemConstructorOptions } from 'electron'

/** Labels spelled out because the shell's menu is Chinese whatever the host locale resolves to. */
const EDIT_LABELS = {
  undo: '撤销', redo: '重做', cut: '剪切', copy: '复制', paste: '粘贴', selectAll: '全选',
} as const

/** Empty accelerators suppress Electron's default shortcut labels for native roles. */
const NO_ACCELERATOR = { accelerator: '' } as const

/**
 * Build the context menu for one right-click.
 * @param params - the renderer facts Electron reports for the click.
 * @returns the template to pop up, empty when the click offers no action.
 */
export function contextMenuTemplate(
  params: Pick<ContextMenuParams, 'isEditable' | 'selectionText' | 'editFlags'>,
): MenuItemConstructorOptions[] {
  const { isEditable, selectionText, editFlags } = params
  if (isEditable) {
    return [
      { role: 'undo', label: EDIT_LABELS.undo, enabled: editFlags.canUndo, ...NO_ACCELERATOR },
      { role: 'redo', label: EDIT_LABELS.redo, enabled: editFlags.canRedo, ...NO_ACCELERATOR },
      { type: 'separator' },
      { role: 'cut', label: EDIT_LABELS.cut, enabled: editFlags.canCut, ...NO_ACCELERATOR },
      { role: 'copy', label: EDIT_LABELS.copy, enabled: editFlags.canCopy, ...NO_ACCELERATOR },
      { role: 'paste', label: EDIT_LABELS.paste, enabled: editFlags.canPaste, ...NO_ACCELERATOR },
      { type: 'separator' },
      { role: 'selectAll', label: EDIT_LABELS.selectAll, enabled: editFlags.canSelectAll, ...NO_ACCELERATOR },
    ]
  }
  // Read-only text: the terminal screen is a canvas, so a selection is the only
  // thing a right-click can offer there.
  if (selectionText.length > 0) {
    return [{ role: 'copy', label: EDIT_LABELS.copy, enabled: editFlags.canCopy, ...NO_ACCELERATOR }]
  }
  return []
}
