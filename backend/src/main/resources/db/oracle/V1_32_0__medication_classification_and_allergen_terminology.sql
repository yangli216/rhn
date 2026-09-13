create table RHN_BD_CLASS_SYSTEM (
    ID_CLASS_SYSTEM number(19,0) primary key,
    CD_CLASS_SYSTEM varchar2(64 char) not null,
    NA_CLASS_SYSTEM varchar2(200 char) not null,
    VERSION varchar2(64 char) not null,
    SYSTEM_URI varchar2(300 char) not null,
    SD_CLASS_TYPE varchar2(32 char) not null,
    SD_STATUS varchar2(32 char) not null,
    constraint UK_BD_CLASS_SYSTEM_CODE unique (CD_CLASS_SYSTEM, VERSION),
    constraint CK_BD_CLASS_SYSTEM_TYPE check (SD_CLASS_TYPE in ('CATALOG','THERAPEUTIC')),
    constraint CK_BD_CLASS_SYSTEM_STATUS check (SD_STATUS in ('ACTIVE','INACTIVE'))
);

create table RHN_BD_CLASS_CONCEPT (
    ID_CLASS_CONCEPT number(19,0) primary key,
    ID_CLASS_SYSTEM number(19,0) not null,
    ID_PARENT number(19,0),
    CD_CONCEPT varchar2(64 char) not null,
    NA_CONCEPT varchar2(300 char) not null,
    QTY_LEVEL number(10) not null,
    CLASS_PATH varchar2(1000 char),
    SORT_ORDER number(10) default 0 not null,
    SD_STATUS varchar2(32 char) not null,
    constraint UK_BD_CLASS_CONCEPT_CODE unique (ID_CLASS_SYSTEM, CD_CONCEPT),
    constraint FK_BD_CLASS_CONCEPT_SYSTEM foreign key (ID_CLASS_SYSTEM) references RHN_BD_CLASS_SYSTEM(ID_CLASS_SYSTEM),
    constraint FK_BD_CLASS_CONCEPT_PARENT foreign key (ID_PARENT) references RHN_BD_CLASS_CONCEPT(ID_CLASS_CONCEPT),
    constraint CK_BD_CLASS_CONCEPT_LEVEL check (QTY_LEVEL between 1 and 10),
    constraint CK_BD_CLASS_CONCEPT_STATUS check (SD_STATUS in ('ACTIVE','INACTIVE'))
);

create table RHN_BD_MED_CLASS_MAP (
    ID_MED_CLASS_MAP number(19,0) primary key,
    ID_TNT number(19,0) not null,
    ID_MED number(19,0) not null,
    ID_CLASS_CONCEPT number(19,0) not null,
    SD_MAPPING_ROLE varchar2(32 char) not null,
    FG_PRIMARY number(1) default 0 not null,
    SOURCE_REFERENCE varchar2(300 char),
    constraint UK_BD_MED_CLASS_MAP unique (ID_TNT, ID_MED, ID_CLASS_CONCEPT),
    constraint FK_BD_MED_CLASS_MAP_MED foreign key (ID_TNT, ID_MED) references RHN_BD_MED(ID_TNT, ID_MED),
    constraint FK_BD_MED_CLASS_MAP_CONCEPT foreign key (ID_CLASS_CONCEPT) references RHN_BD_CLASS_CONCEPT(ID_CLASS_CONCEPT),
    constraint CK_BD_MED_CLASS_MAP_ROLE check (SD_MAPPING_ROLE in ('MEMBERSHIP','THERAPEUTIC_USE'))
);

