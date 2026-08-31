package com.rhn.pharmacy.application;

import com.rhn.pharmacy.api.WardDeliveryDirectory;
import com.rhn.pharmacy.domain.WardDelivery;
import com.rhn.pharmacy.domain.WardDeliveryLine;
import com.rhn.pharmacy.infrastructure.WardDeliveryLineRepository;
import com.rhn.pharmacy.infrastructure.WardDeliveryRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class JpaWardDeliveryDirectory implements WardDeliveryDirectory {
    private static final Set<String> OPEN_STATUSES = Set.of(
            "PENDING_DISPATCH", "IN_TRANSIT", "DISCREPANCY");

    private final WardDeliveryRepository deliveries;
    private final WardDeliveryLineRepository lines;

    public JpaWardDeliveryDirectory(WardDeliveryRepository deliveries,
                                    WardDeliveryLineRepository lines) {
        this.deliveries = deliveries;
        this.lines = lines;
    }

    @Override
    @Transactional(readOnly = true)
    public WardDeliverySummary summarize(Long tenantId, Long organizationId,
                                         Collection<Long> encounterIds) {
        if (encounterIds == null || encounterIds.isEmpty()) return WardDeliverySummary.empty();
        Set<Long> encounterSet = Set.copyOf(encounterIds);
        List<WardDelivery> open = deliveries
                .findByTenantIdAndOrganizationIdAndStatusInOrderByCreatedAtDesc(
                        tenantId, organizationId, OPEN_STATUSES);
        if (open.isEmpty()) return WardDeliverySummary.empty();
        Map<Long, String> statusByDelivery = new HashMap<>();
        open.forEach(value -> statusByDelivery.put(value.id(), value.status()));
        Map<Long, MutableProgress> grouped = new LinkedHashMap<>();
        MutableProgress total = new MutableProgress();
        for (WardDeliveryLine line : lines.findByTenantIdAndDeliveryIdInOrderByDeliveryIdAscIdAsc(
                tenantId, statusByDelivery.keySet())) {
            if (!encounterSet.contains(line.encounterId())) continue;
            total.add(line.deliveryId(), statusByDelivery.get(line.deliveryId()));
            grouped.computeIfAbsent(line.encounterId(), ignored -> new MutableProgress())
                    .add(line.deliveryId(), statusByDelivery.get(line.deliveryId()));
        }
        Map<Long, WardDeliveryProgress> result = new LinkedHashMap<>();
        grouped.forEach((encounterId, value) -> result.put(encounterId, value.snapshot()));
        return new WardDeliverySummary(total.snapshot(), result);
    }

    @Override
    @Transactional(readOnly = true)
    public DeliveryGate deliveryGate(Long tenantId, Long dispenseId) {
        WardDeliveryLine line = lines.findByTenantIdAndDispenseId(tenantId, dispenseId).orElse(null);
        if (line == null) return DeliveryGate.notRequired();
        WardDelivery delivery = deliveries.findByIdAndTenantId(line.deliveryId(), tenantId).orElse(null);
        if (delivery == null) return new DeliveryGate(true, false, line.deliveryId(), "MISSING",
                line.receivedQuantity(), line.unitCode());
        boolean ready = "RECEIVED".equals(delivery.status()) || "RESOLVED".equals(delivery.status());
        return new DeliveryGate(true, ready, delivery.id(), delivery.status(),
                line.receivedQuantity(), line.unitCode());
    }

    private static final class MutableProgress {
        private final Set<Long> pendingDispatch = new java.util.HashSet<>();
        private final Set<Long> inTransit = new java.util.HashSet<>();
        private final Set<Long> discrepancy = new java.util.HashSet<>();

        void add(Long deliveryId, String status) {
            if ("PENDING_DISPATCH".equals(status)) pendingDispatch.add(deliveryId);
            else if ("IN_TRANSIT".equals(status)) inTransit.add(deliveryId);
            else if ("DISCREPANCY".equals(status)) discrepancy.add(deliveryId);
        }

        WardDeliveryProgress snapshot() {
            return new WardDeliveryProgress(pendingDispatch.size(), inTransit.size(), discrepancy.size());
        }
    }
}
