import { useState, type ReactNode } from "react";
import { type MedicationKnowledge, type MedicationProduct, type ItemPackage, type ActiveOrderFrequency, type MedicationRoute } from "../../../shared/rhnApi";
import { AnchoredPanel, Button, Dialog, EmptyState, Icon, LoadingState, StatusBadge, TableShell, Tooltip } from "../../../shared/ui";
import { Table, DataStatus, RowActions } from './masterDataShared'

export function MedicationTable({
  values, loading, pagination, mode = 'knowledge', routes, frequencies,
  onModeChange, onEdit, onAttributes: _onAttributes, onMappings, onProduct, onEditProduct, onPackage, onEditPackage, onViewProducts, onComposition,
}: {
  values?: MedicationKnowledge[]; loading: boolean; pagination: ReactNode;
  mode?: 'knowledge' | 'product';
  routes: MedicationRoute[]; frequencies: ActiveOrderFrequency[];
  onModeChange?: (mode: 'knowledge' | 'product') => void;
  onEdit: (value: MedicationKnowledge) => void;
  onAttributes?: (value: MedicationKnowledge) => void;
  onMappings?: (value: MedicationKnowledge) => void;
  onProduct: (value: MedicationKnowledge) => void;
  onEditProduct: (product: MedicationProduct, medication: MedicationKnowledge) => void;
  onPackage: (product: MedicationProduct, medication: MedicationKnowledge) => void;
  onEditPackage: (value: ItemPackage, product: MedicationProduct, medication: MedicationKnowledge) => void;
  onViewProducts?: (value: MedicationKnowledge) => void;
  onComposition?: (value: MedicationKnowledge) => void;
}) {
  const [popoverAnchor, setPopoverAnchor] = useState<{
    medication: MedicationKnowledge
    anchorRect: DOMRect
  } | null>(null)

  if (loading) return <LoadingState label="正在加载药品目录…" />
  if (!values?.length) return <TableShell footer={pagination}><EmptyState icon="pharmacy"
    title={mode === 'product' ? '未找到药品产品' : '未找到药品'}
    copy={mode === 'product' ? '请调整筛选条件，或到本院药品主档为药品建立厂家产品。' : '请调整筛选条件或新增通用药品知识。'} /></TableShell>

  if (mode === 'product') {
    return <MedicationProductTable
      values={values}
      pagination={pagination}
      onModeChange={onModeChange}
      onProduct={onProduct}
      onEditProduct={onEditProduct}
      onPackage={onPackage}
      onEditPackage={onEditPackage}
    />
  }

  const handleTogglePopover = (value: MedicationKnowledge, el: HTMLElement) => {
    onViewProducts?.(value)
    if (popoverAnchor?.medication.id === value.id) {
      setPopoverAnchor(null)
    } else {
      setPopoverAnchor({ medication: value, anchorRect: el.getBoundingClientRect() })
    }
  }

  return <>
    <MedicationKnowledgeTable
      values={values}
      pagination={pagination}
      routes={routes}
      frequencies={frequencies}
      onModeChange={onModeChange}
      onEdit={onEdit}
      onAttributes={_onAttributes}
      onMappings={onMappings}
      onComposition={onComposition}
      onProduct={onProduct}
      activePopoverMedicationId={popoverAnchor?.medication.id}
      onTogglePopover={handleTogglePopover}
      onViewProducts={onViewProducts}
    />
    {popoverAnchor && (
      <MedicationProductPopover
        medication={popoverAnchor.medication}
        anchorRect={popoverAnchor.anchorRect}
        onClose={() => setPopoverAnchor(null)}
        onProduct={onProduct}
        onEditProduct={onEditProduct}
        onPackage={onPackage}
        onEditPackage={onEditPackage}
        onModeChange={onModeChange}
      />
    )}
  </>
}

