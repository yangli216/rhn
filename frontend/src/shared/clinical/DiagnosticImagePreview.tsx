import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import type { DiagnosticImage } from '../api/diagnosticsApi'
import { errorMessage } from '../rhnApi'
import { Alert, Button } from '../ui'
import './diagnosticImages.css'

/** Authenticated downloads only; object URLs never survive the patient/report component. */
export function DiagnosticImagePreview({ image, load }: { image: DiagnosticImage; load: () => Promise<Blob> }) {
  const [url, setUrl] = useState('')
  const mounted = useRef(true)
  const preview = useMutation({ mutationFn: load, onSuccess: (blob) => {
    if (!mounted.current) return
    setUrl(URL.createObjectURL(blob))
  } })
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  return <figure className="diagnostic-image-preview">
    {url ? <img src={url} alt={image.caption || '检查关键图像'} /> : <Button variant="secondary"
      busy={preview.isPending} onClick={() => preview.mutate()}>查看关键图像</Button>}
    <figcaption>{image.caption || '未填写图像说明'} · {image.width}×{image.height}</figcaption>
    {preview.error && <Alert>{errorMessage(preview.error)}</Alert>}
  </figure>
}
