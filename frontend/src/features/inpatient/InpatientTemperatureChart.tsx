import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  InpatientChartEvent,
  InpatientChartEventInput,
  InpatientChartEventType,
  InpatientEpisode,
  InpatientTemperatureChart,
  InpatientTemperatureChartDaySummary,
  InpatientTemperatureSite,
  InpatientVitalObservation,
  InpatientVitalObservationInput,
} from '../../shared/api/inpatientApi'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { VITAL_HARD_LIMITS } from '../../shared/validation/businessValidation'
import { Alert, Button, EmptyState, LoadingState, Panel, Select, StatusBadge } from '../../shared/ui'
import './inpatient-temperature-chart.css'

const DAY_MS = 86_400_000
const CHART_DAYS = 7
const OBSERVATION_HOURS = [2, 6, 10, 14, 18, 22] as const
const TEMP_MIN = 35
const TEMP_MAX = 42
const PULSE_MIN = 40
const PULSE_MAX = 180
const SVG_WIDTH = 1180
const SVG_HEIGHT = 478
const PLOT_LEFT = 64
const PLOT_RIGHT = 1114
const PLOT_TOP = 102
const PLOT_BOTTOM = 298
const DAY_WIDTH = (PLOT_RIGHT - PLOT_LEFT) / CHART_DAYS

const temperatureSiteText: Record<InpatientTemperatureSite, string> = {
  AXILLARY: '腋温', ORAL: '口温', RECTAL: '肛温', EAR: '耳温', FOREHEAD: '额温',
}

const eventTypeText: Record<InpatientChartEventType, string> = {
  ADMISSION: '入院', BED_TRANSFER: '转床', WARD_TRANSFER: '转科', LEAVE: '请假离院', RETURN: '返院',
  SURGERY: '手术', DELIVERY: '分娩', DISCHARGE: '出院', DEATH: '死亡', OTHER: '其他',
}

const manualEventTypeText: Partial<Record<InpatientChartEventType, string>> = {
  LEAVE: '请假离院', RETURN: '返院', SURGERY: '手术', DELIVERY: '分娩', DEATH: '死亡', OTHER: '其他',
}

export function InpatientTemperatureChartPanel({ api, episode }: { api: RhnApi; episode: InpatientEpisode }) {
  const queryClient = useQueryClient()
  const [weekStart, setWeekStart] = useState(() => initialChartWeek(episode))
  useEffect(() => setWeekStart(initialChartWeek(episode)), [episode.id, episode.admittedAt, episode.dischargedAt])

  const chartQuery = useQuery({
    queryKey: ['inpatient-temperature-chart', episode.id, weekStart],
    queryFn: () => api.inpatient.temperatureChart(episode.id, weekStart),
  })
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['inpatient-temperature-chart', episode.id] })
  }
  const vitalMutation = useMutation({
    mutationFn: (input: InpatientVitalObservationInput) => api.inpatient.recordVitalObservation(episode.id, input),
    onSuccess: refresh,
  })
  const eventMutation = useMutation({
    mutationFn: (input: InpatientChartEventInput) => api.inpatient.recordChartEvent(episode.id, input),
    onSuccess: refresh,
  })
  const chart = chartQuery.data
  const readOnly = episode.status !== 'ADMITTED' || chart?.readOnly === true

  return <Panel className="inpatient-temperature-panel" aria-labelledby="inpatient-temperature-heading">
    <header className="inpatient-temperature-head">
      <div><span>护理记录 · 七日视图</span><h2 id="inpatient-temperature-heading">体温单</h2>
        <p>{episode.residentName} · {episode.episodeNo} · {episode.bedNo ?? '已离院'}</p></div>
      <div className="inpatient-temperature-head__actions">
        <StatusBadge tone={readOnly ? 'neutral' : 'success'}>{readOnly ? '历史只读' : '可新增记录'}</StatusBadge>
        <Button size="sm" variant="secondary" onClick={() => setWeekStart(addDays(weekStart, -7))}>上一周</Button>
        <strong>{shortDate(weekStart)}—{shortDate(addDays(weekStart, 6))}</strong>
        <Button size="sm" variant="secondary" onClick={() => setWeekStart(addDays(weekStart, 7))}>下一周</Button>
      </div>
    </header>
    {(chartQuery.error || vitalMutation.error || eventMutation.error) &&
      <Alert className="inpatient-temperature-alert">{errorMessage(chartQuery.error || vitalMutation.error || eventMutation.error)}</Alert>}
    {chartQuery.isPending ? <LoadingState label="正在加载体温单…" /> : chart ? <>
      <TemperatureChartView chart={chart} weekStart={weekStart} />
      {readOnly ? <Alert tone="info" className="inpatient-temperature-alert">该住院记录已结束或体温单已锁定，历史事实仅供查看。</Alert> :
        <TemperatureChartEntry
          weekStart={weekStart}
          busy={vitalMutation.isPending || eventMutation.isPending}
          onRecordVital={(input) => vitalMutation.mutateAsync(input)}
          onRecordEvent={(input) => eventMutation.mutateAsync(input)}
        />}
    </> : !chartQuery.error && <EmptyState icon="clinical" title="暂无体温单" copy="选择日期后新增首条生命体征记录。" />}
  </Panel>
}

