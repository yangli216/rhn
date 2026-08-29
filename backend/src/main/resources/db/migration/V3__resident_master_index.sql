alter table residents drop constraint uk_resident_national_id;
alter table residents alter column national_id drop not null;
alter table residents add column status varchar(24) not null default 'ACTIVE';
alter table residents add column merged_into_id bigint;
alter table residents add column updated_at timestamp with time zone not null default current_timestamp;
alter table residents add column version bigint not null default 0;
alter table residents add constraint fk_resident_merged_into foreign key (merged_into_id) references residents(id);

create index idx_resident_status on residents (tenant_id, status, full_name);

create table resident_identifiers (
    id bigint primary key,
    tenant_id bigint not null,
    resident_id bigint not null,
    identifier_system varchar(100) not null,
    identifier_value varchar(200) not null,
    normalized_value varchar(200) not null,
    use_type varchar(24) not null,
    status varchar(24) not null,
    source_organization_id bigint,
    valid_from date not null,
    valid_to date,
    created_at timestamp with time zone not null,
    constraint fk_resident_identifier_resident foreign key (resident_id) references residents(id),
    constraint uk_resident_identifier unique (tenant_id, identifier_system, normalized_value)
);

create index idx_resident_identifier_owner on resident_identifiers (tenant_id, resident_id, status);

-- Preserve identifiers created by the V1 single-national-id model. The resident BIGINT is safe to
-- reuse as the first identifier BIGINT because identifiers live in a separate table.
insert into resident_identifiers (
    id, tenant_id, resident_id, identifier_system, identifier_value, normalized_value,
    use_type, status, source_organization_id, valid_from, valid_to, created_at
)
select id, tenant_id, id, 'NATIONAL_ID', national_id, upper(replace(national_id, ' ', '')),
       'OFFICIAL', 'ACTIVE', null, cast(created_at as date), null, created_at
from residents
where national_id is not null;

create table resident_source_records (
    id bigint primary key,
    tenant_id bigint not null,
    source_organization_id bigint not null,
    source_system varchar(100) not null,
    source_record_id varchar(200) not null,
    resident_id bigint,
    match_status varchar(24) not null,
    raw_payload_json text not null,
    last_seen_at timestamp with time zone not null,
    linked_by varchar(100),
    linked_at timestamp with time zone,
    link_reason varchar(500),
    version bigint not null default 0,
    constraint fk_source_record_resident foreign key (resident_id) references residents(id),
    constraint uk_resident_source_record unique (tenant_id, source_system, source_record_id)
);

create index idx_source_record_match on resident_source_records (tenant_id, match_status, last_seen_at);

create table resident_match_candidates (
    id bigint primary key,
    tenant_id bigint not null,
    source_record_id bigint not null,
    candidate_resident_id bigint not null,
    match_score decimal(5,4) not null,
    reasons_json text not null,
    decision varchar(24) not null,
    reviewed_by varchar(100),
    reviewed_at timestamp with time zone,
    constraint fk_match_candidate_source foreign key (source_record_id) references resident_source_records(id),
    constraint fk_match_candidate_resident foreign key (candidate_resident_id) references residents(id),
    constraint uk_match_candidate unique (source_record_id, candidate_resident_id)
);

create table resident_merge_history (
    id bigint primary key,
    tenant_id bigint not null,
    surviving_resident_id bigint not null,
    merged_resident_id bigint not null,
    moved_identifier_ids text not null,
    moved_source_record_ids text not null,
    reason varchar(500) not null,
    merged_by varchar(100) not null,
    merged_at timestamp with time zone not null,
    split_at timestamp with time zone,
    constraint fk_merge_survivor foreign key (surviving_resident_id) references residents(id),
    constraint fk_merge_duplicate foreign key (merged_resident_id) references residents(id)
);

create index idx_resident_merge_history on resident_merge_history (tenant_id, surviving_resident_id, merged_at);

create table resident_split_history (
    id bigint primary key,
    tenant_id bigint not null,
    merge_history_id bigint not null,
    restored_resident_id bigint not null,
    restored_identifier_ids text not null,
    reason varchar(500) not null,
    split_by varchar(100) not null,
    split_at timestamp with time zone not null,
    constraint fk_split_merge foreign key (merge_history_id) references resident_merge_history(id),
    constraint fk_split_resident foreign key (restored_resident_id) references residents(id),
    constraint uk_split_merge unique (merge_history_id)
);
