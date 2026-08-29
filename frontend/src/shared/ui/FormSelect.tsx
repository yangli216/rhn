import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form'
import { Select, type SelectSingleProps } from './Select'

export function FormSelect<TFieldValues extends FieldValues>({
  control,
  name,
  ...selectProps
}: {
  control: Control<TFieldValues>
  name: FieldPath<TFieldValues>
} & Omit<SelectSingleProps, 'name' | 'value' | 'onChange'>) {
  return <Controller control={control} name={name} render={({ field }) => <Select
    {...selectProps}
    name={field.name}
    value={field.value == null ? '' : String(field.value)}
    onChange={(value) => field.onChange(value)}
  />} />
}
