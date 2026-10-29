// Fast UI gate for the files being edited or committed, so feedback arrives while writing code.
// Usage: node scripts/check-ui-files.mjs <file...>   (paths relative to cwd or absolute)
//        node scripts/check-ui-files.mjs --staged   (checks staged content from the git index)
// Same rules and baseline as `npm run ui:check`; other tasks' uncommitted files are not reported.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { extname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inPolicyScope, newFindings, scanAddedCssLayout, scanSource, validateBaseline } from './ui-policy.mjs'
import { inspectStandardsFile } from './ui-standards-rules.mjs'

const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url))
const sourceExtensions = new Set(['.css', '.ts', '.tsx'])
const staged = process.argv.includes('--staged')

function git(args) {
  return execFileSync('git', args, { cwd: sourceRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

function targets() {
  if (!staged) {
    return process.argv.slice(2).filter(arg => !arg.startsWith('--'))
      .map(arg => resolve(arg)).filter(path => existsSync(path))
      .map(path => ({ path, read: () => readFileSync(path, 'utf8') }))
  }
  const top = git(['rev-parse', '--show-toplevel']).trim()
  return git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']).split('\0').filter(Boolean)
    .map(name => ({ path: resolve(top, name), read: () => git(['show', `:${name}`]) }))
}

// 新增行号：暂存模式比较索引与 HEAD，否则比较工作区与 HEAD；HEAD 中不存在的文件视为全部新增。
function addedLines(item, source) {
  let tracked = true
  try { git(['cat-file', '-e', `HEAD:${relative(resolve(git(['rev-parse', '--show-toplevel']).trim()), item.path).replaceAll('\\', '/')}`]) } catch { tracked = false }
  if (!tracked) return { added: new Set(source.split('\n').map((_, index) => index + 1)), removedProps: new Set() }
  const diff = git(['diff', ...(staged ? ['--cached'] : ['HEAD']), '-U0', '--', item.path])
  const added = new Set()
  const removedProps = new Set([...diff.matchAll(/^-\s*([a-z-]+)\s*:/gm)].map(match => match[1]))
  for (const match of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(match[1]); const count = match[2] === undefined ? 1 : Number(match[2])
    for (let line = start; line < start + count; line++) added.add(line)
  }
  return { added, removedProps }
}

try {
  const files = targets()
    .map(item => ({ ...item, file: relative(sourceRoot, item.path).replaceAll('\\', '/') }))
    .filter(item => !item.file.startsWith('..') && sourceExtensions.has(extname(item.file)))
  if (!files.length) process.exit(0)

  const baseline = JSON.parse(readFileSync(new URL('./ui-policy-baseline.json', import.meta.url), 'utf8'))
  validateBaseline(baseline)
  const exceptions = JSON.parse(readFileSync(new URL('./ui-policy-exceptions.json', import.meta.url), 'utf8'))
  const violations = []
  const policyFindings = []
  for (const item of files) {
    const source = item.read()
    for (const finding of inspectStandardsFile(item.file, source)) violations.push(`${item.file}:${finding.line} [${finding.rule}] ${finding.value}`)
    if (inPolicyScope(item.file)) policyFindings.push(...scanSource(item.file, source))
    const { added, removedProps } = item.file.endsWith('.css') ? addedLines(item, source) : { added: new Set(), removedProps: new Set() }
    for (const finding of scanAddedCssLayout(item.file, source, added, removedProps)) {
      violations.push(`${item.file}:${finding.line} [${finding.rule}] ${finding.message}\n  ${finding.code}`)
    }
  }
  for (const item of newFindings(policyFindings, baseline, exceptions)) {
    violations.push(`${item.file}:${item.line} [${item.rule}] ${item.message}\n  指纹 ${item.fingerprint}：${item.code}`)
  }
  if (violations.length) {
    console.error(`UI 规范检查失败（${files.length} 个文件）：\n${violations.join('\n')}`)
    console.error('\n修正方式见 docs/ai/frontend-ui.md「样式和滚动边界」「自动规则与例外」；不要把新增违规加入历史基线。')
    process.exitCode = 1
  }
} catch (error) {
  console.error(`UI 规范检查无法完成：${error.message}`)
  process.exitCode = 1
}
