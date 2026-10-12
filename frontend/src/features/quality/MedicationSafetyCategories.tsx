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
import { Button, DataTable, Dialog, FormField, Icon, LoadingState, SearchField, Select, StatusBadge } from '../../shared/ui'

interface MedicationSafetyCategoriesProps {
  api: RhnApi
  onNotice?: (msg: string) => void
  onError?: (msg: string) => void
}

const ruleKindOptions = [
  { value: '', label: '全部规则类型' },
  { value: 'INTERACTION_CONTRAINDICATION', label: '药物相互作用 / 配伍禁忌' },
  { value: 'DUPLICATE_THERAPY', label: '同类重复用药' },
  { value: 'DRUG_INTERACTION', label: '药物相互作用' },
  { value: 'AGE_CONTRAINDICATION', label: '年龄与儿童青少年禁忌' },
  { value: 'SPECIAL_POPULATION_CONTRAINDICATION', label: '特殊人群 / 肝肾禁忌' },
  { value: 'DOSAGE_ROUTE_CHECK', label: '给药途径与用法用量' }
]

const ruleKindNameMap: Record<string, string> = {
  DUPLICATE_THERAPY: '同类重复用药',
  DRUG_INTERACTION: '药物相互作用',
  AGE_CONTRAINDICATION: '年龄禁忌',
  SPECIAL_POPULATION_CONTRAINDICATION: '特殊人群禁忌',
  DOSAGE_ROUTE_CHECK: '给药途径/用量',
  EXACT_GENERIC_DUPLICATE: '同类重复用药',
  INTERACTION_CONTRAINDICATION: '药物相互作用 / 配伍禁忌'
}

const DOSE_FORM_TEXT_MAP: Record<string, string> = {
  TABLET: '片剂',
  CAPSULE: '胶囊剂',
  INJECTION: '注射剂',
  GRANULE: '颗粒剂',
  PILL: '丸剂',
  TINCTURE: '酊剂',
  SYRUP: '糖浆剂',
  OINTMENT: '软膏剂',
  CREAM: '乳膏剂',
  GEL: '凝胶剂',
  LOTION: '洗剂',
  SUPPOSITORY: '栓剂',
  SPRAY: '喷雾剂',
  AEROSOL: '气雾剂',
  POWDER: '散剂',
  EYE_DROPS: '滴眼剂',
  EYE_OINTMENT: '眼膏剂',
  NASAL_DROPS: '滴鼻剂',
  EAR_DROPS: '滴耳剂',
  ORAL_SOLUTION: '口服溶液剂',
  ORAL_LIQUID: '口服液体剂',
  SUSPENSION: '混悬剂',
  EMULSION: '乳剂',
  PLASTER: '贴膏剂',
  PATCH: '贴剂',
  DECOCTION: '汤剂',
  EXTRACT: '流浸膏剂',
  LINIMENT: '搽剂',
  DROPS: '滴剂',
  MIXTURE: '合剂',
}

export function formatDoseForm(doseForm?: string | null): string {
  if (!doseForm) return ''
  const trimmed = doseForm.trim()
  return DOSE_FORM_TEXT_MAP[trimmed.toUpperCase()] || trimmed
}

// 国家基药目录自然中文数字解析（将“一、”、“（三）”、“二十一、”等解析为自然阿拉伯数字）
export function parseChineseNumeral(text: string): number {
  if (!text) return 9999
  const match = text.match(/[（(]?([一二三四五六七八九十]+)[）) 、]/) || text.match(/^[（(]?([一二三四五六七八九十]+)[）)]?/)
  if (!match) return 9999
  const s = match[1]
  if (s === '十') return 10
  const digits: Record<string, number> = {
    '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9
  }
  if (s.startsWith('十')) {
    return 10 + (digits[s.charAt(1)] || 0)
  }
  if (s.includes('十')) {
    const parts = s.split('十')
    const tens = digits[parts[0]] || 1
    const ones = digits[parts[1]] || 0
    return tens * 10 + ones
  }
  return digits[s] || 9999
}

export function getMajorOrder(major: string): number {
  if (!major) return 99999
  const num = parseChineseNumeral(major)
  const isTcm = major.includes('内科用药') || major.includes('外科用药') || major.includes('妇科用药')
    || major.includes('骨伤科用药') || (num <= 7 && (major.includes('眼科用药') || major.includes('耳鼻喉科用药') || major.includes('儿科用药')) && !major.includes('二十'))
  return isTcm ? 2000 + num : 1000 + num
}

export interface BoundRuleSummary {
  code: string
  name: string
  decision: 'BLOCK' | 'REQUIRE_OVERRIDE' | 'WARN'
}

