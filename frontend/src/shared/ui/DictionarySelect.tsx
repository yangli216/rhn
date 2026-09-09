import { useQuery } from '@tanstack/react-query'
import { useId, useMemo } from 'react'
import { errorMessage, type RhnApi } from '../rhnApi'
import {
  Select,
  type SelectMultipleProps,
  type SelectOption,
  type SelectProps,
  type SelectSingleProps,
} from './Select'

type DictionaryOptionsApi = Pick<RhnApi['dictionaries'], 'get' | 'resolve'>

type DictionarySource =
  | { dictionaryCode: string; dictionaryId?: never }
  | { dictionaryId: string; dictionaryCode?: never }

type DictionarySelectBaseProps = DictionarySource & {
  api: DictionaryOptionsApi
  errorText?: string
}

export type DictionarySelectProps = DictionarySelectBaseProps & (
  | Omit<SelectSingleProps, 'options' | 'loading' | 'loadingText' | 'searchable' | 'pinyinSearch' | 'showValue'>
  | Omit<SelectMultipleProps, 'options' | 'loading' | 'loadingText' | 'searchable' | 'pinyinSearch' | 'showValue'>
)

export function DictionarySelect(props: DictionarySelectProps) {
  const {
    api,
    dictionaryCode,
    dictionaryId,
    errorText,
    disabled,
    'aria-describedby': ariaDescribedBy,
    ...selectProps
  } = props
  const generatedId = useId()
  const sourceType = dictionaryCode ? 'code' : 'id'
  const sourceValue = dictionaryCode ?? dictionaryId
  const messageId = `${selectProps.id ?? generatedId}-dictionary-message`
  const dictionary = useQuery({
    queryKey: ['dictionary-options', sourceType, sourceValue],
    queryFn: async () => {
      if (dictionaryCode) return api.resolve(dictionaryCode)
      const detail = await api.get(dictionaryId!)
      if (detail.sdDictStatus !== 'ACTIVE') return []
      const codeById = new Map(detail.items.map((item) => [item.id, item.code]))
      return detail.items
        .filter((item) => item.sdDictItemStatus === 'ACTIVE')
        .map(({ code, name, sortOrder, parentItemId, parentItemCode }) => ({
          code, name, sortOrder, parentCode: parentItemCode ?? codeById.get(parentItemId ?? ''),
        }))
    },
    enabled: Boolean(sourceValue),
    staleTime: 5 * 60 * 1000,
  })
  const options = useMemo<SelectOption[]>(() => (dictionary.data ?? [])
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder || left.code.localeCompare(right.code))
    .map((item) => ({ value: item.code, label: item.name, parentValue: item.parentCode })), [dictionary.data])
  const message = dictionary.error ? (errorText ?? errorMessage(dictionary.error)) : ''
  const describedBy = [ariaDescribedBy, message ? messageId : ''].filter(Boolean).join(' ') || undefined
  const configuredProps = {
    ...selectProps,
    options,
    searchable: true,
    pinyinSearch: true,
    showValue: true,
    loading: dictionary.isFetching,
    loadingText: '正在加载字典项…',
    disabled: disabled || dictionary.isError || !sourceValue,
    'aria-describedby': describedBy,
    'aria-invalid': message ? true : selectProps['aria-invalid'],
  } as SelectProps

  return <div className="ui-dictionary-select">
    <Select {...configuredProps} />
    {message && <div id={messageId} className="ui-dictionary-select__error" role="alert">
      <span>{message}</span>
      <button type="button" onClick={() => dictionary.refetch()}>重新加载</button>
    </div>}
  </div>
}