export function MedicationKnowledgeTable({
  values, pagination, routes, frequencies, onModeChange: _onModeChange,
  onEdit, onAttributes: _onAttributes, onMappings: _onMappings, onProduct, activePopoverMedicationId, onTogglePopover, onViewProducts, onComposition
}: {
  values: MedicationKnowledge[]; pagination: ReactNode; routes: MedicationRoute[]; frequencies: ActiveOrderFrequency[];
  onModeChange?: (mode: 'knowledge' | 'product') => void;
  onEdit: (value: MedicationKnowledge) => void;
  onAttributes?: (value: MedicationKnowledge) => void;
  onMappings?: (value: MedicationKnowledge) => void;
  onProduct: (value: MedicationKnowledge) => void;
  activePopoverMedicationId?: string;
  onTogglePopover?: (value: MedicationKnowledge, el: HTMLElement) => void;
  onViewProducts?: (value: MedicationKnowledge) => void;
  onComposition?: (value: MedicationKnowledge) => void;
}) {
  return <Table
    headers={['药品通用名', '分类与剂型', '规格与含量', '默认用法', '安全监管', '厂家产品', '状态', '操作']}
    footer={pagination}
    className="medication-knowledge-table">
    {values.map((value) => {
      const herbal = value.sdMedicationType === 'HERBAL'
      const vaccine = value.sdMedicationType === 'VACCINE'
      const routeName = value.defaultRoute
        ? routes.find((route) => route.code === value.defaultRoute)?.name ?? value.defaultRoute : undefined
      const frequencyName = value.defaultFrequency
        ? frequencies.find((frequency) => frequency.code === value.defaultFrequency)?.name ?? value.defaultFrequency : undefined
      const storageText = formatStorageType(value.sdStorageTypeText, value.sdStorageType)

      const specText = [value.preparationSpec, storageText].filter(Boolean).join(' · ') || '—'
      const strengthText = herbal ? (value.preparationUnit || '—')
        : value.strengthValue ? `${value.strengthValue} ${value.strengthUnit || ''}`.trim() : '—'

      const usageDose = value.defaultDose && `${value.defaultDose}${value.defaultDoseUnit || ''}`
      const usageRouteFreq = [routeName, vaccine ? undefined : frequencyName].filter(Boolean).join(' · ')

      const safetyTags = medicationSafetyMarkers(value)

      return <tr key={value.id} className="medication-knowledge-row">
        <td className="medication-col-name">
          <div className="medication-name-wrap">
            <strong className="medication-item-name" title={`药品编码: ${value.code}`}>{value.name}</strong>
          </div>
        </td>

        <td className="medication-col-type">
          <div className="medication-type-wrap">
            <StatusBadge tone={value.sdMedicationType === 'WESTERN' ? 'info' : value.sdMedicationType === 'HERBAL' ? 'success' : 'neutral'}>
              {value.sdMedicationTypeText}
            </StatusBadge>
            <StatusBadge tone="neutral">{value.sdDoseFormText || '未维护剂型'}</StatusBadge>
          </div>
        </td>

        <td className="medication-col-spec">
          <div className="medication-spec-wrap">
            <strong title={specText}>{specText}</strong>
            {strengthText !== '—' && <small title={`含量/单位: ${strengthText}`}>{strengthText}</small>}
          </div>
        </td>

        <td className="medication-col-usage">
          <div className="medication-usage-wrap">
            <strong>{usageDose || '未设默认剂量'}</strong>
            <small>{usageRouteFreq || '未设途径频次'}</small>
          </div>
        </td>

        <td className="medication-col-safety">
          <div className="medication-safety-tags">
            {safetyTags.length ? safetyTags.map((tag) => (
              <Tooltip key={`${tag.symbol}-${tag.detail}`} content={tag.detail}>
                <span className={`ui-badge ui-badge--${tag.tone} medication-safety-marker`}
                  aria-label={tag.detail} tabIndex={0}>{tag.symbol}</span>
              </Tooltip>
            )) : <small className="medication-safety-normal">普通</small>}
          </div>
        </td>

        <td className="medication-col-products">
          <div className="medication-product-summary-cell">
            {value.products.length > 0 ? (
              <Button
                type="button"
                className={`medication-product-count-chip ${activePopoverMedicationId === value.id ? 'is-active' : ''}`}
                onClick={(e) => {
                  if (onTogglePopover) onTogglePopover(value, e.currentTarget)
                  else onViewProducts?.(value)
                }}
                title="点击轻量级查看该药品的厂家产品列表" variant="text" size="sm">
                {value.products.length} 个产品 ›
              </Button>
            ) : (
              <span className="medication-product-empty-chip">未建档</span>
            )}
            <Button
              size="sm"
              variant="text"
              className="medication-quick-add-btn"
              onClick={() => onProduct(value)}
              title="为该通用药品新增厂家产品">
              +产品
            </Button>
          </div>
        </td>

        <td className="medication-col-status">
          <DataStatus value={value.sdStatus} text={value.sdStatusText} />
          {value.standardReference?.status !== 'LINKED' && <small>{{ UNMAPPED: '待关联标准规格', AMBIGUOUS: '标准关联冲突', STALE: '标准版本待核对', MISMATCH: '标准规格不一致' }[value.standardReference?.status ?? 'UNMAPPED']}</small>}
        </td>

        <td className="medication-col-actions">
          <RowActions>
            <Button size="sm" variant="text" onClick={() => onEdit(value)}>编辑知识</Button>
            {onComposition && <Button size="sm" variant="text" onClick={() => onComposition(value)}>成分与含量</Button>}
          </RowActions>
        </td>
      </tr>
    })}
  </Table>
}

