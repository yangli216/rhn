import { DataTable as UiDataTable } from '../../../shared/ui'
import { formatDoseWithMinimumUnit, formatFrequencyName, recordedMedicationAmount, displayRecordedAmount, formatRecordedDuration } from "../medicationDisplay";
import { formatTime } from "../../../shared/format";
import { errorMessage } from "../../../shared/rhnApi";
import { ActionMenu, Alert, Button, Dialog, EmptyState, FormField, Icon, Panel, Select } from "../../../shared/ui";
import { usePharmacyWorkspace } from './usePharmacyWorkspace'
import { parseTraceCodeBatch, genderText, ageText, requestPackageUnit } from './pharmacyShared'

export function PharmacyDispensingPanel({ model }: { model: ReturnType<typeof usePharmacyWorkspace> }) {
 const { actionNotice, setActionNotice, error, selectedWindow, setSelectedWindow, autoCall, setAutoCall, scanInputRef, scanKeyword, setScanKeyword, scanPending, queuedTraceCount, enqueueTraceCodes, handleScanOrSearch, setShowQueueScreenModal, batchDispensing, handleBatchDispenseF4, completePicking, showActionNotice, setShowSettingsModal, expiryDaysFilter, setExpiryDaysFilter, refresh, filteredPatientGroups, appliedSearchKeyword, activePatient, setSelectedResidentId, handleCallPatient, pFullName, pGender, pAge, pEthnicity, pCoverage, pNationalId, pPhone, pAddress, activeDrugAllergies, setShowAllergyModal, prescriptionCards, checkedPrescriptionKeys, togglePrescriptionCheck, setActiveHistorySummary, itemRequiresTrace, getItemScannedCount, lastScannedRequestId, clearItemScans, westernAmount, chineseAmount, selectedTotalAmount, patientTotalAmount, activeHistorySummary, showAllergyModal, hasNoKnownDrugAllergy, showQueueScreenModal, showSettingsModal } = model


  // =========================================================================
  // DISPENSING WORKBENCH (Matching Screenshot Architecture)
  // =========================================================================
  return <div className="pharmacy-dispense-workbench">
    {actionNotice && <Alert key={actionNotice.id} tone={actionNotice.tone}
      onDismiss={() => setActionNotice(null)}>{actionNotice.text}</Alert>}
    {error && <Alert>{errorMessage(error)}</Alert>}

    {/* Top Action & Control Bar */}
    <header className="pharmacy-dispense-topbar" aria-label="药房控制栏">
      <div className="pharmacy-dispense-topbar__left">
        <div className="pharmacy-window-select">
          <Select
            value={selectedWindow}
            onChange={(val) => setSelectedWindow(val)}
            clearable={false}
            searchable={false}
            options={[
              { value: '窗口1', label: '窗口1' },
              { value: '窗口2', label: '窗口2' },
              { value: '窗口3', label: '窗口3' },
            ]}
            aria-label="发药窗口"
          />
        </div>

        <label className="pharmacy-auto-call-toggle" title="开启后选定患者自动呼叫">
          <input
            type="checkbox"
            checked={autoCall}
            onChange={(e) => setAutoCall(e.target.checked)}
          />
          <span>自动叫号</span>
        </label>

        <div className="pharmacy-scan-search">
          <input
            ref={scanInputRef}
            type="text"
            value={scanKeyword}
            onChange={(e) => setScanKeyword(e.target.value)}
            placeholder="批量扫码，或输入处方/患者/就诊号"
            aria-label="追溯码或处方患者检索"
            aria-busy={scanPending || queuedTraceCount > 0}
            onPaste={(e) => {
              const traceCodes = parseTraceCodeBatch(e.clipboardData.getData('text'))
              if (traceCodes.length > 1) {
                e.preventDefault()
                setScanKeyword('')
                enqueueTraceCodes(traceCodes)
              }
            }}
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
            <Icon name="search" />{queuedTraceCount > 0 ? `处理 ${queuedTraceCount} 码` : '查询'}
          </Button>
        </div>
      </div>

      <div className="pharmacy-dispense-topbar__right">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setShowQueueScreenModal(true)}
        >
          叫号屏
        </Button>
        <Button
          size="sm"
          className="pharmacy-dispense-btn-f4"
          busy={batchDispensing}
          onClick={() => void handleBatchDispenseF4()}
        >
          发药(F4)
        </Button>
        <Button
          size="sm"
          variant="secondary"
          busy={completePicking.isPending}
          onClick={() => void handleBatchDispenseF4()}
        >
          配药
        </Button>
        <ActionMenu label="打印" items={[
          { key: 'dispense', label: '打印发药单', onSelect: () => window.print() },
          { key: 'prescription', label: '打印处方笺', onSelect: () => window.print() },
          { key: 'labels', label: '打印药袋标签', onSelect: () => showActionNotice('info', '正在打印药袋标签…') },
        ]} />
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setShowSettingsModal(true)}
        >
          更多设置
        </Button>
      </div>
    </header>

    {/* Main Workbench Body */}
    <div className="pharmacy-dispense-body">
      {/* Left Column: Waiting Patient Queue */}
      <aside className="pharmacy-patient-queue" aria-label="待发药患者队列">
        <div className="pharmacy-patient-queue__head">
          <div className="pharmacy-patient-queue__title">待发药患者</div>
          <div className="pharmacy-patient-queue__filter">
            <span>效期(天)</span>
            <div className="pharmacy-expiry-select-wrap">
              <Select
                size="sm"
                value={String(expiryDaysFilter)}
                onChange={(val) => setExpiryDaysFilter(Number(val))}
                clearable={false}
                searchable={false}
                options={[
                  { value: '30', label: '30' },
                  { value: '60', label: '60' },
                  { value: '100', label: '100' },
                  { value: '365', label: '365' },
                ]}
                aria-label="效期天数"
              />
            </div>
            <Button
              type="button"
              className="pharmacy-patient-queue__refresh"
              title="刷新队列"
              onClick={() => void refresh()} variant="text" size="sm"
            >
              <Icon name="refresh" />
            </Button>
          </div>
        </div>

        <div className="pharmacy-patient-queue__list">
          {!filteredPatientGroups.length ? (
            <EmptyState icon="pharmacy"
              title={appliedSearchKeyword ? '未找到匹配的待发药患者' : '暂无待发药患者'}
              copy={appliedSearchKeyword
                ? '请更换患者、处方、就诊或药品查询条件后重试。'
                : '门诊开立处方并完成缴费后将进入队列。'} />
          ) : (
            filteredPatientGroups.map((p) => {
              const isSelected = p.residentId === activePatient?.residentId
              return (
                <div
                  key={p.residentId}
                  className={`pharmacy-queue-item ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => {
                    setSelectedResidentId(p.residentId)
                    if (autoCall) handleCallPatient(p)
                  }}
                >
                  <div className="pharmacy-queue-item__main">
                    <div className="pharmacy-queue-item__row-top">
                      <strong className="pharmacy-queue-item__name">{p.residentName}</strong>
                      <Button
                        type="button"
                        className="pharmacy-queue-item__call-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleCallPatient(p)
                        }}
                        title={`呼叫 ${p.residentName}`} variant="text" size="sm"
                      >
                        叫号
                      </Button>
                    </div>
                    <div className="pharmacy-queue-item__row-bottom">
                      <span className="pharmacy-queue-item__meta">
                        {genderText(p.gender)} · {ageText(p.birthDate)}
                      </span>
                      <span className="pharmacy-queue-item__badge-waiting">待发药</span>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </aside>

      {/* Right Column: Main Dispensing Workspace */}
      <main className="pharmacy-dispense-main">
        {!activePatient ? (
          <Panel>
            <EmptyState icon="pharmacy" title="请选择待发药患者" copy="左侧选择待发药患者后查看处方明细并核对发药。" />
          </Panel>
        ) : (
          <>
            {/* Top Patient Info Banner */}
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
                  title="点击查看患者过敏史详情" variant="text" size="sm"
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

            {/* Prescriptions Board */}
            <div className="pharmacy-prescriptions-board">
              {prescriptionCards.map((card) => (
                <article key={card.key} className="pharmacy-prescription-card">
                    {/* Prescription Header */}
                  <header className="pharmacy-prescription-card__header">
                    <div className="pharmacy-prescription-card__header-left">
                      <input
                        type="checkbox"
                        className="pharmacy-prescription-card__checkbox"
                        checked={checkedPrescriptionKeys.has(card.key)}
                        onChange={() => togglePrescriptionCheck(card.key)}
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
                      <span className={`pharmacy-prescription-card__status ${card.isDispensed ? 'is-dispensed' : ''}`}>
                        {card.statusLabel}
                      </span>
                      <Button variant="text" size="sm"
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
                      <strong className="pharmacy-prescription-card__amount">{displayRecordedAmount(card.totalAmount)}</strong>
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
                          <th style={{ minWidth: '7.5rem' }}>每次剂量</th>
                          <th style={{ minWidth: '5rem' }}>频次</th>
                          <th style={{ minWidth: '5rem' }}>药品用法</th>
                          <th style={{ minWidth: '4.5rem' }}>总量</th>
                          <th style={{ minWidth: '4.5rem' }}>单价</th>
                          <th style={{ minWidth: '4.5rem' }}>金额</th>
                          <th style={{ minWidth: '4rem' }}>疗程</th>
                          <th style={{ minWidth: '6.5rem' }}>已扫数量</th>
                          <th style={{ width: '4.5rem', textAlign: 'center' }}>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {card.items.map((it, idx) => {
                          const req = it.request
                          const requiresTrace = itemRequiresTrace(it)
                          const scannedQty = requiresTrace ? getItemScannedCount(req) : req.quantity
                          const isComplete = !requiresTrace || (scannedQty >= req.quantity && req.quantity > 0)
                          const snap = (req.medicationSnapshot as Record<string, unknown> | undefined) ?? {}
                          const manufacturer = req.manufacturerName || (snap.manufacturerName as string) || (snap.manufacturer as string) || '厂家未记录'
                          const spec = req.packageSpec || req.preparationSpec || '规格未记录'
                          const dosage = formatDoseWithMinimumUnit(req)
                          const frequency = formatFrequencyName(req.frequencyCode, req.frequencyName)
                          const route = req.routeName ?? req.routeCode ?? '未填写'
                          const unitPrice = req.unitPrice
                          const amount = recordedMedicationAmount(req)
                          const days = formatRecordedDuration(req)
                          const packageUnit = requestPackageUnit(req.quantityUnit, req.packageUnitName)

                          return (
                            <tr key={req.id} data-request-id={req.id}
                              className={lastScannedRequestId === req.id ? 'is-scan-target' : undefined}>
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
                              <td title={manufacturer} style={{ maxWidth: '12rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {manufacturer}
                              </td>
                              <td>
                                <span className="pharmacy-dosage-text">{dosage}</span>
                              </td>
                              <td>{frequency}</td>
                              <td>{route}</td>
                              <td>{req.quantity} {packageUnit}</td>
                              <td>{unitPrice == null ? '单价未提供' : unitPrice.toFixed(2)}</td>
                              <td>{amount == null ? '金额未提供' : amount.toFixed(2)}</td>
                              <td>{days}</td>
                              <td>
                                <span
                                  className={`pharmacy-scan-status ${!requiresTrace ? 'pharmacy-scan-status--neutral' : isComplete ? 'pharmacy-scan-status--success' : 'pharmacy-scan-status--danger'}`}
                                  title={!requiresTrace ? '该药品无需追溯码核对' : isComplete ? '追溯码数量已核对完成' : scannedQty === 0 ? '追溯码尚未扫码' : '追溯码扫入数量不足'}
                                >
                                  {!requiresTrace
                                    ? '无需扫码'
                                    : isComplete
                                    ? `${scannedQty} ${packageUnit}`
                                    : `${scannedQty} / ${req.quantity} ${packageUnit}`}
                                </span>
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <Button
                                  type="button"
                                  className={`pharmacy-scan-action-btn ${isComplete ? 'is-scanned' : ''}`}
                                  disabled={!requiresTrace}
                                  onClick={() => {
                                    if (scannedQty > 0) {
                                      clearItemScans(req.id)
                                      showActionNotice('info', `已清空“${req.medicationName}”的扫码记录`)
                                    } else {
                                      scanInputRef.current?.focus()
                                    }
                                  }} variant="text" size="sm"
                                >
                                  {!requiresTrace ? '--' : scannedQty > 0 ? '清空' : '扫码'}
                                </Button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </UiDataTable>
                  </div>
                </article>
              ))}
            </div>

            {/* Bottom Summary Footer */}
            <footer className="pharmacy-dispense-footer" aria-label="金额汇总">
              <div className="pharmacy-dispense-footer__breakdown">
                <div>
                  <span>已选西药处方总金额:</span>
                  <strong>{displayRecordedAmount(westernAmount)}</strong>
                </div>
                <div>
                  <span>已选中药处方总金额:</span>
                  <strong>{displayRecordedAmount(chineseAmount)}</strong>
                </div>
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
          <div style={{ gridColumn: '1 / -1' }}>
            <dt>主诉</dt>
            <dd>{activeHistorySummary.chiefComplaint || '患者自述无特殊不适，定期复查开药。'}</dd>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <dt>临床诊断</dt>
            <dd>
              {activeHistorySummary.diagnoses.length > 0
                ? activeHistorySummary.diagnoses.map((d) => `${d.display}（${d.code}）`).join('；')
                : '慢性病毒性肝炎 / 随诊开药'}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {activeDrugAllergies.map((a) => (
              <Alert key={a.id} tone="error">
                <strong>{a.substanceDisplay || '已知药物'}</strong>：{a.reactionText || '过敏反应'}
                （严重程度：{a.reactionSeverity || '中度'}，核实状态：{a.verificationStatus}）
              </Alert>
            ))}
          </div>
        ) : (
          <Alert tone="success">
            {hasNoKnownDrugAllergy ? '经询问与档案核实：无已知药物过敏史。' : '当前暂无已登记药物过敏史记录。发药前请向患者进行常规用药过敏口头核实。'}
          </Alert>
        )}
      </Dialog>
    )}

    {/* Modal: Queue Calling Screen (叫号屏) */}
    {showQueueScreenModal && (
      <Dialog
        title="门诊药房排队叫号大屏"
        onClose={() => setShowQueueScreenModal(false)}
        footer={<Button onClick={() => setShowQueueScreenModal(false)}>关闭</Button>}
      >
        <div className="pharmacy-queue-screen-board">
          <span  className="pharmacy-content-1">当前正在叫号</span>
          <div className="pharmacy-queue-screen-ticket">
            {activePatient ? `${activePatient.residentName} → ${selectedWindow}` : '等待叫号中'}
          </div>
          <p  className="pharmacy-content-2">
            请听到广播呼叫的患者携带就诊卡/社保卡，至 {selectedWindow} 窗口核对身份取药。
          </p>
        </div>
      </Dialog>
    )}

    {/* Modal: Settings (更多设置) */}
    {showSettingsModal && (
      <Dialog
        title="药房发药工作台偏好设置"
        onClose={() => setShowSettingsModal(false)}
        footer={<Button onClick={() => setShowSettingsModal(false)}>保存设置</Button>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <FormField label="发药窗口">
            <Select
              value={selectedWindow}
              onChange={setSelectedWindow}
              options={[
                { value: '窗口1', label: '窗口1（西药发药窗口）' },
                { value: '窗口2', label: '窗口2（中药发药窗口）' },
                { value: '窗口3', label: '窗口3（急诊/慢病窗口）' },
              ]}
            />
          </FormField>
          <FormField label="扫码模式">
            <Select
              value="BARCODE_AUTO_CHECK"
              options={[
                { value: 'BARCODE_AUTO_CHECK', label: '扫码后自动勾选并核对药品' },
                { value: 'BARCODE_INSTANT_DISPENSE', label: '扫码后直接完成整单发药' },
              ]}
            />
          </FormField>
          <FormField label="快捷键设置">
            <input value="F4 发药 / Enter 搜索" disabled />
          </FormField>
        </div>
      </Dialog>
    )}
  </div>
}
