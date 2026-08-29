alter table organization_catalog_items add column replaces_adoption_id bigint;
alter table organization_catalog_items add constraint fk_org_item_replaces
    foreign key (tenant_id, replaces_adoption_id) references organization_catalog_items(tenant_id, id);
create index idx_org_item_replaces on organization_catalog_items (tenant_id, replaces_adoption_id);

alter table catalog_prices add column replaces_price_id bigint;
alter table catalog_prices add constraint fk_catalog_price_replaces
    foreign key (tenant_id, replaces_price_id) references catalog_prices(tenant_id, id);
create index idx_catalog_price_replaces on catalog_prices (tenant_id, replaces_price_id);

create table catalog_change_batches (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    batch_type varchar(32) not null,
    operation_type varchar(32) not null,
    organization_id bigint,
    request_code varchar(128) not null,
    request_hash varchar(64) not null,
    business_date date not null,
    status varchar(32) not null,
    total_rows integer default 0 not null,
    succeeded_rows integer default 0 not null,
    failed_rows integer default 0 not null,
    created_at timestamp with time zone not null,
    created_by bigint not null,
    updated_at timestamp with time zone not null,
    updated_by bigint not null,
    constraint fk_catalog_change_batch_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_catalog_change_batch_org foreign key (tenant_id, organization_id) references organizations(tenant_id, id),
    constraint uk_catalog_change_batch_request unique (tenant_id, request_code),
    constraint uk_catalog_change_batch_tenant_id unique (tenant_id, id),
    constraint ck_catalog_change_batch_type check (batch_type in ('ADOPTION', 'PRICE')),
    constraint ck_catalog_change_operation check (operation_type in ('ADOPT', 'RETIRE', 'PRICE_UPSERT')),
    constraint ck_catalog_change_status check (status in ('PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED')),
    constraint ck_catalog_change_counts check (
        total_rows >= 0 and succeeded_rows >= 0 and failed_rows >= 0 and
        succeeded_rows + failed_rows <= total_rows
    )
);
create index idx_catalog_change_batch_list on catalog_change_batches (tenant_id, created_at, status);

create table catalog_change_batch_rows (
    id bigint primary key,
    tenant_id bigint not null,
    batch_id bigint not null,
    row_number integer not null,
    catalog_item_id bigint not null,
    package_id bigint,
    source_json text not null,
    status varchar(32) not null,
    target_resource_type varchar(32),
    target_id bigint,
    error_code varchar(128),
    error_message varchar(1000),
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    updated_by bigint not null,
    constraint fk_catalog_change_row_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_catalog_change_row_batch foreign key (tenant_id, batch_id) references catalog_change_batches(tenant_id, id),
    constraint fk_catalog_change_row_item foreign key (tenant_id, catalog_item_id) references catalog_items(tenant_id, id),
    constraint uk_catalog_change_row_number unique (batch_id, row_number),
    constraint ck_catalog_change_row_status check (status in ('SUCCEEDED', 'FAILED')),
    constraint ck_catalog_change_row_result check (
        (status = 'SUCCEEDED' and target_id is not null and target_resource_type is not null and error_code is null) or
        (status = 'FAILED' and target_id is null and target_resource_type is null and error_code is not null)
    )
);
create index idx_catalog_change_row_status on catalog_change_batch_rows (tenant_id, batch_id, status, row_number);
