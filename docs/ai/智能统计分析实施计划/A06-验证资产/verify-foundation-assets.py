#!/usr/bin/env python3
"""Offline migration parity and optional runtime OpenAPI check; not a real-dialect test."""
import json
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[4]
resources = root / 'backend/src/main/resources/db'
def analytics_schema(folder):
    sql = (resources / folder / 'B1_42_1__rhn_schema_and_metadata.sql').read_text()
    # Compare the four table definitions and their three composite foreign keys independently of seed data.
    return '\n'.join(re.findall(r'(?:create table RHN_AN_\w+ \(.*?\);|alter table RHN_AN_\w+ add .*?;)', sql, re.S | re.I))
postgres = analytics_schema('migration')
oracle = analytics_schema('oracle')
normalized = oracle.replace('number(19)', 'bigint').replace('number(10)', 'integer').replace('varchar2(', 'varchar(').replace(' clob ', ' text ')
assert postgres == normalized, 'Oracle/PostgreSQL analytics columns or constraints drifted'
assert len(re.findall(r'create table ', postgres)) == 4
assert len(re.findall(r'foreign key \(ID_TNT,', postgres)) == 3
for identifier in re.findall(r'(?:table|constraint|index) (\w+)', oracle):
    assert len(identifier) <= 30, identifier
if len(sys.argv) > 1:
    runtime = json.loads(Path(sys.argv[1]).read_text())
    committed = json.loads((root / 'docs/api/openapi.json').read_text())
    path = '/api/analytics/capabilities'
    assert runtime['paths'][path] == committed['paths'][path]
    assert runtime['components']['schemas']['AnalyticsCapabilities'] == committed['components']['schemas']['AnalyticsCapabilities']
    for endpoint in [p for p in runtime['paths'] if p.startswith('/api/analytics/')]:
        assert runtime['paths'][endpoint] == committed['paths'][endpoint], endpoint
print('PASS: 4 tables, 3 tenant-composite foreign keys, Oracle/PostgreSQL structural parity; supplied analytics OpenAPI checked. This offline verifier does not execute database queries.')
