alter table RHN_VIS_ENC_DIAG add SN_SORT integer default 0 not null;

update RHN_VIS_ENC_DIAG
set SN_SORT = case when SD_DIAG_TYPE = 'PRIMARY' then 1 else 1000 end;

comment on column RHN_VIS_ENC_DIAG.SN_SORT is '诊断显示顺序';
