import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  errorMessage, type PrintDocumentDefinition, type PrintMediaProfile, type PrintTemplateDraft,
  type PublishedPrintTemplate,
  type RhnApi, type SavePrintDraft,
} from '../../shared/rhnApi'
import {
  Alert, Button, EmptyState, FormField, Icon, LoadingState, PageHeader, Select, StatusBadge, Switch, Tabs, Tooltip,
} from '../../shared/ui'
import { PrintBusinessMapping } from './PrintBusinessMapping'
import { PrintDeviceManagement } from './PrintDeviceManagement'
import '../../styles/features/print-template-management.css'

type LayoutConfig = { paper?: Record<string, unknown>; elements?: Array<Record<string, unknown>>; blocks?: Array<Record<string, unknown>>; title?: string; footer?: boolean }
type TemplateSelection = { kind: 'DRAFT' | 'PUBLISHED'; id: string }
type PrintFieldPreset = {
  key: string
  label: string
  group: '患者信息' | '业务内容' | '执行与追溯'
  type?: 'text' | 'barcode'
  sample: string
  widthMm?: number
  heightMm?: number
}

const STATUS_META = {
  DRAFT: ['草稿', 'neutral'], IN_REVIEW: ['待审核', 'warning'],
  PUBLISHED: ['已发布', 'success'], REJECTED: ['已退回', 'danger'],
} as const

const SAMPLE_DATA = {
  title: '门诊病历', organizationName: '仁和医院', patientName: '张晓宁', gender: '女', ageText: '46岁', bedNo: '12床',
  resident: { fullName: '张晓宁', gender: '女', birthDate: '1980-03-12', healthRecordNo: 'HR20260912001', phone: '13800000000' },
  healthRecordNo: 'HR20260912001', outpatientNo: 'MZ20260912001', encounterNo: 'JZ20260912001', departmentName: '全科门诊',
  doctorName: '陈医生', printedAtText: '2026-09-12 10:30', medicationName: '阿莫西林胶囊', specification: '0.25g×24粒',
  doseText: '0.5g', routeName: '口服', frequencyName: '每日三次', scheduledAtText: '08:00',
  instruction: '饭后服用', barcode: 'RX20260912001', infusionGroupText: '0.9%氯化钠 250ml + 注射用头孢曲松钠 2g',
  rateText: '40滴/分', safetyFlagsText: '皮试阴性', startedAtText: '2026-09-12 08:30', siteText: '左前臂',
  patrolRows: [{ timeText: '09:00', rateText: '40滴/分', observation: '无不适，穿刺处正常', operatorName: '王护士' }],
  endedAtText: '10:45', operatorName: '王护士', checkerName: '李护士', prescriptionNo: 'CF20260912001',
  requestNo: 'SQ20260912001', itemName: '血常规', quantityText: '1 项', specimenType: '静脉血', examinationType: '超声',
  serviceTypeText: '治疗', clinicalDescription: '发热伴咽痛三天', reason: '明确感染情况', businessDate: '2026-09-12',
  authoredBy: '陈医生', authoredAt: '2026-09-12 10:12', signedBy: '陈医生', signedAt: '2026-09-12 10:20',
  content: { chiefComplaint: '发热、咽痛三天', presentIllness: '三天前无明显诱因出现发热。', pastHistory: '否认重大疾病史。', allergyHistory: '青霉素过敏', physicalExam: 'T 38.2℃，咽部充血。', diagnosis: '急性上呼吸道感染', treatmentPlan: '对症治疗，复诊随访。' },
  medications: [{ medicationName: '阿莫西林胶囊', specification: '0.25g×24粒', quantity: '2', quantityUnit: '盒', doseValue: '0.5', doseUnit: 'g', routeCode: 'PO', frequencyCode: 'TID', instruction: '饭后服用' }],
}

const PATIENT_FIELDS: PrintFieldPreset[] = [
  { key: 'patientName', label: '患者姓名', group: '患者信息', sample: '张晓宁' },
  { key: 'gender', label: '性别', group: '患者信息', sample: '女', widthMm: 22 },
  { key: 'ageText', label: '年龄', group: '患者信息', sample: '46岁', widthMm: 22 },
  { key: 'bedNo', label: '床号', group: '患者信息', sample: '12床', widthMm: 24 },
  { key: 'healthRecordNo', label: '健康档案号', group: '患者信息', sample: 'HR20260912001' },
  { key: 'encounterNo', label: '就诊号', group: '患者信息', sample: 'JZ20260912001' },
  { key: 'departmentName', label: '科室', group: '患者信息', sample: '全科门诊' },
]

const CLINICAL_PATIENT_FIELDS: PrintFieldPreset[] = [
  { key: 'resident.fullName', label: '患者姓名', group: '患者信息', sample: '张晓宁' },
  { key: 'resident.gender', label: '性别', group: '患者信息', sample: '女', widthMm: 22 },
  { key: 'resident.birthDate', label: '出生日期', group: '患者信息', sample: '1980-03-12' },
  { key: 'resident.healthRecordNo', label: '健康档案号', group: '患者信息', sample: 'HR20260912001' },
  { key: 'encounterNo', label: '就诊号', group: '患者信息', sample: 'JZ20260912001' },
  { key: 'departmentName', label: '科室', group: '患者信息', sample: '全科门诊' },
]

