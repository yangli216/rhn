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
  'control-height-override': '业务 CSS 不得改写共享输入框/按钮的高度；高度由 --control-height-default 统一，紧凑场景用 size="sm"',
  'css-layout-only': '新增的业务 CSS 只写布局属性（grid/flex/尺寸/间距/溢出）；颜色、背景、边框、字体由共享组件和模板承担。确需例外，在该声明的上一行或同行加 /* ui-allow: 原因 */',
  'undefined-token': '引用了未定义的自定义属性（如 --space-0-5、--font-size-tiny、--color-text-muted）；该声明实际不生效。只使用 styles/tokens.css 中存在的令牌',
  'css-page-layout': '页面边距与高度由 .page 和页面模板（WorkspaceColumns/WorkspacePane 等）统一提供：业务 CSS 不给页面/工作台根容器写 padding、margin，也不用视口单位（vh/dvh）设置高度；需要滚动时放进 WorkspacePane 正文。确需例外加 /* ui-allow: 原因 */',
  'control-size-mismatch': '与输入框/下拉框同行的按钮使用默认尺寸（不写 size="sm"），保证同高；紧凑型只用于表格行内',
}

const nativeComponents = { button: 'shared-button', select: 'shared-select', table: 'shared-table', dialog: 'shared-dialog' }
// 同一父元素内出现这些控件时，旁边的 Button 必须与其同高（默认尺寸）；表格行内的紧凑场景除外。
const fieldControls = new Set(['input', 'FormField', 'SearchField', 'Select', 'DictionarySelect', 'FormSelect', 'DatePicker', 'DateRangePicker', 'RemoteSearchSelect', 'ClinicalResourceSearch', 'UnitNumberInput', 'GridAddressInput'])
const compactTableScopes = new Set(['td', 'th', 'tr', 'EditableRow', 'EditableCell', 'EditableTable', 'DataTable', 'TableShell'])
// 共享输入/按钮控件：业务 CSS 改写它们的高度会让同行控件不齐。
const sharedControlTarget = /\.ui-(?:button|icon-button|search-field|field__control|select[\w-]*|date[\w-]*)(?![\w-])[^\s>+~]*$/
const heightProperties = /^(?:height|min-height|max-height)$/
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

