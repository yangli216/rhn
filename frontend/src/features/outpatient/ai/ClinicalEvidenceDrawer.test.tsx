import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ClinicalEvidenceDrawer } from './ClinicalEvidenceDrawer'
import { MedicalInsertViewerModal, type MedicalInsertTarget } from './MedicalInsertViewerModal'
import type { RhnApi } from '../../../shared/rhnApi'
import type { ClinicalAiEvidenceChainResult } from '../../../shared/api/clinicalAiApi'

const mockEvidenceResult: ClinicalAiEvidenceChainResult = {
  success: true,
  protocolId: 'HYPERTENSION_PRIMARY',
  protocolTitle: '中国高血压临床诊疗循证证据链',
  diagnosis: { code: 'I10', name: '原发性高血压 2级' },
  summary: '患者诊室收缩压≥160mmHg，伴头晕颈胀，符合高血压2级推导；建议完善心电图与血生化排查靶器官损伤。',
  checkpoints: [
    {
      status: 'MET',
      type: 'VITAL',
      label: '诊室血压 168/102 mmHg ≥ 160/100 mmHg',
      detail: '两次非同日静息测量血压达到高血压2级界值',
      sourceQuote: '在未使用降压药物的情况下，非同日3次诊室血压收缩压≥140mmHg和/或舒张压≥90mmHg',
    },
    {
      status: 'MET',
      type: 'SYMPTOM',
      label: '伴随晨起头晕颈项胀痛',
      detail: '高血压典型靶器官供血及外周阻力增高症状',
    },
    {
      status: 'MET',
      type: 'EXAMINATION',
      label: '眼底检查提示动脉硬化改变',
      detail: '查体结果支持靶器官损害评估',
    },
    {
      status: 'SUGGESTED',
      type: 'GAP_EXAM',
      label: '建议完善心电图与血生化',
      detail: '排查心肌肥厚与电解质靶器官功能',
    },
  ],
  gapOrders: [
    {
      id: 'ECG-12-LEAD',
      name: '12导联常规心电图',
      category: 'EXAMINATION',
      orderType: 'EXAMINATION',
      dept: '心电图室',
      indication: '评估左心室高电压及心肌缺血',
      defaultChecked: true,
    },
    {
      id: 'BIOCHEM-FULL',
      name: '生化全套',
      category: 'LABORATORY',
      orderType: 'LABORATORY',
      dept: '检验科',
      indication: '评估肾功能肌酐、尿酸及血钾电解质',
      defaultChecked: true,
    },
  ],
  guidelines: [
    {
      id: 'guide-htn-2024',
      title: '中国高血压防治指南（2024年版）',
      chapter: '第4章 诊断性评估与靶器官损害',
      authority: '中华医学会心血管病学分会',
      publishYear: '2024',
      docPath: 'guidelines/hypertension_2024.md',
      keyExcerpts: [
        '初诊高血压患者应常规行12导联心电图检查。',
        '推荐所有高血压患者评估血肌酐、血尿酸和电解质。',
      ],
    },
  ],
}

describe('ClinicalEvidenceDrawer', () => {
  it('renders checklist, guideline references, and applies gap orders', async () => {
    const user = userEvent.setup()
    const getEvidenceChain = vi.fn().mockResolvedValue(mockEvidenceResult)
    const onApplyGapOrders = vi.fn().mockResolvedValue(undefined)
    const onOpenWikiDoc = vi.fn()
    const onClose = vi.fn()

    const api = {
      clinicalAi: {
        getEvidenceChain,
      },
    } as unknown as RhnApi

    render(
      <ClinicalEvidenceDrawer
        isOpen={true}
        onClose={onClose}
        encounterId="enc-101"
        targetDiagnosis={{ code: 'I10', display: '原发性高血压 2级' }}
        context={null}
        api={api}
        onApplyGapOrders={onApplyGapOrders}
        onOpenWikiDoc={onOpenWikiDoc}
      />
    )

    // 等待证据链加载成功
    await waitFor(() => {
      expect(screen.getByText(/中国高血压临床诊疗循证证据链/)).toBeInTheDocument()
    })

    expect(screen.getByRole('dialog', { name: /推荐依据 · 原发性高血压 2级/ }))
      .toHaveAttribute('aria-modal', 'false')
    expect(document.body.style.overflow).not.toBe('hidden')

    // 验证 Checklist
    expect(screen.getByText(/诊室血压 168\/102 mmHg ≥ 160\/100 mmHg/)).toBeInTheDocument()
    expect(screen.getByText(/伴随晨起头晕颈项胀痛/)).toBeInTheDocument()
    expect(screen.getByText('查体体征')).toBeInTheDocument()
    expect(screen.getAllByText(/建议完善心电图与血生化/).length).toBeGreaterThanOrEqual(1)

    // 验证权威指南背书与阅读官方指南全文按钮
    const guideBtn = screen.getByRole('button', { name: /查看全文/ })
    await user.click(guideBtn)
    expect(onOpenWikiDoc).toHaveBeenCalledWith({
      id: 'guide-htn-2024',
      name: '中国高血压防治指南（2024年版）',
      type: 'guideline',
    })

    // 验证缺口待查项与一键带入当前医嘱
    const executeBtn = screen.getByRole('button', { name: /带入医嘱/ })
    expect(executeBtn).toBeInTheDocument()
    await user.click(executeBtn)
    expect(onApplyGapOrders).toHaveBeenCalledWith(mockEvidenceResult.gapOrders)
    expect(onClose).toHaveBeenCalled()
  })

  it('replaces evidence with the full document and closes the document panel', async () => {
    const user = userEvent.setup()
    const api = {
      clinicalAi: {
        getEvidenceChain: vi.fn().mockResolvedValue(mockEvidenceResult),
        getWikiDoc: vi.fn().mockResolvedValue({
          id: 'guide-htn-2024',
          title: '中国高血压防治指南（2024年版）',
          type: 'GUIDELINE',
          markdown: '## 核心推荐\n\n- 完善靶器官损害评估。',
        }),
      },
    } as unknown as RhnApi

    function Harness() {
      const [diagnosis, setDiagnosis] = useState<{ code: string; display: string } | null>({
        code: 'I10',
        display: '原发性高血压 2级',
      })
      const [documentTarget, setDocumentTarget] = useState<MedicalInsertTarget | null>(null)
      return <>
        <ClinicalEvidenceDrawer
          isOpen={Boolean(diagnosis)}
          onClose={() => setDiagnosis(null)}
          encounterId="enc-101"
          targetDiagnosis={diagnosis}
          context={null}
          api={api}
          onOpenWikiDoc={(target) => {
            setDiagnosis(null)
            setDocumentTarget(target)
          }}
        />
        <MedicalInsertViewerModal
          isOpen={Boolean(documentTarget)}
          onClose={() => setDocumentTarget(null)}
          target={documentTarget}
          api={api}
        />
      </>
    }

    render(<Harness />)
    await user.click(await screen.findByRole('button', { name: '查看全文' }))

    expect(await screen.findByRole('dialog', { name: /临床指南 · 中国高血压防治指南/ })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: /推荐依据/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '关闭面板' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
