import assert from 'node:assert/strict'
import { test } from 'node:test'
import { newFindings, scanSource, validateBaseline, validateExceptions } from './ui-policy.mjs'
import { inspectUiLiterals } from './ui-standards-rules.mjs'

const file = 'features/example/Example.tsx'
const rules = findings => findings.map(item => item.rule)

test('record identifiers and descriptive wrapper names are not colors or legacy classes', () => {
  assert.deepEqual(inspectUiLiterals(file, `const text = '就诊 #1001 · 处方 #2001';
    const view = <div className="inpatient-admission-error-banner"><Alert /></div>`), [])
  const findings = inspectUiLiterals(file, `const color = '#fff'; const fallback = 'var(--color-danger, #ff0000)';
    const view = <div className={'active error-banner'} style={{color: 'rgba(0,0,0,0.2)'}} />`)
  assert.deepEqual(rules(findings), ['raw-color', 'raw-color', 'legacy-component', 'raw-color'])
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
