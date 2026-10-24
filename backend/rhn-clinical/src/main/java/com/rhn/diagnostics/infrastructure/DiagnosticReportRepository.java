package com.rhn.diagnostics.infrastructure;

import com.rhn.diagnostics.domain.DiagnosticReport;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Collection;
import java.util.Optional;

public interface DiagnosticReportRepository extends JpaRepository<DiagnosticReport, Long> {
    List<DiagnosticReport> findByTenantIdAndRequestIdInOrderByReceivedAtDescIdDesc(Long tenantId, Collection<Long> requestIds);
    Optional<DiagnosticReport> findTopByTenantIdAndRequestIdOrderByReceivedAtDescIdDesc(Long tenantId, Long requestId);
    Optional<DiagnosticReport> findByIdAndTenantId(Long id, Long tenantId);
    Optional<DiagnosticReport> findTopByTenantIdAndEndpointCodeAndExternalReportIdOrderByReportVersionDesc(
            Long tenantId, String endpointCode, String externalReportId);
    List<DiagnosticReport> findByTenantIdAndEncounterIdOrderByIssuedAtDescReportVersionDesc(Long tenantId, Long encounterId);
    List<DiagnosticReport> findByTenantIdAndRequestIdOrderByReportVersionDesc(Long tenantId, Long requestId);
    @org.springframework.data.jpa.repository.Query(value = """
            select new com.rhn.diagnostics.api.DiagnosticReportQueryRow(
              report.id, task.id, report.residentId, task.residentNameSnapshot, task.healthRecordNoSnapshot,
              report.encounterId, report.requestId, task.requestNoSnapshot, task.itemCodeSnapshot, task.itemNameSnapshot,
              task.specimenNo, report.reportCode, report.reportName, report.reportVersion, report.replacesReportId,
              report.reportType, report.status, report.issuedAt, report.signerName,
              case when exists (select newer.id from DiagnosticReport newer
                where newer.tenantId = report.tenantId and newer.organizationId = report.organizationId
                  and newer.departmentId = report.departmentId and newer.requestId = report.requestId
                  and newer.residentId = report.residentId and newer.encounterId = report.encounterId
                  and newer.reportType = report.reportType
                  and (newer.receivedAt > report.receivedAt or (newer.receivedAt = report.receivedAt and newer.id > report.id)))
                then false else true end)
            from DiagnosticReport report
            left join DiagnosticExecutionTask task on task.tenantId = report.tenantId and task.requestId = report.requestId
              and task.organizationId = report.organizationId and task.departmentId = report.departmentId
              and task.residentId = report.residentId and task.encounterId = report.encounterId
              and task.requestType = :requestType
            where report.tenantId = :tenantId and report.organizationId = :organizationId
              and report.departmentId = :departmentId and report.reportType = :reportType
              and (:issuedFrom is null or report.issuedAt >= :issuedFrom)
              and (:issuedBefore is null or report.issuedAt < :issuedBefore)
              and (:status is null or report.status = :status)
              and (:keyword = '' or lower(report.reportCode) like :pattern escape '!'
                or lower(report.externalReportId) like :pattern escape '!'
                or lower(report.reportName) like :pattern escape '!'
                or lower(task.itemCodeSnapshot) like :pattern escape '!'
                or lower(task.itemNameSnapshot) like :pattern escape '!'
                or lower(task.specimenNo) like :pattern escape '!'
                or lower(task.requestNoSnapshot) like :pattern escape '!'
                or lower(task.residentNameSnapshot) like :pattern escape '!'
                or lower(task.healthRecordNoSnapshot) like :pattern escape '!')
            """)
    org.springframework.data.domain.Page<com.rhn.diagnostics.api.DiagnosticReportQueryRow> queryVersions(
            Long tenantId, Long organizationId, Long departmentId, String requestType, String reportType,
            String keyword, String pattern, String status, java.time.Instant issuedFrom,
            java.time.Instant issuedBefore, org.springframework.data.domain.Pageable pageable);

}
