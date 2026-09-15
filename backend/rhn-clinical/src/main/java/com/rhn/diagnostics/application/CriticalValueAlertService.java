package com.rhn.diagnostics.application;

import com.rhn.diagnostics.api.CriticalValueAlertChanged;
import com.rhn.diagnostics.api.CriticalValueAlertView;
import com.rhn.diagnostics.domain.CriticalValueAlert;
import com.rhn.diagnostics.domain.CriticalValueAlertEvent;
import com.rhn.diagnostics.domain.DiagnosticReport;
import com.rhn.diagnostics.domain.Observation;
import com.rhn.diagnostics.infrastructure.CriticalValueAlertEventRepository;
import com.rhn.diagnostics.infrastructure.CriticalValueAlertRepository;
import com.rhn.outpatient.api.EncounterDirectory.EncounterSnapshot;
import com.rhn.outpatient.api.ServiceRequestDirectory.ServiceRequestSnapshot;
import com.rhn.platform.eventing.api.DomainEventPublisher;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class CriticalValueAlertService {
    private static final Set<String> CRITICAL_FLAGS = Set.of("HH", "LL", "CRITICAL", "PANIC");
    private static final List<String> ACTIVE_STATUSES = List.of("OPEN", "ESCALATED", "ACKNOWLEDGED");
    private final CriticalValueAlertRepository alerts;
    private final CriticalValueAlertEventRepository history;
    private final ExecutionContextProvider contextProvider;
    private final DomainEventPublisher domainEvents;
    private final ApplicationEventPublisher applicationEvents;
    private final Duration acknowledgementWindow;

    public CriticalValueAlertService(CriticalValueAlertRepository alerts,
                                     CriticalValueAlertEventRepository history,
                                     ExecutionContextProvider contextProvider,
                                     DomainEventPublisher domainEvents,
                                     ApplicationEventPublisher applicationEvents,
                                     @Value("${rhn.diagnostics.critical-value.acknowledgement-window:PT15M}")
                                     Duration acknowledgementWindow) {
        this.alerts = alerts; this.history = history; this.contextProvider = contextProvider;
        this.domainEvents = domainEvents; this.applicationEvents = applicationEvents;
        this.acknowledgementWindow = acknowledgementWindow;
    }

    @Transactional
    public List<CriticalValueAlert> detect(DiagnosticReport report, DiagnosticReport previous,
                                           ServiceRequestSnapshot request, EncounterSnapshot encounter,
                                           List<Observation> observations) {
        Instant now = Instant.now();
        if (previous != null) supersedePrevious(previous, report, now);
        if ("CANCELLED".equals(report.status())) return List.of();
        return observations.stream().filter(this::isCritical).map(observation -> {
            CriticalValueAlert existing = alerts.findByTenantIdAndReportIdAndObservationId(
                    report.tenantId(), report.id(), observation.id()).orElse(null);
            if (existing != null) return existing;
            String flag = observation.interpretationCode().trim().toUpperCase(Locale.ROOT);
            CriticalValueAlert value = alerts.save(new CriticalValueAlert(report.tenantId(),
                    encounter.organizationId(), encounter.departmentId(), report.id(), observation.id(),
                    report.residentId(), report.encounterId(), report.requestId(), request.authoredBy(),
                    "CRITICAL", "LIS_INTERPRETATION_" + flag, 1, observation.observationCode(),
                    observation.observationName(), evidence(observation), now, now.plus(acknowledgementWindow)));
            history.save(new CriticalValueAlertEvent(value.tenantId(), value.id(), "DETECT", null, value.status(),
                    null, value.triggerEvidence(), contextProvider.requireCurrent().correlationId(), now));
            publish(value, "DIAGNOSTIC_CRITICAL_VALUE_OPENED", now);
            return value;
        }).toList();
    }

    @Transactional(readOnly = true)
    public List<CriticalValueAlertView> active() {
        ExecutionContext context = requireWorkContext();
        return alerts.findByTenantIdAndOrganizationIdAndStatusInOrderByDetectedAtDesc(
                        context.tenantId(), context.organizationId(), ACTIVE_STATUSES).stream()
                .filter(value -> canAccess(context, value)).map(this::view).toList();
    }

    @Transactional
    public CriticalValueAlertView acknowledge(Long alertId, long expectedRevision, String note) {
        ExecutionContext context = requireWorkContext();
        CriticalValueAlert value = requireLocked(context, alertId);
        if (!canAccess(context, value)) throw forbidden("CRITICAL_VALUE_FORBIDDEN", "当前账号不能确认该危急值");
        requireRevision(value, expectedRevision);
        String previous = value.status(); Instant now = Instant.now();
        try { value.acknowledge(context.subjectId(), clean(note), now); }
        catch (IllegalStateException error) { throw conflict("CRITICAL_VALUE_ACKNOWLEDGE_INVALID", error.getMessage()); }
        history.save(new CriticalValueAlertEvent(context.tenantId(), value.id(), "ACKNOWLEDGE", previous,
                value.status(), context.subjectId(), clean(note), context.correlationId(), now));
        publish(value, "DIAGNOSTIC_CRITICAL_VALUE_ACKNOWLEDGED", now);
        return view(value);
    }

    @Transactional
    public CriticalValueAlertView close(Long alertId, long expectedRevision, String dispositionCode, String note) {
        ExecutionContext context = requireWorkContext();
        CriticalValueAlert value = requireLocked(context, alertId);
        if (!canAccess(context, value)) throw forbidden("CRITICAL_VALUE_FORBIDDEN", "当前账号不能关闭该危急值");
        requireRevision(value, expectedRevision);
        String previous = value.status(); Instant now = Instant.now();
        try { value.close(context.subjectId(), required(dispositionCode), clean(note), now); }
        catch (IllegalStateException error) { throw conflict("CRITICAL_VALUE_CLOSE_INVALID", error.getMessage()); }
        history.save(new CriticalValueAlertEvent(context.tenantId(), value.id(), "CLOSE", previous,
                value.status(), context.subjectId(), clean(note), context.correlationId(), now));
        publish(value, "DIAGNOSTIC_CRITICAL_VALUE_CLOSED", now);
        return view(value);
    }

    @Scheduled(fixedDelayString = "${rhn.diagnostics.critical-value.escalation-interval-ms:60000}")
    @Transactional
    public void escalateOverdue() {
        Instant now = Instant.now();
        for (CriticalValueAlert value : alerts
                .findTop100ByStatusInAndAcknowledgeDeadlineAtBeforeOrderByAcknowledgeDeadlineAtAsc(
                        List.of("OPEN"), now)) {
            String previous = value.status(); value.escalate(now);
            history.save(new CriticalValueAlertEvent(value.tenantId(), value.id(), "ESCALATE", previous,
                    value.status(), null, "危急值超过确认时限", "critical-value-escalation", now));
            applicationEvents.publishEvent(new CriticalValueAlertChanged(value.id(), value.tenantId(),
                    value.organizationId(), value.departmentId(), value.recipientUserId(), value.id(),
                    value.encounterId(), "DIAGNOSTIC_CRITICAL_VALUE_ESCALATED", now));
        }
    }

    private void supersedePrevious(DiagnosticReport previous, DiagnosticReport replacement, Instant now) {
        for (CriticalValueAlert value : alerts.findByTenantIdAndReportId(previous.tenantId(), previous.id())) {
            String before = value.status(); value.supersede(replacement.id(), now);
            if (before.equals(value.status())) continue;
            history.save(new CriticalValueAlertEvent(value.tenantId(), value.id(), "SUPERSEDE", before,
                    value.status(), null, "报告被新版本替代", contextProvider.requireCurrent().correlationId(), now));
            publish(value, "DIAGNOSTIC_CRITICAL_VALUE_SUPERSEDED", now);
        }
    }

    private void publish(CriticalValueAlert value, String eventType, Instant occurredAt) {
        domainEvents.publish(value.tenantId(), value.organizationId(), eventType, 1, "CriticalValueAlert",
                value.id(), value.revision() + 1, value.residentId(), occurredAt, Map.of(
                        "alertId", value.id(), "encounterId", value.encounterId(),
                        "departmentId", value.departmentId(), "recipientUserId", value.recipientUserId(),
                        "status", value.status(), "severity", value.severity()));
    }

    private boolean isCritical(Observation value) {
        return value.interpretationCode() != null
                && CRITICAL_FLAGS.contains(value.interpretationCode().trim().toUpperCase(Locale.ROOT));
    }

    private String evidence(Observation value) {
        String result = switch (value.valueType()) {
            case "NUMBER" -> value.valueNumber() + (value.unitCode() == null ? "" : " " + value.unitCode());
            case "STRING" -> value.valueString();
            case "CODE" -> value.valueCode();
            case "BOOLEAN" -> String.valueOf(value.valueBoolean());
            case "DATETIME" -> String.valueOf(value.valueDateTime());
            default -> "";
        };
        return value.observationName() + "=" + result + "，标记=" + value.interpretationCode();
    }

    private CriticalValueAlert requireLocked(ExecutionContext context, Long alertId) {
        return alerts.lockByIdAndTenantId(alertId, context.tenantId())
                .orElseThrow(() -> notFound("CRITICAL_VALUE_NOT_FOUND", "未找到危急值告警"));
    }

    private boolean canAccess(ExecutionContext context, CriticalValueAlert value) {
        if (value.recipientUserId().equals(context.subjectId())) return true;
        return (context.hasAuthority("DIAGNOSTIC.CRITICAL.READ")
                || context.hasAuthority("OUTPATIENT_RECEPTION.ACCESS")
                || context.hasAuthority("INPATIENT.ACCESS") || context.hasAuthority("ROLE_ADMIN"))
                && context.canAccessOrganization(value.organizationId())
                && context.canAccessDepartment(value.departmentId());
    }

    private void requireRevision(CriticalValueAlert value, long expected) {
        if (value.revision() != expected) throw conflict("CRITICAL_VALUE_REVISION_CONFLICT", "危急值已被其他终端更新，请刷新后重试");
    }

    private ExecutionContext requireWorkContext() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext()) throw forbidden("WORK_CONTEXT_REQUIRED", "危急值处理要求选择工作上下文");
        return context;
    }

    private CriticalValueAlertView view(CriticalValueAlert value) {
        return new CriticalValueAlertView(value.id(), value.revision(), value.reportId(), value.observationId(),
                value.residentId(), value.encounterId(), value.requestId(), value.organizationId(),
                value.departmentId(), value.recipientUserId(), value.severity(), value.observationCode(),
                value.observationName(), value.triggerEvidence(), value.status(), value.detectedAt(),
                value.acknowledgeDeadlineAt(), value.acknowledgedBy(), value.acknowledgedAt(),
                value.acknowledgeNote(), value.closedBy(), value.closedAt(), value.dispositionCode(),
                value.closeNote(), value.supersededByReportId(), value.escalationLevel());
    }

    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private String required(String value) {
        String result = clean(value);
        if (result == null) throw conflict("CRITICAL_VALUE_DISPOSITION_REQUIRED", "关闭危急值必须填写处置结果编码");
        return result;
    }
}