export function TemperatureChartView({ chart, weekStart }: { chart: InpatientTemperatureChart; weekStart: string }) {
  const days = useMemo(() => Array.from({ length: CHART_DAYS }, (_, index) => addDays(weekStart, index)), [weekStart])
  const observations = useMemo(() => (chart.observations ?? [])
    .filter((value) => value.status !== 'VOIDED' && isWithinChart(value.observedAt, weekStart))
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt)), [chart.observations, weekStart])
  const events = useMemo(() => (chart.events ?? [])
    .filter((value) => value.status !== 'VOIDED' && isWithinChart(value.occurredAt, weekStart))
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt)), [chart.events, weekStart])
  const summaries = useMemo(() => mergeDailySummaries(days, chart.dailySummaries ?? [], observations),
    [days, chart.dailySummaries, observations])
  const temperaturePoints = observations.filter((value) => value.temperatureCelsius !== undefined)
  const pulsePoints = observations.filter((value) => value.pulseRate !== undefined)

  return <div className="inpatient-temperature-chart">
    <div className="inpatient-temperature-legend" aria-label="体温单图例">
      <span><i className="is-temperature" />体温</span><span><i className="is-pulse" />脉搏</span>
      <span><i className="is-cooling" />物理降温后</span><span>× 腋温　● 口温　○ 肛温　△ 耳/额温</span>
    </div>
    <div className="inpatient-temperature-svg-wrap" tabIndex={0}
      aria-label="体温单图表，可横向滚动查看完整七日数据">
      <svg viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} role="img"
        aria-label={`${shortDate(weekStart)}至${shortDate(addDays(weekStart, 6))}体温单，含体温、脉搏、呼吸和每日生命体征`}>
        <rect className="temperature-chart-surface" x="0" y="0" width={SVG_WIDTH} height={SVG_HEIGHT} />
        <text className="temperature-chart-axis-title" x="8" y="94">体温℃</text>
        <text className="temperature-chart-axis-title" x={PLOT_RIGHT + 8} y="94">脉搏</text>
        {days.map((date, dayIndex) => <g key={date}>
          <rect className={dayIndex % 2 ? 'temperature-chart-day-alt' : 'temperature-chart-day'}
            x={PLOT_LEFT + dayIndex * DAY_WIDTH} y="0" width={DAY_WIDTH} height={SVG_HEIGHT} />
          <text className="temperature-chart-date" x={PLOT_LEFT + dayIndex * DAY_WIDTH + DAY_WIDTH / 2} y="18"
            textAnchor="middle">{date.slice(5)} {weekday(date)}</text>
          {OBSERVATION_HOURS.map((hour) => {
            const x = PLOT_LEFT + dayIndex * DAY_WIDTH + hour / 24 * DAY_WIDTH
            return <g key={hour}><line className="temperature-chart-grid-minor" x1={x} y1="26" x2={x} y2="454" />
              <text className="temperature-chart-slot" x={x} y="36" textAnchor="middle">{String(hour).padStart(2, '0')}</text></g>
          })}
          <line className="temperature-chart-grid-major" x1={PLOT_LEFT + dayIndex * DAY_WIDTH} y1="0"
            x2={PLOT_LEFT + dayIndex * DAY_WIDTH} y2="454" />
        </g>)}
        <line className="temperature-chart-grid-major" x1={PLOT_RIGHT} y1="0" x2={PLOT_RIGHT} y2="454" />
        {Array.from({ length: TEMP_MAX - TEMP_MIN + 1 }, (_, index) => TEMP_MAX - index).map((temperature) => {
          const y = temperatureY(temperature)
          const pulse = PULSE_MAX - (TEMP_MAX - temperature) * 20
          return <g key={temperature}><line className="temperature-chart-grid-horizontal" x1={PLOT_LEFT} y1={y} x2={PLOT_RIGHT} y2={y} />
            <text className="temperature-chart-axis" x={PLOT_LEFT - 8} y={y + 4} textAnchor="end">{temperature}</text>
            <text className="temperature-chart-axis is-pulse" x={PLOT_RIGHT + 8} y={y + 4}>{pulse}</text></g>
        })}
        <line className="temperature-chart-separator" x1="0" y1="315" x2={SVG_WIDTH} y2="315" />
        {summaryRows.map((row, index) => <g key={row.key}>
          <line className="temperature-chart-grid-horizontal" x1="0" y1={339 + index * 28} x2={SVG_WIDTH} y2={339 + index * 28} />
          <text className="temperature-chart-row-label" x={PLOT_LEFT - 8} y={332 + index * 28} textAnchor="end">{row.label}</text>
          {days.map((date, dayIndex) => <text key={date} className="temperature-chart-summary"
            x={PLOT_LEFT + dayIndex * DAY_WIDTH + DAY_WIDTH / 2} y={332 + index * 28} textAnchor="middle">
            {row.value(summaries.get(date))}</text>)}
        </g>)}
        {events.map((value, index) => <ChartEventMarker key={value.id} value={value} weekStart={weekStart} index={index} />)}
        <ChartPath points={temperaturePoints} weekStart={weekStart} kind="temperature" />
        <ChartPath points={pulsePoints} weekStart={weekStart} kind="pulse" />
        {observations.map((value) => <ObservationMarks key={value.id} value={value} weekStart={weekStart} />)}
      </svg>
    </div>
    <details className="inpatient-temperature-facts"><summary>查看本周记录明细（{observations.length + events.length} 条）</summary>
      {observations.length + events.length === 0 ? <p>本周暂无生命体征或事件记录。</p> : <table><caption className="visually-hidden">本周体温单事实明细</caption>
        <thead><tr><th>时间</th><th>类别</th><th>记录</th><th>状态</th></tr></thead><tbody>
          {[...observations.map(observationFact), ...events.map(eventFact)].sort((a, b) => a.at.localeCompare(b.at)).map((fact) =>
            <tr key={fact.key}><td>{formatDateTime(fact.at)}</td><td>{fact.type}</td><td>{fact.text}</td>
              <td>{fact.status === 'SIGNED' ? '已签' : fact.status === 'CORRECTED' ? '已更正' : '已记录'}</td></tr>)}</tbody></table>}
    </details>
  </div>
}

