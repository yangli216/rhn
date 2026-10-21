-- 修复医保申请“统筹区 + 外部结算流水号”唯一索引在 Oracle 上的空值问题：
-- (ID_TNT, CD_REGION, CD_EXT_STL_NO) 在尚未取得外部结算流水号（为空）时，Oracle 会把 (租户, 统筹区, 空) 视为重复键，
-- 导致同租户同统筹区第二笔医保申请创建即报 ORA-00001（IDX_INS_CLAIM_UK_INS_CLAIM_EXT）。
-- 改为只约束已取得外部结算流水号的行。
drop index IDX_INS_CLAIM_UK_INS_CLAIM_EXT;
create unique index IDX_INS_CLAIM_UK_INS_CLAIM_EXT on RHN_INS_CLAIM (
    CASE when CD_EXT_STL_NO is not null then ID_TNT end,
    CASE when CD_EXT_STL_NO is not null then CD_REGION end,
    CASE when CD_EXT_STL_NO is not null then CD_EXT_STL_NO end);
