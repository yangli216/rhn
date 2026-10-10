import type { CSSProperties } from 'react'
import { requireClinicalConfiguration } from "../clinicalConfigurationTruth";
import { examinationProfileForm, examinationProfileInput } from "../examinationProfileForm";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ClinicalConfiguration, DictionaryValue, ExaminationProfileInput, ExaminationVariantConfiguration, ExaminationAttachmentConfiguration, LaboratoryProfile, RhnApi, ServiceCatalogItem, SpecimenConfiguration, UnitDefinition } from "../../../shared/rhnApi";
import { errorMessage } from "../../../shared/rhnApi";
import { Alert, Button, Dialog, EmptyState, FormField, Icon, LoadingState, Select, StatusBadge } from "../../../shared/ui";
import { requireOperationalRows, sitePricingLabel, ClinicalDataTable, tubeDotColor, tubeRuleLabel, State, sitePricingDetail, attachmentTriggerLabel, attachmentQuantityLabel, unitOption, Check, FormDialog } from './operationalShared'
import { SpecimenDialog } from './SpecimenConfigurationDialog'
import { VariantDialog, AttachmentDialog } from './ExaminationRules'
import { LaboratoryTubeSimulator } from './LaboratoryTubeSimulator'
import { ExaminationChargeSimulator } from './ExaminationChargeSimulator'

