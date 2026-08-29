import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const outputDir = path.dirname(fileURLToPath(import.meta.url))

const C = {
  ink: '#173B3A',
  muted: '#667B79',
  line: '#C9D8D5',
  paper: '#F5F8F7',
  white: '#FFFFFF',
  teal: '#15756C',
  teal2: '#2F9589',
  mint: '#E4F3F0',
  mint2: '#CDEAE5',
  blue: '#3878A6',
  blueBg: '#E8F1F7',
  amber: '#B87822',
  amberBg: '#F8EDDC',
  coral: '#B95F54',
  coralBg: '#F9EAE7',
  violet: '#765B9E',
  violetBg: '#F0EBF7',
  slate: '#506B78',
  slateBg: '#EAF0F2',
}

function defs() {
  return `<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#F8FBFA"/><stop offset="1" stop-color="#EEF5F3"/>
    </linearGradient>
    <linearGradient id="hero" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#125F59"/><stop offset="1" stop-color="#1C8278"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="160%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#173B3A" flood-opacity="0.09"/>
    </filter>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#6D918C"/>
    </marker>
    <marker id="arrowTeal" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#15756C"/>
    </marker>
  </defs>`
}

function start(title, subtitle, badge) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  ${defs()}
  <rect width="1920" height="1080" fill="url(#bg)"/>
  <circle cx="1810" cy="-30" r="250" fill="#D9EEEA" opacity="0.55"/>
  <circle cx="45" cy="1050" r="220" fill="#E2F1EE" opacity="0.65"/>
  <g font-family="PingFang SC, Microsoft YaHei, Noto Sans CJK SC, sans-serif">
    <text x="72" y="68" font-size="18" font-weight="700" letter-spacing="2" fill="${C.teal}">健域智枢 · REGIONAL HEALTH NEXUS</text>
    <text x="72" y="119" font-size="42" font-weight="760" fill="${C.ink}">${title}</text>
    <text x="72" y="153" font-size="18" fill="${C.muted}">${subtitle}</text>
    <rect x="1646" y="66" width="202" height="42" rx="21" fill="${C.mint2}"/>
    <text x="1747" y="93" text-anchor="middle" font-size="16" font-weight="700" fill="${C.teal}">${badge}</text>`
}

function end(source) {
  return `<text x="72" y="1042" font-size="14" fill="#78908D">${source}</text>
    <text x="1848" y="1042" text-anchor="end" font-size="14" font-weight="650" fill="#78908D">RHN · 2026.08</text>
  </g>
</svg>`
}

function rect(x, y, w, h, { fill = C.white, stroke = C.line, r = 18, shadow = false, sw = 1.5, dash = '' } = {}) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${dash ? `stroke-dasharray="${dash}"` : ''} ${shadow ? 'filter="url(#shadow)"' : ''}/>`
}

function text(x, y, content, { size = 18, fill = C.ink, weight = 500, anchor = 'start', spacing = 0 } = {}) {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" letter-spacing="${spacing}" fill="${fill}">${content}</text>`
}

function lines(x, y, values, { size = 16, fill = C.muted, weight = 450, gap = 26, anchor = 'start' } = {}) {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" fill="${fill}">${values.map((v, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : gap}">${v}</tspan>`).join('')}</text>`
}

function chip(x, y, w, label, fill = C.mint, color = C.teal) {
  return `${rect(x, y, w, 34, { fill, stroke: 'none', r: 17 })}${text(x + w / 2, y + 23, label, { size: 14, fill: color, weight: 700, anchor: 'middle' })}`
}

function sectionLabel(x, y, num, title, subtitle) {
  return `${rect(x, y, 40, 40, { fill: C.teal, stroke: 'none', r: 12 })}
    ${text(x + 20, y + 27, num, { size: 16, fill: C.white, weight: 800, anchor: 'middle' })}
    ${text(x + 56, y + 18, title, { size: 19, weight: 760 })}
    ${text(x + 56, y + 39, subtitle, { size: 13, fill: C.muted, weight: 500 })}`
}