export type MedicationSafetyTone = 'warning' | 'success' | 'danger' | 'info' | 'neutral'

export function medicationSafetyMarkers(value: MedicationKnowledge) {
  const antimicrobialLevel = value.sdAntimicrobialLevelText || '抗菌药物'
  const antimicrobialSymbol = value.sdAntimicrobialLevel === 'SPECIAL' || antimicrobialLevel.includes('特殊')
    ? '特' : value.sdAntimicrobialLevel === 'NON_RESTRICTED' || antimicrobialLevel.includes('非限制')
      ? '非' : value.sdAntimicrobialLevel === 'RESTRICTED' || antimicrobialLevel.includes('限制') ? '限' : '抗'
  const skinTestMethod = value.skinTestMethod === 'PRICK' ? '点刺试验'
    : value.skinTestMethod === 'OTHER' ? '其他方式' : value.skinTestMethod === 'INTRADERMAL' ? '皮内试验' : '皮试方式未维护'
  const solutionMode = value.skinTestSolutionMode === 'ORIGINAL_SOLUTION' ? '原液' : value.skinTestSolutionMode === 'DILUTED_SOLUTION' ? '配制皮试液' : '试液方式未维护'
  const skinTestDetail = [
    '需皮试', skinTestMethod, solutionMode,
    value.skinTestObservationMinutes && `观察 ${value.skinTestObservationMinutes} 分钟`,
    value.skinTestResultValidityHours && `结果有效 ${value.skinTestResultValidityHours} 小时`,
    value.skinTestInstructions,
  ].filter(Boolean).join(' · ')

  return [
    value.prescriptionDrug && { symbol: '处', detail: '处方药', tone: 'warning' as const },
    value.essentialDrug && { symbol: '基', detail: '基本药物', tone: 'success' as const },
    value.antimicrobial && { symbol: antimicrobialSymbol, detail: `抗菌药物 · ${antimicrobialLevel}`, tone: 'danger' as const },
    value.antimicrobial && value.antimicrobialOutpatientAllowed === false
      && { symbol: '住', detail: '仅限住院使用，门诊不可常规开立', tone: 'warning' as const },
    value.antimicrobial && value.antimicrobialConsultationRequired
      && { symbol: '审', detail: '需要会诊或审批', tone: 'warning' as const },
    value.antimicrobial && value.antimicrobialEmergencyAllowed
      && { symbol: '急', detail: '允许紧急使用后补审批', tone: 'info' as const },
    value.skinTestRequired && { symbol: '皮', detail: skinTestDetail, tone: 'danger' as const },
    value.chronicDiseaseDrug && { symbol: '慢', detail: '慢病用药', tone: 'info' as const },
    !value.singleOrder && { symbol: '组', detail: '仅限组合开立', tone: 'neutral' as const },
  ].filter(Boolean) as Array<{ symbol: string; detail: string; tone: MedicationSafetyTone }>
}

