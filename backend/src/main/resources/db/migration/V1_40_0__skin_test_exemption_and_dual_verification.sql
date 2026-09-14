alter table RHN_EX_MED_REQ add column FG_SKIN_TEST_EXEMPT boolean default false not null;
alter table RHN_EX_MED_REQ add column DES_SKIN_TEST_EXEMPT_REASON varchar(500);
alter table RHN_EX_MED_REQ add column ID_EXEMPT_EVIDENCE_EVENT bigint;

alter table RHN_EX_SKIN_TEST_EVT add column ID_USER_VERIFIED bigint;
alter table RHN_EX_SKIN_TEST_EVT add column ID_PRACT_VERIFIED bigint;
alter table RHN_EX_SKIN_TEST_EVT add column NA_PRACT_VERIFIED varchar(160);
alter table RHN_EX_SKIN_TEST_EVT add column DT_VERIFIED timestamp with time zone;

comment on column RHN_EX_MED_REQ.FG_SKIN_TEST_EXEMPT is '是否免皮试';
comment on column RHN_EX_MED_REQ.DES_SKIN_TEST_EXEMPT_REASON is '免皮试原因说明';
comment on column RHN_EX_MED_REQ.ID_EXEMPT_EVIDENCE_EVENT is '引用的免试依据皮试事件标识';

comment on column RHN_EX_SKIN_TEST_EVT.ID_USER_VERIFIED is '复核护士用户标识';
comment on column RHN_EX_SKIN_TEST_EVT.ID_PRACT_VERIFIED is '复核护士医护人员标识';
comment on column RHN_EX_SKIN_TEST_EVT.NA_PRACT_VERIFIED is '复核护士姓名';
comment on column RHN_EX_SKIN_TEST_EVT.DT_VERIFIED is '双人复核时间';
