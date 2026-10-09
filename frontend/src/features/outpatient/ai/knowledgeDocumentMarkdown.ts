export function normalizeKnowledgeDocumentMarkdown(
  value: string | undefined,
  { medication = false }: { medication?: boolean } = {},
) {
  if (!value) return ''

  let markdown = value.replace(/\r\n?/g, '\n').trim()

  // Metadata and the first heading are already represented by the panel header.
  markdown = markdown
    .replace(/^---[ \t]*\n[\s\S]*?\n---[ \t]*(?:\n|$)/, '')
    .trimStart()
    .replace(/^#[ \t]+[^\n]*(?:\n+|$)/, '')
    .trimStart()

  if (medication) {
    // Drug insert documents repeat the structured summary as a leading blockquote.
    markdown = markdown
      .replace(/^(?:>[^\n]*(?:\n|$))+(?:[ \t]*\n)*(?:---[ \t]*(?:\n|$))?/, '')
      .trimStart()
  }

  // The upstream wiki supports Obsidian-style links. Show their readable label in RHN.
  return markdown
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .trim()
}