const FIELD_PRESETS: Record<string, PrintFieldPreset[]> = {
  OUTPATIENT_NOTE: [...CLINICAL_PATIENT_FIELDS,
    { key: 'content.chiefComplaint', label: '主诉', group: '业务内容', sample: '发热、咽痛三天' },
    { key: 'content.presentIllness', label: '现病史', group: '业务内容', sample: '三天前出现发热' },
    { key: 'content.pastHistory', label: '既往史', group: '业务内容', sample: '否认重大疾病史' },
    { key: 'content.allergyHistory', label: '过敏史', group: '业务内容', sample: '青霉素过敏' },
    { key: 'content.physicalExam', label: '体格检查', group: '业务内容', sample: 'T 38.2℃' },
    { key: 'content.diagnosis', label: '诊断', group: '业务内容', sample: '急性上呼吸道感染' },
    { key: 'content.treatmentPlan', label: '诊疗计划', group: '业务内容', sample: '对症治疗' },
    { key: 'signedBy', label: '签署医生', group: '执行与追溯', sample: '陈医生' },
    { key: 'signedAt', label: '签署时间', group: '执行与追溯', sample: '2026-09-12 10:20' }],
  OUTPATIENT_PRESCRIPTION: [...CLINICAL_PATIENT_FIELDS,
    { key: 'prescriptionNo', label: '处方号', group: '业务内容', sample: 'CF20260912001' },
    { key: 'medications', label: '药品明细', group: '业务内容', sample: '阿莫西林胶囊 0.5g' },
    { key: 'note', label: '处方备注', group: '业务内容', sample: '遵医嘱用药' },
    { key: 'authoredBy', label: '开方医生', group: '执行与追溯', sample: '陈医生' },
    { key: 'authoredAt', label: '开立时间', group: '执行与追溯', sample: '2026-09-12 10:12' }],
  LABORATORY_APPLICATION: [], EXAMINATION_APPLICATION: [], TREATMENT_APPLICATION: [],
  ORAL_MEDICATION_CARD: [...PATIENT_FIELDS,
    { key: 'medicationName', label: '药品名称', group: '业务内容', sample: '阿莫西林胶囊' },
    { key: 'specification', label: '规格', group: '业务内容', sample: '0.25g×24粒' },
    { key: 'doseText', label: '单次剂量', group: '业务内容', sample: '0.5g' },
    { key: 'routeName', label: '给药途径', group: '业务内容', sample: '口服' },
    { key: 'frequencyName', label: '频次', group: '业务内容', sample: '每日三次' },
    { key: 'scheduledAtText', label: '计划时间', group: '执行与追溯', sample: '08:00' },
    { key: 'instruction', label: '用药嘱托', group: '业务内容', sample: '饭后服用' },
    { key: 'barcode', label: '执行条码', group: '执行与追溯', sample: 'RX20260912001', type: 'barcode', widthMm: 28, heightMm: 12 }],
  INFUSION_LABEL: [...PATIENT_FIELDS,
    { key: 'infusionGroupText', label: '输液组内容', group: '业务内容', sample: '0.9%氯化钠 + 头孢曲松钠', heightMm: 12 },
    { key: 'routeName', label: '给药途径', group: '业务内容', sample: '静滴' },
    { key: 'rateText', label: '滴速', group: '业务内容', sample: '40滴/分' },
    { key: 'safetyFlagsText', label: '安全提示', group: '执行与追溯', sample: '皮试阴性' },
    { key: 'scheduledAtText', label: '计划时间', group: '执行与追溯', sample: '08:00' },
    { key: 'barcode', label: '执行条码', group: '执行与追溯', sample: 'RX20260912001', type: 'barcode', widthMm: 28, heightMm: 12 }],
  INFUSION_PATROL_CARD: [...PATIENT_FIELDS,
    { key: 'infusionGroupText', label: '输液组内容', group: '业务内容', sample: '0.9%氯化钠 + 头孢曲松钠' },
    { key: 'startedAtText', label: '开始时间', group: '执行与追溯', sample: '2026-09-12 08:30' },
    { key: 'siteText', label: '穿刺部位', group: '执行与追溯', sample: '左前臂' },
    { key: 'rateText', label: '初始滴速', group: '业务内容', sample: '40滴/分' },
    { key: 'patrolRows', label: '巡视记录', group: '业务内容', sample: '09:00 无不适' },
    { key: 'endedAtText', label: '结束时间', group: '执行与追溯', sample: '10:45' },
    { key: 'operatorName', label: '执行人', group: '执行与追溯', sample: '王护士' },
    { key: 'checkerName', label: '核对人', group: '执行与追溯', sample: '李护士' }],
}

const APPLICATION_FIELDS: PrintFieldPreset[] = [...CLINICAL_PATIENT_FIELDS,
  { key: 'requestNo', label: '申请单号', group: '业务内容', sample: 'SQ20260912001' },
  { key: 'itemName', label: '申请项目', group: '业务内容', sample: '血常规' },
  { key: 'quantityText', label: '数量', group: '业务内容', sample: '1 项' },
  { key: 'clinicalDescription', label: '临床说明', group: '业务内容', sample: '发热伴咽痛三天' },
  { key: 'reason', label: '申请原因', group: '业务内容', sample: '明确感染情况' },
  { key: 'authoredBy', label: '开立医生', group: '执行与追溯', sample: '陈医生' },
  { key: 'authoredAt', label: '开立时间', group: '执行与追溯', sample: '2026-09-12 10:12' },
]
FIELD_PRESETS.LABORATORY_APPLICATION = [...APPLICATION_FIELDS, { key: 'specimenType', label: '标本类型', group: '业务内容', sample: '静脉血' }]
FIELD_PRESETS.EXAMINATION_APPLICATION = [...APPLICATION_FIELDS, { key: 'examinationType', label: '检查类型', group: '业务内容', sample: '超声' }]
FIELD_PRESETS.TREATMENT_APPLICATION = [...APPLICATION_FIELDS, { key: 'serviceTypeText', label: '项目类型', group: '业务内容', sample: '治疗' }]

