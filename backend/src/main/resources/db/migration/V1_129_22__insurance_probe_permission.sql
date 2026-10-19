-- 医保接入向导的接口联通探测会向医保网关发出真实报文，使用独立权限与专用角色，不并入基础数据管理员。
insert into RHN_SYS_MGMT_MOD (ID_MGMT_MOD, ID_TNT, ID_MGMT_MOD_PARENT, CD_MGMT_MOD, NA_MGMT_MOD,
    SD_MOD_TYPE, ROUTE_PATH, CD_COMP, CD_ICON, SN_SORT, SD_STATUS, DT_CREATED, DT_UPDATED, REVISION)
select 362387869899180 + row_number() over (order by master.ID_TNT), master.ID_TNT, master.ID_MGMT_MOD_PARENT,
    'INSURANCE_ONBOARDING', '医保接入向导', 'MODULE', '/settings/insurance-onboarding', 'InsuranceOnboardingWizard',
    'card', 56, 'ACTIVE', current_timestamp, current_timestamp, 0
from RHN_SYS_MGMT_MOD master where master.CD_MGMT_MOD = 'MASTER_DATA';

insert into RHN_SYS_ACC_PERM (ID_ACC_PERM, ID_TNT, ID_MGMT_MOD, CD_ACC_PERM, NA_ACC_PERM, CD_ACTION, CD_RSRC, SD_STATUS)
select 362387869899280 + row_number() over (order by module.ID_TNT), module.ID_TNT, module.ID_MGMT_MOD,
    'INSURANCE_PROBE.EXECUTE', '执行医保接口联通探测', 'EXECUTE', 'INSURANCE_PROBE', 'ACTIVE'
from RHN_SYS_MGMT_MOD module where module.CD_MGMT_MOD = 'INSURANCE_ONBOARDING';

insert into RHN_SYS_ACC_ROLE (ID_ACC_ROLE, ID_TNT, CD_ACC_ROLE, NA_ACC_ROLE, SD_ROLE_TYPE, SD_STATUS, DT_CREATED, DT_UPDATED, REVISION)
select 362387869899380 + row_number() over (order by module.ID_TNT), module.ID_TNT,
    'INSURANCE_PROBE_ADMIN', '医保联通探测员', 'ADMIN', 'ACTIVE', current_timestamp, current_timestamp, 0
from RHN_SYS_MGMT_MOD module where module.CD_MGMT_MOD = 'INSURANCE_ONBOARDING';

insert into RHN_SYS_ROLE_PERM_ASSIGN (ID_ROLE_PERM_ASSIGN, ID_TNT, ID_ACC_ROLE, ID_ACC_PERM, DT_VALID_FROM, DT_CREATED)
select 362387869899480 + row_number() over (order by r.ID_TNT), r.ID_TNT, r.ID_ACC_ROLE,
    p.ID_ACC_PERM, current_timestamp, current_timestamp
from RHN_SYS_ACC_ROLE r join RHN_SYS_ACC_PERM p on p.ID_TNT = r.ID_TNT
where r.CD_ACC_ROLE = 'INSURANCE_PROBE_ADMIN' and p.CD_ACC_PERM = 'INSURANCE_PROBE.EXECUTE';
