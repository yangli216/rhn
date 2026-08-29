alter table item_type_attributes drop constraint uk_item_type_attribute_order;

create index idx_item_type_attribute_order
    on item_type_attributes (item_type_id, group_sort_order, attribute_sort_order);
