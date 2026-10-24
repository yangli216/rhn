import { useState } from 'react'
import { Button, FormField, Select } from '../../../shared/ui'
import {
  NATIONAL_EXAM_TEMPLATES,
  COMMON_EXAM_PHRASES,
} from '../../../shared/clinical/nationalStandardExamCatalog'

export interface ExaminationReportEditorProps {
  findings: string
  conclusion: string
  onChange: (patch: { findings?: string; conclusion?: string }) => void
  disabled: boolean
  defaultItemName?: string
}

/**
 * 生产级医学影像检查报告结构化编辑器
 * 遵循国家卫健委 WS 445.11-2014《电子病历基本数据集 第11部分：医学影像检查报告》
 * 支持典型模板一键套用、常见影像征象词条快速填充与检查所见/结论联动。
 */
export function ExaminationReportEditor({
  findings,
  conclusion,
  onChange,
  disabled,
}: ExaminationReportEditorProps) {
  const [selectedTemplateCode, setSelectedTemplateCode] = useState('')
  const [phraseCategory, setPhraseCategory] = useState(COMMON_EXAM_PHRASES[0]?.category || '')

  const handleApplyTemplate = (tplCode: string) => {
    setSelectedTemplateCode(tplCode)
    const tpl = NATIONAL_EXAM_TEMPLATES.find((t) => t.templateCode === tplCode)
    if (!tpl) return
    onChange({
      findings: tpl.defaultFindings,
      conclusion: tpl.defaultConclusion,
    })
  }

  const handleInsertPhrase = (phrase: { findings: string; conclusion: string }) => {
    const nextFindings = findings.trim()
      ? `${findings.trim()}\n${phrase.findings}`
      : phrase.findings
    const nextConclusion = conclusion.trim()
      ? `${conclusion.trim()}\n${phrase.conclusion}`
      : phrase.conclusion
    onChange({
      findings: nextFindings,
      conclusion: nextConclusion,
    })
  }

  const activePhrases = COMMON_EXAM_PHRASES.find((p) => p.category === phraseCategory)?.phrases || []

  return (
    <section aria-label="检查报告录入" className="diagnostic-examination-document">
      <div className="diagnostic-exam-toolbar">
        <FormField label="国家标准结构化报告模板">
          <Select
            id="exam-template-select"
            aria-label="选择国家标准检查报告模板"
            value={selectedTemplateCode}
            placeholder="选择预制阴性/正常模板快速填入"
            disabled={disabled}
            options={NATIONAL_EXAM_TEMPLATES.map((tpl) => ({
              value: tpl.templateCode,
              label: `[${tpl.modalityCode}] ${tpl.bodyPart} · ${tpl.defaultConclusion.slice(0, 24)}…`,
            }))}
            onChange={(val) => handleApplyTemplate(val)}
          />
        </FormField>
        <Button
          variant="secondary"
          disabled={disabled || !selectedTemplateCode}
          onClick={() => handleApplyTemplate(selectedTemplateCode)}
        >
          套用模板
        </Button>
      </div>

      <div className="diagnostic-exam-phrase-box">
        <div className="diagnostic-exam-phrase-tags">
          <span className="diagnostic-exam-phrase-header">
            常见影像表现与诊断词条库：
          </span>
          {COMMON_EXAM_PHRASES.map((group) => (
            <Button
              key={group.category}
              size="sm"
              variant={phraseCategory === group.category ? 'primary' : 'text'}
              onClick={() => setPhraseCategory(group.category)}
            >
              {group.category}
            </Button>
          ))}
        </div>
        <div className="diagnostic-exam-phrase-tags">
          {activePhrases.map((phrase) => (
            <Button
              key={phrase.title}
              size="sm"
              variant="secondary"
              disabled={disabled}
              onClick={() => handleInsertPhrase(phrase)}
              title={`点击将【${phrase.title}】的征象描述与诊断意见追加至报告中`}
            >
              + {phrase.title}
            </Button>
          ))}
        </div>
      </div>

      <div className="diagnostic-exam-fields">
        <FormField label="检查所见 (影像学客观表现描述)" required>
          <textarea
            rows={7}
            disabled={disabled}
            placeholder="详细描述各解剖部位结构、形态、密度/回声、信号强度及病灶边界、血供等影像学特征…"
            value={findings}
            onChange={(e) => onChange({ findings: e.target.value })}
          />
        </FormField>

        <FormField label="检查结论 (影像学诊断与会诊意见)" required>
          <textarea
            rows={7}
            disabled={disabled}
            placeholder="明确陈述影像诊断结果（确定性诊断/倾向性诊断/除外诊断）及进一步检查建议…"
            value={conclusion}
            onChange={(e) => onChange({ conclusion: e.target.value })}
          />
        </FormField>
      </div>
    </section>
  )
}