function ChartPath({ points, weekStart, kind }: {
  points: InpatientVitalObservation[]
  weekStart: string
  kind: 'temperature' | 'pulse'
}) {
  const segments: Array<Array<{ x: number; y: number }>> = []
  let current: Array<{ x: number; y: number }> = []
  for (const observation of points) {
    const value = kind === 'temperature' ? observation.temperatureCelsius! : observation.pulseRate!
    const inRange = kind === 'temperature'
      ? isWithinRange(value, TEMP_MIN, TEMP_MAX)
      : isWithinRange(value, PULSE_MIN, PULSE_MAX)
    if (!inRange) {
      if (current.length > 1) segments.push(current)
      current = []
      continue
    }
    current.push({
      x: factX(observation.observedAt, weekStart),
      y: kind === 'temperature' ? temperatureY(value) : pulseY(value),
    })
  }
  if (current.length > 1) segments.push(current)
  return <>{segments.map((coordinates, index) => <polyline key={index}
    className={`temperature-chart-line is-${kind}`} fill="none"
    points={coordinates.map(({ x, y }) => `${x},${y}`).join(' ')} />)}</>
}

function ObservationMarks({ value, weekStart }: { value: InpatientVitalObservation; weekStart: string }) {
  const x = factX(value.observedAt, weekStart)
  const title = observationFact(value).text
  return <g><title>{formatDateTime(value.observedAt)}　{title}</title>
    {value.temperatureCelsius !== undefined && (isWithinRange(value.temperatureCelsius, TEMP_MIN, TEMP_MAX)
      ? <TemperatureMark x={x} y={temperatureY(value.temperatureCelsius)} site={value.temperatureSite} />
      : <OutOfRangeMark x={x} value={value.temperatureCelsius} max={TEMP_MAX}
        kind="temperature" unit="℃" />)}
    {value.pulseRate !== undefined && (isWithinRange(value.pulseRate, PULSE_MIN, PULSE_MAX)
      ? <circle className="temperature-chart-mark is-pulse" cx={x} cy={pulseY(value.pulseRate)} r="3.6" />
      : <OutOfRangeMark x={x} value={value.pulseRate} max={PULSE_MAX}
        kind="pulse" unit="次/分" />)}
    {value.coolingTemperatureCelsius !== undefined && <g>
      <line className="temperature-chart-cooling-link" x1={x} y1={temperatureY(value.temperatureCelsius ?? value.coolingTemperatureCelsius)}
        x2={value.coolingObservedAt ? factX(value.coolingObservedAt, weekStart) : x + 6}
        y2={temperatureY(value.coolingTemperatureCelsius)} />
      {isWithinRange(value.coolingTemperatureCelsius, TEMP_MIN, TEMP_MAX)
        ? <circle className="temperature-chart-mark is-cooling" cx={value.coolingObservedAt ? factX(value.coolingObservedAt, weekStart) : x + 6}
          cy={temperatureY(value.coolingTemperatureCelsius)} r="4" />
        : <OutOfRangeMark x={value.coolingObservedAt ? factX(value.coolingObservedAt, weekStart) : x + 6}
          value={value.coolingTemperatureCelsius} max={TEMP_MAX} kind="cooling" unit="℃" />}
    </g>}
  </g>
}

