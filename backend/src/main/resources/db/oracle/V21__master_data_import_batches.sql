create table master_data_import_batches (
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    import_type varchar2(32 char) not null,
    file_name varchar2(300 char) not null,
    file_hash varchar2(64 char) not null,
    request_code varchar2(128 char) not null,
    status varchar2(32 char) not null,
    total_rows number(10) default 0 not null,
    ready_rows number(10) default 0 not null,
    invalid_rows number(10) default 0 not null,
    imported_rows number(10) default 0 not null,
    failed_rows number(10) default 0 not null,
    created_at timestamp with time zone not null,
    created_by number(19) not null,
    updated_at timestamp with time zone not null,
    updated_by number(19) not null,
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
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    batch_id number(19) not null,
    row_number number(10) not null,
    source_key varchar2(128 char),
    source_json clob not null,
    normalized_json clob,
    errors_json clob not null,
    status varchar2(32 char) not null,
    target_id number(19),
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    updated_by number(19) not null,
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
