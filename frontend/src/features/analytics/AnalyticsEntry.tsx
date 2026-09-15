import { DynamicAnalysisLibrary } from './DynamicAnalysisLibrary'
import './analytics-entry.css'
import { useQuery } from '@tanstack/react-query'
import type { RhnApi } from '../../shared/rhnApi'
import { Alert, LoadingState, PageHeader, Panel, PanelHead } from '../../shared/ui'

// This is only an entry shell. A14 supplies the multi-pane analysis workstation.
export function AnalyticsEntry({ api }: { api: RhnApi }) {
  const capability = useQuery({
    queryKey: ['analytics', 'capabilities'],
    queryFn: () => api.analytics.capabilities(),
    staleTime: 0,
  })
  if (capability.isPending) return <LoadingState label="正在检查统计分析服务" />
  if (capability.isError) return <Alert tone="error">暂时无法确认统计分析是否开放，请稍后重试。</Alert>
  if (capability.data.pilotEnabled) return <DynamicAnalysisLibrary api={api} />
  return <>
    <PageHeader eyebrow="统计分析" title="智能统计分析" />
    <Panel>
      <PanelHead title={capability.data.enabled ? '统计分析准备中' : '统计分析尚未开放'} />
      <p className="analytics-entry-copy">{capability.data.enabled
        ? '指标目录与统计权限正在配置，暂不提供查询。'
        : '当前环境暂未开放此功能，请继续使用现有业务工作台。'}</p>
    </Panel>
  </>
}