export function PrintTemplateManagement({ api }: { api: RhnApi }) {
  const queryClient = useQueryClient()
  const catalog = useQuery({ queryKey: ['print-administration-catalog'], queryFn: api.printing.administrationCatalog })
  const drafts = useQuery({ queryKey: ['print-template-drafts'], queryFn: api.printing.templateDrafts })
  const templates = useQuery({ queryKey: ['published-print-templates'], queryFn: api.printing.templates })
  const [selection, setSelection] = useState<TemplateSelection | null>(null)
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
  const [workspace, setWorkspace] = useState<'BUSINESS' | 'TEMPLATES' | 'DEVICES'>('TEMPLATES')

  const selected = selection?.kind === 'DRAFT' ? drafts.data?.find((item) => item.id === selection.id) ?? null : null
  const selectedPublished = selection?.kind === 'PUBLISHED'
    ? templates.data?.find((item) => item.id === selection.id) ?? null : null
  const editable = selected?.status === 'DRAFT' || selected?.status === 'REJECTED'
  const definition = catalog.data?.documentDefinitions.find((item) => item.id === definitionId)
  const media = catalog.data?.mediaProfiles.find((item) => item.id === mediaId)
  const availableFields = FIELD_PRESETS[definition?.documentType ?? selectedPublished?.documentType ?? ''] ?? []

  useEffect(() => {
    if (selection) return
    if (drafts.data?.length) setSelection({ kind: 'DRAFT', id: drafts.data[0].id })
    else if (templates.data?.length) setSelection({ kind: 'PUBLISHED', id: templates.data[0].id })
  }, [drafts.data, selection, templates.data])

  useEffect(() => {
    if (!selected) return
    try {
      const parsed = JSON.parse(selected.configJson) as LayoutConfig
      setConfig(parsed); setRawJson(JSON.stringify(parsed, null, 2))
    } catch { setConfig({}); setRawJson(selected.configJson) }
    setName(selected.templateName); setDefinitionId(selected.documentDefinition.id)
    setMediaId(selected.mediaProfile.id); setSelectedElement(null); setDirty(false)
  }, [selected?.id, selected?.revision])

  useEffect(() => {
    if (!selectedPublished) return
    setSelectedElement(null); setDirty(false); setPreviewUrl('')
  }, [selectedPublished?.id])

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  const refresh = async (value?: PrintTemplateDraft) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['print-template-drafts'] }),
      queryClient.invalidateQueries({ queryKey: ['published-print-templates'] }),
    ])
    if (value) setSelection({ kind: 'DRAFT', id: value.id })
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
      let blob: Blob
      if (selectedPublished) blob = await api.printing.previewPublishedTemplate(selectedPublished.id, SAMPLE_DATA)
      else {
        const draft = dirty && editable ? await save() : selected
        if (!draft) return
        blob = await api.printing.previewTemplateDraft(draft.id, SAMPLE_DATA)
      }
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(URL.createObjectURL(blob)); setOperationError(''); setFeedback('PDF 预览已按正式渲染链生成')
    } catch (error) { setOperationError(errorMessage(error)) }
  }
  const previewPublished = async (item: PublishedPrintTemplate) => {
    setSelection({ kind: 'PUBLISHED', id: item.id })
    try {
      const blob = await api.printing.previewPublishedTemplate(item.id, SAMPLE_DATA)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(URL.createObjectURL(blob)); setOperationError(''); setFeedback('正在预览已发布的正式版本')
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
  const moveElement = (index: number, xMm: number, yMm: number) => {
    const elements = [...(config.elements ?? [])]
    elements[index] = { ...elements[index], xMm, yMm }
    applyConfig({ ...config, elements })
  }
  const removeElement = () => {
    if (selectedElement == null) return
    const elements = (config.elements ?? []).filter((_, index) => index !== selectedElement)
    applyConfig({ ...config, elements }); setSelectedElement(null)
  }
  const addElement = (type: 'text' | 'barcode') => {
    const elements = [...(config.elements ?? []), type === 'text'
      ? { type, xMm: 3, yMm: 3, widthMm: 35, heightMm: 7, text: '新文字', fontSize: 9 }
      : { type, xMm: 3, yMm: 35, widthMm: 28, heightMm: 12, path: 'barcode', showText: true }]
    applyConfig({ ...config, elements }); setSelectedElement(elements.length - 1)
  }
  const addPresetField = (field: PrintFieldPreset) => {
    if (definition?.layoutMode === 'FLOW') {
      const blocks = [...(config.blocks ?? [])]
      const block = flowBlockForField(field)
      const signatureIndex = blocks.findIndex((item) => item.type === 'signature')
      const insertAt = signatureIndex < 0 ? blocks.length : signatureIndex
      blocks.splice(insertAt, 0, block); applyConfig({ ...config, blocks }); setSelectedElement(insertAt)
      return
    }
    const elements = [...(config.elements ?? [])]
    const pageWidth = Number(config.paper?.widthMm ?? media?.widthMm ?? 80)
    const pageHeight = Number(config.paper?.heightMm ?? media?.heightMm ?? 55)
    const widthMm = Math.min(field.widthMm ?? Math.max(24, pageWidth - 6), pageWidth - 4)
    const heightMm = field.heightMm ?? (field.type === 'barcode' ? 12 : 7)
    const row = Math.max(0, elements.length - 1)
    const xMm = 2
    const yMm = Math.min(Math.max(2, 10 + (row % 6) * 7), Math.max(0, pageHeight - heightMm - 2))
    const element = field.type === 'barcode'
      ? { type: 'barcode', xMm, yMm, widthMm, heightMm, path: field.key, showText: true }
      : { type: 'text', xMm, yMm, widthMm, heightMm, template: `${field.label}：{{${field.key}}}`, fontSize: 9, align: 'LEFT' }
    elements.push(element); applyConfig({ ...config, elements }); setSelectedElement(elements.length - 1)
  }
  const updateBlock = (key: string, value: string | number | boolean) => {
    if (selectedElement == null) return
    const blocks = [...(config.blocks ?? [])]
    blocks[selectedElement] = { ...blocks[selectedElement], [key]: value }
    applyConfig({ ...config, blocks })
  }
  const removeBlock = () => {
    if (selectedElement == null) return
    const blocks = (config.blocks ?? []).filter((_, index) => index !== selectedElement)
    applyConfig({ ...config, blocks }); setSelectedElement(null)
  }
  const moveBlock = (direction: -1 | 1) => {
    if (selectedElement == null) return
    const blocks = [...(config.blocks ?? [])]
    const target = selectedElement + direction
    if (target < 0 || target >= blocks.length) return
    ;[blocks[selectedElement], blocks[target]] = [blocks[target], blocks[selectedElement]]
    applyConfig({ ...config, blocks }); setSelectedElement(target)
  }

  const selectedCanvasElement = selectedElement == null ? null : config.elements?.[selectedElement]
  const selectedFlowBlock = selectedElement == null ? null : config.blocks?.[selectedElement]
  const categoryGroups = useMemo(() => groupDrafts(drafts.data ?? []), [drafts.data])
  const workspaceTabs = <Tabs value={workspace} onChange={setWorkspace} label="打印管理分类" variant="workspace"
    className="print-management-tabs" items={[
      { value: 'BUSINESS', label: '业务映射' },
      { value: 'TEMPLATES', label: '模板设计' },
      { value: 'DEVICES', label: '设备与路由' },
    ]} />

  if (catalog.isLoading || drafts.isLoading || templates.isLoading) return <LoadingState label="正在加载打印模板工作台…" />

  if (workspace === 'BUSINESS') return <main className="print-template-page">
    <PageHeader compact eyebrow="系统配置 · 标准打印" title="打印业务映射" actions={workspaceTabs} />
    <PrintBusinessMapping api={api} />
  </main>

  if (workspace === 'DEVICES' && catalog.data) return <main className="print-template-page">
    <PageHeader compact eyebrow="系统配置 · 受控打印" title="打印设备与路由" actions={workspaceTabs} />
    <PrintDeviceManagement api={api} catalog={catalog.data} />
  </main>

  return <main className="print-template-page">
    <PageHeader compact eyebrow="系统配置 · 受控打印" title="打印模板管理" actions={<div className="print-template-actions">
      {workspaceTabs}
      <Button size="sm" variant="secondary" onClick={() => void createDraft.mutate()} busy={createDraft.isPending}><Icon name="add" /> 新建草稿</Button>
      <Button size="sm" variant="secondary" onClick={() => void handlePreview()} disabled={!selected && !selectedPublished}><Icon name="eye" /> PDF 预览</Button>
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
              className={`print-template-row ${selection?.kind === 'DRAFT' && item.id === selection.id ? 'is-active' : ''}`}
              onClick={() => { setSelection({ kind: 'DRAFT', id: item.id }); setPreviewUrl('') }}>
              <span className="print-template-row__main"><strong>{item.templateName}</strong><small>{item.templateCode}</small></span>
              <StatusBadge tone={STATUS_META[item.status][1]}>{STATUS_META[item.status][0]}</StatusBadge>
            </button>)}
          </section>)}
          {!drafts.data?.length && <EmptyState icon="print" title="暂无草稿" copy="从新建草稿开始制作医院打印模板" />}
          {!!templates.data?.length && <section className="print-published-list"><h2>已发布模板</h2>
            {templates.data.map((item) => <div className={`print-published-row ${selection?.kind === 'PUBLISHED' && selection.id === item.id ? 'is-active' : ''}`} key={item.id}>
              <button type="button" className="print-published-row__main" aria-label={`预览已发布模板 ${item.templateName}`}
                onClick={() => void previewPublished(item)}>
                <span><strong>{item.templateName}</strong><small>{item.scope === 'PLATFORM' ? '平台' : '本院'} · V{item.currentVersion}</small></span>
              </button>
              <div className="print-published-row__actions">
                <Tooltip content="预览发布版本"><button type="button" aria-label={`预览 ${item.templateName}`}
                  onClick={() => void previewPublished(item)}><Icon name="eye" /></button></Tooltip>
                <Tooltip content="复制为草稿"><button type="button" aria-label={`复制 ${item.templateName} 为草稿`} onClick={() => clone.mutate(item.id)}><Icon name="copy" /></button></Tooltip>
              </div>
            </div>)}
          </section>}
        </div>
      </aside>

      <section className="print-template-designer" aria-label="模板设计区">
        <div className="print-pane-heading"><div><strong>{selected?.templateName ?? selectedPublished?.templateName ?? '设计画布'}</strong><span>{selectedPublished
          ? `${selectedPublished.documentType} · 发布版本 V${selectedPublished.currentVersion}`
          : media ? `${media.mediaName} · ${media.dpi} DPI` : '未选择介质'}</span></div>
          {selected ? <StatusBadge tone={STATUS_META[selected.status][1]}>{STATUS_META[selected.status][0]}</StatusBadge>
            : selectedPublished ? <StatusBadge tone="success">已发布</StatusBadge> : null}
        </div>
        {selected ? <>
          {definition?.layoutMode === 'CANVAS' && <div className="print-designer-toolbar">
            <Button size="sm" variant="text" disabled={!editable} onClick={() => addElement('text')}><Icon name="add" /> 文字</Button>
            <Button size="sm" variant="text" disabled={!editable} onClick={() => addElement('barcode')}><Icon name="add" /> 条码</Button>
            <span><Icon name="drag" /> 拖动画布元素调整位置 · 单位 mm</span>
          </div>}
          {definition && <FieldLibrary fields={availableFields} disabled={!editable} onAdd={addPresetField} />}
          <div className="print-canvas-stage">
            {previewUrl ? <iframe className="print-pdf-preview" src={previewUrl} title="打印模板 PDF 预览" />
              : definition?.layoutMode === 'CANVAS'
                ? <CanvasPreview config={config} media={media} selected={selectedElement} editable={editable}
                    onSelect={setSelectedElement} onMove={moveElement} />
                : <FlowPreview config={config} selected={selectedElement} editable={editable} onSelect={setSelectedElement} />}
          </div>
          {previewUrl && <button className="print-return-designer" type="button" onClick={() => setPreviewUrl('')}><Icon name="arrow-left" /> 返回设计画布</button>}
        </> : selectedPublished ? <div className="print-published-preview-empty">
          {previewUrl ? <iframe className="print-pdf-preview" src={previewUrl} title="已发布打印模板 PDF 预览" /> : <>
            <Icon name="eye" /><strong>预览发布版本 V{selectedPublished.currentVersion}</strong>
            <span>预览使用代表性业务数据，并通过正式 PDF 渲染链生成。</span>
            <Button size="sm" onClick={() => void handlePreview()}><Icon name="eye" /> 打开预览</Button>
          </>}
        </div> : <EmptyState icon="print" title="选择一份模板" copy="模板内容与纸张预览将在此处显示" />}
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
          {selectedCanvasElement && <ElementProperties element={selectedCanvasElement} fields={availableFields} disabled={!editable}
            onChange={updateElement} onDelete={removeElement} />}
          {selectedFlowBlock && <FlowBlockProperties block={selectedFlowBlock} index={selectedElement ?? 0}
            count={config.blocks?.length ?? 0} fields={availableFields} disabled={!editable}
            onChange={updateBlock} onDelete={removeBlock} onMove={moveBlock} />}
          <details className="print-advanced-config"><summary>高级布局配置</summary>
            <textarea aria-label="高级布局配置 JSON" spellCheck={false} value={rawJson} disabled={!editable}
              onChange={(event) => { setRawJson(event.target.value); setDirty(true); try { setConfig(JSON.parse(event.target.value) as LayoutConfig) } catch { /* Keep editing invalid intermediate JSON. */ } }} />
          </details>
          <div className="print-review-actions">
            {editable && <Button size="sm" variant="secondary" disabled={dirty} onClick={() => transition.mutate({ action: 'submit' })}>提交审核</Button>}
            {selected.status === 'IN_REVIEW' && <><Button size="sm" variant="secondary" onClick={() => transition.mutate({ action: 'reject' })}>退回</Button>
              <Button size="sm" onClick={() => transition.mutate({ action: 'publish' })}>发布版本</Button></>}
          </div>
        </div> : selectedPublished ? <div className="print-published-properties">
          <dl><div><dt>模板名称</dt><dd>{selectedPublished.templateName}</dd></div><div><dt>模板编码</dt><dd>{selectedPublished.templateCode}</dd></div>
            <div><dt>单据类型</dt><dd>{selectedPublished.documentType}</dd></div><div><dt>当前版本</dt><dd>V{selectedPublished.currentVersion}</dd></div>
            <div><dt>适用范围</dt><dd>{selectedPublished.scope === 'PLATFORM' ? '平台标准' : '本院自定义'}</dd></div></dl>
          <Button size="sm" variant="secondary" onClick={() => clone.mutate(selectedPublished.id)} busy={clone.isPending}><Icon name="copy" /> 复制为草稿后调整</Button>
        </div> : <EmptyState icon="settings" title="暂无属性" copy="选择模板后可维护布局与介质" />}
      </aside>
    </div>
  </main>
}

