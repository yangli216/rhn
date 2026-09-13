create table RHN_META_PRINT_DOC_DEF (
    ID_PRINT_DOC_DEF number(19,0) primary key,
    ID_TNT number(19,0),
    CD_DOC_TYPE varchar2(80 char) not null,
    NA_DOC varchar2(200 char) not null,
    SD_DOC_CAT varchar2(32 char) not null,
    SD_LAYOUT_MODE varchar2(16 char) not null,
    JSON_DATA_SCHEMA varchar2(80 char) not null,
    SD_SOURCE_TYPE varchar2(80 char) not null,
    SD_STATUS varchar2(24 char) not null,
    REVISION number(19,0) default 0 not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED number(19,0),
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED number(19,0),
    constraint UK_META_PRINT_DOC_DEF unique (ID_TNT, CD_DOC_TYPE),
    constraint CK_META_PRINT_DOC_CAT check (SD_DOC_CAT in ('CLINICAL_DOCUMENT','PRESCRIPTION','APPLICATION','CARD','LABEL','LIST')),
    constraint CK_META_PRINT_DOC_LAYOUT check (SD_LAYOUT_MODE in ('FLOW','CANVAS')),
    constraint CK_META_PRINT_DOC_STATUS check (SD_STATUS in ('ACTIVE','INACTIVE'))
);

create table RHN_META_PRINT_MEDIA (
    ID_PRINT_MEDIA number(19,0) primary key,
    ID_TNT number(19,0),
    CD_MEDIA varchar2(80 char) not null,
    NA_MEDIA varchar2(200 char) not null,
    SD_MEDIA_KIND varchar2(24 char) not null,
    WIDTH_MM number(8,2) not null,
    HEIGHT_MM number(8,2),
    SD_ORIENTATION varchar2(16 char) not null,
    MARGIN_TOP_MM number(8,2) default 0 not null,
    MARGIN_RIGHT_MM number(8,2) default 0 not null,
    MARGIN_BOTTOM_MM number(8,2) default 0 not null,
    MARGIN_LEFT_MM number(8,2) default 0 not null,
    GAP_HORIZONTAL_MM number(8,2) default 0 not null,
    GAP_VERTICAL_MM number(8,2) default 0 not null,
    QTY_COLUMNS number(10) default 1 not null,
    QTY_ROWS number(10) default 1 not null,
    QTY_DPI number(10) default 300 not null,
    SD_SENSOR_MODE varchar2(16 char) default 'NONE' not null,
    SD_STATUS varchar2(24 char) not null,
    REVISION number(19,0) default 0 not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED number(19,0),
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED number(19,0),
    constraint UK_META_PRINT_MEDIA unique (ID_TNT, CD_MEDIA),
    constraint CK_META_PRINT_MEDIA_KIND check (SD_MEDIA_KIND in ('SHEET','CONTINUOUS','LABEL')),
    constraint CK_META_PRINT_MEDIA_ORIENT check (SD_ORIENTATION in ('PORTRAIT','LANDSCAPE')),
    constraint CK_META_PRINT_MEDIA_SENSOR check (SD_SENSOR_MODE in ('NONE','GAP','BLACK_MARK')),
    constraint CK_META_PRINT_MEDIA_STATUS check (SD_STATUS in ('ACTIVE','INACTIVE')),
    constraint CK_META_PRINT_MEDIA_SIZE check (WIDTH_MM between 20 and 500 and (HEIGHT_MM is null or HEIGHT_MM between 20 and 500)),
    constraint CK_META_PRINT_MEDIA_GRID check (QTY_COLUMNS between 1 and 20 and QTY_ROWS between 1 and 50 and QTY_DPI between 72 and 1200)
);

