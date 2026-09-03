insert into code_systems (
    id, scope_type, scope_id, code, name, canonical_uri, version_code, system_type,
    publisher, description, status, effective_from, effective_to, created_at
) values (
    362387869929001, 'PRODUCT', 0, 'RHN.EX.CS.MEDICATION_ROUTE', 'RHN 给药途径',
    'urn:rhn:codesystem:medication-route', '1.0', 'COMMON', 'RHN',
    '药物进入人体的给药途径。给药方式与给药部位另行建模。',
    'ACTIVE', date '2026-01-01', null, current_timestamp
);

insert into concepts (
    id, code_system_id, code, display, definition, concept_type, short_display, search_code,
    status, effective_from, effective_to, created_at
) values
    (362387869929011, 362387869929001, 'ORAL', '口服', '经口服用药物', 'CONCEPT', '口服', 'KF ORAL PO', 'ACTIVE', date '2026-01-01', null, current_timestamp),
    (362387869929012, 362387869929001, 'IV', '静脉给药', '经静脉给药，具体静滴或静推方式后续独立记录', 'CONCEPT', '静脉', 'JM IV', 'ACTIVE', date '2026-01-01', null, current_timestamp),
    (362387869929013, 362387869929001, 'IVGTT', '静脉滴注', '兼容第一阶段既有静脉滴注编码，后续拆分为静脉途径与滴注方式', 'CONCEPT', '静滴', 'JD IVGTT', 'ACTIVE', date '2026-01-01', null, current_timestamp),
    (362387869929014, 362387869929001, 'IM', '肌内注射', '经肌肉组织注射给药', 'CONCEPT', '肌注', 'JZ IM', 'ACTIVE', date '2026-01-01', null, current_timestamp),
    (362387869929015, 362387869929001, 'SC', '皮下注射', '经皮下组织注射给药', 'CONCEPT', '皮下', 'PX SC SQ', 'ACTIVE', date '2026-01-01', null, current_timestamp),
    (362387869929016, 362387869929001, 'ID', '皮内注射', '经皮内注射给药', 'CONCEPT', '皮内', 'PN ID', 'ACTIVE', date '2026-01-01', null, current_timestamp),
    (362387869929017, 362387869929001, 'NEB', '雾化吸入', '通过雾化装置吸入药物', 'CONCEPT', '雾化', 'WH NEB', 'ACTIVE', date '2026-01-01', null, current_timestamp),
    (362387869929018, 362387869929001, 'INHALATION', '吸入', '经呼吸道吸入药物', 'CONCEPT', '吸入', 'XR INHALATION', 'ACTIVE', date '2026-01-01', null, current_timestamp),
    (362387869929019, 362387869929001, 'TOPICAL', '外用', '用于体表局部', 'CONCEPT', '外用', 'WY TOPICAL', 'ACTIVE', date '2026-01-01', null, current_timestamp),
    (362387869929020, 362387869929001, 'OPHTHALMIC', '眼部给药', '用于眼部', 'CONCEPT', '滴眼', 'YB OPHTHALMIC', 'ACTIVE', date '2026-01-01', null, current_timestamp),
    (362387869929021, 362387869929001, 'OTIC', '耳部给药', '用于耳部', 'CONCEPT', '滴耳', 'EB OTIC', 'ACTIVE', date '2026-01-01', null, current_timestamp),
    (362387869929022, 362387869929001, 'NASAL', '鼻腔给药', '经鼻腔给药', 'CONCEPT', '鼻用', 'BQ NASAL', 'ACTIVE', date '2026-01-01', null, current_timestamp),
    (362387869929023, 362387869929001, 'SUBLINGUAL', '舌下给药', '经舌下黏膜给药', 'CONCEPT', '舌下', 'SX SUBLINGUAL', 'ACTIVE', date '2026-01-01', null, current_timestamp),
    (362387869929024, 362387869929001, 'RECTAL', '直肠给药', '经直肠给药', 'CONCEPT', '直肠', 'ZC RECTAL', 'ACTIVE', date '2026-01-01', null, current_timestamp),
    (362387869929025, 362387869929001, 'VAGINAL', '阴道给药', '经阴道给药', 'CONCEPT', '阴道', 'YD VAGINAL', 'ACTIVE', date '2026-01-01', null, current_timestamp),
    (362387869929026, 362387869929001, 'TRANSDERMAL', '经皮给药', '经完整皮肤吸收给药', 'CONCEPT', '经皮', 'JP TRANSDERMAL', 'ACTIVE', date '2026-01-01', null, current_timestamp);

