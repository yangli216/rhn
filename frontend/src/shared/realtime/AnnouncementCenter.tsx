import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { RhnApi, SystemAnnouncement } from '../rhnApi'
import { errorMessage } from '../rhnApi'
import { Alert, Button, Dialog, EmptyState, Icon, IconButton, LoadingState, StatusBadge } from '../ui'
import { formatTime } from '../format'
import { requireAnnouncementSummary, requirePublishedAnnouncements } from './announcementFacts'

const categoryText = { GENERAL: '综合公告', POLICY: '制度政策', MAINTENANCE: '系统维护', EMERGENCY: '紧急通知' }
const priorityText = { NORMAL: '普通', IMPORTANT: '重要', URGENT: '紧急' }

export function AnnouncementCenter(props: { api: RhnApi; contextKey: string }) {
  return <ContextAnnouncementCenter key={props.contextKey} {...props} />
}

function ContextAnnouncementCenter({ api, contextKey }: { api: RhnApi; contextKey: string }) {
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string>()
  const queryClient = useQueryClient()
  const summaryKey = ['announcement-summary', contextKey]
  const listKey = ['announcements', contextKey]
  const summary = useQuery({ queryKey: summaryKey, queryFn: async () => requireAnnouncementSummary(await api.announcements.summary()), refetchInterval: 60_000 })
  const announcements = useQuery({ queryKey: listKey, queryFn: async () => requirePublishedAnnouncements(await api.announcements.active()), enabled: open })
  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const value = await api.announcements.markRead(id)
      requirePublishedAnnouncements([value])
      if (value.id !== id || value.read !== true) throw new Error('公告已读回执不匹配，请重新读取核实。')
      return value
    },
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: listKey }),
      queryClient.invalidateQueries({ queryKey: summaryKey }),
    ]),
  })
  const available = announcements.isSuccess && !announcements.isFetching
  const selected = available ? announcements.data.find((value) => value.id === selectedId) : undefined
  const counts = summary.isSuccess && !summary.isFetching ? summary.data : undefined
  const unread = counts?.unread
  const description = counts ? counts.importantUnread > 0
    ? `${counts.importantUnread} 条重要公告尚未阅读` : `${counts.unread} 条公告未读`
    : summary.isError ? '公告未读数暂不可用' : '正在核实公告未读数…'

  function inspect(value: SystemAnnouncement) {
    setSelectedId(value.id)
    if (!value.read) markRead.mutate(value.id)
  }

  return <div className={`announcement-button ${unread ? 'is-active' : ''}`}>
    <IconButton icon="roadmap" label={unread !== undefined ? `系统公告，${unread} 条未读` : `系统公告，${description}`} onClick={() => setOpen(true)} />
    {unread !== undefined && unread > 0 && <span className="announcement-button__count">{unread > 99 ? '99+' : unread}</span>}
    {open && <Dialog title="系统公告" eyebrow="工作门户" size="wide"
      description={description}
      onClose={() => { setOpen(false); setSelectedId(undefined) }}>
      {summary.isError && <EmptyState icon="roadmap" title="公告统计加载失败" copy={errorMessage(summary.error)}
        action={<Button variant="secondary" onClick={() => void summary.refetch()}>重新加载公告统计</Button>} />}
      {announcements.isError && <EmptyState icon="roadmap" title="公告列表加载失败" copy={errorMessage(announcements.error)}
        action={<Button variant="secondary" onClick={() => void announcements.refetch()}>重新加载公告</Button>} />}
      {markRead.error && <Alert duration={null}>{errorMessage(markRead.error)}</Alert>}
      {(announcements.isPending || announcements.isFetching) && <LoadingState label="正在加载公告…" />}
      {available && announcements.data.length === 0 && <EmptyState icon="roadmap"
        title="当前没有有效公告" copy="面向当前机构和科室的公告会显示在这里。" />}
      {available && announcements.data.length > 0 && <div className="announcement-center">
        <div className="announcement-center__list">{announcements.data.map((value) =>
          <button type="button" key={value.id} className={`${value.read ? '' : 'is-unread'} ${selectedId === value.id ? 'is-selected' : ''}`}
            disabled={markRead.isPending} onClick={() => inspect(value)}>
            <span><StatusBadge tone={value.priority === 'URGENT' ? 'danger' : value.priority === 'IMPORTANT' ? 'warning' : 'neutral'}>
              {priorityText[value.priority]}</StatusBadge>{value.pinned && <Icon name="roadmap" />}</span>
            <strong>{value.title}</strong><p>{value.summary}</p><small>{formatTime(value.publishedAt)}</small>
          </button>)}</div>
        <article className="announcement-center__detail">
          {!selected && <EmptyState icon="roadmap" title="选择一条公告" copy="查看完整公告正文和发布时间。" />}
          {selected && <><header><div><span>{categoryText[selected.category]}</span><h3>{selected.title}</h3></div>
            <StatusBadge tone={selected.priority === 'URGENT' ? 'danger' : selected.priority === 'IMPORTANT' ? 'warning' : 'info'}>
              {priorityText[selected.priority]}</StatusBadge></header>
            <p className="announcement-center__summary">{selected.summary}</p>
            <div className="announcement-center__content">{selected.content}</div>
            <footer><span>实际发布时间：{formatTime(selected.publishedAt)}</span>
              <span>生效时间：{formatTime(selected.publishAt)}</span>
              {selected.expireAt && <span>有效期至：{formatTime(selected.expireAt)}</span>}</footer></>}
        </article>
      </div>}
      <div className="announcement-center__footer"><Button variant="secondary" onClick={() => setOpen(false)}>关闭</Button></div>
    </Dialog>}
  </div>
}
