alter table RHN_AUD_MED_GOV_RUN add ID_ORG number(19);

comment on column RHN_AUD_MED_GOV_RUN.ID_ORG is '评价事实所属机构';

alter table RHN_AUD_MED_GOV_RUN add ID_DEPT number(19);

comment on column RHN_AUD_MED_GOV_RUN.ID_DEPT is '评价事实所属科室';

alter table RHN_AUD_MED_GOV_RUN add ID_DEPLOYMENT number(19);

comment on column RHN_AUD_MED_GOV_RUN.ID_DEPLOYMENT is '冻结发布记录标识';

alter table RHN_AUD_MED_GOV_RUN add SD_OUTCOME varchar2(32 char);

comment on column RHN_AUD_MED_GOV_RUN.SD_OUTCOME is '知识规则结果：命中、未命中、不适用或不可评价';

create index IX_MED_RUN_SCOPE on RHN_AUD_MED_GOV_RUN (ID_TNT,ID_ORG,ID_DEPT,ID_DEPLOYMENT);
