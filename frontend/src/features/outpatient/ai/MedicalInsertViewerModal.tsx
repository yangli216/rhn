import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { RhnApi } from '../../../shared/rhnApi'
import type { ClinicalAiWikiDocResult } from '../../../shared/api/clinicalAiApi'
import { LoadingState, EmptyState, Icon } from '../../../shared/ui'
import { ClinicalKnowledgePanel } from './ClinicalKnowledgePanel'
import { normalizeKnowledgeDocumentMarkdown } from './knowledgeDocumentMarkdown'
import './clinical-evidence.css'

export interface MedicalInsertTarget {
  name?: string
  id?: string
  type?: 'medication' | 'guideline' | 'protocol' | string
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

  useEffect(() => {
    if (!isOpen || !target || (!target.name && !target.id)) {
      setDoc(null)
      setError(null)
      setLoading(false)
      return
    }

    let active = true
    setLoading(true)
    setError(null)

    if (!api?.clinicalAi?.getWikiDoc) {
      setLoading(false)
      setError('未配置临床知识库接口')
      return
    }

    api.clinicalAi
      .getWikiDoc({
        name: target.name,
        id: target.id,
        type: target.type,
      })
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
  }, [isOpen, target, api])

  if (!isOpen) return null

  const isMedication = doc?.type === 'MEDICATION' || target?.type === 'medication'
  const title = doc?.title || target?.name || '医学说明书'
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
  )

  return (
    <ClinicalKnowledgePanel
      title={isMedication ? `药品说明书 · ${title}` : `临床指南 · ${title}`}
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
            {doc.formsAndSpecs && doc.formsAndSpecs.length > 0 && (
              <div className="medical-insert-meta-item">
                <strong>剂型与规格:</strong> {doc.formsAndSpecs.join('；')}
              </div>
            )}
          </div>}

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
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
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