export const CATEGORY_BOUND_RULES_MAP: Record<string, BoundRuleSummary[]> = {
  PPI_DUPLICATE_THERAPY: [
    { code: 'QMED.PPI_DUPLICATE', name: '质子泵抑制剂（PPI）同方或重复用药核对', decision: 'REQUIRE_OVERRIDE' }
  ],
  RASI_DUPLICATE_THERAPY: [
    { code: 'QMED.RASI_DUPLICATE', name: 'ACEI与ARB类降压药重复用药核对', decision: 'BLOCK' }
  ],
  SEDATIVE_HYPNOTIC_DUPLICATE: [
    { code: 'QMED.SEDATIVE_HYPNOTIC_DUPLICATE', name: '镇静催眠类及抗焦虑药物重复用药核对', decision: 'REQUIRE_OVERRIDE' }
  ],
  TETRACYCLINE_PEDIATRIC_CONTRA: [
    { code: 'QMED.TETRACYCLINE_PEDIATRIC', name: '儿童青少年禁用四环素类抗生素核对', decision: 'BLOCK' }
  ],
  AMINOGLYCOSIDE_PEDIATRIC_CONTRA: [
    { code: 'QMED.AMINOGLYCOSIDE_PEDIATRIC', name: '儿童及特定年龄禁用氨基糖苷类抗生素核对', decision: 'BLOCK' }
  ],
  MACROLIDE_STATIN_INTERACTION: [
    { code: 'QMED.MACROLIDE_STATIN_INTERACTION', name: '大环内酯类抗菌药与他汀类相互作用核对', decision: 'BLOCK' }
  ],
  STATIN_LIPID_LOWERING: [
    { code: 'QMED.MACROLIDE_STATIN_INTERACTION', name: '大环内酯类抗菌药与他汀类相互作用核对', decision: 'BLOCK' }
  ],
  PREGNANCY_CONTRA_CATEGORY_X: [
    { code: 'QMED.PREGNANCY_CONTRA', name: '育龄期及妊娠期妇女禁用高危致畸药物核对', decision: 'BLOCK' }
  ],
  SYSTEMIC_NSAID: [
    { code: 'QMED.NSAID_DUPLICATE', name: '非甾体抗炎药（NSAIDs）同方或联合用药重复核对', decision: 'REQUIRE_OVERRIDE' }
  ],
  QUINOLONE_PEDIATRIC: [
    { code: 'QMED.AGE_CONTRAINDICATION', name: '儿童及特定年龄禁忌用药核对', decision: 'BLOCK' }
  ],
  DISULFIRAM_ANTIMICROBIAL: [
    { code: 'QMED.DISULFIRAM_INTERACTION', name: '双硫仑样反应配伍禁忌核对', decision: 'BLOCK' }
  ],
  ALCOHOL_EXCIPIENT: [
    { code: 'QMED.DISULFIRAM_INTERACTION', name: '双硫仑样反应配伍禁忌核对', decision: 'BLOCK' }
  ]
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
  const [selectedStandardDrugName, setSelectedStandardDrugName] = useState('')

  // 模式2：主数据药名检索状态
  const [medQuery, setMedQuery] = useState('')
  const [medSearching, setMedSearching] = useState(false)
  const [medCandidates, setMedCandidates] = useState<MedicationKnowledge[]>([])
  const [hasSearchedMeds, setHasSearchedMeds] = useState(false)
  const [lastSearchedQuery, setLastSearchedQuery] = useState('')
  const [selectedMedItems, setSelectedMedItems] = useState<SafetyCategoryMemberItem[]>([])
  const [addingMeds, setAddingMeds] = useState(false)

  // 独立目录绑定弹窗状态
  const [showBindCatalogModal, setShowBindCatalogModal] = useState(false)
  const [bindCatalogSub, setBindCatalogSub] = useState('')
  const [bindCatalogSystemicOnly, setBindCatalogSystemicOnly] = useState(false)
  const [savingBindCatalog, setSavingBindCatalog] = useState(false)

  // 纳入药品弹窗中同步建立级联绑定的勾选项
  const [syncBindCatalogOnImport, setSyncBindCatalogOnImport] = useState(true)

  // 一键清空状态
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false)
  const [clearingMembers, setClearingMembers] = useState(false)

  // 手工直属纳管成员数量（排除目录继承项）
  const directMembersCount = useMemo(() => members.filter(m => !m.inherited).length, [members])

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

  // 树形国家基药标准目录选项（自然中文序号排序，大类为根节点，亚类为叶子节点）
  const standardCatalogTreeOptions = useMemo(() => {
    if (!standardCatalogs.length) return []
    // 1. 自然中文数字排序：西药 1~25 排在前，中成药 1~7 排在后，大类与亚类均按自然序
    const sorted = [...standardCatalogs].sort((a, b) => {
      const ma = getMajorOrder(a.major)
      const mb = getMajorOrder(b.major)
      if (ma !== mb) return ma - mb
      const sa = parseChineseNumeral(a.sub)
      const sb = parseChineseNumeral(b.sub)
      if (sa !== sb) return sa - sb
      return a.sub.localeCompare(b.sub, 'zh-Hans')
    })

    // 2. 按大类组织层级树
    const majorMap = new Map<string, StandardCatalogCategorySummary[]>()
    for (const item of sorted) {
      const major = item.major || '未分类'
      if (!majorMap.has(major)) {
        majorMap.set(major, [])
      }
      majorMap.get(major)!.push(item)
    }

    const options = []
    for (const [major, subList] of majorMap.entries()) {
      const majorId = `major:${major}`
      const totalDrugs = subList.reduce((acc, s) => acc + (s.entryCount || 0), 0)
      options.push({
        value: majorId,
        label: major,
        trailingText: `共 ${subList.length} 亚类 (${totalDrugs} 药)`
      })
      for (const s of subList) {
        options.push({
          value: s.sub,
          parentValue: majorId,
          label: s.sub,
          trailingText: `${s.entryCount} 种通用名`,
          description: s.entryNames && s.entryNames.length > 0
            ? s.entryNames.slice(0, 4).join('、') + (s.entryNames.length > 4 ? '…' : '')
            : undefined,
          searchKeywords: [major, ...(s.entryNames || [])]
        })
      }
    }
    return options
  }, [standardCatalogs])

  // 带“不绑定标准目录”根选项的树形选项
  const standardCatalogTreeOptionsWithNone = useMemo(() => [
    { value: '', label: '不绑定标准目录（纯手工纳管维护）' },
    ...standardCatalogTreeOptions
  ], [standardCatalogTreeOptions])

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
    setHasSearchedMeds(false)
    setLastSearchedQuery('')
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
      // 若勾选了同步建立级联绑定，且当前分类尚未绑定该目录，则先同步更新分类属性
      if (syncBindCatalogOnImport && selectedCategory && (selectedCategory.catalogSub !== catalogSubToImport || selectedCategory.systemicOnly !== catalogSystemicOnly)) {
        await api.medicationWorkbench.updateSafetyCategory(selectedCategoryId, {
          expectedRevision: selectedCategory.revision,
          name: selectedCategory.name,
          rationale: selectedCategory.rationale,
          status: selectedCategory.status,
          catalogMajor: foundMajor || null,
          catalogSub: catalogSubToImport,
          systemicOnly: catalogSystemicOnly
        })
      }
      const result = await api.medicationWorkbench.importSafetyCategoryMembersFromCatalog(selectedCategoryId, {
        catalogMajor: foundMajor,
        catalogSub: catalogSubToImport,
        systemicOnly: catalogSystemicOnly
      })
      onNotice?.(`成功从标准目录批量导入 ${result.importedCount} 种药品${syncBindCatalogOnImport ? '，并已将安全分类同步绑定至该标准目录' : ''}（自动跳过 ${result.skippedCount} 种已纳管项）`)
      setShowAddMedModal(false)
      fetchMembers(selectedCategoryId, memberSearch)
      fetchCategories()
    } catch (e) {
      onError?.(`批量导入失败: ${errorMessage(e)}`)
    } finally {
      setImportingFromCatalog(false)
    }
  }

  // 仅建立标准目录级联绑定（无需导入明细，在库新药自动动态继承）
  const handleOnlyBindCatalog = async () => {
    if (!selectedCategoryId || !catalogSubToImport || !selectedCategory) return
    setImportingFromCatalog(true)
    try {
      const foundMajor = standardCatalogs.find(s => s.sub === catalogSubToImport)?.major || ''
      const updated = await api.medicationWorkbench.updateSafetyCategory(selectedCategoryId, {
        expectedRevision: selectedCategory.revision,
        name: selectedCategory.name,
        rationale: selectedCategory.rationale,
        status: selectedCategory.status,
        catalogMajor: foundMajor || null,
        catalogSub: catalogSubToImport,
        systemicOnly: catalogSystemicOnly
      })
      onNotice?.(`已成功将分类 "${updated.name}" 绑定至标准目录【${catalogSubToImport}】，全院在库及后续新增药品自动级联继承生效！`)
      setShowAddMedModal(false)
      fetchMembers(selectedCategoryId, memberSearch)
      fetchCategories()
    } catch (e) {
      onError?.(`绑定标准目录失败: ${errorMessage(e)}`)
    } finally {
      setImportingFromCatalog(false)
    }
  }

  // 搜索主数据药品
  const handleSearchMeds = async (queryStr: string) => {
    const q = queryStr.trim()
    if (!q) {
      setHasSearchedMeds(false)
      setLastSearchedQuery('')
      setMedCandidates([])
      return
    }
    setMedSearching(true)
    setHasSearchedMeds(true)
    setLastSearchedQuery(q)
    try {
      const results = await api.masterData.medications(q, '', 'ACTIVE')
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
        const rawForm = med.sdDoseFormText || med.sdDoseForm || med.doseForm
        return [...prev, {
          medicationId: med.id ?? med.medicationId!,
          medicationCode: med.code ?? med.medicationCode ?? '',
          medicationName: med.name ?? med.medicationName ?? '',
          preparationSpec: med.preparationSpec || undefined,
          doseForm: formatDoseForm(rawForm) || undefined
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
          const item = med as SafetyCategoryMemberItem
          return {
            ...item,
            doseForm: formatDoseForm(item.doseForm) || undefined
          }
        }
        const m = med as MedicationKnowledge
        return {
          medicationId: m.id,
          medicationCode: m.code,
          medicationName: m.name,
          preparationSpec: m.preparationSpec || undefined,
          doseForm: formatDoseForm(m.sdDoseFormText || m.sdDoseForm) || undefined
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

  // 打开独立目录绑定快捷弹窗
  const handleOpenBindCatalogModal = () => {
    if (!selectedCategory) return
    const defaultSub = selectedCategory.catalogSub || (standardCatalogs.length > 0 ? standardCatalogs[0].sub : '')
    setBindCatalogSub(defaultSub)
    setBindCatalogSystemicOnly(!!selectedCategory.systemicOnly)
    setShowBindCatalogModal(true)
  }

  // 保存目录绑定
  const handleSaveBindCatalog = async (importDrugsAfterBind = false) => {
    if (!selectedCategory || !bindCatalogSub) return
    setSavingBindCatalog(true)
    try {
      const foundMajor = standardCatalogs.find(s => s.sub === bindCatalogSub)?.major || ''
      const updated = await api.medicationWorkbench.updateSafetyCategory(selectedCategory.id, {
        expectedRevision: selectedCategory.revision,
        name: selectedCategory.name,
        rationale: selectedCategory.rationale,
        status: selectedCategory.status,
        catalogMajor: foundMajor || null,
        catalogSub: bindCatalogSub,
        systemicOnly: bindCatalogSystemicOnly
      })
      if (importDrugsAfterBind) {
        const result = await api.medicationWorkbench.importSafetyCategoryMembersFromCatalog(selectedCategory.id, {
          catalogMajor: foundMajor,
          catalogSub: bindCatalogSub,
          systemicOnly: bindCatalogSystemicOnly
        })
        onNotice?.(`已成功将分类 "${updated.name}" 绑定至标准目录【${bindCatalogSub}】，并导入了 ${result.importedCount} 种在库药品！`)
      } else {
        onNotice?.(`已成功将分类 "${updated.name}" 绑定至标准目录【${bindCatalogSub}】，全院在库同类药品自动级联继承生效！`)
      }
      setShowBindCatalogModal(false)
      fetchCategories()
      fetchMembers(selectedCategory.id, memberSearch)
    } catch (e) {
      onError?.(`绑定标准目录失败: ${errorMessage(e)}`)
    } finally {
      setSavingBindCatalog(false)
    }
  }

  // 解除目录绑定
  const handleUnbindCatalog = async () => {
    if (!selectedCategory) return
    try {
      const updated = await api.medicationWorkbench.updateSafetyCategory(selectedCategory.id, {
        expectedRevision: selectedCategory.revision,
        name: selectedCategory.name,
        rationale: selectedCategory.rationale,
        status: selectedCategory.status,
        catalogMajor: null,
        catalogSub: null,
        systemicOnly: false
      })
      onNotice?.(`已成功解除分类 "${updated.name}" 与标准目录的级联绑定`)
      fetchCategories()
      fetchMembers(selectedCategory.id, memberSearch)
    } catch (e) {
      onError?.(`解除目录绑定失败: ${errorMessage(e)}`)
    }
  }

  // 一键清空分类下全部手工纳管药品明细
  const handleConfirmClearMembers = async () => {
    if (!selectedCategoryId) return
    setClearingMembers(true)
    try {
      const count = await api.medicationWorkbench.clearSafetyCategoryMembers(selectedCategoryId)
      onNotice?.(`已成功清空分类 "${selectedCategory?.name}" 下的 ${count} 种手工纳管药品明细`)
      setShowClearConfirmModal(false)
      fetchMembers(selectedCategoryId, memberSearch)
      fetchCategories()
    } catch (e) {
      onError?.(`清空药品失败: ${errorMessage(e)}`)
    } finally {
      setClearingMembers(false)
    }
  }

  const currentCatalogSummary = standardCatalogs.find(s => s.sub === catalogSubToImport)

  const displayedCatalogCandidates = useMemo(() => {
    if (!selectedStandardDrugName) return catalogCandidates
    const term = selectedStandardDrugName.trim().toLowerCase()
    return catalogCandidates.filter(c => c.medicationName.toLowerCase().includes(term))
  }, [catalogCandidates, selectedStandardDrugName])

  // 导入选中的单个标准药品品种下的全部在库规格
  const handleImportSelectedStandardDrug = async () => {
    if (!selectedCategoryId || !selectedStandardDrugName || displayedCatalogCandidates.length === 0) return
    setImportingFromCatalog(true)
    try {
      const items = displayedCatalogCandidates.map(c => ({
        medicationId: c.medicationId,
        medicationCode: c.medicationCode,
        medicationName: c.medicationName,
        preparationSpec: c.preparationSpec,
        doseForm: c.doseForm
      }))
      const count = await api.medicationWorkbench.addSafetyCategoryMembers(selectedCategoryId, items)
      onNotice?.(`已成功将标准药品【${selectedStandardDrugName}】下的 ${count} 种在库规格药品导入到分类 "${selectedCategory?.name}"`)
      setShowAddMedModal(false)
      fetchMembers(selectedCategoryId, memberSearch)
      fetchCategories()
    } catch (e) {
      onError?.(`导入标准药品规格失败: ${errorMessage(e)}`)
    } finally {
      setImportingFromCatalog(false)
    }
  }

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
                    {(() => {
                      const effectiveCount = (cat.id === selectedCategoryId && members.length > 0) ? members.length : cat.memberCount
                      if (!effectiveCount || effectiveCount <= 0) {
                        return null
                      }
                      return (
                        <span className="qmed-cat-item-badge">
                          {effectiveCount} 药
                        </span>
                      )
                    })()}
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
                    {(() => {
                      const bound = CATEGORY_BOUND_RULES_MAP[cat.code]
                      if (bound && bound.length > 0) {
                        return (
                          <span className="qmed-cat-tag is-rule-bound" title={`已绑定生效规则：${bound.map(r => r.name).join('、')}`}>
                            已配规则 ({bound.length})
                          </span>
                        )
                      }
                      return null
                    })()}
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

                    {selectedCategory.catalogSub ? (
                      <div className="qmed-cat-catalog-badge">
                        <Icon name="database" />
                        <span>标准目录关联：<strong>{selectedCategory.catalogMajor ? `${selectedCategory.catalogMajor} / ` : ''}{selectedCategory.catalogSub}</strong></span>
                        {selectedCategory.systemicOnly && (
                          <span className="qmed-cat-systemic-pill">仅全身剂型</span>
                        )}
                        <div className="qmed-cat-catalog-badge-actions">
                          <Button size="sm" variant="text" onClick={handleOpenBindCatalogModal}>
                            更换目录
                          </Button>
                          <Button size="sm" variant="text" onClick={handleUnbindCatalog}>
                            解除绑定
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="qmed-cat-catalog-unbind-prompt">
                        <Button size="sm" variant="secondary" onClick={handleOpenBindCatalogModal}>
                          <Icon name="database" /> 绑定基药标准目录（推荐）
                        </Button>
                        <span className="qmed-cat-unbind-tip">
                          尚未绑定标准目录。绑定后全院同类药品自动级联继承，后续主档新药自动动态生效！
                        </span>
                      </div>
                    )}

                    <div className="qmed-cat-detail-meta">
                      <span>规则类别: <strong>{ruleKindNameMap[selectedCategory.ruleKind] || selectedCategory.ruleKind}</strong></span>
                      <span>纳管药品数: <strong>{(() => {
                        const effectiveCount = members.length > 0 ? members.length : selectedCategory.memberCount
                        if (effectiveCount > 0) return `${effectiveCount} 种`
                        if (selectedCategory.catalogSub) return '目录级联生效'
                        return '暂未纳管'
                      })()}</strong></span>
                      <span>版本修订: <strong>rev.{selectedCategory.revision}</strong></span>
                    </div>

                    {(() => {
                      const bound = CATEGORY_BOUND_RULES_MAP[selectedCategory.code]
                      if (!bound || bound.length === 0) return null
                      return (
                        <div className="qmed-cat-bound-rules-section">
                          <div className="qmed-cat-bound-rules-title">
                            <Icon name="check" /> 关联在行合理用药质控规则（{bound.length} 条）
                          </div>
                          <div className="qmed-cat-bound-rules-list">
                            {bound.map(r => (
                              <div key={r.code} className="qmed-cat-bound-rule-pill">
                                <span className="bound-rule-code">{r.code}</span>
                                <span className="bound-rule-name">{r.name}</span>
                                <StatusBadge tone={r.decision === 'BLOCK' ? 'danger' : 'warning'}>
                                  {r.decision === 'BLOCK' ? '绝对拦截 (BLOCK)' : '阻断需理由'}
                                </StatusBadge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })()}
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
                  <div className="qmed-cat-members-toolbar-right">
                    <div className="ui-query-filters__group">
                      <SearchField
                        label="过滤纳管药品"
                        placeholder="在纳管药品中快速过滤..."
                        value={memberSearch}
                        onChange={setMemberSearch}
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={directMembersCount === 0 || clearingMembers}
                      busy={clearingMembers}
                      onClick={() => setShowClearConfirmModal(true)}
                      title={directMembersCount === 0 ? '当前没有手工纳管的药品明细' : `一键清空全部手工添加的 ${directMembersCount} 种药品明细`}
                    >
                      <Icon name="close" /> 一键清空 ({directMembersCount})
                    </Button>
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
                              <span className="qmed-dose-pill">{formatDoseForm(mbr.doseForm) || '-'}</span>
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
                onChange={(val, opt) => {
                  const major = opt?.parentValue ? opt.parentValue.replace(/^major:/, '') : standardCatalogs.find(s => s.sub === val)?.major || ''
                  setCategoryForm({
                    ...categoryForm,
                    catalogSub: val,
                    catalogMajor: major
                  })
                }}
                options={standardCatalogTreeOptionsWithNone}
                leafOnly
                showHierarchyInLabel
                placeholder="选择绑定标准目录（支持树形展开与检索）"
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
          title={`纳入药品 · ${selectedCategory?.name}`}
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
                  setMedQuery('')
                  setMedCandidates([])
                  setHasSearchedMeds(false)
                  setLastSearchedQuery('')
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
                        options={standardCatalogTreeOptions}
                        leafOnly
                        showHierarchyInLabel
                        placeholder="请选择标准分类（支持树形展开与检索）"
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
                      <span>仅全身给药剂型（排除外用制剂）</span>
                    </label>

                    {currentCatalogSummary && currentCatalogSummary.entryNames && currentCatalogSummary.entryNames.length > 0 && (
                      <div className="qmed-catalog-names-preview">
                        <div className="qmed-catalog-names-header">
                          <span className="qmed-catalog-names-label">
                            {selectedStandardDrugName ? `已筛选品种：${selectedStandardDrugName}` : `基药收录通用名 (${currentCatalogSummary.entryNames.length})：`}
                          </span>
                          {selectedStandardDrugName && (
                            <Button
                              variant="text"
                              size="sm"
                              className="qmed-catalog-clear-filter-btn"
                              onClick={() => setSelectedStandardDrugName('')}
                            >
                              清除品种筛选
                            </Button>
                          )}
                        </div>
                        <div className="qmed-catalog-names-chips">
                          {currentCatalogSummary.entryNames.slice(0, 20).map(name => (
                            <span
                              key={name}
                              role="button"
                              tabIndex={0}
                              className={`qmed-catalog-name-chip ${selectedStandardDrugName === name ? 'is-active' : ''}`}
                              onClick={() => setSelectedStandardDrugName(prev => prev === name ? '' : name)}
                              onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  setSelectedStandardDrugName(prev => prev === name ? '' : name)
                                }
                              }}
                              title={`点击${selectedStandardDrugName === name ? '取消筛选' : '筛选并一键导入'}标准药品【${name}】的全部规格`}
                            >
                              {name}
                            </span>
                          ))}
                          {currentCatalogSummary.entryNames.length > 20 && (
                            <span className="qmed-catalog-name-chip is-more">
                              ...等 {currentCatalogSummary.entryNames.length} 种
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 独立的结构化全量导入卡片 */}
                  <div className="qmed-batch-import-hero">
                    <div className="qmed-batch-import-hero-title">
                      <span>目录级联与全量纳管</span>
                      <span className="qmed-batch-import-hero-count">
                        {catalogCandidates.length} 药待入库
                      </span>
                    </div>

                    <label className="qmed-checkbox-label" style={{ marginTop: 'var(--space-1)' }}>
                      <input
                        type="checkbox"
                        checked={syncBindCatalogOnImport}
                        onChange={e => setSyncBindCatalogOnImport(e.target.checked)}
                      />
                      <span><strong>同时将此标准目录绑定至当前分类</strong>（推荐：后续主档新药自动级联继承）</span>
                    </label>

                    <div className="qmed-batch-import-btn-wrap" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                      {selectedStandardDrugName && (
                        <Button
                          variant="primary"
                          busy={importingFromCatalog}
                          disabled={displayedCatalogCandidates.length === 0}
                          onClick={handleImportSelectedStandardDrug}
                          title={`一键将标准药品【${selectedStandardDrugName}】下的全部 ${displayedCatalogCandidates.length} 种在库规格药品导入`}
                        >
                          <Icon name="database" /> 仅导入【{selectedStandardDrugName}】全规格 ({displayedCatalogCandidates.length} 药)
                        </Button>
                      )}
                      <Button
                        variant={selectedStandardDrugName ? 'secondary' : 'primary'}
                        busy={importingFromCatalog}
                        disabled={!catalogSubToImport || catalogCandidates.length === 0}
                        onClick={handleImportAllFromCatalog}
                      >
                        <Icon name="database" /> 一键全量导入全目录 ({catalogCandidates.length} 药)
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={!catalogSubToImport || importingFromCatalog}
                        onClick={handleOnlyBindCatalog}
                        title="仅将该安全分类与国家基药目录绑定，所有药品通过目录级联自动继承，无需额外存储明细记录"
                      >
                        仅建立目录级联绑定（无需导入明细）
                      </Button>
                    </div>
                  </div>
                </div>

                {/* 右栏：未纳管候选药品清单与按需多选 */}
                <div className="qmed-catalog-main-results">
                  <div className="qmed-add-med-results-header">
                    <div className="qmed-add-med-header-left">
                      <span>
                        {selectedStandardDrugName
                          ? `【${selectedStandardDrugName}】在库未纳管规格 (${displayedCatalogCandidates.length})`
                          : `在库未纳管药品 (${catalogCandidates.length})`}
                      </span>
                      {selectedMedItems.length > 0 && (
                        <span className="qmed-selected-pill">
                          已勾选 {selectedMedItems.length} 药
                        </span>
                      )}
                    </div>
                    {displayedCatalogCandidates.length > 0 && (
                      <Button size="sm" variant="secondary" onClick={handleToggleSelectAllCandidates}>
                        {selectedMedItems.length === displayedCatalogCandidates.length ? '取消全选' : '全选候选药'}
                      </Button>
                    )}
                  </div>

                  {catalogSearching ? (
                    <div className="qmed-add-med-loading">
                      <LoadingState label="匹配候选药品中..." />
                    </div>
                  ) : displayedCatalogCandidates.length === 0 ? (
                    <div className="qmed-add-med-empty">
                      {selectedStandardDrugName
                        ? `标准药品【${selectedStandardDrugName}】在库规格已全部纳管或暂无符合条件的药品`
                        : '当前标准目录下未发现可导入的未纳管药品（可能已全部纳入）'}
                    </div>
                  ) : (
                    <div className="qmed-add-med-list">
                      {displayedCatalogCandidates.map(med => {
                        const isChecked = selectedMedItems.some(i => String(i.medicationId) === String(med.medicationId))
                        const doseFormText = formatDoseForm(med.doseForm)
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
                                {doseFormText && <span className="qmed-dose-pill">{doseFormText}</span>}
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
              /* 模式2：主数据药名检索（回车触发） */
              <div className="qmed-manual-search-pane">
                <div className="ui-query-filters">
                  <SearchField
                    label="检索主数据药品"
                    placeholder="输入药品通用名/拼音码/编码，按回车开始查询..."
                    value={medQuery}
                    onChange={val => {
                      setMedQuery(val)
                      if (!val.trim()) {
                        setHasSearchedMeds(false)
                        setLastSearchedQuery('')
                        setMedCandidates([])
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
                      <span>{hasSearchedMeds ? `候选药品清单 (${medCandidates.length})` : '候选药品清单'}</span>
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
                  ) : !hasSearchedMeds ? (
                    <div className="qmed-add-med-empty">
                      请输入药品通用名、拼音码或代码，按回车开始搜索
                    </div>
                  ) : medCandidates.length === 0 ? (
                    <div className="qmed-add-med-empty">
                      未找到与 &quot;{lastSearchedQuery}&quot; 匹配的未纳管药品
                    </div>
                  ) : (
                    <div className="qmed-add-med-list">
                      {medCandidates.map(med => {
                        const isChecked = selectedMedItems.some(i => String(i.medicationId) === String(med.id))
                        const doseFormText = formatDoseForm(med.sdDoseFormText || med.sdDoseForm)
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
                                {doseFormText && (
                                  <span className="qmed-dose-pill">{doseFormText}</span>
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

            {selectedMedItems.length > 0 && (
              <div className="qmed-add-med-selected-summary">
                <span>已选 <strong>{selectedMedItems.length}</strong> 种药品准备纳入该分类</span>
              </div>
            )}
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
          <div className="qmed-clear-confirm-body">
            <div className="qmed-confirm-warning-box">
              <div className="qmed-confirm-warning-icon">
                <Icon name="warning" />
              </div>
              <div className="qmed-confirm-warning-content">
                <p className="qmed-confirm-warning-title">
                  确定要删除分类 <strong>{deletingCategory.name}</strong> ({deletingCategory.code}) 吗？
                </p>
                <p className="qmed-confirm-warning-desc">
                  删除后该分类及与其关联的药品安全映射将一并移除，此操作不可逆。
                </p>
              </div>
            </div>
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

      {/* 弹窗 5：独立绑定基药标准目录 */}
      {showBindCatalogModal && selectedCategory && (
        <Dialog
          title={`绑定国家基药标准目录 · ${selectedCategory.name}`}
          onClose={() => setShowBindCatalogModal(false)}
          className="qmed-cat-dialog"
        >
          <div className="qmed-dialog-form">
            <FormField label="选择国家基药标准目录" required>
              <Select
                value={bindCatalogSub}
                onChange={setBindCatalogSub}
                options={standardCatalogTreeOptions}
                leafOnly
                showHierarchyInLabel
                placeholder="请选择标准目录（点击大类展开层级）"
              />
            </FormField>

            <div style={{ padding: '0 var(--space-1)' }}>
              <label className="qmed-checkbox-label">
                <input
                  type="checkbox"
                  checked={bindCatalogSystemicOnly}
                  onChange={e => setBindCatalogSystemicOnly(e.target.checked)}
                />
                <span>仅纳管全身剂型（自动排除眼耳鼻局部制剂、外用软膏、凝胶贴膏等）</span>
              </label>
            </div>

            <div className="qmed-cat-rationale-box" style={{ marginTop: 'var(--space-2)' }}>
              <div className="qmed-cat-rationale-title">
                <Icon name="info" /> 标准目录级联继承说明
              </div>
              <div className="qmed-cat-rationale-body">
                绑定后，全院在库属于该目录的药品均自动纳入规则计算，主档新增同类药品也将自动生效，无需逐一手工维护药品明细。
              </div>
            </div>
          </div>
          <div className="qmed-dialog-footer">
            <Button variant="secondary" onClick={() => setShowBindCatalogModal(false)}>
              取消
            </Button>
            <Button
              variant="secondary"
              disabled={!bindCatalogSub}
              busy={savingBindCatalog}
              onClick={() => handleSaveBindCatalog(false)}
            >
              仅保存目录级联绑定
            </Button>
            <Button
              variant="primary"
              disabled={!bindCatalogSub}
              busy={savingBindCatalog}
              onClick={() => handleSaveBindCatalog(true)}
            >
              保存绑定并全量导入当前药品
            </Button>
          </div>
        </Dialog>
      )}

      {/* 弹窗 6：一键清空药品确认 */}
      {showClearConfirmModal && selectedCategory && (
        <Dialog
          title="一键清空手工纳管药品确认"
          onClose={() => setShowClearConfirmModal(false)}
        >
          <div className="qmed-clear-confirm-body">
            <div className="qmed-confirm-warning-box">
              <div className="qmed-confirm-warning-icon">
                <Icon name="warning" />
              </div>
              <div className="qmed-confirm-warning-content">
                <p className="qmed-confirm-warning-title">
                  确定要清空安全分类 <strong>{selectedCategory.name}</strong> 下的所有手工纳管药品吗？
                </p>
                <p className="qmed-confirm-warning-desc">
                  将立即移出共 <strong>{directMembersCount}</strong> 种已纳管的药品明细。此操作不可撤销。
                </p>
              </div>
            </div>
            {selectedCategory.catalogSub && (
              <div className="qmed-clear-catalog-hint">
                <Icon name="info" />
                <span>
                  💡 提示：该分类已绑定国家基药标准目录【{selectedCategory.catalogSub}】，由目录动态级联继承生效的药品规则不会受到影响。
                </span>
              </div>
            )}
          </div>
          <div className="qmed-dialog-footer">
            <Button variant="secondary" onClick={() => setShowClearConfirmModal(false)}>
              取消
            </Button>
            <Button variant="danger" busy={clearingMembers} onClick={handleConfirmClearMembers}>
              确认清空全部手工药品
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}
