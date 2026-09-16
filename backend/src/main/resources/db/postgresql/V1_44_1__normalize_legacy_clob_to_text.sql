-- The temporary compatibility domain lets historical migrations run unchanged.
-- Normalize it to native text so JDBC/Hibernate see a standard text column.
do $$
declare
    legacy_column record;
begin
    for legacy_column in
        select table_schema, table_name, column_name
        from information_schema.columns
        where domain_schema = current_schema() and domain_name = 'clob'
    loop
        execute format('alter table %I.%I alter column %I type text',
            legacy_column.table_schema, legacy_column.table_name, legacy_column.column_name);
    end loop;
end $$;
drop domain clob;
