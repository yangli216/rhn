import type { CSSProperties } from 'react'
import { previewQuantity, requireTubePlan } from "../diagnosticPreview";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { ClinicalConfiguration, RhnApi, ServiceCatalogItem } from "../../../shared/rhnApi";
import { errorMessage } from "../../../shared/rhnApi";
import { Alert, Button } from "../../../shared/ui";
import { tubeDotColor, tubeSharingModeLabel, ChargeLines } from './operationalShared'

export const SPECIMEN_TYPE_ZH: Record<string, string> = {
  SERUM: '血清',
  WHOLE_BLOOD: '全血',
  PLASMA: '血浆',
  URINE: '尿液',
  CSF: '脑脊液',
  STOOL: '粪便',
  FECES: '粪便',
  PLEURAL_FLUID: '胸腹水',
  SECRETION: '分泌物',
  SWAB: '咽拭子',
  BONE_MARROW: '骨髓',
}

export function formatSpecimenLabel(raw?: string): string {
  if (!raw) return ''
  const upper = raw.trim().toUpperCase()
  return SPECIMEN_TYPE_ZH[upper] || raw
}

export const TUBE_GROUP_ZH: Record<string, string> = {
  SERUM: '血清',
  BIOCHEM_SERUM: '生化血清',
  EDTA_HEMATOLOGY: '全血临检',
  CITRATE_COAGULATION: '凝血血浆',
  GLUCOSE_LACTATE: '血糖生化',
  IMMUNO_SERUM: '免疫血清',
  URINE_ROUTINE: '尿液常规',
}

export function formatTubeGroupLabel(groupCode: string, specimenName?: string): string {
  if (groupCode.startsWith('ITEM:')) return '独立专管'
  const upper = groupCode.trim().toUpperCase()
  if (TUBE_GROUP_ZH[upper]) return TUBE_GROUP_ZH[upper]
  if (SPECIMEN_TYPE_ZH[upper]) return SPECIMEN_TYPE_ZH[upper]
  if (specimenName) return specimenName
  return groupCode
}

