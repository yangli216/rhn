import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ClinicalAiPipelineStepper } from './ClinicalAiPipelineStepper'
import type { ClinicalAiSurfaces } from './ClinicalAiInlineWorkspace'

describe('ClinicalAiPipelineStepper', () => {
  let surfaces: ClinicalAiSurfaces
  let noteDiv: HTMLDivElement
  let diagnosesDiv: HTMLDivElement
  let plansDiv: HTMLDivElement

  beforeEach(() => {
    vi.useFakeTimers()
    noteDiv = document.createElement('div')
    diagnosesDiv = document.createElement('div')
    plansDiv = document.createElement('div')

    const recordPanel = document.createElement('div')
    recordPanel.className = 'doctor-record-panel'
    recordPanel.appendChild(noteDiv)

    const diagnosisPanel = document.createElement('div')
    diagnosisPanel.className = 'doctor-diagnosis-panel'
    diagnosisPanel.appendChild(diagnosesDiv)

    const ordersPanel = document.createElement('div')
    ordersPanel.className = 'doctor-orders-panel'
    ordersPanel.appendChild(plansDiv)

    document.body.appendChild(recordPanel)
    document.body.appendChild(diagnosisPanel)
    document.body.appendChild(ordersPanel)

    // Mock scrollIntoView
    Element.prototype.scrollIntoView = vi.fn()

    surfaces = {
      summary: null,
      note: noteDiv,
      diagnoses: diagnosesDiv,
      plans: plansDiv,
      detail: null,
    }
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('renders all three workflow stages with accessible labels', () => {
    render(
      <ClinicalAiPipelineStepper
        generating={true}
        hasTreatmentPlan={false}
        current={false}
        surfaces={surfaces}
      />
    )

    expect(screen.getByRole('navigation', { name: 'AI 临床推演全流程' })).toBeInTheDocument()
    expect(screen.getByText('病历')).toBeInTheDocument()
    expect(screen.getByText('诊断')).toBeInTheDocument()
    expect(screen.getByText('治疗建议')).toBeInTheDocument()
  })

  it('marks stages appropriately during early record generation', () => {
    const { container } = render(
      <ClinicalAiPipelineStepper
        generating={true}
        hasTreatmentPlan={false}
        current={false}
        surfaces={surfaces}
      />
    )

    const recordBtn = screen.getByRole('button', { name: /病历推演/ })
    const diagBtn = screen.getByRole('button', { name: /辅助诊断/ })
    const planBtn = screen.getByRole('button', { name: /治疗建议/ })

    expect(recordBtn).toHaveClass('is-generating')
    expect(diagBtn).toHaveClass('is-waiting')
    expect(planBtn).toHaveClass('is-waiting')

    // First arrow should be flowing
    const arrows = container.querySelectorAll('.doctor-ai-pipeline__arrow')
    expect(arrows[0]).toHaveClass('is-flowing')
    expect(arrows[1]).not.toHaveClass('is-flowing')
  })

  it('marks record as done and subsequent stages as active when treatment plan matching starts', () => {
    const { container } = render(
      <ClinicalAiPipelineStepper
        generating={true}
        hasTreatmentPlan={true}
        current={false}
        surfaces={surfaces}
      />
    )

    const recordBtn = screen.getByRole('button', { name: /病历推演/ })
    const diagBtn = screen.getByRole('button', { name: /辅助诊断/ })
    const planBtn = screen.getByRole('button', { name: /治疗建议/ })

    expect(recordBtn).toHaveClass('is-done')
    expect(diagBtn).toHaveClass('is-generating')
    expect(planBtn).toHaveClass('is-generating')

    const arrows = container.querySelectorAll('.doctor-ai-pipeline__arrow')
    expect(arrows[0]).not.toHaveClass('is-flowing')
    expect(arrows[1]).toHaveClass('is-flowing')
  })

  it('smoothly scrolls to target panel and applies spotlight animation on click', () => {
    const onStepClick = vi.fn()
    render(
      <ClinicalAiPipelineStepper
        generating={true}
        hasTreatmentPlan={true}
        current={false}
        surfaces={surfaces}
        onStepClick={onStepClick}
      />
    )

    const diagBtn = screen.getByRole('button', { name: /辅助诊断/ })
    fireEvent.click(diagBtn)

    expect(onStepClick).toHaveBeenCalledWith('diagnosis')
    const diagPanel = document.querySelector('.doctor-diagnosis-panel')
    expect(diagPanel?.scrollIntoView).toHaveBeenCalled()
    expect(diagPanel).toHaveClass('doctor-element-spotlight')

    // Spotlight class should be removed after timeout
    act(() => {
      vi.advanceTimersByTime(1650)
    })
    expect(diagPanel).not.toHaveClass('doctor-element-spotlight')
  })

  it('renders ready status when generation is complete', () => {
    render(
      <ClinicalAiPipelineStepper
        generating={false}
        hasTreatmentPlan={true}
        current={true}
        surfaces={surfaces}
      />
    )

    const recordBtn = screen.getByRole('button', { name: /病历推演/ })
    const diagBtn = screen.getByRole('button', { name: /辅助诊断/ })
    const planBtn = screen.getByRole('button', { name: /治疗建议/ })

    expect(recordBtn).toHaveClass('is-ready')
    expect(diagBtn).toHaveClass('is-ready')
    expect(planBtn).toHaveClass('is-ready')
  })
})
