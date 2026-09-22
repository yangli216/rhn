create table RHN_AUD_KNOW_RELEASE (
    ID_TNT bigint not null,
    ID_KNOW_RELEASE bigint not null,
    ID_DEPLOYMENT bigint not null,
    JSON_RELEASE text not null,
    HASH_RELEASE varchar(64) not null,
    constraint PK_KNOW_RELEASE primary key (ID_TNT,ID_KNOW_RELEASE),
    constraint UQ_KNOW_RELEASE_DEPLOY unique (ID_TNT,ID_DEPLOYMENT)
);
comment on table RHN_AUD_KNOW_RELEASE is '知识规则正式发布材料，一行代表一次显式启用或回退形成的固定验收记录';
comment on column RHN_AUD_KNOW_RELEASE.ID_TNT is '租户标识';
comment on column RHN_AUD_KNOW_RELEASE.ID_KNOW_RELEASE is '独立正式发布材料标识';
comment on column RHN_AUD_KNOW_RELEASE.ID_DEPLOYMENT is '本次正式部署标识';
comment on column RHN_AUD_KNOW_RELEASE.JSON_RELEASE is '冻结审批、旁路观察与研判、验收说明、回退方案及启用人';
comment on column RHN_AUD_KNOW_RELEASE.HASH_RELEASE is '不可变正式发布材料原始 JSON 的 SHA256 指纹';
