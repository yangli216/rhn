import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { DataTable as UiDataTable } from '../../../shared/ui'
import { recordedMedicationAmount, displayRecordedAmount } from '../medicationDisplay'
import { formatTime, genderLabel } from '../../../shared/format'
import { errorMessage } from '../../../shared/rhnApi'
import { Alert, Button, Dialog, EmptyState, Icon, Select, StatusBadge } from '../../../shared/ui'
import { usePharmacyWorkspace } from './usePharmacyWorkspace'
import { ageText, requestPackageUnit } from './pharmacyShared'
import { WardMedicationReturnInbox } from '../WardMedicationReturnInbox'

const RETURN_DISPOSITION_OPTIONS = [
  { value: 'RESTOCK', label: '验收合格·重新入库' },
  { value: 'QUARANTINE', label: '隔离待质检' },
  { value: 'DESTROY', label: '报废待销毁' },
]

const RETURN_REASON_OPTIONS = [
  { value: 'PATIENT_NOT_USE', label: '患者未用/自愿退药' },
  { value: 'PHYSICIAN_CHANGE', label: '医生停嘱/门诊改方' },
  { value: 'ADVERSE_REACTION', label: '发生不良反应' },
  { value: 'DISPENSE_MISTAKE', label: '药房发错药品/数量多发' },
  { value: 'PATIENT_REQUEST', label: '患者个人原因退药' },
  { value: 'OTHER', label: '其他原因' },
]