function arrow(x1, y1, x2, y2, { color = '#6D918C', width = 2, dash = '', marker = 'arrow' } = {}) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ''} marker-end="url(#${marker})"/>`
}

function card(x, y, w, h, title, body, tone = 'teal', badge = '') {
  const tones = {
    teal: [C.mint, C.teal], blue: [C.blueBg, C.blue], amber: [C.amberBg, C.amber],
    coral: [C.coralBg, C.coral], violet: [C.violetBg, C.violet], slate: [C.slateBg, C.slate],
  }
  const [bg, fg] = tones[tone]
  return `${rect(x, y, w, h, { fill: C.white, stroke: '#D6E2E0', r: 18, shadow: true })}
    <rect x="${x}" y="${y}" width="8" height="${h}" rx="4" fill="${fg}"/>
    ${badge ? chip(x + w - 92, y + 18, 70, badge, bg, fg) : ''}
    ${text(x + 24, y + 39, title, { size: 20, weight: 760, fill: fg })}
    ${lines(x + 24, y + 72, body, { size: 14.5, fill: C.muted, gap: 23 })}`
}

function overallDiagram() {
  let s = start('整体架构图', '从使用角色到业务域、共享平台、数据与外部协同的全景视图', 'CURRENT LANDSCAPE')

  s += sectionLabel(72, 184, '01', '使用者与工作入口', '按岗位进入统一门户，携带受信机构 / 科室工作上下文')
  const roles = [
    ['居民 / 患者', '建档 · 就诊 · 支付'], ['医生 / 护士', '接诊 · 医嘱 · 随访'], ['药师 / 库管', '审方 · 发药 · 库存'],
    ['收费 / 财务', '结算 · 票据 · 对账'], ['公卫人员', '筛查 · 任务 · 照护'], ['平台管理员', '组织 · 主数据 · 配置'],
  ]
  roles.forEach(([a, b], i) => {
    const x = 72 + i * 296
    s += rect(x, 246, 266, 74, { fill: C.white, stroke: '#D4E2DF', r: 16 })
    s += text(x + 18, 274, a, { size: 17, weight: 720 })
    s += text(x + 18, 300, b, { size: 13.5, fill: C.muted })
  })

  s += `<rect x="72" y="347" width="1776" height="76" rx="20" fill="url(#hero)" filter="url(#shadow)"/>`
  s += text(112, 380, '统一工作门户', { size: 22, fill: C.white, weight: 760 })
  s += text(112, 405, '工作台 · 多标签页 · 任务与通知 · 岗位菜单 · 个人工作区', { size: 14.5, fill: '#CFEAE6' })
  s += chip(1335, 368, 142, '租户上下文', '#2B8A80', C.white)
  s += chip(1491, 368, 142, '机构上下文', '#2B8A80', C.white)
  s += chip(1647, 368, 166, '科室类型上下文', '#2B8A80', C.white)

  s += sectionLabel(72, 456, '02', '核心业务域', '围绕居民形成门诊诊疗、执行、费用和连续照护闭环')
  const domains = [
    ['居民健康域', ['MPI 主索引与多标识', '档案 / 过敏 / 健康时间轴'], 'teal'],
    ['门诊医疗域', ['排班号源 / 挂号候诊', '接诊 / 病历 / 诊断 / 医嘱'], 'blue'],
    ['检查检验域', ['申请与执行配置', 'LIS / PACS 交换与报告'], 'violet'],
    ['药事供应域', ['审方 / 发退药 / 追溯', '采购 / 库房 / 库存台账'], 'amber'],
    ['费用结算域', ['计费 / 收退款 / 票据', '医保 / 日结 / 渠道对账'], 'coral'],
    ['医防协同域', ['高血压筛查 / 照护计划', '任务 / 随访 / 异常回流'], 'slate'],
  ]
  domains.forEach(([a, b, tone], i) => s += card(72 + i * 296, 520, 266, 134, a, b, tone, i === 5 ? 'M4' : 'RUN'))

  s += sectionLabel(72, 688, '03', '共享平台能力', '业务模块通过公开 API 复用，不直接访问其他模块数据')
  s += card(72, 752, 420, 118, '组织、身份与工作上下文', ['租户 / 机构 / 科室 / 人员 / 任职', 'IAM · 数据范围 · 同类科室单有效上下文'], 'teal')
  s += card(512, 752, 420, 118, '基础数据与配置中心', ['字典 / 术语 / 参数 / 地址', '诊疗项目 / 药品 / 耗材 / 属性 / 组套'], 'blue')
  s += card(952, 752, 420, 118, '协同与可信底座', ['任务 / 通知 / 领域事件 / Outbox', '幂等 / 审计 / 密码证据 / 受控打印'], 'violet')
  s += card(1392, 752, 456, 118, '集成与交换', ['外部消息 / 业务回执 / 版本化契约', '支付 · 医保 · LIS / PACS · 区域平台'], 'amber')

  s += sectionLabel(72, 902, '04', '数据与运行基础', '模块拥有数据、统一迁移、多数据库适配')
  const infra = [
    ['PostgreSQL 17 / Oracle 19c', '生产持久化'], ['H2 兼容模式', '自动化测试'], ['Flyway V1–V66', '双库增量迁移'],
    ['OpenAPI 契约', '前后端类型同步'], ['Actuator / Metrics', '健康与运行指标'], ['PDF / Excel', '受控输出与导入'],
  ]
  infra.forEach(([a, b], i) => {
    const x = 72 + i * 296
    s += rect(x, 964, 266, 58, { fill: '#EEF4F3', stroke: '#D4E0DE', r: 14 })
    s += text(x + 16, 987, a, { size: 14.5, weight: 720 })
    s += text(x + 16, 1008, b, { size: 12.5, fill: C.muted })
  })
  s += end('依据：README、模块目录与依赖规则、建设路线图、数据库迁移 V1–V66')
  return s
}

function technicalDiagram() {
  let s = start('技术架构图', '模块化单体的分层实现、运行组件与工程治理', 'MODULAR MONOLITH')

  s += sectionLabel(72, 184, '01', '客户端与前端应用', 'PC 优先的单页应用，统一组件、契约和状态管理')
  s += card(72, 244, 300, 132, '浏览器 / PC 工作站', ['Chrome / Edge', 'Vite 开发代理 → /api'], 'teal')
  s += arrow(380, 310, 422, 310, { color: C.teal, marker: 'arrowTeal' })
  s += rect(430, 226, 940, 168, { fill: C.white, stroke: '#CFE0DD', r: 22, shadow: true })
  s += text(456, 258, 'React 19.2 + TypeScript 5.9 + Vite 8', { size: 22, weight: 780, fill: C.teal })
  const fe = [['路由与工作区', 'React Router 7'], ['服务端状态', 'TanStack Query 5'], ['表单与校验', 'Hook Form + Zod'], ['设计系统', 'Shared UI + UI 门禁'], ['接口类型', 'OpenAPI TypeScript']]
  fe.forEach(([a, b], i) => {
    const x = 456 + i * 174
    s += rect(x, 278, 158, 88, { fill: i % 2 ? '#F5F9F8' : C.mint, stroke: '#D6E4E1', r: 14 })
    s += text(x + 14, 307, a, { size: 14.5, weight: 720 })
    s += text(x + 14, 337, b, { size: 12.5, fill: C.muted })
  })
  s += rect(1402, 226, 446, 168, { fill: '#F6F9F8', stroke: '#D6E2E0', r: 22 })
  s += text(1428, 258, '会话与请求上下文', { size: 20, weight: 760, fill: C.slate })
  s += lines(1428, 291, ['Spring Security Session', 'X-Organization-Id', 'X-Department-Id · Idempotency-Key'], { size: 14, gap: 27 })

  s += sectionLabel(72, 426, '02', 'HTTP 契约与应用入口', '统一错误、鉴权、校验、字典翻译和幂等写入')
  s += `<rect x="72" y="487" width="1298" height="72" rx="18" fill="url(#hero)"/>`
  s += text(102, 518, 'REST / JSON · OpenAPI 3 · Controller / Advice', { size: 19, fill: C.white, weight: 760 })
  s += text(102, 543, '请求校验 · 稳定错误契约 · 数据范围复核 · 响应字段字典翻译', { size: 13.5, fill: '#CFEAE6' })
  s += card(1402, 470, 446, 105, '安全边界', ['Spring Security · IAM · 数据范围', '关键数据失败关闭 · 密码服务适配'], 'coral')

  s += sectionLabel(72, 598, '03', 'Java 21 / Spring Boot 4.1 模块化单体', '一个主要部署单元，按领域隔离；跨模块只依赖公开 API')
  s += rect(72, 662, 1298, 254, { fill: C.white, stroke: '#BFD6D2', r: 24, shadow: true, sw: 2 })
  const layers = [
    ['web', 'HTTP 适配', C.teal, C.mint], ['application', '用例编排 / 事务', C.blue, C.blueBg],
    ['domain', '实体 / 值对象 / 状态机', C.violet, C.violetBg], ['infrastructure', 'JPA / 外部接口 / 框架', C.amber, C.amberBg],
  ]
  layers.forEach(([a, b, fg, bg], i) => {
    const x = 98 + i * 305
    s += rect(x, 692, 280, 64, { fill: bg, stroke: 'none', r: 14 })
    s += text(x + 18, 719, a, { size: 17, fill: fg, weight: 780 })
    s += text(x + 18, 742, b, { size: 13, fill: C.muted })
    if (i < 3) s += arrow(x + 282, 724, x + 300, 724)
  })
  const mods = ['platform', 'healthcore', 'outpatient', 'diagnostics', 'pharmacy', 'billing', 'healthplanning', 'workmanagement']
  mods.forEach((m, i) => s += chip(98 + (i % 4) * 305, 788 + Math.floor(i / 4) * 54, 280, m, i < 2 ? C.mint : '#EEF4F3', i < 2 ? C.teal : C.slate))
  s += text(98, 900, '约束：模块拥有自己的表 · Controller 不直接访问 Repository · 领域事件通过 Outbox 传播', { size: 13.5, fill: C.muted, weight: 580 })

  s += rect(1402, 630, 446, 286, { fill: C.white, stroke: '#D0DEDC', r: 24, shadow: true })
  s += text(1428, 670, '运行与工程治理', { size: 21, weight: 780, fill: C.slate })
  const ops = [['持久化', 'Spring Data JPA / Hibernate'], ['迁移', 'Flyway · PostgreSQL / Oracle'], ['可靠性', 'Outbox / Inbox / 幂等 / Caffeine'], ['质量', 'JUnit · ArchUnit · Vitest'], ['可观测', 'Actuator / Health / Metrics'], ['交付', 'Maven · npm · Docker Compose']]
  ops.forEach(([a, b], i) => {
    const y = 699 + i * 34
    s += text(1428, y, a, { size: 13.5, weight: 750, fill: C.teal })
    s += text(1502, y, b, { size: 13.5, fill: C.muted })
  })

  s += sectionLabel(72, 944, '04', '持久化与外部适配', '交易事实、投影、交换消息均可审计和追溯')
  const bottom = [['关系数据库', 'PostgreSQL 17 / Oracle 19c'], ['测试数据库', 'H2 PostgreSQL 兼容'], ['文件输出', 'OpenPDF · Apache POI'], ['外部系统', 'LIS / PACS · 医保 · 支付 · 区域平台']]
  bottom.forEach(([a, b], i) => {
    const x = 585 + i * 316
    s += rect(x, 944, 292, 78, { fill: C.white, stroke: '#D4E1DF', r: 15 })
    s += text(x + 16, 974, a, { size: 15, weight: 740 })
    s += text(x + 16, 1000, b, { size: 13, fill: C.muted })
  })
  s += end('依据：backend/pom.xml、frontend/package.json、ADR-001、模块目录与依赖规则')
  return s
}

function processNode(x, y, w, num, title, sub, tone = 'teal') {
  const tones = { teal: [C.teal, C.mint], blue: [C.blue, C.blueBg], violet: [C.violet, C.violetBg], amber: [C.amber, C.amberBg], coral: [C.coral, C.coralBg], slate: [C.slate, C.slateBg] }
  const [fg, bg] = tones[tone]
  return `${rect(x, y, w, 108, { fill: C.white, stroke: '#D2E0DE', r: 18, shadow: true })}
    <circle cx="${x + 28}" cy="${y + 28}" r="16" fill="${fg}"/>
    ${text(x + 28, y + 34, num, { size: 13, fill: C.white, weight: 800, anchor: 'middle' })}
    ${text(x + 54, y + 34, title, { size: 17, weight: 760, fill: fg })}
    ${lines(x + 18, y + 67, sub, { size: 13.5, gap: 22 })}
    <rect x="${x}" y="${y + 98}" width="${w}" height="10" rx="5" fill="${bg}"/>`
}

function businessDiagram() {
  let s = start('业务架构图', '以居民为中心的门诊医疗、药事费用与医防协同能力地图', 'PATIENT-CENTERED')

  s += sectionLabel(72, 184, '01', '业务参与方', '同一平台支撑多岗位协作，各岗位在授权上下文内处理业务')
  const actors = [['居民 / 患者', '服务对象'], ['临床团队', '医生 · 护士'], ['医技团队', '检验 · 检查'], ['药事团队', '药师 · 库管'], ['运营团队', '收费 · 财务'], ['治理团队', '公卫 · 管理员']]
  actors.forEach(([a, b], i) => {
    const x = 72 + i * 296
    s += rect(x, 244, 266, 62, { fill: i === 0 ? C.mint : C.white, stroke: '#D2E1DE', r: 16 })
    s += text(x + 16, 270, a, { size: 16.5, weight: 740, fill: i === 0 ? C.teal : C.ink })
    s += text(x + 16, 291, b, { size: 12.5, fill: C.muted })
  })

  s += sectionLabel(72, 342, '02', '核心业务价值链', '从居民识别到连续照护的端到端闭环')
  const flow = [
    ['居民识别', ['MPI 建档 / 合并', '人口与保障档案'], 'teal'],
    ['预约挂号', ['排班 / 号源 / 现场挂号', '候诊队列'], 'blue'],
    ['门诊接诊', ['生命体征 / 诊断', '病历签署'], 'violet'],
    ['医嘱处方', ['诊疗申请 / 处方组', '规则与价格快照'], 'amber'],
    ['执行交付', ['检验检查 / 审方发药', '报告与追溯'], 'teal'],
    ['费用结算', ['收退费 / 票据 / 医保', '日结与渠道对账'], 'coral'],
    ['医防协同', ['筛查 / 照护计划', '任务 / 随访 / 回流'], 'slate'],
  ]
  flow.forEach(([a, b, tone], i) => {
    const x = 72 + i * 252
    s += processNode(x, 408, 220, String(i + 1).padStart(2, '0'), a, b, tone)
    if (i < flow.length - 1) s += arrow(x + 224, 462, x + 246, 462, { color: C.teal, marker: 'arrowTeal' })
  })

  s += sectionLabel(72, 554, '03', '执行与运营能力域', '临床意图、医技执行、药品供应和财务事实相互解耦又可追溯')
  const ops = [
    ['门诊医疗', ['排班与号源', '挂号候诊', '接诊诊断', '临床文档', '医嘱与处方'], 'blue'],
    ['检查检验', ['项目执行配置', '标本 / 部位', '附加项目', '多部位计价', 'LIS / PACS 报告'], 'violet'],
    ['药事与供应', ['药品产品与供应商', '审方与选品', '批次 / 货位 / 库存', '采购调拨盘点', '发退药与追溯'], 'amber'],
    ['费用与医保', ['费用事项与应收', '支付编排', '结算凭证 / 票据', '医保申报与冲正', '日结 / 对账'], 'coral'],
    ['健康管理', ['高血压候选识别', '病情与观察', '照护计划', '岗位任务', '异常回到临床'], 'slate'],
  ]
  ops.forEach(([title, body, tone], i) => s += card(72 + i * 355, 618, 325, 166, title, body, tone))

  s += sectionLabel(72, 820, '04', '业务支撑与治理底座', '统一标准、统一上下文、统一审计，为业务模块提供稳定能力')
  const supports = [
    ['组织与权限', '租户 · 机构 · 科室 · 人员 · 任职 · 数据范围'],
    ['主数据中心', '诊疗项目 · 药品 · 耗材 · 组套 · 单位 · 厂商'],
    ['标准与配置', '字典 · 术语 · 参数 · 扩展属性 · 分层作用域'],
    ['协同与可信', '任务 · 通知 · 事件 · 幂等 · 审计 · 密码证据'],
    ['集成与输出', '外部交换 · 受控打印 · 导入导出 · 业务回执'],
  ]
  supports.forEach(([a, b], i) => {
    const x = 72 + i * 355
    s += rect(x, 884, 325, 92, { fill: i % 2 ? '#F4F8F7' : C.white, stroke: '#D3E1DE', r: 17 })
    s += text(x + 18, 915, a, { size: 16.5, weight: 760, fill: C.teal })
    s += lines(x + 18, 944, [b], { size: 12.7, fill: C.muted })
  })

  s += `<path d="M 174 804 L 174 798 L 1690 798 L 1690 804" fill="none" stroke="#AFC8C4" stroke-width="2" stroke-dasharray="5 5"/>`
  s += end('依据：当前前端工作区、后端业务模块、建设路线图 M1–M4 与医疗运营主数据方案')
  return s
}

const files = {
  '01-rhn-overall-architecture.svg': overallDiagram(),
  '02-rhn-technical-architecture.svg': technicalDiagram(),
  '03-rhn-business-architecture.svg': businessDiagram(),
}

for (const [name, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(outputDir, name), content, 'utf8')
}

console.log(Object.keys(files).map((name) => path.join(outputDir, name)).join('\n'))
