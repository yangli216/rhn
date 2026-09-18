-- ===================================================================
-- V1_53_0: 表结构走查 P0/P1 问题治理与 ID_DEPT_PERFORMER 命名简化
-- 1. 简化 ID_ORG_PERFORMER / ID_DEPT_PERFORMER 为 ID_ORG_EXEC / ID_DEPT_EXEC
-- 2. 对称增补开单维度 ID_ORG_REQ / ID_DEPT_REQ
-- 3. 补全 14 张核心业务与事实表的 ID_ORG / ID_DEPT 维度，平滑回填存量数据
-- ===================================================================

-- -------------------------------------------------------------------
-- 1. RHN_EX_CARE_REQ: 简化执行科室命名为 _EXEC，补全开单科室 _REQ
-- -------------------------------------------------------------------
alter table RHN_EX_CARE_REQ drop constraint FK_EX_CARE_REQ_SYS_DEPT_CARE_R;
alter table RHN_EX_CARE_REQ drop constraint FK_EX_CARE_REQ_SYS_ORG_CARE_RE;

alter table RHN_EX_CARE_REQ rename column ID_ORG_PERFORMER to ID_ORG_EXEC;
alter table RHN_EX_CARE_REQ rename column ID_DEPT_PERFORMER to ID_DEPT_EXEC;

alter table RHN_EX_CARE_REQ add column ID_ORG_REQ bigint;
alter table RHN_EX_CARE_REQ add column ID_DEPT_REQ bigint;

update RHN_EX_CARE_REQ r
set ID_ORG_REQ = coalesce(
        (select e.ID_ORG from RHN_VIS_ENC e where e.ID_TNT = r.ID_TNT and e.ID_ENC = r.ID_ENC),
        r.ID_ORG_EXEC
    ),
    ID_DEPT_REQ = coalesce(
        (select e.ID_DEPT from RHN_VIS_ENC e where e.ID_TNT = r.ID_TNT and e.ID_ENC = r.ID_ENC),
        r.ID_DEPT_EXEC
    )
where r.ID_ORG_REQ is null or r.ID_DEPT_REQ is null;

update RHN_EX_CARE_REQ r
set ID_ORG_REQ = coalesce(r.ID_ORG_REQ, (select min(o.ID_ORG) from RHN_SYS_ORG o where o.ID_TNT = r.ID_TNT)),
    ID_DEPT_REQ = coalesce(r.ID_DEPT_REQ, (select min(d.ID_DEPT) from RHN_SYS_DEPT d where d.ID_TNT = r.ID_TNT))
where r.ID_ORG_REQ is null or r.ID_DEPT_REQ is null;

alter table RHN_EX_CARE_REQ alter column ID_ORG_REQ set not null;
alter table RHN_EX_CARE_REQ alter column ID_DEPT_REQ set not null;

alter table RHN_EX_CARE_REQ add constraint FK_EX_CARE_REQ_SYS_ORG_EXEC foreign key (ID_TNT, ID_ORG_EXEC) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_EX_CARE_REQ add constraint FK_EX_CARE_REQ_SYS_DEPT_EXEC foreign key (ID_TNT, ID_ORG_EXEC, ID_DEPT_EXEC) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_EX_CARE_REQ add constraint FK_EX_CARE_REQ_SYS_ORG_REQ foreign key (ID_TNT, ID_ORG_REQ) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_EX_CARE_REQ add constraint FK_EX_CARE_REQ_SYS_DEPT_REQ foreign key (ID_TNT, ID_ORG_REQ, ID_DEPT_REQ) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);

create index IDX_EX_CARE_REQ_REQ_DEPT on RHN_EX_CARE_REQ (ID_TNT, ID_DEPT_REQ, DT_AUTHORED);
create index IDX_EX_CARE_REQ_EXEC_DEPT on RHN_EX_CARE_REQ (ID_TNT, ID_DEPT_EXEC, DT_AUTHORED);

comment on column RHN_EX_CARE_REQ.ID_ORG_EXEC is '执行人机构标识';
comment on column RHN_EX_CARE_REQ.ID_DEPT_EXEC is '执行人科室标识';
comment on column RHN_EX_CARE_REQ.ID_ORG_REQ is '开立机构标识';
comment on column RHN_EX_CARE_REQ.ID_DEPT_REQ is '开立科室标识';

-- -------------------------------------------------------------------
-- 2. RHN_EX_REQ_GRP: 简化执行科室命名为 _EXEC，补全开单科室 _REQ
-- -------------------------------------------------------------------
alter table RHN_EX_REQ_GRP drop constraint FK_EX_REQ_GRP_SYS_DEPT_REQUEST;
alter table RHN_EX_REQ_GRP drop constraint FK_EX_REQ_GRP_SYS_ORG_REQUEST_;

alter table RHN_EX_REQ_GRP rename column ID_ORG_PERFORMER to ID_ORG_EXEC;
alter table RHN_EX_REQ_GRP rename column ID_DEPT_PERFORMER to ID_DEPT_EXEC;

