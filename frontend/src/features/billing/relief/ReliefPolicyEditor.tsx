import type { RhnApi } from '../../../shared/rhnApi'
import type { ReliefPolicy } from '../../../shared/api/reliefApi'
import { reliefStatusTone } from '../../../shared/presentation'
import { formatTime } from '../../../shared/format'
import {
  Button, ClinicalResourceSearch, DataTable, DatePicker, DictionarySelect, EditableCell, EditableRow, EditableTable,
  FormField, PanelHead, Select, StatusBadge, Switch, tableCellClass,
} from '../../../shared/ui'
import type { useSystemEnum } from '../../../shared/ui/useSystemEnum'
import {
  emptyQualification, emptyRule, ruleSummary,
  type FeeScope, type PolicyForm, type QualificationForm, type RuleForm,
} from './reliefPolicyForm'

export type ReliefEnums = Record<'timing' | 'sponsor' | 'scene' | 'feeScope' | 'method' | 'source' | 'failure' | 'quotaPeriod'
  | 'chargeSource' | 'qualificationMode', ReturnType<typeof useSystemEnum>>

export const ACCOUNTING_CATEGORY_DICTIONARY = 'BD_ACCOUNTING_CATEGORY'
export const QUALIFICATION_TYPE_DICTIONARY = 'BIL_RELIEF_QUALIF_TYPE'
const genderOptions = [{ value: '1', label: '男' }, { value: '2', label: '女' }]

interface EditorProps {
  api: RhnApi
  form: PolicyForm
  enums: ReliefEnums
  disabled: boolean
  creating: boolean
  onChange: (next: PolicyForm) => void
}

const boolOptions = (yes: string, no: string) => [{ value: 'true', label: yes }, { value: 'false', label: no }]

export function ReliefBasicSection({ form, enums, disabled, creating, onChange }: EditorProps) {
  const set = <K extends keyof PolicyForm>(key: K, value: PolicyForm[K]) => onChange({ ...form, [key]: value })
  return <>
    <section className="relief-editor__section" aria-label="政策信息">
      <PanelHead title="政策信息" />
      <div className="ui-page-template__fields">
        <FormField label="政策编码" required hint={creating ? '创建后不可修改' : undefined}>
          <input value={form.code} disabled={disabled || !creating} maxLength={64}
            onChange={(event) => set('code', event.target.value)} />
        </FormField>
        <FormField label="政策名称" required>
          <input value={form.name} disabled={disabled} maxLength={128} onChange={(event) => set('name', event.target.value)} />
        </FormField>
        <FormField label="政策说明">
          <input value={form.description} disabled={disabled} maxLength={512}
            onChange={(event) => set('description', event.target.value)} />
        </FormField>
      </div>
    </section>
    <section className="relief-editor__section" aria-label="减免时机与承担">
      <PanelHead title="减免时机与承担" />
      <div className="ui-page-template__fields">
        <FormField label="减免时机" required
          hint={form.timing === 'PRE_INSURANCE' ? '先减免再按折后金额医保结算' : '医保结算后对个人负担部分减免'}>
          <Select value={form.timing} disabled={disabled} clearable={false} options={enums.timing.options}
            onChange={(value) => set('timing', value === 'PRE_INSURANCE' ? 'PRE_INSURANCE' : 'POST_INSURANCE')} />
        </FormField>
        <FormField label="承担主体" required hint={form.sponsor === 'HOSPITAL' ? '记为医院优惠' : '记为第三方补助'}>
          <Select value={form.sponsor} disabled={disabled} clearable={false} options={enums.sponsor.options}
            onChange={(value) => set('sponsor', value as PolicyForm['sponsor'])} />
        </FormField>
        <FormField label="医保患者适用">
          <Select value={String(form.insuredApplicable)} disabled={disabled} clearable={false}
            options={boolOptions('医保与自费患者均适用', '仅自费患者')}
            onChange={(value) => set('insuredApplicable', value === 'true')} />
        </FormField>
        <FormField label="付款单位编码">
          <input value={form.payerCode} disabled={disabled} maxLength={64} onChange={(event) => set('payerCode', event.target.value)} />
        </FormField>
        <FormField label="付款单位名称">
          <input value={form.payerName} disabled={disabled} maxLength={128} onChange={(event) => set('payerName', event.target.value)} />
        </FormField>
        {form.timing === 'POST_INSURANCE' && <FormField label="减免基数">
          <Select value={String(form.baseIncludesPersonalAccount)} disabled={disabled} clearable={false}
            options={boolOptions('现金自付 + 个人账户', '仅现金自付')}
            onChange={(value) => set('baseIncludesPersonalAccount', value === 'true')} />
        </FormField>}
      </div>
    </section>
    <section className="relief-editor__section" aria-label="适用范围与有效期">
      <PanelHead title="适用范围与有效期" />
      <div className="ui-page-template__fields">
        <FormField label="适用结算场景" required hint="当前已接入门诊收费与药房收费">
          <Select multiple value={form.scenes} disabled={disabled} options={enums.scene.options}
            onChange={(values) => set('scenes', values)} />
        </FormField>
        <FormField label="生效日期" required>
          <DatePicker value={form.effectiveFrom} disabled={disabled} onChange={(value) => set('effectiveFrom', value)} />
        </FormField>
        <FormField label="失效日期" hint="不填表示长期有效">
          <DatePicker value={form.effectiveTo} min={form.effectiveFrom || undefined} disabled={disabled}
            onChange={(value) => set('effectiveTo', value)} />
        </FormField>
      </div>
      <p className="relief-editor__note">
        适用机构：{form.organizationIds.length ? `指定 ${form.organizationIds.length} 家机构（沿用原设置）` : '本租户全部机构'}
      </p>
    </section>
    <section className="relief-editor__section" aria-label="版本说明">
      <PanelHead title="版本说明" />
      <FormField label="本次修改说明" hint="发布后随版本留档">
        <input value={form.versionNote} disabled={disabled} maxLength={512} onChange={(event) => set('versionNote', event.target.value)} />
      </FormField>
    </section>
  </>
}

