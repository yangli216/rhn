-- 修复基线对标本表加的普通唯一约束：
-- unique (ID_TNT, ID_SPEC_PRIOR) 中 ID_SPEC_PRIOR 为空（首次采集的标本）时，
-- Oracle 会把 (租户, 空) 视为重复键，导致同租户第二个首次采集标本写入即报 ORA-00001（UK_EX_SPEC_PRIOR）。
-- 该约束只为保证同一被拒收标本至多重采一次，改为只约束重采来源非空的行（与 V1_129_43 做法一致）。
alter table RHN_EX_DIAG_SPEC drop constraint UK_EX_SPEC_PRIOR;
create unique index IDX_EX_DIAG_SPEC_UK_PRIOR on RHN_EX_DIAG_SPEC (
    CASE when ID_SPEC_PRIOR is not null then ID_TNT end,
    CASE when ID_SPEC_PRIOR is not null then ID_SPEC_PRIOR end);
