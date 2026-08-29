alter table code_systems add authority_type varchar2(32 char) default 'INTERNAL' not null;
alter table code_systems add source_uri varchar2(1000 char);
alter table code_systems add content_hash varchar2(128 char);
update code_systems set authority_type = 'NATIONAL' where upper(code) like '%ICD%';
alter table code_systems add constraint ck_code_system_authority check (authority_type in (
    'NATIONAL', 'INSURANCE', 'REGULATORY', 'LOCAL', 'INTERNAL', 'OTHER'
));

create table item_term_mappings (
    id number(19) primary key,
    revision number(19) default 0 not null,
    tenant_id number(19) not null,
    attribute_subject_id number(19) not null,
    concept_id number(19) not null,
    mapping_type varchar2(32 char) not null,
    equivalence varchar2(24 char) not null,
    primary_mapping number(1) default 0 not null,
    limitation varchar2(2000 char),
    valid_from date not null,
    valid_to date,
    status varchar2(24 char) not null,
    replaces_mapping_id number(19),
    created_at timestamp with time zone not null,
    created_by number(19) not null,
    updated_at timestamp with time zone not null,
    updated_by number(19) not null,
    constraint fk_item_term_map_tenant foreign key (tenant_id) references tenants(id),
    constraint fk_item_term_map_subject foreign key (tenant_id, attribute_subject_id)
        references item_attribute_subjects(tenant_id, id),
    constraint fk_item_term_map_concept foreign key (concept_id) references concepts(id),
    constraint fk_item_term_map_replaces foreign key (replaces_mapping_id) references item_term_mappings(id),
    constraint uk_item_term_map_tenant_id unique (tenant_id, id),
    constraint uk_item_term_map_period unique (
        tenant_id, attribute_subject_id, concept_id, mapping_type, valid_from
    ),
    constraint ck_item_term_map_type check (mapping_type in (
        'CLINICAL', 'INSURANCE', 'REGULATORY', 'LOCAL'
    )),
    constraint ck_item_term_map_equivalence check (equivalence in (
        'EXACT', 'EQUIVALENT', 'WIDER', 'NARROWER', 'RELATED'
    )),
    constraint ck_item_term_map_status check (status in (
        'ACTIVE', 'SUSPENDED', 'RETIRED', 'SUPERSEDED'
    )),
    constraint ck_item_term_map_period check (valid_to is null or valid_to >= valid_from),
    constraint ck_item_term_map_replace_self check (replaces_mapping_id is null or replaces_mapping_id <> id)
);
create index idx_item_term_map_subject on item_term_mappings
    (tenant_id, attribute_subject_id, status, mapping_type, valid_from);
create index idx_item_term_map_concept on item_term_mappings
    (tenant_id, concept_id, status, valid_from);
create index idx_item_term_map_resolution on item_term_mappings
    (tenant_id, attribute_subject_id, mapping_type, primary_mapping, status, valid_from, valid_to);
