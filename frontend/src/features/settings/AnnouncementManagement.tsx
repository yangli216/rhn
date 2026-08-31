import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import type { ClinicalContext } from '../../app/AppShell'
import type { AnnouncementCategory, AnnouncementDraft, AnnouncementPriority, AnnouncementScope,
  AnnouncementStatus, RhnApi, SystemAnnouncement } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, Button, Dialog, EmptyState, FormField, Icon, LoadingState, PageHeader, Panel, PanelHead,
  Select, StatusBadge } from '../../shared/ui'
import { formatTime } from '../../shared/format'

const statusText: Record<AnnouncementStatus, string> = {
  DRAFT: '草稿', SCHEDULED: '待发布', PUBLISHED: '已发布', WITHDRAWN: '已撤回', EXPIRED: '已失效',
}
const categoryText: Record<AnnouncementCategory, string> = {
  GENERAL: '综合公告', POLICY: '制度政策', MAINTENANCE: '系统维护', EMERGENCY: '紧急通知',
}
const priorityText: Record<AnnouncementPriority, string> = { NORMAL: '普通', IMPORTANT: '重要', URGENT: '紧急' }
const scopeText: Record<AnnouncementScope, string> = { TENANT: '全租户', ORGANIZATION: '当前机构', DEPARTMENT: '当前科室' }

