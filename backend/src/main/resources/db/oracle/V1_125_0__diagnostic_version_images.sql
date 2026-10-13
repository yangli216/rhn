create table RHN_EX_DIAG_IMAGE (
    ID_DIAG_IMAGE number(19),
    ID_TNT number(19) not null,
    ID_DIAG_EXEC_TASK number(19) not null,
    CD_CMD varchar2(64) not null,
    HASH_CONTENT varchar2(64) not null,
    SD_MEDIA_TYPE varchar2(32) not null,
    NUM_BYTES number(19) not null,
    NUM_WIDTH number(10) not null,
    NUM_HEIGHT number(10) not null,
    DES_CAPTION varchar2(500),
    FG_DRAFT number(1) not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED number(19) not null,
    CONTENT_BASE64 clob not null,
    constraint PK_EX_DIAG_IMAGE primary key (ID_DIAG_IMAGE),
    constraint UK_EX_DIAG_IMAGE_CMD unique (ID_TNT, ID_DIAG_EXEC_TASK, CD_CMD),
    constraint FK_EX_IMAGE_TASK foreign key (ID_DIAG_EXEC_TASK) references RHN_EX_DIAG_EXEC_TASK(ID_DIAG_EXEC_TASK),
    constraint CK_EX_IMAGE_SIZE check (NUM_BYTES > 0 and NUM_BYTES <= 10485760),
    constraint CK_EX_IMAGE_PIXELS check (NUM_WIDTH > 0 and NUM_HEIGHT > 0 and NUM_WIDTH * NUM_HEIGHT <= 20000000)
);
comment on table RHN_EX_DIAG_IMAGE is '医技关键图像；原图不可变，正式版本关联不可删除';
comment on column RHN_EX_DIAG_IMAGE.ID_DIAG_IMAGE is '关键图像主键';
comment on column RHN_EX_DIAG_IMAGE.ID_TNT is '租户标识';
comment on column RHN_EX_DIAG_IMAGE.ID_DIAG_EXEC_TASK is '医技执行任务';
comment on column RHN_EX_DIAG_IMAGE.CD_CMD is '上传命令幂等键';
comment on column RHN_EX_DIAG_IMAGE.HASH_CONTENT is '原始图像SHA256摘要';
comment on column RHN_EX_DIAG_IMAGE.SD_MEDIA_TYPE is '由真实内容识别的媒体类型';
comment on column RHN_EX_DIAG_IMAGE.NUM_BYTES is '原始内容字节数';
comment on column RHN_EX_DIAG_IMAGE.NUM_WIDTH is '图像像素宽度';
comment on column RHN_EX_DIAG_IMAGE.NUM_HEIGHT is '图像像素高度';
comment on column RHN_EX_DIAG_IMAGE.DES_CAPTION is '图像说明快照';
comment on column RHN_EX_DIAG_IMAGE.FG_DRAFT is '是否关联当前工作内容';
comment on column RHN_EX_DIAG_IMAGE.DT_CREATED is '上传时间';
comment on column RHN_EX_DIAG_IMAGE.ID_USER_CREATED is '上传主体';
comment on column RHN_EX_DIAG_IMAGE.CONTENT_BASE64 is '数据库保存的原始图像内容';
create index IX_EX_IMAGE_DRAFT on RHN_EX_DIAG_IMAGE(ID_TNT, ID_DIAG_EXEC_TASK, FG_DRAFT);
create table RHN_EX_REPORT_IMAGE (
    ID_REPORT_IMAGE number(19),
    ID_TNT number(19) not null,
    ID_DIAG_REPORT number(19) not null,
    ID_DIAG_IMAGE number(19) not null,
    SN_SORT number(10) not null,
    constraint PK_EX_REPORT_IMAGE primary key (ID_REPORT_IMAGE),
    constraint UK_EX_REPORT_IMAGE unique (ID_TNT, ID_DIAG_REPORT, ID_DIAG_IMAGE),
    constraint UK_EX_REPORT_IMAGE_SORT unique (ID_TNT, ID_DIAG_REPORT, SN_SORT),
    constraint FK_EX_IMAGE_REPORT foreign key (ID_DIAG_REPORT) references RHN_EX_DIAG_REPORT(ID_DIAG_REPORT),
    constraint FK_EX_REPORT_IMAGE foreign key (ID_DIAG_IMAGE) references RHN_EX_DIAG_IMAGE(ID_DIAG_IMAGE)
);
comment on table RHN_EX_REPORT_IMAGE is '医技报告版本关键图像；一行是一个冻结的版本图像关联';
comment on column RHN_EX_REPORT_IMAGE.ID_REPORT_IMAGE is '报告图像关联主键';
comment on column RHN_EX_REPORT_IMAGE.ID_TNT is '租户标识';
comment on column RHN_EX_REPORT_IMAGE.ID_DIAG_REPORT is '不可变报告版本';
comment on column RHN_EX_REPORT_IMAGE.ID_DIAG_IMAGE is '不可变图像内容';
comment on column RHN_EX_REPORT_IMAGE.SN_SORT is '报告内显示顺序';
alter table RHN_EX_DIAG_REPORT add FG_DOUBLE_SIGN number(1);
comment on column RHN_EX_DIAG_REPORT.FG_DOUBLE_SIGN is '签发时机构是否要求双签；未知历史为空';