export function ClinicalServiceConfigurationDialog({ api, service, organizationId, dictionaries, onClose }: {
  api: RhnApi; service: ServiceCatalogItem; organizationId: string
  dictionaries: Record<string, DictionaryValue[]>; onClose: () => void
}) {
  const client = useQueryClient()
  const [dialog, setDialog] = useState<ReactNode>()
  const [feedback, setFeedback] = useState('')
  const [operationError, setOperationError] = useState('')
  const [aliasNames, setAliasNames] = useState<string[]>([])
  const [aliasInput, setAliasInput] = useState('')
  const [savingAliases, setSavingAliases] = useState(false)
  const configuration = useQuery({
    queryKey: ['master-data-clinical-configuration', service.id],
    queryFn: async () => requireClinicalConfiguration(await api.masterData.clinicalConfiguration(service.id), service),
  })
  const aliases = useQuery({
    queryKey: ['master-data-service-aliases', service.id],
    queryFn: async () => requireOperationalRows(await api.masterData.serviceAliases(service.id), '项目别名'),
  })
  useEffect(() => {
    setAliasNames((aliases.data ?? []).map((value) => value.aliasName))
  }, [aliases.data])
  const services = useQuery({
    queryKey: ['master-data-services-project-configuration', organizationId],
    queryFn: () => api.masterData.services('', '', '', organizationId),
  })
  const units = useQuery({ queryKey: ['master-data-operational-units'], queryFn: () => api.masterData.units() })
  const invalidate = async (message: string) => {
    setDialog(undefined); setFeedback(message); setOperationError('')
    await client.invalidateQueries({ queryKey: ['master-data-clinical-configuration', service.id] })
    await client.invalidateQueries({ queryKey: ['master-data-service-aliases', service.id] })
    await client.invalidateQueries({ queryKey: ['master-data-services'] })
  }
  const execute = (message: string, task: Promise<unknown>) => task.then(() => invalidate(message))
  const saveProfile = async (message: string, task: Promise<ClinicalConfiguration>) => {
    const saved = requireClinicalConfiguration(await task, service)
    client.setQueryData(['master-data-clinical-configuration', service.id], saved)
    await invalidate(message)
  }
  const value = configuration.data
  const allServices = services.data ?? []
  const allUnits = units.data ?? []
  const laboratory = service.sdServiceType === 'LABORATORY'
  const examination = service.sdServiceType === 'EXAMINATION'
  const supportedType = laboratory || examination
  const description = laboratory
    ? '统一维护检验方法、报告要求、标本容器、分管规则和试管加收；这里是该检验项目的唯一业务配置入口。'
    : '统一维护检查准备、允许部位与方式、多部位计价和附加收费；这里是该检查项目的唯一业务配置入口。'

  if (dialog) return <>{dialog}</>
  return <Dialog title={`${service.name} · 执行与收费`} eyebrow="诊疗项目 · 执行与收费" size="xwide"
    className="clinical-project-dialog" onClose={onClose}
    description={description}
    footer={<Button variant="secondary" onClick={onClose}>关闭</Button>}>
    {feedback && <Alert tone="success">{feedback}</Alert>}
    {operationError && <Alert>{operationError}</Alert>}
    {(configuration.error || aliases.error || services.error || units.error) && <Alert>
      {errorMessage(configuration.error || aliases.error || services.error || units.error)}
    </Alert>}
    {configuration.isError || services.isError || units.isError
      ? <EmptyState icon="clinical" title="执行与收费配置不可用" copy="数据加载失败或配置不完整，请刷新重试；确认配置前无法编辑或试算。"
          action={<Button variant="secondary" onClick={() => { void configuration.refetch(); void services.refetch(); void units.refetch() }}>重新加载配置</Button>} />
      : configuration.isPending || services.isPending || units.isPending
        ? <LoadingState label="正在加载项目执行与收费配置…" />
        : !supportedType ? <Alert>当前项目类型不支持检验检查业务配置。</Alert>
          : value && <ClinicalWorkspace api={api} value={value} serviceStatus={service.sdStatus} serviceStatusText={service.sdStatusText} services={allServices} dictionaries={dictionaries}
          unitCodes={allUnits.filter((item) => item.status === 'ACTIVE')}
          onSaveLaboratoryProfile={(input) => saveProfile('检验项目基本配置已更新',
            api.masterData.updateLaboratoryProfile(service.id, value.laboratory!.revision, input))}
          onSaveExaminationProfile={(input) => saveProfile('检查项目基本配置已更新',
            api.masterData.updateExaminationProfile(service.id, value.examination!.revision, input))}
          onEditProfile={() => setDialog(laboratory
            ? <LaboratoryProfileDialog value={value.laboratory!} dictionaries={dictionaries} units={allUnits}
              onClose={() => setDialog(undefined)} onSave={(input) => execute('检验项目基本配置已更新',
                api.masterData.updateLaboratoryProfile(service.id, value.laboratory!.revision, input))} />
            : <ExaminationProfileDialog value={value.examination!} dictionaries={dictionaries}
              services={allServices} currentServiceId={service.id} onClose={() => setDialog(undefined)}
              onSave={(input) => execute('检查项目基本配置已更新',
                api.masterData.updateExaminationProfile(service.id, value.examination!.revision, input))} />)}
          onSpecimen={(row) => setDialog(<SpecimenDialog value={row} configuration={value}
            units={allUnits} services={allServices} onClose={() => setDialog(undefined)}
            onSave={(input) => execute(row ? '标本配置已更新' : '标本配置已新增', row
              ? api.masterData.updateSpecimenConfiguration(service.id, row, input)
              : api.masterData.createSpecimenConfiguration(service.id, input))} />)}
          onVariant={(row) => setDialog(<VariantDialog value={row} dictionaries={dictionaries}
            onClose={() => setDialog(undefined)} onSave={(input) => execute(row ? '检查部位或方式已更新' : '检查部位或方式已新增', row
              ? api.masterData.updateExaminationVariant(service.id, row, input)
              : api.masterData.createExaminationVariant(service.id, input))} />)}
        onAttachment={(row) => setDialog(<AttachmentDialog value={row} services={allServices}
          currentServiceId={service.id} onClose={() => setDialog(undefined)}
          onSave={(input) => execute(row ? '附加收费规则已更新' : '附加收费规则已新增', row
            ? api.masterData.updateExaminationAttachment(service.id, row, input)
            : api.masterData.createExaminationAttachment(service.id, input))} />)} />}
    <section className="clinical-project-aliases" aria-label="项目别名维护">
      <div className="operational-master-data__toolbar">
        <div><h3>项目别名</h3><p>别名只作为检索入口，匹配后仍归一到当前标准项目，不改变收费和执行配置。</p></div>
        <Button disabled={aliases.isPending || aliases.isError || savingAliases} busy={savingAliases} busyLabel="保存中" onClick={async () => {
          setSavingAliases(true)
          try {
            await execute('项目别名已更新', api.masterData.replaceServiceAliases(service.id, aliasNames.map((aliasName, index) => ({
              aliasType: 'SYNONYM', aliasName, primaryAlias: index === 0, status: 'ACTIVE',
            }))))
          } catch (error) { setOperationError(errorMessage(error)) }
          finally { setSavingAliases(false) }
        }}>保存别名</Button>
      </div>
      <div className="master-data-form-grid master-data-form-grid--2">
        <FormField label="新增别名"><input value={aliasInput} disabled={aliases.isPending || aliases.isError || savingAliases} aria-label="新增项目别名" placeholder="支持逗号分隔多个别名"
          onChange={(event) => setAliasInput(event.target.value)} /></FormField>
        <div className="row-actions" style={{ alignItems: 'end' }}><Button variant="secondary" disabled={aliases.isPending || aliases.isError || savingAliases} onClick={() => {
          const additions = aliasInput.split(/[,，、]/).map((value) => value.trim()).filter(Boolean)
          setAliasNames((current) => [...new Set([...current, ...additions])])
          setAliasInput('')
        }}>加入列表</Button></div>
      </div>
      <div className="clinical-project-aliases__list">
        {aliases.isError ? <EmptyState icon="clinical" title="项目别名加载失败" copy="尚无法确认已配置的别名，请重新加载。"
          action={<Button variant="secondary" onClick={() => { void aliases.refetch() }}>重新加载别名</Button>} />
          : aliases.isPending ? <LoadingState label="正在加载项目别名…" /> : aliasNames.length === 0
          ? <span className="muted">暂未配置别名</span>
          : aliasNames.map((aliasName) => <span className="clinical-project-aliases__item" key={aliasName}>
            {aliasName}<Button size="sm" variant="text" aria-label={`移除别名${aliasName}`} disabled={savingAliases} onClick={() => setAliasNames((current) => current.filter((value) => value !== aliasName))}>×</Button>
          </span>)}
      </div>
    </section>
  </Dialog>
}

