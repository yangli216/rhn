import { useEffect, useRef, useState } from 'react'
import type { IEditorData, ITemplateSchema } from '@yangl/canvas-editor'
import { Alert, Button, LoadingState } from '../../shared/ui'

export interface CanvasEditorSnapshot {
  editorVersion: string
  editorData: IEditorData
  plainText: string
  structuredValues: Record<string, unknown>
  validationErrors: Array<{ fieldId: string; label?: string; message: string }>
  changed: boolean
}

export function CanvasMedicalRecordEditor({ template, initialData, readOnly, onSnapshot }: {
  template: ITemplateSchema
  initialData?: IEditorData
  readOnly: boolean
  onSnapshot: (snapshot: CanvasEditorSnapshot) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const onSnapshotRef = useRef(onSnapshot)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => { onSnapshotRef.current = onSnapshot }, [onSnapshot])

  useEffect(() => {
    let disposed = false
    let destroy: (() => void) | undefined
    setLoading(true)
    setError('')
    void import('@yangl/canvas-editor/dist/canvas-editor.es.js').then((module) => {
      if (disposed || !container.current) return
      const editorData = initialData ?? module.compileTemplate(template)
      const editor = new module.default(container.current, editorData, {
        mode: readOnly ? module.EditorMode.READONLY : module.EditorMode.FORM,
        locale: 'zh-CN',
        defaultFont: 'SimSun',
        defaultSize: 14,
        pageMode: module.PageMode.CONTINUITY,
        width: 794,
        margins: [70, 88, 70, 88],
        pageGap: 12,
        scrollContainerSelector: '.inpatient-record-editor__viewport',
        control: { prefix: '', postfix: '' },
      })
      const templateRuntime = module.createTemplateRuntime(editor, template)
      const snapshot = (changed: boolean) => {
        const result = editor.command.getValue()
        const text = editor.command.getText()
        const structured = templateRuntime.extract()
        onSnapshotRef.current({
          editorVersion: result.version,
          editorData: result.data,
          plainText: [text.header, text.main, text.footer].filter(Boolean).join('\n').trim(),
          structuredValues: structured.structured,
          validationErrors: structured.errors,
          changed,
        })
      }
      editor.listener.contentChange = () => snapshot(true)
      snapshot(false)
      destroy = () => editor.destroy()
      setLoading(false)
    }).catch(() => {
      if (!disposed) {
        setError('病历编辑器加载失败，请刷新后重试。')
        setLoading(false)
      }
    })
    return () => {
      disposed = true
      destroy?.()
      if (container.current) container.current.replaceChildren()
    }
  }, [initialData, loadAttempt, readOnly, template])

  return <div className={`inpatient-record-editor ${readOnly ? 'is-readonly' : ''}`}>
    {loading && <LoadingState label="正在加载病历编辑器…" />}
    {error && <Alert>{error}<Button size="sm" variant="secondary"
      onClick={() => setLoadAttempt((value) => value + 1)}>重新加载编辑器</Button></Alert>}
    <div className="inpatient-record-editor__viewport">
      <div ref={container} className="inpatient-record-editor__canvas" aria-label="电子病历编辑区" />
    </div>
  </div>
}
