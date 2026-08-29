alter table health_events alter column payload_json clob;
alter table configuration_definitions alter column default_value_json clob;
alter table configuration_revisions alter column value_json clob;
alter table outbox_events alter column payload_json clob;

alter table resident_source_records alter column raw_payload_json clob;
alter table resident_match_candidates alter column reasons_json clob;
alter table resident_merge_history alter column moved_identifier_ids clob;
alter table resident_merge_history alter column moved_source_record_ids clob;
alter table resident_split_history alter column restored_identifier_ids clob;

alter table clinical_document_versions alter column content_json clob;
alter table idempotency_records alter column response_json clob;

alter table cryptographic_evidence alter column statement_json clob;
alter table cryptographic_evidence alter column signature_value clob;
alter table cryptographic_evidence alter column verification_material clob;
alter table cryptographic_evidence alter column timestamp_token clob;

alter table dictionary_changes alter column before_json clob;
alter table dictionary_changes alter column after_json clob;

alter table parameter_definitions alter column json_schema clob;
alter table parameter_definitions alter column default_value_json clob;
alter table parameter_definitions alter column example_value_json clob;
alter table parameter_definitions alter column scope_json clob;
alter table parameter_values alter column value_json clob;
alter table parameter_changes alter column before_json clob;
alter table parameter_changes alter column after_json clob;
