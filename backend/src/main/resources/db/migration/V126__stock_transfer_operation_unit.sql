alter table stock_transfer_lines add column requested_operation_quantity decimal(28,8);
alter table stock_transfer_lines add column operation_unit_code varchar(64);
alter table stock_transfer_lines add column base_quantity_factor decimal(28,8);

update stock_transfer_lines
set requested_operation_quantity = requested_quantity,
    operation_unit_code = base_unit_code,
    base_quantity_factor = 1;

alter table stock_transfer_lines alter column requested_operation_quantity set not null;
alter table stock_transfer_lines alter column operation_unit_code set not null;
alter table stock_transfer_lines alter column base_quantity_factor set not null;

alter table stock_transfer_lines add constraint ck_transfer_line_operation
    check (requested_operation_quantity > 0 and base_quantity_factor > 0
        and requested_quantity = requested_operation_quantity * base_quantity_factor);
