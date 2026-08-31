import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ITemplateSchema } from '@yangl/canvas-editor'
import { CanvasMedicalRecordEditor } from './CanvasMedicalRecordEditor'

const editorState = vi.hoisted(() => ({
  instance: undefined as undefined | {
    listener: { contentChange?: () => void }
    destroy: ReturnType<typeof vi.fn>
  },
}))

vi.mock('@yangl/canvas-editor/dist/canvas-editor.es.js', () => {
  class MockEditor {
    listener: { contentChange?: () => void } = {}
    command = {
      getValue: () => ({ version: '0.9.133', data: { header: [], main: [{ value: '病程' }], footer: [] } }),
      getText: () => ({ header: '', main: '病程正文', footer: '' }),
    }
    destroy = vi.fn()
    constructor(container: HTMLDivElement) {
      container.textContent = 'Canvas 已加载'
      editorState.instance = this
    }
  }
  return {
    default: MockEditor,
    compileTemplate: vi.fn(() => ({ header: [], main: [], footer: [] })),
    createTemplateRuntime: vi.fn(() => ({
      extract: () => ({ structured: { conditionChanges: '病程' }, errors: [] }),
    })),
    EditorMode: { READONLY: 'readonly', FORM: 'form' },
    PageMode: { CONTINUITY: 'continuity' },
  }
})

const template = {
  id: 'daily', version: '1.0.0', name: '日常病程', blocks: [],
} as unknown as ITemplateSchema

describe('CanvasMedicalRecordEditor', () => {
  afterEach(() => { editorState.instance = undefined })

  it('loads asynchronously, snapshots initial content, tracks actual changes and destroys safely', async () => {
    const onSnapshot = vi.fn()
    const view = render(<CanvasMedicalRecordEditor template={template} readOnly={false} onSnapshot={onSnapshot} />)

    expect(await screen.findByText('Canvas 已加载')).toBeInTheDocument()
    await waitFor(() => expect(onSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      editorVersion: '0.9.133', plainText: '病程正文', changed: false,
      structuredValues: { conditionChanges: '病程' }, validationErrors: [],
    })))

    editorState.instance?.listener.contentChange?.()
    expect(onSnapshot).toHaveBeenLastCalledWith(expect.objectContaining({ changed: true }))
    const destroy = editorState.instance!.destroy
    view.unmount()
    expect(destroy).toHaveBeenCalledOnce()
  })
})
