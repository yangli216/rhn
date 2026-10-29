import assert from 'node:assert/strict'
import { test } from 'node:test'
import { newFindings, scanAddedCssLayout, scanSource, validateBaseline, validateExceptions } from './ui-policy.mjs'
import { inspectStandardsFile, inspectUiLiterals } from './ui-standards-rules.mjs'

const file = 'features/example/Example.tsx'
const rules = findings => findings.map(item => item.rule)

test('record identifiers and descriptive wrapper names are not colors or legacy classes', () => {
  assert.deepEqual(inspectUiLiterals(file, `const text = '就诊 #1001 · 处方 #2001';
    const view = <div className="inpatient-admission-error-banner"><Alert /></div>`), [])
  const findings = inspectUiLiterals(file, `const color = '#fff'; const fallback = 'var(--color-danger, #ff0000)';
    const view = <div className={'active error-banner'} style={{color: 'rgba(0,0,0,0.2)'}} />`)
  assert.deepEqual(rules(findings), ['raw-color', 'raw-color', 'legacy-component', 'raw-color'])
})

test('direct locale formatting is limited to shared formatters', () => {
  const source = `const a = new Intl.NumberFormat('zh-CN').format(1); const b = new Date().toLocaleString('zh-CN');
    const c = n.toLocaleDateString(); const d = s.toLocaleLowerCase(); const e = new Intl.Collator('zh').compare;`
  assert.deepEqual(rules(inspectUiLiterals(file, source)), ['direct-locale-format', 'direct-locale-format', 'direct-locale-format'])
  assert.deepEqual(inspectUiLiterals('shared/format.ts', source), [])
  assert.deepEqual(inspectUiLiterals('features/example/Example.test.tsx', source), [])
})

test('shared appearance targets exclude business descendants and has conditions', () => {
  assert.deepEqual(rules(scanSource('features/example/example.css', `
    .business:has(.ui-select) { color: var(--color-text-secondary); }
    .ui-tabs .business-caption small { color: var(--color-text-secondary); }
    .business .ui-select { color: var(--color-text-secondary); }
    .business .ui-panel h2 { color: var(--color-text-secondary); }
  `)), ['shared-appearance', 'shared-appearance'])
})

test('AST finds multiline native controls, expression roles and inline appearance', () => {
  const findings = scanSource(file, `const page = <div role={'tablist'}>
    <select\n aria-label="下拉" /><button type="button">操作</button><table /><dialog />
    <input type={'search'} /><div style={{ backgroundColor: 'red', width: 100 }} />
  </div>`)
  assert.deepEqual(rules(findings), ['shared-tabs', 'shared-select', 'shared-button', 'shared-table', 'shared-dialog', 'shared-search', 'inline-appearance'])
  assert.equal(findings[1].line, 2)
})

test('shared components, regular fields, comments and strings are allowed', () => {
  assert.deepEqual(scanSource(file, `// <button />
    const hint = '<select />'
    const page = <><Button /><Select /><DataTable /><Tabs /><Dialog /><SearchField />
    <FormField label="名称"><input /></FormField><textarea /><div style={{ width: 100 }} /></>`), [])
  assert.deepEqual(scanSource('shared/ui/Select.tsx', 'const page = <select />'), [])
  assert.deepEqual(scanSource('features/example/Example.test.tsx', 'const page = <button />'), [])
})

test('CSS parses comments, tracks selector context and allows token-based layout', () => {
  const findings = scanSource('styles/features/example.css', `/* padding: 5px !important */
    .page { padding: var(--space-4); width: 700px; margin: 0 auto; gap: 8px; }
    .page .ui-select { background: var(--color-surface); }
    .page { color: red !important; }
    @media (max-width: 40rem) { .page { display: block; } }
    @container (max-width: 70rem) { .page { display: grid; } }`)
  assert.deepEqual(rules(findings), ['css-token', 'shared-appearance', 'css-important', 'css-token', 'mobile-breakpoint'])
})

