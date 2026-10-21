import ts from 'typescript'

const rawColor = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g
const legacyClass = /(?:^|\s)(?:primary-button|secondary-button|error-banner|status-pill|panel-head)(?=\s|$)/
// 展示格式化统一走共享函数，便于日后切换语言；排序/分词类 Intl API 不属于展示格式化。
const localeFormatOwners = new Set(['shared/format.ts', 'shared/utils/precision.ts', 'shared/utils/dateRange.ts'])
const localeFormatMethods = new Set(['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString'])
const nonFormattingIntl = new Set(['Collator', 'Segmenter'])

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
