create table master_data_import_batches (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    import_type varchar(32) not null,
    file_name varchar(300) not null,
    file_hash varchar(64) not null,
    request_code varchar(128) not null,
    status varchar(32) not null,
    total_rows integer default 0 not null,
    ready_rows integer default 0 not null,
    invalid_rows integer default 0 not null,
    imported_rows integer default 0 not null,
    failed_rows integer default 0 not null,
    created_at timestamp with time zone not null,
    created_by bigint not null,
    updated_at timestamp with time zone not null,
    updated_by bigint not null,
    constraint fk_md_import_batch_tenant foreign key (tenant_id) references tenants(id),
    constraint uk_md_import_batch_request unique (tenant_id, request_code),
    constraint uk_md_import_batch_tenant_id unique (tenant_id, id),
    constraint ck_md_import_batch_type check (import_type in ('SERVICE', 'MEDICATION')),
    constraint ck_md_import_batch_status check (status in (
        'PREFLIGHTING', 'READY', 'INVALID', 'IMPORTING', 'PARTIAL', 'COMPLETED', 'CANCELLED'
    )),
    constraint ck_md_import_batch_counts check (
        total_rows >= 0 and ready_rows >= 0 and invalid_rows >= 0 and
        imported_rows >= 0 and failed_rows >= 0
    )
);
create index idx_md_import_batch_list on master_data_import_batches (tenant_id, created_at, status);
create index idx_md_import_batch_hash on master_data_import_batches (tenant_id, import_type, file_hash);

create table master_data_import_rows (
    id bigint primary key,
    revision bigint default 0 not null,
    tenant_id bigint not null,
    batch_id bigint not null,
    row_number integer not null,
    source_key varchar(128),
    source_json text not null,
    normalized_json text,
    errors_json text not null,
    status varchar(32) not null,
    target_id bigint,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    updated_by bigint not null,
    constraint fk_md_import_row_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_md_import_row_batch foreign key (tenant_id, batch_id) references master_data_import_batches(tenant_id, id),
    constraint uk_md_import_row_number unique (batch_id, row_number),
    constraint ck_md_import_row_status check (status in ('READY', 'INVALID', 'IMPORTED', 'FAILED')),
    constraint ck_md_import_row_target check (
        (status = 'IMPORTED' and target_id is not null) or
        (status <> 'IMPORTED' and target_id is null)
    )
);
create index idx_md_import_row_status on master_data_import_rows (tenant_id, batch_id, status, row_number);
create index idx_md_import_row_source_key on master_data_import_rows (tenant_id, source_key);
