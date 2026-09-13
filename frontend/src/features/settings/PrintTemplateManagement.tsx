import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import {
  errorMessage, type PrintDocumentDefinition, type PrintMediaProfile, type PrintTemplateDraft,
  type RhnApi, type SavePrintDraft,
} from '../../shared/rhnApi'
import { Alert, Button, EmptyState, FormField, Icon, LoadingState, PageHeader, Select, StatusBadge } from '../../shared/ui'
import { PrintDeviceManagement } from './PrintDeviceManagement'

type LayoutConfig = { paper?: Record<string, unknown>; elements?: Array<Record<string, unknown>>; blocks?: Array<Record<string, unknown>>; title?: string; footer?: boolean }

const STATUS_META = {
  DRAFT: ['草稿', 'neutral'], IN_REVIEW: ['待审核', 'warning'],
  PUBLISHED: ['已发布', 'success'], REJECTED: ['已退回', 'danger'],
} as const

const SAMPLE_DATA = {
  patientName: '张晓宁', gender: '女', ageText: '46岁', bedNo: '12床', medicationName: '阿莫西林胶囊',
  doseText: '0.5g', routeName: '口服', frequencyName: '每日三次', scheduledAtText: '08:00',
  instruction: '饭后服用', barcode: 'RX20260912001', infusionGroupText: '0.9%氯化钠 250ml + 注射用头孢曲松钠 2g',
  rateText: '40滴/分', safetyFlagsText: '皮试阴性', startedAtText: '2026-09-12 08:30', siteText: '左前臂',
  patrolRows: [{ timeText: '09:00', rateText: '40滴/分', observation: '无不适，穿刺处正常', operatorName: '王护士' }],
  endedAtText: '10:45', checkerName: '李护士',
}