function FieldLibrary({ fields, disabled, onAdd }: { fields: PrintFieldPreset[]; disabled: boolean; onAdd: (field: PrintFieldPreset) => void }) {
  const groups = fields.reduce<Record<string, PrintFieldPreset[]>>((result, field) => {
    (result[field.group] ??= []).push(field); return result
  }, {})
  return <div className="print-field-library">
    <div className="print-field-library__heading"><strong>常用数据项</strong><span>点击加入模板</span></div>
    <div className="print-field-library__groups">{Object.entries(groups).map(([group, values]) => <div key={group}>
      <span>{group}</span><div>{values.map((field) => <Tooltip key={field.key} content={`${field.label} · 示例：${field.sample}`} placement="bottom">
        <button type="button" disabled={disabled} onClick={() => onAdd(field)}><Icon name="add" />{field.label}</button>
      </Tooltip>)}</div>
    </div>)}</div>
  </div>
}

function CanvasPreview({ config, media, selected, editable, onSelect, onMove }: {
  config: LayoutConfig
  media?: PrintMediaProfile
  selected: number | null
  editable: boolean
  onSelect: (index: number) => void
  onMove: (index: number, xMm: number, yMm: number) => void
}) {
  const width = Number(config.paper?.widthMm ?? media?.widthMm ?? 80)
  const height = Number(config.paper?.heightMm ?? media?.heightMm ?? 55)
  const scale = Math.min(6, 520 / width, 620 / height)
  const drag = useRef<{ index: number; startX: number; startY: number; xMm: number; yMm: number } | null>(null)
  const pointerDown = (event: ReactPointerEvent<HTMLButtonElement>, index: number, element: Record<string, unknown>) => {
    onSelect(index)
    if (!editable) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { index, startX: event.clientX, startY: event.clientY,
      xMm: Number(element.xMm ?? 0), yMm: Number(element.yMm ?? 0) }
  }
  const pointerMove = (event: ReactPointerEvent<HTMLButtonElement>, element: Record<string, unknown>) => {
    const active = drag.current
    if (!active || active.index !== Number(event.currentTarget.dataset.index)) return
    event.preventDefault()
    const elementWidth = Number(element.widthMm ?? 20)
    const elementHeight = Number(element.heightMm ?? 6)
    const snap = (value: number) => Math.round(value * 2) / 2
    const xMm = Math.max(0, Math.min(width - elementWidth, snap(active.xMm + (event.clientX - active.startX) / scale)))
    const yMm = Math.max(0, Math.min(height - elementHeight, snap(active.yMm + (event.clientY - active.startY) / scale)))
    onMove(active.index, xMm, yMm)
  }
  const pointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    drag.current = null
  }
  return <div className="print-canvas" style={{ width: width * scale, height: height * scale }}>
    {(config.elements ?? []).map((element, index) => {
      const type = String(element.type ?? 'text')
      return <button type="button" key={index} data-index={index}
        className={`print-canvas-element is-${type} ${selected === index ? 'is-selected' : ''} ${element.border ? 'has-format-border' : ''}`}
        onPointerDown={(event) => pointerDown(event, index, element)} onPointerMove={(event) => pointerMove(event, element)}
        onPointerUp={pointerUp} onPointerCancel={pointerUp}
        style={{ left: Number(element.xMm ?? 0) * scale, top: Number(element.yMm ?? 0) * scale,
          width: Number(element.widthMm ?? 20) * scale, height: Number(element.heightMm ?? 6) * scale,
          fontSize: Number(element.fontSize ?? 9) * .95, fontWeight: element.bold ? 700 : 400,
          textAlign: String(element.align ?? 'LEFT').toLowerCase() as 'left' | 'center' | 'right' }}>
        {type === 'barcode' ? <span className="print-barcode-demo" /> : previewText(element)}
      </button>
    })}
  </div>
}