alter table RHN_EX_REQ_GRP add column ID_ORG_REQ bigint;
alter table RHN_EX_REQ_GRP add column ID_DEPT_REQ bigint;

update RHN_EX_REQ_GRP g
set ID_ORG_REQ = coalesce(
        (select e.ID_ORG from RHN_VIS_ENC e where e.ID_TNT = g.ID_TNT and e.ID_ENC = g.ID_ENC),
        g.ID_ORG_EXEC
    ),
    ID_DEPT_REQ = coalesce(
        (select e.ID_DEPT from RHN_VIS_ENC e where e.ID_TNT = g.ID_TNT and e.ID_ENC = g.ID_ENC),
        g.ID_DEPT_EXEC
    )
where g.ID_ORG_REQ is null or g.ID_DEPT_REQ is null;

update RHN_EX_REQ_GRP g
set ID_ORG_REQ = coalesce(g.ID_ORG_REQ, (select min(o.ID_ORG) from RHN_SYS_ORG o where o.ID_TNT = g.ID_TNT)),
    ID_DEPT_REQ = coalesce(g.ID_DEPT_REQ, (select min(d.ID_DEPT) from RHN_SYS_DEPT d where d.ID_TNT = g.ID_TNT))
where g.ID_ORG_REQ is null or g.ID_DEPT_REQ is null;

alter table RHN_EX_REQ_GRP alter column ID_ORG_REQ set not null;
alter table RHN_EX_REQ_GRP alter column ID_DEPT_REQ set not null;

alter table RHN_EX_REQ_GRP add constraint FK_EX_REQ_GRP_SYS_ORG_EXEC foreign key (ID_TNT, ID_ORG_EXEC) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_EX_REQ_GRP add constraint FK_EX_REQ_GRP_SYS_DEPT_EXEC foreign key (ID_TNT, ID_ORG_EXEC, ID_DEPT_EXEC) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_EX_REQ_GRP add constraint FK_EX_REQ_GRP_SYS_ORG_REQ foreign key (ID_TNT, ID_ORG_REQ) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_EX_REQ_GRP add constraint FK_EX_REQ_GRP_SYS_DEPT_REQ foreign key (ID_TNT, ID_ORG_REQ, ID_DEPT_REQ) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);

comment on column RHN_EX_REQ_GRP.ID_ORG_EXEC is '执行人机构标识';
comment on column RHN_EX_REQ_GRP.ID_DEPT_EXEC is '执行人科室标识';
comment on column RHN_EX_REQ_GRP.ID_ORG_REQ is '开立机构标识';
comment on column RHN_EX_REQ_GRP.ID_DEPT_REQ is '开立科室标识';

-- -------------------------------------------------------------------
-- 3. RHN_VIS_ENC_DIAG: 增加患者标识与就诊机构、科室
-- -------------------------------------------------------------------
alter table RHN_VIS_ENC_DIAG add column ID_PAT bigint;
alter table RHN_VIS_ENC_DIAG add column ID_ORG bigint;
alter table RHN_VIS_ENC_DIAG add column ID_DEPT bigint;

update RHN_VIS_ENC_DIAG d
set ID_PAT = (select e.ID_PAT from RHN_VIS_ENC e where e.ID_TNT = d.ID_TNT and e.ID_ENC = d.ID_ENC),
    ID_ORG = (select e.ID_ORG from RHN_VIS_ENC e where e.ID_TNT = d.ID_TNT and e.ID_ENC = d.ID_ENC),
    ID_DEPT = (select e.ID_DEPT from RHN_VIS_ENC e where e.ID_TNT = d.ID_TNT and e.ID_ENC = d.ID_ENC)
where d.ID_PAT is null or d.ID_ORG is null or d.ID_DEPT is null;

update RHN_VIS_ENC_DIAG d
set ID_PAT = coalesce(d.ID_PAT, 1),
    ID_ORG = coalesce(d.ID_ORG, (select min(o.ID_ORG) from RHN_SYS_ORG o where o.ID_TNT = d.ID_TNT)),
    ID_DEPT = coalesce(d.ID_DEPT, (select min(s.ID_DEPT) from RHN_SYS_DEPT s where s.ID_TNT = d.ID_TNT))
where d.ID_PAT is null or d.ID_ORG is null or d.ID_DEPT is null;

alter table RHN_VIS_ENC_DIAG alter column ID_PAT set not null;
alter table RHN_VIS_ENC_DIAG alter column ID_ORG set not null;
alter table RHN_VIS_ENC_DIAG alter column ID_DEPT set not null;

alter table RHN_VIS_ENC_DIAG add constraint FK_VIS_ENC_DIAG_PI_PAT foreign key (ID_TNT, ID_PAT) references RHN_PI_PAT(ID_TNT, ID_PAT);
alter table RHN_VIS_ENC_DIAG add constraint FK_VIS_ENC_DIAG_SYS_ORG foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_VIS_ENC_DIAG add constraint FK_VIS_ENC_DIAG_SYS_DEPT foreign key (ID_TNT, ID_ORG, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);

