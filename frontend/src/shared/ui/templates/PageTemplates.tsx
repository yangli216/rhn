import { useLayoutEffect, useRef, type ComponentProps, type FormEventHandler, type ReactNode } from 'react'
import { PageHeader, Panel, SplitWorkspace, TableShell } from '../index'
import './page-templates.css'

type PageProps = ComponentProps<typeof PageHeader> & { feedback?: ReactNode }

/** 固定头尾；pane 由正文滚动，content 将滚动交给内部 TableShell 等独立区域。 */
export function WorkspacePane({ label, header, footer, children, scroll = 'pane', resetScrollKey, className = '' }: {
  label: string
  header?: ReactNode
  footer?: ReactNode
  children: ReactNode
  scroll?: 'pane' | 'content'
  resetScrollKey?: string | number
  className?: string
}) {
  const body = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (body.current) { body.current.scrollTop = 0; body.current.scrollLeft = 0 }
  }, [resetScrollKey])
  return <Panel className={`ui-page-template__pane-frame ${className}`} aria-label={label}>
    {header && <div className="ui-page-template__pane-header">{header}</div>}
    <div ref={body} className={`ui-page-template__pane-body ${scroll === 'content' ? 'is-content-scroll' : ''}`}
      role={scroll === 'pane' ? 'region' : undefined} aria-label={scroll === 'pane' ? `${label}内容` : undefined}
      tabIndex={scroll === 'pane' ? 0 : undefined}>{children}</div>
    {footer && <div className="ui-page-template__pane-footer">{footer}</div>}
  </Panel>
}

function PageFrame({ children, feedback, compact = true, ...header }: PageProps & { children: ReactNode }) {
  return <section className="ui-page-template" aria-label={header.title}>
    <PageHeader {...header} compact={compact} />
    {feedback}
    {children}
  </section>
}

/** children 是 DataTable 或加载/空/失败状态；不要再包一层 TableShell。 */
export function ListPage({ filters, footer, resetScrollKey, children, ...page }: PageProps & {
  filters: ReactNode
  footer?: ReactNode
  resetScrollKey?: string | number
  children: ReactNode
}) {
  return <PageFrame {...page}>
    <div className="ui-page-template__toolbar">{filters}</div>
    <Panel className="ui-page-template__results">
      <TableShell footer={footer} scrollLabel={`${page.title}结果`} resetScrollKey={resetScrollKey}>{children}</TableShell>
    </Panel>
  </PageFrame>
}

/** 筛选、上下文与分页放入固定插槽，正文默认各自滚动。 */
export function MasterDetailPage({ navigation, navigationLabel, navigationHeader, navigationFooter, navigationResetScrollKey,
  detailHeader, detailFooter, detailLabel = '详情', detailScroll = 'pane', detailResetScrollKey, children, ...page }: PageProps & {
  navigation: ReactNode
  navigationLabel: string
  navigationHeader?: ReactNode
  navigationFooter?: ReactNode
  navigationResetScrollKey?: string | number
  detailHeader?: ReactNode
  detailFooter?: ReactNode
  detailLabel?: string
  detailScroll?: 'pane' | 'content'
  detailResetScrollKey?: string | number
  children: ReactNode
}) {
  return <PageFrame {...page}>
    <SplitWorkspace className="ui-page-template__master-detail">
      <WorkspacePane label={navigationLabel} header={navigationHeader} footer={navigationFooter} resetScrollKey={navigationResetScrollKey}>{navigation}</WorkspacePane>
      <WorkspacePane label={detailLabel} header={detailHeader} footer={detailFooter} scroll={detailScroll} resetScrollKey={detailResetScrollKey}>{children}</WorkspacePane>
    </SplitWorkspace>
  </PageFrame>
}

/** 依据内容区可用宽度适配，避免浏览器宽度足够但 AppShell 侧栏挤压主作业区。 */
export function WorkbenchPage({ queue, queueLabel, queueHeader, queueFooter, context, reference, referenceLabel, children, ...page }: PageProps & {
  queue: ReactNode
  queueLabel: string
  queueHeader?: ReactNode
  queueFooter?: ReactNode
  context?: ReactNode
  reference: ReactNode
  referenceLabel: string
  children: ReactNode
}) {
  return <PageFrame {...page}>
    <div className="ui-page-template__workbench">
      <WorkspacePane label={queueLabel} header={queueHeader} footer={queueFooter}>{queue}</WorkspacePane>
      <div className="ui-page-template__clinical">
        <Panel className="ui-page-template__pane">
          {context}
          {children}
        </Panel>
        <Panel className="ui-page-template__pane" aria-label={referenceLabel}>{reference}</Panel>
      </div>
    </div>
  </PageFrame>
}

/** fields 用 ui-page-template__fields 分组；唯一主提交放在 footer。 */
export function FormPage({ children, footer, onSubmit, ...page }: Omit<PageProps, 'actions'> & {
  children: ReactNode
  footer: ReactNode
  onSubmit: FormEventHandler<HTMLFormElement>
}) {
  return <PageFrame {...page}>
    <form className="ui-page-template__form" onSubmit={onSubmit}>
      <div className="ui-page-template__form-body">{children}</div>
      <footer className="ui-page-template__footer">{footer}</footer>
    </form>
  </PageFrame>
}
