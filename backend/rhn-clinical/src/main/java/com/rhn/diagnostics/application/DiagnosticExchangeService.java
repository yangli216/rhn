package com.rhn.diagnostics.application;

import com.rhn.diagnostics.api.DiagnosticReportResponse;
import com.rhn.diagnostics.api.DiagnosticReportDirectory;
import com.rhn.diagnostics.domain.DiagnosticReport;
import com.rhn.diagnostics.domain.DiagnosticReportResult;
import com.rhn.diagnostics.domain.Observation;
import com.rhn.diagnostics.infrastructure.DiagnosticReportRepository;
import com.rhn.diagnostics.infrastructure.DiagnosticReportResultRepository;
import com.rhn.diagnostics.infrastructure.ObservationRepository;
import com.rhn.healthcore.api.EncounterCareSettingDirectory;
import com.rhn.outpatient.api.EncounterDirectory.EncounterSnapshot;
import com.rhn.outpatient.api.ServiceRequestDirectory;
import com.rhn.outpatient.api.ServiceRequestDirectory.ServiceRequestSnapshot;
import com.rhn.platform.eventing.api.DomainEventPublisher;
import com.rhn.platform.integration.api.ExternalMessageService;
import com.rhn.platform.integration.api.ExternalMessageService.ExternalMessageReceipt;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class DiagnosticExchangeService implements DiagnosticReportDirectory {
    private static final Set<String> DIAGNOSTIC_TYPES = Set.of("LABORATORY", "EXAMINATION");
    private static final Set<String> REPORT_STATUSES = Set.of("PRELIMINARY", "FINAL", "CORRECTED", "CANCELLED");
    private static final Set<String> VALUE_TYPES = Set.of("STRING", "NUMBER", "BOOLEAN", "CODE", "DATETIME");

    private final ServiceRequestDirectory requestDirectory;
    private final EncounterCareSettingDirectory encounterCareSettings;
    private final ExternalMessageService messageService;
    private final DiagnosticReportRepository reportRepository;
    private final ObservationRepository observationRepository;
    private final DiagnosticReportResultRepository resultRepository;
    private final CriticalValueAlertService criticalValueAlerts;
    private final DiagnosticExecutionService execution;
    private final DomainEventPublisher eventPublisher;
    private final ExecutionContextProvider contextProvider;
    private final JsonCodec jsonCodec;

    public DiagnosticExchangeService(ServiceRequestDirectory requestDirectory,
                                     EncounterCareSettingDirectory encounterCareSettings,
                                     ExternalMessageService messageService,
                                     DiagnosticReportRepository reportRepository,
                                     ObservationRepository observationRepository,
                                     DiagnosticReportResultRepository resultRepository,
                                     CriticalValueAlertService criticalValueAlerts,
                                     DiagnosticExecutionService execution,
                                     DomainEventPublisher eventPublisher,
                                     ExecutionContextProvider contextProvider, JsonCodec jsonCodec) {
        this.requestDirectory = requestDirectory;
        this.encounterCareSettings = encounterCareSettings;
        this.messageService = messageService; this.reportRepository = reportRepository;
        this.observationRepository = observationRepository; this.resultRepository = resultRepository;
        this.criticalValueAlerts = criticalValueAlerts;
        this.execution = execution;
        this.eventPublisher = eventPublisher; this.contextProvider = contextProvider; this.jsonCodec = jsonCodec;
    }

    @Transactional
    public ExternalMessageReceipt dispatch(Long requestId, String endpointCode) {
        var request = requestDirectory.requireForDiagnosticExchange(requestId);
        requireDiagnosticType(request.serviceType());
        execution.requireExchangeAllowed(requestId);
        if (!"ACTIVE".equals(request.status())) {
            throw conflict("DIAGNOSTIC_REQUEST_NOT_ACTIVE", "只有生效中的检查检验申请可以进入外部交换队列");
        }
        Map<String, Object> payload = requestPayload(request);
        ExternalMessageReceipt receipt = messageService.enqueueOutbound(new ExternalMessageService.OutboundMessage(
                cleanRequired(endpointCode, "INTEGRATION_ENDPOINT_REQUIRED", "接口端点编码不能为空"),
                "DIAGNOSTIC_REQUEST", request.requestNo() + "-R" + request.revision(),
                contextProvider.requireCurrent().correlationId(), request.performerOrganizationId(),
                request.performerDepartmentId(), payload, "ServiceRequest", request.id(), request.revision()));
        if (!receipt.duplicate()) publishRequestExchange(request, receipt);
        return receipt;
    }

    @Transactional
    public AcknowledgementReceipt acknowledge(AcknowledgementCommand input) {
        var request = requestDirectory.requireForDiagnosticExchange(input.requestNo());
        requireDiagnosticType(request.serviceType());
        ExternalMessageReceipt inbound = messageService.receiveInbound(new ExternalMessageService.InboundMessage(
                input.endpointCode(), "DIAGNOSTIC_REQUEST_ACK", input.businessMessageId(), input.correlationId(),
                request.performerOrganizationId(), request.performerDepartmentId(), input));
        if (inbound.duplicate() && inbound.relatedResourceId() != null) {
            ExternalMessageReceipt outbound = messageService.acknowledgeOutbound(input.endpointCode(),
                    input.outboundBusinessMessageId(), input.accepted(), input.errorCode(), input.errorMessage());
            return new AcknowledgementReceipt(inbound, outbound);
        }
        ExternalMessageReceipt outbound = messageService.acknowledgeOutbound(input.endpointCode(),
                input.outboundBusinessMessageId(), input.accepted(), input.errorCode(), input.errorMessage());
        if (!request.id().equals(outbound.relatedResourceId())) {
            throw conflict("DIAGNOSTIC_ACK_REQUEST_MISMATCH", "回执引用的外发消息不属于当前申请");
        }
        inbound = messageService.markProcessed(inbound.id(), "ServiceRequest", request.id(), request.revision());
        publish(request, input.accepted() ? "DIAGNOSTIC_REQUEST_ACKNOWLEDGED" : "DIAGNOSTIC_REQUEST_REJECTED",
                input.accepted() ? "检查检验申请已被外部系统接收" : "检查检验申请被外部系统拒绝",
                Map.of("endpointCode", input.endpointCode(), "messageId", inbound.id(),
                        "externalRequestId", nullToEmpty(input.externalRequestId())));
        return new AcknowledgementReceipt(inbound, outbound);
    }

    @Transactional
    public DiagnosticReportResponse ingestReport(ReportCommand input) {
        var request = requestDirectory.requireForDiagnosticExchange(input.requestNo());
        requireDiagnosticType(request.serviceType());
        validateReport(input, request.serviceType());
        ExternalMessageReceipt inbound = messageService.receiveInbound(new ExternalMessageService.InboundMessage(
                input.endpointCode(), "DIAGNOSTIC_REPORT", input.businessMessageId(), input.correlationId(),
                request.performerOrganizationId(), request.performerDepartmentId(), input));
        if (inbound.duplicate() && inbound.relatedResourceId() != null) {
            return response(reportRepository.findByIdAndTenantId(inbound.relatedResourceId(), request.tenantId())
                    .orElseThrow(() -> notFound("DIAGNOSTIC_REPORT_NOT_FOUND", "幂等消息关联的报告不存在")));
        }

        DiagnosticReport previous = reportRepository
                .findTopByTenantIdAndEndpointCodeAndExternalReportIdOrderByReportVersionDesc(
                        request.tenantId(), input.endpointCode(), input.externalReportId()).orElse(null);
        validateVersion(input, previous);
        ExecutionContext context = contextProvider.requireCurrent();
        DiagnosticReport report = reportRepository.save(new DiagnosticReport(request.tenantId(), request.residentId(),
                request.encounterId(), request.id(), request.performerOrganizationId(), request.performerDepartmentId(),
                input.endpointCode(), input.externalReportId(),
                input.reportVersion(), previous == null ? null : previous.id(), reportType(input.reportType()),
                input.status(), input.reportCode(), input.reportName(), input.issuedAt(), clean(input.conclusion()),
                clean(input.authorCode()), clean(input.authorName()), inbound.payloadDigest(), inbound.id(),
                context.subjectId()));
        int order = 0; List<Observation> savedObservations = new ArrayList<>();
        for (ObservationCommand item : safe(input.observations())) {
            validateObservation(item, input.status());
            Observation observation = observationRepository.save(new Observation(request.tenantId(),
                    request.residentId(), request.encounterId(),
                    request.performerOrganizationId(), request.performerDepartmentId(),
                    item.codeSystemUri(), clean(item.codeRelease()),
                    item.observationCode(), item.observationName(), observationStatus(input.status()),
                    item.valueType(), item.effectiveAt(), clean(item.valueString()), item.valueNumber(),
                    item.valueBoolean(), clean(item.valueCode()), item.valueDateTime(), clean(item.unitCode()),
                    item.referenceRangeLow(), item.referenceRangeHigh(), clean(item.interpretationCode()),
                    clean(item.performerCode()), clean(item.performerName())));
            resultRepository.save(new DiagnosticReportResult(request.tenantId(), report.id(), observation.id(), ++order));
            savedObservations.add(observation);
        }
        EncounterSnapshot encounter = clinicalEncounter(request);
        criticalValueAlerts.detect(report, previous, request, encounter, savedObservations);
        messageService.markProcessed(inbound.id(), "DiagnosticReport", report.id(), report.reportVersion());
        publish(request, "DIAGNOSTIC_REPORT_RECEIVED", report.status().equals("CORRECTED")
                        ? "收到检查检验更正报告" : "收到检查检验报告",
                Map.of("reportId", report.id(), "reportType", report.reportType(), "reportStatus", report.status(),
                        "reportName", report.reportName(), "reportVersion", report.reportVersion(),
                        "endpointCode", report.endpointCode(), "encounterId", request.encounterId(),
                        "receivedBy", context.subjectId()));
        return response(report);
    }

    @Transactional(readOnly = true)
    @Override
    public List<DiagnosticReportResponse> listByEncounter(Long encounterId) {
        ExecutionContext context = contextProvider.requireCurrent();
        var encounter = encounterCareSettings.require(context.tenantId(), encounterId);
        if (context.hasWorkContext() && (!context.canAccessOrganization(encounter.organizationId())
                || !context.canAccessDepartment(encounter.departmentId()))) {
            throw forbidden("ENCOUNTER_FORBIDDEN", "无权访问当前工作上下文之外的就诊");
        }
        return reportRepository.findByTenantIdAndEncounterIdOrderByIssuedAtDescReportVersionDesc(
                context.tenantId(), encounterId).stream().map(this::response).toList();
    }

    @Transactional(readOnly = true)
    public List<DiagnosticReportResponse> listByRequest(Long requestId) {
        var request = requestDirectory.requireForDiagnosticExchange(requestId);
        return reportRepository.findByTenantIdAndRequestIdOrderByReportVersionDesc(request.tenantId(), requestId)
                .stream().map(this::response).toList();
    }

    private DiagnosticReportResponse response(DiagnosticReport report) {
        List<DiagnosticReportResult> links = resultRepository
                .findByTenantIdAndReportIdOrderBySortOrder(report.tenantId(), report.id());
        Map<Long, Observation> observations = observationRepository.findAllById(links.stream()
                        .map(DiagnosticReportResult::observationId).toList()).stream()
                .collect(java.util.stream.Collectors.toMap(Observation::id, value -> value));
        List<DiagnosticReportResponse.ObservationView> result = links.stream().map(link -> {
                    Observation value = observations.get(link.observationId());
                    return new DiagnosticReportResponse.ObservationView(value.id(), link.sortOrder(),
                            value.codeSystemUri(), value.codeRelease(), value.observationCode(), value.observationName(),
                            value.status(), value.valueType(), value.effectiveAt(), value.valueString(), value.valueNumber(),
                            value.valueBoolean(), value.valueCode(), value.valueDateTime(), value.unitCode(),
                            value.referenceRangeLow(), value.referenceRangeHigh(), value.interpretationCode(),
                            value.performerCode(), value.performerName());
                }).toList();
        return new DiagnosticReportResponse(report.id(), report.residentId(), report.encounterId(), report.requestId(),
                report.endpointCode(), report.externalReportId(), report.reportVersion(), report.replacesReportId(),
                report.reportType(), report.status(), report.reportCode(), report.reportName(), report.issuedAt(),
                report.receivedAt(), report.conclusion(), report.authorCode(), report.authorName(),
                report.contentDigestAlgorithm(), report.contentDigest(), report.inboundMessageId(), result);
    }

    private EncounterSnapshot clinicalEncounter(ServiceRequestSnapshot request) {
        var encounter = encounterCareSettings.require(request.tenantId(), request.encounterId());
        if (!request.residentId().equals(encounter.residentId())
                || !request.performerOrganizationId().equals(encounter.organizationId())) {
            throw conflict("DIAGNOSTIC_REQUEST_ENCOUNTER_MISMATCH", "检查检验申请与就诊上下文不一致");
        }
        return new EncounterSnapshot(encounter.encounterId(), request.tenantId(), encounter.residentId(),
                encounter.organizationId(), encounter.departmentId(), null, null, encounter.status(), 0,
                null, null);
    }

    private Map<String, Object> requestPayload(ServiceRequestDirectory.ServiceRequestSnapshot request) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("requestId", request.id()); payload.put("requestNo", request.requestNo());
        payload.put("requestRevision", request.revision()); payload.put("residentId", request.residentId());
        payload.put("encounterId", request.encounterId()); payload.put("serviceType", request.serviceType());
        payload.put("itemCode", request.itemCode()); payload.put("itemName", request.itemName());
        payload.put("localCode", request.localCode()); payload.put("localName", request.localName());
        payload.put("specimenType", request.specimenType()); payload.put("examinationType", request.examinationType());
        payload.put("quantity", request.quantity()); payload.put("unitCode", request.unitCode());
        payload.put("examinationPurpose", request.examinationPurpose());
        payload.put("clinicalDescription", request.clinicalDescription()); payload.put("reason", request.reason());
        payload.put("performerOrganizationId", request.performerOrganizationId());
        payload.put("performerDepartmentId", request.performerDepartmentId());
        payload.put("authoredAt", request.authoredAt()); payload.put("authoredBy", request.authoredBy());
        payload.put("itemAttributeHash", request.itemAttributeHash());
        payload.put("itemAttributeSnapshot", jsonCodec.readTree(request.itemAttributeSnapshot()));
        payload.put("standardMappings", jsonCodec.readTree(request.standardMappingSnapshot()));
        return payload;
    }

    private void validateReport(ReportCommand input, String serviceType) {
        if (!REPORT_STATUSES.contains(input.status())) throw badRequest("DIAGNOSTIC_REPORT_STATUS_INVALID", "报告状态不受支持");
        String expected = reportType(serviceType);
        if (!expected.equals(reportType(input.reportType()))) {
            throw conflict("DIAGNOSTIC_REPORT_TYPE_MISMATCH", "报告类型与原检查检验申请不一致");
        }
        if (input.reportVersion() < 1) throw badRequest("DIAGNOSTIC_REPORT_VERSION_INVALID", "报告版本必须从 1 开始");
        if (!"CANCELLED".equals(input.status()) && "LABORATORY".equals(expected) && safe(input.observations()).isEmpty()) {
            throw badRequest("LABORATORY_RESULTS_REQUIRED", "检验报告至少需要一项结构化观察结果");
        }
        if (!"CANCELLED".equals(input.status()) && "IMAGING".equals(expected) && clean(input.conclusion()) == null) {
            throw badRequest("IMAGING_CONCLUSION_REQUIRED", "检查报告必须包含报告结论");
        }
    }

    private void validateVersion(ReportCommand input, DiagnosticReport previous) {
        if (previous == null && input.reportVersion() != 1) {
            throw conflict("DIAGNOSTIC_REPORT_VERSION_GAP", "首个报告版本必须为 1");
        }
        if (previous != null && input.reportVersion() != previous.reportVersion() + 1) {
            throw conflict("DIAGNOSTIC_REPORT_VERSION_GAP", "更正报告必须连续替代当前最新版本");
        }
        if (previous != null && "PRELIMINARY".equals(input.status())) {
            throw conflict("DIAGNOSTIC_REPORT_REVISION_STATUS_INVALID", "后续报告版本不能再次标记为初步报告");
        }
    }

    private void validateObservation(ObservationCommand item, String reportStatus) {
        if (!VALUE_TYPES.contains(item.valueType())) throw badRequest("OBSERVATION_VALUE_TYPE_INVALID", "观察结果值类型不受支持");
        int values = (clean(item.valueString()) == null ? 0 : 1) + (item.valueNumber() == null ? 0 : 1)
                + (item.valueBoolean() == null ? 0 : 1) + (clean(item.valueCode()) == null ? 0 : 1)
                + (item.valueDateTime() == null ? 0 : 1);
        if (values != 1 || ("STRING".equals(item.valueType()) && clean(item.valueString()) == null)
                || ("NUMBER".equals(item.valueType()) && item.valueNumber() == null)
                || ("BOOLEAN".equals(item.valueType()) && item.valueBoolean() == null)
                || ("CODE".equals(item.valueType()) && clean(item.valueCode()) == null)
                || ("DATETIME".equals(item.valueType()) && item.valueDateTime() == null)) {
            throw badRequest("OBSERVATION_VALUE_INVALID", "观察结果必须且只能提供与值类型对应的一个值");
        }
        if (item.referenceRangeLow() != null && item.referenceRangeHigh() != null
                && item.referenceRangeLow().compareTo(item.referenceRangeHigh()) > 0) {
            throw badRequest("OBSERVATION_REFERENCE_RANGE_INVALID", "参考范围下限不能大于上限");
        }
        if ("CANCELLED".equals(reportStatus)) throw badRequest("CANCELLED_REPORT_RESULTS_INVALID", "已取消报告不能包含观察结果");
    }

    private void requireDiagnosticType(String serviceType) {
        if (!DIAGNOSTIC_TYPES.contains(serviceType)) {
            throw badRequest("DIAGNOSTIC_SERVICE_TYPE_REQUIRED", "只有检查或检验项目支持 LIS/PACS 交换");
        }
    }

    private String reportType(String value) {
        return "EXAMINATION".equals(value) ? "IMAGING" : value;
    }

    private String observationStatus(String reportStatus) {
        return switch (reportStatus) {
            case "PRELIMINARY" -> "PRELIMINARY";
            case "CORRECTED" -> "CORRECTED";
            default -> "FINAL";
        };
    }

    private void publishRequestExchange(ServiceRequestDirectory.ServiceRequestSnapshot request,
                                        ExternalMessageReceipt receipt) {
        publish(request, "DIAGNOSTIC_REQUEST_QUEUED", "检查检验申请已进入外部交换队列",
                Map.of("endpointCode", receipt.endpointCode(), "messageId", receipt.id(),
                        "serviceType", request.serviceType(), "encounterId", request.encounterId()));
    }

    private void publish(ServiceRequestDirectory.ServiceRequestSnapshot request, String type,
                         String summary, Map<String, Object> details) {
        Map<String, Object> payload = new LinkedHashMap<>(details); payload.put("summary", summary);
        payload.put("requestNo", request.requestNo()); payload.putIfAbsent("encounterId", request.encounterId());
        eventPublisher.publish(request.tenantId(), request.performerOrganizationId(), type, 1,
                "ServiceRequest", request.id(), request.revision(), request.residentId(), Instant.now(), payload);
    }

    private String cleanRequired(String value, String code, String message) {
        String result = clean(value); if (result == null) throw badRequest(code, message); return result;
    }
    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private String nullToEmpty(String value) { return value == null ? "" : value; }
    private <T> List<T> safe(List<T> values) { return values == null ? List.of() : values; }

    public record AcknowledgementCommand(
            String endpointCode, String businessMessageId, String correlationId,
            String outboundBusinessMessageId, String requestNo, boolean accepted,
            String externalRequestId, String errorCode, String errorMessage) {}

    public record AcknowledgementReceipt(ExternalMessageReceipt inboundMessage,
                                         ExternalMessageReceipt outboundMessage) {}

    public record ReportCommand(
            String endpointCode, String businessMessageId, String correlationId, String requestNo,
            String externalReportId, int reportVersion, String reportType, String status,
            String reportCode, String reportName, Instant issuedAt, String conclusion,
            String authorCode, String authorName, List<ObservationCommand> observations) {}

    public record ObservationCommand(
            String codeSystemUri, String codeRelease, String observationCode, String observationName,
            String valueType, Instant effectiveAt, String valueString, BigDecimal valueNumber,
            Boolean valueBoolean, String valueCode, Instant valueDateTime, String unitCode,
            BigDecimal referenceRangeLow, BigDecimal referenceRangeHigh, String interpretationCode,
            String performerCode, String performerName) {}
}
