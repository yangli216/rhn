package com.rhn.inpatient.application;

import com.rhn.pharmacy.api.WardMedicationSupplyCandidateDirectory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Types;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

/** Supplies pharmacy with a validated, read-only view of concrete inpatient medication occurrences. */
@Service
public class JpaWardMedicationSupplyCandidateDirectory implements WardMedicationSupplyCandidateDirectory {
    private final NamedParameterJdbcTemplate jdbc;

    public JpaWardMedicationSupplyCandidateDirectory(JdbcTemplate jdbcTemplate) {
        this.jdbc = new NamedParameterJdbcTemplate(jdbcTemplate);
    }

    @Override
    @Transactional(readOnly = true)
    public List<SupplyCandidate> eligibleOccurrences(Long tenantId, Long organizationId,
                                                     Long nursingUnitDepartmentId,
                                                     String medicationTypeSnapshot,
                                                     Instant windowFrom, Instant windowTo) {
        if (windowFrom == null || windowTo == null || !windowFrom.isBefore(windowTo)) return List.of();
        String medicationType = normalizeOptional(medicationTypeSnapshot);
        MapSqlParameterSource parameters = new MapSqlParameterSource()
                .addValue("tenantId", tenantId)
                .addValue("organizationId", organizationId)
                .addValue("departmentId", nursingUnitDepartmentId)
                .addValue("windowFrom", windowFrom.atOffset(ZoneOffset.UTC), Types.TIMESTAMP_WITH_TIMEZONE)
                .addValue("windowTo", windowTo.atOffset(ZoneOffset.UTC), Types.TIMESTAMP_WITH_TIMEZONE);
        if (medicationType != null) parameters.addValue("medicationType", medicationType, Types.VARCHAR);
        String medicationTypePredicate = medicationType == null ? ""
                : "and medication.medication_type_snapshot = :medicationType";
        return jdbc.query("""
                select task.id as order_task_id,
                       request.id as request_id,
                       episode.id as episode_id,
                       encounter.id as encounter_id,
                       episode.resident_id as resident_id,
                       resident.full_name as resident_name,
                       episode.organization_id as organization_id,
                       encounter.department_id as department_id,
                       detail.bed_no_snapshot as bed_no,
                       task.scheduled_at as scheduled_at,
                       workflow.medication_quantity_per_occurrence as required_quantity,
                       workflow.medication_quantity_unit as quantity_unit,
                       workflow.medication_base_quantity_per_occurrence as required_base_quantity,
                       workflow.medication_base_unit as base_unit,
                       medication.medication_id as medication_id,
                       medication.medication_code_snapshot as medication_code,
                       medication.medication_name_snapshot as medication_name,
                       medication.medication_type_snapshot as medication_type,
                       medication.self_provided as self_provided
                  from inpatient_order_tasks task
                  join inpatient_order_workflows workflow
                    on workflow.tenant_id = task.tenant_id and workflow.request_id = task.request_id
                  join care_requests request
                    on request.tenant_id = task.tenant_id and request.id = task.request_id
                  join care_episodes episode
                    on episode.tenant_id = task.tenant_id and episode.id = workflow.episode_id
                  join encounters encounter
                    on encounter.tenant_id = task.tenant_id and encounter.episode_id = episode.id
                   and encounter.id = request.encounter_id
                  join inpatient_episode_details detail
                    on detail.tenant_id = task.tenant_id and detail.episode_id = episode.id
                  join medication_requests medication
                    on medication.tenant_id = task.tenant_id and medication.request_id = request.id
                  join residents resident
                    on resident.tenant_id = task.tenant_id and resident.id = episode.resident_id
                 where task.tenant_id = :tenantId
                   and task.status = 'PLANNED'
                   and task.scheduled_at >= :windowFrom and task.scheduled_at < :windowTo
                   and workflow.workflow_status = 'ACTIVE'
                   and workflow.medication_quantity_per_occurrence > 0
                   and workflow.medication_base_quantity_per_occurrence > 0
                   and request.status = 'ACTIVE' and request.request_kind = 'MEDICATION'
                   and request.resident_id = episode.resident_id
                   %s
                   and episode.status = 'ADMITTED' and episode.organization_id = :organizationId
                   and encounter.status = 'IN_PROGRESS' and encounter.organization_id = :organizationId
                   and encounter.department_id = :departmentId
                   and resident.status = 'ACTIVE'
                   and not exists (
                       select 1 from inpatient_med_supply_tasks supplied
                        where supplied.tenant_id = task.tenant_id
                          and supplied.order_task_id = task.id
                          and supplied.status = 'ACTIVE'
                   )
                   and not exists (
                       select 1 from dispense_task_lines dispensed
                        where dispensed.tenant_id = request.tenant_id
                          and dispensed.fulfillment_source_type = 'MEDICATION_REQUEST'
                          and dispensed.fulfillment_source_id = request.id
                          and dispensed.status <> 'CANCELLED'
                   )
                 order by task.scheduled_at, task.id
                """.formatted(medicationTypePredicate), parameters, (result, row) -> {
            if (result.getBoolean("self_provided")) return null;
            OffsetDateTime scheduledAt = result.getObject("scheduled_at", OffsetDateTime.class);
            return new SupplyCandidate(
                    result.getLong("order_task_id"), result.getLong("request_id"),
                    result.getLong("episode_id"), result.getLong("encounter_id"),
                    result.getLong("resident_id"), result.getString("resident_name"),
                    result.getLong("organization_id"), result.getLong("department_id"),
                    result.getString("bed_no"), scheduledAt.toInstant(),
                    result.getBigDecimal("required_quantity"), result.getString("quantity_unit"),
                    result.getBigDecimal("required_base_quantity"), result.getString("base_unit"),
                    result.getLong("medication_id"), result.getString("medication_code"),
                    result.getString("medication_name"), result.getString("medication_type"));
        }).stream().filter(value -> value != null).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<SupplyScope> discoverEligibleScopes(Instant windowFrom, Instant windowTo) {
        if (windowFrom == null || windowTo == null || !windowFrom.isBefore(windowTo)) return List.of();
        MapSqlParameterSource parameters = new MapSqlParameterSource()
                .addValue("windowFrom", windowFrom.atOffset(ZoneOffset.UTC), Types.TIMESTAMP_WITH_TIMEZONE)
                .addValue("windowTo", windowTo.atOffset(ZoneOffset.UTC), Types.TIMESTAMP_WITH_TIMEZONE);
        return jdbc.query("""
                select task.tenant_id as tenant_id,
                       episode.organization_id as organization_id,
                       encounter.department_id as department_id,
                       medication.medication_type_snapshot as medication_type,
                       medication.self_provided as self_provided,
                       min(task.scheduled_at) as earliest_scheduled_at
                  from inpatient_order_tasks task
                  join inpatient_order_workflows workflow
                    on workflow.tenant_id = task.tenant_id and workflow.request_id = task.request_id
                  join care_requests request
                    on request.tenant_id = task.tenant_id and request.id = task.request_id
                  join care_episodes episode
                    on episode.tenant_id = task.tenant_id and episode.id = workflow.episode_id
                  join encounters encounter
                    on encounter.tenant_id = task.tenant_id and encounter.episode_id = episode.id
                   and encounter.id = request.encounter_id
                  join inpatient_episode_details detail
                    on detail.tenant_id = task.tenant_id and detail.episode_id = episode.id
                  join medication_requests medication
                    on medication.tenant_id = task.tenant_id and medication.request_id = request.id
                  join residents resident
                    on resident.tenant_id = task.tenant_id and resident.id = episode.resident_id
                 where task.status = 'PLANNED'
                   and task.scheduled_at >= :windowFrom and task.scheduled_at < :windowTo
                   and workflow.workflow_status = 'ACTIVE'
                   and workflow.medication_quantity_per_occurrence > 0
                   and workflow.medication_base_quantity_per_occurrence > 0
                   and request.status = 'ACTIVE' and request.request_kind = 'MEDICATION'
                   and request.resident_id = episode.resident_id
                   and episode.status = 'ADMITTED'
                   and encounter.status = 'IN_PROGRESS'
                   and encounter.organization_id = episode.organization_id
                   and resident.status = 'ACTIVE'
                   and not exists (
                       select 1 from inpatient_med_supply_tasks supplied
                        where supplied.tenant_id = task.tenant_id
                          and supplied.order_task_id = task.id
                          and supplied.status = 'ACTIVE'
                   )
                   and not exists (
                       select 1 from dispense_task_lines dispensed
                        where dispensed.tenant_id = request.tenant_id
                          and dispensed.fulfillment_source_type = 'MEDICATION_REQUEST'
                          and dispensed.fulfillment_source_id = request.id
                          and dispensed.status <> 'CANCELLED'
                   )
                 group by task.tenant_id, episode.organization_id, encounter.department_id,
                          medication.medication_type_snapshot, medication.self_provided
                 order by earliest_scheduled_at, task.tenant_id, episode.organization_id,
                          encounter.department_id, medication.medication_type_snapshot
                """, parameters, (result, row) -> {
            if (result.getBoolean("self_provided")) return null;
            OffsetDateTime scheduledAt = result.getObject("earliest_scheduled_at", OffsetDateTime.class);
            return new SupplyScope(result.getLong("tenant_id"), result.getLong("organization_id"),
                    result.getLong("department_id"), result.getString("medication_type"),
                    scheduledAt.toInstant());
        }).stream().filter(value -> value != null).toList();
    }

    private String normalizeOptional(String value) {
        if (value == null) return null;
        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }
}
