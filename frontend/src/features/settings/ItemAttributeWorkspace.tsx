import type { RhnApi } from '../../shared/rhnApi'
import { Button, Icon, PageHeader, Panel } from '../../shared/ui'
import { ItemAttributeConfigurationPanel } from './ItemAttributeConfigurationPanel'
import '../../styles/features/operational-master-data.css'

export function ItemAttributeWorkspace({
  api,
  onNavigate,
}: {
  api: RhnApi
  onNavigate?: (path: string) => void
}) {
  return (
    <div className="item-attribute-workspace master-data-page" aria-label="扩展属性管理工作区">
      <PageHeader
        compact
        eyebrow="中心治理 · 扩展属性"
        title="扩展属性管理"
        description="统一维护药品主档与诊疗服务项目的租户自定义扩展属性，按项目分类装配业务字段、输入控件与验证规则。"
        actions={
          onNavigate && (
            <>
              <Button variant="secondary" onClick={() => onNavigate('/settings/medications')}>
                <Icon name="pill" />药品知识与目录
              </Button>
              <Button variant="secondary" onClick={() => onNavigate('/settings/services')}>
                <Icon name="clinical" />诊疗服务目录
              </Button>
            </>
          )
        }
      />
      <Panel className="master-data-panel">
        <ItemAttributeConfigurationPanel api={api} />
      </Panel>
    </div>
  )
}

export default ItemAttributeWorkspace
