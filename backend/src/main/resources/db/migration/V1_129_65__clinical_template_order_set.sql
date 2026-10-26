-- 临床模板库融合 P1a：门诊模板增加类型（诊疗方案 / 医嘱组套），药品与项目明细增加默认勾选，项目增加默认执行科室。
alter table RHN_META_OP_PLAN_TMPL add column SD_TMPL_KIND varchar(16) default 'PROTOCOL' not null;
update RHN_META_OP_PLAN_TMPL set SD_TMPL_KIND = 'PROTOCOL' where SD_TMPL_KIND is null;
alter table RHN_META_OP_PLAN_TMPL add constraint CK_META_OP_PLAN_T_OPT_KIND check (SD_TMPL_KIND in ('PROTOCOL', 'ORDER_SET'));
create index IDX_META_OP_PLAN_T_OPT_KIND on RHN_META_OP_PLAN_TMPL (ID_TNT, ID_ORG, SD_TMPL_KIND, SD_STATUS);
comment on column RHN_META_OP_PLAN_TMPL.SD_TMPL_KIND is '模板类型：PROTOCOL 诊疗方案、ORDER_SET 医嘱组套；存量均为诊疗方案';

alter table RHN_META_OP_PLAN_MED add column FG_DEFAULT_SELCTD boolean default true not null;
comment on column RHN_META_OP_PLAN_MED.FG_DEFAULT_SELCTD is '带入预览中是否默认勾选；用于组套中的可选药品';

alter table RHN_META_OP_PLAN_SVC add column FG_DEFAULT_SELCTD boolean default true not null;
alter table RHN_META_OP_PLAN_SVC add column ID_DEPT_EXEC bigint;
comment on column RHN_META_OP_PLAN_SVC.FG_DEFAULT_SELCTD is '带入预览中是否默认勾选；用于组套中的可选项目';
comment on column RHN_META_OP_PLAN_SVC.ID_DEPT_EXEC is '默认执行科室；为空时沿用项目默认执行科室规则';
