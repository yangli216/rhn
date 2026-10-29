import type { ClinicalContext } from '../shared/clinical/workContext'
import { useFontSizePreference } from '../shared/preferences/useFontSizePreference'
import { DedicatedWaitingWorkspace } from '../features/outpatient/waiting/DedicatedWaitingWorkspace'
import { enhanceQueueList } from '../features/outpatient/waiting/queueDataEnhancer'
import type { ReceptionQueueItem } from '../shared/api/schedulingApi'
import type { EnhancedQueueItem } from '../features/outpatient/waiting/queueTypes'

// 虚构数据：覆盖候诊/叫号中/暂挂/已接诊、回诊与绿色通道、危急体征、AI 预问诊与报告摘要，供截图基线使用。
const base = (index: number, patch: Partial<ReceptionQueueItem>): ReceptionQueueItem => ({
  registrationId: `reg-${index}`,
  encounterId: `enc-${index}`,
  residentId: `res-${index}`,
  healthRecordNo: `HR00${index}`,
  residentName: `示例患者${index}`,
  gender: '1',
  genderText: '男',
  birthDate: '1980-03-15',
  registrationNo: `REG00${index}`,
  ticketNo: `A00${index}`,
  sequenceNo: index,
  priority: 0,
  registrationSource: 'DIRECT',
  visitType: 'GENERAL',
  registrationStatus: 'REGISTERED',
  status: 'WAITING',
  practitionerName: '示例医生',
  serviceName: '普通全科门诊',
  locationName: '1号诊室',
  registeredAt: '2026-10-28T08:00:00+08:00',
  ...patch,
})

const raw: ReceptionQueueItem[] = [
  base(1, { residentName: '张建国', birthDate: '1970-01-01', registeredAt: '2026-10-28T08:05:00+08:00' }),
  base(2, { residentName: '李翠华', gender: '2', genderText: '女', birthDate: '1978-05-12', visitType: 'FOLLOW_UP', registeredAt: '2026-10-28T08:12:00+08:00' }),
  base(3, { residentName: '王振华', birthDate: '1948-09-30', priority: 1, status: 'CALLED', callCount: 1, calledAt: '2026-10-28T08:40:00+08:00', registeredAt: '2026-10-28T08:20:00+08:00' }),
  base(4, { residentName: '赵秀兰', gender: '2', genderText: '女', birthDate: '1965-11-02', registeredAt: '2026-10-28T08:25:00+08:00' }),
  base(5, { residentName: '陈海涛', birthDate: '1992-07-21', registeredAt: '2026-10-28T08:31:00+08:00', serviceName: '慢病随访门诊' }),
  base(6, { residentName: '周玉梅', gender: '2', genderText: '女', birthDate: '1959-02-08', registeredAt: '2026-10-28T08:36:00+08:00' }),
  base(7, { residentName: '孙立新', birthDate: '1987-12-25', status: 'SUSPENDED', registeredAt: '2026-10-28T08:10:00+08:00' }),
  base(8, { residentName: '吴桂芳', gender: '2', genderText: '女', birthDate: '1955-06-18', status: 'COMPLETED', completedAt: '2026-10-28T08:55:00+08:00', registeredAt: '2026-10-28T07:50:00+08:00' }),
]

const enhanced: EnhancedQueueItem[] = enhanceQueueList(raw).map(item => {
  if (item.registrationId === 'reg-3') {
    return {
      ...item,
      triageLevel: 'LEVEL_1_CRITICAL',
      triageReason: '血压危象 (收缩压 182 mmHg >= 180)',
      vitals: { systolic: 182, diastolic: 104, pulseRate: 96, temperature: 36.8 },
      aiPreConsultation: { chiefComplaintSummary: '头晕伴头痛 2 小时，既往高血压', presentIllnessDraft: '', symptomTags: ['头晕', '头痛'], riskFlags: ['血压危象'] },
      reportSummary: { totalRequested: 3, totalCompleted: 2, hasCriticalValue: false, hasAbnormalValue: true, allReportsReady: false },
    }
  }
  if (item.registrationId === 'reg-2') {
    return {
      ...item,
      triageLevel: 'LEVEL_2_URGENT',
      triageReason: '血压偏高 (152/92 mmHg)',
      vitals: { systolic: 152, diastolic: 92, pulseRate: 78, temperature: 36.5 },
      publicHealthTags: { isChronicContracted: true, chronicType: 'HYPERTENSION', chronicLabel: '高血压签约', followUpOverdue: false },
    }
  }
  if (item.registrationId === 'reg-5') {
    return { ...item, vitals: { systolic: 126, diastolic: 80, pulseRate: 72, temperature: 36.6 }, reportSummary: { totalRequested: 2, totalCompleted: 2, hasCriticalValue: false, hasAbnormalValue: false, allReportsReady: true } }
  }
  return item
})

const context = { organization: { id: 'org-1', name: '示例社区卫生服务中心' }, department: { id: 'dept-1', name: '全科医疗科' } } as ClinicalContext

/** 医生站候诊工作台的演示页：只渲染组件，不访问业务 API；回调均为空操作。 */
export function WaitingWorkspaceSample() {
  useFontSizePreference() // 与应用壳一致：把标准/大字档写入根节点 data-font-size
  const noop = () => undefined
  const resolved = () => Promise.resolve(undefined)
  return <main className="waiting-sample">
    <DedicatedWaitingWorkspace items={enhanced} clinicalContext={context} canEdit busy={false}
      onEnter={noop} onView={noop} onRefresh={noop} onCallItem={resolved} onMissItem={resolved} onRequeueItem={resolved} onSuspendItem={noop} />
  </main>
}
