#!/usr/bin/env python3
"""Offline arithmetic audit of A02 synthetic facts; not the analytics engine.

Reads immutable, manually enumerated golden values. No database, network, application
imports, or file writes. Future implementation tests must compare to golden-expected.json
rather than use this verifier to produce their expected values.
"""
import copy
import json
from collections import Counter
from datetime import datetime
from fractions import Fraction
from pathlib import Path

HERE = Path(__file__).resolve().parent
fixture = json.loads((HERE / 'synthetic-facts.json').read_text())
golden = json.loads((HERE / 'golden-expected.json').read_text())
checks = 0


def equal(actual, expected, label):
    global checks
    if actual != expected:
        raise ValueError(f'{label}: actual={actual!r}, expected={expected!r}')
    checks += 1


def stamp(value):
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        raise ValueError('TIMEZONE_REQUIRED')
    return parsed


def within(value, window):
    return value is not None and stamp(window['start']) <= stamp(value) < stamp(window['end_exclusive'])


def quality(facts):
    seen = set()
    for row in facts:
        for field in ('registration_id', 'encounter_id', 'tenant_id', 'organization_id',
                      'department_id', 'patient_id', 'registration_at', 'source'):
            if not row.get(field):
                raise ValueError('REQUIRED_FACT_MISSING')
        key = (row['tenant_id'], row['registration_id'])
        if key in seen:
            raise ValueError('DUPLICATE_FACT')
        seen.add(key)
        if row['encounter_status'] == 'COMPLETED' and not row['encounter_completed_at']:
            raise ValueError('COMPLETED_TIME_MISSING')
        if row['source'] not in ('DIRECT', 'WINDOW', 'WALK_IN', 'EMERGENCY', 'TRANSFER'):
            raise ValueError('UNKNOWN_SOURCE')
        stamp(row['registration_at'])


quality(fixture['facts'])
equal(fixture['fixture_version'], golden['fixture_version'], 'fixture version')
equal(fixture['synthetic'], True, 'synthetic only')
scope = fixture['scope']


def authorized(row):
    return (row['tenant_id'] == scope['tenant_id']
            and row['organization_id'] == scope['organization_id']
            and row['department_id'] in scope['department_ids'])


facts = [row for row in fixture['facts'] if authorized(row)]
window = fixture['window']
cohort = [row for row in facts if within(row['registration_at'], window)]
events = [row for row in fixture['cancellation_events'] if authorized(row)]
cancelled_ids = {row['registration_id'] for row in events
                 if stamp(row['occurred_at']) <= stamp(fixture['watermark'])}
cohort_cancelled = [row for row in cohort if row['registration_id'] in cancelled_ids]
completed = [row for row in facts if row['encounter_status'] == 'COMPLETED'
             and within(row['encounter_completed_at'], window)]
cohort_completed = [row for row in cohort if row['encounter_status'] == 'COMPLETED'
                    and stamp(row['encounter_completed_at']) <= stamp(fixture['watermark'])]
previous = [row for row in facts if row['encounter_status'] == 'COMPLETED'
            and within(row['encounter_completed_at'], fixture['previous_window'])]
period_cancelled = {row['registration_id'] for row in events if within(row['occurred_at'], window)}


def ids(rows):
    return sorted(row['registration_id'] for row in rows)


members = {
    'M01': ids(cohort),
    'M02': ids([row for row in cohort if row['source'] != 'TRANSFER']),
    'M03': ids([row for row in cohort if row['source'] == 'TRANSFER']),
    'M04': ids(cohort_cancelled),
    'M05': ids([row for row in cohort if row['registration_id'] not in cancelled_ids]),
    'M06': sorted(period_cancelled), 'M07': ids(completed), 'M08': ids(cohort_completed),
    'M13': sorted({row['patient_id'] for row in completed}),
}
for key, values in members.items():
    equal(values, golden['metrics'][key]['members'], key + ' members')
    equal(len(values), golden['metrics'][key]['value'], key + ' value')
for key, numerator, denominator in (
        ('M09', len(cohort_cancelled), len(cohort)),
        ('M10', len(cohort_completed), len(cohort)),
        ('M12', len(completed) - len(previous), len(previous))):
    equal(Fraction(numerator, denominator), Fraction(*golden['metrics'][key]['fraction']), key)
equal(len(completed) - len(previous), golden['metrics']['M11']['value'], 'M11')
equal(len(completed), golden['metrics']['M11']['current'], 'M11 current')
equal(len(previous), golden['metrics']['M11']['previous'], 'M11 previous')

b = golden['boundaries']
by_dept = lambda rows: dict(Counter(row['department_id'] for row in rows))
equal(by_dept(cohort), b['january_by_department'], 'department cohort')
equal(by_dept(cohort_cancelled), b['cancellations_by_department'], 'department cancellation')
equal(by_dept(completed), b['completed_by_department'], 'department completed')
unique_by_dept = {dept: len({row['patient_id'] for row in completed if row['department_id'] == dept})
                  for dept in scope['department_ids']}
