import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { collectFindings } from '../frontend/scripts/ui-policy.mjs'
import { frontendComplexity, hooksAudit } from '../frontend/scripts/code-quality.mjs'

const root = path.resolve(import.meta.dirname, '..')
const revision = '467acbac78b4f12ecb5227b028adba807e5c60e5'
const paths = [
  'frontend/src/features/outpatient/DoctorWorkstation.tsx',
  'frontend/src/features/settings/BasicDataManagement.tsx',
  'frontend/src/features/settings/OperationalMasterDataPanel.tsx',
  'frontend/src/features/pharmacy/PharmacyWorkspace.tsx',
  'backend/rhn-platform/src/main/java/com/rhn/platform/masterdata/application/MasterDataApplicationService.java',
  'backend/rhn-intelligence/src/main/java/com/rhn/ai/application/ClinicalAssistantApplicationService.java',
]
const lines = text => text.trimEnd().split('\n').length
const collaborators = (file, text) => {
  if (!file.endsWith('.java')) return undefined
  const name = path.basename(file, '.java')
  const signature = text.match(new RegExp(`public ${name}\\(([\\s\\S]*?)\\)\\s*\\{`))?.[1]
  if (!signature) throw new Error(`Missing constructor: ${file}`)
  return signature.split(',').length
}
const hotspots = paths.map(file => {
  const before = execFileSync('git', ['show', `${revision}:${file}`], { cwd: root, encoding: 'utf8' })
  const after = fs.readFileSync(path.join(root, file), 'utf8')
  return { file, beforeLines: lines(before), lines: lines(after),
    beforeCollaborators: collaborators(file, before), collaborators: collaborators(file, after) }
})
const ui = collectFindings(pathToFileURL(path.join(root, 'frontend/src/')))
const uiRules = Object.fromEntries([...new Set(ui.map(item => item.rule))].sort().map(rule =>
  [rule, ui.filter(item => item.rule === rule).length]))
const scopes = JSON.parse(fs.readFileSync(path.join(root, 'scripts/verification-scopes.json'), 'utf8')).scopes
const report = {
  version: 1, baselineRevision: revision,
  generatedBy: 'node scripts/ai-readiness-report.mjs',
  sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  attribution: 'Working source statistics. sourceHead records HEAD at generation time, not a freshness requirement. Verification snapshots separately attribute tested content; counts do not prove visual or clinical quality.',
  hotspots,
  hooksDebt: (await hooksAudit(path.join(root, 'frontend'))).length,
  uiFindings: ui.length, uiRules,
  scopes: Object.fromEntries(Object.entries(scopes).map(([name, scope]) => [name, {
    frontendTests: scope.frontend.length, backendTests: scope.backend.length,
    coverage: scope.coverage, limitations: scope.limitations,
  }])),
  frontendComplexity: frontendComplexity(path.join(root, 'frontend')),
}
const output = path.join(root, 'docs/ai/ai-development-metrics.json')
if (process.argv.includes('--check')) {
  const { sourceHead: storedHead, ...storedMetrics } = JSON.parse(fs.readFileSync(output, 'utf8'))
  const { sourceHead: currentHead, ...currentMetrics } = report
  if (JSON.stringify(storedMetrics) !== JSON.stringify(currentMetrics)) {
    console.error('Metrics are stale; run node scripts/ai-readiness-report.mjs')
    process.exitCode = 1
  }
} else {
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
  console.log(`Metrics: ${hotspots.length} hotspots, ${report.hooksDebt} Hooks debt, ${ui.length} UI findings, ${Object.keys(scopes).length} scopes`)
}
