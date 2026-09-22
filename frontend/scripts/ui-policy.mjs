import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { relative } from 'node:path'
import ts from 'typescript'
import postcss from 'postcss'

export const ruleMessages = {
  'shared-button': '操作使用 Button/IconButton；特殊通用交互应进入 shared/ui',
  'shared-select': '下拉使用 Select/DictionarySelect/FormSelect',
  'shared-table': '表格使用 DataTable/EditableTable',
  'shared-dialog': '弹窗使用 Dialog',
  'shared-tabs': '页签使用 Tabs',
  'shared-search': '搜索使用 SearchField/ClinicalResourceSearch',
  'inline-appearance': '外观使用共享组件语义属性，避免内联重写视觉',
  'css-important': '业务样式不得新增 !important',
  'css-token': '视觉和间距使用语义令牌',
  'css-scrollbar-gutter': '滚动容器不得预留滚动条空间，使用 scrollbar-gutter: auto',
  'shared-appearance': '不得在业务 CSS 中覆盖共享组件外观',
  'mobile-breakpoint': '默认只适配 PC，不新增手机专属断点',
}

const nativeComponents = { button: 'shared-button', select: 'shared-select', table: 'shared-table', dialog: 'shared-dialog' }
const appearance = /^(?:color|background(?:-.+)?|border(?:-.+)?|outline(?:-.+)?|box-shadow|font(?:-.+)?|line-height|letter-spacing|text-shadow)$/
const tokenProperties = /^(?:color|background-color|border(?:-(?:top|right|bottom|left))?-color|border(?:-(?:top|bottom)-(?:left|right))?-radius|box-shadow|font-size|font-family|font-weight|line-height|letter-spacing|z-index|(?:padding|margin)(?:-.+)?|(?:row-|column-)?gap)$/
const neutralValue = /^(?:0(?:[a-z%]+)?|auto|none|normal|inherit|initial|unset|revert|transparent|currentcolor)(?:\s+(?:0|auto))*$/i

// A :has() condition or a business-owned descendant is not a shared component target.
export function targetsSharedComponent(selector) {
  const withoutConditions = selector.replace(/:has\((?:[^()]|\([^()]*\))*\)/g, '')
  return withoutConditions.split(',').some(part => {
    for (const segment of part.trim().split(/[\s>+~]+/).reverse()) {
      if (/\.ui-[\w-]+/.test(segment)) return true
      if (/\.[\w-]+/.test(segment)) return false
    }
    return false
  })
}

export function inPolicyScope(file) {
  if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file)) return false
  return /^(?:features\/|dev\/|shared\/ui\/templates\/|styles\/features(?:\/|\.css$))/.test(file) && /\.(?:tsx|css)$/.test(file)
}

// Remove complete var() calls (including nested fallbacks) before inspecting literals.
function withoutVariables(value) {
  let result = ''
  for (let i = 0; i < value.length; i++) {
    if (value.slice(i, i + 4) !== 'var(') { result += value[i]; continue }
    let depth = 1
    i += 4
    while (i < value.length && depth) {
      if (value[i] === '(') depth++
      if (value[i] === ')') depth--
      i++
    }
    i--
    result += 'TOKEN'
  }
  return result
}

