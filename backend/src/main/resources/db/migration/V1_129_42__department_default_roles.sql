-- Department default roles: roles granted automatically when a practitioner with a login account takes up an
-- assignment in the department. Grants created this way record their source and originating staff assignment so
-- that ending, voiding or transferring the assignment ends only these grants; manual grants are never touched.

create table RHN_SYS_DEPT_DFLT_ROLE (
    ID_DEPT_DFLT_ROLE bigint,
    ID_TNT bigint not null,
    ID_ORG bigint not null,
    ID_DEPT bigint not null,
    ID_ACC_ROLE bigint not null,
    DT_CREATED timestamp with time zone not null,
    ID_USER_CREATED bigint,
    constraint PK_SYS_DEPT_DFLT_ROLE_PK primary key (ID_DEPT_DFLT_ROLE),
    constraint UK_SYS_DEPT_DFLT_ROLE unique (ID_TNT, ID_DEPT, ID_ACC_ROLE)
);
alter table RHN_SYS_DEPT_DFLT_ROLE add constraint FK_SYS_DEPT_DFLT_ROLE_DEPT foreign key (ID_TNT, ID_ORG, ID_DEPT) references RHN_SYS_DEPT(ID_TNT, ID_ORG, ID_DEPT);
alter table RHN_SYS_DEPT_DFLT_ROLE add constraint FK_SYS_DEPT_DFLT_ROLE_ROLE foreign key (ID_TNT, ID_ACC_ROLE) references RHN_SYS_ACC_ROLE(ID_TNT, ID_ACC_ROLE);
comment on table RHN_SYS_DEPT_DFLT_ROLE is '科室默认角色；一行代表一个科室的一个默认角色，人员在该科室任职且已开通账号时自动授予';
comment on column RHN_SYS_DEPT_DFLT_ROLE.ID_DEPT_DFLT_ROLE is '科室默认角色主键';
comment on column RHN_SYS_DEPT_DFLT_ROLE.ID_TNT is '租户标识';
comment on column RHN_SYS_DEPT_DFLT_ROLE.ID_ORG is '机构标识';
comment on column RHN_SYS_DEPT_DFLT_ROLE.ID_DEPT is '科室标识';
comment on column RHN_SYS_DEPT_DFLT_ROLE.ID_ACC_ROLE is '默认授予的角色标识';
comment on column RHN_SYS_DEPT_DFLT_ROLE.DT_CREATED is '创建时间';
comment on column RHN_SYS_DEPT_DFLT_ROLE.ID_USER_CREATED is '创建人标识';

alter table RHN_SYS_USER_ROLE_ASSIGN add column SD_GRANT_SRC varchar(24) default 'MANUAL' not null;
alter table RHN_SYS_USER_ROLE_ASSIGN add column ID_STAFF_ASSIGN bigint;
alter table RHN_SYS_USER_ROLE_ASSIGN add constraint CK_SYS_USER_ROLE_GRANT_SRC check (SD_GRANT_SRC in ('MANUAL', 'DEPT_DEFAULT'));
alter table RHN_SYS_USER_ROLE_ASSIGN add constraint FK_SYS_USER_ROLE_STAFF_ASSIGN foreign key (ID_TNT, ID_STAFF_ASSIGN) references RHN_SYS_STAFF_ASSIGN(ID_TNT, ID_STAFF_ASSIGN);
create index IDX_SYS_USER_ROLE_STAFF_ASSIGN on RHN_SYS_USER_ROLE_ASSIGN (ID_TNT, ID_STAFF_ASSIGN);
create index IDX_SYS_USER_ROLE_ROLE_VALID on RHN_SYS_USER_ROLE_ASSIGN (ID_TNT, ID_ACC_ROLE, DT_VALID_TO);
comment on column RHN_SYS_USER_ROLE_ASSIGN.SD_GRANT_SRC is '授权来源：MANUAL 手工授予，DEPT_DEFAULT 按科室默认角色自动授予';
comment on column RHN_SYS_USER_ROLE_ASSIGN.ID_STAFF_ASSIGN is '自动授权对应的人员任职标识；手工授权为空';
