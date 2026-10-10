import { loadAttributeMaintenance } from "../ItemAttributeValueEditor";
import { saveMasterDataAttributes } from "../saveMasterDataAttributes";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type ReactNode } from "react";
import type { Organization } from "../../../shared/model";
import { type RhnApi, type ServiceCatalogItem, type ServiceInput } from "../../../shared/rhnApi";
import { Alert, Button, DictionarySelect, EmptyState, FormField, LoadingState, StatusBadge } from "../../../shared/ui";
import { Table, serviceSubtypeLabel, serviceDuplicateRuleLabel, accountingCategoryLabel, serviceTypeTone, Flag, DataStatus, RowActions, preloadOperationalMasterData, type DictionaryMap, today, DataFormDialog, text, optionalText, checked, FormSection, FormGrid, SelectField, Checkboxes, Checkbox, DateRangeFields } from './masterDataShared'
import { validateAttributeChanges, DynamicItemAttributesSection } from './AttributeMaintenance'

export function ServiceTable({ values, loading, pagination, density = 'two-line', onConfigure, onEdit, onAttributes: _onAttributes }: {
  values?: ServiceCatalogItem[]; loading: boolean;
  pagination: ReactNode;
  density?: 'two-line' | 'single-line';
  onConfigure: (value: ServiceCatalogItem) => void;
  onEdit: (value: ServiceCatalogItem) => void;
  onAttributes?: (value: ServiceCatalogItem) => void;
}) {
  if (loading) return <LoadingState label="正在加载诊疗项目…" />
  if (!values?.length) return <EmptyState icon="clinical" title="未找到诊疗项目" copy="请调整筛选条件或新增项目。" />
  const isSingle = density === 'single-line'

  return <Table
    headers={['项目', '临床语义', '中心能力', '状态', '操作']}
    footer={pagination}
    compact={isSingle}
    className={`service-catalog-table is-${density}`}>
    {values.map((value) => {
      const typeText = value.sdServiceTypeText === 'OTHER' ? '其他' : value.sdServiceTypeText
      const subtype = serviceSubtypeLabel(value.serviceSubtype)
      const ruleText = serviceDuplicateRuleLabel(value.sdDuplicateRule, value.sdDuplicateRuleText)
      const mutualText = value.mutualRecognitionCode ? `互认 ${value.mutualRecognitionCode}` : ''
      const accCategory = accountingCategoryLabel(value.accountingCategory, value.accountingCategoryText)
      const execDetail = value.sdServiceType === 'LABORATORY'
        ? (value.laboratory ? `${value.laboratory.sdLaboratoryMethodText || '检验'} · ${value.laboratory.specimens.length} 种标本` : '未配置标本')
        : value.sdServiceType === 'EXAMINATION'
        ? (value.examination ? `${value.examination.sdExaminationTypeText || '检查'} · ${value.examination.variants.length} 个部位/方式` : '未配置部位')
        : (value.medicalTechnology ? '医技科室执行' : '临床科室执行')
      const metaSummary = [execDetail, ruleText || '未设置重复规则', mutualText].filter(Boolean).join(' · ')

      return <tr key={value.id} className={`service-catalog-row is-${density}`}>
        <td className="service-col-name">
          <div className="service-name-wrap">
            <strong className="service-item-name" title={`项目编码: ${value.code}`}>{value.name}</strong>
            {value.unitCode && <span className="service-unit-tag" title="计价单位">{value.unitCode}</span>}
          </div>
          {!isSingle && accCategory && (
            <div className="service-name-sub">
              <span className="service-acc-tag">{accCategory}</span>
            </div>
          )}
        </td>

        <td className="service-col-semantics">
          {!isSingle ? (
            <>
              <div className="service-cell__primary">
                <StatusBadge tone={serviceTypeTone(value.sdServiceType)}>{typeText}</StatusBadge>
                <span className="service-usage-text">{value.sdUsageTypeText}</span>
                {subtype && <span className="service-subtype-text"> · {subtype}</span>}
              </div>
              <div className="service-cell__secondary">
                <span className="service-meta-text" title={metaSummary}>{metaSummary}</span>
              </div>
            </>
          ) : (
            <div className="service-cell__inline">
              <StatusBadge tone={serviceTypeTone(value.sdServiceType)}>{typeText}</StatusBadge>
              <span className="service-usage-text">{value.sdUsageTypeText}</span>
              {subtype && <span className="service-subtype-text"> · {subtype}</span>}
              <span className="service-meta-inline" title={metaSummary}>({metaSummary})</span>
            </div>
          )}
        </td>

        <td className="service-col-capabilities">
          {!isSingle ? (
            <>
              <div className="service-cell__primary service-flags">
                <Flag value={value.orderable} label="可开立" />
                <Flag value={value.chargeable} label="可收费" />
              </div>
              <div className="service-cell__secondary">
                <small className="service-single-chip">
                  {value.singleOrder ? '允许单开' : '仅组合使用'}
                  {value.pregnancyAlert ? ' · 孕期提醒' : ''}
                </small>
              </div>
            </>
          ) : (
            <div className="service-capability-inline">
              <Flag value={value.orderable} label="开立" />
              <Flag value={value.chargeable} label="收费" />
              <span className={`service-single-chip is-inline ${value.singleOrder ? 'is-single' : 'is-combo'}`}>
                {value.singleOrder ? '单开' : '组合'}
              </span>
            </div>
          )}
        </td>

        <td className="service-col-status">
          <DataStatus value={value.sdStatus} text={value.sdStatusText} />
        </td>

        <td className="service-col-actions">
          <RowActions>
            <Button size="sm" variant="text" onClick={() => onEdit(value)}>编辑主档</Button>
            {['LABORATORY', 'EXAMINATION'].includes(value.sdServiceType) && (
              <Button
                size="sm"
                variant="text"
                onMouseEnter={() => void preloadOperationalMasterData()}
                onFocus={() => void preloadOperationalMasterData()}
                onClick={() => onConfigure(value)}
              >
                执行与收费
              </Button>
            )}
          </RowActions>
        </td>
      </tr>
    })}
  </Table>
}

