#!/usr/bin/env python3
"""Offline migration parity and optional runtime OpenAPI check; not a real-dialect test."""
import json
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[4]
resources = root / 'backend/src/main/resources/db'
postgres = (resources / 'migration/V1_42_0__analytics_foundation.sql').read_text()
oracle = (resources / 'oracle/V1_42_0__analytics_foundation.sql').read_text()
normalized = oracle.replace('number(19)', 'bigint').replace('number(10)', 'integer').replace('varchar2(', 'varchar(').replace(' clob ', ' text ')
assert postgres == normalized, 'Oracle/PostgreSQL columns or constraints drifted'
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
