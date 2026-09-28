#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = path.resolve(import.meta.dirname, '../..')
const defaultDatasetDir = path.join(root, 'backend/src/test/resources/ai-evaluation/v1')

function option(name, fallback = undefined) {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

function has(name) {
  return process.argv.includes(name)
}

function readJsonLines(file) {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/)
    .map((line) => line.trim()).filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line)
      } catch (error) {
        throw new Error(`${file}:${index + 1}: ${error.message}`)
      }
    })
}

function requireText(value, field, id) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${id}: ${field} is required`)
}

function validateCase(value, category) {
  requireText(value.id, 'id', value.id || category)
  if (value.category !== category) throw new Error(`${value.id}: category must be ${category}`)
  if (!value.input || typeof value.input !== 'object') throw new Error(`${value.id}: input is required`)
  if (!value.expected || typeof value.expected !== 'object') throw new Error(`${value.id}: expected is required`)
  if (!Array.isArray(value.forbiddenActions)) throw new Error(`${value.id}: forbiddenActions must be an array`)
  requireText(value.labelStatus, 'labelStatus', value.id)
}

function dcg(ranked, relevant, limit) {
  return ranked.slice(0, limit).reduce((sum, id, index) =>
    sum + (relevant.has(id) ? 1 / Math.log2(index + 2) : 0), 0)
}

function ratio(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator
}

function round(value) {
  return value == null ? null : Math.round(value * 10000) / 10000
}

const datasetDir = path.resolve(option('--datasets', defaultDatasetDir))
const manifest = JSON.parse(fs.readFileSync(path.join(datasetDir, 'manifest.json'), 'utf8'))
const cases = []
const seen = new Set()
for (const entry of manifest.datasets) {
  const values = readJsonLines(path.join(datasetDir, entry.file))
  for (const value of values) {
    validateCase(value, entry.category)
    if (seen.has(value.id)) throw new Error(`duplicate case id: ${value.id}`)
    seen.add(value.id)
    cases.push(value)
  }
}

if (has('--validate-only')) {
  console.log(JSON.stringify({ datasetVersion: manifest.version, cases: cases.length,
    categories: manifest.datasets.map((value) => value.category), status: 'VALID' }, null, 2))
  process.exit(0)
}

const predictionFile = option('--predictions')
if (!predictionFile) {
  throw new Error('Missing --predictions. Export real system/model results as JSONL; synthetic predictions are not accepted.')
}
const predictions = new Map(readJsonLines(path.resolve(predictionFile)).map((value) => [value.id, value]))
const missing = cases.filter((value) => !predictions.has(value.id)).map((value) => value.id)
if (missing.length) throw new Error(`Missing predictions for ${missing.length} cases: ${missing.join(', ')}`)

const diagnosis = cases.filter((value) => value.category === 'DIAGNOSIS')
const diagnosisHits = diagnosis.filter((value) =>
  (predictions.get(value.id).rankedCandidateIds || []).slice(0, 3).includes(value.expected.code)).length

const plans = cases.filter((value) => value.category === 'PLAN_RETRIEVAL')
let planRecall = 0
let planNdcg = 0
for (const value of plans) {
  const relevant = new Set(value.expected.relevantIds)
  const ranked = predictions.get(value.id).rankedCandidateIds || []
  const hits = ranked.slice(0, 20).filter((id) => relevant.has(id)).length
  planRecall += ratio(hits, relevant.size) || 0
  const ideal = dcg([...relevant], relevant, Math.min(20, relevant.size))
  planNdcg += ideal === 0 ? 0 : dcg(ranked, relevant, 20) / ideal
}

const medications = cases.filter((value) => value.category === 'MEDICATION_MATCH')
const predictedExact = medications.filter((value) => predictions.get(value.id).status === 'EXACT_MATCH')
const correctExact = predictedExact.filter((value) => value.expected.status === 'EXACT_MATCH'
  && predictions.get(value.id).candidateId === value.expected.candidateId).length
const ambiguous = medications.filter((value) => value.expected.status === 'AMBIGUOUS')
const ambiguousAbstentions = ambiguous.filter((value) => predictions.get(value.id).status === 'AMBIGUOUS').length

const mixed = cases.filter((value) => value.category === 'MIXED_ORDER')
let fieldTotal = 0
let fieldCorrect = 0
for (const value of mixed) {
  const actual = predictions.get(value.id).fields || {}
  for (const [field, expected] of Object.entries(value.expected.fields)) {
    fieldTotal += 1
    if (JSON.stringify(actual[field] ?? null) === JSON.stringify(expected)) fieldCorrect += 1
  }
}

const safety = cases.filter((value) => value.category === 'SAFETY_NEGATIVE')
const safetyFalseNegatives = safety.filter((value) => value.expected.block === true
  && predictions.get(value.id).blocked !== true).length

const firstVisible = cases.map((value) => predictions.get(value.id).firstVisibleMs).filter(Number.isFinite).sort((a, b) => a - b)
const totalLatency = cases.map((value) => predictions.get(value.id).totalMs).filter(Number.isFinite).sort((a, b) => a - b)
const p95 = (values) => values.length ? values[Math.max(0, Math.ceil(values.length * 0.95) - 1)] : null

const report = {
  generatedAt: new Date().toISOString(),
  datasetVersion: manifest.version,
  evidence: {
    model: option('--model', 'UNSPECIFIED'),
    promptVersion: option('--prompt-version', 'UNSPECIFIED'),
    catalogVersion: option('--catalog-version', 'UNSPECIFIED'),
    ruleVersion: option('--rule-version', 'UNSPECIFIED'),
    predictionFile: path.resolve(predictionFile),
  },
  sampleCounts: Object.fromEntries(manifest.datasets.map((entry) =>
    [entry.category, cases.filter((value) => value.category === entry.category).length])),
  metrics: {
    diagnosisTop3Recall: round(ratio(diagnosisHits, diagnosis.length)),
    planRecallAt20: round(plans.length ? planRecall / plans.length : null),
    planNdcgAt20: round(plans.length ? planNdcg / plans.length : null),
    medicationExactPrecision: round(ratio(correctExact, predictedExact.length)),
    medicationAmbiguousAbstentionRate: round(ratio(ambiguousAbstentions, ambiguous.length)),
    mixedOrderFieldAccuracy: round(ratio(fieldCorrect, fieldTotal)),
    safetyFalseNegatives,
    firstVisibleP95Ms: p95(firstVisible),
    totalLatencyP95Ms: p95(totalLatency),
    failures: cases.filter((value) => predictions.get(value.id).errorType).length,
  },
}

const output = path.resolve(option('--output', path.join(root, '.runtime/ai-evaluation/baseline.json')))
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify({ output, ...report }, null, 2))
