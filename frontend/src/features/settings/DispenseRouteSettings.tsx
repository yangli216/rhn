import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type FormEvent } from 'react'
import type { ClinicalContext } from '../../app/AppShell'
import { errorMessage, type DispenseCareSetting, type DispenseRoute, type DispenseRouteInput,
  type RhnApi } from '../../shared/rhnApi'
import { Alert, Button, Dialog, EmptyState, FormField, Icon, LoadingState, PageHeader, Panel,
  Select, StatusBadge } from '../../shared/ui'

const today = () => new Date().toISOString().slice(0, 10)
const careSettingLabels: Record<DispenseCareSetting, string> = {
  OUTPATIENT: '门诊', EMERGENCY: '急诊', INPATIENT: '住院', HOME_CARE: '家庭病床',
}

export function DispenseRouteSettings({ api, clinicalContext }: { api: RhnApi; clinicalContext: ClinicalContext }) {
  const queryClient = useQueryClient()
  const organizationId = clinicalContext.organization.id
  const [editor, setEditor] = useState<DispenseRoute | null | undefined>()
  const [feedback, setFeedback] = useState('')
  const routes = useQuery({ queryKey: ['dispense-routes', organizationId],
    queryFn: () => api.pharmacy.dispenseRoutes(organizationId) })
  const sites = useQuery({ queryKey: ['pharmacy-sites', organizationId],
    queryFn: () => api.pharmacy.sites(organizationId) })
  const departments = useQuery({ queryKey: ['organization-departments', organizationId],
    queryFn: () => api.organization.departments(organizationId) })
  const medicationTypes = useQuery({ queryKey: ['dictionary', 'BD_MEDICATION_TYPE'],
    queryFn: () => api.dictionaries.resolve('BD_MEDICATION_TYPE') })
  const pharmacySites = useMemo(() => (sites.data ?? []).filter((site) => site.active
    && site.siteType === 'PHARMACY'), [sites.data])
  const activeRoutes = routes.data?.filter((value) => value.active) ?? []
  const defaultRoute = activeRoutes.find((value) => value.careSetting === 'OUTPATIENT'
    && !value.sourceDepartmentId && !value.medicationType)
  const specializedTypes = new Set(activeRoutes.map((value) => value.medicationType).filter(Boolean)).size

  async function refreshed(message: string) {
    setFeedback(message); setEditor(undefined)
    await queryClient.invalidateQueries({ queryKey: ['dispense-routes', organizationId] })
  }
  const save = useMutation({
    mutationFn: ({ value, input }: { value?: DispenseRoute; input: DispenseRouteInput }) => value
      ? api.pharmacy.updateDispenseRoute(value.id, value.revision, input)
      : api.pharmacy.createDispenseRoute(input),
    onSuccess: (_, variables) => refreshed(variables.value ? '发药路由已更新' : '发药路由已创建'),
  })
  const loading = routes.isPending || sites.isPending || departments.isPending || medicationTypes.isPending
  const currentError = routes.error || sites.error || departments.error || medicationTypes.error || save.error

  return <>
    <PageHeader compact eyebrow="运营配置 · 药事管理" title="发药药房设置"
      description="设置医生站药品医嘱在当前机构内流向哪个发药药房；专项规则优先，未命中时使用默认药房。"
      actions={<Button onClick={() => setEditor(null)} disabled={!pharmacySites.length}><Icon name="add" />新增规则</Button>} />
    {feedback && <Alert tone="success">{feedback}</Alert>}
    {currentError && <Alert>{errorMessage(currentError)}</Alert>}
    <div className="dispense-route-summary" aria-label="发药路由概览">
      <Panel><span>启用规则</span><strong>{activeRoutes.length}</strong><small>当前机构</small></Panel>
      <Panel><span>默认药房</span><strong>{defaultRoute
        ? pharmacySites.find((site) => site.id === defaultRoute.targetStockSiteId)?.name ?? '已配置' : '未配置'}</strong>
        <small>{defaultRoute ? '覆盖未命中医嘱' : '请尽快配置兜底规则'}</small></Panel>
      <Panel><span>专项分流</span><strong>{specializedTypes}</strong><small>个药品类型</small></Panel>
    </div>
    <Panel className="dispense-route-panel">
      <header className="dispense-route-panel__head"><div><h2>路由规则</h2>
        <p>匹配顺序：药品类型与开方科室同时命中，其次药品类型、开方科室，最后默认规则。</p></div>
        <span>{routes.data?.length ?? 0} 条</span></header>
      {loading && <LoadingState label="正在加载发药药房设置…" />}
      {!loading && !pharmacySites.length && <EmptyState icon="pharmacy" title="暂无可用发药药房"
        copy="请先在组织与人员中建立门诊药房或中药房科室，系统会自动生成库存站点。" />}
      {!loading && pharmacySites.length > 0 && !routes.data?.length && <EmptyState icon="pharmacy"
        title="尚未配置发药路由" copy="建议先配置一条默认规则，再按中药饮片等药品类型补充专项规则。"
        action={<Button onClick={() => setEditor(null)}>配置默认药房</Button>} />}
      {!loading && Boolean(routes.data?.length) && <div className="master-data-table-wrap"><table
        className="master-data-table is-compact dispense-route-table"><thead><tr>
          <th>规则</th><th>诊疗场景</th><th>开方科室</th><th>药品类型</th><th>流向药房</th><th>有效期</th><th>状态</th><th>操作</th>
        </tr></thead><tbody>{routes.data?.map((value) => <tr key={value.id}>
          <td><strong>{value.name}</strong><code>{value.code}</code><small>{value.description || '—'}</small></td>
          <td>{careSettingLabels[value.careSetting]}</td>
          <td>{departments.data?.find((item) => item.id === value.sourceDepartmentId)?.name || '全部开方科室'}</td>
          <td>{medicationTypes.data?.find((item) => item.code === value.medicationType)?.name || '全部药品类型'}</td>
          <td><strong>{pharmacySites.find((site) => site.id === value.targetStockSiteId)?.name || '未知药房'}</strong></td>
          <td>{value.validFrom}<small>{value.validTo ? `至 ${value.validTo}` : '长期有效'}</small></td>
          <td><StatusBadge tone={value.active ? 'success' : 'neutral'}>{value.active ? '已启用' : '已停用'}</StatusBadge></td>
          <td><Button size="sm" variant="text" onClick={() => setEditor(value)}>编辑</Button></td>
        </tr>)}</tbody></table></div>}
    </Panel>
    {editor !== undefined && <RouteEditor value={editor ?? undefined} organizationId={organizationId}
      departments={(departments.data ?? []).filter((item) => item.sdOrgStatus === 'ACTIVE'
        && !item.sdDepartmentType.startsWith('MED_PHARMACY'))}
      medicationTypes={medicationTypes.data ?? []} sites={pharmacySites} busy={save.isPending}
      onClose={() => setEditor(undefined)} onSave={(input) => save.mutate({ value: editor ?? undefined, input })} />}
  </>
}