create table RHN_META_PRINT_DRAFT (
    ID_PRINT_DRAFT number(19,0) primary key,
    ID_TNT number(19,0) not null,
    ID_PRINT_TMPL number(19,0),
    ID_PRINT_DOC_DEF number(19,0) not null,
    ID_PRINT_MEDIA number(19,0) not null,
    ID_PRINT_TMPL_VER_PUBLISD number(19,0),
    CD_TMPL varchar2(100 char) not null,
    NA_TMPL varchar2(200 char) not null,
    JSON_LAYOUT_SCHEMA varchar2(80 char) not null,
    JSON_CONFIG clob not null,
    SD_STATUS varchar2(24 char) not null,
    REVISION number(19,0) default 0 not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED number(19,0) not null,
    DT_UPDATED timestamp with time zone not null,
    ID_USER_UPDATED number(19,0) not null,
    constraint FK_META_PRINT_DRAFT_TMPL foreign key (ID_PRINT_TMPL) references RHN_META_PRINT_TMPL(ID_PRINT_TMPL),
    constraint FK_META_PRINT_DRAFT_DOC foreign key (ID_PRINT_DOC_DEF) references RHN_META_PRINT_DOC_DEF(ID_PRINT_DOC_DEF),
    constraint FK_META_PRINT_DRAFT_MEDIA foreign key (ID_PRINT_MEDIA) references RHN_META_PRINT_MEDIA(ID_PRINT_MEDIA),
    constraint FK_META_PRINT_DRAFT_VER foreign key (ID_PRINT_TMPL_VER_PUBLISD) references RHN_META_PRINT_TMPL_VER(ID_PRINT_TMPL_VER),
    constraint CK_META_PRINT_DRAFT_STATUS check (SD_STATUS in ('DRAFT','IN_REVIEW','PUBLISHED','REJECTED'))
);

alter table RHN_META_PRINT_TMPL_VER add ID_PRINT_DOC_DEF number(19,0);
alter table RHN_META_PRINT_TMPL_VER add ID_PRINT_MEDIA number(19,0);
alter table RHN_META_PRINT_TMPL_VER add constraint FK_META_PRINT_VER_DOC foreign key (ID_PRINT_DOC_DEF) references RHN_META_PRINT_DOC_DEF(ID_PRINT_DOC_DEF);
alter table RHN_META_PRINT_TMPL_VER add constraint FK_META_PRINT_VER_MEDIA foreign key (ID_PRINT_MEDIA) references RHN_META_PRINT_MEDIA(ID_PRINT_MEDIA);

create index IDX_META_PRINT_DOC_RESOLVE on RHN_META_PRINT_DOC_DEF (ID_TNT, CD_DOC_TYPE, SD_STATUS);
create index IDX_META_PRINT_MEDIA_RESOLVE on RHN_META_PRINT_MEDIA (ID_TNT, CD_MEDIA, SD_STATUS);
create index IDX_META_PRINT_DRAFT_LIST on RHN_META_PRINT_DRAFT (ID_TNT, SD_STATUS, DT_UPDATED);
create index IDX_META_PRINT_DRAFT_CODE on RHN_META_PRINT_DRAFT (ID_TNT, CD_TMPL, SD_STATUS);

comment on table RHN_META_PRINT_DOC_DEF is '打印单据定义；一行代表一个可打印的业务单据类型';
comment on column RHN_META_PRINT_DOC_DEF.ID_PRINT_DOC_DEF is '打印单据定义主键';
comment on column RHN_META_PRINT_DOC_DEF.ID_TNT is '租户标识，为空表示平台定义';
comment on column RHN_META_PRINT_DOC_DEF.CD_DOC_TYPE is '单据类型编码';
comment on column RHN_META_PRINT_DOC_DEF.NA_DOC is '单据名称';
comment on column RHN_META_PRINT_DOC_DEF.SD_DOC_CAT is '单据分类';
comment on column RHN_META_PRINT_DOC_DEF.SD_LAYOUT_MODE is '布局模式';
comment on column RHN_META_PRINT_DOC_DEF.JSON_DATA_SCHEMA is '打印数据协议';
comment on column RHN_META_PRINT_DOC_DEF.SD_SOURCE_TYPE is '业务来源类型';
comment on column RHN_META_PRINT_DOC_DEF.SD_STATUS is '状态';
comment on column RHN_META_PRINT_DOC_DEF.REVISION is '乐观锁修订号';
comment on column RHN_META_PRINT_DOC_DEF.DT_CREATED is '创建时间';
comment on column RHN_META_PRINT_DOC_DEF.ID_USER_CREATED is '创建人标识';
comment on column RHN_META_PRINT_DOC_DEF.DT_UPDATED is '更新时间';
comment on column RHN_META_PRINT_DOC_DEF.ID_USER_UPDATED is '更新人标识';

