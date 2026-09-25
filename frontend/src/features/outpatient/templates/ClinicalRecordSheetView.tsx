import { useMemo } from 'react'
import type { OutpatientPlanTemplateScope } from '../../../shared/api/outpatientPlanTemplatesApi'
import { StatusBadge } from '../../../shared/ui'

export interface ClinicalRecordSheetViewProps {
  name: string
  scope: OutpatientPlanTemplateScope
  narrative: string
  guidelineReference?: string
  className?: string
}

export interface SheetSectionItem {
  prefix?: string
  label?: string
  body: string
  isAlert?: boolean
}

export interface SheetSection {
  title: string
  kind: 'overview' | 'treatment' | 'investigation' | 'education' | 'referral' | 'general'
  items: SheetSectionItem[]
}

const SECTION_PATTERNS: Array<{
  kind: SheetSection['kind']
  title: string
  regex: RegExp
}> = [
  {
    kind: 'overview',
    title: '【适用范围与临床评估】',
    regex: /^(?:【\s*|(?:\d+[\.、\s]*)?)(适用范围|病情评估|诊断依据|诊断与评估|临床评估|适应证|证候分型)[】\s]*[：:]?/i,
  },
  {
    kind: 'treatment',
    title: '【处置与治疗方案】',
    regex: /^(?:【\s*|(?:\d+[\.、\s]*)?)(治疗方案|处置措施|处方与治疗|治疗原则|用药方案|临床处置)[】\s]*[：:]?/i,
  },
  {
    kind: 'investigation',
    title: '【辅助检验与检查】',
    regex: /^(?:【\s*|(?:\d+[\.、\s]*)?)(检验检查|检查检验|辅助检查|实验室检查|影像学检查)[】\s]*[：:]?/i,
  },
  {
    kind: 'education',
    title: '【健康宣教与日常调理】',
    regex: /^(?:【\s*|(?:\d+[\.、\s]*)?)(健康宣教|生活指导|患者教育|生活调理|日常护理|宣教指导)[】\s]*[：:]?/i,
  },
  {
    kind: 'referral',
    title: '【复诊随访与转诊预警】',
    regex: /^(?:【\s*|(?:\d+[\.、\s]*)?)(复诊与转诊|随访与转诊|转诊指征|复诊安排|随访安排|重症预警|病情转归)[】\s]*[：:]?/i,
  },
]

const ALERT_KEYWORDS = ['重症', '转诊', '警惕', '危急', '高热超过', '意识改变', '呼吸困难', '病情加重', '不可自行']

export function parseClinicalNarrative(narrative: string): SheetSection[] {
  if (!narrative || !narrative.trim()) return []

  const lines = narrative.split('\n').map((l) => l.trim()).filter(Boolean)
  const sections: SheetSection[] = []

  let currentSection: SheetSection = {
    title: '【临床方案概要】',
    kind: 'overview',
    items: [],
  }

  for (const rawLine of lines) {
    let matchedPattern = false

    for (const pat of SECTION_PATTERNS) {
      const match = rawLine.match(pat.regex)
      if (match) {
        // 如果当前是初始概况且已有内容，先存入
        if (currentSection.items.length > 0 && !sections.includes(currentSection)) {
          sections.push(currentSection)
        }

        // 查找是否已有同类板块
        const existing = sections.find((s) => s.kind === pat.kind)
        if (existing) {
          currentSection = existing
        } else {
          currentSection = {
            title: pat.title,
            kind: pat.kind,
            items: [],
          }
          sections.push(currentSection)
        }

        const remainder = rawLine.slice(match[0].length).trim()
        if (remainder) {
          currentSection.items.push(parseItem(remainder))
        }
        matchedPattern = true
        break
      }
    }

    if (!matchedPattern) {
      currentSection.items.push(parseItem(rawLine))
    }
  }

  if (currentSection.items.length > 0 && !sections.includes(currentSection)) {
    sections.push(currentSection)
  }

  return sections
}

function parseItem(line: string): SheetSectionItem {
  const isAlert = ALERT_KEYWORDS.some((kw) => line.includes(kw))

  const numberedMatch = line.match(/^((?:[0-9]+[、\.）\)]|[一二三四五六七八九十]+[、\.）\)]|[•\-\*]))\s*(.*)$/)
  let prefix: string | undefined
  let mainText = line

  if (numberedMatch) {
    prefix = numberedMatch[1]
    mainText = numberedMatch[2]
  }

  const labelMatch = mainText.match(/^([^：:]{2,12})[：:](.*)$/)
  if (labelMatch) {
    return {
      prefix,
      label: labelMatch[1].trim(),
      body: labelMatch[2].trim(),
      isAlert,
    }
  }

  return {
    prefix,
    body: mainText,
    isAlert,
  }
}

const SCOPE_LABELS: Record<OutpatientPlanTemplateScope, string> = {
  PERSONAL: '医生个人方案',
  DEPARTMENT: '科室临床路径方案',
  HOSPITAL: '全院临床指南方案',
}

export function ClinicalRecordSheetView({
  name,
  scope,
  narrative,
  guidelineReference,
  className = '',
}: ClinicalRecordSheetViewProps) {
  const sections = useMemo(() => parseClinicalNarrative(narrative), [narrative])

  return (
    <div className={`clinical-record-sheet ${className}`} role="region" aria-label="门诊诊疗方案文字草案">
      <div className="clinical-record-sheet__header">
        <div className="clinical-record-sheet__meta-row">
          <div className="clinical-record-sheet__title">{name || '门诊诊疗方案草案'}</div>
          <div className="clinical-record-sheet__badges">
            <StatusBadge tone="neutral">{SCOPE_LABELS[scope] || scope}</StatusBadge>
          </div>
        </div>
        {guidelineReference && (
          <div className="clinical-record-sheet__guideline">
            <small>📖 临床规范依据：{guidelineReference}</small>
          </div>
        )}
      </div>

      <div className="clinical-record-sheet__body">
        {sections.length === 0 ? (
          <div className="clinical-record-sheet__empty">暂无可渲染的临床方案文本</div>
        ) : (
          sections.map((sec, secIdx) => (
            <div key={secIdx} className="ai-plan-modal-section">
              <div className="ai-plan-modal-section-title">
                {sec.title}
              </div>
              <div className="clinical-record-sheet__section-content">
                {sec.items.map((item, itemIdx) => (
                  <div
                    key={itemIdx}
                    className={`clinical-record-sheet__item ${item.isAlert ? 'clinical-record-sheet__item--alert' : ''}`}
                  >
                    {item.prefix && <span className="clinical-record-sheet__prefix">{item.prefix}</span>}
                    {item.label && <strong className="clinical-record-sheet__label">{item.label}：</strong>}
                    <span className="clinical-record-sheet__text">{item.body}</span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
