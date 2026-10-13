-- H2 compatibility for LONG32VARCHAR / CLOB-backed report working content.
alter table RHN_EX_DIAG_DRAFT alter column JSON_CONTENT clob;
alter table RHN_EX_DIAG_REPORT alter column DES_FINDING clob;
alter table RHN_EX_DIAG_REPORT alter column DES_CORRECT clob;
