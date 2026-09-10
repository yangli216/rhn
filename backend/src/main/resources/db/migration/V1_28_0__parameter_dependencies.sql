alter table RHN_SYS_PARAM_DEF add CD_DEPENDS_ON_KEY varchar(160);
alter table RHN_SYS_PARAM_DEF add EXPR_DEPENDS_ON_VAL varchar(500);
alter table RHN_SYS_PARAM_DEF add SD_DEPENDENCY_BEHAVIOR varchar(32) default 'DISABLE_AND_SUPPRESS';

comment on column RHN_SYS_PARAM_DEF.CD_DEPENDS_ON_KEY is '依赖的前置参数键';
comment on column RHN_SYS_PARAM_DEF.EXPR_DEPENDS_ON_VAL is '满足依赖时的期望值匹配表达式';
comment on column RHN_SYS_PARAM_DEF.SD_DEPENDENCY_BEHAVIOR is '未满足依赖时的行为策略：DISABLE_AND_SUPPRESS 或 HIDE';
