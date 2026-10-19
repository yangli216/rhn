import type { ReliefRecord } from '../../../shared/api/reliefApi'
import { formatTime } from '../../../shared/format'

type Column = [title: string, value: (row: ReliefRecord) => string | number | null | undefined]

const COLUMNS: Column[] = [
  ['减免时间', (row) => formatTime(row.occurredAt)],
  ['记录类型', (row) => (row.reversal ? '退费冲销' : '减免')],
  ['结算单号', (row) => row.settlementNo],
  ['原结算单号', (row) => row.originalSettlementNo],
  ['结算状态', (row) => row.settlementStatusText ?? row.settlementStatus],
  ['结算场景', (row) => row.settlementSceneText ?? row.settlementScene],
  ['患者姓名', (row) => row.residentName],
  ['健康档案号', (row) => row.healthRecordNo],
  ['性别', (row) => row.genderText ?? row.gender],
  ['出生日期', (row) => row.birthDate],
  ['政策编码', (row) => row.policyCode],
  ['政策名称', (row) => row.policyName],
  ['政策版本', (row) => row.versionNo],
  ['减免时机', (row) => row.timingText ?? row.timing],
  ['承担主体', (row) => row.sponsorText ?? row.sponsor],
  ['承担方编码', (row) => row.payerCode],
  ['承担方', (row) => row.payerName],
  ['计算基数', (row) => (row.reversal ? '' : row.baseAmount.toFixed(2))],
  ['减免金额', (row) => row.reliefAmount.toFixed(2)],
  ['资格依据', (row) => row.qualificationText],
  ['人工核定', (row) => (row.manual ? '是' : '否')],
  ['核定原因', (row) => row.manualReason],
  ['核定依据', (row) => row.manualEvidence],
  ['核定人', (row) => row.approvedByName],
  ['经办人', (row) => row.operatorName],
]

function cell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? '' : String(value)
  // 以公式字符开头的文本加前缀，避免表格软件按公式执行。
  const safe = /^[=+\-@]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text) ? `'${text}` : text
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** 减免明细 CSV（不含 BOM），列顺序固定，供承担方对账。 */
export function recordsCsv(rows: ReliefRecord[]): string {
  return [COLUMNS.map(([title]) => title).join(','),
    ...rows.map((row) => COLUMNS.map(([, value]) => cell(value(row))).join(','))].join('\r\n')
}
