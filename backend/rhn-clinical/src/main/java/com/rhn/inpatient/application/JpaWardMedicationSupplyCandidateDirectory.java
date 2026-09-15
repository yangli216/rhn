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
                : "and medication.SD_MED_TYPE_SNAP = :medicationType";
        return jdbc.query("""
                select task.ID_INP_ORDER_TASK as order_task_id,
                       request.ID_CARE_REQ as request_id,
                       episode.ID_CARE_EPISODE as episode_id,
                       encounter.ID_ENC as encounter_id,
                       episode.ID_PAT as resident_id,
                       resident.NA_FULL as resident_name,
                       episode.ID_ORG as organization_id,
                       encounter.ID_DEPT as department_id,
                       detail.CD_BED_SNAP as bed_no,
                       task.DT_SCHEDULED as scheduled_at,
                       workflow.QTY_MED_PER_OCC as required_quantity,
                       workflow.MEDICATION_QUANTITY_UNIT as quantity_unit,
                       workflow.QTY_MED_BASE_PER_OCC as required_base_quantity,
                       workflow.MEDICATION_BASE_UNIT as base_unit,
                       medication.ID_MED as medication_id,
                       medication.CD_MED_SNAP as medication_code,
                       medication.NA_MED_SNAP as medication_name,
                       medication.SD_MED_TYPE_SNAP as medication_type,
                       medication.FG_SELF_PROVIDED as self_provided from RHN_EX_INP_ORDER_TASK task
                  join RHN_EX_INP_ORDER_WF workflow
                    on workflow.ID_TNT = task.ID_TNT and workflow.ID_CARE_REQ = task.ID_CARE_REQ
                  join RHN_EX_CARE_REQ request
                    on request.ID_TNT = task.ID_TNT and request.ID_CARE_REQ = task.ID_CARE_REQ
                  join RHN_VIS_CARE_EPISODE episode
                    on episode.ID_TNT = task.ID_TNT and episode.ID_CARE_EPISODE = workflow.ID_CARE_EPISODE
                  join RHN_VIS_ENC encounter
                    on encounter.ID_TNT = task.ID_TNT and encounter.ID_CARE_EPISODE = episode.ID_CARE_EPISODE
                   and encounter.ID_ENC = request.ID_ENC
                  join RHN_VIS_INP_EPISODE_DETAIL detail
                    on detail.ID_TNT = task.ID_TNT and detail.ID_CARE_EPISODE = episode.ID_CARE_EPISODE
                  join RHN_EX_MED_REQ medication
                    on medication.ID_TNT = task.ID_TNT and medication.ID_CARE_REQ = request.ID_CARE_REQ
                  join RHN_PI_PAT resident
                    on resident.ID_TNT = task.ID_TNT and resident.ID_PAT = episode.ID_PAT
                 where task.ID_TNT = :tenantId
                   and task.SD_STATUS = 'PLANNED'
                   and task.DT_SCHEDULED >= :windowFrom and task.DT_SCHEDULED < :windowTo
                   and workflow.SD_WF_STATUS = 'ACTIVE'
                   and workflow.QTY_MED_PER_OCC > 0
                   and workflow.QTY_MED_BASE_PER_OCC > 0
                   and request.SD_STATUS = 'ACTIVE' and request.SD_REQ_KIND = 'MEDICATION'
                   and request.ID_PAT = episode.ID_PAT
                   %s
                   and episode.SD_STATUS = 'ADMITTED' and episode.ID_ORG = :organizationId
                   and encounter.SD_STATUS = 'IN_PROGRESS' and encounter.ID_ORG = :organizationId
                   and encounter.ID_DEPT = :departmentId
                   and resident.SD_STATUS = 'ACTIVE'
                   and not exists (
                       select 1 from RHN_SUP_INP_MED_SUPPLY_TASK supplied
                        where supplied.ID_TNT = task.ID_TNT
                          and supplied.ID_INP_ORDER_TASK = task.ID_INP_ORDER_TASK
                          and supplied.SD_STATUS = 'ACTIVE'
                   )
                   and not exists (
                       select 1 from RHN_SUP_DISP_TASK_LINE dispensed
                        where dispensed.ID_TNT = request.ID_TNT
                          and dispensed.SD_FULFILL_SRC_TYPE = 'MEDICATION_REQUEST'
                          and dispensed.ID_FULFILL_SRC = request.ID_CARE_REQ
                          and dispensed.SD_STATUS <> 'CANCELLED'
                   )
                 order by task.DT_SCHEDULED, task.ID_INP_ORDER_TASK
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
                select task.ID_TNT as tenant_id,
                       episode.ID_ORG as organization_id,
                       encounter.ID_DEPT as department_id,
                       medication.SD_MED_TYPE_SNAP as medication_type,
                       medication.FG_SELF_PROVIDED as self_provided,
                       min(task.DT_SCHEDULED) as earliest_scheduled_at from RHN_EX_INP_ORDER_TASK task
                  join RHN_EX_INP_ORDER_WF workflow
                    on workflow.ID_TNT = task.ID_TNT and workflow.ID_CARE_REQ = task.ID_CARE_REQ
                  join RHN_EX_CARE_REQ request
                    on request.ID_TNT = task.ID_TNT and request.ID_CARE_REQ = task.ID_CARE_REQ
                  join RHN_VIS_CARE_EPISODE episode
                    on episode.ID_TNT = task.ID_TNT and episode.ID_CARE_EPISODE = workflow.ID_CARE_EPISODE
                  join RHN_VIS_ENC encounter
                    on encounter.ID_TNT = task.ID_TNT and encounter.ID_CARE_EPISODE = episode.ID_CARE_EPISODE
                   and encounter.ID_ENC = request.ID_ENC
                  join RHN_VIS_INP_EPISODE_DETAIL detail
                    on detail.ID_TNT = task.ID_TNT and detail.ID_CARE_EPISODE = episode.ID_CARE_EPISODE
                  join RHN_EX_MED_REQ medication
                    on medication.ID_TNT = task.ID_TNT and medication.ID_CARE_REQ = request.ID_CARE_REQ
                  join RHN_PI_PAT resident
                    on resident.ID_TNT = task.ID_TNT and resident.ID_PAT = episode.ID_PAT
                 where task.SD_STATUS = 'PLANNED'
                   and task.DT_SCHEDULED >= :windowFrom and task.DT_SCHEDULED < :windowTo
                   and workflow.SD_WF_STATUS = 'ACTIVE'
                   and workflow.QTY_MED_PER_OCC > 0
                   and workflow.QTY_MED_BASE_PER_OCC > 0
                   and request.SD_STATUS = 'ACTIVE' and request.SD_REQ_KIND = 'MEDICATION'
                   and request.ID_PAT = episode.ID_PAT
                   and episode.SD_STATUS = 'ADMITTED'
                   and encounter.SD_STATUS = 'IN_PROGRESS'
                   and encounter.ID_ORG = episode.ID_ORG
                   and resident.SD_STATUS = 'ACTIVE'
                   and not exists (
                       select 1 from RHN_SUP_INP_MED_SUPPLY_TASK supplied
                        where supplied.ID_TNT = task.ID_TNT
                          and supplied.ID_INP_ORDER_TASK = task.ID_INP_ORDER_TASK
                          and supplied.SD_STATUS = 'ACTIVE'
                   )
                   and not exists (
                       select 1 from RHN_SUP_DISP_TASK_LINE dispensed
                        where dispensed.ID_TNT = request.ID_TNT
                          and dispensed.SD_FULFILL_SRC_TYPE = 'MEDICATION_REQUEST'
                          and dispensed.ID_FULFILL_SRC = request.ID_CARE_REQ
                          and dispensed.SD_STATUS <> 'CANCELLED'
                   )
                 group by task.ID_TNT, episode.ID_ORG, encounter.ID_DEPT,
                          medication.SD_MED_TYPE_SNAP, medication.FG_SELF_PROVIDED
                 order by earliest_scheduled_at, task.ID_TNT, episode.ID_ORG,
                          encounter.ID_DEPT, medication.SD_MED_TYPE_SNAP
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
