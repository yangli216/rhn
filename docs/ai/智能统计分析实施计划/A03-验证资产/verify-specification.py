#!/usr/bin/env python3
"""Read-only A03 document/fixture consistency checks. Does NOT evaluate authorization."""
import json
import re
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
identities = json.loads((HERE / 'synthetic-identities.json').read_text())
scenarios = json.loads((HERE / 'expected-scenarios.json').read_text())


def require(condition, message):
    if not condition:
        raise ValueError(message)


require(identities['synthetic'] is True, 'must remain synthetic')
require(identities['version'] == scenarios['version'] == 'a03-synthetic-v1', 'version mismatch')
require(scenarios['status'] == 'SPECIFICATION_ONLY_NOT_EXECUTED_AGAINST_APPLICATION', 'misleading test status')
orgs = {(o['tenant'], o['organization']): set(o['departments']) for o in identities['organizations']}
require(len(orgs) == 3, 'three organizations required')
require({tenant for tenant, _ in orgs} == {'T_A', 'T_B'}, 'two tenants required')
require(sum(tenant == 'T_A' for tenant, _ in orgs) == 2, 'two same-tenant organizations required')
require(len(orgs['T_A', 'H_A']) >= 3, 'at least three departments in H_A')
actors = {a['id']: a for a in identities['actors']}
require(len(actors) == len(identities['actors']) == 11, 'duplicate or missing identity')
metrics = {f'M{i:02}' for i in range(1, 13)}
actions = {'ANALYTICS.' + suffix for suffix in ('READ', 'CREATE', 'RUN', 'EXPORT', 'DETAIL',
           'PUBLISH_DEPARTMENT', 'PUBLISH_ORGANIZATION', 'APPROVE', 'MANAGE_CATALOG')}
for actor in actors.values():
    context = actor['work_context']
    key = (actor['tenant'], context['organization'])
    require(key in orgs and context['department'] in orgs[key], 'invalid work context')
    grant = actor['statistics_grant']
    require(grant['organization'] == context['organization'], 'ambiguous organization grant')
    require(set(grant['departments']) <= orgs[key], 'invalid department membership')
    require(set(grant['metrics']) <= metrics, 'unapproved metric introduced into fixture')
    require(grant['status'] in {'ACTIVE', 'REVOKED'}, 'unknown grant status')
    require(datetime.fromisoformat(grant['valid_from']) < datetime.fromisoformat(grant['valid_until_exclusive']),
            'invalid validity interval')
    require(grant['policy_version'] == 'a03-proposal-v1', 'policy version mismatch')
    require(actor['action_grant']['organization'] == context['organization'], 'action scope mismatch')
    require(set(actor['action_grant']['actions']) <= actions, 'unknown action')
    if grant['departments']:
        require(grant['dataset'] == 'outpatient-aggregate-synthetic@1', 'dataset missing')
        require(grant['purposes'] == ['OPERATIONS_REVIEW'], 'purpose missing')
        require(not {'patient_id', 'patient_name', 'phone', 'clinical_note'} & set(grant['dimensions']),
                'sensitive output in default dimensions')
    else:
        require(not grant['metrics'] and not grant['purposes'] and not grant['dimensions'], 'empty grant leaks capability')
require(actors['U_MULTI']['statistics_grant']['departments'] == ['D_A1', 'D_A2'], 'multi-department example lost')
require(actors['U_MULTI']['work_context']['department'] == 'D_A1', 'single work department example lost')
require(set(actors['U_HOSP']['statistics_grant']['departments']) == orgs['T_A', 'H_A'], 'hospital example lost')
require(actors['U_REVOKED']['statistics_grant']['status'] == 'REVOKED', 'revocation example missing')
require(actors['U_LIMIT']['statistics_grant']['metrics'] == ['M07'], 'metric restriction example missing')
require(identities['default_flags'] == {'aggregate_only': True, 'detail_enabled': False,
        'export_enabled': False, 'external_model_enabled': False, 'speech_enabled': False, 'real_data_enabled': False},
        'development defaults unexpectedly expanded')
for asset in identities['assets']:
    owner = actors[asset['owner']]
    require((asset['tenant'], asset['organization']) == (owner['tenant'], owner['work_context']['organization']),
            'asset owner scope mismatch')
for grant in identities['review_grants']:
    require(grant['actor'] in actors and grant['department'] in orgs[grant['tenant'], grant['organization']],
            'review scope invalid')
    require(grant['self_review_allowed'] is False, 'self-review default changed')
require([case['id'] for case in scenarios['cases']] == [f'C{i:02}' for i in range(1, 45)], '44 unique cases required')
allowed_results = {'ALLOW', 'ALLOW_METADATA_ONLY', 'ALLOW_EMPTY', 'DENY', 'FAIL_CLOSED',
                   'CANCEL_AND_BLOCK_DELIVERY', 'PROTECT', 'DENY_OR_REQUIRE_REVIEW'}
markdown = (HERE / '验收场景.md').read_text()
for case in scenarios['cases']:
    require(case['actor'] in actors and case['expected'] in allowed_results, 'case reference invalid')
    require(bool(case['request']) and bool(case['reason']), 'incomplete case')
    row = f"| {case['id']} | {case['actor']} | {case['request']} | {case['expected']} | {case['reason']} |"
    require(row in markdown, 'scenario Markdown/JSON mismatch: ' + case['id'])
report = (HERE.parent / 'A03-统计授权与数据处理决策表.md').read_text()
require(re.findall(r'^\| (D\d{2}) \|', report, re.M) == [f'D{i:02}' for i in range(1, 13)],
        '12 explicit pending decisions required')
for file in HERE.parent.rglob('*.md'):
    text = file.read_text()
    require(text.count('```') % 2 == 0, 'unclosed code fence')
    for target in re.findall(r'\]\(([^)]+)\)', text):
        require((file.parent / target).exists(), f'broken local link: {file}: {target}')
print('PASS: 11 identities, 2 tenants, 3 organizations, 5 departments, 44 scenario specifications, 12 pending decisions; structural consistency only, no authorization executed.')