comment on table RHN_META_PRINT_MEDIA is '打印介质档案；一行代表一种可绑定模板的纸张或标签方案';
comment on column RHN_META_PRINT_MEDIA.ID_PRINT_MEDIA is '打印介质主键';
comment on column RHN_META_PRINT_MEDIA.ID_TNT is '租户标识，为空表示平台介质';
comment on column RHN_META_PRINT_MEDIA.CD_MEDIA is '介质编码';
comment on column RHN_META_PRINT_MEDIA.NA_MEDIA is '介质名称';
comment on column RHN_META_PRINT_MEDIA.SD_MEDIA_KIND is '介质类型';
comment on column RHN_META_PRINT_MEDIA.WIDTH_MM is '物理宽度毫米';
comment on column RHN_META_PRINT_MEDIA.HEIGHT_MM is '物理高度毫米，连续纸可为空';
comment on column RHN_META_PRINT_MEDIA.SD_ORIENTATION is '打印方向';
comment on column RHN_META_PRINT_MEDIA.MARGIN_TOP_MM is '上边距毫米';
comment on column RHN_META_PRINT_MEDIA.MARGIN_RIGHT_MM is '右边距毫米';
comment on column RHN_META_PRINT_MEDIA.MARGIN_BOTTOM_MM is '下边距毫米';
comment on column RHN_META_PRINT_MEDIA.MARGIN_LEFT_MM is '左边距毫米';
comment on column RHN_META_PRINT_MEDIA.GAP_HORIZONTAL_MM is '水平间隔毫米';
comment on column RHN_META_PRINT_MEDIA.GAP_VERTICAL_MM is '垂直间隔毫米';
comment on column RHN_META_PRINT_MEDIA.QTY_COLUMNS is '每页排版列数';
comment on column RHN_META_PRINT_MEDIA.QTY_ROWS is '每页排版行数';
comment on column RHN_META_PRINT_MEDIA.QTY_DPI is '输出分辨率';
comment on column RHN_META_PRINT_MEDIA.SD_SENSOR_MODE is '走纸传感模式';
comment on column RHN_META_PRINT_MEDIA.SD_STATUS is '状态';
comment on column RHN_META_PRINT_MEDIA.REVISION is '乐观锁修订号';
comment on column RHN_META_PRINT_MEDIA.DT_CREATED is '创建时间';
comment on column RHN_META_PRINT_MEDIA.ID_USER_CREATED is '创建人标识';
comment on column RHN_META_PRINT_MEDIA.DT_UPDATED is '更新时间';
comment on column RHN_META_PRINT_MEDIA.ID_USER_UPDATED is '更新人标识';

