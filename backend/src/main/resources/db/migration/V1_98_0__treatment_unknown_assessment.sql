-- An unfinished task has no recorded adverse-reaction assessment.
-- Preserve completed assessments; only clear the legacy default on unfinished tasks.
alter table RHN_EX_TREAT_EXEC_TASK alter column FG_ADVERSE_REACT drop default;
alter table RHN_EX_TREAT_EXEC_TASK alter column FG_ADVERSE_REACT drop not null;
update RHN_EX_TREAT_EXEC_TASK set FG_ADVERSE_REACT = null
where DT_CMPLD is null and FG_ADVERSE_REACT = false;
comment on column RHN_EX_TREAT_EXEC_TASK.FG_ADVERSE_REACT is '不良反应评估：空表示未评估，真表示有，假表示无';
