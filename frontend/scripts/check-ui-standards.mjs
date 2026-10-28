import { readFileSync, readdirSync } from 'node:fs'
import { extname, relative } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { inspectStandardsFile } from './ui-standards-rules.mjs'

const sourceRoot = new URL('../src/', import.meta.url)
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
  for (const finding of inspectStandardsFile(file, readFileSync(fileUrl, 'utf8'))) report(file, finding.line, finding.rule, finding.value)
}

// Always run the incremental rules, even when pre-existing full-scope rules fail.
const policy = spawnSync(process.execPath, [fileURLToPath(new URL('./check-ui-policy.mjs', import.meta.url))], { stdio: 'inherit' })

if (violations.length > 0) {
  console.error('UI 规范检查失败：\n')
  console.error(violations.join('\n'))
  process.exit(1)
}

if (policy.status !== 0) process.exit(1)

console.log('UI 规范检查通过')