export function MedicationProductPopover({
  medication,
  anchorRect,
  onClose,
  onProduct,
  onEditProduct,
  onPackage,
  onEditPackage,
  onModeChange,
}: {
  medication: MedicationKnowledge
  anchorRect: DOMRect | null
  onClose: () => void
  onProduct?: (value: MedicationKnowledge) => void
  onEditProduct?: (product: MedicationProduct, medication: MedicationKnowledge) => void
  onPackage?: (product: MedicationProduct, medication: MedicationKnowledge) => void
  onEditPackage?: (value: ItemPackage, product: MedicationProduct, medication: MedicationKnowledge) => void
  onModeChange?: (mode: 'knowledge' | 'product') => void
}) {
  return <AnchoredPanel anchorRect={anchorRect} onClose={onClose}
    label={`${medication.name} 厂家产品清单`} className="medication-product-popover">
      <header className="medication-product-popover__header">
        <div className="medication-product-popover__title">
          <span>{medication.name} · 厂家产品</span>
          <span className="medication-product-popover__count-badge">{medication.products.length}</span>
        </div>
        <div className="medication-product-popover__header-actions">
          {onProduct && (
            <Button
              size="sm"
              variant="text"
              onClick={() => {
                onClose()
                onProduct(medication)
              }}
              title="为该通用药品新增厂家产品"
            >
              +产品
            </Button>
          )}
          <Button
            type="button"
            className="medication-product-popover__close-btn"
            onClick={onClose}
            aria-label="关闭"
            title="关闭 (Esc)" variant="text" size="sm"
          >
            <Icon name="close" />
          </Button>
        </div>
      </header>

      <div className="medication-product-popover__list">
        {medication.products.length === 0 ? (
          <div className="medication-product-popover__empty">
            <p>暂未建档厂家产品</p>
            {onProduct && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  onClose()
                  onProduct(medication)
                }}
              >
                新增厂家产品
              </Button>
            )}
          </div>
        ) : (
          medication.products.map((product) => {
            const tags = [
              product.otc ? { label: 'OTC', tone: 'info' as const } : { label: '处方药', tone: 'warning' as const },
              product.centralPurchase && { label: '集采', tone: 'success' as const },
              product.orderable ? { label: '可开立', tone: 'neutral' as const } : { label: '禁开', tone: 'danger' as const },
            ].filter(Boolean) as Array<{ label: string; tone: 'warning' | 'success' | 'danger' | 'info' | 'neutral' }>

            return (
              <article key={product.id} className="medication-product-popover__item">
                <div className="medication-product-popover__item-head">
                  <span className="medication-product-popover__mfg">
                    {product.manufacturerName || '未关联生产企业'}
                  </span>
                  <div className="medication-product-popover__item-tags">
                    {tags.map((tag) => (
                      <StatusBadge key={tag.label} tone={tag.tone}>
                        {tag.label}
                      </StatusBadge>
                    ))}
                    <DataStatus value={product.sdStatus} text={product.sdStatusText} />
                  </div>
                </div>

                <div className="medication-product-popover__item-body">
                  <div className="medication-product-popover__prod-row">
                    <strong className="medication-product-title">{product.name}</strong>
                    {product.tradeName && (
                      <span className="medication-trade-name">（商品名: {product.tradeName}）</span>
                    )}
                  </div>
                  {product.approvalCode && (
                    <div className="medication-product-popover__approval-row">
                      <span className="medication-product-popover__meta-label">批准文号:</span>
                      <code className="medication-approval-code">{product.approvalCode}</code>
                    </div>
                  )}
                  <div className="medication-product-popover__packages-row">
                    <PackageChips
                      product={product}
                      onEdit={
                        onEditPackage
                          ? (pkg) => {
                              onClose()
                              onEditPackage(pkg, product, medication)
                            }
                          : undefined
                      }
                    />
                  </div>
                </div>

                <div className="medication-product-popover__item-actions">
                  {onEditProduct && (
                    <Button
                      size="sm"
                      variant="text"
                      onClick={() => {
                        onClose()
                        onEditProduct(product, medication)
                      }}
                    >
                      编辑产品
                    </Button>
                  )}
                  {onPackage && (
                    <Button
                      size="sm"
                      variant="text"
                      onClick={() => {
                        onClose()
                        onPackage(product, medication)
                      }}
                    >
                      加包装
                    </Button>
                  )}
                </div>
              </article>
            )
          })
        )}
      </div>

      {onModeChange && (
        <footer className="medication-product-popover__footer">
          <span>编码: {medication.code}</span>
          <Button
            size="sm"
            variant="text"
            onClick={() => {
              onClose()
              onModeChange('product')
            }}
          >
            完整产品视角 ›
          </Button>
        </footer>
      )}
  </AnchoredPanel>
}