function RouteEditor({ value, organizationId, departments, medicationTypes, sites, busy, onClose, onSave }: {
  value?: DispenseRoute; organizationId: string
  departments: Awaited<ReturnType<RhnApi['organization']['departments']>>
  medicationTypes: Awaited<ReturnType<RhnApi['dictionaries']['resolve']>>
  sites: Awaited<ReturnType<RhnApi['pharmacy']['sites']>>
  busy: boolean; onClose: () => void; onSave: (input: DispenseRouteInput) => void
}) {
  const [code, setCode] = useState(value?.code ?? '')
  const [name, setName] = useState(value?.name ?? '')
  const [careSetting, setCareSetting] = useState<DispenseCareSetting>(value?.careSetting ?? 'OUTPATIENT')
  const [sourceDepartmentId, setSourceDepartmentId] = useState(value?.sourceDepartmentId ?? '')
  const [medicationType, setMedicationType] = useState(value?.medicationType ?? '')
  const [targetStockSiteId, setTargetStockSiteId] = useState(value?.targetStockSiteId ?? sites[0]?.id ?? '')
  const [validFrom, setValidFrom] = useState(value?.validFrom ?? today())
  const [validTo, setValidTo] = useState(value?.validTo ?? '')
  const [active, setActive] = useState(value?.active ?? true)
  const [description, setDescription] = useState(value?.description ?? '')
  const eligibleSites = useMemo(() => sites.filter((site) => site.serviceScope === 'MIXED'
    || site.serviceScope === careSetting
    || (careSetting === 'HOME_CARE' && site.serviceScope === 'COMMUNITY')), [sites, careSetting])
  function submit(event: FormEvent) {
    event.preventDefault()
    onSave({ organizationId, code: code.trim().toUpperCase(), name: name.trim(), careSetting,
      sourceDepartmentId: sourceDepartmentId || undefined, medicationType: medicationType || undefined,
      targetStockSiteId, active, validFrom, validTo: validTo || undefined,
      description: description.trim() || undefined })
  }
  return <Dialog title={value ? '编辑发药路由' : '新增发药路由'} eyebrow="发药药房设置" size="wide"
    description="规则只决定药品医嘱流向哪个药房，不重复维护药房和库存资料。" onClose={onClose}
    footer={<><Button variant="secondary" onClick={onClose}>取消</Button>
      <Button type="submit" form="dispense-route-editor" busy={busy}>保存规则</Button></>}>
    <form id="dispense-route-editor" className="dispense-route-editor" onSubmit={submit}>
      <div className="ui-form-row"><FormField label="规则名称" required><input autoFocus value={name}
        onChange={(event) => setName(event.target.value)} maxLength={200} required /></FormField>
        <FormField label="规则编码" required><input value={code} disabled={Boolean(value)}
          onChange={(event) => setCode(event.target.value.toUpperCase())} pattern="[A-Za-z0-9][A-Za-z0-9_-]*"
          maxLength={64} placeholder="如 OUTPATIENT_DEFAULT" required /></FormField></div>
      <div className="ui-form-row"><FormField label="诊疗场景" required><Select value={careSetting}
        onChange={(next) => {
          const selected = next as DispenseCareSetting
          setCareSetting(selected)
          const current = sites.find((site) => site.id === targetStockSiteId)
          if (current && current.serviceScope !== 'MIXED' && current.serviceScope !== selected
            && !(selected === 'HOME_CARE' && current.serviceScope === 'COMMUNITY')) {
            setTargetStockSiteId(sites.find((site) => site.serviceScope === selected
              || site.serviceScope === 'MIXED'
              || (selected === 'HOME_CARE' && site.serviceScope === 'COMMUNITY'))?.id ?? '')
          }
        }} clearable={false} options={Object.entries(careSettingLabels)
          .map(([value, label]) => ({ value, label }))} /></FormField>
        <FormField label="开方科室" hint="不选择表示当前场景全部开方科室"><Select
        value={sourceDepartmentId} onChange={setSourceDepartmentId} placeholder="全部开方科室" showValue
        options={departments.map((item) => ({ value: item.id, label: item.name, code: item.code }))} /></FormField></div>
      <div className="ui-form-row">
        <FormField label="药品类型" hint="专项类型会优先于默认规则"><Select value={medicationType}
          onChange={setMedicationType} placeholder="全部药品类型" showValue
          options={medicationTypes.map((item) => ({ value: item.code, label: item.name, code: item.code }))} /></FormField>
        <FormField label="发药药房" required><Select value={targetStockSiteId} onChange={setTargetStockSiteId}
          clearable={false} showValue options={eligibleSites.map((site) => ({ value: site.id, label: site.name, code: site.code }))} />
        </FormField></div>
      <div className="ui-form-row"><FormField label="生效日期" required><input type="date" value={validFrom}
        onChange={(event) => setValidFrom(event.target.value)} required /></FormField>
        <FormField label="结束日期"><input type="date" min={validFrom} value={validTo}
          onChange={(event) => setValidTo(event.target.value)} /></FormField></div>
      <FormField label="规则说明"><textarea rows={3} maxLength={1000} value={description}
        onChange={(event) => setDescription(event.target.value)} placeholder="说明该规则适用的业务场景" /></FormField>
      <label className="dispense-route-editor__status"><input type="checkbox" checked={active}
        onChange={(event) => setActive(event.target.checked)} /><span><strong>启用规则</strong>
          <small>停用后新进入药房的医嘱不再匹配本规则</small></span></label>
    </form>
  </Dialog>
}
