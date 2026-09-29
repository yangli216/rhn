create table RHN_BD_SPEC_DISP (
    ID_SPEC_DISP number(19) not null,
    ID_TNT number(19) not null,
    HASH_IDTY varchar2(64 char) not null,
    ID_STD_SPEC varchar2(120 char) not null,
    REVISION number(10) not null,
    JSON_EVENT clob not null,
    constraint PK_BD_SPEC_DISP primary key (ID_SPEC_DISP),
    constraint UK_BD_SPEC_DISP_REV unique (ID_TNT, HASH_IDTY, ID_STD_SPEC, REVISION)
);

comment on table RHN_BD_SPEC_DISP is '标准目录不完整规格的机构处置事件，一行代表一次待补充或不采用决定';
comment on column RHN_BD_SPEC_DISP.ID_SPEC_DISP is '规格处置事件标识';
comment on column RHN_BD_SPEC_DISP.ID_TNT is '租户标识';
comment on column RHN_BD_SPEC_DISP.HASH_IDTY is '目录标识版本及内容和来源文件指纹组合哈希';
comment on column RHN_BD_SPEC_DISP.ID_STD_SPEC is '标准规格编码';
comment on column RHN_BD_SPEC_DISP.REVISION is '规格处置递增序号，用于并发控制';
comment on column RHN_BD_SPEC_DISP.JSON_EVENT is '不可变处置结果，含状态、说明、操作人和时间';