export function PharmacyReturnMedicationPanel({ model }: { model: ReturnType<typeof usePharmacyWorkspace> }) {
  const {
    actionNotice, setActionNotice, error, scanInputRef, scanKeyword, setScanKeyword, scanPending,
    handleScanOrSearch, returningTaskId, handleReturnItems,
    filteredPatientGroups, activePatient, setSelectedResidentId, pFullName, pGender, pAge,
    pEthnicity, pCoverage, pNationalId, pPhone, pAddress, prescriptionCards,
    patientTotalAmount, patientReturnedTotalAmount, patientReturnableTotalAmount, refresh,
    activeDrugAllergies, setShowAllergyModal, showAllergyModal, hasNoKnownDrugAllergy,
    activeHistorySummary, setActiveHistorySummary,
    returnQuantities, setReturnQuantityForRequest, returnDispositions, setReturnDispositionForRequest,
    returnReasonCode, setReturnReasonCode, returnDescription, setReturnDescription,
    selectedSite, api, practitioners, eligibleAssignments, practitionerId, assignmentId,
    setPractitionerId, setAssignmentId, residentMap,
  } = model

  const [activeTab, setActiveTab] = useState<'outpatient' | 'ward'>('outpatient')
  const [checkedItemIds, setCheckedItemIds] = useState<Set<string>>(new Set())
  const [confirmDialogVisible, setConfirmDialogVisible] = useState(false)
  const [singleReturnItem, setSingleReturnItem] = useState<{
    id: string
    name: string
    quantity: number
    max: number
    unitPrice: number
    disposition: string
    item: any
  } | null>(null)

  const isWardSupported = selectedSite?.serviceScope === 'INPATIENT' || selectedSite?.serviceScope === 'MIXED'

  // Flatten all items across active patient's prescriptions
  const allPatientItems = useMemo(() => {
    return prescriptionCards.flatMap((c) => c.items)
  }, [prescriptionCards])

  // 默认勾选可退项：只在切换患者或处方项数量变化时重置，退药后刷新同数量数据不覆盖用户的勾选。
  const allPatientItemsRef = useRef(allPatientItems)
  allPatientItemsRef.current = allPatientItems
  useEffect(() => {
    const returnableIds = allPatientItemsRef.current
      .filter((it) => (it.dispensedQuantity ?? it.request.quantity ?? 0) > (it.returnedQuantity ?? 0))
      .map((it) => it.request.id)
    setCheckedItemIds(new Set(returnableIds))
  }, [activePatient?.residentId, allPatientItems.length])

  // Get item returnable info
  const getItemReturnInfo = useCallback((item: typeof allPatientItems[0]) => {
    const req = item.request
    const dispensedQty = item.dispensedQuantity ?? req.quantity ?? 0
    const returnedQty = item.returnedQuantity ?? 0
    const returnableQty = Math.max(0, dispensedQty - returnedQty)
    const unitPrice = req.unitPrice ?? (item.plannedQuantity ? ((recordedMedicationAmount(req) || 0) / item.plannedQuantity) : 0)
    // 部分退药后可退量会变小，之前录入的数量不能超过最新可退量。
    const currentReturnQty = Math.min(returnQuantities[req.id] ?? returnableQty, returnableQty)
    const currentDisposition = returnDispositions[req.id] ?? 'RESTOCK'
    const returnAmount = currentReturnQty * unitPrice
    const isFullyReturned = returnableQty === 0 && returnedQty > 0
    const isPartiallyReturned = returnedQty > 0 && returnableQty > 0

    return {
      dispensedQty,
      returnedQty,
      returnableQty,
      unitPrice,
      currentReturnQty,
      currentDisposition,
      returnAmount,
      isFullyReturned,
      isPartiallyReturned,
    }
  }, [returnQuantities, returnDispositions])

  // Toggle single item check
  const toggleItemCheck = (requestId: string, returnableQty: number) => {
    if (returnableQty <= 0) return
    setCheckedItemIds((prev) => {
      const next = new Set(prev)
      if (next.has(requestId)) next.delete(requestId)
      else next.add(requestId)
      return next
    })
  }

  // Toggle all returnable items in a prescription card
  const togglePrescriptionItems = (card: typeof prescriptionCards[0]) => {
    const returnableIds = card.items
      .map((it) => ({ id: it.request.id, info: getItemReturnInfo(it) }))
      .filter(({ info }) => info.returnableQty > 0)
      .map(({ id }) => id)

    if (!returnableIds.length) return

    const allChecked = returnableIds.every((id) => checkedItemIds.has(id))
    setCheckedItemIds((prev) => {
      const next = new Set(prev)
      if (allChecked) {
        returnableIds.forEach((id) => next.delete(id))
      } else {
        returnableIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  // Calculate selected total refund amount
  const selectedItemsData = useMemo(() => {
    return allPatientItems
      .filter((it) => checkedItemIds.has(it.request.id))
      .map((it) => {
        const info = getItemReturnInfo(it)
        return {
          item: it,
          quantity: info.currentReturnQty,
          disposition: info.currentDisposition,
          amount: info.returnAmount,
        }
      })
      .filter((d) => d.quantity > 0)
  }, [allPatientItems, checkedItemIds, getItemReturnInfo])

  const selectedReturnTotalAmount = useMemo(() => {
    return selectedItemsData.reduce((sum, d) => sum + d.amount, 0)
  }, [selectedItemsData])

  // Submit batch return
  const handleBatchReturn = async () => {
    if (!selectedItemsData.length) return
    await handleReturnItems(selectedItemsData, returnReasonCode, returnDescription)
    setConfirmDialogVisible(false)
    setCheckedItemIds(new Set())
  }

  // Submit single return
  const handleSingleReturn = async () => {
    if (!singleReturnItem) return
    await handleReturnItems([{
      item: singleReturnItem.item,
      quantity: singleReturnItem.quantity,
      disposition: singleReturnItem.disposition,
    }], returnReasonCode, returnDescription)
    setSingleReturnItem(null)
  }

  return (
    <div className="pharmacy-dispense-workbench">
      {actionNotice && (
        <Alert
          key={actionNotice.id}
          tone={actionNotice.tone}
          placement="toast"
          duration={5000}
          dismissible
          onDismiss={() => setActionNotice(null)}
        >
          {actionNotice.text}
        </Alert>
      )}

      {error && (
        <Alert tone="error" placement="inline">
          {errorMessage(error)}
        </Alert>
      )}

      {/* Top Action / Control Bar */}
      <header className="pharmacy-dispense-topbar" aria-label="退药管理操作栏">
        <div className="pharmacy-dispense-topbar__left">
          <div className="pharmacy-scan-search">
            <input
              ref={scanInputRef}
              type="text"
              aria-label="扫描或检索待退药患者"
              placeholder="扫描处方条码 / 检索患者姓名、就诊号、身份证、手机号"
              value={scanKeyword}
              onChange={(e) => setScanKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void handleScanOrSearch()
                }
              }}
            />
            <Button
              type="button"
              variant="secondary"
              busy={scanPending}
              onClick={() => void handleScanOrSearch()}
              title="根据条码或关键字精确检索"
            >
              <Icon name="search" />
              <span>检索</span>
            </Button>
          </div>

          <Button
            type="button"
            variant="secondary"
            onClick={() => void refresh()}
            title="刷新当前药房退药队列"
          >
            <Icon name="refresh" />
            <span>刷新</span>
          </Button>
        </div>

        {isWardSupported && (
          <div className="pharmacy-dispense-topbar__right">
            <Button
              variant={activeTab === 'outpatient' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setActiveTab('outpatient')}
            >
              门诊退药工作台
            </Button>
            <Button
              variant={activeTab === 'ward' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setActiveTab('ward')}
            >
              病区退药接收
            </Button>
          </div>
        )}
      </header>

      {/* If Ward return tab is active */}
      {isWardSupported && activeTab === 'ward' ? (
        <WardMedicationReturnInbox
          api={api}
          practitioners={practitioners.data ?? []}
          assignments={eligibleAssignments}
          practitionerId={practitionerId}
          assignmentId={assignmentId}
          onPractitionerChange={setPractitionerId}
          onAssignmentChange={setAssignmentId}
        />
      ) : (
        /* Main Workspace Grid: Outpatient Return Workbench */
        <div className="pharmacy-dispense-body">
          {/* Left Column: Patient Queue */}
          <aside className="pharmacy-patient-queue" aria-label="已发药待退药患者队列">
            <div className="pharmacy-patient-queue__head">
              <div className="pharmacy-patient-queue__title">已发药待退药记录</div>
              <div className="pharmacy-patient-queue__filter">
                <span className="pharmacy-patient-queue__count-badge">
                  {filteredPatientGroups.length} 人
                </span>
              </div>
            </div>

            <div className="pharmacy-patient-queue__list" role="feed">
              {filteredPatientGroups.length === 0 ? (
                <EmptyState
                  icon="pharmacy"
                  title="暂无可退药处方"
                  copy="当前药房暂无已发药或可办理退药的处方记录。"
                />
              ) : (
                filteredPatientGroups.map((group) => {
                  const isSelected = activePatient?.residentId === group.residentId
                  const resInfo = residentMap.get(group.residentId)
                  const displayName = (isSelected && pFullName !== '患者') ? pFullName : (resInfo?.fullName || group.residentName)
                  const displayGender = (resInfo?.gender || group.gender)
                    ? genderLabel(resInfo?.gender || group.gender)
                    : (isSelected && pGender ? pGender : '性别未知')
                  const displayAge = (resInfo?.birthDate || group.birthDate)
                    ? ageText(resInfo?.birthDate || group.birthDate)
                    : (isSelected && pAge ? pAge : '年龄未知')

                  const totalDispensed = group.items.reduce((sum, it) => {
                    const price = it.request.unitPrice ?? (it.plannedQuantity ? ((recordedMedicationAmount(it.request) || 0) / it.plannedQuantity) : 0)
                    const qty = it.dispensedQuantity ?? it.request.quantity ?? 0
                    return sum + qty * price
                  }, 0)

                  const totalReturned = group.items.reduce((sum, it) => {
                    const price = it.request.unitPrice ?? (it.plannedQuantity ? ((recordedMedicationAmount(it.request) || 0) / it.plannedQuantity) : 0)
                    return sum + (it.returnedQuantity ?? 0) * price
                  }, 0)

                  const totalReturnable = Math.max(0, totalDispensed - totalReturned)
                  const isFullyReturned = totalReturnable === 0 && totalReturned > 0
                  const isPartiallyReturned = totalReturned > 0 && totalReturnable > 0

                  const dispensedAt = group.items[0]?.dispensedAt || group.items[0]?.request.authoredAt

                  return (
                    <div
                      key={group.residentId}
                      role="article"
                      tabIndex={0}
                      className={`pharmacy-queue-item ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => setSelectedResidentId(group.residentId)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setSelectedResidentId(group.residentId)
                        }
                      }}
                      aria-label={`选择患者 ${displayName}`}
                    >
                      <div className="pharmacy-queue-item__main">
                        <div className="pharmacy-queue-item__row-top">
                          <strong className="pharmacy-queue-item__name">{displayName}</strong>
                          <strong className="pharmacy-cancel-queue-amount">
                            可退 ¥{totalReturnable.toFixed(2)}
                          </strong>
                        </div>
                        <div className="pharmacy-queue-item__row-bottom">
                          <span className="pharmacy-queue-item__meta">
                            {displayGender} · {displayAge} · {group.items.length} 剂/方
                          </span>
                          {isFullyReturned ? (
                            <span className="pharmacy-cancel-queue-badge">已全退</span>
                          ) : isPartiallyReturned ? (
                            <span className="pharmacy-return-queue-returned">部分退药</span>
                          ) : (
                            <span className="pharmacy-cancel-queue-badge">已发药·可退</span>
                          )}
                        </div>
                        <div className="pharmacy-queue-item__row-bottom">
                          <span className="pharmacy-queue-item__meta">
                            发药 ¥{totalDispensed.toFixed(2)}
                          </span>
                          {totalReturned > 0 ? (
                            <span className="pharmacy-return-queue-returned">
                              已退 ¥{totalReturned.toFixed(2)}
                            </span>
                          ) : dispensedAt ? (
                            <span className="pharmacy-cancel-item-time">
                              发药于 {formatTime(dispensedAt)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </aside>

          {/* Right Column: Main Workbench */}
          <main className="pharmacy-dispense-main" aria-label="退药工作区">
            {!activePatient ? (
              <div className="pharmacy-dispense-empty">
                <EmptyState
                  icon="pharmacy"
                  title="请在左侧选择需要办理退药的患者"
                  copy="选中患者后可核对已发药处方明细、填写退药数量与处置方式并办理退药。"
                />
              </div>
            ) : (
              <>
                {/* 1. Patient Banner */}
                <section className="pharmacy-patient-banner" aria-label="患者信息">
                  <div className="pharmacy-patient-banner__avatar">
                    <Icon name="user" />
                  </div>
                  <div className="pharmacy-patient-banner__facts">
                    <strong className="pharmacy-patient-banner__name">{pFullName}</strong>
                    <span className="pharmacy-patient-banner__gender-age">{pGender} · {pAge}</span>
                    <span className="pharmacy-patient-banner__badge">{pEthnicity}</span>
                    <span className="pharmacy-patient-banner__badge pharmacy-patient-banner__badge--coverage">{pCoverage}</span>
                    <span className="pharmacy-patient-banner__detail">
                      <span className="pharmacy-patient-banner__label">门诊就诊号:</span> {activePatient.encounterNo || '未关联'}
                    </span>
                    <span className="pharmacy-patient-banner__detail">
                      <span className="pharmacy-patient-banner__label">身份证号:</span> {pNationalId}
                    </span>
                    <span className="pharmacy-patient-banner__detail">
                      <span className="pharmacy-patient-banner__label">联系电话:</span> {pPhone}
                    </span>
                    <span className="pharmacy-patient-banner__detail">
                      <span className="pharmacy-patient-banner__label">居住地址:</span> {pAddress}
                    </span>
                    <Button
                      type="button"
                      className={`pharmacy-patient-banner__allergy-tag ${activeDrugAllergies.length > 0 ? 'is-risk' : 'is-clear'}`}
                      onClick={() => setShowAllergyModal(true)}
                      title="点击查看患者过敏史详情"
                      variant="text"
                      size="sm"
                    >
                      <span className="pharmacy-patient-banner__allergy-dot" />
                      <span>
                        {activeDrugAllergies.length > 0
                          ? (activeDrugAllergies.map((a) => a.substanceDisplay).filter(Boolean).join('、') || '药物过敏') + '过敏'
                          : '过敏史'}
                      </span>
                    </Button>
                  </div>
                </section>

                {/* 2. Notice Banner (Integrated warning strip) */}
                <div className="pharmacy-return-banner-notice" role="status">
                  <Icon name="warning" className="pharmacy-return-banner-notice__icon" />
                  <div className="pharmacy-return-banner-notice__content">
                    <strong>门诊退药说明：</strong>
                    支持整张处方或单品明细退药；退药后库存将根据选择的处置方式（重新入库 / 隔离待质检 / 报废销毁）进行出入库记账，状态将变更为【部分退药】或【已全退】，并生成退药红字凭证便于财务退费。
                  </div>
                </div>

                {/* 3. Prescriptions Board */}
                <div className="pharmacy-prescriptions-board">
                  {prescriptionCards.map((card) => {
                    const returnableCardItems = card.items.filter((it) => getItemReturnInfo(it).returnableQty > 0)
                    const isAllCardChecked = returnableCardItems.length > 0 && returnableCardItems.every((it) => checkedItemIds.has(it.request.id))

                    return (
                      <article key={card.key} className="pharmacy-prescription-card">
                        <header className="pharmacy-prescription-card__header">
                          <div className="pharmacy-prescription-card__header-left">
                            <input
                              type="checkbox"
                              className="pharmacy-prescription-card__checkbox"
                              checked={isAllCardChecked}
                              disabled={returnableCardItems.length === 0}
                              onChange={() => togglePrescriptionItems(card)}
                              aria-label={`勾选处方${card.title}`}
                            />
                            <h3 className="pharmacy-prescription-card__title">{card.title}</h3>
                            <span className="pharmacy-prescription-card__meta">
                              <span className="pharmacy-prescription-card__prescriber">
                                {card.orgName} / {card.deptName} / {card.doctorName}
                              </span>
                              <span className="pharmacy-prescription-card__time">
                                开单时间: {formatTime(card.authoredAt) || '未记录'}
                              </span>
                            </span>
                            <span className={`pharmacy-prescription-card__status ${card.isFullyReturned ? '' : card.isPartiallyReturned ? '' : 'is-dispensed'}`}>
                              {card.statusLabel}
                            </span>
                            <Button
                              variant="text"
                              size="sm"
                              onClick={() => setActiveHistorySummary({
                                title: card.title,
                                encounterNo: card.clinicalContext?.encounterNo,
                                clinicianId: card.clinicalContext?.clinicianId,
                                chiefComplaint: card.clinicalContext?.chiefComplaint,
                                diagnoses: card.clinicalContext?.diagnoses || [],
                              })}
                            >
                              病史摘要
                            </Button>
                          </div>
                          <div className="pharmacy-prescription-card__header-right">
                            <span>处方金额:</span>
                            <strong className="pharmacy-prescription-card__amount">
                              {displayRecordedAmount(card.totalAmount)}
                            </strong>
                            <span className="pharmacy-return-card-meta-label">可退金额:</span>
                            <strong className="pharmacy-return-card-returnable">
                              ¥{card.returnableTotalAmount.toFixed(2)}
                            </strong>
                          </div>
                        </header>

                        {/* Prescription Table with Return Fields */}
                        <div className="pharmacy-prescription-table-wrap">
                          <UiDataTable className="pharmacy-prescription-table">
                            <thead>
                              <tr>
                                <th style={{ width: '2.5rem' }}>选择</th>
                                <th style={{ width: '2.5rem' }}>序号</th>
                                <th style={{ minWidth: '11rem' }}>药品名称/规格</th>
                                <th style={{ minWidth: '7rem' }}>厂家</th>
                                <th style={{ minWidth: '4.5rem' }}>频次/用法</th>
                                <th style={{ minWidth: '4.5rem' }}>发药数量</th>
                                <th style={{ minWidth: '4.5rem' }}>已退数量</th>
                                <th style={{ minWidth: '4.5rem' }}>可退数量</th>
                                <th style={{ minWidth: '5.5rem' }}>本次退药数量</th>
                                <th style={{ minWidth: '8rem' }}>处置方式</th>
                                <th style={{ minWidth: '4rem' }}>单价</th>
                                <th style={{ minWidth: '4.5rem' }}>退药金额</th>
                                <th style={{ minWidth: '4.5rem' }}>退药状态</th>
                                <th style={{ minWidth: '4.5rem' }}>操作</th>
                              </tr>
                            </thead>
                            <tbody>
                              {card.items.map((it, idx) => {
                                const req = it.request
                                const snap = (req.medicationSnapshot as Record<string, unknown> | undefined) ?? {}
                                const manufacturer = req.manufacturerName || (snap.manufacturerName as string) || (snap.manufacturer as string) || '厂家未记录'
                                const spec = req.packageSpec || req.preparationSpec || '规格未记录'
                                const packageUnit = requestPackageUnit(req.quantityUnit, req.packageUnitName)

                                const info = getItemReturnInfo(it)
                                const isChecked = checkedItemIds.has(req.id)

                                return (
                                  <tr key={req.id}>
                                    <td>
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        disabled={info.returnableQty <= 0}
                                        onChange={() => toggleItemCheck(req.id, info.returnableQty)}
                                        aria-label={`选择药品${req.medicationName}`}
                                      />
                                    </td>
                                    <td>{idx + 1}</td>
                                    <td>
                                      <div className="pharmacy-med-name-cell">
                                        <span className="pharmacy-med-icon"><Icon name="pill" /></span>
                                        <div className="pharmacy-med-info">
                                          <span className="pharmacy-med-name">{req.medicationName}</span>
                                          <span className="pharmacy-med-spec">{spec}</span>
                                        </div>
                                      </div>
                                    </td>
                                    <td title={manufacturer}>{manufacturer}</td>
                                    <td>
                                      {[req.frequencyName, req.routeName || req.routeCode].filter(Boolean).join(' · ') || '—'}
                                    </td>
                                    <td><strong>{info.dispensedQty} {packageUnit}</strong></td>
                                    <td>{info.returnedQty} {packageUnit}</td>
                                    <td>
                                      <strong className={info.returnableQty > 0 ? 'pharmacy-return-text-active' : 'pharmacy-return-text-inactive'}>
                                        {info.returnableQty} {packageUnit}
                                      </strong>
                                    </td>
                                    <td>
                                      {info.returnableQty > 0 ? (
                                        <input
                                          type="number"
                                          className="pharmacy-return-qty-input"
                                          min={1}
                                          max={info.returnableQty}
                                          step={1}
                                          value={info.currentReturnQty}
                                          onChange={(e) => {
                                            const val = Math.min(info.returnableQty, Math.max(1, Number(e.target.value) || 1))
                                            setReturnQuantityForRequest(req.id, val)
                                          }}
                                          aria-label="退药数量"
                                        />
                                      ) : (
                                        <span>—</span>
                                      )}
                                    </td>
                                    <td>
                                      {info.returnableQty > 0 ? (
                                        <Select
                                          className="pharmacy-return-disposition-select"
                                          value={info.currentDisposition}
                                          onChange={(val) => setReturnDispositionForRequest(req.id, val)}
                                          options={RETURN_DISPOSITION_OPTIONS}
                                        />
                                      ) : (
                                        <span>—</span>
                                      )}
                                    </td>
                                    <td>¥{info.unitPrice.toFixed(2)}</td>
                                    <td>
                                      <strong className="pharmacy-return-amount-cell">
                                        ¥{info.returnAmount.toFixed(2)}
                                      </strong>
                                    </td>
                                    <td>
                                      {info.isFullyReturned ? (
                                        <StatusBadge tone="neutral">已全退</StatusBadge>
                                      ) : info.isPartiallyReturned ? (
                                        <StatusBadge tone="warning">部分退药</StatusBadge>
                                      ) : (
                                        <StatusBadge tone="success">未退药</StatusBadge>
                                      )}
                                    </td>
                                    <td>
                                      {info.returnableQty > 0 ? (
                                        <Button
                                          size="sm"
                                          variant="secondary"
                                          onClick={() => {
                                            setSingleReturnItem({
                                              id: req.id,
                                              name: req.medicationName,
                                              quantity: info.currentReturnQty,
                                              max: info.returnableQty,
                                              unitPrice: info.unitPrice,
                                              disposition: info.currentDisposition,
                                              item: it,
                                            })
                                          }}
                                        >
                                          退药
                                        </Button>
                                      ) : (
                                        <span className="pharmacy-return-status-done">已全部退药</span>
                                      )}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </UiDataTable>
                        </div>
                      </article>
                    )
                  })}
                </div>

                {/* 4. Bottom Summary Footer */}
                <footer className="pharmacy-dispense-footer" aria-label="退药金额汇总与操作">
                  <div className="pharmacy-dispense-footer__breakdown">
                    <div>
                      <span>已选退药药品:</span>
                      <strong>{checkedItemIds.size} 种</strong>
                    </div>
                    <div>
                      <span>已发总额:</span>
                      <strong>¥{(patientTotalAmount ?? 0).toFixed(2)}</strong>
                    </div>
                    <div>
                      <span>已退总额:</span>
                      <strong>¥{patientReturnedTotalAmount.toFixed(2)}</strong>
                    </div>
                    <div>
                      <span>可退总额:</span>
                      <strong>¥{patientReturnableTotalAmount.toFixed(2)}</strong>
                    </div>
                  </div>

                  <div className="pharmacy-cancel-card-actions">
                    <div className="pharmacy-dispense-footer__total">
                      <span>本次退药总额:</span>
                      <strong className="pharmacy-return-amount-cell">
                        ¥{selectedReturnTotalAmount.toFixed(2)}
                      </strong>
                    </div>

                    <Button
                      type="button"
                      variant="primary"
                      disabled={checkedItemIds.size === 0 || selectedReturnTotalAmount <= 0}
                      onClick={() => setConfirmDialogVisible(true)}
                    >
                      确认办理退药
                    </Button>
                  </div>
                </footer>
              </>
            )}
          </main>
        </div>
      )}

      {/* Confirmation Dialog for Batch Return */}
      {confirmDialogVisible && (
        <Dialog
          onClose={() => setConfirmDialogVisible(false)}
          title="确认办理门诊退药"
          footer={
            <div className="pharmacy-cancel-dialog-footer">
              <Button variant="secondary" onClick={() => setConfirmDialogVisible(false)}>
                取消
              </Button>
              <Button
                variant="primary"
                busy={returningTaskId !== null}
                onClick={() => void handleBatchReturn()}
              >
                确认退药出库冲回
              </Button>
            </div>
          }
        >
          <div className="pharmacy-return-dialog-content">
            <p className="pharmacy-cancel-dialog-copy">
              患者 <strong>{pFullName}</strong>（就诊号: {activePatient?.encounterNo || '未关联'}），本次将退回以下 <strong>{selectedItemsData.length}</strong> 项药品：
            </p>

            <UiDataTable className="pharmacy-prescription-table pharmacy-return-confirm-table">
              <thead>
                <tr>
                  <th>药品名称</th>
                  <th>本次退药数量</th>
                  <th>处置方式</th>
                  <th>退药金额</th>
                </tr>
              </thead>
              <tbody>
                {selectedItemsData.map(({ item, quantity, disposition, amount }) => {
                  const dispLabel = RETURN_DISPOSITION_OPTIONS.find((d) => d.value === disposition)?.label || disposition
                  return (
                    <tr key={item.request.id}>
                      <td><strong>{item.request.medicationName}</strong></td>
                      <td>{quantity}</td>
                      <td>{dispLabel}</td>
                      <td>¥{amount.toFixed(2)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </UiDataTable>

            <div className="pharmacy-return-confirm-total-box">
              <span>本次退药冲销总金额:</span>
              <strong className="pharmacy-return-amount-cell">¥{selectedReturnTotalAmount.toFixed(2)}</strong>
            </div>

            <div className="pharmacy-return-form-field">
              <label>退药原因:</label>
              <Select
                value={returnReasonCode}
                onChange={setReturnReasonCode}
                options={RETURN_REASON_OPTIONS}
              />
            </div>

            <div className="pharmacy-return-form-field">
              <label>退药说明（可选）:</label>
              <input
                type="text"
                value={returnDescription}
                onChange={(e) => setReturnDescription(e.target.value)}
                placeholder="例如：患者门诊复查遵医嘱停药"
                className="pharmacy-return-desc-input"
              />
            </div>
          </div>
        </Dialog>
      )}

      {/* Confirmation Dialog for Single Return */}
      {singleReturnItem && (
        <Dialog
          onClose={() => setSingleReturnItem(null)}
          title="办理单品退药"
          footer={
            <div className="pharmacy-cancel-dialog-footer">
              <Button variant="secondary" onClick={() => setSingleReturnItem(null)}>
                取消
              </Button>
              <Button
                variant="primary"
                busy={returningTaskId !== null}
                onClick={() => void handleSingleReturn()}
              >
                确认退药
              </Button>
            </div>
          }
        >
          <div className="pharmacy-return-dialog-content">
            <p className="pharmacy-cancel-dialog-copy">
              患者 <strong>{pFullName}</strong> 申请办理单品退药：
            </p>

            <div className="pharmacy-modal-grid">
              <dt>退药品种</dt>
              <dd><strong>{singleReturnItem.name}</strong></dd>
              <dt>可退最大量</dt>
              <dd>{singleReturnItem.max}</dd>
              <dt>本次退药数量</dt>
              <dd>
                <input
                  type="number"
                  min={1}
                  max={singleReturnItem.max}
                  value={singleReturnItem.quantity}
                  onChange={(e) => {
                    const q = Math.min(singleReturnItem.max, Math.max(1, Number(e.target.value) || 1))
                    setSingleReturnItem((prev) => prev ? { ...prev, quantity: q } : null)
                  }}
                  className="pharmacy-return-qty-input"
                />
              </dd>
              <dt>处置方式</dt>
              <dd>
                <Select
                  value={singleReturnItem.disposition}
                  onChange={(d) => setSingleReturnItem((prev) => prev ? { ...prev, disposition: d } : null)}
                  options={RETURN_DISPOSITION_OPTIONS}
                />
              </dd>
              <dt>冲销金额</dt>
              <dd><strong className="pharmacy-return-amount-cell">¥{(singleReturnItem.quantity * singleReturnItem.unitPrice).toFixed(2)}</strong></dd>
            </div>

            <div className="pharmacy-return-form-field">
              <label>退药原因:</label>
              <Select
                value={returnReasonCode}
                onChange={setReturnReasonCode}
                options={RETURN_REASON_OPTIONS}
              />
            </div>

            <div className="pharmacy-return-form-field">
              <label>退药说明（可选）:</label>
              <input
                type="text"
                value={returnDescription}
                onChange={(e) => setReturnDescription(e.target.value)}
                placeholder="例如：患者遵医嘱停用此药"
                className="pharmacy-return-desc-input"
              />
            </div>
          </div>
        </Dialog>
      )}

      {/* Medical History Summary Dialog */}
      {activeHistorySummary && (
        <Dialog
          onClose={() => setActiveHistorySummary(null)}
          title={`病史摘要 - ${activeHistorySummary.title}`}
          footer={
            <Button variant="secondary" onClick={() => setActiveHistorySummary(null)}>
              关闭
            </Button>
          }
        >
          <dl className="pharmacy-modal-grid">
            <dt>门诊就诊号</dt>
            <dd>{activeHistorySummary.encounterNo || '未关联'}</dd>
            <dt>接诊医生</dt>
            <dd>{activeHistorySummary.clinicianId || '医生未记录'}</dd>
            <dt className="pharmacy-modal-grid__full">主诉</dt>
            <dd className="pharmacy-modal-grid__full">
              {activeHistorySummary.chiefComplaint || '无主诉记录'}
            </dd>
            <dt className="pharmacy-modal-grid__full">临床诊断</dt>
            <dd className="pharmacy-modal-grid__full">
              {activeHistorySummary.diagnoses?.length > 0 ? (
                <ul className="pharmacy-diagnosis-list">
                  {activeHistorySummary.diagnoses.map((d, i) => (
                    <li key={i}>
                      <span className="pharmacy-diagnosis-tag">{d.type === 'PRIMARY' ? '主诊断' : '次诊断'}</span>
                      <span>{d.display}</span>
                      {d.code && <small>({d.code})</small>}
                    </li>
                  ))}
                </ul>
              ) : (
                '暂无诊断记录'
              )}
            </dd>
          </dl>
        </Dialog>
      )}

      {/* Allergy Details Dialog */}
      {showAllergyModal && (
        <Dialog
          onClose={() => setShowAllergyModal(false)}
          title={`患者过敏史 - ${pFullName}`}
          footer={
            <Button variant="secondary" onClick={() => setShowAllergyModal(false)}>
              关闭
            </Button>
          }
        >
          {activeDrugAllergies.length > 0 ? (
            <div className="pharmacy-allergy-modal-list">
              {activeDrugAllergies.map((a) => (
                <Alert key={a.id} tone="error">
                  <strong>{a.substanceDisplay || '已知药物'}</strong>：{a.reactionText || '过敏反应'}
                  （严重程度：{a.reactionSeverity || '中度'}，核实状态：{a.verificationStatus}）
                </Alert>
              ))}
            </div>
          ) : (
            <Alert tone="success">
              {hasNoKnownDrugAllergy ? '经询问与档案核实：无已知药物过敏史。' : '当前暂无已登记药物过敏史记录。'}
            </Alert>
          )}
        </Dialog>
      )}
    </div>
  )
}
