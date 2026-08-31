create table presence_metric_samples (
    id number(19,0) primary key,
    tenant_id number(19,0) not null,
    scope_type varchar2(24 char) not null,
    scope_key varchar2(100 char) not null,
    organization_id number(19,0),
    department_id number(19,0),
    bucket_at timestamp with time zone not null,
    online_users number(19,0) not null,
    active_users number(19,0) not null,
    online_contexts number(19,0) not null,
    connections number(19,0) not null,
    instances number(19,0) not null,
    created_at timestamp with time zone not null,
    constraint fk_presence_metric_tenant foreign key (tenant_id) references tenants(id),
    constraint ck_presence_metric_scope check (scope_type in ('TENANT','ORGANIZATION','DEPARTMENT')),
    constraint ck_presence_metric_values check (online_users >= 0 and active_users >= 0
        and online_contexts >= 0 and connections >= 0 and instances >= 0)
);

create unique index uk_presence_metric_bucket on presence_metric_samples
    (tenant_id,scope_key,to_char(sys_extract_utc(bucket_at),'YYYYMMDDHH24MISSFF6'));
create index idx_presence_metric_range on presence_metric_samples
    (tenant_id,scope_key,bucket_at);
create index idx_presence_metric_retention on presence_metric_samples (bucket_at);
