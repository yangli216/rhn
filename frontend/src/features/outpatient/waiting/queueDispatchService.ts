import type {
  DispatchRuleConfig,
  EnhancedQueueItem,
  QueueTabFilter,
} from './queueTypes'

export const DEFAULT_DISPATCH_RULES: DispatchRuleConfig = {
  initialToReturnRatio: 2, // 2初诊 + 1回诊
  priorityFirst: true, // 优抚绿通及危急优先
  skipPostponeSteps: 3, // 过号顺延3位重排
  voiceEnabled: true,
  voiceVolume: 0.9,
}

export interface NextCandidateResult {
  candidate: EnhancedQueueItem | null
  reason: string
  slotType: 'PRIORITY' | 'RETURN_VISIT' | 'INITIAL' | 'NORMAL'
}

/**
 * 根据多 Tab 筛选与关键词过滤候诊列表
 */
export function filterQueueItems(
  items: EnhancedQueueItem[],
  tab: QueueTabFilter,
  searchQuery: string = ''
): EnhancedQueueItem[] {
  const normalizedQuery = searchQuery.trim().toLowerCase()

  return items.filter((item) => {
    // 1. Tab 类别过滤
    if (tab !== 'ALL') {
      if (item.queueCategory !== tab) return false
    } else {
      // 在 'ALL' 标签页下，排除已过号的患者（过号患者在专属 Tab 中查看）
      if (item.queueCategory === 'SKIPPED') return false
    }

    // 2. 搜索关键词过滤 (支持姓名、排队号、档案号、挂号单号、就诊号)
    if (normalizedQuery) {
      const matchName = item.residentName.toLowerCase().includes(normalizedQuery)
      const matchTicket = item.ticketNo.toLowerCase().includes(normalizedQuery)
      const matchRecord = item.healthRecordNo?.toLowerCase().includes(normalizedQuery)
      const matchRegNo = item.registrationNo?.toLowerCase().includes(normalizedQuery)
      const matchService = item.serviceName?.toLowerCase().includes(normalizedQuery)
      if (!matchName && !matchTicket && !matchRecord && !matchRegNo && !matchService) {
        return false
      }
    }

    return true
  })
}

/**
 * 智能调度算法：计算“下一位推荐呼叫患者”
 * 策略规则：
 * 1. 红色危急预警 (LEVEL_1_CRITICAL) 或 绿色通道 (PRIORITY) 最优先强行插队置顶；
 * 2. 依据 initialToReturnRatio（如 2:1）智能穿插：当已接诊/呼叫 N 位初诊且有回诊报告就绪患者时，推荐回诊；
 * 3. 否则按序号推荐最早候诊的初诊患者。
 */
export function determineNextCallCandidate(
  items: EnhancedQueueItem[],
  rules: DispatchRuleConfig = DEFAULT_DISPATCH_RULES,
  consecutiveInitialCalls: number = 0
): NextCandidateResult {
  // 只在仍处于 WAITING 且未过号的患者中挑选
  const waitingCandidates = items.filter(
    (item) => item.status === 'WAITING' && item.queueCategory !== 'SKIPPED'
  )

  if (waitingCandidates.length === 0) {
    return { candidate: null, reason: '当前没有候诊待呼叫患者', slotType: 'NORMAL' }
  }

  // 1. 检查是否存在红色危急或急救/优抚绿色通道
  if (rules.priorityFirst) {
    const criticalCandidate = waitingCandidates.find((item) => item.triageLevel === 'LEVEL_1_CRITICAL')
    if (criticalCandidate) {
      return {
        candidate: criticalCandidate,
        reason: `危急重症优先通道 (${criticalCandidate.triageReason || '生命体征危急'})`,
        slotType: 'PRIORITY',
      }
    }

    const greenChannelCandidate = waitingCandidates.find((item) => item.queueCategory === 'PRIORITY')
    if (greenChannelCandidate) {
      return {
        candidate: greenChannelCandidate,
        reason: '优抚/高龄绿色通道优先呼叫',
        slotType: 'PRIORITY',
      }
    }
  }

  // 2. 检查回诊穿插：当连续初诊数达到阈值，且有回诊报告全部就绪的患者
  const returnVisitCandidates = waitingCandidates.filter(
    (item) => item.queueCategory === 'RETURN_VISIT' && item.reportSummary?.allReportsReady
  )

  if (consecutiveInitialCalls >= rules.initialToReturnRatio && returnVisitCandidates.length > 0) {
    // 推荐回诊队列中排在最前的一位
    return {
      candidate: returnVisitCandidates[0],
      reason: `回诊穿插调度 (已接诊 ${consecutiveInitialCalls} 位初诊，轮换呼叫报告就绪回诊)`,
      slotType: 'RETURN_VISIT',
    }
  }

  // 3. 优先推荐初诊待诊中的第一位
  const initialCandidates = waitingCandidates.filter((item) => item.queueCategory === 'INITIAL')
  if (initialCandidates.length > 0) {
    return {
      candidate: initialCandidates[0],
      reason: `顺位初诊候诊 (第 ${initialCandidates[0].sequenceNo} 号)`,
      slotType: 'INITIAL',
    }
  }

  // 4. 若无初诊但有普通回诊，推荐回诊
  if (waitingCandidates.length > 0) {
    return {
      candidate: waitingCandidates[0],
      reason: '常规顺位排队',
      slotType: 'NORMAL',
    }
  }

  return { candidate: null, reason: '暂无候诊患者', slotType: 'NORMAL' }
}

/**
 * 语音播报叫号服务 (使用浏览器标准 Web Speech API)
 */
export function announceQueueCall(
  ticketNo: string,
  patientName: string,
  roomName: string = '1号诊室',
  options: { enabled?: boolean; volume?: number } = {}
): void {
  if (options.enabled === false) return

  if (
    typeof window === 'undefined' ||
    !('speechSynthesis' in window) ||
    typeof SpeechSynthesisUtterance === 'undefined'
  ) {
    return
  }

  try {
    // 停止先前的播报
    window.speechSynthesis.cancel()

    // 格式化文本：例如 "请 A-003 号 李翠华 到 1号诊室 就诊"
    const text = `请 ${ticketNo} 号 ${patientName} 到 ${roomName} 就诊`
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'
    utterance.rate = 0.95
    utterance.pitch = 1.0
    utterance.volume = options.volume ?? 0.9

    // 寻找优质中文女声/标准语音
    const voices = window.speechSynthesis.getVoices()
    const zhVoice = voices.find((v) => v.lang.includes('zh') || v.lang.includes('cmn') || v.name.includes('Chinese'))
    if (zhVoice) {
      utterance.voice = zhVoice
    }

    window.speechSynthesis.speak(utterance)
  } catch (error) {
    console.warn('语音叫号播报异常:', error)
  }
}