test('scroll containers do not reserve a gutter', () => {
  assert.deepEqual(rules(scanSource('styles/features/example.css', '.page { overflow: auto; scrollbar-gutter: stable; }')), ['css-scrollbar-gutter'])
  assert.deepEqual(scanSource('styles/features/example.css', '.page { overflow: auto; scrollbar-gutter: auto; }'), [])
})

test('baseline permits only the exact file, code fingerprint and number of occurrences', () => {
  const findings = scanSource(file, 'const page = <button type="button" />')
  const first = findings[0]
  const baseline = { files: { [file]: { [first.rule]: { [first.fingerprint]: 1 } } } }
  assert.equal(newFindings(findings, baseline).length, 0)
  assert.equal(newFindings([...findings, ...findings], baseline).length, 1)
  assert.equal(newFindings(scanSource('features/other/New.tsx', 'const page = <button type="button" />'), baseline).length, 1)
  assert.equal(newFindings(scanSource(file, 'const page = <button type="submit" />'), baseline).length, 1)
  assert.equal(newFindings(scanSource(file, '\n\nconst page = <button   type="button" />'), baseline).length, 0)
})

test('mixed literal/token sizes and CSS range breakpoints cannot bypass the policy', () => {
  const findings = scanSource('features/example/example.css', `.page { gap: var(--space-4) 13px; padding: calc(var(--space-2) * 2); }
    @media (width <= 760px) { .page { display: block; } }
    @media (40rem >= width) { .page { display: block; } }
    @media (max-width: 1280px) { .page { display: grid; } }`)
  assert.deepEqual(rules(findings), ['css-token', 'mobile-breakpoint', 'mobile-breakpoint'])
  assert.deepEqual(rules(scanSource(file, 'const page = <><input type="submit" /><div role="dialog" /></>')), ['shared-button', 'shared-dialog'])
})

test('baseline validation rejects corrupt counts and unknown rules', () => {
  const first = scanSource(file, 'const page = <button />')[0]
  validateBaseline({ version: 1, files: { [file]: { [first.rule]: { [first.fingerprint]: 1 } } } })
  assert.throws(() => validateBaseline({ version: 1, files: { [file]: { [first.rule]: { [first.fingerprint]: '1' } } } }))
  assert.throws(() => validateBaseline({ version: 1, files: { [file]: { unknown: {} } } }))
  assert.throws(() => validateBaseline({ version: 2, files: {} }))
})

test('exceptions need an exact fingerprint, owner, reason, expiry and removal condition', () => {
  const first = scanSource(file, 'const page = <button />')[0]
  const exception = { file, rule: first.rule, fingerprint: first.fingerprint, count: 1,
    reason: '键盘交互迁移', owner: '前端维护者', expires: '2099-12-31', removal: '共享组件支持后删除' }
  assert.equal(newFindings([first], {}, [exception]).length, 0)
  assert.equal(newFindings([first, first], {}, [exception]).length, 1)
  for (const patch of [{ expires: '2020-01-01' }, { owner: '' }, { reason: '' }, { removal: '' }, { file: 'features/*/Example.tsx' }, { expires: '2099-02-31' }]) {
    assert.throws(() => validateExceptions([{ ...exception, ...patch }]))
  }
  assert.throws(() => validateExceptions([exception, exception]))
})

test('per-file standards rules match the full check and keep token definitions exempt', () => {
  const css = '.a { color: #fff; font-size: 11px; }\n.b { color: var(--teal); }'
  assert.deepEqual(inspectStandardsFile('features/example/example.css', css).map(item => [item.line, item.rule]),
    [[1, 'raw-color'], [1, 'minimum-font-size'], [2, 'legacy-token']])
  assert.deepEqual(inspectStandardsFile('styles/tokens.css', ':root { --color-x: #fff; }'), [])
  assert.deepEqual(rules(inspectStandardsFile('features/settings/Example.tsx', `const v = <select aria-label="x" />`)), ['native-platform-select'])
})

