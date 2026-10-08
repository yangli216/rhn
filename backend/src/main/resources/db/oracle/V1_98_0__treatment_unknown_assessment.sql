-- Preserve completed assessments; clear only the old unfinished-task default.
alter table RHN_EX_TREAT_EXEC_TASK modify (FG_ADVERSE_REACT default null null);
update RHN_EX_TREAT_EXEC_TASK set FG_ADVERSE_REACT = null
where DT_CMPLD is null and FG_ADVERSE_REACT = 0;
comment on column RHN_EX_TREAT_EXEC_TASK.FG_ADVERSE_REACT is '不良反应评估：空表示未评估，真表示有，假表示无';