function OutOfRangeMark({ x, value, max, kind, unit }: {
  x: number
  value: number
  max: number
  kind: 'temperature' | 'pulse' | 'cooling'
  unit: string
}) {
  const high = value > max
  const y = high ? PLOT_TOP : PLOT_BOTTOM
  const direction = high ? '↑' : '↓'
  return <g className={`temperature-chart-outlier is-${kind}`} data-out-of-range={high ? 'high' : 'low'}>
    <title>{value}{unit}，超出图表{high ? '上限' : '下限'}</title>
    <path d={high ? `M ${x} ${y} l -4 7 h 8 Z` : `M ${x} ${y} l -4 -7 h 8 Z`} />
    <text x={x} y={high ? y + 17 : y - 9} textAnchor="middle">{value}{direction}</text>
  </g>
}

function TemperatureMark({ x, y, site }: { x: number; y: number; site?: InpatientTemperatureSite }) {
  if (site === 'AXILLARY') return <g className="temperature-chart-mark is-temperature"><line x1={x - 3.5} y1={y - 3.5} x2={x + 3.5} y2={y + 3.5} />
    <line x1={x + 3.5} y1={y - 3.5} x2={x - 3.5} y2={y + 3.5} /></g>
  if (site === 'RECTAL') return <circle className="temperature-chart-mark is-temperature is-hollow" cx={x} cy={y} r="4" />
  if (site === 'EAR' || site === 'FOREHEAD') return <path className="temperature-chart-mark is-temperature is-hollow"
    d={`M ${x} ${y - 4.5} L ${x + 4.5} ${y + 3.5} L ${x - 4.5} ${y + 3.5} Z`} />
  return <circle className="temperature-chart-mark is-temperature" cx={x} cy={y} r="3.6" />
}

