package com.rhn.diagnostics.web;

import com.rhn.diagnostics.api.DiagnosticReportResponse;
import com.rhn.diagnostics.application.DiagnosticExchangeService;
import com.rhn.diagnostics.application.DiagnosticExchangeService.AcknowledgementCommand;
import com.rhn.diagnostics.application.DiagnosticExchangeService.AcknowledgementReceipt;
import com.rhn.diagnostics.application.DiagnosticExchangeService.ObservationCommand;
import com.rhn.diagnostics.application.DiagnosticExchangeService.ReportCommand;
import com.rhn.platform.integration.api.ExternalMessageService;
import com.rhn.platform.integration.api.ExternalMessageService.ExternalMessageReceipt;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

@RestController
@RequestMapping("/api/integration/diagnostics")
public class DiagnosticExchangeController {
    private final DiagnosticExchangeService diagnostics;
    private final ExternalMessageService messages;

    public DiagnosticExchangeController(DiagnosticExchangeService diagnostics, ExternalMessageService messages) {
        this.diagnostics = diagnostics; this.messages = messages;
    }

    @PostMapping("/requests/{requestId}/outbound-messages")
    @ResponseStatus(HttpStatus.CREATED)
    ExternalMessageReceipt dispatch(@PathVariable Long requestId, @Valid @RequestBody DispatchRequest input) {
        return diagnostics.dispatch(requestId, input.endpointCode());
    }

    @GetMapping("/outbound-messages")
    List<ExternalMessageReceipt> outbound(@RequestParam String endpointCode,
                                          @RequestParam(required = false) String status) {
        return messages.listOutbound(endpointCode, status);
    }

    @PostMapping("/outbound-messages/{messageId}/delivery")
    ExternalMessageReceipt delivery(@PathVariable Long messageId, @Valid @RequestBody DeliveryRequest input) {
        return messages.markDelivery(messageId, input.delivered(), input.errorCode(), input.errorMessage());
    }

    @PostMapping("/inbound/acknowledgements")
    AcknowledgementReceipt acknowledge(@Valid @RequestBody AcknowledgementRequest input) {
        return diagnostics.acknowledge(input.toCommand());
    }

    @PostMapping("/inbound/reports")
    @ResponseStatus(HttpStatus.CREATED)
    DiagnosticReportResponse report(@Valid @RequestBody DiagnosticReportRequest input) {
        return diagnostics.ingestReport(input.toCommand());
    }

    record DispatchRequest(@NotBlank @Size(max = 64) String endpointCode) {}
    record DeliveryRequest(boolean delivered, @Size(max = 64) String errorCode,
                           @Size(max = 1000) String errorMessage) {}
    record AcknowledgementRequest(
            @NotBlank @Size(max = 64) String endpointCode,
            @NotBlank @Size(max = 128) String businessMessageId,
            @Size(max = 128) String correlationId,
            @NotBlank @Size(max = 128) String outboundBusinessMessageId,
            @NotBlank @Size(max = 64) String requestNo,
            boolean accepted, @Size(max = 128) String externalRequestId,
            @Size(max = 64) String errorCode, @Size(max = 1000) String errorMessage) {
        AcknowledgementCommand toCommand() { return new AcknowledgementCommand(endpointCode, businessMessageId,
                correlationId, outboundBusinessMessageId, requestNo, accepted, externalRequestId, errorCode, errorMessage); }
    }
    record DiagnosticReportRequest(
            @NotBlank @Size(max = 64) String endpointCode,
            @NotBlank @Size(max = 128) String businessMessageId,
            @Size(max = 128) String correlationId,
            @NotBlank @Size(max = 64) String requestNo,
            @NotBlank @Size(max = 128) String externalReportId,
            @Min(1) @Max(1000000) int reportVersion,
            @NotBlank @Size(max = 32) String reportType,
            @NotBlank @Size(max = 32) String status,
            @NotBlank @Size(max = 128) String reportCode,
            @NotBlank @Size(max = 300) String reportName,
            @NotNull Instant issuedAt,
            @Size(max = 20000) String conclusion,
            @Size(max = 64) String authorCode,
            @Size(max = 100) String authorName,
            @Size(max = 500) List<@Valid ObservationRequest> observations) {
        ReportCommand toCommand() { return new ReportCommand(endpointCode, businessMessageId, correlationId,
                requestNo, externalReportId, reportVersion, reportType, status, reportCode, reportName,
                issuedAt, conclusion, authorCode, authorName,
                observations == null ? List.of() : observations.stream().map(ObservationRequest::toCommand).toList()); }
    }
    record ObservationRequest(
            @NotBlank @Size(max = 300) String codeSystemUri,
            @Size(max = 64) String codeRelease,
            @NotBlank @Size(max = 128) String observationCode,
            @NotBlank @Size(max = 300) String observationName,
            @NotBlank @Size(max = 32) String valueType,
            @NotNull Instant effectiveAt,
            @Size(max = 1000) String valueString,
            BigDecimal valueNumber, Boolean valueBoolean,
            @Size(max = 128) String valueCode, Instant valueDateTime,
            @Size(max = 64) String unitCode,
            BigDecimal referenceRangeLow, BigDecimal referenceRangeHigh,
            @Size(max = 32) String interpretationCode,
            @Size(max = 64) String performerCode,
            @Size(max = 100) String performerName) {
        ObservationCommand toCommand() { return new ObservationCommand(codeSystemUri, codeRelease,
                observationCode, observationName, valueType, effectiveAt, valueString, valueNumber,
                valueBoolean, valueCode, valueDateTime, unitCode, referenceRangeLow, referenceRangeHigh,
                interpretationCode, performerCode, performerName); }
    }
}