export function AnnouncementManagement({ api, clinicalContext }: { api: RhnApi; clinicalContext: ClinicalContext }) {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedId, setSelectedId] = useState<string>()
  const [editor, setEditor] = useState<SystemAnnouncement | 'create'>()
  const [publisher, setPublisher] = useState<SystemAnnouncement>()
  const [feedback, setFeedback] = useState('')
  const announcements = useQuery({ queryKey: ['announcement-management', statusFilter],
    queryFn: () => api.announcements.management.list(statusFilter) })
  const selected = announcements.data?.find((value) => value.id === selectedId)

  useEffect(() => {
    if (!announcements.data?.length) { setSelectedId(undefined); return }
    if (!selectedId || !announcements.data.some((value) => value.id === selectedId)) {
      setSelectedId(announcements.data[0].id)
    }
  }, [announcements.data, selectedId])

  async function refreshed(message: string, id?: string) {
    setFeedback(message); setEditor(undefined); setPublisher(undefined)
    await queryClient.invalidateQueries({ queryKey: ['announcement-management'] })
    await queryClient.invalidateQueries({ queryKey: ['announcement-summary'] })
    await queryClient.invalidateQueries({ queryKey: ['announcements'] })
    if (id) setSelectedId(id)
  }

  const create = useMutation({ mutationFn: api.announcements.management.create,
    onSuccess: (value) => refreshed('公告草稿已创建', value.id) })
  const update = useMutation({ mutationFn: ({ value, input }: { value: SystemAnnouncement; input: AnnouncementDraft }) =>
    api.announcements.management.update(value.id, value.revision, input),
    onSuccess: (value) => refreshed('公告草稿已更新', value.id) })
  const publish = useMutation({ mutationFn: ({ value, publishAt, expireAt }: {
    value: SystemAnnouncement; publishAt?: string; expireAt?: string
  }) => api.announcements.management.publish(value.id, value.revision, publishAt, expireAt),
  onSuccess: (value) => refreshed(value.status === 'SCHEDULED' ? '公告已安排定时发布' : '公告已发布', value.id) })
  const withdraw = useMutation({ mutationFn: (value: SystemAnnouncement) =>
    api.announcements.management.withdraw(value.id, value.revision),
  onSuccess: (value) => refreshed('公告已撤回', value.id) })
  const operationError = create.error || update.error || publish.error || withdraw.error
  const busy = create.isPending || update.isPending || publish.isPending || withdraw.isPending

  return <>
    <PageHeader compact eyebrow="系统配置 · 工作门户" title="系统公告管理"
      description="统一维护租户、机构和科室公告，支持定时发布、置顶、有效期和实时触达。"
      actions={<Button onClick={() => setEditor('create')}><Icon name="add" />新建公告</Button>} />
    {feedback && <Alert tone="success">{feedback}</Alert>}
    {(announcements.error || operationError) && <Alert>{errorMessage(announcements.error || operationError)}</Alert>}
    <div className="announcement-management-toolbar">
      <Select aria-label="公告状态" value={statusFilter} onChange={setStatusFilter} placeholder="全部状态"
        options={Object.entries(statusText).map(([value, label]) => ({ value, label }))} />
      <span>共 {announcements.data?.length ?? 0} 条公告</span>
    </div>
    <section className="announcement-management">
      <Panel className="announcement-management__list">
        <PanelHead title="公告列表" meta={statusFilter ? statusText[statusFilter as AnnouncementStatus] : '全部'} />
        {announcements.isPending && <LoadingState label="正在加载公告…" />}
        {!announcements.isPending && !announcements.data?.length && <EmptyState icon="roadmap"
          title="暂无系统公告" copy="创建草稿后，可立即发布或安排定时发布。" />}
        {announcements.data?.map((value) => <button type="button" key={value.id}
          className={selectedId === value.id ? 'is-selected' : ''} onClick={() => setSelectedId(value.id)}>
          <span><StatusBadge tone={statusTone(value.status)}>{statusText[value.status]}</StatusBadge>
            <small>{scopeText[value.scopeType]}</small></span>
          <strong>{value.title}</strong><p>{value.summary}</p>
          <footer><span>{categoryText[value.category]} · {priorityText[value.priority]}</span>
            <time>{formatTime(value.updatedAt)}</time></footer>
        </button>)}
      </Panel>
      <Panel className="announcement-management__detail">
        <PanelHead title={selected?.title ?? '公告详情'} meta={selected && <StatusBadge tone={statusTone(selected.status)}>
          {statusText[selected.status]}</StatusBadge>} />
        {!selected && <EmptyState icon="roadmap" title="选择一条公告" copy="查看公告正文、发布范围和生命周期。" />}
        {selected && <div className="announcement-management__detail-body">
          <div className="announcement-management__facts">
            <div><span>发布范围</span><strong>{scopeText[selected.scopeType]}</strong></div>
            <div><span>分类</span><strong>{categoryText[selected.category]}</strong></div>
            <div><span>优先级</span><strong>{priorityText[selected.priority]}</strong></div>
            <div><span>展示方式</span><strong>{selected.pinned ? '置顶展示' : '按时间排序'}</strong></div>
          </div>
          <section><span>摘要</span><p>{selected.summary}</p></section>
          <section><span>正文</span><div className="announcement-management__content">{selected.content}</div></section>
          <dl><div><dt>计划发布时间</dt><dd>{selected.publishAt ? formatTime(selected.publishAt) : '尚未设置'}</dd></div>
            <div><dt>有效期至</dt><dd>{selected.expireAt ? formatTime(selected.expireAt) : '长期有效'}</dd></div>
            <div><dt>最后更新</dt><dd>{formatTime(selected.updatedAt)}</dd></div></dl>
          <footer>
            {selected.status === 'DRAFT' && <Button variant="secondary" onClick={() => setEditor(selected)}>编辑</Button>}
            {selected.status === 'DRAFT' && <Button onClick={() => setPublisher(selected)}>发布公告</Button>}
            {(['PUBLISHED', 'SCHEDULED'] as AnnouncementStatus[]).includes(selected.status) &&
              <Button variant="danger" busy={withdraw.isPending} onClick={() => withdraw.mutate(selected)}>撤回公告</Button>}
          </footer>
        </div>}
      </Panel>
    </section>
    {editor && <AnnouncementEditor value={editor === 'create' ? undefined : editor} context={clinicalContext} busy={busy}
      onClose={() => setEditor(undefined)} onSubmit={(input) => editor === 'create' ? create.mutate(input)
        : update.mutate({ value: editor, input })} />}
    {publisher && <PublishAnnouncement value={publisher} busy={publish.isPending} onClose={() => setPublisher(undefined)}
      onSubmit={(publishAt, expireAt) => publish.mutate({ value: publisher, publishAt, expireAt })} />}
  </>
}

