import type { CSSProperties } from 'react'
import { DataTable as UiDataTable } from '../../../shared/ui'
import { knownChargeTotal, previewQuantity, requireTubePlan } from "../diagnosticPreview";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { ItemGroup, ItemGroupInput, RhnApi, ServiceCatalogItem, LaboratoryTubePlan, UnitDefinition } from "../../../shared/rhnApi";
import { errorMessage } from "../../../shared/rhnApi";
import type { Organization } from "../../../shared/model";
import { Alert, Button, FormField, Icon, Select } from "../../../shared/ui";
import { today, FormDialog, activeStatus, Check, unitOption } from './operationalShared'

export const USAGE_TYPE_OPTIONS = [
  { value: '', label: '全院通用（不限场景）' },
  { value: 'OUTPATIENT', label: '门诊业务 (OUTPATIENT)' },
  { value: 'INPATIENT', label: '住院业务 (INPATIENT)' },
  { value: 'EMERGENCY', label: '急诊业务 (EMERGENCY)' },
  { value: 'HEALTH_CHECK', label: '体检业务 (HEALTH_CHECK)' },
]

export function GroupDialog({ api, value, services, organization, units, onClose, onSave }: {
  api: RhnApi; value?: ItemGroup; services: ServiceCatalogItem[]
  organization: Organization; units: UnitDefinition[]; onClose: () => void
  onSave: (input: ItemGroupInput) => Promise<void>
}) {
  const [type, setType] = useState(value?.groupType ?? 'LIS')
  const [selected, setSelected] = useState<string[]>(value?.members.map((v) => v.catalogItemId) ?? [])
  const [memberConfig, setMemberConfig] = useState<Record<string, { quantity: string; unitCode: string; requiredMember: boolean; memberDescription: string }>>(
    Object.fromEntries((value?.members ?? []).map((v) => [v.catalogItemId, { quantity: String(v.quantity), unitCode: v.unitCode ?? '', requiredMember: v.requiredMember, memberDescription: v.memberDescription ?? '' }])),
  )
  const [code, setCode] = useState(value?.code ?? '')
  const [name, setName] = useState(value?.name ?? '')
  const [scope, setScope] = useState(value?.organizationId ? 'ORGANIZATION' : 'TENANT')
  const [usageType, setUsageType] = useState(value?.usageType ?? '')
  const [pointOfCare, setPointOfCare] = useState(value?.pointOfCare ?? false)
  const [validFrom, setValidFrom] = useState(value?.validFrom ?? today())
  const [validTo, setValidTo] = useState(value?.validTo ?? '')
  const [status, setStatus] = useState(value?.status ?? 'ACTIVE')

  const [search, setSearch] = useState('')
  const canPreview = type === 'LIS' && selected.length > 0
  const tubePreview = useQuery({
    queryKey: ['master-data-operational-group-tube-preview', organization.id, selected, memberConfig],
    queryFn: async () => requireTubePlan(await api.masterData.laboratoryTubePlan(selected.map((serviceId) => ({
      serviceId, quantity: previewQuantity(memberConfig[serviceId]?.quantity),
    })))),
    enabled: canPreview, retry: false,
  })
  const loadingTubePlan = tubePreview.isFetching
  const tubePlan = canPreview && !loadingTubePlan && tubePreview.isSuccess ? tubePreview.data : undefined
  const tubeAmount = tubePlan ? knownChargeTotal(tubePlan.chargeLines) : undefined

  const usageOptions = useMemo(() => {
    const exists = USAGE_TYPE_OPTIONS.some((opt) => opt.value === usageType)
    if (!usageType || exists) return USAGE_TYPE_OPTIONS
    return [...USAGE_TYPE_OPTIONS, { value: usageType, label: `${usageType} (自定义)` }]
  }, [usageType])

  const available = services.filter((v) =>
    type === 'LIS' ? v.sdServiceType === 'LABORATORY' : type === 'PACS' ? v.sdServiceType === 'EXAMINATION' : true)

  const filtered = available.filter((service) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return service.name.toLowerCase().includes(q) || service.code.toLowerCase().includes(q)
  })

  const toggle = (id: string) => setSelected((items) => {
    if (items.includes(id)) return items.filter((v) => v !== id)
    setMemberConfig((current) => ({ ...current, [id]: current[id] ?? { quantity: '1', unitCode: '', requiredMember: true, memberDescription: '' } }))
    return [...items, id]
  })

  const setMember = (id: string, patch: Partial<{ quantity: string; unitCode: string; requiredMember: boolean; memberDescription: string }>) =>
    setMemberConfig((current) => ({ ...current, [id]: {
      quantity: current[id]?.quantity ?? '1', unitCode: current[id]?.unitCode ?? '',
      requiredMember: current[id]?.requiredMember ?? true,
      memberDescription: current[id]?.memberDescription ?? '', ...patch,
    } }))

  const tubeColor = (group: LaboratoryTubePlan['groups'][number]) => {
    const text = `${group.containerName || ''} ${group.groupCode || ''}`.toUpperCase()
    if (text.includes('促凝') || text.includes('BIOCHEM') || text.includes('黄')) return 'var(--color-warning)'
    if (text.includes('EDTA') || text.includes('HEMATOLOGY') || text.includes('紫')) return 'var(--color-violet)'
    if (text.includes('枸橼酸') || text.includes('COAGULATION') || text.includes('蓝')) return 'var(--color-info)'
    if (text.includes('氟化钠') || text.includes('GLUCOSE') || text.includes('灰')) return 'var(--color-neutral)'
    if (text.includes('干燥') || text.includes('IMMUNO') || text.includes('红')) return 'var(--color-danger)'
    return 'var(--color-brand-primary)'
  }

  return <FormDialog title={value ? '编辑项目组套' : '新增项目组套'}
    description="专业维护检验/检查组合项目与组套；支持双栏智能穿梭选择，并提供实时采血分管与加收透视。"
    size="xwide"
    className="group-dialog-modal"
    gridClassName="master-data-form-grid--4"
    onClose={onClose} onSubmit={(e) => {
      e.preventDefault()
      return onSave({
        organizationId: scope === 'ORGANIZATION' ? organization.id : undefined,
        code, name, groupType: type as ItemGroup['groupType'], usageType: usageType || undefined,
        pointOfCare, status: status as 'ACTIVE' | 'INACTIVE', validFrom, validTo: validTo || undefined,
        members: selected.map((catalogItemId, index) => ({
          catalogItemId, sortOrder: (index + 1) * 10,
          quantity: Number(memberConfig[catalogItemId]?.quantity || 1),
          unitCode: memberConfig[catalogItemId]?.unitCode || undefined,
          requiredMember: memberConfig[catalogItemId]?.requiredMember ?? true,
          memberDescription: memberConfig[catalogItemId]?.memberDescription || undefined,
        })),
      })
    }}>
    <FormField label="组套编码" required>
      <input value={code} disabled={Boolean(value)} placeholder="如 CHEM_LIVER_12、ROUTINE_CBC"
        onChange={(e) => setCode(e.target.value.toUpperCase())} />
    </FormField>
    <FormField label="组套名称" required>
      <input value={name} placeholder="如 肝功能十二项、全血细胞分析+CRP" onChange={(e) => setName(e.target.value)} />
    </FormField>
    <FormField label="组套类型">
      <Select value={type} onChange={(v) => { setType(v as typeof type); setSelected([]); setMemberConfig({}) }} options={[
        { value: 'LIS', label: '检验组套（LIS）' }, { value: 'PACS', label: '检查组套（PACS）' },
        { value: 'ORDER_SET', label: '常用组合项目' }, { value: 'PACKAGE', label: '项目包' },
      ]} />
    </FormField>
    <FormField label="状态">
      <Select value={status} onChange={(v) => setStatus(v as 'ACTIVE' | 'INACTIVE')} options={activeStatus} />
    </FormField>

    <FormField label="适用范围">
      <Select value={scope} onChange={setScope} options={[
        { value: 'TENANT', label: '租户通用' }, { value: 'ORGANIZATION', label: organization.name },
      ]} />
    </FormField>
    <FormField label="使用场景">
      <Select value={usageType} onChange={setUsageType} options={usageOptions} />
    </FormField>
    <FormField label="生效日期" required>
      <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
    </FormField>
    <FormField label="失效日期">
      <input type="date" min={validFrom} value={validTo} onChange={(e) => setValidTo(e.target.value)} />
    </FormField>

    <div className="span-4 group-meta-options">
      <Check label="院内快速检测组套（POCT / 床旁即时检验）" checked={pointOfCare} onChange={setPointOfCare} />
      <span className="group-meta-hint">勾选后标记为 POCT 床旁快检，在临床开立时将自动匹配即时检验路径</span>
    </div>

    {/* 双栏智能穿梭选择器 */}
    <div className="span-4 group-transfer-wrap">
      {/* 左栏：备选库 */}
      <div className="group-transfer-pane group-transfer-pane--source">
        <div className="group-transfer-pane__header">
          <div className="group-transfer-pane__title">
            <div className="group-transfer-pane__label">
              <span>备选项目库</span>
              <span className="group-count-badge">{filtered.length}/{available.length}</span>
            </div>
            <span className="group-type-tag">{type === 'LIS' ? '仅显示检验项目' : type === 'PACS' ? '仅显示检查项目' : '诊疗目录'}</span>
          </div>
          <div className="group-transfer-search-box">
            <Icon name="search" className="group-search-icon" />
            <input className="group-transfer-pane__search" placeholder="输入项目名称或编码过滤…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
            {search && <Button type="button" className="group-search-clear" aria-label="清空搜索" onClick={() => setSearch('')} variant="text" size="sm">×</Button>}
          </div>
        </div>
        <div className="group-transfer-catalog">
          {filtered.map((service) => {
            const isSelected = selected.includes(service.id)
            return (
              <div key={service.id}
                className={`group-transfer-catalog__item${isSelected ? ' is-selected' : ''}`}
                onClick={() => toggle(service.id)}>
                <div className="group-catalog-info">
                  <strong className="group-catalog-name" title={service.name}>{service.name}</strong>
                  <div className="group-catalog-meta">
                    <code>{service.code}</code>
                    <span className={`item-charge-tag ${service.chargeable ? 'item-charge-tag--charge' : ''}`}>
                      {service.chargeable ? '收费' : '不收费'}
                    </span>
                  </div>
                </div>
                <Button size="sm" variant={isSelected ? 'secondary' : 'primary'} type="button" className="group-catalog-btn">
                  {isSelected ? '移出' : '加入'}
                </Button>
              </div>
            )
          })}
          {!filtered.length && <div className="group-transfer-empty">未找到匹配项目</div>}
        </div>
      </div>

      {/* 右栏：已选成员与执行参数 */}
      <div className="group-transfer-pane group-transfer-pane--target">
        <div className="group-transfer-pane__header">
          <div className="group-transfer-pane__title">
            <div className="group-transfer-pane__label">
              <span>已选组套成员</span>
              <span className="group-count-badge group-count-badge--primary">{selected.length} 项</span>
            </div>
            {selected.length > 0 && (
              <Button size="sm" variant="text" type="button" className="group-clear-btn" onClick={() => setSelected([])}>
                清空已选
              </Button>
            )}
          </div>
          <small className="group-transfer-pane__subtitle">配置各成员在开立时的默认数量、开立单位、必选约束及开嘱备注</small>
        </div>
        <div className="group-transfer-members">
          {selected.length === 0 ? (
            <div className="group-transfer-empty-prompt">
              <Icon name="clinical" className="empty-prompt-icon" />
              <p>请在左侧点击“加入”选定组套明细项目</p>
              <small>支持多项目合并开立，配置默认执行数量与单位约束</small>
            </div>
          ) : (
            <div className="group-member-table-wrap">
              <UiDataTable className="group-member-table">
                <thead>
                  <tr>
                    <th className="th-item-info">项目信息</th>
                    <th className="th-quantity">默认数量</th>
                    <th className="th-unit">开立单位</th>
                    <th className="th-required">必选</th>
                    <th className="th-desc">说明备注</th>
                    <th className="th-actions">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.map((id) => {
                    const service = services.find((v) => v.id === id)
                    const config = memberConfig[id] ?? { quantity: '1', unitCode: '', requiredMember: true, memberDescription: '' }
                    return (
                      <tr key={id}>
                        <td className="td-item-info">
                          <div className="group-member-item-title" title={service?.name || id}>
                            {service?.name || id}
                          </div>
                          <div className="group-member-item-meta">
                            <code>{service?.code}</code>
                            <span className={`item-charge-tag ${service?.chargeable ? 'item-charge-tag--charge' : ''}`}>
                              {service?.chargeable ? '收费' : '不收费'}
                            </span>
                          </div>
                        </td>
                        <td className="td-quantity">
                          <input type="number" min="0.001" step="any" value={config.quantity}
                            onChange={(e) => setMember(id, { quantity: e.target.value })} />
                        </td>
                        <td className="td-unit">
                          <Select value={config.unitCode} onChange={(unitCode) => setMember(id, { unitCode })}
                            placeholder="沿用主档" options={units.filter((v) => v.status === 'ACTIVE').map(unitOption)} />
                        </td>
                        <td className="td-required">
                          <Check label="" checked={config.requiredMember} onChange={(v) => setMember(id, { requiredMember: v })} />
                        </td>
                        <td className="td-desc">
                          <input type="text" value={config.memberDescription} placeholder="选填，如急查说明"
                            onChange={(e) => setMember(id, { memberDescription: e.target.value })} />
                        </td>
                        <td className="td-actions">
                          <Button size="sm" variant="text" type="button" className="group-remove-btn" onClick={() => toggle(id)}>
                            移除
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </UiDataTable>
            </div>
          )}
        </div>
      </div>
    </div>

    {/* 实时采血分管与费用透视卡片 (仅检验组套) */}
    {type === 'LIS' && selected.length > 0 && (
      <div className="span-4 group-tube-insight">
        {tubePreview.isError && <Alert duration={null}>{errorMessage(tubePreview.error)}</Alert>}
        <Button size="sm" variant="text" disabled={loadingTubePlan} onClick={() => { void tubePreview.refetch() }}>重新试算分管</Button>
        <div className="group-tube-insight__header">
          <div className="group-tube-insight__title-area">
            <div className="tube-insight-icon-wrap">
              <Icon name="sparkles" className="tube-insight-icon" />
            </div>
            <div>
              <div className="group-tube-insight__title">
                <span>组套采血与试管加收实时透视</span>
                {loadingTubePlan && <span className="tube-calculating">（计算中…）</span>}
              </div>
              <div className="group-tube-insight__desc">
                根据标本类型与采血管合并规则自动合并分管，并实时试算耗材加收明细
              </div>
            </div>
          </div>
          {tubePlan && (
            <div className="group-tube-insight__stats">
              <div className="tube-stat-item">
                <span className="tube-stat-label">预计生成采血管</span>
                <span className="tube-stat-value"><strong>{tubePlan.groups.reduce((acc, g) => acc + g.tubeCount, 0)}</strong> 管</span>
              </div>
              {tubePlan.chargeLines.length > 0 && (
                <div className="tube-stat-item tube-stat-item--fee">
                  <span className="tube-stat-label">试管耗材费预估</span>
                  <span className="tube-stat-value">{tubeAmount === undefined ? '金额待计价' : `¥ ${tubeAmount.toFixed(2)}`}</span>
                </div>
              )}
            </div>
          )}
        </div>
        {tubePlan && (
          <div className="group-tube-insight__badges">
            {tubePlan.groups.map((group) => {
              const color = tubeColor(group)
              return (
                <div key={group.groupCode} className="group-tube-pill">
                  <span className="tube-dot clinical-content-20" style={{ '--specimen-cap-color': color } as CSSProperties} />
                  <strong className="group-tube-pill__name">{group.specimenName || '标本名称未返回'} · {group.containerName || '容器名称未返回'}</strong>
                  <span className="group-tube-pill__detail">({group.tubeCount} 管 · 含 {group.serviceIds.length} 个检验单项)</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )}
  </FormDialog>
}
