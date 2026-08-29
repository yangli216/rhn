import { readFileSync, readdirSync } from 'node:fs'
import { extname, relative } from 'node:path'

const sourceRoot = new URL('../src/', import.meta.url)
const tokenFile = 'styles/tokens.css'
const sourceExtensions = new Set(['.css', '.ts', '.tsx'])
const violations = []

function collect(directoryUrl) {
  return readdirSync(directoryUrl, { withFileTypes: true }).flatMap((entry) => {
    const entryUrl = new URL(entry.name, directoryUrl)
    return entry.isDirectory() ? collect(new URL(`${entry.name}/`, directoryUrl)) : [entryUrl]
  })
}

function report(file, line, rule, value) {
  violations.push(`${file}:${line} [${rule}] ${value}`)
}

for (const fileUrl of collect(sourceRoot)) {
  if (!sourceExtensions.has(extname(fileUrl.pathname))) continue
  const file = relative(sourceRoot.pathname, fileUrl.pathname)
  const lines = readFileSync(fileUrl, 'utf8').split('\n')

  lines.forEach((line, index) => {
    const lineNumber = index + 1

    if (file !== tokenFile) {
      const rawColors = line.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g) ?? []
      rawColors.forEach((value) => report(file, lineNumber, 'raw-color', `${value} 应定义为语义令牌`))
    }

    const legacyNames = line.match(/--(?:teal|teal-dark|teal-soft|ink|muted|line|surface|shadow)(?=\s*[:),;])/g) ?? []
    legacyNames.forEach((value) => report(file, lineNumber, 'legacy-token', `${value} 已废弃`))

    const fontSize = line.match(/font-size:\s*([0-9.]+)px/)
    if (fontSize && Number(fontSize[1]) < 12) {
      report(file, lineNumber, 'minimum-font-size', `${fontSize[1]}px 小于 12px`)
    }

    if (/className=["'{`][^\n]*(?:primary-button|secondary-button|error-banner|status-pill|panel-head)/.test(line)) {
      report(file, lineNumber, 'legacy-component', '请使用 shared/ui 组件')
    }

    if (file.startsWith('features/settings/') && /<select\b/.test(line)) {
      report(file, lineNumber, 'native-platform-select', '平台管理下拉请使用 shared/ui Select、FormSelect 或 DictionarySelect')
    }
  })
}

if (violations.length > 0) {
  console.error('UI 规范检查失败：\n')
  console.error(violations.join('\n'))
  process.exit(1)
}

console.log('UI 规范检查通过')