export function LaboratoryTubeSimulator({ api, currentServiceId, services, configuration }: { api: RhnApi; currentServiceId: string; services: ServiceCatalogItem[]; configuration: ClinicalConfiguration }) {
  const laboratoryServices = useMemo(
    () => services.filter((service) => service.sdServiceType === 'LABORATORY' && service.sdStatus === 'ACTIVE'),
    [services],
  )
  const [searchKeyword, setSearchKeyword] = useState('')
  const [selected, setSelected] = useState<string[]>([currentServiceId])
  const [quantities, setQuantities] = useState<Record<string, string>>({ [currentServiceId]: '1' })
  const canRun = selected.length > 0
  const preview = useQuery({
    queryKey: ['master-data-laboratory-preview', configuration, selected, quantities],
    queryFn: async () => requireTubePlan(await api.masterData.laboratoryTubePlan(selected.map((serviceId) => ({
      serviceId, quantity: previewQuantity(quantities[serviceId]),
    })))),
    enabled: canRun, retry: false,
  })
  const running = preview.isFetching
  const result = canRun && !running && preview.isSuccess ? preview.data : undefined
  const error = canRun && preview.isError ? errorMessage(preview.error) : ''
  const run = () => { void preview.refetch() }

  useEffect(() => { setSelected([currentServiceId]); setQuantities({ [currentServiceId]: '1' }) }, [currentServiceId])

  const addService = (serviceId: string) => {
    if (!selected.includes(serviceId)) {
      setSelected((items) => [...items, serviceId])
      setQuantities((prev) => ({ ...prev, [serviceId]: prev[serviceId] || '1' }))
    }
  }

  const removeService = (serviceId: string) => {
    setSelected((items) => items.filter((id) => id !== serviceId))
  }

  const matchedServices = useMemo(() => {
    const kw = searchKeyword.trim().toLowerCase()
    if (!kw) return []
    return laboratoryServices.filter((s) =>
      s.name.toLowerCase().includes(kw) ||
      s.code.toLowerCase().includes(kw) ||
      (s.specimenType && s.specimenType.toLowerCase().includes(kw))
    )
  }, [laboratoryServices, searchKeyword])


  return <section className="rule-simulator" aria-label="检验分管规则试算" style={{ marginTop: 0 }}>
    <header>
      <div>
        <h4>⚡ 同次采血分管沙盒</h4>
        <p>模拟同次申请中多项开立，实时核验合管结果与试管耗材加收。</p>
      </div>
      <Button size="sm" onClick={run} disabled={running || selected.length === 0}>
        {running ? '计算中…' : '刷新沙盒'}
      </Button>
    </header>
    {error && <Alert>{error}</Alert>}

    {/* 搜索与添加工具栏 */}
    <div className="tube-simulator-toolbar">
      <div className="tube-simulator-search-wrap">
        <div className="tube-search-input-container">
          <input
            type="text"
            className="tube-simulator-search"
            placeholder="🔍 检索检验项目名称/编码/拼音码添加..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            aria-label="搜索检验项目"
          />
          {searchKeyword && (
            <Button
              type="button"
              onClick={() => setSearchKeyword('')}
              style={{ position: 'absolute', right: '0.5rem', cursor: 'pointer', padding: '0.25rem' }}
              title="清空搜索"
              aria-label="清空搜索" variant="text" size="sm"
            >
              ✕
            </Button>
          )}

          {/* 实时联想匹配下拉建议 */}
          {searchKeyword.trim() && (
            <div className="tube-search-dropdown" role="listbox" aria-label="搜索结果建议">
              {matchedServices.length === 0 ? (
                <div className="tube-search-dropdown__empty">未找到匹配的检验项目</div>
              ) : (
                matchedServices.slice(0, 10).map((service) => {
                  const isAdded = selected.includes(service.id)
                  return (
                    <Button
                      key={service.id}
                      type="button"
                      className={`tube-search-dropdown__item${isAdded ? ' is-added' : ''}`}
                      onClick={() => addService(service.id)}
                      aria-label={service.name} variant="text" size="sm"
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}>
                        <strong className="tube-search-dropdown__name">{service.name}</strong>
                        <span className="tube-search-dropdown__code">
                          {service.code} {service.specimenType ? `· ${formatSpecimenLabel(service.specimenType)}` : ''}
                        </span>
                      </div>
                      <div>
                        {isAdded ? (
                          <span className="tube-search-dropdown__badge">已在列表中</span>
                        ) : (
                          <span className="tube-search-dropdown__add-btn">+ 加入本轮</span>
                        )}
                      </div>
                    </Button>
                  )
                })
              )}
            </div>
          )}
        </div>

        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setSelected([currentServiceId])
            setQuantities({ [currentServiceId]: '1' })
            setSearchKeyword('')
          }}
          title="重置为仅当前开立项"
        >
          重置当前项
        </Button>
      </div>

      {/* 快捷组合套用 */}
      <div className="tube-quick-scenarios">
        <small>快捷组合：</small>
        <Button
          size="sm"
          variant="text"
          onClick={() => {
            const biochemServices = laboratoryServices.filter((s) =>
              s.name.includes('生化') || s.name.includes('肝') || s.name.includes('肾') || s.name.includes('脂') || s.name.includes('糖')
            )
            const targetIds = biochemServices.length > 0 ? biochemServices.slice(0, 3).map((s) => s.id) : laboratoryServices.slice(0, 2).map((s) => s.id)
            const newSelected = Array.from(new Set([...selected, ...targetIds]))
            setSelected(newSelected)
            setQuantities((prev) => {
              const next = { ...prev }
              newSelected.forEach((id) => { if (!next[id]) next[id] = '1' })
              return next
            })
          }}
          title="一键添加多项生化检验，模拟同组共管合并为1管"
        >
          + 生化合管组
        </Button>
        <Button
          size="sm"
          variant="text"
          onClick={() => {
            const mixed = laboratoryServices.filter((s) =>
              s.name.includes('血常规') || s.name.includes('生化') || s.name.includes('凝血') || s.name.includes('CRP')
            )
            const targetIds = mixed.length > 0 ? mixed.slice(0, 3).map((s) => s.id) : laboratoryServices.slice(0, 3).map((s) => s.id)
            const newSelected = Array.from(new Set([...selected, ...targetIds]))
            setSelected(newSelected)
            setQuantities((prev) => {
              const next = { ...prev }
              newSelected.forEach((id) => { if (!next[id]) next[id] = '1' })
              return next
            })
          }}
          title="一键加入血常规+生化+凝血，验证专管与合管协同"
        >
          + 入院常规三项
        </Button>
      </div>
    </div>

    {/* 本轮输入检验项目专属列表（已移除全量静态列表，不显示项目编码，标本显示中文） */}
    <div className="tube-batch-section" aria-label="已选项目胶囊池">
      <div className="tube-batch-header">
        <span  className="clinical-content-21">
          已选 ({selected.length})：
          <span style={{ marginLeft: '4px' }} className="clinical-content-22">
            本轮输入检验项目
          </span>
        </span>
        {selected.length > 0 && (
          <Button
            size="sm"
            variant="text"
            onClick={() => setSelected([])}
            style={{ padding: '0 0.25rem' }}
          >
            清空所有
          </Button>
        )}
      </div>

      <div className="tube-batch-list">
        {selected.length === 0 ? (
          <div className="tube-batch-empty">
            <span>🔍 暂未输入检验项目</span>
            <small>请在上方检索框搜索并选择需要的项目，或点击快捷组合快速加入</small>
          </div>
        ) : (
          selected.map((serviceId) => {
            const s = services.find((item) => item.id === serviceId)
            const isCurrent = serviceId === currentServiceId
            return (
              <div key={serviceId} className="tube-batch-card">
                <div className="tube-batch-card__info">
                  {isCurrent && <span className="tube-batch-card__badge">当前项</span>}
                  <strong className="tube-batch-card__name">{s ? s.name : serviceId}</strong>
                  {s?.specimenType && (
                    <span className="tube-batch-card__specimen">{formatSpecimenLabel(s.specimenType)}</span>
                  )}
                </div>

                <div className="tube-batch-card__actions">
                  <div className="tube-batch-card__qty">
                    <input
                      type="number"
                      min="1"
                      aria-label={`${s ? s.name : serviceId}数量`}
                      value={quantities[serviceId] ?? '1'}
                      onChange={(event) =>
                        setQuantities({ ...quantities, [serviceId]: event.target.value })
                      }
                    />
                    <small>次</small>
                  </div>
                  <Button
                    type="button"
                    className="tube-batch-card__remove"
                    onClick={() => removeService(serviceId)}
                    title={`移除 ${s ? s.name : serviceId}`}
                    aria-label={`移除 ${s ? s.name : serviceId}`} variant="text" size="sm"
                  >
                    ✕ 移除
                  </Button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>

    {result && <div className="tube-plan-result">
      <div style={{ padding: 'var(--space-3) var(--space-4)' }} className="clinical-content-23">
        预计采血管数：<strong>{result.groups.reduce((acc, g) => acc + g.tubeCount, 0)} 管</strong>
      </div>
      {result.groups.map((group) => {
        const dotColor = tubeDotColor(group.containerName || '', group.groupCode || '')
        return (
          <article key={group.groupCode}>
            <div>
              <strong style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                <span className="tube-dot clinical-content-24" style={{ '--specimen-cap-color': dotColor } as CSSProperties} />
                {group.specimenName || '标本'} · {group.containerName || '标准采血管'}
              </strong>
              <code>{group.groupCode.startsWith('ITEM:') ? '独立专管' : `合管组: ${formatTubeGroupLabel(group.groupCode, group.specimenName)}`}</code>
            </div>
            <b>{group.tubeCount} 管</b>
            <small>{group.serviceIds.length} 项 · {tubeSharingModeLabel(group.sharingMode)}</small>
          </article>
        )
      })}
      <ChargeLines lines={result.chargeLines} />
    </div>}
  </section>
}
