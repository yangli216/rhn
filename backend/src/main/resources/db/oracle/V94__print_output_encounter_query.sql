create index idx_print_output_encounter
    on print_outputs (tenant_id, encounter_id, generated_at);
