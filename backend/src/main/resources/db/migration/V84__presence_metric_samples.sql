create table presence_metric_samples (
    id bigint primary key,
    tenant_id bigint not null,
    scope_type varchar(24) not null,
    scope_key varchar(100) not null,
    organization_id bigint,
    department_id bigint,
    bucket_at timestamp with time zone not null,
    online_users bigint not null,
    active_users bigint not null,
    online_contexts bigint not null,
    connections bigint not null,
    instances bigint not null,
    created_at timestamp with time zone not null,
    constraint fk_presence_metric_tenant foreign key (tenant_id) references tenants(id),
    constraint uk_presence_metric_bucket unique (tenant_id,scope_key,bucket_at),
    constraint ck_presence_metric_scope check (scope_type in ('TENANT','ORGANIZATION','DEPARTMENT')),
    constraint ck_presence_metric_values check (online_users >= 0 and active_users >= 0
        and online_contexts >= 0 and connections >= 0 and instances >= 0)
);

create index idx_presence_metric_range on presence_metric_samples
    (tenant_id,scope_key,bucket_at);
create index idx_presence_metric_retention on presence_metric_samples (bucket_at);
