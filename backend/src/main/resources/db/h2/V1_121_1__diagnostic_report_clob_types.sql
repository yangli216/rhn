-- H2 compatibility for LONG32VARCHAR / CLOB-backed report working content.
alter table RHN_EX_DIAG_DRAFT alter column JSON_CONTENT clob;
alter table RHN_EX_DIAG_REPORT alter column DES_FINDING clob;
alter table RHN_EX_DIAG_REPORT alter column DES_CORRECT clob;
comment on column RHN_EX_DIAG_DRAFT.JSON_CONTENT is '报告工作内容JSON';
comment on column RHN_EX_DIAG_REPORT.DES_FINDING is '检查所见';
comment on column RHN_EX_DIAG_REPORT.DES_CORRECT is '报告更正原因';