export function scanSource(file, source) {
  if (!inPolicyScope(file)) return []
  const findings = []
  function report(rule, line, code) {
    const normalized = code.replace(/\s+/g, ' ').trim()
    const fingerprint = createHash('sha256').update(normalized).digest('hex').slice(0, 20)
    findings.push({ file, rule, line, fingerprint, code: normalized, message: ruleMessages[rule] })
  }

  if (file.endsWith('.tsx')) {
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    function visit(node) {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const name = node.tagName.getText(ast)
        const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1
        const attrs = node.attributes.properties.filter(ts.isJsxAttribute)
        const literal = key => {
          const value = attrs.find(attr => attr.name.getText(ast) === key)?.initializer
          if (value && ts.isStringLiteral(value)) return value.text
          if (value && ts.isJsxExpression(value) && value.expression && ts.isStringLiteralLike(value.expression)) return value.expression.text
          return undefined
        }
        const nativeRule = nativeComponents[name]
        if (nativeRule) report(nativeRule, line, node.getText(ast))
        if (name[0] === name[0].toLowerCase() && literal('role') === 'tablist') report('shared-tabs', line, node.getText(ast))
        if (name[0] === name[0].toLowerCase() && ['dialog', 'alertdialog'].includes(literal('role'))) report('shared-dialog', line, node.getText(ast))
        if (name === 'input' && literal('type') === 'search') report('shared-search', line, node.getText(ast))
        if (name === 'input' && ['submit', 'reset', 'button'].includes(literal('type'))) report('shared-button', line, node.getText(ast))
        const style = attrs.find(attr => attr.name.getText(ast) === 'style')?.initializer
        if (style && ts.isJsxExpression(style) && style.expression && ts.isObjectLiteralExpression(style.expression)) {
          for (const property of style.expression.properties) {
            if (!ts.isPropertyAssignment(property)) continue
            const key = property.name.getText(ast).replace(/^['"]|['"]$/g, '').replace(/[A-Z]/g, char => `-${char.toLowerCase()}`)
            if (appearance.test(key)) report('inline-appearance', line, `${name} style ${property.getText(ast)}`)
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(ast)
  } else {
    const root = postcss.parse(source, { from: file })
    function context(node) {
      const parents = []
      for (let parent = node.parent; parent && parent.type !== 'root'; parent = parent.parent) {
        parents.unshift(parent.type === 'rule' ? parent.selector : `@${parent.name} ${parent.params}`)
      }
      return parents.join(' / ')
    }
    root.walkDecls(decl => {
      const line = decl.source.start.line
      const code = `${context(decl)} { ${decl.prop}: ${decl.value}${decl.important ? ' !important' : ''} }`
      if (decl.important) report('css-important', line, code)
      if (decl.prop === 'scrollbar-gutter' && decl.value !== 'auto') report('css-scrollbar-gutter', line, code)
      const hasLiteralSize = /(?:\d*\.)?\d+(?:px|rem|em|vh|vw|pt)\b/.test(withoutVariables(decl.value))
      if (tokenProperties.test(decl.prop) && !neutralValue.test(decl.value) && (hasLiteralSize || !/var\(\s*--/.test(decl.value))) {
        report('css-token', line, code)
      }
      if (appearance.test(decl.prop) && targetsSharedComponent(context(decl))) report('shared-appearance', line, code)
    })
    root.walkAtRules('media', node => {
      // Only small device breakpoints; PC/container layouts remain valid.
      const sizes = [...node.params.matchAll(/(?:min|max)-width\s*:\s*([\d.]+)(px|rem|em)/g)]
      sizes.push(...node.params.matchAll(/width\s*[<>]=?\s*([\d.]+)(px|rem|em)/g))
      sizes.push(...node.params.matchAll(/([\d.]+)(px|rem|em)\s*[<>]=?\s*width/g))
      if (sizes.some(([, value, unit]) => Number(value) * (unit === 'px' ? 1 : 16) <= 760)) {
        report('mobile-breakpoint', node.source.start.line, `@media ${node.params}`)
      }
    })
  }
  return findings
}

export function validateBaseline(baseline) {
  if (baseline.version !== 1 || !baseline.files || typeof baseline.files !== 'object' || Array.isArray(baseline.files)) {
    throw new Error('无效的 UI 历史基线格式')
  }
  for (const [file, rules] of Object.entries(baseline.files)) {
    if (!inPolicyScope(file) || !rules || typeof rules !== 'object') throw new Error(`无效的 UI 基线文件：${file}`)
    for (const [rule, fingerprints] of Object.entries(rules)) {
      if (!ruleMessages[rule] || !fingerprints || typeof fingerprints !== 'object') throw new Error(`无效的 UI 基线规则：${file}:${rule}`)
      for (const [fingerprint, count] of Object.entries(fingerprints)) {
        if (!/^[a-f0-9]{20}$/.test(fingerprint) || !Number.isInteger(count) || count < 1) throw new Error(`无效的 UI 基线指纹：${file}:${rule}:${fingerprint}`)
      }
    }
  }
}

export function collectFindings(sourceRoot) {
  const findings = []
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory)
      if (entry.isDirectory()) walk(url)
      else {
        const file = relative(sourceRoot.pathname, url.pathname).replaceAll('\\', '/')
        if (inPolicyScope(file)) findings.push(...scanSource(file, readFileSync(url, 'utf8')))
      }
    }
  }
  walk(sourceRoot)
  return findings
}

export function validateExceptions(exceptions, today = new Date().toISOString().slice(0, 10)) {
  if (!Array.isArray(exceptions)) throw new Error('UI 例外必须是数组')
  const seen = new Set()
  for (const item of exceptions) {
    const key = `${item.file}:${item.rule}:${item.fingerprint}`
    if (!item.file || !inPolicyScope(item.file) || item.file.includes('*') || item.file.includes('..')
      || !ruleMessages[item.rule] || !/^[a-f0-9]{20}$/.test(item.fingerprint)
      || !Number.isInteger(item.count) || item.count < 1
      || ![item.reason, item.owner, item.removal].every(value => typeof value === 'string' && value.trim())
      || !/^\d{4}-\d{2}-\d{2}$/.test(item.expires) || !Number.isFinite(Date.parse(item.expires))
      || new Date(item.expires).toISOString().slice(0, 10) !== item.expires || item.expires < today || seen.has(key)) {
      throw new Error(`无效或过期的 UI 例外：${key}`)
    }
    seen.add(key)
  }
}

export function newFindings(findings, baseline, exceptions = []) {
  validateExceptions(exceptions)
  const counts = new Map()
  return findings.filter(item => {
    const key = `${item.file}:${item.rule}:${item.fingerprint}`
    const count = (counts.get(key) ?? 0) + 1
    counts.set(key, count)
    const historical = baseline.files?.[item.file]?.[item.rule]?.[item.fingerprint] ?? 0
    const exception = exceptions.find(entry => entry.file === item.file && entry.rule === item.rule && entry.fingerprint === item.fingerprint)?.count ?? 0
    return count > historical + exception
  })
}