export function ReliefQualificationSection({ api, form, enums, disabled, onChange }: EditorProps) {
  const update = (key: string, patch: Partial<QualificationForm>) => onChange({
    ...form, qualifications: form.qualifications.map((item) => item.key === key ? { ...item, ...patch } : item),
  })
  return <section className="relief-editor__section" aria-label="资格条件">
    <PanelHead title="资格条件" actions={<Button size="sm" variant="secondary" disabled={disabled}
      onClick={() => onChange({ ...form, qualifications: [...form.qualifications, emptyQualification()] })}>添加条件</Button>} />
    <div className="ui-page-template__fields">
      <FormField label="组合方式">
        <Select value={form.qualificationMode} disabled={disabled} clearable={false} options={enums.qualificationMode.options}
          onChange={(value) => onChange({ ...form, qualificationMode: value === 'ALL' ? 'ALL' : 'ANY' })} />
      </FormField>
    </div>
    <ol className="relief-qualification-list">
      {form.qualifications.map((item, index) => <li key={item.key} className="relief-qualification">
        <div className="relief-qualification__head">
          <strong>条件 {index + 1}</strong>
          <Button size="sm" variant="text" disabled={disabled || form.qualifications.length <= 1}
            onClick={() => onChange({ ...form, qualifications: form.qualifications.filter((value) => value.key !== item.key) })}>
            删除
          </Button>
        </div>
        <div className="ui-page-template__fields">
          <FormField label="资格来源" required>
            <Select value={item.source} disabled={disabled} clearable={false} options={enums.source.options}
              onChange={(value) => update(item.key, { source: value as QualificationForm['source'] })} />
          </FormField>
          {(item.source === 'ROSTER' || item.source === 'PROVIDER') && <FormField label="资格类别" required>
            <DictionarySelect api={api.dictionaries} dictionaryCode={QUALIFICATION_TYPE_DICTIONARY} value={item.qualificationType}
              disabled={disabled} onChange={(value) => update(item.key, { qualificationType: value })} />
          </FormField>}
          {item.source === 'ATTRIBUTE' && <>
            <FormField label="最小年龄（岁）">
              <input inputMode="numeric" value={item.minAge} disabled={disabled}
                onChange={(event) => update(item.key, { minAge: event.target.value })} />
            </FormField>
            <FormField label="最大年龄（岁）">
              <input inputMode="numeric" value={item.maxAge} disabled={disabled}
                onChange={(event) => update(item.key, { maxAge: event.target.value })} />
            </FormField>
            <FormField label="性别">
              <Select multiple value={item.genders} disabled={disabled} options={genderOptions}
                onChange={(values) => update(item.key, { genders: values })} />
            </FormField>
            <FormField label="医保险种编码" hint="多个用顿号分隔，如 310、390；自费结算不满足此条件">
              <input value={item.coverageTypes} disabled={disabled}
                onChange={(event) => update(item.key, { coverageTypes: event.target.value })} />
            </FormField>
          </>}
          {item.source === 'PROVIDER' && <>
            <FormField label="接口编码" required>
              <input value={item.providerCode} disabled={disabled} maxLength={64}
                onChange={(event) => update(item.key, { providerCode: event.target.value })} />
            </FormField>
            <FormField label="接口失败处理" required hint="外部资格接口尚未接入，结算时按此处理">
              <Select value={item.failurePolicy} disabled={disabled} options={enums.failure.options}
                onChange={(value) => update(item.key, { failurePolicy: value as QualificationForm['failurePolicy'] })} />
            </FormField>
          </>}
        </div>
      </li>)}
    </ol>
  </section>
}

