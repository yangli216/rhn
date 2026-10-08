import { SkinTestHistoryStatus, SkinTestExemptionReasonSelect, SkinTestWorklistStatus, type SkinTestWorklistState, type useSkinTestHistory } from './skinTestHistory'
import type { AllergyIntolerance } from '../../../shared/api/residentsApi'
import type { SkinTestWorkItem } from '../../../shared/api/treatmentApi'
import { formatTime } from '../../../shared/format'
import { Button, Icon } from '../../../shared/ui'
import type { MedicationEntry, MedicationEntryUpdate } from './medicationEntry'

export function OrderComposerSafety({
  hasSafetyAlert, allergyVerificationMissing, isAllergyHit, hasKnownAllergies, matchedAllergies,
  drugAllergies, isSkinTest, hasPositiveSkinTest, isAntimicrobial, antimicrobialLevelText,
  skinTests, skinTestHistory, recentNegativeItem, medicationEntry, updateMedication, onChangeExemption, onChangeReason
}: {
  hasSafetyAlert: boolean
  allergyVerificationMissing: boolean
  isAllergyHit: boolean
  hasKnownAllergies: boolean
  matchedAllergies: AllergyIntolerance[]
  drugAllergies: AllergyIntolerance[]
  isSkinTest: boolean
  hasPositiveSkinTest: boolean
  isAntimicrobial: boolean
  antimicrobialLevelText?: string
  skinTests: SkinTestWorklistState
  skinTestHistory: ReturnType<typeof useSkinTestHistory>
  recentNegativeItem?: SkinTestWorkItem
  medicationEntry: Pick<MedicationEntry, 'skinTestExempt' | 'skinTestExemptReason' | 'exemptEvidenceEventId' | 'allergyOverrideReason'>
  updateMedication: MedicationEntryUpdate
  onChangeReason: (reason: string) => void
  onChangeExemption: (checked: boolean, evidence?: SkinTestWorkItem) => void
}) {
  return <>
    {hasSafetyAlert && (
      <div className="doctor-unified-order-subrow doctor-unified-order-safety is-warning is-compact" role="row">
        <div className="doctor-safety-content is-compact">
          <span className="doctor-safety-badge-title">用药风险提醒：</span>
          {allergyVerificationMissing && (
            <span className="doctor-safety-tag is-warning">
              <Icon name="warning" /> 患者药物过敏信息尚未核验，请尽快补充
            </span>
          )}
          {isAllergyHit && (
            <span className="doctor-safety-tag is-danger">
              <Icon name="warning" /> 命中患者药物过敏：{matchedAllergies.map((item) => item.substanceDisplay).join('、')}
            </span>
          )}
          {!isAllergyHit && hasKnownAllergies && (
            <span className="doctor-safety-tag is-warning">
              患者既往药物过敏：{drugAllergies.map((item) => item.substanceDisplay).join('、')}
            </span>
          )}
          {isSkinTest && (
            <span className={`doctor-safety-tag ${hasPositiveSkinTest ? 'is-danger' : medicationEntry.skinTestExempt ? 'is-exempt' : 'is-skintest'}`}>
              <Icon name={hasPositiveSkinTest ? 'warning' : 'info'} />
              {hasPositiveSkinTest
                ? '严正警示：患者当前药品皮试结果为【阳性】，禁止开立！'
                : medicationEntry.skinTestExempt
                ? (medicationEntry.skinTestExemptReason ? `已选择免试：${medicationEntry.skinTestExemptReason}` : '免试原因待填写')
                : '需皮试药品（默认派发皮试任务）'}
            </span>
          )}
          {isSkinTest && <SkinTestWorklistStatus query={skinTests} />}
          {isSkinTest && !hasPositiveSkinTest && (
            <div className="doctor-skintest-exempt-inline">
              <SkinTestHistoryStatus history={skinTestHistory} />
              {recentNegativeItem && (
                <div className="doctor-skintest-evidence-alert">
                  <span className="doctor-evidence-badge">探测到历史有效皮试</span>
                  <span className="doctor-evidence-info">
                    记录 #{recentNegativeItem.eventId}（阴性，完成于 {recentNegativeItem.completedAt ? formatTime(recentNegativeItem.completedAt) : '未记录'}
                    {recentNegativeItem.verifiedByName ? `，复核护士：${recentNegativeItem.verifiedByName}` : ''}
                    {recentNegativeItem.resultValidityHours ? `，有效期 ${recentNegativeItem.resultValidityHours} 小时` : ''}）
                  </span>
                  {medicationEntry.exemptEvidenceEventId !== recentNegativeItem.eventId ? (
                    <Button size="sm" variant="secondary" onClick={() => {
                      onChangeExemption(true, recentNegativeItem)
                    }}>
                      一键引用免试
                    </Button>
                  ) : (
                    <span className="doctor-evidence-applied-tag">已引用免试</span>
                  )}
                </div>
              )}
              <label className="doctor-exempt-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(medicationEntry.skinTestExempt)}
                  onChange={(e) => {
                    const checked = e.target.checked
                    onChangeExemption(checked)
                  }}
                />
                <span>免做皮试</span>
              </label>
              {medicationEntry.skinTestExempt && (
                <div className="doctor-exempt-reason-select">
                  <SkinTestExemptionReasonSelect value={medicationEntry.skinTestExemptReason || ''} onChange={onChangeReason} />
                </div>
              )}
            </div>
          )}
          {isAntimicrobial && (
            <span className="doctor-safety-tag is-antimicrobial">
              抗菌药物{antimicrobialLevelText ? ` · ${antimicrobialLevelText}` : ''}
            </span>
          )}
          {isAllergyHit && (
            <input aria-label="继续开立理由" value={medicationEntry.allergyOverrideReason}
              placeholder="命中已知过敏，请输入继续开立理由" onChange={(event) => updateMedication('allergyOverrideReason', event.target.value)} />
          )}
        </div>
      </div>
    )}
  </>
}
