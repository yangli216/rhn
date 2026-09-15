package com.rhn.diagnostics.application;

import com.rhn.diagnostics.api.DiagnosticReportResponse;
import com.rhn.diagnostics.application.DiagnosticExchangeService.ObservationCommand;
import com.rhn.diagnostics.application.DiagnosticExchangeService.ReportCommand;
import com.rhn.diagnostics.domain.DiagnosticExecutionTask;
import com.rhn.diagnostics.domain.DiagnosticReport;
import com.rhn.diagnostics.infrastructure.DiagnosticReportRepository;
import com.rhn.outpatient.api.ServiceRequestDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import static com.rhn.shared.api.BusinessErrors.badRequest;

@Service
public class DiagnosticWorkspaceService {
    private static final String LOCAL_ENDPOINT = "RHN-LOCAL";
    private final DiagnosticExecutionService execution;
    private final DiagnosticExchangeService exchange;
    private final DiagnosticReportRepository reports;
    private final ServiceRequestDirectory requests;
    private final ExecutionContextProvider contextProvider;

    public DiagnosticWorkspaceService(DiagnosticExecutionService execution, DiagnosticExchangeService exchange,
                                      DiagnosticReportRepository reports, ServiceRequestDirectory requests,
                                      ExecutionContextProvider contextProvider) {
        this.execution = execution; this.exchange = exchange; this.reports = reports;
        this.requests = requests; this.contextProvider = contextProvider;
    }

    @Transactional
    public DiagnosticReportResponse recordLocalReport(Long taskId, LocalReportCommand input) {
        DiagnosticExecutionTask task = execution.requireReportable(taskId, input.expectedRevision());
        var request = requests.requireForDiagnosticExchange(task.requestId());
        String externalId = "LOCAL-" + request.requestNo();
        DiagnosticReport previous = reports
                .findTopByTenantIdAndEndpointCodeAndExternalReportIdOrderByReportVersionDesc(
                        request.tenantId(), LOCAL_ENDPOINT, externalId).orElse(null);
        int version = previous == null ? 1 : previous.reportVersion() + 1;
        String status = previous == null ? "FINAL" : "CORRECTED";
        ExecutionContext context = contextProvider.requireCurrent();
        List<ObservationCommand> observations = "LABORATORY".equals(request.serviceType())
                ? List.of(observation(request, input, context)) : List.of();
        return exchange.ingestReport(new ReportCommand(LOCAL_ENDPOINT,
                "LOCAL-RPT-" + task.id() + "-V" + version, context.correlationId(), request.requestNo(),
                externalId, version, "EXAMINATION".equals(request.serviceType()) ? "IMAGING" : "LABORATORY",
                status, request.itemCode(), request.itemName() + "报告", Instant.now(), clean(input.conclusion()),
                context.actor(), context.actor(), observations));
    }

    private ObservationCommand observation(ServiceRequestDirectory.ServiceRequestSnapshot request,
                                           LocalReportCommand input, ExecutionContext context) {
        String value = clean(input.observationValue());
        if (value == null) throw badRequest("LABORATORY_RESULT_VALUE_REQUIRED", "检验结果值不能为空");
        String valueType = clean(input.valueType());
        if (valueType == null) valueType = "STRING";
        BigDecimal number = null; String text = null;
        if ("NUMBER".equals(valueType)) {
            try { number = new BigDecimal(value); }
            catch (NumberFormatException error) { throw badRequest("LABORATORY_RESULT_NUMBER_INVALID", "数值型检验结果格式不正确"); }
        } else if ("STRING".equals(valueType)) text = value;
        else throw badRequest("LABORATORY_RESULT_TYPE_INVALID", "基层工作台仅支持数值或文本检验结果");
        return new ObservationCommand("urn:rhn:local:diagnostics", null, request.itemCode(), request.itemName(),
                valueType, Instant.now(), text, number, null, null, null, clean(input.unitCode()),
                input.referenceRangeLow(), input.referenceRangeHigh(), clean(input.interpretationCode()),
                context.actor(), context.actor());
    }

    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }

    public record LocalReportCommand(long expectedRevision, String valueType, String observationValue,
                                     String unitCode, BigDecimal referenceRangeLow, BigDecimal referenceRangeHigh,
                                     String interpretationCode, String conclusion) {}
}

