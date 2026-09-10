import type { ReceptionQueueItem } from '../../../shared/api/schedulingApi'
import type { EnhancedQueueItem, QueueCategory, TriageLevel, VitalsSummary } from './queueTypes'

function calculateTriage(vitals: VitalsSummary | undefined, isEmergency: boolean): { level: TriageLevel; reason?: string } {
  if (isEmergency) {
    return { level: 'LEVEL_1_CRITICAL', reason: '绿色急救通道登记' }
  }
  if (vitals?.systolic && vitals.systolic >= 180) {
    return { level: 'LEVEL_1_CRITICAL', reason: `血压危象 (收缩压 ${vitals.systolic} mmHg >= 180)` }
  }
  if (vitals?.diastolic && vitals.diastolic >= 110) {
    return { level: 'LEVEL_1_CRITICAL', reason: `舒张压危急 (${vitals.diastolic} mmHg >= 110)` }
  }
  if (vitals?.pulseRate && (vitals.pulseRate > 130 || vitals.pulseRate < 45)) {
    return { level: 'LEVEL_1_CRITICAL', reason: `心率严重异常 (${vitals.pulseRate} 次/分)` }
  }
  if (vitals?.spo2 && vitals.spo2 < 93) {
    return { level: 'LEVEL_1_CRITICAL', reason: `血氧饱和度过低 (${vitals.spo2}%)` }
  }
  if (vitals?.temperature && vitals.temperature >= 38.5) {
    return { level: 'LEVEL_2_URGENT', reason: `高热 (${vitals.temperature}℃ >= 38.5)` }
  }
  if (vitals?.systolic && vitals.systolic >= 150) {
    return { level: 'LEVEL_2_URGENT', reason: `血压偏高 (${vitals.systolic}/${vitals.diastolic} mmHg)` }
  }
  return { level: 'LEVEL_3_ROUTINE' }
}

export function enhanceQueueItem(rawItem: ReceptionQueueItem): EnhancedQueueItem {
  const birthYear = rawItem.birthDate ? Number.parseInt(rawItem.birthDate.slice(0, 4), 10) : Number.NaN
  const age = Number.isFinite(birthYear) ? Math.max(1, new Date().getFullYear() - birthYear) : undefined

  let queueCategory: QueueCategory
  if (rawItem.status === 'COMPLETED') {
    queueCategory = 'COMPLETED'
  } else if (rawItem.status === 'SUSPENDED') {
    queueCategory = 'SUSPENDED'
  } else if (rawItem.status === 'MISSED') {
    queueCategory = 'SKIPPED'
  } else if (rawItem.priority > 0 || (age != null && age >= 75)
    || rawItem.registrationSource === 'EMERGENCY' || rawItem.visitType === 'EMERGENCY') {
    queueCategory = 'PRIORITY'
  } else if (rawItem.visitType === 'FOLLOW_UP') {
    queueCategory = 'RETURN_VISIT'
  } else {
    queueCategory = 'INITIAL'
  }

  const isEmergency = rawItem.registrationSource === 'EMERGENCY' || rawItem.visitType === 'EMERGENCY'
  const triage = calculateTriage(undefined, isEmergency)

  let queueSortWeight = 1000 - rawItem.sequenceNo
  if (queueCategory === 'PRIORITY') queueSortWeight += 2000
  if (triage.level === 'LEVEL_1_CRITICAL') queueSortWeight += 5000
  if (triage.level === 'LEVEL_2_URGENT') queueSortWeight += 1000
  if (queueCategory === 'SKIPPED') queueSortWeight -= 500

  return {
    ...rawItem,
    queueCategory,
    queueSortWeight,
    calledCount: rawItem.callCount ?? 0,
    lastCalledAt: rawItem.calledAt,
    triageLevel: triage.level,
    triageReason: triage.reason,
  }
}

export function enhanceQueueList(items: ReceptionQueueItem[]): EnhancedQueueItem[] {
  return items.map(enhanceQueueItem)
}
