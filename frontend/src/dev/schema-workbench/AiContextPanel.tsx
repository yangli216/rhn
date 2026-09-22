import { useState } from 'react'
import { Alert, Button, FormField, PanelHead, Select } from '../../shared/ui'
import { download, messageOf, request, type Table } from './api'

export function AiContextPanel({ table }: { table: Table }) {
  const [scope, setScope] = useState('table'), [markdown, setMarkdown] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  async function generate() {
    setBusy(true); setMessage('')
    try { const data = await request<{ markdown: string }>(`context?${scope === 'table' ? `table=${table.physical}` : `domain=${table.domain}`}`); setMarkdown(data.markdown) }
    catch (e) { setMessage(messageOf(e)) } finally { setBusy(false) }
  }
  return <>
    <PanelHead title="为 AI 准备当前任务的数据库上下文" />
    <p>包含字段定义、完整复合关系、代码出处、已登记的业务说明，以及现有统计实体和指标口径。默认排除未确认的业务关系和候选关系。</p>
    <div className="schema-toolbar"><Select aria-label="AI 上下文范围" value={scope} onChange={value => { setScope(value); setMarkdown('') }} clearable={false}
      options={[{ value: 'table', label: `当前表 · ${table.physical}` }, { value: 'domain', label: `当前业务域 · ${table.domain}` }]} />
      <Button busy={busy} onClick={() => void generate()}>生成 AI 上下文</Button>
      <Button variant="secondary" onClick={async () => { try { await request('export', 'POST', {}); setMessage('已更新 docs/database/generated 分域目录') } catch (e) { setMessage(messageOf(e)) } }}>更新分域资料</Button></div>
    {message && <Alert tone="info" onDismiss={() => setMessage('')}>{message}</Alert>}
    {markdown && <><FormField label="可复制的数据库上下文"><textarea readOnly rows={24} value={markdown} /></FormField><div className="schema-actions">
      <Button variant="secondary" onClick={() => download(`rhn-schema-${scope === 'table' ? table.physical : table.domain}.md`, markdown)}>下载 Markdown</Button>
      <Button onClick={async () => { try { await navigator.clipboard.writeText(markdown); setMessage('已复制上下文') } catch { setMessage('剪贴板不可用，可选中文本复制或下载') } }}>复制上下文</Button>
    </div></>}
    <PanelHead title="开发代理的读取入口" /><pre>{`docs/database/README.md\ndocs/database/generated/index.json\ndocs/database/generated/${table.domain}.json\n\ncd frontend\nnpm run schema:context -- --table ${table.physical}`}</pre>
  </>
}