export function ClinicalWorkspace({ api, value, serviceStatus, serviceStatusText, services, dictionaries, unitCodes, onEditProfile, onSaveLaboratoryProfile, onSaveExaminationProfile, onSpecimen, onVariant, onAttachment }: {
  api: RhnApi; value: ClinicalConfiguration; serviceStatus: string; serviceStatusText?: string; services: ServiceCatalogItem[]
  dictionaries: Record<string, DictionaryValue[]>; unitCodes: UnitDefinition[]
  onEditProfile?: () => void
  onSaveLaboratoryProfile?: (input: Omit<LaboratoryProfile, 'serviceId' | 'revision' | 'specimens'>) => Promise<void>
  onSaveExaminationProfile?: (input: ExaminationProfileInput) => Promise<void>
  onSpecimen: (value?: SpecimenConfiguration) => void
  onVariant: (value?: ExaminationVariantConfiguration) => void
  onAttachment: (value?: ExaminationAttachmentConfiguration) => void
}) {
  void unitCodes
  const laboratory = value.serviceType === 'LABORATORY'
  const [tab, setTab] = useState<'options' | 'requirements' | 'attachments'>('options')
  const [editingProfile, setEditingProfile] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileError, setProfileError] = useState('')
  const saveProfile = async (task: () => Promise<void>) => {
    if (savingProfile) return
    setSavingProfile(true); setProfileError('')
    try {
      await task()
      setEditingProfile(false)
    } catch (error) {
      setProfileError(errorMessage(error))
    } finally { setSavingProfile(false) }
  }
  const profile = value.laboratory ?? value.examination
  const dictionaryName = (dictionaryCode: string, code?: string) =>
    code ? dictionaries[dictionaryCode]?.find((item) => item.code === code)?.name ?? '未匹配字典项' : '未设置'

  const tabs = laboratory
    ? ([['options', '标本容器与分管加收'], ['requirements', '报告与执行要求']] as const)
    : ([['options', '允许部位与阶梯计费'], ['attachments', '连带附加收费规则'], ['requirements', '检查前准备与要求']] as const)

  return <div className="clinical-configuration">
    {/* 紧凑现代临床头部看板 */}
    <div className="clinical-header-card">
      <div className="clinical-header-card__info">
        <div className="clinical-header-card__titles">
          <strong>{value.serviceName}</strong>
          <code>{value.serviceCode}</code>
        </div>
        <StatusBadge tone={serviceStatus === 'ACTIVE' ? 'success' : 'neutral'}>{serviceStatusText || serviceStatus || '未返回状态'}</StatusBadge>
      </div>

      <div className="clinical-header-card__facts">
        {laboratory ? <>
          <span className="clinical-fact-pill">检验方法: <strong>{dictionaryName('BD_LAB_METHOD', value.laboratory!.laboratoryMethod)}</strong></span>
          <span className="clinical-fact-pill">报告时长: <strong>{value.laboratory!.reportDuration ? `${value.laboratory!.reportDuration} ${value.laboratory!.reportDurationUnit ?? ''}`.trim() : '未设置'}</strong></span>
          <span className="clinical-fact-pill">执行属性: <strong>{[value.laboratory!.fastingRequired && '空腹', value.laboratory!.pointOfCare && 'POCT'].filter(Boolean).join(' · ') || '常规'}</strong></span>
        </> : <>
          <span className="clinical-fact-pill">检查类型: <strong>{dictionaryName('BD_EXAM_TYPE', value.examination?.examinationType)}</strong></span>
          <span className="clinical-fact-pill">部位约束: <strong>{value.examination?.bodySiteRequired ? `必选(最多${value.examination.maxBodySiteCount ? `${value.examination.maxBodySiteCount}个` : '不限'})` : '不限'}</strong></span>
          <span className="clinical-fact-pill">计费模式: <strong>{sitePricingLabel(value.examination!)}</strong></span>
        </>}
      </div>

      <Button
        variant={editingProfile ? 'primary' : 'secondary'}
        disabled={savingProfile}
        onClick={() => {
          if (onSaveLaboratoryProfile || onSaveExaminationProfile) {
            if (!savingProfile) setEditingProfile(!editingProfile)
          } else if (onEditProfile) {
            onEditProfile()
          }
        }}
      >
        {editingProfile ? '收起基本配置' : '编辑项目基本配置'}
      </Button>
    </div>

    {/* 原地内联卡片：项目基本配置与多部位计价 */}
    {profileError && <Alert duration={null}>{profileError}</Alert>}
    {savingProfile && <LoadingState label="正在保存项目配置…" />}
    {editingProfile && <fieldset className="master-data-dialog-fields" disabled={savingProfile}>
      {laboratory ? (
        <LaboratoryProfileInlineEditor
          value={value.laboratory!}
          dictionaries={dictionaries}
          units={unitCodes}
          onClose={() => setEditingProfile(false)}
          onSave={(input) => {
            if (onSaveLaboratoryProfile) {
              void saveProfile(() => onSaveLaboratoryProfile(input))
            } else if (onEditProfile) {
              onEditProfile()
            }
          }}
        />
      ) : (
        <ExaminationProfileInlineEditor
          value={value.examination!}
          dictionaries={dictionaries}
          services={services}
          currentServiceId={value.serviceId}
          onClose={() => setEditingProfile(false)}
          onSave={(input) => {
            if (onSaveExaminationProfile) {
              void saveProfile(() => onSaveExaminationProfile(input))
            } else if (onEditProfile) {
              onEditProfile()
            }
          }}
        />
      )}
    </fieldset>}

    {/* PC 端宽屏双栏工作台布局 */}
    <div className="clinical-workbench-grid" style={{ marginTop: 'var(--space-3)' }}>
      {/* 左栏：核心业务规则配置 */}
      <div className="clinical-workbench-grid__main">
        <nav className="clinical-configuration__tabs" aria-label="项目配置内容" style={{ marginTop: 0 }}>
          {tabs.map(([key, label]) => (
            <Button type="button" key={key} className={tab === key ? 'is-active' : ''} onClick={() => setTab(key as typeof tab)} variant="text" size="sm">
              {label}
            </Button>
          ))}
        </nav>

        {/* 检验：标本与分管加收 */}
        {laboratory && tab === 'options' && (
          <div className="clinical-configuration__section" style={{ marginTop: 'var(--space-2)' }}>
            <div className="section-heading">
              <div>
                <h4>可用标本、采血管与同次分管规则</h4>
                <p>支持一键套用成熟采血管方案；定义同次申请的合管、拆管及试管加收依据。</p>
              </div>
              <Button size="sm" onClick={() => onSpecimen()}><Icon name="add" />新增标本规则</Button>
            </div>
            {!value.laboratory!.specimens.length ? (
              <EmptyState icon="clinical" title="暂未配置标本与采血管" copy="请点击上方“新增标本规则”，可一键套用生化黄头管、血常规紫头管等成熟方案。" />
            ) : (
              <ClinicalDataTable
                headers={['标本类型', '采血管容器', '采样量', '分管模式与加收', '状态', '操作']}
                colWidths={['25%', '25%', '13%', '23%', '7%', '7%']}
                rows={value.laboratory!.specimens.map((row) => [
                  <div>
                    <strong style={{ display: 'block' }} className="clinical-content-1">{row.specimenName}</strong>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', marginTop: '0.125rem' }}>
                      <code  className="clinical-content-2">{row.specimenCode}</code>
                      {row.defaultSpecimen && <span className="clinical-tag-pill clinical-tag-pill--primary">首选默认</span>}
                      {row.requiredSpecimen && <span className="clinical-tag-pill clinical-tag-pill--purple">必需</span>}
                    </div>
                  </div>,
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                    <span className="tube-dot clinical-content-3" style={{ flexShrink: 0, '--specimen-cap-color': tubeDotColor(row.containerName || '', row.tubeGroupCode || '') } as CSSProperties} />
                    <span  className="clinical-content-4">{row.containerName || '未限定容器'}</span>
                  </span>,
                  <span  className="clinical-content-5">{row.minimumQuantity ? `${row.minimumQuantity} ${row.minimumQuantityUnit}` : '未限定'}</span>,
                  <div>
                    <strong style={{ display: 'block' } as CSSProperties} className="clinical-content-6">{tubeRuleLabel(row)}</strong>
                    <small  className="clinical-content-7">
                      {row.tubeChargeMode === 'NONE' ? '免加收' : `加收 ${row.tubeChargeQuantity} 支`}
                    </small>
                  </div>,
                  <State value={row.status} />,
                  <Button size="sm" variant="text" onClick={() => onSpecimen(row)}>编辑</Button>,
                ])} />
            )}
          </div>
        )}

        {/* 检查：允许部位与阶梯计费看板 */}
        {!laboratory && tab === 'options' && value.examination && (
          <>
            {/* 多部位阶梯计费看板 */}
            <div className="site-pricing-dashboard">
              <div className="site-pricing-dashboard__header">
                <div>
                  <h4>多部位阶梯计费矩阵</h4>
                  <p style={{ margin: 0 } as CSSProperties} className="clinical-content-8">
                    国内主流三甲医院标准多部位计费策略：区分首部位基础价与次部位加收
                  </p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setEditingProfile(true)}>
                  调整阶梯规则
                </Button>
              </div>
              <div className="site-pricing-steps">
                <div className="site-pricing-step site-pricing-step--tier1">
                  <strong>阶梯 1 · 首部位 / 包含部位</strong>
                  <p>前 {value.examination.includedSiteCount} 个部位按主项目基准价收取（100%）</p>
                  <small>基础部位涵盖常规扫描与主要诊断要求</small>
                </div>
                <div className="site-pricing-step site-pricing-step--tier2">
                  <strong>阶梯 2 · 超出部位加收规则</strong>
                  <p>{sitePricingDetail(value.examination)}</p>
                  <small>{value.examination.maxChargeableSiteCount ? `最多累计计费 ${value.examination.maxChargeableSiteCount} 个部位` : '计费部位不限上限'}</small>
                </div>
              </div>
            </div>

            {/* 允许部位与方式列表 */}
            <div className="clinical-configuration__section" style={{ marginTop: 'var(--space-2)' }}>
              <div className="section-heading">
                <div>
                  <h4>允许部位与检查方式</h4>
                  <p>维护医生开单可选的解剖部位或技术方式；支持通过常用解剖标签快速维护。</p>
                </div>
                <Button size="sm" onClick={() => onVariant()}><Icon name="add" />新增部位或方式</Button>
              </div>
              {!value.examination.variants.length ? (
                <EmptyState icon="clinical" title="暂未配置允许部位" copy="请点击上方按钮添加允许执行的解剖部位（如头颅、胸部、全腹部）。" />
              ) : (
                <ClinicalDataTable
                  headers={['部位/选项', '检查方式', '标准部位要求', '排序', '状态', '操作']}
                  colWidths={['30%', '20%', '24%', '10%', '8%', '8%']}
                  rows={value.examination.variants.map((row) => [
                    <div>
                      <strong style={{ display: 'block' } as CSSProperties} title={`配置编码：${row.code}`} className="clinical-content-9">{row.name}</strong>
                    </div>,
                    <span className="clinical-tag-pill clinical-tag-pill--primary">
                      {dictionaryName('BD_SERVICE_VARIANT_METHOD', row.methodType)}
                    </span>,
                    row.bodySiteRequired ? (
                      <span className="clinical-tag-pill clinical-tag-pill--purple">需选择标准部位</span>
                    ) : (
                      <span className="clinical-tag-pill">无需另选部位</span>
                    ),
                    row.sortOrder,
                    <State value={row.status} />,
                    <Button size="sm" variant="text" onClick={() => onVariant(row)}>编辑</Button>,
                  ])} />
              )}
            </div>
          </>
        )}

        {/* 检查：连带附加收费规则 */}
        {!laboratory && tab === 'attachments' && value.examination && (
          <div className="clinical-configuration__section" style={{ marginTop: 'var(--space-2)' }}>
            <div className="section-heading">
              <div>
                <h4>连带附加收费规则（胶片、造影剂、耗材）</h4>
                <p>以“业务场景向导”引导维护：胶片（按部位倍增）、造影剂（单次固定）、穿刺或特殊服务等。</p>
              </div>
              <Button size="sm" onClick={() => onAttachment()}><Icon name="add" />新增收费规则</Button>
            </div>
            {!value.examination.attachments.length ? (
              <EmptyState icon="clinical" title="暂无附加收费规则" copy="可配置胶片耗材（按部位倍增）或造影推注费（单次固定）等。" />
            ) : (
              <ClinicalDataTable
                headers={['连带项目', '触发场景条件', '数量计算依据', '约束属性', '状态', '操作']}
                colWidths={['28%', '20%', '22%', '16%', '7%', '7%']}
                rows={value.examination.attachments.map((row) => [
                  <div>
                    <strong style={{ display: 'block' } as CSSProperties} className="clinical-content-10">{row.attachmentItemName}</strong>
                    <code  className="clinical-content-11">{row.attachmentItemCode}</code>
                  </div>,
                  <span className="clinical-tag-pill clinical-tag-pill--primary">{attachmentTriggerLabel(row.triggerType)}</span>,
                  <span  className="clinical-content-12">{`${attachmentQuantityLabel(row.quantityBasis)} × ${row.quantity}`}</span>,
                  <span  className="clinical-content-13">
                    {[row.requiredAttachment && '强制带出', row.separatelyChargeable ? '独立收费行' : '合并计价'].filter(Boolean).join(' · ')}
                  </span>,
                  <State value={row.status} />,
                  <Button size="sm" variant="text" onClick={() => onAttachment(row)}>编辑</Button>,
                ])} />
            )}
          </div>
        )}

        {/* 通用：执行与准备要求 */}
        {tab === 'requirements' && (
          <div className="clinical-requirement-card" style={{ marginTop: 'var(--space-2)' }}>
            <div>
              <span>开立与执行准备说明</span>
              <strong>{laboratory ? value.laboratory!.collectionDescription || '暂未维护采样说明' : value.examination!.preparationDescription || '暂未维护检查准备说明'}</strong>
            </div>
            <div>
              <span>项目配置完整度</span>
              <strong>{profile ? '已建立专业业务配置' : '待初始化配置'}</strong>
            </div>
            <p>执行要求直接用于门诊/住院医生开立时的安全核验与患者指引；计费与分管结果请在右侧沙盒中实时核对验证。</p>
          </div>
        )}
      </div>

      {/* 右栏：即时联动试算沙盒（Live Sandbox） */}
      <div className="clinical-workbench-grid__aside">
        {laboratory ? (
          <LaboratoryTubeSimulator api={api} currentServiceId={value.serviceId} services={services} configuration={value} />
        ) : (
          <ExaminationChargeSimulator api={api} value={value} />
        )}
      </div>
    </div>
  </div>
}

