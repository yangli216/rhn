insert into tenants (id, code, name, status, created_at, updated_at, revision) values
    ('362387869790209', 'QINGHE-DEMO', '青禾县医共体（演示）',
     'ACTIVE', current_timestamp, current_timestamp, 0);

-- Dedicated tenant for automated isolation checks. Local/test profiles only.
insert into tenants (id, code, name, status, created_at, updated_at, revision) values
    ('362387869790210', 'ISOLATION-TEST', '租户隔离测试',
     'ACTIVE', current_timestamp, current_timestamp, 0);