export function PrintTemplateManagement({ api }: { api: RhnApi }) {
  const queryClient = useQueryClient()
  const catalog = useQuery({ queryKey: ['print-administration-catalog'], queryFn: api.printing.administrationCatalog })
  const drafts = useQuery({ queryKey: ['print-template-drafts'], queryFn: api.printing.templateDrafts })
  const templates = useQuery({ queryKey: ['published-print-templates'], queryFn: api.printing.templates })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [config, setConfig] = useState<LayoutConfig>({})
  const [rawJson, setRawJson] = useState('{}')
  const [name, setName] = useState('')
  const [definitionId, setDefinitionId] = useState('')
  const [mediaId, setMediaId] = useState('')
  const [selectedElement, setSelectedElement] = useState<number | null>(null)
  const [dirty, setDirty] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [operationError, setOperationError] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [workspace, setWorkspace] = useState<'TEMPLATES' | 'DEVICES'>('TEMPLATES')

  const selected = drafts.data?.find((item) => item.id === selectedId) ?? null
  const editable = selected?.status === 'DRAFT' || selected?.status === 'REJECTED'
  const definition = catalog.data?.documentDefinitions.find((item) => item.id === definitionId)
  const media = catalog.data?.mediaProfiles.find((item) => item.id === mediaId)

  useEffect(() => {
    if (!selectedId && drafts.data?.length) setSelectedId(drafts.data[0].id)
  }, [drafts.data, selectedId])

  useEffect(() => {
    if (!selected) return
    try {
      const parsed = JSON.parse(selected.configJson) as LayoutConfig
      setConfig(parsed); setRawJson(JSON.stringify(parsed, null, 2))
    } catch { setConfig({}); setRawJson(selected.configJson) }
    setName(selected.templateName); setDefinitionId(selected.documentDefinition.id)
    setMediaId(selected.mediaProfile.id); setSelectedElement(null); setDirty(false)
  }, [selected?.id, selected?.revision])

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  const refresh = async (value?: PrintTemplateDraft) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['print-template-drafts'] }),
      queryClient.invalidateQueries({ queryKey: ['published-print-templates'] }),
    ])
    if (value) setSelectedId(value.id)
  }

  const createDraft = useMutation({
    mutationFn: async () => {
      const allDefinitions = catalog.data?.documentDefinitions ?? []
      const nextDefinition = allDefinitions.find((item) => item.documentType === 'ORAL_MEDICATION_CARD') ?? allDefinitions[0]
      if (!nextDefinition) throw new Error('暂无可用单据定义')
      const nextMedia = preferredMedia(nextDefinition, catalog.data?.mediaProfiles ?? [])
      if (!nextMedia) throw new Error('暂无匹配的打印介质')
      const now = Date.now().toString().slice(-8)
      return api.printing.createTemplateDraft({
        documentDefinitionId: nextDefinition.id, mediaProfileId: nextMedia.id,
        templateCode: `CUSTOM_${nextDefinition.documentType}_${now}`,
        templateName: `${nextDefinition.documentName} 自定义模板`,
        ...defaultLayout(nextDefinition, nextMedia),
      })
    },
    onSuccess: async (value) => { setFeedback('新草稿已建立'); setOperationError(''); await refresh(value) },
    onError: (error) => setOperationError(errorMessage(error)),
  })

  const transition = useMutation({
    mutationFn: ({ action }: { action: 'submit' | 'reject' | 'publish' }) => {
      if (!selected) throw new Error('请先选择模板')
      return api.printing.transitionTemplateDraft(selected.id, action, selected.revision)
    },
    onSuccess: async (value, variables) => {
      setFeedback({ submit: '已提交审核', reject: '已退回修改', publish: '模板已发布并生成不可变版本' }[variables.action])
      setOperationError(''); await refresh(value)
    },
    onError: (error) => setOperationError(errorMessage(error)),
  })

  const clone = useMutation({
    mutationFn: (templateId: string) => api.printing.clonePublishedTemplate(templateId),
    onSuccess: async (value) => { setFeedback('已从发布版本创建新草稿'); setOperationError(''); await refresh(value) },
    onError: (error) => setOperationError(errorMessage(error)),
  })

  const save = async () => {
    if (!selected) throw new Error('请先选择模板')
    let parsed: LayoutConfig
    try { parsed = JSON.parse(rawJson) as LayoutConfig }
    catch { throw new Error('高级配置不是有效的 JSON') }
    const value = await api.printing.updateTemplateDraft(selected.id, {
      expectedRevision: selected.revision, documentDefinitionId: definitionId, mediaProfileId: mediaId,
      templateName: name, layoutSchema: selected.layoutSchema, configJson: JSON.stringify(parsed),
    })
    setConfig(parsed); setDirty(false); setFeedback('草稿已保存并通过布局校验'); setOperationError('')
    await refresh(value)
    return value
  }

  const handleSave = async () => { try { await save() } catch (error) { setOperationError(errorMessage(error)) } }
  const handlePreview = async () => {
    try {
      const draft = dirty && editable ? await save() : selected
      if (!draft) return
      const blob = await api.printing.previewTemplateDraft(draft.id, SAMPLE_DATA)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(URL.createObjectURL(blob)); setOperationError(''); setFeedback('PDF 预览已按正式渲染链生成')
    } catch (error) { setOperationError(errorMessage(error)) }
  }

  const applyConfig = (next: LayoutConfig) => {
    setConfig(next); setRawJson(JSON.stringify(next, null, 2)); setDirty(true)
  }
  const updateElement = (key: string, value: string | number | boolean) => {
    if (selectedElement == null) return
    const elements = [...(config.elements ?? [])]
    elements[selectedElement] = { ...elements[selectedElement], [key]: value }
    applyConfig({ ...config, elements })
  }
  const addElement = (type: 'text' | 'barcode') => {
    const elements = [...(config.elements ?? []), type === 'text'
      ? { type, xMm: 3, yMm: 3, widthMm: 35, heightMm: 7, text: '新文字', fontSize: 9 }
      : { type, xMm: 3, yMm: 35, widthMm: 28, heightMm: 12, path: 'barcode', showText: true }]
    applyConfig({ ...config, elements }); setSelectedElement(elements.length - 1)
  }

  const selectedCanvasElement = selectedElement == null ? null : config.elements?.[selectedElement]
  const categoryGroups = useMemo(() => groupDrafts(drafts.data ?? []), [drafts.data])
  const workspaceTabs = <div className="print-management-tabs" role="tablist" aria-label="打印管理分类">
    <button type="button" role="tab" aria-selected={workspace === 'TEMPLATES'}
      className={workspace === 'TEMPLATES' ? 'is-active' : ''} onClick={() => setWorkspace('TEMPLATES')}>
      <Icon name="clinical" />模板设计</button>
    <button type="button" role="tab" aria-selected={workspace === 'DEVICES'}
      className={workspace === 'DEVICES' ? 'is-active' : ''} onClick={() => setWorkspace('DEVICES')}>
      <Icon name="print" />设备与路由</button>
  </div>

  if (catalog.isLoading || drafts.isLoading || templates.isLoading) return <LoadingState label="正在加载打印模板工作台…" />

  if (workspace === 'DEVICES' && catalog.data) return <main className="print-template-page">
    <PageHeader compact eyebrow="系统配置 · 受控打印" title="打印设备与路由" actions={workspaceTabs} />
    <PrintDeviceManagement api={api} catalog={catalog.data} />
  </main>

  return <main className="print-template-page">
    <PageHeader compact eyebrow="系统配置 · 受控打印" title="打印模板管理" actions={<div className="print-template-actions">
      {workspaceTabs}
      <Button size="sm" variant="secondary" onClick={() => void createDraft.mutate()} busy={createDraft.isPending}><Icon name="add" /> 新建草稿</Button>
      <Button size="sm" variant="secondary" onClick={() => void handlePreview()} disabled={!selected}><Icon name="eye" /> PDF 预览</Button>
      <Button size="sm" onClick={() => void handleSave()} disabled={!editable || !dirty}><Icon name="check" /> 保存</Button>
    </div>} />
    {operationError && <Alert tone="error" onDismiss={() => setOperationError('')}>{operationError}</Alert>}
    {feedback && <Alert tone="success" onDismiss={() => setFeedback('')}>{feedback}</Alert>}

    <div className="print-template-workbench">
      <aside className="print-template-list" aria-label="模板列表">
        <div className="print-pane-heading"><div><strong>模板工作区</strong><span>{drafts.data?.length ?? 0} 份草稿记录</span></div></div>
        <div className="print-template-list__scroll">
          {Object.entries(categoryGroups).map(([category, values]) => <section key={category}>
            <h2>{categoryLabel(category)}</h2>
            {values.map((item) => <button type="button" key={item.id}
              className={`print-template-row ${item.id === selectedId ? 'is-active' : ''}`}
              onClick={() => setSelectedId(item.id)}>
              <span className="print-template-row__main"><strong>{item.templateName}</strong><small>{item.templateCode}</small></span>
              <StatusBadge tone={STATUS_META[item.status][1]}>{STATUS_META[item.status][0]}</StatusBadge>
            </button>)}
          </section>)}
          {!drafts.data?.length && <EmptyState icon="print" title="暂无草稿" copy="从新建草稿开始制作医院打印模板" />}
          {!!templates.data?.length && <section className="print-published-list"><h2>已发布模板</h2>
            {templates.data.map((item) => <div className="print-published-row" key={item.id}>
              <span><strong>{item.templateName}</strong><small>{item.scope === 'PLATFORM' ? '平台' : '本院'} · V{item.currentVersion}</small></span>
              <button type="button" title="复制为草稿" aria-label={`复制 ${item.templateName} 为草稿`} onClick={() => clone.mutate(item.id)}><Icon name="copy" /></button>
            </div>)}
          </section>}
        </div>
      </aside>

      <section className="print-template-designer" aria-label="模板设计区">
        <div className="print-pane-heading"><div><strong>{selected?.templateName ?? '设计画布'}</strong><span>{media ? `${media.mediaName} · ${media.dpi} DPI` : '未选择介质'}</span></div>
          {selected && <StatusBadge tone={STATUS_META[selected.status][1]}>{STATUS_META[selected.status][0]}</StatusBadge>}
        </div>
        {selected ? <>
          {definition?.layoutMode === 'CANVAS' && <div className="print-designer-toolbar">
            <Button size="sm" variant="text" disabled={!editable} onClick={() => addElement('text')}><Icon name="add" /> 文字</Button>
            <Button size="sm" variant="text" disabled={!editable} onClick={() => addElement('barcode')}><Icon name="add" /> 条码</Button>
            <span>尺寸单位：mm</span>
          </div>}
          <div className="print-canvas-stage">
            {previewUrl ? <iframe className="print-pdf-preview" src={previewUrl} title="打印模板 PDF 预览" />
              : definition?.layoutMode === 'CANVAS'
                ? <CanvasPreview config={config} media={media} selected={selectedElement} onSelect={setSelectedElement} />
                : <FlowPreview config={config} />}
          </div>
          {previewUrl && <button className="print-return-designer" type="button" onClick={() => setPreviewUrl('')}><Icon name="arrow-left" /> 返回设计画布</button>}
        </> : <EmptyState icon="print" title="选择一份模板" copy="模板内容与纸张预览将在此处显示" />}
      </section>

      <aside className="print-template-properties" aria-label="属性设置">
        <div className="print-pane-heading"><div><strong>属性</strong><span>{selectedCanvasElement ? '画布元素' : '模板与介质'}</span></div></div>
        {selected ? <div className="print-property-scroll">
          <FormField label="模板名称"><input value={name} disabled={!editable} onChange={(event) => { setName(event.target.value); setDirty(true) }} /></FormField>
          <FormField label="单据类型"><Select value={definitionId} disabled={!editable || !!selected.templateId} clearable={false}
            options={(catalog.data?.documentDefinitions ?? []).map((item) => ({ value: item.id, label: item.documentName, secondaryText: item.documentType }))} onChange={(value) => {
            const next = catalog.data?.documentDefinitions.find((item) => item.id === value)
            if (!next) return
            const nextMedia = preferredMedia(next, catalog.data?.mediaProfiles ?? [])
            setDefinitionId(next.id); if (nextMedia) { setMediaId(nextMedia.id); applyConfig(defaultConfig(next, nextMedia)) }
          }} /></FormField>
          <FormField label="纸张 / 标签"><Select value={mediaId} disabled={!editable} clearable={false}
            options={(catalog.data?.mediaProfiles ?? []).map((item) => ({ value: item.id, label: item.mediaName, secondaryText: `${item.widthMm} x ${item.heightMm ?? '连续'} mm` }))} onChange={(value) => {
            const next = catalog.data?.mediaProfiles.find((item) => item.id === value)
            if (!next) return
            setMediaId(next.id); applyConfig({ ...config, paper: paperConfig(next, definition?.layoutMode === 'CANVAS') })
          }} /></FormField>
          {selectedCanvasElement && <ElementProperties element={selectedCanvasElement} disabled={!editable} onChange={updateElement} />}
          <details className="print-advanced-config"><summary>高级布局配置</summary>
            <textarea aria-label="高级布局配置 JSON" spellCheck={false} value={rawJson} disabled={!editable}
              onChange={(event) => { setRawJson(event.target.value); setDirty(true); try { setConfig(JSON.parse(event.target.value) as LayoutConfig) } catch { /* Keep editing invalid intermediate JSON. */ } }} />
          </details>
          <div className="print-review-actions">
            {editable && <Button size="sm" variant="secondary" disabled={dirty} onClick={() => transition.mutate({ action: 'submit' })}>提交审核</Button>}
            {selected.status === 'IN_REVIEW' && <><Button size="sm" variant="secondary" onClick={() => transition.mutate({ action: 'reject' })}>退回</Button>
              <Button size="sm" onClick={() => transition.mutate({ action: 'publish' })}>发布版本</Button></>}
          </div>
        </div> : <EmptyState icon="settings" title="暂无属性" copy="选择模板后可维护布局与介质" />}
      </aside>
    </div>
  </main>
}

