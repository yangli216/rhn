-- 修复 V1_129_15 在 Oracle 上对结算资金来源表加的普通唯一约束：
-- unique (ID_TNT, ID_RELIEF_APPLY) 中 ID_RELIEF_APPLY 为空（现金、医保等非减免资金来源）时，
-- Oracle 会把 (租户, 空) 视为重复键，导致同租户第二笔资金来源写入即报 ORA-00001（UK_BIL_STL_TENDER_RELIEF）。
-- 与 IDX_BIL_STL_TENDER_UK_STL_TEND 一致，改为只约束减免来源非空的行。
alter table RHN_BIL_STL_TENDER drop constraint UK_BIL_STL_TENDER_RELIEF;
create unique index IDX_BIL_STL_TENDER_UK_RELIEF on RHN_BIL_STL_TENDER (
    CASE when ID_RELIEF_APPLY is not null then ID_TNT end,
    CASE when ID_RELIEF_APPLY is not null then ID_RELIEF_APPLY end);