create table RHN_BD_ALLERGEN (
    ID_ALLERGEN number(19,0) primary key,
    ID_TNT number(19,0) not null,
    ID_PARENT number(19,0),
    CD_CAT varchar2(32 char) not null,
    SD_CONCEPT_TYPE varchar2(32 char) not null,
    CD_CODE_SYS_URI varchar2(300 char) not null,
    CD_ALLERGEN varchar2(128 char) not null,
    NA_ALLERGEN varchar2(300 char) not null,
    NA_ALIAS varchar2(1000 char),
    CD_SEARCH varchar2(300 char),
    SD_STATUS varchar2(32 char) not null,
    constraint UK_BD_ALLERGEN_CODE unique (ID_TNT, CD_CODE_SYS_URI, CD_ALLERGEN),
    constraint FK_BD_ALLERGEN_PARENT foreign key (ID_PARENT) references RHN_BD_ALLERGEN(ID_ALLERGEN),
    constraint CK_BD_ALLERGEN_CATEGORY check (CD_CAT in ('DRUG','FOOD','ENVIRONMENT','BIOLOGIC','OTHER')),
    constraint CK_BD_ALLERGEN_TYPE check (SD_CONCEPT_TYPE in ('DRUG_INGREDIENT','DRUG_CLASS','FOOD','ENVIRONMENT','BIOLOGIC','MATERIAL','OTHER')),
    constraint CK_BD_ALLERGEN_STATUS check (SD_STATUS in ('ACTIVE','INACTIVE'))
);

create table RHN_BD_MED_ALLERGEN_MAP (
    ID_MED_ALLERGEN_MAP number(19,0) primary key,
    ID_TNT number(19,0) not null,
    ID_MED number(19,0) not null,
    ID_ALLERGEN number(19,0) not null,
    SD_RELATION_TYPE varchar2(32 char) not null,
    FG_PRIMARY number(1) default 0 not null,
    constraint UK_BD_MED_ALLERGEN_MAP unique (ID_TNT, ID_MED, ID_ALLERGEN),
    constraint FK_BD_MED_ALLERGEN_MAP_MED foreign key (ID_TNT, ID_MED) references RHN_BD_MED(ID_TNT, ID_MED),
    constraint FK_BD_MED_ALLERGEN_MAP_TERM foreign key (ID_ALLERGEN) references RHN_BD_ALLERGEN(ID_ALLERGEN),
    constraint CK_BD_MED_ALLERGEN_REL check (SD_RELATION_TYPE in ('INGREDIENT','DRUG_CLASS','CROSS_REACTIVITY'))
);

alter table RHN_VIS_ALLERGY_INTOL add ID_ALLERGEN number(19,0);
alter table RHN_VIS_ALLERGY_INTOL add constraint FK_VIS_ALLERGY_TERM foreign key (ID_ALLERGEN) references RHN_BD_ALLERGEN(ID_ALLERGEN);

create index IDX_BD_CLASS_CONCEPT_PARENT on RHN_BD_CLASS_CONCEPT (ID_CLASS_SYSTEM, ID_PARENT, SORT_ORDER);
create index IDX_BD_MED_CLASS_MAP_MED on RHN_BD_MED_CLASS_MAP (ID_TNT, ID_MED);
create index IDX_BD_ALLERGEN_SEARCH on RHN_BD_ALLERGEN (ID_TNT, CD_CAT, SD_STATUS, NA_ALLERGEN);
create index IDX_BD_MED_ALLERGEN_MED on RHN_BD_MED_ALLERGEN_MAP (ID_TNT, ID_MED);
create index IDX_VIS_ALLERGY_TERM on RHN_VIS_ALLERGY_INTOL (ID_TNT, ID_PAT, ID_ALLERGEN);

comment on table RHN_BD_CLASS_SYSTEM is '药品分类体系，区分政策目录与治疗学分类';
comment on table RHN_BD_CLASS_CONCEPT is '药品分类体系中的层级概念';
comment on table RHN_BD_MED_CLASS_MAP is '通用药品与目录或治疗学分类的多对多映射';
comment on table RHN_BD_ALLERGEN is '受控过敏原术语，药物成分和药物类别可形成层级';
comment on table RHN_BD_MED_ALLERGEN_MAP is '通用药品与成分、药物类别及交叉反应概念的关系';
comment on column RHN_VIS_ALLERGY_INTOL.ID_ALLERGEN is '录入时选择的受控过敏原术语；为空表示自由文本';
