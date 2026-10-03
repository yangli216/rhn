alter table RHN_META_OP_PLAN_TMPL add (JSON_SEARCH_PROFILE clob);
comment on column RHN_META_OP_PLAN_TMPL.JSON_SEARCH_PROFILE is '当前诊疗方案内容派生的检索摘要、条件、关键词及内容指纹';