export function LaboratoryProfileInlineEditor({ value, dictionaries, units, onClose, onSave }: {
  value: LaboratoryProfile
  dictionaries: Record<string, DictionaryValue[]>
  units: UnitDefinition[]
  onClose: () => void
  onSave: (input: Omit<LaboratoryProfile, 'serviceId' | 'revision' | 'specimens'>) => void
}) {
  const [form, setForm] = useState({
    laboratoryMethod: value.laboratoryMethod ?? '',
    reportDuration: value.reportDuration?.toString() ?? '',
    reportDurationUnit: value.reportDurationUnit ?? '',
    fastingRequired: value.fastingRequired,
    pointOfCare: value.pointOfCare,
    collectionDescription: value.collectionDescription ?? '',
  })

  return (
    <div className="clinical-inline-profile-editor">
      <div className="clinical-inline-profile-editor__header">
        <div>
          <h4>检验项目核心属性与报告要求</h4>
          <span  className="clinical-content-14">
            原地维护检验方法、报告时效与执行属性，保存后即刻更新
          </span>
        </div>
        <Button size="sm" variant="text" onClick={onClose} type="button">
          <Icon name="close" /> 收起
        </Button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSave({
            ...form,
            laboratoryMethod: form.laboratoryMethod || undefined,
            reportDuration: form.reportDuration ? Number(form.reportDuration) : undefined,
            reportDurationUnit: form.reportDurationUnit || undefined,
            collectionDescription: form.collectionDescription || undefined,
          })
        }}
      >
        <div className="clinical-inline-profile-editor__grid">
          <FormField label="检验方法">
            <Select
              value={form.laboratoryMethod}
              onChange={(v) => setForm({ ...form, laboratoryMethod: v })}
              placeholder="选择检验方法"
              options={(dictionaries.BD_LAB_METHOD ?? []).map((v) => ({
                value: v.code,
                label: v.name,
                secondaryText: v.code,
              }))}
            />
          </FormField>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
            <FormField label="报告出具时长">
              <input
                type="number"
                min="0.001"
                step="0.001"
                placeholder="例如 2"
                value={form.reportDuration}
                onChange={(e) => setForm({ ...form, reportDuration: e.target.value })}
              />
            </FormField>
            <FormField label="时长单位">
              <Select
                value={form.reportDurationUnit}
                onChange={(v) => setForm({ ...form, reportDurationUnit: v })}
                placeholder="选择单位"
                options={units.filter((v) => v.dimension === 'TIME' && v.status === 'ACTIVE').map(unitOption)}
              />
            </FormField>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', paddingTop: 'var(--space-2)' }}>
            <Check
              label="要求患者空腹"
              checked={form.fastingRequired}
              onChange={(v) => setForm({ ...form, fastingRequired: v })}
            />
            <Check
              label="院内快速检验 (POCT)"
              checked={form.pointOfCare}
              onChange={(v) => setForm({ ...form, pointOfCare: v })}
            />
          </div>

          <div style={{ alignSelf: 'center' } as CSSProperties} className="clinical-content-15">
            {form.fastingRequired && <span className="clinical-tag-pill clinical-tag-pill--primary" style={{ marginRight: '0.5rem' }}>空腹项目：医嘱端提示饮食禁忌</span>}
            {form.pointOfCare && <span className="clinical-tag-pill clinical-tag-pill--purple">POCT即时检验：床旁快速出结果</span>}
          </div>

          <FormField label="标本采集与临床执行说明" className="span-2">
            <textarea
              rows={2}
              placeholder="说明标本采集前准备、送检时限、特殊保存条件或临床禁忌…"
              value={form.collectionDescription}
              onChange={(e) => setForm({ ...form, collectionDescription: e.target.value })}
            />
          </FormField>
        </div>

        <div className="clinical-inline-profile-editor__actions">
          <Button variant="secondary" onClick={onClose} type="button">取消</Button>
          <Button type="submit">保存配置</Button>
        </div>
      </form>
    </div>
  )
}

