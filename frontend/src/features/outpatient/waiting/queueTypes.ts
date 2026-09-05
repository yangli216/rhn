import type { ReceptionQueueItem } from '../../../shared/api/schedulingApi'

export type QueueCategory = 'INITIAL' | 'RETURN_VISIT' | 'PRIORITY' | 'SUSPENDED' | 'SKIPPED'

export type QueueTabFilter = 'ALL' | QueueCategory

export type TriageLevel = 'LEVEL_1_CRITICAL' | 'LEVEL_2_URGENT' | 'LEVEL_3_ROUTINE'

export interface VitalsSummary {
  systolic?: number
  diastolic?: number
  temperature?: number
  pulseRate?: number
  spo2?: number
  measuredAt?: string
}

export interface ReportItemSummary {
  id: string
  name: string
  status: 'COMPLETED' | 'PENDING'
  abnormal?: boolean
  critical?: boolean
  summary?: string
}

export interface ReportSummary {
  totalRequested: number
  totalCompleted: number
  hasCriticalValue: boolean
  hasAbnormalValue: boolean
  allReportsReady: boolean
  items?: ReportItemSummary[]
}

export interface AiPreConsultation {
  chiefComplaintSummary: string
  presentIllnessDraft: string
  symptomTags: string[]
  riskFlags: string[]
}

export interface PublicHealthTags {
  isChronicContracted: boolean
  chronicType?: 'HYPERTENSION' | 'DIABETES' | 'COPD' | 'MULTIPLE'
  chronicLabel?: string
  followUpOverdue: boolean
  elderlyExamPending?: boolean
}

export interface EnhancedQueueItem extends ReceptionQueueItem {
  queueCategory: QueueCategory
  queueSortWeight: number
  calledCount: number
  lastCalledAt?: string
  triageLevel: TriageLevel
  triageReason?: string
  vitals?: VitalsSummary
  reportSummary?: ReportSummary
  aiPreConsultation?: AiPreConsultation
  publicHealthTags?: PublicHealthTags
  allergies?: string[]
  pastConditions?: string[]
  currentMedications?: string[]
  recentVisits?: string[]
}

export interface DispatchRuleConfig {
  initialToReturnRatio: number // 每接诊 N 位初诊，穿插 1 位回诊
  priorityFirst: boolean // 优抚与危急绿色通道最高优先级抢占
  skipPostponeSteps: number // 过号顺延步长（默认 3 位）
  voiceEnabled: boolean
  voiceVolume: number // 0.0 - 1.0
}

export interface CallingState {
  activeCallingId: string | null
  callingTicketNo?: string
  callingPatientName?: string
  calledAt?: string
}
