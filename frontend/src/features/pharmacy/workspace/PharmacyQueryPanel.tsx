import { displayUnitName } from "../medicationDisplay";
import { formatTime } from "../../../shared/format";
import { errorMessage } from "../../../shared/rhnApi";
import { Alert, Button, EmptyState, Icon, LoadingState, PageHeader, Panel, Select, StatusBadge } from "../../../shared/ui";
import { DateRangePicker } from "../../../shared/ui/DateRangePicker";
import { PHARMACY_QUERY_PRESETS, type DateRange, type PresetKey } from "../../../shared/utils/dateRange";
import { usePharmacyWorkspace } from './usePharmacyWorkspace'
import { type PharmacyQueryStatus, pharmacyQueryStatusOptions, genderText, ageText, pharmacyQueryResidentName, formatRequestQuantity, formatQuantityWithUnit, statusTone, taskStatusText } from './pharmacyShared'

export function PharmacyQueryPanel({ model }: { model: ReturnType<typeof usePharmacyWorkspace> }) {
 const { practitioners, queryVisibleInbox, pharmacyQueryPage, pharmacyQueryPageSize, setPharmacyQueryDraft, setPharmacyQueryFilters, setPharmacyQueryPage, copy, refresh, actionNotice, setActionNotice, error, sites, inbox, eligibleSites, pharmacyQueryDraft, applyPharmacyQuery, resetPharmacyQuery, pagedPharmacyQueryInbox, residentMap, querySummary, setPharmacyQueryPageSize, pharmacyQueryPageCount } = model

    const practitionerNames = new Map((practitioners.data ?? []).map((value) => [value.id, value.fullName]))
    const pageStart = queryVisibleInbox.length ? pharmacyQueryPage * pharmacyQueryPageSize + 1 : 0
    const pageEnd = Math.min((pharmacyQueryPage + 1) * pharmacyQueryPageSize, queryVisibleInbox.length)

    const handleDateRangeChange = (range: DateRange, presetKey?: PresetKey) => {
      setPharmacyQueryDraft((previous) => ({ ...previous, startDate: range.from, endDate: range.to }))
      if (presetKey) {
        setPharmacyQueryFilters((previous) => ({ ...previous, startDate: range.from, endDate: range.to }))
        setPharmacyQueryPage(0)
      }
    }

    return <div className="pharmacy-query-page">
      <PageHeader eyebrow={copy.eyebrow} title={copy.title}
        description="按实际发药日期查询患者、处方与药品执行记录。"
        actions={<Button variant="secondary" onClick={() => void refresh()}>
          <Icon name="refresh" />刷新数据
        </Button>} />
      {actionNotice && <Alert key={actionNotice.id} tone={actionNotice.tone}
        onDismiss={() => setActionNotice(null)}>{actionNotice.text}</Alert>}
      {error && <Alert>{errorMessage(error)}</Alert>}
      {(sites.isPending || inbox.isPending) && <Panel><LoadingState label="正在加载发药记录…" /></Panel>}
      {!sites.isPending && eligibleSites.length === 0 && <Panel><EmptyState icon="pharmacy" title="当前科室不是已配置药房"
        copy="请在顶部工作上下文切换到门诊或住院药房；若仍无可选站点，请由管理员完成药房库存配置。" /></Panel>}
      {!sites.isPending && !inbox.isPending && eligibleSites.length > 0 && <>
        <section className="pharmacy-query-filters" aria-label="发药查询条件">
          <div className="pharmacy-query-filters__row">
            <label className="pharmacy-query-field pharmacy-query-field--keyword">
              <span>患者或处方</span>
              <div className="pharmacy-query-field__input">
                <Icon name="search" />
                <input value={pharmacyQueryDraft.keyword}
                  placeholder="姓名、手机号、就诊号、处方号或药品名称"
                  onChange={(event) => setPharmacyQueryDraft((previous) => ({ ...previous, keyword: event.target.value }))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      applyPharmacyQuery()
                    }
                  }} />
              </div>
            </label>
            <label className="pharmacy-query-field">
              <span>业务状态</span>
              <Select value={pharmacyQueryDraft.status}
                onChange={(value) => setPharmacyQueryDraft((previous) => ({ ...previous, status: value as PharmacyQueryStatus }))}
                clearable={false} searchable={false} options={pharmacyQueryStatusOptions} />
            </label>
            <div className="pharmacy-query-field pharmacy-query-field--date">
              <span>发药日期</span>
              <DateRangePicker
                value={{ from: pharmacyQueryDraft.startDate, to: pharmacyQueryDraft.endDate }}
                presets={PHARMACY_QUERY_PRESETS}
                onChange={handleDateRangeChange}
                startAriaLabel="发药开始日期"
                endAriaLabel="发药结束日期"
              />
            </div>
            <div className="pharmacy-query-filters__actions">
              <Button onClick={applyPharmacyQuery}><Icon name="search" />查询</Button>
              <Button variant="secondary" onClick={resetPharmacyQuery}>重置</Button>
            </div>
          </div>
        </section>

        <section className="pharmacy-query-results" aria-label="发药记录列表">
          <header><div><h2>发药记录</h2><span>按发药时间倒序排列</span></div></header>
          {!queryVisibleInbox.length ? <EmptyState icon="pharmacy" title="未查询到匹配记录"
            copy="请调整患者、处方、药品、发药日期或业务状态后重新查询。" />
            : <div className="pharmacy-query-table" role="table" aria-label="历史发药记录">
              <div className="pharmacy-query-table__head" role="row">
                <span>发药时间</span><span>患者信息</span><span>药品与产品</span><span>处方数量</span>
                <span>执行数量</span><span>用法用量</span><span>发药人员</span><span>状态</span>
              </div>
              {pagedPharmacyQueryInbox.map((item) => {
                const snapshot = item.request.medicationSnapshot as Record<string, unknown> | undefined
                const resId = item.request.residentId || ''
                const resInfo = residentMap.get(resId) || residentMap.get(item.healthRecordNo)
                const gender = resInfo?.gender
                  || (snapshot?.gender as string | undefined)
                  || (snapshot?.residentGender as string | undefined)
                const birthDate = resInfo?.birthDate
                  || (snapshot?.birthDate as string | undefined)
                  || (snapshot?.residentBirthDate as string | undefined)
                const genderStr = gender ? genderText(gender) : undefined
                const ageStr = birthDate ? ageText(birthDate) : undefined
                const patientMeta = [genderStr, ageStr].filter(Boolean).join(' · ')

                const productName = item.selectedProductName
                  || item.request.itemName
                  || (snapshot?.productName as string | undefined)
                  || item.request.medicationName
                const genericName = item.request.medicationName
                const spec = item.request.packageSpec ?? item.request.preparationSpec
                const manufacturer = (item.request.manufacturerName
                  ?? snapshot?.manufacturerName ?? (snapshot as any)?.manufacturer ?? '') as string
                const dispenseUnit = displayUnitName(item.dispenseUnitCode ?? item.request.quantityUnit)

                const specAndMfr = [spec, manufacturer].filter(Boolean).join(' · ')
                const showGeneric = Boolean(genericName && genericName !== productName)

                return <div role="row" key={item.request.id} className="pharmacy-query-table__row">
                  <time>{item.dispensedAt ? formatTime(item.dispensedAt) : '未发生发药'}</time>
                  <span className="pharmacy-query-table__patient">
                    <strong>
                      {pharmacyQueryResidentName(item)}
                      {patientMeta && <span className="pharmacy-query-patient-meta">{patientMeta}</span>}
                    </strong>
                    <small>{[item.healthRecordNo, item.residentPhone].filter(Boolean).join(' · ') || '患者档案信息待补充'}</small>
                  </span>
                  <div className="pharmacy-query-table__drug">
                    <strong title={productName}>
                      {productName}
                      {showGeneric && <span className="pharmacy-query-drug-generic" title={`通用名: ${genericName}`}>（通用名: {genericName}）</span>}
                    </strong>
                    <div className="pharmacy-query-drug-spec-mfr" title={specAndMfr || '规格与厂家待补充'}>
                      {spec && <span className="pharmacy-query-drug-spec">{spec}</span>}
                      {spec && manufacturer && <span className="pharmacy-query-drug-sep">·</span>}
                      {manufacturer && <span className="pharmacy-query-drug-mfr">{manufacturer}</span>}
                      {!spec && !manufacturer && <span className="pharmacy-query-drug-empty">规格与厂家待补充</span>}
                    </div>
                  </div>
                  <strong>{formatRequestQuantity(item.request)}</strong>
                  <span className="pharmacy-query-table__quantity"><strong>已发 {formatQuantityWithUnit(
                    item.dispensedQuantity ?? 0, dispenseUnit)}</strong>
                    <small>{(item.returnedQuantity ?? 0) > 0 ? `已退 ${formatQuantityWithUnit(item.returnedQuantity ?? 0, dispenseUnit)}`
                      : `计划 ${formatQuantityWithUnit(item.plannedQuantity ?? item.request.quantity, dispenseUnit)}`}</small></span>
                  <div className="pharmacy-query-table__usage">
                    <strong title={[item.request.routeName ?? item.request.routeCode,
                      item.request.frequencyName ?? item.request.frequencyCode].filter(Boolean).join(' · ')}>
                      {[item.request.routeName ?? item.request.routeCode,
                        item.request.frequencyName ?? item.request.frequencyCode].filter(Boolean).join(' · ') || '未填写'}
                    </strong>
                    <strong className="pharmacy-query-usage-dose">
                      {item.request.doseValue && item.request.doseUnit
                        ? `每次 ${formatQuantityWithUnit(item.request.doseValue, displayUnitName(item.request.doseUnit))}` : '剂量未填写'}
                    </strong>
                  </div>
                  <span>{item.dispenserPractitionerId
                    ? practitionerNames.get(item.dispenserPractitionerId) || '药师信息待补充' : '未发药'}</span>
                  <StatusBadge tone={statusTone(item.taskStatus)}>{taskStatusText[item.taskStatus ?? ''] ?? '待处理'}</StatusBadge>
                </div>
              })}
            </div>}
          <footer className="pharmacy-query-pagination">
            <div className="pharmacy-query-pagination__summary">
              <strong>共 {querySummary.total} 条</strong>
              <span>正常完成 {querySummary.completed}</span><span>退药 {querySummary.returned}</span>
              <span>未完成 {querySummary.exceptions}</span>
              {queryVisibleInbox.length > 0 && <span>当前 {pageStart}-{pageEnd} 条</span>}
            </div>
            <div className="pharmacy-query-pagination__controls">
              <label>每页 <Select value={String(pharmacyQueryPageSize)} clearable={false} searchable={false}
                onChange={(value) => { setPharmacyQueryPageSize(Number(value)); setPharmacyQueryPage(0) }}
                options={[20, 50, 100].map((value) => ({ value: String(value), label: `${value} 条` }))} /></label>
              <Button type="button" aria-label="上一页" disabled={pharmacyQueryPage === 0}
                onClick={() => setPharmacyQueryPage((previous) => Math.max(0, previous - 1))} variant="text" size="sm"><Icon name="chevron-left" /></Button>
              <span>第 {pharmacyQueryPage + 1} / {pharmacyQueryPageCount} 页</span>
              <Button type="button" aria-label="下一页" disabled={pharmacyQueryPage + 1 >= pharmacyQueryPageCount}
                onClick={() => setPharmacyQueryPage((previous) => Math.min(pharmacyQueryPageCount - 1, previous + 1))} variant="text" size="sm">
                <Icon name="chevron-right" /></Button>
            </div>
          </footer>
        </section>
      </>}
    </div>

}