export function ExaminationProfileInlineEditor({
  value,
  dictionaries,
  services,
  currentServiceId,
  onClose,
  onSave,
}: {
  value: NonNullable<ClinicalConfiguration['examination']>
  dictionaries: Record<string, DictionaryValue[]>
  services: ServiceCatalogItem[]
  currentServiceId: string
  onClose: () => void
  onSave: (input: ExaminationProfileInput) => void
}) {
  const [form, setForm] = useState(() => examinationProfileForm(value))
  const [validationError, setValidationError] = useState('')

  const itemOptions = services
    .filter((v) => v.id !== currentServiceId && v.chargeable && v.sdStatus === 'ACTIVE')
    .map((v) => ({ value: v.id, label: v.name, secondaryText: v.code }))

  const pricingMode = form.bodySiteRequired && form.multiBodySite ? form.sitePricingMode : 'SINGLE'

  const PRICING_MODES = [
    {
      mode: 'SINGLE' as const,
      title: '主项单次计费',
      desc: '无论选几个部位，均按项目基准价收取一次',
    },
    {
      mode: 'PER_SITE' as const,
      title: '按部位数计主项',
      desc: '主项基准价 × 部位数，每个部位全额独立计收',
    },
    {
      mode: 'BASE_PLUS_FIXED' as const,
      title: '基础部位 + 固定加收',
      desc: '含首批部位，超出部位每部位固定加收金额',
    },
    {
      mode: 'BASE_PLUS_ITEM' as const,
      title: '基础部位 + 加收项目',
      desc: '含首批部位，超出部位自动带出指定收费项目',
    },
  ]

  const ruleSummaryText = useMemo(() => {
    try { examinationProfileInput(form) }
    catch (error) { return `配置尚未完整：${errorMessage(error)}` }
    if (!form.bodySiteRequired) {
      return '开立时无需限定具体解剖部位，按主项目单次全额计收。'
    }
    if (!form.multiBodySite) {
      return '必须且仅允许选择 1 个解剖部位，按主项目单次基准价收取。'
    }
    switch (form.sitePricingMode) {
      case 'SINGLE':
        return `允许多选部位（${form.maxBodySiteCount ? `最多可选 ${form.maxBodySiteCount} 个` : '未设置部位上限'}），但主项目基准费只计收 1 次。`
      case 'PER_SITE':
        return `主项目按实际选择部位全额计费（${form.maxBodySiteCount ? `最多 ${form.maxBodySiteCount} 个` : '未设置部位上限'}），总价 = 主项单价 × 部位数。`
      case 'BASE_PLUS_FIXED':
        return `包含前 ${form.includedSiteCount} 个部位（按主项原价）；超出部位每部位固定加收 ¥${form.additionalSitePrice}${form.maxChargeableSiteCount ? `，累计最多计费 ${form.maxChargeableSiteCount} 个部位` : ''}。`
      case 'BASE_PLUS_ITEM': {
        const item = services.find((s) => s.id === form.additionalSiteItemId)
        return `包含前 ${form.includedSiteCount} 个部位；超出部位每部位加收【${item ? item.name : '加收项目'}】× ${form.additionalSiteQuantity}${form.maxChargeableSiteCount ? `，累计最多计费 ${form.maxChargeableSiteCount} 个部位` : ''}。`
      }
      default:
        return ''
    }
  }, [form, services])

  return (
    <div className="clinical-inline-profile-editor">
      <div className="clinical-inline-profile-editor__header">
        <div>
          <h4>检查项目执行属性与多部位阶梯计价规则</h4>
          <span  className="clinical-content-16">
            维护检查类型、部位选择约束与超部位计价规则；保存成功后，右侧试算按已保存配置更新。
          </span>
        </div>
        <Button size="sm" variant="text" onClick={onClose} type="button">
          <Icon name="close" /> 收起
        </Button>
      </div>

      {validationError && <Alert duration={null}>{validationError}</Alert>}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setValidationError('')
          try { onSave(examinationProfileInput(form)) }
          catch (error) { setValidationError(errorMessage(error)) }
        }}
      >
        <div className="clinical-inline-profile-editor__grid">
          <FormField label="检查类型">
            <Select
              value={form.examinationType}
              onChange={(v) => setForm({ ...form, examinationType: v })}
              placeholder="选择检查类型"
              options={(dictionaries.BD_EXAM_TYPE ?? []).map((v) => ({
                value: v.code,
                label: v.name,
                secondaryText: v.code,
              }))}
            />
          </FormField>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
            <FormField label="最多可选部位数">
              <input
                type="number"
                min="1"
                disabled={!form.bodySiteRequired || !form.multiBodySite}
                value={form.maxBodySiteCount}
                onChange={(e) => setForm({ ...form, maxBodySiteCount: e.target.value })}
              />
            </FormField>
            <FormField label="最大计费部位数">
              <input
                type="number"
                min={form.includedSiteCount || 1}
                max={form.maxBodySiteCount}
                disabled={!form.bodySiteRequired || !form.multiBodySite}
                value={form.maxChargeableSiteCount}
                onChange={(e) => setForm({ ...form, maxChargeableSiteCount: e.target.value })}
              />
            </FormField>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', paddingTop: 'var(--space-1)' }}>
            <Check
              label="申请时必须选择检查部位"
              checked={form.bodySiteRequired}
              onChange={(v) => {
                setForm({
                  ...form,
                  bodySiteRequired: v,
                  multiBodySite: v ? form.multiBodySite : false,
                })
              }}
            />
            <Check
              label="允许多部位同时勾选"
              disabled={!form.bodySiteRequired}
              checked={form.multiBodySite}
              onChange={(v) => setForm({ ...form, multiBodySite: v })}
            />
          </div>

          <div style={{ alignSelf: 'center' } as CSSProperties} className="clinical-content-17">
            {!form.bodySiteRequired ? (
              <span className="clinical-tag-pill">无部位约束</span>
            ) : form.multiBodySite ? (
              <span className="clinical-tag-pill clinical-tag-pill--primary">支持多部位 · 启用阶梯计价矩阵</span>
            ) : (
              <span className="clinical-tag-pill clinical-tag-pill--purple">单部位开立</span>
            )}
          </div>

          {form.bodySiteRequired && form.multiBodySite && (
            <>
              <div className="pricing-mode-cards">
                {PRICING_MODES.map((item) => {
                  const isActive = form.sitePricingMode === item.mode
                  return (
                    <Button
                      key={item.mode}
                      type="button"
                      className={`pricing-mode-card${isActive ? ' is-active' : ''}`}
                      onClick={() => setForm({ ...form, sitePricingMode: item.mode })} variant="text" size="sm"
                    >
                      <span className="pricing-mode-card__title">
                        {isActive ? '✓ ' : ''}{item.title}
                      </span>
                      <span className="pricing-mode-card__desc">{item.desc}</span>
                    </Button>
                  )
                })}
              </div>

              <FormField label="主项价格包含部位数" required>
                <input
                  type="number"
                  min="1"
                  value={form.includedSiteCount}
                  onChange={(e) => setForm({ ...form, includedSiteCount: e.target.value })}
                />
              </FormField>

              {pricingMode === 'BASE_PLUS_FIXED' && (
                <FormField label="每超出部位加收金额 (元)" required>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="例如 80.00"
                    value={form.additionalSitePrice}
                    onChange={(e) => setForm({ ...form, additionalSitePrice: e.target.value })}
                  />
                </FormField>
              )}

              {pricingMode === 'BASE_PLUS_ITEM' && (
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-2)' }}>
                  <FormField label="多部位加收项目" required>
                    <Select
                      value={form.additionalSiteItemId}
                      onChange={(v) => setForm({ ...form, additionalSiteItemId: v })}
                      placeholder="选择加收收费项"
                      options={itemOptions}
                    />
                  </FormField>
                  <FormField label="每超出部位加收数量">
                    <input
                      type="number"
                      min="0.0001"
                      step="any"
                      value={form.additionalSiteQuantity}
                      onChange={(e) => setForm({ ...form, additionalSiteQuantity: e.target.value })}
                    />
                  </FormField>
                </div>
              )}
            </>
          )}

          <div className="clinical-inline-profile-editor__rule-callout">
            <Icon name="clinical" />
            <span><strong>计费策略规则：</strong>{ruleSummaryText}</span>
          </div>

          <FormField label="检查前准备与患者须知" className="span-2">
            <textarea
              rows={2}
              placeholder="说明检查前是否需要禁食禁水、憋尿、摘除金属饰品或停用特殊药物…"
              value={form.preparationDescription}
              onChange={(e) => setForm({ ...form, preparationDescription: e.target.value })}
            />
          </FormField>
        </div>

        <div className="clinical-inline-profile-editor__actions">
          <Button variant="secondary" onClick={onClose} type="button">取消</Button>
          <Button type="submit">保存配置</Button>
        </div>
      </form>
    </div>
  )
}

