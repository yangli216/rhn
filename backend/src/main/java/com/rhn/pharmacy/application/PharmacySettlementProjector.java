package com.rhn.pharmacy.application;

import com.rhn.outpatient.api.MedicationRequestDirectory;
import com.rhn.healthcore.api.EncounterCareSettingDirectory;
import com.rhn.pharmacy.api.PharmacyQueueChanged;
import com.rhn.pharmacy.domain.PharmacyFulfillmentAuthorization;
import com.rhn.pharmacy.infrastructure.DispenseTaskLineRepository;
import com.rhn.pharmacy.infrastructure.PharmacyFulfillmentAuthorizationRepository;
import com.rhn.platform.eventing.api.DomainEventEnvelope;
import com.rhn.platform.eventing.api.IdempotentDomainEventConsumer;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@Service
public class PharmacySettlementProjector {
    private static final String CONSUMER = "pharmacy-settlement-projection-v1";
    private final PharmacyFulfillmentAuthorizationRepository authorizations;
    private final DispenseTaskLineRepository taskLines;
    private final IdempotentDomainEventConsumer eventConsumer;
    private final ApplicationEventPublisher events;
    private final MedicationRequestDirectory medicationRequests;
    private final EncounterCareSettingDirectory encounterCareSettings;
    private final DispenseRouteApplicationService routing;

    public PharmacySettlementProjector(PharmacyFulfillmentAuthorizationRepository authorizations,
                                       DispenseTaskLineRepository taskLines,
                                       IdempotentDomainEventConsumer eventConsumer,
                                       ApplicationEventPublisher events,
                                       MedicationRequestDirectory requests,
                                       EncounterCareSettingDirectory encounterCareSettings,
                                       DispenseRouteApplicationService routing) {
        this.authorizations = authorizations; this.taskLines = taskLines;
        this.eventConsumer = eventConsumer; this.events = events;
        this.medicationRequests = requests; this.encounterCareSettings = encounterCareSettings;
        this.routing = routing;
    }

    @EventListener
    @Transactional
    public void project(DomainEventEnvelope event) {
        if (!List.of("BILLING_SETTLEMENT_FINALIZED", "BILLING_SETTLEMENT_REVERSED")
                .contains(event.eventType())) return;
        eventConsumer.consume(CONSUMER, event, () -> apply(event));
    }

    private void apply(DomainEventEnvelope event) {
        Long settlementId = longValue(event.payload().get("settlementId"));
        if (settlementId == null) return;
        if ("BILLING_SETTLEMENT_REVERSED".equals(event.eventType())) {
            for (PharmacyFulfillmentAuthorization value
                    : authorizations.findByTenantIdAndSettlementId(event.tenantId(), settlementId)) {
                boolean intakeExists = taskLines.existsByTenantIdAndRequestId(
                        event.tenantId(), value.medicationRequestId());
                value.revoke(intakeExists, event.occurredAt());
                changed(event, value.organizationId(), value.departmentId(), value.medicationRequestId(),
                        intakeExists ? "EXCEPTION" : "REVOKED");
            }
            return;
        }
        Object raw = event.payload().get("medicationRequests");
        if (!(raw instanceof List<?> requestValues)) return;
        for (Object item : requestValues) {
            if (!(item instanceof Map<?, ?> request)) continue;
            Long requestId = longValue(request.get("requestId"));
            Long organizationId = longValue(request.get("organizationId"));
            Long departmentId = longValue(request.get("departmentId"));
            if (requestId == null || organizationId == null) continue;
            PharmacyFulfillmentAuthorization existing = authorizations
                    .findByTenantIdAndMedicationRequestIdAndSettlementId(event.tenantId(), requestId, settlementId)
                    .orElse(null);
            if (existing != null) continue;
            PharmacyFulfillmentAuthorization value = authorizations.save(new PharmacyFulfillmentAuthorization(
                    event.tenantId(), organizationId, departmentId, requestId, settlementId, event.occurredAt()));
            var requestSnapshot = medicationRequests.requireForRouting(event.tenantId(), requestId);
            String careSetting = encounterCareSettings.require(event.tenantId(), requestSnapshot.encounterId())
                    .encounterClass();
            var resolved = routing.resolve(event.tenantId(), organizationId,
                    requestSnapshot.performerDepartmentId(), requestSnapshot.medicationType(),
                    careSetting, requestSnapshot.businessDate());
            resolved.ifPresent(route -> value.assignRoute(route.routeId(), route.routeRevision(),
                    route.stockSiteId(), event.occurredAt()));
            changed(event, organizationId, resolved
                    .map(DispenseRouteApplicationService.ResolvedRoute::departmentId).orElse(departmentId),
                    value.medicationRequestId(),
                    value.routedStockSiteId() == null ? "ROUTE_PENDING" : "READY_FOR_INTAKE");
        }
    }

    private void changed(DomainEventEnvelope source, Long organizationId, Long departmentId,
                         Long requestId, String changeType) {
        events.publishEvent(new PharmacyQueueChanged(source.eventId(), source.tenantId(), organizationId,
                departmentId, requestId, changeType, Instant.now()));
    }

    private Long longValue(Object value) {
        if (value instanceof Number number) return number.longValue();
        if (value instanceof String text && !text.isBlank()) return Long.valueOf(text);
        return null;
    }
}
