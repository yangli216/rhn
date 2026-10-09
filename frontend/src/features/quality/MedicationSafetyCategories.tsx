import { useEffect, useMemo, useState } from 'react'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import type {
  MedicationSafetyCategoryView,
  SafetyCategoryMemberView,
  SafetyCategoryMemberItem,
  StandardCatalogCategorySummary
} from '../../shared/api/medicationWorkbenchApi'
import type { MedicationKnowledge } from '../../shared/api/masterDataApi'
import { Alert, Button, DataTable, Dialog, FormField, Icon, LoadingState, SearchField, Select, StatusBadge } from '../../shared/ui'

interface MedicationSafetyCategoriesProps {
  api: RhnApi
  onNotice?: (msg: string) => void
  onError?: (msg: string) => void
}

const ruleKindOptions = [
  { value: '', label: '全部规则类型' },
  { value: 'INTERACTION_CONTRAINDICATION', label: '药物相互作用 / 双硫仑禁忌' },
  { value: 'EXACT_GENERIC_DUPLICATE', label: '同类重复用药 / NSAID等' },
  { value: 'AGE_CONTRAINDICATION', label: '年龄与儿童青少年禁忌' },
  { value: 'SPECIAL_POPULATION_CONTRAINDICATION', label: '特殊人群 / 肝肾功能禁忌' },
  { value: 'DOSAGE_ROUTE_CHECK', label: '剂型与用法用量核查' }
]

const ruleKindNameMap: Record<string, string> = {
  INTERACTION_CONTRAINDICATION: '药物相互作用 / 配伍禁忌',
  EXACT_GENERIC_DUPLICATE: '同类重复用药',
  AGE_CONTRAINDICATION: '年龄禁忌',
  SPECIAL_POPULATION_CONTRAINDICATION: '特殊人群禁忌',
  DOSAGE_ROUTE_CHECK: '给药途径/用法核对'
}