export function ServiceDialog({ api, organization, dictionaries, value, onClose, onSave }: {
  api: RhnApi; organization?: Organization; dictionaries: DictionaryMap;
  value?: ServiceCatalogItem; onClose: () => void; onSave: (input: ServiceInput) => void | Promise<unknown>
}) {
  const queryClient = useQueryClient()
  const [accountingCategory, setAccountingCategory] = useState(value?.accountingCategory ?? '')
  const [attrValues, setAttrValues] = useState<Record<string, string>>({})
  const maintenanceQuery = useQuery({
    queryKey: ['master-data-item-attributes', 'CATALOG_ITEM', value?.id, today()],
    queryFn: () => loadAttributeMaintenance(api!, 'CATALOG_ITEM', value!.id, today()),
    enabled: Boolean(api && value?.id),
    staleTime: 60 * 1000,
  })

  const attributeRequests = useRef(new Map<string, string>())
  const [attributeProgress, setAttributeProgress] = useState('')
  const saveAttributes = async () => {
    if (!api || !value?.id || !maintenanceQuery.data) return
    await queryClient.cancelQueries({ queryKey: ['master-data-item-attributes', 'CATALOG_ITEM', value.id, today()], exact: true })
    await saveMasterDataAttributes({ api, subjectType: 'CATALOG_ITEM', targetId: value.id,
      organizationId: organization?.id, maintenance: maintenanceQuery.data, values: attrValues,
      date: today(), requests: attributeRequests.current,
      onConfirmed: (attribute, snapshot) => {
        queryClient.setQueryData(['master-data-item-attributes', 'CATALOG_ITEM', value.id, today()], snapshot)
        setAttrValues((current) => { const next = { ...current }; delete next[attribute.definitionId]; return next })
        setAttributeProgress(`扩展属性“${attribute.name}”已保存，主档尚待保存；已保存属性不会因其他步骤失败而回滚。`)
      },
    })
  }

  return <DataFormDialog title={value ? '编辑诊疗项目' : '新增诊疗项目'} eyebrow="临床服务目录" onClose={onClose}
    size="xwide" description="维护项目主档身份和目录属性；检验检查的执行、部位与收费规则从项目列表的“执行与收费”进入。"
    onSubmit={async (form) => {
      if (api && value?.id) {
        if (!maintenanceQuery.isSuccess) throw new Error('扩展属性尚未加载成功，请重试后保存')
        validateAttributeChanges(maintenanceQuery.data, attrValues)
      }
      await saveAttributes()
      await onSave({ code: (value?.code || text(form, 'code')).trim(), name: text(form, 'name'), unitCode: optionalText(form, 'unitCode'),
        orderable: checked(form, 'orderable'), chargeable: checked(form, 'chargeable'), sdStatus: (value?.sdStatus ?? 'ACTIVE'),
        validFrom: text(form, 'validFrom'), validTo: optionalText(form, 'validTo'), sdServiceType: value?.sdServiceType || text(form, 'sdServiceType'),
        serviceSubtype: optionalText(form, 'serviceSubtype'), sdUsageType: text(form, 'sdUsageType'),
        medicalTechnology: checked(form, 'medicalTechnology'), combinationItem: checked(form, 'combinationItem'),
        singleOrder: checked(form, 'singleOrder'), specimenType: value?.specimenType,
        examinationType: value?.examinationType, accountingCategory: optionalText(form, 'accountingCategory'),
        sdDuplicateRule: optionalText(form, 'sdDuplicateRule'), multiSitePrice: value?.multiSitePrice,
        freeSiteCount: value?.freeSiteCount, maxBodySiteCount: value?.maxBodySiteCount,
        mutualRecognitionCode: optionalText(form, 'mutualRecognitionCode'),
        pregnancyAlert: checked(form, 'pregnancyAlert'), attention: optionalText(form, 'attention'),
        examinationNotes: value?.examinationNotes })
      setAttributeProgress('')
    }}>
    {attributeProgress && <Alert tone="warning">{attributeProgress}</Alert>}
    <FormSection title="标准身份" description="编码创建后保持稳定，名称与目录属性可继续维护。">
      <FormGrid columns={3}>
        <FormField label="项目编码" required><input name="code" defaultValue={value?.code} disabled={Boolean(value)}
          placeholder="如 EXAM_BLOOD_ROUTINE" autoFocus={!value} required /></FormField>
        {value && <input type="hidden" name="code" value={value.code} />}
        <FormField label="项目名称" required className="span-2"><input name="name" defaultValue={value?.name}
          placeholder="录入统一项目名称" required /></FormField>
        <SelectField name="sdServiceType" label={value ? '项目类型（创建后不可修改）' : '项目类型'} values={dictionaries.BD_SERVICE_TYPE}
          defaultValue={value?.sdServiceType ?? 'EXAMINATION'} disabled={Boolean(value)} />
        <FormField label="项目子类"><input name="serviceSubtype" defaultValue={value?.serviceSubtype}
          placeholder="如 常规检验" /></FormField>
        <SelectField name="sdUsageType" label="适用场景" values={dictionaries.BD_SERVICE_USE}
          defaultValue={value?.sdUsageType ?? 'COMMON'} />
      </FormGrid>
    </FormSection>
    <FormSection title="目录属性与能力" description="这里只维护中心级目录属性；检验标本、检查部位、多部位计价与附加收费在该项目的“执行与收费”中统一维护。">
      <FormGrid columns={4}>
        <FormField label="计价单位"><input name="unitCode" defaultValue={value?.unitCode ?? '次'} /></FormField>
        <FormField label="费用归并"><DictionarySelect api={api.dictionaries} dictionaryCode="BD_ACCOUNTING_CATEGORY"
          name="accountingCategory" aria-label="费用归并" value={accountingCategory} onChange={setAccountingCategory}
          placeholder="选择费用归并分类" /></FormField>
        <SelectField name="sdDuplicateRule" label="重复开立规则" values={dictionaries.BD_SERVICE_DUPLICATE_RULE}
          defaultValue={value?.sdDuplicateRule ?? 'WARN'} />
        <FormField label="互认编码"><input name="mutualRecognitionCode" defaultValue={value?.mutualRecognitionCode}
          placeholder="区域检查检验互认编码" /></FormField>
        <Checkboxes title="中心能力">
          <Checkbox name="orderable" label="允许开立" defaultChecked={value?.orderable ?? true} />
          <Checkbox name="chargeable" label="允许收费" defaultChecked={value?.chargeable ?? true} />
          <Checkbox name="medicalTechnology" label="医技项目" defaultChecked={value?.medicalTechnology ?? true} />
          <Checkbox name="singleOrder" label="允许单开" defaultChecked={value?.singleOrder ?? true} />
          <Checkbox name="combinationItem" label="组合项目" defaultChecked={value?.combinationItem} />
          <Checkbox name="pregnancyAlert" label="孕期提醒" defaultChecked={value?.pregnancyAlert} />
        </Checkboxes>
      </FormGrid>
    </FormSection>
    <FormSection title="生命周期与说明" description="失效日期为空表示持续有效。">
      <FormGrid>
        <DateRangeFields fromName="validFrom" toName="validTo" fromLabel="生效日期" toLabel="失效日期"
          fromDefault={value?.validFrom} toDefault={value?.validTo} />
        <FormField label="注意事项"><textarea name="attention" defaultValue={value?.attention}
          placeholder="录入开立或执行时需要关注的事项" rows={2} /></FormField>
      </FormGrid>
    </FormSection>
    {value?.id && (
      <DynamicItemAttributesSection
        api={api}
        maintenance={maintenanceQuery.data}
        organization={organization}
        values={attrValues}
        onChange={(defId, val) => setAttrValues((prev) => ({ ...prev, [defId]: val }))}
        isLoading={maintenanceQuery.isPending}
        hasError={maintenanceQuery.isError}
        onRetry={() => void maintenanceQuery.refetch()}
      />
    )}
  </DataFormDialog>
}