function FlowPreview({ config, selected, editable, onSelect }: {
  config: LayoutConfig
  selected: number | null
  editable: boolean
  onSelect: (index: number) => void
}) {
  return <article className="print-flow-sheet"><h1>{config.title || '临床单据'}</h1>
    {(config.blocks ?? []).map((block, index) => <section key={index}
      className={`print-flow-block is-${String(block.type)} ${selected === index ? 'is-selected' : ''} ${editable ? 'is-editable' : ''}`}
      role={editable ? 'button' : undefined} tabIndex={editable ? 0 : undefined} onClick={() => editable && onSelect(index)}
      onKeyDown={(event) => { if (editable && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelect(index) } }}>
      {Boolean(block.title) && <h2>{String(block.title)}</h2>}
      {block.type === 'fieldGrid' && <div className="print-flow-fields">{(block.fields as Array<Record<string, unknown>> ?? []).map((field, fieldIndex) => <div key={fieldIndex}><span>{String(field.label ?? '字段')}</span><strong>{sampleValue(String(field.path ?? ''))}</strong></div>)}</div>}
      {block.type === 'table' && <table><thead><tr>{(block.columns as Array<Record<string, unknown>> ?? []).map((column, columnIndex) => <th key={columnIndex}>{String(column.label ?? '')}</th>)}</tr></thead><tbody><tr>{(block.columns as Array<Record<string, unknown>> ?? []).map((column, columnIndex) => <td key={columnIndex}>{sampleTableValue(String(block.path ?? ''), String(column.path ?? ''))}</td>)}</tr></tbody></table>}
      {block.type === 'section' && <p>{sampleValue(String(block.path ?? '')) || '示例内容'}</p>}
      {block.type === 'signature' && <div className="print-flow-signature"><span>{String(block.leftLabel ?? '签名')}：________</span><span>{String(block.rightLabel ?? '核对')}：________</span></div>}
    </section>)}
  </article>
}

