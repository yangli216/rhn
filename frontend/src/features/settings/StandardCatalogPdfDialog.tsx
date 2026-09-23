import { useEffect, useState } from 'react'
import { errorMessage, type RhnApi, type StandardMedicationDetail, type StandardMedicationPdfLocation } from '../../shared/rhnApi'
import { Button, Dialog, Tabs } from '../../shared/ui'
import './standard-catalog-pdf-dialog.css'

let cachedCatalogPdfBlob: Blob | null = null

export function StandardCatalogPdfDialog({
  api,
  entry,
  initialLocation,
  onClose,
}: {
  api: RhnApi
  entry?: StandardMedicationDetail | null
  initialLocation?: string
  onClose: () => void
}) {
  const locations: StandardMedicationPdfLocation[] = entry?.pdfLocations || []
  const initialIndex = Math.max(
    0,
    locations.findIndex((l) => l.location === initialLocation),
  )
  const [activeIndex, setActiveIndex] = useState(initialIndex)
  const [blobUrl, setBlobUrl] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(!cachedCatalogPdfBlob)
  const [error, setError] = useState<string>('')

  const active = locations[activeIndex] || locations[0]
  const targetPage = active?.page ?? 15
  const printPage = active?.printPage ?? (targetPage - 12)

  const loadPdf = () => {
    if (cachedCatalogPdfBlob) {
      const url = URL.createObjectURL(cachedCatalogPdfBlob)
      setBlobUrl(url)
      setLoading(false)
      setError('')
      return
    }
    setLoading(true)
    setError('')
    api.masterData
      .downloadStandardCatalogSourceDocument()
      .then((blob) => {
        cachedCatalogPdfBlob = blob
        const url = URL.createObjectURL(blob)
        setBlobUrl(url)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setLoading(false)
        setError(errorMessage(err))
      })
  }

  useEffect(() => {
    let currentUrl = ''
    if (cachedCatalogPdfBlob) {
      currentUrl = URL.createObjectURL(cachedCatalogPdfBlob)
      setBlobUrl(currentUrl)
      setLoading(false)
    } else {
      setLoading(true)
      setError('')
      api.masterData
        .downloadStandardCatalogSourceDocument()
        .then((blob) => {
          cachedCatalogPdfBlob = blob
          currentUrl = URL.createObjectURL(blob)
          setBlobUrl(currentUrl)
          setLoading(false)
        })
        .catch((err: unknown) => {
          setLoading(false)
          setError(errorMessage(err))
        })
    }

    return () => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl)
      }
    }
  }, [api])

  const iframeSrc = blobUrl ? `${blobUrl}#page=${targetPage}` : ''

  const handleDownload = () => {
    if (!blobUrl && !cachedCatalogPdfBlob) return
    const url = blobUrl || URL.createObjectURL(cachedCatalogPdfBlob!)
    const a = document.createElement('a')
    a.href = url
    a.download = '国家基本药物目录（2026年版）.pdf'
    a.click()
    if (!blobUrl) URL.revokeObjectURL(url)
  }

  const handleOpenNewWindow = () => {
    if (iframeSrc) {
      window.open(iframeSrc, '_blank')
    }
  }

  return (
    <Dialog
      title="《国家基本药物目录（2026年版）》官方原件核验"
      eyebrow={entry ? `${entry.name}${entry.innName ? ` (${entry.innName})` : ''} · 原文位置核对` : '官方正式印发版'}
      size="xwide"
      className="catalog-pdf-dialog-modal"
      onClose={onClose}
      enterNavigation={false}
    >
      <div className="catalog-pdf-dialog">
        <div className="catalog-pdf-dialog__toolbar">
          <div className="catalog-pdf-dialog__meta-group">
            {entry && (
              <>
                <span className="catalog-pdf-dialog__drug-tag">
                  {entry.name}
                  {entry.innName && <span className="catalog-pdf-dialog__inn"> ({entry.innName})</span>}
                </span>
                {entry.legacyCode && <code className="catalog-pdf-dialog__code">{entry.legacyCode}</code>}
                <span className="catalog-pdf-dialog__sep">|</span>
              </>
            )}
            <span className="catalog-pdf-dialog__page-badge">
              物理页码 <strong>第 {targetPage} 页</strong>
            </span>
            <span className="catalog-pdf-dialog__page-badge">
              印发版心 <strong>P.{printPage}</strong>
            </span>
            {active?.location && (
              <span className="catalog-pdf-dialog__page-badge">
                位置 <code>{active.location}</code>
              </span>
            )}
            <span
              className="catalog-pdf-dialog__pub-badge"
              title="国卫药政发〔2026〕17号（2026-09-01 施行）· SHA-256: 25671de0d85d12e409d79764d48865522e03122d8e9c1b0957a7ad1c8bf97e8e"
            >
              国卫药政发〔2026〕17号
            </span>
          </div>

          <div className="catalog-pdf-dialog__actions">
            <Button
              variant="secondary"
              size="sm"
              disabled={loading || !blobUrl}
              onClick={handleOpenNewWindow}
            >
              在新窗口打开
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={loading || (!blobUrl && !cachedCatalogPdfBlob)}
              onClick={handleDownload}
            >
              下载原件 PDF
            </Button>
          </div>
        </div>

        {locations.length > 1 && (
          <div className="catalog-pdf-dialog__tabs-wrap">
            <Tabs
              label="多出处跳转"
              value={String(activeIndex)}
              onChange={(val) => setActiveIndex(Number(val))}
              items={locations.map((loc, idx) => ({
                value: String(idx),
                label: `出处 ${idx + 1}：${loc.location} (第 ${loc.page} 页 / P.${loc.printPage})`,
              }))}
            />
          </div>
        )}

        <div className="catalog-pdf-dialog__viewer-container">
          {loading && (
            <div className="catalog-pdf-dialog__loading">
              <span className="catalog-pdf-dialog__loading-text">
                正在加载国家基本药物目录官方原件 PDF (共 137 页)...
              </span>
            </div>
          )}
          {error && (
            <div className="catalog-pdf-dialog__error">
              <span className="catalog-pdf-dialog__error-text">{error}</span>
              <Button variant="secondary" size="sm" onClick={loadPdf}>
                重试加载
              </Button>
            </div>
          )}
          {!loading && !error && blobUrl && (
            <iframe
              key={`${blobUrl}#page=${targetPage}`}
              src={iframeSrc}
              className="catalog-pdf-dialog__iframe"
              title={`国家基本药物目录官方原件 - 第 ${targetPage} 页`}
            />
          )}
        </div>
      </div>
    </Dialog>
  )
}
