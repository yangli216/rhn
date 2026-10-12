import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { MedicationKnowledge } from '../../shared/api/masterDataApi'
import type { MedicationSafetyCategoryView, SafetyCategoryMemberItem } from '../../shared/api/medicationWorkbenchApi'
import { errorMessage, type RhnApi, type StandardMedicationDetail } from '../../shared/rhnApi'
import { Alert, Button, Dialog, FormField, Icon, LoadingState, Select } from '../../shared/ui'

function isSystemicMedication(med: MedicationKnowledge): boolean {
  const df = med.sdDoseFormText || med.sdDoseForm || ''
  const spec = med.preparationSpec || ''
  const topicalKeywords = ['膏', '贴', '凝胶', '栓', '滴眼', '滴鼻', '滴耳', '喷雾', '洗剂', '搽剂', '外用']
  return !topicalKeywords.some(k => df.includes(k) || spec.includes(k))
}

export function StandardMedicationBindSafetyCategoryDialog({
  api,
  entry,
  onClose,
  onSuccess
}: {
  api: RhnApi
  entry: StandardMedicationDetail
  onClose: () => void
  onSuccess?: (categoryName: string, drugCount: number) => void
}) {
  const client = useQueryClient()
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [systemicOnly, setSystemicOnly] = useState(true)

  // 1. 获取所有合理用药安全分类
  const categoriesQuery = useQuery({
    queryKey: ['medication-safety-categories', 'all'],
    queryFn: () => api.medicationWorkbench.listSafetyCategories(),
    enabled: typeof api.medicationWorkbench?.listSafetyCategories === 'function'
  })

  // 2. 检索全院主数据中匹配当前标准药品名称的所有在库规格
  const medicationsQuery = useQuery({
    queryKey: ['master-data-medications-by-standard', entry.name],
    queryFn: () => api.masterData.medications(entry.name, '', 'ACTIVE'),
    enabled: Boolean(entry.name) && typeof api.masterData?.medications === 'function'
  })

  const availableCategories: MedicationSafetyCategoryView[] = useMemo(() => {
    return (categoriesQuery.data || []).filter(c => c.status === 'ACTIVE')
  }, [categoriesQuery.data])

  useEffect(() => {
    if (!selectedCategoryId && availableCategories.length > 0) {
      setSelectedCategoryId(String(availableCategories[0].id))
    }
  }, [availableCategories, selectedCategoryId])

  const categoryOptions = useMemo(() => {
    return availableCategories.map(c => ({
      value: String(c.id),
      label: `${c.name} (${c.code}) · 已纳管 ${c.memberCount} 药`
    }))
  }, [availableCategories])

  const matchedDrugs = useMemo(() => {
    const list = medicationsQuery.data || []
    if (!systemicOnly) return list
    return list.filter(isSystemicMedication)
  }, [medicationsQuery.data, systemicOnly])

  const selectedCategory = useMemo(() => {
    return availableCategories.find(c => String(c.id) === selectedCategoryId)
  }, [availableCategories, selectedCategoryId])

  const bindMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCategoryId) throw new Error('请先选择目标合理用药安全分类')
      if (matchedDrugs.length === 0) throw new Error('当前未找到可绑定的在库规格药品')

      const items: SafetyCategoryMemberItem[] = matchedDrugs.map(d => ({
        medicationId: d.id,
        medicationCode: d.code,
        medicationName: d.name,
        preparationSpec: d.preparationSpec,
        doseForm: d.sdDoseFormText || d.sdDoseForm
      }))

      const count = await api.medicationWorkbench.addSafetyCategoryMembers(selectedCategoryId, items)
      return { count, categoryName: selectedCategory?.name || '' }
    },
    onSuccess: async (data) => {
      await client.invalidateQueries({ queryKey: ['medication-safety-tags', entry.name] })
      await client.invalidateQueries({ queryKey: ['medication-safety-categories'] })
      onSuccess?.(data.categoryName, data.count)
      onClose()
    }
  })

  return (
    <Dialog
      title="绑定标准药品至合理用药分类"
      eyebrow={`标准品种：${entry.name} · ${entry.innName || '化学药品/生物制品'}`}
      size="wide"
      onClose={bindMutation.isPending ? () => {} : onClose}
    >
      <div className="standard-bind-safety-dialog">
        <p className="standard-bind-safety-intro">
          将标准药品 <strong>【{entry.name}】</strong> 与合理用药安全分类绑定，
          全院属于该标准品种的全部在库规格将一键批量纳入质控规则，免去逐个规格手动勾选。
        </p>

        {bindMutation.error && (
          <Alert tone="error">{errorMessage(bindMutation.error)}</Alert>
        )}

        <div className="standard-bind-form-section">
          <FormField label="选择目标合理用药安全分类" required>
            <Select
              value={selectedCategoryId}
              onChange={setSelectedCategoryId}
              options={categoryOptions}
              placeholder="请选择要绑定的合理用药分类（例如：过敏警示、双硫仑样反应等）"
            />
          </FormField>

          <div className="standard-bind-systemic-toggle">
            <label className="standard-bind-checkbox-label">
              <input
                type="checkbox"
                checked={systemicOnly}
                onChange={e => setSystemicOnly(e.target.checked)}
              />
              <span>仅纳管全身给药剂型（自动排除眼/耳/鼻局部制剂、外用贴膏软膏等）</span>
            </label>
          </div>
        </div>

        <div className="standard-bind-preview-section">
          <div className="standard-bind-preview-header">
            <h4>全院在库匹配规格清单（共 {matchedDrugs.length} 种）</h4>
            <span className="standard-bind-preview-hint">
              {medicationsQuery.isPending ? '正在检索全院药品主档...' : '匹配到的所有主档规格将一键同步纳管'}
            </span>
          </div>

          {medicationsQuery.isPending ? (
            <LoadingState label="检索在库规格药品中..." />
          ) : matchedDrugs.length === 0 ? (
            <div className="standard-bind-empty-box">
              <Icon name="info" />
              <span>当前全院药品主档中暂未检索到【{entry.name}】相关的激活在库规格。</span>
            </div>
          ) : (
            <div className="standard-bind-drugs-list">
              {matchedDrugs.map(drug => (
                <div key={drug.id} className="standard-bind-drug-item">
                  <div className="drug-main-info">
                    <span className="drug-name">{drug.name}</span>
                    <span className="drug-code">{drug.code}</span>
                  </div>
                  <div className="drug-sub-info">
                    <span className="drug-spec">{drug.preparationSpec || '未标规格'}</span>
                    <span className="drug-form">{drug.sdDoseFormText || drug.sdDoseForm || '普通剂型'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="standard-bind-dialog-footer">
        <Button variant="secondary" disabled={bindMutation.isPending} onClick={onClose}>
          取消
        </Button>
        <Button
          variant="primary"
          disabled={!selectedCategoryId || matchedDrugs.length === 0 || bindMutation.isPending}
          busy={bindMutation.isPending}
          onClick={() => bindMutation.mutate()}
        >
          确认一键绑定全规格并纳入
        </Button>
      </div>
    </Dialog>
  )
}
