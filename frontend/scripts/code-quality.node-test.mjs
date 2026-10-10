import assert from 'node:assert/strict'
import test from 'node:test'
import { ESLint } from 'eslint'
import { complexity, hookFinding, importFindings, newHookFindings, newImportFindings, validateBaseline, validateBoundaryExceptions } from './code-quality.mjs'

const file = 'src/features/example/Example.tsx'
const missing = "function Example({ value }) { useEffect(() => console.log(value), []); return null }"

async function lint(source) {
  const [result] = await new ESLint({ cwd: process.cwd() }).lintText(source, { filePath: file })
  return result.messages.map(message => hookFinding(file, source, message))
}

function baseline(finding) {
  return { version: 1, revision: 'a'.repeat(40), owner: 'frontend', reason: 'historical only', files: { [finding.file]: { [finding.fingerprint]: 1 } } }
}

test('conditional hooks fail and complete dependencies pass', async () => {
  assert.ok((await lint('function Example({ enabled }) { if (enabled) useState(0); return null }')).some(item => item.rule === 'react-hooks/rules-of-hooks'))
  assert.deepEqual(await lint('function Example({ value }) { useEffect(() => console.log(value), [value]); return null }'), [])
})

test('a new missing dependency fails; exact historical finding is counted only once', async () => {
  const [finding] = await lint(missing)
  assert.equal(newHookFindings([finding], { ...baseline(finding), files: {} }).length, 1)
  assert.equal(newHookFindings([finding], baseline(finding)).length, 0)
  assert.equal(newHookFindings([finding, finding], baseline(finding)).length, 1)
  assert.equal(newHookFindings([{ ...finding, file: 'src/features/new/New.tsx' }], baseline(finding)).length, 1)
})

test('fingerprints survive line shifts but reject changed hook behavior', async () => {
  const [original] = await lint(missing)
  const [shifted] = await lint('\n\n' + missing)
  assert.equal(original.fingerprint, shifted.fingerprint)
  const [changed] = await lint(missing.replace('console.log(value)', 'console.warn(value)'))
  assert.notEqual(changed.fingerprint, original.fingerprint)
})

test('rules-of-hooks cannot be exempted by the historical dependency baseline', async () => {
  const [finding] = await lint('function Example({ enabled }) { if (enabled) useState(0); return null }')
  assert.equal(newHookFindings([finding], baseline(finding)).length, 1)
  assert.throws(() => validateBaseline({ ...baseline(finding), revision: 'unknown' }))
  assert.throws(() => validateBaseline({ ...baseline(finding), files: { [file]: { [finding.fingerprint]: 0 } } }))
})

test('shared code cannot depend on features or app, including type imports and re-exports', () => {
  assert.equal(importFindings('src/shared/example.ts', "import type { Value } from '../features/x/api'").length, 1)
  assert.equal(importFindings('src/shared/example.ts', "export { Value } from '../app/AppShell'").length, 1)
  assert.equal(importFindings('src/shared/example.ts', "type Value = import('../features/x/api').Value").length, 1)
  assert.deepEqual(importFindings('src/shared/example.ts', "import { Value } from './ui/api'"), [])
})

test('cross-feature static, dynamic and require imports are checked; same-domain imports are allowed', () => {
  for (const source of ["import { Value } from '../other/api'", "const load = () => import('../other/api')", "const load = require('../other/api')"]) {
    assert.equal(importFindings(file, source).length, 1)
  }
  assert.deepEqual(importFindings(file, "import { Value } from './api'"), [])
  assert.deepEqual(importFindings('src/app/Router.tsx', "import { Value } from '../features/other/api'"), [])
})

test('precise dependency exceptions cannot exempt another file, import, or shared direction', () => {
  const source = "import { Value } from '../other/api'"
  const entry = { file, specifier: '../other/api', owner: 'clinical', reason: 'existing integration', removal: 'move to shared', expires: '2099-01-01' }
  assert.deepEqual(newImportFindings(importFindings(file, source), [entry]), [])
  assert.equal(newImportFindings(importFindings(file, source.replace('other', 'new')), [entry]).length, 1)
  assert.equal(newImportFindings(importFindings('src/features/example/Other.tsx', source), [entry]).length, 1)
  assert.equal(newImportFindings(importFindings('src/shared/api.ts', "import { Value } from '../features/other/api'"), [entry]).length, 1)
  assert.throws(() => validateBoundaryExceptions([{ ...entry, file: 'src/features/*' }]))
  assert.throws(() => validateBoundaryExceptions([{ ...entry, expires: '2000-01-01' }]))
  assert.throws(() => validateBoundaryExceptions([{ ...entry, removal: '' }]))
})

test('complexity report describes natural functions without counting nested function decisions twice', () => {
  const report = complexity(file, 'function work() {\n' + '\n'.repeat(110) + 'if (true) return 1; return 0;\n}')
  assert.equal(report.functions[0].name, 'work')
  assert.equal(report.functions[0].decisionNodes, 1)
  assert.ok(report.lines > 100)
})