comment on table RHN_META_PRINT_DRAFT is '打印模板草稿；一行代表一份可编辑或待审核的模板内容';
comment on column RHN_META_PRINT_DRAFT.ID_PRINT_DRAFT is '打印模板草稿主键';
comment on column RHN_META_PRINT_DRAFT.ID_TNT is '租户标识';
comment on column RHN_META_PRINT_DRAFT.ID_PRINT_TMPL is '已关联的发布模板标识';
comment on column RHN_META_PRINT_DRAFT.ID_PRINT_DOC_DEF is '打印单据定义标识';
comment on column RHN_META_PRINT_DRAFT.ID_PRINT_MEDIA is '打印介质标识';
comment on column RHN_META_PRINT_DRAFT.ID_PRINT_TMPL_VER_PUBLISD is '草稿发布形成的模板版本标识';
comment on column RHN_META_PRINT_DRAFT.CD_TMPL is '模板编码';
comment on column RHN_META_PRINT_DRAFT.NA_TMPL is '模板名称';
comment on column RHN_META_PRINT_DRAFT.JSON_LAYOUT_SCHEMA is '布局协议';
comment on column RHN_META_PRINT_DRAFT.JSON_CONFIG is '可视化布局配置';
comment on column RHN_META_PRINT_DRAFT.SD_STATUS is '状态';
comment on column RHN_META_PRINT_DRAFT.REVISION is '乐观锁修订号';
comment on column RHN_META_PRINT_DRAFT.DT_CREATED is '创建时间';
comment on column RHN_META_PRINT_DRAFT.ID_USER_CREATED is '创建人标识';
comment on column RHN_META_PRINT_DRAFT.DT_UPDATED is '更新时间';
comment on column RHN_META_PRINT_DRAFT.ID_USER_UPDATED is '更新人标识';
comment on column RHN_META_PRINT_TMPL_VER.ID_PRINT_DOC_DEF is '打印单据定义标识';
comment on column RHN_META_PRINT_TMPL_VER.ID_PRINT_MEDIA is '打印介质标识';

insert into RHN_META_PRINT_DOC_DEF values (270000000000101, null, 'OUTPATIENT_NOTE', '门诊病历', 'CLINICAL_DOCUMENT', 'FLOW', 'RHN.PRINT.OUTPATIENT_NOTE.V1', 'ClinicalDocument', 'ACTIVE', 0, current_timestamp, null, current_timestamp, null);
insert into RHN_META_PRINT_DOC_DEF values (270000000000102, null, 'OUTPATIENT_PRESCRIPTION', '门诊处方', 'PRESCRIPTION', 'FLOW', 'RHN.PRINT.OUTPATIENT_PRESCRIPTION.V1', 'Prescription', 'ACTIVE', 0, current_timestamp, null, current_timestamp, null);
insert into RHN_META_PRINT_DOC_DEF values (270000000000103, null, 'ORAL_MEDICATION_CARD', '口服药卡', 'CARD', 'CANVAS', 'RHN.PRINT.ORAL_MEDICATION_CARD.V1', 'MedicationExecutionTask', 'ACTIVE', 0, current_timestamp, null, current_timestamp, null);
insert into RHN_META_PRINT_DOC_DEF values (270000000000104, null, 'INFUSION_LABEL', '输液瓶签', 'LABEL', 'CANVAS', 'RHN.PRINT.INFUSION_LABEL.V1', 'MedicationExecutionTask', 'ACTIVE', 0, current_timestamp, null, current_timestamp, null);
insert into RHN_META_PRINT_DOC_DEF values (270000000000105, null, 'INFUSION_PATROL_CARD', '输液巡视卡', 'CARD', 'FLOW', 'RHN.PRINT.INFUSION_PATROL_CARD.V1', 'MedicationExecutionTask', 'ACTIVE', 0, current_timestamp, null, current_timestamp, null);
insert into RHN_META_PRINT_DOC_DEF values (270000000000106, null, 'LABORATORY_APPLICATION', '检验申请单', 'APPLICATION', 'FLOW', 'RHN.PRINT.LABORATORY_APPLICATION.V1', 'ServiceRequest', 'ACTIVE', 0, current_timestamp, null, current_timestamp, null);
insert into RHN_META_PRINT_DOC_DEF values (270000000000107, null, 'EXAMINATION_APPLICATION', '检查申请单', 'APPLICATION', 'FLOW', 'RHN.PRINT.EXAMINATION_APPLICATION.V1', 'ServiceRequest', 'ACTIVE', 0, current_timestamp, null, current_timestamp, null);
insert into RHN_META_PRINT_DOC_DEF values (270000000000108, null, 'TREATMENT_APPLICATION', '治疗申请单', 'APPLICATION', 'FLOW', 'RHN.PRINT.TREATMENT_APPLICATION.V1', 'ServiceRequest', 'ACTIVE', 0, current_timestamp, null, current_timestamp, null);

