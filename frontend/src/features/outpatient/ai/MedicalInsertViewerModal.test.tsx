import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MedicalInsertViewerModal } from './MedicalInsertViewerModal'
import { normalizeKnowledgeDocumentMarkdown } from './knowledgeDocumentMarkdown'
import type { RhnApi } from '../../../shared/rhnApi'
import type { ClinicalAiWikiDocResult } from '../../../shared/api/clinicalAiApi'

const mockMedDoc: ClinicalAiWikiDocResult = {
  id: 'med-amlodipine',
  title: '苯磺酸氨氯地平片',
  type: 'MEDICATION',
  genericName: '苯磺酸氨氯地平片',
  englishName: 'Amlodipine Besylate Tablets',
  tradeNames: ['络活喜'],
  atcCode: 'C08CA01',
  formsAndSpecs: ['5mg*7片/盒'],
  maxDailyDose: '10mg / 日',
  standardMaintenanceDose: '5mg / 日，每日一次口服',
  keyContraindications: ['对二氢吡啶类药物过敏者禁用', '严重低血压或心源性休克禁用'],
  specialPopulations: {
    '老年用药': '通常从2.5mg小剂量开始起始调整。',
    '肝功能损害': '在严重肝功能受损患者中半衰期延长，应慎重用药。',
  },
  html: '<p onclick="alert(1)">本品适用于原发性高血压的治疗及慢性稳定性心绞痛。</p><img src="x" onerror="alert(1)"><script>alert(1)</script>',
  sources: ['国家药典委员会·2025版', '国家药品监督管理局核准说明书'],
}