let definedProperties
// 全部在 src 下 CSS/TSX 中声明过的自定义属性（含局部变量与内联 style 变量）；只缓存一次。
function customPropertiesInSource() {
  if (definedProperties) return definedProperties
  definedProperties = new Set()
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) { walk(new URL(`${entry.name}/`, dir)); continue }
      if (!/\.(?:css|tsx?)$/.test(entry.name)) continue
      for (const match of readFileSync(new URL(entry.name, dir), 'utf8').matchAll(/['"]?(--[\w-]+)['"]?\s*:/g)) definedProperties.add(match[1])
    }
  }
  walk(new URL('../src/', import.meta.url))
  return definedProperties
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
    const jsxName = child => ts.isJsxElement(child) ? child.openingElement.tagName.getText(ast) : ts.isJsxSelfClosingElement(child) ? child.tagName.getText(ast) : undefined
    const jsxAttrs = child => (ts.isJsxElement(child) ? child.openingElement : child).attributes.properties.filter(ts.isJsxAttribute)
    const jsxText = (child, key) => {
      const value = jsxAttrs(child).find(attr => attr.name.getText(ast) === key)?.initializer
      if (value && ts.isStringLiteral(value)) return value.text
      if (value && ts.isJsxExpression(value) && value.expression && ts.isStringLiteralLike(value.expression)) return value.expression.text
      return undefined
    }
    function insideCompactTable(node) {
      for (let parent = node; parent; parent = parent.parent) {
        if (compactTableScopes.has(jsxName(parent) ?? '')) return true
      }
      return false
    }
    function visit(node) {
      if (ts.isJsxElement(node) && !insideCompactTable(node)) {
        const children = node.children.filter(child => jsxName(child))
        // 紧凑工具栏：输入类控件本身也是 size="sm" 时与 sm 按钮同高，不算不匹配。
        const hasField = children.some(child => fieldControls.has(jsxName(child)) && jsxText(child, 'size') !== 'sm' && !['checkbox', 'radio', 'hidden'].includes(jsxText(child, 'type')))
        if (hasField) {
          for (const child of children) {
            if (jsxName(child) === 'Button' && jsxText(child, 'size') === 'sm') {
              const opening = ts.isJsxElement(child) ? child.openingElement : child
              report('control-size-mismatch', ast.getLineAndCharacterOfPosition(opening.getStart(ast)).line + 1, opening.getText(ast))
            }
          }
        }
      }
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
      for (const match of decl.value.matchAll(/var\(\s*(--[\w-]+)\s*([,)])/g)) {
        if (match[2] === ')' && !customPropertiesInSource().has(match[1]) && !new RegExp(`${match[1]}\\s*:`).test(source)) { report('undefined-token', line, `${code} /* ${match[1]} */`); break }
      }
      if (decl.prop === 'scrollbar-gutter' && decl.value !== 'auto') report('css-scrollbar-gutter', line, code)
      const hasLiteralSize = /(?:\d*\.)?\d+(?:px|rem|em|vh|vw|pt)\b/.test(withoutVariables(decl.value))
      // 发丝线补偿（1px/2px）、正圆（50%）与局部叠放（z-index 1–9）不属于需要令牌的设计取值。
      const hairline = /^(?:padding|margin)(?:-.+)?$|^(?:row-|column-)?gap$/.test(decl.prop) && /^(?:\s*(?:-?[12]px|0|auto|var\([^)]*\)))+\s*$/.test(decl.value)
      const localValue = (decl.prop === 'z-index' && /^-?[1-9]$/.test(decl.value.trim())) || (/radius/.test(decl.prop) && decl.value.trim() === '50%')
      if (!hairline && !localValue && tokenProperties.test(decl.prop) && !neutralValue.test(decl.value) && (hasLiteralSize || !/var\(\s*--/.test(decl.value))) {
        report('css-token', line, code)
      }
      if (heightProperties.test(decl.prop) && !neutralValue.test(decl.value) && decl.value.trim() !== 'var(--control-height-default)'
        && context(decl).split(' / ').pop().split(',').some(part => !/\btextarea\b/.test(part) && sharedControlTarget.test(part.trim()))) {
        report('control-height-override', line, code)
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

const visualProperties = /^(?:color|background(?:-.+)?|border(?:-(?:top|right|bottom|left))?(?:-(?:color|style|width))?|outline(?:-.+)?|box-shadow|font-size|font-weight|font-family|font-style|line-height|letter-spacing|text-shadow)$/
const resetValue = /^(?:none|0|transparent|inherit|currentcolor|unset|initial|revert)$/i

/** 只检查本次新增的 CSS 行（工作区或暂存区相对 HEAD 的新增）：存量不计，所以不进历史基线。 */
export function scanAddedCssLayout(file, source, addedLines, removedProps = new Set()) {
  if (!inPolicyScope(file) || !file.endsWith('.css') || !addedLines.size) return []
  const lines = source.split('\n')
  const findings = []
  postcss.parse(source, { from: file }).walkDecls(decl => {
    const line = decl.source.start.line
    const allowed = /\/\*\s*ui-allow:\s*\S/.test(lines[line - 1]) || /\/\*\s*ui-allow:\s*\S/.test(lines[line - 2] ?? '')
    if (addedLines.has(line) && !allowed) {
      const selector = decl.parent?.type === 'rule' ? decl.parent.selector : ''
      const viewportHeight = /^(?:min-|max-)?height$/.test(decl.prop) && /\d(?:vh|dvh|svh|lvh)\b/.test(decl.value)
      const rootSpacing = /^(?:padding|margin)(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?$/.test(decl.prop)
        && selector.split(',').every(part => /^\.[\w-]+-(?:workspace|page|root)$/.test(part.trim())) && !/^(?:0|auto)(?:\s+(?:0|auto))*$/.test(decl.value.trim())
      if (viewportHeight || rootSpacing) {
        findings.push({ file, rule: 'css-page-layout', line, code: `${selector} { ${decl.prop}: ${decl.value} }`, message: ruleMessages['css-page-layout'], fingerprint: '' })
        return
      }
    }
    if (!addedLines.has(line) || !visualProperties.test(decl.prop) || resetValue.test(decl.value.trim())) return
    if (removedProps.has(decl.prop)) return // 同一属性在旧版本中就存在：属于修改既有声明，不算新增
    if (/\/\*\s*ui-allow:\s*\S/.test(lines[line - 1]) || /\/\*\s*ui-allow:\s*\S/.test(lines[line - 2] ?? '')) return
    const parents = []
    for (let parent = decl.parent; parent && parent.type !== 'root'; parent = parent.parent) parents.unshift(parent.type === 'rule' ? parent.selector : `@${parent.name} ${parent.params}`)
    const code = `${parents.join(' / ')} { ${decl.prop}: ${decl.value} }`
    findings.push({ file, rule: 'css-layout-only', line, code, message: ruleMessages['css-layout-only'], fingerprint: '' })
  })
  return findings
}
