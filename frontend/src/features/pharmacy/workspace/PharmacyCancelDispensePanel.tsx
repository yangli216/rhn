import { useState } from 'react'
import { DataTable as UiDataTable } from '../../../shared/ui'
import { recordedMedicationAmount, displayRecordedAmount } from '../medicationDisplay'
import { formatTime, genderLabel } from '../../../shared/format'
import { errorMessage } from '../../../shared/rhnApi'
import { Alert, Button, Dialog, EmptyState, Icon } from '../../../shared/ui'
import { usePharmacyWorkspace } from './usePharmacyWorkspace'
import { ageText, requestPackageUnit } from './pharmacyShared'

export function PharmacyCancelDispensePanel({ model }: { model: ReturnType<typeof usePharmacyWorkspace> }) {
  const {
    actionNotice, setActionNotice, error, scanInputRef, scanKeyword, setScanKeyword, scanPending,
    handleScanOrSearch, cancellingTaskId, handleBatchCancelDispense,
    filteredPatientGroups, activePatient, setSelectedResidentId, pFullName, pGender, pAge,
    pEthnicity, pCoverage, pNationalId, pPhone, pAddress, prescriptionCards,
    checkedPrescriptionKeys, togglePrescriptionCheck, selectedTotalAmount, patientTotalAmount, refresh,
    activeDrugAllergies, setShowAllergyModal, showAllergyModal, hasNoKnownDrugAllergy,
    activeHistorySummary, setActiveHistorySummary, residentMap,
  } = model

  const [confirmDialogVisible, setConfirmDialogVisible] = useState(false)

  const checkedCount = checkedPrescriptionKeys.size

  return (
    <div className="pharmacy-dispense-workbench">
      {actionNotice && (
        <Alert
          key={actionNotice.id}
          tone={actionNotice.tone}
          onDismiss={() => setActionNotice(null)}
        >
          {actionNotice.text}
        </Alert>
      )}
      {error && <Alert tone="error">{errorMessage(error)}</Alert>}

      {/* Top Action & Control Bar */}
      <header className="pharmacy-dispense-topbar" aria-label="取消发药控制栏">
        <div className="pharmacy-dispense-topbar__left">
          <div className="pharmacy-cancel-title-group">
            <span className="pharmacy-cancel-title-eyebrow">药事管理 · 异常处理</span>
            <strong className="pharmacy-cancel-title-heading">取消发药（撤销发药）</strong>
          </div>

          <div className="pharmacy-scan-search pharmacy-cancel-search-wrap">
            <input
              ref={scanInputRef}
              type="text"
              value={scanKeyword}
              onChange={(e) => setScanKeyword(e.target.value)}
              placeholder="输入已发药患者姓名、手机号、处方号或就诊号"
              aria-label="检索已发药记录"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void handleScanOrSearch()
                }
              }}
            />
            <Button
              size="sm"
              variant="secondary"
              busy={scanPending}
              onClick={() => void handleScanOrSearch(true)}
            >
              <Icon name="search" />
              <span>查询</span>
            </Button>
          </div>
        </div>

        <div className="pharmacy-dispense-topbar__right">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void refresh()}
            title="刷新记录"
          >
            <Icon name="refresh" />
            <span>刷新</span>
          </Button>

          {/* Unified Revocation Action Button */}
          <Button
            size="sm"
            variant="danger"
            busy={cancellingTaskId === 'batch'}
            disabled={!activePatient || checkedCount === 0 || cancellingTaskId !== null}
            onClick={() => setConfirmDialogVisible(true)}
            title="撤销当前勾选处方的发药记录并将库存原路冲回"
          >
            <span>撤销发药{checkedCount > 0 ? ` (${checkedCount})` : ''}</span>
          </Button>
        </div>
      </header>

      {/* Main Body */}
      <div className="pharmacy-dispense-body">
        {/* Left Column: Dispensed Patients Queue */}
        <aside className="pharmacy-patient-queue" aria-label="已发药待取消队列">
          <div className="pharmacy-patient-queue__head">
            <div className="pharmacy-patient-queue__title">已发药患者记录</div>
            <span className="pharmacy-cancel-count-badge">
              共 {filteredPatientGroups.length} 位
            </span>
          </div>

          <div className="pharmacy-patient-queue__list" role="feed">
            {filteredPatientGroups.length === 0 ? (
              <EmptyState
                icon="pharmacy"
                title="暂无可取消的发药记录"
                copy="当前药房近期已完成发药且未退药的处方会显示在这里。"
              />
            ) : (
              filteredPatientGroups.map((p) => {
                const isSelected = activePatient?.residentId === p.residentId
                const totalAmount = p.items.reduce(
                  (sum, it) => sum + (recordedMedicationAmount(it.request) || 0),
                  0,
                )
                const latestDispensedAt = p.items.find((it) => it.dispensedAt)?.dispensedAt
                const resInfo = residentMap.get(p.residentId)
                const displayName = (isSelected && pFullName !== '患者') ? pFullName : (resInfo?.fullName || p.residentName)
                const displayGender = genderLabel(resInfo?.gender || p.gender)
                const displayAge = ageText(resInfo?.birthDate || p.birthDate)

                return (
                  <div
                    key={p.residentId}
                    role="article"
                    tabIndex={0}
                    className={`pharmacy-queue-item ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => setSelectedResidentId(p.residentId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSelectedResidentId(p.residentId)
                      }
                    }}
                  >
                    <div className="pharmacy-queue-item__main">
                      <div className="pharmacy-queue-item__row-top">
                        <strong className="pharmacy-queue-item__name">{displayName}</strong>
                        <strong className="pharmacy-cancel-queue-amount">
                          {displayRecordedAmount(totalAmount)}
                        </strong>
                      </div>
                      <div className="pharmacy-queue-item__row-bottom">
                        <span className="pharmacy-queue-item__meta">
                          {displayGender} · {displayAge} · {p.items.length} 剂/方
                        </span>
                        {latestDispensedAt ? (
                          <span className="pharmacy-cancel-item-time">
                            发药于 {formatTime(latestDispensedAt)}
                          </span>
                        ) : (
                          <span className="pharmacy-cancel-queue-badge">已发药</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </aside>

        {/* Right Column: Main Workbench */}
        <main className="pharmacy-dispense-main" aria-label="取消发药工作区">
          {!activePatient ? (
            <div className="pharmacy-dispense-empty">
              <EmptyState
                icon="pharmacy"
                title="请在左侧选择需要取消发药的患者"
                copy="选中患者后可查看发药明细，核对药品并撤销发药记录，库存将自动冲回可用。"
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
              <div className="pharmacy-cancel-banner-notice" role="status">
                <Icon name="warning" className="pharmacy-cancel-banner-notice__icon" />
                <div className="pharmacy-cancel-banner-notice__content">
                  <strong>误发药撤销说明：</strong>
                  取消发药会将已出库药品的实物库存原路冲回当前药房的可用库存中，追溯码恢复可用，处方状态恢复为【待发药】。撤销后，患者将重新返回【门诊发药】工作台的待发队列中，便于后续重新核对与发药。
                </div>
              </div>

              {/* 3. Prescriptions Board */}
              <div className="pharmacy-prescriptions-board">
                {prescriptionCards.map((card) => (
                  <article key={card.key} className="pharmacy-prescription-card">
                    <header className="pharmacy-prescription-card__header">
                      <div className="pharmacy-prescription-card__header-left">
                        <input
                          type="checkbox"
                          className="pharmacy-prescription-card__checkbox"
                          checked={checkedPrescriptionKeys.has(card.key)}
                          onChange={() => togglePrescriptionCheck(card.key)}
                          aria-label={`勾选${card.title}`}
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
                        <span className="pharmacy-prescription-card__status is-dispensed">
                          已发药
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
                      </div>
                    </header>

                    {/* Prescription Table */}
                    <div className="pharmacy-prescription-table-wrap">
                      <UiDataTable className="pharmacy-prescription-table">
                        <thead>
                          <tr>
                            <th style={{ width: '3rem' }}>序号</th>
                            <th style={{ minWidth: '12rem' }}>药品名称/规格</th>
                            <th style={{ minWidth: '9rem' }}>厂家</th>
                            <th style={{ minWidth: '5rem' }}>频次</th>
                            <th style={{ minWidth: '5rem' }}>用法</th>
                            <th style={{ minWidth: '4.5rem' }}>发药数量</th>
                            <th style={{ minWidth: '4.5rem' }}>单价</th>
                            <th style={{ minWidth: '4.5rem' }}>金额</th>
                          </tr>
                        </thead>
                        <tbody>
                          {card.items.map((it, idx) => {
                            const req = it.request
                            const snap = (req.medicationSnapshot as Record<string, unknown> | undefined) ?? {}
                            const manufacturer = req.manufacturerName || (snap.manufacturerName as string) || (snap.manufacturer as string) || '厂家未记录'
                            const spec = req.packageSpec || req.preparationSpec || '规格未记录'
                            const packageUnit = requestPackageUnit(req.quantityUnit, req.packageUnitName)

                            return (
                              <tr key={req.id}>
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
                                <td>{req.frequencyName || '—'}</td>
                                <td>{req.routeName || req.routeCode || '—'}</td>
                                <td><strong>{it.dispensedQuantity ?? req.quantity} {packageUnit}</strong></td>
                                <td>{req.unitPrice == null ? '—' : req.unitPrice.toFixed(2)}</td>
                                <td>{recordedMedicationAmount(req) == null ? '—' : (recordedMedicationAmount(req) || 0).toFixed(2)}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </UiDataTable>
                    </div>
                  </article>
                ))}
              </div>

              {/* 4. Bottom Summary Footer (aligned with main workbench) */}
              <footer className="pharmacy-dispense-footer" aria-label="金额汇总">
                <div className="pharmacy-dispense-footer__breakdown">
                  <div>
                    <span>已选处方总金额:</span>
                    <strong>{displayRecordedAmount(selectedTotalAmount)}</strong>
                  </div>
                </div>
                <div className="pharmacy-dispense-footer__total">
                  <span>总金额:</span>
                  <strong>{displayRecordedAmount(patientTotalAmount)}</strong>
                </div>
              </footer>
            </>
          )}
        </main>
      </div>

      {/* Confirmation Dialog for Revoking Dispense */}
      {confirmDialogVisible && (
        <Dialog
          onClose={() => setConfirmDialogVisible(false)}
          title="确认撤销发药"
          footer={
            <div className="pharmacy-cancel-dialog-footer">
              <Button variant="secondary" onClick={() => setConfirmDialogVisible(false)}>
                暂不撤销
              </Button>
              <Button
                variant="danger"
                busy={cancellingTaskId === 'batch'}
                onClick={async () => {
                  setConfirmDialogVisible(false)
                  await handleBatchCancelDispense()
                }}
              >
                确定撤销发药
              </Button>
            </div>
          }
        >
          <p>
            确定要撤销患者 <strong>{pFullName}</strong> 所选的 <strong>{checkedCount}</strong> 张处方发药记录吗？
          </p>
          <p className="pharmacy-cancel-dialog-copy">
            撤销后，已发药品的实物库存将原路冲回，任务状态将恢复为【待发药】，可在门诊发药队列中重新处理。
          </p>
        </Dialog>
      )}

      {/* Modal: History Summary (病史摘要) */}
      {activeHistorySummary && (
        <Dialog
          title={`病史摘要 - ${activeHistorySummary.title}`}
          onClose={() => setActiveHistorySummary(null)}
          footer={<Button onClick={() => setActiveHistorySummary(null)}>关闭</Button>}
        >
          <dl className="pharmacy-modal-grid">
            <div>
              <dt>门诊就诊号</dt>
              <dd>{activeHistorySummary.encounterNo || '未关联就诊'}</dd>
            </div>
            <div>
              <dt>开单医生</dt>
              <dd>{activeHistorySummary.clinicianId || '未记录'}</dd>
            </div>
            <div className="pharmacy-modal-grid__full">
              <dt>主诉</dt>
              <dd>{activeHistorySummary.chiefComplaint || '患者自述无特殊不适，常规门诊开药。'}</dd>
            </div>
            <div className="pharmacy-modal-grid__full">
              <dt>临床诊断</dt>
              <dd>
                {activeHistorySummary.diagnoses.length > 0
                  ? activeHistorySummary.diagnoses.map((d) => `${d.display}（${d.code}）`).join('；')
                  : '门诊开单随诊'}
              </dd>
            </div>
          </dl>
        </Dialog>
      )}

      {/* Modal: Allergy Intolerance (过敏史) */}
      {showAllergyModal && (
        <Dialog
          title={`过敏史与用药警示 - ${pFullName}`}
          onClose={() => setShowAllergyModal(false)}
          footer={<Button onClick={() => setShowAllergyModal(false)}>确认</Button>}
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
              {hasNoKnownDrugAllergy ? '经询问与档案核实：无已知药物过敏史。' : '当前暂无已登记药物过敏史记录。取消发药恢复后如需重新发药，请向患者进行常规用药过敏口头核实。'}
            </Alert>
          )}
        </Dialog>
      )}
    </div>
  )
}
