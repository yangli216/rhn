-- 检查申请所选部位：开立时按检查项目已启用的部位方式快照保存，一条服务请求可有多个部位。
-- 按部位计价的主项目数量由部位数换算；部位名称、标准概念与互认编码为开立时快照，基础数据后续修改不影响已开申请。

create table RHN_EX_SVC_REQ_SITE (
    ID_SVC_REQ_SITE number(19),
    ID_TNT number(19) not null,
    ID_CARE_REQ number(19) not null,
    SN_LINE number(10) not null,
    ID_SVC_VAR number(19) not null,
    CD_BODY_SITE varchar2(128 char) not null,
    NA_BODY_SITE varchar2(300 char) not null,
    ID_CONCEPT_BODY_SITE number(19),
    SD_METHOD_TYPE varchar2(64 char),
    CD_MUTUAL_RECOG varchar2(128 char),
    DT_CREATED timestamp with time zone not null,
    constraint PK_EX_SVC_REQ_SITE_PK primary key (ID_SVC_REQ_SITE),
    constraint UK_EX_SVC_REQ_SITE_LINE unique (ID_TNT, ID_CARE_REQ, SN_LINE),
    constraint UK_EX_SVC_REQ_SITE_CODE unique (ID_TNT, ID_CARE_REQ, CD_BODY_SITE),
    constraint FK_EX_SVC_REQ_SITE_REQ foreign key (ID_TNT, ID_CARE_REQ) references RHN_EX_SVC_REQ(ID_TNT, ID_CARE_REQ),
    constraint CK_EX_SVC_REQ_SITE_LINE check (SN_LINE > 0)
);
comment on table RHN_EX_SVC_REQ_SITE is '检查申请部位；一行代表一条服务请求开立时选择的一个检查部位快照';
comment on column RHN_EX_SVC_REQ_SITE.ID_SVC_REQ_SITE is '申请部位主键';
comment on column RHN_EX_SVC_REQ_SITE.ID_TNT is '租户标识';
comment on column RHN_EX_SVC_REQ_SITE.ID_CARE_REQ is '服务请求标识';
comment on column RHN_EX_SVC_REQ_SITE.SN_LINE is '部位顺序号，从 1 开始';
comment on column RHN_EX_SVC_REQ_SITE.ID_SVC_VAR is '开立时选择的检查部位方式标识';
comment on column RHN_EX_SVC_REQ_SITE.CD_BODY_SITE is '部位编码快照，取检查部位方式编码';
comment on column RHN_EX_SVC_REQ_SITE.NA_BODY_SITE is '部位名称快照';
comment on column RHN_EX_SVC_REQ_SITE.ID_CONCEPT_BODY_SITE is '标准部位概念标识快照，未映射时为空';
comment on column RHN_EX_SVC_REQ_SITE.SD_METHOD_TYPE is '检查方式快照';
comment on column RHN_EX_SVC_REQ_SITE.CD_MUTUAL_RECOG is '检查结果互认编码快照';
comment on column RHN_EX_SVC_REQ_SITE.DT_CREATED is '创建时间';