function FlowBlockProperties({ block, index, count, fields, disabled, onChange, onDelete, onMove }: {
  block: Record<string, unknown>
  index: number
  count: number
  fields: PrintFieldPreset[]
  disabled: boolean
  onChange: (key: string, value: string | number | boolean) => void
  onDelete: () => void
  onMove: (direction: -1 | 1) => void
}) {
  const type = String(block.type ?? 'section')
  return <fieldset className="print-element-properties"><legend>内容块 · {flowBlockTypeLabel(type)}</legend>
    {['section', 'text'].includes(type) && <>
      <FormField label="区块标题"><input value={String(block.title ?? '')} disabled={disabled}
        onChange={(event) => onChange('title', event.target.value)} /></FormField>
      <FormField label="绑定数据项"><Select value={String(block.path ?? '')} disabled={disabled} clearable={false} searchable={false}
        options={fields.map((field) => ({ value: field.key, label: field.label, secondaryText: field.key }))}
        onChange={(value) => onChange('path', value)} /></FormField>
    </>}
    <div className="print-block-order-actions">
      <Button size="sm" variant="secondary" disabled={disabled || index === 0} onClick={() => onMove(-1)}><Icon name="chevron-up" /> 上移</Button>
      <Button size="sm" variant="secondary" disabled={disabled || index >= count - 1} onClick={() => onMove(1)}><Icon name="chevron-down" /> 下移</Button>
    </div>
    <Button size="sm" variant="danger" disabled={disabled} className="print-delete-element" onClick={onDelete}><Icon name="close" /> 删除内容块</Button>
  </fieldset>
}

