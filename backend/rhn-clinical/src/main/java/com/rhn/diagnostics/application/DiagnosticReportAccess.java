package com.rhn.diagnostics.application;

import com.rhn.diagnostics.domain.DiagnosticReport;
import com.rhn.diagnostics.infrastructure.DiagnosticReportRepository;
import com.rhn.healthcore.api.EncounterCareSettingDirectory;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;

import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

/** The ordering care team and the performing department may read their report's evidence. */
@Service
public class DiagnosticReportAccess {
    private final DiagnosticReportRepository reports;
    private final EncounterCareSettingDirectory encounters;
    private final ExecutionContextProvider contexts;

    public DiagnosticReportAccess(DiagnosticReportRepository reports, EncounterCareSettingDirectory encounters,
                                  ExecutionContextProvider contexts) {
        this.reports = reports; this.encounters = encounters; this.contexts = contexts;
    }

    public DiagnosticReport require(Long id) {
        var context = contexts.requireCurrent();
        var report = reports.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("DIAGNOSTIC_REPORT_NOT_FOUND", "未找到报告"));
        var encounter = encounters.require(context.tenantId(), report.encounterId());
        boolean clinicalAuthority = context.hasAuthority("OUTPATIENT_RECEPTION.ACCESS") || context.hasAuthority("INPATIENT.ACCESS") || context.hasAuthority("ROLE_ADMIN");
        boolean careTeam = clinicalAuthority && context.canAccessOrganization(encounter.organizationId()) && context.canAccessDepartment(encounter.departmentId());
        boolean performer = (context.hasAuthority("DIAGNOSTICS.ACCESS") || context.hasAuthority("ROLE_ADMIN"))
                && com.rhn.diagnostics.api.DiagnosticPermissions.canRead(context, "LABORATORY".equals(report.reportType()) ? "LABORATORY" : "EXAMINATION")
                && context.canAccessOrganization(report.organizationId())
                && context.canAccessDepartment(report.departmentId());
        if (!context.hasWorkContext() || !careTeam && !performer)
            throw forbidden("DIAGNOSTIC_REPORT_FORBIDDEN", "无权访问当前工作上下文之外的报告");
        return report;
    }
}
