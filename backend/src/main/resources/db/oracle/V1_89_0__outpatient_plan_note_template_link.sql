alter table RHN_META_OP_PLAN_TMPL add (ID_OP_NOTE_TMPL number(19,0));

alter table RHN_META_OP_PLAN_TMPL
    add constraint FK_META_OP_PLAN_NOTE_TMPL
    foreign key (ID_TNT, ID_OP_NOTE_TMPL)
    references RHN_META_OP_NOTE_TMPL (ID_TNT, ID_OP_NOTE_TMPL);

comment on column RHN_META_OP_PLAN_TMPL.ID_OP_NOTE_TMPL is '诊疗方案可选关联的门诊病历模板主键';