insert into concept_aliases (id, concept_id, alias_type, alias_name, search_code, status) values
    (362387869929101, 362387869929011, 'LOCAL_CODE', 'PO', 'PO', 'ACTIVE'),
    (362387869929102, 362387869929011, 'SYNONYM', '口服给药', 'KFGY', 'ACTIVE'),
    (362387869929103, 362387869929012, 'LOCAL_CODE', 'INTRAVENOUS', 'INTRAVENOUS', 'ACTIVE'),
    (362387869929104, 362387869929012, 'SYNONYM', '静脉', 'JM', 'ACTIVE'),
    (362387869929105, 362387869929013, 'LOCAL_CODE', 'IV_DRIP', 'IVDRIP', 'ACTIVE'),
    (362387869929106, 362387869929013, 'SYNONYM', '静滴', 'JD', 'ACTIVE'),
    (362387869929107, 362387869929013, 'SYNONYM', '输液', 'SY', 'ACTIVE'),
    (362387869929108, 362387869929014, 'LOCAL_CODE', 'INTRAMUSCULAR', 'INTRAMUSCULAR', 'ACTIVE'),
    (362387869929109, 362387869929014, 'SYNONYM', '肌注', 'JZ', 'ACTIVE'),
    (362387869929110, 362387869929015, 'LOCAL_CODE', 'SQ', 'SQ', 'ACTIVE'),
    (362387869929111, 362387869929015, 'LOCAL_CODE', 'SUBCUTANEOUS', 'SUBCUTANEOUS', 'ACTIVE'),
    (362387869929112, 362387869929016, 'LOCAL_CODE', 'INTRADERMAL', 'INTRADERMAL', 'ACTIVE'),
    (362387869929113, 362387869929017, 'LOCAL_CODE', 'NEBULIZATION', 'NEBULIZATION', 'ACTIVE'),
    (362387869929114, 362387869929017, 'SYNONYM', '雾化', 'WH', 'ACTIVE'),
    (362387869929115, 362387869929019, 'LOCAL_CODE', 'EXTERNAL', 'EXTERNAL', 'ACTIVE'),
    (362387869929116, 362387869929020, 'SYNONYM', '滴眼', 'DY', 'ACTIVE'),
    (362387869929117, 362387869929021, 'SYNONYM', '滴耳', 'DE', 'ACTIVE'),
    (362387869929118, 362387869929022, 'SYNONYM', '滴鼻', 'DB', 'ACTIVE'),
    (362387869929119, 362387869929023, 'SYNONYM', '舌下含服', 'SXHF', 'ACTIVE');

insert into value_sets (id, scope_type, scope_id, code, name, version_code, status, effective_from, effective_to, created_at) values
    (362387869929201, 'PRODUCT', 0, 'RHN.EX.VS.MEDICATION.ROUTE', '药品可配置给药途径', '1.0', 'ACTIVE', date '2026-01-01', null, current_timestamp),
    (362387869929202, 'PRODUCT', 0, 'RHN.EX.VS.OUTPATIENT_PRESCRIPTION.ROUTE', '门诊处方给药途径', '1.0', 'ACTIVE', date '2026-01-01', null, current_timestamp),
    (362387869929203, 'PRODUCT', 0, 'RHN.EX.VS.INPATIENT_MEDICATION.ROUTE', '住院药品医嘱给药途径', '1.0', 'ACTIVE', date '2026-01-01', null, current_timestamp);

insert into value_set_members (id, value_set_id, concept_id, sort_order, created_at)
select 362387869930000 + row_number() over (order by id), 362387869929201, id,
       row_number() over (order by id) * 10, current_timestamp
  from concepts where code_system_id = 362387869929001;
insert into value_set_members (id, value_set_id, concept_id, sort_order, created_at)
select 362387869931000 + row_number() over (order by id), 362387869929202, id,
       row_number() over (order by id) * 10, current_timestamp
  from concepts where code_system_id = 362387869929001;
insert into value_set_members (id, value_set_id, concept_id, sort_order, created_at)
select 362387869932000 + row_number() over (order by id), 362387869929203, id,
       row_number() over (order by id) * 10, current_timestamp
  from concepts where code_system_id = 362387869929001;

create table medication_route_profiles (
    concept_id bigint primary key,
    execution_type varchar(32) not null,
    constraint fk_med_route_profile_concept foreign key (concept_id) references concepts(id),
    constraint ck_med_route_execution_type check (execution_type in ('NONE', 'ADMINISTRATION', 'INFUSION'))
);

