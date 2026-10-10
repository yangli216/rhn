import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { ESLint } from 'eslint'

export function sourceFiles(root) {
  const files = []
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) walk(target)
      else if (/\.(ts|tsx)$/.test(entry.name) && entry.name !== 'generated.ts') files.push(target)
    }
  }
  walk(root)
  return files.sort()
}

export const isTest = file => /\.(test|spec)\.[^.]+$/.test(file)
const sourceTree = (file, source) => ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
  file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)

export function importFindings(file, source) {
  if (isTest(file)) return []
  const findings = []
  const tree = sourceTree(file, source)
  const feature = file.match(/^src\/features\/([^/]+)\//)?.[1]
  function inspect(specifier, node) {
    if (!specifier.startsWith('.')) return
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier))
    const targetFeature = target.match(/^src\/features\/([^/]+)(?:\/|$)/)?.[1]
    let rule
    if (file.startsWith('src/shared/') && (targetFeature || target.startsWith('src/app/'))) rule = 'shared-direction'
    else if (feature && targetFeature && feature !== targetFeature) rule = 'feature-boundary'
    if (rule) findings.push({ file, rule, specifier, target, line: tree.getLineAndCharacterOfPosition(node.getStart()).line + 1 })
  }
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      inspect(node.moduleSpecifier.text, node)
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      inspect(node.argument.literal.text, node)
    }
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
      || ts.isIdentifier(node.expression) && node.expression.text === 'require') && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) {
      inspect(node.arguments[0].text, node)
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  return findings
}

export function hookFinding(file, source, message) {
  const tree = sourceTree(file, source)
  const offset = tree.getPositionOfLineAndCharacter(message.line - 1, message.column - 1)
  let selected = tree
  function visit(node) {
    if (node.getStart(tree) <= offset && node.end > offset) {
      if (ts.isCallExpression(node) || ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node)) selected = node
      ts.forEachChild(node, visit)
    }
  }
  visit(tree)
  const code = ts.createPrinter({ removeComments: true }).printNode(ts.EmitHint.Unspecified, selected, tree).replace(/\s+/g, ' ').trim()
  const description = message.message.replace(/\(at line \d+\)/g, '(at referenced hook)')
  const fingerprint = crypto.createHash('sha256').update(`${message.ruleId}\n${description}\n${code}`).digest('hex').slice(0, 24)
  return { file, rule: message.ruleId, fingerprint, line: message.line, message: message.message }
}

export async function hooksAudit(cwd) {
  const eslint = new ESLint({ cwd })
  const results = await eslint.lintFiles(['src/**/*.{ts,tsx}'])
  return results.flatMap(result => result.messages.map(message => {
    const file = path.relative(cwd, result.filePath).split(path.sep).join('/')
    if (!message.ruleId || message.fatal) return { file, rule: 'parse-error', line: message.line, message: message.message }
    return hookFinding(file, fs.readFileSync(result.filePath, 'utf8'), message)
  }))
}

export function validateBaseline(baseline) {
  if (baseline.version !== 1 || !/^[a-f0-9]{40}$/.test(baseline.revision ?? '') || !baseline.reason || !baseline.owner || !baseline.files) throw Error('Invalid Hooks baseline metadata')
  for (const [file, counts] of Object.entries(baseline.files)) {
    if (!file.startsWith('src/') || file.includes('..') || !counts || typeof counts !== 'object') throw Error('Invalid baseline path')
    for (const [fingerprint, count] of Object.entries(counts)) {
      if (!/^[a-f0-9]{24}$/.test(fingerprint) || !Number.isInteger(count) || count <= 0) throw Error('Invalid baseline fingerprint/count')
    }
  }
}

export function newHookFindings(findings, baseline) {
  validateBaseline(baseline)
  const remaining = structuredClone(baseline.files)
  return findings.filter(finding => {
    if (finding.rule !== 'react-hooks/exhaustive-deps') return true
    const count = remaining[finding.file]?.[finding.fingerprint] ?? 0
    if (!count) return true
    remaining[finding.file][finding.fingerprint] = count - 1
    return false
  })
}

export function validateBoundaryExceptions(exceptions, today = new Date().toISOString().slice(0, 10)) {
  const keys = new Set()
  for (const entry of exceptions) {
    const key = `${entry.file}:${entry.specifier}`
    if (!entry.file?.startsWith('src/features/') || !entry.specifier?.startsWith('.') || /[*?]/.test(key)
      || !entry.reason || !entry.owner || !entry.removal || !/^\d{4}-\d{2}-\d{2}$/.test(entry.expires ?? '')
      || entry.expires < today || keys.has(key)) throw Error(`Invalid/expired dependency exception: ${key}`)
    keys.add(key)
  }
}

export function newImportFindings(findings, exceptions) {
  validateBoundaryExceptions(exceptions)
  return findings.filter(finding => finding.rule === 'shared-direction'
    || !exceptions.some(entry => entry.file === finding.file && entry.specifier === finding.specifier))
}

export function complexity(file, source) {
  const tree = sourceTree(file, source)
  const functions = []
  function visit(node) {
    if (ts.isFunctionLike(node) && node.body) {
      const start = tree.getLineAndCharacterOfPosition(node.getStart()).line + 1
      const end = tree.getLineAndCharacterOfPosition(node.end).line + 1
      if (end - start + 1 > 100) {
        let decisions = 0
        function count(child) {
          if (child !== node && ts.isFunctionLike(child)) return
          if (ts.isIfStatement(child) || ts.isConditionalExpression(child) || ts.isCaseClause(child)
            || ts.isForStatement(child) || ts.isForOfStatement(child) || ts.isWhileStatement(child)
            || ts.isCatchClause(child)) decisions++
          ts.forEachChild(child, count)
        }
        count(node)
        functions.push({ name: node.name?.getText(tree) ?? node.parent?.name?.getText(tree) ?? '(anonymous)', line: start,
          lines: end - start + 1, decisionNodes: decisions })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  return { file, lines: source.split('\n').length - (source.endsWith('\n') ? 1 : 0), functions }
}

export function frontendComplexity(cwd) {
  return sourceFiles(path.join(cwd, 'src')).filter(file => !isTest(file)).map(file =>
    complexity(path.relative(cwd, file).split(path.sep).join('/'), fs.readFileSync(file, 'utf8')))
    .filter(file => file.lines > 500 || file.functions.length).sort((a, b) => b.lines - a.lines)
}