export function MedicationProductQuickViewDialog({
  medication,
  onClose,
  onProduct,
  onEditProduct,
  onPackage,
  onEditPackage,
  onModeChange,
}: {
  medication: MedicationKnowledge
  onClose: () => void
  onProduct?: (value: MedicationKnowledge) => void
  onEditProduct?: (product: MedicationProduct, medication: MedicationKnowledge) => void
  onPackage?: (product: MedicationProduct, medication: MedicationKnowledge) => void
  onEditPackage?: (value: ItemPackage, product: MedicationProduct, medication: MedicationKnowledge) => void
  onModeChange?: (mode: 'knowledge' | 'product') => void
}) {
  return (
    <Dialog
      title={`${medication.name} · 厂家产品列表`}
      eyebrow={`通用编码: ${medication.code} · ${medication.sdDoseFormText || '通用剂型'} · ${medication.preparationSpec || '通用规格'}`}
      description={`已关联 ${medication.products.length} 个厂家产品与批准文号，以列表方式展示生产企业、包装规格及价格状态。`}
      size="xwide"
      onClose={onClose}
    >
      <div className="medication-quick-view-dialog">
        <div className="medication-quick-view-toolbar">
          <div className="medication-quick-view-summary">
            <span className="medication-quick-view-tag">通用名: <strong>{medication.name}</strong></span>
            <span className="medication-quick-view-tag">类型: <strong>{medication.sdMedicationTypeText}</strong></span>
            {medication.strengthValue && (
              <span className="medication-quick-view-tag">
                含量: <strong>{medication.strengthValue}{medication.strengthUnit || ''}</strong>
              </span>
            )}
            <span className="medication-quick-view-tag">
              厂家产品数: <strong>{medication.products.length} 个</strong>
            </span>
          </div>
          <div className="medication-quick-view-actions">
            {onProduct && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  onClose()
                  onProduct(medication)
                }}
              >
                + 新增厂家产品
              </Button>
            )}
            {onModeChange && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  onClose()
                  onModeChange('product')
                }}
                title="切换到厂家产品与包装进行全局筛选与维护"
              >
                厂家产品与包装 ›
              </Button>
            )}
          </div>
        </div>

        {medication.products.length === 0 ? (
          <EmptyState
            icon="pharmacy"
            title="暂无厂家产品"
            copy="该通用药品尚未建档具体的生产企业和批准文号产品。"
            action={
              onProduct ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    onClose()
                    onProduct(medication)
                  }}
                >
                  立即为「{medication.name}」新增产品
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="medication-quick-view-table-wrap">
            <Table
              headers={['厂家产品 / 生产企业', '产品编码', '批准文号', '包装规格与换算', '属性标签', '状态', '操作']}
              className="medication-quick-view-table"
            >
              {medication.products.map((product) => {
                const tags = [
                  product.otc ? { label: 'OTC', tone: 'info' as const } : { label: '处方药', tone: 'warning' as const },
                  product.centralPurchase && { label: '集采', tone: 'success' as const },
                  product.orderable ? { label: '可开立', tone: 'neutral' as const } : { label: '禁开', tone: 'danger' as const },
                  product.traceCode && { label: '追溯码', tone: 'neutral' as const },
                ].filter(Boolean) as Array<{ label: string; tone: 'warning' | 'success' | 'danger' | 'info' | 'neutral' }>

                return (
                  <tr key={product.id} className="medication-quick-view-row">
                    <td className="medication-quick-view-col-product">
                      <div className="medication-product-info">
                        <strong className="medication-product-title">{product.name}</strong>
                        <div className="medication-quick-view-sub">
                          <small className="medication-manufacturer-name">
                            {product.manufacturerName || '未关联生产企业'}
                          </small>
                          {product.tradeName && (
                            <small className="medication-trade-name">（商品名: {product.tradeName}）</small>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="medication-quick-view-col-code">
                      <code className="medication-code-tag">{product.code}</code>
                    </td>

                    <td className="medication-quick-view-col-approval">
                      {product.approvalCode ? (
                        <code className="medication-approval-code" title={product.approvalCode}>
                          {product.approvalCode}
                        </code>
                      ) : (
                        <span className="medication-empty-text">—</span>
                      )}
                    </td>

                    <td className="medication-quick-view-col-packages">
                      <PackageChips
                        product={product}
                        onEdit={
                          onEditPackage
                            ? (item) => {
                                onClose()
                                onEditPackage(item, product, medication)
                              }
                            : undefined
                        }
                      />
                    </td>

                    <td className="medication-quick-view-col-tags">
                      <div className="medication-safety-tags">
                        {tags.map((tag) => (
                          <StatusBadge key={tag.label} tone={tag.tone}>
                            {tag.label}
                          </StatusBadge>
                        ))}
                      </div>
                    </td>

                    <td className="medication-quick-view-col-status">
                      <DataStatus value={product.sdStatus} text={product.sdStatusText} />
                    </td>

                    <td className="medication-quick-view-col-actions">
                      <RowActions>
                        {onEditProduct && (
                          <Button
                            size="sm"
                            variant="text"
                            onClick={() => {
                              onClose()
                              onEditProduct(product, medication)
                            }}
                          >
                            编辑产品
                          </Button>
                        )}
                        {onPackage && (
                          <Button
                            size="sm"
                            variant="text"
                            onClick={() => {
                              onClose()
                              onPackage(product, medication)
                            }}
                          >
                            加包装
                          </Button>
                        )}
                      </RowActions>
                    </td>
                  </tr>
                )
              })}
            </Table>
          </div>
        )}
      </div>
    </Dialog>
  )
}