function scopeDisplay(rule: RuleForm, enums: ReliefEnums) {
  if (rule.feeScope === 'ALL') return enums.feeScope.name('ALL')
  if (rule.feeScope === 'CATALOG_ITEM') return rule.scopeName
  if (rule.feeScope === 'SOURCE_TYPE') return rule.scopeValue ? enums.chargeSource.name(rule.scopeValue) : ''
  return rule.scopeName || rule.scopeValue
}

export function ReliefRulesSection({ api, form, enums, disabled, onChange }: EditorProps) {
  const update = (key: string, patch: Partial<RuleForm>) => onChange({
    ...form, rules: form.rules.map((item) => item.key === key ? { ...item, ...patch } : item),
  })
  const methods = enums.method.options.map((option) => ({
    ...option, disabled: option.value === 'MANUAL' && form.timing === 'PRE_INSURANCE',
  }))
  const append = () => onChange({ ...form, rules: [...form.rules, emptyRule()] })
  return <section className="relief-editor__section relief-editor__section--table" aria-label="费用范围与规则">
    <PanelHead title="费用范围与规则" meta="同一费用命中多条规则时按最精确的范围计算：项目 > 大类 > 来源 > 全部"
      actions={<Button size="sm" variant="secondary" disabled={disabled} onClick={append}>添加规则</Button>} />
    <EditableTable aria-label="减免规则" onAppendRow={disabled ? undefined : append} className="relief-rule-table">
      <thead><tr>
        <th className={tableCellClass('control')}>序号</th>
        <th>费用范围</th>
        <th>范围值</th>
        <th>处理</th>
        <th>减免方式</th>
        <th className={tableCellClass('numeric')}>比例 / 金额</th>
        <th className={tableCellClass('numeric')}>周期次数</th>
        <th className={tableCellClass('actions')}>操作</th>
      </tr></thead>
      <tbody>{form.rules.map((rule, index) => <EditableRow key={rule.key}>
        <td className={tableCellClass('control')}>{index + 1}</td>
        <EditableCell display={enums.feeScope.name(rule.feeScope)}>
          <Select size="sm" aria-label={`第 ${index + 1} 条规则费用范围`} value={rule.feeScope} disabled={disabled}
            clearable={false} options={enums.feeScope.options}
            onChange={(value) => update(rule.key, {
              feeScope: value as FeeScope, scopeValue: '', catalogItemId: '', scopeName: '',
              excluded: value === 'ALL' ? false : rule.excluded,
            })} />
        </EditableCell>
        <EditableCell display={scopeDisplay(rule, enums)} placeholder={rule.feeScope === 'ALL' ? '—' : '请选择'}>
          {rule.feeScope === 'ACCOUNTING_CATEGORY'
            ? <DictionarySelect size="sm" api={api.dictionaries} dictionaryCode={ACCOUNTING_CATEGORY_DICTIONARY}
              aria-label={`第 ${index + 1} 条规则费用大类`} value={rule.scopeValue} disabled={disabled}
              onChange={(value, option) => update(rule.key, { scopeValue: value, scopeName: option?.label ?? '' })} />
            : rule.feeScope === 'SOURCE_TYPE'
              ? <Select size="sm" aria-label={`第 ${index + 1} 条规则收费来源`} value={rule.scopeValue} disabled={disabled}
                options={enums.chargeSource.options} onChange={(value) => update(rule.key, { scopeValue: value })} />
              : rule.feeScope === 'CATALOG_ITEM'
                ? <ClinicalResourceSearch api={api} resource="service" aria-label={`第 ${index + 1} 条规则收费项目`}
                  disabled={disabled}
                  value={rule.catalogItemId ? { value: rule.catalogItemId, label: rule.scopeName, code: '' } : undefined}
                  onChange={(option) => update(rule.key, { catalogItemId: option?.value ?? '', scopeName: option?.label ?? '' })} />
                : <span className="relief-editor__muted">全部费用</span>}
        </EditableCell>
        <EditableCell display={rule.excluded ? '排除' : '减免'}>
          <Select size="sm" aria-label={`第 ${index + 1} 条规则处理`} value={rule.excluded ? 'EXCLUDE' : 'INCLUDE'}
            disabled={disabled || rule.feeScope === 'ALL'} clearable={false}
            options={[{ value: 'INCLUDE', label: '减免' }, { value: 'EXCLUDE', label: '排除' }]}
            onChange={(value) => update(rule.key, { excluded: value === 'EXCLUDE' })} />
        </EditableCell>
        <EditableCell display={rule.excluded ? '' : rule.method ? enums.method.name(rule.method) : ''}>
          <Select size="sm" aria-label={`第 ${index + 1} 条规则减免方式`} value={rule.method} disabled={disabled || rule.excluded}
            options={methods} onChange={(value) => update(rule.key, { method: value as RuleForm['method'] })} />
        </EditableCell>
        <EditableCell className={tableCellClass('numeric')} display={ruleSummary(rule, enums.method.name)}>
          {rule.excluded || rule.method === 'FREE' ? <span className="relief-editor__muted">—</span>
            : rule.method === 'RATIO'
              ? <input className="ui-field__control" aria-label={`第 ${index + 1} 条规则减免比例（%）`} inputMode="decimal"
                placeholder="比例 %" value={rule.percent} disabled={disabled}
                onChange={(event) => update(rule.key, { percent: event.target.value })} />
              : rule.method === 'MANUAL'
                ? <input className="ui-field__control" aria-label={`第 ${index + 1} 条规则核准上限`} inputMode="decimal"
                  placeholder="核定上限（元）" value={rule.manualMaxAmount} disabled={disabled}
                  onChange={(event) => update(rule.key, { manualMaxAmount: event.target.value })} />
                : <input className="ui-field__control" aria-label={`第 ${index + 1} 条规则金额`} inputMode="decimal"
                  placeholder="金额（元）" value={rule.amount} disabled={disabled}
                  onChange={(event) => update(rule.key, { amount: event.target.value })} />}
        </EditableCell>
        <EditableCell className={tableCellClass('numeric')} display={rule.periodMaxCount}>
          <input className="ui-field__control" aria-label={`第 ${index + 1} 条规则周期次数`} inputMode="numeric"
            placeholder="不限" value={rule.periodMaxCount} disabled={disabled || rule.excluded}
            onChange={(event) => update(rule.key, { periodMaxCount: event.target.value })} />
        </EditableCell>
        <td className={tableCellClass('actions')}>
          <Button size="sm" variant="text" disabled={disabled || form.rules.length <= 1}
            onClick={() => onChange({ ...form, rules: form.rules.filter((value) => value.key !== rule.key) })}>删除</Button>
        </td>
      </EditableRow>)}</tbody>
    </EditableTable>
    <p className="relief-editor__note">
      全免与比例按费用计算；固定金额为每次结算合计减免；单位减免与个人限价按数量计算；人工核定仅适用于医保后减免，由收费员在收费时按实际情况核定金额。
      周期次数需在“额度与组合”中设置额度周期。
    </p>
  </section>
}