test('buttons beside field controls must use the default size so they match the input height', () => {
  const rows = source => rules(scanSource(file, source))
  assert.deepEqual(rows('const a = <form><input aria-label="q" /><Button size="sm">查询</Button></form>'), ['control-size-mismatch'])
  assert.deepEqual(rows('const a = <div><FormField label="x"><input /></FormField><Button size={"sm"}>加</Button></div>'), ['control-size-mismatch'])
  assert.deepEqual(rows('const a = <div><SearchField label="s" /><Button variant="secondary">查询</Button></div>'), [])
  assert.deepEqual(rows('const a = <div><Button size="sm">改</Button><Button size="sm">删</Button></div>'), [])
  // 紧凑工具栏：搜索框与按钮都是 sm 时同高。
  assert.deepEqual(rows('const a = <div><SearchField size="sm" label="s" /><Button size="sm">查询</Button></div>'), [])
  assert.deepEqual(rows('const a = <div><SearchField label="s" /><Button size="sm">查询</Button></div>'), ['control-size-mismatch'])
  assert.deepEqual(rows('const a = <div><input type="checkbox" /><Button size="sm">改</Button></div>'), [])
  assert.deepEqual(rows('const a = <td><Select value="" /><Button size="sm">改</Button></td>'), [])
  assert.deepEqual(rows('const a = <tr><td><div><Select value="" /><Button size="sm">改</Button></div></td></tr>'), [])
})

test('business css must not override the height of shared input and button controls', () => {
  const css = 'features/demo/demo.css'
  const rows = source => rules(scanSource(css, source))
  assert.deepEqual(rows('.demo .ui-button { min-height: 2.1rem }'), ['control-height-override'])
  assert.deepEqual(rows('.demo .ui-select__trigger { height: var(--control-height-sm) }'), ['control-height-override'])
  assert.deepEqual(rows('.demo .ui-field__control { height: 32px }'), ['control-height-override'])
  assert.deepEqual(rows('.demo .ui-button { min-height: var(--control-height-default) }'), [])
  assert.deepEqual(rows('.demo textarea.ui-field__control { min-height: 4.25rem }'), [])
  assert.deepEqual(rows('.demo .my-button { min-height: 2.1rem }'), [])
})

test('hairline spacing, circles and local stacking are not token violations', () => {
  const css = 'features/demo/demo.css'
  const rows = source => rules(scanSource(css, source))
  assert.deepEqual(rows('.a { padding: 1px var(--space-1); gap: 2px; border-radius: 50%; z-index: 2 }'), [])
  assert.deepEqual(rows('.a { padding: 5px }'), ['css-token'])
  assert.deepEqual(rows('.a { z-index: 25 }'), ['css-token'])
  assert.deepEqual(rows('.a { border-radius: 7px }'), ['css-token'])
})

test('added business css lines may only carry layout properties', () => {
  const css = 'features/demo/demo.css'
  const check = (source, lines, removed) => scanAddedCssLayout(css, source, new Set(lines), new Set(removed)).map(item => item.code)
  assert.deepEqual(check('.a { display: flex; color: red }', [1]), ['.a { color: red }'])
  assert.deepEqual(check('.a { display: flex; gap: var(--space-2) }', [1]), [])
  assert.deepEqual(check('.a {\n  border: 0;\n  background: none;\n}', [2, 3]), [])
  assert.deepEqual(check('.a {\n  color: red;\n}', [], []), [])
  assert.deepEqual(check('.a {\n  /* ui-allow: 状态色 */\n  color: red;\n}', [2, 3]), [])
  assert.deepEqual(check('.a {\n  color: blue;\n}', [2], ['color']), [])
})

test('css must not reference custom properties that are defined nowhere', () => {
  const css = 'features/demo/demo.css'
  const rows = source => rules(scanSource(css, source))
  assert.deepEqual(rows('.a { padding: var(--space-0-5) var(--space-2) }'), ['undefined-token'])
  assert.deepEqual(rows('.a { font-size: var(--font-size-tiny) }'), ['undefined-token'])
  assert.deepEqual(rows('.a { padding: var(--space-2) }'), [])
  assert.deepEqual(rows('.a { padding: var(--space-0-5, 2px) }'), [])
  assert.deepEqual(rows('.a { --local: 4px; margin: var(--local) }'), [])
})