export function MedicationProductTable({ values, pagination, onModeChange, onProduct, onEditProduct, onPackage, onEditPackage }: {
  values: MedicationKnowledge[]; pagination: ReactNode;
  onModeChange?: (mode: 'knowledge' | 'product') => void;
  onProduct: (value: MedicationKnowledge) => void;
  onEditProduct: (product: MedicationProduct, medication: MedicationKnowledge) => void;
  onPackage: (product: MedicationProduct, medication: MedicationKnowledge) => void;
  onEditPackage: (value: ItemPackage, product: MedicationProduct, medication: MedicationKnowledge) => void
}) {
  const productEntries = values.flatMap((medication) =>
    medication.products.map((product) => ({ product, medication }))
  )

  if (productEntries.length === 0) {
    return (
      <TableShell scrollClassName="master-data-table-wrap" footer={pagination}>
        <EmptyState
          icon="pharmacy"
          title="未找到药品产品"
          copy="请调整筛选条件，或到本院药品主档建立厂家产品。"
          action={
            <div className="medication-empty-actions">
              <Button onClick={() => onModeChange?.('knowledge')}>返回本院药品主档</Button>
              {values[0] && (
                <Button variant="secondary" onClick={() => onProduct(values[0])}>
                  为「{values[0].name}」新增产品
                </Button>
              )}
            </div>
          }
        />
      </TableShell>
    )
  }

  return (
    <>
      <Table
        headers={['厂家产品 / 生产企业', '所属通用药品', '剂型规格 / 含量', '批准文号', '包装规格与换算', '中心状态', '操作']}
        footer={pagination}
        className="medication-product-table">
        {productEntries.map(({ product, medication }) => (
          <tr key={product.id} className="medication-product-row">
            <td className="medication-col-product">
              <div className="medication-product-info">
                <strong className="medication-product-title">{product.name}</strong>
                <small className="medication-manufacturer-name">
                  {product.manufacturerName || '未关联生产企业'}
                </small>
              </div>
            </td>

            <td className="medication-col-parent">
              <div className="medication-parent-info">
                <strong className="medication-parent-name" title={`所属通用名: ${medication.name}`}>
                  {medication.name}
                </strong>
                <div className="medication-parent-meta">
                  <span>{medication.sdMedicationTypeText}</span>
                </div>
              </div>
            </td>

            <td className="medication-col-formspec">
              <div className="medication-formspec-info">
                <strong>{medication.sdDoseFormText || '未设剂型'}{medication.preparationSpec ? ` · ${medication.preparationSpec}` : ''}</strong>
                {medication.strengthValue && (
                  <small>{`${medication.strengthValue} ${medication.strengthUnit || ''}`.trim()}</small>
                )}
              </div>
            </td>

            <td className="medication-col-approval">
              {product.approvalCode ? (
                <code className="medication-approval-code" title={product.approvalCode}>{product.approvalCode}</code>
              ) : (
                <span className="medication-empty-text">—</span>
              )}
            </td>

            <td className="medication-col-packages">
              <PackageChips product={product} onEdit={(item) => onEditPackage(item, product, medication)} />
            </td>

            <td className="medication-col-status">
              <DataStatus value={product.sdStatus} text={product.sdStatusText} />
            </td>

            <td className="medication-col-actions">
              <RowActions>
                <Button size="sm" variant="text" onClick={() => onEditProduct(product, medication)}>编辑产品</Button>
                <Button size="sm" variant="text" onClick={() => onPackage(product, medication)}>加包装</Button>
              </RowActions>
            </td>
          </tr>
        ))}
      </Table>


    </>
  )
}

