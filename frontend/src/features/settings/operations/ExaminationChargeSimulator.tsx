import { requireExaminationPlan } from "../diagnosticPreview";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { CatalogPrice, ClinicalConfiguration, RhnApi } from "../../../shared/rhnApi";
import { errorMessage } from "../../../shared/rhnApi";
import { Alert, Button } from "../../../shared/ui";
import { Check, ChargeLines, priceTierRange, today } from './operationalShared'

/** 当前有效的销售价：本机构价优先，其次全院统一价；不考虑项目包价格。 */
function salePrice(prices: CatalogPrice[], organizationId?: string) {
  const sale = prices.filter((price) => price.sdPriceType === 'SALE' && price.sdStatus === 'ACTIVE' && !price.packageId)
  return (sale.find((price) => organizationId && price.organizationId === organizationId)
    ?? sale.find((price) => !price.organizationId))?.price
}

export function ExaminationChargeSimulator({ api, value, organizationId }: { api: RhnApi; value: ClinicalConfiguration; organizationId?: string }) {
  const examination = value.examination!
  const availableSites = examination.variants.filter((item) => item.status === 'ACTIVE')
  const optionalRules = examination.attachments.filter((item) => item.status === 'ACTIVE' && item.triggerType === 'OPTIONAL')
  const [selectedSites, setSelectedSites] = useState<string[]>(availableSites.slice(0, 1).map((s) => s.code))
  const [selectedRules, setSelectedRules] = useState<string[]>([])
  const canRun = selectedSites.length > 0 || !examination.bodySiteRequired
  const preview = useQuery({
    queryKey: ['master-data-examination-preview', value, selectedSites, selectedRules],
    queryFn: async () => requireExaminationPlan(await api.masterData.examinationChargePlan(value.serviceId, selectedSites, selectedRules), value.serviceId),
    enabled: canRun, retry: false,
  })
  const running = preview.isFetching
  const result = canRun && !running && preview.isSuccess ? preview.data : undefined
  const error = canRun && preview.isError ? errorMessage(preview.error) : ''
  const priceItemIds = [...new Set((result?.lines ?? []).filter((line) => line.fixedAmount == null).map((line) => line.catalogItemId))]
  const prices = useQueries({
    queries: priceItemIds.map((id) => ({
      queryKey: ['master-data-examination-preview-price', id, organizationId, today()],
      queryFn: async () => salePrice((await api.masterData.catalogLifecycle(id, organizationId ?? '', today())).currentPrices ?? [], organizationId),
      retry: false, staleTime: 60 * 1000,
    })),
  })
  const pricesReady = prices.every((query) => !query.isPending)
  const unitPrices = Object.fromEntries(priceItemIds.map((id, index) => [id, prices[index]?.data]))
  const tier = result && examination.sitePricingMode === 'TIERED_ITEM'
    ? examination.priceTiers.find((item) => result.chargeableSiteCount >= item.siteFrom
      && (item.siteTo == null || result.chargeableSiteCount <= item.siteTo)) : undefined
  const unitsOf = (units: number) => units === 1 ? '' : units === 0 ? ' · 不计入' : ` · 计 ${units} 个`
  const toggle = (items: string[], v: string, setter: (next: string[]) => void) =>
    setter(items.includes(v) ? items.filter((item) => item !== v) : [...items, v])

  return <section className="rule-simulator rule-simulator--wide" aria-label="检查收费规则试算">
    <header>
      <div>
        <h4>收费试算</h4>
        <p>按已保存的配置和本院价格计算；正在编辑的内容保存后才生效。</p>
      </div>
      <Button size="sm" variant="secondary" onClick={() => { void preview.refetch() }} disabled={running || !canRun}>
        {running ? '计算中…' : '重新计算'}
      </Button>
    </header>
    {error && <Alert>{error}</Alert>}
    <div className="rule-simulator__body">
    <div className="rule-simulator__inputs">
      <div>
        <div className="rule-simulator__label">
          <strong>选择部位（已选 {selectedSites.length} 个）</strong>
          {availableSites.length > 1 && (
            <Button size="sm" variant="text" onClick={() => setSelectedSites(selectedSites.length === availableSites.length ? [] : availableSites.map((s) => s.code))}>
              {selectedSites.length === availableSites.length ? '清空' : '全选'}
            </Button>
          )}
        </div>
        <div className="rule-option-grid rule-option-grid--sites">
          {availableSites.map((site) => (
            <Check key={site.id} label={`${site.name}${unitsOf(site.chargeableSiteUnits)}`}
              checked={selectedSites.includes(site.code)} onChange={() => toggle(selectedSites, site.code, setSelectedSites)} />
          ))}
          {!availableSites.length && <span>请先在“部位与计价”中新增部位。</span>}
        </div>
      </div>
      {optionalRules.length > 0 && (
        <div>
          <strong>按需附加收费</strong>
          <div className="rule-option-grid">
            {optionalRules.map((rule) => (
              <Check key={rule.id} label={rule.attachmentItemName}
                checked={selectedRules.includes(rule.id)} onChange={() => toggle(selectedRules, rule.id, setSelectedRules)} />
            ))}
          </div>
        </div>
      )}
    </div>
    {result && <div className="rule-simulator__result">
      <div className="rule-simulator__summary">
        <span>已选部位 <strong>{result.siteCount}</strong></span>
        <span>计费部位数 <strong>{result.chargeableSiteCount}</strong></span>
        {examination.sitePricingMode === 'TIERED_ITEM'
          ? <span>命中档位 <strong>{tier ? priceTierRange(tier) : '无'}</strong></span>
          : ['BASE_PLUS_FIXED', 'BASE_PLUS_ITEM'].includes(examination.sitePricingMode)
            && <span>超出部位 <strong>{result.extraSiteCount}</strong></span>}
      </div>
      {pricesReady ? <ChargeLines lines={result.lines} unitPrices={unitPrices} />
        : <p className="rule-simulator__empty">正在读取本院价格…</p>}
    </div>}
    </div>
  </section>
}
