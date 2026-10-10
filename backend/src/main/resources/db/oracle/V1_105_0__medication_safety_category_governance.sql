-- Complete safety-category governance without rewriting released migrations.
alter table RHN_AUD_MED_SAFETY_CAT rename column FG_SYSTEMIC_ONLY to FG_SYSIC_ONLY;
alter table RHN_AUD_MED_SAFETY_CAT rename column DES_RATIONALE to DES_RATNL;

comment on table RHN_AUD_MED_SAFETY_CAT is '合理用药安全分类；一行代表一个租户下的一项安全规则分类';
comment on column RHN_AUD_MED_SAFETY_CAT.ID_SAFETY_CAT is '安全分类主键';
comment on column RHN_AUD_MED_SAFETY_CAT.ID_TNT is '租户标识';
comment on column RHN_AUD_MED_SAFETY_CAT.CD_CAT is '安全分类编码';
comment on column RHN_AUD_MED_SAFETY_CAT.NA_CAT is '安全分类中文名称';
comment on column RHN_AUD_MED_SAFETY_CAT.SD_RULE_KIND is '适用的合理用药规则种类';
comment on column RHN_AUD_MED_SAFETY_CAT.DES_RATNL is '分类临床依据';
comment on column RHN_AUD_MED_SAFETY_CAT.FG_SYSTEM is '是否系统预置分类';
comment on column RHN_AUD_MED_SAFETY_CAT.SD_STATUS is '分类状态';
comment on column RHN_AUD_MED_SAFETY_CAT.REVISION is '乐观锁版本号';
comment on column RHN_AUD_MED_SAFETY_CAT.DT_CREATED is '创建时间';
comment on column RHN_AUD_MED_SAFETY_CAT.ID_USER_CREATED is '创建用户标识';
comment on column RHN_AUD_MED_SAFETY_CAT.DT_UPDATED is '更新时间';
comment on column RHN_AUD_MED_SAFETY_CAT.ID_USER_UPDATED is '更新用户标识';
comment on column RHN_AUD_MED_SAFETY_CAT.CD_CAT_MAJOR is '关联药品目录大类编码';
comment on column RHN_AUD_MED_SAFETY_CAT.CD_CAT_SUB is '关联药品目录子类编码';
comment on column RHN_AUD_MED_SAFETY_CAT.FG_SYSIC_ONLY is '是否仅匹配全身给药制剂';

comment on table RHN_AUD_MED_SAFETY_CAT_MBR is '合理用药安全分类成员；一行代表一个租户下某安全分类关联的一条药品成员';
comment on column RHN_AUD_MED_SAFETY_CAT_MBR.ID_MEMBER is '分类成员主键';
comment on column RHN_AUD_MED_SAFETY_CAT_MBR.ID_TNT is '租户标识';
comment on column RHN_AUD_MED_SAFETY_CAT_MBR.ID_SAFETY_CAT is '所属安全分类标识';
comment on column RHN_AUD_MED_SAFETY_CAT_MBR.ID_MED is '关联中心药品标识';
comment on column RHN_AUD_MED_SAFETY_CAT_MBR.CD_MED is '药品编码';
comment on column RHN_AUD_MED_SAFETY_CAT_MBR.NA_MED_SNAP is '加入分类时的药品名称快照';
comment on column RHN_AUD_MED_SAFETY_CAT_MBR.PREP_SPEC_SNAP is '加入分类时的制剂规格快照';
comment on column RHN_AUD_MED_SAFETY_CAT_MBR.DOSE_FORM_SNAP is '加入分类时的剂型代码快照';
comment on column RHN_AUD_MED_SAFETY_CAT_MBR.REVISION is '乐观锁版本号';
comment on column RHN_AUD_MED_SAFETY_CAT_MBR.DT_CREATED is '创建时间';
comment on column RHN_AUD_MED_SAFETY_CAT_MBR.ID_USER_CREATED is '创建用户标识';
