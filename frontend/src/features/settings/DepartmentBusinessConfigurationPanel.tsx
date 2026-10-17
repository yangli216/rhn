import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { errorMessage, type DictionaryValue, type OrganizationProfileResult, type OrganizationUnit, type RhnApi } from '../../shared/rhnApi'
import { Alert, Button, DataTable, LoadingState, StatusBadge } from '../../shared/ui'
import { organizationQueryScope } from './organizationQueryScope'
const configuration = z.object({ runtimeUses: z.array(z.object({ code: z.string(), name: z.string(), classificationMatches: z.boolean(), requirement: z.string() })),
  suggestedCapabilityTypes: z.array(z.string()), warnings: z.array(z.string()) })
export function DepartmentBusinessConfigurationPanel({ api, unit, profile, capabilityTypes }: {
  api: RhnApi; unit: OrganizationUnit; profile: OrganizationProfileResult; capabilityTypes: DictionaryValue[]
}) {
  const query = useQuery({ queryKey: ['department-business-configuration', organizationQueryScope(api), unit.id, unit.revision],
    queryFn: async () => configuration.parse(await api.organization.businessConfiguration(unit.id)), enabled: unit.sdOrgKind === 'ORG_UNIT' })
  const today = new Date().toLocaleDateString('sv-SE')
  const current = profile.capabilities.filter(value => value.sdDetailStatus === 'ACTIVE' && value.validFrom <= today && (!value.validTo || value.validTo >= today))
  return <>
    <div className="master-profile-grid">
      <section className="master-control-card"><h3>科室分类</h3><p>业务属性决定科室承担的主要职责；具体科室类型用于专业路由和业务场所识别。每个科室各维护一个。</p>
        <p>{unit.sdDepartmentPropertyText || '未维护业务属性'} · {unit.sdDepartmentTypeText || unit.sdOrgTypeText}</p></section>
      <section className="master-control-card"><h3>服务能力登记</h3><p>一个科室可以登记多种服务能力，分别维护有效期、依据与确认结果。机构能力不会自动成为下属科室能力，能力登记不授予账号权限。</p></section>
    </div>
    {unit.sdOrgKind === 'ORG_UNIT' && (query.isPending ? <LoadingState label="正在核实业务配置…" /> : query.isError
      ? <Alert>{errorMessage(query.error)}<Button onClick={() => void query.refetch()}>重新核实业务配置</Button></Alert>
      : <>{query.data.warnings.map(value => <Alert key={value}>{value}</Alert>)}
        <h3>现有运行规则</h3><DataTable compact aria-label="科室运行规则"><thead><tr><th>业务用途</th><th>当前分类</th><th>还需满足的运行条件</th></tr></thead>
          <tbody>{query.data.runtimeUses.map(value => <tr key={value.code}><td>{value.name}</td><td><StatusBadge tone={value.classificationMatches ? 'success' : 'neutral'}>{value.classificationMatches ? '分类匹配' : '分类不匹配'}</StatusBadge></td><td>{value.requirement}</td></tr>)}</tbody></DataTable>
        {!!query.data.suggestedCapabilityTypes.length && <p>建议核对能力登记：{query.data.suggestedCapabilityTypes.map(code => capabilityTypes.find(item => item.code === code)?.name ?? code).join('、')}。确认结果在资料维护中直接填写。</p>}
      </>)}
    <h3>当前有效的能力登记（{current.length} 条）</h3>
    <p>有效期和确认结果分别展示。当前运行仍按科室分类、业务配置、人员任职及授权校验；登记结果符合也不代表已取得业务操作权限。</p>
    <DataTable compact aria-label="当前服务能力"><thead><tr><th>能力</th><th>范围</th><th>有效期</th><th>确认结果</th></tr></thead><tbody>{current.map(value =>
      <tr key={value.id}><td>{value.sdCapabilityTypeText}</td><td>{value.capabilityScope || '未填写'}</td><td>{value.validFrom} 至 {value.validTo || '长期'}</td><td>{value.sdVerifyStatusText}</td></tr>)}</tbody></DataTable>
    {!current.length && <p>暂无当前有效的能力登记，可在资料维护中填写。</p>}
  </>
}
