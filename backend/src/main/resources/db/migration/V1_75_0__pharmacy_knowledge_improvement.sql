alter table RHN_AUD_KNOW_INTAKE add ID_PHARM_REVIEW bigint;
comment on column RHN_AUD_KNOW_INTAKE.ID_PHARM_REVIEW is '知识改进引用的已保存药师审方结论';
alter table RHN_AUD_KNOW_INTAKE drop constraint CK_INTAKE_FEEDBACK_SCOPE;
alter table RHN_AUD_KNOW_INTAKE add constraint CK_INTAKE_FEEDBACK_SCOPE check (
    (ID_FEEDBACK is null and ID_PHARM_REVIEW is null and ID_ORG is null and ID_DEPT is null and HASH_ORIGIN is null)
    or ((ID_FEEDBACK is not null and ID_PHARM_REVIEW is null or ID_FEEDBACK is null and ID_PHARM_REVIEW is not null)
        and ID_ORG is not null and ID_DEPT is not null and HASH_ORIGIN is not null));
create index IX_INTAKE_PHARM_SCOPE on RHN_AUD_KNOW_INTAKE(ID_TNT,ID_ORG,ID_DEPT,ID_PHARM_REVIEW);
alter table RHN_AUD_KNOW_INTAKE add constraint FK_INTAKE_PHARM_REVIEW foreign key (ID_TNT,ID_PHARM_REVIEW) references RHN_SUP_PHARM_REVIEW(ID_TNT,ID_PHARM_REVIEW);
comment on column RHN_AUD_KNOW_INTAKE.JSON_ORIGIN is '业务反馈意见、相关规则提示及来源知识身份，不包含完整处方或患者资料';