function CanvasPreview({ config, media, selected, onSelect }: { config: LayoutConfig; media?: PrintMediaProfile; selected: number | null; onSelect: (index: number) => void }) {
  const width = Number(config.paper?.widthMm ?? media?.widthMm ?? 80)
  const height = Number(config.paper?.heightMm ?? media?.heightMm ?? 55)
  const scale = Math.min(6, 520 / width, 620 / height)
  return <div className="print-canvas" style={{ width: width * scale, height: height * scale }}>
    {(config.elements ?? []).map((element, index) => {
      const type = String(element.type ?? 'text')
      return <button type="button" key={index} className={`print-canvas-element is-${type} ${selected === index ? 'is-selected' : ''}`}
        onClick={() => onSelect(index)} style={{ left: Number(element.xMm ?? 0) * scale, top: Number(element.yMm ?? 0) * scale,
          width: Number(element.widthMm ?? 20) * scale, height: Number(element.heightMm ?? 6) * scale,
          fontSize: Number(element.fontSize ?? 9) * .95, fontWeight: element.bold ? 700 : 400,
          textAlign: String(element.align ?? 'LEFT').toLowerCase() as 'left' | 'center' | 'right' }}>
        {type === 'barcode' ? <span className="print-barcode-demo" /> : previewText(element)}
      </button>
    })}
  </div>
}

