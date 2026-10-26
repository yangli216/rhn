import React, { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import type { RhnApi } from '../../../shared/rhnApi'
import type { ClinicalAiWikiDocResult } from '../../../shared/api/clinicalAiApi'
import { LoadingState, EmptyState, Icon, Tabs } from '../../../shared/ui'
import { ClinicalKnowledgePanel } from './ClinicalKnowledgePanel'
import { normalizeKnowledgeDocumentMarkdown } from './knowledgeDocumentMarkdown'
import './clinical-evidence.css'

export interface MedicalInsertTarget {
  name?: string
  id?: string
  type?: 'medication' | 'guideline' | 'protocol' | 'laboratory' | 'examination' | string
  icd10?: string
}

export interface MedicalInsertViewerModalProps {
  isOpen: boolean
  onClose: () => void
  target: MedicalInsertTarget | null
  api: RhnApi
}

const SAFE_KNOWLEDGE_TAGS = new Set([
  'H1', 'H2', 'H3', 'H4', 'P', 'UL', 'OL', 'LI', 'STRONG', 'EM', 'BLOCKQUOTE',
  'HR', 'BR', 'PRE', 'CODE', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD',
])

function formatBr(node: React.ReactNode): React.ReactNode {
  if (typeof node === 'string') {
    if (!node.includes('<br')) return node
    const parts = node.split(/<br\s*\/?>/gi)
    return parts.flatMap((part, idx) => (idx === 0 ? [part] : [<br key={idx} />, part]))
  }
  if (Array.isArray(node)) {
    return node.map((child, idx) => <React.Fragment key={idx}>{formatBr(child)}</React.Fragment>)
  }
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode }
    if (props && props.children) {
      return React.cloneElement(node, {
        children: formatBr(props.children),
      } as any)
    }
  }
  return node
}

function extractCalloutMarker(node: React.ReactNode): { type: string; cleanNode: React.ReactNode | null } | null {
  if (typeof node === 'string') {
    const m = node.match(/^\[!(NOTE|WARNING|CAUTION|IMPORTANT|TIP|INFO)\]\s*(.*)$/i)
    if (m) {
      return { type: m[1].toLowerCase(), cleanNode: m[2] ? m[2] : null }
    }
  } else if (Array.isArray(node) && node.length > 0) {
    const firstRes = extractCalloutMarker(node[0])
    if (firstRes) {
      const rest = node.slice(1)
      const cleanList = firstRes.cleanNode ? [firstRes.cleanNode, ...rest] : rest
      return { type: firstRes.type, cleanNode: cleanList.length > 0 ? cleanList : null }
    }
  } else if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode }
    if (props && props.children) {
      const childRes = extractCalloutMarker(props.children)
      if (childRes) {
        if (!childRes.cleanNode) {
          return { type: childRes.type, cleanNode: null }
        }
        return {
          type: childRes.type,
          cleanNode: React.cloneElement(node, { children: childRes.cleanNode } as any),
        }
      }
    }
  }
  return null
}

function parseCallout(children: React.ReactNode): { type: string; cleanChildren: React.ReactNode } | null {
  if (!children) return null
  const rawList = Array.isArray(children) ? children : [children]
  // 过滤开头和结尾的空换行字符
  const list = rawList.filter((item) => {
    if (typeof item === 'string' && !item.trim()) return false
    return true
  })
  if (list.length === 0) return null

  const marker = extractCalloutMarker(list[0])
  if (marker) {
    const rest = list.slice(1)
    const cleanList = marker.cleanNode ? [marker.cleanNode, ...rest] : rest
    return { type: marker.type, cleanChildren: cleanList }
  }
  return null
}

function safeKnowledgeHtml(value?: string) {
  if (!value || typeof DOMParser === 'undefined') return ''
  const parsed = new DOMParser().parseFromString(value, 'text/html')
  parsed.body.querySelectorAll('*').forEach((element) => {
    if (!SAFE_KNOWLEDGE_TAGS.has(element.tagName)) {
      if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH'].includes(element.tagName)) {
        element.remove()
      } else {
        element.replaceWith(...Array.from(element.childNodes))
      }
      return
    }
    Array.from(element.attributes).forEach((attribute) => element.removeAttribute(attribute.name))
  })
  return parsed.body.innerHTML
}

function readableValue(value: unknown) {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value) && value.every((item) => ['string', 'number', 'boolean'].includes(typeof item))) {
    return value.map(String).join('；')
  }
  return ''
}

const populationLabels: Record<string, string> = {
  pregnancy: '妊娠期',
  lactation: '哺乳期',
  pediatric: '儿童',
  elderly: '老年人',
  renal_impairment: '肾功能不全',
  hepatic_impairment: '肝功能不全',
}

function isInternalCode(value: string) {
  return /^[A-Z][A-Z0-9_-]+$/.test(value.trim())
}

