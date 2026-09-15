-- A06: analytics storage only. This migration grants no analytics privileges.
create table RHN_AN_CATALOG_VER (
    ID_CATALOG_VER bigint primary key,
    ID_TNT bigint not null,
    CD_CATALOG varchar(100) not null,
    NO_VERSION integer not null,
    JSON_DEFINITION text not null,
    DT_CREATED timestamp with time zone not null,
    SD_REVIEW varchar(24) default 'CANDIDATE' not null,
    constraint CK_AN_CAT_REVIEW check (SD_REVIEW in ('CANDIDATE','APPROVED','RETIRED')),
    constraint CK_AN_CAT_VERSION check (NO_VERSION > 0),
    constraint UQ_AN_CAT_CODE unique (ID_TNT, CD_CATALOG, NO_VERSION),
    constraint UQ_AN_CAT_TENANT unique (ID_TNT, ID_CATALOG_VER),
    constraint CK_AN_CAT_IDS check (ID_CATALOG_VER > 0 and ID_TNT > 0)
);

create table RHN_AN_DRAFT_VER (
    ID_DRAFT_VER bigint primary key,
    ID_TNT bigint not null,
    ID_DRAFT bigint not null,
    NO_VERSION integer not null,
    ID_USER_OWNER bigint not null,
    ID_CATALOG_VER bigint not null,
    JSON_SPEC text not null,
    DT_CREATED timestamp with time zone not null,
    constraint CK_AN_DRAFT_VERSION check (NO_VERSION > 0),
    constraint UQ_AN_DRAFT_VERSION unique (ID_TNT, ID_DRAFT, NO_VERSION),
    constraint FK_AN_DRAFT_CATALOG foreign key (ID_TNT, ID_CATALOG_VER) references RHN_AN_CATALOG_VER (ID_TNT, ID_CATALOG_VER),
    constraint UQ_AN_DRAFT_TENANT unique (ID_TNT, ID_DRAFT_VER),
    constraint CK_AN_DRAFT_IDS check (ID_DRAFT_VER > 0 and ID_TNT > 0)
);

create table RHN_AN_RUN (
    ID_RUN bigint primary key,
    ID_TNT bigint not null,
    ID_DRAFT_VER bigint not null,
    ID_USER_OWNER bigint not null,
    DT_CREATED timestamp with time zone not null,
    REVISION bigint default 0 not null,
    SD_STATE varchar(24) default 'QUEUED' not null,
    SD_DELIVERY varchar(24) default 'UNAVAILABLE' not null,
    constraint CK_AN_RUN_STATE check (SD_STATE in ('QUEUED','RUNNING','CANCEL_REQUESTED','SUCCEEDED','FAILED','REJECTED','CANCELLED')),
    constraint CK_AN_RUN_DELIVERY check (SD_DELIVERY in ('UNAVAILABLE','AVAILABLE','REVOKED','EXPIRED','PURGED')),
    constraint FK_AN_RUN_DRAFT foreign key (ID_TNT, ID_DRAFT_VER) references RHN_AN_DRAFT_VER (ID_TNT, ID_DRAFT_VER),
    constraint UQ_AN_RUN_TENANT unique (ID_TNT, ID_RUN),
    constraint CK_AN_RUN_IDS check (ID_RUN > 0 and ID_TNT > 0)
);

create table RHN_AN_AUDIT_EVT (
    ID_AUDIT_EVT bigint primary key,
    ID_TNT bigint not null,
    ID_RUN bigint not null,
    ID_USER_ACTOR bigint not null,
    CD_EVENT varchar(80) not null,
    DT_CREATED timestamp with time zone not null,
    constraint FK_AN_AUDIT_RUN foreign key (ID_TNT, ID_RUN) references RHN_AN_RUN (ID_TNT, ID_RUN),
    constraint UQ_AN_AUDIT_TENANT unique (ID_TNT, ID_AUDIT_EVT),
    constraint CK_AN_AUDIT_IDS check (ID_AUDIT_EVT > 0 and ID_TNT > 0)
);

create index IX_AN_DRAFT_OWNER on RHN_AN_DRAFT_VER (ID_TNT, ID_USER_OWNER, DT_CREATED);
create index IX_AN_DRAFT_CATALOG on RHN_AN_DRAFT_VER (ID_TNT, ID_CATALOG_VER);
create index IX_AN_RUN_OWNER on RHN_AN_RUN (ID_TNT, ID_USER_OWNER, DT_CREATED);
create index IX_AN_RUN_DRAFT on RHN_AN_RUN (ID_TNT, ID_DRAFT_VER);
create index IX_AN_AUDIT_RUN on RHN_AN_AUDIT_EVT (ID_TNT, ID_RUN, DT_CREATED);
