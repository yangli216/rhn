export interface RecordAnnotationLegendProps {
  /** Types currently highlighted in the record; absent types are not listed. */
  /** Omitted (template editors): list all types. */
  tones?: { variable: boolean; important: boolean; conflict: boolean }
}

export function RecordAnnotationLegend({ tones = { variable: true, important: true, conflict: true } }: RecordAnnotationLegendProps) {
  const items = [
    tones.variable && { tone: 'variable', label: '蓝色：需按本次患者替换' },
    tones.important && { tone: 'important', label: '橙色：AI 推荐待核实' },
    tones.conflict && { tone: 'conflict', label: '红色：信息冲突' },
  ].filter((item) => item !== false)
  return <aside className="record-annotation-legend" aria-label="病历标记说明">
    <span className="record-annotation-legend__hint">虚线文字可点击核实</span>
    {items.map((item) => <span className="record-annotation-legend__item" key={item.tone}>
      <span aria-hidden="true" className={`ui-text-annotation is-${item.tone} record-annotation-legend__sample`}>示例</span>
      <span>{item.label}</span>
    </span>)}
  </aside>
}