export function ReliefQuotaSection({ form, enums, disabled, onChange }: EditorProps) {
  const set = <K extends keyof PolicyForm>(key: K, value: PolicyForm[K]) => onChange({ ...form, [key]: value })
  const periodic = form.quotaPeriod !== 'NONE'
  return <>
    <section className="relief-editor__section" aria-label="额度">
      <PanelHead title="额度" />
      <div className="ui-page-template__fields">
        <FormField label="单次限额（元）" hint="每次结算本政策最多减免金额，不填不限">
          <input inputMode="decimal" value={form.onceMaxAmount} disabled={disabled}
            onChange={(event) => set('onceMaxAmount', event.target.value)} />
        </FormField>
        <FormField label="核定审批阈值（元）" hint={form.rules.some((rule) => rule.method === 'MANUAL')
          ? '收费员单次核定超过此金额需有审批权限的人员核定，不填不设' : '含人工核定规则时可设置'}>
          <input inputMode="decimal" value={form.manualApprovalAmount}
            disabled={disabled || !form.rules.some((rule) => rule.method === 'MANUAL')}
            onChange={(event) => set('manualApprovalAmount', event.target.value)} />
        </FormField>
        <FormField label="额度周期">
          <Select value={form.quotaPeriod} disabled={disabled} clearable={false} options={enums.quotaPeriod.options}
            onChange={(value) => onChange({ ...form, quotaPeriod: value as PolicyForm['quotaPeriod'],
              ...(value === 'NONE' ? { periodMaxAmount: '', periodMaxCount: '' } : {}) })} />
        </FormField>
        <FormField label="周期限额（元）">
          <input inputMode="decimal" value={form.periodMaxAmount} disabled={disabled || !periodic}
            onChange={(event) => set('periodMaxAmount', event.target.value)} />
        </FormField>
        <FormField label="周期次数">
          <input inputMode="numeric" value={form.periodMaxCount} disabled={disabled || !periodic}
            onChange={(event) => set('periodMaxCount', event.target.value)} />
        </FormField>
        <FormField label="跨场景共享额度">
          <Select value={String(form.shareAcrossScenes)} disabled={disabled || !periodic} clearable={false}
            options={boolOptions('门诊、住院等场景共用', '各场景分别累计')}
            onChange={(value) => set('shareAcrossScenes', value === 'true')} />
        </FormField>
        <FormField label="跨机构共享额度">
          <Select value={String(form.shareAcrossOrganizations)} disabled={disabled || !periodic} clearable={false}
            options={boolOptions('医共体内机构共用', '各机构分别累计')}
            onChange={(value) => set('shareAcrossOrganizations', value === 'true')} />
        </FormField>
      </div>
    </section>
    <section className="relief-editor__section" aria-label="组合规则">
      <PanelHead title="组合规则" />
      <div className="ui-page-template__fields">
        <FormField label="优先级" hint="数字越小越先计算">
          <input inputMode="numeric" value={form.priority} disabled={disabled} onChange={(event) => set('priority', event.target.value)} />
        </FormField>
        <FormField label="互斥组" hint="同组政策只执行优先级最高的一项">
          <input value={form.mutexGroup} disabled={disabled} maxLength={64} onChange={(event) => set('mutexGroup', event.target.value)} />
        </FormField>
        <FormField label="可与其他政策叠加">
          <Switch checked={form.stackable} disabled={disabled} checkedText="可叠加" uncheckedText="不叠加"
            aria-label="可与其他政策叠加" onChange={(value) => set('stackable', value)} />
        </FormField>
      </div>
    </section>
  </>
}