function ChartEventMarker({ value, weekStart, index }: {
  value: InpatientChartEvent
  weekStart: string
  index: number
}) {
  const x = factX(value.occurredAt, weekStart)
  const label = value.displayText || eventTypeText[value.eventType]
  return <g><title>{formatDateTime(value.occurredAt)}　{label}</title>
    <path className="temperature-chart-event-mark" d={`M ${x} 91 l -4 -7 h 8 Z`} />
    <text className="temperature-chart-event-text" x={x + 2 + index % 2 * 5} y="80"
      transform={`rotate(-58 ${x + 2 + index % 2 * 5} 80)`}>{label}</text></g>
}

export function TemperatureChartEntry({ weekStart, busy, onRecordVital, onRecordEvent }: {
  weekStart: string
  busy?: boolean
  onRecordVital: (input: InpatientVitalObservationInput) => void | Promise<unknown>
  onRecordEvent: (input: InpatientChartEventInput) => void | Promise<unknown>
}) {
  const [entryError, setEntryError] = useState('')
  const recordVital = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const observedAt = observedAtIso(String(data.get('date')), String(data.get('hour')))
    const temperature = optionalNumber(data, 'temperatureCelsius')
    const coolingTemperature = optionalNumber(data, 'coolingTemperatureCelsius')
    const input: InpatientVitalObservationInput = {
      observedAt,
      temperatureCelsius: temperature,
      temperatureSite: temperature === undefined ? undefined : String(data.get('temperatureSite')) as InpatientTemperatureSite,
      coolingTemperatureCelsius: coolingTemperature,
      coolingObservedAt: coolingTemperature === undefined ? undefined : new Date(new Date(observedAt).getTime() + 30 * 60_000).toISOString(),
      pulseRate: optionalNumber(data, 'pulseRate'),
      respiratoryRate: optionalNumber(data, 'respiratoryRate'),
      systolicBloodPressure: optionalNumber(data, 'systolicBloodPressure'),
      diastolicBloodPressure: optionalNumber(data, 'diastolicBloodPressure'),
      oxygenSaturation: optionalNumber(data, 'oxygenSaturation'),
      bodyWeightKg: optionalNumber(data, 'bodyWeightKg'),
      intakeVolumeMl: optionalNumber(data, 'intakeVolumeMl'),
      outputVolumeMl: optionalNumber(data, 'outputVolumeMl'),
      commandCode: `VITAL-${crypto.randomUUID()}`,
    }
    if (!hasClinicalValue(input)) {
      setEntryError('请至少填写一项生命体征或出入量。')
      return
    }
    if ((input.systolicBloodPressure === undefined) !== (input.diastolicBloodPressure === undefined)) {
      setEntryError('血压需要同时填写收缩压和舒张压。')
      return
    }
    if (input.systolicBloodPressure !== undefined && input.diastolicBloodPressure !== undefined
        && input.systolicBloodPressure <= input.diastolicBloodPressure) {
      setEntryError('收缩压必须大于舒张压。')
      return
    }
    setEntryError('')
    await onRecordVital(input)
  }
  const recordEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const displayText = String(data.get('displayText')).trim()
    if (!displayText) return
    await onRecordEvent({
      occurredAt: observedAtIso(String(data.get('eventDate')), String(data.get('eventHour'))),
      eventType: String(data.get('eventType')) as InpatientChartEventType,
      displayText,
      commandCode: `CHART-EVENT-${crypto.randomUUID()}`,
    })
  }
  return <section className="inpatient-temperature-entry" aria-label="新增体温单记录">
    <header><div><h3>紧凑录入</h3><span>新增事实；已签记录不可覆盖</span></div></header>
    {entryError && <Alert>{entryError}</Alert>}
    <form key={`vital-${weekStart}`} className="inpatient-vital-form" onSubmit={recordVital}>
      <CompactField label="日期"><input name="date" type="date" min={weekStart} max={addDays(weekStart, 6)} defaultValue={weekStart} required /></CompactField>
      <CompactSelect label="时点" name="hour" defaultValue="10" options={OBSERVATION_HOURS.map((hour) => ({
        value: String(hour), label: `${String(hour).padStart(2, '0')}:00`,
      }))} />
      <CompactField label="体温 ℃"><input name="temperatureCelsius" type="number" min={VITAL_HARD_LIMITS.temperature.minimum} max={VITAL_HARD_LIMITS.temperature.maximum} step="0.1" /></CompactField>
      <CompactSelect label="测温方式" name="temperatureSite" defaultValue="AXILLARY"
        options={Object.entries(temperatureSiteText).map(([value, label]) => ({ value, label }))} />
      <CompactField label="脉搏 次/分"><input name="pulseRate" type="number" min={VITAL_HARD_LIMITS.pulse.minimum} max={VITAL_HARD_LIMITS.pulse.maximum} /></CompactField>
      <CompactField label="呼吸 次/分"><input name="respiratoryRate" type="number" min={VITAL_HARD_LIMITS.respiratoryRate.minimum} max={VITAL_HARD_LIMITS.respiratoryRate.maximum} /></CompactField>
      <CompactField label="降温后 ℃"><input name="coolingTemperatureCelsius" type="number" min={VITAL_HARD_LIMITS.temperature.minimum} max={VITAL_HARD_LIMITS.temperature.maximum} step="0.1" /></CompactField>
      <CompactField label="血压 mmHg" className="is-pressure"><span><input name="systolicBloodPressure" type="number" min={VITAL_HARD_LIMITS.systolicPressure.minimum} max={VITAL_HARD_LIMITS.systolicPressure.maximum} aria-label="收缩压" placeholder="收缩压" />
        <b>/</b><input name="diastolicBloodPressure" type="number" min={VITAL_HARD_LIMITS.diastolicPressure.minimum} max={VITAL_HARD_LIMITS.diastolicPressure.maximum} aria-label="舒张压" placeholder="舒张压" /></span></CompactField>
      <CompactField label="SpO₂ %"><input name="oxygenSaturation" type="number" min={VITAL_HARD_LIMITS.oxygenSaturation.minimum} max={VITAL_HARD_LIMITS.oxygenSaturation.maximum} /></CompactField>
      <CompactField label="体重 kg"><input name="bodyWeightKg" type="number" min={VITAL_HARD_LIMITS.weight.minimum} max={VITAL_HARD_LIMITS.weight.maximum} step="0.1" /></CompactField>
      <CompactField label="入量 ml"><input name="intakeVolumeMl" type="number" min={VITAL_HARD_LIMITS.volume.minimum} max={VITAL_HARD_LIMITS.volume.maximum} /></CompactField>
      <CompactField label="出量 ml"><input name="outputVolumeMl" type="number" min={VITAL_HARD_LIMITS.volume.minimum} max={VITAL_HARD_LIMITS.volume.maximum} /></CompactField>
      <Button type="submit" size="sm" busy={busy}>保存体征</Button>
    </form>
    <form key={`event-${weekStart}`} className="inpatient-chart-event-form" onSubmit={recordEvent}>
      <CompactField label="事件日期"><input name="eventDate" type="date" min={weekStart} max={addDays(weekStart, 6)} defaultValue={weekStart} required /></CompactField>
      <CompactSelect label="时点" name="eventHour" defaultValue="10" options={OBSERVATION_HOURS.map((hour) => ({
        value: String(hour), label: `${String(hour).padStart(2, '0')}:00`,
      }))} />
      <CompactSelect label="事件" name="eventType" defaultValue="OTHER"
        options={Object.entries(manualEventTypeText).map(([value, label]) => ({ value, label }))} />
      <CompactField label="显示内容" className="is-event-text"><input name="displayText" maxLength={30} placeholder="如：转入、手术、出院" required /></CompactField>
      <Button type="submit" size="sm" variant="secondary" busy={busy}>记录事件</Button>
    </form>
  </section>
}

