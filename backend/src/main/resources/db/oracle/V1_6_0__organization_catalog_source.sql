alter table RHN_SYS_ORG add ID_ORG_CATALOG_SRC number(19);

alter table RHN_SYS_ORG add constraint FK_SYS_ORG_CATALOG_SRC
    foreign key (ID_TNT, ID_ORG_CATALOG_SRC) references RHN_SYS_ORG (ID_TNT, ID_ORG);

create index IDX_SYS_ORG_CATALOG_SRC on RHN_SYS_ORG (ID_TNT, ID_ORG_CATALOG_SRC);

comment on column RHN_SYS_ORG.ID_ORG_CATALOG_SRC is '共享目录来源机构标识；为空时仅使用本机构目录';
