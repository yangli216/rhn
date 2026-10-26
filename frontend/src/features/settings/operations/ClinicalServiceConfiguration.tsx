import { DiagnosticTemplateDialog } from './DiagnosticTemplateDialog'
import type { CSSProperties } from 'react'
import { requireClinicalConfiguration } from "../clinicalConfigurationTruth";
import { examinationProfileForm, examinationProfileInput } from "../examinationProfileForm";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ClinicalConfiguration, DictionaryValue, ExaminationProfileInput, ExaminationVariantConfiguration, ExaminationAttachmentConfiguration, LaboratoryProfile, RhnApi, ServiceCatalogItem, SpecimenConfiguration, UnitDefinition } from "../../../shared/rhnApi";
import { errorMessage } from "../../../shared/rhnApi";
import { Alert, Button, Dialog, EmptyState, FormField, Icon, LoadingState, Select, StatusBadge } from "../../../shared/ui";
import { requireOperationalRows, sitePricingLabel, siteConstraintLabel, ClinicalDataTable, tubeDotColor, tubeRuleLabel, State, sitePricingDetail, attachmentTriggerLabel, attachmentQuantityLabel, unitOption, Check, FormDialog, priceTierRange } from './operationalShared'
import { SpecimenDialog } from './SpecimenConfigurationDialog'
import { VariantDialog, AttachmentDialog, PriceTierDialog } from './ExaminationRules'
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
  const configuration = useQuery({
    queryKey: ['master-data-clinical-configuration', service.id],
    queryFn: async () => requireClinicalConfiguration(await api.masterData.clinicalConfiguration(service.id), service),
  })
  const services = useQuery({
    queryKey: ['master-data-services-project-configuration', organizationId],
    queryFn: () => api.masterData.services('', '', '', organizationId),
  })
  const units = useQuery({ queryKey: ['master-data-operational-units'], queryFn: () => api.masterData.units() })
  const bodySites = useQuery({
    queryKey: ['terminology-body-sites'], enabled: service.sdServiceType === 'EXAMINATION',
    queryFn: () => api.masterData.bodySites(),
  })
  const invalidate = async (message: string) => {
    setDialog(undefined); setFeedback(message); setOperationError('')
    await client.invalidateQueries({ queryKey: ['master-data-clinical-configuration', service.id] })
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
    : '维护医生可选的检查部位、计价规则、附加收费和检查准备；开单与计费都按这里已保存的配置执行。'

  if (dialog) return <>{dialog}</>
  return <Dialog title={`${service.name} · 执行与收费`} eyebrow="诊疗项目 · 执行与收费" size="xwide"
    className="clinical-project-dialog" onClose={onClose}
    description={description}
    footer={<><Button variant="secondary" onClick={onClose}>关闭</Button>{supportedType && <Button variant="secondary"
      onClick={() => setDialog(<DiagnosticTemplateDialog api={api} service={service} organizationId={organizationId} onClose={() => setDialog(undefined)} />)}>报告模板与规则</Button>}</>}>
    {feedback && <Alert tone="success">{feedback}</Alert>}
    {operationError && <Alert>{operationError}</Alert>}
    {(configuration.error || services.error || units.error) && <Alert>
      {errorMessage(configuration.error || services.error || units.error)}
    </Alert>}
    {configuration.isError || services.isError || units.isError
      ? <EmptyState icon="clinical" title="执行与收费配置不可用" copy="数据加载失败或配置不完整，请刷新重试；确认配置前无法编辑或试算。"
          action={<Button variant="secondary" onClick={() => { void configuration.refetch(); void services.refetch(); void units.refetch() }}>重新加载配置</Button>} />
      : configuration.isPending || services.isPending || units.isPending
        ? <LoadingState label="正在加载项目执行与收费配置…" />
        : !supportedType ? <Alert>当前项目类型不支持检验检查业务配置。</Alert>
          : value && <ClinicalWorkspace api={api} organizationId={organizationId} value={value} serviceStatus={service.sdStatus} serviceStatusText={service.sdStatusText} services={allServices} dictionaries={dictionaries}
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
          onPriceTiers={() => setDialog(<PriceTierDialog tiers={value.examination!.priceTiers} services={allServices}
            onClose={() => setDialog(undefined)} onSave={(tiers) => saveProfile('阶梯计价档位已保存',
              api.masterData.replaceExaminationPriceTiers(service.id, value.examination!.revision, tiers))} />)}
          onVariant={(row) => setDialog(<VariantDialog value={row} dictionaries={dictionaries} bodySites={bodySites.data ?? []}
            onClose={() => setDialog(undefined)} onSave={(input) => execute(row ? '检查部位或方式已更新' : '检查部位或方式已新增', row
              ? api.masterData.updateExaminationVariant(service.id, row, input)
              : api.masterData.createExaminationVariant(service.id, input))} />)}
        onAttachment={(row) => setDialog(<AttachmentDialog value={row} services={allServices}
          currentServiceId={service.id} onClose={() => setDialog(undefined)}
          onSave={(input) => execute(row ? '附加收费规则已更新' : '附加收费规则已新增', row
            ? api.masterData.updateExaminationAttachment(service.id, row, input)
            : api.masterData.createExaminationAttachment(service.id, input))} />)} />}
  </Dialog>
}

