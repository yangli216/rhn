import { useQueries, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { DictionaryValue, RhnApi } from '../../../shared/rhnApi'
import { requireOrganizationDictionary } from '../organizationDictionaryFacts'
import { requirePositions } from '../organizationPersonnelFacts'
import { useOrganizationOptions } from '../organizations/useOrganizationOptions'

export const QUALIFICATION_DICTIONARY = {
  professionalTitle: 'PRACT_PROF_TITLE', practiceCategory: 'PRACT_CATEGORY', antimicrobialLevel: 'BD_ANTIMICROBIAL_LEVEL',
} as const
const CODES = Object.values(QUALIFICATION_DICTIONARY)

/** 人员管理所需目录：组织树、系统枚举、岗位、执业资质字典。 */
export function usePersonnelOptions(api: RhnApi) {
  const organization = useOrganizationOptions(api)
  const positions = useQuery({ queryKey: ['positions', organization.scope], queryFn: async () => requirePositions(await api.organization.positions()) })
  const dictionaryQueries = useQueries({ queries: CODES.map(code => ({
    queryKey: ['dictionary-resolve', code, organization.scope], queryFn: async () => requireOrganizationDictionary(await api.dictionaries.resolve(code)),
    staleTime: 5 * 60_000,
  })) })
  const qualificationDictionaries = useMemo(() => new Map<string, DictionaryValue[]>(CODES.flatMap((code, index) => {
    const query = dictionaryQueries[index]
    return query?.isSuccess && !query.isFetching ? [[code, query.data] as const] : []
  })), [dictionaryQueries])
  return {
    ...organization, positions, qualificationDictionaries,
    reloadAll: async () => { await Promise.allSettled([organization.reload(), positions.refetch(), ...dictionaryQueries.map(query => query.refetch())]) },
  }
}