export function LaboratoryProfileDialog({ value, dictionaries, units, onClose, onSave }: { value: LaboratoryProfile; dictionaries: Record<string, DictionaryValue[]>; units: UnitDefinition[]; onClose: () => void; onSave: (input: Omit<LaboratoryProfile, 'serviceId' | 'revision' | 'specimens'>) => Promise<void> }) {
  const [form, setForm] = useState({ laboratoryMethod: value.laboratoryMethod ?? '', reportDuration: value.reportDuration?.toString() ?? '', reportDurationUnit: value.reportDurationUnit ?? '', fastingRequired: value.fastingRequired, pointOfCare: value.pointOfCare, collectionDescription: value.collectionDescription ?? '' })
  return <FormDialog title="编辑检验项目配置" description="维护检验方法、报告时长与采集要求。" onClose={onClose} onSubmit={(e) => { e.preventDefault(); return onSave({ ...form, laboratoryMethod: form.laboratoryMethod || undefined, reportDuration: form.reportDuration ? Number(form.reportDuration) : undefined, reportDurationUnit: form.reportDurationUnit || undefined, collectionDescription: form.collectionDescription || undefined }) }}>
    <FormField label="检验方法"><Select value={form.laboratoryMethod} onChange={(v) => setForm({ ...form, laboratoryMethod: v })} placeholder="选择检验方法" options={(dictionaries.BD_LAB_METHOD ?? []).map((v) => ({ value: v.code, label: v.name, secondaryText: v.code }))} /></FormField>
    <FormField label="报告时长"><input type="number" min="0.001" step="0.001" value={form.reportDuration} onChange={(e) => setForm({ ...form, reportDuration: e.target.value })} /></FormField>
    <FormField label="时长单位"><Select value={form.reportDurationUnit} onChange={(v) => setForm({ ...form, reportDurationUnit: v })} options={units.filter((v) => v.dimension === 'TIME' && v.status === 'ACTIVE').map(unitOption)} /></FormField>
    <FormField label="采集说明" className="span-2"><textarea value={form.collectionDescription} onChange={(e) => setForm({ ...form, collectionDescription: e.target.value })} /></FormField>
    <Check label="要求空腹" checked={form.fastingRequired} onChange={(v) => setForm({ ...form, fastingRequired: v })} /><Check label="院内快速检测（POCT）" checked={form.pointOfCare} onChange={(v) => setForm({ ...form, pointOfCare: v })} />
  </FormDialog>
}

