-- Query-owned identity snapshots avoid coupling diagnostic queue queries to other domain entities.
alter table RHN_EX_DIAG_EXEC_TASK add CD_REQ_NO_SNAP varchar2(64 char);
alter table RHN_EX_DIAG_EXEC_TASK add NA_PAT_SNAP varchar2(200 char);
alter table RHN_EX_DIAG_EXEC_TASK add CD_HR_NO_SNAP varchar2(64 char);
update RHN_EX_DIAG_EXEC_TASK t set CD_REQ_NO_SNAP = (select r.CD_REQ_NO from RHN_EX_CARE_REQ r where r.ID_CARE_REQ = t.ID_CARE_REQ and r.ID_TNT = t.ID_TNT),
 NA_PAT_SNAP = (select p.NA_FULL from RHN_PI_PAT p where p.ID_PAT = t.ID_PAT and p.ID_TNT = t.ID_TNT),
 CD_HR_NO_SNAP = (select p.CD_HEALTH_RECORD_NO from RHN_PI_PAT p where p.ID_PAT = t.ID_PAT and p.ID_TNT = t.ID_TNT);
comment on column RHN_EX_DIAG_EXEC_TASK.CD_REQ_NO_SNAP is '申请号快照；队列查询';
comment on column RHN_EX_DIAG_EXEC_TASK.NA_PAT_SNAP is '申请时患者姓名；队列查询';
comment on column RHN_EX_DIAG_EXEC_TASK.CD_HR_NO_SNAP is '申请时健康档案号；队列查询';
create index IX_EX_DIAG_QUEUE on RHN_EX_DIAG_EXEC_TASK(ID_TNT, ID_ORG, ID_DEPT, SD_REQ_TYPE, DT_CREATED);