function FlowPreview({ config }: { config: LayoutConfig }) {
  return <article className="print-flow-sheet"><h1>{config.title || '临床单据'}</h1>
    {(config.blocks ?? []).map((block, index) => <section key={index} className={`print-flow-block is-${String(block.type)}`}>
      {Boolean(block.title) && <h2>{String(block.title)}</h2>}
      {block.type === 'fieldGrid' && <div className="print-flow-fields">{(block.fields as Array<Record<string, unknown>> ?? []).map((field, fieldIndex) => <div key={fieldIndex}><span>{String(field.label ?? '字段')}</span><strong>{sampleValue(String(field.path ?? ''))}</strong></div>)}</div>}
      {block.type === 'table' && <table><thead><tr>{(block.columns as Array<Record<string, unknown>> ?? []).map((column, columnIndex) => <th key={columnIndex}>{String(column.label ?? '')}</th>)}</tr></thead><tbody><tr>{(block.columns as Array<Record<string, unknown>> ?? []).map((column, columnIndex) => <td key={columnIndex}>{sampleValue(String(column.path ?? ''))}</td>)}</tr></tbody></table>}
      {block.type === 'section' && <p>{sampleValue(String(block.path ?? '')) || '示例内容'}</p>}
      {block.type === 'signature' && <div className="print-flow-signature"><span>{String(block.leftLabel ?? '签名')}：________</span><span>{String(block.rightLabel ?? '核对')}：________</span></div>}
    </section>)}
  </article>
}

