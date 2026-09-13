create table RHN_BD_CLASS_SYSTEM (
    ID_CLASS_SYSTEM bigint primary key,
    CD_CLASS_SYSTEM varchar(64) not null,
    NA_CLASS_SYSTEM varchar(200) not null,
    VERSION varchar(64) not null,
    SYSTEM_URI varchar(300) not null,
    SD_CLASS_TYPE varchar(32) not null,
    SD_STATUS varchar(32) not null,
    constraint UK_BD_CLASS_SYSTEM_CODE unique (CD_CLASS_SYSTEM, VERSION),
    constraint CK_BD_CLASS_SYSTEM_TYPE check (SD_CLASS_TYPE in ('CATALOG', 'THERAPEUTIC')),
    constraint CK_BD_CLASS_SYSTEM_STATUS check (SD_STATUS in ('ACTIVE', 'INACTIVE'))
);

create table RHN_BD_CLASS_CONCEPT (
    ID_CLASS_CONCEPT bigint primary key,
    ID_CLASS_SYSTEM bigint not null,
    ID_PARENT bigint,
    CD_CONCEPT varchar(64) not null,
    NA_CONCEPT varchar(300) not null,
    QTY_LEVEL integer not null,
    CLASS_PATH varchar(1000),
    SORT_ORDER integer default 0 not null,
    SD_STATUS varchar(32) not null,
    constraint UK_BD_CLASS_CONCEPT_CODE unique (ID_CLASS_SYSTEM, CD_CONCEPT),
    constraint FK_BD_CLASS_CONCEPT_SYSTEM foreign key (ID_CLASS_SYSTEM) references RHN_BD_CLASS_SYSTEM(ID_CLASS_SYSTEM),
    constraint FK_BD_CLASS_CONCEPT_PARENT foreign key (ID_PARENT) references RHN_BD_CLASS_CONCEPT(ID_CLASS_CONCEPT),
    constraint CK_BD_CLASS_CONCEPT_LEVEL check (QTY_LEVEL between 1 and 10),
    constraint CK_BD_CLASS_CONCEPT_STATUS check (SD_STATUS in ('ACTIVE', 'INACTIVE'))
);

create table RHN_BD_MED_CLASS_MAP (
    ID_MED_CLASS_MAP bigint primary key,
    ID_TNT bigint not null,
    ID_MED bigint not null,
    ID_CLASS_CONCEPT bigint not null,
    SD_MAPPING_ROLE varchar(32) not null,
    FG_PRIMARY boolean default false not null,
    SOURCE_REFERENCE varchar(300),
    constraint UK_BD_MED_CLASS_MAP unique (ID_TNT, ID_MED, ID_CLASS_CONCEPT),
    constraint FK_BD_MED_CLASS_MAP_MED foreign key (ID_TNT, ID_MED) references RHN_BD_MED(ID_TNT, ID_MED),
    constraint FK_BD_MED_CLASS_MAP_CONCEPT foreign key (ID_CLASS_CONCEPT) references RHN_BD_CLASS_CONCEPT(ID_CLASS_CONCEPT),
    constraint CK_BD_MED_CLASS_MAP_ROLE check (SD_MAPPING_ROLE in ('MEMBERSHIP', 'THERAPEUTIC_USE'))
);

create table RHN_BD_ALLERGEN (
    ID_ALLERGEN bigint primary key,
    ID_TNT bigint not null,
    ID_PARENT bigint,
    CD_CAT varchar(32) not null,
    SD_CONCEPT_TYPE varchar(32) not null,
    CD_CODE_SYS_URI varchar(300) not null,
    CD_ALLERGEN varchar(128) not null,
    NA_ALLERGEN varchar(300) not null,
    NA_ALIAS varchar(1000),
    CD_SEARCH varchar(300),
    SD_STATUS varchar(32) not null,
    constraint UK_BD_ALLERGEN_CODE unique (ID_TNT, CD_CODE_SYS_URI, CD_ALLERGEN),
    constraint FK_BD_ALLERGEN_PARENT foreign key (ID_PARENT) references RHN_BD_ALLERGEN(ID_ALLERGEN),
    constraint CK_BD_ALLERGEN_CATEGORY check (CD_CAT in ('DRUG', 'FOOD', 'ENVIRONMENT', 'BIOLOGIC', 'OTHER')),
    constraint CK_BD_ALLERGEN_TYPE check (SD_CONCEPT_TYPE in ('DRUG_INGREDIENT', 'DRUG_CLASS', 'FOOD', 'ENVIRONMENT', 'BIOLOGIC', 'MATERIAL', 'OTHER')),
    constraint CK_BD_ALLERGEN_STATUS check (SD_STATUS in ('ACTIVE', 'INACTIVE'))
);

create table RHN_BD_MED_ALLERGEN_MAP (
    ID_MED_ALLERGEN_MAP bigint primary key,
    ID_TNT bigint not null,
    ID_MED bigint not null,
    ID_ALLERGEN bigint not null,
    SD_RELATION_TYPE varchar(32) not null,
    FG_PRIMARY boolean default false not null,
    constraint UK_BD_MED_ALLERGEN_MAP unique (ID_TNT, ID_MED, ID_ALLERGEN),
    constraint FK_BD_MED_ALLERGEN_MAP_MED foreign key (ID_TNT, ID_MED) references RHN_BD_MED(ID_TNT, ID_MED),
    constraint FK_BD_MED_ALLERGEN_MAP_TERM foreign key (ID_ALLERGEN) references RHN_BD_ALLERGEN(ID_ALLERGEN),
    constraint CK_BD_MED_ALLERGEN_REL check (SD_RELATION_TYPE in ('INGREDIENT', 'DRUG_CLASS', 'CROSS_REACTIVITY'))
);

alter table RHN_VIS_ALLERGY_INTOL add column ID_ALLERGEN bigint;
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