describe('MedicalInsertViewerModal', () => {
  it('keeps a pending or loaded article stable when the parent recreates the same target', async () => {
    let resolveDoc!: (doc: ClinicalAiWikiDocResult) => void
    const getWikiDoc = vi.fn(() => new Promise<ClinicalAiWikiDocResult>((resolve) => { resolveDoc = resolve }))
    const api = { clinicalAi: { getWikiDoc } } as unknown as RhnApi
    const props = { isOpen: true, onClose: vi.fn(), api }
    const target = { name: '苯磺酸氨氯地平片', type: 'medication' }
    const { rerender } = render(<MedicalInsertViewerModal {...props} target={{ ...target }} />)

    rerender(<MedicalInsertViewerModal {...props} target={{ ...target }} />)
    expect(getWikiDoc).toHaveBeenCalledTimes(1)
    await act(async () => resolveDoc(mockMedDoc))
    expect(screen.getByText('10mg / 日')).toBeInTheDocument()

    rerender(<MedicalInsertViewerModal {...props} target={{ ...target }} />)
    expect(getWikiDoc).toHaveBeenCalledTimes(1)
    expect(screen.getByText('10mg / 日')).toBeInTheDocument()
    expect(screen.queryByText('正在加载知识库资料…')).not.toBeInTheDocument()
  })

  it('loads a changed article and ignores a late response for the previous article', async () => {
    let resolveOldDoc!: (doc: ClinicalAiWikiDocResult) => void
    const getWikiDoc = vi.fn()
      .mockImplementationOnce(() => new Promise<ClinicalAiWikiDocResult>((resolve) => { resolveOldDoc = resolve }))
      .mockResolvedValueOnce({ id: 'new-guide', title: '新指南', type: 'GUIDELINE', markdown: '新的诊疗建议' })
    const api = { clinicalAi: { getWikiDoc } } as unknown as RhnApi
    const props = { isOpen: true, onClose: vi.fn(), api }
    const { rerender } = render(<MedicalInsertViewerModal {...props} target={{ id: 'old-guide', type: 'guideline' }} />)

    rerender(<MedicalInsertViewerModal {...props} target={{ id: 'new-guide', type: 'guideline' }} />)
    expect(await screen.findByText('新的诊疗建议')).toBeInTheDocument()
    expect(getWikiDoc).toHaveBeenLastCalledWith({ id: 'new-guide', type: 'guideline' })

    await act(async () => resolveOldDoc(mockMedDoc))
    expect(screen.getByText('新的诊疗建议')).toBeInTheDocument()
    expect(screen.queryByText('10mg / 日')).not.toBeInTheDocument()
  })

  it('clears the old article when switching and reloads for a new API session', async () => {
    const getWikiDoc = vi.fn().mockResolvedValueOnce(mockMedDoc).mockResolvedValueOnce({ title: '新指南', type: 'GUIDELINE', markdown: '新的诊疗建议' })
    const api = { clinicalAi: { getWikiDoc } } as unknown as RhnApi
    const props = { isOpen: true, onClose: vi.fn() }
    const { rerender } = render(<MedicalInsertViewerModal {...props} api={api} target={{ name: mockMedDoc.title, type: 'medication' }} />)
    await screen.findByText('10mg / 日')

    rerender(<MedicalInsertViewerModal {...props} api={api} target={{ name: '新指南', type: 'guideline' }} />)
    expect(screen.getByRole('dialog', { name: '临床指南 · 新指南' })).toBeInTheDocument()
    expect(screen.queryByText('10mg / 日')).not.toBeInTheDocument()
    await screen.findByText('新的诊疗建议')

    const nextGetWikiDoc = vi.fn().mockResolvedValue({ title: '新指南', type: 'GUIDELINE', markdown: '新会话资料' })
    rerender(<MedicalInsertViewerModal {...props} api={{ clinicalAi: { getWikiDoc: nextGetWikiDoc } } as unknown as RhnApi} target={{ name: '新指南', type: 'guideline' }} />)
    expect(await screen.findByText('新会话资料')).toBeInTheDocument()
    expect(nextGetWikiDoc).toHaveBeenCalledTimes(1)
  })

  it('renders drug label with max daily dose and contraindications', async () => {
    const user = userEvent.setup()
    const getWikiDoc = vi.fn().mockResolvedValue(mockMedDoc)
    const onClose = vi.fn()

    const api = {
      clinicalAi: {
        getWikiDoc,
      },
    } as unknown as RhnApi

    render(
      <MedicalInsertViewerModal
        isOpen={true}
        onClose={onClose}
        target={{ name: '苯磺酸氨氯地平片', type: 'medication' }}
        api={api}
      />
    )

    await waitFor(() => {
      expect(screen.getByText(/药品说明书 · 苯磺酸氨氯地平片/)).toBeInTheDocument()
    })

    const panel = screen.getByRole('dialog', { name: /药品说明书 · 苯磺酸氨氯地平片/ })
    expect(panel).toHaveAttribute('aria-modal', 'false')
    expect(document.body.style.overflow).not.toBe('hidden')

    // 验证核心安全警示（极量与禁忌）
    expect(screen.getByText('10mg / 日')).toBeInTheDocument()
    expect(screen.getByText('5mg / 日，每日一次口服')).toBeInTheDocument()
    expect(screen.getByText(/对二氢吡啶类药物过敏者禁用/)).toBeInTheDocument()
    expect(screen.getByText(/严重低血压或心源性休克禁用/)).toBeInTheDocument()

    // 验证特殊人群与正文
    expect(screen.getByText('老年用药')).toBeInTheDocument()
    expect(screen.getByText(/原发性高血压的治疗/)).toBeInTheDocument()
    expect(panel.querySelector('img')).toBeNull()
    expect(panel.querySelector('script')).toBeNull()
    expect(panel.querySelector('[onclick]')).toBeNull()

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('renders normalized Markdown and omits an empty guideline metadata box', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const getWikiDoc = vi.fn().mockResolvedValue({
      id: 'guide-htn-2024',
      title: '中国高血压防治指南（2024年版）',
      type: 'GUIDELINE',
      markdown: `---
title: 中国高血压防治指南
---

# 中国高血压防治指南

## 核心推荐

| 条款 | 推荐等级 |
| --- | --- |
| **血压管理** | I 类 |

- 参考[[原发性高血压|高血压诊疗规范]]。`,
    } satisfies ClinicalAiWikiDocResult)
    const api = { clinicalAi: { getWikiDoc } } as unknown as RhnApi

    render(
      <MedicalInsertViewerModal
        isOpen={true}
        onClose={onClose}
        target={{ id: 'guide-htn-2024', type: 'guideline' }}
        api={api}
      />
    )

    const panel = await screen.findByRole('dialog', { name: /临床指南 · 中国高血压防治指南/ })
    expect(screen.getByRole('heading', { name: '核心推荐' })).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText('血压管理').tagName).toBe('STRONG')
    expect(screen.getByText(/参考高血压诊疗规范/)).toBeInTheDocument()
    expect(panel.querySelector('.medical-insert-meta-banner')).toBeNull()
    expect(screen.queryByText(/title: 中国高血压防治指南/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '关闭面板' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('removes the duplicated drug summary but keeps detailed sections', () => {
    const markdown = normalizeKnowledgeDocumentMarkdown(`---
title: 阿莫西林胶囊
---
# 阿莫西林胶囊 官方核准药品说明书

> **国家法定核准说明书摘要与临床用药须知**
> - **通用名称**：阿莫西林胶囊
> - **标准制剂与规格**：0.25g / 粒

---

## 一、成分与性状
主要成分为阿莫西林。`, { medication: true })

    expect(markdown).not.toContain('国家法定核准说明书摘要')
    expect(markdown).not.toContain('标准制剂与规格')
    expect(markdown).not.toContain('# 阿莫西林胶囊')
    expect(markdown).toContain('## 一、成分与性状')
  })
})
