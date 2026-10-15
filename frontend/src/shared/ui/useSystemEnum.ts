import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { RhnApi } from '../rhnApi'

/**
 * Items and names of a code-defined system enum. Screens take option lists and labels from here (or from the
 * server-translated `xxxText` response fields) instead of keeping their own Chinese copies of the enum.
 */
export function useSystemEnum(api: Pick<RhnApi['dictionaries'], 'systemEnum'>, code: string) {
  const query = useQuery({
    queryKey: ['system-enum', code],
    queryFn: () => api.systemEnum(code),
    staleTime: Infinity,
  })
  return useMemo(() => {
    const items = (query.data?.items ?? []).slice().sort((left, right) => left.sortOrder - right.sortOrder)
    const names = new Map(items.map((item) => [item.code, item.name]))
    return {
      items,
      options: items.map((item) => ({ value: item.code, label: item.name })),
      name: (value: string) => names.get(value) ?? value,
      ready: query.isSuccess,
      error: query.error,
    }
  }, [query.data, query.error, query.isSuccess])
}