function ElementProperties({ element, fields, disabled, onChange, onDelete }: {
  element: Record<string, unknown>
  fields: PrintFieldPreset[]
  disabled: boolean
  onChange: (key: string, value: string | number | boolean) => void
  onDelete: () => void
}) {
  const type = String(element.type ?? 'text')
  const boundField = type === 'barcode' ? String(element.path ?? '') : templateField(String(element.template ?? ''))
  return <fieldset className="print-element-properties"><legend>{element.type === 'barcode' ? '条码元素' : '文字元素'}</legend>
    <div className="print-coordinate-grid">{(['xMm', 'yMm', 'widthMm', 'heightMm'] as const).map((key) => <FormField key={key} label={({ xMm: 'X', yMm: 'Y', widthMm: '宽', heightMm: '高' })[key]}><input type="number" min="0" step="0.5" value={Number(element[key] ?? 0)} disabled={disabled} onChange={(event) => onChange(key, Number(event.target.value))} /></FormField>)}</div>
    {element.type === 'text' ? <>
      <FormField label="绑定数据项"><Select value={boundField} disabled={disabled} clearable searchable={false} placeholder="纯文本"
        options={fields.filter((field) => field.type !== 'barcode').map((field) => ({ value: field.key, label: field.label, secondaryText: field.key }))}
        onChange={(value) => {
          const field = fields.find((item) => item.key === value)
          if (field) onChange('template', `${field.label}：{{${field.key}}}`)
        }} /></FormField>
      <FormField label="显示文本"><textarea value={String(element.template ?? element.text ?? '')} disabled={disabled} onChange={(event) => onChange(element.template != null ? 'template' : 'text', event.target.value)} /></FormField>
      <div className="print-coordinate-grid"><FormField label="字号"><input type="number" min="5" max="72" value={Number(element.fontSize ?? 9)} disabled={disabled} onChange={(event) => onChange('fontSize', Number(event.target.value))} /></FormField>
        <FormField label="对齐"><Select value={String(element.align ?? 'LEFT')} disabled={disabled} clearable={false} searchable={false}
          options={[{ value: 'LEFT', label: '左对齐' }, { value: 'CENTER', label: '居中' }, { value: 'RIGHT', label: '右对齐' }]}
          onChange={(value) => onChange('align', value)} /></FormField></div>
      <div className="print-format-switches"><Switch size="sm" label="粗体" checked={Boolean(element.bold)} disabled={disabled} onChange={(value) => onChange('bold', value)} />
        <Switch size="sm" label="边框" checked={Boolean(element.border)} disabled={disabled} onChange={(value) => onChange('border', value)} /></div>
    </> : <><FormField label="条码数据字段"><Select value={String(element.path ?? 'barcode')} disabled={disabled} clearable={false} searchable={false}
      options={fields.map((field) => ({ value: field.key, label: field.label, secondaryText: field.key }))}
      onChange={(value) => onChange('path', value)} /></FormField>
      <div className="print-format-switches"><Switch size="sm" label="显示码值" checked={element.showText !== false} disabled={disabled} onChange={(value) => onChange('showText', value)} /></div></>}
    <Button size="sm" variant="danger" disabled={disabled} className="print-delete-element" onClick={onDelete}><Icon name="close" /> 删除元素</Button>
  </fieldset>
}

