/** Development-only bridge. Runtime analytics publishing remains a separate operation. */
export async function saveDevelopmentSemanticProposal(value: {
  entity: string; prompt: string; rationale: string; suggestedYamlDiff: string
}): Promise<{ id: string }> {
  if (!import.meta.env.DEV) throw new Error('语义开发评审队列仅在开发服务中提供')
  const response = await fetch('/__dev/schema/proposals', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-RHN-Dev-Workbench': '1' }, body: JSON.stringify(value) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || '保存共建建议失败')
  return data
}