function CompactField({ label, className = '', children }: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return <label className={`inpatient-compact-field ${className}`}><span>{label}</span>{children}</label>
}

function CompactSelect({ label, name, defaultValue, options }: {
  label: string
  name: string
  defaultValue: string
  options: Array<{ value: string; label: string }>
}) {
  const [value, setValue] = useState(defaultValue)
  return <div className="inpatient-compact-field"><span>{label}</span><Select aria-label={label} name={name}
    value={value} options={options} clearable={false} searchable={false} onChange={setValue} /></div>
}

const summaryRows: Array<{
  key: string
  label: string
  value: (summary?: ChartDaySummary) => string
}> = [
  { key: 'respiration', label: '呼吸(次/分)', value: (summary) => valueText(summary?.respiratoryRate) },
  { key: 'bloodPressure', label: '血压(mmHg)', value: (summary) => summary?.bloodPressure ?? '—' },
  { key: 'oxygen', label: 'SpO₂(%)', value: (summary) => valueText(summary?.oxygenSaturation) },
  { key: 'weight', label: '体重(kg)', value: (summary) => valueText(summary?.bodyWeightKg) },
  { key: 'intake', label: '入量(ml)', value: (summary) => valueText(summary?.intakeVolumeMl) },
  { key: 'output', label: '出量(ml)', value: (summary) => valueText(summary?.outputVolumeMl) },
]

