import { useState } from 'react'
import { Alert, Button, DataTable, Dialog, FormField, Select, StatusBadge, tableCellClass } from '../../../shared/ui'
import { formatTime } from '../../../shared/format'

export interface CriticalItem {
  itemName: string
  itemCode?: string
  value: string
  unit?: string
  flag?: string
  criticalLevel?: string
  referenceRange?: string
}

export interface CriticalValueNoticeModalProps {
  isOpen: boolean
  onClose: () => void
  criticalItems: CriticalItem[]
  patientName: string
  healthRecordNo: string
  departmentName?: string
  operatorName?: string
  onConfirmNotice: (noticeRecord: string) => void
}

const COMMON_RECHECK_NOTES = [
  '已启动仪器原样重测复核，复测结果与首次一致，已电话通报临床接报人并提醒立即复查处置。',
  '已做离心标本外观与血清质量复核，标本无溶血脂血，复测结果一致，已口头通报。',
  '已由第二台备用仪器比对复核，结果在允许误差范围内，已电话通报病区当班医护。',
  '极速危急值复测无误，已通知临床医生，医生已知晓并已着手下达抢救医嘱。',
]

/**
 * 国家检验安全标准：危急值（Critical Value）电话通报登记卡
 * 依据 WS/T 404/405 与三级医院患者安全目标：
 * 凡化验指标达到危急值生命线，签发前必须进行复核并电话通报临床医护，闭环记录在案。
 */
export function CriticalValueNoticeModal({
  isOpen,
  onClose,
  criticalItems,
  patientName,
  healthRecordNo,
  departmentName = '门诊/临床科室',
  operatorName = '检验技师',
  onConfirmNotice,
}: CriticalValueNoticeModalProps) {
  const [dept, setDept] = useState(departmentName)
  const [recipientName, setRecipientName] = useState('')
  const [recipientPhone, setRecipientPhone] = useState('')
  const [recheckNote, setRecheckNote] = useState(COMMON_RECHECK_NOTES[0])
  const [customNote, setCustomNote] = useState('')
  const [noticeTime] = useState(() => new Date().toISOString())

  if (!isOpen) return null

  const handleConfirm = () => {
    if (!recipientName.trim()) return
    const finalNote = customNote.trim() ? customNote.trim() : recheckNote
    const record = `【危急值通报闭环】通报时间: ${formatTime(noticeTime) || noticeTime}；接报科室: ${dept.trim() || '临床科室'}；接报人员: ${recipientName.trim()}${
      recipientPhone.trim() ? ` (电话: ${recipientPhone.trim()})` : ''
    }；通报人: ${operatorName}；复核及处置说明: ${finalNote}。涉及危急指标: ${criticalItems
      .map((item) => `${item.itemName} ${item.value} ${item.unit || ''} [${item.flag || '危急'}]`)
      .join('；')}`
    onConfirmNotice(record)
    onClose()
  }

  return (
    <Dialog
      title="危急值口头电话通报登记卡 (国家临床安全规范)"
      description={`${patientName} (${healthRecordNo}) · 检测到 ${criticalItems.length} 项生命危急值`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            返回核对
          </Button>
          <Button
            variant="danger"
            disabled={!recipientName.trim()}
            onClick={handleConfirm}
          >
            确认通报登记并继续签发
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <Alert tone="error" placement="inline">
          <strong>严重生命危急值警示：</strong>
          本次化验包含以下危急值指标，已达到国家患者安全生命危急值界限！依据医疗安全管理规定，检验人员签发前必须复核并立即电话通报临床医护人员，完成闭环登记。
        </Alert>

        <section aria-label="危急值指标列表">
          <DataTable compact aria-label="危急指标清单">
            <thead>
              <tr>
                <th className={tableCellClass('text')}>检验项目</th>
                <th className={tableCellClass('numeric')}>测定结果</th>
                <th className={tableCellClass('text')}>参考区间</th>
                <th className={tableCellClass('status')}>危急报警</th>
              </tr>
            </thead>
            <tbody>
              {criticalItems.map((item, idx) => (
                <tr key={item.itemCode || idx}>
                  <td className={tableCellClass('text')}>{item.itemName}</td>
                  <td className={tableCellClass('numeric')}>
                    <strong>{item.value} {item.unit}</strong>
                  </td>
                  <td className={tableCellClass('text')}>{item.referenceRange || '—'}</td>
                  <td className={tableCellClass('status')}>
                    <StatusBadge tone="danger">
                      {item.flag === 'LL' || item.criticalLevel === 'CRITICAL_LOW' ? '↓↓ 极低危急' : '↑↑ 极高危急'}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </section>

        <section aria-label="电话通报登记表单" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
            <FormField label="接报临床科室" required>
              <input
                value={dept}
                onChange={(e) => setDept(e.target.value)}
                placeholder="例如：急诊内科、消化内科病区"
              />
            </FormField>
            <FormField label="接报医护人员姓名" required>
              <input
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="必填，例如：张医生、李护士长"
                autoFocus
              />
            </FormField>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
            <FormField label="接报人联系电话/分机号">
              <input
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                placeholder="例如：内线8021 或 手机号"
              />
            </FormField>
            <FormField label="通报人（当前技师）">
              <input value={operatorName} disabled />
            </FormField>
          </div>

          <FormField label="仪器复查说明模板">
            <Select
              id="critical-notice-recheck-select"
              aria-label="选择仪器复查说明模板"
              value={recheckNote}
              options={COMMON_RECHECK_NOTES.map((text) => ({ value: text, label: text }))}
              onChange={(val) => setRecheckNote(val)}
            />
          </FormField>

          <FormField label="补充自定义处置或复查备注">
            <textarea
              rows={2}
              value={customNote}
              placeholder="如需补充具体处置沟通细节或复查测定值，请在此输入…"
              onChange={(e) => setCustomNote(e.target.value)}
            />
          </FormField>
        </section>
      </div>
    </Dialog>
  )
}
