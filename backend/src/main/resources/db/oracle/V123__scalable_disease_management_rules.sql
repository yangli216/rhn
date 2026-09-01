alter table disease_management_members add (inclusion_mode varchar2(16 char) default 'INCLUDE' not null);
alter table disease_management_members add constraint ck_disease_management_member_mode
    check (inclusion_mode in ('INCLUDE', 'EXCLUDE'));

create table disease_management_rules (
    id number(19) primary key,
    program_id number(19) not null,
    inclusion_mode varchar2(16 char) not null,
    diagnosis_domain varchar2(32 char),
    code_system_id number(19),
    concept_type varchar2(32 char),
    chapter_code varchar2(64 char),
    code_from varchar2(100 char),
    code_to varchar2(100 char),
    note varchar2(500 char),
    created_at timestamp with time zone not null,
    constraint fk_disease_management_rule_program foreign key (program_id) references disease_management_programs(id),
    constraint fk_disease_management_rule_system foreign key (code_system_id) references code_systems(id),
    constraint ck_disease_management_rule_mode check (inclusion_mode in ('INCLUDE', 'EXCLUDE')),
    constraint ck_disease_management_rule_domain check (diagnosis_domain is null or diagnosis_domain in ('WESTERN_MEDICINE', 'TCM_DISEASE', 'TCM_SYNDROME')),
    constraint ck_disease_management_rule_filter check (
        diagnosis_domain is not null or code_system_id is not null or concept_type is not null
        or chapter_code is not null or code_from is not null or code_to is not null
    )
);
create index idx_disease_management_rule_program on disease_management_rules (program_id, inclusion_mode);