create index IDX_VIS_ENC_DIAG_DEPT_REC on RHN_VIS_ENC_DIAG (ID_TNT, ID_DEPT, DT_RECORDED);
create index IDX_VIS_ENC_DIAG_PAT on RHN_VIS_ENC_DIAG (ID_TNT, ID_PAT);

comment on column RHN_VIS_ENC_DIAG.ID_PAT is '患者标识';
comment on column RHN_VIS_ENC_DIAG.ID_ORG is '机构标识';
comment on column RHN_VIS_ENC_DIAG.ID_DEPT is '科室标识';

-- -------------------------------------------------------------------
-- 4. RHN_SUP_MED_DISP: 增加发药机构与科室
-- -------------------------------------------------------------------
alter table RHN_SUP_MED_DISP add column ID_ORG bigint;
alter table RHN_SUP_MED_DISP add column ID_DEPT bigint;

update RHN_SUP_MED_DISP m
set ID_ORG = coalesce(
        (select s.ID_ORG from RHN_SUP_STOCK_SITE s where s.ID_TNT = m.ID_TNT and s.ID_STOCK_SITE = m.ID_STOCK_SITE),
        (select e.ID_ORG from RHN_VIS_ENC e where e.ID_TNT = m.ID_TNT and e.ID_ENC = m.ID_ENC)
    ),
    ID_DEPT = coalesce(
        (select s.ID_DEPT from RHN_SUP_STOCK_SITE s where s.ID_TNT = m.ID_TNT and s.ID_STOCK_SITE = m.ID_STOCK_SITE),
        (select e.ID_DEPT from RHN_VIS_ENC e where e.ID_TNT = m.ID_TNT and e.ID_ENC = m.ID_ENC)
    )
where m.ID_ORG is null or m.ID_DEPT is null;

update RHN_SUP_MED_DISP m
set ID_ORG = coalesce(m.ID_ORG, (select min(o.ID_ORG) from RHN_SYS_ORG o where o.ID_TNT = m.ID_TNT)),
    ID_DEPT = coalesce(m.ID_DEPT, (select min(d.ID_DEPT) from RHN_SYS_DEPT d where d.ID_TNT = m.ID_TNT))
where m.ID_ORG is null or m.ID_DEPT is null;

alter table RHN_SUP_MED_DISP alter column ID_ORG set not null;
alter table RHN_SUP_MED_DISP alter column ID_DEPT set not null;

alter table RHN_SUP_MED_DISP add constraint FK_SUP_MED_DISP_SYS_ORG foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SUP_MED_DISP add constraint FK_SUP_MED_DISP_SYS_DEPT foreign key (ID_TNT, ID_ORG, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);

create index IDX_SUP_MED_DISP_DEPT_OCC on RHN_SUP_MED_DISP (ID_TNT, ID_DEPT, DT_OCCURRED);

comment on column RHN_SUP_MED_DISP.ID_ORG is '机构标识';
comment on column RHN_SUP_MED_DISP.ID_DEPT is '科室标识';

-- -------------------------------------------------------------------
-- 5. RHN_EX_DIAG_REPORT: 增加检查检验报告出具机构与科室
-- -------------------------------------------------------------------
alter table RHN_EX_DIAG_REPORT add column ID_ORG bigint;
alter table RHN_EX_DIAG_REPORT add column ID_DEPT bigint;

update RHN_EX_DIAG_REPORT r
set ID_ORG = coalesce(
        (select c.ID_ORG_EXEC from RHN_EX_CARE_REQ c where c.ID_TNT = r.ID_TNT and c.ID_CARE_REQ = r.ID_CARE_REQ),
        (select e.ID_ORG from RHN_VIS_ENC e where e.ID_TNT = r.ID_TNT and e.ID_ENC = r.ID_ENC)
    ),
    ID_DEPT = coalesce(
        (select c.ID_DEPT_EXEC from RHN_EX_CARE_REQ c where c.ID_TNT = r.ID_TNT and c.ID_CARE_REQ = r.ID_CARE_REQ),
        (select e.ID_DEPT from RHN_VIS_ENC e where e.ID_TNT = r.ID_TNT and e.ID_ENC = r.ID_ENC)
    )
where r.ID_ORG is null or r.ID_DEPT is null;

update RHN_EX_DIAG_REPORT r
set ID_ORG = coalesce(r.ID_ORG, (select min(o.ID_ORG) from RHN_SYS_ORG o where o.ID_TNT = r.ID_TNT)),
    ID_DEPT = coalesce(r.ID_DEPT, (select min(d.ID_DEPT) from RHN_SYS_DEPT d where d.ID_TNT = r.ID_TNT))
where r.ID_ORG is null or r.ID_DEPT is null;

alter table RHN_EX_DIAG_REPORT alter column ID_ORG set not null;
alter table RHN_EX_DIAG_REPORT alter column ID_DEPT set not null;