type ChartDaySummary = InpatientTemperatureChartDaySummary & { respiratoryRate?: number }

function mergeDailySummaries(days: string[], supplied: InpatientTemperatureChartDaySummary[], observations: InpatientVitalObservation[]) {
  const result = new Map<string, ChartDaySummary>()
  for (const day of days) result.set(day, { date: day })
  for (const summary of supplied) if (result.has(summary.date)) result.set(summary.date, { ...summary })
  for (const observation of observations) {
    const date = localDateKey(observation.observedAt)
    const current = result.get(date)
    if (!current) continue
    if (observation.respiratoryRate !== undefined) current.respiratoryRate = observation.respiratoryRate
    if (observation.systolicBloodPressure !== undefined && observation.diastolicBloodPressure !== undefined) {
      current.bloodPressure = `${observation.systolicBloodPressure}/${observation.diastolicBloodPressure}`
    }
    if (observation.oxygenSaturation !== undefined) current.oxygenSaturation = observation.oxygenSaturation
    if (observation.bodyWeightKg !== undefined) current.bodyWeightKg = observation.bodyWeightKg
    if (observation.intakeVolumeMl !== undefined) current.intakeVolumeMl = observation.intakeVolumeMl
    if (observation.outputVolumeMl !== undefined) current.outputVolumeMl = observation.outputVolumeMl
  }
  return result
}

