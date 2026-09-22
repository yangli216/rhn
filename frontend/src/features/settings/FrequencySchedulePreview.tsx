import { useRef, useState } from 'react'
import type { OrderFrequencySchedulePreview } from '../../shared/api/masterDataApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, Button, StatusBadge } from '../../shared/ui'

/** Display only a result for the exact current input. Late responses never replace a newer draft. */
export function FrequencySchedulePreview({ inputKey, load }: { inputKey: string; load: () => Promise<OrderFrequencySchedulePreview> }) {
  const latest = useRef(inputKey); latest.current = inputKey
  const sequence = useRef(0)
  const [response, setResponse] = useState<{ key: string; value?: OrderFrequencySchedulePreview; error?: string }>()
  const [busy, setBusy] = useState(false)
  const current = response?.key === inputKey ? response : undefined
  const run = async () => {
    const key = inputKey, id = ++sequence.current; setBusy(true); setResponse(undefined)
    try { const value = await load(); if (latest.current === key && id === sequence.current) setResponse({ key, value }) }
    catch (e) { if (latest.current === key && id === sequence.current) setResponse({ key, error: errorMessage(e) }) }
    finally { if (id === sequence.current) setBusy(false) }
  }
  const result = current?.value
  return <section aria-label="当前频次结构预演">
    <Button variant="secondary" size="sm" disabled={busy} onClick={() => void run()}>{busy ? '正在预演…' : '预演当前内容（最多 8 个时点）'}</Button>
    {!current && <p>预演使用当前填写的结构与时点，不保存配置、不创建执行任务。修改内容后需重新预演。</p>}
    {current?.error && <Alert tone="error">{current.error}</Alert>}
    {result && <><p><StatusBadge tone={result.capability?.status === 'SUPPORTED' ? 'info' : 'warning'}>{result.capability?.status === 'SUPPORTED' ? '可生成结构化示例' : '当前不生成确定性计划'}</StatusBadge></p><p>{result.explanation}</p>
      {result.standard && <p>{result.standard.interpretation.dailyRateComputable ? `平均频率：${result.standard.interpretation.doses} 次 / ${result.standard.interpretation.perDays} 天。平均量不是任意一天或任意 24 小时的最大给药量。` : '不具备固定平均日频率；不能用零代替。'}</p>}
      {!!result.plannedTimes.length && <ol>{result.plannedTimes.map((time, index) => <li key={`${time}-${index}`}>{time.replace('T', ' ')}</li>)}</ol>}
      {!result.plannedTimes.length && <p>未返回执行时点，请根据上述原因补充标准定义或使用相应业务流程。</p>}
    </>}
  </section>
}
