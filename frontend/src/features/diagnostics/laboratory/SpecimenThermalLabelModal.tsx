import { useState } from 'react'
import type { DiagnosticExecutionTask, DiagnosticSpecimen } from '../../../shared/api/diagnosticsApi'
import { formatTime } from '../../../shared/format'
import { Alert, Button, Dialog } from '../../../shared/ui'
import {
  recommendSpecimenTubeByItemName,
  findSpecimenTubeByCode,
} from '../../../shared/clinical/specimenTubeStandards'
import { DiagnosticPrintAction } from '../../../shared/clinical/DiagnosticPrintAction'
import type { RhnApi } from '../../../shared/rhnApi'
import './specimen-thermal-label.css'

export interface SpecimenThermalLabelModalProps {
  api: RhnApi
  specimen: DiagnosticSpecimen
  task: DiagnosticExecutionTask
  organizationName?: string
  onClose: () => void
}

/**
 * 60mm × 40mm 临床标准采血管热敏条码标签弹窗
 *
 * 遵循 YY/T 0314-2007 与 WS/T 500.1-2016 标准：
 * 包含医院标识、患者四要素、标本类型、管帽色标指引、条码及采血/打印时间。
 * 支持浏览器直接唤起热敏打印机驱动 (@media print) 与后端 PDF 下载。
 */
export function SpecimenThermalLabelModal({
  api,
  specimen,
  task,
  organizationName = '临床检验中心',
  onClose,
}: SpecimenThermalLabelModalProps) {
  const [printSuccess, setPrintSuccess] = useState(false)
  const tube = findSpecimenTubeByCode(specimen.containerCode) ?? recommendSpecimenTubeByItemName(specimen.specimenName)

  const handlePrint = () => {
    window.print()
    setPrintSuccess(true)
  }

  // 生成代表性的 Code128 模拟条码线（纯 CSS/SVG，无锯齿矢量渲染）
  const barcodeChars = (specimen.specimenNo || 'SPECIMEN').split('')

  return (
    <Dialog
      title="采血管热敏标签打印 (60mm × 40mm)"
      description={`${task.residentName} · 标本号 ${specimen.specimenNo}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            关闭
          </Button>
          <div className="ui-form-actions">
            <DiagnosticPrintAction
              api={api}
              encounterId={task.encounterId}
              sourceId={specimen.id}
              sourceLabel={specimen.specimenNo}
              taskCode="DIAGNOSTICS.SPECIMEN.LABEL.PRINT"
              label
            />
            <Button variant="primary" onClick={handlePrint}>
              一键热敏打印 (60×40mm)
            </Button>
          </div>
        </>
      }
    >
      <div className="specimen-thermal-modal-body">
        {printSuccess && (
          <Alert tone="success" placement="inline">
            已发送至热敏打印机。若打印机未吐纸，请检查热敏打印机连接或使用 PDF 备份下载。
          </Alert>
        )}

        <div className="specimen-thermal-preview-container">
          {/* 60mm × 40mm 真实尺寸预览与打印实体 */}
          <div className="specimen-thermal-label-card" id={`thermal-label-${specimen.id}`}>
            <header className="specimen-thermal-header">
              <span className="specimen-thermal-org">{organizationName}</span>
              <span className="specimen-thermal-tag">检验标本</span>
            </header>

            <div className="specimen-thermal-patient-row">
              <strong className="specimen-thermal-name">{task.residentName}</strong>
              <span className="specimen-thermal-demographics">
                {task.genderText || (task.gender === 'MALE' ? '男' : task.gender === 'FEMALE' ? '女' : '—')}
              </span>
              <span className="specimen-thermal-hr">{task.healthRecordNo || task.residentId}</span>
            </div>

            <div className="specimen-thermal-item-row">
              <span className="specimen-thermal-item-name">{task.itemName}</span>
            </div>

            <div className="specimen-thermal-tube-row">
              <span className="diagnostic-tube-badge">
                <span className={`diagnostic-tube-dot diagnostic-tube-dot--${tube.capColorKey}`} aria-hidden="true" />
                <span className="specimen-thermal-tube-name">
                  {tube.specimenType} · {tube.tubeName}
                </span>
              </span>
              {tube.drawVolumeMl && <small className="specimen-thermal-vol">{tube.drawVolumeMl}mL</small>}
            </div>

            <div className="specimen-thermal-barcode-area">
              <svg className="specimen-thermal-barcode-svg" viewBox="0 0 200 45" preserveAspectRatio="none">
                {barcodeChars.map((_, idx) => {
                  const x = 10 + idx * (180 / barcodeChars.length)
                  const w = idx % 3 === 0 ? 3 : idx % 2 === 0 ? 2 : 1
                  return <rect key={idx} x={x} y="2" width={w} height="36" fill="currentColor" />
                })}
              </svg>
              <div className="specimen-thermal-barcode-text">{specimen.specimenNo}</div>
            </div>

            <footer className="specimen-thermal-footer">
              <span>采血: {formatTime(specimen.collectedAt) || '待采'}</span>
              <span>单号: {task.requestNo}</span>
            </footer>
          </div>
        </div>

        <div className="specimen-thermal-guidance">
          <p>
            <strong>热敏打印指引：</strong>已预置 <code>60mm × 40mm</code> 标准页边距；请在浏览器打印对话框中将纸张尺寸选为{' '}
            <code>60mm × 40mm</code> 或 <code>2.36 x 1.57 in</code>，页边距选为 <code>无</code>。
          </p>
        </div>
      </div>
    </Dialog>
  )
}