export function MedicationSafetyCategories({ api, onNotice, onError }: MedicationSafetyCategoriesProps) {
  const [categories, setCategories] = useState<MedicationSafetyCategoryView[]>([])
  const [loading, setLoading] = useState(false)
  const [categorySearch, setCategorySearch] = useState('')
  const [filterRuleKind, setFilterRuleKind] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)

  // 国家基药标准目录列表
  const [standardCatalogs, setStandardCatalogs] = useState<StandardCatalogCategorySummary[]>([])

  // 成员列表
  const [members, setMembers] = useState<SafetyCategoryMemberView[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')

  // 弹窗状态：新建/编辑分类
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [editingCategory, setEditingCategory] = useState<MedicationSafetyCategoryView | null>(null)
  const [categoryForm, setCategoryForm] = useState({
    code: '',
    name: '',
    ruleKind: 'INTERACTION_CONTRAINDICATION',
    rationale: '',
    status: 'ACTIVE',
    catalogMajor: '',
    catalogSub: '',
    systemicOnly: false
  })
  const [savingCategory, setSavingCategory] = useState(false)

  // 纳入药品弹窗
  const [showAddMedModal, setShowAddMedModal] = useState(false)
  const [addMedMode, setAddMedMode] = useState<'catalog' | 'manual'>('catalog')

  // 模式1：标准目录批量导入状态
  const [catalogSubToImport, setCatalogSubToImport] = useState('')
  const [catalogSystemicOnly, setCatalogSystemicOnly] = useState(false)
  const [catalogCandidates, setCatalogCandidates] = useState<SafetyCategoryMemberItem[]>([])
  const [catalogSearching, setCatalogSearching] = useState(false)
  const [importingFromCatalog, setImportingFromCatalog] = useState(false)

  // 模式2：主数据药名检索状态
  const [medQuery, setMedQuery] = useState('')
  const [medSearching, setMedSearching] = useState(false)
  const [medCandidates, setMedCandidates] = useState<MedicationKnowledge[]>([])
  const [selectedMedItems, setSelectedMedItems] = useState<SafetyCategoryMemberItem[]>([])
  const [addingMeds, setAddingMeds] = useState(false)

  // 删除确认弹窗
  const [deletingCategory, setDeletingCategory] = useState<MedicationSafetyCategoryView | null>(null)
  const [memberToRemove, setMemberToRemove] = useState<SafetyCategoryMemberView | null>(null)

  // 初始加载标准目录汇总
  useEffect(() => {
    if (typeof api.medicationWorkbench?.listStandardCatalogCategories === 'function') {
      api.medicationWorkbench.listStandardCatalogCategories()
        .then(setStandardCatalogs)
        .catch(e => console.warn('Failed to load standard catalog summaries', e))
    }
  }, [])

  // 标准目录下拉选项
  const standardCatalogOptions = useMemo(() => {
    const list = [
      { value: '', label: '不绑定标准目录（纯手工纳管维护）' }
    ]
    for (const item of standardCatalogs) {
      list.push({
        value: item.sub,
        label: `${item.major ? `${item.major} / ` : ''}${item.sub} (${item.entryCount} 种通用名)`
      })
    }
    return list
  }, [standardCatalogs])

  // 加载分类列表
  const fetchCategories = async () => {
    setLoading(true)
    try {
      const list = await api.medicationWorkbench.listSafetyCategories(categorySearch, filterRuleKind)
      setCategories(list)
      if (list.length > 0 && !selectedCategoryId) {
        setSelectedCategoryId(list[0].id)
      } else if (list.length > 0 && !list.some(c => c.id === selectedCategoryId)) {
        setSelectedCategoryId(list[0].id)
      } else if (list.length === 0) {
        setSelectedCategoryId(null)
      }
    } catch (e) {
      onError?.(`获取安全分类失败: ${errorMessage(e)}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCategories()
  }, [categorySearch, filterRuleKind])

  // 当前选中的分类
  const selectedCategory = useMemo(() => {
    return categories.find(c => c.id === selectedCategoryId) || null
  }, [categories, selectedCategoryId])

  // 加载成员列表
  const fetchMembers = async (catId: string, q = '') => {
    setMembersLoading(true)
    try {
      const mems = await api.medicationWorkbench.listSafetyCategoryMembers(catId, q)
      setMembers(mems)
    } catch (e) {
      onError?.(`获取分类药品成员失败: ${errorMessage(e)}`)
    } finally {
      setMembersLoading(false)
    }
  }

  useEffect(() => {
    if (selectedCategoryId) {
      fetchMembers(selectedCategoryId, memberSearch)
    } else {
      setMembers([])
    }
  }, [selectedCategoryId, memberSearch])

  // 打开创建分类
  const handleOpenCreateCategory = () => {
    setEditingCategory(null)
    setCategoryForm({
      code: '',
      name: '',
      ruleKind: 'INTERACTION_CONTRAINDICATION',
      rationale: '',
      status: 'ACTIVE',
      catalogMajor: '',
      catalogSub: '',
      systemicOnly: false
    })
    setShowCategoryModal(true)
  }

  // 打开编辑分类
  const handleOpenEditCategory = (cat: MedicationSafetyCategoryView) => {
    setEditingCategory(cat)
    setCategoryForm({
      code: cat.code,
      name: cat.name,
      ruleKind: cat.ruleKind,
      rationale: cat.rationale,
      status: cat.status,
      catalogMajor: cat.catalogMajor || '',
      catalogSub: cat.catalogSub || '',
      systemicOnly: !!cat.systemicOnly
    })
    setShowCategoryModal(true)
  }

  // 保存分类
  const handleSaveCategory = async () => {
    if (!categoryForm.name.trim()) {
      onError?.('请填写分类名称')
      return
    }
    if (!editingCategory && !categoryForm.code.trim()) {
      onError?.('请填写分类代码')
      return
    }

    setSavingCategory(true)
    try {
      if (editingCategory) {
        await api.medicationWorkbench.updateSafetyCategory(editingCategory.id, {
          expectedRevision: editingCategory.revision,
          name: categoryForm.name.trim(),
          rationale: categoryForm.rationale.trim(),
          status: categoryForm.status,
          catalogMajor: categoryForm.catalogMajor || null,
          catalogSub: categoryForm.catalogSub || null,
          systemicOnly: categoryForm.systemicOnly
        })
        onNotice?.(`已成功更新安全分类 "${categoryForm.name}"`)
      } else {
        const created = await api.medicationWorkbench.createSafetyCategory({
          code: categoryForm.code.trim().toUpperCase(),
          name: categoryForm.name.trim(),
          ruleKind: categoryForm.ruleKind,
          rationale: categoryForm.rationale.trim(),
          catalogMajor: categoryForm.catalogMajor || null,
          catalogSub: categoryForm.catalogSub || null,
          systemicOnly: categoryForm.systemicOnly
        })
        onNotice?.(`已成功创建安全分类 "${created.name}"`)
        setSelectedCategoryId(created.id)
      }
      setShowCategoryModal(false)
      fetchCategories()
    } catch (e) {
      onError?.(`保存安全分类失败: ${errorMessage(e)}`)
    } finally {
      setSavingCategory(false)
    }
  }

  // 删除分类
  const handleDeleteCategory = async () => {
    if (!deletingCategory) return
    try {
      await api.medicationWorkbench.deleteSafetyCategory(deletingCategory.id)
      onNotice?.(`已成功删除安全分类 "${deletingCategory.name}"`)
      setDeletingCategory(null)
      fetchCategories()
    } catch (e) {
      onError?.(`删除安全分类失败: ${errorMessage(e)}`)
    }
  }

  // 查询标准目录候选药品
  const searchCatalogCandidates = async (sub: string, systemic: boolean) => {
    if (!sub || !selectedCategoryId) {
      setCatalogCandidates([])
      return
    }
    setCatalogSearching(true)
    try {
      const foundMajor = standardCatalogs.find(s => s.sub === sub)?.major || ''
      const results = await api.medicationWorkbench.searchStandardCatalogCandidates({
        major: foundMajor,
        sub,
        systemicOnly: systemic,
        excludeCategoryId: selectedCategoryId
      })
      setCatalogCandidates(results)
    } catch (e) {
      onError?.(`查询目录候选药品失败: ${errorMessage(e)}`)
    } finally {
      setCatalogSearching(false)
    }
  }

  // 打开添加药品弹窗
  const handleOpenAddMedModal = () => {
    setMedQuery('')
    setMedCandidates([])
    setSelectedMedItems([])

    const defaultSub = selectedCategory?.catalogSub || (standardCatalogs.length > 0 ? standardCatalogs[0].sub : '')
    const defaultSystemic = selectedCategory ? !!selectedCategory.systemicOnly : false

    setCatalogSubToImport(defaultSub)
    setCatalogSystemicOnly(defaultSystemic)
    setAddMedMode(selectedCategory?.catalogSub ? 'catalog' : 'manual')

    if (defaultSub) {
      searchCatalogCandidates(defaultSub, defaultSystemic)
    }

    setShowAddMedModal(true)
  }

  // 一键全量从标准目录导入
  const handleImportAllFromCatalog = async () => {
    if (!selectedCategoryId || !catalogSubToImport) return
    setImportingFromCatalog(true)
    try {
      const foundMajor = standardCatalogs.find(s => s.sub === catalogSubToImport)?.major || ''
      const result = await api.medicationWorkbench.importSafetyCategoryMembersFromCatalog(selectedCategoryId, {
        catalogMajor: foundMajor,
        catalogSub: catalogSubToImport,
        systemicOnly: catalogSystemicOnly
      })
      onNotice?.(`成功从标准目录批量导入 ${result.importedCount} 种药品（自动跳过 ${result.skippedCount} 种已纳管项）`)
      setShowAddMedModal(false)
      fetchMembers(selectedCategoryId, memberSearch)
      fetchCategories()
    } catch (e) {
      onError?.(`批量导入失败: ${errorMessage(e)}`)
    } finally {
      setImportingFromCatalog(false)
    }
  }

  // 搜索主数据药品
  const handleSearchMeds = async (queryStr: string) => {
    setMedSearching(true)
    try {
      const results = await api.masterData.medications(queryStr, '', 'ACTIVE')
      const existingMedIds = new Set(members.map(m => String(m.medicationId)))
      const candidates = (results || []).filter(m => !existingMedIds.has(String(m.id)))
      setMedCandidates(candidates)
    } catch (e) {
      onError?.(`搜索药品失败: ${errorMessage(e)}`)
    } finally {
      setMedSearching(false)
    }
  }

  // 切换药品勾选（主数据或目录勾选通用）
  const handleToggleSelectMed = (med: { id?: string | number; medicationId?: string | number; code?: string; medicationCode?: string; name?: string; medicationName?: string; preparationSpec?: string; sdDoseFormText?: string; sdDoseForm?: string; doseForm?: string }) => {
    const medId = String(med.id ?? med.medicationId)
    setSelectedMedItems(prev => {
      const exists = prev.some(item => String(item.medicationId) === medId)
      if (exists) {
        return prev.filter(item => String(item.medicationId) !== medId)
      } else {
        return [...prev, {
          medicationId: med.id ?? med.medicationId!,
          medicationCode: med.code ?? med.medicationCode ?? '',
          medicationName: med.name ?? med.medicationName ?? '',
          preparationSpec: med.preparationSpec || undefined,
          doseForm: med.sdDoseFormText || med.sdDoseForm || med.doseForm || undefined
        }]
      }
    })
  }

  // 全选/取消全选
  const handleToggleSelectAllCandidates = () => {
    const currentList = addMedMode === 'catalog' ? catalogCandidates : medCandidates
    if (selectedMedItems.length === currentList.length) {
      setSelectedMedItems([])
    } else {
      setSelectedMedItems(currentList.map(med => {
        if ('medicationId' in med) {
          return med
        }
        const m = med as MedicationKnowledge
        return {
          medicationId: m.id,
          medicationCode: m.code,
          medicationName: m.name,
          preparationSpec: m.preparationSpec || undefined,
          doseForm: m.sdDoseFormText || m.sdDoseForm || undefined
        }
      }))
    }
  }

  // 提交纳入选中的药品
  const handleConfirmAddMeds = async () => {
    if (!selectedCategoryId || selectedMedItems.length === 0) return
    setAddingMeds(true)
    try {
      const added = await api.medicationWorkbench.addSafetyCategoryMembers(selectedCategoryId, selectedMedItems)
      onNotice?.(`已成功将 ${added} 个药品纳入分类 "${selectedCategory?.name}"`)
      setShowAddMedModal(false)
      fetchMembers(selectedCategoryId, memberSearch)
      fetchCategories()
    } catch (e) {
      onError?.(`添加药品成员失败: ${errorMessage(e)}`)
    } finally {
      setAddingMeds(false)
    }
  }

  // 移除药品成员
  const handleConfirmRemoveMember = async () => {
    if (!selectedCategoryId || !memberToRemove) return
    try {
      await api.medicationWorkbench.removeSafetyCategoryMember(selectedCategoryId, memberToRemove.id)
      onNotice?.(`已将 "${memberToRemove.medicationName}" 从当前分类移出`)
      setMemberToRemove(null)
      fetchMembers(selectedCategoryId, memberSearch)
      fetchCategories()
    } catch (e) {
      onError?.(`移除药品失败: ${errorMessage(e)}`)
    }
  }

  const currentCatalogSummary = standardCatalogs.find(s => s.sub === catalogSubToImport)

  return (
    <div className="qmed-safety-cat-pane">
      {/* PC 宽屏左右分栏工作台 */}
      <div className="qmed-cat-split">
        {/* 左侧：分类列表与检索 */}
        <aside className="qmed-cat-sidebar">
          <div className="qmed-cat-sidebar-header">
            <div className="qmed-cat-sidebar-title-row">
              <span className="qmed-cat-sidebar-title">合理用药安全分类</span>
              <Button size="sm" variant="primary" onClick={handleOpenCreateCategory}>
                <Icon name="add" /> 新建分类
              </Button>
            </div>
            <div className="qmed-cat-filter-row">
              <SearchField
                label="分类搜索"
                placeholder="搜索分类代码 / 名称..."
                value={categorySearch}
                onChange={setCategorySearch}
              />
            </div>
            <div className="qmed-cat-filter-select">
              <Select
                value={filterRuleKind}
                onChange={val => setFilterRuleKind(val)}
                options={ruleKindOptions}
              />
            </div>
          </div>

          <div className="qmed-cat-list" role="list">
            {loading && categories.length === 0 && (
              <div className="qmed-cat-loading">
                <LoadingState label="加载分类中..." />
              </div>
            )}
            {!loading && categories.length === 0 && (
              <div className="qmed-cat-empty">
                未检索到匹配的安全分类
              </div>
            )}
            {categories.map(cat => {
              const isSelected = cat.id === selectedCategoryId
              return (
                <div
                  key={cat.id}
                  role="listitem"
                  className={`qmed-cat-item ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => setSelectedCategoryId(cat.id)}
                >
                  <div className="qmed-cat-item-top">
                    <span className="qmed-cat-item-name">{cat.name}</span>
                    <span className="qmed-cat-item-badge">
                      {cat.memberCount} 药
                    </span>
                  </div>
                  <div className="qmed-cat-item-code">{cat.code}</div>
                  <div className="qmed-cat-item-tags">
                    <span className="qmed-cat-tag">
                      {ruleKindNameMap[cat.ruleKind] || cat.ruleKind}
                    </span>
                    {cat.catalogSub && (
                      <span className="qmed-cat-tag" title={`关联标准基药目录：${cat.catalogSub}`}>
                        目录绑定
                      </span>
                    )}
                    {cat.isSystem && (
                      <span className="qmed-cat-tag is-system">
                        系统预置
                      </span>
                    )}
                    {cat.status === 'INACTIVE' && (
                      <span className="qmed-cat-tag is-inactive">
                        已停用
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </aside>

        {/* 右侧：选中分类详情与药品成员管理 */}
        <main className="qmed-cat-main">
          {selectedCategory ? (
            <div className="qmed-cat-main-content">
              {/* 分类元数据头部卡片 */}
              <div className="qmed-cat-detail-card">
                <div className="qmed-cat-detail-header">
                  <div className="qmed-cat-detail-info">
                    <div className="qmed-cat-detail-title-line">
                      <h2>{selectedCategory.name}</h2>
                      <span className="qmed-cat-detail-code">{selectedCategory.code}</span>
                      <StatusBadge tone={selectedCategory.status === 'ACTIVE' ? 'success' : 'neutral'}>
                        {selectedCategory.status === 'ACTIVE' ? '启用中' : '已停用'}
                      </StatusBadge>
                      {selectedCategory.isSystem && (
                        <span className="qmed-cat-sys-badge">系统基线内置保护</span>
                      )}
                    </div>

                    {selectedCategory.catalogSub && (
                      <div className="qmed-cat-catalog-badge">
                        <Icon name="database" />
                        <span>标准目录关联：<strong>{selectedCategory.catalogMajor ? `${selectedCategory.catalogMajor} / ` : ''}{selectedCategory.catalogSub}</strong></span>
                        {selectedCategory.systemicOnly && (
                          <span className="qmed-cat-systemic-pill">仅全身剂型</span>
                        )}
                      </div>
                    )}

                    <div className="qmed-cat-detail-meta">
                      <span>规则类别: <strong>{ruleKindNameMap[selectedCategory.ruleKind] || selectedCategory.ruleKind}</strong></span>
                      <span>纳管药品数: <strong>{selectedCategory.memberCount} 种</strong></span>
                      <span>版本修订: <strong>rev.{selectedCategory.revision}</strong></span>
                    </div>
                  </div>

                  <div className="qmed-cat-detail-actions">
                    <Button variant="primary" onClick={handleOpenAddMedModal}>
                      <Icon name="add" /> 纳入药品
                    </Button>
                    <Button variant="secondary" onClick={() => handleOpenEditCategory(selectedCategory)}>
                      <Icon name="file-text" /> 编辑分类
                    </Button>
                    {!selectedCategory.isSystem && (
                      <Button variant="danger" onClick={() => setDeletingCategory(selectedCategory)}>
                        <Icon name="close" /> 删除
                      </Button>
                    )}
                  </div>
                </div>

                {/* 临床机制与警示说明 */}
                <div className="qmed-cat-rationale-box">
                  <div className="qmed-cat-rationale-title">
                    <Icon name="info" /> 临床依据与审查拦截机理
                  </div>
                  <div className="qmed-cat-rationale-body">
                    {selectedCategory.rationale || '暂未填写药理机制说明。'}
                  </div>
                  {selectedCategory.catalogSub && (
                    <div className="qmed-inheritance-alert">
                      <Icon name="check" />
                      <span>
                        <strong>标准目录级联继承已启用：</strong>
                        全院药品目录中属于【{selectedCategory.catalogSub}】且{selectedCategory.systemicOnly ? '为全身给药剂型（自动排除眼/耳/鼻/外用软膏）' : '为有效剂型'}的在库药品均自动纳入规则计算，无需逐一手工录入！
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* 纳管药品成员表格卡片 */}
              <div className="qmed-cat-members-card">
                <div className="qmed-cat-members-toolbar">
                  <div className="qmed-cat-members-heading">
                    <h3>已纳管药品清单</h3>
                    <span className="qmed-cat-members-count">共 {members.length} 种</span>
                  </div>
                  <div className="qmed-cat-members-search">
                    <SearchField
                      label="过滤纳管药品"
                      placeholder="在纳管药品中快速过滤..."
                      value={memberSearch}
                      onChange={setMemberSearch}
                    />
                  </div>
                </div>

                <div className="qmed-cat-members-table-wrap">
                  {membersLoading ? (
                    <div className="qmed-members-loading">
                      <LoadingState label="加载纳管药品中..." />
                    </div>
                  ) : members.length === 0 ? (
                    <div className="qmed-members-empty">
                      <Icon name="info" />
                      <p>当前分类暂无纳管药品，请点击上方“+ 纳入药品”从基药目录或主数据平台中关联。</p>
                    </div>
                  ) : (
                    <DataTable className="qmed-data-table" aria-label="已纳管药品清单">
                      <thead>
                        <tr>
                          <th style={{ width: 140 }}>药品代码</th>
                          <th>药品通用名称</th>
                          <th style={{ width: 180 }}>制剂规格</th>
                          <th style={{ width: 120 }}>剂型</th>
                          <th style={{ width: 160 }}>纳入时间</th>
                          <th style={{ width: 100, textAlign: 'center' }}>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {members.map(mbr => (
                          <tr key={mbr.id}>
                            <td className="qmed-font-mono">{mbr.medicationCode}</td>
                            <td className="qmed-name-cell">
                              <strong>{mbr.medicationName}</strong>
                              {mbr.inherited && (
                                <span className="qmed-inherited-badge" title="由基药标准目录自动继承生效">
                                  目录继承
                                </span>
                              )}
                            </td>
                            <td className="qmed-text-muted">{mbr.preparationSpec || '-'}</td>
                            <td>
                              <span className="qmed-dose-pill">{mbr.doseForm || '-'}</span>
                            </td>
                            <td className="qmed-text-muted qmed-font-mono qmed-text-time">
                              {mbr.inherited ? '动态继承生效' : (mbr.createdAt ? mbr.createdAt.substring(0, 19).replace('T', ' ') : '-')}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {mbr.inherited ? (
                                <span className="qmed-text-muted" title="由基药标准目录自动继承生效">
                                  继承生效
                                </span>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="danger"
                                  onClick={() => setMemberToRemove(mbr)}
                                >
                                  移出
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </DataTable>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="qmed-cat-no-selection">
              <Icon name="database" />
              <h3>请在左侧选择或创建合理用药安全分类</h3>
              <p>分类关联的药品成员将动态驱动双硫仑、NSAID重复用药、儿童特殊禁忌等临床安全校验。</p>
            </div>
          )}
        </main>
      </div>

      {/* 弹窗 1：创建/编辑安全分类 */}
      {showCategoryModal && (
        <Dialog
          title={editingCategory ? `编辑分类 · ${editingCategory.name}` : '新建合理用药安全分类'}
          onClose={() => setShowCategoryModal(false)}
          className="qmed-cat-dialog"
        >
          <div className="qmed-dialog-form">
            {!editingCategory && (
              <FormField label="分类代码 (唯一英文标识)" required>
                <input
                  type="text"
                  className="ui-input"
                  placeholder="如 DISULFIRAM_INDUCER, PEDIATRIC_OTOTOXIC..."
                  value={categoryForm.code}
                  onChange={e => setCategoryForm({ ...categoryForm, code: e.target.value.toUpperCase() })}
                />
              </FormField>
            )}
            <FormField label="分类名称" required>
              <input
                type="text"
                className="ui-input"
                placeholder="如 双硫仑样反应致敏抗菌药物"
                value={categoryForm.name}
                onChange={e => setCategoryForm({ ...categoryForm, name: e.target.value })}
              />
            </FormField>
            <FormField label="关联规则类别" required>
              <Select
                value={categoryForm.ruleKind}
                onChange={val => setCategoryForm({ ...categoryForm, ruleKind: val })}
                options={ruleKindOptions.filter(o => o.value !== '')}
              />
            </FormField>
            <FormField label="绑定国家基药标准目录（推荐，支持级联继承与一键导入）">
              <Select
                value={categoryForm.catalogSub}
                onChange={val => {
                  const found = standardCatalogs.find(s => s.sub === val)
                  setCategoryForm({
                    ...categoryForm,
                    catalogSub: val,
                    catalogMajor: found?.major || ''
                  })
                }}
                options={standardCatalogOptions}
              />
            </FormField>
            {categoryForm.catalogSub && (
              <div style={{ padding: '0 var(--space-1)' }}>
                <label className="qmed-checkbox-label">
                  <input
                    type="checkbox"
                    checked={categoryForm.systemicOnly}
                    onChange={e => setCategoryForm({ ...categoryForm, systemicOnly: e.target.checked })}
                  />
                  <span>仅纳管全身剂型（自动排除眼耳鼻局部制剂、外用软膏、凝胶贴膏等非全身剂型）</span>
                </label>
              </div>
            )}
            <FormField label="状态">
              <Select
                value={categoryForm.status}
                onChange={val => setCategoryForm({ ...categoryForm, status: val })}
                options={[
                  { value: 'ACTIVE', label: '启用 (ACTIVE)' },
                  { value: 'INACTIVE', label: '停用 (INACTIVE)' }
                ]}
              />
            </FormField>
            <FormField label="临床药理机制与警示依据说明">
              <textarea
                className="ui-input qmed-textarea"
                rows={4}
                placeholder="说明该分类纳管药物的临床风险机理、与其它药物或特殊人群的反应原理，供审核与临床医生查阅..."
                value={categoryForm.rationale}
                onChange={e => setCategoryForm({ ...categoryForm, rationale: e.target.value })}
              />
            </FormField>
          </div>
          <div className="qmed-dialog-footer">
            <Button variant="secondary" onClick={() => setShowCategoryModal(false)}>
              取消
            </Button>
            <Button variant="primary" busy={savingCategory} onClick={handleSaveCategory}>
              保存分类
            </Button>
          </div>
        </Dialog>
      )}

      {/* 弹窗 2：纳入药品弹窗 */}
      {showAddMedModal && (
        <Dialog
          title={`纳入药品成员 · ${selectedCategory?.name}`}
          onClose={() => setShowAddMedModal(false)}
          className="qmed-add-med-dialog"
          size="xwide"
        >
          <div className="qmed-add-med-content">
            {/* 顶部分段 Tab：标准目录批量导入 vs 主数据按名检索 */}
            <div className="qmed-add-med-tabs">
              <Button
                variant={addMedMode === 'catalog' ? 'primary' : 'secondary'}
                onClick={() => {
                  setAddMedMode('catalog')
                  setSelectedMedItems([])
                  if (catalogSubToImport) {
                    searchCatalogCandidates(catalogSubToImport, catalogSystemicOnly)
                  }
                }}
              >
                <Icon name="database" /> 按国家基药标准目录批量导入
              </Button>
              <Button
                variant={addMedMode === 'manual' ? 'primary' : 'secondary'}
                onClick={() => {
                  setAddMedMode('manual')
                  setSelectedMedItems([])
                }}
              >
                <Icon name="search" /> 按药品名称/代码检索录入
              </Button>
            </div>

            {addMedMode === 'catalog' ? (
              /* 模式1：标准目录批量导入 (PC 宽屏 Split-Pane 双栏协同) */
              <div className="qmed-catalog-split-pane">
                {/* 左栏：基药分类配置与全量导入控制台 */}
                <div className="qmed-catalog-sidebar">
                  <div className="qmed-catalog-config-card">
                    <FormField label="选择国家基药标准分类">
                      <Select
                        value={catalogSubToImport}
                        onChange={val => {
                          setCatalogSubToImport(val)
                          searchCatalogCandidates(val, catalogSystemicOnly)
                        }}
                        options={standardCatalogs.map(s => ({
                          value: s.sub,
                          label: `${s.major ? `${s.major} / ` : ''}${s.sub} (${s.entryCount} 种通用名)`
                        }))}
                      />
                    </FormField>

                    <label className="qmed-checkbox-label">
                      <input
                        type="checkbox"
                        checked={catalogSystemicOnly}
                        onChange={e => {
                          const val = e.target.checked
                          setCatalogSystemicOnly(val)
                          searchCatalogCandidates(catalogSubToImport, val)
                        }}
                      />
                      <span>仅全身剂型（自动排除眼耳鼻局部制剂、外用软膏等）</span>
                    </label>

                    {currentCatalogSummary && currentCatalogSummary.entryNames && currentCatalogSummary.entryNames.length > 0 && (
                      <div className="qmed-catalog-names-preview">
                        <span className="qmed-catalog-names-label">
                          基药收录标准通用名 ({currentCatalogSummary.entryNames.length} 种)：
                        </span>
                        <div className="qmed-catalog-names-chips">
                          {currentCatalogSummary.entryNames.slice(0, 16).map(name => (
                            <span key={name} className="qmed-catalog-name-chip">{name}</span>
                          ))}
                          {currentCatalogSummary.entryNames.length > 16 && (
                            <span className="qmed-catalog-name-chip is-more">
                              ...等 {currentCatalogSummary.entryNames.length} 种
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 彻底解决行内错位的独立全量导入卡片 */}
                  <div className="qmed-batch-import-hero">
                    <div className="qmed-batch-import-hero-title">
                      <span>一键全量纳管</span>
                      <span className="qmed-batch-import-hero-count">
                        {catalogCandidates.length} 药待入库
                      </span>
                    </div>
                    <p className="qmed-batch-import-hero-desc">
                      将当前标准分类下全院在库且尚未纳管的所有匹配药品一次性全量纳入本安全分类。无需逐一勾选。
                    </p>
                    <div className="qmed-batch-import-btn-wrap">
                      <Button
                        variant="primary"
                        busy={importingFromCatalog}
                        disabled={!catalogSubToImport || catalogCandidates.length === 0}
                        onClick={handleImportAllFromCatalog}
                      >
                        <Icon name="database" /> 一键全量导入 ({catalogCandidates.length} 药)
                      </Button>
                    </div>
                  </div>
                </div>

                {/* 右栏：未纳管候选药品清单与按需多选 */}
                <div className="qmed-catalog-main-results">
                  <div className="qmed-add-med-results-header">
                    <div className="qmed-add-med-header-left">
                      <span>在库未纳管候选药 ({catalogCandidates.length})</span>
                      {selectedMedItems.length > 0 && (
                        <span className="qmed-selected-pill">
                          已勾选 {selectedMedItems.length} 药
                        </span>
                      )}
                    </div>
                    {catalogCandidates.length > 0 && (
                      <Button size="sm" variant="secondary" onClick={handleToggleSelectAllCandidates}>
                        {selectedMedItems.length === catalogCandidates.length ? '取消全选' : '全选候选药'}
                      </Button>
                    )}
                  </div>

                  {catalogSearching ? (
                    <div className="qmed-add-med-loading">
                      <LoadingState label="匹配候选药品中..." />
                    </div>
                  ) : catalogCandidates.length === 0 ? (
                    <div className="qmed-add-med-empty">
                      当前标准目录下未发现可导入的未纳管药品（可能已全部纳入）
                    </div>
                  ) : (
                    <div className="qmed-add-med-list">
                      {catalogCandidates.map(med => {
                        const isChecked = selectedMedItems.some(i => String(i.medicationId) === String(med.medicationId))
                        return (
                          <div
                            key={med.medicationId}
                            className={`qmed-add-med-row ${isChecked ? 'is-checked' : ''}`}
                            onClick={() => handleToggleSelectMed(med)}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}}
                            />
                            <div className="qmed-add-med-row-main">
                              <div className="qmed-add-med-name-row">
                                <span className="qmed-add-med-name">{med.medicationName}</span>
                                {med.doseForm && <span className="qmed-dose-pill">{med.doseForm}</span>}
                              </div>
                              <div className="qmed-add-med-meta-row">
                                <span className="qmed-add-med-code">{med.medicationCode}</span>
                                <span className="qmed-add-med-spec">{med.preparationSpec || '规格未录入'}</span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* 模式2：主数据药名检索 */
              <div className="qmed-manual-search-pane">
                <div className="qmed-add-med-search-bar">
                  <SearchField
                    label="检索主数据药品"
                    placeholder="输入药品通用名、拼音缩写或代码检索主数据药品..."
                    value={medQuery}
                    onChange={val => {
                      setMedQuery(val)
                      if (val.trim().length >= 1) {
                        handleSearchMeds(val.trim())
                      }
                    }}
                    onSearch={handleSearchMeds}
                  />
                  <Button
                    variant="secondary"
                    busy={medSearching}
                    onClick={() => handleSearchMeds(medQuery.trim())}
                  >
                    搜索药品
                  </Button>
                </div>

                <div className="qmed-add-med-results">
                  <div className="qmed-add-med-results-header">
                    <div className="qmed-add-med-header-left">
                      <span>候选药品清单 ({medCandidates.length})</span>
                      {selectedMedItems.length > 0 && (
                        <span className="qmed-selected-pill">
                          已勾选 {selectedMedItems.length} 药
                        </span>
                      )}
                    </div>
                    {medCandidates.length > 0 && (
                      <Button size="sm" variant="secondary" onClick={handleToggleSelectAllCandidates}>
                        {selectedMedItems.length === medCandidates.length ? '取消全选' : '全选候选药'}
                      </Button>
                    )}
                  </div>

                  {medSearching ? (
                    <div className="qmed-add-med-loading">
                      <LoadingState label="检索中..." />
                    </div>
                  ) : medCandidates.length === 0 ? (
                    <div className="qmed-add-med-empty">
                      {medQuery ? '未找到符合条件的未纳管药品' : '请输入药品名称或代码开始搜索'}
                    </div>
                  ) : (
                    <div className="qmed-add-med-list">
                      {medCandidates.map(med => {
                        const isChecked = selectedMedItems.some(i => String(i.medicationId) === String(med.id))
                        return (
                          <div
                            key={med.id}
                            className={`qmed-add-med-row ${isChecked ? 'is-checked' : ''}`}
                            onClick={() => handleToggleSelectMed(med)}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}}
                            />
                            <div className="qmed-add-med-row-main">
                              <div className="qmed-add-med-name-row">
                                <span className="qmed-add-med-name">{med.name}</span>
                                {(med.sdDoseFormText || med.sdDoseForm) && (
                                  <span className="qmed-dose-pill">{med.sdDoseFormText || med.sdDoseForm}</span>
                                )}
                              </div>
                              <div className="qmed-add-med-meta-row">
                                <span className="qmed-add-med-code">{med.code}</span>
                                <span className="qmed-add-med-spec">{med.preparationSpec || '规格未录入'}</span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="qmed-add-med-selected-summary">
              <span>已选 <strong>{selectedMedItems.length}</strong> 种药品准备纳入该分类</span>
            </div>
          </div>

          <div className="qmed-dialog-footer">
            <Button variant="secondary" onClick={() => setShowAddMedModal(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              disabled={selectedMedItems.length === 0}
              busy={addingMeds}
              onClick={handleConfirmAddMeds}
            >
              确认纳入 ({selectedMedItems.length})
            </Button>
          </div>
        </Dialog>
      )}

      {/* 弹窗 3：确认删除分类 */}
      {deletingCategory && (
        <Dialog
          title="删除分类确认"
          onClose={() => setDeletingCategory(null)}
        >
          <div style={{ padding: '16px 0' }}>
            <Alert tone="error">
              确定要删除分类 <strong>{deletingCategory.name}</strong> ({deletingCategory.code}) 吗？
              删除后该分类及与其关联的药品安全映射将一并移除，此操作不可逆。
            </Alert>
          </div>
          <div className="qmed-dialog-footer">
            <Button variant="secondary" onClick={() => setDeletingCategory(null)}>
              取消
            </Button>
            <Button variant="danger" onClick={handleDeleteCategory}>
              确认删除
            </Button>
          </div>
        </Dialog>
      )}

      {/* 弹窗 4：确认移出药品 */}
      {memberToRemove && (
        <Dialog
          title="移出药品成员确认"
          onClose={() => setMemberToRemove(null)}
        >
          <div style={{ padding: '16px 0' }}>
            <p>
              确定要将 <strong>{memberToRemove.medicationName}</strong> ({memberToRemove.medicationCode}) 移出当前安全分类吗？
            </p>
            <p className="qmed-text-muted qmed-remove-note">
              移出后该药品将不再参与该分类对应的合理用药拦截与规则校验。
            </p>
          </div>
          <div className="qmed-dialog-footer">
            <Button variant="secondary" onClick={() => setMemberToRemove(null)}>
              取消
            </Button>
            <Button variant="danger" onClick={handleConfirmRemoveMember}>
              确认移出
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}
