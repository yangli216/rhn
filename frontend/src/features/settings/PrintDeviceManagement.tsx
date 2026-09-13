import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ClinicalPrintDevice, PrintAdministrationCatalog, RhnApi, RoutedPrintDocumentType, SaveClinicalPrintDevice,
} from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, Button, EmptyState, FormField, Icon, LoadingState, Select, StatusBadge, Switch } from '../../shared/ui'

const EMPTY_DEVICE: SaveClinicalPrintDevice = {
  expectedRevision: 0, deviceCode: '', deviceName: '', channel: 'LOCAL_BRIDGE', outputLanguage: 'PDF',
  queueName: '', capabilitiesJson: '{}', status: 'ACTIVE',
}

export function PrintDeviceManagement({ api, catalog }: { api: RhnApi; catalog: PrintAdministrationCatalog }) {
  const queryClient = useQueryClient()
  const management = useQuery({
    queryKey: ['clinical-print-device-management'], queryFn: api.printing.clinicalPrintDeviceManagement,
  })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState<SaveClinicalPrintDevice>(EMPTY_DEVICE)
  const [documentType, setDocumentType] = useState<RoutedPrintDocumentType>('INFUSION_LABEL')
  const [mediaProfileId, setMediaProfileId] = useState('')
  const [routeDeviceId, setRouteDeviceId] = useState('')
  const [feedback, setFeedback] = useState('')

  const selected = management.data?.devices.find((value) => value.id === selectedId)
  useEffect(() => {
    if (!selectedId && management.data?.devices.length) setSelectedId(management.data.devices[0].id ?? null)
  }, [management.data, selectedId])
  useEffect(() => {
    if (!selected) return
    setForm({
      expectedRevision: selected.revision, deviceCode: selected.deviceCode, deviceName: selected.deviceName,
      channel: selected.channel, outputLanguage: selected.outputLanguage, queueName: selected.queueName ?? '',
      capabilitiesJson: selected.capabilitiesJson ?? '{}', status: selected.status ?? 'ACTIVE',
    })
  }, [selected])

  const documentOptions = useMemo(() => catalog.documentDefinitions
    .filter((value) => ['CLINICAL_DOCUMENT', 'PRESCRIPTION', 'APPLICATION', 'CARD', 'LABEL', 'LIST'].includes(value.category))
    .map((value) => ({ value: value.documentType, label: value.documentName, secondaryText: value.documentType })), [catalog])
  const mediaOptions = catalog.mediaProfiles.map((value) => ({ value: value.id, label: value.mediaName,
    secondaryText: `${value.widthMm} x ${value.heightMm ?? '连续'} mm` }))
  const selectedMedia = catalog.mediaProfiles.find((value) => value.id === mediaProfileId)
  const activeDevices = management.data?.devices.filter((value) => value.status !== 'INACTIVE'
    && supportsMedia(value, selectedMedia?.mediaCode)) ?? []
  const route = management.data?.bindings.find((value) => value.documentType === documentType
    && value.mediaProfileId === mediaProfileId)
  useEffect(() => {
    setRouteDeviceId(route?.deviceId ?? '')
  }, [route?.id, route?.revision, documentType, mediaProfileId])

  const refresh = async () => queryClient.invalidateQueries({ queryKey: ['clinical-print-device-management'] })
  const saveDevice = useMutation({
    mutationFn: () => selectedId
      ? api.printing.updateClinicalPrintDevice(selectedId, form)
      : api.printing.createClinicalPrintDevice(form),
    onSuccess: async (value) => {
      setSelectedId(value.id ?? null); setFeedback(selectedId ? '设备配置已更新' : '打印设备已新增'); await refresh()
    },
  })
  const saveRoute = useMutation({
    mutationFn: () => api.printing.bindClinicalPrintDevice({
      expectedRevision: route?.revision ?? 0, documentType, mediaProfileId, deviceId: routeDeviceId,
    }),
    onSuccess: async () => { setFeedback('默认打印路由已生效'); await refresh() },
  })
  const error = management.error || saveDevice.error || saveRoute.error

  if (management.isPending) return <LoadingState label="正在加载打印设备与路由…" />
  return <div className="print-device-workbench">
    {(error || feedback) && <div className="print-device-feedback">
      {error && <Alert tone="error">{errorMessage(error)}</Alert>}
      {feedback && <Alert tone="success" onDismiss={() => setFeedback('')}>{feedback}</Alert>}
    </div>}
    <aside className="print-device-list" aria-label="打印设备列表">
      <div className="print-pane-heading"><div><strong>打印设备</strong><span>{management.data?.devices.length ?? 0} 台</span></div>
        <Button size="sm" variant="text" onClick={() => { setSelectedId(null); setForm(EMPTY_DEVICE) }}><Icon name="add" />新增</Button></div>
      <div className="print-device-list__scroll">
        {management.data?.devices.map((device) => <button type="button" key={device.id}
          className={`print-device-row ${selectedId === device.id ? 'is-active' : ''}`}
          onClick={() => setSelectedId(device.id ?? null)}>
          <span className="print-device-row__icon"><Icon name="print" /></span>
          <span><strong>{device.deviceName}</strong><small>{device.deviceCode} · {channelLabel(device.channel)}</small></span>
          <StatusBadge tone={device.status === 'INACTIVE' ? 'neutral' : isOnline(device) ? 'success' : 'warning'}>
            {device.status === 'INACTIVE' ? '停用' : isOnline(device) ? '在线' : '未连接'}
          </StatusBadge>
        </button>)}
        {!management.data?.devices.length && <EmptyState icon="print" title="暂无打印设备" copy="新增浏览器或本地打印桥设备。" />}
      </div>
    </aside>

    <section className="print-device-editor" aria-label="设备配置">
      <div className="print-pane-heading"><div><strong>{selectedId ? '设备配置' : '新增设备'}</strong><span>当前机构与科室范围</span></div></div>
      <div className="print-device-form">
        <div className="print-device-form-grid">
          <FormField label="设备编码" required><input value={form.deviceCode} disabled={Boolean(selectedId)}
            onChange={(event) => setForm({ ...form, deviceCode: event.target.value.toUpperCase() })} /></FormField>
          <FormField label="设备名称" required><input value={form.deviceName}
            onChange={(event) => setForm({ ...form, deviceName: event.target.value })} /></FormField>
          <FormField label="连接通道"><Select value={form.channel} clearable={false} searchable={false}
            options={[{ value: 'BROWSER_PDF', label: '浏览器 PDF' }, { value: 'LOCAL_BRIDGE', label: '本地打印桥' }]}
            onChange={(value) => setForm({ ...form, channel: value as SaveClinicalPrintDevice['channel'],
              outputLanguage: value === 'BROWSER_PDF' ? 'PDF' : form.outputLanguage })} /></FormField>
          <FormField label="输出语言"><Select value={form.outputLanguage} clearable={false} searchable={false}
            options={['PDF', 'ZPL', 'TSPL', 'ESC_POS'].map((value) => ({ value, label: value }))}
            onChange={(value) => setForm({ ...form, outputLanguage: value as SaveClinicalPrintDevice['outputLanguage'] })} /></FormField>
          <FormField label="系统队列名"><input value={form.queueName} placeholder="如 Zebra-ZD421"
            onChange={(event) => setForm({ ...form, queueName: event.target.value })} /></FormField>
          <FormField label="启用状态"><Switch checked={form.status === 'ACTIVE'} checkedText="启用" uncheckedText="停用"
            onChange={(checked) => setForm({ ...form, status: checked ? 'ACTIVE' : 'INACTIVE' })} /></FormField>
        </div>
        <FormField label="设备能力 JSON"><textarea rows={5} spellCheck={false} value={form.capabilitiesJson}
          onChange={(event) => setForm({ ...form, capabilitiesJson: event.target.value })} /></FormField>
        <div className="print-device-save"><Button busy={saveDevice.isPending}
          disabled={!form.deviceCode.trim() || !form.deviceName.trim()} onClick={() => saveDevice.mutate()}>
          <Icon name="check" />保存设备</Button></div>
      </div>
    </section>

    <aside className="print-route-editor" aria-label="默认打印路由">
      <div className="print-pane-heading"><div><strong>默认路由</strong><span>单据 + 介质 → 设备</span></div></div>
      <div className="print-route-form">
        <FormField label="单据类型"><Select value={documentType} clearable={false} searchable={false}
          options={documentOptions} onChange={(value) => setDocumentType(value as RoutedPrintDocumentType)} /></FormField>
        <FormField label="打印介质"><Select value={mediaProfileId} clearable={false}
          options={mediaOptions} onChange={setMediaProfileId} /></FormField>
        <FormField label="默认设备"><Select value={routeDeviceId} clearable={false}
          options={activeDevices.map((value) => ({ value: value.id ?? '', label: value.deviceName,
            secondaryText: `${channelLabel(value.channel)} · ${value.outputLanguage}` }))} onChange={setRouteDeviceId} /></FormField>
        {route && <Alert tone="info">当前路由已绑定，保存后立即替换默认设备。</Alert>}
        <Button busy={saveRoute.isPending} disabled={!mediaProfileId || !routeDeviceId}
          onClick={() => saveRoute.mutate()}><Icon name="check" />保存默认路由</Button>
      </div>
      <div className="print-route-list"><h3>当前路由</h3>
        {management.data?.bindings.map((binding) => {
          const definition = catalog.documentDefinitions.find((value) => value.documentType === binding.documentType)
          const media = catalog.mediaProfiles.find((value) => value.id === binding.mediaProfileId)
          const device = management.data?.devices.find((value) => value.id === binding.deviceId)
          return <button type="button" key={binding.id} onClick={() => {
            setDocumentType(binding.documentType); setMediaProfileId(binding.mediaProfileId); setRouteDeviceId(binding.deviceId)
          }}><strong>{definition?.documentName ?? binding.documentType}</strong>
            <span>{media?.mediaName ?? binding.mediaProfileId}</span><small>→ {device?.deviceName ?? binding.deviceId}</small></button>
        })}
      </div>
    </aside>
  </div>
}

function channelLabel(value: ClinicalPrintDevice['channel']) {
  return value === 'LOCAL_BRIDGE' ? '本地打印桥' : '浏览器 PDF'
}

function isOnline(value: ClinicalPrintDevice) {
  if (value.channel === 'BROWSER_PDF') return true
  if (!value.lastSeenAt) return false
  return Date.now() - new Date(value.lastSeenAt).getTime() < 120_000
}

function supportsMedia(value: ClinicalPrintDevice, mediaCode?: string) {
  if (!mediaCode) return true
  try {
    const codes = (JSON.parse(value.capabilitiesJson || '{}') as { mediaCodes?: unknown }).mediaCodes
    return !Array.isArray(codes) || codes.length === 0 || codes.includes(mediaCode)
  } catch {
    return false
  }
}
