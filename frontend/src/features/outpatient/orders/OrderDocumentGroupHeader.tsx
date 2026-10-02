import { Button, Popconfirm } from '../../../shared/ui'
import { IconAlertCircle, IconFlask, IconPill, IconPlant2, IconPrinter, IconScan, IconTrash, IconFileText } from '@tabler/icons-react'
import { formatCurrency } from '../../../shared/utils/precision'

export function OrderDocumentGroupHeader({
  title,
  kind,
  dept,
  specimen,
  itemCount,
  itemUnit = '项',
  subtotal,
  currencyCode = 'CNY',
  missingFields = [],
  isSelected,
  canPrint,
  onPrint,
  canCancel,
  onCancel,
  children,
}: {
  title: string
  docLabel?: string
  kind: 'lab' | 'exam' | 'western' | 'patent' | 'herbal' | 'treatment'
  isDraft?: boolean
  dept?: string
  specimen?: string
  itemCount: number
  itemUnit?: string
  subtotal: number
  currencyCode?: string
  missingFields?: string[]
  isSelected?: boolean
  canPrint?: boolean
  onPrint?: () => void
  canCancel?: boolean
  onCancel?: () => void
  children?: React.ReactNode
}) {
  const renderIcon = () => {
    switch (kind) {
      case 'lab':
        return <span className="doctor-group-icon is-lab"><IconFlask size={16} stroke={1.75} /></span>
      case 'exam':
        return <span className="doctor-group-icon is-exam"><IconScan size={16} stroke={1.75} /></span>
      case 'herbal':
        return <span className="doctor-group-icon is-herbal"><IconPlant2 size={16} stroke={1.75} /></span>
      case 'treatment':
        return <span className="doctor-group-icon"><IconFileText size={16} stroke={1.75} /></span>
      case 'patent':
      case 'western':
      default:
        return <span className="doctor-group-icon"><IconPill size={16} stroke={1.75} /></span>
    }
  }

  return (
    <div className={`doctor-order-group-header${isSelected ? ' is-selected' : ''}`} aria-label={`${title}分组`}>
      <div className="doctor-group-header-left">
        {renderIcon()}
        <strong className="doctor-group-title">{title}</strong>
        {dept && <span className="doctor-group-tag is-dept">{dept}</span>}
        {specimen && <span className="doctor-group-tag">{specimen}</span>}
        <span className="doctor-group-tag">共 {itemCount} {itemUnit}</span>
        {missingFields.length > 0 && (
          <span className="doctor-group-tag is-missing" title={`需补充：${missingFields.join('、')}`}>
            <IconAlertCircle size={13} stroke={2} /> 待完善（{missingFields.join('、')}）
          </span>
        )}
      </div>

      {children && <div className="doctor-group-header-middle">{children}</div>}

      <div className="doctor-group-header-right">
        {subtotal > 0 && (
          <span className="doctor-group-subtotal">
            小计 <strong>{formatCurrency(subtotal, currencyCode)}</strong>
          </span>
        )}
        <div className="doctor-group-actions">
          {canCancel && onCancel && (
            <Popconfirm
              title={`确认撤销“${title}”整单医嘱？`}
              okText="撤销"
              okVariant="danger"
              onConfirm={onCancel}
            >
              <Button
                size="sm"
                variant="text"
                aria-label={`撤销${title}整单`}
                title={`撤销${title}整单`}
              >
                <IconTrash size={16} stroke={1.75} />
              </Button>
            </Popconfirm>
          )}
          {canPrint && onPrint && (
            <Button
              size="sm"
              variant="text"
              onClick={onPrint}
              aria-label={`打印${title}`}
              title={`受控打印${title}`}
            >
              <IconPrinter size={16} stroke={1.75} />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
