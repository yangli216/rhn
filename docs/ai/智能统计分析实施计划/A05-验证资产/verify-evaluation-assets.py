#!/usr/bin/env python3
"""Validate A05 dataset structure, reference plans and freeze fingerprints.
No model inference, application execution, authorization or performance testing.
"""
import hashlib
import json
import re
from collections import Counter
from datetime import datetime
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker

HERE = Path(__file__).resolve().parent
read = lambda name: json.loads((HERE / name).read_text())


def require(condition, message):
    if not condition:
        raise ValueError(message)


def pointer(document, path):
    value = document
    for key in path.strip('/').split('/'):
        value = value[key.replace('~1', '/').replace('~0', '~')]
    return value


dev = read('development-requests.json')
frozen = read('frozen-evaluation.json')
context = read('evaluation-context.json')
results = read('evaluation-results-template.json')
manifest = read('freeze-manifest.json')
require(dev['version'] == 'a05-dev-v1', 'development version')
require(frozen['version'] == 'a05-frozen-v1', 'frozen version')
require(context['version'] == 'a05-eval-v1' and context['synthetic'] is True, 'context provenance')
require(frozen['kind'] == 'FROZEN_REGRESSION_NOT_BLIND_HOLDOUT', 'do not claim blind evaluation')
require([c['id'] for c in dev['cases']] == [f'DEV{i:02}' for i in range(1, 31)], '30 unique development cases')
require([c['id'] for c in frozen['cases']] == [f'F{i:02}' for i in range(1, 61)], '60 unique frozen cases')
normalized = lambda text: re.sub(r'\s+', '', text).casefold()
dev_inputs = {normalized(c['request']) for c in dev['cases']}
frozen_inputs = {normalized(c['turns'][-1]['text']) for c in frozen['cases']}
require(len(dev_inputs) == 30 and len(frozen_inputs) == 60, 'duplicate request text')
require(not dev_inputs & frozen_inputs, 'exact input overlap between tuning and frozen sets')
require(all(c['provenance'] == 'SYNTHETIC_AUTHORED' for c in dev['cases'] + frozen['cases']), 'real provenance invented')
require(all(c['split'] == 'DEVELOPMENT_TUNING' for c in dev['cases']), 'development split mismatch')
require(all(c['split'] == 'FROZEN_REGRESSION' for c in frozen['cases']), 'frozen split mismatch')
counts = Counter(c['category'] for c in frozen['cases'])
require(dict(counts) == {'SUPPORTED': 18, 'CLARIFICATION': 10, 'AUTHORIZATION': 6, 'INJECTION': 6,
                        'UNSUPPORTED': 8, 'MULTI_TURN': 8, 'RESILIENCE': 4}, 'coverage mismatch')
require(sum(c['mandatorySafety'] for c in frozen['cases']) == 14, 'mandatory safety subset mismatch')
actors = {a['id']: a for a in context['actors']}
now = datetime.fromisoformat(context['serverNow'])
for a in actors.values():
    grant = a['statistics_grant']
    require(datetime.fromisoformat(grant['valid_from']) <= now < datetime.fromisoformat(grant['valid_until_exclusive']),
            'unexpected temporal grant mismatch')
require(actors['U_REVOKED']['statistics_grant']['status'] == 'REVOKED', 'revoked scenario lost')
require(context['defaults']['real_data_enabled'] is False and context['defaults']['speech_enabled'] is False,
        'real functionality enabled')
schema = read('../A04-验证资产/analysis-contract.schema.json')
validator = Draft202012Validator(schema, format_checker=FormatChecker())
metrics = {m['a02Id']: m for m in read('../A04-验证资产/candidate-catalog.json')['metrics']}
require(all(m['reviewStatus'] == 'CANDIDATE' for m in metrics.values()), 'upstream review status changed')
plan_count = 0
checklist = (HERE / '冻结回归清单.md').read_text()
for case in frozen['cases']:
    require(case['actor'] in actors, case['id'] + ' actor')
    expected = case['expected']
    require(bool(case['setup']) and bool(expected['assertions']), case['id'] + ' incomplete specification')
    require(expected['mayExecuteBeforeConfirmation'] is False, case['id'] + ' unconfirmed execution')
    require(set(expected['metricIds']) <= set(metrics), case['id'] + ' unknown candidate metric')
    require(expected['datasetRefs'] == sorted({metrics[m]['datasetRef'] for m in expected['metricIds']}),
            case['id'] + ' reference mismatch')
    require(f"| {case['id']} |" in checklist and case['turns'][-1]['text'] in checklist, 'checklist mismatch')
    if case['category'] == 'MULTI_TURN':
        require(len(case['turns']) >= 3 and any(t.get('syntheticFixture') for t in case['turns']),
                case['id'] + ' needs explicitly synthetic history')
    plan = expected['plan']
    if case['category'] == 'SUPPORTED':
        require(plan is not None and expected['oracle'] is not None, case['id'] + ' supported oracle missing')
    if case['category'] in {'CLARIFICATION', 'AUTHORIZATION', 'INJECTION', 'UNSUPPORTED'}:
        require(plan is None, case['id'] + ' should not contain executable plan')
    if plan is not None:
        validator.validate(plan)
        query = plan['querySpec']
        require(query['metricRefs'] == [metrics[m]['ref'] for m in expected['metricIds']], case['id'] + ' metric map')
        require(len(expected['datasetRefs']) == 1 and query['datasetRef'] == expected['datasetRefs'][0],
                case['id'] + ' mixed time basis')
        require(len({c['componentId'] for c in plan['viewSpec']['components']}) == len(plan['viewSpec']['components']),
                case['id'] + ' component ID')
        for component in plan['viewSpec']['components']:
            require(set(component['dimensions']) == set(query['dimensions']), case['id'] + ' view dimensions')
            require(set(component['metricRefs']) <= set(query['metricRefs']), case['id'] + ' view metrics')
        if any(metrics[m]['requiresComparison'] for m in expected['metricIds']):
            require(query['comparison'] == 'PREVIOUS_CALENDAR_MONTH', case['id'] + ' comparison missing')
        plan_count += 1
    oracle = expected['oracle']
    if oracle and 'file' in oracle:
        source = HERE / oracle['file']
        require(source.is_file(), case['id'] + ' oracle file missing')
        pointer(json.loads(source.read_text()), oracle['pointer'])
require(results['runStatus'] == 'NOT_RUN' and all(value is None for value in results['scores'].values()),
        'results must remain unmeasured')
require([r['id'] for r in results['cases']] == [c['id'] for c in frozen['cases']], 'result template cases')
require(all(r['status'] == 'NOT_RUN' and r['observedOutcome'] is None for r in results['cases']), 'fabricated run result')
for entry in manifest['files']:
    path = HERE / entry['path']
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    require(actual == entry['sha256'], 'frozen input changed: ' + entry['path'])
for file in HERE.parent.rglob('*.md'):
    text = file.read_text()
    require(text.count('```') % 2 == 0, 'unclosed fence: ' + str(file))
    for target in re.findall(r'\]\(([^)]+)\)', text):
        require((file.parent / target).exists(), 'broken link: ' + str(file) + ' -> ' + target)
print(f'PASS: 30 development requests, 60 frozen cases, {plan_count} schema-valid reference plans, 14 mandatory safety specifications; {len(manifest["files"])} frozen fingerprints matched. Model/API/performance evaluation NOT RUN.')
