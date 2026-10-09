const legendItems = [
  { tone: 'variable', label: '蓝色：需按本次患者替换' },
  { tone: 'important', label: '橙色：重点信息' },
  { tone: 'conflict', label: '红色：信息冲突' },
  { tone: 'source', label: '灰色：来源标记' },
] as const

export function RecordAnnotationLegend() {
  return <aside className="record-annotation-legend" aria-label="病历标记说明">
    <span className="record-annotation-legend__hint">虚线文字可点击查看来源并调整</span>
    {legendItems.map((item) => <span className="record-annotation-legend__item" key={item.tone}>
      <span aria-hidden="true" className={`ui-text-annotation is-${item.tone} record-annotation-legend__sample`}>示例</span>
      <span>{item.label}</span>
    </span>)}
  </aside>
}
