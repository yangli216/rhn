import type { ReliefRosterImportRow } from '../../../shared/api/reliefApi'

export const ROSTER_IMPORT_LIMIT = 2000
export const ROSTER_TEMPLATE = '证件类型,证件号码,姓名,生效日期,失效日期,依据编号,依据说明\nNATIONAL_ID,110101199001011234,张三,2026-01-01,2026-12-31,QY-0001,家庭医生签约\n'

const headers: Record<string, keyof ReliefRosterImportRow> = {
  证件类型: 'identifierType', 证件号码: 'identifierValue', 身份证号: 'identifierValue', 姓名: 'residentName',
  生效日期: 'effectiveFrom', 失效日期: 'effectiveTo', 依据编号: 'evidenceNo', 依据说明: 'evidence',
}
/** 无表头时的列顺序。 */
const positional: Array<keyof ReliefRosterImportRow> = ['identifierValue', 'residentName', 'effectiveFrom', 'effectiveTo', 'evidenceNo', 'evidence']

/** 拆分一行 CSV/制表符文本，支持双引号包裹与转义。 */
export function splitLine(line: string): string[] {
  const delimiter = line.includes('\t') && !line.includes(',') ? '\t' : ','
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (let index = 0; index < line.length; index++) {
    const char = line[index]
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') { current += '"'; index++ }
      else if (char === '"') quoted = false
      else current += char
    } else if (char === '"' && !current.trim()) quoted = true
    else if (char === delimiter) { cells.push(current.trim()); current = '' }
    else current += char
  }
  cells.push(current.trim())
  return cells
}

/** 统一为 YYYY-MM-DD；无法识别时原样返回，交由服务端校验并逐行报告。 */
export function normalizeDate(value: string) {
  const match = value.trim().match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/)
  if (!match) return value.trim()
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

export interface ParsedRoster {
  rows: ReliefRosterImportRow[]
  errors: string[]
}

export function parseRosterText(text: string, defaultFrom: string): ParsedRoster {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map((line) => line.trimEnd())
  const errors: string[] = []
  const firstIndex = lines.findIndex((line) => line.trim())
  if (firstIndex < 0) return { rows: [], errors: ['未读取到名单内容'] }
  const first = splitLine(lines[firstIndex])
  const hasHeader = first.some((cell) => cell in headers)
  const columns = hasHeader ? first.map((cell) => headers[cell]) : positional
  if (hasHeader && !columns.includes('identifierValue')) errors.push('表头缺少“证件号码”列')
  const rows: ReliefRosterImportRow[] = []
  lines.forEach((line, index) => {
    if (index < firstIndex || (hasHeader && index === firstIndex) || !line.trim()) return
    const cells = splitLine(line)
    const row: ReliefRosterImportRow = { rowNo: index + 1 }
    columns.forEach((key, column) => {
      const value = cells[column]?.trim()
      if (!key || !value) return
      if (key === 'effectiveFrom' || key === 'effectiveTo') row[key] = normalizeDate(value)
      else if (key !== 'rowNo') row[key] = value
    })
    if (!row.effectiveFrom) row.effectiveFrom = defaultFrom
    for (const [key, label] of [['effectiveFrom', '生效日期'], ['effectiveTo', '失效日期']] as const) {
      const value = row[key]
      if (value && !isIsoDate(value)) errors.push(`第 ${index + 1} 行${label}“${value}”不是有效日期`)
    }
    rows.push(row)
  })
  if (!rows.length && !errors.length) errors.push('未读取到名单数据行')
  if (rows.length > ROSTER_IMPORT_LIMIT) errors.push(`单次最多导入 ${ROSTER_IMPORT_LIMIT} 行，当前 ${rows.length} 行，请拆分后导入`)
  return { rows, errors }
}
