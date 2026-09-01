alter table stock_transfer_lines add (
    requested_operation_quantity number(28,8),
    operation_unit_code varchar2(64 char),
    base_quantity_factor number(28,8)
);

update stock_transfer_lines
set requested_operation_quantity = requested_quantity,
    operation_unit_code = base_unit_code,
    base_quantity_factor = 1;

alter table stock_transfer_lines modify (
    requested_operation_quantity not null,
    operation_unit_code not null,
    base_quantity_factor not null
);

alter table stock_transfer_lines add constraint ck_transfer_line_operation
    check (requested_operation_quantity > 0 and base_quantity_factor > 0
        and requested_quantity = requested_operation_quantity * base_quantity_factor);
