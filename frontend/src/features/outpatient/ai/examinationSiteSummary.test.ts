import { describe, expect, it } from 'vitest'
import { examinationSiteSummary } from './examinationSiteSummary'

describe('examinationSiteSummary', () => {
  it('lists prefilled sites, review markers, unresolved sites and the previewed total', () => {
    expect(examinationSiteSummary({ resolution: 'MATCHED', unresolvedSites: [],
      bodySites: [{ code: 'A', name: '肝胆脾胰', requiresReview: false }, { code: 'B', name: '甲状腺', requiresReview: false }],
      chargePreview: { lines: [], totalAmount: 80 } })).toBe('部位：肝胆脾胰、甲状腺 · 预计 ¥80.00')
    expect(examinationSiteSummary({ resolution: 'PARTIAL', unresolvedSites: ['盆腔'],
      bodySites: [{ code: 'A', name: '肝胆脾胰', requiresReview: true }] })).toBe('部位：肝胆脾胰（待核对） · 未对应：盆腔')
  })

  it('asks for a site when nothing resolved and stays empty without a plan', () => {
    expect(examinationSiteSummary({ resolution: 'UNRESOLVED', unresolvedSites: [], bodySites: [] })).toBe('请选择检查部位')
    expect(examinationSiteSummary({ resolution: 'NOT_REQUIRED', unresolvedSites: [], bodySites: [] })).toBeUndefined()
    expect(examinationSiteSummary(null)).toBeUndefined()
  })
})
