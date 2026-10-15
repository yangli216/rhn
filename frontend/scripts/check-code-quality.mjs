import fs from 'node:fs'
import path from 'node:path'
import { frontendComplexity, hooksAudit, importFindings, labelMapFindings, newHookFindings, newImportFindings, newLabelMapFindings, sourceFiles } from './code-quality.mjs'

try {
  const cwd = process.cwd()
  const sources = sourceFiles(path.join(cwd, 'src')).map(file => [path.relative(cwd, file).split(path.sep).join('/'), fs.readFileSync(file, 'utf8')])
  const imports = sources.flatMap(([file, source]) => importFindings(file, source))
  const labelMaps = sources.flatMap(([file, source]) => labelMapFindings(file, source))
  const labelMapBaseline = JSON.parse(fs.readFileSync('scripts/label-map-baseline.json', 'utf8'))
  const newLabelMaps = newLabelMapFindings(labelMaps, labelMapBaseline)
  const baseline = JSON.parse(fs.readFileSync('scripts/hooks-baseline.json', 'utf8'))
  const exceptions = JSON.parse(fs.readFileSync('scripts/dependency-exceptions.json', 'utf8'))
  const hooks = await hooksAudit(cwd)
  const failures = [...newHookFindings(hooks, baseline), ...newImportFindings(imports, exceptions), ...newLabelMaps]
  const report = { hooks: hooks.length, newHooks: newHookFindings(hooks, baseline).length,
    dependencies: imports.length, newDependencies: newImportFindings(imports, exceptions).length,
    labelMaps: labelMaps.length, newLabelMaps: newLabelMaps.length, complexity: frontendComplexity(cwd) }
  if (process.argv.includes('--report')) console.log(JSON.stringify(report, null, 2))
  else {
    console.log(`Code quality: Hooks debt=${report.hooks}, new=${report.newHooks}; cross-boundary=${report.dependencies}, new=${report.newDependencies}; label maps=${report.labelMaps}, new=${report.newLabelMaps}`)
    console.log(`Complexity reminder: ${report.complexity.filter(file => file.lines > 500).length} files >500 lines; use domain boundaries before adding responsibilities (code:report for details).`)
    for (const finding of failures) console.error(`${finding.file}:${finding.line} ${finding.rule}: ${finding.message ?? finding.specifier}`)
  }
  process.exitCode = failures.length ? 1 : 0
} catch (error) {
  console.error(`Code quality setup error: ${error.message}`)
  process.exitCode = 2
}