export function ExaminationProfileDialog({ value, dictionaries, services, currentServiceId, onClose, onSave }: {
  value: NonNullable<ClinicalConfiguration['examination']>; dictionaries: Record<string, DictionaryValue[]>
  services: ServiceCatalogItem[]; currentServiceId: string; onClose: () => void
  onSave: (input: ExaminationProfileInput) => Promise<void>
}) {
  const [form, setForm] = useState(() => examinationProfileForm(value))

  const itemOptions = services.filter((v) => v.id !== currentServiceId && v.chargeable && v.sdStatus === 'ACTIVE')
    .map((v) => ({ value: v.id, label: v.name, secondaryText: v.code }))
  const pricingMode = form.bodySiteRequired && form.multiBodySite ? form.sitePricingMode : 'SINGLE'
  return <FormDialog title="编辑检查项目配置" description="维护检查类型、部位约束和多部位计价规则。" onClose={onClose} onSubmit={(e) => { e.preventDefault(); return onSave(examinationProfileInput(form)) }}>
    <FormField label="检查类型"><Select value={form.examinationType} onChange={(v) => setForm({ ...form, examinationType: v })} options={(dictionaries.BD_EXAM_TYPE ?? []).map((v) => ({ value: v.code, label: v.name, secondaryText: v.code }))} /></FormField>
    <FormField label="最多部位数"><input type="number" min="1" disabled={!form.bodySiteRequired} value={form.maxBodySiteCount} onChange={(e) => setForm({ ...form, maxBodySiteCount: e.target.value })} /></FormField>
    <FormField label="多部位计价"><Select disabled={!form.multiBodySite} value={pricingMode} onChange={(v) => setForm({ ...form, sitePricingMode: v as typeof form.sitePricingMode })} options={[
      { value: 'SINGLE', label: '主项目只计一次' }, { value: 'PER_SITE', label: '主项目按部位数量计费' },
      { value: 'BASE_PLUS_FIXED', label: '基础部位 + 固定金额' }, { value: 'BASE_PLUS_ITEM', label: '基础部位 + 加收项目' },
    ]} /></FormField>
    <FormField label="价格包含部位数"><input type="number" min="1" disabled={!form.multiBodySite} value={form.includedSiteCount} onChange={(e) => setForm({ ...form, includedSiteCount: e.target.value })} /></FormField>
    {pricingMode === 'BASE_PLUS_FIXED' && <FormField label="每超出部位加收金额" required><input type="number" min="0" step="0.01" value={form.additionalSitePrice} onChange={(e) => setForm({ ...form, additionalSitePrice: e.target.value })} /></FormField>}
    {pricingMode === 'BASE_PLUS_ITEM' && <FormField label="多部位加收项目" required><Select value={form.additionalSiteItemId} onChange={(v) => setForm({ ...form, additionalSiteItemId: v })} options={itemOptions} /></FormField>}
    {pricingMode === 'BASE_PLUS_ITEM' && <FormField label="每超出部位加收数量"><input type="number" min="0.0001" step="any" value={form.additionalSiteQuantity} onChange={(e) => setForm({ ...form, additionalSiteQuantity: e.target.value })} /></FormField>}
    {form.multiBodySite && <FormField label="最大计费部位数"><input type="number" min={form.includedSiteCount || 1} max={form.maxBodySiteCount} value={form.maxChargeableSiteCount} onChange={(e) => setForm({ ...form, maxChargeableSiteCount: e.target.value })} /></FormField>}
    <FormField label="检查前准备" className="span-2"><textarea value={form.preparationDescription} onChange={(e) => setForm({ ...form, preparationDescription: e.target.value })} /></FormField>
    <Check label="申请时必须选择检查部位" checked={form.bodySiteRequired} onChange={(v) => setForm({ ...form, bodySiteRequired: v })} /><Check label="允许多部位" checked={form.multiBodySite} onChange={(v) => setForm({ ...form, multiBodySite: v })} />
  </FormDialog>
}
