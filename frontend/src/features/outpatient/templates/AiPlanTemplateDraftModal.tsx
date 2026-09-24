import { useState } from 'react'
import type { RhnApi } from '../../../shared/api'
import type { OutpatientPlanTemplate, OutpatientPlanTemplateScope, SaveOutpatientPlanTemplateInput } from '../../../shared/api/outpatientPlanTemplatesApi'
import { Alert, Button, Dialog, FormField, LoadingState, Select, StatusBadge } from '../../../shared/ui'
import { errorMessage } from '../../../shared/api/httpClient'

interface AiPlanTemplateDraftModalProps {
  api: RhnApi
  initialScope?: OutpatientPlanTemplateScope
  editingTemplate?: OutpatientPlanTemplate | null
  onClose: () => void
  onSaved: (template: OutpatientPlanTemplate) => void
}

export function AiPlanTemplateDraftModal({
  api,
  initialScope = 'PERSONAL',
  editingTemplate,
  onClose,
  onSaved,
}: AiPlanTemplateDraftModalProps) {
  const isEditing = !!editingTemplate
  const [tab, setTab] = useState<'NATURAL' | 'GUIDELINE'>('NATURAL')
  const [naturalInput, setNaturalInput] = useState('')
  const [guidelineName, setGuidelineName] = useState('中国高血压防治指南')
  const [versionYear, setVersionYear] = useState('2026')
  const [guidelineText, setGuidelineText] = useState('')
  const [scope, setScope] = useState<OutpatientPlanTemplateScope>(editingTemplate?.scopeType || initialScope)

  const [compiledDraft, setCompiledDraft] = useState<SaveOutpatientPlanTemplateInput | null>(() => {
    if (!editingTemplate) return null
    return {
      scopeType: editingTemplate.scopeType,
      name: editingTemplate.name,
      description: editingTemplate.description,
      sourceType: editingTemplate.sourceType,
      guidelineReference: editingTemplate.guidelineReference,
      sortOrder: editingTemplate.sortOrder,
      diagnoses: [...editingTemplate.diagnoses],
      medications: editingTemplate.medications.map((m) => ({
        medicationId: m.medicationId,
        catalogItemId: m.catalogItemId,
        packageId: m.packageId,
        medicationName: m.medicationName,
        preparationSpec: m.preparationSpec,
        doseValue: m.doseValue,
        doseUnit: m.doseUnit,
        routeCode: m.routeCode,
        frequencyCode: m.frequencyCode,
        durationValue: m.durationValue,
        durationUnit: m.durationUnit,
        quantity: m.quantity,
        quantityUnit: m.quantityUnit,
        substitutionAllowed: m.substitutionAllowed,
        selfProvided: m.selfProvided,
        medicationInstruction: m.medicationInstruction,
        priceType: m.priceType,
        pricingRequired: m.pricingRequired,
        reason: m.reason,
      })),
      services: editingTemplate.services.map((s) => ({
        catalogItemId: s.catalogItemId,
        itemCode: s.itemCode,
        itemName: s.itemName,
        serviceType: s.serviceType,
        quantity: s.quantity,
        unitCode: s.unitCode,
        priceType: s.priceType,
        pricingRequired: s.pricingRequired,
        reason: s.reason,
        clinicalDescription: s.clinicalDescription,
      })),
    }
  })
  const [compiling, setCompiling] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCompile = async () => {
    setError(null)
    setCompiling(true)
    try {
      if (tab === 'NATURAL') {
        if (!naturalInput.trim()) {
          setError('请输入用于编译方案的临床意图、口述文本或用药速记。')
          setCompiling(false)
          return
        }
        const result = await api.outpatientPlanTemplates.compileDraft(naturalInput.trim(), scope)
        setCompiledDraft(result)
      } else {
        if (!guidelineText.trim()) {
          setError('请输入临床指南或专家共识的诊疗推荐条文。')
          setCompiling(false)
          return
        }
        const result = await api.outpatientPlanTemplates.compileGuideline(
          guidelineText.trim(),
          guidelineName.trim(),
          versionYear.trim(),
          'HOSPITAL'
        )
        setCompiledDraft(result)
        setScope('HOSPITAL')
      }
    } catch (e: any) {
      setError(errorMessage(e) || 'AI 编译方案失败，请重试')
    } finally {
      setCompiling(false)
    }
  }

  const handleSave = async () => {
    if (!compiledDraft) return
    setError(null)
    setSaving(true)
    try {
      if (isEditing && editingTemplate) {
        const updated = await api.outpatientPlanTemplates.update(editingTemplate.id, {
          expectedRevision: editingTemplate.revision,
          scopeType: scope,
          name: compiledDraft.name,
          description: compiledDraft.description,
          guidelineReference: compiledDraft.guidelineReference,
          sortOrder: compiledDraft.sortOrder,
          diagnoses: compiledDraft.diagnoses,
          medications: compiledDraft.medications,
          services: compiledDraft.services,
        })
        onSaved(updated)
      } else {
        const saved = await api.outpatientPlanTemplates.create({
          ...compiledDraft,
          scopeType: scope,
        })
        onSaved(saved)
      }
    } catch (e: any) {
      setError(errorMessage(e) || (isEditing ? '调整方案失败，请重试' : '保存方案失败，请检查名称或目录完整性'))
    } finally {
      setSaving(false)
    }
  }

  const fillExample = (example: string) => {
    setNaturalInput(example)
  }

  const removeDiagnosis = (idx: number) => {
    if (!compiledDraft) return
    const next = compiledDraft.diagnoses.filter((_, i) => i !== idx)
    setCompiledDraft({ ...compiledDraft, diagnoses: next })
  }

  const addDiagnosis = (code: string, display: string) => {
    if (!compiledDraft) return
    if (compiledDraft.diagnoses.some((d) => d.code === code)) return
    const isPrimary = compiledDraft.diagnoses.length === 0
    setCompiledDraft({
      ...compiledDraft,
      diagnoses: [...compiledDraft.diagnoses, { code, display, type: isPrimary ? 'PRIMARY' : 'SECONDARY' }],
    })
  }

  const removeMedication = (idx: number) => {
    if (!compiledDraft) return
    const next = compiledDraft.medications.filter((_, i) => i !== idx)
    setCompiledDraft({ ...compiledDraft, medications: next })
  }

  const removeService = (idx: number) => {
    if (!compiledDraft) return
    const next = compiledDraft.services.filter((_, i) => i !== idx)
    setCompiledDraft({ ...compiledDraft, services: next })
  }

  const quickDiagnoses = [
    { code: 'J06.9', display: '急性上呼吸道感染' },
    { code: 'J00', display: '感冒/鼻咽炎' },
    { code: 'J20.9', display: '急性支气管炎' },
    { code: 'I10', display: '原发性高血压' },
    { code: 'E11.9', display: '2型糖尿病' },
  ]

  const scopeOptions = [
    { value: 'PERSONAL', label: '医生个人高频方案 (仅本人可见)' },
    { value: 'DEPARTMENT', label: '专科/科室临床路径方案 (本科室可见)' },
    { value: 'HOSPITAL', label: '全院临床指南标准方案 (全院通用)' },
  ]

  return (
    <Dialog
      title={isEditing ? `✨ 调整 / 编辑诊疗方案 “${editingTemplate?.name}”` : '✨ AI 智能临床诊疗方案编译器'}
      eyebrow={isEditing ? '方案调整与明细微调' : '多层级诊疗方案池 · 智能构建'}
      size="wide"
      onClose={() => !saving && onClose()}
      footer={
        <>
          <Button variant="secondary" disabled={saving || compiling} onClick={onClose}>
            取消
          </Button>
          <Button
            busy={saving}
            disabled={!compiledDraft || saving || compiling || !compiledDraft.name.trim() || compiledDraft.diagnoses.length === 0}
            onClick={handleSave}
          >
            {isEditing ? '确认保存调整' : '确认存入方案池'}
          </Button>
        </>
      }
    >
      <div className="ai-plan-modal-body">
        {error && <Alert>{error}</Alert>}

        {/* 宽屏桌面端双栏布局：左侧意图输入与编译，右侧结构化解析看板 */}
        <div className="ai-plan-modal-grid">
          {/* 左栏：模式选择与输入 */}
          <div className="ai-plan-modal-left">
            <div className="ai-plan-modal-tabs">
              <Button
                size="sm"
                variant={tab === 'NATURAL' ? 'primary' : 'secondary'}
                onClick={() => { setTab('NATURAL'); setCompiledDraft(null) }}
              >
                口述 / 意图速记建方
              </Button>
              <Button
                size="sm"
                variant={tab === 'GUIDELINE' ? 'primary' : 'secondary'}
                onClick={() => { setTab('GUIDELINE'); setScope('HOSPITAL'); setCompiledDraft(null) }}
              >
                国家 / 临床指南抽取
              </Button>
            </div>

            {tab === 'NATURAL' ? (
              <>
                <FormField label="方案使用范围">
                  <Select
                    value={scope}
                    onChange={(next) => setScope(next as OutpatientPlanTemplateScope)}
                    options={scopeOptions}
                  />
                </FormField>

                <FormField label="输入医生口述意图或开方速记" required>
                  <textarea
                    rows={6}
                    className="ui-field__control"
                    value={naturalInput}
                    onChange={(e) => setNaturalInput(e.target.value)}
                    placeholder="如：基层成人上呼吸感染常用方案，或原发性高血压常规复诊方..."
                  />
                </FormField>

                <div className="ai-plan-modal-examples">
                  <span className="ai-plan-modal-examples-label">快速示例：</span>
                  <Button size="sm" variant="text" onClick={() => fillExample('基层成人上呼吸感染常用方案')}>
                    基层成人上感
                  </Button>
                  <Button size="sm" variant="text" onClick={() => fillExample('高血压初诊规范方案，开硝苯地平控释片30mg qd，查生化全套、心电图')}>
                    高血压初诊
                  </Button>
                  <Button size="sm" variant="text" onClick={() => fillExample('急性支气管炎对症治疗，开盐酸氨溴索口服液、阿莫西林胶囊，查血常规+CRP')}>
                    支气管炎对症
                  </Button>
                  <Button size="sm" variant="text" onClick={() => fillExample('2型糖尿病口服药控制，开二甲双胍片0.5g tid，查糖化血红蛋白')}>
                    糖尿病维持
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="ai-plan-modal-guideline-header">
                  <FormField label="指南 / 共识名称" required>
                    <input
                      value={guidelineName}
                      onChange={(e) => setGuidelineName(e.target.value)}
                      placeholder="如：中国高血压防治指南"
                    />
                  </FormField>
                  <FormField label="年份">
                    <input
                      value={versionYear}
                      onChange={(e) => setVersionYear(e.target.value)}
                      placeholder="2026"
                    />
                  </FormField>
                </div>

                <FormField label="临床指南规范推荐条文" required>
                  <textarea
                    rows={7}
                    className="ui-field__control"
                    value={guidelineText}
                    onChange={(e) => setGuidelineText(e.target.value)}
                    placeholder="粘贴临床指南、路径推荐或诊治共识正文段落..."
                  />
                </FormField>
                <div className="ai-plan-modal-hint">
                  将自动提取目标病种、一线推荐药物与必查辅助检验，并与院内主数据目录进行精确匹配。
                </div>
              </>
            )}

            <Button
              className="ai-plan-modal-compile-btn"
              busy={compiling}
              disabled={compiling}
              onClick={handleCompile}
            >
              {isEditing ? '⚡ 依据口述意图重新覆盖生成' : '⚡ 开始 AI 意图编译与目录对齐'}
            </Button>
          </div>

          {/* 右栏：编译解析结果与微调看板 */}
          <div className="ai-plan-modal-right">
            <div className="ai-plan-modal-right-head">
              <strong>{isEditing ? '方案明细微调看板' : '编译生成预览看板'}</strong>
              {compiledDraft && (
                <StatusBadge tone="success">
                  {isEditing ? '就绪可保存' : compiledDraft.sourceType === 'AI_GUIDELINE' ? '指南对齐成功' : '意图编译就绪'}
                </StatusBadge>
              )}
            </div>

            {compiling ? (
              <LoadingState label="AI 编译器正在解析临床意图并匹配在库药品及收费服务..." />
            ) : !compiledDraft ? (
              <div className="ai-plan-modal-empty">
                <div className="ai-plan-modal-empty-icon">📋</div>
                <div>在左侧输入或口述意图后，点击下方“开始 AI 意图编译”</div>
                <small className="ai-plan-modal-hint">系统将秒级生成结构化方案并自动锁定在库品规</small>
              </div>
            ) : (
              <div className="ai-plan-modal-content">
                <FormField label="方案名称" required>
                  <input
                    value={compiledDraft.name}
                    onChange={(e) => setCompiledDraft({ ...compiledDraft, name: e.target.value })}
                  />
                </FormField>

                <FormField label="方案说明">
                  <input
                    value={compiledDraft.description ?? ''}
                    onChange={(e) => setCompiledDraft({ ...compiledDraft, description: e.target.value })}
                  />
                </FormField>

                {/* 诊断列表 */}
                <div className="ai-plan-modal-section">
                  <div className="ai-plan-modal-section-title">
                    初步诊断 ({compiledDraft.diagnoses.length})
                  </div>
                  {compiledDraft.diagnoses.length === 0 ? (
                    <div className="ai-plan-modal-row-empty">请至少指定一个诊断</div>
                  ) : (
                    compiledDraft.diagnoses.map((d, idx) => (
                      <div key={idx} className="ai-plan-modal-row">
                        <span><strong>{d.display}</strong> ({d.code})</span>
                        <div className="ai-plan-modal-actions">
                          <StatusBadge tone="neutral">{d.type === 'PRIMARY' ? '主诊断' : '次诊断'}</StatusBadge>
                          <Button size="sm" variant="danger" onClick={() => removeDiagnosis(idx)}>
                            移除
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                  <div className="ai-plan-modal-quick-diags">
                    <small className="ai-plan-modal-subtext">快捷追加/切换诊断：</small>
                    {quickDiagnoses.map((qd) => (
                      <Button
                        key={qd.code}
                        size="sm"
                        variant="secondary"
                        onClick={() => addDiagnosis(qd.code, qd.display)}
                      >
                        + {qd.display}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* 处方药品列表 */}
                <div className="ai-plan-modal-section">
                  <div className="ai-plan-modal-section-title">
                    推荐处方用药 ({compiledDraft.medications.length})
                  </div>
                  {compiledDraft.medications.length === 0 ? (
                    <div className="ai-plan-modal-row-empty">暂未匹配到药品或该方案无需用药</div>
                  ) : (
                    compiledDraft.medications.map((m, idx) => (
                      <div key={idx} className="ai-plan-modal-row ai-plan-modal-row-bordered">
                        <div>
                          <div><strong>💊 {m.medicationName || `在库药品 #${m.medicationId}`}</strong> {m.preparationSpec && <small className="ai-plan-modal-subtext">({m.preparationSpec})</small>}</div>
                          <small className="ai-plan-modal-row-sub">用法: {m.routeCode} · {m.frequencyCode} · 每次 {m.doseValue}{m.doseUnit} · {m.durationValue}{m.durationUnit}</small>
                        </div>
                        <div className="ai-plan-modal-actions">
                          <StatusBadge tone="success">在库已对齐</StatusBadge>
                          <Button size="sm" variant="danger" onClick={() => removeMedication(idx)}>
                            移除
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* 检验检查服务 */}
                <div className="ai-plan-modal-section">
                  <div className="ai-plan-modal-section-title">
                    检验与检查项目 ({compiledDraft.services.length})
                  </div>
                  {compiledDraft.services.length === 0 ? (
                    <div className="ai-plan-modal-row-empty">暂无检验检查项目</div>
                  ) : (
                    compiledDraft.services.map((s, idx) => (
                      <div key={idx} className="ai-plan-modal-row">
                        <div>
                          <strong>🔬 {s.itemName || `服务项目 #${s.catalogItemId}`}</strong>
                          {s.itemCode && <small className="ai-plan-modal-item-code">({s.itemCode})</small>}
                        </div>
                        <div className="ai-plan-modal-actions">
                          <StatusBadge tone="neutral">
                            {s.serviceType === 'LABORATORY' ? '检验' : s.serviceType === 'EXAMINATION' ? '检查' : '诊疗'}
                          </StatusBadge>
                          <span className="ai-plan-modal-row-sub">{s.quantity} {s.unitCode}</span>
                          <Button size="sm" variant="danger" onClick={() => removeService(idx)}>
                            移除
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  )
}
