alter table RHN_BIL_CHARGE_ITEM add (
    ID_ORG number(19),
    ID_DEPT number(19)
);

update RHN_BIL_CHARGE_ITEM c
set ID_ORG = coalesce(
        (select e.ID_ORG from RHN_VIS_ENC e where e.ID_TNT = c.ID_TNT and e.ID_ENC = c.ID_ENC),
        (select a.ID_ORG from RHN_BIL_PAT_ACCT a where a.ID_TNT = c.ID_TNT and a.ID_PAT_ACCT = c.ID_PAT_ACCT)
    ),
    ID_DEPT = coalesce(
        (select e.ID_DEPT from RHN_VIS_ENC e where e.ID_TNT = c.ID_TNT and e.ID_ENC = c.ID_ENC),
        (select a.ID_DEPT from RHN_BIL_PAT_ACCT a where a.ID_TNT = c.ID_TNT and a.ID_PAT_ACCT = c.ID_PAT_ACCT)
    )
where c.ID_ORG is null or c.ID_DEPT is null;

update RHN_BIL_CHARGE_ITEM c
set ID_ORG = coalesce(c.ID_ORG, (select min(o.ID_ORG) from RHN_SYS_ORG o where o.ID_TNT = c.ID_TNT)),
    ID_DEPT = coalesce(c.ID_DEPT, (select min(d.ID_DEPT) from RHN_SYS_DEPT d where d.ID_TNT = c.ID_TNT))
where c.ID_ORG is null or c.ID_DEPT is null;

alter table RHN_BIL_CHARGE_ITEM modify (
    ID_ORG number(19) not null,
    ID_DEPT number(19) not null
);

alter table RHN_BIL_CHARGE_ITEM add constraint FK_BIL_CHARGE_ITE_SYS_ORG foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_BIL_CHARGE_ITEM add constraint FK_BIL_CHARGE_ITE_SYS_DEPT foreign key (ID_TNT, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_DEPT);

create index IDX_BIL_CHARGE_ITE_CHARGE_ORGD on RHN_BIL_CHARGE_ITEM (ID_TNT, ID_ORG, ID_DEPT, DT_OCCURRED);

comment on column RHN_BIL_CHARGE_ITEM.ID_ORG is '机构标识';
comment on column RHN_BIL_CHARGE_ITEM.ID_DEPT is '科室标识';
