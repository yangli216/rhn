import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { RhnApi, SystemAnnouncement } from '../rhnApi'
import { errorMessage } from '../rhnApi'
import { Alert, Button, Dialog, EmptyState, Icon, IconButton, LoadingState, StatusBadge } from '../ui'
import { formatTime } from '../format'

const categoryText = { GENERAL: '综合公告', POLICY: '制度政策', MAINTENANCE: '系统维护', EMERGENCY: '紧急通知' }
const priorityText = { NORMAL: '普通', IMPORTANT: '重要', URGENT: '紧急' }

export function AnnouncementCenter({ api, contextKey }: { api: RhnApi; contextKey: string }) {
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string>()
  const queryClient = useQueryClient()
  const summaryKey = ['announcement-summary', contextKey]
  const listKey = ['announcements', contextKey]
  const summary = useQuery({ queryKey: summaryKey, queryFn: api.announcements.summary, refetchInterval: 60_000 })
  const announcements = useQuery({ queryKey: listKey, queryFn: api.announcements.active, enabled: open })
  const markRead = useMutation({
    mutationFn: api.announcements.markRead,
    onSuccess: (value) => {
      queryClient.setQueryData<SystemAnnouncement[]>(listKey,
        (current) => current?.map((item) => item.id === value.id ? value : item))
      void queryClient.invalidateQueries({ queryKey: summaryKey })
    },
  })
  const selected = announcements.data?.find((value) => value.id === selectedId)
  const unread = summary.data?.unread ?? 0

  function inspect(value: SystemAnnouncement) {
    setSelectedId(value.id)
    if (!value.read) markRead.mutate(value.id)
  }

  return <div className={`announcement-button ${unread ? 'is-active' : ''}`}>
    <IconButton icon="roadmap" label={unread ? `系统公告，${unread} 条未读` : '系统公告'} onClick={() => setOpen(true)} />
    {unread > 0 && <span className="announcement-button__count">{unread > 99 ? '99+' : unread}</span>}
    {open && <Dialog title="系统公告" eyebrow="工作门户" size="wide"
      description={summary.data?.importantUnread ? `${summary.data.importantUnread} 条重要公告尚未阅读` : `${unread} 条公告未读`}
      onClose={() => { setOpen(false); setSelectedId(undefined) }}>
      {(announcements.error || markRead.error) && <Alert>{errorMessage(announcements.error || markRead.error)}</Alert>}
      {announcements.isPending && <LoadingState label="正在加载公告…" />}
      {!announcements.isPending && !announcements.data?.length && <EmptyState icon="roadmap"
        title="当前没有有效公告" copy="面向当前机构和科室的公告会显示在这里。" />}
      {announcements.data && announcements.data.length > 0 && <div className="announcement-center">
        <div className="announcement-center__list">{announcements.data.map((value) =>
          <button type="button" key={value.id} className={`${value.read ? '' : 'is-unread'} ${selectedId === value.id ? 'is-selected' : ''}`}
            onClick={() => inspect(value)}>
            <span><StatusBadge tone={value.priority === 'URGENT' ? 'danger' : value.priority === 'IMPORTANT' ? 'warning' : 'neutral'}>
              {priorityText[value.priority]}</StatusBadge>{value.pinned && <Icon name="roadmap" />}</span>
            <strong>{value.title}</strong><p>{value.summary}</p><small>{formatTime(value.publishAt ?? value.createdAt)}</small>
          </button>)}</div>
        <article className="announcement-center__detail">
          {!selected && <EmptyState icon="roadmap" title="选择一条公告" copy="查看完整公告正文和发布时间。" />}
          {selected && <><header><div><span>{categoryText[selected.category]}</span><h3>{selected.title}</h3></div>
            <StatusBadge tone={selected.priority === 'URGENT' ? 'danger' : selected.priority === 'IMPORTANT' ? 'warning' : 'info'}>
              {priorityText[selected.priority]}</StatusBadge></header>
            <p className="announcement-center__summary">{selected.summary}</p>
            <div className="announcement-center__content">{selected.content}</div>
            <footer><span>发布时间：{formatTime(selected.publishAt ?? selected.createdAt)}</span>
              {selected.expireAt && <span>有效期至：{formatTime(selected.expireAt)}</span>}</footer></>}
        </article>
      </div>}
      <div className="announcement-center__footer"><Button variant="secondary" onClick={() => setOpen(false)}>关闭</Button></div>
    </Dialog>}
  </div>
}
