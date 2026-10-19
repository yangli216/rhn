-- Billing relief: cashier-decided manual relief and relief record queries.
-- A cashier decides manual relief at the counter with BILLING_RELIEF.DECIDE; amounts above a policy version's
-- approval threshold need BILLING_RELIEF.APPROVE. BILLING_RELIEF.QUERY reads relief records for reconciliation with
-- the government, charity or other third parties that reimburse the relief.

-- 1. Approval threshold for cashier-decided manual relief.
alter table RHN_BIL_RELIEF_POLICY_VER add (AMT_MANUAL_APRV number(24,6));
alter table RHN_BIL_RELIEF_POLICY_VER add constraint CK_BIL_RELIEF_VER_MANUAL_APRV check (AMT_MANUAL_APRV is null or AMT_MANUAL_APRV > 0);
comment on column RHN_BIL_RELIEF_POLICY_VER.AMT_MANUAL_APRV is '人工核定审批阈值';

-- 2. Permissions. Deciding manual relief belongs to cashiers (granted with billing access to the portal operator role);
--    the relief administrator role also decides and queries.
insert into RHN_SYS_ACC_PERM values (362387869940304, 362387869790209, 362387869896005, 'BILLING_RELIEF.DECIDE', '收费员核定惠民减免', 'DECIDE', 'BILLING_RELIEF', 'ACTIVE');
insert into RHN_SYS_ACC_PERM values (362387869940305, 362387869790209, 362387869896005, 'BILLING_RELIEF.QUERY', '查询惠民减免明细', 'QUERY', 'BILLING_RELIEF', 'ACTIVE');
update RHN_SYS_ACC_PERM set NA_ACC_PERM = '审批超阈值的惠民人工核定' where ID_ACC_PERM = 362387869940303;
insert into RHN_SYS_ROLE_PERM_ASSIGN values (362387869940324, 362387869790209, 362387869940311, 362387869940304, to_timestamp_tz('2026-10-18 00:00:00 +08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), null, 362387869790222, to_timestamp_tz('2026-10-18 00:00:00 +08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'));
insert into RHN_SYS_ROLE_PERM_ASSIGN values (362387869940325, 362387869790209, 362387869940311, 362387869940305, to_timestamp_tz('2026-10-18 00:00:00 +08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), null, 362387869790222, to_timestamp_tz('2026-10-18 00:00:00 +08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'));
insert into RHN_SYS_ROLE_PERM_ASSIGN values (362387869940326, 362387869790209, 362387869796001, 362387869940304, to_timestamp_tz('2026-10-18 00:00:00 +08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'), null, 362387869790222, to_timestamp_tz('2026-10-18 00:00:00 +08:00', 'YYYY-MM-DD HH24:MI:SS TZH:TZM'));
