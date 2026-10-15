import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import type { DiagnosticImage } from '../api/diagnosticsApi'
import { errorMessage } from '../rhnApi'
import { Alert, Button, Dialog } from '../ui'
import './diagnosticImages.css'

/** Authenticated downloads only; object URLs never survive the patient/report component. */
export function DiagnosticImagePreview({
  image,
  load,
  isPrimary = false,
  onSetPrimary,
}: {
  image: DiagnosticImage
  load: () => Promise<Blob>
  isPrimary?: boolean
  onSetPrimary?: () => void
}) {
  const [url, setUrl] = useState('')
  const [showLightbox, setShowLightbox] = useState(false)
  const mounted = useRef(true)
  const preview = useMutation({
    mutationFn: load,
    onSuccess: (blob) => {
      if (!mounted.current) return
      setUrl(URL.createObjectURL(blob))
    },
  })
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url)
  }, [url])

  return (
    <>
      <figure className="diagnostic-image-preview">
        {url ? (
          <div
            className="diagnostic-image-thumbnail-wrapper"
            onClick={() => setShowLightbox(true)}
            role="button"
            tabIndex={0}
            title="点击放大查看高清影像"
          >
            <img src={url} alt={image.caption || '检查关键图像'} />
            {isPrimary && <span className="diagnostic-primary-image-badge">★ 报告主图</span>}
          </div>
        ) : (
          <Button variant="secondary" busy={preview.isPending} onClick={() => preview.mutate()}>
            查看关键图像
          </Button>
        )}
        <figcaption>
          {image.caption || '未填写图像说明'} · {image.width}×{image.height}
        </figcaption>
        {url && (
          <div className="ui-form-actions">
            <Button size="sm" variant="text" onClick={() => setShowLightbox(true)}>
              放大查看
            </Button>
            {onSetPrimary && !isPrimary && (
              <Button size="sm" variant="text" onClick={onSetPrimary}>
                设为主图
              </Button>
            )}
          </div>
        )}
        {preview.error && <Alert>{errorMessage(preview.error)}</Alert>}
      </figure>

      {showLightbox && (
        <Dialog
          title={image.caption || '医学影像高清阅片'}
          description={`图像规格：${image.width} × ${image.height} 像素`}
          onClose={() => setShowLightbox(false)}
          footer={
            <Button variant="secondary" onClick={() => setShowLightbox(false)}>
              关闭阅片
            </Button>
          }
        >
          <div className="diagnostic-lightbox-container">
            <img
              src={url}
              alt={image.caption || '全屏高清医学影像'}
              className="diagnostic-lightbox-img"
            />
          </div>
        </Dialog>
      )}
    </>
  )
}