export function medicationSummary(value: MedicationKnowledge, routes: MedicationRoute[], frequencies: ActiveOrderFrequency[]) {
  const herbal = value.sdMedicationType === 'HERBAL'
  const vaccine = value.sdMedicationType === 'VACCINE'
  const routeName = value.defaultRoute
    ? routes.find((route) => route.code === value.defaultRoute)?.name ?? value.defaultRoute : undefined
  const frequencyName = value.defaultFrequency
    ? frequencies.find((frequency) => frequency.code === value.defaultFrequency)?.name ?? value.defaultFrequency : undefined
  const storageText = formatStorageType(value.sdStorageTypeText, value.sdStorageType)
  return [
    { label: herbal ? '炮制规格' : vaccine ? '剂量规格' : '规格',
      value: [value.preparationSpec, storageText].filter(Boolean).join(' · ') || '—' },
    { label: herbal ? '调剂单位' : vaccine ? '每剂含量' : '含量',
      value: herbal ? (value.preparationUnit || '—')
        : value.strengthValue ? `${value.strengthValue} ${value.strengthUnit || ''}`.trim() : '—' },
    { label: vaccine ? '剂量 / 途径' : '用法',
      value: [value.defaultDose && `${value.defaultDose}${value.defaultDoseUnit || ''}`, routeName,
        vaccine ? undefined : frequencyName].filter(Boolean).join(' · ') || '—' },
    { label: '安全',
      value: [value.prescriptionDrug && '处方药', value.essentialDrug && '基本药物',
        value.antimicrobial && (value.sdAntimicrobialLevelText || '抗菌药'), value.skinTestRequired && '需皮试',
        value.chronicDiseaseDrug && '慢病用药', !value.singleOrder && '仅组合使用'].filter(Boolean).join(' · ') || '普通' },
  ]
}

export const storageTypeLabelMap: Record<string, string> = {
  NORMAL: '常温',
  ROOM_TEMPERATURE: '常温',
  COLD_CHAIN: '冷链',
  COOL: '阴凉',
  COOL_DARK: '凉暗',
  REFRIGERATED: '冷藏',
  FROZEN: '冷冻',
  DRY: '干燥',
  DARK: '避光',
}

export function formatStorageType(text?: string | null, code?: string | null): string | undefined {
  if (text && storageTypeLabelMap[text]) {
    return storageTypeLabelMap[text]
  }
  if (text && text !== code) {
    return text
  }
  if (code && storageTypeLabelMap[code]) {
    return storageTypeLabelMap[code]
  }
  return text || code || undefined
}

export function PackageChips({ product, onEdit }: { product: MedicationProduct; onEdit?: (value: ItemPackage) => void }) {
  if (!product.packages.length) return <span className="medication-packages__empty">未维护</span>
  return <div className="medication-packages">{product.packages.map((item) => {
    const marks = [item.defaultPurchase && '采', item.defaultSale && '销', item.defaultDispense && '发']
      .filter(Boolean).join('')
    const label = item.packageSpec || `${item.unitName} = ${item.quantityFactor}${product.unitCode || '最小单位'}`
    const hint = `${item.sdUsageTypeText}${item.barcode ? ` · 条码 ${item.barcode}` : ''}${onEdit ? ' · 点击编辑包装' : ''}`
    return onEdit ? <Button type="button" className="medication-package" key={item.id} title={hint}
      onClick={() => onEdit(item)} variant="text" size="sm">{label}{marks && <small>{marks}</small>}</Button>
      : <span className="medication-package" key={item.id} title={hint}>{label}{marks && <small>{marks}</small>}</span>
  })}</div>
}
