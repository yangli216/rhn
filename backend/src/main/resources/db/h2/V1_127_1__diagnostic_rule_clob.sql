alter table RHN_BD_DIAG_TPL alter column CONTENT_JSON clob;
alter table RHN_VIS_OBS alter column RULE_SNAP clob;
alter table RHN_EX_DIAG_REPORT alter column TPL_SNAP clob;
comment on column RHN_BD_DIAG_TPL.CONTENT_JSON is '不可变模板指标规则词条内容';
comment on column RHN_VIS_OBS.RULE_SNAP is '签发结果规则及患者匹配条件快照';
comment on column RHN_EX_DIAG_REPORT.TPL_SNAP is '签发时模板及机构规则不可变快照';