alter table RHN_EX_DIAG_REPORT add constraint FK_EX_DIAG_REP_SYS_ORG foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_EX_DIAG_REPORT add constraint FK_EX_DIAG_REP_SYS_DEPT foreign key (ID_TNT, ID_ORG, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);

create index IDX_EX_DIAG_REP_DEPT_ISS on RHN_EX_DIAG_REPORT (ID_TNT, ID_DEPT, DT_ISSUED);

comment on column RHN_EX_DIAG_REPORT.ID_ORG is '机构标识';
comment on column RHN_EX_DIAG_REPORT.ID_DEPT is '科室标识';

-- -------------------------------------------------------------------
-- 6. RHN_SC_APPT: 增加预约机构与科室
-- -------------------------------------------------------------------
alter table RHN_SC_APPT add column ID_ORG bigint;
alter table RHN_SC_APPT add column ID_DEPT bigint;

update RHN_SC_APPT a
set ID_ORG = (select s.ID_ORG from RHN_SC_SVC_SCHED s where s.ID_TNT = a.ID_TNT and s.ID_SVC_SCHED = a.ID_SVC_SCHED),
    ID_DEPT = (select s.ID_DEPT from RHN_SC_SVC_SCHED s where s.ID_TNT = a.ID_TNT and s.ID_SVC_SCHED = a.ID_SVC_SCHED)
where a.ID_ORG is null or a.ID_DEPT is null;

update RHN_SC_APPT a
set ID_ORG = coalesce(a.ID_ORG, (select min(o.ID_ORG) from RHN_SYS_ORG o where o.ID_TNT = a.ID_TNT)),
    ID_DEPT = coalesce(a.ID_DEPT, (select min(d.ID_DEPT) from RHN_SYS_DEPT d where d.ID_TNT = a.ID_TNT))
where a.ID_ORG is null or a.ID_DEPT is null;

alter table RHN_SC_APPT alter column ID_ORG set not null;
alter table RHN_SC_APPT alter column ID_DEPT set not null;

alter table RHN_SC_APPT add constraint FK_SC_APPT_SYS_ORG foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SC_APPT add constraint FK_SC_APPT_SYS_DEPT foreign key (ID_TNT, ID_ORG, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);

create index IDX_SC_APPT_DEPT_START on RHN_SC_APPT (ID_TNT, ID_DEPT, DT_START);

comment on column RHN_SC_APPT.ID_ORG is '机构标识';
comment on column RHN_SC_APPT.ID_DEPT is '科室标识';

-- -------------------------------------------------------------------
-- 7. RHN_BIL_CASHIER_CLOSE: 增加收费处/日结科室
-- -------------------------------------------------------------------
alter table RHN_BIL_CASHIER_CLOSE add column ID_DEPT bigint;

update RHN_BIL_CASHIER_CLOSE c
set ID_DEPT = coalesce(
    (select min(d.ID_DEPT) from RHN_SYS_DEPT d where d.ID_TNT = c.ID_TNT and d.ID_ORG = c.ID_ORG),
    (select min(d.ID_DEPT) from RHN_SYS_DEPT d where d.ID_TNT = c.ID_TNT)
)
where c.ID_DEPT is null;

alter table RHN_BIL_CASHIER_CLOSE alter column ID_DEPT set not null;

alter table RHN_BIL_CASHIER_CLOSE add constraint FK_BIL_CASHIER_CL_SYS_DEPT foreign key (ID_TNT, ID_ORG, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);

comment on column RHN_BIL_CASHIER_CLOSE.ID_DEPT is '科室标识';

-- -------------------------------------------------------------------
-- 8. RHN_BIL_PAY / RHN_BIL_PAY_ORDER / RHN_BIL_STL / RHN_BIL_INVOICE: 财务结算主单增加机构与科室
-- -------------------------------------------------------------------
-- 8.1 RHN_BIL_PAY
alter table RHN_BIL_PAY add column ID_ORG bigint;
alter table RHN_BIL_PAY add column ID_DEPT bigint;

update RHN_BIL_PAY p
set ID_ORG = (select a.ID_ORG from RHN_BIL_PAT_ACCT a where a.ID_TNT = p.ID_TNT and a.ID_PAT_ACCT = p.ID_PAT_ACCT),
    ID_DEPT = (select a.ID_DEPT from RHN_BIL_PAT_ACCT a where a.ID_TNT = p.ID_TNT and a.ID_PAT_ACCT = p.ID_PAT_ACCT)
where p.ID_ORG is null or p.ID_DEPT is null;

update RHN_BIL_PAY p
set ID_ORG = coalesce(p.ID_ORG, (select min(o.ID_ORG) from RHN_SYS_ORG o where o.ID_TNT = p.ID_TNT)),
    ID_DEPT = coalesce(p.ID_DEPT, (select min(d.ID_DEPT) from RHN_SYS_DEPT d where d.ID_TNT = p.ID_TNT))
where p.ID_ORG is null or p.ID_DEPT is null;

