-- 临床模板库融合 P1a：门诊模板增加类型（诊疗方案 / 医嘱组套），药品与项目明细增加默认勾选，项目增加默认执行科室。
alter table RHN_META_OP_PLAN_TMPL add (SD_TMPL_KIND varchar2(16 char) default 'PROTOCOL' not null);
alter table RHN_META_OP_PLAN_TMPL add constraint CK_META_OP_PLAN_T_OPT_KIND check (SD_TMPL_KIND in ('PROTOCOL', 'ORDER_SET'));
create index IDX_META_OP_PLAN_T_OPT_KIND on RHN_META_OP_PLAN_TMPL (ID_TNT, ID_ORG, SD_TMPL_KIND, SD_STATUS);
comment on column RHN_META_OP_PLAN_TMPL.SD_TMPL_KIND is '模板类型：PROTOCOL 诊疗方案、ORDER_SET 医嘱组套；存量均为诊疗方案';

alter table RHN_META_OP_PLAN_MED add (FG_DEFAULT_SELCTD number(1,0) default 1 not null);
alter table RHN_META_OP_PLAN_MED add constraint CK_META_OP_PLAN_M_OPM_DEF_SEL check (FG_DEFAULT_SELCTD in (0,1));
comment on column RHN_META_OP_PLAN_MED.FG_DEFAULT_SELCTD is '带入预览中是否默认勾选；用于组套中的可选药品';

alter table RHN_META_OP_PLAN_SVC add (FG_DEFAULT_SELCTD number(1,0) default 1 not null, ID_DEPT_EXEC number(19,0));
alter table RHN_META_OP_PLAN_SVC add constraint CK_META_OP_PLAN_S_OPS_DEF_SEL check (FG_DEFAULT_SELCTD in (0,1));
comment on column RHN_META_OP_PLAN_SVC.FG_DEFAULT_SELCTD is '带入预览中是否默认勾选；用于组套中的可选项目';
comment on column RHN_META_OP_PLAN_SVC.ID_DEPT_EXEC is '默认执行科室；为空时沿用项目默认执行科室规则';
