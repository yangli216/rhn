import fs from 'node:fs/promises'
import { columnNamingRules, columnNamingIssues } from './naming.mjs'

const root = new URL('../../', import.meta.url)
const read = async file => JSON.parse(await fs.readFile(new URL(file, root), 'utf8'))
const manifest = await read('docs/database/column-renames-1.77.0.json')
const mapping = await read('docs/foundation/rhn-physical-schema-map.json')
const { renames } = manifest
const tables = new Map(mapping.map(table => [table.physical, table]))
const safe = text => String(text).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
for (const row of renames) {
  if (columnNamingIssues(row.after).length || !tables.get(row.table)?.columns.some(c => c.physical === row.after && c.logical === row.logicalColumn)) {
    throw new Error(`改名清单与当前目录不符：${row.table}.${row.before} → ${row.after}`)
  }
}
const naming = ['# 物理字段缩写词典与命名规则', '',
  '维护源：`physical-column-abbreviations.json`。本页与逐表清单由 `node scripts/schema-workbench/generate-naming-docs.mjs` 生成。', '',
  '- 字段整体不超过 30 字符；按下划线分词，每段不超过 7 字符。只允许大写字母、数字与下划线，不能有空词段。',
  '- 完整名称 `REVISION` 是已登记的乐观锁例外；带前后缀的名称不继承此例外。',
  `- 词典中的 \`REVISION → REV\` 用于组合名称，例如 \`NO_REVISION → NO_REV\`；${mapping.reduce((count, table) => count + table.columns.filter(c => c.physical === 'REVISION').length, 0)} 个完整 \`REVISION\` 字段继续沿用原名。`,
  '- 长词必须先登记缩写及完整词，不得机械截断。复用已有同义缩写；不同含义不得分配相同的新缩写。',
  '- 逻辑名、Java/API 属性和枚举值保持原有业务契约。物理表名、约束名不参与本轮字段改名。',
  '- 本词典登记本轮长词治理使用的缩写；已有合规短词沿用物理目录。扩展时同时核对目录中的已有含义，并校验表内字段无重名。',
  '- `REQUESTED → REQD`（已请求）与 `REQUIRED → RQD`（必需）含义不同；`DESCRIPTION → DESCR` 避免与说明字段前缀 `DES_` 混淆。', '',
  '示例：`DT_OCCURRED → DT_OCCRD`、`JSON_SNAPSHOT → JSON_SNAP`、`CD_CURRENCY → CD_CCY`、`DES_MERIDIAN_DESCRIPTION → DES_MERID_DESCR`。', '',
  '| 完整词 | 统一缩写 |', '| --- | --- |',
  ...Object.entries(columnNamingRules.abbreviations).map(([word, abbr]) => `| ${word} | ${abbr} |`), '',
  '## 变更验证', '',
  '`schema:check` 和后端治理测试拒绝长词字段；工作台会给出已登记词的建议名。改名清单通过新增配对迁移原位执行，保留数据及主外键、索引和注释。', '',
  '执行升级前应完成数据备份并停止旧应用写入，数据库迁移与新应用版本一同切换；不要单独将旧应用连接到新字段结构。已部署迁移不重写；回退使用备份或经评审的逆向迁移。', '',
  '工作台采集保持只读；本页和清单表示代码中的目标结构，不证明某个 Oracle 实例已完成升级，实际状态以「结构对照」为准。', '']
const report = ['# 字段命名优化 · 1.77.0 逐表清单', '',
  `范围：${new Set(renames.map(r => r.table)).size} 张表、${renames.length} 个物理字段、${Object.keys(columnNamingRules.abbreviations).length} 个长词。保留逻辑字段名、Java/API 属性及枚举值。`, '',
  '权威清单：`column-renames-1.77.0.json`。PostgreSQL / Oracle 使用配对的 `V1_77_0__governed_column_abbreviations.sql`，原位改名；不覆盖历史迁移。', '',
  '本清单仅描述目标变更，不表示 Oracle 现库已执行迁移。工作台「结构对照」显示现库是否仍使用旧名。', '',
  '另补齐 1.76.0 已增加字段 `RHN_BD_MED_STD_SOURCE.CD_BINDING_CLAIM` 的目录登记与中文注释，字段含义和约束不变。', '']
for (const name of [...new Set(renames.map(r => r.table))].sort()) {
  const table = tables.get(name)
  report.push(`## ${name} · ${table.logical}`, '', safe(table.comment), '',
    '| 原物理名 | 新物理名 | 逻辑名 | 业务含义 |', '| --- | --- | --- | --- |',
    ...renames.filter(r => r.table === name).map(r => `| ${r.before} | ${r.after} | ${r.logicalColumn} | ${safe(r.comment)} |`), '')
}
await fs.writeFile(new URL('docs/database/physical-column-naming.md', root), naming.join('\n'))
await fs.writeFile(new URL('docs/database/column-renames-1.77.0.md', root), report.join('\n'))
console.log(`已生成缩写词典与 ${renames.length} 个字段的逐表清单`)
