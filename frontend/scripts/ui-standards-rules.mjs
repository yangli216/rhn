import ts from 'typescript'

const rawColor = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g
const legacyClass = /(?:^|\s)(?:primary-button|secondary-button|error-banner|status-pill|panel-head)(?=\s|$)/
// 展示格式化统一走共享函数，便于日后切换语言；排序/分词类 Intl API 不属于展示格式化。
const localeFormatOwners = new Set(['shared/format.ts', 'shared/utils/precision.ts', 'shared/utils/dateRange.ts'])
const localeFormatMethods = new Set(['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString'])
const nonFormattingIntl = new Set(['Collator', 'Segmenter'])
const inpatientStationFiles = new Set([
  'features/inpatient/InpatientDoctorStation.tsx',
  'features/inpatient/InpatientAdmissionDiagnosisPanel.tsx',
  'features/inpatient/InpatientDiagnosticResults.tsx',
  'features/inpatient/InpatientMedicalRecordWorkspace.tsx',
  'features/inpatient/InpatientOrderWorkspace.tsx',
  'features/inpatient/InpatientNurseStation.tsx',
  'features/inpatient/InpatientNursingWorkspace.tsx',
  'features/inpatient/InpatientShiftHandoffWorkspace.tsx',
  'features/inpatient/InpatientStationShared.tsx',
  'features/inpatient/InpatientTemperatureChart.tsx',
])

/** Inspect color-valued strings and JSX classes, not human-readable record identifiers. */
export function inspectUiLiterals(file, source) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const findings = []
  const checkLocaleFormat = !localeFormatOwners.has(file) && !/\.test\.tsx?$/.test(file)
  function report(node, rule, value) {
    findings.push({ line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1, rule, value })
  }
  function visit(node) {
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      const value = node.text
      if (/^\s*(?:#[\da-f]{3,8}|rgba?\([^)]*\))\s*$/i.test(value)
        || /(?:var\(|(?:color|background|border|fill|stroke|shadow)\s*[:=])/i.test(value)) {
        for (const color of value.match(rawColor) ?? []) report(node, 'raw-color', `${color} 应定义为语义令牌`)
      }
    }
    if (ts.isJsxAttribute(node) && node.name.getText(ast) === 'className' && node.initializer) {
      const parts = []
      function strings(child) {
        if (ts.isStringLiteralLike(child) || ts.isTemplateHead(child) || ts.isTemplateMiddle(child) || ts.isTemplateTail(child)) parts.push(child.text)
        ts.forEachChild(child, strings)
      }
      strings(node.initializer)
      if (parts.some(part => legacyClass.test(part))) report(node, 'legacy-component', '请使用 shared/ui 组件')
    }
    if (checkLocaleFormat && ts.isNewExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.expression.getText(ast) === 'Intl' && !nonFormattingIntl.has(node.expression.name.text)) {
      report(node, 'direct-locale-format', `Intl.${node.expression.name.text} 请改用 shared/format、utils/precision 或 utils/dateRange 的格式化函数`)
    }
    if (checkLocaleFormat && ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && localeFormatMethods.has(node.expression.name.text)) {
      report(node, 'direct-locale-format', `${node.expression.name.text} 请改用 shared/format、utils/precision 或 utils/dateRange 的格式化函数`)
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return findings
}

/** Full-scope line rules for one source file; tokens.css owns raw color definitions. */
export function inspectStandardsFile(file, source) {
  const findings = []
  function report(line, rule, value) {
    findings.push({ line, rule, value })
  }
  const lines = source.split('\n')
  if (file.endsWith('.ts') || file.endsWith('.tsx')) {
    for (const finding of inspectUiLiterals(file, source)) report(finding.line, finding.rule, finding.value)
  }

  lines.forEach((line, index) => {
    const lineNumber = index + 1

    if (file !== 'styles/tokens.css' && file.endsWith('.css')) {
      const rawColors = line.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g) ?? []
      rawColors.forEach((value) => report(lineNumber, 'raw-color', `${value} 应定义为语义令牌`))
    }

    const legacyNames = line.match(/--(?:teal|teal-dark|teal-soft|ink|muted|line|surface|shadow)(?=\s*[:),;])/g) ?? []
    legacyNames.forEach((value) => report(lineNumber, 'legacy-token', `${value} 已废弃`))

    const fontSize = line.match(/font-size:\s*([0-9.]+)px/)
    if (fontSize && Number(fontSize[1]) < 12) {
      report(lineNumber, 'minimum-font-size', `${fontSize[1]}px 小于 12px`)
    }

    if (file.startsWith('features/settings/') && /<select\b/.test(line)) {
      report(lineNumber, 'native-platform-select', '平台管理下拉请使用 shared/ui Select、FormSelect 或 DictionarySelect')
    }

    if (inpatientStationFiles.has(file) && /<select\b/.test(line)) {
      report(lineNumber, 'native-inpatient-select', '住院工作站下拉请使用 shared/ui Select 或 DictionarySelect')
    }

    if (inpatientStationFiles.has(file) && (/role=["']tablist["']/.test(line)
      || /<nav\b[^>]*className=["'][^"']*tabs/.test(line))) {
      report(lineNumber, 'native-inpatient-tabs', '住院工作站页签请使用 shared/ui Tabs')
    }

    if (file.startsWith('features/settings/') && /role=["']tablist["']/.test(line)) {
      report(lineNumber, 'native-platform-tabs', '平台管理页签请使用 shared/ui Tabs')
    }

    if (file.startsWith('features/settings/')
      && /className=["'{`][^\n]*(?:dictionary-search|parameter-search|master-search|master-data-search)/.test(line)) {
      report(lineNumber, 'legacy-platform-search', '平台管理检索请使用 shared/ui SearchField')
    }
  })
  return findings
}
