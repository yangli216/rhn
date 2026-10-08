import { useQuery } from '@tanstack/react-query'
import type { RhnApi } from '../../../shared/rhnApi'
import type { SkinTestWorkItem } from '../../../shared/api/treatmentApi'
import { Button, Select } from '../../../shared/ui'

export interface SkinTestWorklistState {
  data?: SkinTestWorkItem[]
  isPending?: boolean
  isError?: boolean
  refetch?: () => unknown
}

export function SkinTestWorklistStatus({ query }: { query?: SkinTestWorklistState }) {
  if (query?.isError) return <span role="alert">当前就诊皮试结果查询失败，尚未核验
    {query.refetch && <Button size="sm" variant="secondary" onClick={() => void query.refetch?.()}>重试就诊皮试结果</Button>}
  </span>
  if (query?.isPending || !query?.data) return <span role="status">当前就诊皮试结果尚未核验</span>
  return null
}

export function useSkinTestHistory(api: RhnApi | undefined, organizationId: string | undefined,
  residentId: string | undefined, medicationId: string | undefined, validityHours: number | undefined, required: boolean) {
  const configured = Number.isInteger(validityHours) && Number(validityHours) >= 1 && Number(validityHours) <= 8760
  const available = Boolean(api && organizationId && residentId && medicationId)
  const query = useQuery({
    queryKey: ['recent-negative-skin-test', organizationId, residentId, medicationId, validityHours],
    enabled: required && configured && available,
    retry: false,
    queryFn: async () => {
      if (!api || !residentId || !medicationId) throw new Error('缺少皮试查询上下文')
      const records = await api.treatments.validNegativeSkinTests(residentId, medicationId, validityHours)
      if (!Array.isArray(records) || records.some((record) => !record || record.status !== 'NEGATIVE'
        || !record.eventId || record.residentId !== residentId || record.medicationId !== medicationId)) {
        throw new Error('皮试历史查询返回数据异常')
      }
      return records
    },
  })
  return { query, configured, available,
    item: configured && available && query.isSuccess && !query.isFetching
      ? query.data.find((record) => record.status === 'NEGATIVE' && record.eventId) : undefined }
}

export function SkinTestHistoryStatus({ history }: { history: ReturnType<typeof useSkinTestHistory> }) {
  if (!history.configured) return <span role="status">皮试结果有效期未配置，无法核验历史阴性结果</span>
  if (!history.available) return <span role="status">皮试历史查询条件不完整，尚未核验</span>
  if (history.query.isFetching || history.query.isPending) return <span role="status">正在核验历史皮试结果…</span>
  if (history.query.isError) return <span role="alert">
    皮试历史查询失败，尚未核验
    <Button size="sm" variant="secondary" onClick={() => void history.query.refetch()}>重试皮试历史</Button>
  </span>
  if (!history.item) return <span role="status">未查到有效历史阴性凭据</span>
  return null
}

const exemptionReasons = ['周期内已有阴性结果（有效时间内）', '同批号连续用药', '外院有效皮试结果证明',
  '患者既往近期规则耐受使用', '其他临床裁量免试']

export function SkinTestExemptionReasonSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const reasons = value && !exemptionReasons.includes(value) ? [value, ...exemptionReasons] : exemptionReasons
  return <Select aria-label="免试原因" placeholder="请选择免试原因" value={value}
    options={reasons.map((reason) => ({ value: reason, label: reason }))}
    searchable={false} clearable={false} onChange={onChange} />
}
