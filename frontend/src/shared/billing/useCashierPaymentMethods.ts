import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ClinicalContext } from '../clinical/workContext'
import type { RhnApi } from '../rhnApi'
import { requirePaymentRounding } from './roundAmount'

export function useCashierPaymentMethods(api: RhnApi, context: ClinicalContext) {
  const query = useQuery({
    queryKey: ['applicable-dictionary-items', 'PAY_METHOD', 'AVAILABLE_SCENE', 'CASHIER',
      context.organization.id, context.department.id],
    queryFn: async () => {
      const items = await api.dictionaries.applicable('PAY_METHOD', 'AVAILABLE_SCENE', 'CASHIER')
      if (!Array.isArray(items) || items.some((item) => !item
        || typeof item.code !== 'string' || !item.code.trim()
        || typeof item.name !== 'string' || !item.name.trim())
        || new Set(items.map((item) => item.code)).size !== items.length) {
        throw new Error('支付方式配置返回无效，请重新加载或联系管理员')
      }
      for (const item of items) {
        if (item.code !== 'MEDICAL_INSURANCE') {
          requirePaymentRounding(item.attributes?.PAYMENT_PRECISION, item.attributes?.ROUNDING_MODE)
        }
      }
      return items
    },
  })
  const options = useMemo(() => query.isSuccess ? (query.data ?? [])
    .filter((item) => item.code !== 'MEDICAL_INSURANCE')
    .map((item) => ({ code: item.code, name: item.name, sortOrder: item.sortOrder,
      precision: item.attributes?.PAYMENT_PRECISION, roundingMode: item.attributes?.ROUNDING_MODE })) : [],
  [query.data, query.isSuccess])
  const status = query.isError ? 'error' : query.isPending ? 'loading' : 'ready'
  return { ...query, options, status } as const
}
