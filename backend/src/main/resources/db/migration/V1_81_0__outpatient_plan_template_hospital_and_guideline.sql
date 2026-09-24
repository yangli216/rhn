alter table RHN_META_OP_PLAN_TMPL drop constraint CK_META_OP_PLAN_TMPL_OPT_SCOPE;
alter table RHN_META_OP_PLAN_TMPL add constraint CK_META_OP_PLAN_TMPL_OPT_SCOPE check (SD_SCOPE_TYPE in ('PERSONAL', 'DEPARTMENT', 'HOSPITAL'));
alter table RHN_META_OP_PLAN_TMPL add column SD_SOURCE_TYPE varchar(32) default 'MANUAL' not null;
alter table RHN_META_OP_PLAN_TMPL add column JSON_GUIDELINE_REF text;

comment on column RHN_META_OP_PLAN_TMPL.SD_SOURCE_TYPE is '方案来源类型: MANUAL(手工录入), AI_INPUT(AI口述速记), AI_MINED(历史开方聚类), AI_GUIDELINE(指南提取)';
comment on column RHN_META_OP_PLAN_TMPL.JSON_GUIDELINE_REF is '指南与专家共识出处元数据JSON';