export function MedicalInsertViewerModal({
  isOpen,
  onClose,
  target,
  api,
}: MedicalInsertViewerModalProps) {
  const [loading, setLoading] = useState(false)
  const [doc, setDoc] = useState<ClinicalAiWikiDocResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedFormName, setSelectedFormName] = useState<string | null>(null)
  const name = target?.name
  const id = target?.id
  const type = target?.type

  // Sync active dosage form whenever document or target changes
  useEffect(() => {
    if (doc?.dosageForms && doc.dosageForms.length > 0) {
      if (doc.activeForm && doc.dosageForms.some((f) => f.formName === doc.activeForm)) {
        setSelectedFormName(doc.activeForm)
      } else {
        const targetText = (target?.name || '').toLowerCase()
        const matched = doc.dosageForms.find((f) => {
          const fn = f.formName.toLowerCase()
          const fnShort = fn.replace(/剂$/, '')
          return targetText.includes(fn) || (fnShort.length > 0 && targetText.includes(fnShort))
        })
        setSelectedFormName(matched ? matched.formName : doc.dosageForms[0].formName)
      }
    } else {
      setSelectedFormName(null)
    }
  }, [doc, target?.name])

  // Callers recreate target objects during workstation updates; only article changes should reload.
  useEffect(() => {
    if (!isOpen || (!name && !id)) {
      setDoc(null)
      setError(null)
      setLoading(false)
      return
    }

    let active = true
    setLoading(true)
    setDoc(null)
    setError(null)

    if (!api?.clinicalAi?.getWikiDoc) {
      setLoading(false)
      setError('未配置临床知识库接口')
      return
    }

    const query: { name?: string; id?: string; type?: string; icd10?: string } = {
      name,
      id,
      type,
    }
    if (target?.icd10) {
      query.icd10 = target.icd10
    }

    api.clinicalAi
      .getWikiDoc(query)
      .then((data) => {
        if (!active) return
        setDoc(data)
        setLoading(false)
      })
      .catch((err: Error) => {
        if (!active) return
        setError(err.message || '加载知识库词条失败')
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [isOpen, name, id, type, target?.icd10, api])

  if (!isOpen) return null

  const isMedication = doc?.type === 'MEDICATION' || target?.type === 'medication'
  const title = doc?.title || target?.name || '医学说明书'
  const dosageForms = doc?.dosageForms || []
  const activeDosageForm = dosageForms.find((f) => f.formName === selectedFormName) || dosageForms[0] || null

  const isCrossDosageMismatch = Boolean(
    isMedication &&
    dosageForms.length > 0 &&
    target?.name &&
    /(注射|滴眼|滴鼻|贴膏|喷雾|气雾|洗剂|栓剂|搽剂)/.test(target.name) &&
    !dosageForms.some((f) => target.name?.includes(f.formName) || target.name?.includes(f.formName.replace(/剂$/, '')))
  )

  const displayTitle = isMedication
    ? (activeDosageForm && doc?.genericName
        ? `药品说明书 · ${doc.genericName}（${activeDosageForm.formName}）`
        : `药品说明书 · ${title}`)
    : target?.type === 'laboratory'
      ? `检验项目说明 · ${title}`
      : target?.type === 'examination'
        ? `检查项目说明 · ${title}`
        : `临床指南 · ${title}`

  const contraindications = (doc?.keyContraindications || []).filter((value) => value && !isInternalCode(value))
  const populations = Object.entries(doc?.specialPopulations || {})
    .map(([name, value]) => ({ name: populationLabels[name] || name, value: readableValue(value) }))
    .filter((item) => item.value)
  const sources = (doc?.sources || []).filter((value) => value && !isInternalCode(value))
  const sanitizedHtml = safeKnowledgeHtml(doc?.html)
  const normalizedMarkdown = normalizeKnowledgeDocumentMarkdown(doc?.markdown, { medication: isMedication })
  const hasMetadata = Boolean(
    doc?.genericName
    || doc?.englishName
    || doc?.tradeNames?.length
    || doc?.atcCode
    || doc?.approvalCategory
    || doc?.formsAndSpecs?.length
    || dosageForms.length > 0
  )

  return (
    <ClinicalKnowledgePanel
      title={displayTitle}
      onClose={onClose}
    >
      {loading && <LoadingState label="正在加载知识库资料…" />}

      {!loading && (error || !doc) && (
        <EmptyState
          icon="clinical"
          title="暂未找到对应资料"
          copy={error || `临床知识库中暂未匹配到“${target?.name || target?.id}”。`}
        />
      )}

      {!loading && doc && (
        <div className="medical-insert-viewer">
          {hasMetadata && <div className="medical-insert-meta-banner">
            {doc.genericName && (
              <div className="medical-insert-meta-item">
                <strong>通用名称:</strong> {doc.genericName}
              </div>
            )}
            {doc.englishName && (
              <div className="medical-insert-meta-item">
                <strong>英文名:</strong> {doc.englishName}
              </div>
            )}
            {doc.tradeNames && doc.tradeNames.length > 0 && (
              <div className="medical-insert-meta-item">
                <strong>常见商品名:</strong> {doc.tradeNames.join('、')}
              </div>
            )}
            {doc.atcCode && (
              <div className="medical-insert-meta-item">
                <strong>ATC 代码:</strong> {doc.atcCode}
              </div>
            )}
            {doc.approvalCategory && (
              <div className="medical-insert-meta-item">
                <strong>准字分类:</strong> {doc.approvalCategory}
              </div>
            )}
            {doc.formsAndSpecs && doc.formsAndSpecs.length > 0 && dosageForms.length === 0 && (
              <div className="medical-insert-meta-item">
                <strong>剂型与规格:</strong> {doc.formsAndSpecs.join('；')}
              </div>
            )}
          </div>}

          {isCrossDosageMismatch && (
            <div className="dosage-form-mismatch-banner" role="status">
              <Icon name="warning" />
              <div>
                <strong>跨剂型参考说明书提示：</strong>
                当前处方开具的药品为「{target?.name}」，而本说明书收录的法定剂型为「
                {dosageForms.map((f) => f.formName).join('、')}
                」。不同剂型的给药途径、吸收动力学及规格用法存在差异，请注意核实。
              </div>
            </div>
          )}

          {dosageForms.length > 0 && (
            <div className="dosage-form-container">
              {dosageForms.length > 1 && (
                <Tabs label="药品剂型切换" value={activeDosageForm?.formName ?? ''} onChange={setSelectedFormName}
                  items={dosageForms.map(form => ({ value: form.formName,
                    label: form.displayName || `${form.formName} (${doc.genericName || ''}${form.formName})` }))} />
              )}

              {activeDosageForm && (
                <div className="dosage-form-active-card">
                  <div className="dosage-form-active-header">
                    <span className="dosage-form-badge">{activeDosageForm.formName}</span>
                    {activeDosageForm.specs && activeDosageForm.specs.length > 0 && (
                      <span className="dosage-form-specs">
                        <strong>法定品规：</strong>
                        {activeDosageForm.specs.join('、')}
                      </span>
                    )}
                  </div>
                  {activeDosageForm.appearance && (
                    <div className="dosage-form-active-row">
                      <strong>性状特征：</strong>
                      <span>{activeDosageForm.appearance}</span>
                    </div>
                  )}
                  {activeDosageForm.administration && (
                    <div className="dosage-form-active-row">
                      <strong>给药与服用指导：</strong>
                      <span>{activeDosageForm.administration}</span>
                    </div>
                  )}
                  {activeDosageForm.specialNotes && (
                    <div className="dosage-form-active-row is-caution">
                      <strong>特别注意：</strong>
                      <span>{activeDosageForm.specialNotes}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {isMedication && (doc.maxDailyDose || doc.standardMaintenanceDose || contraindications.length > 0) && (
            <div className="safety-critical-alert-box" role="alert">
              <div className="safety-critical-alert-title">
                <Icon name="warning" />
                <span>用药警示</span>
              </div>

              <div className="safety-dose-highlight">
                {doc.maxDailyDose && (
                  <div className="dose-card">
                    <span className="dose-card-label">每日最大剂量</span>
                    <span className="dose-card-value">{doc.maxDailyDose}</span>
                  </div>
                )}
                {doc.standardMaintenanceDose && (
                  <div className="dose-card is-maintenance">
                    <span className="dose-card-label">常规推荐剂量</span>
                    <span className="dose-card-value">{doc.standardMaintenanceDose}</span>
                  </div>
                )}
              </div>

              {contraindications.length > 0 && (
                <div>
                  <strong className="contraindications-title">明确禁忌：</strong>
                  <ul className="contraindications-list">
                    {contraindications.map((contra) => (
                      <li key={contra}>{contra}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {populations.length > 0 && (
            <div>
              <h3 className="special-populations-title">特殊人群用药</h3>
              <div className="special-populations-grid">
                {populations.map((item) => (
                  <div key={item.name} className="special-population-card">
                    <span className="special-population-name">{item.name}</span>
                    <span className="special-population-desc">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {normalizedMarkdown ? (
            <div className="medical-insert-prose">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                  blockquote({ children, ...props }) {
                    const callout = parseCallout(children)
                    if (callout) {
                      return (
                        <div
                          className={`medical-insert-callout medical-insert-callout-${callout.type}`}
                          role="alert"
                        >
                          {formatBr(callout.cleanChildren)}
                        </div>
                      )
                    }
                    return <blockquote {...props}>{formatBr(children)}</blockquote>
                  },
                  td({ children, ...props }) {
                    return <td {...props}>{formatBr(children)}</td>
                  },
                  th({ children, ...props }) {
                    return <th {...props}>{formatBr(children)}</th>
                  },
                  p({ children, ...props }) {
                    return <p {...props}>{formatBr(children)}</p>
                  },
                  li({ children, ...props }) {
                    return <li {...props}>{formatBr(children)}</li>
                  },
                }}
              >
                {normalizedMarkdown}
              </ReactMarkdown>
            </div>
          ) : sanitizedHtml ? (
            <div
              className="medical-insert-prose"
              dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
            />
          ) : null}

          {sources.length > 0 && (
            <div className="medical-insert-footer-sources">
              <strong>资料来源：</strong> {sources.join('； ')}
            </div>
          )}
        </div>
      )}
    </ClinicalKnowledgePanel>
  )
}