export function ClinicalWorkspace({ api, organizationId, value, serviceStatus, serviceStatusText, services, dictionaries, unitCodes, onEditProfile, onSaveLaboratoryProfile, onSaveExaminationProfile, onSpecimen, onPriceTiers, onVariant, onAttachment }: {
  api: RhnApi; organizationId?: string; value: ClinicalConfiguration; serviceStatus: string; serviceStatusText?: string; services: ServiceCatalogItem[]
  dictionaries: Record<string, DictionaryValue[]>; unitCodes: UnitDefinition[]
  onEditProfile?: () => void
  onSaveLaboratoryProfile?: (input: Omit<LaboratoryProfile, 'serviceId' | 'revision' | 'specimens'>) => Promise<void>
  onSaveExaminationProfile?: (input: ExaminationProfileInput) => Promise<void>
  onSpecimen: (value?: SpecimenConfiguration) => void
  onPriceTiers?: () => void
  onVariant: (value?: ExaminationVariantConfiguration) => void
  onAttachment: (value?: ExaminationAttachmentConfiguration) => void
}) {
  void unitCodes
  const laboratory = value.serviceType === 'LABORATORY'
  const [tab, setTab] = useState<'options' | 'requirements' | 'attachments' | 'simulator'>('options')
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
    ? ([['options', '标本容器与分管加收'], ['requirements', '报告与执行要求'], ['simulator', '规则试算']] as const)
    : ([['options', '部位与计价'], ['attachments', `附加收费（${value.examination?.attachments.length ?? 0}）`],
      ['requirements', '检查准备'], ['simulator', '收费试算']] as const)
  const exam = value.examination
  const examAttribute = exam?.examinationTechnique
    ? ['超声方式', EXAM_TECHNIQUE_OPTIONS.find((item) => item.value === exam.examinationTechnique)?.label]
    : exam?.contrastPhase ? ['增强方式', CONTRAST_PHASE_OPTIONS.find((item) => item.value === exam.contrastPhase)?.label] : undefined

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
          <span className="clinical-fact-pill">检查类型 <strong>{dictionaryName('BD_EXAM_TYPE', exam?.examinationType)}</strong></span>
          {examAttribute && <span className="clinical-fact-pill">{examAttribute[0]} <strong>{examAttribute[1]}</strong></span>}
          <span className="clinical-fact-pill">部位 <strong>{siteConstraintLabel(exam!)}</strong></span>
          <span className="clinical-fact-pill">计价 <strong>{sitePricingLabel(exam!)}</strong></span>
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

    {/* 配置内容按页签切换，整行展示 */}
    <div className="clinical-workbench-grid clinical-workbench-grid--stacked" style={{ marginTop: 'var(--space-3)' }}>
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

        {/* 检查：计价规则与允许部位 */}
        {!laboratory && tab === 'options' && exam && <>
          <ExaminationPricingCard value={exam} onPriceTiers={onPriceTiers} onEditPricing={() => setEditingProfile(true)} />
          <ExaminationVariantSection value={exam} methodName={(code) => dictionaryName('BD_SERVICE_VARIANT_METHOD', code)}
            onVariant={onVariant} />
        </>}

        {/* 检查：附加收费 */}
        {!laboratory && tab === 'attachments' && exam && (
          <div className="clinical-configuration__section">
            <div className="section-heading">
              <div>
                <h4>附加收费</h4>
                <p>随检查带出的其他收费项，如胶片、造影剂、设备加收；按触发条件和数量依据计算。</p>
              </div>
              <Button size="sm" onClick={() => onAttachment()}><Icon name="add" />新增附加收费</Button>
            </div>
            {!exam.attachments.length ? (
              <EmptyState icon="clinical" title="暂无附加收费" copy="检查本身的收费已由计价规则决定；只有需要另收的胶片、耗材或加收项才在这里配置。" />
            ) : (
              <ClinicalDataTable
                fixed
                headers={['收费项目', '带出规则', '医生可否取消', '状态', '操作']}
                colWidths={['32%', '30%', '16%', '11%', '11%']}
                rows={exam.attachments.map((row) => [
                  <div className="exam-cell-title exam-cell-title--stack">
                    <strong title={row.attachmentItemName}>{row.attachmentItemName}</strong>
                    <code>{row.attachmentItemCode}</code>
                  </div>,
                  `${attachmentTriggerLabel(row.triggerType)} · ${attachmentQuantityLabel(row.quantityBasis)} × ${row.quantity}`,
                  `${row.requiredAttachment ? '不可取消' : '可取消'}${row.separatelyChargeable ? '' : ' · 不单独收费'}`,
                  <State value={row.status} />,
                  <Button size="sm" variant="text" onClick={() => onAttachment(row)}>编辑</Button>,
                ])} />
            )}
          </div>
        )}

        {/* 试算沙盒：独立页签，按已保存配置计算 */}
        {tab === 'simulator' && (laboratory
          ? <LaboratoryTubeSimulator api={api} currentServiceId={value.serviceId} services={services} configuration={value} />
          : <ExaminationChargeSimulator api={api} value={value} organizationId={organizationId} />)}

        {/* 检验：报告与执行要求；检查：检查准备 */}
        {tab === 'requirements' && (laboratory ? (
          <div className="clinical-requirement-card">
            <div>
              <span>采样与执行说明</span>
              <strong>{value.laboratory!.collectionDescription || '暂未维护采样说明'}</strong>
            </div>
            <div>
              <span>项目配置完整度</span>
              <strong>{profile ? '已建立专业业务配置' : '待初始化配置'}</strong>
            </div>
          </div>
        ) : (
          <div className="clinical-configuration__section">
            <div className="section-heading">
              <div>
                <h4>检查准备</h4>
                <p>医生开单时提示给患者，并打印在检查申请单上。</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setEditingProfile(true)}>编辑</Button>
            </div>
            <p className="exam-preparation-text">{exam?.preparationDescription || '暂未维护检查准备说明。'}</p>
          </div>
        ))}
      </div>

    </div>
  </div>
}