function ElementProperties({ element, disabled, onChange }: { element: Record<string, unknown>; disabled: boolean; onChange: (key: string, value: string | number | boolean) => void }) {
  return <fieldset className="print-element-properties"><legend>{element.type === 'barcode' ? '条码元素' : '文字元素'}</legend>
    <div className="print-coordinate-grid">{(['xMm', 'yMm', 'widthMm', 'heightMm'] as const).map((key) => <FormField key={key} label={({ xMm: 'X', yMm: 'Y', widthMm: '宽', heightMm: '高' })[key]}><input type="number" min="0" step="0.5" value={Number(element[key] ?? 0)} disabled={disabled} onChange={(event) => onChange(key, Number(event.target.value))} /></FormField>)}</div>
    {element.type === 'text' ? <>
      <FormField label="文字 / 数据占位符"><textarea value={String(element.template ?? element.text ?? '')} disabled={disabled} onChange={(event) => onChange(element.template != null ? 'template' : 'text', event.target.value)} /></FormField>
      <div className="print-coordinate-grid"><FormField label="字号"><input type="number" min="5" max="72" value={Number(element.fontSize ?? 9)} disabled={disabled} onChange={(event) => onChange('fontSize', Number(event.target.value))} /></FormField>
        <FormField label="对齐"><Select value={String(element.align ?? 'LEFT')} disabled={disabled} clearable={false} searchable={false}
          options={[{ value: 'LEFT', label: '左对齐' }, { value: 'CENTER', label: '居中' }, { value: 'RIGHT', label: '右对齐' }]}
          onChange={(value) => onChange('align', value)} /></FormField></div>
    </> : <FormField label="条码数据字段"><input value={String(element.path ?? 'barcode')} disabled={disabled} onChange={(event) => onChange('path', event.target.value)} /></FormField>}
  </fieldset>
}