function AnnouncementEditor({ value, context, busy, onClose, onSubmit }: {
  value?: SystemAnnouncement; context: ClinicalContext; busy: boolean; onClose: () => void
  onSubmit: (input: AnnouncementDraft) => void
}) {
  const [scopeType, setScopeType] = useState<AnnouncementScope>(value?.scopeType ?? 'TENANT')
  const [category, setCategory] = useState<AnnouncementCategory>(value?.category ?? 'GENERAL')
  const [priority, setPriority] = useState<AnnouncementPriority>(value?.priority ?? 'NORMAL')
  const [title, setTitle] = useState(value?.title ?? '')
  const [summary, setSummary] = useState(value?.summary ?? '')
  const [content, setContent] = useState(value?.content ?? '')
  const [pinned, setPinned] = useState(value?.pinned ?? false)
  function submit(event: FormEvent) {
    event.preventDefault()
    onSubmit({ scopeType, organizationId: scopeType === 'TENANT' ? undefined : context.organization.id,
      departmentId: scopeType === 'DEPARTMENT' ? context.department.id : undefined,
      category, priority, title: title.trim(), summary: summary.trim(), content: content.trim(), pinned })
  }
  return <Dialog title={value ? '编辑公告草稿' : '新建系统公告'} eyebrow="公告编辑" size="wide" onClose={onClose}
    description="公告正文按纯文本保存，避免在门户展示不受控富文本。"
    footer={<><Button variant="secondary" onClick={onClose}>取消</Button>
      <Button type="submit" form="announcement-editor" busy={busy}>保存草稿</Button></>}>
    <form id="announcement-editor" className="announcement-editor" onSubmit={submit}>
      <div className="ui-form-row"><FormField label="发布范围" required><Select value={scopeType} showValue clearable={false}
        onChange={(next) => setScopeType(next as AnnouncementScope)} options={Object.entries(scopeText).map(([key, label]) => ({
          value: key, label, secondaryText: key === 'ORGANIZATION' ? context.organization.name
            : key === 'DEPARTMENT' ? context.department.name : '当前租户全部用户',
        }))} /></FormField>
        <FormField label="公告分类" required><Select value={category} showValue clearable={false}
          onChange={(next) => setCategory(next as AnnouncementCategory)}
          options={Object.entries(categoryText).map(([key, label]) => ({ value: key, label }))} /></FormField>
        <FormField label="优先级" required><Select value={priority} showValue clearable={false}
          onChange={(next) => setPriority(next as AnnouncementPriority)}
          options={Object.entries(priorityText).map(([key, label]) => ({ value: key, label }))} /></FormField></div>
      <FormField label="公告标题" required><input autoFocus maxLength={200} value={title}
        onChange={(event) => setTitle(event.target.value)} required /></FormField>
      <FormField label="公告摘要" required hint={`${summary.length}/500`}><textarea rows={2} maxLength={500} value={summary}
        onChange={(event) => setSummary(event.target.value)} required /></FormField>
      <FormField label="公告正文" required hint={`${content.length}/20000`}><textarea rows={10} maxLength={20000} value={content}
        onChange={(event) => setContent(event.target.value)} required /></FormField>
      <label className="announcement-editor__pin"><input type="checkbox" checked={pinned}
        onChange={(event) => setPinned(event.target.checked)} /><span>置顶展示该公告</span></label>
    </form>
  </Dialog>
}

function PublishAnnouncement({ value, busy, onClose, onSubmit }: { value: SystemAnnouncement; busy: boolean
  onClose: () => void; onSubmit: (publishAt?: string, expireAt?: string) => void }) {
  const [publishAt, setPublishAt] = useState('')
  const [expireAt, setExpireAt] = useState('')
  function submit(event: FormEvent) {
    event.preventDefault()
    onSubmit(publishAt ? new Date(publishAt).toISOString() : undefined,
      expireAt ? new Date(expireAt).toISOString() : undefined)
  }
  return <Dialog title="发布系统公告" eyebrow={value.title} onClose={onClose}
    description="不填写发布时间将立即发布；不填写失效时间则长期有效。"
    footer={<><Button variant="secondary" onClick={onClose}>取消</Button>
      <Button form="announcement-publish" type="submit" busy={busy}>{publishAt ? '安排发布' : '立即发布'}</Button></>}>
    <form id="announcement-publish" className="announcement-publish" onSubmit={submit}>
      <FormField label="发布时间"><input type="datetime-local" value={publishAt}
        onChange={(event) => setPublishAt(event.target.value)} /></FormField>
      <FormField label="失效时间"><input type="datetime-local" value={expireAt} min={publishAt}
        onChange={(event) => setExpireAt(event.target.value)} /></FormField>
    </form>
  </Dialog>
}

function statusTone(status: AnnouncementStatus): 'neutral' | 'info' | 'success' | 'warning' {
  if (status === 'PUBLISHED') return 'success'
  if (status === 'SCHEDULED') return 'info'
  if (status === 'DRAFT') return 'warning'
  return 'neutral'
}
