import { requireExaminationPlan } from "../diagnosticPreview";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { ClinicalConfiguration, RhnApi } from "../../../shared/rhnApi";
import { errorMessage } from "../../../shared/rhnApi";
import { Alert, Button } from "../../../shared/ui";
import { Check, ChargeLines } from './operationalShared'

export function ExaminationChargeSimulator({ api, value }: { api: RhnApi; value: ClinicalConfiguration }) {
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
  const run = () => { void preview.refetch() }
  const toggle = (items: string[], v: string, setter: (next: string[]) => void) =>
    setter(items.includes(v) ? items.filter((item) => item !== v) : [...items, v])

  return <section className="rule-simulator" aria-label="检查收费规则试算" style={{ marginTop: 0 }}>
    <header>
      <div>
        <h4>⚡ 阶梯收费实时试算沙盒</h4>
        <p>按已保存配置试算所选部位与附加耗材；编辑中的规则需保存成功后生效。</p>
      </div>
      <Button size="sm" onClick={run} disabled={running || (examination.bodySiteRequired && selectedSites.length === 0)}>
        {running ? '计算中…' : '刷新试算'}
      </Button>
    </header>
    {error && <Alert>{error}</Alert>}
    <div className="rule-simulator__inputs" style={{ gridTemplateColumns: '1fr' }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'var(--space-1)' }}>
          <strong>模拟执行部位（已选 {selectedSites.length} 个）</strong>
          {availableSites.length > 1 && (
            <Button size="sm" variant="text" onClick={() => setSelectedSites(selectedSites.length === availableSites.length ? [] : availableSites.map((s) => s.code))}>
              {selectedSites.length === availableSites.length ? '清空' : '全选所有部位'}
            </Button>
          )}
        </div>
        <div className="rule-option-grid" style={{ maxHeight: '9rem', overflowY: 'auto' }}>
          {availableSites.map((site) => (
            <Check key={site.id} label={`${site.name} (${site.code})`}
              checked={selectedSites.includes(site.code)} onChange={() => toggle(selectedSites, site.code, setSelectedSites)} />
          ))}
          {!availableSites.length && <span>请先在左侧“允许部位与阶梯计费”中添加部位。</span>}
        </div>
      </div>
      {optionalRules.length > 0 && (
        <div>
          <strong>本次按需附加项（选收）</strong>
          <div className="rule-option-grid" style={{ maxHeight: '7rem', overflowY: 'auto' }}>
            {optionalRules.map((rule) => (
              <Check key={rule.id} label={`${rule.attachmentItemName} (${rule.attachmentItemCode})`}
                checked={selectedRules.includes(rule.id)} onChange={() => toggle(selectedRules, rule.id, setSelectedRules)} />
            ))}
          </div>
        </div>
      )}
    </div>
    {result && <div className="rule-simulator__result">
      <div className="rule-simulator__summary">
        <span>执行部位 <strong>{result.siteCount}</strong></span>
        <span>基础包含 <strong>{result.includedSiteCount}</strong></span>
        <span>超出加收 <strong>{result.extraSiteCount}</strong></span>
      </div>
      <ChargeLines lines={result.lines} />
    </div>}
  </section>
}
