package com.rhn.diagnostics.application;

import com.rhn.diagnostics.api.DiagnosticPermissions;
import com.rhn.diagnostics.api.DiagnosticReportQueryRow;
import com.rhn.diagnostics.api.DiagnosticReportResponse;
import com.rhn.diagnostics.infrastructure.DiagnosticReportRepository;
import com.rhn.shared.api.PageResult;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;

@Service
@Transactional(readOnly = true)
public class DiagnosticReportQueryService {
    private final DiagnosticReportRepository reports;
    private final DiagnosticReportAccess access;
    private final DiagnosticExchangeService exchange;
    private final ExecutionContextProvider contexts;

    public DiagnosticReportQueryService(DiagnosticReportRepository reports, DiagnosticReportAccess access,
                                        DiagnosticExchangeService exchange, ExecutionContextProvider contexts) {
        this.reports = reports; this.access = access; this.exchange = exchange; this.contexts = contexts;
    }

    public PageResult<DiagnosticReportQueryRow> query(String requestType, String keyword, String status,
                                                    Instant issuedFrom, Instant issuedBefore, int page, int size) {
        var context = workContext();
        if (!Set.of("LABORATORY", "EXAMINATION").contains(requestType))
            throw conflict("DIAGNOSTIC_REQUEST_TYPE_REQUIRED", "请选择检验或检查类别");
        DiagnosticPermissions.requireRead(context, requestType);
        if (status != null && !Set.of("PRELIMINARY", "FINAL", "CORRECTED", "CANCELLED").contains(status))
            throw conflict("DIAGNOSTIC_REPORT_STATUS_INVALID", "报告状态不受支持");
        if (issuedFrom != null && issuedBefore != null && !issuedFrom.isBefore(issuedBefore))
            throw conflict("DIAGNOSTIC_REPORT_DATE_RANGE_INVALID", "签发开始日期必须早于结束边界");
        String term = keyword == null ? "" : keyword.trim().toLowerCase(java.util.Locale.ROOT);
        String pattern = "%" + term.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
        var result = reports.queryVersions(context.tenantId(), context.organizationId(), context.departmentId(),
                requestType, "EXAMINATION".equals(requestType) ? "IMAGING" : "LABORATORY", term, pattern, status,
                issuedFrom, issuedBefore, PageRequest.of(page, size, Sort.by("issuedAt", "id").descending()));
        return new PageResult<>(result.getContent(), result.getTotalElements(), result.getTotalPages(), page, size);
    }

    public List<DiagnosticReportResponse> history(Long reportId) {
        var context = workContext();
        var report = access.require(reportId);
        if (!context.organizationId().equals(report.organizationId()) || !context.departmentId().equals(report.departmentId()))
            throw forbidden("DIAGNOSTIC_REPORT_QUERY_FORBIDDEN", "只能查询当前机构和科室的医技报告");
        DiagnosticPermissions.requireRead(context, "LABORATORY".equals(report.reportType()) ? "LABORATORY" : "EXAMINATION");
        return reports.findByTenantIdAndRequestIdInOrderByReceivedAtDescIdDesc(context.tenantId(), List.of(report.requestId()))
                .stream().filter(item -> item.organizationId().equals(report.organizationId())
                        && item.departmentId().equals(report.departmentId()) && item.residentId().equals(report.residentId())
                        && item.encounterId().equals(report.encounterId()) && item.reportType().equals(report.reportType()))
                .map(item -> exchange.readReport(item.id())).toList();
    }

    private ExecutionContext workContext() {
        var context = contexts.requireCurrent();
        if (!context.hasWorkContext() || context.departmentId() == null) throw forbidden("DIAGNOSTIC_WORK_CONTEXT_REQUIRED", "请先选择机构和科室");
        return context;
    }
}
