-- Preserve historical amounts for audit. Their original presence is not provable.
alter table RHN_INS_CLAIM_RESP modify (AMT_INS_FUND null);
alter table RHN_INS_CLAIM_RESP modify (AMT_PERS_ACCT null);
alter table RHN_INS_CLAIM_RESP modify (AMT_PAT_CASH null);
alter table RHN_INS_CLAIM_RESP modify (AMT_OTHER_FUND null);
alter table RHN_INS_CLAIM_RESP add (SD_AMT_SRC varchar2(32 char) default 'LEGACY_UNVERIFIED' not null);
alter table RHN_INS_CLAIM_RESP add constraint CK_INS_RESP_AMT_SRC check (SD_AMT_SRC in ('REPORTED', 'LEGACY_UNVERIFIED'));
alter table RHN_INS_CLAIM_RESP add constraint CK_INS_RESP_AMT_REQUIRED check (SD_AMT_SRC <> 'REPORTED' or SD_STATUS <> 'SUCCEEDED' or (AMT_INS_FUND is not null and AMT_PERS_ACCT is not null and AMT_PAT_CASH is not null and AMT_OTHER_FUND is not null));
alter table RHN_INS_CLAIM_RESP add constraint CK_INS_RESP_AMT_NONNEG check (SD_AMT_SRC <> 'REPORTED' or ((AMT_INS_FUND is null or AMT_INS_FUND >= 0) and (AMT_PERS_ACCT is null or AMT_PERS_ACCT >= 0) and (AMT_PAT_CASH is null or AMT_PAT_CASH >= 0) and (AMT_OTHER_FUND is null or AMT_OTHER_FUND >= 0)));
comment on column RHN_INS_CLAIM_RESP.SD_AMT_SRC is '金额来源：REPORTED按原回执保留缺失与零；LEGACY_UNVERIFIED历史来源待核实';
comment on column RHN_INS_CLAIM_RESP.AMT_INS_FUND is '医保统筹基金金额；缺失保留空值；历史金额须结合来源标识核实';
comment on column RHN_INS_CLAIM_RESP.AMT_PERS_ACCT is '个人账户金额；缺失保留空值；历史金额须结合来源标识核实';
comment on column RHN_INS_CLAIM_RESP.AMT_PAT_CASH is '患者现金自付金额；缺失保留空值；历史金额须结合来源标识核实';
comment on column RHN_INS_CLAIM_RESP.AMT_OTHER_FUND is '其他基金金额；缺失保留空值；历史金额须结合来源标识核实';