/** 计价规则：阶梯档位逐档列出，其他模式写明主收费与超出部位的收法；未配置完整时直接提示开单后果。 */
function ExaminationPricingCard({ value, onPriceTiers, onEditPricing }: {
  value: NonNullable<ClinicalConfiguration['examination']>; onPriceTiers?: () => void; onEditPricing: () => void
}) {
  const tiered = value.sitePricingMode === 'TIERED_ITEM'
  const multiSite = value.bodySiteRequired && value.multiBodySite
  const baseCharge = value.baseChargeItemId
    ? `${value.baseChargeItemName ?? '主收费物价项'}（${value.baseChargeItemCode ?? value.baseChargeItemId}）`
    : '本项目自身'
  return <section className="exam-pricing" aria-label="计价规则">
    <header className="exam-pricing__head">
      <div>
        <h4>计价规则 · {sitePricingLabel(value)}</h4>
        <p>{tiered ? '按计费部位数命中一档，收该档物价项；检查项目本身不收费。' : `主收费：${baseCharge}`}</p>
      </div>
      <div className="row-actions">
        {tiered && onPriceTiers && <Button size="sm" variant="secondary" onClick={onPriceTiers}>维护档位</Button>}
        <Button size="sm" variant="secondary" onClick={onEditPricing}>修改计价方式</Button>
      </div>
    </header>
    {tiered ? (value.priceTiers.length ? <ol className="exam-tier-list">
      {value.priceTiers.map((tier) => <li key={tier.id}>
        <span className="exam-tier-list__range">{priceTierRange(tier)}</span>
        <strong>{tier.chargeItemName}</strong>
        <code>{tier.chargeItemCode}</code>
        <span className="exam-tier-list__qty">× {tier.chargeQuantity}</span>
      </li>)}
    </ol> : <Alert tone="warning" duration={null}>尚未维护计价档位，医生开立该检查时将无法计费。</Alert>)
      : <p className="exam-pricing__rule">{multiSite ? sitePricingDetail(value) : '只允许选择 1 个部位，按主收费收 1 次。'}
        {multiSite && value.maxChargeableSiteCount ? `；最多按 ${value.maxChargeableSiteCount} 个部位计费` : ''}</p>}
  </section>
}

