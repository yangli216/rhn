import { useFontSizePreference } from '../shared/preferences/useFontSizePreference'
import { Button, ChoiceChip, DescriptionList, EmptyState, PanelHead, ListItemButton, MetricStrip, SearchField, SelectableList, StatChips, StatusBadge, Tag } from '../shared/ui'

/** 从已认可页面抽取的组合组件的展示页（虚构数据），供截图基线使用。 */
export function ComponentSamples() {
  useFontSizePreference()
  return <main className="component-samples">
    <section aria-label="统计胶囊与工具栏">
      <h2>统计胶囊 · 紧凑工具栏</h2>
      <div className="component-samples__toolbar">
        <SearchField size="sm" label="搜索示例" placeholder="搜索单号" />
        <Button size="sm" variant="secondary">查询</Button>
        <StatChips items={[
          { label: '品种', value: 128 },
          { label: '批次', value: 342, note: '（临期 6）', warn: true },
          { label: '本期记账', value: 57 },
        ]} />
        <StatChips items={[
          { label: 'I级 濒危', value: 2, tone: 'danger' }, { label: '发热预警', value: 5, tone: 'warning' }, { label: '绿色通道', value: 1, tone: 'success' },
        ]} />
      </div>
    </section>
    <section aria-label="区块标题">
      <h2>区块标题</h2>
      <div className="component-samples__grid">
        <div>
          <PanelHead level="section" title="库房经营目录" meta="共 128 项" actions={<Button size="sm" variant="secondary">导出</Button>} />
          <PanelHead level="section" title="差异明细" description="处理差异后需重新执行预检" />
        </div>
        <div>
          <PanelHead title="患者信息" meta="3 项" />
          <PanelHead title="预检与关账记录" description="每次预检均保留独立快照" actions={<Button size="sm">刷新</Button>} />
        </div>
      </div>
    </section>
    <section aria-label="指标条">
      <h2>指标条</h2>
      <MetricStrip label="示例汇总" items={[
        { label: '期初库存', value: '¥128,000.00', note: '上期结转' },
        { label: '本期业务变动', value: '+¥12,300.00', note: '入库、出库及盘点' },
        { label: '计算期末', value: '¥140,300.00', note: '期间账面结果' },
        { label: '账面差异', value: '¥3.00', note: '2 个异常维度', tone: 'warning' },
      ]} />
    </section>
    <section aria-label="标签">
      <h2>标签</h2>
      <div className="component-samples__row">
        <Tag>标准品种</Tag><Tag tone="brand">冷链</Tag><Tag tone="info">采购单</Tag><Tag tone="success">验收单</Tag>
        <Tag tone="warning">高警示</Tag><Tag tone="danger">受控</Tag><Tag mono>B20260101</Tag><Tag tone="brand" mono>I10.x00</Tag>
      </div>
    </section>
    <section aria-label="选择胶囊">
      <h2>选择胶囊</h2>
      <div className="component-samples__row">
        <ChoiceChip selected onToggle={() => undefined}>发热/发烧</ChoiceChip><ChoiceChip selected={false} onToggle={() => undefined}>咳嗽咳痰</ChoiceChip>
        <ChoiceChip selected={false} onToggle={() => undefined}>胸闷胸痛</ChoiceChip><ChoiceChip selected={false} disabled onToggle={() => undefined}>不可选</ChoiceChip>
      </div>
    </section>
    <section aria-label="字段网格">
      <h2>字段网格</h2>
      <div className="component-samples__grid">
        <DescriptionList items={[
          { label: '默认库存状态', value: '可用' }, { label: '同级排序', value: 3 },
          { label: '允许收货', value: '是' }, { label: '备注', value: '' },
          { label: '说明', value: '长文本用于检查换行：这是一段比较长的字段说明，需要在两列宽度内自然换行而不撑破网格。', span: 2 },
        ]} />
        <DescriptionList variant="plain" columns={3} items={[
          { label: '主诉', value: '头晕 2 小时' }, { label: '既往史', value: '高血压 10 年' }, { label: '过敏史', value: '' },
        ]} />
      </div>
    </section>
    <section aria-label="目录条目">
      <h2>目录条目</h2>
      <div className="component-samples__list">
        <SelectableList label="示例单据">
          <ListItemButton title="CG20261028001" badge={<StatusBadge tone="info">草稿</StatusBadge>} meta="示例供应商 · 3 个品项 · 2026-10-28" aside="¥1,280.00" selected onSelect={() => undefined} />
          <ListItemButton title="CG20261028002" badge={<StatusBadge tone="success">已审核</StatusBadge>} meta="示例供应商乙 · 1 个品项" aside="¥360.00" onSelect={() => undefined} />
          <ListItemButton title="这是一个名称特别特别长以至于需要省略显示的规则目录条目示例名称" badge={<StatusBadge tone="warning">待审</StatusBadge>} meta="来源：AI 生成" onSelect={() => undefined} />
        </SelectableList>
      </div>
    </section>
    <section aria-label="行内空状态">
      <h2>行内结论</h2>
      <div className="component-samples__grid">
        <EmptyState size="inline" glyph="✓" title="本次账目校验通过" copy="本次已校验维度内未发现账目差异，不替代实物盘点。" />
        <EmptyState icon="pharmacy" title="暂无数据" copy="调整条件后重试。" />
      </div>
    </section>
  </main>
}
