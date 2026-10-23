-- 结算单持久化结算方式：医保结算与自费结算不再靠医保基金金额是否非零推断（基金支付 0 元的医保结算仍是医保结算）。
alter table RHN_BIL_STL add (SD_STL_MODE varchar2(32 char) default 'SELF_PAY' not null);
alter table RHN_BIL_STL add constraint CK_BIL_STL_SETTLEMENT_MODE check (SD_STL_MODE in ('SELF_PAY', 'MEDICAL_INSURANCE'));
comment on column RHN_BIL_STL.SD_STL_MODE is '结算方式，自费结算或医保结算；医保申请结算成功时置为医保结算，与基金金额是否为零无关';

-- 历史回填：存在医保结算成功（SETTLED）或已冲正（REVERSED）医保申请的结算单标记为医保结算，与基金金额是否为零无关。
update RHN_BIL_STL r set SD_STL_MODE = 'MEDICAL_INSURANCE'
where r.SD_STL_TYPE <> 'REVERSAL'
  and exists (select 1 from RHN_INS_CLAIM c where c.ID_TNT = r.ID_TNT and c.ID_STL = r.ID_STL
              and c.SD_STATUS in ('SETTLED', 'REVERSED'));

-- 冲正结算继承原结算：优先按冲正标识，其次沿冲销的收费事项找到原结算（直接退费开具的贷项结算未登记冲正标识）。
update RHN_BIL_STL r set SD_STL_MODE = 'MEDICAL_INSURANCE'
where r.SD_STL_TYPE = 'REVERSAL'
  and (exists (select 1 from RHN_BIL_STL o where o.ID_TNT = r.ID_TNT and o.ID_STL = r.ID_STL_RVRS
               and o.SD_STL_MODE = 'MEDICAL_INSURANCE')
    or exists (select 1 from RHN_BIL_STL_LINE rl
               join RHN_BIL_CHARGE_ITEM rc on rc.ID_TNT = rl.ID_TNT and rc.ID_CHARGE_ITEM = rl.ID_CHARGE_ITEM
               join RHN_BIL_STL_LINE ol on ol.ID_TNT = rc.ID_TNT and ol.ID_CHARGE_ITEM = rc.ID_CHARGE_ITEM_RVRS
               join RHN_BIL_STL o on o.ID_TNT = ol.ID_TNT and o.ID_STL = ol.ID_STL
               where rl.ID_TNT = r.ID_TNT and rl.ID_STL = r.ID_STL
                 and o.SD_STL_TYPE <> 'REVERSAL' and o.SD_STL_MODE = 'MEDICAL_INSURANCE'));

