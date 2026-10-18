import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { RhnApi } from '../../../shared/rhnApi'
import { errorMessage } from '../../../shared/rhnApi'
import type { ReliefPolicy, ReliefPolicySummary } from '../../../shared/api/reliefApi'
import { reliefStatusTone } from '../../../shared/presentation'
import {
  ActionMenu, Alert, Button, Dialog, EmptyState, FormField, LoadingState, PanelHead, SearchField, Select, StatusBadge, Tabs,
} from '../../../shared/ui'
import { MasterDetailPage } from '../../../shared/ui/templates/PageTemplates'
import { useSystemEnum } from '../../../shared/ui/useSystemEnum'
import {
  ReliefBasicSection, ReliefQualificationSection, ReliefQuotaSection, ReliefRulesSection, ReliefVersionsSection,
  type ReliefEnums,
} from './ReliefPolicyEditor'
import { emptyPolicyForm, formFromPolicy, toDraftInput, type PolicyForm } from './reliefPolicyForm'
import './billing-relief.css'

type EditorTab = 'basic' | 'qualification' | 'rules' | 'quota' | 'versions'
type Feedback = { tone: 'success' | 'error' | 'warning'; text: string } | null
const NEW = '__new__'

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date())
}

function useReliefEnums(api: RhnApi): ReliefEnums {
  const source = api.dictionaries
  return {
    timing: useSystemEnum(source, 'BIL_RELIEF_TIMING'),
    sponsor: useSystemEnum(source, 'BIL_RELIEF_SPONSOR'),
    scene: useSystemEnum(source, 'BIL_SETTLEMENT_SCENE'),
    feeScope: useSystemEnum(source, 'BIL_RELIEF_SCOPE_TYPE'),
    method: useSystemEnum(source, 'BIL_RELIEF_METHOD'),
    source: useSystemEnum(source, 'BIL_RELIEF_QUALIFICATION_SOURCE'),
    failure: useSystemEnum(source, 'BIL_RELIEF_FAILURE_POLICY'),
    quotaPeriod: useSystemEnum(source, 'BIL_RELIEF_QUOTA_PERIOD'),
    chargeSource: useSystemEnum(source, 'BIL_CHARGE_SOURCE_TYPE'),
    qualificationMode: useSystemEnum(source, 'BIL_RELIEF_QUALIFICATION_MODE'),
  }
}