insert into RHN_META_PRINT_MEDIA values (270000000000201, null, 'A4_PORTRAIT', 'A4 纵向', 'SHEET', 210, 297, 'PORTRAIT', 12, 12, 12, 12, 0, 0, 1, 1, 300, 'NONE', 'ACTIVE', 0, current_timestamp, null, current_timestamp, null);
insert into RHN_META_PRINT_MEDIA values (270000000000202, null, 'A5_PORTRAIT', 'A5 纵向', 'SHEET', 148, 210, 'PORTRAIT', 10, 10, 10, 10, 0, 0, 1, 1, 300, 'NONE', 'ACTIVE', 0, current_timestamp, null, current_timestamp, null);
insert into RHN_META_PRINT_MEDIA values (270000000000203, null, 'THERMAL_58_CONTINUOUS', '58mm 热敏连续纸', 'CONTINUOUS', 58, null, 'PORTRAIT', 2, 2, 2, 2, 0, 0, 1, 1, 203, 'NONE', 'ACTIVE', 0, current_timestamp, null, current_timestamp, null);
insert into RHN_META_PRINT_MEDIA values (270000000000204, null, 'THERMAL_80_CONTINUOUS', '80mm 热敏连续纸', 'CONTINUOUS', 80, null, 'PORTRAIT', 2, 2, 2, 2, 0, 0, 1, 1, 203, 'NONE', 'ACTIVE', 0, current_timestamp, null, current_timestamp, null);
insert into RHN_META_PRINT_MEDIA values (270000000000205, null, 'LABEL_70X50', '70mm x 50mm 输液标签', 'LABEL', 70, 50, 'LANDSCAPE', 2, 2, 2, 2, 2, 2, 1, 1, 203, 'GAP', 'ACTIVE', 0, current_timestamp, null, current_timestamp, null);

update RHN_META_PRINT_TMPL_VER set ID_PRINT_DOC_DEF = 270000000000101, ID_PRINT_MEDIA = 270000000000201 where ID_PRINT_TMPL_VER = 270000000000011;
update RHN_META_PRINT_TMPL_VER set ID_PRINT_DOC_DEF = 270000000000102, ID_PRINT_MEDIA = 270000000000201 where ID_PRINT_TMPL_VER = 270000000000012;

insert into RHN_META_PRINT_TMPL values (270000000000003, 0, null, 'ORAL_MEDICATION_CARD_80', '口服药卡 80mm', 'ORAL_MEDICATION_CARD', 'ACTIVE', 1, current_timestamp, null, current_timestamp, null);
insert into RHN_META_PRINT_TMPL values (270000000000004, 0, null, 'INFUSION_LABEL_70X50', '输液瓶签 70x50', 'INFUSION_LABEL', 'ACTIVE', 1, current_timestamp, null, current_timestamp, null);
insert into RHN_META_PRINT_TMPL values (270000000000005, 0, null, 'INFUSION_PATROL_A5', '输液巡视卡 A5', 'INFUSION_PATROL_CARD', 'ACTIVE', 1, current_timestamp, null, current_timestamp, null);