function defaultLayout(definition: PrintDocumentDefinition, media: PrintMediaProfile): Pick<SavePrintDraft, 'layoutSchema' | 'configJson'> {
  const config = defaultConfig(definition, media)
  return { layoutSchema: definition.layoutMode === 'CANVAS' ? 'RHN_PRINT_CANVAS_V1' : 'RHN_PRINT_FLOW_V1', configJson: JSON.stringify(config) }
}
function defaultConfig(definition: PrintDocumentDefinition, media: PrintMediaProfile): LayoutConfig {
  if (definition.layoutMode === 'CANVAS') return defaultCanvasConfig(definition, media)
  const fields = FIELD_PRESETS[definition.documentType] ?? []
  const patientFields = fields.filter((field) => field.group === '患者信息').slice(0, 6)
  const businessFields = fields.filter((field) => field.group === '业务内容').filter((field) => !['medications', 'patrolRows'].includes(field.key))
  const blocks: Array<Record<string, unknown>> = [
    { type: 'fieldGrid', columns: 2, fields: patientFields.map((field) => ({ label: field.label, path: field.key })) },
  ]
  if (definition.documentType === 'OUTPATIENT_PRESCRIPTION') blocks.push({ type: 'table', path: 'medications', columns: [
    { label: '药品名称', path: 'medicationName', width: 2 }, { label: '规格', path: 'specification', width: 1.2 },
    { label: '数量', path: 'quantity', width: .7 }, { label: '单次剂量', path: 'doseValue', width: .8 },
    { label: '途径', path: 'routeCode', width: .8 }, { label: '频次', path: 'frequencyCode', width: .8 },
  ] })
  businessFields.slice(0, 7).forEach((field) => blocks.push({ type: 'section', title: field.label, path: field.key }))
  const traceFields = fields.filter((field) => field.group === '执行与追溯')
  if (traceFields.length) blocks.push({ type: 'signature', leftLabel: traceFields[0].label, leftPath: traceFields[0].key,
    rightLabel: traceFields[1]?.label ?? '核对', rightPath: traceFields[1]?.key ?? '' })
  return { paper: paperConfig(media, false), title: definition.documentName, blocks, footer: true }
}
function defaultCanvasConfig(definition: PrintDocumentDefinition, media: PrintMediaProfile): LayoutConfig {
  const width = media.widthMm
  const height = media.heightMm ?? 55
  const base = { paper: paperConfig(media, true) }
  if (definition.documentType === 'INFUSION_LABEL') return { ...base, elements: [
    { type: 'text', xMm: 2, yMm: 2, widthMm: width - 4, heightMm: 6, text: definition.documentName, fontSize: 12, bold: true, align: 'CENTER' },
    { type: 'text', xMm: 2, yMm: 9, widthMm: width - 28, heightMm: 6, template: '{{patientName}}  {{bedNo}}', fontSize: 10, bold: true },
    { type: 'text', xMm: width - 25, yMm: 9, widthMm: 23, heightMm: 6, template: '{{scheduledAtText}}', fontSize: 8, align: 'RIGHT' },
    { type: 'text', xMm: 2, yMm: 16, widthMm: width - 4, heightMm: 16, template: '{{infusionGroupText}}', fontSize: 9, border: true },
    { type: 'text', xMm: 2, yMm: 34, widthMm: width - 31, heightMm: 6, template: '{{routeName}}  {{rateText}}', fontSize: 8 },
    { type: 'text', xMm: 2, yMm: 41, widthMm: width - 31, heightMm: 5, template: '{{safetyFlagsText}}', fontSize: 8, bold: true },
    { type: 'barcode', xMm: width - 28, yMm: Math.min(35, height - 14), widthMm: 26, heightMm: 12, path: 'barcode', showText: true },
  ] }
  if (definition.documentType === 'ORAL_MEDICATION_CARD') return { ...base, elements: [
    { type: 'text', xMm: 2, yMm: 2, widthMm: width - 4, heightMm: 6, text: definition.documentName, fontSize: 12, bold: true, align: 'CENTER' },
    { type: 'text', xMm: 2, yMm: 9, widthMm: width - 28, heightMm: 6, template: '{{patientName}}  {{gender}}  {{ageText}}', fontSize: 9, bold: true },
    { type: 'text', xMm: width - 25, yMm: 9, widthMm: 23, heightMm: 6, template: '床号 {{bedNo}}', fontSize: 9, align: 'RIGHT' },
    { type: 'text', xMm: 2, yMm: 16, widthMm: width - 4, heightMm: 12, template: '{{medicationName}}  {{specification}}  {{doseText}}', fontSize: 10, bold: true, border: true },
    { type: 'text', xMm: 2, yMm: 30, widthMm: width - 4, heightMm: 6, template: '{{routeName}}  {{frequencyName}}  {{scheduledAtText}}', fontSize: 9 },
    { type: 'text', xMm: 2, yMm: 38, widthMm: width - 33, heightMm: 6, template: '{{instruction}}', fontSize: 8 },
    { type: 'barcode', xMm: width - 30, yMm: Math.min(38, height - 14), widthMm: 28, heightMm: 12, path: 'barcode', showText: true },
  ] }
  const fields = (FIELD_PRESETS[definition.documentType] ?? PATIENT_FIELDS).filter((field) => field.type !== 'barcode').slice(0, 5)
  return { ...base, elements: [
    { type: 'text', xMm: 2, yMm: 2, widthMm: width - 4, heightMm: 7, text: definition.documentName, fontSize: 13, bold: true, align: 'CENTER' },
    ...fields.map((field, index) => ({ type: 'text', xMm: 2, yMm: 11 + index * 7,
      widthMm: width - 4, heightMm: 6, template: `${field.label}：{{${field.key}}}`, fontSize: 9 })),
  ] }
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
function flowBlockForField(field: PrintFieldPreset): Record<string, unknown> {
  if (field.key === 'medications') return { type: 'table', path: 'medications', columns: [
    { label: '药品名称', path: 'medicationName', width: 2 }, { label: '规格', path: 'specification', width: 1.2 },
    { label: '数量', path: 'quantity', width: .7 }, { label: '剂量', path: 'doseValue', width: .8 },
    { label: '途径', path: 'routeCode', width: .8 }, { label: '频次', path: 'frequencyCode', width: .8 },
  ] }
  if (field.key === 'patrolRows') return { type: 'table', path: 'patrolRows', columns: [
    { label: '巡视时间', path: 'timeText', width: 1 }, { label: '滴速', path: 'rateText', width: .8 },
    { label: '患者/穿刺部位情况', path: 'observation', width: 2.5 }, { label: '执行人', path: 'operatorName', width: 1 },
  ] }
  return { type: 'section', title: field.label, path: field.key }
}
function flowBlockTypeLabel(type: string) { return ({ fieldGrid: '基本信息', section: '段落', text: '文本', table: '明细表', signature: '签名' } as Record<string, string>)[type] ?? type }
function templateField(value: string) { return value.match(/\{\{([A-Za-z0-9_.-]+)}}/)?.[1] ?? '' }
function sampleValue(key: string) {
  const value = key.split('.').reduce<unknown>((current, part) => current && typeof current === 'object'
    ? (current as Record<string, unknown>)[part] : undefined, SAMPLE_DATA)
  if (Array.isArray(value)) return value.map((item) => typeof item === 'object'
    ? Object.values(item as Record<string, unknown>).slice(0, 3).join(' ') : String(item)).join('；')
  return value == null ? '' : String(value)
}
function sampleTableValue(tablePath: string, columnPath: string) {
  const table = tablePath.split('.').reduce<unknown>((current, part) => current && typeof current === 'object'
    ? (current as Record<string, unknown>)[part] : undefined, SAMPLE_DATA)
  const first = Array.isArray(table) ? table[0] : null
  return first && typeof first === 'object' ? String((first as Record<string, unknown>)[columnPath] ?? '') : sampleValue(columnPath)
}
function groupDrafts(values: PrintTemplateDraft[]) {
  return values.reduce<Record<string, PrintTemplateDraft[]>>((groups, item) => {
    const key = item.documentDefinition.category; (groups[key] ??= []).push(item); return groups
  }, {})
}
function categoryLabel(value: string) { return ({ CLINICAL_DOCUMENT: '临床文书', PRESCRIPTION: '处方', APPLICATION: '申请单', CARD: '执行卡', LABEL: '标签', LIST: '清单' } as Record<string, string>)[value] ?? value }
