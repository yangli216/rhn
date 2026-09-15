#!/usr/bin/env python3
"""Validate frozen A04 schema examples and local semantic/time oracles.
Not an API, permission engine, SQL compiler or state-machine implementation.
"""
import copy
import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

try:
    from jsonschema import Draft202012Validator, FormatChecker
except ImportError as error:
    raise SystemExit('Requires jsonschema 4.x in the validation environment; no packages installed automatically.') from error

HERE = Path(__file__).resolve().parent
read = lambda name: json.loads((HERE / name).read_text())
schema = read('analysis-contract.schema.json')
Draft202012Validator.check_schema(schema)
catalog = {m['ref']: m for m in read('candidate-catalog.json')['metrics']}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def identifiers(value, field=''):
    if isinstance(value, dict):
        return all(identifiers(child, key) for key, child in value.items())
    if isinstance(value, list):
        return all(identifiers(child, field[:-1] if field.endswith('Ids') else field) for child in value)
    if field in {'draftId', 'assetId', 'proposalId', 'reviewId', 'confirmationId', 'departmentId'}:
        return int(value) <= 9223372036854775807
    return True


def semantics(spec):
    query = spec['querySpec']
    if query['datasetRef'] not in {m['datasetRef'] for m in catalog.values()}:
        return 'CATALOG_REFERENCE_UNAVAILABLE'
    if any(ref not in catalog for ref in query['metricRefs']):
        return 'CATALOG_REFERENCE_UNAVAILABLE'
    if any(catalog[ref]['datasetRef'] != query['datasetRef'] for ref in query['metricRefs']):
        return 'METRIC_DATASET_MISMATCH'
    if any(catalog[ref]['requiresComparison'] for ref in query['metricRefs']) and query['comparison'] == 'NONE':
        return 'COMPARISON_REQUIRED'
    fields = [f['field'] for f in query['filters']]
    if len(set(fields)) != len(fields):
        return 'FILTER_DUPLICATE'
    window = spec['parameterSchema']['period']['defaultValue']
    if window['kind'] == 'FIXED':
        start = date.fromisoformat(window['startDate'])
        end = date.fromisoformat(window['endDateExclusive'])
        if start >= end:
            return 'TIME_RANGE_INVALID'
        if query['comparison'] == 'PREVIOUS_CALENDAR_MONTH':
            next_month = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
            if start.day != 1 or end != next_month:
                return 'COMPARISON_WINDOW_INVALID'
    if query['comparison'] != 'NONE' and {'calendar_day', 'calendar_month'} & set(query['dimensions']):
        return 'COMPARISON_DIMENSION_UNSUPPORTED'
    seen = set()
    for component in spec['viewSpec']['components']:
        if component['componentId'] in seen:
            return 'COMPONENT_ID_DUPLICATE'
        seen.add(component['componentId'])
        if not set(component['metricRefs']) <= set(query['metricRefs']):
            return 'VIEW_REFERENCE_INVALID'
        if set(component['dimensions']) != set(query['dimensions']):
            return 'VIEW_REFERENCE_INVALID'
        if component['type'] == 'KPI' and (component['dimensions'] or len(component['metricRefs']) != 1):
            return 'VIEW_SHAPE_INVALID'
        if component['type'] in {'BAR', 'LINE'} and len(component['dimensions']) != 1:
            return 'VIEW_SHAPE_INVALID'
        if component['type'] == 'LINE' and component['dimensions'][0] not in {'calendar_day', 'calendar_month'}:
            return 'VIEW_SHAPE_INVALID'
    return 'VALID'


def validate(kind, payload):
    local = copy.deepcopy(schema)
    local['$ref'] = '#/$defs/' + kind
    validator = Draft202012Validator(local, format_checker=FormatChecker())
    if list(validator.iter_errors(payload)):
        return 'SCHEMA_INVALID'
    if not identifiers(payload):
        return 'IDENTIFIER_OUT_OF_RANGE'
    if kind == 'AnnotationRequest' and 'dimensionValue' in payload and 'fieldRef' not in payload:
        return 'ANNOTATION_TARGET_INCOMPLETE'
    if kind == 'RunRequest':
        period = payload['parameters'].get('period')
        if period and period['kind'] == 'FIXED' and date.fromisoformat(period['startDate']) >= date.fromisoformat(period['endDateExclusive']):
            return 'TIME_RANGE_INVALID'
    if kind == 'AnalysisSpec':
        return semantics(payload)
    if kind == 'ApplyChangeRequest':
        return semantics(payload['proposedSpec'])
    return 'VALID'


cases = read('contract-cases.json')['cases']
require(len({case['id'] for case in cases}) == len(cases), 'duplicate schema case')
for case in cases:
    actual = validate(case['schemaType'], case['input'])
    require(actual == case['expected'], f"{case['id']}: expected {case['expected']}, actual {actual}")
require(validate('AnalysisSpec', read('analysis-example.json')) == 'VALID', 'example invalid')
# Independently fixed date oracles are read, never generated or rewritten.
time_cases = read('time-cases.json')['cases']
for case in time_cases:
    zone = ZoneInfo(case['zone'])
    current = datetime.fromisoformat(case['now']).astimezone(zone).date().replace(day=1)
    previous = (current - timedelta(days=1)).replace(day=1)
    require((previous.isoformat(), current.isoformat()) == (case['startDate'], case['endDateExclusive']), case['id'])
    for value, field in ((previous, 'startUtc'), (current, 'endUtc')):
        instant = datetime.combine(value, datetime.min.time(), zone).astimezone(timezone.utc)
        require(instant == datetime.fromisoformat(case[field]), case['id'] + field)
state_doc = read('state-machines.json')
for name, machine in state_doc['machines'].items():
    require(machine['initial'] in machine['states'], name + ' initial')
    require(set(machine['terminal']) <= set(machine['states']), name + ' terminals')
    seen = set()
    for start, end, event in machine['transitions']:
        require(start in machine['states'] and end in machine['states'] and bool(event), name + ' transition')
        require(start not in machine['terminal'], name + ' terminal cannot leave')
        require((start, event) not in seen, name + ' ambiguous transition')
        seen.add((start, event))
    reachable = {machine['initial']}
    while True:
        expanded = reachable | {end for start, end, _ in machine['transitions'] if start in reachable}
        if expanded == reachable:
            break
        reachable = expanded
    require(reachable == set(machine['states']), name + ' unreachable state')
require([m['a02Id'] for m in catalog.values()] == [f'M{i:02}' for i in range(1, 13)], 'metric mapping mismatch')
require(all(m['reviewStatus'] == 'CANDIDATE' for m in catalog.values()), 'accidental catalog approval')
require(read('candidate-catalog.json')['realExecutionEnabled'] is False, 'real execution enabled')
print(f'PASS: {len(cases)} schema/semantic cases, {len(time_cases)} fixed date oracles; 6 state graphs and {len(state_doc["guard_scenarios"])} guard specifications structurally checked. No API/authorization/concurrency execution.')
