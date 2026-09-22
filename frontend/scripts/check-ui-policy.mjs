import { readFileSync } from 'node:fs'
import { collectFindings, newFindings, validateBaseline } from './ui-policy.mjs'

try {
  const baseline = JSON.parse(readFileSync(new URL('./ui-policy-baseline.json', import.meta.url), 'utf8'))
  validateBaseline(baseline)
  const exceptions = JSON.parse(readFileSync(new URL('./ui-policy-exceptions.json', import.meta.url), 'utf8'))
  const findings = collectFindings(new URL('../src/', import.meta.url))
  const violations = newFindings(findings, baseline, exceptions)
  if (process.argv.includes('--audit')) {
    for (const item of findings) console.log(`${item.file}:${item.line} [${item.rule}] ${item.fingerprint} ${item.code}`)
  }
  if (violations.length) {
    console.error('新增 UI 规则检查失败：')
    for (const item of violations) console.error(`${item.file}:${item.line} [${item.rule}] ${item.message}\n  指纹 ${item.fingerprint}：${item.code}`)
    process.exitCode = 1
  } else console.log(`新增 UI 规则检查通过（匹配历史基线/例外 ${findings.length} 处；不代表存量合规）`)
} catch (error) {
  console.error(`UI 规则检查无法完成：${error.message}`)
  process.exitCode = 1
}