function observationFact(value: InpatientVitalObservation) {
  const parts: string[] = []
  if (value.temperatureCelsius !== undefined) parts.push(`${temperatureSiteText[value.temperatureSite ?? 'AXILLARY']} ${value.temperatureCelsius}℃`)
  if (value.coolingTemperatureCelsius !== undefined) parts.push(`降温后 ${value.coolingTemperatureCelsius}℃`)
  if (value.pulseRate !== undefined) parts.push(`脉搏 ${value.pulseRate}`)
  if (value.respiratoryRate !== undefined) parts.push(`呼吸 ${value.respiratoryRate}`)
  if (value.systolicBloodPressure !== undefined && value.diastolicBloodPressure !== undefined) parts.push(`血压 ${value.systolicBloodPressure}/${value.diastolicBloodPressure}`)
  if (value.oxygenSaturation !== undefined) parts.push(`SpO₂ ${value.oxygenSaturation}%`)
  if (value.bodyWeightKg !== undefined) parts.push(`体重 ${value.bodyWeightKg}kg`)
  if (value.intakeVolumeMl !== undefined) parts.push(`入量 ${value.intakeVolumeMl}ml`)
  if (value.outputVolumeMl !== undefined) parts.push(`出量 ${value.outputVolumeMl}ml`)
  return { key: `observation-${value.id}`, at: value.observedAt, type: '生命体征', text: parts.join('；'), status: value.status }
}

function eventFact(value: InpatientChartEvent) {
  return { key: `event-${value.id}`, at: value.occurredAt, type: eventTypeText[value.eventType], text: value.displayText, status: value.status }
}

function temperatureY(value: number) {
  const plotted = Math.min(TEMP_MAX, Math.max(TEMP_MIN, value))
  return PLOT_BOTTOM - (plotted - TEMP_MIN) / (TEMP_MAX - TEMP_MIN) * (PLOT_BOTTOM - PLOT_TOP)
}

function pulseY(value: number) {
  const plotted = Math.min(PULSE_MAX, Math.max(PULSE_MIN, value))
  return PLOT_BOTTOM - (plotted - PULSE_MIN) / (PULSE_MAX - PULSE_MIN) * (PLOT_BOTTOM - PLOT_TOP)
}

function isWithinRange(value: number, min: number, max: number) {
  return value >= min && value <= max
}

function factX(value: string, weekStart: string) {
  const date = new Date(value)
  const day = dayDistance(weekStart, localDateKey(value))
  const hour = date.getHours() + date.getMinutes() / 60
  return PLOT_LEFT + day * DAY_WIDTH + hour / 24 * DAY_WIDTH
}

function initialChartWeek(episode: InpatientEpisode) {
  const admission = localDateKey(episode.admittedAt)
  const end = episode.dischargedAt ? localDateKey(episode.dischargedAt) : localDateKey(new Date().toISOString())
  const elapsed = Math.max(0, dayDistance(admission, end))
  return addDays(admission, Math.floor(elapsed / CHART_DAYS) * CHART_DAYS)
}

function isWithinChart(value: string, weekStart: string) {
  const distance = dayDistance(weekStart, localDateKey(value))
  return distance >= 0 && distance < CHART_DAYS
}

function localDateKey(value: string) {
  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(value: string, count: number) {
  const date = new Date(`${value}T12:00:00`)
  date.setDate(date.getDate() + count)
  return localDateKey(date.toISOString())
}

function dayDistance(from: string, to: string) {
  const [fromYear, fromMonth, fromDay] = from.split('-').map(Number)
  const [toYear, toMonth, toDay] = to.split('-').map(Number)
  return Math.round((Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) / DAY_MS)
}

function observedAtIso(date: string, hour: string) {
  return new Date(`${date}T${hour.padStart(2, '0')}:00:00`).toISOString()
}

function optionalNumber(data: FormData, name: string) {
  const raw = String(data.get(name) ?? '').trim()
  return raw === '' ? undefined : Number(raw)
}

function hasClinicalValue(input: InpatientVitalObservationInput) {
  return Object.entries(input).some(([key, value]) => !['observedAt', 'commandCode', 'temperatureSite', 'coolingObservedAt'].includes(key) && value !== undefined)
}

function valueText(value?: number) {
  return value === undefined ? '—' : String(value)
}

function shortDate(value: string) {
  return `${Number(value.slice(5, 7))}月${Number(value.slice(8, 10))}日`
}

function weekday(value: string) {
  return ['日', '一', '二', '三', '四', '五', '六'][new Date(`${value}T12:00:00`).getDay()]
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date(value))
}

export default InpatientTemperatureChartPanel
