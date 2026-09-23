import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { errorMessage, type RhnApi, type StandardCatalogIdentity } from '../../shared/rhnApi'
import { Button, Dialog, LoadingState } from '../../shared/ui'
import { StandardCatalogComparison } from './StandardCatalogComparison'
import './standard-catalog-source-review.css'

export function StandardCatalogSourceReviewDialog({api, onClose, editionId = '0'}: {api: RhnApi; onClose: () => void; editionId?: string}) {
  const [busy, setBusy] = useState(false)
  const content = useQuery({queryKey: ['catalog-review-content', editionId], queryFn: () => api.standardCatalogEditions.content(editionId), retry: false})
  const value = content.data
  const source = value?.source as Record<string, unknown> | undefined
  const identity: StandardCatalogIdentity | undefined = value && source ? {catalogId: String(value.catalogId), catalogVersion: String(value.catalogVersion), contentHash: String(value.contentHash), sourceHash: String(source.sha256)} : undefined
  return <Dialog title="国家基本药物目录（2026年版）· 逐条核对" size="xwide" className="catalog-review-dialog" onClose={busy ? () => {} : onClose} closeOnBackdrop={false} enterNavigation={false}>
    {content.isPending && <LoadingState label="正在读取电子目录…" />}
    {content.isError && <p role="alert">{errorMessage(content.error)} <Button onClick={() => void content.refetch()}>重试</Button></p>}
    {!content.isError && value && identity && <StandardCatalogComparison key={JSON.stringify(identity)} api={api} identity={identity} content={value} editionId={editionId} onBusy={setBusy} />}
    <div className="catalog-review__utility"><span>逐条核对仅记录转录结果，不改变临床可用状态。</span></div>
  </Dialog>
}
