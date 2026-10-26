import { useEffect, useState, type FormEvent } from 'react'
import type {
  DictionarySummary,
  ItemAttributeConfiguration,
  ItemAttributeDataType,
  ItemAttributeDefinitionConfiguration,
  ItemAttributeDefinitionInput,
  RhnApi,
} from '../../../shared/rhnApi'
import { Button, Dialog, FormField, Select } from '../../../shared/ui'
import {
  buildSchema,
  contextOptions,
  dataTypeOptions,
  parseConfiguredValue,
  rawValue,
  schemaEnum,
  schemaKeyword,
  schemaNullable,
  scopeOptions,
  variabilityOptions,
  stripCode,
  type Scope,
} from './attributeConfigurationUtils'

export function AttributeDefinitionDialog({
  api,
  configuration,
  dictionaries,
  value,
  onClose,
  onSaved,
  onError,
}: {
  api: RhnApi
  configuration?: ItemAttributeConfiguration
  dictionaries: DictionarySummary[]
  value?: ItemAttributeDefinitionConfiguration
  onClose: () => void
  onSaved: () => Promise<void>
  onError: (error: unknown) => void
}) {
  const [dataType, setDataType] = useState<ItemAttributeDataType>(value?.dataType ?? 'TEXT')
  const [cardinality, setCardinality] = useState<'SINGLE' | 'MULTIPLE'>(value?.cardinality ?? 'SINGLE')
  const [variability, setVariability] = useState<ItemAttributeDefinitionInput['variability']>(value?.variability ?? 'BASE_ONLY')
  const [contextBasis, setContextBasis] = useState<ItemAttributeDefinitionInput['contextBasis']>(value?.contextBasis ?? 'NONE')
  const [sensitivity, setSensitivity] = useState(value?.sensitivity ?? 'NORMAL')
  const [dictionaryId, setDictionaryId] = useState(value?.dictionaryId ?? '')
  const [allowedScopes, setAllowedScopes] = useState<Scope[]>(value?.allowedScopes ?? [])
  const [nullable, setNullable] = useState(schemaNullable(value?.schema))
  const [enumValues, setEnumValues] = useState(schemaEnum(value?.schema).join('、'))
  const [minimum, setMinimum] = useState(schemaKeyword(value?.schema, 'minimum'))
  const [maximum, setMaximum] = useState(schemaKeyword(value?.schema, 'maximum'))
  const [maxLength, setMaxLength] = useState(schemaKeyword(value?.schema, 'maxLength'))
  const [defaultRaw, setDefaultRaw] = useState(rawValue(value?.defaultValue, cardinality))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (variability === 'BASE_ONLY') setAllowedScopes([])
    else if (!allowedScopes.length) setAllowedScopes(['TENANT', 'ORGANIZATION', 'DEPARTMENT'])
  }, [variability]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (dataType !== 'DICT_REF') setDictionaryId('')
  }, [dataType])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    try {
      const form = new FormData(event.currentTarget)
      const schema = buildSchema(dataType, cardinality, nullable, enumValues, minimum, maximum, maxLength)
      const input: ItemAttributeDefinitionInput = {
        code: String(form.get('code') || '').trim().toUpperCase(),
        name: String(form.get('name') || '').trim(),
        description: String(form.get('description') || '').trim(),
        dataType,
        cardinality,
        dictionaryId: dictionaryId || undefined,
        unitCode: String(form.get('unitCode') || '').trim() || undefined,
        schema,
        defaultValue: parseConfiguredValue(defaultRaw, dataType, cardinality),
        variability,
        overridePolicy: variability === 'SCOPE_OVERRIDE' ? 'ANY' : 'NO_OVERRIDE',
        allowedScopes,
        contextBasis,
        sensitivity,
        reason: String(form.get('reason') || '').trim(),
        requestCode: crypto.randomUUID(),
      }
      if (value) {
        await api.masterData.updateItemAttributeDefinition(value.id, value.revision, stripCode(input))
      } else {
        await api.masterData.createItemAttributeDefinition(input)
      }
      await onSaved()
    } catch (error) {
      onError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      title={value ? '编辑属性定义' : '新增租户属性'}
      eyebrow="基础数据 · 元数据扩展"
      size="xwide"
      description="核心业务字段仍使用强类型表；这里仅配置低频、差异化、可继承的长尾属性。"
      onClose={onClose}
    >
      <form className="attribute-config-form" onSubmit={submit}>
        <section>
          <header>
            <h3>属性身份</h3>
            <p>租户编码命名空间由平台固定，创建后属性编码不可修改。</p>
          </header>
          <div className="attribute-config-form__grid">
            <FormField
              label="属性编码"
              required
              hint={`必须以 ${configuration?.tenantNamespace ?? 'TNT.<TENANT>.'} 开头`}
            >
              <input
                name="code"
                defaultValue={value?.code ?? configuration?.tenantNamespace}
                disabled={Boolean(value)}
                required
              />
            </FormField>
            <FormField label="属性名称" required>
              <input name="name" defaultValue={value?.name} required />
            </FormField>
            <FormField label="属性说明" required className="span-2">
              <textarea name="description" defaultValue={value?.description} rows={2} required />
            </FormField>
          </div>
        </section>

        <section>
          <header>
            <h3>数据约束</h3>
            <p>使用结构化选项生成受控 Schema，不需要直接编辑 JSON。</p>
          </header>
          <div className="attribute-config-form__grid attribute-config-form__grid--4">
            <FormField label="数据类型" required>
              <Select
                value={dataType}
                onChange={(item) => setDataType(item as ItemAttributeDataType)}
                options={dataTypeOptions}
              />
            </FormField>
            <FormField label="基数" required>
              <Select
                value={cardinality}
                onChange={(item) => setCardinality(item as 'SINGLE' | 'MULTIPLE')}
                options={[
                  { value: 'SINGLE', label: '单值' },
                  { value: 'MULTIPLE', label: '多值' },
                ]}
              />
            </FormField>
            <FormField label="单位编码">
              <input name="unitCode" defaultValue={value?.unitCode} placeholder="如 mg、mL、°C" />
            </FormField>
            <FormField label="敏感级别">
              <Select
                value={sensitivity}
                onChange={setSensitivity}
                options={[
                  { value: 'NORMAL', label: '普通' },
                  { value: 'SENSITIVE', label: '敏感' },
                  { value: 'MEDICAL_SAFETY', label: '医疗安全' },
                  { value: 'PRIVACY', label: '隐私' },
                ]}
              />
            </FormField>
            {dataType === 'DICT_REF' && (
              <FormField label="引用字典" required className="span-2">
                <Select
                  value={dictionaryId}
                  onChange={setDictionaryId}
                  options={dictionaries.map((item) => ({
                    value: item.id,
                    label: item.name,
                    secondaryText: item.code,
                  }))}
                />
              </FormField>
            )}
            {dataType === 'ENUM' && (
              <FormField label="枚举选项" required className="span-2" hint="使用顿号、逗号或换行分隔">
                <textarea value={enumValues} onChange={(event) => setEnumValues(event.target.value)} rows={2} />
              </FormField>
            )}
            {['INTEGER', 'DECIMAL'].includes(dataType) && (
              <>
                <FormField label="最小值">
                  <input type="number" value={minimum} onChange={(event) => setMinimum(event.target.value)} />
                </FormField>
                <FormField label="最大值">
                  <input type="number" value={maximum} onChange={(event) => setMaximum(event.target.value)} />
                </FormField>
              </>
            )}
            {['TEXT', 'ENUM', 'DICT_REF'].includes(dataType) && (
              <FormField label="最大长度">
                <input
                  type="number"
                  min="1"
                  value={maxLength}
                  onChange={(event) => setMaxLength(event.target.value)}
                />
              </FormField>
            )}
            <FormField label="空值策略">
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={nullable}
                  onChange={(event) => setNullable(event.target.checked)}
                />
                <span>允许显式空值覆盖</span>
              </label>
            </FormField>
            <FormField
              label="定义默认值"
              className="span-2"
              hint={cardinality === 'MULTIPLE' ? '多个值用顿号或逗号分隔' : undefined}
            >
              <input
                value={defaultRaw}
                onChange={(event) => setDefaultRaw(event.target.value)}
                placeholder="可不设置，继承未定义时生效"
              />
            </FormField>
          </div>
        </section>

        <section>
          <header>
            <h3>继承与业务上下文</h3>
            <p>解析顺序固定为科室、机构、租户、公共值和系统默认值。</p>
          </header>
          <div className="attribute-config-form__grid">
            <FormField label="可变性" required>
              <Select
                value={variability}
                onChange={(item) => setVariability(item as ItemAttributeDefinitionInput['variability'])}
                options={variabilityOptions}
              />
            </FormField>
            <FormField label="上下文依据" required>
              <Select
                value={contextBasis}
                onChange={(item) => setContextBasis(item as ItemAttributeDefinitionInput['contextBasis'])}
                options={contextOptions}
              />
            </FormField>
            {variability !== 'BASE_ONLY' && (
              <FormField label="允许作用域" required className="span-2">
                <div className="attribute-scope-options">
                  {scopeOptions.map(({ value: scope, label }) => (
                    <label key={scope}>
                      <input
                        type="checkbox"
                        checked={allowedScopes.includes(scope)}
                        onChange={(event) =>
                          setAllowedScopes((current) =>
                            event.target.checked
                              ? [...new Set([...current, scope])]
                              : current.filter((item) => item !== scope)
                          )
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </FormField>
            )}
          </div>
        </section>

        <FormField label="变更原因" required hint="写入追加式配置审计">
          <input
            name="reason"
            defaultValue={value ? '调整租户属性定义' : '新增租户扩展属性'}
            required
          />
        </FormField>
        <div className="ui-form-actions">
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" busy={busy}>
            {value ? '保存定义' : '创建属性'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
