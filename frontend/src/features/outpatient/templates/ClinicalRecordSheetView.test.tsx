import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ClinicalRecordSheetView, parseClinicalNarrative } from './ClinicalRecordSheetView'

describe('ClinicalRecordSheetView', () => {
  const sampleNarrative = `
持续加重，需警惕并发症并及时转诊。

治疗方案：
1. 中药治疗：首选具有辛温解表、宣肺散寒功效的中成药，如通宣理肺丸、荆防颗粒等。具体用法用量需根据药品说明书及患者个体情况确定。
2. 对症治疗：若发热明显（体温≥38.5℃）或全身酸痛严重，可酌情使用对乙酰氨基酚或布洛芬缓解症状；若鼻塞严重影响睡眠，可短期使用减充血剂滴鼻液。
3. 生活指导：建议多饮温水，注意保暖避风，饮食宜清淡易消化，避免生冷油腻食物。

检验检查：对于典型的风寒感冒且无高危因素者，不建议常规进行血常规、C反应蛋白或胸部影像学检查。仅在出现高热不退、呼吸困难、胸痛或疑似合并细菌感染时，才考虑完善相关实验室检查。

健康宣教：向患者解释感冒多为自限性疾病，病程通常为7-10天。强调抗生素对病毒性感冒无效，切勿自行滥用抗菌药物。

复诊与转诊：一般建议3-5天后复诊评估疗效。若出现高热超过3天、咳脓痰、气促、意识改变等重症预警信号，应立即转诊至上级医院或急诊科进一步诊治。
`

  it('parses sections correctly from clinical narrative text', () => {
    const sections = parseClinicalNarrative(sampleNarrative)
    expect(sections.length).toBeGreaterThanOrEqual(4)

    const titles = sections.map((s) => s.title)
    expect(titles).toContain('【处置与治疗方案】')
    expect(titles).toContain('【辅助检验与检查】')
    expect(titles).toContain('【健康宣教与日常调理】')
    expect(titles).toContain('【复诊随访与转诊预警】')
  })

  it('renders clinical record sheet with title and meta grid', () => {
    render(
      <ClinicalRecordSheetView
        name="成人风寒感冒推荐方案"
        scope="PERSONAL"
        narrative={sampleNarrative}
      />
    )

    expect(screen.getByText('成人风寒感冒推荐方案')).toBeInTheDocument()
    expect(screen.getByText('医生个人方案')).toBeInTheDocument()
    expect(screen.getByText('【处置与治疗方案】')).toBeInTheDocument()
    expect(screen.getByText(/中药治疗/)).toBeInTheDocument()
    expect(screen.getByText(/对症治疗/)).toBeInTheDocument()
    expect(screen.getByText('【辅助检验与检查】')).toBeInTheDocument()
    expect(screen.getByText('【健康宣教与日常调理】')).toBeInTheDocument()
    expect(screen.getByText('【复诊随访与转诊预警】')).toBeInTheDocument()
  })

  it('highlights alert terms in the sheet', () => {
    const { container } = render(
      <ClinicalRecordSheetView
        name="风寒感冒方案"
        scope="HOSPITAL"
        narrative={sampleNarrative}
      />
    )

    const alertItems = container.querySelectorAll('.clinical-record-sheet__item--alert')
    expect(alertItems.length).toBeGreaterThan(0)
  })
})
