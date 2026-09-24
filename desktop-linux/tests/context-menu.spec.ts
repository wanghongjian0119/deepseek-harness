/** Context menu template for shell right-clicks. */
import { describe, expect, it } from 'vitest'
import { contextMenuTemplate } from '../src/context-menu.ts'

/** Every edit flag Chromium reports, overridable per case. */
const editFlags = {
  canUndo: false, canRedo: false, canCut: false, canCopy: false,
  canPaste: false, canDelete: false, canSelectAll: false, canEditRichly: false,
}

describe('contextMenuTemplate', () => {
  it('offers the editing roles for an editable target, honoring the edit flags', () => {
    const template = contextMenuTemplate({
      isEditable: true, selectionText: 'ignored',
      editFlags: { ...editFlags, canUndo: true, canCut: true, canCopy: true, canPaste: true, canSelectAll: true },
    })
    expect(template.map(item => item.role ?? item.type)).toEqual([
      'undo', 'redo', 'separator', 'cut', 'copy', 'paste', 'separator', 'selectAll',
    ])
    expect(template.map(item => item.label)).toEqual(['撤销', '重做', undefined, '剪切', '复制', '粘贴', undefined, '全选'])
    expect(template.map(item => item.enabled)).toEqual([true, false, undefined, true, true, true, undefined, true])
    expect(template.every(item => item.accelerator === '' || item.type === 'separator')).toBe(true)
  })

  it('offers only Copy for selected read-only text', () => {
    const template = contextMenuTemplate({ isEditable: false, selectionText: 'selected', editFlags })
    expect(template).toEqual([{ role: 'copy', label: '复制', enabled: false, accelerator: '' }])
  })

  it('offers nothing when the click has no editable target and no selection', () => {
    expect(contextMenuTemplate({ isEditable: false, selectionText: '', editFlags })).toEqual([])
  })
})