insert into RHN_META_PRINT_TMPL_VER values (270000000000013, 270000000000003, 1, 'RHN_PRINT_CANVAS_V1', '{"paper":{"widthMm":80,"heightMm":55,"marginMm":2},"elements":[{"type":"text","xMm":2,"yMm":2,"widthMm":76,"heightMm":7,"text":"口服药卡","fontSize":13,"bold":true,"align":"CENTER"},{"type":"text","xMm":2,"yMm":10,"widthMm":40,"heightMm":6,"template":"{{patientName}}  {{gender}}  {{ageText}}","fontSize":10,"bold":true},{"type":"text","xMm":44,"yMm":10,"widthMm":34,"heightMm":6,"template":"床号 {{bedNo}}","fontSize":10,"align":"RIGHT"},{"type":"text","xMm":2,"yMm":18,"widthMm":76,"heightMm":12,"template":"{{medicationName}}  {{doseText}}","fontSize":11,"bold":true,"border":true},{"type":"text","xMm":2,"yMm":32,"widthMm":76,"heightMm":6,"template":"{{routeName}}  {{frequencyName}}  {{scheduledAtText}}","fontSize":9},{"type":"text","xMm":2,"yMm":39,"widthMm":48,"heightMm":6,"template":"{{instruction}}","fontSize":8},{"type":"barcode","xMm":51,"yMm":38,"widthMm":27,"heightMm":13,"path":"barcode","showText":true}]}', 'SHA-256', '5E0490BFA66B8D56F9C51971A17E2F80B83429B3A4127E9C68C76B8D0742E881', current_timestamp, null, 270000000000103, 270000000000204);
insert into RHN_META_PRINT_TMPL_VER values (270000000000014, 270000000000004, 1, 'RHN_PRINT_CANVAS_V1', '{"paper":{"widthMm":70,"heightMm":50,"marginMm":2},"elements":[{"type":"text","xMm":2,"yMm":2,"widthMm":66,"heightMm":6,"text":"输液瓶签","fontSize":12,"bold":true,"align":"CENTER"},{"type":"text","xMm":2,"yMm":9,"widthMm":42,"heightMm":6,"template":"{{patientName}}  {{bedNo}}","fontSize":10,"bold":true},{"type":"text","xMm":45,"yMm":9,"widthMm":23,"heightMm":6,"template":"{{scheduledAtText}}","fontSize":8,"align":"RIGHT"},{"type":"text","xMm":2,"yMm":16,"widthMm":66,"heightMm":17,"template":"{{infusionGroupText}}","fontSize":9,"border":true},{"type":"text","xMm":2,"yMm":35,"widthMm":41,"heightMm":6,"template":"{{routeName}}  {{rateText}}","fontSize":8},{"type":"text","xMm":2,"yMm":42,"widthMm":41,"heightMm":5,"template":"{{safetyFlagsText}}","fontSize":8,"bold":true},{"type":"barcode","xMm":44,"yMm":34,"widthMm":24,"heightMm":13,"path":"barcode","showText":true}]}', 'SHA-256', 'F2425A0182191CE9BE72785AA263C4AF4486EC94D2C6C4E8D45EC3958C9D63BB', current_timestamp, null, 270000000000104, 270000000000205);
insert into RHN_META_PRINT_TMPL_VER values (270000000000015, 270000000000005, 1, 'RHN_PRINT_FLOW_V1', '{"paper":{"widthMm":148,"heightMm":210,"marginTopMm":10,"marginRightMm":10,"marginBottomMm":10,"marginLeftMm":10},"title":"输液巡视卡","blocks":[{"type":"fieldGrid","columns":2,"fields":[{"label":"姓名","path":"patientName"},{"label":"床号","path":"bedNo"},{"label":"输液组","path":"infusionGroupText"},{"label":"开始时间","path":"startedAtText"},{"label":"穿刺部位","path":"siteText"},{"label":"初始滴速","path":"rateText"}]},{"type":"table","path":"patrolRows","columns":[{"label":"巡视时间","path":"timeText","width":1.2},{"label":"滴速","path":"rateText","width":0.8},{"label":"患者/穿刺部位情况","path":"observation","width":2.5},{"label":"执行人","path":"operatorName","width":1}]},{"type":"signature","leftLabel":"结束时间","leftPath":"endedAtText","rightLabel":"核对人","rightPath":"checkerName"}],"footer":true}', 'SHA-256', '0A02F799E6C18E42640201A3233464DB7639AEB0C0CD543AF1296877147B16FB', current_timestamp, null, 270000000000105, 270000000000202);
