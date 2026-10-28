-- 医保调试控制台二期：交易记录关联医保申请，并新增手动冲正权限。
alter table RHN_INS_EXCH_LOG add ID_INS_CLAIM bigint;
create index IX_INS_EXCH_LOG_CLAIM on RHN_INS_EXCH_LOG (ID_TNT, ID_INS_CLAIM);
comment on column RHN_INS_EXCH_LOG.ID_INS_CLAIM is '关联的医保申请标识；不在申请操作内发起的往返为空';

insert into RHN_SYS_ACC_PERM (ID_ACC_PERM, ID_TNT, ID_MGMT_MOD, CD_ACC_PERM, NA_ACC_PERM, CD_ACTION, CD_RSRC, SD_STATUS)
select (select coalesce(max(ID_ACC_PERM), 0) from RHN_SYS_ACC_PERM) + row_number() over (order by module.ID_TNT),
       module.ID_TNT, module.ID_MGMT_MOD, 'INSURANCE_DEBUG.REVERSE', '查询医保结果并手动冲正异常交易', 'REVERSE', 'INSURANCE_DEBUG', 'ACTIVE'
from RHN_SYS_MGMT_MOD module where module.CD_MGMT_MOD = 'INSURANCE_ONBOARDING';

insert into RHN_SYS_ROLE_PERM_ASSIGN (ID_ROLE_PERM_ASSIGN, ID_TNT, ID_ACC_ROLE, ID_ACC_PERM, DT_VALID_FROM, DT_CREATED)
select (select coalesce(max(ID_ROLE_PERM_ASSIGN), 0) from RHN_SYS_ROLE_PERM_ASSIGN) + row_number() over (order by r.ID_TNT),
       r.ID_TNT, r.ID_ACC_ROLE, p.ID_ACC_PERM, current_timestamp, current_timestamp
from RHN_SYS_ACC_ROLE r join RHN_SYS_ACC_PERM p on p.ID_TNT = r.ID_TNT
where r.CD_ACC_ROLE = 'INSURANCE_DEBUG_ADMIN' and p.CD_ACC_PERM = 'INSURANCE_DEBUG.REVERSE';