equal(unique_by_dept, b['distinct_patients_by_department'], 'distinct patients do not sum')
equal(ids(previous), b['previous_completed'], 'previous month')
day = {'start': window['start'], 'end_exclusive': '2026-01-02T00:00:00+08:00'}
equal(ids([row for row in facts if within(row['registration_at'], day)]), b['january_first_day'], 'year boundary')
equal(sum(within(row['encounter_registered_at'], window) for row in facts),
      b['wrong_encounter_registered_time_january_count'], 'wrong registration clock')
earlier_ids = {event['registration_id'] for event in events
               if stamp(event['occurred_at']) < stamp(window['end_exclusive'])}
equal(sorted(earlier_ids & set(ids(cohort))), b['january_cohort_cancelled_at_february_first'], 'later cancellation')
by_event = {event['event_id']: event for event in events}
deliveries = [by_event[event_id] for event_id in fixture['cancellation_deliveries']]
equal(sum(within(event['occurred_at'], window) for event in deliveries),
      b['raw_cancellation_delivery_count_in_january'], 'repeated deliveries')
equal(len({event['event_id'] for event in deliveries if within(event['occurred_at'], window)}),
      b['deduplicated_cancellation_count_in_january'], 'event deduplication')
diagnoses = Counter(row['encounter_id'] for row in fixture['diagnoses'])
equal(sum(max(1, diagnoses[row['encounter_id']]) for row in completed),
      b['naive_completed_left_join_diagnoses_count'], 'one-to-many trap')
equal(sum(within(row['registration_completed_at'], window) for row in facts),
      b['registration_closed_in_january_count'], 'registration close time trap')
equal(sum(within(row['encounter_completed_at'], window) for row in facts),
      b['encounter_completed_timestamp_only_in_january_count'], 'transfer completion time trap')
equal(sum(row['registration_status'] == 'COMPLETED' for row in facts),
      b['registration_status_completed_count'], 'registration status trap')
equal(sum(row['encounter_status'] == 'COMPLETED' and within(row['encounter_completed_at'], window)
          for row in fixture['facts']), b['unfiltered_completed_count'], 'scope sentinels')
equal(Fraction(len(cohort_cancelled), len(cohort)), Fraction(*b['ratio_of_sums']), 'weighted ratio')
equal(sum((Fraction(by_dept(cohort_cancelled)[d], by_dept(cohort)[d]) for d in scope['department_ids']),
          Fraction(0)) / 2, Fraction(*b['incorrect_mean_of_department_ratios']), 'incorrect ratio average')
ratio = lambda numerator, denominator: Fraction(numerator, denominator) if denominator else None
empty = [row for row in cohort if row['department_id'] == 'D_EMPTY']
equal(len(empty), b['empty_department_count'], 'empty count')
equal(ratio(0, len(empty)), b['zero_denominator_result'], 'empty ratio')
equal(ratio(4, 0), b['zero_denominator_result'], 'growth with zero baseline')
equal(by_dept(cohort), b['historical_department_counts'], 'historical department IDs')
successors = {change['department_id']: change['current_successor_id']
              for change in fixture['organization_changes'] if 'current_successor_id' in change}
equal(dict(Counter(successors.get(row['department_id'], row['department_id']) for row in cohort)),
      b['wrong_current_successor_counts'], 'current organization mapping trap')
equal(stamp(window['start']).isoformat(), '2026-01-01T00:00:00+08:00', 'explicit offset')
equal(stamp(window['start']), stamp('2025-12-31T16:00:00+00:00'), 'UTC equivalent')
# Local quality examples are not tests of future production policy enforcement.
for field, value, expected in (
        ('registration_at', None, 'REQUIRED_FACT_MISSING'),
        ('department_id', None, 'REQUIRED_FACT_MISSING'),
        ('encounter_completed_at', None, 'COMPLETED_TIME_MISSING'),
        ('source', 'UNREVIEWED', 'UNKNOWN_SOURCE')):
    mutated = copy.deepcopy(fixture['facts'])
    mutated[0][field] = value
    try:
        quality(mutated)
    except ValueError as error:
        equal(str(error), expected, field + ' quality error')
    else:
        raise ValueError('missing expected quality rejection: ' + field)
try:
    quality(fixture['facts'] + [fixture['facts'][0]])
except ValueError as error:
    equal(str(error), 'DUPLICATE_FACT', 'duplicate source fact')
else:
    raise ValueError('duplicate source fact not rejected')
print(f'PASS: {checks} checks; 13 candidate metric oracles; synthetic arithmetic/quality only.')
