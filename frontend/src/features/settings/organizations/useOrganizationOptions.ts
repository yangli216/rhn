import { useQueries, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { ORGANIZATION_DICTIONARY, type RhnApi } from '../../../shared/rhnApi'
import { requireOrganizationDictionary } from '../organizationDictionaryFacts'
import { requireOrganizationEnums } from '../organizationFormOptions'
import { requireOrganizationUnits } from '../organizationPersonnelFacts'
import { organizationQueryScope } from '../organizationQueryScope'

const DICTIONARY_CODES = Object.values(ORGANIZATION_DICTIONARY)

/** 组织目录、系统枚举与组织字典。未确认（加载中或失败）的字典不进入 Map，表单据此禁用依赖它的操作。 */
export function useOrganizationOptions(api: RhnApi) {
  const scope = organizationQueryScope(api)
  const units = useQuery({ queryKey: ['organization-units', scope], queryFn: async () => requireOrganizationUnits(await api.organization.tree()) })
  const systemEnums = useQuery({
    queryKey: ['dictionary-system-enums', scope], queryFn: async () => requireOrganizationEnums(await api.dictionaries.systemEnums()), staleTime: Infinity,
  })
  const dictionaryQueries = useQueries({ queries: DICTIONARY_CODES.map((code) => ({
    queryKey: ['dictionary-resolve', code, scope], queryFn: async () => requireOrganizationDictionary(await api.dictionaries.resolve(code)), staleTime: 5 * 60_000,
  })) })
  const dictionaries = useMemo(() => new Map(DICTIONARY_CODES.flatMap((code, index) => {
    const query = dictionaryQueries[index]
    return query?.isSuccess && !query.isFetching ? [[code, query.data] as const] : []
  })), [dictionaryQueries])
  const unitsReady = units.isSuccess && !units.isFetching
  return {
    scope, units, unitsReady, dictionaries,
    enums: systemEnums.isSuccess && !systemEnums.isFetching ? systemEnums.data : undefined,
    reload: async () => { await Promise.allSettled([units.refetch(), systemEnums.refetch(), ...dictionaryQueries.map(query => query.refetch())]) },
  }
}