export function ReliefVersionsSection({ policy }: { policy?: ReliefPolicy }) {
  const versions = policy?.versions ?? []
  return <section className="relief-editor__section relief-editor__section--table" aria-label="版本记录">
    <PanelHead title="版本记录" meta={policy?.current ? `当前生效 V${policy.current.versionNo}` : '尚未发布'} />
    <DataTable aria-label="政策版本">
      <thead><tr>
        <th>版本</th>
        <th className={tableCellClass('status')}>状态</th>
        <th>生效期</th>
        <th>创建时间</th>
        <th>发布时间</th>
      </tr></thead>
      <tbody>{versions.length ? versions.map((version) => <tr key={version.id}>
        <td>V{version.versionNo}</td>
        <td className={tableCellClass('status')}>
          <StatusBadge tone={reliefStatusTone(version.status)}>{version.statusText ?? version.status}</StatusBadge>
        </td>
        <td>{version.effectiveFrom}{version.effectiveTo ? ` 至 ${version.effectiveTo}` : ' 起长期'}</td>
        <td>{formatTime(version.createdAt) || '—'}</td>
        <td>{formatTime(version.publishedAt) || '—'}</td>
      </tr>) : <tr><td colSpan={5} className="relief-editor__muted">暂无版本</td></tr>}</tbody>
    </DataTable>
  </section>
}
