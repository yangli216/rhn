-- Older Oracle installations retain the unabbreviated column name. Rename it
-- without rewriting the CLOB, while allowing fresh baselines already using it.
declare
    old_column_count number;
    new_column_count number;
begin
    select count(*) into old_column_count from user_tab_columns
    where table_name = 'RHN_META_OP_PLAN_TMPL' and column_name = 'JSON_GUIDELINE_REF';
    select count(*) into new_column_count from user_tab_columns
    where table_name = 'RHN_META_OP_PLAN_TMPL' and column_name = 'JSON_GDLN_REF';

    if old_column_count = 1 and new_column_count = 0 then
        execute immediate 'alter table RHN_META_OP_PLAN_TMPL rename column JSON_GUIDELINE_REF to JSON_GDLN_REF';
    elsif old_column_count <> 0 or new_column_count <> 1 then
        raise_application_error(-20001, 'Unexpected outpatient plan guideline columns; manual schema reconciliation required');
    end if;
end;
/

comment on column RHN_META_OP_PLAN_TMPL.JSON_GDLN_REF is '指南与专家共识出处元数据JSON';
