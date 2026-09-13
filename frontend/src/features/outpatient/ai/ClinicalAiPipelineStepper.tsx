import { useCallback } from 'react'
import { Icon } from '../../../shared/ui'
import type { ClinicalAiSurfaces } from './ClinicalAiInlineWorkspace'

export type PipelineStage = 'record' | 'diagnosis' | 'treatment'

export interface ClinicalAiPipelineStepperProps {
  generating: boolean
  hasTreatmentPlan: boolean
  current?: boolean
  surfaces?: ClinicalAiSurfaces
  className?: string
  onStepClick?: (stage: PipelineStage) => void
}

interface StageDefinition {
  key: PipelineStage
  label: string
  fullName: string
  description: string
  targetSelector: string
}

const STAGES: StageDefinition[] = [
  {
    key: 'record',
    label: '病历',
    fullName: '病历推演',
    description: '自动提炼主诉、现病史等门诊病历段落（点击定位至病历表单）',
    targetSelector: '.doctor-record-panel',
  },
  {
    key: 'diagnosis',
    label: '诊断',
    fullName: '辅助诊断',
    description: '基于症状推演 ICD-10 拟诊与鉴别诊断（点击定位至诊断卡片）',
    targetSelector: '.doctor-diagnosis-panel',
  },
  {
    key: 'treatment',
    label: '治疗建议',
    fullName: '治疗建议',
    description: '智能推荐院内药品处方、检验检查及处置方案（点击定位至医嘱开立区）',
    targetSelector: '.doctor-orders-panel',
  },
]

export function ClinicalAiPipelineStepper({
  generating,
  hasTreatmentPlan,
  current = false,
  surfaces,
  className = '',
  onStepClick,
}: ClinicalAiPipelineStepperProps) {
  const getStageStatus = (key: PipelineStage): 'generating' | 'done' | 'ready' | 'waiting' | 'idle' => {
    if (generating) {
      if (!hasTreatmentPlan) {
        if (key === 'record') return 'generating'
        return 'waiting'
      }
      if (key === 'record') return 'done'
      return 'generating'
    }
    if (current) return 'ready'
    return 'idle'
  }

  const handleStepClick = useCallback((stage: StageDefinition) => {
    onStepClick?.(stage.key)

    let target: HTMLElement | null = null
    if (stage.key === 'record') {
      target = (surfaces?.note?.closest('.doctor-record-panel') as HTMLElement | null)
        || document.querySelector<HTMLElement>('.doctor-record-panel')
        || document.getElementById('doctor-record-form')
    } else if (stage.key === 'diagnosis') {
      target = (surfaces?.diagnoses?.closest('.doctor-diagnosis-panel') as HTMLElement | null)
        || document.querySelector<HTMLElement>('.doctor-diagnosis-panel')
    } else if (stage.key === 'treatment') {
      target = (surfaces?.plans?.closest('.doctor-orders-panel') as HTMLElement | null)
        || document.querySelector<HTMLElement>('.doctor-orders-panel')
    }

    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      target.classList.remove('doctor-element-spotlight')
      void target.offsetWidth
      target.classList.add('doctor-element-spotlight')
      setTimeout(() => {
        target?.classList.remove('doctor-element-spotlight')
      }, 1600)
    }
  }, [onStepClick, surfaces])

  return (
    <nav className={`doctor-ai-pipeline ${generating ? 'is-generating' : ''} ${className}`.trim()}
      aria-label="AI 临床推演全流程">
      {STAGES.map((stage, index) => {
        const status = getStageStatus(stage.key)
        const isNextFlowing = generating && (
          (index === 0 && !hasTreatmentPlan) ||
          (index === 1 && hasTreatmentPlan)
        )

        let statusText = '点击定位查看'
        if (status === 'generating') statusText = 'AI 正在推演该阶段中…（点击可提前定位）'
        else if (status === 'done') statusText = '该阶段推演完成（点击定位查看）'
        else if (status === 'waiting') statusText = '等待上一环节完成（点击可提前定位）'
        else if (status === 'ready') statusText = '建议已生成就绪（点击定位查看）'

        const tooltip = `【${stage.fullName}】${stage.description} · ${statusText}`

        return (
          <span key={stage.key} className="doctor-ai-pipeline__item">
            <button
              type="button"
              className={`doctor-ai-pipeline__step is-${status}`}
              onClick={() => handleStepClick(stage)}
              title={tooltip}
              aria-label={`${stage.fullName}：${statusText}`}>
              {status === 'generating' && (
                <span className="doctor-ai-pipeline__pulse" aria-hidden="true" />
              )}
              {status === 'done' && (
                <span className="doctor-ai-pipeline__check" aria-hidden="true">
                  <Icon name="check" />
                </span>
              )}
              {status === 'ready' && (
                <span className="doctor-ai-pipeline__ready-dot" aria-hidden="true" />
              )}
              <span className="doctor-ai-pipeline__label">{stage.label}</span>
            </button>
            {index < STAGES.length - 1 && (
              <span
                className={`doctor-ai-pipeline__arrow ${isNextFlowing ? 'is-flowing' : ''}`}
                aria-hidden="true"
                title={isNextFlowing ? '数据流向推演中' : undefined}>
                →
              </span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
