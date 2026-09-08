-- ============================================================================
-- V1_24_0: 挂号结算意图表 RHN_BIL_REG_BIL_INTENT 可空外键字段唯一约束优化
-- 解决在 Oracle 中复合唯一约束包含非空租户ID时，可空列（如号源锁定ID、结算单ID等）
-- 多个 NULL 会被当成重复键导致 ORA-00001 的问题
-- ============================================================================

-- 1. 号源锁定 ID（现场即时挂号/绿色通道无需号源锁定，该字段为 NULL）
alter table RHN_BIL_REG_BIL_INTENT drop constraint UK_BIL_REG_BIL_IN_REG_BILL_HOL;
alter table RHN_BIL_REG_BIL_INTENT add constraint UK_BIL_REG_BIL_IN_REG_BILL_HOL unique (ID_SCHED_SLOT_HOLD);

-- 2. 患者账户 ID（挂号费为 0 时无需记账，该字段为 NULL）
alter table RHN_BIL_REG_BIL_INTENT drop constraint UK_BIL_REG_BIL_IN_REG_BILL_ACC;
alter table RHN_BIL_REG_BIL_INTENT add constraint UK_BIL_REG_BIL_IN_REG_BILL_ACC unique (ID_PAT_ACCT);

-- 3. 结算单 ID（挂号费为 0 时无需生成结算单，该字段为 NULL）
alter table RHN_BIL_REG_BIL_INTENT drop constraint UK_BIL_REG_BIL_IN_REG_BILL_SET;
alter table RHN_BIL_REG_BIL_INTENT add constraint UK_BIL_REG_BIL_IN_REG_BILL_SET unique (ID_STL);

-- 4. 支付单 ID（挂号费为 0 或未支付时，该字段为 NULL）
alter table RHN_BIL_REG_BIL_INTENT drop constraint UK_BIL_REG_BIL_IN_REG_BILL_PAY;
alter table RHN_BIL_REG_BIL_INTENT add constraint UK_BIL_REG_BIL_IN_REG_BILL_PAY unique (ID_PAY_ORDER);