insert into medication_route_profiles (concept_id, execution_type) values
    (362387869929011, 'NONE'),
    (362387869929012, 'INFUSION'),
    (362387869929013, 'INFUSION'),
    (362387869929014, 'ADMINISTRATION'),
    (362387869929015, 'ADMINISTRATION'),
    (362387869929016, 'ADMINISTRATION'),
    (362387869929017, 'ADMINISTRATION'),
    (362387869929018, 'NONE'),
    (362387869929019, 'NONE'),
    (362387869929020, 'NONE'),
    (362387869929021, 'NONE'),
    (362387869929022, 'NONE'),
    (362387869929023, 'NONE'),
    (362387869929024, 'NONE'),
    (362387869929025, 'NONE'),
    (362387869929026, 'NONE');

alter table medications add column default_route_id bigint;

update medications set default_route = case upper(trim(default_route))
    when 'PO' then 'ORAL' when '口服' then 'ORAL' when '口服给药' then 'ORAL'
    when 'INTRAVENOUS' then 'IV' when '静脉' then 'IV' when '静脉给药' then 'IV'
    when 'IV_DRIP' then 'IVGTT' when '静滴' then 'IVGTT' when '输液' then 'IVGTT' when '静脉滴注' then 'IVGTT'
    when 'INTRAMUSCULAR' then 'IM' when '肌注' then 'IM' when '肌内注射' then 'IM'
    when 'SQ' then 'SC' when 'SUBCUTANEOUS' then 'SC' when '皮下' then 'SC' when '皮下注射' then 'SC'
    when 'INTRADERMAL' then 'ID' when '皮内' then 'ID' when '皮内注射' then 'ID'
    when 'NEBULIZATION' then 'NEB' when '雾化' then 'NEB' when '雾化吸入' then 'NEB'
    when 'EXTERNAL' then 'TOPICAL' when '外用' then 'TOPICAL'
    when '滴眼' then 'OPHTHALMIC' when '滴耳' then 'OTIC' when '滴鼻' then 'NASAL'
    when '舌下含服' then 'SUBLINGUAL' when '直肠给药' then 'RECTAL' when '阴道给药' then 'VAGINAL'
    else upper(trim(default_route)) end
where default_route is not null;

update medications m set default_route_id = (
    select c.id from concepts c where c.code_system_id = 362387869929001 and c.code = m.default_route
) where m.default_route is not null;

alter table medications add constraint fk_medication_default_route foreign key (default_route_id) references concepts(id);

alter table medication_requests add column route_id bigint;
alter table medication_requests add column route_name_snapshot varchar(300);
alter table medication_requests add column route_execution_type_snapshot varchar(32);
alter table medication_requests add column route_resolution_status varchar(16) default 'UNMAPPED' not null;

update medication_requests set route_code = case upper(trim(route_code))
    when 'PO' then 'ORAL' when '口服' then 'ORAL' when '口服给药' then 'ORAL'
    when 'INTRAVENOUS' then 'IV' when '静脉' then 'IV' when '静脉给药' then 'IV'
    when 'IV_DRIP' then 'IVGTT' when '静滴' then 'IVGTT' when '输液' then 'IVGTT' when '静脉滴注' then 'IVGTT'
    when 'INTRAMUSCULAR' then 'IM' when '肌注' then 'IM' when '肌内注射' then 'IM'
    when 'SQ' then 'SC' when 'SUBCUTANEOUS' then 'SC' when '皮下' then 'SC' when '皮下注射' then 'SC'
    when 'INTRADERMAL' then 'ID' when '皮内' then 'ID' when '皮内注射' then 'ID'
    when 'NEBULIZATION' then 'NEB' when '雾化' then 'NEB' when '雾化吸入' then 'NEB'
    when 'EXTERNAL' then 'TOPICAL' when '外用' then 'TOPICAL'
    when '滴眼' then 'OPHTHALMIC' when '滴耳' then 'OTIC' when '滴鼻' then 'NASAL'
    when '舌下含服' then 'SUBLINGUAL' when '直肠给药' then 'RECTAL' when '阴道给药' then 'VAGINAL'
    else upper(trim(route_code)) end
where route_code is not null;

update medication_requests m set route_id = (
    select c.id from concepts c where c.code_system_id = 362387869929001 and c.code = m.route_code
) where m.route_code is not null;
update medication_requests m set route_name_snapshot = (
    select c.display from concepts c where c.id = m.route_id
) where m.route_id is not null;
update medication_requests m set route_execution_type_snapshot = (
    select p.execution_type from medication_route_profiles p where p.concept_id = m.route_id
) where m.route_id is not null;
update medication_requests set route_resolution_status = 'RESOLVED' where route_id is not null;

alter table medication_requests add constraint fk_medication_request_route foreign key (route_id) references concepts(id);
alter table medication_requests add constraint ck_medication_route_resolution check (route_resolution_status in ('RESOLVED', 'UNMAPPED'));