/** 允许部位：计费部位数决定命中哪一档；未对应标准部位的选项 AI 无法自动预填，单独提示。 */
function ExaminationVariantSection({ value, methodName, onVariant }: {
  value: NonNullable<ClinicalConfiguration['examination']>; methodName: (code?: string) => string
  onVariant: (value?: ExaminationVariantConfiguration) => void
}) {
  const unmapped = value.variants.filter((row) => row.status === 'ACTIVE' && !row.bodySiteConceptId).length
  return <div className="clinical-configuration__section">
    <div className="section-heading">
      <div>
        <h4>允许部位（{value.variants.length}）</h4>
        <p>医生开单时可选；“计费部位数”用于判断命中哪一档或超出几个部位。</p>
      </div>
      <Button size="sm" onClick={() => onVariant()}><Icon name="add" />新增部位</Button>
    </div>
    {unmapped > 0 && <p className="exam-section-hint">{unmapped} 个启用部位未对应标准部位，AI 推荐检查时无法自动预填这些部位。</p>}
    {!value.variants.length ? (
      <EmptyState icon="clinical" title="暂未配置允许部位" copy={value.bodySiteRequired ? '该检查要求选择部位，未配置部位前医生无法开立。' : '如需让医生选择部位，请新增部位。'} />
    ) : (
      <ClinicalDataTable
        fixed
        headers={['部位', '标准部位', '计费部位数', '检查方式', '状态', '操作']}
        colWidths={['30%', '18%', '13%', '15%', '12%', '12%']}
        rows={value.variants.map((row) => [
          <div className="exam-cell-title">
            <strong title={row.name}>{row.name}</strong>
            <code>{row.code}</code>
          </div>,
          row.bodySiteName ? <span title={row.bodySiteCode}>{row.bodySiteName}</span>
            : <span className="clinical-tag-pill clinical-tag-pill--warning">未对应</span>,
          row.chargeableSiteUnits === 0 ? <span className="muted">不计入</span> : row.chargeableSiteUnits,
          methodName(row.methodType),
          <State value={row.status} />,
          <Button size="sm" variant="text" onClick={() => onVariant(row)}>编辑</Button>,
        ])} />
    )}
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

const EXAM_TECHNIQUE_OPTIONS = [{ value: '', label: '不区分' }, { value: 'COLOR_DOPPLER', label: '彩色多普勒（彩超）' },
  { value: 'B_MODE', label: '常规 B 超' }]
const CONTRAST_PHASE_OPTIONS = [{ value: '', label: '不区分' }, { value: 'PLAIN', label: '平扫' },
  { value: 'ENHANCED', label: '增强' }, { value: 'PLAIN_ENHANCED', label: '平扫加增强' }]

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
    {
      mode: 'TIERED_ITEM' as const,
      title: '按部位数阶梯计价',
      desc: '按计费部位数命中档位，收对应物价项（如一个部位 / ≥二个部位）',
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
      case 'TIERED_ITEM':
        return `按计费部位数命中阶梯档位收费（当前 ${value.priceTiers.length} 档），档位在“维护阶梯档位”中整组保存${form.maxChargeableSiteCount ? `；计费部位数最多按 ${form.maxChargeableSiteCount} 个计` : ''}。`
      default:
        return ''
    }
  }, [form, services, value.priceTiers.length])

  return (
    <div className="clinical-inline-profile-editor">
      <div className="clinical-inline-profile-editor__header">
        <div>
          <h4>基本配置与计价方式</h4>
          <span  className="clinical-content-16">
            检查类型、部位约束与计价方式；保存后右侧试算按新配置计算。
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

              {['BASE_PLUS_FIXED', 'BASE_PLUS_ITEM'].includes(pricingMode) && <FormField label="主收费包含部位数" required>
                <input
                  type="number"
                  min="1"
                  value={form.includedSiteCount}
                  onChange={(e) => setForm({ ...form, includedSiteCount: e.target.value })}
                />
              </FormField>}

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

          {form.examinationType === 'ULTRASOUND' && (
            <FormField label="超声方式" hint="彩超与 B 超建成两个开立项目时区分，AI 据此定位开立项目">
              <Select value={form.examinationTechnique} onChange={(v) => setForm({ ...form, examinationTechnique: v })}
                options={EXAM_TECHNIQUE_OPTIONS} />
            </FormField>
          )}
          {['CT', 'MRI'].includes(form.examinationType) && (
            <FormField label="增强方式" hint="平扫、增强、平扫加增强分别建开立项目时区分，AI 据此定位开立项目">
              <Select value={form.contrastPhase} onChange={(v) => setForm({ ...form, contrastPhase: v })}
                options={CONTRAST_PHASE_OPTIONS} />
            </FormField>
          )}

          {pricingMode !== 'TIERED_ITEM' && (
            <FormField label="主收费物价项" hint="检查项目本身不收费时选择实际收费的物价项；留空则收检查项目自身">
              <Select value={form.baseChargeItemId} onChange={(v) => setForm({ ...form, baseChargeItemId: v })}
                placeholder="收检查项目自身" options={[{ value: '', label: '收检查项目自身' }, ...itemOptions]} />
            </FormField>
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
      { value: 'TIERED_ITEM', label: '按部位数阶梯计价' },
    ]} /></FormField>
    {form.examinationType === 'ULTRASOUND' && <FormField label="超声方式"><Select value={form.examinationTechnique} onChange={(v) => setForm({ ...form, examinationTechnique: v })} options={EXAM_TECHNIQUE_OPTIONS} /></FormField>}
    {['CT', 'MRI'].includes(form.examinationType) && <FormField label="增强方式"><Select value={form.contrastPhase} onChange={(v) => setForm({ ...form, contrastPhase: v })} options={CONTRAST_PHASE_OPTIONS} /></FormField>}
    {pricingMode !== 'TIERED_ITEM' && <FormField label="主收费物价项"><Select value={form.baseChargeItemId} onChange={(v) => setForm({ ...form, baseChargeItemId: v })} placeholder="收检查项目自身" options={[{ value: '', label: '收检查项目自身' }, ...itemOptions]} /></FormField>}
    <FormField label="价格包含部位数"><input type="number" min="1" disabled={!form.multiBodySite} value={form.includedSiteCount} onChange={(e) => setForm({ ...form, includedSiteCount: e.target.value })} /></FormField>
    {pricingMode === 'BASE_PLUS_FIXED' && <FormField label="每超出部位加收金额" required><input type="number" min="0" step="0.01" value={form.additionalSitePrice} onChange={(e) => setForm({ ...form, additionalSitePrice: e.target.value })} /></FormField>}
    {pricingMode === 'BASE_PLUS_ITEM' && <FormField label="多部位加收项目" required><Select value={form.additionalSiteItemId} onChange={(v) => setForm({ ...form, additionalSiteItemId: v })} options={itemOptions} /></FormField>}
    {pricingMode === 'BASE_PLUS_ITEM' && <FormField label="每超出部位加收数量"><input type="number" min="0.0001" step="any" value={form.additionalSiteQuantity} onChange={(e) => setForm({ ...form, additionalSiteQuantity: e.target.value })} /></FormField>}
    {form.multiBodySite && <FormField label="最大计费部位数"><input type="number" min={form.includedSiteCount || 1} max={form.maxBodySiteCount} value={form.maxChargeableSiteCount} onChange={(e) => setForm({ ...form, maxChargeableSiteCount: e.target.value })} /></FormField>}
    <FormField label="检查前准备" className="span-2"><textarea value={form.preparationDescription} onChange={(e) => setForm({ ...form, preparationDescription: e.target.value })} /></FormField>
    <Check label="申请时必须选择检查部位" checked={form.bodySiteRequired} onChange={(v) => setForm({ ...form, bodySiteRequired: v })} /><Check label="允许多部位" checked={form.multiBodySite} onChange={(v) => setForm({ ...form, multiBodySite: v })} />
  </FormDialog>
}