export function ReliefPolicyManagement({ api, canManage }: { api: RhnApi; canManage: boolean }) {
  const queryClient = useQueryClient()
  const enums = useReliefEnums(api)
  const policyStatus = useSystemEnum(api.dictionaries, 'BIL_RELIEF_POLICY_STATUS')
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [pendingSelection, setPendingSelection] = useState<string | null>(null)
  const [tab, setTab] = useState<EditorTab>('basic')
  const [form, setForm] = useState<PolicyForm | null>(null)
  const baseline = useRef('')
  const [errors, setErrors] = useState<string[]>([])
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [confirmRetire, setConfirmRetire] = useState(false)

  const policies = useQuery({ queryKey: ['relief-policies'], queryFn: api.relief.policies })
  const creating = selectedId === NEW
  const detail = useQuery({
    queryKey: ['relief-policy', selectedId],
    queryFn: () => api.relief.policy(selectedId),
    enabled: Boolean(selectedId) && !creating,
  })
  const policy = creating ? undefined : detail.data

  const filtered = useMemo(() => {
    const text = keyword.trim().toLowerCase()
    return (policies.data ?? []).filter((item) => (!status || item.status === status)
      && (!text || item.name.toLowerCase().includes(text) || item.code.toLowerCase().includes(text)))
  }, [policies.data, keyword, status])

  useEffect(() => {
    if (!selectedId && policies.data?.length) setSelectedId(policies.data[0].id)
  }, [policies.data, selectedId])

  // 加载或保存后以服务端结果重置编辑稿；同一版本的重复刷新不覆盖正在编辑的内容。
  const loadedKey = creating ? NEW : policy ? `${policy.id}:${policy.revision}` : ''
  useEffect(() => {
    if (!loadedKey) { setForm(null); return }
    const next = creating ? emptyPolicyForm(today()) : formFromPolicy(policy!, today())
    baseline.current = JSON.stringify(next)
    setForm(next)
    setErrors([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedKey])

  const dirty = form !== null && JSON.stringify(form) !== baseline.current
  const retired = policy?.status === 'RETIRED'
  const editable = canManage && !retired

  const select = (id: string) => {
    if (id === selectedId) return
    if (dirty) { setPendingSelection(id); return }
    setSelectedId(id); setTab('basic'); setFeedback(null)
  }

  const applyResult = async (value: ReliefPolicy, message: string) => {
    queryClient.setQueryData(['relief-policy', value.id], value)
    await queryClient.invalidateQueries({ queryKey: ['relief-policies'] })
    setSelectedId(value.id)
    setFeedback({ tone: 'success', text: message })
  }
  const onFailure = (error: unknown) => {
    setFeedback({ tone: 'error', text: errorMessage(error) })
    if (!creating) void detail.refetch()
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!form) throw new Error('政策内容尚未加载')
      const { draft, errors: invalid } = toDraftInput(form)
      if (creating && !form.code.trim()) invalid.unshift('请填写政策编码')
      setErrors(invalid)
      if (invalid.length) throw new Error('请先修正标出的录入问题')
      if (creating) return api.relief.createPolicy({ code: form.code.trim(), name: form.name.trim(),
        description: form.description.trim() || undefined, draft })
      return api.relief.updateDraft(policy!.id, { expectedRevision: String(policy!.revision), name: form.name.trim(),
        description: form.description.trim() || undefined, draft })
    },
    onSuccess: (value) => applyResult(value, creating ? '政策已创建为草稿' : '草稿已保存'),
    onError: (error) => setFeedback({ tone: 'error', text: errorMessage(error) }),
  })
  const lifecycle = useMutation({
    mutationFn: ({ action }: { action: 'publish' | 'discardDraft' | 'suspend' | 'resume' | 'retire' }) =>
      api.relief[action](policy!.id, String(policy!.revision)),
    onSuccess: (value, { action }) => applyResult(value, {
      publish: '草稿已发布为生效版本', discardDraft: '草稿已放弃', suspend: '政策已暂停，结算时不再执行',
      resume: '政策已恢复', retire: '政策已停用',
    }[action]),
    onError: onFailure,
  })
  const busy = save.isPending || lifecycle.isPending
  const run = (action: 'publish' | 'discardDraft' | 'suspend' | 'resume' | 'retire') => lifecycle.mutate({ action })

  const menuItems = policy ? [
    { key: 'discard', label: '放弃草稿', disabled: !policy.draft || !policy.current || busy, onSelect: () => run('discardDraft') },
    policy.status === 'SUSPENDED'
      ? { key: 'resume', label: '恢复执行', disabled: busy, onSelect: () => run('resume') }
      : { key: 'suspend', label: '暂停执行', disabled: policy.status !== 'ACTIVE' || busy, onSelect: () => run('suspend') },
    { key: 'retire', label: '停用政策', danger: true, disabled: retired || busy, onSelect: () => setConfirmRetire(true) },
  ] : []

  const editorProps = form ? { api, form, enums, disabled: !editable || busy, creating, onChange: setForm } : null
  const versionHint = !policy ? '新建政策保存后为草稿，发布后在结算中生效。'
    : policy.draft ? `正在编辑草稿 V${policy.draft.versionNo}${policy.current ? `，当前生效 V${policy.current.versionNo}` : ''}。`
      : policy.current ? `当前生效 V${policy.current.versionNo}；修改后保存将生成新草稿，发布前不影响结算。` : ''

  return <div className="relief-page">
    <MasterDetailPage title="惠民政策" description="配置医保前、医保后惠民减免政策，指定资格、费用范围与额度。"
      actions={canManage ? <Button onClick={() => select(NEW)} disabled={busy}>新建政策</Button> : undefined}
      feedback={feedback && <Alert tone={feedback.tone} onDismiss={() => setFeedback(null)}>{feedback.text}</Alert>}
      navigationLabel="政策目录" detailLabel="政策详情"
      navigationResetScrollKey={`${keyword}:${status}`} detailResetScrollKey={`${selectedId}:${tab}`}
      navigationHeader={<>
        <PanelHead title="政策目录" meta={policies.data ? `${filtered.length} 项` : undefined} />
        <SearchField label="搜索政策名称或编码" value={keyword} onChange={setKeyword} />
        <FormField label="状态">
          <Select value={status} options={policyStatus.options} placeholder="全部状态" onChange={setStatus} />
        </FormField>
      </>}
      navigation={policies.isPending ? <LoadingState label="正在加载政策" />
        : policies.isError ? <Alert placement="inline" duration={null}>{errorMessage(policies.error)}</Alert>
          : filtered.length ? <div className="relief-policy-list">{filtered.map((item) =>
            <PolicyListItem key={item.id} item={item} selected={item.id === selectedId} onSelect={() => select(item.id)} />)}</div>
            : <EmptyState icon="billing" title={policies.data?.length ? '没有匹配的政策' : '暂无惠民政策'}
              copy={policies.data?.length ? '调整搜索条件后重试。' : canManage ? '点击“新建政策”开始配置。' : '请联系政策管理员配置。'} />}
      detailHeader={<>
        <PanelHead title={creating ? '新建政策' : policy?.name ?? '政策详情'}
          meta={policy && <span className="relief-detail-meta">
            <StatusBadge tone={reliefStatusTone(policy.status)}>{policy.statusText ?? policy.status}</StatusBadge>
            <span>{policy.code}</span>
          </span>}
          actions={canManage && policy && <ActionMenu label="更多操作" items={menuItems} disabled={busy} />} />
        <Tabs label="政策内容" value={tab} onChange={setTab} items={[
          { value: 'basic', label: '基本信息与时机' },
          { value: 'qualification', label: '资格条件' },
          { value: 'rules', label: '费用范围与规则' },
          { value: 'quota', label: '额度与组合' },
          { value: 'versions', label: '版本记录', disabled: creating },
        ]} />
      </>}
      detailFooter={form && canManage && <div className="relief-detail-footer">
        <span className="relief-detail-footer__hint">{dirty ? '有未保存的修改。' : ''}{versionHint}</span>
        <Button variant="secondary" disabled={!dirty || busy} onClick={() => {
          setForm(JSON.parse(baseline.current) as PolicyForm); setErrors([])
        }}>撤销修改</Button>
        <Button variant="secondary" busy={save.isPending} disabled={!editable || busy || (!dirty && !creating)}
          onClick={() => save.mutate()}>保存草稿</Button>
        {!creating && <Button busy={lifecycle.isPending && lifecycle.variables?.action === 'publish'}
          disabled={!editable || busy || dirty || !policy?.draft} onClick={() => run('publish')}>发布</Button>}
      </div>}>
      {!selectedId ? <EmptyState icon="billing" title="选择一项政策" copy="从左侧目录选择政策查看或编辑。" />
        : !creating && detail.isPending ? <LoadingState label="正在加载政策详情" />
          : !creating && detail.isError ? <Alert placement="inline" duration={null}>{errorMessage(detail.error)}</Alert>
            : editorProps && <div className="relief-editor">
              {errors.length > 0 && <Alert tone="warning" placement="inline">
                <ul className="relief-editor__errors">{errors.map((value) => <li key={value}>{value}</li>)}</ul>
              </Alert>}
              {retired && <Alert tone="info" placement="inline">政策已停用，仅供查阅。</Alert>}
              {tab === 'basic' && <ReliefBasicSection {...editorProps} />}
              {tab === 'qualification' && <ReliefQualificationSection {...editorProps} />}
              {tab === 'rules' && <ReliefRulesSection {...editorProps} />}
              {tab === 'quota' && <ReliefQuotaSection {...editorProps} />}
              {tab === 'versions' && <ReliefVersionsSection policy={policy} />}
            </div>}
    </MasterDetailPage>
    {pendingSelection !== null && <Dialog title="放弃未保存的修改？" onClose={() => setPendingSelection(null)}
      footer={<>
        <Button variant="secondary" onClick={() => setPendingSelection(null)}>继续编辑</Button>
        <Button variant="danger" onClick={() => {
          setSelectedId(pendingSelection); setPendingSelection(null); setTab('basic'); setFeedback(null)
        }}>放弃修改</Button>
      </>}>
      <p>当前政策有未保存的修改，切换后这些修改将丢失。</p>
    </Dialog>}
    {confirmRetire && policy && <Dialog title={`停用“${policy.name}”？`} onClose={() => setConfirmRetire(false)}
      footer={<>
        <Button variant="secondary" onClick={() => setConfirmRetire(false)}>取消</Button>
        <Button variant="danger" busy={lifecycle.isPending} onClick={() => { setConfirmRetire(false); run('retire') }}>确认停用</Button>
      </>}>
      <p>停用后政策不再参与结算且不能恢复，已产生的减免记录与退费冲销不受影响。如只需临时停止，请使用“暂停执行”。</p>
    </Dialog>}
  </div>
}

function PolicyListItem({ item, selected, onSelect }: { item: ReliefPolicySummary; selected: boolean; onSelect: () => void }) {
  return <Button variant="text" size="sm" aria-pressed={selected} onClick={onSelect}
    className={`relief-policy-item ${selected ? 'is-selected' : ''}`}>
    <span className="relief-policy-item__top">
      <strong className="relief-policy-item__name">{item.name}</strong>
      <StatusBadge tone={reliefStatusTone(item.status)}>{item.statusText ?? item.status}</StatusBadge>
    </span>
    <span className="relief-policy-item__meta">
      {[item.timingText, item.sponsorText, item.currentVersionNo ? `V${item.currentVersionNo}` : '未发布',
        item.hasDraft ? '有草稿' : ''].filter(Boolean).join(' · ')}
    </span>
    <span className="relief-policy-item__meta">
      {item.effectiveFrom ? `${item.effectiveFrom}${item.effectiveTo ? ` 至 ${item.effectiveTo}` : ' 起'}` : item.code}
    </span>
  </Button>
}