alter table RHN_BIL_PAY alter column ID_ORG set not null;
alter table RHN_BIL_PAY alter column ID_DEPT set not null;

alter table RHN_BIL_PAY add constraint FK_BIL_PAY_SYS_ORG foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_BIL_PAY add constraint FK_BIL_PAY_SYS_DEPT foreign key (ID_TNT, ID_ORG, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
create index IDX_BIL_PAY_DEPT_PAID on RHN_BIL_PAY (ID_TNT, ID_DEPT, DT_PAID);

comment on column RHN_BIL_PAY.ID_ORG is '机构标识';
comment on column RHN_BIL_PAY.ID_DEPT is '科室标识';

-- 8.2 RHN_BIL_PAY_ORDER
alter table RHN_BIL_PAY_ORDER add column ID_ORG bigint;
alter table RHN_BIL_PAY_ORDER add column ID_DEPT bigint;

update RHN_BIL_PAY_ORDER o
set ID_ORG = (select a.ID_ORG from RHN_BIL_PAT_ACCT a where a.ID_TNT = o.ID_TNT and a.ID_PAT_ACCT = o.ID_PAT_ACCT),
    ID_DEPT = (select a.ID_DEPT from RHN_BIL_PAT_ACCT a where a.ID_TNT = o.ID_TNT and a.ID_PAT_ACCT = o.ID_PAT_ACCT)
where o.ID_ORG is null or o.ID_DEPT is null;

update RHN_BIL_PAY_ORDER o
set ID_ORG = coalesce(o.ID_ORG, (select min(x.ID_ORG) from RHN_SYS_ORG x where x.ID_TNT = o.ID_TNT)),
    ID_DEPT = coalesce(o.ID_DEPT, (select min(d.ID_DEPT) from RHN_SYS_DEPT d where d.ID_TNT = o.ID_TNT))
where o.ID_ORG is null or o.ID_DEPT is null;

alter table RHN_BIL_PAY_ORDER alter column ID_ORG set not null;
alter table RHN_BIL_PAY_ORDER alter column ID_DEPT set not null;

alter table RHN_BIL_PAY_ORDER add constraint FK_BIL_PAY_ORD_SYS_ORG foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_BIL_PAY_ORDER add constraint FK_BIL_PAY_ORD_SYS_DEPT foreign key (ID_TNT, ID_ORG, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
create index IDX_BIL_PAY_ORD_DEPT_CRE on RHN_BIL_PAY_ORDER (ID_TNT, ID_DEPT, DT_CREATED);

comment on column RHN_BIL_PAY_ORDER.ID_ORG is '机构标识';
comment on column RHN_BIL_PAY_ORDER.ID_DEPT is '科室标识';

-- 8.3 RHN_BIL_STL
alter table RHN_BIL_STL add column ID_ORG bigint;
alter table RHN_BIL_STL add column ID_DEPT bigint;

update RHN_BIL_STL s
set ID_ORG = (select a.ID_ORG from RHN_BIL_PAT_ACCT a where a.ID_TNT = s.ID_TNT and a.ID_PAT_ACCT = s.ID_PAT_ACCT),
    ID_DEPT = (select a.ID_DEPT from RHN_BIL_PAT_ACCT a where a.ID_TNT = s.ID_TNT and a.ID_PAT_ACCT = s.ID_PAT_ACCT)
where s.ID_ORG is null or s.ID_DEPT is null;

update RHN_BIL_STL s
set ID_ORG = coalesce(s.ID_ORG, (select min(o.ID_ORG) from RHN_SYS_ORG o where o.ID_TNT = s.ID_TNT)),
    ID_DEPT = coalesce(s.ID_DEPT, (select min(d.ID_DEPT) from RHN_SYS_DEPT d where d.ID_TNT = s.ID_TNT))
where s.ID_ORG is null or s.ID_DEPT is null;

alter table RHN_BIL_STL alter column ID_ORG set not null;
alter table RHN_BIL_STL alter column ID_DEPT set not null;

alter table RHN_BIL_STL add constraint FK_BIL_STL_SYS_ORG foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_BIL_STL add constraint FK_BIL_STL_SYS_DEPT foreign key (ID_TNT, ID_ORG, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
create index IDX_BIL_STL_DEPT_CRE on RHN_BIL_STL (ID_TNT, ID_DEPT, DT_CREATED);

comment on column RHN_BIL_STL.ID_ORG is '机构标识';
comment on column RHN_BIL_STL.ID_DEPT is '科室标识';

-- 8.4 RHN_BIL_INVOICE
alter table RHN_BIL_INVOICE add column ID_ORG bigint;
alter table RHN_BIL_INVOICE add column ID_DEPT bigint;

update RHN_BIL_INVOICE i
set ID_ORG = (select a.ID_ORG from RHN_BIL_PAT_ACCT a where a.ID_TNT = i.ID_TNT and a.ID_PAT_ACCT = i.ID_PAT_ACCT),
    ID_DEPT = (select a.ID_DEPT from RHN_BIL_PAT_ACCT a where a.ID_TNT = i.ID_TNT and a.ID_PAT_ACCT = i.ID_PAT_ACCT)
where i.ID_ORG is null or i.ID_DEPT is null;

update RHN_BIL_INVOICE i
set ID_ORG = coalesce(i.ID_ORG, (select min(o.ID_ORG) from RHN_SYS_ORG o where o.ID_TNT = i.ID_TNT)),
    ID_DEPT = coalesce(i.ID_DEPT, (select min(d.ID_DEPT) from RHN_SYS_DEPT d where d.ID_TNT = i.ID_TNT))
where i.ID_ORG is null or i.ID_DEPT is null;

alter table RHN_BIL_INVOICE alter column ID_ORG set not null;
alter table RHN_BIL_INVOICE alter column ID_DEPT set not null;

alter table RHN_BIL_INVOICE add constraint FK_BIL_INV_SYS_ORG foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_BIL_INVOICE add constraint FK_BIL_INV_SYS_DEPT foreign key (ID_TNT, ID_ORG, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
create index IDX_BIL_INV_DEPT_ISS on RHN_BIL_INVOICE (ID_TNT, ID_DEPT, DT_ISSUED);

comment on column RHN_BIL_INVOICE.ID_ORG is '机构标识';
comment on column RHN_BIL_INVOICE.ID_DEPT is '科室标识';

-- -------------------------------------------------------------------
-- 9. RHN_VIS_INP_BED_DAY_FACT: 增加床日核算机构与科室
-- -------------------------------------------------------------------
alter table RHN_VIS_INP_BED_DAY_FACT add column ID_ORG bigint;
alter table RHN_VIS_INP_BED_DAY_FACT add column ID_DEPT bigint;

update RHN_VIS_INP_BED_DAY_FACT b
set ID_ORG = (select e.ID_ORG from RHN_VIS_ENC e where e.ID_TNT = b.ID_TNT and e.ID_ENC = b.ID_ENC),
    ID_DEPT = (select e.ID_DEPT from RHN_VIS_ENC e where e.ID_TNT = b.ID_TNT and e.ID_ENC = b.ID_ENC)
where b.ID_ORG is null or b.ID_DEPT is null;

update RHN_VIS_INP_BED_DAY_FACT b
set ID_ORG = coalesce(b.ID_ORG, (select min(o.ID_ORG) from RHN_SYS_ORG o where o.ID_TNT = b.ID_TNT)),
    ID_DEPT = coalesce(b.ID_DEPT, (select min(d.ID_DEPT) from RHN_SYS_DEPT d where d.ID_TNT = b.ID_TNT))
where b.ID_ORG is null or b.ID_DEPT is null;

alter table RHN_VIS_INP_BED_DAY_FACT alter column ID_ORG set not null;
alter table RHN_VIS_INP_BED_DAY_FACT alter column ID_DEPT set not null;

alter table RHN_VIS_INP_BED_DAY_FACT add constraint FK_VIS_INP_BED_D_SYS_ORG foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_VIS_INP_BED_DAY_FACT add constraint FK_VIS_INP_BED_D_SYS_DEPT foreign key (ID_TNT, ID_ORG, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);

create index IDX_VIS_INP_BED_D_FACT_DEPT on RHN_VIS_INP_BED_DAY_FACT (ID_TNT, ID_DEPT, DA_BUSINESS);

comment on column RHN_VIS_INP_BED_DAY_FACT.ID_ORG is '机构标识';
comment on column RHN_VIS_INP_BED_DAY_FACT.ID_DEPT is '科室标识';

-- -------------------------------------------------------------------
-- 10. RHN_SC_QUEUE_TICKET: 增加叫号小票所属机构与科室
-- -------------------------------------------------------------------
alter table RHN_SC_QUEUE_TICKET add column ID_ORG bigint;
alter table RHN_SC_QUEUE_TICKET add column ID_DEPT bigint;

update RHN_SC_QUEUE_TICKET q
set ID_ORG = (select s.ID_ORG from RHN_SC_SVC_QUEUE s where s.ID_TNT = q.ID_TNT and s.ID_SVC_QUEUE = q.ID_SVC_QUEUE),
    ID_DEPT = (select s.ID_DEPT from RHN_SC_SVC_QUEUE s where s.ID_TNT = q.ID_TNT and s.ID_SVC_QUEUE = q.ID_SVC_QUEUE)
where q.ID_ORG is null or q.ID_DEPT is null;

update RHN_SC_QUEUE_TICKET q
set ID_ORG = coalesce(q.ID_ORG, (select min(o.ID_ORG) from RHN_SYS_ORG o where o.ID_TNT = q.ID_TNT)),
    ID_DEPT = coalesce(q.ID_DEPT, (select min(d.ID_DEPT) from RHN_SYS_DEPT d where d.ID_TNT = q.ID_TNT))
where q.ID_ORG is null or q.ID_DEPT is null;

alter table RHN_SC_QUEUE_TICKET alter column ID_ORG set not null;
alter table RHN_SC_QUEUE_TICKET alter column ID_DEPT set not null;

alter table RHN_SC_QUEUE_TICKET add constraint FK_SC_QUEUE_TICK_SYS_ORG foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_SC_QUEUE_TICKET add constraint FK_SC_QUEUE_TICK_SYS_DEPT foreign key (ID_TNT, ID_ORG, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);

create index IDX_SC_QUEUE_TICK_DEPT_DATE on RHN_SC_QUEUE_TICKET (ID_TNT, ID_DEPT, DA_BUSINESS);

comment on column RHN_SC_QUEUE_TICKET.ID_ORG is '机构标识';
comment on column RHN_SC_QUEUE_TICKET.ID_DEPT is '科室标识';

-- -------------------------------------------------------------------
-- 11. RHN_VIS_OBS & RHN_VIS_ALLERGY_INTOL: 增加机构与科室
-- -------------------------------------------------------------------
-- 11.1 RHN_VIS_OBS
alter table RHN_VIS_OBS add column ID_ORG bigint;
alter table RHN_VIS_OBS add column ID_DEPT bigint;

update RHN_VIS_OBS o
set ID_ORG = (select e.ID_ORG from RHN_VIS_ENC e where e.ID_TNT = o.ID_TNT and e.ID_ENC = o.ID_ENC),
    ID_DEPT = (select e.ID_DEPT from RHN_VIS_ENC e where e.ID_TNT = o.ID_TNT and e.ID_ENC = o.ID_ENC)
where o.ID_ENC is not null and (o.ID_ORG is null or o.ID_DEPT is null);

update RHN_VIS_OBS o
set ID_ORG = coalesce(o.ID_ORG, (select min(x.ID_ORG) from RHN_SYS_ORG x where x.ID_TNT = o.ID_TNT)),
    ID_DEPT = coalesce(o.ID_DEPT, (select min(d.ID_DEPT) from RHN_SYS_DEPT d where d.ID_TNT = o.ID_TNT))
where o.ID_ORG is null or o.ID_DEPT is null;

alter table RHN_VIS_OBS alter column ID_ORG set not null;
alter table RHN_VIS_OBS alter column ID_DEPT set not null;

alter table RHN_VIS_OBS add constraint FK_VIS_OBS_SYS_ORG foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_VIS_OBS add constraint FK_VIS_OBS_SYS_DEPT foreign key (ID_TNT, ID_ORG, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);

create index IDX_VIS_OBS_DEPT_EFF on RHN_VIS_OBS (ID_TNT, ID_DEPT, DT_EFFECTIVE);

comment on column RHN_VIS_OBS.ID_ORG is '机构标识';
comment on column RHN_VIS_OBS.ID_DEPT is '科室标识';

-- 11.2 RHN_VIS_ALLERGY_INTOL
alter table RHN_VIS_ALLERGY_INTOL add column ID_ORG bigint;
alter table RHN_VIS_ALLERGY_INTOL add column ID_DEPT bigint;

update RHN_VIS_ALLERGY_INTOL a
set ID_ORG = (select e.ID_ORG from RHN_VIS_ENC e where e.ID_TNT = a.ID_TNT and e.ID_ENC = a.ID_ENC),
    ID_DEPT = (select e.ID_DEPT from RHN_VIS_ENC e where e.ID_TNT = a.ID_TNT and e.ID_ENC = a.ID_ENC)
where a.ID_ENC is not null and (a.ID_ORG is null or a.ID_DEPT is null);

update RHN_VIS_ALLERGY_INTOL a
set ID_ORG = coalesce(a.ID_ORG, (select min(x.ID_ORG) from RHN_SYS_ORG x where x.ID_TNT = a.ID_TNT)),
    ID_DEPT = coalesce(a.ID_DEPT, (select min(d.ID_DEPT) from RHN_SYS_DEPT d where d.ID_TNT = a.ID_TNT))
where a.ID_ORG is null or a.ID_DEPT is null;

alter table RHN_VIS_ALLERGY_INTOL alter column ID_ORG set not null;
alter table RHN_VIS_ALLERGY_INTOL alter column ID_DEPT set not null;

alter table RHN_VIS_ALLERGY_INTOL add constraint FK_VIS_ALLERGY_IN_SYS_ORG foreign key (ID_TNT, ID_ORG) references RHN_SYS_ORG(ID_TNT, ID_ORG);
alter table RHN_VIS_ALLERGY_INTOL add constraint FK_VIS_ALLERGY_IN_SYS_DEPT foreign key (ID_TNT, ID_ORG, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);

create index IDX_VIS_ALLERGY_IN_DEPT_REC on RHN_VIS_ALLERGY_INTOL (ID_TNT, ID_DEPT, DT_RECORDED);

comment on column RHN_VIS_ALLERGY_INTOL.ID_ORG is '机构标识';
comment on column RHN_VIS_ALLERGY_INTOL.ID_DEPT is '科室标识';

-- -------------------------------------------------------------------
-- 12. RHN_SUP_STOCK_COUNT & RHN_SUP_STOCK_XFER: 物资盘点与调拨增加科室
-- -------------------------------------------------------------------
-- 12.1 RHN_SUP_STOCK_COUNT
alter table RHN_SUP_STOCK_COUNT add column ID_DEPT bigint;

update RHN_SUP_STOCK_COUNT c
set ID_DEPT = (select s.ID_DEPT from RHN_SUP_STOCK_SITE s where s.ID_TNT = c.ID_TNT and s.ID_STOCK_SITE = c.ID_STOCK_SITE)
where c.ID_DEPT is null;

update RHN_SUP_STOCK_COUNT c
set ID_DEPT = coalesce(c.ID_DEPT, (select min(d.ID_DEPT) from RHN_SYS_DEPT d where d.ID_TNT = c.ID_TNT and d.ID_ORG = c.ID_ORG))
where c.ID_DEPT is null;

update RHN_SUP_STOCK_COUNT c
set ID_DEPT = coalesce(c.ID_DEPT, (select min(d.ID_DEPT) from RHN_SYS_DEPT d where d.ID_TNT = c.ID_TNT))
where c.ID_DEPT is null;

alter table RHN_SUP_STOCK_COUNT alter column ID_DEPT set not null;

alter table RHN_SUP_STOCK_COUNT add constraint FK_SUP_STOCK_COU_SYS_DEPT foreign key (ID_TNT, ID_ORG, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);

create index IDX_SUP_STOCK_COU_DEPT_POST on RHN_SUP_STOCK_COUNT (ID_TNT, ID_DEPT, DT_POSTED);

comment on column RHN_SUP_STOCK_COUNT.ID_DEPT is '科室标识';

-- 12.2 RHN_SUP_STOCK_XFER
alter table RHN_SUP_STOCK_XFER add column ID_DEPT_SRC bigint;
alter table RHN_SUP_STOCK_XFER add column ID_DEPT_DEST bigint;

update RHN_SUP_STOCK_XFER x
set ID_DEPT_SRC = (select s.ID_DEPT from RHN_SUP_STOCK_SITE s where s.ID_TNT = x.ID_TNT and s.ID_STOCK_SITE = x.ID_STOCK_SITE_SRC),
    ID_DEPT_DEST = (select s.ID_DEPT from RHN_SUP_STOCK_SITE s where s.ID_TNT = x.ID_TNT and s.ID_STOCK_SITE = x.ID_STOCK_SITE_DESTINATION)
where x.ID_DEPT_SRC is null or x.ID_DEPT_DEST is null;

update RHN_SUP_STOCK_XFER x
set ID_DEPT_SRC = coalesce(x.ID_DEPT_SRC, (select min(d.ID_DEPT) from RHN_SYS_DEPT d where d.ID_TNT = x.ID_TNT and d.ID_ORG = x.ID_ORG)),
    ID_DEPT_DEST = coalesce(x.ID_DEPT_DEST, (select min(d.ID_DEPT) from RHN_SYS_DEPT d where d.ID_TNT = x.ID_TNT and d.ID_ORG = x.ID_ORG))
where x.ID_DEPT_SRC is null or x.ID_DEPT_DEST is null;

update RHN_SUP_STOCK_XFER x
set ID_DEPT_SRC = coalesce(x.ID_DEPT_SRC, (select min(d.ID_DEPT) from RHN_SYS_DEPT d where d.ID_TNT = x.ID_TNT)),
    ID_DEPT_DEST = coalesce(x.ID_DEPT_DEST, (select min(d.ID_DEPT) from RHN_SYS_DEPT d where d.ID_TNT = x.ID_TNT))
where x.ID_DEPT_SRC is null or x.ID_DEPT_DEST is null;

alter table RHN_SUP_STOCK_XFER alter column ID_DEPT_SRC set not null;
alter table RHN_SUP_STOCK_XFER alter column ID_DEPT_DEST set not null;

alter table RHN_SUP_STOCK_XFER add constraint FK_SUP_STOCK_XFE_DEPT_SRC foreign key (ID_TNT, ID_ORG, ID_DEPT_SRC) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_SUP_STOCK_XFER add constraint FK_SUP_STOCK_XFE_DEPT_DEST foreign key (ID_TNT, ID_ORG, ID_DEPT_DEST) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);

create index IDX_SUP_STOCK_XFE_DEPT_SRC on RHN_SUP_STOCK_XFER (ID_TNT, ID_DEPT_SRC, DT_REQUESTED);
create index IDX_SUP_STOCK_XFE_DEPT_DEST on RHN_SUP_STOCK_XFER (ID_TNT, ID_DEPT_DEST, DT_REQUESTED);

comment on column RHN_SUP_STOCK_XFER.ID_DEPT_SRC is '调出科室标识';
comment on column RHN_SUP_STOCK_XFER.ID_DEPT_DEST is '调入科室标识';