function defaultLayout(definition: PrintDocumentDefinition, media: PrintMediaProfile): Pick<SavePrintDraft, 'layoutSchema' | 'configJson'> {
  const config = defaultConfig(definition, media)
  return { layoutSchema: definition.layoutMode === 'CANVAS' ? 'RHN_PRINT_CANVAS_V1' : 'RHN_PRINT_FLOW_V1', configJson: JSON.stringify(config) }
}
function defaultConfig(definition: PrintDocumentDefinition, media: PrintMediaProfile): LayoutConfig {
  if (definition.layoutMode === 'CANVAS') return { paper: paperConfig(media, true), elements: [
    { type: 'text', xMm: 2, yMm: 2, widthMm: media.widthMm - 4, heightMm: 7, text: definition.documentName, fontSize: 13, bold: true, align: 'CENTER' },
    { type: 'text', xMm: 2, yMm: 11, widthMm: media.widthMm - 4, heightMm: 10, template: '{{patientName}}  {{medicationName}}', fontSize: 9, border: true },
  ] }
  return { paper: paperConfig(media, false), title: definition.documentName, blocks: [
    { type: 'fieldGrid', columns: 2, fields: [{ label: '姓名', path: 'patientName' }, { label: '床号', path: 'bedNo' }] },
    { type: 'section', title: '内容', path: 'infusionGroupText' }, { type: 'signature', leftLabel: '执行人', leftPath: 'operatorName', rightLabel: '核对人', rightPath: 'checkerName' },
  ], footer: true }
}
function paperConfig(media: PrintMediaProfile, canvas: boolean) {
  return { widthMm: media.widthMm, heightMm: media.heightMm ?? (canvas ? 55 : 120), marginTopMm: media.marginTopMm,
    marginRightMm: media.marginRightMm, marginBottomMm: media.marginBottomMm, marginLeftMm: media.marginLeftMm }
}
function preferredMedia(definition: PrintDocumentDefinition, media: PrintMediaProfile[]) {
  const code = definition.layoutMode === 'FLOW' ? 'A4_PORTRAIT'
    : definition.documentType === 'INFUSION_LABEL' ? 'LABEL_70X50' : 'THERMAL_80_CONTINUOUS'
  return media.find((item) => item.mediaCode === code) ?? media[0]
}
function previewText(element: Record<string, unknown>) {
  return String(element.template ?? element.text ?? '').replace(/\{\{([A-Za-z0-9_.-]+)}}/g, (_, key: string) => sampleValue(key))
}
function sampleValue(key: string) { return String((SAMPLE_DATA as Record<string, unknown>)[key] ?? '') }
function groupDrafts(values: PrintTemplateDraft[]) {
  return values.reduce<Record<string, PrintTemplateDraft[]>>((groups, item) => {
    const key = item.documentDefinition.category; (groups[key] ??= []).push(item); return groups
  }, {})
}
function categoryLabel(value: string) { return ({ CLINICAL_DOCUMENT: '临床文书', PRESCRIPTION: '处方', APPLICATION: '申请单', CARD: '执行卡', LABEL: '标签', LIST: '清单' } as Record<string, string>)[value] ?? value }
